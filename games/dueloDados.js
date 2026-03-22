/**
 * DUELO DE DADOS (Dice Duel)
 * 2 players each roll a d20 (1-20).
 * Higher roll wins. Rolling a 1 guarantees double punishment regardless of outcome.
 */

module.exports = {
  // Start dice duel
  start: (groupId, players) => {
    if (players.length !== 2) {
      return null // Must be exactly 2
    }
    const state = {
      groupId,
      players,
      rolls: {},
      createdAt: Date.now(),
    }
    return state
  },

  // Record die roll
  recordRoll: (state, playerId) => {
    if (state.rolls[playerId]) {
      return { valid: false, error: "Você já rolou!" }
    }

    const roll = Math.floor(Math.random() * 20) + 1 // 1-20
    state.rolls[playerId] = roll
    return { valid: true, roll }
  },

  // Get results
  getResults: (state) => {
    const [p1, p2] = state.players
    const roll1 = state.rolls[p1]
    const roll2 = state.rolls[p2]

    if (roll1 === undefined || roll2 === undefined) {
      return null // Incomplete
    }

    let winner, loser
    let severity = 1

    if (roll1 === 1 && roll2 === 1) {
      // Both rolled 1: both punished 2x
      return {
        type: "both_critical",
        punish: state.players,
        severity: 2,
        roll1,
        roll2,
      }
    }

    if (roll1 === roll2) {
      // Same roll: both players are punished.
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

    // Rules:
    // - If a player rolls 1, that loser gets 2x punishment.
    // - If a player rolls 20, the loser gets 2x punishment.
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

  // Format results
  formatResults: (state, results, includePunishmentWarnings = true) => {
    const [p1, p2] = state.players
    let msg = `🎲 Duelo de Dados!\n\n`

    msg += `${p1.substring(0, 5)}: ${state.rolls[p1]}\n`
    msg += `${p2.substring(0, 5)}: ${state.rolls[p2]}\n\n`

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
      msg += `🏆 ${results.winner.substring(0, 5)}... ganhou!\n`
      if (!includePunishmentWarnings) {
        msg += `${results.loser.substring(0, 5)}... perdeu a rodada`
      } else if (results.severity === 2) {
        msg += `⚠️ ${results.loser.substring(0, 5)}... recebe punição 2x`
      } else {
        msg += `${results.loser.substring(0, 5)}... foi punido`
      }
    }

    return msg
  },
}
