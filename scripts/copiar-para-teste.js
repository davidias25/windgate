/**
 * Copia o banco de PRODUÇÃO para um objeto de TESTE, sem alterar a produção.
 *
 *   WINDGATE_DB_OBJECT_TESTE=sistema/db-teste.enc node scripts/copiar-para-teste.js
 *
 * O ambiente de teste (outro serviço no Render) deve rodar com:
 *   WINDGATE_DB_OBJECT=sistema/db-teste.enc
 *   WINDGATE_HISTORICO_PASTA=sistema/historico-teste
 * Assim, tudo o que for clicado no teste grava no objeto de teste — nunca no
 * banco real. Este script só LÊ `sistema/db.enc` e escreve no objeto de teste.
 */
require('dotenv').config();
const PRODUCAO = 'sistema/db.enc';
const TESTE = process.env.WINDGATE_DB_OBJECT_TESTE || 'sistema/db-teste.enc';

if (TESTE === PRODUCAO) {
  console.error('❌ O objeto de teste não pode ser o mesmo da produção.');
  process.exit(1);
}
if (!process.env.WINDGATE_DB_SECRET) {
  console.error('❌ WINDGATE_DB_SECRET não definido.');
  process.exit(1);
}

const { baixarArquivo, enviarArquivo } = require('../src/integrations/supabase.service');
const dbStore = require('../src/services/db-store.service');
const { contarRegistros } = require('../src/services/historico.service');

(async () => {
  const buf = await baixarArquivo(PRODUCAO);
  if (!buf) { console.error('❌ Banco de produção não encontrado.'); process.exit(1); }
  const db = JSON.parse(dbStore.decifrar(buf, dbStore.chaveDeCifra()));
  await enviarArquivo(TESTE, buf, 'application/octet-stream');
  console.log(`✅ Cópia feita: ${PRODUCAO} → ${TESTE} (produção não foi alterada)`);
  console.log(contarRegistros(db));
})().catch(e => { console.error('❌', e.message); process.exit(1); });
