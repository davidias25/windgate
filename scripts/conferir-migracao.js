/**
 * Confere se uma migração preservou TODOS os registros.
 *
 *   node scripts/conferir-migracao.js backup-antes.json banco-depois.json
 *
 * Os dois arquivos são exportações completas (Config → Backup & dados, ou a
 * fotografia do histórico já decifrada). Sai com código 1 se faltar qualquer
 * registro — nenhuma versão nova vai ao ar sem esta conferência passar.
 */
const fs = require('fs');
const { compararBancos } = require('../src/services/historico.service');

const [antesArq, depoisArq] = process.argv.slice(2);
if (!antesArq || !depoisArq) {
  console.error('Uso: node scripts/conferir-migracao.js <antes.json> <depois.json>');
  process.exit(2);
}

const ler = f => {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  return j && j.db && typeof j.db === 'object' && !Array.isArray(j.db) ? j.db : j;
};

const r = compararBancos(ler(antesArq), ler(depoisArq));
console.log('Coleção'.padEnd(18) + 'Antes'.padStart(8) + 'Depois'.padStart(8) + 'Faltando'.padStart(10));
r.resumo.forEach(l => console.log(
  l.colecao.padEnd(18) + String(l.antes).padStart(8) + String(l.depois).padStart(8) +
  String(l.faltando).padStart(10) + (l.faltando ? '   ❌' : '')));

if (r.ok) {
  console.log('\n✅ Nenhum registro perdido.');
} else {
  console.log(`\n❌ ${r.perdas.length} registro(s) faltando:`);
  r.perdas.slice(0, 50).forEach(p => console.log(`   ${p.colecao}: ${p.id}`));
  process.exit(1);
}
