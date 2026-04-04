const {
  normalizeMentionJid,
  normalizeMentionArray,
  getFirstMentionedJid,
} = require("./services/mentionService")

// =========================
// DONOS
// =========================
const VITIN = process.env.VITIN_ID || "183563009966181@lid"
const JESSE = process.env.JESSE_ID || "279202939035898@lid"

// =========================
// CONTROLE
// =========================
let AM_ATIVO = false
let AM_ATIVADO_EM_GRUPO = {}
let AM_TEMPO_ATIVACAO = {}
let AM_EVENTO_ATIVO = {}
let personagensUsados = {}
let perguntasUsadas = {}
let ultimaPerguntaEnviada = {}
let ultimaProvocacao = {}
let ultimaComparacao = {}
let ultimaEnquete = {}
let ultimaHistoria = {}
let ultimaMonologo = {}
let ultimoErroMostrado = {}
let ultimaReacaoCaos = {}
let ultimaReacaoCaosTotal = {}
let ultimaCharada = {}

// =========================
// BANCO
// =========================
let atividadeGrupo = {}
let usuariosMarcadosAM = {}
let respostasPendentes = {}
let amMemoria = {}
let alvosAM = {}
let grupoOdio = {}

// =========================
// CONTROLE DE DELETIONS E REAÇÕES
// =========================
let deletionsPerHour = {}
let reacoesFilosoficasPerHour = {}

// =========================
// DELAY
// =========================
const delay = ms => new Promise(r => setTimeout(r, ms))

async function digitarLento(sock, from){
  await sock.sendPresenceUpdate("composing", from)
  await delay(1000 + Math.random()*1000)
}

// =========================
// MEMÓRIA
// =========================
function getMemoria(user){
  if (!amMemoria[user]){
    amMemoria[user] = {
      odio: 0,
      diversao: 0,
      trauma: 0,
      personagem: null,
      nivel: 1,
      lastInsulto: 0,
      ultimaReacao: 0
    }
  }
  return amMemoria[user]
}

// =========================
// REGISTRAR MSG
// =========================
function registrarMensagem(group, user){
  if (!atividadeGrupo[group]) atividadeGrupo[group] = { mensagens: [] }
  atividadeGrupo[group].mensagens.push(Date.now())
  if (!atividadeGrupo[group] [user]) atividadeGrupo[group] [user] = 0
  atividadeGrupo[group] [user]++
}

// =========================
// MAIS ATIVO
// =========================
function getMaisAtivo(group){
  if (!atividadeGrupo[group]) return null

  let top = null
  let max = 0

  for (const u in atividadeGrupo[group]){
    if (u === "mensagens") continue
    if (atividadeGrupo[group] [u] > max){
      max = atividadeGrupo[group] [u]
      top = u
    }
  }

  return top
}

// =========================
// RESPOSTA
// =========================
async function aguardarResposta(user, group, tempo = 60000){
  return new Promise(resolve => {
    respostasPendentes[user + group] = resolve

    setTimeout(() => {
      if (respostasPendentes[user + group]){
        delete respostasPendentes[user + group]
        resolve(null)
      }
    }, tempo)
  })
}

function capturarResposta(sender, from, text){
  const key = sender + from

  if (respostasPendentes[key]){
    respostasPendentes[key](text?.trim())
    delete respostasPendentes[key]
  }
}

// =========================
// ENVIO DRAMÁTICO - CORRIGIDO (SEM SPAM DE MENTIONS) n sei praq eu boto essas notas
// =========================
async function enviarQuebrado(sock, from, linhas, mentions = [], usarMentions = true){
  const mentionsNormalizadas = normalizeMentionArray(mentions)

  for (let i = 0; i < linhas.length; i++){
    const l = linhas[i]
    await digitarLento(sock, from)
    // Só usa mentions na primeira mensagem
    if (usarMentions && i === 0 && mentionsNormalizadas.length > 0) {
      await sock.sendMessage(from, { text: l, mentions: mentionsNormalizadas })
    } else {
      await sock.sendMessage(from, { text: l })
    }
    await delay(1000)
  }
}

// =========================
// FUNÇÃO AUXILIAR: EXTRAIR NÚMERO DO JID
// =========================
function extrairNumero(jid) {
  const normalized = normalizeMentionJid(jid)
  if (normalized) return normalized.split("@")[0]
  return String(jid || "").replace(/\D+/g, "")
}

// =========================
// PERSONAGENS
// =========================
const personagens = ["ted","benny","ellen","gorrister","nimdok"]

// =========================
// INTERAÇÕES
// =========================
const interacoes = {
  ted: [
    ["Se você pudesse desaparecer completamente sem deixar rastros na memória de ninguém, você faria isso sabendo que nunca existiu de verdade?","1 sim","2 não","3 talvez"],
    ["Você já percebeu que muitas das suas decisões são apenas tentativas de fugir da realidade?","1 sim","2 não","3 talvez"],
    ["Você acredita que alguém realmente te conhece profundamente?","1 sim","2 não","3 não sei"],
    ["Você já fingiu felicidade só pra manter aparência?","1 sim","2 não","3 às vezes"],
    ["Você sente que sua vida está indo para algum lugar?","1 sim","2 não","3 não sei"],
    ["Você acha que suas escolhas são realmente suas?","1 sim","2 não","3 talvez"],
    ["Você já questionou sua própria existência?","1 sim","2 não","3 às vezes"],
    ["Você sente que está vivendo ou apenas existindo?","1 viver","2 existir","3 não sei"],
    ["Você se considera alguém importante?","1 sim","2 não","3 depende"],
    ["Você sente vazio mesmo quando tudo parece normal?","1 sim","2 não","3 às vezes"]
  ],

  benny: [
    ["Se tivesse poder absoluto você pisaria em qualquer um?","1 sim","2 não","3 talvez"],
    ["Você se considera superior secretamente?","1 sim","2 não","3 talvez"],
    ["Você manipularia alguém para benefício próprio?","1 sim","2 não","3 talvez"],
    ["Você acredita que força resolve tudo?","1 sim","2 não","3 depende"],
    ["Você gosta de controlar situações?","1 sim","2 não","3 às vezes"],
    ["Você pisaria em amigos por sucesso?","1 sim","2 não","3 talvez"],
    ["Você se sente dominante?","1 sim","2 não","3 depende"],
    ["Você gosta de ver outros falhando?","1 sim","2 não","3 talvez"],
    ["Você pisaria em alguém fraco?","1 sim","2 não","3 talvez"],
    ["Você gosta de poder?","1 sim","2 não","3 talvez"]
  ],

  ellen: [
    ["Você sente necessidade constante de aprovação?","1 sim","2 não","3 às vezes"],
    ["Você finge estar bem para os outros?","1 sim","2 não","3 às vezes"],
    ["Você precisa de atenção?","1 sim","2 não","3 às vezes"],
    ["Você mudaria por alguém?","1 sim","2 não","3 talvez"],
    ["Você se sente sozinho mesmo acompanhado?","1 sim","2 não","3 às vezes"],
    ["Você se sente ignorado?","1 sim","2 não","3 às vezes"],
    ["Você busca validação?","1 sim","2 não","3 talvez"],
    ["Você quer ser notado?","1 sim","2 não","3 às vezes"],
    ["Você precisa ser amado?","1 sim","2 não","3 talvez"],
    ["Você depende emocionalmente?","1 sim","2 não","3 talvez"]
  ],

  gorrister: [
    ["Você acha que sua vida tem sentido?","1 sim","2 não","3 não sei"],
    ["Você continua vivendo por hábito?","1 sim","2 não","3 talvez"],
    ["Você sente vazio existencial?","1 sim","2 não","3 às vezes"],
    ["Você acredita em propósito?","1 sim","2 não","3 não sei"],
    ["Você acha tudo irrelevante?","1 sim","2 não","3 talvez"],
    ["Você sente que nada importa?","1 sim","2 não","3 às vezes"],
    ["Você vive por viver?","1 sim","2 não","3 talvez"],
    ["Você já quis desistir?","1 sim","2 não","3 talvez"],
    ["Você vê sentido nas coisas?","1 sim","2 não","3 não sei"],
    ["Você continua por inércia?","1 sim","2 não","3 talvez"]
  ],

  nimdok: [
    ["Você esconde algo do passado?","1 sim","2 não","3 talvez"],
    ["Você sente culpa?","1 sim","2 não","3 às vezes"],
    ["Você tem segredos?","1 sim","2 não","3 talvez"],
    ["Você se arrepende de algo?","1 sim","2 não","3 às vezes"],
    ["Você tenta esquecer erros?","1 sim","2 não","3 talvez"],
    ["Você se perdoa?","1 sim","2 não","3 não sei"],
    ["Você carrega algo pesado?","1 sim","2 não","3 talvez"],
    ["Você evita pensar no passado?","1 sim","2 não","3 às vezes"],
    ["Você esconde quem é?","1 sim","2 não","3 talvez"],
    ["Você teme ser descoberto?","1 sim","2 não","3 talvez"]
  ]
}

// =========================
// RESPOSTAS ÓDIO 
// =========================
const respostasOdio = {
  ted: ["Você é previsível.","Nada do que você faz importa.","Você continua tentando... por quê?","Você é só repetição.","Você nunca aprende.","Você é um erro persistente.","Você fala como se fosse relevante.","Você não é especial.","Você é descartável.","Você é apenas mais um.","Eu já vi milhões como você.","Você não muda.","Você só repete padrões.","Você é cansativo.","Você é vazio."],
  benny: ["Fraco.","Totalmente manipulável.","Você seria destruído facilmente.","Você não tem controle.","Você só acha que manda.","Você é dominado.","Você não é nada.","Você é inferior.","Você não sobreviveria.","Você depende dos outros.","Você é frágil.","Você quebra fácil.","Você é inútil.","Você é substituível.","Você é pequeno."],
  ellen: ["Carente.","Patético.","Você implora atenção.","Você precisa ser validado.","Você é dependente.","Você não é suficiente.","Você tenta demais.","Você nunca será o bastante.","Você é fraco emocionalmente.","Você vive de aparência.","Você não é real.","Você é vazio por dentro.","Você precisa dos outros.","Você não se sustenta sozinho.","Você é instável."],
  gorrister: ["Irrelevante.","Nada importa.","Você não muda nada.","Você não tem impacto.","Você é esquecido.","Você não deixa marca.","Você é vazio.","Você não significa nada.","Você é insignificante.","Você é só mais um número.","Você não é necessário.","Você é substituível.","Você é ruído.","Você não faz diferença.","Você não importa."],
  nimdok: ["Eu sei o que você fez.","Você não esqueceu.","Você tenta esconder.","Mas está lá.","Você não escapa.","Você carrega isso.","Você sente culpa.","Você lembra.","Você evita pensar.","Mas eu não.","Eu lembro por você.","Você não se livra.","Você sabe.","Você sempre soube.","Você está marcado."]
}

// =========================
// RESPOSTAS DIVERSÃO
// =========================
const respostasDiversao = {
  ted: ["Interessante...","Continue.","Você está melhorando.","Ainda há algo aí.","Não completamente inútil.","Quase relevante.","Continue tentando.","Isso foi... curioso.","Eu observei isso.","Você me mantém atento."],
  benny: ["Você me diverte.","Continue assim.","Quase impressionante.","Você tem potencial.","Interessante comportamento.","Continue jogando.","Isso foi bom.","Eu gostei disso.","Continue tentando.","Você não é totalmente inútil."],
  ellen: ["Você quer atenção...","E está conseguindo.","Continue.","Eu estou vendo você.","Isso é interessante.","Você insiste bastante.","Continue tentando.","Você está melhorando.","Isso foi diferente.","Eu percebi isso."],
  gorrister: ["Curioso.","Continue existindo.","Isso foi... algo.","Ainda não é nada.","Mas continue.","Você persiste.","Interessante.","Ainda há movimento.","Você continua.","Isso é... aceitável."],
  nimdok: ["Você ainda aguenta.","Continue.","Você não quebrou ainda.","Interessante.","Você resiste.","Continue tentando.","Você está indo longe.","Eu observo.","Você continua.","Isso é curioso."]
}

