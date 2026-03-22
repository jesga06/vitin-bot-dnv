const crypto = require("crypto")
const storage = require("./storage")
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

function getPunishmentNameById(punishmentId) {
  if (punishmentId === "1") return "máx. 5 caracteres"
  if (punishmentId === "2") return "1 mensagem/20s"
  if (punishmentId === "3") return "bloqueio por 2 letras (indefinido)"
  if (punishmentId === "4") return "somente emojis e figurinhas"
  if (punishmentId === "5") return "mute total"
  if (punishmentId === "6") return "sem vogais"
  if (punishmentId === "7") return "prefixo obrigatório"
  if (punishmentId === "8") return "palavras da lista"
  if (punishmentId === "9") return "somente caixa alta"
  if (punishmentId === "10") return "repost pelo bot"
  if (punishmentId === "11") return "reação sugestiva"
  if (punishmentId === "12") return "chance de apagar"
  if (punishmentId === "13") return "máx. 3 palavras"
  return "desconhecida"
}

function getPunishmentMenuText() {
  return [
    "Escolha a punição digitando um número de *1* a *13*:",
    "--- Punições clássicas ---",
    "1. Mensagens com no máximo 5 caracteres por 5 minutos.",
    "2. Máximo de 1 mensagem a cada 20 segundos por 10 minutos.",
    "3. Bloqueio por duas letras aleatórias (indefinido até cumprir condição de saída).",
    "4. Só pode enviar emojis e figurinhas por 5 minutos.",
    "5. Mute total por 5 minutos (tudo que enviar será apagado).",
    "--- Novas punições ---",
    "6. Sem vogais por 5 minutos (severidade escala tempo em 1.5x).",
    "7. Toda mensagem deve começar com 🚨URGENTE: por 5 minutos (severidade escala tempo em 1.5x).",
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
    "1. Máx. 5 caracteres (clássica)",
    "- Regra: mensagem com mais de 5 caracteres é apagada.",
    "- Duração: 5 minutos x severidade.",
    "",
    "2. 1 mensagem a cada 20s (clássica)",
    "- Regra: se enviar antes do intervalo, apaga.",
    "- Duração: 10 minutos x severidade.",
    "",
    "3. Bloqueio de letras (clássica)",
    "- Regra: mensagem com letras bloqueadas é apagada.",
    "- Escala: +1 letra proibida por severidade (arredonda para cima quando aplicável).",
    "- Término: indefinido, encerra ao cumprir condição de saída.",
    "",
    "4. Só emojis/figurinhas (clássica)",
    "- Regra: texto fora de emoji/sticker é apagado.",
    "- Duração: 5 minutos x severidade.",
    "",
    "5. Mute total (clássica)",
    "- Regra: toda mensagem é apagada.",
    "- Duração: 5 minutos x severidade.",
    "",
    "6. Sem vogais",
    "- Regra: mensagem com vogal é apagada.",
    "- Duração: 5 minutos, escala x1.5 por severidade.",
    "",
    "7. Prefixo obrigatório 🚨URGENTE:",
    "- Regra: mensagem sem esse início é apagada.",
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
    "- Regra: bot apaga mensagem e reposta em texto.",
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
  const normalized = text.toLowerCase().replace(/\s+/g, "")
  if (!normalized) return false
  for (const ch of normalized) {
    if (!letters.includes(ch)) return false
  }
  return true
}

function containsPunishmentLetters(text = "", letters = []) {
  const normalized = text.toLowerCase()
  return letters.some((letter) => normalized.includes(letter))
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

function getResendText(msg, text = "") {
  const trimmed = String(text || "").trim()
  if (trimmed) return trimmed
  if (msg?.message?.stickerMessage) return "[figurinha reenviada pelo bot]"
  if (msg?.message?.imageMessage) return "[imagem reenviada pelo bot]"
  if (msg?.message?.videoMessage) return "[vídeo reenviado pelo bot]"
  if (msg?.message?.audioMessage) return "[áudio reenviado pelo bot]"
  return "[mensagem reenviada pelo bot]"
}

function normalizeUserId(value = "") {
  const raw = String(value || "").trim()
  if (!raw) return ""
  const [withoutDevice] = raw.split(":")
  return withoutDevice.toLowerCase()
}

function clearPendingPunishment(groupId, playerId) {
  const coinPunishmentPending = storage.getCoinPunishmentPending()
  if (!coinPunishmentPending[groupId]?.[playerId]) return
  delete coinPunishmentPending[groupId][playerId]
  if (Object.keys(coinPunishmentPending[groupId]).length === 0) delete coinPunishmentPending[groupId]
  storage.setCoinPunishmentPending(coinPunishmentPending)
}

function clearPunishment(groupId, userId) {
  const activePunishments = storage.getActivePunishments()
  if (!activePunishments[groupId]?.[userId]) return
  const timerId = activePunishments[groupId][userId]?.timerId
  if (timerId) clearTimeout(timerId)
  delete activePunishments[groupId][userId]
  if (Object.keys(activePunishments[groupId]).length === 0) delete activePunishments[groupId]
  storage.setActivePunishments(activePunishments)
}

async function applyPunishment(sock, groupId, userId, punishmentId, options = {}) {
  const origin = options?.origin || "admin"
  const normalizedTarget = normalizeUserId(userId)
  const normalizedBot = normalizeUserId(options?.botUserId || sock?.user?.id || "")
  if (normalizedTarget && normalizedBot && normalizedTarget === normalizedBot) {
    telemetry.incrementCounter("punishment.blocked", 1, {
      origin,
      reason: "bot-target",
      punishmentId: String(punishmentId || ""),
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
    const blocked = economyService.consumeShield(userId)
    if (blocked) {
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
        text: `🛡️ @${userId.split("@")[0]} bloqueou a punição com escudo!`,
        mentions: [userId],
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
  clearPunishment(groupId, userId)

  const mentionTag = `@${userId.split("@")[0]}`
  const now = Date.now()
  let punishmentState = null
  let warningText = ""

  if (punishmentId === "1") {
    const durationMs = 5 * 60_000 * severityMultiplier
    punishmentState = {
      type: "max5chars",
      endsAt: now + durationMs
    }
    warningText = `${mentionTag}, punição ativada: suas mensagens só podem ter até *5 caracteres* por *${Math.floor(durationMs / 60_000)} minutos* (espaço conta). Mensagens fora disso serão apagadas.`
  }

  if (punishmentId === "2") {
    const durationMs = 10 * 60_000 * severityMultiplier
    punishmentState = {
      type: "rate20s",
      endsAt: now + durationMs,
      lastAllowedAt: 0
    }
    warningText = `${mentionTag}, punição ativada: você só pode enviar *1 mensagem a cada 20 segundos* por *${Math.floor(durationMs / 60_000)} minutos*. Mensagens acima da taxa serão apagadas.`
  }

  if (punishmentId === "3") {
    const letters = getRandomDifferentLetters(severityMultiplier + 1)
    punishmentState = {
      type: "lettersBlock",
      letters
    }
    warningText = `${mentionTag}, punição ativada: qualquer mensagem sua contendo ao menos 1 de *${letters.length}* letras selecionadas aleatoriamente será apagada. Isso é *indefinido* e só acaba quando você enviar uma mensagem contendo apenas letras permitidas da própria punição.`
  }

  if (punishmentId === "4") {
    const durationMs = 5 * 60_000 * severityMultiplier
    punishmentState = {
      type: "emojiOnly",
      endsAt: now + durationMs
    }
    warningText = `${mentionTag}, punição ativada: por *${Math.floor(durationMs / 60_000)} minutos* você só pode enviar mensagens formadas por emojis ou figurinhas. Qualquer mensagem com texto fora desse formato será apagada.`
  }

  if (punishmentId === "5") {
    const durationMs = 5 * 60_000 * severityMultiplier
    punishmentState = {
      type: "mute5m",
      endsAt: now + durationMs
    }
    warningText = `${mentionTag}, punição ativada: *mute total por ${Math.floor(durationMs / 60_000)} minutos*. Qualquer mensagem sua será apagada.`
  }

  if (punishmentId === "6") {
    const durationMs = Math.ceil(5 * 60_000 * Math.pow(1.5, severityMultiplier - 1))
    punishmentState = {
      type: "noVowels",
      endsAt: now + durationMs,
    }
    warningText = `${mentionTag}, punição ativada: sem vogais por *${Math.ceil(durationMs / 60_000)} minutos*. Mensagens com vogais serão apagadas.`
  }

  if (punishmentId === "7") {
    const durationMs = Math.ceil(5 * 60_000 * Math.pow(1.5, severityMultiplier - 1))
    punishmentState = {
      type: "urgentPrefix",
      endsAt: now + durationMs,
      requiredPrefix: "🚨URGENTE:",
    }
    warningText = `${mentionTag}, punição ativada: por *${Math.ceil(durationMs / 60_000)} minutos* toda mensagem deve começar com *🚨URGENTE:*.`
  }

  if (punishmentId === "8") {
    const durationMs = Math.ceil(5 * 60_000 * Math.pow(1.5, severityMultiplier - 1))
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

  if (punishmentId === "9") {
    const durationMin = 10 + (Math.max(1, severityMultiplier) - 1) * 2
    const durationMs = durationMin * 60_000
    punishmentState = {
      type: "allCaps",
      endsAt: now + durationMs,
    }
    warningText = `${mentionTag}, punição ativada: por *${durationMin} minutos* toda mensagem deve estar em CAIXA ALTA.`
  }

  if (punishmentId === "10") {
    const durationMs = 5 * 60_000
    punishmentState = {
      type: "deleteAndRepost",
      endsAt: now + durationMs,
    }
    warningText = `${mentionTag}, punição ativada: por *5 minutos* suas mensagens serão apagadas e repostadas pelo bot.`
  }

  if (punishmentId === "11") {
    const durationMs = Math.ceil(5 * 60_000 * Math.pow(1.5, severityMultiplier - 1))
    punishmentState = {
      type: "sexualReaction",
      endsAt: now + durationMs,
    }
    warningText = `${mentionTag}, punição ativada: por *${Math.ceil(durationMs / 60_000)} minutos* suas mensagens receberão reações sugestivas.`
  }

  if (punishmentId === "12") {
    const durationMs = 60 * 60_000
    const deleteChance = Math.min(1, (20 + (Math.max(1, severityMultiplier) - 1) * 5) / 100)
    punishmentState = {
      type: "randomDeleteChance",
      endsAt: now + durationMs,
      deleteChance,
    }
    warningText = `${mentionTag}, punição ativada: por *60 minutos* suas mensagens têm *${Math.ceil(deleteChance * 100)}%* de chance de serem apagadas.`
  }

  if (punishmentId === "13") {
    const durationMin = 5 + (Math.max(1, severityMultiplier) - 1) * 2
    const durationMs = durationMin * 60_000
    punishmentState = {
      type: "max3wordsStrict",
      endsAt: now + durationMs,
    }
    warningText = `${mentionTag}, punição ativada: por *${durationMin} minutos* você pode enviar no máximo *3 palavras* por mensagem.`
  }

  if (!punishmentState) return

  activePunishments[groupId][userId] = punishmentState

  if (punishmentState?.endsAt) {
    const msRemaining = Math.max(0, punishmentState.endsAt - now)
    const timerId = setTimeout(() => {
      clearPunishment(groupId, userId)
    }, msRemaining)
    activePunishments[groupId][userId].timerId = timerId
  }

  storage.setActivePunishments(activePunishments)

  telemetry.incrementCounter("punishment.applied", 1, {
    origin,
    punishmentId: String(punishmentId || ""),
  })
  telemetry.appendEvent("punishment.applied", {
    groupId,
    userId,
    origin,
    punishmentId,
    severityMultiplier,
    timed: Boolean(punishmentState?.endsAt),
  })
  economyService.incrementStat(userId, "punishmentsReceivedTotal", 1)
  if (origin === "admin") {
    economyService.incrementStat(userId, "punishmentsReceivedAdmin", 1)
  } else {
    economyService.incrementStat(userId, "punishmentsReceivedGame", 1)
  }

  await sock.sendMessage(groupId, {
    text: warningText,
    mentions: [userId]
  })
}

async function handlePunishmentEnforcement(sock, msg, from, sender, text, isGroup, skipForCommand = false) {
  if (!isGroup) return false
  if (skipForCommand) return false
  const activePunishments = storage.getActivePunishments()
  const punishment = activePunishments[from]?.[sender]
  if (!punishment) return false

  const now = Date.now()
  if (punishment.endsAt && now >= punishment.endsAt) {
    clearPunishment(from, sender)
    return false
  }

  let shouldDelete = false

  if (punishment.type === "max5chars") {
    const measured = stripWhitespaceExceptSpace(text)
    shouldDelete = measured.length > 5
  }

  if (punishment.type === "rate20s") {
    if (punishment.lastAllowedAt && now - punishment.lastAllowedAt < 20_000) {
      shouldDelete = true
    } else {
      punishment.lastAllowedAt = now
      storage.setActivePunishments(activePunishments)
    }
  }

  if (punishment.type === "lettersBlock") {
    const letters = punishment.letters || []
    if (isUnlockLettersMessage(text, letters)) {
      clearPunishment(from, sender)
      await sock.sendMessage(from, {
        text: `@${sender.split("@")[0]}, você cumpriu a condição e foi liberado da punição das letras (${letters[0]} / ${letters[1]}).`,
        mentions: [sender]
      })
      return false
    }
    shouldDelete = containsPunishmentLetters(text, letters)
  }

  if (punishment.type === "emojiOnly") {
    shouldDelete = !isEmojiOnlyMessage(text) && !isStickerMessage(msg)
  }

  if (punishment.type === "mute5m") {
    shouldDelete = true
  }

  if (punishment.type === "noVowels") {
    shouldDelete = /[aeiouáàâãéèêíìîóòôõúùû]/i.test(String(text || ""))
  }

  if (punishment.type === "urgentPrefix") {
    const prefix = String(punishment.requiredPrefix || "🚨URGENTE:")
    shouldDelete = !String(text || "").startsWith(prefix)
  }

  if (punishment.type === "wordListRequired") {
    const words = Array.isArray(punishment.wordList) ? punishment.wordList : []
    const minRequired = Math.max(1, Math.floor(Number(punishment.minRequiredWords) || 1))
    shouldDelete = !containsWordListTerms(text, words, minRequired)
  }

  if (punishment.type === "allCaps") {
    const raw = String(text || "")
    if (!raw.trim()) {
      shouldDelete = false
    } else if (!hasLetters(raw)) {
      shouldDelete = false
    } else {
      shouldDelete = raw !== raw.toUpperCase()
    }
  }

  if (punishment.type === "deleteAndRepost") {
    shouldDelete = true
  }

  if (punishment.type === "sexualReaction") {
    const emoji = REPOST_REACTION_EMOJIS[crypto.randomInt(0, REPOST_REACTION_EMOJIS.length)]
    try {
      await sock.sendMessage(from, {
        react: {
          text: emoji,
          key: msg.key,
        },
      })
    } catch (e) {
      console.error("Erro ao reagir mensagem por punição", e)
    }
    return false
  }

  if (punishment.type === "randomDeleteChance") {
    const chance = Math.max(0, Math.min(1, Number(punishment.deleteChance) || 0.2))
    shouldDelete = Math.random() < chance
  }

  if (punishment.type === "max3wordsStrict") {
    shouldDelete = countWordTokensStrict(text) > 3
  }

  if (!shouldDelete) return false

  telemetry.incrementCounter("punishment.enforcement", 1, {
    type: punishment.type,
    action: "delete",
  })
  telemetry.appendEvent("punishment.enforcement", {
    groupId: from,
    userId: sender,
    type: punishment.type,
    action: "delete",
  })

  try {
    await sock.sendMessage(from, { delete: msg.key })
    if (punishment.type === "deleteAndRepost") {
      const resendText = getResendText(msg, text)
      await sock.sendMessage(from, {
        text: `📢 Repost de @${sender.split("@")[0]}: ${resendText}`,
        mentions: [sender],
      })
    }
  } catch (e) {
    console.error("Erro ao apagar mensagem por punição", e)
  }
  return true
}

async function handlePendingPunishmentChoice({ sock, from, sender, text, mentioned, isGroup, senderIsAdmin, isCommand }) {
  if (!isGroup) return false

  if (!storage.isResenhaEnabled(from)) {
    const coinPunishmentPending = storage.getCoinPunishmentPending()
    if (coinPunishmentPending[from]?.[sender]) {
      clearPendingPunishment(from, sender)
      return false
    }
    return false
  }

  const coinPunishmentPending = storage.getCoinPunishmentPending()
  const pending = coinPunishmentPending[from]?.[sender]
  if (!pending || (senderIsAdmin && isCommand)) return false

  const punishmentChoice = getPunishmentChoiceFromText(text)
  let target = pending.target

  if (pending.mode === "target" && mentioned.length > 0) {
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
}
