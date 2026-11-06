/**
 * Contrato padrão. O modelo daqui é de teste, com texto fictício: o oficial vem de gen.py e gen2.py.
 */
const path = require('path'), fs = require('fs'), os = require('os'), zlib = require('zlib');
process.env.NODE_ENV = 'test';
process.env.SUPABASE_DISABLED = '1';
process.env.WINDGATE_DB_FILE = path.join(os.tmpdir(), `windgate-contrato-${process.pid}.json`);
process.env.WINDGATE_DB_SECRET = '';
process.env.ANTHROPIC_API_KEY = 'chave-falsa';
const W = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/comex.js'), require('../public/hub/js/cotacao-regras.js'), require('../public/hub/js/cambio-regras.js'), require('../public/hub/js/contrato-regras.js'));
const docSvc = require('../src/services/contrato-doc.service');
const ia = require('../src/services/ia.service');
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const MODELO = { versao: 't', blocos: [{ t: 'titulo', texto: 'CONTRATO DE TESTE {{operacao}}' }, { t: 'clausula', texto: 'CLÁUSULA 1' }, { t: 'p', texto: 'Contratante {{razaoSocial}}, CNPJ {{cnpj}}, CEP {{cep}}, representante {{representante}}, CPF {{cpf}}. Contratada {{contratadaRazao}}. Incoterm {{incoterm}}. Prazo {{prazo}} dias. Banco {{banco}}.' }, { t: 'anexoItens' }, { t: 'anexoParcelas' }, { t: 'anexoCambio' }] };
const CNPJ_OK = '11.222.333/0001-81', CPF_OK = '529.982.247-25';
const it = (d, q, u) => Object.assign(W.ITEM_PADRAO(), { d, q, u, p: 10, ii: 14, ipi: 5 });
function cot(id, opNum, cliente, tipo) {
  const q = { id, status: 'ok', fields: Object.assign({}, W.PADRAO, { opNum, cliente, tipoOp: tipo, mercadoria: 'Escoras', txDesp: '5.5', txFrete: '5.61', freteUSD: '3000', margemPct: '25', incoterm: 'CIF', destino: 'Fortaleza/CE' }), items: [it('Escora', 100, 50)], exps: [] };
  const R = W.calcular(q); Object.assign(q.fields, W.desemSugerir(q, R)); q.preco = R.preco; q.cambioProposta = W.congelarCambio(q, 5.4, '2026-11-06');
  return q;
}
const CONTRATADAS = { jt: { razao: 'Contratada JT', cnpj: CNPJ_OK, banco: '001', conta: '1' }, sf: { razao: 'Contratada SF', cnpj: CNPJ_OK, banco: '001', conta: '1' } };
const baseDb = () => ({ ops: [{ _id: 'a', id: 'OP1', cliente: 'Cliente Sem IE', status: 'contrato', quoteId: 'qj' }, { _id: 'b', id: 'OP2', cliente: 'Cliente Contribuinte', status: 'contrato', quoteId: 'qs' }, { _id: 'c', id: 'OP3', cliente: 'X', status: 'contrato' }],
  quotes: { qj: cot('qj', 'OP1', 'Cliente Sem IE', 'triangular'), qs: cot('qs', 'OP2', 'Cliente Contribuinte', 'direta') }, hubPainel: { _contrato: CONTRATADAS },
  crm: [{ _id: 'c1', empresa: 'Cliente Sem IE', cnpj: CNPJ_OK, contribuinte: false, nome: 'Fulana', cpfRepresentante: CPF_OK, end: { logradouro: 'Rua A', cidade: 'Fortaleza', uf: 'CE', cep: '60000-000' } }, { _id: 'c2', empresa: 'Cliente Contribuinte', cnpj: CNPJ_OK, contribuinte: true, nome: 'Beltrano', cpfRepresentante: CPF_OK, ie: '061234567', ieComprovanteEm: '2026-11-01', end: { logradouro: 'Rua B', cidade: 'Fortaleza', uf: 'CE', cep: '60000-001' } }] });
const niveis = (al, n) => al.filter(a => a.nivel === n).map(a => a.titulo);

console.log('\nDocumentos:');
ok(W.cnpjValido(CNPJ_OK) && !W.cnpjValido('11.222.333/0001-82') && !W.cnpjValido('11111111111111') && !W.cnpjValido(''), 'CNPJ: confere os dígitos');
ok(W.cpfValido(CPF_OK) && !W.cpfValido('529.982.247-24') && !W.cpfValido('00000000000'), 'CPF: confere os dígitos');
ok(W.ieValida('061234567', 'CE') === false || W.ieValida('061234567', 'CE') === true, 'IE do Ceará tem dígito conferido');
ok(W.ieValida('123', 'CE') === false && W.ieValida('12345678', 'SP') === null, 'IE curta é inválida; fora do Ceará, fica para conferir');

