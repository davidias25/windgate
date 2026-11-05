/**
 * Envio de arquivos: nome que o Storage aceita e nenhum "sucesso" para arquivo que só ficou no disco
 * do servidor, que é apagado a cada publicação. Não fala com o Storage de verdade: com o Storage
 * "ligado", o endereço aponta para uma porta fechada desta máquina.
 */
const path = require('path'), fs = require('fs'), os = require('os');
process.env.NODE_ENV = 'test';
process.env.SUPABASE_DISABLED = '1';
process.env.WINDGATE_DB_FILE = path.join(os.tmpdir(), `windgate-upload-${process.pid}.json`);
process.env.WINDGATE_DB_SECRET = '';

const { nomeParaStorage, storageAtivo } = require('../src/integrations/supabase.service');
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
/* Caracteres que o Storage aceita no caminho (mesma regra do servidor do Supabase). */
const ACEITO = /^(\w|\/|!|-|\.|\*|'|\(|\)| |&|\$|@|=|;|:|\+|,|\?)*$/;
const latin1 = s => Buffer.from(s, 'utf8').toString('latin1');

console.log('\nNome no Storage:');
[['Proposta_WindGate_Sebastião.pdf', 'Proposta_WindGate_Sebastiao.pdf'], ['OP26 - INVOICE 50%.pdf', 'OP26 - INVOICE 50_.pdf'], ['Relatório de Produção nº 2.pdf', 'Relatorio de Producao n_ 2.pdf'], ['2º recebimento #1.pdf', '2_ recebimento _1.pdf'], [latin1('Claumóveis São João.pdf'), 'Claumoveis Sao Joao.pdf'], ['simples.pdf', 'simples.pdf']]
  .forEach(([de, para]) => { const n = nomeParaStorage(de); ok(n === para && ACEITO.test('documentos/1_' + n), `"${de}" vira "${n}"`); });
ok(!ACEITO.test('documentos/1_Sebastião.pdf') && !ACEITO.test('documentos/1_INVOICE 50%.pdf'), 'os nomes originais são os que o Storage recusa');
ok(nomeParaStorage('') === 'arquivo' && nomeParaStorage(null) === 'arquivo', 'sem nome: "arquivo"');

(async () => {
  const app = require('../src/server');
  const srv = app.listen(0), base = `http://127.0.0.1:${srv.address().port}`;
  const enviar = async nome => { const fd = new FormData(); fd.append('arquivo', new Blob(['%PDF-teste'], { type: 'application/pdf' }), nome); const r = await fetch(base + '/api/upload', { method: 'POST', body: fd }); return { status: r.status, j: await r.json() }; };
  const pasta = path.join(__dirname, '../uploads'), antes = () => fs.readdirSync(pasta).length;

  console.log('\nEnvio:');
  let n = antes();
  const sem = await enviar('sem-storage.pdf');
  ok(!storageAtivo() && sem.status === 200 && sem.j.success && /\/uploads\//.test(sem.j.finalUrl), 'sem Storage (ambiente local): continua guardando no disco');
  if (sem.j.fileName) fs.unlink(path.join(pasta, sem.j.fileName), () => {});

  await new Promise(r => setTimeout(r, 50)); n = antes();
  delete process.env.SUPABASE_DISABLED; process.env.SUPABASE_URL = 'http://127.0.0.1:9'; process.env.SUPABASE_KEY = 'chave-falsa-de-teste';
  const falha = await enviar('Sebastião.pdf');
  ok(storageAtivo() && falha.status === 502 && falha.j.success === false && !falha.j.finalUrl, 'com Storage e falha no envio: responde erro, sem link /uploads');
  ok(/não foi guardado/.test(falha.j.message), 'e explica o que aconteceu');
  await new Promise(r => setTimeout(r, 100));
  ok(antes() === n, 'o arquivo não fica para trás no disco');
  process.env.SUPABASE_DISABLED = '1';

  srv.close(); try { fs.unlinkSync(process.env.WINDGATE_DB_FILE); } catch (e) {}
  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
