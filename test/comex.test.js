/**
 * Comércio exterior do Hub 2.0: custeio (simulado → previsto → realizado) com
 * câmbio, relógio do contêiner, conta-corrente do cliente, motor tributário
 * por data, crédito, exceções da Torre, PTAX, ShipsGo, bancos, portais e MCP.
 * Números conferidos à mão.
 */
process.env.SUPABASE_DISABLED = '1';
const W = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/comex.js'));
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const perto = (a, b, t) => Math.abs(a - b) < (t || 0.01);

(async () => {
  console.log('\nCusteio da operação:');
  const q = { fields: { opNum: 'OP50', txFrete: '5', txDesp: '5', pctInv: '100', icmsEnt: '0', freteUSD: '200', seguro: '0', capatazia: '0', siscomex: '100', afrmm: '0', honorarios: '0', transporte: '0' }, items: [{ q: 10, u: 100, p: 1, ii: 10, ipi: 5, pis: 2.1, cofins: 9.65 }], exps: [], preco: 10000 };
  const cq = W.custoCotacao(q);
  // FOB 5.000 · frete 1.000 · CIF 6.000 · II 600 · IPI 330 · PIS 126 · COFINS 579 · Siscomex 100
  ok(perto(cq.valores.fob, 5000) && perto(cq.valores.frete, 1000) && perto(cq.valores.impostos, 1635) && perto(cq.valores.porto, 100) && perto(cq.total, 7735), 'custo da cotação com as mesmas fórmulas da tela: FOB 5.000 + frete 1.000 + impostos 1.635 + Siscomex 100 = 7.735');
  ok(perto(cq.fobUSD, 1000) && cq.taxa === 5, 'dólar da cotação: US$ 1.000 a R$ 5,00');
  const cqE = W.custoCotacao({ fields: Object.assign({}, q.fields, { icmsEnt: '12' }), items: q.items, exps: [] });
  // ICMS por dentro: (5000+1000+600+330+126+579+100)/0,88 × 12%
  ok(perto(cqE.tributos.ICMS, (5000 + 1000 + 600 + 330 + 126 + 579 + 100) / 0.88 * 0.12), 'ICMS de entrada por dentro, igual à planilha Nacionalização AL');

  const db = {
    users: { samir: { nome: 'Samir', perfilHub: 'diretoria' }, davi: { nome: 'Davi', perfilHub: 'operacoes' }, matheus: { nome: 'Matheus', perfilHub: 'frete' }, ivina: { nome: 'Ívina', perfilHub: 'documentos' } },
    quotes: { q1: q },
    ops: [{ _id: 'o50', id: 'OP50', cliente: 'Cliente A', status: 'embarcado', statusEm: '2026-10-01', modalidade: 'conta e ordem', eta: '2026-11-05',
      containers: [{ numero: 'MSCU1234567', tipo: "40'HQ", descarga: '2026-10-20', armador: 'MSC' }, { numero: 'MSCU7654321', tipo: "40'RF", descarga: '2026-10-25' }, { numero: 'TGHU0000001', tipo: "20'DC" }] }],
    fin: [
      { _id: 'r1', op: 'OP50', tipo: 'Receita', valor: 6000, status: 'Realizado', vencimento: '2026-09-10', liquidadoEm: '2026-09-12', desc: 'Numerário 1' },
      { _id: 'r2', op: 'OP50', tipo: 'Receita', valor: 4000, status: 'Previsto', vencimento: '2026-11-10', desc: 'Numerário 2' },
      { _id: 'd1', op: 'OP50', tipo: 'Despesa', valor: 5200, status: 'Realizado', vencimento: '2026-09-15', liquidadoEm: '2026-09-15', desc: 'Pagamento fábrica 100% FOB' },
      { _id: 'd2', op: 'OP50', tipo: 'Despesa', valor: 1000, status: 'Realizado', vencimento: '2026-09-20', liquidadoEm: '2026-09-20', desc: 'Frete internacional' },
      { _id: 'd3', op: 'OP50', tipo: 'Despesa', valor: 1700, status: 'Previsto', vencimento: '2026-11-06', desc: 'Impostos DUIMP', categoria: 'Imposto importação' },
      { _id: 'd4', op: 'OP50', tipo: 'Despesa', valor: 300, status: 'Previsto', vencimento: '2026-11-08', desc: 'Despachante e capatazia' }
    ],
    hubCambio: [{ _id: 'c1', op: 'OP50', status: 'fechado', valorME: 1000, taxa: 5.2, taxaPrevista: 5 }, { _id: 'c2', op: 'OP50', status: 'previsto', valorME: 200, taxaPrevista: 5, liquidacao: '2026-10-28' }]
  };
  ok(W.classeDe(db.fin[2]) === 'fob' && W.classeDe(db.fin[3]) === 'frete' && W.classeDe(db.fin[4]) === 'impostos' && W.classeDe(db.fin[5]) === 'porto' && W.classeDe({ desc: 'Demurrage MSC' }) === 'demurrage', 'classe de custo pela descrição: fábrica, frete, impostos, porto, demurrage');
  ok(W.classeDe({ desc: 'Frete internacional', custo: 'nacional' }) === 'nacional', 'classe corrigida à mão vence a da descrição');
  const c = W.custeioOp(db, 'OP50', { ptax: 5.4 });
  ok(c.temCotacao && perto(c.simulado, 7735) && perto(c.previsto, 7735), 'sem previsto aprovado, o previsto parte do simulado da cotação');
  ok(perto(c.realizado, 6200) && perto(c.aPagar, 2000), 'realizado R$ 6.200 (fábrica + frete) e a pagar R$ 2.000 (impostos + porto)');
  ok(perto(c.usdFechado, 1000) && perto(c.usdAberto, 200) && perto(c.variacaoCambial, 200) && perto(c.impactoAberto, 80), 'câmbio: US$ 1.000 fechados a 5,20 (+R$ 200) e US$ 200 abertos pela PTAX 5,40 (+R$ 80)');
  ok(perto(c.projetado, 8280) && perto(c.receita, 10000) && perto(c.margemProjetada, 0.172), 'custo projetado R$ 8.280 contra receita de R$ 10.000: margem 17,2%');
  ok(perto(c.desvio, (8280 - 7735) / 7735, 1e-6), 'desvio do custo contra o previsto: +7,0%');
  W.aprovarPrevisto(db, 'OP50', { fob: 5000, frete: 1000, impostos: 1700, porto: 100, nacional: 500 }, { taxaPrevista: 5 }, 'Samir', '2026-10-01T10:00:00Z');
  const c2 = W.custeioOp(db, 'OP50', { ptax: 5.4 });
  ok(c2.previstoAprovado && perto(c2.previsto, 8300) && c2.aprovadoPor === 'Samir', 'previsto aprovado pelo Samir vira a régua (R$ 8.300)');
  ok(perto(c2.projetado, 8780) && c2.linhas.find(l => l.k === 'nacional').semLancamento, 'frete nacional ainda sem lançamento continua no projetado pelo previsto (R$ 500): a margem não fica maquiada');

  console.log('\nCâmbio e exposição:');
  const ex = W.exposicaoCambio(db, 5.4, '2026-10-26');
  ok(perto(ex.usd, 200) && perto(ex.brlPrevisto, 1000) && perto(ex.impacto, 80) && ex.semanas.length === 1, 'exposição: US$ 200 previstos a 5,00; pela PTAX 5,40 custam R$ 80 a mais');
  ok(ex.semContrato.length === 0, 'todo o dólar da OP50 está fechado ou previsto');

  console.log('\nRelógio do contêiner:');
  const r1 = W.relogioConteiner(db, db.ops[0].containers[0], '2026-10-26');
  ok(r1.freeTime === 7 && r1.limite === '2026-10-26' && r1.status === 'atencao' && r1.restantes === 0, 'dry: descarga 20/10 + 7 dias (dia 1 = descarga) → limite 26/10, alerta no último dia');
  const r1b = W.relogioConteiner(db, db.ops[0].containers[0], '2026-10-29');
  ok(r1b.status === 'vencido' && r1b.excedidos === 3 && r1b.custoUSD === 225, 'três dias depois: demurrage de 3 diárias × US$ 75 = US$ 225');
  const r2 = W.relogioConteiner(db, db.ops[0].containers[1], '2026-10-26');
  ok(r2.freeTime === 5 && r2.limite === '2026-10-29' && r2.status === 'ok' && r2.diaria === 460, 'reefer: 5 dias de free time e diária de US$ 460');
  const dbFT = Object.assign({}, db, { hubPainel: { _comex: { freeTime: { msc: 14 } } } });
  ok(W.relogioConteiner(dbFT, db.ops[0].containers[0], '2026-10-26').limite === '2026-11-02', 'free time negociado por armador (MSC 14 dias) vence o padrão');
  ok(W.relogioConteiner(db, Object.assign({}, db.ops[0].containers[0], { devolucao: '2026-10-25' }), '2026-11-10').status === 'devolvido', 'devolvido no prazo para de contar');
  ok(W.conteineres(db, '2026-10-29')[0].status === 'vencido' && W.conteineres(db, '2026-10-29').length === 3, 'lista de contêineres começa pelo que está em demurrage');

  console.log('\nConta-corrente do cliente:');
  const cc = W.contaCorrente(db, 'OP50', '2026-10-26');
  ok(cc.itemizado && perto(cc.recebido, 6000) && perto(cc.pago, 6200) && perto(cc.saldo, -200), 'conta e ordem: recebido 6.000, pago 6.200 → a WindGate está financiando R$ 200');
  ok(perto(cc.saldoFinal, 1800) && cc.situacao === 'a devolver ao cliente', 'saldo final: 10.000 − 8.200 = R$ 1.800 a devolver ao cliente');
  ok(cc.movimentos.filter(m => m.realizado).slice(-1)[0].saldo === -200, 'extrato com saldo corrente só do realizado');
  const ccE = W.contaCorrente(Object.assign({}, db, { ops: [Object.assign({}, db.ops[0], { modalidade: 'encomenda' })] }), 'OP50', '2026-10-26');
  ok(!ccE.itemizado && ccE.situacao === 'preço fechado', 'encomenda: prestação sem abrir custos (preço fechado)');

  console.log('\nMotor tributário por data:');
  const t26 = W.tributosNaData({}, '2026-10-26'), t27 = W.tributosNaData({}, '2027-03-01'), t32 = W.tributosNaData({}, '2032-12-31'), t33 = W.tributosNaData({}, '2033-01-01');
  ok(t26.pisCofinsImp && t26.ipi && !t26.cbs.recolhe && t26.cbs.aliq === 0.9 && t26.ibs.aliq === 0.1 && t26.beneficioAL, '2026: PIS/COFINS valem; CBS 0,9% e IBS 0,1% só em teste; benefício de AL vale');
  ok(!t27.pisCofinsImp && t27.cbs.recolhe && !t27.ipi && t27.icmsFator === 1, '2027: PIS/COFINS extintos, CBS cobrada, IPI zerado, ICMS inteiro');
  ok(t32.beneficioAL && t32.icmsFator === 0.6 && !t33.beneficioAL && t33.icmsFator === 0, '31/12/2032 é o último dia do benefício de AL (ICMS a 60%); em 2033 ICMS extinto');
  ok(W.avisosTributarios({}, '2027-02-01').some(a => /CBS/.test(a)), 'operação que entrega em 2027 recebe aviso para recalcular');
  const dbT = { hubPainel: { _tributos: W.REGRAS_TRIBUTARIAS.map(r => r.k === 'cbs' && r.de === '2027-01-01' ? Object.assign({}, r, { aliq: 9.3 }) : r) } };
  ok(W.tributosNaData(dbT, '2027-05-01').cbs.aliq === 9.3, 'alíquota ajustada pela diretoria passa a valer sem mexer no código');
  const sim = W.simularTransicao({}, 600000, 1500000);
  ok(sim.find(s => s.ano === 2028).margem === 1500000 && perto(sim.find(s => s.ano === 2030).ganho, 480000) && sim.find(s => s.ano === 2033).margem === 900000, 'simulador: benefício de 600 mil cai a 480 mil em 2030 e zera em 2033 (margem 1,5 mi → 900 mil)');

  console.log('\nCrédito, contratos, compliance e exceções:');
  db.hubPainel = { _credito: { 'Cliente A': 100 } };
  const cr = W.creditoClientes(db, '2026-10-26')[0];
  ok(cr.cliente === 'Cliente A' && perto(cr.exposicao, 200) && cr.estourado && cr.atrasoMedio === 2, 'crédito: R$ 200 financiados acima do limite de R$ 100; atraso médio de 2 dias');
  ok(!W.contratoDaOp(db, db.ops[0]), 'conta e ordem sem contrato é detectada');
  db.hubContratos = [{ _id: 'k1', cliente: 'Cliente A', tipo: 'guarda-chuva', status: 'assinado' }];
  ok(!!W.contratoDaOp(db, db.ops[0]), 'contrato guarda-chuva do cliente cobre a operação');
  ok(/REAJUSTE TRIBUTÁRIO/.test(W.modeloContrato({ modalidade: 'conta e ordem' })) && /ADQUIRENTE/.test(W.modeloContrato({ modalidade: 'conta e ordem' })) && /ENCOMENDANTE/.test(W.modeloContrato({ modalidade: 'encomenda' })), 'modelo de contrato com cláusula de reajuste e partes certas por modalidade');
  db.hubCompliance = [{ _id: 'x1', tipo: 'Certificado A1', empresa: 'SF Trading', validade: '2026-11-10' }, { _id: 'x2', tipo: 'Radar', empresa: 'JeT', validade: '2027-06-01' }];
  ok(W.complianceVencendo(db, '2026-10-26', 30).length === 1 && W.complianceVencendo(db, '2026-10-26', 30)[0].dias === 15, 'compliance: certificado A1 vence em 15 dias; Radar de 2027 fora do aviso');
  db.ops[0].etaHist = [{ de: '2026-10-30', para: '2026-11-05', em: '2026-10-25T10:00:00Z' }];
  const exS = W.excecoes(db, 'samir', '2026-10-29', { ptax: 5.4 }), tiposS = new Set(exS.map(x => x.tipo));
  ok(['conteiner', 'eta', 'cambio', 'credito', 'compliance', 'custo'].every(t => tiposS.has(t)), 'Torre do Samir: contêiner, ETA, câmbio a fechar, crédito, compliance e custo acima do previsto');
  ok(exS[0].nivel === 3, 'exceções ordenadas pela gravidade');
  const exI = W.excecoes(db, 'ivina', '2026-10-29', { ptax: 5.4 });
  ok(!exI.some(x => ['cambio', 'credito', 'custo', 'margem', 'aprovacao', 'banco'].includes(x.tipo)), 'Ívina não recebe exceção com dinheiro');
  const exM = W.excecoes(db, 'matheus', '2026-10-29', {});
  ok(exM.some(x => x.tipo === 'conteiner') && !exM.some(x => x.tipo === 'credito'), 'Matheus recebe os contêineres, sem crédito de cliente');
  db.ops[0].plano = { embarcado: '2026-09-25' };
  db.opStatusHist = [{ _id: 'h', op: 'OP50', de: 'container_enviado_porto', para: 'embarcado', em: '2026-10-01T12:00:00Z' }];
  ok(W.marcos(db, db.ops[0]).find(m => m.k === 'embarcado').atraso === 6, 'marco planejado × real: embarque começou 6 dias depois do plano');

  console.log('\nServiços: PTAX, ShipsGo, bancos, portais, MCP:');
  const cambio = require('../src/services/cambio.service'); cambio._reset();
  let urlBCB = '';
  const px = await cambio.ptax(async u => { urlBCB = u; return { ok: true, json: async () => ({ value: [{ cotacaoCompra: 5.39, cotacaoVenda: 5.40, dataHoraCotacao: '2026-10-23 13:05' }, { cotacaoCompra: 5.44, cotacaoVenda: 5.45, dataHoraCotacao: '2026-10-26 13:04' }] }) }; }, new Date('2026-10-26T15:00:00Z'));
  ok(/olinda\.bcb\.gov\.br/.test(urlBCB) && px.venda === 5.45 && perto(px.variacao, 0.05 / 5.40, 1e-9), 'PTAX do Banco Central: última venda 5,45 e variação sobre o dia anterior');
  const sg = require('../src/services/shipsgo.service');
  const ev = sg.interpretarEvento({ shipment: { container_number: 'MSCU1234567', route: { port_of_discharge: { date_of_discharge: '2026-11-07T00:00:00Z' } }, movements: [{ event: 'Discharged', timestamp: '2026-11-07T05:00:00Z' }] } });
  ok(ev.container === 'MSCU1234567' && ev.eta === '2026-11-07' && ev.descarga === '2026-11-07', 'webhook ShipsGo: contêiner, ETA e descarga lidos');
  const ops2 = [{ id: 'OP50', eta: '2026-11-05', containers: [{ numero: 'MSCU1234567' }] }];
  const mud = sg.aplicarEvento(ops2, ev, '2026-10-26T12:00:00Z');
  ok(mud.length === 1 && mud[0].eta === '2026-11-07' && mud[0].etaHist[0].de === '2026-11-05' && mud[0].containers[0].descarga === '2026-11-07', 'evento atualiza o ETA (com histórico) e liga o relógio do free time');
  ok(sg.aplicarEvento(mud, ev, 'x').length === 0, 'evento repetido não regrava nada');
  const bancos = require('../src/services/bancos.service');
  const tr = bancos.normalizar({ _content: [{ transactionDate: '2026-10-02', amount: '80000.00', creditDebitType: 'DEBITO', transactionName: 'PIX', historicComplement: 'FABRICA' }, { transactionDate: '05/10/2026', amount: { amount: 1500 }, creditDebitType: 'CREDITO', transactionName: 'TED' }] });
  ok(tr.length === 2 && tr[0].valor === -80000 && tr[0].memo === 'PIX FABRICA' && tr[1].data === '2026-10-05' && tr[1].valor === 1500, 'extrato da API do banco vira movimentos (débito negativo, datas ISO)');
  let erroB = null; try { await bancos.extrato('santander', '2026-10-01', '2026-10-31'); } catch (e) { erroB = e; }
  ok(erroB && erroB.semIntegracao, 'sem credenciais no servidor, a API do banco avisa em vez de falhar');
  process.env.SANTANDER_CLIENT_ID = 'id'; process.env.SANTANDER_CLIENT_SECRET = 's'; process.env.SANTANDER_CERT_ARQUIVO = '/tmp/x.pfx'; process.env.SANTANDER_CONTA = '0001.000130001234';
  const chamadas = [];
  const rb = await bancos.extrato('santander', '2026-10-01', '2026-10-31', async (url, o) => { chamadas.push([url, o]); if (/token/.test(url)) return { status: 200, json: { access_token: 'TK' } }; return { status: 200, json: { _content: [{ transactionDate: '2026-10-03', amount: 10, creditDebitType: 'CREDITO', transactionName: 'X' }] } }; });
  ok(/client_credentials/.test(chamadas[0][1].body) && chamadas[1][1].headers.Authorization === 'Bearer TK' && /statements\/0001\.000130001234\?initialDate=2026-10-01&finalDate=2026-10-31/.test(chamadas[1][0]) && rb.transacoes.length === 1 && rb.empresa === 'WindGate', 'Santander: token por client_credentials e extrato do período da conta da SF');
  ['SANTANDER_CLIENT_ID', 'SANTANDER_CLIENT_SECRET', 'SANTANDER_CERT_ARQUIVO', 'SANTANDER_CONTA'].forEach(k => delete process.env[k]);
  process.env.WINDGATE_DB_SECRET = 'segredo-teste';
  const portal = require('../src/services/portal.service');
  const tk = portal.gerar('OP50', 'cliente', 30, Date.parse('2026-10-26T00:00:00Z'));
  ok(portal.ler(tk, Date.parse('2026-11-01T00:00:00Z')).op === 'OP50' && !portal.ler(tk, Date.parse('2026-12-30T00:00:00Z')) && !portal.ler(tk.slice(0, -2) + 'xx', Date.parse('2026-11-01T00:00:00Z')), 'link do portal assinado: abre na validade, expira e não aceita adulteração');
  db.docs = [{ _id: 'dd1', op: 'OP50', nome: 'BL', link: 'https://x/bl.pdf', liberadoCliente: true }, { _id: 'dd2', op: 'OP50', nome: 'Invoice interna', link: 'https://x/inv.pdf' }];
  const pc = portal.dados(db, W, { op: 'OP50', tipo: 'cliente' });
  const txt = JSON.stringify(pc);
  ok(pc.documentos.length === 1 && pc.financeiro.saldoFinal === 1800 && !/margem|previsto|custeio|lucro/i.test(txt) && !/taxaPrevista/.test(txt), 'portal do cliente: só o documento liberado, conta-corrente e nada de margem ou custo interno');
  const pf = portal.dados(db, W, { op: 'OP50', tipo: 'fornecedor' });
  ok(!pf.financeiro && !pf.cliente && !pf.destino && pf.pedido.incoterm === 'FOB', 'portal do fornecedor: sem cliente, destino nem financeiro');
  const pdz = portal.dados(db, W, { op: 'OP50', tipo: 'despachante' });
  ok(pdz.documentos.length === 2 && !pdz.financeiro && pdz.modalidade === 'conta e ordem', 'portal do despachante: todos os documentos e a modalidade, sem financeiro');
  const mcp = require('../src/services/mcp.service');
  const ini = mcp.tratar({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, db, W);
  const lst = mcp.tratar({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, db, W);
  const call = mcp.tratar({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'resumo_operacao', arguments: { op: 'op50' } } }, db, W, '2026-10-26');
  ok(ini.result.capabilities.tools && lst.result.tools.length === 5 && JSON.parse(call.result.content[0].text).contaCorrente.saldo === -200, 'MCP: inicializa, lista 5 ferramentas e responde o resumo da OP50');
  ok(mcp.tratar({ jsonrpc: '2.0', method: 'notifications/initialized' }, db, W) === null && mcp.tratar({ jsonrpc: '2.0', id: 9, method: 'x' }, db, W).error.code === -32601, 'MCP: notificação sem resposta; método desconhecido devolve erro');

  console.log('\nIA: conferência de documentos (simulada):');
  const ia = require('../src/services/ia.service');
  process.env.ANTHROPIC_API_KEY = 'teste'; let corpo = null;
  const rIA = await ia.conferirDocumentos([{ nome: 'invoice.pdf', mime: 'application/pdf', base64: 'JVBERg==' }, { nome: 'pl.png', mime: 'image/png', base64: 'iVBO' }, { nome: 'x.docx', mime: 'application/msword', base64: 'AA' }], { op: 'OP50' },
    async (u, o) => { corpo = JSON.parse(o.body); return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '{"documentos":[{"tipo":"invoice"}],"divergencias":[{"campo":"pesoBruto","gravidade":"alta"}],"alertas":["ok"]}' }] }) }; });
  const blocos = corpo.messages[0].content.map(b => b.type);
  ok(blocos.filter(t => t === 'document').length === 1 && blocos.filter(t => t === 'image').length === 1 && rIA.divergencias[0].campo === 'pesoBruto', 'conferência por IA: PDF e imagem enviados, formato não suportado ignorado, divergência devolvida');
  delete process.env.ANTHROPIC_API_KEY;

  console.log('\nAcesso: Ívina sem dinheiro no servidor:');
  const acesso = require('../src/services/acesso.service');
  const dbA = { users: db.users, fin: db.fin, quotes: db.quotes, hubCambio: db.hubCambio, crmOps: [{ _id: 'n1', nome: 'Neg', valor: 50000 }], ops: db.ops };
  const lI = acesso.paraLeitura(dbA, 'ivina');
  ok(!lI.fin && !lI.quotes && !lI.hubCambio && lI.crmOps[0].valor === undefined && lI.ops.length === 1, 'Ívina lê operações, sem financeiro, cotações, câmbio nem valor dos negócios');
  const gI = acesso.paraGravacao(dbA, { crmOps: [{ _id: 'n1', nome: 'Neg editado' }], fin: [{ _id: 'zz' }], _removidos: { d1: 1, n9: 1 } }, 'ivina');
  ok(gI.crmOps[0].valor === 50000 && gI.crmOps[0].nome === 'Neg editado' && !gI.fin && !gI._removidos.d1 && gI._removidos.n9, 'Ívina edita o negócio sem apagar o valor; não grava nem exclui financeiro');
  ok(acesso.paraLeitura(dbA, 'davi').fin.length === dbA.fin.length, 'Davi continua recebendo o financeiro');

  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
