/**
 * Fechamento trimestral (Lucro Real): todo movimento do banco com lançamento,
 * classificação, contraparte, nota (ou motivo) e comprovante; saldo do sistema
 * = saldo do extrato ao centavo; pacote do contador só com tudo zerado.
 * Nenhum teste chama a IA, a Focus ou um banco de verdade: os arquivos do
 * Storage vêm de um fetch simulado.
 */
const path = require('path'), fs = require('fs'), os = require('os'), crypto = require('crypto');
const TMP = path.join(os.tmpdir(), `windgate-fech-${process.pid}.json`);
process.env.NODE_ENV = 'test';
process.env.SUPABASE_DISABLED = '1';
process.env.WINDGATE_DB_FILE = TMP;
process.env.WINDGATE_DB_SECRET = 'segredo-fech-' + process.pid;

const XLSX = require('xlsx');
const F = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/comex.js'), require('../public/hub/js/fin-regras.js'));
const { lerZip } = require('../src/services/zip.service');
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const clone = x => JSON.parse(JSON.stringify(x));
const TRI = '2026-T3', HOJE = '2026-10-04';

function banco() {
  const comp = id => 'https://storage.teste/comp-' + id + '.pdf';
  const L = (id, o) => Object.assign({ _id: id, status: 'Realizado', comp: comp(id), nf: '', por: 'Davi', baixaPor: 'Davi' }, o, { data: o.liquidadoEm, vencimento: o.liquidadoEm, valorPago: o.valor });
  const custodio = { nome: 'Custódio Máquinas', documento: '11444777000161', tipo: 'cliente' };
  const ext = (id, contaId, empresa, banco, mes, saldo, transacoes) => ({ _id: id, contaId, empresa, banco, contaNome: contaId === 'c-sf' ? '1234-5' : '9876-1', mes, saldo, transacoes, formato: 'OFX', link: `https://storage.teste/${id}.ofx` });
  return {
    users: { samir: { nome: 'Samir', pin: '1' }, davi: { nome: 'Davi', pin: '2' }, matheus: { nome: 'Matheus', pin: '3' }, ivina: { nome: 'Ívina', pin: '4' }, pedro: { nome: 'Pedro', pin: '5' }, oneide: { nome: 'Oneide', pin: '6' } },
    hubPainel: { _fiscal: { cnpjs: { WindGate: '58.762.606/0001-44', JeT: '11.222.333/0001-81' },
      contas: [{ id: 'c-sf', empresa: 'WindGate', banco: 'Santander', nome: '1234-5', ativa: true }, { id: 'c-jet', empresa: 'JeT', banco: 'Itaú', nome: '9876-1', ativa: true }] } },
    ops: [{ _id: 'o20', id: 'OP20', cliente: 'Custódio Máquinas', status: 'logistica' }],
    crm: [{ _id: 'c1', empresa: 'Custódio Máquinas', cnpj: '11.444.777/0001-61' }],
    fin: [
      L('R1', { tipo: 'Receita', desc: 'Parcela 1 OP20', op: 'OP20', valor: 30000, liquidadoEm: '2026-07-05', empresa: 'WindGate', contraparte: custodio, notas: [{ notaId: 'n1', numero: '101', valorVinculado: 30000 }] }),
      L('D1', { tipo: 'Despesa', desc: 'Frete marítimo OP20', op: 'OP20', custo: 'frete', valor: 5000, liquidadoEm: '2026-07-10', empresa: 'WindGate', contraparte: { nome: 'XYZ Logística', documento: '12345678000195', tipo: 'fornecedor' }, notas: [{ notaId: 'n2', numero: '55', valorVinculado: 5000 }] }),
      L('D2', { tipo: 'Despesa', desc: 'Tarifa pacote', op: 'WindGate', naturezaContabil: 'Tarifas e juros bancários', valor: 45.9, liquidadoEm: '2026-07-31', empresa: 'WindGate', contraparte: { nome: 'Banco Santander', tipo: 'banco' }, semNota: { motivo: 'tarifa' } }),
      L('T1', { tipo: 'Despesa', desc: 'Transferência para a JeT', op: 'WindGate', categoria: 'Transferência', transf: true, valor: 10000, liquidadoEm: '2026-08-03', empresa: 'WindGate' }),
      L('D3', { tipo: 'Despesa', desc: 'Aluguel agosto', op: 'WindGate', naturezaContabil: 'Aluguel e condomínio', valor: 2000, liquidadoEm: '2026-08-10', empresa: 'WindGate', contraparte: { nome: 'Imobiliária Sol', documento: '98765432000110', tipo: 'fornecedor' }, semNota: { motivo: 'outro', obs: 'recibo de aluguel' } }),
      L('R2', { tipo: 'Receita', desc: 'Parcela 2 OP20', op: 'OP20', valor: 15000, liquidadoEm: '2026-09-15', empresa: 'WindGate', contraparte: custodio, notas: [{ notaId: 'n1', numero: '101', valorVinculado: 15000 }] }),
      L('T2', { tipo: 'Receita', desc: 'Transferência da SF', op: 'WindGate', categoria: 'Transferência', transf: true, valor: 10000, liquidadoEm: '2026-08-04', empresa: 'JeT' }),
      L('D4', { tipo: 'Despesa', desc: 'DARF IRPJ', op: 'WindGate', categoria: 'Imposto geral', valor: 1200, liquidadoEm: '2026-09-20', empresa: 'JeT', contraparte: { nome: 'Receita Federal', tipo: 'governo' }, semNota: { motivo: 'imposto' } }),
      { _id: 'P1', tipo: 'Despesa', desc: 'Previsto de outubro', op: 'OP20', valor: 700, vencimento: '2026-10-20', status: 'Previsto', empresa: 'WindGate' }
    ],
    hubExtratos: [
      ext('e-sf-07', 'c-sf', 'WindGate', 'Santander', '2026-07', 34954.1, [{ data: '2026-07-05', valor: 30000, memo: 'TED RECEBIDA CUSTODIO', id: 's1', lancId: 'R1' }, { data: '2026-07-10', valor: -5000, memo: 'PIX ENVIADO XYZ LOGISTICA', id: 's2' }, { data: '2026-07-31', valor: -45.9, memo: 'TARIFA PACOTE', id: 's3', lancId: 'D2' }]),
      ext('e-sf-08', 'c-sf', 'WindGate', 'Santander', '2026-08', 22954.1, [{ data: '2026-08-03', valor: -10000, memo: 'TED JET IMPORT', id: 's4', lancId: 'T1' }, { data: '2026-08-10', valor: -2000, memo: 'PIX IMOBILIARIA SOL', id: 's5', lancId: 'D3' }]),
      ext('e-sf-09', 'c-sf', 'WindGate', 'Santander', '2026-09', 37954.1, [{ data: '2026-09-15', valor: 15000, memo: 'TED CUSTODIO', id: 's6', lancId: 'R2' }]),
      ext('e-jet-07', 'c-jet', 'JeT', 'Itaú', '2026-07', 0, []),
      ext('e-jet-08', 'c-jet', 'JeT', 'Itaú', '2026-08', 10000, [{ data: '2026-08-04', valor: 10000, memo: 'TED SF TRADING', id: 'j1', lancId: 'T2' }]),
      ext('e-jet-09', 'c-jet', 'JeT', 'Itaú', '2026-09', 8800, [{ data: '2026-09-20', valor: -1200, memo: 'DARF', id: 'j2', lancId: 'D4' }])
    ],
    hubNotas: [
      { _id: 'n1', tipo: 'saida', empresa: 'WindGate', numero: '101', chave: '2'.repeat(44), data: '2026-07-05', valor: 45000, op: 'OP20', emitente: 'SF Trading', emitenteCnpj: '58762606000144', destinatario: 'Custódio Máquinas', destCnpj: '11444777000161', xmlLink: 'https://storage.teste/n1.xml', pdfLink: 'https://storage.teste/n1.pdf', status: 'conferida' },
      { _id: 'n2', tipo: 'servico', empresa: 'WindGate', numero: '55', data: '2026-07-09', valor: 5000, op: 'OP20', emitente: 'XYZ Logística', emitenteCnpj: '12345678000195', destinatario: 'SF Trading', destCnpj: '58762606000144', pdfLink: 'https://storage.teste/n2.pdf', status: 'conferida' }
    ],
    _removidos: {}
  };
}
const fech = (db, emp) => F.fechamento(db, TRI, emp || 'todas', HOJE);
const com = mexe => { const d = banco(); mexe(d); return fech(d); };
const L = (d, id) => d.fin.find(l => l._id === id);

