/**
 * DUELO DE DADOS (Dice Duel)
 * 2 jogadores rolam um d20 (1-20).
 * O maior valor vence.
 */

module.exports = {
  // Inicia duelo de dados
  start: (groupId, players) => {
    if (players.length !== 2) {
      return null // Deve ser exatamente 2
    }
    const state = {
      groupId,
      players,
      rolls: {},
      createdAt: Date.now(),
    }
    return state
  },

  // Registra rolagem do dado
  recordRoll: (state, playerId) => {
    if (state.rolls[playerId]) {
      return { valid: false, error: "Você já rolou!" }
    }

    const roll = Math.floor(Math.random() * 20) + 1 // 1-20
    state.rolls[playerId] = roll
    return { valid: true, roll }
  },

  // pega resultados
  getResults: (state) => {
    const [p1, p2] = state.players
    const roll1 = state.rolls[p1]
    const roll2 = state.rolls[p2]

    if (roll1 === undefined || roll2 === undefined) {
      return null // Incompleto
    }

    let winner, loser
    let severity = 1

    if (roll1 === 1 && roll2 === 1) {
      // Ambos tiraram 1: ambos recebem punição 2x
      return {
        type: "both_critical",
        punish: state.players,
        severity: 2,
        roll1,
        roll2,
      }
    }

    if (roll1 === roll2) {
      // Mesmo valor: ambos os jogadores são punidos.
      return {
        type: "tie",
        punish: state.players,
        severity: 1,
        roll1,
        roll2,
      }
    }

    winner = roll1 > roll2 ? p1 : p2
    loser = winner === p1 ? p2 : p1

    // Regras:
    // - Se um jogador tira 1 ou 20, o perdedor recebe punição 2x.
    const loserRoll = state.rolls[loser]
    const winnerRoll = state.rolls[winner]
    if (loserRoll === 1 || winnerRoll === 20) {
      severity = 2
    }

    return {
      type: "normal",
      winner,
      loser,
      severity,
      roll1,
      roll2,
    }
  },

  // Formata resultados
  formatResults: (state, results, includePunishmentWarnings = true) => {
    const [p1, p2] = state.players
    let msg = `🎲 Duelo de Dados!\n\n`

    msg += `@${p1.split("@")[0]}: ${state.rolls[p1]}\n`
    msg += `@${p2.split("@")[0]}: ${state.rolls[p2]}\n\n`

    if (results.type === "both_critical") {
      msg += `💥 AMBOS ROLARAM 1!\n`
      msg += includePunishmentWarnings
        ? `Os dois serão punidos 2x!`
        : `Derrota para os dois jogadores!`
    } else if (results.type === "tie") {
      msg += `🤝 EMPATE!\n`
      msg += includePunishmentWarnings
        ? `Os dois serão punidos.`
        : `Rodada empatada.`
    } else {
      msg += `🏆 @${results.winner.split("@")[0]} ganhou!\n`
      if (!includePunishmentWarnings) {
        msg += `@${results.loser.split("@")[0]} perdeu a rodada`
      } else if (results.severity === 2) {
        msg += `⚠️ @${results.loser.split("@")[0]} recebe punição 2x`
      } else {
        msg += `@${results.loser.split("@")[0]} foi punido`
      }
    }

    return msg
  },
}
