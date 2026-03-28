/**
 * COMANDO (antigo Ultimo a Obedecer)
 * Bot gives random instruction (e.g., silencio, emoji, mandar foto, mandar video).
 * Last person to comply gets punished. Or if instruction is silence, first to break it gets punished.
 */

const gameManager = require("../gameManager")

const instructions = [
	{ cmd: "emoji", text: "Mande um emoji! (quem for o último)" },
	{ cmd: "photo", text: "Mande uma foto! (quem for o último)" },
	{ cmd: "video", text: "Mande um vídeo! (quem for o último)" },
	{
		cmd: "silence",
		text: "Silêncio por 20 segundos! (primeiro a quebrar é punido)",
		durationMs: 20000,
	},
]

function hasEmoji(text = "") {
	return /\p{Extended_Pictographic}/u.test(text)
}

function hasPhotoMessage(rawMsg = null) {
	return Boolean(rawMsg?.message?.imageMessage)
}

function hasVideoMessage(rawMsg = null) {
	return Boolean(rawMsg?.message?.videoMessage)
}

module.exports = {
	start: (groupId, triggeredBy = null, options = {}) => {
		const players = Array.isArray(options.players) ? options.players : []
		const restrictToPlayers = Boolean(options.restrictToPlayers)
		const instruction = gameManager.pickRandom(instructions)
		const state = {
			groupId,
			instruction,
			compliers: [],
			participants: [],
			participantLastMessageAt: {},
			createdAt: Date.now(),
			triggeredBy,
			silenceBreaker: null,
			players,
			restrictToPlayers,
		}
		return state
	},

	isPlayerAllowed: (state, playerId) => {
		if (!state.restrictToPlayers) return true
		return Array.isArray(state.players) && state.players.includes(playerId)
	},

	recordParticipant: (state, playerId) => {
		if (!module.exports.isPlayerAllowed(state, playerId)) {
			return
		}
		if (!Array.isArray(state.participants)) state.participants = []
		if (!state.participantLastMessageAt || typeof state.participantLastMessageAt !== "object") {
			state.participantLastMessageAt = {}
		}
		if (!state.participants.includes(playerId)) {
			state.participants.push(playerId)
		}
		state.participantLastMessageAt[playerId] = Date.now()
	},

	recordCompliance: (state, playerId) => {
		if (!module.exports.isPlayerAllowed(state, playerId)) {
			return { valid: false, error: "Você não está na lista de participantes." }
		}
		if (state.compliers.some((c) => c.playerId === playerId)) {
			return { valid: false, error: "Você já obedeceu!" }
		}

		state.compliers.push({
			playerId,
			at: Date.now(),
		})

		return { valid: true }
	},

	recordSilenceBreaker: (state, playerId) => {
		if (!module.exports.isPlayerAllowed(state, playerId)) {
			return
		}
		if (!state.silenceBreaker) {
			state.silenceBreaker = playerId
		}
	},

	isValidCompliance: (state, payload = {}) => {
		const cmd = state?.instruction?.cmd
		if (!cmd || cmd === "silence") return false

		const text = payload.text || ""
		const rawMsg = payload.rawMsg || null

		if (cmd === "emoji") return hasEmoji(text)
		if (cmd === "photo") return hasPhotoMessage(rawMsg)
		if (cmd === "video") return hasVideoMessage(rawMsg)

		return false
	},

	getLoser: (state) => {
		if (state.instruction.cmd === "silence") {
			return state.silenceBreaker
		}

		if (state.compliers.length === 0) {
			return null
		}

		return state.compliers[state.compliers.length - 1].playerId
	},

	formatInstruction: (state, includePunishmentNotice = true) => {
		if (includePunishmentNotice) {
			return `🎯 Instrução:\n${state.instruction.text}`
		}

		const cmd = state?.instruction?.cmd
		if (cmd === "silence") {
			return "🎯 Instrução:\nSilêncio por 20 segundos!"
		}
		if (cmd === "emoji") {
			return "🎯 Instrução:\nMande um emoji!"
		}
		if (cmd === "photo") {
			return "🎯 Instrução:\nMande uma foto!"
		}
		if (cmd === "video") {
			return "🎯 Instrução:\nMande um vídeo!"
		}

		return `🎯 Instrução:\n${state.instruction.text}`
	},

	formatResults: (state, includePunishmentNotice = true) => {
		const loser = module.exports.getLoser(state)

		if (state.instruction.cmd === "silence") {
			if (!loser) {
				return "Todos respeitaram o silêncio!"
			}
			return includePunishmentNotice
				? `💬 @${loser.split("@")[0]} quebrou o silêncio e será punido!`
				: `💬 @${loser.split("@")[0]} quebrou o silêncio!`
		}

		if (!loser) {
			return "Ninguém obedeceu!"
		}

		return includePunishmentNotice
			? `🐢 @${loser.split("@")[0]} foi o último no Comando e será punido!`
			: `🐢 @${loser.split("@")[0]} foi o último no Comando!`
	},
}
