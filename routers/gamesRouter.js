const telemetry = require("../services/telemetryService")
const storageModule = require("../storage.js")
const RR_TURN_TIMEOUT_MS = 60_000
const RR_TURN_TIMEOUT_SECONDS = Math.floor(RR_TURN_TIMEOUT_MS / 1000)
const LOBBY_BET_GRACE_MS = 10_000
const GAME_XP_REWARDS = {
  lobbyStart: 6,
  batataWin: 24,
  batataLoss: 10,
  guessExact: 35,
  guessClosest: 20,
  guessLoss: 8,
  dadosWin: 28,
  dadosLoss: 10,
  rrSurviveShot: 6,
  rrWin: 30,
  rrLoss: 12,
}
const rrTurnTimeouts = new Map()

function rrTurnTimerKey(groupId, lobbyId) {
  return `${groupId}::${lobbyId}`
}

function clearRrTurnTimeout(groupId, lobbyId) {
  const key = rrTurnTimerKey(groupId, lobbyId)
  const timerId = rrTurnTimeouts.get(key)
  if (timerId) {
    clearTimeout(timerId)
    rrTurnTimeouts.delete(key)
  }
}

async function handleGameCommands(ctx) {
  const {
    sock,
    from,
    sender,
    cmd,
    cmdName,
    cmdArg1,
    cmdArg2,
    mentioned,
    prefix,
    isGroup,
    text,
    msg,
    storage = storageModule,
    gameManager,
    economyService,
    caraOuCoroa,
    adivinhacao,
    batataquente,
    dueloDados,
    roletaRussa,
    startPeriodicGame,
    GAME_REWARDS,
    BASE_GAME_REWARD,
    normalizeUnifiedGameType,
    normalizeLobbyId,
    activeGameKey,
    resolveActiveLobbyForPlayer,
    getLobbyCreateBlockMessage,
    getGameBuyIn,
    collectLobbyBuyIn,
    distributeLobbyBuyInPool,
    parsePositiveInt,
    isResenhaModeEnabled,
    rewardPlayer,
    rewardPlayers,
    incrementUserStat,
    applyRandomGamePunishment,
    createPendingTargetForWinner,
    jidNormalizedUser,
    createLobbyWarningCallback,
    createLobbyTimeoutCallback,
    buildGameStatsText,
  } = ctx

  const isJoinCommand = cmdName === prefix + "entrar" || cmdName === prefix + "join"
  const isStartCommand = (
    cmdName === prefix + "começar" ||
    cmdName === prefix + "comecar" ||
    cmdName === prefix + "start"
  )
  const normalizedStartTarget = normalizeUnifiedGameType(cmdArg1)
  const isQuickGameStartTarget = ["embaralhado", "memoria", "memória", "reacao", "reação", "comando"].includes(normalizedStartTarget)

  async function getCommandParticipants() {
    const metadata = await sock.groupMetadata(from)
    const botJid = jidNormalizedUser(sock.user?.id || "")
    return (metadata?.participants || [])
      .map((p) => jidNormalizedUser(p.id))
      .filter((id) => id && id !== botJid)
  }

  function buildBetMultiplierMap(playerIds, multiplier) {
    const safeMultiplier = parsePositiveInt(multiplier, 1)
    return (playerIds || []).reduce((acc, playerId) => {
      acc[playerId] = safeMultiplier
      return acc
    }, {})
  }

  function getLobbyGraceStateKey(lobbyId) {
    return `lobbyGrace:${lobbyId}`
  }

  function sanitizeLobbyBet(value, fallback = 1) {
    const parsed = parsePositiveInt(value, fallback)
    return Math.max(1, Math.min(10, parsed))
  }

  function resolvePunishmentSeverityFromLoserBet(state, playerId, fallbackSeverity = 1) {
    const nativeSeverity = sanitizeLobbyBet(fallbackSeverity, 1)
    const betByPlayer = state?.playerBetByPlayer
    if (!betByPlayer || typeof betByPlayer !== "object") return nativeSeverity
    if (!Object.prototype.hasOwnProperty.call(betByPlayer, playerId)) return nativeSeverity
    return sanitizeLobbyBet(betByPlayer[playerId], nativeSeverity)
  }

  function grantGameXp(userId, xpAmount, source = "game", meta = {}) {
    const safeXp = Math.max(0, Math.floor(Number(xpAmount) || 0))
    if (!safeXp) return
    if (typeof economyService?.addXp !== "function") return
    economyService.addXp(userId, safeXp, {
      source,
      ...meta,
    })
  }

  function consumeRrLuckTokenOnWin(winnerIds = [], options = {}) {
    const uniqueWinners = [...new Set((winnerIds || []).filter(Boolean))]
    const consumedBy = []
    if (uniqueWinners.length === 0) return consumedBy
    if (typeof economyService?.getItemQuantity !== "function") return consumedBy
    if (typeof economyService?.removeItem !== "function") return consumedBy

    const reason = String(options?.reason || "rr-win")
    for (const winnerId of uniqueWinners) {
      const qty = economyService.getItemQuantity(winnerId, "rrtokensorte")
      if (qty <= 0) continue
      economyService.removeItem(winnerId, "rrtokensorte", 1)
      consumedBy.push(winnerId)
      telemetry.appendEvent("game.rr.token.consume", {
        groupId: from,
        lobbyId: options?.lobbyId || null,
        userId: winnerId,
        reason,
      })
    }

    return consumedBy
  }

  function getGraceStates() {
    const states = storage.getGameStates(from)
    return Object.keys(states || {})
      .filter((key) => key.startsWith("lobbyGrace:"))
      .map((key) => ({ key, state: states[key], lobbyId: key.substring("lobbyGrace:".length) }))
      .filter((entry) => entry.state && entry.lobbyId)
  }

  function collectLobbyBuyInWithBets(playerIds, buyInAmount, gameType, playerBetByPlayer = {}) {
    if (!Array.isArray(playerIds) || playerIds.length === 0) {
      return { ok: true, pool: 0, buyInByPlayer: {}, playerBetByPlayer: {} }
    }
    // Exclude modo livre users from paying buy-in (except for casino)
    const isCasino = String(gameType || "").toLowerCase().includes("cassino")
    const filteredPlayers = isCasino ? playerIds : playerIds.filter((id) => !storage.isModoLivreUser(id))
    if (buyInAmount <= 0) {
      const normalizedBets = filteredPlayers.reduce((acc, playerId) => {
        acc[playerId] = sanitizeLobbyBet(playerBetByPlayer[playerId], 1)
        return acc
      }, {})
      return { ok: true, pool: 0, buyInByPlayer: {}, playerBetByPlayer: normalizedBets }
    }

    const uniquePlayers = [...new Set(filteredPlayers.filter(Boolean))]
    const normalizedBets = uniquePlayers.reduce((acc, playerId) => {
      acc[playerId] = sanitizeLobbyBet(playerBetByPlayer[playerId], 1)
      return acc
    }, {})

    const buyInByPlayer = uniquePlayers.reduce((acc, playerId) => {
      acc[playerId] = buyInAmount * normalizedBets[playerId]
      return acc
    }, {})

    const insufficient = uniquePlayers.filter((playerId) => economyService.getCoins(playerId) < buyInByPlayer[playerId])
    if (insufficient.length > 0) {
      return { ok: false, insufficient, buyInByPlayer, playerBetByPlayer: normalizedBets }
    }

    let pool = 0
    for (const playerId of uniquePlayers) {
      const debitAmount = buyInByPlayer[playerId]
      const debited = economyService.debitCoins(playerId, debitAmount, {
        type: "game-buyin",
        details: `Entrada para ${gameType}`,
        meta: {
          game: gameType,
          buyInBase: buyInAmount,
          playerBet: normalizedBets[playerId],
          buyInAmount: debitAmount,
        },
      })
      if (debited) {
        pool += debitAmount
        incrementUserStat(playerId, "moneyGameLost", debitAmount)
      }
    }

    return { ok: true, pool, buyInByPlayer, playerBetByPlayer: normalizedBets }
  }

  function getLobbyPayoutOptions(state = {}) {
    return {
      payoutMode: "lobby-bet-formula",
      playerBetByPlayer: state.playerBetByPlayer || {},
      buyInByPlayer: state.buyInByPlayer || {},
    }
  }

  function scheduleRrTurnTimeout(lobbyId, stateKey) {
    clearRrTurnTimeout(from, lobbyId)
    const key = rrTurnTimerKey(from, lobbyId)
    const timerId = setTimeout(async () => {
      rrTurnTimeouts.delete(key)

      const latestState = storage.getGameState(from, stateKey)
      if (!latestState) return

      const timedOutPlayer = roletaRussa.getCurrentPlayer(latestState)
      if (!timedOutPlayer) {
        storage.clearGameState(from, stateKey)
        return
      }

      const winners = (latestState.players || []).filter((playerId) => playerId !== timedOutPlayer)
      const betMultiplier = parsePositiveInt(latestState.betMultiplier, 1)

      incrementUserStat(timedOutPlayer, "gameRrShotLoss", 1)

      if (winners.length > 0) {
        consumeRrLuckTokenOnWin(winners, {
          lobbyId,
          reason: "rr-timeout-win",
        })
        winners.forEach((playerId) => {
          incrementUserStat(playerId, "gameRrWin", 1)
          incrementUserStat(playerId, "gameRrBetWin", 1)
        })
        await distributeLobbyBuyInPool(winners, latestState.buyInPool, "Roleta Russa", getLobbyPayoutOptions(latestState))
      }

      await sock.sendMessage(from, {
        text:
          `⏱️ Lobby *${lobbyId}*: @${timedOutPlayer.split("@")[0]} não usou *!atirar* em ${RR_TURN_TIMEOUT_SECONDS}s.\n` +
          (winners.length > 0
            ? `🏆 Vitória automática para ${winners.map((p) => `@${p.split("@")[0]}`).join(" ")} (multiplicador ${betMultiplier}x).`
            : "Partida encerrada por timeout."),
        mentions: [timedOutPlayer, ...winners],
      })

      telemetry.incrementCounter("game.rr.completed", 1, {
        result: "turn-timeout",
      })
      telemetry.appendEvent("game.rr.completed", {
        groupId: from,
        lobbyId,
        players: latestState.players,
        loser: timedOutPlayer,
        guaranteed: false,
        betMultiplier,
        timeoutMs: RR_TURN_TIMEOUT_MS,
        timeoutType: "turn",
      })

      storage.clearGameState(from, stateKey)
    }, RR_TURN_TIMEOUT_MS)

    rrTurnTimeouts.set(key, timerId)
  }

  // ======= fé que n quebra !BRINCADEIRAS =======
  if (cmd === prefix + "brincadeiras") {
    await sock.sendMessage(from, {
      text: `
╭━━━〔 🎮 SUBMENU: BRINCADEIRAS 〕━━━╮
│ - roleta
│ - bombardeio @user
│ - gay @user
│ - gado @user
│ - ship @a @b
│ - treta
╰━━━━━━━━━━━━━━━━━━━━╯
      `,
    })
    return true
  }
  // ==========================================================

  if ((cmd === prefix + "moeda dobro" || cmd === prefix + "moeda dobroounada" || cmd === prefix + "moeda dobrounada") && isGroup) {
    return await caraOuCoroa.startDobroGame(ctx)
  }

  if (cmdName === prefix + "moeda" && cmdArg1 === "continua" && isGroup) {
    return await caraOuCoroa.continueDobroGame(ctx)
  }

  if (cmdName === prefix + "moeda" && cmdArg1 === "sair" && isGroup) {
    return await caraOuCoroa.exitDobroGame(ctx)
  }

  if (cmdName === prefix + "jogos" && cmdArg1 === "stats") {
    const profile = economyService.getProfile(sender)
    await sock.sendMessage(from, {
      text: `${buildGameStatsText(profile)}\n\nUse *!jogos* para ver a lista de jogos.`,
    })
    return true
  }

  if (cmd === prefix + "jogos") {
    await sock.sendMessage(from, {
      text:
`╭━━━〔 🎮 SUBMENU: JOGOS 〕━━━╮
│ Jogos de lobby:
│ - adivinhacao
│ - batata
│ - dados
│ - rr
│ - moeda
│ - moeda dobro / moeda dobroounada
│ - streak / streakranking
│
│ Jogos rápidos:
│ - embaralhado
│ - memória
│ - reação
│ - comando
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 📌 COMANDOS 〕━━━╮
│ ${prefix}jogos stats
│ ${prefix}entrar <LobbyID> / ${prefix}join <LobbyID>
│ ${prefix}lobbies
│ ${prefix}começar <jogo> (ou ${prefix}comecar / ${prefix}start)
│ ${prefix}começar <LobbyID> (ou ${prefix}comecar / ${prefix}start)
│ ${prefix}começar <embaralhado|memória|reação|comando>
│ ${prefix}comecar <embaralhado|memoria|reacao|comando>
╰━━━━━━━━━━━━━━━━━━━━╯`,
    })
    return true
  }

  if ((isStartCommand && normalizeUnifiedGameType(cmdArg1) === "adivinhacao") && isGroup) {
    const blockedReason = getLobbyCreateBlockMessage("adivinhacao", "Adivinhação")
    if (blockedReason) {
      await sock.sendMessage(from, { text: blockedReason })
      return true
    }

    const lobbyId = gameManager.createOptInSession(from, "adivinhacao", 1, 4, 120000, {
      initialPlayers: [sender],
      onLobbyWarning: createLobbyWarningCallback,
      onLobbyTimeout: createLobbyTimeoutCallback,
    })
    telemetry.incrementCounter("game.lobby.created", 1, { gameType: "adivinhacao" })
    telemetry.appendEvent("game.lobby.created", { groupId: from, gameType: "adivinhacao", lobbyId, creatorId: sender })
    incrementUserStat(sender, "lobbiesCreated", 1)
    incrementUserStat(sender, "lobbiesJoined", 1)
    await sock.sendMessage(from, {
      text:
        `🎰 Jogo de Adivinhação criado!\n` +
        `Lobby ID: *${lobbyId}*\n\n` +
        `Criador já entrou automaticamente no lobby.\n` +
        `Para entrar: *!entrar ${lobbyId}* (ou *!join ${lobbyId}*)\n` +
        `Para iniciar: *!começar ${lobbyId}* (ou *!comecar ${lobbyId}* / *!start ${lobbyId}*)\n\n` +
        `Entrada por jogador: *${getGameBuyIn("adivinhacao")}* Epsteincoins (cobrada ao iniciar).\n` +
        `1-4 jogadores, número secreto entre 1 e 100.\n` +
        `Depois de iniciar, responda com *!resposta <número>*.`,
    })
    return true
  }

  if ((isStartCommand && normalizeUnifiedGameType(cmdArg1) === "batata") && isGroup) {
    const blockedReason = getLobbyCreateBlockMessage("batata", "Batata Quente")
    if (blockedReason) {
      await sock.sendMessage(from, { text: blockedReason })
      return true
    }

    const lobbyId = gameManager.createOptInSession(from, "batata", 2, null, 120000, {
      initialPlayers: [sender],
      onLobbyWarning: createLobbyWarningCallback,
      onLobbyTimeout: createLobbyTimeoutCallback,
    })
    telemetry.incrementCounter("game.lobby.created", 1, { gameType: "batata" })
    telemetry.appendEvent("game.lobby.created", { groupId: from, gameType: "batata", lobbyId, creatorId: sender })
    incrementUserStat(sender, "lobbiesCreated", 1)
    incrementUserStat(sender, "lobbiesJoined", 1)
    await sock.sendMessage(from, {
      text:
        `🥔 Batata Quente criada!\n` +
        `Lobby ID: *${lobbyId}*\n\n` +
        `Criador já entrou automaticamente no lobby.\n` +
        `Para entrar: *!entrar ${lobbyId}* (ou *!join ${lobbyId}*)\n` +
        `Para iniciar: *!começar ${lobbyId}* (ou *!comecar ${lobbyId}* / *!start ${lobbyId}*)\n` +
        `Entrada por jogador: *${getGameBuyIn("batata")}* Epsteincoins (cobrada ao iniciar).\n` +
        `Mínimo de 2 jogadores, sem limite máximo.`,
    })
    return true
  }

  if ((isStartCommand && normalizeUnifiedGameType(cmdArg1) === "dados") && isGroup) {
    const blockedReason = getLobbyCreateBlockMessage("dados", "Duelo de Dados")
    if (blockedReason) {
      await sock.sendMessage(from, { text: blockedReason })
      return true
    }

    const lobbyId = gameManager.createOptInSession(from, "dados", 2, 2, 120000, {
      initialPlayers: [sender],
      onLobbyWarning: createLobbyWarningCallback,
      onLobbyTimeout: createLobbyTimeoutCallback,
    })
    telemetry.incrementCounter("game.lobby.created", 1, { gameType: "dados" })
    telemetry.appendEvent("game.lobby.created", { groupId: from, gameType: "dados", lobbyId, creatorId: sender })
    incrementUserStat(sender, "lobbiesCreated", 1)
    incrementUserStat(sender, "lobbiesJoined", 1)
    await sock.sendMessage(from, {
      text:
        `🎲 Duelo de Dados criado!\n` +
        `Lobby ID: *${lobbyId}*\n\n` +
        `Criador já entrou automaticamente no lobby.\n` +
        `Para entrar: *!entrar ${lobbyId}* (ou *!join ${lobbyId}*)\n` +
        `Para iniciar: *!começar ${lobbyId}* (ou *!comecar ${lobbyId}* / *!start ${lobbyId}*)\n` +
        `Entrada por jogador: *${getGameBuyIn("dados")}* Epsteincoins (cobrada ao iniciar).`,
    })
    return true
  }

  if ((isStartCommand && normalizeUnifiedGameType(cmdArg1) === "rr") && isGroup) {
    const blockedReason = getLobbyCreateBlockMessage("rr", "Roleta Russa")
    if (blockedReason) {
      await sock.sendMessage(from, { text: blockedReason })
      return true
    }

    const lobbyId = gameManager.createOptInSession(from, "rr", 1, 4, 120000, {
      initialPlayers: [sender],
      onLobbyWarning: createLobbyWarningCallback,
      onLobbyTimeout: createLobbyTimeoutCallback,
    })
    telemetry.incrementCounter("game.lobby.created", 1, { gameType: "rr" })
    telemetry.appendEvent("game.lobby.created", { groupId: from, gameType: "rr", lobbyId, creatorId: sender })
    incrementUserStat(sender, "lobbiesCreated", 1)
    incrementUserStat(sender, "lobbiesJoined", 1)
    await sock.sendMessage(from, {
      text:
        `🔫 Roleta Russa criada!\n` +
        `Lobby ID: *${lobbyId}*\n\n` +
        `Criador já entrou automaticamente no lobby.\n` +
        `Para entrar: *!entrar ${lobbyId}* (ou *!join ${lobbyId}*)\n` +
        `Para iniciar: *!começar ${lobbyId} <aposta>* (ou *!comecar ${lobbyId} <aposta>* / *!start ${lobbyId} <aposta>*)\n` +
        `Entrada por jogador: *${getGameBuyIn("rr")}* Epsteincoins (cobrada ao iniciar).\n` +
        `Bet da RR: *1 a 5* (mínimo obrigatório 1).\n` +
        `Exemplo: *!começar ${lobbyId} 3*`,
    })
    return true
  }

  if (isJoinCommand && isGroup) {
    const lobbyId = normalizeLobbyId(cmdArg1)
    if (!lobbyId) {
      await sock.sendMessage(from, { text: "Use: !entrar <LobbyID> ou !join <LobbyID>" })
      return true
    }

    const session = gameManager.getOptInSession(from, lobbyId)
    if (!session) {
      await sock.sendMessage(from, { text: `Lobby *${lobbyId}* não encontrado ou expirado.` })
      return true
    }

    if (gameManager.addPlayerToOptIn(from, lobbyId, sender)) {
      incrementUserStat(sender, "lobbiesJoined", 1)
      telemetry.incrementCounter("game.lobby.joined", 1, { gameType: session.gameType })
      telemetry.appendEvent("game.lobby.joined", { groupId: from, lobbyId, gameType: session.gameType, userId: sender })
      const maxPlayersLabel = Number.isFinite(session.maxPlayers) ? String(session.maxPlayers) : "∞"
      await sock.sendMessage(from, {
        text: `✅ @${sender.split("@")[0]} entrou no lobby *${lobbyId}*!\nJogadores: ${session.players.length}/${maxPlayersLabel}`,
        mentions: [sender],
      })
    } else {
      await sock.sendMessage(from, {
        text: "Lobby cheio ou você já entrou nele.",
      })
    }
    return true
  }

  if (cmd === prefix + "lobbies" && isGroup) {
    const groupSessions = gameManager.optInSessions[from] || {}
    const ids = Object.keys(groupSessions)
    if (ids.length === 0) {
      await sock.sendMessage(from, { text: "Nenhum lobby aberto no momento." })
      return true
    }

    const lines = ids.map((id) => {
      const s = groupSessions[id]
      const maxPlayersLabel = Number.isFinite(s.maxPlayers) ? String(s.maxPlayers) : "∞"
      return `- ${id} | ${s.gameType} | ${s.players.length}/${maxPlayersLabel}`
    })

    await sock.sendMessage(from, {
      text:
        "Lobbies abertos:\n" +
        lines.join("\n") +
        "\n\nEntre com: !entrar <LobbyID>",
    })
    return true
  }

  if (cmdName === prefix + "aposta" && isGroup) {
    const explicitLobbyId = normalizeLobbyId(cmdArg1)
    if (!explicitLobbyId) return false
    const targetLobbyId = explicitLobbyId
    const betToken = String(cmdArg2 || "").trim().toLowerCase()

    const graceKey = getLobbyGraceStateKey(targetLobbyId)
    const graceState = storage.getGameState(from, graceKey)
    if (!graceState) return false

    if (!Array.isArray(graceState.players) || !graceState.players.includes(sender)) {
      await sock.sendMessage(from, {
        text: `Você não está no lobby *${targetLobbyId}* em preparação.`,
      })
      return true
    }

    if (betToken === "skip") {
      graceState.forceStart = true
      storage.setGameState(from, graceKey, graceState)
      await sock.sendMessage(from, {
        text: `⏩ Lobby *${targetLobbyId}*: fase de aposta pulada por @${sender.split("@")[0]}.`,
        mentions: [sender],
      })

      await handleGameCommands({
        sock,
        from,
        sender: graceState.startedBy || sender,
        cmd: `${prefix}começar ${targetLobbyId}`,
        cmdName: `${prefix}comecar`,
        cmdArg1: targetLobbyId,
        cmdArg2: String(graceState.rrBetValueToken || ""),
        mentioned,
        prefix,
        isGroup,
        text,
        msg,
        storage,
        gameManager,
        economyService,
        caraOuCoroa,
        adivinhacao,
        batataquente,
        dueloDados,
        roletaRussa,
        startPeriodicGame,
        GAME_REWARDS,
        BASE_GAME_REWARD,
        normalizeUnifiedGameType,
        normalizeLobbyId,
        activeGameKey,
        resolveActiveLobbyForPlayer,
        getLobbyCreateBlockMessage,
        getGameBuyIn,
        collectLobbyBuyIn,
        distributeLobbyBuyInPool,
        parsePositiveInt,
        isResenhaModeEnabled,
        rewardPlayer,
        rewardPlayers,
        incrementUserStat,
        applyRandomGamePunishment,
        createPendingTargetForWinner,
        jidNormalizedUser,
        createLobbyWarningCallback,
        createLobbyTimeoutCallback,
        buildGameStatsText,
      })
      return true
    }

    const betRaw = Number.parseInt(String(betToken || ""), 10)
    if (!Number.isFinite(betRaw) || betRaw < 1 || betRaw > 10) {
      await sock.sendMessage(from, {
        text: "Use: !aposta <LobbyID> <1-10> ou !aposta <LobbyID> skip",
      })
      return true
    }

    if (!graceState.playerBetByPlayer) graceState.playerBetByPlayer = {}
    graceState.playerBetByPlayer[sender] = betRaw
    storage.setGameState(from, graceKey, graceState)

    const baseBuyIn = Math.max(0, Number(graceState.buyInAmount) || 0)
    const multipliedBuyIn = baseBuyIn * betRaw
    await sock.sendMessage(from, {
      text:
        `🎯 Lobby *${targetLobbyId}*: bet de @${sender.split("@")[0]} ajustada para *${betRaw}x*.\n` +
        `Buy-in deste jogador: *${multipliedBuyIn}* Epsteincoins (base ${baseBuyIn}).`,
      mentions: [sender],
    })
    return true
  }

  if (isStartCommand && isGroup && !isQuickGameStartTarget) {
    const lobbyId = normalizeLobbyId(cmdArg1)
    if (!lobbyId) {
      await sock.sendMessage(from, { text: "Use: !começar <LobbyID> (ou !comecar / !start)" })
      return true
    }

    const session = gameManager.getOptInSession(from, lobbyId)
    if (!session) {
      await sock.sendMessage(from, { text: `Lobby *${lobbyId}* não encontrado.` })
      return true
    }

    const stateKey = activeGameKey(session.gameType, lobbyId)
    if (storage.getGameState(from, stateKey)) {
      await sock.sendMessage(from, { text: `O lobby *${lobbyId}* já está em andamento.` })
      return true
    }

    const graceStateKey = getLobbyGraceStateKey(lobbyId)
    const existingGraceState = storage.getGameState(from, graceStateKey)
    if (!existingGraceState?.forceStart) {
      if (existingGraceState) {
        await sock.sendMessage(from, {
          text: `Lobby *${lobbyId}* já está no período de aposta. Use: !aposta ${lobbyId} <1-10> ou !aposta ${lobbyId} skip`,
        })
        return true
      }

      const buyInAmount = getGameBuyIn(session.gameType)
      const graceState = {
        lobbyId,
        gameType: session.gameType,
        players: [...session.players],
        buyInAmount,
        playerBetByPlayer: (session.players || []).reduce((acc, playerId) => {
          acc[playerId] = 1
          return acc
        }, {}),
        rrBetValueToken: cmdArg2,
        startedBy: sender,
        forceStart: false,
        createdAt: Date.now(),
      }
      storage.setGameState(from, graceStateKey, graceState)

      await sock.sendMessage(from, {
        text:
          `⏳ Lobby *${lobbyId}* entra em período de aposta por ${Math.floor(LOBBY_BET_GRACE_MS / 1000)}s.\n` +
          `Cada jogador pode definir bet de *1x a 10x* para multiplicar o buy-in.\n` +
          `Use: *!aposta ${lobbyId} <1-10>* ou *!aposta ${lobbyId} skip*.\n` +
          `Se não escolher, fica em *1x*.`,
        mentions: session.players || [],
      })

      setTimeout(async () => {
        try {
          const latestGraceState = storage.getGameState(from, graceStateKey)
          if (!latestGraceState) return
          latestGraceState.forceStart = true
          storage.setGameState(from, graceStateKey, latestGraceState)

          try {
            telemetry.incrementCounter("game.lobby.graceTimeoutTriggered", 1, { gameType: session?.gameType })
            telemetry.appendEvent("game.lobby.graceTimeoutTriggered", { groupId: from, lobbyId, gameType: session?.gameType, players: latestGraceState.players })
          } catch (e) {
            // best-effort telemetry, ignore errors
          }

          // Quick pre-check: if the opt-in session was removed meanwhile, bail early.
          const preSession = gameManager.getOptInSession(from, lobbyId)
          if (!preSession) {
            return
          }

          await handleGameCommands({
            sock,
            from,
            sender: latestGraceState.startedBy || sender,
            cmd: `${prefix}começar ${lobbyId}`,
            cmdName: `${prefix}comecar`,
            cmdArg1: lobbyId,
            cmdArg2: String(latestGraceState.rrBetValueToken || ""),
            mentioned,
            prefix,
            isGroup,
            text,
            msg,
            storage,
            gameManager,
            economyService,
            caraOuCoroa,
            adivinhacao,
            batataquente,
            dueloDados,
            roletaRussa,
            startPeriodicGame,
            GAME_REWARDS,
            BASE_GAME_REWARD,
            normalizeUnifiedGameType,
            normalizeLobbyId,
            activeGameKey,
            resolveActiveLobbyForPlayer,
            getLobbyCreateBlockMessage,
            getGameBuyIn,
            collectLobbyBuyIn,
            distributeLobbyBuyInPool,
            parsePositiveInt,
            isResenhaModeEnabled,
            rewardPlayer,
            rewardPlayers,
            incrementUserStat,
            applyRandomGamePunishment,
            createPendingTargetForWinner,
            jidNormalizedUser,
            createLobbyWarningCallback,
            createLobbyTimeoutCallback,
            buildGameStatsText,
          })
        } catch (err) {
          console.error(`Error in lobby grace timeout for ${lobbyId} @ ${from}:`, err)
          try {
            telemetry.incrementCounter("game.lobby.graceTimeoutError", 1, { gameType: session?.gameType })
            telemetry.appendEvent("game.lobby.graceTimeoutError", { groupId: from, lobbyId, gameType: session?.gameType, error: String(err?.stack || err?.message || err) })
          } catch (e) {}
        }
      }, LOBBY_BET_GRACE_MS)

      return true
    }

    const graceBetByPlayer = existingGraceState?.playerBetByPlayer || {}
    storage.clearGameState(from, graceStateKey)

    incrementUserStat(sender, "lobbiesStarted", 1)
    grantGameXp(sender, GAME_XP_REWARDS.lobbyStart, "lobby-start", {
      gameType: session.gameType,
      lobbyId,
    })
    telemetry.incrementCounter("game.lobby.started", 1, { gameType: session.gameType })
    telemetry.appendEvent("game.lobby.started", {
      groupId: from,
      lobbyId,
      gameType: session.gameType,
      starterId: sender,
      players: session.players,
    })

    if (session.gameType === "adivinhacao") {
      if (session.players.length < 1) {
        await sock.sendMessage(from, { text: "Precisamos de pelo menos 1 jogador!" })
        return true
      }

      const buyInAmount = getGameBuyIn(session.gameType)
      const buyInResult = collectLobbyBuyInWithBets(session.players, buyInAmount, session.gameType, graceBetByPlayer)
      if (!buyInResult.ok) {
        await sock.sendMessage(from, {
          text: `Sem saldo para entrada multiplicada (base ${buyInAmount}) para: ${buyInResult.insufficient.map((p) => `@${p.split("@")[0]}`).join(" ")}`,
          mentions: buyInResult.insufficient,
        })
        return true
      }

      const state = adivinhacao.start(from, session.players)
      state.buyInPool = buyInResult.pool || 0
      state.buyInAmount = buyInAmount
      state.buyInByPlayer = buyInResult.buyInByPlayer || {}
      state.playerBetByPlayer = buyInResult.playerBetByPlayer || {}
      storage.setGameState(from, stateKey, state)
      gameManager.clearOptInSession(from, lobbyId)

      const mentions = [...session.players]
      await sock.sendMessage(from, {
        text:
          `🎰 Adivinhação iniciada no lobby *${lobbyId}*!\n` +
          `${mentions.map((p) => `@${p.split("@")[0]}`).join(" ")}\n\n` +
          `Resposta: *!resposta <número>* (auto)\n` +
          `Ou: *!resposta ${lobbyId} <número>*\n` +
          `Faixa: 1-100`,
        mentions,
      })
      return true
    }

    if (session.gameType === "batata") {
      if (session.players.length < 2) {
        await sock.sendMessage(from, { text: "Precisamos de pelo menos 2 jogadores!" })
        return true
      }

      const buyInAmount = getGameBuyIn(session.gameType)
      const buyInResult = collectLobbyBuyInWithBets(session.players, buyInAmount, session.gameType, graceBetByPlayer)
      if (!buyInResult.ok) {
        await sock.sendMessage(from, {
          text: `Sem saldo para entrada multiplicada (base ${buyInAmount}) para: ${buyInResult.insufficient.map((p) => `@${p.split("@")[0]}`).join(" ")}`,
          mentions: buyInResult.insufficient,
        })
        return true
      }

      const state = batataquente.start(from, session.players)
      state.buyInPool = buyInResult.pool || 0
      state.buyInAmount = buyInAmount
      state.buyInByPlayer = buyInResult.buyInByPlayer || {}
      state.playerBetByPlayer = buyInResult.playerBetByPlayer || {}
      storage.setGameState(from, stateKey, state)
      gameManager.clearOptInSession(from, lobbyId)

      await sock.sendMessage(from, {
        text:
          `🥔 Batata Quente iniciada no lobby *${lobbyId}*!\n` +
          `${session.players.map((p) => `@${p.split("@")[0]}`).join(" ")}\n\n` +
          `${batataquente.formatStatus(state)}\n` +
          `Comando de passe: *!passa @usuario* (auto)\n` +
          `Ou: *!passa ${lobbyId} @usuario*`,
        mentions: session.players,
      })

      const countdownSeconds = [15, 10, 5, 4, 3, 2, 1]
      for (const secs of countdownSeconds) {
        const delayMs = Math.max(0, state.durationMs - secs * 1000)
        setTimeout(async () => {
          const currentState = storage.getGameState(from, stateKey)
          if (!currentState) return
          const holder = currentState.currentHolder
          await sock.sendMessage(from, {
            text: `⏱️ *${secs}s* restantes no lobby *${lobbyId}*\nBatata com @${holder.split("@")[0]}`,
            mentions: [holder],
          })
        }, delayMs)
      }

      setTimeout(async () => {
        const finalState = storage.getGameState(from, stateKey)
        if (finalState) {
          const loser = batataquente.getLoser(finalState)
          const resenhaOn = isResenhaModeEnabled()
          await sock.sendMessage(from, {
            text: resenhaOn
              ? `⏰ Tempo acabou no lobby *${lobbyId}*!\n🔴 @${loser.split("@")[0]} foi punido!`
              : `⏰ Tempo acabou no lobby *${lobbyId}*!\n🔴 @${loser.split("@")[0]} perdeu a rodada!`,
            mentions: [loser],
          })

          const winners = (finalState.players || []).filter((playerId) => playerId !== loser)
          winners.forEach((playerId) => incrementUserStat(playerId, "gameBatataWin", 1))
          incrementUserStat(loser, "gameBatataLoss", 1)
          winners.forEach((playerId) => grantGameXp(playerId, GAME_XP_REWARDS.batataWin, "batata-win", { lobbyId }))
          grantGameXp(loser, GAME_XP_REWARDS.batataLoss, "batata-loss", { lobbyId })
          telemetry.incrementCounter("game.batata.completed", 1, {
            result: "timeout",
          })
          telemetry.appendEvent("game.batata.completed", {
            groupId: from,
            lobbyId,
            players: finalState.players,
            loser,
            winners,
          })
          await distributeLobbyBuyInPool(winners, finalState.buyInPool, "Batata Quente", getLobbyPayoutOptions(finalState))

          await applyRandomGamePunishment(loser, {
            severityMultiplier: resolvePunishmentSeverityFromLoserBet(finalState, loser, 1),
          })
          storage.clearGameState(from, stateKey)
        }
      }, 15000)

      return true
    }

    if (session.gameType === "dados") {
      if (session.players.length !== 2) {
        await sock.sendMessage(from, { text: "Precisamos de exatamente 2 jogadores!" })
        return true
      }

      const buyInAmount = getGameBuyIn(session.gameType)
      const buyInResult = collectLobbyBuyInWithBets(session.players, buyInAmount, session.gameType, graceBetByPlayer)
      if (!buyInResult.ok) {
        await sock.sendMessage(from, {
          text: `Sem saldo para entrada multiplicada (base ${buyInAmount}) para: ${buyInResult.insufficient.map((p) => `@${p.split("@")[0]}`).join(" ")}`,
          mentions: buyInResult.insufficient,
        })
        return true
      }

      const state = dueloDados.start(from, session.players)
      state.buyInPool = buyInResult.pool || 0
      state.buyInAmount = buyInAmount
      state.buyInByPlayer = buyInResult.buyInByPlayer || {}
      state.playerBetByPlayer = buyInResult.playerBetByPlayer || {}
      storage.setGameState(from, stateKey, state)
      gameManager.clearOptInSession(from, lobbyId)

      await sock.sendMessage(from, {
        text:
          `🎲 Duelo de Dados iniciado no lobby *${lobbyId}*!\n` +
          `${session.players.map((p) => `@${p.split("@")[0]}`).join(" vs ")}\n\n` +
          `Cada jogador usa: *!rolar* (auto)\n` +
          `Ou: *!rolar ${lobbyId}*`,
        mentions: session.players,
      })
      return true
    }

    if (session.gameType === "rr") {
      if (session.players.length === 0) {
        await sock.sendMessage(from, { text: "Precisamos de pelo menos 1 jogador!" })
        return true
      }

      const buyInAmount = getGameBuyIn(session.gameType)
      const betRaw = Number.parseInt(String(cmdArg2 ?? ""), 10)
      if (String(cmdArg2 || "").trim() && (!Number.isFinite(betRaw) || betRaw < 1 || betRaw > 5)) {
        await sock.sendMessage(from, { text: "Use: !começar <LobbyID> <bet 1-5> para iniciar a RR." })
        return true
      }
      const betValue = Number.isFinite(betRaw) ? Math.max(1, Math.min(5, betRaw)) : 1

      const isSoloRr = session.players.length === 1
      const buyInResult = isSoloRr
        ? {
            ok: true,
            pool: 0,
            buyInByPlayer: {
              [session.players[0]]: buyInAmount * sanitizeLobbyBet(graceBetByPlayer[session.players[0]], 1),
            },
            playerBetByPlayer: {
              [session.players[0]]: sanitizeLobbyBet(graceBetByPlayer[session.players[0]], 1),
            },
          }
        : collectLobbyBuyInWithBets(session.players, buyInAmount, session.gameType, graceBetByPlayer)
      if (!buyInResult.ok) {
        await sock.sendMessage(from, {
          text: `Sem saldo para entrada multiplicada (base ${buyInAmount}) para: ${buyInResult.insufficient.map((p) => `@${p.split("@")[0]}`).join(" ")}`,
          mentions: buyInResult.insufficient,
        })
        return true
      }

      const state = roletaRussa.start(from, session.players, { betValue })
      state.buyInPool = buyInResult.pool || 0
      state.buyInAmount = buyInAmount
      state.buyInByPlayer = buyInResult.buyInByPlayer || {}
      state.playerBetByPlayer = buyInResult.playerBetByPlayer || {}
      state.isSoloRr = isSoloRr
      state.soloRiskAmount = isSoloRr
        ? Math.max(0, Number(state.buyInByPlayer?.[session.players[0]]) || 0)
        : 0
      storage.setGameState(from, stateKey, state)
      gameManager.clearOptInSession(from, lobbyId)

      const currentPlayer = roletaRussa.getCurrentPlayer(state)
      const startMentions = Array.from(new Set([
        ...session.players,
        ...(currentPlayer ? [currentPlayer] : []),
      ]))

      await sock.sendMessage(from, {
        text:
          `🔫 Roleta Russa iniciada no lobby *${lobbyId}*!\n` +
          `${session.players.map((p) => `@${p.split("@")[0]}`).join(" ")}\n\n` +
          `Aposta: *${state.betValue || 0}*\n` +
          `Multiplicador (aposta + 1): *${state.betMultiplier || 1}x*\n` +
          `${roletaRussa.formatStatus(state)}\n` +
          `⏱️ Cada turno expira em *${RR_TURN_TIMEOUT_SECONDS}s*.\n` +
          `Atire com: *!atirar* (auto)\n` +
          `Ou: *!atirar ${lobbyId}*`,
        mentions: startMentions,
      })
      scheduleRrTurnTimeout(lobbyId, stateKey)
      return true
    }

    if (session.gameType === "embaralhado") {
      if (session.players.length < 3) {
        await sock.sendMessage(from, { text: "Precisamos de pelo menos 3 jogadores para Embaralhado!" })
        return true
      }
      gameManager.clearOptInSession(from, lobbyId)
      const startResult = await startPeriodicGame("embaralhado", {
        triggeredBy: sender,
        automatic: false,
      })
      if (!startResult.ok) {
        await sock.sendMessage(from, { text: startResult.message })
      }
      return true
    }

    if (session.gameType === "reação") {
      if (session.players.length < 3) {
        await sock.sendMessage(from, { text: "Precisamos de pelo menos 3 jogadores para Reação!" })
        return true
      }
      gameManager.clearOptInSession(from, lobbyId)
      const startResult = await startPeriodicGame("reação", {
        triggeredBy: sender,
        automatic: false,
        reactionParticipants: session.players,
      })
      if (!startResult.ok) {
        await sock.sendMessage(from, { text: startResult.message })
      }
      return true
    }

    if (session.gameType === "comando") {
      if (session.players.length < 3) {
        await sock.sendMessage(from, { text: "Precisamos de pelo menos 3 jogadores para Comando!" })
        return true
      }
      gameManager.clearOptInSession(from, lobbyId)
      const startResult = await startPeriodicGame("comando", {
        triggeredBy: sender,
        automatic: false,
        comandoParticipants: session.players,
      })
      if (!startResult.ok) {
        await sock.sendMessage(from, { text: startResult.message })
      }
      return true
    }

    await sock.sendMessage(from, { text: "Esse lobby deve ser iniciado com !começar <jogo> (ou !comecar / !start)." })
    return true
  }

  if (cmdName === prefix + "resposta" && isGroup) {
    const resolved = resolveActiveLobbyForPlayer("adivinhacao", cmdArg1, sender)
    if (!resolved.ok && resolved.reason === "not-in-lobby") {
      await sock.sendMessage(from, { text: `Você não está no lobby *${resolved.lobbyId}*.` })
      return true
    }
    if (!resolved.ok && resolved.reason === "not-found") {
      await sock.sendMessage(from, { text: "Você não está em nenhuma Adivinhação ativa. Use !resposta <número> quando estiver em jogo." })
      return true
    }
    if (!resolved.ok && resolved.reason === "ambiguous") {
      await sock.sendMessage(from, { text: "Você está em mais de uma Adivinhação. Use: !resposta <LobbyID> <número>" })
      return true
    }

    const guessToken = resolved.foundExplicit ? cmdArg2 : cmdArg1
    const { lobbyId, stateKey, state } = resolved
    const result = adivinhacao.recordGuess(state, sender, guessToken)
    if (!result.valid) {
      await sock.sendMessage(from, { text: result.error })
      return true
    }

    storage.setGameState(from, stateKey, state)

    if (Object.keys(state.guesses).length === state.players.length) {
      const results = adivinhacao.getResults(state)
      const guessBuckets = {}
      Object.keys(state.guesses || {}).forEach((playerId) => {
        const guessValue = state.guesses[playerId]
        if (!guessBuckets[guessValue]) guessBuckets[guessValue] = []
        guessBuckets[guessValue].push(playerId)
      })
      Object.values(guessBuckets).forEach((bucket) => {
        if (bucket.length > 1) {
          bucket.forEach((playerId) => incrementUserStat(playerId, "gameGuessTie", 1))
        }
      })

      if (Array.isArray(results.punishments) && results.punishments.length > 0) {
        results.punishments.forEach((entry) => incrementUserStat(entry.playerId, "gameGuessLoss", 1))
        results.punishments.forEach((entry) => grantGameXp(entry.playerId, GAME_XP_REWARDS.guessLoss, "guess-loss", { lobbyId }))
      }

      const resenhaOn = isResenhaModeEnabled()
      const displayResults = resenhaOn
        ? results
        : {
            ...results,
            punishments: [],
            chooser: null,
            winner: null,
          }
      await sock.sendMessage(from, {
        text: `Lobby *${lobbyId}*\n\n${adivinhacao.formatResults(state, displayResults, resenhaOn)}`,
        mentions: state.players || [],
      })

      if (results.chooser) {
        incrementUserStat(results.chooser, "gameGuessExact", 1)
        grantGameXp(results.chooser, GAME_XP_REWARDS.guessExact, "guess-exact", { lobbyId })
        await distributeLobbyBuyInPool([results.chooser], state.buyInPool, "Adivinhação", getLobbyPayoutOptions(state))
      } else if (Array.isArray(results.closestPlayers) && results.closestPlayers.length > 0 && state.players.length > 1) {
        results.closestPlayers.forEach((playerId) => incrementUserStat(playerId, "gameGuessClosest", 1))
        results.closestPlayers.forEach((playerId) => grantGameXp(playerId, GAME_XP_REWARDS.guessClosest, "guess-closest", { lobbyId }))
        await distributeLobbyBuyInPool(results.closestPlayers, state.buyInPool, "Adivinhação", getLobbyPayoutOptions(state))
      } else if (state.players.length === 1) {
        incrementUserStat(state.players[0], "gameGuessLoss", 1)
        grantGameXp(state.players[0], GAME_XP_REWARDS.guessLoss, "guess-solo-miss", { lobbyId })
        await sock.sendMessage(from, {
          text: "Adivinhação solo: só recebe recompensa em acerto exato.",
        })
      }

      if (Array.isArray(results.punishments) && results.punishments.length > 0) {
        if (resenhaOn) {
          for (const entry of results.punishments) {
            await applyRandomGamePunishment(entry.playerId, {
              severityMultiplier: resolvePunishmentSeverityFromLoserBet(state, entry.playerId, entry.severity || 1),
            })
          }
        }
      }

      if (results.chooser) {
        await createPendingTargetForWinner(
          results.chooser,
          `🎯 @${results.chooser.split("@")[0]}, você acertou exatamente!`,
          results.choiceSeverity || 2,
          state.players.filter((p) => p !== results.chooser)
        )
      }

      telemetry.incrementCounter("game.adivinhacao.completed", 1, {
        result: results.chooser ? "exact" : (Array.isArray(results.closestPlayers) && results.closestPlayers.length > 0 ? "closest" : "none"),
      })
      telemetry.appendEvent("game.adivinhacao.completed", {
        groupId: from,
        lobbyId,
        players: state.players,
        chooser: results.chooser || null,
        closestCount: Array.isArray(results.closestPlayers) ? results.closestPlayers.length : 0,
      })

      storage.clearGameState(from, stateKey)
    }
    return true
  }

  if (cmdName === prefix + "passa" && isGroup) {
    const resolved = resolveActiveLobbyForPlayer("batata", cmdArg1, sender)
    if (!resolved.ok && resolved.reason === "not-in-lobby") {
      await sock.sendMessage(from, { text: `Você não está no lobby *${resolved.lobbyId}*.` })
      return true
    }
    if (!resolved.ok && resolved.reason === "not-found") {
      await sock.sendMessage(from, { text: "Você não está em nenhuma Batata Quente ativa. Use !passa @usuario quando estiver em jogo." })
      return true
    }
    if (!resolved.ok && resolved.reason === "ambiguous") {
      await sock.sendMessage(from, { text: "Você está em mais de uma Batata Quente. Use: !passa <LobbyID> @usuario" })
      return true
    }

    const { lobbyId, stateKey, state } = resolved

    const target = mentioned[0] || jidNormalizedUser(msg?.message?.extendedTextMessage?.contextInfo?.participant || "")
    if (!target) {
      await sock.sendMessage(from, { text: "Marque alguém para passar a batata!" })
      return true
    }

    const result = batataquente.recordPass(state, sender, target)
    if (!result.valid) {
      await sock.sendMessage(from, { text: result.error })
      return true
    }

    storage.setGameState(from, stateKey, state)
    await sock.sendMessage(from, {
      text: `✅ Lobby *${lobbyId}*: @${sender.split("@")[0]} passou a batata para @${target.split("@")[0]}!`,
      mentions: [sender, target],
    })
    return true
  }

  if (cmdName === prefix + "rolar" && isGroup) {
    const resolved = resolveActiveLobbyForPlayer("dados", cmdArg1, sender)
    if (!resolved.ok && resolved.reason === "not-in-lobby") {
      await sock.sendMessage(from, { text: `Você não está no lobby *${resolved.lobbyId}*.` })
      return true
    }
    if (!resolved.ok && resolved.reason === "not-found") {
      await sock.sendMessage(from, { text: "Você não está em nenhum Duelo de Dados ativo." })
      return true
    }
    if (!resolved.ok && resolved.reason === "ambiguous") {
      await sock.sendMessage(from, { text: "Você está em mais de um Duelo de Dados. Use: !rolar <LobbyID>" })
      return true
    }

    const { lobbyId, stateKey, state } = resolved

    const result = dueloDados.recordRoll(state, sender)
    if (!result.valid) {
      await sock.sendMessage(from, { text: result.error })
      return true
    }

    storage.setGameState(from, stateKey, state)
    await sock.sendMessage(from, {
      text: `🎲 Lobby *${lobbyId}*: @${sender.split("@")[0]} rolou ${result.roll}!`,
      mentions: [sender],
    })

    if (Object.keys(state.rolls).length === 2) {
      const results = dueloDados.getResults(state)
      const resenhaOn = isResenhaModeEnabled()
      await sock.sendMessage(from, {
        text: `Lobby *${lobbyId}*\n\n${dueloDados.formatResults(state, results, resenhaOn)}`,
        mentions: state.players || [],
      })

      if (results.winner) {
        incrementUserStat(results.winner, "gameDadosWin", 1)
        grantGameXp(results.winner, GAME_XP_REWARDS.dadosWin, "dados-win", { lobbyId })
        await distributeLobbyBuyInPool([results.winner], state.buyInPool, "Duelo de Dados", getLobbyPayoutOptions(state))
      }

      if (results.punish && results.punish.length > 0) {
        results.punish.forEach((playerId) => incrementUserStat(playerId, "gameDadosLoss", 1))
        results.punish.forEach((playerId) => grantGameXp(playerId, GAME_XP_REWARDS.dadosLoss, "dados-loss", { lobbyId }))
        if (resenhaOn) {
          for (const playerId of results.punish) {
            await applyRandomGamePunishment(playerId, {
              severityMultiplier: resolvePunishmentSeverityFromLoserBet(state, playerId, results.severity || 1),
            })
          }
        }
      } else if (results.loser) {
        incrementUserStat(results.loser, "gameDadosLoss", 1)
        grantGameXp(results.loser, GAME_XP_REWARDS.dadosLoss, "dados-loss", { lobbyId })
        if (resenhaOn) {
          await applyRandomGamePunishment(results.loser, {
            severityMultiplier: resolvePunishmentSeverityFromLoserBet(state, results.loser, results.severity || 1),
          })
        }
      }

      telemetry.incrementCounter("game.dados.completed", 1, {
        result: results.winner ? "win" : "tie",
      })
      telemetry.appendEvent("game.dados.completed", {
        groupId: from,
        lobbyId,
        players: state.players,
        winner: results.winner || null,
        loser: results.loser || null,
      })

      storage.clearGameState(from, stateKey)
    }
    return true
  }

  if (cmdName === prefix + "atirar" && isGroup) {
    const resolved = resolveActiveLobbyForPlayer("rr", cmdArg1, sender)
    if (!resolved.ok && resolved.reason === "not-in-lobby") {
      await sock.sendMessage(from, { text: `Você não está no lobby *${resolved.lobbyId}*.` })
      return true
    }
    if (!resolved.ok && resolved.reason === "not-found") {
      await sock.sendMessage(from, { text: "Você não está em nenhuma Roleta Russa ativa." })
      return true
    }
    if (!resolved.ok && resolved.reason === "ambiguous") {
      await sock.sendMessage(from, { text: "Você está em mais de uma Roleta Russa. Use: !atirar <LobbyID>" })
      return true
    }

    const { lobbyId, stateKey, state } = resolved

    const currentPlayer = roletaRussa.getCurrentPlayer(state)
    if (sender !== currentPlayer) {
      await sock.sendMessage(from, {
        text: `Não é sua vez no lobby *${lobbyId}*! É de @${currentPlayer.split("@")[0]}`,
        mentions: [currentPlayer],
      })
      return true
    }

    clearRrTurnTimeout(from, lobbyId)
    const result = roletaRussa.takeShotAt(state)
    incrementUserStat(sender, "gameRrTrigger", 1)
    grantGameXp(sender, GAME_XP_REWARDS.rrSurviveShot, "rr-shot", {
      lobbyId,
      hit: Boolean(result.hit),
    })

    const canAttemptRrLuckDodge =
      result.hit &&
      !result.allWin &&
      !result.autoWin &&
      typeof economyService?.getItemQuantity === "function" &&
      typeof economyService?.removeItem === "function" &&
      economyService.getItemQuantity(sender, "rrtokensorte") > 0

    if (canAttemptRrLuckDodge) {
      const dodgeChance = 0.5
      const dodged = Math.random() < dodgeChance
      if (dodged) {
        state.loser = null
        state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length
        storage.setGameState(from, stateKey, state)

        const nextPlayerAfterDodge = roletaRussa.getCurrentPlayer(state)
        const dodgeMentions = Array.from(new Set([
          sender,
          ...(nextPlayerAfterDodge ? [nextPlayerAfterDodge] : []),
        ]))

        await sock.sendMessage(from, {
          text:
            `🍀 *SORTE NA RR!*\n` +
            `@${sender.split("@")[0]} desviou do tiro com o efeito do *rrtokensorte* no lobby *${lobbyId}*.\n` +
            `O token só é consumido em vitória sem ser atingido.\n\n` +
            `${roletaRussa.formatStatus(state)}`,
          mentions: dodgeMentions,
        })

        scheduleRrTurnTimeout(lobbyId, stateKey)
        return true
      }
    }

    storage.setGameState(from, stateKey, state)
    const betMultiplier = parsePositiveInt(state.betMultiplier, 1)
    const betValueRaw = Number.parseInt(String(state.betValue), 10)
    const betValue = Number.isFinite(betValueRaw) ? Math.max(0, Math.min(5, betValueRaw)) : Math.max(0, betMultiplier - 1)
    const soloCoinMultiplier = Math.max(1, betValue)
    const rrCoinMultiplier = state.players.length === 1 ? soloCoinMultiplier : betMultiplier
    const soloPlayerId = Array.isArray(state.players) && state.players.length === 1 ? state.players[0] : ""
    const fallbackSoloRisk = (() => {
      if (!soloPlayerId) return 0
      const fromBuyInMap = Math.max(0, Math.floor(Number(state.buyInByPlayer?.[soloPlayerId]) || 0))
      if (fromBuyInMap > 0) return fromBuyInMap
      const baseBuyIn = Math.max(0, Math.floor(Number(state.buyInAmount) || 0))
      const playerBet = Math.max(1, Math.floor(Number(state.playerBetByPlayer?.[soloPlayerId]) || 1))
      const computed = baseBuyIn * playerBet
      if (computed > 0) return computed
      return BASE_GAME_REWARD * rrCoinMultiplier
    })()
    const soloRiskValue = Math.max(0, Math.floor(Number(state.soloRiskAmount) || 0)) || fallbackSoloRisk

    if (result.autoWin) {
      const winners = Array.isArray(result.winners) && result.winners.length > 0
        ? result.winners
        : [sender]
      winners.forEach((playerId) => {
        incrementUserStat(playerId, "gameRrWin", 1)
        incrementUserStat(playerId, "gameRrBetWin", 1)
        grantGameXp(playerId, GAME_XP_REWARDS.rrWin, "rr-win", { lobbyId, mode: "auto-win" })
      })
      if (state.players.length === 1) {
        const soloGain = soloRiskValue
        if (soloGain > 0) {
          await rewardPlayer(sender, soloGain, 1, "Roleta Russa (solo)")
        }
      }
      const winnersWithoutHit = Boolean(result.hit)
        ? []
        : winners
      const consumedRrLuck = consumeRrLuckTokenOnWin(winnersWithoutHit, {
        lobbyId,
        reason: "rr-auto-win",
      })
      await distributeLobbyBuyInPool(winners, state.buyInPool, "Roleta Russa", getLobbyPayoutOptions(state))
      await sock.sendMessage(from, {
        text:
          `*CLICK*\n` +
          `✅ @${sender.split("@")[0]} sobreviveu e ultrapassou a aposta (*${betValue}*) no lobby *${lobbyId}*!\n` +
          `🏆 Vitória automática no modo solo.` +
          (consumedRrLuck.length > 0 ? "\n🍀 rrtokensorte consumido por vitória sem tiro." : ""),
        mentions: winners,
      })
      telemetry.incrementCounter("game.rr.completed", 1, {
        result: "solo-surpass",
      })
      telemetry.appendEvent("game.rr.completed", {
        groupId: from,
        lobbyId,
        players: state.players,
        loser: null,
        guaranteed: false,
        betMultiplier,
        betValue,
        surpassedBet: true,
        mode: "solo",
      })
      storage.clearGameState(from, stateKey)
      return true
    }

    if (result.hit) {
      if (result.allWin) {
        const shotPlayer = sender
        const winnersRaw = Array.isArray(result.winners) && result.winners.length > 0
          ? result.winners
          : (state.players || [])
        const winners = winnersRaw.filter((playerId) => playerId !== shotPlayer)
        winners.forEach((playerId) => {
          incrementUserStat(playerId, "gameRrWin", 1)
          incrementUserStat(playerId, "gameRrBetWin", 1)
          grantGameXp(playerId, GAME_XP_REWARDS.rrWin, "rr-win", { lobbyId, mode: "all-win" })
        })
        if (winners.length > 0) {
          const consumedRrLuck = consumeRrLuckTokenOnWin(winners, {
            lobbyId,
            reason: "rr-all-win",
          })
          await distributeLobbyBuyInPool(winners, state.buyInPool, "Roleta Russa", getLobbyPayoutOptions(state))
          if (consumedRrLuck.length > 0) {
            await sock.sendMessage(from, {
              text: `🍀 rrtokensorte consumido por vitória sem tiro: ${consumedRrLuck.map((p) => `@${p.split("@")[0]}`).join(" ")}`,
              mentions: consumedRrLuck,
            })
          }
        }
        await sock.sendMessage(from, {
          text:
            `💥 ${result.guaranteed ? "Garantido!!!" : "ACERTOU!"}\n` +
            `Lobby *${lobbyId}*\n` +
            `✅ O jogador da vez ultrapassou a aposta (*${betValue}*), mas quem tomou tiro não recebe prêmio.\n` +
            (winners.length > 0
              ? `🏆 Premiação para: ${winners.map((p) => `@${p.split("@")[0]}`).join(" ")}`
              : "Sem jogadores elegíveis para premiação nesta rodada."),
          mentions: [shotPlayer, ...winners],
        })
        telemetry.incrementCounter("game.rr.completed", 1, {
          result: result.guaranteed ? "guaranteed-all-win" : "all-win-surpass",
        })
        telemetry.appendEvent("game.rr.completed", {
          groupId: from,
          lobbyId,
          players: state.players,
          loser: shotPlayer,
          guaranteed: Boolean(result.guaranteed),
          betMultiplier,
          betValue,
          surpassedBet: true,
          mode: "multiplayer",
        })
        storage.clearGameState(from, stateKey)
        return true
      }

      const resenhaOn = isResenhaModeEnabled()
      await sock.sendMessage(from, {
        text: resenhaOn
          ? `💥 ${result.guaranteed ? "Garantido!!!" : "ACERTADO!"}\nLobby *${lobbyId}*\n🔴 @${result.loser.split("@")[0]} foi atingido e punido!`
          : `💥 ${result.guaranteed ? "Garantido!!!" : "ACERTADO!"}\nLobby *${lobbyId}*\n🔴 @${result.loser.split("@")[0]} foi atingido!`,
        mentions: [result.loser],
      })

      const rrLoss = state.players.length === 1
        ? soloRiskValue
        : (BASE_GAME_REWARD * rrCoinMultiplier)
      const rrTaken = economyService.debitCoinsFlexible(result.loser, rrLoss, {
        type: "game-loss",
        details: "Derrota em Roleta Russa",
        meta: { game: "rr", multiplier: rrCoinMultiplier },
      })
      if (rrTaken > 0) {
        incrementUserStat(result.loser, "moneyGameLost", rrTaken)
        await sock.sendMessage(from, {
          text: `💸 @${result.loser.split("@")[0]} perdeu *${rrTaken}* Epsteincoins na Roleta Russa.`,
          mentions: [result.loser],
        })
      }

      incrementUserStat(result.loser, "gameRrShotLoss", 1)
      grantGameXp(result.loser, GAME_XP_REWARDS.rrLoss, "rr-loss", { lobbyId, guaranteed: Boolean(result.guaranteed) })
      await applyRandomGamePunishment(result.loser, {
        severityMultiplier: resolvePunishmentSeverityFromLoserBet(state, result.loser, betMultiplier),
      })
      const winners = (state.players || []).filter((playerId) => playerId !== result.loser)
      winners.forEach((playerId) => {
        incrementUserStat(playerId, "gameRrWin", 1)
        incrementUserStat(playerId, "gameRrBetWin", 1)
        grantGameXp(playerId, GAME_XP_REWARDS.rrWin, "rr-win", { lobbyId, mode: "hit" })
      })
      const consumedRrLuck = consumeRrLuckTokenOnWin(winners, {
        lobbyId,
        reason: "rr-hit-win",
      })
      await distributeLobbyBuyInPool(winners, state.buyInPool, "Roleta Russa", getLobbyPayoutOptions(state))
      if (consumedRrLuck.length > 0) {
        await sock.sendMessage(from, {
          text: `🍀 rrtokensorte consumido por vitória sem tiro: ${consumedRrLuck.map((p) => `@${p.split("@")[0]}`).join(" ")}`,
          mentions: consumedRrLuck,
        })
      }
      telemetry.incrementCounter("game.rr.completed", 1, {
        result: result.guaranteed ? "guaranteed-hit" : "hit",
      })
      telemetry.appendEvent("game.rr.completed", {
        groupId: from,
        lobbyId,
        players: state.players,
        loser: result.loser,
        guaranteed: Boolean(result.guaranteed),
        betMultiplier,
        betValue,
        surpassedBet: Boolean(result.surpassedBet),
      })
      storage.clearGameState(from, stateKey)
    } else {
      const currentPlayer = roletaRussa.getCurrentPlayer(state)
      const clickMentions = Array.from(new Set([
        sender,
        ...(currentPlayer ? [currentPlayer] : []),
      ]))
      await sock.sendMessage(from, {
        text: `*CLICK*\n✅ @${sender.split("@")[0]} sobreviveu no lobby *${lobbyId}*!\n\n${roletaRussa.formatStatus(state)}`,
        mentions: clickMentions,
      })
      scheduleRrTurnTimeout(lobbyId, stateKey)
    }
    return true
  }

  if ((isStartCommand && normalizeUnifiedGameType(cmdArg1) === "embaralhado") && isGroup) {
    const blockedReason = getLobbyCreateBlockMessage("embaralhado", "Embaralhado")
    if (blockedReason) {
      await sock.sendMessage(from, { text: blockedReason })
      return true
    }

    const lobbyId = gameManager.createOptInSession(from, "embaralhado", 3, null, 120000, {
      initialPlayers: [sender],
      onLobbyWarning: createLobbyWarningCallback,
      onLobbyTimeout: createLobbyTimeoutCallback,
    })
    incrementUserStat(sender, "lobbiesCreated", 1)
    incrementUserStat(sender, "lobbiesJoined", 1)
    await sock.sendMessage(from, {
      text:
        `🔤 Embaralhado criado!\n` +
        `Lobby ID: *${lobbyId}*\n\n` +
        `Criador já entrou automaticamente no lobby.\n` +
        `Para entrar: *!entrar ${lobbyId}*\n` +
        `Para iniciar: *!começar ${lobbyId}*\n` +
        `Mínimo de 3 jogadores.`,
    })
    return true
  }

  if ((isStartCommand && ["memoria", "memória"].includes(normalizeUnifiedGameType(cmdArg1))) && isGroup) {
    const participants = await getCommandParticipants()
    if (participants.length < 3) {
      await sock.sendMessage(from, { text: "São necessários pelo menos 3 participantes para iniciar a Memória por comando." })
      return true
    }

    const startResult = await startPeriodicGame("memória", {
      triggeredBy: sender,
      automatic: false,
    })
    if (!startResult.ok) {
      await sock.sendMessage(from, { text: startResult.message })
    }
    return true
  }

  if ((isStartCommand && ["reacao", "reação"].includes(normalizeUnifiedGameType(cmdArg1))) && isGroup) {
    const blockedReason = getLobbyCreateBlockMessage("reação", "Reação")
    if (blockedReason) {
      await sock.sendMessage(from, { text: blockedReason })
      return true
    }

    const lobbyId = gameManager.createOptInSession(from, "reação", 3, null, 120000, {
      initialPlayers: [sender],
      onLobbyWarning: createLobbyWarningCallback,
      onLobbyTimeout: createLobbyTimeoutCallback,
    })
    incrementUserStat(sender, "lobbiesCreated", 1)
    incrementUserStat(sender, "lobbiesJoined", 1)
    await sock.sendMessage(from, {
      text:
        `⚡ Reação criada!\n` +
        `Lobby ID: *${lobbyId}*\n\n` +
        `Criador já entrou automaticamente no lobby.\n` +
        `Para entrar: *!entrar ${lobbyId}*\n` +
        `Para iniciar: *!começar ${lobbyId}*\n` +
        `Mínimo de 3 jogadores.`,
    })
    return true
  }

  if ((isStartCommand && normalizeUnifiedGameType(cmdArg1) === "comando") && isGroup) {
    const blockedReason = getLobbyCreateBlockMessage("comando", "Comando")
    if (blockedReason) {
      await sock.sendMessage(from, { text: blockedReason })
      return true
    }

    const lobbyId = gameManager.createOptInSession(from, "comando", 3, null, 120000, {
      initialPlayers: [sender],
      onLobbyWarning: createLobbyWarningCallback,
      onLobbyTimeout: createLobbyTimeoutCallback,
    })
    incrementUserStat(sender, "lobbiesCreated", 1)
    incrementUserStat(sender, "lobbiesJoined", 1)
    await sock.sendMessage(from, {
      text:
        `🎯 Comando criado!\n` +
        `Lobby ID: *${lobbyId}*\n\n` +
        `Criador já entrou automaticamente no lobby.\n` +
        `Para entrar: *!entrar ${lobbyId}*\n` +
        `Para iniciar: *!começar ${lobbyId}*\n` +
        `Mínimo de 3 jogadores.`,
    })
    return true
  }

  return false
}

