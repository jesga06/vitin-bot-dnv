const crypto = require("crypto")

function generateLobbyId() {
  return crypto.randomBytes(3).toString("hex").toUpperCase()
}

function normalizeLobbyId(lobbyId = "") {
  return String(lobbyId).trim().toUpperCase()
}

// Game registry and opt-in management
const gameManager = {
  // Track opt-ins for multiplayer games: [groupJid]: { [gameId]: { players: [jid], createdAt } }
  optInSessions: {},

  // Get or create opt-in session for a game
  createOptInSession: (groupId, gameType, minPlayers, maxPlayers, timeoutMs = 30000) => {
    let gameId = generateLobbyId()
    if (!gameManager.optInSessions[groupId]) {
      gameManager.optInSessions[groupId] = {}
    }

    while (gameManager.optInSessions[groupId][gameId]) {
      gameId = generateLobbyId()
    }
    
    gameManager.optInSessions[groupId][gameId] = {
      gameType,
      players: [],
      minPlayers,
      maxPlayers,
      createdAt: Date.now(),
      timeoutId: null,
    }

    gameManager.optInSessions[groupId][gameId].timeoutId = setTimeout(() => {
      gameManager.clearOptInSession(groupId, gameId)
    }, timeoutMs)

    return gameId
  },

  // Add player to opt-in session
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

  // Check if session has enough players
  hasEnoughPlayers: (groupId, gameId) => {
    const normalizedGameId = normalizeLobbyId(gameId)
    const session = gameManager.optInSessions[groupId]?.[normalizedGameId]
    return session && session.players.length >= session.minPlayers
  },

  // Get session
  getOptInSession: (groupId, gameId) => {
    const normalizedGameId = normalizeLobbyId(gameId)
    return gameManager.optInSessions[groupId]?.[normalizedGameId] || null
  },

  // Clear session
  clearOptInSession: (groupId, gameId) => {
    const normalizedGameId = normalizeLobbyId(gameId)
    if (gameManager.optInSessions[groupId]?.[normalizedGameId]) {
      const session = gameManager.optInSessions[groupId][normalizedGameId]
      if (session.timeoutId) clearTimeout(session.timeoutId)
      delete gameManager.optInSessions[groupId][normalizedGameId]
    }
  },

  normalizeLobbyId,

  // Shuffle array (used for queue/turn order)
  shuffle: (arr) => {
    const copy = [...arr]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
  },

  // Pick random element
  pickRandom: (arr) => arr[Math.floor(Math.random() * arr.length)],

  // Periodic game trigger logic (for embaralhado, memória, último a obedecer)
  // Track message counts per group for periodic triggers
  messageCounters: {}, // [groupId]: { count: N, users: Set, lastReset: timestamp }

  incrementMessageCounter: (groupId, userId) => {
    if (!gameManager.messageCounters[groupId]) {
      gameManager.messageCounters[groupId] = {
        count: 0,
        users: new Set(),
        windowStartedAt: Date.now(),
        burstStartedAt: Date.now(),
        triggeredCount: 0, // how many times triggered in current 20min window
      }
    }

    const counter = gameManager.messageCounters[groupId]
    const now = Date.now()
    const windowMs = 20 * 60 * 1000 // 20 minutes
    const burstMs = 30 * 1000 // 30 seconds

    // Reset global window (trigger quota)
    if (now - counter.windowStartedAt > windowMs) {
      counter.count = 0
      counter.users.clear()
      counter.triggeredCount = 0
      counter.windowStartedAt = now
      counter.burstStartedAt = now
    }

    // Reset burst counter used for trigger threshold detection
    if (now - counter.burstStartedAt > burstMs) {
      counter.count = 0
      counter.users.clear()
      counter.burstStartedAt = now
    }

    counter.count++
    counter.users.add(userId)
  },

  // Check if should trigger periodic game (needs 10+ messages from 2+ users in 30s, max 4 times per 20min)
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
