const telemetry = require("../telemetryService")

async function handleUtilityCommands(ctx) {
  const {
    sock,
    from,
    sender,
    cmd,
    prefix,
    isGroup,
    msg,
    quoted,
    mentioned,
    sharp,
    downloadMediaMessage,
    logger,
    videoToSticker,
    dddMap,
    jidNormalizedUser,
    getPunishmentDetailsText,
  } = ctx

  let media =
    msg.message?.imageMessage ||
    msg.message?.videoMessage ||
    quoted?.imageMessage ||
    quoted?.videoMessage

  function trackUtility(command, status, meta = {}) {
    telemetry.incrementCounter("router.utility.command", 1, {
      command,
      status,
    })
    telemetry.appendEvent("router.utility.command", {
      command,
      status,
      groupId: from,
      sender,
      ...meta,
    })
  }

  if (cmd === prefix + "menu") {
    trackUtility("menu", "success")
    await sock.sendMessage(from, {
      text:
`╭━━━〔 🤖 VITIN BOT 〕━━━╮
│ 👑 Status: Online
│ ⚙️ Sistema: Baileys
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 🎨 FIGURINHAS 〕━━━╮
│ ${prefix}s / ${prefix}fig / ${prefix}sticker / ${prefix}f
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 🎮 DIVERSÃO 〕━━━╮
│ ${prefix}roleta
│ ${prefix}bombardeio @user
│ ${prefix}gay @user
│ ${prefix}gado @user
│ ${prefix}ship @a @b
│ ${prefix}treta
│ ${prefix}jogos (submenu de jogos)
│ ${prefix}economia (submenu de economia)
│ ${prefix}punicoeslista
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 ⚡ ADM 〕━━━╮
│ (* significa argumento opcional)
│ ${prefix}mute @user
│ ${prefix}unmute @user
│ ${prefix}ban @user
│ ${prefix}punições / ${prefix}punicoes @user
│ ${prefix}puniçõesclr / ${prefix}punicoesclr @user
│ ${prefix}puniçõesadd / ${prefix}punicoesadd @user
│ ${prefix}resenha (ativa/desativa punições em jogos)
│ ${prefix}adminadd @user (promove admin)
│ ${prefix}adminrm @user (remove admin)
│ ${prefix}setcoins *@user <quantidade>
│ ${prefix}addcoins *@user *<quantidade>
│ ${prefix}removecoins *@user *<quantidade>
│ ${prefix}additem *@user <item> *<quantidade>
│ ${prefix}additem *@user passe <tipo> <severidade> *<qtd>
│ ${prefix}removeitem *@user <item> *<quantidade>
╰━━━━━━━━━━━━━━━━━━━━╯`,
    })
    return true
  }

  if (cmd === prefix + "jid") {
    if (isGroup) {
      trackUtility("jid", "rejected", { reason: "group-only-dm-command" })
      return false
    }

    const senderRaw = String(sender || "").trim()
    const senderNormalized = jidNormalizedUser(senderRaw)
    const senderWithoutDevice = senderRaw.split(":")[0]
    const senderUserPart = senderWithoutDevice.split("@")[0]
    const senderSWh = senderUserPart ? `${senderUserPart}@s.whatsapp.net` : ""
    const senderLid = senderUserPart ? `${senderUserPart}@lid` : ""

    const identifiers = [
      senderRaw,
      senderNormalized,
      senderWithoutDevice,
      senderSWh,
      senderLid,
      senderUserPart,
    ].filter(Boolean)

    const uniqueIdentifiers = Array.from(new Set(identifiers))
    trackUtility("jid", "success")
    await sock.sendMessage(from, {
      text: uniqueIdentifiers.join("\n"),
    })
    return true
  }

  if (cmd === prefix + "punicoeslista" || cmd === prefix + "puniçõeslista") {
    trackUtility("punicoeslista", "success")
    const detailsText = typeof getPunishmentDetailsText === "function"
      ? getPunishmentDetailsText()
      : "Lista de punições indisponível no momento."

    await sock.sendMessage(sender, { text: detailsText })
    if (isGroup) {
      await sock.sendMessage(from, {
        text: `📩 @${sender.split("@")[0]}, te enviei a lista de punições no privado.`,
        mentions: [sender],
      })
    }
    return true
  }

  if (cmd === prefix + "s" || cmd === prefix + "fig" || cmd === prefix + "sticker" || cmd === prefix + "f") {
    if (!media) {
      trackUtility("sticker", "rejected", { reason: "missing-media" })
      await sock.sendMessage(from, { text: "Envie ou responda uma mídia!" })
      return true
    }

    try {
      let buffer
      if (msg.message?.imageMessage || msg.message?.videoMessage) {
        buffer = await downloadMediaMessage(msg, "buffer", {}, { logger })
      } else if (quoted?.imageMessage || quoted?.videoMessage) {
        buffer = await downloadMediaMessage({ message: quoted }, "buffer", {}, { logger })
      }

      let sticker
      if (msg.message?.imageMessage || quoted?.imageMessage) {
        sticker = await sharp(buffer)
          .resize({ width: 512, height: 512, fit: "fill" })
          .webp({ quality: 100 })
          .toBuffer()
      } else if (msg.message?.videoMessage || quoted?.videoMessage) {
        sticker = await videoToSticker(buffer)
      }

      await sock.sendMessage(from, { sticker })
      trackUtility("sticker", "success")
    } catch (err) {
      trackUtility("sticker", "error")
      console.error(err)
      await sock.sendMessage(from, { text: "Erro ao criar figurinha!" })
    }
    return true
  }

  if (cmd === prefix + "roleta" && isGroup) {
    const metadata = await sock.groupMetadata(from)
    const botJid = jidNormalizedUser(sock.user?.id || "")
    const participantes = (metadata?.participants || [])
      .map((p) => jidNormalizedUser(p.id))
      .filter((id) => id && id !== botJid)

    if (!participantes.length) {
      trackUtility("roleta", "rejected", { reason: "no-participants" })
      await sock.sendMessage(from, {
        text: "Não foi possível realizar a roleta: nenhum participante encontrado.",
      })
      return true
    }

    const alvo = participantes[Math.floor(Math.random() * participantes.length)]
    const numero = alvo.split("@")[0]

    const frases = [
      `@${numero} foi agraciado a rebolar lentinho pra todos do grupo!`,
      `@${numero} vai ter que pagar babão pro bonde`,
      `@${numero} teve os dados puxados e tivemos uma revelação triste, é adotado...`,
      `@${numero} por que no seu navegador tem pornô de femboy furry?`,
      `@${numero} gabaritou a tabela de DST! Parabéns pela conquista.`,
      `@${numero} foi encontrado na ilha do Epstein...`,
      `@${numero} foi censurado pelo Felca`,
      `@${numero} está dando pro pai de todo mundo do grupo`,
      `@${numero} foi visto numa boate gay no centro de São Paulo`,
      `@${numero} sei que te abandonaram na ilha do Epstein, mas não precisa se afundar em crack...`,
      `@${numero} foi avistado gravando um video para o onlyfans da Leandrinha...`,
      `@${numero} pare de me mandar foto da bunda no privado, ja disse que não vou avaliar!`,
      `@${numero} estava assinando o Privacy do Bluezão quando foi flagrado, você ta bem mano?`,
      `@${numero} teve o histórico do navegador vazado e achamos uma pesquisa estranha... Peppa Pig rule 34?`,
      `@${numero} foi pego pela vó enquanto batia punheta!`,
      `@${numero} teve uma foto constragedora vazada... pera, c ta vestido de empregada?`,
      `@${numero} descobrimos sua conta do OnlyFans!`,
      `@${numero} foi visto comendo o dono do grupo!`,
      `@${numero} viu a namorada beijando outro, não sobra nem o conceito de nada pro beta. Brutal`,
    ]

    const frase = frases[Math.floor(Math.random() * frases.length)]
    await sock.sendMessage(from, { text: frase, mentions: [alvo] })
    trackUtility("roleta", "success")
    return true
  }

  if (cmd.startsWith(prefix + "bombardeio") && mentioned.length > 0 && isGroup) {
    const alvo = mentioned[0]
    const ip = `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`

    const provedores = ["Claro", "Vivo", "Tim", "Oi", "Copel", "NET"]
    const provedor = provedores[Math.floor(Math.random() * provedores.length)]

    const dispositivos = ["Android", "iOS", "Windows PC", "Linux PC"]
    const dispositivo = dispositivos[Math.floor(Math.random() * dispositivos.length)]

    const numero = alvo.split("@")[0]
    const ddd = numero.substring(0, 2)
    const regiao = dddMap[ddd] || "desconhecida"

    const crimes = ["furto", "roubo", "estelionato", "tráfico", "lesão corporal", "homicídio", "contrabando", "vandalismo", "pirataria", "crime cibernético", "fraude", "tráfico de animais", "lavagem de dinheiro", "crime ambiental", "corrupção", "sequestro", "ameaça", "falsificação", "invasão de propriedade", "crime eleitoral"]
    const crime = crimes[Math.floor(Math.random() * crimes.length)]

    await sock.sendMessage(from, { text: `📡 Analisando ficha criminal... (1 crime encontrado: ${crime})`, mentions: [alvo] })

    setTimeout(async () => {
      await sock.sendMessage(from, { text: `💻 IP rastreado: ${ip}`, mentions: [alvo] })
    }, 1500)

    setTimeout(async () => {
      await sock.sendMessage(from, {
        text: `🎯 Alvo identificado!\n📍 Região: ${regiao}\n💻 Provedor: ${provedor}\n📱 Dispositivo: ${dispositivo}\n⚠️ Vulnerabilidade encontrada!\n💣 Iniciando ataque em breve...`,
        mentions: [alvo],
      })
    }, 3000)

    trackUtility("bombardeio", "success", { target: alvo })
    return true
  }

  if (cmd.startsWith(prefix + "gay") && mentioned[0]) {
    const alvo = mentioned[0]
    const numero = alvo.split("@")[0]
    const p = Math.floor(Math.random() * 101)
    await sock.sendMessage(from, { text: `@${numero} é ${p}% gay 🌈`, mentions: [alvo] })
    trackUtility("gay", "success", { target: alvo })
    return true
  }

  if (cmd.startsWith(prefix + "gado") && mentioned[0]) {
    const alvo = mentioned[0]
    const numero = alvo.split("@")[0]
    const p = Math.floor(Math.random() * 101)
    await sock.sendMessage(from, { text: `@${numero} é ${p}% gado 🐂`, mentions: [alvo] })
    trackUtility("gado", "success", { target: alvo })
    return true
  }

  if (cmd.startsWith(prefix + "ship") && mentioned.length >= 2) {
    const p1 = mentioned[0]
    const p2 = mentioned[1]
    const n1 = p1.split("@")[0]
    const n2 = p2.split("@")[0]
    const chance = Math.floor(Math.random() * 101)
    await sock.sendMessage(from, {
      text: `💘 @${n1} + @${n2} = ${chance}%`,
      mentions: [p1, p2],
    })
    trackUtility("ship", "success", { targetA: p1, targetB: p2 })
    return true
  }

  if (cmd === prefix + "treta" && isGroup) {
    const metadata = await sock.groupMetadata(from)
    const botJid = jidNormalizedUser(sock.user?.id || "")
    const participantes = (metadata?.participants || [])
      .map((p) => jidNormalizedUser(p.id))
      .filter((id) => id && id !== botJid)
    if (participantes.length < 2) {
      trackUtility("treta", "rejected", { reason: "insufficient-participants" })
      await sock.sendMessage(from, {
        text: "Não foi possível iniciar a treta: participantes insuficientes.",
      })
      return true
    }
    const p1 = participantes[Math.floor(Math.random() * participantes.length)]
    let p2 = participantes[Math.floor(Math.random() * participantes.length)]
    while (p1 === p2) p2 = participantes[Math.floor(Math.random() * participantes.length)]
    const n1 = p1.split("@")[0]
    const n2 = p2.split("@")[0]

    const motivos = [
      "brigaram por causa de comida",
      "discutiram por causa de mulher",
      `treta começou pois @${n1} tentou ver a pasta trancada de @${n2}`,
      "um chamou o outro de feio kkkkkkkkkkkk",
      "disputa de ego gigantesca",
      `treta começou pois @${n1} falou que era mais forte que @${n2}`,
      "um deve dinheiro pro outro(so tem caloteiro aqui)",
      "brigaram pra ver quem tem o maior pinto",
    ]

    const motivo = motivos[Math.floor(Math.random() * motivos.length)]

    if (motivo === "brigaram pra ver quem tem o maior pinto") {
      const vencedor = Math.random() < 0.5 ? p1 : p2
      const perdedor = vencedor === p1 ? p2 : p1
      const nv = vencedor.split("@")[0]
      const np = perdedor.split("@")[0]
      const tamanhoVencedor = (Math.random() * 20 + 5).toFixed(1)
      const tamanhoPerdedor = (Math.random() * 23 - 20).toFixed(1)
      const finais = [
        `@${np} tem o menor micro pênis já registrado da história! (${tamanhoPerdedor}cm)`,
        `@${nv} ganhou com seus incríveis ${tamanhoVencedor} centímetros!`,
      ]
      const resultado = finais[Math.floor(Math.random() * finais.length)]
      await sock.sendMessage(from, {
        text: `Ih, os corno começaram a tretar\n\n@${n1} VS @${n2}\n\nMotivo: ${motivo}\nResultado: ${resultado}`,
        mentions: [p1, p2],
      })
      trackUtility("treta", "success", { players: [p1, p2] })
      return true
    }

    const resultados = [
      `@${n1} saiu chorando`,
      `@${n2} ficou de xereca`,
      "deu empate, briguem dnv fazendo favor",
      `@${n1} ganhou`,
      `@${n2} pediu arrego`,
    ]
    const resultado = resultados[Math.floor(Math.random() * resultados.length)]
    await sock.sendMessage(from, {
      text: `Ih, os corno começaram a tretar\n\n@${n1} VS @${n2}\n\nMotivo: ${motivo}\nResultado: ${resultado}`,
      mentions: [p1, p2],
    })
    trackUtility("treta", "success", { players: [p1, p2] })
    return true
  }

  return false
}

module.exports = {
  handleUtilityCommands,
}
