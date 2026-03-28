const test = require("node:test")
const assert = require("node:assert/strict")

const { handleEconomyCommands, cleanupUserLinkedState } = require("../routers/economyRouter")
const { handleGameCommands, handleGameMessageFlow } = require("../routers/gamesRouter")
const { handleModerationCommands } = require("../routers/moderationRouter")
const {
  handleUtilityCommands,
  __resetUtilityRouterStateForTests,
} = require("../routers/utilityRouter")

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

test("economy router handles !xp command", async () => {
  const { sock, sent } = createSockCapture()

  const handled = await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "autor@s.whatsapp.net",
    cmd: "!xp",
    cmdName: "!xp",
    cmdArg1: "",
    cmdArg2: "",
    cmdParts: ["!xp"],
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
      getXpProfile: () => ({
        level: 7,
        xp: 80,
        xpToNextLevel: 220,
        seasonPoints: 1240,
      }),
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
  assert.match(String(sent[0].payload?.text || ""), /Nível: \*7\*/)
  assert.match(String(sent[0].payload?.text || ""), /80\/220/)
})

test("economy router handles !xpranking command", async () => {
  const { sock, sent } = createSockCapture()
  sock.groupMetadata = async () => ({
    participants: [
      { id: "autor@s.whatsapp.net" },
      { id: "alvo@s.whatsapp.net" },
    ],
  })

  const handled = await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "autor@s.whatsapp.net",
    cmd: "!xpranking",
    cmdName: "!xpranking",
    cmdArg1: "",
    cmdArg2: "",
    cmdParts: ["!xpranking"],
    mentioned: [],
    prefix: "!",
    isGroup: true,
    senderIsAdmin: false,
    jidNormalizedUser: (id) => id,
    storage: {
      getMutedUsers: () => ({}),
      setMutedUsers: () => {},
    },
    registrationService: {
      isRegistered: () => true,
      getRegisteredEntry: (userId) => ({
        lastKnownName: userId.startsWith("autor") ? "Autor Nome" : "Alvo Nome",
      }),
    },
    economyService: {
      getGroupXpRanking: () => ([
        { userId: "autor@s.whatsapp.net", level: 5, xp: 20, xpToNextLevel: 240 },
        { userId: "alvo@s.whatsapp.net", level: 4, xp: 160, xpToNextLevel: 205 },
      ]),
      getUserGlobalXpPosition: () => 3,
      getStablePublicLabel: (userId) => (userId.startsWith("autor") ? "AUTOR" : "ALVO"),
      isMentionOptIn: () => true,
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
  assert.match(String(sent[0].payload?.text || ""), /Ranking de XP/)
  assert.match(String(sent[0].payload?.text || ""), /Nível 5/)
  assert.match(String(sent[0].payload?.text || ""), /posição global de XP/i)
})

test("economy router !coinsranking hides unregistered/non-visible users and avoids placeholder labels", async () => {
  const { sock, sent } = createSockCapture()
  sock.groupMetadata = async () => ({
    participants: [
      { id: "alias@s.whatsapp.net" },
      { id: "mention@s.whatsapp.net" },
      { id: "hidden@s.whatsapp.net" },
      { id: "unreg@s.whatsapp.net" },
    ],
  })

  const handled = await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "alias@s.whatsapp.net",
    cmd: "!coinsranking",
    cmdName: "!coinsranking",
    cmdArg1: "",
    cmdArg2: "",
    cmdParts: ["!coinsranking"],
    mentioned: [],
    prefix: "!",
    isGroup: true,
    senderIsAdmin: false,
    jidNormalizedUser: (id) => id,
    storage: {
      getMutedUsers: () => ({}),
      setMutedUsers: () => {},
    },
    registrationService: {
      isRegistered: (userId) => userId !== "unreg@s.whatsapp.net",
      getRegisteredEntry: (userId) => {
        if (userId === "alias@s.whatsapp.net") return { lastKnownName: "Alias Registro" }
        if (userId === "mention@s.whatsapp.net") return { lastKnownName: "Mention Registro" }
        return { lastKnownName: "" }
      },
    },
    economyService: {
      getGroupRanking: () => ([
        { userId: "alias@s.whatsapp.net", coins: 900 },
        { userId: "mention@s.whatsapp.net", coins: 800 },
        { userId: "hidden@s.whatsapp.net", coins: 700 },
        { userId: "unreg@s.whatsapp.net", coins: 600 },
      ]),
      getUserGlobalPosition: () => 1,
      isMentionOptIn: (userId) => userId === "mention@s.whatsapp.net",
      getProfile: (userId) => ({
        preferences: {
          publicLabel: userId === "alias@s.whatsapp.net" ? "AliasTop" : "",
        },
      }),
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
  const text = String(sent[0].payload?.text || "")
  assert.match(text, /AliasTop/)
  assert.match(text, /@mention/)
  assert.ok(!/hidden@s\.whatsapp\.net/i.test(text))
  assert.ok(!/unreg@s\.whatsapp\.net/i.test(text))
  assert.ok(!/USR-/i.test(text))
  assert.deepEqual(sent[0].payload?.mentions || [], ["mention@s.whatsapp.net"])
})

test("economy router !coinsranking falls back to nickname when mention jid is not in current group", async () => {
  const { sock, sent } = createSockCapture()
  sock.groupMetadata = async () => ({
    participants: [
      { id: "caller@s.whatsapp.net" },
    ],
  })

  const handled = await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "caller@s.whatsapp.net",
    cmd: "!coinsranking",
    cmdName: "!coinsranking",
    cmdArg1: "",
    cmdArg2: "",
    cmdParts: ["!coinsranking"],
    mentioned: [],
    prefix: "!",
    isGroup: true,
    senderIsAdmin: false,
    jidNormalizedUser: (id) => id,
    storage: {
      getMutedUsers: () => ({}),
      setMutedUsers: () => {},
    },
    registrationService: {
      isRegistered: () => true,
      getRegisteredEntry: (userId) => {
        if (userId === "out1@s.whatsapp.net") return { lastKnownName: "Jogador Um" }
        if (userId === "out2@s.whatsapp.net") return { lastKnownName: "Jogador Dois" }
        return { lastKnownName: "Caller" }
      },
    },
    economyService: {
      getGroupRanking: () => ([
        { userId: "out1@s.whatsapp.net", coins: 1000 },
        { userId: "out2@s.whatsapp.net", coins: 900 },
      ]),
      getUserGlobalPosition: () => 9,
      isMentionOptIn: () => true,
      getProfile: () => ({
        preferences: {
          publicLabel: "",
        },
      }),
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
  const text = String(sent[0].payload?.text || "")
  assert.match(text, /Jogador Um/)
  assert.match(text, /Jogador Dois/)
  assert.ok(!/@out1/i.test(text))
  assert.ok(!/@out2/i.test(text))
  assert.deepEqual(sent[0].payload?.mentions || [], [])
})

test("economy router handles !guia command and sends two DM parts", async () => {
  const { sock, sent } = createSockCapture()

  const handled = await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "autor@s.whatsapp.net",
    cmd: "!guia",
    cmdName: "!guia",
    cmdArg1: "",
    cmdArg2: "",
    cmdParts: ["!guia"],
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
  assert.equal(sent.length, 3)
  assert.equal(sent[0].to, "autor@s.whatsapp.net")
  assert.equal(sent[1].to, "autor@s.whatsapp.net")
  assert.equal(sent[2].to, "group@g.us")
  assert.match(String(sent[0].payload?.text || ""), /GUIA DE ECONOMIA \(1\/2\)/)
  assert.match(String(sent[1].payload?.text || ""), /GUIA DE ECONOMIA \(2\/2\)/)
  assert.match(String(sent[2].payload?.text || ""), /guia de economia no privado em 2 partes/i)
})

test("economy router handles !team create command", async () => {
  const { sock, sent } = createSockCapture()

  const handled = await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "user1@s.whatsapp.net",
    cmd: "!team",
    cmdName: "!team",
    cmdArg1: "create",
    cmdArg2: "MyTeam",
    cmdParts: ["!team", "create", "MyTeam"],
    mentioned: [],
    prefix: "!",
    isGroup: true,
    senderIsAdmin: false,
    jidNormalizedUser: (id) => id,
    storage: {
      getMutedUsers: () => ({}),
      setMutedUsers: () => {},
      getTeam: () => null,
      getUserTeamId: () => null,
      createTeam: (teamId, name, createdBy) => ({
        teamId,
        name,
        createdBy,
        createdAt: Date.now(),
        members: [createdBy],
        poolCoins: 0,
        poolItems: {},
      }),
      addTeamMember: () => true,
    },
    economyService: {
      getProfile: () => ({ coins: 100, shields: 0, buffs: {}, inventory: {} }),
    },
    formatDuration: () => "0m",
  })

  assert.equal(handled, true)
  assert.equal(sent.length, 1)
  assert.match(String(sent[0].payload?.text || ""), /time criado|equipe criada|MyTeam/i)
})

test("economy router reports !team join as disabled", async () => {
  const { sock, sent } = createSockCapture()

  const handled = await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "user2@s.whatsapp.net",
    cmd: "!team",
    cmdName: "!team",
    cmdArg1: "join",
    cmdArg2: "T12345",
    cmdParts: ["!team", "join", "T12345"],
    mentioned: [],
    prefix: "!",
    isGroup: true,
    senderIsAdmin: false,
    jidNormalizedUser: (id) => id,
    storage: {
      getMutedUsers: () => ({}),
      setMutedUsers: () => {},
      getTeam: (teamId) => ({
        teamId: "T12345",
        name: "TestTeam",
        members: ["user1@s.whatsapp.net"],
        poolCoins: 0,
        poolItems: {},
      }),
      addTeamMember: () => true,
      getUserTeamId: () => null,
    },
    economyService: {
      getProfile: () => ({ coins: 100, shields: 0, buffs: {}, inventory: {} }),
    },
    formatDuration: () => "0m",
  })

  assert.equal(handled, true)
  assert(sent.length > 0)
  assert.match(String(sent[0].payload?.text || ""), /desativado|accept/i)
})

