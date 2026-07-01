// lib/utils.js - Full fix

import fs from "fs";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";
import clc from "cli-color";
import P from "pino";
import { writeFile, mkdir } from "fs/promises";
import { downloadMediaMessage } from "baileys";
import { numberAllowed } from "../config.js";
import { extractGroupLinks, addGroupLinks } from "./grupLinkStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loggedNumbers = new Set();
let commandHandlers = null;

export function initializeGlobals() {
  if (!global.chatCounter) {
    global.chatCounter = {};
  }
  if (global.autojpmRunning === undefined) {
    global.autojpmRunning = false;
  }
  if (!global.autoreplyInterval) {
    global.autoreplyInterval = null;
  }
}

export async function downloadAndSaveMedia(sock, message, filename) {
  try {
    const tmpDir = path.join(__dirname, "..", "tmp");
    const filePath = path.join(tmpDir, filename);

    if (!fs.existsSync(tmpDir)) {
      await mkdir(tmpDir, { recursive: true });
    }

    const buffer = await downloadMediaMessage(
      message,
      "buffer",
      {},
      {
        logger: P({ level: "silent" }),
        reuploadRequest: sock.updateMediaMessage,
      }
    );

    await writeFile(filePath, buffer);
    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
}

export function isImageMessage(messageEvent) {
  if (messageEvent.messages && messageEvent.messages.length > 0) {
    const message = messageEvent.messages[0].message;
    return !!(message && message.imageMessage);
  }
  return false;
}

export function deleteFolderRecursive(basePath, folderName) {
  const folderPath = path.join(basePath, folderName);
  if (fs.existsSync(folderPath)) {
    fs.readdirSync(folderPath).forEach((file) => {
      const curPath = path.join(folderPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(folderPath, file);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(folderPath);
  }
}

export function ChangeStatus(basePath, status) {
  const filePath = path.join(basePath, "status.txt");
  fs.writeFileSync(filePath, status, "utf8");
}

export function getStatus(basePath) {
  const filePath = path.join(basePath, "status.txt");
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf8");
  }
  return null;
}

export function logWithTime(message, color = "green") {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const timestamp = `[${hours}:${minutes}]`;

  let coloredMessage;
  switch (color.toLowerCase()) {
    case "red": coloredMessage = clc.red(`${timestamp} ${message}`); break;
    case "yellow": coloredMessage = clc.yellow(`${timestamp} ${message}`); break;
    case "blue": coloredMessage = clc.blue(`${timestamp} ${message}`); break;
    case "green": default: coloredMessage = clc.green(`${timestamp} ${message}`); break;
  }

  console.log(coloredMessage);
}

export function displayTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function extractNumber(raw) {
  return raw?.split("@")[0].replace(/\D/g, "") || "unknown";
}

export function isAllowed(senderNumber, fromMe) {
  const numericSender = extractNumber(senderNumber);
  if (!numberAllowed.includes(numericSender) && !fromMe) {
    if (!loggedNumbers.has(numericSender)) {
      console.log(clc.red(`[${displayTime()}] ❌ Nomor ${senderNumber} tidak diizinkan`));
      loggedNumbers.add(numericSender);
    }
    return false;
  }
  return true;
}

async function loadCommands() {
  const commands = {};
  const pluginDir = path.join(__dirname, "..", "plugins");
  
  if (!fs.existsSync(pluginDir)) {
    console.log(clc.red(`❌ Plugin folder not found: ${pluginDir}`));
    return commands;
  }
  
  const files = fs.readdirSync(pluginDir);
  for (const file of files) {
    if (file.endsWith(".js")) {
      const commandName = path.basename(file, ".js");
      const commandPath = path.join(pluginDir, file);
      try {
        const module = await import(pathToFileURL(commandPath).href);
        commands[commandName] = module.default || module;
      } catch (err) {
        console.log(clc.red(`❌ Failed to load plugin ${file}: ${err.message}`));
      }
    }
  }
  return commands;
}

// ✅ FIX: Use IIFE to avoid top-level await warning
(async function initCommands() {
  commandHandlers = await loadCommands();
})();

export async function handleCommand(
  sock,
  sender,
  command,
  key,
  senderNumber,
  messageEvent,
  fromMe
) {
  // Track sender for autoreply
  if (!global.chatCounter[sender]) {
    global.chatCounter[sender] = { total: 0 };
  }
  global.chatCounter[sender].total += 1;

  // Extract group links
  const links = extractGroupLinks(command);
  if (links.length > 0) {
    addGroupLinks(links);
  }

  let firstWord = command.split(" ")[0];
  while (global.prefix?.includes(firstWord.charAt(0))) {
    firstWord = firstWord.substring(1);
  }

  const handler = commandHandlers?.[firstWord];
  if (handler) {
    console.log(`[${clc.yellow(displayTime())}] ${clc.yellow(senderNumber)} : ${clc.green(firstWord)}`);
    
    if (!isAllowed(senderNumber, fromMe)) return false;
    await handler(sock, sender, command, key, messageEvent);
  }
}

export function readWhitelist() {
  try {
    const dirPath = path.join(process.cwd(), "ADDTIONAL");
    const whitelistPath = path.join(dirPath, "whitelist.json");

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    if (!fs.existsSync(whitelistPath)) {
      fs.writeFileSync(whitelistPath, "[]", "utf8");
    }

    const rawData = fs.readFileSync(whitelistPath, "utf8");
    const whitelist = JSON.parse(rawData);
    return Array.isArray(whitelist) ? whitelist : [];
  } catch (error) {
    console.error("❌ Gagal membaca whitelist:", error);
    return [];
  }
}