function getStealSuccessChanceEngine(deps, victimId, thiefId = "") {
  const baseChance = 0.45
  const protection = deps.hasActiveKronos(victimId) ? 0.1 : 0
  const thiefBuff = deps.hasActiveKronos(thiefId) ? 0.1 : 0
  return Number(Math.max(0.05, Math.min(0.95, baseChance - protection + thiefBuff)).toFixed(2))
}

function canAttemptStealEngine(deps, thiefId, victimId) {
  const user = deps.ensureUser(thiefId)
  if (!user) return { ok: false, reason: "invalid-user" }

  const dayKey = deps.getDayKey()
  if (user.cooldowns.stealDailyKey !== dayKey) {
    user.cooldowns.stealDailyKey = dayKey
    user.cooldowns.stealTargets = {}
    user.cooldowns.stealAttemptsToday = 0
    deps.touchUser(user)
    deps.saveEconomy()
  }

  const victim = deps.normalizeUserId(victimId)
  if (user.cooldowns.stealTargets[victim]) {
    return { ok: false, reason: "same-target-today" }
  }

  if ((user.cooldowns.stealAttemptsToday || 0) >= 3) {
    return { ok: false, reason: "daily-limit-reached" }
  }

  return { ok: true }
}

function registerStealAttemptEngine(deps, thiefId, victimId) {
  const user = deps.ensureUser(thiefId)
  if (!user) return

  const dayKey = deps.getDayKey()
  if (user.cooldowns.stealDailyKey !== dayKey) {
    user.cooldowns.stealDailyKey = dayKey
    user.cooldowns.stealTargets = {}
    user.cooldowns.stealAttemptsToday = 0
  }

  const victim = deps.normalizeUserId(victimId)
  user.cooldowns.stealTargets[victim] = true
  user.cooldowns.stealAttemptsToday = (Math.floor(Number(user.cooldowns.stealAttemptsToday) || 0) + 1)
  deps.touchUser(user)
  deps.saveEconomy()
}

function attemptStealEngine(deps, thiefId, victimId, requestedAmount = 0, options = {}) {
  if (deps.normalizeUserId(thiefId) === deps.normalizeUserId(victimId)) {
    return { ok: false, reason: "same-user" }
  }

  const canSteal = canAttemptStealEngine(deps, thiefId, victimId)
  if (!canSteal.ok) {
    return { ok: false, reason: canSteal.reason }
  }

  registerStealAttemptEngine(deps, thiefId, victimId)
  deps.incrementStat(thiefId, "stealAttempts", 1)

  const victimCoins = deps.getCoins(victimId)
  if (victimCoins <= 0) {
    return { ok: false, reason: "victim-empty" }
  }

  if (deps.consumeShield(victimId)) {
    return {
      ok: true,
      success: false,
      blockedByShield: true,
      gained: 0,
      lost: 0,
      successChance: 0,
      rolled: null,
    }
  }

  const baseChance = getStealSuccessChanceEngine(deps, victimId, thiefId)
  const modifierRaw = Number(options?.successChanceDelta)
  const modifier = Number.isFinite(modifierRaw)
    ? Math.max(-0.2, Math.min(0.2, modifierRaw))
    : 0
  const chance = Math.max(0.01, Math.min(0.99, baseChance + modifier))
  const roll = Math.random()
  const success = roll <= chance

  if (!success) {
    const penalty = Math.max(20, Math.floor(Math.min(deps.getCoins(thiefId), 40 + Math.random() * 80)))
    const lost = deps.debitCoinsFlexible(thiefId, penalty, {
      type: "steal-failed",
      details: `Falhou ao roubar ${deps.normalizeUserId(victimId)}`,
      meta: { victim: deps.normalizeUserId(victimId) },
    })
    deps.incrementStat(thiefId, "stealFailedCount", 1)
    return {
      ok: true,
      success: false,
      lost,
      baseSuccessChance: baseChance,
      successChanceDelta: modifier,
      successChance: chance,
      rolled: roll,
    }
  }

  const requested = Math.max(0, Math.floor(Number(requestedAmount) || 0))
  const randomBase = Math.floor(90 + Math.random() * 231)
  const baseAmount = requested > 0 ? requested : randomBase
  const stealBase = Math.min(victimCoins, baseAmount)

  if (stealBase <= 0) {
    return { ok: false, reason: "invalid-amount" }
  }

  const gained = deps.applyKronosGainMultiplier(thiefId, stealBase, "steal")
  const removed = deps.debitCoinsFlexible(victimId, stealBase, {
    type: "stolen-from",
    details: `Roubado por ${deps.normalizeUserId(thiefId)}`,
    meta: { thief: deps.normalizeUserId(thiefId) },
  })
  deps.creditCoins(thiefId, gained, {
    type: "steal-success",
    details: `Roubo em ${deps.normalizeUserId(victimId)}`,
    meta: { victim: deps.normalizeUserId(victimId), base: stealBase },
  })

  if (removed > 0) {
    deps.incrementStat(victimId, "stealVictimCount", 1)
    deps.incrementStat(victimId, "stealVictimCoinsLost", removed)
  }
  if (gained > 0) {
    deps.incrementStat(thiefId, "stealSuccessCount", 1)
    deps.incrementStat(thiefId, "stealSuccessCoins", gained)
  }

  return {
    ok: true,
    success: true,
    baseSuccessChance: baseChance,
    successChanceDelta: modifier,
    successChance: chance,
    rolled: roll,
    stolenFromVictim: removed,
    gained,
  }
}

module.exports = {
  getStealSuccessChanceEngine,
  canAttemptStealEngine,
  attemptStealEngine,
}
