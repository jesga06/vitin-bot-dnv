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
    buildGameStatsText,
    buildEconomyStatsText,
    buildInventoryText,
    incrementUserStat,
  } = ctx

  if (cmdName === prefix + "jogos" && cmdArg1 === "stats") {
    const profile = economyService.getProfile(sender)
    await sock.sendMessage(from, {
      text: `${buildGameStatsText(profile)}\n\nUse *!jogos* para ver a lista de jogos.`,
    })
    return true
  }

  if (cmd === prefix + "jogos") {
    await sock.sendMessage(from, {
      text:
        `🎮 Jogos disponíveis\n` +
        `- adivinhacao\n` +
        `- batata\n` +
        `- dados\n` +
        `- rr\n` +
        `- embaralhado\n` +
        `- memoria\n` +
        `- reacao\n` +
        `- comando\n\n` +
        `Ver seus stats nos jogos: *!jogos stats*\n` +
        `Criar lobby: *!começa <jogo>*\n` +
        `Entrar lobby: *!entrar <LobbyID>*\n` +
        `Iniciar lobby: *!começar <LobbyID>*`,
    })
    return true
  }

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
        `💰 Comandos de economia\n` +
        `- !perfil stats\n` +
        `- !coinsranking\n` +
        `- !extrato\n` +
        `- !loja\n` +
        `- !comprar <item> <quantidade>\n` +
        `- !comprarpara @user <item> <quantidade>\n` +
        `- !vender <item> <quantidade>\n` +
        `- !doarcoins @user <quantidade>\n` +
        `- !doaritem @user <item> <quantidade>\n` +
        `- !roubar @user\n` +
        `- !daily\n` +
        `- !cassino / !aposta <valor>\n` +
        `- !trabalho <ifood|capinar|lavagem>\n` +
        `- !silenciar @user`,
    })
    return true
  }

  if (cmd === prefix + "perfil") {
    const profile = economyService.getProfile(sender)
    const kronosInfo = profile?.buffs?.kronosActive
      ? `\nCoroa Kronos ativa ate: *${new Date(profile.buffs.kronosExpiresAt).toLocaleString()}*`
      : ""
    await sock.sendMessage(from, {
      text:
        `💳 Carteira global de @${sender.split("@")[0]}\n` +
        `Epsteincoins: *${profile.coins}*\n` +
        `Escudos: *${profile.shields}*\n` +
        `Inventario:\n${buildInventoryText(profile)}${kronosInfo}`,
      mentions: [sender],
    })
    return true
  }

  if (cmd === prefix + "extrato") {
    const statement = economyService.getStatement(sender, 10)
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
      text: `📒 Extrato (últimas 10)\n${lines.join("\n")}`,
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
        `🏦 Ranking de moedas (grupo)\n` +
        `${lines.join("\n")}\n\n` +
        `Sua posição global: *${globalPos || "N/A"}*`,
      mentions: ranking.map((entry) => entry.userId),
    })
    return true
  }

  if (cmd === prefix + "loja") {
    await sock.sendMessage(from, {
      text: economyService.getShopIndexText(),
    })
    return true
  }

  if (cmdName === prefix + "comprar") {
    const item = cmdArg1
    const quantity = parseQuantity(cmdArg2, 1)
    const bought = economyService.buyItem(sender, item, quantity, sender)
    if (!bought.ok) {
      await sock.sendMessage(from, {
        text: bought.reason === "insufficient-funds"
          ? `Saldo insuficiente para essa compra. Custo: ${bought.totalCost} Epsteincoins.`
          : "Item inválido. Use !loja para ver o índice.",
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
        text: "Use: !comprarpara @user <item> <quantidade>",
      })
      return true
    }

    const bought = economyService.buyItem(sender, item, quantity, target)
    if (!bought.ok) {
      await sock.sendMessage(from, {
        text: bought.reason === "insufficient-funds"
          ? `Saldo insuficiente. Custo: ${bought.totalCost} Epsteincoins.`
          : "Item inválido. Use !loja.",
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
      text: `💱 Venda concluída: ${sold.quantity}x ${sold.itemKey} por *${sold.total}* Epsteincoins.`,
    })
    return true
  }

  if (cmdName === prefix + "doarcoins" && isGroup) {
    const target = mentioned[0]
    const quantity = parseQuantity(cmdParts[2], 0)
    if (!target || quantity <= 0) {
      await sock.sendMessage(from, { text: "Use: !doarcoins @user <quantidade>" })
      return true
    }

    const transferred = economyService.transferCoins(sender, target, quantity)
    if (!transferred.ok) {
      await sock.sendMessage(from, { text: "Saldo insuficiente para doação." })
      return true
    }

    await sock.sendMessage(from, {
      text: `🤝 @${sender.split("@")[0]} doou *${transferred.amount}* Epsteincoins para @${target.split("@")[0]}.`,
      mentions: [sender, target],
    })
    return true
  }

  if (cmdName === prefix + "doaritem" && isGroup) {
    const target = mentioned[0]
    const item = cmdParts[2] || ""
    const quantity = parseQuantity(cmdParts[3], 1)
    if (!target || !item) {
      await sock.sendMessage(from, { text: "Use: !doaritem @user <item> <quantidade>" })
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

    economyService.incrementStat(sender, "steals", 1)
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

    if (!steal.success) {
      await sock.sendMessage(from, {
        text:
          `🚨 Roubo falhou! @${sender.split("@")[0]} perdeu *${steal.lost}* Epsteincoins.\n` +
          `Chance de sucesso nesta tentativa: ${(steal.successChance * 100).toFixed(0)}%`,
        mentions: [sender],
      })
      return true
    }

    await sock.sendMessage(from, {
      text:
        `🕵️ Roubo bem-sucedido! @${sender.split("@")[0]} roubou *${steal.stolenFromVictim}* de @${target.split("@")[0]} e recebeu *${steal.gained}* Epsteincoins.\n` +
        `Faixa de roubo: 50 a 200 moedas.\n` +
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
        `💰 Daily resgatado: *${daily.amount}* Epsteincoins.` +
        (daily.kronosBonus ? " (bonus da Coroa Kronos aplicado)" : ""),
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

    await sock.sendMessage(from, {
      text:
        `🎰 ${result.join(" ")}\n` +
        (payout > 0
          ? `Resultado: ganhou *${payout}* Epsteincoins.`
          : `Resultado: perdeu *${value}* Epsteincoins.`),
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

    if (work === "ifood") {
      if (Math.random() < 0.1) {
        message = "🚗 Você sofreu um acidente no delivery e ficou sem pagamento hoje."
      } else {
        gain = Math.floor(Math.random() * 71) + 30
        message = `🍔 Delivery concluído! Você ganhou ${gain} Epsteincoins.`
      }
    } else if (work === "capinar") {
      if (Math.random() < 0.2) {
        message = "🐍 Você foi picado e perdeu o dia de trabalho."
      } else {
        gain = 70
        message = `🌱 Serviço concluído! Você ganhou ${gain} Epsteincoins.`
      }
    } else if (work === "lavagem") {
      if (Math.random() < 0.8) {
        const lost = economyService.debitCoinsFlexible(sender, Math.floor(economyService.getCoins(sender) * 0.4), {
          type: "work-loss",
          details: "Falha no trabalho lavagem",
          meta: { work },
        })
        message = `💀 Lavagem fracassou! Você perdeu ${lost} Epsteincoins.`
      } else {
        gain = Math.floor(Math.random() * 201) + 200
        message = `💰 Lavagem concluída! Você ganhou ${gain} Epsteincoins.`
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

    await sock.sendMessage(from, { text: message })
    return true
  }

  if (cmdName === prefix + "silenciar" && isGroup) {
    const target = mentioned[0]
    if (!target) {
      await sock.sendMessage(from, { text: "Use: !silenciar @user" })
      return true
    }

    const hasMute = economyService.getItemQuantity(sender, "mute")
    if (hasMute < 1) {
      await sock.sendMessage(from, { text: "Você não possui item mute suficiente." })
      return true
    }
    economyService.removeItem(sender, "mute", 1)

    const blockedByShield = economyService.consumeShield(target)
    if (blockedByShield) {
      await sock.sendMessage(from, {
        text: `🛡️ @${target.split("@")[0]} bloqueou a punição com seu escudo!`,
        mentions: [target],
      })
      return true
    }

    const mutedUsers = storage.getMutedUsers()
    if (!mutedUsers[from]) mutedUsers[from] = {}
    mutedUsers[from][target] = true
    storage.setMutedUsers(mutedUsers)

    setTimeout(() => {
      const mutedUsersTimeout = storage.getMutedUsers()
      if (mutedUsersTimeout[from]?.[target]) {
        delete mutedUsersTimeout[from][target]
        if (Object.keys(mutedUsersTimeout[from]).length === 0) delete mutedUsersTimeout[from]
        storage.setMutedUsers(mutedUsersTimeout)
      }
    }, 10 * 60_000)

    await sock.sendMessage(from, {
      text: `🔇 @${target.split("@")[0]} foi silenciado por 10 minutos.`,
      mentions: [target],
    })
    return true
  }

  if ((cmdName === prefix + "addcoins" || cmdName === prefix + "removecoins" || cmdName === prefix + "additem" || cmdName === prefix + "removeitem") && isGroup) {
    if (!senderIsAdmin) {
      await sock.sendMessage(from, { text: "Apenas admins podem usar esse comando." })
      return true
    }

    const target = mentioned[0]
    if (!target) {
      await sock.sendMessage(from, { text: "Marque o usuário alvo." })
      return true
    }

    if (cmdName === prefix + "addcoins") {
      const amount = parseQuantity(cmdParts[2], 0)
      if (amount <= 0) return sock.sendMessage(from, { text: "Use: !addcoins @user <quantidade>" })
      economyService.creditCoins(target, amount, {
        type: "admin-credit",
        details: `Admin adicionou ${amount}`,
        meta: { admin: sender },
      })
      await sock.sendMessage(from, { text: `✅ ${amount} moedas adicionadas para @${target.split("@")[0]}.`, mentions: [target] })
      return true
    }

    if (cmdName === prefix + "removecoins") {
      const amount = parseQuantity(cmdParts[2], 0)
      if (amount <= 0) return sock.sendMessage(from, { text: "Use: !removecoins @user <quantidade>" })
      const removed = economyService.debitCoinsFlexible(target, amount, {
        type: "admin-debit",
        details: `Admin removeu ${amount}`,
        meta: { admin: sender },
      })
      await sock.sendMessage(from, { text: `✅ ${removed} moedas removidas de @${target.split("@")[0]}.`, mentions: [target] })
      return true
    }

    if (cmdName === prefix + "additem") {
      const item = cmdParts[2]
      const qty = parseQuantity(cmdParts[3], 1)
      if (!item) return sock.sendMessage(from, { text: "Use: !additem @user <item> <quantidade>" })
      const next = economyService.addItem(target, item, qty)
      if (next <= 0) return sock.sendMessage(from, { text: "Item inválido." })
      economyService.pushTransaction(target, {
        type: "admin-item-add",
        deltaCoins: 0,
        details: `Admin adicionou ${qty}x ${item}`,
        meta: { admin: sender, item, qty },
      })
      await sock.sendMessage(from, { text: `✅ Item adicionado para @${target.split("@")[0]}.`, mentions: [target] })
      return true
    }

    if (cmdName === prefix + "removeitem") {
      const item = cmdParts[2]
      const qty = parseQuantity(cmdParts[3], 1)
      if (!item) return sock.sendMessage(from, { text: "Use: !removeitem @user <item> <quantidade>" })
      economyService.removeItem(target, item, qty)
      economyService.pushTransaction(target, {
        type: "admin-item-remove",
        deltaCoins: 0,
        details: `Admin removeu ${qty}x ${item}`,
        meta: { admin: sender, item, qty },
      })
      await sock.sendMessage(from, { text: `✅ Item removido de @${target.split("@")[0]}.`, mentions: [target] })
      return true
    }
  }

  return false
}

module.exports = {
  handleEconomyCommands,
}
