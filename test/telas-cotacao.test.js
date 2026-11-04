/**
 * Tela de cotações monta sem erro (lista, aprovada, rascunho e nova), com um DOM de mentira.
 * Pega erro de variável fora de escopo, como o "bloq is not defined" que travou a abertura das cotações.
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const raiz = path.join(__dirname, '..');
const no = () => new Proxy(function () {}, {
  get(t, k) {
    if (k === 'querySelectorAll') return () => [];
    if (k === 'querySelector' || k === 'closest' || k === 'getElementById') return () => no();
    if (k === 'addEventListener' || k === 'appendChild' || k === 'remove' || k === 'focus' || k === 'setSelectionRange' || k === 'click') return () => {};
    if (k === 'classList') return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    if (k === 'contains') return () => true;
    if (k === 'dataset' || k === 'style') return {};
    if (k === 'value' || k === 'textContent' || k === 'innerHTML') return t[k] || '';
    if (k === Symbol.toPrimitive) return () => '';
    return t[k];
  },
  set(t, k, v) { t[k] = v; return true; }
});
const W = Object.assign({}, require(path.join(raiz, 'public/hub/js/regras.js')), require(path.join(raiz, 'public/hub/js/cotacao-regras.js')));
const erros = [];
const H = { W, telas: {}, estado: { param: null, tela: 'cotacoes' }, db: null, userKey: 'samir', user: { aprova: true },
  esc: s => String(s == null ? '' : s), nomeUsuario: k => k, pode: () => true, toast: m => {}, render() {}, salvar() {}, ir() {}, modal: () => no(), fecharModal() {},
  api: async () => ({ json: async () => ({}) }), ptax: { compra: 5.4772, venda: 5.4778, em: '2026-11-04 13:05' }, carregarPtax: () => Promise.resolve(H.ptax) };
const ctx = { window: { HUB: H, WG: W }, document: { activeElement: null, getElementById: () => no(), createElement: () => no(), body: no() }, console, setTimeout, clearTimeout, URL, Promise };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(raiz, 'public/hub/js/cotacoes.js'), 'utf8'), ctx);
const base = { fields: Object.assign({}, W.PADRAO, { opNum: 'OP90', cliente: 'Lima' }), items: [W.ITEM_PADRAO()], exps: [], fotos: [], blocos: {}, status: 'ok', aprovadoPor: 'samir', id: 'q1' };
H.db = { quotes: { q1: base, q2: Object.assign({}, base, { id: 'q2', status: 'draft' }) }, qindex: [{ _id: 'i1', id: 'q1', status: 'ok' }, { _id: 'i2', id: 'q2', status: 'draft' }], crm: [], crmOps: [], ops: [], fin: [], users: {}, hubRecados: [] };
for (const p of [null, 'q1', 'q2', 'nova']) {
  try { H.telas.cotacoes(no(), p); console.log('  ✅ tela monta: ' + (p || 'lista')); } catch (e) { erros.push(p + ': ' + e.message); console.error('  ❌ tela ' + (p || 'lista') + ': ' + e.message); }
}
console.log(`
${4 - erros.length} verificações passaram, ${erros.length} falharam.`);
process.exit(erros.length ? 1 : 0);