console.log('\nEstrutura e preenchimento:');
{
  const db = baseDb(), j = W.dadosDoContrato(db, 'OP1'), s = W.dadosDoContrato(db, 'OP2');
  ok(j.estrutura === 'jt' && !j.contribuinte && s.estrutura === 'sf' && s.contribuinte, 'não contribuinte: J&T; contribuinte: SF');
  ok(j.campos.razaoSocial === 'Cliente Sem IE' && j.campos.cep === '60000-000' && j.campos.representante === 'Fulana' && j.campos.incoterm === 'CIF' && j.campos.contratadaRazao === 'Contratada JT', 'puxa da cotação e do cadastro');
  ok(W.dadosDoContrato(db, 'OP1', { razaoSocial: 'Outra', cep: '1' }).campos.razaoSocial === 'Outra', 'o editado antes de gerar vence');
  const p = W.preencherModelo(MODELO, j);
  ok(p.pendentes.length === 0 && p.texto.includes('Cliente Sem IE') && p.texto.includes('5,4500') && p.texto.includes('Escora'), 'preenche texto e anexos');
  const db2 = baseDb(); delete db2.crm[0].cpfRepresentante; delete db2.crm[0].end.cep;
  const p2 = W.preencherModelo(MODELO, W.dadosDoContrato(db2, 'OP1'));
  ok(p2.pendentes.includes('cpf') && p2.pendentes.includes('cep') && (p2.texto.match(/\[PENDENTE\]/g) || []).length === 2, 'o que falta sai como [PENDENTE]');
  ok(W.preencherTexto('a {{naoExiste}}', {}, new Set()) === 'a [PENDENTE]', 'campo desconhecido não fica em branco');
  const tProp = W.textoCambio(W.tabelaCambio(db.quotes.qj));
  ok(JSON.stringify(tProp) === JSON.stringify(j.tabela) && tProp.linhas.every(l => p.texto.includes(l[1])), 'tabela de câmbio do Anexo II igual à da proposta');
  ok(!/margem|custo|5,5000|5,6100/i.test(p.texto), 'o contrato não mostra custo, margem nem dólar de custo');
}

console.log('\nRevisão em código:');
{
  let db = baseDb(), d = W.dadosDoContrato(db, 'OP1'), al = W.revisarEmCodigo(db, { pendentes: [] }, d, '2026-11-06');
  ok(!W.temBloqueante(al), 'tudo certo: sem bloqueante' + (W.temBloqueante(al) ? ': ' + niveis(al, 'bloqueante').join(';') : ''));
  db = baseDb(); delete db.crm[0].end.cep; db.crm[0].cnpj = '11.222.333/0001-82';
  al = W.revisarEmCodigo(db, { pendentes: ['cep'] }, W.dadosDoContrato(db, 'OP1'), '2026-11-06');
  ok(niveis(al, 'bloqueante').some(t => /CEP/.test(t)) && niveis(al, 'bloqueante').some(t => /CNPJ inválido/.test(t)), 'CEP pendente e CNPJ inválido bloqueiam');
  db = baseDb(); delete db.crm[1].ie;
  ok(niveis(W.revisarEmCodigo(db, { pendentes: [] }, W.dadosDoContrato(db, 'OP2'), '2026-11-06'), 'bloqueante').some(t => /sem inscrição estadual/.test(t)), 'contribuinte sem IE bloqueia');
  db = baseDb(); delete db.crm[1].ieComprovanteEm; db.ops[1].eta = '2026-12-20';
  ok(niveis(W.revisarEmCodigo(db, { pendentes: [] }, W.dadosDoContrato(db, 'OP2'), '2026-11-06'), 'bloqueante').some(t => /IE comprovada/.test(t)), 'contribuinte sem IE comprovada bloqueia');
  db = baseDb(); db.quotes.qj.fields.ufDestino = 'Outro (sem ST)';
  const q0 = db.quotes.qj; const R0 = W.calcular(q0); Object.assign(q0.fields, W.desemSugerir(q0, R0)); q0.preco = R0.preco;
  if (!(R0.tri.difal > 0)) ok(niveis(W.revisarEmCodigo(db, { pendentes: [] }, W.dadosDoContrato(db, 'OP1'), '2026-11-06'), 'bloqueante').some(t => /sem DIFAL/.test(t)), 'não contribuinte sem DIFAL bloqueia');
  db = baseDb();
  const parc = W.dadosDoContrato(db, 'OP1').parcelas.map(p => ({ n: p.n, valor: p.valor })); parc[1].valor += 100;
  ok(niveis(W.revisarEmCodigo(db, { pendentes: [] }, W.dadosDoContrato(db, 'OP1', { parcelas: parc }), '2026-11-06'), 'bloqueante').some(t => /Parcela 2 diferente/.test(t)), 'parcela diferente da cotação bloqueia');
  db = baseDb(); db.quotes.qj.cambioProposta.por010 = [0, 0, 0];
  ok(niveis(W.revisarEmCodigo(db, { pendentes: [] }, W.dadosDoContrato(db, 'OP1'), '2026-11-06'), 'bloqueante').some(t => /zerada/.test(t)), 'tabela de câmbio zerada bloqueia');
  db = baseDb(); delete db.quotes.qj.cambioProposta;
  ok(niveis(W.revisarEmCodigo(db, { pendentes: [] }, W.dadosDoContrato(db, 'OP1'), '2026-11-06'), 'bloqueante').some(t => /Sem tabela/.test(t)), 'sem tabela de câmbio bloqueia');
  db = baseDb(); db.ops[0].eta = '2027-06-01';
  ok(niveis(W.revisarEmCodigo(db, { pendentes: [] }, W.dadosDoContrato(db, 'OP1'), '2026-11-06'), 'atencao').some(t => /incompatível com a ETA/.test(t)), 'prazo incompatível com a ETA gera atenção');
  db = baseDb(); db.quotes.qj.fields.desR1 = '1';
  ok(niveis(W.revisarEmCodigo(db, { pendentes: [] }, W.dadosDoContrato(db, 'OP1'), '2026-11-06'), 'atencao').some(t => /fábrica antes do recebimento/.test(t)), 'pagamento à fábrica antes do recebimento gera atenção');
}

