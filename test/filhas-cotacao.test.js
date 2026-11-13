/**
 * Cotação com vários clientes: uma filha por cliente, com as receitas e os custos só dele.
 *
 * Os números da OP227 dependem dos itens da cotação real, que não vão para o repositório. Com o arquivo
 * backups/op227.json (fora do git, com a cotação exportada), o último bloco confere os valores de aceite.
 */
process.env.SUPABASE_DISABLED = '1';
const fs = require('fs'), path = require('path');
const W = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/comex.js'), require('../public/hub/js/cotacao-regras.js'), require('../public/hub/js/cambio-regras.js'), require('../public/hub/js/contrato-regras.js'));
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const perto = (a, b, e) => Math.abs(a - b) <= (e == null ? 0.01 : e);
const T = '2026-11-06T10:00:00Z', HJ = '2026-11-06';
const it = (cid, d, q, u, p, cbm) => Object.assign(W.ITEM_PADRAO(), { d, ncm: '84271019', q, u, p, cbm, ii: 14, ipi: 5, clienteId: cid });
const cliente = (id, nome, tipo, x) => Object.assign({ id, nome, ufDestino: 'CE', tipoOperacao: tipo, clienteContribuinte: tipo === 'direta', margemPct: '25', margemRS: '0', aliqST: '16', opNum: 'OP300.' + id.slice(1), mercadoria: 'Carga ' + nome }, x);
const REGRA_FOB = { frete: 'fob', seguro: 'fob', capatazia: 'fob', terrestre: 'fob', siscomex: 'fob', afrmm: 'fob', honorarios: 'fob', demais: 'fob', percentuais: {} };
function cotacao(clientes, itens) {
  const q = { id: 'q300', status: 'draft', criadoPor: 'davi', fields: Object.assign({}, W.PADRAO, { txDesp: '5.5', txFrete: '5.61', pctInv: '100', icmsEnt: '1.6', freteUSD: '6000', seguro: '400', capatazia: '1250', siscomex: '416.46', afrmm: '2600', honorarios: '1630', transporte: '0', fabSinal: '30' }),
    clientes: clientes || [cliente('c1', 'Marcos', 'direta', { aliqST: '0' }), cliente('c2', 'Empresa Azul', 'triangular')],
    items: itens || [it('c1', 'Empilhadeira', 2, 8000, 3000, 15), it('c2', 'Empilhadeira menor', 1, 7000, 2500, 8)], exps: [{ l: 'Demais', v: 2968 }], regraRateio: Object.assign({}, REGRA_FOB), fotos: [] };
  W.calcularPorCliente(q).clientes.forEach(cc => Object.assign(cc.cliente, W.desemSugerir(cc.q, cc.R)));
  return q;
}
const banco = q => W.prepararBanco({ ops: [], fin: [], docs: [], checklists: {}, opStatusHist: [], crmOps: [], crm: [{ _id: 'c-azul', empresa: 'Empresa Azul', contribuinte: false }], hubNFe: [], quotes: { [q.id]: q } });
const aprova = (d, q, id) => { const a = W.aprovarCliente(q, id, 'Samir', T); if (!a.ok) throw new Error(a.msg); return W.criarOperacaoDoCliente(d, q, id, { por: 'Samir', hoje: HJ, agora: T }); };
const de = (d, op, tipo) => d.fin.filter(l => l.op === op && (!tipo || l.tipo === tipo));
const soma = xs => xs.reduce((a, l) => a + l.valor, 0);

