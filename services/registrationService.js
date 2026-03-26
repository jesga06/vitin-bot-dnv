const fs = require("fs")
const path = require("path")

const DATA_DIR = path.join(__dirname, "..", ".data")
const REGISTRATION_FILE = path.join(DATA_DIR, "registrations.json")
const ECONOMY_FILE = path.join(DATA_DIR, "economy.json")

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

let cache = {
  users: {},
}

let saveTimeout = null

function splitDeviceSuffix(value = "") {
  return String(value || "").split(":")[0]
}

function parseUserParts(value = "") {
  const base = splitDeviceSuffix(String(value || "").trim().toLowerCase())
  const atIndex = base.indexOf("@")
  if (atIndex < 0) return { base, userPart: base, domain: "" }
  return {
    base,
    userPart: base.slice(0, atIndex),
    domain: base.slice(atIndex + 1),
  }
}

function canonicalUserHandle(userPart = "") {
  const cleaned = String(userPart || "").trim().toLowerCase()
  if (!cleaned) return ""
  const digits = cleaned.replace(/\D+/g, "")
  return digits || cleaned
}

function normalizeUserId(value = "") {
  const { base, userPart, domain } = parseUserParts(value)
  if (!base || !userPart) return ""
  if (domain === "s.whatsapp.net" || domain === "lid") {
    return `${canonicalUserHandle(userPart)}@s.whatsapp.net`
  }
  return base
}

function getUserIdAliases(value = "") {
  const aliases = new Set()
  const { base, userPart, domain } = parseUserParts(value)
  const normalized = normalizeUserId(value)
  if (normalized) aliases.add(normalized)
  if (base) aliases.add(base)

  if ((domain === "s.whatsapp.net" || domain === "lid") && userPart) {
    const canonical = canonicalUserHandle(userPart)
    if (canonical) {
      aliases.add(`${canonical}@s.whatsapp.net`)
      aliases.add(`${canonical}@lid`)
    }
  }

  return Array.from(aliases).filter(Boolean)
}

function normalizeRegistrationEntry(entry = {}, userId = "") {
  const now = Date.now()
  return {
    userId,
    registeredAt: Math.floor(Number(entry?.registeredAt) || now),
    updatedAt: Math.floor(Number(entry?.updatedAt) || now),
    lastKnownName: String(entry?.lastKnownName || "").trim(),
    notificationsEnabled: entry?.notificationsEnabled !== false,
    migratedEconomy: Boolean(entry?.migratedEconomy),
    migrationSnapshot: entry?.migrationSnapshot && typeof entry.migrationSnapshot === "object"
      ? entry.migrationSnapshot
      : null,
  }
}

function pickPreferredRegistrationEntry(current = null, incoming = null, userId = "") {
  if (!current) return normalizeRegistrationEntry(incoming, userId)
  if (!incoming) return normalizeRegistrationEntry(current, userId)
  const currentNormalized = normalizeRegistrationEntry(current, userId)
  const incomingNormalized = normalizeRegistrationEntry(incoming, userId)
  const preferred = incomingNormalized.updatedAt > currentNormalized.updatedAt
    ? incomingNormalized
    : currentNormalized
  if (!preferred.lastKnownName) {
    preferred.lastKnownName = incomingNormalized.lastKnownName || currentNormalized.lastKnownName || ""
  }
  return preferred
}

function getAnyEntryByAliases(userId = "") {
  const aliases = getUserIdAliases(userId)
  for (const alias of aliases) {
    if (cache.users[alias]) {
      return { alias, entry: cache.users[alias] }
    }
  }
  return null
}

function removeAliasesFromCache(userId = "") {
  const aliases = getUserIdAliases(userId)
  let removed = false
  aliases.forEach((alias) => {
    if (cache.users[alias]) {
      delete cache.users[alias]
      removed = true
    }
  })
  return removed
}

