const fs = require("fs")
const path = require("path")
const telemetry = require("./telemetryService")
const {
  openLootboxEngine,
} = require("./lootboxService")
const {
  applyCooldownReducerEngine,
  isXpBoosterActiveEngine,
  consumeQuestRewardMultiplierEngine,
  consumeClaimMultiplierEngine,
  getTeamContributionMultiplierEngine,
  consumeStreakSaverEngine,
  applySalvageInsuranceEngine,
  useItemEngine,
} = require("./itemEffectsService")
const {
  getDailyQuestStateEngine,
  addXpEngine,
  getXpProfileEngine,
  claimDailyQuestEngine,
  getWeeklyQuestStateEngine,
  claimWeeklyQuestEngine,
} = require("./progressionService")
const {
  getStealSuccessChanceEngine,
  canAttemptStealEngine,
  attemptStealEngine,
} = require("./stealService")
const {
  forgePunishmentPassEngine,
  applyForgedPassTypeChoiceEngine,
} = require("./forgeService")

const DATA_DIR = path.join(__dirname, "..", ".data")
const ECONOMY_FILE = path.join(DATA_DIR, "economy.json")
const DEFAULT_COINS = 0
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_COINS_BALANCE = 2_000_000_000
const MAX_COIN_OPERATION = 50_000_000
const MAX_ITEM_STACK = 100_000
const MAX_ITEM_OPERATION = 10_000
const MAX_LOOTBOX_OPEN_PER_CALL = 10
const MAX_FORGE_QUANTITY = 1_000
const WORK_COOLDOWN_BASE_MS = 90 * 60 * 1000
const DAILY_QUEST_COUNT = 3
const WEEKLY_QUEST_COUNT = 5
const BASE_XP_TO_LEVEL = 80
const XP_GROWTH_MIN = 0.10
const XP_GROWTH_MAX = 0.30
const XP_BASE_GROWTH_CEILING = 0.26
const LEVEL_MILESTONE_INTERVAL = 5
const MAX_LEVEL = 100
const SEASON_DURATION_MS = 42 * DAY_MS
const { DAILY_QUEST_POOL, WEEKLY_QUEST_POOL } = require("./questPools")

const PUNISHMENT_TYPE_NAMES = {
  1: "max. 5 caracteres",
  2: "1 msg/20s",
  3: "bloqueio 2 letras",
  4: "somente emojis/figurinhas",
  5: "mute total",
  6: "sem vogais",
  7: "prefixo urgente",
  8: "palavras da lista",
  9: "somente caixa alta",
  10: "repost pelo bot",
  11: "reação sugestiva",
  12: "chance de apagar",
  13: "máx. 3 palavras",
}

const PUNISHMENT_PASS_BASE_SELL = {
  // Light punishments (warnings, mute 5min): 50-100
  1: 75,    // max 5 chars
  2: 85,    // 1 msg/20s
  // Moderate punishments (mute 10-30min, small fine): 100-200
  3: 120,   // block 2 letters
  4: 140,   // only emojis
  5: 170,   // total mute (shorter)
  // Heavy punishments (mute 1h+, significant fine): 200-500
  6: 250,   // no vowels
  7: 280,   // urgent prefix
  8: 320,   // blocked words
  9: 380,   // uppercase only
  10: 420,  // repost by bot
  // Severe punishments (extended mute, major losses): 500+
  11: 550,  // suggestive reaction
  12: 650,  // chance to delete
  13: 750,  // max 3 words
}

const PASS_ITEM_ID_BASE = 100_000
const PASS_ITEM_ID_TYPE_FACTOR = 1_000

function normalizePassSeverity(value, fallback = 1) {
  const parsed = Math.floor(Number(value) || 0)
  return parsed > 0 ? parsed : fallback
}

function isValidPunishmentType(type) {
  const parsed = Math.floor(Number(type) || 0)
  return parsed >= 1 && parsed <= 13
}

function buildPunishmentPassKey(type, severity = 1) {
  const safeType = Math.floor(Number(type) || 0)
  const safeSeverity = normalizePassSeverity(severity, 1)
  return String(PASS_ITEM_ID_BASE + (safeType * PASS_ITEM_ID_TYPE_FACTOR) + safeSeverity)
}

function parsePunishmentPassKey(itemKey = "") {
  const raw = String(itemKey || "")
  const numeric = Number.parseInt(raw, 10)
  if (/^\d+$/.test(raw) && Number.isFinite(numeric) && numeric >= (PASS_ITEM_ID_BASE + PASS_ITEM_ID_TYPE_FACTOR + 1)) {
    const remainder = numeric - PASS_ITEM_ID_BASE
    const type = Math.floor(remainder / PASS_ITEM_ID_TYPE_FACTOR)
    const severity = remainder % PASS_ITEM_ID_TYPE_FACTOR
    if (isValidPunishmentType(type) && severity > 0) {
      return { type, severity, key: buildPunishmentPassKey(type, severity) }
    }
  }

  const legacyMatch = raw.match(/^passPunicao(1[0-3]|[1-9])x(\d+)$/i)
  if (!legacyMatch) return null
  const type = Number.parseInt(legacyMatch[1], 10)
  const severity = normalizePassSeverity(legacyMatch[2], 1)
  return { type, severity, key: buildPunishmentPassKey(type, severity) }
}

function getPunishmentPassDefinition(type, severity = 1) {
  if (!isValidPunishmentType(type)) return null
  const parsedType = Math.floor(Number(type) || 0)
  const parsedSeverity = normalizePassSeverity(severity, 1)
  const baseSell = Number(PUNISHMENT_PASS_BASE_SELL[parsedType]) || 400
  const sellValue = Math.floor(baseSell * parsedSeverity)
  return {
    key: buildPunishmentPassKey(parsedType, parsedSeverity),
    aliases: [],
    name: `Passe de Punição ${parsedType} (${parsedSeverity}x)`,
    price: sellValue,
    sellRate: 1,
    stackable: true,
    buyable: false,
    punishmentType: parsedType,
    severity: parsedSeverity,
    description: `Permite aplicar punição '${PUNISHMENT_TYPE_NAMES[parsedType]}' com severidade ${parsedSeverity}x. Item não comprável na loja.`,
  }
}

function pickRandomPunishmentType(excludedType = null) {
  const options = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].filter((type) => type !== excludedType)
  return options[Math.floor(Math.random() * options.length)]
}

