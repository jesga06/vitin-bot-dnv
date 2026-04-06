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
  links: {},
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

function normalizeIdentityJid(value = "") {
  const { base, userPart, domain } = parseUserParts(value)
  if (!base || !userPart) return ""
  if (domain === "s.whatsapp.net" || domain === "lid") {
    return `${canonicalUserHandle(userPart)}@${domain}`
  }
  return base
}

function normalizeLegacyUserId(value = "") {
  const { base, userPart, domain } = parseUserParts(value)
  if (!base || !userPart) return ""
  if (domain === "s.whatsapp.net" || domain === "lid") {
    return `${canonicalUserHandle(userPart)}@s.whatsapp.net`
  }
  return base
}

function isDirectUserJid(value = "") {
  const normalized = normalizeIdentityJid(value)
  return normalized.endsWith("@s.whatsapp.net") || normalized.endsWith("@lid")
}

function buildIntrinsicAliases(value = "") {
  const aliases = new Set()
  const { base, userPart, domain } = parseUserParts(value)
  const normalizedIdentity = normalizeIdentityJid(value)
  const normalizedLegacy = normalizeLegacyUserId(value)

  if (normalizedIdentity) aliases.add(normalizedIdentity)
  if (normalizedLegacy) aliases.add(normalizedLegacy)
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

function uniqueStrings(values = []) {
  return Array.from(new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean)))
}

function pickPreferredDmJid(candidates = []) {
  const normalizedCandidates = uniqueStrings(candidates)
    .map((value) => normalizeIdentityJid(value))
    .filter((value) => isDirectUserJid(value))

  const directS = normalizedCandidates.find((value) => value.endsWith("@s.whatsapp.net"))
  if (directS) return directS

  const directLid = normalizedCandidates.find((value) => value.endsWith("@lid"))
  if (directLid) return directLid

  return normalizedCandidates[0] || ""
}

function getEntryUpdatedAt(userId = "") {
  return Math.floor(Number(cache.users?.[userId]?.updatedAt) || 0)
}

function assignLink(alias = "", targetUserId = "") {
  const normalizedAlias = normalizeIdentityJid(alias)
  const normalizedTarget = normalizeLegacyUserId(targetUserId)
  if (!normalizedAlias || !normalizedTarget || !cache.users[normalizedTarget]) {
    return { changed: false, conflictWith: "" }
  }

  const currentTarget = cache.links[normalizedAlias]
  if (!currentTarget || currentTarget === normalizedTarget) {
    cache.links[normalizedAlias] = normalizedTarget
    return { changed: currentTarget !== normalizedTarget, conflictWith: "" }
  }

  const currentUpdatedAt = getEntryUpdatedAt(currentTarget)
  const nextUpdatedAt = getEntryUpdatedAt(normalizedTarget)
  if (nextUpdatedAt > currentUpdatedAt) {
    cache.links[normalizedAlias] = normalizedTarget
    return { changed: true, conflictWith: currentTarget }
  }

  return { changed: false, conflictWith: currentTarget }
}

function resolveLinkedUserId(value = "") {
  const normalizedIdentity = normalizeIdentityJid(value)
  if (normalizedIdentity) {
    const linkedTarget = cache.links[normalizedIdentity]
    if (linkedTarget && cache.users[linkedTarget]) {
      return linkedTarget
    }
  }

  const normalizedLegacy = normalizeLegacyUserId(value)
  if (normalizedLegacy) {
    const linkedTarget = cache.links[normalizedLegacy]
    if (linkedTarget && cache.users[linkedTarget]) {
      return linkedTarget
    }
  }

  return ""
}

function normalizeUserId(value = "") {
  const linked = resolveLinkedUserId(value)
  if (linked) return linked
  return normalizeLegacyUserId(value)
}

