const fs = require("fs")
const path = require("path")
const test = require("node:test")
const assert = require("node:assert/strict")

const economy = require("../services/economyService")

const ECONOMY_FILE = path.join(__dirname, "..", ".data", "economy.json")
const TEST_USERS = [
  "__test_items_a@s.whatsapp.net",
  "__test_items_b@s.whatsapp.net",
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

test("manual-use items can be activated via !usaritem backend", () => {
  cleanupTestUsers()
  const a = TEST_USERS[0]

  economy.addItem(a, "redutorCooldowns1", 1)
  economy.setWorkCooldown(a, Date.now())
  const reduced = economy.useItem(a, "redutorCooldowns1")
  assert.equal(reduced.ok, true)
  assert.equal(reduced.effect, "cooldown-reduced")

  economy.addItem(a, "xpBooster", 1)
  const xp = economy.useItem(a, "xpBooster")
  assert.equal(xp.ok, true)
  assert.equal(xp.effect, "xp-booster")
  assert.equal(economy.isXpBoosterActive(a), true)

  economy.addItem(a, "questPointBooster", 1)
  const quest = economy.useItem(a, "questPointBooster")
  assert.equal(quest.ok, true)
  assert.equal(quest.effect, "quest-reward-multiplier")

  economy.addItem(a, "claimMultiplier", 1)
  const claim = economy.useItem(a, "claimMultiplier")
  assert.equal(claim.ok, true)
  assert.equal(claim.effect, "claim-multiplier")

  economy.addItem(a, "teamContribBooster", 1)
  const team = economy.useItem(a, "teamContribBooster")
  assert.equal(team.ok, true)
  assert.equal(team.effect, "team-contrib-multiplier")
  assert.equal(economy.getTeamContributionMultiplier(a), 2)
})

test("passive items are not manually usable", () => {
  cleanupTestUsers()
  const a = TEST_USERS[0]

  for (const key of ["escudo", "streakSaver", "salvageToken", "kronosQuebrada"]) {
    economy.addItem(a, key, 1)
    const used = economy.useItem(a, key)
    assert.equal(used.ok, false)
    assert.equal(used.reason, "item-not-usable-manually")
  }
})

test("legacy item keys migrate to canonical keys", () => {
  cleanupTestUsers()
  const a = TEST_USERS[0]

  const parsed = JSON.parse(fs.readFileSync(ECONOMY_FILE, "utf8"))
  parsed.users = parsed.users || {}
  parsed.users[a] = parsed.users[a] || { coins: 0, items: {}, buffs: {}, cooldowns: {}, stats: {}, progression: {} }
  parsed.users[a].items = parsed.users[a].items || {}
  parsed.users[a].items.boosterXp = 2
  parsed.users[a].items.seguroGeral = 1
  fs.writeFileSync(ECONOMY_FILE, JSON.stringify(parsed, null, 2), "utf8")

  economy.loadEconomy()

  assert.equal(economy.getItemQuantity(a, "xpBooster"), 2)
  assert.equal(economy.getItemQuantity(a, "salvageToken"), 1)
  assert.equal(economy.getItemQuantity(a, "boosterXp"), 2)
})

test("marca de crescimento remains collectible and not manually activatable", () => {
  cleanupTestUsers()
  const a = TEST_USERS[0]
  economy.addItem(a, "marcaEterna", 1)

  const used = economy.useItem(a, "marcaEterna")
  assert.equal(used.ok, false)
  assert.equal(used.reason, "item-not-usable-manually")
})
