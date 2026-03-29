process.on("uncaughtException", console.error)
process.on("unhandledRejection", console.error)

const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion, 
  DisconnectReason, 
  downloadMediaMessage,
  jidNormalizedUser
} = require("@whiskeysockets/baileys")
const express = require("express")
const pino = require("pino")
const QRCode = require("qrcode")
const sharp = require("sharp")
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const { execFile } = require("child_process")
const ffmpeg = require("fluent-ffmpeg")
const ffmpegPath = require("ffmpeg-static")
ffmpeg.setFfmpegPath(ffmpegPath)

// IMPORTS: armazenamento e gerenciador de jogos
const storage = require("./storage")
const punishmentService = require("./services/punishmentService")
const caraOuCoroa = require("./games/caraOuCoroa")
const AM = require("./AM.js")
const gameManager = require("./gameManager")
const adivinhacao = require("./games/adivinhacao")
const batataquente = require("./games/batataquente")
const dueloDados = require("./games/dueloDados")
const roletaRussa = require("./games/roletaRussa")
const reacaoGame = require("./games/reacao")
const embaralhado = require("./games/embaralhado")
const comando = require("./games/comando")
const memoriaGame = require("./games/memoria")
const economyService = require("./services/economyService")
const registrationService = require("./services/registrationService")
const telemetry = require("./services/telemetryService")
const { COMMAND_HELP } = require("./commandHelp")
const { getLikelyCommandSuggestions } = require("./services/commandSuggestionService")
const { handleGameCommands, handleGameMessageFlow } = require("./routers/gamesRouter")
const { handleUtilityCommands } = require("./routers/utilityRouter")
const { handleModerationCommands } = require("./routers/moderationRouter")
const { handleEconomyCommands, cleanupUserLinkedState } = require("./routers/economyRouter")

const app = express()
const logger = pino({ level: "silent" })

const prefix = "!"

let qrImage = null

const METRIC_SAMPLE_LIMIT = 200
const COMMAND_HISTORY_LIMIT = 10
const TERMINAL_MIRROR_LIMIT = 500
const OVERRIDE_DATA_PASSWORD_COMMAND = prefix + "vaultkey"
const OVERRIDE_BROADCAST_COMMAND = prefix + "msg"
const OVERRIDE_PENDING_TIMEOUT_MS = 5 * 60 * 1000
const ECONOMY_WIPE_COMMAND = prefix + "wipeeconomia"
const ECONOMY_WIPE_COMMAND_ALIAS = prefix + "wipeeconomy"
const ECONOMY_WIPE_CONFIRM_PHRASE = "CONFIRMAR WIPE ECONOMIA"
const MASS_MENTION_OPT_OUT_HINT = "Cansado de ser mencionado? Use *!mention off* para o bot utilizar seu apelido ao invés de te mencionar!"
const DATA_EXPORT_PASSWORD = String(process.env.PROFILER_PASSWORD || "").trim() || crypto.randomBytes(24).toString("hex")
const pendingBroadcastBySender = new Map()
const pendingOverrideAddBySender = new Map()
const pendingEconomyWipeBySender = new Map()
const pendingUnregisterBySender = new Map()
const knownGroupIds = new Set()
const groupNameCache = {}
const userNameCache = {}
const terminalMirrorLines = []

function execFileAsync(file, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

function recordTerminalOutput(source, chunk) {
  const raw = typeof chunk === "string" ? chunk : Buffer.from(chunk || "").toString("utf8")
  const lines = raw.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean)
  if (lines.length === 0) return
  const now = Date.now()
  for (const line of lines) {
    terminalMirrorLines.push({ at: now, source, line })
  }
  while (terminalMirrorLines.length > TERMINAL_MIRROR_LIMIT) {
    terminalMirrorLines.shift()
  }
}

function isProfilerAuthorized(req) {
  const tokenFromQuery = String(req.query?.password || "").trim()
  const tokenFromHeader = String(req.headers?.["x-profiler-key"] || "").trim()
  const token = tokenFromQuery || tokenFromHeader
  return Boolean(token && token === DATA_EXPORT_PASSWORD)
}

const stdoutWriteOriginal = process.stdout.write.bind(process.stdout)
process.stdout.write = function patchedStdoutWrite(chunk, encoding, callback) {
  recordTerminalOutput("stdout", chunk)
  return stdoutWriteOriginal(chunk, encoding, callback)
}

const stderrWriteOriginal = process.stderr.write.bind(process.stderr)
process.stderr.write = function patchedStderrWrite(chunk, encoding, callback) {
  recordTerminalOutput("stderr", chunk)
  return stderrWriteOriginal(chunk, encoding, callback)
}

function createMetricBucket() {
  return {
    count: 0,
    total: 0,
    min: null,
    max: 0,
    last: 0,
    samples: [],
  }
}

const perfStats = {
  bootAt: Date.now(),
  authenticatedAt: 0,
  connectedAt: 0,
  connectionState: "starting",
  reconnects: 0,
  messagesReceived: 0,
  messagesErrored: 0,
  ignoredNoMessage: 0,
  ignoredFromMe: 0,
  lastProcessedAt: 0,
  lastCommand: "",
  processingMs: createMetricBucket(),
  queueDelayMs: createMetricBucket(),
  sendMessageMs: createMetricBucket(),
  groupMetadataMs: createMetricBucket(),
  eventLoopLagMs: createMetricBucket(),
  commandHistory: [],
  lastCommandByUser: {},
  stages: {},
}

function safeLifetimeInteger(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback
}

function loadLifetimeStats() {
  const raw = typeof storage.getProfilerLifetimeStats === "function"
    ? storage.getProfilerLifetimeStats()
    : {}
  const now = Date.now()
  return {
    sinceAt: safeLifetimeInteger(raw.sinceAt, now),
    bootCount: safeLifetimeInteger(raw.bootCount, 0),
    reconnects: safeLifetimeInteger(raw.reconnects, 0),
    messagesReceived: safeLifetimeInteger(raw.messagesReceived, 0),
    messagesErrored: safeLifetimeInteger(raw.messagesErrored, 0),
    ignoredNoMessage: safeLifetimeInteger(raw.ignoredNoMessage, 0),
    ignoredFromMe: safeLifetimeInteger(raw.ignoredFromMe, 0),
    commandsExecuted: safeLifetimeInteger(raw.commandsExecuted, 0),
    authUptimeTotalMs: safeLifetimeInteger(raw.authUptimeTotalMs, 0),
    authSessionStartedAt: safeLifetimeInteger(raw.authSessionStartedAt, 0),
    lastSeenAt: safeLifetimeInteger(raw.lastSeenAt, 0),
  }
}

const lifetimeStats = loadLifetimeStats()

function persistLifetimeStats() {
  if (typeof storage.setProfilerLifetimeStats !== "function") return
  lifetimeStats.lastSeenAt = Date.now()
  storage.setProfilerLifetimeStats(lifetimeStats)
}

lifetimeStats.bootCount += 1
if (!lifetimeStats.sinceAt) {
  lifetimeStats.sinceAt = Date.now()
}
persistLifetimeStats()

function addCommandHistory(entry = {}) {
  const normalizedSenderId = registrationService.normalizeUserId(entry.senderId || "")
  const nextEntry = {
    at: Date.now(),
    command: String(entry.command || "").trim(),
    senderId: normalizedSenderId,
    senderName: String(entry.senderName || "").trim() || "Desconhecido",
    groupName: String(entry.groupName || "").trim() || "DM",
  }
  perfStats.commandHistory.unshift(nextEntry)
  if (perfStats.commandHistory.length > COMMAND_HISTORY_LIMIT) {
    perfStats.commandHistory.length = COMMAND_HISTORY_LIMIT
  }
  if (normalizedSenderId && nextEntry.command) {
    perfStats.lastCommandByUser[normalizedSenderId] = {
      command: nextEntry.command,
      at: nextEntry.at,
    }
  }
  if (nextEntry.command) {
    lifetimeStats.commandsExecuted += 1
    persistLifetimeStats()
  }
}

function recordMetric(bucket, rawValue) {
  const value = Number(rawValue)
  if (!Number.isFinite(value) || value < 0) return
  bucket.count += 1
  bucket.total += value
  bucket.last = value
  bucket.min = bucket.min === null ? value : Math.min(bucket.min, value)
  bucket.max = Math.max(bucket.max, value)
  bucket.samples.push(value)
  if (bucket.samples.length > METRIC_SAMPLE_LIMIT) {
    bucket.samples.shift()
  }
}

function getStageBucket(stageName) {
  if (!perfStats.stages[stageName]) {
    perfStats.stages[stageName] = createMetricBucket()
  }
  return perfStats.stages[stageName]
}

function parseMessageTimestampMs(msg) {
  const ts = msg?.messageTimestamp
  if (typeof ts === "number") return ts * 1000
  if (typeof ts === "bigint") return Number(ts) * 1000
  if (typeof ts === "string") {
    const parsed = Number.parseInt(ts, 10)
    return Number.isFinite(parsed) ? parsed * 1000 : 0
  }
  if (ts && typeof ts === "object") {
    if (typeof ts.toNumber === "function") {
      const parsed = Number(ts.toNumber())
      return Number.isFinite(parsed) ? parsed * 1000 : 0
    }
    const parsed = Number(ts.low)
    return Number.isFinite(parsed) ? parsed * 1000 : 0
  }
  return 0
}

function percentileFromSamples(samples = [], percentile = 95) {
  if (!Array.isArray(samples) || samples.length === 0) return 0
  const sorted = [...samples].sort((a, b) => a - b)
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil((percentile / 100) * sorted.length) - 1))
  return sorted[index]
}

function getMetricSummary(bucket) {
  const count = bucket.count || 0
  const avg = count > 0 ? bucket.total / count : 0
  const p95 = percentileFromSamples(bucket.samples, 95)
  return {
    count,
    avg,
    p95,
    min: bucket.min ?? 0,
    max: bucket.max || 0,
    last: bucket.last || 0,
  }
}

function formatMs(value) {
  return `${Number(value || 0).toFixed(1)} ms`
}

function formatDateTime(value) {
  if (!value) return "-"
  const shifted = new Date(Number(value) - (3 * 60 * 60 * 1000))
  return shifted.toISOString().replace("T", " ").slice(0, 19) + " (UTC-3)"
}

