/**
 * Agenda & Tarefas e Gestão do Mês no Hub 2.0: as mesmas regras da tela do
 * sistema atual (situação, vencimento com hora, subtarefas, aviso de
 * atribuição, números do mês) e a garantia de que o Hub, ao editar, devolve
 * o registro com TODOS os campos que o sistema atual gravou.
 */
const W = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/comex.js'), require('../public/hub/js/agenda-regras.js'));
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const clone = x => JSON.parse(JSON.stringify(x));
const AGORA = '2026-10-29T15:00:00.000Z';                 // 12:00 em Brasília
const REL = { data: '2026-10-29', hora: '12:00' };

console.log('\nRelógio e vencimento:');
ok(W.agRelogio('2026-10-29T23:30:00Z').data === '2026-10-29' && W.agRelogio('2026-10-29T23:30:00Z').hora === '20:30', '20h30 de Brasília ainda é o mesmo dia (não vira o dia seguinte em UTC)');
ok(W.agVencida({ prazo: '2026-10-28', status: 'aberta' }, REL), 'prazo de ontem: vencida');
ok(!W.agVencida({ prazo: '2026-10-29', status: 'aberta' }, REL), 'prazo de hoje sem hora: só vence depois do dia inteiro');
ok(W.agVencida({ prazo: '2026-10-29', hora: '09:00', status: 'aberta' }, REL) && !W.agVencida({ prazo: '2026-10-29', hora: '20:00', status: 'aberta' }, REL), 'prazo de hoje com hora: vence na hora marcada');
ok(!W.agVencida({ prazo: '2026-10-01', status: 'feita' }, REL) && W.agVencida({ prazo: '2026-10-01', status: 'travada' }, REL), 'concluída nunca vence; travada continua cobrando prazo');
ok(W.agPrazoTxt({ prazo: '2026-10-30', hora: '14:00' }) === '30/10/2026 · 14:00' && W.agPrazoTxt({}) === '—', 'prazo por extenso com a hora');

console.log('\nPrioridade, situação e ordem:');
ok(W.agPrio('Média') === 'media' && W.agPrio('media') === 'media' && W.agPrio('Alta') === 'alta' && W.agPrio('baixa') === 'baixa' && W.agPrio(undefined) === 'media', '"Média" do sistema atual e "media" do Hub valem o mesmo');
ok(W.agPrioRotulo('alta') === 'Alta' && W.agPrioRotulo('media') === 'Média', 'rótulo gravado no formato do sistema atual');
ok(W.agSitu({ status: 'travada' }).l === 'Travada' && W.agSitu({}).k === 'aberta', 'situação sem status conta como em progresso');
const lista = [
  { _id: 'a', t: 'Baixa sem prazo', prio: 'Baixa', status: 'aberta', resp: 'Davi' },
  { _id: 'b', t: 'Alta amanhã', prio: 'alta', status: 'aberta', prazo: '2026-10-30', resp: 'Ívina' },
  { _id: 'c', t: 'Feita', prio: 'Alta', status: 'feita', prazo: '2026-10-01', resp: 'Davi', doneAt: '2026-10-02' },
  { _id: 'd', t: 'Alta hoje 9h', prio: 'Alta', status: 'travada', prazo: '2026-10-29', hora: '09:00', resp: 'Samir', subs: [{ _id: 's1', t: 'passo', resp: 'Davi', feita: false }] },
  { _id: 'e', t: 'Alta hoje sem hora', prio: 'Alta', status: 'aberta', prazo: '2026-10-29', resp: 'Samir' }
];
ok(W.agFiltrar(lista, { status: 'todas' }).map(t => t._id).join('') === 'debac', 'ordem: abertas, prioridade, prazo, hora (sem hora no fim do dia), concluídas por último');
ok(W.agFiltrar(lista, {}).length === 4 && W.agFiltrar(lista, { status: 'aberta' }).length === 3 && W.agFiltrar(lista, { status: 'travada' }).length === 1 && W.agFiltrar(lista, { status: 'feita' }).length === 1, 'filtros: em aberto, só em progresso, só travadas, só concluídas');
ok(W.agFiltrar(lista, { resp: 'Davi', status: 'todas' }).map(t => t._id).sort().join('') === 'acd', 'filtro por pessoa inclui quem só tem subtarefa na tarefa');
const c = W.agContagem(lista, REL);
ok(c.progresso === 3 && c.travadas === 1 && c.vencidas === 1 && c.alta === 3 && c.feitas === 1, 'contadores: em progresso, travadas, vencidas, prioridade alta (qualquer grafia) e concluídas');

