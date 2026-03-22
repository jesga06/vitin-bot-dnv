const test = require("node:test")
const assert = require("node:assert/strict")

const adivinhacao = require("../games/adivinhacao")
const dueloDados = require("../games/dueloDados")
const roletaRussa = require("../games/roletaRussa")

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
