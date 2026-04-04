const { normalizeMentionArray, getMentionHandleFromJid, formatMentionTag } = require("./mentionService")
const crypto = require("crypto")
const { downloadMediaMessage } = require("@whiskeysockets/baileys")
const storage = require("../storage")
const economyService = require("./economyService")
const telemetry = require("./telemetryService")

const LETTER_ALPHABET = "abcdefghijklmnopqrstuvwxyz"
const WORD_LIST_POOL = [
  "cachorro",
  "gato",
  "programador",
  "computador",
  "telefone",
  "internet",
  "mensagem",
  "diversao",
  "amigo",
  "familia",
  "trabalho",
  "escola",
  "carro",
  "moto",
  "bicicleta",
  "livro",
  "filme",
  "musica",
  "danca",
  "esporte",
]
const REPOST_REACTION_EMOJIS = ["🍆", "🔥", "🔞", "🤤", "😈"]
const LETTER_DUMP_STATE_KEY = "letterDumpDetector"
const LETTER_DUMP_WHITELIST = new Set(["a", "i", "k", "q"])

function getPunishmentChoiceFromText(text = "") {
  const cleaned = text.toLowerCase().trim()
  const match = cleaned.match(/(?:^|\s)(1[0-3]|[1-9])(?:\s|$)/)
  if (match?.[1]) return match[1]
  return null
}

function getRandomPunishmentChoice() {
  const choices = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13"]
  return choices[crypto.randomInt(0, choices.length)]
}

function normalizePunishmentId(value = "") {
  const parsed = Number.parseInt(String(value || "").trim(), 10)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 13) return ""
  return String(parsed)
}

function getLinear15xSeverityScale(severityMultiplier = 1) {
  const level = Math.max(1, Math.floor(Number(severityMultiplier) || 1))
  return 1 + (level - 1) * 0.5
}

function getPunishmentNameById(punishmentId) {
  const normalizedId = normalizePunishmentId(punishmentId)
  if (normalizedId === "1") return "máx. 5 caracteres"
  if (normalizedId === "2") return "1 mensagem/20s"
  if (normalizedId === "3") return "bloqueio por 2 letras (indefinido)"
  if (normalizedId === "4") return "somente emojis e figurinhas"
  if (normalizedId === "5") return "mute total"
  if (normalizedId === "6") return "sem vogais"
  if (normalizedId === "7") return "prefixo obrigatório"
  if (normalizedId === "8") return "palavras da lista"
  if (normalizedId === "9") return "somente caixa alta"
  if (normalizedId === "10") return "repost pelo bot"
  if (normalizedId === "11") return "reação sugestiva"
  if (normalizedId === "12") return "chance de apagar"
  if (normalizedId === "13") return "máx. 3 palavras"
  return "desconhecida"
}

function getPunishmentMenuText() {
  return [
    "Escolha a punição digitando um número de *1* a *13*:",
    "1. Mensagens com no máximo 5 caracteres por 5 minutos.",
    "2. Máximo de 1 mensagem a cada 20 segundos por 10 minutos.",
    "3. Bloqueio por letras aleatórias (indefinido até enviar UMA mensagem contendo TODAS as letras bloqueadas; só letras bloqueadas + espaços/quebras de linha são aceitos).",
    "4. Só pode enviar emojis e figurinhas por 5 minutos.",
    "5. Mute total por 5 minutos (tudo que enviar será apagado).",
    "6. Sem vogais por 5 minutos (severidade escala tempo em 1.5x).",
    "7. Toda mensagem deve começar com \"🚨URGENTE:\" por 5 minutos, EXATAMENTE como está entre aspas. (severidade escala tempo em 1.5x).",
    "8. Mensagem deve conter palavras da lista por 5 minutos (severidade escala tempo em 1.5x e quantidade +1 por nível).",
    "9. Mensagens em caixa alta por 10 minutos (severidade adiciona +2 minutos por nível).",
    "10. Mensagens são apagadas e repostadas pelo bot por 5 minutos (severidade não escala).",
    "11. Mensagens recebem reação sugestiva por 5 minutos (severidade escala tempo em 1.5x).",
    "12. Chance de apagar mensagens por 1 hora (20% base, +5% por nível).",
    "13. Máximo de 3 palavras por 5 minutos (severidade adiciona +2 minutos por nível)."
  ].join("\n")
}

function getPunishmentDetailsText() {
  return [
    "📚 Lista detalhada de punições (1-13)",
    "",
    "1. Máx. 5 caracteres",
    "- Regra: mensagem com mais de 5 caracteres é apagada.",
    "- Duração: 5 minutos x severidade.",
    "",
    "2. 1 mensagem a cada 20s",
    "- Regra: se enviar antes do intervalo, apaga.",
    "- Duração: 10 minutos x severidade.",
    "",
    "3. Bloqueio de letras",
    "- Regra: só passa UMA mensagem contendo todas as letras bloqueadas (ao menos 1x cada), aceitando apenas essas letras + espaços/quebras de linha.",
    "- Se faltar letra ou tiver qualquer caractere extra, a mensagem é apagada.",
    "- Escala: +1 letra proibida por severidade.",
    "- Término: indefinido, encerra ao cumprir condição de saída.",
    "",
    "4. Só emojis/figurinhas",
    "- Regra: texto fora de emoji/sticker é apagado.",
    "- Duração: 5 minutos x severidade.",
    "",
    "5. Mute total",
    "- Regra: toda mensagem é apagada.",
    "- Duração: 5 minutos x severidade.",
    "",
    "6. Sem vogais",
    "- Regra: mensagem com vogal é apagada.",
    "- Duração: 5 minutos, escala x1.5 por severidade.",
    "",
    "7. Prefixo obrigatório",
    "- Regra: mensagem sem início em \"🚨URGENTE:\" é apagada. O início deve ser exatamente como descrito.",
    "- Duração: 5 minutos, escala x1.5 por severidade.",
    "",
    "8. Palavra(s) da lista",
    "- Regra: precisa conter palavra(s) sorteada(s) da lista.",
    "- Escala: tempo x1.5 e +1 palavra exigida por severidade.",
    "- Base de tempo: 5 minutos.",
    "",
    "9. Caixa alta",
    "- Regra: texto com letras minúsculas é apagado.",
    "- Duração: 10 minutos +2 minutos por severidade.",
    "",
    "10. Apaga e reposta",
    "- Regra: bot apaga e reposta texto/mídia (quando possível).",
    "- Duração: 5 minutos.",
    "- Escala: não escala com severidade.",
    "",
    "11. Reação sugestiva",
    "- Regra: bot reage com emoji sugestivo nas mensagens.",
    "- Duração: 5 minutos, escala x1.5 por severidade.",
    "",
    "12. Chance de apagar",
    "- Regra: mensagem pode ser apagada aleatoriamente.",
    "- Duração: 1 hora.",
    "- Chance: 20% base +5% por severidade.",
    "",
    "13. Máx. 3 palavras (anti-bypass)",
    "- Regra: mais de 3 tokens (inclui separação por símbolos/espaços) é apagado.",
    "- Duração: 5 minutos +2 minutos por severidade.",
  ].join("\n")
}

