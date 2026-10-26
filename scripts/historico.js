/**
 * Lista e baixa as fotografias do histórico do banco central.
 *
 *   node scripts/historico.js listar
 *   node scripts/historico.js baixar sistema/historico/dia-2026-10-25.enc saida.json
 *
 * Baixar NÃO restaura nada: só decifra a fotografia para um arquivo. Para
 * colocar de volta no ar, confira com scripts/conferir-migracao.js e só
 * então use scripts/restaurar-banco.js, com o servidor parado.
 */
require('dotenv').config();
const fs = require('fs');
const { listarArquivos } = require('../src/integrations/supabase.service');
const dbStore = require('../src/services/db-store.service');
const { PASTA, contarRegistros } = require('../src/services/historico.service');

(async () => {
  const [cmd, caminho, saida] = process.argv.slice(2);
  if (cmd === 'listar') {
    const { arquivos, erro } = await listarArquivos(PASTA);
    if (erro) { console.error('❌', erro); process.exit(1); }
    arquivos.sort((a, b) => a.nomeArquivo.localeCompare(b.nomeArquivo))
      .forEach(a => console.log(`${a.path}  ${(a.tamanho / 1024).toFixed(0)} KB`));
    console.log(`\n${arquivos.length} fotografia(s).`);
  } else if (cmd === 'baixar' && caminho && saida) {
    const db = await dbStore.lerFotografia(caminho);
    if (!db) { console.error('❌ Fotografia não encontrada.'); process.exit(1); }
    fs.writeFileSync(saida, JSON.stringify(db, null, 2));
    console.log(`✅ ${caminho} → ${saida}`);
    console.log(contarRegistros(db));
  } else {
    console.error('Uso: node scripts/historico.js listar | baixar <caminho> <saida.json>');
    process.exit(2);
  }
})();
