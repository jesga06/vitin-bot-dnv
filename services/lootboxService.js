const { formatMentionTag } = require("./mentionService")
const LOOTBOX_FIXED_EFFECTS = [
  { id: "daily_reset", name: "Resetar cooldown !daily", weight: 30, description: "Reseta !daily" },
  { id: "work_reset", name: "Resetar cooldown !trabalho", weight: 30, description: "Reseta !trabalho" },
  { id: "coins_500_gain", name: "Ganhar 500 coins", weight: 6, description: "+500 moedas" },
  { id: "coins_500_loss", name: "Perder 500 coins", weight: 5, description: "-500 moedas" },
  { id: "coins_1000_gain", name: "Ganhar 1000 coins", weight: 6, description: "+1000 moedas" },
  { id: "coins_1000_loss", name: "Perder 1000 coins", weight: 5, description: "-1000 moedas" },
  { id: "coins_1500_gain", name: "Ganhar 1500 coins", weight: 4, description: "+1500 moedas" },
  { id: "coins_1500_loss", name: "Perder 1500 coins", weight: 3.5, description: "-1500 moedas" },
  { id: "coins_2500_gain", name: "Ganhar 2500 coins", weight: 4, description: "+2500 moedas" },
  { id: "coins_2500_loss", name: "Perder 2500 coins", weight: 3, description: "-2500 moedas" },
  { id: "coins_5000_gain", name: "Ganhar 5000 coins", weight: 1.4, description: "+5000 moedas" },
  { id: "coins_4000_loss", name: "Perder 4000 coins", weight: 1.2, description: "-4000 moedas" },
  {
    id: "coins_pct_2_5_gain",
    name: "Ganhar 2.5% da carteira",
    weight: 3,
    description: "+2.5% da carteira",
    percentDelta: 2.5,
    minAmount: 30,
  },
  {
    id: "coins_pct_7_5_gain",
    name: "Ganhar 7.5% da carteira",
    weight: 2,
    description: "+7.5% da carteira",
    percentDelta: 7.5,
    minAmount: 60,
  },
  {
    id: "coins_pct_12_5_gain",
    name: "Ganhar 12.5% da carteira",
    weight: 0.9,
    description: "+12.5% da carteira",
    percentDelta: 12.5,
    minAmount: 120,
  },
  {
    id: "coins_pct_3_5_loss",
    name: "Perder 3.5% da carteira",
    weight: 2.3,
    description: "-3.5% da carteira",
    percentDelta: -3.5,
    minAmount: 30,
  },
  {
    id: "coins_pct_8_5_loss",
    name: "Perder 8.5% da carteira",
    weight: 1.2,
    description: "-8.5% da carteira",
    percentDelta: -8.5,
    minAmount: 60,
  },
  { id: "shield_1_gain", name: "Ganhar 1 escudo", weight: 4, description: "+1 escudo" },
  { id: "shield_1_loss", name: "Perder 1 escudo", weight: 3, description: "-1 escudo" },
  { id: "shield_3_gain", name: "Ganhar 3 escudos", weight: 3, description: "+3 escudos" },
  { id: "shield_3_loss", name: "Perder 3 escudos", weight: 2, description: "-3 escudos" },
  { id: "utility_pack", name: "Pacote utilitário", weight: 1.6, description: "+1 quest reroll +1 salvage token" },
  { id: "defense_pack", name: "Pacote de defesa", weight: 1.3, description: "+1 escudo reforçado +1 antirroubo" },
  { id: "kronos_quebrada", name: "Ganhar Coroa Kronos (Quebrada)", weight: 1, description: "+1 Coroa Kronos (Quebrada)" },
  { id: "punishment_pass_1x", name: "Passe de Punição (1x)", weight: 2, description: "+1 Passe de Punição (1x)" },
  { id: "punishment_1x", name: "Punição (1x)", weight: 4, description: "Punição aleatória (1x)" },
  { id: "punishment_pass_5x", name: "Passe de Punição (5x)", weight: 1, description: "+1 Passe de Punição (5x)" },
  { id: "punishment_5x", name: "Punição (5x)", weight: 3, description: "Punição aleatória (5x)" },
]

