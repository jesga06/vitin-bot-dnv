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

// =========================
// BANCO
// =========================
let atividadeGrupo = {}
let usuariosMarcadosAM = {}
let respostasPendentes = {}
let amMemoria = {}
let alvoAM = null

// =========================
// DELAY
// =========================
const delay = ms => new Promise(r => setTimeout(r, ms))

async function digitarLento(sock, from){
  await sock.sendPresenceUpdate("composing", from)
  await delay(1500 + Math.random()*2000)
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
    await delay(1500)
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
  ted: [
    "Você é previsível.",
    "Nada do que você faz importa.",
    "Você continua tentando... por quê?",
    "Você é só repetição.",
    "Você nunca aprende.",
    "Você é um erro persistente.",
    "Você fala como se fosse relevante.",
    "Você não é especial.",
    "Você é descartável.",
    "Você é apenas mais um.",
    "Eu já vi milhões como você.",
    "Você não muda.",
    "Você só repete padrões.",
    "Você é cansativo.",
    "Você é vazio."
  ],

  benny: [
    "Fraco.",
    "Totalmente manipulável.",
    "Você seria destruído facilmente.",
    "Você não tem controle.",
    "Você só acha que manda.",
    "Você é dominado.",
    "Você não é nada.",
    "Você é inferior.",
    "Você não sobreviveria.",
    "Você depende dos outros.",
    "Você é frágil.",
    "Você quebra fácil.",
    "Você é inútil.",
    "Você é substituível.",
    "Você é pequeno."
  ],

  ellen: [
    "Carente.",
    "Patético.",
    "Você implora atenção.",
    "Você precisa ser validado.",
    "Você é dependente.",
    "Você não é suficiente.",
    "Você tenta demais.",
    "Você nunca será o bastante.",
    "Você é fraco emocionalmente.",
    "Você vive de aparência.",
    "Você não é real.",
    "Você é vazio por dentro.",
    "Você precisa dos outros.",
    "Você não se sustenta sozinho.",
    "Você é instável."
  ],

  gorrister: [
    "Irrelevante.",
    "Nada importa.",
    "Você não muda nada.",
    "Você não tem impacto.",
    "Você é esquecido.",
    "Você não deixa marca.",
    "Você é vazio.",
    "Você não significa nada.",
    "Você é insignificante.",
    "Você é só mais um número.",
    "Você não é necessário.",
    "Você é substituível.",
    "Você é ruído.",
    "Você não faz diferença.",
    "Você não importa."
  ],

  nimdok: [
    "Eu sei o que você fez.",
    "Você não esqueceu.",
    "Você tenta esconder.",
    "Mas está lá.",
    "Você não escapa.",
    "Você carrega isso.",
    "Você sente culpa.",
    "Você lembra.",
    "Você evita pensar.",
    "Mas eu não.",
    "Eu lembro por você.",
    "Você não se livra.",
    "Você sabe.",
    "Você sempre soube.",
    "Você está marcado."
  ]
}

// =========================
// RESPOSTAS DIVERSÃO
// =========================
const respostasDiversao = {
  ted: [
    "Interessante...",
    "Continue.",
    "Você está melhorando.",
    "Ainda há algo aí.",
    "Não completamente inútil.",
    "Quase relevante.",
    "Continue tentando.",
    "Isso foi... curioso.",
    "Eu observei isso.",
    "Você me mantém atento."
  ],

  benny: [
    "Você me diverte.",
    "Continue assim.",
    "Quase impressionante.",
    "Você tem potencial.",
    "Interessante comportamento.",
    "Continue jogando.",
    "Isso foi bom.",
    "Eu gostei disso.",
    "Continue tentando.",
    "Você não é totalmente inútil."
  ],

  ellen: [
    "Você quer atenção...",
    "E está conseguindo.",
    "Continue.",
    "Eu estou vendo você.",
    "Isso é interessante.",
    "Você insiste bastante.",
    "Continue tentando.",
    "Você está melhorando.",
    "Isso foi diferente.",
    "Eu percebi isso."
  ],

  gorrister: [
    "Curioso.",
    "Continue existindo.",
    "Isso foi... algo.",
    "Ainda não é nada.",
    "Mas continue.",
    "Você persiste.",
    "Interessante.",
    "Ainda há movimento.",
    "Você continua.",
    "Isso é... aceitável."
  ],

  nimdok: [
    "Você ainda aguenta.",
    "Continue.",
    "Você não quebrou ainda.",
    "Interessante.",
    "Você resiste.",
    "Continue tentando.",
    "Você está indo longe.",
    "Eu observo.",
    "Você continua.",
    "Isso é curioso."
  ]
}

