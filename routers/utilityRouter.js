const telemetry = require("../services/telemetryService")
const { getCommandHelp, getPublicCommandNames } = require("../commandHelp")
const os = require("os")
const child_process = require("child_process")
const { normalizeUserId } = require("../services/registrationService")
const { normalizeMentionJid, getFirstMentionedJid, normalizeMentionArray, getMentionHandleFromJid, formatMentionTag } = require("../services/mentionService")

const pendingPrivateFeedbackBySender = new Map()
const pendingQuestionBySender = new Map()
const pendingQuestionReplyBySender = new Map()
const questionInboxById = new Map()
const pendingEnqueteBySender = new Map()
const pendingEnqueteReplyBySender = new Map()
const enqueteInboxById = new Map()
const pendingBugReportBySender = new Map()

const BUG_BOUNTY_STATE_GROUP_ID = "__system__"
const BUG_BOUNTY_STATE_KEY = "bugBountyState"
const BUG_BOUNTY_PRIORITY_PAYOUT = Object.freeze({
  1: 250,
  2: 500,
  3: 1000,
  4: 2000,
  5: 4000,
})
const BUG_BOUNTY_IGNORE_REASONS = Object.freeze({
  NR: "nao reproduzivel",
  DUP: "duplicado",
  CAT: "categoria incorreta",
  DET: "detalhes insuficientes",
  FAKE: "reporte falso",
})

let bugBountyStateFallback = { reports: {} }

function generateQuestionId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let generated = ""
  for (let i = 0; i < 5; i++) {
    generated += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return generated
}

function allocateQuestionId() {
  let questionId = generateQuestionId()
  while (questionInboxById.has(questionId)) {
    questionId = generateQuestionId()
  }
  return questionId
}

function allocateEnqueteId() {
  let enqueteId = generateQuestionId()
  while (enqueteInboxById.has(enqueteId)) {
    enqueteId = generateQuestionId()
  }
  return enqueteId
}

function buildEmptyBugBountyState() {
  return { reports: {} }
}

function normalizeBugPriority(value, fallback = 1) {
  const parsed = Number.parseInt(String(value || "").trim(), 10)
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 5) {
    return parsed
  }
  return fallback
}

function normalizeTimestamp(value, fallback = 0) {
  const parsed = Math.floor(Number(value) || 0)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return parsed
}

function normalizeBugReportRecord(raw = {}, reportId = "") {
  const idFromRecord = String(raw?.id || "").trim()
  const id = /^\d{5}$/.test(String(reportId || "").trim())
    ? String(reportId || "").trim()
    : (/^\d{5}$/.test(idFromRecord) ? idFromRecord : "")
  if (!id) return null

  const reporter = String(raw?.reporter || raw?.reporterJid || "").trim().toLowerCase()
  if (!reporter) return null

  const reportedPriority = normalizeBugPriority(raw?.reportedPriority ?? raw?.priority, 1)
  const finalPriority = normalizeBugPriority(raw?.finalPriority, reportedPriority)
  const statusRaw = String(raw?.status || "open").trim().toLowerCase()
  const status = statusRaw === "closed" ? "closed" : "open"

  const resolutionRaw = String(raw?.resolution || "").trim().toLowerCase()
  const resolution = status === "closed" && (resolutionRaw === "fixed" || resolutionRaw === "ignored")
    ? resolutionRaw
    : ""

  const ignoreReasonRaw = String(raw?.ignoreReason || raw?.closeReason || "").trim().toUpperCase()
  const ignoreReason = BUG_BOUNTY_IGNORE_REASONS[ignoreReasonRaw] ? ignoreReasonRaw : ""

  return {
    id,
    reporter,
    reportedPriority,
    finalPriority,
    description: String(raw?.description || "").trim(),
    status,
    resolution,
    ignoreReason,
    closeNote: String(raw?.closeNote || "").trim(),
    createdAt: normalizeTimestamp(raw?.createdAt, Date.now()),
    closedAt: normalizeTimestamp(raw?.closedAt, 0),
    closedBy: String(raw?.closedBy || "").trim().toLowerCase(),
    payoutCoins: Math.max(0, Math.floor(Number(raw?.payoutCoins) || 0)),
    creditedAt: normalizeTimestamp(raw?.creditedAt, 0),
    totalCreditedCoins: Math.max(0, Math.floor(Number(raw?.totalCreditedCoins) || 0)),
    lastInfoRequestedAt: normalizeTimestamp(raw?.lastInfoRequestedAt, 0),
    lastInfoRequestedBy: String(raw?.lastInfoRequestedBy || "").trim().toLowerCase(),
    reopenedAt: normalizeTimestamp(raw?.reopenedAt, 0),
    reopenedBy: String(raw?.reopenedBy || "").trim().toLowerCase(),
    reopenCount: Math.max(0, Math.floor(Number(raw?.reopenCount) || 0)),
  }
}

function normalizeBugBountyState(raw = null) {
  const state = raw && typeof raw === "object" ? raw : {}
  const rawReports = state.reports && typeof state.reports === "object" ? state.reports : {}
  const reports = {}

  for (const [reportId, reportRaw] of Object.entries(rawReports)) {
    const normalized = normalizeBugReportRecord(reportRaw, reportId)
    if (!normalized) continue
    reports[normalized.id] = normalized
  }

  return { reports }
}

function getBugBountyState(storage) {
  if (typeof storage?.getGameState !== "function") {
    return normalizeBugBountyState(bugBountyStateFallback)
  }
  const raw = storage.getGameState(BUG_BOUNTY_STATE_GROUP_ID, BUG_BOUNTY_STATE_KEY)
  return normalizeBugBountyState(raw)
}

function setBugBountyState(storage, state) {
  const normalized = normalizeBugBountyState(state)
  if (typeof storage?.setGameState === "function") {
    storage.setGameState(BUG_BOUNTY_STATE_GROUP_ID, BUG_BOUNTY_STATE_KEY, normalized)
    return
  }
  bugBountyStateFallback = normalized
}

function generateBugReportId() {
  const randomNumber = Math.floor(Math.random() * 100000)
  return String(randomNumber).padStart(5, "0")
}

function allocateBugReportId(state = null) {
  const reports = state?.reports && typeof state.reports === "object" ? state.reports : {}
  let id = generateBugReportId()
  let safety = 0
  while (reports[id] && safety < 100000) {
    id = generateBugReportId()
    safety += 1
  }
  if (reports[id]) {
    return String(Date.now()).replace(/\D+/g, "").slice(-5).padStart(5, "0")
  }
  return id
}

function canonicalizeBugReporterId(userId = "", registrationService, jidNormalizedUser) {
  const normalizedByRegistration = typeof registrationService?.normalizeUserId === "function"
    ? registrationService.normalizeUserId(userId)
    : normalizeUserId(userId)
  const normalizedByJid = typeof jidNormalizedUser === "function"
    ? jidNormalizedUser(userId)
    : ""

  return String(normalizedByRegistration || normalizedByJid || userId || "")
    .trim()
    .toLowerCase()
}

function buildBugReporterCandidates(userId = "", registrationService, jidNormalizedUser) {
  const candidates = new Set()
  const addCandidate = (value) => {
    const normalized = canonicalizeBugReporterId(value, registrationService, jidNormalizedUser)
    if (normalized) candidates.add(normalized)
  }

  addCandidate(userId)

  if (typeof registrationService?.getUserIdAliases === "function") {
    const aliases = registrationService.getUserIdAliases(userId)
    for (const alias of aliases) addCandidate(alias)
  }

  return candidates
}

function getBugBountyIdentityLabel(userId = "", options = {}) {
  const economyService = options?.economyService
  const registrationService = options?.registrationService
  const normalizedUserId = String(userId || "").trim().toLowerCase()

  const mentionOptIn = typeof economyService?.isMentionOptIn === "function"
    ? economyService.isMentionOptIn(normalizedUserId)
    : true

  const profile = typeof economyService?.getProfile === "function"
    ? economyService.getProfile(normalizedUserId)
    : null
  const customLabel = String(profile?.preferences?.publicLabel || "").trim()
  const registeredEntry = typeof registrationService?.getRegisteredEntry === "function"
    ? registrationService.getRegisteredEntry(normalizedUserId)
    : null
  const knownName = String(registeredEntry?.lastKnownName || "").trim()
  const stableLabel = typeof economyService?.getStablePublicLabel === "function"
    ? economyService.getStablePublicLabel(normalizedUserId)
    : (getMentionHandleFromJid(normalizedUserId) || "Jogador")

  const fallbackLabel = customLabel || knownName || stableLabel || "Jogador"
  const mentionJid = normalizeMentionJid(normalizedUserId)

  if (mentionOptIn && mentionJid) {
    const tag = getMentionHandleFromJid(mentionJid).split(":")[0]
    if (tag) {
      return {
        label: `@${tag}`,
        mentionId: mentionJid,
      }
    }
  }

  return {
    label: fallbackLabel,
    mentionId: null,
  }
}

function getBugBountyListFilter(value = "") {
  const normalized = String(value || "").trim().toLowerCase()
  if (!normalized) return "open"
  if (["open", "closed", "fixed", "ignored"].includes(normalized)) {
    return normalized
  }
  return ""
}

function getBugBountyIgnoreReasonLabel(reasonCode = "") {
  const normalized = String(reasonCode || "").trim().toUpperCase()
  return BUG_BOUNTY_IGNORE_REASONS[normalized] || "motivo nao especificado"
}

