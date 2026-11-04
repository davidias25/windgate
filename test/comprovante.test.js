/**
 * Comprovante lido por IA → sugestão → confirmação humana → lançamento.
 * A IA é SIMULADA (o fetch para api.anthropic.com é interceptado): nenhum teste
 * chama a IA, a Focus ou um banco de verdade.
 */
const path = require('path'), fs = require('fs'), os = require('os');
const TMP = path.join(os.tmpdir(), `windgate-comprov-${process.pid}.json`);
process.env.NODE_ENV = 'test';
process.env.SUPABASE_DISABLED = '1';
process.env.WINDGATE_DB_FILE = TMP;
process.env.WINDGATE_DB_SECRET = 'segredo-comprov-' + process.pid;
process.env.ANTHROPIC_API_KEY = 'sk-teste-falsa';

const F = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/comex.js'), require('../public/hub/js/fin-regras.js'));
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const clone = x => JSON.parse(JSON.stringify(x));

function banco() {
  return {
    users: { samir: { nome: 'Samir', pin: '1' }, davi: { nome: 'Davi', pin: '2' }, matheus: { nome: 'Matheus', pin: '3' }, ivina: { nome: 'Ívina', pin: '4' }, pedro: { nome: 'Pedro', pin: '5' }, oneide: { nome: 'Oneide', pin: '6' } },
    hubPainel: { _fiscal: { cnpjs: { WindGate: '58.762.606/0001-44', JeT: '11.222.333/0001-81' },
      contas: [{ id: 'c-sf', empresa: 'WindGate', banco: 'Santander', nome: '1234-5', ativa: true }, { id: 'c-jet', empresa: 'JeT', banco: 'Itaú', nome: '9876-1', ativa: true }] } },
    crm: [{ _id: 'c1', empresa: 'Custódio Máquinas', cnpj: '11.444.777/0001-61' }],
    ops: [{ _id: 'o20', id: 'OP20', cliente: 'Custódio Máquinas', status: 'logistica', empresa: 'WindGate' }],
    fin: [
      { _id: 'f1', tipo: 'Despesa', desc: 'Frete marítimo OP20 - XYZ Logística', op: 'OP20', valor: 5000, vencimento: '2026-10-10', data: '2026-10-10', empresa: 'WindGate', status: 'Previsto', por: 'Davi', comp: '', nf: '' },
      { _id: 'f2', tipo: 'Receita', desc: 'Parcela 1 OP20', op: 'OP20', valor: 30000, vencimento: '2026-10-15', data: '2026-10-15', empresa: 'WindGate', status: 'Previsto', por: 'Davi', comp: '', nf: '' },
      { _id: 'f3', tipo: 'Despesa', desc: 'Frete marítimo OP21', op: 'OP21', valor: 5000, vencimento: '2026-10-30', data: '2026-10-30', empresa: 'WindGate', status: 'Previsto', por: 'Davi', comp: '', nf: '' }
    ],
    hubNotas: [], hubExtratos: [], _removidos: {}
  };
}
/* Leituras simuladas da IA (o que ela devolveria para cada comprovante). */
const LEITURAS = {
  PIX: { tipo: 'pix', data: '2026-10-11', valor: 5000, banco: 'Santander', conta: '1234-5', pagador: { nome: 'SF TRADING LTDA', documento: '58762606000144' },
    favorecido: { nome: 'XYZ LOGISTICA LTDA', documento: '12345678000195', banco: 'Itaú' }, idTransacao: 'E58762606202610111234ABCDEF', linhaDigitavel: '', descricao: 'Frete OP20',
    confianca: { tipo: 1, data: 0.98, valor: 0.99, pagador: 0.95, favorecido: 0.9, idTransacao: 0.97 } },
  TED: { tipo: 'ted', data: '2026-10-14', valor: 30000, banco: 'Bradesco', conta: '', pagador: { nome: 'CUSTODIO MAQUINAS LTDA', documento: '11444777000161' },
    favorecido: { nome: 'SF TRADING LTDA', documento: '58762606000144', banco: 'Santander' }, idTransacao: 'TED-889912', descricao: '', confianca: { valor: 0.99 } },
  BOLETO: { tipo: 'boleto', data: '2026-10-20', valor: 812.34, banco: 'Itaú', conta: '9876-1', pagador: { nome: '', documento: '' },
    favorecido: { nome: 'NEOENERGIA DISTRIBUIDORA', documento: '07047251000170' }, idTransacao: 'AUT 1A2B3C', linhaDigitavel: '83660000008-1 12340138000-5', descricao: 'Conta de energia escritório', confianca: { valor: 0.9 } }
};
const arquivo = k => ({ nome: k.toLowerCase() + '.pdf', mime: 'application/pdf', base64: Buffer.from('COMPROVANTE ' + k).toString('base64') });

