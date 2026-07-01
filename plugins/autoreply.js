let status = false;

async function autoreply(sock, sender, messages, key, messageEvent) {
  const parts = messages.trim().split(" ");
  
  // STOP COMMAND
  if (parts.length >= 2 && parts[1].toLowerCase() === "stop") {
    if (global.autoreplyInterval) {
      clearInterval(global.autoreplyInterval);
      global.autoreplyInterval = null;
      status = false;
      return sock.sendMessage(sender, {
        text: "🛑 Autoreply telah dihentikan.",
      });
    }
    return sock.sendMessage(sender, {
      text: "❌ Autoreply tidak sedang berjalan.",
    });
  }

  if (parts.length < 2) {
    return sock.sendMessage(sender, {
      text: `*CARA PENGGUNAAN*\n➽ autoreply text\n\nContoh: autoreply Pesan`,
    });
  }

  if (status) {
    return sock.sendMessage(sender, {
      text: "✅ Autoreply sudah berjalan",
    });
  }

  status = true;
  const text = parts.slice(1).join(" ");

  if (!text) {
    return sock.sendMessage(sender, { react: { text: "🚫", key } });
  }

  await sock.sendMessage(sender, { react: { text: "⏰", key } });

  global.autoreplyInterval = setInterval(async () => {
    const activeGroups = Object.keys(global.chatCounter || {});

    if (activeGroups.length === 0) {
      console.log("⛔ Tidak ada grup aktif.");
      return;
    }

    for (const groupId of activeGroups) {
      try {
        if (global.chatCounter[groupId]?.total < 1) continue;

        await sock.sendMessage(groupId, { text });
        console.log(`✅ Terkirim ke ${groupId}`);

        if (global.chatCounter[groupId]) {
          global.chatCounter[groupId].total = 0;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, global.jeda || 10000)
        );
      } catch (err) {
        console.error(`❌ Gagal kirim ke ${groupId}:`, err.message);
      }
    }
  }, 60000);

  await sock.sendMessage(sender, {
    text: `✅ Autoreply dimulai: "${text}"`,
  });
}

export default autoreply;