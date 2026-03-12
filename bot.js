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

// >>> SEU NÚMERO (DONO)
const dono = "5573998579450@s.whatsapp.net"

let qrImage = null
let muted = {}

app.get("/", (req,res)=>{

if(!qrImage){
return res.send("<h2>Bot conectado ou aguardando reconexão...</h2>")
}

res.send(`
<h2>Escaneie o QR Code</h2>
<img src="${qrImage}">
<p>Atualize a página se mudar</p>
`)

})

const PORT = process.env.PORT || 3000

app.listen(PORT,()=>{
console.log("Servidor rodando na porta " + PORT)
})

async function videoToSticker(buffer){

const input = "./input.mp4"
const output = "./output.webp"

fs.writeFileSync(input, buffer)

await new Promise((resolve,reject)=>{

ffmpeg(input)
.outputOptions([
"-vcodec libwebp",
"-vf scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,fps=15",
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

async function startBot(){

const { state, saveCreds } = await useMultiFileAuthState("./auth")

const { version } = await fetchLatestBaileysVersion()

const sock = makeWASocket({

version,
auth: state,
logger,
printQRInTerminal:false,
browser:["BotZap","Chrome","1.0"]

})

sock.ev.on("creds.update", saveCreds)

sock.ev.on("connection.update", async (update)=>{

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

console.log("Conexão fechada")

if(reason !== DisconnectReason.loggedOut){

console.log("Reconectando em 5 segundos")
setTimeout(startBot,5000)

}

}
sock.ev.on("messages.upsert", async ({messages})=>{

const msg = messages
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

// MENU BONITO
if(cmd === "!menu"){

await sock.sendMessage(from,{
text:`
╭━━━〔 🤖 VITIN BOT 〕━━━╮

👑 *Status:* Online
⚙️ *Sistema:* Baileys

╰━━━〔 🎨 FIGURINHAS 〕━━━╯
!f
!fig
!s
!sticker

╰━━━〔 👮 ADMIN 〕━━━╯
!mute @usuario
!unmute @usuario
!ban @usuario

╰━━━〔 👑 DONO 〕━━━╯
!dono

📌 *Como usar figurinha*

Envie ou responda uma mídia
com um comando de figurinha

╰━━━━━━━━━━━━━━━━╯
`
})

}

// DONO
if(cmd === "!dono"){

const numero = dono.split("@")

await sock.sendMessage(from,{
text:`👑 Dono do bot: @${numero}`,
mentions:[dono]
})

}

// FIGURINHA
if(["!f","!fig","!s","!sticker"].includes(cmd)){

if(!media){

await sock.sendMessage(from,{
text:"Envie ou responda uma mídia"
})

return

}

await sock.sendMessage(from,{
text:"Aguarde um momento, estou fazendo sua figurinha"
})

let mediaMsg = quoted ? { message: quoted } : msg

const buffer = await downloadMediaMessage(
mediaMsg,
"buffer",
{},
{ logger }
)

let sticker

if(media.imageMessage){

sticker = await sharp(buffer)
.resize(512,512,{
fit:"contain",
background:{ r:0, g:0, b:0, alpha:0 }
})
.webp({
quality:90
})
.toBuffer()

}else{

sticker = await videoToSticker(buffer)

}

await sock.sendMessage(from,{ sticker })

}

// MUTE
if(cmd.startsWith("!mute") && mentioned.length && isGroup){

const metadata = await sock.groupMetadata(from)
const admin = metadata.participants.find(p => p.id === sender)?.admin

if(!admin) return

let alvo = mentioned

if(!muted[from]) muted[from] = []

muted[from].push(alvo)

await sock.sendMessage(from,{
text:"Minha gala seca silenciou sua boca piranha >:D"
})

}

// UNMUTE
if(cmd.startsWith("!unmute") && mentioned.length && isGroup){

const metadata = await sock.groupMetadata(from)
const admin = metadata.participants.find(p => p.id === sender)?.admin

if(!admin) return

let alvo = mentioned

if(muted[from]){
muted[from] = muted[from].filter(u => u !== alvo)
}

await sock.sendMessage(from,{
text:"Fala baixo nengue"
})

}

// BAN
if(cmd.startsWith("!ban") && mentioned.length && isGroup){

const metadata = await sock.groupMetadata(from)
const admin = metadata.participants.find(p => p.id === sender)?.admin

if(!admin) return

let alvo = mentioned

if(alvo === dono){

await sock.sendMessage(from,{
text:"Você não pode banir o criador do bot 😎"
})

return
}

await sock.groupParticipantsUpdate(from,[alvo],"remove")

await sock.sendMessage(from,{
text:"Receba a leitada divina"
})

}

})

}

startBot()
})
