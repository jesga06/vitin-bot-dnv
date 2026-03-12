process.on("uncaughtException", console.error)
process.on("unhandledRejection", console.error)

const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, downloadContentFromMessage } = require("@whiskeysockets/baileys")
const express = require("express")
const pino = require("pino")
const QRCode = require("qrcode")
const sharp = require("sharp")
const fs = require("fs")
const ffmpeg = require("fluent-ffmpeg")

const app = express()
const logger = pino({ level: "silent" })

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

async function startBot(){

const { state, saveCreds } = await useMultiFileAuthState("./auth_info")
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

if(reason !== DisconnectReason.loggedOut){

console.log("Reconectando em 5 segundos")

setTimeout(()=>{
startBot()
},5000)

}

}

})

sock.ev.on("messages.upsert", async ({messages})=>{

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

const metadata = isGroup ? await sock.groupMetadata(from) : null
const admins = isGroup ? metadata.participants.filter(p=>p.admin).map(p=>p.id) : []
const isAdmin = admins.includes(sender)

if(isGroup && muted[from] && muted[from].includes(sender)){
await sock.sendMessage(from,{ delete: msg.key })
return
}

let quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage

// MENU

if(cmd === "!menu"){

await sock.sendMessage(from,{
text:
`🤖 MENU DO BOT

🎨 FIGURINHAS
!f
!fig
!s
!sticker

👮 MODERAÇÃO (ADM)
!ban @membro
!mute @membro
!unmute @membro
!promote @membro
!demote @membro`
})

}

// FIGURINHA

if(["!f","!fig","!sticker","!s"].includes(cmd)){

let media =
msg.message.imageMessage ||
msg.message.videoMessage ||
quoted?.imageMessage ||
quoted?.videoMessage

if(!media) return

await sock.sendMessage(from,{
text:"Aguarde um momento, estou fazendo sua figurinha"
})

const stream = await downloadContentFromMessage(
media,
media.mimetype?.includes("video") ? "video" : "image"
)

let buffer = Buffer.from([])

for await(const chunk of stream){
buffer = Buffer.concat([buffer,chunk])
}

let webpBuffer

if(media.mimetype?.includes("video")){

fs.writeFileSync("temp.mp4",buffer)

await new Promise((resolve,reject)=>{

ffmpeg("temp.mp4")
.outputOptions([
"-vcodec libwebp",
"-vf scale=512:512:force_original_aspect_ratio=decrease,fps=15",
"-loop 0",
"-t 5",
"-preset default",
"-an",
"-vsync 0"
])
.save("temp.webp")
.on("end",resolve)
.on("error",reject)

})

webpBuffer = fs.readFileSync("temp.webp")

}else{

webpBuffer = await sharp(buffer)
.resize(512,512,{fit:"contain"})
.webp()
.toBuffer()

}

await sock.sendMessage(from,{
sticker:webpBuffer
})

}

// BAN

if(cmd.startsWith("!ban") && mentioned.length && isGroup){

if(!isAdmin) return

await sock.groupParticipantsUpdate(from,[mentioned[0]],"remove")

await sock.sendMessage(from,{
text:"Receba a leitada divina"
})

}

// MUTE

if(cmd.startsWith("!mute") && mentioned.length){

if(!isAdmin) return

let alvo = mentioned[0]

if(!muted[from]) muted[from] = []

muted[from].push(alvo)

await sock.sendMessage(from,{
text:"Não grita 🤫"
})

}

// UNMUTE

if(cmd.startsWith("!unmute") && mentioned.length){

if(!isAdmin) return

let alvo = mentioned[0]

if(muted[from]){
muted[from] = muted[from].filter(u=>u!==alvo)
}

await sock.sendMessage(from,{
text:"Pode falar nengue"
})

}

// PROMOVER

if(cmd.startsWith("!promover") && mentioned.length && isGroup){

if(!isAdmin) return

await sock.groupParticipantsUpdate(from,[mentioned[0]],"promover")

await sock.sendMessage(from,{
text:"Parabéns, foi promovido a pobre premium👑"
})

}

// REBAIXAR

if(cmd.startsWith("!rebaixar") && mentioned.length && isGroup){

if(!isAdmin) return

await sock.groupParticipantsUpdate(from,[mentioned[0]],"rebaixar")

await sock.sendMessage(from,{
text:"O otário virou membro comum KKKKKKKKKKKKKKKKKKK"
})

}

})

}

startBot()