const ITEM_DEFINITIONS = {
  // ===== REGULAR PURCHASABLE ITEMS (15) =====
  // Defense
  escudo: {
    key: "escudo",
    id: "1",
    aliases: ["escudob"],
    name: "Escudo",
    price: 900,
    sellRate: 0.8,
    stackable: true,
    rarity: 2,
    description: "[PASSIVO] Protege automaticamente contra 1 punição não administrativa.",
  },
  escudoReforcado: {
    key: "escudoReforcado",
    id: "2",
    aliases: ["escudoforte"],
    name: "Escudo Reforçado",
    price: 2500,
    sellRate: 0.8,
    stackable: true,
    rarity: 3,
    description: "[PASSIVO] Ao ativar, converte-se em 3 proteções automáticas contra punições/roubos.",
  },
  // Risk Protection
  antiRouboCharm: {
    key: "antiRouboCharm",
    id: "3",
    aliases: ["pingenteantiroubo", "pingentear", "pingenteantiroubo", "pingenteAntiRoubo"],
    name: "Pingente Anti-Roubo",
    price: 1200,
    sellRate: 0.8,
    stackable: true,
    rarity: 2,
    description: "[PASSIVO] Reduz em 5% a chance de sucesso de roubos contra você.",
  },
  casinoInsurance: {
    key: "casinoInsurance",
    id: "4",
    aliases: ["tokensegurocassino", "seguroCassino"],
    name: "Token de Seguro no Cassino",
    price: 1800,
    sellRate: 0.8,
    stackable: true,
    rarity: 3,
    description: "[PASSIVO] Ao perder no cassino, consome 1 token e devolve 40% da perda.",
  },
  // Utility
  workSafetyToken: {
    key: "workSafetyToken",
    id: "5",
    aliases: ["tokentrabalhoseguro", "seguroTrabalho"],
    name: "Token de Seguro no Trabalho",
    price: 600,
    sellRate: 0.8,
    stackable: true,
    rarity: 1,
    description: "[PASSIVO] Em falhas de trabalho, consome 1 token e devolve 40% da perda/valor de referência.",
  },
  rrFocusToken: {
    key: "rrtokensorte",
    id: "6",
    aliases: ["tokensorterr", "tokenSorteRR"],
    name: "Token de Sorte na RR",
    price: 1400,
    sellRate: 0.8,
    stackable: true,
    rarity: 2,
    description: "[PASSIVO] Na Roleta Russa, reduz a chance de ser atingido. Consome 1 token ao vencer sem ser atingido.",
  },
  cooldownReducer: {
    key: "redutorCooldowns1",
    id: "7",
    aliases: ["redutor", "redutorCooldowns"],
    name: "Redutor de Cooldowns",
    price: 1100,
    sellRate: 0.8,
    stackable: true,
    rarity: 2,
    description: "[MANUAL via !usaritem] Reduz 10 minutos fixos dos cooldowns de economia.",
  },
  questRerollToken: {
    key: "questRerollToken",
    id: "8",
    aliases: ["rerollmissao", "tokenRerolagem"],
    name: "Token de Re-rolagem",
    price: 800,
    sellRate: 0.8,
    stackable: true,
    rarity: 2,
    description: "[MANUAL via !usaritem] Re-rola as missões diárias atuais.",
  },
  streakSaver: {
    key: "streakSaver",
    id: "9",
    aliases: ["salvadorstreak", "salvaStreak"],
    name: "Salva-streak",
    price: 1300,
    sellRate: 0.8,
    stackable: true,
    rarity: 2,
    description: "[PASSIVO] Consumo automático no !moeda (dobro ou nada) ao perder uma rodada.",
  },
  salvageToken: {
    key: "salvageToken",
    id: "10",
    aliases: ["seguro", "seguroGeral"],
    name: "Seguro Geral",
    price: 2000,
    sellRate: 0.75,
    stackable: true,
    rarity: 3,
    description: "[PASSIVO] Consumo automático em apostas >= 4: devolve 40% da perda.",
  },
  // Boosters
  xpBooster: {
    key: "xpBooster",
    id: "11",
    aliases: ["boosterxp", "boosterXp"],
    name: "Booster de XP",
    price: 700,
    sellRate: 0.8,
    stackable: true,
    rarity: 1,
    description: "[MANUAL via !usaritem] +15% XP por 24h reais.",
  },
  moedaDaSorte: {
    key: "moedaDaSorte",
    id: "12",
    aliases: ["moedadasorte"],
    name: "Moeda da Sorte",
    price: 450,
    sellRate: 0.75,
    stackable: true,
    rarity: 1,
    description: "[PASSIVO] +5% ganhos de moedas em daily/trabalho/cassino/roubo.",
  },
  espelhoDeLuz: {
    key: "espelhoDeLuz",
    id: "13",
    aliases: ["espelhol"],
    name: "Espelho de Luz",
    price: 500,
    sellRate: 0.75,
    stackable: true,
    rarity: 1,
    description: "[PASSIVO] Bloqueia automaticamente 1 punição/roubo por semana.",
  },
  boosterDeMoedas: {
    key: "boosterDeMoedas",
    id: "14",
    aliases: ["boostermoedas"],
    name: "Booster de Moedas",
    price: 550,
    sellRate: 0.8,
    stackable: true,
    rarity: 1,
    description: "[PASSIVO] +25% moedas recebidas em trabalho.",
  },
  questPointBooster: {
    key: "questPointBooster",
    id: "15",
    aliases: ["boostermissao", "boosterMissao"],
    name: "Multiplicador de Recompensas (Quests)",
    price: 950,
    sellRate: 0.8,
    stackable: true,
    rarity: 2,
    description: "[MANUAL via !usaritem] +25% de recompensas em missões por 3 resgates.",
  },
  claimMultiplier: {
    key: "claimMultiplier",
    id: "16",
    aliases: ["multiplicador", "multiplicadorRotina"],
    name: "Multiplicador de Rotina (!daily/!trabalho)",
    price: 1500,
    sellRate: 0.8,
    stackable: true,
    rarity: 2,
    description: "[MANUAL via !usaritem] Consome no próximo !daily ou !trabalho, dobrando a recompensa de coins.",
  },
  cristalDeAmplificacao: {
    key: "cristalDeAmplificacao",
    id: "17",
    aliases: ["cristal"],
    name: "Cristal de Amplificação",
    price: 2200,
    sellRate: 0.78,
    stackable: true,
    rarity: 3,
    description: "[PASSIVO] +12% ganhos no cassino.",
  },
  joiaDeProtecao: {
    key: "joiaDeProtecao",
    id: "18",
    aliases: ["joiaprotecao"],
    name: "Joia de Proteção",
    price: 2400,
    sellRate: 0.78,
    stackable: true,
    rarity: 3,
    description: "[PASSIVO] Reduz em 6% a chance de ser roubado.",
  },
  // Social
  teamContribBooster: {
    key: "teamContribBooster",
    id: "19",
    aliases: ["boostertime", "multiplicadorTime"],
    name: "Multiplicador de Contribuições",
    price: 1600,
    sellRate: 0.75,
    stackable: true,
    rarity: 3,
    description: "[MANUAL via !usaritem] 2x contribuição em times por 24h.",
  },

  // ===== RARE ITEMS (Rarity 4) =====
  artefatoAntigo: {
    key: "artefatoAntigo",
    id: "20",
    aliases: ["artefato"],
    name: "Artefato Antigo",
    price: 3500,
    sellRate: 0.75,
    stackable: true,
    rarity: 4,
    description: "[PASSIVO] +10% XP em todas as fontes.",
  },
  joiaDeAssalto: {
    key: "joiaDeAssalto",
    id: "21",
    aliases: ["joiaroubo", "joiaassalto"],
    name: "Joia de Assalto",
    price: 4000,
    sellRate: 0.75,
    stackable: true,
    rarity: 4,
    description: "[PASSIVO] Aumenta em 8% sua chance de sucesso ao roubar.",
  },
  reliquiaEsquecida: {
    key: "charmeKronos",
    id: "22",
    aliases: ["charmeKronos"],
    name: "Charme do Kronos",
    price: 4500,
    sellRate: 0.75,
    stackable: true,
    rarity: 4,
    description: "[PASSIVO] +10% moedas obtidas em roubos bem-sucedidos.",
  },
  tesouroClassico: {
    key: "tesouroClassico",
    id: "23",
    aliases: ["tesouro"],
    name: "Tesouro Clássico",
    price: 5000,
    sellRate: 0.75,
    stackable: true,
    rarity: 4,
    description: "[PASSIVO] +12% recompensa de moedas no daily.",
  },
  coracaoOssiificado: {
    key: "coracaoOssificado",
    id: "24",
    aliases: ["coracao"],
    name: "Amuleto de Defesa",
    price: 3800,
    sellRate: 0.74,
    stackable: true,
    rarity: 4,
    description: "[PASSIVO] Bloqueia automaticamente 1 punição/roubo por dia.",
  },
  seloLendario: {
    key: "seloLendario",
    id: "25",
    aliases: ["selo"],
    name: "Selo de Bônus Global",
    price: 4200,
    sellRate: 0.75,
    stackable: true,
    rarity: 4,
    description: "[PASSIVO] +25% efetividade de contribuição em times.",
  },

  // ===== KRONOS CROWNS (Special, Rarity 5) =====
  kronosQuebrada: {
    key: "kronosQuebrada",
    id: "26",
    aliases: ["coroakronosquebrada"],
    name: "Coroa Kronos (Quebrada)",
    price: 24000,
    sellRate: 0.8,
    stackable: true,
    rarity: 5,
    durationMs: 10 * DAY_MS,
    description: "[PASSIVO] +30% ganhos (cassino, roubo, trabalhos), +10% daily, -10% chance de ser roubado, +10% chance ao roubar e 2 escudos temporarios por dia.",
  },
  kronosVerdadeira: {
    key: "kronosVerdadeira",
    id: "0",
    aliases: ["coroakronosverdadeira"],
    name: "Coroa Kronos Verdadeira",
    price: 120000,
    sellRate: 0.8,
    stackable: false,
    rarity: 5,
    permanent: true,
    description: "[PASSIVO] +30% ganhos (cassino, roubo, trabalhos), +10% daily, -10% chance de ser roubado, +10% chance ao roubar e 2 escudos temporarios por dia. PERMANENTE!",
  },
  tesouroLendario: {
    key: "tesouroLendario",
    id: "27",
    aliases: ["tesouro"],
    name: "Tesouro Lendário",
    price: 150000,
    sellRate: 0.76,
    stackable: true,
    rarity: 5,
    description: "[PASSIVO] +15% ganhos de moedas em múltiplas fontes.",
  },
  pedraClimatica: {
    key: "pedraClimatica",
    id: "28",
    aliases: ["pedra"],
    name: "Token de Pico Semanal",
    price: 100000,
    sellRate: 0.76,
    stackable: true,
    rarity: 5,
    description: "[PASSIVO] Reduz em 25% o cooldown de !trabalho.",
  },
  coracaoDoUniverso: {
    key: "coracaoDoUniverso",
    id: "29",
    aliases: ["coracao"],
    name: "Renda Diária Suprema",
    price: 180000,
    sellRate: 0.76,
    stackable: true,
    rarity: 5,
    permanent: true,
    description: "[PASSIVO] +40% moedas no daily.",
  },
  marcaEterna: {
    key: "marcaEterna",
    id: "30",
    aliases: ["marca"],
    name: "Marca de Crescimento",
    price: 160000,
    sellRate: 0.76,
    stackable: true,
    rarity: 5,
    description: "[PASSIVO] +6% XP em todas as fontes.",
  },

  // ===== LOOTBOX & REGULAR ITEMS =====
  lootbox: {
    key: "lootbox",
    id: "31",
    aliases: ["caixa", "lootcaixa"],
    name: "Lootbox",
    price: 900,
    sellRate: 0.8,
    stackable: true,
    rarity: 2,
    description: "[MANUAL via !lootbox] Abra para receber efeitos e itens aleatórios (máx. 10 por comando).",
  },

  // ===== DISCOUNT COUPONS (buyable and earnable, not in shop) =====
  coupon5pct: {
    key: "coupon5pct",
    id: "32",
    aliases: ["cupom5"],
    name: "Discount Coupon (5%)",
    price: 0,
    sellRate: 1.0,
    stackable: true,
    rarity: 1,
    buyable: false,
    description: "[MANUAL via !usarcupom] 5% de desconto em uma compra de itens.",
  },
  coupon10pct: {
    key: "coupon10pct",
    id: "33",
    aliases: ["cupom10"],
    name: "Discount Coupon (10%)",
    price: 0,
    sellRate: 1.0,
    stackable: true,
    rarity: 1,
    buyable: false,
    description: "[MANUAL via !usarcupom] 10% de desconto em uma compra de itens.",
  },
  coupon25pct: {
    key: "coupon25pct",
    id: "34",
    aliases: ["cupom25"],
    name: "Discount Coupon (25%)",
    price: 0,
    sellRate: 1.0,
    stackable: true,
    rarity: 2,
    buyable: false,
    description: "[MANUAL via !usarcupom] 25% de desconto em uma compra de itens.",
  },
  coupon40pct: {
    key: "coupon40pct",
    id: "35",
    aliases: ["cupom40"],
    name: "Discount Coupon (40%)",
    price: 0,
    sellRate: 1.0,
    stackable: true,
    rarity: 3,
    buyable: false,
    description: "[MANUAL via !usarcupom] 40% de desconto máximo em uma compra de itens.",
  },

}

const LEGACY_ITEM_KEY_TO_ID = {}
const seenItemNumericIds = new Set()

for (const item of Object.values(ITEM_DEFINITIONS)) {
  const legacyKey = String(item?.key || "").trim()
  const numericId = String(item?.id || "").trim()
  if (!legacyKey) continue
  if (!numericId || !/^\d+$/.test(numericId)) {
    throw new Error(`Item sem id numérico válido em ITEM_DEFINITIONS: ${legacyKey}`)
  }
  if (seenItemNumericIds.has(numericId)) {
    throw new Error(`ID de item duplicado em ITEM_DEFINITIONS: ${numericId}`)
  }
  seenItemNumericIds.add(numericId)
  LEGACY_ITEM_KEY_TO_ID[legacyKey] = numericId
  item.legacyKey = legacyKey
  item.id = numericId
  item.key = numericId
}

const ITEM_DEFINITIONS_BY_ID = Object.fromEntries(
  Object.values(ITEM_DEFINITIONS).map((item) => [String(item?.key || ""), item])
)

const KRONOS_VERDADEIRA_ITEM_ID = LEGACY_ITEM_KEY_TO_ID.kronosVerdadeira
const KRONOS_QUEBRADA_ITEM_ID = LEGACY_ITEM_KEY_TO_ID.kronosQuebrada

const SHIELD_PRICE = ITEM_DEFINITIONS.escudo.price

const REMOVED_ITEM_KEYS = new Set([
  "coopLuckCharm",
  "milestoneRelic",
  "teamLegacyBadge",
  "jackpotArtifact",
  "eventTrophy",
  "adminCommemorative",
  "collectibleSetA1",
  "collectibleSetA2",
  "collectibleSetA3",
  "collectibleSetB1",
  "collectibleSetB2",
  "collectibleSetB3",
])

// Punishment pass pricing by type (following masterplan brackets)
const PUNISHMENT_PASS_PRICING = {
  // Light punishments (1-2): 50-100 coins
  1: { lightPrice: 50, moderatePrice: 75, heavyPrice: 100 },
  2: { lightPrice: 60, moderatePrice: 85, heavyPrice: 110 },
  // Moderate punishments (3-5): 100-200 coins
  3: { lightPrice: 100, moderatePrice: 150, heavyPrice: 200 },
  4: { lightPrice: 110, moderatePrice: 160, heavyPrice: 210 },
  5: { lightPrice: 120, moderatePrice: 170, heavyPrice: 220 },
  // Heavy punishments (6-8): 200-500 coins
  6: { lightPrice: 200, moderatePrice: 300, heavyPrice: 450 },
  7: { lightPrice: 220, moderatePrice: 330, heavyPrice: 480 },
  8: { lightPrice: 240, moderatePrice: 360, heavyPrice: 500 },
  // Severe punishments (9-13): 500+ coins
  9: { lightPrice: 500, moderatePrice: 750, heavyPrice: 1000 },
  10: { lightPrice: 550, moderatePrice: 800, heavyPrice: 1100 },
  11: { lightPrice: 600, moderatePrice: 900, heavyPrice: 1200 },
  12: { lightPrice: 700, moderatePrice: 1000, heavyPrice: 1400 },
  13: { lightPrice: 800, moderatePrice: 1200, heavyPrice: 1600 },
}

const DEFAULT_USER_STATS = {
  casinoPlays: 0,
  works: 0,
  steals: 0,
  stealAttempts: 0,
  stealFailedCount: 0,
  gameGuessExact: 0,
  gameGuessClosest: 0,
  gameGuessTie: 0,
  gameGuessLoss: 0,
  gameBatataWin: 0,
  gameBatataLoss: 0,
  gameCoinWin: 0,
  gameCoinLoss: 0,
  gameDobroWin: 0,
  gameDobroLoss: 0,
  gameDadosWin: 0,
  gameDadosLoss: 0,
  gameEmbaralhadoWin: 0,
  gameEmbaralhadoLoss: 0,
  gameMemoriaWin: 0,
  gameMemoriaLoss: 0,
  gameReacaoWin: 0,
  gameReacaoLoss: 0,
  gameRrTrigger: 0,
  gameRrBetWin: 0,
  gameRrShotLoss: 0,
  gameRrWin: 0,
  gameComandoWin: 0,
  gameComandoLoss: 0,
  lobbiesCreated: 0,
  lobbiesJoined: 0,
  lobbiesStarted: 0,
  moneyGameWon: 0,
  moneyGameLost: 0,
  moneyCasinoWon: 0,
  moneyCasinoLost: 0,
  dailyClaimCount: 0,
  lootboxesOpened: 0,
  lootboxPositiveRolls: 0,
  lootboxNegativeRolls: 0,
  punishmentsReceivedTotal: 0,
  punishmentsReceivedAdmin: 0,
  punishmentsReceivedGame: 0,
  coinsLifetimeEarned: 0,
  stealVictimCount: 0,
  stealVictimCoinsLost: 0,
  stealSuccessCount: 0,
  stealSuccessCoins: 0,
  itemsBought: 0,
  shieldsUsed: 0,
  questsCompleted: 0,
  tradesCompleted: 0,
  forgedPasses: 0,
}

const DEFAULT_PROGRESSION = {
  level: 1,
  xp: 0,
  seasonPoints: 0,
  dailyQuestRerollNonce: 0,
  lastQuestDayKey: null,
  dailyQuests: [],
  teamId: null,
  milestones: {},
  lastTradeByBracket: {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  },
  season: {
    startDate: 0,
    endDate: 0,
    coinsAtReset: 0,
    itemsAtReset: {},
    xpAtReset: 0,
  },
  permanentCrown: false,
}

