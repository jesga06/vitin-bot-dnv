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

// IMPORTS: Storage and Game Manager
const storage = require("./storage")
const punishmentService = require("./punishmentService")
const caraOuCoroa = require("./games/caraOuCoroa")
const gameManager = require("./gameManager")
const adivinhaNumero = require("./games/adivinhaNumero")
const batataquente = require("./games/batataquente")
const dueloDados = require("./games/dueloDados")
const roletaRussa = require("./games/roletaRussa")
const reação = require("./games/reação")
const embaralhado = require("./games/embaralhado")
const ultimoAObedecer = require("./games/ultimoAObedecer")
const memória = require("./games/memória")

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

// Override
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
    })
    if (handledCoinGuess) return

    // =========================
    // NEW MULTIPLAYER GAMES
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
      { type: "ultimoAObedecer", key: "ultimoAObedecerActive", label: "Último a Obedecer" },
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

    async function applyRandomGamePunishment(targetId, options = {}) {
      if (!isResenhaModeEnabled()) return false
      const punishment = getRandomPunishmentChoice()
      await applyPunishment(sock, from, targetId, punishment, options)
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

      if (gameType === "ultimoAObedecer") {
        const state = ultimoAObedecer.start(from, triggeredBy)
        storage.setGameState(from, "ultimoAObedecerActive", state)
        const resenhaOn = isResenhaModeEnabled()
        await sock.sendMessage(from, {
          text: ultimoAObedecer.formatInstruction(state, resenhaOn)
        })

        setTimeout(async () => {
          const finalState = storage.getGameState(from, "ultimoAObedecerActive")
          if (finalState) {
            const resenhaOn = isResenhaModeEnabled()
            await sock.sendMessage(from, {
              text: ultimoAObedecer.formatResults(finalState, resenhaOn)
            })
            const loser = ultimoAObedecer.getLoser(finalState)
            if (loser) {
              await applyRandomGamePunishment(loser)
            }
            storage.clearGameState(from, "ultimoAObedecerActive")
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

    // DOBRO OU NADA - Double or nothing (tracked wins, doubled punishment)
    if (cmd === prefix + "moeda dobro" && isGroup) {
      const state = caraOuCoroa.startDobroOuNada(from, sender)
      await sock.sendMessage(from, {
        text: `🎲 Dobro ou Nada iniciado!\n\n${caraOuCoroa.formatDobroStatus(from, state)}`
      })
      return
    }

    // ADIVINHA NUMERO - 1-4 players guess numbers
    if (cmd === prefix + "adivinhanumero" && isGroup) {
      const blockedReason = getLobbyCreateBlockMessage("adivinhaNumero", "Adivinha Número")
      if (blockedReason) {
        return sock.sendMessage(from, { text: blockedReason })
      }

      const lobbyId = gameManager.createOptInSession(from, "adivinhaNumero", 1, 4, 30000)
      await sock.sendMessage(from, {
        text:
          `🎰 Jogo de Adivinhar Números criado!\n` +
          `Lobby ID: *${lobbyId}*\n\n` +
          `Para entrar: *!optar ${lobbyId}*\n` +
          `Para iniciar: *!começar ${lobbyId}*\n\n` +
          `1-4 jogadores, número secreto entre 1 e 100.\n` +
          `Depois de iniciar, responda com *!resposta <número>*.`
      })
      return
    }

    // BATATA QUENTE - Hot Potato 2-3 players, pass for 15s
    if (cmd === prefix + "batata" && isGroup) {
      const blockedReason = getLobbyCreateBlockMessage("batata", "Batata Quente")
      if (blockedReason) {
        return sock.sendMessage(from, { text: blockedReason })
      }

      const lobbyId = gameManager.createOptInSession(from, "batata", 2, null, 30000)
      await sock.sendMessage(from, {
        text:
          `🥔 Batata Quente criada!\n` +
          `Lobby ID: *${lobbyId}*\n\n` +
          `Para entrar: *!optar ${lobbyId}*\n` +
          `Para iniciar: *!começarbatata ${lobbyId}*\n` +
          `Mínimo de 2 jogadores, sem limite máximo.`
      })
      return
    }

    // DUELO DE DADOS - Dice Duel 2 players, d20 rolls
    if (cmd === prefix + "dados" && isGroup) {
      const blockedReason = getLobbyCreateBlockMessage("dados", "Duelo de Dados")
      if (blockedReason) {
        return sock.sendMessage(from, { text: blockedReason })
      }

      const lobbyId = gameManager.createOptInSession(from, "dados", 2, 2, 30000)
      await sock.sendMessage(from, {
        text:
          `🎲 Duelo de Dados criado!\n` +
          `Lobby ID: *${lobbyId}*\n\n` +
          `Para entrar: *!optar ${lobbyId}*\n` +
          `Para iniciar: *!começardados ${lobbyId}*`
      })
      return
    }

    // ROLETA RUSSA - Russian Roulette 1-4 players
    if (cmd === prefix + "rr" && isGroup) {
      const blockedReason = getLobbyCreateBlockMessage("rr", "Roleta Russa")
      if (blockedReason) {
        return sock.sendMessage(from, { text: blockedReason })
      }

      const lobbyId = gameManager.createOptInSession(from, "rr", 1, 4, 30000)
      await sock.sendMessage(from, {
        text:
          `🔫 Roleta Russa criada!\n` +
          `Lobby ID: *${lobbyId}*\n\n` +
          `Para entrar: *!optar ${lobbyId}*\n` +
          `Para iniciar: *!começarr ${lobbyId}*`
      })
      return
    }

    if (cmdName === prefix + "optar" && isGroup) {
      const lobbyId = normalizeLobbyId(cmdArg1)
      if (!lobbyId) {
        return sock.sendMessage(from, { text: "Use: !optar <LobbyID>" })
      }

      const session = gameManager.getOptInSession(from, lobbyId)
      if (!session) {
        return sock.sendMessage(from, { text: `Lobby *${lobbyId}* não encontrado ou expirado.` })
      }

      if (gameManager.addPlayerToOptIn(from, lobbyId, sender)) {
        const maxPlayersLabel = Number.isFinite(session.maxPlayers) ? String(session.maxPlayers) : "∞"
        await sock.sendMessage(from, {
          text: `✅ @${sender.split("@")[0]} entrou no lobby *${lobbyId}*!\nJogadores: ${session.players.length}/${maxPlayersLabel}`,
          mentions: [sender]
        })
      } else {
        await sock.sendMessage(from, {
          text: "Lobby cheio ou você já entrou nele."
        })
      }
      return
    }

    if (cmd === prefix + "lobbies" && isGroup) {
      const groupSessions = gameManager.optInSessions[from] || {}
      const ids = Object.keys(groupSessions)
      if (ids.length === 0) {
        return sock.sendMessage(from, { text: "Nenhum lobby aberto no momento." })
      }

      const lines = ids.map((id) => {
        const s = groupSessions[id]
        const maxPlayersLabel = Number.isFinite(s.maxPlayers) ? String(s.maxPlayers) : "∞"
        return `- ${id} | ${s.gameType} | ${s.players.length}/${maxPlayersLabel}`
      })

      await sock.sendMessage(from, {
        text:
          "Lobbies abertos:\n" +
          lines.join("\n") +
          "\n\nEntre com: !optar <LobbyID>",
      })
      return
    }

    if (cmdName === prefix + "começar" && isGroup) {
      const lobbyId = normalizeLobbyId(cmdArg1)
      if (!lobbyId) return sock.sendMessage(from, { text: "Use: !começar <LobbyID>" })

      const session = gameManager.getOptInSession(from, lobbyId)
      if (!session || session.gameType !== "adivinhaNumero") {
        return sock.sendMessage(from, { text: `Lobby *${lobbyId}* de Adivinha Numero não encontrado.` })
      }
      if (session.players.length < 1) {
        return sock.sendMessage(from, { text: "Precisamos de pelo menos 1 jogador!" })
      }

      const stateKey = activeGameKey("adivinhaNumero", lobbyId)
      if (storage.getGameState(from, stateKey)) {
        return sock.sendMessage(from, { text: `O lobby *${lobbyId}* já está em andamento.` })
      }

      const state = adivinhaNumero.start(from, session.players)
      storage.setGameState(from, stateKey, state)
      gameManager.clearOptInSession(from, lobbyId)

      const mentions = [...session.players]
      await sock.sendMessage(from, {
        text:
          `🎰 Adivinha Numero iniciado no lobby *${lobbyId}*!\n` +
          `${mentions.map((p) => `@${p.split("@")[0]}`).join(" ")}\n\n` +
          `Resposta: *!resposta <número>* (auto)\n` +
          `Ou: *!resposta ${lobbyId} <número>*\n` +
          `Faixa: 1-100`,
        mentions,
      })
      return
    }

    // Handle number guess answers
    if (cmdName === prefix + "resposta" && isGroup) {
      const resolved = resolveActiveLobbyForPlayer("adivinhaNumero", cmdArg1, sender)
      if (!resolved.ok && resolved.reason === "not-in-lobby") {
        return sock.sendMessage(from, { text: `Você não está no lobby *${resolved.lobbyId}*.` })
      }
      if (!resolved.ok && resolved.reason === "not-found") {
        return sock.sendMessage(from, { text: "Você não está em nenhum Adivinha Numero ativo. Use !resposta <número> quando estiver em jogo." })
      }
      if (!resolved.ok && resolved.reason === "ambiguous") {
        return sock.sendMessage(from, { text: "Você está em mais de um Adivinha Numero. Use: !resposta <LobbyID> <número>" })
      }

      const guessToken = resolved.foundExplicit ? cmdArg2 : cmdArg1
      const { lobbyId, stateKey, state } = resolved
      const result = adivinhaNumero.recordGuess(state, sender, guessToken)
      if (!result.valid) {
        return sock.sendMessage(from, { text: result.error })
      }

      storage.setGameState(from, stateKey, state)

      if (Object.keys(state.guesses).length === state.players.length) {
        const results = adivinhaNumero.getResults(state)
        const resenhaOn = isResenhaModeEnabled()
        const displayResults = resenhaOn
          ? results
          : {
              ...results,
              punishments: [],
              chooser: null,
              winner: null,
            }
        await sock.sendMessage(from, {
          text: `Lobby *${lobbyId}*\n\n${adivinhaNumero.formatResults(state, displayResults, resenhaOn)}`
        })

        if (Array.isArray(results.punishments) && results.punishments.length > 0) {
          if (resenhaOn) {
            for (const entry of results.punishments) {
              await applyRandomGamePunishment(entry.playerId, {
                severityMultiplier: entry.severity || 1,
              })
            }
          }
        }

        if (results.chooser) {
          await createPendingTargetForWinner(
            results.chooser,
            `🎯 @${results.chooser.split("@")[0]}, você acertou exatamente!`,
            results.choiceSeverity || 2,
            state.players.filter((p) => p !== results.chooser)
          )
        }

        storage.clearGameState(from, stateKey)
      }
      return
    }

    if (cmdName === prefix + "começarbatata" && isGroup) {
      const lobbyId = normalizeLobbyId(cmdArg1)
      if (!lobbyId) return sock.sendMessage(from, { text: "Use: !começarbatata <LobbyID>" })

      const session = gameManager.getOptInSession(from, lobbyId)
      if (!session || session.gameType !== "batata") {
        return sock.sendMessage(from, { text: `Lobby *${lobbyId}* de Batata Quente não encontrado.` })
      }

      if (session.players.length < 2) {
        return sock.sendMessage(from, { text: "Precisamos de pelo menos 2 jogadores!" })
      }

      const stateKey = activeGameKey("batata", lobbyId)
      if (storage.getGameState(from, stateKey)) {
        return sock.sendMessage(from, { text: `O lobby *${lobbyId}* já está em andamento.` })
      }

      const state = batataquente.start(from, session.players)
      storage.setGameState(from, stateKey, state)
      gameManager.clearOptInSession(from, lobbyId)

      await sock.sendMessage(from, {
        text:
          `🥔 Batata Quente iniciada no lobby *${lobbyId}*!\n` +
          `${session.players.map((p) => `@${p.split("@")[0]}`).join(" ")}\n\n` +
          `${batataquente.formatStatus(state)}\n` +
          `Comando de passe: *!passa @usuario* (auto)\n` +
          `Ou: *!passa ${lobbyId} @usuario*`,
        mentions: session.players,
      })

      const countdownSeconds = [15, 10, 5, 4, 3, 2, 1]
      for (const secs of countdownSeconds) {
        const delayMs = Math.max(0, state.durationMs - secs * 1000)
        setTimeout(async () => {
          const currentState = storage.getGameState(from, stateKey)
          if (!currentState) return
          const holder = currentState.currentHolder
          await sock.sendMessage(from, {
            text: `⏱️ *${secs}s* restantes no lobby *${lobbyId}*\nBatata com @${holder.split("@")[0]}`,
            mentions: [holder],
          })
        }, delayMs)
      }

      setTimeout(async () => {
        const finalState = storage.getGameState(from, stateKey)
        if (finalState) {
          const loser = batataquente.getLoser(finalState)
          const resenhaOn = isResenhaModeEnabled()
          await sock.sendMessage(from, {
            text: resenhaOn
              ? `⏰ Tempo acabou no lobby *${lobbyId}*!\n🔴 @${loser.split("@")[0]} foi punido!`
              : `⏰ Tempo acabou no lobby *${lobbyId}*!\n🔴 @${loser.split("@")[0]} perdeu a rodada!`,
            mentions: [loser],
          })

          await applyRandomGamePunishment(loser)
          storage.clearGameState(from, stateKey)
        }
      }, 15000)

      return
    }

    // Handle batata passa (pass)
    if (cmdName === prefix + "passa" && isGroup) {
      const resolved = resolveActiveLobbyForPlayer("batata", cmdArg1, sender)
      if (!resolved.ok && resolved.reason === "not-in-lobby") {
        return sock.sendMessage(from, { text: `Você não está no lobby *${resolved.lobbyId}*.` })
      }
      if (!resolved.ok && resolved.reason === "not-found") {
        return sock.sendMessage(from, { text: "Você não está em nenhuma Batata Quente ativa. Use !passa @usuario quando estiver em jogo." })
      }
      if (!resolved.ok && resolved.reason === "ambiguous") {
        return sock.sendMessage(from, { text: "Você está em mais de uma Batata Quente. Use: !passa <LobbyID> @usuario" })
      }

      const { lobbyId, stateKey, state } = resolved

      const target = mentioned[0]
      if (!target) return sock.sendMessage(from, { text: "Marque alguém para passar a batata!" })

      const result = batataquente.recordPass(state, sender, target)
      if (!result.valid) {
        return sock.sendMessage(from, { text: result.error })
      }

      storage.setGameState(from, stateKey, state)
      await sock.sendMessage(from, {
        text: `✅ Lobby *${lobbyId}*: @${sender.split("@")[0]} passou a batata para @${target.split("@")[0]}!`,
        mentions: [sender, target]
      })
      return
    }

    if (cmdName === prefix + "começardados" && isGroup) {
      const lobbyId = normalizeLobbyId(cmdArg1)
      if (!lobbyId) return sock.sendMessage(from, { text: "Use: !começardados <LobbyID>" })

      const session = gameManager.getOptInSession(from, lobbyId)
      if (!session || session.gameType !== "dados") {
        return sock.sendMessage(from, { text: `Lobby *${lobbyId}* de Duelo de Dados não encontrado.` })
      }

      if (session.players.length !== 2) {
        return sock.sendMessage(from, { text: "Precisamos de exatamente 2 jogadores!" })
      }

      const stateKey = activeGameKey("dados", lobbyId)
      if (storage.getGameState(from, stateKey)) {
        return sock.sendMessage(from, { text: `O lobby *${lobbyId}* já está em andamento.` })
      }

      const state = dueloDados.start(from, session.players)
      storage.setGameState(from, stateKey, state)
      gameManager.clearOptInSession(from, lobbyId)

      await sock.sendMessage(from, {
        text:
          `🎲 Duelo de Dados iniciado no lobby *${lobbyId}*!\n` +
          `${session.players.map((p) => `@${p.split("@")[0]}`).join(" vs ")}\n\n` +
          `Cada jogador usa: *!rolar* (auto)\n` +
          `Ou: *!rolar ${lobbyId}*`,
        mentions: session.players,
      })
      return
    }

    // Handle dice rolls
    if (cmdName === prefix + "rolar" && isGroup) {
      const resolved = resolveActiveLobbyForPlayer("dados", cmdArg1, sender)
      if (!resolved.ok && resolved.reason === "not-in-lobby") {
        return sock.sendMessage(from, { text: `Você não está no lobby *${resolved.lobbyId}*.` })
      }
      if (!resolved.ok && resolved.reason === "not-found") {
        return sock.sendMessage(from, { text: "Você não está em nenhum Duelo de Dados ativo." })
      }
      if (!resolved.ok && resolved.reason === "ambiguous") {
        return sock.sendMessage(from, { text: "Você está em mais de um Duelo de Dados. Use: !rolar <LobbyID>" })
      }

      const { lobbyId, stateKey, state } = resolved

      const result = dueloDados.recordRoll(state, sender)
      if (!result.valid) {
        return sock.sendMessage(from, { text: result.error })
      }

      storage.setGameState(from, stateKey, state)
      await sock.sendMessage(from, {
        text: `🎲 Lobby *${lobbyId}*: @${sender.split("@")[0]} rolou ${result.roll}!`,
        mentions: [sender]
      })

      if (Object.keys(state.rolls).length === 2) {
        const results = dueloDados.getResults(state)
        const resenhaOn = isResenhaModeEnabled()
        await sock.sendMessage(from, {
          text: `Lobby *${lobbyId}*\n\n${dueloDados.formatResults(state, results, resenhaOn)}`
        })

        if (results.punish && results.punish.length > 0) {
          if (resenhaOn) {
            for (const playerId of results.punish) {
              await applyRandomGamePunishment(playerId, {
                severityMultiplier: results.severity || 1,
              })
            }
          }
        } else if (results.loser) {
          if (resenhaOn) {
            await applyRandomGamePunishment(results.loser, {
              severityMultiplier: results.severity || 1,
            })
          }
        }

        storage.clearGameState(from, stateKey)
      }
      return
    }

    if (cmdName === prefix + "começarr" && isGroup) {
      const lobbyId = normalizeLobbyId(cmdArg1)
      if (!lobbyId) return sock.sendMessage(from, { text: "Use: !começarr <LobbyID>" })

      const session = gameManager.getOptInSession(from, lobbyId)
      if (!session || session.gameType !== "rr") {
        return sock.sendMessage(from, { text: `Lobby *${lobbyId}* de Roleta Russa não encontrado.` })
      }

      if (session.players.length === 0) {
        return sock.sendMessage(from, { text: "Precisamos de pelo menos 1 jogador!" })
      }

      const stateKey = activeGameKey("rr", lobbyId)
      if (storage.getGameState(from, stateKey)) {
        return sock.sendMessage(from, { text: `O lobby *${lobbyId}* já está em andamento.` })
      }

      const state = roletaRussa.start(from, session.players)
      storage.setGameState(from, stateKey, state)
      gameManager.clearOptInSession(from, lobbyId)

      await sock.sendMessage(from, {
        text:
          `🔫 Roleta Russa iniciada no lobby *${lobbyId}*!\n` +
          `${session.players.map((p) => `@${p.split("@")[0]}`).join(" ")}\n\n` +
          `${roletaRussa.formatStatus(state)}\n` +
          `Atire com: *!atirar* (auto)\n` +
          `Ou: *!atirar ${lobbyId}*`,
        mentions: session.players,
      })
      return
    }

    // Handle russian roulette shot
    if (cmdName === prefix + "atirar" && isGroup) {
      const resolved = resolveActiveLobbyForPlayer("rr", cmdArg1, sender)
      if (!resolved.ok && resolved.reason === "not-in-lobby") {
        return sock.sendMessage(from, { text: `Você não está no lobby *${resolved.lobbyId}*.` })
      }
      if (!resolved.ok && resolved.reason === "not-found") {
        return sock.sendMessage(from, { text: "Você não está em nenhuma Roleta Russa ativa." })
      }
      if (!resolved.ok && resolved.reason === "ambiguous") {
        return sock.sendMessage(from, { text: "Você está em mais de uma Roleta Russa. Use: !atirar <LobbyID>" })
      }

      const { lobbyId, stateKey, state } = resolved

      const currentPlayer = roletaRussa.getCurrentPlayer(state)
      if (sender !== currentPlayer) {
        return sock.sendMessage(from, {
          text: `Não é sua vez no lobby *${lobbyId}*! É de @${currentPlayer.split("@")[0]}`,
          mentions: [currentPlayer]
        })
      }

      const result = roletaRussa.takeShotAt(state)
      storage.setGameState(from, stateKey, state)

      if (result.hit) {
        const resenhaOn = isResenhaModeEnabled()
        await sock.sendMessage(from, {
          text: resenhaOn
            ? `💥 ${result.guaranteed ? "Garantido!!!" : "ACERTADO!"}\nLobby *${lobbyId}*\n🔴 @${result.loser.split("@")[0]} foi atingido e punido!`
            : `💥 ${result.guaranteed ? "Garantido!!!" : "ACERTADO!"}\nLobby *${lobbyId}*\n🔴 @${result.loser.split("@")[0]} foi atingido!`,
          mentions: [result.loser]
        })

        await applyRandomGamePunishment(result.loser)
        storage.clearGameState(from, stateKey)
      } else {
        await sock.sendMessage(from, {
          text: `*CLICK*\n✅ @${sender.split("@")[0]} sobreviveu no lobby *${lobbyId}*!\n\n${roletaRussa.formatStatus(state)}`,
          mentions: [sender]
        })
      }
      return
    }

    if ((cmd === prefix + "embaralhado") && isGroup) {
      const startResult = await startPeriodicGame("embaralhado", {
        triggeredBy: sender,
        automatic: false,
      })
      if (!startResult.ok) {
        return sock.sendMessage(from, { text: startResult.message })
      }
      return
    }

    if ((cmd === prefix + "memoria" || cmd === prefix + "memória") && isGroup) {
      const startResult = await startPeriodicGame("memória", {
        triggeredBy: sender,
        automatic: false,
      })
      if (!startResult.ok) {
        return sock.sendMessage(from, { text: startResult.message })
      }
      return
    }

    if ((cmd === prefix + "reacao" || cmd === prefix + "reação") && isGroup) {
      const metadata = await sock.groupMetadata(from)
      const botJid = jidNormalizedUser(sock.user?.id || "")
      const participants = (metadata?.participants || [])
        .map((p) => jidNormalizedUser(p.id))
        .filter((id) => id && id !== botJid)

      if (participants.length < 2) {
        return sock.sendMessage(from, { text: "São necessários pelo menos 2 participantes para iniciar a Reação por comando." })
      }

      const startResult = await startPeriodicGame("reação", {
        triggeredBy: sender,
        automatic: false,
        reactionParticipants: participants,
      })
      if (!startResult.ok) {
        return sock.sendMessage(from, { text: startResult.message })
      }
      return
    }

    if ((cmd === prefix + "obedecer") && isGroup) {
      const startResult = await startPeriodicGame("ultimoAObedecer", {
        triggeredBy: sender,
        automatic: false,
      })
      if (!startResult.ok) {
        return sock.sendMessage(from, { text: startResult.message })
      }
      return
    }

    // MESSAGE COUNTER for triggered games
    if (isGroup && !isCommand) {
      gameManager.incrementMessageCounter(from, sender)

      const reactionActive = storage.getGameState(from, "reaçãoActive")
      if (reactionActive && reactionActive.started && !reactionActive.winner) {
        const reactionResult = reação.recordReaction(reactionActive, sender)
        if (reactionResult.valid) {
          reactionActive.winner = sender
          storage.setGameState(from, "reaçãoActive", reactionActive)
          const results = reação.getResults(reactionActive)
          const resenhaOn = isResenhaModeEnabled()

          await sock.sendMessage(from, {
            text: reação.formatResults(reactionActive, results, resenhaOn),
          })

          const allowedTargets = reactionActive.restrictToPlayers
            ? (reactionActive.players || []).filter((p) => p !== sender)
            : null
          await createPendingTargetForWinner(
            sender,
            `⚡ @${sender.split("@")[0]} venceu o Teste de Reação!`,
            1,
            allowedTargets
          )

          storage.clearGameState(from, "reaçãoActive")
          return
        }
      }

      // Check for triggered games state responses
      const wsActive = storage.getGameState(from, "embaralhadoActive")
      if (wsActive && !wsActive.winner) {
        const result = embaralhado.checkAnswer(wsActive, sender, text)
        if (result.correct) {
          storage.setGameState(from, "embaralhadoActive", wsActive)
          const resenhaOn = isResenhaModeEnabled()
          await sock.sendMessage(from, {
            text: embaralhado.formatResults(wsActive, resenhaOn)
          })

          await createPendingTargetForWinner(
            sender,
            `📝 @${sender.split("@")[0]}, você venceu o Embaralhado!`,
            1,
            null
          )

          storage.clearGameState(from, "embaralhadoActive")
          return
        }
      }

      const memActive = storage.getGameState(from, "memóriaActive")
      if (memActive && !memActive.winner) {
        const memoryAnswerText = text.trim()
        const memoryAnswerOnlyPattern = /^[A-Za-z0-9]{12}$/
        if (!memoryAnswerOnlyPattern.test(memoryAnswerText)) {
          // Memory answers must be message-only, exact 12 chars (A-Z/0-9).
        } else {
          const result = memória.recordAttempt(memActive, sender, memoryAnswerText)
        if (result.correct) {
          storage.setGameState(from, "memóriaActive", memActive)
          const resenhaOn = isResenhaModeEnabled()
          await sock.sendMessage(from, {
            text: memória.formatResults(memActive, resenhaOn)
          })

          await createPendingTargetForWinner(
            result.winner,
            `🎯 @${result.winner.split("@")[0]}, você venceu a Memória!`,
            1,
            null
          )

          storage.clearGameState(from, "memóriaActive")
          return
        }
        }
      }

      const uaActive = storage.getGameState(from, "ultimoAObedecerActive")
      if (uaActive && uaActive.instruction.cmd === "silence") {
        // Someone broke silence
        ultimoAObedecer.recordSilenceBreaker(uaActive, sender)
        storage.setGameState(from, "ultimoAObedecerActive", uaActive)
      } else if (uaActive && uaActive.instruction.cmd !== "silence") {
        const isCompliant = ultimoAObedecer.isValidCompliance(uaActive, {
          text,
          mentioned,
          rawMsg: msg,
        })
        if (isCompliant) {
          ultimoAObedecer.recordCompliance(uaActive, sender)
          storage.setGameState(from, "ultimoAObedecerActive", uaActive)
        }
      }

      // Check if should trigger periodic games
      if (gameManager.shouldTriggerPeriodicGame(from)) {
        const gameType = gameManager.pickRandom(["embaralhado", "reação", "ultimoAObedecer", "memória"])
        const startResult = await startPeriodicGame(gameType, {
          triggeredBy: sender,
          automatic: true,
        })

        if (startResult.ok) {
          gameManager.recordPeriodicTrigger(from)
        } else {
          gameManager.resetMessageCounter(from)
        }
      }
    }

    let media =
      msg.message?.imageMessage ||
      msg.message?.videoMessage ||
      quoted?.imageMessage ||
      quoted?.videoMessage

    // =========================
    // MENU
    // =========================
    if(cmd === prefix+"menu"){
      await sock.sendMessage(from,{
        text:`
╭━━━〔 🤖 VITIN BOT 〕━━━╮
│ 👑 Status: Online
│ ⚙️ Sistema: Baileys
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 🎨 FIGURINHAS 〕━━━╮
│ ${prefix}s / ${prefix}fig / ${prefix}sticker / ${prefix}f
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 🎮 DIVERSÃO 〕━━━╮
│ ${prefix}roleta
│ ${prefix}bombardeio @user
│ ${prefix}gay @user
│ ${prefix}gado @user
│ ${prefix}ship @a @b
│ ${prefix}treta
│ ${prefix}moeda
│--- ${prefix}moeda dobroounada
│--- ${prefix}streak (para ver sua sequência)
│--- ${prefix}streakranking (para ver o ranking do grupo)
│ ${prefix}adivinhanumero 
│ ${prefix}batata 
│ ${prefix}dados 
│ ${prefix}rr
│ ${prefix}embaralhado 
│ ${prefix}memoria 
│ ${prefix}reacao 
│ ${prefix}obedecer
│ ${prefix}lobbies
│--- ${prefix}optar <LobbyID>
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 ⚡ ADM 〕━━━╮
│ ${prefix}mute @user
│ ${prefix}unmute @user
│ ${prefix}ban @user
│ ${prefix}punições @user
│ ${prefix}puniçõesclr @user
│ ${prefix}puniçõesadd @user
╰━━━━━━━━━━━━━━━━━━━━╯
`
      })
    }

    // =========================
    // FIGURINHA
    // =========================
    if(cmd === prefix+"s" || cmd === prefix+"fig" || cmd === prefix+"sticker" || cmd === prefix+"f"){
      if(!media) return sock.sendMessage(from,{ text:"Envie ou responda uma mídia!" })

      try{
        let buffer;
        if(msg.message?.imageMessage || msg.message?.videoMessage){
          buffer = await downloadMediaMessage(msg, "buffer", {}, { logger })
        } else if(quoted?.imageMessage || quoted?.videoMessage){
          buffer = await downloadMediaMessage({ message: quoted }, "buffer", {}, { logger })
        }

        let sticker;
        if(msg.message?.imageMessage || quoted?.imageMessage){
          sticker = await sharp(buffer)
            .resize({ width: 512, height: 512, fit: "fill" })
            .webp({ quality: 100 })
            .toBuffer()
        } else if(msg.message?.videoMessage || quoted?.videoMessage){
          sticker = await videoToSticker(buffer)
        }

        await sock.sendMessage(from,{ sticker })

      }catch(err){
        console.error(err)
        await sock.sendMessage(from,{ text:"Erro ao criar figurinha!" })
      }
    }

    // =========================
    // ROLETA
    // =========================
    if(cmd === prefix+"roleta" && isGroup){
      const metadata = await sock.groupMetadata(from)
      const participantes = (metadata?.participants || []).map(p => p.id)
      const alvo = participantes[Math.floor(Math.random()*participantes.length)]
      const numero = alvo.split("@")[0]

      const frases = [
        `@${numero} foi agraciado a rebolar lentinho pra todos do grupo!`,
        `@${numero} vai ter que pagar babão pro bonde`,
        `@${numero} teve os dados puxados e tivemos uma revelação triste, é adotado...`,
        `@${numero} por que no seu navegador tem pornô de femboy furry?`,
        `@${numero} gabaritou a tabela de DST! Parabéns pela conquista.`,
        `@${numero} foi encontrado na ilha do Epstein...`,
        `@${numero} foi censurado pelo Felca`,
        `@${numero} está dando pro pai de todo mundo do grupo`,
        `@${numero} foi visto numa boate gay no centro de São Paulo`,
        `@${numero} sei que te abandonaram na ilha do Epstein, mas não precisa se afundar em crack...`,
        `@${numero} foi avistado gravando um video para o onlyfans da Leandrinha...`,
        `@${numero} pare de me mandar foto da bunda no privado, ja disse que não vou avaliar!`,
        `@${numero} estava assinando o Privacy do Bluezão quando foi flagrado, você ta bem mano?`,
        `@${numero} teve o histórico do navegador vazado e achamos uma pesquisa estranha... Peppa Pig rule 34?`,
        `@${numero} foi pego pela vó enquanto batia punheta!`,
        `@${numero} teve uma foto constragedora vazada... pera, c ta vestido de empregada?`,
        `@${numero} descobrimos sua conta do OnlyFans!`,
        `@${numero} foi visto comendo o dono do grupo!`,
        `@${numero} viu a namorada beijando outro, não sobra nem o conceito de nada pro beta. Brutal`
      ]

      const frase = frases[Math.floor(Math.random()*frases.length)]
      await sock.sendMessage(from,{ text:frase, mentions:[alvo] })
    }

    // =========================
    // BOMBARDEIO
    // =========================
    if(cmd.startsWith(prefix+"bombardeio") && mentioned.length>0 && isGroup){
      const alvo = mentioned[0]

      const ip = `${Math.floor(Math.random()*256)}.${Math.floor(Math.random()*256)}.${Math.floor(Math.random()*256)}.${Math.floor(Math.random()*256)}`

      const provedores = ["Claro","Vivo","Tim","Oi","Copel","NET"]
      const provedor = provedores[Math.floor(Math.random()*provedores.length)]

      const dispositivos = ["Android","iOS","Windows PC","Linux PC"]
      const dispositivo = dispositivos[Math.floor(Math.random()*dispositivos.length)]

      // Região fake a partir do DDD
      const numero = alvo.split("@")[0]
      const ddd = numero.substring(0,2)
      const regiao = dddMap[ddd] || "desconhecida"

      const crimes = ["furto","roubo","estelionato","tráfico","lesão corporal","homicídio","contrabando","vandalismo","pirataria","crime cibernético","fraude","tráfico de animais","lavagem de dinheiro","crime ambiental","corrupção","sequestro","ameaça","falsificação","invasão de propriedade","crime eleitoral"]
      const crime = crimes[Math.floor(Math.random()*crimes.length)]

      await sock.sendMessage(from,{ text:`📡 Analisando ficha criminal... (1 crime encontrado: ${crime})`, mentions:[alvo] })

      setTimeout(async ()=>{
        await sock.sendMessage(from,{ text:`💻 IP rastreado: ${ip}`, mentions:[alvo] })
      },1500)

      setTimeout(async ()=>{
        await sock.sendMessage(from,{
          text:`🎯 Alvo identificado!\n📍 Região: ${regiao}\n💻 Provedor: ${provedor}\n📱 Dispositivo: ${dispositivo}\n⚠️ Vulnerabilidade encontrada!\n💣 Iniciando ataque em breve...`,
          mentions:[alvo]
        })
      },3000)
    }

    // =========================
    // GAY / GADO / SHIP
    // =========================
    if(cmd.startsWith(prefix+"gay") && mentioned[0]){
      const alvo = mentioned[0]
      const numero = alvo.split("@")[0]
      const p = Math.floor(Math.random()*101)
      await sock.sendMessage(from,{ text:`@${numero} é ${p}% gay 🌈`, mentions:[alvo] })
    }

    if(cmd.startsWith(prefix+"gado") && mentioned[0]){
      const alvo = mentioned[0]
      const numero = alvo.split("@")[0]
      const p = Math.floor(Math.random()*101)
      await sock.sendMessage(from,{ text:`@${numero} é ${p}% gado 🐂`, mentions:[alvo] })
    }

    if(cmd.startsWith(prefix+"ship") && mentioned.length >= 2){
      const p1 = mentioned[0]
      const p2 = mentioned[1]
      const n1 = p1.split("@")[0]
      const n2 = p2.split("@")[0]
      const chance = Math.floor(Math.random()*101)
      await sock.sendMessage(from,{
        text:`💘 @${n1} + @${n2} = ${chance}%`,
        mentions:[p1,p2]
      })
    }

    // =========================
    // TRETA
    // =========================
    if(cmd === prefix+"treta" && isGroup){
      const metadata = await sock.groupMetadata(from)
      const participantes = (metadata?.participants || []).map(p => p.id)
      const p1 = participantes[Math.floor(Math.random()*participantes.length)]
      let p2 = participantes[Math.floor(Math.random()*participantes.length)]
      while(p1 === p2) p2 = participantes[Math.floor(Math.random()*participantes.length)]
      const n1 = p1.split("@")[0]
      const n2 = p2.split("@")[0]

      const motivos = [
        "brigaram por causa de comida",
        "discutiram por causa de mulher",
        `treta começou pois @${n1} tentou ver a pasta trancada de @${n2}`,
        "um chamou o outro de feio kkkkkkkkkkkk",
        "disputa de ego gigantesca",
        `treta começou pois @${n1} falou que era mais forte que @${n2}`,
        "um deve dinheiro pro outro(so tem caloteiro aqui)",
        "brigaram pra ver quem tem o maior pinto"
      ]

      const motivo = motivos[Math.floor(Math.random()*motivos.length)]

      // Evento especial do pinto
      if(motivo === "brigaram pra ver quem tem o maior pinto"){
        const vencedor = Math.random() < 0.5 ? p1 : p2
        const perdedor = vencedor === p1 ? p2 : p1
        const nv = vencedor.split("@")[0]
        const np = perdedor.split("@")[0]
        const tamanhoVencedor = (Math.random()*20 + 5).toFixed(1) // 5 a 25
        const tamanhoPerdedor = (Math.random()*23 - 20).toFixed(1) // -20 a 3
        const finais = [
          `@${np} tem o menor micro pênis já registrado da história! (${tamanhoPerdedor}cm)`,
          `@${nv} ganhou com seus incríveis ${tamanhoVencedor} centímetros!`
        ]
        const resultado = finais[Math.floor(Math.random()*finais.length)]
        await sock.sendMessage(from,{
          text:`Ih, os corno começaram a tretar\n\n@${n1} VS @${n2}\n\nMotivo: ${motivo}\nResultado: ${resultado}`,
          mentions:[p1,p2]
        })
        return
      }

      const resultados = [
        `@${n1} saiu chorando`,
        `@${n2} ficou de xereca`,
        "deu empate, briguem dnv fazendo favor",
        `@${n1} ganhou`,
        `@${n2} pediu arrego`
      ]
      const resultado = resultados[Math.floor(Math.random()*resultados.length)]
      await sock.sendMessage(from,{
        text:`Ih, os corno começaram a tretar\n\n@${n1} VS @${n2}\n\nMotivo: ${motivo}\nResultado: ${resultado}`,
        mentions:[p1,p2]
      })
    }
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
    // MUTE / UNMUTE / BAN / NUKE
    // =========================
    if(cmd.startsWith(prefix + "mute") && isGroup){
      const alvo = mentioned[0]
      if(!alvo) return sock.sendMessage(from,{ text:"Marque alguém para mutar!" })
      if(alvo === sock.user.id + "@s.whatsapp.net") return sock.sendMessage(from,{ text:"Não posso me mutar!" }) 
      if(!senderIsAdmin) return sock.sendMessage(from,{ text:"Apenas admins podem mutar!" })
      const mutedUsers = storage.getMutedUsers()
      if (!mutedUsers[from]) mutedUsers[from] = {}
      mutedUsers[from][alvo] = true
      storage.setMutedUsers(mutedUsers)
      await sock.sendMessage(from,{ text:`@${alvo.split("@")[0]} foi mutado! Finalmente vai calar a boca.`, mentions:[alvo] })
    }

    if(cmd.startsWith(prefix + "unmute") && isGroup){
      const alvo = mentioned[0]
      if(!alvo) return sock.sendMessage(from,{ text:"Marque alguém para desmutar!" })
      if(alvo === sock.user.id + "@s.whatsapp.net") return sock.sendMessage(from,{ text:"Não posso me desmutar!" }) 
      if(!senderIsAdmin) return sock.sendMessage(from,{ text:"Apenas admins podem desmutar!" })
      const mutedUsers = storage.getMutedUsers()
      if (mutedUsers[from]) {
        delete mutedUsers[from][alvo]
        if (Object.keys(mutedUsers[from]).length === 0) delete mutedUsers[from]
      }
      storage.setMutedUsers(mutedUsers)
      await sock.sendMessage(from,{ text:`@${alvo.split("@")[0]} foi desmutado! Infelizmente pode falar de novo.`, mentions:[alvo] })
    }

    if(cmd.startsWith(prefix + "ban") && isGroup){
      const alvo = mentioned[0]
      if(!alvo) return sock.sendMessage(from,{ text:"Marque alguém para banir!" })
      if(alvo === sock.user.id + "@s.whatsapp.net") return sock.sendMessage(from,{ text:"Não posso me banir!" }) 
      if(!senderIsAdmin) return sock.sendMessage(from,{ text:"Apenas admins podem banir!" })
      await sock.groupParticipantsUpdate(from,[alvo],"remove")
      await sock.sendMessage(from,{ text:`@${alvo.split("@")[0]} foi banido do grupo.`, mentions:[alvo] })
    }

    if (cmd === prefix + "nuke" && isGroup) {
      if (!senderIsAdmin) return sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
      try {
        await sock.sendMessage(from, { delete: msg.key })
      } catch (e) {
        console.error("Erro ao apagar mensagem do !nuke", e)
      }
      clearPunishment(from, sender)
      const mutedUsers = storage.getMutedUsers()
      if (mutedUsers[from]?.[sender]) {
        delete mutedUsers[from][sender]
        if (Object.keys(mutedUsers[from]).length === 0) delete mutedUsers[from]
        storage.setMutedUsers(mutedUsers)
      }
      const coinPunishmentPending = storage.getCoinPunishmentPending()
      if (coinPunishmentPending[from]?.[sender]) clearPendingPunishment(from, sender)
      await sock.sendMessage(from, {
        text: `@${sender.split("@")[0]} teve todas as punições removidas instantaneamente.`,
        mentions: [sender]
      })
      return
    }

    // =========================
    // COMANDOS ADMIN DE PUNIÇÃO
    // =========================
    if (cmd === prefix + "punições" && isGroup) {
      if (!senderIsAdmin) return sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
      const alvo = mentioned[0]
      if (!alvo) return sock.sendMessage(from, { text: "Marque alguém para listar as punições." })

      const lines = []
      const mutedUsers = storage.getMutedUsers()
      if (mutedUsers[from]?.[alvo]) lines.push("- Mute admin manual (indefinido)")

      const activePunishments = storage.getActivePunishments()
      const active = activePunishments[from]?.[alvo]
      if (active) {
        if (active.type === "max5chars") lines.push("- Máx. 5 caracteres")
        if (active.type === "rate20s") lines.push("- 1 mensagem/20s")
        if (active.type === "lettersBlock") lines.push(`- Bloqueio por letras (${(active.letters || []).join("/")})`)
        if (active.type === "emojiOnly") lines.push("- Somente emojis")
        if (active.type === "mute5m") lines.push("- Mute total 5 minutos")
      }

      const coinPunishmentPending = storage.getCoinPunishmentPending()
      if (coinPunishmentPending[from]) {
        const penders = Object.keys(coinPunishmentPending[from]).filter((jid) => {
          const p = coinPunishmentPending[from][jid]
          return jid === alvo || p.target === alvo
        })
        if (penders.length > 0) lines.push(`- Escolha pendente ligada ao usuário (${penders.length})`)
      }

      await sock.sendMessage(from, {
        text: lines.length > 0
          ? `Punições de @${alvo.split("@")[0]}:\n${lines.join("\n")}`
          : `@${alvo.split("@")[0]} não possui punições ativas.`,
        mentions: [alvo]
      })
      return
    }

    if (cmd.startsWith(prefix + "puniçõesclr") && isGroup) {
      if (!senderIsAdmin) return sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
      const alvo = mentioned[0]
      if (!alvo) return sock.sendMessage(from, { text: "Marque alguém para limpar as punições." })

      clearPunishment(from, alvo)
      const mutedUsers = storage.getMutedUsers()
      if (mutedUsers[from]?.[alvo]) {
        delete mutedUsers[from][alvo]
        if (Object.keys(mutedUsers[from]).length === 0) delete mutedUsers[from]
        storage.setMutedUsers(mutedUsers)
      }

      const coinPunishmentPending = storage.getCoinPunishmentPending()
      if (coinPunishmentPending[from]) {
        const keys = Object.keys(coinPunishmentPending[from])
        for (const key of keys) {
          const pending = coinPunishmentPending[from][key]
          if (key === alvo || pending.target === alvo) {
            clearPendingPunishment(from, key)
          }
        }
      }

      await sock.sendMessage(from, {
        text: `Todas as punições de @${alvo.split("@")[0]} foram removidas.`,
        mentions: [alvo]
      })
      return
    }

    if (cmd.startsWith(prefix + "puniçõesadd") && isGroup) {
      if (!senderIsAdmin) return sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
      const alvo = mentioned[0]
      if (!alvo) return sock.sendMessage(from, { text: "Marque alguém para aplicar punição." })

      const parts = text.trim().split(/\s+/)
      const punishmentChoice = getPunishmentChoiceFromText(parts[parts.length - 1] || "")
      if (!punishmentChoice) {
        return sock.sendMessage(from, {
          text: "Use: !puniçõesadd @user <1-5>\n" + getPunishmentMenuText(),
          mentions: [alvo]
        })
      }

      await applyPunishment(sock, from, alvo, punishmentChoice)
      return
    }

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
