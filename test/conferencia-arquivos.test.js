/**
 * Conferência diária dos links de arquivo com o Storage, com um Storage falso local
 * (nenhum teste chama o Supabase de verdade). Nada é apagado nem renomeado no banco.
 */
const http = require('http'), path = require('path'), fs = require('fs'), os = require('os');
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };

const W = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/comex.js'));
const { mesclarDB } = require('../src/services/db-merge.service');
const S = p => `https://x.supabase.co/storage/v1/object/public/windgate-docs/${p}`;
const DISCO = 'https://windgate.onrender.com/uploads/arquivo-1791470516783-635429860.pdf';

const banco = () => ({
  docs: [{ _id: 'd1', op: 'OP26', nome: 'Invoice', link: S('documentos/1_Invoice.pdf'), por: 'Ívina' },
         { _id: 'd2', op: 'OP26', nome: 'Packing', link: S('documentos/2_Packing%20List.pdf') },
         { _id: 'd3', op: 'OP3', nome: 'Velho', link: S('documentos/3_Velho.pdf'), substituidoPor: 'd1' },
         { _id: 'd4', op: 'OP3', nome: 'No Drive', link: 'https://drive.google.com/file/d/abc' }],
  fin: [{ _id: 'f1', op: 'OP23', desc: 'Pagamento fábrica', comp: DISCO, por: 'Operador' }],
  crmDocs: [{ _id: 'c1', nome: 'Proposta.pdf', link: S('documentos/4_Proposta.pdf') }],
  checklists: { OP26: { itens: [{ item: 'Contrato de câmbio', link: S('documentos/5_Cambio.pdf') }] } },
  hubNotas: [{ _id: 'n1', desc: 'NF 123', pdf: S('notas/6_NF123.pdf'), xml: S('notas/6_NF123.xml') }],
  hubExtratos: [{ _id: 'e1', banco: 'Itaú', mes: '2026-10', arquivo: 'extrato.ofx', link: S('documentos/7_extrato.ofx') }],
  hubComprovantes: [{ _id: 'k1', nome: 'Pix', anexos: [S('documentos/8_pix.jpg')] }]
});

console.log('\nLinks do banco:');
{
  const l = W.linksDeArquivo(banco());
  const cols = new Set(l.map(x => x.col));
  ok(['docs', 'fin', 'crmDocs', 'checklists', 'hubNotas', 'hubExtratos', 'hubComprovantes'].every(c => cols.has(c)), 'acha link nas sete coleções');
  ok(l.length === 9, `nove links: oito no Storage e um no disco (achou ${l.length})`);
  ok(!l.some(x => x._id === 'd3') && !l.some(x => /drive\.google/.test(x.link)), 'documento substituído e link do Drive ficam de fora');
  const ck = l.find(x => x.col === 'checklists');
  ok(ck.op === 'OP26' && ck.nome === 'Contrato de câmbio' && ck.campo === 'itens.0.link', 'item de checklist: operação, nome e campo');
  ok(l.filter(x => x._id === 'n1').map(x => x.campo).join() === 'pdf,xml', 'nota: PDF e XML');
  ok(W.caminhoNoStorage(S('documentos/2_Packing%20List.pdf')).path === 'documentos/2_Packing List.pdf' && W.caminhoNoStorage('https://drive.google.com/x') === null, 'caminho no Storage, decodificado');
  ok(W.linksDeArquivo({}).length === 0 && W.linksDeArquivo(null).length === 0, 'banco vazio não quebra');
}

console.log('\nConferência:');
{
  const l = W.linksDeArquivo(banco());
  const q = W.conferirLinks(l, p => p === 'documentos/4_Proposta.pdf' ? false : (p === 'documentos/5_Cambio.pdf' ? undefined : true));
  ok(q.length === 2 && q.some(x => x._id === 'f1' && /disco/.test(x.motivo)) && q.some(x => x._id === 'c1' && /Storage/.test(x.motivo)), 'quebrado: o do disco e o que não está no Storage');
  ok(!q.some(x => x.col === 'checklists'), 'sem resposta do Storage: não marca como perdido');
}

console.log('\nArquivos perdidos e Torre:');
{
  const db = banco();
  db.hubPainel = { _arquivos: { em: '2026-11-10T10:00:00Z', quebrados: [{ col: 'crmDocs', _id: 'c1', link: S('documentos/4_Proposta.pdf') }] } };
  const p = W.arquivosPerdidos(db);
  ok(p.length === 2 && p.map(x => x._id).join() === 'c1,f1', 'disco + o que a conferência não achou');
  ok(p.find(x => x._id === 'c1').motivo === 'Não está no Storage', 'diz por quê');
  db.crmDocs[0].link = S('documentos/9_Proposta.pdf');
  ok(!W.arquivosPerdidos(db).some(x => x._id === 'c1'), 'reenviado (link novo): sai da lista sem esperar a próxima conferência');
  const db2 = W.prepararBanco ? W.prepararBanco(banco()) : banco();
  const ex = W.excecoes(db2, 'samir', '2026-11-10', {});
  const a = ex.find(x => x.tipo === 'arquivo');
  ok(a && /^Arquivo perdido: reenviar/.test(a.titulo) && a.ir[0] === 'docs', 'a Torre mostra "Arquivo perdido: reenviar" e leva a Documentos');
  db2.fin = []; ok(!W.excecoes(db2, 'samir', '2026-11-10', {}).some(x => x.tipo === 'arquivo'), 'nada perdido: nada na Torre');
}