function getRandomDifferentLetters(total = 2) {
  const amount = Math.max(2, Math.floor(Number(total) || 2))
  const source = LETTER_ALPHABET.split("")
  const picked = []
  while (picked.length < amount && source.length > 0) {
    const index = crypto.randomInt(0, source.length)
    const [letter] = source.splice(index, 1)
    picked.push(letter)
  }
  return picked
}

function getRandomWordList(requiredCount = 1) {
  const amount = Math.max(1, Math.floor(Number(requiredCount) || 1))
  const source = [...WORD_LIST_POOL]
  const picked = []
  while (picked.length < amount && source.length > 0) {
    const index = crypto.randomInt(0, source.length)
    const [word] = source.splice(index, 1)
    picked.push(word)
  }
  return picked
}

function stripWhitespaceExceptSpace(text = "") {
  return text.replace(/[\t\n\r\f\v\u00A0\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, "")
}

function isEmojiOnlyMessage(text = "") {
  const compact = text.replace(/\s+/g, "")
  if (!compact) return false
  const emojiCluster = /^(?:\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*)+$/u
  return emojiCluster.test(compact)
}

function isStickerMessage(msg = null) {
  return Boolean(msg?.message?.stickerMessage)
}

function isUnlockLettersMessage(text = "", letters = []) {
  const requiredLetters = [...new Set((letters || [])
    .map((letter) => String(letter || "").trim().toLowerCase())
    .filter((letter) => /^[a-z]$/.test(letter))
  )]
  if (!requiredLetters.length) return false

  const raw = String(text || "").toLowerCase()
  if (!raw.trim()) return false

  const seen = new Set()
  for (const ch of raw) {
    if (/\s/.test(ch)) continue
    if (!requiredLetters.includes(ch)) return false
    seen.add(ch)
  }

  return requiredLetters.every((letter) => seen.has(letter))
}

function countWordTokensStrict(text = "") {
  const normalized = String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
  const tokens = normalized.match(/[a-z0-9]+/g) || []
  return tokens.length
}

function containsWordListTerms(text = "", words = [], minRequired = 1) {
  if (!words.length) return true
  const normalized = String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
  const tokenSet = new Set(normalized.match(/[a-z0-9]+/g) || [])
  let hits = 0
  for (const word of words) {
    if (tokenSet.has(word)) hits++
  }
  return hits >= Math.max(1, Math.floor(Number(minRequired) || 1))
}

function hasLetters(text = "") {
  return /[a-z]/i.test(String(text || ""))
}

function isSingleLetterMessage(text = "") {
  const normalized = String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
  return /^[a-z]$/.test(normalized) ? normalized : ""
}

function matchesUrgentPrefix(text = "", requiredPrefix = "🚨URGENTE:") {
  const raw = String(text || "")
  const trimmedStart = raw.trimStart()
  if (!trimmedStart) return false

  // Keep strict support for configured prefix, but accept small user-input variations.
  const strictPrefix = String(requiredPrefix || "🚨URGENTE:").trim()
  if (strictPrefix && trimmedStart.startsWith(strictPrefix)) return true

  return /^(?:🚨\s*)?urgente\s*:?\s*/i.test(trimmedStart)
}

function getResendText(msg, text = "") {
  const trimmed = String(text || "").trim()
  if (trimmed) return trimmed
  if (msg?.message?.stickerMessage) return "[figurinhas não podem ser reenviadas pelo bot]"
  if (msg?.message?.imageMessage) return "[imagens não podem ser reenviadas pelo bot]"
  if (msg?.message?.videoMessage) return "[vídeos não podem ser reenviados pelo bot]"
  if (msg?.message?.audioMessage) return "[áudios não podem ser reenviados pelo bot]"
  return "[mensagem reenviada pelo bot]"
}

async function resendPunishedContent(sock, from, sender, msg, text = "") {
  const mentionTag = `${formatMentionTag(sender)}`
  const resendPrefix = `📢 Repost de ${mentionTag}: `

  const sendFallbackText = async () => {
    const resendText = getResendText(msg, text)
    await sock.sendMessage(from, {
      text: `${resendPrefix}${resendText}`,
      mentions: normalizeMentionArray([sender]),
    })
  }

  try {
    if (msg?.message?.stickerMessage) {
      const stickerBuffer = await downloadMediaMessage(msg, "buffer", {}, {})
      await sock.sendMessage(from, { sticker: stickerBuffer })
      await sock.sendMessage(from, {
        text: `${resendPrefix}[figurinha reenviada pelo bot]`,
        mentions: normalizeMentionArray([sender]),
      })
      return
    }

    if (msg?.message?.imageMessage) {
      const imageBuffer = await downloadMediaMessage(msg, "buffer", {}, {})
      await sock.sendMessage(from, {
        image: imageBuffer,
        caption: `${resendPrefix}${getResendText(msg, text)}`,
        mentions: normalizeMentionArray([sender]),
      })
      return
    }

    if (msg?.message?.videoMessage) {
      const videoBuffer = await downloadMediaMessage(msg, "buffer", {}, {})
      await sock.sendMessage(from, {
        video: videoBuffer,
        caption: `${resendPrefix}${getResendText(msg, text)}`,
        mentions: normalizeMentionArray([sender]),
      })
      return
    }

    if (msg?.message?.audioMessage) {
      const audioBuffer = await downloadMediaMessage(msg, "buffer", {}, {})
      await sock.sendMessage(from, {
        audio: audioBuffer,
        mimetype: "audio/ogg; codecs=opus",
        ptt: Boolean(msg?.message?.audioMessage?.ptt),
      })
      await sock.sendMessage(from, {
        text: `${resendPrefix}[audio reenviado pelo bot]`,
        mentions: normalizeMentionArray([sender]),
      })
      return
    }
  } catch (e) {
    console.error("Erro ao reenviar mídia na punição 10", e)
  }

  await sendFallbackText()
}

function normalizeUserId(value = "") {
  const raw = String(value || "").trim()
  if (!raw) return ""
  const lowered = raw.toLowerCase()
  const jidMatch = lowered.match(/^([^@\s:]+)(?::\d+)?@([^@\s]+)$/)
  if (jidMatch) {
    return `${jidMatch[1]}@${jidMatch[2]}`
  }
  return lowered
}

function buildUserIdentityAliases(value = "") {
  const normalized = normalizeUserId(value)
  if (!normalized) return []

  const aliases = new Set([normalized])
  const userPart = normalized.includes("@") ? getMentionHandleFromJid(normalized) : normalized
  if (userPart) {
    aliases.add(userPart)
    aliases.add(`${userPart}@s.whatsapp.net`)
    aliases.add(`${userPart}@lid`)
  }

  return Array.from(aliases).filter(Boolean)
}

function identitiesMatch(left = "", right = "") {
  const leftAliases = new Set(buildUserIdentityAliases(left))
  if (leftAliases.size === 0) return false
  const rightAliases = buildUserIdentityAliases(right)
  return rightAliases.some((alias) => leftAliases.has(alias))
}

function findMatchingUserKey(map = {}, userId = "") {
  if (!map || typeof map !== "object") return ""
  const normalized = normalizeUserId(userId)
  if (normalized && Object.prototype.hasOwnProperty.call(map, normalized)) {
    return normalized
  }

  const targetAliases = new Set(buildUserIdentityAliases(userId))
  if (targetAliases.size === 0) return ""

  for (const key of Object.keys(map)) {
    const keyAliases = buildUserIdentityAliases(key)
    if (keyAliases.some((alias) => targetAliases.has(alias))) {
      return key
    }
  }

  return ""
}

function clearPendingPunishment(groupId, playerId) {
  console.log("[punishment] clearPendingPunishment called", { groupId, playerId })
  const coinPunishmentPending = storage.getCoinPunishmentPending()
  if (!coinPunishmentPending[groupId]?.[playerId]) {
    console.log("[punishment] clearPendingPunishment - no pending punishment found", { groupId, playerId })
    return
  }
  console.log("[punishment] clearPendingPunishment - clearing", { groupId, playerId, pending: coinPunishmentPending[groupId][playerId] })
  delete coinPunishmentPending[groupId][playerId]
  if (Object.keys(coinPunishmentPending[groupId]).length === 0) delete coinPunishmentPending[groupId]
  storage.setCoinPunishmentPending(coinPunishmentPending)
  console.log("[punishment] clearPendingPunishment - cleared successfully", { groupId, playerId })
}

function clearPunishment(groupId, userId) {
  const normalizedUser = normalizeUserId(userId) || String(userId || "")
  console.log("[punishment] clearPunishment called", { groupId, userId, normalizedUser })
  const activePunishments = storage.getActivePunishments()
  const groupPunishments = activePunishments[groupId]
  const matchedKey = findMatchingUserKey(groupPunishments, normalizedUser)
  if (!matchedKey) {
    console.log("[punishment] clearPunishment - no active punishment found", { groupId, normalizedUser })
    return
  }
  console.log("[punishment] clearPunishment - found punishment to clear", {
    groupId,
    normalizedUser,
    matchedKey,
    punishment: groupPunishments[matchedKey],
  })
  const timerId = groupPunishments[matchedKey]?.timerId
  if (timerId) {
    console.log("[punishment] clearPunishment - clearing timeout", { timerId })
    clearTimeout(timerId)
  }
  delete groupPunishments[matchedKey]
  if (Object.keys(groupPunishments).length === 0) {
    delete activePunishments[groupId]
  }
  storage.setActivePunishments(activePunishments)
  console.log("[punishment] clearPunishment - cleared successfully", { groupId, normalizedUser, matchedKey })
}

async function applyPunishment(sock, groupId, userId, punishmentId, options = {}) {
  console.log("[punishment] applyPunishment START", { groupId, userId, punishmentId, origin: options?.origin })
  const origin = options?.origin || "admin"
  const normalizedTarget = normalizeUserId(userId)
  const targetUserId = normalizedTarget || String(userId || "")
  const normalizedPunishmentId = normalizePunishmentId(punishmentId)
  const normalizedBot = normalizeUserId(options?.botUserId || sock?.user?.id || "")
  console.log("[punishment] applyPunishment - normalized values", { targetUserId, normalizedPunishmentId, normalizedBot })
  if (!targetUserId) {
    console.log("[punishment] applyPunishment BLOCKED - invalid target", { userId, reason: "invalid-target" })
    telemetry.incrementCounter("punishment.blocked", 1, {
      origin,
      reason: "invalid-target",
      punishmentId: String(punishmentId || ""),
    })
    telemetry.appendEvent("punishment.blocked", {
      groupId,
      userId,
      origin,
      punishmentId,
      reason: "invalid-target",
    })
    return { blocked: true, reason: "invalid-target" }
  }
  if (!normalizedPunishmentId) {
    console.log("[punishment] applyPunishment BLOCKED - invalid punishment id", { punishmentId, reason: "invalid-id" })
    telemetry.incrementCounter("punishment.blocked", 1, {
      origin,
      reason: "invalid-id",
      punishmentId: String(punishmentId || ""),
    })
    telemetry.appendEvent("punishment.blocked", {
      groupId,
      userId,
      origin,
      punishmentId,
      reason: "invalid-id",
    })
    return { blocked: true, reason: "invalid-id" }
  }
  if (identitiesMatch(normalizedTarget, normalizedBot)) {
    console.log("[punishment] applyPunishment BLOCKED - bot cannot be punished", { reason: "bot-target" })
    telemetry.incrementCounter("punishment.blocked", 1, {
      origin,
      reason: "bot-target",
      punishmentId: normalizedPunishmentId,
    })
    telemetry.appendEvent("punishment.blocked", {
      groupId,
      userId,
      origin,
      punishmentId,
      reason: "bot-target",
    })
    await sock.sendMessage(groupId, {
      text: "🤖 O bot não pode receber punições.",
    })
    return { blocked: true, reason: "bot-target" }
  }

  if (origin !== "admin") {
    console.log("[punishment] applyPunishment - checking shield", { targetUserId, origin })
    const blocked = economyService.consumeShield(targetUserId)
    console.log("[punishment] applyPunishment - shield check result", { blocked })
    if (blocked) {
      console.log("[punishment] applyPunishment BLOCKED - shield active", { targetUserId, reason: "shield" })
      telemetry.incrementCounter("punishment.blocked", 1, {
        origin,
        reason: "shield",
        punishmentId: String(punishmentId || ""),
      })
      telemetry.appendEvent("punishment.blocked", {
        groupId,
        userId,
        origin,
        punishmentId,
        reason: "shield",
      })
      await sock.sendMessage(groupId, {
        text: `🛡️ ${formatMentionTag(targetUserId)} bloqueou a punição com escudo!`,
        mentions: normalizeMentionArray([targetUserId]),
      })
      return { blockedByShield: true }
    }
  }

  const severityMultiplierRaw = Number(options?.severityMultiplier || 1)
  const severityMultiplier = Number.isFinite(severityMultiplierRaw) && severityMultiplierRaw > 1
    ? Math.floor(severityMultiplierRaw)
    : 1
  const activePunishments = storage.getActivePunishments()
  if (!activePunishments[groupId]) activePunishments[groupId] = {}
  clearPunishment(groupId, targetUserId)
  if (!activePunishments[groupId]) activePunishments[groupId] = {}

  const mentionTag = `${formatMentionTag(targetUserId)}`
  const now = Date.now()
  let punishmentState = null
  let warningText = ""

  if (normalizedPunishmentId === "1") {
    const durationMs = 5 * 60_000 * severityMultiplier
    punishmentState = {
      type: "max5chars",
      endsAt: now + durationMs
    }
    warningText = `${mentionTag}, punição ativada: suas mensagens só podem ter até *5 caracteres* por *${Math.floor(durationMs / 60_000)} minutos* (espaço conta). Mensagens fora disso serão apagadas.`
  }

  if (normalizedPunishmentId === "2") {
    const durationMs = 10 * 60_000 * severityMultiplier
    punishmentState = {
      type: "rate20s",
      endsAt: now + durationMs,
      lastAllowedAt: 0
    }
    warningText = `${mentionTag}, punição ativada: você só pode enviar *1 mensagem a cada 20 segundos* por *${Math.floor(durationMs / 60_000)} minutos*. Mensagens acima da taxa serão apagadas.`
  }

  if (normalizedPunishmentId === "3") {
    const letters = getRandomDifferentLetters(severityMultiplier + 1)
    const uppercaseLetters = letters.map((letter) => letter.toUpperCase())
    const lettersLabel = uppercaseLetters.join(" / ")
    const compactExample = uppercaseLetters.join("")
    const spacedExample = uppercaseLetters.join(" ")
    const lineBreakExample = uppercaseLetters.length > 1
      ? `${uppercaseLetters[0]}\n${uppercaseLetters.slice(1).join("")}`
      : uppercaseLetters[0]
    const invalidChar = LETTER_ALPHABET
      .split("")
      .find((ch) => !letters.includes(ch))
      ?.toUpperCase() || "B"
    const invalidExample = uppercaseLetters.length > 1
      ? `${uppercaseLetters[0]} ${invalidChar}${uppercaseLetters.slice(1).join("")}`
      : `${uppercaseLetters[0]}${invalidChar}`

    punishmentState = {
      type: "lettersBlock",
      letters
    }
    warningText = `${mentionTag}, punição ativada: letras bloqueadas *${lettersLabel}* (indefinido). Para sair, envie *UMA* mensagem que contenha *todas* essas letras (pelo menos 1x cada), usando apenas essas letras + espaços/quebras de linha. Se faltar 1 letra ou tiver qualquer caractere extra, a mensagem é apagada. Exemplos válidos: "${spacedExample}", "${compactExample}", "${lineBreakExample}". Exemplo inválido: "${invalidExample}".`
  }

  if (normalizedPunishmentId === "4") {
    const durationMs = 5 * 60_000 * severityMultiplier
    punishmentState = {
      type: "emojiOnly",
      endsAt: now + durationMs
    }
    warningText = `${mentionTag}, punição ativada: por *${Math.floor(durationMs / 60_000)} minutos* você só pode enviar mensagens formadas por emojis ou figurinhas. Qualquer mensagem com texto fora desse formato será apagada.`
  }

  if (normalizedPunishmentId === "5") {
    const durationMs = 5 * 60_000 * severityMultiplier
    punishmentState = {
      type: "mute5m",
      endsAt: now + durationMs
    }
    warningText = `${mentionTag}, punição ativada: *mute total por ${Math.floor(durationMs / 60_000)} minutos*. Qualquer mensagem sua será apagada.`
  }

  if (normalizedPunishmentId === "6") {
    const durationMs = Math.ceil(5 * 60_000 * getLinear15xSeverityScale(severityMultiplier))
    punishmentState = {
      type: "noVowels",
      endsAt: now + durationMs,
    }
    warningText = `${mentionTag}, punição ativada: sem vogais por *${Math.ceil(durationMs / 60_000)} minutos*. Mensagens com vogais serão apagadas.`
  }

  if (normalizedPunishmentId === "7") {
    const durationMs = Math.ceil(5 * 60_000 * getLinear15xSeverityScale(severityMultiplier))
    punishmentState = {
      type: "urgentPrefix",
      endsAt: now + durationMs,
      requiredPrefix: "🚨URGENTE:",
    }
    warningText = `${mentionTag}, punição ativada: por *${Math.ceil(durationMs / 60_000)} minutos* toda mensagem deve começar com *🚨URGENTE:* (deve ser EXATAMENTE como descrito).`
  }

  if (normalizedPunishmentId === "8") {
    const durationMs = Math.ceil(5 * 60_000 * getLinear15xSeverityScale(severityMultiplier))
    const requiredWordsCount = Math.max(1, severityMultiplier)
    const wordList = getRandomWordList(requiredWordsCount)
    punishmentState = {
      type: "wordListRequired",
      endsAt: now + durationMs,
      wordList,
      minRequiredWords: requiredWordsCount,
    }
    warningText = `${mentionTag}, punição ativada: por *${Math.ceil(durationMs / 60_000)} minutos* cada mensagem deve conter pelo menos *${requiredWordsCount}* palavra(s) desta lista: ${wordList.join(", ")}.`
  }

  if (normalizedPunishmentId === "9") {
    const durationMin = 10 + (Math.max(1, severityMultiplier) - 1) * 2
    const durationMs = durationMin * 60_000
    punishmentState = {
      type: "allCaps",
      endsAt: now + durationMs,
    }
    warningText = `${mentionTag}, punição ativada: por *${durationMin} minutos* toda mensagem deve estar em CAIXA ALTA.`
  }

  if (normalizedPunishmentId === "10") {
    const durationMs = 5 * 60_000
    punishmentState = {
      type: "deleteAndRepost",
      endsAt: now + durationMs,
    }
    warningText = `${mentionTag}, punição ativada: por *5 minutos* suas mensagens serão apagadas e repostadas pelo bot.`
  }

  if (normalizedPunishmentId === "11") {
    const durationMs = Math.ceil(5 * 60_000 * getLinear15xSeverityScale(severityMultiplier))
    punishmentState = {
      type: "sexualReaction",
      endsAt: now + durationMs,
    }
    warningText = `${mentionTag}, punição ativada: por *${Math.ceil(durationMs / 60_000)} minutos* suas mensagens receberão reações sugestivas.`
  }

  if (normalizedPunishmentId === "12") {
    const durationMs = 60 * 60_000
    const deleteChance = Math.min(1, (20 + (Math.max(1, severityMultiplier) - 1) * 5) / 100)
    punishmentState = {
      type: "randomDeleteChance",
      endsAt: now + durationMs,
      deleteChance,
    }
    warningText = `${mentionTag}, punição ativada: por *60 minutos* suas mensagens têm *${Math.ceil(deleteChance * 100)}%* de chance de serem apagadas.`
  }

  if (normalizedPunishmentId === "13") {
    const durationMin = 5 + (Math.max(1, severityMultiplier) - 1) * 2
    const durationMs = durationMin * 60_000
    punishmentState = {
      type: "max3wordsStrict",
      endsAt: now + durationMs,
    }
    warningText = `${mentionTag}, punição ativada: por *${durationMin} minutos* você pode enviar no máximo *3 palavras* por mensagem.`
  }

  if (!punishmentState) return

  activePunishments[groupId][targetUserId] = punishmentState

  if (punishmentState?.endsAt) {
    const msRemaining = Math.max(0, punishmentState.endsAt - now)
    const timerId = setTimeout(() => {
      clearPunishment(groupId, targetUserId)
      sock.sendMessage(groupId, {
        text: `${formatMentionTag(targetUserId)}, sua punição expirou.`,
        mentions: normalizeMentionArray([targetUserId]),
      }).catch(() => {})
    }, msRemaining)
    activePunishments[groupId][targetUserId].timerId = timerId
  }

  storage.setActivePunishments(activePunishments)
  console.log("[punishment] applyPunishment - punishment state stored", { targetUserId, punishmentType: punishmentState?.type, endsAt: punishmentState?.endsAt })

  telemetry.incrementCounter("punishment.applied", 1, {
    origin,
    punishmentId: normalizedPunishmentId,
  })
  telemetry.appendEvent("punishment.applied", {
    groupId,
    userId,
    origin,
    punishmentId: normalizedPunishmentId,
    severityMultiplier,
    timed: Boolean(punishmentState?.endsAt),
  })
  economyService.incrementStat(targetUserId, "punishmentsReceivedTotal", 1)
  if (origin === "admin") {
    economyService.incrementStat(targetUserId, "punishmentsReceivedAdmin", 1)
  } else {
    economyService.incrementStat(targetUserId, "punishmentsReceivedGame", 1)
  }

  console.log("[punishment] applyPunishment - sending warning message", { groupId, targetUserId })
  await sock.sendMessage(groupId, {
    text: warningText,
    mentions: normalizeMentionArray([targetUserId])
  })
  console.log("[punishment] applyPunishment COMPLETE", { groupId, targetUserId, normalizedPunishmentId })
}

async function handlePunishmentEnforcement(sock, msg, from, sender, text, isGroup, skipForCommand = false, botIsAdmin = true) {
  console.log("[punishment] handlePunishmentEnforcement START", { from, sender, textLength: text?.length, skipForCommand, botIsAdmin })
  if (!isGroup) {
    console.log("[punishment] handlePunishmentEnforcement - not a group, skipping")
    return false
  }
  if (skipForCommand) {
    console.log("[punishment] handlePunishmentEnforcement - command skip active")
    return false
  }

  // Phase 8 kickoff: anti letter-dump detection (4-5 sequential single-letter attempts)
  const singleLetter = isSingleLetterMessage(text)
  const senderId = normalizeUserId(sender) || String(sender || "")

  if (singleLetter && !LETTER_DUMP_WHITELIST.has(singleLetter)) {
    const dumpState = storage.getGameState(from, LETTER_DUMP_STATE_KEY) || {}
    const current = dumpState[senderId] && typeof dumpState[senderId] === "object"
      ? dumpState[senderId]
      : { sequence: [], offenseCount: 0, lastOffenseAt: 0 }
    const now = Date.now()
    current.sequence = (Array.isArray(current.sequence) ? current.sequence : []).filter((ts) => now - ts <= 30_000)
    current.sequence.push(now)

    if (current.sequence.length >= 4) {
      if (now - (Number(current.lastOffenseAt) || 0) > 60 * 60 * 1000) {
        current.offenseCount = 0
      }
      current.offenseCount += 1
      current.lastOffenseAt = now
      current.sequence = []

      const activePunishments = storage.getActivePunishments()
      if (!activePunishments[from]) activePunishments[from] = {}

      if (current.offenseCount >= 3) {
        activePunishments[from][senderId] = {
          type: "mute5m",
          endsAt: now + (5 * 60 * 1000),
        }
        economyService.debitCoinsFlexible(senderId, 50, {
          type: "anti-letter-dump-fine",
          details: "Multa por spam de letras",
          meta: { groupId: from },
        })
        await sock.sendMessage(from, {
          text: `❌ Spam detectado ${formatMentionTag(senderId)}. 3ª ocorrência: mute de 5 minutos + multa de 50 moedas.`,
          mentions: normalizeMentionArray([senderId]),
        })
      } else if (current.offenseCount >= 2) {
        activePunishments[from][senderId] = {
          type: "mute5m",
          endsAt: now + 60_000,
        }
        await sock.sendMessage(from, {
          text: `❌ Spam detectado ${formatMentionTag(senderId)}. 2ª ocorrência: mute temporário de 1 minuto.`,
          mentions: normalizeMentionArray([senderId]),
        })
      } else {
        await sock.sendMessage(from, {
          text: `❌ Spam detectado ${formatMentionTag(senderId)}. Evite flood de letras isoladas.`,
          mentions: normalizeMentionArray([senderId]),
        })
      }

      storage.setActivePunishments(activePunishments)
      dumpState[senderId] = current
      storage.setGameState(from, LETTER_DUMP_STATE_KEY, dumpState)
      return true
    }

    dumpState[senderId] = current
    storage.setGameState(from, LETTER_DUMP_STATE_KEY, dumpState)
  }

  const activePunishments = storage.getActivePunishments()
  console.log("[punishment] handlePunishmentEnforcement - loaded active punishments", { groupId: from, punishedUserCount: Object.keys(activePunishments[from] || {}).length })
  const groupPunishments = activePunishments[from] || {}
  const matchedKey = findMatchingUserKey(groupPunishments, senderId)
  const punishment = matchedKey ? groupPunishments[matchedKey] : null
  if (!punishment) {
    console.log("[punishment] handlePunishmentEnforcement - no active punishment for this user")
    return false
  }

  if (matchedKey !== senderId && !groupPunishments[senderId]) {
    // Lazy migration keeps future lookups consistent even if old keys were stored as @lid/@s variants.
    groupPunishments[senderId] = punishment
    delete groupPunishments[matchedKey]
    storage.setActivePunishments(activePunishments)
  }

  console.log("[punishment] handlePunishmentEnforcement - found active punishment", {
    senderId,
    matchedKey,
    punishmentType: punishment.type,
    endsAt: punishment.endsAt,
  })
  const now = Date.now()
  if (punishment.endsAt && now >= punishment.endsAt) {
    console.log("[punishment] handlePunishmentEnforcement - punishment expired", { senderId, endsAt: punishment.endsAt, now })
    clearPunishment(from, senderId)
    await sock.sendMessage(from, {
      text: `${formatMentionTag(senderId)}, sua punição expirou.`,
      mentions: normalizeMentionArray([senderId]),
    })
    return false
  }

  let shouldDelete = false

  if (punishment.type === "max5chars") {
    const measured = stripWhitespaceExceptSpace(text)
    shouldDelete = measured.length > 5
    console.log("[punishment] handlePunishmentEnforcement - max5chars check", { senderId, textLength: measured.length, shouldDelete })
  }

  if (punishment.type === "rate20s") {
    console.log("[punishment] handlePunishmentEnforcement - rate20s check", { senderId, lastAllowed: punishment.lastAllowedAt, now, msSince: now - punishment.lastAllowedAt })
    if (punishment.lastAllowedAt && now - punishment.lastAllowedAt < 20_000) {
      shouldDelete = true
      console.log("[punishment] handlePunishmentEnforcement - rate20s - TOO FAST, should delete")
    } else {
      punishment.lastAllowedAt = now
      storage.setActivePunishments(activePunishments)
      console.log("[punishment] handlePunishmentEnforcement - rate20s - allowed, updated lastAllowedAt")
    }
  }

  if (punishment.type === "lettersBlock") {
    const letters = punishment.letters || []
    console.log("[punishment] handlePunishmentEnforcement - lettersBlock check", { senderId, blockedLetters: letters })
    if (isUnlockLettersMessage(text, letters)) {
      const lettersLabel = letters.length > 0 ? letters.join(" / ") : "(sem letras)"
      console.log("[punishment] handlePunishmentEnforcement - lettersBlock - UNLOCK condition met!", { senderId, letters: lettersLabel })
      clearPunishment(from, senderId)
      await sock.sendMessage(from, {
        text: `${formatMentionTag(senderId)}, você cumpriu a condição e foi liberado da punição das letras (${lettersLabel}).`,
        mentions: normalizeMentionArray([senderId])
      })
      return false
    }
    shouldDelete = true
    console.log("[punishment] handlePunishmentEnforcement - lettersBlock - invalid unlock message, deleting")
  }

  if (punishment.type === "emojiOnly") {
    const isEmoji = isEmojiOnlyMessage(text)
    const hasSticker = isStickerMessage(msg)
    shouldDelete = !isEmoji && !hasSticker
    console.log("[punishment] handlePunishmentEnforcement - emojiOnly check", { senderId, isEmoji, hasSticker, shouldDelete })
  }

  if (punishment.type === "mute5m") {
    shouldDelete = true
    console.log("[punishment] handlePunishmentEnforcement - mute5m - deleting all messages")
  }

  if (punishment.type === "noVowels") {
    const hasVowels = /[aeiouáàâãéèêíìîóòôõúùû]/i.test(String(text || ""))
    shouldDelete = hasVowels
    console.log("[punishment] handlePunishmentEnforcement - noVowels check", { senderId, hasVowels, shouldDelete })
  }

  if (punishment.type === "urgentPrefix") {
    const prefix = String(punishment.requiredPrefix || "🚨URGENTE:")
    const matches = matchesUrgentPrefix(text, prefix)
    shouldDelete = !matches
    console.log("[punishment] handlePunishmentEnforcement - urgentPrefix check", { senderId, requiredPrefix: prefix, matches, shouldDelete })
  }

  if (punishment.type === "wordListRequired") {
    const words = Array.isArray(punishment.wordList) ? punishment.wordList : []
    const minRequired = Math.max(1, Math.floor(Number(punishment.minRequiredWords) || 1))
    const hasWords = containsWordListTerms(text, words, minRequired)
    shouldDelete = !hasWords
    console.log("[punishment] handlePunishmentEnforcement - wordListRequired check", { senderId, requiredWords: words, minRequired, hasWords, shouldDelete })
  }

  if (punishment.type === "allCaps") {
    const raw = String(text || "")
    if (!raw.trim()) {
      shouldDelete = false
      console.log("[punishment] handlePunishmentEnforcement - allCaps - empty message, no delete")
    } else if (!hasLetters(raw)) {
      shouldDelete = false
      console.log("[punishment] handlePunishmentEnforcement - allCaps - no letters, no delete")
    } else {
      shouldDelete = raw !== raw.toUpperCase()
      console.log("[punishment] handlePunishmentEnforcement - allCaps check", { senderId, isAllCaps: raw === raw.toUpperCase(), shouldDelete })
    }
  }

  if (punishment.type === "deleteAndRepost") {
    shouldDelete = true
    console.log("[punishment] handlePunishmentEnforcement - deleteAndRepost - marking for delete and repost")
  }

  if (punishment.type === "sexualReaction") {
    const emoji = REPOST_REACTION_EMOJIS[crypto.randomInt(0, REPOST_REACTION_EMOJIS.length)]
    console.log("[punishment] handlePunishmentEnforcement - sexualReaction - adding reaction", { senderId, emoji })
    try {
      await sock.sendMessage(from, {
        react: {
          text: emoji,
          key: msg.key,
        },
      })
      console.log("[punishment] handlePunishmentEnforcement - sexualReaction - reaction added successfully")
    } catch (e) {
      console.error("[punishment] Erro ao reagir mensagem por punição", e)
    }
    return false
  }

  if (punishment.type === "randomDeleteChance") {
    const chance = Math.max(0, Math.min(1, Number(punishment.deleteChance) || 0.2))
    const roll = Math.random()
    shouldDelete = roll < chance
    console.log("[punishment] handlePunishmentEnforcement - randomDeleteChance check", { senderId, chance, roll, shouldDelete })
  }

  if (punishment.type === "max3wordsStrict") {
    const wordCount = countWordTokensStrict(text)
    shouldDelete = wordCount > 3
    console.log("[punishment] handlePunishmentEnforcement - max3wordsStrict check", { senderId, wordCount, shouldDelete })
  }

  if (!shouldDelete) {
    console.log("[punishment] handlePunishmentEnforcement - no delete needed")
    return false
  }

  if (!botIsAdmin) {    console.log("[punishment] handlePunishmentEnforcement - botIsAdmin flag is false; attempting delete anyway")
  }

  console.log("[punishment] handlePunishmentEnforcement - DELETING MESSAGE", { senderId, punishmentType: punishment.type })
  telemetry.incrementCounter("punishment.enforcement", 1, {
    type: punishment.type,
    action: "delete",
  })
  telemetry.appendEvent("punishment.enforcement", {
    groupId: from,
    userId: senderId,
    type: punishment.type,
    action: "delete",
  })

  let deleteSucceeded = false
  try {
    console.log("[punishment] handlePunishmentEnforcement - attempting to delete message", { msgKey: msg.key })
    await sock.sendMessage(from, { delete: msg.key })
    deleteSucceeded = true
    console.log("[punishment] handlePunishmentEnforcement - message deleted successfully")
    if (punishment.type === "deleteAndRepost") {
      console.log("[punishment] handlePunishmentEnforcement - reposting content")
      await resendPunishedContent(sock, from, senderId, msg, text)
    }
  } catch (e) {
    console.error("[punishment] Erro ao apagar mensagem por punição", e)
  }
  if (!deleteSucceeded) {
    console.log("[punishment] handlePunishmentEnforcement - delete attempt failed but punishment remains enforced")
  }
  return true
}

async function handlePendingPunishmentChoice({ sock, from, sender, text, mentioned, isGroup, senderIsAdmin, isCommand }) {
  console.log("[punishment] handlePendingPunishmentChoice START", { from, sender, textLength: text?.length, isCommand })
  if (!isGroup) {
    console.log("[punishment] handlePendingPunishmentChoice - not a group")
    return false
  }

  if (!storage.isResenhaEnabled(from)) {
    console.log("[punishment] handlePendingPunishmentChoice - resinha not enabled")
    const coinPunishmentPending = storage.getCoinPunishmentPending()
    if (coinPunishmentPending[from]?.[sender]) {
      console.log("[punishment] handlePendingPunishmentChoice - clearing pending punishment since resinha disabled")
      clearPendingPunishment(from, sender)
      return false
    }
    return false
  }

  const coinPunishmentPending = storage.getCoinPunishmentPending()
  const pending = coinPunishmentPending[from]?.[sender]
  console.log("[punishment] handlePendingPunishmentChoice - checking pending", { hasPending: !!pending, senderIsAdmin, isCommand })
  if (!pending || (senderIsAdmin && isCommand)) {
    console.log("[punishment] handlePendingPunishmentChoice - no pending or is admin command")
    return false
  }

  const hasEligibilityMetadata = Object.prototype.hasOwnProperty.call(pending, "punishmentEligible") ||
    Object.prototype.hasOwnProperty.call(pending, "minPunishmentBet") ||
    Object.prototype.hasOwnProperty.call(pending, "roundBet")
  if (hasEligibilityMetadata) {
    const explicitEligible = pending.punishmentEligible !== false
    const minPunishmentBet = Number.parseInt(String(pending.minPunishmentBet ?? 0), 10)
    const roundBet = Number.parseInt(String(pending.roundBet ?? 0), 10)
    const thresholdViolated = Number.isFinite(minPunishmentBet) && minPunishmentBet > 0 &&
      Number.isFinite(roundBet) && roundBet > 0 && roundBet < minPunishmentBet

    if (!explicitEligible || thresholdViolated) {
      clearPendingPunishment(from, sender)
      await sock.sendMessage(from, {
        text: "Essa escolha de punição expirou por elegibilidade de aposta. Inicie uma nova rodada.",
      })
      return true
    }
  }

  const punishmentChoice = getPunishmentChoiceFromText(text)
  console.log("[punishment] handlePendingPunishmentChoice - extracted choice", { punishmentChoice, text })
  let target = pending.target

  if (pending.mode === "target" && mentioned.length > 0) {
    console.log("[punishment] handlePendingPunishmentChoice - target mode with mentions")
    target = mentioned[0]

    if (Array.isArray(pending.allowedTargets) && pending.allowedTargets.length > 0 && !pending.allowedTargets.includes(target)) {
      await sock.sendMessage(from, {
        text: "Esse alvo não é válido para esta escolha."
      })
      return true
    }

    coinPunishmentPending[from][sender].target = target
    storage.setCoinPunishmentPending(coinPunishmentPending)
  }

  if (pending.mode === "target" && !target) {
    await sock.sendMessage(from, {
      text: "Marque primeiro quem vai receber a punição.\n" + getPunishmentMenuText()
    })
    return true
  }

  if (!punishmentChoice) {
    await sock.sendMessage(from, {
      text: "Escolha inválida.\n" + getPunishmentMenuText()
    })
    return true
  }

  const punishedUser = pending.mode === "self" ? sender : target
  await applyPunishment(sock, from, punishedUser, punishmentChoice, {
    severityMultiplier: pending.severityMultiplier || 1,
    origin: pending.origin || "game",
  })
  clearPendingPunishment(from, sender)
  return true
}

async function rehydrateActivePunishments(sock) {
  console.log("[punishment] rehydrateActivePunishments START")
  const activePunishments = storage.getActivePunishments()
  const now = Date.now()
  let changed = false
  console.log("[punishment] rehydrateActivePunishments - loaded punishments", { totalGroups: Object.keys(activePunishments || {}).length })

  for (const [groupId, users] of Object.entries(activePunishments || {})) {
    if (!users || typeof users !== "object") {
      console.log("[punishment] rehydrateActivePunishments - invalid users object", { groupId })
      delete activePunishments[groupId]
      changed = true
      continue
    }

    for (const [userIdRaw, punishment] of Object.entries(users)) {
      const userId = normalizeUserId(userIdRaw) || String(userIdRaw || "")
      if (!userId || !punishment || typeof punishment !== "object") {
        console.log("[punishment] rehydrateActivePunishments - invalid punishment", { groupId, userIdRaw })
        delete users[userIdRaw]
        changed = true
        continue
      }

      if (userId !== userIdRaw && !users[userId]) {
        users[userId] = punishment
        delete users[userIdRaw]
        changed = true
      }

      if (punishment.timerId) {
        console.log("[punishment] rehydrateActivePunishments - clearing old timer", { groupId, userId })
        clearTimeout(punishment.timerId)
        delete punishment.timerId
        changed = true
      }

      const endsAt = Number(punishment.endsAt) || 0
      if (!endsAt) {
        console.log("[punishment] rehydrateActivePunishments - permanent punishment", { groupId, userId, type: punishment.type })
        continue
      }

      const remainingMs = endsAt - now
      if (remainingMs <= 0) {
        console.log("[punishment] rehydrateActivePunishments - punishment already expired", { groupId, userId, endsAt, now })
        delete users[userIdRaw]
        changed = true
        continue
      }

      console.log("[punishment] rehydrateActivePunishments - setting timer", { groupId, userId, type: punishment.type, remainingMs })
      punishment.timerId = setTimeout(() => {
        console.log("[punishment] rehydrateActivePunishments - timeout fired, clearing punishment", { groupId, userId })
        clearPunishment(groupId, userId)
        if (sock && typeof sock.sendMessage === "function") {
          sock.sendMessage(groupId, {
            text: `${formatMentionTag(userId)}, sua punição expirou.`,
            mentions: normalizeMentionArray([userId]),
          }).catch(() => {})
        }
      }, remainingMs)
      changed = true
    }

    if (Object.keys(users).length === 0) {
      console.log("[punishment] rehydrateActivePunishments - cleaning up empty group", { groupId })
      delete activePunishments[groupId]
      changed = true
    }
  }

  if (changed) {
    console.log("[punishment] rehydrateActivePunishments - changes detected, saving")
    storage.setActivePunishments(activePunishments)
  }
  console.log("[punishment] rehydrateActivePunishments COMPLETE")
}

module.exports = {
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
  rehydrateActivePunishments,
}