console.log('\nItem 1: cliente triangular na compartilhada paga o preço cheio (DIFAL dentro, recolhido pela JeT):');
{
  const q = cotacao(), rm = W.calcularPorCliente(q), az = rm.clientes[1], dif = az.R.tri.apuracao.bloco5.difalNoCusto || 0;
  ok(az.R.tri && dif > 0 && perto(W.precoDesem(az.R), az.R.preco), 'a receber = preço cheio, igual à cotação de um cliente só');
  const sug = W.desemSugerir(az.q, az.R);
  ok(perto(+sug.desR1 + +sug.desR2 + +sug.desR3, az.R.preco), 'a sugestão distribui o preço cheio');
  const qq = cotacao(); qq.clientes[1].desR1 = String(+qq.clientes[1].desR1 + 100);
  const c2 = W.calcularPorCliente(qq).clientes[1], e = W.desemErros(c2.q, c2.R).join(' ');
  ok(/difere/.test(e) && e.includes(c2.R.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) && /preço cheio/.test(e), 'a mensagem mostra o preço cheio e diz que o DIFAL está dentro');
}

console.log('\nItem 2: mark-up e ICMS de entrada por cliente:');
{
  const base = cotacao(), a0 = W.calcularPorCliente(base).clientes[1].R;
  const m = cotacao([cliente('c1', 'Marcos', 'direta', { aliqST: '0' }), cliente('c2', 'Empresa Azul', 'triangular', { mkSF: '2000', mkJT: '1000', icmsEnt: '1.2' })]);
  const a1 = W.calcularPorCliente(m).clientes[1];
  ok(a1.R.tri.nfJT > a0.tri.nfJT, 'o mark-up digitado aumenta a nota da JeT ao cliente');
  ok(perto(a1.R.tri.difal, a1.R.tri.nfJT * 0.16), 'DIFAL = 16% da nota da JeT ao cliente: ' + a1.R.tri.difal.toFixed(2));
  ok(a1.q.fields.mkSF === '2000' && a1.q.fields.mkJT === '1000' && a1.q.fields.icmsEnt === '1.2', 'cada cliente é calculado com o que foi digitado');
  ok(W.calcularPorCliente(m).clientes[0].q.fields.icmsEnt === '1.6', 'o outro cliente continua com o ICMS do contêiner');
  ok(!W.calcularPorCliente(m).travas.length, 'as travas do contêiner continuam passando com ICMS diferente');
  const zero = cotacao([cliente('c1', 'Marcos', 'direta', { aliqST: '0' }), cliente('c2', 'Empresa Azul', 'triangular', { mkSF: '0', mkJT: '0', icmsEnt: '1.6' })]);
  ok(perto(W.calcularPorCliente(zero).clientes[1].R.tri.difal, a0.tri.difal), 'mk 0, 0 e ICMS 1,6: volta ao DIFAL de hoje');
  const dir = cotacao([cliente('c1', 'A', 'direta', { aliqST: '0', icmsEnt: '1.2' }), cliente('c2', 'B', 'direta', { aliqST: '0' })], [it('c1', 'x', 2, 8000, 3000, 15), it('c2', 'y', 1, 7000, 2500, 8)]);
  ok(!W.calcularPorCliente(dir).travas.length, 'dois diretos com ICMS diferente: sem trava falsa de custo total');
}

