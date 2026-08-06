const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { exigirLogin, exigirNivel } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login  { email, senha }
router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const senha = String(req.body.senha || '');
    if (!email || !senha) {
      return res.status(400).json({ autorizado: false, mensagem: 'E-mail e senha são obrigatórios.' });
    }

    const { rows } = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ autorizado: false, mensagem: 'E-mail ou senha incorretos.' });
    }

    const usuario = rows[0];
    const senhaOk = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaOk) {
      return res.status(401).json({ autorizado: false, mensagem: 'E-mail ou senha incorretos.' });
    }

    const token = jwt.sign(
      { email: usuario.email, nome: usuario.nome, nivel: usuario.nivel },
      process.env.JWT_SECRET,
      { expiresIn: '7d' } // token dura 7 dias, equivalente ao "lembrar acesso" do sistema antigo
    );

    res.json({ autorizado: true, token, email: usuario.email, nome: usuario.nome, nivel: usuario.nivel });
  } catch (e) {
    console.error(e);
    res.status(500).json({ autorizado: false, mensagem: 'Erro no servidor: ' + e.message });
  }
});

// POST /api/auth/usuarios  (criar ou atualizar login) - só Admin pode
router.post('/usuarios', exigirLogin, exigirNivel('Admin'), async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const nome = req.body.nome || '';
    const nivel = req.body.nivel || 'Visitante';
    const senha = req.body.senha || '';
    if (!email || !senha) {
      return res.status(400).json({ sucesso: false, mensagem: 'E-mail e senha são obrigatórios!' });
    }

    const hash = await bcrypt.hash(senha, 10);
    const existente = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);

    if (existente.rows.length > 0) {
      await pool.query(
        'UPDATE usuarios SET nome = $1, nivel = $2, senha_hash = $3 WHERE email = $4',
        [nome, nivel, hash, email]
      );
      return res.json({ sucesso: true, mensagem: `🎉 Acesso de ${nome} atualizado com sucesso!` });
    }

    await pool.query(
      'INSERT INTO usuarios (email, nome, nivel, senha_hash) VALUES ($1, $2, $3, $4)',
      [email, nome, nivel, hash]
    );
    res.json({ sucesso: true, mensagem: '🎉 Novo usuário cadastrado com sucesso!' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao gravar usuário: ' + e.message });
  }
});

module.exports = router;
