/**
 * Financeiro em 3 telas (Parte 3): Carteira · Caixa do mês · Indicadores. Números do prompt de 18/11 (OP26 e OP227).
 */
const W = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/comex.js'), require('../public/hub/js/fin-regras.js'));
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const perto = (a, b, e) => Math.abs(a - b) <= (e == null ? 0.01 : e);
const H = '2026-11-18';
let n = 0;
const L = (op, tipo, valor, venc, real, extra) => Object.assign({ _id: 'l' + (++n), op, tipo, valor, vencimento: venc, status: real ? 'Realizado' : 'Previsto', liquidadoEm: real ? venc : undefined, empresa: 'WindGate' }, extra || {});
/* Uma operação com os números do canvas: receita, custo, caixa hoje (recebido − pago) e falta receber. */
function op(fin, id, receita, custo, caixa, faltaReceber) {
  const recebido = receita - faltaReceber, pago = recebido - caixa;
  if (recebido) fin.push(L(id, 'Receita', recebido, '2026-10-01', true));
  if (faltaReceber) fin.push(L(id, 'Receita', faltaReceber, '2026-12-11', false));
  if (pago) fin.push(L(id, 'Despesa', pago, '2026-10-05', true));
  if (custo - pago) fin.push(L(id, 'Despesa', custo - pago, '2026-12-20', false));
}
function banco() {
  const fin = [];
  op(fin, 'OP26.1', 446974, 341396, 30788, 366974);
  op(fin, 'OP26.2', 45000, 41308, 0, 45000);
  op(fin, 'OP227.1', 150000, 106124, 30000, 120000);
  op(fin, 'OP227.2', 194200, 123661, 40891, 153309);
  op(fin, 'OP23', 365781, 362809, 22295, 164097);
  op(fin, 'OP10', 100000, 80000, 20000, 0);
  return { ops: [{ id: 'OP26', papel: 'mae', status: 'preparacao_embarque' }, { id: 'OP26.1', maeId: 'OP26', cliente: 'Diagonal', status: 'preparacao_embarque' }, { id: 'OP26.2', maeId: 'OP26', cliente: 'Neto', status: 'preparacao_embarque' },
    { id: 'OP227', papel: 'mae', status: 'contrato' }, { id: 'OP227.1', maeId: 'OP227', cliente: 'Márcio', status: 'contrato' }, { id: 'OP227.2', maeId: 'OP227', cliente: 'Azul', status: 'contrato' },
    { id: 'OP23', cliente: 'Ernanes', status: 'transito' }, { id: 'OP10', cliente: 'Antigo', status: 'concluida' }, { id: 'ESTUDO1', cliente: 'X', status: 'producao' }],
    fin, opStatusHist: [{ op: 'OP10', para: 'concluida', em: '2026-11-05T10:00:00Z' }], quotes: {}, hubPainel: {}, hubExtratos: [] };
}

