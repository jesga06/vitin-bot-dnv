const telemetry = require("../telemetryService")

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
    overrideJid,
    overrideIdentifiers,
  } = ctx

  if (!isGroup) return false

  function trackModeration(command, status, meta = {}) {
    telemetry.incrementCounter("router.moderation.command", 1, {
      command,
      status,
    })
    telemetry.appendEvent("router.moderation.command", {
      command,
      status,
      groupId: from,
      sender,
      ...meta,
    })
  }

  const botJid = jidNormalizedUser(sock.user?.id || "")
  const overrideIdentitySet = new Set(
    [overrideJid, ...(overrideIdentifiers || [])]
      .map((value) => String(value || "").trim().toLowerCase().split(":")[0])
      .filter(Boolean)
  )
  const isOverrideJid = (jid) => {
    const normalized = String(jidNormalizedUser(jid || "") || "").trim().toLowerCase().split(":")[0]
    if (!normalized) return false
    if (overrideIdentitySet.has(normalized)) return true
    const userPart = normalized.split("@")[0]
    return Boolean(userPart && overrideIdentitySet.has(userPart))
  }

  // =========================
  // COMANDOS DE MODERAÇÃO
  // =========================
  if (cmdName === prefix + "mute") {
    const alvo = mentioned[0]
    if (!alvo) {
      trackModeration("mute", "rejected", { reason: "missing-target" })
      await sock.sendMessage(from, { text: "Marque alguém para mutar!" })
      return true
    }
    if (isOverrideJid(alvo)) {
      trackModeration("mute", "rejected", { reason: "target-override" })
      await sock.sendMessage(from, { text: "Esse usuário não pode ser mutado." })
      return true
    }
    if (jidNormalizedUser(alvo) === botJid) {
      trackModeration("mute", "rejected", { reason: "target-bot" })
      await sock.sendMessage(from, { text: "Não posso me mutar!" })
      return true
    }
    if (!senderIsAdmin) {
      trackModeration("mute", "rejected", { reason: "not-admin" })
      await sock.sendMessage(from, { text: "Apenas admins podem mutar!" })
      return true
    }
    const mutedUsers = storage.getMutedUsers()
    if (!mutedUsers[from]) mutedUsers[from] = {}
    mutedUsers[from][alvo] = true
    storage.setMutedUsers(mutedUsers)
    trackModeration("mute", "success", { target: alvo })
    await sock.sendMessage(from, { text: `@${alvo.split("@")[0]} foi mutado! Finalmente vai calar a boca.`, mentions: [alvo] })
    return true
  }

  if (cmdName === prefix + "unmute") {
    const alvo = mentioned[0]
    if (!alvo) {
      trackModeration("unmute", "rejected", { reason: "missing-target" })
      await sock.sendMessage(from, { text: "Marque alguém para desmutar!" })
      return true
    }
    if (jidNormalizedUser(alvo) === botJid) {
      trackModeration("unmute", "rejected", { reason: "target-bot" })
      await sock.sendMessage(from, { text: "Não posso me desmutar!" })
      return true
    }
    if (!senderIsAdmin) {
      trackModeration("unmute", "rejected", { reason: "not-admin" })
      await sock.sendMessage(from, { text: "Apenas admins podem desmutar!" })
      return true
    }
    const mutedUsers = storage.getMutedUsers()
    if (mutedUsers[from]) {
      delete mutedUsers[from][alvo]
      if (Object.keys(mutedUsers[from]).length === 0) delete mutedUsers[from]
    }
    storage.setMutedUsers(mutedUsers)
    trackModeration("unmute", "success", { target: alvo })
    await sock.sendMessage(from, { text: `@${alvo.split("@")[0]} foi desmutado! Infelizmente pode falar de novo.`, mentions: [alvo] })
    return true
  }

  if (cmdName === prefix + "ban") {
    const alvo = mentioned[0]
    if (!alvo) {
      trackModeration("ban", "rejected", { reason: "missing-target" })
      await sock.sendMessage(from, { text: "Marque alguém para banir!" })
      return true
    }
    if (isOverrideJid(alvo)) {
      trackModeration("ban", "rejected", { reason: "target-override" })
      await sock.sendMessage(from, { text: "Esse usuário não pode ser banido." })
      return true
    }
    if (jidNormalizedUser(alvo) === botJid) {
      trackModeration("ban", "rejected", { reason: "target-bot" })
      await sock.sendMessage(from, { text: "Não posso me banir!" })
      return true
    }
    if (!senderIsAdmin) {
      trackModeration("ban", "rejected", { reason: "not-admin" })
      await sock.sendMessage(from, { text: "Apenas admins podem banir!" })
      return true
    }
    await sock.groupParticipantsUpdate(from, [alvo], "remove")
    trackModeration("ban", "success", { target: alvo })
    await sock.sendMessage(from, { text: `@${alvo.split("@")[0]} foi banido do grupo.`, mentions: [alvo] })
    return true
  }

  if (cmdName === prefix + "adminadd") {
    if (!senderIsAdmin) {
      trackModeration("adminadd", "rejected", { reason: "not-admin" })
      await sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
      return true
    }
    const alvo = mentioned[0]
    if (!alvo) {
      trackModeration("adminadd", "rejected", { reason: "missing-target" })
      await sock.sendMessage(from, { text: "Marque alguém para promover a admin do grupo." })
      return true
    }
    if (jidNormalizedUser(alvo) === botJid) {
      trackModeration("adminadd", "rejected", { reason: "target-bot" })
      await sock.sendMessage(from, { text: "O bot já possui privilégios administrativos." })
      return true
    }

    await sock.groupParticipantsUpdate(from, [alvo], "promote")
    trackModeration("adminadd", "success", { target: alvo })

    await sock.sendMessage(from, {
      text: `@${alvo.split("@")[0]} agora é admin do grupo.`,
      mentions: [alvo],
    })
    return true
  }

  if (cmdName === prefix + "adminrm") {
    if (!senderIsAdmin) {
      trackModeration("adminrm", "rejected", { reason: "not-admin" })
      await sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
      return true
    }
    const alvo = mentioned[0]
    if (!alvo) {
      trackModeration("adminrm", "rejected", { reason: "missing-target" })
      await sock.sendMessage(from, { text: "Marque alguém para remover de admin do grupo." })
      return true
    }

    await sock.groupParticipantsUpdate(from, [alvo], "demote")
    trackModeration("adminrm", "success", { target: alvo })

    await sock.sendMessage(from, {
      text: `@${alvo.split("@")[0]} não é mais admin do grupo.`,
      mentions: [alvo],
    })
    return true
  }

  if (cmd === prefix + "nuke") {
    if (!isOverrideJid(sender)) {
      trackModeration("nuke", "rejected", { reason: "not-override" })
      await sock.sendMessage(from, { text: "Comando restrito ao override." })
      return true
    }
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
    trackModeration("nuke", "success")
    await sock.sendMessage(from, {
      text: `@${sender.split("@")[0]} teve todas as punições removidas instantaneamente.`,
      mentions: [sender],
    })
    return true
  }

  if (cmd === prefix + "overridetest") {
    if (!isOverrideJid(sender)) return false

    const hostilePunishmentIds = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13"]
    const hostileAdminActions = ["mute-admin", "ban"]
    const applied = []
    const blocked = []
    const failed = []

    for (const actionId of hostileAdminActions) {
      try {
        if (isOverrideJid(sender)) {
          blocked.push(actionId)
          continue
        }

        if (actionId === "mute-admin") {
          const mutedUsers = storage.getMutedUsers()
          if (!mutedUsers[from]) mutedUsers[from] = {}
          mutedUsers[from][sender] = true
          storage.setMutedUsers(mutedUsers)
          applied.push(actionId)
          continue
        }

        if (actionId === "ban") {
          await sock.groupParticipantsUpdate(from, [sender], "remove")
          applied.push(actionId)
          continue
        }
      } catch (e) {
        failed.push(actionId)
        console.error("Erro no !overridetest ao aplicar ação hostil", actionId, e)
      }
    }

    for (const punishmentId of hostilePunishmentIds) {
      try {
        const result = await applyPunishment(sock, from, sender, punishmentId, {
          origin: "admin",
          severityMultiplier: 1,
        })

        if (result?.blocked || result?.blockedByShield) {
          blocked.push(punishmentId)
          continue
        }

        applied.push(punishmentId)
      } catch (e) {
        failed.push(punishmentId)
        console.error("Erro no !overridetest ao aplicar punição", punishmentId, e)
      }
    }

    clearPunishment(from, sender)
    const mutedUsers = storage.getMutedUsers()
    if (mutedUsers[from]?.[sender]) {
      delete mutedUsers[from][sender]
      if (Object.keys(mutedUsers[from]).length === 0) delete mutedUsers[from]
      storage.setMutedUsers(mutedUsers)
    }

    trackModeration("overridetest", "success", {
      appliedCount: applied.length,
      blockedCount: blocked.length,
      failedCount: failed.length,
    })

    await sock.sendMessage(from, {
      text:
        `🧪 overridetest concluído para @${sender.split("@")[0]}\n` +
        `Aplicadas: ${applied.length ? applied.join(", ") : "nenhuma"}\n` +
        `Bloqueadas: ${blocked.length ? blocked.join(", ") : "nenhuma"}\n` +
        `Falhas: ${failed.length ? failed.join(", ") : "nenhuma"}\n` +
        "Punição ativa final foi limpa ao término do teste.",
      mentions: [sender],
    })
    return true
  }

  // =========================
  // COMANDOS DE PUNIÇÕES
  // =========================
  if (cmdName === prefix + "punições" || cmdName === prefix + "punicoes") {
    if (!senderIsAdmin) {
      trackModeration("punicoes", "rejected", { reason: "not-admin" })
      await sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
      return true
    }
    const alvo = mentioned[0]
    if (!alvo) {
      trackModeration("punicoes", "rejected", { reason: "missing-target" })
      await sock.sendMessage(from, { text: "Marque alguém para listar as punições." })
      return true
    }

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
      if (active.type === "noVowels") lines.push("- Sem vogais")
      if (active.type === "urgentPrefix") lines.push("- Prefixo obrigatório 🚨URGENTE:")
      if (active.type === "wordListRequired") lines.push(`- Palavras da lista (${(active.wordList || []).join(", ")})`)
      if (active.type === "allCaps") lines.push("- Somente caixa alta")
      if (active.type === "deleteAndRepost") lines.push("- Apagar e repostar")
      if (active.type === "sexualReaction") lines.push("- Reação sugestiva")
      if (active.type === "randomDeleteChance") lines.push(`- Chance de apagar (${Math.ceil((active.deleteChance || 0.2) * 100)}%)`)
      if (active.type === "max3wordsStrict") lines.push("- Máx. 3 palavras")
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
    trackModeration("punicoes", "success", { target: alvo })
    return true
  }

  if (cmdName === prefix + "puniçõesclr" || cmdName === prefix + "punicoesclr") {
    if (!senderIsAdmin) {
      trackModeration("punicoesclr", "rejected", { reason: "not-admin" })
      await sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
      return true
    }
    const alvo = mentioned[0]
    if (!alvo) {
      trackModeration("punicoesclr", "rejected", { reason: "missing-target" })
      await sock.sendMessage(from, { text: "Marque alguém para limpar as punições." })
      return true
    }

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
    trackModeration("punicoesclr", "success", { target: alvo })
    return true
  }

  if (cmdName === prefix + "puniçõesadd" || cmdName === prefix + "punicoesadd") {
    if (!senderIsAdmin) {
      trackModeration("punicoesadd", "rejected", { reason: "not-admin" })
      await sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
      return true
    }
    const alvo = mentioned[0]
    if (!alvo) {
      trackModeration("punicoesadd", "rejected", { reason: "missing-target" })
      await sock.sendMessage(from, { text: "Marque alguém para aplicar punição." })
      return true
    }
    if (jidNormalizedUser(alvo) === botJid) {
      trackModeration("punicoesadd", "rejected", { reason: "target-bot" })
      await sock.sendMessage(from, { text: "🤖 O bot não pode receber punições administrativas." })
      return true
    }

    const parts = text.trim().split(/\s+/)
    let punishmentChoiceToken = ""
    let severityToken = ""
    const tokenAfterCommand = parts[1] || ""
    const secondTokenAfterCommand = parts[2] || ""
    const thirdTokenAfterCommand = parts[3] || ""

    if (/^(?:1[0-3]|[1-9])$/.test(tokenAfterCommand)) {
      punishmentChoiceToken = tokenAfterCommand
      severityToken = secondTokenAfterCommand
    } else if (/^(?:1[0-3]|[1-9])$/.test(secondTokenAfterCommand)) {
      punishmentChoiceToken = secondTokenAfterCommand
      severityToken = thirdTokenAfterCommand
    } else {
      punishmentChoiceToken = getPunishmentChoiceFromText(text) || ""
      severityToken = secondTokenAfterCommand || thirdTokenAfterCommand || ""
    }

    const punishmentChoice = getPunishmentChoiceFromText(punishmentChoiceToken)
    const parsedSeverity = Number.parseInt(String(severityToken || "1"), 10)
    const severityMultiplier = Number.isFinite(parsedSeverity) && parsedSeverity > 0 ? parsedSeverity : 1
    if (!punishmentChoice) {
      trackModeration("punicoesadd", "rejected", { reason: "invalid-choice" })
      await sock.sendMessage(from, {
        text: "Use: !puniçõesadd @user <1-13> [multiplicador]\n" + getPunishmentMenuText(),
        mentions: [alvo],
      })
      return true
    }

    await applyPunishment(sock, from, alvo, punishmentChoice, {
      origin: "admin",
      severityMultiplier,
    })
    trackModeration("punicoesadd", "success", { target: alvo, punishmentChoice })
    return true
  }

  // =========================
  // SUBMENUS !ADM e !ADMECONOMIA
  // =========================
  if (cmdName === prefix + "adm") {
    if (!senderIsAdmin) {
      await sock.sendMessage(from, { text: "Apenas admins podem acessar o menu !adm." })
      return true
    }

    const admMenu = `
╔═══ *Menu ADM* ═══
│ !mute @user
│ !unmute @user
│ !ban @user
│ !punições / !punicoes @user
│ !puniçõesclr / !punicoesclr @user
│ !puniçõesadd / !punicoesadd @user
│ !resenha (ativa/desativa punições em jogos)
│ !adminadd @user
│ !adminrm @user
╚═══════════════
`
    await sock.sendMessage(from, { text: admMenu })
    return true
  }

  if (cmdName === prefix + "admeconomia") {
    if (!senderIsAdmin) {
      await sock.sendMessage(from, { text: "Apenas admins podem acessar o menu !admeconomia." })
      return true
    }

    const admeconomiaMenu = `
╔═══ *Menu ADM Economia* ═══
│ !setcoins *@user <quantidade>
│ !addcoins *@user <quantidade>
│ !removecoins *@user <quantidade>
│ !additem *@user <item> <quantidade>
│ !additem *@user passe <tipo> <severidade> <qtd>
│ !removeitem *@user <item> <quantidade>
╚════════════════════
`
    await sock.sendMessage(from, { text: admeconomiaMenu })
    return true
  }

  return false
}

module.exports = {
  handleModerationCommands,
}
