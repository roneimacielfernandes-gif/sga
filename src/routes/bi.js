const express = require('express');
const pool = require('../db');
const { exigirLogin } = require('../middleware/auth');

const router = express.Router();

function fmt(d) {
  if (!d) return null;
  return new Date(d).toISOString().split('T')[0].split('-').reverse().join('/');
}

// GET /api/bi/dashboard
router.get('/dashboard', exigirLogin, async (req, res) => {
  try {
    const bi = {
      receitas: 0, despesas: 0, saldosMutuo: {}, sociosConfig: {},
      fluxoMensalReceitas: Array(12).fill(0), fluxoMensalDespesas: Array(12).fill(0),
      recentes: [], financasSaldos: { pago: 0, pendente: 0 }, financasCronograma: []
    };

    const participantes = await pool.query('SELECT * FROM participantes');
    participantes.rows.forEach(p => {
      bi.sociosConfig[p.nome] = {
        nome: p.nome, ie: p.ie, quota: parseFloat(p.participacao) || 0,
        fazenda: p.fazenda || 'Sem Fazenda'
      };
      bi.saldosMutuo[p.nome] = 0;
    });

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

    const pec = await pool.query('SELECT * FROM reg_pecuaria');
    pec.rows.forEach(r => {
      const v = parseFloat(r.valor_total) || 0;
      const evento = String(r.evento || '').toLowerCase().trim();
      const ehReceita = evento.includes('venda');
      const mes = new Date(r.data).getMonth();
      const tipo = ehReceita ? 'Receita' : 'Despesa';
      if (ehReceita) {
        bi.receitas += v;
        bi.fluxoMensalReceitas[mes] += v;
      } else {
        bi.despesas += v;
        bi.fluxoMensalDespesas[mes] += v;
      }
      const acao = ehReceita ? 'Venda' : (evento.includes('compra') ? 'Compra' : 'Vacinação');
      bi.recentes.push({
        data: fmt(r.data), modulo: 'Pecuária',
        desc: `${acao} de ${r.qtd} Cab. de ${r.categoria || 'Gado'}`,
        valor: v, tipo, produtor: r.produtor, parceiro: r.parceiro, safra: 'Giro Pecuária'
      });
    });

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
        data: fmt(r.data), modulo: 'Fin/Seg',
        desc: `${String(r.categoria || '').toUpperCase()} Banco: ${r.banco_credor}`,
        valor: v, tipo: 'Despesa', produtor: r.produtor, categoriaCusto: r.categoria,
        safra: 'Anual/Geral', parceiro: r.banco_credor
      });
    });

    const comp = await pool.query('SELECT * FROM contratos_compra_insumos');
    comp.rows.forEach(r => {
      const v = (parseFloat(r.qtd) || 0) * (parseFloat(r.valor_unitario) || 0);
      bi.despesas += v;
      const mes = r.data ? new Date(r.data).getMonth() : new Date().getMonth();
      bi.fluxoMensalDespesas[mes] += v;
      bi.recentes.push({
        data: fmt(r.data), modulo: 'Compra',
        desc: `Compra: ${r.item || r.tipo_insumo || 'Insumo'} - ${r.qtd} ${r.unidade || ''}`,
        valor: v, tipo: 'Despesa', produtor: r.produtor, parceiro: r.fornecedor, safra: 'Anual/Geral'
      });
    });

    const vend = await pool.query('SELECT * FROM contratos_venda_lavoura');
    vend.rows.forEach(r => {
      const v = (parseFloat(r.volume) || 0) * (parseFloat(r.preco) || 0);
      bi.receitas += v;
      const mes = r.data_pagamento ? new Date(r.data_pagamento).getMonth() : new Date().getMonth();
      bi.fluxoMensalReceitas[mes] += v;
      bi.recentes.push({
        data: fmt(r.data_pagamento || r.data_inicio_entrega), modulo: 'Vendas',
        desc: `Venda Contrato ${r.contrato}: ${r.volume} sc de ${r.cultura || 'Grão'}`,
        valor: v, tipo: 'Receita', produtor: r.produtor, parceiro: r.comprador, safra: r.safra || 'Soja 25/26'
      });
    });

    const pes = await pool.query('SELECT * FROM gestao_pessoal');
    pes.rows.forEach(r => {
      const v = (parseFloat(r.salario) || 0) > 0
        ? parseFloat(r.salario)
        : (parseFloat(r.diaria) || 0) * (parseFloat(r.quantidade) || 0);
      bi.despesas += v;
      const mes = r.vencimento ? new Date(r.vencimento).getMonth() : new Date().getMonth();
      bi.fluxoMensalDespesas[mes] += v;
      bi.recentes.push({
        data: fmt(r.vencimento), modulo: 'Pessoal',
        desc: `${r.funcao || 'Pessoal'}: ${r.nome || ''} (${r.vinculo || ''})`,
        valor: v, tipo: 'Despesa', produtor: r.produtor, parceiro: r.nome || 'Pessoal', safra: 'Anual/Geral'
      });
    });

    const manut = await pool.query('SELECT * FROM manut_conservacao');
    manut.rows.forEach(r => {
      const v = (parseFloat(r.custo_material) || 0) + (parseFloat(r.custo_mao_obra) || 0);
      bi.despesas += v;
      const mes = new Date(r.data).getMonth();
      bi.fluxoMensalDespesas[mes] += v;
      bi.recentes.push({
        data: fmt(r.data), modulo: 'Manutenção',
        desc: `${r.categoria || 'Manutenção'}: ${r.descricao || ''} (${r.setor_local || ''})`,
        valor: v, tipo: 'Despesa', produtor: r.produtor, parceiro: r.responsavel || 'Interno', safra: 'Anual/Geral'
      });
    });

    const mutuo = await pool.query('SELECT * FROM reg_mutuo_financeiro');
    mutuo.rows.forEach(r => {
      const v = parseFloat(r.valor) || 0;
      if (String(r.status).toLowerCase() === 'pendente') {
        if (bi.saldosMutuo[r.socio_credor] !== undefined) bi.saldosMutuo[r.socio_credor] += v;
        if (bi.saldosMutuo[r.socio_devedor] !== undefined) bi.saldosMutuo[r.socio_devedor] -= v;
      }
      bi.recentes.push({
        data: fmt(r.data), modulo: 'Mútuo', desc: `MÚTUO: Repasse de ${r.socio_credor} para ${r.socio_devedor}`,
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

// GET /api/bi/cadastrais
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

function obterSociosVinculados(produtorStr, sociosConfig) {
  let socios = [];
  if (!sociosConfig) return socios;
  let pStr = String(produtorStr || '').toLowerCase();
  if (pStr.match(/\b(geral|todos|holding)\b/)) {
    for (let k in sociosConfig) { socios.push(sociosConfig[k]); }
  } else {
    for (let k in sociosConfig) {
      if (pStr.includes(k.toLowerCase()) || k.toLowerCase().includes(pStr)) {
        socios.push(sociosConfig[k]);
      }
    }
  }
  return socios;
}

function calcularRateioLancamento(produtorStr, valor, sociosConfig, socioAnalisadoNome) {
  const sociosAtivos = obterSociosVinculados(produtorStr, sociosConfig);
  let quota = 0;
  let formulaStr = '';

  if (sociosAtivos.length === 0) {
    quota = 1.0;
    formulaStr = 'Individual (100%)';
  } else if (String(produtorStr || '').toLowerCase().match(/\b(geral|todos|holding)\b/)) {
    sociosAtivos.forEach(s => { quota += (s.quota || s.participacao || 0); });
    formulaStr = `Compartilhado (${sociosAtivos.map(s => {
      const nomeCurto = s.nome.split(' ')[1] || s.nome;
      const pct = ((s.quota || s.participacao || 0) * 100).toFixed(0);
      return `${nomeCurto}: ${pct}%`;
    }).join(' + ')})`;
  } else {
    quota = 1.0;
    formulaStr = 'Individual (100%)';
  }

  let cotaSocioAnalisado = 0;
  if (!socioAnalisadoNome || socioAnalisadoNome === 'Todos') {
    cotaSocioAnalisado = quota;
  } else {
    const socioEncontrado = sociosAtivos.find(s =>
      String(s.nome).toLowerCase().includes(String(socioAnalisadoNome).toLowerCase()) ||
      String(socioAnalisadoNome).toLowerCase().includes(String(s.nome).toLowerCase())
    );
    if (socioEncontrado) {
      cotaSocioAnalisado = socioEncontrado.quota || socioEncontrado.participacao || 0;
      if (!String(produtorStr || '').toLowerCase().match(/\b(geral|todos|holding)\b/)) {
        cotaSocioAnalisado = 1.0;
      }
    } else {
      cotaSocioAnalisado = 0;
    }
  }

  const valorSocio = (parseFloat(valor) || 0) * cotaSocioAnalisado;
  return { quota, formulaStr, valorSocio, cotaSocioAnalisado };
}

// GET /api/bi/relatorio-pdf
router.get('/relatorio-pdf', exigirLogin, async (req, res) => {
  try {
    const { socio, dataInicio, dataFim, modulo, ie, fazenda } = req.query;
    const bi = {
      receitas: 0, despesas: 0, saldosMutuo: {}, sociosConfig: {},
      recentes: [], raioXFrota: [], numParticipantes: 0, socioAnalisado: 'Consolidado Geral',
      cotaPercentual: 1.0, rateioSocios: []
    };

    const participantes = await pool.query('SELECT * FROM participantes');
    bi.numParticipantes = participantes.rows.length;
    let somaParticipacao = 0;
    participantes.rows.forEach(p => {
      const frac = parseFloat(p.participacao) || 0;
      somaParticipacao += frac;
      bi.sociosConfig[p.nome] = {
        nome: p.nome, ie: p.ie, fazenda: p.fazenda || 'Sem Fazenda',
        quota: frac, participacao: frac
      };
    });
    bi.somaParticipacao = somaParticipacao > 0 ? somaParticipacao : 1;

    let cotaFrac = 1.0;
    if (socio && socio !== 'Todos') {
      const part = participantes.rows.find(p =>
        String(p.nome).toLowerCase().includes(String(socio).toLowerCase())
      );
      if (part) {
        cotaFrac = parseFloat(part.participacao) || (participantes.rows.length > 0 ? 1 / participantes.rows.length : 1);
      }
    }
    bi.cotaPercentual = cotaFrac;
    bi.socioAnalisado = (socio && socio !== 'Todos') ? socio : 'Consolidado Geral (Holding)';

    const fmtQ = (d) => d ? new Date(d).toISOString().split('T')[0] : null;
    const ini = fmtQ(dataInicio);
    const fim = fmtQ(dataFim);

    const MODULO_ALIASES = {
      'fat. grãos': ['fat. grãos', 'faturamento'],
      'compra': ['compra', 'compra de insumos'],
      'vendas': ['vendas', 'contratos de venda'],
      'fin/seg': ['fin/seg', 'financiamentos', 'seguros'],
      'ativos': ['ativos', 'oficina', 'maquinario'],
      'pessoal': ['pessoal', 'compromissos'],
      'manutenção': ['manutenção', 'conservação', 'infraestrutura'],
      'pecuária': ['pecuária', 'manejo'],
      'lavoura': ['lavoura', 'opex'],
      'mútuo': ['mútuo', 'mutuo']
    };

    function dentroFiltro(r) {
      if (socio && socio !== 'Todos' && r.produtor) {
        const pStr = String(r.produtor).toLowerCase();
        const sStr = String(socio).toLowerCase();
        if (!pStr.includes(sStr) && !sStr.includes(pStr)) {
          if (!pStr.match(/\b(geral|todos|holding)\b/)) {
            if (r.modulo === 'Mútuo' && r.parceiro) {
              const parcStr = String(r.parceiro).toLowerCase();
              if (!parcStr.includes(sStr) && !sStr.includes(parcStr)) {
                return false;
              }
            } else {
              return false;
            }
          }
        }
      }
      if (modulo && modulo !== 'Todos' && r.modulo) {
        const modNorm = String(modulo).toLowerCase().trim();
        const rModNorm = String(r.modulo).toLowerCase().trim();
        const aliases = MODULO_ALIASES[modNorm] || [modNorm];
        const bate = aliases.some(a => rModNorm.includes(a) || a.includes(rModNorm));
        if (!bate) return false;
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

    function criarItem(dados) {
      const valor = parseFloat(dados.valor) || 0;
      const { formulaStr, valorSocio } = calcularRateioLancamento(
        dados.produtor, valor, bi.sociosConfig, socio
      );
      return {
        data: dados.data,
        modulo: dados.modulo,
        desc: dados.desc,
        valor: valor,
        cota: valorSocio,
        formula: formulaStr,
        tipo: dados.tipo,
        produtor: dados.produtor,
        parceiro: dados.parceiro,
        safra: dados.safra
      };
    }

    // === Faturamento ===
    const fat = await pool.query('SELECT * FROM entregas_faturamento');
    fat.rows.forEach(r => {
      const v = parseFloat(r.valor_total) || 0;
      const item = criarItem({
        data: fmt(r.data), modulo: 'Fat. Grãos',
        desc: `Faturamento Contrato ${r.contrato}: ${r.peso_bruto} scs`,
        valor: v, tipo: 'Receita', produtor: r.produtor, parceiro: r.destino, safra: 'Soja 25/26'
      });
      if (dentroData(r.data) && dentroFiltro(item)) {
        bi.recentes.push(item);
        bi.receitas += v;
      }
    });

    // === Pecuária ===
    const pec = await pool.query('SELECT * FROM reg_pecuaria');
    pec.rows.forEach(r => {
      const v = parseFloat(r.valor_total) || 0;
      const evento = String(r.evento || '').toLowerCase().trim();
      const ehReceita = evento.includes('venda');
      const tipo = ehReceita ? 'Receita' : 'Despesa';
      const acao = ehReceita ? 'Venda' : (evento.includes('compra') ? 'Compra' : 'Vacinação');
      const parceiro = r.parceiro || (ehReceita ? 'Comprador' : 'Fornecedor');
      const item = criarItem({
        data: fmt(r.data), modulo: 'Pecuária',
        desc: `${acao} de ${r.qtd} Cab. de ${r.categoria || 'Gado'}`,
        valor: v, tipo, produtor: r.produtor, parceiro, safra: 'Giro Pecuária'
      });
      if (dentroData(r.data) && dentroFiltro(item)) {
        bi.recentes.push(item);
        if (ehReceita) bi.receitas += v; else bi.despesas += v;
      }
    });

    // === Lavoura ===
    const lav = await pool.query('SELECT * FROM reg_lavoura');
    lav.rows.forEach(r => {
      const v = parseFloat(r.custo_total) || 0;
      const item = criarItem({
        data: fmt(r.data), modulo: 'Lavoura',
        desc: `LAVOURA: ${r.atividade} - ${r.insumo || ''}`,
        valor: v, tipo: 'Despesa', produtor: r.produtor, parceiro: 'Interno', safra: r.safra || 'Anual/Geral'
      });
      if (dentroData(r.data) && dentroFiltro(item)) {
        bi.recentes.push(item);
        bi.despesas += v;
      }
    });

    // === Compra ===
    const comp = await pool.query('SELECT * FROM contratos_compra_insumos');
    comp.rows.forEach(r => {
      const v = (parseFloat(r.qtd) || 0) * (parseFloat(r.valor_unitario) || 0);
      const item = criarItem({
        data: fmt(r.data), modulo: 'Compra',
        desc: `Compra: ${r.item || r.tipo_insumo || 'Insumo'} - ${r.qtd} ${r.unidade || ''}`,
        valor: v, tipo: 'Despesa', produtor: r.produtor, parceiro: r.fornecedor, safra: 'Anual/Geral'
      });
      if (dentroData(r.data) && dentroFiltro(item)) {
        bi.recentes.push(item);
        bi.despesas += v;
      }
    });

    // === Vendas ===
    const vend = await pool.query('SELECT * FROM contratos_venda_lavoura');
    vend.rows.forEach(r => {
      const v = (parseFloat(r.volume) || 0) * (parseFloat(r.preco) || 0);
      const item = criarItem({
        data: fmt(r.data_pagamento || r.data_inicio_entrega), modulo: 'Vendas',
        desc: `Venda Contrato ${r.contrato}: ${r.volume} sc de ${r.cultura || 'Grão'}`,
        valor: v, tipo: 'Receita', produtor: r.produtor, parceiro: r.comprador, safra: r.safra || 'Soja 25/26'
      });
      if (dentroData(r.data_pagamento || r.data_inicio_entrega) && dentroFiltro(item)) {
        bi.recentes.push(item);
        bi.receitas += v;
      }
    });

    // === Ativos ===
    const maq = await pool.query('SELECT * FROM reg_financas_maquinas');
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

      const item = criarItem({
        data: fmt(r.data), modulo: 'Ativos',
        desc: `[${r.id_maquina}] ${r.tipo_custo}: ${r.descricao}`,
        valor: v, tipo: 'Despesa', produtor: r.produtor, parceiro: 'Oficina', safra: 'Anual/Geral'
      });
      if (dentroFiltro(item)) {
        bi.recentes.push(item);
        bi.despesas += v;
      }
    });

    // === Fin/Seg ===
    const fin = await pool.query('SELECT * FROM lan_financiamentos_seguros');
    fin.rows.forEach(r => {
      const v = parseFloat(r.valor) || 0;
      const item = criarItem({
        data: fmt(r.data), modulo: 'Fin/Seg',
        desc: `${String(r.categoria || '').toUpperCase()} Banco: ${r.banco_credor}`,
        valor: v, tipo: 'Despesa', produtor: r.produtor, parceiro: r.banco_credor, safra: 'Anual/Geral'
      });
      if (dentroData(r.data) && dentroFiltro(item)) {
        bi.recentes.push(item);
        bi.despesas += v;
      }
    });

    // === Pessoal ===
    const pes = await pool.query('SELECT * FROM gestao_pessoal');
    pes.rows.forEach(r => {
      const v = (parseFloat(r.salario) || 0) > 0
        ? parseFloat(r.salario)
        : (parseFloat(r.diaria) || 0) * (parseFloat(r.quantidade) || 0);
      const item = criarItem({
        data: fmt(r.vencimento), modulo: 'Pessoal',
        desc: `${r.funcao || 'Pessoal'}: ${r.nome || ''} (${r.vinculo || ''})`,
        valor: v, tipo: 'Despesa', produtor: r.produtor, parceiro: r.nome || 'Pessoal', safra: 'Anual/Geral'
      });
      if (dentroData(r.vencimento) && dentroFiltro(item)) {
        bi.recentes.push(item);
        bi.despesas += v;
      }
    });

    // === Manutenção ===
    const manut = await pool.query('SELECT * FROM manut_conservacao');
    manut.rows.forEach(r => {
      const v = (parseFloat(r.custo_material) || 0) + (parseFloat(r.custo_mao_obra) || 0);
      const item = criarItem({
        data: fmt(r.data), modulo: 'Manutenção',
        desc: `${r.categoria || 'Manutenção'}: ${r.descricao || ''} (${r.setor_local || ''})`,
        valor: v, tipo: 'Despesa', produtor: r.produtor, parceiro: r.responsavel || 'Interno', safra: 'Anual/Geral'
      });
      if (dentroData(r.data) && dentroFiltro(item)) {
        bi.recentes.push(item);
        bi.despesas += v;
      }
    });

    // === Mútuo entre sócios (REGRA CORRIGIDA: TEXTO CLARO E COTA ZERO NO CONSOLIDADO) ===
    const mutuo = await pool.query('SELECT * FROM reg_mutuo_financeiro');
    mutuo.rows.forEach(r => {
      const v = parseFloat(r.valor) || 0;
      const credor = r.socio_credor || '—';
      const devedor = r.socio_devedor || '—';
      const statusMutuo = r.status || 'Pendente';
      const descMutuo = r.desc || r.descricao || '';
      const isDevolucao = descMutuo.toLowerCase().includes('devolu') || descMutuo.toLowerCase().includes('reembolso') || statusMutuo.toLowerCase().includes('liquida');

      let formulaStr = 'Repasse Inter-Sócios (0%)';
      let tipoMutuo = 'Mútuo';
      let descFinal = '';
      let cotaMutuo = 0;

      if (isDevolucao) {
        descFinal = `MÚTUO: Devolução de ${devedor} para ${credor} (${statusMutuo})`;
      } else {
        descFinal = `MÚTUO: Empréstimo de ${credor} para ${devedor} (${statusMutuo})`;
      }

      if (socio && socio !== 'Todos') {
        const socioNorm = String(socio).toLowerCase();
        const isCredor = String(credor).toLowerCase().includes(socioNorm) || socioNorm.includes(String(credor).toLowerCase());
        const isDevedor = String(devedor).toLowerCase().includes(socioNorm) || socioNorm.includes(String(devedor).toLowerCase());

        if (isCredor) {
          tipoMutuo = isDevolucao ? 'Receita' : 'Despesa';
          formulaStr = 'Individual (100%)';
          cotaMutuo = v;
          descFinal = isDevolucao 
            ? `MÚTUO: Devolução Recebida de ${devedor} (${statusMutuo})`
            : `MÚTUO: Empréstimo Concedido para ${devedor} (${statusMutuo})`;
        } else if (isDevedor) {
          tipoMutuo = isDevolucao ? 'Despesa' : 'Receita';
          formulaStr = 'Individual (100%)';
          cotaMutuo = v;
          descFinal = isDevolucao 
            ? `MÚTUO: Devolução Paga para ${credor} (${statusMutuo})`
            : `MÚTUO: Empréstimo Recebido de ${credor} (${statusMutuo})`;
        } else {
          formulaStr = 'Sem Vínculo (0%)';
          cotaMutuo = 0;
          tipoMutuo = 'Mútuo';
        }
      } else {
        formulaStr = 'Repasse Inter-Sócios (0%)';
        tipoMutuo = 'Mútuo';
        cotaMutuo = 0;
      }

      const item = {
        data: fmt(r.data), modulo: 'Mútuo',
        desc: descFinal,
        valor: v,
        cota: cotaMutuo,
        formula: formulaStr,
        tipo: tipoMutuo, produtor: credor, parceiro: devedor, safra: 'Anual/Geral'
      };

      if (dentroData(r.data) && dentroFiltro(item)) {
        bi.recentes.push(item);
      }
    });

    bi.raioXFrota = Object.values(frotaMap).sort((a, b) => b.total - a.total);
    bi.custoTotalFrota = bi.raioXFrota.reduce((s, f) => s + f.total, 0);
    bi.cotaFrota = bi.custoTotalFrota * cotaFrac;

    bi.recentes.sort((a, b) => {
      const [da, ma, ya] = (a.data || '').split('/');
      const [db_, mb, yb] = (b.data || '').split('/');
      return new Date(yb, mb - 1, db_) - new Date(ya, ma - 1, da);
    });

    bi.saldo = bi.receitas - bi.despesas;
    bi.cotaReceitas = bi.receitas * cotaFrac;
    bi.cotaDespesas = bi.despesas * cotaFrac;
    bi.cotaSaldo = bi.saldo * cotaFrac;

    bi.rateioSocios = participantes.rows.map(p => {
      const frac = parseFloat(p.participacao) || 0;
      const pctNormalizado = somaParticipacao > 0 ? (frac / somaParticipacao) : 0;
      return {
        nome: p.nome,
        participacao: frac,
        pct: pctNormalizado,
        receitaCota: bi.receitas * pctNormalizado,
        despesaCota: bi.despesas * pctNormalizado,
        saldoCota: bi.saldo * pctNormalizado
      };
    });

    bi.filtros = { socio: socio || 'Todos', dataInicio: ini || 'Início', dataFim: fim || 'Fim', modulo: modulo || 'Todos', ie: ie || 'Todas', fazenda: fazenda || 'Todas' };
    bi.geradoEm = new Date().toLocaleString('pt-BR');

    res.json({ sucesso: true, dados: bi });
  } catch (e) {
    console.error(e);
    res.status(500).json({ sucesso: false, message: 'Erro ao gerar relatório: ' + e.message });
  }
});

// DELETE /api/bi/limpar-base
router.delete('/limpar-base', exigirLogin, async (req, res) => {
  if (req.usuario.nivel !== 'Admin') {
    return res.status(403).json({ sucesso: false, mensagem: 'Acesso negado. Apenas Administradores podem limpar a base de dados.' });
  }
  try {
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