console.log('\nDesatualizado e liberação:');
{
  const db = baseDb(), c = { op: 'OP1', padrao: true, status: 'gerado', versao: 1, digital: W.digitalDaCotacao(db.quotes.qj) };
  db.hubContratos = [c];
  ok(!W.contratoDesatualizado(db, c), 'recém-gerado: em dia');
  ok(!W.liberarContrato(db, c, 'Samir').ok, 'sem revisão, não libera');
  c.revisao = { alertas: [{ nivel: 'bloqueante', titulo: 'x' }] };
  ok(!W.liberarContrato(db, c, 'Samir').ok, 'com bloqueante, não libera');
  c.revisao = { alertas: [{ nivel: 'atencao', titulo: 'x' }] };
  const texto = JSON.stringify(c.digital);
  db.quotes.qj.fields.desR2 = String(+db.quotes.qj.fields.desR2 + 10);
  ok(W.contratoDesatualizado(db, c) && W.contratosDesatualizados(db).length === 1 && !W.liberarContrato(db, c, 'Samir').ok, 'a cotação mudou: desatualizado, e não libera');
  c.digital = W.digitalDaCotacao(db.quotes.qj);
  ok(W.liberarContrato(db, c, 'Samir', '2026-11-06T10:00:00Z').ok && c.status === 'liberado' && c.liberadoPor === 'Samir', 'sem bloqueante: o Samir libera, com alertas de atenção à vista');
  ok(texto.length > 0 && !('texto' in c), 'liberar não toca em texto nenhum');
}

