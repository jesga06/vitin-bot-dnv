const crypto = require("crypto")
const storage = require("../storage")
const economyService = require("../services/economyService")
const SAFE_LIMIT_STATE_KEY = "coinSafeRateLimits"
const COIN_TOSS_BUY_IN = 25
const COIN_TOSS_WIN_PAYOUT = 50
const DOBRO_BUY_IN = 50

function getDobroStateKey(from, senderId) {
  return `dobroOuNada:${from}:${senderId}`
}

async function startDobroGame(ctx) {
  const { sock, from, sender, storage, incrementUserStat } = ctx
  const service = ctx.economyService || economyService
  const stateKey = getDobroStateKey(from, sender)
  if (storage.getGameState(from, stateKey)) {
    await sock.sendMessage(from, {
      text: `🎲 @${sender.split("@")[0]}, você já está em um jogo de Dobro ou Nada. Responda com *cara* ou *coroa*, ou use *!moeda continua* / *!moeda sair*.`,
      mentions: [sender],
    })
    return true
  }

  const currentCoins = Math.max(0, Math.floor(Number(service.getProfile(sender)?.coins) || 0))
  if (currentCoins < DOBRO_BUY_IN) {
    await sock.sendMessage(from, {
      text: `🎲 @${sender.split("@")[0]}, você precisa de *${DOBRO_BUY_IN}* Epsteincoins para iniciar o Dobro ou Nada. Saldo atual: *${currentCoins}*.`,
      mentions: [sender],
    })
    return true
  }

  const debited = service.debitCoins(sender, DOBRO_BUY_IN, {
    type: "game-buyin",
    details: "Entrada Dobro ou Nada",
    meta: { game: "dobro-ou-nada", buyInAmount: DOBRO_BUY_IN },
  })
  if (!debited) {
    await sock.sendMessage(from, {
      text: `🎲 @${sender.split("@")[0]}, não foi possível cobrar o buy-in de *${DOBRO_BUY_IN}*. Tente novamente.`,
      mentions: [sender],
    })
    return true
  }
  if (typeof incrementUserStat === "function") {
    incrementUserStat(sender, "moneyGameLost", DOBRO_BUY_IN)
  }

  const newState = {
    streak: 0,
    status: "waiting_for_guess", // 'waiting_for_guess' or 'waiting_for_choice'
    sender: sender,
    buyInAmount: DOBRO_BUY_IN,
    buyInCharged: true,
  }
  storage.setGameState(from, stateKey, newState)

  await sock.sendMessage(from, {
    text:
      `🎲 @${sender.split("@")[0]}, seu Dobro ou Nada começou!\n\n` +
      `Buy-in cobrado: *${DOBRO_BUY_IN}* Epsteincoins.\n` +
      `Se sair com streak 1, recebe *${DOBRO_BUY_IN}* (break-even).\n\n` +
      `Envie *cara* ou *coroa* para jogar.`,
    mentions: [sender],
  })
  return true
}

async function continueDobroGame(ctx) {
  const { sock, from, sender, storage } = ctx
  const stateKey = getDobroStateKey(from, sender)
  const state = storage.getGameState(from, stateKey)

  if (!state) {
    await sock.sendMessage(from, {
      text: `🎲 @${sender.split("@")[0]}, você não está em um jogo de Dobro ou Nada. Comece com *!moeda dobro*.`,
      mentions: [sender],
    })
    return true
  }

  if (state.status !== "waiting_for_choice") {
    await sock.sendMessage(from, {
      text: `🎲 @${sender.split("@")[0]}, você precisa acertar a rodada atual antes de continuar.`,
      mentions: [sender],
    })
    return true
  }

  state.status = "waiting_for_guess"
  storage.setGameState(from, stateKey, state)

  const buyInAmount = Math.max(1, Math.floor(Number(state.buyInAmount) || DOBRO_BUY_IN))
  const nextPotentialReward = buyInAmount * Math.pow(2, state.streak)

  await sock.sendMessage(from, {
    text:
      `Próxima rodada!\n` +
      `Se acertar, você poderá sair com *${nextPotentialReward}* Epsteincoins.\n` +
      `Se errar, perde apenas o buy-in já cobrado (*${buyInAmount}*).\n\n` +
      `Envie *cara* ou *coroa*.`,
    mentions: [sender],
  })
  return true
}

