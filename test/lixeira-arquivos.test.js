/**
 * Excluir documento ou lançamento não apaga o arquivo do Storage: vai para a lixeira, e a limpeza mensal
 * só apaga depois de 90 dias e se nenhum registro usar. Storage falso local: nada vai ao Supabase de verdade.
 */
const http = require('http'), path = require('path'), fs = require('fs'), os = require('os');
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const W = require('../public/hub/js/regras.js');
const S = (base, p) => `${base}/storage/v1/object/public/windgate-docs/${p}`;

console.log('\nRegra da lixeira:');
{
  const B = 'https://x.supabase.co';
  const db = {
    docs: [{ _id: 'd1', op: 'OP1', link: S(B, 'documentos/1_velho.pdf'), substituidoPor: 'd2' }, { _id: 'd2', op: 'OP1', link: S(B, 'documentos/2_novo.pdf') }],
    checklists: { OP2: { itens: [{ item: 'BL', link: S(B, 'documentos/3_bl.pdf') }] } },
    hubLixeiraArquivos: [
      { _id: 'a', link: S(B, 'documentos/9_solto.pdf'), pedidoEm: '2026-08-01T12:00:00Z' },
      { _id: 'b', link: S(B, 'documentos/8_recente.pdf'), pedidoEm: '2026-10-01T12:00:00Z' },
      { _id: 'c', link: S(B, 'documentos/1_velho.pdf'), pedidoEm: '2026-08-01T12:00:00Z' },
      { _id: 'd', link: S(B, 'documentos/3_bl.pdf'), pedidoEm: '2026-08-01T12:00:00Z' },
      { _id: 'e', link: S(B, 'documentos/7_ja.pdf'), pedidoEm: '2026-08-01T12:00:00Z', apagadoEm: '2026-11-01T00:00:00Z' }]
  };
  const ids = W.lixeiraParaApagar(db, '2026-11-10').map(x => x._id);
  ok(ids.join() === 'a', `só o que tem mais de 90 dias e nada usa (${ids.join()})`);
  ok(!ids.includes('b'), 'pedido há menos de 90 dias: fica');
  ok(!ids.includes('c'), 'ainda usado por uma versão antiga do documento: fica');
  ok(!ids.includes('d'), 'ainda usado num checklist: fica');
  ok(!ids.includes('e'), 'já apagado: não repete');
  ok(W.lixeiraParaApagar({}, '2026-11-10').length === 0, 'banco sem lixeira não quebra');
}

(async () => {
  console.log('\nServidor com Storage falso:');
  const apagados = [];
  const fake = http.createServer((req, res) => {
    let corpo = ''; req.on('data', c => corpo += c); req.on('end', () => {
      if (req.method === 'DELETE' && /^\/storage\/v1\/object\/windgate-docs\/?$/.test(req.url.split('?')[0])) {
        const p = (JSON.parse(corpo || '{}').prefixes || []); apagados.push(...p);
        res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(p.map(name => ({ name }))));
      }
      if (req.method === 'POST' && /\/object\/list\//.test(req.url)) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('[]'); }
      res.writeHead(404); res.end();
    });
  });
  await new Promise(r => fake.listen(0, r));
  const base = `http://127.0.0.1:${fake.address().port}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lixeira-'));
  process.env.NODE_ENV = 'test';
  delete process.env.SUPABASE_DISABLED;
  process.env.SUPABASE_URL = base; process.env.SUPABASE_KEY = 'chave-falsa';
  process.env.WINDGATE_DB_FILE = path.join(tmp, 'db.json'); process.env.WINDGATE_DB_SECRET = ''; process.env.WINDGATE_SEM_BANCO_REMOTO = '1';
  const usado = S(base, 'documentos/5_usado.pdf'), solto = S(base, 'documentos/6_solto.pdf');
  fs.writeFileSync(process.env.WINDGATE_DB_FILE, JSON.stringify({ docs: [{ _id: 'd5', op: 'OP5', nome: 'Usado', link: usado }], fin: [] }));
  const app = require('../src/server'), srv = app.listen(0), api = `http://127.0.0.1:${srv.address().port}`;
  const excluir = async url => (await fetch(api + '/api/upload', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })).json();
  const banco = () => JSON.parse(fs.readFileSync(process.env.WINDGATE_DB_FILE, 'utf8'));
  const limpar = async hoje => (await fetch(api + '/api/storage/lixeira/limpar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hoje }) })).json();

  const r = await excluir(solto); await excluir(usado); await excluir(solto);
  ok(r.success && /lixeira/i.test(r.message) && r.supaDeleted === false, 'excluir responde que foi para a lixeira');
  ok(apagados.length === 0, 'nada sai do Storage na hora da exclusão');
  const lx = banco().hubLixeiraArquivos || [];
  ok(lx.length === 2 && lx.every(x => x.pedidoEm), 'pedido guardado na lixeira, sem repetir o mesmo arquivo');

  const r1 = await limpar(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  ok(r1.success && r1.candidatos === 0 && apagados.length === 0, 'antes de 90 dias: nada é apagado');
  const r2 = await limpar(new Date(Date.now() + 91 * 86400000).toISOString().slice(0, 10));
  ok(r2.apagados === 1 && apagados.length === 1 && apagados[0] === 'documentos/6_solto.pdf', 'depois de 90 dias: sai só o que nada usa');
  const b = banco();
  ok(b.docs.length === 1 && b.docs[0].link === usado, 'o documento que usa o arquivo continua igual');
  ok(b.hubLixeiraArquivos.find(x => x.link === solto).apagadoEm && !b.hubLixeiraArquivos.find(x => x.link === usado).apagadoEm, 'a lixeira registra o que foi apagado e quando');
  const r3 = await limpar(new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10));
  ok(r3.apagados === 0 && apagados.length === 1, 'não apaga de novo');

  await new Promise(r => srv.close(r)); await new Promise(r => fake.close(r));
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exitCode = falhou ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
