async function handleGameCommands(ctx) {
  const {
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
  } = ctx

  if (cmdName === prefix + "começa" && isGroup) {
    const targetType = normalizeUnifiedGameType(cmdArg1)
    if (!targetType) {
      await sock.sendMessage(from, {
        text: "Use: !começa <adivinhacao|batata|dados|rr|embaralhado|memoria|reacao|comando>",
      })
      return true
    }
  }

  if ((cmd === prefix + "moeda dobro" || cmd === prefix + "moeda dobroounada") && isGroup) {
    const state = caraOuCoroa.startDobroOuNada(from, sender)
    await sock.sendMessage(from, {
      text: `🎲 Dobro ou Nada iniciado!\n\n${caraOuCoroa.formatDobroStatus(from, state)}`,
    })
    return true
  }

  if ((cmdName === prefix + "começa" && normalizeUnifiedGameType(cmdArg1) === "adivinhacao") && isGroup) {
    const blockedReason = getLobbyCreateBlockMessage("adivinhacao", "Adivinhação")
    if (blockedReason) {
      await sock.sendMessage(from, { text: blockedReason })
      return true
    }

    const lobbyId = gameManager.createOptInSession(from, "adivinhacao", 1, 4, 30000)
    await sock.sendMessage(from, {
      text:
        `🎰 Jogo de Adivinhação criado!\n` +
        `Lobby ID: *${lobbyId}*\n\n` +
        `Para entrar: *!entrar ${lobbyId}*\n` +
        `Para iniciar: *!começar ${lobbyId}*\n\n` +
        `Entrada por jogador: *${getGameBuyIn("adivinhacao")}* Epsteincoins (cobrada ao iniciar).\n` +
        `1-4 jogadores, número secreto entre 1 e 100.\n` +
        `Depois de iniciar, responda com *!resposta <número>*.`,
    })
    return true
  }

  if ((cmdName === prefix + "começa" && normalizeUnifiedGameType(cmdArg1) === "batata") && isGroup) {
    const blockedReason = getLobbyCreateBlockMessage("batata", "Batata Quente")
    if (blockedReason) {
      await sock.sendMessage(from, { text: blockedReason })
      return true
    }

    const lobbyId = gameManager.createOptInSession(from, "batata", 2, null, 30000)
    await sock.sendMessage(from, {
      text:
        `🥔 Batata Quente criada!\n` +
        `Lobby ID: *${lobbyId}*\n\n` +
        `Para entrar: *!entrar ${lobbyId}*\n` +
        `Para iniciar: *!começar ${lobbyId}*\n` +
        `Entrada por jogador: *${getGameBuyIn("batata")}* Epsteincoins (cobrada ao iniciar).\n` +
        `Mínimo de 2 jogadores, sem limite máximo.`,
    })
    return true
  }

  if ((cmdName === prefix + "começa" && normalizeUnifiedGameType(cmdArg1) === "dados") && isGroup) {
    const blockedReason = getLobbyCreateBlockMessage("dados", "Duelo de Dados")
    if (blockedReason) {
      await sock.sendMessage(from, { text: blockedReason })
      return true
    }

    const lobbyId = gameManager.createOptInSession(from, "dados", 2, 2, 30000)
    await sock.sendMessage(from, {
      text:
        `🎲 Duelo de Dados criado!\n` +
        `Lobby ID: *${lobbyId}*\n\n` +
        `Para entrar: *!entrar ${lobbyId}*\n` +
        `Para iniciar: *!começar ${lobbyId}*\n` +
        `Entrada por jogador: *${getGameBuyIn("dados")}* Epsteincoins (cobrada ao iniciar).`,
    })
    return true
  }

  if ((cmdName === prefix + "começa" && normalizeUnifiedGameType(cmdArg1) === "rr") && isGroup) {
    const blockedReason = getLobbyCreateBlockMessage("rr", "Roleta Russa")
    if (blockedReason) {
      await sock.sendMessage(from, { text: blockedReason })
      return true
    }

    const lobbyId = gameManager.createOptInSession(from, "rr", 1, 4, 30000)
    await sock.sendMessage(from, {
      text:
        `🔫 Roleta Russa criada!\n` +
        `Lobby ID: *${lobbyId}*\n\n` +
        `Para entrar: *!entrar ${lobbyId}*\n` +
        `Para iniciar: *!começar ${lobbyId} [aposta]*\n` +
        `Entrada por jogador: *${getGameBuyIn("rr")}* Epsteincoins (cobrada ao iniciar).\n` +
        `Exemplo: *!começar ${lobbyId} 3*`,
    })
    return true
  }

  if (cmdName === prefix + "entrar" && isGroup) {
    const lobbyId = normalizeLobbyId(cmdArg1)
    if (!lobbyId) {
      await sock.sendMessage(from, { text: "Use: !entrar <LobbyID>" })
      return true
    }

    const session = gameManager.getOptInSession(from, lobbyId)
    if (!session) {
      await sock.sendMessage(from, { text: `Lobby *${lobbyId}* não encontrado ou expirado.` })
      return true
    }

    if (gameManager.addPlayerToOptIn(from, lobbyId, sender)) {
      const maxPlayersLabel = Number.isFinite(session.maxPlayers) ? String(session.maxPlayers) : "∞"
      await sock.sendMessage(from, {
        text: `✅ @${sender.split("@")[0]} entrou no lobby *${lobbyId}*!\nJogadores: ${session.players.length}/${maxPlayersLabel}`,
        mentions: [sender],
      })
    } else {
      await sock.sendMessage(from, {
        text: "Lobby cheio ou você já entrou nele.",
      })
    }
    return true
  }

  if (cmd === prefix + "lobbies" && isGroup) {
    const groupSessions = gameManager.optInSessions[from] || {}
    const ids = Object.keys(groupSessions)
    if (ids.length === 0) {
      await sock.sendMessage(from, { text: "Nenhum lobby aberto no momento." })
      return true
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
        "\n\nEntre com: !entrar <LobbyID>",
    })
    return true
  }

  if (cmdName === prefix + "começar" && isGroup) {
    const lobbyId = normalizeLobbyId(cmdArg1)
    if (!lobbyId) {
      await sock.sendMessage(from, { text: "Use: !começar <LobbyID>" })
      return true
    }

    const session = gameManager.getOptInSession(from, lobbyId)
    if (!session) {
      await sock.sendMessage(from, { text: `Lobby *${lobbyId}* não encontrado.` })
      return true
    }

    const stateKey = activeGameKey(session.gameType, lobbyId)
    if (storage.getGameState(from, stateKey)) {
      await sock.sendMessage(from, { text: `O lobby *${lobbyId}* já está em andamento.` })
      return true
    }

    if (session.gameType === "adivinhacao") {
      if (session.players.length < 1) {
        await sock.sendMessage(from, { text: "Precisamos de pelo menos 1 jogador!" })
        return true
      }

      const buyInAmount = getGameBuyIn(session.gameType)
      const buyInResult = collectLobbyBuyIn(session.players, buyInAmount, session.gameType)
      if (!buyInResult.ok) {
        await sock.sendMessage(from, {
          text: `Sem saldo para entrada (${buyInAmount}) para: ${buyInResult.insufficient.map((p) => `@${p.split("@")[0]}`).join(" ")}`,
          mentions: buyInResult.insufficient,
        })
        return true
      }

      const state = adivinhacao.start(from, session.players)
      state.buyInPool = buyInResult.pool || 0
      state.buyInAmount = buyInAmount
      storage.setGameState(from, stateKey, state)
      gameManager.clearOptInSession(from, lobbyId)

      const mentions = [...session.players]
      await sock.sendMessage(from, {
        text:
          `🎰 Adivinhação iniciada no lobby *${lobbyId}*!\n` +
          `${mentions.map((p) => `@${p.split("@")[0]}`).join(" ")}\n\n` +
          `Resposta: *!resposta <número>* (auto)\n` +
          `Ou: *!resposta ${lobbyId} <número>*\n` +
          `Faixa: 1-100`,
        mentions,
      })
      return true
    }

    if (session.gameType === "batata") {
      if (session.players.length < 2) {
        await sock.sendMessage(from, { text: "Precisamos de pelo menos 2 jogadores!" })
        return true
      }

      const buyInAmount = getGameBuyIn(session.gameType)
      const buyInResult = collectLobbyBuyIn(session.players, buyInAmount, session.gameType)
      if (!buyInResult.ok) {
        await sock.sendMessage(from, {
          text: `Sem saldo para entrada (${buyInAmount}) para: ${buyInResult.insufficient.map((p) => `@${p.split("@")[0]}`).join(" ")}`,
          mentions: buyInResult.insufficient,
        })
        return true
      }

      const state = batataquente.start(from, session.players)
      state.buyInPool = buyInResult.pool || 0
      state.buyInAmount = buyInAmount
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

          const winners = (finalState.players || []).filter((playerId) => playerId !== loser)
          winners.forEach((playerId) => incrementUserStat(playerId, "gameBatataWin", 1))
          incrementUserStat(loser, "gameBatataLoss", 1)
          await rewardPlayers(winners, GAME_REWARDS.BATATA_WIN, 1, "Batata Quente")
          await distributeLobbyBuyInPool(winners, finalState.buyInPool, "Batata Quente")

          await applyRandomGamePunishment(loser)
          storage.clearGameState(from, stateKey)
        }
      }, 15000)

      return true
    }

    if (session.gameType === "dados") {
      if (session.players.length !== 2) {
        await sock.sendMessage(from, { text: "Precisamos de exatamente 2 jogadores!" })
        return true
      }

      const buyInAmount = getGameBuyIn(session.gameType)
      const buyInResult = collectLobbyBuyIn(session.players, buyInAmount, session.gameType)
      if (!buyInResult.ok) {
        await sock.sendMessage(from, {
          text: `Sem saldo para entrada (${buyInAmount}) para: ${buyInResult.insufficient.map((p) => `@${p.split("@")[0]}`).join(" ")}`,
          mentions: buyInResult.insufficient,
        })
        return true
      }

      const state = dueloDados.start(from, session.players)
      state.buyInPool = buyInResult.pool || 0
      state.buyInAmount = buyInAmount
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
      return true
    }

    if (session.gameType === "rr") {
      if (session.players.length === 0) {
        await sock.sendMessage(from, { text: "Precisamos de pelo menos 1 jogador!" })
        return true
      }

      const buyInAmount = getGameBuyIn(session.gameType)
      const buyInResult = collectLobbyBuyIn(session.players, buyInAmount, session.gameType)
      if (!buyInResult.ok) {
        await sock.sendMessage(from, {
          text: `Sem saldo para entrada (${buyInAmount}) para: ${buyInResult.insufficient.map((p) => `@${p.split("@")[0]}`).join(" ")}`,
          mentions: buyInResult.insufficient,
        })
        return true
      }

      const betMultiplier = parsePositiveInt(cmdArg2, 1)
      const state = roletaRussa.start(from, session.players, { betMultiplier })
      state.buyInPool = buyInResult.pool || 0
      state.buyInAmount = buyInAmount
      storage.setGameState(from, stateKey, state)
      gameManager.clearOptInSession(from, lobbyId)

      await sock.sendMessage(from, {
        text:
          `🔫 Roleta Russa iniciada no lobby *${lobbyId}*!\n` +
          `${session.players.map((p) => `@${p.split("@")[0]}`).join(" ")}\n\n` +
          `Multiplicador de aposta: *${state.betMultiplier || 1}x*\n` +
          `${roletaRussa.formatStatus(state)}\n` +
          `Atire com: *!atirar* (auto)\n` +
          `Ou: *!atirar ${lobbyId}*`,
        mentions: session.players,
      })
      return true
    }

    await sock.sendMessage(from, { text: "Esse lobby deve ser iniciado com !começa <jogo>." })
    return true
  }

  if (cmdName === prefix + "resposta" && isGroup) {
    const resolved = resolveActiveLobbyForPlayer("adivinhacao", cmdArg1, sender)
    if (!resolved.ok && resolved.reason === "not-in-lobby") {
      await sock.sendMessage(from, { text: `Você não está no lobby *${resolved.lobbyId}*.` })
      return true
    }
    if (!resolved.ok && resolved.reason === "not-found") {
      await sock.sendMessage(from, { text: "Você não está em nenhuma Adivinhação ativa. Use !resposta <número> quando estiver em jogo." })
      return true
    }
    if (!resolved.ok && resolved.reason === "ambiguous") {
      await sock.sendMessage(from, { text: "Você está em mais de uma Adivinhação. Use: !resposta <LobbyID> <número>" })
      return true
    }

    const guessToken = resolved.foundExplicit ? cmdArg2 : cmdArg1
    const { lobbyId, stateKey, state } = resolved
    const result = adivinhacao.recordGuess(state, sender, guessToken)
    if (!result.valid) {
      await sock.sendMessage(from, { text: result.error })
      return true
    }

    storage.setGameState(from, stateKey, state)

    if (Object.keys(state.guesses).length === state.players.length) {
      const results = adivinhacao.getResults(state)
      const guessBuckets = {}
      Object.keys(state.guesses || {}).forEach((playerId) => {
        const guessValue = state.guesses[playerId]
        if (!guessBuckets[guessValue]) guessBuckets[guessValue] = []
        guessBuckets[guessValue].push(playerId)
      })
      Object.values(guessBuckets).forEach((bucket) => {
        if (bucket.length > 1) {
          bucket.forEach((playerId) => incrementUserStat(playerId, "gameGuessTie", 1))
        }
      })

      if (Array.isArray(results.punishments) && results.punishments.length > 0) {
        results.punishments.forEach((entry) => incrementUserStat(entry.playerId, "gameGuessLoss", 1))
      }

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
        text: `Lobby *${lobbyId}*\n\n${adivinhacao.formatResults(state, displayResults, resenhaOn)}`,
      })

      if (results.chooser) {
        incrementUserStat(results.chooser, "gameGuessExact", 1)
        await rewardPlayer(results.chooser, GAME_REWARDS.ADIVINHACAO_EXACT, 1, "Adivinhação (acerto exato)")
        await distributeLobbyBuyInPool([results.chooser], state.buyInPool, "Adivinhação")
      } else if (Array.isArray(results.closestPlayers) && results.closestPlayers.length > 0 && state.players.length > 1) {
        results.closestPlayers.forEach((playerId) => incrementUserStat(playerId, "gameGuessClosest", 1))
        await rewardPlayers(results.closestPlayers, GAME_REWARDS.ADIVINHACAO_CLOSEST, 1, "Adivinhação")
        await distributeLobbyBuyInPool(results.closestPlayers, state.buyInPool, "Adivinhação")
      } else if (state.players.length === 1) {
        incrementUserStat(state.players[0], "gameGuessLoss", 1)
        await sock.sendMessage(from, {
          text: "Adivinhação solo: só recebe recompensa em acerto exato.",
        })
      }

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
    return true
  }

  if (cmdName === prefix + "passa" && isGroup) {
    const resolved = resolveActiveLobbyForPlayer("batata", cmdArg1, sender)
    if (!resolved.ok && resolved.reason === "not-in-lobby") {
      await sock.sendMessage(from, { text: `Você não está no lobby *${resolved.lobbyId}*.` })
      return true
    }
    if (!resolved.ok && resolved.reason === "not-found") {
      await sock.sendMessage(from, { text: "Você não está em nenhuma Batata Quente ativa. Use !passa @usuario quando estiver em jogo." })
      return true
    }
    if (!resolved.ok && resolved.reason === "ambiguous") {
      await sock.sendMessage(from, { text: "Você está em mais de uma Batata Quente. Use: !passa <LobbyID> @usuario" })
      return true
    }

    const { lobbyId, stateKey, state } = resolved

    const target = mentioned[0]
    if (!target) {
      await sock.sendMessage(from, { text: "Marque alguém para passar a batata!" })
      return true
    }

    const result = batataquente.recordPass(state, sender, target)
    if (!result.valid) {
      await sock.sendMessage(from, { text: result.error })
      return true
    }

    storage.setGameState(from, stateKey, state)
    await sock.sendMessage(from, {
      text: `✅ Lobby *${lobbyId}*: @${sender.split("@")[0]} passou a batata para @${target.split("@")[0]}!`,
      mentions: [sender, target],
    })
    return true
  }

  if (cmdName === prefix + "rolar" && isGroup) {
    const resolved = resolveActiveLobbyForPlayer("dados", cmdArg1, sender)
    if (!resolved.ok && resolved.reason === "not-in-lobby") {
      await sock.sendMessage(from, { text: `Você não está no lobby *${resolved.lobbyId}*.` })
      return true
    }
    if (!resolved.ok && resolved.reason === "not-found") {
      await sock.sendMessage(from, { text: "Você não está em nenhum Duelo de Dados ativo." })
      return true
    }
    if (!resolved.ok && resolved.reason === "ambiguous") {
      await sock.sendMessage(from, { text: "Você está em mais de um Duelo de Dados. Use: !rolar <LobbyID>" })
      return true
    }

    const { lobbyId, stateKey, state } = resolved

    const result = dueloDados.recordRoll(state, sender)
    if (!result.valid) {
      await sock.sendMessage(from, { text: result.error })
      return true
    }

    storage.setGameState(from, stateKey, state)
    await sock.sendMessage(from, {
      text: `🎲 Lobby *${lobbyId}*: @${sender.split("@")[0]} rolou ${result.roll}!`,
      mentions: [sender],
    })

    if (Object.keys(state.rolls).length === 2) {
      const results = dueloDados.getResults(state)
      const resenhaOn = isResenhaModeEnabled()
      await sock.sendMessage(from, {
        text: `Lobby *${lobbyId}*\n\n${dueloDados.formatResults(state, results, resenhaOn)}`,
      })

      if (results.winner) {
        incrementUserStat(results.winner, "gameDadosWin", 1)
        await rewardPlayer(results.winner, GAME_REWARDS.DADOS_WIN, 1, "Duelo de Dados")
        await distributeLobbyBuyInPool([results.winner], state.buyInPool, "Duelo de Dados")
      }

      if (results.punish && results.punish.length > 0) {
        results.punish.forEach((playerId) => incrementUserStat(playerId, "gameDadosLoss", 1))
        if (resenhaOn) {
          for (const playerId of results.punish) {
            await applyRandomGamePunishment(playerId, {
              severityMultiplier: results.severity || 1,
            })
          }
        }
      } else if (results.loser) {
        incrementUserStat(results.loser, "gameDadosLoss", 1)
        if (resenhaOn) {
          await applyRandomGamePunishment(results.loser, {
            severityMultiplier: results.severity || 1,
          })
        }
      }

      storage.clearGameState(from, stateKey)
    }
    return true
  }

  if (cmdName === prefix + "atirar" && isGroup) {
    const resolved = resolveActiveLobbyForPlayer("rr", cmdArg1, sender)
    if (!resolved.ok && resolved.reason === "not-in-lobby") {
      await sock.sendMessage(from, { text: `Você não está no lobby *${resolved.lobbyId}*.` })
      return true
    }
    if (!resolved.ok && resolved.reason === "not-found") {
      await sock.sendMessage(from, { text: "Você não está em nenhuma Roleta Russa ativa." })
      return true
    }
    if (!resolved.ok && resolved.reason === "ambiguous") {
      await sock.sendMessage(from, { text: "Você está em mais de uma Roleta Russa. Use: !atirar <LobbyID>" })
      return true
    }

    const { lobbyId, stateKey, state } = resolved

    const currentPlayer = roletaRussa.getCurrentPlayer(state)
    if (sender !== currentPlayer) {
      await sock.sendMessage(from, {
        text: `Não é sua vez no lobby *${lobbyId}*! É de @${currentPlayer.split("@")[0]}`,
        mentions: [currentPlayer],
      })
      return true
    }

    const result = roletaRussa.takeShotAt(state)
    incrementUserStat(sender, "gameRrTrigger", 1)
    storage.setGameState(from, stateKey, state)
    const betMultiplier = parsePositiveInt(state.betMultiplier, 1)

    if (result.hit) {
      const resenhaOn = isResenhaModeEnabled()
      await sock.sendMessage(from, {
        text: resenhaOn
          ? `💥 ${result.guaranteed ? "Garantido!!!" : "ACERTADO!"}\nLobby *${lobbyId}*\n🔴 @${result.loser.split("@")[0]} foi atingido e punido!`
          : `💥 ${result.guaranteed ? "Garantido!!!" : "ACERTADO!"}\nLobby *${lobbyId}*\n🔴 @${result.loser.split("@")[0]} foi atingido!`,
        mentions: [result.loser],
      })

      const rrLoss = BASE_GAME_REWARD * betMultiplier
      const rrTaken = economyService.debitCoinsFlexible(result.loser, rrLoss, {
        type: "game-loss",
        details: "Derrota em Roleta Russa",
        meta: { game: "rr", multiplier: betMultiplier },
      })
      if (rrTaken > 0) {
        incrementUserStat(result.loser, "moneyGameLost", rrTaken)
        await sock.sendMessage(from, {
          text: `💸 @${result.loser.split("@")[0]} perdeu *${rrTaken}* Epsteincoins na Roleta Russa.`,
          mentions: [result.loser],
        })
      }

      incrementUserStat(result.loser, "gameRrShotLoss", 1)
      await applyRandomGamePunishment(result.loser, { severityMultiplier: betMultiplier })
      const winners = (state.players || []).filter((playerId) => playerId !== result.loser)
      winners.forEach((playerId) => {
        incrementUserStat(playerId, "gameRrWin", 1)
        incrementUserStat(playerId, "gameRrBetWin", 1)
      })
      const rrRewardBase = result.guaranteed ? GAME_REWARDS.ROLETA_WIN_GUARANTEED : GAME_REWARDS.ROLETA_WIN
      await rewardPlayers(winners, rrRewardBase, betMultiplier, "Roleta Russa")
      await distributeLobbyBuyInPool(winners, state.buyInPool, "Roleta Russa")
      storage.clearGameState(from, stateKey)
    } else {
      await sock.sendMessage(from, {
        text: `*CLICK*\n✅ @${sender.split("@")[0]} sobreviveu no lobby *${lobbyId}*!\n\n${roletaRussa.formatStatus(state)}`,
        mentions: [sender],
      })
    }
    return true
  }

  if ((cmd === prefix + "embaralhado" || (cmdName === prefix + "começa" && normalizeUnifiedGameType(cmdArg1) === "embaralhado")) && isGroup) {
    const startResult = await startPeriodicGame("embaralhado", {
      triggeredBy: sender,
      automatic: false,
    })
    if (!startResult.ok) {
      await sock.sendMessage(from, { text: startResult.message })
    }
    return true
  }

  if ((cmdName === prefix + "começa" && normalizeUnifiedGameType(cmdArg1) === "memória") && isGroup) {
    const startResult = await startPeriodicGame("memória", {
      triggeredBy: sender,
      automatic: false,
    })
    if (!startResult.ok) {
      await sock.sendMessage(from, { text: startResult.message })
    }
    return true
  }

  if ((cmdName === prefix + "começa" && normalizeUnifiedGameType(cmdArg1) === "reação") && isGroup) {
    const metadata = await sock.groupMetadata(from)
    const botJid = jidNormalizedUser(sock.user?.id || "")
    const participants = (metadata?.participants || [])
      .map((p) => jidNormalizedUser(p.id))
      .filter((id) => id && id !== botJid)

    if (participants.length < 2) {
      await sock.sendMessage(from, { text: "São necessários pelo menos 2 participantes para iniciar a Reação por comando." })
      return true
    }

    const startResult = await startPeriodicGame("reação", {
      triggeredBy: sender,
      automatic: false,
      reactionParticipants: participants,
    })
    if (!startResult.ok) {
      await sock.sendMessage(from, { text: startResult.message })
    }
    return true
  }

  if ((cmdName === prefix + "começa" && normalizeUnifiedGameType(cmdArg1) === "comando") && isGroup) {
    const startResult = await startPeriodicGame("comando", {
      triggeredBy: sender,
      automatic: false,
    })
    if (!startResult.ok) {
      await sock.sendMessage(from, { text: startResult.message })
    }
    return true
  }

  return false
}