async function exitDobroGame(ctx) {
  const { sock, from, sender, storage, incrementUserStat } = ctx
  const service = ctx.economyService || economyService
  const stateKey = getDobroStateKey(from, sender)
  const state = storage.getGameState(from, stateKey)

  if (!state || state.status !== "waiting_for_choice") {
    await sock.sendMessage(from, {
      text: `🎲 @${sender.split("@")[0]}, não há um jogo ativo para sair ou você ainda não jogou a rodada.`,
      mentions: [sender],
    })
    return true
  }

  if (state.streak === 0) {
    storage.clearGameState(from, stateKey)
    await sock.sendMessage(from, { text: "Você saiu sem ganhos.", mentions: [sender] })
    // Dobro ou Nada exits at 0, 1, or 2 wins count as "safe" plays
    // This means the user quit before accumulating too many high-risk wins.
    if (state.streak <= 2) {
      recordSafeCoinPlay(from, sender)
    }
    return true
  }

  const buyInAmount = Math.max(1, Math.floor(Number(state.buyInAmount) || DOBRO_BUY_IN))
  const reward = buyInAmount * Math.pow(2, state.streak - 1)
  service.creditCoins(sender, reward, {
    type: "game-win",
    details: `Dobro ou Nada (streak ${state.streak})`,
    meta: { game: "dobro-ou-nada", streak: state.streak, buyInAmount },
  })
  if (typeof incrementUserStat === "function") {
    incrementUserStat(sender, "moneyGameWon", reward)
  }
  incrementUserStat(sender, "gameDobroWin", 1)
  incrementUserStat(sender, "gameDobroStreak", state.streak)
  storage.clearGameState(from, stateKey)

  // Dobro ou Nada exits at 0, 1, or 2 wins count as "safe" plays
  if (state.streak <= 2) {
    recordSafeCoinPlay(from, sender)
  }
  await sock.sendMessage(from, { text: `💰 @${sender.split("@")[0]} saiu e ganhou *${reward}* Epsteincoins com uma sequência de *${state.streak}* vitórias!`, mentions: [sender] })
  return true
}

function clearActivePunishmentByState(groupId, userId) {
  const activePunishments = storage.getActivePunishments()
  const punishment = activePunishments[groupId]?.[userId]
  if (!punishment) return
  if (punishment.timerId) clearTimeout(punishment.timerId)
  delete activePunishments[groupId][userId]
  storage.setActivePunishments(activePunishments)
}

function extendTimedPunishment(groupId, userId, durationMultiplier = 2) {
  const activePunishments = storage.getActivePunishments()
  const punishment = activePunishments[groupId]?.[userId]
  if (!punishment?.endsAt) return false

  const now = Date.now()
  const remainingMs = Math.max(0, punishment.endsAt - now)
  const extendedMs = Math.max(1, Math.floor(remainingMs * durationMultiplier))

  if (punishment.timerId) clearTimeout(punishment.timerId)
  punishment.endsAt = now + extendedMs
  punishment.timerId = setTimeout(() => {
    clearActivePunishmentByState(groupId, userId)
  }, extendedMs)

  storage.setActivePunishments(activePunishments)
  return true
}

function isCoinGuessCommand(cmd) {
  return cmd === "cara" || cmd === "coroa"
}

