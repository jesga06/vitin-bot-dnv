function getStatValue(user, key) {
  return Math.max(0, Math.floor(Number(user?.stats?.[key]) || 0))
}

function buildQuestProgress(user, quest = {}) {
  const baseline = Math.max(0, Math.floor(Number(quest.baseline) || 0))
  const target = Math.max(1, Math.floor(Number(quest.target) || 1))
  const currentStat = getStatValue(user, quest.key)
  const progress = Math.max(0, currentStat - baseline)
  const completed = progress >= target
  return {
    ...quest,
    progress,
    completed,
  }
}

function ensureDailyQuestsForUser(deps, userId, dayKey = deps.getDayKey()) {
  const user = deps.ensureUser(userId)
  if (!user) return []

  const currentDayKey = String(dayKey || deps.getDayKey())
  if (user.progression.lastQuestDayKey === currentDayKey && Array.isArray(user.progression.dailyQuests) && user.progression.dailyQuests.length > 0) {
    return user.progression.dailyQuests
  }

  const rerollNonce = Math.max(0, Math.floor(Number(user.progression?.dailyQuestRerollNonce) || 0))
  const seed = `${deps.normalizeUserId(userId)}:${currentDayKey}:${rerollNonce}`
  const used = new Set()
  const quests = []

  for (let i = 0; i < deps.dailyQuestCount; i++) {
    let pickIndex = deps.stableHash(`${seed}:pick:${i}`) % deps.dailyQuestPool.length
    while (used.has(pickIndex)) {
      pickIndex = (pickIndex + 1) % deps.dailyQuestPool.length
    }
    used.add(pickIndex)

    const template = deps.dailyQuestPool[pickIndex]
    const targetRange = Math.max(1, template.targetMax - template.targetMin + 1)
    const target = template.targetMin + (deps.stableHash(`${seed}:target:${i}`) % targetRange)
    quests.push({
      id: `Q${i + 1}`,
      key: template.key,
      title: template.title,
      target,
      rewardXp: template.rewardXp,
      rewardCoins: template.rewardCoins,
      baseline: getStatValue(user, template.key),
      claimed: false,
    })
  }

  user.progression.lastQuestDayKey = currentDayKey
  user.progression.dailyQuests = quests
  deps.touchUser(user)
  deps.saveEconomy()
  return quests
}

function getDailyQuestStateEngine(deps, userId, dayKey = deps.getDayKey()) {
  const user = deps.ensureUser(userId)
  if (!user) return { dayKey, quests: [] }

  const quests = ensureDailyQuestsForUser(deps, userId, dayKey)
  return {
    dayKey,
    quests: quests.map((quest) => buildQuestProgress(user, quest)),
  }
}

function addXpEngine(deps, userId, amount = 0, meta = {}) {
  const user = deps.ensureUser(userId)
  const baseAmount = Math.max(0, Math.floor(Number(amount) || 0))
  const parsedAmount = deps.isXpBoosterActive(userId)
    ? Math.max(0, Math.floor(baseAmount * 1.15))
    : baseAmount

  if (!user || parsedAmount <= 0) {
    return {
      ok: false,
      reason: "invalid-amount",
      granted: 0,
      level: Math.max(1, Math.floor(Number(user?.progression?.level) || 1)),
      xp: Math.max(0, Math.floor(Number(user?.progression?.xp) || 0)),
      xpToNextLevel: deps.getXpRequiredForLevel(Math.max(1, Math.floor(Number(user?.progression?.level) || 1))),
      levelsGained: 0,
      levelRewards: [],
    }
  }

  user.progression.level = Math.max(1, Math.floor(Number(user.progression.level) || 1))
  user.progression.xp = Math.max(0, Math.floor(Number(user.progression.xp) || 0))
  user.progression.xp += parsedAmount
  user.progression.seasonPoints = Math.max(0, Math.floor(Number(user.progression.seasonPoints) || 0) + parsedAmount)

  let levelsGained = 0
  const levelRewards = []
  let required = deps.getXpRequiredForLevel(user.progression.level)

  while (user.progression.xp >= required) {
    user.progression.xp -= required
    user.progression.level += 1
    levelsGained += 1

    const milestoneReward = deps.getLevelMilestoneReward(user.progression.level)
    if (milestoneReward) {
      const grantedCoins = deps.creditCoins(userId, milestoneReward.coins, {
        type: "xp-level-reward",
        details: `Recompensa de nivel ${milestoneReward.level}`,
        meta: {
          level: milestoneReward.level,
          source: String(meta?.source || "xp"),
        },
      })

      const grantedItems = []
      for (const item of (milestoneReward.items || [])) {
        const key = deps.normalizeItemKey(item?.key)
        const qty = deps.capPositiveInt(item?.quantity, deps.maxItemOperation, 0)
        if (!key || qty <= 0) continue
        const before = deps.getItemQuantity(userId, key)
        const after = deps.addItem(userId, key, qty)
        const granted = Math.max(0, Math.floor(Number(after) || 0) - before)
        if (granted > 0) {
          grantedItems.push({ key, quantity: granted })
        }
      }

      levelRewards.push({
        level: milestoneReward.level,
        coins: grantedCoins,
        items: grantedItems,
      })
    }

    if (user.progression.level >= deps.maxLevel) {
      const before = deps.getItemQuantity(userId, "kronosVerdadeira")
      const after = deps.addItem(userId, "kronosVerdadeira", 1)
      const granted = Math.max(0, after - before)
      if (granted > 0) {
        levelRewards.push({
          level: user.progression.level,
          coins: 0,
          items: [{ key: "kronosVerdadeira", quantity: granted }],
          isLevelMilestone: true,
        })
      }
    }

    required = deps.getXpRequiredForLevel(user.progression.level)
  }

  deps.touchUser(user)
  deps.saveEconomy()
  deps.telemetry.incrementCounter("economy.xp.granted", parsedAmount, {
    source: String(meta?.source || "unspecified"),
  })

  return {
    ok: true,
    granted: parsedAmount,
    level: user.progression.level,
    xp: user.progression.xp,
    xpToNextLevel: required,
    levelsGained,
    levelRewards,
  }
}

