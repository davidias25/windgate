/**
 * Torres por função (Partes 4 e 4B): Travando agora, equipe, etapas, próximos 15 dias, lançamentos vencidos do
 * Matheus (com a escada até o Samir) e Personalizar com a lista permitida por perfil. Casos do prompt de 18/11.
 */
const W = require('../public/hub/js/torre-regras.js');
const R = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/fin-regras.js'));
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const perto = (a, b) => Math.abs(a - b) < 0.01;
const H = '2026-11-18';
const L = (id, op, tipo, valor, venc, real, extra) => Object.assign({ _id: id, op, tipo, valor, vencimento: venc, status: real ? 'Realizado' : 'Previsto', liquidadoEm: real ? venc : undefined, empresa: 'WindGate', desc: tipo }, extra || {});
function banco() {
  return { users: { samir: { nome: 'Samir' }, davi: { nome: 'Davi' }, ivina: { nome: 'Ívina' }, matheus: { nome: 'Matheus' } },
    ops: [{ id: 'OP26', papel: 'mae', status: 'preparacao_embarque', statusEm: '2026-11-10T10:00:00Z' }, { id: 'OP26.1', maeId: 'OP26', cliente: 'Diagonal', status: 'preparacao_embarque', statusEm: '2026-11-10T10:00:00Z', resp: 'Davi' },
      { id: 'OP23', cliente: 'Ernanes', status: 'transito', eta: '2026-11-29', resp: 'Davi' }, { id: 'OP10', cliente: 'Antigo', status: 'concluida' }],
    fin: [L('a', 'OP26.1', 'Receita', 80000, '2026-10-01', true), L('b', 'OP26.1', 'Receita', 127685.29, '2026-11-14', false, { desc: '2º recebimento do cliente — parcela 2' }),
      L('c', 'OP26.1', 'Despesa', 60000, '2026-10-05', true, { desc: 'Sinal da fábrica (30% do FOB)', custo: 'fob' }), L('d', 'OP26.1', 'Despesa', 133914.73, '2026-11-12', false, { desc: 'Saldo da fábrica · pré-embarque', custo: 'fob' }),
      L('e', 'OP23', 'Receita', 300000, '2026-10-01', true), L('f', 'OP23', 'Despesa', 9000, '2026-11-16', false, { desc: 'Armazenagem' }), L('g', '', 'Despesa', 12000, '2026-11-10', false, { desc: 'Aluguel' }),
      L('h', 'OP23', 'Receita', 50000, '2026-11-30', false)],
    checklists: { 'OP23': [{ fase: 'Desembaraço', titulo: 'LPCO de cota deferido', status: 'pendente' }] },
    opStatusHist: [], quotes: {}, qindex: [], hubPainel: {}, settings: {}, docs: [], agendaTasks: [{ _id: 't1', t: 'Acompanhar LPCO', resp: 'Davi', status: 'aberta', prazo: '2026-11-12' }, { _id: 't2', t: 'Conferir BL', resp: 'Ívina', status: 'aberta', prazo: '2026-11-17' }],
    hubRecados: [], crmOps: [], hubCambio: [], hubExtratos: [] };
}

console.log('\nTravando agora (Torre do Samir):');
{
  const db = banco(), t = W.travandoAgora(db, H, { funcao: 'samir' }), it = t.itens;
  const fab = it.find(x => x.k === 'fabrica'), rec = it.find(x => x.k === 'receber');
  ok(fab && perto(fab.valor, 133914.73) && fab.op === 'OP26.1', 'saldo à fábrica vencido da OP26.1: R$ 133.914,73');
  ok(rec && perto(rec.valor, 127685.29) && /Diagonal/.test(rec.titulo), '2ª parcela vencida da Diagonal: R$ 127.685,29');
  ok(it.indexOf(fab) < it.indexOf(rec), 'ordenado pelo valor em jogo');
  ok(it.length <= 7, 'no máximo 7 linhas');
  ok(it.some(x => x.k === 'lpco' && x.op === 'OP23'), 'LPCO pendente da OP23 (chega 29/11)');
  ok(it.some(x => x.k === 'frete' && x.op === 'OP26'), 'OP26: frete não fechado 8 dias depois da produção (uma vez, no contêiner)');
  ok(it.some(x => x.k === 'vencidos') && !it.some(x => x.op === 'OP10'), 'vencidos sem baixa numa linha; nada de operação concluída');
}

