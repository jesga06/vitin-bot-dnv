const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys")
const express = require("express")
const pino = require("pino")
const QRCode = require("qrcode")

const app = express()
const logger = pino({ level: "silent" })

let qrImage = null
let muted = {}

app.get("/", async (req,res)=>{

if(!qrImage){
return res.send("<h2>Bot conectado ou aguardando QR...</h2>")
}

res.send(`
<h2>Escaneie o QR</h2>
<img src="${qrImage}">
<p>Atualize se o QR mudar</p>
`)

})

const PORT = process.env.PORT || 3000
app.listen(PORT, ()=> console.log("Servidor rodando na porta " + PORT))

async function startBot(){

const { state, saveCreds } = await useMultiFileAuthState("./auth_info")
const { version } = await fetchLatestBaileysVersion()

const sock = makeWASocket({
version,
auth: state,
logger,
browser:["BotZap","Chrome","1.0"],
keepAliveIntervalMs:30000
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
if((lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut){
console.log("Reconectando...")
startBot()
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

const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []

// apagar mensagens de mutado
if(isGroup && muted[from] && muted[from].includes(sender)){
await sock.sendMessage(from,{ delete: msg.key })
return
}

const cmd = text.toLowerCase()

// ===== FIGURINHA =====

let quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage

let mediaMessage =
msg.message.imageMessage ||
msg.message.videoMessage ||
quoted?.imageMessage ||
quoted?.videoMessage

if(cmd === "!fig" || cmd === "!sticker"){

if(mediaMessage){

await sock.sendMessage(from,{
text:"Aguarde, estou terminando de comer o Kronos e já te envio a figurinha!"
})

let media = quoted ? { message: quoted } : msg

const buffer = await sock.downloadMediaMessage(media)

await sock.sendMessage(from,{
sticker: buffer
})

}

}

// ===== MUTE =====

if(cmd.startsWith("!mute") && mentioned.length){

let alvo = mentioned[0]

if(!muted[from]) muted[from] = []

muted[from].push(alvo)

await sock.sendMessage(from,{
text:"Minha gala seca silenciou sua boca piranha >:D"
})

}

// ===== UNMUTE =====

if(cmd.startsWith("!unmute") && mentioned.length){

let alvo = mentioned[0]

if(muted[from]){
muted[from] = muted[from].filter(u => u !== alvo)
}

await sock.sendMessage(from,{
text:"Sua sorte é que mandaram eu limpar meu leite da sua boca :("
})

}

// ===== BAN =====

if(cmd.startsWith("!ban") && mentioned.length && isGroup){

let alvo = mentioned[0]
let botNumber = sock.user.id.split(":")[0] + "@s.whatsapp.net"

if(alvo === botNumber){
await sock.sendMessage(from,{
text:"Eu não sou burro de me banir sozinho seu otário"
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
