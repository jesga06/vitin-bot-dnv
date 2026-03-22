const test = require("node:test")
const assert = require("node:assert/strict")

const { handleEconomyCommands } = require("../routers/economyRouter")
const { handleGameCommands, handleGameMessageFlow } = require("../routers/gamesRouter")
const { handleUtilityCommands } = require("../routers/utilityRouter")

function createSockCapture() {
  const sent = []
  return {
    sock: {
      user: { id: "bot@s.whatsapp.net" },
      async sendMessage(to, payload) {
        sent.push({ to, payload })
      },
      async groupMetadata() {
        return { participants: [] }
      },
    },
    sent,
  }
}

test("economy router handles !economia command", async () => {
  const { sock, sent } = createSockCapture()

  const handled = await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "user@s.whatsapp.net",
    cmd: "!economia",
    cmdName: "!economia",
    cmdArg1: "",
    cmdArg2: "",
    cmdParts: ["!economia"],
    mentioned: [],
    prefix: "!",
    isGroup: true,
    senderIsAdmin: false,
    jidNormalizedUser: (id) => id,
    storage: {
      getMutedUsers: () => ({}),
      setMutedUsers: () => {},
    },
    economyService: {
      getProfile: () => ({ coins: 0, shields: 0, buffs: {}, inventory: {} }),
      getStatement: () => [],
      getGroupRanking: () => [],
      getShopIndexText: () => "shop",
    },
    parseQuantity: () => 0,
    formatDuration: () => "0m",
    buildGameStatsText: () => "",
    buildEconomyStatsText: () => "",
    buildInventoryText: () => "",
    incrementUserStat: () => {},
  })

  assert.equal(handled, true)
  assert.equal(sent.length, 1)
  assert.match(sent[0].payload.text, /Comandos de economia/)
})

test("economy router handles !extrato for mentioned user", async () => {
  const { sock, sent } = createSockCapture()
  const target = "alvo@s.whatsapp.net"
  let statementUser = null

  const handled = await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "autor@s.whatsapp.net",
    cmd: "!extrato @alvo",
    cmdName: "!extrato",
    cmdArg1: "@alvo",
    cmdArg2: "",
    cmdParts: ["!extrato", "@alvo"],
    mentioned: [target],
    prefix: "!",
    isGroup: true,
    senderIsAdmin: false,
    jidNormalizedUser: (id) => id,
    storage: {
      getMutedUsers: () => ({}),
      setMutedUsers: () => {},
    },
    economyService: {
      getProfile: () => ({ coins: 0, shields: 0, buffs: {}, inventory: {} }),
      getStatement: (userId) => {
        statementUser = userId
        return [{ at: Date.now(), type: "test", deltaCoins: 10, balanceAfter: 20, details: "ok" }]
      },
      getGroupRanking: () => [],
      getShopIndexText: () => "shop",
    },
    parseQuantity: () => 0,
    formatDuration: () => "0m",
    buildGameStatsText: () => "",
    buildEconomyStatsText: () => "",
    buildInventoryText: () => "",
    incrementUserStat: () => {},
  })

  assert.equal(handled, true)
  assert.equal(statementUser, target)
  assert.equal(sent.length, 1)
  assert.match(sent[0].payload.text, /Extrato de @alvo/)
})

