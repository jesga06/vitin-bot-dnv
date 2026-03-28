const telemetry = require("../services/telemetryService")

const pendingPrivateFeedbackBySender = new Map()

async function handleUtilityCommands(ctx) {
  const {
    sock,
    from,
    sender,
    rawText,
    isCommand,
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
    isOverrideSender,
    isKnownOverrideSender,
    overrideJid,
    registrationService,
    botHasGroupAdminPrivileges,
  } = ctx

  const buildCommandManualPages = ({ section = "todos", detailed = false } = {}) => {
    const SECTION_LABELS = {
      menu: "Menu e Utilitarios",
      jogos: "Jogos e Lobbies",
      partidas: "Fluxo de Partidas",
      economia: "Economia Base",
      avancado: "Economia Avancada e Moderacao",
      ocultos: "Ocultos e Restritos",
    }

    const sections = {
      menu: [
        { cmd: `${prefix}feedback`, usage: `${prefix}feedback`, effect: "links para feedback e report de bugs", badges: ["GERAL"] },
        { cmd: `${prefix}feedbackpriv`, usage: `${prefix}feedbackpriv`, effect: "captura a proxima mensagem e envia feedback no privado para override", badges: ["GERAL"] },
        { cmd: `${prefix}menu`, usage: `${prefix}menu`, effect: "abre o menu principal", badges: ["GERAL"] },
        { cmd: `${prefix}ping`, usage: `${prefix}ping`, effect: "mede latencia", badges: ["GERAL"] },
        { cmd: `${prefix}s`, aliases: [`${prefix}fig`, `${prefix}sticker`, `${prefix}f`], usage: `${prefix}s (com midia)`, effect: "converte em figurinha", badges: ["GERAL"] },
        { cmd: `${prefix}register`, usage: `${prefix}register`, effect: "cadastra usuario", badges: ["GRUPO"] },
        { cmd: `${prefix}unregister`, usage: `${prefix}unregister`, effect: "remove cadastro", badges: ["GRUPO"] },
        { cmd: `${prefix}jid`, usage: `${prefix}jid`, effect: "mostra IDs do remetente", badges: ["DM", "OCULTO"] },
        { cmd: `${prefix}punicoeslista`, aliases: [`${prefix}puniçõeslista`], usage: `${prefix}punicoeslista`, effect: "envia lista detalhada no privado", badges: ["GERAL"] },
        { cmd: `${prefix}roleta`, usage: `${prefix}roleta`, effect: "sorteia participante", badges: ["GRUPO"] },
        { cmd: `${prefix}ship`, usage: `${prefix}ship @a @b`, effect: "compatibilidade aleatoria", badges: ["GRUPO"] },
      ],
      jogos: [
        { cmd: `${prefix}jogos`, usage: `${prefix}jogos`, effect: "menu de jogos", badges: ["GRUPO"] },
        { cmd: `${prefix}jogos stats`, usage: `${prefix}jogos stats`, effect: "stats de jogos", badges: ["GRUPO"] },
        { cmd: `${prefix}brincadeiras`, usage: `${prefix}brincadeiras`, effect: "submenu de brincadeiras", badges: ["GRUPO"] },
        { cmd: `${prefix}comecar`, aliases: [`${prefix}começar`, `${prefix}start`], usage: `${prefix}comecar <jogo|LobbyID>`, effect: "cria/inicia lobby", badges: ["GRUPO"] },
        { cmd: `${prefix}entrar`, aliases: [`${prefix}join`], usage: `${prefix}entrar <LobbyID>`, effect: "entra no lobby", badges: ["GRUPO"] },
        { cmd: `${prefix}lobbies`, usage: `${prefix}lobbies`, effect: "lista lobbies", badges: ["GRUPO"] },
        { cmd: `${prefix}moeda`, usage: `${prefix}moeda`, effect: "inicia cara ou coroa", badges: ["GRUPO"] },
        { cmd: `${prefix}streak`, usage: `${prefix}streak [@usuario]`, effect: "mostra streak atual", badges: ["GRUPO"] },
        { cmd: `${prefix}streakranking`, usage: `${prefix}streakranking`, effect: "ranking de streak", badges: ["GRUPO"] },
      ],
      partidas: [
        { cmd: `${prefix}resposta`, usage: `${prefix}resposta <numero>`, effect: "chute na adivinhacao", badges: ["GRUPO"] },
        { cmd: `${prefix}aposta`, usage: `${prefix}aposta <LobbyID> <1-10|skip>`, effect: "define bet por jogador no lobby", badges: ["GRUPO"] },
        { cmd: `${prefix}passa`, usage: `${prefix}passa @usuario`, effect: "passa batata", badges: ["GRUPO"] },
        { cmd: `${prefix}rolar`, usage: `${prefix}rolar`, effect: "rola dado", badges: ["GRUPO"] },
        { cmd: `${prefix}atirar`, usage: `${prefix}atirar`, effect: "turno da roleta russa", badges: ["GRUPO"] },
        { cmd: `${prefix}embaralhado`, usage: `${prefix}embaralhado`, effect: "inicia jogo embaralhado", badges: ["GRUPO"] },
        { cmd: `${prefix}comecar memoria`, aliases: [`${prefix}começar memória`], usage: `${prefix}comecar memoria`, effect: "inicia memoria", badges: ["GRUPO"] },
        { cmd: `${prefix}comecar reacao`, aliases: [`${prefix}começar reação`], usage: `${prefix}comecar reacao`, effect: "inicia reacao", badges: ["GRUPO"] },
        { cmd: `${prefix}comecar comando`, aliases: [`${prefix}começar comando`], usage: `${prefix}comecar comando`, effect: "inicia comando", badges: ["GRUPO"] },
      ],
      economia: [
        { cmd: `${prefix}economia`, usage: `${prefix}economia`, effect: "menu de economia", badges: ["GERAL"] },
        { cmd: `${prefix}perfil`, usage: `${prefix}perfil [@usuario]`, effect: "saldo, inventario, buffs, nivel e XP", badges: ["GERAL"] },
        { cmd: `${prefix}perfil stats`, usage: `${prefix}perfil stats`, effect: "estatisticas economicas", badges: ["GERAL"] },
        { cmd: `${prefix}xp`, usage: `${prefix}xp`, effect: "atalho para visualizar progressao de XP", badges: ["GERAL"] },
        { cmd: `${prefix}missao`, usage: `${prefix}missao | ${prefix}missao claim <Q1|Q2|Q3>`, effect: "missoes diarias", badges: ["GERAL"] },
        { cmd: `${prefix}extrato`, usage: `${prefix}extrato [@usuario]`, effect: "ultimas transacoes", badges: ["GERAL"] },
        { cmd: `${prefix}coinsranking`, usage: `${prefix}coinsranking`, effect: "ranking de moedas", badges: ["GRUPO"] },
        { cmd: `${prefix}xpranking`, usage: `${prefix}xpranking`, effect: "ranking de XP", badges: ["GRUPO"] },
        { cmd: `${prefix}loja`, usage: `${prefix}loja`, effect: "catalogo da loja", badges: ["GERAL"] },
        { cmd: `${prefix}comprar`, usage: `${prefix}comprar <item|indice> [qtd]`, effect: "compra item", badges: ["GERAL"] },
        { cmd: `${prefix}vender`, usage: `${prefix}vender <item> [qtd]`, effect: "vende item", badges: ["GERAL"] },
        { cmd: `${prefix}doarcoins`, usage: `${prefix}doarcoins @usuario [qtd]`, effect: "transfere moedas", badges: ["GRUPO"] },
        { cmd: `${prefix}doaritem`, usage: `${prefix}doaritem @usuario <item> [qtd]`, effect: "transfere item", badges: ["GRUPO"] },
        { cmd: `${prefix}daily`, usage: `${prefix}daily`, effect: "recompensa diaria", badges: ["GERAL"] },
        { cmd: `${prefix}carepackage`, usage: `${prefix}carepackage`, effect: "pacote de ajuda", badges: ["GERAL"] },
        { cmd: `${prefix}cassino`, usage: `${prefix}cassino`, effect: "regras do cassino", badges: ["GERAL"] },
        { cmd: `${prefix}cupom`, usage: `${prefix}cupom criar|resgatar ...`, effect: "cupons por grupo", badges: ["GRUPO"] },
        { cmd: `${prefix}deletarconta`, aliases: [`${prefix}deleteconta`], usage: `${prefix}deletarconta confirmar -> frase exata`, effect: "exclui sua conta em 2 etapas", badges: ["GERAL"] },
      ],
      avancado: [
        { cmd: `${prefix}trade`, usage: `${prefix}trade @usuario <coins> [item:qtd...]`, effect: "abre trade", badges: ["GRUPO"] },
        { cmd: `${prefix}trade respond`, usage: `${prefix}trade respond <tradeId> <coins> [item:qtd...]`, effect: "contraoferta", badges: ["GRUPO"] },
        { cmd: `${prefix}trade review`, usage: `${prefix}trade review <tradeId>`, effect: "confirma leitura", badges: ["GRUPO"] },
        { cmd: `${prefix}trade accept/counter/reject`, usage: `${prefix}trade accept|counter|reject <tradeId> ...`, effect: "decide trade", badges: ["GRUPO"] },
        { cmd: `${prefix}trade list/info`, usage: `${prefix}trade list | ${prefix}trade info <tradeId>`, effect: "consulta trades", badges: ["GRUPO"] },
        { cmd: `${prefix}team create/invite/accept/members/info/stats/leave/list`, usage: `${prefix}team <acao> ...`, effect: "gerencia times", badges: ["GRUPO"] },
        { cmd: `${prefix}falsificar`, usage: `${prefix}falsificar <tipo 1-13> [sev] [qtd] [S|N]`, effect: "fabrica passe de punicao", badges: ["GRUPO"] },
        { cmd: `${prefix}lootbox`, usage: `${prefix}lootbox <qtd>`, effect: "abre lootboxes", badges: ["GRUPO"] },
        { cmd: `${prefix}loteria`, usage: `${prefix}loteria \"titulo\" \"recompensas\" <S|N> <vencedores>`, effect: "gerencia loteria", badges: ["GRUPO", "OVERRIDE"] },
        { cmd: `${prefix}setcoins`, usage: `${prefix}setcoins [@usuario] <qtd>`, effect: "define saldo", badges: ["GRUPO", "OVERRIDE"] },
        { cmd: `${prefix}addcoins`, usage: `${prefix}addcoins [@usuario] <qtd>`, effect: "adiciona moedas", badges: ["GRUPO", "OVERRIDE"] },
        { cmd: `${prefix}removecoins`, usage: `${prefix}removecoins [@usuario] <qtd>`, effect: "remove moedas", badges: ["GRUPO", "OVERRIDE"] },
        { cmd: `${prefix}additem`, usage: `${prefix}additem [@usuario] <item> <qtd>`, effect: "adiciona item", badges: ["GRUPO", "OVERRIDE"] },
        { cmd: `${prefix}removeitem`, usage: `${prefix}removeitem [@usuario] <item> <qtd>`, effect: "remove item", badges: ["GRUPO", "OVERRIDE"] },
        { cmd: `${prefix}adm`, usage: `${prefix}adm`, effect: "menu admin", badges: ["GRUPO", "ADMIN"] },
        { cmd: `${prefix}admeconomia`, usage: `${prefix}admeconomia`, effect: "menu admin economia", badges: ["GRUPO", "OVERRIDE"] },
        { cmd: `${prefix}mute/unmute/ban`, usage: `${prefix}mute|unmute|ban @usuario`, effect: "modera usuario", badges: ["GRUPO", "ADMIN"] },
        { cmd: `${prefix}adminadd/adminrm`, usage: `${prefix}adminadd|adminrm @usuario`, effect: "promove/remove admin", badges: ["GRUPO", "ADMIN"] },
        { cmd: `${prefix}filtros/filtroadd/filtroremove`, usage: `${prefix}filtros | ${prefix}filtroadd <texto> | ${prefix}filtroremove <idx>`, effect: "gerencia filtros", badges: ["GRUPO", "ADMIN"] },
      ],
      ocultos: [
        { cmd: `${prefix}comandosfull`, usage: `${prefix}comandosfull [secao|todos] [detalhes]`, effect: "manual completo", badges: ["DM", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}manutencao`, aliases: [`${prefix}manutenção`], usage: `${prefix}manutencao`, effect: "toggle de manutencao global por grupo de origem", badges: ["GRUPO", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}toggleover`, usage: `${prefix}toggleover`, effect: "liga/desliga checks de override", badges: ["DM", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}vaultkey`, usage: `${prefix}vaultkey`, effect: "senha para export de .data", badges: ["DM", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}msg`, usage: `${prefix}msg <aviso|update> <S|N>`, effect: "broadcast guiado", badges: ["OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}toggleoverride`, usage: `${prefix}toggleoverride [indice]`, effect: "liga/desliga perfil override", badges: ["DM", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}overrideadd`, usage: `${prefix}overrideadd <perfil>`, effect: "fluxo de JIDs para perfil", badges: ["DM", "HARDCODED", "OCULTO"] },
        { cmd: `${prefix}addoverride`, usage: `${prefix}addoverride @usuario`, effect: "adicao rapida ao perfil manual", badges: ["DM", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}removeoverride`, usage: `${prefix}removeoverride @usuario`, effect: "remove de perfis override", badges: ["DM", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}overridelist`, usage: `${prefix}overridelist`, effect: "status dos perfis/grupos", badges: ["DM", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}overridegroup`, usage: `${prefix}overridegroup <perfil> <add|rm|list> [groupJid]`, effect: "mapeia grupos por perfil", badges: ["DM", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}jidsgrupo`, usage: `${prefix}jidsgrupo @user1 @user2`, effect: "envia JIDs normalizados no DM", badges: ["GRUPO", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}wipeeconomia`, aliases: [`${prefix}wipeeconomy`], usage: `${prefix}wipeeconomia`, effect: "wipe interativo total/perfis", badges: ["DM", "HARDCODED", "OCULTO"] },
        { cmd: `${prefix}nuke`, usage: `${prefix}nuke`, effect: "limpa punicoes do proprio override", badges: ["GRUPO", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}overridetest`, usage: `${prefix}overridetest`, effect: "teste de punicoes no proprio remetente", badges: ["GRUPO", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}criarcupom`, usage: `${prefix}criarcupom @usuario <1-100>`, effect: "gera cupom de desconto para usuario", badges: ["OVERRIDE", "OCULTO"] },
      ],
    }

    const allSectionKeys = ["menu", "jogos", "partidas", "economia", "avancado", "ocultos"]
    const normalizedSection = String(section || "todos").trim().toLowerCase()
    const requestedKeys = normalizedSection === "todos"
      ? allSectionKeys
      : allSectionKeys.includes(normalizedSection)
        ? [normalizedSection]
        : []

    const renderEntry = (entry) => {
      const aliasText = Array.isArray(entry.aliases) && entry.aliases.length > 0
        ? ` (aliases: ${entry.aliases.join(" | ")})`
        : ""
      const badgeText = (entry.badges || []).map((badge) => `[${badge}]`).join(" ")
      const lines = [
        `- ${entry.cmd}${aliasText} ${badgeText}`.trim(),
        `  Uso: ${entry.usage}`,
        `  Faz: ${entry.effect}`,
      ]
      if (detailed && entry.notes) {
        lines.push(`  Nota: ${entry.notes}`)
      }
      return lines.join("\n")
    }

    const indexPage = [
      "Manual de comandos",
      "",
      "Legenda de acesso:",
      "[GERAL] [GRUPO] [DM] [ADMIN] [OVERRIDE] [HARDCODED] [OCULTO] [DESATIVADO]",
      "",
      `Sintaxe: ${prefix}comandosfull [secao|todos] [detalhes]`,
      "Secoes disponiveis:",
      ...allSectionKeys.map((key) => `- ${key}: ${SECTION_LABELS[key]}`),
      "",
      `Exemplos: ${prefix}comandosfull economia | ${prefix}comandosfull ocultos detalhes`,
    ].join("\n")

    if (requestedKeys.length === 0) {
      return [
        indexPage,
        `Secao invalida: *${normalizedSection}*. Use uma das secoes listadas acima.`,
      ]
    }

    const pages = [indexPage]
    for (const key of requestedKeys) {
      const header = `=== ${SECTION_LABELS[key]} (${key}) ===`
      const body = (sections[key] || []).map(renderEntry).join("\n\n")
      pages.push(`${header}\n\n${body}`)
    }
    return pages
  }

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

╭━━━〔 🛠️ FEEDBACK 〕━━━╮
│ ${prefix}feedback
│ ${prefix}feedbackpriv
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 🎨 FIGURINHAS 〕━━━╮
│ ${prefix}s / ${prefix}fig / ${prefix}sticker / ${prefix}f
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 🎮 PASSATEMPOS 〕━━━╮
│ ${prefix}brincadeiras
│ ${prefix}jogos 
│ ${prefix}economia 
│ ${prefix}punicoeslista
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 👤 CONTA 〕━━━╮
│ ${prefix}register
│ ${prefix}unregister
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 ⚡ ADM 〕━━━╮
│ ${prefix}adm
│ ${prefix}admeconomia
╰━━━━━━━━━━━━━━━━━━━━╯`,
    })
    return true
  }

  if (cmd === prefix + "feedback") {
    trackUtility("feedback", "success")
    await sock.sendMessage(from, {
      text:
`📣 Feedback e reporte de problemas

Se algo não estiver funcionando direito, envie feedback para:
- Jessé: wa.me/+5521995409899
- Vitin: wa.me/+557398579450`,
    })
    return true
  }

  if (cmd === prefix + "feedbackpriv") {
    pendingPrivateFeedbackBySender.set(sender, {
      createdAt: Date.now(),
      sourceIsGroup: Boolean(isGroup),
    })
    trackUtility("feedbackpriv", "armed", { sourceIsGroup: Boolean(isGroup) })
    await sock.sendMessage(from, {
      text:
`✅ Modo feedback privado ativado.

Envie seu feedback e eu vou encaminhar para um dos donos no privado.
Somente a próxima mensagem é capturada nesse fluxo.`,
    })
    return true
  }

  const pendingPrivateFeedback = pendingPrivateFeedbackBySender.get(sender)
  if (pendingPrivateFeedback && cmd !== prefix + "feedbackpriv") {
    pendingPrivateFeedbackBySender.delete(sender)

    const feedbackText = String(rawText || "").trim()
    if (!feedbackText) {
      trackUtility("feedbackpriv", "rejected", { reason: "empty-message" })
      await sock.sendMessage(from, {
        text: "Não recebi texto para encaminhar no feedback privado.",
      })
      return true
    }

    const overrideTarget = String(overrideJid || "").trim()
    if (!overrideTarget) {
      trackUtility("feedbackpriv", "error", { reason: "missing-override-jid" })
      await sock.sendMessage(from, {
        text: "Feedback privado indisponível no momento: não pude encontrar o destino.",
      })
      return true
    }

    const sourceLabel = pendingPrivateFeedback.sourceIsGroup ? "grupo" : "privado"
    const commandLabel = isCommand ? "S" : "N"
    await sock.sendMessage(overrideTarget, {
      text:
`📩 FEEDBACK PRIVADO
Origem: ${sourceLabel}
Comando: ${commandLabel}

${feedbackText}`,
    })
    await sock.sendMessage(from, {
      text: "Feedback privado enviado com sucesso.",
    })
    trackUtility("feedbackpriv", "success", {
      sourceIsGroup: pendingPrivateFeedback.sourceIsGroup,
      feedbackLength: feedbackText.length,
    })
    return true
  }

  if (cmd.startsWith(prefix + "comandosfull")) {
    if (isGroup) return false
    const canReadHiddenManual = Boolean(isKnownOverrideSender || isOverrideSender)
    if (!canReadHiddenManual) return false

    const cmdTokens = cmd.split(/\s+/).filter(Boolean)
    let section = "todos"
    let detailed = false

    for (let i = 1; i < cmdTokens.length; i++) {
      const token = String(cmdTokens[i] || "").trim().toLowerCase()
      if (!token) continue
      if (token === "detalhes" || token === "detalhe") {
        detailed = true
        continue
      }
      section = token
    }

    const pages = buildCommandManualPages({ section, detailed })
    for (const page of pages) {
      await sock.sendMessage(from, { text: page })
    }
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

  if (cmd === prefix + "ping") {
    const startedAt = Date.now()
    await sock.sendMessage(from, {
      text: "🏓 Pong! Medindo latência...",
    })
    const elapsedMs = Math.max(0, Date.now() - startedAt)
    await sock.sendMessage(from, {
      text: `Latência de resposta: *${elapsedMs}ms*`,
    })
    trackUtility("ping", "success", { latencyMs: elapsedMs })
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
    if (!isGroup && !registrationService?.isRegistered?.(sender)) {
      trackUtility("sticker", "rejected", { reason: "dm-unregistered" })
      await sock.sendMessage(from, {
        text: `Este comando no privado exige cadastro. Use *${prefix}register* primeiro.`,
      })
      return true
    }

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
  __resetUtilityRouterStateForTests: () => {
    pendingPrivateFeedbackBySender.clear()
  },
}
