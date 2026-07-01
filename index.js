import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "baileys";
import { Boom } from "@hapi/boom";
import P from "pino";
import qrcode from "qrcode-terminal";
import readline from "readline";
import clc from "cli-color";

import {
  deleteFolderRecursive,
  ChangeStatus,
  getStatus,
  handleCommand,
  displayTime,
  logWithTime,
  initializeGlobals
} from "./lib/utils.js";

import resumeAutoJPM from "./lib/resumeAutoJPM.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const basePath = __dirname;
const status = getStatus(`${basePath}/sessions/`);

// Initialize global objects
initializeGlobals();

async function connectToWhatsApp(number = null) {
  try {
    const { state, saveCreds } = await useMultiFileAuthState("sessions");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      connectTimeoutMs: 6000,
      logger: P({ level: "silent" }),
      browser: ["Ubuntu", "Chrome", "120.0.0.0"],
    });

    sock.ev.on("connection.update", (update) =>
      handleConnectionUpdate(sock, update, number)
    );
    sock.ev.on("messages.upsert", (message) =>
      handleIncomingMessages(sock, message)
    );
    sock.ev.on("creds.update", saveCreds);
  } catch (error) {
    logWithTime("Failed to connect to WhatsApp", "red");
    setTimeout(() => connectToWhatsApp(), 5000);
  }
}

async function handleConnectionUpdate(sock, update, number) {
  const { connection, lastDisconnect, qr } = update;
  
  if (qr) {
    qrcode.generate(qr, { small: true });
    console.log(clc.green.bold("📱 Scan QR code di atas dengan WhatsApp"));
  }

  if (connection === "close") {
    const shouldReconnect =
      lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
    logWithTime("Connection Closed", "red");
    ChangeStatus(`${basePath}/sessions/`, "closed");
    
    if (shouldReconnect) {
      logWithTime("Reconnecting in 5 seconds...", "yellow");
      setTimeout(() => connectToWhatsApp(), 5000);
    }
  } else if (connection === "open") {
    logWithTime("✅ Connection Success", "green");
    ChangeStatus(`${basePath}/sessions/`, "connected");
    resumeAutoJPM(sock);
  }
}

async function handleIncomingMessages(sock, messageEvent) {
  try {
    const message = messageEvent.messages?.[0];
    if (!message) return;
    
    const type = messageEvent?.type ?? false;
    if (type === "append") return;

    const isGroup = Boolean(message.key?.participant);
    const sender = message.key?.remoteJid || message.key?.remoteJidAlt;
    const key = message?.key;

    const textMessage =
      message.message?.extendedTextMessage?.text ||
      message.message?.conversation ||
      message.message?.imageMessage?.caption ||
      "";

    if (textMessage) {
      const senderNumber = isGroup 
        ? (message.key?.participant || sender)?.split("@")[0] || "unknown"
        : sender?.split("@")[0] || "unknown";
        
      const fromMe = message.key?.fromMe ?? false;

      await handleCommand(
        sock,
        sender,
        textMessage.trim(),
        key,
        senderNumber,
        messageEvent,
        fromMe
      );
    }
  } catch (error) {
    console.log(clc.yellow(`[${displayTime()}] Failed to handle message`));
  }
}

let pairingMethod = "qr";

if (status === "connected") {
  logWithTime("Connecting ...", "green");
  connectToWhatsApp();
} else {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(clc.yellow.bold("📱 Pilih metode koneksi (qr/pairing):"));
  
  rl.question("", (method) => {
    method = method.toLowerCase().trim();
    if (method === "qr" || method === "pairing") {
      pairingMethod = method;
      
      if (method === "pairing") {
        console.log(clc.yellow.bold("📱 Masukkan nomor telepon (contoh: 6281234567890):"));
        rl.question("", (number) => {
          deleteFolderRecursive(basePath, "sessions");
          connectToWhatsApp(number.trim());
          rl.close();
        });
      } else {
        deleteFolderRecursive(basePath, "sessions");
        connectToWhatsApp();
        rl.close();
      }
    } else {
      logWithTime('❌ Metode tidak valid. Pilih "qr" atau "pairing".', "red");
      rl.close();
      process.exit(1);
    }
  });
}