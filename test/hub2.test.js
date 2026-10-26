/**
 * Hub 2.0 — o sistema novo lê e grava o MESMO banco sem perder nada.
 *
 * Usa um banco com o formato real (todas as coleções, registros antigos sem
 * `_id`, campos que o Hub 2.0 não conhece) e prova que:
 *   1. preparar + gravar + reler preserva 100% dos registros e campos;
 *   2. o servidor de verdade aceita a gravação do Hub e mescla com outro usuário;
 *   3. só some o que o usuário excluiu, e a exclusão vira `_removidos`;
 *   4. as contas do financeiro (painel, DRE, resultado) batem com números conferidos à mão.
 */
const path = require('path'), fs = require('fs'), os = require('os');
const TMP = path.join(os.tmpdir(), `windgate-hub2-${process.pid}.json`);
process.env.WINDGATE_DB_FILE = TMP;
process.env.SUPABASE_DISABLED = '1';
delete process.env.WINDGATE_DB_SECRET;

const W = require('../public/hub/js/regras.js');
const { compararBancos } = require('../src/services/historico.service');

let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const perto = (a, b) => Math.abs(a - b) < 0.005;

function bancoReal() {
  return {
    users: { samir: { nome: 'Samir', pin: '1', fin: true, aprova: true, tabs: ['painel'] }, davi: { nome: 'Davi', pin: '2', fin: true } },
    ops: [
      { _id: 'o1', id: 'OP20', nome: 'Betoneiras', cliente: 'Custódio', status: 'embarcado', statusEm: '2026-10-01', criadaEm: '2026-08-01', eta: '2026-10-30', clickupTaskId: 'x9', campoQueOHubNaoConhece: { a: 1 } },
      { id: 'OP17', nome: 'Axel', cliente: 'Axel', status: 'entregue' }  // registro antigo, sem _id
    ],
    fin: [
      { _id: 'f1', op: 'OP20', tipo: 'Receita', valor: 100000, status: 'Realizado', vencimento: '2026-10-05', liquidadoEm: '2026-10-05', empresa: 'JeT' },
      { _id: 'f2', op: 'OP20', tipo: 'Receita', valor: 50000, status: 'Previsto', vencimento: '2026-10-28', empresa: 'JeT' },
      { _id: 'f3', op: 'OP20', tipo: 'Despesa', valor: 80000, status: 'Realizado', vencimento: '2026-10-02', liquidadoEm: '2026-10-02', empresa: 'WindGate' },
      { _id: 'f4', op: 'OP20', tipo: 'Despesa', valor: 12000, status: 'Previsto', vencimento: '2026-10-20', empresa: 'WindGate', categoria: 'Imposto importação' },
      { _id: 'f5', op: 'WindGate', tipo: 'Despesa', valor: 5000, status: 'Previsto', vencimento: '2026-10-10', fixo: true, recId: 'r1', recIdx: 3, recTot: 12, mesRef: '2026-10', empresa: 'WindGate' },
      { _id: 'f6', op: '', tipo: 'Despesa', valor: 30000, status: 'Realizado', vencimento: '2026-10-03', transf: true, categoria: 'Transferência', empresa: 'WindGate' },
      { _id: 'f7', op: '', tipo: 'Receita', valor: 30000, status: 'Realizado', vencimento: '2026-10-03', transf: true, categoria: 'Transferência', empresa: 'JeT' },
      { _id: 'f8', op: 'WindGate', tipo: 'Receita', valor: 20000, status: 'Previsto', vencimento: '2026-10-15', categoria: 'Empréstimo', empresa: 'JeT' },
      { tipo: 'Despesa', valor: 999, status: 'Previsto', vencimento: '2026-09-15', op: 'WindGate' } // antigo, sem _id
    ],
    finRec: [{ _id: 'r1', tipo: 'Despesa', valor: 5000, dia: 10, inicio: '2026-08', total: 12 }],
    docs: [{ _id: 'd1', op: 'OP20', nome: 'Invoice', link: 'https://x/inv.pdf', data: '2026-09-01', por: 'Davi' }],
    checklists: { OP20: [{ fase: 'Fechamento', titulo: 'Contrato', status: 'aprovado' }, { fase: 'Fechamento', titulo: 'PI', status: 'pendente' }] },
    quotes: { q1: { fields: { cli: 'X' }, items: [1, 2] } }, qindex: [{ id: 'q1', label: 'q1' }],
    agendaTasks: [{ id: 't1', t: 'tarefa' }], crm: [{ _id: 'c1', nome: 'Cli' }], crmDocs: [], crmOps: [], parceiros: [], fretes: [], fornecedores: [],
    opStatusHist: [{ _id: 'h1', op: 'OP20', de: 'producao', para: 'embarcado', em: '2026-10-01' }],
    agentes: { NSL: { regra: 2.5 } }, gestao: { '2026-10': { metas: [] } }, ncmlib: { '84743100': { ii: 14 } }, mutirao: [{ t: 'x', done: false }],
    ptax: { rate: 5.41 }, settings: { schema: 15, prazosStatus: { embarcado: 75 } }, notifLidas: {}, portos: {}, _removidos: {}
  };
}

