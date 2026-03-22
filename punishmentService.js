const crypto = require("crypto")
const storage = require("./storage")
const economyService = require("./economyService")
const telemetry = require("./telemetryService")

const LETTER_ALPHABET = "abcdefghijklmnopqrstuvwxyz"

function getPunishmentChoiceFromText(text = "") {
  const cleaned = text.toLowerCase().trim()
  const match = cleaned.match(/(?:^|\s)([1-5])(?:\s|$)/)
  if (match?.[1]) return match[1]
  return null
}

function getRandomPunishmentChoice() {
  const choices = ["1", "2", "3", "4", "5"]
  return choices[crypto.randomInt(0, choices.length)]
}

function getPunishmentNameById(punishmentId) {
  if (punishmentId === "1") return "máx. 5 caracteres"
  if (punishmentId === "2") return "1 mensagem/20s"
  if (punishmentId === "3") return "bloqueio por 2 letras (indefinido)"
  if (punishmentId === "4") return "somente emojis e figurinhas"
  if (punishmentId === "5") return "mute total"
  return "desconhecida"
}

function getPunishmentMenuText() {
  return [
    "Escolha a punição digitando *1*, *2*, *3*, *4* ou *5*:",
    "1. Mensagens com no máximo 5 caracteres por 5 minutos.",
    "2. Máximo de 1 mensagem a cada 20 segundos por 10 minutos.",
    "3. Bloqueio por duas letras aleatórias (indefinido até cumprir condição de saída).",
    "4. Só pode enviar emojis e figurinhas por 5 minutos.",
    "5. Mute total por 5 minutos (tudo que enviar será apagado)."
  ].join("\n")
}

function getRandomDifferentLetters() {
  const firstIndex = crypto.randomInt(0, LETTER_ALPHABET.length)
  let secondIndex = crypto.randomInt(0, LETTER_ALPHABET.length)
  while (secondIndex === firstIndex) secondIndex = crypto.randomInt(0, LETTER_ALPHABET.length)
  return [LETTER_ALPHABET[firstIndex], LETTER_ALPHABET[secondIndex]]
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
  const [a, b] = letters
  for (const ch of normalized) {
    if (ch !== a && ch !== b) return false
  }
  return true
}

function containsPunishmentLetters(text = "", letters = []) {
  const normalized = text.toLowerCase()
  return letters.some((letter) => normalized.includes(letter))
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
    const letters = getRandomDifferentLetters()
    punishmentState = {
      type: "lettersBlock",
      letters
    }
    warningText = `${mentionTag}, punição ativada: qualquer mensagem sua contendo ao menos 1 de 2 letras selecionadas aleatoriamente será apagada. Isso é *indefinido* e só acaba quando você enviar uma mensagem contendo apenas uma ou ambas essas letras.\nBoa sorte tentando descobrir quais letras elas são.`
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

  if (!shouldDelete) return false

  try {
    await sock.sendMessage(from, { delete: msg.key })
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
  clearPendingPunishment,
  clearPunishment,
  applyPunishment,
  handlePunishmentEnforcement,
  handlePendingPunishmentChoice,
}