function getUserIdAliases(value = "") {
  const aliases = new Set()
  const normalized = normalizeUserId(value)

  for (const alias of buildIntrinsicAliases(value)) {
    aliases.add(alias)
  }

  if (normalized) {
    aliases.add(normalized)

    const entry = cache.users[normalized]
    if (entry) {
      const linked = Array.isArray(entry.linkedJids) ? entry.linkedJids : []
      linked.forEach((alias) => aliases.add(normalizeIdentityJid(alias)))
      if (entry.dmJid) aliases.add(normalizeIdentityJid(entry.dmJid))
    }

    for (const [alias, target] of Object.entries(cache.links || {})) {
      if (target === normalized) {
        aliases.add(alias)
      }
    }
  }

  return Array.from(aliases).filter(Boolean)
}

function normalizeRegistrationEntry(entry = {}, userId = "") {
  const now = Date.now()
  const linkedJids = uniqueStrings([
    ...buildIntrinsicAliases(userId),
    ...(Array.isArray(entry?.linkedJids) ? entry.linkedJids : []),
  ]).map((alias) => normalizeIdentityJid(alias)).filter(Boolean)

  const dmJid = pickPreferredDmJid([
    entry?.dmJid,
    ...linkedJids,
    userId,
  ])

  if (dmJid) {
    linkedJids.push(dmJid)
  }

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
    dmJid,
    linkedJids: uniqueStrings(linkedJids),
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
  preferred.linkedJids = uniqueStrings([
    ...(Array.isArray(currentNormalized.linkedJids) ? currentNormalized.linkedJids : []),
    ...(Array.isArray(incomingNormalized.linkedJids) ? incomingNormalized.linkedJids : []),
    ...buildIntrinsicAliases(userId),
  ]).map((alias) => normalizeIdentityJid(alias)).filter(Boolean)
  preferred.dmJid = pickPreferredDmJid([
    preferred.dmJid,
    incomingNormalized.dmJid,
    currentNormalized.dmJid,
    ...preferred.linkedJids,
    userId,
  ])
  return preferred
}

function getAnyEntryByAliases(userId = "") {
  const linkedTarget = resolveLinkedUserId(userId)
  if (linkedTarget && cache.users[linkedTarget]) {
    return { alias: linkedTarget, entry: cache.users[linkedTarget], userId: linkedTarget }
  }

  const aliases = buildIntrinsicAliases(userId)
  for (const alias of aliases) {
    const target = cache.links[alias]
    if (target && cache.users[target]) {
      return { alias, entry: cache.users[target], userId: target }
    }
    if (cache.users[alias]) {
      return { alias, entry: cache.users[alias], userId: alias }
    }
  }

  for (const [candidateUserId, entry] of Object.entries(cache.users || {})) {
    const linked = Array.isArray(entry?.linkedJids) ? entry.linkedJids : []
    const hasOverlap = linked.some((candidate) => aliases.includes(normalizeIdentityJid(candidate)))
    if (hasOverlap) {
      return { alias: candidateUserId, entry, userId: candidateUserId }
    }
  }

  return null
}

function removeUserById(userId = "") {
  const normalized = normalizeLegacyUserId(userId)
  if (!normalized || !cache.users[normalized]) {
    return false
  }

  delete cache.users[normalized]

  for (const [alias, target] of Object.entries(cache.links || {})) {
    if (target === normalized || alias === normalized) {
      delete cache.links[alias]
    }
  }

  return true
}