test("economy router handles !team members with stats", async () => {
  const { sock, sent } = createSockCapture()

  const handled = await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "user1@s.whatsapp.net",
    cmd: "!team",
    cmdName: "!team",
    cmdArg1: "members",
    cmdArg2: "",
    cmdParts: ["!team", "members"],
    mentioned: [],
    prefix: "!",
    isGroup: true,
    senderIsAdmin: false,
    jidNormalizedUser: (id) => id,
    storage: {
      getMutedUsers: () => ({}),
      setMutedUsers: () => {},
      getUserTeamId: () => "T12345",
      getTeam: (teamId) => ({
        teamId: "T12345",
        name: "TestTeam",
        members: ["user1@s.whatsapp.net", "user2@s.whatsapp.net"],
        poolCoins: 500,
        poolItems: {},
      }),
    },
    economyService: {
      getProfile: (userId) => ({
        coins: 100,
        level: 5,
        totalXp: 1000,
        shields: 0,
        buffs: {},
        inventory: {},
      }),
      getTeamMembers: (teamId, storage) => [
        { userId: "user1@s.whatsapp.net", level: 5, coins: 100 },
        { userId: "user2@s.whatsapp.net", level: 3, coins: 200 },
      ],
    },
    formatDuration: () => "0m",
  })

  assert.equal(handled, true)
  assert(sent.length > 0)
  assert.match(String(sent[0].payload?.text || ""), /membros|integrantes/i)
})

test("economy router handles !team stats", async () => {
  const { sock, sent } = createSockCapture()

  const handled = await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "user1@s.whatsapp.net",
    cmd: "!team",
    cmdName: "!team",
    cmdArg1: "stats",
    cmdArg2: "",
    cmdParts: ["!team", "stats"],
    mentioned: [],
    prefix: "!",
    isGroup: true,
    senderIsAdmin: false,
    jidNormalizedUser: (id) => id,
    storage: {
      getMutedUsers: () => ({}),
      setMutedUsers: () => {},
      getUserTeamId: () => "T12345",
      getTeam: (teamId) => ({
        teamId: "T12345",
        name: "TestTeam",
        members: ["user1@s.whatsapp.net", "user2@s.whatsapp.net"],
        poolCoins: 500,
        poolItems: {},
      }),
    },
    economyService: {
      getProfile: (userId) => ({
        coins: 100,
        level: 5,
        totalXp: 1000,
        shields: 0,
        buffs: {},
        inventory: {},
      }),
      getTeamStats: (teamId, storage) => ({
        memberCount: 2,
        totalCoins: 300,
        avgLevel: 4,
        poolCoins: 500,
      }),
      getTeamPoolCoins: (teamId, storage) => 500,
      getTeamPoolItems: (teamId, storage) => {},
    },
    formatDuration: () => "0m",
  })

  assert.equal(handled, true)
  assert(sent.length > 0)
  assert.match(String(sent[0].payload?.text || ""), /estatísticas|stats|TestTeam|membros|moedas/i)
})

test("economy router handles !team depositarcoins", async () => {
  const { sock, sent } = createSockCapture()
  let poolDeposit = 0

  const handled = await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "user1@s.whatsapp.net",
    cmd: "!team depositarcoins 120",
    cmdName: "!team",
    cmdArg1: "depositarcoins",
    cmdArg2: "120",
    cmdParts: ["!team", "depositarcoins", "120"],
    mentioned: [],
    prefix: "!",
    isGroup: true,
    senderIsAdmin: false,
    jidNormalizedUser: (id) => id,
    storage: {
      getMutedUsers: () => ({}),
      setMutedUsers: () => {},
      getUserTeamId: () => "T12345",
      addTeamPoolCoins: (_teamId, amount) => {
        poolDeposit = amount
        return true
      },
    },
    economyService: {
      debitCoins: () => true,
    },
    parseQuantity: (value) => Number.parseInt(String(value || "0"), 10) || 0,
    formatDuration: () => "0m",
  })

  assert.equal(handled, true)
  assert.equal(poolDeposit, 120)
  assert.match(String(sent[0].payload?.text || ""), /depositou/i)
})

test("economy router handles !team retiraritem", async () => {
  const { sock, sent } = createSockCapture()
  let removedFromPool = false

  const handled = await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "leader@s.whatsapp.net",
    cmd: "!team retiraritem escudo 2",
    cmdName: "!team",
    cmdArg1: "retiraritem",
    cmdArg2: "escudo",
    cmdParts: ["!team", "retiraritem", "escudo", "2"],
    mentioned: [],
    prefix: "!",
    isGroup: true,
    senderIsAdmin: false,
    jidNormalizedUser: (id) => id,
    storage: {
      getMutedUsers: () => ({}),
      setMutedUsers: () => {},
      getUserTeamId: () => "T12345",
      getTeam: () => ({
        teamId: "T12345",
        createdBy: "leader@s.whatsapp.net",
        members: ["leader@s.whatsapp.net", "user2@s.whatsapp.net"],
      }),
      removeTeamPoolItem: () => {
        removedFromPool = true
        return true
      },
      addTeamPoolItem: () => true,
    },
    economyService: {
      normalizeItemKey: () => "escudo",
      getItemQuantity: () => 1,
      addItem: () => 3,
    },
    parseQuantity: (value) => Number.parseInt(String(value || "0"), 10) || 0,
    formatDuration: () => "0m",
  })

  assert.equal(handled, true)
  assert.equal(removedFromPool, true)
  assert.match(String(sent[0].payload?.text || ""), /Retirada concluida/i)
})

test("economy router includes XP block in !perfil", async () => {
  const { sock, sent } = createSockCapture()

  const handled = await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "autor@s.whatsapp.net",
    cmd: "!perfil",
    cmdName: "!perfil",
    cmdArg1: "",
    cmdArg2: "",
    cmdParts: ["!perfil"],
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
      getProfile: () => ({ coins: 900, shields: 2, buffs: {}, inventory: {} }),
      getXpProfile: () => ({ level: 6, xp: 45, xpToNextLevel: 120, seasonPoints: 88 }),
      getUserGlobalXpPosition: () => 5,
      getStatement: () => [],
      getGroupRanking: () => [],
      getShopIndexText: () => "shop",
    },
    parseQuantity: () => 0,
    formatDuration: () => "0m",
    buildGameStatsText: () => "",
    buildEconomyStatsText: () => "",
    buildInventoryText: () => "vazio",
    incrementUserStat: () => {},
  })

  assert.equal(handled, true)
  assert.equal(sent.length, 1)
  assert.match(String(sent[0].payload?.text || ""), /Nível: \*6\*/)
  assert.match(String(sent[0].payload?.text || ""), /XP: \*45\/120\*/)
  assert.match(String(sent[0].payload?.text || ""), /Posição global XP: \*5\*/)
})

