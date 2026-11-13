/**
 * Prazo da etapa pela própria operação: "Em trânsito" segue o ETA (ou o transit time digitado), "Em produção" o
 * prazo de produção digitado; os dias das Configurações ficam como padrão. Filhas herdam da mãe. Mudança de ETA
 * ou de prazo vai para a linha do tempo. Torre, alertas e ranking usam esse prazo. Dados inventados.
 */
const path = require('path'), fs = require('fs'), os = require('os');
const W = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/comex.js'));
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const users = { samir: { nome: 'Samir' }, davi: { nome: 'Davi' }, matheus: { nome: 'Matheus' }, ivina: { nome: 'Ívina' } };
const op23 = () => ({ _id: 'o23', id: 'OP23', cliente: 'Cliente', status: 'embarcado', statusEm: '2026-10-09', eta: '2026-11-29' });

console.log('\nEm trânsito pelo ETA (caso da OP23: 09/10 → 29/11, 51 dias):');
{
  const db = { users, settings: { prazosStatus: { embarcado: 45 } }, ops: [op23()] }, o = db.ops[0];
  const p = W.prazoInfo(db, o, '2026-11-24');
  ok(p.alvo === 51 && p.origem === 'eta' && p.sit !== 'atrasado', `24/11: prazo 51 dias até o ETA, não atrasada (${p.dias} dias na etapa)`);
  ok(W.prazoAlvo(db, 'embarcado') === 45 && p.dias > 45, 'com o prazo fixo de 45 dias ela já estaria "atrasada" (alerta falso de antes)');
  ok(W.prazoInfo(db, o, '2026-11-30').sit === 'atrasado', '30/11, depois do ETA: aí sim atrasada');
  const sem = { users, settings: { prazosStatus: { embarcado: 45 } }, ops: [Object.assign(op23(), { eta: '' })] };
  ok(W.prazoInfo(sem, sem.ops[0], '2026-11-24').alvo === 45 && W.prazoInfo(sem, sem.ops[0], '2026-11-24').origem === 'padrao', 'sem ETA: os 45 dias das Configurações');
  const cfg = { users, settings: { prazosStatus: { embarcado: 40 } }, ops: [Object.assign(op23(), { eta: '' })] };
  ok(W.prazoInfo(cfg, cfg.ops[0], '2026-11-24').alvo === 40, 'o padrão continua editável nas Configurações');
  const manual = { users, settings: {}, ops: [Object.assign(op23(), { transitTime: '60' })] };
  ok(W.prazoInfo(manual, manual.ops[0], '2026-12-01').alvo === 60 && W.prazoInfo(manual, manual.ops[0], '2026-12-01').origem === 'manual' && W.prazoInfo(manual, manual.ops[0], '2026-12-01').sit !== 'atrasado', 'transit time digitado (60) vale no lugar do ETA');
  const torto = { users, settings: {}, ops: [Object.assign(op23(), { eta: '2026-10-01' })] };
  ok(W.prazoInfo(torto, torto.ops[0], '2026-11-24').origem === 'padrao', 'ETA anterior à entrada na etapa (erro de digitação): usa o padrão');
}

console.log('\nEm produção:');
{
  const db = { users, settings: {}, ops: [{ id: 'OP30', status: 'producao', statusEm: '2026-10-01', prazoProducao: '75' }, { id: 'OP31', status: 'producao', statusEm: '2026-10-01' }] };
  ok(W.prazoInfo(db, db.ops[0], '2026-12-01').alvo === 75 && W.prazoInfo(db, db.ops[0], '2026-12-01').sit !== 'atrasado', 'prazo de produção digitado (75 dias) vale para essa operação');
  ok(W.prazoInfo(db, db.ops[1], '2026-12-01').alvo === W.prazoAlvo(db, 'producao'), 'sem prazo digitado: o padrão das Configurações');
}

