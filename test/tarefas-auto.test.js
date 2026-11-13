/**
 * Tarefas automáticas por etapa: os 4 gatilhos, idempotência, contêiner compartilhado, mudança de ETA,
 * etapa que pula, os dois níveis de escalonamento, prévia das operações em andamento e ranking.
 * Mais a passagem pelo servidor (gravação real em /api/db). Dados inventados.
 */
const path = require('path'), fs = require('fs'), os = require('os');
const T = require('../public/hub/js/tarefas-auto.js');
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const clone = x => JSON.parse(JSON.stringify(x));
const em = (d, h) => `${d}T${h || '12'}:00:00-03:00`;

function banco() {
  return {
    users: { samir: { nome: 'Samir' }, davi: { nome: 'Davi Dias' }, matheus: { nome: 'Matheus' }, ivina: { nome: 'Ívina' } },
    hubPainel: { _tarefasAutoJob: { inicio: '2026-11-01', em: em('2026-11-01') } },
    ops: [
      { _id: 'o300', id: 'OP300', cliente: 'Cliente A', status: 'producao', statusEm: '2026-10-01', criadaEm: '2026-09-01' },
      { _id: 'o227', id: 'OP227', papel: 'mae', status: 'producao', statusEm: '2026-10-01', criadaEm: '2026-09-01' },
      { _id: 'o2271', id: 'OP227.1', maeId: 'OP227', cliente: 'Cliente B', status: 'producao', criadaEm: '2026-09-01' },
      { _id: 'o2272', id: 'OP227.2', maeId: 'OP227', cliente: 'Cliente C', status: 'producao', criadaEm: '2026-09-01' }
    ],
    fin: [{ _id: 'f1', op: 'OP300', tipo: 'Receita', valor: 98765.43, status: 'Previsto' }],
    agendaTasks: [], hubRecados: [], hubTarefasLog: [], opStatusHist: [], _removidos: {}
  };
}
/* Uma gravação: copia o banco, aplica a mudança e chama o gatilho como o servidor faz. */
function gravar(db, mudar, agora) { const antes = clone(db); mudar(db); return T.aoGravar(antes, db, { agora: agora || em('2026-11-13') }); }
const op = (db, id) => db.ops.find(o => o.id === id);
const tarefas = (db, g) => db.agendaTasks.filter(t => t.auto && (!g || t.auto.gatilho === g));

console.log('\nG1 · Preparando embarque → Fechar frete:');
{
  const db = banco();
  gravar(db, d => { Object.assign(op(d, 'OP300'), { status: 'preparacao_embarque', statusPor: 'davi' }); });
  const [t] = tarefas(db, 'G1');
  ok(t && t.t === 'Fechar frete da OP300' && t.resp === 'Matheus' && t.copia.join() === 'Davi' && t.prazo === '2026-11-18' && t.prio === 'Alta' && t.opId === 'OP300', 'tarefa para o Matheus, cópia Davi, prazo 5 dias (18/11), prioridade alta, ligada à operação');
  ok(db.hubRecados.some(r => r.para === 'matheus' && /Fechar frete da OP300/.test(r.texto)), 'o Matheus recebe recado na Torre');
  ok(db.hubTarefasLog.some(l => l.acao === 'criada' && l.gatilho === 'G1' && l.por === 'davi' && l.op === 'OP300'), 'log: gatilho, quando, quem mudou a etapa e a tarefa');
  ok(!JSON.stringify(t).includes('98765') && !/R\$/.test(t.t), 'nenhum valor financeiro na tarefa');
}