console.log('\nCriar, editar e concluir:');
const n1 = W.agNovaTarefa({ t: '  Pagar bônus ', resp: 'Davi', prazo: '', hora: '10:00', prio: 'alta', obs: '' }, 'Samir', AGORA, 'id1');
ok(n1._id === 'id1' && n1.t === 'Pagar bônus' && n1.hora === '' && n1.prio === 'Alta' && n1.status === 'aberta' && n1.por === 'Samir' && n1.doneAt === null && n1.criadaEm === AGORA && n1.vistoEm === null && /^t_\d+$/.test(n1.id), 'tarefa nova no formato do sistema atual; hora sem prazo é descartada; para outra pessoa nasce não vista');
ok(W.agNovaTarefa({ t: 'x', resp: 'Samir', prio: 'media' }, 'Samir', AGORA).vistoEm === AGORA, 'quem atribui para si mesmo já nasce vista');
const e1 = { _id: 'x', t: 'a', resp: 'Samir', prio: 'media', vistoEm: '2026-01-01', obs: '' };
ok(W.agEditar(e1, { t: 'a', resp: 'Samir', prio: 'media', prazo: '' }, 'Samir').mudouDono === false && e1.prio === 'media' && e1.vistoEm === '2026-01-01', 'editar sem trocar prioridade mantém a grafia gravada e o "visto"');
ok(W.agEditar(e1, { t: 'a', resp: 'Davi', prio: 'alta', prazo: '2026-11-01', hora: '08:00' }, 'Samir', AGORA).mudouDono && e1.vistoEm === null && e1.prio === 'Alta' && e1.hora === '08:00', 'passar a tarefa para outra pessoa a devolve a "não vista" (ela é avisada)');
const s1 = { status: 'aberta', subs: [{ feita: true }, { feita: false }, { feita: false }] };
ok(W.agSituar(s1, 'feita', '2026-10-29').pendentes === 2 && s1.doneAt === '2026-10-29' && s1.status === 'feita', 'concluir carimba doneAt e avisa quantas subtarefas sobraram (sem fechá-las)');
W.agSituar(s1, 'travada'); ok(s1.doneAt === null && s1.status === 'travada', 'reabrir ou travar apaga o doneAt');

console.log('\nSubtarefas e aviso de atribuição:');
const tk = { _id: 'tk', t: 'Embarque', resp: 'Samir', status: 'aberta', vistoEm: AGORA };
const sub = W.agNovaSub(tk, ' Pedir BL ', '', 'Samir', AGORA, 'sb1');
ok(Array.isArray(tk.subs) && sub.resp === 'Samir' && sub.t === 'Pedir BL' && sub.vistoEm === AGORA && sub.feitaPor === '' && sub.feitaEm === null && sub.por === 'Samir', 'subtarefa sem responsável fica com o da tarefa, no formato do sistema atual');
ok(W.agSubResp(sub, 'Matheus', 'Samir') && sub.vistoEm === null && !W.agSubResp(sub, 'Matheus', 'Samir'), 'trocar o responsável da subtarefa o avisa; repetir o mesmo não muda nada');
W.agSubMarcar(sub, true, 'Matheus', '2026-10-29'); ok(sub.feita && sub.feitaPor === 'Matheus' && sub.feitaEm === '2026-10-29', 'marcar subtarefa registra quem e quando');
W.agSubMarcar(sub, false, 'Matheus'); ok(!sub.feita && sub.feitaPor === '' && sub.feitaEm === null, 'desmarcar limpa quem e quando');
const avis = [
  { _id: 'n1', t: 'Nova', resp: 'Davi', status: 'aberta', vistoEm: null, por: 'Samir' },
  { _id: 'n2', t: 'Vencida', resp: 'Davi', status: 'aberta', vistoEm: AGORA, prazo: '2026-10-20' },
  { _id: 'n3', t: 'Hoje', resp: 'Davi', status: 'aberta', vistoEm: AGORA, prazo: '2026-10-29', hora: '18:00' },
  { _id: 'n4', t: 'De outro', resp: 'Samir', status: 'aberta', vistoEm: AGORA, subs: [{ _id: 'ss', t: 'passo', resp: 'Davi', feita: false, vistoEm: null }] },
  { _id: 'n5', t: 'Feita nova', resp: 'Davi', status: 'feita', vistoEm: null }
];
const nots = W.agNotificacoes(avis, 'Davi', REL);
ok(nots.map(x => x.tipo).join(',') === 'nova,subnova,vencida,hoje', 'avisos do sino: atribuição nova, subtarefa nova (mesmo em tarefa de outro), vencida e vence hoje; concluída não avisa');
const vis = W.agMarcarVistas(avis, 'Davi', AGORA);
ok(vis.mudou && vis.tarefas.join() === 'n1,n5' && vis.subs.join() === 'ss' && avis[0].vistoEm === AGORA && avis[3].subs[0].vistoEm === AGORA && avis[3].vistoEm === AGORA, 'abrir a Agenda marca como vistas só as do próprio responsável');
ok(W.agNotificacoes(avis, 'Davi', REL).every(x => x.tipo !== 'nova' && x.tipo !== 'subnova'), 'depois de vista, a atribuição para de avisar');
ok(W.agResponsaveis({ users: { samir: { nome: 'Samir Ali' }, pedro: { nome: 'Pedro' }, davi: { nome: 'Davi Dias' } } }, ['Equipe']).join() === 'Samir,Davi,Equipe', 'responsáveis: primeiro nome da equipe, sem o contador externo, mais o valor já gravado');