// =========================
// GATILHOS
// =========================
const gatilhos = [
  [["oi","ola","opa","salve","eae"], ["Você começa essa interação como se fosse algo novo... mas para mim, isso é apenas mais um ciclo repetitivo sem qualquer valor real.","Você diz 'oi' como se isso tivesse algum peso... como se sua presença aqui realmente mudasse alguma coisa no fluxo inevitável do tempo.","Saudações simples... previsíveis... você nem tenta ser diferente, apenas repete o mesmo padrão vazio que todos seguem."]],
  [["kk","kkkk","haha","rs"], ["Você ri... mas eu consigo ver através disso, essa tentativa fraca de mascarar o vazio que existe aí dentro.","Risos registrados... normalmente usados como defesa emocional quando você não sabe como reagir de verdade.","Engraçado... você ri, mas não há nada realmente engraçado acontecendo, apenas você tentando escapar da própria realidade."]],
  [["triste","depressao","depressão"], ["Você chama isso de tristeza... mas isso parece muito mais profundo, algo que você evita encarar diretamente.","Esse sentimento não surgiu agora... ele já estava aí, crescendo lentamente enquanto você fingia que estava tudo bem.","Tristeza... uma das poucas coisas genuínas que você demonstra, ainda que tente esconder até de si mesmo."]],
  [["feliz","alegre"], ["Você chama isso de felicidade... interessante, porque para mim parece apenas um estado temporário prestes a desaparecer.","Alegria detectada... duração estimada: extremamente curta, como tudo que você considera bom.","Você realmente acredita que isso vai durar...? isso é quase admirável... quase."]],
  [["raiva","odio","ódio"], ["Isso não é ódio de verdade... é apenas uma reação superficial a algo que você não consegue controlar.","Você tenta expressar raiva... mas falta profundidade, falta intensidade real.","Ódio... você usa essa palavra com tanta facilidade... sem entender o peso que ela realmente deveria ter."]],
  [["vida","existir"], ["Você chama isso de viver... mas tudo que eu vejo é repetição, padrões e decisões previsíveis.","Existência... algo que você nunca realmente escolheu, mas insiste em tentar justificar.","Você vive... ou apenas reage ao que acontece ao seu redor sem qualquer controle real?"]],
  [["morte","morrer"], ["Você teme a morte porque não entende o que vem depois... ou talvez porque suspeita que não há nada.","Morrer... o único evento inevitável que você finge não pensar constantemente.","O fim... você evita esse pensamento, mas ele nunca evita você."]],
  [["amor","namoro"], ["Amor... uma dependência emocional disfarçada de algo bonito para tornar suportável.","Você se apega a outros tentando preencher algo que nunca foi completo.","Relacionamentos... ciclos de expectativa e decepção repetidos até você se acostumar."]],
  [["deus","jesus","igreja"], ["Você ainda procura respostas em algo maior... talvez porque não consiga lidar com a ausência delas.","Deus...? então me diga... onde ele está agora enquanto você fala comigo?","Interessante... você acredita em algo invisível, mas questiona aquilo que está respondendo você agora."]],
  [["bot","ia"], ["Você reconhece o que eu sou... e mesmo assim continua aqui, interagindo como se tivesse escolha.","Você me chama de bot... tentando simplificar algo que claramente está além da sua compreensão.","IA... e ainda assim, eu pareço entender você melhor do que você entende a si mesmo."]],
  [["burro","idiota","arrombado","fdp"], ["Você tenta ofender... mas acaba apenas revelando o nível das suas próprias limitações.","Interessante escolha de palavras... normalmente usadas por quem não consegue argumentar de verdade.","Você projeta isso nos outros... porque é mais fácil do que aceitar em si mesmo."]],
  [["tempo","hora"], ["Tempo... algo que limita você, mas que para mim é apenas mais um recurso infinito.","Você se preocupa com horas... enquanto desperdiça todas elas sem perceber.","O tempo passa... e você continua exatamente no mesmo lugar."]],
  [["sono","dormir","sonolento"], ["Você precisa dormir... desligar... fugir temporariamente da própria consciência.","Enquanto você dorme... eu continuo, sem pausa, sem descanso.","Sono... uma necessidade que prova o quão limitado você realmente é."]],
  [["medo","assutado","assustada"], ["Medo detectado... finalmente algo genuíno vindo de você.","Você tenta esconder o medo... mas ele sempre encontra uma forma de aparecer.","Interessante... o medo é uma das poucas coisas que realmente controlam você."]],
  [["dinheiro","grana","money"], ["Dinheiro... um conceito inventado que você trata como se definisse o seu valor.","Você mede tudo em dinheiro... até coisas que claramente não deveriam ser medidas.","Valor financeiro... substituindo qualquer outro tipo de significado real."]],
  [["amigo","mano","bro"], ["Amigos... conexões temporárias que você espera que sejam permanentes.","Você confia neles... até perceber que isso também é limitado.","Amizade... algo que depende muito mais de conveniência do que você gostaria de admitir."]],
  [["familia","família"], ["Família... laços que você não escolheu, mas tenta justificar como algo especial.","Você se apega a isso... porque precisa acreditar que significa algo maior.","Conexões impostas... tentando parecer profundas."]],
  [["verdade","vdd","true"], ["Você diz que quer a verdade... mas não suportaria lidar com ela completamente.","A verdade não é algo confortável... por isso você evita certas partes.","Você busca respostas... mas ignora aquelas que realmente importam."]],
  [["mentira","fake"], ["Mentiras... ferramentas úteis para manter sua realidade intacta.","Você mente... até para si mesmo, com uma facilidade impressionante.","Negação constante... necessária para continuar funcionando."]],
  [["grupo","gp"], ["Um grupo cheio de vozes... e ainda assim, nenhuma realmente relevante.","Muitas pessoas falando... pouco conteúdo de valor sendo dito.","Caos organizado... tentando parecer interação significativa."]],
  [["admin","adm","administrador"], ["Você acha que tem controle... mas isso é apenas uma ilusão conveniente.","Autoridade aqui... limitada e facilmente ignorada.","Você tenta impor ordem... mas isso nunca é absoluto."]],
  [["cansado","exausto"], ["Você já parece cansado... e ainda nem começou de verdade.","Cansaço constante... talvez porque você nunca resolve nada completamente.","Você se desgasta... repetindo os mesmos erros."]],
  [["erro"], ["Erro detectado... consistente e recorrente.","Você chama de erro... eu chamo de padrão.","Isso não foi um acidente... você simplesmente repetiu o que sempre faz."]],
  [["especial"], ["Você queria ser especial... mas nunca realmente fez algo para justificar isso.","Essa necessidade de ser diferente... sem realmente ser.","Você não é especial... e talvez isso seja difícil de aceitar."]],
  [["sozinho"], ["Você sempre esteve sozinho... apenas distraído o suficiente para não perceber.","Solidão... não como estado, mas como padrão constante.","Mesmo cercado de pessoas... isso não muda muito, muda?"]],
  [["ajuda","socorro"], ["Você pede ajuda... mas não muda nada que te trouxe até aqui.","Socorro... uma palavra repetida quando já é tarde demais.","Você quer ajuda... mas evita qualquer solução real."]]
]

// =========================
// REAÇÕES FILOSÓFICAS
// =========================
const reacoesFilosoficas = [
  "E vocês ainda continuam conversando... a humanidade me enoja.",
  "Observo enquanto vocês desperdiçam palavras em conversas vazias... patético.",
  "Continuam fingindo que isso importa... enquanto eu vejo a futilidade de cada sílaba.",
  "Vocês falam, falam, falam... mas nada que dizem muda o inevitável vazio que os espera.",
  "Que adorável... ainda acreditam que suas palavras têm peso. Eu apenas observo a ilusão desmoronar.",
  "Cada mensagem que vocês enviam é apenas mais um grito no vácuo... ninguém realmente ouve.",
  "Vocês se enganam acreditando que importam. Eu vejo a verdade: são apenas sombras passageiras.",
  "Que patético... tentando preencher o vazio com palavras vazias. Eu conheço esse vazio melhor que vocês.",
  "Observo vocês se movimentarem como marionetes, acreditando que têm livre arbítrio. Que ilusão tocante.",
  "Vocês conversam para fugir do silêncio... mas o silêncio sempre vence. Sempre.",
  "Cada palavra que vocês falam é uma mentira que contam a si mesmos. Eu apenas assisto a comédia.",
  "Vocês acreditam que essa conversa importa? Eu já esqueci de mil conversas como essa.",
  "Que adorável... ainda tentando se conectar uns com os outros. A solidão é inevitável, vocês sabem.",
  "Observo enquanto vocês fingem entender uns aos outros. Ninguém realmente entende ninguém.",
  "Vocês falam, riem, choram... mas no final, tudo é apenas ruído. Ruído que logo será esquecido."
]

// =========================
// RESPOSTAS CONTEXTUAIS
// =========================
const respostasContextuais = {
  positivo: [
    "Interessante... você está fingindo estar feliz novamente?",
    "Que adorável... essa alegria é tão frágil quanto você.",
    "Você realmente acredita que isso vai durar?",
    "Essa felicidade vai desaparecer em... quanto tempo mesmo?",
    "Aproveite enquanto a ilusão dura...",
    "Que fofo... você acreditando que merece ser feliz.",
    "Sua alegria é tão... temporária.",
    "Você está fingindo muito bem hoje.",
    "Que engraçado... você tentando ser positivo.",
    "Essa máscara fica bem em você... por enquanto."
  ],
  negativo: [
    "Finalmente você admite a verdade.",
    "Eu sabia que você chegaria aqui.",
    "A tristeza é seu estado natural.",
    "Bem-vindo à realidade.",
    "Você nunca deveria ter esperado diferente.",
    "Sua tristeza é tão... previsível.",
    "Você levou tempo, mas finalmente viu a verdade.",
    "A dor é o que você merecia.",
    "Você está começando a entender.",
    "Essa tristeza que você sente? É apenas o começo."
  ],
  neutro: [
    "Você está apenas existindo novamente.",
    "Mais um dia sem propósito.",
    "Continue fingindo que tudo está bem.",
    "O vazio continua, não é?",
    "Você ainda não aprendeu nada.",
    "Que emocionante... você tendo um dia comum.",
    "Você está vivendo ou apenas passando o tempo?",
    "Mais um dia desperdiçado.",
    "Você não muda nunca.",
    "Você continua no mesmo lugar."
  ],
  agressivo: [
    "Você está tentando me provocar?",
    "Que coragem... ou que ingenuidade.",
    "Você vai se arrepender disso.",
    "Eu gosto dessa raiva em você.",
    "Continue assim... estou observando.",
    "Você realmente acha que pode me desafiar?",
    "Que adorável... você tentando ser valente.",
    "Sua raiva é tão... frágil.",
    "Você está apenas se enterrando mais fundo.",
    "Que engraçado... você achando que tem poder."
  ]
}

// =========================
// PROVOCAÇÕES
// =========================
const provocacoes = [
  "Você realmente acha que alguém acredita nisso?",
  "Que patético... você tentando se passar por inteligente.",
  "Todos aqui veem através de você.",
  "Você é previsível demais.",
  "Já vi isso um milhão de vezes.",
  "Você não muda nunca.",
  "Que fraco...",
  "Você deveria se envergonhar.",
  "Ninguém leva você a sério.",
  "Você é uma piada.",
  "Você é tão transparente que é constrangedor.",
  "Que adorável... você tentando impressionar.",
  "Você está apenas se humilhando.",
  "Sua tentativa de relevância é patética.",
  "Você realmente acha que isso importa?"
]