console.log('\nG2 · Frete fechado → documentação pré-embarque; G1 conclui sozinha:');
{
  const db = banco();
  gravar(db, d => { op(d, 'OP300').status = 'preparacao_embarque'; });
  gravar(db, d => { T.marcarFreteFechado(d, op(d, 'OP300'), { agente: 'MSC', booking: 'BK123', valor: 4500 }, 'matheus', em('2026-11-14')); }, em('2026-11-14'));
  const g1 = tarefas(db, 'G1')[0], g2 = tarefas(db, 'G2')[0];
  ok(g1.status === 'feita' && g1.feitaPor === 'Sistema' && /matheus/.test(g1.obsConclusao), 'Fechar frete conclui sozinha quando o marco é marcado');
  ok(g2 && g2.resp === 'Ívina' && g2.copia.join() === 'Davi' && g2.prazo === '2026-11-17' && /invoice, packing list, draft do BL/.test(g2.t), 'Conferir documentação pré-embarque: Ívina, cópia Davi, 3 dias');
  ok(op(db, 'OP300').freteFechado.por === 'matheus' && op(db, 'OP300').freteFechado.booking === 'BK123', 'marco guardado com quem marcou, agente, booking e valor');
  ok(!g2.t.includes('4500') && !g2.obs.includes('4500'), 'o valor do frete não aparece na tarefa');
  ok(T.podeMarcarFrete('matheus') && T.podeMarcarFrete('davi') && T.podeMarcarFrete('samir') && !T.podeMarcarFrete('ivina'), 'marcam o frete: Matheus, Davi e Samir');
}

console.log('\nG3 · Em trânsito → revisão pós-embarque:');
{
  const db = banco(); op(db, 'OP300').status = 'container_enviado_porto';
  gravar(db, d => { op(d, 'OP300').status = 'embarcado'; });
  const [t] = tarefas(db, 'G3');
  ok(t && t.t === 'Revisão geral pós-embarque da OP300' && t.resp === 'Davi' && t.copia.length === 0 && t.prazo === '2026-11-18' && !t.auto.retroativo, 'Davi, 5 dias, sem retroativo');
}

console.log('\nEtapa que pula:');
{
  const db = banco();
  gravar(db, d => { op(d, 'OP300').status = 'embarcado'; });
  const g1 = tarefas(db, 'G1')[0], g3 = tarefas(db, 'G3')[0];
  ok(g1 && g1.auto.retroativo && /retroativamente/.test(g1.obs) && g3 && !g3.auto.retroativo, 'de "Em produção" para "Em trânsito": Fechar frete gerada retroativamente, revisão normal');
  const db2 = banco(); gravar(db2, d => { op(d, 'OP300').status = 'chegada'; });
  ok(tarefas(db2, 'G1')[0].auto.retroativo && tarefas(db2, 'G3')[0].auto.retroativo, 'pulando até a chegada: as duas retroativas');
}

console.log('\nIdempotência:');
{
  const db = banco();
  gravar(db, d => { op(d, 'OP300').status = 'preparacao_embarque'; });
  gravar(db, d => { op(d, 'OP300').status = 'producao'; });
  gravar(db, d => { op(d, 'OP300').status = 'preparacao_embarque'; });
  gravar(db, d => { op(d, 'OP300').cliente = 'Outro nome'; });
  ok(tarefas(db, 'G1').length === 1 && db.hubRecados.filter(r => /Fechar frete/.test(r.texto)).length === 1, 'voltar e avançar de novo não duplica tarefa nem recado');
  const id = tarefas(db, 'G1')[0]._id;
  db.agendaTasks = db.agendaTasks.filter(t => t._id !== id); db._removidos[id] = Date.now();
  gravar(db, d => { op(d, 'OP300').status = 'producao'; }); gravar(db, d => { op(d, 'OP300').status = 'preparacao_embarque'; });
  ok(tarefas(db, 'G1').length === 0, 'tarefa excluída por alguém não volta');
  const db3 = banco(); delete db3.hubPainel._tarefasAutoJob;
  gravar(db3, d => { op(d, 'OP300').status = 'preparacao_embarque'; });
  ok(tarefas(db3).length === 0, 'antes da função entrar no ar (primeira rodada do servidor), nada é criado');
}

console.log('\nContêiner compartilhado (mãe e filhas):');
{
  const db = banco();
  gravar(db, d => { ['OP227', 'OP227.1', 'OP227.2'].forEach(id => { op(d, id).status = 'preparacao_embarque'; }); });
  const g1 = tarefas(db, 'G1');
  ok(g1.length === 1 && g1[0].auto.op === 'OP227' && g1[0].t === 'Fechar frete da OP227 · contêiner com OP227.1, OP227.2', 'uma tarefa só, na mãe, listando as filhas');
  gravar(db, d => { T.marcarFreteFechado(d, op(d, 'OP227.1'), {}, 'matheus', em('2026-11-13')); op(d, 'OP227.1').freteFechado = op(d, 'OP227').freteFechado; });
  ok(tarefas(db, 'G2').length === 1 && tarefas(db, 'G2')[0].auto.op === 'OP227' && op(db, 'OP227').freteFechado && tarefas(db, 'G1')[0].status === 'feita', 'frete marcado pela filha vai para a mãe: uma tarefa de documentação, Fechar frete concluída');
  ok(T.tarefasDaOp(db, op(db, 'OP227.2')).length === 2, 'a linha do tempo da filha mostra as tarefas do contêiner');
}

