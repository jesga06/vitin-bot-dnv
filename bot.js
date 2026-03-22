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
const reação = require("./games/reação")
const embaralhado = require("./games/embaralhado")
const comando = require("./games/comando")
const memória = require("./games/memória")
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
  clearPendingPunishment,
  clearPunishment,
  applyPunishment,
  handlePunishmentEnforcement,
  handlePendingPunishmentChoice,
} = punishmentService

// Sobrescrita de identidade para comandos administrativos especiais
const overrideJid = jidNormalizedUser("5521995409899@s.whatsapp.net")
const overridePhoneNumber = "5521995409899"

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
  const { state, saveCreds } = await useMultiFileAuthState("./auth")
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
    const msg = messages[0]
    if(!msg.message) return
    if(msg.key.fromMe) return

    const from = msg.key.remoteJid
    const senderRaw = msg.key.participant || msg.key.remoteJid
    const sender = jidNormalizedUser(senderRaw)
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

    if (isCommand) {
      telemetry.markCommand(cmdName, {
        group: isGroup,
        groupId: isGroup ? from : null,
      })
    }

    // =========================
    // IDENTIFICAÇÃO DE ADMIN
    // =========================
    let senderIsAdmin = false
    if (isGroup && isCommand) {
      const metadata = await sock.groupMetadata(from)
      const admins = (metadata?.participants || []).filter(p => p.admin).map(p => p.id)
      senderIsAdmin = admins.includes(sender)
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
      senderIsAdmin,
      isCommand,
    })
    if (handledPendingPunishment) return

    // =========================
    // APLICAÇÃO DE PUNIÇÃO ATIVA
    // =========================
    const punishedMessageDeleted = await handlePunishmentEnforcement(sock, msg, from, sender, text, isGroup, senderIsAdmin && isCommand)
    if (punishedMessageDeleted) return

    if (cmd === prefix + "resenha"){
      if (!isGroup) {
        await sock.sendMessage(from, { text: "Esse comando só funciona em grupo." })
        return
      }

      const metadata = await sock.groupMetadata(from)
      const admins = (metadata?.participants || []).filter(p => p.admin).map(p => p.id)
      if (!admins.includes(sender)) {
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
      overrideJid,
      overridePhoneNumber,
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
    const PERIODIC_AUTO_COOLDOWN_MS = 10 * 60_000
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

    async function distributeLobbyBuyInPool(playerIds, poolAmount, gameLabel = "jogo") {
      if (!Array.isArray(playerIds) || playerIds.length === 0) return
      const safePool = Math.max(0, Math.floor(Number(poolAmount) || 0))
      if (safePool <= 0) return

      const each = Math.floor(safePool / playerIds.length)
      const remainder = safePool % playerIds.length
      if (each <= 0 && remainder <= 0) return

      for (let i = 0; i < playerIds.length; i++) {
        const playerId = playerIds[i]
        const amount = each + (i < remainder ? 1 : 0)
        if (amount <= 0) continue
        economyService.creditCoins(playerId, amount, {
          type: "game-buyin-payout",
          details: `Partilha de entrada (${gameLabel})`,
          meta: { game: gameLabel.toLowerCase(), poolAmount: safePool },
        })
        incrementUserStat(playerId, "moneyGameWon", amount)
        await sock.sendMessage(from, {
          text: `🏦 @${playerId.split("@")[0]} recebeu *${amount}* Epsteincoins da pool (${gameLabel}).`,
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
        .map((key) => `- ${key}: ${items[key]}`)
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
        `- Dias restantes com Coroa do Kronos: *${kronosRemainingDays}*`,
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

      const severityText = severityMultiplier > 1 ? ` *${severityMultiplier}x*` : ""
      await sock.sendMessage(from, {
        text:
          `${winnerText}\n` +
          `Escolha quem será punido${severityText} em até 30s.\n` +
          `${getPunishmentMenuText()}\n` +
          `Marque alguém para punir.`,
        mentions: [winnerId],
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
              text: embaralhado.formatResults(finalState)
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
            await sock.sendMessage(from, {
              text: reação.formatResults(finalState, results, resenhaOn),
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
        const resenhaOn = isResenhaModeEnabled()
        await sock.sendMessage(from, {
          text: comando.formatInstruction(state, resenhaOn)
        })

        setTimeout(async () => {
          const finalState = storage.getGameState(from, "comandoActive")
          if (finalState) {
            const resenhaOn = isResenhaModeEnabled()
            await sock.sendMessage(from, {
              text: comando.formatResults(finalState, resenhaOn)
            })
            const loser = comando.getLoser(finalState)
            if (loser) {
              const rewardedPlayers = finalState.instruction?.cmd === "silence"
                ? (finalState.participants || []).filter((playerId) => playerId && playerId !== loser)
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

        return { ok: true }
      }

      if (gameType === "memória") {
        const state = memória.start(from, triggeredBy)
        storage.setGameState(from, "memóriaActive", state)
        await sock.sendMessage(from, {
          text: memória.formatSequence(state)
        })

        setTimeout(async () => {
          const finalState = storage.getGameState(from, "memóriaActive")
          if (finalState) {
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
      msg,
      quoted,
      mentioned,
      sharp,
      downloadMediaMessage,
      logger,
      videoToSticker,
      dddMap,
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
      buildGameStatsText,
      buildEconomyStatsText,
      buildInventoryText,
      incrementUserStat,
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
      storage,
      clearPunishment,
      clearPendingPunishment,
      getPunishmentMenuText,
      getPunishmentChoiceFromText,
      applyPunishment,
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
      if(mutedUsers[from]?.[sender] && isGroup && sender !== sock.user.id && !(senderIsAdmin && isCommand)){
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

  })
} 

startBot()
