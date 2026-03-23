const test = require("node:test")
const assert = require("node:assert/strict")
const crypto = require("crypto")

const gameManager = require("../gameManager")

test("gameManager creates 2-char alphanumeric lobby id", () => {
  const groupId = "__gm_a@g.us"
  const lobbyId = gameManager.createOptInSession(groupId, "adivinhacao", 1, 4, 120000)

  assert.match(lobbyId, /^[A-Z0-9]{2}$/)

  gameManager.clearOptInSession(groupId, lobbyId)
})

test("gameManager avoids lobby id collision across groups on creation", () => {
  const groupA = "__gm_b1@g.us"
  const groupB = "__gm_b2@g.us"

  const originalRandomInt = crypto.randomInt
  const picks = [0, 0, 0, 0, 0, 1] // AA, then AA (collision), then AB
  let cursor = 0

  crypto.randomInt = (min, max) => {
    if (cursor < picks.length) {
      const value = picks[cursor]
      cursor += 1
      return value
    }
    return originalRandomInt(min, max)
  }

  let lobbyA = ""
  let lobbyB = ""
  try {
    lobbyA = gameManager.createOptInSession(groupA, "dados", 2, 2, 120000)
    lobbyB = gameManager.createOptInSession(groupB, "rr", 1, 4, 120000)

    assert.equal(lobbyA, "AA")
    assert.equal(lobbyB, "AB")
    assert.notEqual(lobbyA, lobbyB)
  } finally {
    crypto.randomInt = originalRandomInt
    if (lobbyA) gameManager.clearOptInSession(groupA, lobbyA)
    if (lobbyB) gameManager.clearOptInSession(groupB, lobbyB)
  }
})
