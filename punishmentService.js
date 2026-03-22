const crypto = require("crypto")
const storage = require("./storage")

const LETTER_ALPHABET = "abcdefghijklmnopqrstuvwxyz"

function getPunishmentChoiceFromText(text = "") {
  const cleaned = text.toLowerCase().trim()
  if (cleaned === "1") return "1"
  if (cleaned === "2") return "2"
  if (cleaned === "3") return "3"
  if (cleaned === "4") return "4"
  if (cleaned === "5") return "5"
  return null
}

function getRandomPunishmentChoice() {
  const choices = ["1", "2", "3", "4", "5"]
  return choices[crypto.randomInt(0, choices.length)]
}

function getPunishmentNameById(punishmentId) {
  if (punishmentId === "1") return "max. 5 caracteres (5 min)"
  if (punishmentId === "2") return "1 mensagem/20s (10 min)"
  if (punishmentId === "3") return "bloqueio por 2 letras (indefinido)"
  if (punishmentId === "4") return "somente emojis (5 min)"
  if (punishmentId === "5") return "mute total (5 min)"
  return "desconhecida"
}

function getPunishmentMenuText() {
  return [
    "Escolha a punicao digitando *1*, *2*, *3*, *4* ou *5*:",
    "1. Mensagens com no maximo 5 caracteres por 5 minutos.",
    "2. Maximo de 1 mensagem a cada 20 segundos por 10 minutos.",
    "3. Bloqueio por duas letras aleatorias (indefinido ate cumprir condicao de saida).",
    "4. So pode enviar emojis por 5 minutos.",
    "5. Mute total por 5 minutos (tudo que enviar sera apagado)."
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
    warningText = `${mentionTag}, punicao ativada: suas mensagens so podem ter ate *5 caracteres* por *${Math.floor(durationMs / 60_000)} minutos* (espaco conta). Mensagens fora disso serao apagadas.`
  }

  if (punishmentId === "2") {
    const durationMs = 10 * 60_000 * severityMultiplier
    punishmentState = {
      type: "rate20s",
      endsAt: now + durationMs,
      lastAllowedAt: 0
    }
    warningText = `${mentionTag}, punicao ativada: voce so pode enviar *1 mensagem a cada 20 segundos* por *${Math.floor(durationMs / 60_000)} minutos*. Mensagens acima da taxa serao apagadas.`
  }

  if (punishmentId === "3") {
    const letters = getRandomDifferentLetters()
    punishmentState = {
      type: "lettersBlock",
      letters
    }
    warningText = `${mentionTag}, punicao ativada: qualquer mensagem sua contendo ao menos 1 de 2 letras selecionadas aleatoriamente sera apagada. Isso e *indefinido* e so acaba quando voce enviar uma mensagem contendo apenas uma ou ambas essas letras.\nBoa sorte tentando descobrir quais letras elas sao.`
  }

  if (punishmentId === "4") {
    const durationMs = 5 * 60_000 * severityMultiplier
    punishmentState = {
      type: "emojiOnly",
      endsAt: now + durationMs
    }
    warningText = `${mentionTag}, punicao ativada: por *${Math.floor(durationMs / 60_000)} minutos* voce so pode enviar mensagens formadas apenas por emojis. Qualquer mensagem contendo texto nao emoji sera apagada.`
  }

  if (punishmentId === "5") {
    const durationMs = 5 * 60_000 * severityMultiplier
    punishmentState = {
      type: "mute5m",
      endsAt: now + durationMs
    }
    warningText = `${mentionTag}, punicao ativada: *mute total por ${Math.floor(durationMs / 60_000)} minutos*. Qualquer mensagem sua sera apagada.`
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
        text: `@${sender.split("@")[0]}, voce cumpriu a condicao e foi liberado da punicao das letras (${letters[0]} / ${letters[1]}).`,
        mentions: [sender]
      })
      return false
    }
    shouldDelete = containsPunishmentLetters(text, letters)
  }

  if (punishment.type === "emojiOnly") {
    shouldDelete = !isEmojiOnlyMessage(text)
  }

  if (punishment.type === "mute5m") {
    shouldDelete = true
  }

  if (!shouldDelete) return false

  try {
    await sock.sendMessage(from, { delete: msg.key })
  } catch (e) {
    console.error("Erro ao apagar mensagem por punicao", e)
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
      text: "Marque primeiro quem vai receber a punicao.\n" + getPunishmentMenuText()
    })
    return true
  }

  if (!punishmentChoice) {
    await sock.sendMessage(from, {
      text: "Escolha invalida.\n" + getPunishmentMenuText()
    })
    return true
  }

  const punishedUser = pending.mode === "self" ? sender : target
  await applyPunishment(sock, from, punishedUser, punishmentChoice, {
    severityMultiplier: pending.severityMultiplier || 1,
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
