/**
 * PIN não sai do servidor. O teste sobe o servidor real com login ligado e
 * prova que:
 *   1. ninguém recebe o PIN de ninguém no GET /api/db (só `temPin`);
 *   2. o sistema antigo, que preenche o PIN padrão quando não recebe o real,
 *      não consegue gravar esse padrão por cima;
 *   3. trocar PIN só pela rota própria — a pessoa troca o seu, quem administra
 *      acessos troca o de qualquer um — e o login passa a valer com o novo;
 *   4. pessoa nova criada por quem administra entra com o PIN escolhido.
 */
const path = require('path'), fs = require('fs'), os = require('os');
const TMP = path.join(os.tmpdir(), `windgate-pins-${process.pid}.json`);
process.env.NODE_ENV = 'test';
process.env.SUPABASE_DISABLED = '1';
process.env.WINDGATE_DB_FILE = TMP;
process.env.WINDGATE_DB_SECRET = 'segredo-pins-' + process.pid;

let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };

fs.writeFileSync(TMP, JSON.stringify({
  users: { samir: { nome: 'Samir', pin: '7391', config: true, fin: true, tabs: ['painel'] }, davi: { nome: 'Davi', pin: '5824', fin: true, campoFuturo: { x: 1 } },
    matheus: { nome: 'Matheus', pin: '6610' }, ivina: { nome: 'Ívina', pin: '4402' }, oneide: { nome: 'Oneide', pin: '3301', perfilHub: 'rh' }, pedro: { nome: 'Pedro', pin: '9915', perfilHub: 'contador' } },
  ops: [{ _id: 'o1', id: 'OP20' }], fin: [], settings: { schema: 15 }, _removidos: {}
}));

(async () => {
  const app = require('../src/server');
  const auth = require('../src/services/auth.service');
  const srv = app.listen(0), base = `http://127.0.0.1:${srv.address().port}`;
  const tk = k => auth.emitirToken(k);
  const chamar = async (k, metodo, caminho, corpo) => { const r = await fetch(base + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk(k) }, body: corpo ? JSON.stringify(corpo) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  const login = async (usuario, pin) => (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario, pin }) })).status;
  const banco = () => JSON.parse(fs.readFileSync(TMP, 'utf8'));

  console.log('\nLeitura: PIN não sai do servidor');
  for (const k of ['samir', 'davi', 'matheus', 'ivina', 'oneide', 'pedro']) {
    const db = (await chamar(k, 'GET', '/api/db')).j.db;
    const us = Object.values(db.users || {});
    ok(us.length && us.every(u => !('pin' in u)), `${k} não recebe PIN de ninguém`);
  }
  const dbD = (await chamar('davi', 'GET', '/api/db')).j.db;
  ok(dbD.users.samir.temPin === true && dbD.users.davi.campoFuturo.x === 1, 'a tela sabe só se a pessoa tem PIN; os outros campos continuam');
  ok((await chamar('oneide', 'GET', '/api/db')).j.db.users.davi.temPin === true, 'RH também vê só "tem PIN"');

  console.log('\nGravação pelo /api/db não troca PIN');
  // O sistema antigo recebe o usuário sem PIN, preenche o padrão e devolve o banco inteiro.
  const legado = JSON.parse(JSON.stringify(dbD)); Object.values(legado.users).forEach(u => { u.pin = '1234'; });
  legado.users.davi.nome = 'Davi Dias';
  let r = await chamar('davi', 'POST', '/api/db', legado);
  let b = banco();
  ok(r.status === 200 && b.users.samir.pin === '7391' && b.users.davi.pin === '5824' && b.users.matheus.pin === '6610', 'PIN padrão do sistema antigo não sobrescreve nenhum PIN real');
  ok(b.users.davi.nome === 'Davi Dias' && !('temPin' in b.users.davi) && b.users.davi.campoFuturo.x === 1, 'o resto da edição entra; `temPin` não é gravado');
  r = await chamar('samir', 'POST', '/api/db', { users: { davi: Object.assign({}, b.users.davi, { pin: '0000' }) } });
  ok(banco().users.davi.pin === '5824', 'nem quem administra troca PIN pelo /api/db');
  ok(await login('davi', '5824') === 200 && await login('davi', '1234') === 401, 'login continua com o PIN real');

  console.log('\nRota de troca de PIN');
  ok((await chamar('matheus', 'POST', '/api/usuarios/davi/pin', { pin: '2468' })).status === 403, 'Matheus não troca o PIN do Davi');
  ok((await chamar('davi', 'POST', '/api/usuarios/davi/pin', { pin: '12a4' })).status === 400, 'PIN com letra recusado');
  ok((await chamar('davi', 'POST', '/api/usuarios/davi/pin', { pin: '2468' })).status === 200 && banco().users.davi.pin === '2468', 'Davi troca o próprio PIN');
  ok(await login('davi', '2468') === 200 && await login('davi', '5824') === 401, 'login passa a valer com o PIN novo');
  ok((await chamar('samir', 'POST', '/api/usuarios/matheus/pin', { pin: '13579' })).status === 200 && banco().users.matheus.pin === '13579', 'quem administra acessos troca o PIN de qualquer um');
  ok((await chamar('samir', 'POST', '/api/usuarios/fulano/pin', { pin: '1111' })).status === 404, 'pessoa inexistente: 404');
  ok(banco().users.matheus.nome === 'Matheus' && banco().ops.length === 1, 'trocar PIN não mexe em mais nada');

  console.log('\nPessoa nova');
  await chamar('samir', 'POST', '/api/db', { users: { andrea: { nome: 'Ândrea', pin: '8080', tabs: ['painel'] } } });
  ok(banco().users.andrea.pin === '8080' && await login('andrea', '8080') === 200, 'quem administra cria a pessoa já com o PIN');
  await chamar('davi', 'POST', '/api/db', { users: { zeca: { nome: 'Zeca', pin: '9090' } } });
  ok(banco().users.zeca && !banco().users.zeca.pin, 'quem não administra cria a pessoa, mas sem PIN (não define acesso de ninguém)');

  if (srv.closeAllConnections) srv.closeAllConnections();
  await new Promise(x => srv.close(() => x()));
  try { fs.unlinkSync(TMP); fs.unlinkSync(TMP + '.bak'); } catch (e) {}
  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exitCode = falhou ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 3000).unref();
})().catch(e => { console.error(e); process.exit(1); });
