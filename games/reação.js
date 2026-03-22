/**
 * REACAO (Teste de Reação)
 * 2+ players. Bot says "go!" and starts timer.
 * First to mention the bot wins. Last to react (or slowest) gets punished.
 * Uses message detection (not a timestamp-based game).
 */

module.exports = {
  // Start reação game
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

  // Mark game as started (after bot says "go!")
  markStarted: (state) => {
    state.started = true
    state.startedAt = Date.now()
  },

  // Record a reaction
  recordReaction: (state, playerId) => {
    if (!state.started) {
      return { valid: false, error: "Jogo não começou!" }
    }

    if (state.restrictToPlayers && Array.isArray(state.players) && !state.players.includes(playerId)) {
      return { valid: false, error: "Você não está na lista de participantes." }
    }

    // Check if already reacted
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

  // Get results
  getResults: (state) => {
    if (state.reactions.length === 0) {
      return { type: "no_reactions", winner: null, punish: [] }
    }

    // Sort by reaction time
    const sorted = [...state.reactions].sort((a, b) => a.time - b.time)

    // Winner: fastest
    const winner = sorted[0].playerId

    return {
      type: "normal",
      reactions: sorted,
      winner,
      punish: [],
    }
  },

  // Format results
  formatResults: (state, results, includePunishmentWarning = true) => {
    if (results.type === "no_reactions") {
      return includePunishmentWarning
        ? "😬 Ninguém reagiu a tempo. Sem punições nesta rodada."
        : "😬 Ninguém reagiu a tempo. Rodada encerrada."
    }

    let msg = `⚡ Resultados da Reação:\n\n`

    results.reactions.forEach((r, idx) => {
      const ms = Math.round(r.time)
      msg += `${idx + 1}. ${r.playerId.substring(0, 5)}: ${ms}ms\n`
    })

    msg += `\n🏆 ${results.winner.substring(0, 5)}... foi o mais rápido!`
    if (includePunishmentWarning) {
      msg += `\nEsse vencedor ganhou o passe para escolher 1 alvo para punição.`
    }

    return msg
  },
}
