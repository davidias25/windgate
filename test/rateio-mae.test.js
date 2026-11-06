/**
 * Contêiner compartilhado: rateio dos custos comuns, pagamento à fábrica, fiscal por filha, exclusão.
 * Os valores esperados foram conferidos à mão; a conta está no comentário de cada bloco.
 */
process.env.SUPABASE_DISABLED = '1';
const W = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/comex.js'), require('../public/hub/js/cotacao-regras.js'));
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const T = '2026-11-06T10:00:00Z', perto = (a, b, e) => Math.abs(a - b) <= (e == null ? 0.005 : e);
function banco(filhas) {
  const d = W.prepararBanco({ ops: [{ _id: 'm', id: 'OP27', cliente: '', status: 'producao', criadaEm: '2026-10-01', resp: 'Davi', containers: [{ numero: 'MSCU1234567', tipo: "40'HC" }] }], fin: [], docs: [], checklists: {}, opStatusHist: [] });
  W.virarMae(d, 'OP27');
  (filhas || [{ cliente: 'Cliente A', m3: 30, pesoKg: 8000, fobUSD: 20000 }, { cliente: 'Cliente B', m3: 16, pesoKg: 6000, fobUSD: 12000 }]).forEach(f => W.criarFilha(d, 'OP27', f, 'Davi', T));
  return d;
}
const lanc = (id, op, tipo, desc, valor, status, custo) => { const l = { _id: id, op, tipo, desc, valor, status: status || 'Previsto', vencimento: '2026-11-20' }; if (custo) l.custo = custo; return l; };
const classe = (r, k) => r.classes.find(c => c.k === k);
const total = (c, f) => c.porFilha[f].realizado + c.porFilha[f].aPagar;

console.log('\nRateio com números conferidos à mão:');
{
  // Frete R$ 10.000 por m³: 30/46 = 6.521,74 e 16/46 = 3.478,26.
  // Seguro R$ 1.000 por FOB: 20/32 = 625 e 12/32 = 375.
  // Porto R$ 4.600 por m³: 3.000 e 1.600. Demurrage R$ 460 por m³: 300 e 160.
  const d = banco();
  d.fin.push(lanc('a', 'OP27', 'Despesa', 'Frete internacional', 10000, 'Realizado'), lanc('b', 'OP27', 'Despesa', 'Seguro da carga', 1000), lanc('c', 'OP27', 'Despesa', 'Despachante', 4600), lanc('e', 'OP27', 'Despesa', 'Demurrage', 460));
  const r = W.rateioDaMae(d, 'OP27');
  ok(perto(total(classe(r, 'frete'), 'OP27.1'), 6521.74) && perto(total(classe(r, 'frete'), 'OP27.2'), 3478.26) && classe(r, 'frete').criterio === 'm3', 'frete por m³: R$ 6.521,74 e R$ 3.478,26');
  ok(perto(total(classe(r, 'seguro'), 'OP27.1'), 625) && perto(total(classe(r, 'seguro'), 'OP27.2'), 375) && classe(r, 'seguro').criterio === 'fob', 'seguro por FOB: R$ 625 e R$ 375');
  ok(perto(total(classe(r, 'porto'), 'OP27.1'), 3000) && perto(total(classe(r, 'porto'), 'OP27.2'), 1600), 'porto e despachante por m³: R$ 3.000 e R$ 1.600');
  ok(perto(total(classe(r, 'demurrage'), 'OP27.1'), 300) && perto(total(classe(r, 'demurrage'), 'OP27.2'), 160), 'demurrage por m³: R$ 300 e R$ 160');
  ok(r.confere, 'a soma das filhas bate com a mãe');
  const c = W.custeioOp(d, 'OP27.1');
  ok(perto(c.linhas.find(x => x.k === 'frete').realizado, 6521.74) && perto(c.linhas.find(x => x.k === 'seguro').aPagar, 625), 'o Custeio da filha traz a parte dela, separando pago de a pagar');
  ok(perto(W.custeioOp(d, 'OP27').realizado, 10000), 'o lançamento continua um só, na mãe');
}

