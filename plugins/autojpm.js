import clc from "cli-color";
import fs from "fs";
import path from "path";
import { isImageMessage, downloadAndSaveMedia, readWhitelist } from "../lib/utils.js";
import { saveAutoJPMStatus, readAutoJPMStatus } from "../lib/autojpmStatus.js";

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAllGroups(sock) {
  try {
    const groups = await sock.groupFetchAllParticipating();
    return Object.values(groups).map((group) => ({
      id: group.id,
      name: group.subject,
      participants: group.participants,
    }));
  } catch (error) {
    console.error(clc.red("❌ Gagal mengambil grup:"), error);
    return [];
  }
}

async function autojpm(sock, sender, messages, key, messageEvent) {
  const parts = messages.trim().split(" ");
  const text = parts.slice(1).join(" ").trim();

  // STOP COMMAND
  if (text === "stop") {
    if (!global.autojpmRunning) {
      return sock.sendMessage(sender, {
        text: "❌ AutoJPM tidak sedang berjalan.",
      });
    }
    global.autojpmRunning = false;
    saveAutoJPMStatus(false);
    console.log("🛑 AutoJPM dihentikan.");
    return sock.sendMessage(sender, { text: "🛑 AutoJPM telah dihentikan." });
  }

  if (global.autojpmRunning) {
    return sock.sendMessage(sender, {
      text: "⚠️ AutoJPM sudah berjalan. Ketik *autojpm stop* untuk menghentikan.",
    });
  }

  if (!text) {
    return sock.sendMessage(sender, {
      text: `*ᴄᴀʀᴀ ᴘᴇɴɢɢᴜɴᴀᴀɴ*\n➽ ᴀᴜᴛᴏᴊᴘᴍ ᴛᴇxᴛ\n\nᴄᴏɴᴛᴏʜ: ᴀᴜᴛᴏᴊᴘᴍ ᴘᴇꜱᴀɴ`,
    });
  }

  global.autojpmRunning = true;

  let imagePath = null;
  if (isImageMessage(messageEvent)) {
    try {
      const filename = `${sender}.jpeg`;
      const result = await downloadAndSaveMedia(
        sock,
        messageEvent.messages?.[0],
        filename
      );
      if (result) imagePath = `./tmp/${filename}`;
    } catch (error) {
      console.error(clc.red("❌ Error unduh gambar:"), error);
    }
  }

  saveAutoJPMStatus(true, text, imagePath);
  await sock.sendMessage(sender, { react: { text: "⏰", key } });

  let putaran = 1;
  while (global.autojpmRunning) {
    const allGroups = await getAllGroups(sock);
    if (!allGroups.length) {
      await sock.sendMessage(sender, { text: "❌ Tidak ada grup ditemukan." });
      break;
    }

    const whitelist = readWhitelist();
    const targetGroups = whitelist
      ? allGroups.filter((group) => !whitelist.includes(group.id))
      : allGroups;

    if (targetGroups.length === 0) {
      await sock.sendMessage(sender, {
        text: "⚠️ Semua grup ada di whitelist.",
      });
      break;
    }

    let groupCount = 1;
    for (const group of targetGroups) {
      if (!global.autojpmRunning) break;

      const participants = Array.isArray(group?.participants)
        ? group.participants
        : [];
      const mentions = global.autojpm?.hidetag
        ? participants.map((p) => p.id)
        : [];

      console.log(
        clc.green(
          `🔄 [${groupCount}/${targetGroups.length}] ➜ ${group.name}`
        )
      );

      try {
        await Promise.race([
          sock.sendMessage(
            group.id,
            imagePath
              ? { image: fs.readFileSync(imagePath), caption: text, mentions }
              : { text, mentions }
          ),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 30000)
          ),
        ]);
      } catch (error) {
        console.error(clc.red(`❌ Gagal ke ${group.name}`));
      }

      // ⏰ JEDA PER GROUP
      const jedaGroup = global.autojpm?.jedaPerGroup || 5000;
      console.log(clc.yellow(`⏳ Tunggu ${jedaGroup/1000} detik...`));
      await sleep(jedaGroup);
      groupCount++;
    }

    if (!global.autojpmRunning) break;

    // ⏰ JEDA PER ROUND
    const jedaRound = global.autojpm?.jedaPerRound || 1800000;
    console.log(
      clc.yellow(`✅ Putaran ${putaran} selesai. Tunggu ${jedaRound/1000} detik...`)
    );
    putaran++;
    await sleep(jedaRound);
  }

  global.autojpmRunning = false;
  await sock.sendMessage(sender, {
    text: "✅ AutoJPM selesai.",
  });
}

export default autojpm;