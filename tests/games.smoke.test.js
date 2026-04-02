const test = require("node:test")
const assert = require("node:assert/strict")

const adivinhacao = require("../games/adivinhacao")
const dueloDados = require("../games/dueloDados")
const roletaRussa = require("../games/roletaRussa")
const caraOuCoroa = require("../games/caraOuCoroa")
const punishmentService = require("../services/punishmentService")
const storage = require("../storage")

function createSockCapture() {
  const sent = []
  return {
    sock: {
      async sendMessage(to, payload) {
        sent.push({ to, payload })
      },
    },
    sent,
  }
}

function setCoinRound(groupId, senderId, resultado, betMultiplier = 1) {
  const coinGames = storage.getCoinGames()
  if (!coinGames[groupId]) coinGames[groupId] = {}
  coinGames[groupId][senderId] = {
    player: senderId,
    resultado,
    betMultiplier,
    createdAt: Date.now(),
  }
  storage.setCoinGames(coinGames)
}

test("startCoinRound accepts explicit !moeda bet multiplier", async () => {
  const economyService = require("../services/economyService")
  const groupId = `__coin_round_bet_${Date.now()}@g.us`
  const sender = "bettor@s.whatsapp.net"
  const { sock, sent } = createSockCapture()

  // Credit sender with coins for buy-in (7x bet = 70 coins)
  economyService.creditCoins(sender, 100, { type: "test-credit" })

  const handled = await caraOuCoroa.startCoinRound({
    sock,
    from: groupId,
    sender,
    cmd: "!moeda 7",
    prefix: "!",
    isGroup: true,
  })

  assert.equal(handled, true)
  const coinGames = storage.getCoinGames()
  assert.equal(coinGames[groupId]?.[sender]?.betMultiplier, 7)
  assert.ok(sent.some((m) => /Aposta: \*7x\*/.test(String(m.payload?.text || ""))))
})

test("startCoinRound rejects bet when player has insufficient coins", async () => {
  const economyService = require("../services/economyService")
  const groupId = `__coin_round_insufficient_${Date.now()}@g.us`
  const sender = "broke@s.whatsapp.net"
  const { sock, sent } = createSockCapture()

  // Don't credit coins - player starts with 0

  const handled = await caraOuCoroa.startCoinRound({
    sock,
    from: groupId,
    sender,
    cmd: "!moeda 5",
    prefix: "!",
    isGroup: true,
  })

  assert.equal(handled, true)
  const coinGames = storage.getCoinGames()
  assert.equal(coinGames[groupId]?.[sender], undefined)
  assert.ok(sent.some((m) => /precisa de pelo menos/.test(String(m.payload?.text || ""))))
})

test("startCoinRound rejects minimum bet below 2", async () => {
  const economyService = require("../services/economyService")
  const groupId = `__coin_round_minimum_${Date.now()}@g.us`
  const sender = "lowballer@s.whatsapp.net"
  const { sock, sent } = createSockCapture()

  const handled = await caraOuCoroa.startCoinRound({
    sock,
    from: groupId,
    sender,
    cmd: "!moeda 1",
    prefix: "!",
    isGroup: true,
  })

  assert.equal(handled, true)
  assert.ok(sent.length >= 1)
  const coinGames = storage.getCoinGames()
  assert.equal(coinGames[groupId]?.[sender], undefined)
  assert.ok(sent.some((m) => /Use: !moeda \[2-10\]/.test(String(m.payload?.text || ""))))
})

test("startCoinRound enforces rate limit of 5 plays per 30 minutes", async () => {
  const economyService = require("../services/economyService")
  const groupId = `__coin_rate_limit_${Date.now()}@g.us`
  const sender = "spammer@s.whatsapp.net"
  const { sock, sent } = createSockCapture()

  // Credit sender with enough coins for 6 plays at 2x bet
  economyService.creditCoins(sender, 1000, { type: "test-credit" })

  // Manually set rate limit to 4 plays (to test the 5th play is rejected)
  const limits = storage.getCoinRateLimits(groupId) || {}
  limits[sender] = [Date.now(), Date.now() - 1000, Date.now() - 2000, Date.now() - 3000, Date.now() - 4000]
  storage.setCoinRateLimits(groupId, limits)

  // 6th play should be rejected
  const handled = await caraOuCoroa.startCoinRound({
    sock,
    from: groupId,
    sender,
    cmd: "!moeda 2",
    prefix: "!",
    isGroup: true,
  })

  assert.equal(handled, true)
  const coinGames = storage.getCoinGames()
  assert.equal(coinGames[groupId]?.[sender], undefined)
  assert.ok(sent.some((m) => /atingiu o limite/.test(String(m.payload?.text || ""))))
})