console.log('\nCentavo:');
{
  const s = W.ratearCentavos(100, { a: 1, b: 1, c: 1 });
  ok(s.a === 33.34 && s.b === 33.33 && s.c === 33.33, 'R$ 100 em 3: R$ 33,34 + R$ 33,33 + R$ 33,33');
  const g = W.ratearCentavos(0.05, { a: 1, b: 3 });
  ok(perto(g.a + g.b, 0.05) && g.b > g.a, 'a diferença de arredondamento fica na maior filha');
  const v = W.ratearCentavos(1234.57, { a: 7, b: 11, c: 13 });
  ok(Math.round((v.a + v.b + v.c) * 100) === 123457, 'soma exata em outra divisão');
  const d = banco([{ cliente: 'A', m3: 7, fobUSD: 7 }, { cliente: 'B', m3: 11, fobUSD: 11 }, { cliente: 'C', m3: 13, fobUSD: 13 }]);
  d.fin.push(lanc('a', 'OP27', 'Despesa', 'Frete internacional', 9999.99, 'Realizado'), lanc('b', 'OP27', 'Despesa', 'Frete internacional 2', 0.01));
  const r = W.rateioDaMae(d, 'OP27'), f = classe(r, 'frete');
  ok(W.filhasDe(d, 'OP27').length === 3 && Math.round(['OP27.1', 'OP27.2', 'OP27.3'].reduce((a, x) => a + total(f, x), 0) * 100) === 1000000 && r.confere, '3 filhas: soma igual à mãe ao centavo');
  ok(!!W.custeioConsolidado(d, 'OP27') && W.custeioConsolidado(d, 'OP27').filhas.length === 3, 'consolidado lista as 3 filhas');
}

console.log('\nEditar na mãe:');
{
  const d = banco();
  d.fin.push(lanc('a', 'OP27', 'Despesa', 'Frete internacional', 1000));
  ok(!W.definirRateioMae(d, 'OP27', 'frete', 'manual', { 'OP27.1': 50, 'OP27.2': 30 }).ok, 'manual que não soma 100% é recusado');
  ok(W.definirRateioMae(d, 'OP27', 'frete', 'manual', { 'OP27.1': 80, 'OP27.2': 20 }).ok && perto(total(classe(W.rateioDaMae(d, 'OP27'), 'frete'), 'OP27.1'), 800), 'manual 80/20: R$ 800 e R$ 200');
  ok(W.definirRateioMae(d, 'OP27', 'frete', 'fob').ok && perto(total(classe(W.rateioDaMae(d, 'OP27'), 'frete'), 'OP27.1'), 625), 'trocar para FOB recalcula: R$ 625');
  ok(W.definirRateioMae(d, 'OP27', 'frete', 'padrao').ok && classe(W.rateioDaMae(d, 'OP27'), 'frete').criterio === 'm3', 'volta ao padrão');
  ok(!W.definirRateioMae(d, 'OP27.1', 'frete', 'fob').ok, 'filha não tem rateio');
  const sem = banco([{ cliente: 'A', fobUSD: 3 }, { cliente: 'B', m3: 1, fobUSD: 1 }]);
  sem.fin.push(lanc('a', 'OP27', 'Despesa', 'Frete', 400));
  const rs = W.rateioDaMae(sem, 'OP27');
  ok(classe(rs, 'frete').criterio === 'fob' && perto(total(classe(rs, 'frete'), 'OP27.1'), 300) && rs.avisos.length === 1, 'filha sem m³: rateia por FOB e avisa');
}