function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(Number(ms || 0) / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${h}h ${m}m ${s}s`
}

function getMemoryUsageMb() {
  const heapUsed = Math.round((process.memoryUsage().heapUsed / (1024 * 1024)) * 10) / 10
  const rss = Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10
  return { heapUsed, rss }
}

function renderMetricRow(label, bucket) {
  const summary = getMetricSummary(bucket)
  return `<tr><td>${label}</td><td>${summary.count}</td><td>${formatMs(summary.last)}</td><td>${formatMs(summary.avg)}</td><td>${formatMs(summary.p95)}</td><td>${formatMs(summary.max)}</td></tr>`
}

function escapeHtmlServer(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function renderPerfPanelHtml() {
  const now = Date.now()
  const uptime = formatElapsed(now - perfStats.bootAt)
  const authUptime = perfStats.authenticatedAt ? formatElapsed(now - perfStats.authenticatedAt) : "-"
  const mem = getMemoryUsageMb()
  const stageRows = Object.entries(perfStats.stages)
    .sort((a, b) => getMetricSummary(b[1]).avg - getMetricSummary(a[1]).avg)
    .slice(0, 12)
    .map(([name, bucket]) => renderMetricRow(`stage:${name}`, bucket))
    .join("")

  return `
    <section style="margin-top:20px;padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa;max-width:980px">
      <h3 style="margin:0 0 10px 0">Performance</h3>
      <p style="margin:4px 0">Estado da conexão: <b>${perfStats.connectionState}</b></p>
      <p style="margin:4px 0">Uptime do bot: <b>${uptime}</b> | Desde autenticação: <b>${authUptime}</b></p>
      <p style="margin:4px 0">Autenticado em: <b>${formatDateTime(perfStats.authenticatedAt)}</b> | Conectado em: <b>${formatDateTime(perfStats.connectedAt)}</b></p>
      <p style="margin:4px 0">Mensagens recebidas: <b>${perfStats.messagesReceived}</b> | Erros: <b>${perfStats.messagesErrored}</b> | Ignoradas (sem conteúdo): <b>${perfStats.ignoredNoMessage}</b> | Ignoradas (fromMe): <b>${perfStats.ignoredFromMe}</b></p>
      <p style="margin:4px 0">Último comando: <b>${perfStats.lastCommand || "-"}</b> | Último processamento: <b>${formatDateTime(perfStats.lastProcessedAt)}</b> | Reconexões: <b>${perfStats.reconnects}</b></p>
      <p style="margin:4px 0">Memória: heap <b>${mem.heapUsed} MB</b> | rss <b>${mem.rss} MB</b> | Registrados <b>${registrationService.getRegisteredCount()}</b></p>
      <table style="width:100%;margin-top:12px;border-collapse:collapse;font-family:monospace;font-size:12px">
        <thead>
          <tr>
            <th style="text-align:left;border-bottom:1px solid #ccc;padding:4px">Métrica</th>
            <th style="text-align:right;border-bottom:1px solid #ccc;padding:4px">Count</th>
            <th style="text-align:right;border-bottom:1px solid #ccc;padding:4px">Last</th>
            <th style="text-align:right;border-bottom:1px solid #ccc;padding:4px">Avg</th>
            <th style="text-align:right;border-bottom:1px solid #ccc;padding:4px">P95</th>
            <th style="text-align:right;border-bottom:1px solid #ccc;padding:4px">Max</th>
          </tr>
        </thead>
        <tbody>
          ${renderMetricRow("message.processing", perfStats.processingMs)}
          ${renderMetricRow("message.queueDelay", perfStats.queueDelayMs)}
          ${renderMetricRow("sock.sendMessage", perfStats.sendMessageMs)}
          ${renderMetricRow("sock.groupMetadata", perfStats.groupMetadataMs)}
          ${renderMetricRow("eventLoop.lag", perfStats.eventLoopLagMs)}
          ${stageRows}
        </tbody>
      </table>
    </section>
  `
}

let eventLoopLagExpectedAt = Date.now() + 1000
setInterval(() => {
  const now = Date.now()
  const lag = Math.max(0, now - eventLoopLagExpectedAt)
  recordMetric(perfStats.eventLoopLagMs, lag)
  eventLoopLagExpectedAt = now + 1000
}, 1000).unref()

const {
  getPunishmentChoiceFromText,
  getRandomPunishmentChoice,
  getPunishmentNameById,
  getPunishmentMenuText,
  getPunishmentDetailsText,
  clearPendingPunishment,
  clearPunishment,
  applyPunishment,
  handlePunishmentEnforcement,
  handlePendingPunishmentChoice,
} = punishmentService

// Sobrescrita de identidade para comandos administrativos especiais
const HARDCODED_OVERRIDE_OWNER = "owner"
const HARDCODED_OVERRIDE_IDENTIFIERS = [
  "5521995409899@lid",
  "5521995409899@s.whatsapp.net",
  "5521995409899",
]

const OVERRIDE_CONTROL_SCOPE = "__system__"
const OVERRIDE_CONTROL_KEY = "overrideControl"
const OVERRIDE_PROFILES_KEY = "overrideProfiles"
const OVERRIDE_STATUS_KEY = "overrideStatus"
const OVERRIDE_GROUP_MAPPINGS_KEY = "overrideGroupMappings"
const MAINTENANCE_MODE_KEY = "maintenanceMode"
function normalizeOverrideIdentity(value = "") {
  return String(value || "").trim().toLowerCase().split(":")[0]
}

function expandOverrideIdentityVariants(value = "") {
  const normalized = normalizeOverrideIdentity(value)
  if (!normalized) return []
  const userPart = normalized.split("@")[0]
  if (!userPart) return [normalized]
  return [...new Set([
    normalized,
    userPart,
    `${userPart}@s.whatsapp.net`,
    `${userPart}@lid`,
  ])]
}

function sanitizeOverrideProfileEntries(entries = {}) {
  const raw = entries && typeof entries === "object" ? entries : {}
  const sanitized = {}
  for (const profileName of Object.keys(raw)) {
    const normalizedName = String(profileName || "").trim().toLowerCase()
    if (!normalizedName) continue
    const list = Array.isArray(raw[profileName]) ? raw[profileName] : []
    const normalizedList = [...new Set(list.map(normalizeOverrideIdentity).filter(Boolean))]
    if (normalizedList.length > 0) sanitized[normalizedName] = normalizedList
  }
  return sanitized
}

function sanitizeOverrideProfiles(profiles = {}) {
  const raw = profiles && typeof profiles === "object" ? profiles : {}

  // Compatibilidade com formato legado: { owner: [jid1, jid2] }
  const legacyLooksLikeEntryMap = !Object.prototype.hasOwnProperty.call(raw, "positivo") &&
    !Object.prototype.hasOwnProperty.call(raw, "good")

  const sourcePositivo = legacyLooksLikeEntryMap ? raw : (raw.positivo || raw.good || {})

  const sanitizedPositivo = sanitizeOverrideProfileEntries(sourcePositivo)

  const hardcoded = sanitizeOverrideProfileEntries({ [HARDCODED_OVERRIDE_OWNER]: HARDCODED_OVERRIDE_IDENTIFIERS })
  const mergedHardcoded = {
    ...sanitizedPositivo,
    [HARDCODED_OVERRIDE_OWNER]: [...new Set([
      ...(hardcoded[HARDCODED_OVERRIDE_OWNER] || []),
      ...(sanitizedPositivo[HARDCODED_OVERRIDE_OWNER] || []),
    ])],
  }

  return {
    positivo: mergedHardcoded,
  }
}

function setOverrideProfiles(profiles = {}) {
  const sanitized = sanitizeOverrideProfiles(profiles)
  storage.setGameState(OVERRIDE_CONTROL_SCOPE, OVERRIDE_PROFILES_KEY, sanitized)
  return sanitized
}

function getOverrideProfiles() {
  const stored = storage.getGameState(OVERRIDE_CONTROL_SCOPE, OVERRIDE_PROFILES_KEY)
  const profiles = sanitizeOverrideProfiles(stored)

  // Migração lazy para persistir formato de matriz no estado.
  if (!stored || JSON.stringify(stored) !== JSON.stringify(profiles)) {
    setOverrideProfiles(profiles)
  }

  return profiles
}

function sanitizeOverrideStatus(statusMap = {}, profiles = getOverrideProfiles()) {
  const raw = statusMap && typeof statusMap === "object" ? statusMap : {}
  const result = { positivo: {} }

  const sourceRaw = raw?.positivo || raw?.good || {}
  const source = sourceRaw && typeof sourceRaw === "object" ? sourceRaw : {}
  const profileNames = Object.keys(profiles?.positivo || {})
  for (const profileName of profileNames) {
    const current = source[profileName]
    if (profileName === HARDCODED_OVERRIDE_OWNER) {
      result.positivo[profileName] = true
      continue
    }
    result.positivo[profileName] = typeof current === "boolean" ? current : true
  }

  return result
}

function getOverrideStatusMap() {
  const profiles = getOverrideProfiles()
  const stored = storage.getGameState(OVERRIDE_CONTROL_SCOPE, OVERRIDE_STATUS_KEY)
  const statuses = sanitizeOverrideStatus(stored, profiles)
  if (!stored || JSON.stringify(stored) !== JSON.stringify(statuses)) {
    storage.setGameState(OVERRIDE_CONTROL_SCOPE, OVERRIDE_STATUS_KEY, statuses)
  }
  return statuses
}

function setOverrideStatusMap(statuses = {}) {
  const sanitized = sanitizeOverrideStatus(statuses, getOverrideProfiles())
  storage.setGameState(OVERRIDE_CONTROL_SCOPE, OVERRIDE_STATUS_KEY, sanitized)
  return sanitized
}

function getOverrideGroupMappings() {
  const raw = typeof storage.getOverrideGroupMappings === "function"
    ? storage.getOverrideGroupMappings()
    : storage.getGameState(OVERRIDE_CONTROL_SCOPE, OVERRIDE_GROUP_MAPPINGS_KEY)
  if (!raw || typeof raw !== "object") {
    const empty = {}
    if (typeof storage.setOverrideGroupMappings === "function") {
      storage.setOverrideGroupMappings(empty)
    } else {
      storage.setGameState(OVERRIDE_CONTROL_SCOPE, OVERRIDE_GROUP_MAPPINGS_KEY, empty)
    }
    return empty
  }
  return raw
}

function setOverrideGroupMappings(mappings = {}) {
  const raw = mappings && typeof mappings === "object" ? mappings : {}
  const sanitized = {}
  for (const [profileNameRaw, groupsRaw] of Object.entries(raw)) {
    const profileName = String(profileNameRaw || "").trim().toLowerCase()
    if (!profileName) continue
    const list = Array.isArray(groupsRaw) ? groupsRaw : []
    const normalized = [...new Set(
      list
        .map((groupId) => String(groupId || "").trim().toLowerCase())
        .filter((groupId) => groupId.endsWith("@g.us"))
    )]
    sanitized[profileName] = normalized
  }
  if (typeof storage.setOverrideGroupMappings === "function") {
    storage.setOverrideGroupMappings(sanitized)
  } else {
    storage.setGameState(OVERRIDE_CONTROL_SCOPE, OVERRIDE_GROUP_MAPPINGS_KEY, sanitized)
  }
  return sanitized
}

function isOverrideAllowedInGroup(identity = "", groupId = "") {
  const normalizedGroup = String(groupId || "").trim().toLowerCase()
  if (!normalizedGroup.endsWith("@g.us")) return true
  if (isHardcodedOverrideIdentity(identity)) return true

  const profile = findOverrideProfileByIdentity(identity, {
    category: "positivo",
    includeDisabled: false,
  })
  if (!profile?.profileName) return false

  const mappings = getOverrideGroupMappings()
  const allowedGroups = Array.isArray(mappings?.[profile.profileName]) ? mappings[profile.profileName] : []
  // Sem mapeamento explícito: comportamento legado (permitido em todos os grupos).
  if (allowedGroups.length === 0) return true
  return allowedGroups.includes(normalizedGroup)
}

function isOverrideProfileAllowedInGroup(profileName = "", groupId = "") {
  const normalizedGroup = String(groupId || "").trim().toLowerCase()
  if (!normalizedGroup.endsWith("@g.us")) return true
  const mappings = getOverrideGroupMappings()
  const allowedGroups = Array.isArray(mappings?.[profileName]) ? mappings[profileName] : []
  if (allowedGroups.length === 0) return true
  return allowedGroups.includes(normalizedGroup)
}

function buildOverrideGroupsStatusText() {
  const mappings = getOverrideGroupMappings()
  const profiles = getOverrideProfiles()
  const allProfileSet = new Set([
    ...Object.keys(profiles?.positivo || {}),
    ...Object.keys(mappings || {}),
  ])
  const allProfiles = [
    ...(allProfileSet.has(HARDCODED_OVERRIDE_OWNER) ? [HARDCODED_OVERRIDE_OWNER] : []),
    ...Array.from(allProfileSet).filter((name) => name !== HARDCODED_OVERRIDE_OWNER).sort(),
  ]

  if (allProfiles.length === 0) {
    return "Nenhum perfil de override encontrado."
  }

  const lines = allProfiles.map((profileName) => {
    const groups = Array.isArray(mappings?.[profileName]) ? mappings[profileName] : []
    const scope = groups.length > 0 ? groups.join(", ") : "todos os grupos (legado)"
    const identities = Array.isArray(profiles?.positivo?.[profileName]) ? profiles.positivo[profileName] : []
    const identityPreview = identities.length > 0
      ? identities.slice(0, 8).join(", ") + (identities.length > 8 ? ` ... (+${identities.length - 8})` : "")
      : "(sem identidades)"
    return `- ${profileName}: ${scope}\n  IDs: ${identityPreview}`
  })

  return (
    "Mapeamento de grupos por perfil de override:\n" +
    lines.join("\n") +
    `\n\nUse: ${prefix}overridegroup <perfil> <add|rm|list> [groupJid]`
  )
}

function isOverrideProfileEnabled(category, profileName) {
  const normalizedCategory = "positivo"
  const normalizedName = String(profileName || "").trim().toLowerCase()
  if (!normalizedName) return false
  if (normalizedCategory === "positivo" && normalizedName === HARDCODED_OVERRIDE_OWNER) return true
  const statuses = getOverrideStatusMap()
  return Boolean(statuses?.[normalizedCategory]?.[normalizedName])
}

function getOverrideIdentitySetByCategory({ category = "positivo", includeDisabled = false } = {}) {
  const normalizedCategory = "positivo"
  const profiles = getOverrideProfiles()
  const identities = []
  for (const [profileName, list] of Object.entries(profiles?.[normalizedCategory] || {})) {
    if (!includeDisabled && !isOverrideProfileEnabled(normalizedCategory, profileName)) continue
    identities.push(...(Array.isArray(list) ? list : []))
  }
  return new Set(identities.map(normalizeOverrideIdentity).filter(Boolean))
}

function isHardcodedOverrideIdentity(identity = "") {
  const normalized = normalizeOverrideIdentity(identity)
  if (!normalized) return false
  const hardcodedSet = new Set(HARDCODED_OVERRIDE_IDENTIFIERS.map(normalizeOverrideIdentity).filter(Boolean))
  if (hardcodedSet.has(normalized)) return true
  const userPart = normalized.split("@")[0]
  return Boolean(userPart && hardcodedSet.has(userPart))
}

function getOverrideIdentitySet() {
  return getOverrideIdentitySetByCategory({ category: "positivo", includeDisabled: false })
}

function getOverrideCompatibilityContext() {
  const identities = Array.from(getOverrideIdentitySetByCategory({ category: "positivo", includeDisabled: false }))
  const preferredJid = identities.find((id) => id.endsWith("@s.whatsapp.net")) || identities.find((id) => id.includes("@")) || ""
  const preferredPhone = preferredJid ? preferredJid.split("@")[0] : (identities.find((id) => !id.includes("@")) || "")
  return {
    overrideJid: preferredJid ? jidNormalizedUser(preferredJid) : "",
    overridePhoneNumber: preferredPhone,
    overrideIdentifiers: identities,
  }
}

function isKnownOverrideIdentity(identity = "", options = {}) {
  const normalized = normalizeOverrideIdentity(identity)
  if (!normalized) return false
  if (isHardcodedOverrideIdentity(normalized)) return true

  const category = "positivo"
  const includeDisabled = Boolean(options?.includeDisabled)
  const overrideSet = getOverrideIdentitySetByCategory({ category, includeDisabled })
  if (overrideSet.has(normalized)) return true

  const userPart = normalized.split("@")[0]
  return Boolean(userPart && overrideSet.has(userPart))
}

function findOverrideProfileByIdentity(identity = "", options = {}) {
  const normalized = normalizeOverrideIdentity(identity)
  if (!normalized) return null
  const includeDisabled = Boolean(options?.includeDisabled)
  const categories = ["positivo"]
  const profiles = getOverrideProfiles()

  for (const categoryRaw of categories) {
    const category = "positivo"
    for (const [profileName, identities] of Object.entries(profiles?.[category] || {})) {
      if (!includeDisabled && !isOverrideProfileEnabled(category, profileName)) continue
      const set = new Set((identities || []).map(normalizeOverrideIdentity).filter(Boolean))
      if (set.has(normalized)) return { category, profileName }
      const userPart = normalized.split("@")[0]
      if (userPart && set.has(userPart)) return { category, profileName }
    }
  }

  return null
}

function getOverrideChecksEnabled() {
  const controlState = storage.getGameState(OVERRIDE_CONTROL_SCOPE, OVERRIDE_CONTROL_KEY)
  if (typeof controlState?.enabled !== "boolean") return true
  return controlState.enabled
}

function setOverrideChecksEnabled(enabled) {
  storage.setGameState(OVERRIDE_CONTROL_SCOPE, OVERRIDE_CONTROL_KEY, {
    enabled: Boolean(enabled),
    updatedAt: Date.now(),
  })
}

function getMaintenanceModeState() {
  const raw = storage.getGameState(OVERRIDE_CONTROL_SCOPE, MAINTENANCE_MODE_KEY)
  const enabled = Boolean(raw?.enabled)
  const allowedGroupId = String(raw?.allowedGroupId || "").trim().toLowerCase()
  return {
    enabled,
    allowedGroupId: allowedGroupId.endsWith("@g.us") ? allowedGroupId : "",
    updatedAt: Number(raw?.updatedAt) || 0,
    updatedBy: String(raw?.updatedBy || "").trim(),
  }
}

function setMaintenanceModeState(state = {}) {
  const nextEnabled = Boolean(state?.enabled)
  const nextAllowedGroupId = String(state?.allowedGroupId || "").trim().toLowerCase()
  storage.setGameState(OVERRIDE_CONTROL_SCOPE, MAINTENANCE_MODE_KEY, {
    enabled: nextEnabled,
    allowedGroupId: nextEnabled && nextAllowedGroupId.endsWith("@g.us") ? nextAllowedGroupId : "",
    updatedAt: Date.now(),
    updatedBy: String(state?.updatedBy || "").trim(),
  })
}

function isOverrideIdentity(identity = "", groupId = "", isGroupMessage = false) {
  if (!getOverrideChecksEnabled()) return false
  const known = isKnownOverrideIdentity(identity, { category: "positivo", includeDisabled: false })
  if (!known) return false
  if (!isGroupMessage) return true
  return isOverrideAllowedInGroup(identity, groupId)
}

function isYesToken(text = "") {
  const normalized = String(text || "").trim().toLowerCase()
  return ["y", "yes", "s", "sim"].includes(normalized)
}

function isNoToken(text = "") {
  const normalized = String(text || "").trim().toLowerCase()
  return ["n", "no", "nao", "não"].includes(normalized)
}

function isQuitToken(text = "") {
  const normalized = String(text || "").trim().toLowerCase()
  return ["q", "quit", "cancel", "cancelar", "sair"].includes(normalized)
}

function formatOverrideCategoryLabel(category = "") {
  return "positivo"
}

function getOrderedOverrideProfileNames(profiles = {}) {
  const names = Object.keys(profiles?.positivo || {})
  const ownerFirst = []
  const others = []
  for (const name of names) {
    if (name === HARDCODED_OVERRIDE_OWNER) {
      ownerFirst.push(name)
    } else {
      others.push(name)
    }
  }
  return [...ownerFirst, ...others]
}

function buildOverrideToggleStatusText() {
  const profiles = getOverrideProfiles()
  const statuses = getOverrideStatusMap()

  const renderCategory = (category) => {
    const entries = getOrderedOverrideProfileNames(profiles)
    if (entries.length === 0) return `(${formatOverrideCategoryLabel(category)} vazio)`
    return entries
      .map((profileName, index) => {
        const enabled = Boolean(statuses?.[category]?.[profileName])
        return `${index + 1}. ${profileName} [${enabled ? "ON" : "OFF"}]`
      })
      .join("\n")
  }

  return (
    `Overrides:\n${renderCategory("positivo")}\n\n` +
    `Use: ${prefix}toggleoverride <indice>`
  )
}

function getBroadcastTitle(type = "aviso") {
  const normalized = String(type || "").toLowerCase().trim()
  if (normalized === "update") {
    return "🆕⚙️ ATUALIZAÇÃO DO BOT ⚙️🆕"
  }
  return "🚨⚠️ AVISO IMPORTANTE DO BOT ⚠️🚨"
}

function parseBroadcastMentionModeToken(value = "") {
  const normalized = String(value || "").trim().toLowerCase()
  if (normalized === "r") return "T"
  if (normalized === "t") return "T"
  if (normalized === "n") return "N"
  if (normalized === "a") return "A"
  return null
}

function shouldAppendMassMentionHint(messageContent = {}) {
  const mentions = Array.isArray(messageContent?.mentions) ? messageContent.mentions.filter(Boolean) : []
  if (mentions.length <= 2) return false
  const text = typeof messageContent?.text === "string" ? messageContent.text : ""
  if (!text) return false

  const lower = text.toLowerCase()
  if (lower.includes(MASS_MENTION_OPT_OUT_HINT.toLowerCase())) return false

  // Lobby/raffle messages are exempt from this footer by requirement.
  if (lower.includes("lobby") || lower.includes("loteria") || lower.includes("raffle") || lower.includes("sorteio")) {
    return false
  }

  return true
}

function isEconomyCommandName(cmdName = "", cmd = "") {
  const economyCommands = new Set([
    prefix + "economia",
    prefix + "xp",
    prefix + "missao",
    prefix + "missoes",
    prefix + "perfil",
    prefix + "extrato",
    prefix + "coinsranking",
    prefix + "xpranking",
    prefix + "loja",
    prefix + "guia",
    prefix + "comprar",
    prefix + "comprarpara",
    prefix + "vender",
    prefix + "doarcoins",
    prefix + "doaritem",
    prefix + "roubar",
    prefix + "daily",
    prefix + "cassino",
    prefix + "lootbox",
    prefix + "falsificar",
    prefix + "trabalho",
    prefix + "cupom",
    prefix + "loteria",
    prefix + "usaritem",
    prefix + "usarpasse",
    prefix + "setcoins",
    prefix + "addcoins",
    prefix + "removecoins",
    prefix + "additem",
    prefix + "removeitem",
    prefix + "trade",
    prefix + "time",
    prefix + "deletarconta",
    prefix + "deleteconta",
    // Jogos com aposta/entrada/recompensa devem exigir cadastro também.
    prefix + "moeda",
    prefix + "aposta",
    prefix + "comecar",
    prefix + "começar",
    prefix + "start",
    prefix + "entrar",
    prefix + "join",
    prefix + "resposta",
    prefix + "passa",
    prefix + "rolar",
    prefix + "atirar",
  ])
  if (economyCommands.has(cmdName)) return true
  return economyCommands.has(cmd)
}

function normalizeFilterComparable(value = "") {
  const map = {
    "@": "a",
    "4": "a",
    "3": "e",
    "1": "i",
    "!": "i",
    "|": "i",
    "0": "o",
    "$": "s",
    "5": "s",
    "7": "t",
    "+": "t",
    "8": "b",
    "9": "g",
    "2": "z",
  }

  const ascii = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

  let normalized = ""
  for (const ch of ascii) {
    const mapped = map[ch] || ch
    if (/^[a-z0-9]$/.test(mapped)) {
      normalized += mapped
    }
  }
  return normalized
}

function messageTriggersFilter(text = "", filterText = "") {
  const rawMessage = String(text || "").toLowerCase()
  const rawFilter = String(filterText || "").toLowerCase().trim()
  if (!rawFilter) return false
  if (rawMessage.includes(rawFilter)) return true

  const messageNormalized = normalizeFilterComparable(rawMessage)
  const filterNormalized = normalizeFilterComparable(rawFilter)
  if (!filterNormalized) return false
  return messageNormalized.includes(filterNormalized)
}

function formatUnknownCommandSuggestionText(inputCmd = "", result = { metric: "", suggestions: [] }) {
  const suggestions = Array.isArray(result?.suggestions) ? result.suggestions : []
  if (suggestions.length === 0) {
    return (
      `Comando não reconhecido: *${String(inputCmd || "").trim()}*\n` +
      `Use *${prefix}menu* para ver os comandos disponíveis.`
    )
  }

  const lines = [
    `Comando não reconhecido: *${String(inputCmd || "").trim()}*`,
    "Você quis dizer:",
  ]

  for (let i = 0; i < suggestions.length; i++) {
    lines.push(`${i + 1}. *${suggestions[i].text}*`)
  }
  return lines.join("\n")
}

function collectKnownGroupsFromStorage() {
  const groups = new Set(Array.from(knownGroupIds))
  const cache = storage.getCache?.() || {}
  const scanKeys = (obj = {}) => {
    if (!obj || typeof obj !== "object") return
    for (const key of Object.keys(obj)) {
      if (String(key).endsWith("@g.us")) groups.add(key)
    }
  }
  scanKeys(cache.mutedUsers)
  scanKeys(cache.adminPrivileges)
  scanKeys(cache.coinGames)
  scanKeys(cache.coinPunishmentPending)
  scanKeys(cache.resenhaAveriguada)
  scanKeys(cache.coinStreaks)
  scanKeys(cache.coinStreakMax)
  scanKeys(cache.coinHistoricalMax)
  scanKeys(cache.activePunishments)
  scanKeys(cache.groupFilters)
  scanKeys(cache.groupVoteThresholds)
  scanKeys(cache.groupVoteSessions)
  scanKeys(cache.gameStates)
  return Array.from(groups)
}

const dddMap = {
  // Sudeste
  "11": "Sudeste","12": "Sudeste","13": "Sudeste","14": "Sudeste","15": "Sudeste",
  "16": "Sudeste","17": "Sudeste","18": "Sudeste","19": "Sudeste",
  "21": "Sudeste","22": "Sudeste","24": "Sudeste",
  "31": "Sudeste","32": "Sudeste","33": "Sudeste","34": "Sudeste","35": "Sudeste","37": "Sudeste","38": "Sudeste",

  // Sul
  "41": "Sul","42": "Sul","43": "Sul","44": "Sul","45": "Sul","46": "Sul",
  "47": "Sul","48": "Sul","49": "Sul",
  "51": "Sul","53": "Sul","54": "Sul","55": "Sul",

  // Nordeste
  "71": "Nordeste","73": "Nordeste","74": "Nordeste","75": "Nordeste","79": "Nordeste",
  "81": "Nordeste","82": "Nordeste","83": "Nordeste","84": "Nordeste","85": "Nordeste",
  "86": "Nordeste","87": "Nordeste","88": "Nordeste","89": "Nordeste",

  // Norte
  "91": "Norte","92": "Norte","93": "Norte","94": "Norte","95": "Norte","96": "Norte",
  "97": "Norte","98": "Norte","99": "Norte",

  // Centro-Oeste
  "61": "Centro-Oeste","62": "Centro-Oeste","64": "Centro-Oeste","63": "Centro-Oeste",
  "65": "Centro-Oeste","66": "Centro-Oeste","67": "Centro-Oeste",
}

function getKnownGroupName(groupId = "") {
  return groupNameCache[groupId] || "Grupo desconhecido"
}

function getKnownUserName(userId = "") {
  return userNameCache[userId] || userId.split("@")[0] || "Desconhecido"
}

telemetry.setIdentityResolvers({
  getKnownUserName,
  getKnownGroupName,
})

function sanitizeInlineText(value = "", maxLen = 42) {
  const raw = String(value || "").replace(/[\r\n\t]+/g, " ").trim()
  if (!raw) return "-"
  return raw.length > maxLen ? `${raw.slice(0, maxLen - 1)}...` : raw
}

function formatInteger(value = 0) {
  const parsed = Math.floor(Number(value) || 0)
  return parsed.toLocaleString("pt-BR")
}

function buildEconomyWipeUserSummaries() {
  const userIds = typeof economyService.getAllUserIds === "function"
    ? economyService.getAllUserIds()
    : []

  return userIds
    .map((userId) => {
      const profile = economyService.getProfile(userId)
      const regEntry = registrationService.getRegisteredEntry(userId)
      const localName = getKnownUserName(userId)
      const waName = sanitizeInlineText(regEntry?.lastKnownName || localName || userId.split("@")[0])
      const nickname = sanitizeInlineText(profile?.preferences?.publicLabel || "-")
      const level = Math.max(1, Math.floor(Number(profile?.progression?.level) || 1))
      const coins = Math.max(0, Math.floor(Number(profile?.coins) || 0))
      const shields = Math.max(0, Math.floor(Number(profile?.shields) || 0))
      const itemKinds = Object.keys(profile?.items || {}).length
      const txCount = Array.isArray(profile?.transactions) ? profile.transactions.length : 0
      return {
        userId,
        waName,
        nickname,
        infoLine: `coins=${formatInteger(coins)} | lvl=${level} | escudos=${shields} | itens=${itemKinds} | tx=${txCount}`,
      }
    })
    .sort((a, b) => a.userId.localeCompare(b.userId))
}

function buildEconomyWipeListPages(summaries = []) {
  if (summaries.length === 0) {
    return ["Nenhum perfil de economia encontrado."]
  }

  const pages = []
  const chunkSize = 15
  for (let start = 0; start < summaries.length; start += chunkSize) {
    const chunk = summaries.slice(start, start + chunkSize)
    const lines = [
      `Perfis de economia (${summaries.length} total)`,
      "",
    ]

    for (let i = 0; i < chunk.length; i++) {
      const globalIndex = start + i + 1
      const entry = chunk[i]
      lines.push(`[${globalIndex}] ${entry.userId}`)
      lines.push(`Nome WhatsApp: ${entry.waName}`)
      lines.push(`Apelido: ${entry.nickname}`)
      lines.push(`Info: ${entry.infoLine}`)
      lines.push("")
    }

    pages.push(lines.join("\n").trim())
  }

  return pages
}

function parseEconomyWipeSelection(input = "", maxIndex = 0) {
  const normalized = String(input || "").trim().toLowerCase()
  if (!normalized) {
    return { ok: false, error: "Selecao vazia. Use um indice, faixa (ex: 1-5) ou all." }
  }

  if (["all", "todos", "total"].includes(normalized)) {
    return {
      ok: true,
      indexes: Array.from({ length: maxIndex }, (_, i) => i + 1),
    }
  }

  const single = Number.parseInt(normalized, 10)
  if (Number.isFinite(single) && String(single) === normalized) {
    if (single < 1 || single > maxIndex) {
      return { ok: false, error: `Indice fora do intervalo 1-${maxIndex}.` }
    }
    return { ok: true, indexes: [single] }
  }

  const rangeMatch = normalized.match(/^(\d+)\s*-\s*(\d+)$/)
  if (rangeMatch) {
    const start = Number.parseInt(rangeMatch[1], 10)
    const end = Number.parseInt(rangeMatch[2], 10)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < 1 || start > end || end > maxIndex) {
      return { ok: false, error: `Faixa invalida. Use algo como 1-5 dentro do intervalo 1-${maxIndex}.` }
    }
    const indexes = []
    for (let i = start; i <= end; i++) indexes.push(i)
    return { ok: true, indexes }
  }

  return { ok: false, error: "Formato invalido. Use um indice, faixa (ex: 1-5) ou all." }
}

function buildEconomyWipePreviewText(sessionState = {}) {
  const selected = Array.isArray(sessionState.selectedEntries) ? sessionState.selectedEntries : []
  const wipeStats = Boolean(sessionState.wipeStats)
  const wipeEconomyDataOnly = Boolean(sessionState.wipeEconomyDataOnly)
  const modeLabel = sessionState.mode === "total" ? "TOTAL" : "PERFIS"
  const sample = selected.slice(0, 20)

  const lines = [
    "Preview do wipe:",
    `Modo: ${modeLabel}`,
    `Perfis selecionados: ${selected.length}`,
    `Arg wipeeconomy (somente dados): ${wipeEconomyDataOnly ? "SIM" : "NAO"}`,
    `Wipe de stats extras: ${wipeStats ? "SIM" : "NAO"}`,
    "",
    "Acoes base por perfil:",
    ...(wipeEconomyDataOnly
      ? ["- wipeUserData (economyService)"]
      : ["- deleteUserProfile (economyService)", "- cleanupUserLinkedState (times/trades)"]),
    "",
  ]

  if (wipeStats) {
    lines.push("Acoes extras de stats:")
    lines.push("- unregister em registrations")
    lines.push("- limpeza de playerProgress")
    lines.push("- remocao em mapas de estado por usuario")
    lines.push("")
  }

  lines.push("Alvos (amostra):")
  for (const entry of sample) {
    lines.push(`- [${entry.index}] ${entry.userId} | ${entry.waName} | nick: ${entry.nickname}`)
  }
  if (selected.length > sample.length) {
    lines.push(`- ... e mais ${selected.length - sample.length} perfil(is).`)
  }

  lines.push("")
  lines.push(`Para executar, envie exatamente: ${ECONOMY_WIPE_CONFIRM_PHRASE}`)
  lines.push("Para cancelar, envie: cancelar")
  return lines.join("\n")
}

function cleanupUserStateArtifacts(userId = "", options = {}) {
  const skipUnregister = Boolean(options?.skipUnregister)
  const identitySet = new Set(expandOverrideIdentityVariants(userId).map(normalizeOverrideIdentity).filter(Boolean))
  const matchesIdentity = (value = "") => {
    const normalized = normalizeOverrideIdentity(value)
    if (!normalized) return false
    if (identitySet.has(normalized)) return true
    const userPart = normalized.split("@")[0]
    return Boolean(userPart && identitySet.has(userPart))
  }

  const metrics = {
    registrationRemoved: false,
    playerProgressCleared: false,
    mutedRemoved: 0,
    coinPunishRemoved: 0,
    streakRemoved: 0,
    streakMaxRemoved: 0,
    rateLimitRemoved: 0,
    punishmentRemoved: 0,
  }

  if (!skipUnregister) {
    const unregister = registrationService.unregisterUser(userId)
    metrics.registrationRemoved = Boolean(unregister?.ok)
  }

  if (storage.getPlayerProgress(userId)) {
    storage.setPlayerProgress(userId, {})
    metrics.playerProgressCleared = true
  }

  const cleanNestedUserMap = (getter, setter, metricKey) => {
    const source = getter()
    const next = {}
    let removed = 0
    for (const [groupId, groupMap] of Object.entries(source || {})) {
      if (!groupMap || typeof groupMap !== "object") {
        next[groupId] = groupMap
        continue
      }
      const groupNext = { ...groupMap }
      for (const key of Object.keys(groupMap)) {
        if (matchesIdentity(key)) {
          delete groupNext[key]
          removed += 1
        }
      }
      next[groupId] = groupNext
    }
    if (removed > 0) {
      setter(next)
    }
    metrics[metricKey] = removed
  }

  cleanNestedUserMap(storage.getMutedUsers, storage.setMutedUsers, "mutedRemoved")
  cleanNestedUserMap(storage.getCoinPunishmentPending, storage.setCoinPunishmentPending, "coinPunishRemoved")
  cleanNestedUserMap(storage.getCoinStreaks, storage.setCoinStreaks, "streakRemoved")
  cleanNestedUserMap(storage.getCoinStreakMax, storage.setCoinStreakMax, "streakMaxRemoved")
  cleanNestedUserMap(storage.getCoinRateLimits, storage.setCoinRateLimits, "rateLimitRemoved")
  cleanNestedUserMap(storage.getActivePunishments, storage.setActivePunishments, "punishmentRemoved")

  return metrics
}

function getMetricSnapshot(bucket) {
  const summary = getMetricSummary(bucket)
  return {
    count: summary.count,
    lastMs: summary.last,
    avgMs: summary.avg,
    p95Ms: summary.p95,
    maxMs: summary.max,
  }
}

function extractWhatsAppNumber(userId = "") {
  const normalized = registrationService.normalizeUserId(userId)
  const userPart = String(normalized || userId || "").split("@")[0] || ""
  const digits = userPart.replace(/\D+/g, "")
  return digits || userPart || "-"
}

function buildRegisteredUsersSnapshot() {
  const registeredIds = registrationService.getRegisteredUsers()
  return registeredIds
    .map((rawUserId) => {
      const userId = registrationService.normalizeUserId(rawUserId)
      if (!userId) return null
      const regEntry = registrationService.getRegisteredEntry(userId)
      const profile = economyService.getProfile(userId)
      const waName = String(regEntry?.lastKnownName || getKnownUserName(userId) || userId.split("@")[0] || "").trim()
      const nickname = String(profile?.preferences?.publicLabel || "").trim()
      const coins = Math.max(0, Math.floor(Number(economyService.getCoins(userId)) || 0))
      const lastCommand = perfStats.lastCommandByUser[userId] || null
      return {
        userId,
        waNumber: extractWhatsAppNumber(userId),
        waName: waName || "-",
        nickname: nickname || "-",
        coins,
        lastCommand,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.waNumber.localeCompare(b.waNumber))
}

function getProfilerSnapshot() {
  const now = Date.now()
  const memory = getMemoryUsageMb()
  const registeredUsers = buildRegisteredUsersSnapshot()
  const stageEntries = Object.entries(perfStats.stages)
    .map(([name, bucket]) => ({ name, ...getMetricSnapshot(bucket) }))
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, 12)

  const lifetimeAuthUptimeMs = lifetimeStats.authUptimeTotalMs + (lifetimeStats.authSessionStartedAt > 0
    ? Math.max(0, now - lifetimeStats.authSessionStartedAt)
    : 0)

  return {
    now,
    authenticatedAt: perfStats.authenticatedAt,
    connectedAt: perfStats.connectedAt,
    connectionState: perfStats.connectionState,
    reconnects: perfStats.reconnects,
    uptimeMs: now - perfStats.bootAt,
    authUptimeMs: perfStats.authenticatedAt ? now - perfStats.authenticatedAt : 0,
    messagesReceived: perfStats.messagesReceived,
    messagesErrored: perfStats.messagesErrored,
    ignoredNoMessage: perfStats.ignoredNoMessage,
    ignoredFromMe: perfStats.ignoredFromMe,
    lastProcessedAt: perfStats.lastProcessedAt,
    lastCommand: perfStats.lastCommand,
    memory,
    metrics: {
      processing: getMetricSnapshot(perfStats.processingMs),
      queueDelay: getMetricSnapshot(perfStats.queueDelayMs),
      sendMessage: getMetricSnapshot(perfStats.sendMessageMs),
      groupMetadata: getMetricSnapshot(perfStats.groupMetadataMs),
      eventLoopLag: getMetricSnapshot(perfStats.eventLoopLagMs),
      stages: stageEntries,
    },
    commandHistory: perfStats.commandHistory,
    terminalLines: terminalMirrorLines.slice(-120),
    registeredUsers: registeredUsers.length,
    registeredUsersList: registeredUsers,
    knownGroups: Array.from(knownGroupIds).map((groupId) => ({ groupId, groupName: getKnownGroupName(groupId) })),
    lifetime: {
      sinceAt: lifetimeStats.sinceAt,
      bootCount: lifetimeStats.bootCount,
      reconnects: lifetimeStats.reconnects,
      messagesReceived: lifetimeStats.messagesReceived,
      messagesErrored: lifetimeStats.messagesErrored,
      ignoredNoMessage: lifetimeStats.ignoredNoMessage,
      ignoredFromMe: lifetimeStats.ignoredFromMe,
      commandsExecuted: lifetimeStats.commandsExecuted,
      authUptimeMs: lifetimeAuthUptimeMs,
      lastSeenAt: lifetimeStats.lastSeenAt,
    },
  }
}

function getDashboardPayload() {
  const authReady = Boolean(perfStats.authenticatedAt)
  return {
    authReady,
    qrImage: qrImage || null,
    snapshot: authReady ? getProfilerSnapshot() : null,
  }
}

app.get("/profiler-data", (req, res) => {
  res.json(getDashboardPayload())
})

app.get("/dashboard-data", (req, res) => {
  res.json(getDashboardPayload())
})

app.get("/download-data", async (req, res) => {
  const dataDir = path.join(__dirname, ".data")
  if (!fs.existsSync(dataDir)) {
    res.status(404).json({ ok: false, error: "data-folder-not-found" })
    return
  }

  const tmpZip = path.join(__dirname, `vitin-bot-data-${Date.now()}.zip`)
  try {
    if (process.platform === "win32") {
      await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-Command",
        `Compress-Archive -Path \"${path.join(dataDir, "*")}\" -DestinationPath \"${tmpZip}\" -Force`,
      ])
    } else {
      await execFileAsync("tar", ["-czf", tmpZip, "-C", __dirname, ".data"])
    }

    res.download(tmpZip, "vitin-bot-data.zip", () => {
      fs.unlink(tmpZip, () => {})
    })
  } catch (err) {
    fs.unlink(tmpZip, () => {})
    console.error("Erro ao gerar export da pasta .data", err)
    res.status(500).json({ ok: false, error: "export-failed" })
  }
})