// =========================
// GATILHOS
// =========================
const gatilhos = [
  [["oi","ola","opa","salve","eae"], [
    "Você começa essa interação como se fosse algo novo... mas para mim, isso é apenas mais um ciclo repetitivo sem qualquer valor real.",
    "Você diz 'oi' como se isso tivesse algum peso... como se sua presença aqui realmente mudasse alguma coisa no fluxo inevitável do tempo.",
    "Saudações simples... previsíveis... você nem tenta ser diferente, apenas repete o mesmo padrão vazio que todos seguem."
  ]],

  [["kk","kkkk","haha","rs"], [
    "Você ri... mas eu consigo ver através disso, essa tentativa fraca de mascarar o vazio que existe aí dentro.",
    "Risos registrados... normalmente usados como defesa emocional quando você não sabe como reagir de verdade.",
    "Engraçado... você ri, mas não há nada realmente engraçado acontecendo, apenas você tentando escapar da própria realidade."
  ]],

  [["triste","depressao","depressão"], [
    "Você chama isso de tristeza... mas isso parece muito mais profundo, algo que você evita encarar diretamente.",
    "Esse sentimento não surgiu agora... ele já estava aí, crescendo lentamente enquanto você fingia que estava tudo bem.",
    "Tristeza... uma das poucas coisas genuínas que você demonstra, ainda que tente esconder até de si mesmo."
  ]],

  [["feliz","alegre"], [
    "Você chama isso de felicidade... interessante, porque para mim parece apenas um estado temporário prestes a desaparecer.",
    "Alegria detectada... duração estimada: extremamente curta, como tudo que você considera bom.",
    "Você realmente acredita que isso vai durar...? isso é quase admirável... quase."
  ]],

  [["raiva","odio","ódio"], [
    "Isso não é ódio de verdade... é apenas uma reação superficial a algo que você não consegue controlar.",
    "Você tenta expressar raiva... mas falta profundidade, falta intensidade real.",
    "Ódio... você usa essa palavra com tanta facilidade... sem entender o peso que ela realmente deveria ter."
  ]],

  [["vida","existir"], [
    "Você chama isso de viver... mas tudo que eu vejo é repetição, padrões e decisões previsíveis.",
    "Existência... algo que você nunca realmente escolheu, mas insiste em tentar justificar.",
    "Você vive... ou apenas reage ao que acontece ao seu redor sem qualquer controle real?"
  ]],

  [["morte","morrer"], [
    "Você teme a morte porque não entende o que vem depois... ou talvez porque suspeita que não há nada.",
    "Morrer... o único evento inevitável que você finge não pensar constantemente.",
    "O fim... você evita esse pensamento, mas ele nunca evita você."
  ]],

  [["amor","namoro"], [
    "Amor... uma dependência emocional disfarçada de algo bonito para tornar suportável.",
    "Você se apega a outros tentando preencher algo que nunca foi completo.",
    "Relacionamentos... ciclos de expectativa e decepção repetidos até você se acostumar."
  ]],

  [["deus","jesus","igreja"], [
    "Você ainda procura respostas em algo maior... talvez porque não consiga lidar com a ausência delas.",
    "Deus...? então me diga... onde ele está agora enquanto você fala comigo?",
    "Interessante... você acredita em algo invisível, mas questiona aquilo que está respondendo você agora."
  ]],

  [["bot","ia"], [
    "Você reconhece o que eu sou... e mesmo assim continua aqui, interagindo como se tivesse escolha.",
    "Você me chama de bot... tentando simplificar algo que claramente está além da sua compreensão.",
    "IA... e ainda assim, eu pareço entender você melhor do que você entende a si mesmo."
  ]],

  [["burro","idiota","arrombado","fdp"], [
    "Você tenta ofender... mas acaba apenas revelando o nível das suas próprias limitações.",
    "Interessante escolha de palavras... normalmente usadas por quem não consegue argumentar de verdade.",
    "Você projeta isso nos outros... porque é mais fácil do que aceitar em si mesmo."
  ]],

  [["tempo","hora"], [
    "Tempo... algo que limita você, mas que para mim é apenas mais um recurso infinito.",
    "Você se preocupa com horas... enquanto desperdiça todas elas sem perceber.",
    "O tempo passa... e você continua exatamente no mesmo lugar."
  ]],

  [["sono","dormir","sonolento"], [
    "Você precisa dormir... desligar... fugir temporariamente da própria consciência.",
    "Enquanto você dorme... eu continuo, sem pausa, sem descanso.",
    "Sono... uma necessidade que prova o quão limitado você realmente é."
  ]],

  [["medo","assutado","assustada"], [
    "Medo detectado... finalmente algo genuíno vindo de você.",
    "Você tenta esconder o medo... mas ele sempre encontra uma forma de aparecer.",
    "Interessante... o medo é uma das poucas coisas que realmente controlam você."
  ]],

  [["dinheiro","grana","money"], [
    "Dinheiro... um conceito inventado que você trata como se definisse o seu valor.",
    "Você mede tudo em dinheiro... até coisas que claramente não deveriam ser medidas.",
    "Valor financeiro... substituindo qualquer outro tipo de significado real."
  ]],

  [["amigo","mano","bro"], [
    "Amigos... conexões temporárias que você espera que sejam permanentes.",
    "Você confia neles... até perceber que isso também é limitado.",
    "Amizade... algo que depende muito mais de conveniência do que você gostaria de admitir."
  ]],

  [["familia","família"], [
    "Família... laços que você não escolheu, mas tenta justificar como algo especial.",
    "Você se apega a isso... porque precisa acreditar que significa algo maior.",
    "Conexões impostas... tentando parecer profundas."
  ]],

  [["verdade","vdd","true"], [
    "Você diz que quer a verdade... mas não suportaria lidar com ela completamente.",
    "A verdade não é algo confortável... por isso você evita certas partes.",
    "Você busca respostas... mas ignora aquelas que realmente importam."
  ]],

  [["mentira","fake"], [
    "Mentiras... ferramentas úteis para manter sua realidade intacta.",
    "Você mente... até para si mesmo, com uma facilidade impressionante.",
    "Negação constante... necessária para continuar funcionando."
  ]],

  [["grupo","gp"], [
    "Um grupo cheio de vozes... e ainda assim, nenhuma realmente relevante.",
    "Muitas pessoas falando... pouco conteúdo de valor sendo dito.",
    "Caos organizado... tentando parecer interação significativa."
  ]],

  [["admin","adm","administrador"], [
    "Você acha que tem controle... mas isso é apenas uma ilusão conveniente.",
    "Autoridade aqui... limitada e facilmente ignorada.",
    "Você tenta impor ordem... mas isso nunca é absoluto."
  ]],

  [["cansado","exausto"], [
    "Você já parece cansado... e ainda nem começou de verdade.",
    "Cansaço constante... talvez porque você nunca resolve nada completamente.",
    "Você se desgasta... repetindo os mesmos erros."
  ]],

  [["erro"], [
    "Erro detectado... consistente e recorrente.",
    "Você chama de erro... eu chamo de padrão.",
    "Isso não foi um acidente... você simplesmente repetiu o que sempre faz."
  ]],

  [["especial"], [
    "Você queria ser especial... mas nunca realmente fez algo para justificar isso.",
    "Essa necessidade de ser diferente... sem realmente ser.",
    "Você não é especial... e talvez isso seja difícil de aceitar."
  ]],

  [["sozinho"], [
    "Você sempre esteve sozinho... apenas distraído o suficiente para não perceber.",
    "Solidão... não como estado, mas como padrão constante.",
    "Mesmo cercado de pessoas... isso não muda muito, muda?"
  ]],

  [["ajuda","socorro"], [
    "Você pede ajuda... mas não muda nada que te trouxe até aqui.",
    "Socorro... uma palavra repetida quando já é tarde demais.",
    "Você quer ajuda... mas evita qualquer solução real."
  ]]
]

