const {
default: makeWASocket,
useMultiFileAuthState,
fetchLatestBaileysVersion,
DisconnectReason
} = require("@whiskeysockets/baileys")

const pino = require("pino")
const qrcode = require("qrcode-terminal")
const http = require("http")

const logger = pino({ level: "silent" })

async function startBot(){

const { state, saveCreds } = await useMultiFileAuthState("./auth_info")

const { version } = await fetchLatestBaileysVersion()

const sock = makeWASocket({
version,
auth: state,
logger,
browser: ["Bot","Chrome","1.0"],
keepAliveIntervalMs: 30000
})

sock.ev.on("creds.update", saveCreds)

sock.ev.on("connection.update", (update) => {

const { connection, qr, lastDisconnect } = update

if(qr){
console.log("ESCANEIE O QR")
qrcode.generate(qr,{small:true})
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
console.log("Sessão encerrada. Delete auth_info e conecte novamente.")
}

}

})

sock.ev.on("messages.upsert", async ({ messages }) => {

try{

const msg = messages[0]
if(!msg.message) return
if(msg.key.fromMe) return

const from = msg.key.remoteJid

const text =
msg.message.conversation ||
msg.message.extendedTextMessage?.text ||
""

console.log("Mensagem:", text)

if(text === "!ping"){

await sock.sendMessage(from,{
text:"Não quero!"
})

}

if(text === "!menu"){

await sock.sendMessage(from,{
text:`🤖 MENU

!ping
!ola
!fig
!tapa
!abraco
!chute
!beijo
!casar
!ship
!corno
!gay`
})

}

if(text === "!ola"){

await sock.sendMessage(from,{
text:"Não posso responder agora, estou ocupado comendo o Kronos"
})

}

}catch(err){

console.log("Erro:", err)

}

})

}

http.createServer((req,res)=>{
res.writeHead(200)
res.end("Bot online 24h")
}).listen(3000)

startBot()
