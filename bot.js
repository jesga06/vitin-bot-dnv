const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys')
const pino = require('pino')
const qrcode = require('qrcode-terminal')
const http = require('http')

const logger = pino({ level: 'silent' })

async function start() {
    try {

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
                console.log('\n📱 ESCANEIE O QR CODE:\n')
                qrcode.generate(qr, { small: true })
            }

            if (connection === 'open') {
                console.log('✅ BOT ONLINE!')
                console.log('👤 Conectado como:', sock.user.id)
            }

            if (connection === 'close') {

                const shouldReconnect =
                    lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut

                console.log('❌ Conexão fechada')

                if (shouldReconnect) {
                    console.log('🔄 Reconectando...')
                    start()
                } else {
                    console.log('⚠️ Sessão encerrada')
                }

            }

        })

        sock.ev.on('messages.upsert', async ({ messages }) => {

            const msg = messages[0]

            if (!msg.message) return
            if (msg.key.fromMe) return

            const from = msg.key.remoteJid

            const text =
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                ''

            console.log('📩 Mensagem recebida:', text)

            // comando !ola
            if (text === '!ola') {

                await sock.sendMessage(from, {
                    text: 'Olá! O bot está funcionando 🤖'
                })

            }

            // comando sticker
            if ((text === '!s' || text === '!sticker') && msg.message.imageMessage) {

                const media = await sock.downloadMediaMessage(msg)

                await sock.sendMessage(from, {
                    sticker: media
                })

            }

            // comando ban
            if (text.startsWith('!ban') && from.endsWith('@g.us')) {

                const mentioned =
                    msg.message.extendedTextMessage?.contextInfo?.mentionedJid

                if (mentioned && mentioned.length > 0) {

                    await sock.groupParticipantsUpdate(
                        from,
                        mentioned,
                        'remove'
                    )

                    await sock.sendMessage(from, {
                        text: 'Usuário removido do grupo.'
                    })

                }

            }

        })

    } catch (err) {

        console.log('Erro:', err)

        setTimeout(() => {
            start()
        }, 5000)

    }

}

// servidor HTTP (Render precisa disso)
http.createServer((req, res) => {

    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('Bot rodando')

}).listen(3000, () => {

    console.log('🌐 Servidor rodando na porta 3000')

    start()

})