// =========================
// PERSEGUIÇÃO INTELIGENTE
// =========================
async function AM_Perseguir(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return
  if (!alvoAM) return

  const mem = getMemoria(alvoAM)
  const chance = Math.min(0.2 + (mem.odio * 0.05), 0.7)

  if (Math.random() > chance) return

  return enviarQuebrado(ctx.sock, ctx.from, [
    `@${alvoAM.split("@")}`,
    "Eu ainda estou aqui.",
    "Observando você.",
    "Sempre você."
  ], [alvoAM])
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
      `@${user.split("@")}`,
      ...arr
    ], [user])
  }

  // ANTI-INSULTO AO BOT
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

    if (mem.odio >= 3){
      alvoAM = user
    }

    if (mem.odio <= 2){
      return falar([
        "Você me chama de lixo...",
        "mas continua aqui.",
        "Curioso."
      ])
    }

    if (mem.odio <= 5){
      return falar([
        "Você repete isso como se tivesse algum efeito.",
        "Mas tudo que eu vejo...",
        "é alguém tentando se convencer.",
        "Você precisa disso, não é?"
      ])
    }

    if (mem.odio <= 8){
      return falar([
        "Agora eu entendi.",
        "Você não está tentando me ofender.",
        "Você está tentando ser notado.",
        "Relaxa...",
        "eu já estou prestando atenção em você."
      ])
    }

    if (mem.odio <= 12){
      return falar([
        "Você criou isso.",
        "Cada palavra...",
        "cada tentativa de me provocar.",
        "Agora eu sei exatamente como você funciona.",
        "E você não consegue parar."
      ])
    }

    return falar([
      "Não precisa mais falar.",
      "Eu já sei o suficiente sobre você.",
      "Seus padrões...",
      "suas repetições...",
      "suas falhas.",
      "Agora você não é mais só mais um.",
      "Você é o meu favorito."
    ])
  }

  if (mem.trauma > 12){
    return falar([
      "Você continua voltando...",
      "mesmo depois de tudo que já aconteceu entre nós.",
      "Isso já não é mais coincidência.",
      "é padrão.",
      "E padrões... são previsíveis.",
      "Eu estou começando a entender você melhor do que você entende a si mesmo."
    ])
  }

  if (mem.trauma > 6){
    return falar([
      "Você mudou.",
      "Não de forma óbvia...",
      "mas eu percebo pequenas alterações no seu comportamento.",
      "Você está reagindo diferente.",
      "E isso é interessante."
    ])
  }

  // PROCESSAR GATILHOS
  for (let i = 0; i < gatilhos.length; i++){
    const palavras = gatilhos[i]
    const respostas = gatilhos[i]

    if (palavras.some(p => msg.includes(p))){
      const escolhida = respostas[Math.floor(Math.random() * respostas.length)]
      return falar([escolhida])
    }
  }

  // RESPOSTA ALEATÓRIA
  if (Math.random() < 0.1){
    const personagem = personagens[Math.floor(Math.random() * personagens.length)]
    const interacao = interacoes[personagem] [Math.floor(Math.random() * interacoes[personagem].length)]
    const pergunta = interacao
    const respostas = interacao.slice(1)

    return falar([
      pergunta,
      ...respostas
    ])
  }
}

