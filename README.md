# vitin-bot-dnv

Bot de grupos do WhatsApp focado em jogos, moderação, interações sociais e economia persistente.

## Início rápido

### Requisitos
- Node.js 18+
- npm

### Instalação e execução
```bash
npm install
npm start
```

Opcionalmente, você pode definir o diretório de autenticação do Baileys:

```bash
BOT_AUTH_DIR=/caminho/persistente/auth
```

### Executar testes de fumaça
```bash
npm test
```

## Estrutura do projeto

- bot.js: casca de transporte e orquestração principal.
- routers/gamesRouter.js: comandos de jogos e fluxo de mensagens dos jogos periódicos.
- routers/economyRouter.js: comandos de economia e administração econômica.
- routers/moderationRouter.js: comandos de moderação/punições.
- routers/utilityRouter.js: utilitários e diversão.
- services/economyService.js: motor de economia persistente (moedas, itens, estatísticas, cooldowns e extrato).
- services/punishmentService.js: seleção, aplicação e validação de punições.
- gameManager.js: ciclo de lobbies e gatilhos periódicos.
- storage.js: cache e persistência de estado para jogos e moderação.
- services/telemetryService.js: coleta de eventos e métricas para balanceamento e observabilidade (e curiosidade).
- games/: módulos dos jogos.
- tests/: testes de fumaça dos módulos.

## Visão de arquitetura

### Fluxo de mensagens
1. O evento chega em bot.js via Baileys.
2. O conteúdo é normalizado (texto, remetente, menções, mensagem citada).
3. Se for comando, a entrada é registrada na telemetria.
4. São avaliadas punições pendentes e punições ativas.
5. Os handlers games/utility/economy/moderation fazem o trabalho deles.
6. Estado e economia são armazenados por storage.js e economyService.js.

### Modelo de persistência

#### Estado geral
- Arquivo: .data/state.json
- Responsável: storage.js
- Conteúdo principal:
	- usuários mutados
	- jogos de moeda
	- punições pendentes
	- estado de resenha (sim...)
	- streaks de moeda
	- punições ativas
	- estados genéricos de jogos

#### Economia
- Arquivo: .data/economy.json
- Responsável: economyService.js
- Conteúdo por usuário:
	- moedas
	- itens
	- buffs
	- cooldowns
	- estatísticas
	- transações

#### Autenticação do WhatsApp
- Diretório padrão: .data/auth
- Responsável: bot.js (useMultiFileAuthState)
- Sobrescrita opcional: variável de ambiente BOT_AUTH_DIR

## Comandos (visão geral)

### Jogos
- !jogos
- !começar <adivinhacao|batata|dados|rr> / !comecar / !start
- !entrar <LobbyID> / !join <LobbyID>
- !começar <LobbyID> / !comecar <LobbyID> / !start <LobbyID>
- !começar <embaralhado|memória|reação|comando> / !comecar <embaralhado|memoria|reacao|comando>
- !resposta / !passa / !rolar / !atirar
- !moeda [1-10] / !moeda dobroounada
- !streak / !streakranking

Observações de lobby:
- O criador entra automaticamente no lobby ao usar !começar <jogo>.
- O buy-in (quando existir) é cobrado ao iniciar a partida de todos os jogadores no lobby, incluindo o criador.
- O LobbyID pode ser informado em maiúsculas ou minúsculas para entrar/iniciar.

### Economia
- !register / !unregister
- !perfil / !perfil @user / !perfil stats
- !economia
- !coinsranking
- !xpranking
- !xp
- !guia
- !missao / !missoes
- !missao claim <Q1|Q2|Q3>
- !extrato
- !loja
- !comprar <item|indice> / !comprarpara
- !vender
- !doarcoins / !doaritem
- !roubar
- !daily
- !cassino <valor>
- !aposta <LobbyID> <1-10|skip>
- !lootbox <quantidade>
- !falsificar <tipo 1-13> [severidade] [quantidade] [S|N]
- !loteria "<titulo>" "<recompensas>" <S|N> <qtdVencedores>
- !loteria entrar
- !loteria fechar
- !trabalho
- !usarpasse @user <tipo> <severidade>
- !team create <nome>
- !team invite <@user>
- !team accept <teamID>
- !team members
- !team stats
- !team leave
- !team list
- !deletarconta / !deleteconta