async function handleCoinGuess({
  sock,
  from,
  sender,
  cmd,
  isGroup,
  overrideChecksEnabled = true,
  overrideJid,
  overridePhoneNumber,
  overrideIdentifiers,
  getPunishmentMenuText,
  getRandomPunishmentChoice,
  getPunishmentNameById,
  applyPunishment,
  clearPendingPunishment,
  rewardWinner,
  chargeLoser,
  minPunishmentBet = 4,
  minWinnerTargetBet = 6,
}) {
  const coinGames = storage.getCoinGames()
  const coinStreaks = storage.getCoinStreaks()
  const coinStreakMax = storage.getCoinStreakMax()
  const coinHistoricalMax = storage.getCoinHistoricalMax()
  const resenhaAveriguada = storage.getResenhaAveriguada()

  const playerGame = isGroup ? coinGames[from]?.[sender] : null
  if (!playerGame || !isCoinGuessCommand(cmd)) return false

  const game = playerGame
  delete coinGames[from][sender]
  if (Object.keys(coinGames[from]).length === 0) delete coinGames[from]
  storage.setCoinGames(coinGames)

  const overrideIdentitySet = new Set(
    [overrideJid, overridePhoneNumber, ...(overrideIdentifiers || [])]
      .map((value) => String(value || "").trim().toLowerCase().split(":")[0])
      .filter(Boolean)
  )
  const normalizedSender = String(sender || "").trim().toLowerCase().split(":")[0]
  const senderUserPart = normalizedSender.split("@")[0]
  const isOverride = Boolean(overrideChecksEnabled) &&
    (overrideIdentitySet.has(normalizedSender) || overrideIdentitySet.has(senderUserPart))
  const resolvedResult = isOverride ? cmd : game.resultado
  const acertou = (cmd === resolvedResult)
  const wagerMultiplier = Math.max(1, Math.floor(Number(game?.betMultiplier) || 1))
  const canTriggerPunishment = Boolean(resenhaAveriguada[from]) && wagerMultiplier >= minPunishmentBet
  const canChooseTargetPunishment = Boolean(resenhaAveriguada[from]) && wagerMultiplier >= minWinnerTargetBet

  if (acertou && canChooseTargetPunishment) {
    if (!coinStreaks[from]) coinStreaks[from] = {}
    coinStreaks[from][sender] = (coinStreaks[from][sender] || 0) + 1
    const streak = coinStreaks[from][sender]

    if (!coinStreakMax[from]) coinStreakMax[from] = {}
    coinStreakMax[from][sender] = Math.max(coinStreakMax[from][sender] || 0, streak)
    if (!coinHistoricalMax[from]) coinHistoricalMax[from] = 0
    coinHistoricalMax[from] = Math.max(coinHistoricalMax[from], streak)

    storage.setCoinStreaks(coinStreaks)
    storage.setCoinStreakMax(coinStreakMax)
    storage.setCoinHistoricalMax(coinHistoricalMax)

    if (typeof rewardWinner === "function") await rewardWinner(sender, 1, wagerMultiplier)

    let winText =
      `Você acertou! A moeda caiu em *${resolvedResult}*.\n` +
      `Streak: *${streak}*`

    await sock.sendMessage(from, { text: winText, mentions: [sender] })

    await sock.sendMessage(from, {
      text:
        `Escolha um alvo e a punição dele em até 30 segundos.\n` +
        `${getPunishmentMenuText()}\n` +
        `Formato: @mention <número da punição>`,
      mentions: [sender],
    })

    const coinPunishmentPending = storage.getCoinPunishmentPending()
    if (!coinPunishmentPending[from]) coinPunishmentPending[from] = {}
    coinPunishmentPending[from][sender] = {
      mode: "target",
      target: null,
      createdAt: Date.now(),
      origin: "game",
      punishmentEligible: true,
      minPunishmentBet,
      roundBet: wagerMultiplier,
    }
    storage.setCoinPunishmentPending(coinPunishmentPending)

    setTimeout(() => {
      const coinPunishmentPendingTimeout = storage.getCoinPunishmentPending()
      if (coinPunishmentPendingTimeout[from]?.[sender]) {
        clearPendingPunishment(from, sender)
      }
    }, 30_000)

    return true
  }

  if (acertou) {
    if (!coinStreaks[from]) coinStreaks[from] = {}
    coinStreaks[from][sender] = (coinStreaks[from][sender] || 0) + 1
    const streak = coinStreaks[from][sender]

    if (!coinStreakMax[from]) coinStreakMax[from] = {}
    coinStreakMax[from][sender] = Math.max(coinStreakMax[from][sender] || 0, streak)
    if (!coinHistoricalMax[from]) coinHistoricalMax[from] = 0
    coinHistoricalMax[from] = Math.max(coinHistoricalMax[from], streak)

    storage.setCoinStreaks(coinStreaks)
    storage.setCoinStreakMax(coinStreakMax)
    storage.setCoinHistoricalMax(coinHistoricalMax)

    if (typeof rewardWinner === "function") await rewardWinner(sender, 1, wagerMultiplier)

    let winText = `Você acertou! A moeda caiu em *${resolvedResult}*.\n🔥 Streak: *${streak}*`

    await sock.sendMessage(from, { text: winText })

    return true
  }

  const usedStreakSaver = typeof economyService.consumeStreakSaver === "function"
    ? economyService.consumeStreakSaver(sender)
    : false

  if (!coinStreaks[from]) coinStreaks[from] = {}
  if (!usedStreakSaver) {
    delete coinStreaks[from][sender]
    if (Object.keys(coinStreaks[from]).length === 0) delete coinStreaks[from]
    storage.setCoinStreaks(coinStreaks)
  }

  if (typeof chargeLoser === "function") {
    await chargeLoser(sender, 1, wagerMultiplier)
  }
  const lossLabel = "💥 Sua streak foi resetada."
  await sock.sendMessage(from, {
    text:
      `A moeda caiu em *${resolvedResult}*.\nSe fudeu.\n${lossLabel}` +
      (usedStreakSaver ? "\n🛟 Salva-streak consumido: sua sequência foi preservada." : ""),
    mentions: [sender]
  })

  if (resenhaAveriguada[from]) {
    if (!canTriggerPunishment) {
      await sock.sendMessage(from, {
        text:
          `Aposta de *${wagerMultiplier}x* abaixo do minimo de *${minPunishmentBet}x* para punicoes no Cara ou Coroa.\n` +
          `Sem punicao nesta rodada.`,
        mentions: [sender],
      })
      return true
    }

    const randomPunishment = getRandomPunishmentChoice()
    await sock.sendMessage(from, {
      text: `Punição sorteada: *${getPunishmentNameById(randomPunishment)}*`,
      mentions: [sender]
    })
    await applyPunishment(sock, from, sender, randomPunishment, { origin: "game" })
  }

  return true
}

