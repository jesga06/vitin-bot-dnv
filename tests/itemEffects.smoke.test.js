const fs = require("fs")
const path = require("path")
const test = require("node:test")
const assert = require("node:assert/strict")

const economy = require("../services/economyService")

const ECONOMY_FILE = path.join(__dirname, "..", ".data", "economy.json")
const TEST_USERS = [
  "__test_item_effects_a@s.whatsapp.net",
  "__test_item_effects_b@s.whatsapp.net",
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

test("claim multiplier is consumed only by daily/work sources", () => {
  cleanupTestUsers()
  const a = TEST_USERS[0]

  economy.addItem(a, "claimMultiplier", 1)
  const used = economy.useItem(a, "claimMultiplier")
  assert.equal(used.ok, true)
  assert.equal(used.effect, "claim-multiplier")

  const invalidSource = economy.consumeClaimMultiplier(a, "casino")
  assert.equal(invalidSource.active, false)

  const validSource = economy.consumeClaimMultiplier(a, "daily")
  assert.equal(validSource.active, true)
  assert.equal(validSource.multiplier, 2)

  const spent = economy.consumeClaimMultiplier(a, "work")
  assert.equal(spent.active, false)
})

test("salvage insurance refunds 40 percent and consumes token", () => {
  cleanupTestUsers()
  const a = TEST_USERS[0]

  economy.creditCoins(a, 1000, { type: "test", details: "seed" })
  economy.addItem(a, "salvageToken", 1)

  const before = economy.getCoins(a)
  const salvage = economy.applySalvageInsurance(a, 500, { betValue: 10, threshold: 4 })
  const after = economy.getCoins(a)

  assert.equal(salvage.ok, true)
  assert.equal(salvage.activated, true)
  assert.equal(salvage.refunded, 200)
  assert.equal(after - before, 200)
  assert.equal(economy.getItemQuantity(a, "salvageToken"), 0)
})

test("streak saver consumes one item per protection", () => {
  cleanupTestUsers()
  const a = TEST_USERS[0]

  economy.addItem(a, "streakSaver", 2)
  assert.equal(economy.consumeStreakSaver(a), true)
  assert.equal(economy.getItemQuantity(a, "streakSaver"), 1)
  assert.equal(economy.consumeStreakSaver(a), true)
  assert.equal(economy.getItemQuantity(a, "streakSaver"), 0)
  assert.equal(economy.consumeStreakSaver(a), false)
})