function rebuildLinksFromEntries() {
  const rebuilt = {}
  const users = cache.users && typeof cache.users === "object" ? cache.users : {}

  for (const [userId, rawEntry] of Object.entries(users)) {
    const normalizedUserId = normalizeLegacyUserId(userId)
    if (!normalizedUserId) continue

    if (normalizedUserId !== userId) {
      delete users[userId]
    }

    users[normalizedUserId] = normalizeRegistrationEntry(rawEntry, normalizedUserId)
  }

  cache.users = users

  for (const [userId, entry] of Object.entries(cache.users)) {
    const aliases = uniqueStrings([
      ...buildIntrinsicAliases(userId),
      ...(Array.isArray(entry?.linkedJids) ? entry.linkedJids : []),
      entry?.dmJid || "",
    ])

    aliases.forEach((alias) => {
      const normalizedAlias = normalizeIdentityJid(alias)
      if (!normalizedAlias) return

      const currentTarget = rebuilt[normalizedAlias]
      if (!currentTarget) {
        rebuilt[normalizedAlias] = userId
        return
      }
      if (currentTarget === userId) return

      const currentUpdatedAt = Math.floor(Number(cache.users[currentTarget]?.updatedAt) || 0)
      const nextUpdatedAt = Math.floor(Number(entry?.updatedAt) || 0)
      if (nextUpdatedAt > currentUpdatedAt) {
        rebuilt[normalizedAlias] = userId
      }
    })

    entry.linkedJids = uniqueStrings(aliases.map((alias) => normalizeIdentityJid(alias)).filter(Boolean))
    entry.dmJid = pickPreferredDmJid([entry.dmJid, ...entry.linkedJids, userId])
    if (entry.dmJid && !entry.linkedJids.includes(entry.dmJid)) {
      entry.linkedJids.push(entry.dmJid)
    }
    cache.users[userId] = normalizeRegistrationEntry(entry, userId)
  }

  cache.links = rebuilt
}

function mergeRegisteredUsers(primaryUserId = "", secondaryUserId = "") {
  const primary = normalizeLegacyUserId(primaryUserId)
  const secondary = normalizeLegacyUserId(secondaryUserId)
  if (!primary || !secondary || primary === secondary) {
    return {
      ok: Boolean(primary && cache.users[primary]),
      merged: false,
      userId: primary || secondary || "",
      mergedFrom: "",
    }
  }
  if (!cache.users[primary] || !cache.users[secondary]) {
    return { ok: false, merged: false, userId: "", mergedFrom: "" }
  }

  const primaryEntry = normalizeRegistrationEntry(cache.users[primary], primary)
  const secondaryEntry = normalizeRegistrationEntry(cache.users[secondary], secondary)
  const mergedEntry = pickPreferredRegistrationEntry(primaryEntry, secondaryEntry, primary)

  mergedEntry.registeredAt = Math.min(
    Math.floor(Number(primaryEntry.registeredAt) || Date.now()),
    Math.floor(Number(secondaryEntry.registeredAt) || Date.now())
  )
  mergedEntry.updatedAt = Math.max(
    Math.floor(Number(primaryEntry.updatedAt) || 0),
    Math.floor(Number(secondaryEntry.updatedAt) || 0),
    Date.now()
  )
  mergedEntry.linkedJids = uniqueStrings([
    ...buildIntrinsicAliases(primary),
    ...buildIntrinsicAliases(secondary),
    ...(Array.isArray(primaryEntry.linkedJids) ? primaryEntry.linkedJids : []),
    ...(Array.isArray(secondaryEntry.linkedJids) ? secondaryEntry.linkedJids : []),
  ]).map((alias) => normalizeIdentityJid(alias)).filter(Boolean)
  mergedEntry.dmJid = pickPreferredDmJid([
    primaryEntry.dmJid,
    secondaryEntry.dmJid,
    ...mergedEntry.linkedJids,
    primary,
  ])

  cache.users[primary] = normalizeRegistrationEntry(mergedEntry, primary)
  delete cache.users[secondary]

  for (const [alias, target] of Object.entries(cache.links || {})) {
    if (target === secondary) {
      cache.links[alias] = primary
    }
  }

  rebuildLinksFromEntries()

  return {
    ok: true,
    merged: true,
    userId: primary,
    mergedFrom: secondary,
  }
}