app.get("/", (req,res)=>{
  const downloadBlock = `
    <section style="margin-top:20px;padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa;max-width:980px">
      <h3 style="margin:0 0 10px 0">Download de dados</h3>
      <a href="/download-data" style="display:inline-block;padding:8px 12px;background:#0f766e;color:white;border-radius:6px;text-decoration:none">Baixar .data</a>
    </section>
  `

  res.send(
    `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Vitin Bot</title>
      </head>
      <body style="font-family:Segoe UI,Arial,sans-serif;padding:16px">
        <section style="max-width:980px">
          <h2 style="margin:0 0 8px 0">Painel Vitin Bot</h2>
          <p id="polling-status" style="margin:0 0 12px 0;color:#555">Atualizando automaticamente a cada 1000ms.</p>
        </section>

        <section id="qr-section" style="margin-top:20px;padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa;max-width:980px;display:none"></section>
        <section id="perf-section" style="display:none"></section>
        <section id="users-section" style="display:none"></section>
        <section id="commands-section" style="display:none"></section>
        <section id="terminal-section" style="display:none"></section>

        ${downloadBlock}

        <script>
          const POLLING_MS = 1000
          const pollingStatusEl = document.getElementById("polling-status")
          const qrSectionEl = document.getElementById("qr-section")
          const perfSectionEl = document.getElementById("perf-section")
          const usersSectionEl = document.getElementById("users-section")
          const commandsSectionEl = document.getElementById("commands-section")
          const terminalSectionEl = document.getElementById("terminal-section")

          function escapeHtml(value) {
            return String(value || "")
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/\\"/g, "&quot;")
              .replace(/'/g, "&#39;")
          }

          function formatMs(value) {
            return Number(value || 0).toFixed(1) + " ms"
          }

          function formatElapsed(ms) {
            const totalSec = Math.max(0, Math.floor(Number(ms || 0) / 1000))
            const h = Math.floor(totalSec / 3600)
            const m = Math.floor((totalSec % 3600) / 60)
            const s = totalSec % 60
            return h + "h " + m + "m " + s + "s"
          }

          function formatDateTime(value) {
            if (!value) return "-"
            const shifted = new Date(Number(value) - (3 * 60 * 60 * 1000))
            return shifted.toISOString().replace("T", " ").slice(0, 19) + " (UTC-3)"
          }

          function readPath(obj, path, fallback) {
            let current = obj
            for (let i = 0; i < path.length; i++) {
              if (!current || typeof current !== "object") return fallback
              current = current[path[i]]
            }
            return current === undefined || current === null ? fallback : current
          }

          function renderMetricRow(label, bucket) {
            return "<tr>" +
              "<td style=\\"text-align:left;border-bottom:1px solid #eee;padding:4px\\">" + escapeHtml(label) + "</td>" +
              "<td style=\\"text-align:right;border-bottom:1px solid #eee;padding:4px\\">" + Number(readPath(bucket, ["count"], 0)) + "</td>" +
              "<td style=\\"text-align:right;border-bottom:1px solid #eee;padding:4px\\">" + formatMs(readPath(bucket, ["lastMs"], 0)) + "</td>" +
              "<td style=\\"text-align:right;border-bottom:1px solid #eee;padding:4px\\">" + formatMs(readPath(bucket, ["avgMs"], 0)) + "</td>" +
              "<td style=\\"text-align:right;border-bottom:1px solid #eee;padding:4px\\">" + formatMs(readPath(bucket, ["p95Ms"], 0)) + "</td>" +
              "<td style=\\"text-align:right;border-bottom:1px solid #eee;padding:4px\\">" + formatMs(readPath(bucket, ["maxMs"], 0)) + "</td>" +
            "</tr>"
          }

          function renderQr(authReady, qrImage) {
            if (!authReady && qrImage) {
              qrSectionEl.style.display = "block"
              qrSectionEl.innerHTML = "<h3 style=\\"margin:0 0 10px 0\\">Escaneie o QR Code</h3>" +
                "<img src=\\"" + qrImage + "\\" style=\\"max-width:320px;width:100%;height:auto\\">"
              return
            }
            qrSectionEl.style.display = "block"
            qrSectionEl.innerHTML = "<h3 style=\\"margin:0\\">" + (authReady ? "Bot conectado" : "Aguardando autenticação") + "</h3>"
          }

          function renderPerf(snapshot) {
            if (!snapshot) {
              perfSectionEl.style.display = "none"
              return
            }

            const stageRows = (readPath(snapshot, ["metrics", "stages"], []) || []).map((stage) =>
              renderMetricRow("stage:" + stage.name, stage)
            ).join("")

            perfSectionEl.style.display = "block"
            perfSectionEl.innerHTML =
              "<section style=\\"margin-top:20px;padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa;max-width:980px\\">" +
                "<h3 style=\\"margin:0 0 10px 0\\">Performance</h3>" +
                "<p style=\\"margin:4px 0\\">Estado da conexão: <b>" + escapeHtml(snapshot.connectionState) + "</b></p>" +
                "<p style=\"margin:4px 0\">Uptime do bot (sessão atual): <b>" + formatElapsed(snapshot.uptimeMs) + "</b> | Desde autenticação atual: <b>" + formatElapsed(snapshot.authUptimeMs) + "</b></p>" +
                "<p style=\\"margin:4px 0\\">Autenticado em: <b>" + formatDateTime(snapshot.authenticatedAt) + "</b> | Conectado em: <b>" + formatDateTime(snapshot.connectedAt) + "</b></p>" +
                "<p style=\\"margin:4px 0\\">Mensagens recebidas: <b>" + Number(snapshot.messagesReceived || 0) + "</b> | Erros: <b>" + Number(snapshot.messagesErrored || 0) + "</b> | Ignoradas (sem conteúdo): <b>" + Number(snapshot.ignoredNoMessage || 0) + "</b> | Ignoradas (fromMe): <b>" + Number(snapshot.ignoredFromMe || 0) + "</b></p>" +
                "<p style=\"margin:4px 0\">Lifetime desde <b>" + formatDateTime(readPath(snapshot, [\"lifetime\", \"sinceAt\"], 0)) + "</b>: mensagens <b>" + Number(readPath(snapshot, [\"lifetime\", \"messagesReceived\"], 0)) + "</b>, erros <b>" + Number(readPath(snapshot, [\"lifetime\", \"messagesErrored\"], 0)) + "</b>, ignoradas sem conteúdo <b>" + Number(readPath(snapshot, [\"lifetime\", \"ignoredNoMessage\"], 0)) + "</b>, ignoradas fromMe <b>" + Number(readPath(snapshot, [\"lifetime\", \"ignoredFromMe\"], 0)) + "</b>, comandos <b>" + Number(readPath(snapshot, [\"lifetime\", \"commandsExecuted\"], 0)) + "</b>, reconexões <b>" + Number(readPath(snapshot, [\"lifetime\", \"reconnects\"], 0)) + "</b>, uptime autenticado <b>" + formatElapsed(readPath(snapshot, [\"lifetime\", \"authUptimeMs\"], 0)) + "</b>, boots <b>" + Number(readPath(snapshot, [\"lifetime\", \"bootCount\"], 0)) + "</b></p>" +
                "<p style=\\"margin:4px 0\\">Último comando: <b>" + escapeHtml(snapshot.lastCommand || "-") + "</b> | Último processamento: <b>" + formatDateTime(snapshot.lastProcessedAt) + "</b> | Reconexões: <b>" + Number(snapshot.reconnects || 0) + "</b></p>" +
                "<p style=\\"margin:4px 0\\">Memória: heap <b>" + Number(readPath(snapshot, ["memory", "heapUsed"], 0)) + " MB</b> | rss <b>" + Number(readPath(snapshot, ["memory", "rss"], 0)) + " MB</b> | Registrados <b>" + Number(snapshot.registeredUsers || 0) + "</b></p>" +
                "<table style=\\"width:100%;margin-top:12px;border-collapse:collapse;font-family:monospace;font-size:12px\\">" +
                  "<thead>" +
                    "<tr>" +
                      "<th style=\\"text-align:left;border-bottom:1px solid #ccc;padding:4px\\">Métrica</th>" +
                      "<th style=\\"text-align:right;border-bottom:1px solid #ccc;padding:4px\\">Count</th>" +
                      "<th style=\\"text-align:right;border-bottom:1px solid #ccc;padding:4px\\">Last</th>" +
                      "<th style=\\"text-align:right;border-bottom:1px solid #ccc;padding:4px\\">Avg</th>" +
                      "<th style=\\"text-align:right;border-bottom:1px solid #ccc;padding:4px\\">P95</th>" +
                      "<th style=\\"text-align:right;border-bottom:1px solid #ccc;padding:4px\\">Max</th>" +
                    "</tr>" +
                  "</thead>" +
                  "<tbody>" +
                    renderMetricRow("message.processing", readPath(snapshot, ["metrics", "processing"], {})) +
                    renderMetricRow("message.queueDelay", readPath(snapshot, ["metrics", "queueDelay"], {})) +
                    renderMetricRow("sock.sendMessage", readPath(snapshot, ["metrics", "sendMessage"], {})) +
                    renderMetricRow("sock.groupMetadata", readPath(snapshot, ["metrics", "groupMetadata"], {})) +
                    renderMetricRow("eventLoop.lag", readPath(snapshot, ["metrics", "eventLoopLag"], {})) +
                    stageRows +
                  "</tbody>" +
                "</table>" +
              "</section>"
          }

          function renderRegisteredUsers(snapshot) {
            if (!snapshot) {
              usersSectionEl.style.display = "none"
              return
            }

            const users = Array.isArray(snapshot.registeredUsersList) ? snapshot.registeredUsersList : []
            const rows = users.map((entry) => {
              const command = readPath(entry, ["lastCommand", "command"], "-")
              const commandAt = formatDateTime(readPath(entry, ["lastCommand", "at"], 0))
              return "<tr>" +
                "<td style=\\"padding:4px;border-bottom:1px solid #ccc\\">" + escapeHtml(readPath(entry, ["waNumber"], "-")) + "</td>" +
                "<td style=\\"padding:4px;border-bottom:1px solid #ccc\\">" + escapeHtml(readPath(entry, ["waName"], "-")) + "</td>" +
                "<td style=\\"padding:4px;border-bottom:1px solid #ccc\\">" + escapeHtml(readPath(entry, ["nickname"], "-")) + "</td>" +
                "<td style=\\"padding:4px;border-bottom:1px solid #ccc;text-align:right\\">" + Number(readPath(entry, ["coins"], 0)).toLocaleString("pt-BR") + "</td>" +
                "<td style=\\"padding:4px;border-bottom:1px solid #ccc\\">" + escapeHtml(command) + "</td>" +
                "<td style=\\"padding:4px;border-bottom:1px solid #ccc\\">" + escapeHtml(commandAt) + "</td>" +
              "</tr>"
            }).join("")

            usersSectionEl.style.display = "block"
            usersSectionEl.innerHTML =
              "<section style=\\"margin-top:20px;max-width:980px\\">" +
                "<details open style=\\"padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa\\">" +
                  "<summary style=\\"cursor:pointer;font-weight:700\\">Usuários registrados (" + users.length + ")</summary>" +
                  "<div style=\\"margin-top:10px;overflow:auto\\">" +
                    "<table style=\\"width:100%;border-collapse:collapse;font-family:monospace;font-size:12px\\">" +
                      "<thead>" +
                        "<tr>" +
                          "<th style=\\"text-align:left;border-bottom:1px solid #ccc;padding:4px\\">WhatsApp nº</th>" +
                          "<th style=\\"text-align:left;border-bottom:1px solid #ccc;padding:4px\\">Nome WhatsApp</th>" +
                          "<th style=\\"text-align:left;border-bottom:1px solid #ccc;padding:4px\\">Apelido escolhido</th>" +
                          "<th style=\\"text-align:right;border-bottom:1px solid #ccc;padding:4px\\">Coins</th>" +
                          "<th style=\\"text-align:left;border-bottom:1px solid #ccc;padding:4px\\">Último comando</th>" +
                          "<th style=\\"text-align:left;border-bottom:1px solid #ccc;padding:4px\\">Quando</th>" +
                        "</tr>" +
                      "</thead>" +
                      "<tbody>" + (rows || "<tr><td colspan=\\"6\\" style=\\"padding:6px\\">Sem usuários registrados.</td></tr>") + "</tbody>" +
                    "</table>" +
                  "</div>" +
                "</details>" +
              "</section>"
          }

          function renderCommands(snapshot) {
            if (!snapshot) {
              commandsSectionEl.style.display = "none"
              return
            }

            const rows = (snapshot.commandHistory || []).slice(-10).map((entry) =>
              "<tr>" +
                "<td style=\\"padding:4px;border-bottom:1px solid #ccc\\">" + formatDateTime(readPath(entry, ["at"], 0)) + "</td>" +
                "<td style=\\"padding:4px;border-bottom:1px solid #ccc\\">" + escapeHtml(readPath(entry, ["command"], "-")) + "</td>" +
                "<td style=\\"padding:4px;border-bottom:1px solid #ccc\\">" + escapeHtml(readPath(entry, ["senderName"], "-")) + "</td>" +
                "<td style=\\"padding:4px;border-bottom:1px solid #ccc\\">" + escapeHtml(readPath(entry, ["groupName"], "-")) + "</td>" +
              "</tr>"
            ).join("")

            commandsSectionEl.style.display = "block"
            commandsSectionEl.innerHTML =
              "<section style=\\"margin-top:20px;padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa;max-width:980px\\">" +
                "<h3 style=\\"margin:0 0 10px 0\\">Últimos 10 comandos</h3>" +
                "<table style=\\"width:100%;border-collapse:collapse;font-family:monospace;font-size:12px\\">" +
                  "<thead>" +
                    "<tr>" +
                      "<th style=\\"text-align:left;border-bottom:1px solid #ccc;padding:4px\\">Quando</th>" +
                      "<th style=\\"text-align:left;border-bottom:1px solid #ccc;padding:4px\\">Comando</th>" +
                      "<th style=\\"text-align:left;border-bottom:1px solid #ccc;padding:4px\\">Usuário</th>" +
                      "<th style=\\"text-align:left;border-bottom:1px solid #ccc;padding:4px\\">Grupo</th>" +
                    "</tr>" +
                  "</thead>" +
                  "<tbody>" + (rows || "<tr><td colspan=\\"4\\" style=\\"padding:6px\\">Sem comandos registrados.</td></tr>") + "</tbody>" +
                "</table>" +
              "</section>"
          }

          function renderTerminal(snapshot) {
            if (!snapshot) {
              terminalSectionEl.style.display = "none"
              return
            }

            const terminalText = (snapshot.terminalLines || []).map((line) => {
              return "[" + formatDateTime(readPath(line, ["at"], 0)) + "] " + readPath(line, ["source"], "log") + ": " + readPath(line, ["line"], "")
            }).join("\\n") || "Sem saída capturada ainda."

            terminalSectionEl.style.display = "block"
            terminalSectionEl.innerHTML =
              "<section style=\\"margin-top:20px;padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa;max-width:980px\\">" +
                "<h3 style=\\"margin:0 0 10px 0\\">Terminal (somente leitura)</h3>" +
                "<pre style=\\"max-height:260px;overflow:auto;background:#0d1117;color:#c9d1d9;padding:10px;border-radius:8px;font-size:12px;white-space:pre-wrap\\">" + escapeHtml(terminalText) + "</pre>" +
              "</section>"
          }

          function renderDashboard(payload) {
            const authReady = Boolean(readPath(payload, ["authReady"], false))
            const snapshot = readPath(payload, ["snapshot"], null)
            renderQr(authReady, readPath(payload, ["qrImage"], null))
            renderPerf(snapshot)
            renderRegisteredUsers(snapshot)
            renderCommands(snapshot)
            renderTerminal(snapshot)
          }

          let refreshInFlight = false
          async function refreshDashboard() {
            if (refreshInFlight) return
            refreshInFlight = true
            try {
              const response = await fetch("/dashboard-data", { cache: "no-store" })
              if (!response.ok) {
                throw new Error("HTTP " + response.status)
              }
              const payload = await response.json()
              renderDashboard(payload)
              pollingStatusEl.textContent = "Atualizando automaticamente a cada 1000ms. Última atualização: " + new Date().toLocaleTimeString("pt-BR")
            } catch (err) {
              const errMessage = err && err.message ? err.message : err
              pollingStatusEl.textContent = "Falha ao atualizar painel: " + String(errMessage)
            } finally {
              refreshInFlight = false
            }
          }

          refreshDashboard()
          setInterval(refreshDashboard, POLLING_MS)
        </script>
      </body>
    </html>`
  )
})

