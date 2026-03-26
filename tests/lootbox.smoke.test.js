const fs = require("fs")
const path = require("path")
const test = require("node:test")
const assert = require("node:assert/strict")

const economy = require("../services/economyService")
const {
  getLootboxItemWeight,
  getLootboxEffectsPool,
} = require("../services/lootboxService")

const ECONOMY_FILE = path.join(__dirname, "..", ".data", "economy.json")
const TEST_USER = "__test_lootbox@s.whatsapp.net"

function cleanupTestUser() {
  if (!fs.existsSync(ECONOMY_FILE)) return
  const parsed = JSON.parse(fs.readFileSync(ECONOMY_FILE, "utf8"))
  parsed.users = parsed.users || {}
  delete parsed.users[TEST_USER]
  fs.writeFileSync(ECONOMY_FILE, JSON.stringify(parsed, null, 2), "utf8")
  economy.loadEconomy()
}

test.before(cleanupTestUser)
test.after(cleanupTestUser)

test("lootbox rarity-5 policy keeps true kronos impossible", () => {
  const trueKronos = economy.ITEM_DEFINITIONS.kronosVerdadeira
  assert.equal(getLootboxItemWeight(trueKronos), 0)

  const brokenKronos = economy.ITEM_DEFINITIONS.kronosQuebrada
  assert.ok(getLootboxItemWeight(brokenKronos) > 0)
  assert.ok(getLootboxItemWeight(brokenKronos) <= 0.004)
})

test("lootbox item pool includes items and excludes true kronos", () => {
  const pool = getLootboxEffectsPool(economy.ITEM_DEFINITIONS)
  assert.ok(pool.some((entry) => String(entry.id || "").startsWith("item_")))
  assert.equal(pool.some((entry) => entry.id === "item_kronosVerdadeira"), false)
})

test("opening many lootboxes never grants true kronos crown", () => {
  cleanupTestUser()
  economy.addItem(TEST_USER, "lootbox", 200)

  for (let i = 0; i < 20; i++) {
    const result = economy.openLootbox(TEST_USER, 10, [TEST_USER])
    assert.equal(result.ok, true)

    for (const roll of result.results) {
      assert.equal(String(roll.effect || "").includes("Verdadeira"), false)
      assert.equal(String(roll.result || "").includes("Verdadeira"), false)
    }
  }

  assert.equal(economy.getItemQuantity(TEST_USER, "kronosVerdadeira"), 0)
})
