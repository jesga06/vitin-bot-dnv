// Command Help Database
// Provides detailed help information for all non-hidden commands

const COMMAND_HELP = {
  // ===== ECONOMY COMMANDS =====
  economia: {
    name: "Economia",
    aliases: ["economia"],
    description: "Mostra submenu de economia com comandos de progressão, escambo (trades) e times",
    usage: "!economia [submenu]",
    submenus: ["escambo", "times", "progressao"],
    commonUsage: [
      "!economia - Ver menu completo",
      "!economia escambo - Ver comandos de trade",
      "!economia times - Ver comandos de time",
      "!economia progressao - Ver rotina diária",
    ],
    details: "A economia é o sistema de progressão principal. Você ganha coins, XP e itens para subir de nível.",
  },

  perfil: {
    name: "Perfil",
    aliases: ["perfil"],
    description: "Mostra seu perfil econômico com level, XP, moedas e inventário",
    usage: "!perfil [@user]",
    commonUsage: [
      "!perfil - Ver seu próprio perfil",
      "!perfil @usuario - Ver perfil de outro",
      "!perfil stats - Ver estatísticas de jogos",
    ],
    details: "Seu perfil contém todas as informações de progressão: nível, XP para próximo nível, saldo de moedas, inventário e estatísticas.",
  },

  xp: {
    name: "XP",
    aliases: ["xp"],
    description: "Mostra sua progressão de XP e nível atual",
    usage: "!xp",
    commonUsage: [
      "!xp - Ver nível e XP atual",
    ],
    details: "você precisa de XP para subir de nível. Ganha XP em quase todas as atividades: jogos, trabalho, missões.",
  },

  missao: {
    name: "Missões Diárias",
    aliases: ["missao", "missoes"],
    description: "Mostra missões diárias e permite resgatar recompensas",
    usage: "!missao [claim <Q1|Q2|Q3>]",
    commonUsage: [
      "!missao - Ver missões de hoje",
      "!missao claim Q1 - Resgatar prêmio da Q1",
      "!missao claim Q2 - Resgatar prêmio da Q2",
    ],
    details: "Faça 3 missões diárias (Q1, Q2, Q3). Cada uma dá coins + XP quando completa. Resgate com !missao claim.",
  },

  missaosemanal: {
    name: "Missões Semanais",
    aliases: ["missaosemanal", "missoesemanais"],
    description: "Mostra missões semanais com maiores recompensas",
    usage: "!missaosemanal [claim <W1|W2|W3|W4|W5>]",
    commonUsage: [
      "!missaosemanal - Ver missões da semana",
      "!missaosemanal claim W1 - Resgatar W1",
    ],
    details: "5 missões semanais com recompensas maiores que as diárias. Resete a cada segunda.",
  },

  guia: {
    name: "Guia de Economia",
    aliases: ["guia"],
    description: "Envia um guia completo de como progredir na economia (em DM)",
    usage: "!guia",
    commonUsage: [
      "!guia - Recebe guia em 2 partes no privado",
    ],
    details: "Aprenda a rotina básica: daily + trabalho + missões. Inclui rotas de risco e dicas práticas.",
  },

  daily: {
    name: "Recompensa Diária",
    aliases: ["daily"],
    description: "Resgata recompensa diária de coins e XP",
    usage: "!daily",
    commonUsage: [
      "!daily - Resgate seu bônus diário",
    ],
    details: "uma vez por dia você pode resgatar coins + XP automático. Reseta à meia-noite.",
  },

  trabalho: {
    name: "Trabalho",
    aliases: ["trabalho"],
    description: "Trabalha para ganhar coins (ifood, capinar ou lavagem)",
    usage: "!trabalho <ifood|capinar|lavagem>",
    commonUsage: [
      "!trabalho ifood - Fazer delivery (risco baixo, ganho 55-145)",
      "!trabalho capinar - Capinar (risco médio, ganho 110)",
      "!trabalho lavagem - Lavar dinheiro (risco alto, perde até 1500)",
    ],
    details: "Cada trabalho tem risco e recompensa diferentes. Cooldown de 90 minutos. Ganhos escalam com seu nível.",
  },

  extrato: {
    name: "Extrato",
    aliases: ["extrato"],
    description: "Mostra histórico de transações de coins",
    usage: "!extrato [@user]",
    commonUsage: [
      "!extrato - Ver seu próprio histórico",
      "!extrato @usuario - Ver histórico de outro",
    ],
    details: "Veja quando ganhou/perdeu coins e o motivo. Útil para rastrear sua economia.",
  },

  coinsranking: {
    name: "Ranking de coins",
    aliases: ["coinsranking"],
    description: "Mostra top 10 com mais moedas",
    usage: "!coinsranking",
    commonUsage: [
      "!coinsranking - Ver ranking global",
    ],
    details: "Veja quem é mais rico no bot. Útil para acompanhar a concorrência.",
  },

  xpranking: {
    name: "Ranking de XP",
    aliases: ["xpranking"],
    description: "Mostra top 10 com maiores níveis de XP",
    usage: "!xpranking",
    commonUsage: [
      "!xpranking - Ver ranking global",
    ],
    details: "Veja quem tem maior nível. Indicador de atividade e dedicação.",
  },

  cassino: {
    name: "Cassino",
    aliases: ["cassino"],
    description: "Joga na máquina caça-níqueis (chance de ganhar ou perder coins)",
    usage: "!cassino <quantidade>",
    commonUsage: [
      "!cassino 100 - Apostar 100 coins",
    ],
    details: "Jogo de azar. Pode multiplicar sua aposta ou perder tudo. Alto risco, alto retorno.",
  },

  loja: {
    name: "Loja",
    aliases: ["loja"],
    description: "Mostra itens disponíveis para compra",
    usage: "!loja",
    commonUsage: [
      "!loja - Ver catálogo completo",
      "!comprar escudo 1 - Comprar 1 escudo",
    ],
    details: "Itens têm vários usos: passes de punição, buff de XP, etc. Use !comprar para adquirir.",
  },

  comprar: {
    name: "Comprar",
    aliases: ["comprar"],
    description: "Compra um item da loja para você ou para outro",
    usage: "!comprar <item|indice> [quantidade]",
    commonUsage: [
      "!comprar escudo - Comprar 1 escudo",
      "!comprar 1 3 - Comprar item índice 1, quantidade 3",
      "!comprarpara @user escudo - Comprar para outro usuário",
    ],
    details: "Use nomes de itens ou índices da loja. Coins são debitados da sua conta.",
  },

  vender: {
    name: "Vender",
    aliases: ["vender"],
    description: "Vende um item do seu inventário",
    usage: "!vender <item> [quantidade]",
    commonUsage: [
      "!vender escudo - Vender 1 escudo",
      "!vender escudo 2 - Vender 2 escudos",
    ],
    details: "Você recebe 50% do preço original. Espaço no inventário vale a pena em alguns casos.",
  },

  doarcoins: {
    name: "Doar Coins",
    aliases: ["doarcoins"],
    description: "Transfere coins para outro usuário",
    usage: "!doarcoins @user [quantidade]",
    commonUsage: [
      "!doarcoins @amigo 100 - Dar 100 coins",
      "!doarcoins @amigo - Dar quantidade padrão",
    ],
    details: "Ajude seus amigos! Sem limite de quantidade ou frequência.",
  },

  doaritem: {
    name: "Doar Item",
    aliases: ["doaritem"],
    description: "Transfere um item para outro usuário",
    usage: "!doaritem @user <item> [quantidade]",
    commonUsage: [
      "!doaritem @amigo escudo 1 - Dar 1 escudo",
    ],
    details: "Compartilhe itens com suas equipes e amigos.",
  },

  roubar: {
    name: "Roubar",
    aliases: ["roubar"],
    description: "Tenta roubar coins de outro usuário (com risco)",
    usage: "!roubar @user",
    commonUsage: [
      "!roubar @usuario - Tentar roubar dele",
    ],
    details: "Roubo bem-sucedido: você pega 20-30% dos coins dele. Falha: você perde coins. Alto risco!",
  },

  lootbox: {
    name: "Lootbox",
    aliases: ["lootbox"],
    description: "Abre caixas para ganhar items aleatórios",
    usage: "!lootbox <quantidade 1-10>",
    commonUsage: [
      "!lootbox 1 - Abrir 1 caixa",
      "!lootbox 5 - Abrir 5 caixas",
    ],
    details: "Cada caixa custa coins. Você ganha items aleatórios. Pode sair muito bom ou ruim.",
  },

  falsificar: {
    name: "Falsificar",
    aliases: ["falsificar"],
    description: "Transforma passes de punição (tipo, severidade ou quantidade)",
    usage: "!falsificar <tipo 1-13> [severidade] [quantidade] [S|N]",
    commonUsage: [
      "!falsificar 1 - Começar conversão de tipo 1",
      "!falsificar tipo 5 - Escolher novo tipo durante conversão",
    ],
    details: "Sistema complexo de conversão de passes. Você subsorna o cartório clandestino.",
  },

  trade: {
    name: "Trade (Escambo)",
    aliases: ["trade", "troca"],
    description: "Sistema de troca de coins e itens com outro usuário",
    usage: "!trade @user <coins> [item:quantidade...]",
    commonUsage: [
      "!trade @user 100 - Oferecer 100 coins e nada de itens",
      "!trade @user 0 escudo:2 - Oferecer 2 escudos",
      "!trade review <id> - Ver detalhes antes de aceitar",
      "!trade accept <id> - Aceitar um trade",
    ],
    details: "Sistema seguro de trocas com review e timeout. Há taxa de fee por bracket de valor.",
  },

  time: {
    name: "Sistema de Times",
    aliases: ["time", "team"],
    description: "Cria e gerencia times com seus amigos",
    usage: "!time <ação> [args]",
    commonUsage: [
      "!time create nome - Criar um time",
      "!time accept <id> - Entrar em um time",
      "!time info - Ver info do seu time",
      "!time members - Listar membros",
      "!time depositarcoins 50 - Adicionar coins ao pool",
    ],
    details: "Times organizam colaboração econômica e gerenciamento de pool de recursos.",
  },

  mentions: {
    name: "Preferência de Menção",
    aliases: ["mentions"],
    description: "Controla se você aparece mencionado em rankings/listas",
    usage: "!mentions [on|off]",
    commonUsage: [
      "!mentions - Ver status atual",
      "!mentions on - Ser mencionado",
      "!mentions off - Não ser mencionado no bot",
    ],
    details: "Se desativar menções, defina um apelido com !apelido para aparecer nos rankings.",
  },

  apelido: {
    name: "Apelido Público",
    aliases: ["apelido"],
    description: "Define como você aparece no bot (nomes alternativos)",
    usage: "!apelido [novo_nome]",
    commonUsage: [
      "!apelido - Ver apelido atual",
      "!apelido MeuNome - Definir novo apelido",
    ],
    details: "Até 32 caracteres. Necessário se desativar menções no !mentions.",
  },

  cupom: {
    name: "Cupons de Coins",
    aliases: ["cupom"],
    description: "[Admin] Cria cupons de coins para os usuários resgatarem",
    usage: "!cupom criar <codigo> <moedas>",
    commonUsage: [
      "!cupom crear PROMOCAO100 100 - Criar cupom PROMOCAO100 com 100 coins",
    ],
    details: "Cada usuário resgate cada cupom uma vez. Admin only.",
  },

  loteria: {
    name: "Loteria",
    aliases: ["loteria"],
    description: "[Admin] Inicia sorteios com prêmios em coins ou itens",
    usage: "!loteria \"<titulo>\" \"<recompensas>\" <S|N> <qtd_vencedores>",
    commonUsage: [
      "!loteria \"Sextou\" \"moedas=500|escudo-2\" S 2 - Loteria com opt-in, 2 vencedores",
    ],
    details: "Opt-in (S) = usuários entram. Opt-out (N) = automático. Admin only.",
  },

  register: {
    name: "Registrar",
    aliases: ["register"],
    description: "Registra você no sistema de economia (obrigatório para usar economia em DM)",
    usage: "!register",
    commonUsage: [
      "!register - Se registrar",
    ],
    details: "necessário para acessar qualquer comando de economia no privado. Use em grupo.",
  },

  unregister: {
    name: "Desregistrar",
    aliases: ["unregister"],
    description: "Remove seu registro e impede economia no privado",
    usage: "!unregister",
    commonUsage: [
      "!unregister - Desregistrar",
    ],
    details: "Sua conta é então bloqueada para economia no privado.",
  },

  deletarconta: {
    name: "Deletar Conta",
    aliases: ["deletarconta", "deleteconta"],
    description: "Remove seu perfil econômico permanentemente",
    usage: "!deletarconta [confirmar|cancelar]",
    commonUsage: [
      "!deletarconta - Ver instruções",
      "!deletarconta confirmar - Iniciar processo",
    ],
    details: "Requer confirmação. Você perde tudo. Irreversível.",
  },

  // ===== GAME COMMANDS =====
  jogos: {
    name: "Jogos",
    aliases: ["jogos"],
    description: "Mostra menu de jogos e comandos",
    usage: "!jogos [stats]",
    commonUsage: [
      "!jogos - Ver lista de jogos",
      "!jogos stats - Ver estatísticas de jogos",
    ],
    details: "Vários jogos competitivos com apostas de coins e recompensas de XP.",
  },

  brincadeiras: {
    name: "Brincadeiras",
    aliases: ["brincadeiras"],
    description: "Mostra menu de mini-comandos divertidos",
    usage: "!brincadeiras",
    commonUsage: [
      "!brincadeiras - Ver opções",
    ],
    details: "Comandos leves como roleta, bombardeio, gay, gado, ship, treta.",
  },

  começar: {
    name: "Começar Jogo",
    aliases: ["começar", "comecar", "start"],
    description: "Inicia um jogo de lobby ou rápido",
    usage: "!começar <tipo|LobbyID> [args]",
    commonUsage: [
      "!começar adivinhacao - Criar lobby de adivinhação",
      "!começar LOBBY123 - Iniciar lobby existente",
      "!começar embaralhado - Iniciar jogo rápido",
    ],
    details: "Diferentes sintaxes para jogos de lobby vs. rápidos.",
  },

  entrar: {
    name: "Entrar no Jogo",
    aliases: ["entrar", "join"],
    description: "Entra em um lobby de jogo",
    usage: "!entrar <LobbyID>",
    commonUsage: [
      "!entrar LOBBY123 - Entrar no lobby",
    ],
    details: "Use !lobbies para ver lobbies abertos.",
  },

  lobbies: {
    name: "Lobbies Abertos",
    aliases: ["lobbies"],
    description: "Mostra lobbies abertos neste grupo",
    usage: "!lobbies",
    commonUsage: [
      "!lobbies - Ver todos os lobbies",
    ],
    details: "Veja quais jogos estão abertos para entrar.",
  },

  // ===== MODERATION COMMANDS =====
  mute: {
    name: "Mutar",
    aliases: ["mute"],
    description: "[Admin] Muta um usuário (impede mensagens)",
    usage: "!mute @user",
    commonUsage: [
      "!mute @usuario - Mutar",
    ],
    details: "Admin only. Usuário pode ser desmutado com !unmute.",
  },

  unmute: {
    name: "Desmutar",
    aliases: ["unmute"],
    description: "[Admin] Desmuta um usuário",
    usage: "!unmute @user",
    commonUsage: [
      "!unmute @usuario - Desmutar",
    ],
    details: "Admin only.",
  },

  ban: {
    name: "Banir",
    aliases: ["ban"],
    description: "[Admin] Remove um usuário do grupo",
    usage: "!ban @user",
    commonUsage: [
      "!ban @usuario - Banir do grupo",
    ],
    details: "Admin only. Remociona é permanente até adicionar novamente.",
  },

  block: {
    name: "Bloquear",
    aliases: ["block"],
    description: "[Admin] Bloqueia um usuário globalmente (impede uso de comandos)",
    usage: "!block @user",
    commonUsage: [
      "!block @usuario - Bloquear globalmente",
    ],
    details: "Admin only. Usuário não pode usar nenhum comando do bot.",
  },

  unblock: {
    name: "Desbloquear",
    aliases: ["unblock"],
    description: "[Admin] Desbloqueia um usuário",
    usage: "!unblock @user",
    commonUsage: [
      "!unblock @usuario - Desbloquear",
    ],
    details: "Admin only.",
  },

  punicoes: {
    name: "Punições Ativas",
    aliases: ["punicoes", "punições"],
    description: "[Admin] Mostra punições ativas de um usuário",
    usage: "!punicoes @user",
    commonUsage: [
      "!punicoes @usuario - Ver punições",
    ],
    details: "Admin only. Mostra todas as restrições aplicadas.",
  },

  punicoesadd: {
    name: "Aplicar Punição",
    aliases: ["punicoesadd", "puniçõesadd"],
    description: "[Admin] Aplica uma punição a um usuário",
    usage: "!punicoesadd [@user] <1-13> [severidade]",
    commonUsage: [
      "!punicoesadd @usuario 1 - Aplicar punição tipo 1, severidade 1",
      "!punicoesadd @usuario 5 3 - Punição tipo 5, severidade 3",
    ],
    details: "Admin only. Tipos 1-13 são diferentes restrições.",
  },

  punicoesclr: {
    name: "Limpar Punições",
    aliases: ["punicoesclr", "puniçõesclr"],
    description: "[Admin] Remove todas as punições de um usuário",
    usage: "!punicoesclr @user",
    commonUsage: [
      "!punicoesclr @usuario - Remover todas as punições",
    ],
    details: "Admin only.",
  },

  filtros: {
    name: "Filtros",
    aliases: ["filtros"],
    description: "[Admin] Mostra filtros de palavras ativos",
    usage: "!filtros",
    commonUsage: [
      "!filtros - Ver filtros",
    ],
    details: "Admin only.",
  },

  filtroadd: {
    name: "Adicionar Filtro",
    aliases: ["filtroadd"],
    description: "[Admin] Adiciona um filtro de palavras",
    usage: "!filtroadd <texto>",
    commonUsage: [
      "!filtroadd palavrao - Filtrar 'palavrao'",
    ],
    details: "Admin only. Mensagens com a palavra são deletadas.",
  },

  filtroremove: {
    name: "Remover Filtro",
    aliases: ["filtroremove"],
    description: "[Admin] Remove um filtro",
    usage: "!filtroremove <indice>",
    commonUsage: [
      "!filtroremove 1 - Remover filtro número 1",
    ],
    details: "Admin only.",
  },

  vote: {
    name: "Votar",
    aliases: ["vote"],
    description: "Inicia votação para mutar/banir um usuário",
    usage: "!vote @user",
    commonUsage: [
      "!vote @usuario - Votar para punir",
    ],
    details: "Quando atinge o limiar, usuário é mutado (90%) ou banido (10%).",
  },

  voteset: {
    name: "Config Votos",
    aliases: ["voteset"],
    description: "[Admin] Define quantos votos são necessários",
    usage: "!voteset <1-50>",
    commonUsage: [
      "!voteset 5 - Necessário 5 votos para executar",
    ],
    details: "Admin only.",
  },

  adm: {
    name: "Menu Admin",
    aliases: ["adm"],
    description: "[Admin] Mostra menu de comandos de moderação",
    usage: "!adm",
    commonUsage: [
      "!adm - Ver opções",
    ],
    details: "Lista todos os comandos de admin disponíveis.",
  },

  // ===== UTILITY COMMANDS =====
  ajuda: {
    name: "Ajuda",
    aliases: ["ajuda", "duvida"],
    description: "Mostra ajuda sobre um comando específico",
    usage: "!ajuda <comando>",
    commonUsage: [
      "!ajuda economia - Saber como funciona economia",
      "!duvida daily - Mesma coisa que !ajuda",
    ],
    details: "Use este comando para saber como usar qualquer comando público. Respostas vêm em DM.",
  },

  ping: {
    name: "Ping",
    aliases: ["ping"],
    description: "Testa a latência do bot",
    usage: "!ping",
    commonUsage: [
      "!ping - Ver tempo de resposta",
    ],
    details: "Retorna em menos que 100ms normalmente.",
  },

  menu: {
    name: "Menu Principal",
    aliases: ["menu"],
    description: "Mostra menu principal do bot com todas as categorias",
    usage: "!menu",
    commonUsage: [
      "!menu - Ver todas as opções disponíveis",
    ],
    details: "Acesso rápido para economia, jogos, brincadeiras e moderation.",
  },

  feedback: {
    name: "Feedback",
    aliases: ["feedback"],
    description: "Envia link para relatar bugs e sugestões (em DM)",
    usage: "!feedback",
    commonUsage: [
      "!feedback - Receber link de feedback",
    ],
    details: "Ajude a melhorar o bot reportando problemas e sugestões.",
  },

  feedbackpriv: {
    name: "Feedback Privado",
    aliases: ["feedbackpriv"],
    description: "Captura sua próxima mensagem como feedback privado",
    usage: "!feedbackpriv",
    commonUsage: [
      "!feedbackpriv - Ativar modo feedback",
    ],
    details: "A próxima mensagem será enviada privadamente aos admins.",
  },

  sticker: {
    name: "Criar Sticker",
    aliases: ["sticker", "s", "fig", "f"],
    description: "Converte imagem ou vídeo para sticker",
    usage: "!sticker [ou !s / !fig / !f] (responder a imagem/vídeo)",
    commonUsage: [
      "!sticker (respondendo imagem) - Converter para sticker",
      "!s (respondendo vídeo) - Criar sticker de vídeo",
      "!fig (respondendo foto) - Atalho para sticker",
    ],
    details: "Use como resposta a uma imagem ou vídeo enviado. Cria um sticker.",
  },

  jid: {
    name: "JID",
    aliases: ["jid"],
    description: "Mostra seu JID (ID do WhatsApp) em DM",
    usage: "!jid",
    commonUsage: [
      "!jid - Ver seu identificador único",
    ],
    details: "Útil para admins verificarem dados técnicos. Apenas em DM.",
  },

  punicoeslista: {
    name: "Lista Completa de Punições",
    aliases: ["punicoeslista", "puniçõeslista"],
    description: "Mostra a lista detalhada de todos os tipos de punição (em DM)",
    usage: "!punicoeslista",
    commonUsage: [
      "!punicoeslista - Receber lista completa",
    ],
    details: "Descrição de cada tipo de punição (1-13) e seus efeitos.",
  },

  roleta: {
    name: "Roleta",
    aliases: ["roleta"],
    description: "Seleciona um membro aleatório com mensagem engraçada",
    usage: "!roleta",
    commonUsage: [
      "!roleta - Escolher vítima aleatória",
    ],
    details: "Escolhe alguém do grupo para humilhar (de brincadeira).",
  },

  bombardeio: {
    name: "Bombardeio",
    aliases: ["bombardeio"],
    description: "Faz uma brincadeira de 'rastreamento de IP' em alguém mencionado",
    usage: "!bombardeio @user [...@user]",
    commonUsage: [
      "!bombardeio @usuario - Prank de rastreamento",
      "!bombardeio @user1 @user2 - Múltiplos usuarios",
    ],
    details: "Brincadeira inofensiva que faz parecer que está rastreando IP.",
  },

  gay: {
    name: "Gay",
    aliases: ["gay"],
    description: "Mostra porcentagem 'gay' aleatória de um usuário",
    usage: "!gay @user",
    commonUsage: [
      "!gay @usuario - Descobrir o 'percentual'",
    ],
    details: "Número completamente aleatório para um membro mencionado.",
  },

  gado: {
    name: "Gado",
    aliases: ["gado"],
    description: "Mostra porcentagem 'gado' aleatória de um usuário",
    usage: "!gado @user",
    commonUsage: [
      "!gado @usuario - Descobrir porcentagem",
    ],
    details: "Porcentagem aleatória e divertida para usuários.",
  },

  ship: {
    name: "Ship",
    aliases: ["ship"],
    description: "Calcula compatibilidade entre dois usuários",
    usage: "!ship @user1 @user2",
    commonUsage: [
      "!ship @person1 @person2 - Verificar compatibilidade",
    ],
    details: "Porcentagem aleatória de compatibilidade para brincadeira.",
  },

  treta: {
    name: "Treta",
    aliases: ["treta"],
    description: "Gera um cenário de briga aleatório com usuários",
    usage: "!treta",
    commonUsage: [
      "!treta - Gerar drama",
    ],
    details: "Cria texto divertido com membros aleatórios em uma situação engraçada.",
  },

  resposta: {
    name: "Resposta",
    aliases: ["resposta"],
    description: "Envia resposta para o jogo adivinhação",
    usage: "!resposta <sua_resposta>",
    commonUsage: [
      "!resposta gato - Responder o enigma",
    ],
    details: "Comando usado durante o jogo de adivinhação em lobby.",
  },

  passa: {
    name: "Passa",
    aliases: ["passa"],
    description: "Passa a batata quente para outro jogador",
    usage: "!passa @user",
    commonUsage: [
      "!passa @proximo - Passar o jogo",
    ],
    details: "Defesa no jogo batata quente. Passa a vez para outro.",
  },

  rolar: {
    name: "Rolar",
    aliases: ["rolar"],
    description: "Rola dados no jogo dueloDados",
    usage: "!rolar",
    commonUsage: [
      "!rolar - Rolar dados",
    ],
    details: "Ação de jogo para duelo de dados em lobby.",
  },

  atirar: {
    name: "Atirar",
    aliases: ["atirar"],
    description: "Atira no jogo roletaRussa",
    usage: "!atirar",
    commonUsage: [
      "!atirar - Disparar revólver",
    ],
    details: "Ação para jogar roleta russa. Risco de morte!",
  },

  embaralhado: {
    name: "Embaralhado",
    aliases: ["embaralhado"],
    description: "Jogo de palavras embaralhadas",
    usage: "!embaralhado",
    commonUsage: [
      "!embaralhado - Iniciar jogo rápido",
    ],
    details: "Descifre palavras embaralhadas em tempo real.",
  },

  usaritem: {
    name: "Usar Item",
    aliases: ["usaritem"],
    description: "Usa um item do seu inventário",
    usage: "!usaritem <item>",
    commonUsage: [
      "!usaritem boosterxp - Usar o booster de xp",
    ],
    details: "Itens consumíveis têm efeitos imediatos.",
  },

  comprarpara: {
    name: "Comprar Para",
    aliases: ["comprarpara"],
    description: "Compra um item da loja para presentear a outro",
    usage: "!comprarpara @user <item> [quantidade]",
    commonUsage: [
      "!comprarpara @amigo escudo 1 - Presentear 1 escudo",
    ],
    details: "Coins debitados de você. Presente entregue direto no inventário.",
  },

  cestabásica: {
    name: "Cesta Básica",
    aliases: ["cestabásica", "cestabásika"],
    description: "Reclama cesta básica de coins quando balance está baixo",
    usage: "!cestabásica",
    commonUsage: [
      "!cestabásica - Receber coins de emergência",
    ],
    details: "Disponível apenas com balance muito baixo. Uma vez por semana.",
  },

  admeconomia: {
    name: "Admin Economia",
    aliases: ["admeconomia"],
    description: "[Admin] Menu de controle econômico",
    usage: "!admeconomia",
    commonUsage: [
      "!admeconomia - Ver opções",
    ],
    details: "Modificar coins, itens e dados econômicos de usuários.",
  },

  setcoins: {
    name: "Set Coins",
    aliases: ["setcoins"],
    description: "[Admin] Define o balance de coins de um usuário",
    usage: "!setcoins @user <quantidade>",
    commonUsage: [
      "!setcoins @usuario 1000 - Definir 1000 coins",
    ],
    details: "Admin only. Sobrescreve o balance atual com novo valor.",
  },

  addcoins: {
    name: "Adicionar Coins",
    aliases: ["addcoins"],
    description: "[Admin] Adiciona coins a um usuário",
    usage: "!addcoins @user <quantidade>",
    commonUsage: [
      "!addcoins @usuario 500 - Dar 500 coins",
    ],
    details: "Admin only. Soma ao balance existente.",
  },

  removecoins: {
    name: "Remover Coins",
    aliases: ["removecoins"],
    description: "[Admin] Remove coins de um usuário",
    usage: "!removecoins @user <quantidade>",
    commonUsage: [
      "!removecoins @usuario 200 - Tirar 200 coins",
    ],
    details: "Admin only. Diminui do balance atual.",
  },

  additem: {
    name: "Adicionar Item",
    aliases: ["additem"],
    description: "[Admin] Adiciona itens ao inventário de um usuário",
    usage: "!additem @user <item> [quantidade]",
    commonUsage: [
      "!additem @usuario escudo 5 - Dar 5 escudos",
    ],
    details: "Admin only. Adiciona itens diretamente.",
  },

  removeitem: {
    name: "Remover Item",
    aliases: ["removeitem"],
    description: "[Admin] Remove itens do inventário de um usuário",
    usage: "!removeitem @user <item> [quantidade]",
    commonUsage: [
      "!removeitem @usuario escudo 2 - Tirar 2 escudos",
    ],
    details: "Admin only.",
  },

  timeranking: {
    name: "Time Ranking",
    aliases: ["timeranking", "teamranking"],
    description: "Mostra ranking de times mais ricos",
    usage: "!timeranking",
    commonUsage: [
      "!timeranking - Ver top times",
      "!teamranking - Alias",
    ],
    details: "Ranking baseado no total de coins da equipe.",
  },

  usarpasse: {
    name: "Usar Passe",
    aliases: ["usarpasse"],
    description: "Usa um passe de punição em outro usuário",
    usage: "!usarpasse @user <tipo> [severidade]",
    commonUsage: [
      "!usarpasse @usuario 1 - Aplicar punição tipo 1",
      "!usarpasse @usuario 5 3 - Tipo 5, severidade 3",
    ],
    details: "Consome o passe do seu inventário.",
  },

  usarcupom: {
    name: "Usar Cupom",
    aliases: ["usarcupom"],
    description: "Usa um cupom de coins",
    usage: "!usarcupom <codigo>",
    commonUsage: [
      "!usarcupom PROMOCAO100 - Resgatar cupom",
    ],
    details: "Cada cupom ser resgatado uma vez por usuário.",
  },

  criarcupom: {
    name: "Criar Cupom",
    aliases: ["criarcupom"],
    description: "[Admin] Cria um novo cupom de coins",
    usage: "!criarcupom <codigo> <quantidade>",
    commonUsage: [
      "!criarcupom EVENTO50 50 - Criar cupom de 50 coins",
    ],
    details: "Admin only. Código será publicado para resgates.",
  },

  adminadd: {
    name: "Admin Add",
    aliases: ["adminadd"],
    description: "[Admin] Promove um usuário a admin",
    usage: "!adminadd @user",
    commonUsage: [
      "!adminadd @usuario - Promover a admin",
    ],
    details: "[Admin] Requer ser admin. Define admin local do grupo.",
  },

  adminrm: {
    name: "Admin Remove",
    aliases: ["adminrm"],
    description: "[Admin] Remove admin de um usuário",
    usage: "!adminrm @user",
    commonUsage: [
      "!adminrm @usuario - Remover privilégio",
    ],
    details: "[Admin] Requer ser admin.",
  },

  votos: {
    name: "Votos",
    aliases: ["votos"],
    description: "[Admin] Mostra votações ativas e resultados",
    usage: "!votos",
    commonUsage: [
      "!votos - Ver votações atuais",
    ],
    details: "[Admin] Lista todas as votações em andamento.",
  },

  bloqueados: {
    name: "Bloqueados",
    aliases: ["bloqueados"],
    description: "[Admin] Lista usuários bloqueados globalmente",
    usage: "!bloqueados",
    commonUsage: [
      "!bloqueados - Ver bloqueados do bot",
    ],
    details: "[Admin] Usuários nesta lista não podem usar comandos.",
  },

  jidsgrupo: {
    name: "JIDs do Grupo",
    aliases: ["jidsgrupo", "jidmentions"],
    description: "[Admin] Lista todos os JIDs dos membros do grupo",
    usage: "!jidsgrupo",
    commonUsage: [
      "!jidsgrupo - Ver IDs técnicos dos membros",
    ],
    details: "[Admin] Utilitário técnico em DM apenas.",
  },

  resenha: {
    name: "Resenha",
    aliases: ["resenha"],
    description: "[Admin/Override] Alterna modo de punição por grupo",
    usage: "!resenha",
    commonUsage: [
      "!resenha - Ativar ou desativar punições nos jogos deste grupo",
    ],
    details: "Admins e override users podem habilitar/desabilitar o modo resenha (punições) por grupo. Quando ativo, os jogos aplicam punições aos perdedores. Quando inativo, apenas XP e coins são distribuídos.",
  },
};

