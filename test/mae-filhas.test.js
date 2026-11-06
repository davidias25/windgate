/**
 * Operação-mãe (contêiner) e filhas (um cliente cada): herança, ocupação e nada contado em dobro.
 */
process.env.SUPABASE_DISABLED = '1';
const W = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/comex.js'));
const shipsgo = require('../src/services/shipsgo.service');
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const T = '2026-11-06T10:00:00Z';
const MODELO = [['Fechamento', 'Contrato assinado'], ['Produção/Embarque', 'Commercial Invoice'], ['Trânsito', 'BL Original / Telex Release'], ['Desembaraço', 'ICMS-AL pago (1,6%)'], ['Desembaraço', 'DI / DUIMP registrada'], ['Entrega', 'NF de saída / venda'], ['Entrega', 'Comprovante de entrega assinado']];
function banco() {
  const d = W.prepararBanco({ ops: [{ _id: 'o27', id: 'OP27', cliente: 'Gisele', nome: 'Carga', status: 'contrato', criadaEm: '2026-10-01', resp: 'Davi' }, { _id: 'o9', id: 'OP9', cliente: 'Lima', status: 'producao', criadaEm: '2026-10-02' }],
    fin: [{ _id: 'f1', op: 'OP27', tipo: 'Receita', desc: 'Sinal', valor: 100, status: 'Previsto', vencimento: '2026-11-10' }], docs: [{ _id: 'bl', op: 'OP27', nome: 'BL', tipo: 'bl' }, { _id: 'inv', op: 'OP27', nome: 'Invoice', tipo: 'invoice' }, { _id: 'ct', op: 'OP27', nome: 'Contrato Gisele', tipo: 'contrato' }],
    checklists: {}, opStatusHist: [] });
  W.virarMae(d, 'OP27');
  W.criarFilha(d, 'OP27', { cliente: 'Gisele', nome: 'Empilhadeiras', m3: 30, pesoKg: 8000, fobUSD: 20000 }, 'Davi', T, MODELO);
  W.criarFilha(d, 'OP27', { cliente: 'Márcio', nome: 'Contêineres', m3: 16, pesoKg: 6000, fobUSD: 12000 }, 'Davi', T, MODELO);
  return d;
}
const op = (d, id) => d.ops.find(o => o.id === id);

console.log('\nEstrutura:');
{
  const d = banco(), m = op(d, 'OP27');
  ok(W.ehMae(m) && m.cliente === '' && m.clienteAnterior === 'Gisele', 'a OP27 vira mãe; o cliente sai e fica guardado');
  ok(op(d, 'OP27.1').maeId === 'OP27' && op(d, 'OP27.2').cliente === 'Márcio' && W.proximoCodigoFilha(d, 'OP27') === 'OP27.3', 'filhas numeradas: OP27.1, OP27.2, e a próxima seria OP27.3');
  ok(d.fin[0].op === 'OP27' && d.fin.length === 1, 'nenhum lançamento muda de lugar');
  ok(/Já existe/.test(W.criarFilha(d, 'OP27', { id: 'op9', cliente: 'X' }).msg) && /cliente/.test(W.criarFilha(d, 'OP27', {}).msg) && !W.criarFilha(d, 'OP9', { cliente: 'X' }).ok, 'recusa código repetido, filha sem cliente e mãe que não é mãe');
  ok(!W.virarMae(d, 'OP27.1').ok && !W.virarMae(d, 'OP27').ok, 'filha não vira mãe, e mãe não vira mãe de novo');
  const lista = d.checklists['OP27.1'].map(i => i.titulo).join();
  ok(/Contrato/.test(lista) && /ICMS/.test(lista) && /NF de saída/.test(lista) && /entrega/.test(lista) && !/Invoice|BL|DUIMP/.test(lista), 'checklist da filha só com o que é por cliente: contrato, ICMS, NF e entrega');
  ok(!W.desfazerMae(d, 'OP27').ok, 'com filhas, não dá para desfazer');
  W.desligarFilha(d, 'OP27.1'); W.desligarFilha(d, 'OP27.2');
  ok(!op(d, 'OP27.1').maeId && W.desfazerMae(d, 'OP27').ok && !W.ehMae(m) && m.cliente === 'Gisele', 'sem filhas, volta a ser a operação de antes, com o cliente');
}

