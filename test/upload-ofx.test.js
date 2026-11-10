/**
 * Extrato do banco: o envio aceita OFX pela rota de verdade. Arquivo perigoso continua recusado.
 */
const path = require('path'), fs = require('fs'), os = require('os');
process.env.NODE_ENV = 'test';
process.env.SUPABASE_DISABLED = '1';
process.env.WINDGATE_DB_FILE = path.join(os.tmpdir(), `windgate-ofx-${process.pid}.json`);
process.env.WINDGATE_DB_SECRET = '';
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };

(async () => {
  const app = require('../src/server'), srv = app.listen(0), base = `http://127.0.0.1:${srv.address().port}`;
  const enviar = async (nome, tipo) => {
    const fd = new FormData();
    fd.append('arquivo', new Blob(['OFXHEADER:100\n<OFX></OFX>'], { type: tipo }), nome);
    const r = await fetch(base + '/api/upload', { method: 'POST', body: fd });
    return { status: r.status, j: await r.json().catch(() => ({})) };
  };
  const guardados = [];
  for (const [nome, tipo] of [['extrato.ofx', 'application/x-ofx'], ['extrato.OFX', ''], ['extrato.ofx', 'application/octet-stream'], ['extrato.qfx', 'application/octet-stream'], ['extrato.ofc', 'application/octet-stream']]) {
    const r = await enviar(nome, tipo);
    ok(r.status === 200 && r.j.success, `${nome} (${tipo || 'sem tipo'}) é aceito`);
    if (r.j.fileName) guardados.push(r.j.fileName);
  }
  ok(!(await enviar('virus.exe', 'application/octet-stream')).j.success, '.exe continua recusado');
  ok(!(await enviar('script.js', 'text/javascript')).j.success, '.js continua recusado');
  ok(!(await enviar('sem-tipo.xyz', 'application/octet-stream')).j.success, 'extensão desconhecida continua recusada');
  guardados.forEach(n => { try { fs.unlinkSync(path.join(__dirname, '../uploads', n)); } catch (e) {} });
  await new Promise(ok => srv.close(ok)); try { fs.unlinkSync(process.env.WINDGATE_DB_FILE); fs.unlinkSync(process.env.WINDGATE_DB_FILE + '.bak'); } catch (e) {}
  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exitCode = falhou ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
