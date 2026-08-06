const jwt = require('jsonwebtoken');

function exigirLogin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ sucesso: false, mensagem: 'Não autenticado.' });

  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ sucesso: false, mensagem: 'Sessão inválida ou expirada.' });
  }
}

// Restringe uma rota a determinados níveis de acesso (ex: exigirNivel('Admin', 'Socio Master'))
function exigirNivel(...niveisPermitidos) {
  return (req, res, next) => {
    if (!req.usuario || !niveisPermitidos.includes(req.usuario.nivel)) {
      return res.status(403).json({ sucesso: false, mensagem: 'Sem permissão para esta ação.' });
    }
    next();
  };
}

module.exports = { exigirLogin, exigirNivel };
