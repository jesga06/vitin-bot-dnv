const fs = require("fs")
const path = require("path")

const DATA_DIR = path.join(__dirname, ".data")
const REGISTRATION_FILE = path.join(DATA_DIR, "registrations.json")
const ECONOMY_FILE = path.join(DATA_DIR, "economy.json")

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

let cache = {
  users: {},
}

let saveTimeout = null

function normalizeUserId(value = "") {
  const raw = String(value || "").trim().toLowerCase()
  if (!raw) return ""
  return raw.split(":")[0]
}

function load() {
  try {
    if (!fs.existsSync(REGISTRATION_FILE)) {
      cache = { users: {} }
      return
    }
    const data = JSON.parse(fs.readFileSync(REGISTRATION_FILE, "utf8"))
    cache = {
      users: data?.users && typeof data.users === "object" ? data.users : {},
    }
  } catch (err) {
    console.error("Erro ao carregar registrations.json", err)
    cache = { users: {} }
  }
}

function save(immediate = false) {
  const doSave = () => {
    try {
      fs.writeFileSync(REGISTRATION_FILE, JSON.stringify(cache, null, 2), "utf8")
    } catch (err) {
      console.error("Erro ao salvar registrations.json", err)
    }
  }

  if (immediate) {
    clearTimeout(saveTimeout)
    doSave()
    return
  }

  clearTimeout(saveTimeout)
  saveTimeout = setTimeout(doSave, 500)
}

function readEconomyUserRaw(userId) {
  const normalized = normalizeUserId(userId)
  if (!normalized) return null
  try {
    if (!fs.existsSync(ECONOMY_FILE)) return null
    const raw = JSON.parse(fs.readFileSync(ECONOMY_FILE, "utf8"))
    const users = raw?.users || {}
    return users[normalized] || null
  } catch (err) {
    console.error("Erro ao ler economy.json para migração", err)
    return null
  }
}

function touchKnownName(userId, profileName = "") {
  const normalized = normalizeUserId(userId)
  if (!normalized) return false
  const entry = cache.users[normalized]
  if (!entry) return false
  const safeName = String(profileName || "").trim()
  if (safeName && safeName !== entry.lastKnownName) {
    entry.lastKnownName = safeName
    entry.updatedAt = Date.now()
    save()
  }
  return true
}

function registerUser(userId, options = {}) {
  const normalized = normalizeUserId(userId)
  if (!normalized) {
    return { ok: false, reason: "invalid-user" }
  }

  if (cache.users[normalized]) {
    touchKnownName(normalized, options?.profileName || "")
    return {
      ok: false,
      reason: "already-registered",
      userId: normalized,
      entry: { ...cache.users[normalized] },
    }
  }

  const now = Date.now()
  const economyRaw = readEconomyUserRaw(normalized)
  const migratedEconomy = Boolean(economyRaw)

  cache.users[normalized] = {
    userId: normalized,
    registeredAt: now,
    updatedAt: now,
    lastKnownName: String(options?.profileName || "").trim(),
    notificationsEnabled: true,
    migratedEconomy,
    migrationSnapshot: migratedEconomy
      ? {
          coins: Number(economyRaw?.coins) || 0,
          shields: Number(economyRaw?.shields) || 0,
          itemsCount: Object.keys(economyRaw?.items || {}).length,
          hadStats: Boolean(economyRaw?.stats && Object.keys(economyRaw.stats).length > 0),
          migratedAt: now,
        }
      : null,
  }

  save()
  return {
    ok: true,
    userId: normalized,
    migratedEconomy,
    entry: { ...cache.users[normalized] },
  }
}

function unregisterUser(userId) {
  const normalized = normalizeUserId(userId)
  if (!normalized) {
    return { ok: false, reason: "invalid-user" }
  }

  if (!cache.users[normalized]) {
    return { ok: false, reason: "not-registered" }
  }

  delete cache.users[normalized]
  save()

  return {
    ok: true,
    userId: normalized,
    message: "Registro removido. Use !deleteconta para apagar tudo."
  }
}

// delete completo
function deleteUserAccount(userId) {
  const normalized = normalizeUserId(userId)
  if (!normalized) {
    return { ok: false, reason: "invalid-user" }
  }

  // remove registro
  if (cache.users[normalized]) {
    delete cache.users[normalized]
  }

  // remove economia
  try {
    if (fs.existsSync(ECONOMY_FILE)) {
      const raw = JSON.parse(fs.readFileSync(ECONOMY_FILE, "utf8"))
      if (raw.users && raw.users[normalized]) {
        delete raw.users[normalized]
        fs.writeFileSync(ECONOMY_FILE, JSON.stringify(raw, null, 2))
      }
    }
  } catch (err) {
    console.error("Erro ao deletar economia do usuário", err)
  }

  save(true)

  return { ok: true, userId: normalized }
}

function isRegistered(userId) {
  const normalized = normalizeUserId(userId)
  if (!normalized) return false
  return Boolean(cache.users[normalized])
}

function getRegisteredEntry(userId) {
  const normalized = normalizeUserId(userId)
  if (!normalized) return null
  const entry = cache.users[normalized]
  return entry ? { ...entry } : null
}

function getRegisteredUsers() {
  return Object.keys(cache.users)
}

function getRegisteredUsersForNotifications() {
  return Object.values(cache.users)
    .filter((entry) => entry?.notificationsEnabled !== false)
    .map((entry) => entry.userId)
}

function getRegisteredCount() {
  return Object.keys(cache.users).length
}

load()

module.exports = {
  normalizeUserId,
  registerUser,
  unregisterUser,
  deleteUserAccount, // adicionado
  isRegistered,
  getRegisteredEntry,
  getRegisteredUsers,
  getRegisteredUsersForNotifications,
  getRegisteredCount,
  touchKnownName,
}