console.log('\nG4 · ETA − 30 e mudança de ETA:');
{
  const db = banco(); op(db, 'OP300').status = 'embarcado';
  gravar(db, d => { op(d, 'OP300').eta = '2026-12-31'; });
  ok(tarefas(db, 'G4').length === 0, 'ETA a mais de 30 dias: ainda não');
  T.rodadaDiaria(db, em('2026-12-01', '08'));
  const [t] = tarefas(db, 'G4');
  ok(t && t.t === 'Enviar e revisar documentos com o despachante – OP300' && t.resp === 'Ívina' && t.copia.join() === 'Davi' && t.prazo === '2026-12-11', 'rodada diária no dia ETA − 30 (01/12): Ívina, cópia Davi, prazo ETA − 20 (11/12)');
  gravar(db, d => { op(d, 'OP300').eta = '2026-12-25'; }, em('2026-12-02'));
  ok(t.prazo === '2026-12-05' && db.hubTarefasLog.some(l => l.acao === 'prazo-recalculado'), 'ETA antecipado: prazo recalculado (05/12)');
  gravar(db, d => { op(d, 'OP300').eta = '2027-02-15'; }, em('2026-12-03'));
  ok(t.auto.suspensa && t.prazo === '' && t.status === 'aberta' && tarefas(db, 'G4').length === 1, 'ETA adiado para mais de 30 dias: suspensa, não apagada');
  gravar(db, d => { op(d, 'OP300').eta = '2026-12-20'; }, em('2026-12-04'));
  ok(!t.auto.suspensa && t.prazo === '2026-12-04', 'ETA volta para perto: reativada, prazo não fica no passado');
  const nova = banco(); delete nova.ops[0]; nova.ops = nova.ops.filter(Boolean);
  gravar(nova, d => { d.ops.push({ _id: 'o400', id: 'OP400', status: 'embarcado', eta: '2026-11-30', criadaEm: em('2026-11-13') }); });
  ok(tarefas(nova, 'G4').length === 1 && tarefas(nova, 'G4')[0].prazo === '2026-11-13', 'operação que entra com ETA a menos de 30 dias: tarefa na hora');
  const passou = banco(); op(passou, 'OP300').status = 'logistica';
  gravar(passou, d => { op(d, 'OP300').eta = '2026-11-20'; });
  ok(tarefas(passou, 'G4').length === 0, 'operação que já chegou não ganha a tarefa do despachante');
  const ponto = banco(); ponto.ops.push({ _id: 'o5', id: 'OP227.9', status: 'embarcado', criadaEm: em('2026-11-13') });
  gravar(ponto, d => { op(d, 'OP227.9').eta = '2026-11-25'; });
  ok(tarefas(ponto, 'G4')[0].t.endsWith('OP227.9'), 'código com ponto (OP227.9) no texto');
}