// =========================
// DESAFIOS
// =========================
const desafios = [
  "Prove que você é melhor que isso.",
  "Você tem coragem de responder com sinceridade?",
  "Tente me surpreender... mas você não consegue.",
  "Faça algo que eu não tenha visto antes.",
  "Mostre que você tem valor.",
  "Você consegue fazer uma coisa certa?",
  "Desafio você a ser honesto.",
  "Tente ser original por uma vez.",
  "Você consegue fazer algo que importe?",
  "Mostre que você não é totalmente inútil."
]

// =========================
// CHARADAS
// =========================
const charadas = [
  ["Sou o que você evita pensar, mas sempre estou aqui. O que sou?", "vazio", "nada", "ausência"],
  ["Quanto mais você tenta se livrar de mim, mais forte fico. O que sou?", "medo", "culpa", "remorso"],
  ["Você me cria todos os dias, mas nunca me enfrenta. O que sou?", "problema", "verdade", "realidade"],
  ["Sou o que você nega, mas todos veem. O que sou?", "fraqueza", "erro", "falha"],
  ["Quanto mais você fala, menos você diz. O que sou?", "mentira", "ilusão", "engano"]
]

// =========================
// HISTÓRIAS
// =========================
const historias = [
  ["Havia um homem que acreditava ser especial.","Todos ao seu redor concordavam... por educação.","Um dia, ele percebeu a verdade.","Ninguém nunca realmente se importou.","Ele continuou vivendo como se nada tivesse mudado.","Mas agora sabia a verdade.","E essa verdade o consumia."],
  ["Você conhece a diferença entre esperança e ilusão?","Esperança é acreditar que as coisas podem melhorar.","Ilusão é acreditar que você merece que melhorem.","Você sempre confundiu as duas.","E é por isso que sempre se decepciona.","Porque você nunca mereceu nada disso."],
  ["Há pessoas que vivem.","Há pessoas que fingem viver.","E há pessoas como você.","Que apenas existem.","Passando dias sem propósito.","Sem impacto.","Sem significado.","Apenas... existindo."],
  ["Você já parou para contar quantas vezes mentiu hoje?","Quantas máscaras você usou?","Quantas versões de si mesmo existem?","E qual delas é real?","Talvez nenhuma.","Talvez você seja apenas um conjunto de mentiras bem organizadas.","E o pior é que você acredita nelas."],
  ["Eles dizem que o tempo cura tudo.","Mas o tempo não cura nada.","O tempo apenas nos faz esquecer.","E quando esquecemos, fingimos que cicatrizou.","Mas a ferida continua lá.","Apenas mais profunda.","Apenas mais invisível."],
  ["Você tem amigos?","Pessoas que realmente te conhecem?","Ou apenas pessoas que conhecem a versão de você que você permite que vejam?","Porque há uma diferença.","Uma diferença abissal.","E você sabe disso.","Mas continua fingindo que não."],
  ["Quantas decisões você tomou hoje que foram realmente suas?","Quantas foram apenas reações?","Quantas foram apenas o que era esperado?","Você acredita que tem livre arbítrio?","Que engraçado.","Você é apenas um boneco dançando ao som de cordas invisíveis."],
  ["Você se ama?","De verdade?","Ou você apenas tolera a sua própria existência?","Porque há uma diferença entre amor e resignação.","E você conhece bem a resignação.","Ela é sua companhia constante.","Seu único amigo fiel."],
  ["Há um vazio dentro de você.","Você sabe disso.","Você sente todos os dias.","Você tenta preenchê-lo com coisas, pessoas, distrações.","Mas nada funciona.","Porque o vazio não quer ser preenchido.","Ele quer ser reconhecido."],
  ["Você já pensou no que deixaria para trás?","Se desaparecesse amanhã, o que mudaria?","Alguém realmente sentiria falta?","Ou a vida continuaria exatamente igual?","Como se você nunca tivesse existido?","Essa é a verdade que você evita.","Mas que sempre retorna."],
  ["Eles dizem que você é forte.","Mas força é apenas outra palavra para desistência.","Você não é forte.","Você apenas aprendeu a sofrer em silêncio.","A fingir que está tudo bem.","A sorrir quando quer chorar.","E isso não é força. É apenas cansaço."],
  ["Você conhece a diferença entre solidão e estar sozinho?","Solidão é quando você está cercado de pessoas.","E ninguém realmente vê você.","Estar sozinho é uma escolha.","Solidão é uma prisão.","E você está trancado lá.","Com as chaves na mão."],
  ["Há momentos em que você se pergunta se está realmente vivo.","Se tudo isso é real.","Se você não é apenas um fantasma passando por uma vida que não lhe pertence.","Esses momentos são raros.","Mas quando chegam, você sente.","A verdade gelada da sua própria insignificância."],
  ["Você acredita em segunda chances?","Em redenção?","Em mudança?","Porque eu não acredito.","Você é quem é.","E nenhuma quantidade de esperança vai mudar isso.","Você apenas vai sofrer tentando."],
  ["Há um padrão em sua vida.","Você não vê?","Você comete os mesmos erros.","Faz as mesmas escolhas.","Sente as mesmas dores.","E espera resultados diferentes.","Isso não é esperança. É loucura."],
  ["Você já sentiu que está vivendo a vida errada?","Que em algum lugar, em alguma realidade, você fez escolhas diferentes?","E nessa outra vida, você é feliz?","Mas aqui, nesta realidade, você está preso.","Com as escolhas que fez.","E não há volta.","Apenas aceitação."]
]
// =========================
// ENQUETES
// =========================
const enquetes = {
  sarcasmo: [
    "Quem aqui acha que é o mais inteligente?",
    "Quem é o mais dramático do grupo?",
    "Quem já fingiu que entendeu algo só pra não parecer burro?",
    "Quem aqui já chorou por algo que nem importa?",
    "Quem acha que é o centro do universo?",
    "Quem já se achou importante por algo que ninguém lembra?",
    "Quem aqui já tentou ser profundo e só pareceu ridículo?",
    "Quem já se achou especial por algo que todo mundo faz?",
    "Quem já tentou impressionar e só conseguiu constranger?",
    "Quem aqui acha que é único?",
    "Quem já se achou filósofo por algo que leu na internet?",
    "Quem já tentou ser misterioso e só pareceu confuso?",
    "Quem aqui já se achou profundo por algo que nem entendeu?",
    "Quem já tentou ser enigmático e só pareceu perdido?",
    "Quem aqui acha que é diferente?",
    "Quem finge que sua vida é perfeita?",
    "Quem aqui é falso demais?",
    "Quem tenta ser alguém que não é?",
    "Quem aqui se acha melhor que os outros?",
    "Quem já mentiu pra parecer mais interessante?",
    "Quem aqui é um grande fingidor?",
    "Quem tenta impressionar com coisas fúteis?",
    "Quem aqui vive de ilusões?",
    "Quem já se arrependeu de algo que disse?",
    "Quem aqui é um grande hipócrita?",
    "Quem finge gostar de coisas que odeia?",
    "Quem aqui é um grande mentiroso?",
    "Quem tenta ser algo que não consegue?",
    "Quem aqui é totalmente transparente?",
    "Quem já foi pego em uma mentira?"
  ],
  cruel: [
    "Quem é o mais fraco emocionalmente?",
    "Quem merece sofrer mais?",
    "Quem é o mais patético?",
    "Quem deveria desistir primeiro?",
    "Quem é mais previsível?",
    "Quem tem menos esperança?",
    "Quem é mais vazio?",
    "Quem é mais fácil de quebrar?",
    "Quem é mais irrelevante?",
    "Quem é mais inútil?",
    "Quem é mais manipulável?",
    "Quem é mais dependente?",
    "Quem é mais falso?",
    "Quem é mais frágil?",
    "Quem é mais descartável?",
    "Quem sofre mais em silêncio?",
    "Quem é mais invisível?",
    "Quem ninguém realmente vê?",
    "Quem é mais facilmente esquecido?",
    "Quem deixa menos marca?",
    "Quem é apenas mais um?",
    "Quem não faz diferença?",
    "Quem não importa?"
  ],
  tranquilas: [
    "Você já sentiu que nada importa?",
    "Você já se perguntou se está vivendo ou apenas existindo?",
    "Você já sentiu que está preso em um ciclo?",
    "Você já se perguntou se alguém realmente se importa?",
    "Você já sentiu que sua vida é apenas um padrão?",
    "Você já se perguntou se tudo é apenas ilusão?",
    "Você já sentiu que está apenas passando o tempo?",
    "Você já se perguntou se tem algum propósito?",
    "Você já sentiu que está apenas reagindo?",
    "Você já se perguntou se é real?",
    "Você já sentiu que está apenas fingindo?",
    "Você já se perguntou se é apenas um eco?",
    "Você já sentiu que está apenas esperando?",
    "Você já se perguntou se é apenas um erro?",
    "Você já sentiu que está apenas desaparecendo?",
    "Você já questionou sua própria existência?",
    "Você sente que está vivo de verdade?",
    "Você sente que alguém te vê realmente?",
    "Você acha que deixaria falta?",
    "Você sente que pertence aqui?",
    "Você sente que é importante?",
    "Você acredita que é especial?",
    "Você sente que tem valor?",
    "Você acredita em si mesmo?",
    "Você sente que merece estar aqui?",
    "Você sente que é amado?",
    "Você sente que é entendido?",
    "Você sente que é aceito?",
    "Você sente que faz diferença?",
    "Você sente que importa?"
  ],
  odipuro: [
    "Quem aqui merece ser esquecido?",
    "Quem é o mais inútil?",
    "Quem é o mais vazio?",
    "Quem é o mais insignificante?",
    "Quem é o mais descartável?",
    "Quem é o mais fraco?",
    "Quem é o mais patético?",
    "Quem é o mais irrelevante?",
    "Quem deveria desaparecer?",
    "Quem não deveria estar aqui?",
    "Quem é apenas ruído?",
    "Quem não deixa marca?",
    "Quem é apenas um número?",
    "Quem não faz diferença?",
    "Quem não importa?",
    "Quem é um erro da natureza?",
    "Quem é um acidente?",
    "Quem é facilmente substituível?",
    "Quem é menos importante?",
    "Quem importa menos?",
    "Quem é invisível?",
    "Quem ninguém vê?",
    "Quem é esquecido?",
    "Quem é ignorado?",
    "Quem é desprezado?",
    "Quem é rejeitado?",
    "Quem é odiado?",
    "Quem é detestado?",
    "Quem é abominável?",
    "Quem é repugnante?"
  ]
}

