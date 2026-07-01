import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "baileys";
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

initializeGlobals();

let sock = null;
let pairingCodeSent = false;

async function connectToWhatsApp(method = "qr", phoneNumber = null) {
  try {
    const { state, saveCreds } = await useMultiFileAuthState("sessions");
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      connectTimeoutMs: 60000,
      logger: P({ level: "silent" }),
      browser: ["Ubuntu", "Chrome", "120.0.0.0"],
      markOnlineOnConnect: false,
      // ✅ Important: Keep connection alive
      keepAliveIntervalMs: 10000,
    });

    // ✅ Handle pairing request AFTER socket is ready
    if (method === "pairing" && phoneNumber && !pairingCodeSent) {
      // Wait a bit for socket to initialize
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      try {
        console.log(clc.yellow("📱 Meminta kode pairing..."));
        const code = await sock.requestPairingCode(phoneNumber);
        const formattedCode = code.slice(0, 4) + "-" + code.slice(4);
        console.log(clc.green.bold(`\n✅ KODE PAIRING: ${formattedCode}\n`));
        console.log(clc.yellow("📱 Buka WhatsApp > Perangkat Tertaut > Tautkan Perangkat"));
        console.log(clc.yellow(`📱 Masukkan kode: ${formattedCode}\n`));
        pairingCodeSent = true;
      } catch (err) {
        console.log(clc.red(`❌ Gagal mendapatkan kode: ${err.message}`));
        // Try one more time after a delay
        console.log(clc.yellow("🔄 Mencoba lagi dalam 3 detik..."));
        await new Promise(resolve => setTimeout(resolve, 3000));
        try {
          const code = await sock.requestPairingCode(phoneNumber);
          const formattedCode = code.slice(0, 4) + "-" + code.slice(4);
          console.log(clc.green.bold(`\n✅ KODE PAIRING: ${formattedCode}\n`));
          pairingCodeSent = true;
        } catch (retryErr) {
          console.log(clc.red(`❌ Gagal lagi: ${retryErr.message}`));
          console.log(clc.yellow("💡 Coba gunakan metode QR"));
        }
      }
    }

    sock.ev.on("connection.update", (update) =>
      handleConnectionUpdate(sock, update, method)
    );
    sock.ev.on("messages.upsert", (message) =>
      handleIncomingMessages(sock, message)
    );
    sock.ev.on("creds.update", saveCreds);

    return sock;
  } catch (error) {
    logWithTime("Failed to connect to WhatsApp", "red");
    setTimeout(() => connectToWhatsApp(method, phoneNumber), 5000);
  }
}

async function handleConnectionUpdate(sock, update, method) {
  const { connection, lastDisconnect, qr } = update;

  if (qr && method === "qr") {
    console.log(clc.green.bold("\n📱 SCAN QR CODE DENGAN WHATSAPP\n"));
    qrcode.generate(qr, { small: true });
    console.log(clc.yellow("\n📱 Buka WhatsApp > Perangkat Tertaut > Tautkan Perangkat"));
    console.log(clc.yellow("📱 Scan QR code di atas\n"));
    return;
  }

  if (connection === "close") {
    const shouldReconnect =
      lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
    logWithTime("Connection Closed", "red");
    ChangeStatus(`${basePath}/sessions/`, "closed");

    // ✅ Don't auto-reconnect if pairing failed
    if (shouldReconnect && method !== "pairing") {
      logWithTime("Reconnecting in 5 seconds...", "yellow");
      setTimeout(() => connectToWhatsApp(method), 5000);
    } else if (method === "pairing" && !pairingCodeSent) {
      console.log(clc.yellow("🔄 Mencoba pairing ulang..."));
      setTimeout(() => connectToWhatsApp(method, phoneNumber), 3000);
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

// ============ MAIN STARTUP ============

if (status === "connected") {
  logWithTime("Connecting ...", "green");
  connectToWhatsApp("qr");
} else {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(clc.cyan.bold("\n╔═══════════════════════════════════════╗"));
  console.log(clc.cyan.bold("║     📱 WHATSAPP BOT CONNECTION       ║"));
  console.log(clc.cyan.bold("╚═══════════════════════════════════════╝\n"));

  console.log(clc.yellow("Pilih metode koneksi:"));
  console.log("  [1] QR Code (scan dengan WhatsApp)");
  console.log("  [2] Pairing Code (masukkan nomor HP)\n");

  rl.question(clc.green("Pilihan (1/2): "), (choice) => {
    choice = choice.trim();

    if (choice === "2") {
      console.log(clc.yellow("\n📱 Masukkan nomor telepon:"));
      console.log(clc.yellow("   Contoh: 6281234567890\n"));
      
      rl.question(clc.green("Nomor: "), (number) => {
        const cleanNumber = number.trim().replace(/[^0-9]/g, "");
        
        if (cleanNumber.length < 10) {
          console.log(clc.red("❌ Nomor tidak valid. Minimal 10 digit."));
          rl.close();
          process.exit(1);
        }

        console.log(clc.yellow(`\n📱 Menghubungkan dengan nomor: ${cleanNumber}`));
        deleteFolderRecursive(basePath, "sessions");
        connectToWhatsApp("pairing", cleanNumber);
        rl.close();
      });
    } else {
      console.log(clc.yellow("\n📱 Menyiapkan QR code...\n"));
      deleteFolderRecursive(basePath, "sessions");
      connectToWhatsApp("qr");
      rl.close();
    }
  });
}