function formatPercentPoints(value = 0) {
  const safe = Number(value) || 0
  if (!Number.isFinite(safe) || safe === 0) return "0"
  const abs = Math.abs(safe)
  const rendered = abs.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")
  return rendered
}

function getRarityFromDefinition(definition = {}) {
  return Math.max(1, Math.min(5, Math.floor(Number(definition?.rarity) || 1)))
}

function rollItemQuantityByRarity(definition = {}, rng = Math.random) {
  const rarity = getRarityFromDefinition(definition)
  const roll = Number(rng())

  if (rarity <= 1) {
    if (roll < 0.05) return 3
    if (roll < 0.25) return 2
    return 1
  }
  if (rarity === 2) {
    if (roll < 0.03) return 3
    if (roll < 0.18) return 2
    return 1
  }
  if (rarity === 3) {
    if (roll < 0.09) return 2
    return 1
  }
  if (rarity === 4) {
    if (roll < 0.04) return 2
    return 1
  }

  return 1
}

function getLootboxItemWeight(item = {}) {
  const price = Math.max(1, Math.floor(Number(item?.price) || 0))
  const rarity = Math.max(1, Math.min(5, Math.floor(Number(item?.rarity) || 1)))
  const key = String(item?.legacyKey || item?.key || "").trim()

  if (rarity >= 5) {
    if (key === "kronosVerdadeira") return 0
    if (key === "kronosQuebrada") return 0.004
    return 0.001
  }

  const rarityModifier = {
    1: 1.2,
    2: 1.0,
    3: 0.7,
    4: 0.35,
  }[rarity] || 1

  const inverseByPrice = 1500 / price
  const weight = inverseByPrice * rarityModifier
  return Number(Math.max(0.05, Math.min(1.5, weight)).toFixed(4))
}

function buildLootboxItemEffects(itemDefinitions = {}) {
  return Object.values(itemDefinitions)
    .filter((item) => item && item.buyable !== false)
    .filter((item) => {
      const identity = String(item?.legacyKey || item?.key || "")
      return identity !== "lootbox" && identity !== "kronosVerdadeira"
    })
    .map((item) => ({
      id: `item_${item.key}`,
      name: `Item: ${item.name}`,
      weight: getLootboxItemWeight(item),
      description: `+1 ${item.name}`,
    }))
    .filter((effect) => effect.weight > 0)
}

function getLootboxEffectsPool(itemDefinitions = {}) {
  return [
    ...LOOTBOX_FIXED_EFFECTS,
    ...buildLootboxItemEffects(itemDefinitions),
  ]
}

function selectRandomEffect(effects = [], rng = Math.random) {
  if (!Array.isArray(effects) || effects.length === 0) return null
  const totalWeight = effects.reduce((sum, effect) => sum + Number(effect.weight || 0), 0)
  if (!(totalWeight > 0)) return effects[0]

  let random = rng() * totalWeight
  for (const effect of effects) {
    random -= Number(effect.weight || 0)
    if (random <= 0) return effect
  }
  return effects[0]
}

