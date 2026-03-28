const crypto = require("crypto")
const storage = require("../storage")
const economyService = require("../services/economyService")

const DOBRO_STATE_KEY = "dobroOuNada"
const SAFE_LIMIT_STATE_KEY = "coinSafeRateLimits"

function getDobroState(groupId) {
  return storage.getGameState(groupId, DOBRO_STATE_KEY) || null
}

function setDobroState(groupId, state) {
  storage.setGameState(groupId, DOBRO_STATE_KEY, state)
}

function startDobroOuNada(groupId, playerId) {
  const state = {
    groupId,
    initiator: playerId,
    activeStreak: 0,
    streakPlayer: null,
    doubledEnabled: false,
    activeSince: null,
    lastResult: null,
    lastWinner: null,
    lastLoser: null,
    lastTossAt: null,
    createdAt: Date.now(),
    enabled: true,
  }
  setDobroState(groupId, state)
  return state
}

function toggleDobroOuNada(groupId, playerId) {
  const current = getDobroState(groupId)
  if (current?.enabled) {
    storage.clearGameState(groupId, DOBRO_STATE_KEY)
    return { enabled: false, state: null }
  }

  const state = startDobroOuNada(groupId, playerId)
  return { enabled: true, state }
}

function formatDobroStatus(groupId, preloadedState = null) {
  const state = preloadedState || getDobroState(groupId)
  if (!state?.enabled) return "Dobro ou Nada não está ativo neste grupo."
  if (!state.streakPlayer) return "Sem sequência ativa"
  const resenhaOn = storage.isResenhaEnabled(groupId)

  let msg = `🔥 Sequência: ${state.activeStreak}/2 vitórias\n`
  msg += `🎯 Jogador: @${state.streakPlayer.split("@")[0]}\n`

  if (state.doubledEnabled && resenhaOn) {
    msg += "\n⚠️ DOBRO OU NADA ATIVADO!\n"
    msg += "🎲 Próxima derrota terá punição com duração dobrada"
  }

  return msg
}

function registerDobroWin(groupId, winnerId, result) {
  const state = getDobroState(groupId)
  if (!state?.enabled) return { active: false, state: null, doubledJustActivated: false, objectiveReachedNow: false }

  if (state.streakPlayer !== winnerId) {
    state.streakPlayer = winnerId
    state.activeStreak = 1
  } else {
    state.activeStreak++
  }

  const wasDoubled = !!state.doubledEnabled
  let objectiveReachedNow = false
  if (state.activeStreak >= 2) {
    objectiveReachedNow = true
    state.doubledEnabled = true
    if (!state.activeSince) state.activeSince = Date.now()
    // Ao atingir o objetivo, reinicia o ciclo para permitir nova recompensa em 2 vitórias.
    state.activeStreak = 0
  }

  state.lastResult = result
  state.lastWinner = winnerId
  state.lastLoser = null
  state.lastTossAt = Date.now()
  setDobroState(groupId, state)

  return {
    active: true,
    state,
    doubledJustActivated: !wasDoubled && state.doubledEnabled,
    objectiveReachedNow,
  }
}

function registerDobroLoss(groupId, loserId, result) {
  const state = getDobroState(groupId)
  if (!state?.enabled) return { active: false, state: null, triggeredDoublePunishment: false }

  const triggeredDoublePunishment = !!state.doubledEnabled && state.streakPlayer === loserId

  state.lastResult = result
  state.lastWinner = null
  state.lastLoser = loserId
  state.lastTossAt = Date.now()

  // Perder reinicia o ciclo de sequência atual.
  state.activeStreak = 0
  state.streakPlayer = null
  state.doubledEnabled = false
  state.activeSince = null

  setDobroState(groupId, state)
  return {
    active: true,
    state,
    triggeredDoublePunishment,
  }
}

