/**
 * REACAO (Teste de Reação)
 * 2+ jogadores. O bot avisa quando começa e inicia o tempo.
 * Quem reagir primeiro vence.
 * Usa detecção por mensagens (não é um jogo só de timestamp).
 */

module.exports = {
  // Inicia jogo de reação
  start: (groupId, players = [], options = {}) => {
    const participants = Array.isArray(players) ? players : []
    const restrictToPlayers = Boolean(options.restrictToPlayers)
    const state = {
      groupId,
      players: participants,
      restrictToPlayers,
      startedAt: Date.now(),
      started: false,
      reactions: [], // [{ playerId, at }]
      createdAt: Date.now(),
    }
    return state
  },

  // Marca jogo como iniciado (após o bot liberar)
  markStarted: (state) => {
    state.started = true
    state.startedAt = Date.now()
  },

  // Registra uma reação
  recordReaction: (state, playerId) => {
    if (!state.started) {
      return { valid: false, error: "Jogo não começou!" }
    }

    if (state.restrictToPlayers && Array.isArray(state.players) && !state.players.includes(playerId)) {
      return { valid: false, error: "Você não está na lista de participantes." }
    }

    // Verifica se já reagiu
    if (state.reactions.some((r) => r.playerId === playerId)) {
      return { valid: false, error: "Você já reagiu!" }
    }

    const reacaoMs = Date.now() - state.startedAt
    state.reactions.push({
      playerId,
      at: Date.now(),
      time: reacaoMs,
    })

    return { valid: true, time: reacaoMs }
  },

  // Pega resultados
  getResults: (state) => {
    if (state.reactions.length === 0) {
      return { type: "no_reactions", winner: null, punish: [] }
    }

    // Ordena por tempo de reação
    const sorted = [...state.reactions].sort((a, b) => a.time - b.time)

    // Vencedor: mais rápido
    const winner = sorted[0].playerId

    return {
      type: "normal",
      reactions: sorted,
      winner,
      punish: [],
    }
  },

  // Formata resultados
  formatResults: (state, results, includePunishmentWarning = true) => {
    if (results.type === "no_reactions") {
      return includePunishmentWarning
        ? "😬 Ninguém reagiu a tempo. Sem punições nesta rodada."
        : "😬 Ninguém reagiu a tempo. Rodada encerrada."
    }

    let msg = `⚡ Resultados da Reação:\n\n`

    results.reactions.forEach((r, idx) => {
      const ms = Math.round(r.time)
      msg += `${idx + 1}. @${r.playerId.split("@")[0]}: ${ms}ms\n`
    })

    msg += `\n🏆 @${results.winner.split("@")[0]} foi o mais rápido!`
    if (includePunishmentWarning) {
      msg += `\nEsse vencedor ganhou o passe para escolher 1 alvo para punição.`
    }

    return msg
  },
}
