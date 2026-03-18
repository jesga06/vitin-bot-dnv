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
let mutedUsers = {}
let mutedWarned = {}

// =========================
// DDD COMPLETO BRASIL
// =========================
const dddMap = {
"11":"São Paulo","12":"São Paulo","13":"São Paulo","14":"São Paulo","15":"São Paulo","16":"São Paulo","17":"São Paulo","18":"São Paulo","19":"São Paulo",
"21":"Rio de Janeiro","22":"Rio de Janeiro","24":"Rio de Janeiro",
"27":"Espírito Santo","28":"Espírito Santo",
"31":"Minas Gerais","32":"Minas Gerais","33":"Minas Gerais","34":"Minas Gerais","35":"Minas Gerais","37":"Minas Gerais","38":"Minas Gerais",
"41":"Paraná","42":"Paraná","43":"Paraná","44":"Paraná","45":"Paraná","46":"Paraná",
"47":"Santa Catarina","48":"Santa Catarina","49":"Santa Catarina",
"51":"Rio Grande do Sul","53":"Rio Grande do Sul","54":"Rio Grande do Sul","55":"Rio Grande do Sul",
"61":"Distrito Federal",
"62":"Goiás","64":"Goiás",
"63":"Tocantins",
"65":"Mato Grosso","66":"Mato Grosso",
"67":"Mato Grosso do Sul",
"68":"Acre",
"69":"Rondônia",
"71":"Bahia","73":"Bahia","74":"Bahia","75":"Bahia","77":"Bahia",
"79":"Sergipe",
"81":"Pernambuco","87":"Pernambuco",
"82":"Alagoas",
"83":"Paraíba",
"84":"Rio Grande do Norte",
"85":"Ceará","88":"Ceará",
"86":"Piauí","89":"Piauí",
"91":"Pará","93":"Pará","94":"Pará",
"92":"Amazonas","97":"Amazonas",
"95":"Roraima",
"96":"Amapá",
"98":"Maranhão","99":"Maranhão"
}

app.get("/", (req,res)=>{
  if(!qrImage){
    return res.send("<h2>Bot conectado</h2>")
  }
  res.send(`<h2>Escaneie o QR Code</h2><img src="${qrImage}">`)
})

const PORT = process.env.PORT || 3000
app.listen(PORT,()=>console.log("Servidor rodando na porta " + PORT))

