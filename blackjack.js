const { normalizeMentionArray, getMentionHandleFromJid } = require("./services/mentionService")
let lobby = {
    active: false,
    players: [],
    dealerCards: [],
    playerHands: {},
    gameStarted: false
};

const suits = ['♠', '♥', '♦', '♣'];
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function getRandomCard() {
    const suit = suits[Math.floor(Math.random() * suits.length)];
    const rank = ranks[Math.floor(Math.random() * ranks.length)];
    return { suit, rank };
}

function getCardValue(card) {
    if (card.rank === 'A') return 11;
    if (['J', 'Q', 'K'].includes(card.rank)) return 10;
    return parseInt(card.rank);
}

function getHandValue(hand) {
    let value = 0;
    let aces = 0;
    for (let card of hand) {
        value += getCardValue(card);
        if (card.rank === 'A') aces++;
    }
    while (value > 21 && aces > 0) {
        value -= 10;
        aces--;
    }
    return value;
}

function formatHand(hand) {
    return hand.map(c => `${c.rank}${c.suit}`).join(' ');
}

async function handleBlackjack({ sock, from, sender, text, prefix, cmd, cmdName, isGroup }) {
    // Se não é comando de blackjack, retorna false
    if (cmdName !== 'blackjack' && cmdName !== '21') return false;

    const numero = getMentionHandleFromJid(sender);

    // Menu inicial
    if (!cmd) {
        const menu = `
🃏 *Blackjack (21)* 

✅ Comandos:
${prefix}21 ou ${prefix}blackjack → Mostra este menu
${prefix}21 criar ou ${prefix}blackjack criar → Cria um novo jogo
${prefix}21 entrar ou ${prefix}blackjack entrar → Entra no jogo atual
${prefix}21 começar ou ${prefix}blackjack começar → Inicia o jogo (1+ jogadores)
${prefix}21 pedir ou ${prefix}blackjack pedir → Pede mais uma carta
${prefix}21 manter ou ${prefix}blackjack manter → Para de pedir cartas
${prefix}21 status ou ${prefix}blackjack status → Mostra o status do jogo

⚠️ Limite: 4 jogadores por partida.
`;
        await sock.sendMessage(from, { text: menu });
        return true;
    }

    const acao = cmd.toLowerCase();

    // Criar novo jogo
    if (acao === 'criar') {
        if (lobby.active) {
            await sock.sendMessage(from, { text: '❌ Já existe um jogo ativo. Use !21 entrar para participar.' });
            return true;
        }
        lobby = {
            active: true,
            players: [numero],
            dealerCards: [],
            playerHands: {},
            gameStarted: false
        };
        await sock.sendMessage(from, { 
            text: `✅ @${numero} criou um novo jogo de Blackjack! Use !21 entrar para participar.`, 
            mentions: normalizeMentionArray([sender]) 
        });
        return true;
    }

    // Entrar no jogo
    if (acao === 'entrar' || acao === 'join') {
        if (!lobby.active) {
            await sock.sendMessage(from, { text: '❌ Nenhum jogo ativo. Use !21 criar para começar.' });
            return true;
        }
        if (lobby.players.length >= 4) {
            await sock.sendMessage(from, { text: '❌ Lobby cheio! Máximo de 4 jogadores.' });
            return true;
        }
        if (lobby.players.includes(numero)) {
            await sock.sendMessage(from, { text: '✅ Você já está no jogo!' });
            return true;
        }
        lobby.players.push(numero);
        await sock.sendMessage(from, { 
            text: `✅ @${numero} entrou no jogo! (${lobby.players.length}/4)`, 
            mentions: normalizeMentionArray([sender]) 
        });
        return true;
    }

    // Iniciar jogo
    if (acao === 'começar' || acao === 'comecar' || acao === 'start') {
        if (!lobby.active) {
            await sock.sendMessage(from, { text: '❌ Nenhum jogo ativo para iniciar.' });
            return true;
        }
        if (lobby.players.length < 1) {
            await sock.sendMessage(from, { text: '❌ Precisa de pelo menos 1 jogador para começar.' });
            return true;
        }
        if (lobby.gameStarted) {
            await sock.sendMessage(from, { text: '❌ O jogo já começou!' });
            return true;
        }

        lobby.gameStarted = true;
        lobby.dealerCards = [getRandomCard(), getRandomCard()];
        for (let player of lobby.players) {
            lobby.playerHands[player] = [getRandomCard(), getRandomCard()];
        }

        let msg = '🃏 *Blackjack começou!* 🃏\n\n';
        for (let player of lobby.players) {
            const hand = lobby.playerHands[player];
            const value = getHandValue(hand);
            msg += `@${player}: ${formatHand(hand)} (Valor: ${value})\n`;
        }
        msg += `\n Dealers: ${formatHand([lobby.dealerCards])} ?`;

        await sock.sendMessage(from, { 
            text: msg, 
            mentions: lobby.players.map(p => p + '@s.whatsapp.net') 
        });
        return true;
    }

    // Pedir carta
    if (acao === 'pedir' || acao === 'hit') {
        if (!lobby.gameStarted) {
            await sock.sendMessage(from, { text: '❌ O jogo ainda não começou.' });
            return true;
        }
        if (!lobby.players.includes(numero)) {
            await sock.sendMessage(from, { text: '❌ Você não está no jogo.' });
            return true;
        }
        if (!lobby.playerHands[numero]) {
            await sock.sendMessage(from, { text: '❌ Você já está fora do jogo.' });
            return true;
        }

        const card = getRandomCard();
        lobby.playerHands[numero].push(card);
        const value = getHandValue(lobby.playerHands[numero]);

        if (value > 21) {
            delete lobby.playerHands[numero];
            await sock.sendMessage(from, { 
                text: `💥 @${numero} estourou! (Valor: ${value})`, 
                mentions: normalizeMentionArray([sender]) 
            });
            return true;
        }

        await sock.sendMessage(from, { 
            text: `✅ @${numero} pediu uma carta: ${card.rank}${card.suit} (Valor: ${value})`, 
            mentions: normalizeMentionArray([sender]) 
        });
        return true;
    }

    // Manter (parar)
    if (acao === 'manter' || acao === 'stand' || acao === 'parar') {
        if (!lobby.gameStarted) {
            await sock.sendMessage(from, { text: '❌ O jogo ainda não começou.' });
            return true;
        }
        if (!lobby.players.includes(numero)) {
            await sock.sendMessage(from, { text: '❌ Você não está no jogo.' });
            return true;
        }
        if (!lobby.playerHands[numero]) {
            await sock.sendMessage(from, { text: '❌ Você já está fora do jogo.' });
            return true;
        }

        delete lobby.playerHands[numero];
        await sock.sendMessage(from, { 
            text: `✅ @${numero} parou.`, 
            mentions: normalizeMentionArray([sender]) 
        });
        return true;
    }

    // Status
    if (acao === 'status' || acao === 'placar') {
        if (!lobby.active) {
            await sock.sendMessage(from, { text: '❌ Nenhum jogo ativo.' });
            return true;
        }
        let msg = '👥 *Lobby Blackjack*\n';
        msg += `Jogadores: ${lobby.players.length}/4\n`;
        if (lobby.gameStarted) {
            msg += '🎮 Jogo em andamento!\n';
            for (let player of lobby.players) {
                if (lobby.playerHands[player]) {
                    const value = getHandValue(lobby.playerHands[player]);
                    msg += `@${player}: ${formatHand(lobby.playerHands[player])} (${value})\n`;
                }
            }
        } else {
            msg += '⏳ Aguardando jogadores...\n';
            for (let player of lobby.players) {
                msg += `@${player}\n`;
            }
        }
        await sock.sendMessage(from, { 
            text: msg, 
            mentions: lobby.players.map(p => p + '@s.whatsapp.net') 
        });
        return true;
    }

    return false;
}

module.exports = { handleBlackjack };