test("games router handles !começar with missing lobby id", async () => {
  const { sock, sent } = createSockCapture()

  const handled = await handleGameCommands({
    sock,
    from: "group@g.us",
    sender: "user@s.whatsapp.net",
    cmd: "!começar",
    cmdName: "!começar",
    cmdArg1: "",
    cmdArg2: "",
    mentioned: [],
    prefix: "!",
    isGroup: true,
    text: "!começar",
    msg: { message: {} },
    storage: {
      getGameState: () => null,
      setGameState: () => {},
      clearGameState: () => {},
    },
    gameManager: {
      createOptInSession: () => "ABCD",
      getOptInSession: () => null,
      addPlayerToOptIn: () => false,
      clearOptInSession: () => {},
      optInSessions: {},
    },
    economyService: {
      debitCoinsFlexible: () => 0,
    },
    caraOuCoroa: {
      startDobroOuNada: () => ({}),
      formatDobroStatus: () => "",
    },
    adivinhacao: {
      start: () => ({}),
      recordGuess: () => ({ valid: false, error: "" }),
      getResults: () => ({}),
      formatResults: () => "",
    },
    batataquente: {
      start: () => ({}),
      formatStatus: () => "",
      getLoser: () => "",
      recordPass: () => ({ valid: false, error: "" }),
    },
    dueloDados: {
      start: () => ({}),
      recordRoll: () => ({ valid: false, error: "" }),
      getResults: () => ({}),
      formatResults: () => "",
    },
    roletaRussa: {
      start: () => ({}),
      getCurrentPlayer: () => "",
      takeShotAt: () => ({ hit: false }),
      formatStatus: () => "",
    },
    startPeriodicGame: async () => ({ ok: true }),
    GAME_REWARDS: {
      ADIVINHACAO_EXACT: 60,
      ADIVINHACAO_CLOSEST: 30,
      DADOS_WIN: 35,
      BATATA_WIN: 20,
      ROLETA_WIN: 45,
      ROLETA_WIN_GUARANTEED: 30,
    },
    BASE_GAME_REWARD: 30,
    normalizeUnifiedGameType: () => null,
    normalizeLobbyId: () => "",
    activeGameKey: () => "",
    resolveActiveLobbyForPlayer: () => ({ ok: false, reason: "not-found" }),
    getLobbyCreateBlockMessage: () => null,
    getGameBuyIn: () => 0,
    collectLobbyBuyIn: () => ({ ok: true, pool: 0 }),
    distributeLobbyBuyInPool: async () => {},
    parsePositiveInt: () => 1,
    isResenhaModeEnabled: () => false,
    rewardPlayer: async () => {},
    rewardPlayers: async () => {},
    incrementUserStat: () => {},
    applyRandomGamePunishment: async () => {},
    createPendingTargetForWinner: async () => {},
    jidNormalizedUser: (id) => id,
  })

  assert.equal(handled, true)
  assert.equal(sent.length, 1)
  assert.match(sent[0].payload.text, /Use: !começar/)
})

test("games router handles !jogos submenu", async () => {
  const { sock, sent } = createSockCapture()

  const handled = await handleGameCommands({
    sock,
    from: "group@g.us",
    sender: "user@s.whatsapp.net",
    cmd: "!jogos",
    cmdName: "!jogos",
    cmdArg1: "",
    cmdArg2: "",
    mentioned: [],
    prefix: "!",
    isGroup: true,
    text: "!jogos",
    msg: { message: {} },
    storage: {
      getGameState: () => null,
      setGameState: () => {},
      clearGameState: () => {},
    },
    gameManager: {
      createOptInSession: () => "ABCD",
      getOptInSession: () => null,
      addPlayerToOptIn: () => false,
      clearOptInSession: () => {},
      optInSessions: {},
    },
    economyService: {
      getProfile: () => ({ stats: {} }),
      debitCoinsFlexible: () => 0,
    },
    caraOuCoroa: {
      toggleDobroOuNada: () => ({ enabled: false }),
      formatDobroStatus: () => "",
    },
    adivinhacao: {
      start: () => ({}),
      recordGuess: () => ({ valid: false, error: "" }),
      getResults: () => ({}),
      formatResults: () => "",
    },
    batataquente: {
      start: () => ({}),
      formatStatus: () => "",
      getLoser: () => "",
      recordPass: () => ({ valid: false, error: "" }),
    },
    dueloDados: {
      start: () => ({}),
      recordRoll: () => ({ valid: false, error: "" }),
      getResults: () => ({}),
      formatResults: () => "",
    },
    roletaRussa: {
      start: () => ({}),
      getCurrentPlayer: () => "",
      takeShotAt: () => ({ hit: false }),
      formatStatus: () => "",
    },
    startPeriodicGame: async () => ({ ok: true }),
    GAME_REWARDS: {
      ADIVINHACAO_EXACT: 60,
      ADIVINHACAO_CLOSEST: 30,
      DADOS_WIN: 35,
      BATATA_WIN: 20,
      ROLETA_WIN: 45,
      ROLETA_WIN_GUARANTEED: 30,
    },
    BASE_GAME_REWARD: 30,
    normalizeUnifiedGameType: () => null,
    normalizeLobbyId: () => "",
    activeGameKey: () => "",
    resolveActiveLobbyForPlayer: () => ({ ok: false, reason: "not-found" }),
    getLobbyCreateBlockMessage: () => null,
    getGameBuyIn: () => 0,
    collectLobbyBuyIn: () => ({ ok: true, pool: 0 }),
    distributeLobbyBuyInPool: async () => {},
    parsePositiveInt: () => 1,
    isResenhaModeEnabled: () => false,
    rewardPlayer: async () => {},
    rewardPlayers: async () => {},
    incrementUserStat: () => {},
    applyRandomGamePunishment: async () => {},
    createPendingTargetForWinner: async () => {},
    jidNormalizedUser: (id) => id,
    createLobbyWarningCallback: () => {},
    buildGameStatsText: () => "",
  })

  assert.equal(handled, true)
  assert.equal(sent.length, 1)
  assert.match(sent[0].payload.text, /SUBMENU: JOGOS/)
})

