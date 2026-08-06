const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('./db');

async function aplicarMigracoes() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('Aplicando schema no banco...');
  await pool.query(sql);
  console.log('✅ Tabelas criadas/atualizadas com sucesso.');

  // Cria o primeiro usuário Admin, se ainda não existir nenhum usuário no banco
  const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM usuarios');
  if (rows[0].total === 0) {
    const senhaInicial = process.env.ADMIN_SENHA_INICIAL || 'troque-esta-senha-123';
    const emailInicial = process.env.ADMIN_EMAIL_INICIAL || 'admin@norteagro.com';
    const hash = await bcrypt.hash(senhaInicial, 10);
    await pool.query(
      'INSERT INTO usuarios (email, nome, nivel, senha_hash) VALUES ($1, $2, $3, $4)',
      [emailInicial, 'Administrador', 'Admin', hash]
    );
    console.log(`✅ Usuário Admin criado: ${emailInicial} / senha: ${senhaInicial}`);
    console.log('⚠️  Troque essa senha assim que fizer o primeiro login!');
  }
}

module.exports = { aplicarMigracoes };