function getBugBountyPriorityLabel(priority = 1) {
  return `P${normalizeBugPriority(priority, 1)}`
}

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
    storage,
    economyService,
    registrationService,
    botHasGroupAdminPrivileges,
    isYesToken,
    isNoToken,
    isQuitToken,
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
        { cmd: `${prefix}ajuda`, aliases: [`${prefix}duvida`], usage: `${prefix}ajuda <comando>`, effect: "explica como usar um comando", badges: ["GERAL"] },
        { cmd: `${prefix}pergunta`, usage: `${prefix}pergunta`, effect: "captura a proxima mensagem como pergunta privada com protocolo", badges: ["DM"] },
        { cmd: `${prefix}feedback`, usage: `${prefix}feedback`, effect: "links para feedback e report de bugs", badges: ["GERAL"] },
        { cmd: `${prefix}feedbackpriv`, usage: `${prefix}feedbackpriv`, effect: "captura a proxima mensagem e envia feedback no privado para override", badges: ["GERAL"] },
        { cmd: `${prefix}bugbounty`, usage: `${prefix}bugbounty | ${prefix}bugbounty reportar <1-5>`, effect: "menu e fluxo de reporte de bugs", badges: ["GERAL", "DM"] },
        { cmd: `${prefix}menu`, usage: `${prefix}menu`, effect: "abre o menu principal", badges: ["GERAL"] },
        { cmd: `${prefix}perf`, usage: `${prefix}perf`, effect: "mede latencia", badges: ["GERAL"] },
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
        { cmd: `${prefix}missaosemanal`, usage: `${prefix}missaosemanal | ${prefix}missaosemanal claim <W1|W2|W3|W4|W5>`, effect: "missoes semanais", badges: ["GERAL"] },
        { cmd: `${prefix}extrato`, usage: `${prefix}extrato [@usuario]`, effect: "ultimas transacoes", badges: ["GERAL"] },
        { cmd: `${prefix}mentions`, aliases: [`${prefix}mention`], usage: `${prefix}mentions [on|off]`, effect: "controle de mencoes em rankings", badges: ["GERAL"] },
        { cmd: `${prefix}apelido`, usage: `${prefix}apelido [novo_nome]`, effect: "define apelido publico", badges: ["GERAL"] },
        { cmd: `${prefix}coinsranking`, usage: `${prefix}coinsranking`, effect: "ranking de moedas", badges: ["GRUPO"] },
        { cmd: `${prefix}xpranking`, usage: `${prefix}xpranking`, effect: "ranking de XP", badges: ["GRUPO"] },
        { cmd: `${prefix}loja`, usage: `${prefix}loja`, effect: "catalogo da loja", badges: ["GERAL"] },
        { cmd: `${prefix}comprar`, usage: `${prefix}comprar <item|id> [qtd]`, effect: "compra item", badges: ["GERAL"] },
        { cmd: `${prefix}comprarpara`, usage: `${prefix}comprarpara @usuario <item|id> [qtd]`, effect: "compra item para outro usuario", badges: ["GRUPO"] },
        { cmd: `${prefix}vender`, usage: `${prefix}vender <item> [qtd]`, effect: "vende item", badges: ["GERAL"] },
        { cmd: `${prefix}usaritem`, usage: `${prefix}usaritem <item>`, effect: "usa item do inventario", badges: ["GERAL"] },
        { cmd: `${prefix}doarcoins`, usage: `${prefix}doarcoins @usuario [qtd]`, effect: "transfere moedas", badges: ["GRUPO"] },
        { cmd: `${prefix}doaritem`, usage: `${prefix}doaritem @usuario <item> [qtd]`, effect: "transfere item", badges: ["GRUPO"] },
        { cmd: `${prefix}roubar`, usage: `${prefix}roubar @usuario`, effect: "tentativa de roubo com risco", badges: ["GRUPO"] },
        { cmd: `${prefix}daily`, usage: `${prefix}daily`, effect: "recompensa diaria", badges: ["GERAL"] },
        { cmd: `${prefix}carepackage`, usage: `${prefix}carepackage`, effect: "pacote de ajuda", badges: ["GERAL"] },
        { cmd: `${prefix}trabalho`, usage: `${prefix}trabalho <ifood|capinar|lavagem|aposta|minerar|bitcoin>`, effect: "atividade de renda com cooldown", badges: ["GERAL"] },
        { cmd: `${prefix}cassino`, usage: `${prefix}cassino`, effect: "regras do cassino", badges: ["GERAL"] },
        { cmd: `${prefix}lootbox`, usage: `${prefix}lootbox <qtd>`, effect: "abre lootboxes", badges: ["GERAL"] },
        { cmd: `${prefix}cupom`, usage: `${prefix}cupom criar|resgatar ...`, effect: "cupons por grupo", badges: ["GRUPO"] },
        { cmd: `${prefix}usarcupom`, usage: `${prefix}usarcupom <codigo>`, effect: "resgata cupom por codigo", badges: ["GERAL"] },
        { cmd: `${prefix}deletarconta`, aliases: [`${prefix}deleteconta`], usage: `${prefix}deletarconta confirmar -> frase exata`, effect: "exclui sua conta em 2 etapas", badges: ["GERAL"] },
        { cmd: `${prefix}loteria entrar`, usage: `${prefix}loteria entrar`, effect: "entrar em loteria opt-in ativa", badges: ["GRUPO"] },
        { cmd: `${prefix}loteria fechar`, usage: `${prefix}loteria fechar`, effect: "fechar participações (override apenas para sortear)", badges: ["GRUPO", "OVERRIDE"] },
        { cmd: `${prefix}timeranking`, usage: `${prefix}timeranking`, effect: "ranking de times por valor total", badges: ["GRUPO"] },
        { cmd: `${prefix}usarpasse`, usage: `${prefix}usarpasse @usuario <tipo> [severidade]`, effect: "consome passe de punicao", badges: ["GRUPO"] },
        { cmd: `${prefix}listaitens`, usage: `${prefix}listaitens [filtro]`, effect: "lista itens disponíveis na loja/inventário", badges: ["GERAL"] },
      ],
      avancado: [
        { cmd: `${prefix}trade`, usage: `${prefix}trade @usuario <coins> [item:qtd...]`, effect: "abre trade", badges: ["GRUPO"] },
        { cmd: `${prefix}trade respond`, usage: `${prefix}trade respond <tradeId> <coins> [item:qtd...]`, effect: "contraoferta", badges: ["GRUPO"] },
        { cmd: `${prefix}trade review`, usage: `${prefix}trade review <tradeId>`, effect: "confirma leitura", badges: ["GRUPO"] },
        { cmd: `${prefix}trade accept/counter/reject`, usage: `${prefix}trade accept|counter|reject <tradeId> ...`, effect: "decide trade", badges: ["GRUPO"] },
        { cmd: `${prefix}trade list/info`, usage: `${prefix}trade list | ${prefix}trade info <tradeId>`, effect: "consulta trades", badges: ["GRUPO"] },
        { cmd: `${prefix}time criar/convidar/aceitar/membros/info/estatisticas/sair/listar`, usage: `${prefix}time <acao> ...`, effect: "gerencia times", badges: ["GRUPO"] },
        { cmd: `${prefix}falsificar`, usage: `${prefix}falsificar <tipo 1-13> [sev] [qtd] [S|N]`, effect: "fabrica passe de punicao", badges: ["GRUPO"] },
        { cmd: `${prefix}lootbox`, usage: `${prefix}lootbox <qtd>`, effect: "abre lootboxes", badges: ["GRUPO"] },
        { cmd: `${prefix}loteria`, usage: `${prefix}loteria \"titulo\" \"recompensas\" <S|N> <vencedores>`, effect: "gerencia loteria", badges: ["GRUPO", "OVERRIDE"] },
        { cmd: `${prefix}loteria <ID> sortear`, usage: `${prefix}loteria <ID> sortear`, effect: "sorteio manual da loteria (override only)", badges: ["GRUPO", "OVERRIDE"] },
        { cmd: `${prefix}setcoins`, usage: `${prefix}setcoins [@usuario] <qtd>`, effect: "define saldo", badges: ["GRUPO", "OVERRIDE"] },
        { cmd: `${prefix}addcoins`, usage: `${prefix}addcoins [@usuario] <qtd>`, effect: "adiciona moedas", badges: ["GRUPO", "OVERRIDE"] },
        { cmd: `${prefix}removecoins`, usage: `${prefix}removecoins [@usuario] <qtd>`, effect: "remove moedas", badges: ["GRUPO", "OVERRIDE"] },
        { cmd: `${prefix}additem`, usage: `${prefix}additem [@usuario] <item> <qtd>`, effect: "adiciona item", badges: ["GRUPO", "OVERRIDE"] },
        { cmd: `${prefix}removeitem`, usage: `${prefix}removeitem [@usuario] <item> <qtd>`, effect: "remove item", badges: ["GRUPO", "OVERRIDE"] },
        { cmd: `${prefix}mudarapelido`, usage: `${prefix}mudarapelido @usuario <novo apelido>`, effect: "altera apelido publico de usuario", badges: ["GRUPO", "OVERRIDE"] },
        { cmd: `${prefix}cooldowns`, usage: `${prefix}cooldowns [list] | ${prefix}cooldowns reset [@usuario] <all|daily,work,cestabasica,steal,moeda>`, effect: "lista/reseta cooldowns", badges: ["GRUPO", "OVERRIDE"] },
        { cmd: `${prefix}adm`, usage: `${prefix}adm`, effect: "menu admin", badges: ["GRUPO", "ADMIN"] },
        { cmd: `${prefix}admeconomia`, usage: `${prefix}admeconomia`, effect: "menu admin economia", badges: ["GRUPO", "OVERRIDE"] },
        { cmd: `${prefix}mute/unmute/ban`, usage: `${prefix}mute|unmute|ban @usuario`, effect: "modera usuario", badges: ["GRUPO", "ADMIN"] },
        { cmd: `${prefix}adminadd/adminrm`, usage: `${prefix}adminadd|adminrm @usuario`, effect: "promove/remove admin", badges: ["GRUPO", "ADMIN"] },
        { cmd: `${prefix}filtros/filtroadd/filtroremove`, usage: `${prefix}filtros | ${prefix}filtroadd <texto> | ${prefix}filtroremove <idx>`, effect: "gerencia filtros", badges: ["GRUPO", "ADMIN"] },
      ],
      ocultos: [
        { cmd: `${prefix}comandosfull`, usage: `${prefix}comandosfull [secao|todos] [detalhes]`, effect: "manual completo", badges: ["DM", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}force`, usage: `${prefix}force @user <comando|args>`, effect: "executa comando como outro usuario (override only)", badges: ["GRUPO", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}manutencao`, aliases: [`${prefix}manutenção`], usage: `${prefix}manutencao`, effect: "toggle de manutencao global por grupo de origem", badges: ["GRUPO", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}toggleover`, usage: `${prefix}toggleover`, effect: "liga/desliga checks de override", badges: ["DM", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}vaultkey`, usage: `${prefix}vaultkey`, effect: "senha para export de .data", badges: ["DM", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}msg`, usage: `${prefix}msg <aviso|update> <N|T|A>`, effect: "broadcast guiado", badges: ["OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}toggleoverride`, usage: `${prefix}toggleoverride [indice]`, effect: "liga/desliga perfil override", badges: ["DM", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}overrideadd`, usage: `${prefix}overrideadd <perfil>`, effect: "fluxo de JIDs para perfil", badges: ["DM", "HARDCODED", "OCULTO"] },
        { cmd: `${prefix}addoverride`, usage: `${prefix}addoverride @usuario`, effect: "adicao rapida ao perfil manual", badges: ["DM", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}removeoverride`, usage: `${prefix}removeoverride @usuario`, effect: "remove de perfis override", badges: ["DM", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}overridelist`, usage: `${prefix}overridelist`, effect: "status dos perfis/grupos", badges: ["DM", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}overridegroup`, usage: `${prefix}overridegroup <perfil> <add|rm|list> [groupJid]`, effect: "mapeia grupos por perfil", badges: ["DM", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}overridegrupos`, usage: `${prefix}overridegrupos`, effect: "lista grupos conhecidos para override", badges: ["GRUPO", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}whois`, usage: `${prefix}whois <apelido>`, effect: "retorna numero e grupos em comum com o bot", badges: ["DM", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}find`, usage: `${prefix}find <numero>`, effect: "verifica se um numero esta no grupo atual", badges: ["GRUPO", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}jidsgrupo`, usage: `${prefix}jidsgrupo @user1 @user2`, effect: "envia JIDs normalizados no DM", badges: ["GRUPO", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}wipeeconomia`, aliases: [`${prefix}wipeeconomy`], usage: `${prefix}wipeeconomia`, effect: "wipe interativo total/perfis", badges: ["DM", "HARDCODED", "OCULTO"] },
        { cmd: `${prefix}nuke`, usage: `${prefix}nuke`, effect: "limpa punicoes do proprio override", badges: ["GRUPO", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}overridetest`, usage: `${prefix}overridetest`, effect: "teste de punicoes no proprio remetente", badges: ["GRUPO", "OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}criarcupom`, usage: `${prefix}criarcupom @usuario <1-100>`, effect: "gera cupom de desconto para usuario", badges: ["OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}enquete`, usage: `${prefix}enquete <titulo> <S|N>`, effect: "enquete guiada (S=DM registrados | N=grupos registrados)", badges: ["OVERRIDE", "OCULTO"] },
        { cmd: `${prefix}enquete <ID> responder`, usage: `${prefix}enquete <ID> responder`, effect: "responde a uma enquete", badges: ["GRUPO", "DM"] },
        { cmd: `${prefix}bugbounty list/info/close/reopen`, usage: `${prefix}bugbounty list [open|closed|fixed|ignored] | ${prefix}bugbounty close <id> <F|I> [motivo]`, effect: "gerencia reportes de bugs (override)", badges: ["OVERRIDE", "OCULTO"] },
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

  if (isCommand) {
    console.log("[router:utility] incoming", {
      command: cmd,
      groupId: from,
      sender,
      isGroup,
    })
  }

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
    console.log("[router:utility]", {
      command,
      status,
      groupId: from,
      sender,
      ...meta,
    })
  }

  const isBugBountyCommand = cmd === prefix + "bugbounty" || cmd.startsWith(prefix + "bugbounty ")
  const hasBugBountyOverrideAccess = Boolean(isKnownOverrideSender || isOverrideSender)

  if (isBugBountyCommand) {
    const tokens = String(cmd || "").trim().split(/\s+/).filter(Boolean)
    const rawTokens = String(rawText || "").trim().split(/\s+/).filter(Boolean)
    const action = String(tokens[1] || "").trim().toLowerCase()
    const bugState = getBugBountyState(storage)
    const allReports = Object.values(bugState.reports || {})
    const senderCandidates = buildBugReporterCandidates(sender, registrationService, jidNormalizedUser)
    const canonicalSender = canonicalizeBugReporterId(sender, registrationService, jidNormalizedUser)

    const getReportById = (bugId = "") => {
      const normalizedId = String(bugId || "").trim()
      if (!/^\d{5}$/.test(normalizedId)) return null
      return bugState.reports[normalizedId] || null
    }

    const denyOverrideOnlyAction = async (requestedAction = "") => {
      trackUtility("bugbounty", "rejected", { reason: "not-override", action: requestedAction })
      await sock.sendMessage(from, {
        text: "Somente overrides podem usar esse subcomando do bugbounty.",
      })
      return true
    }

    if (!action) {
      const openReports = allReports.filter((report) => report.status === "open")
      const closedReports = allReports.filter((report) => report.status === "closed")
      const fixedReports = closedReports.filter((report) => report.resolution === "fixed")
      const ignoredReports = closedReports.filter((report) => report.resolution === "ignored")

      const myReports = allReports.filter((report) => {
        const reporterId = canonicalizeBugReporterId(report.reporter, registrationService, jidNormalizedUser)
        return senderCandidates.has(reporterId)
      })
      const myEarned = myReports.reduce((acc, report) => {
        if (report.resolution !== "fixed") return acc
        const gained = Math.max(
          0,
          Math.floor(Number(report.totalCreditedCoins || report.payoutCoins) || 0)
        )
        return acc + gained
      }, 0)

      const groupedByReporter = new Map()
      for (const report of allReports) {
        const reporterId = canonicalizeBugReporterId(report.reporter, registrationService, jidNormalizedUser)
        if (!reporterId) continue
        const current = groupedByReporter.get(reporterId) || {
          reporterId,
          reports: 0,
          earned: 0,
        }
        current.reports += 1
        if (report.resolution === "fixed") {
          current.earned += Math.max(
            0,
            Math.floor(Number(report.totalCreditedCoins || report.payoutCoins) || 0)
          )
        }
        groupedByReporter.set(reporterId, current)
      }

      const topReporter = Array.from(groupedByReporter.values()).sort((a, b) => {
        if (b.reports !== a.reports) return b.reports - a.reports
        if (b.earned !== a.earned) return b.earned - a.earned
        return String(a.reporterId || "").localeCompare(String(b.reporterId || ""))
      })[0] || null

      const topReporterIdentity = topReporter
        ? getBugBountyIdentityLabel(topReporter.reporterId, {
          economyService,
          registrationService,
        })
        : null
      const topReporterMentions = topReporterIdentity?.mentionId
        ? normalizeMentionArray([topReporterIdentity.mentionId])
        : []

      const summaryLines = [
        "🐞 BUGBOUNTY",
        "",
        `Abertos: *${openReports.length}*`,
        `Fechados: *${closedReports.length}* (corrigidos: ${fixedReports.length} | ignorados: ${ignoredReports.length})`,
        "",
        `Seus reportes: *${myReports.length}*`,
        `Seus ganhos por reportes corrigidos: *${myEarned}* Epsteincoins`,
        "",
      ]

      if (topReporter && topReporterIdentity) {
        summaryLines.push(`Top reporter: *${topReporterIdentity.label}*`)
        summaryLines.push(`- Reportes: *${topReporter.reports}*`)
        summaryLines.push(`- Ganhos: *${topReporter.earned}* Epsteincoins`)
      } else {
        summaryLines.push("Top reporter: *ainda sem reportes válidos.*")
      }

      summaryLines.push("")
      summaryLines.push("Tabela de recompensas:")
      for (let priority = 1; priority <= 5; priority++) {
        const payout = BUG_BOUNTY_PRIORITY_PAYOUT[priority] || 0
        summaryLines.push(`- P${priority}: *${payout}* Epsteincoins`)
      }

      await sock.sendMessage(from, {
        text: summaryLines.join("\n"),
        mentions: topReporterMentions,
      })

      await sock.sendMessage(sender, {
        text:
`📬 Fluxo de reporte de bugs

1) Abra o privado com o bot.
2) Use: ${prefix}bugbounty reportar <1-5>
3) Envie a descrição completa na próxima mensagem.
4) Aguarde revisão da equipe.
5) O reporte será fechado como corrigido (F) ou ignorado (I).`,
      })

      trackUtility("bugbounty", "success", {
        action: "menu",
        openCount: openReports.length,
        closedCount: closedReports.length,
      })
      return true
    }

    if (action === "reportar") {
      if (isGroup) {
        trackUtility("bugbounty", "rejected", { reason: "group-only-dm-command", action: "reportar" })
        await sock.sendMessage(from, {
          text: `Este comando so funciona no privado com o bot. Use: ${prefix}bugbounty reportar <1-5> no DM.`,
        })
        return true
      }

      const reportedPriority = normalizeBugPriority(tokens[2], 0)
      if (!reportedPriority) {
        trackUtility("bugbounty", "rejected", { reason: "invalid-priority", action: "reportar" })
        await sock.sendMessage(from, {
          text: `Use: ${prefix}bugbounty reportar <1-5>`,
        })
        return true
      }

      pendingBugReportBySender.set(sender, {
        createdAt: Date.now(),
        reportedPriority,
      })
      trackUtility("bugbounty", "armed", { action: "reportar", reportedPriority })
      await sock.sendMessage(from, {
        text:
`✅ Modo reporte de bug ativado.

