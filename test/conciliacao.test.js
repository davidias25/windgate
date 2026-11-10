/**
 * Conciliação bancária: data e valor do pagamento, vários-com-um, sugestões, contas e OFX do Itaú.
 * Casos tirados do fechamento do 4º trimestre (valores reais, sem nomes de terceiros).
 */
process.env.SUPABASE_DISABLED = '1';
const F = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/comex.js'), require('../public/hub/js/fin-regras.js'));
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const perto = (a, b) => Math.abs(a - b) < 0.005;
const TRI = '2026-T4', HOJE = '2026-12-05';
const L = (id, o) => Object.assign({ _id: id, status: 'Realizado', empresa: 'WindGate', por: 'Davi' }, o, { data: o.liquidadoEm, vencimento: o.vencimento || o.liquidadoEm, valorPago: o.valor });
function banco() {
  return {
    hubPainel: { _fiscal: { contas: [{ id: 'sant', empresa: 'WindGate', banco: 'Santander', nome: 'SF', ativa: true }, { id: 'itau', empresa: 'JeT', banco: 'Itaú', nome: 'JeT', ativa: true }, { id: 'camb', empresa: 'WindGate', banco: 'Câmbio', nome: 'XP', tipo: 'cambio', ativa: true }, { id: 'cart', empresa: 'WindGate', banco: 'Cartão', nome: 'empresa', tipo: 'cartao', ativa: true }] } },
    fin: [
      L('iv1', { tipo: 'Receita', desc: 'Recebimento cliente OP16/21', valor: 40000, liquidadoEm: '2026-10-19' }),
      L('iv2', { tipo: 'Receita', desc: '2ª parcela cliente OP16/21', valor: 40000, liquidadoEm: '2026-10-20' }),
      L('ii', { tipo: 'Despesa', desc: 'II DI OP20', valor: 10000, liquidadoEm: '2026-10-22' }), L('ipi', { tipo: 'Despesa', desc: 'IPI DI OP20', valor: 5000, liquidadoEm: '2026-10-22' }),
      L('pis', { tipo: 'Despesa', desc: 'PIS DI OP20', valor: 1500, liquidadoEm: '2026-10-22' }), L('cof', { tipo: 'Despesa', desc: 'COFINS DI OP20', valor: 5814.77, liquidadoEm: '2026-10-22' }),
      L('sis', { tipo: 'Despesa', desc: 'Siscomex OP20', valor: 154.23, liquidadoEm: '2026-10-22' }), L('afr', { tipo: 'Despesa', desc: 'AFRMM OP20', valor: 432.23, liquidadoEm: '2026-10-22' }),
      L('dar', { tipo: 'Despesa', desc: 'Taxa DAR ICMS OP20', valor: 225.72, liquidadoEm: '2026-10-26' }),
      L('jet', { tipo: 'Despesa', desc: 'Fornecedor pago pela JeT', valor: 999, liquidadoEm: '2026-10-10', empresa: 'JeT' }),
      L('cb', { tipo: 'Despesa', desc: 'Câmbio fábrica', valor: 49211.93, liquidadoEm: '2026-10-08' })
    ],
    hubExtratos: [{ _id: 'e10', contaId: 'sant', empresa: 'WindGate', banco: 'Santander', mes: '2026-10', saldo: 0, transacoes: [
      { data: '2026-10-19', valor: 20000, memo: 'PIX RECEBIDO CLIENTE', id: 'a' }, { data: '2026-10-19', valor: 20000, memo: 'PIX RECEBIDO CLIENTE', id: 'b' },
      { data: '2026-10-19', valor: 20000, memo: 'PIX RECEBIDO CLIENTE', id: 'c' }, { data: '2026-10-20', valor: 10000, memo: 'PIX RECEBIDO CLIENTE', id: 'd' }, { data: '2026-10-22', valor: 10000, memo: 'PIX RECEBIDO CLIENTE', id: 'e' },
      { data: '2026-10-22', valor: -22901.23, memo: 'DEBITO PUCOMEX', id: 'f' }, { data: '2026-10-22', valor: -225.72, memo: 'DAR SEFAZ', id: 'g' }]
    }],
    ops: []
  };
}
const fe = db => F.fechamento(db, TRI, 'todas', HOJE);
const pend = (db, k) => fe(db).pendencias[k];

