const ITEM_EFFECT_DURATION_MS = 24 * 60 * 60 * 1000
const COOLDOWN_REDUCER_MS = 10 * 60 * 1000

function applyCooldownReducerEngine(deps, userId, reductionMs = COOLDOWN_REDUCER_MS) {
  const user = deps.ensureUser(userId)
  if (!user) return { ok: false, reason: "invalid-user" }

  const delta = Math.max(0, Math.floor(Number(reductionMs) || 0))
  if (delta <= 0) return { ok: false, reason: "invalid-reduction" }

  const before = {
    workAt: Math.max(0, Math.floor(Number(user.cooldowns.workAt) || 0)),
    stealAt: Math.max(0, Math.floor(Number(user.cooldowns.stealAt) || 0)),
    carePackageLastClaimedAt: Math.max(0, Math.floor(Number(user.cooldowns.carePackageLastClaimedAt) || 0)),
  }

  user.cooldowns.workAt = Math.max(0, before.workAt - delta)
  user.cooldowns.stealAt = Math.max(0, before.stealAt - delta)
  user.cooldowns.carePackageLastClaimedAt = Math.max(0, before.carePackageLastClaimedAt - delta)

  deps.touchUser(user)
  deps.saveEconomy()

  return {
    ok: true,
    reductionMs: delta,
    before,
    after: {
      workAt: user.cooldowns.workAt,
      stealAt: user.cooldowns.stealAt,
      carePackageLastClaimedAt: user.cooldowns.carePackageLastClaimedAt,
    },
  }
}

function isXpBoosterActiveEngine(deps, userId) {
  const user = deps.ensureUser(userId)
  if (!user) return false
  return (Number(user.buffs.xpBoosterExpiresAt) || 0) > Date.now()
}

function consumeQuestRewardMultiplierEngine(deps, userId) {
  const user = deps.ensureUser(userId)
  if (!user) return { active: false, multiplier: 1, remainingCharges: 0 }

  const charges = Math.max(0, Math.floor(Number(user.buffs.questRewardMultiplierCharges) || 0))
  if (charges <= 0) return { active: false, multiplier: 1, remainingCharges: 0 }

  user.buffs.questRewardMultiplierCharges = Math.max(0, charges - 1)
  deps.touchUser(user)
  deps.saveEconomy()

  return {
    active: true,
    multiplier: 1.25,
    remainingCharges: user.buffs.questRewardMultiplierCharges,
  }
}

function consumeClaimMultiplierEngine(deps, userId, source = "") {
  const normalizedSource = String(source || "").trim().toLowerCase()
  if (!new Set(["daily", "work"]).has(normalizedSource)) {
    return { active: false, multiplier: 1, remainingCharges: 0 }
  }

  const user = deps.ensureUser(userId)
  if (!user) return { active: false, multiplier: 1, remainingCharges: 0 }

  const charges = Math.max(0, Math.floor(Number(user.buffs.claimMultiplierCharges) || 0))
  if (charges <= 0) return { active: false, multiplier: 1, remainingCharges: 0 }

  user.buffs.claimMultiplierCharges = Math.max(0, charges - 1)
  deps.touchUser(user)
  deps.saveEconomy()

  return {
    active: true,
    multiplier: 2,
    remainingCharges: user.buffs.claimMultiplierCharges,
  }
}

function getTeamContributionMultiplierEngine(deps, userId) {
  const user = deps.ensureUser(userId)
  if (!user) return 1
  return (Number(user.buffs.teamContribExpiresAt) || 0) > Date.now() ? 2 : 1
}

function consumeStreakSaverEngine(deps, userId) {
  const available = deps.getItemQuantity(userId, "streakSaver")
  if (available <= 0) return false
  deps.removeItem(userId, "streakSaver", 1)
  return true
}

