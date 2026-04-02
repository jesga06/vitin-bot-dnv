const storage = require("../storage");
const economyService = require("../services/economyService");

const APOSTA_BASE = 25; 

function getBlackjackStateKey(from) {
  return `blackjack:lobby:${from}`;
}

function getBlackjackStatsKey(sender) {
  return `blackjack:stats:${sender}`;
}

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

function getDealerTaxPercentage(playerCount) {
  if (playerCount === 4) return 0.10;
  if (playerCount === 3) return 0.075;
  if (playerCount === 2) return 0.05;
  return 0;
}

function initStats(sender) {
  const statsKey = getBlackjackStatsKey(sender);
  let stats = storage.getGameState("global", statsKey);
  if (!stats) {
    stats = {
      wins: 0,
      losses: 0,
      profit: 0
    };
    storage.setGameState("global", statsKey, stats);
  }
  return stats;
}

async function handleBlackjack({ sock, from, sender, text, prefix, cmd, cmdName, isGroup, isOverrideSender }) {
  const normalizedCmd = String(cmdName || "").toLowerCase().trim().replace(/^!+/, "");
  if (normalizedCmd !== 'blackjack' && normalizedCmd !== '21') return false;

  const numero = sender.split("@");
  const stateKey = getBlackjackStateKey(from);
  const parts = text.toLowerCase().trim().split(/\s+/);
  const acao = parts || "";
  const arg1 = parts || "";

  let lobby = storage.getGameState(from, stateKey) || {
    active: false,
    players: [],
    dealerCards: [],
    playerHands: {},
    playerBets: {},
    gameStarted: false,
    creator: null,
    isPovertyMode: false,
    multiplier: 1,
    totalPot: 0
  };

  // Menu inicial
  if (!acao) {
    const menu = `
🃏 *Blackjack (21)* 

✅ Comandos:
${prefix}21 ou ${prefix}blackjack → Mostra este menu
${prefix}21 criar → Cria um novo jogo
${prefix}21 aposta [multiplicador] → Define multiplicador
${prefix}21 entrar → Entra no jogo
${prefix}21 começar → Inicia o jogo
${prefix}21 pedir → Pede uma carta
${prefix}21 manter → Para de pedir
${prefix}21 status → Status do jogo
${prefix}21 finalizar → Finaliza e calcula prêmios
${prefix}21 perfil → Seu histórico
${prefix}21 pobreza → Modo pobreza (só override)

⚠️ Limite: 4 jogadores
💰 Aposta base: ${APOSTA_BASE} EpsteinCoins
`;
    await sock.sendMessage(from, { text: menu });
    return true;
  }

  // Perfil
  if (acao === 'perfil') {
    const stats = initStats(sender);
    const balance = economyService.getProfile(sender).coins;
    await sock.sendMessage(from, { 
      text: `📊 *Perfil do Blackjack* — @${numero}\n\n🏆 Vitórias: ${stats.wins}\n💀 Derrotas: ${stats.losses}\n💰 Lucro/Perda: ${stats.profit > 0 ? '+' : ''}${stats.profit}\n💸 Saldo: ${balance}`, 
      mentions: [sender] 
    });
    return true;
  }

  // Criar
  if (acao === 'criar') {
    if (lobby.active) {
      await sock.sendMessage(from, { text: '❌ Já existe um jogo ativo!' });
      return true;
    }
    lobby = {
      active: true,
      players: [numero],
      dealerCards: [],
      playerHands: {},
      playerBets: { [numero]: 0 },
      gameStarted: false,
      creator: numero,
      isPovertyMode: false,
      multiplier: 1,
      totalPot: 0
    };
    storage.setGameState(from, stateKey, lobby);
    await sock.sendMessage(from, { 
      text: `✅ @${numero} criou um novo jogo!\n\nUse !21 aposta [número] para definir multiplicador\nDepois !21 entrar`, 
      mentions: [sender] 
    });
    return true;
  }

  // Aposta
  if (acao === 'aposta') {
    if (!lobby.active) {
      await sock.sendMessage(from, { text: '❌ Nenhum jogo ativo!' });
      return true;
    }
    if (lobby.creator !== numero) {
      await sock.sendMessage(from, { text: '❌ Só o criador pode definir!' });
      return true;
    }
    const mult = parseInt(arg1) || 1;
    if (mult < 1 || mult > 100) {
      await sock.sendMessage(from, { text: '❌ Multiplicador entre 1-100!' });
      return true;
    }
    lobby.multiplier = mult;
    storage.setGameState(from, stateKey, lobby);
    await sock.sendMessage(from, { 
      text: `✅ Multiplicador: ${mult}x (${APOSTA_BASE * mult} moedas)`, 
      mentions: [sender] 
    });
    return true;
  }

  // Pobreza
  if (acao === 'pobreza') {
    if (!isOverrideSender) {
      await sock.sendMessage(from, { text: '❌ Só override!' });
      return true;
    }
    if (lobby.active) {
      await sock.sendMessage(from, { text: '❌ Já existe jogo!' });
      return true;
    }
    lobby = {
      active: true,
      players: [numero],
      dealerCards: [],
      playerHands: {},
      playerBets: {},
      gameStarted: false,
      creator: numero,
      isPovertyMode: true,
      multiplier: 0,
      totalPot: 0
    };
    storage.setGameState(from, stateKey, lobby);
    await sock.sendMessage(from, { 
      text: `🚫 Modo pobreza ativado!\n- Sem apostas\n- Sem ganhos\n\nUse !21 entrar`, 
      mentions: [sender] 
    });
    return true;
  }

  // Entrar
  if (acao === 'entrar') {
    if (!lobby.active) {
      await sock.sendMessage(from, { text: '❌ Nenhum jogo ativo!' });
      return true;
    }
    if (lobby.players.length >= 4) {
      await sock.sendMessage(from, { text: '❌ Lobby cheio!' });
      return true;
    }
    if (lobby.players.includes(numero)) {
      await sock.sendMessage(from, { text: '✅ Você já está!' });
      return true;
    }

    let bet = 0;
    if (!lobby.isPovertyMode) {
      bet = APOSTA_BASE * lobby.multiplier;
      const profile = economyService.getProfile(sender);
      if (profile.coins < bet) {
        await sock.sendMessage(from, { text: `❌ Moedas insuficientes! Tem: ${profile.coins}, precisa: ${bet}` });
        return true;
      }
      economyService.debitCoins(sender, bet, { type: "blackjack_buyin", group: from });
      lobby.totalPot += bet;
    }

    lobby.players.push(numero);
    lobby.playerBets[numero] = bet;
    storage.setGameState(from, stateKey, lobby);

    await sock.sendMessage(from, { 
      text: `✅ @${numero} entrou! (${lobby.players.length}/4)${!lobby.isPovertyMode ? `\nAposta: 💰 ${bet}` : ''}`, 
      mentions: [sender] 
    });
    return true;
  }

  // Começar
  if (acao === 'começar' || acao === 'comecar') {
    if (!lobby.active) {
      await sock.sendMessage(from, { text: '❌ Nenhum jogo ativo!' });
      return true;
    }
    if (lobby.players.length < 2) {
      await sock.sendMessage(from, { text: '❌ Precisa 2+ jogadores!' });
      return true;
    }
    if (lobby.gameStarted) {
      await sock.sendMessage(from, { text: '❌ Já começou!' });
      return true;
    }

    lobby.gameStarted = true;
    lobby.dealerCards = [getRandomCard(), getRandomCard()];
    for (let player of lobby.players) {
      lobby.playerHands[player] = [getRandomCard(), getRandomCard()];
    }
    storage.setGameState(from, stateKey, lobby);

    let msg = '🃏 *Blackjack começou!*\n\n';
    for (let player of lobby.players) {
      const value = getHandValue(lobby.playerHands[player]);
      const bet = lobby.playerBets[player];
      msg += `@${player}: ${formatHand(lobby.playerHands[player])} (${value})${!lobby.isPovertyMode ? ` | 💰 ${bet}` : ''}\n`;
    }
    msg += `\nDealer: ${formatHand([lobby.dealerCards])} ?`;

    await sock.sendMessage(from, { 
      text: msg, 
      mentions: lobby.players.map(p => p + '@s.whatsapp.net') 
    });
    return true;
  }

  // Pedir
  if (acao === 'pedir') {
    if (!lobby.gameStarted) {
      await sock.sendMessage(from, { text: '❌ Jogo não começou!' });
      return true;
    }
    if (!lobby.players.includes(numero)) {
      await sock.sendMessage(from, { text: '❌ Você não está no jogo!' });
      return true;
    }
    if (!lobby.playerHands[numero]) {
      await sock.sendMessage(from, { text: '❌ Você já saiu!' });
      return true;
    }

    const card = getRandomCard();
    lobby.playerHands[numero].push(card);
    const value = getHandValue(lobby.playerHands[numero]);
    storage.setGameState(from, stateKey, lobby);

    if (value > 21) {
      delete lobby.playerHands[numero];
      storage.setGameState(from, stateKey, lobby);
      const stats = initStats(sender);
      stats.losses++;
      stats.profit -= lobby.playerBets[numero];
      storage.setGameState("global", getBlackjackStatsKey(sender), stats);
      
      await sock.sendMessage(from, { 
        text: `💥 @${numero} estourou! (${value})${!lobby.isPovertyMode ? ` - Perdeu 💰 ${lobby.playerBets[numero]}` : ''}`, 
        mentions: [sender] 
      });
      return true;
    }

    await sock.sendMessage(from, { 
      text: `✅ @${numero}: ${card.rank}${card.suit} (Total: ${value})`, 
      mentions: [sender] 
    });
    return true;
  }

  // Manter
  if (acao === 'manter') {
    if (!lobby.gameStarted) {
      await sock.sendMessage(from, { text: '❌ Jogo não começou!' });
      return true;
    }
    if (!lobby.players.includes(numero)) {
      await sock.sendMessage(from, { text: '❌ Você não está no jogo!' });
      return true;
    }
    if (!lobby.playerHands[numero]) {
      await sock.sendMessage(from, { text: '❌ Você já saiu!' });
      return true;
    }

    delete lobby.playerHands[numero];
    storage.setGameState(from, stateKey, lobby);
    await sock.sendMessage(from, { 
      text: `✅ @${numero} parou!`, 
      mentions: [sender] 
    });
    return true;
  }

  // Status
  if (acao === 'status') {
    if (!lobby.active) {
      await sock.sendMessage(from, { text: '❌ Nenhum jogo ativo!' });
      return true;
    }
    let msg = '👥 *Status*\n';
    msg += `Jogadores: ${lobby.players.length}/4\n`;
    if (lobby.isPovertyMode) msg += '🚫 Modo pobreza\n';
    else msg += `💰 Mult: ${lobby.multiplier}x | Bolada: ${lobby.totalPot}\n`;
    
    for (let player of lobby.players) {
      if (lobby.playerHands[player]) {
        const value = getHandValue(lobby.playerHands[player]);
        msg += `@${player}: ${value}\n`;
      }
    }

    await sock.sendMessage(from, { 
      text: msg, 
      mentions: lobby.players.map(p => p + '@s.whatsapp.net') 
    });
    return true;
  }

  // Finalizar
  if (acao === 'finalizar') {
    if (!lobby.active || !lobby.gameStarted) {
      await sock.sendMessage(from, { text: '❌ Nenhum jogo em andamento!' });
      return true;
    }

    while (getHandValue(lobby.dealerCards) < 17) {
      lobby.dealerCards.push(getRandomCard());
    }

    const dealerValue = getHandValue(lobby.dealerCards);
    const dealerTax = Math.floor(lobby.totalPot * getDealerTaxPercentage(lobby.players.length));
    const remainingPot = lobby.totalPot - dealerTax;

    let msg = `🎰 *Resultado*\n`;
    msg += `Dealer: ${dealerValue}\n\n`;

    const playerResults = [];
    for (let player of lobby.players) {
      const playerValue = lobby.playerHands[player] ? getHandValue(lobby.playerHands[player]) : 0;
      let status = 'perdeu';
      
      if (!lobby.playerHands[player]) status = 'parou';
      else if (playerValue > 21) status = 'estourou';
      else if (dealerValue > 21 || playerValue > dealerValue) status = 'ganhou';
      else if (playerValue === dealerValue) status = 'empate';

      playerResults.push({ player, playerValue, status, bet: lobby.playerBets[player] });
    }

    const winners = playerResults.filter(r => r.status === 'ganhou');
    const ties = playerResults.filter(r => r.status === 'empate');

    if (winners.length > 0 && ties.length === 0) {
      const prize = Math.floor(remainingPot / winners.length);
      for (let w of winners) {
        if (!lobby.isPovertyMode) economyService.creditCoins(w.player + '@s.whatsapp.net', prize, { type: "blackjack_win" });
        const stats = initStats(w.player + '@s.whatsapp.net');
        stats.wins++;
        stats.profit += prize - w.bet;
        storage.setGameState("global", getBlackjackStatsKey(w.player + '@s.whatsapp.net'), stats);
        msg += `✅ @${w.player}: ${w.playerValue} - Ganhou 💰 ${prize}\n`;
      }
    } else if (ties.length > 0) {
      const prize = Math.floor(remainingPot / ties.length);
      for (let t of ties) {
        if (!lobby.isPovertyMode) economyService.creditCoins(t.player + '@s.whatsapp.net', prize, { type: "blackjack_tie" });
        const stats = initStats(t.player + '@s.whatsapp.net');
        stats.wins++;
        stats.profit += prize - t.bet;
        storage.setGameState("global", getBlackjackStatsKey(t.player + '@s.whatsapp.net'), stats);
        msg += `🤝 @${t.player}: ${t.playerValue} - Empate 💰 ${prize}\n`;
      }
    }

    for (let r of playerResults) {
      if (r.status === 'perdeu' || r.status === 'estourou' || r.status === 'parou') {
        const stats = initStats(r.player + '@s.whatsapp.net');
        stats.losses++;
        stats.profit -= r.bet;
        storage.setGameState("global", getBlackjackStatsKey(r.player + '@s.whatsapp.net'), stats);
        msg += `❌ @${r.player}: ${r.playerValue} - Perdeu\n`;
      }
    }

    if (!lobby.isPovertyMode) msg += `\n💸 Taxa: 💰 ${dealerTax}`;

    await sock.sendMessage(from, { 
      text: msg, 
      mentions: lobby.players.map(p => p + '@s.whatsapp.net') 
    });

    lobby = {
      active: false,
      players: [],
      dealerCards: [],
      playerHands: {},
      playerBets: {},
      gameStarted: false,
      creator: null,
      isPovertyMode: false,
      multiplier: 1,
      totalPot: 0
    };
    storage.setGameState(from, stateKey, lobby);
    return true;
  }

  return false;
}

module.exports = { handleBlackjack };
