// Este arquivo só é necessário se você quiser rodar a migração manualmente
// pelo seu computador. No Railway isso NÃO é necessário: o server.js já
// aplica a migração sozinho toda vez que o servidor liga.
require('dotenv').config();
const pool = require('./db');
const { aplicarMigracoes } = require('./setup');

aplicarMigracoes()
  .then(() => pool.end())
  .catch(e => {
    console.error('Erro na migração:', e);
    process.exit(1);
  });