console.log('\nPagamento único à fábrica:');
{
  // US$ 32.000 de FOB: A 20.000 (62,5%), B 12.000 (37,5%). R$ 100.000 → 62.500 e 37.500.
  const d = banco();
  d.fin.push(lanc('f', 'OP27', 'Despesa', 'Sinal da fábrica', 100000, 'Previsto', 'fob'), lanc('r1', 'OP27.1', 'Receita', 'Parcela', 62500, 'Realizado'), lanc('r2', 'OP27.2', 'Receita', 'Parcela', 10000, 'Realizado'));
  const a = W.alocarFabrica(d, 'OP27', 100000);
  ok(a['OP27.1'] === 62500 && a['OP27.2'] === 37500, 'alocado pelo FOB de cada filha: R$ 62.500 e R$ 37.500');
  ok(perto(W.custeioOp(d, 'OP27.2').linhas.find(x => x.k === 'fob').aPagar, 37500), 'a cota aparece no Custeio da filha');
  const t = W.travaFabrica(d, d.fin[0]);
  ok(t.bloqueia && t.abertas.length === 1 && t.abertas[0].op === 'OP27.2' && perto(t.descoberto, 27500), 'filha sem recebimento trava o pagamento: R$ 27.500 descobertos na OP27.2');
  W.liberarFabrica(d, 'f', 'Samir', T);
  ok(!W.travaFabrica(d, d.fin[0]).bloqueia && d.fin[0].liberacaoFabrica.por === 'Samir' && perto(d.fin[0].liberacaoFabrica.descoberto, 27500), 'o Samir libera, e fica registrado quanto estava descoberto');
  d.fin[1].valor = 62500; d.fin[2].valor = 37500; delete d.fin[0].liberacaoFabrica;
  ok(!W.travaFabrica(d, d.fin[0]).bloqueia, 'com as cotas recebidas, paga sem trava');
  ok(!W.travaFabrica(d, lanc('z', 'OP27', 'Despesa', 'Frete', 10)).bloqueia && !W.travaFabrica(d, lanc('z', 'OP27.1', 'Despesa', 'Sinal da fábrica', 10)).bloqueia, 'a trava é só do pagamento à fábrica lançado na mãe');
  ok(W.definirAlocacaoFabrica(d, 'OP27', { 'OP27.1': 50, 'OP27.2': 50 }).ok && W.alocarFabrica(d, 'OP27', 100000)['OP27.1'] === 50000, 'alocação editável: 50/50');
  ok(!W.definirAlocacaoFabrica(d, 'OP27', { 'OP27.1': 50 }).ok, 'alocação que não soma 100% é recusada');
  ok(W.definirAlocacaoFabrica(d, 'OP27', null).ok && W.alocarFabrica(d, 'OP27', 100000)['OP27.1'] === 62500, 'e volta ao FOB');
  d.hubCambio = [{ _id: 'c', op: 'OP27', status: 'fechado', valorME: 32000, taxa: 5.5, taxaPrevista: 5.4 }];
  ok(perto(W.custeioOp(d, 'OP27.1').usdFechado, 20000) && perto(W.custeioOp(d, 'OP27.2').usdFechado, 12000), 'câmbio fechado na mãe conta para cada filha pelo FOB dela');
}

console.log('\nDUIMP única, item por filha:');
{
  const d = banco();
  const item = (op, v) => ({ op, tributos: { ii: { aRecolher: v } } });
  const m = d.ops.find(o => o.id === 'OP27');
  m.duimp = '26BR0000000001'; m.duimpDados = { geral: { numero: '26BR0000000001' }, itens: [item('OP27.1', 300), item('OP27.2', 700)] };
  W.sincronizarMaes(d, 'Davi', T);
  d.fin.push(lanc('i', 'OP27', 'Despesa', 'Impostos DUIMP', 1000, 'Previsto', 'impostos'));
  const r = classe(W.rateioDaMae(d, 'OP27'), 'impostos');
  ok(r.criterio === 'duimp' && perto(total(r, 'OP27.1'), 300) && perto(total(r, 'OP27.2'), 700), 'imposto da DUIMP vai para a filha dona de cada item: R$ 300 e R$ 700');
  m.duimpDados.itens.push({ tributos: { ii: { aRecolher: 1 } } });
  ok(classe(W.rateioDaMae(d, 'OP27'), 'impostos').criterio === 'fob', 'item sem dono: volta ao FOB até atribuir');
}

