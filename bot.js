const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys")
const express = require("express")
const pino = require("pino")

const app = express()
const logger = pino({ level: "silent" })

let qrCode = "Carregando..."

async function startBot() {

const { state, saveCreds } = await useMultiFileAuthState("./auth_info")
const { version } = await fetchLatestBaileysVersion()

const sock = makeWASocket({
version,
auth: state,
logger,
browser: ["KronosBot","Chrome","1.0"]
})

sock.ev.on("creds.update", saveCreds)

sock.ev.on("connection.update", (update) => {

const { connection, lastDisconnect, qr } = update

if(qr){
qrCode = qr
console.log("QR gerado")
}

if(connection === "open"){
console.log("BOT CONECTADO")
}

if(connection === "close"){

const reason = lastDisconnect?.error?.output?.statusCode

if(reason !== DisconnectReason.loggedOut){
console.log("Reconectando...")
startBot()
}else{
console.log("Sessão encerrada")
}

}

})

sock.ev.on("messages.upsert", async ({ messages }) => {

const msg = messages[0]

if(!msg.message) return
if(msg.key.fromMe) return

const from = msg.key.remoteJid

const text =
msg.message.conversation ||
msg.message.extendedTextMessage?.text ||
""

if(text === "!ping"){

await sock.sendMessage(from,{
text:"🏓 Pong!"
})

}

if(text === "!ola"){

await sock.sendMessage(from,{
text:"Não posso responder agora, estou ocupado comendo o Kronos"
})

}

})

}

app.get("/", (req,res)=>{

res.send(`
<h2>Escaneie o QR</h2>
<img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${qrCode}">
<p>Atualize a página se o QR mudar</p>
`)

})

app.listen(3000, ()=>{
console.log("Servidor web rodando")
})

startBot()
