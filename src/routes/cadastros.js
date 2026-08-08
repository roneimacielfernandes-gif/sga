const express = require('express');
const pool = require('../db');
const { exigirLogin } = require('../middleware/auth');

const router = express.Router();

// Mapeia o texto que aparece no dropdown do formulário para o "tipo" salvo no banco
const MAPA_TIPO = {
  'Talões/Áreas': 'talhao',
  'Culturas Ativas': 'cultura',
  'Categorias Gado': 'categoria_gado',
  'Tipos de Insumo': 'tipo_insumo',
  'Bancos Homologados': 'banco'
};

// POST /api/cadastros  { tipoConfig, nomeConfig, tamanhoConfig }
router.post('/', exigirLogin, async (req, res) => {
  try {
    const tipo = MAPA_TIPO[req.body.tipoConfig];
    const nome = req.body.nomeConfig;
    const tamanho = req.body.tamanhoConfig ? parseFloat(req.body.tamanhoConfig) : null;

    if (!tipo) {
      return res.status(400).json({ sucesso: false, mensagem: 'Tipo de item inválido.' });
    }
    if (!nome) {
      return res.status(400).json({ sucesso: false, mensagem: 'Por favor, digite o Nome/Descrição do item!' });
    }

    await pool.query(
      'INSERT INTO cadastros (tipo, nome, tamanho_ha) VALUES ($1, $2, $3)',
      [tipo, nome, tamanho]
    );

    res.json({ sucesso: true, mensagem: `🎉 ${nome} gravado com sucesso em Cadastros Rápidos!` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao gravar cadastro: ' + e.message });
  }
});

module.exports = router;