test("games router blocks !começar reação with fewer than 3 participants", async () => {
  const sent = []
  let started = false
  const sock = {
    user: { id: "bot@s.whatsapp.net" },
    async sendMessage(to, payload) {
      sent.push({ to, payload })
    },
    async groupMetadata() {
      return {
        participants: [
          { id: "user1@s.whatsapp.net" },
          { id: "user2@s.whatsapp.net" },
          { id: "bot@s.whatsapp.net" },
        ],
      }
    },
  }

  const handled = await handleGameCommands({
    sock,
    from: "group@g.us",
    sender: "user@s.whatsapp.net",
    cmd: "!começar reação",
    cmdName: "!começar",
    cmdArg1: "reação",
    cmdArg2: "",
    mentioned: [],
    prefix: "!",
    isGroup: true,
    text: "!começar reação",
    msg: { message: {} },
    storage: {
      getGameState: () => null,
      setGameState: () => {},
      clearGameState: () => {},
    },
    gameManager: {
      createOptInSession: () => "ABCD",
      getOptInSession: () => null,
      addPlayerToOptIn: () => false,
      clearOptInSession: () => {},
      optInSessions: {},
    },
    economyService: {
      getProfile: () => ({ stats: {} }),
      debitCoinsFlexible: () => 0,
    },
    caraOuCoroa: {
      toggleDobroOuNada: () => ({ enabled: false }),
      formatDobroStatus: () => "",
    },
    adivinhacao: {
      start: () => ({}),
      recordGuess: () => ({ valid: false, error: "" }),
      getResults: () => ({}),
      formatResults: () => "",
    },
    batataquente: {
      start: () => ({}),
      formatStatus: () => "",
      getLoser: () => "",
      recordPass: () => ({ valid: false, error: "" }),
    },
    dueloDados: {
      start: () => ({}),
      recordRoll: () => ({ valid: false, error: "" }),
      getResults: () => ({}),
      formatResults: () => "",
    },
    roletaRussa: {
      start: () => ({}),
      getCurrentPlayer: () => "",
      takeShotAt: () => ({ hit: false }),
      formatStatus: () => "",
    },
    startPeriodicGame: async () => {
      started = true
      return { ok: true }
    },
    GAME_REWARDS: {
      ADIVINHACAO_EXACT: 60,
      ADIVINHACAO_CLOSEST: 30,
      DADOS_WIN: 35,
      BATATA_WIN: 20,
      ROLETA_WIN: 45,
      ROLETA_WIN_GUARANTEED: 30,
    },
    BASE_GAME_REWARD: 30,
    normalizeUnifiedGameType: (v) => v,
    normalizeLobbyId: () => "",
    activeGameKey: () => "",
    resolveActiveLobbyForPlayer: () => ({ ok: false, reason: "not-found" }),
    getLobbyCreateBlockMessage: () => null,
    getGameBuyIn: () => 0,
    collectLobbyBuyIn: () => ({ ok: true, pool: 0 }),
    distributeLobbyBuyInPool: async () => {},
    parsePositiveInt: () => 1,
    isResenhaModeEnabled: () => false,
    rewardPlayer: async () => {},
    rewardPlayers: async () => {},
    incrementUserStat: () => {},
    applyRandomGamePunishment: async () => {},
    createPendingTargetForWinner: async () => {},
    jidNormalizedUser: (id) => id,
    createLobbyWarningCallback: () => {},
    buildGameStatsText: () => "",
  })

  assert.equal(handled, true)
  assert.equal(started, false)
  assert.equal(sent.length, 1)
  assert.match(sent[0].payload.text, /pelo menos 3 participantes/i)
})