console.log('\nContêiner compartilhado:');
{
  const db = { users, settings: {}, ops: [{ id: 'OP227', papel: 'mae', status: 'embarcado', statusEm: '2026-10-09', eta: '2026-11-29', transitTime: '55' },
    { id: 'OP227.1', maeId: 'OP227', status: 'embarcado', statusEm: '2026-10-09', eta: '2026-11-29' }] };
  ok(W.prazoInfo(db, db.ops[1], '2026-11-24').alvo === 55, 'a filha usa o transit time da mãe');
  ok(W.CAMPOS_HERDADOS.includes('transitTime') && W.CAMPOS_HERDADOS.includes('prazoProducao'), 'transit time e prazo de produção são copiados da mãe para as filhas');
}

console.log('\nTorre e ranking usam o prazo da operação:');
{
  const db = { users, settings: {}, ops: [op23()], fin: [], agendaTasks: [], hubRecados: [], opStatusHist: [] };
  const atrasos = W.excecoes(db, 'samir', '2026-11-24', {}).filter(x => x.tipo === 'prazo');
  ok(atrasos.length === 0, '24/11: nenhum alerta de atraso para a OP23');
  ok(W.excecoes(db, 'samir', '2026-11-30', {}).some(x => x.tipo === 'prazo' && x.op === 'OP23'), '30/11: o alerta aparece');
  ok(W.prazoAlvoOp(db, db.ops[0], 'embarcado', '2026-10-09') === 51, 'etapa concluída é medida pelo prazo da operação (ranking e gestão)');
}

console.log('\nLinha do tempo:');
{
  const antes = { ops: [Object.assign(op23(), { statusPor: 'matheus' })], opStatusHist: [] };
  const depois = { ops: [Object.assign(op23(), { eta: '2026-12-05', statusPor: 'matheus' })], opStatusHist: [] };
  const l = W.mudancasDePrazo(antes, depois, '2026-11-20T10:00:00Z');
  ok(l.length === 1 && l[0].tipo === 'prazo' && /ETA 29\/11\/2026 → 05\/12\/2026 · prazo em trânsito: 57 dia\(s\) até o ETA/.test(l[0].motivo), 'ETA mudou: entra na linha do tempo, com o prazo novo (57 dias)');
  depois.opStatusHist = l;
  ok(W.mudancasDePrazo(antes, depois, '2026-11-20T11:00:00Z').length === 0, 'gravar de novo não repete');
  const tt = W.mudancasDePrazo({ ops: [op23()] }, { ops: [Object.assign(op23(), { transitTime: '60' })] }, '2026-11-20T10:00:00Z');
  ok(tt.length === 1 && /Transit time ajustado: 60 dia\(s\)/.test(tt[0].motivo), 'transit time digitado também fica registrado');
  const filha = W.mudancasDePrazo({ ops: [{ id: 'OP1.1', maeId: 'OP1', eta: '2026-11-01' }] }, { ops: [{ id: 'OP1.1', maeId: 'OP1', eta: '2026-11-09' }] });
  ok(filha.length === 0, 'na filha não repete (o registro é da mãe)');
}

(async () => {
  console.log('\nPelo servidor (ETA alterado na gravação):');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prazo-'));
  process.env.NODE_ENV = 'test'; process.env.SUPABASE_DISABLED = '1';
  process.env.WINDGATE_DB_FILE = path.join(tmp, 'db.json'); process.env.WINDGATE_DB_SECRET = ''; process.env.WINDGATE_SEM_BANCO_REMOTO = '1';
  const base = { users, ops: [op23()], opStatusHist: [], fin: [] };
  fs.writeFileSync(process.env.WINDGATE_DB_FILE, JSON.stringify(base));
  const app = require('../src/server'), srv = app.listen(0), url = `http://127.0.0.1:${srv.address().port}`;
  const nav = JSON.parse(JSON.stringify(base)); nav.ops[0].eta = '2026-12-02';
  await fetch(url + '/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nav) });
  const g = JSON.parse(fs.readFileSync(process.env.WINDGATE_DB_FILE, 'utf8'));
  ok((g.opStatusHist || []).some(h => h.tipo === 'prazo' && h.op === 'OP23' && /ETA 29\/11\/2026 → 02\/12\/2026/.test(h.motivo)), 'mudar o ETA na tela grava a linha na linha do tempo da operação');
  await new Promise(x => srv.close(x));
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exitCode = falhou ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
