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

### Economia (20 comandos)
- economia, perfil, xp, missao, missaosemanal, guia, daily, trabalho, extrato
- coinsranking, xpranking, cassino, loja, comprar, vender, doarcoins, doaritem
- roubar, lootbox, falsificar, trade, time, mentions, apelido, cupom, loteria
- register, unregister, deletarconta

### Jogos (7 comandos)
- jogos, brincadeiras, começar, entrar, lobbies

### Moderação (14 comandos)
- mute, unmute, ban, block, unblock, punicoes, punicoesadd, punicoesclr
- filtros, filtroadd, filtroremove, vote, voteset, adm

### Utilidade (2 comandos)
- ajuda, ping

**Total: ~50 comandos documentados**

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
