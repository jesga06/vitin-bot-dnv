/*
 * BATATA QUENTE
 * 2 ou mais jogadores passam a batata quente por 15s
 * O último a segurar quando o tempo expirar é punido.
 * Passe a batata com !passa + @menção
 */

const gameManager = require("../gameManager")

module.exports = {
  // Start hot potato game
  start: (groupId, players) => {
    const initialHolder = gameManager.pickRandom(players)
    const state = {
      groupId,
      players,
      currentHolder: initialHolder,
      startedAt: Date.now(),
      durationMs: 15000,
      passes: [],
    }
    return state
  },

  // Handle pass
  recordPass: (state, fromPlayerId, toPlayerId) => {
    if (state.currentHolder !== fromPlayerId) {
      return { valid: false, error: "Você não tem a batata!" }
    }
    if (fromPlayerId === toPlayerId) {
      return { valid: false, error: "A batata já está com você!" }
    }
    if (!state.players.includes(toPlayerId)) {
      return { valid: false, error: "Esse jogador não está no jogo!" }
    }

    state.currentHolder = toPlayerId
    state.passes.push({
      from: fromPlayerId,
      to: toPlayerId,
      at: Date.now(),
    })
    return { valid: true, newHolder: toPlayerId }
  },

  // Check if time expired
  isExpired: (state) => {
    return Date.now() - state.startedAt > state.durationMs
  },

  // Get loser (potato holder at end)
  getLoser: (state) => {
    return state.currentHolder
  },

  // Format game message
  formatStatus: (state) => {
    const elapsed = Date.now() - state.startedAt
    const remaining = Math.max(0, state.durationMs - elapsed)
    const secs = Math.ceil(remaining / 1000)

    return (
      `🥔 Batata Quente! ⏱️ ${secs}s restantes\n` +
      `Holder: ${state.currentHolder.substring(0, 5)}...\n` +
      `Passes: ${state.passes.length}\n\n` +
      `Use !passa @menção para passar!`
    )
  },
}
