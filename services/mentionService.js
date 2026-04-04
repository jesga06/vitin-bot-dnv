const DEFAULT_MENTION_SERVER = "s.whatsapp.net"

function extractDigits(value = "") {
  return String(value || "").replace(/\D+/g, "")
}

function normalizeMentionJid(value = "", options = {}) {
  const defaultServer = String(options.defaultServer || DEFAULT_MENTION_SERVER).trim().toLowerCase() || DEFAULT_MENTION_SERVER
  const raw = String(value || "").trim()
  if (!raw) return ""

  const atIndex = raw.lastIndexOf("@")
  let userPart = atIndex >= 0 ? raw.slice(0, atIndex) : raw
  let serverPart = atIndex >= 0 ? raw.slice(atIndex + 1) : defaultServer

  userPart = String(userPart || "").trim().split(":")[0]
  const digits = extractDigits(userPart)
  if (!digits) return ""

  serverPart = String(serverPart || "").trim().toLowerCase()
  if (!serverPart || serverPart === "c.us") {
    serverPart = defaultServer
  }
  if (serverPart === "lid") {
    return `${digits}@lid`
  }
  if (!serverPart.includes("whatsapp.net")) {
    serverPart = defaultServer
  }

  return `${digits}@${serverPart}`
}

function getMentionHandleFromJid(jid = "") {
  const normalized = normalizeMentionJid(jid)
  if (!normalized) return ""
  return normalized.split("@")[0]
}

function normalizeMentionArray(rawMentions = [], options = {}) {
  const source = Array.isArray(rawMentions) ? rawMentions : [rawMentions]
  const normalizedMentions = []
  const seen = new Set()

  for (const candidate of source) {
    const normalized = normalizeMentionJid(candidate, options)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    normalizedMentions.push(normalized)
  }

  return normalizedMentions
}

function extractMentionHandlesFromText(text = "") {
  const handles = []
  const seen = new Set()
  const source = String(text || "")
  const mentionPattern = /@([+()\-\s\d]{4,})/g
  let match

  while ((match = mentionPattern.exec(source)) !== null) {
    const digits = extractDigits(match[1])
    if (!digits || seen.has(digits)) continue
    seen.add(digits)
    handles.push(digits)
  }

  return handles
}

async function applyMentionSafetyToMessage(messageContent = {}, options = {}) {
  if (!messageContent || typeof messageContent !== "object") return messageContent

  const prepared = { ...messageContent }
  const finalMentions = []
  const seenMentions = new Set()

  const pushMention = (jid) => {
    const normalized = normalizeMentionJid(jid, options)
    if (!normalized || seenMentions.has(normalized)) return
    seenMentions.add(normalized)
    finalMentions.push(normalized)
  }

  const existingMentions = normalizeMentionArray(prepared.mentions || [], options)
  existingMentions.forEach(pushMention)

  const handlesInText = new Set()
  if (typeof prepared.text === "string") {
    extractMentionHandlesFromText(prepared.text).forEach((handle) => handlesInText.add(handle))
  }
  if (typeof prepared.caption === "string") {
    extractMentionHandlesFromText(prepared.caption).forEach((handle) => handlesInText.add(handle))
  }

  const resolveMentionByHandle = typeof options.resolveMentionByHandle === "function"
    ? options.resolveMentionByHandle
    : null

  for (const handle of handlesInText) {
    const alreadyPresent = finalMentions.some((jid) => getMentionHandleFromJid(jid) === handle)
    if (alreadyPresent) continue

    let resolvedJid = ""
    if (resolveMentionByHandle) {
      resolvedJid = await resolveMentionByHandle(handle, prepared)
    }

    if (!resolvedJid) {
      resolvedJid = `${handle}@${DEFAULT_MENTION_SERVER}`
    }

    pushMention(resolvedJid)
  }

  if (finalMentions.length > 0) {
    prepared.mentions = finalMentions
  } else if (Object.prototype.hasOwnProperty.call(prepared, "mentions")) {
    delete prepared.mentions
  }

  return prepared
}

function getFirstMentionedJid(contextInfo = {}, options = {}) {
  const mentions = normalizeMentionArray(contextInfo?.mentionedJid || [], options)
  return mentions[0] || ""
}

module.exports = {
  normalizeMentionJid,
  normalizeMentionArray,
  extractMentionHandlesFromText,
  applyMentionSafetyToMessage,
  getFirstMentionedJid,
  getMentionHandleFromJid,
}