console.log('\nGravação:');
{
  const novo = { em: '2026-11-10T10:00:00Z', quebrados: [] }, velho = { em: '2026-11-09T10:00:00Z', quebrados: [{ link: 'x' }] };
  const m = mesclarDB({ hubPainel: { _arquivos: novo, a: 1 } }, { hubPainel: { _arquivos: velho, b: 2 } });
  ok(m.hubPainel._arquivos === novo && m.hubPainel.a === 1 && m.hubPainel.b === 2, 'cópia antiga de um navegador não desfaz a conferência mais nova');
  ok(mesclarDB({ hubPainel: { _arquivos: velho } }, { hubPainel: { _arquivos: novo } }).hubPainel._arquivos === novo, 'a mais nova chega normalmente');
}

(async () => {
  console.log('\nServidor com Storage falso:');
  const existem = new Set(['documentos/1_Invoice.pdf', 'documentos/2_Packing List.pdf', 'documentos/5_Cambio.pdf', 'notas/6_NF123.pdf', 'notas/6_NF123.xml', 'documentos/7_extrato.ofx', 'documentos/8_pix.jpg']);
  let semPermissao = false, heads = 0;
  const fake = http.createServer((req, res) => {
    let corpo = ''; req.on('data', c => corpo += c); req.on('end', () => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      if (req.method === 'POST' && /^\/storage\/v1\/object\/list\//.test(u)) {
        const b = JSON.parse(corpo || '{}'), pre = b.prefix ? b.prefix.replace(/\/$/, '') + '/' : '';
        const itens = new Map();
        if (!semPermissao) existem.forEach(p => { if (!p.startsWith(pre)) return; const resto = p.slice(pre.length), i = resto.indexOf('/'); itens.set(i < 0 ? resto : resto.slice(0, i), i < 0); });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify([...itens].slice(b.offset || 0, (b.offset || 0) + (b.limit || 100)).map(([name, arq]) => ({ name, id: arq ? 'id-' + name : null, metadata: arq ? { size: 1 } : null }))));
      }
      const m = /^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/.exec(u);
      if (req.method === 'HEAD' && m) { heads++; res.writeHead(existem.has(m[2]) ? 200 : 400); return res.end(); }
      res.writeHead(404); res.end();
    });
  });
  await new Promise(r => fake.listen(0, r));
  const base = `http://127.0.0.1:${fake.address().port}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-arq-'));
  process.env.NODE_ENV = 'test';
  delete process.env.SUPABASE_DISABLED;
  process.env.SUPABASE_URL = base; process.env.SUPABASE_KEY = 'chave-falsa';
  process.env.WINDGATE_DB_FILE = path.join(tmp, 'db.json'); process.env.WINDGATE_DB_SECRET = ''; process.env.WINDGATE_SEM_BANCO_REMOTO = '1';
  const semente = JSON.parse(JSON.stringify(banco()).split('https://x.supabase.co').join(base));
  fs.writeFileSync(process.env.WINDGATE_DB_FILE, JSON.stringify(semente));
  const app = require('../src/server'), srv = app.listen(0), api = `http://127.0.0.1:${srv.address().port}`;
  const conferir = async () => { const r = await fetch(api + '/api/storage/conferir', { method: 'POST' }); return r.json(); };

  const r1 = await conferir();
  ok(r1.success && r1.links === 9, `conferiu os nove links (${r1.links})`);
  ok(r1.quebrados.length === 2 && r1.quebrados.some(q => q._id === 'c1') && r1.quebrados.some(q => q._id === 'f1'), 'quebrados: a proposta que não está no Storage e o comprovante do disco');
  ok(r1.listagem === 7 && heads === 1, `listou o bucket inteiro, pastas incluídas, e só conferiu link por link o que faltou (${heads})`);
  const g = await (await fetch(api + '/api/storage/conferencia')).json();
  ok(g.conferencia && g.conferencia.quebrados.length === 2 && g.conferencia.em, 'o resultado fica guardado no banco');

  semPermissao = true; heads = 0;
  const r2 = await conferir();
  ok(r2.quebrados.length === 2 && heads === 8, 'listagem vazia (sem permissão): confere link por link e não marca tudo como perdido');
  const dbf = JSON.parse(fs.readFileSync(process.env.WINDGATE_DB_FILE, 'utf8'));
  ok(dbf.docs.length === 4 && dbf.crmDocs[0].link === semente.crmDocs[0].link && dbf.fin[0].comp === DISCO, 'nada apagado nem renomeado no banco');

  await new Promise(r => srv.close(r)); await new Promise(r => fake.close(r));
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exitCode = falhou ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