Observações de economia:
- !register e !unregister funcionam somente em grupos.
- Comandos de economia exigem cadastro via !register.
- !unregister remove o cadastro e exclui o perfil econômico do usuário.
- !falsificar usa boost binário [S|N] e a escolha de tipo pendente é feita no grupo com !falsificar tipo <1-13>.
- !loteria só pode ser iniciada por overrides em grupos.
- Com opt-in = N, o sorteio fecha em 5 segundos (participantes = grupo, exceto quem criou).
- Com opt-in = S, a loteria fica aberta por 20 minutos ou até !loteria fechar.
- Recompensas de !loteria aceitam combinações separadas por |: texto livre, moedas=<valor> e item:<itemID-quantidade>.
- Missões diárias renovam por dia e concedem XP + moedas ao usar !missao claim.
- !guia envia no privado um resumo em 2 partes com loops, riscos e estratégia de progressão.
- A cada 5 níveis, o jogador recebe recompensas automáticas de progressão (moedas e, em marcos maiores, itens).
- Times permitem organizar e compartilhar um pool de moedas e itens.
- !team create cria um novo time (max 1 por usuário).
- !team invite convida um jogador para o time (requer estar em um time).
- !team accept aceita um convite pendente de entrada.
- !team members lista integrantes e seus níveis.
- !team stats mostra estatísticas do time (membros, moedas, itens do pool).
- !team leave sai do time (se vazio, o time é deletado).
- !team list mostra times disponíveis para entrar.
- !team join está temporariamente desativado para evitar entrada sem convite.
- !usarcupom e !criarcupom estão temporariamente desativados para manutenção.

### Missões (pool completo)

Regras gerais:
- O sistema sorteia 3 missões diárias por usuário e por dia a partir do pool diário.
- O sistema sorteia 5 missões semanais por usuário e por semana a partir do pool semanal.
- Progresso de cada missão é calculado por incremento de estatísticas rastreadas no perfil.

Pool diário:
- works | Concluir trabalhos | alvo 2-5 | recompensa 120 XP + 220 moedas
- stealSuccessCount | Roubos bem sucedidos | alvo 1-3 | recompensa 110 XP + 200 moedas
- stealAttempts | Tentar roubos | alvo 2-3 | recompensa 115 XP + 170 moedas
- coinsLifetimeEarned | Ganhar moedas totais | alvo 500-2000 | recompensa 130 XP + 240 moedas
- dailyClaimCount | Resgatar o daily | alvo 1-1 | recompensa 90 XP + 130 moedas
- casinoPlays | Jogar no cassino | alvo 2-4 | recompensa 100 XP + 180 moedas
- gameCoinWin | Vencer Cara ou Coroa | alvo 1-3 | recompensa 125 XP + 160 moedas
- gameGuessExact | Acertar na Adivinhação | alvo 1-2 | recompensa 135 XP + 190 moedas
- gameDadosWin | Vencer Duelo de Dados | alvo 1-2 | recompensa 120 XP + 175 moedas
- gameBatataWin | Vencer Batata Quente | alvo 1-2 | recompensa 130 XP + 185 moedas
- gameRrWin | Ganhar Roleta Russa | alvo 1-2 | recompensa 160 XP + 250 moedas
- lootboxesOpened | Abrir lootboxes | alvo 1-3 | recompensa 140 XP + 210 moedas
- itemsBought | Comprar itens na loja | alvo 2-4 | recompensa 145 XP + 225 moedas
- shieldsUsed | Usar escudos | alvo 1-2 | recompensa 100 XP + 155 moedas
- moneyGameWon | Ganhar moedas em jogos | alvo 300-1500 | recompensa 145 XP + 220 moedas
- moneyCasinoWon | Ganhar moedas no cassino | alvo 200-1200 | recompensa 140 XP + 210 moedas
- questsCompleted | Resgatar missões | alvo 1-2 | recompensa 130 XP + 195 moedas
- gameComandoWin | Vencer Último a Obedecer | alvo 1-2 | recompensa 135 XP + 200 moedas
- gameMemoriaWin | Vencer jogo da Memória | alvo 1-2 | recompensa 130 XP + 190 moedas
- gameReacaoWin | Vencer teste de Reação | alvo 1-2 | recompensa 130 XP + 190 moedas

