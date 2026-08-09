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
      const ehReceita = evento.includes('venda'); // tudo que contém "venda" = receita; compra/vacinação = despesa
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
    const resultado = { talhoes: [], culturas: [], tiposInsumo: [], categoriasGado: [], fornecedores: [], produtores: [], maquinas: [], ies: [], fazendas: [], bancos: [] };

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
      if (c.tipo === 'categoria_gado') resultado.categoriasGado.push(c.nome);
    });

    res.json(resultado);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: e.message });
  }
});

// GET /api/bi/relatorio-pdf?socio=&dataInicio=&dataFim=&modulo=&ie=&fazenda=
// Retorna os dados filtrados em JSON para o frontend montar o PDF (jsPDF no cliente).
router.get('/relatorio-pdf', exigirLogin, async (req, res) => {
  try {
    const { socio, dataInicio, dataFim, modulo, ie, fazenda } = req.query;
    // Reaproveita o dashboard inteiro e filtra no backend por produtor/data/modulo
    const bi = {
      receitas: 0, despesas: 0, saldosMutuo: {}, sociosConfig: {},
      recentes: [], raioXFrota: [], numParticipantes: 0, socioAnalisado: 'Consolidado Geral'
    };

    const participantes = await pool.query('SELECT * FROM participantes');
    bi.numParticipantes = participantes.rows.length;
    participantes.rows.forEach(p => {
      bi.sociosConfig[p.nome] = {
        nome: p.nome, ie: p.ie, fazenda: p.fazenda || 'Sem Fazenda',
        participacao: parseFloat(p.participacao) || 0
      };
    });

    const fmtQ = (d) => d ? new Date(d).toISOString().split('T')[0] : null;
    const ini = fmtQ(dataInicio);
    const fim = fmtQ(dataFim);

    function dentroFiltro(r) {
      // Filtro por produtor (sócio)
      if (socio && socio !== 'Todos' && r.produtor && !String(r.produtor).toLowerCase().includes(String(socio).toLowerCase())) {
        return false;
      }
      // Filtro por módulo
      if (modulo && modulo !== 'Todos' && r.modulo && !String(r.modulo).toLowerCase().includes(String(modulo).toLowerCase())) {
        return false;
      }
      return true;
    }

    function dentroData(dataReg) {
      if (!ini && !fim) return true;
      if (!dataReg) return true;
      const d = new Date(dataReg).toISOString().split('T')[0];
      if (ini && d < ini) return false;
      if (fim && d > fim) return false;
      return true;
    }

    // Coleta de todos os lançamentos (igual ao dashboard, mas só para relatório)
    const fat = await pool.query('SELECT * FROM entregas_faturamento');
    fat.rows.forEach(r => {
      const v = parseFloat(r.valor_total) || 0;
      const item = { data: fmt(r.data), modulo: 'Fat. Grãos', desc: `Faturamento Contrato ${r.contrato}: ${r.peso_bruto} scs`, valor: v, tipo: 'Receita', produtor: r.produtor, parceiro: r.destino };
      if (dentroData(r.data) && dentroFiltro(item)) { bi.recentes.push(item); bi.receitas += v; }
    });

    const pec = await pool.query('SELECT * FROM reg_pecuaria');
    pec.rows.forEach(r => {
      const v = parseFloat(r.valor_total) || 0;
      const evento = String(r.evento || '').toLowerCase().trim();
      const ehReceita = evento.includes('venda'); // tudo que contém "venda" = receita
      const tipo = ehReceita ? 'Receita' : 'Despesa';
      const acao = ehReceita ? 'Venda' : (evento.includes('compra') ? 'Compra' : 'Vacinação');
      const item = { data: fmt(r.data), modulo: 'Pecuária', desc: `${acao} de ${r.qtd} Cab. de ${r.categoria || 'Gado'}`, valor: v, tipo, produtor: r.produtor, parceiro: r.parceiro };
      if (dentroData(r.data) && dentroFiltro(item)) { bi.recentes.push(item); if (ehReceita) bi.receitas += v; else bi.despesas += v; }
    });

    const lav = await pool.query('SELECT * FROM reg_lavoura');
    lav.rows.forEach(r => {
      const v = parseFloat(r.custo_total) || 0;
      const item = { data: fmt(r.data), modulo: 'Lavoura', desc: `LAVOURA: ${r.atividade} - ${r.insumo || ''}`, valor: v, tipo: 'Despesa', produtor: r.produtor, parceiro: 'Interno' };
      if (dentroData(r.data) && dentroFiltro(item)) { bi.recentes.push(item); bi.despesas += v; }
    });

    const maq = await pool.query('SELECT * FROM reg_financas_maquinas');
    // Mapa para Raio-X de Frota: agrupa por id_maquina/modelo e tipo_custo
    const frotaMap = {};
    maq.rows.forEach(r => {
      const v = parseFloat(r.valor) || 0;
      if (!dentroData(r.data)) return;
      const chave = String(r.id_maquina || r.modelo || 'A CLASSIFICAR').toUpperCase().trim();
      if (!frotaMap[chave]) {
        frotaMap[chave] = { maquina: chave, combustivel: 0, pecas: 0, ipva: 0, outros: 0, total: 0 };
      }
      const tc = String(r.tipo_custo || '').toLowerCase();
      if (tc.includes('combust') || tc.includes('diesel')) frotaMap[chave].combustivel += v;
      else if (tc.includes('peca') || tc.includes('serv') || tc.includes('oficina') || tc.includes('manut')) frotaMap[chave].pecas += v;
      else if (tc.includes('ipva') || tc.includes('taxa') || tc.includes('imposto')) frotaMap[chave].ipva += v;
      else frotaMap[chave].outros += v;
      frotaMap[chave].total += v;

      const item = { data: fmt(r.data), modulo: 'Ativos', desc: `[${r.id_maquina}] ${r.tipo_custo}: ${r.descricao}`, valor: v, tipo: 'Despesa', produtor: r.produtor, parceiro: 'Oficina', categoriaCusto: r.tipo_custo, safra: 'Anual/Geral' };
      if (dentroData(r.data) && dentroFiltro(item)) { bi.recentes.push(item); bi.despesas += v; }
    });

    const fin = await pool.query('SELECT * FROM lan_financiamentos_seguros');
    fin.rows.forEach(r => {
      const v = parseFloat(r.valor) || 0;
      const item = { data: fmt(r.data), modulo: 'Ativos', desc: `${String(r.categoria || '').toUpperCase()} Banco: ${r.banco_credor}`, valor: v, tipo: 'Despesa', produtor: r.produtor, parceiro: r.banco_credor, categoriaCusto: r.categoria, safra: 'Anual/Geral' };
      if (dentroData(r.data) && dentroFiltro(item)) { bi.recentes.push(item); bi.despesas += v; }
    });

    const mutuo = await pool.query('SELECT * FROM reg_mutuo_financeiro');
    mutuo.rows.forEach(r => {
      const v = parseFloat(r.valor) || 0;
      const item = { data: fmt(r.data), modulo: 'Mútuo', desc: 'MÚTUO: Repasse entre sócios', valor: v, tipo: 'Mútuo', produtor: r.socio_credor, parceiro: r.socio_devedor, safra: 'Anual/Geral' };
      if (dentroData(r.data) && dentroFiltro(item)) { bi.recentes.push(item); }
    });

    // Raio-X de Frota: converte o mapa em array ordenado por total decrescente
    bi.raioXFrota = Object.values(frotaMap).sort((a, b) => b.total - a.total);
    bi.custoTotalFrota = bi.raioXFrota.reduce((s, f) => s + f.total, 0);

    // Determina sócio analisado (se filtro socio != Todos, usa o nome; senão Consolidado)
    if (socio && socio !== 'Todos') {
      bi.socioAnalisado = socio;
    } else {
      bi.socioAnalisado = 'Consolidado Geral (Holding)';
    }

    bi.recentes.sort((a, b) => {
      const [da, ma, ya] = a.data.split('/');
      const [db_, mb, yb] = b.data.split('/');
      return new Date(yb, mb - 1, db_) - new Date(ya, ma - 1, da);
    });

    bi.saldo = bi.receitas - bi.despesas;
    bi.filtros = { socio: socio || 'Todos', dataInicio: ini || 'Início', dataFim: fim || 'Fim', modulo: modulo || 'Todos', ie: ie || 'Todas', fazenda: fazenda || 'Todas' };
    bi.geradoEm = new Date().toLocaleString('pt-BR');

    res.json({ sucesso: true, dados: bi });
  } catch (e) {
    console.error(e);
    res.status(500).json({ sucesso: false, message: 'Erro ao gerar relatório: ' + e.message });
  }
});

