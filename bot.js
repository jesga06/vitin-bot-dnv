const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode');

const logger = pino({ level: 'fatal' });

async function start() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger,
            auth: state,
            browser: ['Ubuntu', 'Chrome', '120'],
            syncFullHistory: false
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, qr, lastDisconnect } = update;
            if (qr) {
                qrcode.toFile('qr.png', qr, { width: 300 }, () => {
                    console.log('✅ QR gerado. Escaneie em 10 segundos...');
                    setTimeout(() => {
                        console.log('⏳ QR ainda disponível...');
                    }, 5000);
                });
            }
            if (connection === 'open') {
                console.log('✅ BOT ONLINE!');
            }
            if (connection === 'close') {
                if ((lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut) {
                    setTimeout(start, 3000);
                }
            }
        });

        sock.ev.on('messages.upsert', async ({ messages }) => {
            const msg = messages;
            if (!msg.message) return;
            const from = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            const isGroup = from.endsWith('@g.us');

            if (text === '!ola') {
                await sock.sendMessage(from, { text: 'Não posso responder agora, estou ocupado comendo o Kronos' });
            }

            if ((text === '!s' || text === '!sticker') && (msg.message.imageMessage || msg.message.videoMessage)) {
                const media = await sock.downloadMediaMessage(msg.message);
                await sock.sendMessage(from, { sticker: media });
            }

            if (text?.startsWith('!ban ') && isGroup) {
                const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid;
                if (mentioned && mentioned.length > 0) {
                    await sock.groupParticipantsUpdate(from, mentioned, 'remove');
                    await sock.sendMessage(from, { text: 'Você atrapalhou minha foda, receba a gozada divina 🍆💦' });
                }
            }
        });

    } catch (e) {
        setTimeout(start, 5000);
    }
}

// Delay para dar tempo de escanear
setTimeout(() => {
    console.log('⏳ Bot iniciando em 5 segundos...');
    start();
}, 5000);
