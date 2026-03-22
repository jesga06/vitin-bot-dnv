const fs = require("fs")
const path = require("path")

const DATA_DIR = path.join(__dirname, ".data")
const STORAGE_FILE = path.join(DATA_DIR, "state.json")

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

// In-memory state cache
let stateCache = {
  mutedUsers: {},
  coinGames: {},
  coinPunishmentPending: {},
  resenhaAveriguada: {},
  coinStreaks: {},
  coinStreakMax: {},
  coinHistoricalMax: {},
  activePunishments: {},
  gameStates: {}, // [groupJid]: { gameType: {...state} }
}

// Load state from disk on startup
function loadState() {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STORAGE_FILE, "utf8"))
      stateCache = { ...stateCache, ...data }
      console.log("Estado carregado do disco")
    }
  } catch (err) {
    console.error("Erro ao carregar estado:", err)
  }
}

// Save state to disk (debounced/throttled)
let saveTimeout = null
function saveState(immediate = false) {
  const doSave = () => {
    try {
      const serializedState = JSON.parse(
        JSON.stringify(stateCache, (key, value) => {
          if (key === "timerId") return undefined
          return value
        })
      )
      fs.writeFileSync(STORAGE_FILE, JSON.stringify(serializedState, null, 2), "utf8")
    } catch (err) {
      console.error("Erro ao salvar estado:", err)
    }
  }

  if (immediate) {
    clearTimeout(saveTimeout)
    doSave()
  } else {
    clearTimeout(saveTimeout)
    saveTimeout = setTimeout(doSave, 5000) // save after 5 seconds of inactivity
  }
}

// Getters and setters for each state type
const storage = {
  // Muted users
  getMutedUsers: (groupId) => {
    if (groupId === undefined) return stateCache.mutedUsers
    return stateCache.mutedUsers[groupId] || {}
  },
  setMutedUsers: (groupIdOrData, maybeData) => {
    if (maybeData === undefined) {
      stateCache.mutedUsers = groupIdOrData || {}
      saveState()
      return
    }
    stateCache.mutedUsers[groupIdOrData] = maybeData
    saveState()
  },

  // Coin games
  getCoinGames: (groupId) => {
    if (groupId === undefined) return stateCache.coinGames
    return stateCache.coinGames[groupId] || {}
  },
  setCoinGames: (groupIdOrData, maybeData) => {
    if (maybeData === undefined) {
      stateCache.coinGames = groupIdOrData || {}
      saveState()
      return
    }
    stateCache.coinGames[groupIdOrData] = maybeData
    saveState()
  },

  // Coin punishment pending
  getCoinPunishmentPending: (groupId) => {
    if (groupId === undefined) return stateCache.coinPunishmentPending
    return stateCache.coinPunishmentPending[groupId] || {}
  },
  setCoinPunishmentPending: (groupIdOrData, maybeData) => {
    if (maybeData === undefined) {
      stateCache.coinPunishmentPending = groupIdOrData || {}
      saveState()
      return
    }
    stateCache.coinPunishmentPending[groupIdOrData] = maybeData
    saveState()
  },

  // Resenha enabled
  getResenhaAveriguada: () => stateCache.resenhaAveriguada,
  setResenhaAveriguada: (map) => {
    stateCache.resenhaAveriguada = map || {}
    saveState()
  },
  isResenhaEnabled: (groupId) => stateCache.resenhaAveriguada[groupId] || false,
  setResenhaEnabled: (groupId, enabled) => {
    stateCache.resenhaAveriguada[groupId] = enabled
    saveState()
  },

  // Coin streaks
  getCoinStreaks: (groupId) => {
    if (groupId === undefined) return stateCache.coinStreaks
    return stateCache.coinStreaks[groupId] || {}
  },
  setCoinStreaks: (groupIdOrData, maybeData) => {
    if (maybeData === undefined) {
      stateCache.coinStreaks = groupIdOrData || {}
      saveState()
      return
    }
    stateCache.coinStreaks[groupIdOrData] = maybeData
    saveState()
  },

  // Coin streak max
  getCoinStreakMax: (groupId) => {
    if (groupId === undefined) return stateCache.coinStreakMax
    return stateCache.coinStreakMax[groupId] || {}
  },
  setCoinStreakMax: (groupIdOrData, maybeData) => {
    if (maybeData === undefined) {
      stateCache.coinStreakMax = groupIdOrData || {}
      saveState()
      return
    }
    stateCache.coinStreakMax[groupIdOrData] = maybeData
    saveState()
  },

  // Coin historical max
  getCoinHistoricalMax: (groupId) => {
    if (groupId === undefined) return stateCache.coinHistoricalMax
    return stateCache.coinHistoricalMax[groupId] || 0
  },
  setCoinHistoricalMax: (groupIdOrValue, maybeValue) => {
    if (maybeValue === undefined) {
      stateCache.coinHistoricalMax = groupIdOrValue || {}
      saveState()
      return
    }
    stateCache.coinHistoricalMax[groupIdOrValue] = maybeValue
    saveState()
  },

  // Active punishments
  getActivePunishments: (groupId) => {
    if (groupId === undefined) return stateCache.activePunishments
    return stateCache.activePunishments[groupId] || {}
  },
  setActivePunishments: (groupIdOrData, maybeData) => {
    if (maybeData === undefined) {
      stateCache.activePunishments = groupIdOrData || {}
      saveState()
      return
    }
    stateCache.activePunishments[groupIdOrData] = maybeData
    saveState()
  },

  // Generic game states
  getGameState: (groupId, gameType) => {
    if (!stateCache.gameStates[groupId]) return null
    return stateCache.gameStates[groupId][gameType] || null
  },
  getGameStates: (groupId) => {
    const states = stateCache.gameStates[groupId] || {}
    return { ...states }
  },
  setGameState: (groupId, gameType, state) => {
    if (!stateCache.gameStates[groupId]) stateCache.gameStates[groupId] = {}
    stateCache.gameStates[groupId][gameType] = state
    saveState()
  },
  clearGameState: (groupId, gameType) => {
    if (stateCache.gameStates[groupId]) {
      delete stateCache.gameStates[groupId][gameType]
      saveState()
    }
  },

  // Direct read/write for testing
  getCache: () => stateCache,
  setCache: (newCache) => {
    stateCache = newCache
    saveState(true)
  },

  // Persistence
  save: (immediate = false) => saveState(immediate),
  load: () => loadState(),
}

// Load state on module import
loadState()

module.exports = storage
