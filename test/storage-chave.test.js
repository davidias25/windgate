/**
 * Chave do Storage: a de serviço tem preferência (não depende das políticas do storage.objects),
 * e o /api/health diz qual está em uso sem mostrar a chave. Tokens falsos, Storage falso local.
 */
const http = require('http'), path = require('path'), fs = require('fs'), os = require('os');
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const jwt = role => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ role })).toString('base64').replace(/=+$/, ''), 'assinatura-falsa'].join('.');

(async () => {
  const vistos = [];
  const fake = http.createServer((req, res) => {
    let c = ''; req.on('data', x => c += x); req.on('end', () => {
      vistos.push({ m: req.method, u: decodeURIComponent(req.url.split('?')[0]), auth: req.headers.authorization || '' });
      if (req.method === 'POST' && /\/object\/windgate-docs\//.test(req.url)) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ Key: 'windgate-docs/x', Id: 'x' })); }
      if (req.method === 'HEAD' && /\/object\/authenticated\/windgate-docs\/documentos\/1_a\.pdf$/.test(req.url)) { res.writeHead(200); return res.end(); }
      res.writeHead(400); res.end();
    });
  });
  await new Promise(r => fake.listen(0, r));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chave-'));
  process.env.NODE_ENV = 'test';
  delete process.env.SUPABASE_DISABLED;
  process.env.SUPABASE_URL = `http://127.0.0.1:${fake.address().port}`;
  process.env.SUPABASE_KEY = jwt('anon');
  delete process.env.SUPABASE_SERVICE_KEY;
  process.env.WINDGATE_DB_FILE = path.join(tmp, 'db.json'); process.env.WINDGATE_DB_SECRET = ''; process.env.WINDGATE_SEM_BANCO_REMOTO = '1';
  const sup = require('../src/integrations/supabase.service');

  console.log('\nTipo da chave:');
  ok(sup.tipoDaChave().tipo === 'anon' && sup.tipoDaChave().origem === 'SUPABASE_KEY', 'só a chave anon: "anon", vinda de SUPABASE_KEY');
  process.env.SUPABASE_SERVICE_KEY = jwt('service_role');
  ok(sup.tipoDaChave().tipo === 'servico' && sup.tipoDaChave().origem === 'SUPABASE_SERVICE_KEY', 'com a chave de serviço: "servico"');
  const salva = process.env.SUPABASE_SERVICE_KEY;
  process.env.SUPABASE_SERVICE_KEY = 'sb_secret_falsa'; ok(sup.tipoDaChave().tipo === 'servico', 'chave nova sb_secret_: "servico"');
  process.env.SUPABASE_SERVICE_KEY = salva;

  console.log('\nA chave de serviço é a usada:');
  const f = path.join(tmp, 'a.pdf'); fs.writeFileSync(f, 'PDF');
  const r = await sup.uploadParaSupabase(f, 'a.pdf', 'application/pdf');
  const up = vistos.find(v => v.m === 'POST');
  ok(r && up && up.auth === 'Bearer ' + salva, 'envio vai com a chave de serviço, não com a anon');
  ok(await sup.existeNoStorage('documentos/1_a.pdf') === true && vistos.some(v => v.m === 'HEAD' && /\/authenticated\//.test(v.u) && v.auth === 'Bearer ' + salva), 'conferência pelo endereço autenticado (vale também com o bucket privado)');
  ok(await sup.existeNoStorage('documentos/nao.pdf') === false, 'arquivo que não existe: false');

  console.log('\nSaúde:');
  const app = require('../src/server'), srv = app.listen(0);
  const h = await (await fetch(`http://127.0.0.1:${srv.address().port}/api/health`)).json();
  ok(h.storage && h.storage.tipo === 'servico' && h.storage.origem === 'SUPABASE_SERVICE_KEY', '/api/health diz o tipo e a origem da chave');
  ok(!JSON.stringify(h).includes(salva) && !JSON.stringify(h).includes(process.env.SUPABASE_KEY), 'a chave em si não aparece');

  await new Promise(r => srv.close(r)); await new Promise(r => fake.close(r));
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exitCode = falhou ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
