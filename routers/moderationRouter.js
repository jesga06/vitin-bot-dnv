const { normalizeMentionArray, getMentionHandleFromJid, formatMentionTag } = require("../services/mentionService")
const telemetry = require("../services/telemetryService")

async function handleModerationCommands(ctx) {
  const {
    sock,
    msg,
    from,
    sender,
    text,
    cmd,
    cmdName,
    cmdArg1,
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
    overrideChecksEnabled,
    overrideJid,
    overrideIdentifiers,
    senderName,
  } = ctx

  const VOTE_SESSION_TTL_MS = 15 * 60_000

  if (!isGroup) return false

  if (String(cmdName || "").startsWith(String(prefix || ""))) {
    console.log("[router:moderation] incoming", {
      command: cmd,
      groupId: from,
      sender,
      isGroup,
    })
  }

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
    console.log("[router:moderation]", {
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
    if (!overrideChecksEnabled) return false
    const normalized = String(jidNormalizedUser(jid || "") || "").trim().toLowerCase().split(":")[0]
    if (!normalized) return false
    if (overrideIdentitySet.has(normalized)) return true
    const userPart = getMentionHandleFromJid(normalized)
    return Boolean(userPart && overrideIdentitySet.has(userPart))
  }
  const isOverrideSender = isOverrideJid(sender)
  const resolveAdminTarget = () => {
    if (mentioned[0]) return mentioned[0]
    const quotedParticipant = jidNormalizedUser(
      msg?.message?.extendedTextMessage?.contextInfo?.participant || ""
    )
    if (quotedParticipant) return quotedParticipant
    return ""
  }

  const expandKnownUserIdentities = (jid = "") => {
    const normalized = String(jidNormalizedUser(jid || "") || "").trim().toLowerCase().split(":")[0]
    if (!normalized) return []
    const userPart = getMentionHandleFromJid(normalized)
    if (!userPart) return [normalized]
    return [...new Set([
      normalized,
      userPart,
      `${userPart}@s.whatsapp.net`,
      `${userPart}@lid`,
    ])]
  }

  const formatUtcMinus3 = (value) => {
    if (!value) return "-"
    const shifted = new Date(Number(value) - (3 * 60 * 60 * 1000))
    return shifted.toISOString().replace("T", " ").slice(0, 19) + " (UTC-3)"
  }

  const extractPhoneNumber = (identity = "") => {
    const normalized = String(identity || "").trim().toLowerCase().split(":")[0]
    if (!normalized) return ""
    const userPart = normalized.includes("@") ? getMentionHandleFromJid(normalized) : normalized
    return String(userPart || "").replace(/\D+/g, "")
  }

  // =========================
  // COMANDOS DE MODERAÇÃO
  // =========================
  if (cmdName === prefix + "overridegrupos") {
    if (!isOverrideSender) {
      trackModeration("overridegrupos", "rejected", { reason: "not-override" })
      return false
    }

    const knownGroups = Array.isArray(ctx.overrideKnownGroups) ? ctx.overrideKnownGroups : []
    if (knownGroups.length === 0) {
      await sock.sendMessage(sender, { text: "Nenhum grupo conhecido para override no momento." })
      if (isGroup) {
        await sock.sendMessage(from, {
          text: `📩 ${formatMentionTag(sender)}, te enviei no privado a lista de grupos conhecidos.`,
          mentions: normalizeMentionArray([sender]),
        })
      }
      trackModeration("overridegrupos", "success", { count: 0 })
      return true
    }

    const lines = knownGroups
      .slice(0, 200)
      .map((entry, index) => `${index + 1}. ${entry.groupName || "Grupo desconhecido"} | ${entry.groupId}`)

    await sock.sendMessage(sender, {
      text: `Grupos conhecidos para override (${knownGroups.length}):\n${lines.join("\n")}`,
    })
    if (isGroup) {
      await sock.sendMessage(from, {
        text: `📩 ${formatMentionTag(sender)}, te enviei no privado a lista de grupos conhecidos.`,
        mentions: normalizeMentionArray([sender]),
      })
    }
    trackModeration("overridegrupos", "success", { count: knownGroups.length })
    return true
  }

  if (cmdName === prefix + "jidmentions" || cmdName === prefix + "jidsgrupo") {
    if (!isOverrideSender) return false
    if (!isGroup) {
      await sock.sendMessage(from, { text: "Use em grupo com menções. Ex.: !jidsgrupo @user" })
      return true
    }
    if (!mentioned.length) {
      await sock.sendMessage(from, { text: "Use: !jidsgrupo @user1 @user2 ..." })
      return true
    }

    const lines = []
    mentioned.forEach((targetJid, index) => {
      const identities = expandKnownUserIdentities(targetJid)
      lines.push(`${index + 1}. ${targetJid}`)
      identities.forEach((identity) => lines.push(`   - ${identity}`))
    })

    await sock.sendMessage(sender, {
      text: `Identidades conhecidas dos usuários mencionados:\n${lines.join("\n")}`,
    })
    await sock.sendMessage(from, {
      text: `📩 ${formatMentionTag(sender)}, enviei os JIDs no seu privado.`,
      mentions: normalizeMentionArray([sender]),
    })
    trackModeration("jidsgrupo", "success", {
      count: mentioned.length,
      via: isOverrideSender ? "override" : "admin",
    })
    return true
  }

  if (cmdName === prefix + "block") {
    if (!isOverrideSender) {
      trackModeration("block", "rejected", { reason: "not-override" })
      await sock.sendMessage(from, { text: "Apenas overrides podem usar esse comando." })
      return true
    }

    const alvo = resolveAdminTarget()
    if (!alvo) {
      trackModeration("block", "rejected", { reason: "missing-target" })
      await sock.sendMessage(from, { text: "Use: !block @user" })
      return true
    }

    if (isOverrideJid(alvo)) {
      trackModeration("block", "rejected", { reason: "target-override" })
      await sock.sendMessage(from, { text: "Esse usuário não pode ser bloqueado por comando." })
      return true
    }

    const identities = expandKnownUserIdentities(alvo)
    const added = storage.addGlobalBlockedUsers(identities, {
      blockedBy: sender,
      blockedByName: getMentionHandleFromJid(sender),
    })

    trackModeration("block", "success", { target: alvo, identitiesAdded: added.length })
    await sock.sendMessage(from, {
      text:
        `⛔ ${formatMentionTag(alvo)} foi bloqueado para uso de comandos (global).\n` +
        `Identidades mapeadas: *${identities.length}* | Novas entradas: *${added.length}*`,
      mentions: normalizeMentionArray([alvo]),
    })
    return true
  }

  if (cmdName === prefix + "unblock") {
    if (!senderIsAdmin) {
      trackModeration("unblock", "rejected", { reason: "not-admin" })
      await sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
      return true
    }

    const alvo = resolveAdminTarget()
    if (!alvo) {
      trackModeration("unblock", "rejected", { reason: "missing-target" })
      await sock.sendMessage(from, { text: "Use: !unblock @user" })
      return true
    }

    const identities = expandKnownUserIdentities(alvo)
    const removed = storage.removeGlobalBlockedUsers(identities)

    trackModeration("unblock", "success", { target: alvo, identitiesRemoved: removed.length })
    await sock.sendMessage(from, {
      text:
        `✅ ${formatMentionTag(alvo)} foi desbloqueado para comandos.\n` +
        `Entradas removidas: *${removed.length}*`,
      mentions: normalizeMentionArray([alvo]),
    })
    return true
  }

  if (cmdName === prefix + "bloqueados" || cmdName === prefix + "bloqueadosfones") {
    if (!senderIsAdmin && !isOverrideSender) {
      trackModeration("bloqueados", "rejected", { reason: "not-allowed" })
      await sock.sendMessage(from, { text: "Apenas admins ou overrides podem usar esse comando." })
      return true
    }

    const blocked = storage.getGlobalBlockedUsers()
    const entries = Object.keys(blocked || {})
    if (entries.length === 0) {
      await sock.sendMessage(from, { text: "Não há usuários bloqueados globalmente." })
      trackModeration("bloqueados", "success", { count: 0 })
      return true
    }

    const phoneNumbers = [...new Set(entries
      .map((identity) => extractPhoneNumber(identity))
      .filter(Boolean))]

    if (phoneNumbers.length === 0) {
      await sock.sendMessage(from, {
        text: "Há entradas de bloqueio, mas nenhuma com número de telefone extraível.",
      })
      trackModeration("bloqueados", "success", {
        count: entries.length,
        phones: 0,
      })
      return true
    }

    const lines = phoneNumbers.slice(0, 50).map((phone, index) => `${index + 1}. ${phone}`)
    const extra = phoneNumbers.length > 50 ? `\n... e mais ${phoneNumbers.length - 50} número(s).` : ""
    await sock.sendMessage(from, {
      text: `Números bloqueados globalmente:\n${lines.join("\n")}${extra}`,
    })
    trackModeration("bloqueados", "success", {
      count: entries.length,
      phones: phoneNumbers.length,
    })
    return true
  }

  if (cmdName === prefix + "voteset") {
    if (!senderIsAdmin) {
      trackModeration("voteset", "rejected", { reason: "not-admin" })
      await sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
      return true
    }

    const parsedThreshold = Number.parseInt(String(cmdArg1 || ""), 10)
    if (!Number.isFinite(parsedThreshold) || parsedThreshold < 1 || parsedThreshold > 50) {
      await sock.sendMessage(from, { text: "Use: !voteset <1-50>" })
      trackModeration("voteset", "rejected", { reason: "invalid-threshold" })
      return true
    }

    storage.setGroupVoteThreshold(from, parsedThreshold)
    await sock.sendMessage(from, {
      text: `✅ Limite de votos configurado para *${parsedThreshold}* neste grupo.`,
    })
    trackModeration("voteset", "success", { threshold: parsedThreshold })
    return true
  }

  if (cmdName === prefix + "votos") {
    const sessions = storage.getGroupVoteSessions(from)
    const now = Date.now()
    const activeEntries = Object.entries(sessions).filter(([, session]) => {
      const expiresAt = Number(session?.expiresAt) || 0
      return expiresAt > now
    })

    if (activeEntries.length === 0) {
      await sock.sendMessage(from, { text: "Não há votações ativas neste grupo." })
      trackModeration("votos", "success", { count: 0 })
      return true
    }

    const lines = activeEntries.map(([targetId, session], index) => {
      const votes = Object.keys(session?.votesBy || {}).length
      const expiresInMin = Math.max(0, Math.ceil(((Number(session?.expiresAt) || now) - now) / 60_000))
      return `${index + 1}. ${formatMentionTag(targetId)} - ${votes} voto(s), expira em ${expiresInMin} min`
    })
    await sock.sendMessage(from, {
      text: `Votações ativas:\n${lines.join("\n")}`,
      mentions: activeEntries.map(([targetId]) => targetId),
    })
    trackModeration("votos", "success", { count: activeEntries.length })
    return true
  }

  if (cmdName === prefix + "vote") {
    const target = mentioned[0]
    if (!target) {
      await sock.sendMessage(from, { text: "Use: !vote @user" })
      trackModeration("vote", "rejected", { reason: "missing-target" })
      return true
    }

    if (jidNormalizedUser(target) === botJid) {
      await sock.sendMessage(from, { text: "Não é possível votar contra o bot." })
      trackModeration("vote", "rejected", { reason: "target-bot" })
      return true
    }

    if (isOverrideJid(target)) {
      await sock.sendMessage(from, { text: "Esse usuário não pode ser alvo de votação." })
      trackModeration("vote", "rejected", { reason: "target-override" })
      return true
    }

    const now = Date.now()
    const threshold = storage.getGroupVoteThreshold(from)
    const sessions = storage.getGroupVoteSessions(from)

    // Limpa sessões expiradas antes de registrar o voto.
    Object.keys(sessions).forEach((targetId) => {
      const expiresAt = Number(sessions[targetId]?.expiresAt) || 0
      if (expiresAt <= now) {
        delete sessions[targetId]
      }
    })

    let session = sessions[target]
    if (!session) {
      session = {
        target,
        createdAt: now,
        expiresAt: now + VOTE_SESSION_TTL_MS,
        createdBy: sender,
        votesBy: {},
      }
      sessions[target] = session
    }

    if (session.votesBy[sender]) {
      const currentVotes = Object.keys(session.votesBy).length
      await sock.sendMessage(from, {
        text: `Você já votou em ${formatMentionTag(target)}. (${currentVotes}/${threshold})`,
        mentions: normalizeMentionArray([target]),
      })
      trackModeration("vote", "rejected", { reason: "duplicate-vote", target })
      storage.setGroupVoteSessions(from, sessions)
      return true
    }

    session.votesBy[sender] = true
    const totalVotes = Object.keys(session.votesBy).length
    storage.setGroupVoteSessions(from, sessions)

    if (totalVotes < threshold) {
      await sock.sendMessage(from, {
        text: `🗳️ Voto registrado para ${formatMentionTag(target)}: *${totalVotes}/${threshold}*`,
        mentions: normalizeMentionArray([target]),
      })
      trackModeration("vote", "success", { target, totalVotes, threshold, resolved: false })
      return true
    }

    // Threshold atingido: 90% mute, 10% ban.
    delete sessions[target]
    storage.setGroupVoteSessions(from, sessions)

    const action = Math.random() < 0.9 ? "mute" : "ban"
    if (action === "mute") {
      const mutedUsers = storage.getMutedUsers()
      if (!mutedUsers[from]) mutedUsers[from] = {}
      mutedUsers[from][target] = true
      storage.setMutedUsers(mutedUsers)
      await sock.sendMessage(from, {
        text: `🔇 Votação encerrada: ${formatMentionTag(target)} foi mutado.`,
        mentions: normalizeMentionArray([target]),
      })
      trackModeration("vote", "success", { target, totalVotes, threshold, resolved: true, action: "mute" })
      return true
    }

    try {
      await sock.groupParticipantsUpdate(from, [target], "remove")
      await sock.sendMessage(from, {
        text: `⛔ Votação encerrada: ${formatMentionTag(target)} foi banido do grupo.`,
        mentions: normalizeMentionArray([target]),
      })
      trackModeration("vote", "success", { target, totalVotes, threshold, resolved: true, action: "ban" })
    } catch (err) {
      const mutedUsers = storage.getMutedUsers()
      if (!mutedUsers[from]) mutedUsers[from] = {}
      mutedUsers[from][target] = true
      storage.setMutedUsers(mutedUsers)
      await sock.sendMessage(from, {
        text: `⚠️ Ban falhou, fallback aplicado: ${formatMentionTag(target)} foi mutado.`,
        mentions: normalizeMentionArray([target]),
      })
      trackModeration("vote", "success", { target, totalVotes, threshold, resolved: true, action: "mute-fallback" })
    }
    return true
  }

  if (cmdName === prefix + "mute") {
    const alvo = resolveAdminTarget()
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
    await sock.sendMessage(from, { text: `${formatMentionTag(alvo)} foi mutado! Finalmente vai calar a boca.`, mentions: normalizeMentionArray([alvo]) })
    return true
  }

  if (cmdName === prefix + "unmute") {
    const alvo = resolveAdminTarget()
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
    await sock.sendMessage(from, { text: `${formatMentionTag(alvo)} foi desmutado! Infelizmente pode falar de novo.`, mentions: normalizeMentionArray([alvo]) })
    return true
  }

  if (cmdName === prefix + "ban") {
    const alvo = resolveAdminTarget()
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
    await sock.sendMessage(from, { text: `${formatMentionTag(alvo)} foi banido do grupo.`, mentions: normalizeMentionArray([alvo]) })
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
      text: `${formatMentionTag(alvo)} agora é admin do grupo.`,
      mentions: normalizeMentionArray([alvo]),
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
      text: `${formatMentionTag(alvo)} não é mais admin do grupo.`,
      mentions: normalizeMentionArray([alvo]),
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
      text: `${formatMentionTag(sender)} teve todas as punições removidas instantaneamente.`,
      mentions: normalizeMentionArray([sender]),
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
        `🧪 overridetest concluído para ${formatMentionTag(sender)}\n` +
        `Aplicadas: ${applied.length ? applied.join(", ") : "nenhuma"}\n` +
        `Bloqueadas: ${blocked.length ? blocked.join(", ") : "nenhuma"}\n` +
        `Falhas: ${failed.length ? failed.join(", ") : "nenhuma"}\n` +
        "Punição ativa final foi limpa ao término do teste.",
      mentions: normalizeMentionArray([sender]),
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
    const alvo = resolveAdminTarget()
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
      if (active.type === "lettersBlock") lines.push(`- Bloqueio por letras`)
      if (active.type === "emojiOnly") lines.push("- Somente emojis e figurinhas")
      if (active.type === "mute5m") lines.push("- Mute total 5 minutos")
      if (active.type === "noVowels") lines.push("- Sem vogais")
      if (active.type === "urgentPrefix") lines.push("- Prefixo \"🚨URGENTE:\" obrigatório")
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
        ? `Punições de ${formatMentionTag(alvo)}:\n${lines.join("\n")}`
        : `${formatMentionTag(alvo)} não possui punições ativas.`,
      mentions: normalizeMentionArray([alvo]),
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
    const alvo = resolveAdminTarget()
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
      text: `Todas as punições de ${formatMentionTag(alvo)} foram removidas.`,
      mentions: normalizeMentionArray([alvo]),
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
    const alvo = resolveAdminTarget()
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
    if (isOverrideJid(alvo)) {
      trackModeration("punicoesadd", "rejected", { reason: "target-override" })
      await sock.sendMessage(from, { text: "Este usuário não podem receber punições administrativas." })
      return true
    }

    const parts = text.trim().split(/\s+/)
    const args = parts.slice(1).filter((token) => token && !token.startsWith("@"))

    let punishmentChoice = ""
    let severityMultiplier = 1
    let hasExplicitSeverity = false

    const compactChoiceMatch = String(args[0] || "").match(/^(1[0-3]|[1-9])(?:x(\d+))?$/i)
    if (compactChoiceMatch) {
      punishmentChoice = compactChoiceMatch[1]
      if (compactChoiceMatch[2]) {
        hasExplicitSeverity = true
        severityMultiplier = Number.parseInt(compactChoiceMatch[2], 10)
      }
    }

    if (!punishmentChoice) {
      punishmentChoice = getPunishmentChoiceFromText(text) || ""
    }

    const severityToken = args.find((token, index) => {
      if (index === 0 && compactChoiceMatch) return false
      return /^x?\d+$/i.test(String(token || ""))
    })

    if (!hasExplicitSeverity && severityToken) {
      hasExplicitSeverity = true
      severityMultiplier = Number.parseInt(String(severityToken).replace(/^x/i, ""), 10)
    }

    if (!punishmentChoice) {
      console.log("[router:moderation] punicoesadd - no punishment choice extracted", { alvo, text })
      trackModeration("punicoesadd", "rejected", { reason: "invalid-choice" })
      await sock.sendMessage(from, {
        text: "Use: !puniçõesadd [@user] <1-13> [severidade]\nEx.: !punicoesadd @user 7 3 | !punicoesadd @user 7x3\n" + getPunishmentMenuText(),
        mentions: normalizeMentionArray([alvo]),
      })
      return true
    }

    if (hasExplicitSeverity && (!Number.isFinite(severityMultiplier) || severityMultiplier <= 0)) {
      console.log("[router:moderation] punicoesadd - invalid severity", { alvo, severityMultiplier })
      trackModeration("punicoesadd", "rejected", { reason: "invalid-severity" })
      await sock.sendMessage(from, {
        text: "Severidade inválida. Use um número positivo.\nEx.: !puniçõesadd @user 7 3",
        mentions: normalizeMentionArray([alvo]),
      })
      return true
    }

    console.log("[router:moderation] punicoesadd - applying punishment", { alvo, punishmentChoice, severityMultiplier, origin: "admin" })
    await applyPunishment(sock, from, alvo, punishmentChoice, {
      origin: "admin",
      severityMultiplier,
    })
    console.log("[router:moderation] punicoesadd - punishment applied successfully", { alvo, punishmentChoice })
    trackModeration("punicoesadd", "success", { target: alvo, punishmentChoice })
    return true
  }

  if (cmdName === prefix + "filtros") {
    if (!senderIsAdmin) {
      trackModeration("filtros", "rejected", { reason: "not-admin" })
      await sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
      return true
    }

    const filters = storage.getGroupFilters(from)
    if (!filters.length) {
      await sock.sendMessage(from, { text: "Não há filtros ativos neste grupo." })
      trackModeration("filtros", "success", { count: 0 })
      return true
    }

    const lines = filters.map((entry, idx) => {
      const addedByName = String(entry?.addedByName || entry?.addedBy || "desconhecido")
      return `${idx + 1}. "${entry.text}" | adicionado em ${formatUtcMinus3(entry.addedAt)} | por ${addedByName}`
    })

    await sock.sendMessage(from, { text: `Filtros ativos:\n${lines.join("\n")}` })
    trackModeration("filtros", "success", { count: filters.length })
    return true
  }

  if (cmdName === prefix + "filtroadd") {
    if (!senderIsAdmin) {
      trackModeration("filtroadd", "rejected", { reason: "not-admin" })
      await sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
      return true
    }

    const trimmed = String(text || "").trim()
    const firstSpace = trimmed.indexOf(" ")
    const filterText = firstSpace >= 0 ? trimmed.slice(firstSpace + 1).trim() : ""
    if (!filterText) {
      trackModeration("filtroadd", "rejected", { reason: "missing-filter" })
      await sock.sendMessage(from, { text: "Use: !filtroadd <texto do filtro>" })
      return true
    }

    const filterEntry = {
      text: filterText,
      addedAt: Date.now(),
      addedBy: sender,
      addedByName: String(senderName || "").trim() || getMentionHandleFromJid(sender),
    }

    let createdIndex = 0
    let createdAt = filterEntry.addedAt

    if (typeof storage.addGroupFilter === "function") {
      const addResult = storage.addGroupFilter(from, filterEntry)
      if (!addResult?.ok) {
        trackModeration("filtroadd", "rejected", { reason: "storage-add-failed" })
        await sock.sendMessage(from, { text: "Não foi possível salvar o filtro no storage." })
        return true
      }
      createdIndex = Number(addResult.index) || 0
      createdAt = Number(addResult.entry?.addedAt) || createdAt
    } else {
      const filters = storage.getGroupFilters(from)
      filters.push(filterEntry)
      storage.setGroupFilters(from, filters)
      createdIndex = filters.length
    }

    await sock.sendMessage(from, { text: "Filtro adicionado. Confira sua DM para confirmação." })
    await sock.sendMessage(sender, {
      text:
        `✅ Filtro adicionado com sucesso.\n` +
        `Índice: ${createdIndex}\n` +
        `Texto: "${filterText}"\n` +
        `Adicionado em: ${formatUtcMinus3(createdAt)}`,
    })

    setTimeout(async () => {
      try {
        await sock.sendMessage(from, { delete: msg.key })
      } catch (err) {
        console.error("Erro ao apagar comando !filtroadd", err)
      }
    }, 5000)

    trackModeration("filtroadd", "success", { index: createdIndex })
    return true
  }

  if (cmdName === prefix + "filtroremove") {
    if (!senderIsAdmin) {
      trackModeration("filtroremove", "rejected", { reason: "not-admin" })
      await sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
      return true
    }

    const parts = String(text || "").trim().split(/\s+/)
    const parsedIndex = Number.parseInt(parts[1] || "", 10)
    const index = Number.isFinite(parsedIndex) ? parsedIndex : 0
    const filters = storage.getGroupFilters(from)

    if (index <= 0 || index > filters.length) {
      trackModeration("filtroremove", "rejected", { reason: "invalid-index" })
      await sock.sendMessage(from, { text: `Índice inválido. Use um valor de 1 até ${filters.length || 1}.` })
      return true
    }

    let removed = null
    if (typeof storage.removeGroupFilter === "function") {
      const removeResult = storage.removeGroupFilter(from, index)
      if (!removeResult?.ok) {
        trackModeration("filtroremove", "rejected", { reason: "storage-remove-failed" })
        await sock.sendMessage(from, { text: "Não foi possível remover o filtro do storage." })
        return true
      }
      removed = removeResult.removed
    } else {
      const [fallbackRemoved] = filters.splice(index - 1, 1)
      storage.setGroupFilters(from, filters)
      removed = fallbackRemoved
    }

    await sock.sendMessage(from, { text: `Filtro removido (#${index}): "${removed?.text || "-"}"` })
    trackModeration("filtroremove", "success", { index })
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
│ !punicoeslista
│ !puniçõesclr / !punicoesclr @user
│ !puniçõesadd / !punicoesadd [@user] <1-13> [severidade]
│ !filtros
│ !filtroadd <texto com espaços>
│ !filtroremove <índice>
│ !resenha (ativa/desativa punições em jogos)
│ !adminadd @user
│ !adminrm @user
│ !block @user
│ !unblock @user
│ !bloqueados
│ !bloqueadosfones
│ !vote @user (Inicia uma votação para mutar/banir o usuário mencionado. Punição escolhida aleatoriamente.)
│ !voteset <1-50>
│ !votos
╚═══════════════
`
    await sock.sendMessage(from, { text: admMenu })
    return true
  }

  if (cmdName === prefix + "admeconomia") {
    if (!isOverrideSender) {
      await sock.sendMessage(from, { text: "Apenas seletos usuários podem acessar o menu !admeconomia." })
      return true
    }

    const admeconomiaMenu = `
╔═══ *Menu ADM Economia* ═══
  │ !setcoins [@user] <quantidade>
  │ !addcoins [@user] <quantidade>
  │ !removecoins [@user] <quantidade>
  │ !additem [@user] <item> <quantidade>
  │ !additem [@user] passe <tipo 1-13> <severidade> <qtd>
  │ !removeitem [@user] <item> <quantidade>
  │ !mudarapelido @user <novo_apelido>
  │ !cooldowns [list] | !cooldowns reset [@user] <all|daily,work,cestabasica,steal,moeda>
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