console.log('\nCotação com vários clientes vira mãe e filhas:');
{
  const it = (cid, q, u, p, cbm) => Object.assign(W.ITEM_PADRAO(), { d: 'Item ' + cid, ncm: '84271019', q, u, p, cbm, ii: 14, ipi: 5, clienteId: cid });
  const q = { id: 'qm', status: 'ok', fields: Object.assign({}, W.PADRAO, { txDesp: '5.30', txFrete: '5.40', pctInv: '100', freteUSD: '4000', seguro: '1000', capatazia: '1500', transporte: '3000', siscomex: '416.46', afrmm: '600', honorarios: '1630', fabSinal: '30' }),
    clientes: [
      { id: 'c1', nome: 'Contribuinte SA', ufDestino: 'CE', tipoOperacao: 'direta', clienteContribuinte: true, margemPct: '25', margemRS: '0', aliqST: '16', opNum: '', mercadoria: 'Empilhadeiras' },
      { id: 'c2', nome: 'Nao Contribuinte', ufDestino: 'CE', tipoOperacao: 'triangular', clienteContribuinte: false, margemPct: '25', margemRS: '0', aliqST: '16', opNum: '', mercadoria: 'Contêineres' }],
    items: [it('c1', 2, 10000, 3000, 15), it('c2', 3, 4000, 1000, 5)], exps: [{ l: 'Armazenagem', v: 2000 }], regraRateio: Object.assign({}, W.RATEIO_PADRAO, { percentuais: {} }) };
  const rm = W.calcularPorCliente(q);
  ok(!rm.erros.length && !rm.travas.length, 'cálculo por cliente fecha sem trava');
  ok(rm.clientes[0].R.tri === null && !!rm.clientes[1].R.tri, 'uma filha contribuinte (direta pela SF) e outra não contribuinte (via J&T) no mesmo contêiner');
  q.clientes.forEach(c => { const cc = rm.clientes.find(x => x.id === c.id); Object.assign(c, W.desemSugerir(cc.q, cc.R)); });
  const d = W.prepararBanco({ ops: [], fin: [], docs: [], checklists: {}, opStatusHist: [], crmOps: [], crm: [], quotes: { qm: q } });
  const r = W.criarOperacoesDaMulti(d, q, { maeId: 'op40', por: 'Samir', hoje: '2026-11-06', agora: T });
  ok(r.ok && W.ehMae(r.mae) && r.mae.id === 'OP40' && r.filhas.length === 2 && r.filhas[0].id === 'OP40.1' && r.filhas[1].maeId === 'OP40', 'cria a mãe OP40 e as filhas OP40.1 e OP40.2');
  ok(r.filhas[0].estruturaFiscal === 'sf' && r.filhas[1].estruturaFiscal === 'jt', 'cada filha guarda a estrutura fiscal: SF para o contribuinte, J&T para o outro');
  ok(q.clientes[0].opNum === 'OP40.1', 'o código da filha volta para o cliente na cotação');
  const fab = d.fin.filter(l => l.op === 'OP40' && l.custo === 'fob');
  const fobTot = rm.total.fob;
  ok(fab.length === 2 && perto(fab[0].valor + fab[1].valor, fobTot, 0.02), 'a fábrica é paga uma vez só, na mãe');
  ok(d.fin.filter(l => l.op === 'OP40' && l.tipo === 'Receita').length === 0 && d.fin.filter(l => l.op === 'OP40.1' && l.tipo === 'Receita').length === 3, 'as parcelas são de cada filha');
  const cFilhas = r.filhas.map(f => W.custeioOp(d, f.id));
  const custoCli = i => rm.clientes[i].custo + (rm.clientes[i].R.tri ? 0 : rm.clientes[i].R.st || 0);
  ok(perto(cFilhas[0].simulado, custoCli(0), 0.01), 'filha contribuinte: o simulado é o custo do cliente (com o DIFAL pago à parte)');
  ok(perto(cFilhas[1].simulado, custoCli(1), 0.01), 'filha não contribuinte: o simulado é o custo do cliente');
  const m1 = rm.clientes[0].R.margem / rm.clientes[0].R.preco, m2 = rm.clientes[1].R.margem / rm.clientes[1].R.preco;
  ok(perto(cFilhas[0].margemProjetada, m1, 0.002) && perto(cFilhas[1].margemProjetada, m2, 0.002), `com o previsto lançado, a margem de cada filha é a da cotação (${(cFilhas[0].margemProjetada * 100).toFixed(1)}% e ${(cFilhas[1].margemProjetada * 100).toFixed(1)}%)`);
  ok(W.rateioDaMae(d, 'OP40').confere, 'a soma das filhas bate com a mãe');
  const qtd = d.fin.length, r2 = W.criarOperacoesDaMulti(d, q, { maeId: 'OP40', por: 'Samir', hoje: '2026-12-01', agora: T });
  ok(r2.ok && r2.jaLancado && d.fin.length === qtd && d.ops.length === 3, 'repetir não duplica operação nem lançamento');
  ok(!W.criarOperacoesDaMulti(d, q, { maeId: '' }).ok, 'sem código do contêiner é recusado');
  ok(W.multiClienteLigado({}) && !W.multiClienteLigado({ hubPainel: { _flags: { multiCliente: false } } }), 'a função vem ligada, e a diretoria ainda pode desligar');
  const qa = JSON.parse(JSON.stringify(q)); qa.clientes.forEach(c => { delete c.status; });
  ok(W.aprovarCliente(qa, 'c1', 'Samir', T).ok && !W.aprovarCliente(qa, 'c1', 'Samir', T).todos, 'aprovar um cliente não aprova a cotação');
  ok(W.aprovarCliente(qa, 'c2', 'Samir', T).todos, 'com o último cliente, está tudo aprovado');
  qa.clientes[0].margemPct = '40';
  const ms = W.revisarAprovacoes(qa);
  ok(ms.length === 1 && qa.clientes[0].status === 'wait' && qa.clientes[1].status === 'ok', 'preço de um cliente mudou: só ele volta para aprovação');
}

