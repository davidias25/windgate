/**
 * Cláusula cambial por contrato, spread do banco e reajuste na parcela.
 * Referência: OP26 Diagonal, com os números conferidos pelo Samir.
 */
process.env.SUPABASE_DISABLED = '1';
const W = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/comex.js'), require('../public/hub/js/cotacao-regras.js'), require('../public/hub/js/cambio-regras.js'));
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const perto = (a, b, e) => Math.abs(a - b) <= (e == null ? 0.005 : e);
const OP26 = { referencia: 5.15, faixaMin: 5.10, faixaMax: 5.20, partida: 'referencia', repasseAlta: 1, repasseQueda: 1, primeiraFixa: true, spread: 0.016,
  remessas: [{ id: 'r30', rotulo: '30% à fábrica', usd: 9664.20, parcela: 2, quando: 'cambio' }, { id: 'r70', rotulo: '70% à fábrica', usd: 22549.80, parcela: 2, quando: 'cambio' }] };
const base = () => ({ ops: [{ _id: 'o', id: 'OP26', cliente: 'Diagonal', status: 'producao', clausulaCambial: JSON.parse(JSON.stringify(OP26)) }], hubCambio: [], hubPainel: {},
  fin: [{ _id: 'p1', op: 'OP26', tipo: 'Receita', desc: '1ª parcela', valor: 80000, vencimento: '2026-09-01', status: 'Realizado', liquidadoEm: '2026-09-01' },
    { _id: 'p2', op: 'OP26', tipo: 'Receita', desc: '2ª parcela', valor: 120000, vencimento: '2026-11-20', status: 'Previsto' },
    { _id: 'p3', op: 'OP26', tipo: 'Receita', desc: '3ª parcela', valor: 50000, vencimento: '2027-01-20', status: 'Previsto' }] });

console.log('\nCláusula e reajuste:');
{
  ok(!W.conferirClausula(OP26).length, 'a cláusula da OP26 é válida');
  ok(W.conferirClausula({ referencia: 5.15, faixaMin: 5.2, faixaMax: 5.3 }).length > 0, 'faixa que não contém a referência é recusada');
  ok(W.conferirClausula(Object.assign({}, OP26, { remessas: [{ usd: 1, parcela: 1 }] })).some(e => /1ª parcela é fixa/.test(e)), 'reajuste na 1ª parcela é recusado');
  const a = W.reajusteDaClausula(OP26, 22549.80, 5.55);
  ok(!a.dentro && perto(a.valor, 9019.92), '70% com PTAX 5,55: 22.549,80 × (5,55 − 5,15) = +R$ 9.019,92');
  const b = W.reajusteDaClausula(OP26, 9664.20, 5.0119);
  ok(!b.dentro && perto(b.valor, -1334.63), '30% com PTAX 5,0119: 9.664,20 × (5,0119 − 5,15) = −R$ 1.334,63');
  ok(W.reajusteDaClausula(OP26, 22549.80, 5.18).dentro && W.reajusteDaClausula(OP26, 22549.80, 5.20).valor === 0, 'dentro da faixa 5,10 a 5,20: sem reajuste');
  const borda = W.reajusteDaClausula(Object.assign({}, OP26, { partida: 'borda' }), 22549.80, 5.55);
  ok(perto(borda.valor, 22549.80 * 0.35), 'desde a borda: 22.549,80 × (5,55 − 5,20)');
  const hib = { referencia: 5.45, faixaMin: 5.3955, faixaMax: 5.5045, repasseAlta: 1, repasseQueda: 0.7 };
  ok(perto(W.reajusteDaClausula(hib, 8000, 5.60).valor, 1200) && perto(W.reajusteDaClausula(hib, 8000, 5.30).valor, -840), 'modelo híbrido nos mesmos campos: +1.200 na alta e −840 na queda (70%)');
  ok(perto(W.ajusteDaParcela(W.referenciaDaProposta(5.4), 800, 5.6).ajuste, 1200), 'o cálculo antigo por R$ 0,10 dá o mesmo pelo novo');
}

console.log('\nSpread do banco no custo:');
{
  const d = base(), r = W.remessasDaOp(d, 'OP26', 5.55);
  ok(perto(r.find(m => m.id === 'r70').custo, 127153.81), 'custo dos 70% com spread de 1,6%: 22.549,80 × 5,55 × 1,016 = R$ 127.153,81');
  ok(W.spreadDe({}, {}) === 0.016 && W.spreadDe({ hubPainel: { _cambio: { spread: 0.02 } } }, { spread: null }) === 0.02, 'padrão de 1,6%, editável');
  d.hubCambio.push({ _id: 'c30', op: 'OP26', remessaId: 'r30', status: 'fechado', valorME: 9664.20, taxa: 5.0921, valorBRL: 49211.93, dataFechamento: '2026-09-02', ptaxOficial: 5.0119 });
  const r2 = W.remessasDaOp(d, 'OP26', 5.55);
  ok(r2.find(m => m.id === 'r30').fechada && r2.find(m => m.id === 'r30').custo === 49211.93, 'com o câmbio registrado: o valor real pago, R$ 49.211,93');
  const c = W.custeioOp(d, 'OP26', { ptax: 5.55 });
  ok(perto(c.linhas.find(l => l.k === 'fob').projetado, 49211.93 + 127153.81, 0.01), 'Custeio: a fábrica projetada é real + estimada com spread');
}

