const fs = require("fs")
const path = require("path")
const telemetry = require("./telemetryService")

const DATA_DIR = path.join(__dirname, ".data")
const ECONOMY_FILE = path.join(DATA_DIR, "economy.json")
const DEFAULT_COINS = 0
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_COINS_BALANCE = 2_000_000_000
const MAX_COIN_OPERATION = 50_000_000
const MAX_ITEM_STACK = 100_000
const MAX_ITEM_OPERATION = 10_000
const MAX_LOOTBOX_OPEN_PER_CALL = 100
const MAX_FORGE_QUANTITY = 1_000

const PUNISHMENT_TYPE_NAMES = {
  1: "max. 5 caracteres",
  2: "1 msg/20s",
  3: "bloqueio 2 letras",
  4: "somente emojis/figurinhas",
  5: "mute total",
  6: "sem vogais",
  7: "prefixo urgente",
  8: "palavras da lista",
  9: "somente caixa alta",
  10: "repost pelo bot",
  11: "reação sugestiva",
  12: "chance de apagar",
  13: "máx. 3 palavras",
}

const PUNISHMENT_PASS_BASE_SELL = {
  1: 400,
  2: 520,
  3: 680,
  4: 820,
  5: 950,
  6: 980,
  7: 1020,
  8: 1150,
  9: 1250,
  10: 1400,
  11: 1520,
  12: 1650,
  13: 1750,
}

function normalizePassSeverity(value, fallback = 1) {
  const parsed = Math.floor(Number(value) || 0)
  return parsed > 0 ? parsed : fallback
}

function isValidPunishmentType(type) {
  const parsed = Math.floor(Number(type) || 0)
  return parsed >= 1 && parsed <= 13
}

function buildPunishmentPassKey(type, severity = 1) {
  const safeType = Math.floor(Number(type) || 0)
  const safeSeverity = normalizePassSeverity(severity, 1)
  return `passPunicao${safeType}x${safeSeverity}`
}

function parsePunishmentPassKey(itemKey = "") {
  const raw = String(itemKey || "")
  const match = raw.match(/^passPunicao(1[0-3]|[1-9])x(\d+)$/i)
  if (!match) return null
  const type = Number.parseInt(match[1], 10)
  const severity = normalizePassSeverity(match[2], 1)
  return { type, severity, key: buildPunishmentPassKey(type, severity) }
}

function getPunishmentPassDefinition(type, severity = 1) {
  if (!isValidPunishmentType(type)) return null
  const parsedType = Math.floor(Number(type) || 0)
  const parsedSeverity = normalizePassSeverity(severity, 1)
  const baseSell = Number(PUNISHMENT_PASS_BASE_SELL[parsedType]) || 400
  const sellValue = Math.floor(baseSell * parsedSeverity)
  return {
    key: buildPunishmentPassKey(parsedType, parsedSeverity),
    aliases: [],
    name: `Passe de Punição ${parsedType} (${parsedSeverity}x)`,
    price: sellValue,
    sellRate: 1,
    stackable: true,
    buyable: false,
    punishmentType: parsedType,
    severity: parsedSeverity,
    description: `Permite aplicar punição '${PUNISHMENT_TYPE_NAMES[parsedType]}' com severidade ${parsedSeverity}x. Item não comprável na loja.`,
  }
}

function pickRandomPunishmentType(excludedType = null) {
  const options = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].filter((type) => type !== excludedType)
  return options[Math.floor(Math.random() * options.length)]
}

const ITEM_DEFINITIONS = {
  escudo: {
    key: "escudo",
    aliases: ["shield"],
    name: "Escudo",
    price: 900,
    sellRate: 0.8,
    stackable: true,
    description: "Protege automaticamente contra 1 punição não administrativa.",
  },
  kronosQuebrada: {
    key: "kronosQuebrada",
    aliases: ["coroakronosquebrada"],
    name: "Coroa Kronos (Quebrada)",
    price: 18000,
    sellRate: 0.8,
    stackable: true,
    durationMs: 10 * DAY_MS,
    description: "+30% ganhos (cassino, roubo, trabalhos), +10% daily, -10% chance de ser roubado, +10% chance ao roubar e 2 escudos temporarios por dia.",
  },
  kronosVerdadeira: {
    key: "kronosVerdadeira",
    aliases: ["coroakronosverdadeira"],
    name: "Coroa Kronos Verdadeira",
    price: 70000,
    sellRate: 0.8,
    stackable: true,
    permanent: true,
    description: "+30% ganhos (cassino, roubo, trabalhos), +10% daily, -10% chance de ser roubado, +10% chance ao roubar e 2 escudos temporarios por dia. PERMANENTE!",
  },
  lootbox: {
    key: "lootbox",
    aliases: ["caixa", "lootcaixa"],
    name: "Lootbox",
    price: 900,
    sellRate: 0.8,
    stackable: true,
    description: "Use !lootbox <quantidade> para abrir. Cada lootbox contém efeitos aleatórios incríveis!",
  },
}

const SHIELD_PRICE = ITEM_DEFINITIONS.escudo.price

const DEFAULT_USER_STATS = {
  casinoPlays: 0,
  works: 0,
  steals: 0,
  stealAttempts: 0,
  stealFailedCount: 0,
  gameGuessExact: 0,
  gameGuessClosest: 0,
  gameGuessTie: 0,
  gameGuessLoss: 0,
  gameBatataWin: 0,
  gameBatataLoss: 0,
  gameCoinWin: 0,
  gameCoinLoss: 0,
  gameDobroWin: 0,
  gameDobroLoss: 0,
  gameDadosWin: 0,
  gameDadosLoss: 0,
  gameEmbaralhadoWin: 0,
  gameEmbaralhadoLoss: 0,
  gameMemoriaWin: 0,
  gameMemoriaLoss: 0,
  gameReacaoWin: 0,
  gameReacaoLoss: 0,
  gameRrTrigger: 0,
  gameRrBetWin: 0,
  gameRrShotLoss: 0,
  gameRrWin: 0,
  gameComandoWin: 0,
  gameComandoLoss: 0,
  lobbiesCreated: 0,
  lobbiesJoined: 0,
  lobbiesStarted: 0,
  moneyGameWon: 0,
  moneyGameLost: 0,
  moneyCasinoWon: 0,
  moneyCasinoLost: 0,
  dailyClaimCount: 0,
  lootboxesOpened: 0,
  lootboxPositiveRolls: 0,
  lootboxNegativeRolls: 0,
  punishmentsReceivedTotal: 0,
  punishmentsReceivedAdmin: 0,
  punishmentsReceivedGame: 0,
  coinsLifetimeEarned: 0,
  stealVictimCount: 0,
  stealVictimCoinsLost: 0,
  stealSuccessCount: 0,
  stealSuccessCoins: 0,
  itemsBought: 0,
  shieldsUsed: 0,
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

let economyCache = {
  users: {}, // [userJid]: { coins, items, buffs, cooldowns, stats, createdAt, updatedAt }
}

function normalizeUserId(userId = "") {
  return String(userId || "").trim().toLowerCase()
}

function capPositiveInt(value, cap, fallback = 0) {
  const parsed = Math.floor(Number(value) || 0)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, Math.max(1, Math.floor(Number(cap) || 1)))
}

