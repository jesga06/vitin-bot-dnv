async function handleModerationCommands(ctx) {
  const {
    sock,
    msg,
    from,
    sender,
    text,
    cmd,
    cmdName,
    prefix,
    isGroup,
    senderIsAdmin,
    mentioned,
    jidNormalizedUser,
    storage,
    clearPunishment,
    clearPendingPunishment,
    getPunishmentMenuText,
    getPunishmentChoiceFromText,
    applyPunishment,
  } = ctx

  if (!isGroup) return false

  const botJid = jidNormalizedUser(sock.user?.id || "")

  if (cmdName === prefix + "mute") {
    const alvo = mentioned[0]
    if (!alvo) return sock.sendMessage(from, { text: "Marque alguém para mutar!" })
    if (jidNormalizedUser(alvo) === botJid) return sock.sendMessage(from, { text: "Não posso me mutar!" })
    if (!senderIsAdmin) return sock.sendMessage(from, { text: "Apenas admins podem mutar!" })
    const mutedUsers = storage.getMutedUsers()
    if (!mutedUsers[from]) mutedUsers[from] = {}
    mutedUsers[from][alvo] = true
    storage.setMutedUsers(mutedUsers)
    await sock.sendMessage(from, { text: `@${alvo.split("@")[0]} foi mutado! Finalmente vai calar a boca.`, mentions: [alvo] })
    return true
  }

  if (cmdName === prefix + "unmute") {
    const alvo = mentioned[0]
    if (!alvo) return sock.sendMessage(from, { text: "Marque alguém para desmutar!" })
    if (jidNormalizedUser(alvo) === botJid) return sock.sendMessage(from, { text: "Não posso me desmutar!" })
    if (!senderIsAdmin) return sock.sendMessage(from, { text: "Apenas admins podem desmutar!" })
    const mutedUsers = storage.getMutedUsers()
    if (mutedUsers[from]) {
      delete mutedUsers[from][alvo]
      if (Object.keys(mutedUsers[from]).length === 0) delete mutedUsers[from]
    }
    storage.setMutedUsers(mutedUsers)
    await sock.sendMessage(from, { text: `@${alvo.split("@")[0]} foi desmutado! Infelizmente pode falar de novo.`, mentions: [alvo] })
    return true
  }

  if (cmdName === prefix + "ban") {
    const alvo = mentioned[0]
    if (!alvo) return sock.sendMessage(from, { text: "Marque alguém para banir!" })
    if (jidNormalizedUser(alvo) === botJid) return sock.sendMessage(from, { text: "Não posso me banir!" })
    if (!senderIsAdmin) return sock.sendMessage(from, { text: "Apenas admins podem banir!" })
    await sock.groupParticipantsUpdate(from, [alvo], "remove")
    await sock.sendMessage(from, { text: `@${alvo.split("@")[0]} foi banido do grupo.`, mentions: [alvo] })
    return true
  }

  if (cmdName === prefix + "adminadd") {
    if (!senderIsAdmin) return sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
    const alvo = mentioned[0]
    if (!alvo) return sock.sendMessage(from, { text: "Marque alguém para promover a admin do grupo." })
    if (jidNormalizedUser(alvo) === botJid) return sock.sendMessage(from, { text: "O bot já possui privilégios administrativos." })

    await sock.groupParticipantsUpdate(from, [alvo], "promote")

    await sock.sendMessage(from, {
      text: `@${alvo.split("@")[0]} agora é admin do grupo.`,
      mentions: [alvo],
    })
    return true
  }

  if (cmdName === prefix + "adminrm") {
    if (!senderIsAdmin) return sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
    const alvo = mentioned[0]
    if (!alvo) return sock.sendMessage(from, { text: "Marque alguém para remover de admin do grupo." })

    await sock.groupParticipantsUpdate(from, [alvo], "demote")

    await sock.sendMessage(from, {
      text: `@${alvo.split("@")[0]} não é mais admin do grupo.`,
      mentions: [alvo],
    })
    return true
  }

  if (cmd === prefix + "nuke") {
    if (!senderIsAdmin) return sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
    try {
      await sock.sendMessage(from, { delete: msg.key })
    } catch (e) {
      console.error("Erro ao apagar mensagem do !nuke", e)
    }
    clearPunishment(from, sender)
    const mutedUsers = storage.getMutedUsers()
    if (mutedUsers[from]?.[sender]) {
      delete mutedUsers[from][sender]
      if (Object.keys(mutedUsers[from]).length === 0) delete mutedUsers[from]
      storage.setMutedUsers(mutedUsers)
    }
    const coinPunishmentPending = storage.getCoinPunishmentPending()
    if (coinPunishmentPending[from]?.[sender]) clearPendingPunishment(from, sender)
    await sock.sendMessage(from, {
      text: `@${sender.split("@")[0]} teve todas as punições removidas instantaneamente.`,
      mentions: [sender],
    })
    return true
  }

  if (cmd === prefix + "punições" || cmd === prefix + "punicoes") {
    if (!senderIsAdmin) return sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
    const alvo = mentioned[0]
    if (!alvo) return sock.sendMessage(from, { text: "Marque alguém para listar as punições." })

    const lines = []
    const mutedUsers = storage.getMutedUsers()
    if (mutedUsers[from]?.[alvo]) lines.push("- Mute admin manual (indefinido)")

    const activePunishments = storage.getActivePunishments()
    const active = activePunishments[from]?.[alvo]
    if (active) {
      if (active.type === "max5chars") lines.push("- Máx. 5 caracteres")
      if (active.type === "rate20s") lines.push("- 1 mensagem/20s")
      if (active.type === "lettersBlock") lines.push(`- Bloqueio por letras (${(active.letters || []).join("/")})`)
        if (active.type === "emojiOnly") lines.push("- Somente emojis e figurinhas")
      if (active.type === "mute5m") lines.push("- Mute total 5 minutos")
    }

    const coinPunishmentPending = storage.getCoinPunishmentPending()
    if (coinPunishmentPending[from]) {
      const penders = Object.keys(coinPunishmentPending[from]).filter((jid) => {
        const pending = coinPunishmentPending[from][jid]
        return jid === alvo || pending.target === alvo
      })
      if (penders.length > 0) lines.push(`- Escolha pendente ligada ao usuário (${penders.length})`)
    }

    await sock.sendMessage(from, {
      text: lines.length > 0
        ? `Punições de @${alvo.split("@")[0]}:\n${lines.join("\n")}`
        : `@${alvo.split("@")[0]} não possui punições ativas.`,
      mentions: [alvo],
    })
    return true
  }

  if (cmdName === prefix + "puniçõesclr" || cmdName === prefix + "punicoesclr") {
    if (!senderIsAdmin) return sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
    const alvo = mentioned[0]
    if (!alvo) return sock.sendMessage(from, { text: "Marque alguém para limpar as punições." })

    clearPunishment(from, alvo)
    const mutedUsers = storage.getMutedUsers()
    if (mutedUsers[from]?.[alvo]) {
      delete mutedUsers[from][alvo]
      if (Object.keys(mutedUsers[from]).length === 0) delete mutedUsers[from]
      storage.setMutedUsers(mutedUsers)
    }

    const coinPunishmentPending = storage.getCoinPunishmentPending()
    if (coinPunishmentPending[from]) {
      const keys = Object.keys(coinPunishmentPending[from])
      for (const key of keys) {
        const pending = coinPunishmentPending[from][key]
        if (key === alvo || pending.target === alvo) {
          clearPendingPunishment(from, key)
        }
      }
    }

    await sock.sendMessage(from, {
      text: `Todas as punições de @${alvo.split("@")[0]} foram removidas.`,
      mentions: [alvo],
    })
    return true
  }

  if (cmdName === prefix + "puniçõesadd" || cmdName === prefix + "punicoesadd") {
    if (!senderIsAdmin) return sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
    const alvo = mentioned[0]
    if (!alvo) return sock.sendMessage(from, { text: "Marque alguém para aplicar punição." })

    const parts = text.trim().split(/\s+/)
    const punishmentChoice = getPunishmentChoiceFromText(parts[2] || "")
    const severityToken = parts[3]
    const parsedSeverity = Number.parseInt(String(severityToken || "1"), 10)
    const severityMultiplier = Number.isFinite(parsedSeverity) && parsedSeverity > 0 ? parsedSeverity : 1
    if (!punishmentChoice) {
      return sock.sendMessage(from, {
        text: "Use: !puniçõesadd @user <1-5> [multiplicador]\n" + getPunishmentMenuText(),
        mentions: [alvo],
      })
    }

    await applyPunishment(sock, from, alvo, punishmentChoice, {
      origin: "admin",
      severityMultiplier,
    })
    return true
  }

  return false
}

module.exports = {
  handleModerationCommands,
}
