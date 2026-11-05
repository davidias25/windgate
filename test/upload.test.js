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

console.log('\nArquivos perdidos:');
{
  const W = require('../public/hub/js/regras.js');
  const url = 'https://windgate.onrender.com/uploads/arquivo-1791470516783-635429860.pdf', bom = 'https://x.supabase.co/storage/v1/object/public/windgate-docs/documentos/1_a.pdf';
  ok(W.linkPerdido(url) && W.linkPerdido('/uploads/nf.xml') && !W.linkPerdido(bom) && !W.linkPerdido('') && !W.linkPerdido('https://drive.google.com/x'), 'só o que aponta para /uploads é perdido');
  const db = { docs: [{ _id: 'd1', op: 'OP26', nome: 'OP26 - INVOICE 50%', link: url, por: 'Ívina' }, { _id: 'd2', op: 'OP3', nome: 'Velho', link: url, substituidoPor: 'd9' }, { _id: 'd3', op: 'OP3', nome: 'Removido', link: url, removidoEm: '2026-10-01' }, { _id: 'd4', op: 'OP1', nome: 'Certo', link: bom }],
    fin: [{ _id: 'f1', op: 'OP23', desc: 'Pagamento fábrica', comp: url, por: 'Operador' }, { _id: 'f2', op: 'OP1', comp: bom }], crmDocs: [{ _id: 'c1', nome: 'Proposta.pdf', link: url, enviadoPor: 'Samir' }] };
  const l = W.arquivosPerdidos(db);
  ok(l.length === 3 && l.map(x => x._id).join() === 'c1,f1,d1', 'lista documento, comprovante e proposta, ordenados por operação');
  ok(!l.some(x => x._id === 'd2' || x._id === 'd3'), 'documento já reenviado (nova versão) ou removido sai da lista');
  ok(l.find(x => x._id === 'd1').quando === '2026-10-08' && l.find(x => x._id === 'f1').por === 'Operador', 'mostra quem enviou e quando');
  ok(W.arquivosPerdidos({}).length === 0, 'banco sem essas coleções não quebra');
}

console.log('\nExcluir documento:');
{
  const W = require('../public/hub/js/regras.js');
  const db = W.prepararBanco({ docs: [{ _id: 'v1', op: 'OP1', nome: 'Invoice', substituidoPor: 'v2' }, { _id: 'v2', op: 'OP1', nome: 'Invoice' }, { _id: 'o', op: 'OP2', nome: 'BL' }] });
  const conhecidos = W.fotografarIds(db);
  const fora = W.excluirDocumento(db, 'v2');
  ok(fora && fora._id === 'v2' && db.docs.length === 2, 'tira só o documento escolhido');
  ok(!db.docs.find(d => d._id === 'v1').substituidoPor, 'a versão anterior volta a aparecer');
  ok(db.docs.find(d => d._id === 'o').nome === 'BL' && W.excluirDocumento(db, 'nao-existe') === null, 'o resto fica como está');
  W.registrarRemocoes(db, conhecidos);
  ok(db._removidos && db._removidos.v2, 'a exclusão fica registrada: o documento não volta com a gravação de outra pessoa');
}

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