Prioridade escolhida: *P${reportedPriority}*.
Envie a descrição completa na próxima mensagem.
Apenas a próxima mensagem será capturada.`,
      })
      return true
    }

    if (action === "list") {
      if (!hasBugBountyOverrideAccess) {
        return denyOverrideOnlyAction("list")
      }

      const filter = getBugBountyListFilter(tokens[2])
      if (!filter) {
        trackUtility("bugbounty", "rejected", { reason: "invalid-filter", action: "list" })
        await sock.sendMessage(from, {
          text: `Use: ${prefix}bugbounty list [open|closed|fixed|ignored]`,
        })
        return true
      }

      let filtered = allReports
      if (filter === "open") filtered = allReports.filter((report) => report.status === "open")
      if (filter === "closed") filtered = allReports.filter((report) => report.status === "closed")
      if (filter === "fixed") filtered = allReports.filter((report) => report.status === "closed" && report.resolution === "fixed")
      if (filter === "ignored") filtered = allReports.filter((report) => report.status === "closed" && report.resolution === "ignored")

      filtered = filtered.sort((a, b) => {
        const bTs = Math.max(Number(b.closedAt) || 0, Number(b.createdAt) || 0)
        const aTs = Math.max(Number(a.closedAt) || 0, Number(a.createdAt) || 0)
        return bTs - aTs
      })

      if (filtered.length === 0) {
        await sock.sendMessage(from, {
          text: `Nenhum reporte encontrado para o filtro *${filter}*.`,
        })
        trackUtility("bugbounty", "success", { action: "list", filter, total: 0 })
        return true
      }

      const mentions = []
      const listLines = filtered.slice(0, 15).map((report) => {
        const reporterIdentity = getBugBountyIdentityLabel(report.reporter, {
          economyService,
          registrationService,
        })
        if (reporterIdentity.mentionId) {
          mentions.push(reporterIdentity.mentionId)
        }

        const statusLabel = report.status === "open"
          ? "aberto"
          : (report.resolution === "fixed" ? "fechado/corrigido" : "fechado/ignorado")
        const reasonLabel = report.resolution === "ignored" && report.ignoreReason
          ? ` (${getBugBountyIgnoreReasonLabel(report.ignoreReason)})`
          : ""
        const payoutLabel = report.resolution === "fixed"
          ? ` | +${Math.max(0, Math.floor(Number(report.totalCreditedCoins || report.payoutCoins) || 0))} Epsteincoins`
          : ""
        return `- ${report.id} | ${getBugBountyPriorityLabel(report.reportedPriority)} -> ${getBugBountyPriorityLabel(report.finalPriority)} | ${statusLabel}${reasonLabel} | ${reporterIdentity.label}${payoutLabel}`
      })

      if (filtered.length > 15) {
        listLines.push(`... +${filtered.length - 15} reportes`) 
      }

      await sock.sendMessage(from, {
        text: `🐞 Lista de reportes (${filter})\n\n${listLines.join("\n")}`,
        mentions: normalizeMentionArray(mentions),
      })
      trackUtility("bugbounty", "success", { action: "list", filter, total: filtered.length })
      return true
    }

    if (action === "info") {
      if (!hasBugBountyOverrideAccess) {
        return denyOverrideOnlyAction("info")
      }

      const bugId = String(tokens[2] || "").trim()
      if (!/^\d{5}$/.test(bugId)) {
        trackUtility("bugbounty", "rejected", { reason: "invalid-id", action: "info" })
        await sock.sendMessage(from, {
          text: `Use: ${prefix}bugbounty info <BUG_ID>`,
        })
        return true
      }

      const report = getReportById(bugId)
      if (!report) {
        trackUtility("bugbounty", "rejected", { reason: "unknown-id", action: "info", bugId })
        await sock.sendMessage(from, {
          text: `Nao encontrei reporte com ID *${bugId}*.`,
        })
        return true
      }

      const infoText =
`🛠️ Precisamos de mais detalhes sobre o reporte *${report.id}*.

