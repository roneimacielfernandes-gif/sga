const { Pool } = require('pg');

// No Railway/Render, a variável DATABASE_URL já vem pronta quando você
// conecta um banco Postgres ao projeto. Em local, use o .env (veja .env.example).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

module.exports = pool;
