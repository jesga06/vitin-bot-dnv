const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require("@whiskeysockets/baileys")

const pino = require("pino")
const qrcode = require("qrcode-terminal")
const express = require("express")

const app = express()
const logger = pino({ level: "silent" })

// ======= MEMÓRIA SIMPLES (mutes) =======
const muted = {} // { groupJid: Set(jid) }

// ======= IMAGENS/GIFS PARA BRINCADEIRAS =======
const gifs = {
  beijo: "https://media.giphy.com/media/G3va31oEEnIkM/giphy.gif",
  tapa: "https://media.giphy.com/media/jLeyZWgtwgr2U/giphy.gif",
  abraco: "https://media.giphy.com/media/l2QDM9Jnim1YVILXa/giphy.gif",
  chute: "https://media.giphy.com/media/3o6ZtaO9BZHcOjmErm/giphy.gif",
  casal: "https://media.giphy.com/media/3oriO0OEd9QIDdllqo/giphy.gif"
}

// ======= SERVIDOR HTTP (PORTA 3000) =======
app.get("/", (req, res) => {
  res.send("BotZap rodando 24h")
})

app.listen(3000, () => {
  console.log("🌐 Servidor rodando na porta 3000")
})

// ======= FUNÇÃO PRINCIPAL =======
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: ["BotZap", "Chrome", "1.0"],
    keepAliveIntervalMs: 30000
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update

    if (qr) {
      console.log("📱 Escaneie o QR abaixo:")
      qrcode.generate(qr, { small: true })
    }

    if (connection === "open") {
      console.log("✅ BOT ONLINE!")
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode
      if (reason !== DisconnectReason.loggedOut) {
        console.log("🔄 Reconectando...")
        startBot()
      } else {
        console.log("❌ Sessão encerrada. Apague auth_info e conecte novamente.")
      }
    }
  })

  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages[0]
      if (!msg.message) return
      if (msg.key.fromMe) return

      const from = msg.key.remoteJid
      const isGroup = from.endsWith("@g.us")

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ""

      const sender = msg.key.participant || msg.key.remoteJid
      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
      const replyMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage

      // ======= APAGAR MENSAGENS DE MUTADOS =======
      if (isGroup && muted[from] && muted[from].has(sender)) {
        await sock.sendMessage(from, { delete: msg.key })
        return
      }

      // ======= COMANDOS =======
      const cmd = text.trim().toLowerCase()

      // MENU BONITO
      if (cmd === "!menu") {
        await sock.sendMessage(from, {
          text:
`╔═══『 🤖 BOTZAP MENU 』═══╗
║ !ping
║ !ola
║ !fig / !sticker
║ !figtexto
║ !xingamento
║ !mute
║ !unmute
║ !casar
║ !beijo
║ !tapa
║ !abraco
║ !chute
║ rank corno
║ rank gay
╚═══════════════════╝`
        })
      }

      // OLA
      if (cmd === "!ola") {
        await sock.sendMessage(from, {
          text: "Não posso responder agora, estou ocupado comendo o Kronos"
        })
      }

      // XINGAMENTO
      if (cmd === "!xingamento") {
        await sock.sendMessage(from, {
          text: "Kronos Kornos Cabeça de Filtro de Barro"
        })
      }

      // PING (marca alguém aleatório)
      if (cmd === "!ping" && isGroup) {
        const meta = await sock.groupMetadata(from)
        const members = meta.participants.map(p => p.id)
        const rand = members[Math.floor(Math.random() * members.length)]

        await sock.sendMessage(from, {
          text: `🏓 Pong! @${rand.split("@")[0]}`,
          mentions: [rand]
        })
      }

      // FIGURINHA (imagem/video/gif)
      if (cmd === "!fig" || cmd === "!sticker") {
        let mediaMsg = msg.message.imageMessage || msg.message.videoMessage

        if (!mediaMsg && replyMsg) {
          mediaMsg = replyMsg.imageMessage || replyMsg.videoMessage
        }

        if (!mediaMsg) {
          return sock.sendMessage(from, { text: "Envie ou responda uma imagem/video/gif com !fig" })
        }

        const buffer = await sock.downloadMediaMessage(msg)

        await sock.sendMessage(from, {
          sticker: buffer
        })
      }

      // FIGURINHA COM TEXTO
      if (cmd.startsWith("!figtexto")) {
        const texto = text.replace("!figtexto", "").trim()

        if (!texto) {
          return sock.sendMessage(from, { text: "Use: !figtexto seu texto aqui" })
        }

        await sock.sendMessage(from, {
          sticker: { url: `https://api.memegen.link/images/custom/${encodeURIComponent(texto)}/.png` }
        })
      }

      // MUTE
      if (cmd.startsWith("!mute") && isGroup) {
        if (mentioned.length === 0) return

        const alvo = mentioned[0]

        if (!muted[from]) muted[from] = new Set()
        muted[from].add(alvo)

        await sock.sendMessage(from, {
          text: "minha gala seca silenciou sua boca piranha >:D"
        })
      }

      // UNMUTE
      if (cmd.startsWith("!unmute") && isGroup) {
        if (mentioned.length === 0) return

        const alvo = mentioned[0]

        if (muted[from]) muted[from].delete(alvo)

        await sock.sendMessage(from, {
          text: "Você foi desmutado."
        })
      }

      // CASAR
      if (cmd.startsWith("!casar") && mentioned.length) {
        const alvo = mentioned[0]

        await sock.sendMessage(from, {
          image: { url: gifs.casal },
          caption: `💍 Parabéns, vocês estão casados!\n@${sender.split("@")[0]} ❤️ @${alvo.split("@")[0]}`,
          mentions: [sender, alvo]
        })
      }

      // BEIJO
      if (cmd.startsWith("!beijo") && mentioned.length) {
        const alvo = mentioned[0]

        await sock.sendMessage(from, {
          image: { url: gifs.beijo },
          caption: `@${sender.split("@")[0]} deu um beijo gostoso em @${alvo.split("@")[0]}!`,
          mentions: [sender, alvo]
        })
      }

      // TAPA
      if (cmd.startsWith("!tapa") && mentioned.length) {
        const alvo = mentioned[0]

        await sock.sendMessage(from, {
          image: { url: gifs.tapa },
          caption: `@${sender.split("@")[0]} deu um tapa em @${alvo.split("@")[0]}!`,
          mentions: [sender, alvo]
        })
      }

      // ABRAÇO
      if (cmd.startsWith("!abraco") && mentioned.length) {
        const alvo = mentioned[0]

        await sock.sendMessage(from, {
          image: { url: gifs.abraco },
          caption: `@${sender.split("@")[0]} abraçou @${alvo.split("@")[0]}!`,
          mentions: [sender, alvo]
        })
      }

      // CHUTE
      if (cmd.startsWith("!chute") && mentioned.length) {
        const alvo = mentioned[0]

        await sock.sendMessage(from, {
          image: { url: gifs.chute },
          caption: `@${sender.split("@")[0]} chutou @${alvo.split("@")[0]}!`,
          mentions: [sender, alvo]
        })
      }

      // RANK CORNO
      if (cmd === "rank corno" && isGroup) {
        const meta = await sock.groupMetadata(from)
        const members = meta.participants.slice(0,5).map(p => "@"+p.id.split("@")[0])

        await sock.sendMessage(from, {
          text:
`🐂 RANK CORNO 🐂
1️⃣ ${members[0]}
2️⃣ ${members[1]}
3️⃣ ${members[2]}
4️⃣ ${members[3]}
5️⃣ ${members[4]}`,
          mentions: meta.participants.slice(0,5).map(p=>p.id)
        })
      }

      // RANK GAY
      if (cmd === "rank gay" && isGroup) {
        const meta = await sock.groupMetadata(from)
        const members = meta.participants.slice(0,5).map(p => "@"+p.id.split("@")[0])

        await sock.sendMessage(from, {
          text:
`🏳️‍🌈 RANK GAY 🏳️‍🌈
1️⃣ ${members[0]}
2️⃣ ${members[1]}
3️⃣ ${members[2]}
4️⃣ ${members[3]}
5️⃣ ${members[4]}`,
          mentions: meta.participants.slice(0,5).map(p=>p.id)
        })
      }

    } catch (err) {
      console.log("Erro:", err)
    }
  })
}

startBot()
