const CURRENCY_LABEL = "Epsteincoins"
const telemetry = require("../telemetryService")

async function handleEconomyCommands(ctx) {
  const {
    sock,
    from,
    sender,
    cmd,
    cmdName,
    cmdArg1,
    cmdArg2,
    cmdParts,
    mentioned,
    prefix,
    isGroup,
    senderIsAdmin,
    jidNormalizedUser,
    storage,
    economyService,
    parseQuantity,
    formatDuration,
    buildEconomyStatsText,
    buildInventoryText,
    incrementUserStat,
    applyPunishment,
  } = ctx

  if (cmdName === prefix + "perfil" && cmdArg1 === "stats") {
    const profile = economyService.getProfile(sender)
    await sock.sendMessage(from, {
      text: buildEconomyStatsText(profile),
    })
    return true
  }

  if (cmd === prefix + "economia") {
    await sock.sendMessage(from, {
      text:
`╭━━━〔 💰 SUBMENU: ECONOMIA 〕━━━╮
│ Comandos de economia (* significa argumento opcional)
│ ${prefix}perfil stats
│ ${prefix}perfil *@user
│ ${prefix}coinsranking
│ ${prefix}extrato *@user
│ ${prefix}loja
│ ${prefix}comprar <item|indice> *<quantidade>
│ ${prefix}comprarpara @user <item> *<quantidade>
│ ${prefix}vender <item> *<quantidade>
│ ${prefix}doarcoins @user *<quantidade>
│ ${prefix}doaritem @user <item> *<quantidade>
│ ${prefix}roubar @user
│ ${prefix}daily
│ ${prefix}cassino <valor> / ${prefix}aposta <valor>
│ ${prefix}lootbox <quantidade>
│ ${prefix}falsificar <tipo> <severidade?> *<quantidade>
│ ${prefix}usarpasse @user <tipo> <severidade>
│ ${prefix}trabalho <ifood|capinar|lavagem>
╰━━━━━━━━━━━━━━━━━━━━╯`,
    })
    return true
  }

  if (cmdName === prefix + "perfil" && cmdArg1 !== "stats") {
    const targetUser = mentioned[0] || sender
    const profile = economyService.getProfile(targetUser)
    let kronosInfo = ""
    if (profile?.buffs?.kronosVerdadeiraActive) {
      kronosInfo = "\nCoroa Kronos Verdadeira: *ATIVA (permanente)*"
    } else if (profile?.buffs?.kronosActive) {
      kronosInfo = `\nCoroa Kronos (Quebrada) ativa até: *${new Date(profile.buffs.kronosExpiresAt).toLocaleString()}*`
    }
    await sock.sendMessage(from, {
      text:
        `💳 Carteira global de @${targetUser.split("@")[0]}\n` +
        `${CURRENCY_LABEL}: *${profile.coins}*\n` +
        `Escudos: *${profile.shields}*\n` +
        `Inventário:\n${buildInventoryText(profile)}${kronosInfo}`,
      mentions: [targetUser],
    })
    return true
  }

  if (cmdName === prefix + "extrato") {
    const targetUser = mentioned[0] || sender
    const statement = economyService.getStatement(targetUser, 10)
    if (!statement.length) {
      await sock.sendMessage(from, { text: "Sem movimentações no extrato ainda." })
      return true
    }

    const lines = statement.map((entry, index) => {
      const sign = entry.deltaCoins >= 0 ? "+" : ""
      const when = new Date(entry.at).toLocaleString()
      const details = entry.details ? ` | ${entry.details}` : ""
      return `${index + 1}. ${when} | ${entry.type} | ${sign}${entry.deltaCoins} | saldo ${entry.balanceAfter}${details}`
    })

    await sock.sendMessage(from, {
      text: `📒 Extrato de @${targetUser.split("@")[0]} (últimas 10)\n${lines.join("\n")}`,
      mentions: [targetUser],
    })
    return true
  }

  if (cmd === prefix + "coinsranking" && isGroup) {
    const metadata = await sock.groupMetadata(from)
    const members = (metadata?.participants || []).map((p) => jidNormalizedUser(p.id))
    const ranking = economyService.getGroupRanking(members, 10)
    if (ranking.length === 0) {
      await sock.sendMessage(from, { text: "Sem dados de economia neste grupo ainda." })
      return true
    }

    const lines = ranking.map((entry, index) => `${index + 1}. @${entry.userId.split("@")[0]} - *${entry.coins}*`)
    const globalPos = economyService.getUserGlobalPosition(sender)
    await sock.sendMessage(from, {
      text:
        `🏦 Ranking de ${CURRENCY_LABEL} (grupo)\n` +
        `${lines.join("\n")}\n\n` +
        `Sua posição global: *${globalPos || "N/A"}*`,
      mentions: ranking.map((entry) => entry.userId),
    })
    return true
  }

  if (cmd === prefix + "loja") {
    telemetry.incrementCounter("economy.shop.view", 1)
    await sock.sendMessage(from, {
      text: economyService.getShopIndexText(),
    })
    return true
  }

  if (cmdName === prefix + "comprar") {
    const itemInput = cmdArg1
    const quantity = parseQuantity(cmdArg2, 1)
    let item = itemInput
    if (/^\d+$/.test(itemInput)) {
      const itemIndex = Number.parseInt(itemInput, 10)
      const catalog = economyService.getItemCatalog()
      item = catalog[itemIndex - 1]?.key || ""
    }
    const bought = economyService.buyItem(sender, item, quantity, sender)
    if (!bought.ok) {
      await sock.sendMessage(from, {
        text: bought.reason === "insufficient-funds"
          ? `Saldo insuficiente para essa compra. Custo: ${bought.totalCost} ${CURRENCY_LABEL}.`
          : (bought.reason === "not-for-sale"
            ? "Esse item não pode ser comprado diretamente na loja."
            : "Item/índice inválido. Use !loja para ver o índice."),
      })
      return true
    }

    const profile = economyService.getProfile(sender)
    await sock.sendMessage(from, {
      text:
        `Compra concluída: *${bought.quantity}x ${bought.itemKey}*\n` +
        `Saldo atual: *${profile.coins}*`,
    })
    return true
  }

  if (cmdName === prefix + "comprarpara" && isGroup) {
    const target = mentioned[0]
    const item = cmdParts[2] || ""
    const quantity = parseQuantity(cmdParts[3], 1)
    if (!target || !item) {
      await sock.sendMessage(from, {
        text: "Use: !comprarpara @user <item> [quantidade]",
      })
      return true
    }

    const bought = economyService.buyItem(sender, item, quantity, target)
    if (!bought.ok) {
      await sock.sendMessage(from, {
        text: bought.reason === "insufficient-funds"
          ? `Saldo insuficiente. Custo: ${bought.totalCost} ${CURRENCY_LABEL}.`
          : (bought.reason === "not-for-sale"
            ? "Esse item não pode ser comprado diretamente na loja."
            : "Item inválido. Use !loja."),
      })
      return true
    }

    await sock.sendMessage(from, {
      text:
        `🎁 @${sender.split("@")[0]} comprou *${bought.quantity}x ${bought.itemKey}* para @${target.split("@")[0]}.`,
      mentions: [sender, target],
    })
    return true
  }

  if (cmdName === prefix + "vender") {
    const item = cmdArg1
    const quantity = parseQuantity(cmdArg2, 1)
    const sold = economyService.sellItem(sender, item, quantity)
    if (!sold.ok) {
      await sock.sendMessage(from, {
        text: sold.reason === "insufficient-items"
          ? `Você não tem quantidade suficiente desse item. Disponível: ${sold.available}.`
          : "Item inválido para venda.",
      })
      return true
    }
    await sock.sendMessage(from, {
      text: `💱 Venda concluída: ${sold.quantity}x ${sold.itemKey} por *${sold.total}* ${CURRENCY_LABEL}.`,
    })
    return true
  }

  if (cmdName === prefix + "doarcoins" && isGroup) {
    const target = mentioned[0]
    const quantity = parseQuantity(cmdParts[2], 1)
    if (!target || quantity <= 0) {
      await sock.sendMessage(from, { text: "Use: !doarcoins @user [quantidade]" })
      return true
    }

    const transferred = economyService.transferCoins(sender, target, quantity)
    if (!transferred.ok) {
      await sock.sendMessage(from, { text: "Saldo insuficiente para doação." })
      return true
    }

    await sock.sendMessage(from, {
      text: `🤝 @${sender.split("@")[0]} doou *${transferred.amount}* ${CURRENCY_LABEL} para @${target.split("@")[0]}.`,
      mentions: [sender, target],
    })
    return true
  }

  if (cmdName === prefix + "doaritem" && isGroup) {
    const target = mentioned[0]
    const item = cmdParts[2] || ""
    const quantity = parseQuantity(cmdParts[3], 1)
    if (!target || !item) {
      await sock.sendMessage(from, { text: "Use: !doaritem @user <item> [quantidade]" })
      return true
    }

    const transferred = economyService.transferItem(sender, target, item, quantity)
    if (!transferred.ok) {
      await sock.sendMessage(from, {
        text: transferred.reason === "insufficient-items"
          ? `Você não tem esse item nessa quantidade (disponível: ${transferred.available}).`
          : "Item inválido.",
      })
      return true
    }

    await sock.sendMessage(from, {
      text: `🎁 @${sender.split("@")[0]} doou *${transferred.quantity}x ${transferred.itemKey}* para @${target.split("@")[0]}.`,
      mentions: [sender, target],
    })
    return true
  }

  if (cmdName === prefix + "roubar" && isGroup) {
    const target = mentioned[0]
    if (!target) {
      await sock.sendMessage(from, { text: "Use: !roubar @user" })
      return true
    }

    const steal = economyService.attemptSteal(sender, target)
    if (!steal.ok) {
      if (steal.reason === "same-target-today") {
        await sock.sendMessage(from, { text: "Você já tentou roubar essa mesma pessoa hoje." })
        return true
      }
      if (steal.reason === "daily-limit-reached") {
        await sock.sendMessage(from, { text: "Você já atingiu o limite diário de 3 roubos em alvos diferentes." })
        return true
      }
      await sock.sendMessage(from, {
        text: steal.reason === "victim-empty"
          ? "A vítima está sem moedas."
          : "Não foi possível concluir o roubo.",
      })
      return true
    }

    economyService.incrementStat(sender, "steals", 1)

    if (!steal.success) {
      await sock.sendMessage(from, {
        text:
          `🚨 Roubo falhou! @${sender.split("@")[0]} perdeu *${steal.lost}* ${CURRENCY_LABEL}.\n` +
          `Chance de sucesso nesta tentativa: ${(steal.successChance * 100).toFixed(0)}%`,
        mentions: [sender],
      })
      return true
    }

    await sock.sendMessage(from, {
      text:
        `🕵️ Roubo bem-sucedido! @${sender.split("@")[0]} roubou *${steal.stolenFromVictim}* de @${target.split("@")[0]} e recebeu *${steal.gained}* ${CURRENCY_LABEL}.\n` +
        `Faixa base do roubo: 50 a 200 ${CURRENCY_LABEL} (antes de bônus da Coroa Kronos).\n` +
        `Chance de sucesso nesta tentativa: ${(steal.successChance * 100).toFixed(0)}%`,
      mentions: [sender, target],
    })
    return true
  }

  if (cmd === prefix + "daily") {
    const daily = economyService.claimDaily(sender, 100)
    if (!daily.ok) {
      await sock.sendMessage(from, {
        text: "⏰ Você já resgatou seu daily hoje. Volte após o próximo reset global da meia-noite.",
      })
      return true
    }

    await sock.sendMessage(from, {
      text:
        `💰 Daily resgatado: *${daily.amount}* ${CURRENCY_LABEL}.` +
        (daily.kronosBonus ? " (bônus da Coroa Kronos aplicado)" : ""),
    })
    return true
  }

  if (cmd === prefix + "cassino") {
    await sock.sendMessage(from, {
      text:
        `🎰 Cassino\n` +
        `1 ou 2 iguais: perde a aposta\n` +
        `3 iguais: ganha 3x\n` +
        `4 iguais: ganha 8x\n` +
        `5 iguais: jackpot 30x\n\n` +
        `Use: !aposta <valor>`,
    })
    return true
  }

  if (cmdName === prefix + "aposta") {
    const value = parseQuantity(cmdArg1, 0)
    if (value <= 0) {
      await sock.sendMessage(from, { text: "Use: !aposta <valor>" })
      return true
    }

    if (!economyService.debitCoins(sender, value, {
      type: "casino-bet",
      details: `Aposta de ${value}`,
      meta: { value },
    })) {
      await sock.sendMessage(from, { text: "Saldo insuficiente para essa aposta." })
      return true
    }

    incrementUserStat(sender, "moneyCasinoLost", value)

    const emojis = ["🍒", "🍋", "🍇", "💎", "7️⃣", "⭐"]
    const roll = () => emojis[Math.floor(Math.random() * emojis.length)]
    const result = [roll(), roll(), roll(), roll(), roll()]
    const counts = {}
    result.forEach((e) => { counts[e] = (counts[e] || 0) + 1 })
    const maxCount = Math.max(...Object.values(counts))

    let payout = 0
    if (maxCount === 5) payout = value * 30
    else if (maxCount === 4) payout = value * 8
    else if (maxCount === 3) payout = value * 3

    if (payout > 0) {
      payout = economyService.applyKronosGainMultiplier(sender, payout, "casino")
      economyService.creditCoins(sender, payout, {
        type: "casino-win",
        details: `Resultado do cassino (${maxCount} iguais)`,
        meta: { payout, maxCount },
      })
      incrementUserStat(sender, "moneyCasinoWon", payout)
    }

    economyService.incrementStat(sender, "casinoPlays", 1)
    telemetry.incrementCounter("economy.casino.play", 1, {
      result: payout > 0 ? "win" : "loss",
    })
    telemetry.appendEvent("economy.casino.play", {
      userId: sender,
      bet: value,
      payout,
      maxCount,
      won: payout > 0,
    })

    await sock.sendMessage(from, {
      text:
        `🎰 ${result.join(" ")}\n` +
        (payout > 0
          ? `Resultado: ganhou *${payout}* ${CURRENCY_LABEL}.`
          : `Resultado: perdeu *${value}* ${CURRENCY_LABEL}.`),
    })
    return true
  }

  if (cmdName === prefix + "lootbox" && isGroup) {
    const quantity = parseQuantity(cmdArg1, 1)
    if (quantity <= 0) {
      await sock.sendMessage(from, { text: "Use: !lootbox <quantidade>" })
      return true
    }

    // Get group members for lootbox effects
    const metadata = await sock.groupMetadata(from)
    const groupMembers = (metadata?.participants || []).map((p) => jidNormalizedUser(p.id))

    const result = economyService.openLootbox(sender, quantity, groupMembers)
    if (!result.ok) {
      const available = result.available || 0
      await sock.sendMessage(from, {
        text: result.reason === "insufficient-items"
          ? `Você não tem quantidade suficiente de lootboxes. Disponível: ${available}.`
          : "Erro ao abrir lootbox.",
      })
      return true
    }

    for (const roll of result.results) {
      if (!roll?.punishment?.type) continue
      await applyPunishment(sock, from, roll.targetUser, String(roll.punishment.type), {
        severityMultiplier: Number(roll.punishment.severity) || 1,
        origin: "game",
        botUserId: sock.user?.id,
      })
    }

    const resultLines = result.results.map((r) => `\n🎁 ${r.effect}\n${r.result}`).join("")
    const mentions = result.results
      .filter((r) => r.targetIsOther)
      .map((r) => r.targetUser)
      .filter((id, idx, arr) => arr.indexOf(id) === idx)

    if (mentions.includes(sender)) {
      mentions.splice(mentions.indexOf(sender), 1)
    }
    mentions.unshift(sender)

    await sock.sendMessage(from, {
      text: `🎉 ${sender.split("@")[0]} abriu *${quantity}x* Lootbox!${resultLines}`,
      mentions,
    })
    return true
  }

  if (cmdName === prefix + "falsificar") {
    const type = Number.parseInt(cmdArg1 || "", 10)
    if (!Number.isFinite(type) || type < 1 || type > 13) {
      await sock.sendMessage(from, {
        text: "Use: !falsificar <tipo 1-13> [severidade] [quantidade]",
      })
      return true
    }

    let severity = 1
    let quantity = 1
    if (cmdParts[3]) {
      severity = parseQuantity(cmdParts[2], 1)
      quantity = parseQuantity(cmdParts[3], 1)
    } else {
      quantity = parseQuantity(cmdParts[2], 1)
    }

    if (severity <= 0 || quantity <= 0) {
      await sock.sendMessage(from, {
        text: "Use: !falsificar <tipo 1-13> [severidade] [quantidade]",
      })
      return true
    }

    const forged = economyService.forgePunishmentPass(sender, type, severity, quantity)
    if (!forged.ok) {
      if (forged.reason === "insufficient-items") {
        await sock.sendMessage(from, {
          text: `Você não possui passes suficientes desse tipo/severidade. Disponível: ${forged.available}.`,
        })
        return true
      }
      if (forged.reason === "insufficient-funds") {
        await sock.sendMessage(from, {
          text: `Faltou verba para subornar o cartório clandestino. Custo: ${forged.forgeCost} ${CURRENCY_LABEL}.`,
        })
        return true
      }
      await sock.sendMessage(from, { text: "Não foi possível iniciar sua falsificação." })
      return true
    }

    if (forged.outcome === "multiply") {
      await sock.sendMessage(from, {
        text:
          `🖋️ Carimbos perfeitos!\n` +
          `Os documentos passaram na auditoria ilegal e renderam *+${forged.bonus}* passes extras.\n` +
          `Taxa paga: *${forged.forgeCost}* ${CURRENCY_LABEL}.`,
      })
      return true
    }

    if (forged.outcome === "upgrade-severity") {
      await sock.sendMessage(from, {
        text:
          `📑 Assinatura turbinada!\n` +
          `Seus passes foram promovidos para severidade *${forged.upgradedSeverity}x*.\n` +
          `Taxa de operação: *${forged.forgeCost}* ${CURRENCY_LABEL}.`,
      })
      return true
    }

    if (forged.outcome === "change-type") {
      await sock.sendMessage(from, {
        text:
          `🧾 Troca de timbre concluída!\n` +
          `Os passes mudaram de punição *${forged.fromType}* para *${forged.toType}*.\n` +
          `Taxa de operação: *${forged.forgeCost}* ${CURRENCY_LABEL}.`,
      })
      return true
    }

    await sock.sendMessage(from, {
      text:
        `🚨 Fiscalização surpresa!\n` +
        `Metade do lote foi apreendida: *-${forged.lost}* passes.\n` +
        `Você perdeu também a taxa de *${forged.forgeCost}* ${CURRENCY_LABEL}.`,
    })
    return true
  }

  if (cmdName === prefix + "trabalho") {
    const work = cmdArg1
    if (!work) {
      await sock.sendMessage(from, {
        text: "Use: !trabalho <ifood|capinar|lavagem>",
      })
      return true
    }

    const WORK_COOLDOWN_MS = 1440 * 60_000
    const lastWorkAt = economyService.getWorkCooldown(sender)
    const remaining = (lastWorkAt + WORK_COOLDOWN_MS) - Date.now()
    if (remaining > 0) {
      await sock.sendMessage(from, {
        text: `⏰ Você pode trabalhar novamente em ${formatDuration(remaining)}.`,
      })
      return true
    }

    economyService.setWorkCooldown(sender, Date.now())
    economyService.incrementStat(sender, "works", 1)

    let gain = 0
    let message = ""
    let workStatus = "none"

    if (work === "ifood") {
      if (Math.random() < 0.1) {
        message = "🚗 Você sofreu um acidente no delivery e ficou sem pagamento hoje."
        workStatus = "fail"
      } else {
        gain = Math.floor(Math.random() * 71) + 30
        message = `🍔 Delivery concluído! Você ganhou ${gain} ${CURRENCY_LABEL}.`
        workStatus = "win"
      }
    } else if (work === "capinar") {
      if (Math.random() < 0.2) {
        message = "🐍 Você foi picado e perdeu o dia de trabalho."
        workStatus = "fail"
      } else {
        gain = 70
        message = `🌱 Serviço concluído! Você ganhou ${gain} ${CURRENCY_LABEL}.`
        workStatus = "win"
      }
    } else if (work === "lavagem") {
      if (Math.random() < 0.8) {
        const lost = economyService.debitCoinsFlexible(sender, Math.floor(economyService.getCoins(sender) * 0.4), {
          type: "work-loss",
          details: "Falha no trabalho lavagem",
          meta: { work },
        })
        message = `💀 Lavagem fracassou! Você perdeu ${lost} ${CURRENCY_LABEL}.`
        workStatus = "loss"
      } else {
        gain = Math.floor(Math.random() * 201) + 200
        message = `💰 Lavagem concluída! Você ganhou ${gain} ${CURRENCY_LABEL}.`
        workStatus = "win"
      }
    } else {
      await sock.sendMessage(from, { text: "Trabalho inválido. Use: ifood, capinar ou lavagem." })
      return true
    }

    if (gain > 0) {
      gain = economyService.applyKronosGainMultiplier(sender, gain, "work")
      economyService.creditCoins(sender, gain, {
        type: "work-win",
        details: `Pagamento de trabalho ${work}`,
        meta: { work, gain },
      })
    }

    telemetry.incrementCounter("economy.work.attempt", 1, {
      work,
      status: workStatus,
    })
    telemetry.appendEvent("economy.work.attempt", {
      userId: sender,
      work,
      status: workStatus,
      gain,
    })

    await sock.sendMessage(from, { text: message })
    return true
  }

  if (cmdName === prefix + "usarpasse" && isGroup) {
    const target = mentioned[0]
    const passType = Number.parseInt(cmdParts[2] || "", 10)
    const passSeverity = parseQuantity(cmdParts[3], 1)
    const botId = jidNormalizedUser(sock.user?.id || "")
    if (!target) {
      await sock.sendMessage(from, { text: "Use: !usarpasse @user <tipo 1-13> <severidade>" })
      return true
    }
    if (jidNormalizedUser(target) === botId) {
      await sock.sendMessage(from, { text: "🤖 O bot não pode receber punições administrativas." })
      return true
    }
    if (!Number.isFinite(passType) || passType < 1 || passType > 13 || passSeverity <= 0) {
      await sock.sendMessage(from, { text: "Use: !usarpasse @user <tipo 1-13> <severidade>" })
      return true
    }

    const passKey = economyService.createPunishmentPassKey(passType, passSeverity)
    if (!passKey) {
      await sock.sendMessage(from, { text: "Tipo ou severidade inválidos." })
      return true
    }

    const hasPass = economyService.getItemQuantity(sender, passKey)
    if (hasPass < 1) {
      await sock.sendMessage(from, { text: `Você não possui ${passKey} no inventário.` })
      return true
    }
    economyService.removeItem(sender, passKey, 1)

    await applyPunishment(sock, from, target, String(passType), {
      severityMultiplier: passSeverity,
      origin: "game",
      botUserId: sock.user?.id,
    })
    return true
  }

  if ((cmdName === prefix + "setcoins" || cmdName === prefix + "addcoins" || cmdName === prefix + "removecoins" || cmdName === prefix + "additem" || cmdName === prefix + "removeitem") && isGroup) {
    if (!senderIsAdmin) {
      await sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
      return true
    }

    const mentionedTarget = mentioned[0] || null
    const target = mentionedTarget || sender
    const argOffset = mentionedTarget ? 2 : 1
    const targetMentions = mentionedTarget ? [target] : []

    if (cmdName === prefix + "setcoins") {
      const amount = Number.parseInt(cmdParts[argOffset], 10)
      if (!Number.isFinite(amount) || amount < 0) {
        return sock.sendMessage(from, { text: "Use: !setcoins [@user] <quantidade>" })
      }
      const result = economyService.setCoins(target, amount, {
        type: "admin-setcoins",
        details: `Admin definiu saldo para ${amount}`,
        meta: { admin: sender },
      })
      await sock.sendMessage(from, {
        text: `✅ Saldo de @${target.split("@")[0]} ajustado para *${result.balance}* ${CURRENCY_LABEL}.`,
        mentions: targetMentions,
      })
      return true
    }

    if (cmdName === prefix + "addcoins") {
      const amount = parseQuantity(cmdParts[argOffset], 1)
      if (amount <= 0) return sock.sendMessage(from, { text: "Use: !addcoins [@user] [quantidade]" })
      economyService.creditCoins(target, amount, {
        type: "admin-credit",
        details: `Admin adicionou ${amount}`,
        meta: { admin: sender },
      })
      await sock.sendMessage(from, { text: `✅ ${amount} ${CURRENCY_LABEL} adicionadas para @${target.split("@")[0]}.`, mentions: targetMentions })
      return true
    }

    if (cmdName === prefix + "removecoins") {
      const amount = parseQuantity(cmdParts[argOffset], 1)
      if (amount <= 0) return sock.sendMessage(from, { text: "Use: !removecoins [@user] [quantidade]" })
      const removed = economyService.debitCoinsFlexible(target, amount, {
        type: "admin-debit",
        details: `Admin removeu ${amount}`,
        meta: { admin: sender },
      })
      await sock.sendMessage(from, { text: `✅ ${removed} ${CURRENCY_LABEL} removidas de @${target.split("@")[0]}.`, mentions: targetMentions })
      return true
    }

    if (cmdName === prefix + "additem") {
      const item = String(cmdParts[argOffset] || "").trim()
      if (!item) return sock.sendMessage(from, { text: "Use: !additem [@user] <item> [quantidade]" })

      let effectiveItem = item
      let qty = parseQuantity(cmdParts[argOffset + 1], 1)

      const normalized = item.toLowerCase()
      const isPassRequest = ["passe", "pass", "passepunicao", "passpunicao"].includes(normalized)

      if (isPassRequest) {
        const passType = parseQuantity(cmdParts[argOffset + 1], 0)
        const passSeverity = parseQuantity(cmdParts[argOffset + 2], 1)
        qty = parseQuantity(cmdParts[argOffset + 3], 1)
        if (passType < 1 || passType > 13 || passSeverity <= 0 || qty <= 0) {
          return sock.sendMessage(from, {
            text: "Use: !additem [@user] passe <tipo 1-13> <severidade> [quantidade]",
          })
        }
        const passKey = economyService.createPunishmentPassKey(passType, passSeverity)
        if (!passKey) {
          return sock.sendMessage(from, { text: "Tipo ou severidade de passe inválido." })
        }
        effectiveItem = passKey
      }

      const next = economyService.addItem(target, effectiveItem, qty)
      if (next <= 0) return sock.sendMessage(from, { text: "Item inválido." })

      const itemDef = economyService.getItemDefinition(effectiveItem)
      const itemName = itemDef?.name || effectiveItem
      economyService.pushTransaction(target, {
        type: "admin-item-add",
        deltaCoins: 0,
        details: `Admin adicionou ${qty}x ${effectiveItem}`,
        meta: { admin: sender, item: effectiveItem, qty },
      })
      await sock.sendMessage(from, {
        text: `✅ Item adicionado para @${target.split("@")[0]}: *${qty}x ${itemName}*`,
        mentions: targetMentions,
      })
      return true
    }

    if (cmdName === prefix + "removeitem") {
      const item = cmdParts[argOffset]
      const qtyInput = cmdParts[argOffset + 1]
      const qty = parseQuantity(qtyInput, 0)
      if (!item || !qtyInput || qty <= 0) {
        return sock.sendMessage(from, { text: "Use: !removeitem [@user] <tipo> <quantidade>" })
      }
      economyService.removeItem(target, item, qty)
      economyService.pushTransaction(target, {
        type: "admin-item-remove",
        deltaCoins: 0,
        details: `Admin removeu ${qty}x ${item}`,
        meta: { admin: sender, item, qty },
      })
      await sock.sendMessage(from, { text: `✅ Item removido de @${target.split("@")[0]}.`, mentions: targetMentions })
      return true
    }
  }

  return false
}

module.exports = {
  handleEconomyCommands,
}
