/**
 * OFX do Itaú: SGML sem fechar as tags, linhas de "SALDO" no meio dos movimentos, período maior que o mês
 * e arquivo em UTF-8 ou Latin-1. Dados inventados.
 */
const W = require('../public/hub/js/regras.js');
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };

const tr = (d, v, memo, id) => `<STMTTRN>\n<TRNTYPE>${v < 0 ? 'DEBIT' : 'CREDIT'}\n<DTPOSTED>${d}000000[-03:EST]\n<TRNAMT>${v}\n<FITID>${id}\n<MEMO>${memo}\n`;
const ofx = (ini, fim, linhas) => `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nCHARSET:1252\n\n<OFX>\n<BANKMSGSRSV1>\n<STMTTRNRS>\n<STMTRS>\n<CURDEF>BRL\n<BANKACCTFROM>\n<BANKID>0341\n<ACCTID>99999\n</BANKACCTFROM>\n<BANKTRANLIST>\n<DTSTART>${ini}\n<DTEND>${fim}\n${linhas.join('')}</BANKTRANLIST>\n<LEDGERBAL>\n<BALAMT>15230.55\n<DTASOF>${fim}\n</LEDGERBAL>\n</STMTRS>\n</STMTTRNRS>\n</BANKMSGSRSV1>\n</OFX>\n`;
const ITAU = ofx('20260928', '20261031', [
  tr('20260930', 10000.25, 'SALDO ANTERIOR', 's0'),
  tr('20260930', -150, 'TAR PACOTE ITAU', 'a0'),
  tr('20261001', 20000, 'PIX RECEBIDO CLIENTE A', 'a1'),
  tr('20261001', 30000.25, 'SALDO TOTAL DISPONÍVEL DIA', 's1'),
  tr('20261015', -4769.70, 'PIX ENVIADO FORNECEDOR', 'a2'),
  tr('20261015', 25230.55, 'SALDO TOTAL DISPONÍVEL DIA', 's2'),
  tr('20261020', -10000, 'TED TRANSFERÊNCIA AÇÃO', 'a3')
]);

console.log('\nLinhas de saldo e saldo anterior:');
{
  const r = W.lerOFX(ITAU);
  ok(r.transacoes.length === 4 && !r.transacoes.some(t => /SALDO/.test(t.memo)), `as linhas "SALDO…" não viram movimento (${r.transacoes.length} movimentos)`);
  ok(r.linhasDeSaldo === 3, 'conta quantas linhas de saldo foram ignoradas');
  ok(r.saldoInicial === 10000.25, '"SALDO ANTERIOR" vira o saldo inicial');
  ok(r.saldo === 15230.55, 'saldo final do LEDGERBAL');
  const meio = W.lerOFX(ofx('20261001', '20261031', [tr('20261002', -5, 'PIX ENVIADO SALDOS E CIA', 'x')]));
  ok(meio.linhasDeSaldo === 0 && meio.transacoes.length === 1, 'movimento que só menciona "saldo" no meio continua');
  ok(W.lerOFX(ofx('20261001', '20261031', [tr('20261002', -5, 'PIX', 'x')])).saldoInicial === null, 'sem "SALDO ANTERIOR": saldo inicial fica em branco para preencher');
}

console.log('\nMês do extrato:');
{
  ok(W.lerOFX(ITAU).mes === '2026-10', 'período de 28/09 a 31/10: vale o mês da maioria dos movimentos (outubro)');
  ok(W.lerOFX(ofx('20261101', '20261130', [tr('20261003', -1, 'X', 'x')])).mes === '2026-11', 'período dentro de um mês só: vale o período');
  ok(W.mesDoExtrato({ inicio: '2026-09-01', fim: '2026-10-31', transacoes: [] }) === '2026-10', 'sem movimentos: o mês do fim');
  ok(W.mesDoExtrato(null) === '', 'sem extrato: vazio');
}

console.log('\nAcentos:');
{
  const utf8 = new Uint8Array(Buffer.from(ITAU, 'utf8'));
  const latin = new Uint8Array(Buffer.from(ITAU, 'latin1'));
  ok(W.decodificarOFX(utf8).includes('TRANSFERÊNCIA AÇÃO'), 'arquivo em UTF-8: acentos certos');
  ok(W.decodificarOFX(latin).includes('TRANSFERÊNCIA AÇÃO'), 'arquivo em Latin-1: acentos certos');
  const estragado = Buffer.from(ITAU, 'utf8').toString('latin1');
  ok(/DISPONÃ/.test(estragado), 'o problema de hoje: UTF-8 lido como Latin-1 vira "DISPONÃVEL"');
  ok(W.lerOFX(estragado).transacoes.find(t => t.id === 'a3').memo === 'TED TRANSFERÊNCIA AÇÃO', 'texto que já chegou estragado é consertado na leitura');
  ok(W.consertarAcentos('DISPONÍVEL') === 'DISPONÍVEL' && W.consertarAcentos('SÃO PAULO') === 'SÃO PAULO', 'texto certo fica como está');
}

console.log('\nConciliação continua:');
{
  const db = { fin: [{ _id: 'f1', tipo: 'Receita', valor: 20000, status: 'Realizado', liquidadoEm: '2026-10-01', empresa: 'WindGate' }] };
  const c = W.conciliar(db, W.lerOFX(ITAU).transacoes, 'WindGate');
  ok(c.find(t => t.id === 'a1').lancId === 'f1' && c.length === 4, 'o recebimento bate com o lançamento; as linhas de saldo nem entram');
}

console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
process.exitCode = falhou ? 1 : 0;