function getOperationLimits() {
  return {
    maxCoinsBalance: MAX_COINS_BALANCE,
    maxCoinOperation: MAX_COIN_OPERATION,
    maxItemStack: MAX_ITEM_STACK,
    maxItemOperation: MAX_ITEM_OPERATION,
    maxLootboxOpenPerCall: MAX_LOOTBOX_OPEN_PER_CALL,
    maxForgeQuantity: MAX_FORGE_QUANTITY,
  }
}

function getPercentile(sortedValues, percentile) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) return 0
  const clamped = Math.max(0, Math.min(1, Number(percentile) || 0))
  const index = Math.floor((sortedValues.length - 1) * clamped)
  return Math.floor(Number(sortedValues[index]) || 0)
}

function buildEconomyHealthSnapshot() {
  const users = Object.values(economyCache.users || {})
  const totalUsers = users.length
  const balances = users
    .map((user) => Math.max(0, Math.floor(Number(user?.coins) || 0)))
    .sort((a, b) => a - b)

  const totalCoins = balances.reduce((sum, value) => sum + value, 0)
  const fundedUsers = balances.filter((value) => value > 0).length
  const zeroBalanceUsers = totalUsers - fundedUsers
  const meanCoins = totalUsers > 0 ? Math.floor(totalCoins / totalUsers) : 0
  const medianCoins = getPercentile(balances, 0.5)
  const p75Coins = getPercentile(balances, 0.75)
  const p90Coins = getPercentile(balances, 0.9)
  const p99Coins = getPercentile(balances, 0.99)
  const maxCoins = balances.length > 0 ? balances[balances.length - 1] : 0

  const kronosActiveUsers = users.filter((user) => {
    const hasVerdadeira = Boolean(user?.buffs?.kronosVerdadeiraActive)
    const kronosExpiresAt = Number(user?.buffs?.kronosExpiresAt) || 0
    return hasVerdadeira || kronosExpiresAt > Date.now()
  }).length

  const topBalance = maxCoins
  const topSharePct = totalCoins > 0
    ? Number(((topBalance / totalCoins) * 100).toFixed(2))
    : 0

  return {
    totalUsers,
    fundedUsers,
    zeroBalanceUsers,
    totalCoins,
    meanCoins,
    medianCoins,
    p75Coins,
    p90Coins,
    p99Coins,
    maxCoins,
    topSharePct,
    kronosActiveUsers,
  }
}

function recordDailyEconomyHealthSnapshot(reason = "runtime") {
  if (typeof telemetry.recordDailySnapshot !== "function") return
  const dayKey = getDayKey()
  const snapshot = buildEconomyHealthSnapshot()
  telemetry.recordDailySnapshot("economy", dayKey, {
    reason,
    ...snapshot,
  })
}

function loadEconomy() {
  try {
    if (!fs.existsSync(ECONOMY_FILE)) return
    const data = JSON.parse(fs.readFileSync(ECONOMY_FILE, "utf8"))
    economyCache = {
      users: {},
      ...data,
    }
    if (!economyCache.users || typeof economyCache.users !== "object") {
      economyCache.users = {}
    }
    recordDailyEconomyHealthSnapshot("load")
  } catch (err) {
    console.error("Erro ao carregar economia:", err)
    economyCache = { users: {} }
  }
}

