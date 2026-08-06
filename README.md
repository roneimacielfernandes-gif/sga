# SGA Norte Agro — Guia Completo (sem precisar saber programar)

Este guia assume que você **nunca usou GitHub nem Railway**. Vá seguindo
exatamente na ordem, sem pular etapas. No fim, seu backend vai estar
funcionando na internet, gratuitamente para testes.

Tempo estimado: uns 20-30 minutos na primeira vez.

---

## PARTE 1 — Colocar o projeto no GitHub

O GitHub é só um "armazenamento" onde o código fica guardado. O Railway
(próxima parte) vai ler o código de lá e colocar pra rodar.

### Passo 1.1 — Criar conta no GitHub
1. Acesse **https://github.com**
2. Clique em **Sign up** (Criar conta)
3. Siga as instruções (e-mail, senha, confirmar). É gratuito.

### Passo 1.2 — Criar um repositório (uma "pasta" no GitHub)
1. Depois de logado, clique no **+** no canto superior direito → **New repository**
2. Em "Repository name", digite: `sga-erp-backend`
3. Deixe marcado **Private** (só você vê) ou **Public**, tanto faz
4. **NÃO marque** nenhuma caixinha de "Add a README file" — deixe tudo desmarcado
5. Clique no botão verde **Create repository**

Você vai cair numa página vazia com algumas instruções técnicas — **ignore
elas**, vamos usar um jeito mais simples.

### Passo 1.3 — Extrair o zip no seu computador
1. Ache o arquivo `sga-erp-backend.zip` que te enviei (pasta Downloads,
   normalmente)
2. Clique com o botão direito nele → **Extrair tudo** (Windows) ou dê
   duplo-clique (Mac)
3. Você vai ver uma pasta chamada `sga-erp` — abra ela. Dentro tem as pastas
   `src`, `frontend-adapter` e arquivos como `package.json`, `README.md`

### Passo 1.4 — Subir os arquivos pro GitHub (sem usar terminal)
1. Na página vazia do seu repositório no GitHub, procure o link escrito algo
   como **"uploading an existing file"** (às vezes aparece como um link azul
   no meio do texto) e clique nele
2. Vai abrir uma área com uma caixa pontilhada escrito "Drag files here"
3. Abra a pasta `sga-erp` (a que você extraiu) numa janela do
   Explorador de Arquivos/Finder **ao lado** da janela do navegador
4. **Selecione TODOS os itens dentro da pasta `sga-erp`** (os arquivos e as
   pastas `src` e `frontend-adapter` juntos — não a pasta `sga-erp` em si,
   o *conteúdo* dela) e **arraste todos para dentro da caixa pontilhada** do
   navegador
5. Espere a barra de progresso terminar de subir tudo
6. Role a página até o final, onde tem uma caixa de texto "Commit changes"
   — pode deixar como está
7. Clique no botão verde **Commit changes**

Pronto — seu código já está no GitHub. Você pode conferir: a página do
repositório agora deve mostrar as pastas `src`, `frontend-adapter`, e os
arquivos `package.json`, `README.md`, etc.

> ⚠️ Se ao arrastar os arquivos não funcionar (alguns navegadores mais
> antigos têm problema com pastas), tente pelo Chrome ou Edge, que
> suportam arrastar pastas inteiras.

---

## PARTE 2 — Colocar o backend pra rodar na internet (Railway)

### Passo 2.1 — Criar conta no Railway
1. Acesse **https://railway.app**
2. Clique em **Login** e escolha **Login with GitHub** (assim já conecta as
   duas contas automaticamente)
3. Autorize o acesso quando o GitHub perguntar

### Passo 2.2 — Criar o projeto
1. Clique em **New Project**
2. Escolha **Deploy from GitHub repo**
3. Selecione o repositório `sga-erp-backend` que você criou na Parte 1
4. O Railway vai começar a instalar e ligar o projeto sozinho (isso pode
   demorar 1-2 minutos — normal aparecer "Building..." e depois "Deploying...")

Nesse momento ele **provavelmente vai falhar** (ficar com um X vermelho) —
é esperado, porque ainda falta o banco de dados. Sem problema, siga o
próximo passo.

### Passo 2.3 — Adicionar o banco de dados
1. Dentro do seu projeto no Railway, clique em **+ New** (ou "Create")
2. Escolha **Database** → **Add PostgreSQL**
3. Vai aparecer um novo quadrado no projeto, chamado algo como "Postgres"

### Passo 2.4 — Conectar o banco ao backend
1. Clique no quadrado do seu **backend** (não no do Postgres) — geralmente
   tem o nome do seu repositório, `sga-erp-backend`
2. Clique na aba **Variables** (Variáveis)
3. Clique em **+ New Variable**
4. Ao invés de digitar um valor, procure a opção **Add Reference** (ou um
   ícone de "link"/corrente) — isso deixa você escolher uma variável que já
   existe em outro serviço do projeto
