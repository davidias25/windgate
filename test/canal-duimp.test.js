/**
 * Canal da DUIMP pelo botão "Atualizar DUIMPs": leitura do canal, selo na lista, Torre do Davi e da Ívina
 * e recado quando o canal muda para amarelo, vermelho ou cinza (uma vez por DUIMP e canal). O Portal Único é
 * SIMULADO: nenhum teste chama o Siscomex de verdade, e nada é registrado ou retificado (só consulta).
 */
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'canal-'));
process.env.NODE_ENV = 'test'; process.env.SUPABASE_DISABLED = '1';
process.env.WINDGATE_DB_FILE = path.join(tmp, 'db.json'); process.env.WINDGATE_DB_SECRET = ''; process.env.WINDGATE_SEM_BANCO_REMOTO = '1';
const W = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/comex.js'));
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const users = { samir: { nome: 'Samir' }, davi: { nome: 'Davi' }, matheus: { nome: 'Matheus' }, ivina: { nome: 'Ívina' } };

console.log('\nLeitura do canal:');
{
  const c = v => W.canalDuimp({ duimpSituacao: { canal: v } });
  ok(c('VERDE').k === 'verde' && !c('VERDE').acao && c('Amarelo').k === 'amarelo' && c('CANAL VERMELHO').k === 'vermelho' && c('cinza').k === 'cinza', 'verde, amarelo, vermelho e cinza, em qualquer grafia');
  ok(c('amarelo').acao && c('vermelho').acao && c('cinza').acao, 'amarelo, vermelho e cinza pedem ação');
  ok(W.canalDuimp({}) === null && W.canalDuimp({ duimpSituacao: {} }) === null, 'sem consulta: sem canal');
}

console.log('\nTorre:');
{
  const db = { users, ops: [
    { id: 'OP500', status: 'chegada', duimp: '26BR0000000500-1', duimpSituacao: { canal: 'VERMELHO', atualizadoEm: '2026-11-13T10:00:00Z' } },
    { id: 'OP501', status: 'chegada', duimp: '26BR0000000501-1', duimpSituacao: { canal: 'VERDE' } },
    { id: 'OP502', status: 'chegada', duimp: '26BR0000000502-1', duimpSituacao: { canal: 'AMARELO', desembaraco: '2026-11-12' } },
    { id: 'OP227', papel: 'mae', status: 'chegada', duimp: '26BR0000000227-1', duimpSituacao: { canal: 'CINZA' } },
    { id: 'OP227.1', maeId: 'OP227', status: 'chegada', duimp: '26BR0000000227-1', duimpSituacao: { canal: 'CINZA' } }
  ], fin: [], agendaTasks: [], hubRecados: [] };
  const ids = W.canaisComAcao(db).map(x => x.o.id).sort().join();
  ok(ids === 'OP227,OP500', `pedem ação: vermelho e cinza; verde e já desembaraçada ficam de fora; o contêiner aparece uma vez (${ids})`);
  const t = k => W.excecoes(db, k, '2026-11-13', {}).filter(x => x.tipo === 'canal');
  ok(t('davi').length === 2 && t('ivina').length === 2 && t('samir').length === 2, 'aparece na Torre do Davi e da Ívina (e da diretoria)');
  ok(t('matheus').length === 0, 'Matheus não recebe');
  ok(t('davi').find(x => x.op === 'OP500').nivel === 3 && /canal vermelho/.test(t('davi').find(x => x.op === 'OP500').titulo), 'vermelho com prioridade máxima');
}

