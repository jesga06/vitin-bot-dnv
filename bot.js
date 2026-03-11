const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

const logger = pino({ level: 'info' });

async function start() {
    try {
        console.log('🚀 Iniciando Vitin...');
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
        const { version } = await fetchLatestBaileysVersion();
        console.log('📦 Versão:', version);

        const sock = makeWASocket({
            version,
            logger,
            auth: state,
            browser: ['Ubuntu', 'Chrome', '120']
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, qr, lastDisconnect } = update;
            if (qr) {
                console.log('📱 QR CODE:');
                qrcode.generate(qr, { small: true });
            }
            if (connection === 'open') {
                console.log('✅ BOT ONLINE!');
            }
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) setTimeout(start, 3000);
            }
        });

        sock.ev.on('messages.upsert', async ({ messages }) => {
            const msg = messages;
            if (!msg.message) return;
            const from = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            if (text === '!ola') {
                await sock.sendMessage(from, { text: 'Oi!' });
            }
        });

    } catch (e) {
        console.log('❌ Erro:', e.message);
        setTimeout(start, 5000);
    }
}

start();
