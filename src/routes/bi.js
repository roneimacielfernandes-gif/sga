const express = require('express');
const pool = require('../db');
const { exigirLogin } = require('../middleware/auth');

const router = express.Router();

function fmt(d) {
  if (!d) return null;
  return new Date(d).toISOString().split('T')[0].split('-').reverse().join('/');
}

// GET /api/bi/dashboard -> equivalente a obterDadosBIReais()
router.get('/dashboard', exigirLogin, async (req, res) => {
  try {
    const bi = {
      receitas: 0, despesas: 0, saldosMutuo: {}, sociosConfig: {},
      fluxoMensalReceitas: Array(12).fill(0), fluxoMensalDespesas: Array(12).fill(0),
      recentes: [], financasSaldos: { pago: 0, pendente: 0 }, financasCronograma: []
    };

    // Sócios/participantes
    const participantes = await pool.query('SELECT * FROM participantes');
    participantes.rows.forEach(p => {
      bi.sociosConfig[p.nome] = {
        nome: p.nome, ie: p.ie, quota: parseFloat(p.participacao) || 0,
        fazenda: p.fazenda || 'Sem Fazenda'
      };
      bi.saldosMutuo[p.nome] = 0;
    });

    // Faturamento (receita)
    const fat = await pool.query('SELECT * FROM entregas_faturamento');
    fat.rows.forEach(r => {
      const v = parseFloat(r.valor_total) || 0;
      bi.receitas += v;
      const mes = new Date(r.data).getMonth();
      bi.fluxoMensalReceitas[mes] += v;
      bi.recentes.push({
        data: fmt(r.data), modulo: 'Fat. Grãos',
        desc: `Faturamento Contrato ${r.contrato}: ${r.peso_bruto} scs`,
        valor: v, tipo: 'Receita', produtor: r.produtor, parceiro: r.destino, safra: 'Soja 25/26'
      });
    });

    // Pecuária — Compra/Vacinação = DESPESA, Venda = RECEITA (correção do bug)
    const pec = await pool.query('SELECT * FROM reg_pecuaria');
    pec.rows.forEach(r => {
      const v = parseFloat(r.valor_total) || 0;
      const evento = String(r.evento || '').toLowerCase().trim();
      const ehReceita = evento === 'venda'; // só Venda é receita; Compra/Vacinação = despesa
      const mes = new Date(r.data).getMonth();
      const tipo = ehReceita ? 'Receita' : 'Despesa';
      if (ehReceita) {
        bi.receitas += v;
        bi.fluxoMensalReceitas[mes] += v;
      } else {
        bi.despesas += v;
        bi.fluxoMensalDespesas[mes] += v;
      }
      const acao = ehReceita ? 'Venda' : (evento === 'compra' ? 'Compra' : 'Vacinação');
      bi.recentes.push({
        data: fmt(r.data), modulo: 'Pecuária',
        desc: `${acao} de ${r.qtd} Cab. de ${r.categoria || 'Gado'}`,
        valor: v, tipo, produtor: r.produtor, parceiro: r.parceiro, safra: 'Giro Pecuária'
      });
    });

    // Lavoura (despesa)
    const lav = await pool.query('SELECT * FROM reg_lavoura');
    lav.rows.forEach(r => {
      const v = parseFloat(r.custo_total) || 0;
      bi.despesas += v;
      const mes = new Date(r.data).getMonth();
      bi.fluxoMensalDespesas[mes] += v;
      bi.recentes.push({
        data: fmt(r.data), modulo: 'Lavoura',
        desc: `LAVOURA: ${r.atividade} - ${r.insumo || ''}`,
        valor: v, tipo: 'Despesa', produtor: r.produtor, safra: r.safra, parceiro: 'Interno'
      });
    });

    // Ativos / máquinas (despesa)
    const maq = await pool.query('SELECT * FROM reg_financas_maquinas');
    maq.rows.forEach(r => {
      const v = parseFloat(r.valor) || 0;
      bi.despesas += v;
      const mes = new Date(r.data).getMonth();
      bi.fluxoMensalDespesas[mes] += v;
      bi.recentes.push({
        data: fmt(r.data), modulo: 'Ativos',
        desc: `[${r.id_maquina}] ${r.tipo_custo}: ${r.descricao}`,
        valor: v, tipo: 'Despesa', produtor: r.produtor, idAtivo: r.id_maquina,
        categoriaCusto: r.tipo_custo, safra: 'Anual/Geral', parceiro: 'Oficina'
      });
    });

    // Financiamentos e seguros (despesa + cronograma)
    const fin = await pool.query('SELECT * FROM lan_financiamentos_seguros');
    fin.rows.forEach(r => {
      const v = parseFloat(r.valor) || 0;
      bi.despesas += v;
      const pago = String(r.status || '').toLowerCase().includes('pago');
      if (pago) bi.financasSaldos.pago += v; else bi.financasSaldos.pendente += v;
      bi.financasCronograma.push({
        vencimento: fmt(r.vencimento), categoria: r.categoria, banco: r.banco_credor,
        valor: v, status: r.status
      });
      bi.recentes.push({
        data: fmt(r.data), modulo: 'Ativos',
        desc: `${String(r.categoria || '').toUpperCase()} Banco: ${r.banco_credor}`,
        valor: v, tipo: 'Despesa', produtor: r.produtor, categoriaCusto: r.categoria,
        safra: 'Anual/Geral', parceiro: r.banco_credor
      });
    });

    // Mútuo entre sócios
    const mutuo = await pool.query('SELECT * FROM reg_mutuo_financeiro');
    mutuo.rows.forEach(r => {
      const v = parseFloat(r.valor) || 0;
      if (String(r.status).toLowerCase() === 'pendente') {
        if (bi.saldosMutuo[r.socio_credor] !== undefined) bi.saldosMutuo[r.socio_credor] += v;
        if (bi.saldosMutuo[r.socio_devedor] !== undefined) bi.saldosMutuo[r.socio_devedor] -= v;
      }
      bi.recentes.push({
        data: fmt(r.data), modulo: 'Mútuo', desc: 'MÚTUO: Repasse entre sócios',
        valor: v, tipo: 'Mútuo', produtor: r.socio_credor, safra: 'Anual/Geral', parceiro: r.socio_devedor
      });
    });

    bi.recentes.sort((a, b) => {
      const [da, ma, ya] = a.data.split('/');
      const [db_, mb, yb] = b.data.split('/');
      return new Date(yb, mb - 1, db_) - new Date(ya, ma - 1, da);
    });

    res.json(bi);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro no BI: ' + e.message });
  }
});