async function handleGameMessageFlow(ctx) {
  const {
    sock,
    from,
    sender,
    text,
    msg,
    mentioned,
    isGroup,
    isCommand,
    storage,
    gameManager,
    caraOuCoroa,
    reacao,
    reação,
    embaralhado,
    memoria,
    memória,
    comando,
    startPeriodicGame,
    GAME_REWARDS,
    isResenhaModeEnabled,
    rewardPlayer,
    incrementUserStat,
    economyService, // NOTE: Assuming this is passed in context for Dobro ou Nada
    createPendingTargetForWinner,
  } = ctx

  const reactionGame = reacao || reação
  const memoryGame = memoria || memória

  if (!isGroup || isCommand) return false

  if (await caraOuCoroa.handleDobroGuess(ctx)) {
    return true
  }

  gameManager.incrementMessageCounter(from, sender)

  const reactionActive = storage.getGameState(from, "reacaoActive") || storage.getGameState(from, "reaçãoActive")
  if (reactionActive && reactionActive.started && !reactionActive.winner) {
    const reactionResult = reactionGame?.recordReaction(reactionActive, sender)
    if (!reactionResult) return false
    if (reactionResult.valid) {
      reactionActive.winner = sender
      storage.setGameState(from, "reacaoActive", reactionActive)
      storage.setGameState(from, "reaçãoActive", reactionActive)
      const results = reactionGame.getResults(reactionActive)
      const resenhaOn = isResenhaModeEnabled()

      await sock.sendMessage(from, {
        text: reactionGame.formatResults(reactionActive, results, resenhaOn),
        mentions: Array.from(new Set((results.reactions || []).map((r) => r.playerId))),
      })

      await rewardPlayer(sender, GAME_REWARDS.REACAO, 1, "Reação")
      incrementUserStat(sender, "gameReacaoWin", 1)
      const reactionLosers = (reactionActive.players || []).filter((playerId) => playerId !== sender)
      reactionLosers.forEach((playerId) => incrementUserStat(playerId, "gameReacaoLoss", 1))

      storage.clearGameState(from, "reacaoActive")
      storage.clearGameState(from, "reaçãoActive")
      return true
    }
  }

  const wsActive = storage.getGameState(from, "embaralhadoActive")
  if (wsActive && !wsActive.winner) {
    const result = embaralhado.checkAnswer(wsActive, sender, text)
    if (result.correct) {
      storage.setGameState(from, "embaralhadoActive", wsActive)
      const resenhaOn = isResenhaModeEnabled()
      await sock.sendMessage(from, {
        text: embaralhado.formatResults(wsActive, resenhaOn),
      })

      await rewardPlayer(sender, GAME_REWARDS.EMBARALHADO, 1, "Embaralhado")
      incrementUserStat(sender, "gameEmbaralhadoWin", 1)
      const embaralhadoLosers = (wsActive.players || []).filter((playerId) => playerId !== sender)
      embaralhadoLosers.forEach((playerId) => incrementUserStat(playerId, "gameEmbaralhadoLoss", 1))

      storage.clearGameState(from, "embaralhadoActive")
      return true
    }
  }

  const memActive = storage.getGameState(from, "memoriaActive") || storage.getGameState(from, "memóriaActive")
  if (memActive && !memActive.winner) {
    const memoryAnswerText = text.trim()
    const memoryAnswerOnlyPattern = /^[A-Za-z0-9]{12}$/
    if (memoryAnswerOnlyPattern.test(memoryAnswerText)) {
      const result = memoryGame?.recordAttempt(memActive, sender, memoryAnswerText)
      if (!result) return false
      if (result.correct) {
        storage.setGameState(from, "memoriaActive", memActive)
        storage.setGameState(from, "memóriaActive", memActive)
        const resenhaOn = isResenhaModeEnabled()
        await sock.sendMessage(from, {
          text: memoryGame.formatResults(memActive, resenhaOn),
          mentions: [result.winner],
        })

        await rewardPlayer(result.winner, GAME_REWARDS.MEMORIA, 1, "Memória")
        incrementUserStat(result.winner, "gameMemoriaWin", 1)
        const memoriaLosers = (memActive.players || []).filter((playerId) => playerId !== result.winner)
        memoriaLosers.forEach((playerId) => incrementUserStat(playerId, "gameMemoriaLoss", 1))

        storage.clearGameState(from, "memoriaActive")
        storage.clearGameState(from, "memóriaActive")
        return true
      }
    }
  }

  const uaActive = storage.getGameState(from, "comandoActive")
  if (uaActive) {
    comando.recordParticipant(uaActive, sender)
    storage.setGameState(from, "comandoActive", uaActive)
  }

  if (uaActive && uaActive.instruction.cmd === "silence") {
    comando.recordSilenceBreaker(uaActive, sender)
    storage.setGameState(from, "comandoActive", uaActive)
  } else if (uaActive && uaActive.instruction.cmd !== "silence") {
    const isCompliant = comando.isValidCompliance(uaActive, {
      text,
      mentioned,
      rawMsg: msg,
    })
    if (isCompliant) {
      comando.recordCompliance(uaActive, sender)
      storage.setGameState(from, "comandoActive", uaActive)
    }
  }

  if (gameManager.shouldTriggerPeriodicGame(from)) {
    const gameType = gameManager.pickRandom(["embaralhado", "reação", "comando", "memória"])
    const startResult = await startPeriodicGame(gameType, {
      triggeredBy: sender,
      automatic: true,
    })

    if (startResult.ok) {
      gameManager.recordPeriodicTrigger(from)
    } else {
      gameManager.resetMessageCounter(from)
    }
  }

  return false
}


module.exports = {
  handleGameCommands,
  handleGameMessageFlow,
}