console.log('\nItens 3 e 4: aprovação por cliente cria a filha dele:');
{
  const q = cotacao(), d = banco(q);
  W.enviarClientes(q, 'c1');
  ok(q.clientes[0].status === 'wait' && !q.clientes[1].status && W.statusDaCotacao(q) === 'wait', 'enviar é por cliente');
  const r1 = aprova(d, q, 'c1');
  ok(r1.ok && r1.criouMae && r1.mae.id === 'OP300' && W.ehMae(r1.mae) && !r1.mae.cliente, 'o primeiro aprovado cria a mãe, sem cliente');
  ok(r1.filha.id === 'OP300.1' && r1.filha.maeId === 'OP300' && r1.filha.clienteCotId === 'c1' && r1.filha.quoteId === 'q300' && r1.filha.cliente === 'Marcos', 'filha com cliente, código da cotação, quoteId e clienteCotId');
  ok(d.ops.length === 2 && !d.ops.some(o => o.clienteCotId === 'c2'), 'o pendente fica na cotação, sem filha');
  ok(W.statusDaCotacao(q) === 'wait', 'a cotação ainda não está toda aprovada');
  const r2 = aprova(d, q, 'c2');
  ok(r2.ok && !r2.criouMae && r2.filha.id === 'OP300.2' && d.ops.length === 3 && W.statusDaCotacao(q) === 'ok', 'o segundo cria só a filha dele, e a cotação fica aprovada');
  ok(!de(d, 'OP300').length, 'nada vai para a mãe');
  ok(!d.ops.some(o => /\+/.test(o.id)), 'nunca cria operação com o contêiner inteiro');
  const rm = W.calcularPorCliente(q), [mq, az] = rm.clientes;
  ok(perto(soma(de(d, 'OP300.1', 'Receita')), W.precoDesem(mq.R), 0.05), 'contribuinte: receitas = o que ele paga');
  ok(perto(soma(de(d, 'OP300.1', 'Despesa')), mq.custo, 0.05), 'contribuinte: custos = o custo dele');
  const dif = de(d, 'OP300.2').filter(l => /DIFAL/.test(l.desc));
  const difAz = az.R.tri.apuracao.bloco5.difalNoCusto || 0;
  ok(dif.length === 1 && dif[0].tipo === 'Despesa' && /guia da JeT/.test(dif[0].desc) && perto(dif[0].valor, difAz), 'não contribuinte: o DIFAL é só despesa (guia da JeT); está dentro das parcelas, sem receita de reembolso');
  ok(perto(soma(de(d, 'OP300.2', 'Receita')), az.R.preco, 0.05), 'não contribuinte: receitas = preço cheio');
  const res = W.resultadoPorOp(d, 'todas').find(x => x.op === 'OP300.2');
  ok(perto(res.resultado, az.R.margem, 0.05), 'o resultado da filha não conta o DIFAL: é a margem do cliente');
  ok(de(d, 'OP300.1').every(l => l.origem === 'cotacao:q300:c1') && de(d, 'OP300.2').every(l => l.origem === 'cotacao:q300:c2'), 'origem com a cotação e o cliente');
  ok(de(d, 'OP300.1', 'Despesa').every(l => l.custo), 'todo custo com a classe gravada');
  const n = d.fin.length, r3 = W.criarOperacaoDoCliente(d, q, 'c1', { por: 'Samir', hoje: '2026-12-20', agora: T });
  ok(r3.ok && !r3.criouFilha && !r3.lancamentos.length && d.fin.length === n && d.ops.length === 3, 'aprovar de novo não duplica');
  const pg = de(d, 'OP300.1', 'Despesa')[0]; W.realizar(pg, pg.valor, HJ);
  const v0 = pg.valor; W.criarOperacaoDoCliente(d, q, 'c1', { por: 'S', hoje: HJ, agora: T });
  ok(W.realizado(pg) && pg.valor === v0, 'o realizado não é tocado');

  console.log('\nItem 5: custeio lê só o cliente:');
  const c1 = W.custeioOp(d, 'OP300.1'), c2 = W.custeioOp(d, 'OP300.2');
  ok(perto(c1.fobUSD, 16000) && perto(c2.fobUSD, 7000), 'FOB de cada filha, não o do contêiner');
  ok(perto(c1.simulado, mq.custo + (mq.R.st || 0)) && perto(c2.simulado, az.custo), 'simulado é o do cliente');
  ok(W.medidasFilha(d, d.ops.find(o => o.id === 'OP300.2')).m3.v === 8, 'medidas só dos itens do cliente');
  ok(W.cotacaoDaOp(d, d.ops.find(o => o.id === 'OP300.2')).items.length === 1, 'quem lê cotacaoDaOp (NF-e etc.) recebe só o cliente');
  ok(W.cotacaoDaOp(d, { id: 'x', quoteId: 'q300', quoteClienteId: 'c1' }).items.length === 1, 'filha gravada com o campo anterior continua funcionando');

  console.log('\nItem 6: um negócio por cliente:');
  W.negocioDaCotacao(d, q, { por: 'Samir', agora: T });
  const ns = d.crmOps;
  ok(ns.length === 2 && ns.every(x => x.quoteId === 'q300' && x.clienteCotId), 'um negócio por cliente, nunca combinado');
  const nz = ns.find(x => x.clienteCotId === 'c2');
  ok(nz.clienteId === 'c-azul' && perto(nz.valor, W.precoDesem(az.R)) && W.faseDe(nz) === 'ganho' && nz.opId === 'OP300.2', 'cliente do CRM, valor dele, ganho e ligado à filha');
  W.negocioDaCotacao(d, q, { por: 'Samir', agora: T });
  ok(d.crmOps.length === 2, 'não duplica');
  const dc = banco(q); dc.ops = d.ops; dc.crmOps = [{ _id: 'velho', quoteId: 'q300', fase: 'proposta', valor: 999 }];
  W.negocioDaCotacao(dc, q, { por: 'S', agora: T });
  ok(dc.crmOps.length === 2 && dc.crmOps.find(x => x._id === 'velho').clienteCotId === 'c1', 'negócio combinado antigo passa a ser de um cliente, sem perder o histórico');

  console.log('\nItens 7 e 12: consolidado sem duplicar:');
  const k = W.consolidadoDaMae(d, 'OP300'), rs = W.resultadoPorOp(d, 'todas');
  ok(perto(k.receita, rs.find(x => x.op === 'OP300.1').receita + rs.find(x => x.op === 'OP300.2').receita) && k.filhas.length === 2, 'a mãe mostra a soma das filhas');
  ok(!rs.some(x => x.op === 'OP300'), 'a mãe não entra nos totais');
  ok(!W.ativa(d.ops.find(o => o.id === 'OP300')), 'a mãe fica fora das operações ativas');
  ok(W.lancBatePesquisa(d, de(d, 'OP300.2')[0], 'azul') && !W.lancBatePesquisa(d, de(d, 'OP300.1')[0], 'azul'), 'pesquisar o cliente no Financeiro acha só a filha dele');

  console.log('\nItem 11: pagamento real do contêiner:');
  const d2 = JSON.parse(JSON.stringify(d)), fr1 = de(d2, 'OP300.1').find(l => l.custo === 'frete'), antes = d2.fin.length;
  const pr = W.lancarPagamentoConteiner(d2, 'OP300', { classe: 'frete', valor: 40000, data: HJ, desc: 'Frete real' }, 'Davi');
  ok(pr.ok && pr.lancamentos.length === 2 && d2.fin.length === antes && !de(d2, 'OP300').length, 'o previsto de cada filha é baixado: nada novo, nada na mãe');
  ok(W.realizado(fr1) && perto(pr.lancamentos.reduce((a, l) => a + l.valor, 0), 40000), 'a soma das partes é o pagamento, ao centavo');
  // FOB 16.000 × 7.000 → 69,565...% e 30,434...%.
  ok(perto(fr1.valor, 27826.09), 'mesma regra do rateio: R$ 27.826,09 na filha maior');
  const pd = W.lancarPagamentoConteiner(d2, 'OP300', { classe: 'demurrage', valor: 1000, data: HJ, desc: 'Demurrage' }, 'Davi');
  ok(pd.ok && d2.fin.length === antes + 2 && de(d2, 'OP300.1').some(l => l.origem === 'rateio:OP300'), 'sem previsto da classe: um lançamento por filha');
  ok(!W.lancarPagamentoConteiner(d2, 'OP300.1', { classe: 'frete', valor: 1 }).ok && !W.lancarPagamentoConteiner(d2, 'OP300', { classe: 'frete', valor: 0 }).ok, 'recusa filha e valor zerado');
}

