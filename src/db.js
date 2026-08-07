const { Pool } = require('pg');

// 🔍 Diagnóstico: mostra nos logs se a variável DATABASE_URL chegou até aqui,
// sem expor a senha. Se aparecer "NÃO DEFINIDA", o problema é 100% na
// configuração de variáveis do Railway, não no código.
if (!process.env.DATABASE_URL) {
  console.error('🚨 DATABASE_URL NÃO DEFINIDA — a variável não chegou até o servidor.');
} else {
  try {
    const url = new URL(process.env.DATABASE_URL);
    console.log(`🔍 DATABASE_URL detectada -> host: ${url.hostname} | porta: ${url.port} | banco: ${url.pathname}`);
  } catch (e) {
    console.error('🚨 DATABASE_URL está definida mas não é uma URL válida:', process.env.DATABASE_URL.slice(0, 15) + '...');
  }
}

// No Railway/Render, a variável DATABASE_URL já vem pronta quando você
// conecta um banco Postgres ao projeto. Em local, use o .env (veja .env.example).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

module.exports = pool;
