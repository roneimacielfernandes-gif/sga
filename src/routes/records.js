const express = require('express');
const pool = require('../db');
const { TABLES } = require('../tableConfig');
const { exigirLogin } = require('../middleware/auth');

const router = express.Router();

function configDe(tabelaFront, res) {
  const cfg = TABLES[tabelaFront];
  if (!cfg) {
    res.status(400).json({ sucesso: false, mensagem: `Tabela desconhecida: ${tabelaFront}` });
    return null;
  }
  return cfg;
}

// GET /api/records/:tabela  -> lista resumida (para o dropdown de "Consultar/Editar")
router.get('/:tabela', exigirLogin, async (req, res) => {
  const cfg = configDe(req.params.tabela, res);
  if (!cfg) return;

  try {
    // Se a tabela tem chave primária própria, ordena por ela; senão por id
    const ordem = cfg.chavePrimaria || 'id';
    const { rows } = await pool.query(
      `SELECT * FROM ${cfg.tabela} ORDER BY ${ordem} DESC LIMIT 500`
    );
    // Monta um "rótulo" legível pra cada linha
    const colunasLabel = Object.values(cfg.campos).slice(0, 3);
    const resultado = rows.map(r => ({
      id: String(r[ordem]),
      label: `📝 ID ${r[ordem]} - ${colunasLabel.map(c => r[c]).filter(Boolean).join(' / ')}`
    }));
    res.json(resultado);
  } catch (e) {
    console.error(e);
    res.status(500).json([]);
  }
});

// GET /api/records/:tabela/:id -> um registro completo, campos já no formato do formulário
router.get('/:tabela/:id', exigirLogin, async (req, res) => {
  const cfg = configDe(req.params.tabela, res);
  if (!cfg) return;

  try {
    const ordem = cfg.chavePrimaria || 'id';
    const { rows } = await pool.query(`SELECT * FROM ${cfg.tabela} WHERE ${ordem} = $1`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ erroSGA: 'Registro não encontrado.' });

    const linha = rows[0];
    const resultado = {};
    for (const [campoFront, coluna] of Object.entries(cfg.campos)) {
      let valor = linha[coluna];
      if (valor instanceof Date) valor = valor.toISOString().split('T')[0];
      resultado[campoFront] = valor;
    }
    res.json(resultado);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erroSGA: e.message });
  }
});

// POST /api/records  { tabela, modoOperacao, idRegistroEdicao, ...campos }
router.post('/', exigirLogin, async (req, res) => {
  const dados = req.body;
  const cfg = configDe(dados.tabela, res);
  if (!cfg) return;

  try {
    const colunas = [];
    const valores = [];
    const placeholders = [];
    let i = 1;

    for (const [campoFront, coluna] of Object.entries(cfg.campos)) {
      if (dados[campoFront] === undefined) continue;
      let valor = dados[campoFront];

      // Campo de porcentagem de participação: aceita "25" ou "0.25" e sempre guarda como fração
      if (coluna === 'participacao') {
        let n = parseFloat(String(valor).replace('%', '')) || 0;
        valor = n > 1 ? n / 100 : n;
      }
      // Campos numéricos vazios viram NULL em vez de erro de tipo
      if (valor === '') valor = null;

      colunas.push(coluna);
      valores.push(valor);
      placeholders.push(`$${i++}`);
    }

    let resultado;
    if (dados.modoOperacao === 'editar' && dados.idRegistroEdicao) {
      const sets = colunas.map((c, idx) => `${c} = $${idx + 1}`).join(', ');
      valores.push(dados.idRegistroEdicao);
      resultado = await pool.query(
        `UPDATE ${cfg.tabela} SET ${sets} WHERE id = $${valores.length} RETURNING id`,
        valores
      );
      if (resultado.rows.length === 0) {
        return res.status(404).json({ sucesso: false, mensagem: 'Erro: ID não localizado.' });
      }
    } else if (cfg.chavePrimaria) {
      // Tabela com chave primária própria (ex: maquinario usa id_maquina TEXT)
      // Faz UPSERT (INSERT ... ON CONFLICT UPDATE) para não duplicar
      const pkCol = cfg.chavePrimaria;
      if (colunas.indexOf(pkCol) === -1) {
        colunas.push(pkCol);
        valores.push('MAQ-' + Date.now());
        placeholders.push(`$${i++}`);
      }
      const updateCols = colunas.filter(c => c !== pkCol);
      const updateSets = updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ');
      resultado = await pool.query(
        `INSERT INTO ${cfg.tabela} (${colunas.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (${pkCol}) DO UPDATE SET ${updateSets} RETURNING ${pkCol} as id`,
        valores
      );
    } else {
      resultado = await pool.query(
        `INSERT INTO ${cfg.tabela} (${colunas.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
        valores
      );
    }

    const id = resultado.rows[0].id;
    res.json({
      sucesso: true,
      mensagem: `🎉 Lançamento ${dados.modoOperacao === 'editar' ? 'atualizado' : 'gravado'} com sucesso! (ID: ${id})`
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ sucesso: false, mensagem: 'Falha ao gravar registro: ' + e.message });
  }
});

module.exports = router;
