const crypto = require("crypto")
const telemetry = require("./telemetryService")

function generateLobbyId() {
  return crypto.randomBytes(3).toString("hex").toUpperCase()
}

function normalizeLobbyId(lobbyId = "") {
  return String(lobbyId).trim().toUpperCase()
}

// Registro de jogos e gerenciamento de entrada
const gameManager = {
  // Rastreia entradas de jogos multiplayer por grupo e por sala
  optInSessions: {},

  // Obtém ou cria lobby para um jogo
  createOptInSession: (groupId, gameType, minPlayers, maxPlayers, timeoutMs = 120000, options = {}) => {
    let gameId = generateLobbyId()
    if (!gameManager.optInSessions[groupId]) {
      gameManager.optInSessions[groupId] = {}
    }

    while (gameManager.optInSessions[groupId][gameId]) {
      gameId = generateLobbyId()
    }
    
    const initialPlayers = Array.isArray(options?.initialPlayers)
      ? options.initialPlayers.filter(Boolean)
      : []
    const dedupedInitialPlayers = [...new Set(initialPlayers)]
    const cappedInitialPlayers = Number.isFinite(maxPlayers)
      ? dedupedInitialPlayers.slice(0, Math.max(0, maxPlayers))
      : dedupedInitialPlayers

    gameManager.optInSessions[groupId][gameId] = {
      gameType,
      players: cappedInitialPlayers,
      minPlayers,
      maxPlayers,
      createdAt: Date.now(),
      timeoutId: null,
      warningTimeoutId: null,
    }

    // Timeout principal: limpa o lobby após timeoutMs
    gameManager.optInSessions[groupId][gameId].timeoutId = setTimeout(() => {
      const session = gameManager.optInSessions[groupId]?.[gameId]
      if (session && typeof options?.onLobbyTimeout === "function") {
        options.onLobbyTimeout(groupId, gameId, gameType, session.players)
      }
      gameManager.clearOptInSession(groupId, gameId)
    }, timeoutMs)

    // Timeout de aviso: notifica 20 segundos antes de expirar
    const warningMs = Math.max(0, timeoutMs - 20000)
    gameManager.optInSessions[groupId][gameId].warningTimeoutId = setTimeout(() => {
      // Só avisa se o lobby ainda existe
      const session = gameManager.optInSessions[groupId]?.[gameId]
      if (session && typeof options?.onLobbyWarning === "function") {
        options.onLobbyWarning(groupId, gameId, gameType, session.players)
      }
    }, warningMs)

    return gameId
  },

  // Adiciona jogador ao lobby
  addPlayerToOptIn: (groupId, gameId, playerId) => {
    const normalizedGameId = normalizeLobbyId(gameId)
    const session = gameManager.optInSessions[groupId]?.[normalizedGameId]
    if (!session) return false

    const hasRoom = !Number.isFinite(session.maxPlayers) || session.players.length < session.maxPlayers
    if (!session.players.includes(playerId) && hasRoom) {
      session.players.push(playerId)
      return true
    }
    return false
  },

  // Obtém sessão
  getOptInSession: (groupId, gameId) => {
    const normalizedGameId = normalizeLobbyId(gameId)
    return gameManager.optInSessions[groupId]?.[normalizedGameId] || null
  },

  // Limpa sessão
  clearOptInSession: (groupId, gameId) => {
    const normalizedGameId = normalizeLobbyId(gameId)
    if (gameManager.optInSessions[groupId]?.[normalizedGameId]) {
      const session = gameManager.optInSessions[groupId][normalizedGameId]
      if (session.timeoutId) clearTimeout(session.timeoutId)
      if (session.warningTimeoutId) clearTimeout(session.warningTimeoutId)
      delete gameManager.optInSessions[groupId][normalizedGameId]
    }
  },

  normalizeLobbyId,

  // Embaralha array (usado para fila/turno)
  shuffle: (arr) => {
    const copy = [...arr]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
  },

  pickRandom: (arr) => arr[Math.floor(Math.random() * arr.length)],

  // Lógica de disparo dos jogos periódicos (embaralhado, memória, último a obedecer)
  // Rastreia contagem de mensagens por grupo pras ativações periódicas
  messageCounters: {}, // [groupId]: { count: N, users: Set, lastReset: timestamp }

  incrementMessageCounter: (groupId, userId) => {
    if (!gameManager.messageCounters[groupId]) {
      gameManager.messageCounters[groupId] = {
        count: 0,
        users: new Set(),
        windowStartedAt: Date.now(),
        burstStartedAt: Date.now(),
        triggeredCount: 0, // quantas vezes ativou na janela atual de 20 min
      }
    }

    const counter = gameManager.messageCounters[groupId]
    const now = Date.now()
    const windowMs = 20 * 60 * 1000 // 20 minutes
    const burstMs = 30 * 1000 // 30 seconds

    // Reinicia janela global (cota de ativação)
    if (now - counter.windowStartedAt > windowMs) {
      counter.count = 0
      counter.users.clear()
      counter.triggeredCount = 0
      counter.windowStartedAt = now
      counter.burstStartedAt = now
    }

    // Reinicia contador de rajada usado para detectar o threshold de ativação
    if (now - counter.burstStartedAt > burstMs) {
      counter.count = 0
      counter.users.clear()
      counter.burstStartedAt = now
    }

    counter.count++
    counter.users.add(userId)
  },

  // Verifica se deve puxar jogo periódico (10+ mensagens de 2+ usuários em 30s, máx. 4 vezes por 20 min)
  shouldTriggerPeriodicGame: (groupId) => {
    const counter = gameManager.messageCounters[groupId]
    if (!counter) return false

    return (
      counter.count >= 10 &&
      counter.users.size >= 2 &&
      counter.triggeredCount < 4
    )
  },

  recordPeriodicTrigger: (groupId) => {
    if (gameManager.messageCounters[groupId]) {
      gameManager.messageCounters[groupId].triggeredCount++
      gameManager.messageCounters[groupId].count = 0
      gameManager.messageCounters[groupId].users.clear()
      gameManager.messageCounters[groupId].burstStartedAt = Date.now()
      telemetry.incrementCounter("games.periodic.trigger", 1, {
        scope: "group",
      })
      telemetry.appendEvent("games.periodic.trigger", {
        groupId,
        triggeredCount: gameManager.messageCounters[groupId].triggeredCount,
      })
    }
  },

  resetMessageCounter: (groupId) => {
    if (gameManager.messageCounters[groupId]) {
      gameManager.messageCounters[groupId].count = 0
      gameManager.messageCounters[groupId].users.clear()
    }
  },
}

module.exports = gameManager
