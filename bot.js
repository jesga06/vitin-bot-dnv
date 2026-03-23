process.on("uncaughtException", console.error)
process.on("unhandledRejection", console.error)

const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion, 
  DisconnectReason, 
  downloadMediaMessage,
  jidNormalizedUser
} = require("@whiskeysockets/baileys")
const express = require("express")
const pino = require("pino")
const QRCode = require("qrcode")
const sharp = require("sharp")
const fs = require("fs")
const path = require("path")
const ffmpeg = require("fluent-ffmpeg")
const ffmpegPath = require("ffmpeg-static")
ffmpeg.setFfmpegPath(ffmpegPath)

// IMPORTS: armazenamento e gerenciador de jogos
const storage = require("./storage")
const punishmentService = require("./punishmentService")
const caraOuCoroa = require("./games/caraOuCoroa")
const gameManager = require("./gameManager")
const adivinhacao = require("./games/adivinhacao")
const batataquente = require("./games/batataquente")
const dueloDados = require("./games/dueloDados")
const roletaRussa = require("./games/roletaRussa")
const reação = require("./games/reacao")
const embaralhado = require("./games/embaralhado")
const comando = require("./games/comando")
const memória = require("./games/memoria")
const economyService = require("./economyService")
const telemetry = require("./telemetryService")
const { handleGameCommands, handleGameMessageFlow } = require("./routers/gamesRouter")
const { handleUtilityCommands } = require("./routers/utilityRouter")
const { handleModerationCommands } = require("./routers/moderationRouter")
const { handleEconomyCommands } = require("./routers/economyRouter")

const app = express()
const logger = pino({ level: "silent" })

const prefix = "!"

let qrImage = null

const {
  getPunishmentChoiceFromText,
  getRandomPunishmentChoice,
  getPunishmentNameById,
  getPunishmentMenuText,
  getPunishmentDetailsText,
  clearPendingPunishment,
  clearPunishment,
  applyPunishment,
  handlePunishmentEnforcement,
  handlePendingPunishmentChoice,
} = punishmentService

// Sobrescrita de identidade para comandos administrativos especiais
const overrideJid = jidNormalizedUser("279202939035898@s.whatsapp.net")
const overridePhoneNumber = "279202939035898"
const overrideIdentifiers = [
  "279202939035898@lid",
  "279202939035898@s.whatsapp.net",
  "279202939035898",
]
const OVERRIDE_CONTROL_SCOPE = "__system__"
const OVERRIDE_CONTROL_KEY = "overrideControl"

function normalizeOverrideIdentity(value = "") {
  return String(value || "").trim().toLowerCase().split(":")[0]
}

function getOverrideIdentitySet() {
  return new Set(overrideIdentifiers.map(normalizeOverrideIdentity).filter(Boolean))
}

function isKnownOverrideIdentity(identity = "") {
  const normalized = normalizeOverrideIdentity(identity)
  if (!normalized) return false

  const overrideSet = getOverrideIdentitySet()
  if (overrideSet.has(normalized)) return true

  const userPart = normalized.split("@")[0]
  return Boolean(userPart && overrideSet.has(userPart))
}

function getOverrideChecksEnabled() {
  const controlState = storage.getGameState(OVERRIDE_CONTROL_SCOPE, OVERRIDE_CONTROL_KEY)
  if (typeof controlState?.enabled !== "boolean") return true
  return controlState.enabled
}

function setOverrideChecksEnabled(enabled) {
  storage.setGameState(OVERRIDE_CONTROL_SCOPE, OVERRIDE_CONTROL_KEY, {
    enabled: Boolean(enabled),
    updatedAt: Date.now(),
  })
}

function isOverrideIdentity(identity = "") {
  if (!getOverrideChecksEnabled()) return false
  return isKnownOverrideIdentity(identity)
}

const dddMap = {
  // Sudeste
  "11": "Sudeste","12": "Sudeste","13": "Sudeste","14": "Sudeste","15": "Sudeste",
  "16": "Sudeste","17": "Sudeste","18": "Sudeste","19": "Sudeste",
  "21": "Sudeste","22": "Sudeste","24": "Sudeste",
  "31": "Sudeste","32": "Sudeste","33": "Sudeste","34": "Sudeste","35": "Sudeste","37": "Sudeste","38": "Sudeste",

  // Sul
  "41": "Sul","42": "Sul","43": "Sul","44": "Sul","45": "Sul","46": "Sul",
  "47": "Sul","48": "Sul","49": "Sul",
  "51": "Sul","53": "Sul","54": "Sul","55": "Sul",

  // Nordeste
  "71": "Nordeste","73": "Nordeste","74": "Nordeste","75": "Nordeste","79": "Nordeste",
  "81": "Nordeste","82": "Nordeste","83": "Nordeste","84": "Nordeste","85": "Nordeste",
  "86": "Nordeste","87": "Nordeste","88": "Nordeste","89": "Nordeste",

  // Norte
  "91": "Norte","92": "Norte","93": "Norte","94": "Norte","95": "Norte","96": "Norte",
  "97": "Norte","98": "Norte","99": "Norte",

  // Centro-Oeste
  "61": "Centro-Oeste","62": "Centro-Oeste","64": "Centro-Oeste","63": "Centro-Oeste",
  "65": "Centro-Oeste","66": "Centro-Oeste","67": "Centro-Oeste",
}

app.get("/", (req,res)=>{
  if(qrImage) return res.send(`<h2>Escaneie o QR Code</h2><img src="${qrImage}">`)
  res.send("<h2>Bot conectado</h2>")
})

const PORT = process.env.PORT || 3000
app.listen(PORT,()=>console.log("Servidor rodando na porta " + PORT))