(async () => {
  console.log('\nTrimestre completo (2 contas × 3 meses):');
  const f = fech(banco());
  ok(f.pronto && f.qtdPendencias === 0 && f.total === 8 && f.completos === 8 && f.pct === 1, '8 movimentos, todos completos: 100% pronto para o contador' + (f.qtdPendencias ? ' — ' + JSON.stringify(Object.entries(f.pendencias).filter(([, v]) => v.length).map(([k, v]) => [k, v.length])) : ''));
  const sf = f.porConta.find(p => p.conta.id === 'c-sf'), jet = f.porConta.find(p => p.conta.id === 'c-jet');
  ok(sf.meses.map(m => m.saldoFinal).join() === '34954.1,22954.1,37954.1' && sf.meses.map(m => m.sistema).join() === '34954.1,22954.1,37954.1' && sf.meses.every(m => m.dif === 0) && sf.meses[0].saldoInicial === 10000,
    'SF: abertura 10.000,00 · julho 34.954,10 · agosto 22.954,10 · setembro 37.954,10 — sistema = extrato ao centavo');
  ok(jet.meses.map(m => m.sistema).join() === '0,10000,8800' && jet.meses.every(m => m.dif === 0), 'JeT: 0,00 · 10.000,00 · 8.800,00 — diferença zero nos três meses');
  ok(f.movimentos.find(m => m.fitid === 's2').lanc._id === 'D1' && f.movimentos.find(m => m.fitid === 's2').auto, 'Pix sem vínculo no extrato casa com o lançamento pela regra da conciliação (mesmo valor, até 3 dias)');
  ok(F.fechamento(banco(), TRI, 'JeT', HOJE).total === 2 && F.fechamento(banco(), TRI, 'JeT', HOJE).contas.length === 1, 'filtro por empresa: a JeT tem 1 conta e 2 movimentos');

  console.log('\nCada pendência aparece e some ao resolver:');
  let x = com(d => { d.fin = d.fin.filter(l => l._id !== 'D2'); });
  ok(x.pendencias.semLancamento.length === 1 && x.pendencias.semLancamento[0].memo === 'TARIFA PACOTE' && x.pendencias.saldoDiferente.length === 3 && x.pendencias.saldoDiferente[0].dif === 45.9 && !x.pronto, 'tarifa sem lançamento: movimento sem lançamento e saldo do sistema 45,90 acima do extrato em julho, agosto e setembro');
  x = com(d => d.fin.push({ _id: 'D5', tipo: 'Despesa', desc: 'Baixa errada', valor: 999, status: 'Realizado', liquidadoEm: '2026-07-20', empresa: 'WindGate', op: 'OP20' }));
  ok(x.pendencias.semBanco.length === 1 && x.pendencias.semBanco[0].lancId === 'D5' && x.pendencias.saldoDiferente.some(s => s.dif === -999), 'baixa no sistema que não está no banco: aparece e desequilibra o saldo');
  x = com(d => { delete L(d, 'D1').contraparte; });
  ok(x.pendencias.semContraparte.length === 1 && x.pendencias.semContraparte[0].lancId === 'D1', 'sem contraparte');
  x = com(d => { L(d, 'D1').contraparte = { nome: 'XYZ', tipo: 'fornecedor' }; });
  ok(x.pendencias.semContraparte.length === 1, 'fornecedor sem CNPJ/CPF também é pendência (banco e governo não precisam)');
  x = com(d => { L(d, 'D1').notas = []; });
  ok(x.pendencias.semNota.length === 1, 'sem nota e sem motivo');
  x = com(d => { L(d, 'D1').notas = []; L(d, 'D1').nf = 'https://drive/nf55.pdf'; });
  ok(x.pendencias.semNota.length === 1 && x.pendencias.semNota[0].notaLink, 'só o link antigo (`nf`): aparece como "nota anexada (link)", para vincular ao registro');
  x = com(d => { L(d, 'D3').semNota = { motivo: 'outro', obs: '' }; });
  ok(x.pendencias.semNota.length === 1, 'motivo "outro" sem o texto não vale');
  x = com(d => { L(d, 'D2').comp = ''; });
  ok(x.pendencias.semComprovante.length === 1 && x.pendencias.semComprovante[0].lancId === 'D2', 'sem comprovante');
  x = com(d => { L(d, 'D2').comp = ''; L(d, 'D2').comprovante = { link: 'https://storage.teste/tarifa.pdf' }; });
  ok(!x.pendencias.semComprovante.length, 'comprovante novo (`comprovante.link`) também vale');
  x = com(d => { delete L(d, 'D3').naturezaContabil; });
  ok(x.pendencias.semClassificacao.length === 1 && x.pendencias.semClassificacao[0].lancId === 'D3', 'despesa da empresa sem natureza nem categoria: sem classificação');

  console.log('\nNotas:');
  x = com(d => d.hubNotas.push({ _id: 'n3', tipo: 'entrada', empresa: 'WindGate', numero: '900', data: '2026-09-10', valor: 1500, emitente: 'Fornecedor ABC', emitenteCnpj: '11111111000191' }));
  ok(x.pendencias.notasOrfas.length === 1 && x.pendencias.notasOrfas[0].numero === '900', 'nota do trimestre sem lançamento: nota órfã');
  x = com(d => { d.hubNotas.push({ _id: 'n3', tipo: 'entrada', empresa: 'WindGate', numero: '900', data: '2026-09-10', valor: 1500, semLancamento: { motivo: 'paga no 4º trimestre' } }); });
  ok(!x.pendencias.notasOrfas.length, 'com o motivo registrado na nota ("paga no 4º trimestre"), deixa de ser órfã');
  const db1 = banco(), r2 = L(db1, 'R2');
  ok(F.somaNotas(L(db1, 'R1')) === 30000 && F.somaNotas(r2) === 15000, 'uma nota (n1, R$ 45.000) cobre duas parcelas: 30.000 + 15.000');
  r2.notas = [];
  const sug = F.sugerirNotas(db1, r2);
  ok(sug.length && sug[0].nota._id === 'n1' && sug[0].resta === 15000 && sug[0].parcela && sug[0].cnpj && sug[0].mesmaOp, 'parcela 2 sem nota: o sistema sugere a n1 (mesmo CNPJ e operação), com R$ 15.000 ainda descobertos');

  console.log('\nTransferência SF ↔ JeT:');
  ok(!f.pendencias.transfSemPar.length, 'as duas pontas (SF −10.000 em 03/08 e JeT +10.000 em 04/08) casadas, fora do resultado e sem pedir nota');
  x = com(d => { d.fin = d.fin.filter(l => l._id !== 'T2'); });
  ok(x.pendencias.transfSemPar.length === 1 && x.pendencias.transfSemPar[0].lancId === 'T1' && x.pendencias.semLancamento.some(m => m.memo === 'TED SF TRADING'), 'sem a ponta da JeT: transferência sem par e o crédito da JeT sem lançamento');

  console.log('\nExtratos e contas:');
  x = com(d => { d.hubExtratos = d.hubExtratos.filter(e => e._id !== 'e-jet-07'); });
  ok(x.pendencias.faltaExtrato.length === 1 && x.pendencias.faltaExtrato[0].mes === '2026-07' && x.pendencias.faltaExtrato[0].contaId === 'c-jet', 'extrato de julho da JeT faltando');
  x = com(d => d.hubExtratos.push({ _id: 'e-x', contaId: 'c-velha', empresa: 'WindGate', banco: 'Bradesco', mes: '2026-08', saldo: 0, transacoes: [] }));
  ok(x.pendencias.contaSemCadastro.length === 1, 'extrato de conta sem cadastro bloqueia o fechamento');
  x = com(d => { d.hubExtratos.find(e => e._id === 'e-sf-08').saldo = 22000; });
  ok(x.pendencias.extratoQuebrado.map(q => q.mes).join() === '2026-08,2026-09', 'saldo final de agosto errado: agosto não continua julho e setembro não continua agosto');

  /* ======================= Servidor: pacote do contador ======================= */
  console.log('\nPacote do contador (servidor):');
  const inicial = banco(); L(inicial, 'D2').comp = '';          // começa com uma pendência
  fs.writeFileSync(TMP, JSON.stringify(inicial));
  const fetchReal = global.fetch, externas = [];
  global.fetch = async (url, o) => {
    const u = String(url);
    if (u.startsWith('https://storage.teste/')) { const corpo = Buffer.from('conteudo de ' + u.split('/').pop()); return { ok: true, status: 200, arrayBuffer: async () => corpo }; }
    if (!/^http:\/\/127\.0\.0\.1:/.test(u)) { externas.push(u); throw new Error('chamada externa bloqueada no teste: ' + u); }
    return fetchReal(url, o);
  };
  const app = require('../src/server'), auth = require('../src/services/auth.service');
  const srv = app.listen(0), base = `http://127.0.0.1:${srv.address().port}`;
  const tk = {}; ['samir', 'davi', 'matheus', 'ivina', 'pedro', 'oneide'].forEach(k => { tk[k] = auth.emitirToken(k); });
  const chamar = async (quem, metodo, caminho, corpo) => { const r = await fetch(base + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk[quem] }, body: corpo ? JSON.stringify(corpo) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };
  const uploads = path.join(__dirname, '../uploads'), criados = [];
  const baixarPacote = link => { const p = path.join(uploads, path.basename(link)); criados.push(p); return fs.readFileSync(p); };

  for (const k of ['ivina', 'oneide', 'pedro']) ok((await chamar(k, 'POST', '/api/fiscal/pacote', { tri: TRI })).status === 403, `${k} não gera o pacote (403)`);
  let r = await chamar('davi', 'POST', '/api/fiscal/pacote', { tri: TRI });
  ok(r.status === 409 && r.j.pendencias === 1 && /só sai com tudo zerado/.test(r.j.message), 'com 1 pendência (tarifa sem comprovante): o pacote não sai para o Davi');
  ok((await chamar('davi', 'POST', '/api/fiscal/pacote', { tri: TRI, liberar: true, motivo: 'teste' })).status === 409, 'o Davi não libera com pendência: só a diretoria');
  ok((await chamar('matheus', 'POST', '/api/fiscal/pacote', { tri: TRI, liberar: true })).status === 400, 'o Matheus também libera, escrevendo o motivo');
  ok((await chamar('samir', 'POST', '/api/fiscal/pacote', { tri: TRI, liberar: true })).status === 400, 'a diretoria libera só escrevendo o motivo');
  r = await chamar('samir', 'POST', '/api/fiscal/pacote', { tri: TRI, liberar: true, motivo: 'comprovante da tarifa vem com o extrato do banco' });
  ok(r.status === 200 && r.j.entrega.liberadoComPendencias.por === 'Samir' && r.j.entrega.liberadoComPendencias.pendencias.semComprovante === 1, 'liberado pela diretoria: fica registrado quem liberou e o que faltava');
  const lib = lerZip(baixarPacote(r.j.entrega.link)), wbLib = XLSX.read(lib['fechamento-2026-T3.xlsx'], { type: 'buffer' });
  ok(wbLib.SheetNames.includes('Pendências liberadas') && /LIBERADO COM 1 PENDÊNCIA/.test(lib['LEIA-ME.txt'].toString()), 'o pacote liberado traz a aba das pendências e o aviso no LEIA-ME');

  /* Davi resolve a pendência pelo caminho normal de gravação e gera de novo. */
  let dbS = (await chamar('davi', 'GET', '/api/db')).j.db;
  const d2 = dbS.fin.find(l => l._id === 'D2'); d2.comp = 'https://storage.teste/comp-D2.pdf';
  ok((await chamar('davi', 'POST', '/api/db', { fin: [d2] })).status === 200, 'Davi anexa o comprovante da tarifa');
  r = await chamar('davi', 'POST', '/api/fiscal/pacote', { tri: TRI });
  ok(r.status === 200 && !r.j.entrega.liberadoComPendencias && r.j.entrega.resumo.pct === 1 && r.j.entrega.faltou === 0, 'tudo zerado: o Davi gera o pacote, 100% completo, todos os arquivos baixados');
  const zipBuf = baixarPacote(r.j.entrega.link), zip = lerZip(zipBuf);
  ok(r.j.entrega.hash === crypto.createHash('sha256').update(zipBuf).digest('hex'), 'hash do pacote registrado confere com o arquivo');
  const nomes = Object.keys(zip);
  ok(nomes.includes('notas/2026-07/saida-101.xml') && nomes.includes('notas/2026-07/saida-101.pdf') && nomes.includes('notas/2026-07/servico-55.pdf'), 'XML e PDF das notas em pastas por mês');
  ok(nomes.includes('2026-07/SF_Santander_1234-5/extrato-2026-07.ofx') && nomes.includes('2026-09/JeT_Itau_9876-1/extrato-2026-09.ofx'), 'extratos em pastas por mês e conta');
  ok(nomes.filter(n => /\/comprovantes\//.test(n)).length === 8 && zip[nomes.find(n => /comprovantes\/2026-07-31/.test(n))].toString() === 'conteudo de comp-D2.pdf', 'os 8 comprovantes, com o conteúdo do Storage');
  const wb = XLSX.read(zip['fechamento-2026-T3.xlsx'], { type: 'buffer' }), aba = n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 });
  ok(wb.SheetNames.join('|') === 'Resumo|SF Santander 1234-5|JeT Itaú 9876-1|Notas do trimestre', 'planilha: resumo, uma aba por conta e as notas');
  const res = aba('Resumo');
  ok(res.length === 7 && res.slice(1).every(l => l[6] === 0) && res[1][4] === 34954.1 && res[1][5] === 34954.1 && res[3][2] === 15000, 'resumo por conta e mês: entradas, saídas, saldo do extrato, do sistema e diferença 0,00');
  const sfA = aba('SF Santander 1234-5');
  ok(sfA[0].join('|') === F.COLUNAS_PACOTE.join('|') && sfA.length === 7, 'aba da conta com as colunas pedidas e uma linha por movimento');
  const tarifa = sfA.find(l => l[1] === 'TARIFA PACOTE'), custo = sfA.find(l => l[1] === 'TED RECEBIDA CUSTODIO'), transf = sfA.find(l => l[1] === 'TED JET IMPORT');
  ok(tarifa[3] === 34954.1 && tarifa[9] === 'sem nota: Tarifa bancária, IOF ou juros bancários' && tarifa[7] === 'Banco Santander', 'tarifa: saldo corrente 34.954,10 e "sem nota: tarifa bancária…"');
  ok(custo[4] === 'R1' && custo[6] === 'OP20' && custo[8] === '11444777000161' && /NF saída · nº 101 · 2{44}/.test(custo[9]) && custo[10] === 'https://storage.teste/comp-R1.pdf', 'recebimento: lançamento, operação, CNPJ do cliente, nota (tipo, número, chave) e comprovante');
  ok(/sem nota: transferência/.test(transf[9]) && transf[5] === 'Transferência', 'transferência: entra com o motivo "transferência"');
  const notasA = aba('Notas do trimestre');
  ok(notasA.length === 3 && notasA.find(l => l[2] === '101')[9] === 'R1, R2', 'aba de notas: a n1 com as duas parcelas vinculadas (R1, R2)');

  console.log('\nContador:');
  const dbP = (await chamar('pedro', 'GET', '/api/db')).j.db;
  ok(!dbP.fin && !dbP.ops && !dbP.crm && !dbP.quotes && dbP.hubPainel._fiscal.entregas[TRI].pacotes.todas.link === r.j.entrega.link, 'o Pedro não lê financeiro, operações, CRM nem cotações: só o link do pacote, as notas e os extratos');
  r = await chamar('pedro', 'POST', '/api/db', { hubPainel: { _fiscalContador: { [TRI]: { recebidoEm: '2026-10-05T10:00:00Z', por: 'Pedro', hash: r.j.entrega.hash } } } });
  dbS = (await chamar('davi', 'GET', '/api/db')).j.db;
  ok(r.status === 200 && dbS.hubPainel._fiscalContador[TRI].recebidoEm && dbS.hubPainel._fiscal.entregas[TRI].hash, 'o Pedro confirma o recebimento pelo acesso dele; a entrega continua registrada');
  ok(dbS.fin.length === inicial.fin.length && dbS.fin.find(l => l._id === 'R1').valor === 30000, 'o fechamento não muda nenhum lançamento');
  ok(!externas.length, 'nenhuma chamada para fora');

  srv.close(); criados.forEach(p => { try { fs.unlinkSync(p); } catch (e) {} }); try { fs.unlinkSync(TMP); fs.unlinkSync(TMP + '.bak'); } catch (e) {}
  global.fetch = fetchReal;
  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
