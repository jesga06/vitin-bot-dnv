const fs = require("fs")
const path = require("path")
const test = require("node:test")
const assert = require("node:assert/strict")

const economy = require("../economyService")

const ECONOMY_FILE = path.join(__dirname, "..", ".data", "economy.json")
const TEST_USERS = [
  "__test_a@s.whatsapp.net",
  "__test_b@s.whatsapp.net",
]

function cleanupTestUsers() {
  if (!fs.existsSync(ECONOMY_FILE)) return
  const parsed = JSON.parse(fs.readFileSync(ECONOMY_FILE, "utf8"))
  parsed.users = parsed.users || {}
  for (const userId of TEST_USERS) {
    delete parsed.users[userId]
  }
  fs.writeFileSync(ECONOMY_FILE, JSON.stringify(parsed, null, 2), "utf8")
  economy.loadEconomy()
}

test.before(cleanupTestUsers)
test.after(cleanupTestUsers)

test("economy credit/debit/transfer flow works", () => {
  const a = TEST_USERS[0]
  const b = TEST_USERS[1]

  economy.creditCoins(a, 300, { type: "test-credit" })
  assert.equal(economy.getCoins(a) >= 300, true)

  const ok = economy.debitCoins(a, 100, { type: "test-debit" })
  assert.equal(ok, true)

  const transfer = economy.transferCoins(a, b, 50)
  assert.equal(transfer.ok, true)
  assert.equal(economy.getCoins(b) >= 50, true)
})

test("daily claim only succeeds once per day", () => {
  const a = TEST_USERS[0]
  const first = economy.claimDaily(a, 100)
  assert.equal(first.ok, true)

  const second = economy.claimDaily(a, 100)
  assert.equal(second.ok, false)
  assert.equal(second.reason, "already-claimed")
})

test("kronos grants 2 temporary shields per day and unused shields expire", () => {
  cleanupTestUsers()
  const a = TEST_USERS[0]
  const originalNow = Date.now

  try {
    Date.now = () => new Date("2026-03-20T10:00:00.000Z").getTime()
    economy.addItem(a, "kronosQuebrada", 1)

    assert.equal(economy.consumeShield(a), true)
    assert.equal(economy.getShields(a), 1)

    Date.now = () => new Date("2026-03-21T10:00:00.000Z").getTime()
    assert.equal(economy.getShields(a), 2)
    assert.equal(economy.consumeShield(a), true)
    assert.equal(economy.consumeShield(a), true)
    assert.equal(economy.consumeShield(a), false)
  } finally {
    Date.now = originalNow
  }
})

test("kronos increases steal success chance by 10 percent", () => {
  cleanupTestUsers()
  const thief = TEST_USERS[0]
  const victim = TEST_USERS[1]

  const baseChance = economy.getStealSuccessChance(victim, thief)
  assert.equal(baseChance, 0.3)

  economy.addItem(thief, "kronosQuebrada", 1)
  const buffedChance = economy.getStealSuccessChance(victim, thief)
  assert.equal(buffedChance, 0.4)
})
