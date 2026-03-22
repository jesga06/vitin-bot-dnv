function isAdmin(user, group) {
  const admins = ['5511999999999@s.whatsapp.net', '5511888888888@s.whatsapp.net']; // insira seus admins
  return admins.includes(user);
}

module.exports = { isAdmin };
