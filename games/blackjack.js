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

// Calcula taxa do dealer baseado no número de jogadores
function getDealerTaxPercentage(playerCount) {
  if (playerCount === 4) return 0.10; // 10%
  if (playerCount === 3) return 0.075; // 7.5%
  if (playerCount === 2) return 0.05; // 5%
  return 0;
}

// Inicializa estatísticas do jogador
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
  // Se não for comando de blackjack, retorna false
  if (cmdName !== 'blackjack' && cmdName !== '21') return false;

  const numero = sender.split("@");
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
    totalPot: 0
  };

  // Comando !blackjack perfil ou !21 perfil
  if (cmd === 'perfil' || cmd === 'profile') {
    const stats = initStats(sender);
    const balance = economyService.getProfile(sender).coins;
    const msg = `
📊 *Perfil do Blackjack* — @${numero}

🏆 Vitórias: ${stats.wins}
💀 Derrotas: ${stats.losses}
💰 Lucro/Perda total: ${stats.profit > 0 ? '+' : ''}${stats.profit}
💸 Saldo atual: ${balance}
`;
    await sock.sendMessage(from, { text: msg, mentions: [sender] });
    return true;
  }

  // Menu inicial
  if (!cmd) {
    const menu = `
🃏 *Blackjack (21)* 

✅ Comandos:
${prefix}21 ou ${prefix}blackjack → Mostra este menu
${prefix}21 criar ou ${prefix}blackjack criar → Cria um novo jogo
${prefix}21 aposta [multiplicador] ou ${prefix}blackjack aposta [multiplicador] → Define multiplicador (só criador)
${prefix}21 entrar ou ${prefix}blackjack entrar → Entra no jogo com aposta
${prefix}21 começar ou ${prefix}blackjack começar → Inicia o jogo (2+ jogadores)
${prefix}21 pedir ou ${prefix}blackjack pedir → Pede mais uma carta
${prefix}21 manter ou ${prefix}blackjack manter → Para de pedir cartas
${prefix}21 status ou ${prefix}blackjack status → Mostra o status do jogo
${prefix}21 perfil ou ${prefix}blackjack perfil → Seu histórico de vitórias e lucros
${prefix}21 pobreza ou ${prefix}blackjack pobreza → Modo pobreza (só override) - sem apostas

⚠️ Limite: 4 jogadores por partida.
💰 Aposta base: ${APOSTA_BASE} EpsteinCoins
🎯 Blackjack (21 com 2 cartas) = Vitória automática!
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
      playerBets: { [numero]: 0 },
      gameStarted: false,
      creator: numero,
      isPovertyMode: false,
      multiplier: 1,
      totalPot: 0
    };
    storage.setGameState(from, stateKey, lobby);
    await sock.sendMessage(from, { 
      text: `✅ @${numero} criou um novo jogo de Blackjack!\n\nUse !21 aposta [multiplicador] para definir o multiplicador (padrão: 1x = ${APOSTA_BASE} moedas)\nDepois use !21 entrar para participar.`, 
      mentions: [sender] 
    });
    return true;
  }

  // Definir multiplicador de aposta (só criador do lobby)
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

    const multiplier = parseInt(cmd) || 1;
    if (multiplier < 1 || multiplier > 100) {
      await sock.sendMessage(from, { text: '❌ Multiplicador inválido! Use um valor entre 1 e 100.' });
      return true;
    }

    lobby.multiplier = multiplier;
    storage.setGameState(from, stateKey, lobby);
    const apostaPorJogador = APOSTA_BASE * multiplier;
    await sock.sendMessage(from, { 
      text: `✅ @${numero} definiu o multiplicador para *${multiplier}x*!\n\nAposta por jogador: *${apostaPorJogador}* EpsteinCoins`, 
      mentions: [sender] 
    });
    return true;
  }

  // Modo pobreza (só override)
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
      totalPot: 0
    };
    storage.setGameState(from, stateKey, lobby);
    await sock.sendMessage(from, { 
      text: `🚫 @${numero} ativou o *MODO POBREZA*!\n\nNeste modo:\n- Sem apostas\n- Sem ganhos\n- Só diversão!\n\nUse !21 entrar para participar.`, 
      mentions: [sender] 
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

    // Se não for modo pobreza, cobra a aposta
    if (!lobby.isPovertyMode) {
      bet = APOSTA_BASE * lobby.multiplier;
      const profile = economyService.getProfile(sender);
      if (profile.coins < bet) {
        await sock.sendMessage(from, { text: `❌ Você não tem moedas suficientes! Você tem: ${profile.coins}, precisa de: ${bet}` });
        return true;
      }
      // Debita a aposta
      economyService.debitCoins(sender, bet, { type: "blackjack_buyin", group: from, multiplier: lobby.multiplier });
      lobby.totalPot += bet;
    }

    lobby.players.push(numero);
    lobby.playerBets[numero] = bet;
    storage.setGameState(from, stateKey, lobby);

    const betText = lobby.isPovertyMode ? "Modo pobreza - sem aposta" : `Aposta: 💰 ${bet}`;
    await sock.sendMessage(from, { 
      text: `✅ @${numero} entrou no jogo! (${lobby.players.length}/4)\n${betText}`, 
      mentions: [sender] 
    });
    return true;
  }

  // Iniciar jogo
  if (acao === 'começar' || acao === 'comecar' || acao === 'start') {
    if (!lobby.active) {
      await sock.sendMessage(from, { text: '❌ Nenhum jogo ativo para iniciar.' });
      return true;
    }
    if (lobby.players.length < 2) {
      await sock.sendMessage(from, { text: '❌ Precisa de pelo menos 2 jogadores para começar.' });
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
    storage.setGameState(from, stateKey, lobby);

    // Verificar se alguém tem blackjack (21 com 2 cartas) - 10% de chance
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
      // Alguém tirou blackjack - fecha o lobby automaticamente
      const winnerStats = initStats(blackjackWinner + '@s.whatsapp.net');
      winnerStats.wins++;
      winnerStats.profit += lobby.totalPot - lobby.playerBets[blackjackWinner];
      storage.setGameState("global", getBlackjackStatsKey(blackjackWinner + '@s.whatsapp.net'), winnerStats);

      // Atualiza stats dos perdedores
      for (let player of lobby.players) {
        if (player !== blackjackWinner) {
          const loserStats = initStats(player + '@s.whatsapp.net');
          loserStats.losses++;
          loserStats.profit -= lobby.playerBets[player];
          storage.setGameState("global", getBlackjackStatsKey(player + '@s.whatsapp.net'), loserStats);
        }
      }

      // Credita o vencedor
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

      // Resetar lobby
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

    let msg = '🃏 *Blackjack começou!* 🃏\n\n';
    for (let player of lobby.players) {
      const hand = lobby.playerHands[player];
      const value = getHandValue(hand);
      const bet = lobby.playerBets[player];
      const betText = lobby.isPovertyMode ? "Modo pobreza" : `Aposta: 💰 ${bet}`;
      msg += `@${player}: ${formatHand(hand)} (Valor: ${value}) | ${betText}\n`;
    }
    msg += `\n Dealer: ${formatHand([lobby.dealerCards])} ?`;

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
        mentions: [sender] 
      });
      return true;
    }

    await sock.sendMessage(from, { 
      text: `✅ @${numero} pediu uma carta: ${card.rank}${card.suit} (Valor: ${value})`, 
      mentions: [sender] 
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
    storage.setGameState(from, stateKey, lobby);
    await sock.sendMessage(from, { 
      text: `✅ @${numero} parou.`, 
      mentions: [sender] 
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

  // Finalizar jogo e calcular prêmios
  if (acao === 'finalizar' || acao === 'finish' || acao === 'end') {
    if (!lobby.active) {
      await sock.sendMessage(from, { text: '❌ Nenhum jogo ativo.' });
      return true;
    }
    if (!lobby.gameStarted) {
      await sock.sendMessage(from, { text: '❌ O jogo ainda não começou.' });
      return true;
    }

    // Dealer tira cartas até 17+
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

    // Encontra vencedores e empatados
    const playerResults = [];
    for (let player of lobby.players) {
      const playerValue = lobby.playerHands[player] ? getHandValue(lobby.playerHands[player]) : 0;
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
        result.status = 'ganhou'; // Dealer estourou
      } else if (playerValue > dealerValue) {
        result.status = 'ganhou';
      } else if (playerValue === dealerValue) {
        result.status = 'empate';
      } else {
        result.status = 'perdeu';
      }

      playerResults.push(result);
    }

    // Conta vencedores e empatados
    const winners = playerResults.filter(r => r.status === 'ganhou');
    const ties = playerResults.filter(r => r.status === 'empate');

    // Distribui prêmios
    if (winners.length > 0 && ties.length === 0) {
      // Só tem vencedores
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
    } else if (ties.length > 0) {
      // Tem empates
      const prizePerTie = Math.floor(remainingPot / ties.length);
      for (let tie of ties) {
        tie.winnings = prizePerTie;
        if (!lobby.isPovertyMode) {
          economyService.creditCoins(tie.player + '@s.whatsapp.net', prizePerTie, { type: "blackjack_tie", group: from });
        }
        const stats = initStats(tie.player + '@s.whatsapp.net');
        stats.wins++;
        stats.profit += prizePerTie - tie.bet;
        storage.setGameState("global", getBlackjackStatsKey(tie.player + '@s.whatsapp.net'), stats);
      }
    }

    // Atualiza stats de perdedores
    for (let result of playerResults) {
      if (result.status === 'perdeu' || result.status === 'estourou' || result.status === 'parou') {
        const stats = initStats(result.player + '@s.whatsapp.net');
        stats.losses++;
        stats.profit -= result.bet;
        storage.setGameState("global", getBlackjackStatsKey(result.player + '@s.whatsapp.net'), stats);
      }
    }

    // Monta mensagem de resultados
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

    // Resetar lobby
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
