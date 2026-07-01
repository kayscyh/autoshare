import makeWASocket, { useMultiFileAuthState } from "baileys";
import P from "pino";

const phoneNumber = process.argv[2] || "6281234567890";

console.log(`📱 Testing pairing for: ${phoneNumber}`);

const { state } = await useMultiFileAuthState("sessions");
const sock = makeWASocket({
  auth: state,
  printQRInTerminal: false,
  logger: P({ level: "silent" }),
  browser: ["Ubuntu", "Chrome", "120.0.0.0"],
});

try {
  const code = await sock.requestPairingCode(phoneNumber);
  console.log(`✅ KODE: ${code.slice(0, 4)}-${code.slice(4)}`);
} catch (err) {
  console.log(`❌ Error: ${err.message}`);
}

process.exit(0);