// =========================
// VIDEO PARA STICKER
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
// INICIAR BOT
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
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
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
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 🎮 DIVERSÃO 〕━━━╮
│ ${prefix}roleta
│ ${prefix}bombardeio @user
│ ${prefix}gay @user
│ ${prefix}gado @user
│ ${prefix}ship @a @b
│ ${prefix}treta
╰━━━━━━━━━━━━━━━━━━━━╯
`
      })
    }

    // =========================
    // FIGURINHA
    // =========================
    if(
      (cmd === prefix+"s" ||
       cmd === prefix+"fig" ||
       cmd === prefix+"sticker" ||
       cmd === prefix+"f")
    ){
      if(!media){
        return sock.sendMessage(from,{ text:"Envie ou responda uma mídia!" })
      }

      try{
        const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger })

        let sticker

        if(msg.message?.imageMessage || quoted?.imageMessage){
          sticker = await sharp(buffer).resize(512,512).webp().toBuffer()
        }
        else if(msg.message?.videoMessage || quoted?.videoMessage){
          sticker = await videoToSticker(buffer)
        }

        await sock.sendMessage(from,{ sticker })

      }catch(err){
        console.error(err)
        await sock.sendMessage(from,{ text:"Erro ao criar figurinha!" })
      }
    }

    // =========================
    // BOMBARDEIO
    // =========================
    if(cmd.startsWith(prefix+"bombardeio") && mentioned && isGroup){
      const alvo = mentioned
      const numero = alvo.split("@")

      const ddd = numero.substring(0,2)
      const estado = dddMap[ddd] || "local desconhecido"

      // gera IP fake
      const ip = `${Math.floor(Math.random()*256)}.${Math.floor(Math.random()*256)}.${Math.floor(Math.random()*256)}.${Math.floor(Math.random()*256)}`

      await sock.sendMessage(from,{
        text:`📡 Localizando alvo...`,
        mentions:[alvo]
      })

      setTimeout(async ()=>{
        await sock.sendMessage(from,{
          text:`💻 IP rastreado: ${ip}`,
          mentions:[alvo]
        })
      },1500)

      setTimeout(async ()=>{
        await sock.sendMessage(from,{
          text:`🎯 Alvo identificado!\n💣 O ataque em ${estado} irá acontecer em breve.`,
          mentions:[alvo]
        })
      },3000)
    }

    // =========================
    // GAY / GADO / SHIP
    // =========================
    if(cmd.startsWith(prefix+"gay") && mentioned[0]){
      const alvo = mentioned[0]
      const numero = alvo.split("@")[0]
      const p = Math.floor(Math.random()*101)

      await sock.sendMessage(from,{ text:`@${numero} é ${p}% gay 🌈`, mentions:[alvo] })
    }

    if(cmd.startsWith(prefix+"gado") && mentioned[0]){
      const alvo = mentioned[0]
      const numero = alvo.split("@")[0]
      const p = Math.floor(Math.random()*101)

      await sock.sendMessage(from,{ text:`@${numero} é ${p}% gado 🐂`, mentions:[alvo] })
    }

    if(cmd.startsWith(prefix+"ship") && mentioned.length >= 2){
      const p1 = mentioned[0]
      const p2 = mentioned[1]
      const n1 = p1.split("@")[0]
      const n2 = p2.split("@")[0]
      const chance = Math.floor(Math.random()*101)

      await sock.sendMessage(from,{
        text:`💘 @${n1} + @${n2} = ${chance}%`,
        mentions:[p1,p2]
      })
    }

    // =========================
// TRETA
// =========================
if(cmd === prefix+"treta" && isGroup){
  const metadata = await sock.groupMetadata(from)
  const participantes = metadata.participants.map(p => p.id)

  const p1 = participantes[Math.floor(Math.random()*participantes.length)]
  let p2 = participantes[Math.floor(Math.random()*participantes.length)]

  while(p1 === p2){
    p2 = participantes[Math.floor(Math.random()*participantes.length)]
  }

  const n1 = p1.split("@")[0]
  const n2 = p2.split("@")[0]

  const motivos = [
    "brigaram por causa de comida",
    "discutiram por causa de mulher",
    `treta começou pois @${n1} tentou ver a pasta trancada de @${n2}`,
    "um chamou o outro de feio kkkkkkkkkkkk",
    "disputa de ego gigantesca",
    `treta começou pois @${n1} falou que era mais forte que @${n2}`,
    "um deve dinheiro pro outro(so tem caloteiro aqui)",
    "brigaram pra ver quem tem o maior pinto"
  ]

  const motivo = motivos[Math.floor(Math.random()*motivos.length)]

  // EVENTO ESPECIAL DO PINTO
  if(motivo === "brigaram pra ver quem tem o maior pinto"){
    const vencedor = Math.random() < 0.5 ? p1 : p2
    const perdedor = vencedor === p1 ? p2 : p1

    const nv = vencedor.split("@")[0]
    const np = perdedor.split("@")[0]

    const tamanhoVencedor = (Math.random() * 20 + 5).toFixed(1) // 5 a 25
    const tamanhoPerdedor = (Math.random() * 23 - 20).toFixed(1) // -20 a 3 💀

    const finais = [
      `@${np} tem o menor micro pênis já registrado da história! (${tamanhoPerdedor}cm)`,
      `@${nv} ganhou com seus incríveis ${tamanhoVencedor} centímetros!`
    ]

    const resultado = finais[Math.floor(Math.random()*finais.length)]

    await sock.sendMessage(from,{
      text:`Ih, os corno começaram a tretar\n\n@${n1} VS @${n2}\n\nMotivo: ${motivo}\nResultado: ${resultado}`,
      mentions:[p1,p2]
    })

    return
  }

  const resultados = [
    `@${n1} saiu chorando`,
    `@${n2} ficou de xereca`,
    "deu empate, briguem dnv fazendo favor",
    `@${n1} ganhou`,
    `@${n2} pediu arrego`
  ]

  const resultado = resultados[Math.floor(Math.random()*resultados.length)]

  await sock.sendMessage(from,{
    text:`Ih, os corno começaram a tretar\n\n@${n1} VS @${n2}\n\nMotivo: ${motivo}\nResultado: ${resultado}`,
    mentions:[p1,p2]
  })
}

startBot()
