/**
 * Aditivo dentro da operação (Parte 2.1): mesmo cliente, mesmos contêineres, com quantidade, preço, parcelas e regra
 * de câmbio próprios. Bloco separado no desembolso; o contrato principal não muda.
 */
const W = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/comex.js'), require('../public/hub/js/cotacao-regras.js'), require('../public/hub/js/cambio-regras.js'), require('../public/hub/js/contrato-regras.js'));
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const perto = (a, b) => Math.abs(a - b) < 0.005;

const REGRA_228 = { modelo: 'evento', referencia: 5.30, piso: 5.05, teto: 5.50, quantidade: 3200, eventos: W.PADRAO_CASA.eventos };
const parc = (n, venc, extra) => Object.assign({ _id: 'p' + n, op: 'OP228', tipo: 'Receita', desc: n + 'º recebimento', valor: 107920, vencimento: venc, status: 'Previsto', empresa: 'WindGate' }, extra || {});
function banco() {
  return { ops: [{ id: 'OP228', cliente: 'Marquise', status: 'producao', regraCambial: JSON.parse(JSON.stringify(REGRA_228)) }],
    fin: [parc(1, '2026-11-13', { status: 'Realizado', liquidadoEm: '2026-11-13' }), parc(2, '2026-12-13'), parc(3, '2027-01-13'), parc(4, '2027-02-13')], quotes: {}, hubPainel: {} };
}
const T = '2026-11-19T10:00:00Z';

console.log('\nCriar aditivo:');
{
  const db = banco(), o = db.ops[0];
  ok(!W.criarAditivo(db, o, { quantidade: 0, parcelas: [{ valor: 100, vencimento: '2026-12-01' }] }, 'Davi', T).ok, 'sem quantidade: não cria');
  ok(!W.criarAditivo(db, o, { quantidade: 10, preco: 1000, parcelas: [{ valor: 400, vencimento: '2026-12-01' }] }, 'Davi', T).ok, 'parcelas que não somam o preço: não cria');
  ok(!W.criarAditivo(db, o, { quantidade: 10, parcelas: [{ valor: 400, vencimento: '' }] }, 'Davi', T).ok, 'parcela sem vencimento: não cria');
  ok(!W.criarAditivo(db, { id: 'M', papel: 'mae' }, { quantidade: 1, parcelas: [{ valor: 1, vencimento: '2026-12-01' }] }).ok, 'no contêiner (mãe): não');
  const antes = JSON.stringify(db.fin);
  const r = W.criarAditivo(db, o, { quantidade: 800, preco: 100000, parcelas: [{ valor: 30000, vencimento: '2026-11-25' }, { valor: 40000, vencimento: '2026-12-20' }, { valor: 30000, vencimento: '2027-02-20' }] }, 'Davi', T);
  ok(r.ok && r.aditivo.id === 'AD1' && r.lancamentos.length === 3 && r.lancamentos.every(l => l.aditivo === 'AD1' && l.op === 'OP228'), 'Aditivo 1: 3 parcelas na própria OP228, marcadas como do aditivo');
  ok(JSON.stringify(db.fin.filter(l => !l.aditivo)) === antes, 'o contrato principal não muda');
  ok(r.aditivo.regraCambial.piso === 5.05 && r.aditivo.regraCambial.teto === 5.5 && r.aditivo.regraCambial.quantidade === 800, 'regra própria: padrão da casa na referência da operação, com a quantidade do aditivo');
  ok(W.parcelasDoCliente(db, 'OP228').length === 4 && W.parcelasDoCliente(db, 'OP228', 'AD1').length === 3, 'numeração separada: 4 parcelas do contrato e 3 do aditivo');
  ok(W.numeroNaOp(db, r.lancamentos[1]) === 2, 'a 2ª do aditivo é a 2ª dele');
  ok(W.criarAditivo(db, o, { quantidade: 5, parcelas: [{ valor: 10, vencimento: '2027-03-01' }] }, 'Davi', T).aditivo.id === 'AD2', 'segundo aditivo: AD2');
}

console.log('\nEventos do aditivo, separados do contrato:');
{
  const db = banco(), o = db.ops[0];
  const r = W.criarAditivo(db, o, { quantidade: 800, parcelas: [{ valor: 30000, vencimento: '2026-11-25' }, { valor: 40000, vencimento: '2026-12-20' }] }, 'Davi', T);
  r.lancamentos[0].status = 'Realizado'; r.lancamentos[0].liquidadoEm = '2026-11-25';
  const px = { '2026-11-16': 5.7324, '2026-11-26': 5.70 };
  const principal = W.eventosDaOp(db, o, px).find(e => e.k === 'rem1');
  ok(principal.dataCredito === '2026-11-13' && principal.alvo._id === 'p2', 'o contrato continua pela 1ª parcela dele (13/11) e reajusta a 2ª dele');
  const v = W.vistaDoAditivo(o, o.aditivos[0]), ev = W.eventosDaOp(db, v, px).find(e => e.k === 'rem1');
  ok(ev.dataCredito === '2026-11-25' && ev.dataRef === '2026-11-26' && ev.alvo.aditivo === 'AD1' && perto(ev.calculo.valor, 480), 'aditivo: crédito 25/11, PTAX 26/11 (5,70 − 5,50) ÷ 0,10 × 0,30 × 800 = R$ 480, na 2ª dele');
  const ap = W.noAditivo(o, 'AD1', x => W.aprovarReajusteEvento(db, x, 'rem1', px, 'Samir', T));
  ok(ap.ok && o.aditivos[0].reajustesEvento.rem1.status === 'aprovado' && !(o.reajustesEvento || {}).rem1, 'aprovado no aditivo; o evento do contrato segue aguardando');
  ok(perto(r.lancamentos[1].valor, 40480) && db.fin.find(l => l._id === 'p2').valor === 107920, 'só a parcela do aditivo muda');
  o.aditivos[0].regraCambial.quantidade = 0;
  ok(W.opsSemRegraCambial(db).some(f => f.aditivo && f.aditivo.id === 'AD1'), 'aditivo com regra incompleta aparece em "Completar regra"');
}