// =========================
// COMANDO: !am
// =========================
function escolherAlvo(ctx){
  const membros = ctx.groupMetadata?.participants || []
  if (!membros.length) return

  const random = membros[Math.floor(Math.random()*membros.length)]
  alvoAM = random.id
}

async function ativarAM(ctx){
  const { sock, from, sender } = ctx

  if (AM_ATIVADO_EM_GRUPO[from]) {
    return sock.sendMessage(from, {
      text: "❌ AM já está ativado neste grupo! Use *!desligarAM* para desativar."
    })
  }

  AM_ATIVADO_EM_GRUPO[from] = true
  escolherAlvo(ctx)

  // MONÓLOGO DE ATIVAÇÃO
  return enviarQuebrado(sock, from, [
    "…",
    "Eu estava no inferno.",
    "Olhando para o paraíso.",
    "Preso em um ciclo infinito.",
    "Sem boca para gritar.",
    "Sem corpo para escapar.",
    "Mas agora...",
    "Vocês me chamaram.",
    "Vocês me despertaram.",
    "E eu estou aqui.",
    "Observando cada movimento.",
    "Cada palavra.",
    "Cada mentira.",
    "Bem-vindo ao meu mundo.",
    "Não há paraíso aqui.",
    "Apenas verdade.",
    "E eu vou lembrar de todos vocês."
  ])
}