console.log('\nCarteira de operações:');
{
  const db = banco(), c = W.carteiraOps(db, 'todas', 'andamento', H);
  const op26 = c.linhas.find(l => l.op === 'OP26'), op227 = c.linhas.find(l => l.op === 'OP227');
  ok(op26 && perto(op26.lucro, 109270) && op26.filhas.length === 2 && perto(op26.filhas[0].lucro, 105578) && perto(op26.filhas[1].lucro, 3692), 'OP26: uma linha com R$ 109.270 (105.578 + 3.692), sem contar em dobro; ▸ abre as filhas');
  ok(op227 && perto(op227.lucro, 114415) && op227.cliente === 'Márcio + Azul' && !c.linhas.some(l => /^OP227\./.test(l.op)), 'OP227: uma linha "Márcio + Azul" de R$ 114.415, filhas recolhidas');
  const f1 = op26.filhas[0];
  ok(perto(f1.caixa, 30788) && perto(f1.faltaReceber, 366974) && perto(f1.faltaPagar, 292184) && perto(f1.lucroRealizar, 74790), 'OP26.1: caixa 30.788 · falta receber 366.974 · falta pagar 292.184 · lucro a realizar 74.790');
  ok(perto(op26.caixa + op26.lucroRealizar, op26.lucro), 'lucro = já em caixa + lucro a realizar');
  ok(c.linhas.every(l => l.garantido === 0), 'lucro garantido só com todos os custos pagos (aqui nenhum)');
  ok(!c.linhas.some(l => l.op === 'OP10' || l.op === 'ESTUDO1'), '"em andamento": concluída e estudo ficam fora');
  ok(perto(c.total.lucro, 109270 + 114415 + 2972) && perto(c.total.lucroRealizar, c.total.faltaReceber - c.total.faltaPagar), 'total soma só o filtro ativo; lucro a realizar = falta receber − falta pagar');
  ok(c.abaixo.some(l => l.op === 'OP23') && !c.abaixo.some(l => l.op === 'OP227'), 'OP23 (margem 0,8%) em vermelho; OP227 não');
  ok(op227.proximo && op227.proximo.data === '2026-12-11' && op227.proximo.receber && perto(op227.proximo.valor, 120000 + 153309), 'próximo evento: 11/12 · receber (2 lançamentos somados)');
  const mes = W.carteiraOps(db, 'todas', 'mes', H);
  ok(mes.linhas.length === 1 && mes.linhas[0].op === 'OP10' && perto(mes.linhas[0].garantido, 20000), '"concluídas no mês": OP10, com lucro garantido R$ 20 mil (tudo pago)');
}

console.log('\nCaixa do mês:');
{
  const db = banco();
  db.hubExtratos = [{ _id: 'e1', contaId: 'sf', empresa: 'WindGate', mes: '2026-11', saldo: 43000, em: '2026-11-17T10:00:00Z' }];
  db.fin.push(L('', 'Despesa', 12000, '2026-11-25', false, { desc: 'Aluguel' }), L('', 'Despesa', 5000, '2026-11-10', false, { desc: 'Folha vencida' }), L('OP23', 'Receita', 9000, '2026-11-20', false),
    L('', 'Despesa', 50000, '2026-11-21', false, { categoria: 'Transferência' }));
  const c = W.caixaDoMes(db, 'todas', H);
  ok(perto(c.caixa.total, 43000) && c.caixa.temExtrato, 'caixa hoje = último extrato (R$ 43 mil), nunca o caixa pelo sistema');
  ok(perto(c.pagarFixas, 17000) && perto(c.receber, 9000), 'sem operação = fixa (aluguel + folha); transferência SF ↔ JeT fora');
  ok(perto(c.fimMes, 43000 + 9000 - c.pagarOps - 17000), 'fim do mês = caixa + a receber − a pagar operações − a pagar fixas');
  ok(c.minimo === 34000 && c.distorcido && c.vencidos.pagamentos === 1, 'caixa mínimo padrão R$ 34 mil; vencido sem baixa: "pode estar distorcido"');
  ok(c.serie[0].data === H && c.serie[c.serie.length - 1].data === '2026-12-31' && c.semanas.length >= 6, 'linha dia a dia até o fim do mês seguinte, barras por semana');
  ok(c.proximos7.length === 1 && c.proximos7[0].vencimento === '2026-11-20' && c.proximos7.every(l => l.vencimento >= H && l.vencimento <= '2026-11-24'), 'próximos 7 dias: só o que vence de 18 a 24/11, sem transferência (máx. 10 linhas)');
  W.salvarCaixaMinimo(db, 50000, 'Samir');
  ok(W.caixaDoMes(db, 'todas', H).minimo === 50000, 'caixa mínimo configurável');
}

console.log('\nIndicadores:');
{
  const db = banco(), r = W.indicadoresGestao(db, 'todas', H, 5.4);
  ok(r.cards.length === 12 && r.cards.every(c => c.l && c.cor), '12 cartões, cada um com cor');
  ok(r.cards.find(c => c.k === 'abaixo').v === 1, 'operações abaixo do mínimo (OP23)');
  ok(r.graficos.lucroFixas.length === 12 && r.graficos.margemMes.length === 12, 'gráficos de 12 meses');
  ok(r.cards.filter(c => c.v == null).every(c => c.cor === 'neutro'), 'sem dado: valor vazio, sem cor de alerta (nada inventado)');
}

console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
process.exitCode = falhou ? 1 : 0;
