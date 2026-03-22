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
- economyService.js: motor de economia persistente (moedas, itens, estatísticas, cooldowns e extrato).
- punishmentService.js: seleção, aplicação e validação de punições.
- gameManager.js: ciclo de lobbies e gatilhos periódicos.
- storage.js: cache e persistência de estado para jogos e moderação.
- telemetryService.js: coleta de eventos e métricas para balanceamento e observabilidade (e curiosidade).
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
- !moeda / !moeda dobroounada
- !streak / !streakranking

Observações de lobby:
- O criador entra automaticamente no lobby ao usar !começar <jogo>.
- O buy-in (quando existir) é cobrado ao iniciar a partida de todos os jogadores no lobby, incluindo o criador.
- O LobbyID pode ser informado em maiúsculas ou minúsculas para entrar/iniciar.

### Economia
- !perfil / !perfil @user / !perfil stats
- !economia
- !coinsranking
- !extrato
- !loja
- !comprar <item|indice> / !comprarpara
- !vender
- !doarcoins / !doaritem
- !roubar
- !daily
- !cassino / !aposta
- !trabalho
- !usarpasse @user <tipo> <severidade>

### Moderação
- !mute
- !unmute
- !ban
- !punições
- !puniçõesclr
- !puniçõesadd
- !adminadd @user
- !adminrm @user
- !setcoins @user <quantidade>
- !addcoins / !removecoins / !additem / !removeitem

### Utilitários e diversão
- !menu
- !s / !fig / !sticker / !f
- !roleta
- !bombardeio @user
- !gay @user
- !gado @user
- !ship @a @b
- !treta

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