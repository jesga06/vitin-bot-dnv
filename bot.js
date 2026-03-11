const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys')
const pino = require('pino')
const qrcode = require('qrcode-terminal')
const http = require('http')

const logger = pino({ level: 'silent' })

const mutedUsers = new Set()

async function start() {

    const { state, saveCreds } = await useMultiFileAuthState('auth_info')
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
        version,
        logger,
        auth: state,
        browser: ['Ubuntu', 'Chrome', '120']
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (update) => {

        const { connection, qr, lastDisconnect } = update

        if (qr) {

            console.log('📱 ESCANEIE O QR')
            qrcode.generate(qr, { small: true })

        }

        if (connection === 'open') {

            console.log('✅ BOT ONLINE')
            console.log(sock.user?.id)

        }

        if (connection === 'close') {

            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {

                start()

            }

        }

    })

    sock.ev.on('messages.upsert', async ({ messages }) => {

        const msg = messages[0]

        if (!msg.message) return
        if (msg.key.fromMe) return

        const from = msg.key.remoteJid
        const sender = msg.key.participant || from

        const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            ''

        const isGroup = from.endsWith('@g.us')

        const mentioned =
            msg.message.extendedTextMessage?.contextInfo?.mentionedJid

        if (mutedUsers.has(sender)) {

            await sock.sendMessage(from, { delete: msg.key })
            return

        }

        // MENU
        if (text === '!menu') {

            await sock.sendMessage(from, {

text:
`╔══════════════════╗
      🤖 *MENU DO BOT*
╚══════════════════╝

📌 *Comandos Básicos*
┃ !ola
┃ !ping
┃ !s
┃ !menu

😂 *Brincadeiras*
┃ !beijo @membro
┃ !casar @membro
┃ !ship
┃ !comer
┃ !mata
┃ !sexo

📊 *Ranks do Grupo*
┃ !corno
┃ !gay
┃ !rankcorno
┃ !rankgay

👮 *Admin*
┃ !ban @membro
┃ !mute @membro

💀 *Extras*
┃ !xingamento
┃ !kronos

╔══════════════════╗
🤖 Bot ativo no grupo
╚══════════════════╝`

            })

        }

        // OLA
        if (text === '!ola') {

            await sock.sendMessage(from, {
                text: 'Não posso responder agora, estou ocupado comendo o Kronos'
            })

        }

        // PING (marca aleatório)
        if (text === '!ping' && isGroup) {

            const group = await sock.groupMetadata(from)

            const random =
                group.participants[Math.floor(Math.random() * group.participants.length)].id

            await sock.sendMessage(from, {

text: `🏓 Pong! @${random.split('@')[0]} foi escolhido!`,
mentions: [random]

            })

        }

        // FIGURINHA
        if ((text === '!s' || text === '!sticker') && msg.message.imageMessage) {

            const buffer = await sock.downloadMediaMessage(msg)

            await sock.sendMessage(from, {
                sticker: buffer
            })

        }

        // BAN
        if (text.startsWith('!ban') && isGroup) {

            if (mentioned && mentioned.length > 0) {

                if (mentioned.includes(sock.user.id)) {

                    await sock.sendMessage(from, {
                        text: '😎 Não posso me banir.'
                    })

                    return
                }

                await sock.groupParticipantsUpdate(from, mentioned, 'remove')

                await sock.sendMessage(from, {
                    text: 'Você atrapalhou minha foda, receba a gozada divina 🍆💦'
                })

            }

        }

        // MUTE
        if (text.startsWith('!mute') && isGroup) {

            if (mentioned && mentioned.length > 0) {

                mutedUsers.add(mentioned[0])

                await sock.sendMessage(from, {
                    text: 'minha gala seca silenciou sua boca piranha >:D'
                })

            }

        }

        // XINGAMENTO
        if (text === '!xingamento') {

            await sock.sendMessage(from, {
                text: 'Kronos Kornos Cabeça de Filtro de Barro'
            })

        }

        // KRONOS
        if (text === '!kronos') {

            await sock.sendMessage(from, {
                text: 'Kronos mais uma vez provando que nasceu com defeito de fábrica.'
            })

        }

        // BEIJO
        if (text.startsWith('!beijo') && isGroup) {

            if (mentioned && mentioned.length > 0) {

                const pessoa1 = sender
                const pessoa2 = mentioned[0]

                await sock.sendMessage(from, {

text: `💋 @${pessoa1.split('@')[0]} deu um beijo gostoso em @${pessoa2.split('@')[0]}!`,
mentions: [pessoa1, pessoa2]

                })

            }

        }

        // CASAR
        if (text.startsWith('!casar') && isGroup) {

            if (mentioned && mentioned.length > 0) {

                const pessoa1 = sender
                const pessoa2 = mentioned[0]

                await sock.sendMessage(from, {

image: { url: 'https://i.imgur.com/8QfQ9XG.png' },
caption:
`💍 Parabéns!

@${pessoa1.split('@')[0]} ❤️ @${pessoa2.split('@')[0]}

Parabéns, vocês estão casados!`,

mentions: [pessoa1, pessoa2]

                })

            }

        }

        // SHIP
        if (text === '!ship' && isGroup) {

            const group = await sock.groupMetadata(from)
            const members = group.participants.map(p => p.id)

            const p1 = members[Math.floor(Math.random() * members.length)]
            const p2 = members[Math.floor(Math.random() * members.length)]

            const amor = Math.floor(Math.random() * 101)

            await sock.sendMessage(from, {

text:
`💘 SHIP DETECTADO

@${p1.split('@')[0]} ❤️ @${p2.split('@')[0]}

Compatibilidade: ${amor}%`,

mentions: [p1, p2]

            })

        }

        // CORNO
        if (text === '!corno' && isGroup) {

            const group = await sock.groupMetadata(from)
            const members = group.participants.map(p => p.id)

            const corno = members[Math.floor(Math.random() * members.length)]

            await sock.sendMessage(from, {

text: `🐂 O maior corno do grupo é @${corno.split('@')[0]}`,
mentions: [corno]

            })

        }

        // GAY
        if (text === '!gay' && isGroup) {

            const group = await sock.groupMetadata(from)
            const members = group.participants.map(p => p.id)

            const gay = members[Math.floor(Math.random() * members.length)]
            const porcentagem = Math.floor(Math.random() * 101)

            await sock.sendMessage(from, {

text: `🏳️‍🌈 @${gay.split('@')[0]} é ${porcentagem}% gay`,
mentions: [gay]

            })

        }

        // RANK CORNO
        if (text === '!rankcorno' && isGroup) {

            const group = await sock.groupMetadata(from)
            const members = group.participants.map(p => p.id)

            const escolhidos = members.sort(() => 0.5 - Math.random()).slice(0,5)

            let msgRank = '🐂 RANK CORNO DO GRUPO\n\n'

            escolhidos.forEach((m,i)=>{

                const porcent = Math.floor(Math.random()*101)

                msgRank += `${i+1}° @${m.split('@')[0]} - ${porcent}% corno\n`

            })

            await sock.sendMessage(from,{ text: msgRank, mentions: escolhidos })

        }

        // RANK GAY
        if (text === '!rankgay' && isGroup) {

            const group = await sock.groupMetadata(from)
            const members = group.participants.map(p => p.id)

            const escolhidos = members.sort(() => 0.5 - Math.random()).slice(0,5)

            let msgRank = '🏳️‍🌈 RANK GAY DO GRUPO\n\n'

            escolhidos.forEach((m,i)=>{

                const porcent = Math.floor(Math.random()*101)

                msgRank += `${i+1}° @${m.split('@')[0]} - ${porcent}% gay\n`

            })

            await sock.sendMessage(from,{ text: msgRank, mentions: escolhidos })

        }

    })

}

http.createServer((req,res)=>{

    res.writeHead(200)
    res.end('Bot rodando')

}).listen(3000,()=>{

    console.log('Servidor rodando porta 3000')

    start()

})