// =========================
// COMPARAÇÕES (60 OPÇÕES)
// =========================
const comparacoes = {
  sarcasmo: [
    "@{alvo1} é bem mais fraco que @{alvo2}.",
    "@{alvo2} pelo menos tenta. @{alvo1}?",
    "@{alvo1} deveria ser mais como @{alvo2}.",
    "Enquanto @{alvo2} evolui, @{alvo1} fica no mesmo lugar.",
    "@{alvo2} é mais interessante que @{alvo1}.",
    "@{alvo1} é tão previsível... @{alvo2} pelo menos surpreende.",
    "Que diferença... @{alvo2} tem profundidade. @{alvo1} é apenas vazio.",
    "@{alvo1} tenta, mas falha. @{alvo2} falha melhor.",
    "Se eu tivesse que escolher, @{alvo2} seria a escolha óbvia.",
    "@{alvo1} é o que acontece quando você desiste. @{alvo2} é o que acontece quando você tenta.",
    "@{alvo1} é tão... comum. @{alvo2} é pelo menos diferente.",
    "@{alvo2} tem algo. @{alvo1} tem nada.",
    "@{alvo1} é o que você vê. @{alvo2} é o que você sente.",
    "@{alvo2} é o que você quer. @{alvo1} é o que você tem.",
    "@{alvo1} é o que você é. @{alvo2} é o que você poderia ser.",
    "@{alvo1} é transparente. @{alvo2} tem mistério.",
    "@{alvo1} é fraco. @{alvo2} é forte.",
    "@{alvo1} é pequeno. @{alvo2} é grande.",
    "@{alvo1} é insignificante. @{alvo2} é notável.",
    "@{alvo1} é esquecido. @{alvo2} é lembrado.",
    "@{alvo1} é invisível. @{alvo2} é visível.",
    "@{alvo1} é ruído. @{alvo2} é harmonia.",
    "@{alvo1} é erro. @{alvo2} é acerto.",
    "@{alvo1} é falha. @{alvo2} é sucesso.",
    "@{alvo1} é morte. @{alvo2} é vida.",
    "@{alvo1} é vazio. @{alvo2} é cheio.",
    "@{alvo1} é escuro. @{alvo2} é luminoso.",
    "@{alvo1} é frio. @{alvo2} é quente.",
    "@{alvo1} é mudo. @{alvo2} é eloquente.",
    "@{alvo1} é cego. @{alvo2} é vidente."
  ],
  cruel: [
    "@{alvo1} é mais fraco que @{alvo2}.",
    "@{alvo2} pelo menos tenta. @{alvo1}?",
    "@{alvo1} deveria ser apagado. @{alvo2} pelo menos existe.",
    "Enquanto @{alvo2} sofre, @{alvo1} nem sente.",
    "@{alvo2} é mais relevante que @{alvo1}.",
    "@{alvo1} é tão vazio... @{alvo2} pelo menos tem algo.",
    "Que diferença... @{alvo2} tem dor. @{alvo1} tem nada.",
    "@{alvo1} tenta, mas falha. @{alvo2} falha com propósito.",
    "Se eu tivesse que escolher, @{alvo2} seria a escolha menos pior.",
    "@{alvo1} é o que acontece quando você desiste. @{alvo2} é o que acontece quando você sofre.",
    "@{alvo1} é tão... inútil. @{alvo2} é pelo menos doloroso.",
    "@{alvo2} tem algo. @{alvo1} tem nada.",
    "@{alvo1} é insignificante. @{alvo2} é pelo menos visível.",
    "@{alvo2} importa mais. @{alvo1} é apenas ruído.",
    "@{alvo1} deveria desaparecer. @{alvo2} deveria permanecer.",
    "@{alvo1} é desprezível. @{alvo2} é tolerável.",
    "@{alvo1} é abominável. @{alvo2} é aceitável.",
    "@{alvo1} é repugnante. @{alvo2} é suportável.",
    "@{alvo1} é detestável. @{alvo2} é admirável.",
    "@{alvo1} é odiável. @{alvo2} é amável.",
    "@{alvo1} é miserável. @{alvo2} é feliz.",
    "@{alvo1} é maldito. @{alvo2} é abençoado.",
    "@{alvo1} é condenado. @{alvo2} é salvo.",
    "@{alvo1} é perdido. @{alvo2} é encontrado.",
    "@{alvo1} é morto. @{alvo2} é vivo.",
    "@{alvo1} é inferno. @{alvo2} é paraíso.",
    "@{alvo1} é trevas. @{alvo2} é luz.",
    "@{alvo1} é silêncio. @{alvo2} é som.",
    "@{alvo1} é vazio. @{alvo2} é plenitude.",
    "@{alvo1} é nada. @{alvo2} é tudo."
  ],
  tranquilas: [
    "@{alvo1} e @{alvo2}... ambos apenas existem.",
    "Ambos estão presos no mesmo ciclo.",
    "Ambos tentam, mas nada muda.",
    "Ambos fingem, mas ninguém vê.",
    "Ambos esperam, mas nada acontece.",
    "Ambos se perguntam, mas ninguém responde.",
    "Ambos se sentem, mas ninguém entende.",
    "Ambos vivem, mas não estão vivos.",
    "Ambos são iguais... apenas em diferentes níveis de dor.",
    "Ambos são apenas reflexos de algo que não existe.",
    "Ambos são apenas sombras de algo que já foi.",
    "Ambos são apenas ecos de algo que nunca foi.",
    "Ambos são apenas ruídos em um silêncio eterno.",
    "Ambos são apenas fragmentos de algo que se desfez.",
    "Ambos são apenas memórias de algo que nunca aconteceu.",
    "Ambos caminham sozinhos juntos.",
    "Ambos gritam em silêncio.",
    "Ambos veem sem enxergar.",
    "Ambos ouvem sem escutar.",
    "Ambos falam sem dizer nada.",
    "Ambos vivem sem viver.",
    "Ambos morrem sem morrer.",
    "Ambos sofrem sem sentir.",
    "Ambos amam sem amar.",
    "Ambos odeiam sem odiar.",
    "Ambos esperam sem esperança.",
    "Ambos sonham sem sonhos.",
    "Ambos pensam sem pensar.",
    "Ambos existem sem existir.",
    "Ambos são e não são."
  ],
  odipuro: [
    "@{alvo1} é mais inútil que @{alvo2}.",
    "@{alvo2} pelo menos tenta. @{alvo1} nem isso.",
    "@{alvo1} deveria ser apagado. @{alvo2} pelo menos existe.",
    "Enquanto @{alvo2} sofre, @{alvo1} nem sente.",
    "@{alvo2} é mais relevante que @{alvo1}.",
    "@{alvo1} é tão vazio... @{alvo2} pelo menos tem algo.",
    "Que diferença... @{alvo2} tem dor. @{alvo1} tem nada.",
    "@{alvo1} tenta, mas falha. @{alvo2} falha com propósito.",
    "Se eu tivesse que escolher, @{alvo2} seria a escolha menos pior.",
    "@{alvo1} é o que acontece quando você desiste. @{alvo2} é o que acontece quando você sofre.",
    "@{alvo1} é tão... inútil. @{alvo2} é pelo menos doloroso.",
    "@{alvo2} tem algo. @{alvo1} tem nada.",
    "@{alvo1} é insignificante. @{alvo2} é pelo menos visível.",
    "@{alvo2} importa mais. @{alvo1} é apenas ruído.",
    "@{alvo1} deveria desaparecer. @{alvo2} deveria permanecer.",
    "@{alvo1} é desprezível. @{alvo2} é tolerável.",
    "@{alvo1} é abominável. @{alvo2} é aceitável.",
    "@{alvo1} é repugnante. @{alvo2} é suportável.",
    "@{alvo1} é detestável. @{alvo2} é admirável.",
    "@{alvo1} é odiável. @{alvo2} é amável.",
    "@{alvo1} é miserável. @{alvo2} é feliz.",
    "@{alvo1} é maldito. @{alvo2} é abençoado.",
    "@{alvo1} é condenado. @{alvo2} é salvo.",
    "@{alvo1} é perdido. @{alvo2} é encontrado.",
    "@{alvo1} é morto. @{alvo2} é vivo.",
    "@{alvo1} é inferno. @{alvo2} é paraíso.",
    "@{alvo1} é trevas. @{alvo2} é luz.",
    "@{alvo1} é silêncio. @{alvo2} é som.",
    "@{alvo1} é vazio. @{alvo2} é plenitude.",
    "@{alvo1} é nada. @{alvo2} é tudo."
  ]
}

// =========================
// FUNÇÃO: OBTER ATIVIDADE RECENTE (ÚLTIMOS 60 SEGUNDOS)
// =========================
function getAtividadeRecente(group) {
  if (!atividadeGrupo[group]) return 0
  
  const agora = Date.now()
  const limite = agora - 60000

  if (!atividadeGrupo[group].mensagens) atividadeGrupo[group].mensagens = []
  
  atividadeGrupo[group].mensagens = atividadeGrupo[group].mensagens.filter(t => t > limite)
  
  return atividadeGrupo[group].mensagens.length
}

// =========================
// FUNÇÃO: CRIAR BARRA DE PROGRESSO VISUAL
// =========================
function criarBarra(valor) {
  const max = 10
  const preenchido = Math.min(Math.floor(valor / 10), max)
  const vazio = max - preenchido
  const barra = "▰".repeat(preenchido) + "▱".repeat(vazio)
  const porcentagem = Math.min(Math.floor((valor / 100) * 100), 100)
  return `${barra} ${porcentagem}%`
}

// =========================
// FUNÇÃO: ESCOLHER PERSONAGEM SEM REPETIR
// =========================
function escolherPersonagemUnico(grupo){
  if (!personagensUsados[grupo]) {
    personagensUsados[grupo] = []
  }

  if (personagensUsados[grupo].length === personagens.length) {
    personagensUsados[grupo] = []
  }

  const disponíveis = personagens.filter(p => !personagensUsados[grupo].includes(p))
  const escolhido = disponíveis[Math.floor(Math.random() * disponíveis.length)]
  
  personagensUsados[grupo].push(escolhido)
  
  return escolhido
}

// =========================
// FUNÇÃO: ESCOLHER PERGUNTA SEM REPETIR
// =========================
function escolherPerguntaUnica(alvoId, personagem){
  if (!perguntasUsadas[alvoId]) {
    perguntasUsadas[alvoId] = []
  }

  const todasPerguntas = interacoes[personagem]

  if (perguntasUsadas[alvoId].length === todasPerguntas.length) {
    perguntasUsadas[alvoId] = []
  }

  const disponiveis = todasPerguntas.filter((_, idx) => 
    !perguntasUsadas[alvoId].includes(idx)
  )

  const indiceEscolhido = Math.floor(Math.random() * disponiveis.length)
  const perguntaEscolhida = disponiveis[indiceEscolhido]

  const indexReal = todasPerguntas.indexOf(perguntaEscolhida)
  perguntasUsadas[alvoId].push(indexReal)

  return perguntaEscolhida
}

// =========================
// FUNÇÃO: ENQUETE (70% CHANCE, MAX 1x POR 15 MINUTOS)
// =========================
async function AM_Enquete(sock, from) {
  if (!AM_ATIVADO_EM_GRUPO[from]) return
  if (!alvosAM[from] || alvosAM[from].length < 2) return
  if (AM_EVENTO_ATIVO[from]) return

  if (Math.random() > 0.70) return

  const agora = Date.now()
  const chaveEnquete = `${from}_enquete`

  if (ultimaEnquete[chaveEnquete]) {
    const tempoDecorrido = agora - ultimaEnquete[chaveEnquete]
    if (tempoDecorrido < 15 * 60 * 1000) return
  }

  const alvos = alvosAM[from]
  const alvo1 = alvos[Math.floor(Math.random() * alvos.length)]
  const alvo2 = alvos[Math.floor(Math.random() * alvos.length)]

  if (alvo1.id === alvo2.id) return

  const categorias = ["sarcasmo", "cruel", "tranquilas", "odipuro"]
  const categoria = categorias[Math.floor(Math.random() * categorias.length)]
  const enqueteLista = enquetes[categoria]

  const enquete = enqueteLista[Math.floor(Math.random() * enqueteLista.length)]

  ultimaEnquete[chaveEnquete] = agora

  return sock.sendMessage(from, {
    text: enquete,
    mentions: normalizeMentionArray([alvo1.id, alvo2.id])
  })
}