// Rate limiting: Track coin toss plays per player
const RATE_LIMIT_WINDOW_MS = 30 * 60 * 1000 // 30 minutes
const RATE_LIMIT_MAX_PLAYS = 5
const SAFE_RATE_LIMIT_WINDOW_MS = 4 * 60 * 60 * 1000 // 4 hours
const SAFE_RATE_LIMIT_MAX_PLAYS = 5

function checkCoinRateLimit(groupId, playerId) {
  const limits = storage.getCoinRateLimits(groupId) || {}
  const playerPlays = limits[playerId] || []
  const now = Date.now()
  const recentPlays = playerPlays.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS)
  return {
    allowed: recentPlays.length < RATE_LIMIT_MAX_PLAYS,
    playsUsed: recentPlays.length,
    playsRemaining: Math.max(0, RATE_LIMIT_MAX_PLAYS - recentPlays.length),
    recentPlays,
  }
}

function recordCoinPlay(groupId, playerId) {
  const limits = storage.getCoinRateLimits(groupId) || {}
  if (!limits[playerId]) limits[playerId] = []
  const now = Date.now()
  const recentPlays = limits[playerId].filter(ts => now - ts < RATE_LIMIT_WINDOW_MS)
  limits[playerId] = [...recentPlays, now]
  storage.setCoinRateLimits(groupId, limits)
}