console.log('\nItem 8: desistência:');
{
  const q = cotacao(), d = banco(q);
  aprova(d, q, 'c1'); aprova(d, q, 'c2');
  W.negocioDaCotacao(d, q, { por: 'S', agora: T });
  const rm = W.calcularPorCliente(q), mq = rm.clientes[0], precoM = W.precoDesem(mq.R), soz = W.sozinhoNoConteiner(q, 'c1', precoM);
  ok(soz.custo > mq.custo && perto(soz.margem, precoM - soz.custo), 'mostra custo e margem se ficasse sozinho no contêiner');
  const sim = W.simularDesistencia(q, 'c2');
  ok(sim.dedicado && sim.fica.length === 1 && perto(sim.fica[0].custo, soz.custo) && perto(sim.fica[0].margem, soz.margem) && q.clientes.length === 2, 'mostra o impacto antes, sem gravar');
  const r = W.desistirCliente(d, q, 'c2', { por: 'Samir', agora: T, hoje: HJ });
  ok(r.ok && r.dedicado && !W.ehMultiCliente(q) && !q.clientes, 'sobrou um: a cotação volta ao formato de um cliente');
  ok(q.items.length === 1 && q.items[0].d === 'Empilhadeira', 'os itens de quem saiu não entram mais no cálculo');
  ok(q.clientesDesistentes[0].status === 'desistiu' && q.clientesDesistentes[0].nome === 'Empresa Azul', 'quem saiu fica registrado como desistente');
  const f = d.ops.find(o => o.id === 'OP300.1'), R = W.calcular(q);
  ok(!f.maeId && !W.ehMae(f) && !d.ops.some(o => o.id === 'OP300') && !d.ops.some(o => o.id === 'OP300.2'), 'a filha que ficou vira operação comum; a mãe e a filha de quem saiu somem');
  ok(perto(R.preco - (R.st || 0), precoM) && perto(R.custoReal, soz.custo), 'preço fixo, com 100% dos custos do contêiner');
  ok(perto(soma(de(d, 'OP300.1', 'Despesa')), R.custoReal, 0.05) && perto(soma(de(d, 'OP300.1', 'Receita')), precoM, 0.05), 'lançamentos recalculados, sem duplicar');
  ok(new Set(de(d, 'OP300.1').map(l => l.tipo + l.desc)).size === de(d, 'OP300.1').length, 'nenhuma linha repetida');
  ok(perto(W.resultadoPorOp(d, 'todas').find(x => x.op === 'OP300.1').resultado, soz.margem, 0.05), 'o resultado da operação é a margem de quem ficou');
  const rb = W.operacaoDaCotacao(d, q, R, 'S', HJ);
  ok(rb.jaLancado && !rb.lancamentos.length, 'o botão de operação da cotação de um cliente não lança de novo');
  W.negocioDaCotacao(d, q, { por: 'S', agora: T });
  ok(W.faseDe(d.crmOps.find(x => x.clienteCotId === 'c2')) === 'perdido', 'o negócio de quem desistiu vira perdido');

  const q3 = cotacao([cliente('c1', 'A', 'direta', { aliqST: '0' }), cliente('c2', 'B', 'direta', { aliqST: '0' }), cliente('c3', 'C', 'direta', { aliqST: '0' })], [it('c1', 'a', 1, 5000, 100, 2), it('c2', 'b', 1, 5000, 100, 2), it('c3', 'c', 1, 5000, 100, 2)]);
  const d3 = banco(q3); ['c1', 'c2', 'c3'].forEach(id => aprova(d3, q3, id));
  const p1 = W.precoDesem(W.calcularPorCliente(q3).clientes[0].R);
  const pago = de(d3, 'OP300.3', 'Receita')[0]; W.realizar(pago, pago.valor, HJ);
  W.desistirCliente(d3, q3, 'c3', { por: 'S', agora: T, hoje: HJ });
  const rd = W.calcularPorCliente(q3);
  ok(rd.clientes.length === 2 && !rd.travas.length && perto(W.precoDesem(rd.clientes[0].R), p1), '3 clientes, sai um: os outros seguem filhas, com o preço fixo e o custo maior');
  ok(d3.ops.filter(o => o.maeId === 'OP300').length === 2 && d3.ops.some(o => o.id === 'OP300'), 'a mãe continua com as duas filhas');
  ok(perto(soma(de(d3, 'OP300.1', 'Despesa')), rd.clientes[0].custo, 0.05), 'previstos de quem fica recalculados');
  const f3 = d3.ops.find(o => o.id === 'OP300.3');
  ok(f3 && !f3.maeId && de(d3, 'OP300.3').every(l => W.realizado(l)), 'desistente com recebimento: a operação dele fica, solta, só com o realizado');
}