console.log('\nValor pago diferente do previsto:');
{
  const l = { _id: 'm', tipo: 'Despesa', desc: 'Maino', valor: 589.5, status: 'Previsto' };
  F.realizar(l, 607.75, '2026-10-19');
  ok(l.valor === 607.75 && l.valorPrevisto === 589.5 && l.diferencaBaixa.tipo === 'juros' && perto(l.diferencaBaixa.valor, 18.25), 'pago R$ 607,75 sobre R$ 589,50: valor real e R$ 18,25 de juros/multa');
  const r = { _id: 'r', tipo: 'Receita', valor: 1000, status: 'Previsto' }; F.realizar(r, 990, '2026-10-19');
  ok(r.diferencaBaixa.tipo === 'desconto' && perto(r.diferencaBaixa.valor, 10), 'recebido a menos: desconto');
  const x = { _id: 'x', tipo: 'Despesa', valor: 100, status: 'Previsto' }; F.realizar(x, 100, '2026-10-19');
  ok(!x.diferencaBaixa, 'valor igual: sem diferença');
}

console.log('\nConta fixa: o vencimento fica no mês dela, e a tela avisa:');
{
  const v = F.vencimentoDaFixa('2026-10', '2026-11-04');
  ok(v.venc === '2026-10-04' && v.ajustado, '04/11 numa fixa de outubro vira 04/10, e isso é sinalizado');
  ok(!F.vencimentoDaFixa('2026-10', '2026-10-20').ajustado, 'data do próprio mês: sem aviso');
}

console.log('\nVários com um:');
{
  const db = banco();
  ok(pend(db, 'semBanco').some(x => x.lancId === 'iv1') && pend(db, 'semLancamento').filter(x => x.valor === 20000).length === 3, 'sem vínculo: os R$ 40.000 e os Pix de R$ 20.000 ficam soltos');
  let r = F.vincularGrupo(db, ['e10:0', 'e10:1'], ['iv1'], 'Davi');
  ok(r.ok && !pend(db, 'semBanco').some(x => x.lancId === 'iv1'), '1 lançamento de R$ 40.000 = 2 Pix de R$ 20.000');
  r = F.vincularGrupo(db, ['e10:2', 'e10:3', 'e10:4'], ['iv2'], 'Davi');
  ok(r.ok && !pend(db, 'semLancamento').some(x => x.valor === 10000), '2ª parcela = Pix de R$ 20.000 + R$ 10.000 + R$ 10.000');
  r = F.vincularGrupo(db, ['e10:5'], ['ii', 'ipi', 'pis', 'cof', 'sis', 'afr'], 'Davi');
  ok(r.ok && perto(r.sistema, 22901.23), 'impostos da DI lançados separados = um débito do PUCOMEX de R$ 22.901,23');
  const x = fe(db);
  ok(!x.pendencias.semBanco.some(l => ['ii', 'ipi', 'pis', 'cof', 'sis', 'afr'].includes(l.lancId)) && !x.pendencias.semLancamento.some(m => m.valor === -22901.23), 'nenhum dos seis nem o débito sobram');
  ok(x.pendencias.semClassificacao.filter(i => i.grupo).length === 8, 'cada lançamento do grupo continua conferido uma vez (classificação, contraparte, nota)');
  ok(!F.vincularGrupo(db, ['e10:6'], ['iv1'], 'Davi').ok, 'sentidos diferentes: recusado');
  const errado = F.vincularGrupo(banco(), ['e10:0'], ['iv1'], 'Davi');
  ok(!errado.ok && /não batem/.test(errado.msg), 'soma que não bate: recusado, com as duas somas');
  const d2 = banco(); F.vincularGrupo(d2, ['e10:0', 'e10:1'], ['iv1'], 'Davi'); d2.fin.find(l => l._id === 'iv1').valor = 39000;
  ok(fe(d2).pendencias.grupoDiferente.length === 1 && fe(d2).pendencias.semBanco.some(l => l.lancId === 'iv1'), 'valor mudou depois: o grupo vira pendência e os dois lados voltam a aparecer');
  const g = d2.hubExtratos[0].transacoes[0].grupo; F.desvincularGrupo(d2, g);
  ok(!d2.hubExtratos[0].transacoes[0].grupo && !d2.fin.find(l => l._id === 'iv1').grupoConciliacao, 'desvincular desfaz dos dois lados');
}