Entre em contato direto com os desenvolvedores usando os contatos de ${prefix}feedback:
- Jessé: wa.me/+5521995409899
- Vitin: wa.me/+557398579450`

      try {
        await sock.sendMessage(report.reporter, { text: infoText })
      } catch (err) {
        console.error("Erro ao enviar bugbounty info ao reportante", err)
        await sock.sendMessage(from, {
          text: `Nao consegui enviar mensagem para o reportante do bug *${bugId}* agora.`,
        })
        trackUtility("bugbounty", "error", { reason: "reporter-dm-failed", action: "info", bugId })
        return true
      }

      report.lastInfoRequestedAt = Date.now()
      report.lastInfoRequestedBy = canonicalSender
      setBugBountyState(storage, bugState)

      await sock.sendMessage(from, {
        text: `✅ Mensagem de solicitacao de detalhes enviada ao reportante do bug *${bugId}*.`,
      })
      trackUtility("bugbounty", "success", { action: "info", bugId })
      return true
    }

    if (action === "close") {
      if (!hasBugBountyOverrideAccess) {
        return denyOverrideOnlyAction("close")
      }

      const bugId = String(tokens[2] || "").trim()
      const closeMode = String(tokens[3] || "").trim().toUpperCase()
      if (!/^\d{5}$/.test(bugId) || !["F", "I"].includes(closeMode)) {
        trackUtility("bugbounty", "rejected", { reason: "invalid-close-syntax", action: "close" })
        await sock.sendMessage(from, {
          text: `Use: ${prefix}bugbounty close <BUG_ID> <F|I> [NR|DUP|CAT|DET|FAKE] [nota]`,
        })
        return true
      }

      const report = getReportById(bugId)
      if (!report) {
        trackUtility("bugbounty", "rejected", { reason: "unknown-id", action: "close", bugId })
        await sock.sendMessage(from, {
          text: `Nao encontrei reporte com ID *${bugId}*.`,
        })
        return true
      }

      if (report.status !== "open") {
        trackUtility("bugbounty", "rejected", { reason: "already-closed", action: "close", bugId })
        await sock.sendMessage(from, {
          text: `O reporte *${bugId}* ja esta fechado. Use ${prefix}bugbounty reopen ${bugId} [1-5] para reabrir.`,
        })
        return true
      }

      if (closeMode === "I") {
        const ignoreReason = String(tokens[4] || "").trim().toUpperCase()
        if (!BUG_BOUNTY_IGNORE_REASONS[ignoreReason]) {
          trackUtility("bugbounty", "rejected", { reason: "missing-ignore-reason", action: "close", bugId })
          await sock.sendMessage(from, {
            text: `Para fechar como ignorado, use: ${prefix}bugbounty close ${bugId} I <NR|DUP|CAT|DET|FAKE> [nota]`,
          })
          return true
        }

        const closeNote = String(rawTokens.slice(5).join(" ") || "").trim()
        report.status = "closed"
        report.resolution = "ignored"
        report.ignoreReason = ignoreReason
        report.closeNote = closeNote
        report.closedAt = Date.now()
        report.closedBy = canonicalSender
        report.payoutCoins = 0
        report.creditedAt = 0
        setBugBountyState(storage, bugState)

        const reporterMessage =
`ℹ️ Atualizacao do seu reporte *${bugId}*:

Status: *IGNORADO*
Motivo: *${getBugBountyIgnoreReasonLabel(ignoreReason)}*${closeNote ? `\nNota da equipe: ${closeNote}` : ""}

Você nao recebeu credito neste fechamento.`

        try {
          await sock.sendMessage(report.reporter, { text: reporterMessage })
        } catch (err) {
          console.error("Erro ao notificar reportante no close ignorado", err)
        }

        await sock.sendMessage(from, {
          text: `✅ Reporte *${bugId}* fechado como ignorado (${getBugBountyIgnoreReasonLabel(ignoreReason)}).`,
        })
        trackUtility("bugbounty", "success", {
          action: "close",
          mode: "ignored",
          bugId,
          ignoreReason,
        })
        return true
      }

      const priority = normalizeBugPriority(report.finalPriority, report.reportedPriority)
      const expectedPayout = BUG_BOUNTY_PRIORITY_PAYOUT[priority] || 0
      const alreadyCredited = Math.max(0, Math.floor(Number(report.totalCreditedCoins) || 0))
      let creditedNow = 0

      if (alreadyCredited <= 0 && expectedPayout > 0 && typeof economyService?.creditCoins === "function") {
        creditedNow = Math.max(0, Math.floor(Number(
          economyService.creditCoins(report.reporter, expectedPayout, {
            type: "bugbounty_fixed",
            details: `Reporte de bug ${bugId} marcado como corrigido`,
            meta: {
              bugId,
              priority,
            },
          })
        ) || 0))
      }

      const totalCredited = alreadyCredited + creditedNow
      report.status = "closed"
      report.resolution = "fixed"
      report.ignoreReason = ""
      report.closeNote = ""
      report.closedAt = Date.now()
      report.closedBy = canonicalSender
      report.payoutCoins = creditedNow > 0 ? creditedNow : expectedPayout
      report.creditedAt = creditedNow > 0 ? Date.now() : report.creditedAt
      report.totalCreditedCoins = totalCredited
      setBugBountyState(storage, bugState)

      let creditText = `Crédito previsto: *${expectedPayout}* Epsteincoins.`
      if (creditedNow > 0) {
        creditText = `Você foi creditado com *${creditedNow}* Epsteincoins.`
      } else if (alreadyCredited > 0) {
        creditText = `Esse reporte ja havia sido creditado anteriormente com *${alreadyCredited}* Epsteincoins.`
      }

      const reporterMessage =
`✅ Atualizacao do seu reporte *${bugId}*:

