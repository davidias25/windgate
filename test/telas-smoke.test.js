/**
 * Telas do Hub sem navegador: monta cada tela com um banco de exemplo num DOM mínimo e confere que nada quebra.
 * O DOM é falso de propósito: querySelector('#x') só devolve elemento se o HTML gerado tem id="x"
 * (igual ao navegador, que devolve null), e querySelectorAll('[data-x]') devolve um por ocorrência.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const JS = path.join(__dirname, '../public/hub/js');

function elemento(html, pai) {
  const el = { _html: html || '', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, value: '', checked: false, isConnected: true,
    set innerHTML(v) { this._html = String(v); if (pai) pai._html += String(v); }, get innerHTML() { return this._html; },
    insertAdjacentHTML(p, v) { this._html += String(v); if (pai) pai._html += String(v); }, appendChild(c) { return c; }, remove() {}, focus() {}, select() {}, setAttribute() {}, addEventListener() {}, closest() { return elemento(''); },
    querySelector(sel) {
      const id = /^#([\w-]+)$/.exec(sel); if (id) return this._html.includes(`id="${id[1]}"`) ? elemento('', this) : null;
      const at = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(sel); if (at) return this._html.includes(at[2] != null ? `${at[1]}="${at[2]}"` : at[1]) ? elemento('') : null;
      return elemento('');
    },
    querySelectorAll(sel) {
      const at = /^(?:[\w]+)?\[([\w-]+)(?:="([^"]*)")?\]$/.exec(sel) || /^tr\[([\w-]+)\]$/.exec(sel);
      const alvo = at ? (at[2] != null ? `${at[1]}="${at[2]}"` : at[1] + '="') : null;
      if (!alvo) return [];
      const n = this._html.split(alvo).length - 1;
      return Array.from({ length: n }, () => { const e = elemento(''); e.dataset = new Proxy({}, { get: () => 'X|k|' }); return e; });
    } };
  return el;
}

function carregar(arquivos, db, usuario) {
  const toasts = [];
  const ctx = { console, Date, Math, JSON, Intl, setTimeout: () => 0, clearTimeout() {}, Promise, URL, Blob: function () {}, location: { hostname: 'localhost' },
    document: { createElement: () => elemento(''), querySelector: () => elemento(''), body: elemento(''), activeElement: null, addEventListener() {} },
    navigator: { clipboard: { writeText: async () => {} } }, localStorage: { getItem: () => null, setItem() {} }, fetch: async () => ({ ok: false, json: async () => ({}) }) };
  ctx.window = ctx; ctx.self = ctx; vm.createContext(ctx);
  ['regras.js', 'comex.js', 'cotacao-regras.js', 'cambio-regras.js', 'contrato-regras.js', 'fin-regras.js', 'agenda-regras.js', 'tarefas-auto.js', 'equipe-regras.js', 'torre-regras.js'].forEach(f => {
    const p = path.join(JS, f); if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
  });
  const W = ctx.WG; W.prepararBanco && W.prepararBanco(db);
  const H = { W, db, userKey: usuario || 'samir', telas: {}, estado: {}, user: {}, esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
    toast: m => toasts.push(m), render() {}, ir() {}, salvar() { return true; }, modal: () => elemento('<div id="x"></div>'), fecharModal() {}, nomeUsuario: k => k, ptax: { venda: 5.4 },
    pillStatus: k => `<span class="pill">${k}</span>`, api: async () => ({ ok: false, json: async () => ({}) }) };
  H.pode = cap => !!W.pode(db, H.userKey, cap); H.podeFin = () => H.pode('fin.ver'); H.aprova = () => H.pode('fin.autorizar'); H.perfil = () => W.perfilDe(db, H.userKey);
  ctx.HUB = H;
  arquivos.forEach(f => vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }));
  return { H, W, toasts };
}

function banco() {
  const L = (id, op, tipo, valor, venc, real, extra) => Object.assign({ _id: id, op, tipo, valor, vencimento: venc, status: real ? 'Realizado' : 'Previsto', liquidadoEm: real ? venc : undefined, empresa: 'WindGate', desc: tipo + ' ' + op }, extra || {});
  return { users: { samir: { nome: 'Samir', perfil: 'diretoria' }, davi: { nome: 'Davi', perfil: 'financeiro' }, ivina: { nome: 'Ívina', perfil: 'documentacao' }, matheus: { nome: 'Matheus', perfil: 'frete' } },
    ops: [{ id: 'OP26', papel: 'mae', status: 'preparacao_embarque', eta: '2027-01-09' }, { id: 'OP26.1', maeId: 'OP26', cliente: 'Diagonal', status: 'preparacao_embarque', resp: 'Davi' },
      { id: 'OP26.2', maeId: 'OP26', cliente: 'Neto', status: 'preparacao_embarque', resp: 'Davi' }, { id: 'OP23', cliente: 'Ernanes', status: 'transito', eta: '2026-11-29', resp: 'Davi' }],
    fin: [L('a', 'OP26.1', 'Receita', 80000, '2026-10-01', true), L('b', 'OP26.1', 'Receita', 366974, '2026-11-16', false), L('c', 'OP26.1', 'Despesa', 49212, '2026-10-05', true),
      L('d', 'OP26.1', 'Despesa', 133914.73, '2026-11-12', false, { desc: 'Saldo da fábrica' }), L('e', 'OP23', 'Receita', 9000, '2026-11-20', false), L('f', '', 'Despesa', 12000, '2026-11-25', false, { desc: 'Aluguel', fixo: true })],
    hubExtratos: [{ _id: 'x1', contaId: 'sf', empresa: 'WindGate', banco: 'Santander', mes: '2026-11', saldo: 43000, em: '2026-11-17T10:00:00Z' }],
    opStatusHist: [], quotes: {}, qindex: [], hubPainel: {}, settings: {}, docs: [], checklists: {}, agendaTasks: [], hubRecados: [], crmOps: [], hubCambio: [], hubPonto: [] };
}

console.log('\nFinanceiro em 3 telas:');
{
  const { H, toasts } = carregar(['financeiro.js'], banco());
  ['carteira', 'caixa', 'indicadores'].forEach(aba => {
    const el = elemento('');
    let erro = null; try { H.telas.financeiro(el, aba); } catch (e) { erro = e; }
    ok(!erro && el.innerHTML.length > 500, `aba ${aba} monta sem erro` + (erro ? ' — ' + erro.stack.split('\n').slice(0, 3).join(' | ') : ''));
  });
  const el = elemento(''); H.telas.financeiro(el, 'carteira');
  ok(/OP26/.test(el.innerHTML) && !/OP26\.1<\/b> · Diagonal<\/td>/.test(el.innerHTML), 'Carteira: OP26 numa linha, filhas recolhidas');
  ok(!toasts.length, 'sem avisos de erro');
}

console.log('\nTorres por função:');
{
  ['samir', 'davi', 'ivina', 'matheus'].forEach(u => {
    const { H } = carregar(['torre.js'], banco(), u);
    const el = elemento('');
    let erro = null; try { H.telas.torre(el); } catch (e) { erro = e; }
    ok(!erro && /Torre de Controle/.test(el.innerHTML) && (el.innerHTML.match(/class="kpi"/g) || []).length === 6, `${u}: Torre monta com 6 cartões` + (erro ? ' — ' + erro.stack.split('\n').slice(0, 3).join(' | ') : ''));
    if (u === 'ivina') ok(!/R\$/.test(el.innerHTML.replace(/Clientes e cobranças[\s\S]*?<\/section>/, '')), 'Ívina: nenhum valor em R$ fora das cobranças de cliente');
    if (u === 'samir') ok(/saldo à fábrica vencido/.test(el.innerHTML) && /133/.test(el.innerHTML), 'Samir: saldo à fábrica da OP26.1 no Travando');
  });
}
module.exports = { carregar, banco, elemento };
if (require.main === module) { console.log(`\n${passou} verificações passaram, ${falhou} falharam.`); process.exitCode = falhou ? 1 : 0; }
