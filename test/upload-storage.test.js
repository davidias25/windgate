/**
 * Envio para o Storage, com um Storage falso local: nenhum teste chama o Supabase de verdade.
 * Sucesso só quando o Storage confirma; três tentativas; nunca cai para o disco; nome com acento e parênteses vira link que abre.
 */
const http = require('http'), path = require('path'), fs = require('fs'), os = require('os');
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };

(async () => {
  /* Storage falso: guarda o que recebe; "falhar" diz quantas vezes recusar antes de aceitar. */
  const guardados = new Map(); let falhar = 0, chamadas = 0;
  const fake = http.createServer((req, res) => {
    let corpo = []; req.on('data', c => corpo.push(c)); req.on('end', () => {
      const m = /^\/storage\/v1\/object\/(?:public\/)?([^/]+)\/(.+)$/.exec(decodeURIComponent(req.url.split('?')[0]));
      if (req.method === 'POST' && m) {
        chamadas++;
        if (falhar > 0) { falhar--; res.writeHead(500, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ statusCode: '500', error: 'falha', message: 'falha simulada' })); }
        guardados.set(m[2], Buffer.concat(corpo)); res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ Key: m[1] + '/' + m[2], Id: 'x' }));
      }
      if (req.method === 'GET' && m) { const b = guardados.get(m[2]); res.writeHead(b ? 200 : 404); return res.end(b || ''); }
      res.writeHead(404); res.end();
    });
  });
  await new Promise(ok => fake.listen(0, ok));
  process.env.NODE_ENV = 'test';
  delete process.env.SUPABASE_DISABLED;
  process.env.SUPABASE_URL = `http://127.0.0.1:${fake.address().port}`;
  process.env.SUPABASE_KEY = 'chave-falsa';
  process.env.WINDGATE_DB_FILE = path.join(os.tmpdir(), `windgate-upst-${process.pid}.json`);
  process.env.WINDGATE_DB_SECRET = '';
  process.env.WINDGATE_SEM_BANCO_REMOTO = '1';
  const sup = require('../src/integrations/supabase.service');
  ok(!sup.discoPermitido(), 'com o Storage configurado, o disco não é permitido');
  const tmp = path.join(os.tmpdir(), `up-${process.pid}.pdf`); fs.writeFileSync(tmp, 'PDF');

  console.log('\nNome e link:');
  const r = await sup.uploadParaSupabase(tmp, 'Proposta_WindGate_Custódio Ação (cópia 1).pdf', 'application/pdf');
  ok(r && /Proposta_WindGate_Custodio Acao \(copia 1\)\.pdf$/.test(decodeURIComponent(r.path)), 'acento, "ç" e parênteses: o nome que vai ao Storage é seguro, com a extensão');
  ok(r && !/%25/.test(r.publicUrl), 'o link não é codificado duas vezes');
  const aberto = await fetch(r.publicUrl);
  ok(aberto.status === 200 && (await aberto.text()) === 'PDF', 'o link devolvido abre o arquivo');

  console.log('\nTentativas:');
  falhar = 2; chamadas = 0;
  const r2 = await sup.uploadParaSupabase(tmp, 'Extrato.pdf', 'application/pdf');
  ok(r2 && chamadas === 3, 'falhou duas vezes, deu certo na terceira');
  falhar = 9; chamadas = 0;
  const r3 = await sup.uploadParaSupabase(tmp, 'Extrato.pdf', 'application/pdf');
  ok(r3 === null && chamadas === 3, 'falhou três vezes: devolve vazio, sem link');

  console.log('\nRota de envio:');
  const app = require('../src/server'), srv = app.listen(0), base = `http://127.0.0.1:${srv.address().port}`;
  const enviar = async nome => { const fd = new FormData(); fd.append('arquivo', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), nome); const x = await fetch(base + '/api/upload', { method: 'POST', body: fd }); return { status: x.status, j: await x.json().catch(() => ({})) }; };
  falhar = 0;
  const bom = await enviar('Proposta_WindGate_Sebastião.pdf');
  ok(bom.status === 200 && bom.j.success && /^http:\/\/127\.0\.0\.1/.test(bom.j.finalUrl) && !/\/uploads\//.test(bom.j.finalUrl), 'sucesso só com o link do Storage');
  falhar = 9;
  const antes = fs.readdirSync(path.join(__dirname, '../uploads')).length;
  const ruim = await enviar('Contrato.pdf');
  ok(ruim.status === 502 && !ruim.j.success && /tente de novo/i.test(ruim.j.message) && !ruim.j.finalUrl && !ruim.j.localUrl, 'Storage fora: erro claro e nenhum link, nem para o disco');
  ok(fs.readdirSync(path.join(__dirname, '../uploads')).length === antes, 'o arquivo recusado não fica no disco');

  await new Promise(ok => srv.close(ok)); await new Promise(ok => fake.close(ok));
  try { fs.unlinkSync(tmp); fs.unlinkSync(process.env.WINDGATE_DB_FILE); fs.unlinkSync(process.env.WINDGATE_DB_FILE + '.bak'); } catch (e) {}
  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exitCode = falhou ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
