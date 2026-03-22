const crypto = require("crypto")
const storage = require("../storage")

const DOBRO_STATE_KEY = "dobroOuNada"

function getDobroState(groupId) {
  return storage.getGameState(groupId, DOBRO_STATE_KEY) || null
}

function setDobroState(groupId, state) {
  storage.setGameState(groupId, DOBRO_STATE_KEY, state)
}

function clearDobroState(groupId) {
  storage.clearGameState(groupId, DOBRO_STATE_KEY)
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

function formatDobroStatus(groupId, preloadedState = null) {
  const state = preloadedState || getDobroState(groupId)
  if (!state?.enabled) return "Dobro ou Nada não está ativo neste grupo."
  if (!state.streakPlayer) return "Sem sequência ativa"
  const resenhaOn = storage.isResenhaEnabled(groupId)

  let msg = `🔥 Sequência: ${state.activeStreak}/4 vitórias\n`
  msg += `🎯 Jogador: ${state.streakPlayer.substring(0, 5)}...\n`

  if (state.doubledEnabled && resenhaOn) {
    msg += "\n⚠️ DOBRO OU NADA ATIVADO!\n"
    msg += "🎲 Próxima derrota terá punição com duração dobrada"
  }

  return msg
}

function registerDobroWin(groupId, winnerId, result) {
  const state = getDobroState(groupId)
  if (!state?.enabled) return { active: false, state: null, doubledJustActivated: false }

  if (state.streakPlayer !== winnerId) {
    state.streakPlayer = winnerId
    state.activeStreak = 1
  } else {
    state.activeStreak++
  }

  const wasDoubled = !!state.doubledEnabled
  if (state.activeStreak >= 4) {
    state.doubledEnabled = true
    if (!state.activeSince) state.activeSince = Date.now()
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

  // Losing resets the tracked streak cycle.
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

async function handleCoinGuess({
  sock,
  from,
  sender,
  cmd,
  isGroup,
  overrideJid,
  overridePhoneNumber,
  getPunishmentMenuText,
  getRandomPunishmentChoice,
  getPunishmentNameById,
  applyPunishment,
  clearPendingPunishment,
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

  const isOverride = sender === overrideJid || sender.split("@")[0] === overridePhoneNumber
  const acertou = isOverride || (cmd === game.resultado)

  if (!coinStreaks[from]) coinStreaks[from] = {}

  if (acertou && resenhaAveriguada[from]) {
    const dobroOutcome = registerDobroWin(from, sender, game.resultado)

    coinStreaks[from][sender] = (coinStreaks[from][sender] || 0) + 1
    const streak = coinStreaks[from][sender]

    if (!coinStreakMax[from]) coinStreakMax[from] = {}
    coinStreakMax[from][sender] = Math.max(coinStreakMax[from][sender] || 0, streak)
    if (!coinHistoricalMax[from]) coinHistoricalMax[from] = 0
    coinHistoricalMax[from] = Math.max(coinHistoricalMax[from], streak)

    storage.setCoinStreaks(coinStreaks)
    storage.setCoinStreakMax(coinStreakMax)
    storage.setCoinHistoricalMax(coinHistoricalMax)

    let winText =
      `Voce acertou! A moeda caiu em *${game.resultado}*.\n` +
      `Streak: *${streak}*\n`

    if (dobroOutcome.active) {
      winText += `Dobro ou Nada: ${dobroOutcome.state.activeStreak}/4\n`
      if (dobroOutcome.doubledJustActivated) {
        winText += "⚠️ DOBRO OU NADA ATIVADO! A próxima derrota terá punição com duração dobrada.\n"
      }
    }

    winText += `Escolha um alvo e a punicao dele em ate 30 segundos.\n${getPunishmentMenuText()}\nMarque alguem para punir.`

    await sock.sendMessage(from, { text: winText })

    const coinPunishmentPending = storage.getCoinPunishmentPending()
    if (!coinPunishmentPending[from]) coinPunishmentPending[from] = {}
    coinPunishmentPending[from][sender] = {
      mode: "target",
      target: null,
      createdAt: Date.now()
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
    const dobroOutcome = registerDobroWin(from, sender, game.resultado)

    coinStreaks[from][sender] = (coinStreaks[from][sender] || 0) + 1
    const streak = coinStreaks[from][sender]

    if (!coinStreakMax[from]) coinStreakMax[from] = {}
    coinStreakMax[from][sender] = Math.max(coinStreakMax[from][sender] || 0, streak)
    if (!coinHistoricalMax[from]) coinHistoricalMax[from] = 0
    coinHistoricalMax[from] = Math.max(coinHistoricalMax[from], streak)

    storage.setCoinStreaks(coinStreaks)
    storage.setCoinStreakMax(coinStreakMax)
    storage.setCoinHistoricalMax(coinHistoricalMax)

    let winText = `Voce acertou! A moeda caiu em *${game.resultado}*.\n🔥 Streak: *${streak}*`
    if (dobroOutcome.active) {
      winText += `\nDobro ou Nada: ${dobroOutcome.state.activeStreak}/4`
      if (dobroOutcome.doubledJustActivated && resenhaAveriguada[from]) {
        winText += "\n⚠️ DOBRO OU NADA ATIVADO! A próxima derrota terá punição com duração dobrada."
      }
    }

    await sock.sendMessage(from, { text: winText })

    return true
  }

  const dobroOutcome = registerDobroLoss(from, sender, game.resultado)

  delete coinStreaks[from][sender]
  if (Object.keys(coinStreaks[from]).length === 0) delete coinStreaks[from]
  storage.setCoinStreaks(coinStreaks)

  const dobroTriggered = !!dobroOutcome.triggeredDoublePunishment
  const lossLabel = (dobroTriggered && resenhaAveriguada[from])
    ? "💥 Sua streak foi resetada.\n⚠️ DOBRO OU NADA DISPAROU."
    : "💥 Sua streak foi resetada."
  await sock.sendMessage(from, {
    text: `A moeda caiu em *${game.resultado}*.\nSe fudeu.\n${lossLabel}`,
    mentions: [sender]
  })

  if (resenhaAveriguada[from]) {
    const randomPunishment = getRandomPunishmentChoice()
    const punishmentPrefix = dobroTriggered ? "Dobro ou Nada ativo: punição com duração dobrada.\n" : ""
    await sock.sendMessage(from, {
      text: `${punishmentPrefix}Punicao sorteada: *${getPunishmentNameById(randomPunishment)}*`,
      mentions: [sender]
    })
    await applyPunishment(sock, from, sender, randomPunishment)

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

async function startCoinRound({ sock, from, sender, cmd, prefix, isGroup }) {
  if (!(cmd === prefix + "moeda" && isGroup)) return false
  const resenhaOn = storage.isResenhaEnabled(from)

  const coinPunishmentPending = storage.getCoinPunishmentPending()
  const coinGames = storage.getCoinGames()

  if (coinPunishmentPending[from]?.[sender]) {
    await sock.sendMessage(from, {
      text: resenhaOn
        ? "Voce ja tem uma escolha de punição pendente. Resolva isso antes de iniciar outra rodada."
        : "Voce ja tem uma escolha pendente. Resolva isso antes de iniciar outra rodada."
    })
    return true
  }

  if (coinGames[from]?.[sender]) {
    await sock.sendMessage(from, {
      text: "Voce ja tem uma rodada em andamento. Responda com *cara* ou *coroa*."
    })
    return true
  }

  const resultado = crypto.randomInt(0, 2) === 0 ? "cara" : "coroa"

  if (!coinGames[from]) coinGames[from] = {}
  coinGames[from][sender] = {
    player: sender,
    resultado,
    createdAt: Date.now()
  }
  storage.setCoinGames(coinGames)

  await sock.sendMessage(from, {
    text: "Cara ou Coroa, ladrao?"
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
      `🏆 Recorde historico do grupo: *${hist}*\n\n` +
      `📊 Ranking de streak (max | atual):\n` +
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
  formatDobroStatus,
  getDobroState,
  clearDobroState,
  isCoinGuessCommand,
  handleCoinGuess,
  startCoinRound,
  sendStreakRanking,
  sendStreakValue,
}