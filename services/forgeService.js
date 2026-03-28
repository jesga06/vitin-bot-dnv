function forgePunishmentPassEngine(deps, userId, punishmentType, severity = 1, quantity = 1, options = {}) {
  if (!deps.isValidPunishmentType(punishmentType)) {
    return { ok: false, reason: "invalid-type" }
  }

  const safeSeverity = deps.normalizePassSeverity(severity, 1)
  const qty = Math.floor(Number(quantity) || 0)
  if (qty <= 0) return { ok: false, reason: "invalid-quantity" }
  if (qty > deps.maxForgeQuantity) {
    return { ok: false, reason: "quantity-too-large", maxQuantity: deps.maxForgeQuantity }
  }

  const selectedKey = deps.buildPunishmentPassKey(punishmentType, safeSeverity)
  const available = deps.getItemQuantity(userId, selectedKey)
  if (available < qty) {
    return { ok: false, reason: "insufficient-items", available, selectedKey }
  }

  const boostedOdds = Boolean(options?.boostedOdds)
  const deferTypeSelection = Boolean(options?.deferTypeSelection)
  const forgeCostMultiplier = boostedOdds ? 2 : 1
  const forgeCost = 100 * qty * forgeCostMultiplier
  if (!deps.debitCoins(userId, forgeCost, {
    type: "forge-fee",
    details: `Taxa de falsificacao de ${qty}x ${selectedKey}`,
    meta: { punishmentType, severity: safeSeverity, quantity: qty, boostedOdds },
  })) {
    return { ok: false, reason: "insufficient-funds", forgeCost }
  }

  if (typeof deps.incrementStat === "function") {
    deps.incrementStat(userId, "forgedPasses", qty)
  }

  const roll = Math.random()
  const multiplyThreshold = boostedOdds ? 0.20 : 0.10
  const upgradeThreshold = boostedOdds ? 0.40 : 0.20
  const changeTypeThreshold = boostedOdds ? 0.80 : 0.40

  if (roll < multiplyThreshold) {
    const bonus = Math.ceil(qty * 0.5)
    deps.addItem(userId, selectedKey, bonus)
    return {
      ok: true,
      outcome: "multiply",
      forgeCost,
      boostedOdds,
      selectedKey,
      quantity: qty,
      bonus,
      finalQuantity: deps.getItemQuantity(userId, selectedKey),
    }
  }

  if (roll < upgradeThreshold) {
    const upgradedSeverity = safeSeverity + 1
    const upgradedKey = deps.buildPunishmentPassKey(punishmentType, upgradedSeverity)
    deps.removeItem(userId, selectedKey, qty)
    deps.addItem(userId, upgradedKey, qty)
    return {
      ok: true,
      outcome: "upgrade-severity",
      forgeCost,
      boostedOdds,
      selectedKey,
      quantity: qty,
      upgradedSeverity,
      upgradedKey,
    }
  }

  if (roll < changeTypeThreshold) {
    deps.removeItem(userId, selectedKey, qty)

    if (deferTypeSelection) {
      return {
        ok: true,
        outcome: "change-type-pending",
        forgeCost,
        boostedOdds,
        selectedKey,
        quantity: qty,
        fromType: punishmentType,
        severity: safeSeverity,
      }
    }

    const nextType = deps.pickRandomPunishmentType(Math.floor(Number(punishmentType) || 0))
    const convertedKey = deps.buildPunishmentPassKey(nextType, safeSeverity)
    deps.addItem(userId, convertedKey, qty)
    return {
      ok: true,
      outcome: "change-type",
      forgeCost,
      boostedOdds,
      selectedKey,
      quantity: qty,
      fromType: punishmentType,
      toType: nextType,
      convertedKey,
    }
  }

  const lost = Math.ceil(qty / 2)
  deps.removeItem(userId, selectedKey, lost)
  return {
    ok: true,
    outcome: "lose-half",
    forgeCost,
    boostedOdds,
    selectedKey,
    quantity: qty,
    lost,
    remaining: deps.getItemQuantity(userId, selectedKey),
  }
}

function applyForgedPassTypeChoiceEngine(deps, userId, fromType, toType, severity = 1, quantity = 1) {
  if (!deps.isValidPunishmentType(fromType) || !deps.isValidPunishmentType(toType)) {
    return { ok: false, reason: "invalid-type" }
  }

  const safeSeverity = deps.normalizePassSeverity(severity, 1)
  const qty = Math.floor(Number(quantity) || 0)
  if (qty <= 0) return { ok: false, reason: "invalid-quantity" }

  const chosenType = Math.floor(Number(toType) || 0)
  const convertedKey = deps.buildPunishmentPassKey(chosenType, safeSeverity)
  deps.addItem(userId, convertedKey, qty)
  return {
    ok: true,
    toType: chosenType,
    convertedKey,
    quantity: qty,
    severity: safeSeverity,
  }
}

module.exports = {
  forgePunishmentPassEngine,
  applyForgedPassTypeChoiceEngine,
}