function getXpProfileEngine(deps, userId) {
  const user = deps.ensureUser(userId)
  if (!user) {
    return {
      level: 1,
      xp: 0,
      xpToNextLevel: deps.getXpRequiredForLevel(1),
      seasonPoints: 0,
    }
  }

  const level = Math.max(1, Math.floor(Number(user.progression?.level) || 1))
  const xp = Math.max(0, Math.floor(Number(user.progression?.xp) || 0))
  return {
    level,
    xp,
    xpToNextLevel: deps.getXpRequiredForLevel(level),
    seasonPoints: Math.max(0, Math.floor(Number(user.progression?.seasonPoints) || 0)),
  }
}

function claimDailyQuestEngine(deps, userId, questId = "") {
  const user = deps.ensureUser(userId)
  if (!user) return { ok: false, reason: "invalid-user" }

  const dayKey = deps.getDayKey()
  const quests = ensureDailyQuestsForUser(deps, userId, dayKey)
  const normalizedQuestId = String(questId || "").trim().toUpperCase()
  const quest = quests.find((entry) => String(entry.id || "").toUpperCase() === normalizedQuestId)
  if (!quest) {
    return { ok: false, reason: "invalid-quest" }
  }
  if (quest.claimed) {
    return { ok: false, reason: "already-claimed", questId: quest.id }
  }

  const snapshot = buildQuestProgress(user, quest)
  if (!snapshot.completed) {
    return {
      ok: false,
      reason: "not-completed",
      questId: quest.id,
      progress: snapshot.progress,
      target: snapshot.target,
    }
  }

  quest.claimed = true
  deps.touchUser(user)
  deps.saveEconomy()

  const userLevel = Math.max(1, Math.floor(Number(user.progression?.level) || 1))
  const levelMultiplier = 1 + 0.02 * (userLevel - 1)
  const questMultiplierState = deps.consumeQuestRewardMultiplier(userId)
  const questMultiplier = Number(questMultiplierState.multiplier) || 1
  const scaledXp = Math.floor(quest.rewardXp * levelMultiplier * questMultiplier)
  const scaledCoins = Math.floor(quest.rewardCoins * levelMultiplier * questMultiplier)

  const xpResult = deps.addXp(userId, scaledXp, {
    source: "daily-quest",
    questId: quest.id,
    key: quest.key,
  })
  const coinGain = deps.creditCoins(userId, scaledCoins, {
    type: "quest-claim",
    details: `Missao diaria ${quest.id}`,
    meta: { questId: quest.id, key: quest.key, dayKey },
  })
  deps.incrementStat(userId, "questsCompleted", 1)

  deps.telemetry.incrementCounter("economy.quest.claim", 1, {
    questKey: String(quest.key || "unknown"),
  })

  return {
    ok: true,
    questId: quest.id,
    key: quest.key,
    title: quest.title,
    rewardXp: quest.rewardXp,
    rewardCoins: coinGain,
    xpResult,
    rewardMultiplier: questMultiplier,
    rewardMultiplierChargesRemaining: questMultiplierState.remainingCharges,
  }
}

