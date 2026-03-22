// Comando !adm e !admeconomia 
async function handleAdminSubmenus(msg, sender, from, sock, prefix) {
  const command = msg.body.toLowerCase();

  if (command === '!adm') {
    const metadata = await sock.groupMetadata(from);
    const participant = metadata.participants.find(p => p.id === sender);
    const isAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';

    if (!isAdmin) {
      await sock.sendMessage(from, { text: "❌ Apenas administradores do grupo podem acessar este menu." });
      return true;
    }

    const reply = `
╭━━━〔 ⚙️ SUBMENU: ADMIN 〕━━━╮
│ Comandos de administração:
│ - !mute @user
│ - !unmute @user
│ - !ban @user
│ - !punições / !punicoes @user
│ - !puniçõesclr / !punicoesclr @user
│ - !puniçõesadd / !punicoesadd @user
│ - !resenha (ativa/desativa punições em jogos)
│ - !adminadd @user (promove admin)
│ - !adminrm @user (remove admin)
╰━━━━━━━━━━━━━━━━━━━━╯
    `;
    await sock.sendMessage(from, { text: reply });
    return true;
  }

  if (command === '!admeconomia') {
    const metadata = await sock.groupMetadata(from);
    const participant = metadata.participants.find(p => p.id === sender);
    const isAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';

    if (!isAdmin) {
      await sock.sendMessage(from, { text: "❌ Apenas administradores do grupo podem acessar este menu." });
      return true;
    }

    const reply = `
╭━━━〔 💰 SUBMENU: ADM ECONOMIA 〕━━━╮
│ Comandos de economia:
│ - !setcoins *@user <quantidade>
│ - !addcoins *@user <quantidade>
│ - !removecoins *@user <quantidade>
│ - !additem *@user <item> <quantidade>
│ - !additem *@user passe <tipo> <severidade> <qtd>
│ - !removeitem *@user <item> <quantidade>
╰━━━━━━━━━━━━━━━━━━━━╯
    `;
    await sock.sendMessage(from, { text: reply });
    return true;
  }
}

module.exports = { handleAdminSubmenus };