console.log('\nItem 9: CBM e peso:');
{
  const q = cotacao(); q.regraRateio.frete = 'cbm'; q.items[1].cbm = 0;
  W.calcularPorCliente(q).clientes.forEach(cc => Object.assign(cc.cliente, W.desemSugerir(cc.q, cc.R)));
  const r = W.aprovarCliente(q, 'c1', 'Samir', T);
  ok(!r.ok && r.rateio && /CBM/.test(r.msg), 'falta CBM: a aprovação para');
  q.aceitaRateioSemMedida = true;
  ok(W.aprovarCliente(q, 'c1', 'Samir', T).ok, 'com a confirmação explícita, aprova');
}

console.log('\nItem 10: proposta e contrato por cliente:');
{
  const q = cotacao(), d = banco(q); q.cambioProposta = W.congelarCambio(q, 5.4, HJ);
  aprova(d, q, 'c1'); aprova(d, q, 'c2');
  const cc = W.calcularPorCliente(q).clientes[1], res = W.resumoProposta(cc.q, cc.R);
  ok(res.itens.length === 1 && res.itens[0].d === 'Empilhadeira menor' && res.cliente === 'Empresa Azul', 'a proposta tem só os itens e o nome do cliente');
  ok(perto(res.investimento, cc.R.preco - res.difal) && perto(res.parcelas.reduce((a, p) => a + p.valor, 0), res.total, 0.05), 'proposta: investimento sem o DIFAL; as parcelas somam o total (com o DIFAL), igual à cotação de um cliente');
  ok(W.calcularPorCliente(q).clientes[0].q.items.length === 1, 'o outro cliente não aparece');
  const dc = W.dadosDoContrato(d, 'OP300.2');
  ok(dc.estrutura === 'jt' && dc.itens.length === 1 && perto(dc.parcelas.reduce((a, p) => a + p.valor, 0), res.investimento, 0.05) && perto(dc.difalNaTerceira, res.difal), 'contrato da filha: J&T, itens dela, parcelas sem o DIFAL e o DIFAL em linha própria (igual à cotação de um cliente)');
  const qs = cotacao([cliente('c1', 'U', 'direta', { aliqST: '0' }), cliente('c2', 'V', 'direta', { aliqST: '0' })]);
  ok(W.dadosDoContrato(banco(qs), 'x') === null, 'operação inexistente não gera dados');
}