console.log('\nReajuste na parcela, câmbio a câmbio:');
{
  const d = base();
  const c30 = { _id: 'c30', op: 'OP26', remessaId: 'r30', status: 'fechado', valorME: 9664.20, taxa: 5.0921, dataFechamento: '2026-09-02' };
  const c70 = { _id: 'c70', op: 'OP26', remessaId: 'r70', status: 'fechado', valorME: 22549.80, taxa: 5.64, dataFechamento: '2026-11-10' };
  d.hubCambio.push(c30, c70);
  const pv = W.previaReajuste(d, 'OP26', 'r70', 5.55);
  ok(pv.parcela === 2 && perto(pv.novo, 129019.92) && perto(pv.custo, 127153.81), 'prévia antes de fechar: "se fechar hoje, a 2ª parcela fica R$ 129.019,92"');
  ok(d.fin[1].valor === 120000, 'a prévia não grava nada');
  W.aplicarReajusteCambio(d, c30, 5.0119, 'Davi');
  ok(perto(d.fin[1].valor, 118665.37) && d.fin[1].valorContrato === 120000, '1º câmbio: −R$ 1.334,63 na 2ª parcela, que ainda não foi faturada');
  W.aplicarReajusteCambio(d, c70, 5.55, 'Davi');
  ok(perto(d.fin[1].valor, 127685.29), '2ª parcela = 120.000,00 + 9.019,92 − 1.334,63 = R$ 127.685,29');
  ok(d.fin[1].reajustes.length === 2 && d.fin[1].reajustes.every(x => x.cambioId && x.ptax && x.data), 'cada câmbio guarda o cálculo separado');
  W.aplicarReajusteCambio(d, c70, 5.55, 'Davi');
  ok(d.fin[1].reajustes.length === 2 && perto(d.fin[1].valor, 127685.29), 'registrar de novo o mesmo câmbio não soma duas vezes');
  W.aplicarReajusteCambio(d, Object.assign({}, c70, { dataFechamento: '2026-11-11' }), 5.60, 'Davi');
  ok(perto(d.fin[1].valor, 120000 - 1334.63 + 22549.80 * 0.45), 'câmbio corrigido: o cálculo dele é substituído');
  const comp = W.composicaoParcela(d.fin[1]);
  ok(comp.contrato === 120000 && comp.reajustes.length === 2 && perto(comp.total, comp.contrato + comp.reajustes.reduce((a, x) => a + x.valor, 0)), 'composição: contrato + reajuste de cada câmbio = total');
  ok(!JSON.stringify(comp).includes('22549') && !JSON.stringify(comp).includes('9664'), 'a composição não mostra o US$ remetido');
  const d2 = base(); d2.fin[1].status = 'Realizado';
  W.aplicarReajusteCambio(d2, c30, 5.0119, 'Davi');
  ok(d2.fin[1].valor === 120000 && perto(d2.fin[2].valor, 50000 - 1334.63), '2ª parcela já recebida: o reajuste vai para a próxima em aberto');
  ok(W.aplicarReajusteCambio(base(), { _id: 'x', op: 'OP26', remessaId: 'nada' }, 5.5).ok === false, 'câmbio sem remessa não mexe em parcela');
}

console.log('\nModelo híbrido a partir da cotação:');
{
  const q = { id: 'q', status: 'ok', fields: Object.assign({}, W.PADRAO, { opNum: 'OP70', txDesp: '5.5', txFrete: '5.61', freteUSD: '3000' }), items: [Object.assign(W.ITEM_PADRAO(), { d: 'x', q: 100, u: 200, p: 10 })], exps: [] };
  const R = W.calcular(q); Object.assign(q.fields, W.desemSugerir(q, R)); q.cambioProposta = W.congelarCambio(q, 5.4, '2026-11-06');
  const cl = W.clausulaDaOp({ quotes: { q }, ops: [] }, { id: 'OP70', quoteId: 'q' });
  ok(cl.origem === 'proposta' && cl.referencia === 5.45 && cl.repasseQueda === 0.7 && cl.repasseAlta === 1 && cl.primeiraFixa, 'contrato novo: referência PTAX + 0,05, alta 100%, queda 70%, 1ª fixa');
  ok(cl.remessas.length === 2 && cl.remessas[0].quando === 'vencimento' && cl.remessas[1].quando === 'registroDI' && perto(cl.remessas[0].usd, 14000, 0.01), 'reajuste da 2ª pelo vencimento e da 3ª pelo registro da DI; 2ª = 70% do FOB em US$');
}