function ensureWeeklyQuestsForUser(deps, userId, weekKey = deps.getWeekKey()) {
  const user = deps.ensureUser(userId)
  if (!user) return []

  const currentWeekKey = String(weekKey || deps.getWeekKey())
  if (user.progression.lastQuestWeekKey === currentWeekKey && Array.isArray(user.progression.weeklyQuests) && user.progression.weeklyQuests.length > 0) {
    return user.progression.weeklyQuests
  }

  const seed = `${deps.normalizeUserId(userId)}:${currentWeekKey}`
  const used = new Set()
  const quests = []
  for (let i = 0; i < deps.weeklyQuestCount; i++) {
    let pickIndex = deps.stableHash(`${seed}:pick:${i}`) % deps.weeklyQuestPool.length
    while (used.has(pickIndex)) {
      pickIndex = (pickIndex + 1) % deps.weeklyQuestPool.length
    }
    used.add(pickIndex)

    const template = deps.weeklyQuestPool[pickIndex]
    const targetRange = Math.max(1, template.targetMax - template.targetMin + 1)
    const target = template.targetMin + (deps.stableHash(`${seed}:target:${i}`) % targetRange)
    quests.push({
      id: `W${i + 1}`,
      key: template.key,
      title: template.title,
      target,
      rewardXp: template.rewardXp,
      rewardCoins: template.rewardCoins,
      baseline: getStatValue(user, template.key),
      claimed: false,
    })
  }

  user.progression.lastQuestWeekKey = currentWeekKey
  user.progression.weeklyQuests = quests
  deps.touchUser(user)
  deps.saveEconomy()
  return quests
}

function getWeeklyQuestStateEngine(deps, userId, weekKey = deps.getWeekKey()) {
  const user = deps.ensureUser(userId)
  if (!user) return { weekKey, quests: [] }

  const quests = ensureWeeklyQuestsForUser(deps, userId, weekKey)
  return {
    weekKey,
    quests: quests.map((quest) => buildQuestProgress(user, quest)),
  }
}

function claimWeeklyQuestEngine(deps, userId, questId = "") {
  const user = deps.ensureUser(userId)
  if (!user) return { ok: false, reason: "invalid-user" }

  const weekKey = deps.getWeekKey()
  const quests = ensureWeeklyQuestsForUser(deps, userId, weekKey)
  const normalizedQuestId = String(questId || "").trim().toUpperCase()
  const quest = quests.find((entry) => String(entry.id || "").toUpperCase() === normalizedQuestId)
  if (!quest) {
    return { ok: false, reason: "invalid-quest" }
  }
  if (quest.claimed) {
    return { ok: false, reason: "already-claimed", questId: quest.id }
  }

  const snapshot = buildQuestProgress(user, quest)
  if (!snapshot.completed) {
    return {
      ok: false,
      reason: "not-completed",
      questId: quest.id,
      progress: snapshot.progress,
      target: snapshot.target,
    }
  }

  quest.claimed = true
  deps.touchUser(user)
  deps.saveEconomy()

  const userLevel = Math.max(1, Math.floor(Number(user.progression?.level) || 1))
  const levelMultiplier = 1 + 0.02 * (userLevel - 1)
  const questMultiplierState = deps.consumeQuestRewardMultiplier(userId)
  const questMultiplier = Number(questMultiplierState.multiplier) || 1
  const scaledXp = Math.floor(quest.rewardXp * levelMultiplier * questMultiplier)
  const scaledCoins = Math.floor(quest.rewardCoins * levelMultiplier * questMultiplier)

  const xpResult = deps.addXp(userId, scaledXp, {
    source: "weekly-quest",
    questId: quest.id,
    key: quest.key,
  })
  const coinGain = deps.creditCoins(userId, scaledCoins, {
    type: "quest-claim",
    details: `Missao semanal ${quest.id}`,
    meta: { questId: quest.id, key: quest.key, weekKey },
  })
  deps.incrementStat(userId, "questsCompleted", 1)

  deps.telemetry.incrementCounter("economy.quest.claim", 1, {
    questKey: String(quest.key || "unknown"),
    type: "weekly",
  })

  return {
    ok: true,
    questId: quest.id,
    key: quest.key,
    title: quest.title,
    rewardXp: quest.rewardXp,
    rewardCoins: coinGain,
    xpResult,
    rewardMultiplier: questMultiplier,
    rewardMultiplierChargesRemaining: questMultiplierState.remainingCharges,
  }
}

module.exports = {
  getDailyQuestStateEngine,
  addXpEngine,
  getXpProfileEngine,
  claimDailyQuestEngine,
  getWeeklyQuestStateEngine,
  claimWeeklyQuestEngine,
}
