/**
 * Conferência de 18/11/2026 (Parte 1 do prompt do Samir): caixa pelos extratos, mesma conta de resultado em
 * todas as telas, margem s/ receita e alerta de margem só em cotação.
 */
const W = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/comex.js'), require('../public/hub/js/fin-regras.js'));
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const perto = (a, b) => Math.abs(a - b) < 0.01;

console.log('\nCaixa hoje = último extrato de cada conta (item 6):');
{
  const db = {
    hubPainel: {}, settings: {},
    hubExtratos: [
      { _id: 'e1', contaId: 'sf', empresa: 'WindGate', banco: 'Santander', mes: '2026-10', saldo: 90000 },
      { _id: 'e2', contaId: 'sf', empresa: 'WindGate', banco: 'Santander', mes: '2026-11', saldo: 30000, em: '2026-11-17T10:00:00Z' },
      { _id: 'e3', contaId: 'jet', empresa: 'JeT', banco: 'Itaú', mes: '2026-11', saldo: 10000, em: '2026-11-17T11:00:00Z' },
      { _id: 'e4', contaId: 'xp', empresa: 'WindGate', banco: 'XP', mes: '2026-09', saldo: 3000 }],
    fin: [
      { _id: 'r1', tipo: 'Receita', valor: 800000, status: 'Realizado', liquidadoEm: '2026-08-01', vencimento: '2026-08-01' },
      { _id: 'p1', tipo: 'Despesa', valor: 50000, status: 'Previsto', vencimento: '2026-11-10' }]
  };
  const c = W.caixaHoje(db, 'todas', '2026-11-18');
  ok(perto(c.total, 43000) && c.contas.length === 3, 'soma o último extrato de cada conta: 30 + 10 + 3 = R$ 43 mil (nunca "recebido − pago")');
  ok(c.contas.find(x => x.contaId === 'sf').data === '2026-11-17' && c.maisAntigo === '2026-09-30', 'cada conta com a data do extrato; a mais antiga aparece');
  ok(c.distorcido && c.vencidosSemBaixa === 1, 'vencido sem baixa: "pode estar distorcido"');
  ok(perto(W.caixaHoje(db, 'JeT', '2026-11-18').total, 10000), 'filtro JeT');
  ok(!W.caixaHoje({ hubExtratos: [], fin: [] }, 'todas', '2026-11-18').temExtrato, 'sem extrato: sem número inventado');
}

console.log('\nResultado 12 meses pela conta das operações (item 7):');
{
  const db = {
    ops: [{ id: 'OP26', status: 'producao', criadaEm: '2026-09-01' }, { id: 'OP10', status: 'concluida', criadaEm: '2024-01-01' }],
    opStatusHist: [{ op: 'OP26', para: 'contrato', em: '2026-09-02' }],
    fin: [
      { _id: 'a', op: 'OP26', tipo: 'Receita', valor: 500000, vencimento: '2027-02-01', status: 'Previsto' },
      { _id: 'b', op: 'OP26', tipo: 'Despesa', valor: 400000, vencimento: '2026-10-01', status: 'Realizado', liquidadoEm: '2026-10-01' },
      { _id: 'c', op: 'OP10', tipo: 'Receita', valor: 90000, vencimento: '2024-03-01', status: 'Realizado', liquidadoEm: '2024-03-01' },
      { _id: 'f', tipo: 'Despesa', valor: 30000, vencimento: '2026-10-05', status: 'Realizado', liquidadoEm: '2026-10-05', fixo: true }]
  };
  const s = W.saudeFinanceira(db, '2026-11-18', 'todas');
  const rop = W.resultadoPorOp(db, 'todas').find(r => r.op === 'OP26');
  ok(perto(s.lucroOps12, rop.resultado) && perto(s.lucroOps12, 100000), 'lucro das operações = o mesmo número do Resultado por operação (R$ 100 mil)');
  ok(perto(s.resultado12, 70000), 'resultado 12 meses = 100 − 30 de fixas = R$ 70 mil (antes dava negativo: custo de out × receita de fev)');
  ok(s.resultadoCompetencia12 < 0, 'a visão por competência continua disponível, mas não é mais o card');
  ok(perto(rop.margem, 0.2), 'margem s/ receita: 100 ÷ 500 = 20% (s/ custo daria 25%)');
}

console.log('\nAlerta de margem só em cotação (item 7 e Parte 4):');
{
  const mk = st => ({ users: { samir: { perfil: 'diretoria' } }, docs: [], hubCambio: [], quotes: {},
    ops: [{ id: 'OP26.1', status: st, cliente: 'Diagonal', modalidade: 'encomenda', custeio: { previsto: { fob: 120000 } } }],
    fin: [{ _id: 'r', op: 'OP26.1', tipo: 'Receita', valor: 100000, vencimento: '2026-12-01', status: 'Previsto' }] });
  const tem = st => W.excecoes(mk(st), 'samir', '2026-11-18').some(x => x.tipo === 'margem');
  ok(tem('cotacao'), 'em cotação, margem abaixo de 10% aparece (ainda dá para decidir)');
  ok(!tem('producao'), 'depois do contrato, sai da Torre');
}

console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
process.exitCode = falhou ? 1 : 0;