console.log('\nHerança:');
{
  const d = banco(), m = op(d, 'OP27');
  Object.assign(m, { navio: 'MSC LORETO', bl: 'BL123', eta: '2026-12-20', embarque: '2026-11-20', duimp: '26BR1', fornecedor: 'Fab', containers: [{ numero: 'MSCU1234567', tipo: "40'HQ" }] });
  ok(W.sincronizarMaes(d, 'Davi', T) === 2, 'as duas filhas recebem os dados do contêiner');
  const f = op(d, 'OP27.2');
  ok(f.navio === 'MSC LORETO' && f.bl === 'BL123' && f.eta === '2026-12-20' && f.duimp === '26BR1' && f.fornecedor === 'Fab' && f.containers[0].numero === 'MSCU1234567', 'navio, BL, ETA, DUIMP, fornecedor e contêiner aparecem na filha');
  ok(f.containers !== m.containers, 'é uma cópia, não o mesmo objeto');
  ok(W.sincronizarMaes(d, 'Davi', T) === 0, 'rodar de novo não muda nada');
  f.navio = 'Errado'; W.sincronizarMaes(d, 'Davi', T);
  ok(f.navio === 'MSC LORETO', 'o que for mudado na filha volta ao que está na mãe');
  ok(f.cliente === 'Márcio' && f.nome === 'Contêineres', 'cliente e mercadoria da filha não são tocados');
  delete m.navio; W.sincronizarMaes(d, 'Davi', T);
  ok(f.navio === undefined, 'campo apagado na mãe também sai da filha');

  m.status = 'producao'; W.sincronizarMaes(d, 'Davi', T);
  ok(f.status === 'producao' && d.opStatusHist.some(h => h.op === 'OP27.2' && h.para === 'producao' && h.tipo === 'herdada' && h.por === 'Davi'), 'etapa da mãe passa para a filha, com registro');
  m.status = 'chegada'; W.sincronizarMaes(d, 'Davi', T);
  f.status = 'logistica'; const f1 = op(d, 'OP27.1');
  ok(f1.status === 'chegada', 'chegada também é herdada');
  W.sincronizarMaes(d, 'Davi', T);
  ok(f.status === 'logistica' && f1.status === 'chegada', 'depois da chegada, cada filha anda sozinha: mãe não puxa de volta');
  f1.status = 'travada'; m.status = 'embarcado'; W.sincronizarMaes(d, 'Davi', T);
  ok(f1.status === 'travada' && f.status === 'logistica', 'filha travada continua travada');
  m.status = 'concluida'; f1.status = 'documentacao'; W.sincronizarMaes(d, 'Davi', T);
  ok(f1.status === 'documentacao', 'mãe concluída não encerra a filha');
  const naoE = banco(), comum = op(naoE, 'OP9'), antes = JSON.stringify(comum); W.sincronizarMaes(naoE, 'x', T);
  ok(JSON.stringify(comum) === antes, 'operação comum não é tocada');

  const perm = o => W.etapasPermitidas(o).map(s => s.k);
  ok(!perm(f).includes('embarcado') && perm(f).includes('logistica') && perm(f).includes('entregue'), 'na filha, só as etapas que são dela');
  ok(perm(m).includes('embarcado') && !perm(m).includes('entregue') && !perm(m).includes('logistica'), 'na mãe, só as etapas do contêiner');
  ok(perm(comum).length === W.STATUS_OP.length, 'operação comum tem todas as etapas');
  const mudadas = shipsgo.aplicarEvento((() => { const b = banco(); op(b, 'OP27').containers = [{ numero: 'MSCU1234567' }]; W.sincronizarMaes(b, 'x', T); return b.ops; })(), { container: 'MSCU1234567', eta: '2027-01-05', descarga: '2027-01-06' }, T);
  ok(mudadas.length === 3 && mudadas.every(o => o.eta === '2027-01-05' && o.containers[0].descarga === '2027-01-06'), 'aviso da ShipsGo atualiza a mãe e as filhas');
}

console.log('\nDocumentos:');
{
  const d = banco(), f = op(d, 'OP27.1');
  f.status = 'chegada';
  const faltam = W.completudeDocs(d, f).faltam.map(t => t.k);
  ok(!faltam.includes('bl') && !faltam.includes('invoice'), 'BL e invoice da mãe valem para a filha');
  const sem = JSON.parse(JSON.stringify(d)); sem.docs = sem.docs.filter(x => x.op !== 'OP27');
  ok(W.completudeDocs(sem, sem.ops.find(o => o.id === 'OP27.1')).faltam.some(t => t.k === 'bl'), 'sem o BL na mãe, a filha cobra');
  const portal = require('../src/services/portal.service');
  const vis = JSON.parse(JSON.stringify(d));
  vis.docs.push({ _id: 'lib', op: 'OP27', nome: 'Invoice do contêiner', tipo: 'invoice', link: 'x', liberadoCliente: true }, { _id: 'lib2', op: 'OP27.1', nome: 'Contrato da Gisele', tipo: 'contrato', link: 'y', liberadoCliente: true });
  const nomes = portal.dados(vis, W, { tipo: 'cliente', op: 'OP27.1' }, T).documentos.map(x => x.nome);
  ok(nomes.includes('Contrato da Gisele') && !nomes.includes('Invoice do contêiner'), 'portal do cliente não herda documentos da mãe, que citam o outro cliente');
}