(async () => {
  console.log('\nSugestão (regras puras):');
  const db = banco();
  const sP = F.sugerirComprovante(db, LEITURAS.PIX);
  ok(sP.acao === 'baixa' && sP.alvoId === 'f1' && sP.campos.empresa === 'WindGate' && sP.campos.contraparte.documento === '12345678000195', 'Pix: sugere dar baixa no frete previsto (mesmo valor, 1 dia de diferença, nome parecido), não no de OP21 com 19 dias');
  const sT = F.sugerirComprovante(db, LEITURAS.TED);
  ok(sT.acao === 'baixa' && sT.alvoId === 'f2' && sT.campos.tipo === 'Receita', 'TED do cliente para a SF: baixa da parcela a receber');
  const sB = F.sugerirComprovante(db, LEITURAS.BOLETO);
  ok(sB.acao === 'novo' && sB.campos.empresa === 'JeT' && sB.campos.tipo === 'Despesa' && sB.campos.valor === 812.34 && sB.campos.contraparte.tipo === 'fornecedor', 'boleto sem previsto: lançamento novo, empresa JeT pela conta de origem (Itaú)');
  ok(F.sugerirComprovante(db, Object.assign({}, LEITURAS.BOLETO, { banco: 'Santander' })).campos.empresa === 'WindGate', 'mesmo boleto pago pela conta Santander: empresa SF');
  const sTar = F.sugerirComprovante(db, { tipo: 'tarifa', data: '2026-10-05', valor: 45.9, banco: 'Santander', favorecido: { nome: 'BANCO SANTANDER' } });
  ok(sTar.acao === 'novo' && sTar.campos.semNota.motivo === 'tarifa' && sTar.campos.contraparte.tipo === 'banco', 'tarifa: sem nota com o motivo "tarifa" e contraparte banco');
  const sTr = F.sugerirComprovante(db, { tipo: 'ted', data: '2026-10-06', valor: 10000, pagador: { nome: 'SF', documento: '58762606000144' }, favorecido: { nome: 'JET IMPORT', documento: '11222333000181' } });
  ok(sTr.campos.transf && sTr.campos.categoria === 'Transferência' && sTr.campos.semNota.motivo === 'transferencia', 'SF → JeT: transferência entre empresas, fora do resultado');
  /* Texto que veio com o print (legenda): descrição do lançamento novo e operação citada. */
  const pixAbigail = { tipo: 'pix', data: '2026-10-31', valor: 120, banco: 'Santander', pagador: { nome: 'SF TRADING LTDA', documento: '58762606000144' },
    favorecido: { nome: 'Abigail Rodrigues da Silva', documento: '' }, idTransacao: 'E90400888202610311311730300' };
  const sL = F.sugerirComprovante(db, pixAbigail, { legenda: '  captação abgail   op20 ' });
  ok(sL.acao === 'novo' && sL.campos.desc === 'captação abgail op20' && sL.campos.op === 'OP20' && !sL.avisos.some(a => /Operação não identificada/.test(a)), 'legenda "captação abgail op20": vira a descrição e liga o lançamento à OP20');
  ok(F.sugerirComprovante(db, pixAbigail).campos.op === 'WindGate', 'sem a legenda, o mesmo Pix fica sem operação (nada é adivinhado)');
  const sL99 = F.sugerirComprovante(db, pixAbigail, { legenda: 'captação OP 99' });
  ok(sL99.campos.op === 'WindGate' && sL99.avisos.some(a => /OP99.*não está nas operações/.test(a)), 'OP citada que não existe: não inventa a operação e avisa');
  const dbL = banco(); dbL.fin.push({ _id: 'f4', tipo: 'Despesa', desc: 'Frete marítimo OP20 - outro', op: 'OP20', valor: 5000, vencimento: '2026-10-11', data: '2026-10-11', empresa: 'WindGate', status: 'Previsto', por: 'Davi' });
  dbL.fin.find(l => l._id === 'f1').op = 'OP21'; dbL.fin.find(l => l._id === 'f1').desc = 'Frete marítimo - XYZ Logística';
  ok(F.sugerirComprovante(dbL, Object.assign({}, LEITURAS.PIX, { descricao: '' }), { legenda: 'frete op20' }).alvoId === 'f4', 'dois previstos com o mesmo valor: a OP da legenda escolhe o da OP20');
  const sIA = F.sugerirComprovante(db, Object.assign({}, pixAbigail, { legenda: 'Captação abigail Op20' }));
  ok(sIA.campos.desc === 'Captação abigail Op20' && sIA.campos.op === 'OP20', 'legenda escrita embaixo do print (lida pela IA): descrição e OP20, sem digitar nada');
  ok(F.sugerirComprovante(db, Object.assign({}, pixAbigail, { legenda: 'Captação abigail Op20' }), { legenda: 'captação abigail' }).campos.desc === 'captação abigail', 'texto digitado no campo vale mais que o lido na imagem');
  ok(F.legendaDoComprovante(db, 'Op-20 adiantamento').op === 'OP20' && F.legendaDoComprovante(db, '').desc === '', 'reconhece "Op-20" e aceita texto vazio');
  ok(F.normalizarLeitura({ valor: '1.234', pagador: {}, favorecido: {} }).data === '' && F.normalizarLeitura({}).idTransacao === '', 'campo que não veio fica vazio (a regra não inventa data nem identificador)');

  console.log('\nAplicar (só depois da confirmação):');
  const rP = F.aplicarComprovante(db, sP, { quem: 'Davi', agora: '2026-10-11T12:00:00Z', link: 'https://storage.teste/pix.pdf', lidoPorIA: true });
  ok(rP.lanc && rP.lanc._id === 'f1' && rP.lanc.status === 'Realizado' && rP.lanc.liquidadoEm === '2026-10-11' && rP.lanc.comp === 'https://storage.teste/pix.pdf' && rP.lanc.baixaPor === 'Davi', 'baixa: realizado na data do comprovante, com o link em `comp` (campo atual)');
  ok(rP.lanc.comprovante.idTransacao === LEITURAS.PIX.idTransacao && rP.lanc.comprovante.lidoPorIA && rP.lanc.comprovante.confirmadoPor === 'Davi' && rP.lanc.comprovante.confianca.valor === 0.99 && rP.lanc.contraparte.nome === 'XYZ LOGISTICA LTDA', 'comprovante { link, tipo, idTransacao, lidoPorIA, confiança, confirmadoPor/Em } e contraparte no lançamento');
  ok(db.fin.find(l => l._id === 'f1').status === 'Previsto', 'aplicar devolve o lançamento novo e não mexe no banco recebido (quem grava é o servidor)');
  const db2 = banco(); db2.fin[0] = rP.lanc;
  ok(F.sugerirComprovante(db2, LEITURAS.PIX).acao === 'duplicado', 'o mesmo Pix de novo: bloqueado como "já lançado"');
  ok(F.sugerirComprovante(db2, Object.assign({}, LEITURAS.PIX, { idTransacao: '' })).acao === 'duplicado', 'sem o identificador: mesmo valor + data + favorecido também bloqueia');
  ok(F.aplicarComprovante(db2, sP, { quem: 'Matheus', link: 'x' }).codigo === 409, 'confirmar um comprovante já lançado: recusado (409)');
  const db3 = banco(); Object.assign(db3.fin[0], { status: 'Realizado', liquidadoEm: '2026-10-09', baixaPor: 'Davi' });
  const alheia = F.aplicarComprovante(db3, Object.assign(clone(sP), { campos: Object.assign({}, sP.campos, { comprovante: { idTransacao: 'OUTRO' }, data: '2026-10-12' }) }), { quem: 'Matheus', link: 'y' });
  ok(alheia.codigo === 403, 'quem só lança não altera a baixa feita por outra pessoa (regra atual)');
  const rB = F.aplicarComprovante(db, sB, { quem: 'Matheus', agora: '2026-10-20T12:00:00Z', link: 'https://storage.teste/boleto.pdf', novoId: 'novo-1' });
  ok(rB.novo && rB.lanc._id === 'novo-1' && rB.lanc.empresa === 'JeT' && rB.lanc.status === 'Realizado' && rB.lanc.origem === 'comprovante' && rB.lanc.nf === '' && rB.lanc.alteracoes.length === 1, 'lançamento novo: realizado, com origem, sem tocar no `nf` e com histórico de quem lançou');

  console.log('\nE-mail (opcional, desligado):');
  const email = require('../src/services/email.service');
  const anexos = email.comprovantesDaMensagem({ from: { text: 'banco@x' }, attachments: [{ filename: 'pix.pdf', contentType: 'application/pdf', content: Buffer.from('PDF') }, { filename: 'nota.xml', contentType: 'text/xml', content: Buffer.from('<x/>') }, { filename: 'print.png', contentType: 'image/png', content: Buffer.from('PNG') }] });
  ok(anexos.length === 2 && anexos[0].mime === 'application/pdf' && anexos[1].mime === 'image/png' && anexos[0].hash.length === 64, 'só PDF e imagem viram comprovante; XML de nota continua indo para o Fiscal');
  ok(!process.env.WINDGATE_COMPROVANTES_EMAIL, 'a leitura da caixa de comprovantes fica desligada até WINDGATE_COMPROVANTES_EMAIL=1 (e entra como sugestão pendente, nunca como lançamento)');

  /* ======================= Servidor ======================= */
  console.log('\nServidor (IA simulada):');
  fs.writeFileSync(TMP, JSON.stringify(banco()));
  const fetchReal = global.fetch, chamadasIA = [], externas = [];
  global.fetch = async (url, o) => {
    const u = String(url);
    if (u.startsWith('https://api.anthropic.com/')) {
      const corpo = JSON.parse(o.body), doc = corpo.messages[0].content.find(b => b.type === 'document' || b.type === 'image');
      const qual = Buffer.from(doc.source.data, 'base64').toString().replace('COMPROVANTE ', '');
      chamadasIA.push({ qual, chave: o.headers['x-api-key'], tipoBloco: doc.type });
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'Segue: ' + JSON.stringify(LEITURAS[qual]) }] }) };
    }
    if (!/^http:\/\/127\.0\.0\.1:/.test(u)) { externas.push(u); throw new Error('chamada externa bloqueada no teste: ' + u); }
    return fetchReal(url, o);
  };
  const app = require('../src/server'), auth = require('../src/services/auth.service');
  const srv = app.listen(0), base = `http://127.0.0.1:${srv.address().port}`;
  const tk = {}; ['samir', 'davi', 'matheus', 'ivina', 'pedro', 'oneide'].forEach(k => { tk[k] = auth.emitirToken(k); });
  const chamar = async (quem, metodo, caminho, corpo) => { const r = await fetch(base + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk[quem] }, body: corpo ? JSON.stringify(corpo) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };
  const lerFin = async () => (await chamar('davi', 'GET', '/api/db')).j.db.fin;

  for (const k of ['ivina', 'oneide', 'pedro']) {
    const a = await chamar(k, 'POST', '/api/ia/comprovante', { arquivo: arquivo('PIX') }), c = await chamar(k, 'POST', '/api/fin/comprovante/confirmar', { sugestao: sP });
    ok(a.status === 403 && c.status === 403, `${k} não envia nem confirma comprovante (403)`);
  }
  ok(!chamadasIA.length, 'sem permissão, a IA nem é chamada');
  const antes = JSON.stringify(await lerFin());
  let r = await chamar('davi', 'POST', '/api/ia/comprovante', { arquivo: arquivo('PIX') });
  ok(r.status === 200 && r.j.sugestao.acao === 'baixa' && r.j.sugestao.alvoId === 'f1' && chamadasIA[0].tipoBloco === 'document' && chamadasIA[0].chave === 'sk-teste-falsa', 'Davi envia o PDF: a IA lê (bloco document) e o servidor sugere a baixa do f1');
  ok(JSON.stringify(await lerFin()) === antes, 'nada é gravado sem a confirmação');
  const sugPix = r.j.sugestao;
  r = await chamar('davi', 'POST', '/api/fin/comprovante/confirmar', { sugestao: sugPix, link: 'https://storage.teste/pix.pdf', lidoPorIA: true });
  let fin = await lerFin(), f1 = fin.find(l => l._id === 'f1');
  ok(r.status === 200 && f1.status === 'Realizado' && f1.comp === 'https://storage.teste/pix.pdf' && f1.comprovante.confirmadoPor === 'Davi' && f1.comprovante.lidoPorIA, 'confirmado: baixa gravada no banco com o comprovante');
  r = await chamar('matheus', 'POST', '/api/ia/comprovante', { arquivo: arquivo('PIX') });
  ok(r.status === 200 && r.j.sugestao.acao === 'duplicado' && /já lançado em 11\/10\/2026/.test(r.j.sugestao.avisos[0]), 'o mesmo Pix enviado pelo Matheus: "comprovante já lançado em 11/10/2026"');
  r = await chamar('matheus', 'POST', '/api/fin/comprovante/confirmar', { sugestao: sugPix, link: 'x' });
  ok(r.status === 409, 'e a confirmação do repetido é recusada (409)');
  r = await chamar('matheus', 'POST', '/api/ia/comprovante', { arquivo: { nome: 'ted.png', mime: 'image/png', base64: Buffer.from('COMPROVANTE TED').toString('base64') } });
  ok(r.status === 200 && r.j.sugestao.alvoId === 'f2' && chamadasIA[chamadasIA.length - 1].tipoBloco === 'image', 'print (imagem) da TED: lido como imagem e sugere a baixa do recebimento');
  r = await chamar('matheus', 'POST', '/api/ia/comprovante', { arquivo: arquivo('BOLETO') });
  const sugBol = r.j.sugestao; sugBol.campos.desc = 'Energia do escritório (JeT)';   // a pessoa edita antes de confirmar
  r = await chamar('matheus', 'POST', '/api/fin/comprovante/confirmar', { sugestao: sugBol, link: 'https://storage.teste/boleto.pdf', lidoPorIA: true });
  fin = await lerFin(); const nb = fin.find(l => l._id === r.j.lanc._id);
  ok(r.status === 200 && r.j.novo && nb.empresa === 'JeT' && nb.desc === 'Energia do escritório (JeT)' && nb.por === 'Matheus' && nb.contraparte.documento === '07047251000170', 'boleto: lançamento novo gravado com o que a pessoa editou');

  console.log('\nSem a chave da IA:');
  delete process.env.ANTHROPIC_API_KEY;
  const nIA = chamadasIA.length;
  r = await chamar('davi', 'POST', '/api/ia/comprovante', { arquivo: arquivo('TED') });
  ok(r.status === 200 && r.j.semIA && /IA desligada: falta a chave no servidor/.test(r.j.message) && chamadasIA.length === nIA, 'sem ANTHROPIC_API_KEY: "IA desligada: falta a chave no servidor", sem chamar a IA');
  r = await chamar('davi', 'POST', '/api/fin/comprovante/sugerir', { leitura: { tipo: 'ted', data: '2026-10-15', valor: 30000, favorecido: { documento: '58762606000144' }, pagador: { nome: 'Custódio Máquinas', documento: '11444777000161' } } });
  ok(r.status === 200 && r.j.sugestao.alvoId === 'f2', 'lançar à mão: a mesma regra acha o recebimento previsto');
  r = await chamar('davi', 'POST', '/api/fin/comprovante/confirmar', { sugestao: r.j.sugestao, link: 'https://storage.teste/ted.pdf', lidoPorIA: false });
  fin = await lerFin();
  ok(r.status === 200 && fin.find(l => l._id === 'f2').comprovante.lidoPorIA === false, 'confirmado à mão: lidoPorIA = false, arquivo anexado');
  ok(!externas.length, 'nenhuma chamada para fora (IA, Focus ou banco)');

  srv.close(); try { fs.unlinkSync(TMP); fs.unlinkSync(TMP + '.bak'); } catch (e) {}
  global.fetch = fetchReal;
  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
