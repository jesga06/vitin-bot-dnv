const CURRENCY_LABEL = "Epsteincoins"
const telemetry = require("../telemetryService")

const pendingForgeTypeByUser = new Map()
const activeRafflesByGroup = new Map()
const RAFFLE_REVEAL_DELAY_MS = 5_000
const RAFFLE_OPTIN_WINDOW_MS = 30 * 60 * 1000
const TRADE_STATE_KEY = "tradeState"
const TRADE_TIMEOUT_MS = 15 * 60 * 1000
const TRADE_HISTORY_LIMIT = 100
const TRADE_ITEM_STACK_LIMIT = 100_000
const TEAM_WITHDRAW_COOLDOWN_MS = 15 * 60 * 1000
const COUPON_STATE_KEY = "couponState"
const ACCOUNT_DELETE_CONFIRMATION_PHRASE = "Estou ciente do uso e efeitos deste comando. Delete a minha conta"
const ACCOUNT_DELETE_CONFIRMATION_TTL_MS = 2 * 60 * 1000
const pendingAccountDeletionByUser = new Map()
const XP_REWARDS = {
  dailyClaim: 45,
  stealAttemptFail: 12,
  stealAttemptSuccess: 30,
  casinoPlay: 8,
  casinoWinBonus: 18,
  workFail: 14,
  workWin: 28,
}
const PUNISHMENT_TYPE_LABELS = {
  1: "Máx. 5 caracteres",
  2: "1 mensagem/20s",
  3: "Bloqueio de letras",
  4: "Só emojis/figurinhas",
  5: "Mute total",
  6: "Sem vogais",
  7: "Prefixo urgente",
  8: "Palavras da lista",
  9: "Caixa alta",
  10: "Apagar e repostar",
  11: "Reação sugestiva",
  12: "Chance de apagar",
  13: "Máx. 3 palavras",
}

function getPunishmentMenuTextForGroup() {
  const lines = ["Punições disponíveis para conversão:"]
  for (let type = 1; type <= 13; type++) {
    lines.push(`${type}. ${PUNISHMENT_TYPE_LABELS[type] || `Tipo ${type}`}`)
  }
  lines.push("")
  lines.push("Responda neste grupo com !falsificar tipo <1-13>.")
  return lines.join("\n")
}

function parseQuotedArgs(input = "") {
  const args = []
  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g
  let match
  while ((match = regex.exec(String(input || ""))) !== null) {
    args.push(match[1] ?? match[2] ?? match[3] ?? "")
  }
  return args
}

function parseRaffleCreationArgs(commandRemainder = "") {
  const args = parseQuotedArgs(commandRemainder)
  if (args.length < 4) {
    return {
      ok: false,
      reason: "missing-args",
    }
  }

  const winnersRaw = String(args.pop() || "").trim()
  const winnersCount = Number.parseInt(winnersRaw, 10)
  if (!Number.isFinite(winnersCount) || winnersCount <= 0) {
    return {
      ok: false,
      reason: "invalid-winners",
    }
  }

  const optInToken = String(args.pop() || "").trim().toUpperCase()
  if (!["S", "N"].includes(optInToken)) {
    return {
      ok: false,
      reason: "invalid-opt-in",
    }
  }

  const rewardRaw = String(args.pop() || "").trim()
  const title = String(args.join(" ") || "").trim()
  if (!title || !rewardRaw) {
    return {
      ok: false,
      reason: "missing-args",
    }
  }

  return {
    ok: true,
    title,
    rewardRaw,
    optIn: optInToken === "S",
    winnersCount,
  }
}

function parseRaffleRewards(rewardRaw = "", economyService, limits) {
  const segments = String(rewardRaw || "")
    .split("|")
    .map((segment) => String(segment || "").trim())
    .filter(Boolean)

  if (segments.length === 0) {
    return {
      ok: false,
      reason: "empty",
    }
  }

  const rewards = []
  for (const segment of segments) {
    const coinMatch = segment.match(/^moedas\s*=\s*(\d+)$/i)
    if (coinMatch) {
      const amount = Number.parseInt(coinMatch[1], 10)
      if (!Number.isFinite(amount) || amount <= 0 || amount > limits.maxCoinOperation) {
        return {
          ok: false,
          reason: "invalid-coins",
          details: `moedas deve ser entre 1 e ${limits.maxCoinOperation}`,
        }
      }
      rewards.push({ type: "coins", amount })
      continue
    }

    const itemMatch = segment.match(/^item\s*:\s*([a-z0-9_]+)\s*-\s*(\d+)$/i)
    if (itemMatch) {
      const requestedItem = String(itemMatch[1] || "").trim()
      const quantity = Number.parseInt(itemMatch[2], 10)
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > limits.maxItemOperation) {
        return {
          ok: false,
          reason: "invalid-item-quantity",
          details: `item:<id-quantidade> deve ter quantidade entre 1 e ${limits.maxItemOperation}`,
        }
      }
      const itemDef = economyService.getItemDefinition(requestedItem)
      if (!itemDef?.key) {
        return {
          ok: false,
          reason: "unknown-item",
          details: `item desconhecido: ${requestedItem}`,
        }
      }
      rewards.push({
        type: "item",
        itemKey: itemDef.key,
        quantity,
        name: itemDef.name || itemDef.key,
      })
      continue
    }

    rewards.push({ type: "text", text: segment })
  }

  return {
    ok: true,
    rewards,
  }
}

function getTradeState(storage, groupId) {
  if (typeof storage?.getGameState !== "function") {
    return { trades: {}, history: [] }
  }
  const raw = storage.getGameState(groupId, TRADE_STATE_KEY)
  if (!raw || typeof raw !== "object") {
    return { trades: {}, history: [] }
  }
  return {
    trades: raw.trades && typeof raw.trades === "object" ? raw.trades : {},
    history: Array.isArray(raw.history) ? raw.history : [],
  }
}

function getCouponState(storage, groupId) {
  if (typeof storage?.getGameState !== "function") {
    return { codes: {} }
  }
  const raw = storage.getGameState(groupId, COUPON_STATE_KEY)
  if (!raw || typeof raw !== "object") return { codes: {} }
  return {
    codes: raw.codes && typeof raw.codes === "object" ? raw.codes : {},
  }
}

function setCouponState(storage, groupId, state) {
  if (typeof storage?.setGameState !== "function") return
  storage.setGameState(groupId, COUPON_STATE_KEY, {
    codes: state?.codes && typeof state.codes === "object" ? state.codes : {},
  })
}

function setTradeState(storage, groupId, nextState) {
  if (typeof storage?.setGameState !== "function") return
  storage.setGameState(groupId, TRADE_STATE_KEY, {
    trades: nextState?.trades && typeof nextState.trades === "object" ? nextState.trades : {},
    history: Array.isArray(nextState?.history) ? nextState.history.slice(0, TRADE_HISTORY_LIMIT) : [],
  })
}

function buildTradeId(existingIds = new Set()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  for (let attempt = 0; attempt < 64; attempt++) {
    let next = ""
    for (let i = 0; i < 4; i++) {
      next += alphabet[Math.floor(Math.random() * alphabet.length)]
    }
    if (!existingIds.has(next)) return next
  }
  return `${Date.now()}${Math.floor(Math.random() * 100000)}`.replace(/\D/g, "").slice(0, 4).padEnd(4, "0")
}

function parseTradeOffer(tokens = [], economyService, limits) {
  const cleanTokens = (tokens || []).map((t) => String(t || "").trim()).filter(Boolean)
  if (cleanTokens.length === 0) {
    return { ok: false, reason: "missing-offer" }
  }

  const coins = Number.parseInt(cleanTokens[0], 10)
  if (!Number.isFinite(coins) || coins < 0 || coins > limits.maxCoinOperation) {
    return { ok: false, reason: "invalid-coins", max: limits.maxCoinOperation }
  }

  const items = {}
  for (const token of cleanTokens.slice(1)) {
    const match = token.match(/^([a-z0-9_]+):(\d+)$/i)
    if (!match) return { ok: false, reason: "invalid-item-token", token }
    const itemRaw = String(match[1] || "").trim()
    const quantity = Number.parseInt(match[2], 10)
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > limits.maxItemOperation) {
      return { ok: false, reason: "invalid-item-quantity", token, max: limits.maxItemOperation }
    }
    const itemDef = economyService.getItemDefinition(itemRaw)
    if (!itemDef?.key) {
      return { ok: false, reason: "unknown-item", token }
    }
    const key = itemDef.key
    items[key] = (items[key] || 0) + quantity
  }

  return { ok: true, offer: { coins, items } }
}

function formatTradeOffer(offer = {}) {
  const coins = Math.max(0, Math.floor(Number(offer.coins) || 0))
  const items = offer.items && typeof offer.items === "object" ? offer.items : {}
  const itemParts = Object.entries(items)
    .filter(([, qty]) => Number(qty) > 0)
    .map(([key, qty]) => `${key}:${qty}`)
  const itemsText = itemParts.length > 0 ? itemParts.join(", ") : "nenhum item"
  return `${coins} ${CURRENCY_LABEL} | ${itemsText}`
}

function getTradeParticipantRole(trade, userId) {
  if (!trade) return ""
  if (trade.initiator === userId) return "initiator"
  if (trade.counterparty === userId) return "counterparty"
  return ""
}

function appendTradeEvent(trade, type, by, payload = {}) {
  if (!Array.isArray(trade.events)) trade.events = []
  trade.events.push({ at: Date.now(), type, by, payload })
  if (trade.events.length > 50) {
    trade.events = trade.events.slice(-50)
  }
}

function cleanupExpiredTrades(state, now = Date.now()) {
  let changed = false
  for (const trade of Object.values(state.trades || {})) {
    if (!trade || trade.status !== "active") continue
    if ((Number(trade.expiresAt) || 0) > now) continue
    trade.status = "timed-out"
    trade.phase = "timed-out"
    trade.updatedAt = now
    appendTradeEvent(trade, "trade.timeout", "system", { reason: "inactivity" })
    state.history.unshift(trade.tradeId)
    if (state.history.length > TRADE_HISTORY_LIMIT) {
      state.history = state.history.slice(0, TRADE_HISTORY_LIMIT)
    }
    changed = true
  }
  return changed
}

function getOfferValue(offer = {}, economyService) {
  const coinValue = Math.max(0, Math.floor(Number(offer.coins) || 0))
  const items = offer.items && typeof offer.items === "object" ? offer.items : {}
  let itemValue = 0
  for (const [key, qty] of Object.entries(items)) {
    const def = economyService.getItemDefinition(key)
    const unit = Math.max(0, Math.floor(Number(def?.price) || 0))
    itemValue += unit * Math.max(0, Math.floor(Number(qty) || 0))
  }
  return coinValue + itemValue
}

function getTradeBracketForOffer(offer = {}, economyService) {
  const items = offer.items && typeof offer.items === "object" ? offer.items : {}
  let maxRarity = 1
  for (const [key, qtyRaw] of Object.entries(items)) {
    const qty = Math.max(0, Math.floor(Number(qtyRaw) || 0))
    if (qty <= 0) continue
    const rarity = Math.max(1, Math.min(5, Math.floor(Number(economyService.getItemDefinition(key)?.rarity) || 1)))
    if (rarity > maxRarity) maxRarity = rarity
  }
  return maxRarity
}

function getTradeFeeRateByBracket(bracket = 1) {
  const b = Math.max(1, Math.min(5, Math.floor(Number(bracket) || 1)))
  if (b === 1) return 0.02
  if (b === 2) return 0.05
  if (b === 3) return 0.10
  if (b === 4) return 0.15
  return 0.20
}

function getTradeCooldownMsByBracket(bracket = 1) {
  const b = Math.max(1, Math.min(5, Math.floor(Number(bracket) || 1)))
  if (b === 1) return 5 * 60 * 1000
  if (b === 2) return 10 * 60 * 1000
  if (b === 3) return 15 * 60 * 1000
  if (b === 4) return 30 * 60 * 1000
  return 60 * 60 * 1000
}

function getLevelScaledAmount(base = 0, level = 1, percentPerLevel = 0.03) {
  const safeBase = Math.max(0, Math.floor(Number(base) || 0))
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1))
  const multiplier = 1 + (percentPerLevel * (safeLevel - 1))
  return Math.max(0, Math.floor(safeBase * multiplier))
}

function hasOfferResources(economyService, userId, offer = {}, extraCoinCost = 0) {
  const coinsRequired = Math.max(0, Math.floor(Number(offer.coins) || 0)) + Math.max(0, Math.floor(Number(extraCoinCost) || 0))
  if (economyService.getCoins(userId) < coinsRequired) {
    return { ok: false, reason: "insufficient-coins", required: coinsRequired, available: economyService.getCoins(userId) }
  }
  const items = offer.items && typeof offer.items === "object" ? offer.items : {}
  for (const [key, qtyRaw] of Object.entries(items)) {
    const qty = Math.max(0, Math.floor(Number(qtyRaw) || 0))
    if (qty <= 0) continue
    const available = economyService.getItemQuantity(userId, key)
    if (available < qty) {
      return { ok: false, reason: "insufficient-item", itemKey: key, required: qty, available }
    }
  }
  return { ok: true }
}

function formatQuestProgressLine(quest = {}) {
  const progress = Math.max(0, Math.floor(Number(quest.progress) || 0))
  const target = Math.max(1, Math.floor(Number(quest.target) || 1))
  const completed = Boolean(quest.completed)
  const claimed = Boolean(quest.claimed)
  const stateLabel = claimed ? "RESGATADA" : (completed ? "PRONTA" : "EM PROGRESSO")
  return (
    `${quest.id} | ${quest.title}\n` +
    `Progresso: *${progress}/${target}* | Status: *${stateLabel}*\n` +
    `Recompensa: *${Math.floor(Number(quest.rewardXp) || 0)} XP* + *${Math.floor(Number(quest.rewardCoins) || 0)} ${CURRENCY_LABEL}*`
  )
}

function grantCommandXp(economyService, userId, xpAmount, source, meta = {}) {
  const safeXp = Math.max(0, Math.floor(Number(xpAmount) || 0))
  if (safeXp <= 0) return { ok: false, granted: 0 }
  if (typeof economyService?.addXp !== "function") return { ok: false, granted: 0 }
  return economyService.addXp(userId, safeXp, {
    source,
    ...meta,
  })
}

function buildXpRewardText(xpResult, xpAmount) {
  const granted = Math.max(0, Math.floor(Number(xpAmount) || 0))
  if (!granted) return ""
  const levelUps = Math.max(0, Math.floor(Number(xpResult?.levelsGained) || 0))
  const levelNow = Math.max(1, Math.floor(Number(xpResult?.level) || 1))
  const milestoneRewards = Array.isArray(xpResult?.levelRewards) ? xpResult.levelRewards : []
  const rewardLines = []
  for (const reward of milestoneRewards) {
    const rewardLevel = Math.max(1, Math.floor(Number(reward?.level) || 1))
    const rewardCoins = Math.max(0, Math.floor(Number(reward?.coins) || 0))
    const itemSegments = (Array.isArray(reward?.items) ? reward.items : [])
      .map((entry) => {
        const itemKey = String(entry?.key || "").trim()
        const itemQty = Math.max(0, Math.floor(Number(entry?.quantity) || 0))
        if (!itemKey || itemQty <= 0) return ""
        return `${itemQty}x ${itemKey}`
      })
      .filter(Boolean)
    const itemText = itemSegments.length > 0 ? ` + ${itemSegments.join(", ")}` : ""
    rewardLines.push(`🏆 Recompensa de nível ${rewardLevel}: +${rewardCoins} ${CURRENCY_LABEL}${itemText}.`)
  }

  if (levelUps > 0) {
    return `\n⭐ XP: +${granted} (level up +${levelUps}, nível atual ${levelNow}).${rewardLines.length ? `\n${rewardLines.join("\n")}` : ""}`
  }
  return `\n⭐ XP: +${granted}.${rewardLines.length ? `\n${rewardLines.join("\n")}` : ""}`
}

function cleanupUserLinkedState(storage, userId) {
  const normalizedUserId = String(userId || "")
  if (!normalizedUserId) {
    return { teamsLeft: 0, teamsDeleted: 0, tradesCancelled: 0 }
  }

  let teamsLeft = 0
  let teamsDeleted = 0
  let tradesCancelled = 0

  try {
    if (typeof storage?.getUserTeamId === "function") {
      const teamId = storage.getUserTeamId(normalizedUserId)
      if (teamId) {
        const removed = storage.removeTeamMember?.(teamId, normalizedUserId)
        if (removed) teamsLeft += 1
        const remainingMembers = storage.getTeamMembers?.(teamId) || []
        if (remainingMembers.length === 0 && storage.deleteTeam?.(teamId)) {
          teamsDeleted += 1
        }
      }
    }
  } catch (_) {}

  try {
    if (typeof storage?.getCache === "function" && typeof storage?.setGameState === "function") {
      const cache = storage.getCache() || {}
      const gameStates = cache.gameStates && typeof cache.gameStates === "object" ? cache.gameStates : {}
      for (const groupId of Object.keys(gameStates)) {
        const tradeState = storage.getGameState(groupId, TRADE_STATE_KEY)
        if (!tradeState || typeof tradeState !== "object") continue
        const trades = tradeState.trades && typeof tradeState.trades === "object" ? tradeState.trades : {}
        let changed = false
        for (const trade of Object.values(trades)) {
          if (!trade || trade.status !== "active") continue
          if (trade.initiator !== normalizedUserId && trade.counterparty !== normalizedUserId) continue
          trade.status = "cancelled"
          trade.phase = "cancelled"
          trade.updatedAt = Date.now()
          if (!Array.isArray(trade.events)) trade.events = []
          trade.events.push({
            at: Date.now(),
            type: "trade.cancelled.account-delete",
            by: "system",
            payload: { redacted: true },
          })
          changed = true
          tradesCancelled += 1
        }
        if (changed) {
          storage.setGameState(groupId, TRADE_STATE_KEY, {
            trades,
            history: Array.isArray(tradeState.history) ? tradeState.history : [],
          })
        }
      }
    }
  } catch (_) {}

  return { teamsLeft, teamsDeleted, tradesCancelled }
}