console.log('\nOcupação:');
{
  const d = banco(), m = op(d, 'OP27');
  m.containers = [{ numero: 'MSCU1234567', tipo: "40'HQ" }];
  let oc = W.ocupacaoDaMae(d, 'OP27');
  ok(oc.capM3 === 76 && oc.m3 === 46 && oc.livreM3 === 30, "40' HQ: 76 m³, 46 ocupados, 30 livres");
  ok(oc.capKg === 26500 && oc.kg === 14000 && oc.livreKg === 12500 && oc.fobUSD === 32000 && !oc.excedeu, 'peso ocupado e livre, e FOB das filhas');
  m.capM3 = '40'; oc = W.ocupacaoDaMae(d, 'OP27');
  ok(oc.capM3 === 40 && oc.livreM3 === -6 && oc.excedeu, 'capacidade digitada vale, e passar dela é apontado');
  delete m.capM3; m.containers = [];
  m.tipoConteiner = "20'DC"; ok(W.ocupacaoDaMae(d, 'OP27').capM3 === 33, 'sem contêiner cadastrado, vale o tipo escolhido');
  delete m.tipoConteiner; const sc = W.ocupacaoDaMae(d, 'OP27'); ok(sc.capM3 === 0 && sc.livreM3 === null, 'sem capacidade, não inventa o livre');
  d.quotes = { q1: { id: 'q1', fields: { opNum: 'OP50' }, items: [{ q: 2, u: 1000, p: 500, cbm: 4 }, { q: 1, u: 500, p: 100, cbm: 2 }] }, q2: { id: 'q2', fields: {}, items: [{ q: 2, u: 1000, p: 500, cbm: 4 }, { q: 1, u: 500, p: 100 }] } };
  const ids = W.criarFilha(d, 'OP27', { cliente: 'Cotado', quoteId: 'q1' }, 'x', T), md = W.medidasFilha(d, ids.op);
  ok(md.m3.v === 10 && md.pesoKg.v === 1100 && md.fobUSD.v === 2500 && md.m3.fonte === 'cotação', 'filha com cotação: m³, peso e FOB vêm dela');
  ids.op.m3 = 12; ok(W.medidasFilha(d, ids.op).m3.v === 12 && W.medidasFilha(d, ids.op).m3.fonte === 'digitado', 'o digitado vale mais que a cotação');
  ids.op.quoteId = 'q2'; delete ids.op.m3;
  const inc = W.medidasFilha(d, ids.op); ok(inc.m3.v === 0 && inc.pesoKg.v === 1100, 'item sem CBM: não soma m³ pela metade');
  ok(W.ocupacaoDaMae(d, 'OP27').semMedida.includes(ids.op.id), 'e a filha sem m³ é apontada');
}

console.log('\nNada contado em dobro:');
{
  const d = banco(), m = op(d, 'OP27');
  m.status = 'embarcado'; m.containers = [{ numero: 'MSCU1234567', tipo: "40'HQ" }]; W.sincronizarMaes(d, 'x', T);
  ok(!W.ativa(m) && W.ativa(op(d, 'OP27.1')) && W.ativa(op(d, 'OP9')) && W.emAndamento(m), 'a mãe não conta como operação ativa, mas aparece na lista');
  ok(d.ops.filter(W.ativa).length === 3, 'ativas: as 2 filhas e a operação comum');
  ok(W.conteineres(d, '2026-11-06').length === 1 && W.conteineres(d, '2026-11-06')[0].op === 'OP27', 'o contêiner aparece uma vez, na mãe: free time contado uma vez');
  const fech = W.fechadasNoMes(d, '2026-11');
  ok(fech.includes('OP27.1') && fech.includes('OP27.2') && !fech.includes('OP27'), 'a meta conta cada filha fechada, não a mãe');
  const dv = W.desempenhoOperacoes(d, '2026-11-06');
  ok(dv && !JSON.stringify(dv).includes('"OP27"'), 'desempenho sem a mãe');
  const cob = W.ligadosDaOp(d, 'OP27');
  ok(cob.fin === 1 && cob.docs === 3, 'o que está ligado à mãe continua nela');
}

console.log('\nCódigo e exclusão:');
{
  const d = banco();
  const r = W.renomearOperacao(d, 'OP27', 'OP28', 'x', T);
  ok(r.ok && op(d, 'OP27.1').maeId === 'OP28' && W.filhasDe(d, 'OP28').length === 2, 'renomear a mãe mantém as filhas ligadas');
  ok(/filhas/.test(W.excluirOperacao(d, 'OP28', 'x').msg) && d.ops.length === 4, 'mãe com filhas não pode ser excluída');
  ok(W.excluirOperacao(d, 'OP27.1', 'x').ok && W.excluirOperacao(d, 'OP27.2', 'x').ok && W.excluirOperacao(d, 'OP28', 'x').ok, 'sem filhas, pode');
}
console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
process.exit(falhou ? 1 : 0);