test("coin guess does not apply punishment when bet is below threshold", async () => {
  const groupId = `__coin_threshold_${Date.now()}@g.us`
  const sender = "loser@s.whatsapp.net"
  const { sock, sent } = createSockCapture()
  let punishmentCalls = 0

  const resenha = storage.getResenhaAveriguada()
  resenha[groupId] = true
  storage.setResenhaAveriguada(resenha)

  setCoinRound(groupId, sender, "cara", 3)

  const handled = await caraOuCoroa.handleCoinGuess({
    sock,
    from: groupId,
    sender,
    cmd: "coroa",
    isGroup: true,
    overrideChecksEnabled: false,
    overrideJid: "",
    overridePhoneNumber: "",
    overrideIdentifiers: [],
    getPunishmentMenuText: () => "",
    getRandomPunishmentChoice: () => "1",
    getPunishmentNameById: () => "teste",
    applyPunishment: async () => {
      punishmentCalls += 1
    },
    clearPendingPunishment: () => {},
    rewardWinner: async () => {},
    chargeLoser: async () => {},
  })

  assert.equal(handled, true)
  assert.equal(punishmentCalls, 0)
  assert.ok(sent.some((m) => /abaixo do m[ií]nimo/i.test(String(m.payload?.text || ""))))
})

test("coin guess applies punishment when bet reaches default threshold", async () => {
  const groupId = `__coin_threshold_hit_${Date.now()}@g.us`
  const sender = "loser@s.whatsapp.net"
  const { sock } = createSockCapture()
  let punishmentCalls = 0

  const resenha = storage.getResenhaAveriguada()
  resenha[groupId] = true
  storage.setResenhaAveriguada(resenha)

  setCoinRound(groupId, sender, "cara", 4)

  const handled = await caraOuCoroa.handleCoinGuess({
    sock,
    from: groupId,
    sender,
    cmd: "coroa",
    isGroup: true,
    overrideChecksEnabled: false,
    overrideJid: "",
    overridePhoneNumber: "",
    overrideIdentifiers: [],
    getPunishmentMenuText: () => "",
    getRandomPunishmentChoice: () => "1",
    getPunishmentNameById: () => "teste",
    applyPunishment: async () => {
      punishmentCalls += 1
    },
    clearPendingPunishment: () => {},
    rewardWinner: async () => {},
    chargeLoser: async () => {},
  })

  assert.equal(handled, true)
  assert.equal(punishmentCalls, 1)
})

test("pending punishment choice is rejected when eligibility metadata is invalid", async () => {
  const groupId = `__pending_threshold_guard_${Date.now()}@g.us`
  const sender = "winner@s.whatsapp.net"
  const target = "target@s.whatsapp.net"
  const { sock, sent } = createSockCapture()

  const resenha = storage.getResenhaAveriguada()
  resenha[groupId] = true
  storage.setResenhaAveriguada(resenha)

  const pending = storage.getCoinPunishmentPending()
  if (!pending[groupId]) pending[groupId] = {}
  pending[groupId][sender] = {
    mode: "target",
    target,
    createdAt: Date.now(),
    origin: "game",
    punishmentEligible: false,
    minPunishmentBet: 4,
    roundBet: 2,
  }
  storage.setCoinPunishmentPending(pending)

  const handled = await punishmentService.handlePendingPunishmentChoice({
    sock,
    from: groupId,
    sender,
    text: "1",
    mentioned: [],
    isGroup: true,
    senderIsAdmin: false,
    isCommand: false,
  })

  assert.equal(handled, true)
  assert.equal(Boolean(storage.getCoinPunishmentPending()[groupId]?.[sender]), false)
  assert.ok(sent.some((m) => /expirou por elegibilidade de aposta/i.test(String(m.payload?.text || ""))))
})

