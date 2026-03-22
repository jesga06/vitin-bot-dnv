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