function clearActivePunishmentByState(groupId, userId) {
  const activePunishments = storage.getActivePunishments()
  const punishment = activePunishments[groupId]?.[userId]
  if (!punishment) return
  if (punishment.timerId) clearTimeout(punishment.timerId)
  delete activePunishments[groupId][userId]
  if (Object.keys(activePunishments[groupId]).length === 0) delete activePunishments[groupId]
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

function isDobroChoiceCommand(cmd) {
  const normalized = String(cmd || "").toLowerCase().trim()
  return normalized === "!moeda continua" || normalized === "!moeda sair" ||
         normalized === "continua" || normalized === "sair" ||
         normalized === "sim" || normalized === "nao" || normalized === "não"
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

  if (!coinStreaks[from]) coinStreaks[from] = {}

  if (acertou && canChooseTargetPunishment) {
    const dobroOutcome = registerDobroWin(from, sender, resolvedResult)
    const rewardMultiplier = dobroOutcome.objectiveReachedNow ? 2 : 1

    coinStreaks[from][sender] = (coinStreaks[from][sender] || 0) + 1
    const streak = coinStreaks[from][sender]

    if (!coinStreakMax[from]) coinStreakMax[from] = {}
    coinStreakMax[from][sender] = Math.max(coinStreakMax[from][sender] || 0, streak)
    if (!coinHistoricalMax[from]) coinHistoricalMax[from] = 0
    coinHistoricalMax[from] = Math.max(coinHistoricalMax[from], streak)

    storage.setCoinStreaks(coinStreaks)
    storage.setCoinStreakMax(coinStreakMax)
    storage.setCoinHistoricalMax(coinHistoricalMax)

    if (typeof rewardWinner === "function" && (!dobroOutcome.active || dobroOutcome.objectiveReachedNow)) {
      await rewardWinner(sender, rewardMultiplier, wagerMultiplier)
    }

    let winText =
      `Você acertou! A moeda caiu em *${resolvedResult}*.\n` +
      `Streak: *${streak}*`

    if (dobroOutcome.active) {
      winText += `\nDobro ou Nada: ${dobroOutcome.state.activeStreak}/2\n`
      winText += "💬 *Continua ou sai?* Digite: !moeda continua (para mais!) ou !moeda sair (para ficar com seus ganhos)"
    }

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
    const dobroOutcome = registerDobroWin(from, sender, resolvedResult)
    const rewardMultiplier = dobroOutcome.objectiveReachedNow ? 2 : 1

    coinStreaks[from][sender] = (coinStreaks[from][sender] || 0) + 1
    const streak = coinStreaks[from][sender]

    if (!coinStreakMax[from]) coinStreakMax[from] = {}
    coinStreakMax[from][sender] = Math.max(coinStreakMax[from][sender] || 0, streak)
    if (!coinHistoricalMax[from]) coinHistoricalMax[from] = 0
    coinHistoricalMax[from] = Math.max(coinHistoricalMax[from], streak)

    storage.setCoinStreaks(coinStreaks)
    storage.setCoinStreakMax(coinStreakMax)
    storage.setCoinHistoricalMax(coinHistoricalMax)

    if (typeof rewardWinner === "function" && (!dobroOutcome.active || dobroOutcome.objectiveReachedNow)) {
      await rewardWinner(sender, rewardMultiplier, wagerMultiplier)
    }

    let winText = `Você acertou! A moeda caiu em *${resolvedResult}*.\n🔥 Streak: *${streak}*`
    if (dobroOutcome.active) {
      winText += `\nDobro ou Nada: ${dobroOutcome.state.activeStreak}/2`
      winText += "\n💬 *Continua ou sai?* Digite: !moeda continua (para mais!) ou !moeda sair (para ficar com seus ganhos)"
    }

    await sock.sendMessage(from, { text: winText })

    return true
  }

  const dobroOutcome = registerDobroLoss(from, sender, resolvedResult)
  const usedStreakSaver = typeof economyService.consumeStreakSaver === "function"
    ? economyService.consumeStreakSaver(sender)
    : false

  if (!usedStreakSaver) {
    delete coinStreaks[from][sender]
    if (Object.keys(coinStreaks[from]).length === 0) delete coinStreaks[from]
    storage.setCoinStreaks(coinStreaks)
  }

  const dobroTriggered = !!dobroOutcome.triggeredDoublePunishment
  const lossMultiplier = dobroTriggered ? 2 : 1
  if (typeof chargeLoser === "function") {
    await chargeLoser(sender, lossMultiplier, wagerMultiplier)
  }
  const lossLabel = (dobroTriggered && resenhaAveriguada[from])
    ? "💥 Sua streak foi resetada."
    : "💥 Sua streak foi resetada."
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
    const punishmentPrefix = dobroTriggered ? "Dobro ou Nada ativo: punição com duração dobrada.\n" : ""
    await sock.sendMessage(from, {
      text: `${punishmentPrefix}Punição sorteada: *${getPunishmentNameById(randomPunishment)}*`,
      mentions: [sender]
    })
    await applyPunishment(sock, from, sender, randomPunishment, { origin: "game" })

    if (dobroTriggered) {
      const extended = extendTimedPunishment(from, sender, 2)
      if (extended) {
        await sock.sendMessage(from, {
          text: "⏳ Duração da punição atual foi dobrada pelo Dobro ou Nada.",
          mentions: [sender]
        })
      }
    }
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
  const betMultiplier = rawBet ? Number.parseInt(rawBet, 10) : 1
  if (rawBet && !/^\d+$/.test(rawBet)) {
    await sock.sendMessage(from, {
      text: `❌ Aposta inválida! Use bet 1-10. Estado: ${profile.coins}. (Compat: Use: !moeda [1-10])`,
    })
    return true
  }
  if (!Number.isFinite(betMultiplier) || betMultiplier < 1 || betMultiplier > 10) {
    await sock.sendMessage(from, {
      text: `❌ Aposta inválida! Use bet 1-10. Estado: ${profile.coins}. (Compat: Use: !moeda [1-10])`,
    })
    return true
  }

  // Coin balance check & buy-in deduction
  const buyInAmount = betMultiplier * 10
  if (profile.coins < buyInAmount) {
    await sock.sendMessage(from, {
      text: `Você precisa de pelo menos *${buyInAmount}* moedas para fazer uma aposta de *${betMultiplier}x*. Saldo atual: ${profile.coins}`,
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

  // Deduct buy-in from player
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

  const resenhaOn = storage.isResenhaEnabled(from)
  const dobroState = getDobroState(from)
  const dobroToggleActive = Boolean(dobroState?.enabled)

  const coinPunishmentPending = storage.getCoinPunishmentPending()
  const coinGames = storage.getCoinGames()

  if (coinPunishmentPending[from]?.[sender]) {
    await sock.sendMessage(from, {
      text: resenhaOn
        ? "Você já tem uma escolha de punição pendente. Resolva isso antes de iniciar outra rodada."
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
    text: dobroToggleActive
      ? `Cara ou Coroa, ladrão?\nAposta: *${betMultiplier}x*\n⚠️ Dobro ou Nada está ATIVO para esta rodada de !moeda.`
      : `Cara ou Coroa, ladrão?\nAposta: *${betMultiplier}x*\nPunições só disparam a partir de *4x* em modo resenha.`
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
  startDobroOuNada,
  toggleDobroOuNada,
  formatDobroStatus,
  getDobroState,
  isCoinGuessCommand,
  handleCoinGuess,
  startCoinRound,
  sendStreakRanking,
  sendStreakValue,
}