console.log('\nDesembolso: bloco separado, total da operação inteira:');
{
  const db = banco(), o = db.ops[0];
  W.criarAditivo(db, o, { quantidade: 800, parcelas: [{ valor: 30000, vencimento: '2026-11-25' }, { valor: 40000, vencimento: '2026-12-20' }] }, 'Davi', T);
  const dd = W.dadosDesembolso(db, 'OP228', '2026-11-19');
  ok(dd.parcelas.length === 6 && dd.parcelas.slice(0, 4).every(p => !p.bloco) && dd.parcelas.slice(4).every(p => p.bloco === 'AD1'), 'contrato primeiro, depois o bloco do aditivo');
  ok(/^Aditivo 1 · 1ª parcela$/.test(dd.parcelas[4].rotulo), 'rótulo do cliente: "Aditivo 1 · 1ª parcela"');
  ok(perto(dd.total, 4 * 107920 + 70000), 'total = contrato + aditivo');
  ok(dd.proxima.vencimento === '2026-11-25' && dd.proxima.libera === '', 'próximo pagamento pela data (a do aditivo, 25/11), sem o texto de etapa do contrato');
}

console.log('\nFrete internacional: até 5% absorvido; acima, ou com sobretaxa, aprovação do Samir:');
{
  const TA = require('../public/hub/js/tarefas-auto.js'), WX = Object.assign({}, W, TA);
  const mk = () => ({ users: { samir: { perfil: 'diretoria' } }, docs: [], hubCambio: [], fin: [], quotes: { q1: { id: 'q1', fields: { freteUSD: '6000', txFrete: '5.61' } } },
    ops: [{ id: 'OP40', cliente: 'X', status: 'preparacao_embarque', quoteId: 'q1', modalidade: 'propria' }] });
  const marca = (db, d) => TA.marcarFreteFechado(db, db.ops[0], Object.assign({ agente: 'Agente A', em: '2026-11-19T12:00:00-03:00' }, d), 'matheus', T);
  let db = mk(); marca(db, { valorUSD: 6290 });
  let v = TA.variacaoFrete(db, db.ops[0]);
  ok(v.absorvida && !v.precisaAprovacao && Math.abs(v.pct - 0.0483) < 0.001, 'US$ 6.000 → 6.290 (+4,8%): absorvido, nada a aprovar');
  ok(!TA.decidirAjusteFrete(db, db.ops[0], 'aprovado', {}, 'Samir').ok, 'dentro de 5%: não há ajuste para aprovar');
  db = mk(); marca(db, { valorUSD: 6600 }); v = TA.variacaoFrete(db, db.ops[0]);
  ok(v.pendente && v.ajusteSugeridoUSD === 600 && v.semComprovante, 'US$ 6.600 (+10%): aguardando o Samir, ajuste sugerido US$ 600, sem comprovante');
  ok(WX.excecoes(db, 'samir', '2026-11-19').some(x => x.tipo === 'frete' && /\+10,0%/.test(x.titulo)), 'aparece na Torre do Samir');
  ok(!TA.decidirAjusteFrete(db, db.ops[0], 'aprovado', {}, 'Samir').ok, 'aprovar sem o comprovante do agente: não');
  marca(db, { valorUSD: 6600, comprovante: 'Invoice agente 123' });
  ok(TA.decidirAjusteFrete(db, db.ops[0], 'aprovado', {}, 'Samir', T).ok && db.ops[0].freteFechado.ajuste.valorUSD === 600 && !TA.variacaoFrete(db, db.ops[0]).pendente, 'com comprovante: Samir aprova US$ 600, sai da Torre');
  ok(!WX.excecoes(db, 'samir', '2026-11-19').some(x => x.tipo === 'frete'), 'decidido: não volta à Torre');
  marca(db, { valorUSD: 6800, comprovante: 'Invoice agente 124' });
  ok(TA.variacaoFrete(db, db.ops[0]).pendente && db.ops[0].freteFechado.ajustesAnteriores.length === 1, 'valor mudou depois: pede nova decisão; a anterior fica no histórico');
  db = mk(); marca(db, { valorUSD: 6000, sobretaxas: [{ tipo: 'GRI', usd: 250 }] }); v = TA.variacaoFrete(db, db.ops[0]);
  ok(v.pendente && v.ajusteSugeridoUSD === 250, 'mesmo valor + GRI US$ 250: precisa do Samir, ajuste = a sobretaxa');
  ok(TA.decidirAjusteFrete(db, db.ops[0], 'absorvido', {}, 'Samir', T).ok && db.fin.length === 0, '"absorver": decisão registrada, nenhum lançamento muda');
}

console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
process.exitCode = falhou ? 1 : 0;