function getDayKey(ts = Date.now()) {
  const d = new Date(ts)
  const yyyy = String(d.getFullYear())
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

let saveTimeout = null
function saveEconomy(immediate = false) {
  const doSave = () => {
    try {
      fs.writeFileSync(ECONOMY_FILE, JSON.stringify(economyCache, null, 2), "utf8")
      recordDailyEconomyHealthSnapshot("save")
    } catch (err) {
      console.error("Erro ao salvar economia:", err)
    }
  }

  if (immediate) {
    clearTimeout(saveTimeout)
    doSave()
    return
  }

  clearTimeout(saveTimeout)
  saveTimeout = setTimeout(doSave, 1500)
}

function migrateUserShape(user) {
  if (!user || typeof user !== "object") return
  if (!user.items || typeof user.items !== "object") user.items = {}
  
  // Migrar dados antigos de "kronos" para "kronosQuebrada"
  if (user.items.kronos && user.items.kronos > 0) {
    user.items.kronosQuebrada = (Number(user.items.kronosQuebrada) || 0) + Number(user.items.kronos)
    delete user.items.kronos
  }

  // Migrar item antigo de silenciar/mute para passe de punição tipo 5 (1x)
  if (user.items.mute && user.items.mute > 0) {
    const passKey = buildPunishmentPassKey(5, 1)
    user.items[passKey] = (Number(user.items[passKey]) || 0) + Number(user.items.mute)
    delete user.items.mute
  }
  
  if (!user.buffs || typeof user.buffs !== "object") {
    user.buffs = {
      kronosExpiresAt: 0,
      kronosTempShieldDayKey: null,
      kronosTempShields: 0,
      kronosVerdadeiraActive: false,
    }
  }
  if (!Number.isFinite(user.buffs.kronosExpiresAt)) user.buffs.kronosExpiresAt = 0
  if (typeof user.buffs.kronosTempShieldDayKey !== "string" && user.buffs.kronosTempShieldDayKey !== null) {
    user.buffs.kronosTempShieldDayKey = null
  }
  if (!Number.isFinite(user.buffs.kronosTempShields)) user.buffs.kronosTempShields = 0
  if (typeof user.buffs.kronosVerdadeiraActive !== "boolean") user.buffs.kronosVerdadeiraActive = false
  if (!user.cooldowns || typeof user.cooldowns !== "object") {
    user.cooldowns = {
      dailyClaimKey: null,
      workAt: 0,
      stealAt: 0,
      stealDailyKey: null,
      stealTargets: {},
      stealAttemptsToday: 0,
    }
  }
  if (!user.cooldowns.stealTargets || typeof user.cooldowns.stealTargets !== "object") {
    user.cooldowns.stealTargets = {}
  }
  if (!Number.isFinite(user.cooldowns.workAt) || user.cooldowns.workAt < 0) {
    user.cooldowns.workAt = 0
  }
  if (!Number.isFinite(user.cooldowns.stealAt) || user.cooldowns.stealAt < 0) {
    user.cooldowns.stealAt = 0
  }
  if (!Number.isFinite(user.cooldowns.stealAttemptsToday)) {
    user.cooldowns.stealAttemptsToday = 0
  }
  if (typeof user.cooldowns.stealDailyKey !== "string" && user.cooldowns.stealDailyKey !== null) {
    user.cooldowns.stealDailyKey = null
  }
  if (!user.stats || typeof user.stats !== "object") {
    user.stats = { ...DEFAULT_USER_STATS }
  }
  Object.keys(DEFAULT_USER_STATS).forEach((key) => {
    if (!Number.isFinite(user.stats[key])) {
      user.stats[key] = DEFAULT_USER_STATS[key]
    }
  })
  if (!Array.isArray(user.transactions)) user.transactions = []

  // retroompatibilidade com sistema antigo (caso eu volte algum commit).
  if (Number.isFinite(user.shields) && user.shields > 0) {
    user.items.escudo = (Number(user.items.escudo) || 0) + Math.floor(user.shields)
    delete user.shields
  }
}

function ensureUser(userId) {
  const normalized = normalizeUserId(userId)
  if (!normalized) return null

  if (!economyCache.users[normalized]) {
    const now = Date.now()
    economyCache.users[normalized] = {
      coins: DEFAULT_COINS,
      items: {},
      buffs: {
        kronosExpiresAt: 0,
        kronosTempShieldDayKey: null,
        kronosTempShields: 0,
        kronosVerdadeiraActive: false,
      },
      cooldowns: {
        dailyClaimKey: null,
        workAt: 0,
        stealAt: 0,
        stealDailyKey: null,
        stealTargets: {},
        stealAttemptsToday: 0,
      },
      stats: {
        ...DEFAULT_USER_STATS,
      },
      createdAt: now,
      updatedAt: now,
    }
    saveEconomy()
  }

  migrateUserShape(economyCache.users[normalized])
  return economyCache.users[normalized]
}

function touchUser(user) {
  user.updatedAt = Date.now()
}

function pushTransaction(userId, entry = {}) {
  const user = ensureUser(userId)
  if (!user) return
  const next = {
    at: Date.now(),
    type: String(entry.type || "system"),
    deltaCoins: Math.floor(Number(entry.deltaCoins) || 0),
    balanceAfter: getCoins(userId),
    details: entry.details || "",
    meta: entry.meta || null,
  }
  user.transactions.push(next)
  if (user.transactions.length > 200) {
    user.transactions = user.transactions.slice(-200)
  }
  touchUser(user)
  saveEconomy()
}

function getCoins(userId) {
  const user = ensureUser(userId)
  if (!user) return 0
  return Number.isFinite(user.coins) ? user.coins : DEFAULT_COINS
}

function setCoins(userId, amount, transaction = null) {
  const user = ensureUser(userId)
  if (!user) return { ok: false, balance: 0, delta: 0 }

  const previous = getCoins(userId)
  const next = Math.min(MAX_COINS_BALANCE, Math.max(0, Math.floor(Number(amount) || 0)))
  user.coins = next
  touchUser(user)
  saveEconomy()

  const delta = next - previous
  if (transaction) {
    pushTransaction(userId, {
      ...transaction,
      deltaCoins: delta,
    })
  }

  return { ok: true, previous, balance: next, delta }
}

function creditCoins(userId, amount, transaction = null) {
  const user = ensureUser(userId)
  const parsedAmount = capPositiveInt(amount, MAX_COIN_OPERATION, 0)
  if (!user || parsedAmount <= 0) return 0

  const current = getCoins(userId)
  const room = Math.max(0, MAX_COINS_BALANCE - current)
  const applied = Math.min(parsedAmount, room)
  if (applied <= 0) return 0

  user.coins = Math.max(0, current + applied)
  user.stats.coinsLifetimeEarned = Math.max(0, Math.floor(Number(user.stats.coinsLifetimeEarned) || 0) + applied)
  touchUser(user)
  saveEconomy()
  if (transaction) {
    pushTransaction(userId, {
      ...transaction,
      deltaCoins: applied,
    })
  }
  const txType = transaction?.type || "unspecified"
  telemetry.incrementCounter("economy.minted", applied, { source: txType })
  telemetry.appendEvent("economy.credit", {
    userId: normalizeUserId(userId),
    amount: applied,
    source: txType,
  })
  return applied
}

function debitCoins(userId, amount, transaction = null) {
  const user = ensureUser(userId)
  const parsedAmount = Math.floor(Number(amount) || 0)
  if (!user || parsedAmount <= 0) return false

  if (getCoins(userId) < parsedAmount) return false

  user.coins = getCoins(userId) - parsedAmount
  touchUser(user)
  saveEconomy()
  if (transaction) {
    pushTransaction(userId, {
      ...transaction,
      deltaCoins: -parsedAmount,
    })
  }
  const txType = transaction?.type || "unspecified"
  telemetry.incrementCounter("economy.burned", parsedAmount, { source: txType })
  telemetry.appendEvent("economy.debit", {
    userId: normalizeUserId(userId),
    amount: parsedAmount,
    source: txType,
  })
  return true
}

function debitCoinsFlexible(userId, amount, transaction = null) {
  const user = ensureUser(userId)
  const parsedAmount = Math.floor(Number(amount) || 0)
  if (!user || parsedAmount <= 0) return 0
  const available = getCoins(userId)
  const taken = Math.min(available, parsedAmount)
  user.coins = available - taken
  touchUser(user)
  saveEconomy()
  if (transaction && taken > 0) {
    pushTransaction(userId, {
      ...transaction,
      deltaCoins: -taken,
    })
  }
  if (taken > 0) {
    const txType = transaction?.type || "unspecified"
    telemetry.incrementCounter("economy.burned", taken, { source: txType })
    telemetry.appendEvent("economy.debitFlexible", {
      userId: normalizeUserId(userId),
      requested: parsedAmount,
      taken,
      source: txType,
    })
  }
  return taken
}

function normalizeItemKey(itemKey = "") {
  const normalized = String(itemKey || "").trim().toLowerCase()
  if (!normalized) return null

  if (["mute", "silenciar", "silencio", "silêncio"].includes(normalized)) {
    return buildPunishmentPassKey(5, 1)
  }

  const passAlias = normalized.match(/^(?:passe|pass)(?:punicao)?(1[0-3]|[1-9])(?:x(\d+))?$/)
  if (passAlias) {
    const type = Number.parseInt(passAlias[1], 10)
    const severity = normalizePassSeverity(passAlias[2], 1)
    return buildPunishmentPassKey(type, severity)
  }

  const passKey = parsePunishmentPassKey(normalized)
  if (passKey) {
    return passKey.key
  }

  const entries = Object.values(ITEM_DEFINITIONS)
  const found = entries.find((item) => {
    const canonical = String(item.key || "").toLowerCase()
    const aliases = (item.aliases || []).map((alias) => String(alias || "").toLowerCase())
    return canonical === normalized || aliases.includes(normalized)
  })
  return found?.key || null
}

function getItemDefinition(itemKey = "") {
  const key = normalizeItemKey(itemKey)
  if (!key) return null
  const passParsed = parsePunishmentPassKey(key)
  if (passParsed) {
    return getPunishmentPassDefinition(passParsed.type, passParsed.severity)
  }
  return ITEM_DEFINITIONS[key] || null
}

function getItemQuantity(userId, itemKey) {
  const user = ensureUser(userId)
  const key = normalizeItemKey(itemKey)
  if (!user || !key) return 0
  return Math.max(0, Math.floor(Number(user.items[key]) || 0))
}

function setItemQuantity(userId, itemKey, quantity) {
  const user = ensureUser(userId)
  const key = normalizeItemKey(itemKey)
  if (!user || !key) return 0
  const next = Math.max(0, Math.floor(Number(quantity) || 0))
  if (next <= 0) {
    delete user.items[key]
  } else {
    user.items[key] = next
  }
  touchUser(user)
  saveEconomy()
  return next
}

function grantKronosBenefits(userId, itemKey = "kronosQuebrada", quantity = 1) {
  const user = ensureUser(userId)
  const qty = Math.max(1, Math.floor(Number(quantity) || 1))
  const def = getItemDefinition(itemKey)
  if (!user || !def) return
  
  const now = Date.now()
  
  if (itemKey === "kronosVerdadeira") {
    // Coroa Kronos Verdadeira é permanente
    user.buffs.kronosVerdadeiraActive = true
    touchUser(user)
    saveEconomy()
  } else {
    // Coroa Kronos Quebrada tem duração temporária
    const currentEnd = Math.max(Number(user.buffs.kronosExpiresAt) || 0, now)
    user.buffs.kronosExpiresAt = currentEnd + (def.durationMs * qty)
    touchUser(user)
    saveEconomy()
  }
}

function removeKronosDuration(userId, itemKey = "kronosQuebrada", quantity = 1) {
  const user = ensureUser(userId)
  const qty = Math.max(1, Math.floor(Number(quantity) || 1))
  const def = getItemDefinition(itemKey)
  if (!user || !def) return
  
  if (itemKey === "kronosVerdadeira") {
    // Não pode remover Coroa Kronos Verdadeira (é permanente)
    return
  }
  
  const now = Date.now()
  const currentEnd = Math.max(Number(user.buffs.kronosExpiresAt) || 0, now)
  user.buffs.kronosExpiresAt = Math.max(now, currentEnd - (def.durationMs * qty))
  touchUser(user)
  saveEconomy()
}

function addItem(userId, itemKey, quantity = 1) {
  const key = normalizeItemKey(itemKey)
  const qty = capPositiveInt(quantity, MAX_ITEM_OPERATION, 0)
  if (!key || qty <= 0) return 0
  const current = getItemQuantity(userId, key)
  const next = setItemQuantity(userId, key, Math.min(MAX_ITEM_STACK, current + qty))
  if (key === "kronosQuebrada") {
    const applied = Math.max(0, next - current)
    if (applied > 0) grantKronosBenefits(userId, "kronosQuebrada", applied)
  } else if (key === "kronosVerdadeira") {
    const applied = Math.max(0, next - current)
    if (applied > 0) grantKronosBenefits(userId, "kronosVerdadeira", applied)
  }
  return next
}

function removeItem(userId, itemKey, quantity = 1) {
  const key = normalizeItemKey(itemKey)
  const qty = capPositiveInt(quantity, MAX_ITEM_OPERATION, 0)
  if (!key || qty <= 0) return 0
  const current = getItemQuantity(userId, key)
  const next = Math.max(0, current - qty)
  setItemQuantity(userId, key, next)
  if (key === "kronosQuebrada") {
    removeKronosDuration(userId, "kronosQuebrada", Math.min(current, qty))
  } else if (key === "kronosVerdadeira") {
    // Não pode remover Coroa Kronos Verdadeira
  }
  return next
}

function getShields(userId) {
  refreshKronosTemporaryShields(userId)
  const user = ensureUser(userId)
  if (!user) return 0
  const permanentShields = getItemQuantity(userId, "escudo")
  const temporaryShields = Math.max(0, Math.floor(Number(user.buffs.kronosTempShields) || 0))
  return permanentShields + temporaryShields
}

function addShields(userId, quantity = 1) {
  return addItem(userId, "escudo", quantity)
}

function consumeShield(userId) {
  refreshKronosTemporaryShields(userId)
  const user = ensureUser(userId)
  if (!user) return false

  const temporaryShields = Math.max(0, Math.floor(Number(user.buffs.kronosTempShields) || 0))
  if (temporaryShields > 0) {
    user.buffs.kronosTempShields = temporaryShields - 1
    touchUser(user)
    saveEconomy()
    incrementStat(userId, "shieldsUsed", 1)
    return true
  }

  if (getItemQuantity(userId, "escudo") <= 0) return false
  removeItem(userId, "escudo", 1)
  incrementStat(userId, "shieldsUsed", 1)
  return true
}

function buyShield(userId) {
  return buyItem(userId, "escudo", 1, userId).ok
}

function hasActiveKronos(userId) {
  const user = ensureUser(userId)
  if (!user) return false
  
  // Verifica Coroa Kronos Verdadeira (permanente)
  if (user.buffs.kronosVerdadeiraActive) {
    return true
  }
  
  // Verifica Coroa Kronos Quebrada (temporária)
  const expiresAt = Number(user.buffs.kronosExpiresAt) || 0
  return expiresAt > Date.now()
}

function refreshKronosTemporaryShields(userId) {
  const user = ensureUser(userId)
  if (!user) return

  const expiresAt = Number(user.buffs.kronosExpiresAt) || 0
  const kronosQuebradaActive = expiresAt > Date.now()
  const kronosVerdadeiraActive = Boolean(user.buffs.kronosVerdadeiraActive)
  const kronosActive = kronosQuebradaActive || kronosVerdadeiraActive
  const dayKey = getDayKey()

  if (!kronosActive) {
    if ((Number(user.buffs.kronosTempShields) || 0) > 0 || user.buffs.kronosTempShieldDayKey !== null) {
      user.buffs.kronosTempShields = 0
      user.buffs.kronosTempShieldDayKey = null
      touchUser(user)
      saveEconomy()
    }
    return
  }

  if (user.buffs.kronosTempShieldDayKey !== dayKey) {
    user.buffs.kronosTempShieldDayKey = dayKey
    user.buffs.kronosTempShields = 2
    touchUser(user)
    saveEconomy()
  }
}

function applyKronosGainMultiplier(userId, amount, type = "generic") {
  const base = Math.max(0, Math.floor(Number(amount) || 0))
  if (base <= 0) return 0
  if (!hasActiveKronos(userId)) return base
  if (type === "daily") return Math.floor(base * 1.1)
  if (type === "casino" || type === "steal" || type === "work") return Math.floor(base * 1.3)
  return base
}

function getStealSuccessChance(victimId, thiefId = "") {
  const baseChance = 0.3
  const protection = hasActiveKronos(victimId) ? 0.1 : 0
  const thiefBuff = hasActiveKronos(thiefId) ? 0.1 : 0
  return Math.max(0.05, Math.min(0.95, baseChance - protection + thiefBuff))
}

function canAttemptSteal(thiefId, victimId) {
  const user = ensureUser(thiefId)
  if (!user) return { ok: false, reason: "invalid-user" }

  const dayKey = getDayKey()
  if (user.cooldowns.stealDailyKey !== dayKey) {
    user.cooldowns.stealDailyKey = dayKey
    user.cooldowns.stealTargets = {}
    user.cooldowns.stealAttemptsToday = 0
    touchUser(user)
    saveEconomy()
  }

  const victim = normalizeUserId(victimId)
  if (user.cooldowns.stealTargets[victim]) {
    return { ok: false, reason: "same-target-today" }
  }

  if ((user.cooldowns.stealAttemptsToday || 0) >= 3) {
    return { ok: false, reason: "daily-limit-reached" }
  }

  return { ok: true }
}

function registerStealAttempt(thiefId, victimId) {
  const user = ensureUser(thiefId)
  if (!user) return
  const dayKey = getDayKey()
  if (user.cooldowns.stealDailyKey !== dayKey) {
    user.cooldowns.stealDailyKey = dayKey
    user.cooldowns.stealTargets = {}
    user.cooldowns.stealAttemptsToday = 0
  }
  const victim = normalizeUserId(victimId)
  user.cooldowns.stealTargets[victim] = true
  user.cooldowns.stealAttemptsToday = (Math.floor(Number(user.cooldowns.stealAttemptsToday) || 0) + 1)
  touchUser(user)
  saveEconomy()
}

function buyItem(buyerId, itemKey, quantity = 1, recipientId = buyerId) {
  const item = getItemDefinition(itemKey)
  const qty = Math.floor(Number(quantity) || 0)
  if (!item || qty <= 0) {
    return { ok: false, reason: "invalid-item" }
  }

  if (qty > MAX_ITEM_OPERATION) {
    return { ok: false, reason: "quantity-too-large", maxQuantity: MAX_ITEM_OPERATION }
  }

  const recipientCurrent = getItemQuantity(recipientId, item.key)
  if (recipientCurrent + qty > MAX_ITEM_STACK) {
    return {
      ok: false,
      reason: "stack-limit",
      maxStack: MAX_ITEM_STACK,
      current: recipientCurrent,
    }
  }

  if (item.buyable === false) {
    return { ok: false, reason: "not-for-sale" }
  }

  const totalCost = item.price * qty
  if (!debitCoins(buyerId, totalCost, {
    type: "buy",
    details: `Compra de ${qty}x ${item.key}`,
    meta: { item: item.key, quantity: qty, recipientId: normalizeUserId(recipientId) },
  })) {
    return { ok: false, reason: "insufficient-funds", totalCost }
  }

  addItem(recipientId, item.key, qty)
  incrementStat(buyerId, "itemsBought", qty)
  if (normalizeUserId(recipientId) !== normalizeUserId(buyerId)) {
    pushTransaction(recipientId, {
      type: "buy-received",
      deltaCoins: 0,
      details: `Recebeu ${qty}x ${item.key} via compra de ${normalizeUserId(buyerId)}`,
      meta: { buyer: normalizeUserId(buyerId), item: item.key, quantity: qty },
    })
  }
  telemetry.incrementCounter("economy.item.buy", qty, {
    item: item.key,
  })
  telemetry.appendEvent("economy.item.buy", {
    buyerId: normalizeUserId(buyerId),
    recipientId: normalizeUserId(recipientId),
    item: item.key,
    quantity: qty,
    totalCost,
  })
  return { ok: true, totalCost, itemKey: item.key, quantity: qty }
}

function sellItem(userId, itemKey, quantity = 1) {
  const item = getItemDefinition(itemKey)
  const qty = Math.floor(Number(quantity) || 0)
  if (!item || qty <= 0) return { ok: false, reason: "invalid-item" }

  if (qty > MAX_ITEM_OPERATION) {
    return { ok: false, reason: "quantity-too-large", maxQuantity: MAX_ITEM_OPERATION }
  }

  const available = getItemQuantity(userId, item.key)
  if (available < qty) return { ok: false, reason: "insufficient-items", available }

  removeItem(userId, item.key, qty)
  const valuePerUnit = Math.floor(item.price * (Number(item.sellRate) || 0.8))
  const total = valuePerUnit * qty
  creditCoins(userId, total, {
    type: "sell",
    details: `Venda de ${qty}x ${item.key}`,
    meta: { item: item.key, quantity: qty },
  })
  telemetry.incrementCounter("economy.item.sell", qty, {
    item: item.key,
  })
  telemetry.appendEvent("economy.item.sell", {
    userId: normalizeUserId(userId),
    item: item.key,
    quantity: qty,
    total,
  })
  return { ok: true, total, quantity: qty, itemKey: item.key }
}

function transferCoins(fromUserId, toUserId, amount) {
  const parsedAmount = Math.floor(Number(amount) || 0)
  if (parsedAmount <= 0) return { ok: false, reason: "invalid-amount" }
  if (parsedAmount > MAX_COIN_OPERATION) {
    return { ok: false, reason: "amount-too-large", maxAmount: MAX_COIN_OPERATION }
  }

  const receiverCoins = getCoins(toUserId)
  const room = Math.max(0, MAX_COINS_BALANCE - receiverCoins)
  if (room <= 0) {
    return { ok: false, reason: "receiver-max-balance", maxBalance: MAX_COINS_BALANCE }
  }

  const effectiveAmount = Math.min(parsedAmount, room)
  if (effectiveAmount <= 0) {
    return { ok: false, reason: "receiver-max-balance", maxBalance: MAX_COINS_BALANCE }
  }

  if (!debitCoins(fromUserId, effectiveAmount, {
    type: "donate-out",
    details: `Doação para ${normalizeUserId(toUserId)}`,
    meta: { to: normalizeUserId(toUserId) },
  })) return { ok: false, reason: "insufficient-funds" }
  creditCoins(toUserId, effectiveAmount, {
    type: "donate-in",
    details: `Recebido de ${normalizeUserId(fromUserId)}`,
    meta: { from: normalizeUserId(fromUserId) },
  })
  telemetry.incrementCounter("economy.coins.transfer", effectiveAmount)
  telemetry.appendEvent("economy.coins.transfer", {
    fromUserId: normalizeUserId(fromUserId),
    toUserId: normalizeUserId(toUserId),
    amount: effectiveAmount,
  })
  return { ok: true, amount: effectiveAmount }
}

function transferItem(fromUserId, toUserId, itemKey, quantity = 1) {
  const item = getItemDefinition(itemKey)
  const qty = Math.floor(Number(quantity) || 0)
  if (!item || qty <= 0) return { ok: false, reason: "invalid-item" }

  if (qty > MAX_ITEM_OPERATION) {
    return { ok: false, reason: "quantity-too-large", maxQuantity: MAX_ITEM_OPERATION }
  }

  const receiverCurrent = getItemQuantity(toUserId, item.key)
  if (receiverCurrent + qty > MAX_ITEM_STACK) {
    return {
      ok: false,
      reason: "stack-limit",
      maxStack: MAX_ITEM_STACK,
      current: receiverCurrent,
    }
  }

  const available = getItemQuantity(fromUserId, item.key)
  if (available < qty) return { ok: false, reason: "insufficient-items", available }

  removeItem(fromUserId, item.key, qty)
  addItem(toUserId, item.key, qty)
  pushTransaction(fromUserId, {
    type: "donate-item-out",
    deltaCoins: 0,
    details: `Doou ${qty}x ${item.key} para ${normalizeUserId(toUserId)}`,
    meta: { to: normalizeUserId(toUserId), item: item.key, quantity: qty },
  })
  pushTransaction(toUserId, {
    type: "donate-item-in",
    deltaCoins: 0,
    details: `Recebeu ${qty}x ${item.key} de ${normalizeUserId(fromUserId)}`,
    meta: { from: normalizeUserId(fromUserId), item: item.key, quantity: qty },
  })
  telemetry.incrementCounter("economy.item.transfer", qty, {
    item: item.key,
  })
  telemetry.appendEvent("economy.item.transfer", {
    fromUserId: normalizeUserId(fromUserId),
    toUserId: normalizeUserId(toUserId),
    item: item.key,
    quantity: qty,
  })
  return { ok: true, itemKey: item.key, quantity: qty }
}

function attemptSteal(thiefId, victimId, requestedAmount = 0) {
  if (normalizeUserId(thiefId) === normalizeUserId(victimId)) {
    return { ok: false, reason: "same-user" }
  }

  const canSteal = canAttemptSteal(thiefId, victimId)
  if (!canSteal.ok) {
    return { ok: false, reason: canSteal.reason }
  }

  registerStealAttempt(thiefId, victimId)
  incrementStat(thiefId, "stealAttempts", 1)

  const victimCoins = getCoins(victimId)
  if (victimCoins <= 0) {
    return { ok: false, reason: "victim-empty" }
  }

  const chance = getStealSuccessChance(victimId, thiefId)
  const roll = Math.random()
  const success = roll <= chance

  if (!success) {
    const penalty = Math.max(20, Math.floor(Math.min(getCoins(thiefId), 50 + Math.random() * 100)))
    const lost = debitCoinsFlexible(thiefId, penalty, {
      type: "steal-failed",
      details: `Falhou ao roubar ${normalizeUserId(victimId)}`,
      meta: { victim: normalizeUserId(victimId) },
    })
    incrementStat(thiefId, "stealFailedCount", 1)
    return {
      ok: true,
      success: false,
      lost,
      successChance: chance,
      rolled: roll,
    }
  }

  const requested = Math.max(0, Math.floor(Number(requestedAmount) || 0))
  const randomBase = Math.floor(50 + Math.random() * 151)
  const baseAmount = requested > 0 ? requested : randomBase
  const stealBase = Math.min(victimCoins, baseAmount)

  if (stealBase <= 0) {
    return { ok: false, reason: "invalid-amount" }
  }

  const gained = applyKronosGainMultiplier(thiefId, stealBase, "steal")
  const removed = debitCoinsFlexible(victimId, stealBase, {
    type: "stolen-from",
    details: `Roubado por ${normalizeUserId(thiefId)}`,
    meta: { thief: normalizeUserId(thiefId) },
  })
  creditCoins(thiefId, gained, {
    type: "steal-success",
    details: `Roubo em ${normalizeUserId(victimId)}`,
    meta: { victim: normalizeUserId(victimId), base: stealBase },
  })

  if (removed > 0) {
    incrementStat(victimId, "stealVictimCount", 1)
    incrementStat(victimId, "stealVictimCoinsLost", removed)
  }
  if (gained > 0) {
    incrementStat(thiefId, "stealSuccessCount", 1)
    incrementStat(thiefId, "stealSuccessCoins", gained)
  }

  return {
    ok: true,
    success: true,
    successChance: chance,
    rolled: roll,
    stolenFromVictim: removed,
    gained,
  }
}

function claimDaily(userId, baseAmount = 100) {
  const user = ensureUser(userId)
  const base = Math.max(0, Math.floor(Number(baseAmount) || 0))
  if (!user || base <= 0) return { ok: false, reason: "invalid" }

  const dayKey = getDayKey()
  if (user.cooldowns.dailyClaimKey === dayKey) {
    return { ok: false, reason: "already-claimed", dayKey }
  }

  const finalAmount = applyKronosGainMultiplier(userId, base, "daily")
  user.cooldowns.dailyClaimKey = dayKey
  touchUser(user)
  saveEconomy()
  creditCoins(userId, finalAmount, {
    type: "daily",
    details: "Resgate diário",
    meta: { dayKey },
  })
  incrementStat(userId, "dailyClaimCount", 1)

  return {
    ok: true,
    amount: finalAmount,
    dayKey,
    kronosBonus: finalAmount > base,
  }
}

const _attemptSteal = attemptSteal
attemptSteal = function wrappedAttemptSteal(thiefId, victimId, requestedAmount = 0) {
  const startedAt = Date.now()
  const result = _attemptSteal(thiefId, victimId, requestedAmount)
  const status = result?.ok ? (result.success ? "success" : "failed") : (result?.reason || "rejected")
  telemetry.incrementCounter("economy.steal.attempt", 1, { status })
  telemetry.observeDuration("economy.steal.latency", Date.now() - startedAt, { status })
  telemetry.appendEvent("economy.steal", {
    thiefId: normalizeUserId(thiefId),
    victimId: normalizeUserId(victimId),
    status,
    gained: result?.gained || 0,
    lost: result?.lost || 0,
    reason: result?.reason || null,
  })
  return result
}

const _claimDaily = claimDaily
claimDaily = function wrappedClaimDaily(userId, baseAmount = 100) {
  const result = _claimDaily(userId, baseAmount)
  telemetry.incrementCounter("economy.daily.claim", 1, {
    status: result?.ok ? "ok" : (result?.reason || "rejected"),
  })
  if (result?.ok) {
    telemetry.appendEvent("economy.daily.claimed", {
      userId: normalizeUserId(userId),
      amount: result.amount,
      kronosBonus: Boolean(result.kronosBonus),
    })
  }
  return result
}

function getAllUsersSortedByCoins() {
  return Object.keys(economyCache.users)
    .map((userId) => ({ userId, coins: getCoins(userId) }))
    .sort((a, b) => (b.coins - a.coins) || a.userId.localeCompare(b.userId))
}

function getGlobalRanking(limit = 10) {
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 10))
  return getAllUsersSortedByCoins().slice(0, safeLimit)
}

