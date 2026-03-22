/**
 * JOGO DA MEMORIA (Jogo da Memória)
 * Bot shows a 12-character sequence for 5 seconds, then deletes it.
 * First player to reproduce it correctly wins and punishes someone.
 * Triggered on message threshold.
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
  // Start memória game
  start: (groupId, triggeredBy = null) => {
    const sequence = generateSequence(12)
    const state = {
      groupId,
      sequence,
      shownAt: Date.now(),
      showDurationMs: 5000,
      winner: null,
      attempts: {}, // playerId -> [attempts]
      createdAt: Date.now(),
      triggeredBy,
    }
    return state
  },

  // Check if still showing
  isVisible: (state) => {
    return Date.now() - state.shownAt < state.showDurationMs
  },

  // Record attempt
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

  // Format initial message (shows sequence)
  formatSequence: (state) => {
    return (
      `🧠 JOGO DA MEMÓRIA!\n\n` +
      `Memorize:\n\n` +
      `${state.sequence}\n\n` +
      `Desaparecerá em 5 segundos...`
    )
  },

  // Format game state (after sequence hidden)
  formatHidden: (state) => {
    return (
      `🧠 A sequência foi escondida!\n\n` +
      `Envie apenas a sequência (sem comando e sem texto extra).\n` +
      `(12 caracteres, A-Z e 0-9)`
    )
  },

  // Format results
  formatResults: (state, includePunishmentNotice = true) => {
    if (!state.winner) {
      return `Ninguém se lembrou! Sequência: ${state.sequence}`
    }

    return includePunishmentNotice
      ? (`🏆 ${state.winner.substring(0, 5)}... se lembrou corretamente!\n` +
        `Agora escolha quem punir!`)
      : `🏆 ${state.winner.substring(0, 5)}... se lembrou corretamente!`
  },
}