test("applyPunishment applies all punishment types with numeric IDs", async () => {
  const groupId = `__all_punishments_${Date.now()}@g.us`
  const target = "target@s.whatsapp.net"
  const { sock } = createSockCapture()

  const expectedById = {
    1: "max5chars",
    2: "rate20s",
    3: "lettersBlock",
    4: "emojiOnly",
    5: "mute5m",
    6: "noVowels",
    7: "urgentPrefix",
    8: "wordListRequired",
    9: "allCaps",
    10: "deleteAndRepost",
    11: "sexualReaction",
    12: "randomDeleteChance",
    13: "max3wordsStrict",
  }

  for (const [punishmentId, expectedType] of Object.entries(expectedById)) {
    await punishmentService.applyPunishment(sock, groupId, target, Number(punishmentId), {
      origin: "admin",
      severityMultiplier: 1,
    })
    const active = storage.getActivePunishments()
    assert.equal(active[groupId]?.[target]?.type, expectedType)
  }

  punishmentService.clearPunishment(groupId, target)
})

test("punishment enforcement resolves sender JID variants consistently", async () => {
  const groupId = `__punishment_jid_norm_${Date.now()}@g.us`
  const targetWithDevice = "5511999999999:5@s.whatsapp.net"
  const targetCanonical = "5511999999999@s.whatsapp.net"
  const { sock, sent } = createSockCapture()

  await punishmentService.applyPunishment(sock, groupId, targetWithDevice, "1", {
    origin: "admin",
    severityMultiplier: 1,
  })

  const enforced = await punishmentService.handlePunishmentEnforcement(
    sock,
    { key: { id: "msg-1", remoteJid: groupId, fromMe: false, participant: targetCanonical } },
    groupId,
    targetCanonical,
    "mensagem muito longa",
    true,
    false,
    true
  )

  assert.equal(enforced, true)
  assert.ok(sent.some((entry) => Boolean(entry.payload?.delete)))
  punishmentService.clearPunishment(groupId, targetCanonical)
})

test("punishment linear 1.5x scaling is applied instead of exponential growth", async () => {
  const groupId = `__punishment_linear_scale_${Date.now()}@g.us`
  const target = "target@s.whatsapp.net"
  const { sock } = createSockCapture()

  const targetDurationMs = 10 * 60_000 // severity 3 => 5min * 2.0x (linear), not 11.25min (exponential)
  const toleranceMs = 2_000
  const idsWithLinearScaling = ["6", "7", "8", "11"]

  for (const punishmentId of idsWithLinearScaling) {
    const before = Date.now()
    await punishmentService.applyPunishment(sock, groupId, target, punishmentId, {
      origin: "admin",
      severityMultiplier: 3,
    })
    const active = storage.getActivePunishments()
    const endsAt = Number(active[groupId]?.[target]?.endsAt || 0)
    const duration = endsAt - before
    assert.ok(duration >= (targetDurationMs - toleranceMs) && duration <= (targetDurationMs + toleranceMs))
  }

  punishmentService.clearPunishment(groupId, target)
})

test("adivinhacao resolves with closest players and punishments", () => {
  const players = ["a@s.whatsapp.net", "b@s.whatsapp.net", "c@s.whatsapp.net"]
  const state = adivinhacao.start("g@g.us", players)
  state.secretNumber = 50

  assert.equal(adivinhacao.recordGuess(state, players[0], "49").valid, true)
  assert.equal(adivinhacao.recordGuess(state, players[1], "49").valid, true)
  assert.equal(adivinhacao.recordGuess(state, players[2], "70").valid, true)

  const results = adivinhacao.getResults(state)
  assert.ok(Array.isArray(results.closestPlayers))
  assert.equal(results.closestPlayers.length, 2)
  assert.ok(results.punishments.some((p) => p.playerId === players[2]))
})