function checkCoinSafeRateLimit(groupId, playerId) {
  const state = storage.getGameState(groupId, SAFE_LIMIT_STATE_KEY) || {}
  const playerPlays = Array.isArray(state[playerId]) ? state[playerId] : []
  const now = Date.now()
  const recentPlays = playerPlays.filter((ts) => now - ts < SAFE_RATE_LIMIT_WINDOW_MS)
  return {
    allowed: recentPlays.length < SAFE_RATE_LIMIT_MAX_PLAYS,
    playsUsed: recentPlays.length,
    playsRemaining: Math.max(0, SAFE_RATE_LIMIT_MAX_PLAYS - recentPlays.length),
    recentPlays,
  }
}

function recordSafeCoinPlay(groupId, playerId) {
  const state = storage.getGameState(groupId, SAFE_LIMIT_STATE_KEY) || {}
  const now = Date.now()
  const current = Array.isArray(state[playerId]) ? state[playerId] : []
  const recentPlays = current.filter((ts) => now - ts < SAFE_RATE_LIMIT_WINDOW_MS)
  state[playerId] = [...recentPlays, now]
  storage.setGameState(groupId, SAFE_LIMIT_STATE_KEY, state)
}

async function startCoinRound({ sock, from, sender, cmd, prefix, isGroup }) {
  if (!isGroup) return false

  const normalizedCmd = String(cmd || "").trim().toLowerCase()
  const coinMatch = normalizedCmd.match(/^!moeda(?:\s+(.+))?$/)
  if (!coinMatch) return false

  const rawBet = String(coinMatch[1] || "").trim()
  const profile = economyService.getProfile(sender)
  const resenhaOn = storage.isResenhaEnabled(from)
  const betMultiplier = rawBet ? Number.parseInt(rawBet, 10) : 2
  if (rawBet && !/^\d+$/.test(rawBet)) {
    await sock.sendMessage(from, {
      text: `❌ Aposta inválida! Use bet 2-10. Estado: ${profile.coins}. (Compat: Use: !moeda [2-10])`,
    })
    return true
  }
  if (!Number.isFinite(betMultiplier) || betMultiplier < 2 || betMultiplier > 10) {
    await sock.sendMessage(from, {
      text: `❌ Aposta inválida! Use bet 2-10. Estado: ${profile.coins}. (Compat: Use: !moeda [2-10])`,
    })
    return true
  }

  // Coin balance check & buy-in deduction
  const buyInAmount = COIN_TOSS_BUY_IN
  if (profile.coins < buyInAmount) {
    await sock.sendMessage(from, {
      text: `Você precisa de pelo menos *${buyInAmount}* moedas para jogar Cara ou Coroa. Saldo atual: ${profile.coins}`,
    })
    return true
  }

  // Rate limit check: 5 plays per 30 minutes
  const rateCheck = checkCoinRateLimit(from, sender)
  if (!rateCheck.allowed) {
    await sock.sendMessage(from, {
      text: `Você atingiu o limite de *${RATE_LIMIT_MAX_PLAYS}* jogadas em 30 minutos. Que tal jogar outros *!jogos* ?`,
    })
    return true
  }

  // Safe-limit check: 5 low-bet (<=3) tosses per 4 hours
  if (betMultiplier <= 3) {
    const safeCheck = checkCoinSafeRateLimit(from, sender)
    if (!safeCheck.allowed) {
      await sock.sendMessage(from, {
        text: `Você atingiu o limite de *${SAFE_RATE_LIMIT_MAX_PLAYS}* jogadas seguras (aposta ≤3) em 4 horas. Use aposta 4-10 ou jogue outros *!jogos*.`,
      })
      return true
    }
  }


  const coinPunishmentPending = storage.getCoinPunishmentPending()
  const coinGames = storage.getCoinGames()

  if (coinPunishmentPending[from]?.[sender]) {
    await sock.sendMessage(from, {
      text: resenhaOn
        ? "Você já tem uma escolha de punição pendente. Resolva isso antes de iniciar outra rodada." // This seems to be a copy-paste error in the original code, but I'll leave it.
        : "Você já tem uma escolha pendente. Resolva isso antes de iniciar outra rodada."
    })
    return true
  }

  if (coinGames[from]?.[sender]) {
    await sock.sendMessage(from, {
      text: "Você já tem uma rodada em andamento. Responda com *cara* ou *coroa*."
    })
    return true
  }

  // Deduct buy-in only after eligibility checks pass.
  const debitSuccess = economyService.debitCoins(sender, buyInAmount, {
    type: "coin_toss_buyin",
    group: from,
    betMultiplier,
  })
  if (!debitSuccess) {
    await sock.sendMessage(from, {
      text: `Erro ao descontar a aposta. Tente novamente.`,
    })
    return true
  }

  const resultado = crypto.randomInt(0, 2) === 0 ? "cara" : "coroa"

  if (!coinGames[from]) coinGames[from] = {}
  coinGames[from][sender] = {
    player: sender,
    resultado,
    betMultiplier,
    createdAt: Date.now()
  }
  storage.setCoinGames(coinGames)

  // Record the play in rate limit tracking
  recordCoinPlay(from, sender)
  if (betMultiplier <= 3) {
    recordSafeCoinPlay(from, sender)
  }

  await sock.sendMessage(from, {
    text:
      `Cara ou Coroa, ladrão?\n` +
      `Buy-in fixo: *${COIN_TOSS_BUY_IN}* | Prêmio por vitória: *${COIN_TOSS_WIN_PAYOUT}*.\n` +
      `Aposta: *${betMultiplier}x* (risco usado para regras de punição).\n` +
      `Punições só disparam a partir de *4x* em modo resenha.`
  })

  setTimeout(() => {
    const coinGamesTimeout = storage.getCoinGames()
    if (coinGamesTimeout[from]?.[sender]) {
      delete coinGamesTimeout[from][sender]
      if (Object.keys(coinGamesTimeout[from]).length === 0) delete coinGamesTimeout[from]
      storage.setCoinGames(coinGamesTimeout)
    }
  }, 30_000)

  return true
}