function buildDefaultProgression() {
  return {
    ...DEFAULT_PROGRESSION,
    milestones: {},
    lastTradeByBracket: {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    },
    season: {
      startDate: 0,
      endDate: 0,
      coinsAtReset: 0,
      itemsAtReset: {},
      xpAtReset: 0,
    },
    dailyQuests: [],
  }
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

let economyCache = {
  users: {}, // [userJid]: { coins, items, buffs, cooldowns, stats, createdAt, updatedAt }
  seasonState: buildDefaultSeasonState(),
}

function splitDeviceSuffix(value = "") {
  return String(value || "").split(":")[0]
}

function parseUserParts(value = "") {
  const base = splitDeviceSuffix(String(value || "").trim().toLowerCase())
  const atIndex = base.indexOf("@")
  if (atIndex < 0) return { base, userPart: base, domain: "" }
  return {
    base,
    userPart: base.slice(0, atIndex),
    domain: base.slice(atIndex + 1),
  }
}

function canonicalUserHandle(userPart = "") {
  const cleaned = String(userPart || "").trim().toLowerCase()
  if (!cleaned) return ""
  const digits = cleaned.replace(/\D+/g, "")
  return digits || cleaned
}

function normalizeUserId(userId = "") {
  const { base, userPart, domain } = parseUserParts(userId)
  if (!base || !userPart) return ""
  if (domain === "s.whatsapp.net" || domain === "lid") {
    return `${canonicalUserHandle(userPart)}@s.whatsapp.net`
  }
  return base
}

function getUserIdAliases(userId = "") {
  const aliases = new Set()
  const { base, userPart, domain } = parseUserParts(userId)
  const normalized = normalizeUserId(userId)
  if (normalized) aliases.add(normalized)
  if (base) aliases.add(base)

  if ((domain === "s.whatsapp.net" || domain === "lid") && userPart) {
    const canonical = canonicalUserHandle(userPart)
    if (canonical) {
      aliases.add(`${canonical}@s.whatsapp.net`)
      aliases.add(`${canonical}@lid`)
    }
  }

  return Array.from(aliases).filter(Boolean)
}

function pickPreferredUserRecord(current = null, incoming = null) {
  if (!current) return incoming
  if (!incoming) return current
  const currentUpdated = Math.floor(Number(current.updatedAt) || 0)
  const incomingUpdated = Math.floor(Number(incoming.updatedAt) || 0)
  return incomingUpdated > currentUpdated ? incoming : current
}

function capPositiveInt(value, cap, fallback = 0) {
  const parsed = Math.floor(Number(value) || 0)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, Math.max(1, Math.floor(Number(cap) || 1)))
}

function getOperationLimits() {
  return {
    maxCoinsBalance: MAX_COINS_BALANCE,
    maxCoinOperation: MAX_COIN_OPERATION,
    maxItemStack: MAX_ITEM_STACK,
    maxItemOperation: MAX_ITEM_OPERATION,
    maxLootboxOpenPerCall: MAX_LOOTBOX_OPEN_PER_CALL,
    maxForgeQuantity: MAX_FORGE_QUANTITY,
  }
}

function getPercentile(sortedValues, percentile) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) return 0
  const clamped = Math.max(0, Math.min(1, Number(percentile) || 0))
  const index = Math.floor((sortedValues.length - 1) * clamped)
  return Math.floor(Number(sortedValues[index]) || 0)
}

function buildEconomyHealthSnapshot() {
  const users = Object.values(economyCache.users || {})
  const totalUsers = users.length
  const balances = users
    .map((user) => Math.max(0, Math.floor(Number(user?.coins) || 0)))
    .sort((a, b) => a - b)

  const totalCoins = balances.reduce((sum, value) => sum + value, 0)
  const fundedUsers = balances.filter((value) => value > 0).length
  const zeroBalanceUsers = totalUsers - fundedUsers
  const meanCoins = totalUsers > 0 ? Math.floor(totalCoins / totalUsers) : 0
  const medianCoins = getPercentile(balances, 0.5)
  const p75Coins = getPercentile(balances, 0.75)
  const p90Coins = getPercentile(balances, 0.9)
  const p99Coins = getPercentile(balances, 0.99)
  const maxCoins = balances.length > 0 ? balances[balances.length - 1] : 0

  const kronosActiveUsers = users.filter((user) => {
    const hasVerdadeira = Boolean(user?.buffs?.kronosVerdadeiraActive)
    const kronosExpiresAt = Number(user?.buffs?.kronosExpiresAt) || 0
    return hasVerdadeira || kronosExpiresAt > Date.now()
  }).length

  const topBalance = maxCoins
  const topSharePct = totalCoins > 0
    ? Number(((topBalance / totalCoins) * 100).toFixed(2))
    : 0

  return {
    totalUsers,
    fundedUsers,
    zeroBalanceUsers,
    totalCoins,
    meanCoins,
    medianCoins,
    p75Coins,
    p90Coins,
    p99Coins,
    maxCoins,
    topSharePct,
    kronosActiveUsers,
  }
}

function recordDailyEconomyHealthSnapshot(reason = "runtime") {
  if (typeof telemetry.recordDailySnapshot !== "function") return
  const dayKey = getDayKey()
  const snapshot = buildEconomyHealthSnapshot()
  telemetry.recordDailySnapshot("economy", dayKey, {
    reason,
    ...snapshot,
  })
}

function loadEconomy() {
  try {
    if (!fs.existsSync(ECONOMY_FILE)) return
    const now = Date.now()
    const data = JSON.parse(fs.readFileSync(ECONOMY_FILE, "utf8"))
    economyCache = {
      users: {},
      seasonState: buildDefaultSeasonState(now),
      ...data,
    }
    if (!economyCache.users || typeof economyCache.users !== "object") {
      economyCache.users = {}
    }

    const migratedUsers = {}
    let hasUserIdMigration = false
    for (const [rawUserId, payload] of Object.entries(economyCache.users)) {
      const normalized = normalizeUserId(rawUserId)
      if (!normalized) {
        hasUserIdMigration = true
        continue
      }
      if (normalized !== rawUserId) {
        hasUserIdMigration = true
      }
      migratedUsers[normalized] = pickPreferredUserRecord(migratedUsers[normalized], payload)
    }
    economyCache.users = migratedUsers

    if (!economyCache.seasonState || typeof economyCache.seasonState !== "object") {
      economyCache.seasonState = buildDefaultSeasonState(now)
    }
    economyCache.seasonState.currentSeason = Number.isFinite(economyCache.seasonState.currentSeason) && economyCache.seasonState.currentSeason > 0
      ? Math.floor(economyCache.seasonState.currentSeason)
      : 1
    economyCache.seasonState.startDate = Number.isFinite(economyCache.seasonState.startDate) && economyCache.seasonState.startDate > 0
      ? Math.floor(economyCache.seasonState.startDate)
      : now
    economyCache.seasonState.endDate = Number.isFinite(economyCache.seasonState.endDate) && economyCache.seasonState.endDate > 0
      ? Math.floor(economyCache.seasonState.endDate)
      : (economyCache.seasonState.startDate + SEASON_DURATION_MS)
    economyCache.seasonState.resetPolicy = economyCache.seasonState.resetPolicy === "hard" ? "hard" : "soft"
    if (hasUserIdMigration) {
      saveEconomy(true)
    }
    recordDailyEconomyHealthSnapshot("load")
  } catch (err) {
    console.error("Erro ao carregar economia:", err)
    economyCache = { users: {}, seasonState: buildDefaultSeasonState() }
  }
}

function getDayKey(ts = Date.now()) {
  const d = new Date(ts)
  const yyyy = String(d.getFullYear())
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function getWeekKey(ts = Date.now()) {
  const d = new Date(ts)
  const yyyy = String(d.getFullYear())
  // ISO 8601 week definition: week starts on Monday, week 1 is the first week with 4+ days in Jan
  const jan4 = new Date(d.getFullYear(), 0, 4)
  const monday = new Date(jan4)
  monday.setDate(jan4.getDate() - jan4.getDay() + (jan4.getDay() === 0 ? -6 : 1))
  const diff = d - monday
  const weekNumber = Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1
  const ww = String(weekNumber).padStart(2, "0")
  return `${yyyy}-W${ww}`
}

function stableHash(input = "") {
  let hash = 0
  const text = String(input || "")
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function buildDefaultSeasonState(now = Date.now()) {
  const startDate = Math.max(0, Math.floor(Number(now) || Date.now()))
  return {
    currentSeason: 1,
    startDate,
    endDate: startDate + SEASON_DURATION_MS,
    resetPolicy: "soft",
  }
}

function getBaseXpRequiredForLevel(level = 1) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1))
  const current = Number(levelRequirements[safeLevel])
  if (Number.isFinite(current) && current > 0) {
    return current
  }
  return Number(levelRequirements[levelRequirements.length - 1]) || BASE_XP_TO_LEVEL
}

function getXpGrowthRateForLevel(level = 1, maxLevel = MAX_LEVEL) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1))
  const safeMax = Math.max(2, Math.floor(Number(maxLevel) || MAX_LEVEL))
  const progress = Math.max(0, Math.min(1, (safeLevel - 1) / (safeMax - 1)))
  const eased = Math.pow(progress, 1.15)
  const baseGrowth = XP_GROWTH_MIN + ((XP_BASE_GROWTH_CEILING - XP_GROWTH_MIN) * eased)

  let milestoneBonus = 0
  if (safeLevel <= 70) {
    if (safeLevel % 10 === 0) {
      milestoneBonus = 0.04
    } else if (safeLevel % LEVEL_MILESTONE_INTERVAL === 0) {
      milestoneBonus = 0.02
    }
  } else {
    if (safeLevel % 10 === 0) {
      milestoneBonus = 0.08
    } else if (safeLevel % LEVEL_MILESTONE_INTERVAL === 0) {
      milestoneBonus = 0.05
    }
  }

  return Math.max(XP_GROWTH_MIN, Math.min(XP_GROWTH_MAX, baseGrowth + milestoneBonus))
}

function buildLevelThresholds(maxLevel = MAX_LEVEL) {
  const safeMax = Math.max(1, Math.floor(Number(maxLevel) || MAX_LEVEL))
  const thresholds = [0]
  const requirements = [0]
  let cumulative = 0
  let previousRequired = BASE_XP_TO_LEVEL
  for (let level = 1; level <= safeMax; level++) {
    let required = previousRequired
    if (level === 1) {
      required = BASE_XP_TO_LEVEL
    } else {
      const growth = getXpGrowthRateForLevel(level, safeMax)
      const minNext = Math.ceil(previousRequired * (1 + XP_GROWTH_MIN))
      const maxNext = Math.floor(previousRequired * (1 + XP_GROWTH_MAX))
      const candidate = Math.round(previousRequired * (1 + growth))
      required = Math.max(minNext, Math.min(maxNext, candidate))
    }

    requirements[level] = Math.max(BASE_XP_TO_LEVEL, required)
    previousRequired = requirements[level]
    cumulative += requirements[level]
    thresholds[level] = cumulative
  }
  return {
    thresholds,
    requirements,
  }
}

const xpCurve = buildLevelThresholds(MAX_LEVEL)
const levelThresholds = xpCurve.thresholds
const levelRequirements = xpCurve.requirements

function getXpRequiredForLevel(level = 1) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1))
  if (safeLevel > MAX_LEVEL) return getBaseXpRequiredForLevel(MAX_LEVEL)
  const current = Number(levelThresholds[safeLevel]) || 0
  const previous = Number(levelThresholds[safeLevel - 1]) || 0
  const delta = current - previous
  return delta > 0 ? delta : getBaseXpRequiredForLevel(safeLevel)
}

function getLevelMilestoneReward(level = 1) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1))
  if (safeLevel % LEVEL_MILESTONE_INTERVAL !== 0) return null

  const reward = {
    level: safeLevel,
    coins: 250 + (safeLevel * 35),
    items: [],
  }

  if (safeLevel % 10 === 0) {
    reward.items.push({ key: "lootbox", quantity: 1 })
  }
  if (safeLevel % 20 === 0) {
    reward.items.push({ key: "escudo", quantity: 1 })
  }

  return reward
}

let saveTimeout = null
function saveEconomy(immediate = false) {
  const doSave = () => {
    try {
      fs.writeFileSync(ECONOMY_FILE, JSON.stringify(economyCache, null, 2), "utf8")
      recordDailyEconomyHealthSnapshot("save")
    } catch (err) {
      console.error("Erro ao salvar economia:", err)
    }
  }

  if (immediate) {
    clearTimeout(saveTimeout)
    doSave()
    return
  }

  clearTimeout(saveTimeout)
  saveTimeout = setTimeout(doSave, 1500)
}