function applySalvageInsuranceEngine(deps, userId, lostAmount = 0, options = {}) {
  const threshold = Math.max(0, Math.floor(Number(options?.threshold) || 4))
  const betValue = Math.max(0, Math.floor(Number(options?.betValue) || 0))
  if (betValue < threshold) {
    return { ok: false, activated: false, reason: "below-threshold", refunded: 0 }
  }

  const available = deps.getItemQuantity(userId, "salvageToken")
  if (available <= 0) {
    return { ok: false, activated: false, reason: "no-token", refunded: 0 }
  }

  const loss = Math.max(0, Math.floor(Number(lostAmount) || 0))
  if (loss <= 0) {
    return { ok: false, activated: false, reason: "no-loss", refunded: 0 }
  }

  const refund = Math.max(0, Math.floor(loss * 0.4))
  if (refund <= 0) {
    return { ok: false, activated: false, reason: "refund-zero", refunded: 0 }
  }

  deps.removeItem(userId, "salvageToken", 1)
  const credited = deps.creditCoins(userId, refund, {
    type: "salvage-token-refund",
    details: "Seguro Geral ativado apos perda de aposta",
    meta: {
      betValue,
      loss,
      threshold,
    },
  })

  return {
    ok: true,
    activated: credited > 0,
    refunded: credited,
    consumed: credited > 0 ? 1 : 0,
  }
}

function useItemEngine(deps, userId, itemKey) {
  const normalized = deps.normalizeItemKey(itemKey)
  const item = deps.getItemDefinition(normalized)
  if (!normalized || !item) return { ok: false, reason: "invalid-item" }

  const available = deps.getItemQuantity(userId, normalized)
  if (available <= 0) return { ok: false, reason: "insufficient-items", itemKey: normalized }

  const user = deps.ensureUser(userId)
  if (!user) return { ok: false, reason: "invalid-user" }

  const now = Date.now()

  if (normalized === "redutorCooldowns1") {
    deps.removeItem(userId, normalized, 1)
    const reduced = applyCooldownReducerEngine(deps, userId, COOLDOWN_REDUCER_MS)
    return {
      ok: true,
      itemKey: normalized,
      consumed: 1,
      effect: "cooldown-reduced",
      reductionMs: reduced.reductionMs,
    }
  }

  if (normalized === "xpBooster") {
    deps.removeItem(userId, normalized, 1)
    const current = Math.max(Number(user.buffs.xpBoosterExpiresAt) || 0, now)
    user.buffs.xpBoosterExpiresAt = current + ITEM_EFFECT_DURATION_MS
    deps.touchUser(user)
    deps.saveEconomy()
    return {
      ok: true,
      itemKey: normalized,
      consumed: 1,
      effect: "xp-booster",
      expiresAt: user.buffs.xpBoosterExpiresAt,
    }
  }

  if (normalized === "questPointBooster") {
    deps.removeItem(userId, normalized, 1)
    user.buffs.questRewardMultiplierCharges = Math.max(0, Math.floor(Number(user.buffs.questRewardMultiplierCharges) || 0)) + 3
    deps.touchUser(user)
    deps.saveEconomy()
    return {
      ok: true,
      itemKey: normalized,
      consumed: 1,
      effect: "quest-reward-multiplier",
      charges: user.buffs.questRewardMultiplierCharges,
    }
  }

  if (normalized === "claimMultiplier") {
    deps.removeItem(userId, normalized, 1)
    user.buffs.claimMultiplierCharges = Math.max(0, Math.floor(Number(user.buffs.claimMultiplierCharges) || 0)) + 1
    deps.touchUser(user)
    deps.saveEconomy()
    return {
      ok: true,
      itemKey: normalized,
      consumed: 1,
      effect: "claim-multiplier",
      charges: user.buffs.claimMultiplierCharges,
    }
  }

  if (normalized === "teamContribBooster") {
    deps.removeItem(userId, normalized, 1)
    const current = Math.max(Number(user.buffs.teamContribExpiresAt) || 0, now)
    user.buffs.teamContribExpiresAt = current + ITEM_EFFECT_DURATION_MS
    deps.touchUser(user)
    deps.saveEconomy()
    return {
      ok: true,
      itemKey: normalized,
      consumed: 1,
      effect: "team-contrib-multiplier",
      expiresAt: user.buffs.teamContribExpiresAt,
      multiplier: 2,
    }
  }

  return { ok: false, reason: "item-not-usable-manually", itemKey: normalized }
}

module.exports = {
  ITEM_EFFECT_DURATION_MS,
  COOLDOWN_REDUCER_MS,
  applyCooldownReducerEngine,
  isXpBoosterActiveEngine,
  consumeQuestRewardMultiplierEngine,
  consumeClaimMultiplierEngine,
  getTeamContributionMultiplierEngine,
  consumeStreakSaverEngine,
  applySalvageInsuranceEngine,
  useItemEngine,
}