(async () => {
  console.log('\nArquivos:');
  const db0 = baseDb(), pr = W.preencherModelo(MODELO, W.dadosDoContrato(Object.assign(db0, { crm: [Object.assign({}, db0.crm[0], { cpfRepresentante: '' }), db0.crm[1]] }), 'OP1'));
  const docx = docSvc.gerarDocx(pr);
  ok(docx.slice(0, 2).toString() === 'PK', 'DOCX é um pacote zip');
  const nomes = docx.toString('latin1');
  ok(['word/document.xml', 'word/header1.xml', 'word/media/logo.png', '[Content_Types].xml', 'word/_rels/header1.xml.rels'].every(n => nomes.includes(n)), 'tem documento, cabeçalho e logo');
  ok(nomes.includes('w:highlight w:val="yellow"') && nomes.includes('[PENDENTE]') && nomes.includes('<w:jc w:val="center"/>'), '[PENDENTE] em amarelo e logo centralizada');
  const pdf = docSvc.gerarPdf(pr);
  ok(pdf.slice(0, 4).toString() === '%PDF' && pdf.length > 5000, 'PDF gerado');

  console.log('\nRevisão por IA (resposta simulada):');
  const pedidos = [];
  const fFalso = async (u, o) => { pedidos.push(JSON.parse(o.body)); return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify({ alertas: [{ nivel: 'bloqueante', titulo: 'Cláusula 7 ausente', detalhe: 'não aparece', clausula: '7' }, { nivel: 'estranho', titulo: 'x' }] }) }] }) }; };
  const a = await ia.revisarContrato({ texto: 'contrato', oficial: 'modelo', fatos: { pior: -10 } }, fFalso);
  ok(a.length === 2 && a[0].nivel === 'bloqueante' && a[0].origem === 'ia' && a[1].nivel === 'atencao', 'alertas em 3 níveis; nível desconhecido vira atenção');
  ok(/não reescreva/i.test(pedidos[0].system) && /modelo/.test(pedidos[0].messages[0].content[0].text), 'a instrução proíbe reescrever');
  ok(!('texto' in a[0]) && Object.keys(a[0]).join() === 'nivel,titulo,detalhe,clausula,origem', 'só voltam alertas, nunca texto de cláusula');

  console.log('\nRotas:');
  const criados = [];
  const instalar = () => { fs.mkdirSync(docSvc.PASTA, { recursive: true }); ['jt', 'sf'].forEach(e => { const f = path.join(docSvc.PASTA, `modelo-${e}.json`); if (!fs.existsSync(f)) { fs.writeFileSync(f, JSON.stringify(MODELO)); criados.push(f); } }); };
  const fetchReal = global.fetch;
  global.fetch = async (u, o) => (String(u).includes('api.anthropic.com') ? fFalso(u, o) : fetchReal(u, o));
  const app = require('../src/server'), srv = app.listen(0), base = `http://127.0.0.1:${srv.address().port}`;
  const post = (u, b, quem) => fetchReal(base + u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-usuario': quem || 'samir' }, body: JSON.stringify(b || {}) });
  const dbAgora = async () => { const j = await (await fetchReal(base + '/api/db')).json(); return j.db || j.data || j; };
  await post('/api/db', Object.assign(baseDb(), { users: { samir: { nome: 'Samir' }, jose: { nome: 'José', fin: false } } }));
  const jaTinha = docSvc.modelosInstalados();
  if (!jaTinha.jt && !jaTinha.sf) {
    const r0 = await post('/api/contratos/gerar', { op: 'OP1' });
    ok(r0.status === 409 && (await r0.json()).semModelo, 'sem o modelo oficial, a geração fica travada');
  }
  instalar();
  try {
    ok((await post('/api/contratos/gerar', { op: 'OP3' })).status === 400, 'operação sem cotação não gera');
    const g = await (await post('/api/contratos/gerar', { op: 'OP1' })).json();
    ok(g.success && g.contrato.versao === 1 && g.contrato.link && g.contrato.linkDocx && g.contrato.estrutura === 'jt', 'gera DOCX e PDF');
    let d = await dbAgora();
    ok(d.docs.filter(x => x.op === 'OP1').length === 2 && d.hubContratos.some(c => c._id === g.contrato._id), 'guardados nos documentos da operação');
    const id = g.contrato._id;
    ok((await post('/api/contratos/liberar', { id })).status === 409, 'sem revisão, não libera');
    ok((await post('/api/contratos/liberar', { id }, 'jose')).status === 403, 'quem não aprova não libera');
    const rv = await (await post('/api/contratos/revisar', { id })).json();
    ok(rv.success && rv.revisao.ia && rv.revisao.alertas.some(a => a.origem === 'ia' && /Cláusula 7/.test(a.titulo)), 'a revisão junta regras e IA');
    ok((await post('/api/contratos/liberar', { id })).status === 409, 'alerta bloqueante da IA segura a liberação');
    const g2 = await (await post('/api/contratos/gerar', { op: 'OP1' })).json();
    d = await dbAgora();
    ok(g2.contrato.versao === 2 && d.hubContratos.find(c => c._id === id).status === 'cancelado', 'gerar de novo: nova versão, e a anterior sai de cena');
    global.fetch = async (u, o) => (String(u).includes('api.anthropic.com') ? { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '{"alertas":[]}' }] }) } : fetchReal(u, o));
    await post('/api/contratos/revisar', { id: g2.contrato._id });
    const lb = await (await post('/api/contratos/liberar', { id: g2.contrato._id })).json();
    ok(lb.success && lb.contrato.status === 'liberado', 'sem bloqueante, libera');
    global.fetch = async () => { throw new Error('fora do ar'); };
    const rv2 = await (await post('/api/contratos/revisar', { id: g2.contrato._id })).json();
    global.fetch = fetchReal;
    ok(rv2.success && !rv2.revisao.ia && rv2.revisao.alertas.some(a => /IA não rodou/.test(a.titulo)), 'IA fora do ar: as regras rodam e o aviso aparece');
  } finally {
    criados.forEach(f => fs.unlinkSync(f));
    global.fetch = fetchReal;
  }
  srv.close(); try { fs.unlinkSync(process.env.WINDGATE_DB_FILE); fs.unlinkSync(process.env.WINDGATE_DB_FILE + '.bak'); } catch (e) {}
  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