function load() {
  try {
    if (!fs.existsSync(REGISTRATION_FILE)) {
      cache = { users: {} }
      return
    }
    const data = JSON.parse(fs.readFileSync(REGISTRATION_FILE, "utf8"))
    const rawUsers = data?.users && typeof data.users === "object" ? data.users : {}
    const migratedUsers = {}
    let hasMigration = false

    Object.entries(rawUsers).forEach(([rawUserId, rawEntry]) => {
      const normalized = normalizeUserId(rawUserId)
      if (!normalized) {
        hasMigration = true
        return
      }
      if (normalized !== rawUserId) {
        hasMigration = true
      }
      migratedUsers[normalized] = pickPreferredRegistrationEntry(migratedUsers[normalized], rawEntry, normalized)
    })

    cache = { users: migratedUsers }
    if (hasMigration) {
      save(true)
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
  const aliases = getUserIdAliases(userId)
  if (aliases.length === 0) return null
  try {
    if (!fs.existsSync(ECONOMY_FILE)) return null
    const raw = JSON.parse(fs.readFileSync(ECONOMY_FILE, "utf8"))
    const users = raw?.users || {}
    for (const alias of aliases) {
      if (users[alias]) return users[alias]
    }
    return null
  } catch (err) {
    console.error("Erro ao ler economy.json para migração", err)
    return null
  }
}

function touchKnownName(userId, profileName = "") {
  const normalized = normalizeUserId(userId)
  if (!normalized) return false
  const found = getAnyEntryByAliases(normalized)
  const entry = found?.entry || null
  if (!entry) return false
  const safeName = String(profileName || "").trim()
  if (safeName && safeName !== entry.lastKnownName) {
    entry.lastKnownName = safeName
    entry.updatedAt = Date.now()
    if (found?.alias && found.alias !== normalized) {
      cache.users[normalized] = entry
      delete cache.users[found.alias]
    }
    save()
  }
  return true
}

function registerUser(userId, options = {}) {
  const normalized = normalizeUserId(userId)
  if (!normalized) {
    return { ok: false, reason: "invalid-user" }
  }

  const existing = getAnyEntryByAliases(normalized)
  if (existing?.entry) {
    if (existing.alias !== normalized) {
      cache.users[normalized] = normalizeRegistrationEntry(existing.entry, normalized)
      delete cache.users[existing.alias]
      save()
    }
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

  const removed = removeAliasesFromCache(normalized)
  if (!removed) {
    return { ok: false, reason: "not-registered" }
  }

  save()

  return {
    ok: true,
    userId: normalized,
    message: "Registro removido."
  }
}

// delete completo
function deleteUserAccount(userId) {
  const normalized = normalizeUserId(userId)
  if (!normalized) {
    return { ok: false, reason: "invalid-user" }
  }

  const removedRegistration = removeAliasesFromCache(normalized)

  let removedEconomy = false
  try {
    if (fs.existsSync(ECONOMY_FILE)) {
      const raw = JSON.parse(fs.readFileSync(ECONOMY_FILE, "utf8"))
      const aliases = getUserIdAliases(normalized)
      if (raw.users && typeof raw.users === "object") {
        aliases.forEach((alias) => {
          if (raw.users[alias]) {
            delete raw.users[alias]
            removedEconomy = true
          }
        })
      }
      if (removedEconomy) {
        fs.writeFileSync(ECONOMY_FILE, JSON.stringify(raw, null, 2))
      }
    }
  } catch (err) {
    console.error("Erro ao deletar economia do usuário", err)
  }

  save(true)

  return {
    ok: true,
    userId: normalized,
    removedRegistration,
    removedEconomy,
  }
}

function isRegistered(userId) {
  return Boolean(getAnyEntryByAliases(userId)?.entry)
}

function getRegisteredEntry(userId) {
  const normalized = normalizeUserId(userId)
  if (!normalized) return null
  const found = getAnyEntryByAliases(normalized)
  if (!found?.entry) return null
  if (found.alias !== normalized) {
    cache.users[normalized] = normalizeRegistrationEntry(found.entry, normalized)
    delete cache.users[found.alias]
    save()
  }
  return { ...cache.users[normalized] }
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
  getUserIdAliases,
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