console.log('\nDesembolso do cliente:');
{
  const C = require('../public/hub/js/contrato-regras.js');
  const d = base(); d.ops[0].estruturaFiscal = 'jt'; d.ops[0].nome = 'Obra Diagonal';
  d.fin[1].desc = 'Anotação interna: cliente pediu prazo';
  d.hubPainel._contrato = { jt: { razao: 'Contratada JT', cnpj: '00.000.000/0001-00', banco: 'Banco X', agencia: '1', conta: '2-3', pix: '00.000.000/0001-00' }, sf: { razao: 'Contratada SF', cnpj: '11' }, contato: { nome: 'Responsável', fone: '(85) 0000-0000', email: 'a@b.c' } };
  d.hubCambio.push({ _id: 'c30', op: 'OP26', remessaId: 'r30', status: 'fechado', dataFechamento: '2026-09-02' }, { _id: 'c70', op: 'OP26', remessaId: 'r70', status: 'fechado', dataFechamento: '2026-11-10' });
  W.aplicarReajusteCambio(d, d.hubCambio[0], 5.0119, 'Davi'); W.aplicarReajusteCambio(d, d.hubCambio[1], 5.55, 'Davi');
  const dd = C.dadosDesembolso(d, 'OP26', '2026-11-10');
  ok(dd.pagamento.favorecido === 'Contratada JT' && dd.pagamento.pix && dd.pagamento.conta === '2-3' && !dd.pendencias.length, 'favorecido e dados de pagamento vêm da contratada da operação');
  ok(!JSON.stringify(dd).includes('Anotação interna'), 'a descrição interna do lançamento não vai para o cliente');
  ok(dd.parcelas[1].rotulo === '2ª parcela' && dd.parcelas[1].situacao === 'proximo' && dd.parcelas[0].situacao === 'pago' && dd.parcelas[2].situacao === 'aPagar', 'rótulo e situação de cada parcela');
  ok(perto(dd.total, 80000 + 127685.29 + 50000) && perto(dd.reajuste, 9019.92 - 1334.63) && perto(dd.contrato, 250000), 'valor global atualizado = contrato + reajuste');
  ok(dd.composicao && dd.composicao.rotulo === '2ª parcela' && dd.composicao.reajustes.length === 2 && perto(dd.composicao.total, 127685.29), 'composição da parcela com os dois câmbios');
  ok(dd.clausula.referencia === 5.15 && dd.clausula.faixaMin === 5.1 && /conferência/.test(dd.clausula.texto) && /fechamento de câmbio/.test(dd.clausula.texto), 'referência, faixa e o texto da cláusula do modelo por câmbio');
  ok(dd.composicao.reajustes[0].ordem === 2 && dd.composicao.reajustes[1].ordem === 1 && dd.composicao.reajustes[0].rotulo === '70% à fábrica', 'câmbios numerados pela data, o mais recente primeiro, com o rótulo da remessa');
  ok(dd.parcelas[1].sub === W.fmtBRL(120000) + ' + reajuste cambial líquido ' + W.fmtBRL(7685.29), 'a parcela reajustada mostra o contrato e o reajuste líquido');
  ok(dd.composicao.rotuloContrato === 'Parcela contratual', 'linha da parcela do contrato');
  ok(!/22549|9664/.test(JSON.stringify(dd)) && !JSON.stringify(dd).includes('0.016'), 'sem o US$ remetido e sem o spread');
  ok(dd.proxima && /embarque/.test(dd.proxima.libera) && dd.contato.fone, 'próximo pagamento com o que a parcela libera, e o contato');
  d.fin[1].descCliente = 'Parcela 2 · produto pronto';
  ok(C.dadosDesembolso(d, 'OP26').parcelas[1].rotulo === 'Parcela 2 · produto pronto', 'a descrição para o cliente vale quando preenchida');
  d.hubPainel._asaas = { ativo: true };
  ok(C.dadosDesembolso(d, 'OP26').pagamento.asaas, 'com o Asaas ativo, boleto e PIX gerados');
  d.ops[0].estruturaFiscal = 'sf'; d.hubPainel._asaas = { ativo: false };
  ok(C.dadosDesembolso(d, 'OP26').pendencias.length > 0, 'contratada sem dados de pagamento: o desembolso aponta o que falta');
}

console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
process.exit(falhou ? 1 : 0);