async function handleGameMessageFlow(ctx) {
  const {
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
  } = ctx

  if (!isGroup || isCommand) return false

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

      await rewardPlayer(sender, GAME_REWARDS.REACAO, 1, "Reação")
      incrementUserStat(sender, "gameReacaoWin", 1)

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
      return true
    }
  }

  const wsActive = storage.getGameState(from, "embaralhadoActive")
  if (wsActive && !wsActive.winner) {
    const result = embaralhado.checkAnswer(wsActive, sender, text)
    if (result.correct) {
      storage.setGameState(from, "embaralhadoActive", wsActive)
      const resenhaOn = isResenhaModeEnabled()
      await sock.sendMessage(from, {
        text: embaralhado.formatResults(wsActive, resenhaOn),
      })

      await rewardPlayer(sender, GAME_REWARDS.EMBARALHADO, 1, "Embaralhado")
      incrementUserStat(sender, "gameEmbaralhadoWin", 1)

      await createPendingTargetForWinner(
        sender,
        `📝 @${sender.split("@")[0]}, você venceu o Embaralhado!`,
        1,
        null
      )

      storage.clearGameState(from, "embaralhadoActive")
      return true
    }
  }

  const memActive = storage.getGameState(from, "memóriaActive")
  if (memActive && !memActive.winner) {
    const memoryAnswerText = text.trim()
    const memoryAnswerOnlyPattern = /^[A-Za-z0-9]{12}$/
    if (memoryAnswerOnlyPattern.test(memoryAnswerText)) {
      const result = memória.recordAttempt(memActive, sender, memoryAnswerText)
      if (result.correct) {
        storage.setGameState(from, "memóriaActive", memActive)
        const resenhaOn = isResenhaModeEnabled()
        await sock.sendMessage(from, {
          text: memória.formatResults(memActive, resenhaOn),
        })

        await rewardPlayer(result.winner, GAME_REWARDS.MEMORIA, 1, "Memória")
        incrementUserStat(result.winner, "gameMemoriaWin", 1)

        await createPendingTargetForWinner(
          result.winner,
          `🎯 @${result.winner.split("@")[0]}, você venceu a Memória!`,
          1,
          null
        )

        storage.clearGameState(from, "memóriaActive")
        return true
      }
    }
  }

  const uaActive = storage.getGameState(from, "comandoActive")
  if (uaActive) {
    comando.recordParticipant(uaActive, sender)
    storage.setGameState(from, "comandoActive", uaActive)
  }

  if (uaActive && uaActive.instruction.cmd === "silence") {
    comando.recordSilenceBreaker(uaActive, sender)
    storage.setGameState(from, "comandoActive", uaActive)
  } else if (uaActive && uaActive.instruction.cmd !== "silence") {
    const isCompliant = comando.isValidCompliance(uaActive, {
      text,
      mentioned,
      rawMsg: msg,
    })
    if (isCompliant) {
      comando.recordCompliance(uaActive, sender)
      storage.setGameState(from, "comandoActive", uaActive)
    }
  }

  if (gameManager.shouldTriggerPeriodicGame(from)) {
    const gameType = gameManager.pickRandom(["embaralhado", "reação", "comando", "memória"])
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

  return false
}

module.exports = {
  handleGameCommands,
  handleGameMessageFlow,
}
