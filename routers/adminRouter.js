const { isAdmin } = require('../utils');

function handleAdminCommand(msg, user, group, sendMessage) {
  const command = msg.body.toLowerCase();

  if (command === '!adm') {
    if (!isAdmin(user, group)) {
      return sendMessage('❌ *Acesso negado!* Apenas administradores podem usar este comando.');
    }

    const reply = `
╭━━━〔 🛡️ SUBMENU: ADMIN 〕━━━╮
│ Comandos de administração:
│ - ban [@usuário] - Banir usuário
│ - mute [@usuário] - Mutar usuário
│ - coins [@usuário] - Ver saldo
│ - givecoins [@usuário] [quantia] - Dar coins
│ - limparchat - Limpar mensagens do grupo
╰━━━━━━━━━━━━━━━━━━━━╯
    `;
    sendMessage(reply);
  }
}

module.exports = { handleAdminCommand };
