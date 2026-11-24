/**
 * DIFAL do Convênio 52/91 na triangular (24/11): a SEFAZ-CE reduz a base e aplica a diferença cheia.
 *   DIFAL% = (carga 52/91 ÷ interna da UF) × (interna − 4%)  → CE: (8,8 ÷ 20) × 16 = 7,04%
 * Prova: OP20, NF da JeT R$ 110.730,10 → DIFAL pago R$ 7.795,40.
 */
const C = require('../public/hub/js/cotacao-regras.js');
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const perto = (a, b, e) => Math.abs(a - b) <= (e == null ? 0.01 : e);
const cent = v => Math.round(v * 100) / 100;

const item = (c5291, extra) => Object.assign(C.ITEM_PADRAO(), { d: c5291 ? 'Betoneira' : 'Peça comum', ncm: '84743100', q: 1, u: 20000, p: 1000, ii: 14, ipi: 5, c5291 }, extra || {});
const cot = (itens, campos, extra) => Object.assign({ id: 'q1', status: 'draft', fields: Object.assign({}, C.PADRAO, { tipoOp: 'triangular', ufDestino: 'CE', txDesp: '5.5', txFrete: '5.6', freteUSD: '2000', pctInv: '100' }, campos || {}), items: itens, exps: [] }, extra || {});
const b5 = q => C.calcular(q).tri.apuracao.bloco5;

console.log('\nFórmula do DIFAL:');
{
  const R = C.calcular(cot([item(true)])), b = R.tri.apuracao.bloco5;
  ok(perto(b.difalPct, 7.04, 1e-9) && perto(R.tri.difal, R.tri.nfJT * 0.0704), 'item 52/91 para o CE: (8,8 ÷ 20) × 16% = 7,04% da NF da JeT (antes 4,80%)');
  ok(b.difalFormula.startsWith('DIFAL 52/91 CE · 7,04%'), 'resumo mostra a fórmula: "' + b.difalFormula + '"');
  ok(cent(110730.10 * b.difalPct / 100) === 7795.40, 'OP20: NF R$ 110.730,10 → DIFAL R$ 7.795,40 (o que foi pago)');
  const cust = 268965.27 * b.difalPct / 100, custAntes = 268965.27 * 0.048;
  ok(perto(cust, 18935.155, 0.001) && cent(custAntes) === 12910.33, 'betoneira do Custódio: NF R$ 268.965,27 → DIFAL R$ 18.935,155 (R$ 18.935,15 na conta do Samir, ,16 arredondando); o Hub mostrava R$ 12.910,33');
  ok(cent(40551.51 - (cust - custAntes)) === 34526.69, 'margem do Custódio: R$ 40.551,51 − (18.935,155 − 12.910,333) = R$ 34.526,69');
  ok(perto(b5(cot([item(false)])).difalPct, 16, 1e-9), 'item sem 52/91 continua em 16%');
  const mix = b5(cot([item(true), item(false)]));
  ok(perto(mix.difalPct, (7.04 + 16) / 2, 1e-6) && /ponderado/.test(mix.difalFormula), 'metade 52/91, metade comum (pelo FOB): ponderado');
  ok(perto(C.calcular(cot([item(true)]), { difal5291Legado: true }).tri.apuracao.bloco5.difalPct, 4.8, 1e-9), 'a conta antiga (4,80%) só existe para recalcular as aprovadas');
}

console.log('\nParâmetros editáveis:');
{
  const b = b5(cot([item(true)], { cargaConv: '9.778' }));
  ok(perto(b.difalPct, 9.778 / 20 * 16, 1e-9) && b.difalPct > 7.8, 'carga 52/91 editável (redução de 51,11%: carga 9,778% → DIFAL ≈ 7,82%)');
  const m = b5(cot([item(true)], { difalManual: '7.5' }));
  ok(perto(m.difalPct, 7.5, 1e-9) && m.difalManual && /^DIFAL manual · 7,50% \(automático seria 7,04%/.test(m.difalFormula), 'DIFAL manual vale por cima do automático e o resumo diz qual seria o automático');
  ok(perto(b5(cot([item(true)], { difalManual: '' })).difalPct, 7.04, 1e-9), 'DIFAL manual vazio: automático');
  ok(perto(b5(cot([item(true)], { aliqST: '3' })).difalPct, 7.04, 1e-9), 'a "Alíq. efetiva DIFAL" da operação direta não mexe na triangular (o campo some da tela)');
  ok(C.calcular(cot([item(true)], { tipoOp: 'direta', aliqST: '16' })).st > 0, 'operação direta continua pela alíquota efetiva');
}

console.log('\nCotação aprovada: preço mantido, só a margem cai:');
{
  const q = cot([item(true, { q: 2 })], { margemPct: '25' }, { status: 'ok' });
  const antes = C.calcular(q, { difal5291Legado: true }), novoSemAjuste = C.calcular(q);
  const aj = C.recalcularMargem5291(q, 'sistema', '2026-11-24T10:00:00Z');
  const depoisBrl = C.calcular(q, { modo: 'brl' }), depoisPct = C.calcular(q);
  const dDifal = depoisBrl.tri.difal - antes.tri.difal;
  ok(novoSemAjuste.preco > antes.preco, 'sem recalcular, o preço subiria (por isso a correção)');
  ok(aj && perto(depoisBrl.preco, antes.preco, 0.02) && perto(depoisPct.preco, antes.preco, 0.05), 'preço igual ao aprovado, em R$ e em %');
  ok(perto(depoisBrl.margem, antes.margem - dDifal, 0.02) && perto(aj.clientes[0].margemDepois, aj.clientes[0].margemAntes - (aj.clientes[0].difalDepois - aj.clientes[0].difalAntes), 0.02), 'margem cai exatamente o DIFAL que faltava');
  ok(q.margemModo === 'brl' && q.ajuste5291.clientes[0].antes.margemPct === '25', 'registrado em q.ajuste5291, com o que era antes');
  ok(C.recalcularMargem5291(q, 'sistema') === null && perto(C.calcular(q, { modo: 'brl' }).preco, antes.preco, 0.02), 'uma vez só: rodar de novo não muda nada');
  const rasc = cot([item(true)], {}, { status: 'draft' }), dir = cot([item(true)], { tipoOp: 'direta' }, { status: 'ok' }), sem = cot([item(false)], {}, { status: 'ok' });
  ok([rasc, dir, sem].every(x => C.recalcularMargem5291(x) === null && !x.ajuste5291), 'rascunho, operação direta e cotação sem 52/91: não mexe');
  const db = { quotes: { a: cot([item(true)], {}, { status: 'ok', id: 'a' }), b: sem } };
  ok(C.recalcularAprovadas5291(db, 'sistema').map(x => x.id).join() === 'a', 'no banco: só as aprovadas com 52/91');
}

console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
process.exitCode = falhou ? 1 : 0;
