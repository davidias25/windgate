/**
 * Tela de cotações monta sem erro (lista, aprovada, rascunho e nova), com um DOM de mentira.
 * Pega erro de variável fora de escopo, como o "bloq is not defined" que travou a abertura das cotações.
 * Confere também a tela com vários clientes: a flag, os blocos por cliente e a digitação.
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const raiz = path.join(__dirname, '..');
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };

/* Nó de mentira: o mesmo seletor devolve o mesmo nó, para ler o que a tela escreveu nele. */
function criarNo() {
  const nos = {}, ouvintes = {};
  return new Proxy(function () {}, {
    get(t, k) {
      if (k === 'querySelectorAll') return () => [];
      if (k === 'querySelector' || k === 'closest' || k === 'getElementById') return s => (nos[s] = nos[s] || criarNo());
      if (k === 'addEventListener') return (ev, fn) => { (ouvintes[ev] = ouvintes[ev] || []).push(fn); };
      if (k === 'disparar') return (ev, e) => (ouvintes[ev] || []).forEach(fn => fn(e));
      if (k === 'appendChild' || k === 'remove' || k === 'focus' || k === 'setSelectionRange' || k === 'click') return () => {};
      if (k === 'classList') return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
      if (k === 'contains') return () => true;
      if (k === 'dataset' || k === 'style') return {};
      if (k === 'value' || k === 'textContent' || k === 'innerHTML') return t[k] || '';
      if (k === Symbol.toPrimitive) return () => '';
      return t[k];
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}
const W = Object.assign({}, require(path.join(raiz, 'public/hub/js/regras.js')), require(path.join(raiz, 'public/hub/js/cotacao-regras.js')));
const H = { W, telas: {}, estado: { param: null, tela: 'cotacoes' }, db: null, userKey: 'samir', user: { aprova: true },
  esc: s => String(s == null ? '' : s), nomeUsuario: k => k, pode: () => true, toast: () => {}, render() {}, salvar() {}, ir() {}, modal: () => criarNo(), fecharModal() {},
  api: async () => ({ json: async () => ({}) }), ptax: { compra: 5.4772, venda: 5.4778, em: '2026-11-04 13:05' }, carregarPtax: () => Promise.resolve(H.ptax) };
const ctx = { window: { HUB: H, WG: W }, document: { activeElement: null, getElementById: () => criarNo(), createElement: () => criarNo(), body: criarNo() }, console, setTimeout, clearTimeout, URL, Promise };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(raiz, 'public/hub/js/cotacoes.js'), 'utf8'), ctx);

const base = { fields: Object.assign({}, W.PADRAO, { opNum: 'OP90', cliente: 'Lima' }), items: [W.ITEM_PADRAO()], exps: [], fotos: [], blocos: {}, status: 'ok', aprovadoPor: 'samir', id: 'q1' };
const item = (clienteId, q, u, cbm) => Object.assign(W.ITEM_PADRAO(), { d: 'Item ' + clienteId, q, u, p: 100, cbm, clienteId });
const multi = { id: 'q3', status: 'draft', fields: Object.assign({}, W.PADRAO, { cliente: 'Márcio + Bruno', txDesp: '5.5', freteUSD: '1000' }), exps: [], fotos: [], blocos: {}, items: [item('c1', 2, 1000, 10), item('c2', 1, 1000, 5)],
  regraRateio: Object.assign({}, W.RATEIO_PADRAO, { percentuais: {} }),
  clientes: [{ id: 'c1', nome: 'Márcio', ufDestino: 'RN', tipoOperacao: 'direta', margemPct: '25', aliqST: '16', opNum: 'OP91', mercadoria: 'Escoras', margemModo: 'pct' }, { id: 'c2', nome: 'Bruno', ufDestino: 'CE', tipoOperacao: 'direta', margemPct: '30', aliqST: '16', opNum: 'OP92', mercadoria: 'Betoneiras', margemModo: 'pct' }] };
const banco = flag => ({ quotes: { q1: base, q2: Object.assign({}, base, { id: 'q2', status: 'draft' }), q3: JSON.parse(JSON.stringify(multi)) },
  qindex: [{ _id: 'i1', id: 'q1', status: 'ok' }, { _id: 'i2', id: 'q2', status: 'draft' }, { _id: 'i3', id: 'q3', status: 'draft' }], crm: [], crmOps: [], ops: [], fin: [], users: {}, hubRecados: [], hubPainel: { _flags: { multiCliente: flag } } });
const abrir = (p, flag) => { H.db = banco(flag); H.telas.cotacoes(criarNo(), null); const el = criarNo(); H.telas.cotacoes(el, p); return el; };

console.log('\nTela de cotações:');
for (const p of [null, 'q1', 'q2', 'nova', 'q3']) {
  for (const flag of [false, true]) {
    try { abrir(p, flag); ok(true, `monta: ${p || 'lista'}, função ${flag ? 'ligada' : 'desligada'}`); } catch (e) { ok(false, `${p || 'lista'}, função ${flag ? 'ligada' : 'desligada'}: ${e.message}`); }
  }
}

console.log('\nFunção desligada:');
{
  const html = abrir('q2', false).innerHTML;
  ok(!html.includes('Clientes deste contêiner') && !html.includes('CBM') && !html.includes('Rateio dos custos'), 'cotação de 1 cliente não mostra nada novo');
  const m = abrir('q3', false).innerHTML;
  ok(m.includes('somente leitura') && m.includes('<fieldset id="cform" disabled') && !m.includes('id="csalva"'), 'cotação com vários clientes abre só para leitura, sem Salvar');
}

console.log('\nFunção ligada:');
{
  const q2 = abrir('q2', true).innerHTML;
  ok(q2.includes('id="cladd"') && !q2.includes('Rateio dos custos'), 'rascunho de 1 cliente oferece adicionar outro');
  ok(!abrir('q1', true).innerHTML.includes('id="cladd"'), 'cotação aprovada não vira de vários clientes');
  const el = abrir('q3', true), h = el.innerHTML;
  ok(h.includes('Márcio') && h.includes('Bruno') && h.includes('Rateio dos custos comuns') && h.includes('CBM (m³)') && h.includes('Cronograma de desembolso por cliente'), 'mostra clientes, CBM, rateio e cronograma por cliente');
  ok(!h.includes('id="cf_cliente"') && !h.includes('id="cf_margemPct"') && !h.includes('id="cenvia"'), 'sem os campos de um cliente só e sem Enviar para aprovação');
  const resumo = el.querySelector('#cresumo').innerHTML;
  ok(resumo.includes('Márcio') && resumo.includes('Bruno') && resumo.includes('Total'), 'resumo com uma linha por cliente e o total');
  ok(el.querySelector('#crv_frete').textContent.includes('Márcio:'), 'o rateio mostra quanto fica com cada cliente');

  const form = el.querySelector('#cform');
  const digita = (dataset, value) => form.disparar('input', { target: { dataset, value, type: 'text' } });
  const antes = el.querySelector('#cresumo').innerHTML;
  digita({ cli: 'c2', cc: 'margemPct' }, '40');
  ok(el.querySelector('#cresumo').innerHTML !== antes, 'digitar a margem de um cliente recalcula');
  digita({ cli: 'c2', cc: 'margemRS' }, '5000');
  ok(el.querySelector('#ccl_c2_margemPct').value !== '', 'margem em reais atualiza o percentual');
  digita({ cli: 'c2', cc: 'ufDestino' }, 'SP');
  ok(el.querySelector('#ccl_c2_aliqST').value === '14', 'trocar a UF sugere a alíquota: 18% − 4%');
  digita({ it: '0', c: 'clienteId' }, '');
  ok(el.querySelector('#cravisos').innerHTML.includes('sem cliente'), 'item sem dono mostra o erro');
}

console.log('\nRelançar no Financeiro:');
{
  let modal = null, corpo = '', toast = ''; const m0 = H.modal, t0 = H.toast;
  H.modal = (t, b) => { corpo = b; return (modal = criarNo()); }; H.toast = m => { toast = m; };
  const el = abrir('q1', false);
  H.db.checklists = {}; H.db.opStatusHist = [];
  const marca = 'cotacao:q1';
  H.db.ops = [{ id: 'OP90', quoteId: 'q1' }];
  H.db.fin = [{ _id: 'a', origem: marca, op: 'OP90', tipo: 'Receita', desc: '1º recebimento do cliente — parcela 1', data: '2026-10-01', valor: 10, status: 'Realizado' }];
  el.querySelector('#cop').onclick();
  ok(modal && H.db.fin.length === 1, 'parte excluída: pergunta antes e ainda não lança nada');
  ok(corpo.includes('3º pagamento') && !corpo.includes('1º recebimento') && corpo.includes('1 lançamento(s)'), 'a janela lista o que falta e diz quantos ficam como estão');
  modal.querySelector('#rlok').onclick();
  ok(H.db.fin.length > 1 && H.db.fin.filter(l => /^1º recebimento/.test(l.desc)).length === 1 && /relançado/.test(toast), 'confirmando, lança o que falta e não duplica o que ficou');
  const n = H.db.fin.length; modal = null;
  el.querySelector('#cop').onclick();
  ok(H.db.fin.length === n && /Nada foi duplicado/.test(corpo) && corpo.includes('OP90') && !corpo.includes('Relançar'), 'clicar de novo não lança nada e mostra onde estão os lançamentos');
  /* Cotação reaproveitada: os lançamentos estão em outro número. */
  H.db.fin = [{ _id: 'b', origem: marca, op: 'OP89', tipo: 'Receita', desc: '1º recebimento do cliente — parcela 1', data: '2026-10-01', valor: 10, status: 'Previsto', vencimento: '2026-10-06' }];
  modal = null;
  el.querySelector('#cop').onclick();
  ok(modal && H.db.fin.length === 1 && corpo.includes('OP89') && corpo.includes('duplicaria'), 'lançamentos em outra operação: mostra e pergunta antes');
  modal.querySelector('#rlok').onclick();
  ok(H.db.fin.filter(l => l.op === 'OP90').length > 0 && H.db.fin.some(l => l._id === 'b'), 'confirmando, lança na operação certa e não mexe na outra');
  H.modal = m0; H.toast = t0;
}

console.log('\nMapa:');
{
  H.pillStatus = s => s; H.ir = () => {};
  vm.runInContext(fs.readFileSync(path.join(raiz, 'public/hub/js/mapa.js'), 'utf8'), ctx);
  const G = H.mapaGeo;
  ok(G.lngNoMundo(222) === -138 && G.lngNoMundo(-222) === 138 && G.lngNoMundo(120) === 120 && G.lngNoMundo(-50) === -50, 'longitude fora do mundo volta para −180 a 180');
  const cruza = G.trechosDaRota([[30, 170], [31, 179], [32, 190], [33, 200], [34, 280]]);
  ok(cruza.length === 2 && cruza[0].length === 2 && cruza[1].length === 3 && cruza[1][0][1] === -170, 'rota que cruza o Pacífico vira dois trechos, sem riscar o mapa');
  ok(G.trechosDaRota([[0, 10], [1, 20]]).length === 1 && G.trechosDaRota([]).length === 0 && G.trechosDaRota(null).length === 0, 'rota comum fica inteira, e rota vazia não quebra');
  const volta = G.trechosDaRota([[30, 120], [20, -170], [10, -100]]);
  ok(volta.length === 1 && volta[0].length === 2, 'trecho de um ponto só não é desenhado');
  H.db = { portos: { 'Porto Novo': [10, 20] }, ops: [{ id: 'OP24', cliente: 'A', status: 'embarcado', embarque: '2026-10-11', eta: '2026-12-22', origemPorto: '', fabricaCidade: '' }, { id: 'OP23', status: 'embarcado', origemPorto: 'Qingdao', destinoPorto: 'Pecém', embarque: '2026-10-11', eta: '2026-12-22' },
    { id: 'OP30', status: 'producao', origemPorto: 'Itajaí' }, { id: 'OP31', status: 'producao', fabricaCidade: 'Tangshan (Hebei)' }, { id: 'OP32', status: 'producao', origemPorto: 'Porto Novo' }, { id: 'OP33', status: 'cotacao' }] };
  const el = criarNo(); H.telas.mapa(el); const h = el.innerHTML;
  ok(h.includes('1 operação(ões) fora do mapa, sem porto de origem') && h.includes('<a href="#" data-op="OP24">OP24</a>'), 'operação sem porto de origem é apontada, com link para a ficha');
  ok(h.split('fora do mapa').length === 3, 'só ela fica fora: Itajaí, Tangshan e porto criado pela equipe entram no mapa');
  H.db.ops[0].origemPorto = 'Porto Desconhecido'; const e3 = criarNo(); H.telas.mapa(e3);
  ok(e3.innerHTML.includes('o mapa não conhece "Porto Desconhecido"') && e3.innerHTML.includes('data-cadporto="Porto Desconhecido"') && !e3.innerHTML.includes('sem porto de origem'), 'porto informado e não reconhecido: diz o nome e oferece cadastrar, sem dizer que falta o porto');
  H.db.portos['porto desconhecido'] = [1, 2]; const e4 = criarNo(); H.telas.mapa(e4);
  ok(!e4.innerHTML.includes('fora do mapa'), 'porto cadastrado entra, sem depender de maiúsculas');
  H.db.ops[0].origemPorto = 'Lianyungang'; const e5 = criarNo(); H.telas.mapa(e5);
  ok(!e5.innerHTML.includes('fora do mapa'), 'novos portos da China são reconhecidos');
  H.db.ops[0].origemPorto = '';
  ok(!h.includes('OP33'), 'operação em cotação continua fora do mapa, como antes');
  H.db.ops[0].origemPorto = 'Qingdao'; const e2 = criarNo(); H.telas.mapa(e2);
  ok(!e2.innerHTML.includes('fora do mapa'), 'com o porto informado, o aviso some');
}

console.log('\nSistema antigo:');
{
  const html = fs.readFileSync(path.join(raiz, 'public/index.html'), 'utf8');
  const i = html.indexOf('function loadQuote(id){'), trecho = html.slice(i, i + 400);
  ok(/s\.clientes\.length>1/.test(trecho) && /return;/.test(trecho), 'recusa abrir cotação com vários clientes, que seria apagada ao salvar');
}

console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
process.exit(falhou ? 1 : 0);
