/**
 * ROLETA RUSSA (Russian Roulette)
 * 1-4 jogadores se revezam atirando. Chance de 1/6 de ser punido.
 * No 6º tiro sem acerto, o acerto é garantido.
 * Inicia com !começar rr (ou aliases !comecar/!start) e os tiros são com !atirar
 */

const gameManager = require("../gameManager")

module.exports = {
  // Inicia roleta russa
  start: (groupId, players, options = {}) => {
    const explicitBetValue = Number.parseInt(String(options?.betValue), 10)
    const legacyBetMultiplier = Number.parseInt(String(options?.betMultiplier), 10)
    const betValue = Number.isFinite(explicitBetValue)
      ? Math.max(0, Math.min(5, explicitBetValue))
      : (Number.isFinite(legacyBetMultiplier)
        ? Math.max(0, Math.min(5, legacyBetMultiplier - 1))
        : 0)
    const betMultiplier = betValue + 1
    const state = {
      groupId,
      players: gameManager.shuffle(players), // Embaralha ordem de turno
      currentPlayerIndex: 0,
      shotsFired: 0,
      playerShots: {},
      cylinders: Math.floor(Math.random() * 6), // Câmara com bala (0-5)
      betValue,
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
    const currentPlayer = module.exports.getCurrentPlayer(state)
    state.shotsFired++
    state.playerShots[currentPlayer] = (state.playerShots[currentPlayer] || 0) + 1
    const currentPlayerShotCount = state.playerShots[currentPlayer]
    const isHit = state.cylinders === ((state.shotsFired - 1) % 6)
    const surpassedBet = currentPlayerShotCount > (state.betValue || 0)

    // Em jogo solo, ao ultrapassar a aposta a vitória é garantida mesmo se houver acerto.
    if (state.players.length === 1 && surpassedBet) {
      return {
        hit: isHit,
        autoWin: true,
        winner: currentPlayer,
        winners: [currentPlayer],
        currentPlayerShotCount,
        surpassedBet,
      }
    }

    if (isHit) {
      if (state.players.length > 1 && surpassedBet) {
        return {
          hit: true,
          allWin: true,
          guaranteed: state.shotsFired >= 6,
          winners: [...state.players],
          currentPlayerShotCount,
          surpassedBet,
        }
      }

      state.loser = currentPlayer
      return {
        hit: true,
        guaranteed: state.shotsFired >= 6,
        loser: state.loser,
        currentPlayerShotCount,
        surpassedBet,
      }
    }

    // Verifica se é acerto garantido (6º tiro)
    if (state.shotsFired >= 6) {
      if (state.players.length > 1 && surpassedBet) {
        return {
          hit: true,
          allWin: true,
          guaranteed: true,
          winners: [...state.players],
          currentPlayerShotCount,
          surpassedBet,
        }
      }

      state.loser = currentPlayer
      return {
        hit: true,
        guaranteed: true,
        loser: state.loser,
        currentPlayerShotCount,
        surpassedBet,
      }
    }

    // Avança para próximo jogador
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length
    return {
      hit: false,
      nextPlayer: module.exports.getCurrentPlayer(state),
      currentPlayerShotCount,
      surpassedBet,
    }
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
