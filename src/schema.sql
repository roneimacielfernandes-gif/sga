-- ============================================================
-- SGA NORTE AGRO - SCHEMA POSTGRESQL
-- Tradução das 15 abas do Google Sheets em tabelas relacionais
-- ============================================================

-- Sócios / Participantes (era Config_Participantes)
CREATE TABLE IF NOT EXISTS participantes (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  documento TEXT,
  ie TEXT,
  participacao NUMERIC(6,4) DEFAULT 0, -- guarda como fração (0.25 = 25%)
  contrato TEXT,
  area NUMERIC(12,2),
  inicio DATE,
  vencimento DATE,
  valor NUMERIC(14,2),
  status TEXT DEFAULT 'Ativo',
  fazenda TEXT,
  criado_em TIMESTAMPTZ DEFAULT now()
);

-- Controle de acessos (era Config_Acessos) - senha agora com HASH, nunca texto puro
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  nivel TEXT NOT NULL DEFAULT 'Visitante', -- Admin, Socio Master, Socio, Operacional, Financeiro, Visitante
  senha_hash TEXT NOT NULL,
  criado_em TIMESTAMPTZ DEFAULT now()
);

-- Cadastros rápidos (era Config_Cadastros): talhões, culturas, categorias de gado, tipos de insumo, bancos
CREATE TABLE IF NOT EXISTS cadastros (
  id SERIAL PRIMARY KEY,
  tipo TEXT NOT NULL, -- 'talhao' | 'cultura' | 'categoria_gado' | 'tipo_insumo' | 'banco'
  nome TEXT NOT NULL,
  tamanho_ha NUMERIC(12,2)
);

CREATE TABLE IF NOT EXISTS fornecedores (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  tipo TEXT
);

CREATE TABLE IF NOT EXISTS maquinario (
  id_maquina TEXT PRIMARY KEY,
  modelo TEXT,
  produtor TEXT,
  horimetro NUMERIC(12,2),
  ultima_manutencao DATE,
  proxima_revisao NUMERIC(12,2),
  diesel NUMERIC(14,2),
  oficina NUMERIC(14,2),
  banco_financiamento TEXT,
  parcela_financiamento TEXT,
  qtd_parcelas_financiamento NUMERIC(6,0),
  venc_financiamento DATE,
  seguradora TEXT,
  seguro NUMERIC(14,2),
  forma_pgto_seguro TEXT,
  qtd_parcelas_seguro NUMERIC(6,0),
  venc_seguro DATE,
  status TEXT DEFAULT 'Ativo'
);