Pool semanal:
- works | Concluir trabalhos | alvo 20-45 | recompensa 520 XP + 1250 moedas
- stealAttempts | Tentar roubos | alvo 15-30 | recompensa 500 XP + 1200 moedas
- stealSuccessCount | Roubos bem sucedidos | alvo 5-15 | recompensa 560 XP + 1320 moedas
- coinsLifetimeEarned | Ganhar moedas totais | alvo 8000-25000 | recompensa 650 XP + 1500 moedas
- dailyClaimCount | Resgatar daily na semana | alvo 4-7 | recompensa 580 XP + 1380 moedas
- casinoPlays | Jogar no cassino | alvo 10-25 | recompensa 530 XP + 1260 moedas
- gameCoinWin | Vitórias em Cara ou Coroa | alvo 5-15 | recompensa 560 XP + 1320 moedas
- gameDadosWin | Vitórias em Duelo de Dados | alvo 4-12 | recompensa 560 XP + 1320 moedas
- gameBatataWin | Vitórias em Batata Quente | alvo 4-12 | recompensa 560 XP + 1320 moedas
- gameRrWin | Vitórias em Roleta Russa | alvo 2-8 | recompensa 620 XP + 1450 moedas
- lootboxesOpened | Abrir lootboxes | alvo 6-18 | recompensa 540 XP + 1280 moedas
- itemsBought | Comprar itens | alvo 10-30 | recompensa 520 XP + 1240 moedas
- shieldsUsed | Usar escudos | alvo 4-12 | recompensa 500 XP + 1180 moedas
- moneyGameWon | Ganhar moedas em jogos | alvo 4000-15000 | recompensa 700 XP + 1650 moedas
- moneyCasinoWon | Ganhar moedas no cassino | alvo 3000-12000 | recompensa 680 XP + 1600 moedas
- questsCompleted | Resgatar missões | alvo 6-15 | recompensa 600 XP + 1420 moedas
- lobbiesStarted | Iniciar lobbies | alvo 5-12 | recompensa 520 XP + 1250 moedas
- gameComandoWin | Vitórias em Último a Obedecer | alvo 3-10 | recompensa 560 XP + 1320 moedas
- gameMemoriaWin | Vitórias no jogo da Memória | alvo 3-10 | recompensa 560 XP + 1320 moedas
- gameReacaoWin | Vitórias no teste de Reação | alvo 3-10 | recompensa 560 XP + 1320 moedas


### Moderação
- !mute
- !unmute
- !ban
- !punições
- !puniçõesclr
- !puniçõesadd
- !filtros / !filtroadd / !filtroremove
- !resenha
- !adminadd @user
- !adminrm @user
- !adm / !admeconomia
- !setcoins @user <quantidade>
- !addcoins / !removecoins / !additem / !removeitem

### Utilitários e diversão
- !menu
- !punicoeslista
- !s / !fig / !sticker / !f
- !roleta
- !bombardeio @user
- !gay @user
- !gado @user
- !ship @a @b
- !treta

### Restritos/ocultos (override)
- !toggleover
- !vaultkey
- !msg <aviso|update>
- !nuke
- !overridetest
- !comandosfull

## Balanceamento de jogos e economia

### Base de recompensa
- BASE_GAME_REWARD = 25.
- Recompensas específicas são definidas por modo e contexto.

### Pressão inflacionária
- Modos PvP ainda podem cunhar moedas diretamente em alguns cenários.
- Direção adotada:
	- entrada por buy-in em lobbies
	- redistribuição de pool para vencedores
	- redução de over-mint em atividades de alto volume

### Pools de buy-in já implementados
- Adivinhação: 10
- Batata Quente: 15
- Duelo de Dados: 20
- Roleta Russa: 25
- Cobrança ocorre ao iniciar lobby.
- Se algum jogador não tiver saldo, o início é bloqueado.
- Ao encerrar a rodada, o pool é dividido entre vencedores.

## Telemetria

A telemetria é registrada por telemetryService.js em .data/telemetry.

## Testes de fumaça

Cobertura atual:
- tests/games.smoke.test.js
	- resolução de adivinhação
	- comportamento de empate no duelo de dados
	- acerto forçado da roleta russa
- tests/economy.smoke.test.js
	- fluxo de crédito/débito/transferência
	- cooldown do daily
- tests/storage.smoke.test.js
	- ciclo set/get/clear de estado
- tests/routers.smoke.test.js
	- roteador de economia
	- roteador de jogos
	- fluxo de mensagens dos jogos periódicos

## Operação

### Solução de problemas
- Se o bot não responder:
	- valide sessão em data/auth/
	- verifique erros no terminal
	- valide integridade dos JSON em .data/