console.log('\nLançamentos vencidos (Torre do Matheus) e a escada:');
{
  const db = banco(), lv = W.lancamentosVencidos(db, H);
  ok(lv.length === 4 && lv[0].l._id === 'g' && lv.every((x, i) => !i || W.lancamentosVencidos(db, H)[i - 1].l.vencimento <= x.l.vencimento), 'do mais antigo para o mais novo');
  ok(lv.find(x => x.l._id === 'g').nivel === 'samir' && lv.find(x => x.l._id === 'f').nivel === 'matheus', 'aluguel 8 dias sem baixa: subiu ao Samir; armazenagem 2 dias: ainda do Matheus');
  ok(W.travandoAgora(db, H, { funcao: 'davi' }).todos.some(x => x.k === 'vencidosDavi'), 'mais de 3 dias sem baixa nem aviso: aparece na Torre do Davi');
  const r = W.avisarSamirLanc(db, db.fin.find(l => l._id === 'g'), 'Matheus', '2026-11-18T10:00:00Z');
  ok(r.ok && db.hubRecados[0].para === 'samir' && db.fin.find(l => l._id === 'g').cobradoSamirEm, '"Não pago · avisar Samir": recado para o Samir e item marcado como cobrado, com a data');
  ok(W.travandoAgora(db, H, { funcao: 'samir', max: 20 }).todos.some(x => x.k === 'naoPago' && /Aluguel/.test(x.titulo)), 'o aviso aparece no Travando do Samir');
  const eq = W.equipeHoje(db, H), mat = eq.find(p => p.k === 'matheus');
  ok(mat && mat.lancVencidos === 3 && mat.atrasadas === 3, 'lançamento vencido conta como tarefa atrasada do Matheus (o avisado sai)');
  ok(eq.find(p => p.k === 'davi').subiram === 1 && eq.find(p => p.k === 'ivina').atrasadas === 1, 'Davi: tarefa parada +3 dias subiu ao Samir; Ívina: 1 atrasada');
}

console.log('\nEtapas e próximos 15 dias:');
{
  const db = banco();
  const e = W.porEtapa(db, H);
  ok(e.find(x => x.k === 'preparacao_embarque').n === 1 && !e.some(x => x.k === 'concluida'), 'funil de etapas (sem concluídas)');
  const p = W.proximos15(db, H);
  ok(p.some(x => x.tipo === 'chegada' && x.op === 'OP23') && p.some(x => x.tipo === 'receber' && x.valor === 50000), 'chegadas e parcelas grandes dos próximos 15 dias');
  ok(!W.proximos15(db, H, { fin: false }).some(x => x.valor), 'sem financeiro: só as chegadas');
}

console.log('\nAbas e Personalizar:');
{
  const db = banco();
  ok(W.abasVisiveis(db, 'samir').length === 4 && W.abasVisiveis(db, 'davi').join() === 'davi,ivina,matheus' && W.abasVisiveis(db, 'ivina').join() === 'ivina', 'Samir vê as 4 abas; Davi, a dele e as do time; Ívina, só a dela');
  const pi = W.permitidosTorre(db, 'ivina');
  ok(!pi.cards.some(c => ['caixaHoje', 'fimMes', 'lucroRealizar', 'fechadoMes', 'pagar7', 'receber7', 'aguardando', 'lancVencidos', 'equipeAtrasadas'].includes(c)) && !pi.blocos.includes('equipe') && !pi.blocos.includes('lancVencidos'),
    'Ívina: nenhum card ou bloco financeiro, de equipe ou ranking na lista de Personalizar');
  ok(W.layoutDe(db, 'samir', 'samir').cards.join() === W.PADRAO_TORRE.samir.cards.join(), 'padrão da função');
  ok(!W.salvarLayout(db, 'davi', 'davi', { cards: ['opsAtivas'], blocos: [] }).ok, 'precisa de 6 cartões');
  const novo = { cards: ['receber7', 'pagar7', 'opsAtivas', 'travando', 'tarefasAtrasadas', 'cotacoesSamir'], blocos: ['tarefas', 'travando'] };
  ok(W.salvarLayout(db, 'davi', 'davi', novo).ok && W.layoutDe(db, 'davi', 'davi').cards[0] === 'receber7' && W.layoutDe(db, 'davi', 'davi').blocos.join() === 'tarefas,travando', 'reordenar, esconder e trocar cards: salvo por usuário');
  ok(!W.salvarLayout(db, 'ivina', 'ivina', { cards: ['caixaHoje', 'minhasTarefas', 'docsConferir', 'chegadas30', 'cobrancasHoje', 'briefings'], blocos: [] }).ok, 'Ívina não consegue pôr card financeiro');
  W.voltarPadrao(db, 'davi', 'davi');
  ok(W.layoutDe(db, 'davi', 'davi').cards.join() === W.PADRAO_TORRE.davi.cards.join(), '"Voltar ao padrão"');
  const t = W.travandoAgora(db, H, { funcao: 'ivina', max: 20 }).todos;
  ok(t.every(x => x.k === 'receber' || x.valor == null), 'Travando da Ívina: sem valor de custo (só cobrança de cliente)');
}

console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
process.exitCode = falhou ? 1 : 0;
