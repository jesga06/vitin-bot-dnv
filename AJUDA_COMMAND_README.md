# Comando !ajuda / !duvida - Documentação de Implementação

## Resumo
Adicionado novo comando `!ajuda` e seu alias `!duvida` que permite usuários obter ajuda sobre qualquer comando público do bot.

## Funcionalidades

### Comportamento Básico
- **Sintaxe**: `!ajuda <comando>` ou `!duvida <comando>`
- **Resposta**: Sempre enviada na DM (mensagem privada) do usuário
- **Funcionamento**: Se usado em grupo, bot notifica no grupo que enviou a ajuda no privado

### Exemplos de Uso

```
!ajuda economia    → Mostra como usar o sistema de economia
!duvida daily      → Mostra como funciona o comando !daily
!ajuda time        → Mostra como criar e gerenciar times
!ajuda              → Lista todos os comandos disponíveis para ajuda
```

### Resposta Padrão
A resposta inclui:
- **Nome do comando**
- **Descrição**: O que o comando faz
- **Uso**: Sintaxe correta
- **Detalhes**: Informações importantes
- **Exemplos comuns**: Casos de uso típicos
- **Submenus**: Se aplicável

Exemplo de saída:
```
*Economia*

📝 Mostra submenu de economia com comandos de progressão, escambo (trades) e times

*Uso:*
!economia [submenu]

*Detalhes:*
A economia é o sistema de progressão principal. Você ganha coins, XP e itens para subir de nível.

*Exemplos comuns:*
• !economia - Ver menu completo
• !economia escambo - Ver comandos de trade
• !economia times - Ver comandos de time
• !economia progressao - Ver rotina diária

*Submenus:*
• escambo
• times
• progressao
```

## Comandos Documentados
### Visão geral
- Economia: comandos de perfil, loja, missões, trabalho, cupons e administração financeira
- Jogos: lobbies, jogos rápidos (memória, reação, embaralhado, comando) e jogos de lobby (adivinhação, batata, dados, roleta russa, moeda)
- Moderação: administração, filtros e sistema de punições
- Utilitários: ajuda, menu, feedback e ferramentas administrativas/override

### Novos / Atualizados (últimas mudanças)
- `moeda` — Cara ou Coroa com apostas e modo Dobro ou Nada
- `streak`, `streakranking` — estatísticas e ranking de streaks do Cara ou Coroa
- `memoria`, `reacao`, `comando` — jogos rápidos ativáveis por `!comecar <tipo>`
- `aposta` — configuração de aposta por jogador em lobbies
- `mudarapelido` (override) — ajuste de apelido público via override
- `cooldowns` (override) — listar/resetar cooldowns econômicos
- `comandosfull` — manual completo por seção (oculto/override)
 - `loteria` — atualizado: criação e gerenciamento com opt-in/opt-out; subcomandos `!loteria entrar`, `!loteria fechar` e sorteio manual `!loteria <ID> sortear` (override only)
 - `force` — novo (override): permite executar qualquer comando como outro usuário. Use com cautela; pode alterar saldos e estados.

Para a lista completa e por-seção use `!comandosfull <secao|todos> [detalhes]` (resposta em DM).

## Restrições Implementadas

✅ **NÃO aparece help para:**
- Comandos override-only (!vaultkey, !msg, !wipeeconomia, etc)
- Comandos hidden/administrativos internos
- Qualquer comando não listado em COMMAND_HELP

✅ **Sempre envia resposta em DM:**
- Mesmo se usado em grupo
- Notifica no grupo que enviou no privado

## Arquivos Modificados

### Novos Arquivos
- `commandHelp.js` - Database com todas as informações de ajuda

### Arquivos Alterados
- `bot.js`:
  - Adicionada importação: `const { getCommandHelp, getPublicCommandNames } = require("./commandHelp")`
  - Adicionado handler para `!ajuda` e `!duvida` (linhas ~2207-2275)

## Testes

✅ Todos os testes passam (`npm test`)
✅ Sem erros de sintaxe
✅ Pronto para produção

## Extensão Futura

Para adicionar documentação de novos comandos, edite `commandHelp.js` e adicione uma entrada em `COMMAND_HELP`:

```javascript
nomeDoComando: {
  name: "Nome Amigável",
  aliases: ["alias1", "alias2"],
  description: "Descrição breve",
  usage: "!comando <arg1> [arg2]",
  commonUsage: [
    "!comando exemplo1",
    "!comando exemplo2",
  ],
  details: "Informações detalhadas",
}
```
