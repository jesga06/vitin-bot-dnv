/**
 * ROLETA RUSSA (Russian Roulette)
 * 1-4 jogadores se revezam atirando. Chance de 1/6 de ser punido.
 * No 6º tiro sem acerto, o acerto é garantido.
 * Inicia com !começa rr e os tiros são com !atirar
 */

const gameManager = require("../gameManager")

module.exports = {
  // Inicia roleta russa
  start: (groupId, players, options = {}) => {
    const betMultiplierRaw = Number.parseInt(String(options?.betMultiplier || 1), 10)
    const betMultiplier = Number.isFinite(betMultiplierRaw) && betMultiplierRaw > 0
      ? betMultiplierRaw
      : 1
    const state = {
      groupId,
      players: gameManager.shuffle(players), // Embaralha ordem de turno
      currentPlayerIndex: 0,
      shotsFired: 0,
      cylinders: Math.floor(Math.random() * 6), // Câmara com bala (0-5)
      betMultiplier,
      loser: null,
      createdAt: Date.now(),
    }
    return state
  },

  // Pega jogador atual
  getCurrentPlayer: (state) => {
    return state.players[state.currentPlayerIndex]
  },

  // Processar o tiro (atirar)
  takeShotAt: (state) => {
    state.shotsFired++
    const isHit = state.cylinders === ((state.shotsFired - 1) % 6)

    if (isHit) {
      state.loser = module.exports.getCurrentPlayer(state)
      return { hit: true, guaranteed: state.shotsFired >= 6, loser: state.loser }
    }

    // Verifica se é acerto garantido (6º tiro)
    if (state.shotsFired >= 6) {
      state.loser = module.exports.getCurrentPlayer(state)
      return { hit: true, guaranteed: true, loser: state.loser }
    }

    // Avança para próximo jogador
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length
    return { hit: false, nextPlayer: module.exports.getCurrentPlayer(state) }
  },

  // Formata status
  formatStatus: (state) => {
    const currentPlayer = state.players[state.currentPlayerIndex]
    const currentTag = currentPlayer ? `@${currentPlayer.split("@")[0]}` : "desconhecido"
    return (
      `🔫 Roleta Russa!\n` +
      `Turno: ${state.currentPlayerIndex + 1}/${state.players.length}\n` +
      `Tiros: ${state.shotsFired}/6\n` +
      `Jogador atual: ${currentTag}\n\n` +
      `Use !atirar para puxar o gatilho!`
    )
  },
}