console.log('\nTorre no nível certo:');
{
  const d = banco();
  d.users = { samir: { perfil: 'diretoria' } };
  const m = d.ops.find(o => o.id === 'OP27');
  m.etaHist = [{ de: '2026-11-01', para: '2026-11-20', em: '2026-11-05T00:00:00Z' }]; W.sincronizarMaes(d, 'Davi', T);
  d.fin.push(lanc('f', 'OP27', 'Despesa', 'Sinal da fábrica', 1000, 'Previsto', 'fob'), Object.assign(lanc('r', 'OP27.2', 'Receita', 'Parcela', 500), { vencimento: '2026-11-01' }));
  d.fin[0].vencimento = '2026-11-08';
  const xs = W.excecoes(d, 'samir', '2026-11-06', {});
  ok(xs.filter(x => x.tipo === 'eta').length === 1 && xs.find(x => x.tipo === 'eta').op === 'OP27', 'mudança de ETA aparece uma vez, no contêiner');
  ok(xs.some(x => x.tipo === 'cobranca' && x.op === 'OP27.2'), 'cobrança aparece na filha');
  ok(xs.some(x => x.tipo === 'fabrica' && x.op === 'OP27'), 'pagamento à fábrica travado aparece no contêiner');
}

console.log('\nExcluir operação:');
{
  const base = () => W.prepararBanco({ ops: [{ _id: 'a', id: 'OP1', status: 'contrato' }, { _id: 'b', id: 'OP2', status: 'contrato' }], fin: [], docs: [], hubNFe: [], opStatusHist: [] });
  let d = base(); d.fin.push(lanc('r', 'OP1', 'Despesa', 'x', 10, 'Realizado'));
  const e = W.excluirOperacao(d, 'OP1', 'Samir', T);
  ok(!e.ok && /realizado/.test(e.msg) && d.ops.length === 2, 'bloqueada com lançamento realizado');
  d = base(); d.docs.push({ _id: 'd', op: 'OP1' });
  ok(!W.excluirOperacao(d, 'OP1', 'Samir', T).ok, 'bloqueada com documento');
  d = base(); d.hubNFe.push({ _id: 'n', op: 'OP1', status: 'rascunho' });
  ok(!W.excluirOperacao(d, 'OP1', 'Samir', T).ok, 'bloqueada com NF-e');
  d = base(); d.hubNFe.push({ _id: 'n', op: 'OP1', status: 'cancelada' });
  ok(W.excluirOperacao(d, 'OP1', 'Samir', T).ok, 'NF-e cancelada não bloqueia');
  d = base(); d.fin.push(lanc('p', 'OP1', 'Despesa', 'x', 10));
  ok(!W.excluirOperacao(d, 'OP1', 'Samir', T, { moverPara: 'OP9' }).ok, 'destino inexistente é recusado');
  const mv = W.excluirOperacao(d, 'OP1', 'Samir', T, { moverPara: 'OP2' });
  const h = d.opStatusHist[d.opStatusHist.length - 1];
  ok(mv.ok && mv.movidos === 1 && d.fin[0].op === 'OP2' && d.fin[0].movidoDe === 'OP1', 'previstos movidos para outra operação');
  ok(h.tipo === 'exclusao' && h.por === 'Samir' && /movido/.test(h.motivo) && /OP2/.test(h.motivo), 'fica no histórico');
  d = base(); d.fin.push(lanc('p', 'OP1', 'Despesa', 'x', 10));
  ok(W.excluirOperacao(d, 'OP1', 'Samir', T).ok && d.fin[0].op === 'OP1', 'sem mover: o previsto fica com o código preservado');
  const dm = banco();
  ok(!W.excluirOperacao(dm, 'OP27', 'Samir', T).ok, 'mãe com filhas não sai');
}

console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
process.exit(falhou ? 1 : 0);
