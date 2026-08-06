/**
 * ADAPTADOR DE API - SGA Norte Agro
 * -----------------------------------
 * Este arquivo substitui o "google.script.run" do seu HTML antigo.
 * Basta:
 *  1) Incluir este <script src="api.js"></script> no seu HTML, ANTES do seu script principal.
 *  2) Trocar API_BASE_URL abaixo pela URL do seu backend publicado (Railway/Render).
 *  3) No seu código, trocar os padrões:
 *       google.script.run.withSuccessHandler(cb).minhaFuncao(args)
 *     por:
 *       api.minhaFuncao(args).then(cb)
 *     Os nomes das funções abaixo foram escolhidos para ficarem parecidos
 *     com as funções que já existiam no Código.gs, pra facilitar a migração.
 */

const API_BASE_URL = 'https://SEU-BACKEND.up.railway.app/api'; // <-- troque aqui

function getToken() {
  return localStorage.getItem('sga_token');
}

async function chamarAPI(metodo, caminho, corpo) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const resp = await fetch(API_BASE_URL + caminho, {
    method: metodo,
    headers,
    body: corpo ? JSON.stringify(corpo) : undefined
  });

  return resp.json();
}

const api = {
  // Login: substitui verificarLogin(email, senha)
  async verificarLogin(email, senha) {
    const res = await chamarAPI('POST', '/auth/login', { email, senha });
    if (res.autorizado && res.token) {
      localStorage.setItem('sga_token', res.token);
    }
    return res; // { autorizado, nome, nivel, mensagem }
  },

  logout() {
    localStorage.removeItem('sga_token');
  },

  // Dashboard: substitui obterDadosBIReais()
  obterDadosBIReais() {
    return chamarAPI('GET', '/bi/dashboard');
  },

  // Dropdowns do formulário: substitui obterDadosCadastrais()
  obterDadosCadastrais() {
    return chamarAPI('GET', '/bi/cadastrais');
  },

  // Lista para o dropdown de edição: substitui obterRegistrosParaEdicao(tabela)
  obterRegistrosParaEdicao(tabela) {
    return chamarAPI('GET', `/records/${tabela}`);
  },

  // Um registro específico: substitui obterRegistroPorId(tabela, id)
  obterRegistroPorId(tabela, id) {
    return chamarAPI('GET', `/records/${tabela}/${id}`);
  },

  // Criar ou atualizar: substitui salvarLancamentoRapido(dados)
  salvarLancamentoRapido(dados) {
    return chamarAPI('POST', '/records', dados);
  },

  // Cadastro de usuário: substitui a parte de Config_Acessos de salvarLancamentoRapido
  salvarUsuario(dados) {
    return chamarAPI('POST', '/auth/usuarios', dados);
  }
};

/**
 * COMPATIBILIDADE COM O CÓDIGO ANTIGO
 * ------------------------------------
 * Para você não precisar reescrever TODO o HTML de uma vez, este bloco
 * simula o "google.script.run" na frente do objeto `api` acima.
 * Assim seu código antigo continua funcionando quase sem alterações
 * enquanto você migra módulo por módulo.
 */
function criarRunChain(onSuccess, onFailure) {
  return new Proxy({
    withSuccessHandler(fn) { return criarRunChain(fn, onFailure); },
    withFailureHandler(fn) { return criarRunChain(onSuccess, fn); }
  }, {
    get(alvo, nomeFuncao) {
      if (nomeFuncao in alvo) return alvo[nomeFuncao];
      return (...args) => {
        if (typeof api[nomeFuncao] !== 'function') {
          console.warn(`Função "${String(nomeFuncao)}" ainda não migrada no api.js`);
          return;
        }
        api[nomeFuncao](...args).then(onSuccess).catch(onFailure);
      };
    }
  });
}

window.google = window.google || {};
window.google.script = {
  get run() {
    return criarRunChain(() => {}, (e) => console.error(e));
  },
  host: { close() {} }
};