// =========================
// VIDEO PARA STICKER
// =========================
async function videoToSticker(buffer){
  const input = "./input.mp4"
  const output = "./output.webp"

  fs.writeFileSync(input, buffer)

  await new Promise((resolve,reject)=>{
    ffmpeg(input)
      .outputOptions([
        "-vcodec libwebp",
        "-vf scale=512:512:flags=lanczos", // força deformação completa para 512x512
        "-loop 0",
        "-preset default",
        "-an",
        "-vsync 0"
      ])
      .toFormat("webp")
      .save(output)
      .on("end", resolve)
      .on("error", reject)
  })

  const sticker = fs.readFileSync(output)
  fs.unlinkSync(input)
  fs.unlinkSync(output)
  return sticker
}

// =========================
// INICIAR BOT
// =========================
async function startBot(){
  const authDir = process.env.BOT_AUTH_DIR
    ? path.resolve(process.env.BOT_AUTH_DIR)
    : path.join(__dirname, ".data", "auth")
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true })
  }
  const { state, saveCreds } = await useMultiFileAuthState(authDir)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal:false,
    browser:["VitinBot","Chrome","1.0"]
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", async(update)=>{
    const { connection, qr, lastDisconnect } = update

    if(qr){
      qrImage = await QRCode.toDataURL(qr)
      console.log("QR GERADO")
    }

    if(connection === "open"){
      console.log("BOT ONLINE")
      qrImage = null
    }

    if(connection === "close"){
      const reason = lastDisconnect?.error?.output?.statusCode
      if(reason !== DisconnectReason.loggedOut){
        console.log("Reconectando...")
        setTimeout(startBot,5000)
      }
    }
  })

  sock.ev.on("messages.upsert", async ({ messages })=>{
    try {
    const msg = messages[0]
    if(!msg.message) return
    if(msg.key.fromMe) return

    const from = msg.key.remoteJid
    const senderRaw = msg.key.participant || msg.key.remoteJid
    const sender = jidNormalizedUser(senderRaw)
    const isOverrideSender = isOverrideIdentity(sender)
    const isGroup = from.endsWith("@g.us")

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      ""

    const cmd = text.toLowerCase().trim()
    const isCommand = cmd.startsWith(prefix)
    const cmdParts = cmd.split(/\s+/)
    const cmdName = cmdParts[0] || ""
    const cmdArg1 = cmdParts[1] || ""
    const cmdArg2 = cmdParts[2] || ""
    const mentioned = (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []).map(jidNormalizedUser)
    let quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    const overrideChecksEnabled = getOverrideChecksEnabled()

    if (isCommand) {
      telemetry.markCommand(cmdName, {
        group: isGroup,
        groupId: isGroup ? from : null,
      })
    }

    if (cmdName === prefix + "toggleover") {
      if (isGroup) return
      if (!isKnownOverrideIdentity(sender)) return

      const nextEnabled = !overrideChecksEnabled
      setOverrideChecksEnabled(nextEnabled)
      await sock.sendMessage(from, {
        text: nextEnabled
          ? "Override global: ATIVADO"
          : "Override global: DESATIVADO",
      })
      return
    }

    // =========================
    // IDENTIFICAÇÃO DE ADMIN
    // =========================
    let senderIsAdmin = false
    if (isGroup && isCommand) {
      const delegatedAdmin = storage.isDelegatedAdmin(from, sender)
      const metadata = await sock.groupMetadata(from)
      const admins = (metadata?.participants || [])
        .filter((p) => p.admin)
        .map((p) => jidNormalizedUser(p.id))
      senderIsAdmin = delegatedAdmin || admins.includes(sender)
    }

    // =========================
    // ESCOLHA PENDENTE DE PUNIÇÃO
    // =========================
    const handledPendingPunishment = await handlePendingPunishmentChoice({
      sock,
      from,
      sender,
      text,
      mentioned,
      isGroup,
      senderIsAdmin: senderIsAdmin || isOverrideSender,
      isCommand,
    })
    if (handledPendingPunishment) return

    // =========================
    // APLICAÇÃO DE PUNIÇÃO ATIVA
    // =========================
    const punishedMessageDeleted = await handlePunishmentEnforcement(
      sock,
      msg,
      from,
      sender,
      text,
      isGroup,
      (senderIsAdmin || isOverrideSender) && isCommand
    )
    if (punishedMessageDeleted) return

    if (cmd === prefix + "resenha"){
      if (!isGroup) {
        await sock.sendMessage(from, { text: "Esse comando só funciona em grupo." })
        return
      }

      if (!senderIsAdmin) {
        await sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
        return
      }

      const resenhaAveriguada = storage.getResenhaAveriguada()
      resenhaAveriguada[from] = !resenhaAveriguada[from]
      storage.setResenhaAveriguada(resenhaAveriguada)

      await sock.sendMessage(from, {
        text: resenhaAveriguada[from]
          ? "Modo resenha ATIVADO: punições dos jogos estão habilitadas."
          : "Modo resenha DESATIVADO: punições dos jogos estão bloqueadas."
      })
      return
    }

    // =========================
    // RESPOSTA PENDENTE DO CARA OU COROA
    // =========================
    const handledCoinGuess = await caraOuCoroa.handleCoinGuess({
      sock,
      from,
      sender,
      cmd,
      isGroup,
      overrideChecksEnabled,
      overrideJid,
      overridePhoneNumber,
      overrideIdentifiers,
      getPunishmentMenuText,
      getRandomPunishmentChoice,
      getPunishmentNameById,
      applyPunishment,
      clearPendingPunishment,
      rewardWinner: async (winnerId, rewardMultiplier = 1) => {
        const safeMultiplier = Number.isFinite(Number(rewardMultiplier)) && Number(rewardMultiplier) > 0
          ? Math.floor(Number(rewardMultiplier))
          : 1
        const amount = 25 * safeMultiplier
        economyService.creditCoins(winnerId, amount, {
          type: "game-reward",
          details: "Recompensa de Cara ou Coroa",
          meta: { game: "caraoucoroa" },
        })
        incrementUserStat(winnerId, "gameCoinWin", 1)
        incrementUserStat(winnerId, "moneyGameWon", amount)
        if (safeMultiplier > 1) {
          incrementUserStat(winnerId, "gameDobroWin", 1)
        }
        await sock.sendMessage(from, {
          text: `💰 @${winnerId.split("@")[0]} ganhou *${amount}* Epsteincoins (Cara ou Coroa).`,
          mentions: [winnerId],
        })
      },
      chargeLoser: async (loserId, lossMultiplier = 1) => {
        const safeMultiplier = Number.isFinite(Number(lossMultiplier)) && Number(lossMultiplier) > 0
          ? Math.floor(Number(lossMultiplier))
          : 1
        const amount = 25 * safeMultiplier
        const taken = economyService.debitCoinsFlexible(loserId, amount, {
          type: "game-loss",
          details: "Derrota em Cara ou Coroa",
          meta: { game: "caraoucoroa" },
        })
        incrementUserStat(loserId, "gameCoinLoss", 1)
        if (safeMultiplier > 1) {
          incrementUserStat(loserId, "gameDobroLoss", 1)
        }
        if (taken > 0) {
          incrementUserStat(loserId, "moneyGameLost", taken)
        }
        if (taken > 0) {
          await sock.sendMessage(from, {
            text: `💸 @${loserId.split("@")[0]} perdeu *${taken}* Epsteincoins (Cara ou Coroa).`,
            mentions: [loserId],
          })
        }
      },
    })
    if (handledCoinGuess) return

    // =========================
    // JOGOS MULTIPLAYER
    // =========================

    const normalizeLobbyId = gameManager.normalizeLobbyId
    const activeGameKey = (gameType, lobbyId) => `${gameType}Active:${lobbyId}`
    const activePrefix = (gameType) => `${gameType}Active:`
    const getGroupGameStates = () => storage.getGameStates(from)

    const PERIODIC_CONTROL_STATE_KEY = "periodicControl"
    const PERIODIC_AUTO_COOLDOWN_MS = 20 * 60_000
    const PERIODIC_GAMES = [
      { type: "embaralhado", key: "embaralhadoActive", label: "Embaralhado" },
      { type: "reação", key: "reaçãoActive", label: "Reação" },
      { type: "comando", key: "comandoActive", label: "Comando" },
      { type: "memória", key: "memóriaActive", label: "Memória" },
    ]

    function getActivePeriodicGame() {
      for (const game of PERIODIC_GAMES) {
        const state = storage.getGameState(from, game.key)
        if (state) return game
      }
      return null
    }

    function getPeriodicControlState() {
      return storage.getGameState(from, PERIODIC_CONTROL_STATE_KEY) || { lastAutoStartedAt: 0 }
    }

    function setPeriodicControlState(nextState) {
      storage.setGameState(from, PERIODIC_CONTROL_STATE_KEY, nextState)
    }

    function getRemainingPeriodicAutoCooldownMs() {
      const control = getPeriodicControlState()
      const elapsed = Date.now() - (control.lastAutoStartedAt || 0)
      return Math.max(0, PERIODIC_AUTO_COOLDOWN_MS - elapsed)
    }

    function hasOpenLobbyOfType(gameType) {
      const sessions = gameManager.optInSessions[from] || {}
      return Object.values(sessions).some((session) => session.gameType === gameType)
    }

    function hasActiveLobbyGameOfType(gameType) {
      const states = getGroupGameStates()
      return Object.keys(states).some((key) => key.startsWith(activePrefix(gameType)) && Boolean(states[key]))
    }

    function getLobbyCreateBlockMessage(gameType, gameLabel) {
      if (hasActiveLobbyGameOfType(gameType)) {
        return `Já existe um ${gameLabel} em andamento.`
      }
      if (hasOpenLobbyOfType(gameType)) {
        return `Já existe um lobby aberto para ${gameLabel}. Use *!lobbies* para entrar.`
      }
      return null
    }

    function isResenhaModeEnabled() {
      return storage.isResenhaEnabled(from)
    }

    const BASE_GAME_REWARD = 25
    const GAME_BUY_INS = {
      adivinhacao: 10,
      batata: 15,
      dados: 20,
      rr: 25,
    }

    const GAME_REWARDS = {
      REACAO: BASE_GAME_REWARD,
      EMBARALHADO: BASE_GAME_REWARD,
      MEMORIA: BASE_GAME_REWARD,
      ADIVINHACAO_CLOSEST: BASE_GAME_REWARD,
      ADIVINHACAO_EXACT: 60,
      DADOS_WIN: 35,
      COMANDO_SUCCESS: 20,
      ROLETA_WIN: 40,
      ROLETA_WIN_GUARANTEED: 50,
      BATATA_WIN: 20,
    }

    function parsePositiveInt(value, fallback = 1) {
      const parsed = Number.parseInt(String(value || ""), 10)
      if (!Number.isFinite(parsed) || parsed <= 0) return fallback
      return parsed
    }

    async function rewardPlayer(playerId, baseAmount = BASE_GAME_REWARD, multiplier = 1, reasonLabel = "jogo") {
      const safeBase = Math.max(0, Math.floor(Number(baseAmount) || 0))
      if (safeBase <= 0) return 0
      const safeMultiplier = Math.max(1, parsePositiveInt(multiplier, 1))
      const amount = safeBase * safeMultiplier
      economyService.creditCoins(playerId, amount, {
        type: "game-reward",
        details: `Recompensa: ${reasonLabel}`,
        meta: { game: reasonLabel.toLowerCase() },
      })
      incrementUserStat(playerId, "moneyGameWon", amount)
      await sock.sendMessage(from, {
        text: `💰 @${playerId.split("@")[0]} ganhou *${amount}* Epsteincoins (${reasonLabel}).`,
        mentions: [playerId],
      })
      return amount
    }

    async function rewardPlayers(playerIds, baseAmount = BASE_GAME_REWARD, multiplier = 1, reasonLabel = "jogo") {
      if (!Array.isArray(playerIds) || playerIds.length === 0) return
      for (const playerId of playerIds) {
        await rewardPlayer(playerId, baseAmount, multiplier, reasonLabel)
      }
    }

    function getGameBuyIn(gameType) {
      return Math.max(0, parsePositiveInt(GAME_BUY_INS[gameType], 0))
    }

    function getInsufficientBuyInPlayers(playerIds, buyInAmount) {
      if (!Array.isArray(playerIds) || playerIds.length === 0) return []
      if (buyInAmount <= 0) return []
      return playerIds.filter((playerId) => economyService.getCoins(playerId) < buyInAmount)
    }

    function collectLobbyBuyIn(playerIds, buyInAmount, gameType) {
      if (!Array.isArray(playerIds) || playerIds.length === 0) return { ok: true, pool: 0 }
      if (buyInAmount <= 0) return { ok: true, pool: 0 }

      const insufficient = getInsufficientBuyInPlayers(playerIds, buyInAmount)
      if (insufficient.length > 0) {
        return { ok: false, insufficient }
      }

      let pool = 0
      for (const playerId of playerIds) {
        const debited = economyService.debitCoins(playerId, buyInAmount, {
          type: "game-buyin",
          details: `Entrada para ${gameType}`,
          meta: { game: gameType, buyInAmount },
        })
        if (debited) {
          pool += buyInAmount
          incrementUserStat(playerId, "moneyGameLost", buyInAmount)
        }
      }

      return { ok: true, pool }
    }

    async function distributeLobbyBuyInPool(playerIds, poolAmount, gameLabel = "jogo", options = {}) {
      if (!Array.isArray(playerIds) || playerIds.length === 0) return
      const safePool = Math.max(0, Math.floor(Number(poolAmount) || 0))
      if (safePool <= 0) return

      const uniquePlayers = [...new Set(playerIds.filter(Boolean))]
      if (uniquePlayers.length === 0) return

      if (options?.payoutMode === "lobby-bet-formula") {
        const playerBetByPlayer = options?.playerBetByPlayer || {}
        const buyInByPlayer = options?.buyInByPlayer || {}

        for (const playerId of uniquePlayers) {
          const betRaw = Number.parseInt(String(playerBetByPlayer[playerId] ?? 1), 10)
          const bet = Number.isFinite(betRaw) ? Math.max(1, Math.min(10, betRaw)) : 1
          const ownBuyInRaw = Number.parseInt(String(buyInByPlayer[playerId] ?? 0), 10)
          const ownBuyIn = Number.isFinite(ownBuyInRaw) ? Math.max(0, ownBuyInRaw) : 0

          const amount = Math.max(0, safePool - ownBuyIn) * bet
          if (amount <= 0) continue

          economyService.creditCoins(playerId, amount, {
            type: "game-buyin-payout",
            details: `Partilha de entrada (${gameLabel})`,
            meta: {
              game: gameLabel.toLowerCase(),
              poolAmount: safePool,
              ownBuyIn,
              playerBet: bet,
              formula: "(pool-ownBuyIn)*bet",
            },
          })
          incrementUserStat(playerId, "moneyGameWon", amount)
          await sock.sendMessage(from, {
            text:
              `🏦 @${playerId.split("@")[0]} recebeu *${amount}* Epsteincoins da pool (${gameLabel}).\n` +
              `Fórmula: (pool ${safePool} - buy-in ${ownBuyIn}) x bet ${bet}.`,
            mentions: [playerId],
          })
        }
        return
      }

      const betMultiplierByPlayer = options?.betMultiplierByPlayer || {}
      const playerMultipliers = uniquePlayers.map((playerId) => {
        const raw = Number.parseInt(String(betMultiplierByPlayer[playerId] ?? 1), 10)
        const multiplier = Number.isFinite(raw) && raw > 0 ? raw : 1
        return { playerId, multiplier }
      })

      const totalWeight = playerMultipliers.reduce((sum, entry) => sum + entry.multiplier, 0)
      if (totalWeight <= 0) return

      const weightShares = playerMultipliers.map((entry) => {
        const exact = (safePool * entry.multiplier) / totalWeight
        return {
          playerId: entry.playerId,
          multiplier: entry.multiplier,
          baseAmount: Math.floor(exact),
          fractional: exact - Math.floor(exact),
        }
      })

      let distributed = weightShares.reduce((sum, entry) => sum + entry.baseAmount, 0)
      let remainder = safePool - distributed
      weightShares.sort((a, b) => b.fractional - a.fractional)
      for (let i = 0; i < weightShares.length && remainder > 0; i++) {
        weightShares[i].baseAmount += 1
        remainder -= 1
      }

      for (const share of weightShares) {
        const playerId = share.playerId
        const amount = share.baseAmount
        if (amount <= 0) continue
        economyService.creditCoins(playerId, amount, {
          type: "game-buyin-payout",
          details: `Partilha de entrada (${gameLabel})`,
          meta: {
            game: gameLabel.toLowerCase(),
            poolAmount: safePool,
            totalWeight,
            playerMultiplier: share.multiplier,
          },
        })
        incrementUserStat(playerId, "moneyGameWon", amount)
        await sock.sendMessage(from, {
          text: `🏦 @${playerId.split("@")[0]} recebeu *${amount}* Epsteincoins da pool (${gameLabel}, peso ${share.multiplier}x).`,
          mentions: [playerId],
        })
      }
    }

    function parseQuantity(value, fallback = 1) {
      const parsed = Number.parseInt(String(value || ""), 10)
      if (!Number.isFinite(parsed) || parsed <= 0) return fallback
      return parsed
    }

    function formatDuration(ms) {
      const totalSeconds = Math.max(0, Math.floor(ms / 1000))
      const hours = Math.floor(totalSeconds / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      return `${hours}h ${minutes}m`
    }

    function normalizeUnifiedGameType(token = "") {
      const t = String(token || "").toLowerCase().trim()
      if (!t) return null
      if (["adivinhacao", "adivinhação"].includes(t)) return "adivinhacao"
      if (["batata"].includes(t)) return "batata"
      if (["dados"].includes(t)) return "dados"
      if (["rr", "roleta", "roletarussa"].includes(t)) return "rr"
      if (["embaralhado"].includes(t)) return "embaralhado"
      if (["memoria", "memória"].includes(t)) return "memória"
      if (["reacao", "reação"].includes(t)) return "reação"
      if (["comando"].includes(t)) return "comando"
      return null
    }

    function buildInventoryText(profile) {
      const items = profile?.items || {}
      const entries = Object.keys(items)
        .filter((key) => Number(items[key]) > 0)
        .map((key) => {
          const def = economyService.getItemDefinition(key)
          const name = def?.name || key
          return `- ${name}: ${items[key]}`
        })
      if (entries.length === 0) return "- vazio"
      return entries.join("\n")
    }

    function incrementUserStat(userId, key, amount = 1) {
      const safeAmount = Math.floor(Number(amount) || 0)
      if (!userId || !key || safeAmount <= 0) return
      economyService.incrementStat(userId, key, safeAmount)
    }

    function getUserStat(profile, key) {
      return Math.max(0, Math.floor(Number(profile?.stats?.[key]) || 0))
    }

    function buildGameStatsText(profile) {
      return [
        `🎮 Estatísticas de Jogos`,
        `- Acertos exatos na adivinhação: *${getUserStat(profile, "gameGuessExact")}*`,
        `- Acertos mais próximos na adivinhação: *${getUserStat(profile, "gameGuessClosest")}*`,
        `- Adivinhou igual a outra pessoa: *${getUserStat(profile, "gameGuessTie")}*`,
        `- Derrotas na adivinhação: *${getUserStat(profile, "gameGuessLoss")}*`,
        `- Vitórias na batata quente: *${getUserStat(profile, "gameBatataWin")}*`,
        `- Derrotas na batata quente: *${getUserStat(profile, "gameBatataLoss")}*`,
        `- Vitórias no cara ou coroa: *${getUserStat(profile, "gameCoinWin")}*`,
        `- Derrotas no cara ou coroa: *${getUserStat(profile, "gameCoinLoss")}*`,
        `- Vitórias no dobro ou nada: *${getUserStat(profile, "gameDobroWin")}*`,
        `- Derrotas no dobro ou nada: *${getUserStat(profile, "gameDobroLoss")}*`,
        `- Vitórias no duelo de dados: *${getUserStat(profile, "gameDadosWin")}*`,
        `- Derrotas no duelo de dados: *${getUserStat(profile, "gameDadosLoss")}*`,
        `- Acertos no embaralhado: *${getUserStat(profile, "gameEmbaralhadoWin")}*`,
        `- Vitórias na memória: *${getUserStat(profile, "gameMemoriaWin")}*`,
        `- Vitórias no teste de reação: *${getUserStat(profile, "gameReacaoWin")}*`,
        `- Vezes que puxou o gatilho na roleta russa: *${getUserStat(profile, "gameRrTrigger")}*`,
        `- Vezes que ganhou aposta na roleta russa: *${getUserStat(profile, "gameRrBetWin")}*`,
        `- Vezes que tomou tiro na roleta russa: *${getUserStat(profile, "gameRrShotLoss")}*`,
        `- Vitórias totais na roleta russa: *${getUserStat(profile, "gameRrWin")}*`,
        `- Vitórias no último a obedecer: *${getUserStat(profile, "gameComandoWin")}*`,
        `- Derrotas no último a obedecer: *${getUserStat(profile, "gameComandoLoss")}*`,
      ].join("\n")
    }

    function buildEconomyStatsText(profile) {
      const kronosExpiresAt = Math.floor(Number(profile?.buffs?.kronosExpiresAt) || 0)
      const kronosRemainingDays = kronosExpiresAt > Date.now()
        ? Math.ceil((kronosExpiresAt - Date.now()) / (24 * 60 * 60 * 1000))
        : 0
      const hasKronosVerdadeira = Boolean(profile?.buffs?.kronosVerdadeiraActive)

      return [
        `📊 Estatísticas de Economia`,
        `- Dinheiro ganho em todos os jogos: *${getUserStat(profile, "moneyGameWon")}*`,
        `- Dinheiro perdido em todos os jogos: *${getUserStat(profile, "moneyGameLost")}*`,
        `- Dinheiro ganho no cassino: *${getUserStat(profile, "moneyCasinoWon")}*`,
        `- Dinheiro perdido no cassino: *${getUserStat(profile, "moneyCasinoLost")}*`,
        `- Moedas ganhas no lifetime: *${getUserStat(profile, "coinsLifetimeEarned")}*`,
        `- Vezes que foi roubado: *${getUserStat(profile, "stealVictimCount")}* | Moedas perdidas: *${getUserStat(profile, "stealVictimCoinsLost")}*`,
        `- Vezes que roubou com sucesso: *${getUserStat(profile, "stealSuccessCount")}* | Moedas ganhas: *${getUserStat(profile, "stealSuccessCoins")}*`,
        `- Itens comprados: *${getUserStat(profile, "itemsBought")}*`,
        `- Escudos usados: *${getUserStat(profile, "shieldsUsed")}*`,
        `- Coroa Kronos (Quebrada) dias restantes: *${kronosRemainingDays}*`,
        `- Coroa Kronos Verdadeira: *${hasKronosVerdadeira ? "✅ ATIVA" : "❌ Inativa"}*`,
        `- Trabalhos realizados: *${getUserStat(profile, "works")}*`,
      ].join("\n")
    }

    async function applyRandomGamePunishment(targetId, options = {}) {
      if (!isResenhaModeEnabled()) return false
      const punishment = getRandomPunishmentChoice()
      await applyPunishment(sock, from, targetId, punishment, {
        ...options,
        origin: "game",
      })
      return true
    }

    async function createPendingTargetForWinner(winnerId, winnerText, severityMultiplier = 1, allowedTargets = null) {
      if (!isResenhaModeEnabled()) {
        await sock.sendMessage(from, { text: winnerText, mentions: [winnerId] })
        return false
      }

      const coinPunishmentPending = storage.getCoinPunishmentPending()
      if (!coinPunishmentPending[from]) coinPunishmentPending[from] = {}

      coinPunishmentPending[from][winnerId] = {
        mode: "target",
        target: null,
        createdAt: Date.now(),
        severityMultiplier,
        origin: "game",
      }

      if (Array.isArray(allowedTargets) && allowedTargets.length > 0) {
        coinPunishmentPending[from][winnerId].allowedTargets = allowedTargets
      }

      storage.setCoinPunishmentPending(coinPunishmentPending)

      await sock.sendMessage(from, {
        text: winnerText,
        mentions: [winnerId],
      })

      const severityText = severityMultiplier > 1 ? ` *${severityMultiplier}x*` : ""
      await sock.sendMessage(from, {
        text:
          `Escolha quem será punido${severityText} em até 30s.\n` +
          `${getPunishmentMenuText()}\n` +
          `Formato: @mention <número da punição>`,
        mentions: [winnerId, ...(allowedTargets || [])],
      })

      setTimeout(() => {
        const coinPunishmentPendingTimeout = storage.getCoinPunishmentPending()
        if (coinPunishmentPendingTimeout[from]?.[winnerId]) {
          clearPendingPunishment(from, winnerId)
        }
      }, 30_000)

      return true
    }

    async function startPeriodicGame(gameType, options = {}) {
      const { triggeredBy = null, automatic = false, reactionParticipants = null } = options

      const activePeriodic = getActivePeriodicGame()
      if (activePeriodic) {
        return { ok: false, reason: "active", message: `Já existe um jogo periódico ativo: ${activePeriodic.label}.` }
      }

      if (automatic) {
        const remainingMs = getRemainingPeriodicAutoCooldownMs()
        if (remainingMs > 0) {
          return { ok: false, reason: "cooldown", message: `Aguardando cooldown do gatilho periódico (${Math.ceil(remainingMs / 60_000)} min).` }
        }

        setPeriodicControlState({
          ...getPeriodicControlState(),
          lastAutoStartedAt: Date.now(),
        })
      }

      if (gameType === "embaralhado") {
        const state = embaralhado.start(from, triggeredBy)
        storage.setGameState(from, "embaralhadoActive", state)
        await sock.sendMessage(from, {
          text: embaralhado.formatGame(state)
        })

        setTimeout(async () => {
          const finalState = storage.getGameState(from, "embaralhadoActive")
          if (finalState && !finalState.winner) {
            await sock.sendMessage(from, {
              text: embaralhado.formatResults(finalState),
              mentions: finalState.winner ? [finalState.winner] : [],
            })
            storage.clearGameState(from, "embaralhadoActive")
          }
        }, 30_000)

        return { ok: true }
      }

      if (gameType === "reação") {
        const participants = Array.isArray(reactionParticipants) ? reactionParticipants : []
        const restrictToPlayers = participants.length > 0
        const state = reação.start(from, participants, { restrictToPlayers })
        storage.setGameState(from, "reaçãoActive", state)

        const participantText = restrictToPlayers
          ? `\nParticipantes: ${participants.length} (somente lista definida).`
          : "\nSem lista fixa: qualquer pessoa pode participar."

        await sock.sendMessage(from, {
          text: `⚡ Teste de Reação iniciado! Aguarde o *início*...${participantText}`,
        })

        const goDelayMs = 3000 + Math.floor(Math.random() * 4000)
        setTimeout(async () => {
          const currentState = storage.getGameState(from, "reaçãoActive")
          if (!currentState || currentState.started || currentState.winner) return

          reação.markStarted(currentState)
          storage.setGameState(from, "reaçãoActive", currentState)

          await sock.sendMessage(from, {
            text: "🟢 VAI! Mande uma mensagem AGORA. O primeiro vence!",
          })

          setTimeout(async () => {
            const finalState = storage.getGameState(from, "reaçãoActive")
            if (!finalState || finalState.winner) return

            const results = reação.getResults(finalState)
            const resenhaOn = isResenhaModeEnabled()
            const reactionMentions = Array.from(new Set((results.reactions || []).map((r) => r.playerId)))
            await sock.sendMessage(from, {
              text: reação.formatResults(finalState, results, resenhaOn),
              mentions: reactionMentions,
            })

            if (results.winner) {
              await rewardPlayer(results.winner, GAME_REWARDS.REACAO, 1, "Reação")
              incrementUserStat(results.winner, "gameReacaoWin", 1)
              const allowedTargets = finalState.restrictToPlayers
                ? (finalState.players || []).filter((p) => p !== results.winner)
                : null
              await createPendingTargetForWinner(
                results.winner,
                `⚡ @${results.winner.split("@")[0]}, você venceu o Teste de Reação!`,
                1,
                allowedTargets
              )
            }

            storage.clearGameState(from, "reaçãoActive")
          }, 20_000)
        }, goDelayMs)

        return { ok: true }
      }

      if (gameType === "comando") {
        const state = comando.start(from, triggeredBy)
        storage.setGameState(from, "comandoActive", state)
        await sock.sendMessage(from, {
          text: "⚠️ O desafio *Comando* vai começar em 10 segundos. Preparem-se para obedecer na hora certa!"
        })

        setTimeout(async () => {
          const currentState = storage.getGameState(from, "comandoActive")
          if (!currentState) return

          currentState.instructionStartedAt = Date.now()
          storage.setGameState(from, "comandoActive", currentState)

          const resenhaOn = isResenhaModeEnabled()
          await sock.sendMessage(from, {
            text: comando.formatInstruction(currentState, resenhaOn)
          })

          setTimeout(async () => {
            const finalState = storage.getGameState(from, "comandoActive")
            if (finalState) {
              const participants = Array.from(new Set((finalState.participants || []).filter(Boolean)))
              const resenhaOn = isResenhaModeEnabled()
              const loser = comando.getLoser(finalState)
              await sock.sendMessage(from, {
                text: comando.formatResults(finalState, resenhaOn),
                mentions: loser ? [loser] : [],
              })
              if (participants.length <= 1) {
                if (participants.length === 1) {
                  const soloPlayer = participants[0]
                  incrementUserStat(soloPlayer, "gameComandoWin", 1)
                  await rewardPlayer(soloPlayer, 20, 1, "Comando (solo)")
                }
              } else if (loser) {
                const rewardedPlayers = finalState.instruction?.cmd === "silence"
                  ? (() => {
                      const startedAt = Number(finalState.instructionStartedAt) || 0
                      const endedAt = Date.now()
                      const participantLastMessageAt = finalState.participantLastMessageAt || {}
                      return (finalState.participants || []).filter((playerId) => {
                        if (!playerId || playerId === loser) return false
                        const lastAt = Number(participantLastMessageAt[playerId]) || 0
                        return lastAt >= startedAt && lastAt <= endedAt
                      })
                    })()
                  : (finalState.compliers || [])
                      .map((entry) => entry.playerId)
                      .filter((playerId) => playerId && playerId !== loser)
                rewardedPlayers.forEach((playerId) => incrementUserStat(playerId, "gameComandoWin", 1))
                incrementUserStat(loser, "gameComandoLoss", 1)
                await rewardPlayers(rewardedPlayers, GAME_REWARDS.COMANDO_SUCCESS, 1, "Comando")
                await applyRandomGamePunishment(loser)
              }
              storage.clearGameState(from, "comandoActive")
            }
          }, 20_000)
        }, 10_000)

        return { ok: true }
      }

      if (gameType === "memória") {
        const state = memória.start(from, triggeredBy)
        storage.setGameState(from, "memóriaActive", state)
        const sequenceMessage = await sock.sendMessage(from, {
          text: memória.formatSequence(state)
        })

        setTimeout(async () => {
          const finalState = storage.getGameState(from, "memóriaActive")
          if (finalState) {
            if (sequenceMessage?.key) {
              try {
                await sock.sendMessage(from, { delete: sequenceMessage.key })
              } catch (e) {
                console.error("Erro ao apagar mensagem da sequência da memória", e)
              }
            }
            await sock.sendMessage(from, {
              text: memória.formatHidden(finalState)
            })
          }
        }, 5000)

        setTimeout(async () => {
          const finalState = storage.getGameState(from, "memóriaActive")
          if (finalState && !finalState.winner) {
            await sock.sendMessage(from, {
              text:
                `⏰ Tempo do Jogo da Memória encerrado (60s).\n` +
                `Ninguém acertou a sequência a tempo.\n` +
                `Sequência correta: ${finalState.sequence}`,
            })
            storage.clearGameState(from, "memóriaActive")
          }
        }, 60_000)

        return { ok: true }
      }

      return { ok: false, reason: "unknown", message: "Tipo de jogo periódico inválido." }
    }

    // Função de aviso para lobbies que estão prestes a fechar
    function createLobbyWarningCallback(groupId) {
      return (grpId, gameId, gameType, players) => {
        // Verifica se o lobby ainda existe (não foi iniciado)
        const session = gameManager.getOptInSession(groupId, gameId)
        if (!session) return

        // Mapeia tipo de jogo para nome legível
        const gameNames = {
          adivinhacao: "Adivinhação",
          batata: "Batata Quente",
          dados: "Duelo de Dados",
          rr: "Roleta Russa",
          embaralhado: "Embaralhado",
          memoria: "Memória",
          reacao: "Reação",
          comando: "Último a Obedecer",
        }
        const gameName = gameNames[gameType] || gameType

        // Formata lista de jogadores
        const playerList = players.map((p) => `@${p.split("@")[0]}`).join(", ")

        telemetry.incrementCounter("game.lobby.warning", 1, { gameType })
        telemetry.appendEvent("game.lobby.warning", {
          groupId: grpId,
          lobbyId: gameId,
          gameType,
          players,
        })

        // Envia aviso
        sock.sendMessage(groupId, {
          text:
            `⚠️ *AVISO: Lobby fechando em 20 segundos!*\n\n` +
            `🎮 Jogo: *${gameName}*\n` +
            `🏷️ ID: *${gameId}*\n` +
            `👥 Participantes: ${playerList}\n\n` +
            `Se a partida não for iniciada, o lobby será fechado automaticamente.`,
          mentions: players,
        }).catch(() => {}) // Silencia erros de envio
      }
    }

    function createLobbyTimeoutCallback(groupId) {
      return (grpId, gameId, gameType, players) => {
        telemetry.incrementCounter("game.lobby.timeout", 1, { gameType })
        telemetry.appendEvent("game.lobby.timeout", {
          groupId: grpId,
          lobbyId: gameId,
          gameType,
          players,
        })

        sock.sendMessage(groupId, {
          text:
            `⌛ Lobby *${gameId}* foi fechado por inatividade.\n` +
            `Use *!começar ${gameType}* para abrir um novo lobby.`,
          mentions: players,
        }).catch(() => {})
      }
    }

    function resolveActiveLobbyForPlayer(gameType, maybeLobbyToken, playerId) {
      const groupStates = getGroupGameStates()
      const explicitLobbyId = normalizeLobbyId(maybeLobbyToken || "")
      if (explicitLobbyId) {
        const explicitKey = activeGameKey(gameType, explicitLobbyId)
        const explicitState = storage.getGameState(from, explicitKey)
        if (explicitState) {
          const inExplicitLobby = Array.isArray(explicitState.players) && explicitState.players.includes(playerId)
          return {
            ok: inExplicitLobby,
            foundExplicit: true,
            reason: inExplicitLobby ? null : "not-in-lobby",
            lobbyId: explicitLobbyId,
            stateKey: explicitKey,
            state: explicitState,
          }
        }
      }

      const matches = Object.keys(groupStates)
        .filter((key) => key.startsWith(activePrefix(gameType)))
        .map((key) => ({ key, state: groupStates[key], lobbyId: key.substring(activePrefix(gameType).length) }))
        .filter((entry) => Array.isArray(entry.state?.players) && entry.state.players.includes(playerId))

      if (matches.length === 1) {
        return {
          ok: true,
          foundExplicit: false,
          reason: null,
          lobbyId: matches[0].lobbyId,
          stateKey: matches[0].key,
          state: matches[0].state,
        }
      }

      return {
        ok: false,
        foundExplicit: false,
        reason: matches.length === 0 ? "not-found" : "ambiguous",
        lobbyId: null,
        stateKey: null,
        state: null,
      }
    }

    const handledGameCommand = await handleGameCommands({
      sock,
      from,
      sender,
      cmd,
      cmdName,
      cmdArg1,
      cmdArg2,
      mentioned,
      prefix,
      isGroup,
      text,
      msg,
      storage,
      gameManager,
      economyService,
      caraOuCoroa,
      adivinhacao,
      batataquente,
      dueloDados,
      roletaRussa,
      startPeriodicGame,
      GAME_REWARDS,
      BASE_GAME_REWARD,
      normalizeUnifiedGameType,
      normalizeLobbyId,
      activeGameKey,
      resolveActiveLobbyForPlayer,
      getLobbyCreateBlockMessage,
      getGameBuyIn,
      collectLobbyBuyIn,
      distributeLobbyBuyInPool,
      parsePositiveInt,
      isResenhaModeEnabled,
      rewardPlayer,
      rewardPlayers,
      incrementUserStat,
      applyRandomGamePunishment,
      createPendingTargetForWinner,
      jidNormalizedUser,
      buildGameStatsText,
      createLobbyWarningCallback: createLobbyWarningCallback(from),
      createLobbyTimeoutCallback: createLobbyTimeoutCallback(from),
    })
    if (handledGameCommand) return

    const handledGameMessageFlow = await handleGameMessageFlow({
      sock,
      from,
      sender,
      text,
      msg,
      mentioned,
      isGroup,
      isCommand,
      storage,
      gameManager,
      reação,
      embaralhado,
      memória,
      comando,
      startPeriodicGame,
      GAME_REWARDS,
      isResenhaModeEnabled,
      rewardPlayer,
      incrementUserStat,
      createPendingTargetForWinner,
    })
    if (handledGameMessageFlow) return

    const handledUtilityCommand = await handleUtilityCommands({
      sock,
      from,
      sender,
      cmd,
      prefix,
      isGroup,
      isOverrideSender,
      msg,
      quoted,
      mentioned,
      sharp,
      downloadMediaMessage,
      logger,
      videoToSticker,
      dddMap,
      jidNormalizedUser,
      getPunishmentDetailsText,
    })
    if (handledUtilityCommand) return

    const handledEconomyCommand = await handleEconomyCommands({
      sock,
      from,
      sender,
      cmd,
      cmdName,
      cmdArg1,
      cmdArg2,
      cmdParts,
      mentioned,
      prefix,
      isGroup,
      senderIsAdmin,
      jidNormalizedUser,
      storage,
      economyService,
      parseQuantity,
      formatDuration,
      buildEconomyStatsText,
      buildInventoryText,
      incrementUserStat,
      applyPunishment,
    })
    if (handledEconomyCommand) return

    const handledModerationCommand = await handleModerationCommands({
      sock,
      msg,
      from,
      sender,
      text,
      cmd,
      cmdName,
      prefix,
      isGroup,
      senderIsAdmin,
      mentioned,
      jidNormalizedUser,
      storage,
      clearPunishment,
      clearPendingPunishment,
      getPunishmentMenuText,
      getPunishmentChoiceFromText,
      applyPunishment,
      overrideChecksEnabled,
      overrideJid,
      overrideIdentifiers,
    })
    if (handledModerationCommand) return

    // =========================
    // MOEDA (cara ou coroa)
    // =========================
    const handledCoinRound = await caraOuCoroa.startCoinRound({
      sock,
      from,
      sender,
      cmd,
      prefix,
      isGroup,
    })
    if (handledCoinRound) return

    // =========================
    // BLOQUEIO DE MENSAGENS DE USUÁRIOS MUTADOS
    // =========================
    {
      const mutedUsers = storage.getMutedUsers()
      if (
        mutedUsers[from]?.[sender] &&
        isGroup &&
        sender !== sock.user.id &&
        !((senderIsAdmin || isOverrideSender) && isCommand)
      ) {
        try{
          await sock.sendMessage(from,{ delete: msg.key })
        }catch(e){
          console.error("Erro ao apagar mensagem de usuário mutado", e)
        }
        return
      }
    }
    // =========================
    // COMANDOS DE STREAKS
    // =========================
    const handledStreakRanking = await caraOuCoroa.sendStreakRanking({
      sock,
      from,
      cmd,
      prefix,
      isGroup,
    })
    if (handledStreakRanking) return

    const handledStreakValue = await caraOuCoroa.sendStreakValue({
      sock,
      from,
      sender,
      mentioned,
      cmd,
      prefix,
      isGroup,
    })
    if (handledStreakValue) return

    } catch (err) {
      telemetry.incrementCounter("command.error", 1, {
        scope: "messages.upsert",
      })
      telemetry.appendEvent("command.error", {
        scope: "messages.upsert",
        message: String(err?.message || err || "unknown"),
      })
      console.error("Erro no processamento de messages.upsert", err)
    }

  })
} 

startBot()