test("economy router handles !missao list and claim", async () => {
  const { sock, sent } = createSockCapture()

  const baseCtx = {
    sock,
    from: "group@g.us",
    sender: "autor@s.whatsapp.net",
    prefix: "!",
    isGroup: true,
    senderIsAdmin: false,
    jidNormalizedUser: (id) => id,
    storage: {
      getMutedUsers: () => ({}),
      setMutedUsers: () => {},
    },
    economyService: {
      getDailyQuestState: () => ({
        dayKey: "2026-03-24",
        quests: [
          {
            id: "Q1",
            title: "Concluir trabalhos",
            progress: 2,
            target: 3,
            completed: false,
            claimed: false,
            rewardXp: 120,
            rewardCoins: 220,
          },
          {
            id: "Q2",
            title: "Resgatar o daily",
            progress: 1,
            target: 1,
            completed: true,
            claimed: false,
            rewardXp: 90,
            rewardCoins: 130,
          },
        ],
      }),
      claimDailyQuest: () => ({
        ok: true,
        questId: "Q2",
        rewardXp: 90,
        rewardCoins: 130,
        xpResult: {
          levelsGained: 1,
          level: 8,
        },
      }),
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
  }

  const listed = await handleEconomyCommands({
    ...baseCtx,
    cmd: "!missao",
    cmdName: "!missao",
    cmdArg1: "",
    cmdArg2: "",
    cmdParts: ["!missao"],
    mentioned: [],
  })
  assert.equal(listed, true)
  assert.match(String(sent[0].payload?.text || ""), /Missões diárias/)
  assert.match(String(sent[0].payload?.text || ""), /Q2/)

  const claimed = await handleEconomyCommands({
    ...baseCtx,
    cmd: "!missao claim q2",
    cmdName: "!missao",
    cmdArg1: "claim",
    cmdArg2: "q2",
    cmdParts: ["!missao", "claim", "q2"],
    mentioned: [],
  })
  assert.equal(claimed, true)
  assert.match(String(sent[1].payload?.text || ""), /Missão \*Q2\* resgatada/)
  assert.match(String(sent[1].payload?.text || ""), /Level up/)
})

test("economy router grants XP on !daily claim", async () => {
  const { sock, sent } = createSockCapture()
  const xpCalls = []

  const handled = await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "autor@s.whatsapp.net",
    cmd: "!daily",
    cmdName: "!daily",
    cmdArg1: "",
    cmdArg2: "",
    cmdParts: ["!daily"],
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
      claimDaily: () => ({ ok: true, amount: 100, dayKey: "2026-03-24", kronosBonus: false }),
      addXp: (userId, amount, meta) => {
        xpCalls.push({ userId, amount, meta })
        return { ok: true, levelsGained: 0, level: 2 }
      },
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
  assert.equal(xpCalls.length, 1)
  assert.equal(xpCalls[0].amount, 45)
  assert.match(String(sent[0].payload?.text || ""), /XP: \+45/)
})

test("economy router grants XP on failed !roubar", async () => {
  const { sock, sent } = createSockCapture()
  const xpCalls = []

  const handled = await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "autor@s.whatsapp.net",
    cmd: "!roubar @alvo",
    cmdName: "!roubar",
    cmdArg1: "@alvo",
    cmdArg2: "",
    cmdParts: ["!roubar", "@alvo"],
    mentioned: ["alvo@s.whatsapp.net"],
    prefix: "!",
    isGroup: true,
    senderIsAdmin: false,
    jidNormalizedUser: (id) => id,
    storage: {
      getMutedUsers: () => ({}),
      setMutedUsers: () => {},
    },
    economyService: {
      getStealCooldown: () => 0,
      attemptSteal: () => ({ ok: true, success: false, lost: 55, successChance: 0.3 }),
      setStealCooldown: () => {},
      incrementStat: () => {},
      addXp: (_userId, amount) => {
        xpCalls.push(amount)
        return { ok: true, levelsGained: 0, level: 3 }
      },
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
  assert.equal(xpCalls.length, 1)
  assert.equal(xpCalls[0], 12)
  assert.match(String(sent[0].payload?.text || ""), /XP: \+12/)
})

test("economy router no longer passes hidden-negative steal modifier to attemptSteal", async () => {
  const { sock } = createSockCapture()
  let receivedOptions = null

  const handled = await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "autor-hidden@s.whatsapp.net",
    cmd: "!roubar @alvo",
    cmdName: "!roubar",
    cmdArg1: "@alvo",
    cmdArg2: "",
    cmdParts: ["!roubar", "@alvo"],
    mentioned: ["alvo-hidden@s.whatsapp.net"],
    prefix: "!",
    isGroup: true,
    senderIsAdmin: false,
    jidNormalizedUser: (id) => id,
    isOverrideSender: false,
    storage: {
      getMutedUsers: () => ({}),
      setMutedUsers: () => {},
    },
    economyService: {
      getStealCooldown: () => 0,
      attemptSteal: (_sender, _target, options) => {
        receivedOptions = options
        return { ok: true, success: false, lost: 10, successChance: 0.1, successChanceDelta: 0 }
      },
      setStealCooldown: () => {},
      incrementStat: () => {},
      addXp: () => ({ ok: true, levelsGained: 0, level: 1 }),
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
  assert.equal(receivedOptions, undefined)
})

test("economy router handles !deletarconta confirmation and deletes account", async () => {
  const { sock, sent } = createSockCapture()
  let deletedProfile = false
  let unregistered = false

  const commonCtx = {
    sock,
    from: "group@g.us",
    sender: "delete-user@s.whatsapp.net",
    mentioned: [],
    prefix: "!",
    isGroup: true,
    senderIsAdmin: false,
    jidNormalizedUser: (id) => id,
    storage: {
      getMutedUsers: () => ({}),
      setMutedUsers: () => {},
      getCache: () => ({ gameStates: {} }),
    },
    economyService: {
      getProfile: () => ({ coins: 123, shields: 1, buffs: {}, inventory: {} }),
      deleteUserProfile: () => {
        deletedProfile = true
        return true
      },
      getStatement: () => [],
      getGroupRanking: () => [],
      getShopIndexText: () => "shop",
    },
    registrationService: {
      unregisterUser: () => {
        unregistered = true
        return { ok: true }
      },
    },
    parseQuantity: () => 0,
    formatDuration: () => "2m",
    buildGameStatsText: () => "",
    buildEconomyStatsText: () => "",
    buildInventoryText: () => "",
    incrementUserStat: () => {},
  }

  const step1 = await handleEconomyCommands({
    ...commonCtx,
    cmd: "!deletarconta confirmar",
    cmdName: "!deletarconta",
    cmdArg1: "confirmar",
    cmdArg2: "",
    cmdParts: ["!deletarconta", "confirmar"],
  })

  const phrase = "Estou ciente do uso e efeitos deste comando. Delete a minha conta"
  const step2 = await handleEconomyCommands({
    ...commonCtx,
    cmd: `!deletarconta ${phrase}`,
    cmdName: "!deletarconta",
    cmdArg1: phrase,
    cmdArg2: "",
    cmdParts: ["!deletarconta", ...phrase.split(" ")],
  })

  assert.equal(step1, true)
  assert.equal(step2, true)
  assert.equal(deletedProfile, true)
  assert.equal(unregistered, true)
  assert.match(String(sent[0]?.payload?.text || ""), /Confirmação iniciada/i)
  assert.match(String(sent[1]?.payload?.text || ""), /Conta removida com sucesso/i)
})

test("economy router grants XP on successful !trabalho", async () => {
  const { sock, sent } = createSockCapture()
  const xpCalls = []
  const randomOriginal = Math.random
  Math.random = () => 0.5
  try {
    const handled = await handleEconomyCommands({
      sock,
      from: "group@g.us",
      sender: "autor@s.whatsapp.net",
      cmd: "!trabalho ifood",
      cmdName: "!trabalho",
      cmdArg1: "ifood",
      cmdArg2: "",
      cmdParts: ["!trabalho", "ifood"],
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
        getWorkCooldown: () => 0,
        setWorkCooldown: () => {},
        incrementStat: () => {},
        applyKronosGainMultiplier: (_user, value) => value,
        creditCoins: () => 0,
        addXp: (_userId, amount) => {
          xpCalls.push(amount)
          return { ok: true, levelsGained: 0, level: 4 }
        },
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
    assert.equal(xpCalls.length, 1)
    assert.equal(xpCalls[0], 28)
    assert.match(String(sent[0].payload?.text || ""), /XP: \+28/)
  } finally {
    Math.random = randomOriginal
  }
})

test("economy router blocks economy commands when mention opt-out user has no nickname", async () => {
  const { sock, sent } = createSockCapture()

  const handled = await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "autor@s.whatsapp.net",
    cmd: "!extrato",
    cmdName: "!extrato",
    cmdArg1: "",
    cmdArg2: "",
    cmdParts: ["!extrato"],
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
      isMentionOptIn: () => false,
      getProfile: () => ({
        coins: 0,
        shields: 0,
        buffs: {},
        inventory: {},
        preferences: { publicLabel: "" },
      }),
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
  assert.match(sent[0].payload.text, /definiu apelido público/i)
  assert.match(sent[0].payload.text, /!apelido/i)
})

test("economy router rejects !loteria for non-admin", async () => {
  const { sock, sent } = createSockCapture()

  const handled = await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "user@s.whatsapp.net",
    rawText: '!loteria "Sorteio" "moedas=100" N 1',
    cmd: '!loteria "sorteio" "moedas=100" n 1',
    cmdName: "!loteria",
    cmdArg1: '"sorteio"',
    cmdArg2: '"moedas=100"',
    cmdParts: ["!loteria", '"sorteio"', '"moedas=100"', "n", "1"],
    mentioned: [],
    prefix: "!",
    isGroup: true,
    senderIsAdmin: false,
    isOverrideSender: false,
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
      getOperationLimits: () => ({ maxCoinOperation: 1000, maxItemOperation: 100 }),
      getItemDefinition: () => null,
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
  assert.match(sent[0].payload.text, /Apenas overrides podem iniciar loterias/i)
})

test("economy router runs !loteria and applies mixed rewards", async () => {
  const sent = []
  const credits = []
  const items = []
  const txs = []
  const sock = {
    user: { id: "bot@s.whatsapp.net" },
    async sendMessage(to, payload) {
      sent.push({ to, payload })
    },
    async groupMetadata() {
      return {
        participants: [
          { id: "admin@s.whatsapp.net" },
          { id: "winner@s.whatsapp.net" },
          { id: "bot@s.whatsapp.net" },
        ],
      }
    },
  }

  const handled = await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "admin@s.whatsapp.net",
    rawText: '!loteria "Sorteio Relampago" "moedas=150|item:escudo-2|Vale pizza" N 1',
    cmd: '!loteria "sorteio relampago" "moedas=150|item:escudo-2|vale pizza" n 1',
    cmdName: "!loteria",
    cmdArg1: '"sorteio',
    cmdArg2: 'relampago"',
    cmdParts: ["!loteria", '"sorteio', 'relampago"', '"moedas=150|item:escudo-2|vale', 'pizza"', "n", "1"],
    mentioned: [],
    prefix: "!",
    isGroup: true,
    senderIsAdmin: true,
    isOverrideSender: true,
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
      getOperationLimits: () => ({
        maxCoinsBalance: 1_000_000,
        maxCoinOperation: 10_000,
        maxItemStack: 1_000,
        maxItemOperation: 100,
        maxLootboxOpenPerCall: 100,
        maxForgeQuantity: 100,
      }),
      getItemDefinition: (itemKey) => {
        if (String(itemKey).toLowerCase() === "escudo") {
          return { key: "escudo", name: "Escudo" }
        }
        return null
      },
      creditCoins: (userId, amount, transaction) => {
        credits.push({ userId, amount, transaction })
        return amount
      },
      addItem: (userId, itemKey, quantity) => {
        items.push({ userId, itemKey, quantity })
        return quantity
      },
      pushTransaction: (userId, transaction) => {
        txs.push({ userId, transaction })
      },
    },
    parseQuantity: () => 0,
    formatDuration: () => "0m",
    buildGameStatsText: () => "",
    buildEconomyStatsText: () => "",
    buildInventoryText: () => "",
    incrementUserStat: () => {},
    raffleRevealDelayMs: 0,
  })

  assert.equal(handled, true)
  assert.ok(sent.length >= 1)
  assert.match(sent[0].payload.text, /Loteria iniciada/i)
  assert.ok(Array.isArray(sent[0].payload.mentions))
  assert.deepEqual(sent[0].payload.mentions, ["winner@s.whatsapp.net"])

  await new Promise((resolve) => setTimeout(resolve, 5))

  assert.equal(credits.length, 1)
  assert.equal(credits[0].userId, "winner@s.whatsapp.net")
  assert.equal(credits[0].amount, 150)
  assert.equal(items.length, 1)
  assert.equal(items[0].userId, "winner@s.whatsapp.net")
  assert.equal(items[0].itemKey, "escudo")
  assert.equal(items[0].quantity, 2)
  assert.equal(txs.length, 1)
  assert.ok(sent.some((entry) => /Resultado da loteria/i.test(String(entry.payload?.text || ""))))
})

test("economy router handles trade lifecycle create respond review accept", async () => {
  const { sock, sent } = createSockCapture()
  const userA = "a@s.whatsapp.net"
  const userB = "b@s.whatsapp.net"
  const tradeStateByGroup = {}

  const balances = {
    [userA]: 5000,
    [userB]: 5000,
  }
  const inventory = {
    [userA]: { escudo: 3 },
    [userB]: { escudo: 2 },
  }

  const storage = {
    getMutedUsers: () => ({}),
    setMutedUsers: () => {},
    getGameState: (groupId, key) => tradeStateByGroup[`${groupId}:${key}`] || null,
    setGameState: (groupId, key, value) => {
      tradeStateByGroup[`${groupId}:${key}`] = value
    },
  }

  const economyService = {
    getProfile: () => ({ coins: 0, shields: 0, buffs: {}, inventory: {}, preferences: { publicLabel: "" } }),
    getItemDefinition: (key) => {
      if (String(key).toLowerCase() === "escudo") return { key: "escudo", name: "Escudo", price: 900 }
      return null
    },
    getCoins: (userId) => balances[userId] || 0,
    getItemQuantity: (userId, itemKey) => inventory[userId]?.[itemKey] || 0,
    transferCoins: (fromId, toId, amount) => {
      const value = Math.floor(Number(amount) || 0)
      if ((balances[fromId] || 0) < value) return { ok: false, reason: "insufficient-funds" }
      balances[fromId] = (balances[fromId] || 0) - value
      balances[toId] = (balances[toId] || 0) + value
      return { ok: true, amount: value }
    },
    transferItem: (fromId, toId, itemKey, quantity) => {
      const qty = Math.floor(Number(quantity) || 0)
      if ((inventory[fromId]?.[itemKey] || 0) < qty) return { ok: false, reason: "insufficient-items" }
      inventory[fromId][itemKey] -= qty
      inventory[toId][itemKey] = (inventory[toId][itemKey] || 0) + qty
      return { ok: true, quantity: qty, itemKey }
    },
    debitCoins: (userId, amount) => {
      const value = Math.floor(Number(amount) || 0)
      if ((balances[userId] || 0) < value) return false
      balances[userId] -= value
      return true
    },
    pushTransaction: () => {},
    getOperationLimits: () => ({
      maxCoinsBalance: 2_000_000_000,
      maxCoinOperation: 50_000_000,
      maxItemStack: 100_000,
      maxItemOperation: 10_000,
      maxLootboxOpenPerCall: 10,
      maxForgeQuantity: 1000,
    }),
  }

  const baseCtx = {
    sock,
    from: "group@g.us",
    prefix: "!",
    isGroup: true,
    senderIsAdmin: false,
    jidNormalizedUser: (id) => id,
    storage,
    economyService,
    parseQuantity: (v, fallback = 1) => {
      const n = Number.parseInt(String(v || ""), 10)
      return Number.isFinite(n) && n > 0 ? n : fallback
    },
    formatDuration: () => "0m",
    buildGameStatsText: () => "",
    buildEconomyStatsText: () => "",
    buildInventoryText: () => "",
    incrementUserStat: () => {},
  }

  const created = await handleEconomyCommands({
    ...baseCtx,
    sender: userA,
    rawText: "!trade @b 300 escudo:1",
    cmd: "!trade @b 300 escudo:1",
    cmdName: "!trade",
    cmdArg1: "@b",
    cmdArg2: "300",
    cmdParts: ["!trade", "@b", "300", "escudo:1"],
    mentioned: [userB],
  })
  assert.equal(created, true)

  const createdMessage = sent.find((entry) => /Trade [A-Z0-9]{4} criado/.test(String(entry.payload?.text || "")))
  assert.ok(createdMessage)
  const tradeId = String(createdMessage.payload.text).match(/Trade ([A-Z0-9]{4}) criado/)[1]

  const responded = await handleEconomyCommands({
    ...baseCtx,
    sender: userB,
    rawText: `!trade respond ${tradeId} 200 escudo:1`,
    cmd: `!trade respond ${tradeId} 200 escudo:1`,
    cmdName: "!trade",
    cmdArg1: "respond",
    cmdArg2: tradeId,
    cmdParts: ["!trade", "respond", tradeId, "200", "escudo:1"],
    mentioned: [],
  })
  assert.equal(responded, true)

  const reviewA = await handleEconomyCommands({
    ...baseCtx,
    sender: userA,
    rawText: `!trade review ${tradeId}`,
    cmd: `!trade review ${tradeId}`,
    cmdName: "!trade",
    cmdArg1: "review",
    cmdArg2: tradeId,
    cmdParts: ["!trade", "review", tradeId],
    mentioned: [],
  })
  assert.equal(reviewA, true)

  const reviewB = await handleEconomyCommands({
    ...baseCtx,
    sender: userB,
    rawText: `!trade review ${tradeId}`,
    cmd: `!trade review ${tradeId}`,
    cmdName: "!trade",
    cmdArg1: "review",
    cmdArg2: tradeId,
    cmdParts: ["!trade", "review", tradeId],
    mentioned: [],
  })
  assert.equal(reviewB, true)

  const acceptA = await handleEconomyCommands({
    ...baseCtx,
    sender: userA,
    rawText: `!trade accept ${tradeId}`,
    cmd: `!trade accept ${tradeId}`,
    cmdName: "!trade",
    cmdArg1: "accept",
    cmdArg2: tradeId,
    cmdParts: ["!trade", "accept", tradeId],
    mentioned: [],
  })
  assert.equal(acceptA, true)

  const acceptB = await handleEconomyCommands({
    ...baseCtx,
    sender: userB,
    rawText: `!trade accept ${tradeId}`,
    cmd: `!trade accept ${tradeId}`,
    cmdName: "!trade",
    cmdArg1: "accept",
    cmdArg2: tradeId,
    cmdParts: ["!trade", "accept", tradeId],
    mentioned: [],
  })
  assert.equal(acceptB, true)

  assert.ok(sent.some((entry) => new RegExp(`Trade ${tradeId} concluído com sucesso`).test(String(entry.payload?.text || ""))))
  assert.equal(inventory[userA].escudo, 3)
  assert.equal(inventory[userB].escudo, 2)
})

test("economy router handles coupon create and redeem", async () => {
  const { sock, sent } = createSockCapture()
  const storageMap = {}
  const credited = []

  const storage = {
    getMutedUsers: () => ({}),
    setMutedUsers: () => {},
    getGameState: (groupId, key) => storageMap[`${groupId}:${key}`] || null,
    setGameState: (groupId, key, value) => {
      storageMap[`${groupId}:${key}`] = value
    },
  }

  const economyService = {
    getProfile: () => ({ coins: 0, shields: 0, buffs: {}, inventory: {}, preferences: { publicLabel: "" } }),
    creditCoins: (userId, amount) => {
      credited.push({ userId, amount })
      return amount
    },
    getOperationLimits: () => ({
      maxCoinsBalance: 2_000_000_000,
      maxCoinOperation: 50_000_000,
      maxItemStack: 100_000,
      maxItemOperation: 10_000,
      maxLootboxOpenPerCall: 10,
      maxForgeQuantity: 1000,
    }),
  }

  const baseCtx = {
    sock,
    from: "group@g.us",
    prefix: "!",
    isGroup: true,
    jidNormalizedUser: (id) => id,
    storage,
    economyService,
    parseQuantity: (v, fallback = 1) => {
      const n = Number.parseInt(String(v || ""), 10)
      return Number.isFinite(n) && n > 0 ? n : fallback
    },
    formatDuration: () => "0m",
    buildGameStatsText: () => "",
    buildEconomyStatsText: () => "",
    buildInventoryText: () => "",
    incrementUserStat: () => {},
  }

  const created = await handleEconomyCommands({
    ...baseCtx,
    sender: "admin@s.whatsapp.net",
    senderIsAdmin: true,
    isOverrideSender: true,
    rawText: "!cupom criar EVENTO500 500",
    cmd: "!cupom criar EVENTO500 500",
    cmdName: "!cupom",
    cmdArg1: "criar",
    cmdArg2: "EVENTO500",
    cmdParts: ["!cupom", "criar", "EVENTO500", "500"],
    mentioned: [],
  })
  assert.equal(created, true)

  const redeemed = await handleEconomyCommands({
    ...baseCtx,
    sender: "user@s.whatsapp.net",
    senderIsAdmin: false,
    isOverrideSender: false,
    rawText: "!cupom resgatar EVENTO500",
    cmd: "!cupom resgatar EVENTO500",
    cmdName: "!cupom",
    cmdArg1: "resgatar",
    cmdArg2: "EVENTO500",
    cmdParts: ["!cupom", "resgatar", "EVENTO500"],
    mentioned: [],
  })
  assert.equal(redeemed, true)

  const duplicate = await handleEconomyCommands({
    ...baseCtx,
    sender: "user@s.whatsapp.net",
    senderIsAdmin: false,
    isOverrideSender: false,
    rawText: "!cupom resgatar EVENTO500",
    cmd: "!cupom resgatar EVENTO500",
    cmdName: "!cupom",
    cmdArg1: "resgatar",
    cmdArg2: "EVENTO500",
    cmdParts: ["!cupom", "resgatar", "EVENTO500"],
    mentioned: [],
  })
  assert.equal(duplicate, true)

  assert.equal(credited.length, 1)
  assert.equal(credited[0].userId, "user@s.whatsapp.net")
  assert.equal(credited[0].amount, 500)
  assert.ok(sent.some((entry) => /Cupom criado/i.test(String(entry.payload?.text || ""))))
  assert.ok(sent.some((entry) => /já resgatou este cupom/i.test(String(entry.payload?.text || ""))))
})

test("economy router allows !loteria entrar when opt-in is enabled", async () => {
  const sent = []
  const sock = {
    user: { id: "bot@s.whatsapp.net" },
    async sendMessage(to, payload) {
      sent.push({ to, payload })
    },
    async groupMetadata() {
      return {
        participants: [
          { id: "joiner@s.whatsapp.net" },
          { id: "bot@s.whatsapp.net" },
        ],
      }
    },
  }

  await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "admin@s.whatsapp.net",
    rawText: '!loteria "Opt-in" "Vale cafe" S 1',
    cmd: '!loteria "opt-in" "vale cafe" s 1',
    cmdName: "!loteria",
    cmdArg1: '"opt-in"',
    cmdArg2: '"vale',
    cmdParts: ["!loteria", '"opt-in"', '"vale', 'cafe"', "s", "1"],
    mentioned: [],
    prefix: "!",
    isGroup: true,
    senderIsAdmin: true,
    isOverrideSender: true,
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
      getOperationLimits: () => ({
        maxCoinsBalance: 1_000_000,
        maxCoinOperation: 10_000,
        maxItemStack: 1_000,
        maxItemOperation: 100,
        maxLootboxOpenPerCall: 100,
        maxForgeQuantity: 100,
      }),
      getItemDefinition: () => null,
      creditCoins: () => 0,
      addItem: () => 0,
    },
    parseQuantity: () => 0,
    formatDuration: () => "0m",
    buildGameStatsText: () => "",
    buildEconomyStatsText: () => "",
    buildInventoryText: () => "",
    incrementUserStat: () => {},
    raffleRevealDelayMs: 25,
    raffleOptInWindowMs: 120_000,
  })

  const handledJoin = await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "joiner@s.whatsapp.net",
    rawText: "!loteria entrar",
    cmd: "!loteria entrar",
    cmdName: "!loteria",
    cmdArg1: "entrar",
    cmdArg2: "",
    cmdParts: ["!loteria", "entrar"],
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
      getOperationLimits: () => ({
        maxCoinsBalance: 1_000_000,
        maxCoinOperation: 10_000,
        maxItemStack: 1_000,
        maxItemOperation: 100,
        maxLootboxOpenPerCall: 100,
        maxForgeQuantity: 100,
      }),
      getItemDefinition: () => null,
      creditCoins: () => 0,
      addItem: () => 0,
    },
    parseQuantity: () => 0,
    formatDuration: () => "0m",
    buildGameStatsText: () => "",
    buildEconomyStatsText: () => "",
    buildInventoryText: () => "",
    incrementUserStat: () => {},
    raffleRevealDelayMs: 25,
    raffleOptInWindowMs: 120_000,
  })

  assert.equal(handledJoin, true)
  const joinMessage = sent.find((entry) => /Entrada confirmada na loteria/i.test(String(entry.payload?.text || "")))
  assert.ok(joinMessage)
  assert.ok(!joinMessage.payload.mentions)

  await new Promise((resolve) => setTimeout(resolve, 35))
  assert.ok(!sent.some((entry) => /Resultado da loteria/i.test(String(entry.payload?.text || ""))))

  const handledClose = await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "closer@s.whatsapp.net",
    rawText: "!loteria fechar",
    cmd: "!loteria fechar",
    cmdName: "!loteria",
    cmdArg1: "fechar",
    cmdArg2: "",
    cmdParts: ["!loteria", "fechar"],
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
      getOperationLimits: () => ({
        maxCoinsBalance: 1_000_000,
        maxCoinOperation: 10_000,
        maxItemStack: 1_000,
        maxItemOperation: 100,
        maxLootboxOpenPerCall: 100,
        maxForgeQuantity: 100,
      }),
      getItemDefinition: () => null,
      creditCoins: () => 0,
      addItem: () => 0,
    },
    parseQuantity: () => 0,
    formatDuration: () => "0m",
    buildGameStatsText: () => "",
    buildEconomyStatsText: () => "",
    buildInventoryText: () => "",
    incrementUserStat: () => {},
    raffleRevealDelayMs: 25,
    raffleOptInWindowMs: 120_000,
  })

  assert.equal(handledClose, true)
  assert.ok(sent.some((entry) => /foi fechada\. Sorteando/i.test(String(entry.payload?.text || ""))))
  assert.ok(sent.some((entry) => /Resultado da loteria/i.test(String(entry.payload?.text || ""))))
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
    parsePositiveInt: (value, fallback = 1) => {
      const n = Number.parseInt(String(value ?? ""), 10)
      return Number.isFinite(n) && n > 0 ? n : fallback
    },
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
    parsePositiveInt: (value, fallback = 1) => {
      const n = Number.parseInt(String(value ?? ""), 10)
      return Number.isFinite(n) && n > 0 ? n : fallback
    },
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