function getUserGlobalPosition(userId) {
  const normalized = normalizeUserId(userId)
  const ranking = getAllUsersSortedByCoins()
  const idx = ranking.findIndex((entry) => entry.userId === normalized)
  return idx >= 0 ? idx + 1 : null
}

function getGroupRanking(memberIds = [], limit = 10) {
  const members = new Set((memberIds || []).map((id) => normalizeUserId(id)).filter(Boolean))
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 10))
  return getAllUsersSortedByCoins()
    .filter((entry) => members.has(entry.userId))
    .slice(0, safeLimit)
}

function getItemCatalog() {
  return Object.values(ITEM_DEFINITIONS).map((item) => ({ ...item }))
}

function getShopIndexText() {
  const lines = ["Loja (indice)"]
  const catalog = getItemCatalog().filter((item) => item.buyable !== false)
  catalog.forEach((item, idx) => {
    lines.push(`${idx + 1}. ${item.name} (${item.key}) - ${item.price} Epsteincoins`)
  })
  lines.push("")
  lines.push("Compre com: !comprar <item> [quantidade]")
  lines.push("Compre para outro: !comprarpara @usuario <item> [quantidade]")
  return lines.join("\n")
}

function getProfile(userId) {
  const user = ensureUser(userId)
  if (!user) {
    return {
      coins: DEFAULT_COINS,
      shields: 0,
      items: {},
      buffs: {
        kronosActive: false,
        kronosExpiresAt: 0,
      },
    }
  }

  return {
    coins: getCoins(userId),
    shields: getShields(userId),
    items: { ...user.items },
    buffs: {
      kronosActive: hasActiveKronos(userId),
      kronosExpiresAt: Number(user.buffs?.kronosExpiresAt) || 0,
      kronosVerdadeiraActive: Boolean(user.buffs?.kronosVerdadeiraActive),
    },
    cooldowns: { ...user.cooldowns },
    stats: { ...user.stats },
  }
}