test("dueloDados returns tie punishment when both rolls are equal", () => {
  const players = ["a@s.whatsapp.net", "b@s.whatsapp.net"]
  const state = dueloDados.start("g@g.us", players)
  state.rolls[players[0]] = 10
  state.rolls[players[1]] = 10

  const results = dueloDados.getResults(state)
  assert.equal(results.type, "tie")
  assert.deepEqual(results.punish.sort(), players.slice().sort())
})

test("roletaRussa guarantees a hit at sixth shot if not hit earlier", () => {
  const players = ["a@s.whatsapp.net", "b@s.whatsapp.net"]
  const state = roletaRussa.start("g@g.us", players, { betValue: 5 })
  state.cylinders = 5

  let hit = false
  let outcome = null
  for (let i = 0; i < 6; i++) {
    outcome = roletaRussa.takeShotAt(state)
    if (outcome.hit) {
      hit = true
      break
    }
  }

  assert.equal(hit, true)
  assert.ok(outcome.loser)
})

test("roletaRussa solo auto-win triggers after surpassing bet", () => {
  const player = "solo@s.whatsapp.net"
  const state = roletaRussa.start("g@g.us", [player], { betValue: 0 })
  state.cylinders = 5

  const outcome = roletaRussa.takeShotAt(state)
  assert.equal(outcome.autoWin, true)
  assert.equal(outcome.hit, false)
  assert.deepEqual(outcome.winners, [player])
})

test("roletaRussa solo wins even on hit after clearing bet", () => {
  const player = "solo@s.whatsapp.net"
  const state = roletaRussa.start("g@g.us", [player], { betValue: 0 })
  state.cylinders = 0

  const outcome = roletaRussa.takeShotAt(state)
  assert.equal(outcome.hit, true)
  assert.equal(Boolean(outcome.autoWin), true)
  assert.deepEqual(outcome.winners, [player])
})

test("roletaRussa multiplayer hit after surpassing bet becomes all-win", () => {
  const players = ["a@s.whatsapp.net", "b@s.whatsapp.net"]
  const state = roletaRussa.start("g@g.us", players, { betValue: 1 })
  state.cylinders = 5

  let outcome = null
  for (let i = 0; i < 6; i++) {
    outcome = roletaRussa.takeShotAt(state)
    if (outcome.hit) break
  }

  assert.equal(outcome.hit, true)
  assert.equal(outcome.allWin, true)
  assert.deepEqual((outcome.winners || []).sort(), players.slice().sort())
})

test("roletaRussa chamber selection hits on expected shot index", () => {
  const players = ["a@s.whatsapp.net", "b@s.whatsapp.net"]

  for (let chamber = 0; chamber <= 5; chamber++) {
    const state = roletaRussa.start("g@g.us", players, { betValue: 5 })
    state.cylinders = chamber

    let outcome = null
    for (let i = 0; i < 6; i++) {
      outcome = roletaRussa.takeShotAt(state)
      if (outcome.hit) break
    }

    assert.equal(Boolean(outcome?.hit), true)
    assert.equal(state.shotsFired, chamber + 1)
    assert.equal(Boolean(outcome?.guaranteed), chamber === 5)
  }
})

