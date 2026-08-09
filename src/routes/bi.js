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
        data: fmt(r.data), modulo: 'Fin/Seg',
        desc: `${String(r.categoria || '').toUpperCase()} Banco: ${r.banco_credor}`,
        valor: v, tipo: 'Despesa', produtor: r.produtor, categoriaCusto: r.categoria,
        safra: 'Anual/Geral', parceiro: r.banco_credor
      });
    });

    // Compra de insumos (despesa)
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

    // Vendas / contratos de venda de lavoura (receita)
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

    // Pessoal (despesa)
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

    // Manutenção / conservação (despesa)
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

/**
 * Mapeamento de nomes de módulo para o filtro.
 * O dropdown moduloRelatorio usa valores como "Compra", "Vendas", "Fin/Seg", "Pessoal", "Manutenção".
 * Esta função garante que o filtro compara o nome corretamente.
 */
const MODULOS_RELATORIO = [
  'Fat. Grãos', 'Pecuária', 'Lavoura', 'Compra', 'Vendas',
  'Fin/Seg', 'Ativos', 'Pessoal', 'Manutenção', 'Mútuo'
];

/**
 * obterSociosVinculados (replica do código original do Google Sheets)
 * Determina quais sócios estão vinculados a um lançamento.
 * Se o produtor contém "geral|todos|holding" => TODOS os sócios (compartilhado por quota)
 * Caso contrário => apenas os sócios cujo nome casa (individual 100%)
 */
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

/**
 * Calcula a fórmula de rateio e a cota do sócio analisado para um lançamento.
 * Retorna { quota, formulaStr, valorSocio }
 *  - quota: fração aplicada (soma das quotas dos sócios vinculados, ou 1.0 se individual)
 *  - formulaStr: texto descritivo "Compartilhado (...)" ou "Individual (100%)"
 *  - valorSocio: valor × quota
 */
function calcularRateioLancamento(produtorStr, valor, sociosConfig, socioAnalisadoNome) {
  const sociosAtivos = obterSociosVinculados(produtorStr, sociosConfig);
  let quota = 0;
  let formulaStr = '';

  if (sociosAtivos.length === 0) {
    // Nenhum sócio vinculado encontrado — trata como individual 100%
    quota = 1.0;
    formulaStr = 'Individual (100%)';
  } else if (String(produtorStr || '').toLowerCase().match(/\b(geral|todos|holding)\b/)) {
    // Compartilhado: soma as quotas de todos os sócios ativos
    sociosAtivos.forEach(s => { quota += (s.quota || s.participacao || 0); });
    formulaStr = `Compartilhado (${sociosAtivos.map(s => {
      const nomeCurto = s.nome.split(' ')[1] || s.nome;
      const pct = ((s.quota || s.participacao || 0) * 100).toFixed(0);
      return `${nomeCurto}: ${pct}%`;
    }).join(' + ')})`;
  } else {
    // Individual: o sócio vinculado assume 100%
    quota = 1.0;
    formulaStr = 'Individual (100%)';
  }

  // Cota do sócio analisado: se for "Todos"/Consolidado, usa a quota total (soma dos vinculados)
  // Se for um sócio específico, usa apenas a quota daquele sócio dentro dos vinculados
  let cotaSocioAnalisado = 0;
  if (!socioAnalisadoNome || socioAnalisadoNome === 'Todos') {
    cotaSocioAnalisado = quota; // consolidado = valor cheio do rateio
  } else {
    // Procura o sócio analisado entre os vinculados
    const socioEncontrado = sociosAtivos.find(s =>
      String(s.nome).toLowerCase().includes(String(socioAnalisadoNome).toLowerCase()) ||
      String(socioAnalisadoNome).toLowerCase().includes(String(s.nome).toLowerCase())
    );
    if (socioEncontrado) {
      cotaSocioAnalisado = socioEncontrado.quota || socioEncontrado.participacao || 0;
      // Se for individual (não compartilhado), o sócio assume 100% mesmo que sua quota seja menor
      if (!String(produtorStr || '').toLowerCase().match(/\b(geral|todos|holding)\b/)) {
        cotaSocioAnalisado = 1.0;
      }
    } else {
      // Sócio analisado não está entre os vinculados — cota zero
      cotaSocioAnalisado = 0;
    }
  }

  const valorSocio = (parseFloat(valor) || 0) * cotaSocioAnalisado;
  return { quota, formulaStr, valorSocio, cotaSocioAnalisado };
}

