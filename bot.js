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

app.listen(3000, ()=> console.log("🌐 QR SITE ONLINE"))

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

console.log("RECONectando...")
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

if(isGroup && muted[from] && muted[from].includes(sender)){
await sock.sendMessage(from,{ delete: msg.key })
return
}

const cmd = text.toLowerCase()

if(cmd === "!menu"){

await sock.sendMessage(from,{
text:
`╔════ BOTZAP MENU ════╗
!ping
!ola
!fig
!figtexto
!xingamento
!mute
!unmute
!casar
!beijo
!tapa
!abraco
!chute
rank corno
rank gay
╚═══════════════════╝`
})

}

if(cmd === "!ola"){
await sock.sendMessage(from,{ text:"Não posso responder agora, estou ocupado comendo o Kronos" })
}

if(cmd === "!xingamento"){
await sock.sendMessage(from,{ text:"Kronos Kornos Cabeça de Filtro de Barro" })
}

if(cmd === "!ping" && isGroup){

const meta = await sock.groupMetadata(from)
const users = meta.participants.map(p=>p.id)

const rand = users[Math.floor(Math.random()*users.length)]

await sock.sendMessage(from,{
text:`🏓 Pong @${rand.split("@")[0]}`,
mentions:[rand]
})

}

if(cmd === "!fig" || cmd === "!sticker"){

if(msg.message.imageMessage || msg.message.videoMessage){

const buffer = await sock.downloadMediaMessage(msg)

await sock.sendMessage(from,{
sticker: buffer
})

}

}

if(cmd.startsWith("!figtexto")){

let texto = text.replace("!figtexto","").trim()

await sock.sendMessage(from,{
sticker:{ url:`https://api.memegen.link/images/custom/${encodeURIComponent(texto)}/.png` }
})

}

if(cmd.startsWith("!mute") && mentioned.length){

let alvo = mentioned[0]

if(!muted[from]) muted[from] = []

muted[from].push(alvo)

await sock.sendMessage(from,{
text:"minha gala seca silenciou sua boca piranha >:D"
})

}

if(cmd.startsWith("!unmute") && mentioned.length){

let alvo = mentioned[0]

if(muted[from]){
muted[from] = muted[from].filter(u=>u!==alvo)
}

await sock.sendMessage(from,{
text:"Usuário desmutado"
})

}

if(cmd.startsWith("!casar") && mentioned.length){

let alvo = mentioned[0]

await sock.sendMessage(from,{
image:{url:"https://i.imgur.com/5Z4QZ9F.jpeg"},
caption:`Parabéns, vocês estão casados!\n@${sender.split("@")[0]} ❤️ @${alvo.split("@")[0]}`,
mentions:[sender,alvo]
})

}

if(cmd.startsWith("!beijo") && mentioned.length){

let alvo = mentioned[0]

await sock.sendMessage(from,{
image:{url:"https://i.imgur.com/7D7I6dI.gif"},
caption:`@${sender.split("@")[0]} deu um beijo gostoso em @${alvo.split("@")[0]}!`,
mentions:[sender,alvo]
})

}

if(cmd.startsWith("!tapa") && mentioned.length){

let alvo = mentioned[0]

await sock.sendMessage(from,{
image:{url:"https://i.imgur.com/w3duR07.gif"},
caption:`@${sender.split("@")[0]} deu um tapa em @${alvo.split("@")[0]}!`,
mentions:[sender,alvo]
})

}

if(cmd.startsWith("!abraco") && mentioned.length){

let alvo = mentioned[0]

await sock.sendMessage(from,{
image:{url:"https://i.imgur.com/Fj3J8.gif"},
caption:`@${sender.split("@")[0]} abraçou @${alvo.split("@")[0]}!`,
mentions:[sender,alvo]
})

}

if(cmd.startsWith("!chute") && mentioned.length){

let alvo = mentioned[0]

await sock.sendMessage(from,{
image:{url:"https://i.imgur.com/Z2MYNbj.gif"},
caption:`@${sender.split("@")[0]} chutou @${alvo.split("@")[0]}!`,
mentions:[sender,alvo]
})

}

if(cmd === "rank corno" && isGroup){

const meta = await sock.groupMetadata(from)
const m = meta.participants.slice(0,5)

await sock.sendMessage(from,{
text:
`🐂 RANK CORNO 🐂
1️⃣ @${m[0].id.split("@")[0]}
2️⃣ @${m[1].id.split("@")[0]}
3️⃣ @${m[2].id.split("@")[0]}
4️⃣ @${m[3].id.split("@")[0]}
5️⃣ @${m[4].id.split("@")[0]}`,
mentions:m.map(x=>x.id)
})

}

if(cmd === "rank gay" && isGroup){

const meta = await sock.groupMetadata(from)
const m = meta.participants.slice(0,5)

await sock.sendMessage(from,{
text:
`🏳️‍🌈 RANK GAY 🏳️‍🌈
1️⃣ @${m[0].id.split("@")[0]}
2️⃣ @${m[1].id.split("@")[0]}
3️⃣ @${m[2].id.split("@")[0]}
4️⃣ @${m[3].id.split("@")[0]}
5️⃣ @${m[4].id.split("@")[0]}`,
mentions:m.map(x=>x.id)
})

}

})

}

startBot()