Status: *CORRIGIDO*
Prioridade: *${getBugBountyPriorityLabel(priority)}*
${creditText}`

      try {
        await sock.sendMessage(report.reporter, { text: reporterMessage })
      } catch (err) {
        console.error("Erro ao notificar reportante no close corrigido", err)
      }

      await sock.sendMessage(from, {
        text: `✅ Reporte *${bugId}* fechado como corrigido. ${creditText}`,
      })
      trackUtility("bugbounty", "success", {
        action: "close",
        mode: "fixed",
        bugId,
        expectedPayout,
        creditedNow,
      })
      return true
    }

    if (action === "reopen") {
      if (!hasBugBountyOverrideAccess) {
        return denyOverrideOnlyAction("reopen")
      }

      const bugId = String(tokens[2] || "").trim()
      const reclassifyArg = String(tokens[3] || "").trim()
      if (!/^\d{5}$/.test(bugId)) {
        trackUtility("bugbounty", "rejected", { reason: "invalid-id", action: "reopen" })
        await sock.sendMessage(from, {
          text: `Use: ${prefix}bugbounty reopen <BUG_ID> [1-5]`,
        })
        return true
      }

      const newPriority = reclassifyArg ? normalizeBugPriority(reclassifyArg, 0) : 0
      if (reclassifyArg && !newPriority) {
        trackUtility("bugbounty", "rejected", { reason: "invalid-reclassify", action: "reopen", bugId })
        await sock.sendMessage(from, {
          text: `Prioridade invalida. Use: ${prefix}bugbounty reopen <BUG_ID> [1-5]`,
        })
        return true
      }

      const report = getReportById(bugId)
      if (!report) {
        trackUtility("bugbounty", "rejected", { reason: "unknown-id", action: "reopen", bugId })
        await sock.sendMessage(from, {
          text: `Nao encontrei reporte com ID *${bugId}*.`,
        })
        return true
      }

      if (report.status !== "closed") {
        trackUtility("bugbounty", "rejected", { reason: "already-open", action: "reopen", bugId })
        await sock.sendMessage(from, {
          text: `O reporte *${bugId}* ja esta aberto.`,
        })
        return true
      }

      report.status = "open"
      report.resolution = ""
      report.ignoreReason = ""
      report.closeNote = ""
      report.closedAt = 0
      report.closedBy = ""
      report.payoutCoins = 0
      report.creditedAt = 0
      report.reopenedAt = Date.now()
      report.reopenedBy = canonicalSender
      report.reopenCount = Math.max(0, Math.floor(Number(report.reopenCount) || 0)) + 1

      if (newPriority) {
        report.finalPriority = newPriority
      }

      setBugBountyState(storage, bugState)

      await sock.sendMessage(from, {
        text: `✅ Reporte *${bugId}* reaberto com sucesso.${newPriority ? ` Nova prioridade final: ${getBugBountyPriorityLabel(newPriority)}.` : ""}`,
      })
      trackUtility("bugbounty", "success", {
        action: "reopen",
        bugId,
        reclassified: Boolean(newPriority),
        newPriority,
      })
      return true
    }

    trackUtility("bugbounty", "rejected", { reason: "invalid-subcommand", action })
    await sock.sendMessage(from, {
      text:
`Subcomando invalido.

Uso publico:
- ${prefix}bugbounty
- ${prefix}bugbounty reportar <1-5>

