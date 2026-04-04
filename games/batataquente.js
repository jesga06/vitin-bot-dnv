/*
 * BATATA QUENTE
 * 2 ou mais jogadores passam a batata quente por 15s
 * O último a segurar quando o tempo expirar é punido.
 * Passe a batata com !passa + @menção
 */

const { formatMentionTag } = require("../services/mentionService")
const gameManager = require("../gameManager")

module.exports = {
  // Inicia batata quente
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

  // Processa passe
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

  // Pega o perdedor (quem está com a batata no final)
  getLoser: (state) => {
    return state.currentHolder
  },

  // Formata mensagem do jogo
  formatStatus: (state) => {
    const elapsed = Date.now() - state.startedAt
    const remaining = Math.max(0, state.durationMs - elapsed)
    const secs = Math.ceil(remaining / 1000)

    return (
      `🥔 Batata Quente! ⏱️ ${secs}s restantes\n` +
      `Holder: ${formatMentionTag(state.currentHolder)}\n` +
      `Passes: ${state.passes.length}\n\n` +
      `Use !passa @menção para passar!`
    )
  },
}