console.log('\nCotação de um cliente só:');
{
  const q = { id: 'qs', status: 'ok', fields: Object.assign({}, W.PADRAO, { opNum: 'OP1', tipoOp: 'triangular', txDesp: '5.5', txFrete: '5.61', freteUSD: '3000' }), items: [Object.assign(W.ITEM_PADRAO(), { d: 'x', q: 2, u: 5000, p: 100 })], exps: [] };
  const R = W.calcular(q); Object.assign(q.fields, W.desemSugerir(q, R));
  ok(R.aReceber === undefined && W.precoDesem(R) === R.preco && W.desemErros(q, R).length === 0, 'triangular de um cliente: parcelas com o DIFAL, como sempre');
  const r = W.operacaoDaCotacao({ ops: [], fin: [] }, q, R, 'S', HJ);
  ok(r.lancamentos.every(l => l.origem === 'cotacao:qs') && !r.lancamentos.some(l => /Reembolso/.test(l.desc)), 'lançamentos da operação sem nada novo');
}

console.log('\nDuplicidade: dados gravados pela versão anterior, com custos na mãe:');
{
  const q = cotacao(), d = banco(q); ['c1', 'c2'].forEach(id => aprova(d, q, id));
  const limpo = W.custeioConsolidado(d, 'OP300').projetado, fobTot = W.calcularPorCliente(q).total.fob, nFilhas = d.fin.length;
  const velho = (id, desc, valor, custo, extra) => Object.assign({ _id: id, op: 'OP300', tipo: 'Despesa', desc, valor, status: 'Previsto', vencimento: '2026-12-01', custo, origem: 'cotacao:q300' }, extra);
  d.fin.push(velho('v1', '1º pagamento — Sinal da fábrica (30% do FOB)', fobTot * 0.3, 'fob'), velho('v2', '2º pagamento — Saldo da fábrica · pré-embarque', fobTot * 0.7, 'fob'), velho('v3', '3º pagamento — Seguro', 400, 'seguro'));
  d.fin.push({ _id: 'man', op: 'OP300', tipo: 'Despesa', desc: 'Lançado à mão', valor: 10, status: 'Previsto', vencimento: '2026-12-01' });
  d.fin.push(velho('pg', '3º pagamento — Frete internacional', 33660, 'frete', { status: 'Realizado', liquidadoEm: '2026-11-05', comp: 'comprovante-x', origem: 'cotacao:q300' }));
  ok(W.custeioConsolidado(d, 'OP300').projetado > limpo + fobTot, 'reproduz: as linhas na mãe inflam o custo do contêiner');
  const dg = W.diagnosticoMae(d, 'OP300');
  ok(dg.duplicados.length === 3 && dg.realizados.length === 1 && dg.manuais.length === 1, 'o diagnóstico separa duplicado, realizado e lançado à mão');
  ok(d.fin.some(l => l._id === 'v1'), 'o diagnóstico não altera nada');
  const r = W.repararMae(d, 'OP300', 'Samir', T);
  ok(r.ok && r.removidos === 3 && r.divididos === 1, 'remove os previstos duplicados e divide o pagamento real');
  const naMae = d.fin.filter(l => l.op === 'OP300');
  ok(naMae.length === 1 && naMae[0]._id === 'man', 'na mãe sobra só o lançado à mão, para alguém decidir');
  const fr = d.fin.filter(l => (l.op === 'OP300.1' || l.op === 'OP300.2') && l.custo === 'frete');
  ok(fr.length === 2 && fr.every(l => W.realizado(l)) && perto(fr.reduce((a, l) => a + l.valor, 0), 33660) && fr.every(l => l.comp === 'comprovante-x'), 'o pagamento real vira um realizado por filha, com o comprovante');
  const fab = d.fin.filter(l => l.custo === 'fob');
  ok(perto(fab.reduce((a, l) => a + l.valor, 0), fobTot, 0.03) && fab.every(l => l.op !== 'OP300'), 'fábrica nas filhas = FOB total do contêiner');
  ok(d.opStatusHist.some(h => h.op === 'OP300' && /duplicad/i.test(h.motivo)), 'fica no histórico');
  d.fin = d.fin.filter(l => l._id !== 'man');
  const qtd = d.fin.length; W.repararMae(d, 'OP300', 'Samir', T);
  ok(d.fin.length === qtd && W.diagnosticoMae(d, 'OP300').total === 0, 'corrigir de novo não muda nada');
  ok(W.lancBloqueadoNaMae(d, 'OP300') && !W.lancBloqueadoNaMae(d, 'OP300.1') && !W.lancBloqueadoNaMae(d, ''), 'lançamento direto na mãe é barrado');

  const q2 = cotacao(), d2 = banco(q2); ['c1', 'c2'].forEach(id => aprova(d2, q2, id));
  const az = W.calcularPorCliente(q2).clientes[1], c2 = q2.clientes[1]; c2.desR3 = String(+c2.desR3 - 442.42);
  const cc = W.calcularPorCliente(q2).clientes[1], ls = W.linhasDoCliente(cc).filter(l => l.tipo === 'Receita');
  ok(perto(ls.reduce((a, l) => a + l.valor, 0), az.R.preco, 0.02) && perto(ls.find(l => /Ajuste/.test(l.desc)).valor, 442.42), 'parcelas abaixo do preço: a diferença vira uma linha de ajuste, e a receita fecha');
  const q3 = cotacao(), f3 = W.criarFilha;
  const d3 = banco(q3); ['c1', 'c2'].forEach(id => aprova(d3, q3, id));
  const fx = d3.ops.find(o => o.clienteCotId === 'c1'); delete fx.clienteCotId;
  ok(W.cotacaoDaOp(d3, fx).items.length === 1 && W.cotacaoDaOp(d3, fx).clienteId === 'c1', 'filha sem o vínculo acha o cliente pelo nome, e não lê a cotação inteira');
  ok(W.cotacaoDaOp(d3, { id: 'x', maeId: 'OP300', quoteId: 'q300', cliente: 'Outro' }) === null, 'filha de cliente que não está na cotação: sem cotação, em vez da inteira');
  ok(W.cotacaoDaOp(d3, d3.ops.find(o => o.id === 'OP300')).items.length === 2, 'a mãe continua vendo a cotação inteira');
  W.criarOperacaoDoCliente(d3, q3, 'c1', { por: 'S', hoje: HJ, agora: T });
  ok(fx.clienteCotId === 'c1' && d3.ops.filter(o => o.id === fx.id).length === 1, 'recriar religa a filha existente, sem criar outra');
  const k = W.consolidadoDaMae(d3, 'OP300');
  ok(k.caixa != null && k.rr === 0 && k.dr === 0 && k.margem != null, 'o consolidado traz recebido, pago, caixa e margem para a ficha da mãe');
}