// GET /api/bi/relatorio-pdf?socio=&dataInicio=&dataFim=&modulo=&ie=&fazenda=
// Retorna os dados filtrados em JSON para o frontend montar o PDF (HTML→Chromium→PDF).
router.get('/relatorio-pdf', exigirLogin, async (req, res) => {
  try {
    const { socio, dataInicio, dataFim, modulo, ie, fazenda } = req.query;
    const bi = {
      receitas: 0, despesas: 0, saldosMutuo: {}, sociosConfig: {},
      recentes: [], raioXFrota: [], numParticipantes: 0, socioAnalisado: 'Consolidado Geral',
      cotaPercentual: 1.0, rateioSocios: []
    };

    // Carrega sócios/participantes
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

    // Determina o sócio analisado e sua cota percentual (para o resumo no topo)
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

    // Mapeamento de alias de módulo para comparação flexível no filtro
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
      // Filtro por produtor (sócio)
      if (socio && socio !== 'Todos' && r.produtor && !String(r.produtor).toLowerCase().includes(String(socio).toLowerCase())) {
        // Exceção: se o produtor for "geral/todos/holding", passa no filtro (é compartilhado)
        if (!String(r.produtor).toLowerCase().match(/\b(geral|todos|holding)\b/)) {
          return false;
        }
      }
      // Filtro por módulo (com alias flexível)
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

    /**
     * Helper: cria um item de lançamento com fórmula de rateio calculada.
     * Cada item tem: data, modulo, desc, valor (planilha cheio), cota (do sócio analisado),
     * formula (string do rateio), tipo, produtor, parceiro, safra.
     */
    function criarItem(dados) {
      const valor = parseFloat(dados.valor) || 0;
      const { formulaStr, valorSocio } = calcularRateioLancamento(
        dados.produtor, valor, bi.sociosConfig, socio
      );
      return {
        data: dados.data,
        modulo: dados.modulo,
        desc: dados.desc,
        valor: valor,           // Valor Planilha (cheio)
        cota: valorSocio,       // Sua Cota R$ (proporcional ao sócio analisado)
        formula: formulaStr,    // "Compartilhado (...)" ou "Individual (100%)"
        tipo: dados.tipo,
        produtor: dados.produtor,
        parceiro: dados.parceiro,
        safra: dados.safra
      };
    }

    // === Faturamento (Fat. Grãos) — Receita ===
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

    // === Pecuária — Venda=Receita, Compra/Vacinação=Despesa ===
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

    // === Lavoura — Despesa ===
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

    // === Compra de Insumos — Despesa ===
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

    // === Vendas / Contratos de Venda — Receita ===
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

    // === Ativos / Máquinas — Despesa (Raio-X Frota) ===
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

    // === Fin/Seg — Financiamentos e Seguros — Despesa (módulo SEPARADO de Ativos) ===
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

    // === Pessoal — Despesa ===
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

    // === Manutenção / Conservação — Despesa ===
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

    // === Mútuo entre sócios — aparece na auditoria com credor→devedor ===
    const mutuo = await pool.query('SELECT * FROM reg_mutuo_financeiro');
    mutuo.rows.forEach(r => {
      const v = parseFloat(r.valor) || 0;
      const credor = r.socio_credor || '—';
      const devedor = r.socio_devedor || '—';
      const statusMutuo = r.status || 'Pendente';
      // Para mútuo, vinculamos tanto o credor quanto o devedor
      // O produtor é o credor (quem emprestou); o parceiro é o devedor (quem recebeu)
      const sociosAtivos = obterSociosVinculados(credor, bi.sociosConfig);
      // Também tenta vincular o devedor
      const sociosDevedor = obterSociosVinculados(devedor, bi.sociosConfig);
      const todosVinculados = [...sociosAtivos, ...sociosDevedor.filter(d => !sociosAtivos.find(s => s.nome === d.nome))];

      let formulaStr = '';
      if (todosVinculados.length > 1 || String(credor).toLowerCase().match(/\b(geral|todos|holding)\b/)) {
        formulaStr = `Compartilhado (${todosVinculados.map(s => {
          const nomeCurto = s.nome.split(' ')[1] || s.nome;
          const pct = ((s.quota || s.participacao || 0) * 100).toFixed(0);
          return `${nomeCurto}: ${pct}%`;
        }).join(' + ')})`;
      } else {
        formulaStr = 'Individual (100%)';
      }

      // Cota do sócio analisado no mútuo
      let cotaMutuo = v; // padrão: valor cheio
      if (socio && socio !== 'Todos') {
        const socioEncontrado = todosVinculados.find(s =>
          String(s.nome).toLowerCase().includes(String(socio).toLowerCase()) ||
          String(socio).toLowerCase().includes(String(s.nome).toLowerCase())
        );
        cotaMutuo = socioEncontrado ? v : 0;
      }

      const item = {
        data: fmt(r.data), modulo: 'Mútuo',
        desc: `MÚTUO: Repasse ${credor} → ${devedor} (${statusMutuo})`,
        valor: v, cota: cotaMutuo,
        formula: formulaStr,
        tipo: 'Mútuo', produtor: credor, parceiro: devedor, safra: 'Anual/Geral'
      };
      if (dentroData(r.data) && dentroFiltro(item)) {
        bi.recentes.push(item);
      }
    });

    // Raio-X de Frota: converte o mapa em array ordenado por total decrescente
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

    // Rateio entre sócios: divide receitas e despesas pela participação de cada um
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

// DELETE /api/bi/limpar-base  -> zera todas as tabelas operacionais (SÓ ADMIN)
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