(async () => {
  console.log('\nBotão "Atualizar DUIMPs" (Portal Único simulado):');
  const db = { users, ops: [
    { _id: 'o500', id: 'OP500', status: 'chegada', duimp: '26BR0000000500-1', duimpSituacao: { canal: 'VERDE', atualizadoEm: '2026-11-10T10:00:00Z' } },
    { _id: 'o501', id: 'OP501', status: 'chegada', duimp: '26BR0000000501-1' },
    { _id: 'o502', id: 'OP502', status: 'chegada', duimp: '26BR0000000502-1', duimpSituacao: { canal: 'VERDE' } }
  ], fin: [], agendaTasks: [], hubRecados: [], opStatusHist: [], _removidos: {} };
  fs.writeFileSync(process.env.WINDGATE_DB_FILE, JSON.stringify(db));
  const canalDe = { '26BR00000005001': 'VERMELHO', '26BR00000005011': 'VERDE', '26BR00000005021': 'VERDE' }, chamadas = [];
  require('../src/services/portal-unico.service')._usarRequisicao(async (url, o) => {
    const u = new URL(url); chamadas.push(o && o.method || 'GET');
    if (/autenticar$/.test(u.pathname)) return { status: 200, headers: { 'set-token': 'Bearer sim', 'x-csrf-token': 'c' }, corpo: '' };
    const num = Object.keys(canalDe).find(n => url.includes(n));
    const desemb = num === '26BR00000005021' ? { dataDesembaraco: '2026-11-13' } : {};
    return { status: 200, headers: {}, corpo: JSON.stringify(Object.assign({ versao: '2', situacao: { situacaoDuimp: num === '26BR00000005021' ? 'DESEMBARACADA' : 'EM ANALISE' }, resultadoAnaliseRisco: { canalConsolidado: canalDe[num] } }, desemb)) };
  });
  const app = require('../src/server'), srv = app.listen(0), url = `http://127.0.0.1:${srv.address().port}`;
  const clicar = async () => (await fetch(url + '/api/portal-unico/duimps', { method: 'POST' })).json();
  const ler = () => JSON.parse(fs.readFileSync(process.env.WINDGATE_DB_FILE, 'utf8'));
  const r = await clicar(), g = ler();
  ok(r.success && r.atualizadas === 3 && g.ops.find(o => o.id === 'OP500').duimpSituacao.canal === 'VERMELHO' && g.ops.find(o => o.id === 'OP501').duimpSituacao.canal === 'VERDE', 'o clique consulta as DUIMPs e grava o canal de cada operação');
  const rec = (g.hubRecados || []).filter(x => /canal/.test(x.texto));
  const r500 = rec.filter(x => /OP500/.test(x.texto));
  ok(r500.length === 2 && r500.some(x => x.para === 'samir') && r500.some(x => x.para === 'davi') && r500.every(x => /canal vermelho \(era verde\)/.test(x.texto)), '2.3: verde → vermelho: recado para Samir e Davi, dizendo de onde veio');
  const tv = (g.agendaTasks || []).find(t => t.auto && t.auto.gatilho === 'CANAL' && t.auto.op === 'OP500');
  ok(tv && tv.resp === 'Ívina' && /despachante/.test(tv.t), '2.3: vermelho abre tarefa para a Ívina acompanhar com o despachante');
  const verde = rec.filter(x => /OP501/.test(x.texto));
  ok(verde.length === 1 && verde[0].para === 'todos', '2.3: canal verde: aviso para todos');
  const o502 = g.ops.find(o => o.id === 'OP502'), h502 = (g.opStatusHist || []).find(x => x.op === 'OP502');
  ok(o502.status === 'logistica' && h502 && h502.para === 'logistica' && h502.dataReal === '2026-11-13' && /desembaraçada em 13\/11\/2026/.test(h502.motivo), '2.3: desembaraçada: vai sozinha para Logística nacional, com a data no histórico');
  ok(!rec.some(x => /OP502/.test(x.texto)), 'continuar no mesmo canal (verde → verde) não gera recado');
  const r2 = await clicar();
  ok(r2.avisos === 0 && (ler().hubRecados || []).filter(x => /canal/.test(x.texto)).length === rec.length && (ler().agendaTasks || []).filter(t => t.auto && t.auto.gatilho === 'CANAL').length === 1, 'clicar de novo com o mesmo canal não repete o aviso nem a tarefa');
  ok(chamadas.every(m => m === 'GET' || m === 'POST') && !chamadas.some(m => m === 'PUT' || m === 'DELETE'), 'só consulta: nenhuma chamada de registro ou retificação');
  await new Promise(x => srv.close(x));
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exitCode = falhou ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