-- Lançamentos operacionais (cada aba de registro vira uma tabela)
CREATE TABLE IF NOT EXISTS reg_lavoura (
  id SERIAL PRIMARY KEY,
  data DATE NOT NULL,
  produtor TEXT,
  talhao TEXT,
  safra TEXT,
  atividade TEXT,
  cultura TEXT,
  insumo TEXT,
  quantidade NUMERIC(14,2),
  custo_total NUMERIC(14,2),
  producao NUMERIC(14,2),
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reg_pecuaria (
  id SERIAL PRIMARY KEY,
  data DATE NOT NULL,
  produtor TEXT,
  piquete TEXT,
  categoria TEXT,
  evento TEXT,
  qtd NUMERIC(10,0),
  peso_medio NUMERIC(10,2),
  valor_total NUMERIC(14,2),
  parceiro TEXT,
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lan_financiamentos_seguros (
  id SERIAL PRIMARY KEY,
  data DATE NOT NULL,
  vencimento DATE,
  produtor TEXT,
  categoria TEXT,
  banco_credor TEXT,
  parcela TEXT,
  valor NUMERIC(14,2),
  status TEXT DEFAULT 'Pendente',
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reg_financas_maquinas (
  id SERIAL PRIMARY KEY,
  data DATE NOT NULL,
  produtor TEXT,
  id_maquina TEXT,
  tipo_custo TEXT,
  descricao TEXT,
  valor NUMERIC(14,2),
  vencimento DATE,
  status TEXT DEFAULT 'Pago',
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contratos_compra_insumos (
  id SERIAL PRIMARY KEY,
  produtor TEXT,
  pedido TEXT,
  fornecedor TEXT,
  data DATE,
  item TEXT,
  tipo_insumo TEXT,
  qtd NUMERIC(14,2),
  unidade TEXT,
  valor_unitario NUMERIC(14,2),
  vencimento DATE,
  forma_pgto TEXT,
  status_pgto TEXT,
  previsao_entrega DATE,
  status_entrega TEXT,
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mov_estoque (
  id SERIAL PRIMARY KEY,
  data DATE NOT NULL,
  produtor TEXT,
  tipo_movimentacao TEXT,
  contrato TEXT,
  nota_fiscal TEXT,
  item TEXT,
  qtd NUMERIC(14,2),
  unidade TEXT,
  valor_unitario NUMERIC(14,2),
  destino TEXT,
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contratos_venda_lavoura (
  id SERIAL PRIMARY KEY,
  produtor TEXT,
  contrato TEXT,
  comprador TEXT,
  cultura TEXT,
  safra TEXT,
  modalidade TEXT,
  volume NUMERIC(14,2),
  preco NUMERIC(14,2),
  data_inicio_entrega DATE,
  data_fim_entrega DATE,
  data_pagamento DATE,
  status TEXT DEFAULT 'Aberto',
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entregas_faturamento (
  id SERIAL PRIMARY KEY,
  data DATE NOT NULL,
  produtor TEXT,
  contrato TEXT,
  destino TEXT,
  nota_fiscal TEXT,
  peso_bruto NUMERIC(14,2),
  umidade NUMERIC(6,2),
  impureza NUMERIC(6,2),
  avariados NUMERIC(6,2),
  preco_saca NUMERIC(14,2),
  funrural NUMERIC(14,2),
  senar NUMERIC(14,2),
  icms NUMERIC(14,2),
  piscofins NUMERIC(14,2),
  ibs NUMERIC(14,2),
  cbs NUMERIC(14,2),
  frete NUMERIC(14,2),
  valor_total NUMERIC(14,2),
  data_pgto DATE,
  status_pgto TEXT DEFAULT 'A Receber',
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gestao_pessoal (
  id SERIAL PRIMARY KEY,
  nome TEXT,
  produtor TEXT,
  vinculo TEXT,
  funcao TEXT,
  salario NUMERIC(14,2),
  diaria NUMERIC(14,2),
  quantidade NUMERIC(10,0),
  vencimento DATE,
  termino_contrato DATE,
  status TEXT DEFAULT 'Pendente',
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS manut_conservacao (
  id SERIAL PRIMARY KEY,
  data DATE NOT NULL,
  produtor TEXT,
  setor_local TEXT,
  categoria TEXT,
  descricao TEXT,
  responsavel TEXT,
  custo_material NUMERIC(14,2),
  custo_mao_obra NUMERIC(14,2),
  status TEXT DEFAULT 'Pendente',
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reg_mutuo_financeiro (
  id SERIAL PRIMARY KEY,
  data DATE NOT NULL,
  socio_credor TEXT,
  socio_devedor TEXT,
  valor NUMERIC(14,2),
  descricao TEXT,
  vencimento DATE,
  status TEXT DEFAULT 'Pendente',
  criado_em TIMESTAMPTZ DEFAULT now()
);

-- Índices para acelerar os relatórios e o dashboard (o Sheets não tinha isso -- é um ganho real de performance)
CREATE INDEX IF NOT EXISTS idx_lavoura_data ON reg_lavoura(data);
CREATE INDEX IF NOT EXISTS idx_pecuaria_data ON reg_pecuaria(data);
CREATE INDEX IF NOT EXISTS idx_financas_maquinas_data ON reg_financas_maquinas(data);
CREATE INDEX IF NOT EXISTS idx_lan_fin_seguros_venc ON lan_financiamentos_seguros(vencimento);
CREATE INDEX IF NOT EXISTS idx_entregas_data ON entregas_faturamento(data);
CREATE INDEX IF NOT EXISTS idx_mutuo_data ON reg_mutuo_financeiro(data);
