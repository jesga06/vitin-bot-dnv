const LOOTBOX_FIXED_EFFECTS = [
  { id: "daily_reset", name: "Resetar cooldown !daily", weight: 30, description: "Reseta !daily" },
  { id: "work_reset", name: "Resetar cooldown !trabalho", weight: 30, description: "Reseta !trabalho" },
  { id: "coins_1000_gain", name: "Ganhar 1000 coins", weight: 6, description: "+1000 moedas" },
  { id: "coins_1000_loss", name: "Perder 1000 coins", weight: 5, description: "-1000 moedas" },
  { id: "coins_2500_gain", name: "Ganhar 2500 coins", weight: 4, description: "+2500 moedas" },
  { id: "coins_2500_loss", name: "Perder 2500 coins", weight: 3, description: "-2500 moedas" },
  { id: "shield_1_gain", name: "Ganhar 1 escudo", weight: 4, description: "+1 escudo" },
  { id: "shield_1_loss", name: "Perder 1 escudo", weight: 3, description: "-1 escudo" },
  { id: "shield_3_gain", name: "Ganhar 3 escudos", weight: 3, description: "+3 escudos" },
  { id: "shield_3_loss", name: "Perder 3 escudos", weight: 2, description: "-3 escudos" },
  { id: "kronos_quebrada", name: "Ganhar Coroa Kronos (Quebrada)", weight: 1, description: "+1 Coroa Kronos (Quebrada)" },
  { id: "punishment_pass_1x", name: "Passe de Punição (1x)", weight: 2, description: "+1 Passe de Punição (1x)" },
  { id: "punishment_1x", name: "Punição (1x)", weight: 4, description: "Punição aleatória (1x)" },
  { id: "punishment_pass_5x", name: "Passe de Punição (5x)", weight: 1, description: "+1 Passe de Punição (5x)" },
  { id: "punishment_5x", name: "Punição (5x)", weight: 3, description: "Punição aleatória (5x)" },
]

function getLootboxItemWeight(item = {}) {
  const price = Math.max(1, Math.floor(Number(item?.price) || 0))
  const rarity = Math.max(1, Math.min(5, Math.floor(Number(item?.rarity) || 1)))
  const key = String(item?.key || "").trim()

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
    .filter((item) => item.key !== "lootbox" && item.key !== "kronosVerdadeira")
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
    const targetPrefix = targetIsOther ? `@${targetUser.split("@")[0]}: ` : "Você: "
    let punishment = null

    switch (effect.id) {
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
      default:
        if (effect.id.startsWith("item_")) {
          const itemKey = effect.id.slice("item_".length)
          const definition = getItemDefinition(itemKey)
          if (definition) {
            addItem(targetUser, itemKey, 1)
            resultText = `${targetPrefix}+1 ${definition.name}`
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