5. Selecione o serviço **Postgres** e a variável **DATABASE_URL**
6. Confirme — agora seu backend "sabe" como se conectar ao banco

### Passo 2.5 — Adicionar as outras variáveis
Ainda na aba **Variables** do seu backend, clique em **+ New Variable** três
vezes e adicione, uma de cada vez:

| Nome da variável       | Valor (exemplo — pode trocar)          |
|-------------------------|------------------------------------------|
| `JWT_SECRET`             | `um-texto-bem-longo-e-aleatorio-aqui-123456789` |
| `ADMIN_EMAIL_INICIAL`    | `seuemail@exemplo.com`                   |
| `ADMIN_SENHA_INICIAL`    | `escolha-uma-senha-forte-aqui`           |

Esse `ADMIN_EMAIL_INICIAL` e `ADMIN_SENHA_INICIAL` vão ser o seu primeiro
login no sistema — anote em algum lugar seguro.

### Passo 2.6 — Religar o serviço
1. Depois de adicionar as variáveis, clique na aba **Deployments**
2. Clique nos três pontinhos do último deploy → **Redeploy**
3. Espere ficar verde (✅ "Success" ou "Active")

O servidor, ao ligar, já cria as tabelas do banco e o seu usuário Admin
sozinho — você não precisa digitar nenhum comando.

### Passo 2.7 — Pegar o endereço público do seu sistema
1. Clique no quadrado do backend → aba **Settings**
2. Procure a seção **Networking** → **Public Networking**
3. Clique em **Generate Domain**
4. O Railway vai te dar um endereço tipo:
   `https://sga-erp-backend-production.up.railway.app`
5. **Copie esse endereço** — vamos usar no próximo passo

### Passo 2.8 — Testar se está no ar
1. Abra uma aba nova no navegador
2. Cole o endereço que copiou e adicione `/api/health` no final, tipo:
   `https://sga-erp-backend-production.up.railway.app/api/health`
3. Se aparecer na tela algo como `{"ok":true}`, **está tudo funcionando!** 🎉
   Se der erro, veja a seção "Problemas comuns" no final deste guia.

---

## PARTE 3 — Conectar seu HTML (painel) ao backend

1. Abra o arquivo `frontend-adapter/api.js` (dentro da pasta que você
   extraiu) em qualquer editor de texto simples (Bloco de Notas serve)
2. Ache a linha:
   ```
   const API_BASE_URL = 'https://SEU-BACKEND.up.railway.app/api';
   ```
3. Troque pela URL que você copiou no Passo 2.7, **adicionando `/api` no
   final**. Exemplo:
   ```
   const API_BASE_URL = 'https://sga-erp-backend-production.up.railway.app/api';
   ```
4. Salve o arquivo
5. No seu HTML do painel (`sga_dashboard_app` ou como estiver salvo), logo
   **antes** da tag `<script>` que contém todo o código do sistema, adicione:
   ```html
   <script src="api.js"></script>
   ```
6. Coloque o `api.js` na mesma pasta do seu HTML

Onde publicar esse HTML de graça, eu te ajudo no próximo passo — por
enquanto você já pode abrir o HTML localmente no navegador (duplo clique
no arquivo) pra testar o login com o e-mail/senha que você definiu no
Passo 2.5.

---

## Problemas comuns

**"Application failed to respond" ao abrir o endereço do Railway**
→ Volte na aba Deployments e clique em "View Logs". Normalmente é uma
variável de ambiente faltando (confira se `JWT_SECRET` e a referência ao
`DATABASE_URL` estão mesmo lá, na aba Variables).

**Não sei arrastar a pasta certa no GitHub**
→ Você pode também simplesmente arrastar os arquivos um por um, e depois,
já dentro do repositório, usar o botão **Add file → Create new file**,
digitar `src/nome-do-arquivo.js` (o GitHub cria a pasta `src` sozinho ao
ver a barra `/` no nome) e colar o conteúdo. Mais trabalhoso, mas funciona
se o arrastar-e-soltar não colaborar.

**Esqueci a senha do Admin**
→ No Railway, vá em Variables do backend, mude `ADMIN_SENHA_INICIAL` para
uma nova senha. Isso só cria um Admin novo se **não existir nenhum
usuário ainda** no banco — se já existe, me chame que te passo o comando
certo para resetar.

---

## O que fazer depois que tudo estiver no ar

Me avise quando conseguir ver `{"ok":true}` no Passo 2.8 — a partir daí eu
te ajudo a:
1. Testar o login de verdade
2. Publicar o HTML num endereço público (não só no seu computador)
3. Implementar as partes que ainda faltam (relatório em PDF, importação de
   Excel, alertas de vencimento)