test("games router starts 15s lobby bet grace on !começar <LobbyID>", async () => {
  const { sock, sent } = createSockCapture()
  let clearCalled = false
  const setGameStateCalls = []

  const handled = await handleGameCommands({
    sock,
    from: "group@g.us",
    sender: "starter@s.whatsapp.net",
    cmd: "!começar AB",
    cmdName: "!começar",
    cmdArg1: "AB",
    cmdArg2: "",
    mentioned: [],
    prefix: "!",
    isGroup: true,
    text: "!começar AB",
    msg: { message: {} },
    storage: {
      getGameState: () => null,
      getGameStates: () => ({}),
      setGameState: (...args) => setGameStateCalls.push(args),
      clearGameState: () => {},
    },
    gameManager: {
      createOptInSession: () => "AB",
      getOptInSession: () => ({ gameType: "dados", players: ["starter@s.whatsapp.net", "other@s.whatsapp.net"] }),
      addPlayerToOptIn: () => false,
      clearOptInSession: () => {
        clearCalled = true
      },
      optInSessions: {},
    },
    economyService: {
      getCoins: () => 1000,
      debitCoins: () => true,
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
    normalizeLobbyId: (v) => String(v || "").toUpperCase(),
    activeGameKey: () => "dadosActive:AB",
    resolveActiveLobbyForPlayer: () => ({ ok: false, reason: "not-found" }),
    getLobbyCreateBlockMessage: () => null,
    getGameBuyIn: () => 100,
    collectLobbyBuyIn: () => ({ ok: true, pool: 0 }),
    distributeLobbyBuyInPool: async () => {},
    parsePositiveInt: (value, fallback = 1) => {
      const n = Number.parseInt(String(value ?? ""), 10)
      return Number.isFinite(n) && n > 0 ? n : fallback
    },
    isResenhaModeEnabled: () => false,
    rewardPlayer: async () => {},
    rewardPlayers: async () => {},
    incrementUserStat: () => {},
    applyRandomGamePunishment: async () => {},
    createPendingTargetForWinner: async () => {},
    jidNormalizedUser: (id) => id,
    createLobbyWarningCallback: () => {},
    createLobbyTimeoutCallback: () => {},
    buildGameStatsText: () => "",
  })

  assert.equal(handled, true)
  assert.equal(clearCalled, false)
  assert.equal(setGameStateCalls.length >= 1, true)
  assert.match(String(sent[0]?.payload?.text || ""), /período de aposta por 15s/i)
})

test("games router updates player lobby bet with !aposta during grace", async () => {
  const { sock, sent } = createSockCapture()
  const sender = "starter@s.whatsapp.net"
  const graceState = {
    players: [sender],
    buyInAmount: 100,
    playerBetByPlayer: { [sender]: 1 },
  }
  let savedState = null

  const handled = await handleGameCommands({
    sock,
    from: "group@g.us",
    sender,
    cmd: "!aposta 5",
    cmdName: "!aposta",
    cmdArg1: "5",
    cmdArg2: "",
    mentioned: [],
    prefix: "!",
    isGroup: true,
    text: "!aposta 5",
    msg: { message: {} },
    storage: {
      getGameState: (_groupId, key) => (key === "lobbyGrace:AB" ? graceState : null),
      getGameStates: () => ({ "lobbyGrace:AB": graceState }),
      setGameState: (_groupId, _key, state) => {
        savedState = state
      },
      clearGameState: () => {},
    },
    gameManager: {
      createOptInSession: () => "AB",
      getOptInSession: () => null,
      addPlayerToOptIn: () => false,
      clearOptInSession: () => {},
      optInSessions: {},
    },
    economyService: {
      getCoins: () => 1000,
      debitCoins: () => true,
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
    getGameBuyIn: () => 100,
    collectLobbyBuyIn: () => ({ ok: true, pool: 0 }),
    distributeLobbyBuyInPool: async () => {},
    parsePositiveInt: (value, fallback = 1) => {
      const n = Number.parseInt(String(value ?? ""), 10)
      return Number.isFinite(n) && n > 0 ? n : fallback
    },
    isResenhaModeEnabled: () => false,
    rewardPlayer: async () => {},
    rewardPlayers: async () => {},
    incrementUserStat: () => {},
    applyRandomGamePunishment: async () => {},
    createPendingTargetForWinner: async () => {},
    jidNormalizedUser: (id) => id,
    createLobbyWarningCallback: () => {},
    createLobbyTimeoutCallback: () => {},
    buildGameStatsText: () => "",
  })

  assert.equal(handled, true)
  assert.equal(savedState.playerBetByPlayer[sender], 5)
  assert.match(String(sent[0]?.payload?.text || ""), /5x/)
})

test("games router excludes shot player from rr allWin rewards", async () => {
  const { sock, sent } = createSockCapture()
  const shooter = "shot@s.whatsapp.net"
  const other = "other@s.whatsapp.net"
  const distributed = []

  const state = {
    players: [shooter, other],
    buyInPool: 100,
    betMultiplier: 2,
    betValue: 1,
  }

  const handled = await handleGameCommands({
    sock,
    from: "group@g.us",
    sender: shooter,
    cmd: "!atirar",
    cmdName: "!atirar",
    cmdArg1: "",
    cmdArg2: "",
    mentioned: [],
    prefix: "!",
    isGroup: true,
    text: "!atirar",
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
      getCurrentPlayer: () => shooter,
      takeShotAt: () => ({ hit: true, allWin: true, guaranteed: false, winners: [shooter, other] }),
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
    resolveActiveLobbyForPlayer: () => ({ ok: true, lobbyId: "ABCD", stateKey: "rrActive:ABCD", state }),
    getLobbyCreateBlockMessage: () => null,
    getGameBuyIn: () => 0,
    collectLobbyBuyIn: () => ({ ok: true, pool: 0 }),
    distributeLobbyBuyInPool: async (winners) => {
      distributed.push(winners)
    },
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
  assert.equal(distributed.length, 1)
  assert.deepEqual(distributed[0], [other])
  assert.equal(sent.length, 1)
  assert.match(sent[0].payload.text, /quem tomou tiro não recebe prêmio/i)
})

test("games router applies lobby bet payout formula options on rr solo autoWin", async () => {
  const { sock } = createSockCapture()
  const shooter = "solo@s.whatsapp.net"
  const distributeCalls = []

  const handled = await handleGameCommands({
    sock,
    from: "group@g.us",
    sender: shooter,
    cmd: "!atirar",
    cmdName: "!atirar",
    cmdArg1: "",
    cmdArg2: "",
    mentioned: [],
    prefix: "!",
    isGroup: true,
    text: "!atirar",
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
      getCurrentPlayer: () => shooter,
      takeShotAt: () => ({ hit: true, autoWin: true, winners: [shooter], surpassedBet: true }),
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
    resolveActiveLobbyForPlayer: () => ({
      ok: true,
      lobbyId: "ABCD",
      stateKey: "rrActive:ABCD",
      state: {
        players: [shooter],
        buyInPool: 100,
        betValue: 3,
        betMultiplier: 4,
        playerBetByPlayer: { [shooter]: 3 },
        buyInByPlayer: { [shooter]: 300 },
      },
    }),
    getLobbyCreateBlockMessage: () => null,
    getGameBuyIn: () => 0,
    collectLobbyBuyIn: () => ({ ok: true, pool: 0 }),
    distributeLobbyBuyInPool: async (_winners, _pool, _label, options = {}) => {
      distributeCalls.push(options)
    },
    parsePositiveInt: (value, fallback = 1) => {
      const n = Number.parseInt(String(value ?? ""), 10)
      return Number.isFinite(n) && n > 0 ? n : fallback
    },
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
  assert.equal(distributeCalls.length, 1)
  assert.equal(distributeCalls[0].payoutMode, "lobby-bet-formula")
  assert.equal(distributeCalls[0].playerBetByPlayer[shooter], 3)
  assert.equal(distributeCalls[0].buyInByPlayer[shooter], 300)
})

test("games router uses bet value multiplier for rr solo loss", async () => {
  const { sock } = createSockCapture()
  const shooter = "solo@s.whatsapp.net"
  const debitCalls = []

  const handled = await handleGameCommands({
    sock,
    from: "group@g.us",
    sender: shooter,
    cmd: "!atirar",
    cmdName: "!atirar",
    cmdArg1: "",
    cmdArg2: "",
    mentioned: [],
    prefix: "!",
    isGroup: true,
    text: "!atirar",
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
      debitCoinsFlexible: (userId, amount) => {
        debitCalls.push({ userId, amount })
        return amount
      },
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
      getCurrentPlayer: () => shooter,
      takeShotAt: () => ({ hit: true, loser: shooter, surpassedBet: false }),
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
    resolveActiveLobbyForPlayer: () => ({
      ok: true,
      lobbyId: "ABCD",
      stateKey: "rrActive:ABCD",
      state: { players: [shooter], buyInPool: 100, betValue: 3, betMultiplier: 4 },
    }),
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
  assert.equal(debitCalls.length, 1)
  assert.equal(debitCalls[0].amount, 90)
})

test("games router uses loser bet map for rr punishment severity when available", async () => {
  const { sock } = createSockCapture()
  const shooter = "solo@s.whatsapp.net"
  const other = "other@s.whatsapp.net"
  const applied = []
  const xpCalls = []

  const handled = await handleGameCommands({
    sock,
    from: "group@g.us",
    sender: shooter,
    cmd: "!atirar",
    cmdName: "!atirar",
    cmdArg1: "",
    cmdArg2: "",
    mentioned: [],
    prefix: "!",
    isGroup: true,
    text: "!atirar",
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
      addXp: (userId, amount) => {
        xpCalls.push({ userId, amount })
      },
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
      getCurrentPlayer: () => shooter,
      takeShotAt: () => ({ hit: true, loser: shooter, surpassedBet: false }),
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
    resolveActiveLobbyForPlayer: () => ({
      ok: true,
      lobbyId: "ABCD",
      stateKey: "rrActive:ABCD",
      state: {
        players: [shooter, other],
        buyInPool: 0,
        betValue: 3,
        betMultiplier: 4,
        playerBetByPlayer: { [shooter]: 2 },
      },
    }),
    getLobbyCreateBlockMessage: () => null,
    getGameBuyIn: () => 0,
    collectLobbyBuyIn: () => ({ ok: true, pool: 0 }),
    distributeLobbyBuyInPool: async () => {},
    parsePositiveInt: (value, fallback = 1) => {
      const n = Number.parseInt(String(value ?? ""), 10)
      return Number.isFinite(n) && n > 0 ? n : fallback
    },
    isResenhaModeEnabled: () => false,
    rewardPlayer: async () => {},
    rewardPlayers: async () => {},
    incrementUserStat: () => {},
    applyRandomGamePunishment: async (_targetId, options = {}) => {
      applied.push(options)
    },
    createPendingTargetForWinner: async () => {},
    jidNormalizedUser: (id) => id,
    createLobbyWarningCallback: () => {},
    buildGameStatsText: () => "",
  })

  assert.equal(handled, true)
  assert.equal(applied.length, 1)
  assert.equal(applied[0].severityMultiplier, 2)
  assert.ok(xpCalls.some((entry) => entry.userId === shooter && entry.amount === 12))
  assert.ok(xpCalls.some((entry) => entry.userId === other && entry.amount === 30))
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

test("economy router does not show nickname warning for non-economy commands", async () => {
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
      isMentionOptIn: () => false,
      getProfile: () => ({
        coins: 0,
        shields: 0,
        buffs: {},
        inventory: {},
        preferences: { publicLabel: "" },
      }),
      getStatement: () => [],
      getGroupRanking: () => [],
      getShopIndexText: () => "shop",
    },
    registrationService: {
      isRegistered: () => true,
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

test("economy router shows registration message for unregistered sender", async () => {
  const { sock, sent } = createSockCapture()

  const handled = await handleEconomyCommands({
    sock,
    from: "group@g.us",
    sender: "user@s.whatsapp.net",
    cmd: "!extrato",
    cmdName: "!extrato",
    cmdArg1: "",
    cmdArg2: "",
    cmdParts: ["!extrato"],
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
      isMentionOptIn: () => false,
      getProfile: () => ({
        coins: 0,
        shields: 0,
        buffs: {},
        inventory: {},
        preferences: { publicLabel: "" },
      }),
      getStatement: () => [],
      getGroupRanking: () => [],
      getShopIndexText: () => "shop",
    },
    registrationService: {
      isRegistered: () => false,
    },
    parseQuantity: () => 0,
    formatDuration: () => "0m",
    buildEconomyStatsText: () => "",
    buildInventoryText: () => "",
    incrementUserStat: () => {},
  })

  assert.equal(handled, true)
  assert.ok(sent.length > 0)
  assert.match(String(sent[0].payload?.text || ""), /exige cadastro/i)
  assert.match(String(sent[0].payload?.text || ""), /!register/i)
  assert.ok(!/apelido/i.test(String(sent[0].payload?.text || "")))
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
  assert.match(sent[0].payload.text, /!ajuda <comando>/i)
  assert.match(sent[0].payload.text, /feedback/i)
})

test("utility router handles !ajuda command and DMs help in group", async () => {
  const { sock, sent } = createSockCapture()
  const sender = "user@s.whatsapp.net"

  const handled = await handleUtilityCommands({
    sock,
    from: "group@g.us",
    sender,
    cmd: "!ajuda economia",
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
  assert.equal(sent.length, 2)
  assert.equal(sent[0].to, sender)
  assert.match(String(sent[0].payload?.text || ""), /Economia/i)
  assert.equal(sent[1].to, "group@g.us")
  assert.match(String(sent[1].payload?.text || ""), /enviei a ajuda/i)
})

test("utility router handles !feedback command", async () => {
  const { sock, sent } = createSockCapture()

  const handled = await handleUtilityCommands({
    sock,
    from: "group@g.us",
    sender: "user@s.whatsapp.net",
    cmd: "!feedback",
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
  assert.match(String(sent[0].payload?.text || ""), /wa\.me\/\+5521995409899/i)
  assert.match(String(sent[0].payload?.text || ""), /wa\.me\/\+557398579450/i)
})

test("utility router handles !feedbackpriv and forwards next group message to override DM once", async () => {
  __resetUtilityRouterStateForTests()
  const { sock, sent } = createSockCapture()
  const override = "override@s.whatsapp.net"

  const armed = await handleUtilityCommands({
    sock,
    from: "group@g.us",
    sender: "user@s.whatsapp.net",
    rawText: "!feedbackpriv",
    isCommand: true,
    cmd: "!feedbackpriv",
    prefix: "!",
    isGroup: true,
    overrideJid: override,
    msg: { message: {} },
    quoted: null,
    mentioned: [],
    sharp: () => ({}),
    downloadMediaMessage: async () => null,
    logger: {},
    videoToSticker: async () => null,
    dddMap: {},
  })

  const forwarded = await handleUtilityCommands({
    sock,
    from: "group@g.us",
    sender: "user@s.whatsapp.net",
    rawText: "Meu feedback privado",
    isCommand: false,
    cmd: "meu feedback privado",
    prefix: "!",
    isGroup: true,
    overrideJid: override,
    msg: { message: {} },
    quoted: null,
    mentioned: [],
    sharp: () => ({}),
    downloadMediaMessage: async () => null,
    logger: {},
    videoToSticker: async () => null,
    dddMap: {},
  })

  const afterOneShot = await handleUtilityCommands({
    sock,
    from: "group@g.us",
    sender: "user@s.whatsapp.net",
    rawText: "Mensagem normal",
    isCommand: false,
    cmd: "mensagem normal",
    prefix: "!",
    isGroup: true,
    overrideJid: override,
    msg: { message: {} },
    quoted: null,
    mentioned: [],
    sharp: () => ({}),
    downloadMediaMessage: async () => null,
    logger: {},
    videoToSticker: async () => null,
    dddMap: {},
  })

  assert.equal(armed, true)
  assert.equal(forwarded, true)
  assert.equal(afterOneShot, false)
  assert.equal(sent.length, 3)
  assert.match(String(sent[0].payload?.text || ""), /Modo feedback privado ativado/i)
  assert.equal(sent[1].to, override)
  assert.match(String(sent[1].payload?.text || ""), /FEEDBACK PRIVADO/i)
  assert.match(String(sent[1].payload?.text || ""), /Origem: grupo/i)
  assert.match(String(sent[1].payload?.text || ""), /Meu feedback privado/i)
  assert.equal(sent[2].to, "group@g.us")
  assert.match(String(sent[2].payload?.text || ""), /enviado com sucesso/i)
})

test("utility router handles !feedbackpriv in DM and forwards command-like next message", async () => {
  __resetUtilityRouterStateForTests()
  const { sock, sent } = createSockCapture()
  const override = "override@s.whatsapp.net"
  const sender = "user@s.whatsapp.net"

  const armed = await handleUtilityCommands({
    sock,
    from: sender,
    sender,
    rawText: "!feedbackpriv",
    isCommand: true,
    cmd: "!feedbackpriv",
    prefix: "!",
    isGroup: false,
    overrideJid: override,
    msg: { message: {} },
    quoted: null,
    mentioned: [],
    sharp: () => ({}),
    downloadMediaMessage: async () => null,
    logger: {},
    videoToSticker: async () => null,
    dddMap: {},
  })

  const forwarded = await handleUtilityCommands({
    sock,
    from: sender,
    sender,
    rawText: "!quero reportar bug no saldo",
    isCommand: true,
    cmd: "!quero reportar bug no saldo",
    prefix: "!",
    isGroup: false,
    overrideJid: override,
    msg: { message: {} },
    quoted: null,
    mentioned: [],
    sharp: () => ({}),
    downloadMediaMessage: async () => null,
    logger: {},
    videoToSticker: async () => null,
    dddMap: {},
  })

  assert.equal(armed, true)
  assert.equal(forwarded, true)
  assert.equal(sent.length, 3)
  assert.equal(sent[1].to, override)
  assert.match(String(sent[1].payload?.text || ""), /Origem: privado/i)
  assert.match(String(sent[1].payload?.text || ""), /Comando: S/i)
  assert.match(String(sent[1].payload?.text || ""), /!quero reportar bug no saldo/i)
  assert.equal(sent[2].to, sender)
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

test("utility router handles !ping command", async () => {
  const { sock, sent } = createSockCapture()

  const handled = await handleUtilityCommands({
    sock,
    from: "group@g.us",
    sender: "user@s.whatsapp.net",
    cmd: "!ping",
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
  assert.equal(sent.length, 2)
  assert.match(String(sent[0].payload?.text || ""), /Pong/i)
  assert.match(String(sent[1].payload?.text || ""), /Latência de resposta/i)
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
    botHasGroupAdminPrivileges: true,
  })

  assert.equal(handled, true)
  assert.equal(sent.length, 2)
  assert.equal(sent[0].to, sender)
  assert.match(sent[0].payload.text, /PUNIÇÕES DETALHADAS/)
  assert.equal(sent[1].to, "group@g.us")
  assert.match(sent[1].payload.text, /enviei a lista de punições no privado/i)
})

test("moderation router applies !punicoesadd severity right after punishment number", async () => {
  const { sock } = createSockCapture()
  const target = "alvo@s.whatsapp.net"
  const applied = []

  const handled = await handleModerationCommands({
    sock,
    msg: { message: {} },
    from: "group@g.us",
    sender: "admin@s.whatsapp.net",
    text: "!punicoesadd @alvo 7 3",
    cmd: "!punicoesadd @alvo 7 3",
    cmdName: "!punicoesadd",
    prefix: "!",
    isGroup: true,
    senderIsAdmin: true,
    mentioned: [target],
    jidNormalizedUser: (id) => String(id || "").split(":")[0],
    storage: {
      getActivePunishments: () => ({}),
      getCoinPunishmentPending: () => ({}),
      setActivePunishments: () => {},
      setCoinPunishmentPending: () => {},
    },
    clearPunishment: () => {},
    clearPendingPunishment: () => {},
    getPunishmentMenuText: () => "MENU",
    getPunishmentChoiceFromText: (value = "") => {
      const normalized = String(value || "").trim()
      return /^(?:1[0-3]|[1-9])$/.test(normalized) ? normalized : null
    },
    applyPunishment: async (_sock, _from, userId, punishmentId, options) => {
      applied.push({ userId, punishmentId, options })
    },
    overrideChecksEnabled: false,
    overrideJid: "",
    overrideIdentifiers: [],
  })

  assert.equal(handled, true)
  assert.equal(applied.length, 1)
  assert.equal(applied[0].userId, target)
  assert.equal(applied[0].punishmentId, "7")
  assert.equal(applied[0].options?.severityMultiplier, 3)
})

test("moderation router blocks user globally with !block", async () => {
  const { sock, sent } = createSockCapture()
  const target = "alvo@s.whatsapp.net"
  const added = []

  const handled = await handleModerationCommands({
    sock,
    msg: { message: {} },
    from: "group@g.us",
    sender: "admin@s.whatsapp.net",
    text: "!block @alvo",
    cmd: "!block @alvo",
    cmdName: "!block",
    cmdArg1: "",
    prefix: "!",
    isGroup: true,
    senderIsAdmin: true,
    mentioned: [target],
    jidNormalizedUser: (id) => String(id || "").split(":")[0],
    storage: {
      addGlobalBlockedUsers: (identities) => {
        added.push(...identities)
        return identities
      },
    },
    clearPunishment: () => {},
    clearPendingPunishment: () => {},
    getPunishmentMenuText: () => "MENU",
    getPunishmentChoiceFromText: () => null,
    applyPunishment: async () => {},
    overrideChecksEnabled: false,
    overrideJid: "",
    overrideIdentifiers: [],
  })

  assert.equal(handled, true)
  assert.ok(added.includes(target))
  assert.ok(added.includes("alvo"))
  assert.ok(added.includes("alvo@s.whatsapp.net"))
  assert.ok(added.includes("alvo@lid"))
  assert.ok(sent.some((entry) => /bloqueado para uso de comandos/i.test(String(entry.payload?.text || ""))))
})

test("moderation router resolves !vote at threshold", async () => {
  const { sock, sent } = createSockCapture()
  const sessions = {}
  const mutedUsers = {}

  const makeCtx = (sender) => ({
    sock,
    msg: { message: {} },
    from: "group@g.us",
    sender,
    text: "!vote @alvo",
    cmd: "!vote @alvo",
    cmdName: "!vote",
    cmdArg1: "",
    prefix: "!",
    isGroup: true,
    senderIsAdmin: false,
    mentioned: ["alvo@s.whatsapp.net"],
    jidNormalizedUser: (id) => String(id || "").split(":")[0],
    storage: {
      getGroupVoteThreshold: () => 2,
      getGroupVoteSessions: () => ({ ...sessions }),
      setGroupVoteSessions: (_groupId, next) => {
        Object.keys(sessions).forEach((key) => delete sessions[key])
        Object.assign(sessions, next || {})
      },
      getMutedUsers: () => mutedUsers,
      setMutedUsers: () => {},
    },
    clearPunishment: () => {},
    clearPendingPunishment: () => {},
    getPunishmentMenuText: () => "MENU",
    getPunishmentChoiceFromText: () => null,
    applyPunishment: async () => {},
    overrideChecksEnabled: false,
    overrideJid: "",
    overrideIdentifiers: [],
  })

  const randomOriginal = Math.random
  Math.random = () => 0.1
  try {
    const first = await handleModerationCommands(makeCtx("v1@s.whatsapp.net"))
    const second = await handleModerationCommands(makeCtx("v2@s.whatsapp.net"))
    assert.equal(first, true)
    assert.equal(second, true)
    assert.equal(mutedUsers["group@g.us"]?.["alvo@s.whatsapp.net"], true)
    assert.ok(sent.some((entry) => /Votação encerrada/i.test(String(entry.payload?.text || ""))))
  } finally {
    Math.random = randomOriginal
  }
})

test("moderation router handles !jidsgrupo and sends JIDs in sender DM", async () => {
  const { sock, sent } = createSockCapture()
  const sender = "override@s.whatsapp.net"
  const target = "alvo@s.whatsapp.net"

  const handled = await handleModerationCommands({
    sock,
    msg: { message: {} },
    from: "group@g.us",
    sender,
    text: "!jidsgrupo @alvo",
    cmd: "!jidsgrupo @alvo",
    cmdName: "!jidsgrupo",
    cmdArg1: "",
    prefix: "!",
    isGroup: true,
    senderIsAdmin: false,
    mentioned: [target],
    jidNormalizedUser: (id) => String(id || "").split(":")[0],
    storage: {
      getMutedUsers: () => ({}),
      setMutedUsers: () => {},
      getCoinPunishmentPending: () => ({}),
      getActivePunishments: () => ({}),
    },
    clearPunishment: () => {},
    clearPendingPunishment: () => {},
    getPunishmentMenuText: () => "MENU",
    getPunishmentChoiceFromText: () => null,
    applyPunishment: async () => {},
    overrideChecksEnabled: true,
    overrideJid: sender,
    overrideIdentifiers: [sender],
  })

  assert.equal(handled, true)
  const dmPayload = sent.find((entry) => entry.to === sender)?.payload?.text || ""
  const groupPayload = sent.find((entry) => entry.to === "group@g.us")?.payload?.text || ""
  assert.ok(/Identidades conhecidas/i.test(String(dmPayload)))
  assert.ok(String(dmPayload).includes(target))
  assert.ok(/enviei os JIDs no seu privado/i.test(String(groupPayload)))
})

test("utility router handles hidden !comandosfull only for override in DM", async () => {
  const { sock, sent } = createSockCapture()
  const sender = "override@s.whatsapp.net"

  const handled = await handleUtilityCommands({
    sock,
    from: sender,
    sender,
    cmd: "!comandosfull",
    prefix: "!",
    isGroup: false,
    isOverrideSender: true,
    msg: { message: {} },
    quoted: null,
    mentioned: [],
    sharp: () => ({}),
    downloadMediaMessage: async () => null,
    logger: {},
    videoToSticker: async () => null,
    dddMap: {},
    jidNormalizedUser: (id) => id,
  })

  assert.equal(handled, true)
  assert.ok(sent.length >= 1)
  assert.ok(sent.some((entry) => /toggleover/i.test(String(entry.payload?.text || ""))))
  assert.ok(sent.some((entry) => /toggleoverride/i.test(String(entry.payload?.text || ""))))
  assert.ok(sent.some((entry) => /overrideadd/i.test(String(entry.payload?.text || ""))))
  assert.ok(sent.some((entry) => /jidsgrupo/i.test(String(entry.payload?.text || ""))))
  assert.ok(sent.some((entry) => /overridetest/i.test(String(entry.payload?.text || ""))))
})

test("utility router ignores !comandosfull for non-override sender", async () => {
  const { sock, sent } = createSockCapture()

  const handled = await handleUtilityCommands({
    sock,
    from: "user@s.whatsapp.net",
    sender: "user@s.whatsapp.net",
    cmd: "!comandosfull",
    prefix: "!",
    isGroup: false,
    isOverrideSender: false,
    msg: { message: {} },
    quoted: null,
    mentioned: [],
    sharp: () => ({}),
    downloadMediaMessage: async () => null,
    logger: {},
    videoToSticker: async () => null,
    dddMap: {},
    jidNormalizedUser: (id) => id,
  })

  assert.equal(handled, false)
  assert.equal(sent.length, 0)
})

test("utility router renders only requested !comandosfull section", async () => {
  const { sock, sent } = createSockCapture()
  const sender = "override@s.whatsapp.net"

  const handled = await handleUtilityCommands({
    sock,
    from: sender,
    sender,
    cmd: "!comandosfull economia detalhes",
    prefix: "!",
    isGroup: false,
    isOverrideSender: true,
    msg: { message: {} },
    quoted: null,
    mentioned: [],
    sharp: () => ({}),
    downloadMediaMessage: async () => null,
    logger: {},
    videoToSticker: async () => null,
    dddMap: {},
    jidNormalizedUser: (id) => id,
  })

  assert.equal(handled, true)
  assert.equal(sent.length, 2)
  assert.match(String(sent[0].payload?.text || ""), /Secoes disponiveis/i)
  assert.match(String(sent[1].payload?.text || ""), /Economia Base \(economia\)/i)
  assert.ok(!/Ocultos e Restritos/i.test(String(sent[1].payload?.text || "")))
})

test("utility router reports invalid !comandosfull section", async () => {
  const { sock, sent } = createSockCapture()
  const sender = "override@s.whatsapp.net"

  const handled = await handleUtilityCommands({
    sock,
    from: sender,
    sender,
    cmd: "!comandosfull secaoinexistente",
    prefix: "!",
    isGroup: false,
    isOverrideSender: true,
    msg: { message: {} },
    quoted: null,
    mentioned: [],
    sharp: () => ({}),
    downloadMediaMessage: async () => null,
    logger: {},
    videoToSticker: async () => null,
    dddMap: {},
    jidNormalizedUser: (id) => id,
  })

  assert.equal(handled, true)
  assert.equal(sent.length, 2)
  assert.match(String(sent[1].payload?.text || ""), /Secao invalida/i)
})

test("utility router blocks !comandosfull in group chats", async () => {
  const { sock, sent } = createSockCapture()

  const handled = await handleUtilityCommands({
    sock,
    from: "group@g.us",
    sender: "override@s.whatsapp.net",
    cmd: "!comandosfull",
    prefix: "!",
    isGroup: true,
    isOverrideSender: true,
    msg: { message: {} },
    quoted: null,
    mentioned: [],
    sharp: () => ({}),
    downloadMediaMessage: async () => null,
    logger: {},
    videoToSticker: async () => null,
    dddMap: {},
    jidNormalizedUser: (id) => id,
  })

  assert.equal(handled, false)
  assert.equal(sent.length, 0)
})

test("cleanupUserLinkedState removes team membership and deletes empty team", () => {
  const state = {
    membersByTeam: {
      TEAM1: ["member@s.whatsapp.net"],
    },
  }

  const storage = {
    getUserTeamId: (userId) => (userId === "member@s.whatsapp.net" ? "TEAM1" : null),
    removeTeamMember: (teamId, userId) => {
      const members = state.membersByTeam[teamId] || []
      const idx = members.indexOf(userId)
      if (idx < 0) return false
      members.splice(idx, 1)
      return true
    },
    getTeamMembers: (teamId) => state.membersByTeam[teamId] || [],
    deleteTeam: (teamId) => {
      delete state.membersByTeam[teamId]
      return true
    },
  }

  const summary = cleanupUserLinkedState(storage, "member@s.whatsapp.net")
  assert.equal(summary.teamsLeft, 1)
  assert.equal(summary.teamsDeleted, 1)
  assert.equal(summary.tradesCancelled, 0)
})

test("cleanupUserLinkedState cancels active trades for deleted user", () => {
  const now = Date.now
  Date.now = () => 1234567890

  try {
    const states = {
      "group-a@g.us": {
        trades: {
          T1: {
            status: "active",
            phase: "review",
            initiator: "member@s.whatsapp.net",
            counterparty: "other@s.whatsapp.net",
            events: [],
          },
          T2: {
            status: "active",
            phase: "review",
            initiator: "x@s.whatsapp.net",
            counterparty: "y@s.whatsapp.net",
            events: [],
          },
          T3: {
            status: "completed",
            phase: "completed",
            initiator: "member@s.whatsapp.net",
            counterparty: "other@s.whatsapp.net",
            events: [],
          },
        },
        history: [],
      },
    }

    const updates = []
    const storage = {
      getUserTeamId: () => null,
      getCache: () => ({ gameStates: { "group-a@g.us": {} } }),
      getGameState: (groupId) => states[groupId],
      setGameState: (groupId, _key, value) => {
        updates.push({ groupId, value })
        states[groupId] = value
      },
    }

    const summary = cleanupUserLinkedState(storage, "member@s.whatsapp.net")

    assert.equal(summary.teamsLeft, 0)
    assert.equal(summary.teamsDeleted, 0)
    assert.equal(summary.tradesCancelled, 1)
    assert.equal(updates.length, 1)
    assert.equal(states["group-a@g.us"].trades.T1.status, "cancelled")
    assert.equal(states["group-a@g.us"].trades.T1.phase, "cancelled")
    assert.equal(states["group-a@g.us"].trades.T2.status, "active")
    assert.equal(states["group-a@g.us"].trades.T3.status, "completed")
    assert.equal(states["group-a@g.us"].trades.T1.events[0].type, "trade.cancelled.account-delete")
  } finally {
    Date.now = now
  }
})