async function handleEconomyCommands(ctx) {
  const {
    sock,
    from,
    sender,
    cmd,
    cmdName,
    cmdArg1,
    cmdArg2,
    cmdParts,
    mentioned,
    prefix,
    isGroup,
    senderIsAdmin,
    isOverrideSender,
    jidNormalizedUser,
    storage,
    economyService,
    parseQuantity,
    formatDuration,
    buildEconomyStatsText,
    buildInventoryText,
    incrementUserStat,
    applyPunishment,
    botHasGroupAdminPrivileges,
    rawText,
    raffleRevealDelayMs,
    raffleOptInWindowMs,
    registrationService,
  } = ctx

  const normalizedCmdName = String(cmdName || "").trim().toLowerCase()
  const commandPrefix = String(prefix || "")
  const economyCommandNames = new Set([
    `${commandPrefix}economia`,
    `${commandPrefix}perfil`,
    `${commandPrefix}xp`,
    `${commandPrefix}missao`,
    `${commandPrefix}missoes`,
    `${commandPrefix}missaosemanal`,
    `${commandPrefix}missoesemanais`,
    `${commandPrefix}guia`,
    `${commandPrefix}coinsranking`,
    `${commandPrefix}xpranking`,
    `${commandPrefix}extrato`,
    `${commandPrefix}loja`,
    `${commandPrefix}comprar`,
    `${commandPrefix}comprarpara`,
    `${commandPrefix}vender`,
    `${commandPrefix}doarcoins`,
    `${commandPrefix}doaritem`,
    `${commandPrefix}roubar`,
    `${commandPrefix}daily`,
    `${commandPrefix}carepackage`,
    `${commandPrefix}cassino`,
    `${commandPrefix}aposta`,
    `${commandPrefix}lootbox`,
    `${commandPrefix}falsificar`,
    `${commandPrefix}usarpasse`,
    `${commandPrefix}trabalho`,
    `${commandPrefix}setcoins`,
    `${commandPrefix}addcoins`,
    `${commandPrefix}removecoins`,
    `${commandPrefix}additem`,
    `${commandPrefix}removeitem`,
    `${commandPrefix}trade`,
    `${commandPrefix}team`,
    `${commandPrefix}time`,
    `${commandPrefix}cupom`,
    `${commandPrefix}loteria`,
    `${commandPrefix}deletarconta ou ${commandPrefix}deleteconta`
  ].map((entry) => String(entry || "").toLowerCase()))
  const isEconomyCommandInvocation = economyCommandNames.has(normalizedCmdName)

  const limits = typeof economyService.getOperationLimits === "function"
    ? economyService.getOperationLimits()
    : {
      maxCoinsBalance: 2_000_000_000,
      maxCoinOperation: 50_000_000,
      maxItemStack: 100_000,
      maxItemOperation: 10_000,
      maxLootboxOpenPerCall: 10,
      maxForgeQuantity: 1_000,
    }

  const applyMentionPolicy = (userIds = []) => {
    const unique = [...new Set((userIds || []).filter(Boolean))]
    return unique.filter((userId) => {
      const isRegistered = typeof registrationService?.isRegistered === "function"
        ? registrationService.isRegistered(userId)
        : true
      if (!isRegistered) return false
      if (typeof economyService.isMentionOptIn !== "function") return true
      return economyService.isMentionOptIn(userId)
    })
  }

  const hasPublicVisibility = (userId = "") => {
    const isRegistered = typeof registrationService?.isRegistered === "function"
      ? registrationService.isRegistered(userId)
      : true
    if (!isRegistered) return false

    const mentionOptIn = typeof economyService.isMentionOptIn === "function"
      ? economyService.isMentionOptIn(userId)
      : true
    const profile = typeof economyService.getProfile === "function"
      ? economyService.getProfile(userId)
      : null
    const customLabel = String(profile?.preferences?.publicLabel || "").trim()
    return Boolean(mentionOptIn || customLabel)
  }

  const getPublicRankingLabel = (userId = "") => {
    const profile = typeof economyService.getProfile === "function"
      ? economyService.getProfile(userId)
      : null
    const customLabel = String(profile?.preferences?.publicLabel || "").trim()
    if (customLabel) return customLabel

    const mentionOptIn = typeof economyService.isMentionOptIn === "function"
      ? economyService.isMentionOptIn(userId)
      : true
    if (mentionOptIn) {
      return `@${String(userId || "").split("@")[0]}`
    }

    return ""
  }

  if (cmdName === prefix + "mentions") {
    const action = String(cmdArg1 || "").trim().toLowerCase()
    if (!action || action === "status") {
      const current = typeof economyService.isMentionOptIn === "function"
        ? economyService.isMentionOptIn(sender)
        : false
      await sock.sendMessage(from, {
        text: `Preferência de menção em rankings/listas: *${current ? "ATIVADA" : "DESATIVADA"}*\nUse: !mentions on | !mentions off`,
      })
      return true
    }

    if (!["on", "off"].includes(action)) {
      await sock.sendMessage(from, { text: "Use: !mentions on | !mentions off" })
      return true
    }

    if (typeof economyService.setMentionOptIn === "function") {
      economyService.setMentionOptIn(sender, action === "on")
    }
    await sock.sendMessage(from, {
      text: `✅ Menções em rankings/listas ${action === "on" ? "ativadas" : "desativadas"}.`,
    })
    return true
  }

  if (cmdName === prefix + "apelido") {
    const label = String(cmdParts.slice(1).join(" ") || "").trim()
    if (!label) {
      const profile = typeof economyService.getProfile === "function"
        ? economyService.getProfile(sender)
        : null
      const customLabel = String(profile?.preferences?.publicLabel || "").trim()
      const mentionOptIn = typeof economyService.isMentionOptIn === "function"
        ? economyService.isMentionOptIn(sender)
        : false
      const current = typeof economyService.getStablePublicLabel === "function"
        ? economyService.getStablePublicLabel(sender)
        : sender.split("@")[0]
      await sock.sendMessage(from, {
        text:
          `Seu identificador público atual: *${current}*\n` +
          (mentionOptIn || customLabel
            ? "Use: !apelido <novo nome>"
            : "Como você está com menções desativadas, defina um apelido com: !apelido <novo nome>"),
      })
      return true
    }

    if (typeof economyService.setPublicLabel === "function") {
      economyService.setPublicLabel(sender, label)
    }
    await sock.sendMessage(from, {
      text: `✅ Apelido público atualizado para: *${label.slice(0, 32)}*`,
    })
    return true
  }

  if (cmdName === prefix + "deletarconta" || cmdName === prefix + "deleteconta") {
    const now = Date.now()
    const normalizedSender = String(sender || "").trim().toLowerCase()
    const actionText = String(cmdParts.slice(1).join(" ") || "").trim()
    const pending = pendingAccountDeletionByUser.get(normalizedSender)

    if (pending && pending.expiresAt <= now) {
      pendingAccountDeletionByUser.delete(normalizedSender)
    }

    if (!actionText || actionText.toLowerCase() === "status") {
      const current = pendingAccountDeletionByUser.get(normalizedSender)
      if (current) {
        await sock.sendMessage(from, {
          text:
            `⚠️ Você iniciou a exclusão da conta.
Envie a frase EXATA para confirmar em ${formatDuration(current.expiresAt - now)}:
\n${ACCOUNT_DELETE_CONFIRMATION_PHRASE}
\nUse *${prefix}deletarconta cancelar* para abortar.`,
        })
        return true
      }

      await sock.sendMessage(from, {
        text:
          `⚠️ Este comando remove seu perfil econômico e vínculos relacionados.
Passo 1: envie *${prefix}deletarconta confirmar*
Passo 2: envie a frase EXATA abaixo em até ${formatDuration(ACCOUNT_DELETE_CONFIRMATION_TTL_MS)}:
\n${ACCOUNT_DELETE_CONFIRMATION_PHRASE}
\nUse *${prefix}deletarconta cancelar* para abortar.`,
      })
      return true
    }

    if (actionText.toLowerCase() === "confirmar") {
      pendingAccountDeletionByUser.set(normalizedSender, {
        startedAt: now,
        expiresAt: now + ACCOUNT_DELETE_CONFIRMATION_TTL_MS,
      })
      await sock.sendMessage(from, {
        text:
          `⚠️ Confirmação iniciada. Agora envie a frase EXATA em até ${formatDuration(ACCOUNT_DELETE_CONFIRMATION_TTL_MS)}:
\n${ACCOUNT_DELETE_CONFIRMATION_PHRASE}
\nUse *${prefix}deletarconta cancelar* para abortar.`,
      })
      return true
    }

    if (actionText.toLowerCase() === "cancelar") {
      pendingAccountDeletionByUser.delete(normalizedSender)
      await sock.sendMessage(from, { text: "✅ Solicitação de exclusão de conta cancelada." })
      return true
    }

    const activePending = pendingAccountDeletionByUser.get(normalizedSender)
    if (!activePending) {
      await sock.sendMessage(from, {
        text: `Confirmação não iniciada. Use *${prefix}deletarconta confirmar* primeiro.`,
      })
      return true
    }

    if (activePending.expiresAt <= now) {
      pendingAccountDeletionByUser.delete(normalizedSender)
      await sock.sendMessage(from, {
        text: `⏰ Janela de confirmação expirada. Reinicie com *${prefix}deletarconta confirmar*.`,
      })
      return true
    }

    if (actionText !== ACCOUNT_DELETE_CONFIRMATION_PHRASE) {
      await sock.sendMessage(from, {
        text:
          `Frase inválida. Envie a frase EXATA para confirmar:
\n${ACCOUNT_DELETE_CONFIRMATION_PHRASE}
\nOu cancele com *${prefix}deletarconta cancelar*.`,
      })
      return true
    }

    pendingAccountDeletionByUser.delete(normalizedSender)

    const hadEconomyProfile = Boolean(typeof economyService.getProfile === "function" && economyService.getProfile(sender))
    const economyDeleted = typeof economyService.deleteUserProfile === "function"
      ? economyService.deleteUserProfile(sender)
      : false
    const registrationDeleted = typeof registrationService?.unregisterUser === "function"
      ? registrationService.unregisterUser(sender)
      : { ok: false, reason: "not-available" }
    const linkedCleanup = cleanupUserLinkedState(storage, sender)

    telemetry.incrementCounter("economy.account.delete", 1)
    telemetry.appendEvent("economy.account.delete", {
      userId: sender,
      groupId: from,
      hadEconomyProfile,
      economyDeleted,
      registrationDeleted: Boolean(registrationDeleted?.ok),
      teamsLeft: linkedCleanup.teamsLeft,
      teamsDeleted: linkedCleanup.teamsDeleted,
      tradesCancelled: linkedCleanup.tradesCancelled,
      redacted: true,
    })

    await sock.sendMessage(from, {
      text:
        `🗑️ Conta removida com sucesso.
Perfil econômico: *${economyDeleted ? "apagado" : "não encontrado"}*.
Registro: *${registrationDeleted?.ok ? "removido" : "não encontrado"}*.
Vínculos limpos: *${linkedCleanup.teamsLeft}* saída(s) de equipe, *${linkedCleanup.teamsDeleted}* equipe(s) removida(s), *${linkedCleanup.tradesCancelled}* trade(s) cancelada(s).`,
    })
    return true
  }

  if (cmdName === prefix + "xp") {
    const xp = typeof economyService.getXpProfile === "function"
      ? economyService.getXpProfile(sender)
      : { level: 1, xp: 0, xpToNextLevel: 100, seasonPoints: 0 }
    const globalXpPos = typeof economyService.getUserGlobalXpPosition === "function"
      ? economyService.getUserGlobalXpPosition(sender)
      : null
    await sock.sendMessage(from, {
      text:
        `Progressão de @${sender.split("@")[0]}\n` +
        `Nível: *${xp.level}*\n` +
        `XP atual: *${xp.xp}/${xp.xpToNextLevel}*\n` +
        `Pontos de temporada: *${xp.seasonPoints}*\n` +
        `Posição global XP: *${globalXpPos || "N/A"}*\n\n` +
        `Use *${prefix}missao* para ver missões diárias.`,
      mentions: [sender],
    })
    return true
  }

  if (cmdName === prefix + "missao" || cmdName === prefix + "missoes") {
    const action = String(cmdArg1 || "").trim().toLowerCase()

    if (action === "claim" || action === "resgatar") {
      const questId = String(cmdArg2 || "").trim().toUpperCase()
      if (!questId) {
        await sock.sendMessage(from, { text: `Use: ${prefix}missao claim <Q1|Q2|Q3>` })
        return true
      }

      const claimed = typeof economyService.claimDailyQuest === "function"
        ? economyService.claimDailyQuest(sender, questId)
        : { ok: false, reason: "not-supported" }

      if (!claimed.ok) {
        if (claimed.reason === "already-claimed") {
          await sock.sendMessage(from, { text: `A missão *${claimed.questId || questId}* já foi resgatada hoje.` })
          return true
        }
        if (claimed.reason === "not-completed") {
          await sock.sendMessage(from, {
            text: `A missão *${claimed.questId || questId}* ainda não foi concluída. Progresso: *${claimed.progress || 0}/${claimed.target || 1}*.`,
          })
          return true
        }
        if (claimed.reason === "invalid-quest") {
          await sock.sendMessage(from, { text: `Missão inválida. Use ${prefix}missao para listar as missões de hoje.` })
          return true
        }
        await sock.sendMessage(from, { text: "Falha ao resgatar missão diária." })
        return true
      }

      await sock.sendMessage(from, {
        text:
          `✅ Missão *${claimed.questId}* resgatada!\n` +
          `Recompensas: *+${claimed.rewardXp} XP* e *+${claimed.rewardCoins} ${CURRENCY_LABEL}*.` +
          (claimed.xpResult?.levelsGained > 0
            ? `\n🎉 Level up: +${claimed.xpResult.levelsGained} nível(is). Nível atual: *${claimed.xpResult.level}*.`
            : ""),
      })
      return true
    }

    const questState = typeof economyService.getDailyQuestState === "function"
      ? economyService.getDailyQuestState(sender)
      : { dayKey: "-", quests: [] }
    const quests = Array.isArray(questState.quests) ? questState.quests : []
    if (quests.length === 0) {
      await sock.sendMessage(from, {
        text: "Não há missões disponíveis no momento.",
      })
      return true
    }

    await sock.sendMessage(from, {
      text:
        `Missões diárias (${questState.dayKey || "hoje"})\n\n` +
        quests.map((quest) => formatQuestProgressLine(quest)).join("\n\n") +
        `\n\nResgate com: *${prefix}missao claim <Q1|Q2|Q3>*`,
    })
    return true
  }

  if (cmdName === prefix + "missaosemanal" || cmdName === prefix + "missoes" || cmdName === prefix + "missoesemanais") {
    const action = String(cmdArg1 || "").trim().toLowerCase()

    if (action === "claim" || action === "resgatar") {
      const questId = String(cmdArg2 || "").trim().toUpperCase()
      if (!questId) {
        await sock.sendMessage(from, { text: `Use: ${prefix}missaoweekly claim <W1|W2|W3|W4|W5>` })
        return true
      }

      const claimed = typeof economyService.claimWeeklyQuest === "function"
        ? economyService.claimWeeklyQuest(sender, questId)
        : { ok: false, reason: "not-supported" }

      if (!claimed.ok) {
        if (claimed.reason === "already-claimed") {
          await sock.sendMessage(from, { text: `A missão semanal *${claimed.questId || questId}* já foi resgatada esta semana.` })
          return true
        }
        if (claimed.reason === "not-completed") {
          await sock.sendMessage(from, {
            text: `A missão semanal *${claimed.questId || questId}* ainda não foi concluída. Progresso: *${claimed.progress || 0}/${claimed.target || 1}*.`,
          })
          return true
        }
        if (claimed.reason === "invalid-quest") {
          await sock.sendMessage(from, { text: `Missão inválida. Use ${prefix}missaoweekly para listar as missões da semana.` })
          return true
        }
        await sock.sendMessage(from, { text: "Falha ao resgatar missão semanal." })
        return true
      }

      await sock.sendMessage(from, {
        text:
          `✅ Missão semanal *${claimed.questId}* resgatada!\n` +
          `Recompensas: *+${claimed.rewardXp} XP* e *+${claimed.rewardCoins} ${CURRENCY_LABEL}*.` +
          (claimed.xpResult?.levelsGained > 0
            ? `\n🎉 Level up: +${claimed.xpResult.levelsGained} nível(is). Nível atual: *${claimed.xpResult.level}*.`
            : ""),
      })
      return true
    }

    const questState = typeof economyService.getWeeklyQuestState === "function"
      ? economyService.getWeeklyQuestState(sender)
      : { weekKey: "-", quests: [] }
    const quests = Array.isArray(questState.quests) ? questState.quests : []
    if (quests.length === 0) {
      await sock.sendMessage(from, {
        text: "Não há missões semanais disponíveis no momento.",
      })
      return true
    }

    await sock.sendMessage(from, {
      text:
        `Missões semanais (${questState.weekKey || "esta semana"})\n\n` +
        quests.map((quest) => formatQuestProgressLine(quest)).join("\n\n") +
        `\n\nResgate com: *${prefix}missaoweekly claim <W1|W2|W3|W4|W5>*`,
    })
    return true
  }

  if (cmdName === prefix + "guia") {
    const guidePart1 =
      `GUIA DE ECONOMIA (1/2)\n\n` +
      `Loop base para subir de forma consistente:\n` +
      `1. Resgate *${prefix}daily* todo dia.\n` +
      `2. Rode *${prefix}trabalho* para renda com risco moderado.\n` +
      `3. Use *${prefix}missao* e finalize Q1/Q2/Q3 para XP + moedas.\n` +
      `4. Use *${prefix}missaoweekly* para missões com maiores recompensas.\n` +
      `5. Consulte *${prefix}xp* e *${prefix}xpranking* para acompanhar progressao.\n\n` +
      `Comandos-chave:\n` +
      `- Perfil e historico: ${prefix}perfil, ${prefix}extrato\n` +
      `- Loja e inventario: ${prefix}loja, ${prefix}comprar, ${prefix}vender\n` +
      `- Interacao social: ${prefix}doarcoins, ${prefix}doaritem\n` +
      `- Rotina diaria: ${prefix}daily, ${prefix}trabalho, ${prefix}missao claim <Q1|Q2|Q3>`

    const guidePart2 =
      `GUIA DE ECONOMIA (2/2)\n\n` +
      `Rotas de risco:\n` +
      `- Segura: daily + trabalho + missoes.\n` +
      `- Balanceada: segura + cassino/aposta com valor controlado, além de participar em jogos de grupo.\n` +
      `- Agressiva: incluir roubo, lootbox e trades com validacao cuidadosa.\n\n` +
      `Dicas praticas:\n` +
      `- Nao comprometa todo saldo em uma unica jogada.\n` +
      `- Use ${prefix}trade com revisao (${prefix}trade review) antes de aceitar.\n` +
      `- Revise cooldowns e progresso com frequencia para manter eficiencia.\n` +
      `- Cada 5 niveis ha recompensa automatica de progressao.`

    const guideTarget = isGroup ? sender : from
    await sock.sendMessage(guideTarget, { text: guidePart1 })
    await sock.sendMessage(guideTarget, { text: guidePart2 })

    if (isGroup) {
      await sock.sendMessage(from, {
        text: `📩 @${sender.split("@")[0]}, te enviei o guia de economia no privado em 2 partes.`,
        mentions: [sender],
      })
    }

    telemetry.incrementCounter("economy.guide.sent", 1)
    telemetry.appendEvent("economy.guide.sent", {
      groupId: isGroup ? from : null,
      userId: sender,
      parts: 2,
      via: isGroup ? "group" : "dm",
    })
    return true
  }

  // Team system commands
  if (cmdName === prefix + "time" || cmdName === prefix + "team") {
    const actionRaw = String(cmdArg1 || "").trim().toLowerCase()
    const TEAM_ACTION_ALIASES = {
      criar: "create",
      create: "create",
      entra: "join",
      join: "join",
      aceitar: "accept",
      accept: "accept",
      promover: "promote",
      promote: "promote",
      rebaixar: "demote",
      demote: "demote",
      sair: "leave",
      leave: "leave",
      membros: "members",
      members: "members",
      stats: "stats",
      info: "info",
      listar: "list",
      lista: "list",
      list: "list",
      doarcoins: "depositarcoins",
      depositarcoins: "depositarcoins",
      depositcoins: "depositarcoins",
      doaritem: "depositaritem",
      depositaritem: "depositaritem",
      deposititem: "depositaritem",
      sacarcoins: "retirarcoins",
      retirarcoins: "retirarcoins",
      withdrawcoins: "retirarcoins",
      sacaritem: "retiraritem",
      retiraritem: "retiraritem",
      withdrawitem: "retiraritem",
      emergencia: "emergencia",
    }
    const action = TEAM_ACTION_ALIASES[actionRaw] || actionRaw

    // Generate unique team ID from timestamp and random
    const generateTeamId = () => {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
      let teamId = "T"
      for (let i = 0; i < 5; i++) {
        teamId += chars.charAt(Math.floor(Math.random() * chars.length))
      }
      // Ensure uniqueness
      while (storage.getTeam ? storage.getTeam(teamId) : false) {
        teamId = "T"
        for (let i = 0; i < 5; i++) {
          teamId += chars.charAt(Math.floor(Math.random() * chars.length))
        }
      }
      return teamId
    }

    if (action === "create") {
      const teamName = String(cmdArg2 || "").trim().slice(0, 50)
      if (!teamName) {
        await sock.sendMessage(from, {
          text: `Use: ${prefix}${cmdName} create <nome do time>`,
        })
        return true
      }

      const userTeamId = storage.getUserTeamId(sender)
      if (userTeamId) {
        const existingTeam = storage.getTeam(userTeamId)
        await sock.sendMessage(from, {
          text: `Voce ja faz parte do time *${existingTeam?.name || userTeamId}*. Use ${prefix}${cmdName} leave para sair.`,
        })
        return true
      }

      const newTeamId = generateTeamId()
      const created = storage.createTeam(newTeamId, teamName, sender)
      if (!created) {
        await sock.sendMessage(from, {
          text: "Falha ao criar time.",
        })
        return true
      }

      await sock.sendMessage(from, {
        text: `✅ Time *${teamName}* criado com sucesso!\nID do time: *${newTeamId}*\n\nCompartilhe este ID para outros jogadores se juntarem.`,
      })

      telemetry.incrementCounter("team.created", 1)
      telemetry.appendEvent("team.created", {
        teamId: newTeamId,
        teamName,
        createdBy: sender,
        groupId: isGroup ? from : null,
      })
      return true
    }

    if (action === "join") {
      const requestedTeamId = String(cmdArg2 || "").trim().toUpperCase()
      if (!requestedTeamId) {
        await sock.sendMessage(from, {
          text: `Use: ${prefix}${cmdName} entra <teamID>`,
        })
        return true
      }

      const userTeamId = storage.getUserTeamId(sender)
      if (userTeamId) {
        await sock.sendMessage(from, {
          text: `Você já está em um time (${userTeamId}). Use ${prefix}${cmdName} sair antes de entrar em outro.`,
        })
        return true
      }

      const team = storage.getTeam(requestedTeamId)
      if (!team) {
        await sock.sendMessage(from, {
          text: `Time ${requestedTeamId} não encontrado.`,
        })
        return true
      }

      if (typeof storage.inviteToTeam !== "function") {
        await sock.sendMessage(from, {
          text: `⛔ ${prefix}${cmdName} join foi desativado temporariamente. Use ${prefix}${cmdName} accept <team ID> após receber convite.`,
        })
        return true
      }

      storage.inviteToTeam(requestedTeamId, sender, "requested")
      await sock.sendMessage(from, {
        text:
          `📨 Pedido de entrada enviado para *${team.name || requestedTeamId}*.
Use ${prefix}${cmdName} aceitar @usuário ${requestedTeamId} (owner/tenente) para aprovar.`,
      })
      return true
    }

    if (action === "invite") {
      const userTeamId = storage.getUserTeamId(sender)
      if (!userTeamId) {
        await sock.sendMessage(from, {
          text: `Voce nao faz parte de um time. Use ${prefix}${cmdName} create <nome> para criar um.`,
        })
        return true
      }

      const inviteTargets = mentioned && mentioned.length > 0 ? mentioned : []
      if (inviteTargets.length === 0) {
        await sock.sendMessage(from, {
          text: `Use: ${prefix}${cmdName} invite @usuario(s)`,
        })
        return true
      }

      const team = storage.getTeam(userTeamId)
      const inviteResults = []
      for (const targetId of inviteTargets) {
        if (team.members.includes(targetId)) {
          inviteResults.push(`@${targetId.split("@")[0]} ja esta no time.`)
          continue
        }
        const targetCurrentTeam = storage.getUserTeamId(targetId)
        if (targetCurrentTeam) {
          inviteResults.push(`@${targetId.split("@")[0]} ja faz parte de outro time.`)
          continue
        }
        storage.inviteToTeam(userTeamId, targetId, "pending")
        inviteResults.push(`@${targetId.split("@")[0]} convidado.`)
      }

      await sock.sendMessage(from, {
        text: `Convites enviados:\n${inviteResults.join("\n")}`,
        mentions: inviteTargets,
      })

      telemetry.incrementCounter("team.invite.sent", inviteTargets.length)
      telemetry.appendEvent("team.invite.sent", {
        teamId: userTeamId,
        invitedCount: inviteTargets.length,
        invitedBy: sender,
        groupId: isGroup ? from : null,
      })
      return true
    }

    if (action === "accept") {
      const requestedUser = mentioned[0]
      const approvalTeamId = String((requestedUser ? cmdParts[3] : cmdArg2) || "").trim().toUpperCase()

      // Owner/lieutenant approval flow: !time aceitar @user TEAMID
      if (requestedUser) {
        if (!approvalTeamId) {
          await sock.sendMessage(from, { text: `Use: ${prefix}${cmdName} aceitar @user <teamID>` })
          return true
        }

        const team = storage.getTeam(approvalTeamId)
        if (!team) {
          await sock.sendMessage(from, { text: `Time ${approvalTeamId} não existe.` })
          return true
        }

        const canApprove = typeof storage.isTeamOwnerOrLieutenant === "function"
          ? storage.isTeamOwnerOrLieutenant(approvalTeamId, sender)
          : (team.createdBy === sender)
        if (!canApprove) {
          await sock.sendMessage(from, { text: "Apenas dono ou tenente pode aprovar entradas." })
          return true
        }

        if (storage.getUserTeamId(requestedUser)) {
          await sock.sendMessage(from, { text: "Esse usuário já participa de outro time." })
          return true
        }

        const invites = storage.getTeamInvites(approvalTeamId)
        const inviteStatus = String(invites?.[requestedUser] || "").toLowerCase()
        if (inviteStatus !== "requested" && inviteStatus !== "pending") {
          await sock.sendMessage(from, { text: "Esse usuário não possui pedido/convite pendente para este time." })
          return true
        }

        const approved = storage.addTeamMember(approvalTeamId, requestedUser)
        if (!approved) {
          await sock.sendMessage(from, { text: "Falha ao aprovar entrada no time." })
          return true
        }

        await sock.sendMessage(from, {
          text: `✅ @${requestedUser.split("@")[0]} entrou no time *${team.name || approvalTeamId}*.`,
          mentions: [requestedUser],
        })
        return true
      }

      const acceptTeamId = String(cmdArg2 || "").trim().toUpperCase()
      if (!acceptTeamId) {
        await sock.sendMessage(from, {
          text: `Use: ${prefix}${cmdName} accept <team ID>`,
        })
        return true
      }

      const currentTeamId = storage.getUserTeamId(sender)
      if (currentTeamId) {
        const currentTeam = storage.getTeam(currentTeamId)
        await sock.sendMessage(from, {
          text: `Voce ja faz parte do time *${currentTeam?.name || currentTeamId}*.`,
        })
        return true
      }

      const targetTeam = storage.getTeam(acceptTeamId)
      if (!targetTeam) {
        await sock.sendMessage(from, {
          text: `Time *${acceptTeamId}* nao existe.`,
        })
        return true
      }

      const invites = storage.getTeamInvites(acceptTeamId)
      const inviteStatus = String(invites?.[sender] || "").toLowerCase()
      if (inviteStatus !== "pending") {
        await sock.sendMessage(from, {
          text: `Voce nao possui convite pendente para o time *${targetTeam.name}* (${acceptTeamId}).`,
        })
        return true
      }

      const added = storage.addTeamMember(acceptTeamId, sender)
      if (!added) {
        await sock.sendMessage(from, {
          text: `Falha ao aceitar convite.`,
        })
        return true
      }

      await sock.sendMessage(from, {
        text: `✅ Convite aceito! Voce agora faz parte do time *${targetTeam.name}*!`,
      })

      telemetry.incrementCounter("team.invite.accepted", 1)
      telemetry.appendEvent("team.invite.accepted", {
        teamId: acceptTeamId,
        teamName: targetTeam.name,
        userId: sender,
        groupId: isGroup ? from : null,
      })
      return true
    }

    if (action === "promote") {
      const userTeamId = storage.getUserTeamId(sender)
      const target = mentioned[0]
      if (!userTeamId || !target) {
        await sock.sendMessage(from, { text: `Use: ${prefix}${cmdName} promover @user` })
        return true
      }
      const team = storage.getTeam(userTeamId)
      if (!team || team.createdBy !== sender) {
        await sock.sendMessage(from, { text: "Somente o dono do time pode promover tenentes." })
        return true
      }
      if (!Array.isArray(team.members) || !team.members.includes(target)) {
        await sock.sendMessage(from, { text: "O alvo precisa ser membro do seu time." })
        return true
      }
      const ok = typeof storage.promoteTeamLieutenant === "function"
        ? storage.promoteTeamLieutenant(userTeamId, target)
        : false
      if (!ok) {
        await sock.sendMessage(from, { text: "Falha ao promover (talvez já seja tenente)." })
        return true
      }
      await sock.sendMessage(from, {
        text: `✅ @${target.split("@")[0]} foi promovido a tenente do time *${team.name || userTeamId}*.`,
        mentions: [target],
      })
      return true
    }

    if (action === "demote") {
      const userTeamId = storage.getUserTeamId(sender)
      const target = mentioned[0]
      if (!userTeamId || !target) {
        await sock.sendMessage(from, { text: `Use: ${prefix}${cmdName} rebaixar @user` })
        return true
      }
      const team = storage.getTeam(userTeamId)
      if (!team || team.createdBy !== sender) {
        await sock.sendMessage(from, { text: "Somente o dono do time pode rebaixar tenentes." })
        return true
      }
      const ok = typeof storage.demoteTeamLieutenant === "function"
        ? storage.demoteTeamLieutenant(userTeamId, target)
        : false
      if (!ok) {
        await sock.sendMessage(from, { text: "Falha ao rebaixar (usuário não é tenente)." })
        return true
      }
      await sock.sendMessage(from, {
        text: `✅ @${target.split("@")[0]} voltou ao cargo de membro no time *${team.name || userTeamId}*.`,
        mentions: [target],
      })
      return true
    }

    if (action === "members" || action === "membros") {
      const userTeamId = storage.getUserTeamId(sender)
      if (!userTeamId) {
        await sock.sendMessage(from, {
          text: `Voce nao faz parte de um time.`,
        })
        return true
      }

      const members = economyService.getTeamMembers(userTeamId, storage)
      const team = storage.getTeam(userTeamId)
      const memberLines = members.map((m, idx) => {
        return `${idx + 1}. *Nível ${m.level}* - ${m.xp} XP (${m.coins} Epsteincoins)`
      })

      await sock.sendMessage(from, {
        text:
          `*${team.name}* - Membros (${members.length})\n\n` +
          memberLines.join("\n") +
          `\n\nTotal do time: ${members.reduce((s, m) => s + m.coins, 0)} Epsteincoins`,
      })

      telemetry.incrementCounter("team.members.viewed", 1)
      return true
    }

    if (action === "info") {
      const userTeamId = storage.getUserTeamId(sender)
      if (!userTeamId) {
        await sock.sendMessage(from, {
          text: `Voce nao faz parte de um time.`,
        })
        return true
      }

      const team = storage.getTeam(userTeamId)
      const poolCoins = economyService.getTeamPoolCoins(userTeamId, storage)
      const poolItems = economyService.getTeamPoolItems(userTeamId, storage)
      const poolItemEntries = Object.entries(poolItems || {})
      const poolItemsText = poolItemEntries.length > 0
        ? poolItemEntries
          .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
          .slice(0, 10)
          .map(([itemKey, qty]) => `- ${itemKey} x${qty}`)
          .join("\n")
        : "- vazio"

      await sock.sendMessage(from, {
        text:
          `*${team?.name || userTeamId}* (${userTeamId})\n` +
          `Criado por: @${String(team?.createdBy || "").split("@")[0] || "-"}\n` +
          `Membros: ${(team?.members || []).length}\n` +
          `Pool coins: *${poolCoins}* ${CURRENCY_LABEL}\n` +
          `Pool itens:\n${poolItemsText}\n\n` +
          `Contribuir: ${prefix}${cmdName} depositarcoins <qtd> | ${prefix}${cmdName} depositaritem <item> [qtd]`,
        mentions: team?.createdBy ? [team.createdBy] : [],
      })

      telemetry.incrementCounter("team.info.viewed", 1)
      return true
    }

    if (action === "dispute") {
      const tradeId = String(cmdArg2 || "").trim().toUpperCase()
      if (!tradeId) {
        await sock.sendMessage(from, { text: "Use: !trade dispute <tradeId>" })
        return true
      }
      const trade = tradeState.trades[tradeId]
      if (!trade) {
        await sock.sendMessage(from, { text: "Trade não encontrado para disputa." })
        return true
      }
      const role = getTradeParticipantRole(trade, sender)
      if (!role) {
        await sock.sendMessage(from, { text: "Somente participantes podem abrir disputa." })
        return true
      }
      appendTradeEvent(trade, "trade.dispute", sender, { role })
      trade.updatedAt = Date.now()
      setTradeState(storage, from, tradeState)

      telemetry.incrementCounter("economy.trade.dispute", 1)
      telemetry.appendEvent("economy.trade.dispute", {
        groupId: from,
        tradeId,
        by: sender,
        initiator: trade.initiator,
        counterparty: trade.counterparty,
        status: trade.status,
        phase: trade.phase,
      })

      await sock.sendMessage(from, {
        text: `⚠️ Disputa registrada para o trade ${tradeId}. A equipe de override pode revisar pelos logs.`,
        mentions: [trade.initiator, trade.counterparty],
      })
      return true
    }

    if (action === "depositarcoins" || action === "depositcoins") {
      const userTeamId = storage.getUserTeamId(sender)
      if (!userTeamId) {
        await sock.sendMessage(from, { text: `Voce nao faz parte de um time.` })
        return true
      }

      const amount = parseQuantity(cmdParts[2], 0)
      if (amount <= 0) {
        await sock.sendMessage(from, { text: `Use: ${prefix}${cmdName} depositarcoins <quantidade>` })
        return true
      }

      if (!economyService.debitCoins(sender, amount, {
        type: "team-pool-deposit-coins",
        details: `Deposito no pool do time ${userTeamId}`,
        meta: { teamId: userTeamId, amount },
      })) {
        await sock.sendMessage(from, { text: "Saldo insuficiente para contribuir com o pool." })
        return true
      }

      if (!storage.addTeamPoolCoins(userTeamId, amount)) {
        economyService.creditCoins(sender, amount, {
          type: "team-pool-deposit-refund",
          details: `Estorno de deposito no pool ${userTeamId}`,
          meta: { teamId: userTeamId, amount },
        })
        await sock.sendMessage(from, { text: "Falha ao depositar no pool. Valor estornado." })
        return true
      }

      telemetry.incrementCounter("team.pool.coins.deposit", 1)
      telemetry.appendEvent("team.pool.coins.deposit", {
        teamId: userTeamId,
        userId: sender,
        amount,
        groupId: isGroup ? from : null,
      })

      await sock.sendMessage(from, {
        text: `✅ @${sender.split("@")[0]} depositou *${amount}* ${CURRENCY_LABEL} no pool do time.`,
        mentions: [sender],
      })
      return true
    }

    if (action === "depositaritem" || action === "deposititem") {
      const userTeamId = storage.getUserTeamId(sender)
      if (!userTeamId) {
        await sock.sendMessage(from, { text: `Voce nao faz parte de um time.` })
        return true
      }

      const itemKey = String(cmdParts[2] || "").trim()
      const quantity = parseQuantity(cmdParts[3], 1)
      if (!itemKey || quantity <= 0) {
        await sock.sendMessage(from, { text: `Use: ${prefix}${cmdName} depositaritem <item> [quantidade]` })
        return true
      }

      const normalizedItem = economyService.normalizeItemKey(itemKey)
      if (!normalizedItem) {
        await sock.sendMessage(from, { text: "Item invalido." })
        return true
      }

      const available = economyService.getItemQuantity(sender, normalizedItem)
      if (available < quantity) {
        await sock.sendMessage(from, { text: `Voce nao tem esse item nessa quantidade (disponivel: ${available}).` })
        return true
      }

      economyService.removeItem(sender, normalizedItem, quantity)
      if (!storage.addTeamPoolItem(userTeamId, normalizedItem, quantity)) {
        economyService.addItem(sender, normalizedItem, quantity)
        await sock.sendMessage(from, { text: "Falha ao depositar item no pool. Item estornado." })
        return true
      }

      telemetry.incrementCounter("team.pool.items.deposit", 1)
      telemetry.appendEvent("team.pool.items.deposit", {
        teamId: userTeamId,
        userId: sender,
        itemKey: normalizedItem,
        quantity,
        groupId: isGroup ? from : null,
      })

      await sock.sendMessage(from, {
        text: `✅ @${sender.split("@")[0]} depositou *${quantity}x ${normalizedItem}* no pool do time.`,
        mentions: [sender],
      })
      return true
    }

    if (action === "retirarcoins" || action === "withdrawcoins") {
      const userTeamId = storage.getUserTeamId(sender)
      if (!userTeamId) {
        await sock.sendMessage(from, { text: `Voce nao faz parte de um time.` })
        return true
      }

      const team = storage.getTeam(userTeamId)
      const canWithdraw = typeof storage.isTeamOwnerOrLieutenant === "function"
        ? storage.isTeamOwnerOrLieutenant(userTeamId, sender)
        : Boolean(team?.createdBy === sender)
      if (!canWithdraw) {
        await sock.sendMessage(from, {
          text: "Somente dono/tenente pode sacar do pool do time.",
        })
        return true
      }

      const lastWithdrawAt = typeof storage.getTeamLastWithdrawAt === "function"
        ? storage.getTeamLastWithdrawAt(userTeamId, sender)
        : 0
      const remainingMs = Math.max(0, (lastWithdrawAt + TEAM_WITHDRAW_COOLDOWN_MS) - Date.now())
      if (remainingMs > 0) {
        await sock.sendMessage(from, { text: `Cooldown de saque ativo. Aguarde ${formatDuration(remainingMs)}.` })
        return true
      }

      const amount = parseQuantity(cmdParts[2], 0)
      if (amount <= 0) {
        await sock.sendMessage(from, { text: `Use: ${prefix}${cmdName} retirarcoins <quantidade>` })
        return true
      }

      if (!storage.removeTeamPoolCoins(userTeamId, amount)) {
        await sock.sendMessage(from, { text: "Pool sem saldo suficiente para essa retirada." })
        return true
      }

      const credited = economyService.creditCoins(sender, amount, {
        type: "team-pool-withdraw-coins",
        details: `Retirada do pool do time ${userTeamId}`,
        meta: { teamId: userTeamId, amount },
      })
      if (credited <= 0) {
        storage.addTeamPoolCoins(userTeamId, amount)
        await sock.sendMessage(from, { text: "Falha ao creditar coins. Retirada desfeita." })
        return true
      }

      telemetry.incrementCounter("team.pool.coins.withdraw", 1)
      telemetry.appendEvent("team.pool.coins.withdraw", {
        teamId: userTeamId,
        userId: sender,
        amount: credited,
        groupId: isGroup ? from : null,
      })

      if (typeof storage.setTeamLastWithdrawAt === "function") {
        storage.setTeamLastWithdrawAt(userTeamId, sender, Date.now())
      }

      await sock.sendMessage(from, {
        text: `✅ Retirada concluida: *${credited}* ${CURRENCY_LABEL} do pool para @${sender.split("@")[0]}.`,
        mentions: [sender],
      })
      return true
    }

    if (action === "retiraritem" || action === "withdrawitem" || action === "emergencia") {
      const userTeamId = storage.getUserTeamId(sender)
      if (!userTeamId) {
        await sock.sendMessage(from, { text: `Voce nao faz parte de um time.` })
        return true
      }

      const team = storage.getTeam(userTeamId)
      const canWithdraw = typeof storage.isTeamOwnerOrLieutenant === "function"
        ? storage.isTeamOwnerOrLieutenant(userTeamId, sender)
        : Boolean(team?.createdBy === sender)
      if (!canWithdraw) {
        await sock.sendMessage(from, {
          text: "Somente dono/tenente pode sacar itens do pool do time.",
        })
        return true
      }

      const lastWithdrawAt = typeof storage.getTeamLastWithdrawAt === "function"
        ? storage.getTeamLastWithdrawAt(userTeamId, sender)
        : 0
      const remainingMs = Math.max(0, (lastWithdrawAt + TEAM_WITHDRAW_COOLDOWN_MS) - Date.now())
      if (remainingMs > 0) {
        await sock.sendMessage(from, { text: `Cooldown de saque ativo. Aguarde ${formatDuration(remainingMs)}.` })
        return true
      }

      const isEmergency = action === "emergencia"
      const targetUser = isEmergency ? mentioned[0] : sender
      const itemArgIndex = isEmergency ? 3 : 2
      const qtyArgIndex = isEmergency ? 4 : 3
      const itemKey = String(cmdParts[itemArgIndex] || "").trim()
      const quantity = parseQuantity(cmdParts[qtyArgIndex], 1)

      if (isEmergency) {
        if (!targetUser) {
          await sock.sendMessage(from, { text: `Use: ${prefix}${cmdName} emergencia @user <item> [quantidade]` })
          return true
        }
        if (!Array.isArray(team?.members) || !team.members.includes(targetUser)) {
          await sock.sendMessage(from, { text: "O alvo da emergencia precisa ser membro do mesmo time." })
          return true
        }
      }

      if (!itemKey || quantity <= 0) {
        await sock.sendMessage(from, { text: `Use: ${prefix}${cmdName} retiraritem <item> [quantidade]` })
        return true
      }

      const normalizedItem = economyService.normalizeItemKey(itemKey)
      if (!normalizedItem) {
        await sock.sendMessage(from, { text: "Item invalido." })
        return true
      }

      if (!storage.removeTeamPoolItem(userTeamId, normalizedItem, quantity)) {
        await sock.sendMessage(from, { text: "Pool sem itens suficientes para essa retirada." })
        return true
      }

      const target = targetUser || sender
      const before = economyService.getItemQuantity(target, normalizedItem)
      const after = economyService.addItem(target, normalizedItem, quantity)
      const credited = Math.max(0, after - before)
      if (credited <= 0) {
        storage.addTeamPoolItem(userTeamId, normalizedItem, quantity)
        await sock.sendMessage(from, { text: "Falha ao creditar item. Retirada desfeita." })
        return true
      }
      if (credited < quantity) {
        storage.addTeamPoolItem(userTeamId, normalizedItem, quantity - credited)
      }

      telemetry.incrementCounter("team.pool.items.withdraw", 1)
      telemetry.appendEvent("team.pool.items.withdraw", {
        teamId: userTeamId,
        by: sender,
        target,
        itemKey: normalizedItem,
        quantity: credited,
        emergency: isEmergency,
        groupId: isGroup ? from : null,
      })

      if (typeof storage.setTeamLastWithdrawAt === "function") {
        storage.setTeamLastWithdrawAt(userTeamId, sender, Date.now())
      }

      await sock.sendMessage(from, {
        text: isEmergency
          ? `🚑 Emergencia do time: @${sender.split("@")[0]} compartilhou *${credited}x ${normalizedItem}* para @${target.split("@")[0]}.`
          : `✅ Retirada concluida: *${credited}x ${normalizedItem}* do pool para @${sender.split("@")[0]}.`,
        mentions: isEmergency ? [sender, target] : [sender],
      })
      return true
    }

    if (action === "stats") {
      const userTeamId = storage.getUserTeamId(sender)
      if (!userTeamId) {
        await sock.sendMessage(from, {
          text: `Voce nao faz parte de um time.`,
        })
        return true
      }

      const stats = economyService.getTeamStats(userTeamId, storage)
      const team = storage.getTeam(userTeamId)
      const poolCoins = economyService.getTeamPoolCoins(userTeamId, storage)
      const poolItems = Object.keys(economyService.getTeamPoolItems(userTeamId, storage) || {}).length

      await sock.sendMessage(from, {
        text:
          `*Stats do ${team.name}*\n\n` +
          `👥 Membros: ${stats.memberCount}\n` +
          `💰 Total de moedas: ${stats.totalCoins}\n` +
          `⭐ XP combinado: ${stats.totalXp}\n` +
          `🎖️ Níveis combinados: ${stats.totalLevel}\n` +
          `🏦 Pool: ${poolCoins} Epsteincoins + ${poolItems} itens`,
      })

      telemetry.incrementCounter("team.stats.viewed", 1)
      return true
    }

    if (action === "leave") {
      const userTeamId = storage.getUserTeamId(sender)
      if (!userTeamId) {
        await sock.sendMessage(from, {
          text: `Voce nao faz parte de um time.`,
        })
        return true
      }

      const team = storage.getTeam(userTeamId)
      const removed = storage.removeTeamMember(userTeamId, sender)
      if (!removed) {
        await sock.sendMessage(from, {
          text: `Falha ao sair do time.`,
        })
        return true
      }

      // If last member, delete team
      const remainingMembers = storage.getTeamMembers(userTeamId)
      if (remainingMembers.length === 0) {
        storage.deleteTeam(userTeamId)
      }

      await sock.sendMessage(from, {
        text: `Voce saiu do time *${team.name}*.`,
      })

      telemetry.incrementCounter("team.left", 1)
      telemetry.appendEvent("team.left", {
        teamId: userTeamId,
        teamName: team.name,
        userId: sender,
        groupId: isGroup ? from : null,
      })
      return true
    }

    if (action === "list" || action === "lista") {
      const userTeamId = storage.getUserTeamId(sender)
      const teamListAll = storage.getAllTeams()
      let teamList = teamListAll
      if (isGroup) {
        const metadata = await sock.groupMetadata(from)
        const groupMemberSet = new Set((metadata?.participants || []).map((p) => jidNormalizedUser(p.id)))
        teamList = teamListAll.filter((team) =>
          Array.isArray(team.members) && team.members.some((memberId) => groupMemberSet.has(memberId))
        )
      }

      if (userTeamId) {
        const myTeam = teamList.find(t => t.teamId === userTeamId)
        const otherTeams = teamList.filter(t => t.teamId !== userTeamId).slice(0, 5)

        let responseText = `*Seu time:*\n*${myTeam.name}* (ID: ${myTeam.teamId})\nMembros: ${myTeam.members.length}\n\n`

        if (otherTeams.length > 0) {
          responseText += `*Times disponiveis:*\n` + otherTeams
            .map(team => `${team.name} (${team.teamId}) - ${team.members.length} membros`)
            .join("\n") +
            `\n\nEntre apenas com convite: ${prefix}${cmdName} accept <ID>.`
        } else {
          responseText += `Nenhum outro time disponivel.`
        }

        await sock.sendMessage(from, { text: responseText })
      } else {
        const topTeams = teamList.slice(0, 10)
        const teamLines = topTeams.map(team => `${team.name} (${team.teamId}) - ${team.members.length} membros`)

        await sock.sendMessage(from, {
          text:
            `*Times com membros neste grupo (${teamList.length} total)*\n\n` +
            (teamLines.length > 0 ? teamLines.join("\n") : "Nenhum time criado ainda.") +
            `\n\nUse ${prefix}${cmdName} create <nome> para criar um novo time e ${prefix}${cmdName} accept <ID> para aceitar convites.`,
        })
      }

      telemetry.incrementCounter("team.list.viewed", 1)
      return true
    }

    // Show team menu if no action
    const userTeamId = storage.getUserTeamId(sender)
    const menuText = userTeamId
      ? `*Seu time*\n\nComandos:\n` +
        `- ${prefix}${cmdName} info: Ver info do time\n` +
        `- ${prefix}${cmdName} members: Listar membros\n` +
        `- ${prefix}${cmdName} stats: Stats do time\n` +
        `- ${prefix}${cmdName} invite @user: Convidar jogador\n` +
        `- ${prefix}${cmdName} depositarcoins <qtd>\n` +
        `- ${prefix}${cmdName} depositaritem <item> [qtd]\n` +
        `- ${prefix}${cmdName} retirarcoins <qtd> (dono/tenente, cooldown 15m)\n` +
        `- ${prefix}${cmdName} retiraritem <item> [qtd] (dono/tenente, cooldown 15m)\n` +
        `- ${prefix}${cmdName} leave: Sair do time\n` +
        `- ${prefix}${cmdName} list: Ver outros times`
      : `*Sistema de Times*\n\nComandos:\n` +
        `- ${prefix}${cmdName} create <nome>: Criar um time\n` +
        `- ${prefix}${cmdName} accept <ID>: Aceitar convite para um time\n` +
        `- ${prefix}${cmdName} list: Ver times disponiveis`

    await sock.sendMessage(from, { text: menuText })
    return true
  }

  if (cmdName === prefix + "timeranking" || cmdName === prefix + "teamranking") {
    const teams = (typeof storage.getAllTeams === "function" ? storage.getAllTeams() : [])
      .map((team) => {
        const teamId = String(team?.teamId || "")
        const poolCoins = Math.max(0, Number(storage.getTeamPoolCoins(teamId)) || 0)
        const poolItems = storage.getTeamPoolItems(teamId) || {}
        let poolItemsValue = 0
        for (const [itemKey, qtyRaw] of Object.entries(poolItems)) {
          const qty = Math.max(0, Math.floor(Number(qtyRaw) || 0))
          const unit = Math.max(0, Math.floor(Number(economyService.getItemDefinition(itemKey)?.price) || 0))
          poolItemsValue += qty * unit
        }
        return {
          teamId,
          name: team?.name || teamId,
          members: Array.isArray(team?.members) ? team.members.length : 0,
          value: poolCoins + poolItemsValue,
          poolCoins,
          poolItemsValue,
        }
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)

    if (teams.length === 0) {
      await sock.sendMessage(from, { text: "Sem times cadastrados para ranking ainda." })
      return true
    }

    const lines = teams.map((team, index) =>
      `${index + 1}. ${team.name} (${team.teamId}) | valor: *${team.value}* | membros: ${team.members}`
    )
    await sock.sendMessage(from, {
      text: `🏆 Ranking global de times (top 10)\n\n${lines.join("\n")}`,
    })
    return true
  }

  const hasMentionPreferenceApi = typeof economyService.isMentionOptIn === "function"
  const senderIsRegistered = typeof registrationService?.isRegistered === "function"
    ? registrationService.isRegistered(sender)
    : true
  const senderProfile = typeof economyService.getProfile === "function"
    ? economyService.getProfile(sender)
    : null
  const senderCustomLabel = String(senderProfile?.preferences?.publicLabel || "").trim()
  const senderMentionOptIn = hasMentionPreferenceApi
    ? economyService.isMentionOptIn(sender)
    : true
  const mustRegisterBeforeEconomy = isEconomyCommandInvocation && !senderIsRegistered
  if (mustRegisterBeforeEconomy) {
    await sock.sendMessage(from, {
      text:
        "⚠️ Este comando de economia exige cadastro.\n" +
        "Use *!register* para se registrar e tente novamente."
    })
    return true
  }

  const mustSetNicknameBeforeEconomy = isEconomyCommandInvocation && hasMentionPreferenceApi && !senderMentionOptIn && !senderCustomLabel
  if (mustSetNicknameBeforeEconomy) {
    await sock.sendMessage(from, {
      text:
        "⚠️ Você desativou menções e ainda não definiu apelido público.\n" +
        `Para continuar usando a economia, use: *${prefix}apelido <novo nome>*`,
    })
    return true
  }

  const pendingTypeChoice = pendingForgeTypeByUser.get(sender)
  if (pendingTypeChoice && isGroup && from === pendingTypeChoice.groupId) {
    const now = Date.now()
    if (now >= pendingTypeChoice.expiresAt) {
      pendingForgeTypeByUser.delete(sender)
      await sock.sendMessage(from, {
        text: `⏰ @${sender.split("@")[0]}, tempo expirado. A escolha de tipo da falsificação foi cancelada.`,
        mentions: [sender],
      })
      return true
    }

    if (cmdName !== prefix + "falsificar") return false
    if (String(cmdArg1 || "").toLowerCase() !== "tipo") {
      await sock.sendMessage(from, {
        text: "Você tem uma escolha pendente. Use: !falsificar tipo <1-13>",
      })
      return true
    }

    const chosenType = Number.parseInt(String(cmdArg2 || "").trim(), 10)
    if (!Number.isFinite(chosenType) || chosenType < 1 || chosenType > 13) {
      await sock.sendMessage(from, {
        text: "Escolha inválida. Use: !falsificar tipo <1-13>",
      })
      return true
    }

    const applied = economyService.applyForgedPassTypeChoice(
      sender,
      pendingTypeChoice.fromType,
      chosenType,
      pendingTypeChoice.severity,
      pendingTypeChoice.quantity
    )

    if (!applied.ok) {
      pendingForgeTypeByUser.delete(sender)
      await sock.sendMessage(from, { text: "Falha ao aplicar sua escolha de tipo. Operação cancelada." })
      return true
    }

    pendingForgeTypeByUser.delete(sender)
    await sock.sendMessage(from, {
      text:
        `✅ @${sender.split("@")[0]} conversão concluída!\n` +
        `Tipo original: *${pendingTypeChoice.fromType}*\n` +
        `Novo tipo escolhido: *${applied.toType}*\n` +
        `Quantidade convertida: *${applied.quantity}*\n` +
        `Severidade: *${applied.severity}x*.`,
      mentions: [sender],
    })
    return true
  }

  if (cmdName === prefix + "perfil" && cmdArg1 === "stats") {
    const profile = economyService.getProfile(sender)
    await sock.sendMessage(from, {
      text: buildEconomyStatsText(profile),
    })
    return true
  }

  if (cmd === prefix + "economia") {
    await sock.sendMessage(from, {
      text:
`╭━━━〔 💰 SUBMENU: ECONOMIA 〕━━━╮
│ Comandos de economia (* significa argumento opcional)
│ No privado: exige cadastro via ${prefix}register
│ ${prefix}perfil stats
│ ${prefix}perfil *@user
│ ${prefix}coinsranking
│ ${prefix}xpranking
│ ${prefix}xp
│ ${prefix}guia
│ ${prefix}missao
│ ${prefix}missao claim <Q1|Q2|Q3>
│ ${prefix}mentions <on|off>
│ ${prefix}apelido *<nome público>
│ (opt-out de menções exige apelido público)
│ ${prefix}extrato *@user
│ ${prefix}loja
│ ${prefix}comprar <item|indice> *<quantidade>
│ ${prefix}comprarpara @user <item> *<quantidade>
│ ${prefix}vender <item> *<quantidade>
│ ${prefix}doarcoins @user *<quantidade>
│ ${prefix}doaritem @user <item> *<quantidade>
│ ${prefix}roubar @user
│ ${prefix}daily
│ ${prefix}carepackage
│ ${prefix}cassino / ${prefix}aposta <valor>
│ ${prefix}lootbox <quantidade 1-10>
│ ${prefix}falsificar <tipo 1-13> *<severidade> *<quantidade> *<S|N>
│ ${prefix}trade @user <coins> [item:quantidade...]
│ ${prefix}trade respond <id> <coins> [item:quantidade...]
│ ${prefix}trade review <id> | ${prefix}trade accept <id>
│ ${prefix}trade counter <id> <coins> [item:quantidade...]
│ ${prefix}trade reject <id> | ${prefix}trade cancel <id>
│ ${prefix}trade list | ${prefix}trade info <id> | ${prefix}trade dispute <id>
│ ${prefix}team info | ${prefix}team stats | ${prefix}team members
│ ${prefix}team depositarcoins <qtd> | ${prefix}team depositaritem <item> [qtd]
│ ${prefix}team retirarcoins <qtd> | ${prefix}team retiraritem <item> [qtd]
│ ${prefix}cupom criar <codigo> <moedas>
│ ${prefix}cupom resgatar <codigo>
│ ${prefix}falsificar tipo <1-13> (escolha pendente)
│ ${prefix}loteria "<titulo>" "<recompensas>" <S|N> <qtdVencedores>
│ ${prefix}loteria entrar (quando opt-in = S)
│ ${prefix}loteria fechar (encerra loteria opt-in)
│ ${prefix}usarpasse @user <tipo> <severidade>
│ ${prefix}trabalho <ifood|capinar|lavagem>
╰━━━━━━━━━━━━━━━━━━━━╯`,
    })
    return true
  }

  if (cmdName === prefix + "cupom" && isGroup) {
    const action = String(cmdArg1 || "").trim().toLowerCase()
    const couponState = getCouponState(storage, from)

    if (action === "criar") {
      if (!isOverrideSender) {
        await sock.sendMessage(from, { text: "Apenas overrides podem criar cupons." })
        return true
      }
      const codeRaw = String(cmdArg2 || "").trim().toUpperCase()
      const amount = Number.parseInt(String(cmdParts[3] || ""), 10)
      if (!/^[A-Z0-9_-]{4,24}$/.test(codeRaw) || !Number.isFinite(amount) || amount <= 0 || amount > limits.maxCoinOperation) {
        await sock.sendMessage(from, { text: "Use: !cupom criar <codigo 4-24> <moedas>" })
        return true
      }
      if (!couponState.codes[codeRaw]) {
        couponState.codes[codeRaw] = {
          amount,
          createdBy: sender,
          createdAt: Date.now(),
          redeemedBy: {},
        }
      } else {
        couponState.codes[codeRaw].amount = amount
        couponState.codes[codeRaw].updatedBy = sender
        couponState.codes[codeRaw].updatedAt = Date.now()
      }
      setCouponState(storage, from, couponState)

      telemetry.incrementCounter("economy.coupon.create", 1)
      telemetry.appendEvent("economy.coupon.create", {
        groupId: from,
        code: codeRaw,
        amount,
        by: sender,
      })

      await sock.sendMessage(from, {
        text: `Cupom criado: *${codeRaw}* valendo *${amount}* ${CURRENCY_LABEL}.`,
      })
      return true
    }

    if (action === "resgatar") {
      const codeRaw = String(cmdArg2 || "").trim().toUpperCase()
      if (!codeRaw) {
        await sock.sendMessage(from, { text: "Use: !cupom resgatar <codigo>" })
        return true
      }
      const coupon = couponState.codes[codeRaw]
      if (!coupon) {
        await sock.sendMessage(from, { text: "Cupom inválido ou inexistente." })
        return true
      }

      if (coupon.redeemedBy && coupon.redeemedBy[sender]) {
        await sock.sendMessage(from, { text: "Você já resgatou este cupom." })
        return true
      }

      const received = economyService.creditCoins(sender, coupon.amount, {
        type: "coupon-redeem",
        details: `Cupom ${codeRaw}`,
        meta: { code: codeRaw, groupId: from },
      })
      if (!coupon.redeemedBy || typeof coupon.redeemedBy !== "object") coupon.redeemedBy = {}
      coupon.redeemedBy[sender] = Date.now()
      setCouponState(storage, from, couponState)

      telemetry.incrementCounter("economy.coupon.redeem", 1)
      telemetry.appendEvent("economy.coupon.redeem", {
        groupId: from,
        code: codeRaw,
        amount: received,
        userId: sender,
      })

      await sock.sendMessage(from, {
        text: `✅ @${sender.split("@")[0]} resgatou *${received}* ${CURRENCY_LABEL} com o cupom *${codeRaw}*.`,
        mentions: [sender],
      })
      return true
    }

    await sock.sendMessage(from, {
      text: "Use: !cupom criar <codigo> <moedas> | !cupom resgatar <codigo>",
    })
    return true
  }

  if ((cmdName === prefix + "trade" || cmdName === prefix + "troca") && isGroup) {
    const tradeState = getTradeState(storage, from)
    const expiredChanged = cleanupExpiredTrades(tradeState)
    if (expiredChanged) {
      setTradeState(storage, from, tradeState)
    }

    const action = String(cmdArg1 || "").trim().toLowerCase()
    const sendTradeUsage = async () => {
      await sock.sendMessage(from, {
        text:
          `Use:\n` +
          `- !trade @user <coins> [item:quantidade...]\n` +
          `- !trade respond <tradeId> <coins> [item:quantidade...]\n` +
          `- !trade review <tradeId>\n` +
          `- !trade accept <tradeId>\n` +
          `- !trade counter <tradeId> <coins> [item:quantidade...]\n` +
          `- !trade reject <tradeId> | !trade cancel <tradeId>\n` +
          `- !trade list\n` +
          `- !trade info <tradeId>\n` +
          `- !trade dispute <tradeId>`
      })
    }

    const settleTrade = async (trade) => {
      const offerA = trade.offers?.initiator || { coins: 0, items: {} }
      const offerB = trade.offers?.counterparty || { coins: 0, items: {} }

      const valueA = getOfferValue(offerA, economyService)
      const valueB = getOfferValue(offerB, economyService)
      const bracketA = getTradeBracketForOffer(offerA, economyService)
      const bracketB = getTradeBracketForOffer(offerB, economyService)

      const levelA = Math.max(1, Math.floor(Number(economyService.getProfile(trade.initiator)?.progression?.level) || 1))
      const levelB = Math.max(1, Math.floor(Number(economyService.getProfile(trade.counterparty)?.progression?.level) || 1))
      const teamA = typeof storage.getUserTeamId === "function" ? storage.getUserTeamId(trade.initiator) : null
      const teamB = typeof storage.getUserTeamId === "function" ? storage.getUserTeamId(trade.counterparty) : null
      const sameTeam = Boolean(teamA && teamB && teamA === teamB)

      const baseFeeRateA = levelA <= 10 ? 0 : getTradeFeeRateByBracket(bracketA)
      const baseFeeRateB = levelB <= 10 ? 0 : getTradeFeeRateByBracket(bracketB)
      const effectiveFeeRateA = sameTeam ? (baseFeeRateA * 0.8) : baseFeeRateA
      const effectiveFeeRateB = sameTeam ? (baseFeeRateB * 0.8) : baseFeeRateB
      const feeA = Math.floor(valueA * effectiveFeeRateA)
      const feeB = Math.floor(valueB * effectiveFeeRateB)

      const now = Date.now()
      const profileA = economyService.getProfile(trade.initiator)
      const profileB = economyService.getProfile(trade.counterparty)
      const lastByBracketA = profileA?.progression?.lastTradeByBracket || {}
      const lastByBracketB = profileB?.progression?.lastTradeByBracket || {}
      const cooldownA = getTradeCooldownMsByBracket(bracketA)
      const cooldownB = getTradeCooldownMsByBracket(bracketB)
      const remainingA = Math.max(0, (Number(lastByBracketA[bracketA]) || 0) + cooldownA - now)
      const remainingB = Math.max(0, (Number(lastByBracketB[bracketB]) || 0) + cooldownB - now)
      if (remainingA > 0) {
        return { ok: false, reason: "initiator-trade-cooldown", details: { bracket: bracketA, remainingMs: remainingA } }
      }
      if (remainingB > 0) {
        return { ok: false, reason: "counterparty-trade-cooldown", details: { bracket: bracketB, remainingMs: remainingB } }
      }

      const canA = hasOfferResources(economyService, trade.initiator, offerA, feeA)
      if (!canA.ok) return { ok: false, reason: "initiator-resource", details: canA }
      const canB = hasOfferResources(economyService, trade.counterparty, offerB, feeB)
      if (!canB.ok) return { ok: false, reason: "counterparty-resource", details: canB }

      const touchedItems = new Set([
        ...Object.keys(offerA.items || {}),
        ...Object.keys(offerB.items || {}),
      ])
      for (const itemKey of touchedItems) {
        const qtyAOut = Math.max(0, Math.floor(Number((offerA.items || {})[itemKey]) || 0))
        const qtyBOut = Math.max(0, Math.floor(Number((offerB.items || {})[itemKey]) || 0))
        const currentA = economyService.getItemQuantity(trade.initiator, itemKey)
        const currentB = economyService.getItemQuantity(trade.counterparty, itemKey)
        const nextA = currentA - qtyAOut + qtyBOut
        const nextB = currentB - qtyBOut + qtyAOut
        if (nextA < 0 || nextB < 0) {
          return {
            ok: false,
            reason: "item-underflow",
            details: { itemKey, nextA, nextB, currentA, currentB, qtyAOut, qtyBOut },
          }
        }
        if (nextA > TRADE_ITEM_STACK_LIMIT || nextB > TRADE_ITEM_STACK_LIMIT) {
          return {
            ok: false,
            reason: "item-stack-limit",
            details: { itemKey, nextA, nextB, maxStack: TRADE_ITEM_STACK_LIMIT },
          }
        }
      }

      const rollbackOps = []
      const pushRollback = (fn) => {
        rollbackOps.push(fn)
      }
      const rollback = async () => {
        for (let i = rollbackOps.length - 1; i >= 0; i--) {
          try {
            await rollbackOps[i]()
          } catch (_) {
            // best effort rollback
          }
        }
      }

      if (offerA.coins > 0) {
        const moved = economyService.transferCoins(trade.initiator, trade.counterparty, offerA.coins)
        if (!moved.ok) return { ok: false, reason: "initiator-coins-transfer", details: moved }
        pushRollback(() => economyService.transferCoins(trade.counterparty, trade.initiator, offerA.coins))
      }
      if (offerB.coins > 0) {
        const moved = economyService.transferCoins(trade.counterparty, trade.initiator, offerB.coins)
        if (!moved.ok) {
          await rollback()
          return { ok: false, reason: "counterparty-coins-transfer", details: moved }
        }
        pushRollback(() => economyService.transferCoins(trade.initiator, trade.counterparty, offerB.coins))
      }

      for (const [itemKey, qtyRaw] of Object.entries(offerA.items || {})) {
        const qty = Math.max(0, Math.floor(Number(qtyRaw) || 0))
        if (qty <= 0) continue
        const moved = economyService.transferItem(trade.initiator, trade.counterparty, itemKey, qty)
        if (!moved.ok) {
          await rollback()
          return { ok: false, reason: "initiator-item-transfer", details: moved }
        }
        pushRollback(() => economyService.transferItem(trade.counterparty, trade.initiator, itemKey, qty))
      }
      for (const [itemKey, qtyRaw] of Object.entries(offerB.items || {})) {
        const qty = Math.max(0, Math.floor(Number(qtyRaw) || 0))
        if (qty <= 0) continue
        const moved = economyService.transferItem(trade.counterparty, trade.initiator, itemKey, qty)
        if (!moved.ok) {
          await rollback()
          return { ok: false, reason: "counterparty-item-transfer", details: moved }
        }
        pushRollback(() => economyService.transferItem(trade.initiator, trade.counterparty, itemKey, qty))
      }

      if (feeA > 0) {
        const debited = economyService.debitCoins(trade.initiator, feeA, {
          type: "trade-fee",
          details: `Taxa trade ${trade.tradeId}`,
          meta: { tradeId: trade.tradeId, role: "initiator", offerValue: valueA, feeRate: effectiveFeeRateA, bracket: bracketA },
        })
        if (!debited) {
          await rollback()
          return { ok: false, reason: "initiator-fee-debit" }
        }
        pushRollback(() => economyService.creditCoins(trade.initiator, feeA, {
          type: "trade-fee-rollback",
          details: `Estorno de taxa do trade ${trade.tradeId}`,
          meta: { tradeId: trade.tradeId, role: "initiator" },
        }))
      }
      if (feeB > 0) {
        const debited = economyService.debitCoins(trade.counterparty, feeB, {
          type: "trade-fee",
          details: `Taxa trade ${trade.tradeId}`,
          meta: { tradeId: trade.tradeId, role: "counterparty", offerValue: valueB, feeRate: effectiveFeeRateB, bracket: bracketB },
        })
        if (!debited) {
          await rollback()
          return { ok: false, reason: "counterparty-fee-debit" }
        }
        pushRollback(() => economyService.creditCoins(trade.counterparty, feeB, {
          type: "trade-fee-rollback",
          details: `Estorno de taxa do trade ${trade.tradeId}`,
          meta: { tradeId: trade.tradeId, role: "counterparty" },
        }))
      }

      if (typeof economyService.pushTransaction === "function") {
        economyService.pushTransaction(trade.initiator, {
          type: "trade-settle",
          deltaCoins: 0,
          details: `Trade ${trade.tradeId} concluído`,
          meta: { tradeId: trade.tradeId, role: "initiator", feePaid: feeA },
        })
        economyService.pushTransaction(trade.counterparty, {
          type: "trade-settle",
          deltaCoins: 0,
          details: `Trade ${trade.tradeId} concluído`,
          meta: { tradeId: trade.tradeId, role: "counterparty", feePaid: feeB },
        })
      }

      const userA = storage.economyCache?.users?.[trade.initiator]
      const userB = storage.economyCache?.users?.[trade.counterparty]
      if (userA?.progression) {
        if (!userA.progression.lastTradeByBracket || typeof userA.progression.lastTradeByBracket !== "object") {
          userA.progression.lastTradeByBracket = {}
        }
        userA.progression.lastTradeByBracket[bracketA] = now
      }
      if (userB?.progression) {
        if (!userB.progression.lastTradeByBracket || typeof userB.progression.lastTradeByBracket !== "object") {
          userB.progression.lastTradeByBracket = {}
        }
        userB.progression.lastTradeByBracket[bracketB] = now
      }
      storage.saveEconomy?.()

      return {
        ok: true,
        fees: { initiator: feeA, counterparty: feeB },
        brackets: { initiator: bracketA, counterparty: bracketB },
      }
    }

    if (action === "" || action === "help") {
      await sendTradeUsage()
      return true
    }

    if (action === "list") {
      const allTrades = Object.values(tradeState.trades || {})
        .filter((trade) => trade && (trade.initiator === sender || trade.counterparty === sender))
        .sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))

      if (allTrades.length === 0) {
        await sock.sendMessage(from, { text: "Você não tem trades ativos ou recentes neste grupo." })
        return true
      }

      const lines = allTrades.slice(0, 10).map((trade) =>
        `- ${trade.tradeId} | ${trade.status} | ${trade.phase} | @${trade.initiator.split("@")[0]} x @${trade.counterparty.split("@")[0]}`
      )
      await sock.sendMessage(from, {
        text: `Seus trades (até 10):\n${lines.join("\n")}`,
        mentions: [sender],
      })
      return true
    }

    if (action === "info") {
      const tradeId = String(cmdArg2 || "").trim().toUpperCase()
      if (!tradeId) {
        await sock.sendMessage(from, { text: "Use: !trade info <tradeId>" })
        return true
      }
      const trade = tradeState.trades[tradeId]
      if (!trade) {
        await sock.sendMessage(from, { text: "Trade não encontrado." })
        return true
      }
      if (trade.initiator !== sender && trade.counterparty !== sender && !senderIsAdmin) {
        await sock.sendMessage(from, { text: "Você não participa deste trade." })
        return true
      }

      await sock.sendMessage(from, {
        text:
          `Trade ${trade.tradeId}\n` +
          `Status: *${trade.status}* | Fase: *${trade.phase}*\n` +
          `Iniciador: @${trade.initiator.split("@")[0]}\n` +
          `Contraparte: @${trade.counterparty.split("@")[0]}\n` +
          `Oferta iniciador: ${formatTradeOffer(trade.offers?.initiator)}\n` +
          `Oferta contraparte: ${formatTradeOffer(trade.offers?.counterparty)}\n` +
          `Expira em: ${new Date(trade.expiresAt || Date.now()).toLocaleString()}`,
        mentions: [trade.initiator, trade.counterparty],
      })
      return true
    }

    if (action === "respond") {
      const tradeId = String(cmdArg2 || "").trim().toUpperCase()
      const trade = tradeState.trades[tradeId]
      if (!trade || trade.status !== "active") {
        await sock.sendMessage(from, { text: "Trade inválido ou não está ativo." })
        return true
      }
      if (trade.counterparty !== sender) {
        await sock.sendMessage(from, { text: "Somente a contraparte pode usar respond." })
        return true
      }
      if (trade.phase !== "phase2-counterparty-offer") {
        await sock.sendMessage(from, { text: "Este trade não está aguardando resposta da contraparte." })
        return true
      }

      const parsedOffer = parseTradeOffer(cmdParts.slice(3), economyService, limits)
      if (!parsedOffer.ok) {
        await sock.sendMessage(from, {
          text: "Oferta inválida. Use: !trade respond <tradeId> <coins> [item:quantidade...]",
        })
        return true
      }

      trade.offers.counterparty = parsedOffer.offer
      trade.phase = "phase3-analysis"
      trade.analysisAck = { initiator: false, counterparty: false }
      trade.acceptedBy = { initiator: false, counterparty: false }
      trade.updatedAt = Date.now()
      trade.expiresAt = Date.now() + TRADE_TIMEOUT_MS
      appendTradeEvent(trade, "trade.response", sender, { offer: parsedOffer.offer })
      setTradeState(storage, from, tradeState)

      telemetry.incrementCounter("economy.trade.response", 1)
      telemetry.appendEvent("economy.trade.response", {
        groupId: from,
        tradeId: trade.tradeId,
        by: sender,
      })

      await sock.sendMessage(from, {
        text:
          `Trade ${trade.tradeId} atualizado para análise.\n` +
          `Oferta iniciador: ${formatTradeOffer(trade.offers.initiator)}\n` +
          `Oferta contraparte: ${formatTradeOffer(trade.offers.counterparty)}\n` +
          `Agora ambos precisam confirmar com: !trade review ${trade.tradeId}`,
        mentions: [trade.initiator, trade.counterparty],
      })
      return true
    }

    if (action === "review") {
      const tradeId = String(cmdArg2 || "").trim().toUpperCase()
      const trade = tradeState.trades[tradeId]
      if (!trade || trade.status !== "active") {
        await sock.sendMessage(from, { text: "Trade inválido ou não está ativo." })
        return true
      }
      const role = getTradeParticipantRole(trade, sender)
      if (!role) {
        await sock.sendMessage(from, { text: "Você não participa deste trade." })
        return true
      }
      if (trade.phase !== "phase3-analysis") {
        await sock.sendMessage(from, { text: "Este trade não está em fase de análise." })
        return true
      }

      trade.analysisAck[role] = true
      trade.updatedAt = Date.now()
      appendTradeEvent(trade, "trade.review", sender, { role })

      if (trade.analysisAck.initiator && trade.analysisAck.counterparty) {
        trade.phase = "phase4-negotiation"
        trade.turn = "initiator"
        trade.acceptedBy = { initiator: false, counterparty: false }
      }
      setTradeState(storage, from, tradeState)

      await sock.sendMessage(from, {
        text: trade.phase === "phase4-negotiation"
          ? `Ambos revisaram o trade ${trade.tradeId}. Fase de negociação iniciada. Use !trade accept ${trade.tradeId}, !trade counter ${trade.tradeId} ... ou !trade reject ${trade.tradeId}.`
          : `Revisão registrada para ${trade.tradeId}. Falta o outro participante revisar.`,
        mentions: [trade.initiator, trade.counterparty],
      })
      return true
    }

    if (action === "accept") {
      const tradeId = String(cmdArg2 || "").trim().toUpperCase()
      const trade = tradeState.trades[tradeId]
      if (!trade || trade.status !== "active") {
        await sock.sendMessage(from, { text: "Trade inválido ou não está ativo." })
        return true
      }
      const role = getTradeParticipantRole(trade, sender)
      if (!role) {
        await sock.sendMessage(from, { text: "Você não participa deste trade." })
        return true
      }
      if (trade.phase !== "phase4-negotiation") {
        await sock.sendMessage(from, { text: "Este trade não está pronto para aceite." })
        return true
      }
      if (!trade.offers?.initiator || !trade.offers?.counterparty) {
        await sock.sendMessage(from, { text: "Este trade ainda não possui ofertas completas dos dois lados." })
        return true
      }

      trade.acceptedBy[role] = true
      trade.updatedAt = Date.now()
      appendTradeEvent(trade, "trade.accept", sender, { role })

      if (!(trade.acceptedBy.initiator && trade.acceptedBy.counterparty)) {
        setTradeState(storage, from, tradeState)
        await sock.sendMessage(from, {
          text: `Aceite registrado para ${trade.tradeId}. Aguardando confirmação da outra parte.`,
          mentions: [trade.initiator, trade.counterparty],
        })
        return true
      }

      const settled = await settleTrade(trade)
      if (!settled.ok) {
        trade.acceptedBy = { initiator: false, counterparty: false }
        trade.updatedAt = Date.now()
        appendTradeEvent(trade, "trade.settle-failed", "system", { reason: settled.reason, details: settled.details || null })
        setTradeState(storage, from, tradeState)
        await sock.sendMessage(from, {
          text: `Falha ao liquidar o trade ${trade.tradeId} (${settled.reason}). Verifiquem saldo/itens e tentem novamente.`,
          mentions: [trade.initiator, trade.counterparty],
        })
        return true
      }

      trade.status = "completed"
      trade.phase = "settled"
      trade.updatedAt = Date.now()
      trade.settledAt = Date.now()
      appendTradeEvent(trade, "trade.settled", "system", { fees: settled.fees })
      tradeState.history.unshift(trade.tradeId)
      if (tradeState.history.length > TRADE_HISTORY_LIMIT) {
        tradeState.history = tradeState.history.slice(0, TRADE_HISTORY_LIMIT)
      }
      setTradeState(storage, from, tradeState)

      telemetry.incrementCounter("economy.trade.settled", 1)
      telemetry.appendEvent("economy.trade.settled", {
        groupId: from,
        tradeId: trade.tradeId,
        initiator: trade.initiator,
        counterparty: trade.counterparty,
        fees: settled.fees,
      })

      await sock.sendMessage(from, {
        text:
          `Trade ${trade.tradeId} concluído com sucesso.\n` +
          `Taxa ${trade.initiator.split("@")[0]}: *${settled.fees.initiator}* ${CURRENCY_LABEL}\n` +
          `Taxa ${trade.counterparty.split("@")[0]}: *${settled.fees.counterparty}* ${CURRENCY_LABEL}`,
        mentions: [trade.initiator, trade.counterparty],
      })
      return true
    }

    if (action === "counter") {
      const tradeId = String(cmdArg2 || "").trim().toUpperCase()
      const trade = tradeState.trades[tradeId]
      if (!trade || trade.status !== "active") {
        await sock.sendMessage(from, { text: "Trade inválido ou não está ativo." })
        return true
      }
      const role = getTradeParticipantRole(trade, sender)
      if (!role) {
        await sock.sendMessage(from, { text: "Você não participa deste trade." })
        return true
      }
      if (trade.phase !== "phase4-negotiation") {
        await sock.sendMessage(from, { text: "Contraoferta só é permitida na fase de negociação." })
        return true
      }

      const parsedOffer = parseTradeOffer(cmdParts.slice(3), economyService, limits)
      if (!parsedOffer.ok) {
        await sock.sendMessage(from, {
          text: "Contraoferta inválida. Use: !trade counter <tradeId> <coins> [item:quantidade...]",
        })
        return true
      }

      trade.offers[role] = parsedOffer.offer
      trade.acceptedBy = { initiator: false, counterparty: false }
      trade.updatedAt = Date.now()
      trade.expiresAt = Date.now() + TRADE_TIMEOUT_MS
      appendTradeEvent(trade, "trade.counter", sender, { role, offer: parsedOffer.offer })
      setTradeState(storage, from, tradeState)

      telemetry.incrementCounter("economy.trade.counter", 1)
      telemetry.appendEvent("economy.trade.counter", {
        groupId: from,
        tradeId: trade.tradeId,
        by: sender,
      })

      await sock.sendMessage(from, {
        text:
          `Contraoferta registrada em ${trade.tradeId}.\n` +
          `Oferta iniciador: ${formatTradeOffer(trade.offers.initiator)}\n` +
          `Oferta contraparte: ${formatTradeOffer(trade.offers.counterparty)}\n` +
          `Se concordarem, ambos usem !trade accept ${trade.tradeId}.`,
        mentions: [trade.initiator, trade.counterparty],
      })
      return true
    }

    if (action === "reject" || action === "cancel") {
      const tradeId = String(cmdArg2 || "").trim().toUpperCase()
      const trade = tradeState.trades[tradeId]
      if (!trade || trade.status !== "active") {
        await sock.sendMessage(from, { text: "Trade inválido ou não está ativo." })
        return true
      }
      const role = getTradeParticipantRole(trade, sender)
      if (!role && !senderIsAdmin) {
        await sock.sendMessage(from, { text: "Você não participa deste trade." })
        return true
      }

      trade.status = "cancelled"
      trade.phase = "cancelled"
      trade.updatedAt = Date.now()
      appendTradeEvent(trade, "trade.cancel", sender, { role: role || "admin" })
      tradeState.history.unshift(trade.tradeId)
      if (tradeState.history.length > TRADE_HISTORY_LIMIT) {
        tradeState.history = tradeState.history.slice(0, TRADE_HISTORY_LIMIT)
      }
      setTradeState(storage, from, tradeState)

      telemetry.incrementCounter("economy.trade.cancel", 1)
      telemetry.appendEvent("economy.trade.cancel", {
        groupId: from,
        tradeId: trade.tradeId,
        by: sender,
      })

      await sock.sendMessage(from, {
        text: `Trade ${trade.tradeId} cancelado. Nenhuma taxa foi cobrada.`,
        mentions: [trade.initiator, trade.counterparty],
      })
      return true
    }

    if (!["respond", "review", "accept", "counter", "reject", "cancel", "list", "info", "help"].includes(action)) {
      const target = mentioned[0]
      if (!target) {
        await sendTradeUsage()
        return true
      }
      if (target === sender) {
        await sock.sendMessage(from, { text: "Você não pode abrir trade com você mesmo." })
        return true
      }

      const parsedOffer = parseTradeOffer(cmdParts.slice(2), economyService, limits)
      if (!parsedOffer.ok) {
        await sock.sendMessage(from, {
          text: "Oferta inválida. Use: !trade @user <coins> [item:quantidade...]",
        })
        return true
      }

      const activeExisting = Object.values(tradeState.trades || {}).filter((trade) =>
        trade && trade.status === "active" &&
        ((trade.initiator === sender && trade.counterparty === target) ||
         (trade.initiator === target && trade.counterparty === sender))
      )
      if (activeExisting.length > 0) {
        await sock.sendMessage(from, {
          text: `Já existe trade ativo entre vocês: ${activeExisting[0].tradeId}.`,
          mentions: [sender, target],
        })
        return true
      }

      const existingIds = new Set(Object.keys(tradeState.trades || {}))
      const tradeId = buildTradeId(existingIds)
      const now = Date.now()
      const trade = {
        tradeId,
        groupId: from,
        initiator: sender,
        counterparty: target,
        status: "active",
        phase: "phase2-counterparty-offer",
        createdAt: now,
        updatedAt: now,
        expiresAt: now + TRADE_TIMEOUT_MS,
        offers: {
          initiator: parsedOffer.offer,
          counterparty: null,
        },
        analysisAck: { initiator: false, counterparty: false },
        acceptedBy: { initiator: false, counterparty: false },
        events: [],
      }
      appendTradeEvent(trade, "trade.created", sender, { offer: parsedOffer.offer })
      tradeState.trades[tradeId] = trade
      setTradeState(storage, from, tradeState)

      telemetry.incrementCounter("economy.trade.create", 1)
      telemetry.appendEvent("economy.trade.create", {
        groupId: from,
        tradeId,
        initiator: sender,
        counterparty: target,
      })

      await sock.sendMessage(from, {
        text:
          `Trade ${tradeId} criado.\n` +
          `Oferta inicial de @${sender.split("@")[0]}: ${formatTradeOffer(parsedOffer.offer)}\n` +
          `@${target.split("@")[0]} responda com: !trade respond ${tradeId} <coins> [item:quantidade...]`,
        mentions: [sender, target],
      })
      return true
    }

    await sendTradeUsage()
    return true
  }

  if (cmdName === prefix + "perfil" && cmdArg1 !== "stats") {
    const targetUser = mentioned[0] || sender
    const profile = economyService.getProfile(targetUser)
    let kronosInfo = ""
    if (profile?.buffs?.kronosVerdadeiraActive) {
      kronosInfo = "\nCoroa Kronos Verdadeira: *ATIVA (permanente)*"
    } else if (profile?.buffs?.kronosActive) {
      kronosInfo = `\nCoroa Kronos (Quebrada) ativa até: *${new Date(profile.buffs.kronosExpiresAt).toLocaleString()}*`
    }
    await sock.sendMessage(from, {
      text:
        `💳 Carteira global de @${targetUser.split("@")[0]}\n` +
        `${CURRENCY_LABEL}: *${profile.coins}*\n` +
        `Escudos: *${profile.shields}*\n` +
        `Inventário:\n${buildInventoryText(profile)}${kronosInfo}`,
      mentions: [targetUser],
    })
    return true
  }

  if (cmdName === prefix + "extrato") {
    const targetUser = mentioned[0] || sender
    const statement = economyService.getStatement(targetUser, 10)
    if (!statement.length) {
      await sock.sendMessage(from, { text: "Sem movimentações no extrato ainda." })
      return true
    }

    const lines = statement.map((entry, index) => {
      const sign = entry.deltaCoins >= 0 ? "+" : ""
      const when = new Date(entry.at).toLocaleString()
      const details = entry.details ? ` | ${entry.details}` : ""
      return `${index + 1}. ${when} | ${entry.type} | ${sign}${entry.deltaCoins} | saldo ${entry.balanceAfter}${details}`
    })

    await sock.sendMessage(from, {
      text: `📒 Extrato de @${targetUser.split("@")[0]} (últimas 10)\n${lines.join("\n")}`,
      mentions: [targetUser],
    })
    return true
  }

  if (cmd === prefix + "coinsranking" && isGroup) {
    const metadata = await sock.groupMetadata(from)
    const members = (metadata?.participants || []).map((p) => jidNormalizedUser(p.id))
    const ranking = economyService.getGroupRanking(members, 10)
    const visibleRanking = ranking.filter((entry) => hasPublicVisibility(entry.userId))
    if (visibleRanking.length === 0) {
      await sock.sendMessage(from, { text: "Sem dados de economia neste grupo ainda." })
      return true
    }

    const lines = visibleRanking.map((entry, index) => {
      const label = getPublicRankingLabel(entry.userId)
      return `${index + 1}. ${label} - *${entry.coins}*`
    })
    const globalPos = economyService.getUserGlobalPosition(sender)
    const mentions = applyMentionPolicy(visibleRanking.map((entry) => entry.userId))
    await sock.sendMessage(from, {
      text:
        `🏦 Ranking de ${CURRENCY_LABEL} (grupo)\n` +
        `${lines.join("\n")}\n\n` +
        `Sua posição global: *${globalPos || "N/A"}*`,
      mentions,
    })
    return true
  }

  if (cmd === prefix + "xpranking" && isGroup) {
    const metadata = await sock.groupMetadata(from)
    const members = (metadata?.participants || []).map((p) => jidNormalizedUser(p.id))
    const ranking = typeof economyService.getGroupXpRanking === "function"
      ? economyService.getGroupXpRanking(members, 10)
      : []
    const visibleRanking = ranking.filter((entry) => hasPublicVisibility(entry.userId))
    if (visibleRanking.length === 0) {
      await sock.sendMessage(from, { text: "Sem dados de XP neste grupo ainda." })
      return true
    }

    const lines = visibleRanking.map((entry, index) => {
      const label = getPublicRankingLabel(entry.userId)
      const level = Math.max(1, Math.floor(Number(entry?.level) || 1))
      const xpNow = Math.max(0, Math.floor(Number(entry?.xp) || 0))
      const xpToNext = Math.max(1, Math.floor(Number(entry?.xpToNextLevel) || 1))
      return `${index + 1}. ${label} - *Nível ${level}* (${xpNow}/${xpToNext} XP)`
    })
    const globalPos = typeof economyService.getUserGlobalXpPosition === "function"
      ? economyService.getUserGlobalXpPosition(sender)
      : null
    const mentions = applyMentionPolicy(visibleRanking.map((entry) => entry.userId))
    await sock.sendMessage(from, {
      text:
        `⭐ Ranking de XP (grupo)\n` +
        `${lines.join("\n")}\n\n` +
        `Sua posição global de XP: *${globalPos || "N/A"}*`,
      mentions,
    })
    return true
  }

  if (cmd === prefix + "loja") {
    telemetry.incrementCounter("economy.shop.view", 1)
    await sock.sendMessage(from, {
      text: economyService.getShopIndexText(),
    })
    return true
  }

  // !criarcupom @user percentage (override-only)
  if (cmdName === prefix + "criarcupom" && isOverrideSender) {
    const target = mentioned[0]
    const percentage = parsePositiveInt(cmdArg2, 0)
    if (!target || !percentage || percentage <= 0 || percentage > 100) {
      await sock.sendMessage(from, {
        text: `Use: ${prefix}criarcupom @user <1-100>`,
      })
      return true
    }

    const couponKey = percentage <= 5 ? "coupon5pct"
      : percentage <= 10 ? "coupon10pct"
      : percentage <= 25 ? "coupon25pct"
      : "coupon40pct"

    const after = economyService.addItem(target, couponKey, 1)
    if (after <= 0) {
      await sock.sendMessage(from, { text: "Falha ao criar cupom para o usuário alvo." })
      return true
    }
    await sock.sendMessage(from, {
      text: `✅ Cupom de ${percentage}% criado para @${target.split("@")[0]}.`,
      mentions: [target],
    })
    return true
  }

  // !usarcupom percentage (player command before !comprar)
  if (cmdName === prefix + "usarcupom") {
    const percentage = parsePositiveInt(cmdArg1, 0)
    if (!percentage || percentage <= 0 || percentage > 100) {
      await sock.sendMessage(from, {
        text: `Use: ${prefix}usarcupom <1-100>`,
      })
      return true
    }

    const couponKey = percentage <= 5 ? "coupon5pct"
      : percentage <= 10 ? "coupon10pct"
      : percentage <= 25 ? "coupon25pct"
      : "coupon40pct"
    const hasItem = economyService.getItemQuantity(sender, couponKey)
    if (hasItem <= 0) {
      await sock.sendMessage(from, { text: `Você não possui cupom de ${percentage}%.` })
      return true
    }

    const user = storage.economyCache?.users?.[sender]
    if (!user?.progression) {
      await sock.sendMessage(from, { text: "Perfil não disponível para ativar cupom." })
      return true
    }

    user.progression.activeCoupon = {
      couponKey,
      percentage,
      createdAt: Date.now(),
    }
    economyService.removeItem(sender, couponKey, 1)
    storage.saveEconomy?.()

    await sock.sendMessage(from, {
      text: `💳 Cupom de ${percentage}% ativado para a próxima compra.`,
    })
    return true
  }

  if (cmdName === prefix + "comprar") {
    const itemInput = cmdArg1
    const quantity = parseQuantity(cmdArg2, 1)
    let item = itemInput
    if (/^\d+$/.test(itemInput)) {
      const itemIndex = Number.parseInt(itemInput, 10)
      const catalog = economyService.getItemCatalog()
      item = catalog[itemIndex - 1]?.key || ""
    }
    const bought = economyService.buyItem(sender, item, quantity, sender)
    if (!bought.ok) {
      await sock.sendMessage(from, {
        text: bought.reason === "insufficient-funds"
          ? `Saldo insuficiente para essa compra. Custo: ${bought.totalCost} ${CURRENCY_LABEL}.`
          : (bought.reason === "quantity-too-large"
            ? `Quantidade muito alta. Limite por operação: ${bought.maxQuantity}.`
            : (bought.reason === "stack-limit"
              ? `Limite de pilha atingido para esse item. Máximo por item: ${bought.maxStack}.`
              : (bought.reason === "not-for-sale"
                ? "Esse item não pode ser comprado diretamente na loja."
                : "Item/índice inválido. Use !loja para ver o índice."))),
      })
      return true
    }

    const profile = economyService.getProfile(sender)
    const discountText = bought.couponDiscount
      ? `\n💳 *Cupom aplicado:* -${bought.couponDiscount} moedas`
      : ""
    await sock.sendMessage(from, {
      text:
        `Compra concluída: *${bought.quantity}x ${bought.itemKey}*\n` +
        `Custo: *${bought.totalCost}* ${CURRENCY_LABEL}${discountText}\n` +
        `Saldo atual: *${profile.coins}*`,
    })
    return true
  }

  if (cmdName === prefix + "comprarpara" && isGroup) {
    const target = mentioned[0]
    const item = cmdParts[2] || ""
    const quantity = parseQuantity(cmdParts[3], 1)
    if (!target || !item) {
      await sock.sendMessage(from, {
        text: "Use: !comprarpara @user <item> [quantidade]",
      })
      return true
    }

    const bought = economyService.buyItem(sender, item, quantity, target)
    if (!bought.ok) {
      await sock.sendMessage(from, {
        text: bought.reason === "insufficient-funds"
          ? `Saldo insuficiente. Custo: ${bought.totalCost} ${CURRENCY_LABEL}.`
          : (bought.reason === "quantity-too-large"
            ? `Quantidade muito alta. Limite por operação: ${bought.maxQuantity}.`
            : (bought.reason === "stack-limit"
              ? `Limite de pilha do alvo atingido. Máximo por item: ${bought.maxStack}.`
              : (bought.reason === "not-for-sale"
                ? "Esse item não pode ser comprado diretamente na loja."
                : "Item inválido. Use !loja."))),
      })
      return true
    }

    await sock.sendMessage(from, {
      text:
        `🎁 @${sender.split("@")[0]} comprou *${bought.quantity}x ${bought.itemKey}* para @${target.split("@")[0]}.`,
      mentions: [sender, target],
    })
    return true
  }

  if (cmdName === prefix + "vender") {
    const item = cmdArg1
    const quantity = parseQuantity(cmdArg2, 1)
    const sold = economyService.sellItem(sender, item, quantity)
    if (!sold.ok) {
      await sock.sendMessage(from, {
        text: sold.reason === "insufficient-items"
          ? `Você não tem quantidade suficiente desse item. Disponível: ${sold.available}.`
          : (sold.reason === "quantity-too-large"
            ? `Quantidade muito alta. Limite por operação: ${sold.maxQuantity}.`
            : "Item inválido para venda."),
      })
      return true
    }
    await sock.sendMessage(from, {
      text: `💱 Venda concluída: ${sold.quantity}x ${sold.itemKey} por *${sold.total}* ${CURRENCY_LABEL}.`,
    })
    return true
  }

  if (cmdName === prefix + "doarcoins" && isGroup) {
    const target = mentioned[0]
    const quantity = parseQuantity(cmdParts[2], 1)
    if (!target || quantity <= 0) {
      await sock.sendMessage(from, { text: "Use: !doarcoins @user [quantidade]" })
      return true
    }

    const transferred = economyService.transferCoins(sender, target, quantity)
    if (!transferred.ok) {
      await sock.sendMessage(from, {
        text: transferred.reason === "amount-too-large"
          ? `Quantidade muito alta. Limite por operação: ${transferred.maxAmount}.`
          : (transferred.reason === "receiver-max-balance"
            ? `A carteira do alvo está no limite máximo (${limits.maxCoinsBalance} ${CURRENCY_LABEL}).`
            : "Saldo insuficiente para doação."),
      })
      return true
    }

    await sock.sendMessage(from, {
      text: `🤝 @${sender.split("@")[0]} doou *${transferred.amount}* ${CURRENCY_LABEL} para @${target.split("@")[0]}.`,
      mentions: [sender, target],
    })
    return true
  }

  if (cmdName === prefix + "doaritem" && isGroup) {
    const target = mentioned[0]
    const item = cmdParts[2] || ""
    const quantity = parseQuantity(cmdParts[3], 1)
    if (!target || !item) {
      await sock.sendMessage(from, { text: "Use: !doaritem @user <item> [quantidade]" })
      return true
    }

    const transferred = economyService.transferItem(sender, target, item, quantity)
    if (!transferred.ok) {
      await sock.sendMessage(from, {
        text: transferred.reason === "insufficient-items"
          ? `Você não tem esse item nessa quantidade (disponível: ${transferred.available}).`
          : (transferred.reason === "quantity-too-large"
            ? `Quantidade muito alta. Limite por operação: ${transferred.maxQuantity}.`
            : (transferred.reason === "stack-limit"
              ? `O alvo já está no limite desse item (${transferred.maxStack}).`
              : "Item inválido.")),
      })
      return true
    }

    await sock.sendMessage(from, {
      text: `🎁 @${sender.split("@")[0]} doou *${transferred.quantity}x ${transferred.itemKey}* para @${target.split("@")[0]}.`,
      mentions: [sender, target],
    })
    return true
  }

  if (cmdName === prefix + "roubar" && isGroup) {
    const target = mentioned[0]
    if (!target) {
      await sock.sendMessage(from, { text: "Use: !roubar @user" })
      return true
    }

    const STEAL_COOLDOWN_MS = 30 * 60_000
    const lastStealAt = economyService.getStealCooldown(sender)
    const stealRemaining = (lastStealAt + STEAL_COOLDOWN_MS) - Date.now()
    if (stealRemaining > 0) {
      await sock.sendMessage(from, {
        text: `⏰ Você pode tentar roubar novamente em ${formatDuration(stealRemaining)}.`,
      })
      return true
    }

    const steal = economyService.attemptSteal(sender, target)
    if (!steal.ok) {
      if (steal.reason === "same-target-today") {
        await sock.sendMessage(from, { text: "Você já tentou roubar essa mesma pessoa hoje." })
        return true
      }
      if (steal.reason === "daily-limit-reached") {
        await sock.sendMessage(from, { text: "Você já atingiu o limite diário de 3 roubos em alvos diferentes." })
        return true
      }
      await sock.sendMessage(from, {
        text: steal.reason === "victim-empty"
          ? "A vítima está sem moedas."
          : "Não foi possível concluir o roubo.",
      })
      return true
    }

    economyService.setStealCooldown(sender, Date.now())

    economyService.incrementStat(sender, "steals", 1)

    if (!steal.success) {
      const xpResult = grantCommandXp(economyService, sender, XP_REWARDS.stealAttemptFail, "steal-fail", {
        target,
      })
      await sock.sendMessage(from, {
        text:
          `🚨 Roubo falhou! @${sender.split("@")[0]} perdeu *${steal.lost}* ${CURRENCY_LABEL}.\n` +
          `Chance de sucesso nesta tentativa: ${(steal.successChance * 100).toFixed(0)}%` +
          buildXpRewardText(xpResult, XP_REWARDS.stealAttemptFail),
        mentions: [sender],
      })
      return true
    }

    const xpResult = grantCommandXp(economyService, sender, XP_REWARDS.stealAttemptSuccess, "steal-success", {
      target,
      gained: steal.gained,
    })
    await sock.sendMessage(from, {
      text:
        `🕵️ Roubo bem-sucedido! @${sender.split("@")[0]} roubou *${steal.stolenFromVictim}* de @${target.split("@")[0]} e recebeu *${steal.gained}* ${CURRENCY_LABEL}.\n` +
        `Faixa base do roubo: 50 a 200 ${CURRENCY_LABEL} (antes de bônus da Coroa Kronos).\n` +
        `Chance de sucesso nesta tentativa: ${(steal.successChance * 100).toFixed(0)}%` +
        buildXpRewardText(xpResult, XP_REWARDS.stealAttemptSuccess),
      mentions: [sender, target],
    })
    return true
  }

  if (cmd === prefix + "daily") {
    const level = Math.max(1, Math.floor(Number(economyService.getProfile(sender)?.progression?.level) || 1))
    const scaledDailyCoins = getLevelScaledAmount(100, level, 0.03)
    const scaledDailyXp = getLevelScaledAmount(XP_REWARDS.dailyClaim, level, 0.03)
    const daily = economyService.claimDaily(sender, scaledDailyCoins)
    if (!daily.ok) {
      await sock.sendMessage(from, {
        text: "⏰ Você já resgatou seu daily hoje. Volte após o próximo reset global da meia-noite.",
      })
      return true
    }

    const xpResult = grantCommandXp(economyService, sender, scaledDailyXp, "daily-claim", {
      dayKey: daily.dayKey,
    })
    await sock.sendMessage(from, {
      text:
        `💰 Daily resgatado: *${daily.amount}* ${CURRENCY_LABEL}.` +
        (daily.kronosBonus ? " (bônus da Coroa Kronos aplicado)" : "") +
        buildXpRewardText(xpResult, scaledDailyXp),
    })
    return true
  }

  if (cmdName === prefix + "carepackage") {
    const result = economyService.claimCarePackage(sender)

    if (!result.ok) {
      if (result.reason === "ineligible-coins") {
        await sock.sendMessage(from, {
          text: `Você não é elegível para o pacote de ajuda. É necessário ter 500 ${CURRENCY_LABEL} ou menos. Você tem ${result.coins}.`,
        })
        return true
      }
      if (result.reason === "cooldown") {
        await sock.sendMessage(from, {
          text: `Você já resgatou seu pacote de ajuda. Tente novamente em ${formatDuration(result.remainingMs)}.`,
        })
        return true
      }
      await sock.sendMessage(from, {
        text: "Não foi possível resgatar o pacote de ajuda no momento.",
      })
      return true
    }

    await sock.sendMessage(from, {
      text:
        `📦 Pacote de ajuda resgatado!\n` +
        `Você recebeu: *${result.coins} ${CURRENCY_LABEL}* e *${result.shields} escudos*.`,
    })
    return true
  }

  if (cmd === prefix + "cassino") {
    await sock.sendMessage(from, {
      text:
        `🎰 Cassino\n` +
        `1 ou 2 iguais: perde a aposta\n` +
        `3 iguais: ganha 3x\n` +
        `4 iguais: ganha 8x\n` +
        `5 iguais: jackpot 30x\n\n` +
        `Use: !aposta <valor>`,
    })
    return true
  }

  if (cmdName === prefix + "aposta") {
    const value = parseQuantity(cmdArg1, 0)
    if (value <= 0) {
      await sock.sendMessage(from, { text: "Use: !aposta <valor>" })
      return true
    }

    if (!economyService.debitCoins(sender, value, {
      type: "casino-bet",
      details: `Aposta de ${value}`,
      meta: { value },
    })) {
      await sock.sendMessage(from, { text: "Saldo insuficiente para essa aposta." })
      return true
    }

    incrementUserStat(sender, "moneyCasinoLost", value)

    const emojis = ["🍒", "🍋", "🍇", "💎", "7️⃣", "⭐"]
    const roll = () => emojis[Math.floor(Math.random() * emojis.length)]
    const result = [roll(), roll(), roll(), roll(), roll()]
    const counts = {}
    result.forEach((e) => { counts[e] = (counts[e] || 0) + 1 })
    const maxCount = Math.max(...Object.values(counts))

    let payout = 0
    if (maxCount === 5) payout = value * 30
    else if (maxCount === 4) payout = value * 8
    else if (maxCount === 3) payout = value * 3

    if (payout > 0) {
      payout = economyService.applyKronosGainMultiplier(sender, payout, "casino")
      economyService.creditCoins(sender, payout, {
        type: "casino-win",
        details: `Resultado do cassino (${maxCount} iguais)`,
        meta: { payout, maxCount },
      })
      incrementUserStat(sender, "moneyCasinoWon", payout)
    }

    const casinoXp = payout > 0
      ? XP_REWARDS.casinoPlay + XP_REWARDS.casinoWinBonus
      : XP_REWARDS.casinoPlay
    const xpResult = grantCommandXp(economyService, sender, casinoXp, "casino-play", {
      payout,
      maxCount,
    })

    economyService.incrementStat(sender, "casinoPlays", 1)
    telemetry.incrementCounter("economy.casino.play", 1, {
      result: payout > 0 ? "win" : "loss",
    })
    telemetry.appendEvent("economy.casino.play", {
      userId: sender,
      bet: value,
      payout,
      maxCount,
      won: payout > 0,
    })

    await sock.sendMessage(from, {
      text:
        `🎰 ${result.join(" ")}\n` +
        (payout > 0
          ? `Resultado: ganhou *${payout}* ${CURRENCY_LABEL}.`
          : `Resultado: perdeu *${value}* ${CURRENCY_LABEL}.`) +
        buildXpRewardText(xpResult, casinoXp),
    })
    return true
  }

  if (cmdName === prefix + "lootbox" && isGroup) {
    const quantity = parseQuantity(cmdArg1, 1)
    if (quantity <= 0) {
      await sock.sendMessage(from, { text: "Use: !lootbox <quantidade>" })
      return true
    }

    // pega membros do grupo para os efeitos da lootbox
    const metadata = await sock.groupMetadata(from)
    const groupMembers = (metadata?.participants || []).map((p) => jidNormalizedUser(p.id))

    const result = economyService.openLootbox(sender, quantity, groupMembers)
    if (!result.ok) {
      const available = result.available || 0
      await sock.sendMessage(from, {
        text: result.reason === "insufficient-items"
          ? `Você não tem quantidade suficiente de lootboxes. Disponível: ${available}.`
          : (result.reason === "quantity-too-large"
            ? `Quantidade muito alta. Limite por abertura: ${result.maxQuantity}.`
            : "Erro ao abrir lootbox."),
      })
      return true
    }

    for (const roll of result.results) {
      if (!roll?.punishment?.type) continue
      await applyPunishment(sock, from, roll.targetUser, String(roll.punishment.type), {
        severityMultiplier: Number(roll.punishment.severity) || 1,
        origin: "game",
        botUserId: sock.user?.id,
      })
    }

    const resultBlocks = result.results.map((r, index) => {
      const title = `🎁 Lootbox #${index + 1}`
      const effectLine = `• Efeito: *${r.effect}*`
      const resultLine = `• Resultado: ${r.result}`
      return `${title}\n${effectLine}\n${resultLine}`
    })
    const resultLines = resultBlocks.join("\n\n")
    const mentions = result.results
      .filter((r) => r.targetIsOther)
      .map((r) => r.targetUser)
      .filter((id, idx, arr) => arr.indexOf(id) === idx)

    if (mentions.includes(sender)) {
      mentions.splice(mentions.indexOf(sender), 1)
    }
    mentions.unshift(sender)
    const filteredMentions = applyMentionPolicy(mentions)

    const redirected = result.results.filter((r) => r.targetIsOther)
    const redirectedPrefix = redirected.length > 0
      ? `\n⚠️ Redirecionamentos: *${redirected.length}* efeito(s) foram para outras pessoas.\n` +
        `${redirected.map((r) => `- ${r.effect} -> @${r.targetUser.split("@")[0]}`).join("\n")}\n`
      : ""

    await sock.sendMessage(from, {
      text:
        `🎉 ${sender.split("@")[0]} abriu *${quantity}x* Lootbox!\n` +
        `${redirectedPrefix ? `${redirectedPrefix}\n` : ""}` +
        `${resultLines}`,
      mentions: filteredMentions,
    })
    return true
  }

  if (cmdName === prefix + "falsificar") {
    if (String(cmdArg1 || "").toLowerCase() === "tipo") {
      const chosenType = Number.parseInt(String(cmdArg2 || ""), 10)
      if (!Number.isFinite(chosenType) || chosenType < 1 || chosenType > 13) {
        await sock.sendMessage(from, { text: "Use: !falsificar tipo <1-13>" })
        return true
      }
      await sock.sendMessage(from, {
        text: "Não há escolha pendente no momento para esse comando.",
      })
      return true
    }

    const type = Number.parseInt(cmdArg1 || "", 10)
    if (!Number.isFinite(type) || type < 1 || type > 13) {
      await sock.sendMessage(from, {
        text: "Use: !falsificar <tipo 1-13> [severidade] [quantidade] [S|N]",
      })
      return true
    }

    let severity = 1
    let quantity = 1
    let boostToken = "N"

    const rawArg2 = String(cmdParts[2] || "").trim()
    const rawArg3 = String(cmdParts[3] || "").trim()
    const rawArg4 = String(cmdParts[4] || "").trim()

    if (rawArg2) {
      if (/^\d+$/.test(rawArg2)) {
        severity = parseQuantity(rawArg2, 1)
      } else {
        boostToken = rawArg2
      }
    }

    if (rawArg3) {
      if (/^\d+$/.test(rawArg2) && /^\d+$/.test(rawArg3)) {
        quantity = parseQuantity(rawArg3, 1)
      } else if (!rawArg4) {
        boostToken = rawArg3
      }
    }

    if (rawArg4) {
      boostToken = rawArg4
    }

    if (severity <= 0 || quantity <= 0) {
      await sock.sendMessage(from, {
        text: "Use: !falsificar <tipo 1-13> [severidade] [quantidade] [S|N]",
      })
      return true
    }

    const normalizedBoost = String(boostToken || "N").trim().toUpperCase() || "N"
    if (!["S", "N"].includes(normalizedBoost)) {
      await sock.sendMessage(from, {
        text: "Argumento de boost inválido. Use S para ativar boost ou N para desativar.",
      })
      return true
    }
    const boostedOdds = normalizedBoost === "S"

    const forged = economyService.forgePunishmentPass(sender, type, severity, quantity, {
      boostedOdds,
      deferTypeSelection: true,
    })
    if (!forged.ok) {
      if (forged.reason === "insufficient-items") {
        await sock.sendMessage(from, {
          text: `Você não possui passes suficientes desse tipo/severidade. Disponível: ${forged.available}.`,
        })
        return true
      }
      if (forged.reason === "quantity-too-large") {
        await sock.sendMessage(from, {
          text: `Quantidade muito alta para falsificação. Limite por operação: ${forged.maxQuantity}.`,
        })
        return true
      }
      if (forged.reason === "insufficient-funds") {
        await sock.sendMessage(from, {
          text: `Faltou verba para subornar o cartório clandestino. Custo: ${forged.forgeCost} ${CURRENCY_LABEL}.`,
        })
        return true
      }
      await sock.sendMessage(from, { text: "Não foi possível iniciar sua falsificação." })
      return true
    }

    if (forged.outcome === "multiply") {
      await sock.sendMessage(from, {
        text:
          `🖋️ Carimbos perfeitos!\n` +
          `Os documentos passaram na auditoria ilegal e renderam *+${forged.bonus}* passes extras.\n` +
          `Taxa paga: *${forged.forgeCost}* ${CURRENCY_LABEL}${boostedOdds ? " (modo boost)" : ""}.`,
      })
      return true
    }

    if (forged.outcome === "upgrade-severity") {
      await sock.sendMessage(from, {
        text:
          `📑 Assinatura turbinada!\n` +
          `Seus passes foram promovidos para severidade *${forged.upgradedSeverity}x*.\n` +
          `Taxa de operação: *${forged.forgeCost}* ${CURRENCY_LABEL}${boostedOdds ? " (modo boost)" : ""}.`,
      })
      return true
    }

    if (forged.outcome === "change-type-pending") {
      const expiresAt = Date.now() + (5 * 60_000)
      pendingForgeTypeByUser.set(sender, {
        fromType: forged.fromType,
        severity: forged.severity,
        quantity: forged.quantity,
        groupId: from,
        createdAt: Date.now(),
        expiresAt,
      })

      await sock.sendMessage(from, {
        text:
          `🧾 Troca de timbre iniciada!\n` +
          `Escolha o novo tipo aqui no grupo com *!falsificar tipo <1-13>* em até *5 minutos*.\n` +
          `${getPunishmentMenuTextForGroup()}\n\n` +
          `Você receberá um aviso faltando 15 segundos para expirar.\n` +
          `Taxa de operação: *${forged.forgeCost}* ${CURRENCY_LABEL}${boostedOdds ? " (modo boost)" : ""}.`,
        mentions: [sender],
      })

      setTimeout(async () => {
        const pending = pendingForgeTypeByUser.get(sender)
        if (!pending || pending.expiresAt !== expiresAt || pending.groupId !== from) return
        try {
          await sock.sendMessage(from, {
            text: `⏳ @${sender.split("@")[0]}, sua escolha de tipo expira em 15 segundos.`,
            mentions: [sender],
          })
        } catch (err) {
          console.error("Erro ao avisar expiração próxima da falsificação", err)
        }
      }, (5 * 60_000) - 15_000)

      setTimeout(async () => {
        const pending = pendingForgeTypeByUser.get(sender)
        if (!pending || pending.expiresAt !== expiresAt || pending.groupId !== from) return
        pendingForgeTypeByUser.delete(sender)
        try {
          await sock.sendMessage(from, {
            text: `⌛ @${sender.split("@")[0]}, tempo expirado. A conversão por mudança de tipo foi cancelada sem escolha.`,
            mentions: [sender],
          })
        } catch (err) {
          console.error("Erro ao avisar expiração da falsificação", err)
        }
      }, 5 * 60_000)

      return true
    }

    if (forged.outcome === "change-type") {
      await sock.sendMessage(from, {
        text:
          `🧾 Troca de timbre concluída!\n` +
          `Os passes mudaram de punição *${forged.fromType}* para *${forged.toType}*.\n` +
          `Taxa de operação: *${forged.forgeCost}* ${CURRENCY_LABEL}${boostedOdds ? " (modo boost)" : ""}.`,
      })
      return true
    }

    await sock.sendMessage(from, {
      text:
        `🚨 Fiscalização surpresa!\n` +
        `Metade do lote foi apreendida: *-${forged.lost}* passes.\n` +
        `Você perdeu também a taxa de *${forged.forgeCost}* ${CURRENCY_LABEL}${boostedOdds ? " (modo boost)" : ""}.`,
    })
    return true
  }

  if (cmdName === prefix + "trabalho") {
    const work = cmdArg1
    const level = Math.max(1, Math.floor(Number(economyService.getProfile(sender)?.progression?.level) || 1))
    if (!work) {
      await sock.sendMessage(from, {
        text: "Use: !trabalho <ifood|capinar|lavagem>",
      })
      return true
    }

    const WORK_COOLDOWN_MS = 120 * 60_000
    const lastWorkAt = economyService.getWorkCooldown(sender)
    const remaining = (lastWorkAt + WORK_COOLDOWN_MS) - Date.now()
    if (remaining > 0) {
      await sock.sendMessage(from, {
        text: `⏰ Você pode trabalhar novamente em ${formatDuration(remaining)}.`,
      })
      return true
    }

    economyService.setWorkCooldown(sender, Date.now())
    economyService.incrementStat(sender, "works", 1)

    let gain = 0
    let message = ""
    let workStatus = "none"
    let xpReward = XP_REWARDS.workFail

    if (work === "ifood") {
      if (Math.random() < 0.1) {
        message = "🚗 Você sofreu um acidente no delivery e ficou sem pagamento hoje."
        workStatus = "fail"
        xpReward = XP_REWARDS.workFail
      } else {
        gain = Math.floor(Math.random() * 71) + 30
        message = `🍔 Delivery concluído! Você ganhou ${gain} ${CURRENCY_LABEL}.`
        workStatus = "win"
        xpReward = XP_REWARDS.workWin
      }
    } else if (work === "capinar") {
      if (Math.random() < 0.2) {
        message = "🐍 Você foi picado e perdeu o dia de trabalho."
        workStatus = "fail"
        xpReward = XP_REWARDS.workFail
      } else {
        gain = 70
        message = `🌱 Serviço concluído! Você ganhou ${gain} ${CURRENCY_LABEL}.`
        workStatus = "win"
        xpReward = XP_REWARDS.workWin
      }
    } else if (work === "lavagem") {
      if (Math.random() < 0.8) {
        const lost = economyService.debitCoinsFlexible(sender, Math.floor(economyService.getCoins(sender) * 0.4), {
          type: "work-loss",
          details: "Falha no trabalho lavagem",
          meta: { work },
        })
        message = `💀 Lavagem fracassou! Você perdeu ${lost} ${CURRENCY_LABEL}.`
        workStatus = "loss"
        xpReward = XP_REWARDS.workFail
      } else {
        gain = Math.floor(Math.random() * 201) + 200
        message = `💰 Lavagem concluída! Você ganhou ${gain} ${CURRENCY_LABEL}.`
        workStatus = "win"
        xpReward = XP_REWARDS.workWin
      }
    } else {
      await sock.sendMessage(from, { text: "Trabalho inválido. Use: ifood, capinar ou lavagem." })
      return true
    }

    if (gain > 0) {
      gain = getLevelScaledAmount(gain, level, 0.03)
      gain = economyService.applyKronosGainMultiplier(sender, gain, "work")
      economyService.creditCoins(sender, gain, {
        type: "work-win",
        details: `Pagamento de trabalho ${work}`,
        meta: { work, gain },
      })
    }

    telemetry.incrementCounter("economy.work.attempt", 1, {
      work,
      status: workStatus,
    })
    telemetry.appendEvent("economy.work.attempt", {
      userId: sender,
      work,
      status: workStatus,
      gain,
    })

    const scaledWorkXp = getLevelScaledAmount(xpReward, level, 0.03)
    const xpResult = grantCommandXp(economyService, sender, scaledWorkXp, "work", {
      work,
      status: workStatus,
      gain,
    })
    await sock.sendMessage(from, {
      text: message + buildXpRewardText(xpResult, scaledWorkXp),
    })
    return true
  }

  if (cmdName === prefix + "loteria") {
    if (!isGroup) {
      await sock.sendMessage(from, {
        text: "Use este comando em grupo.",
      })
      return true
    }

    const settleRaffleSession = async (sessionId = null) => {
      const activeSession = activeRafflesByGroup.get(from)
      if (!activeSession) return false
      if (sessionId && activeSession.id !== sessionId) return false
      activeRafflesByGroup.delete(from)

      if (activeSession.timeoutId) {
        clearTimeout(activeSession.timeoutId)
      }

      const candidates = Array.from(activeSession.participants)
        .filter((participantId) => participantId && participantId !== activeSession.createdBy)

      if (!candidates.length) {
        await sock.sendMessage(from, {
          text: `⛔ Loteria *${activeSession.title}* cancelada: sem participantes válidos.`,
        })
        return true
      }

      const shuffledCandidates = [...candidates]
      for (let i = shuffledCandidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const temp = shuffledCandidates[i]
        shuffledCandidates[i] = shuffledCandidates[j]
        shuffledCandidates[j] = temp
      }
      const winners = shuffledCandidates.slice(0, Math.min(activeSession.winnersCount, shuffledCandidates.length))

      const appliedRewardLines = []
      for (const winner of winners) {
        for (const reward of activeSession.rewards) {
          if (reward.type === "coins") {
            const received = economyService.creditCoins(winner, reward.amount, {
              type: "raffle-win",
              details: `Loteria: ${activeSession.title}`,
              meta: { groupId: from, createdBy: activeSession.createdBy },
            })
            appliedRewardLines.push(`- @${winner.split("@")[0]}: ${received} ${CURRENCY_LABEL}`)
            continue
          }

          if (reward.type === "item") {
            const added = economyService.addItem(winner, reward.itemKey, reward.quantity)
            if (added > 0 && typeof economyService.pushTransaction === "function") {
              economyService.pushTransaction(winner, {
                type: "raffle-win-item",
                deltaCoins: 0,
                details: `Loteria: ${activeSession.title} (${added}x ${reward.itemKey})`,
                meta: { groupId: from, createdBy: activeSession.createdBy, item: reward.itemKey, qty: added },
              })
            }
            appliedRewardLines.push(`- @${winner.split("@")[0]}: ${added}x ${reward.name}`)
            continue
          }

          if (reward.type === "text") {
            appliedRewardLines.push(`- @${winner.split("@")[0]}: ${reward.text}`)
          }
        }
      }

      await sock.sendMessage(from, {
        text:
          `🏆 Resultado da loteria *${activeSession.title}*\n` +
          `Vencedores:\n${winners.map((winnerId) => `- @${winnerId.split("@")[0]}`).join("\n")}\n` +
          `Prêmios:\n${appliedRewardLines.join("\n")}`,
        mentions: applyMentionPolicy(winners),
      })
      return true
    }

    const raffleAction = String(cmdArg1 || "").trim().toLowerCase()
    if (raffleAction === "entrar") {
      const activeSession = activeRafflesByGroup.get(from)
      if (!activeSession || !activeSession.optIn) {
        await sock.sendMessage(from, {
          text: "Não há loteria com opt-in ativa neste grupo.",
        })
        return true
      }
      if (sender === activeSession.createdBy) {
        await sock.sendMessage(from, {
          text: "Quem criou a loteria não participa do sorteio.",
        })
        return true
      }
      activeSession.participants.add(sender)
      await sock.sendMessage(from, {
        text: `🎟️ Entrada confirmada na loteria *${activeSession.title}*.` +
          `\nParticipantes: *${activeSession.participants.size}*`,
      })
      return true
    }

    if (raffleAction === "fechar") {
      const activeSession = activeRafflesByGroup.get(from)
      if (!activeSession || !activeSession.optIn) {
        await sock.sendMessage(from, {
          text: "Não há loteria com opt-in ativa neste grupo.",
        })
        return true
      }

      await sock.sendMessage(from, {
        text: `🔒 Loteria *${activeSession.title}* foi fechada. Sorteando...`,
      })
      await settleRaffleSession(activeSession.id)
      return true
    }

    if (!isOverrideSender) {
      await sock.sendMessage(from, {
        text: "Apenas overrides podem iniciar loterias.",
      })
      return true
    }

    if (activeRafflesByGroup.has(from)) {
      await sock.sendMessage(from, {
        text: "Já existe uma loteria em andamento neste grupo.",
      })
      return true
    }

    const rawCommand = String(rawText || cmd || "").trim()
    const commandRemainder = rawCommand.slice((prefix + "loteria").length).trim()
    const parsedArgs = parseRaffleCreationArgs(commandRemainder)
    if (!parsedArgs.ok) {
      await sock.sendMessage(from, {
        text:
          "Use: !loteria \"<título>\" \"<recompensas>\" <S|N> <qtdVencedores>\n" +
          "Recompensas: texto livre | moedas=<valor> | item:<itemID-quantidade>\n" +
          "Ex.: !loteria \"Sextou\" \"moedas=500|item:escudo-2|Vale lanche\" S 2",
      })
      return true
    }

    const parsedRewards = parseRaffleRewards(parsedArgs.rewardRaw, economyService, limits)
    if (!parsedRewards.ok) {
      await sock.sendMessage(from, {
        text:
          "Recompensas inválidas para loteria." +
          (parsedRewards.details ? `\nDetalhe: ${parsedRewards.details}` : "") +
          "\nFormato: texto | moedas=<valor> | item:<itemID-quantidade>",
      })
      return true
    }

    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const revealDelay = Number.isFinite(Number(raffleRevealDelayMs))
      ? Math.max(0, Math.floor(Number(raffleRevealDelayMs)))
      : RAFFLE_REVEAL_DELAY_MS
    const optInWindowMs = Number.isFinite(Number(raffleOptInWindowMs))
      ? Math.max(1000, Math.floor(Number(raffleOptInWindowMs)))
      : RAFFLE_OPTIN_WINDOW_MS
    const session = {
      id: sessionId,
      groupId: from,
      createdBy: sender,
      title: parsedArgs.title,
      rewards: parsedRewards.rewards,
      optIn: parsedArgs.optIn,
      participants: new Set(),
      winnersCount: Math.max(1, Math.min(100, parsedArgs.winnersCount)),
      createdAt: Date.now(),
      timeoutId: null,
    }

    if (!session.optIn) {
      const metadata = await sock.groupMetadata(from)
      const botJid = jidNormalizedUser(sock.user?.id || "")
      const participants = (metadata?.participants || [])
        .map((participant) => jidNormalizedUser(participant.id))
        .filter((participantId) => participantId && participantId !== botJid && participantId !== sender)
      session.participants = new Set(participants)
    }

    activeRafflesByGroup.set(from, session)

    const rewardPreview = parsedRewards.rewards
      .map((reward) => {
        if (reward.type === "coins") return `- moedas=${reward.amount}`
        if (reward.type === "item") return `- item:${reward.itemKey}-${reward.quantity}`
        return `- ${reward.text}`
      })
      .join("\n")

    await sock.sendMessage(from, {
      text:
        `🎲 Loteria iniciada!\n` +
        `Título: *${session.title}*\n` +
        `${session.optIn
          ? `Aberta por *${Math.ceil(optInWindowMs / 60000)} min* ou até *${prefix}loteria fechar*.\n`
          : `Resultado em *${Math.ceil(revealDelay / 1000)}s*.\n`}` +
        `Opt-in: *${session.optIn ? "S" : "N"}*\n` +
        `Vencedores: *${session.winnersCount}*\n` +
        `Participantes atuais: *${session.participants.size}*\n` +
        `${session.optIn ? `Para participar, use: *${prefix}loteria entrar*\n` : ""}` +
        `Recompensas:\n${rewardPreview}`,
      mentions: applyMentionPolicy(Array.from(session.participants)),
    })

    session.timeoutId = setTimeout(async () => {
      await settleRaffleSession(sessionId)
    }, session.optIn ? optInWindowMs : revealDelay)
    if (session.timeoutId && typeof session.timeoutId.unref === "function") {
      session.timeoutId.unref()
    }

    return true
  }

  if (cmdName === prefix + "usarpasse" && isGroup) {
    if (!botHasGroupAdminPrivileges) {
      await sock.sendMessage(from, {
        text: "⚠️ Não consigo aplicar punições sem privilégio de administrador no grupo.",
      })
      return true
    }

    const target = mentioned[0]
    const passType = Number.parseInt(cmdParts[2] || "", 10)
    const passSeverity = parseQuantity(cmdParts[3], 1)
    const botId = jidNormalizedUser(sock.user?.id || "")
    if (!target) {
      await sock.sendMessage(from, { text: "Use: !usarpasse @user <tipo 1-13> <severidade>" })
      return true
    }
    if (jidNormalizedUser(target) === botId) {
      await sock.sendMessage(from, { text: "🤖 O bot não pode receber punições administrativas." })
      return true
    }
    if (!Number.isFinite(passType) || passType < 1 || passType > 13 || passSeverity <= 0) {
      await sock.sendMessage(from, { text: "Use: !usarpasse @user <tipo 1-13> <severidade>" })
      return true
    }

    const passKey = economyService.createPunishmentPassKey(passType, passSeverity)
    if (!passKey) {
      await sock.sendMessage(from, { text: "Tipo ou severidade inválidos." })
      return true
    }

    const hasPass = economyService.getItemQuantity(sender, passKey)
    if (hasPass < 1) {
      await sock.sendMessage(from, { text: `Você não possui ${passKey} no inventário.` })
      return true
    }
    economyService.removeItem(sender, passKey, 1)

    await applyPunishment(sock, from, target, String(passType), {
      severityMultiplier: passSeverity,
      origin: "game",
      botUserId: sock.user?.id,
    })
    return true
  }

  if ((cmdName === prefix + "setcoins" || cmdName === prefix + "addcoins" || cmdName === prefix + "removecoins" || cmdName === prefix + "additem" || cmdName === prefix + "removeitem") && isGroup) {
    if (!isOverrideSender) {
      await sock.sendMessage(from, { text: "Apenas overrides podem usar esse comando." })
      return true
    }

    const mentionedTarget = mentioned[0] || null
    const target = mentionedTarget || sender
    const argOffset = mentionedTarget ? 2 : 1
    const targetMentions = mentionedTarget ? [target] : []

    if (cmdName === prefix + "setcoins") {
      const amount = Number.parseInt(cmdParts[argOffset], 10)
      if (!Number.isFinite(amount) || amount < 0 || amount > limits.maxCoinsBalance) {
        return sock.sendMessage(from, { text: "Use: !setcoins [@user] <quantidade>" })
      }
      const result = economyService.setCoins(target, amount, {
        type: "admin-setcoins",
        details: `Admin definiu saldo para ${amount}`,
        meta: { admin: sender },
      })
      await sock.sendMessage(from, {
        text: `✅ Saldo de @${target.split("@")[0]} ajustado para *${result.balance}* ${CURRENCY_LABEL}.`,
        mentions: targetMentions,
      })
      return true
    }

    if (cmdName === prefix + "addcoins") {
      const amount = parseQuantity(cmdParts[argOffset], 1)
      if (amount <= 0 || amount > limits.maxCoinOperation) {
        return sock.sendMessage(from, { text: `Use: !addcoins [@user] [quantidade] (máx: ${limits.maxCoinOperation})` })
      }
      economyService.creditCoins(target, amount, {
        type: "admin-credit",
        details: `Admin adicionou ${amount}`,
        meta: { admin: sender },
      })
      await sock.sendMessage(from, { text: `✅ ${amount} ${CURRENCY_LABEL} adicionadas para @${target.split("@")[0]}.`, mentions: targetMentions })
      return true
    }

    if (cmdName === prefix + "removecoins") {
      const amount = parseQuantity(cmdParts[argOffset], 1)
      if (amount <= 0 || amount > limits.maxCoinOperation) {
        return sock.sendMessage(from, { text: `Use: !removecoins [@user] [quantidade] (máx: ${limits.maxCoinOperation})` })
      }
      const removed = economyService.debitCoinsFlexible(target, amount, {
        type: "admin-debit",
        details: `Admin removeu ${amount}`,
        meta: { admin: sender },
      })
      await sock.sendMessage(from, { text: `✅ ${removed} ${CURRENCY_LABEL} removidas de @${target.split("@")[0]}.`, mentions: targetMentions })
      return true
    }

    if (cmdName === prefix + "additem") {
      const item = String(cmdParts[argOffset] || "").trim()
      if (!item) return sock.sendMessage(from, { text: "Use: !additem [@user] <item> [quantidade]" })

      let effectiveItem = item
      let qty = parseQuantity(cmdParts[argOffset + 1], 1)

      const normalized = item.toLowerCase()
      const isPassRequest = ["passe", "pass", "passepunicao", "passpunicao"].includes(normalized)

      if (isPassRequest) {
        const passType = parseQuantity(cmdParts[argOffset + 1], 0)
        const passSeverity = parseQuantity(cmdParts[argOffset + 2], 1)
        qty = parseQuantity(cmdParts[argOffset + 3], 1)
        if (passType < 1 || passType > 13 || passSeverity <= 0 || qty <= 0 || qty > limits.maxItemOperation) {
          return sock.sendMessage(from, {
            text: "Use: !additem [@user] passe <tipo 1-13> <severidade> [quantidade]",
          })
        }
        const passKey = economyService.createPunishmentPassKey(passType, passSeverity)
        if (!passKey) {
          return sock.sendMessage(from, { text: "Tipo ou severidade de passe inválido." })
        }
        effectiveItem = passKey
      }

      if (qty <= 0 || qty > limits.maxItemOperation) {
        return sock.sendMessage(from, { text: `Quantidade inválida. Máximo por operação: ${limits.maxItemOperation}.` })
      }

      const next = economyService.addItem(target, effectiveItem, qty)
      if (next <= 0) return sock.sendMessage(from, { text: "Item inválido." })

      const itemDef = economyService.getItemDefinition(effectiveItem)
      const itemName = itemDef?.name || effectiveItem
      economyService.pushTransaction(target, {
        type: "admin-item-add",
        deltaCoins: 0,
        details: `Admin adicionou ${qty}x ${effectiveItem}`,
        meta: { admin: sender, item: effectiveItem, qty },
      })
      await sock.sendMessage(from, {
        text: `✅ Item adicionado para @${target.split("@")[0]}: *${qty}x ${itemName}*`,
        mentions: targetMentions,
      })
      return true
    }

    if (cmdName === prefix + "removeitem") {
      const item = cmdParts[argOffset]
      const qtyInput = cmdParts[argOffset + 1]
      const qty = parseQuantity(qtyInput, 0)
      if (!item || !qtyInput || qty <= 0 || qty > limits.maxItemOperation) {
        return sock.sendMessage(from, { text: "Use: !removeitem [@user] <tipo> <quantidade>" })
      }
      economyService.removeItem(target, item, qty)
      economyService.pushTransaction(target, {
        type: "admin-item-remove",
        deltaCoins: 0,
        details: `Admin removeu ${qty}x ${item}`,
        meta: { admin: sender, item, qty },
      })
      await sock.sendMessage(from, { text: `✅ Item removido de @${target.split("@")[0]}.`, mentions: targetMentions })
      return true
    }
  }

  return false
}

module.exports = {
  handleEconomyCommands,
  cleanupUserLinkedState,
}