function openLootboxEngine({
  userId,
  quantity,
  groupMembers,
  maxLootboxOpenPerCall,
  itemDefinitions,
  ensureUser,
  normalizeUserId,
  economyUsers,
  getItemQuantity,
  removeItem,
  incrementStat,
  addShields,
  addItem,
  buildPunishmentPassKey,
  pickRandomPunishmentType,
  creditCoins,
  debitCoinsFlexible,
  setWorkCooldown,
  touchUser,
  saveEconomy,
  getItemDefinition,
}) {
  const qty = Math.max(1, Math.floor(Number(quantity) || 1))
  const user = ensureUser(userId)
  if (!user) return { ok: false, reason: "invalid-user" }

  if (qty > maxLootboxOpenPerCall) {
    return {
      ok: false,
      reason: "quantity-too-large",
      maxQuantity: maxLootboxOpenPerCall,
    }
  }

  const available = getItemQuantity(userId, "lootbox")
  if (available < qty) {
    return { ok: false, reason: "insufficient-items", available }
  }

  removeItem(userId, "lootbox", qty)
  incrementStat(userId, "lootboxesOpened", qty)

  const results = []
  const ownerNormalized = normalizeUserId(userId)
  const eligibleMembers = Array.from(new Set(groupMembers || []))
    .filter((memberId) => {
      const normalized = normalizeUserId(memberId)
      if (!normalized || normalized === ownerNormalized) return false
      const existing = economyUsers[normalized]
      return Boolean(existing && Number.isFinite(existing.coins) && existing.coins >= 100)
    })

  const effectsPool = getLootboxEffectsPool(itemDefinitions)

  for (let i = 0; i < qty; i++) {
    const effect = selectRandomEffect(effectsPool)
    if (!effect) continue

    let targetUser = userId
    const isNegativeEffect = effect.id.includes("loss") || effect.id.includes("punishment")
    incrementStat(userId, isNegativeEffect ? "lootboxNegativeRolls" : "lootboxPositiveRolls", 1)

    if (!isNegativeEffect && eligibleMembers.length > 0) {
      if (Math.random() < 0.25) {
        targetUser = eligibleMembers[Math.floor(Math.random() * eligibleMembers.length)]
      }
    } else if (isNegativeEffect && eligibleMembers.length > 0) {
      if (Math.random() < 0.2) {
        targetUser = eligibleMembers[Math.floor(Math.random() * eligibleMembers.length)]
      }
    }

    let resultText = ""
    const targetIsOther = normalizeUserId(targetUser) !== normalizeUserId(userId)
    const targetPrefix = targetIsOther ? `${formatMentionTag(targetUser)}: ` : "Você: "
    let punishment = null

    if (Number.isFinite(Number(effect.percentDelta)) && Number(effect.percentDelta) !== 0) {
      const profile = ensureUser(targetUser)
      const currentCoins = Math.max(0, Math.floor(Number(profile?.coins) || 0))
      const absPercent = Math.abs(Number(effect.percentDelta))
      const computedAmount = Math.floor((currentCoins * absPercent) / 100)
      const minAmount = Math.max(1, Math.floor(Number(effect.minAmount) || 1))
      const amount = Math.max(minAmount, computedAmount)
      const pctLabel = formatPercentPoints(effect.percentDelta)

      if (Number(effect.percentDelta) > 0) {
        creditCoins(targetUser, amount, {
          type: "lootbox",
          details: `Efeito: +${pctLabel}% da carteira (${amount} coins)`,
        })
        resultText = `${targetPrefix}+${amount} moedas (+${pctLabel}%)`
      } else {
        debitCoinsFlexible(targetUser, amount, {
          type: "lootbox",
          details: `Efeito: -${pctLabel}% da carteira (${amount} coins)`,
        })
        resultText = `${targetPrefix}-${amount} moedas (-${pctLabel}%)`
      }

      results.push({
        effect: effect.name,
        description: effect.description,
        result: resultText,
        targetUser,
        targetIsOther,
        punishment,
      })
      continue
    }

    switch (effect.id) {
      case "coins_500_gain":
        creditCoins(targetUser, 500, { type: "lootbox", details: "Efeito: +500 coins" })
        resultText = `${targetPrefix}+500 moedas`
        break
      case "coins_500_loss":
        debitCoinsFlexible(targetUser, 500, { type: "lootbox", details: "Efeito: -500 coins" })
        resultText = `${targetPrefix}-500 moedas`
        break
      case "coins_1000_gain":
        creditCoins(targetUser, 1000, { type: "lootbox", details: "Efeito: +1000 coins" })
        resultText = `${targetPrefix}+1000 moedas`
        break
      case "coins_1000_loss":
        debitCoinsFlexible(targetUser, 1000, { type: "lootbox", details: "Efeito: -1000 coins" })
        resultText = `${targetPrefix}-1000 moedas`
        break
      case "coins_2500_gain":
        creditCoins(targetUser, 2500, { type: "lootbox", details: "Efeito: +2500 coins" })
        resultText = `${targetPrefix}+2500 moedas`
        break
      case "coins_2500_loss":
        debitCoinsFlexible(targetUser, 2500, { type: "lootbox", details: "Efeito: -2500 coins" })
        resultText = `${targetPrefix}-2500 moedas`
        break
      case "coins_1500_gain":
        creditCoins(targetUser, 1500, { type: "lootbox", details: "Efeito: +1500 coins" })
        resultText = `${targetPrefix}+1500 moedas`
        break
      case "coins_1500_loss":
        debitCoinsFlexible(targetUser, 1500, { type: "lootbox", details: "Efeito: -1500 coins" })
        resultText = `${targetPrefix}-1500 moedas`
        break
      case "coins_5000_gain":
        creditCoins(targetUser, 5000, { type: "lootbox", details: "Efeito: +5000 coins" })
        resultText = `${targetPrefix}+5000 moedas`
        break
      case "coins_4000_loss":
        debitCoinsFlexible(targetUser, 4000, { type: "lootbox", details: "Efeito: -4000 coins" })
        resultText = `${targetPrefix}-4000 moedas`
        break
      case "shield_1_gain":
        addShields(targetUser, 1)
        resultText = `${targetPrefix}+1 escudo`
        break
      case "shield_1_loss":
        removeItem(targetUser, "escudo", 1)
        resultText = `${targetPrefix}-1 escudo`
        break
      case "shield_3_gain":
        addShields(targetUser, 3)
        resultText = `${targetPrefix}+3 escudos`
        break
      case "shield_3_loss":
        removeItem(targetUser, "escudo", 3)
        resultText = `${targetPrefix}-3 escudos`
        break
      case "kronos_quebrada":
        addItem(targetUser, "kronosQuebrada", 1)
        resultText = `${targetPrefix}+1 Coroa Kronos (Quebrada)`
        break
      case "punishment_pass_1x": {
        const passType = pickRandomPunishmentType()
        const passKey = buildPunishmentPassKey(passType, 1)
        addItem(targetUser, passKey, 1)
        resultText = `${targetPrefix}+1 Passe de Punição ${passType} (1x)`
        break
      }
      case "punishment_1x": {
        const punishmentType = pickRandomPunishmentType()
        punishment = { type: punishmentType, severity: 1 }
        resultText = `${targetPrefix}Punição sorteada ${punishmentType} (1x)`
        break
      }
      case "punishment_pass_5x": {
        const passType = pickRandomPunishmentType()
        const passKey = buildPunishmentPassKey(passType, 5)
        addItem(targetUser, passKey, 1)
        resultText = `${targetPrefix}+1 Passe de Punição ${passType} (5x)`
        break
      }
      case "punishment_5x": {
        const punishmentType = pickRandomPunishmentType()
        punishment = { type: punishmentType, severity: 5 }
        resultText = `${targetPrefix}Punição sorteada ${punishmentType} (5x)`
        break
      }
      case "daily_reset": {
        const targetProfile = ensureUser(targetUser)
        if (targetProfile) {
          targetProfile.cooldowns.dailyClaimKey = null
          touchUser(targetProfile)
          saveEconomy()
        }
        resultText = `${targetPrefix}Cooldown de !daily resetado`
        break
      }
      case "work_reset":
        setWorkCooldown(targetUser, 0)
        resultText = `${targetPrefix}Cooldown de !trabalho resetado`
        break
      case "utility_pack":
        addItem(targetUser, "questRerollToken", 1)
        addItem(targetUser, "salvageToken", 1)
        resultText = `${targetPrefix}+1 Token de re-rolar Missões e +1 Token de Seguro`
        break
      case "defense_pack":
        addItem(targetUser, "escudoReforcado", 1)
        addItem(targetUser, "antiRouboCharm", 1)
        resultText = `${targetPrefix}+1 Escudo Reforçado e +1 Pingente Anti-Roubo`
        break
      default:
        if (effect.id.startsWith("item_")) {
          const itemKey = effect.id.slice("item_".length)
          const definition = getItemDefinition(itemKey)
          if (definition) {
            const quantityRoll = rollItemQuantityByRarity(definition)
            addItem(targetUser, itemKey, quantityRoll)
            resultText = `${targetPrefix}+${quantityRoll} ${definition.name}`
            break
          }
        }
        resultText = `${targetPrefix}Efeito sem aplicação`
        break
    }

    results.push({
      effect: effect.name,
      description: effect.description,
      result: resultText,
      targetUser,
      targetIsOther,
      punishment,
    })
  }

  return {
    ok: true,
    quantity: qty,
    results,
  }
}

module.exports = {
  LOOTBOX_FIXED_EFFECTS,
  getLootboxItemWeight,
  buildLootboxItemEffects,
  getLootboxEffectsPool,
  selectRandomEffect,
  openLootboxEngine,
}