function incrementStat(userId, key, amount = 1) {
  const user = ensureUser(userId)
  const safeAmount = Math.max(1, Math.floor(Number(amount) || 1))
  if (!user) return 0
  if (!Number.isFinite(user.stats[key])) user.stats[key] = 0
  user.stats[key] = Math.max(0, Math.floor(Number(user.stats[key]) || 0) + safeAmount)
  touchUser(user)
  saveEconomy()
  return user.stats[key]
}

function getStatement(userId, limit = 10) {
  const user = ensureUser(userId)
  if (!user) return []
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 10))
  return (user.transactions || []).slice(-safeLimit).reverse()
}

// Sistema de Lootbox
const LOOTBOX_EFFECTS = [
  { id: "daily_reset", name: "Resetar cooldown !daily", weight: 30, description: "Reseta !daily" },
  { id: "work_reset", name: "Resetar cooldown !trabalho", weight: 30, description: "Reseta !trabalho" },
  { id: "coins_1000_gain", name: "Ganhar 1000 coins", weight: 6, description: "+1000 moedas" },
  { id: "coins_1000_loss", name: "Perder 1000 coins", weight: 5, description: "-1000 moedas" },
  { id: "coins_2500_gain", name: "Ganhar 2500 coins", weight: 4, description: "+2500 moedas" },
  { id: "coins_2500_loss", name: "Perder 2500 coins", weight: 3, description: "-2500 moedas" },
  { id: "shield_1_gain", name: "Ganhar 1 escudo", weight: 4, description: "+1 escudo" },
  { id: "shield_1_loss", name: "Perder 1 escudo", weight: 3, description: "-1 escudo" },
  { id: "shield_3_gain", name: "Ganhar 3 escudos", weight: 3, description: "+3 escudos" },
  { id: "shield_3_loss", name: "Perder 3 escudos", weight: 2, description: "-3 escudos" },
  { id: "kronos_quebrada", name: "Ganhar Coroa Kronos (Quebrada)", weight: 1, description: "+1 Coroa Kronos (Quebrada)" },
  { id: "punishment_pass_1x", name: "Passe de Punição (1x)", weight: 2, description: "+1 Passe de Punição (1x)" },
  { id: "punishment_1x", name: "Punição (1x)", weight: 4, description: "Punição aleatória (1x)" },
  { id: "punishment_pass_5x", name: "Passe de Punição (5x)", weight: 1, description: "+1 Passe de Punição (5x)" },
  { id: "punishment_5x", name: "Punição (5x)", weight: 3, description: "Punição aleatória (5x)" },
]