test("dobro ou nada charges buy-in 50 and doubles payout by streak", async () => {
  const economyService = require("../services/economyService")
  const groupId = `__dobro_curve_${Date.now()}@g.us`
  const sender = `winner_${Date.now()}@s.whatsapp.net`
  const { sock } = createSockCapture()

  economyService.creditCoins(sender, 1000, { type: "test-credit" })
  const beforeCoins = Number(economyService.getProfile(sender)?.coins || 0)

  const started = await caraOuCoroa.startDobroGame({
    sock,
    from: groupId,
    sender,
    storage,
    economyService,
    incrementUserStat: () => {},
  })
  assert.equal(started, true)

  const afterBuyInCoins = Number(economyService.getProfile(sender)?.coins || 0)
  assert.equal(afterBuyInCoins, beforeCoins - 50)

  const firstWin = await caraOuCoroa.handleDobroGuess({
    sock,
    from: groupId,
    sender,
    text: "cara",
    storage,
    economyService,
    incrementUserStat: () => {},
    overrideChecksEnabled: true,
    overrideJid: "",
    overridePhoneNumber: "",
    overrideIdentifiers: [sender],
  })
  assert.equal(firstWin, true)
  const afterFirstWinState = caraOuCoroa.getDobroState(groupId, sender)
  assert.equal(afterFirstWinState?.streak, 1)
  assert.equal(afterFirstWinState?.status, "waiting_for_choice")

  const continued = await caraOuCoroa.continueDobroGame({
    sock,
    from: groupId,
    sender,
    storage,
  })
  assert.equal(continued, true)

  const secondWin = await caraOuCoroa.handleDobroGuess({
    sock,
    from: groupId,
    sender,
    text: "cara",
    storage,
    economyService,
    incrementUserStat: () => {},
    overrideChecksEnabled: true,
    overrideJid: "",
    overridePhoneNumber: "",
    overrideIdentifiers: [sender],
  })
  assert.equal(secondWin, true)
  const afterSecondWinState = caraOuCoroa.getDobroState(groupId, sender)
  assert.equal(afterSecondWinState?.streak, 2)
  assert.equal(afterSecondWinState?.status, "waiting_for_choice")

  const exited = await caraOuCoroa.exitDobroGame({
    sock,
    from: groupId,
    sender,
    storage,
    economyService,
    incrementUserStat: () => {},
  })
  assert.equal(exited, true)

  const finalCoins = Number(economyService.getProfile(sender)?.coins || 0)
  assert.equal(finalCoins, beforeCoins + 50)
  assert.equal(caraOuCoroa.getDobroState(groupId, sender), null)
})

test("override coin guess uses player guess as resolved result", async () => {
  const groupId = `__override_guess_${Date.now()}@g.us`
  const sender = "override@s.whatsapp.net"
  const { sock, sent } = createSockCapture()
  let rewardCalls = 0

  setCoinRound(groupId, sender, "coroa")

  const handled = await caraOuCoroa.handleCoinGuess({
    sock,
    from: groupId,
    sender,
    cmd: "cara",
    isGroup: true,
    overrideChecksEnabled: true,
    overrideJid: "",
    overridePhoneNumber: "",
    overrideIdentifiers: [sender],
    getPunishmentMenuText: () => "",
    getRandomPunishmentChoice: () => "1",
    getPunishmentNameById: () => "teste",
    applyPunishment: async () => {},
    clearPendingPunishment: () => {},
    rewardWinner: async () => {
      rewardCalls += 1
    },
    chargeLoser: async () => {},
  })

  assert.equal(handled, true)
  assert.equal(rewardCalls, 1)
  assert.ok(sent.some((m) => String(m.payload?.text || "").includes("A moeda caiu em *cara*")))
})

test("disabled override uses actual toss result", async () => {
  const groupId = `__override_disabled_${Date.now()}@g.us`
  const sender = "override@s.whatsapp.net"
  const { sock, sent } = createSockCapture()
  let rewardCalls = 0
  let lossCalls = 0

  setCoinRound(groupId, sender, "coroa")

  const handled = await caraOuCoroa.handleCoinGuess({
    sock,
    from: groupId,
    sender,
    cmd: "cara",
    isGroup: true,
    overrideChecksEnabled: false,
    overrideJid: "",
    overridePhoneNumber: "",
    overrideIdentifiers: [sender],
    getPunishmentMenuText: () => "",
    getRandomPunishmentChoice: () => "1",
    getPunishmentNameById: () => "teste",
    applyPunishment: async () => {},
    clearPendingPunishment: () => {},
    rewardWinner: async () => {
      rewardCalls += 1
    },
    chargeLoser: async () => {
      lossCalls += 1
    },
  })

  assert.equal(handled, true)
  assert.equal(rewardCalls, 0)
  assert.equal(lossCalls, 1)
  assert.ok(sent.some((m) => String(m.payload?.text || "").includes("A moeda caiu em *coroa*")))
})