// DELETE /api/bi/limpar-base  -> zera todas as tabelas operacionais (SÓ ADMIN)
router.delete('/limpar-base', exigirLogin, async (req, res) => {
  // Só Admin pode limpar a base
  if (req.usuario.nivel !== 'Admin') {
    return res.status(403).json({ sucesso: false, mensagem: 'Acesso negado. Apenas Administradores podem limpar a base de dados.' });
  }
  try {
    // Tabelas operacionais (NÃO apaga participantes, usuarios, cadastros, fornecedores, maquinario)
    const tabelasOperacionais = [
      'reg_lavoura', 'reg_pecuaria', 'reg_financas_maquinas',
      'lan_financiamentos_seguros', 'contratos_compra_insumos', 'mov_estoque',
      'contratos_venda_lavoura', 'entregas_faturamento', 'gestao_pessoal',
      'manut_conservacao', 'reg_mutuo_financeiro'
    ];
    for (const t of tabelasOperacionais) {
      await pool.query(`TRUNCATE TABLE ${t} RESTART IDENTITY CASCADE`);
    }
    res.json({ sucesso: true, mensagem: '🗑️ Base de dados limpa com sucesso! Todas as tabelas operacionais foram zeradas.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao limpar base: ' + e.message });
  }
});

module.exports = router;