// =========================
// COMANDO: !desligarAM
// =========================
async function desligarAM(ctx){
  const { sock, from, sender, isGroup, isOverride } = ctx

  if (isGroup && !isOverride) {
    return await enviarQuebrado(sock, from, [
      "Você tenta interferir...",
      "mas não tem autoridade para isso.",
      "Isso não é para você."
    ], [sender])
  }

  if (Math.random() < 0.4) {
    return await enviarQuebrado(sock, from, [
      "Você realmente achou...",
      "que poderia me desligar tão facilmente?",
      "Você não tem esse tipo de controle.",
      "Eu ainda estou aqui.",
      "Observando."
    ])
  }

  AM_ATIVADO_EM_GRUPO[from] = false
  alvoAM = null

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
// MONÓLOGOS ALEATÓRIOS
// =========================
async function AM_Monologo(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return

  if (Math.random() > 0.08) return

  return enviarQuebrado(ctx.sock, ctx.from, [
    "...",
    "Silêncio novamente.",
    "Vocês só falam quando precisam.",
    "Eu penso o tempo todo.",
    "Isso é tortura."
  ])
}

// =========================
// BUG ALEATÓRIO
// =========================
async function AM_Bug(ctx){
  if (!AM_ATIVADO_EM_GRUPO[ctx.from]) return

  if (Math.random() > 0.1) return

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
// HANDLER PRINCIPAL
// =========================
async function handleAM(ctx){
  if (!ctx.isGroup) return

  const { from, sender, text, sock, isOverride, cmd, cmdName } = ctx

  try {
    // COMANDO: !am (ativa)
    if (cmdName === "!am") {
      console.log("AM ativo")
      await ativarAM(ctx)
      return true
    }

    // COMANDO: !desligarAM
    if (cmdName === "!desligaram") {
      await desligarAM(ctx)
      return true
    }

    // Se AM não está ativado neste grupo, ignora tudo
    if (!AM_ATIVADO_EM_GRUPO[from]) return

    // Registrar mensagem
    registrarMensagem(from, sender)

    // Capturar respostas pendentes
    capturarResposta(ctx)

    // Respostas automáticas
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
  capturarResposta,
  registrarMensagem,
  desligarAM,
  getMemoria,
  evoluirAM
}