Uso override:
- ${prefix}bugbounty list [open|closed|fixed|ignored]
- ${prefix}bugbounty info <BUG_ID>
- ${prefix}bugbounty close <BUG_ID> <F|I> [NR|DUP|CAT|DET|FAKE] [nota]
- ${prefix}bugbounty reopen <BUG_ID> [1-5]`,
    })
    return true
  }

  if (cmd === prefix + "menu") {
    trackUtility("menu", "success")
    await sock.sendMessage(from, {
      text:
`╭━━━〔 🤖 VITIN BOT 〕━━━╮
│ 👑 Status: Online
│ ⚙️ Sistema: Baileys
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 ❓ AJUDA 〕━━━╮
│ ${prefix}guia - te envia um simples guia da economia
│ ${prefix}ajuda <comando> - explica comando
│ ${prefix}pergunta - enviar pergunta aos desenvolvedores.
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 🛠️ FEEDBACK 〕━━━╮
│ ${prefix}feedback
│ ${prefix}feedbackpriv
│ ${prefix}bugbounty - sistema de recompensas por bugs
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 🎨 FIGURINHAS 〕━━━╮
│ ${prefix}s / ${prefix}fig / ${prefix}sticker / ${prefix}f
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 🎮 PASSATEMPOS 〕━━━╮
│ ${prefix}brincadeiras
│ ${prefix}jogos 
│ ${prefix}economia 
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 👤 CONTA 〕━━━╮
│ ${prefix}register
│ ${prefix}unregister
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 ⚡ ADM 〕━━━╮
│ ${prefix}adm
│ ${prefix}admeconomia (apenas donos)
╰━━━━━━━━━━━━━━━━━━━━╯`,
    })
    return true
  }

  if (cmd === prefix + "ajuda" || cmd.startsWith(prefix + "ajuda ") || cmd === prefix + "duvida" || cmd.startsWith(prefix + "duvida ")) {
    const tokens = String(cmd || "").trim().split(/\s+/).filter(Boolean)
    const requested = String(tokens.slice(1).join(" ") || "").trim().toLowerCase().replace(/^!+/, "")

    if (!requested) {
      const examples = getPublicCommandNames().slice(0, 12).map((name) => `!${name}`).join(", ")
      await sock.sendMessage(from, {
        text:
          `Use: *${prefix}ajuda <comando>*\n` +
          `Exemplo: *${prefix}ajuda economia*\n` +
          `Comandos comuns: ${examples}`,
      })
      trackUtility("ajuda", "rejected", { reason: "missing-command" })
      return true
    }

    const helpText = getCommandHelp(requested)
    if (!helpText) {
      await sock.sendMessage(from, {
        text: `Não encontrei ajuda para *${requested}*. Use *${prefix}menu* para ver os comandos.`,
      })
      trackUtility("ajuda", "rejected", { reason: "unknown-command", requested })
      return true
    }

    if (isGroup) {
      await sock.sendMessage(sender, { text: helpText })
      await sock.sendMessage(from, {
        text: `📩 ${formatMentionTag(sender)}, te enviei a ajuda de *${requested}* no privado.`,
        mentions: normalizeMentionArray([sender]),
      })
    } else {
      await sock.sendMessage(from, { text: helpText })
    }

    trackUtility("ajuda", "success", { requested, dm: isGroup })
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

Envie seu feedback em uma singular mensagem e eu vou encaminhar para um dos donos no privado.
Somente a próxima mensagem é capturada nesse fluxo.`,
    })
    return true
  }

  if (cmd === prefix + "pergunta" || cmd.startsWith(prefix + "pergunta ")) {
    if (isGroup) {
      await sock.sendMessage(from, {
        text: `Este comando so funciona no privado com o bot. Use: ${prefix}pergunta no DM.`,
      })
      trackUtility("pergunta", "rejected", { reason: "group-only-dm-command" })
      return true
    }

    const tokens = String(cmd || "").trim().split(/\s+/).filter(Boolean)
    const questionIdRaw = String(tokens[1] || "").trim().toUpperCase()

    if (!questionIdRaw) {
      pendingQuestionBySender.set(sender, { createdAt: Date.now() })
      trackUtility("pergunta", "armed", { mode: "question" })
      await sock.sendMessage(from, {
        text:
`✅ Modo pergunta ativado.

Envie sua pergunta na proxima mensagem e ela será encaminhada para os desenvolvedores.
Somente a proxima mensagem é capturada nesse fluxo.`,
      })
      return true
    }

    if (!(isKnownOverrideSender || isOverrideSender)) {
      trackUtility("pergunta", "rejected", { reason: "non-override-reply-attempt" })
      await sock.sendMessage(from, {
        text: `Somente overrides podem responder protocolos. Para enviar uma pergunta, use apenas: ${prefix}pergunta`,
      })
      return true
    }

    if (!/^[A-Z0-9]{5}$/.test(questionIdRaw)) {
      trackUtility("pergunta", "rejected", { reason: "invalid-question-id", questionId: questionIdRaw })
      await sock.sendMessage(from, {
        text: `Protocolo invalido. Use: ${prefix}pergunta <ABCDE>`,
      })
      return true
    }

    const questionRecord = questionInboxById.get(questionIdRaw)
    if (!questionRecord) {
      trackUtility("pergunta", "rejected", { reason: "unknown-question-id", questionId: questionIdRaw })
      await sock.sendMessage(from, {
        text: `Não encontrei pergunta com protocolo *${questionIdRaw}*.`,
      })
      return true
    }

    if (questionRecord.answeredAt) {
      trackUtility("pergunta", "rejected", { reason: "already-answered", questionId: questionIdRaw })
      await sock.sendMessage(from, {
        text: `A pergunta *${questionIdRaw}* já foi respondida.`,
      })
      return true
    }

    pendingQuestionReplyBySender.set(sender, {
      questionId: questionIdRaw,
      createdAt: Date.now(),
    })
    trackUtility("pergunta", "armed", { mode: "answer", questionId: questionIdRaw })
    await sock.sendMessage(from, {
      text:
`✍️ Resposta armada para *${questionIdRaw}*.

Envie a resposta na proxima mensagem para encaminhar no privado ao usuario.`,
    })
    return true
  }

  const pendingQuestionReply = pendingQuestionReplyBySender.get(sender)
  if (pendingQuestionReply && !isGroup && !(cmd === prefix + "pergunta" || cmd.startsWith(prefix + "pergunta "))) {
    pendingQuestionReplyBySender.delete(sender)

    const answerText = String(rawText || "").trim()
    if (!answerText) {
      trackUtility("pergunta", "rejected", { reason: "empty-answer", questionId: pendingQuestionReply.questionId })
      await sock.sendMessage(from, { text: "Nao recebi texto para resposta." })
      return true
    }

    const questionRecord = questionInboxById.get(pendingQuestionReply.questionId)
    if (!questionRecord) {
      trackUtility("pergunta", "error", { reason: "missing-question-record", questionId: pendingQuestionReply.questionId })
      await sock.sendMessage(from, { text: "Pergunta nao encontrada. Talvez tenha expirado." })
      return true
    }

    questionRecord.answeredAt = Date.now()
    questionRecord.answeredBy = sender

    await sock.sendMessage(questionRecord.sender, {
      text:
`📬 Resposta da sua pergunta (${questionRecord.id})

${answerText}`,
    })
    // Release the protocol ID after a successful answer to avoid unbounded growth.
    questionInboxById.delete(questionRecord.id)
    await sock.sendMessage(from, {
      text: `✅ Resposta enviada ao usuario do protocolo *${questionRecord.id}* no privado.`,
    })
    trackUtility("pergunta", "success", {
      mode: "answer",
      questionId: questionRecord.id,
      answerLength: answerText.length,
    })
    return true
  }

  const pendingQuestion = pendingQuestionBySender.get(sender)
  if (pendingQuestion && !isGroup && !(cmd === prefix + "pergunta" || cmd.startsWith(prefix + "pergunta "))) {
    pendingQuestionBySender.delete(sender)

    const questionText = String(rawText || "").trim()
    if (!questionText) {
      trackUtility("pergunta", "rejected", { reason: "empty-question" })
      await sock.sendMessage(from, {
        text: "Nao recebi texto para encaminhar como pergunta.",
      })
      return true
    }

    const overrideTarget = String(overrideJid || "").trim()
    if (!overrideTarget) {
      trackUtility("pergunta", "error", { reason: "missing-override-jid" })
      await sock.sendMessage(from, {
        text: "Pergunta privada indisponivel no momento: nao pude encontrar o destino.",
      })
      return true
    }

    const questionId = allocateQuestionId()
    questionInboxById.set(questionId, {
      id: questionId,
      sender,
      text: questionText,
      askedAt: Date.now(),
      answeredAt: 0,
      answeredBy: "",
    })

    const senderLabel = getMentionHandleFromJid(String(sender || ""))
    await sock.sendMessage(overrideTarget, {
      text:
`📩 PERGUNTA PRIVADA (${questionId})
De: @${senderLabel}

${questionText}

Fluxo de Resposta:
1) ${prefix}pergunta ${questionId}
2) Enviar a resposta na mensagem seguinte`,
      mentions: normalizeMentionArray([sender]),
    })
    await sock.sendMessage(from, {
      text:
`✅ Pergunta enviada com sucesso.
Protocolo: *${questionId}*.

Quando houver resposta, eu envio para voce no privado.`,
    })
    trackUtility("pergunta", "success", {
      mode: "question",
      questionId,
      questionLength: questionText.length,
    })
    return true
  }

  const pendingBugReport = pendingBugReportBySender.get(sender)
  if (pendingBugReport && !isGroup && !isBugBountyCommand) {
    pendingBugReportBySender.delete(sender)

    const bugDescription = String(rawText || "").trim()
    if (!bugDescription) {
      trackUtility("bugbounty", "rejected", { reason: "empty-report-description", action: "reportar" })
      await sock.sendMessage(from, {
        text: "Nao recebi texto para registrar o reporte de bug.",
      })
      return true
    }

    const overrideTarget = String(overrideJid || "").trim()
    if (!overrideTarget) {
      trackUtility("bugbounty", "error", { reason: "missing-override-jid", action: "reportar" })
      await sock.sendMessage(from, {
        text: "Reporte de bug indisponivel no momento: nao encontrei o destino de encaminhamento.",
      })
      return true
    }

    const bugState = getBugBountyState(storage)
    const reportId = allocateBugReportId(bugState)
    const reporter = canonicalizeBugReporterId(sender, registrationService, jidNormalizedUser)
    const reportedPriority = normalizeBugPriority(pendingBugReport.reportedPriority, 1)
    const now = Date.now()

    bugState.reports[reportId] = {
      id: reportId,
      reporter,
      reportedPriority,
      finalPriority: reportedPriority,
      description: bugDescription,
      status: "open",
      resolution: "",
      ignoreReason: "",
      closeNote: "",
      createdAt: now,
      closedAt: 0,
      closedBy: "",
      payoutCoins: 0,
      creditedAt: 0,
      totalCreditedCoins: 0,
      lastInfoRequestedAt: 0,
      lastInfoRequestedBy: "",
      reopenedAt: 0,
      reopenedBy: "",
      reopenCount: 0,
    }
    setBugBountyState(storage, bugState)

    const reporterIdentity = getBugBountyIdentityLabel(reporter, {
      economyService,
      registrationService,
    })
    const priorityReward = BUG_BOUNTY_PRIORITY_PAYOUT[reportedPriority] || 0

    await sock.sendMessage(overrideTarget, {
      text:
`🐞 BUG REPORT (${reportId})
De: ${reporterIdentity.label}
ID reportante: ${reporter}
Prioridade reportada: ${getBugBountyPriorityLabel(reportedPriority)} (${priorityReward} Epsteincoins)

${bugDescription}

Acoes:
- ${prefix}bugbounty list open
- ${prefix}bugbounty close ${reportId} F
- ${prefix}bugbounty close ${reportId} I <NR|DUP|CAT|DET|FAKE> [nota]
- ${prefix}bugbounty info ${reportId}
- ${prefix}bugbounty reopen ${reportId} [1-5]`,
      mentions: reporterIdentity.mentionId ? normalizeMentionArray([reporterIdentity.mentionId]) : [],
    })

    await sock.sendMessage(from, {
      text:
`✅ Reporte enviado com sucesso.
Protocolo: *${reportId}*
Prioridade: *${getBugBountyPriorityLabel(reportedPriority)}*

Quando houver atualizacao, eu aviso no privado.`,
    })

    trackUtility("bugbounty", "success", {
      action: "reportar",
      reportId,
      reportedPriority,
      descriptionLength: bugDescription.length,
    })
    return true
  }

  if (cmd === prefix + "enquete" || cmd.startsWith(prefix + "enquete ")) {
    if (!isOverrideSender && !isKnownOverrideSender) {
      trackUtility("enquete", "rejected", { reason: "not-override" })
      return false
    }

    const tokens = String(cmd || "").trim().split(/\s+/).filter(Boolean)
    const enqueteTitle = String(tokens.slice(1, -1).join(" ") || "").trim()
    const mode = String(tokens[tokens.length - 1] || "").trim().toUpperCase()

    if (!enqueteTitle || !["S", "N"].includes(mode)) {
      trackUtility("enquete", "rejected", { reason: "invalid-syntax" })
      await sock.sendMessage(from, {
        text: `Use: ${prefix}enquete <titulo> <S|N>\nS = DM apenas para registrados | N = Grupo apenas registrados`,
      })
      return true
    }

    pendingEnqueteBySender.set(sender, {
      createdAt: Date.now(),
      phase: "await-content",
      title: enqueteTitle,
      mode: mode,
    })
    trackUtility("enquete", "armed", { phase: "await-content", title: enqueteTitle, mode })
    await sock.sendMessage(from, {
      text:
`✅ Modo enquete ativado.

Título: *${enqueteTitle}*
Modo: ${mode === "S" ? "DM para registrados" : "Grupo para registrados"}

Envie a mensagem da enquete na próxima mensagem.`,
    })
    return true
  }

  const pendingEnquete = pendingEnqueteBySender.get(sender)
  if (pendingEnquete && (cmd === prefix + "enquete" || cmd.startsWith(prefix + "enquete ")) === false && (isOverrideSender || isKnownOverrideSender)) {
    if (pendingEnquete.phase === "await-content") {
      if (isQuitToken(cmd)) {
        pendingEnqueteBySender.delete(sender)
        trackUtility("enquete", "cancelled", { phase: "await-content" })
        await sock.sendMessage(from, { text: "❌ Enquete cancelada." })
        return true
      }
      pendingEnquete.phase = "confirm-message"
      pendingEnquete.message = rawText
      pendingEnqueteBySender.set(sender, pendingEnquete)

      await sock.sendMessage(from, {
        text:
`Confirma o envio? (Y/N/Q)

*${pendingEnquete.title}*

${pendingEnquete.message}`,
      })
      trackUtility("enquete", "armed", { phase: "confirm-message" })
      return true
    }

    if (pendingEnquete.phase === "confirm-message") {
      if (isQuitToken(cmd)) {
        pendingEnqueteBySender.delete(sender)
        trackUtility("enquete", "cancelled", { phase: "confirm-message" })
        await sock.sendMessage(from, { text: "❌ Enquete cancelada." })
        return true
      }
      if (isNoToken(cmd)) {
        pendingEnquete.phase = "await-content"
        pendingEnqueteBySender.set(sender, pendingEnquete)
        await sock.sendMessage(from, { text: "Reenvie a mensagem da enquete." })
        return true
      }
      if (!isYesToken(cmd)) {
        await sock.sendMessage(from, { text: "Responda com Y/N/Q." })
        return true
      }

      pendingEnqueteBySender.delete(sender)
      const enqueteId = allocateEnqueteId()
      const registeredUsers = registrationService.getRegisteredUsersForNotifications()

      enqueteInboxById.set(enqueteId, {
        id: enqueteId,
        title: pendingEnquete.title,
        message: pendingEnquete.message,
        mode: pendingEnquete.mode,
        createdBy: sender,
        createdAt: Date.now(),
        responses: [],
      })

      let sentCount = 0
      let failCount = 0

      if (pendingEnquete.mode === "S") {
        for (const userId of registeredUsers) {
          try {
            await sock.sendMessage(userId, {
              text:
`📋 ENQUETE (${enqueteId})

*${pendingEnquete.title}*

${pendingEnquete.message}

Para responder: ${prefix}enquete ${enqueteId} responder`,
            })
            sentCount++
          } catch (err) {
            failCount++
            console.error("Erro ao enviar enquete para DM", userId, err)
          }
        }
      } else {
        const groups = Array.from(knownGroupIds || [])
        for (const groupId of groups) {
          try {
            await sock.sendMessage(groupId, {
              text:
`📋 ENQUETE (${enqueteId})

*${pendingEnquete.title}*

${pendingEnquete.message}

Para responder: ${prefix}enquete ${enqueteId} responder`,
            })
            sentCount++
          } catch (err) {
            failCount++
            console.error("Erro ao enviar enquete para grupo", groupId, err)
          }
        }
      }

      await sock.sendMessage(from, {
        text:
`✅ Enquete enviada com sucesso!

ID: *${enqueteId}*
Envios: ${sentCount} sucesso | ${failCount} falhas`,
      })
      trackUtility("enquete", "success", { enqueteId, sentCount, failCount, mode: pendingEnquete.mode })
      return true
    }
  }

  if (cmd === prefix + "enquete" || cmd.startsWith(prefix + "enquete ")) {
    const tokens = String(cmd || "").trim().split(/\s+/).filter(Boolean)
    const enqueteIdRaw = String(tokens[1] || "").trim().toUpperCase()
    const subcommand = String(tokens[2] || "").trim().toLowerCase()

    if (!enqueteIdRaw) return false
    if (subcommand !== "responder") return false

    const enqueteRecord = enqueteInboxById.get(enqueteIdRaw)
    if (!enqueteRecord) {
      trackUtility("enquete", "rejected", { reason: "unknown-enquete-id", enqueteId: enqueteIdRaw })
      await sock.sendMessage(from, {
        text: `Não encontrei enquete com ID *${enqueteIdRaw}*.`,
      })
      return true
    }

    const userAlreadyResponded = enqueteRecord.responses.some((r) => r.respondent === sender)
    if (userAlreadyResponded) {
      trackUtility("enquete", "rejected", { reason: "already-responded", enqueteId: enqueteIdRaw })
      await sock.sendMessage(from, {
        text: `Você já respondeu a essa enquete.`,
      })
      return true
    }

    pendingEnqueteReplyBySender.set(sender, {
      enqueteId: enqueteIdRaw,
      createdAt: Date.now(),
    })
    trackUtility("enquete", "armed", { mode: "respond", enqueteId: enqueteIdRaw })
    await sock.sendMessage(from, {
      text:
`✍️ Resposta ativada para enquete *${enqueteIdRaw}*.

Envie sua resposta na próxima mensagem.`,
    })
    return true
  }

  const pendingEnqueteReply = pendingEnqueteReplyBySender.get(sender)
  if (pendingEnqueteReply && !((cmd === prefix + "enquete" || cmd.startsWith(prefix + "enquete ")))) {
    pendingEnqueteReplyBySender.delete(sender)

    const responseText = String(rawText || "").trim()
    if (!responseText) {
      trackUtility("enquete", "rejected", { reason: "empty-response", enqueteId: pendingEnqueteReply.enqueteId })
      await sock.sendMessage(from, { text: "Não recebi texto para resposta." })
      return true
    }

    const enqueteRecord = enqueteInboxById.get(pendingEnqueteReply.enqueteId)
    if (!enqueteRecord) {
      trackUtility("enquete", "error", { reason: "missing-enquete-record", enqueteId: pendingEnqueteReply.enqueteId })
      await sock.sendMessage(from, { text: "Enquete não encontrada. Talvez tenha expirado." })
      return true
    }

    enqueteRecord.responses.push({
      respondent: sender,
      respondentName: userNameCache[sender] || getMentionHandleFromJid(sender),
      response: responseText,
      respondedAt: Date.now(),
    })

    const overrideTarget = String(overrideJid || "").trim()
    if (overrideTarget) {
      await sock.sendMessage(overrideTarget, {
        text:
`📋 RESPOSTA DE ENQUETE (${pendingEnqueteReply.enqueteId})

*${enqueteRecord.title}*

De: ${formatMentionTag(sender)}
Resposta: ${responseText}`,
        mentions: normalizeMentionArray([sender]),
      })
    }

    await sock.sendMessage(from, {
      text: `✅ Sua resposta foi registrada para a enquete *${pendingEnqueteReply.enqueteId}*.`,
    })
    trackUtility("enquete", "success", {
      mode: "respond",
      enqueteId: pendingEnqueteReply.enqueteId,
      responseLength: responseText.length,
    })
    return true
  }

  const pendingPrivateFeedback = pendingPrivateFeedbackBySender.get(sender)
  if (pendingPrivateFeedback && cmd !== prefix + "feedbackpriv" && !(cmd === prefix + "pergunta" || cmd.startsWith(prefix + "pergunta "))) {
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
    const senderUserPart = getMentionHandleFromJid(senderWithoutDevice)
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

  if (cmd === prefix + "teste" || cmd.startsWith(prefix + "teste ")) {
    const rawMentioned = getFirstMentionedJid(msg?.message?.extendedTextMessage?.contextInfo || {})
    const targetMentioned = normalizeMentionJid(mentioned[0] || "")
    const baseIdentity = rawMentioned || targetMentioned

    if (!baseIdentity) {
      trackUtility("teste", "rejected", { reason: "missing-mention" })
      await sock.sendMessage(from, {
        text: `Use: ${prefix}teste @usuario (com uma menção).`,
      })
      return true
    }

    const variants = []
    const addVariant = (label, value, options = {}) => {
      const normalized = String(value || "").trim().toLowerCase()
      if (!normalized) return
      variants.push({
        label,
        value: normalized,
        mentionable: options.mentionable !== false && normalized.includes("@"),
      })
    }

    const baileysNormalized = String(jidNormalizedUser(baseIdentity) || "").trim().toLowerCase()
    const registrationCanonical = String(normalizeUserId(baseIdentity) || "").trim().toLowerCase()
    const aliasList = typeof registrationService?.getUserIdAliases === "function"
      ? registrationService.getUserIdAliases(baseIdentity)
      : []

    addVariant("RAW_MENTIONED_JID", rawMentioned)
    addVariant("CTX_MENTIONED_NORMALIZED", targetMentioned)
    addVariant("BAILEYS_NORMALIZED", baileysNormalized)
    addVariant("REGISTRATION_CANONICAL", registrationCanonical)

    const baseForParts = registrationCanonical || baileysNormalized || String(baseIdentity || "").trim().toLowerCase()
    const userPart = baseForParts.includes("@") ? getMentionHandleFromJid(baseForParts) : baseForParts
    const userPartWithoutDevice = String(userPart || "").split(":")[0]
    const digitsOnly = userPartWithoutDevice.replace(/\D+/g, "")

    addVariant("NO_DEVICE_SWHATSAPP", userPartWithoutDevice ? `${userPartWithoutDevice}@s.whatsapp.net` : "")
    addVariant("NO_DEVICE_LID", userPartWithoutDevice ? `${userPartWithoutDevice}@lid` : "")
    addVariant("DIGITS_SWHATSAPP", digitsOnly ? `${digitsOnly}@s.whatsapp.net` : "")
    addVariant("DIGITS_LID", digitsOnly ? `${digitsOnly}@lid` : "")
    addVariant("PHONE_ONLY", digitsOnly, { mentionable: false })

    aliasList.forEach((alias, index) => {
      addVariant(`REG_ALIAS_${index + 1}`, alias)
    })

    const mentionSet = new Set()
    const seenFirstIndexByValue = new Map()
    const formatVariantHandle = (value = "") => {
      const normalized = String(value || "").trim().toLowerCase()
      if (!normalized) return "@desconhecido"

      const beforeAt = normalized.includes("@") ? getMentionHandleFromJid(normalized) : normalized
      const withoutDevice = beforeAt.split(":")[0]
      const digits = withoutDevice.replace(/\D+/g, "")
      const handle = digits || withoutDevice || normalized
      return `@${handle}`
    }

    const lines = [
      "Teste de remenção (variantes da identidade mencionada):",
      "",
    ]

    variants.forEach((variant, index) => {
      const mentionTag = formatVariantHandle(variant.value)

      const duplicateOf = seenFirstIndexByValue.has(variant.value)
        ? seenFirstIndexByValue.get(variant.value) + 1
        : 0

      if (!seenFirstIndexByValue.has(variant.value)) {
        seenFirstIndexByValue.set(variant.value, index)
      }

      lines.push(
        `${index + 1}. [${variant.label}] ${mentionTag}` +
        (duplicateOf ? ` (duplica ${duplicateOf})` : "")
      )

      if (variant.mentionable) {
        const normalizedMention = normalizeMentionJid(variant.value)
        if (normalizedMention) mentionSet.add(normalizedMention)
      }
    })

    await sock.sendMessage(from, {
      text: lines.join("\n"),
      mentions: Array.from(mentionSet),
    })

    trackUtility("teste", "success", {
      target: baseIdentity,
      variants: variants.length,
      mentionTargets: mentionSet.size,
    })
    return true
  }

  if (cmd === prefix + "perf") {
    function parseMessageTimestampMs(ts) {
      if (typeof ts === "number") return ts * 1000
      if (typeof ts === "bigint") return Number(ts) * 1000
      if (typeof ts === "string") {
        const parsed = Number.parseInt(ts, 10)
        return Number.isFinite(parsed) ? parsed * 1000 : 0
      }
      if (ts && typeof ts === "object") {
        if (typeof ts.toNumber === "function") {
          const parsed = Number(ts.toNumber())
          return Number.isFinite(parsed) ? parsed * 1000 : 0
        }
        const parsed = Number(ts.low)
        return Number.isFinite(parsed) ? parsed * 1000 : 0
      }
      return 0
    }

    const messageTsMs = parseMessageTimestampMs(msg?.messageTimestamp)
    const latencyMs = messageTsMs ? Math.max(0, Date.now() - messageTsMs) : 0

    function formatUptime(sec) {
      sec = Math.floor(sec)
      const days = Math.floor(sec / 86400)
      sec %= 86400
      const hours = Math.floor(sec / 3600)
      sec %= 3600
      const minutes = Math.floor(sec / 60)
      const seconds = sec % 60
      const parts = []
      if (days) parts.push(`${days}d`)
      if (hours) parts.push(`${hours}h`)
      if (minutes) parts.push(`${minutes}m`)
      parts.push(`${seconds}s`)
      return parts.join(" ")
    }

    function getDiskInfo() {
      try {
        if (process.platform === "win32") {
          const cwd = process.cwd()
          const drive = cwd[0].toUpperCase()
          const out = child_process.execSync('wmic logicaldisk get Caption,FreeSpace,Size /format:csv', { encoding: "utf8" })
          const lines = out.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean)
          for (const line of lines.slice(1)) {
            const parts = line.split(",")
            const caption = parts[1]
            const free = Number(parts[2])
            const size = Number(parts[3])
            if (caption && caption.toUpperCase().startsWith(`${drive}:`)) {
              return { free, size }
            }
          }
          for (const line of lines.slice(1)) {
            const parts = line.split(",")
            const free = Number(parts[2])
            const size = Number(parts[3])
            if (Number.isFinite(size)) return { free, size }
          }
        } else {
          const out = child_process.execSync(`df -k ${process.cwd()}`, { encoding: "utf8" })
          const rows = out.trim().split(/\r?\n/)
          const last = rows[rows.length - 1]
          const cols = last.trim().split(/\s+/)
          const size = Number(cols[1]) * 1024
          const free = Number(cols[3]) * 1024
          return { size, free }
        }
      } catch (err) {
        return null
      }
      return null
    }

    const disk = getDiskInfo()
    let totalStorageText = "N/A"
    let storageUsageText = "N/A"
    if (disk && Number.isFinite(disk.size)) {
      const totalMB = Math.round(disk.size / 1024 / 1024)
      const freeMB = disk.free ? Math.round(disk.free / 1024 / 1024) : 0
      const usedMB = totalMB - freeMB
      totalStorageText = `${totalMB}MB`
      storageUsageText = `${usedMB}MB / ${freeMB}MB`
    }

    const usedRamMB = Math.round(process.memoryUsage().rss / 1024 / 1024)
    const totalRamMB = Math.round(os.totalmem() / 1024 / 1024)

    const uptimeText = formatUptime(process.uptime())
    const hours = new Date().getHours()
    const greeting = hours >= 5 && hours < 12 ? "bom dia" : hours >= 12 && hours < 18 ? "boa tarde" : "boa noite"
    const userShort = getMentionHandleFromJid(String(sender || ""))

    const box = `╔┉✼┉═══༺◈✼☁️✼◈༻═══┉✼┉╗
║
║ 👋 ू ፝͜❥ ${greeting}, @${userShort}
║
║        🤖 V.I.R.J.E.N.S ONLINE 🤖
║
║ ⚡ PERFORMANCE
║ ├ 💨 Resposta: ${latencyMs}ms
║ └ ⏳ Uptime: ${uptimeText}
║
║ 💻 SISTEMA  
║ ├ 🖥️ Implementado via Railway
║ └ 📊 Uso de RAM: ${usedRamMB}MB / ${totalRamMB}MB
║
║ 🧠 MEMÓRIA
║ ├ 📈 Total: ${totalStorageText}
║ └ 💾 Uso: ${storageUsageText} 
║
╚┉✼┉═══༺◈✼☁️✼◈༻═══┉✼┉╝`

    await sock.sendMessage(from, { text: box, mentions: normalizeMentionArray([sender]) })
    trackUtility("perf", "success", { latencyMs })
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
        text: `📩 ${formatMentionTag(sender)}, te enviei a lista de punições no privado.`,
        mentions: normalizeMentionArray([sender]),
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
    const numero = getMentionHandleFromJid(alvo)

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
    await sock.sendMessage(from, { text: frase, mentions: normalizeMentionArray([alvo]) })
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

    const numero = getMentionHandleFromJid(alvo)
    const ddd = numero.substring(0, 2)
    const regiao = dddMap[ddd] || "desconhecida"

    const crimes = ["furto", "roubo", "estelionato", "tráfico", "lesão corporal", "homicídio", "contrabando", "vandalismo", "pirataria", "crime cibernético", "fraude", "tráfico de animais", "lavagem de dinheiro", "crime ambiental", "corrupção", "sequestro", "ameaça", "falsificação", "invasão de propriedade", "crime eleitoral"]
    const crime = crimes[Math.floor(Math.random() * crimes.length)]

    await sock.sendMessage(from, { text: `📡 Analisando ficha criminal... (1 crime encontrado: ${crime})`, mentions: normalizeMentionArray([alvo]) })

    setTimeout(async () => {
      await sock.sendMessage(from, { text: `💻 IP rastreado: ${ip}`, mentions: normalizeMentionArray([alvo]) })
    }, 1500)

    setTimeout(async () => {
      await sock.sendMessage(from, {
        text: `🎯 Alvo identificado!\n📍 Região: ${regiao}\n💻 Provedor: ${provedor}\n📱 Dispositivo: ${dispositivo}\n⚠️ Vulnerabilidade encontrada!\n💣 Iniciando ataque em breve...`,
        mentions: normalizeMentionArray([alvo]),
      })
    }, 3000)

    trackUtility("bombardeio", "success", { target: alvo })
    return true
  }

  if (cmd.startsWith(prefix + "gay") && mentioned[0]) {
    const alvo = mentioned[0]
    const numero = getMentionHandleFromJid(alvo)
    const p = Math.floor(Math.random() * 101)
    await sock.sendMessage(from, { text: `@${numero} é ${p}% gay 🌈`, mentions: normalizeMentionArray([alvo]) })
    trackUtility("gay", "success", { target: alvo })
    return true
  }

  if (cmd.startsWith(prefix + "gado") && mentioned[0]) {
    const alvo = mentioned[0]
    const numero = getMentionHandleFromJid(alvo)
    const p = Math.floor(Math.random() * 101)
    await sock.sendMessage(from, { text: `@${numero} é ${p}% gado 🐂`, mentions: normalizeMentionArray([alvo]) })
    trackUtility("gado", "success", { target: alvo })
    return true
  }

  if (cmd.startsWith(prefix + "ship") && mentioned.length >= 2) {
    const p1 = mentioned[0]
    const p2 = mentioned[1]
    const n1 = getMentionHandleFromJid(p1)
    const n2 = getMentionHandleFromJid(p2)
    const chance = Math.floor(Math.random() * 101)
    await sock.sendMessage(from, {
      text: `💘 @${n1} + @${n2} = ${chance}%`,
      mentions: normalizeMentionArray([p1, p2]),
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
    const n1 = getMentionHandleFromJid(p1)
    const n2 = getMentionHandleFromJid(p2)

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
      const nv = getMentionHandleFromJid(vencedor)
      const np = getMentionHandleFromJid(perdedor)
      const tamanhoVencedor = (Math.random() * 20 + 5).toFixed(1)
      const tamanhoPerdedor = (Math.random() * 23 - 20).toFixed(1)
      const finais = [
        `@${np} tem o menor micro pênis já registrado da história! (${tamanhoPerdedor}cm)`,
        `@${nv} ganhou com seus incríveis ${tamanhoVencedor} centímetros!`,
      ]
      const resultado = finais[Math.floor(Math.random() * finais.length)]
      await sock.sendMessage(from, {
        text: `Ih, os corno começaram a tretar\n\n@${n1} VS @${n2}\n\nMotivo: ${motivo}\nResultado: ${resultado}`,
        mentions: normalizeMentionArray([p1, p2]),
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
      mentions: normalizeMentionArray([p1, p2]),
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
    pendingQuestionBySender.clear()
    pendingQuestionReplyBySender.clear()
    questionInboxById.clear()
    pendingBugReportBySender.clear()
    bugBountyStateFallback = buildEmptyBugBountyState()
  },
}