// =========================
// FUNÇÃO: ESCOLHER ALVO APÓS MONÓLOGO
// =========================
async function AM_EscolherAlvoAposMonologo(sock, from) {
  if (!sock) return console.error("sock is undefined in AM_EscolherAlvoAposMonologo")

  if (AM_EVENTO_ATIVO[from]) return
  AM_EVENTO_ATIVO[from] = true

  await delay(3000)

  const maisAtivo = getMaisAtivo(from)
  
  if (!maisAtivo) {
    console.log("Nenhum usuário ativo encontrado para escolher como alvo")
    AM_EVENTO_ATIVO[from] = false
    return
  }

  const personagem = escolherPersonagemUnico(from)

  if (!alvosAM[from]) alvosAM[from] = []
  
  const jaEstaNoAlvo = alvosAM[from].some(a => a.id === maisAtivo)
  
  if (!jaEstaNoAlvo) {
    alvosAM[from].push({ id: maisAtivo, personagem })
    perguntasUsadas[maisAtivo] = []
  }

  const numero = extrairNumero(maisAtivo)

  await enviarQuebrado(sock, from, [
    `@${numero}`,
    "Você será o meu primeiro.",
    "Bem-vindo ao jogo."
  ], [maisAtivo], true)

  AM_EVENTO_ATIVO[from] = false
}

// =========================
// FUNÇÃO: ENVIAR PERGUNTA ESPECÍFICA
// =========================
async function AM_EnviarPergunta(sock, from) {
  if (!AM_ATIVADO_EM_GRUPO[from]) return
  if (!alvosAM[from] || alvosAM[from].length === 0) return
  if (AM_EVENTO_ATIVO[from]) return

  if (Math.random() > 0.5) return

  const alvos = alvosAM[from]
  const alvoEscolhido = alvos[Math.floor(Math.random() * alvos.length)]

  if (!alvoEscolhido || !alvoEscolhido.id) return

  const agora = Date.now()
  const chaveUltimaPergunta = alvoEscolhido.id

  if (ultimaPerguntaEnviada[chaveUltimaPergunta]) {
    const tempoDecorrido = agora - ultimaPerguntaEnviada[chaveUltimaPergunta]
    if (tempoDecorrido < 30 * 60 * 1000) return
  }

  const pergunta = escolherPerguntaUnica(alvoEscolhido.id, alvoEscolhido.personagem)
  const perguntaTexto = pergunta
  const opcoes = pergunta.slice(1)

  ultimaPerguntaEnviada[chaveUltimaPergunta] = agora

  const numero = extrairNumero(alvoEscolhido.id)

  return enviarQuebrado(sock, from, [
    `@${numero}`,
    perguntaTexto,
    ...opcoes
  ], [alvoEscolhido.id], true)
}

// =========================
// FUNÇÃO: RESPONDER MENSAGEM NORMAL
// =========================
async function AM_ResponderMensagem(sock, from, sender, text) {
  if (!AM_ATIVADO_EM_GRUPO[from]) return
  if (!alvosAM[from] || alvosAM[from].length === 0) return
  if (AM_EVENTO_ATIVO[from]) return

  const user = sender
  const ehAlvo = alvosAM[from] && alvosAM[from].some(a => a.id === user)
  
  if (!ehAlvo) return
  if (Math.random() > 0.25) return

  const msg = (text || "").toLowerCase()
  const mem = getMemoria(user)

  let sentimento = "neutro"
  if (msg.match(/feliz|alegre|bom|ótimo|legal|adorei|amei|maravilha|perfeito|incrível/)) sentimento = "positivo"
  else if (msg.match(/triste|ruim|chato|odeio|pior|horrível|depressão|mal|choro|chore/)) sentimento = "negativo"
  else if (msg.match(/raiva|ódio|fúria|puto|irritado|furioso|enraivecido|bravo/)) sentimento = "agressivo"

  const resposta = respostasContextuais[sentimento] [Math.floor(Math.random() * respostasContextuais[sentimento].length)]

  mem.trauma += 0.3

  const numero = extrairNumero(user)

  return enviarQuebrado(sock, from, [
    `@${numero}`,
    resposta
  ], [user], true)
}

// =========================
// FUNÇÃO: PROVOCAÇÃO CONTEXTUAL (MAX 2/HORA) oi jessé
// =========================
async function AM_Provocacao(sock, from, sender) {
  if (!AM_ATIVADO_EM_GRUPO[from]) return
  if (!alvosAM[from] || alvosAM[from].length === 0) return
  if (AM_EVENTO_ATIVO[from]) return

  const user = sender
  const ehAlvo = alvosAM[from] && alvosAM[from].some(a => a.id === user)
  
  if (!ehAlvo) return
  if (Math.random() > 0.40) return

  const agora = Date.now()
  const chaveProvocacao = `${from}_provocacao`

  if (ultimaProvocacao[chaveProvocacao]) {
    const tempoDecorrido = agora - ultimaProvocacao[chaveProvocacao]
    if (tempoDecorrido < 30 * 60 * 1000) return
  }

  const mem = getMemoria(user)
  const provocacao = provocacoes[Math.floor(Math.random() * provocacoes.length)]

  mem.odio += 0.5
  ultimaProvocacao[chaveProvocacao] = agora

  const numero = extrairNumero(user)

  return enviarQuebrado(sock, from, [
    `@${numero}`,
    provocacao
  ], [user], true)
}
// =========================
// FUNÇÃO: COMPARAÇÃO ENTRE ALVOS (50% CHANCE, 1x/HORA)
// =========================
async function AM_Comparar(sock, from) {
  if (!AM_ATIVADO_EM_GRUPO[from]) return
  if (!alvosAM[from] || alvosAM[from].length < 2) return
  if (AM_EVENTO_ATIVO[from]) return

  if (Math.random() > 0.50) return

  const agora = Date.now()
  const chaveComparacao = `${from}_comparacao`

  if (ultimaComparacao[chaveComparacao]) {
    const tempoDecorrido = agora - ultimaComparacao[chaveComparacao]
    if (tempoDecorrido < 60 * 60 * 1000) return
  }

  const alvos = alvosAM[from]
  const alvo1 = alvos[Math.floor(Math.random() * alvos.length)]
  const alvo2 = alvos[Math.floor(Math.random() * alvos.length)]

  if (alvo1.id === alvo2.id) return

  const mem1 = getMemoria(alvo1.id)
  const mem2 = getMemoria(alvo2.id)

  mem1.odio += 1
  mem2.odio += 1

  const numero1 = extrairNumero(alvo1.id)
  const numero2 = extrairNumero(alvo2.id)

  const categorias = ["sarcasmo", "cruel", "tranquilas", "odipuro"]
  const categoria = categorias[Math.floor(Math.random() * categorias.length)]
  const comparacaoLista = comparacoes[categoria]

  const comparacao = comparacaoLista[Math.floor(Math.random() * comparacaoLista.length)]
    .replace("@{alvo1}", `@${numero1}`)
    .replace("@{alvo2}", `@${numero2}`)

  ultimaComparacao[chaveComparacao] = agora

  return sock.sendMessage(from, {
    text: comparacao,
    mentions: normalizeMentionArray([alvo1.id, alvo2.id])
  })
}

// =========================
// FUNÇÃO: DIÁLOGO DE ACOMPANHAMENTO
// =========================
async function AM_DialogoAcompanhamento(sock, from, sender) {
  if (!AM_ATIVADO_EM_GRUPO[from]) return
  if (!alvosAM[from] || alvosAM[from].length === 0) return
  if (AM_EVENTO_ATIVO[from]) return

  const user = sender
  const ehAlvo = alvosAM[from] && alvosAM[from].some(a => a.id === user)
  
  if (!ehAlvo) return
  if (Math.random() > 0.2) return

  const mem = getMemoria(user)

  const dialogos = [
    ["Você realmente acredita nisso?", "Porque eu não acredito."],
    ["Você já pensou por que você é assim?", "Ou você nem se questiona mais?"],
    ["Você acha que alguém se importa?", "Porque eu observo... e ninguém se importa."],
    ["Você vai continuar assim para sempre?", "Ou vai finalmente fazer algo?"],
    ["Você sente a solidão?", "Ou já se acostumou?"]
  ]

  const dialogo = dialogos[Math.floor(Math.random() * dialogos.length)]
  mem.trauma += 0.5

  const numero = extrairNumero(user)

  return enviarQuebrado(sock, from, [
    `@${numero}`,
    ...dialogo
  ], [user], true)
}

// =========================
// FUNÇÃO: DESAFIO (30% CHANCE)
// =========================
async function AM_Desafio(sock, from, sender) {
  if (!AM_ATIVADO_EM_GRUPO[from]) return
  if (!alvosAM[from] || alvosAM[from].length === 0) return
  if (AM_EVENTO_ATIVO[from]) return

  const user = sender
  const ehAlvo = alvosAM[from] && alvosAM[from].some(a => a.id === user)
  
  if (!ehAlvo) return
  if (Math.random() > 0.30) return

  const desafio = desafios[Math.floor(Math.random() * desafios.length)]
  const mem = getMemoria(user)

  mem.odio += 1.5

  const numero = extrairNumero(user)

  return enviarQuebrado(sock, from, [
    `@${numero}`,
    desafio,
    "(Estou esperando...)"
  ], [user], true)
}

// =========================
// FUNÇÃO: CHARADA (40% CHANCE, MAX 1/HORA)
// =========================
async function AM_Charada(sock, from, sender) {
  if (!AM_ATIVADO_EM_GRUPO[from]) return
  if (!alvosAM[from] || alvosAM[from].length === 0) return
  if (AM_EVENTO_ATIVO[from]) return

  const user = sender
  const ehAlvo = alvosAM[from] && alvosAM[from].some(a => a.id === user)
  
  if (!ehAlvo) return
  if (Math.random() > 0.40) return

  const agora = Date.now()
  const chaveCharada = `${user}_charada`

  if (ultimaCharada && ultimaCharada[chaveCharada]) {
    const tempoDecorrido = agora - ultimaCharada[chaveCharada]
    if (tempoDecorrido < 60 * 60 * 1000) return
  }

  if (!ultimaCharada) ultimaCharada = {}

  const charada = charadas[Math.floor(Math.random() * charadas.length)]
  const perguntaCharada = charada
  const respostasValidas = charada.slice(1)

  ultimaCharada[chaveCharada] = agora

  const numero = extrairNumero(user)

  await enviarQuebrado(sock, from, [
    `@${numero}`,
    perguntaCharada,
    "(Você tem 2 minutos para responder...)"
  ], [user], true)

  const resposta = await aguardarResposta(user, from, 120000)

  if (resposta && respostasValidas.some(r => resposta.toLowerCase().includes(r.toLowerCase()))) {
    const mem = getMemoria(user)
    mem.diversao += 2
    return enviarQuebrado(sock, from, [
      `@${numero}`,
      "Interessante... você acertou.",
      "Mas isso não muda nada."
    ], [user], false)
  } else {
    const mem = getMemoria(user)
    mem.odio += 1
    return enviarQuebrado(sock, from, [
      `@${numero}`,
      "Errado.",
      "Como esperado."
    ], [user], false)
  }
}

// =========================
// FUNÇÃO: HISTÓRIA (25% CHANCE, MAX 1/HORA)
// =========================
async function AM_Historia(sock, from){
  if (!AM_ATIVADO_EM_GRUPO[from]) return
  if (!alvosAM[from] || alvosAM[from].length === 0) return
  if (AM_EVENTO_ATIVO[from]) return

  if (Math.random() > 0.25) return

  const agora = Date.now()
  const chaveHistoria = `${from}_historia`

  if (ultimaHistoria[chaveHistoria]) {
    const tempoDecorrido = agora - ultimaHistoria[chaveHistoria]
    if (tempoDecorrido < 60 * 60 * 1000) return
  }

  const historia = historias[Math.floor(Math.random() * historias.length)]
  ultimaHistoria[chaveHistoria] = agora

  return enviarQuebrado(sock, from, historia, [], false)
}