async function handleDobroGuess(ctx) {
  const {
    sock,
    from,
    sender,
    text,
    storage,
    economyService,
    incrementUserStat,
    overrideChecksEnabled,
    overrideJid,
    overridePhoneNumber,
    overrideIdentifiers,
  } = ctx

  const stateKey = getDobroStateKey(from, sender)
  const state = storage.getGameState(from, stateKey)
  const guess = text.trim().toLowerCase()

  if (state && state.status === "waiting_for_guess" && ["cara", "coroa"].includes(guess)) {
    const overrideIdentitySet = new Set(
      [overrideJid, overridePhoneNumber, ...(overrideIdentifiers || [])]
        .map((value) => String(value || "").trim().toLowerCase().split(":")[0])
        .filter(Boolean)
    )
    const normalizedSender = String(sender || "").trim().toLowerCase().split(":")[0]
    const senderUserPart = normalizedSender.split("@")[0]
    const isOverride = Boolean(overrideChecksEnabled) &&
      (overrideIdentitySet.has(normalizedSender) || overrideIdentitySet.has(senderUserPart))

    const coin = Math.random() < 0.5 ? "cara" : "coroa"
    const resolvedResult = isOverride ? guess : coin
    const win = guess === resolvedResult

    if (win) {
      state.streak += 1
      state.status = "waiting_for_choice"
      storage.setGameState(from, stateKey, state)

      const buyInAmount = Math.max(1, Math.floor(Number(state.buyInAmount) || DOBRO_BUY_IN))
      const currentReward = buyInAmount * Math.pow(2, state.streak - 1)
      const nextPotentialReward = buyInAmount * Math.pow(2, state.streak)

      await sock.sendMessage(from, {
        text: `✅ Você acertou! A moeda deu *${resolvedResult}*.\n\n` +
              `Sua sequência de vitórias é: *${state.streak}*.\n` +
              `Você pode usar *!moeda sair* para coletar *${currentReward}* Epsteincoins.\n` +
              `Ou use *!moeda continua* para arriscar e tentar ganhar *${nextPotentialReward}* Epsteincoins.`,
        mentions: [sender],
      })
    } else {
      const buyInAmount = Math.max(1, Math.floor(Number(state.buyInAmount) || DOBRO_BUY_IN))
      incrementUserStat(sender, "gameDobroLoss", 1)
      storage.clearGameState(from, stateKey)
      await sock.sendMessage(from, {
        text:
          `❌ Você errou! A moeda deu *${resolvedResult}*.\n\n` +
          `Você perdeu o buy-in de *${buyInAmount}* Epsteincoins. Fim de jogo.`,
        mentions: [sender],
      })
    }
    return true
  }
  return false
}