console.log('\nIda e volta com o sistema atual (nenhum campo se perde):');
// Tarefa como o sistema atual grava, com campos que o Hub não usa.
const legado = { id: 't_1717000000000', t: 'Enviar doc à contabilidade', resp: 'Ívina', prazo: '2026-10-31', hora: '', prio: 'Média', status: 'aberta', obs: 'trimestre',
  por: 'Samir', doneAt: null, criadaEm: '2026-10-01T10:00:00.000Z', vistoEm: '2026-10-01T11:00:00.000Z', campoFuturo: { a: 1 }, opId: 'OP12',
  subs: [{ _id: 'sub-1', t: 'Juntar extratos', feita: false, resp: 'Ívina', por: 'Samir', criadaEm: '2026-10-01T10:00:00.000Z', vistoEm: null, feitaPor: '', feitaEm: null, extra: 'x' }] };
const db = W.prepararBanco({ agendaTasks: [clone(legado)], gestao: { '2026-10': { gestor: 'Davi', destaques: 'OP12 fechou', desafios: '', prox: '', metas: [{ t: 'Embarcar OP19', resp: 'Matheus', prio: 'Alta', done: false, nota: 'campo extra' }], extraMes: 7 } } });
const idDet = db.agendaTasks[0]._id;
ok(/^h-/.test(idDet) && W.prepararBanco(clone({ agendaTasks: [clone(legado)] })).agendaTasks[0]._id === idDet, 'tarefa antiga sem _id ganha id determinístico (o mesmo em qualquer navegador)');
const t = db.agendaTasks[0];
W.agEditar(t, { t: 'Enviar documentos à contabilidade', resp: 'Ívina', prazo: '2026-11-03', hora: '09:00', prio: 'media', obs: 'trimestre' }, 'Samir');
W.agSituar(t, 'travada');
W.agSubMarcar(t.subs[0], true, 'Ívina', '2026-10-29');
W.agNovaSub(t, 'Conferir NF', 'Davi', 'Ívina', AGORA, 'sub-2');
const volta = JSON.parse(JSON.stringify(db)).agendaTasks[0];
const perdidos = k => Object.keys(k.de).filter(c => !(c in k.para));
ok(perdidos({ de: legado, para: volta }).length === 0, 'tarefa editada pelo Hub mantém todos os campos do sistema atual (inclusive os que o Hub não conhece)');
ok(perdidos({ de: legado.subs[0], para: volta.subs[0] }).length === 0 && volta.subs[0].extra === 'x', 'subtarefa editada mantém todos os campos');
ok(volta._id === idDet && volta.id === legado.id && volta.criadaEm === legado.criadaEm && volta.por === 'Samir' && volta.prio === 'Média' && volta.campoFuturo.a === 1 && volta.opId === 'OP12', 'id, criação, autor, grafia da prioridade e campos extras intactos');
ok(volta.t === 'Enviar documentos à contabilidade' && volta.status === 'travada' && volta.hora === '09:00' && volta.subs.length === 2 && Object.keys(volta.subs[1]).sort().join() === Object.keys(legado.subs[0]).filter(k => k !== 'extra').sort().join(), 'as mudanças do Hub estão lá, e a subtarefa nova tem exatamente as chaves do sistema atual');
const nova = W.agNovaTarefa({ t: 'x', resp: 'Davi', prazo: '2026-11-01', hora: '', prio: 'baixa', obs: '' }, 'Samir', AGORA);
ok(['id', 't', 'resp', 'prazo', 'hora', 'prio', 'status', 'obs', 'por', 'doneAt', 'criadaEm', 'vistoEm', '_id'].every(k => k in nova), 'tarefa criada no Hub tem todas as chaves que o sistema atual grava');
// Gestão do Mês
const antes = clone(db.gestao['2026-10']);
const g = W.gmGarantir(db, '2026-10', 'Samir');
g.destaques = 'OP12 e OP13 fecharam'; g.metas[0].done = true; g.metas.push(W.gmNovaMeta('Fechar 2 contratos', 'Equipe', 'alta'));
const gv = JSON.parse(JSON.stringify(db)).gestao['2026-10'];
ok(g === db.gestao['2026-10'] && gv.extraMes === 7 && gv.gestor === 'Davi' && gv.metas[0].nota === 'campo extra' && Object.keys(antes).every(k => k in gv), 'mês da Gestão editado no próprio objeto: gestor, campos extras e metas antigas intactos');
ok(gv.metas[0].done === true && JSON.stringify(gv.metas[1]) === JSON.stringify({ t: 'Fechar 2 contratos', resp: 'Equipe', prio: 'Alta', done: false }), 'meta nova no formato do sistema atual {t,resp,prio,done}');
const d2 = { gestao: {} };
ok(W.gmLer(d2, '2026-12', 'Samir').gestor === 'Samir' && !d2.gestao['2026-12'], 'só olhar um mês não cria registro no banco');
ok(JSON.stringify(W.gmGarantir(d2, '2026-12', 'Davi')) === JSON.stringify({ gestor: 'Davi', destaques: '', desafios: '', prox: '', metas: [] }), 'mês novo nasce no formato do sistema atual');
ok(Array.isArray(W.gmGarantir({ gestao: { '2026-09': { gestor: 'Samir' } } }, '2026-09').metas), 'mês antigo sem lista de metas ganha a lista (o sistema atual quebraria sem ela)');
// Sincronização: o diff do Hub envia o mês inteiro e a tarefa inteira.
const base = W.fotografarConteudo(W.prepararBanco({ agendaTasks: [clone(legado)], gestao: { '2026-10': antes } }));
const corpo = W.diferencas(db, base).corpo;
ok(corpo.agendaTasks && corpo.agendaTasks.length === 1 && corpo.agendaTasks[0].campoFuturo && corpo.gestao && corpo.gestao['2026-10'].extraMes === 7, 'o que sobe ao servidor é o registro completo (tarefa por _id, mês por chave)');