function load() {
  try {
    if (!fs.existsSync(REGISTRATION_FILE)) {
      cache = { users: {}, links: {} }
      return
    }
    const data = JSON.parse(fs.readFileSync(REGISTRATION_FILE, "utf8"))
    const rawUsers = data?.users && typeof data.users === "object" ? data.users : {}
    const rawLinks = data?.links && typeof data.links === "object" ? data.links : {}
    const migratedUsers = {}
    let hasMigration = false

    Object.entries(rawUsers).forEach(([rawUserId, rawEntry]) => {
      const normalized = normalizeLegacyUserId(rawUserId)
      if (!normalized) {
        hasMigration = true
        return
      }
      if (normalized !== rawUserId) {
        hasMigration = true
      }
      migratedUsers[normalized] = pickPreferredRegistrationEntry(migratedUsers[normalized], rawEntry, normalized)
    })

    cache = {
      users: migratedUsers,
      links: {},
    }

    rebuildLinksFromEntries()

    for (const [rawAlias, rawTarget] of Object.entries(rawLinks)) {
      const normalizedAlias = normalizeIdentityJid(rawAlias)
      const normalizedTarget = normalizeLegacyUserId(rawTarget)
      if (!normalizedAlias || !normalizedTarget || !cache.users[normalizedTarget]) {
        hasMigration = true
        continue
      }
      const assignment = assignLink(normalizedAlias, normalizedTarget)
      if (assignment.conflictWith) {
        hasMigration = true
      }
      const entry = cache.users[normalizedTarget]
      entry.linkedJids = uniqueStrings([...(entry.linkedJids || []), normalizedAlias])
      cache.users[normalizedTarget] = normalizeRegistrationEntry(entry, normalizedTarget)
    }

    rebuildLinksFromEntries()

    if (hasMigration) {
      save(true)
    }
  } catch (err) {
    console.error("Erro ao carregar registrations.json", err)
    cache = { users: {}, links: {} }
  }
}