function migrateUserShape(user) {
  if (!user || typeof user !== "object") return
  if (!user.items || typeof user.items !== "object") user.items = {}

  for (const removedKey of REMOVED_ITEM_KEYS) {
    if (Object.prototype.hasOwnProperty.call(user.items, removedKey)) {
      delete user.items[removedKey]
    }
  }
  
  // Migrar dados antigos de "kronos" para a Kronos quebrada canônica
  if (user.items.kronos && user.items.kronos > 0) {
    user.items[KRONOS_QUEBRADA_ITEM_ID] = (Number(user.items[KRONOS_QUEBRADA_ITEM_ID]) || 0) + Number(user.items.kronos)
    delete user.items.kronos
  }

  // Migrar item antigo de silenciar/mute para passe de punição tipo 5 (1x)
  if (user.items.mute && user.items.mute > 0) {
    const passKey = buildPunishmentPassKey(5, 1)
    user.items[passKey] = (Number(user.items[passKey]) || 0) + Number(user.items.mute)
    delete user.items.mute
  }

  // Migrar chaves antigas/temporárias de itens para as chaves canônicas atuais
  const ITEM_KEY_MIGRATIONS = {
    pingenteAntiRoubo: LEGACY_ITEM_KEY_TO_ID.antiRouboCharm,
    seguroCassino: LEGACY_ITEM_KEY_TO_ID.casinoInsurance,
    seguroTrabalho: LEGACY_ITEM_KEY_TO_ID.workSafetyToken,
    tokenSorteRR: LEGACY_ITEM_KEY_TO_ID.rrtokensorte,
    rrFocusToken: LEGACY_ITEM_KEY_TO_ID.rrtokensorte,
    redutorCooldowns: LEGACY_ITEM_KEY_TO_ID.redutorCooldowns1,
    tokenRerolagem: LEGACY_ITEM_KEY_TO_ID.questRerollToken,
    salvaStreak: LEGACY_ITEM_KEY_TO_ID.streakSaver,
    seguroGeral: LEGACY_ITEM_KEY_TO_ID.salvageToken,
    boosterXp: LEGACY_ITEM_KEY_TO_ID.xpBooster,
    boosterMissao: LEGACY_ITEM_KEY_TO_ID.questPointBooster,
    multiplicadorRotina: LEGACY_ITEM_KEY_TO_ID.claimMultiplier,
    multiplicadorTime: LEGACY_ITEM_KEY_TO_ID.teamContribBooster,
  }
  for (const [legacyKey, canonicalKey] of Object.entries(ITEM_KEY_MIGRATIONS)) {
    if (!canonicalKey) continue
    const qty = Math.max(0, Math.floor(Number(user.items[legacyKey]) || 0))
    if (qty > 0) {
      user.items[canonicalKey] = Math.max(0, Math.floor(Number(user.items[canonicalKey]) || 0)) + qty
      delete user.items[legacyKey]
    }
  }

  const migratedItems = {}
  for (const [rawKey, rawQty] of Object.entries(user.items || {})) {
    const key = normalizeItemKey(rawKey)
    const qty = Math.max(0, Math.floor(Number(rawQty) || 0))
    if (!key || qty <= 0) continue
    migratedItems[key] = Math.max(0, Math.floor(Number(migratedItems[key]) || 0)) + qty
  }
  user.items = migratedItems
  
  if (!user.buffs || typeof user.buffs !== "object") {
    user.buffs = {
      kronosExpiresAt: 0,
      kronosTempShieldDayKey: null,
      kronosTempShields: 0,
      kronosVerdadeiraActive: false,
      xpBoosterExpiresAt: 0,
      questRewardMultiplierCharges: 0,
      claimMultiplierCharges: 0,
      teamContribExpiresAt: 0,
      espelhoDeLuzWeekKey: null,
      coracaoOssificadoDayKey: null,
    }
  }
  if (!Number.isFinite(user.buffs.kronosExpiresAt)) user.buffs.kronosExpiresAt = 0
  if (typeof user.buffs.kronosTempShieldDayKey !== "string" && user.buffs.kronosTempShieldDayKey !== null) {
    user.buffs.kronosTempShieldDayKey = null
  }
  if (!Number.isFinite(user.buffs.kronosTempShields)) user.buffs.kronosTempShields = 0
  if (typeof user.buffs.kronosVerdadeiraActive !== "boolean") user.buffs.kronosVerdadeiraActive = false
  if (!Number.isFinite(user.buffs.xpBoosterExpiresAt) || user.buffs.xpBoosterExpiresAt < 0) user.buffs.xpBoosterExpiresAt = 0
  if (!Number.isFinite(user.buffs.questRewardMultiplierCharges) || user.buffs.questRewardMultiplierCharges < 0) user.buffs.questRewardMultiplierCharges = 0
  if (!Number.isFinite(user.buffs.claimMultiplierCharges) || user.buffs.claimMultiplierCharges < 0) user.buffs.claimMultiplierCharges = 0
  if (!Number.isFinite(user.buffs.teamContribExpiresAt) || user.buffs.teamContribExpiresAt < 0) user.buffs.teamContribExpiresAt = 0
  if (typeof user.buffs.espelhoDeLuzWeekKey !== "string" && user.buffs.espelhoDeLuzWeekKey !== null) {
    user.buffs.espelhoDeLuzWeekKey = null
  }
  if (typeof user.buffs.coracaoOssificadoDayKey !== "string" && user.buffs.coracaoOssificadoDayKey !== null) {
    user.buffs.coracaoOssificadoDayKey = null
  }
  if (!user.cooldowns || typeof user.cooldowns !== "object") {
    user.cooldowns = {
      dailyClaimKey: null,
      workAt: 0,
      stealAt: 0,
      stealDailyKey: null,
      stealTargets: {},
      stealAttemptsToday: 0,
      carePackageLastClaimedAt: 0,
    }
  }
  if (!user.cooldowns.stealTargets || typeof user.cooldowns.stealTargets !== "object") {
    user.cooldowns.stealTargets = {}
  }
  if (!Number.isFinite(user.cooldowns.workAt) || user.cooldowns.workAt < 0) {
    user.cooldowns.workAt = 0
  }
  if (!Number.isFinite(user.cooldowns.stealAt) || user.cooldowns.stealAt < 0) {
    user.cooldowns.stealAt = 0
  }
  if (!Number.isFinite(user.cooldowns.stealAttemptsToday)) {
    user.cooldowns.stealAttemptsToday = 0
  }
  if (typeof user.cooldowns.stealDailyKey !== "string" && user.cooldowns.stealDailyKey !== null) {
    user.cooldowns.stealDailyKey = null
  }
  if (!Number.isFinite(user.cooldowns.carePackageLastClaimedAt)) {
    user.cooldowns.carePackageLastClaimedAt = 0
  }
  if (!user.stats || typeof user.stats !== "object") {
    user.stats = { ...DEFAULT_USER_STATS }
  }
  Object.keys(DEFAULT_USER_STATS).forEach((key) => {
    if (!Number.isFinite(user.stats[key])) {
      user.stats[key] = DEFAULT_USER_STATS[key]
    }
  })
  if (!Array.isArray(user.transactions)) user.transactions = []
  if (!user.preferences || typeof user.preferences !== "object") {
    user.preferences = {
      mentionOptIn: true,
      publicLabel: "",
    }
  }
  if (typeof user.preferences.mentionOptIn !== "boolean") {
    user.preferences.mentionOptIn = true
  }
  if (typeof user.preferences.publicLabel !== "string") {
    user.preferences.publicLabel = ""
  }
  if (!user.progression || typeof user.progression !== "object") {
    user.progression = buildDefaultProgression()
  }
  if (!Array.isArray(user.progression.dailyQuests)) user.progression.dailyQuests = []
  if (typeof user.progression.lastQuestDayKey !== "string" && user.progression.lastQuestDayKey !== null) {
    user.progression.lastQuestDayKey = null
  }
  if (!Number.isFinite(user.progression.dailyQuestRerollNonce) || user.progression.dailyQuestRerollNonce < 0) {
    user.progression.dailyQuestRerollNonce = 0
  }
  if (!Array.isArray(user.progression.weeklyQuests)) user.progression.weeklyQuests = []
  if (typeof user.progression.lastQuestWeekKey !== "string" && user.progression.lastQuestWeekKey !== null) {
    user.progression.lastQuestWeekKey = null
  }
  if (typeof user.progression.teamId !== "string" && user.progression.teamId !== null) {
    user.progression.teamId = null
  }
  if (!user.progression.milestones || typeof user.progression.milestones !== "object") {
    user.progression.milestones = {}
  }
  if (!user.progression.lastTradeByBracket || typeof user.progression.lastTradeByBracket !== "object") {
    user.progression.lastTradeByBracket = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  }
  if (!user.progression.season || typeof user.progression.season !== "object") {
    user.progression.season = {
      startDate: 0,
      endDate: 0,
      coinsAtReset: 0,
      itemsAtReset: {},
      xpAtReset: 0,
    }
  }
  if (typeof user.progression.permanentCrown !== "boolean") {
    user.progression.permanentCrown = false
  }
}

