/**
 * Editar o código e excluir uma operação: nada que aponta para ela pode ficar para trás,
 * e nenhum lançamento ou documento some.
 */
process.env.SUPABASE_DISABLED = '1';
const W = require('../public/hub/js/regras.js');
const { mesclarDB } = require('../src/services/db-merge.service');
const chat = require('../src/services/chat-store.service');
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };

const banco = () => W.prepararBanco({
  ops: [{ _id: 'o14', id: 'OP14', nome: 'Escoras', cliente: 'Lima', status: 'producao', duimpDados: { geral: { numero: '1' }, itens: [{ numero: 1, op: 'OP14' }, { numero: 2, op: 'OP15' }] } }, { _id: 'o15', id: 'OP15', cliente: 'Outro', status: 'contrato' }],
  fin: [{ _id: 'f1', op: 'OP14', tipo: 'Receita', desc: 'Parcela OP14', valor: 100, status: 'Realizado', origem: 'cotacao:q1' }, { _id: 'f2', op: 'OP14 ', tipo: 'Despesa', desc: 'Frete', valor: 40, status: 'Previsto' }, { _id: 'f3', op: 'OP15', tipo: 'Despesa', desc: 'Outra', valor: 7, status: 'Previsto' }],
  finRec: [{ _id: 'r1', op: 'OP14', tipo: 'Despesa' }],
  docs: [{ _id: 'd1', op: 'OP14', nome: 'Invoice' }, { _id: 'd2', op: 'OP15', nome: 'BL' }],
  hubCambio: [{ _id: 'c1', op: 'OP14', valorME: 10 }],
  hubNFe: [{ _id: 'n1', op: 'OP14', status: 'autorizada', entrada: { opId: 'OP14' } }],
  agendaTasks: [{ _id: 't1', op: 'OP14', titulo: 'x' }],
  crmOps: [{ _id: 'g1', opId: 'OP14', titulo: 'x' }],
  opStatusHist: [{ _id: 'h1', op: 'OP14', de: 'contrato', para: 'producao', em: '2026-10-01', tipo: 'mudanca' }],
  checklists: { OP14: [{ titulo: 'Contrato', status: 'pendente' }], OP15: [{ titulo: 'BL', status: 'ok' }] },
  quotes: { q1: { id: 'q1', fields: { opNum: 'op14', cliente: 'Lima' } }, q2: { id: 'q2', fields: { opNum: 'OP15' } }, q3: { id: 'q3', fields: { opNum: 'OP15 + OP14' }, clientes: [{ id: 'c1', opNum: 'OP14' }, { id: 'c2', opNum: 'OP15' }] } },
  qindex: [{ _id: 'i1', id: 'q1', label: 'OP14 · Lima' }, { _id: 'i2', id: 'q2', label: 'OP15 · Outro' }]
});

