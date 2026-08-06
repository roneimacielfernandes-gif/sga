require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { aplicarMigracoes } = require('./setup');

const authRoutes = require('./routes/auth');
const recordsRoutes = require('./routes/records');
const biRoutes = require('./routes/bi');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' })); // 5mb pra aguentar a importação de Excel em lote

app.use('/api/auth', authRoutes);
app.use('/api/records', recordsRoutes);
app.use('/api/bi', biRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORTA = process.env.PORT || 3000;

// Antes de aceitar qualquer pedido, garante que as tabelas existem no banco
// e que o usuário Admin inicial foi criado. Assim você nunca precisa abrir
// um terminal pra fazer isso manualmente — só ligar o servidor já resolve.
aplicarMigracoes()
  .then(() => {
    app.listen(PORTA, () => console.log(`✅ SGA Norte Agro backend rodando na porta ${PORTA}`));
  })
  .catch(e => {
    console.error('❌ Erro ao preparar o banco de dados:', e);
    process.exit(1);
  });