function selectRandomEffect() {
  const totalWeight = LOOTBOX_EFFECTS.reduce((sum, effect) => sum + effect.weight, 0)
  let random = Math.random() * totalWeight
  
  for (const effect of LOOTBOX_EFFECTS) {
    random -= effect.weight
    if (random <= 0) {
      return effect
    }
  }
  
  return LOOTBOX_EFFECTS[0]
}

function openLootbox(userId, quantity = 1, groupMembers = []) {
  const qty = Math.max(1, Math.floor(Number(quantity) || 1))
  const user = ensureUser(userId)
  if (!user) return { ok: false, reason: "invalid-user" }

  if (qty > MAX_LOOTBOX_OPEN_PER_CALL) {
    return {
      ok: false,
      reason: "quantity-too-large",
      maxQuantity: MAX_LOOTBOX_OPEN_PER_CALL,
    }
  }
  
  const available = getItemQuantity(userId, "lootbox")
  if (available < qty) {
    return { ok: false, reason: "insufficient-items", available }
  }
  
  removeItem(userId, "lootbox", qty)
  incrementStat(userId, "lootboxesOpened", qty)
  
  const results = []
  const ownerNormalized = normalizeUserId(userId)
  const eligibleMembers = Array.from(new Set(groupMembers || []))
    .filter((memberId) => {
      const normalized = normalizeUserId(memberId)
      if (!normalized || normalized === ownerNormalized) return false
      const existing = economyCache.users[normalized]
      return Boolean(existing && Number.isFinite(existing.coins) && existing.coins >= 100)
    })

  for (let i = 0; i < qty; i++) {
    const effect = selectRandomEffect()
    
    // Decide se o efeito vai para o usuário ou para outro membro
    let targetUser = userId
    const isNegativeEffect = effect.id.includes("loss") || effect.id.includes("punishment")
    incrementStat(userId, isNegativeEffect ? "lootboxNegativeRolls" : "lootboxPositiveRolls", 1)
    
    if (!isNegativeEffect && eligibleMembers.length > 0) {
      // 25% chance para efeitos positivos irem para outro jogador
      if (Math.random() < 0.25) {
        if (eligibleMembers.length > 0) {
          targetUser = eligibleMembers[Math.floor(Math.random() * eligibleMembers.length)]
        }
      }
    } else if (isNegativeEffect && eligibleMembers.length > 0) {
      // Efeitos negativos tem chance menor (20%) de ir para outro jogador
      if (Math.random() < 0.2) {
        if (eligibleMembers.length > 0) {
          targetUser = eligibleMembers[Math.floor(Math.random() * eligibleMembers.length)]
        }
      }
    }
    
    let resultText = ""
    const targetIsOther = normalizeUserId(targetUser) !== normalizeUserId(userId)
    const targetPrefix = targetIsOther ? `@${targetUser.split("@")[0]}: ` : "Você: "
    let punishment = null
    
    // Aplica o efeito
    switch (effect.id) {
      case "coins_1000_gain":
        creditCoins(targetUser, 1000, { type: "lootbox", details: "Efeito: +1000 coins" })
        resultText = `${targetPrefix}+1000 moedas`
        break
      case "coins_1000_loss":
        debitCoinsFlexible(targetUser, 1000, { type: "lootbox", details: "Efeito: -1000 coins" })
        resultText = `${targetPrefix}-1000 moedas`
        break
      case "coins_2500_gain":
        creditCoins(targetUser, 2500, { type: "lootbox", details: "Efeito: +2500 coins" })
        resultText = `${targetPrefix}+2500 moedas`
        break
      case "coins_2500_loss":
        debitCoinsFlexible(targetUser, 2500, { type: "lootbox", details: "Efeito: -2500 coins" })
        resultText = `${targetPrefix}-2500 moedas`
        break
      case "shield_1_gain":
        addShields(targetUser, 1)
        resultText = `${targetPrefix}+1 escudo`
        break
      case "shield_1_loss":
        removeItem(targetUser, "escudo", 1)
        resultText = `${targetPrefix}-1 escudo`
        break
      case "shield_3_gain":
        addShields(targetUser, 3)
        resultText = `${targetPrefix}+3 escudos`
        break
      case "shield_3_loss":
        removeItem(targetUser, "escudo", 3)
        resultText = `${targetPrefix}-3 escudos`
        break
      case "kronos_quebrada":
        addItem(targetUser, "kronosQuebrada", 1)
        resultText = `${targetPrefix}+1 Coroa Kronos (Quebrada)`
        break
      case "punishment_pass_1x":
        {
          const passType = pickRandomPunishmentType()
          const passKey = buildPunishmentPassKey(passType, 1)
          addItem(targetUser, passKey, 1)
          resultText = `${targetPrefix}+1 Passe de Punição ${passType} (1x)`
        }
        break
      case "punishment_1x":
        {
          const punishmentType = pickRandomPunishmentType()
          punishment = {
            type: punishmentType,
            severity: 1,
          }
          resultText = `${targetPrefix}Punição sorteada ${punishmentType} (1x)`
        }
        break
      case "punishment_pass_5x":
        {
          const passType = pickRandomPunishmentType()
          const passKey = buildPunishmentPassKey(passType, 5)
          addItem(targetUser, passKey, 1)
          resultText = `${targetPrefix}+1 Passe de Punição ${passType} (5x)`
        }
        break
      case "punishment_5x":
        {
          const punishmentType = pickRandomPunishmentType()
          punishment = {
            type: punishmentType,
            severity: 5,
          }
          resultText = `${targetPrefix}Punição sorteada ${punishmentType} (5x)`
        }
        break
      case "daily_reset":
        {
          const targetProfile = ensureUser(targetUser)
          if (targetProfile) {
            targetProfile.cooldowns.dailyClaimKey = null
            touchUser(targetProfile)
            saveEconomy()
          }
        }
        resultText = `${targetPrefix}Cooldown de !daily resetado`
        break
      case "work_reset":
        setWorkCooldown(targetUser, 0)
        resultText = `${targetPrefix}Cooldown de !trabalho resetado`
        break
    }
    
    results.push({
      effect: effect.name,
      description: effect.description,
      result: resultText,
      targetUser,
      targetIsOther,
      punishment,
    })
  }
  
  return {
    ok: true,
    quantity: qty,
    results,
  }
}