test("economy router no longer handles !jogos", async () => {
  const { sock, sent } = createSockCapture()

  const handled = await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "user@s.whatsapp.net",
    cmd: "!jogos",
    cmdName: "!jogos",
    cmdArg1: "",
    cmdArg2: "",
    cmdParts: ["!jogos"],
    mentioned: [],
    prefix: "!",
    isGroup: true,
    senderIsAdmin: false,
    jidNormalizedUser: (id) => id,
    storage: {
      getMutedUsers: () => ({}),
      setMutedUsers: () => {},
    },
    economyService: {
      getProfile: () => ({ coins: 0, shields: 0, buffs: {}, inventory: {} }),
      getStatement: () => [],
      getGroupRanking: () => [],
      getShopIndexText: () => "shop",
    },
    parseQuantity: () => 0,
    formatDuration: () => "0m",
    buildEconomyStatsText: () => "",
    buildInventoryText: () => "",
    incrementUserStat: () => {},
  })

  assert.equal(handled, false)
  assert.equal(sent.length, 0)
})

test("economy router applies lootbox punishment effects", async () => {
  const { sock, sent } = createSockCapture()
  const punishCalls = []

  const handled = await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "autor@s.whatsapp.net",
    cmd: "!lootbox 1",
    cmdName: "!lootbox",
    cmdArg1: "1",
    cmdArg2: "",
    cmdParts: ["!lootbox", "1"],
    mentioned: [],
    prefix: "!",
    isGroup: true,
    senderIsAdmin: false,
    jidNormalizedUser: (id) => id,
    storage: {
      getMutedUsers: () => ({}),
      setMutedUsers: () => {},
    },
    economyService: {
      openLootbox: () => ({
        ok: true,
        quantity: 1,
        results: [
          {
            effect: "Punição (1x)",
            result: "@alvo: Punição sorteada 5 (1x)",
            targetUser: "alvo@s.whatsapp.net",
            targetIsOther: true,
            punishment: {
              type: 5,
              severity: 1,
            },
          },
        ],
      }),
    },
    parseQuantity: (v, fallback = 1) => {
      const n = Number.parseInt(String(v || ""), 10)
      return Number.isFinite(n) && n > 0 ? n : fallback
    },
    formatDuration: () => "0m",
    buildEconomyStatsText: () => "",
    buildInventoryText: () => "",
    incrementUserStat: () => {},
    applyPunishment: async (...args) => {
      punishCalls.push(args)
    },
  })

  assert.equal(handled, true)
  assert.equal(punishCalls.length, 1)
  assert.equal(punishCalls[0][2], "alvo@s.whatsapp.net")
  assert.equal(sent.length, 1)
  assert.match(sent[0].payload.text, /Lootbox/)
})

