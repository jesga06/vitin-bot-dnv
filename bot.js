process.on("uncaughtException", console.error)
process.on("unhandledRejection", console.error)

const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, downloadMediaMessage } = require("@whiskeysockets/baileys")
const express = require("express")
const pino = require("pino")
const QRCode = require("qrcode")
const sharp = require("sharp")
const fs = require("fs")
const ffmpeg = require("fluent-ffmpeg")
const ffmpegPath = require("ffmpeg-static")
ffmpeg.setFfmpegPath(ffmpegPath)

const app = express()
const logger = pino({ level: "silent" })

const prefix = "!"
const dono = "557398579450@s.whatsapp.net"

let qrImage = null
let jarvisContext = {}
let mutedUsers = {}       // usuários mutados por grupo
let mutedWarned = {}      // usuários já avisados sobre mutado

app.get("/", (req,res)=>{
  if(!qrImage){
    return res.send("<h2>Bot conectado</h2>")
  }
  res.send(`
<h2>Escaneie o QR Code</h2>
<img src="${qrImage}">
`)
})

const PORT = process.env.PORT || 3000
app.listen(PORT,()=>console.log("Servidor rodando na porta " + PORT))

// =========================
// FUNÇÃO DE VIDEO PARA STICKER
// =========================
async function videoToSticker(buffer){
  const input = "./input.mp4"
  const output = "./output.webp"

  fs.writeFileSync(input, buffer)
  await new Promise((resolve,reject)=>{
    ffmpeg(input)
      .outputOptions([
        "-vcodec libwebp",
        "-vf scale=512:512:flags=lanczos,fps=15",
        "-loop 0",
        "-preset default",
        "-an",
        "-vsync 0"
      ])
      .toFormat("webp")
      .save(output)
      .on("end", resolve)
      .on("error", reject)
  })

  const sticker = fs.readFileSync(output)
  fs.unlinkSync(input)
  fs.unlinkSync(output)
  return sticker
}

