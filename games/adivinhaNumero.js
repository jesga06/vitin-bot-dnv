/**
 * ADIVINHA NUMERO
 * 1-4 players guess a number (1-100).
 * Closest guessers are safe, others are punished.
 * Duplicate guesses are punished 2x.
 * If exactly one player hits the exact number, they choose one target for 2x punishment.
 */

module.exports = {
  // Start adivinha numero game
  start: (groupId, players) => {
    const secretNumber = Math.floor(Math.random() * 100) + 1 // 1-100
    const state = {
      groupId,
      players,
      secretNumber,
      guesses: {},
      createdAt: Date.now(),
      phaseStartedAt: Date.now(),
    }
    return state
  },

  // Record a guess
  recordGuess: (state, playerId, guess) => {
    const num = parseInt(guess, 10)
    if (isNaN(num) || num < 1 || num > 100) {
      return { valid: false, error: "Adivinhe um número de 1-100" }
    }

    if (state.guesses[playerId]) {
      return { valid: false, error: "Você já adivinhou!" }
    }

    state.guesses[playerId] = num
    return { valid: true }
  },

  // Get results and punishments
  getResults: (state) => {
    const secret = state.secretNumber
    const guesses = state.guesses
    const playerIds = Object.keys(guesses)

    if (playerIds.length === 0) {
      return {
        type: "no_guesses",
        closestPlayers: [],
        punishments: [],
        chooser: null,
        choiceSeverity: 1,
      }
    }

    // Find closest distance and exact guessers.
    let closestDist = Infinity
    const exactPlayers = []

    playerIds.forEach((pid) => {
      const distance = Math.abs(guesses[pid] - secret)
      if (distance === 0) {
        exactPlayers.push(pid)
      }
      if (distance < closestDist) {
        closestDist = distance
      }
    })

    const closestPlayers = playerIds.filter((pid) => Math.abs(guesses[pid] - secret) === closestDist)

    const punishByPlayer = new Map()
    const setPunishment = (playerId, severity) => {
      const current = punishByPlayer.get(playerId) || 0
      punishByPlayer.set(playerId, Math.max(current, severity))
    }

    // Closest players are safe by default; everyone else gets normal punishment.
    playerIds
      .filter((pid) => !closestPlayers.includes(pid))
      .forEach((pid) => setPunishment(pid, 1))

    // Duplicate guesses are punished 2x.
    const guessBuckets = {}
    playerIds.forEach((pid) => {
      const value = guesses[pid]
      if (!guessBuckets[value]) guessBuckets[value] = []
      guessBuckets[value].push(pid)
    })
    Object.values(guessBuckets).forEach((bucket) => {
      if (bucket.length > 1) {
        bucket.forEach((pid) => setPunishment(pid, 2))
      }
    })

    const punishments = Array.from(punishByPlayer.entries()).map(([playerId, severity]) => ({ playerId, severity }))

    const chooser = exactPlayers.length === 1 ? exactPlayers[0] : null

    return {
      type: chooser ? "exact_match" : "resolved",
      winner: chooser,
      closestPlayers,
      punishments,
      chooser,
      choiceSeverity: chooser ? 2 : 1,
    }
  },

  // Format result message
  formatResults: (state, results, includePunishmentWarnings = true) => {
    const secret = state.secretNumber
    let msg = `🎰 O número era: ${secret}\n\n`

    Object.entries(state.guesses).forEach(([pid, guess]) => {
      msg += `${pid.substring(0, 5)}: ${guess}\n`
    })

    msg += `\n`

    if (results.type === "no_guesses") {
      msg += `Ninguém adivinhou!`
    } else {
      msg += `✅ Mais perto(s): ${results.closestPlayers.map((p) => `${p.substring(0, 5)}...`).join(", ")}\n`

      if (includePunishmentWarnings) {
        if (!results.punishments || results.punishments.length === 0) {
          msg += `Ninguém será alvo de punição automática nesta rodada.`
        } else {
          msg += `\nPunidos automáticos:\n`
          results.punishments.forEach((entry) => {
            msg += `- ${entry.playerId.substring(0, 5)}... (${entry.severity}x)\n`
          })
        }
      }

      if (results.chooser && includePunishmentWarnings) {
        msg += `\n🎯 ${results.chooser.substring(0, 5)}... acertou exatamente e pode escolher 1 alvo para punição 2x.`
      }
    }

    return msg
  },
}