/**
 * Get help text for a specific command
 * @param {string} commandName - Name of the command (without !)
 * @returns {string|null} - Formatted help text or null if not found
 */
function getCommandHelp(commandName) {
  const normalized = String(commandName || "").toLowerCase().trim();
  if (!normalized) return null;

  // Find by name or alias
  for (const [cmdKey, cmdInfo] of Object.entries(COMMAND_HELP)) {
    if (cmdKey === normalized || (cmdInfo.aliases && cmdInfo.aliases.includes(normalized))) {
      return formatHelpText(cmdInfo);
    }
  }

  return null;
}

/**
 * Format help information into readable text
 * @param {object} cmdInfo - Command information object
 * @returns {string} - Formatted help text
 */
function formatHelpText(cmdInfo) {
  if (!cmdInfo) return "";

  let text = `*${cmdInfo.name}*\n\n`;
  text += `📝 ${cmdInfo.description}\n\n`;
  text += `*Uso:*\n${cmdInfo.usage}\n\n`;

  if (cmdInfo.details) {
    text += `*Detalhes:*\n${cmdInfo.details}\n\n`;
  }

  if (cmdInfo.commonUsage && cmdInfo.commonUsage.length > 0) {
    text += `*Exemplos comuns:*\n`;
    cmdInfo.commonUsage.forEach((example) => {
      text += `• ${example}\n`;
    });
  }

  if (cmdInfo.submenus && cmdInfo.submenus.length > 0) {
    text += `\n*Submenus:*\n`;
    cmdInfo.submenus.forEach((submenu) => {
      text += `• ${submenu}\n`;
    });
  }

  return text;
}

/**
 * Get list of all public command names
 * @returns {array} - Array of command names
 */
function getPublicCommandNames() {
  return Object.keys(COMMAND_HELP).filter((cmd) => {
    const info = COMMAND_HELP[cmd];
    return !cmd.startsWith("_"); // Hide commands starting with _
  });
}

/**
 * Check if a command is documented in help system
 * @param {string} commandName - Command name to check
 * @returns {boolean} - True if command is documented
 */
function isCommandPubliclyHelped(commandName) {
  return getCommandHelp(commandName) !== null;
}

module.exports = {
  COMMAND_HELP,
  getCommandHelp,
  formatHelpText,
  getPublicCommandNames,
  isCommandPubliclyHelped,
};
