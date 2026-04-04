const { normalizeMentionArray } = require("../services/mentionService")
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
  if (normalizedCmd !== 'blackjack' && normalizedCmd !== '21' && normalizedCmd !== 'bj') return false;

const numero = String(sender || "").split("@");
const textParts = String(text || "").trim().split(/\s+/).filter(Boolean);
const acao = String(textParts || "").toLowerCase();

  const stateKey = getBlackjackStateKey(from);
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
    totalPot: 0,
    playersStanding: []
  };

  // Menu 
  if (!acao) {
    const menu = `
🎰 ════『 🃏 BLACKJACK / 21 』════ 🎰

━━━━━━━━━━━━━━━━━━
🎮 COMANDOS PRINCIPAIS
━━━━━━━━━━━━━━━━━━

🆕 !21 criar
➥ Cria uma nova mesa

➕ !21 entrar
➥ Entra na partida

🚀 !21 começar
➥ Inicia o jogo

📊 !21 status
➥ Ver jogadores e andamento

🏁 !21 finalizar
➥ Finaliza e revela resultados

━━━━━━━━━━━━━━━━━━
🃏 AÇÕES DURANTE O JOGO
━━━━━━━━━━━━━━━━━━

🂡 !21 pedir
➥ Comprar mais uma carta

✋ !21 manter
➥ Parar e segurar sua mão

━━━━━━━━━━━━━━━━━━
💰 SISTEMA DE APOSTAS
━━━━━━━━━━━━━━━━━━

💸 !21 aposta [x]
➥ Define multiplicador (criador)

💵 Aposta base: 25 coins
📈 Multiplicador: 1x até 100x

🏆 Blackjack (21 com 2 cartas)
➥ Vitória automática + prêmio total

━━━━━━━━━━━━━━━━━━
📊 PERFIL & PROGRESSO
━━━━━━━━━━━━━━━━━━

👤 !21 perfil
➥ Suas estatísticas

🏆 Vitórias | 💀 Derrotas | 💰 Lucro

━━━━━━━━━━━━━━━━━━
⚙️ MODOS ESPECIAIS
━━━━━━━━━━━━━━━━━━

🚫 !21 pobreza (override)
➥ Sem apostas
➥ Sem perdas
➥ Apenas diversão

━━━━━━━━━━━━━━━━━━
⚠️ REGRAS
━━━━━━━━━━━━━━━━━━

👥 Máximo: 4 jogadores
🎯 Estourou > 21 = perdeu
🤝 Empate divide prêmio
🏦 Dealer cobra taxa da mesa
`;
    await sock.sendMessage(from, { text: menu });
    return true;
  }

  // Comando perfil
  if (acao === 'perfil' || acao === 'profile') {
    const stats = initStats(sender);
    const balance = economyService.getProfile(sender).coins;
    const msg = `
📊 *Perfil do Blackjack* — @${numero}

🏆 Vitórias: ${stats.wins}
💀 Derrotas: ${stats.losses}
💰 Lucro/Perda total: ${stats.profit > 0 ? '+' : ''}${stats.profit}
💸 Saldo atual: ${balance}
`;
    await sock.sendMessage(from, { text: msg, mentions: normalizeMentionArray([sender]) });
    return true;
  }

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
      playerBets: { [numero]: 0 },
      gameStarted: false,
      creator: numero,
      isPovertyMode: false,
      multiplier: 1,
      totalPot: 0,
      playersStanding: []
    };
    storage.setGameState(from, stateKey, lobby);
    await sock.sendMessage(from, { 
      text: `✅ @${numero} criou um novo jogo de Blackjack!\n\nUse !21 aposta [multiplicador] para definir o multiplicador (padrão: 1x = ${APOSTA_BASE} moedas)\nDepois use !21 entrar para participar.`, 
      mentions: normalizeMentionArray([sender]) 
    });
    return true;
  }

  // Definir multiplicador de aposta
  if (acao === 'aposta') {
    if (!lobby.active) {
      await sock.sendMessage(from, { text: '❌ Nenhum jogo ativo. Use !21 criar para começar.' });
      return true;
    }
    if (lobby.creator !== numero) {
      await sock.sendMessage(from, { text: '❌ Só o criador da sala pode definir o multiplicador de aposta!' });
      return true;
    }
    if (lobby.gameStarted) {
      await sock.sendMessage(from, { text: '❌ O jogo já começou! Não é possível alterar a aposta.' });
      return true;
    }
    if (lobby.isPovertyMode) {
      await sock.sendMessage(from, { text: '❌ Modo pobreza ativado! Multiplicador de aposta é ignorado.' });
      return true;
    }

    const multiplier = Number.parseInt(String(textParts || ""), 10) || 1;
    if (multiplier < 1 || multiplier > 100) {
      await sock.sendMessage(from, { text: '❌ Multiplicador inválido! Use um valor entre 1 e 100.' });
      return true;
    }

    lobby.multiplier = multiplier;
    storage.setGameState(from, stateKey, lobby);
    const apostaPorJogador = APOSTA_BASE * multiplier;
    await sock.sendMessage(from, { 
      text: `✅ @${numero} definiu o multiplicador para *${multiplier}x*!\n\nAposta por jogador: *${apostaPorJogador}* EpsteinCoins`, 
      mentions: normalizeMentionArray([sender]) 
    });
    return true;
  }

  // Modo pobreza
  if (acao === 'pobreza') {
    if (!isOverrideSender) {
      await sock.sendMessage(from, { text: '❌ Só os overrides (VITIN e JESSE) podem ativar o modo pobreza!' });
      return true;
    }
    if (lobby.active) {
      await sock.sendMessage(from, { text: '❌ Já existe um jogo ativo. Finalize antes de criar um novo.' });
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
      totalPot: 0,
      playersStanding: []
    };
    storage.setGameState(from, stateKey, lobby);
    await sock.sendMessage(from, { 
      text: `🚫 @${numero} ativou o *MODO POBREZA*!\n\nNeste modo:\n- Sem apostas\n- Sem ganhos\n- Só diversão!\n\nUse !21 entrar para participar.`, 
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

    let bet = 0;

    if (!lobby.isPovertyMode) {
      bet = APOSTA_BASE * lobby.multiplier;
      const profile = economyService.getProfile(sender);
      if (profile.coins < bet) {
        await sock.sendMessage(from, { text: `❌ Você não tem moedas suficientes! Você tem: ${profile.coins}, precisa de: ${bet}` });
        return true;
      }
      economyService.debitCoins(sender, bet, { type: "blackjack_buyin", group: from, multiplier: lobby.multiplier });
      lobby.totalPot += bet;
    }

    lobby.players.push(numero);
    lobby.playerBets[numero] = bet;
    storage.setGameState(from, stateKey, lobby);

    const betText = lobby.isPovertyMode ? "Modo pobreza - sem aposta" : `Aposta: 💰 ${bet}`;
    await sock.sendMessage(from, { 
      text: `✅ @${numero} entrou no jogo! (${lobby.players.length}/4)\n${betText}`, 
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
    lobby.playersStanding = [];
    lobby.dealerCards = [getRandomCard(), getRandomCard()];
    for (let player of lobby.players) {
      lobby.playerHands[player] = [getRandomCard(), getRandomCard()];
    }
    storage.setGameState(from, stateKey, lobby);

    const blackjackChance = Math.random() < 0.10;
    let blackjackWinner = null;

    if (blackjackChance) {
      for (let player of lobby.players) {
        if (getHandValue(lobby.playerHands[player]) === 21) {
          blackjackWinner = player;
          break;
        }
      }
    }

    if (blackjackWinner) {
      const winnerStats = initStats(blackjackWinner + '@s.whatsapp.net');
      winnerStats.wins++;
      winnerStats.profit += lobby.totalPot - lobby.playerBets[blackjackWinner];
      storage.setGameState("global", getBlackjackStatsKey(blackjackWinner + '@s.whatsapp.net'), winnerStats);

      for (let player of lobby.players) {
        if (player !== blackjackWinner) {
          const loserStats = initStats(player + '@s.whatsapp.net');
          loserStats.losses++;
          loserStats.profit -= lobby.playerBets[player];
          storage.setGameState("global", getBlackjackStatsKey(player + '@s.whatsapp.net'), loserStats);
        }
      }

      if (!lobby.isPovertyMode) {
        economyService.creditCoins(blackjackWinner + '@s.whatsapp.net', lobby.totalPot, { type: "blackjack_blackjack_win", group: from });
      }

      let msg = `🎯 *BLACKJACK!* 🎯\n\n`;
      msg += `@${blackjackWinner} tirou 21 com as 2 primeiras cartas!\n\n`;
      msg += `${formatHand(lobby.playerHands[blackjackWinner])}\n\n`;
      if (!lobby.isPovertyMode) {
        msg += `💰 @${blackjackWinner} ganhou toda a bolada: *${lobby.totalPot}* EpsteinCoins!\n\n`;
      } else {
        msg += `🎉 @${blackjackWinner} ganhou a mão!\n\n`;
      }
      msg += `Lobby fechado automaticamente.`;

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
        totalPot: 0,
        playersStanding: []
      };
      storage.setGameState(from, stateKey, lobby);
      return true;
    }

    let msg = '🃏 *Blackjack começou!* 🃏\n\n';
    for (let player of lobby.players) {
      const hand = lobby.playerHands[player];
      const value = getHandValue(hand);
      const bet = lobby.playerBets[player];
      const betText = lobby.isPovertyMode ? "Modo pobreza" : `Aposta: 💰 ${bet}`;
      msg += `@${player}: ${formatHand(hand)} (Valor: ${value}) | ${betText}\n`;
    }
    msg += `\nDealer: ${formatHand([lobby.dealerCards])} ?`;

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
    storage.setGameState(from, stateKey, lobby);

    if (value > 21) {
      delete lobby.playerHands[numero];
      storage.setGameState(from, stateKey, lobby);
      const stats = initStats(sender);
      stats.losses++;
      if (!lobby.isPovertyMode) {
        stats.profit -= lobby.playerBets[numero];
      }
      storage.setGameState("global", getBlackjackStatsKey(sender), stats);
      
      await sock.sendMessage(from, { 
        text: `💥 @${numero} estourou! (Valor: ${value})${!lobby.isPovertyMode ? ` — Perdeu sua aposta de 💰 ${lobby.playerBets[numero]}` : ''}`, 
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
// Manter
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

    // Adiciona jogador à lista de quem manteve
    if (!lobby.playersStanding.includes(numero)) {
      lobby.playersStanding.push(numero);
    }

    delete lobby.playerHands[numero];
    storage.setGameState(from, stateKey, lobby);

    await sock.sendMessage(from, { 
      text: `✅ @${numero} parou.`, 
      mentions: normalizeMentionArray([sender]) 
    });

    // Verifica se todos os jogadores mantiveram
    if (lobby.playersStanding.length === lobby.players.length) {
      // Todos mantiveram — finaliza automaticamente
      await sock.sendMessage(from, { 
        text: `🎲 Todos mantiveram! Dealer está virando as cartas...`, 
        mentions: lobby.players.map(p => p + '@s.whatsapp.net') 
      });

      // Finaliza o jogo automaticamente
      await handleFinalizarGame({ sock, from, sender, lobby, stateKey, storage, economyService, APOSTA_BASE, getHandValue, formatHand, getDealerTaxPercentage, initStats, getRandomCard });
    }

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
    if (lobby.isPovertyMode) {
      msg += '🚫 Modo pobreza ativado\n';
    } else {
      msg += `💰 Multiplicador: ${lobby.multiplier}x (${APOSTA_BASE * lobby.multiplier} moedas/jogador)\n`;
      msg += `💵 Bolada total: ${lobby.totalPot}\n`;
    }
    if (lobby.gameStarted) {
      msg += '🎮 Jogo em andamento!\n';
      for (let player of lobby.players) {
        if (lobby.playerHands[player]) {
          const value = getHandValue(lobby.playerHands[player]);
          const bet = lobby.playerBets[player];
          const betText = lobby.isPovertyMode ? "" : ` | Aposta: 💰 ${bet}`;
          msg += `@${player}: ${formatHand(lobby.playerHands[player])} (${value})${betText}\n`;
        }
      }
    } else {
      msg += '⏳ Aguardando jogadores...\n';
      for (let player of lobby.players) {
        const bet = lobby.playerBets[player];
        const betText = lobby.isPovertyMode ? "" : ` | Aposta: 💰 ${bet}`;
        msg += `@${player}${betText}\n`;
      }
    }
    await sock.sendMessage(from, { 
      text: msg, 
      mentions: lobby.players.map(p => p + '@s.whatsapp.net') 
    });
    return true;
  }

  // Finalizar
  if (acao === 'finalizar' || acao === 'finish' || acao === 'end') {
    if (!lobby.active) {
      await sock.sendMessage(from, { text: '❌ Nenhum jogo ativo.' });
      return true;
    }
    if (!lobby.gameStarted) {
      await sock.sendMessage(from, { text: '❌ O jogo ainda não começou.' });
      return true;
    }

    await handleFinalizarGame({ sock, from, sender, lobby, stateKey, storage, economyService, APOSTA_BASE, getHandValue, formatHand, getDealerTaxPercentage, initStats, getRandomCard });

    return true;
  }

  return false;
}

// Função auxiliar para finalizar o jogo
async function handleFinalizarGame({ sock, from, sender, lobby, stateKey, storage, economyService, APOSTA_BASE, getHandValue, formatHand, getDealerTaxPercentage, initStats, getRandomCard }) {
  // Dealer puxa cartas até 17
  while (getHandValue(lobby.dealerCards) < 17) {
    lobby.dealerCards.push(getRandomCard());
  }

  const dealerValue = getHandValue(lobby.dealerCards);
  const dealerTaxPercentage = getDealerTaxPercentage(lobby.players.length);
  const dealerTax = Math.floor(lobby.totalPot * dealerTaxPercentage);
  const remainingPot = lobby.totalPot - dealerTax;

  let msg = `🎰 *Resultado Final do Blackjack* 🎰\n\n`;
  msg += `Dealer: ${formatHand(lobby.dealerCards)} (Valor: ${dealerValue})\n`;
  msg += `💰 Bolada: ${lobby.totalPot} | Taxa do dealer: ${dealerTax} (${(dealerTaxPercentage * 100).toFixed(1)}%)\n\n`;

  const playerResults = [];
  for (let player of lobby.players) {
    const playerValue = getHandValue(lobby.playerHands[player] || []);
    const bet = lobby.playerBets[player];

    let result = {
      player,
      playerValue,
      bet,
      status: null,
      winnings: 0
    };

    if (!lobby.playerHands[player]) {
      result.status = 'parou';
    } else if (playerValue > 21) {
      result.status = 'estourou';
    } else if (dealerValue > 21) {
      result.status = 'ganhou';
    } else if (playerValue > dealerValue) {
      result.status = 'ganhou';
    } else if (playerValue === dealerValue) {
      result.status = 'empate';
    } else {
      result.status = 'perdeu';
    }

    playerResults.push(result);
  }

  // Lógica de vitória: quem tem 21 ganha, senão quem está mais próximo de 21 (abaixo de 21)
  const validPlayers = playerResults.filter(r => r.playerValue <= 21);
  if (validPlayers.length > 0) {
    const maxValidValue = Math.max(...validPlayers.map(r => r.playerValue));
    const winners = validPlayers.filter(r => r.playerValue === maxValidValue);

    if (winners.length > 0) {
      const prizePerWinner = Math.floor(remainingPot / winners.length);
      for (let winner of winners) {
        winner.winnings = prizePerWinner;
        if (!lobby.isPovertyMode) {
          economyService.creditCoins(winner.player + '@s.whatsapp.net', prizePerWinner, { type: "blackjack_win", group: from });
        }
        const stats = initStats(winner.player + '@s.whatsapp.net');
        stats.wins++;
        stats.profit += prizePerWinner - winner.bet;
        storage.setGameState("global", getBlackjackStatsKey(winner.player + '@s.whatsapp.net'), stats);
      }
    }
  }

  // Processa perdedores
  for (let result of playerResults) {
    if (result.status === 'perdeu' || result.status === 'estourou' || result.status === 'parou') {
      const stats = initStats(result.player + '@s.whatsapp.net');
      stats.losses++;
      stats.profit -= result.bet;
      storage.setGameState("global", getBlackjackStatsKey(result.player + '@s.whatsapp.net'), stats);
    }
  }

  // Monta mensagem final
  for (let result of playerResults) {
    if (result.status === 'ganhou') {
      msg += `✅ @${result.player}: ${result.playerValue} (Ganhou 💰 ${result.winnings}!)\n`;
    } else if (result.status === 'empate') {
      msg += `🤝 @${result.player}: ${result.playerValue} (Empate! Recebeu 💰 ${result.winnings})\n`;
    } else if (result.status === 'estourou') {
      msg += `💥 @${result.player}: ${result.playerValue} (Estourou! Perdeu 💰 ${result.bet})\n`;
    } else if (result.status === 'parou') {
      msg += `❌ @${result.player}: ${result.playerValue} (Perdeu 💰 ${result.bet})\n`;
    } else {
      msg += `❌ @${result.player}: ${result.playerValue} (Perdeu 💰 ${result.bet})\n`;
    }
  }

  if (!lobby.isPovertyMode) {
    msg += `\n💸 Taxa do dealer: 💰 ${dealerTax}`;
  }

  await sock.sendMessage(from, { 
    text: msg, 
    mentions: lobby.players.map(p => p + '@s.whatsapp.net') 
  });

  // Reseta o lobby
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
    totalPot: 0,
    playersStanding: []
  };
  storage.setGameState(from, stateKey, lobby);
}

module.exports = { handleBlackjack };
