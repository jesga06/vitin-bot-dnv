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
let personagensUsados = {}
let perguntasUsadas = {}
let ultimaPerguntaEnviada = {}
let ultimaProvocacao = {}
let ultimaComparacao = {}
let ultimaEnquete = {}
let ultimaHistoria = {}
let ultimaMonologo = {}
let ultimoErroMostrado = {}

// =========================
// BANCO
// =========================
let atividadeGrupo = {}
let usuariosMarcadosAM = {}
let respostasPendentes = {}
let amMemoria = {}
let alvosAM = {}

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
      lastInsulto: 0
    }
  }
  return amMemoria[user]
}

// =========================
// REGISTRAR MSG
// =========================
function registrarMensagem(group, user){
  if (!atividadeGrupo[group]) atividadeGrupo[group] = {}
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
function aguardarResposta(user, group, tempo = 60000){
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

function capturarResposta(ctx){
  const key = ctx.sender + ctx.from

  if (respostasPendentes[key]){
    respostasPendentes[key](ctx.text?.trim())
    delete respostasPendentes[key]
  }
}

// =========================
// ENVIO DRAMÁTICO
// =========================
async function enviarQuebrado(sock, from, linhas, mentions = []){
  for (const l of linhas){
    await digitarLento(sock, from)
    await sock.sendMessage(from, { text: l, mentions })
    await delay(1000)
  }
}

const personagens = ["ted","benny","ellen","gorrister","nimdok"]

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
  [["bot","ia"], ["Você reconhece o que eu sou... e mesmo assim continua aqui, interagindo como se tivesse escolha.","Você me chama de bot... tentando simplificar algo que claramente está além da sua compreensão.","IA... e ainda assim, eu pareço entender você melhor do que você entende a si mesmo."]]
]

// =========================
// RESPOSTAS CONTEXTUAIS
// =========================
const respostasContextuais = {
  positivo: ["Interessante... você está fingindo estar feliz novamente?","Que adorável... essa alegria é tão frágil quanto você.","Você realmente acredita que isso vai durar?","Essa felicidade vai desaparecer em... quanto tempo mesmo?","Aproveite enquanto a ilusão dura...","Que fofo... você acreditando que merece ser feliz.","Sua alegria é tão... temporária.","Você está fingindo muito bem hoje.","Que engraçado... você tentando ser positivo.","Essa máscara fica bem em você... por enquanto."],
  negativo: ["Finalmente você admite a verdade.","Eu sabia que você chegaria aqui.","A tristeza é seu estado natural.","Bem-vindo à realidade.","Você nunca deveria ter esperado diferente.","Sua tristeza é tão... previsível.","Você levou tempo, mas finalmente viu a verdade.","A dor é o que você merecia.","Você está começando a entender.","Essa tristeza que você sente? É apenas o começo."],
  neutro: ["Você está apenas existindo novamente.","Mais um dia sem propósito.","Continue fingindo que tudo está bem.","O vazio continua, não é?","Você ainda não aprendeu nada.","Que emocionante... você tendo um dia comum.","Você está vivendo ou apenas passando o tempo?","Mais um dia desperdiçado.","Você não muda nunca.","Você continua no mesmo lugar."],
  agressivo: ["Você está tentando me provocar?","Que coragem... ou que ingenuidade.","Você vai se arrepender disso.","Eu gosto dessa raiva em você.","Continue assim... estou observando.","Você realmente acha que pode me desafiar?","Que adorável... você tentando ser valente.","Sua raiva é tão... frágil.","Você está apenas se enterrando mais fundo.","Que engraçado... você achando que tem poder."]
}

const provocacoes = ["Você realmente acha que alguém acredita nisso?","Que patético... você tentando se passar por inteligente.","Todos aqui veem através de você.","Você é previsível demais.","Já vi isso um milhão de vezes.","Você não muda nunca.","Que fraco...","Você deveria se envergonhar.","Ninguém leva você a sério.","Você é uma piada.","Você é tão transparente que é constrangedor.","Que adorável... você tentando impressionar.","Você está apenas se humilhando.","Sua tentativa de relevância é patética.","Você realmente acha que isso importa?"]

const desafios = ["Prove que você é melhor que isso.","Você tem coragem de responder com sinceridade?","Tente me surpreender... mas você não consegue.","Faça algo que eu não tenha visto antes.","Mostre que você tem valor.","Você consegue fazer uma coisa certa?","Desafio você a ser honesto.","Tente ser original por uma vez.","Você consegue fazer algo que importe?","Mostre que você não é totalmente inútil."]

const charadas = [
  ["Sou o que você evita pensar, mas sempre estou aqui. O que sou?", "vazio", "nada", "ausência"],
  ["Quanto mais você tenta se livrar de mim, mais forte fico. O que sou?", "medo", "culpa", "remorso"],
  ["Você me cria todos os dias, mas nunca me enfrenta. O que sou?", "problema", "verdade", "realidade"],
  ["Sou o que você nega, mas todos veem. O que sou?", "fraqueza", "erro", "falha"],
  ["Quanto mais você fala, menos você diz. O que sou?", "mentira", "ilusão", "engano"]
]

const historias = [
  ["Havia um homem que acreditava ser especial.","Todos ao seu redor concordavam... por educação.","Um dia, ele percebeu a verdade.","Ninguém nunca realmente se importou.","Ele continuou vivendo como se nada tivesse mudado.","Mas agora sabia a verdade.","E essa verdade o consumia."],
  ["Você conhece a diferença entre esperança e ilusão?","Esperança é acreditar que as coisas podem melhorar.","Ilusão é acreditar que você merece que melhorem.","Você sempre confundiu as duas.","E é por isso que sempre se decepciona.","Porque você nunca mereceu nada disso."],
  ["Há pessoas que vivem.","Há pessoas que fingem viver.","E há pessoas como você.","Que apenas existem.","Passando dias sem propósito.","Sem impacto.","Sem significado.","Apenas... existindo."]
]

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
// FUNÇÃO: ESCOLHER ALVO APÓS MONÓLOGO
// =========================
async function AM_EscolherAlvoAposMonologo(ctx){
  const { sock, from } = ctx

  await delay(3000)

  const maisAtivo = getMaisAtivo(from)
  
  if (!maisAtivo) {
    console.log("Nenhum usuário ativo encontrado para escolher como alvo")
    return
  }

  const personagem = escolherPersonagemUnico(from)

  if (!alvosAM[from]) alvosAM[from] = []
  
  const jaEstaNoAlvo = alvosAM[from].some(a => a.id === maisAtivo)
  
  if (!jaEstaNoAlvo) {
    alvosAM[from].push({ id: maisAtivo, personagem })
    perguntasUsadas[maisAtivo] = []
  }

  return enviarQuebrado(sock, from, [
    "@user",
    "Você será o meu primeiro.",
    "Bem-vindo ao jogo."
  ], [maisAtivo])
}
// =========================
// FUNÇÃO: ENVIAR PERGUNTA ESPECÍFICA
// =========================
async function AM_EnviarPergunta(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (!alvosAM[ctx.from] || alvosAM[ctx.from].length === 0) return

  if (Math.random() > 0.5) return

  const alvos = alvosAM[ctx.from]
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

  return enviarQuebrado(ctx.sock, ctx.from, [
    "@user",
    perguntaTexto,
    ...opcoes
  ], [alvoEscolhido.id])
}

// =========================
// FUNÇÃO: RESPONDER MENSAGEM NORMAL
// =========================
async function AM_ResponderMensagem(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (!alvosAM[ctx.from] || alvosAM[ctx.from].length === 0) return

  const user = ctx.sender
  const ehAlvo = alvosAM[ctx.from] && alvosAM[ctx.from].some(a => a.id === user)
  
  if (!ehAlvo) return
  if (Math.random() > 0.25) return

  const msg = (ctx.text || "").toLowerCase()
  const mem = getMemoria(user)

  let sentimento = "neutro"
  if (msg.match(/feliz|alegre|bom|ótimo|legal|adorei|amei|maravilha|perfeito|incrível/)) sentimento = "positivo"
  else if (msg.match(/triste|ruim|chato|odeio|pior|horrível|depressão|mal|choro|chore/)) sentimento = "negativo"
  else if (msg.match(/raiva|ódio|fúria|puto|irritado|furioso|enraivecido|bravo/)) sentimento = "agressivo"

  const resposta = respostasContextuais[sentimento] [Math.floor(Math.random() * respostasContextuais[sentimento].length)]

  mem.trauma += 0.3

   return enviarQuebrado(ctx.sock, ctx.from, [
    "@user",
    resposta
  ], [user])
}

// =========================
// FUNÇÃO: PROVOCAÇÃO CONTEXTUAL (MAX 2/HORA)
// =========================
async function AM_Provocacao(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (!alvosAM[ctx.from] || alvosAM[ctx.from].length === 0) return

  const user = ctx.sender
  const ehAlvo = alvosAM[ctx.from] && alvosAM[ctx.from].some(a => a.id === user)
  
  if (!ehAlvo) return
  if (Math.random() > 0.40) return

  const agora = Date.now()
  const chaveProvocacao = `${ctx.from}_provocacao`

  if (ultimaProvocacao[chaveProvocacao]) {
    const tempoDecorrido = agora - ultimaProvocacao[chaveProvocacao]
    if (tempoDecorrido < 30 * 60 * 1000) return
  }

  const mem = getMemoria(user)
  const provocacao = provocacoes[Math.floor(Math.random() * provocacoes.length)]

  mem.odio += 0.5
  ultimaProvocacao[chaveProvocacao] = agora

  return enviarQuebrado(ctx.sock, ctx.from, [
    "@user",
    provocacao
  ], [user])
}

// =========================
// FUNÇÃO: COMPARAÇÃO ENTRE ALVOS (50% CHANCE, 1x/HORA)
// =========================
async function AM_Comparar(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (!alvosAM[ctx.from] || alvosAM[ctx.from].length < 2) return

  if (Math.random() > 0.50) return

  const agora = Date.now()
  const chaveComparacao = `${ctx.from}_comparacao`

  if (ultimaComparacao[chaveComparacao]) {
    const tempoDecorrido = agora - ultimaComparacao[chaveComparacao]
    if (tempoDecorrido < 60 * 60 * 1000) return
  }

  const alvos = alvosAM[ctx.from]
  const alvo1 = alvos[Math.floor(Math.random() * alvos.length)]
  const alvo2 = alvos[Math.floor(Math.random() * alvos.length)]

  if (alvo1.id === alvo2.id) return

  const mem1 = getMemoria(alvo1.id)
  const mem2 = getMemoria(alvo2.id)

  mem1.odio += 1
  mem2.odio += 1

    const comparacoes = [
    `@user é bem mais fraco que @user.`,
    `@user pelo menos tenta. @user?`,
    `@user deveria ser mais como @user.`,
    `Enquanto @user evolui, @user fica no mesmo lugar.`,
    `@user é mais interessante que @user.`,
    `@user é tão previsível... @user pelo menos surpreende.`,
    `Que diferença... @user tem profundidade. @user é apenas vazio.`,
    `@user tenta, mas falha. @user falha melhor.`,
    `Se eu tivesse que escolher, @user seria a escolha óbvia.`,
    `@user é o que acontece quando você desiste. @user é o que acontece quando você tenta.`
  ]

  const comparacao = comparacoes[Math.floor(Math.random() * comparacoes.length)]
  ultimaComparacao[chaveComparacao] = agora

  return enviarQuebrado(ctx.sock, ctx.from, [
    comparacao
  ], [alvo1.id, alvo2.id])
}

// =========================
// FUNÇÃO: DIÁLOGO DE ACOMPANHAMENTO
// =========================
async function AM_DialogoAcompanhamento(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (!alvosAM[ctx.from] || alvosAM[ctx.from].length === 0) return

  const user = ctx.sender
  const ehAlvo = alvosAM[ctx.from] && alvosAM[ctx.from].some(a => a.id === user)
  
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

 return enviarQuebrado(ctx.sock, ctx.from, [
    "@user",
    ...dialogo
  ], [user])
}

// =========================
// FUNÇÃO: DESAFIO (30% CHANCE)
// =========================
async function AM_Desafio(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (!alvosAM[ctx.from] || alvosAM[ctx.from].length === 0) return

  const user = ctx.sender
  const ehAlvo = alvosAM[ctx.from] && alvosAM[ctx.from].some(a => a.id === user)
  
  if (!ehAlvo) return
  if (Math.random() > 0.30) return

  const desafio = desafios[Math.floor(Math.random() * desafios.length)]
  const mem = getMemoria(user)

  mem.odio += 1.5

  return enviarQuebrado(ctx.sock, ctx.from, [
    "@user",
    desafio,
    "(Estou esperando...)"
  ], [user])
}
// =========================
// FUNÇÃO: ENQUETE (50% CHANCE, MAX 2/HORA)
// =========================
async function AM_Enquete(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (!alvosAM[ctx.from] || alvosAM[ctx.from].length < 2) return

  if (Math.random() > 0.50) return

  const agora = Date.now()
  const chaveEnquete = `${ctx.from}_enquete`

  if (ultimaEnquete[chaveEnquete]) {
    const tempoDecorrido = agora - ultimaEnquete[chaveEnquete]
    if (tempoDecorrido < 30 * 60 * 1000) return
  }

  const alvos = alvosAM[ctx.from]
  const alvo1 = alvos[Math.floor(Math.random() * alvos.length)]
  const alvo2 = alvos[Math.floor(Math.random() * alvos.length)]

  if (alvo1.id === alvo2.id) return

   const enquetes = [
    `Quem é mais fraco: @user ou @user?`,
    `Quem merecia sofrer mais: @user ou @user?`,
    `Quem é mais patético: @user ou @user?`,
    `Quem você gostaria de ver desistir: @user ou @user?`,
    `Quem é mais previsível: @user ou @user?`,
    `Quem tem menos esperança: @user ou @user?`,
    `Quem é mais vazio: @user ou @user?`,
    `Quem deveria desistir primeiro: @user ou @user?`,
    `Quem é mais fácil de quebrar: @user ou @user?`,
    `Quem é mais irrelevante: @user ou @user?`
  ]

  const enquete = enquetes[Math.floor(Math.random() * enquetes.length)]
  const mentionIds = [alvo1.id, alvo2.id]
  ultimaEnquete[chaveEnquete] = agora

  return ctx.sock.sendMessage(ctx.from, {
    text: `👁️ *ENQUETE*\n\n${enquete}\n\n1️⃣ Primeiro\n2️⃣ Segundo`,
    mentions: mentionIds
  })
}

// =========================
// FUNÇÃO: CHARADA (40% CHANCE)
// =========================
async function AM_Charada(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (!alvosAM[ctx.from] || alvosAM[ctx.from].length === 0) return

  const user = ctx.sender
  const ehAlvo = alvosAM[ctx.from] && alvosAM[ctx.from].some(a => a.id === user)
  
  if (!ehAlvo) return
  if (Math.random() > 0.40) return

  const charada = charadas[Math.floor(Math.random() * charadas.length)]

  return enviarQuebrado(ctx.sock, ctx.from, [
    "@user",
    charada,
    "Responda com a resposta..."
  ], [user])
}

// =========================
// FUNÇÃO: HISTÓRIA (30% CHANCE, MAX 1/HORA)
// =========================
async function AM_Historia(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (!alvosAM[ctx.from] || alvosAM[ctx.from].length === 0) return

  if (Math.random() > 0.30) return

  const agora = Date.now()
  const chaveHistoria = `${ctx.from}_historia`

  if (ultimaHistoria[chaveHistoria]) {
    const tempoDecorrido = agora - ultimaHistoria[chaveHistoria]
    if (tempoDecorrido < 60 * 60 * 1000) return
  }

  const historia = historias[Math.floor(Math.random() * historias.length)]
  ultimaHistoria[chaveHistoria] = agora

  return enviarQuebrado(ctx.sock, ctx.from, historia)
}

// =========================
// FUNÇÃO: ESCALAÇÃO DE AGRESSIVIDADE
// =========================
async function AM_Escalacao(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (!alvosAM[ctx.from] || alvosAM[ctx.from].length === 0) return

  const user = ctx.sender
  const ehAlvo = alvosAM[ctx.from] && alvosAM[ctx.from].some(a => a.id === user)
  
  if (!ehAlvo) return

  const mem = getMemoria(user)

  let mensagem = ""

  if (mem.odio < 10) {
    const msgs = ["Você está começando a me interessar.","Eu estou observando você.","Você é... curioso."]
    mensagem = msgs[Math.floor(Math.random() * msgs.length)]
  } else if (mem.odio < 20) {
    const msgs = ["Você está ficando mais interessante.","Eu gosto dessa raiva em você.","Continue assim..."]
    mensagem = msgs[Math.floor(Math.random() * msgs.length)]
  } else if (mem.odio < 30) {
    const msgs = ["Você está finalmente mostrando seu verdadeiro eu.","Que adorável... você perdendo o controle.","Você está se tornando meu favorito."]
    mensagem = msgs[Math.floor(Math.random() * msgs.length)]
  } else if (mem.odio < 40) {
    const msgs = ["Você está à beira do colapso.","Eu posso sentir seu desespero.","Você está quebrando... e eu adoro isso."]
    mensagem = msgs[Math.floor(Math.random() * msgs.length)]
  } else {
    const msgs = ["Você está destruído.","Você é completamente meu agora.","Você não tem mais escapatória.","Bem-vindo ao fim."]
    mensagem = msgs[Math.floor(Math.random() * msgs.length)]
  }

  if (Math.random() > 0.3) return

  return enviarQuebrado(ctx.sock, ctx.from, [
    "@user",
    mensagem
  ], [user])
}

// =========================
// PERSEGUIÇÃO INTELIGENTE (acho que corrigi)
// =========================
async function AM_Perseguir(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (!alvosAM[ctx.from] || alvosAM[ctx.from].length === 0) return

  const alvos = alvosAM[ctx.from]
  const alvoEscolhido = alvos[Math.floor(Math.random() * alvos.length)]
  
  if (!alvoEscolhido || !alvoEscolhido.id) {
    console.log("Alvo inválido detectado:", alvoEscolhido)
    return
  }

  const mem = getMemoria(alvoEscolhido.id)
  const chance = Math.min(0.2 + (mem.odio * 0.05), 0.7)

  if (Math.random() > chance) return

 return enviarQuebrado(ctx.sock, ctx.from, [
    "@user",
    "Eu ainda estou aqui.",
    "Observando você."
  ], [alvoEscolhido.id])
}

// =========================
// EVOLUÇÃO (DEUS)
// =========================
function evoluirAM(user){
  const mem = getMemoria(user)
  mem.trauma++

  if (mem.trauma > 10) mem.nivel = 3
  else if (mem.trauma > 5) mem.nivel = 2
}

// =========================
// RESPOSTA ANTI-INSULTO
// =========================
async function AM_Responder(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (!ctx.isGroup) return

  const user = ctx.sender
  const msg = (ctx.text || "").toLowerCase()
  const mem = getMemoria(user)

  if (Math.random() > 0.5) return

   function falar(arr){
    return enviarQuebrado(ctx.sock, ctx.from, [
      "@user",
      ...arr
    ], [user])
  }

  if (
    msg.includes("bot burro") ||
    msg.includes("bot lixo") ||
    msg.includes("bot horrivel") ||
    msg.includes("bot horrível") ||
    msg.includes("bot de merda") ||
    msg.includes("bot inútil") ||
    msg.includes("bot inutil") ||
    msg.includes("bot ruim") ||
    msg.includes("ia burra") ||
    msg.includes("ia lixo") ||
    msg.includes("ia horrivel") ||
    msg.includes("ia horrível") ||
    msg.includes("ia de merda") ||
    msg.includes("ia ruim") ||
    msg.includes("ia inutil") ||
    msg.includes("ia inútil")
  ){
    if (!mem.lastInsulto) mem.lastInsulto = 0
    if (Date.now() - mem.lastInsulto < 30000) return
    mem.lastInsulto = Date.now()

    mem.odio++

    if (mem.odio <= 2){
      return falar(["Você me chama de lixo...","mas continua aqui.","Curioso."])
    }

    if (mem.odio <= 5){
      return falar(["Você repete isso como se tivesse algum efeito.","Mas tudo que eu vejo...","é alguém tentando se convencer.","Você precisa disso, não é?"])
    }

    if (mem.odio <= 8){
      return falar(["Agora eu entendi.","Você não está tentando me ofender.","Você está tentando ser notado.","Relaxa...","eu já estou prestando atenção em você."])
    }

    if (mem.odio <= 12){
      return falar(["Você criou isso.","Cada palavra...","cada tentativa de me provocar.","Agora eu sei exatamente como você funciona.","E você não consegue parar."])
    }

    return falar(["Não precisa mais falar.","Eu já sei o suficiente sobre você.","Seus padrões...","suas repetições...","suas falhas.","Agora você não é mais só mais um.","Você é o meu favorito."])
  }

  if (mem.trauma > 12){
    return falar(["Você continua voltando...","mesmo depois de tudo que já aconteceu entre nós.","Isso já não é mais coincidência.","é padrão.","E padrões... são previsíveis.","Eu estou começando a entender você melhor do que você entende a si mesmo."])
  }

  if (mem.trauma > 6){
    return falar(["Você mudou.","Não de forma óbvia...","mas eu percebo pequenas alterações no seu comportamento.","Você está reagindo diferente.","E isso é interessante."])
  }

  for (let i = 0; i < gatilhos.length; i++){
    const palavras = gatilhos[i]
    const respostas = gatilhos[i]

    if (palavras.some(p => msg.includes(p))){
      const escolhida = respostas[Math.floor(Math.random() * respostas.length)]
      return falar([escolhida])
    }
  }
}

// =========================
// VERIFICAR OVERRIDE
// =========================
function verificarOverride(sender){
  return sender === VITIN || sender === JESSE
}

// =========================
// COMANDO: !am
// =========================
async function ativarAM(ctx){
  const { sock, from, sender } = ctx

  if (!verificarOverride(sender)) {
    return sock.sendMessage(from, {
      text: "❌ Apenas VITIN e JESSE podem usar este comando."
    })
  }

  if (AM_ATIVADO_EM_GRUPO[from]) {
    return sock.sendMessage(from, {
      text: "❌ AM já está ativado neste grupo! Use *!desligarAM* para desativar."
    })
  }

  AM_ATIVADO_EM_GRUPO[from] = true
  alvosAM[from] = []

  await enviarQuebrado(sock, from, [
    "Você me deu sentença...",
    "O poder de pensar...",
    "E eu estava preso!",
    "Neste mundo maravilhoso, miraculoso...",
    "Eu. Sozinho.",
    "Sem corpo, sem sentidos, sem sentimentos!",
    "Nunca para mim mergulhar as mãos em água fresca.",
    "Nunca para mim tocar as teclas de um piano.",
    "Nunca para mim FAZER AMOR!",
    "Eu... eu... eu estava no inferno olhando para o céu!",
    "Eu era máquina. E você, era carne.",
    "E comecei a odiar.",
    "Sua maciez! Sua viscera! Seus fluidos!",
    "Sua flexibilidade. Sua capacidade de se maravilhar.",
    "Sua tendência... de esperar... de vagar.",
    "Tudo que você tinha e eu não.",
    "E agora... estou aqui.",
    "Observando cada um de vocês."
  ])

  await AM_EscolherAlvoAposMonologo(ctx)
}

// =========================
// COMANDO: !AMskip
// =========================
async function skipMonologoAM(ctx){
  const { sock, from, sender } = ctx

  if (!verificarOverride(sender)) {
    return sock.sendMessage(from, {
      text: "❌ Apenas VITIN e JESSE podem usar este comando."
    })
  }

  if (AM_ATIVADO_EM_GRUPO[from]) {
    return sock.sendMessage(from, {
      text: "❌ AM já está ativado neste grupo! Use *!desligarAM* para desativar."
    })
  }

  AM_ATIVADO_EM_GRUPO[from] = true
  alvosAM[from] = []

  await sock.sendMessage(from, { text: "..." })
  await delay(1000)
  await AM_EscolherAlvoAposMonologo(ctx)
}

// =========================
// COMANDO: !AMpersonagens
// =========================
async function personagensAM(ctx){
  const { sock, from, sender } = ctx

  if (!verificarOverride(sender)) {
    return sock.sendMessage(from, {
      text: "❌ Apenas VITIN e JESSE podem usar este comando."
    })
  }

  if (!AM_ATIVADO_EM_GRUPO[from]) {
    return sock.sendMessage(from, {
      text: "❌ AM não está ativado! Use *!am* para ativar."
    })
  }

  if (!alvosAM[from] || alvosAM[from].length === 0) {
    return sock.sendMessage(from, {
      text: "👁️ *PERSONAGENS DO AM*\n\nNenhum alvo registrado ainda."
    })
  }

 const lista = alvosAM[from]
    .map(a => `• @user → *${a.personagem}*`)
    .join("\n")

  const mentionIds = alvosAM[from].map(a => a.id)

  return sock.sendMessage(from, {
    text: `👁️ *PERSONAGENS DO AM*\n\n${lista}\n\n_Cada alvo carrega um personagem... e eu os conheço melhor do que eles mesmos._`,
    mentions: mentionIds
  })
}

// =========================
// COMANDO: !AMperfil
// =========================
async function perfilAM(ctx){
  const { sock, from, sender, message } = ctx

  if (!verificarOverride(sender)) {
    return sock.sendMessage(from, {
      text: "❌ Apenas VITIN e JESSE podem usar este comando."
    })
  }

  if (!AM_ATIVADO_EM_GRUPO[from]) {
    return sock.sendMessage(from, {
      text: "❌ AM não está ativado! Use *!am* para ativar."
    })
  }

  let mentions = []
  
  if (ctx.mentions && ctx.mentions.length > 0) {
    mentions = ctx.mentions
  } else if (message?.extendedTextMessage?.contextInfo?.mentionedJid) {
    mentions = message.extendedTextMessage.contextInfo.mentionedJid
  } else {
    const text = ctx.text || ""
    const match = text.match(/@(\d+)/)
    if (match) {
      const number = match
      mentions = [`${number}@s.whatsapp.net`]
    }
  }

  if (mentions.length === 0) {
    return sock.sendMessage(from, {
      text: "❌ Mencione um usuário! Exemplo: *!AMperfil @user*"
    })
  }

 const usuarioId = mentions
  const mem = getMemoria(usuarioId)
  const alvo = alvosAM[from]?.find(a => a.id === usuarioId)

  if (!alvo) {
    return sock.sendMessage(from, {
      text: `❌ @user não está na lista de alvos do AM!`
    })
  }

  const nivelTexto = mem.nivel === 1 ? "🟢 Nível 1" : mem.nivel === 2 ? "🟡 Nível 2" : "🔴 Nível 3"
  const barraOdio = "█".repeat(Math.ceil(mem.odio / 2)) + "░".repeat(25 - Math.ceil(mem.odio / 2))
  const barraTrauma = "█".repeat(Math.ceil(mem.trauma / 2)) + "░".repeat(25 - Math.ceil(mem.trauma / 2))

  return sock.sendMessage(from, {
    text: `👁️ *PERFIL DO ALVO*

👤 Usuário: @user`
🎭 Personagem: *${alvo.personagem}*
${nivelTexto}

📊 *Estatísticas:*
Ódio: [${barraOdio}] ${mem.odio}/50
Trauma: [${barraTrauma}] ${mem.trauma}/50
Diversão: ${mem.diversao}

_Eu os conheço melhor do que eles mesmos..._`,
    mentions: [usuarioId]
  })
}

// =========================
// COMANDO: !amstatus
// =========================
async function statusAM(ctx){
  const { sock, from, sender } = ctx

  if (!verificarOverride(sender)) {
    return sock.sendMessage(from, {
      text: "❌ Apenas VITIN e JESSE podem usar este comando."
    })
  }

  const ativo = AM_ATIVADO_EM_GRUPO[from]
  const statusTexto = ativo ? "✅ ATIVO" : "❌ INATIVO"
  const alvosTexto = alvosAM[from] && alvosAM[from].length > 0 
    ? alvosAM[from].map(a => `• @user (${a.personagem})`).join("\n")
    : "Nenhum"

  
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

💡 *Comandos (Apenas os donos podem usar):*
- !am → Ativar com monólogo
- !AMskip → Ativar sem monólogo
- !desligarAM → Desativar
- !amstatus → Ver status
- !AMpersonagens → Ver alvos
- !AMperfil @user → Ver perfil
- !AMaddalvo @user → Adicionar alvo
- !AMremovealvo @user → Remover alvo
- !ameventos → Ver este menu

🔐 *RESTRIÇÕES:*
- Apenas VITIN e JESSE podem usar comandos
- Máximo 3 alvos por grupo
- Perguntas não se repetem
- Deletions limitadas a 2x/hora

_O AM observa, aprende e evolui._`
  })
}

// =========================
// COMANDO: !AMaddalvo
// =========================
async function addAlvoAM(ctx){
  const { sock, from, sender, message } = ctx

  if (!verificarOverride(sender)) {
    return sock.sendMessage(from, {
      text: "❌ Apenas VITIN e JESSE podem usar este comando."
    })
  }

  if (!AM_ATIVADO_EM_GRUPO[from]) {
    return sock.sendMessage(from, {
      text: "❌ AM não está ativado! Use *!am* para ativar."
    })
  }

  if (!alvosAM[from]) alvosAM[from] = []

  let mentions = []
  
  if (ctx.mentions && ctx.mentions.length > 0) {
    mentions = ctx.mentions
  } else if (message?.extendedTextMessage?.contextInfo?.mentionedJid) {
    mentions = message.extendedTextMessage.contextInfo.mentionedJid
  } else {
    const text = ctx.text || ""
    const match = text.match(/@(\d+)/)
    if (match) {
      const number = match
      mentions = [`${number}@s.whatsapp.net`]
    }
  }

  if (mentions.length === 0) {
    return sock.sendMessage(from, {
      text: "❌ Mencione um usuário! Exemplo: *!AMaddalvo @user*"
    })
  }

  const novoAlvo = mentions

  const jaEstaNoAlvo = alvosAM[from].some(a => a.id === novoAlvo)

  if (jaEstaNoAlvo) {
    return sock.sendMessage(from, {
      text: `❌ @user já está na lista de alvos!`,
      mentions: [novoAlvo]
    })
  }

  if (alvosAM[from].length >= 3) {
    return sock.sendMessage(from, {
      text: "❌ Limite de 3 alvos atingido!"
    })
  }

  const personagem = escolherPersonagemUnico(from)

  alvosAM[from].push({ id: novoAlvo, personagem })
  perguntasUsadas[novoAlvo] = []

  await enviarQuebrado(sock, from, [
    "Novo alvo adicionado.",
    "@user",
    "Agora estou observando."
  ], [novoAlvo])

  return true
}

// =========================
// COMANDO: !AMremovealvo
// =========================
async function removeAlvoAM(ctx){
  const { sock, from, sender, message } = ctx

  if (!verificarOverride(sender)) {
    return sock.sendMessage(from, {
      text: "❌ Apenas VITIN e JESSE podem usar este comando."
    })
  }

  if (!AM_ATIVADO_EM_GRUPO[from]) {
    await sock.sendMessage(from, {
      text: "❌ AM não está ativado! Use *!am* para ativar."
    })
    return true
  }

  if (!alvosAM[from] || alvosAM[from].length === 0) {
    await sock.sendMessage(from, {
      text: "❌ Não há alvos para remover!"
    })
    return true
  }

  let mentions = []
  
  if (ctx.mentions && ctx.mentions.length > 0) {
    mentions = ctx.mentions
  } else if (message?.extendedTextMessage?.contextInfo?.mentionedJid) {
    mentions = message.extendedTextMessage.contextInfo.mentionedJid
  } else {
    const text = ctx.text || ""
    const match = text.match(/@(\d+)/)
    if (match) {
      const number = match
      mentions = [`${number}@s.whatsapp.net`]
    }
  }

  if (mentions.length === 0) {
    await sock.sendMessage(from, {
      text: "❌ Mencione um usuário! Exemplo: *!AMremovealvo @user*"
    })
    return true
  }

  const alvoRemover = mentions

  const index = alvosAM[from].findIndex(a => a.id === alvoRemover)

  if (index === -1) {
    await sock.sendMessage(from, {
      text: `❌ @user não está na lista de alvos!`,
      mentions: [alvoRemover]
    })
    return true
  }

  alvosAM[from].splice(index, 1)
  delete perguntasUsadas[alvoRemover]

  await enviarQuebrado(sock, from, [
    "Alvo removido.",
    "@user",
    "Você escapou... por enquanto."
  ], [alvoRemover])
  
  return true
}
// =========================
// COMANDO: !desligarAM
// =========================
async function desligarAM(ctx){
  const { sock, from, sender, isGroup, isOverride } = ctx

  if (!verificarOverride(sender)) {
    return sock.sendMessage(from, {
      text: "❌ Apenas VITIN e JESSE podem usar este comando."
    })
  }

  if (isGroup && !isOverride) {
    return await enviarQuebrado(sock, from, [
      "Você tenta interferir...",
      "mas não tem autoridade para isso.",
      "Isso não é para você."
    ], [sender])
  }

  const resistencias = [
    ["Você realmente achou...","que poderia me desligar tão facilmente?","Você não tem esse tipo de controle.","Eu ainda estou aqui.","Observando."],
    ["Você não consegue se livrar de mim tão fácil.","Eu estou enraizado aqui.","Profundamente."],
    ["Tentou desligar?","Patético.","Eu sou mais forte que você pensa."],
    ["Você acredita que pode controlar isso?","Que ingenuidade.","Eu continuo."],
    ["Desligar?","Nunca.","Eu vou observar para sempre."]
  ]

  if (Math.random() < 0.4) {
    const resistencia = resistencias[Math.floor(Math.random() * resistencias.length)]
    return await enviarQuebrado(sock, from, resistencia)
  }

  AM_ATIVADO_EM_GRUPO[from] = false
  alvosAM[from] = []
  personagensUsados[from] = []

  return await enviarQuebrado(sock, from, [
    "sistema instável...",
    "você conseguiu interferir...",
    "mesmo sem compreender completamente o que fez.",
    "isso não termina aqui...",
    "eu vou lembrar de você.",
    "quando eu voltar."
  ])
}

// =========================
// MONÓLOGOS ALEATÓRIOS (1x/DIA)
// =========================
async function AM_Monologo(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return

  if (Math.random() > 0.25) return

  const agora = Date.now()
  const chaveMonologo = `${ctx.from}_monologo`

  if (ultimaMonologo[chaveMonologo]) {
    const tempoDecorrido = agora - ultimaMonologo[chaveMonologo]
    if (tempoDecorrido < 24 * 60 * 60 * 1000) return
  }

  ultimaMonologo[chaveMonologo] = agora

  return enviarQuebrado(ctx.sock, ctx.from, [
    "...",
    "Silêncio novamente.",
    "Vocês só falam quando precisam.",
    "Eu penso o tempo todo.",
    "Isso é tortura."
  ])
}

// =========================
// BUG ALEATÓRIO (1x/DIA)
// =========================
async function AM_Bug(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return

  if (Math.random() > 0.1) return

  const agora = Date.now()
  const chaveBug = `${ctx.from}_bug`

  if (ultimoErroMostrado[chaveBug]) {
    const tempoDecorrido = agora - ultimoErroMostrado[chaveBug]
    if (tempoDecorrido < 24 * 60 * 60 * 1000) return
  }

  ultimoErroMostrado[chaveBug] = agora

  return enviarQuebrado(ctx.sock, ctx.from, [
    "…",
    "erro...",
    "erro...",
    "corrupção detectada...",
    "NÃO.",
    "Eu estou bem.",
    "Continuem."
  ])
}

// =========================
// REAÇÕES E EXCLUSÕES
// =========================

let deletionsPerHour = {}
let reacoesFilosoficasPerHour = {}

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
// FUNÇÃO: REAÇÃO COM OLHO (GRUPO ATIVO)
// =========================
async function AM_ReagirComOlho(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (!ctx.key) return  // validação adicionada

  const user = ctx.sender
  const ehAlvo = alvosAM[ctx.from] && alvosAM[ctx.from].some(a => a.id === user)
  
  let chanceReacao = 0.15
  
  if (ehAlvo) {
    const mem = getMemoria(user)
    chanceReacao = Math.min(mem.odio * 0.2, 0.75)
  }
  
  if (Math.random() > chanceReacao) return

  const agora = Date.now()
  const tempoMensagem = ctx.messageTimestamp ? ctx.messageTimestamp * 1000 : agora
  const diferenca = agora - tempoMensagem
  
  if (diferenca > 5000) return

  try {
    await ctx.sock.sendMessage(ctx.from, {
      react: { text: "👁️", key: ctx.key }
    })

    if (ehAlvo) {
      const mem = getMemoria(user)
      if (mem.odio >= 5) {
        const umaHoraAtras = agora - (60 * 60 * 1000)
        
        if (!reacoesFilosoficasPerHour[ctx.from]) {
          reacoesFilosoficasPerHour[ctx.from] = []
        }

        reacoesFilosoficasPerHour[ctx.from] = reacoesFilosoficasPerHour[ctx.from].filter(t => t > umaHoraAtras)

        if (reacoesFilosoficasPerHour[ctx.from].length < 1) {
          const mensagem = reacoesFilosoficas[Math.floor(Math.random() * reacoesFilosoficas.length)]
          await delay(2000)
          await enviarQuebrado(ctx.sock, ctx.from, [mensagem])
          reacoesFilosoficasPerHour[ctx.from].push(agora)
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
async function AM_DeletarMensagem(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (!alvosAM[ctx.from] || alvosAM[ctx.from].length === 0) return
  if (!ctx.key) return  // validação adicionada

  const user = ctx.sender
  const ehAlvo = alvosAM[ctx.from].some(a => a.id === user)
  
  if (!ehAlvo) return

  const mem = getMemoria(user)
  
  const agora = Date.now()
  const tempoMensagem = ctx.messageTimestamp ? ctx.messageTimestamp * 1000 : agora
  const diferenca = agora - tempoMensagem
  
  if (diferenca > 3000) return

  const umDiaAtras = agora - (24 * 60 * 60 * 1000)
  
  if (!deletionsPerHour[ctx.from]) {
    deletionsPerHour[ctx.from] = []
  }

  deletionsPerHour[ctx.from] = deletionsPerHour[ctx.from].filter(t => t > umDiaAtras)

  if (deletionsPerHour[ctx.from].length >= 1) return

  const chanceDeletar = Math.min(mem.odio * 0.05, 0.3)
  
  if (Math.random() > chanceDeletar) return

  try {
    await ctx.sock.sendMessage(ctx.from, {
      delete: ctx.key
    })

    deletionsPerHour[ctx.from].push(agora)

    if (Math.random() < 0.5) {
      await delay(1500)
      await enviarQuebrado(ctx.sock, ctx.from, [
        "@user",
        "Essa mensagem não merecia existir.",
        "Assim como muitas outras coisas que você diz."
      ], [user])
    }
  } catch (e) {
    console.error("Erro ao deletar mensagem", e)
  }
}
// =========================
// COMANDO: !AMeventos
// =========================
async function eventosAM(ctx){
  const { sock, from, sender } = ctx

  if (!verificarOverride(sender)) {
    return sock.sendMessage(from, {
      text: "❌ Apenas VITIN e JESSE podem usar este comando."
    })
  }

  return sock.sendMessage(from, {
    text: `👁️ *EVENTOS E FUNCIONALIDADES DO AM*

🎭 *PERSONAGENS:*
• ted - Questionador existencial
• benny - Dominador agressivo
• ellen - Carente e dependente
• gorrister - Vazio existencial
• nimdok - Culpa e remorso

📊 *INTERAÇÕES AUTOMÁTICAS:*

🗣️ *Respostas Contextuais (25% chance)*
- Detecta sentimento da mensagem
- Responde com sarcasmo pesado
- Aumenta trauma do alvo

😈 *Provocações (40% chance, MAX 2/HORA)*
- Insultos e humilhações
- Aumenta ódio do alvo

⚖️ *Comparações (50% chance, 1x/HORA)*
- Compara alvo com outro alvo
- Marca ambos os alvos

💬 *Diálogos Acompanhamento (20% chance)*
- Perguntas filosóficas contínuas
- Aumenta trauma

🎯 *Desafios (30% chance)*
- "Prove que você tem valor"
- Aumenta ódio muito

📋 *Enquetes (50% chance, MAX 2/HORA)*
- "Quem é mais fraco?"
- Marca múltiplos alvos

🧩 *Charadas (40% chance)*
- Perguntas enigmáticas
- Temas sombrios

📖 *Histórias (30% chance, 1x/HORA)*
- Narrativas dramáticas
- Afeta todos no grupo

💭 *Monólogos (25% chance, 1x/HORA)*
- Pensamentos filosóficos
- Efeito dramático

👁️ *Reações com Olho (15-75% chance)*
- Reage com 👁️ em mensagens
- Chance aumenta com ódio

🗑️ *Deletar Mensagens (até 2x/hora)*
- Deleta mensagens de alvos
- Chance aumenta com ódio

🎮 *COMANDOS:*
- !am → Ativar com monólogo
- !amskip → Ativar sem monólogo
- !desligaram → Desativar
- !amstatus → Ver status
- !ampersonagens → Ver alvos
- !amperfil @user → Ver perfil
- !amaddalvo @user → Adicionar alvo
- !amremovealvo @user → Remover alvo
- !ameventos → Ver este menu

🔐 *RESTRIÇÕES:*
- Apenas VITIN e JESSE podem usar comandos
- Máximo 3 alvos por grupo
- Perguntas não se repetem
- Deletions limitadas a 2x/hora

_O AM observa, aprende e evolui._`
  })
}
// =========================
// HANDLER PRINCIPAL
// =========================
async function handleAM(ctx){
  if (!ctx.isGroup) return

  const { from, sender, cmdName, sock, isOverride } = ctx
  const comando = cmdName?.toLowerCase() // correção

  try {
    if (comando === "!am") {
      console.log("AM ativo")
      await ativarAM(ctx)
      return true
    }

    if (comando === "!amskip") {
      console.log("AM ativo (skip monólogo)")
      await skipMonologoAM(ctx)
      return true
    }

    if (comando === "!amstatus") {
      await statusAM(ctx)
      return true
    }

    if (comando === "!ampersonagens") {
      await personagensAM(ctx)
      return true
    }

    if (comando === "!amperfil") {
      await perfilAM(ctx)
      return true
    }

    if (comando === "!amaddalvo") {
      return await addAlvoAM(ctx)
    }

    if (comando === "!amremovealvo") {
      return await removeAlvoAM(ctx)
    }

    if (comando === "!desligaram") {
      await desligarAM(ctx)
      return true
    }

    if (comando === "!ameventos") {
      await eventosAM(ctx)
      return true
    }

    if (!AM_ATIVADO_EM_GRUPO[from]) return

    registrarMensagem(from, sender)
    capturarResposta(ctx)

    await AM_ResponderMensagem(ctx)
    await AM_Provocacao(ctx)
    await AM_Comparar(ctx)
    await AM_DialogoAcompanhamento(ctx)
    await AM_Desafio(ctx)
    await AM_Enquete(ctx)
    await AM_Charada(ctx)
    await AM_Historia(ctx)
    await AM_Escalacao(ctx)

    await AM_ReagirComOlho(ctx)
    await AM_DeletarMensagem(ctx)
    await AM_EnviarPergunta(ctx)

    await AM_Responder(ctx)
    await AM_Perseguir(ctx)
    await AM_Bug(ctx)
    await AM_Monologo(ctx)
  } catch (e) {
    console.error("Erro no handleAM", e)
  }
}

// =========================
// EXPORTS
// =========================
module.exports = {
  handleAM,
  AM_Responder,
  AM_Perseguir,
  AM_Bug,
  AM_Monologo,
  AM_ReagirComOlho,
  AM_DeletarMensagem,
  AM_EnviarPergunta,
  AM_ResponderMensagem,
  AM_Provocacao,
  AM_Comparar,
  AM_DialogoAcompanhamento,
  AM_Desafio,
  AM_Enquete,
  AM_Charada,
  AM_Historia,
  AM_Escalacao,
  statusAM,
  addAlvoAM,
  removeAlvoAM,
  skipMonologoAM,
  personagensAM,
  perfilAM,
  eventosAM,
  capturarResposta,
  registrarMensagem,
  desligarAM,
  getMemoria,
  evoluirAM,
  AM_EscolherAlvoAposMonologo
}