const PORT = process.env.PORT || 3000
app.listen(PORT,()=>console.log("Servidor rodando na porta " + PORT))

// =========================
// VIDEO PARA STICKER
// =========================
async function videoToSticker(buffer){
  const input = "./input.mp4"
  const output = "./output.webp"

  fs.writeFileSync(input, buffer)

  await new Promise((resolve,reject)=>{
    ffmpeg(input)
      .outputOptions([
        "-vcodec libwebp",
        "-vf scale=512:512:flags=lanczos", // força deformação completa para 512x512
        "-loop 0",
        "-preset default",
        "-an",
        "-vsync 0"
      ])
      .toFormat("webp")
      .save(output)
      .on("end", resolve)
      .on("error", reject)
  })

  const sticker = fs.readFileSync(output)
  fs.unlinkSync(input)
  fs.unlinkSync(output)
  return sticker
}

// =========================
// INICIAR BOT
// =========================
async function startBot(){
  const authDir = process.env.BOT_AUTH_DIR
    ? path.resolve(process.env.BOT_AUTH_DIR)
    : path.join(__dirname, ".data", "auth")
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true })
  }
  const { state, saveCreds } = await useMultiFileAuthState(authDir)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal:false,
    browser:["VitinBot","Chrome","1.0"]
  })

  const originalSendMessage = sock.sendMessage.bind(sock)
  sock.sendMessage = async (...args) => {
    const messageContent = args[1]
    if (messageContent && typeof messageContent === "object" && shouldAppendMassMentionHint(messageContent)) {
      const baseText = String(messageContent.text || "").trimEnd()
      messageContent.text = `${baseText}\n\n${MASS_MENTION_OPT_OUT_HINT}`
    }

    const startedAt = Date.now()
    try {
      return await originalSendMessage(...args)
    } finally {
      recordMetric(perfStats.sendMessageMs, Date.now() - startedAt)
    }
  }

  const originalGroupMetadata = sock.groupMetadata.bind(sock)
  sock.groupMetadata = async (...args) => {
    const startedAt = Date.now()
    try {
      const metadata = await originalGroupMetadata(...args)
      const groupId = String(args[0] || "")
      if (groupId) {
        knownGroupIds.add(groupId)
        if (metadata?.subject) {
          groupNameCache[groupId] = String(metadata.subject)
        }
      }
      return metadata
    } finally {
      recordMetric(perfStats.groupMetadataMs, Date.now() - startedAt)
    }
  }

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", async(update)=>{
    const { connection, qr, lastDisconnect } = update
    if (connection) {
      perfStats.connectionState = connection
    }

    if(qr){
      qrImage = await QRCode.toDataURL(qr)
      console.log("QR GERADO")
    }

    if(connection === "open"){
      console.log("BOT ONLINE")
      qrImage = null
      perfStats.connectedAt = Date.now()
      if (!perfStats.authenticatedAt) {
        perfStats.authenticatedAt = perfStats.connectedAt
      }
      if (!lifetimeStats.authSessionStartedAt) {
        lifetimeStats.authSessionStartedAt = perfStats.connectedAt
        persistLifetimeStats()
      }
    }

    if(connection === "close"){
      perfStats.reconnects += 1
      lifetimeStats.reconnects += 1
      if (lifetimeStats.authSessionStartedAt) {
        lifetimeStats.authUptimeTotalMs += Math.max(0, Date.now() - lifetimeStats.authSessionStartedAt)
        lifetimeStats.authSessionStartedAt = 0
      }
      persistLifetimeStats()
      const reason = lastDisconnect?.error?.output?.statusCode
      if(reason !== DisconnectReason.loggedOut){
        console.log("Reconectando...")
        setTimeout(startBot,5000)
      }
    }
  })

  sock.ev.on("messages.upsert", async ({ messages })=>{
    const processingStartedAt = Date.now()
    perfStats.messagesReceived += 1
    lifetimeStats.messagesReceived += 1
    persistLifetimeStats()

    const measureStage = async (stageName, task) => {
      const stageStart = Date.now()
      try {
        return await task()
      } finally {
        const stageMs = Date.now() - stageStart
        recordMetric(getStageBucket(stageName), stageMs)
      }
    }

    try {
    const msg = messages[0]
    if(!msg?.message) {
      perfStats.ignoredNoMessage += 1
      lifetimeStats.ignoredNoMessage += 1
      persistLifetimeStats()
      return
    }
    if(msg.key.fromMe) {
      perfStats.ignoredFromMe += 1
      lifetimeStats.ignoredFromMe += 1
      persistLifetimeStats()
      return
    }

    const upstreamTimestampMs = parseMessageTimestampMs(msg)
    if (upstreamTimestampMs > 0) {
      const queueDelay = Math.max(0, processingStartedAt - upstreamTimestampMs)
      recordMetric(perfStats.queueDelayMs, queueDelay)
    }

    const from = msg.key.remoteJid
    const senderRaw = msg.key.participant || msg.key.remoteJid
    const sender = jidNormalizedUser(senderRaw)
    const senderRegistrationCandidates = [...new Set([
      senderRaw,
      msg?.key?.participantPn,
      msg?.key?.remoteJid,
      msg?.key?.remoteJidAlt,
      msg?.message?.extendedTextMessage?.contextInfo?.participant,
      sender,
    ]
      .map((candidate) => registrationService.normalizeUserId(candidate))
      .filter(Boolean)
    )]
    const senderRegisteredId = senderRegistrationCandidates.find((candidate) => registrationService.isRegistered(candidate)) || ""
    const senderIsRegistered = Boolean(senderRegisteredId)
    const isGroup = from.endsWith("@g.us")
    const isOverrideSender = isOverrideIdentity(sender, from, isGroup)
    const overrideCompat = getOverrideCompatibilityContext()
    if (isGroup) knownGroupIds.add(from)

    const senderProfileName = String(msg.pushName || "").trim()
    if (senderProfileName) {
      userNameCache[sender] = senderProfileName
      registrationService.touchKnownName(sender, senderProfileName)
    }

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      ""

    const cmd = text.toLowerCase().trim()
    const isCommand = cmd.startsWith(prefix)
    const cmdParts = cmd.split(/\s+/)
    const cmdName = cmdParts[0] || ""
    const cmdArg1 = cmdParts[1] || ""
    const cmdArg2 = cmdParts[2] || ""
    const mentioned = (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []).map(jidNormalizedUser)
    let quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    const overrideChecksEnabled = getOverrideChecksEnabled()
    const isMaintenanceToggleCommand = cmdName === prefix + "manutencao" || cmdName === prefix + "manutenção"

    if (isCommand && isGroup && !isMaintenanceToggleCommand) {
      const maintenance = getMaintenanceModeState()
      const normalizedGroupId = String(from || "").trim().toLowerCase()
      if (maintenance.enabled && maintenance.allowedGroupId && normalizedGroupId !== maintenance.allowedGroupId) {
        await sock.sendMessage(from, {
          text: "Atualmente estou em modo de manutenção, não posso responder seu comando.",
        })
        return
      }
    }

    if (!isOverrideSender && isGroup) {
      const filters = storage.getGroupFilters(from)
      if (filters.length > 0) {
        const triggered = filters.some((entry) => messageTriggersFilter(text, entry?.text || ""))
        if (triggered) {
          await measureStage("groupFilter.enforcement", async () => {
            try {
              await sock.sendMessage(from, { delete: msg.key })
            } catch (err) {
              console.error("Erro ao apagar mensagem por filtro de moderação", err)
            }
            await sock.sendMessage(from, {
              text: `⚠️ @${sender.split("@")[0]}, sua mensagem acionou um filtro de moderação adicionado pelos administradores.`,
              mentions: [sender],
            })
          })
          return
        }
      }
    }

    const broadcastState = pendingBroadcastBySender.get(sender)
    if (broadcastState && isOverrideSender) {
      if (broadcastState.phase === "confirm-type") {
        if (isQuitToken(text)) {
          pendingBroadcastBySender.delete(sender)
          await sock.sendMessage(from, { text: "Fluxo !msg cancelado." })
          return
        }
        if (isNoToken(text)) {
          pendingBroadcastBySender.delete(sender)
          await sock.sendMessage(from, { text: `Seleção negada. Refaça com: *${OVERRIDE_BROADCAST_COMMAND} <aviso|update> <N|T|A>*` })
          return
        }
        if (!isYesToken(text)) {
          await sock.sendMessage(from, { text: "Responda com Y/N/Q." })
          return
        }
        broadcastState.phase = "await-content"
        pendingBroadcastBySender.set(sender, broadcastState)
        await sock.sendMessage(from, {
          text: `Tipo confirmado: *${broadcastState.type}*.\nEnvie agora a próxima mensagem com o conteúdo do comunicado.`,
        })
        return
      }

      if (broadcastState.phase === "await-content") {
        broadcastState.message = text
        broadcastState.phase = "confirm-message"
        pendingBroadcastBySender.set(sender, broadcastState)
        const mentionModeLabel = broadcastState.mentionMode || "N"
        await sock.sendMessage(from, {
          text:
            `Confirma o envio abaixo? (Y/N/Q)\n` +
            `Tipo: *${broadcastState.type}*\n\n` +
            `Modo de menção: *${mentionModeLabel}*\n\n` +
            `${text}`,
        })
        return
      }

      if (broadcastState.phase === "confirm-message") {
        if (isQuitToken(text)) {
          pendingBroadcastBySender.delete(sender)
          await sock.sendMessage(from, { text: "Fluxo !msg cancelado." })
          return
        }
        if (isNoToken(text)) {
          broadcastState.phase = "await-content"
          pendingBroadcastBySender.set(sender, broadcastState)
          await sock.sendMessage(from, { text: "Envio negado. Reenvie o conteúdo da mensagem." })
          return
        }
        if (!isYesToken(text)) {
          await sock.sendMessage(from, { text: "Responda com Y/N/Q." })
          return
        }

        const title = getBroadcastTitle(broadcastState.type)
        const finalText = `${title}\n\n${broadcastState.message}`
        const users = registrationService.getRegisteredUsersForNotifications()
        const usersSet = new Set(users)
        const groups = collectKnownGroupsFromStorage()
        const mentionMode = String(broadcastState.mentionMode || "N").toUpperCase()
        const botSelfIds = new Set(expandOverrideIdentityVariants(sock.user?.id || "").map(jidNormalizedUser).filter(Boolean))
        let usersOk = 0
        let usersFail = 0
        let groupsOk = 0
        let groupsFail = 0

        if (mentionMode === "A") {
          const adminUsers = new Set()
          for (const groupId of groups) {
            try {
              const metadata = await sock.groupMetadata(groupId)
              const participants = Array.isArray(metadata?.participants) ? metadata.participants : []
              for (const participant of participants) {
                if (!participant?.admin) continue
                const normalizedAdmin = jidNormalizedUser(participant?.id || "")
                if (!normalizedAdmin || botSelfIds.has(normalizedAdmin)) continue
                if (!usersSet.has(normalizedAdmin)) continue
                adminUsers.add(normalizedAdmin)
              }
            } catch (err) {
              console.error("Falha ao listar admins do grupo para !msg", groupId, err)
            }
          }

          for (const userId of adminUsers) {
            try {
              await sock.sendMessage(userId, { text: finalText })
              usersOk += 1
            } catch (err) {
              usersFail += 1
              console.error("Falha ao enviar !msg para admin via DM", userId, err)
            }
          }
        } else {
          for (const userId of users) {
            try {
              await sock.sendMessage(userId, { text: finalText })
              usersOk += 1
            } catch (err) {
              usersFail += 1
              console.error("Falha ao enviar update para usuário registrado", userId, err)
            }
          }

          const sendGroups = mentionMode === "N"
          if (!sendGroups) {
            groupsOk = groups.length
          }
          for (const groupId of groups) {
            if (!sendGroups) continue
            try {
              await sock.sendMessage(groupId, { text: finalText })
              groupsOk += 1
            } catch (err) {
              groupsFail += 1
              console.error("Falha ao enviar update para grupo", groupId, err)
            }
          }
        }

        pendingBroadcastBySender.delete(sender)
        const modeLabel = mentionMode
        await sock.sendMessage(from, {
          text:
            `Envio finalizado. DMs: *${usersOk}* sucesso | *${usersFail}* falhas.\n` +
            `Grupos: *${groupsOk}* sucesso | *${groupsFail}* falhas.\n` +
            `Modo de menção: *${modeLabel}*.` +
            (modeLabel === "T" ? "\nℹ️ Modo T executado: nenhum grupo recebeu envio." : ""),
        })
        return
      }
    }

    const pendingOverrideAddState = pendingOverrideAddBySender.get(sender)
    if (pendingOverrideAddState) {
      if ((Number(pendingOverrideAddState.expiresAt) || 0) <= Date.now()) {
        pendingOverrideAddBySender.delete(sender)
        await sock.sendMessage(from, {
          text: "Sessao de !overrideadd expirada. Rode o comando novamente.",
        })
        return
      }

      const canManageOverride = Boolean(
        isHardcodedOverrideIdentity(sender) ||
        findOverrideProfileByIdentity(sender, { category: "positivo", includeDisabled: false })
      )
      if (!canManageOverride) {
        pendingOverrideAddBySender.delete(sender)
      } else if (pendingOverrideAddState.phase === "await-jids") {
        const normalizedJids = [...new Set(
          String(text || "")
            .split(/\r?\n/)
            .map(normalizeOverrideIdentity)
            .filter(Boolean)
        )]

        if (normalizedJids.length === 0) {
          await sock.sendMessage(from, {
            text: "Nenhum JID válido encontrado. Envie um JID por linha.",
          })
          return
        }

        const profiles = getOverrideProfiles()
        const profileName = pendingOverrideAddState.profileName
        const currentList = Array.isArray(profiles?.positivo?.[profileName]) ? profiles.positivo[profileName] : []
        const mergedList = [...new Set([...currentList, ...normalizedJids])]
        profiles.positivo[profileName] = mergedList
        setOverrideProfiles(profiles)

        const statuses = getOverrideStatusMap()
        if (!statuses.positivo) statuses.positivo = {}
        if (typeof statuses.positivo[profileName] !== "boolean") {
          statuses.positivo[profileName] = true
          setOverrideStatusMap(statuses)
        }

        pendingOverrideAddBySender.delete(sender)
        await sock.sendMessage(from, {
          text:
            `Override atualizado para *${profileName}*.\n` +
            `JIDs adicionados nesta operação: *${normalizedJids.length}* | Total do perfil: *${mergedList.length}*.`,
        })
        return
      }
    }

    const pendingEconomyWipeState = pendingEconomyWipeBySender.get(sender)
    if (pendingEconomyWipeState) {
      if (!isHardcodedOverrideIdentity(sender)) {
        pendingEconomyWipeBySender.delete(sender)
      } else if ((Number(pendingEconomyWipeState.expiresAt) || 0) <= Date.now()) {
        pendingEconomyWipeBySender.delete(sender)
        await sock.sendMessage(from, {
          text: `Sessao de ${ECONOMY_WIPE_COMMAND} expirada. Inicie novamente.`,
        })
        return
      } else {
        if (isQuitToken(text)) {
          pendingEconomyWipeBySender.delete(sender)
          await sock.sendMessage(from, { text: `Fluxo ${ECONOMY_WIPE_COMMAND} cancelado.` })
          return
        }

        const refreshWipeTtl = () => {
          pendingEconomyWipeState.expiresAt = Date.now() + OVERRIDE_PENDING_TIMEOUT_MS
          pendingEconomyWipeBySender.set(sender, pendingEconomyWipeState)
        }

        if (pendingEconomyWipeState.phase === "choose-scope") {
          const scopeToken = String(text || "").trim().toLowerCase()
          if (!["total", "t", "perfis", "perfil", "p"].includes(scopeToken)) {
            await sock.sendMessage(from, {
              text: "Escolha invalida. Responda com *TOTAL* ou *PERFIS*.",
            })
            return
          }

          if (scopeToken === "total" || scopeToken === "t") {
            pendingEconomyWipeState.mode = "total"
            pendingEconomyWipeState.selectedEntries = pendingEconomyWipeState.userSummaries.map((entry, idx) => ({
              ...entry,
              index: idx + 1,
            }))
            pendingEconomyWipeState.phase = "choose-wipeeconomy"
            refreshWipeTtl()
            await sock.sendMessage(from, {
              text:
                "Escopo escolhido: *TOTAL*.\n" +
                "Deseja usar o arg *wipeeconomy* (limpar so dados de economia/stats, mantendo perfil/registro)? Responda *S* ou *N*.",
            })
            return
          }

          pendingEconomyWipeState.mode = "profiles"
          pendingEconomyWipeState.phase = "choose-selection"
          refreshWipeTtl()
          await sock.sendMessage(from, {
            text:
              "Escopo escolhido: *PERFIS*.\n" +
              "Responda com um indice unico (ex: 3), faixa (ex: 1-5) ou *all*.",
          })
          return
        }

        if (pendingEconomyWipeState.phase === "choose-selection") {
          const parsed = parseEconomyWipeSelection(text, pendingEconomyWipeState.userSummaries.length)
          if (!parsed.ok) {
            await sock.sendMessage(from, { text: parsed.error })
            return
          }

          const uniqueIndexes = [...new Set(parsed.indexes)].sort((a, b) => a - b)
          pendingEconomyWipeState.selectedEntries = uniqueIndexes.map((index) => ({
            ...(pendingEconomyWipeState.userSummaries[index - 1] || {}),
            index,
          }))
          pendingEconomyWipeState.phase = "choose-wipeeconomy"
          refreshWipeTtl()
          await sock.sendMessage(from, {
            text:
              `Selecionados: *${pendingEconomyWipeState.selectedEntries.length}* perfil(is).\n` +
              "Deseja usar o arg *wipeeconomy* (limpar so dados de economia/stats, mantendo perfil/registro)? Responda *S* ou *N*.",
          })
          return
        }

        if (pendingEconomyWipeState.phase === "choose-wipeeconomy") {
          if (!isYesToken(text) && !isNoToken(text)) {
            await sock.sendMessage(from, {
              text: "Responda apenas com *S* ou *N* para o arg wipeeconomy.",
            })
            return
          }

          pendingEconomyWipeState.wipeEconomyDataOnly = isYesToken(text)

          if (pendingEconomyWipeState.wipeEconomyDataOnly) {
            pendingEconomyWipeState.wipeStats = true
            pendingEconomyWipeState.phase = "confirm"
            pendingEconomyWipeState.previewText = buildEconomyWipePreviewText(pendingEconomyWipeState)
            refreshWipeTtl()
            await sock.sendMessage(from, {
              text: pendingEconomyWipeState.previewText,
            })
            return
          }

          pendingEconomyWipeState.phase = "choose-stats-wipe"
          refreshWipeTtl()
          await sock.sendMessage(from, {
            text: "Deseja limpar tambem stats/registro fora da economia? Responda *S* ou *N*.",
          })
          return
        }

        if (pendingEconomyWipeState.phase === "choose-stats-wipe") {
          if (!isYesToken(text) && !isNoToken(text)) {
            await sock.sendMessage(from, {
              text: "Responda apenas com *S* ou *N* para o wipe de stats.",
            })
            return
          }

          pendingEconomyWipeState.wipeStats = isYesToken(text)
          pendingEconomyWipeState.phase = "confirm"
          pendingEconomyWipeState.previewText = buildEconomyWipePreviewText(pendingEconomyWipeState)
          refreshWipeTtl()
          await sock.sendMessage(from, {
            text: pendingEconomyWipeState.previewText,
          })
          return
        }

        if (pendingEconomyWipeState.phase === "confirm") {
          if (String(text || "").trim().toUpperCase() !== ECONOMY_WIPE_CONFIRM_PHRASE) {
            await sock.sendMessage(from, {
              text:
                "Confirmacao invalida.\n" +
                `Envie exatamente: ${ECONOMY_WIPE_CONFIRM_PHRASE}\n` +
                "Ou envie *cancelar*.",
            })
            return
          }

          const selectedEntries = Array.isArray(pendingEconomyWipeState.selectedEntries)
            ? pendingEconomyWipeState.selectedEntries
            : []
          const wipeStats = Boolean(pendingEconomyWipeState.wipeStats)
          const wipeEconomyDataOnly = Boolean(pendingEconomyWipeState.wipeEconomyDataOnly)
          const mode = pendingEconomyWipeState.mode === "total" ? "total" : "profiles"
          pendingEconomyWipeBySender.delete(sender)

          let dataWiped = 0
          let profilesDeleted = 0
          let profilesNotFound = 0
          let registrationRemoved = 0
          let teamsLeftTotal = 0
          let teamsDeletedTotal = 0
          let tradesCancelledTotal = 0
          let statsArtifactsRemoved = 0

          for (const entry of selectedEntries) {
            const userId = entry?.userId
            if (!userId) continue

            let deleted = false
            let linkedCleanup = { teamsLeft: 0, teamsDeleted: 0, tradesCancelled: 0 }

            if (wipeEconomyDataOnly) {
              const wiped = typeof economyService.wipeUserData === "function"
                ? economyService.wipeUserData(userId)
                : false
              if (wiped) {
                dataWiped += 1
                deleted = true
              } else {
                profilesNotFound += 1
              }
            } else {
              deleted = economyService.deleteUserProfile(userId)
              if (deleted) {
                profilesDeleted += 1
              } else {
                profilesNotFound += 1
              }

              linkedCleanup = cleanupUserLinkedState(storage, userId)
              teamsLeftTotal += Number(linkedCleanup?.teamsLeft || 0)
              teamsDeletedTotal += Number(linkedCleanup?.teamsDeleted || 0)
              tradesCancelledTotal += Number(linkedCleanup?.tradesCancelled || 0)
            }

            let statsMetrics = null
            if (wipeStats) {
              statsMetrics = cleanupUserStateArtifacts(userId, {
                skipUnregister: wipeEconomyDataOnly,
              })
              if (statsMetrics?.registrationRemoved) registrationRemoved += 1
              const removedCount =
                Number(statsMetrics?.mutedRemoved || 0) +
                Number(statsMetrics?.coinPunishRemoved || 0) +
                Number(statsMetrics?.streakRemoved || 0) +
                Number(statsMetrics?.streakMaxRemoved || 0) +
                Number(statsMetrics?.rateLimitRemoved || 0) +
                Number(statsMetrics?.punishmentRemoved || 0)
              statsArtifactsRemoved += removedCount
            }

            telemetry.incrementCounter("economy.wipe.profile", 1, {
              deleted: deleted ? "yes" : "no",
              wipeEconomyDataOnly: wipeEconomyDataOnly ? "yes" : "no",
              statsWipe: wipeStats ? "yes" : "no",
            })
            telemetry.appendEvent("economy.wipe.profile", {
              by: sender,
              groupId: from,
              userId,
              deleted,
              mode,
              linkedCleanup,
              wipeEconomyDataOnly,
              statsWipe: wipeStats,
              statsMetrics,
              redacted: true,
            })
          }

          telemetry.incrementCounter("economy.wipe.batch", 1, {
            mode,
            wipeEconomyDataOnly: wipeEconomyDataOnly ? "yes" : "no",
            statsWipe: wipeStats ? "yes" : "no",
          })
          telemetry.appendEvent("economy.wipe.batch", {
            by: sender,
            groupId: from,
            mode,
            selectedCount: selectedEntries.length,
            dataWiped,
            profilesDeleted,
            profilesNotFound,
            registrationRemoved,
            teamsLeft: teamsLeftTotal,
            teamsDeleted: teamsDeletedTotal,
            tradesCancelled: tradesCancelledTotal,
            statsArtifactsRemoved,
            wipeEconomyDataOnly,
            statsWipe: wipeStats,
            redacted: true,
          })

          await sock.sendMessage(from, {
            text:
              `Wipe concluido.\n` +
              `Modo: *${mode === "total" ? "TOTAL" : "PERFIS"}*\n` +
              `Selecionados: *${selectedEntries.length}*\n` +
              `Arg wipeeconomy: *${wipeEconomyDataOnly ? "SIM" : "NAO"}*\n` +
              (wipeEconomyDataOnly
                ? `Dados de economia resetados: *${dataWiped}* | Nao encontrados: *${profilesNotFound}*\n`
                : (`Perfis apagados: *${profilesDeleted}* | Nao encontrados: *${profilesNotFound}*\n` +
                  `Cleanup times: saidas *${teamsLeftTotal}* | times removidos *${teamsDeletedTotal}* | trades canceladas *${tradesCancelledTotal}*\n`)) +
              `Stats wipe: *${wipeStats ? "SIM" : "NAO"}*` +
              (wipeStats
                ? `\nRegistros removidos: *${registrationRemoved}* | artefatos de stats removidos: *${statsArtifactsRemoved}*`
                : ""),
          })
          return
        }
      }
    }

    if (isCommand) {
      perfStats.lastCommand = cmdName
      telemetry.markCommand(cmdName, {
        sender,
        group: isGroup,
        groupId: isGroup ? from : null,
      })
    }

    if (isCommand && !isOverrideSender && storage.isGloballyBlockedUser(sender)) {
      await sock.sendMessage(from, {
        text: `⛔ @${sender.split("@")[0]}, você não pode usar meus comandos pois está bloqueado.`,
        mentions: [sender],
      })
      return
    }

    if (cmdName === OVERRIDE_DATA_PASSWORD_COMMAND) {
      if (isGroup) {
        await sock.sendMessage(from, {
          text: "Use !vaultkey apenas no privado (DM).",
        })
        return
      }
      if (!isKnownOverrideIdentity(sender, { includeDisabled: false })) {
        await sock.sendMessage(from, {
          text: "⛔ Comando restrito a seletos usuários.",
        })
        return
      }
      await sock.sendMessage(from, {
        text: `Senha de exportação (.data):\n${DATA_EXPORT_PASSWORD}`,
      })
      return
    }

    if (cmdName === ECONOMY_WIPE_COMMAND || cmdName === ECONOMY_WIPE_COMMAND_ALIAS) {
      if (isGroup) {
        await sock.sendMessage(from, { text: "Use esse comando somente no privado (DM)." })
        return
      }
      if (!isHardcodedOverrideIdentity(sender)) return

      const userSummaries = buildEconomyWipeUserSummaries()
      if (userSummaries.length === 0) {
        await sock.sendMessage(from, { text: "Nenhum perfil de economia encontrado para wipe." })
        return
      }

      pendingEconomyWipeBySender.set(sender, {
        phase: "choose-scope",
        mode: null,
        wipeStats: false,
        wipeEconomyDataOnly: false,
        userSummaries,
        selectedEntries: [],
        createdAt: Date.now(),
        expiresAt: Date.now() + OVERRIDE_PENDING_TIMEOUT_MS,
        previewText: "",
      })

      const pages = buildEconomyWipeListPages(userSummaries)
      for (const page of pages) {
        await sock.sendMessage(from, { text: page })
      }
      await sock.sendMessage(from, {
        text:
          "Escolha o escopo do wipe:\n" +
          "- Responda *TOTAL* para apagar todos os perfis listados.\n" +
          "- Responda *PERFIS* para selecionar por indice/faixa/all.\n" +
          "- Depois da seleção, o bot pergunta o arg *wipeeconomy* (somente dados, mantendo perfil/registro).\n\n" +
          "A sessao expira em 5 minutos. Envie *cancelar* para abortar.",
      })
      return
    }

    if (cmdName === prefix + "overrideadd") {
      if (isGroup) {
        await sock.sendMessage(from, { text: "Use esse comando somente no privado (DM)." })
        return
      }
      if (!isHardcodedOverrideIdentity(sender)) {
        await sock.sendMessage(from, {
          text: "⛔ Comando restrito ao override hardcoded.",
        })
        return
      }

      const profileNameRaw = cmdParts.slice(1).join(" ").trim().toLowerCase()
      if (!profileNameRaw) {
        await sock.sendMessage(from, {
          text: `Use: ${prefix}overrideadd <username>.\nDepois o bot vai pedir os JIDs (um por linha).`,
        })
        return
      }

      pendingOverrideAddBySender.set(sender, {
        phase: "await-jids",
        profileName: profileNameRaw,
        createdAt: Date.now(),
        expiresAt: Date.now() + OVERRIDE_PENDING_TIMEOUT_MS,
      })
      await sock.sendMessage(from, {
        text:
          `Perfil alvo: *${profileNameRaw}*.\n` +
          "Envie agora os JIDs (um por linha) na próxima mensagem.\n" +
          "A sessao expira em 5 minutos.",
      })
      return
    }

    if (cmdName === prefix + "toggleoverride") {
      if (isGroup) return

      const callerProfile = findOverrideProfileByIdentity(sender, {
        category: "positivo",
        includeDisabled: false,
      })
      const callerEnabled = Boolean(callerProfile && isOverrideProfileEnabled("positivo", callerProfile.profileName))
      const hardcodedBypass = isHardcodedOverrideIdentity(sender)
      if (!hardcodedBypass && (!callerProfile || !callerEnabled)) return

      const indexRaw = Number.parseInt(String(cmdArg1 || ""), 10)
      if (!Number.isFinite(indexRaw) || indexRaw <= 0) {
        await sock.sendMessage(from, {
          text: buildOverrideToggleStatusText(),
        })
        return
      }

      const profiles = getOverrideProfiles()
      const names = getOrderedOverrideProfileNames(profiles)
      const targetName = names[indexRaw - 1]
      if (!targetName) {
        await sock.sendMessage(from, {
          text: "Índice inválido.\n\n" + buildOverrideToggleStatusText(),
        })
        return
      }

      if (targetName === HARDCODED_OVERRIDE_OWNER) {
        await sock.sendMessage(from, {
          text:
            `O perfil *${HARDCODED_OVERRIDE_OWNER}* é fixo e não pode ser desligado.\n\n` +
            buildOverrideToggleStatusText(),
        })
        return
      }

      const statuses = getOverrideStatusMap()
      if (!statuses.positivo) statuses.positivo = {}
      statuses.positivo[targetName] = !Boolean(statuses.positivo[targetName])
      setOverrideStatusMap(statuses)

      await sock.sendMessage(from, {
        text:
          `Override de *${targetName}* agora está *${statuses.positivo[targetName] ? "ON" : "OFF"}*.\n\n` +
          buildOverrideToggleStatusText(),
      })
      return
    }

    if (cmdName === prefix + "whois") {
      if (isGroup) {
        await sock.sendMessage(from, { text: "Use esse comando somente no privado (DM)." })
        return
      }
      if (!isKnownOverrideIdentity(sender, { includeDisabled: false })) return

      const nicknameQuery = String(cmdParts.slice(1).join(" ") || "").trim()
      if (!nicknameQuery) {
        await sock.sendMessage(from, { text: `Use: ${prefix}whois <apelido>` })
        return
      }

      const matches = typeof economyService.findUsersByPublicLabel === "function"
        ? economyService.findUsersByPublicLabel(nicknameQuery)
        : []

      if (!matches.length) {
        await sock.sendMessage(from, {
          text: `Nenhum usuário com apelido exato *${nicknameQuery}* foi encontrado.`,
        })
        return
      }

      const lines = matches.map((entry, index) => {
        // Extract phone number from userId (format: phone@s.whatsapp.net or phone:something@s.whatsapp.net)
        const userId = String(entry?.userId || "").trim().toLowerCase()
        const phoneOrJid = userId.split(":")[0].split("@")[0] || userId
        const phoneDigitsOnly = phoneOrJid.replace(/\D+/g, "")
        const displayPhone = phoneDigitsOnly || phoneOrJid
        return `${index + 1}. ${entry.publicLabel} -> *${displayPhone}*`
      })

      await sock.sendMessage(from, {
        text:
          `Resultado do whois para *${nicknameQuery}* (${matches.length}):\n` +
          lines.join("\n"),
      })
      return
    }

    if (cmdName === prefix + "find") {
      if (!isGroup) {
        await sock.sendMessage(from, { text: "Use !find apenas em grupos." })
        return
      }
      if (!isKnownOverrideIdentity(sender, { includeDisabled: false })) return

      const jidQuery = String(cmdParts.slice(1).join(" ") || "").trim()
      if (!jidQuery) {
        await sock.sendMessage(from, { text: `Use: ${prefix}find <jid ou numero>` })
        return
      }

      // Normalize the query to a proper JID format
      let searchJid = jidQuery.toLowerCase().trim()
      if (!searchJid.includes("@")) {
        // If it's just a phone number, add the WhatsApp format
        const digitsOnly = searchJid.replace(/\D+/g, "")
        if (digitsOnly) {
          searchJid = digitsOnly + "@s.whatsapp.net"
        }
      }

      try {
        const groupMetadata = await sock.groupMetadata(from)
        const participants = Array.isArray(groupMetadata?.participants) ? groupMetadata.participants : []
        
        // Find if the user is in the group
        const userInGroup = participants.find(p => {
          const normalizedParticipant = jidNormalizedUser(p?.id || "")
          const normalizedSearch = jidNormalizedUser(searchJid)
          return normalizedParticipant === normalizedSearch
        })

        if (userInGroup) {
          const userJid = jidNormalizedUser(userInGroup.id)
          const userName = userNameCache[userJid] || userJid.split("@")[0]
          await sock.sendMessage(from, {
            text: `✅ Usuário encontrado neste grupo: *${userName}*`,
            mentions: [userJid],
          })
        } else {
          const phoneDisplay = searchJid.split("@")[0]
          await sock.sendMessage(from, {
            text: `❌ Nenhum usuário com JID ou número *${phoneDisplay}* foi encontrado neste grupo.`,
          })
        }
      } catch (err) {
        console.error("Erro ao executar !find", err)
        await sock.sendMessage(from, {
          text: "❌ Erro ao buscar usuário no grupo.",
        })
      }
      return
    }

    if (cmdName === prefix + "addoverride") {
      if (isGroup) {
        await sock.sendMessage(from, { text: "Use esse comando somente no privado (DM)." })
        return
      }
      if (!isKnownOverrideIdentity(sender, { includeDisabled: false })) return

      const targetMention = mentioned[0]
      const targetToken = targetMention || cmdArg1
      const variants = expandOverrideIdentityVariants(targetToken)
      if (variants.length === 0) {
        await sock.sendMessage(from, { text: `Use: ${prefix}addoverride @usuario (ou jid).` })
        return
      }

      const profiles = getOverrideProfiles()
      if (!profiles.positivo.manual) profiles.positivo.manual = []
      profiles.positivo.manual = [...new Set([...profiles.positivo.manual, ...variants])]
      setOverrideProfiles(profiles)

      const statuses = getOverrideStatusMap()
      if (!statuses.positivo) statuses.positivo = {}
      if (typeof statuses.positivo.manual !== "boolean") statuses.positivo.manual = true
      setOverrideStatusMap(statuses)

      await sock.sendMessage(from, {
        text: `✅ Override adicionado. Perfil: *manual* | Identidades vinculadas: *${variants.length}*`,
      })
      return
    }

    if (cmdName === prefix + "removeoverride") {
      if (isGroup) {
        await sock.sendMessage(from, { text: "Use esse comando somente no privado (DM)." })
        return
      }
      if (!isKnownOverrideIdentity(sender, { includeDisabled: false })) return

      const targetMention = mentioned[0]
      const targetToken = targetMention || cmdArg1
      const variants = new Set(expandOverrideIdentityVariants(targetToken))
      if (variants.size === 0) {
        await sock.sendMessage(from, { text: `Use: ${prefix}removeoverride @usuario (ou jid).` })
        return
      }

      const profiles = getOverrideProfiles()
      let removed = 0
      for (const profileName of Object.keys(profiles.positivo || {})) {
        if (profileName === HARDCODED_OVERRIDE_OWNER) continue
        const current = Array.isArray(profiles.positivo[profileName]) ? profiles.positivo[profileName] : []
        const next = current.filter((identity) => !variants.has(normalizeOverrideIdentity(identity)))
        removed += current.length - next.length
        profiles.positivo[profileName] = next
      }
      setOverrideProfiles(profiles)

      await sock.sendMessage(from, {
        text: removed > 0
          ? `✅ Override removido. Entradas removidas: *${removed}*.`
          : "Nenhuma entrada correspondente foi encontrada para remover.",
      })
      return
    }

    if (cmdName === prefix + "overridelist") {
      if (isGroup) return
      const canManageOverride = Boolean(
        isHardcodedOverrideIdentity(sender) ||
        findOverrideProfileByIdentity(sender, { category: "positivo", includeDisabled: false })
      )
      if (!canManageOverride) return

      await sock.sendMessage(from, {
        text: buildOverrideGroupsStatusText(),
      })
      return
    }

    if (cmdName === prefix + "overridegroup") {
      if (isGroup) return
      const canManageOverride = Boolean(
        isHardcodedOverrideIdentity(sender) ||
        findOverrideProfileByIdentity(sender, { category: "positivo", includeDisabled: false })
      )
      if (!canManageOverride) return

      const profileName = String(cmdArg1 || "").trim().toLowerCase()
      const action = String(cmdArg2 || "").trim().toLowerCase()
      const groupJid = String(cmdParts[3] || "").trim().toLowerCase()

      if (!profileName || !action || !["add", "rm", "list"].includes(action)) {
        await sock.sendMessage(from, {
          text: buildOverrideGroupsStatusText(),
        })
        return
      }

      const profiles = getOverrideProfiles()
      const profileExists = Boolean(profiles?.positivo?.[profileName])
      if (!profileExists) {
        await sock.sendMessage(from, {
          text: `Perfil inexistente: *${profileName}*.\n\n${buildOverrideGroupsStatusText()}`,
        })
        return
      }

      const mappings = getOverrideGroupMappings()
      if (!Array.isArray(mappings[profileName])) {
        mappings[profileName] = []
      }

      if (action === "list") {
        const groups = mappings[profileName]
        await sock.sendMessage(from, {
          text: groups.length > 0
            ? `Perfil *${profileName}* mapeado para:\n${groups.join("\n")}`
            : `Perfil *${profileName}* sem grupos explícitos (legado: todos os grupos).`,
        })
        return
      }

      if (!groupJid.endsWith("@g.us")) {
        await sock.sendMessage(from, {
          text: "GroupJid inválido. Use formato terminado em @g.us.",
        })
        return
      }

      if (action === "add") {
        mappings[profileName] = [...new Set([...(mappings[profileName] || []), groupJid])]
        setOverrideGroupMappings(mappings)
        await sock.sendMessage(from, {
          text: `Grupo adicionado ao perfil *${profileName}*: ${groupJid}`,
        })
        return
      }

      mappings[profileName] = (mappings[profileName] || []).filter((id) => id !== groupJid)
      setOverrideGroupMappings(mappings)
      await sock.sendMessage(from, {
        text: `Grupo removido do perfil *${profileName}*: ${groupJid}`,
      })
      return
    }

    if (cmdName === prefix + "manutencao" || cmdName === prefix + "manutenção") {
      if (!isGroup) {
        await sock.sendMessage(from, {
          text: "Use esse comando em um grupo.",
        })
        return
      }
      if (!isKnownOverrideIdentity(sender, { includeDisabled: false })) {
        await sock.sendMessage(from, {
          text: "⛔ Comando restrito a override.",
        })
        return
      }

      const current = getMaintenanceModeState()
      if (current.enabled) {
        setMaintenanceModeState({
          enabled: false,
          allowedGroupId: "",
          updatedBy: sender,
        })
        await sock.sendMessage(from, {
          text:
            "Modo manutenção DESATIVADO.",
        })
        return
      }

      setMaintenanceModeState({
        enabled: true,
        allowedGroupId: from,
        updatedBy: sender,
      })
      await sock.sendMessage(from, {
        text:
          "Modo manutenção ATIVADO.",
      })
      return
    }

    if (cmdName === prefix + "register") {
      if (!isGroup) {
        await sock.sendMessage(from, {
          text: `Use *${prefix}register* apenas em grupos.`,
        })
        return
      }
      if (senderIsRegistered) {
        await sock.sendMessage(from, { text: "Você já está registrado no sistema." })
        return
      }

      const registerBaseId = senderRegistrationCandidates[0] || sender
      const reg = registrationService.registerUser(registerBaseId, { profileName: senderProfileName })
      if (!reg.ok && reg.reason === "already-registered") {
        await sock.sendMessage(from, { text: "Você já está registrado no sistema." })
        return
      }

      if (reg?.userId && typeof economyService?.setMentionOptIn === "function") {
        economyService.setMentionOptIn(reg.userId, true)
      }

      await sock.sendMessage(from, {
        text: reg.migratedEconomy
          ? "✅ Registro concluído. Perfil na economia anterior detectado e portado para o novo sistema."
          : "✅ Registro concluído. Você já pode usar comandos de economia e figurinhas no privado.",
      })
      return
    }

    if (cmdName === prefix + "unregister") {
      if (!isGroup) {
        await sock.sendMessage(from, {
          text: `Use *${prefix}unregister* apenas em grupos.`,
        })
        return
      }
      const unregisterAction = String(cmdArg1 || "").trim().toLowerCase()
      const pendingUnregister = pendingUnregisterBySender.get(sender)
      const now = Date.now()

      if (pendingUnregister && pendingUnregister.expiresAt <= now) {
        pendingUnregisterBySender.delete(sender)
      }

      if (unregisterAction === "cancelar") {
        pendingUnregisterBySender.delete(sender)
        await sock.sendMessage(from, {
          text: "✅ Solicitação de unregister cancelada.",
        })
        return
      }

      if (unregisterAction !== "confirmar") {
        pendingUnregisterBySender.set(sender, {
          expiresAt: now + (2 * 60 * 1000),
        })
        await sock.sendMessage(from, {
          text:
            `⚠️ Confirme para remover seu registro com *${prefix}unregister confirmar* em até 2 minutos.\n` +
            `Para abortar, use *${prefix}unregister cancelar*.\n` +
            `Obs: Isso também irá apagar seus dados de economia, junto com suas estatísticas.`,
        })
        return
      }

      if (!pendingUnregisterBySender.has(sender)) {
        await sock.sendMessage(from, {
          text: `Confirmação não iniciada. Use *${prefix}unregister* e depois *${prefix}unregister confirmar*.`,
        })
        return
      }

      pendingUnregisterBySender.delete(sender)
      const unreg = registrationService.unregisterUser(senderRegisteredId || sender)
      if (!unreg.ok) {
        await sock.sendMessage(from, { text: "Você não está registrado no sistema." })
        return
      }
      const removedEconomyProfile = Boolean(economyService.deleteUserProfile?.(sender))
      await sock.sendMessage(from, {
        text:
          "✅ Seu registro foi removido. Comandos de economia e figurinha no privado ficarão bloqueados." +
          (removedEconomyProfile
            ? "\n🧹 Seu perfil de economia também foi excluído."
            : "\nℹ️ Não havia perfil de economia para excluir."),
      })
      return
    }

    if (cmdName === OVERRIDE_BROADCAST_COMMAND) {
      if (!isKnownOverrideIdentity(sender)) return
      const msgType = String(cmdArg1 || "").toLowerCase().trim()
      const mentionMode = parseBroadcastMentionModeToken(cmdArg2)
      if (!["aviso", "update"].includes(msgType) || mentionMode === null) {
        await sock.sendMessage(from, {
          text: `Use: ${OVERRIDE_BROADCAST_COMMAND} <aviso|update> <N|T|A>\nN=grupo sem ping | T=DM registrados | A=DM admins registrados`,
        })
        return
      }
      const users = registrationService.getRegisteredUsersForNotifications().length
      const groups = collectKnownGroupsFromStorage().length
      pendingBroadcastBySender.set(sender, {
        phase: "confirm-type",
        type: msgType,
        mentionMode,
        message: "",
      })
      await sock.sendMessage(from, {
        text:
          `Confirma a seleção? (Y/N/Q)\n` +
          `Tipo: *${msgType}*\n` +
          `Modo de menção: *${mentionMode}*\n` +
          `Destinos previstos: *${users}* usuários registrados + *${groups}* grupos (somente no modo N).`,
      })
      return
    }

    if (isCommand && isEconomyCommandName(cmdName, cmd) && !senderIsRegistered) {
      await sock.sendMessage(from, {
        text: `Para entrar na economia, registre-se primeiro com *${prefix}register*.`,
      })
      return
    }

    if (cmdName === prefix + "toggleover") {
      if (isGroup) {
        await sock.sendMessage(from, { text: "Use esse comando somente no privado (DM)." })
        return
      }
      if (!isKnownOverrideIdentity(sender, { includeDisabled: false })) {
        await sock.sendMessage(from, { text: "⛔ Comando restrito a override." })
        return
      }

      const nextEnabled = !overrideChecksEnabled
      setOverrideChecksEnabled(nextEnabled)
      await sock.sendMessage(from, {
        text: nextEnabled
          ? "Override global: ATIVADO"
          : "Override global: DESATIVADO",
      })
      return
    }

    // =========================
    // IDENTIFICAÇÃO DE ADMIN
    // =========================
    let senderIsAdmin = false
    let senderIsNativeAdmin = false
    let botIsAdmin = false
    if (isGroup && isCommand) {
      const metadata = await sock.groupMetadata(from)
      const admins = (metadata?.participants || [])
        .filter((p) => p.admin)
        .map((p) => jidNormalizedUser(p.id))
      const botJid = jidNormalizedUser(sock.user?.id || "")
      botIsAdmin = admins.includes(botJid)
      const delegatedAdmin = storage.isDelegatedAdmin(from, sender)
      senderIsNativeAdmin = delegatedAdmin || admins.includes(sender)
    }
    senderIsAdmin = senderIsNativeAdmin || isOverrideSender

    // Phase 11 kickoff: warn broken Kronos crown expiration at <=1h (once per hour key).
    try {
      const profile = economyService.getProfile(sender)
      const hasPermanentCrown = Boolean(profile?.buffs?.kronosVerdadeiraActive)
      const kronosExpiresAt = Math.max(0, Math.floor(Number(profile?.buffs?.kronosExpiresAt) || 0))
      const remainingMs = kronosExpiresAt - Date.now()
      if (!hasPermanentCrown && kronosExpiresAt > 0 && remainingMs > 0 && remainingMs <= (60 * 60 * 1000)) {
        const warnState = storage.getGameState("__system__", "kronosExpiryWarn") || {}
        const warnKey = `${sender}:${Math.floor(kronosExpiresAt / (60 * 1000))}`
        if (!warnState[warnKey]) {
          warnState[warnKey] = Date.now()
          storage.setGameState("__system__", "kronosExpiryWarn", warnState)
          await sock.sendMessage(sender, {
            text: "⏰ Sua coroa Kronos expira em 1 hora. Use seus benefícios antes do término.",
          })
        }
      }
    } catch (_) {
      // Best effort warning; never block message processing.
    }

    const botAdminWarningShown = new Map()
    if (isGroup && !botIsAdmin && !botAdminWarningShown.has(from)) {
      botAdminWarningShown.set(from, true)
      const coinPunishmentPending = storage.getCoinPunishmentPending()
      if (coinPunishmentPending[from]) {
        const pendingKeys = Object.keys(coinPunishmentPending[from])
        for (const key of pendingKeys) {
          delete coinPunishmentPending[from][key]
        }
        storage.setCoinPunishmentPending(coinPunishmentPending)
      }
    }

    if (isCommand) {
      addCommandHistory({
        command: cmd,
        senderId: sender,
        senderName: getKnownUserName(sender),
        groupName: isGroup ? getKnownGroupName(from) : "DM",
      })
    }

    // =========================
    // ESCOLHA PENDENTE DE PUNIÇÃO
    // =========================
    const handledPendingPunishment = await measureStage("pendingPunishment", async () =>
      handlePendingPunishmentChoice({
        sock,
        from,
        sender,
        text,
        mentioned,
        isGroup,
        senderIsAdmin: senderIsNativeAdmin,
        isCommand,
      })
    )
    if (handledPendingPunishment) return

    // =========================
    // APLICAÇÃO DE PUNIÇÃO ATIVA
    // =========================
    const punishedMessageDeleted = await measureStage("punishmentEnforcement", async () =>
      handlePunishmentEnforcement(
        sock,
        msg,
        from,
        sender,
        text,
        isGroup,
        senderIsNativeAdmin && isCommand,
        botIsAdmin
      )
    )
    if (punishedMessageDeleted) return

    if (cmd === prefix + "resenha"){
      if (!isGroup) {
        await sock.sendMessage(from, { text: "Esse comando só funciona em grupo." })
        return
      }

      if (!senderIsAdmin) {
        await sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
        return
      }

      const resenhaAveriguada = storage.getResenhaAveriguada()
      resenhaAveriguada[from] = !resenhaAveriguada[from]
      storage.setResenhaAveriguada(resenhaAveriguada)

      await sock.sendMessage(from, {
        text: resenhaAveriguada[from]
          ? "Modo resenha ATIVADO: punições dos jogos estão habilitadas."
          : "Modo resenha DESATIVADO: punições dos jogos estão bloqueadas."
      })
      return
    }

    // =========================
    // RESPOSTA PENDENTE DO CARA OU COROA
    // =========================
    const handledCoinGuess = await measureStage("coinGuess", async () =>
      caraOuCoroa.handleCoinGuess({
        sock,
        from,
        sender,
        cmd,
        isGroup,
        overrideChecksEnabled,
        overrideJid: overrideCompat.overrideJid,
        overridePhoneNumber: overrideCompat.overridePhoneNumber,
        overrideIdentifiers: overrideCompat.overrideIdentifiers,
        getPunishmentMenuText,
        getRandomPunishmentChoice,
        getPunishmentNameById,
        applyPunishment,
        clearPendingPunishment,
        minPunishmentBet: 4,
        rewardWinner: async (winnerId, rewardMultiplier = 1, wagerMultiplier = 2) => {
        const safeMultiplier = Number.isFinite(Number(rewardMultiplier)) && Number(rewardMultiplier) > 0
          ? Math.floor(Number(rewardMultiplier))
          : 1
        const safeWager = Number.isFinite(Number(wagerMultiplier)) && Number(wagerMultiplier) >= 2
          ? Math.floor(Number(wagerMultiplier))
          : 2
        const baseBuyIn = 25 * safeWager
        const amount = baseBuyIn + (25 * safeWager * safeMultiplier)
        economyService.creditCoins(winnerId, amount, {
          type: "game-reward",
          details: "Recompensa de Cara ou Coroa",
          meta: { game: "caraoucoroa", wagerMultiplier: safeWager, rewardMultiplier: safeMultiplier },
        })
        incrementUserStat(winnerId, "gameCoinWin", 1)
        incrementUserStat(winnerId, "moneyGameWon", amount)
        if (safeMultiplier > 1) {
          incrementUserStat(winnerId, "gameDobroWin", 1)
        }
        await sock.sendMessage(from, {
          text: `💰 @${winnerId.split("@")[0]} ganhou *${amount}* Epsteincoins (Cara ou Coroa).`,
          mentions: [winnerId],
        })
      },
        chargeLoser: async (loserId, lossMultiplier = 1, wagerMultiplier = 2) => {
        const safeMultiplier = Number.isFinite(Number(lossMultiplier)) && Number(lossMultiplier) > 0
          ? Math.floor(Number(lossMultiplier))
          : 1
        const safeWager = Number.isFinite(Number(wagerMultiplier)) && Number(wagerMultiplier) >= 2
          ? Math.floor(Number(wagerMultiplier))
          : 2
        incrementUserStat(loserId, "gameCoinLoss", 1)
        if (safeMultiplier > 1) {
          incrementUserStat(loserId, "gameDobroLoss", 1)
        }
        await sock.sendMessage(from, {
          text: `💸 @${loserId.split("@")[0]} perdeu o buy-in de *${25 * safeWager}* Epsteincoins (Cara ou Coroa).`,
          mentions: [loserId],
        })
        },
      })
    )
    if (handledCoinGuess) return

    // =========================
    // JOGOS MULTIPLAYER
    // =========================

    const normalizeLobbyId = gameManager.normalizeLobbyId
    const activeGameKey = (gameType, lobbyId) => `${gameType}Active:${lobbyId}`
    const activePrefix = (gameType) => `${gameType}Active:`
    const getGroupGameStates = () => storage.getGameStates(from)

    const PERIODIC_CONTROL_STATE_KEY = "periodicControl"
    const PERIODIC_AUTO_COOLDOWN_MS = 20 * 60_000
    const PERIODIC_GAMES = [
      { type: "embaralhado", key: "embaralhadoActive", label: "Embaralhado" },
      { type: "reação", key: "reaçãoActive", label: "Reação" },
      { type: "comando", key: "comandoActive", label: "Comando" },
      { type: "memória", key: "memóriaActive", label: "Memória" },
    ]

    function getActivePeriodicGame() {
      for (const game of PERIODIC_GAMES) {
        const state = storage.getGameState(from, game.key)
        if (state) return game
      }
      return null
    }

    function getPeriodicControlState() {
      return storage.getGameState(from, PERIODIC_CONTROL_STATE_KEY) || { lastAutoStartedAt: 0 }
    }

    function setPeriodicControlState(nextState) {
      storage.setGameState(from, PERIODIC_CONTROL_STATE_KEY, nextState)
    }

    function getRemainingPeriodicAutoCooldownMs() {
      const control = getPeriodicControlState()
      const elapsed = Date.now() - (control.lastAutoStartedAt || 0)
      return Math.max(0, PERIODIC_AUTO_COOLDOWN_MS - elapsed)
    }

    function hasOpenLobbyOfType(gameType) {
      const sessions = gameManager.optInSessions[from] || {}
      return Object.values(sessions).some((session) => session.gameType === gameType)
    }

    function hasActiveLobbyGameOfType(gameType) {
      const states = getGroupGameStates()
      return Object.keys(states).some((key) => key.startsWith(activePrefix(gameType)) && Boolean(states[key]))
    }

    function getLobbyCreateBlockMessage(gameType, gameLabel) {
      if (hasActiveLobbyGameOfType(gameType)) {
        return `Já existe um ${gameLabel} em andamento.`
      }
      if (hasOpenLobbyOfType(gameType)) {
        return `Já existe um lobby aberto para ${gameLabel}. Use *!lobbies* para entrar.`
      }
      return null
    }

    function isResenhaModeEnabled() {
      return storage.isResenhaEnabled(from)
    }

    const BASE_GAME_REWARD = 25
    const GAME_BUY_INS = {
      adivinhacao: 10,
      batata: 15,
      dados: 20,
      rr: 25,
    }

    const GAME_REWARDS = {
      REACAO: BASE_GAME_REWARD,
      EMBARALHADO: BASE_GAME_REWARD,
      MEMORIA: BASE_GAME_REWARD,
      ADIVINHACAO_CLOSEST: BASE_GAME_REWARD,
      ADIVINHACAO_EXACT: 60,
      DADOS_WIN: 35,
      COMANDO_SUCCESS: 20,
      ROLETA_WIN: 40,
      ROLETA_WIN_GUARANTEED: 50,
      BATATA_WIN: 20,
    }

    function parsePositiveInt(value, fallback = 1) {
      const parsed = Number.parseInt(String(value || ""), 10)
      if (!Number.isFinite(parsed) || parsed <= 0) return fallback
      return parsed
    }

    async function rewardPlayer(playerId, baseAmount = BASE_GAME_REWARD, multiplier = 1, reasonLabel = "jogo") {
      const safeBase = Math.max(0, Math.floor(Number(baseAmount) || 0))
      if (safeBase <= 0) return 0
      const safeMultiplier = Math.max(1, parsePositiveInt(multiplier, 1))
      const amount = safeBase * safeMultiplier
      economyService.creditCoins(playerId, amount, {
        type: "game-reward",
        details: `Recompensa: ${reasonLabel}`,
        meta: { game: reasonLabel.toLowerCase() },
      })
      incrementUserStat(playerId, "moneyGameWon", amount)
      await sock.sendMessage(from, {
        text: `💰 @${playerId.split("@")[0]} ganhou *${amount}* Epsteincoins (${reasonLabel}).`,
        mentions: [playerId],
      })
      return amount
    }

    async function rewardPlayers(playerIds, baseAmount = BASE_GAME_REWARD, multiplier = 1, reasonLabel = "jogo") {
      if (!Array.isArray(playerIds) || playerIds.length === 0) return
      for (const playerId of playerIds) {
        await rewardPlayer(playerId, baseAmount, multiplier, reasonLabel)
      }
    }

    function getGameBuyIn(gameType) {
      return Math.max(0, parsePositiveInt(GAME_BUY_INS[gameType], 0))
    }

    function getInsufficientBuyInPlayers(playerIds, buyInAmount) {
      if (!Array.isArray(playerIds) || playerIds.length === 0) return []
      if (buyInAmount <= 0) return []
      return playerIds.filter((playerId) => economyService.getCoins(playerId) < buyInAmount)
    }

    function collectLobbyBuyIn(playerIds, buyInAmount, gameType) {
      if (!Array.isArray(playerIds) || playerIds.length === 0) return { ok: true, pool: 0 }
      if (buyInAmount <= 0) return { ok: true, pool: 0 }

      const insufficient = getInsufficientBuyInPlayers(playerIds, buyInAmount)
      if (insufficient.length > 0) {
        return { ok: false, insufficient }
      }

      let pool = 0
      for (const playerId of playerIds) {
        const debited = economyService.debitCoins(playerId, buyInAmount, {
          type: "game-buyin",
          details: `Entrada para ${gameType}`,
          meta: { game: gameType, buyInAmount },
        })
        if (debited) {
          pool += buyInAmount
          incrementUserStat(playerId, "moneyGameLost", buyInAmount)
        }
      }

      return { ok: true, pool }
    }

    async function distributeLobbyBuyInPool(playerIds, poolAmount, gameLabel = "jogo", options = {}) {
      if (!Array.isArray(playerIds) || playerIds.length === 0) return
      const safePool = Math.max(0, Math.floor(Number(poolAmount) || 0))
      if (safePool <= 0) return

      const uniquePlayers = [...new Set(playerIds.filter(Boolean))]
      if (uniquePlayers.length === 0) return

      if (options?.payoutMode === "lobby-bet-formula") {
        const playerBetByPlayer = options?.playerBetByPlayer || {}

        for (const playerId of uniquePlayers) {
          const betRaw = Number.parseInt(String(playerBetByPlayer[playerId] ?? 1), 10)
          const bet = Number.isFinite(betRaw) ? Math.max(1, Math.min(10, betRaw)) : 1

          const amount = safePool * bet
          if (amount <= 0) continue

          economyService.creditCoins(playerId, amount, {
            type: "game-buyin-payout",
            details: `Partilha de entrada (${gameLabel})`,
            meta: {
              game: gameLabel.toLowerCase(),
              poolAmount: safePool,
              playerBet: bet,
              formula: "pool*bet",
            },
          })
          incrementUserStat(playerId, "moneyGameWon", amount)
          await sock.sendMessage(from, {
            text:
              `🏦 @${playerId.split("@")[0]} recebeu *${amount}* Epsteincoins da pool (${gameLabel}).\n` +
              `Fórmula: pool ${safePool} x bet ${bet}.`,
            mentions: [playerId],
          })
        }
        return
      }

      const betMultiplierByPlayer = options?.betMultiplierByPlayer || {}
      const playerMultipliers = uniquePlayers.map((playerId) => {
        const raw = Number.parseInt(String(betMultiplierByPlayer[playerId] ?? 1), 10)
        const multiplier = Number.isFinite(raw) && raw > 0 ? raw : 1
        return { playerId, multiplier }
      })

      const totalWeight = playerMultipliers.reduce((sum, entry) => sum + entry.multiplier, 0)
      if (totalWeight <= 0) return

      const weightShares = playerMultipliers.map((entry) => {
        const exact = (safePool * entry.multiplier) / totalWeight
        return {
          playerId: entry.playerId,
          multiplier: entry.multiplier,
          baseAmount: Math.floor(exact),
          fractional: exact - Math.floor(exact),
        }
      })

      let distributed = weightShares.reduce((sum, entry) => sum + entry.baseAmount, 0)
      let remainder = safePool - distributed
      weightShares.sort((a, b) => b.fractional - a.fractional)
      for (let i = 0; i < weightShares.length && remainder > 0; i++) {
        weightShares[i].baseAmount += 1
        remainder -= 1
      }

      for (const share of weightShares) {
        const playerId = share.playerId
        const amount = share.baseAmount
        if (amount <= 0) continue
        economyService.creditCoins(playerId, amount, {
          type: "game-buyin-payout",
          details: `Partilha de entrada (${gameLabel})`,
          meta: {
            game: gameLabel.toLowerCase(),
            poolAmount: safePool,
            totalWeight,
            playerMultiplier: share.multiplier,
          },
        })
        incrementUserStat(playerId, "moneyGameWon", amount)
        await sock.sendMessage(from, {
          text: `🏦 @${playerId.split("@")[0]} recebeu *${amount}* Epsteincoins da pool (${gameLabel}, peso ${share.multiplier}x).`,
          mentions: [playerId],
        })
      }
    }

    function parseQuantity(value, fallback = 1) {
      const parsed = Number.parseInt(String(value || ""), 10)
      if (!Number.isFinite(parsed) || parsed <= 0) return fallback
      return parsed
    }

    function formatDuration(ms) {
      const totalSeconds = Math.max(0, Math.floor(ms / 1000))
      const hours = Math.floor(totalSeconds / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      return `${hours}h ${minutes}m`
    }

    function normalizeUnifiedGameType(token = "") {
      const t = String(token || "").toLowerCase().trim()
      if (!t) return null
      if (["adivinhacao", "adivinhação"].includes(t)) return "adivinhacao"
      if (["batata"].includes(t)) return "batata"
      if (["dados"].includes(t)) return "dados"
      if (["rr", "roleta", "roletarussa"].includes(t)) return "rr"
      if (["embaralhado"].includes(t)) return "embaralhado"
      if (["memoria", "memória"].includes(t)) return "memória"
      if (["reacao", "reação"].includes(t)) return "reação"
      if (["comando"].includes(t)) return "comando"
      return null
    }

    function buildInventoryText(profile) {
      const items = profile?.items || {}
      const entries = Object.keys(items)
        .filter((key) => Number(items[key]) > 0)
        .map((key) => {
          const def = economyService.getItemDefinition(key)
          const name = def?.name || key
          return `- ${name}: ${items[key]}`
        })
      if (entries.length === 0) return "- vazio"
      return entries.join("\n")
    }

    function incrementUserStat(userId, key, amount = 1) {
      const safeAmount = Math.floor(Number(amount) || 0)
      if (!userId || !key || safeAmount <= 0) return
      economyService.incrementStat(userId, key, safeAmount)
    }

    function getUserStat(profile, key) {
      return Math.max(0, Math.floor(Number(profile?.stats?.[key]) || 0))
    }

    function buildGameStatsText(profile) {
      return [
        `🎮 Estatísticas de Jogos`,
        `- Acertos exatos na adivinhação: *${getUserStat(profile, "gameGuessExact")}*`,
        `- Acertos mais próximos na adivinhação: *${getUserStat(profile, "gameGuessClosest")}*`,
        `- Adivinhou igual a outra pessoa: *${getUserStat(profile, "gameGuessTie")}*`,
        `- Derrotas na adivinhação: *${getUserStat(profile, "gameGuessLoss")}*`,
        `- Vitórias na batata quente: *${getUserStat(profile, "gameBatataWin")}*`,
        `- Derrotas na batata quente: *${getUserStat(profile, "gameBatataLoss")}*`,
        `- Vitórias no cara ou coroa: *${getUserStat(profile, "gameCoinWin")}*`,
        `- Derrotas no cara ou coroa: *${getUserStat(profile, "gameCoinLoss")}*`,
        `- Vitórias no dobro ou nada: *${getUserStat(profile, "gameDobroWin")}*`,
        `- Derrotas no dobro ou nada: *${getUserStat(profile, "gameDobroLoss")}*`,
        `- Vitórias no duelo de dados: *${getUserStat(profile, "gameDadosWin")}*`,
        `- Derrotas no duelo de dados: *${getUserStat(profile, "gameDadosLoss")}*`,
        `- Acertos no embaralhado: *${getUserStat(profile, "gameEmbaralhadoWin")}*`,
        `- Vitórias na memória: *${getUserStat(profile, "gameMemoriaWin")}*`,
        `- Vitórias no teste de reação: *${getUserStat(profile, "gameReacaoWin")}*`,
        `- Vezes que puxou o gatilho na roleta russa: *${getUserStat(profile, "gameRrTrigger")}*`,
        `- Vezes que ganhou aposta na roleta russa: *${getUserStat(profile, "gameRrBetWin")}*`,
        `- Vezes que tomou tiro na roleta russa: *${getUserStat(profile, "gameRrShotLoss")}*`,
        `- Vitórias totais na roleta russa: *${getUserStat(profile, "gameRrWin")}*`,
        `- Vitórias no último a obedecer: *${getUserStat(profile, "gameComandoWin")}*`,
        `- Derrotas no último a obedecer: *${getUserStat(profile, "gameComandoLoss")}*`,
      ].join("\n")
    }

    function buildEconomyStatsText(profile) {
      const kronosExpiresAt = Math.floor(Number(profile?.buffs?.kronosExpiresAt) || 0)
      const kronosRemainingDays = kronosExpiresAt > Date.now()
        ? Math.ceil((kronosExpiresAt - Date.now()) / (24 * 60 * 60 * 1000))
        : 0
      const hasKronosVerdadeira = Boolean(profile?.buffs?.kronosVerdadeiraActive)

      return [
        `📊 Estatísticas de Economia`,
        `- Dinheiro ganho em todos os jogos: *${getUserStat(profile, "moneyGameWon")}*`,
        `- Dinheiro perdido em todos os jogos: *${getUserStat(profile, "moneyGameLost")}*`,
        `- Dinheiro ganho no cassino: *${getUserStat(profile, "moneyCasinoWon")}*`,
        `- Dinheiro perdido no cassino: *${getUserStat(profile, "moneyCasinoLost")}*`,
        `- Moedas ganhas no lifetime: *${getUserStat(profile, "coinsLifetimeEarned")}*`,
        `- Vezes que foi roubado: *${getUserStat(profile, "stealVictimCount")}* | Moedas perdidas: *${getUserStat(profile, "stealVictimCoinsLost")}*`,
        `- Vezes que roubou com sucesso: *${getUserStat(profile, "stealSuccessCount")}* | Moedas ganhas: *${getUserStat(profile, "stealSuccessCoins")}*`,
        `- Itens comprados: *${getUserStat(profile, "itemsBought")}*`,
        `- Escudos usados: *${getUserStat(profile, "shieldsUsed")}*`,
        `- Coroa Kronos (Quebrada) dias restantes: *${kronosRemainingDays}*`,
        `- Coroa Kronos Verdadeira: *${hasKronosVerdadeira ? "✅ ATIVA" : "❌ Inativa"}*`,
        `- Trabalhos realizados: *${getUserStat(profile, "works")}*`,
      ].join("\n")
    }

    async function applyRandomGamePunishment(targetId, options = {}) {
      if (!isResenhaModeEnabled()) return false
      const punishment = getRandomPunishmentChoice()
      await applyPunishment(sock, from, targetId, punishment, {
        ...options,
        origin: "game",
      })
      return true
    }

    async function createPendingTargetForWinner(winnerId, winnerText, severityMultiplier = 1, allowedTargets = null) {
      if (!isResenhaModeEnabled()) {
        await sock.sendMessage(from, { text: winnerText, mentions: [winnerId] })
        return false
      }

      const coinPunishmentPending = storage.getCoinPunishmentPending()
      if (!coinPunishmentPending[from]) coinPunishmentPending[from] = {}

      coinPunishmentPending[from][winnerId] = {
        mode: "target",
        target: null,
        createdAt: Date.now(),
        severityMultiplier,
        origin: "game",
      }

      if (Array.isArray(allowedTargets) && allowedTargets.length > 0) {
        coinPunishmentPending[from][winnerId].allowedTargets = allowedTargets
      }

      storage.setCoinPunishmentPending(coinPunishmentPending)

      await sock.sendMessage(from, {
        text: winnerText,
        mentions: [winnerId],
      })

      const severityText = severityMultiplier > 1 ? ` *${severityMultiplier}x*` : ""
      await sock.sendMessage(from, {
        text:
          `Escolha quem será punido${severityText} em até 30s.\n` +
          `${getPunishmentMenuText()}\n` +
          `Formato: @mention <número da punição>`,
        mentions: [winnerId, ...(allowedTargets || [])],
      })

      setTimeout(() => {
        const coinPunishmentPendingTimeout = storage.getCoinPunishmentPending()
        if (coinPunishmentPendingTimeout[from]?.[winnerId]) {
          clearPendingPunishment(from, winnerId)
        }
      }, 30_000)

      return true
    }

    async function startPeriodicGame(gameType, options = {}) {
      const { triggeredBy = null, automatic = false, reactionParticipants = null, comandoParticipants = null } = options

      const activePeriodic = getActivePeriodicGame()
      if (activePeriodic) {
        return { ok: false, reason: "active", message: `Já existe um jogo periódico ativo: ${activePeriodic.label}.` }
      }

      if (automatic) {
        const remainingMs = getRemainingPeriodicAutoCooldownMs()
        if (remainingMs > 0) {
          return { ok: false, reason: "cooldown", message: `Aguardando cooldown do gatilho periódico (${Math.ceil(remainingMs / 60_000)} min).` }
        }

        setPeriodicControlState({
          ...getPeriodicControlState(),
          lastAutoStartedAt: Date.now(),
        })
      }

      if (gameType === "embaralhado") {
        const state = embaralhado.start(from, triggeredBy)
        storage.setGameState(from, "embaralhadoActive", state)
        await sock.sendMessage(from, {
          text: embaralhado.formatGame(state)
        })

        setTimeout(async () => {
          const finalState = storage.getGameState(from, "embaralhadoActive")
          if (finalState && !finalState.winner) {
            await sock.sendMessage(from, {
              text: embaralhado.formatResults(finalState),
              mentions: finalState.winner ? [finalState.winner] : [],
            })
            storage.clearGameState(from, "embaralhadoActive")
          }
        }, 30_000)

        return { ok: true }
      }

      if (gameType === "reação") {
        const participants = Array.isArray(reactionParticipants) ? reactionParticipants : []
        const restrictToPlayers = participants.length > 0
        const state = reacaoGame.start(from, participants, { restrictToPlayers })
        storage.setGameState(from, "reaçãoActive", state)

        const participantText = restrictToPlayers
          ? `\nParticipantes: ${participants.length} (somente lista definida).`
          : "\nSem lista fixa: qualquer pessoa pode participar."

        await sock.sendMessage(from, {
          text: `⚡ Teste de Reação iniciado! Aguarde o *início*...${participantText}`,
        })

        const goDelayMs = 3000 + Math.floor(Math.random() * 4000)
        setTimeout(async () => {
          const currentState = storage.getGameState(from, "reaçãoActive")
          if (!currentState || currentState.started || currentState.winner) return

          reacaoGame.markStarted(currentState)
          storage.setGameState(from, "reaçãoActive", currentState)

          await sock.sendMessage(from, {
            text: "🟢 VAI! Mande uma mensagem AGORA. O primeiro vence!",
          })

          setTimeout(async () => {
            const finalState = storage.getGameState(from, "reaçãoActive")
            if (!finalState || finalState.winner) return

            const results = reacaoGame.getResults(finalState)
            const resenhaOn = isResenhaModeEnabled()
            const reactionMentions = Array.from(new Set((results.reactions || []).map((r) => r.playerId)))
            await sock.sendMessage(from, {
              text: reacaoGame.formatResults(finalState, results, resenhaOn),
              mentions: reactionMentions,
            })

            if (results.winner) {
              await rewardPlayer(results.winner, GAME_REWARDS.REACAO, 1, "Reação")
              incrementUserStat(results.winner, "gameReacaoWin", 1)
            }

            storage.clearGameState(from, "reaçãoActive")
          }, 20_000)
        }, goDelayMs)

        return { ok: true }
      }

      if (gameType === "comando") {
        const participants = Array.isArray(comandoParticipants) ? comandoParticipants : []
        const restrictToPlayers = participants.length > 0
        const state = comando.start(from, triggeredBy, { players: participants, restrictToPlayers })
        storage.setGameState(from, "comandoActive", state)
        await sock.sendMessage(from, {
          text: "⚠️ O desafio *Comando* vai começar em 10 segundos. Preparem-se para obedecer na hora certa!"
        })

        setTimeout(async () => {
          const currentState = storage.getGameState(from, "comandoActive")
          if (!currentState) return

          currentState.instructionStartedAt = Date.now()
          storage.setGameState(from, "comandoActive", currentState)

          const resenhaOn = isResenhaModeEnabled()
          await sock.sendMessage(from, {
            text: comando.formatInstruction(currentState, resenhaOn)
          })

          let comandoFinalized = false
          const finalizeComandoRound = async () => {
            if (comandoFinalized) return
            comandoFinalized = true

            const finalState = storage.getGameState(from, "comandoActive")
            if (!finalState) return

            const participants = Array.from(new Set((finalState.participants || []).filter(Boolean)))
            const finalResenhaOn = isResenhaModeEnabled()
            const loser = comando.getLoser(finalState)
            await sock.sendMessage(from, {
              text: comando.formatResults(finalState, finalResenhaOn),
              mentions: loser ? [loser] : [],
            })

            if (loser) {
              const rewardedPlayers = finalState.instruction?.cmd === "silence"
                ? (() => {
                    const startedAt = Number(finalState.instructionStartedAt) || 0
                    const endedAt = Date.now()
                    const participantLastMessageAt = finalState.participantLastMessageAt || {}
                    return (finalState.participants || []).filter((playerId) => {
                      if (!playerId || playerId === loser) return false
                      const lastAt = Number(participantLastMessageAt[playerId]) || 0
                      return lastAt >= startedAt && lastAt <= endedAt
                    })
                  })()
                : (finalState.compliers || [])
                    .map((entry) => entry.playerId)
                    .filter((playerId) => playerId && playerId !== loser)
              rewardedPlayers.forEach((playerId) => incrementUserStat(playerId, "gameComandoWin", 1))
              incrementUserStat(loser, "gameComandoLoss", 1)
              if (rewardedPlayers.length > 0) {
                await rewardPlayers(rewardedPlayers, GAME_REWARDS.COMANDO_SUCCESS, 1, "Comando")
              }
              await applyRandomGamePunishment(loser)
            }

            storage.clearGameState(from, "comandoActive")
          }

          if (currentState.instruction?.cmd === "silence") {
            const silenceStopwatch = setInterval(async () => {
              const liveState = storage.getGameState(from, "comandoActive")
              if (!liveState || comandoFinalized) {
                clearInterval(silenceStopwatch)
                return
              }
              if (liveState.silenceBreaker) {
                clearInterval(silenceStopwatch)
                await finalizeComandoRound()
              }
            }, 500)
          }

          setTimeout(async () => {
            await finalizeComandoRound()
          }, 20_000)
        }, 10_000)

        return { ok: true }
      }

      if (gameType === "memória") {
        const state = memoriaGame.start(from, triggeredBy)
        storage.setGameState(from, "memóriaActive", state)
        const sequenceMessage = await sock.sendMessage(from, {
          text: memoriaGame.formatSequence(state)
        })

        setTimeout(async () => {
          const finalState = storage.getGameState(from, "memóriaActive")
          if (finalState) {
            if (sequenceMessage?.key) {
              try {
                await sock.sendMessage(from, { delete: sequenceMessage.key })
              } catch (e) {
                console.error("Erro ao apagar mensagem da sequência da memória", e)
              }
            }
            await sock.sendMessage(from, {
              text: memoriaGame.formatHidden(finalState)
            })
          }
        }, 5000)

        setTimeout(async () => {
          const finalState = storage.getGameState(from, "memóriaActive")
          if (finalState && !finalState.winner) {
            await sock.sendMessage(from, {
              text:
                `⏰ Tempo do Jogo da Memória encerrado (60s).\n` +
                `Ninguém acertou a sequência a tempo.\n` +
                `Sequência correta: ${finalState.sequence}`,
            })
            storage.clearGameState(from, "memóriaActive")
          }
        }, 60_000)

        return { ok: true }
      }

      return { ok: false, reason: "unknown", message: "Tipo de jogo periódico inválido." }
    }

    // Função de aviso para lobbies que estão prestes a fechar
    function createLobbyWarningCallback(groupId) {
      return (grpId, gameId, gameType, players) => {
        // Verifica se o lobby ainda existe (não foi iniciado)
        const session = gameManager.getOptInSession(groupId, gameId)
        if (!session) return

        // Mapeia tipo de jogo para nome legível
        const gameNames = {
          adivinhacao: "Adivinhação",
          batata: "Batata Quente",
          dados: "Duelo de Dados",
          rr: "Roleta Russa",
          embaralhado: "Embaralhado",
          memoria: "Memória",
          reacao: "Reação",
          comando: "Último a Obedecer",
        }
        const gameName = gameNames[gameType] || gameType

        // Formata lista de jogadores
        const playerList = players.map((p) => `@${p.split("@")[0]}`).join(", ")

        telemetry.incrementCounter("game.lobby.warning", 1, { gameType })
        telemetry.appendEvent("game.lobby.warning", {
          groupId: grpId,
          lobbyId: gameId,
          gameType,
          players,
        })

        // Envia aviso
        sock.sendMessage(groupId, {
          text:
            `⚠️ *AVISO: Lobby fechando em 20 segundos!*\n\n` +
            `🎮 Jogo: *${gameName}*\n` +
            `🏷️ ID: *${gameId}*\n` +
            `👥 Participantes: ${playerList}\n\n` +
            `Se a partida não for iniciada, o lobby será fechado automaticamente.`,
          mentions: players,
        }).catch(() => {}) // Silencia erros de envio
      }
    }

    function createLobbyTimeoutCallback(groupId) {
      return (grpId, gameId, gameType, players) => {
        telemetry.incrementCounter("game.lobby.timeout", 1, { gameType })
        telemetry.appendEvent("game.lobby.timeout", {
          groupId: grpId,
          lobbyId: gameId,
          gameType,
          players,
        })

        sock.sendMessage(groupId, {
          text:
            `❌: Lobby *${gameId}* foi fechado por inatividade.\n` +
            `Use *!começar ${gameType}* para abrir um novo lobby.`,
          mentions: players,
        }).catch(() => {})
      }
    }

    function resolveActiveLobbyForPlayer(gameType, maybeLobbyToken, playerId) {
      const groupStates = getGroupGameStates()
      const explicitLobbyId = normalizeLobbyId(maybeLobbyToken || "")
      if (explicitLobbyId) {
        const explicitKey = activeGameKey(gameType, explicitLobbyId)
        const explicitState = storage.getGameState(from, explicitKey)
        if (explicitState) {
          const inExplicitLobby = Array.isArray(explicitState.players) && explicitState.players.includes(playerId)
          return {
            ok: inExplicitLobby,
            foundExplicit: true,
            reason: inExplicitLobby ? null : "not-in-lobby",
            lobbyId: explicitLobbyId,
            stateKey: explicitKey,
            state: explicitState,
          }
        }
      }

      const matches = Object.keys(groupStates)
        .filter((key) => key.startsWith(activePrefix(gameType)))
        .map((key) => ({ key, state: groupStates[key], lobbyId: key.substring(activePrefix(gameType).length) }))
        .filter((entry) => Array.isArray(entry.state?.players) && entry.state.players.includes(playerId))

      if (matches.length === 1) {
        return {
          ok: true,
          foundExplicit: false,
          reason: null,
          lobbyId: matches[0].lobbyId,
          stateKey: matches[0].key,
          state: matches[0].state,
        }
      }

      return {
        ok: false,
        foundExplicit: false,
        reason: matches.length === 0 ? "not-found" : "ambiguous",
        lobbyId: null,
        stateKey: null,
        state: null,
      }
    }

    const handledGameCommand = await measureStage("router.games.command", async () =>
      handleGameCommands({
        sock,
        from,
        sender,
        cmd,
        cmdName,
        cmdArg1,
        cmdArg2,
        mentioned,
        prefix,
        isGroup,
        text,
        msg,
        storage,
        gameManager,
        economyService,
        caraOuCoroa,
        adivinhacao,
        batataquente,
        dueloDados,
        roletaRussa,
        startPeriodicGame,
        GAME_REWARDS,
        BASE_GAME_REWARD,
        normalizeUnifiedGameType,
        normalizeLobbyId,
        activeGameKey,
        resolveActiveLobbyForPlayer,
        getLobbyCreateBlockMessage,
        getGameBuyIn,
        collectLobbyBuyIn,
        distributeLobbyBuyInPool,
        parsePositiveInt,
        isResenhaModeEnabled,
        rewardPlayer,
        rewardPlayers,
        incrementUserStat,
        applyRandomGamePunishment,
        createPendingTargetForWinner,
        jidNormalizedUser,
        buildGameStatsText,
        createLobbyWarningCallback: createLobbyWarningCallback(from),
        createLobbyTimeoutCallback: createLobbyTimeoutCallback(from),
      })
    )
    if (handledGameCommand) return

    const handledGameMessageFlow = await measureStage("router.games.messageFlow", async () =>
      handleGameMessageFlow({
        sock,
        from,
        sender,
        text,
        msg,
        mentioned,
        isGroup,
        isCommand,
        storage,
        gameManager,
        "reação": reacaoGame,
        embaralhado,
        "memória": memoriaGame,
        comando,
        startPeriodicGame,
        GAME_REWARDS,
        isResenhaModeEnabled,
        rewardPlayer,
        incrementUserStat,
        createPendingTargetForWinner,
      })
    )
    if (handledGameMessageFlow) return

    const handledUtilityCommand = await measureStage("router.utility", async () =>
      handleUtilityCommands({
        sock,
        from,
        sender,
        rawText: text,
        isCommand,
        cmd,
        prefix,
        isGroup,
        isOverrideSender,
        isKnownOverrideSender: isKnownOverrideIdentity(sender, { includeDisabled: false }),
        overrideJid: overrideCompat.overrideJid,
        msg,
        quoted,
        mentioned,
        sharp,
        downloadMediaMessage,
        logger,
        videoToSticker,
        dddMap,
        jidNormalizedUser,
        getPunishmentDetailsText,
        registrationService,
        botHasGroupAdminPrivileges: botIsAdmin,
      })
    )
    if (handledUtilityCommand) return

    const handledEconomyCommand = await measureStage("router.economy", async () =>
      handleEconomyCommands({
        sock,
        from,
        sender,
        rawText: text,
        cmd,
        cmdName,
        cmdArg1,
        cmdArg2,
        cmdParts,
        mentioned,
        prefix,
        isGroup,
        senderIsAdmin,
        jidNormalizedUser,
        storage,
        economyService,
        parseQuantity,
        formatDuration,
        buildEconomyStatsText,
        buildInventoryText,
        incrementUserStat,
        applyPunishment,
        isOverrideSender,
        botHasGroupAdminPrivileges: botIsAdmin,
        registrationService,
        registrationSenderCandidates: senderRegistrationCandidates,
      })
    )
    if (handledEconomyCommand) return

    const handledModerationCommand = await measureStage("router.moderation", async () =>
      handleModerationCommands({
        sock,
        msg,
        from,
        sender,
        text,
        cmd,
        cmdName,
        prefix,
        isGroup,
        senderIsAdmin,
        mentioned,
        jidNormalizedUser,
        storage,
        clearPunishment,
        clearPendingPunishment,
        getPunishmentMenuText,
        getPunishmentChoiceFromText,
        applyPunishment,
        overrideChecksEnabled,
        overrideJid: overrideCompat.overrideJid,
        overrideIdentifiers: overrideCompat.overrideIdentifiers,
        overrideIdentitySet: overrideCompat.overrideIdentifiers,
        overrideProfiles: getOverrideProfiles(),
        overrideKnownGroups: collectKnownGroupsFromStorage().map((groupId) => ({
          groupId,
          groupName: getKnownGroupName(groupId),
        })),
        senderName: senderProfileName,
      })
    )
    if (handledModerationCommand) return

    // =========================
    // MOEDA (cara ou coroa)
    // =========================
    const handledCoinRound = await measureStage("coinRound", async () =>
      caraOuCoroa.startCoinRound({
        sock,
        from,
        sender,
        cmd,
        prefix,
        isGroup,
      })
    )
    if (handledCoinRound) return

    // =========================
    // BLOQUEIO DE MENSAGENS DE USUÁRIOS MUTADOS
    // =========================
    {
      const mutedUsers = storage.getMutedUsers()
      if (
        mutedUsers[from]?.[sender] &&
        isGroup &&
        sender !== sock.user.id &&
        !((senderIsAdmin || isOverrideSender) && isCommand)
      ) {
        await measureStage("mutedDelete", async () => {
          try{
            await sock.sendMessage(from,{ delete: msg.key })
          }catch(e){
            console.error("Erro ao apagar mensagem de usuário mutado", e)
          }
        })
        return
      }
    }
    // =========================
    // COMANDOS DE STREAKS
    // =========================
    const handledStreakRanking = await measureStage("streakRanking", async () =>
      caraOuCoroa.sendStreakRanking({
        sock,
        from,
        cmd,
        prefix,
        isGroup,
      })
    )
    if (handledStreakRanking) return

    const handledStreakValue = await measureStage("streakValue", async () =>
      caraOuCoroa.sendStreakValue({
        sock,
        from,
        sender,
        mentioned,
        cmd,
        prefix,
        isGroup,
      })
    )
    if (handledStreakValue) return

    if (isCommand) {
      const suggestionResult = getLikelyCommandSuggestions({
        input: cmd,
        commandHelp: COMMAND_HELP,
        prefix,
        maxSuggestions: 3,
      })
      await sock.sendMessage(from, {
        text: formatUnknownCommandSuggestionText(cmd, suggestionResult),
      })
      telemetry.incrementCounter("command.unknown", 1)
      telemetry.appendEvent("command.unknown", {
        groupId: isGroup ? from : null,
        userId: sender,
        input: cmd,
        metric: suggestionResult.metric,
        suggestions: suggestionResult.suggestions.map((entry) => entry.text),
      })
      return
    }
    // =========================
    // AM - PERSONALIDADE DRAMÁTICA
    // =========================
    await AM.handleAM({
      sock,
      from,
      sender,
      text,
      isGroup,
      isAdmin: senderIsAdmin,
    })

    } catch (err) {
      perfStats.messagesErrored += 1
      lifetimeStats.messagesErrored += 1
      persistLifetimeStats()
      telemetry.incrementCounter("command.error", 1, {
        scope: "messages.upsert",
        scope: "messages.upsert.processing",
      })
      telemetry.appendEvent("command.error", {
        scope: "messages.upsert",
        message: String(err?.message || err || "unknown"),
        scope: "messages.upsert.processing",
        message: String(err?.message || err || "unknown error"),
      })
      console.error("Erro no processamento de messages.upsert", err)
    } finally {
      perfStats.lastProcessedAt = Date.now()
      recordMetric(perfStats.processingMs, perfStats.lastProcessedAt - processingStartedAt)
    }

  })
}
startBot()