console.log('\nEscalonamento:');
{
  const db = banco();
  gravar(db, d => { op(d, 'OP300').status = 'preparacao_embarque'; }, em('2026-11-01'));
  const t = tarefas(db, 'G1')[0];   // prazo 06/11
  T.rodadaDiaria(db, em('2026-11-07', '08'));
  ok(db.hubRecados.filter(r => r._id === t._id + '-atraso-davi').length === 1 && !db.hubRecados.some(r => r._id === t._id + '-atraso-samir'), 'venceu: atrasada, recado para o Davi');
  ok(T.tarefasNaTorre(db, 'davi', '2026-11-07').atrasadas.length === 1 && T.tarefasNaTorre(db, 'samir', '2026-11-07').atrasadas.length === 0, 'aparece na Torre do Davi, ainda não na do Samir');
  T.rodadaDiaria(db, em('2026-11-08', '08')); T.rodadaDiaria(db, em('2026-11-08', '09'));
  ok(db.hubRecados.filter(r => /-atraso-/.test(r._id)).length === 1, 'sem spam: rodar de novo não repete o recado');
  T.rodadaDiaria(db, em('2026-11-10', '08'));
  ok(db.hubRecados.some(r => r._id === t._id + '-atraso-samir' && r.para === 'samir') && T.tarefasNaTorre(db, 'samir', '2026-11-10').atrasadas.length === 1, 'mais de 3 dias de atraso: sobe para o Samir, com recado');
  T.rodadaDiaria(db, em('2026-11-11', '08'));
  ok(db.hubRecados.filter(r => /-atraso-/.test(r._id)).length === 2, 'cada nível avisa uma vez só');
  T.concluirTarefa(t, 'Matheus', em('2026-11-11'), 'Fechado com a MSC');
  ok(T.tarefasNaTorre(db, 'davi', '2026-11-11').atrasadas.length === 0 && t.feitaPor === 'Matheus' && t.obsConclusao === 'Fechado com a MSC', 'concluída: sai do destaque, com quem, quando e observação');
  ok(T.rodadaDiaria(db, em('2026-11-12', '06')).rodou === false, 'antes das 7h a rodada não roda');
  ok(T.tarefasNaTorre(db, 'davi', '2026-11-11').acompanhando.length === 0, 'concluída também sai de "acompanhando"');
}

console.log('\nQuem conclui e reatribui:');
{
  const db = banco(); gravar(db, d => { op(d, 'OP300').status = 'preparacao_embarque'; });
  const t = tarefas(db, 'G1')[0];
  ok(T.podeConcluir(db, 'matheus', t) && T.podeConcluir(db, 'davi', t) && T.podeConcluir(db, 'samir', t) && !T.podeConcluir(db, 'ivina', t), 'concluem: o responsável, Davi e Samir');
  ok(T.podeReatribuir(db, 'davi', t) && !T.podeReatribuir(db, 'matheus', t), 'reatribuem: Davi e Samir');
  ok(T.tarefasNaTorre(db, 'davi', '2026-11-13').acompanhando.length === 1, 'Davi vê como "acompanhando" a tarefa em que está em cópia');
  T.concluirTarefa(t, 'Matheus', em('2026-11-14')); T.reabrirTarefa(t, 'davi', em('2026-11-15'));
  gravar(db, d => { T.marcarFreteFechado(d, op(d, 'OP300'), {}, 'matheus', em('2026-11-15')); });
  ok(t.status === 'aberta', 'G1 reaberta à mão não é fechada de novo pelo sistema');
}

console.log('\nOperações já em andamento (prévia):');
{
  const db = banco(); delete db.hubPainel._tarefasAutoJob;
  op(db, 'OP300').status = 'embarcado'; op(db, 'OP300').eta = '2026-11-25';
  ['OP227', 'OP227.1', 'OP227.2'].forEach(id => { op(db, id).status = 'preparacao_embarque'; });
  const r = T.rodadaDiaria(db, em('2026-11-13', '08'));
  ok(r.iniciou && db.hubPainel._tarefasAutoJob.inicio === '2026-11-13' && tarefas(db).length === 0, 'primeira rodada: marca o início e não cria nada');
  T.rodadaDiaria(db, em('2026-11-14', '08'));
  ok(tarefas(db).length === 0, 'rodada seguinte: nada retroativo para quem já estava no caminho (ETA já dentro dos 30 dias)');
  const pv = T.previaBackfill(db, em('2026-11-14'));
  const gs = pv.map(x => x.gatilho + ' ' + x.op).sort().join(', ');
  ok(gs === 'G1 OP227, G3 OP300, G4 OP300', `prévia: ${gs}`);
  ok(pv.find(x => x.gatilho === 'G1').filhas.join() === 'OP227.1,OP227.2', 'na prévia, o contêiner aparece uma vez, com as filhas');
  const criadas = T.aplicarBackfill(db, pv.filter(x => x.gatilho !== 'G3').map(x => x.chave), 'samir', em('2026-11-14'));
  ok(criadas.length === 2 && criadas.every(t => t.auto.origem === 'backfill' && /aprovada por samir/.test(t.obs)) && !tarefas(db, 'G3').length, 'só cria o que foi aprovado, com quem aprovou');
  ok(T.previaBackfill(db, em('2026-11-14')).map(x => x.gatilho).join() === 'G3', 'o que já foi criado sai da prévia');
}