(async () => {
  console.log('\n--- 1. Ida e volta no navegador não perde nada ---');
  const original = bancoReal();
  const db = W.prepararBanco(JSON.parse(JSON.stringify(original)));
  const conhecidos = W.fotografarIds(db);
  W.registrarRemocoes(db, conhecidos);
  const relido = JSON.parse(JSON.stringify(db));
  const cmp = compararBancos(original, relido, r => JSON.stringify(Object.assign({}, r, { _id: undefined })));
  ok(cmp.ok, 'todas as coleções e registros preservados (' + cmp.resumo.length + ' coleções conferidas)');
  ok(relido.ops[0].campoQueOHubNaoConhece.a === 1 && relido.ops[0].clickupTaskId === 'x9', 'campos que o Hub 2.0 não usa continuam no registro');
  ok(relido.mutirao && relido.ptax && relido.ncmlib && relido.quotes.q1.items.length === 2, 'chaves fora das coleções (cotações, PTAX, NCM…) intactas');
  ok(relido.ops[1]._id === W.idDeterministico(original.ops[1]), 'registro antigo ganha o MESMO id que o sistema atual e o servidor calculam');
  ok(Object.keys(relido._removidos).length === 0, 'nada marcado como excluído sem ninguém excluir');

  console.log('\n--- 2. Servidor real: Hub grava, outro usuário grava, nada se perde ---');
  fs.writeFileSync(TMP, JSON.stringify(original));
  const app = require('../src/server');
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  const post = b => fetch(base + '/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const get = async () => (await (await fetch(base + '/api/db')).json()).db;

  const hub = W.prepararBanco(await get());
  let kHub = W.fotografarIds(hub);
  hub.fin.unshift({ _id: 'hub-novo', op: 'OP20', tipo: 'Despesa', valor: 777, status: 'Previsto', vencimento: '2026-10-25' });
  W.realizar(hub.fin.find(l => l._id === 'f2'), 50000, '2026-10-24');
  hub.ops[0].containers = [{ numero: 'MSCU1234567', tipo: "40'HQ" }];
  kHub = W.registrarRemocoes(hub, kHub);
  let r = await post(hub); ok(r.status === 200, 'servidor aceita a gravação do Hub 2.0');

  const outro = await get();  // sistema atual, outro usuário, em paralelo
  outro.fin.unshift({ _id: 'legado-novo', op: 'OP17', tipo: 'Receita', valor: 123, status: 'Previsto', vencimento: '2026-11-01' });
  r = await post(outro); ok(r.status === 200, 'sistema atual grava em seguida');

  const fim = await get();
  ok(fim.fin.some(l => l._id === 'hub-novo') && fim.fin.some(l => l._id === 'legado-novo'), 'os dois lançamentos novos convivem (nenhum apagou o outro)');
  ok(fim.ops[0].containers && fim.ops[0].containers[0].numero === 'MSCU1234567', 'contêiner cadastrado no Hub chega ao banco');
  ok(fim.fin.find(l => l._id === 'f2').status === 'Realizado', 'baixa feita no Hub chega ao banco');
  const cmp2 = compararBancos(original, fim, r => (r && r._id) || W.idDeterministico(r));
  ok(cmp2.ok, 'banco final contém TODOS os registros do original');

  console.log('\n--- 3. Exclusão só do que foi excluído ---');
  const hub2 = W.prepararBanco(await get()); let k2 = W.fotografarIds(hub2);
  hub2.fin = hub2.fin.filter(l => l._id !== 'hub-novo');
  k2 = W.registrarRemocoes(hub2, k2);
  ok(Object.keys(hub2._removidos).join() === 'hub-novo', 'só o lançamento excluído vira _removidos');
  await post(hub2);
  const fim2 = await get();
  ok(!fim2.fin.some(l => l._id === 'hub-novo') && fim2.fin.some(l => l._id === 'legado-novo') && fim2.fin.length === fim.fin.length - 1, 'servidor tira só ele; o resto fica');
  srv.close();

  console.log('\n--- 4. Contas do financeiro conferidas à mão ---');
  const d = W.prepararBanco(bancoReal());
  const p = W.painelMes(d, '2026-10', 'todas', '2026-10-24');
  ok(p.recebido === 100000 && p.receber === 50000 + 20000, 'a receber/recebido do mês (transferência fora; empréstimo é entrada de caixa)');
  ok(p.pago === 80000 && p.pagar === 12000 + 5000, 'a pagar/pago do mês sem a transferência');
  ok(p.vencidoPagar === 5000 + 12000 + 999 && p.vencidoReceber === 20000, 'vencidos sem baixa (inclui setembro)');
  const so = W.painelMes(d, '2026-10', 'JeT', '2026-10-24');
  ok(so.recebido === 100000 && so.pago === 0, 'filtro por empresa (JeT)');
  const dre = W.dre(d, '2026-10', 'todas');
  ok(dre.receita === 150000, 'DRE: receita = 150 mil (empréstimo e transferência fora)');
  ok(dre.lucroBruto === 150000 - 80000 - 12000, 'DRE: lucro bruto = receita − custo − impostos da operação');
  ok(dre.lair === 58000 - 5000, 'DRE: lucro antes do IR desconta a despesa fixa');
  ok(perto(dre.ir, 53000 * 0.34) && perto(dre.porSocio, 53000 * 0.66 / 2), 'DRE: IR 34% e divisão por 2 sócios');
  const rop = W.resultadoPorOp(d, 'todas').find(x => x.op === 'OP20');
  ok(rop.receita === 150000 && rop.despesa === 92000 && rop.resultado === 58000 && rop.saldoReceber === 50000 && rop.caixa === 20000, 'resultado da OP20: receita, custo, resultado, falta receber e caixa');
  const l = { valor: 1000, status: 'Previsto' }; W.realizar(l, 950, '2026-10-24');
  ok(l.valor === 950 && l.valorPrevisto === 1000 && l.liquidadoEm === '2026-10-24', 'baixa com valor diferente guarda o previsto (mesma regra do sistema atual)');
  const s = W.novaSerie(d, { tipo: 'Despesa', valor: 3500, vencimento: '2026-01-31', empresa: 'WindGate', op: 'WindGate', desc: 'Aluguel' }, 12, false, '2026-01-10');
  const ocs = d.fin.filter(x => x.recId === s._id);
  ok(ocs.length === 12 && ocs[1].vencimento === '2026-02-28' && ocs.every(o => o.status === 'Previsto'), 'conta fixa: 12 meses, dia 31 vira último dia de fevereiro, todas previstas');

  console.log('\n--- 5. Prazos e alertas ---');
  const op = d.ops[0];
  const pi = W.prazoInfo(d, op, '2026-12-20');
  ok(pi.dias === 80 && pi.alvo === 75 && pi.sit === 'atrasado' && pi.atraso === 5, 'prazo da etapa: 80 dias de 75 = atrasado 5');
  ok(W.checklistPct(d, 'OP20') === 50, 'checklist: 1 de 2 aprovado = 50%');
  const al = W.alertas(d, '2026-10-24');
  ok(al.some(a => a.op === 'OP20' && /chega em 6/.test(a.titulo)), 'alerta de chegada em 6 dias');
  ok(al.some(a => /pagamento\(s\) vencido/.test(a.titulo)), 'alerta de pagamento vencido');

  console.log('\n--- 6. Gravação parcial: só sobe o que o Hub mudou ---');
  {
    const { mesclarDB } = require('../src/services/db-merge.service');
    const servidor = W.prepararBanco(bancoReal());
    const hub = W.prepararBanco(JSON.parse(JSON.stringify(servidor)));
    const base = W.fotografarConteudo(hub);
    ok(W.diferencas(hub, base).n === 0, 'sem alteração local: nada a enviar');
    // Enquanto o Hub está aberto, o sistema atual muda a OP20 e o PIN do Davi.
    servidor.ops.find(o => o.id === 'OP20').prox = 'mudado no sistema atual';
    servidor.users.davi.pin = '9999';
    servidor.checklists.OP20[1].status = 'aprovado';
    // O Hub dá baixa em f2 e mexe só no checklist de outra operação.
    W.realizar(hub.fin.find(l => l._id === 'f2'), 50000, '2026-10-24');
    hub.checklists.OP99 = [{ fase: 'Fechamento', titulo: 'Contrato', status: 'pendente' }];
    const { corpo, n } = W.diferencas(hub, base);
    ok(n === 2 && corpo.fin.length === 1 && corpo.fin[0]._id === 'f2' && !corpo.ops && !corpo.users && Object.keys(corpo.checklists).join() === 'OP99', 'envia só o lançamento baixado e o checklist novo');
    const final = mesclarDB(servidor, JSON.parse(JSON.stringify(corpo)));
    ok(final.ops.find(o => o.id === 'OP20').prox === 'mudado no sistema atual', 'alteração do sistema atual na operação não é revertida');
    ok(final.users.davi.pin === '9999' && final.checklists.OP20[1].status === 'aprovado', 'PIN e checklist alterados por outro usuário continuam');
    ok(final.fin.find(l => l._id === 'f2').status === 'Realizado' && Array.isArray(final.checklists.OP99), 'baixa e checklist do Hub gravados');
    ok(final.fin.length === servidor.fin.length && final.ops.length === servidor.ops.length && final.docs.length === servidor.docs.length, 'nenhum registro sumiu na gravação parcial');
    W.absorver(base, corpo);
    ok(W.diferencas(hub, base).n === 0, 'depois de confirmado pelo servidor, nada fica pendente');
    hub.fin = hub.fin.filter(l => l._id !== 'f4');
    W.registrarRemocoes(hub, W.fotografarIds(servidor));
    const c2 = W.diferencas(hub, base).corpo, f2 = mesclarDB(final, JSON.parse(JSON.stringify(c2)));
    ok(!f2.fin.some(l => l._id === 'f4') && f2.fin.length === final.fin.length - 1, 'exclusão parcial remove só o registro excluído');
  }

  console.log('\n--- 7. Torre por função e permissões ---');
  {
    const { mesclarDB } = require('../src/services/db-merge.service');
    const d = W.prepararBanco(bancoReal());
    d.users.ivina = { nome: 'Ívina', pin: '3' }; d.users.matheus = { nome: 'Matheus', pin: '4' };
    const caps = k => W.perfilDe(d, k).caps;
    ok(W.perfilDe(d, 'samir').id === 'diretoria' && caps('samir').includes('fin.autorizar') && caps('samir').includes('equipe.ver'), 'Samir: diretoria, autoriza pagamentos e vê a equipe');
    ok(W.perfilDe(d, 'davi').id === 'operacoes' && W.pode(d, 'davi', 'fin.ver') && W.pode(d, 'davi', 'fin.excluir') && !W.pode(d, 'davi', 'fin.autorizar'), 'Davi: financeiro completo, mas a autorização é do Samir');
    ok(W.pode(d, 'matheus', 'fin.lancar') && !W.pode(d, 'matheus', 'fin.ver') && !W.pode(d, 'matheus', 'fin.resultado') && !W.pode(d, 'matheus', 'fin.excluir'), 'Matheus: lança e dá baixa, sem DRE, margem ou exclusão');
    ok(['fin.ver', 'fin.lancar', 'fin.resultado', 'docs.revisar'].every(c => !W.pode(d, 'ivina', c)), 'Ívina: nenhum acesso ao financeiro e não aprova documento');
    ok(!W.torreDe(d, 'ivina').some(id => ['caixa', 'pagar', 'lancar', 'aprovacoes', 'equipe'].includes(id)), 'torre da Ívina não tem painel financeiro');
    d.hubPainel.ivina = { paineis: ['caixa', 'recados', 'coletar', 'equipe'] };
    ok(W.torreDe(d, 'ivina').join() === 'recados,coletar', 'torre salva com painel proibido: o painel some (permissão vale mais que a escolha)');
    ok(W.torreDe(d, 'matheus').includes('fretes') && W.torreDe(d, 'matheus').includes('lancar') && !W.torreDe(d, 'matheus').includes('caixa'), 'torre do Matheus: frete e lançamentos, sem caixa');
    d.users.matheus.perfilHub = 'documentos';
    ok(!W.pode(d, 'matheus', 'fin.lancar'), 'perfil pode ser trocado por pessoa (perfilHub)');
    delete d.users.matheus.perfilHub;

    d.opStatusHist.push({ _id: 'h1', op: 'OP20', de: 'cotacao', para: 'contrato', em: '2026-10-05T10:00:00Z', por: 'Davi', tipo: 'mudanca' });
    d.checklists.OP20[1] = { fase: 'Fechamento', titulo: 'PI', status: 'coletado', coletadoPor: 'Ívina', coletadoEm: '2026-10-06' };
    d.fin.push({ _id: 'fm', tipo: 'Despesa', valor: 10, status: 'Realizado', vencimento: '2026-10-07', liquidadoEm: '2026-10-07', por: 'Matheus', criadoEm: '2026-10-07T09:00:00Z', baixaPor: 'Matheus' });
    d.agendaTasks.push({ _id: 't1', t: 'Cotar frete', resp: 'Matheus', status: 'feita', doneAt: '2026-10-08' }, { _id: 't2', t: 'Atrasada', resp: 'Matheus', status: 'aberta', prazo: '2026-10-01' });
    const dm = W.desempenho(d, 'Matheus', '2026-10', '2026-10-24'), di = W.desempenho(d, 'Ívina', '2026-10', '2026-10-24'), dd = W.desempenho(d, 'Davi', '2026-10', '2026-10-24');
    ok(dm.lanc === 1 && dm.baixas === 1 && dm.feitas === 1 && dm.atrasadas === 1, 'desempenho Matheus: 1 lançamento, 1 baixa, 1 tarefa feita, 1 atrasada');
    ok(di.coletados === 1 && dd.etapas === 1, 'desempenho: documento coletado conta para a Ívina, etapa avançada para o Davi');
    ok(W.fechadasNoMes(d, '2026-10').includes('OP20'), 'importação fechada no mês: OP20 entrou em contrato em outubro');

    d.hubRecados.push({ _id: 'r1', texto: 'Fechar frete OP20', para: 'matheus', por: 'Samir', em: '2026-10-20', prio: 'alta', feito: {} },
      { _id: 'r2', texto: 'Para todos', para: 'todos', por: 'Samir', em: '2026-10-21', feito: { ivina: 'x' } },
      { _id: 'r3', texto: 'Vencido', para: 'todos', por: 'Samir', em: '2026-10-01', ate: '2026-10-10', feito: {} });
    ok(W.recadosPara(d, 'matheus', '2026-10-24').map(r => r._id).join() === 'r1,r2', 'recados: o do Matheus (alta) primeiro, o geral depois, o vencido some');
    ok(W.recadosPara(d, 'ivina', '2026-10-24').length === 0, 'recado marcado como feito some só para quem marcou');

    // Servidor: recados unidos por _id (exclusão vira tombstone) e torre de cada um por chave.
    const s1 = mesclarDB({ hubRecados: [{ _id: 'a', texto: 'x' }], hubPainel: { samir: { paineis: ['resumo'] } } },
      { hubRecados: [{ _id: 'b', texto: 'y' }], hubPainel: { davi: { paineis: ['caixa'] } }, _removidos: {} });
    ok(s1.hubRecados.length === 2 && s1.hubPainel.samir && s1.hubPainel.davi, 'servidor junta recados e torres de pessoas diferentes sem perder nenhum');
    const s2 = mesclarDB(s1, { hubRecados: [{ _id: 'b', texto: 'y' }], _removidos: { a: Date.now() } });
    ok(s2.hubRecados.length === 1 && s2.hubRecados[0]._id === 'b', 'recado removido não volta');
  }

  console.log('\n--- 8. CRM, pedidos, GED, desembolso e produtividade ---');
  {
    const { mesclarDB } = require('../src/services/db-merge.service');
    const d = W.prepararBanco(bancoReal());
    // Dados do CRM do sistema atual (sem os campos novos) continuam legíveis.
    d.crm.push({ _id: 'cL1', nome: 'João', empresa: 'Lima Construtora', cnpj: '12.345.678/0001-90', interacoes: [{ data: '2026-10-01', texto: 'ligou', por: 'Samir' }] });
    d.crmOps.push({ _id: 'n1', clienteId: 'cL1', titulo: 'Escoras', valor: 200000, etapa: 'Proposta enviada', resp: 'Davi', prox: 'Ligar', prazo: '2026-10-20', criadoEm: '2026-10-01', atualizadoEm: '2026-10-10' });
    ok(W.faseDe(d.crmOps[0]) === 'proposta', 'etapa do sistema atual vira fase do funil novo (Proposta enviada → proposta)');
    ok(W.slaNegocio(d.crmOps[0], '2026-10-24').sit === 'atrasado', 'próxima ação vencida marca o negócio como parado');
    const n = d.crmOps[0];
    W.moverNegocio(n, 'negociacao', 'Davi', '2026-10-24T10:00:00Z');
    ok(n.fase === 'negociacao' && n.etapa === 'Negociação' && n.proxData === '2026-10-27' && n.prazo === '2026-10-27' && n.atividades.length === 1, 'mudar de fase: rótulo antigo em sincronia, follow-up automático em 3 dias e registro na linha do tempo');
    const opsAntes = d.ops.length, finAntes = d.fin.length;
    const r = W.ganharNegocio(d, n, { opId: 'OP30', por: 'Davi', checklist: [['Fechamento', 'Contrato assinado']], parcelas: [{ pct: 30, venc: '2026-11-01' }, { pct: 70, venc: '2026-12-01' }], agora: '2026-10-25T10:00:00Z' });
    ok(d.ops.length === opsAntes + 1 && r.op.status === 'contrato' && r.op.cliente === 'Lima Construtora' && d.checklists.OP30.length === 1, 'negócio ganho vira operação em Contrato, com checklist');
    ok(d.fin.length === finAntes + 2 && perto(r.lancs[0].valor, 60000) && perto(r.lancs[1].valor, 140000) && r.lancs.every(l => l.status === 'Previsto' && l.op === 'OP30'), 'ganho lança sinal 30% e saldo 70% como recebimentos previstos');
    ok(W.faseDe(n) === 'ganho' && n.opId === 'OP30' && W.fechadasNoMes(d, '2026-10').includes('OP30'), 'negócio fica Ganho, ligado à operação, e conta na meta do mês');
    let erro = ''; try { W.ganharNegocio(d, { _id: 'n2', clienteId: 'cL1' }, { opId: 'OP30' }); } catch (e) { erro = e.message; }
    ok(/Já existe/.test(erro), 'não cria operação com código repetido');
    const ind = W.indicadoresCrm(d, '2026-10-26', 90);
    ok(ind.ganhos === 1 && ind.conversao === 1 && ind.ticket === 200000, 'indicadores: 1 ganho, conversão 100%, ticket R$ 200 mil');
    ok(W.scoreNegocio(d, { clienteId: 'cL1', valor: 400000, origem: 'Indicação', tipoPedido: 'direta' }).s >= 60, 'score: CNPJ + valor alto + indicação + produto conhecido = quente');

    const lp = W.lerPedidoRegras('Lima Construtora\nBoa noite! Preciso de orçamento para 2.000 escoras de até 3,4 m, espessura de 3 mm.');
    ok(lp.cliente === 'Lima Construtora' && lp.quantidade === 2000 && /escora/.test(lp.produto), 'pedido lido por regras: cliente, 2.000 unidades, escoras');
    d.ops.push({ _id: 'oe', id: 'OP5', nome: 'Escoras metálicas', status: 'entregue' });
    ok(W.jaOperado(d, 'escora metálica').ops.some(o => o.id === 'OP5'), 'produto já importado é reconhecido (cotação direta)');
    ok(W.tarefasDoPedido('direta', 'escoras', '2026-10-26').map(t => t.resp).join() === 'Ívina,Matheus,Davi' && W.tarefasDoPedido('estudo', 'x', '2026-10-26')[0].resp === 'Samir', 'tarefas: direta vai para Ívina/Matheus/Davi, estudo começa pela proposta comercial');

    ok(W.tipoDoc({ nome: 'Commercial Invoice' }) === 'invoice' && W.tipoDoc({ grupo: 'contratos', cat: 'Contrato de câmbio' }) === 'cambio' && W.tipoDoc({ nome: 'BL Draft' }) === 'bl', 'GED reconhece o tipo dos documentos antigos pelo grupo e pelo nome');
    const doc = { conferencias: [{ por: 'Davi' }] };
    ok(W.situacaoDoc({}).k === 'novo' && W.situacaoDoc(doc).k === 'meia' && W.situacaoDoc({ conferencias: [{ por: 'Davi' }, { por: 'Samir' }] }).k === 'ok', 'dupla conferência: 0 → aguardando, 1 → falta 2ª, 2 pessoas → ok');
    const opE = { id: 'OPE', status: 'embarcado' };
    d.docs.push({ _id: 'dx', op: 'OPE', nome: 'Proforma.pdf' });
    const cp = W.completudeDocs(d, opE);
    ok(cp.faltam.map(t => t.k).sort().join() === 'bl,cambio,invoice,packing' , 'em trânsito, faltam invoice, packing, BL e câmbio (a proforma já está)');

    const dz = W.prepararBanco({ fin: [
      { _id: 'a', op: 'OPZ', tipo: 'Receita', valor: 30000, status: 'Realizado', vencimento: '2026-10-01' },
      { _id: 'b', op: 'OPZ', tipo: 'Despesa', valor: 50000, status: 'Previsto', vencimento: '2026-10-05' },
      { _id: 'c', op: 'OPZ', tipo: 'Receita', valor: 70000, status: 'Previsto', vencimento: '2026-11-01' }] });
    const des = W.desembolsoOp(dz, 'OPZ', '2026-10-02');
    ok(des.total === 100000 && des.recebido === 30000 && des.aReceber === 70000 && des.proxima._id === 'c', 'desembolso: total, pago, a pagar e próxima parcela');
    ok(des.bloqueios.length === 1 && perto(des.bloqueios[0].falta, 20000), 'regra de proteção: pagar R$ 50 mil à fábrica com só R$ 30 mil do cliente bloqueia (faltam R$ 20 mil)');

    d.hubErros.push({ _id: 'e1', data: '2026-10-08', pessoa: 'Matheus', texto: 'x', pontos: 2 });
    const pm = W.produtividade(d, 'Matheus', 'frete', '2026-10', '2026-10-26');
    ok(pm.partes.qualidade === 28 && pm.total >= 0 && pm.total <= 100, 'produtividade: erro de 2 pontos desconta da qualidade (30 → 28), nota entre 0 e 100');
    const m1 = mesclarDB({ hubPedidos: [{ _id: 'p1' }], hubErros: [{ _id: 'e1' }] }, { hubPedidos: [{ _id: 'p2' }], hubErros: [] , _removidos: {} });
    ok(m1.hubPedidos.length === 2 && m1.hubErros.length === 1, 'servidor une pedidos e erros de usuários diferentes sem perder nenhum');
  }

  console.log('\n--- 9. Leitura por IA (simulada, sem chamar a API) ---');
  {
    const ia = require('../src/services/ia.service');
    process.env.ANTHROPIC_API_KEY = 'teste';
    const falso = async (url, o) => { const b = JSON.parse(o.body); ok(o.headers['x-api-key'] === 'teste' && b.messages[0].content.some(c => c.type === 'image'), 'IA recebe o print como imagem e a chave só no servidor');
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'Segue: {"cliente":"Lima Construtora","produto":"Escora metálica","quantidade":2000,"unidade":"un","especificacao":"até 3,4 m, chapa 3 mm","ncm_sugerido":"7308.40.00","duvidas":["destino"]}' }] }) }; };
    const pd = await ia.lerPedido({ texto: 'oi', imagem: 'data:image/png;base64,AAAA' }, falso);
    ok(pd.cliente === 'Lima Construtora' && pd.quantidade === 2000 && pd.ncm === '73084000' && pd.duvidas[0] === 'destino', 'resposta da IA vira pedido estruturado (NCM só dígitos)');
    delete process.env.ANTHROPIC_API_KEY;
    let semIA = false; try { await ia.lerPedido({ texto: 'x' }); } catch (e) { semIA = !!e.semIA; }
    ok(semIA, 'sem a chave, responde semIA e o navegador usa a leitura por regras');
  }

  console.log('\n--- 10. Contador, fiscal, chat e Portal Único ---');
  {
    const acesso = require('../src/services/acesso.service');
    const { mesclarDB } = require('../src/services/db-merge.service');
    const d = W.prepararBanco(bancoReal());
    d.users.pedro = { nome: 'Pedro', pin: '9', perfilHub: 'contador' };
    d.hubNotas = [{ _id: 'n1', chave: '1', data: '2026-10-05', tipo: 'entrada', status: 'recebida' }]; d.hubExtratos = [{ _id: 'x1', mes: '2026-10', contaId: 'cc1' }];
    const lido = acesso.paraLeitura(d, 'pedro');
    ok(!lido.ops && !lido.fin && !lido.crm && !lido.quotes && lido.hubNotas.length === 1 && lido.hubExtratos.length === 1, 'contador recebe só notas e extratos: nada de operações, financeiro, CRM ou cotações');
    ok(Object.values(lido.users).every(u => !u.pin), 'contador não recebe o PIN de ninguém');
    ok(acesso.paraLeitura(d, 'davi') === d, 'demais perfis continuam recebendo o banco como antes');
    const ataque = { ops: [], fin: [{ _id: 'f1', valor: 0 }], settings: { zerado: true }, users: { samir: { pin: '0' } }, hubNotas: [{ _id: 'n1', chave: '1', status: 'lancada' }], _removidos: { f2: Date.now(), n9: 1, x1: Date.now() } };
    const filtrado = acesso.paraGravacao(d, ataque, 'pedro');
    ok(!filtrado.fin && !filtrado.settings && !filtrado.users && !filtrado.ops && filtrado.hubNotas.length === 1, 'o que o contador manda fora de notas/extratos é descartado');
    ok(!filtrado._removidos.f2 && filtrado._removidos.x1, 'contador não consegue excluir lançamento; só nota ou extrato');
    const final = mesclarDB(d, filtrado);
    ok(final.fin.length === d.fin.length && final.users.samir.pin === '1' && final.hubNotas.find(n => n._id === 'n1').status === 'lancada', 'mesmo com o sistema antigo mandando o banco inteiro, nada além das notas muda');

    const xml = '<nfeProc><NFe><infNFe Id="NFe23261058762606000144550010000012341000012345"><ide><natOp>Venda</natOp><serie>1</serie><nNF>1234</nNF><dhEmi>2026-10-05T10:00:00-03:00</dhEmi></ide><emit><CNPJ>11222333000181</CNPJ><xNome>Fornecedor X</xNome></emit><dest><CNPJ>58762606000144</CNPJ><xNome>SF Trading</xNome></dest><det><prod><CFOP>5102</CFOP></prod></det><total><ICMSTot><vNF>15430.55</vNF></ICMSTot></total></infNFe></NFe></nfeProc>';
    const nf = W.lerXmlNFe(xml);
    ok(nf.chave.length === 44 && nf.numero === '1234' && nf.data === '2026-10-05' && nf.valor === 15430.55 && nf.emitente === 'Fornecedor X', 'XML de NF-e lido: chave, número, data, emitente e valor');
    ok(W.classificarNota(nf, { WindGate: '58.762.606/0001-44' }).tipo === 'entrada' && W.classificarNota(nf, { WindGate: '11.222.333/0001-81' }).tipo === 'saida', 'entrada ou saída decidida pelo CNPJ do grupo');
    const fiscal = require('../src/services/fiscal.service');
    ok(fiscal.semRepetidas([{ chave: nf.chave }], [{ chave: nf.chave }, { chave: 'outra' }]).length === 1, 'nota repetida (mesma chave) não entra duas vezes');
    process.env.FOCUS_NFE_TOKEN = 'tk';
    const lf = await fiscal.buscarRecebidasFocus('58.762.606/0001-44', null, async (url, o) => { ok(/nfes_recebidas\?cnpj=58762606000144/.test(url) && /^Basic /.test(o.headers.Authorization), 'Focus consultada pelo CNPJ com o token no servidor'); return { ok: true, json: async () => [{ chave_nfe: nf.chave, numero: '1234', nome_emitente: 'Fornecedor X', documento_emitente: '11222333000181', valor_total: '15430.55', data_emissao: '2026-10-05T10:00:00' }] }; });
    delete process.env.FOCUS_NFE_TOKEN;
    ok(lf.length === 1 && lf[0].valor === 15430.55 && lf[0].data === '2026-10-05', 'notas recebidas da SEFAZ (via Focus) viram notas do sistema');

    d.hubPainel._fiscal = { contas: [{ id: 'cc1', empresa: 'WindGate', banco: 'Itaú', nome: '1234-5' }] };
    d.hubNotas.push({ _id: 'n2', data: '2026-11-03', tipo: 'saida', status: 'conferida', valor: 100 });
    const fe = W.fechamentoTrimestre(d, '2026-T4', '2026-12-15');
    ok(fe.notas.length === 2 && fe.pend.length === 1 && fe.faltaExtrato.length === 1 && fe.faltaExtrato[0].mes === '2026-11' && !fe.pronto, 'fechamento do 4º tri: 1 nota a conferir e o extrato de novembro faltando');
    const ofx = W.lerOFX('<OFX><BANKACCTFROM><BANKID>341<ACCTID>12345</BANKACCTFROM><BANKTRANLIST><DTSTART>20261001<DTEND>20261031<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261002<TRNAMT>-80000.00<FITID>a1<MEMO>PIX FABRICA</STMTTRN><STMTTRN><DTPOSTED>20261005<TRNAMT>1500.00<FITID>a2<MEMO>OUTRO</STMTTRN></BANKTRANLIST><LEDGERBAL><BALAMT>12000.50</LEDGERBAL></OFX>');
    ok(ofx.transacoes.length === 2 && ofx.saldo === 12000.5 && ofx.inicio === '2026-10-01', 'extrato OFX lido: movimentos, período e saldo');
    const conc = W.conciliar(d, ofx.transacoes, 'WindGate');
    ok(conc[0].lancId === 'f3' && !conc[1].lancId, 'conciliação: pagamento de R$ 80 mil bate com o lançamento; o outro fica para lançar');

    const chat = require('../src/services/chat-store.service');
    ok(chat.podeVerCanal(d, 'pedro', 'contabilidade', []) && !chat.podeVerCanal(d, 'pedro', 'geral', []) && !chat.podeVerCanal(d, 'pedro', 'op:OP20', []), 'contador só vê o canal de contabilidade');
    d.users.ivina = { nome: 'Ívina' }; d.users.matheus = { nome: 'Matheus' };
    ok(!chat.podeVerCanal(d, 'ivina', 'financeiro', []) && chat.podeVerCanal(d, 'davi', 'financeiro', []), 'canal financeiro só para quem tem acesso ao financeiro');
    ok(chat.podeVerCanal(d, 'davi', chat.dmId('davi', 'samir'), []) && !chat.podeVerCanal(d, 'ivina', chat.dmId('davi', 'samir'), []), 'conversa direta só entre as duas pessoas');
    const m = chat.novaMensagem(d, 'samir', { canal: 'geral', texto: 'Reunião amanhã @davi e @Ivina', aviso: true, urgente: true });
    ok(m.de === 'samir' && m.menciona.includes('davi') && m.menciona.includes('ivina') && m.aviso && m.urgente, 'mensagem: autor vem do login, menções reconhecidas, aviso e urgente');
    ok(!chat.novaMensagem(d, 'ivina', { canal: 'geral', texto: 'x', aviso: true }).aviso, 'só Samir e Davi publicam aviso com "li e entendi"');

    const pu = require('../src/services/portal-unico.service');
    pu._reset(); let chamadas = [];
    const req = async (url, o) => { chamadas.push([url, o.headers]); if (/autenticar/.test(url)) return { status: 200, headers: { 'set-token': 'TK', 'x-csrf-token': 'CS' }, corpo: '' };
      return { status: 200, headers: { 'x-csrf-token': 'CS2' }, corpo: JSON.stringify({ identificacao: { numero: '26BR0001' }, situacaoDuimp: 'DESEMBARACADA', resultadoAnaliseRisco: { canal: 'VERDE' } }) }; };
    const r1 = await pu.consultarDuimp('26BR0001', '1', req);
    ok(chamadas[0][1]['Role-Type'] === 'IMPEXP' && chamadas[1][1].Authorization === 'TK' && chamadas[1][1]['X-CSRF-Token'] === 'CS', 'Portal Único: autentica com o perfil IMPEXP e usa os tokens nas consultas');
    ok(r1.situacao === 'DESEMBARACADA' && r1.canal === 'VERDE', 'situação e canal da DUIMP extraídos da resposta');
    await pu.consultarDuimp('26BR0002', '1', req);
    ok(chamadas.filter(c => /autenticar/.test(c[0])).length === 1, 'token reaproveitado: não autentica de novo a cada consulta (regra dos 60 s)');
  }

  try { fs.unlinkSync(TMP); } catch (e) {}
  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
