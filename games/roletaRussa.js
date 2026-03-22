/**
 * ROLETA RUSSA (Russian Roulette)
 * 1-4 players take turns shooting. 1/6 chance to get punished.
 * On 6th shot without a hit, guaranteed hit.
 * Start with !rr and take shots with !atirar
 */

const gameManager = require("../gameManager")

module.exports = {
  // Start Russian roulette
  start: (groupId, players) => {
    const state = {
      groupId,
      players: gameManager.shuffle(players), // Randomize turn order
      currentPlayerIndex: 0,
      shotsFired: 0,
      cylinders: Math.floor(Math.random() * 6), // Which chamber has the bullet (0-5)
      loser: null,
      createdAt: Date.now(),
    }
    return state
  },

  // Get current player
  getCurrentPlayer: (state) => {
    return state.players[state.currentPlayerIndex]
  },

  // Handle shot (atirar)
  takeShotAt: (state) => {
    state.shotsFired++
    const isHit = state.cylinders === ((state.shotsFired - 1) % 6)

    if (isHit) {
      state.loser = module.exports.getCurrentPlayer(state)
      return { hit: true, loser: state.loser }
    }

    // Check if guaranteed hit (6th shot)
    if (state.shotsFired >= 6) {
      state.loser = module.exports.getCurrentPlayer(state)
      return { hit: true, guaranteed: true, loser: state.loser }
    }

    // Move to next player
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length
    return { hit: false, nextPlayer: module.exports.getCurrentPlayer(state) }
  },

  // Format status
  formatStatus: (state) => {
    return (
      `🔫 Roleta Russa!\n` +
      `Turno: ${state.currentPlayerIndex + 1}/${state.players.length}\n` +
      `Tiros: ${state.shotsFired}/6\n` +
      `Jogador atual: ${state.players[state.currentPlayerIndex].substring(0, 5)}...\n\n` +
      `Use !atirar para puxar o gatilho!`
    )
  },
}