/* Aceite com a cotação real da OP227, fora do repositório. */
const ARQ = path.join(__dirname, '../backups/op227.json');
if (fs.existsSync(ARQ)) {
  console.log('\nAceite OP227:');
  const q = JSON.parse(fs.readFileSync(ARQ, 'utf8')), rm = W.calcularPorCliente(q), nome = re => rm.clientes.find(c => re.test(c.nome));
  const [m, a] = [nome(/m[aá]rcio/i), nome(/azul/i)];
  ok(perto(m.custo, 149461.32), 'Márcio: custo R$ 149.461,32 (' + m.custo.toFixed(2) + ')');
  ok(perto(m.R.margem, 70538.68), 'Márcio: margem R$ 70.538,68 (' + m.R.margem.toFixed(2) + ')');
  ok(perto(a.R.tri.nfJT, 62330.78), 'Azul: NF da JeT R$ 62.330,78 (' + a.R.tri.nfJT.toFixed(2) + ')');
  ok(perto(a.R.tri.difal, 9972.92), 'Azul: DIFAL R$ 9.972,92 (' + a.R.tri.difal.toFixed(2) + ')');
  ok(perto(a.R.custoParcelas, 70771.97), 'Azul: custo sem DIFAL R$ 70.771,97 (' + a.R.custoParcelas.toFixed(2) + ')');
  ok(perto(a.R.margem, 43454.93), 'Azul: margem R$ 43.454,93 (' + a.R.margem.toFixed(2) + ')');
  const sim = W.simularDesistencia(q, a.id).fica[0];
  ok(perto(sim.custo, 167479.24) && perto(sim.margem, 52520.76), 'Azul desiste: Márcio com custo R$ 167.479,24 e margem R$ 52.520,76 (' + sim.custo.toFixed(2) + ' / ' + sim.margem.toFixed(2) + ')');
} else console.log('\n  ⚠️  sem backups/op227.json nesta máquina: os valores de aceite da OP227 não foram conferidos.');

console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
process.exit(falhou ? 1 : 0);
