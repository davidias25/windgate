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

  try { fs.unlinkSync(TMP); } catch (e) {}
  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