// =========================
// INÍCIO DO BOT
// =========================
async function startBot(){
  const { state, saveCreds } = await useMultiFileAuthState("./auth")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal:false,
    browser:["VitinBot","Chrome","1.0"]
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", async(update)=>{
    const { connection, qr, lastDisconnect } = update

    if(qr){
      qrImage = await QRCode.toDataURL(qr)
      console.log("QR GERADO")
    }

    if(connection === "open"){
      console.log("BOT ONLINE")
      qrImage = null
    }

    if(connection === "close"){
      const reason = lastDisconnect?.error?.output?.statusCode
      if(reason !== DisconnectReason.loggedOut){
        console.log("Reconectando...")
        setTimeout(startBot,5000)
      }
    }
  })

  sock.ev.on("messages.upsert", async ({ messages })=>{
    const msg = messages[0]
    if(!msg.message) return
    if(msg.key.fromMe) return

    const from = msg.key.remoteJid
    const sender = msg.key.participant || msg.key.remoteJid
    const isGroup = from.endsWith("@g.us")

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      ""

    const cmd = text.toLowerCase()
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
    let quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage

    let media =
      msg.message?.imageMessage ||
      msg.message?.videoMessage ||
      quoted?.imageMessage ||
      quoted?.videoMessage

    // =========================
    // BLOQUEIO DE USUÁRIOS MUTADOS (AVISO 1X)
    // =========================
    if(isGroup && mutedUsers[from] && mutedUsers[from].includes(sender)){
      try {
        if(!mutedWarned[from]) mutedWarned[from] = []
        if(!mutedWarned[from].includes(sender)){
          await sock.sendMessage(from, { text: "Cala boca quenga" })
          mutedWarned[from].push(sender)
        }
        // deleta a mensagem
        await sock.sendMessage(from, { delete: msg.key })
      } catch(e){
        console.log("Erro ao deletar mensagem do mutado:", e)
      }
      return
    }

    // =========================
    // COMANDO JARVIS
    // =========================
    if(cmd === prefix+"jarvis"){
      await sock.sendMessage(from,{
        text:"O que deseja senhor?\n1- Amoleça meu pinto\n2- Mate o Kronos\n3- Deixa pra lá"
      })
      jarvisContext[from] = true
      return
    }

    if(jarvisContext[from]){
      if(text === "1"){
        await sock.sendMessage(from,{text:"Claro senhor, estarei enviando no seu privado uma foto da sua vó pelada"})
      } else if(text === "2"){
        await sock.sendMessage(from,{text:"Não precisa pedir 2 vezes"})
      } else if(text === "3"){
        await sock.sendMessage(from,{text:"Vai tomar no cú então"})
      } else {
        await sock.sendMessage(from,{text:"Opção inválida. Digite 1, 2 ou 3"})
        return
      }
      delete jarvisContext[from]
      return
    }

    // =========================
    // MENU
    // =========================
    if(cmd === prefix+"menu"){
      await sock.sendMessage(from,{
        text:`
╭━━━〔 🤖 VITIN BOT 〕━━━╮
│ 👑 Status: Online
│ ⚙️ Sistema: Baileys
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 🎨 FIGURINHAS 〕━━━╮
│ ${prefix}s / ${prefix}fig / ${prefix}sticker / ${prefix}f
│ Envie a mídia e logo em seguida
│ marque a imagem com o comando
│ para criar sua figurinha
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 👮 ADMIN 〕━━━╮
│ ${prefix}ban @usuario
│ ${prefix}mute @usuario
│ ${prefix}unmute @usuario
│ Apenas admins podem usar
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 👑 DONO 〕━━━╮
│ ${prefix}dono
╰━━━━━━━━━━━━━━━━━━━━╯
`
      })
    }

    // =========================
    // DONO
    // =========================
    if(cmd === prefix+"dono"){
      const numero = dono.split("@")[0]
      await sock.sendMessage(from,{
        text:`👑 Dono: @${numero}`,
        mentions:[dono]
      })
    }

    // =========================
    // STICKER
    // =========================
    if(["!s","!fig","!sticker","!f"].includes(cmd)){
      if(!media){
        return sock.sendMessage(from,{text:"Envie ou responda uma mídia"})
      }

      await sock.sendMessage(from,{text:"Aguarde um momento, em breve enviarei sua figurinha..."})
      let mediaMsg = quoted ? { message: quoted } : msg

      const buffer = await downloadMediaMessage(
        mediaMsg,
        "buffer",
        {},
        { logger, reuploadRequest: sock.updateMediaMessage }
      )

      let sticker
      if(media.imageMessage){
        sticker = await sharp(buffer)
          .resize(512,512,{ fit:"fill" })
          .webp({quality:90})
          .toBuffer()
      } else {
        sticker = await videoToSticker(buffer)
      }

      await sock.sendMessage(from,{ sticker })
    }

    // =========================
// MUTE / UNMUTE / BAN ORGANIZADO
// =========================
if(isGroup && mentioned.length){
  const metadata = await sock.groupMetadata(from)
  const admin = metadata.participants.find(p => p.id === sender)?.admin
  if(!admin) return sock.sendMessage(from, { text: "Somente admins podem usar este comando." })

  const alvo = mentioned[0]

  // MUTE
  if(cmd.startsWith(prefix+"mute")){
    if(alvo === dono) return sock.sendMessage(from,{text:"Não pode mutar o dono!"})
    if(!mutedUsers[from]) mutedUsers[from] = []
    if(!mutedUsers[from].includes(alvo)) mutedUsers[from].push(alvo)
    await sock.sendMessage(from,{text:`Não grita 🤫`})
    return
  }

  // UNMUTE
  if(cmd.startsWith(prefix+"unmute")){
    if(mutedUsers[from] && mutedUsers[from].includes(alvo)){
      mutedUsers[from] = mutedUsers[from].filter(u => u !== alvo)
      if(mutedWarned[from]){
        mutedWarned[from] = mutedWarned[from].filter(u => u !== alvo)
      }
    }
    await sock.sendMessage(from,{text:`Pode falar nengue`})
    return
  }

  // BAN
  if(cmd.startsWith(prefix+"ban")){
    if(alvo === dono) return sock.sendMessage(from,{text:"Não pode banir o dono!"})

    try {
      await sock.groupParticipantsUpdate(from,[alvo],"remove")
      await sock.sendMessage(from,{text:"Receba a leitada divina"})
    } catch(e){
      console.log("Erro ao banir participante:", e)
      await sock.sendMessage(from,{text:"Não foi possível banir o usuário."})
    }
    return
  }
}

  })
}

startBot()