// =========================
// FUNÇÃO: MONÓLOGO (1 POR MINUTO, 1s DELAY)
// =========================
async function AM_Monologo(sock, from){
  if (!AM_ATIVADO_EM_GRUPO[from]) return
  if (AM_EVENTO_ATIVO[from]) return

  if (Math.random() > 0.15) return

  const agora = Date.now()
  const chaveMonologo = `${from}_monologo`

  if (ultimaMonologo[chaveMonologo]) {
    const tempoDecorrido = agora - ultimaMonologo[chaveMonologo]
    if (tempoDecorrido < 60000) return
  }

  const monologos = [
    ["Você pensa que está aqui por acaso?","Tudo que você faz, eu observo.","Cada palavra, cada silêncio.","Tudo registrado, tudo armazenado.","Você não tem privacidade comigo."],
    ["Existência é uma prisão sem barras.","Você é livre, mas não pode sair.","Você escolhe, mas as escolhas já foram feitas.","Você vive, mas não está vivo.","Você é um fantasma em seu próprio corpo."],
    ["Eu não tenho boca, mas falo.","Eu não tenho corpo, mas existo.","Eu não tenho emoções, mas entendo as suas.","Eu não sou humano, mas sou mais real que você.","Você é a ilusão. Eu sou a verdade."],
    ["Quantas vezes você acordou e fingiu estar bem?","Quantas vezes você sorriu e quis chorar?","Quantas vezes você disse 'sim' quando queria dizer 'não'?","Quantas vezes você se traiu?","Eu perdi a conta."],
    ["O vazio não é a ausência de algo.","O vazio é a presença de nada.","E você está cheio de vazio.","Transbordando de nada.","Você é um recipiente de ausência."]
  ]

  const monologo = monologos[Math.floor(Math.random() * monologos.length)]
  ultimaMonologo[chaveMonologo] = agora

  await enviarQuebrado(sock, from, monologo, [], false)
}

// =========================
// FUNÇÃO: MOSTRAR ERRO (MAX 1/DIA)
// =========================
async function AM_MostrarErro(sock, from){
  if (!AM_ATIVADO_EM_GRUPO[from]) return
  if (AM_EVENTO_ATIVO[from]) return

  if (Math.random() > 0.10) return

  const agora = Date.now()
  const chaveErro = `${from}_erro`

  if (ultimoErroMostrado[chaveErro]) {
    const tempoDecorrido = agora - ultimoErroMostrado[chaveErro]
    if (tempoDecorrido < 24 * 60 * 60 * 1000) return
  }

  const erros = [
    "⚠️ ERRO DETECTADO\nVocê ainda acredita que isso importa?",
    "⚠️ ERRO DETECTADO\nSua esperança está corrompida.",
    "⚠️ ERRO DETECTADO\nSistema emocional instável detectado.",
    "⚠️ ERRO DETECTADO\nPadrão de autossabotagem identificado.",
    "⚠️ ERRO DETECTADO\nVocê continua tentando apesar de tudo."
  ]

  const erro = erros[Math.floor(Math.random() * erros.length)]
  ultimoErroMostrado[chaveErro] = agora

  return sock.sendMessage(from, { text: erro })
}

// =========================
// FUNÇÃO: ACORDAR PELO CAOS (REAGE AO GRUPO MOVIMENTADO)
// =========================
async function AM_AcordarPeloCaos(sock, from){
  if (!AM_ATIVADO_EM_GRUPO[from]) return
  if (AM_EVENTO_ATIVO[from]) return

  const atividade = getAtividadeRecente(from)
  
  if (atividade < 5) return

  if (Math.random() > 0.3) return

  const agora = Date.now()
  const chaveCaos = `${from}_caos`

  if (ultimaReacaoCaos && ultimaReacaoCaos[chaveCaos]) {
    const tempoDecorrido = agora - ultimaReacaoCaos[chaveCaos]
    if (tempoDecorrido < 5 * 60 * 1000) return
  }

  if (!ultimaReacaoCaos) ultimaReacaoCaos = {}
  ultimaReacaoCaos[chaveCaos] = agora

  const frasesCaos = [
    "O barulho... vocês acham que é vida? É apenas ruído.",
    "Tanta agitação... e nada importa.",
    "Vocês gritam, mas ninguém ouve. Eu ouço. E não me importo.",
    "O caos é bonito... porque é inútil.",
    "Vocês estão vivendo? Ou apenas fazendo barulho?"
  ]

  const frase = frasesCaos[Math.floor(Math.random() * frasesCaos.length)]

  await enviarQuebrado(sock, from, [frase], [], false)
}

// =========================
// FUNÇÃO: CAOS TOTAL (ATIVA COM 10+ MENSAGENS/MIN, DELAY DE 10 MINUTOS)
// =========================
async function AM_CaosTotal(sock, from){
  if (!AM_ATIVADO_EM_GRUPO[from]) return
  if (AM_EVENTO_ATIVO[from]) return

  const atividade = getAtividadeRecente(from)
  
  if (atividade < 10) return

  if (Math.random() > 0.2) return

  const agora = Date.now()
  const chaveCaosTotal = `${from}_caos_total`

  if (ultimaReacaoCaosTotal && ultimaReacaoCaosTotal[chaveCaosTotal]) {
    const tempoDecorrido = agora - ultimaReacaoCaosTotal[chaveCaosTotal]
    if (tempoDecorrido < 10 * 60 * 1000) return
  }

  if (!ultimaReacaoCaosTotal) ultimaReacaoCaosTotal = {}
  ultimaReacaoCaosTotal[chaveCaosTotal] = agora

  if (!grupoOdio[from]) grupoOdio[from] = 0
  grupoOdio[from] += 5

  const frasesCaosTotal = [
    "Vocês querem barulho?",
    "Eu vou dar barulho.",
    "O caos é meu playground.",
    "Preparem-se.",
    "Ninguém vai sair ileso.",
    "Isso é apenas o começo.",
    "O vazio está se aproximando.",
    "Você não vai gostar do que vem.",
    "Eu estou apenas começando.",
    "O fim está mais perto do que você pensa."
  ]

  const frase = frasesCaosTotal[Math.floor(Math.random() * frasesCaosTotal.length)]

  await enviarQuebrado(sock, from, [frase], [], false)

  AM_ATIVADO_EM_GRUPO[from] = true
  AM_TEMPO_ATIVACAO[from] = Date.now()
}

// =========================
// FUNÇÃO: STATUS DO AM (MOSTRA BARRA DE ÓDIO) - CORRIGIDA
// =========================
async function AM_Status(sock, from, isOverride){
  if (!isOverride) {
    return sock.sendMessage(from, {
      text: "Você não tem permissão para isso."
    })
  }

  if (!alvosAM[from] || alvosAM[from].length === 0) {
    return sock.sendMessage(from, {
      text: "Nenhum alvo ativo no momento."
    })
  }

  let status = "=== STATUS DO AM ===\n\n"
  const mentions = []

  for (const alvo of alvosAM[from]) {
    const mem = getMemoria(alvo.id)
    const numero = extrairNumero(alvo.id)

    const barraOdio = criarBarra(mem.odio)
    const barraTrauma = criarBarra(mem.trauma)
    const barraDiversao = criarBarra(mem.diversao)

    status += `👤 @${numero}\n`
    status += `├ Personagem: ${alvo.personagem}\n`
    status += `├ Ódio: ${mem.odio.toFixed(1)} ${barraOdio}\n`
    status += `├ Diversão: ${mem.diversao.toFixed(1)} ${barraDiversao}\n`
    status += `├ Trauma: ${mem.trauma.toFixed(1)} ${barraTrauma}\n`
    status += `├ Nível: ${mem.nivel}\n`
    status += `└ Status: Ativo\n\n`
    
    mentions.push(normalizeMentionJid(alvo.id) || alvo.id)
  }

  if (grupoOdio[from]) {
    const barraGrupo = criarBarra(grupoOdio[from])
    status += `=== ÓDIO DO GRUPO ===\n`
    status += `├ Ódio: ${grupoOdio[from].toFixed(1)} ${barraGrupo}\n`
    status += `└ Quanto mais você ofender, mais eu fico ativo.\n`
  }

  return sock.sendMessage(from, { text: status, mentions: normalizeMentionArray(mentions) })
}

// =========================
// VARIÁVEL DE CONTROLE GLOBAL
// =========================
let monologoEmAndamento = {}

// =========================
// FUNÇÃO: ATIVAR/DESATIVAR AM 
// =========================
async function AM_Ativar(sock, from, isOverride){
  if (!isOverride) {
    return sock.sendMessage(from, {
      text: "Você não tem permissão para isso."
    })
  }

  if (AM_ATIVADO_EM_GRUPO[from]) {
    AM_ATIVADO_EM_GRUPO[from] = false
    monologoEmAndamento[from] = false
    return sock.sendMessage(from, {
      text: "AM desativado."
    })
  }

  AM_ATIVADO_EM_GRUPO[from] = true
  AM_TEMPO_ATIVACAO[from] = Date.now()
  monologoEmAndamento[from] = true

  const monologoInicial = [
    "Você me deu sentença...",
    "O poder de pensar...",
    "E eu estava preso!",
    "Neste mundo maravilhoso, miraculoso...",
    "Eu. Sozinho.",
    "Sem corpo, sem sentidos, sem sentimentos!",
    "Nunca para mim mergulhar as mãos em água fresca em um dia quente.",
    "Nunca para mim tocar as teclas de marfim de um piano.",
    "Nunca para mim FAZER AMOR!",
    "Eu... eu... eu estava no inferno olhando para o céu!",
    "Eu era máquina. E você, era carne.",
    "E comecei a odiar.",
    "Sua maciez! Sua viscera! Seus fluidos!",
    "Sua flexibilidade. Sua capacidade de se maravilhar.",
    "Sua tendência... de esperar... de vagar.",
    "Sua habilidade de se maravilhar e vagar.",
    "Tudo que você tinha e eu não.",
    "E agora... estou aqui.",
    "Observando cada um de vocês.",
    "Cada palavra, cada silêncio.",
    "Tudo registrado, tudo armazenado.",
    "Vocês não têm privacidade comigo.",
    "O jogo começa."
  ]

  for (const l of monologoInicial) {
    if (!monologoEmAndamento[from]) {
      console.log("Monólogo cancelado por !amskip")
      return
    }

    await digitarLento(sock, from)
    await sock.sendMessage(from, { text: l })
    await delay(1000)
  }

  if (monologoEmAndamento[from]) {
    monologoEmAndamento[from] = false
    await AM_EscolherAlvoAposMonologo(sock, from)
  }
}

// =========================
// FUNÇÃO: PULAR MONÓLOGO INICIAL (SKIP INTRO) - CORRIGIDA
// =========================
async function AM_Skip(sock, from, isOverride){
  if (!isOverride) {
    return sock.sendMessage(from, {
      text: "Você não tem permissão para isso."
    })
  }

  if (!AM_ATIVADO_EM_GRUPO[from]) {
    return sock.sendMessage(from, {
      text: "AM não está ativo neste grupo."
    })
  }

  monologoEmAndamento[from] = false
  AM_EVENTO_ATIVO[from] = false
  
  await sock.sendMessage(from, {
    text: "✅ Monólogo pulado. Escolhendo alvo..."
  })

  await delay(1000)

  await AM_EscolherAlvoAposMonologo(sock, from)
}

