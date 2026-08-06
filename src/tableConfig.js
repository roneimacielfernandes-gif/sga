// Cada entrada descreve: nome usado pelo front-end -> tabela real no Postgres
// e o mapeamento de campo do formulário -> coluna do banco.
// Isso reproduz o que salvarLancamentoRapido()/obterRegistroPorId() faziam
// no Apps Script, só que de forma declarativa (mais fácil de adicionar um módulo novo).

const TABLES = {
  Reg_Lavoura: {
    tabela: 'reg_lavoura',
    campos: {
      data: 'data', produtor: 'produtor', talhao: 'talhao', safra: 'safra',
      atividade: 'atividade', cultura: 'cultura', insumo: 'insumo',
      quantidade: 'quantidade', custoTotal: 'custo_total', producao: 'producao'
    }
  },
  Reg_Pecuaria: {
    tabela: 'reg_pecuaria',
    campos: {
      data: 'data', produtor: 'produtor', piquetePecuaria: 'piquete',
      categoriaPecuaria: 'categoria', eventoPecuaria: 'evento', qtdPecuaria: 'qtd',
      pesoMedioPecuaria: 'peso_medio', valorTotalPecuaria: 'valor_total',
      parceiroPecuaria: 'parceiro'
    }
  },
  Reg_Financas_Maquinas: {
    tabela: 'reg_financas_maquinas',
    campos: {
      data: 'data', produtor: 'produtor', idMaquinaFin: 'id_maquina',
      tipoCustoFin: 'tipo_custo', descCustoFin: 'descricao', valorFin: 'valor',
      vencFin: 'vencimento', statusFin: 'status'
    }
  },
  Lan_Financiamentos_Seguros: {
    tabela: 'lan_financiamentos_seguros',
    campos: {
      data: 'data', vencFin: 'vencimento', produtor: 'produtor',
      categoriaFin: 'categoria', bancoCredorFin: 'banco_credor',
      parcelaFin: 'parcela', valorFin: 'valor', statusFin: 'status'
    }
  },
  Contratos_Compra_Insumos: {
    tabela: 'contratos_compra_insumos',
    campos: {
      data: 'data', produtor: 'produtor', pedidoCompra: 'pedido',
      fornecedorCompra: 'fornecedor', itemCompra: 'item', tipoInsumoCompra: 'tipo_insumo',
      qtdCompra: 'qtd', unidadeCompra: 'unidade', valorUnitCompra: 'valor_unitario',
      vencimentoCompra: 'vencimento', formaPgtoCompra: 'forma_pgto',
      statusPgtoCompra: 'status_pgto', previsaoEntregaCompra: 'previsao_entrega',
      statusEntregaCompra: 'status_entrega'
    }
  },
  Mov_Estoque: {
    tabela: 'mov_estoque',
    campos: {
      data: 'data', produtor: 'produtor', tipoMovimentacao: 'tipo_movimentacao',
      contratoCompra: 'contrato', notaFiscal: 'nota_fiscal', itemEstoque: 'item',
      qtdEstoque: 'qtd', unidadeEstoque: 'unidade',
      valorUnitarioEstoque: 'valor_unitario', destinoEstoque: 'destino'
    }
  },
  Contratos_Venda_Lavoura: {
    tabela: 'contratos_venda_lavoura',
    campos: {
      produtor: 'produtor', contratoVenda: 'contrato', compradorVenda: 'comprador',
      culturaVenda: 'cultura', safraVenda: 'safra', modalidadeVenda: 'modalidade',
      volumeVenda: 'volume', precoVenda: 'preco',
      dataInicioEntregaVenda: 'data_inicio_entrega', dataFimEntregaVenda: 'data_fim_entrega',
      dataPagamentoVenda: 'data_pagamento', statusVenda: 'status'
    }
  },
  Entregas_e_Faturamento: {
    tabela: 'entregas_faturamento',
    campos: {
      data: 'data', produtor: 'produtor', contratoFaturamento: 'contrato',
      destinoFaturamento: 'destino', notaFiscalFaturamento: 'nota_fiscal',
      pesoBrutoFaturamento: 'peso_bruto', umidadeFaturamento: 'umidade',
      impurezaFaturamento: 'impureza', avariadosFaturamento: 'avariados',
      precoSacaFaturamento: 'preco_saca', funruralFaturamento: 'funrural',
      senarFaturamento: 'senar', icmsFaturamento: 'icms',
      piscofinsFaturamento: 'piscofins', ibsFaturamento: 'ibs', cbsFaturamento: 'cbs',
      freteFaturamento: 'frete', valorTotalFaturamento: 'valor_total',
      dataPgtoFaturamento: 'data_pgto', statusPgtoFaturamento: 'status_pgto'
    }
  },
  Gestao_Pessoal_e_Parcerias: {
    tabela: 'gestao_pessoal',
    campos: {
      nomePessoal: 'nome', produtor: 'produtor', vinculoPessoal: 'vinculo',
      funcaoPessoal: 'funcao', salarioPessoal: 'salario', diariaPessoal: 'diaria',
      quantidadePessoal: 'quantidade', vencimentoPessoal: 'vencimento',
      terminoContratoPessoal: 'termino_contrato', statusPessoal: 'status'
    }
  },
  Manut_Conservacao: {
    tabela: 'manut_conservacao',
    campos: {
      data: 'data', produtor: 'produtor', setorLocal: 'setor_local',
      categoriaManut: 'categoria', descricaoManut: 'descricao',
      responsavelManut: 'responsavel', custoMaterial: 'custo_material',
      custoMaoObra: 'custo_mao_obra', statusManut: 'status'
    }
  },
  Reg_Mutuo_Financeiro: {
    tabela: 'reg_mutuo_financeiro',
    campos: {
      data: 'data', socioCredorM: 'socio_credor', socioDevedorM: 'socio_devedor',
      valorM: 'valor', descM: 'descricao', vencM: 'vencimento', statusM: 'status'
    }
  },
  Config_Participantes: {
    tabela: 'participantes',
    campos: {
      nomePart: 'nome', documentoPart: 'documento', iePart: 'ie',
      participacaoPart: 'participacao', contratoPart: 'contrato', areaPart: 'area',
      inicioPart: 'inicio', vencimentoPart: 'vencimento', valorPart: 'valor',
      statusPart: 'status', fazendaPart: 'fazenda'
    }
  }
};

module.exports = { TABLES };
