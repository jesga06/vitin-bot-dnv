/**
 * EMBARALHADO (Palavra Embaralhada)
 * Bot shows scrambled word. First to unscramble it wins.
 * Winner can punish anyone they choose.
 * Triggered on message threshold or via !scramble command.
 */

const gameManager = require("../gameManager")

const words = [
  "CACHORRO",
  "GATO",
  "PROGRAMADOR",
  "COMPUTADOR",
  "TELEFONE",
  "INTERNET",
  "MENSAGEM",
  "DIVERSÃO",
  "AMIGO",
  "FAMÍLIA",
  "TRABALHO",
  "ESCOLA",
  "CARRO",
  "MOTO",
  "BICICLETA",
  "LIVRO",
  "FILME",
  "MÚSICA",
  "DANÇA",
  "ESPORTE",
]

function shuffleWord(word) {
  return gameManager.shuffle(word.split("")).join("")
}

module.exports = {
  // Start embaralhado
  start: (groupId, triggeredBy = null) => {
    const word = gameManager.pickRandom(words)
    const state = {
      groupId,
      word,
      scrambled: shuffleWord(word),
      winner: null,
      createdAt: Date.now(),
      triggeredBy,
    }
    return state
  },

  // Check if answer is correct
  checkAnswer: (state, playerId, answer) => {
    const normalized = (answer || "").trim().toUpperCase()
    if (normalized === state.word) {
      state.winner = playerId
      return { correct: true }
    }
    return { correct: false }
  },

  // Format game message
  formatGame: (state) => {
    return (
      `📝 Desembaralhador de Palavras!\n\n` +
      `${state.scrambled}\n\n` +
      `Primeira resposta correta vence!\n` +
      `Envie apenas a palavra correta (sem comando).`
    )
  },

  // Format results
  formatResults: (state, includePunishmentNotice = true) => {
    if (!state.winner) {
      return `Ninguém conseguiu desembaralhar: ${state.word}`
    }
    return includePunishmentNotice
      ? `🏆 ${state.winner.substring(0, 5)}... acertou: ${state.word}!\nAgora escolha quem será punido!`
      : `🏆 ${state.winner.substring(0, 5)}... acertou: ${state.word}!`
  },
}