function setWorkCooldown(userId, timestamp = Date.now()) {
  const user = ensureUser(userId)
  if (!user) return
  const parsed = Number(timestamp)
  user.cooldowns.workAt = Number.isFinite(parsed) && parsed >= 0
    ? Math.floor(parsed)
    : Date.now()
  touchUser(user)
  saveEconomy()
}

function getWorkCooldown(userId) {
  const user = ensureUser(userId)
  if (!user) return 0
  return Math.floor(Number(user.cooldowns.workAt) || 0)
}

function setStealCooldown(userId, timestamp = Date.now()) {
  const user = ensureUser(userId)
  if (!user) return
  const parsed = Number(timestamp)
  user.cooldowns.stealAt = Number.isFinite(parsed) && parsed >= 0
    ? Math.floor(parsed)
    : Date.now()
  touchUser(user)
  saveEconomy()
}

function getStealCooldown(userId) {
  const user = ensureUser(userId)
  if (!user) return 0
  return Math.floor(Number(user.cooldowns.stealAt) || 0)
}

function forgePunishmentPass(userId, punishmentType, severity = 1, quantity = 1) {
  if (!isValidPunishmentType(punishmentType)) {
    return { ok: false, reason: "invalid-type" }
  }

  const safeSeverity = normalizePassSeverity(severity, 1)
  const qty = Math.floor(Number(quantity) || 0)
  if (qty <= 0) return { ok: false, reason: "invalid-quantity" }
  if (qty > MAX_FORGE_QUANTITY) {
    return { ok: false, reason: "quantity-too-large", maxQuantity: MAX_FORGE_QUANTITY }
  }

  const selectedKey = buildPunishmentPassKey(punishmentType, safeSeverity)
  const available = getItemQuantity(userId, selectedKey)
  if (available < qty) {
    return { ok: false, reason: "insufficient-items", available, selectedKey }
  }

  const forgeCost = 150 * qty
  if (!debitCoins(userId, forgeCost, {
    type: "forge-fee",
    details: `Taxa de falsificacao de ${qty}x ${selectedKey}`,
    meta: { punishmentType, severity: safeSeverity, quantity: qty },
  })) {
    return { ok: false, reason: "insufficient-funds", forgeCost }
  }

  const roll = Math.random()
  if (roll < 0.05) {
    const bonus = Math.ceil(qty * 0.5)
    addItem(userId, selectedKey, bonus)
    return {
      ok: true,
      outcome: "multiply",
      forgeCost,
      selectedKey,
      quantity: qty,
      bonus,
      finalQuantity: getItemQuantity(userId, selectedKey),
    }
  }

  if (roll < 0.10) {
    const upgradedSeverity = safeSeverity * 5
    const upgradedKey = buildPunishmentPassKey(punishmentType, upgradedSeverity)
    removeItem(userId, selectedKey, qty)
    addItem(userId, upgradedKey, qty)
    return {
      ok: true,
      outcome: "upgrade-severity",
      forgeCost,
      selectedKey,
      quantity: qty,
      upgradedSeverity,
      upgradedKey,
    }
  }

  if (roll < 0.40) {
    const nextType = pickRandomPunishmentType(Math.floor(Number(punishmentType) || 0))
    const convertedKey = buildPunishmentPassKey(nextType, safeSeverity)
    removeItem(userId, selectedKey, qty)
    addItem(userId, convertedKey, qty)
    return {
      ok: true,
      outcome: "change-type",
      forgeCost,
      selectedKey,
      quantity: qty,
      fromType: punishmentType,
      toType: nextType,
      convertedKey,
    }
  }

  const lost = Math.ceil(qty / 2)
  removeItem(userId, selectedKey, lost)
  return {
    ok: true,
    outcome: "lose-half",
    forgeCost,
    selectedKey,
    quantity: qty,
    lost,
    remaining: getItemQuantity(userId, selectedKey),
  }
}