console.log('\nSugestão de até 10 dias e correção da data:');
{
  const db = banco(), x = fe(db), dar = x.pendencias.semBanco.find(l => l.lancId === 'dar');
  ok(!!dar, 'pago em 26/10 no sistema e 22/10 no banco: 4 dias, não casa sozinho');
  const s = F.sugestoesConciliacao(db, x, dar);
  ok(s.length === 1 && s[0].chave === 'e10:6' && s[0].dias === 4, 'sugere o movimento de mesmo valor a 4 dias');
  F.vincularUm(db, s[0].chave, 'dar', 'Davi');
  ok(!pend(db, 'semBanco').some(l => l.lancId === 'dar'), 'confirmado: some das pendências');
  const d2 = banco(); F.corrigirDataPagamento(d2.fin.find(l => l._id === 'dar'), '2026-10-22', 'Davi');
  ok(!pend(d2, 'semBanco').some(l => l.lancId === 'dar') && d2.fin.find(l => l._id === 'dar').vencimento === '2026-10-26', 'corrigir a data do pagamento casa sozinho; o vencimento fica');
  ok(!F.corrigirDataPagamento({ status: 'Previsto' }, '2026-10-22').ok, 'previsto não tem data de pagamento');
  const s2 = F.sugestoesConciliacao(banco(), fe(banco()), pend(banco(), 'semLancamento').find(m => m.valor === -225.72));
  ok(s2.length === 1 && s2[0].lancId === 'dar', 'a partir do movimento do banco, sugere o lançamento');
}

console.log('\nConta no lançamento:');
{
  const db = banco();
  ok(pend(db, 'semBanco').some(l => l.lancId === 'cb'), 'sem conta, o câmbio cai na única conta bancária da SF e aparece como "não está no banco"');
  const mg = F.migrarContas(db, 'Davi');
  ok(mg.preenchidos === db.fin.length && db.fin.find(l => l._id === 'jet').contaId === 'itau' && db.fin.find(l => l._id === 'iv1').contaId === 'sant' && db.fin.every(l => l.contaAutomatica), 'migração: JeT no Itaú, o resto no Santander, marcado para revisar');
  ok(F.migrarContas(db, 'Davi').preenchidos === 0, 'rodar de novo não muda nada');
  F.mudarConta(db, db.fin.find(l => l._id === 'cb'), 'camb', 'Davi');
  const x = fe(db);
  ok(!x.pendencias.semBanco.some(l => l.lancId === 'cb') && !x.porConta.some(c => c.conta.id === 'camb') && !x.pendencias.faltaExtrato.some(f => f.contaId === 'camb'), 'pago pelo câmbio: sai do Santander, sem cobrar extrato da conta de câmbio');
  ok(x.porConta.map(c => c.conta.id).join() === 'sant,itau', 'saldo conferido só nas contas bancárias, separado por conta');
  const sald = x.porConta.find(c => c.conta.id === 'sant').meses[0];
  ok(sald.sistema != null && !F.contasBancarias(db).some(c => c.id === 'cart'), 'o cartão não entra no saldo do Santander');
  const conc = F.conciliar({ fin: [Object.assign({}, db.fin.find(l => l._id === 'jet'), { valor: 20000, liquidadoEm: '2026-10-19', tipo: 'Receita' })] }, [{ data: '2026-10-19', valor: 20000 }], null, 'sant');
  ok(!conc[0].lancId, 'ao subir o extrato, lançamento de outra conta não casa');
}

console.log('\nOFX do Itaú (SGML, sem fechar as tags):');
{
  const ofx = `OFXHEADER:100\nDATA:OFXSGML\nCHARSET:1252\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>0341<ACCTID>984048</BANKACCTFROM><BANKTRANLIST><DTSTART>20261001000000[-03:EST]<DTEND>20261031000000[-03:EST]
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261015100000[-03:EST]<TRNAMT>-1234.56<FITID>1<MEMO>PIX ENVIADO
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261020<TRNAMT>500,00<FITID>2<MEMO>PIX RECEBIDO
</BANKTRANLIST><LEDGERBAL><BALAMT>8765.44<DTASOF>20261031</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  const r = F.lerOFX(ofx);
  ok(r && r.transacoes.length === 2 && r.transacoes[0].data === '2026-10-15' && r.transacoes[0].valor === -1234.56 && r.transacoes[1].valor === 500, 'lê os movimentos sem a tag de fechamento, com data e valor certos');
  ok(r.inicio === '2026-10-01' && r.fim === '2026-10-31' && r.saldo === 8765.44, 'período e saldo');
  ok(F.lerOFX('<OFX><STMTTRN><DTPOSTED>20261001<TRNAMT>-1</STMTTRN></OFX>').transacoes.length === 1, 'o OFX com fechamento continua igual');
}

console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
process.exit(falhou ? 1 : 0);
