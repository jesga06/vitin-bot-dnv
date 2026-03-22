/**
 * EMBARALHADO (Palavra Embaralhada)
 * O bot mostra uma palavra embaralhada. Quem desembaralhar primeiro vence.
 * O vencedor pode punir quem escolher.
 * Disparado por threshold de mensagens ou por comando.
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
  // Inicia embaralhado
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

  // Verifica se a resposta está correta
  checkAnswer: (state, playerId, answer) => {
    const normalized = (answer || "").trim().toUpperCase()
    if (normalized === state.word) {
      state.winner = playerId
      return { correct: true }
    }
    return { correct: false }
  },

  // Formata mensagem do jogo
  formatGame: (state) => {
    return (
      `📝 Desembaralhador de Palavras!\n\n` +
      `${state.scrambled}\n\n` +
      `Primeira resposta correta vence!\n` +
      `Envie apenas a palavra correta (sem comando).`
    )
  },

  // Formata resultados
  formatResults: (state, includePunishmentNotice = true) => {
    if (!state.winner) {
      return `Ninguém conseguiu desembaralhar: ${state.word}`
    }
    return includePunishmentNotice
      ? `🏆 @${state.winner.split("@")[0]} acertou: ${state.word}!\nAgora escolha quem será punido!`
      : `🏆 @${state.winner.split("@")[0]} acertou: ${state.word}!`
  },
}