function createPunishmentPassKey(punishmentType, severity = 1) {
  if (!isValidPunishmentType(punishmentType)) return null
  return buildPunishmentPassKey(punishmentType, normalizePassSeverity(severity, 1))
}

loadEconomy()

module.exports = {
  DEFAULT_COINS,
  ITEM_DEFINITIONS,
  SHIELD_PRICE,
  getDayKey,
  loadEconomy,
  saveEconomy,
  getCoins,
  setCoins,
  creditCoins,
  debitCoins,
  debitCoinsFlexible,
  normalizeItemKey,
  getItemDefinition,
  getItemCatalog,
  getItemQuantity,
  addItem,
  removeItem,
  getShields,
  addShields,
  consumeShield,
  buyShield,
  buyItem,
  sellItem,
  transferCoins,
  transferItem,
  attemptSteal,
  claimDaily,
  hasActiveKronos,
  applyKronosGainMultiplier,
  getStealSuccessChance,
  canAttemptSteal,
  getGlobalRanking,
  getGroupRanking,
  getUserGlobalPosition,
  getShopIndexText,
  pushTransaction,
  getStatement,
  incrementStat,
  setWorkCooldown,
  getWorkCooldown,
  setStealCooldown,
  getStealCooldown,
  getProfile,
  openLootbox,
  forgePunishmentPass,
  createPunishmentPassKey,
  getOperationLimits,
}