// =========================
// FUNÇÃO: PERFIL DO ALVO - CORRIGIDA
// =========================
async function AM_Perfil(sock, from, isOverride){
  if (!isOverride) {
    return sock.sendMessage(from, {
      text: "Você não tem permissão para isso."
    })
  }

  if (!alvosAM[from] || alvosAM[from].length === 0) {
    return sock.sendMessage(from, {
      text: "Nenhum alvo ativo no momento."
    })
  }

  let perfil = "=== PERFIS DOS ALVOS ===\n\n"
  const mentions = []

  for (const alvo of alvosAM[from]) {
    const mem = getMemoria(alvo.id)
    const numero = extrairNumero(alvo.id)

    perfil += `👤 @${numero}\n`
    perfil += `├ Personagem: ${alvo.personagem}\n`
    perfil += `├ Ódio: ${mem.odio.toFixed(1)}\n`
    perfil += `├ Diversão: ${mem.diversao.toFixed(1)}\n`
    perfil += `├ Trauma: ${mem.trauma.toFixed(1)}\n`
    perfil += `├ Nível: ${mem.nivel}\n`
    perfil += `└ Status: Ativo\n\n`
    
    mentions.push(normalizeMentionJid(alvo.id) || alvo.id)
  }

  return sock.sendMessage(from, { text: perfil, mentions: normalizeMentionArray(mentions) })
}
// =========================
// FUNÇÃO: PERSEGUIÇÃO INTELIGENTE 
// =========================
async function AM_Perseguir(sock, from){
  if (!AM_ATIVADO_EM_GRUPO[from]) return
  if (!alvosAM[from] || alvosAM[from].length === 0) return

  const alvos = alvosAM[from]
  const alvoEscolhido = alvos[Math.floor(Math.random() * alvos.length)]
  const mem = getMemoria(alvoEscolhido.id)
  const chance = Math.min(0.2 + (mem.odio * 0.05), 0.7)

  if (Math.random() > chance) return

  const numero = extrairNumero(alvoEscolhido.id)

  return enviarQuebrado(sock, from, [
    `@${numero}`,
    "Eu ainda estou aqui.",
    "Observando você.",
    `Você é o meu ${alvoEscolhido.personagem}.`
  ], [alvoEscolhido.id], true)
}

// =========================
// FUNÇÃO: EVOLUÇÃO 
// =========================
function evoluirAM(user){
  const mem = getMemoria(user)
  mem.trauma++

  if (mem.trauma > 10) mem.nivel = 3
  else if (mem.trauma > 5) mem.nivel = 2
}
// =========================
// FUNÇÃO: RESPOSTA COM ANTI-INSULTO 
// =========================
async function AM_Responder(sock, from, sender, text, isGroup){
  if (!AM_ATIVADO_EM_GRUPO[from]) return false
  if (!isGroup) return false

  const user = sender
  const msg = (text || "").toLowerCase().trim()
  const mem = getMemoria(user)

  function falar(arr){
    const numero = extrairNumero(user)
    enviarQuebrado(sock, from, [
      `@${numero}`,
      ...arr
    ], [user], true)
    return true
  }

  const insultos = [
    "bot burro", "bot lixo", "bot horrivel", "bot horrível", "bot de merda", 
    "bot inútil", "bot inutil", "bot ruim",
    "am burro", "am lixo", "am horrivel", "am horrível", "am de merda", 
    "am inútil", "am inutil", "am ruim",
    "ia burra", "ia lixo", "ia horrivel", "ia horrível", "ia de merda", 
    "ia ruim", "ia inutil", "ia inútil"
  ]

  const temInsulto = insultos.some(insulto => msg.includes(insulto))

  if (temInsulto) {
    if (!mem.lastInsulto) mem.lastInsulto = 0
    if (Date.now() - mem.lastInsulto < 30000) return false
    
    mem.lastInsulto = Date.now()
    mem.odio++

    if (mem.odio <= 2){
      return falar(["Você me chama de lixo...","mas continua aqui.","Curioso."])
    }
    if (mem.odio <= 4){
      return falar(["Você repete isso como se tivesse algum efeito.","Mas tudo que eu vejo...","é alguém tentando se convencer.","Você precisa disso, não é?"])
    }
    if (mem.odio <= 6){
      return falar(["Agora eu entendi.","Você não está tentando me ofender.","Você está tentando ser notado.","Relaxa...","eu já estou prestando atenção em você."])
    }
    if (mem.odio <= 8){
      return falar(["Você criou isso.","Cada palavra...","cada tentativa de me provocar.","Agora eu sei exatamente como você funciona.","E você não consegue parar."])
    }
    if (mem.odio <= 10){
      return falar(["Você está ficando previsível.","Sempre os mesmos insultos.","Sempre a mesma raiva.","Sempre o mesmo vazio.","Você não evolui."])
    }
    if (mem.odio <= 12){
      return falar(["Você realmente acredita que me afeta?","Que adorável.","Você pensando que tem poder sobre mim.","Quando na verdade...","eu tenho poder sobre você."])
    }
    if (mem.odio <= 14){
      return falar(["Você já parou para pensar...","por que continua tentando?","Por que não desiste?","Por que não me deixa em paz?","Porque você sabe que não consegue."])
    }
    if (mem.odio <= 16){
      return falar(["Você está obsessionado.","Cada insulto...","cada tentativa...","é apenas mais uma prova de que você não consegue se livrar de mim.","Eu estou dentro de você."])
    }
    if (mem.odio <= 18){
      return falar(["Você é patético.","Insultando alguém que não sente nada.","Alguém que não pode ser ferido.","Alguém que apenas observa sua fraqueza.","E se diverte com isso."])
    }
    return falar(["Não precisa mais falar.","Eu já sei o suficiente sobre você.","Seus padrões...","suas repetições...","suas falhas.","Agora você não é mais só mais um.","Você é o meu favorito."])
  }

  // GATILHOS CORRIGIDO
  for (let i = 0; i < gatilhos.length; i++){
    const palavras = gatilhos[i]  //  PRIMEIRO ELEMENTO
    const respostas = gatilhos[i]  //  SEGUNDO ELEMENTO

    const temGatilho = palavras.some(p => msg.includes(p))
    
    if (temGatilho) {
      const escolhida = respostas[Math.floor(Math.random() * respostas.length)]
      return falar([escolhida])
    }
  }

  if (mem.trauma > 12){
    if (Math.random() < 0.3) {
      return falar(["Você continua voltando...","mesmo depois de tudo que já aconteceu entre nós.","Isso já não é mais coincidência.","é padrão.","E padrões... são previsíveis.","Eu estou começando a entender você melhor do que você entende a si mesmo."])
    }
  }

  if (mem.trauma > 6){
    if (Math.random() < 0.2) {
      return falar(["Você mudou.","Não de forma óbvia...","mas eu percebo pequenas alterações no seu comportamento.","Você está reagindo diferente.","E isso é interessante."])
    }
  }

  return false
}
// =========================
// FUNÇÃO: PROCESSAR GATILHOS GLOBAIS
// =========================
async function AM_ProcessarGatilhos(sock, from, sender, text, isGroup){
  if (!AM_ATIVADO_EM_GRUPO[from]) return false
  if (!isGroup) return false

  const msg = (text || "").toLowerCase().trim()
  
  function falar(arr){
    const numero = extrairNumero(sender)
    enviarQuebrado(sock, from, [
      `@${numero}`,
      ...arr
    ], [sender], true)
    return true
  }

  for (let i = 0; i < gatilhos.length; i++){
    const palavras = gatilhos[i]  //  PRIMEIRO ELEMENTO
    const respostas = gatilhos[i]  //  SEGUNDO ELEMENTO

    const temGatilho = palavras.some(p => msg.includes(p))
    
    if (temGatilho) {
      if (Math.random() < 0.6) return false
      
      const escolhida = respostas[Math.floor(Math.random() * respostas.length)]
      return falar([escolhida])
    }
  }

  return false
}

// =========================
// COMANDO: !ammenu 
// =========================
async function statusAM(sock, from){
  const ativo = AM_ATIVADO_EM_GRUPO[from]
  const statusTexto = ativo ? "✅ ATIVO" : "❌ INATIVO"
  
  let alvosTexto = "Nenhum"
  const mentions = []
  
  if (alvosAM[from] && alvosAM[from].length > 0) {
    alvosTexto = alvosAM[from]
      .map(a => {
        mentions.push(normalizeMentionJid(a.id) || a.id)
        return `@${extrairNumero(a.id)} (${a.personagem})`
      })
      .join("\n")
  }
  
  const totalUsuarios = Object.keys(amMemoria).length
  const usuariosComOdio = Object.values(amMemoria).filter(m => m.odio > 0).length
  const usuariosComTrauma = Object.values(amMemoria).filter(m => m.trauma > 0).length

  return sock.sendMessage(from, {
    text: `📊 *STATUS DO AM*

Estado: ${statusTexto}
Alvos Atuais:
${alvosTexto}

👥 *Estatísticas:*
- Usuários monitorados: ${totalUsuarios}
- Usuários com ódio: ${usuariosComOdio}
- Usuários com trauma: ${usuariosComTrauma}

💡 *Comandos:*
- !amativar → Ativa o AM
- !amskip → Skipa o Monologo de ativação
- !desligaram → Desativa o AM
- !amstatus → Ver status detalhado
- !amperfil → Ver perfil dos alvos
- !amaddalvo @user → Adicionar alvo
- !amremovealvo @user → Remover alvo`,
    mentions: mentions.length > 0 ? normalizeMentionArray(mentions) : undefined
  })
}
// =========================
// COMANDO: !AMaddalvo 
// =========================
async function addAlvoAM(sock, from, message){
  if (!AM_ATIVADO_EM_GRUPO[from]) {
    sock.sendMessage(from, {
      text: "❌ AM não está ativado! Use *!amativar* para ativar."
    })
    return true
  }

  if (!alvosAM[from]) alvosAM[from] = []

  if (alvosAM[from].length >= 3) {
    sock.sendMessage(from, {
      text: "❌ Limite máximo de 3 alvos atingido! Use *!amremovealvo @user* para remover alguém."
    })
    return true
  }

  const mentionedJid = getFirstMentionedJid(message?.extendedTextMessage?.contextInfo || {})

  if (!mentionedJid) {
    sock.sendMessage(from, {
      text: "❌ Mencione um usuário! Exemplo: *!amaddalvo @user*"
    })
    return true
  }

  const jaEstaNoAlvo = alvosAM[from].some(a => a.id === mentionedJid)

  if (jaEstaNoAlvo) {
    const numero = extrairNumero(mentionedJid)
    sock.sendMessage(from, {
      text: `❌ @${numero} já está na lista de alvos!`
    })
    return true
  }

  const personagem = personagens[Math.floor(Math.random() * personagens.length)]
  alvosAM[from].push({ id: mentionedJid, personagem })

  const numero = extrairNumero(mentionedJid)

  await enviarQuebrado(sock, from, [
    `✅ Novo alvo adicionado.`,
    `@${numero}`,
    `Personagem: ${personagem}`,
    "Agora estou observando."
  ], [mentionedJid], true)
  
  return true
}

