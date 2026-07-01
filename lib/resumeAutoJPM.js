import fs from "fs";
import path from "path";
import clc from "cli-color";
import { saveAutoJPMStatus, readAutoJPMStatus } from "./autojpmStatus.js";
import { readWhitelist } from "./utils.js";

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resumeAutoJPM(sock) {
  const status = readAutoJPMStatus();
  if (!status.running || !status.text) return;

  const tmpDir = path.join(process.cwd(), "tmp");
  const tmpImagePath = path.join(tmpDir, "autojpm_resume.jpeg");

  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  let imageBuffer = null;
  if (status.imageBase64) {
    try {
      const base64Data = status.imageBase64.split(",").pop();
      imageBuffer = Buffer.from(base64Data, "base64");
      fs.writeFileSync(tmpImagePath, imageBuffer);
    } catch (err) {
      console.error("❌ Gagal decode gambar:", err.message);
    }
  }

  console.log("🔁 AutoJPM dilanjutkan setelah restart");
  global.autojpmRunning = true;
  saveAutoJPMStatus(true, status.text, status.imageBase64);

  let putaran = 1;
  while (global.autojpmRunning) {
    const allGroups = await getAllGroups(sock);
    if (!allGroups.length) break;

    const whitelist = readWhitelist();
    const targetGroups = whitelist
      ? allGroups.filter((group) => !whitelist.includes(group.id))
      : allGroups;

    if (targetGroups.length === 0) break;

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
        clc.green(`🔄 [${groupCount}/${targetGroups.length}] ➜ ${group.name}`)
      );

      try {
        await Promise.race([
          sock.sendMessage(
            group.id,
            imageBuffer
              ? {
                  image: fs.readFileSync(tmpImagePath),
                  caption: status.text,
                  mentions,
                }
              : { text: status.text, mentions }
          ),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 30000)
          ),
        ]);
      } catch (error) {
        console.error(clc.red(`❌ Gagal ke ${group.name}`));
      }

      const jedaGroup = global.autojpm?.jedaPerGroup || 5000;
      console.log(clc.yellow(`⏳ Tunggu ${jedaGroup/1000} detik...`));
      await sleep(jedaGroup);
      groupCount++;
    }

    if (!global.autojpmRunning) break;

    const jedaRound = global.autojpm?.jedaPerRound || 1800000;
    console.log(
      clc.yellow(`✅ Putaran ${putaran} selesai. Tunggu ${jedaRound/1000} detik...`)
    );
    putaran++;
    await sleep(jedaRound);
  }

  global.autojpmRunning = false;
}

export default resumeAutoJPM;