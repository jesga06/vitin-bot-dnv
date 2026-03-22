const fs = require("fs")
const path = require("path")

const DATA_DIR = path.join(__dirname, ".data")
const STORAGE_FILE = path.join(DATA_DIR, "state.json")

// Garante que a pasta de dados exista
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

// cache
let stateCache = {
  mutedUsers: {},
  adminPrivileges: {},
  coinGames: {},
  coinPunishmentPending: {},
  resenhaAveriguada: {},
  coinStreaks: {},
  coinStreakMax: {},
  coinHistoricalMax: {},
  activePunishments: {},
  gameStates: {}, // [groupJid]: { gameType: {...state} }
}

// Carrega estado do disco ao iniciar
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

// Salva estado em disco (com debounce/throttle)
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
    saveTimeout = setTimeout(doSave, 5000) // salva após 5 segundos de inatividade
  }
}

// Funções de leitura e escrita para cada tipo de estado
const storage = {
  // Usuários mutados
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

  // Admins delegados do bot por grupo
  getAdminPrivileges: (groupId) => {
    if (groupId === undefined) return stateCache.adminPrivileges
    return stateCache.adminPrivileges[groupId] || {}
  },
  setAdminPrivileges: (groupIdOrData, maybeData) => {
    if (maybeData === undefined) {
      stateCache.adminPrivileges = groupIdOrData || {}
      saveState()
      return
    }
    stateCache.adminPrivileges[groupIdOrData] = maybeData
    saveState()
  },
  isDelegatedAdmin: (groupId, userId) => {
    return Boolean(stateCache.adminPrivileges[groupId]?.[userId])
  },

  // moeda
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

  // Punição pendente do !moeda
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

  // possível resenha
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

  // Streaks do moeda
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

  // Streak máximo do moeda
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

  // Máximo histórico do moeda
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

  // Punições ativas
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

  // Estados genéricos de jogos
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

  // Leitura/escrita direta para testes
  getCache: () => stateCache,
  setCache: (newCache) => {
    stateCache = newCache
    saveState(true)
  },

  // Persistência
  save: (immediate = false) => saveState(immediate),
  load: () => loadState(),
}

// Carrega estado ao importar
loadState()

module.exports = storage