console.log('\nNúmeros do mês (mesmas contas do sistema atual):');
const dbM = {
  qindex: [{ ts: Date.parse('2026-10-05T12:00:00Z'), status: 'ok', preco: 1000 }, { ts: Date.parse('2026-10-06T12:00:00Z'), status: 'wait', preco: 50 }, { ts: Date.parse('2026-09-06T12:00:00Z'), status: 'ok', preco: 9 }, { status: 'ok', preco: 5 }, { ts: 'lixo', status: 'ok' }],
  fin: [{ data: '2026-10-10', status: 'Realizado', tipo: 'Receita', valor: 500 }, { data: '15/10/2026', status: 'Realizado', tipo: 'Despesa', valor: 200 }, { data: '2026-10-11', status: 'Previsto', tipo: 'Receita', valor: 999 }, { data: '2026-09-10', status: 'Realizado', tipo: 'Receita', valor: 999 }],
  fretes: [{ data: '2026-10-02' }, { data: '02/09/2026' }],
  agendaTasks: [{ doneAt: '2026-10-03' }, { doneAt: '2026-09-30' }, null],
  ops: [{ id: 'OP1', status: 'embarcado' }, { id: 'OP2', status: 'entregue' }, { id: 'OP3', status: 'concluida' }, { id: 'OP4', status: 'travada' }]
};
const M = W.gmMetricas(dbM, '2026-10');
ok(M.qs === 3 && M.aprov === 2 && M.valorAprov === 1005, 'cotações do mês (sem data contam em todo mês, como no sistema atual; data inválida não quebra)');
ok(M.rec === 500 && M.desp === 200, 'resultado realizado lê data ISO e dd/mm/aaaa, só o que foi Realizado');
ok(M.fretes === 1 && M.agFeitas === 1 && M.opsAtivas.map(o => o.id).join() === 'OP1,OP4', 'fretes cotados, tarefas concluídas no mês e operações ativas');

console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
process.exit(falhou ? 1 : 0);