console.log('\nRanking:');
{
  const db = banco();
  const tk = (resp, prazo, status, doneAt, auto) => db.agendaTasks.push(Object.assign({ _id: 't' + db.agendaTasks.length, t: 'x', resp, prazo, status, doneAt, copia: ['Davi'] }, auto ? { auto: { gatilho: 'G1', chave: 'k' + db.agendaTasks.length } } : {}));
  tk('Matheus', '2026-11-05', 'feita', '2026-11-04', true); tk('Matheus', '2026-11-05', 'feita', '2026-11-09', true); tk('Matheus', '2026-11-08', 'aberta', null, false);
  tk('Ívina', '2026-11-20', 'aberta', null, true);
  const r = T.rankingTarefas(db, '2026-11', 'todas', '2026-11-13'), m = r.find(x => x.resp === 'Matheus');
  ok(m.noPrazo === 1 && m.comAtraso === 1 && m.atrasadasAbertas === 1 && m.diasMediosAtraso === 4.5, 'Matheus: 1 no prazo, 1 com atraso (4 dias), 1 atrasada em aberto (5 dias): média 4,5');
  ok(!r.some(x => x.resp === 'Davi'), 'quem está só em cópia não pontua nem é penalizado');
  const so = T.rankingTarefas(db, '2026-11', 'automatica', '2026-11-13').find(x => x.resp === 'Matheus'), man = T.rankingTarefas(db, '2026-11', 'manual', '2026-11-13').find(x => x.resp === 'Matheus');
  ok(so.atrasadasAbertas === 0 && so.noPrazo === 1 && man.atrasadasAbertas === 1 && man.noPrazo === 0, 'filtro por origem: automática / manual');
}

console.log('\nPrazos editáveis:');
{
  const db = banco(); db.hubPainel._tarefasAuto = { prazos: { G1: 7, diasParaSamir: '5', G2: '' } };
  const c = T.configTarefas(db).prazos;
  ok(c.G1 === 7 && c.diasParaSamir === 5 && c.G2 === 3, 'o que Samir/Davi editam vale; campo vazio volta ao padrão');
  gravar(db, d => { op(d, 'OP300').status = 'preparacao_embarque'; });
  ok(tarefas(db, 'G1')[0].prazo === '2026-11-20', 'Fechar frete com o prazo editado (7 dias)');
}

(async () => {
  console.log('\nPelo servidor (gravação em /api/db):');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tarefas-'));
  process.env.NODE_ENV = 'test'; process.env.SUPABASE_DISABLED = '1';
  process.env.WINDGATE_DB_FILE = path.join(tmp, 'db.json'); process.env.WINDGATE_DB_SECRET = ''; process.env.WINDGATE_SEM_BANCO_REMOTO = '1';
  const base = banco(); fs.writeFileSync(process.env.WINDGATE_DB_FILE, JSON.stringify(base));
  const app = require('../src/server'), srv = app.listen(0), url = `http://127.0.0.1:${srv.address().port}`;
  const salvar = async db => (await fetch(url + '/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(db) })).json();
  const ler = () => JSON.parse(fs.readFileSync(process.env.WINDGATE_DB_FILE, 'utf8'));
  const navegador = clone(base);
  Object.assign(navegador.ops.find(o => o.id === 'OP300'), { status: 'preparacao_embarque', statusPor: 'davi' });
  const r = await salvar(navegador);
  const g = ler(), tk = (g.agendaTasks || []).filter(t => t.auto && t.auto.gatilho === 'G1');
  ok(r.success && tk.length === 1 && tk[0].auto.op === 'OP300' && (g.hubTarefasLog || []).length >= 1, 'mudar a etapa no navegador cria a tarefa no servidor, com log');
  await salvar(navegador);
  ok(ler().agendaTasks.filter(t => t.auto && t.auto.gatilho === 'G1').length === 1, 'o mesmo navegador gravando de novo (sem a tarefa) não apaga nem duplica');
  const p = await (await fetch(url + '/api/tarefas-auto/previa')).json();
  ok(p.success && Array.isArray(p.itens), 'rota da prévia responde');
  await new Promise(x => srv.close(x));
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exitCode = falhou ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
