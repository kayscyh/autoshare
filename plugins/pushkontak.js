import clc from 'cli-color';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pushkontak(sock, sender, message, key) {
  try {
    const parts = message.split(" ");

    const templates =
`PUSH KONTAK

Cara Penggunaan:
pushkontak <ID_Grup> <pesan>

Contoh:
pushkontak 123456789@g.us Informasi penting...`;

    if (parts.length < 3) {
      return await sock.sendMessage(sender, { text: templates });
    }

    const idgrub = parts[1];
    const text = parts.slice(2).join(" ");

    if (!idgrub.includes("@g.us")) {
      return await sock.sendMessage(sender, { text: templates });
    }

    if (!text || text.length === 0) {
      return await sock.sendMessage(sender, {
        text: "Gagal: pesan tidak boleh kosong."
      });
    }

    await sock.sendMessage(sender, {
      text: "⏳ Memproses, mengambil daftar kontak..."
    });

    const allParticipant = await getGroupParticipants(sock, idgrub);

    if (!allParticipant || allParticipant.length === 0) {
      return await sock.sendMessage(sender, {
        text: "Gagal: tidak dapat membaca peserta grup."
      });
    }

    const totalMember = allParticipant.length;
    let nomor = 1;

    for (const participant of allParticipant) {
      try {
        console.log(clc.green(`[${nomor}/${totalMember}] Mengirim ke: ${participant.id}`));
        await sock.sendMessage(participant.id, { text });
        await sleep(global.jeda || 3000);
      } catch (sendError) {
        console.error(clc.red(`[ERROR] Gagal ke ${participant.id}:`));
      }
      nomor++;
    }

    return await sock.sendMessage(sender, {
      text: `✅ Selesai. Total target: ${totalMember} nomor.`
    });

  } catch (mainError) {
    console.error(clc.red("[FATAL] Error pushkontak:"), mainError);
    return await sock.sendMessage(sender, {
      text: "❌ Terjadi kesalahan, coba lagi."
    });
  }
}

async function getGroupParticipants(sock, groupId) {
  try {
    const metadata = await sock.groupMetadata(groupId);
    return metadata.participants;
  } catch (error) {
    console.error(clc.red(`[ERROR] Gagal ambil metadata ${groupId}:`), error);
    return false;
  }
}

export default pushkontak;