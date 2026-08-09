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
  'Bancos Homologados': 'banco',
  'Fornecedor/Comprador': 'fornecedor'
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

    // Fornecedores/Compradores vão para a tabela própria (fornecedores)
    if (tipo === 'fornecedor') {
      await pool.query(
        'INSERT INTO fornecedores (nome, tipo) VALUES ($1, $2)',
        [nome, 'Fornecedor/Comprador']
      );
      return res.json({ sucesso: true, mensagem: `🎉 ${nome} gravado como Fornecedor/Comprador!` });
    }

    // Demais cadastros rápidos vão para a tabela genérica (cadastros)
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

// GET /api/cadastros/:tipo  -> lista itens de um tipo (útil para edição/listagem)
router.get('/:tipo', exigirLogin, async (req, res) => {
  try {
    const tipo = MAPA_TIPO[req.params.tipo] || req.params.tipo;
    if (tipo === 'fornecedor') {
      const { rows } = await pool.query('SELECT id, nome, tipo FROM fornecedores ORDER BY id DESC');
      return res.json(rows);
    }
    const { rows } = await pool.query('SELECT id, nome, tamanho_ha FROM cadastros WHERE tipo = $1 ORDER BY id DESC', [tipo]);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: e.message });
  }
});

module.exports = router;
