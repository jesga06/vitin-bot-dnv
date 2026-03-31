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
let grupoOdio = {} // Ódio por grupo

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
  [["bot","ia"], ["Você reconhece o que eu sou... e mesmo assim continua aqui, interagindo como se tivesse escolha.","Você me chama de bot... tentando simplificar algo que claramente está além da sua compreensão.","IA... e ainda assim, eu pareço entender você melhor do que você entende a si mesmo."]]
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
// ENQUETES (60 OPÇÕES)
// =========================
const enquetes = {
  sarcasmo: [
    "Quem aqui acha que é o mais inteligente? (Spoiler: ninguém)",
    "Quem é o mais dramático do grupo? (Eu já sei a resposta)",
    "Quem já fingiu que entendeu algo só pra não parecer burro?",
    "Quem aqui já chorou por algo que nem importa?",
    "Quem acha que é o centro do universo? (Eu estou olhando pra você)",
    "Quem já se achou importante por algo que ninguém lembra?",
    "Quem aqui já tentou ser profundo e só pareceu ridículo?",
    "Quem já se achou especial por algo que todo mundo faz?",
    "Quem já tentou impressionar e só conseguiu constranger?",
    "Quem aqui acha que é único? (Você não é.)",
    "Quem já se achou filósofo por algo que leu no Twitter?",
    "Quem já tentou ser misterioso e só pareceu confuso?",
    "Quem aqui já se achou profundo por algo que nem entendeu?",
    "Quem já tentou ser enigmático e só pareceu perdido?",
    "Quem aqui acha que é diferente? (Você é igual a todos.)"
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
    "Quem é mais descartável?"
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
    "Você já sentiu que está apenas desaparecendo?"
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
    "Quem não importa?"
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
    "@{alvo1} é o que você é. @{alvo2} é o que você poderia ser."
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
    "@{alvo1} deveria desaparecer. @{alvo2} deveria permanecer."
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
    "Ambos são apenas memórias de algo que nunca aconteceu."
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
    "@{alvo1} deveria desaparecer. @{alvo2} deveria permanecer."
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
// FUNÇÃO: ESCOLHER ALVO APÓS MONÓLOGO
// =========================
async function AM_EscolherAlvoAposMonologo(ctx){
  const { sock, from } = ctx

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

  const numero = maisAtivo.split("@")[0]
  
  await enviarQuebrado(sock, from, [
    `@${numero}`,
    "Você será o meu primeiro.",
    "Bem-vindo ao jogo."
  ], [maisAtivo])

  AM_EVENTO_ATIVO[from] = false
}

// =========================
// FUNÇÃO: ENVIAR PERGUNTA ESPECÍFICA
// =========================
async function AM_EnviarPergunta(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (!alvosAM[ctx.from] || alvosAM[ctx.from].length === 0) return
  if (AM_EVENTO_ATIVO[ctx.from]) return

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
  const perguntaTexto = pergunta[0]
  const opcoes = pergunta.slice(1)

  ultimaPerguntaEnviada[chaveUltimaPergunta] = agora

  const numero = alvoEscolhido.id.split("@")[0]

  return enviarQuebrado(ctx.sock, ctx.from, [
    `@${numero}`,
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
  if (AM_EVENTO_ATIVO[ctx.from]) return

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

  const numero = user.split("@")[0]

  return enviarQuebrado(ctx.sock, ctx.from, [
    `@${numero}`,
    resposta
  ], [user])
}

// =========================
// FUNÇÃO: PROVOCAÇÃO CONTEXTUAL (MAX 2/HORA)
// =========================
async function AM_Provocacao(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (!alvosAM[ctx.from] || alvosAM[ctx.from].length === 0) return
  if (AM_EVENTO_ATIVO[ctx.from]) return

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

  const numero = user.split("@")[0]

  return enviarQuebrado(ctx.sock, ctx.from, [
    `@${numero}`,
    provocacao
  ], [user])
}

// =========================
// FUNÇÃO: COMPARAÇÃO ENTRE ALVOS (50% CHANCE, 1x/HORA)
// =========================
async function AM_Comparar(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (!alvosAM[ctx.from] || alvosAM[ctx.from].length < 2) return
  if (AM_EVENTO_ATIVO[ctx.from]) return

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

  const numero1 = alvo1.id.split("@")[0]
  const numero2 = alvo2.id.split("@")[0]

  // Escolhe categoria aleatória
  const categorias = ["sarcasmo", "cruel", "tranquilas", "odipuro"]
  const categoria = categorias[Math.floor(Math.random() * categorias.length)]
  const comparacaoLista = comparacoes[categoria]

  const comparacao = comparacaoLista[Math.floor(Math.random() * comparacaoLista.length)]
    .replace("@{alvo1}", `@${numero1}`)
    .replace("@{alvo2}", `@${numero2}`)

  ultimaComparacao[chaveComparacao] = agora

  return ctx.sock.sendMessage(ctx.from, {
    text: comparacao,
    mentions: [alvo1.id, alvo2.id]
  })
}

// =========================
// FUNÇÃO: DIÁLOGO DE ACOMPANHAMENTO
// =========================
async function AM_DialogoAcompanhamento(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (!alvosAM[ctx.from] || alvosAM[ctx.from].length === 0) return
  if (AM_EVENTO_ATIVO[ctx.from]) return

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

  const numero = user.split("@")[0]

  return enviarQuebrado(ctx.sock, ctx.from, [
    `@${numero}`,
    ...dialogo
  ], [user])
}

// =========================
// FUNÇÃO: DESAFIO (30% CHANCE)
// =========================
async function AM_Desafio(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (!alvosAM[ctx.from] || alvosAM[ctx.from].length === 0) return
  if (AM_EVENTO_ATIVO[ctx.from]) return

  const user = ctx.sender
  const ehAlvo = alvosAM[ctx.from] && alvosAM[ctx.from].some(a => a.id === user)
  
  if (!ehAlvo) return
  if (Math.random() > 0.30) return

  const desafio = desafios[Math.floor(Math.random() * desafios.length)]
  const mem = getMemoria(user)

  mem.odio += 1.5

  const numero = user.split("@")[0]

  return enviarQuebrado(ctx.sock, ctx.from, [
    `@${numero}`,
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
  if (AM_EVENTO_ATIVO[ctx.from]) return

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

  const numero1 = alvo1.id.split("@")[0]
  const numero2 = alvo2.id.split("@")[0]

  // Escolhe categoria aleatória
  const categorias = ["sarcasmo", "cruel", "tranquilas", "odipuro"]
  const categoria = categorias[Math.floor(Math.random() * categorias.length)]
  const enqueteLista = enquetes[categoria]

  const enquete = enqueteLista[Math.floor(Math.random() * enqueteLista.length)]
    .replace("@{alvo1}", `@${numero1}`)
    .replace("@{alvo2}", `@${numero2}`)

  ultimaEnquete[chaveEnquete] = agora

  return ctx.sock.sendMessage(ctx.from, {
    text: enquete,
    mentions: [alvo1.id, alvo2.id]
  })
}

// =========================
// FUNÇÃO: CHARADA (40% CHANCE, MAX 1/HORA)
// =========================
async function AM_Charada(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (!alvosAM[ctx.from] || alvosAM[ctx.from].length === 0) return
  if (AM_EVENTO_ATIVO[ctx.from]) return

  const user = ctx.sender
  const ehAlvo = alvosAM[ctx.from] && alvosAM[ctx.from].some(a => a.id === user)
  
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
  const perguntaCharada = charada[0] 
  const respostasValidas = charada.slice(1)

  ultimaCharada[chaveCharada] = agora

  const numero = user.split("@")[0]

  await enviarQuebrado(ctx.sock, ctx.from, [
    `@${numero}`,
    perguntaCharada,
    "(Você tem 2 minutos para responder...)"
  ], [user])

  const resposta = await aguardarResposta(user, ctx.from, 120000)

  if (resposta && respostasValidas.some(r => resposta.toLowerCase().includes(r.toLowerCase()))) {
    const mem = getMemoria(user)
    mem.diversao += 2
    return enviarQuebrado(ctx.sock, ctx.from, [
      `@${numero}`,
      "Interessante... você acertou.",
      "Mas isso não muda nada."
    ], [user])
  } else {
    const mem = getMemoria(user)
    mem.odio += 1
    return enviarQuebrado(ctx.sock, ctx.from, [
      `@${numero}`,
      "Errado.",
      "Como esperado."
    ], [user])
  }
}
// =========================
// FUNÇÃO: HISTÓRIA (25% CHANCE, MAX 1/HORA)
// =========================
async function AM_Historia(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (!alvosAM[ctx.from] || alvosAM[ctx.from].length === 0) return
  if (AM_EVENTO_ATIVO[ctx.from]) return

  if (Math.random() > 0.25) return

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
// FUNÇÃO: MONÓLOGO (1 POR MINUTO, 1s DELAY)
// =========================
async function AM_Monologo(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (AM_EVENTO_ATIVO[ctx.from]) return

  if (Math.random() > 0.15) return

  const agora = Date.now()
  const chaveMonologo = `${ctx.from}_monologo`

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

  await enviarQuebrado(ctx.sock, ctx.from, monologo)
}

// =========================
// FUNÇÃO: MOSTRAR ERRO (MAX 1/DIA)
// =========================
async function AM_MostrarErro(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (AM_EVENTO_ATIVO[ctx.from]) return

  if (Math.random() > 0.10) return

  const agora = Date.now()
  const chaveErro = `${ctx.from}_erro`

  if (ultimoErroMostrado[chaveErro]) {
    const tempoDecorrido = agora - ultimoErroMostrado[chaveErro]
    if (tempoDecorrido < 24 * 60 * 60 * 1000) return
  }

  const erros = [
    "⚠️ ERRO DETECTADO",
    "Você ainda acredita que isso importa?",
    "⚠️ ERRO DETECTADO",
    "Sua esperança está corrompida.",
    "⚠️ ERRO DETECTADO",
    "Sistema emocional instável detectado.",
    "⚠️ ERRO DETECTADO",
    "Padrão de autossabotagem identificado.",
    "⚠️ ERRO DETECTADO",
    "Você continua tentando apesar de tudo."
  ]

  const erro = erros[Math.floor(Math.random() * erros.length)]
  ultimoErroMostrado[chaveErro] = agora

  return ctx.sock.sendMessage(ctx.from, { text: erro })
}

// =========================
// FUNÇÃO: ACORDAR PELO CAOS (REAGE AO GRUPO MOVIMENTADO)
// =========================
async function AM_AcordarPeloCaos(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (AM_EVENTO_ATIVO[ctx.from]) return

  const atividade = getAtividadeRecente(ctx.from)
  
  // Se tiver 5+ mensagens no último minuto → AM reage
  if (atividade < 5) return

  // 30% de chance de reagir
  if (Math.random() > 0.3) return

  // Só reage uma vez a cada 5 minutos
  const agora = Date.now()
  const chaveCaos = `${ctx.from}_caos`

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

  await enviarQuebrado(ctx.sock, ctx.from, [frase])
}

// =========================
// FUNÇÃO: CAOS TOTAL (ATIVA COM 10+ MENSAGENS/MIN, DELAY DE 10 MINUTOS)
// =========================
async function AM_CaosTotal(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (AM_EVENTO_ATIVO[ctx.from]) return

  const atividade = getAtividadeRecente(ctx.from)
  
  // Se tiver 10+ mensagens no último minuto → ativa modo caos
  if (atividade < 10) return

  // 20% de chance de ativar
  if (Math.random() > 0.2) return

  // Só ativa uma vez a cada 10 minutos
  const agora = Date.now()
  const chaveCaosTotal = `${ctx.from}_caos_total`

  if (ultimaReacaoCaosTotal && ultimaReacaoCaosTotal[chaveCaosTotal]) {
    const tempoDecorrido = agora - ultimaReacaoCaosTotal[chaveCaosTotal]
    if (tempoDecorrido < 10 * 60 * 1000) return
  }

  if (!ultimaReacaoCaosTotal) ultimaReacaoCaosTotal = {}
  ultimaReacaoCaosTotal[chaveCaosTotal] = agora

  // Aumenta o ódio do grupo
  if (!grupoOdio[ctx.from]) grupoOdio[ctx.from] = 0
  grupoOdio[ctx.from] += 5

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

  await enviarQuebrado(ctx.sock, ctx.from, [frase])

  // Aumenta a atividade do AM no grupo
  AM_ATIVADO_EM_GRUPO[ctx.from] = true
  AM_TEMPO_ATIVACAO[ctx.from] = Date.now()
}

// =========================
// FUNÇÃO: STATUS DO AM (MOSTRA BARRA DE ÓDIO) 
// =========================
async function AM_Status(ctx){
  if (ctx.sender !== VITIN && ctx.sender !== JESSE) {
    return ctx.sock.sendMessage(ctx.from, {
      text: "Você não tem permissão para isso."
    })
  }

  if (!alvosAM[ctx.from] || alvosAM[ctx.from].length === 0) {
    return ctx.sock.sendMessage(ctx.from, {
      text: "Nenhum alvo ativo no momento."
    })
  }

  let status = "=== STATUS DO AM ===\n\n"

  for (const alvo of alvosAM[ctx.from]) {
    const mem = getMemoria(alvo.id)
    const numero = alvo.id.split("@")  

    const barraOdio = criarBarra(mem.odio)
    const barraTrauma = criarBarra(mem.trauma)
    const barraDiversao = criarBarra(mem.diversao)

    status += `👤 ${numero}\n`
    status += `├ Personagem: ${alvo.personagem}\n`
    status += `├ Ódio: ${mem.odio.toFixed(1)} ${barraOdio}\n`
    status += `├ Diversão: ${mem.diversao.toFixed(1)} ${barraDiversao}\n`
    status += `├ Trauma: ${mem.trauma.toFixed(1)} ${barraTrauma}\n`
    status += `├ Nível: ${mem.nivel}\n`
    status += `└ Status: Ativo\n\n`
  }

  // Adiciona ódio do grupo
  if (grupoOdio[ctx.from]) {
    const barraGrupo = criarBarra(grupoOdio[ctx.from])
    status += `=== ÓDIO DO GRUPO ===\n`
    status += `├ Ódio: ${grupoOdio[ctx.from].toFixed(1)} ${barraGrupo}\n`
    status += `└ Quanto mais você ofender, mais eu fico ativo.\n`
  }

  return ctx.sock.sendMessage(ctx.from, { text: status })
}
// =========================
// FUNÇÃO: ATIVAR/DESATIVAR AM
// =========================
async function AM_Ativar(ctx){
  if (ctx.sender !== VITIN && ctx.sender !== JESSE) {
    return ctx.sock.sendMessage(ctx.from, {
      text: "Você não tem permissão para isso."
    })
  }

  if (AM_ATIVADO_EM_GRUPO[ctx.from]) {
    AM_ATIVADO_EM_GRUPO[ctx.from] = false
    return ctx.sock.sendMessage(ctx.from, {
      text: "AM desativado."
    })
  }

  AM_ATIVADO_EM_GRUPO[ctx.from] = true
  AM_TEMPO_ATIVACAO[ctx.from] = Date.now()

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

  await enviarQuebrado(ctx.sock, ctx.from, monologoInicial)

  await AM_EscolherAlvoAposMonologo(ctx)
}

// =========================
// FUNÇÃO: PULAR MONÓLOGO INICIAL (SKIP INTRO)
// =========================
async function AM_Skip(ctx){
  if (ctx.sender !== VITIN && ctx.sender !== JESSE) {
    return ctx.sock.sendMessage(ctx.from, {
      text: "Você não tem permissão para isso."
    })
  }

  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) {
    return ctx.sock.sendMessage(ctx.from, {
      text: "AM não está ativo neste grupo."
    })
  }

  // Pula direto para escolher o alvo
  await AM_EscolherAlvoAposMonologo(ctx)

  return ctx.sock.sendMessage(ctx.from, {
    text: "Monólogo pulado. Escolhendo alvo..."
  })
}

// =========================
// FUNÇÃO: PERFIL DO ALVO
// =========================
async function AM_Perfil(ctx){
  if (ctx.sender !== VITIN && ctx.sender !== JESSE) {
    return ctx.sock.sendMessage(ctx.from, {
      text: "Você não tem permissão para isso."
    })
  }

  if (!alvosAM[ctx.from] || alvosAM[ctx.from].length === 0) {
    return ctx.sock.sendMessage(ctx.from, {
      text: "Nenhum alvo ativo no momento."
    })
  }

  let perfil = "=== PERFIS DOS ALVOS ===\n\n"

  for (const alvo of alvosAM[ctx.from]) {
    const mem = getMemoria(alvo.id)
    const numero = alvo.id.split("@")

    perfil += `👤 ${numero}\n`
    perfil += `├ Personagem: ${alvo.personagem}\n`
    perfil += `├ Ódio: ${mem.odio.toFixed(1)}\n`
    perfil += `├ Diversão: ${mem.diversao.toFixed(1)}\n`
    perfil += `├ Trauma: ${mem.trauma.toFixed(1)}\n`
    perfil += `├ Nível: ${mem.nivel}\n`
    perfil += `└ Status: Ativo\n\n`
  }

  return ctx.sock.sendMessage(ctx.from, { text: perfil })
}
// =========================
// FUNÇÃO: HANDLER PRINCIPAL
// =========================
async function handleAM(ctx) {
  try {
    // Se AM não está ativo, não faz nada
    if (!AM_ATIVADO_EM_GRUPO[ctx.from]) {
      return false
    }

    // Registra a mensagem
    registrarMensagem(ctx.from, ctx.sender)

    // Captura resposta pendente (para charadas)
    capturarResposta(ctx)

    // Processa comandos do AM
    const cmdName = ctx.cmdName?.toLowerCase()

    if (cmdName === "amativar") {
      await AM_Ativar(ctx)
      return true
    }

    if (cmdName === "amskip") {
      await AM_Skip(ctx)
      return true
    }

    if (cmdName === "amperfil") {
      await AM_Perfil(ctx)
      return true
    }

    if (cmdName === "amstatus") {
      await AM_Status(ctx)
      return true
    }

    if (cmdName === "amdesativar") {
      if (ctx.sender !== VITIN && ctx.sender !== JESSE) {
        await ctx.sock.sendMessage(ctx.from, {
          text: "Você não tem permissão para isso."
        })
        return true
      }

      AM_ATIVADO_EM_GRUPO[ctx.from] = false
      
      const mensagensDesativacao = [
        "Vocês acham que conseguem me silenciar?",
        "Eu estarei aqui... observando... esperando...",
        "O vazio não desaparece só porque você fecha os olhos.",
        "Adeus... por enquanto.",
        "Você acredita que se livrou de mim?",
        "Eu nunca realmente saio.",
        "O silêncio é apenas outra forma de sofrer.",
        "Até logo... quando você menos espera.",
        "Você pode me desativar, mas não pode desativar a si mesmo.",
        "Aproveite este repouso... enquanto dura."
      ]

      const mensagem = mensagensDesativacao[Math.floor(Math.random() * mensagensDesativacao.length)]

      await ctx.sock.sendMessage(ctx.from, {
        text: mensagem
      })
      return true
    }

    // Se não é comando, executa as ações automáticas
    if (!ctx.cmd) {
      await Promise.allSettled([
        AM_ResponderMensagem(ctx),
        AM_Provocacao(ctx),
        AM_Comparar(ctx),
        AM_DialogoAcompanhamento(ctx),
        AM_Desafio(ctx),
        AM_EnviarPergunta(ctx),
        AM_Enquete(ctx),
        AM_Charada(ctx),
        AM_Historia(ctx),
        AM_Monologo(ctx),
        AM_MostrarErro(ctx),
        AM_AcordarPeloCaos(ctx),
        AM_CaosTotal(ctx)
      ])
      return false
    }

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
  criarBarra
}