function save(immediate = false) {
  const doSave = () => {
    try {
      fs.writeFileSync(REGISTRATION_FILE, JSON.stringify({
        users: cache.users,
        links: cache.links,
      }, null, 2), "utf8")
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
    if (found?.userId && found.userId !== normalized && cache.users[found.userId]) {
      cache.users[normalized] = normalizeRegistrationEntry(entry, normalized)
      delete cache.users[found.userId]
      rebuildLinksFromEntries()
    }
    save()
  }
  return true
}

function getPreferredDmJid(userId = "") {
  const found = getAnyEntryByAliases(userId)
  const targetUserId = found?.userId
  if (!targetUserId || !cache.users[targetUserId]) return ""
  const entry = cache.users[targetUserId]
  return pickPreferredDmJid([
    entry.dmJid,
    ...(Array.isArray(entry.linkedJids) ? entry.linkedJids : []),
    targetUserId,
  ])
}

function getLinkedJids(userId = "") {
  const found = getAnyEntryByAliases(userId)
  const targetUserId = found?.userId
  if (!targetUserId || !cache.users[targetUserId]) return []
  const entry = cache.users[targetUserId]
  return uniqueStrings([
    ...buildIntrinsicAliases(targetUserId),
    ...(Array.isArray(entry.linkedJids) ? entry.linkedJids : []),
    entry.dmJid,
  ]).map((alias) => normalizeIdentityJid(alias)).filter(Boolean)
}

function linkIdentityToUser(userId, identity, options = {}) {
  const target = normalizeUserId(userId)
  const normalizedIdentity = normalizeIdentityJid(identity)

  if (!target || !cache.users[target]) {
    return { ok: false, reason: "not-registered" }
  }

  if (!normalizedIdentity || normalizedIdentity.endsWith("@g.us")) {
    return { ok: false, reason: "invalid-identity" }
  }

  const linkedTarget = resolveLinkedUserId(normalizedIdentity)
  if (linkedTarget && linkedTarget !== target) {
    return {
      ok: false,
      reason: "identity-conflict",
      linkedTo: linkedTarget,
    }
  }

  const entry = normalizeRegistrationEntry(cache.users[target], target)
  const aliases = uniqueStrings([
    ...buildIntrinsicAliases(normalizedIdentity),
    normalizedIdentity,
  ])

  let changed = false
  for (const alias of aliases) {
    const assignment = assignLink(alias, target)
    changed = changed || assignment.changed
  }

  entry.linkedJids = uniqueStrings([
    ...(Array.isArray(entry.linkedJids) ? entry.linkedJids : []),
    ...aliases,
  ]).map((alias) => normalizeIdentityJid(alias)).filter(Boolean)

  if (options?.asDm === true || options?.kind === "dm") {
    const nextDm = pickPreferredDmJid([normalizedIdentity, entry.dmJid])
    if (nextDm && nextDm !== entry.dmJid) {
      entry.dmJid = nextDm
      changed = true
    }
  }

  const safeName = String(options?.profileName || "").trim()
  if (safeName && safeName !== entry.lastKnownName) {
    entry.lastKnownName = safeName
    changed = true
  }

  if (changed) {
    entry.updatedAt = Date.now()
    cache.users[target] = normalizeRegistrationEntry(entry, target)
    rebuildLinksFromEntries()
    save()
  }

  return {
    ok: true,
    changed,
    userId: target,
    dmJid: getPreferredDmJid(target),
  }
}

function linkDmToGroupIdentity(options = {}) {
  const dmJid = normalizeIdentityJid(options?.dmJid || "")
  const groupJid = normalizeIdentityJid(options?.groupJid || options?.groupIdentity || "")
  const profileName = String(options?.profileName || "").trim()

  if (!dmJid || !isDirectUserJid(dmJid)) {
    return { ok: false, reason: "invalid-dm-jid" }
  }

  if (!groupJid || groupJid.endsWith("@g.us")) {
    return { ok: false, reason: "invalid-group-identity" }
  }

  const groupFound = getAnyEntryByAliases(groupJid)
  const dmFound = getAnyEntryByAliases(dmJid)
  const groupUserId = groupFound?.userId || ""
  const dmUserId = dmFound?.userId || ""

  if (!groupUserId && !dmUserId) {
    return { ok: false, reason: "not-registered" }
  }

  let primaryUserId = groupUserId || dmUserId
  let mergedFrom = ""

  if (groupUserId && dmUserId && groupUserId !== dmUserId) {
    const mergeResult = mergeRegisteredUsers(groupUserId, dmUserId)
    if (!mergeResult.ok) {
      return { ok: false, reason: "merge-failed" }
    }
    primaryUserId = mergeResult.userId
    mergedFrom = mergeResult.mergedFrom
  }

  const primaryEntry = normalizeRegistrationEntry(cache.users[primaryUserId], primaryUserId)
  const aliases = uniqueStrings([
    ...(Array.isArray(primaryEntry.linkedJids) ? primaryEntry.linkedJids : []),
    ...buildIntrinsicAliases(groupJid),
    ...buildIntrinsicAliases(dmJid),
    groupJid,
    dmJid,
  ])

  aliases.forEach((alias) => assignLink(alias, primaryUserId))

  primaryEntry.linkedJids = uniqueStrings(aliases)
  primaryEntry.dmJid = pickPreferredDmJid([dmJid, primaryEntry.dmJid, ...aliases, primaryUserId])
  if (profileName && !primaryEntry.lastKnownName) {
    primaryEntry.lastKnownName = profileName
  }
  primaryEntry.updatedAt = Date.now()

  cache.users[primaryUserId] = normalizeRegistrationEntry(primaryEntry, primaryUserId)
  rebuildLinksFromEntries()
  save()

  return {
    ok: true,
    userId: primaryUserId,
    dmJid: getPreferredDmJid(primaryUserId),
    groupIdentity: groupJid,
    mergedFrom,
  }
}

function registerUser(userId, options = {}) {
  const normalized = normalizeLegacyUserId(userId)
  if (!normalized) {
    return { ok: false, reason: "invalid-user" }
  }

  const existing = getAnyEntryByAliases(userId)
  if (existing?.entry) {
    const resolvedUserId = existing.userId || normalized
    if (resolvedUserId !== normalized && cache.users[resolvedUserId]) {
      cache.users[normalized] = normalizeRegistrationEntry(cache.users[resolvedUserId], normalized)
      delete cache.users[resolvedUserId]
      rebuildLinksFromEntries()
    }

    if (options?.dmJid) {
      linkIdentityToUser(normalized, options.dmJid, { asDm: true, profileName: options?.profileName || "" })
    }
    if (Array.isArray(options?.linkedJids)) {
      for (const alias of options.linkedJids) {
        linkIdentityToUser(normalized, alias, { asDm: false, profileName: options?.profileName || "" })
      }
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
  const linkedJids = uniqueStrings([
    ...buildIntrinsicAliases(userId),
    ...(Array.isArray(options?.linkedJids) ? options.linkedJids : []),
  ]).map((alias) => normalizeIdentityJid(alias)).filter(Boolean)
  const dmJid = pickPreferredDmJid([
    options?.dmJid,
    ...linkedJids,
    normalized,
  ])
  if (dmJid) {
    linkedJids.push(dmJid)
  }

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
    dmJid,
    linkedJids: uniqueStrings(linkedJids),
  }

  rebuildLinksFromEntries()

  save()
  return {
    ok: true,
    userId: normalized,
    migratedEconomy,
    entry: { ...cache.users[normalized] },
  }
}

function unregisterUser(userId) {
  const found = getAnyEntryByAliases(userId)
  const normalized = found?.userId || normalizeUserId(userId)
  if (!normalized) {
    return { ok: false, reason: "invalid-user" }
  }

  const removed = removeUserById(normalized)
  if (!removed) {
    return { ok: false, reason: "not-registered" }
  }

  rebuildLinksFromEntries()

  save()

  return {
    ok: true,
    userId: normalized,
    message: "Registro removido."
  }
}

// delete completo
function deleteUserAccount(userId) {
  const found = getAnyEntryByAliases(userId)
  const normalized = found?.userId || normalizeUserId(userId)
  if (!normalized) {
    return { ok: false, reason: "invalid-user" }
  }

  const aliasesToDelete = new Set(getUserIdAliases(normalized))
  aliasesToDelete.add(normalizeLegacyUserId(normalized))
  aliasesToDelete.add(normalizeIdentityJid(normalized))

  const removedRegistration = removeUserById(normalized)
  rebuildLinksFromEntries()

  let removedEconomy = false
  try {
    if (fs.existsSync(ECONOMY_FILE)) {
      const raw = JSON.parse(fs.readFileSync(ECONOMY_FILE, "utf8"))
      if (raw.users && typeof raw.users === "object") {
        Array.from(aliasesToDelete).forEach((alias) => {
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
  const found = getAnyEntryByAliases(userId)
  if (!found?.entry) return null
  const normalized = found.userId || normalizeUserId(userId)
  if (!normalized) return null
  if (found.userId !== normalized && cache.users[found.userId]) {
    cache.users[normalized] = normalizeRegistrationEntry(found.entry, normalized)
    delete cache.users[found.userId]
    rebuildLinksFromEntries()
    save()
  }
  return { ...cache.users[normalized] }
}

function getRegisteredUsers() {
  return Object.keys(cache.users)
}

function getRegisteredUsersForNotifications() {
  const targets = Object.values(cache.users)
    .filter((entry) => entry?.notificationsEnabled !== false)
    .map((entry) => getPreferredDmJid(entry.userId) || entry.userId)

  return uniqueStrings(targets)
}

function getRegisteredCount() {
  return Object.keys(cache.users).length
}

load()

module.exports = {
  normalizeUserId,
  normalizeIdentityJid,
  resolveLinkedUserId,
  getUserIdAliases,
  getLinkedJids,
  getPreferredDmJid,
  linkIdentityToUser,
  linkDmToGroupIdentity,
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
