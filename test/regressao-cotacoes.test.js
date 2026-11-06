/**
 * Regressão das cotações: o resultado de hoje não pode mudar em nenhum centavo.
 *
 * Compara com duas fotos tiradas ANTES da cotação com vários clientes:
 *   - test/fixtures/cotacoes-golden.json: 200 cotações geradas (sem dado real; vai no repositório);
 *   - backups/foto-cotacoes.json: as cotações reais do backup local (fora do repositório, que é
 *     público). Sem esse arquivo, a parte real é pulada e o teste avisa.
 *
 * Refazer as fotos: node test/regressao-cotacoes.test.js --gravar
 * Só faça isso com o cálculo intacto: a foto é a referência do que está certo.
 */
process.env.SUPABASE_DISABLED = '1';
const fs = require('fs'), path = require('path');
const C = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/cotacao-regras.js'));
const RAIZ = path.join(__dirname, '..');
const GOLDEN = path.join(__dirname, 'fixtures', 'cotacoes-golden.json');
const FOTO = path.join(RAIZ, 'backups', 'foto-cotacoes.json');
const BACKUPS = ['backups/antes-hub-2.0-2026-10-26-18-27.json', '.diag/db.json', 'data/db.json'];
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };

let semente = 20261105;
const rnd = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
const entre = (a, b, casas) => +(a + rnd() * (b - a)).toFixed(casas == null ? 2 : casas);
const UFS = Object.keys(C.ICMS_INTERNO).concat([C.SEM_DIFAL]);
function gerada(i) {
  const tri = i % 2 === 1, n = 1 + Math.floor(rnd() * 5);
  return { id: 'g' + i, status: 'draft',
    items: Array.from({ length: n }, (_, k) => ({ d: 'Item ' + k, ncm: '84271019', q: 1 + Math.floor(rnd() * 20), u: entre(50, 9000), p: rnd() < 0.2 ? 0 : entre(5, 3000), ii: entre(0, 20, 1), ipi: entre(0, 10, 2), pis: 2.1, cofins: 9.65, c5291: rnd() < 0.2, mono: rnd() < 0.1 })),
    exps: [{ l: 'Scanner', v: entre(0, 900) }, { l: 'THC', v: entre(0, 2000) }],
    fields: { tipoOp: tri ? 'triangular' : 'direta', ufDestino: UFS[Math.floor(rnd() * UFS.length)], txDesp: String(entre(4.9, 6, 4)), txFrete: String(entre(5, 6.2, 4)), pctInv: String(entre(60, 100, 0)), icmsEnt: '1.6', icmsDest: '4', pisS: '1.65', cofS: '7.6', ipiS: String(entre(0, 5, 1)), mkp: '1', mkSF: '2000', mkJT: '1000', outrasAdu: String(entre(0, 2000)), aliqST: String(entre(0, 18, 1)),
      freteUSD: String(entre(0, 9000)), seguro: String(entre(0, 2000)), capatazia: String(entre(0, 3000)), transporte: String(entre(0, 15000)), siscomex: '416.46', afrmm: String(entre(0, 2000)), honorarios: '1630', margemPct: String(entre(0, 40, 1)), margemBRL: '0' } };
}
/* Tudo o que sai da cotação e vai para a tela, a proposta, o desembolso e o custeio. */
const CHAVES = ['custoReal', 'preco', 'st', 'margem', 'fob', 'compra', 'impostos', 'despesas', 'resultante', 'nfSaida', 'chTot', 'margemPctCampo', 'margemBRLCampo', '__ii', '__ipi', '__pis', '__cof', '__icms'];
const n6 = v => (v == null ? null : +(+v).toFixed(6));
function resultado(q) {
  const R = C.calcular(q), out = {};
  CHAVES.forEach(k => { out[k] = n6(R[k]); });
  if (R.tri) { out.triCusto = n6(R.tri.custoGrupo); out.triNfSF = n6(R.tri.nfSF); out.triNfJT = n6(R.tri.nfJT); out.triDifal = n6(R.tri.difal); }
  const d = C.desemOuts(q, R); out.o1 = n6(d.o1); out.o2 = n6(d.o2); out.o3 = n6(d.o3);
  return out;
}
function cotacoesReais() {
  const out = {};
  BACKUPS.forEach(b => { const p = path.join(RAIZ, b); if (!fs.existsSync(p)) return;
    let j; try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return; }
    Object.entries((j && j.quotes) || {}).forEach(([id, q]) => { if (q && q.fields) out[b + '#' + id] = Object.assign({ id }, q); }); });
  return out;
}
const geradas = Array.from({ length: 200 }, (_, i) => gerada(i));

if (process.argv.includes('--gravar')) {
  fs.writeFileSync(GOLDEN, JSON.stringify(geradas.map(q => [q.id, resultado(q)])));
  const reais = cotacoesReais(), foto = {};
  Object.entries(reais).forEach(([k, q]) => { foto[k] = resultado(q); });
  if (fs.existsSync(path.dirname(FOTO))) fs.writeFileSync(FOTO, JSON.stringify(foto));
  console.log(`Fotos gravadas: ${geradas.length} geradas, ${Object.keys(foto).length} reais.`);
  process.exit(0);
}

const iguais = (a, b) => JSON.stringify(a) === JSON.stringify(b);
console.log('\nRegressão das cotações:');
const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
const dif = golden.filter(([id, r], i) => !iguais(resultado(geradas[i]), r)).map(x => x[0]);
ok(golden.length === 200 && !dif.length, '200 cotações geradas (direta e triangular): nenhum número mudou' + (dif.length ? ' — mudou: ' + dif.slice(0, 5).join() : ''));

if (fs.existsSync(FOTO)) {
  const foto = JSON.parse(fs.readFileSync(FOTO, 'utf8')), reais = cotacoesReais();
  const chaves = Object.keys(foto).filter(k => reais[k]);
  const mudou = chaves.filter(k => !iguais(resultado(reais[k]), foto[k]));
  ok(chaves.length > 0 && !mudou.length, `${chaves.length} cotações reais do backup local: nenhum número mudou` + (mudou.length ? ' — mudou: ' + mudou.length : ''));
  // Margem do Custeio igual à do motor, nas cotações reais do backup local (que não vão para o repositório).
  const CX = require('../public/hub/js/comex.js'), MOT = require('../public/hub/js/cotacao-regras.js');
  let dif = 0, n = 0;
  chaves.forEach(k => { const q = reais[k], R0 = MOT.calcular(q); if (!(R0.preco > 0) || !(q.items || []).length) return; n++; const c = CX.custoCotacao(q); if (Math.abs((R0.preco - c.total) / R0.preco - R0.margem / R0.preco) > 0.0005) dif++; });
  ok(n > 0 && dif === 0, `margem do Custeio igual à do motor em ${n} cotações reais (${dif} diferentes)`);
} else console.log('  ⚠️  sem backups/foto-cotacoes.json nesta máquina: a parte com cotações reais foi pulada.');

console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
process.exit(falhou ? 1 : 0);
