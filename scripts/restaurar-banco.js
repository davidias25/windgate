/**
 * Restaura o banco central a partir de um arquivo JSON, SUBSTITUINDO o que
 * estiver gravado no Supabase Storage.
 *
 * Fica fora da API de propósito: a rota POST /api/db sempre mescla, para que
 * nenhum cliente consiga apagar os registros dos outros. Substituir é operação
 * de manutenção e exige rodar isto aqui, à mão, com o servidor parado.
 *
 *   node scripts/restaurar-banco.js backups/restaurar.json
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const dbStore = require('../src/services/db-store.service');

const origem = process.argv[2];

if (!origem) {
  console.error('Uso: node scripts/restaurar-banco.js <arquivo.json>');
  process.exit(1);
}
if (!process.env.WINDGATE_DB_SECRET) {
  console.error('WINDGATE_DB_SECRET não definido — sem ele o banco não pode ser cifrado nem lido depois.');
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(origem, 'utf8'));
const destinoLocal = path.join(__dirname, '../data/db.json');

(async () => {
  const r = await dbStore.salvar(db, destinoLocal);
  if (!r.remoto) {
    console.error('❌ Não foi possível gravar no Supabase Storage:', r.erro);
    process.exit(1);
  }
  console.log(`✅ Banco restaurado em ${dbStore.OBJETO}`);
  console.log(`   operações: ${(db.ops || []).length} · documentos: ${(db.docs || []).length} · financeiro: ${(db.fin || []).length}`);

  const conferencia = await dbStore.carregar(null);
  console.log(`   conferência (releitura da nuvem): ${(conferencia.ops || []).length} operações, ${(conferencia.docs || []).length} documentos`);
})();
