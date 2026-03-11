const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');

const logger = pino({ level: 'error' });
const QR_PATH = 'qr.png';

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
                qrcode.toFile(QR_PATH, qr, { width: 300 }, () => {
                    console.log('✅ QR salvo');
                });
            }
            
            if (connection === 'open') {
                console.log('✅ BOT ONLINE');
            }
            
            if (connection === 'close') {
                if ((lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut) {
                    setTimeout(start, 3000);
                }
            }
        });

        sock.ev.on('messages.upsert', async ({ messages }) => {
            for (const msg of messages) {
                if (!msg.message) return;

                const from = msg.key.remoteJid;
                const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
                const isGroup = from.endsWith('@g.us');

                try {
                    // ✅ Comando: !ola
                    if (text === '!ola') {
                        await sock.sendMessage(from, { text: 'Não posso responder agora, estou ocupado comendo o Kronos' });
                        return;
                    }

                    // ✅ Comando: !s ou !sticker
                    if ((text === '!s' || text === '!sticker') && (msg.message.imageMessage || msg.message.videoMessage)) {
                        await sock.sendMessage(from, { text: 'Estou terminando de comer o Kronos, aguarde um momento' });
                        const media = await sock.downloadMediaMessage(msg.message);
                        await sock.sendMessage(from, { sticker: media });
                        return;
                    }

                    // ✅ Comando: !ban @nome
                    if (text?.startsWith('!ban ') && isGroup) {
                        const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid;
                        if (mentioned && mentioned.length > 0) {
                            try {
                                await sock.groupParticipantsUpdate(from, mentioned, 'remove');
                                await sock.sendMessage(from, { text: 'Você atrapalhou minha foda, receba a gozada divina 🍆💦' });
                            } catch (e) {
                                await sock.sendMessage(from, { text: 'Erro ao banir. Talvez eu não seja admin?' });
                            }
                        }
                        return;
                    }

                } catch (e) {
                    console.log('❌ Erro ao processar mensagem:', e.message);
                }
            }
        });

    } catch (e) {
        console.log('❌ Erro ao iniciar:', e.message);
        setTimeout(start, 5000);
    }
}

start();