console.log('\nEditar o código:');
{
  const d = banco(), r = W.renomearOperacao(d, 'OP14', ' op20.1 ', 'Davi', '2026-11-06T10:00:00Z');
  ok(r.ok && r.para === 'OP20.1' && d.ops[0].id === 'OP20.1' && d.ops[0]._id === 'o14', 'muda o código e mantém o registro, em maiúsculas e sem espaço');
  ok(d.fin.find(l => l._id === 'f1').op === 'OP20.1' && d.fin.find(l => l._id === 'f2').op === 'OP20.1', 'lançamentos acompanham, inclusive código antigo com espaço no fim');
  ok(d.fin.find(l => l._id === 'f3').op === 'OP15' && d.docs.find(x => x._id === 'd2').op === 'OP15' && d.quotes.q2.fields.opNum === 'OP15', 'a outra operação não é tocada');
  ok(d.finRec[0].op === 'OP20.1' && d.docs[0].op === 'OP20.1' && d.hubCambio[0].op === 'OP20.1' && d.agendaTasks[0].op === 'OP20.1' && d.crmOps[0].opId === 'OP20.1', 'recorrência, documento, câmbio, tarefa e negócio acompanham');
  ok(d.hubNFe[0].op === 'OP20.1' && d.hubNFe[0].entrada.opId === 'OP20.1', 'nota acompanha, inclusive dentro do registro');
  ok(d.ops[0].duimpDados.itens[0].op === 'OP20.1' && d.ops[0].duimpDados.itens[1].op === 'OP15', 'item da DUIMP acompanha, e o da outra operação fica');
  ok(d.checklists['OP20.1'].length === 1 && d.checklists['OP20.1'][0].titulo === 'Contrato' && d.checklists.OP14.length === 0 && d.checklists.OP15.length === 1, 'checklist vai para o código novo');
  ok(d.quotes.q1.fields.opNum === 'OP20.1' && d.qindex[0].label === 'OP20.1 · Lima' && d.qindex[1].label === 'OP15 · Outro', 'cotação e lista de cotações acompanham');
  ok(d.quotes.q3.clientes[0].opNum === 'OP20.1' && d.quotes.q3.clientes[1].opNum === 'OP15', 'cotação com vários clientes acompanha só no cliente certo');
  ok(d.fin.find(l => l._id === 'f1').desc === 'Parcela OP14', 'descrição escrita à mão não muda');
  ok(d.fin.find(l => l._id === 'f1').origem === 'cotacao:q1' && d.fin.length === 3 && d.docs.length === 2, 'nenhum lançamento ou documento some, e a marca da cotação fica');
  const hist = d.opStatusHist.filter(h => h.op === 'OP20.1');
  ok(hist.length === 2 && hist.some(h => h.tipo === 'renomeacao' && /OP14 para OP20\.1/.test(h.motivo) && h.por === 'Davi'), 'histórico vem junto e registra quem mudou');
  ok(d.ops[0].codigosAnteriores[0] === 'OP14', 'guarda o código antigo: link do portal já enviado continua abrindo');
  const res = W.resultadoPorOp(d, 'todas').find(x => x.op === 'OP20.1');
  ok(res && res.receita === 100 && res.despesa === 40, 'o resultado da operação continua com os mesmos valores');
  const servidor = banco(), junto = mesclarDB(servidor, d);
  ok(junto.ops.length === 2 && junto.ops.some(o => o.id === 'OP20.1') && !junto.ops.some(o => o.id === 'OP14') && junto.fin.filter(l => l.op === 'OP14').length === 0, 'gravar no servidor não ressuscita o código antigo');
  ok(Array.isArray(junto.checklists.OP14) && !junto.checklists.OP14.length, 'o checklist antigo fica vazio no servidor');
  ok(W.renomearOperacao(d, 'OP20.1', 'OP14', 'Davi').ok && d.checklists.OP14.length === 1, 'dá para voltar ao código anterior');
}
console.log('\nCódigo inválido:');
{
  const d = banco(), antes = JSON.stringify(d);
  ok(/Já existe/.test(W.renomearOperacao(d, 'OP14', 'op15').msg), 'código de outra operação é recusado');
  ok(!W.renomearOperacao(d, 'OP14', '').ok && !W.renomearOperacao(d, 'OP14', 'OP14').ok && !W.renomearOperacao(d, 'NAO', 'OP1').ok && !W.renomearOperacao(d, 'OP14', "OP'1").ok, 'vazio, igual, inexistente ou com aspas é recusado');
  ok(JSON.stringify(d) === antes, 'recusado, nada muda');
  ok(W.renomearOperacao(d, 'OP14', 'OP14 ASASUL').ok && d.ops[0].id === 'OP14 ASASUL', 'aceita nome com espaço, como já existe hoje');
}
console.log('\nExcluir:');
{
  const d = banco(); W.fotografarIds(d); const conhecidos = W.fotografarIds(d);
  const g = W.ligadosDaOp(d, 'OP14');
  ok(g.fin === 2 && g.realizados === 1 && g.docs === 1 && g.notas === 1 && g.valor === 140, 'mostra o que está ligado à operação');
  const barrada = W.excluirOperacao(d, 'OP14', 'Samir', '2026-11-06T10:00:00Z');
  ok(!barrada.ok && d.ops.length === 2 && barrada.bloqueios.length === 3, 'com lançamento realizado, documento e NF-e, não sai');
  d.fin.forEach(l => { if (l.op === 'OP14') l.status = 'Previsto'; }); d.docs = d.docs.filter(x => x.op !== 'OP14'); d.hubNFe = d.hubNFe.filter(n => n.op !== 'OP14');
  const r = W.excluirOperacao(d, 'OP14', 'Samir', '2026-11-06T10:00:00Z');
  ok(r.ok && d.ops.length === 1 && d.ops[0].id === 'OP15', 'sem nada disso, sai só a operação escolhida');
  ok(d.fin.length === 3 && d.fin[0].op === 'OP14', 'lançamentos previstos continuam, com o código preservado');
  const h = d.opStatusHist[d.opStatusHist.length - 1];
  ok(h.tipo === 'exclusao' && h.por === 'Samir' && /2 lançamento/.test(h.motivo), 'registra quem excluiu e o que ficou');
  W.registrarRemocoes(d, conhecidos);
  ok(d._removidos.o14, 'a exclusão vale: a operação não volta com a gravação de outra pessoa');
  ok(!W.excluirOperacao(d, 'NAO').ok, 'operação inexistente é recusada');
}
console.log('\nConversa da operação:');
{
  const d = { mensagens: [{ canal: 'op:OP14', opId: 'OP14', texto: 'a' }, { canal: 'op:OP15', opId: 'OP15', texto: 'b' }, { canal: 'geral', texto: 'c' }] };
  ok(chat.renomearCanalOp(d, 'OP14', 'OP20') === 1 && d.mensagens[0].canal === 'op:OP20' && d.mensagens[0].opId === 'OP20', 'a conversa acompanha o código novo');
  ok(d.mensagens[1].canal === 'op:OP15' && d.mensagens[2].canal === 'geral', 'as outras conversas ficam');
}
console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
process.exit(falhou ? 1 : 0);