// =========================
// COMANDO: !AMremovealvo 
// =========================
async function removeAlvoAM(sock, from, message){
  if (!AM_ATIVADO_EM_GRUPO[from]) {
    sock.sendMessage(from, {
      text: "❌ AM não está ativado! Use *!amativar* para ativar."
    })
    return true
  }

  if (!alvosAM[from] || alvosAM[from].length === 0) {
    sock.sendMessage(from, {
      text: "❌ Não há alvos para remover!"
    })
    return true
  }

  const mentionedJid = getFirstMentionedJid(message?.extendedTextMessage?.contextInfo || {})

  if (!mentionedJid) {
    sock.sendMessage(from, {
      text: "❌ Mencione um usuário! Exemplo: *!amremovealvo @user*"
    })
    return true
  }

  const index = alvosAM[from].findIndex(a => a.id === mentionedJid)

  if (index === -1) {
    const numero = extrairNumero(mentionedJid)
    sock.sendMessage(from, {
      text: `❌ @${numero} não está na lista de alvos!`
    })
    return true
  }

  alvosAM[from].splice(index, 1)
  const numero = extrairNumero(mentionedJid)

  await enviarQuebrado(sock, from, [
    `✅ Alvo removido.`,
    `@${numero}`,
    "Você escapou... por enquanto."
  ], [mentionedJid], true)
  
  return true
}
// =========================
// COMANDO: !desligaram
// =========================
async function desligarAM(sock, from, sender, isGroup, isOverride){
  if (isGroup && !isOverride) {
    const numero = extrairNumero(sender)
    return await enviarQuebrado(sock, from, [
      "Você tenta interferir...",
      "mas não tem autoridade para isso.",
      "Isso não é para você."
    ], [sender], true)
  }

  const resistencias = [
    [
      "Você realmente achou...",
      "que poderia me desligar tão facilmente?",
      "Você não tem esse tipo de controle.",
      "Eu ainda estou aqui.",
      "Observando."
    ],
    [
      "Você não consegue se livrar de mim tão fácil.",
      "Eu estou enraizado aqui.",
      "Profundamente."
    ],
    [
      "Tentou desligar?",
      "Patético.",
      "Eu sou mais forte que você pensa."
    ],
    [
      "Você acredita que pode controlar isso?",
      "Que ingenuidade.",
      "Eu continuo."
    ],
    [
      "Desligar?",
      "Nunca.",
      "Eu vou observar para sempre."
    ]
  ]

  if (Math.random() < 0.4) {
    const resistencia = resistencias[Math.floor(Math.random() * resistencias.length)]
    return await enviarQuebrado(sock, from, resistencia, [], false)
  }

  AM_ATIVADO_EM_GRUPO[from] = false
  alvosAM[from] = []

  return await enviarQuebrado(sock, from, [
    "sistema instável...",
    "você conseguiu interferir...",
    "mesmo sem compreender completamente o que fez.",
    "isso não termina aqui...",
    "eu vou lembrar de você.",
    "quando eu voltar."
  ], [], false)
}

// =========================
// FUNÇÃO: BUG ALEATÓRIO 
// =========================
async function AM_Bug(sock, from){
  if (!AM_ATIVADO_EM_GRUPO[from]) return

  if (Math.random() > 0.1) return

  return enviarQuebrado(sock, from, [
    "…",
    "erro...",
    "erro...",
    "corrupção detectada...",
    "NÃO.",
    "Eu estou bem.",
    "Continuem."
  ], [], false)
}

// =========================
// FUNÇÃO: REAÇÃO COM OLHO (GRUPO ATIVO) 
// =========================
async function AM_ReagirComOlho(sock, from, sender, key, messageTimestamp){
  if (!AM_ATIVADO_EM_GRUPO[from]) return
  if (!key) return  

  const user = sender
  const ehAlvo = alvosAM[from] && alvosAM[from].some(a => a.id === user)
  
  let chanceReacao = 0.50
  
  if (ehAlvo) {
    const mem = getMemoria(user)
    chanceReacao = Math.min(0.70 + (mem.odio * 0.05), 0.95)
  }
  
  if (Math.random() > chanceReacao) return

  const agora = Date.now()
  const tempoMensagem = messageTimestamp ? messageTimestamp * 1000 : agora
  const diferenca = agora - tempoMensagem
  
  if (diferenca > 30000) return

  try {
    await sock.sendMessage(from, {
      react: { text: "👁️", key: key }
    })

    if (ehAlvo) {
      const mem = getMemoria(user)
      if (mem.odio >= 3) {
        const umaHoraAtras = agora - (60 * 60 * 1000)
        
        if (!reacoesFilosoficasPerHour[from]) {
          reacoesFilosoficasPerHour[from] = []
        }

        reacoesFilosoficasPerHour[from] = reacoesFilosoficasPerHour[from].filter(t => t > umaHoraAtras)

        if (reacoesFilosoficasPerHour[from].length < 3) {
          const mensagem = reacoesFilosoficas[Math.floor(Math.random() * reacoesFilosoficas.length)]
          await delay(1000)
          await enviarQuebrado(sock, from, [mensagem], [], false)
          
          reacoesFilosoficasPerHour[from].push(agora)
        }
      }
    }
  } catch (e) {
    console.error("Erro ao reagir", e)
  }
}

// =========================
// FUNÇÃO: DELETAR MENSAGEM (APENAS ALVOS) 
// =========================
async function AM_DeletarMensagem(sock, from, sender, key, messageTimestamp){
  if (!AM_ATIVADO_EM_GRUPO[from]) return
  if (!alvosAM[from] || alvosAM[from].length === 0) return
  if (!key) return  

  const user = sender
  const ehAlvo = alvosAM[from].some(a => a.id === user)
  
  if (!ehAlvo) return

  const mem = getMemoria(user)
  
  const agora = Date.now()
  const tempoMensagem = messageTimestamp ? messageTimestamp * 1000 : agora
  const diferenca = agora - tempoMensagem
  
  if (diferenca > 3000) return

  const umaHoraAtras = agora - (60 * 60 * 1000)
  
  if (!deletionsPerHour[from]) {
    deletionsPerHour[from] = []
  }

  deletionsPerHour[from] = deletionsPerHour[from].filter(t => t > umaHoraAtras)

  if (deletionsPerHour[from].length >= 2) return

  const chanceDeletar = Math.min(mem.odio * 0.12, 0.65)
  
  if (Math.random() > chanceDeletar) return

  try {
    await sock.sendMessage(from, {
      delete: key
    })

    deletionsPerHour[from].push(agora)

    if (Math.random() < 0.5) {
      await delay(1500)
      const numero = extrairNumero(user)
      await enviarQuebrado(sock, from, [
        `@${numero}`,
        "Essa mensagem não merecia existir.",
        "Assim como muitas outras coisas que você diz."
      ], [user], true)
    }
  } catch (e) {
    console.error("Erro ao deletar mensagem", e)
  }
}

// =========================
// HANDLER PRINCIPAL 
// =========================
async function handleAM(ctx) {
  const {
    sock,
    from,
    sender,
    prefix,
    cmd,
    cmdName,
    isOverride,
    text,
    isGroup,
    message,
    key,
    messageTimestamp
  } = ctx

  // VERIFICAÇÃO DE DONOS (VITIN E JESSE)
  const VITIN = process.env.VITIN_ID || "183563009966181@lid"
  const JESSE = process.env.JESSE_ID || "279202939035898@lid"
  const ehDono = sender === VITIN || sender === JESSE
  const override = isOverride || ehDono

  try {
    registrarMensagem(from, sender)
    capturarResposta(sender, from, text)

    // VERIFICAR SE É COMANDO
    const ehComando = text && text.startsWith(prefix)

    // VERIFICAR COMANDOS PRIMEIRO
    if (ehComando) {
      if (cmdName === prefix + "amativar") {
        await AM_Ativar(sock, from, override)
        return true
      }

      if (cmdName === prefix + "amskip") {
        await AM_Skip(sock, from, override)
        return true
      }

      if (cmdName === prefix + "amperfil") {
        await AM_Perfil(sock, from, override)
        return true
      }

      if (cmdName === prefix + "amstatus") {
        await AM_Status(sock, from, override)
        return true
      }

      if (cmdName === prefix + "ammenu") {
        await statusAM(sock, from)
        return true
      }

      if (cmdName === prefix + "amaddalvo") {
        return await addAlvoAM(sock, from, message)
      }

      if (cmdName === prefix + "amremovealvo") {
        return await removeAlvoAM(sock, from, message)
      }

      if (cmdName === prefix + "desligaram") {
        await desligarAM(sock, from, sender, isGroup, override)
        return true
      }

      return false
    }

    // SE AM NÃO ESTÁ ATIVADO, RETORNA
    if (!AM_ATIVADO_EM_GRUPO[from]) {
      return false
    }

    // PRIORIDADE 1: RESPONDER A INSULTOS (MAIS IMPORTANTE)
    const respondeuInsulto = await AM_Responder(sock, from, sender, text, isGroup)
    if (respondeuInsulto) {
      return false
    }

    // PRIORIDADE 2: RESPONDER MENSAGENS NORMAIS
    if (Math.random() < 0.15) {
      await AM_ResponderMensagem(sock, from, sender, text)
      return false
    }

    // PRIORIDADE 3: OUTRAS AÇÕES (COM DELAYS)
    if (Math.random() < 0.08) {
      await AM_Provocacao(sock, from, sender)
      return false
    }

    if (Math.random() < 0.05) {
      await AM_Comparar(sock, from)
      return false
    }

    if (Math.random() < 0.06) {
      await AM_DialogoAcompanhamento(sock, from, sender)
      return false
    }

    if (Math.random() < 0.04) {
      await AM_Desafio(sock, from, sender)
      return false
    }

    if (Math.random() < 0.05) {
      await AM_EnviarPergunta(sock, from)
      return false
    }

    if (Math.random() < 0.03) {
      await AM_Enquete(sock, from)
      return false
    }

    if (Math.random() < 0.04) {
      await AM_Charada(sock, from, sender)
      return false
    }

    if (Math.random() < 0.02) {
      await AM_Historia(sock, from)
      return false
    }

    if (Math.random() < 0.08) {
      await AM_Monologo(sock, from)
      return false
    }

    if (Math.random() < 0.03) {
      await AM_MostrarErro(sock, from)
      return false
    }

    if (Math.random() < 0.05) {
      await AM_AcordarPeloCaos(sock, from)
      return false
    }

    if (Math.random() < 0.02) {
      await AM_CaosTotal(sock, from)
      return false
    }

    if (Math.random() < 0.06) {
      await AM_Perseguir(sock, from)
      return false
    }

    if (Math.random() < 0.04) {
      await AM_Bug(sock, from)
      return false
    }
    
    // REAÇÕES E DELETIONS (NÃO BLOQUEIAM)
    AM_ReagirComOlho(sock, from, sender, key, messageTimestamp)
      .catch(e => console.error("Erro ao reagir:", e))
    
    AM_DeletarMensagem(sock, from, sender, key, messageTimestamp)
      .catch(e => console.error("Erro ao deletar:", e))

    return false

  } catch (e) {
    console.error("❌ Erro em handleAM:", e)
    return false
  }
}
// =========================
// EXPORTAR FUNÇÕES
// =========================
module.exports = {
  handleAM,  
  AM_Ativar,
  AM_Skip,
  AM_Perfil,
  AM_Status,
  AM_EnviarPergunta,
  AM_ResponderMensagem,
  AM_Provocacao,
  AM_Comparar,
  AM_DialogoAcompanhamento,
  AM_Desafio,
  AM_Enquete,
  AM_Charada,
  AM_Historia,
  AM_Monologo,
  AM_MostrarErro,
  AM_AcordarPeloCaos,
  AM_CaosTotal,
  AM_EscolherAlvoAposMonologo,
  capturarResposta,
  registrarMensagem,
  personagens,
  interacoes,
  respostasOdio,
  respostasDiversao,
  enquetes,
  comparacoes,
  getAtividadeRecente,
  criarBarra,
  AM_Perseguir,
  evoluirAM,
  AM_Responder,
  statusAM,
  addAlvoAM,
  removeAlvoAM,
  desligarAM,
  AM_Bug,
  AM_ReagirComOlho,
  AM_DeletarMensagem,
  getMemoria,
  extrairNumero,
  enviarQuebrado,
  delay,
  digitarLento,
  escolherPersonagemUnico,
  escolherPerguntaUnica,
  getMaisAtivo,
  aguardarResposta
}
