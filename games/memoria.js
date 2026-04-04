const { formatMentionTag } = require("../services/mentionService")
/**
 * JOGO DA MEMORIA (Jogo da Memória)
 * O bot mostra uma sequência de 12 caracteres por 5 segundos e depois a apaga.
 * O primeiro jogador a reproduzir corretamente vence e pode punir alguém.
 * Ativado por threshold de mensagens.
 */

function generateSequence(length = 12) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let seq = ""
  for (let i = 0; i < length; i++) {
    seq += chars[Math.floor(Math.random() * chars.length)]
  }
  return seq
}

module.exports = {
  // Inicia jogo da memória
  start: (groupId, triggeredBy = null) => {
    const sequence = generateSequence(12)
    const state = {
      groupId,
      sequence,
      shownAt: Date.now(),
      showDurationMs: 5000,
      winner: null,
      attempts: {}, // playerId -> [tentativas]
      createdAt: Date.now(),
      triggeredBy,
    }
    return state
  },

  // Verifica se ainda está visível
  isVisible: (state) => {
    return Date.now() - state.shownAt < state.showDurationMs
  },

  // Registra tentativa
  recordAttempt: (state, playerId, answer) => {
    if (state.winner) {
      return { valid: false, error: "Jogo já terminou!" }
    }

    if (!state.attempts[playerId]) {
      state.attempts[playerId] = []
    }

    const normalized = (answer || "").trim().toUpperCase()
    state.attempts[playerId].push(normalized)

    if (normalized === state.sequence) {
      state.winner = playerId
      return { correct: true, winner: playerId }
    }

    return { correct: false }
  },

  // Formata mensagem inicial (mostra sequência)
  formatSequence: (state) => {
    return (
      `🧠 JOGO DA MEMÓRIA!\n\n` +
      `Memorize:\n\n` +
      `${state.sequence}\n\n` +
      `Desaparecerá em 5 segundos...`
    )
  },

  // Formata estado do jogo (após esconder sequência)
  formatHidden: () => {
    return (
      `🧠 A sequência foi escondida!\n\n` +
      `Envie apenas a sequência (sem comando e sem texto extra).\n` +
      `(12 caracteres, A-Z e 0-9)`
    )
  },

  // Formata resultados
  formatResults: (state, includePunishmentNotice = true) => {
    if (!state.winner) {
      return `Ninguém se lembrou! Sequência: ${state.sequence}`
    }

    return includePunishmentNotice
      ? (`🏆 ${formatMentionTag(state.winner)} se lembrou corretamente!\n` +
        `Agora escolha quem punir!`)
      : `🏆 ${formatMentionTag(state.winner)} se lembrou corretamente!`
  },
}
