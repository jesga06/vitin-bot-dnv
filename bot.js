const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys')
const pino = require('pino')
const qrcode = require('qrcode-terminal')
const http = require('http')

const logger = pino({ level: 'silent' })

const mutedUsers = new Set()

async function start(){

const { state, saveCreds } = await useMultiFileAuthState('auth_info')
const { version } = await fetchLatestBaileysVersion()

const sock = makeWASocket({
version,
logger,
auth: state,
browser: ['Ubuntu','Chrome','120']
})

sock.ev.on('creds.update', saveCreds)

sock.ev.on('connection.update',(update)=>{

const {connection, qr, lastDisconnect} = update

if(qr){
console.log('ESCANEIE O QR')
qrcode.generate(qr,{small:true})
}

if(connection==='open'){
console.log('BOT ONLINE')
}

if(connection==='close'){
if(lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut){
start()
}
}

})

sock.ev.on('messages.upsert', async ({messages})=>{

const msg = messages[0]
if(!msg.message) return
if(msg.key.fromMe) return

const from = msg.key.remoteJid
const sender = msg.key.participant || from

const text =
msg.message.conversation ||
msg.message.extendedTextMessage?.text ||
''

const isGroup = from.endsWith('@g.us')

const mentioned =
msg.message.extendedTextMessage?.contextInfo?.mentionedJid

if(mutedUsers.has(sender)){
await sock.sendMessage(from,{delete:msg.key})
return
}

if(text==='!menu'){

await sock.sendMessage(from,{
text:
`╔══════════════════╗
🤖 MENU DO BOT
╚══════════════════╝

📌 BASICO
!ola
!ping
!s / !fig

😂 BRINCADEIRAS
!beijo @membro
!casar @membro
!ship
!comer
!mata
!sexo

📊 RANK
!corno
!gay
!rankcorno
!rankgay

👮 ADMIN
!ban
!mute
!unmute

💀 EXTRA
!xingamento
!kronos`
})

}

if(text==='!ola'){
await sock.sendMessage(from,{
text:'Não posso responder agora, estou ocupado comendo o Kronos'
})
}

if(text==='!ping' && isGroup){

const group = await sock.groupMetadata(from)

const random =
group.participants[Math.floor(Math.random()*group.participants.length)].id

await sock.sendMessage(from,{
text:`🏓 Pong! @${random.split('@')[0]}`,
mentions:[random]
})

}

if((text==='!s'||text==='!fig') && msg.message.imageMessage){

const buffer = await sock.downloadMediaMessage(msg)

await sock.sendMessage(from,{
sticker:buffer
})

}

if((text==='!s'||text==='!fig') && msg.message.videoMessage){

const buffer = await sock.downloadMediaMessage(msg)

await sock.sendMessage(from,{
sticker:buffer
})

}

if(text.startsWith('!ban') && isGroup){

if(mentioned && mentioned.length>0){

if(mentioned.includes(sock.user.id)){
await sock.sendMessage(from,{text:'😎 Não posso me banir'})
return
}

await sock.groupParticipantsUpdate(from,mentioned,'remove')

await sock.sendMessage(from,{
text:'Você atrapalhou minha foda, receba a gozada divina 🍆💦'
})

}

}

if(text.startsWith('!mute') && isGroup){

if(mentioned && mentioned.length>0){

mutedUsers.add(mentioned[0])

await sock.sendMessage(from,{
text:'minha gala seca silenciou sua boca piranha >:D'
})

}

}

if(text.startsWith('!unmute') && isGroup){

if(mentioned && mentioned.length>0){

mutedUsers.delete(mentioned[0])

await sock.sendMessage(from,{
text:'🔊 Usuário desmutado.'
})

}

}

if(text==='!xingamento'){
await sock.sendMessage(from,{
text:'Kronos Kornos Cabeça de Filtro de Barro'
})
}

if(text==='!kronos'){
await sock.sendMessage(from,{
text:'Kronos mais uma vez provando que nasceu com defeito de fábrica.'
})
}

if(text.startsWith('!beijo') && isGroup){

if(mentioned && mentioned.length>0){

const p1 = sender
const p2 = mentioned[0]

await sock.sendMessage(from,{
text:`💋 @${p1.split('@')[0]} deu um beijo gostoso em @${p2.split('@')[0]}!`,
mentions:[p1,p2]
})

}

}

if(text.startsWith('!casar') && isGroup){

if(mentioned && mentioned.length>0){

const p1 = sender
const p2 = mentioned[0]

await sock.sendMessage(from,{
image:{url:'https://i.imgur.com/8QfQ9XG.png'},
caption:`💍 Parabéns!

@${p1.split('@')[0]} ❤️ @${p2.split('@')[0]}

Parabéns, vocês estão casados!`,
mentions:[p1,p2]
})

}

}

if(text==='!ship' && isGroup){

const group = await sock.groupMetadata(from)
const members = group.participants.map(p=>p.id)

const p1 = members[Math.floor(Math.random()*members.length)]
const p2 = members[Math.floor(Math.random()*members.length)]

const amor = Math.floor(Math.random()*101)

await sock.sendMessage(from,{
text:`💘 SHIP

@${p1.split('@')[0]} ❤️ @${p2.split('@')[0]}

Compatibilidade: ${amor}%`,
mentions:[p1,p2]
})

}

if(text==='!corno' && isGroup){

const group = await sock.groupMetadata(from)
const members = group.participants.map(p=>p.id)

const corno = members[Math.floor(Math.random()*members.length)]

await sock.sendMessage(from,{
text:`🐂 O maior corno do grupo é @${corno.split('@')[0]}`,
mentions:[corno]
})

}

if(text==='!gay' && isGroup){

const group = await sock.groupMetadata(from)
const members = group.participants.map(p=>p.id)

const gay = members[Math.floor(Math.random()*members.length)]
const porcent = Math.floor(Math.random()*101)

await sock.sendMessage(from,{
text:`🏳️‍🌈 @${gay.split('@')[0]} é ${porcent}% gay`,
mentions:[gay]
})

}

if(text==='!rankcorno' && isGroup){

const group = await sock.groupMetadata(from)
const members = group.participants.map(p=>p.id)

const escolhidos = members.sort(()=>0.5-Math.random()).slice(0,5)

let msgRank='🐂 RANK CORNO\n\n'

escolhidos.forEach((m,i)=>{
const porcent = Math.floor(Math.random()*101)
msgRank+=`${i+1}° @${m.split('@')[0]} - ${porcent}% corno\n`
})

await sock.sendMessage(from,{
text:msgRank,
mentions:escolhidos
})

}

if(text==='!rankgay' && isGroup){

const group = await sock.groupMetadata(from)
const members = group.participants.map(p=>p.id)

const escolhidos = members.sort(()=>0.5-Math.random()).slice(0,5)

let msgRank='🏳️‍🌈 RANK GAY\n\n'

escolhidos.forEach((m,i)=>{
const porcent = Math.floor(Math.random()*101)
msgRank+=`${i+1}° @${m.split('@')[0]} - ${porcent}% gay\n`
})

await sock.sendMessage(from,{
text:msgRank,
mentions:escolhidos
})

}

})

}

http.createServer((req,res)=>{
res.writeHead(200)
res.end('Bot rodando')
}).listen(3000,()=>{
console.log('Servidor porta 3000')
start()
})