test("games message flow triggers periodic game and records trigger", async () => {
  const { sock } = createSockCapture()
  let recorded = false

  const handled = await handleGameMessageFlow({
    sock,
    from: "group@g.us",
    sender: "user@s.whatsapp.net",
    text: "mensagem comum",
    msg: { message: {} },
    mentioned: [],
    isGroup: true,
    isCommand: false,
    storage: {
      getGameState: () => null,
      setGameState: () => {},
      clearGameState: () => {},
    },
    gameManager: {
      incrementMessageCounter: () => {},
      shouldTriggerPeriodicGame: () => true,
      pickRandom: () => "embaralhado",
      recordPeriodicTrigger: () => {
        recorded = true
      },
      resetMessageCounter: () => {},
    },
    reação: {
      recordReaction: () => ({ valid: false }),
      getResults: () => ({}),
      formatResults: () => "",
    },
    embaralhado: {
      checkAnswer: () => ({ correct: false }),
      formatResults: () => "",
    },
    memória: {
      recordAttempt: () => ({ correct: false }),
      formatResults: () => "",
    },
    comando: {
      recordParticipant: () => {},
      recordSilenceBreaker: () => {},
      isValidCompliance: () => false,
      recordCompliance: () => {},
    },
    startPeriodicGame: async () => ({ ok: true }),
    GAME_REWARDS: {
      REACAO: 30,
      EMBARALHADO: 30,
      MEMORIA: 30,
    },
    isResenhaModeEnabled: () => false,
    rewardPlayer: async () => {},
    incrementUserStat: () => {},
    createPendingTargetForWinner: async () => {},
  })

  assert.equal(handled, false)
  assert.equal(recorded, true)
})

test("utility router handles !menu command", async () => {
  const { sock, sent } = createSockCapture()

  const handled = await handleUtilityCommands({
    sock,
    from: "group@g.us",
    sender: "user@s.whatsapp.net",
    cmd: "!menu",
    prefix: "!",
    isGroup: true,
    msg: { message: {} },
    quoted: null,
    mentioned: [],
    sharp: () => ({}),
    downloadMediaMessage: async () => null,
    logger: {},
    videoToSticker: async () => null,
    dddMap: {},
  })

  assert.equal(handled, true)
  assert.equal(sent.length, 1)
  assert.match(sent[0].payload.text, /VITIN BOT/)
})

test("utility router handles hidden !jid only in DM", async () => {
  const { sock, sent } = createSockCapture()
  const sender = "5511999999999:5@s.whatsapp.net"

  const handled = await handleUtilityCommands({
    sock,
    from: sender,
    sender,
    cmd: "!jid",
    prefix: "!",
    isGroup: false,
    msg: { message: {} },
    quoted: null,
    mentioned: [],
    sharp: () => ({}),
    downloadMediaMessage: async () => null,
    logger: {},
    videoToSticker: async () => null,
    dddMap: {},
    jidNormalizedUser: (id) => String(id || "").split(":")[0],
  })

  assert.equal(handled, true)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].to, sender)
  assert.match(sent[0].payload.text, /5511999999999:5@s\.whatsapp\.net/)
  assert.match(sent[0].payload.text, /5511999999999@s\.whatsapp\.net/)
})

test("utility router handles !punicoeslista command", async () => {
  const { sock, sent } = createSockCapture()
  const sender = "user@s.whatsapp.net"

  const handled = await handleUtilityCommands({
    sock,
    from: "group@g.us",
    sender,
    cmd: "!punicoeslista",
    prefix: "!",
    isGroup: true,
    msg: { message: {} },
    quoted: null,
    mentioned: [],
    sharp: () => ({}),
    downloadMediaMessage: async () => null,
    logger: {},
    videoToSticker: async () => null,
    dddMap: {},
    getPunishmentDetailsText: () => "PUNIÇÕES DETALHADAS",
  })

  assert.equal(handled, true)
  assert.equal(sent.length, 2)
  assert.equal(sent[0].to, sender)
  assert.match(sent[0].payload.text, /PUNIÇÕES DETALHADAS/)
  assert.equal(sent[1].to, "group@g.us")
  assert.match(sent[1].payload.text, /enviei a lista de punições no privado/i)
})