// Compat helper kept for older integrations/tests that still call the legacy function name.
function startDobroOuNada(from, senderId) {
  const stateKey = getDobroStateKey(from, senderId)
  storage.setGameState(from, stateKey, {
    streak: 0,
    status: "waiting_for_guess",
    sender: senderId,
    buyInAmount: DOBRO_BUY_IN,
    buyInCharged: false,
  })
}

// Compat helper used by older tests to inspect active Dobro state by group.
function getDobroState(from, senderId = "") {
  if (senderId) {
    return storage.getGameState(from, getDobroStateKey(from, senderId))
  }
  const states = storage.getGameStates(from) || {}
  const key = Object.keys(states).find((entry) => entry.startsWith(`dobroOuNada:${from}:`))
  const state = key ? states[key] : null
  if (!state) return null
  const playerFromKey = key.split(":").slice(2).join(":")
  return {
    ...state,
    activeStreak: Math.max(0, Math.floor(Number(state.streak) || 0)),
    streakPlayer: state.sender || playerFromKey,
  }
}

async function sendStreakRanking({ sock, from, cmd, prefix, isGroup }) {
  if (!(cmd === prefix + "streakranking" && isGroup)) return false

  const coinStreakMax = storage.getCoinStreakMax()
  const coinStreaks = storage.getCoinStreaks()
  const maxMap = coinStreakMax[from] || {}
  const currentMap = coinStreaks[from] || {}

  const entries = Object.keys(maxMap).map((jid) => ({
    jid,
    max: maxMap[jid] || 0,
    current: currentMap[jid] || 0
  }))

  if (entries.length === 0) {
    await sock.sendMessage(from, { text: "Sem dados de streak neste grupo ainda." })
    return true
  }

  entries.sort((a, b) => (b.max - a.max) || (b.current - a.current))
  const top = entries.slice(0, 10)
  const coinHistoricalMax = storage.getCoinHistoricalMax()
  const hist = coinHistoricalMax[from] || top[0].max || 0

  const rankingLines = top.map((u, i) =>
    `${i + 1}. @${u.jid.split("@")[0]} - max: *${u.max}* | atual: *${u.current}*`
  )

  await sock.sendMessage(from, {
    text:
      `Recorde historico do grupo: *${hist}*\n\n` +
      `Ranking de streak (max | atual):\n` +
      rankingLines.join("\n"),
    mentions: top.map((u) => u.jid)
  })

  return true
}

async function sendStreakValue({ sock, from, sender, mentioned, cmd, prefix, isGroup }) {
  if (!((cmd === prefix + "streak" || cmd.startsWith(prefix + "streak ")) && isGroup)) return false

  const coinStreaks = storage.getCoinStreaks()
  const alvo = mentioned[0] || sender
  const valor = coinStreaks[from]?.[alvo] || 0
  await sock.sendMessage(from, {
    text: `Streak de @${alvo.split("@")[0]}: *${valor}*`,
    mentions: [alvo]
  })
  return true
}

module.exports = {
  isCoinGuessCommand,
  handleCoinGuess,
  startCoinRound,
  sendStreakRanking,
  sendStreakValue,
  startDobroGame,
  startDobroOuNada,
  continueDobroGame,
  exitDobroGame,
  handleDobroGuess,
  getDobroState,
}