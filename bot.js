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
if(cmd.startsWith(prefix+"bombardeio") && mentioned.length > 0 && isGroup){
  const alvo = mentioned[0]
  const numero = alvo.split("@")[0]

  const ddd = numero.substring(0,2)

  const regioesDDD = {
    "11":"Sudeste","12":"Sudeste","13":"Sudeste","14":"Sudeste","15":"Sudeste","16":"Sudeste","17":"Sudeste","18":"Sudeste","19":"Sudeste",
    "21":"Sudeste","22":"Sudeste","24":"Sudeste",
    "27":"Sudeste","28":"Sudeste",
    "31":"Sudeste","32":"Sudeste","33":"Sudeste","34":"Sudeste","35":"Sudeste","37":"Sudeste","38":"Sudeste",

    "41":"Sul","42":"Sul","43":"Sul","44":"Sul","45":"Sul","46":"Sul",
    "47":"Sul","48":"Sul","49":"Sul",
    "51":"Sul","53":"Sul","54":"Sul","55":"Sul",

    "61":"Centro-Oeste",
    "62":"Centro-Oeste","64":"Centro-Oeste",
    "65":"Centro-Oeste","66":"Centro-Oeste",
    "67":"Centro-Oeste",

    "71":"Nordeste","73":"Nordeste","74":"Nordeste","75":"Nordeste","77":"Nordeste",
    "79":"Nordeste",
    "81":"Nordeste","87":"Nordeste",
    "82":"Nordeste",
    "83":"Nordeste",
    "84":"Nordeste",
    "85":"Nordeste","88":"Nordeste",
    "86":"Nordeste","89":"Nordeste",

    "91":"Norte","93":"Norte","94":"Norte",
    "92":"Norte","97":"Norte",
    "95":"Norte",
    "96":"Norte",
    "98":"Norte","99":"Norte",
    "68":"Norte","69":"Norte"
  }

  const regiao = regioesDDD[ddd] || "desconhecida"

  const ip = `${Math.floor(Math.random()*256)}.${Math.floor(Math.random()*256)}.${Math.floor(Math.random()*256)}.${Math.floor(Math.random()*256)}`

  const provedores = ["Vivo Fibra","Claro NET","Oi Velox","TIM Ultra","Starlink"]
  const dispositivos = ["Android 13","iPhone 11","Windows 10","Windows 11","Xiaomi MIUI"]

  const provedor = provedores[Math.floor(Math.random()*provedores.length)]
  const dispositivo = dispositivos[Math.floor(Math.random()*dispositivos.length)]

  await sock.sendMessage(from,{
    text:`📡 Iniciando rastreamento avançado...`,
    mentions:[alvo]
  })

  setTimeout(async ()=>{
    await sock.sendMessage(from,{
      text:`🛰️ Buscando sinal do dispositivo de @${numero}...`,
      mentions:[alvo]
    })
  },1500)

  setTimeout(async ()=>{
    await sock.sendMessage(from,{
      text:`💻 IP capturado: ${ip}`,
      mentions:[alvo]
    })
  },3000)

  setTimeout(async ()=>{
    await sock.sendMessage(from,{
      text:`📡 Provedor identificado: ${provedor}`,
      mentions:[alvo]
    })
  },4500)

  setTimeout(async ()=>{
    await sock.sendMessage(from,{
      text:`📱 Dispositivo: ${dispositivo}`,
      mentions:[alvo]
    })
  },6000)

  setTimeout(async ()=>{
    await sock.sendMessage(from,{
      text:`📍 Local aproximado: Região ${regiao}`,
      mentions:[alvo]
    })
  },7500)

  setTimeout(async ()=>{
    await sock.sendMessage(from,{
      text:`⚠️ Vulnerabilidade encontrada... iniciando ataque...`,
      mentions:[alvo]
    })
  },9000)

  setTimeout(async ()=>{
    await sock.sendMessage(from,{
      text:`💣 O ataque será realizado em breve.`,
      mentions:[alvo]
    })
  },10500)
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
    // TRETA (mantida exatamente igual)
    // =========================
    if(cmd === prefix+"treta" && isGroup){
      const metadata = await sock.groupMetadata(from)
      const participantes = metadata.participants.map(p => p.id)

      if(participantes.length < 2) return

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

      if(motivo === "brigaram pra ver quem tem o maior pinto"){
        const vencedor = Math.random() < 0.5 ? p1 : p2
        const perdedor = vencedor === p1 ? p2 : p1

        const nv = vencedor.split("@")[0]
        const np = perdedor.split("@")[0]

        const tamanhoVencedor = (Math.random() * 20 + 5).toFixed(1)
        const tamanhoPerdedor = (Math.random() * 23 - 20).toFixed(1)

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

  })
}

startBot()
