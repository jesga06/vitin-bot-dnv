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
  globalBlockedUsers: {},
  groupVoteThresholds: {},
  groupVoteSessions: {},
  coinGames: {},
  coinPunishmentPending: {},
  resenhaAveriguada: {},
  coinStreaks: {},
  coinStreakMax: {},
  coinHistoricalMax: {},
  coinRateLimits: {}, // [groupId]: { [playerId]: [timestamps] }
  activePunishments: {},
  groupFilters: {},
  gameStates: {}, // [groupJid]: { gameType: {...state} }
  playerProgress: {}, // [userId]: season/progression mirror for cross-system data
  seasonState: {
    currentSeason: 1,
    startDate: Date.now(),
    endDate: Date.now() + (42 * 24 * 60 * 60 * 1000),
    resetPolicy: "soft",
  },
  teams: {}, // [teamId]: { name, createdBy, lieutenants:[userId], members: [userId], createdAt, poolCoins, poolItems: {}, lastWithdrawAtByUser:{} }
  teamMembers: {}, // [userId]: teamId (for quick lookup)
  teamInvites: {}, // [teamId]: { [userId]: inviteStatus }
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
  // Bloqueio global de comandos
  getGlobalBlockedUsers: () => ({ ...(stateCache.globalBlockedUsers || {}) }),
  setGlobalBlockedUsers: (map) => {
    stateCache.globalBlockedUsers = map || {}
    saveState()
  },
  addGlobalBlockedUsers: (identities = [], meta = {}) => {
    if (!stateCache.globalBlockedUsers || typeof stateCache.globalBlockedUsers !== "object") {
      stateCache.globalBlockedUsers = {}
    }

    const added = []
    for (const rawIdentity of identities) {
      const normalized = String(rawIdentity || "").trim().toLowerCase().split(":")[0]
      if (!normalized) continue
      if (!stateCache.globalBlockedUsers[normalized]) {
        added.push(normalized)
      }
      stateCache.globalBlockedUsers[normalized] = {
        blockedAt: Date.now(),
        blockedBy: meta.blockedBy || "",
        blockedByName: meta.blockedByName || "",
      }
    }

    if (added.length > 0) saveState()
    return added
  },
  removeGlobalBlockedUsers: (identities = []) => {
    if (!stateCache.globalBlockedUsers || typeof stateCache.globalBlockedUsers !== "object") {
      stateCache.globalBlockedUsers = {}
      return []
    }

    const removed = []
    for (const rawIdentity of identities) {
      const normalized = String(rawIdentity || "").trim().toLowerCase().split(":")[0]
      if (!normalized) continue
      if (stateCache.globalBlockedUsers[normalized]) {
        delete stateCache.globalBlockedUsers[normalized]
        removed.push(normalized)
      }
    }

    if (removed.length > 0) saveState()
    return removed
  },
  isGloballyBlockedUser: (identity = "") => {
    const normalized = String(identity || "").trim().toLowerCase().split(":")[0]
    if (!normalized) return false
    const blocked = stateCache.globalBlockedUsers || {}
    if (blocked[normalized]) return true
    const userPart = normalized.split("@")[0]
    return Boolean(userPart && blocked[userPart])
  },

  // Configuração e sessões de votação por grupo
  getGroupVoteThreshold: (groupId) => {
    const raw = Number.parseInt(String(stateCache.groupVoteThresholds?.[groupId] ?? "4"), 10)
    return Number.isFinite(raw) && raw > 0 ? raw : 4
  },
  setGroupVoteThreshold: (groupId, threshold) => {
    const parsed = Number.parseInt(String(threshold || ""), 10)
    stateCache.groupVoteThresholds[groupId] = Number.isFinite(parsed) && parsed > 0 ? parsed : 4
    saveState()
  },
  getGroupVoteSessions: (groupId) => {
    const sessions = stateCache.groupVoteSessions?.[groupId]
    if (!sessions || typeof sessions !== "object") return {}
    return { ...sessions }
  },
  setGroupVoteSessions: (groupId, sessions = {}) => {
    if (!stateCache.groupVoteSessions || typeof stateCache.groupVoteSessions !== "object") {
      stateCache.groupVoteSessions = {}
    }
    stateCache.groupVoteSessions[groupId] = sessions || {}
    saveState()
  },
  clearGroupVoteSession: (groupId, targetId) => {
    if (!stateCache.groupVoteSessions?.[groupId]?.[targetId]) return
    delete stateCache.groupVoteSessions[groupId][targetId]
    if (Object.keys(stateCache.groupVoteSessions[groupId]).length === 0) {
      delete stateCache.groupVoteSessions[groupId]
    }
    saveState()
  },

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

  // Taxa de limite para coin toss (5 plays / 30 min)
  getCoinRateLimits: (groupId) => {
    if (groupId === undefined) return stateCache.coinRateLimits
    return stateCache.coinRateLimits[groupId] || {}
  },
  setCoinRateLimits: (groupIdOrData, maybeData) => {
    if (maybeData === undefined) {
      stateCache.coinRateLimits = groupIdOrData || {}
      saveState()
      return
    }
    stateCache.coinRateLimits[groupIdOrData] = maybeData
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

  // Filtros de moderação por grupo
  getGroupFilters: (groupId) => {
    if (groupId === undefined) return stateCache.groupFilters
    const list = stateCache.groupFilters[groupId]
    return Array.isArray(list) ? [...list] : []
  },
  setGroupFilters: (groupIdOrData, maybeData) => {
    if (maybeData === undefined) {
      stateCache.groupFilters = groupIdOrData || {}
      saveState()
      return
    }
    stateCache.groupFilters[groupIdOrData] = Array.isArray(maybeData) ? maybeData : []
    saveState()
  },

  // Progressão por jogador (base para temporadas/equipes/trades)
  getPlayerProgress: (userId) => {
    const key = String(userId || "").trim().toLowerCase()
    if (!key) return null
    const existing = stateCache.playerProgress?.[key]
    if (existing && typeof existing === "object") {
      return { ...existing }
    }
    return null
  },
  setPlayerProgress: (userId, progress = {}) => {
    const key = String(userId || "").trim().toLowerCase()
    if (!key) return false
    if (!stateCache.playerProgress || typeof stateCache.playerProgress !== "object") {
      stateCache.playerProgress = {}
    }
    stateCache.playerProgress[key] = progress && typeof progress === "object" ? progress : {}
    saveState()
    return true
  },
  getAllPlayerProgress: () => {
    const raw = stateCache.playerProgress && typeof stateCache.playerProgress === "object"
      ? stateCache.playerProgress
      : {}
    return { ...raw }
  },

  // Estado global da temporada
  getSeasonState: () => {
    const raw = stateCache.seasonState && typeof stateCache.seasonState === "object"
      ? stateCache.seasonState
      : {}
    return {
      currentSeason: Number.isFinite(raw.currentSeason) && raw.currentSeason > 0
        ? Math.floor(raw.currentSeason)
        : 1,
      startDate: Number.isFinite(raw.startDate) && raw.startDate > 0
        ? Math.floor(raw.startDate)
        : Date.now(),
      endDate: Number.isFinite(raw.endDate) && raw.endDate > 0
        ? Math.floor(raw.endDate)
        : (Date.now() + (42 * 24 * 60 * 60 * 1000)),
      resetPolicy: raw.resetPolicy === "hard" ? "hard" : "soft",
    }
  },
  setSeasonState: (seasonState = {}) => {
    const current = storage.getSeasonState()
    stateCache.seasonState = {
      currentSeason: Number.isFinite(seasonState.currentSeason) && seasonState.currentSeason > 0
        ? Math.floor(seasonState.currentSeason)
        : current.currentSeason,
      startDate: Number.isFinite(seasonState.startDate) && seasonState.startDate > 0
        ? Math.floor(seasonState.startDate)
        : current.startDate,
      endDate: Number.isFinite(seasonState.endDate) && seasonState.endDate > 0
        ? Math.floor(seasonState.endDate)
        : current.endDate,
      resetPolicy: seasonState.resetPolicy === "hard" ? "hard" : (seasonState.resetPolicy === "soft" ? "soft" : current.resetPolicy),
    }
    saveState()
    return { ...stateCache.seasonState }
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

  // Override group mappings (fase 1)
  getOverrideGroupMappings: () => {
    const raw = stateCache.gameStates?.__system__?.overrideGroupMappings
    if (!raw || typeof raw !== "object") return {}
    return { ...raw }
  },
  setOverrideGroupMappings: (mappings = {}) => {
    if (!stateCache.gameStates.__system__) stateCache.gameStates.__system__ = {}
    stateCache.gameStates.__system__.overrideGroupMappings = mappings && typeof mappings === "object"
      ? mappings
      : {}
    saveState()
  },

  // Team management
  getTeam: (teamId) => {
    const team = stateCache.teams[teamId]
    return team ? { ...team } : null
  },
  getAllTeams: () => {
    return Object.values(stateCache.teams).map(t => ({ ...t }))
  },
  createTeam: (teamId, name, createdBy) => {
    if (stateCache.teams[teamId]) return false
    stateCache.teams[teamId] = {
      teamId,
      name: String(name || "").slice(0, 50) || "Sem Nome",
      createdBy: String(createdBy || ""),
      lieutenants: [],
      members: [String(createdBy || "")],
      createdAt: Date.now(),
      poolCoins: 0,
      poolItems: {},
      lastWithdrawAtByUser: {},
    }
    stateCache.teamMembers[createdBy] = teamId
    stateCache.teamInvites[teamId] = {}
    saveState()
    return true
  },
  getTeamMembers: (teamId) => {
    const team = stateCache.teams[teamId]
    return team ? [...team.members] : []
  },
  addTeamMember: (teamId, userId) => {
    const team = stateCache.teams[teamId]
    if (!team) return false
    const normalizedUserId = String(userId || "")
    if (team.members.includes(normalizedUserId)) return false
    team.members.push(normalizedUserId)
    stateCache.teamMembers[normalizedUserId] = teamId
    if (stateCache.teamInvites[teamId]) {
      delete stateCache.teamInvites[teamId][normalizedUserId]
    }
    if (!Array.isArray(team.lieutenants)) team.lieutenants = []
    if (!team.lastWithdrawAtByUser || typeof team.lastWithdrawAtByUser !== "object") {
      team.lastWithdrawAtByUser = {}
    }
    saveState()
    return true
  },
  removeTeamMember: (teamId, userId) => {
    const team = stateCache.teams[teamId]
    if (!team) return false
    const normalizedUserId = String(userId || "")
    const idx = team.members.indexOf(normalizedUserId)
    if (idx < 0) return false
    team.members.splice(idx, 1)
    if (Array.isArray(team.lieutenants)) {
      team.lieutenants = team.lieutenants.filter((id) => id !== normalizedUserId)
    }
    if (team.lastWithdrawAtByUser && typeof team.lastWithdrawAtByUser === "object") {
      delete team.lastWithdrawAtByUser[normalizedUserId]
    }
    if (stateCache.teamMembers[normalizedUserId] === teamId) {
      delete stateCache.teamMembers[normalizedUserId]
    }
    saveState()
    return true
  },
  promoteTeamLieutenant: (teamId, userId) => {
    const team = stateCache.teams[teamId]
    if (!team) return false
    const normalizedUserId = String(userId || "")
    if (!Array.isArray(team.members) || !team.members.includes(normalizedUserId)) return false
    if (team.createdBy === normalizedUserId) return false
    if (!Array.isArray(team.lieutenants)) team.lieutenants = []
    if (team.lieutenants.includes(normalizedUserId)) return false
    team.lieutenants.push(normalizedUserId)
    saveState()
    return true
  },
  demoteTeamLieutenant: (teamId, userId) => {
    const team = stateCache.teams[teamId]
    if (!team) return false
    const normalizedUserId = String(userId || "")
    if (!Array.isArray(team.lieutenants) || !team.lieutenants.includes(normalizedUserId)) return false
    team.lieutenants = team.lieutenants.filter((id) => id !== normalizedUserId)
    saveState()
    return true
  },
  getTeamLieutenants: (teamId) => {
    const team = stateCache.teams[teamId]
    return team && Array.isArray(team.lieutenants) ? [...team.lieutenants] : []
  },
  isTeamOwnerOrLieutenant: (teamId, userId) => {
    const team = stateCache.teams[teamId]
    if (!team) return false
    const normalizedUserId = String(userId || "")
    if (team.createdBy === normalizedUserId) return true
    if (!Array.isArray(team.lieutenants)) return false
    return team.lieutenants.includes(normalizedUserId)
  },
  getTeamLastWithdrawAt: (teamId, userId) => {
    const team = stateCache.teams[teamId]
    if (!team || !team.lastWithdrawAtByUser || typeof team.lastWithdrawAtByUser !== "object") return 0
    return Math.max(0, Number(team.lastWithdrawAtByUser[String(userId || "")]) || 0)
  },
  setTeamLastWithdrawAt: (teamId, userId, timestamp = Date.now()) => {
    const team = stateCache.teams[teamId]
    if (!team) return false
    if (!team.lastWithdrawAtByUser || typeof team.lastWithdrawAtByUser !== "object") {
      team.lastWithdrawAtByUser = {}
    }
    team.lastWithdrawAtByUser[String(userId || "")] = Math.max(0, Math.floor(Number(timestamp) || Date.now()))
    saveState()
    return true
  },
  getUserTeamId: (userId) => {
    return stateCache.teamMembers[String(userId || "")] || null
  },
  inviteToTeam: (teamId, userId, status = "pending") => {
    if (!stateCache.teams[teamId]) return false
    if (!stateCache.teamInvites[teamId]) stateCache.teamInvites[teamId] = {}
    const normalizedUserId = String(userId || "")
    stateCache.teamInvites[teamId][normalizedUserId] = status
    saveState()
    return true
  },
  getTeamInvites: (teamId) => {
    const invites = stateCache.teamInvites[teamId]
    return invites ? { ...invites } : {}
  },
  deleteTeam: (teamId) => {
    const team = stateCache.teams[teamId]
    if (!team) return false
    team.members.forEach(userId => {
      if (stateCache.teamMembers[userId] === teamId) {
        delete stateCache.teamMembers[userId]
      }
    })
    delete stateCache.teams[teamId]
    delete stateCache.teamInvites[teamId]
    saveState()
    return true
  },
  addTeamPoolCoins: (teamId, amount) => {
    const team = stateCache.teams[teamId]
    if (!team) return false
    team.poolCoins = Math.max(0, (team.poolCoins || 0) + Math.floor(amount || 0))
    saveState()
    return true
  },
  removeTeamPoolCoins: (teamId, amount) => {
    const team = stateCache.teams[teamId]
    if (!team) return false
    const removeAmount = Math.floor(amount || 0)
    if ((team.poolCoins || 0) < removeAmount) return false
    team.poolCoins = Math.max(0, (team.poolCoins || 0) - removeAmount)
    saveState()
    return true
  },
  getTeamPoolCoins: (teamId) => {
    const team = stateCache.teams[teamId]
    return team ? Math.max(0, team.poolCoins || 0) : 0
  },
  addTeamPoolItem: (teamId, itemKey, quantity = 1) => {
    const team = stateCache.teams[teamId]
    if (!team) return false
    const qty = Math.max(1, Math.floor(quantity || 1))
    team.poolItems[itemKey] = (team.poolItems[itemKey] || 0) + qty
    saveState()
    return true
  },
  removeTeamPoolItem: (teamId, itemKey, quantity = 1) => {
    const team = stateCache.teams[teamId]
    if (!team) return false
    const qty = Math.max(1, Math.floor(quantity || 1))
    if ((team.poolItems[itemKey] || 0) < qty) return false
    team.poolItems[itemKey] = (team.poolItems[itemKey] || 0) - qty
    if (team.poolItems[itemKey] <= 0) delete team.poolItems[itemKey]
    saveState()
    return true
  },
  getTeamPoolItems: (teamId) => {
    const team = stateCache.teams[teamId]
    return team ? { ...team.poolItems } : {}
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