function ensureUser(userId) {
  const normalized = normalizeUserId(userId)
  if (!normalized) return null

  let migratedAlias = false
  const aliases = getUserIdAliases(userId)
  for (const alias of aliases) {
    if (!alias || alias === normalized) continue
    const aliasRecord = economyCache.users[alias]
    if (!aliasRecord) continue
    economyCache.users[normalized] = pickPreferredUserRecord(economyCache.users[normalized], aliasRecord)
    delete economyCache.users[alias]
    migratedAlias = true
  }

  if (!economyCache.users[normalized]) {
    economyCache.users[normalized] = {
      coins: DEFAULT_COINS,
      items: {},
      buffs: {
        kronosExpiresAt: 0,
        kronosTempShieldDayKey: null,
        kronosTempShields: 0,
        kronosVerdadeiraActive: false,
        xpBoosterExpiresAt: 0,
        questRewardMultiplierCharges: 0,
        claimMultiplierCharges: 0,
        teamContribExpiresAt: 0,
        espelhoDeLuzWeekKey: null,
        coracaoOssificadoDayKey: null,
      },
      cooldowns: {
        dailyClaimKey: null,
        workAt: 0,
        stealAt: 0,
        stealDailyKey: null,
        stealTargets: {},
        stealAttemptsToday: 0,
        carePackageLastClaimedAt: 0,
      },
      stats: {
        ...DEFAULT_USER_STATS,
      },
      preferences: {
        mentionOptIn: true,
        publicLabel: "",
      },
      progression: buildDefaultProgression(),
      transactions: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    saveEconomy()
  } else if (migratedAlias) {
    saveEconomy()
  }

  const user = economyCache.users[normalized]
  migrateUserShape(user)
  return user
}

function deleteUserProfile(userId) {
  const aliases = getUserIdAliases(userId)
  let removed = false
  for (const alias of aliases) {
    if (economyCache.users[alias]) {
      delete economyCache.users[alias]
      removed = true
    }
  }
  if (!removed) return false
  saveEconomy(true)
  return true
}

function touchUser(user) {
  if (!user || typeof user !== "object") return
  user.updatedAt = Date.now()
}

function pushTransaction(userId, entry = {}) {
  const user = ensureUser(userId)
  if (!user) return null
  const tx = {
    at: Date.now(),
    type: String(entry.type || "event"),
    deltaCoins: Math.floor(Number(entry.deltaCoins) || 0),
    details: String(entry.details || ""),
    meta: entry.meta && typeof entry.meta === "object" ? entry.meta : {},
  }
  user.transactions.push(tx)
  if (user.transactions.length > 100) {
    user.transactions = user.transactions.slice(-100)
  }
  touchUser(user)
  saveEconomy()
  return tx
}

function getCoins(userId) {
  const user = ensureUser(userId)
  if (!user) return 0
  return Math.max(0, Math.floor(Number(user.coins) || 0))
}

function setCoins(userId, amount, transaction = null) {
  const user = ensureUser(userId)
  if (!user) return 0

  const next = Math.max(0, Math.min(MAX_COINS_BALANCE, Math.floor(Number(amount) || 0)))
  const prev = getCoins(userId)
  user.coins = next
  touchUser(user)
  saveEconomy()

  const delta = next - prev
  if (transaction && delta !== 0) {
    pushTransaction(userId, {
      ...transaction,
      deltaCoins: delta,
    })
  }
  return next
}

function creditCoins(userId, amount, transaction = null) {
  const user = ensureUser(userId)
  const parsedAmount = Math.floor(Number(amount) || 0)
  if (!user || parsedAmount <= 0) return 0

  const current = getCoins(userId)
  const room = Math.max(0, MAX_COINS_BALANCE - current)
  const applied = Math.min(parsedAmount, room, MAX_COIN_OPERATION)
  if (applied <= 0) return 0

  user.coins = current + applied
  if (!Number.isFinite(user.stats.coinsLifetimeEarned)) user.stats.coinsLifetimeEarned = 0
  user.stats.coinsLifetimeEarned = Math.max(0, Math.floor(Number(user.stats.coinsLifetimeEarned) || 0) + applied)
  touchUser(user)
  saveEconomy()
  if (transaction) {
    pushTransaction(userId, {
      ...transaction,
      deltaCoins: applied,
    })
  }
  const txType = transaction?.type || "unspecified"
  telemetry.incrementCounter("economy.minted", applied, { source: txType })
  telemetry.appendEvent("economy.credit", {
    userId: normalizeUserId(userId),
    amount: applied,
    source: txType,
  })
  return applied
}

function buildProgressionDeps() {
  return {
    ensureUser,
    touchUser,
    saveEconomy,
    normalizeUserId,
    getDayKey,
    getWeekKey,
    stableHash,
    dailyQuestPool: DAILY_QUEST_POOL,
    weeklyQuestPool: WEEKLY_QUEST_POOL,
    dailyQuestCount: DAILY_QUEST_COUNT,
    weeklyQuestCount: WEEKLY_QUEST_COUNT,
    isXpBoosterActive,
    getXpRequiredForLevel,
    getLevelMilestoneReward,
    consumeQuestRewardMultiplier,
    creditCoins,
    incrementStat,
    telemetry,
    addItem,
    getItemQuantity,
    normalizeItemKey,
    capPositiveInt,
    maxItemOperation: MAX_ITEM_OPERATION,
    maxLevel: MAX_LEVEL,
    addXp,
  }
}

function getDailyQuestState(userId, dayKey = getDayKey()) {
  return getDailyQuestStateEngine(buildProgressionDeps(), userId, dayKey)
}

function addXp(userId, amount = 0, meta = {}) {
  return addXpEngine(buildProgressionDeps(), userId, amount, meta)
}

function getXpProfile(userId) {
  return getXpProfileEngine(buildProgressionDeps(), userId)
}

function debitCoins(userId, amount, transaction = null) {
  const user = ensureUser(userId)
  const parsedAmount = Math.floor(Number(amount) || 0)
  if (!user || parsedAmount <= 0) return false

  if (getCoins(userId) < parsedAmount) return false

  user.coins = getCoins(userId) - parsedAmount
  touchUser(user)
  saveEconomy()
  if (transaction) {
    pushTransaction(userId, {
      ...transaction,
      deltaCoins: -parsedAmount,
    })
  }
  const txType = transaction?.type || "unspecified"
  telemetry.incrementCounter("economy.burned", parsedAmount, { source: txType })
  telemetry.appendEvent("economy.debit", {
    userId: normalizeUserId(userId),
    amount: parsedAmount,
    source: txType,
  })
  return true
}

function debitCoinsFlexible(userId, amount, transaction = null) {
  const user = ensureUser(userId)
  const parsedAmount = Math.floor(Number(amount) || 0)
  if (!user || parsedAmount <= 0) return 0
  const available = getCoins(userId)
  const taken = Math.min(available, parsedAmount)
  user.coins = available - taken
  touchUser(user)
  saveEconomy()
  if (transaction && taken > 0) {
    pushTransaction(userId, {
      ...transaction,
      deltaCoins: -taken,
    })
  }
  if (taken > 0) {
    const txType = transaction?.type || "unspecified"
    telemetry.incrementCounter("economy.burned", taken, { source: txType })
    telemetry.appendEvent("economy.debitFlexible", {
      userId: normalizeUserId(userId),
      requested: parsedAmount,
      taken,
      source: txType,
    })
  }
  return taken
}

function normalizeItemKey(itemKey = "") {
  const raw = String(itemKey || "").trim()
  if (!raw) return null

  if (/^\d+$/.test(raw)) {
    return raw
  }

  const normalized = raw.toLowerCase()

  if (["mute", "silenciar", "silencio", "silêncio"].includes(normalized)) {
    return buildPunishmentPassKey(5, 1)
  }

  const passAlias = normalized.match(/^(?:passe|pass)(?:punicao)?(1[0-3]|[1-9])(?:x(\d+))?$/)
  if (passAlias) {
    const type = Number.parseInt(passAlias[1], 10)
    const severity = normalizePassSeverity(passAlias[2], 1)
    return buildPunishmentPassKey(type, severity)
  }

  const passKey = parsePunishmentPassKey(normalized)
  if (passKey) {
    return passKey.key
  }

  const mappedLegacy = LEGACY_ITEM_KEY_TO_ID[raw] || LEGACY_ITEM_KEY_TO_ID[normalized]
  if (mappedLegacy) {
    return mappedLegacy
  }

  const entries = Object.values(ITEM_DEFINITIONS)
  const found = entries.find((item) => {
    const canonical = String(item.legacyKey || item.key || "").toLowerCase()
    const aliases = (item.aliases || []).map((alias) => String(alias || "").toLowerCase())
    return canonical === normalized || aliases.includes(normalized)
  })
  return found?.key || null
}

function getItemDefinition(itemKey = "") {
  const key = normalizeItemKey(itemKey)
  if (!key) return null
  const passParsed = parsePunishmentPassKey(key)
  if (passParsed) {
    return getPunishmentPassDefinition(passParsed.type, passParsed.severity)
  }
  return ITEM_DEFINITIONS_BY_ID[key] || null
}

function getItemQuantity(userId, itemKey) {
  const user = ensureUser(userId)
  const key = normalizeItemKey(itemKey)
  if (!user || !key) return 0
  return Math.max(0, Math.floor(Number(user.items[key]) || 0))
}

function setItemQuantity(userId, itemKey, quantity) {
  const user = ensureUser(userId)
  const key = normalizeItemKey(itemKey)
  if (!user || !key) return 0
  const next = Math.max(0, Math.floor(Number(quantity) || 0))
  if (next <= 0) {
    delete user.items[key]
  } else {
    user.items[key] = next
  }
  touchUser(user)
  saveEconomy()
  return next
}

function buildItemEffectsDeps() {
  return {
    ensureUser,
    touchUser,
    saveEconomy,
    getItemQuantity,
    removeItem,
    creditCoins,
    normalizeItemKey,
    getItemDefinition,
  }
}

function applyCooldownReducer(userId, reductionMs) {
  return applyCooldownReducerEngine(buildItemEffectsDeps(), userId, reductionMs)
}

function isXpBoosterActive(userId) {
  return isXpBoosterActiveEngine(buildItemEffectsDeps(), userId)
}

function consumeQuestRewardMultiplier(userId) {
  return consumeQuestRewardMultiplierEngine(buildItemEffectsDeps(), userId)
}

function consumeClaimMultiplier(userId, source = "") {
  return consumeClaimMultiplierEngine(buildItemEffectsDeps(), userId, source)
}

function getTeamContributionMultiplier(userId) {
  const base = getTeamContributionMultiplierEngine(buildItemEffectsDeps(), userId)
  if (getItemQuantity(userId, "seloLendario") > 0) {
    return Number((base * 1.25).toFixed(2))
  }
  return base
}

function consumeStreakSaver(userId) {
  return consumeStreakSaverEngine(buildItemEffectsDeps(), userId)
}

function applySalvageInsurance(userId, lostAmount = 0, options = {}) {
  return applySalvageInsuranceEngine(buildItemEffectsDeps(), userId, lostAmount, options)
}

function useItem(userId, itemKey) {
  return useItemEngine(buildItemEffectsDeps(), userId, itemKey)
}

function grantKronosBenefits(userId, itemKey = KRONOS_QUEBRADA_ITEM_ID, quantity = 1) {
  const user = ensureUser(userId)
  const qty = Math.max(1, Math.floor(Number(quantity) || 1))
  const normalizedItemKey = normalizeItemKey(itemKey)
  const def = getItemDefinition(normalizedItemKey)
  if (!user || !def) return
  
  const now = Date.now()
  
  if (normalizedItemKey === KRONOS_VERDADEIRA_ITEM_ID) {
    // Coroa Kronos Verdadeira é permanente
    user.buffs.kronosVerdadeiraActive = true
    touchUser(user)
    saveEconomy()
  } else {
    // Coroa Kronos Quebrada tem duração temporária
    const currentEnd = Math.max(Number(user.buffs.kronosExpiresAt) || 0, now)
    user.buffs.kronosExpiresAt = currentEnd + (def.durationMs * qty)
    touchUser(user)
    saveEconomy()
  }
}

function syncKronosStateFromInventory(userId) {
  const user = ensureUser(userId)
  if (!user) return

  const hasPermanentCrown = getItemQuantity(userId, KRONOS_VERDADEIRA_ITEM_ID) > 0
  if (!hasPermanentCrown) {
    user.buffs.kronosVerdadeiraActive = false
    user.progression.permanentCrown = false
  } else {
    user.buffs.kronosVerdadeiraActive = true
    user.progression.permanentCrown = true
  }

  const now = Date.now()
  const hasBrokenCrown = getItemQuantity(userId, KRONOS_QUEBRADA_ITEM_ID) > 0
  if (!hasBrokenCrown && (Number(user.buffs.kronosExpiresAt) || 0) > now) {
    user.buffs.kronosExpiresAt = now
  }

  if (!hasPermanentCrown && (Number(user.buffs.kronosExpiresAt) || 0) <= now) {
    user.buffs.kronosTempShields = 0
    user.buffs.kronosTempShieldDayKey = null
  }

  touchUser(user)
  saveEconomy()
}

function removeKronosDuration(userId, itemKey = KRONOS_QUEBRADA_ITEM_ID, quantity = 1) {
  const user = ensureUser(userId)
  const qty = Math.max(1, Math.floor(Number(quantity) || 1))
  const normalizedItemKey = normalizeItemKey(itemKey)
  const def = getItemDefinition(normalizedItemKey)
  if (!user || !def) return
  
  if (normalizedItemKey === KRONOS_VERDADEIRA_ITEM_ID) {
    // Não pode remover Coroa Kronos Verdadeira (é permanente)
    return
  }
  
  const now = Date.now()
  const currentEnd = Math.max(Number(user.buffs.kronosExpiresAt) || 0, now)
  user.buffs.kronosExpiresAt = Math.max(now, currentEnd - (def.durationMs * qty))
  touchUser(user)
  saveEconomy()
}

function addItem(userId, itemKey, quantity = 1) {
  const key = normalizeItemKey(itemKey)
  const qty = capPositiveInt(quantity, MAX_ITEM_OPERATION, 0)
  if (!key || qty <= 0) return 0
  const current = getItemQuantity(userId, key)
  const next = setItemQuantity(userId, key, Math.min(MAX_ITEM_STACK, current + qty))
  if (key === KRONOS_QUEBRADA_ITEM_ID) {
    const applied = Math.max(0, next - current)
    if (applied > 0) grantKronosBenefits(userId, KRONOS_QUEBRADA_ITEM_ID, applied)
  } else if (key === KRONOS_VERDADEIRA_ITEM_ID) {
    const applied = Math.max(0, next - current)
    if (applied > 0) grantKronosBenefits(userId, KRONOS_VERDADEIRA_ITEM_ID, applied)
  }
  return next
}

function removeItem(userId, itemKey, quantity = 1) {
  const key = normalizeItemKey(itemKey)
  const qty = capPositiveInt(quantity, MAX_ITEM_OPERATION, 0)
  if (!key || qty <= 0) return 0
  const current = getItemQuantity(userId, key)
  const next = Math.max(0, current - qty)
  setItemQuantity(userId, key, next)
  if (key === KRONOS_QUEBRADA_ITEM_ID) {
    removeKronosDuration(userId, KRONOS_QUEBRADA_ITEM_ID, Math.min(current, qty))
  } else if (key === KRONOS_VERDADEIRA_ITEM_ID) {
    syncKronosStateFromInventory(userId)
  }
  if (key === KRONOS_QUEBRADA_ITEM_ID) {
    syncKronosStateFromInventory(userId)
  }
  return next
}

function getShields(userId) {
  refreshKronosTemporaryShields(userId)
  const user = ensureUser(userId)
  if (!user) return 0
  const permanentShields = getItemQuantity(userId, "escudo")
  const temporaryShields = Math.max(0, Math.floor(Number(user.buffs.kronosTempShields) || 0))
  return permanentShields + temporaryShields
}

function addShields(userId, quantity = 1) {
  return addItem(userId, "escudo", quantity)
}

function consumeShield(userId) {
  refreshKronosTemporaryShields(userId)
  const user = ensureUser(userId)
  if (!user) return false

  const weekKey = getWeekKey()
  if (getItemQuantity(userId, "espelhoDeLuz") > 0 && user.buffs.espelhoDeLuzWeekKey !== weekKey) {
    user.buffs.espelhoDeLuzWeekKey = weekKey
    touchUser(user)
    saveEconomy()
    return true
  }

  const dayKey = getDayKey()
  if (getItemQuantity(userId, "coracaoOssificado") > 0 && user.buffs.coracaoOssificadoDayKey !== dayKey) {
    user.buffs.coracaoOssificadoDayKey = dayKey
    touchUser(user)
    saveEconomy()
    return true
  }

  const temporaryShields = Math.max(0, Math.floor(Number(user.buffs.kronosTempShields) || 0))
  if (temporaryShields > 0) {
    user.buffs.kronosTempShields = temporaryShields - 1
    touchUser(user)
    saveEconomy()
    incrementStat(userId, "shieldsUsed", 1)
    return true
  }

  if (getItemQuantity(userId, "escudo") > 0) {
    removeItem(userId, "escudo", 1)
    incrementStat(userId, "shieldsUsed", 1)
    return true
  }

  if (getItemQuantity(userId, "escudoReforcado") > 0) {
    removeItem(userId, "escudoReforcado", 1)
    addItem(userId, "escudo", 3)
    removeItem(userId, "escudo", 1)
    incrementStat(userId, "shieldsUsed", 1)
    return true
  }

  return false
}

function applyCasinoInsurance(userId, lostAmount = 0, options = {}) {
  const threshold = Math.max(1, Math.floor(Number(options?.threshold) || 1))
  const wager = Math.max(0, Math.floor(Number(options?.wager) || lostAmount || 0))
  if (wager < threshold) {
    return { ok: false, activated: false, reason: "below-threshold", refunded: 0 }
  }

  const available = getItemQuantity(userId, "casinoInsurance")
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

  removeItem(userId, "casinoInsurance", 1)
  const credited = creditCoins(userId, refund, {
    type: "casino-insurance-refund",
    details: "Seguro de cassino ativado",
    meta: {
      wager,
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

function applyWorkSafetyToken(userId, lostAmount = 0, options = {}) {
  const available = getItemQuantity(userId, "workSafetyToken")
  if (available <= 0) {
    return { ok: false, activated: false, reason: "no-token", refunded: 0, compensation: 0 }
  }

  const loss = Math.max(0, Math.floor(Number(lostAmount) || 0))
  const referenceAmount = Math.max(0, Math.floor(Number(options?.referenceAmount) || 0))
  const fallbackCompensation = Math.max(0, Math.floor(Number(options?.fallbackCompensation) || 0))
  const workType = String(options?.workType || "unknown")

  let credited = 0
  let mode = "none"
  if (loss > 0) {
    const refund = Math.max(0, Math.floor(loss * 0.4))
    if (refund > 0) {
      credited = creditCoins(userId, refund, {
        type: "work-safety-refund",
        details: `Seguro de trabalho ativado (${workType})`,
        meta: { loss, workType },
      })
      mode = "refund"
    }
  } else if (referenceAmount > 0 || fallbackCompensation > 0) {
    const compensation = referenceAmount > 0
      ? Math.max(0, Math.floor(referenceAmount * 0.4))
      : fallbackCompensation
    credited = creditCoins(userId, compensation, {
      type: "work-safety-compensation",
      details: `Compensação por falha de trabalho (${workType})`,
      meta: { workType, referenceAmount },
    })
    mode = "compensation"
  }

  if (credited <= 0) {
    return { ok: false, activated: false, reason: "zero-credit", refunded: 0, compensation: 0 }
  }

  removeItem(userId, "workSafetyToken", 1)
  return {
    ok: true,
    activated: true,
    mode,
    consumed: 1,
    refunded: mode === "refund" ? credited : 0,
    compensation: mode === "compensation" ? credited : 0,
  }
}

function buyShield(userId) {
  return buyItem(userId, "escudo", 1, userId).ok
}

function hasActiveKronos(userId) {
  const user = ensureUser(userId)
  if (!user) return false
  
  // Verifica Coroa Kronos Verdadeira (permanente)
  if (user.buffs.kronosVerdadeiraActive) {
    return true
  }
  
  // Verifica Coroa Kronos Quebrada (temporária)
  const expiresAt = Number(user.buffs.kronosExpiresAt) || 0
  return expiresAt > Date.now()
}

function refreshKronosTemporaryShields(userId) {
  const user = ensureUser(userId)
  if (!user) return

  const expiresAt = Number(user.buffs.kronosExpiresAt) || 0
  const kronosQuebradaActive = expiresAt > Date.now()
  const kronosVerdadeiraActive = Boolean(user.buffs.kronosVerdadeiraActive)
  const kronosActive = kronosQuebradaActive || kronosVerdadeiraActive
  const dayKey = getDayKey()

  if (!kronosActive) {
    if ((Number(user.buffs.kronosTempShields) || 0) > 0 || user.buffs.kronosTempShieldDayKey !== null) {
      user.buffs.kronosTempShields = 0
      user.buffs.kronosTempShieldDayKey = null
      touchUser(user)
      saveEconomy()
    }
    return
  }

  if (user.buffs.kronosTempShieldDayKey !== dayKey) {
    user.buffs.kronosTempShieldDayKey = dayKey
    user.buffs.kronosTempShields = 2
    touchUser(user)
    saveEconomy()
  }
}

function applyKronosGainMultiplier(userId, amount, type = "generic") {
  const base = Math.max(0, Math.floor(Number(amount) || 0))
  if (base <= 0) return 0
  let withItems = base
  if (getItemQuantity(userId, "moedaDaSorte") > 0) withItems = Math.floor(withItems * 1.05)
  if (getItemQuantity(userId, "tesouroLendario") > 0) withItems = Math.floor(withItems * 1.15)
  if (type === "daily" && getItemQuantity(userId, "tesouroClassico") > 0) withItems = Math.floor(withItems * 1.12)
  if (type === "daily" && getItemQuantity(userId, "coracaoDoUniverso") > 0) withItems = Math.floor(withItems * 1.4)
  if (type === "work" && getItemQuantity(userId, "boosterDeMoedas") > 0) withItems = Math.floor(withItems * 1.25)
  if (type === "casino" && getItemQuantity(userId, "cristalDeAmplificacao") > 0) withItems = Math.floor(withItems * 1.12)
  if (type === "steal" && getItemQuantity(userId, "reliquiaEsquecida") > 0) withItems = Math.floor(withItems * 1.1)

  if (!hasActiveKronos(userId)) return withItems
  if (type === "daily") return Math.floor(withItems * 1.1)
  if (type === "casino" || type === "steal" || type === "work") return Math.floor(withItems * 1.3)
  return withItems
}

function getXpItemMultiplier(userId) {
  let multiplier = 1
  if (getItemQuantity(userId, "artefatoAntigo") > 0) multiplier *= 1.1
  if (getItemQuantity(userId, "marcaEterna") > 0) multiplier *= 1.06
  return Number(multiplier.toFixed(4))
}

function getStealSuccessChance(victimId, thiefId = "") {
  return getStealSuccessChanceEngine(buildStealDeps(), victimId, thiefId)
}

function canAttemptSteal(thiefId, victimId) {
  return canAttemptStealEngine(buildStealDeps(), thiefId, victimId)
}

function buildStealDeps() {
  return {
    ensureUser,
    getDayKey,
    normalizeUserId,
    touchUser,
    saveEconomy,
    hasActiveKronos,
    getCoins,
    consumeShield,
    getItemQuantity,
    debitCoinsFlexible,
    creditCoins,
    incrementStat,
    applyKronosGainMultiplier,
  }
}

function buyItem(buyerId, itemKey, quantity = 1, recipientId = buyerId) {
  const item = getItemDefinition(itemKey)
  const qty = Math.floor(Number(quantity) || 0)
  if (!item || qty <= 0) {
    return { ok: false, reason: "invalid-item" }
  }

  if (qty > MAX_ITEM_OPERATION) {
    return { ok: false, reason: "quantity-too-large", maxQuantity: MAX_ITEM_OPERATION }
  }

  const recipientCurrent = getItemQuantity(recipientId, item.key)
  if (recipientCurrent + qty > MAX_ITEM_STACK) {
    return {
      ok: false,
      reason: "stack-limit",
      maxStack: MAX_ITEM_STACK,
      current: recipientCurrent,
    }
  }

  if (item.buyable === false) {
    return { ok: false, reason: "not-for-sale" }
  }

  let totalCost = item.price * qty
  let couponDiscount = 0
  let appliedCoupon = null

  // Check for active coupon in buyer's progression
  const normalizedBuyerId = normalizeUserId(buyerId)
  const user = normalizedBuyerId ? economyCache.users?.[normalizedBuyerId] : null
  if (user?.progression?.activeCoupon) {
    const coupon = user.progression.activeCoupon
    couponDiscount = Math.floor(totalCost * (coupon.percentage / 100))
    totalCost = totalCost - couponDiscount
    appliedCoupon = coupon.couponKey
    // Clear the active coupon after use
    delete user.progression.activeCoupon
  }

  if (!debitCoins(buyerId, totalCost, {
    type: "buy",
    details: `Compra de ${qty}x ${item.key}${appliedCoupon ? ` (cupom: -${couponDiscount} moedas)` : ""}`,
    meta: { 
      item: item.key, 
      quantity: qty, 
      recipientId: normalizeUserId(recipientId),
      couponDiscount,
      appliedCoupon,
    },
  })) {
    return { ok: false, reason: "insufficient-funds", totalCost }
  }

  addItem(recipientId, item.key, qty)
  incrementStat(buyerId, "itemsBought", qty)
  if (normalizeUserId(recipientId) !== normalizeUserId(buyerId)) {
    pushTransaction(recipientId, {
      type: "buy-received",
      deltaCoins: 0,
      details: `Recebeu ${qty}x ${item.key} via compra de ${normalizeUserId(buyerId)}`,
      meta: { buyer: normalizeUserId(buyerId), item: item.key, quantity: qty },
    })
  }
  telemetry.incrementCounter("economy.item.buy", qty, {
    item: item.key,
    hasCoupon: appliedCoupon ? 1 : 0,
  })
  telemetry.appendEvent("economy.item.buy", {
    buyerId: normalizeUserId(buyerId),
    recipientId: normalizeUserId(recipientId),
    item: item.key,
    quantity: qty,
    totalCost,
    couponDiscount,
    appliedCoupon,
  })
  return { ok: true, totalCost, itemKey: item.key, quantity: qty, couponDiscount, appliedCoupon }
}

function sellItem(userId, itemKey, quantity = 1) {
  const item = getItemDefinition(itemKey)
  const qty = Math.floor(Number(quantity) || 0)
  if (!item || qty <= 0) return { ok: false, reason: "invalid-item" }

  if (qty > MAX_ITEM_OPERATION) {
    return { ok: false, reason: "quantity-too-large", maxQuantity: MAX_ITEM_OPERATION }
  }

  const available = getItemQuantity(userId, item.key)
  if (available < qty) return { ok: false, reason: "insufficient-items", available }

  removeItem(userId, item.key, qty)
  const valuePerUnit = Math.floor(item.price * (Number(item.sellRate) || 0.8))
  const total = valuePerUnit * qty
  creditCoins(userId, total, {
    type: "sell",
    details: `Venda de ${qty}x ${item.key}`,
    meta: { item: item.key, quantity: qty },
  })
  telemetry.incrementCounter("economy.item.sell", qty, {
    item: item.key,
  })
  telemetry.appendEvent("economy.item.sell", {
    userId: normalizeUserId(userId),
    item: item.key,
    quantity: qty,
    total,
  })
  return { ok: true, total, quantity: qty, itemKey: item.key }
}

function transferCoins(fromUserId, toUserId, amount) {
  const parsedAmount = Math.floor(Number(amount) || 0)
  if (parsedAmount <= 0) return { ok: false, reason: "invalid-amount" }
  if (parsedAmount > MAX_COIN_OPERATION) {
    return { ok: false, reason: "amount-too-large", maxAmount: MAX_COIN_OPERATION }
  }

  const receiverCoins = getCoins(toUserId)
  const room = Math.max(0, MAX_COINS_BALANCE - receiverCoins)
  if (room <= 0) {
    return { ok: false, reason: "receiver-max-balance", maxBalance: MAX_COINS_BALANCE }
  }

  const effectiveAmount = Math.min(parsedAmount, room)
  if (effectiveAmount <= 0) {
    return { ok: false, reason: "receiver-max-balance", maxBalance: MAX_COINS_BALANCE }
  }

  if (!debitCoins(fromUserId, effectiveAmount, {
    type: "donate-out",
    details: `Doação para ${normalizeUserId(toUserId)}`,
    meta: { to: normalizeUserId(toUserId) },
  })) return { ok: false, reason: "insufficient-funds" }
  creditCoins(toUserId, effectiveAmount, {
    type: "donate-in",
    details: `Recebido de ${normalizeUserId(fromUserId)}`,
    meta: { from: normalizeUserId(fromUserId) },
  })
  telemetry.incrementCounter("economy.coins.transfer", effectiveAmount)
  telemetry.appendEvent("economy.coins.transfer", {
    fromUserId: normalizeUserId(fromUserId),
    toUserId: normalizeUserId(toUserId),
    amount: effectiveAmount,
  })
  return { ok: true, amount: effectiveAmount }
}

function transferItem(fromUserId, toUserId, itemKey, quantity = 1) {
  const item = getItemDefinition(itemKey)
  const qty = Math.floor(Number(quantity) || 0)
  if (!item || qty <= 0) return { ok: false, reason: "invalid-item" }

  if (qty > MAX_ITEM_OPERATION) {
    return { ok: false, reason: "quantity-too-large", maxQuantity: MAX_ITEM_OPERATION }
  }

  const receiverCurrent = getItemQuantity(toUserId, item.key)
  if (receiverCurrent + qty > MAX_ITEM_STACK) {
    return {
      ok: false,
      reason: "stack-limit",
      maxStack: MAX_ITEM_STACK,
      current: receiverCurrent,
    }
  }

  const available = getItemQuantity(fromUserId, item.key)
  if (available < qty) return { ok: false, reason: "insufficient-items", available }

  removeItem(fromUserId, item.key, qty)
  addItem(toUserId, item.key, qty)
  pushTransaction(fromUserId, {
    type: "donate-item-out",
    deltaCoins: 0,
    details: `Doou ${qty}x ${item.key} para ${normalizeUserId(toUserId)}`,
    meta: { to: normalizeUserId(toUserId), item: item.key, quantity: qty },
  })
  pushTransaction(toUserId, {
    type: "donate-item-in",
    deltaCoins: 0,
    details: `Recebeu ${qty}x ${item.key} de ${normalizeUserId(fromUserId)}`,
    meta: { from: normalizeUserId(fromUserId), item: item.key, quantity: qty },
  })
  telemetry.incrementCounter("economy.item.transfer", qty, {
    item: item.key,
  })
  telemetry.appendEvent("economy.item.transfer", {
    fromUserId: normalizeUserId(fromUserId),
    toUserId: normalizeUserId(toUserId),
    item: item.key,
    quantity: qty,
  })
  return { ok: true, itemKey: item.key, quantity: qty }
}

function attemptSteal(thiefId, victimId, requestedAmount = 0, options = {}) {
  return attemptStealEngine(buildStealDeps(), thiefId, victimId, requestedAmount, options)
}

function claimDaily(userId, baseAmount = 100) {
  const user = ensureUser(userId)
  const base = Math.max(0, Math.floor(Number(baseAmount) || 0))
  if (!user || base <= 0) return { ok: false, reason: "invalid" }

  const dayKey = getDayKey()
  if (user.cooldowns.dailyClaimKey === dayKey) {
    return { ok: false, reason: "already-claimed", dayKey }
  }

  const finalAmount = applyKronosGainMultiplier(userId, base, "daily")
  user.cooldowns.dailyClaimKey = dayKey
  touchUser(user)
  saveEconomy()
  creditCoins(userId, finalAmount, {
    type: "daily",
    details: "Resgate diário",
    meta: { dayKey },
  })
  incrementStat(userId, "dailyClaimCount", 1)

  return {
    ok: true,
    amount: finalAmount,
    dayKey,
    kronosBonus: finalAmount > base,
  }
}

const _attemptSteal = attemptSteal
attemptSteal = function wrappedAttemptSteal(thiefId, victimId, requestedAmount = 0) {
  const startedAt = Date.now()
  const result = _attemptSteal(thiefId, victimId, requestedAmount)
  const status = result?.ok ? (result.success ? "success" : "failed") : (result?.reason || "rejected")
  telemetry.incrementCounter("economy.steal.attempt", 1, { status })
  telemetry.observeDuration("economy.steal.latency", Date.now() - startedAt, { status })
  telemetry.appendEvent("economy.steal", {
    thiefId: normalizeUserId(thiefId),
    victimId: normalizeUserId(victimId),
    status,
    gained: result?.gained || 0,
    lost: result?.lost || 0,
    reason: result?.reason || null,
  })
  return result
}

const _claimDaily = claimDaily
claimDaily = function wrappedClaimDaily(userId, baseAmount = 100) {
  const result = _claimDaily(userId, baseAmount)
  telemetry.incrementCounter("economy.daily.claim", 1, {
    status: result?.ok ? "ok" : (result?.reason || "rejected"),
  })
  if (result?.ok) {
    telemetry.appendEvent("economy.daily.claimed", {
      userId: normalizeUserId(userId),
      amount: result.amount,
      kronosBonus: Boolean(result.kronosBonus),
    })
  }
  return result
}

function claimCarePackage(userId) {
  const user = ensureUser(userId)
  if (!user) return { ok: false, reason: "invalid-user" }

  // TODO: Check for season start date (must be at least 3 days into the season)
  // This is blocked by the lack of a season management system.

  const coins = getCoins(userId)
  if (coins > 500) {
    return { ok: false, reason: "ineligible-coins", coins }
  }

  const SEVEN_DAYS_MS = 7 * DAY_MS
  const lastClaimedAt = Number(user.cooldowns.carePackageLastClaimedAt) || 0
  const remainingMs = (lastClaimedAt + SEVEN_DAYS_MS) - Date.now()
  if (remainingMs > 0) {
    return { ok: false, reason: "cooldown", remainingMs }
  }

  const coinsReward = 300
  const shieldsReward = 2

  creditCoins(userId, coinsReward, {
    type: "care-package",
    details: "Resgate de pacote de ajuda",
  })
  addShields(userId, shieldsReward)

  user.cooldowns.carePackageLastClaimedAt = Date.now()
  touchUser(user)
  saveEconomy()

  telemetry.incrementCounter("economy.carepackage.claim", 1)
  telemetry.appendEvent("economy.carepackage.claim", {
    userId: normalizeUserId(userId),
    coins: coinsReward,
    shields: shieldsReward,
  })

  return { ok: true, coins: coinsReward, shields: shieldsReward }
}

function getAllUsersSortedByCoins() {
  return Object.keys(economyCache.users)
    .map((userId) => ({ userId, coins: getCoins(userId) }))
    .sort((a, b) => (b.coins - a.coins) || a.userId.localeCompare(b.userId))
}

function getAllUserIds() {
  return Object.keys(economyCache.users)
}

function getAllUsersSortedByXp() {
  return Object.keys(economyCache.users)
    .map((userId) => {
      const profile = getXpProfile(userId)
      return {
        userId,
        level: Math.max(1, Math.floor(Number(profile?.level) || 1)),
        xp: Math.max(0, Math.floor(Number(profile?.xp) || 0)),
        xpToNextLevel: Math.max(1, Math.floor(Number(profile?.xpToNextLevel) || getXpRequiredForLevel(1))),
        seasonPoints: Math.max(0, Math.floor(Number(profile?.seasonPoints) || 0)),
      }
    })
    .sort((a, b) => {
      if (b.level !== a.level) return b.level - a.level
      if (b.xp !== a.xp) return b.xp - a.xp
      if (b.seasonPoints !== a.seasonPoints) return b.seasonPoints - a.seasonPoints
      return a.userId.localeCompare(b.userId)
    })
}

function getGlobalRanking(limit = 10) {
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 10))
  return getAllUsersSortedByCoins().slice(0, safeLimit)
}

function getUserGlobalPosition(userId) {
  const normalized = normalizeUserId(userId)
  const ranking = getAllUsersSortedByCoins()
  const idx = ranking.findIndex((entry) => entry.userId === normalized)
  return idx >= 0 ? idx + 1 : null
}

function getGroupRanking(memberIds = [], limit = 10) {
  const members = new Set((memberIds || []).map((id) => normalizeUserId(id)).filter(Boolean))
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 10))
  return getAllUsersSortedByCoins()
    .filter((entry) => members.has(entry.userId))
    .slice(0, safeLimit)
}

function getGlobalXpRanking(limit = 10) {
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 10))
  return getAllUsersSortedByXp().slice(0, safeLimit)
}

