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
let muted = {}

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

if(isGroup && muted[from]?.includes(sender)) return

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

// MENU

if(cmd === prefix+"menu"){

await sock.sendMessage(from,{
text:`
╭━━━〔 🤖 VITIN BOT 〕━━━╮

${prefix}menu
${prefix}s
${prefix}f
${prefix}fig
${prefix}sticker
${prefix}mute
${prefix}unmute
${prefix}ban
${prefix}dono

╰━━━━━━━━━━━━━━╯
`
})

}

// DONO

if(cmd === prefix+"dono"){

const numero = dono.split("@")[0]

await sock.sendMessage(from,{
text:`👑 Dono: @${numero}`,
mentions:[dono]
})

}

// STICKER

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
{
logger,
reuploadRequest: sock.updateMediaMessage
}
)

let sticker

if(media.imageMessage){

sticker = await sharp(buffer)
.resize(512,512,{
fit:"fill"
})
.webp({quality:90})
.toBuffer()

}else{

sticker = await videoToSticker(buffer)

}

await sock.sendMessage(from,{ sticker })

}

// MUTE

if(cmd.startsWith(prefix+"mute") && mentioned.length && isGroup){

const metadata = await sock.groupMetadata(from)
const admin = metadata.participants.find(p => p.id === sender)?.admin

if(!admin) return

const alvo = mentioned[0]

if(!muted[from]) muted[from] = []

muted[from].push(alvo)

await sock.sendMessage(from,{text:"Não grita 🤫"})

}

// UNMUTE

if(cmd.startsWith(prefix+"unmute") && mentioned.length && isGroup){

const metadata = await sock.groupMetadata(from)
const admin = metadata.participants.find(p => p.id === sender)?.admin

if(!admin) return

const alvo = mentioned[0]

if(muted[from]){
muted[from] = muted[from].filter(u => u !== alvo)
}

await sock.sendMessage(from,{text:"Fala baixo nengue"})

}

// BAN

if(cmd.startsWith(prefix+"ban") && mentioned.length && isGroup){

const metadata = await sock.groupMetadata(from)
const admin = metadata.participants.find(p => p.id === sender)?.admin

if(!admin) return

const alvo = mentioned[0]

if(alvo === dono){
return sock.sendMessage(from,{text:"Não pode banir o dono seu otário"})
}

await sock.groupParticipantsUpdate(from,[alvo],"remove")

await sock.sendMessage(from,{text:"Receba a leitada divina "})

}

})

}

startBot()