// GET /api/bi/cadastrais -> equivalente a obterDadosCadastrais()
router.get('/cadastrais', exigirLogin, async (req, res) => {
  try {
    const resultado = { talhoes: [], culturas: [], tiposInsumo: [], fornecedores: [], produtores: [], maquinas: [], ies: [], fazendas: [], bancos: [] };

    const participantes = await pool.query('SELECT * FROM participantes');
    participantes.rows.forEach(p => {
      let texto = `${p.nome} - ${p.documento}`;
      if (p.ie && p.ie !== '0') texto += ` (IE: ${p.ie})`;
      resultado.produtores.push(texto);
      if (p.ie) resultado.ies.push(p.ie);
      if (p.fazenda) resultado.fazendas.push(p.fazenda);
    });

    const maquinas = await pool.query('SELECT id_maquina, modelo FROM maquinario');
    maquinas.rows.forEach(m => resultado.maquinas.push(`${m.id_maquina} - ${m.modelo}`));

    const fornecedores = await pool.query('SELECT * FROM fornecedores');
    fornecedores.rows.forEach(f => resultado.fornecedores.push(`${f.nome} (${f.tipo || ''})`));

    const cadastros = await pool.query('SELECT * FROM cadastros');
    cadastros.rows.forEach(c => {
      if (c.tipo === 'talhao') resultado.talhoes.push(c.nome);
      if (c.tipo === 'cultura') resultado.culturas.push(c.nome);
      if (c.tipo === 'tipo_insumo') resultado.tiposInsumo.push(c.nome);
      if (c.tipo === 'banco') resultado.bancos.push(c.nome);
    });

    res.json(resultado);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: e.message });
  }
});

module.exports = router;