function getGroupXpRanking(memberIds = [], limit = 10) {
  const members = new Set((memberIds || []).map((id) => normalizeUserId(id)).filter(Boolean))
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 10))
  return getAllUsersSortedByXp()
    .filter((entry) => members.has(entry.userId))
    .slice(0, safeLimit)
}

function getUserGlobalXpPosition(userId) {
  const normalized = normalizeUserId(userId)
  const ranking = getAllUsersSortedByXp()
  const idx = ranking.findIndex((entry) => entry.userId === normalized)
  return idx >= 0 ? idx + 1 : null
}

function getItemCatalog() {
  return Object.values(ITEM_DEFINITIONS).map((item) => ({ ...item }))
}

function getShopIndexText() {
  const lines = ["Loja (ID do item)"]
  const catalog = getItemCatalog().filter((item) => item.buyable !== false)
  catalog.forEach((item, idx) => {
    lines.push(`${idx + 1}. ${item.name} (ID ${item.key}) - ${item.price} Epsteincoins`)
  })
  lines.push("")
  lines.push("Compre com: !comprar <id|nome> [quantidade]")
  lines.push("Compre para outro: !comprarpara @usuario <item> [quantidade]")
  return lines.join("\n")
}

function getProfile(userId) {
  const user = ensureUser(userId)
  if (!user) {
    return {
      coins: DEFAULT_COINS,
      shields: 0,
      items: {},
      buffs: {
        kronosActive: false,
        kronosExpiresAt: 0,
      },
    }
  }

  return {
    coins: getCoins(userId),
    shields: getShields(userId),
    items: { ...user.items },
    buffs: {
      kronosActive: hasActiveKronos(userId),
      kronosExpiresAt: Number(user.buffs?.kronosExpiresAt) || 0,
      kronosVerdadeiraActive: Boolean(user.buffs?.kronosVerdadeiraActive),
    },
    cooldowns: { ...user.cooldowns },
    stats: { ...user.stats },
    preferences: { ...user.preferences },
    progression: {
      level: Math.max(1, Math.floor(Number(user.progression?.level) || 1)),
      xp: Math.max(0, Math.floor(Number(user.progression?.xp) || 0)),
      xpToNextLevel: getXpRequiredForLevel(Math.max(1, Math.floor(Number(user.progression?.level) || 1))),
      seasonPoints: Math.max(0, Math.floor(Number(user.progression?.seasonPoints) || 0)),
      teamId: typeof user.progression?.teamId === "string" ? user.progression.teamId : null,
      permanentCrown: Boolean(user.progression?.permanentCrown),
      season: {
        startDate: Math.max(0, Math.floor(Number(user.progression?.season?.startDate) || 0)),
        endDate: Math.max(0, Math.floor(Number(user.progression?.season?.endDate) || 0)),
        coinsAtReset: Math.max(0, Math.floor(Number(user.progression?.season?.coinsAtReset) || 0)),
        itemsAtReset: user.progression?.season?.itemsAtReset && typeof user.progression.season.itemsAtReset === "object"
          ? { ...user.progression.season.itemsAtReset }
          : {},
        xpAtReset: Math.max(0, Math.floor(Number(user.progression?.season?.xpAtReset) || 0)),
      },
      lastTradeByBracket: user.progression?.lastTradeByBracket && typeof user.progression.lastTradeByBracket === "object"
        ? { ...user.progression.lastTradeByBracket }
        : { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    },
  }
}

function getStatValue(user, key) {
  if (!user || typeof user !== "object") return 0
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

function ensureDailyQuestsForUser(userId, dayKey = getDayKey()) {
  const user = ensureUser(userId)
  if (!user) return []

  const currentDayKey = String(dayKey || getDayKey())
  if (user.progression.lastQuestDayKey === currentDayKey && Array.isArray(user.progression.dailyQuests) && user.progression.dailyQuests.length > 0) {
    return user.progression.dailyQuests
  }

  const seed = `${normalizeUserId(userId)}:${currentDayKey}`
  const used = new Set()
  const quests = []
  for (let i = 0; i < DAILY_QUEST_COUNT; i++) {
    let pickIndex = stableHash(`${seed}:pick:${i}`) % DAILY_QUEST_POOL.length
    while (used.has(pickIndex)) {
      pickIndex = (pickIndex + 1) % DAILY_QUEST_POOL.length
    }
    used.add(pickIndex)

    const template = DAILY_QUEST_POOL[pickIndex]
    const targetRange = Math.max(1, template.targetMax - template.targetMin + 1)
    const target = template.targetMin + (stableHash(`${seed}:target:${i}`) % targetRange)
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
  touchUser(user)
  saveEconomy()
  return quests
}

function getDailyQuestState(userId, dayKey = getDayKey()) {
  const user = ensureUser(userId)
  if (!user) return { dayKey, quests: [] }
  const quests = ensureDailyQuestsForUser(userId, dayKey)
  return {
    dayKey,
    quests: quests.map((quest) => buildQuestProgress(user, quest)),
  }
}

function addXp(userId, amount = 0, meta = {}) {
  const user = ensureUser(userId)
  const baseAmount = Math.max(0, Math.floor(Number(amount) || 0))
  const itemMultiplier = getXpItemMultiplier(userId)
  const xpBoosterMultiplier = isXpBoosterActive(userId) ? 1.15 : 1
  const parsedAmount = Math.max(0, Math.floor(baseAmount * itemMultiplier * xpBoosterMultiplier))
  if (!user || parsedAmount <= 0) {
    return {
      ok: false,
      reason: "invalid-amount",
      granted: 0,
      level: Math.max(1, Math.floor(Number(user?.progression?.level) || 1)),
      xp: Math.max(0, Math.floor(Number(user?.progression?.xp) || 0)),
      xpToNextLevel: getXpRequiredForLevel(Math.max(1, Math.floor(Number(user?.progression?.level) || 1))),
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
  let required = getXpRequiredForLevel(user.progression.level)
  while (user.progression.xp >= required) {
    user.progression.xp -= required
    user.progression.level += 1
    levelsGained += 1

    const milestoneReward = getLevelMilestoneReward(user.progression.level)
    if (milestoneReward) {
      const grantedCoins = creditCoins(userId, milestoneReward.coins, {
        type: "xp-level-reward",
        details: `Recompensa de nível ${milestoneReward.level}`,
        meta: {
          level: milestoneReward.level,
          source: String(meta?.source || "xp"),
        },
      })

      const grantedItems = []
      for (const item of (milestoneReward.items || [])) {
        const key = normalizeItemKey(item?.key)
        const qty = capPositiveInt(item?.quantity, MAX_ITEM_OPERATION, 0)
        if (!key || qty <= 0) continue
        const before = getItemQuantity(userId, key)
        const after = addItem(userId, key, qty)
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

    if (user.progression.level >= MAX_LEVEL) {
      // Always grant a permanent Kronos Crown at level 100 (doesn't stack effects due to stackable: false flag)
      const before = getItemQuantity(userId, "kronosVerdadeira")
      const after = addItem(userId, "kronosVerdadeira", 1)
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

    required = getXpRequiredForLevel(user.progression.level)
  }

  touchUser(user)
  saveEconomy()
  telemetry.incrementCounter("economy.xp.granted", parsedAmount, {
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

function getXpProfile(userId) {
  const user = ensureUser(userId)
  if (!user) {
    return {
      level: 1,
      xp: 0,
      xpToNextLevel: getXpRequiredForLevel(1),
      seasonPoints: 0,
    }
  }
  const level = Math.max(1, Math.floor(Number(user.progression?.level) || 1))
  const xp = Math.max(0, Math.floor(Number(user.progression?.xp) || 0))
  return {
    level,
    xp,
    xpToNextLevel: getXpRequiredForLevel(level),
    seasonPoints: Math.max(0, Math.floor(Number(user.progression?.seasonPoints) || 0)),
  }
}

function getSeasonState() {
  const state = economyCache.seasonState && typeof economyCache.seasonState === "object"
    ? economyCache.seasonState
    : buildDefaultSeasonState()
  return {
    currentSeason: Math.max(1, Math.floor(Number(state.currentSeason) || 1)),
    startDate: Math.max(0, Math.floor(Number(state.startDate) || 0)),
    endDate: Math.max(0, Math.floor(Number(state.endDate) || 0)),
    resetPolicy: state.resetPolicy === "hard" ? "hard" : "soft",
  }
}

function setSeasonState(nextState = {}) {
  const current = getSeasonState()
  const normalized = {
    currentSeason: Number.isFinite(nextState.currentSeason) && nextState.currentSeason > 0
      ? Math.floor(nextState.currentSeason)
      : current.currentSeason,
    startDate: Number.isFinite(nextState.startDate) && nextState.startDate > 0
      ? Math.floor(nextState.startDate)
      : current.startDate,
    endDate: Number.isFinite(nextState.endDate) && nextState.endDate > 0
      ? Math.floor(nextState.endDate)
      : current.endDate,
    resetPolicy: nextState.resetPolicy === "hard" ? "hard" : "soft",
  }
  economyCache.seasonState = normalized
  saveEconomy()
  return { ...normalized }
}

function getLevelThresholds() {
  return [...levelThresholds]
}

function claimDailyQuest(userId, questId = "") {
  return claimDailyQuestEngine(buildProgressionDeps(), userId, questId)
}

function getWeeklyQuestState(userId, weekKey = getWeekKey()) {
  return getWeeklyQuestStateEngine(buildProgressionDeps(), userId, weekKey)
}

function claimWeeklyQuest(userId, questId = "") {
  return claimWeeklyQuestEngine(buildProgressionDeps(), userId, questId)
}

function getStablePublicLabel(userId = "") {
  const normalized = normalizeUserId(userId)
  const user = ensureUser(normalized)
  const custom = String(user?.preferences?.publicLabel || "").trim()
  if (custom) return custom
  const userPart = normalized.split("@")[0] || normalized || "anon"
  const suffix = userPart.slice(-4).toUpperCase().padStart(4, "0")
  return `USR-${suffix}`
}

function isMentionOptIn(userId = "") {
  const user = ensureUser(userId)
  return Boolean(user?.preferences?.mentionOptIn)
}

function setMentionOptIn(userId = "", enabled = false) {
  const user = ensureUser(userId)
  if (!user) return false
  user.preferences.mentionOptIn = Boolean(enabled)
  touchUser(user)
  saveEconomy()
  return true
}

function setPublicLabel(userId = "", label = "") {
  const user = ensureUser(userId)
  if (!user) return false
  user.preferences.publicLabel = String(label || "").trim().slice(0, 30)
  touchUser(user)
  saveEconomy()
  return true
}

function findUsersByPublicLabel(label = "") {
  const wanted = String(label || "").trim().toLowerCase()
  if (!wanted) return []

  return Object.keys(economyCache.users)
    .map((userId) => {
      const current = String(economyCache.users?.[userId]?.preferences?.publicLabel || "").trim()
      return {
        userId,
        publicLabel: current,
      }
    })
    .filter((entry) => entry.publicLabel && entry.publicLabel.toLowerCase() === wanted)
    .sort((a, b) => a.userId.localeCompare(b.userId))
}

function incrementStat(userId, key, amount = 1) {
  const user = ensureUser(userId)
  const safeAmount = Math.max(1, Math.floor(Number(amount) || 1))
  if (!user) return 0
  if (!Number.isFinite(user.stats[key])) user.stats[key] = 0
  user.stats[key] = Math.max(0, Math.floor(Number(user.stats[key]) || 0) + safeAmount)
  touchUser(user)
  saveEconomy()
  return user.stats[key]
}

function getStatement(userId, limit = 10) {
  const user = ensureUser(userId)
  if (!user) return []
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 10))
  return (user.transactions || []).slice(-safeLimit).reverse()
}

function openLootbox(userId, quantity = 1, groupMembers = []) {
  return openLootboxEngine({
    userId,
    quantity,
    groupMembers,
    maxLootboxOpenPerCall: MAX_LOOTBOX_OPEN_PER_CALL,
    itemDefinitions: ITEM_DEFINITIONS,
    ensureUser,
    normalizeUserId,
    economyUsers: economyCache.users,
    getItemQuantity,
    removeItem,
    incrementStat,
    addShields,
    addItem,
    buildPunishmentPassKey,
    pickRandomPunishmentType,
    creditCoins,
    debitCoinsFlexible,
    setWorkCooldown,
    touchUser,
    saveEconomy,
    getItemDefinition,
  })
}

function setWorkCooldown(userId, timestamp = Date.now()) {
  const user = ensureUser(userId)
  if (!user) return
  const parsed = Number(timestamp)
  user.cooldowns.workAt = Number.isFinite(parsed) && parsed >= 0
    ? Math.floor(parsed)
    : Date.now()
  touchUser(user)
  saveEconomy()
}

function getWorkCooldown(userId) {
  const user = ensureUser(userId)
  if (!user) return 0
  return Math.floor(Number(user.cooldowns.workAt) || 0)
}

function getWorkCooldownDurationMs(userId) {
  const base = WORK_COOLDOWN_BASE_MS
  if (getItemQuantity(userId, "pedraClimatica") > 0) {
    return Math.floor(base * 0.75)
  }
  return base
}

function setStealCooldown(userId, timestamp = Date.now()) {
  const user = ensureUser(userId)
  if (!user) return
  const parsed = Number(timestamp)
  user.cooldowns.stealAt = Number.isFinite(parsed) && parsed >= 0
    ? Math.floor(parsed)
    : Date.now()
  touchUser(user)
  saveEconomy()
}

function getStealCooldown(userId) {
  const user = ensureUser(userId)
  if (!user) return 0
  return Math.floor(Number(user.cooldowns.stealAt) || 0)
}

function buildForgeDeps() {
  return {
    isValidPunishmentType,
    normalizePassSeverity,
    maxForgeQuantity: MAX_FORGE_QUANTITY,
    buildPunishmentPassKey,
    getItemQuantity,
    debitCoins,
    addItem,
    removeItem,
    pickRandomPunishmentType,
    incrementStat,
  }
}

function forgePunishmentPass(userId, punishmentType, severity = 1, quantity = 1, options = {}) {
  return forgePunishmentPassEngine(buildForgeDeps(), userId, punishmentType, severity, quantity, options)
}

function applyForgedPassTypeChoice(userId, fromType, toType, severity = 1, quantity = 1) {
  return applyForgedPassTypeChoiceEngine(buildForgeDeps(), userId, fromType, toType, severity, quantity)
}

function createPunishmentPassKey(punishmentType, severity = 1) {
  if (!isValidPunishmentType(punishmentType)) return null
  return buildPunishmentPassKey(punishmentType, normalizePassSeverity(severity, 1))
}

// Team system functions
function getTeamProfile(teamId, storage) {
  if (!storage) return null
  const team = storage.getTeam(teamId)
  if (!team) return null
  return {
    teamId: team.teamId,
    name: team.name,
    createdBy: team.createdBy,
    createdAt: team.createdAt,
    memberCount: team.members.length,
    poolCoins: team.poolCoins || 0,
    poolItems: team.poolItems || {},
  }
}

function getTeamStats(teamId, storage) {
  if (!storage) return null
  const team = storage.getTeam(teamId)
  if (!team) return null
  const members = team.members || []
  let totalCoins = 0
  let totalXp = 0
  let totalLevel = 0
  members.forEach(userId => {
    totalCoins += getCoins(userId)
    const profile = getXpProfile(userId)
    totalXp += Math.max(0, profile?.xp || 0)
    totalLevel += Math.max(1, Math.floor(profile?.level || 1))
  })
  return {
    teamId,
    memberCount: members.length,
    totalCoins,
    totalXp,
    totalLevel,
    poolCoins: team.poolCoins || 0,
    poolItems: Object.keys(team.poolItems || {}).length,
  }
}

function getTeamMembers(teamId, storage) {
  if (!storage) return []
  const members = storage.getTeamMembers(teamId)
  return members.map(userId => ({
    userId,
    coins: getCoins(userId),
    level: Math.max(1, Math.floor(getXpProfile(userId)?.level || 1)),
    xp: Math.max(0, getXpProfile(userId)?.xp || 0),
  }))
}

function getTeamPoolCoins(teamId, storage) {
  if (!storage) return 0
  return storage.getTeamPoolCoins(teamId)
}

function getTeamPoolItems(teamId, storage) {
  if (!storage) return {}
  return storage.getTeamPoolItems(teamId)
}

loadEconomy()

module.exports = {
  DEFAULT_COINS,
  ITEM_DEFINITIONS,
  SHIELD_PRICE,
  loadEconomy,
  saveEconomy,
  getCoins,
  setCoins,
  creditCoins,
  debitCoins,
  debitCoinsFlexible,
  normalizeItemKey,
  getItemDefinition,
  getItemCatalog,
  getItemQuantity,
  addItem,
  removeItem,
  useItem,
  getShields,
  addShields,
  consumeShield,
  buyShield,
  buyItem,
  sellItem,
  transferCoins,
  transferItem,
  attemptSteal,
  claimDaily,
  consumeClaimMultiplier,
  getTeamContributionMultiplier,
  consumeStreakSaver,
  applySalvageInsurance,
  applyCasinoInsurance,
  applyWorkSafetyToken,
  applyCooldownReducer,
  claimCarePackage,
  hasActiveKronos,
  isXpBoosterActive,
  applyKronosGainMultiplier,
  getXpItemMultiplier,
  getStealSuccessChance,
  canAttemptSteal,
  getGlobalRanking,
  getAllUserIds,
  getGroupRanking,
  getUserGlobalPosition,
  getGlobalXpRanking,
  getGroupXpRanking,
  getUserGlobalXpPosition,
  getShopIndexText,
  pushTransaction,
  getStatement,
  incrementStat,
  setWorkCooldown,
  getWorkCooldown,
  getWorkCooldownDurationMs,
  setStealCooldown,
  getStealCooldown,
  getProfile,
  getStablePublicLabel,
  isMentionOptIn,
  setMentionOptIn,
  setPublicLabel,
  findUsersByPublicLabel,
  openLootbox,
  forgePunishmentPass,
  applyForgedPassTypeChoice,
  createPunishmentPassKey,
  getOperationLimits,
  deleteUserProfile,
  levelThresholds,
  getLevelThresholds,
  getSeasonState,
  setSeasonState,
  getXpRequiredForLevel,
  getXpProfile,
  addXp,
  getDayKey,
  getWeekKey,
  getDailyQuestState,
  claimDailyQuest,
  getWeeklyQuestState,
  claimWeeklyQuest,
  getTeamProfile,
  getTeamStats,
  getTeamMembers,
  getTeamPoolCoins,
  getTeamPoolItems,
}
