/**
 * Conferência: nada pode ter sumido.
 *
 * Compara dois bancos — o de antes e o de depois de uma migração, de um deploy
 * ou de um dia de uso — e lista registro a registro o que existia e não existe
 * mais. Contagem igual não basta: um documento a menos e outro a mais fecham a
 * conta e escondem a perda.
 *
 *   npm run conferir:migracao -- antes.json depois.json
 *   npm run conferir:migracao -- antes.json            (compara com a produção)
 *
 * Sai com código 1 quando houver perda, para dar para usar em automação.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const historico = require('../src/services/historico.service');

const f = v => (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function ler(ref, rotulo) {
  if (!ref) {
    const dbStore = require('../src/services/db-store.service');
    const db = await dbStore.carregar(path.join(__dirname, '../data/db.json'));
    if (!db) { console.error(`❌ Não consegui carregar o banco atual para "${rotulo}".`); process.exit(1); }
    console.log(`  ${rotulo}: banco de produção (${dbStore.OBJETO})`);
    return db;
  }
  if (!fs.existsSync(ref)) { console.error(`❌ Arquivo não encontrado: ${ref}`); process.exit(1); }
  console.log(`  ${rotulo}: ${ref}`);
  const j = JSON.parse(fs.readFileSync(ref, 'utf8'));
  // O backup exportado pela tela embrulha o banco em { db: ... }.
  return j && j.db && typeof j.db === 'object' ? j.db : j;
}

(async () => {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (!args.length) {
    console.error('Uso: npm run conferir:migracao -- antes.json [depois.json]');
    console.error('     Sem o segundo arquivo, compara com o banco de produção.');
    process.exit(1);
  }

  console.log('\n═══ CONFERÊNCIA DE MIGRAÇÃO ═══');
  const antes = await ler(args[0], 'antes ');
  const depois = await ler(args[1], 'depois');

  const r = historico.conferir(antes, depois);

  console.log('\n  coleção          antes   depois   diferença');
  console.log('  ---------------- ------- -------- ----------');
  historico.COLECOES.forEach(k => {
    const a = r.contagem.antes[k], d = r.contagem.depois[k];
    if (a === undefined && d === undefined) return;
    const dif = (d || 0) - (a || 0);
    console.log(`  ${k.padEnd(16)} ${String(a == null ? '—' : a).padStart(7)} ${String(d == null ? '—' : d).padStart(8)} ${(dif > 0 ? '+' + dif : String(dif)).padStart(10)}`
      + (dif < 0 ? '  ⚠' : ''));
  });

  if (r.ok) {
    console.log('\n✅ Nenhum registro perdido.');
    console.log('   (Registros a mais são normais: é o uso do sistema entre os dois momentos.)\n');
    process.exit(0);
  }

  console.log(`\n❌ ${r.total} REGISTRO(S) SUMIRAM:\n`);
  Object.entries(r.faltando).forEach(([col, itens]) => {
    console.log(`  ${col} — ${itens.length}`);
    itens.slice(0, 40).forEach(i =>
      console.log(`     · ${String(i._id).slice(0, 10).padEnd(12)} ${String(i.rotulo).slice(0, 52).padEnd(54)}`
        + (i.valor != null ? 'R$ ' + f(i.valor) : '')));
    if (itens.length > 40) console.log(`     … e mais ${itens.length - 40}`);
    console.log('');
  });
  console.log('Para recuperar: npm run historico -- listar\n');
  process.exit(1);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
