/**
 * Câmbio na proposta, no contrato e nas parcelas. O exemplo principal é o da especificação:
 * PTAX 5,40, referência 5,45, faixa 5,3955 a 5,5045, R$ 800 por R$ 0,10.
 */
process.env.SUPABASE_DISABLED = '1';
const W = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/comex.js'), require('../public/hub/js/cotacao-regras.js'), require('../public/hub/js/cambio-regras.js'));
const cambio = require('../src/services/cambio.service');
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const perto = (a, b, e) => Math.abs(a - b) <= (e == null ? 0.005 : e);

console.log('\nFaixa e ajuste:');
const ref = W.referenciaDaProposta(5.40);
ok(ref.referencia === 5.45 && ref.piso === 5.3955 && ref.teto === 5.5045, 'PTAX 5,40: referência 5,45 e faixa de 5,3955 a 5,5045');
{
  const alta = W.ajusteDaParcela(ref, 800, 5.60);
  ok(!alta.dentro && perto(alta.variacao, 0.15) && perto(alta.fracoes, 1.5) && alta.ajuste === 1200, 'PTAX 5,60: alta de 0,15 = 1,5 fração × R$ 800 = +R$ 1.200 (repasse de 100%)');
  const queda = W.ajusteDaParcela(ref, 800, 5.30);
  ok(!queda.dentro && perto(queda.fracoes, 1.5) && queda.ajuste === -840, 'PTAX 5,30: queda de 0,15 = 1,5 × R$ 800 × 70% = −R$ 840');
  ok(W.ajusteDaParcela(ref, 800, 5.48).dentro && W.ajusteDaParcela(ref, 800, 5.48).ajuste === 0, 'PTAX 5,48: dentro da faixa, sem ajuste');
  ok(W.ajusteDaParcela(ref, 800, 5.5045).dentro && W.ajusteDaParcela(ref, 800, 5.3955).dentro, 'os limites da faixa ainda estão dentro');
  // Saiu da faixa por pouco: 5,5046 − 5,45 = 0,0546 → 0,546 fração × 800 = 436,80. Ajuste integral desde a referência.
  ok(W.ajusteDaParcela(ref, 800, 5.5046).ajuste === 436.8, 'fora da faixa por pouco: ajuste integral desde a referência, R$ 436,80');
  // 5,51 − 5,45 = 0,06 → 0,6 fração × 800 = 480.
  ok(W.ajusteDaParcela(ref, 800, 5.51).ajuste === 480, 'fração de R$ 0,10: 0,06 de alta = 0,6 fração = R$ 480');
  ok(W.ajusteDaParcela(ref, 800, 0) === null && W.referenciaDaProposta(0) === null, 'sem PTAX, nada é calculado');
}

console.log('\nDia útil e datas da PTAX:');
{
  ok(W.diaUtilAnterior('2026-11-09') === '2026-11-06', 'segunda-feira: vale a sexta anterior');
  ok(W.diaUtilAnterior('2026-11-10') === '2026-11-09', 'terça-feira: vale a segunda');
  ok(W.diaUtilAnterior('2026-11-03') === '2026-10-30', 'depois do feriado de Finados (2/11, segunda): a sexta 30/10');
  ok(W.diaUtilAnterior('2027-02-10') === '2027-02-05', 'quarta de cinzas de 2027: pula o Carnaval e o fim de semana');
  ok(!W.ehDiaUtil('2026-12-25') && !W.ehDiaUtil('2026-11-07') && W.ehDiaUtil('2026-11-06'), 'Natal e sábado não são dias úteis');
  ok(W.datasDaParcela(1, { vencimento: '2026-11-10', hoje: '2026-12-01' }).fixa, '1ª parcela: sempre fixa');
  ok(W.datasDaParcela(2, { vencimento: '2026-11-10', hoje: '2026-11-05' }).datas.join() === '2026-11-09', '2ª parcela: dia útil anterior ao vencimento');
  ok(W.datasDaParcela(3, { vencimento: '2026-11-10', registroDI: '2026-11-09', hoje: '2026-11-05' }).datas.join() === '2026-11-06', '3ª parcela: dia útil anterior ao registro da DI');
  ok(/registro da DI/.test(W.datasDaParcela(3, { vencimento: '2026-11-10', hoje: '2026-11-05' }).pendente), '3ª parcela sem DI registrada: fica pendente');
  const at = W.datasDaParcela(2, { vencimento: '2026-11-10', hoje: '2026-11-20' });
  ok(at.atraso && at.datas.join() === '2026-11-09,2026-11-19', 'em atraso: a data da parcela e o dia útil anterior ao pagamento');
  const v = W.ptaxQueVale(at.datas, { '2026-11-09': 5.40, '2026-11-19': 5.62 });
  ok(v.ptax === 5.62 && v.data === '2026-11-19', 'em atraso, com o dólar subindo: vale a maior PTAX');
  ok(W.ptaxQueVale(at.datas, { '2026-11-09': 5.70, '2026-11-19': 5.62 }).ptax === 5.70, 'em atraso, com o dólar caindo: continua valendo a maior');
  ok(W.ptaxQueVale(at.datas, { '2026-11-09': 5.70 }) === null, 'falta uma PTAX: não calcula');
}

const cot = () => ({ id: 'q1', status: 'ok', fields: Object.assign({}, W.PADRAO, { opNum: 'OP70', cliente: 'Cliente', txDesp: '5.50', txFrete: '5.61', pctInv: '100', freteUSD: '3000', seguro: '500', siscomex: '416.46', honorarios: '1630', fabSinal: '30', margemPct: '25' }),
  items: [Object.assign(W.ITEM_PADRAO(), { d: 'Item', q: 100, u: 200, p: 10, ii: 14, ipi: 5 })], exps: [] });
console.log('\nValor por R$ 0,10, do motor:');
{
  const q = cot(), R = W.calcular(q); Object.assign(q.fields, W.desemSugerir(q, R));
  const por = W.valoresPor010(q);
  // FOB US$ 20.000: R$ 0,10 a mais são R$ 2.000. Sinal 30% = R$ 600; saldo 70% = R$ 1.400.
  ok(perto(por.custo[0], 600) && perto(por.custo[1], 1400), 'FOB de US$ 20.000: R$ 600 no sinal e R$ 1.400 no saldo');
  ok(por.custo[2] > 0, 'a 3ª parcela também muda com o dólar (frete e impostos)');
  ok(por.cliente[0] === 0 && por.cliente[1] === por.custo[1], '1ª parcela é fixa para o cliente: valor 0 na tabela');
  const s = W.simulacaoCambio(q, 5.40);
  ok(s.cenarios.length === 3 && s.cenarios[0].delta === -0.2 && s.cenarios[2].delta === 0.25, 'painel com os cenários −0,20, 0 e +0,25');
  const [, meio, alta] = s.cenarios;
  ok(meio.dentro && meio.parcelas.every((p, i) => perto(p.preco, +[q.fields.desR1, q.fields.desR2, q.fields.desR3][i])), 'na referência: as parcelas não mudam');
  ok(perto(alta.parcelas[1].ajuste, 2.5 * por.cliente[1]), 'alta de 0,25: 2,5 frações na 2ª parcela');
  ok(alta.parcelas[0].ajuste === 0, 'a 1ª parcela não é ajustada em nenhum cenário');
  ok(s.cenarios.every(c => c.parcelas.every(p => perto(p.lucro, p.preco - p.custo))), 'lucro = preço − custo, por parcela');
  ok(perto(s.cenarios[0].parcelas[1].ajuste, -2 * por.cliente[1] * 0.7), 'queda de 0,20: 2 frações × 70%');
}

console.log('\nProposta e contrato com os mesmos números:');
{
  const q = cot(), R = W.calcular(q); Object.assign(q.fields, W.desemSugerir(q, R));
  ok(W.tabelaCambio(q) === null, 'sem aprovação, não há tabela');
  q.cambioProposta = W.congelarCambio(q, 5.40, '2026-11-06');
  const t = W.tabelaCambio(q), tx = W.textoCambio(t);
  ok(t.referencia === 5.45 && t.parcelas.length === 3 && t.parcelas[0].fixa && t.parcelas[0].por010 === 0 && t.parcelas[1].por010 > 0, 'referência e tabela de cada parcela');
  ok(tx.linhas.length === 3 && tx.linhas[0][1] === 'Fixa' && tx.linhas[0][2] === 'Fixa' && /5,4500/.test(tx.referencia) && /venda/.test(tx.regra), 'texto com a tabela "R$ por R$ 0,10"');
  const tudo = JSON.stringify(tx);
  ok(!/5,5000|5,6100|spread|remet|f[aá]brica|margem/i.test(tudo), 'não mostra dólar de custo, spread, remessa à fábrica nem margem');
  const editada = JSON.parse(JSON.stringify(q)); editada.fields.txDesp = '6.00';
  ok(JSON.stringify(W.tabelaCambio(editada).parcelas) === JSON.stringify(t.parcelas), 'a tabela congelada na aprovação não muda se a taxa de custo for editada');
}

console.log('\nFinanceiro: calcula para conferência e só grava com a confirmação:');
{
  const q = cot(), R = W.calcular(q); Object.assign(q.fields, W.desemSugerir(q, R)); q.cambioProposta = W.congelarCambio(q, 5.40, '2026-11-06');
  const op = { _id: 'o', id: 'OP70', status: 'producao', quoteId: 'q1' };
  const lanc = (id, d, valor, venc, st) => ({ _id: id, op: 'OP70', tipo: 'Receita', desc: d, valor, vencimento: venc, status: st || 'Previsto' });
  const db = { ops: [op], quotes: { q1: q }, fin: [lanc('a', '1º recebimento do cliente — parcela 1', 1000, '2026-11-10'), lanc('b', '2º recebimento do cliente — parcela 2', 50000, '2026-11-10'), lanc('c', '3º recebimento do cliente — parcela 3', 30000, '2026-12-20'), lanc('d', '2º recebimento do cliente — parcela 2', 10, '2026-11-10', 'Realizado')] };
  const lista = W.parcelasComCambio(db, '2026-11-09');
  ok(lista.length === 2 && lista.every(p => p.n >= 2), 'lista só a 2ª e a 3ª em aberto: a 1ª é fixa, e a recebida fica de fora');
  ok(/registro da DI/.test(lista.find(p => p.n === 3).pendente), '3ª parcela aguarda o registro da DI');
  const b = db.fin[1], por = W.valoresPor010(q).cliente[1];
  const c = W.calcularAjusteLancamento(db, b, { '2026-11-09': 5.60 }, '2026-11-09');
  ok(c.ptax === 5.60 && perto(c.ajuste, 1.5 * por) && perto(c.corrigido, 50000 + 1.5 * por) && !c.dentro, 'calcula o valor corrigido na alta');
  ok(b.valor === 50000 && !b.ajusteCambial, 'calcular não altera a parcela');
  const dentro = W.calcularAjusteLancamento(db, b, { '2026-11-09': 5.48 }, '2026-11-09');
  ok(dentro.dentro && dentro.corrigido === 50000, 'dentro da faixa: valor igual');
  ok(W.calcularAjusteLancamento(db, b, {}, '2026-11-09').erro, 'sem a PTAX da data: não calcula');
  ok(W.calcularAjusteLancamento(db, db.fin[0], { '2026-11-09': 5.60 }, '2026-11-09').erro, '1ª parcela: sem correção');
  const conf = W.confirmarAjusteCambial(b, c, 'Davi', '2026-11-09T12:00:00Z');
  ok(conf.ok && perto(b.valor, c.corrigido) && b.ajusteCambial.por === 'Davi' && b.ajusteCambial.valorOriginal === 50000 && b.alteracoes.length === 1, 'confirmar grava o valor, quem confirmou e o valor original');
  ok(!W.confirmarAjusteCambial(b, c, 'Davi').ok, 'não ajusta duas vezes');
  ok(!W.parcelasComCambio(db, '2026-11-09').some(p => p.l === b), 'depois de ajustada, sai da lista');
  ok(!W.confirmarAjusteCambial(db.fin[3], c, 'Davi').ok, 'parcela já recebida não é ajustada');
  const q2 = JSON.parse(JSON.stringify(q)); q2.cambioProposta = null;
  ok(W.parcelasComCambio({ ops: [op], quotes: { q1: q2 }, fin: [lanc('x', '2º recebimento do cliente — parcela 2', 1, '2026-11-10')] }, '2026-11-09').length === 0, 'cotação sem referência (antiga): nenhuma correção');
  const atr = lanc('y', '2º recebimento do cliente — parcela 2', 50000, '2026-11-10');
  const c2 = W.calcularAjusteLancamento({ ops: [op], quotes: { q1: q }, fin: [atr] }, atr, { '2026-11-09': 5.40, '2026-11-19': 5.70 }, '2026-11-20');
  ok(c2.atraso && c2.ptax === 5.70, 'cliente em atraso: o cálculo usa a maior PTAX');
  const dbDi = { ops: [Object.assign({}, op, { dataRegistroDI: '2026-12-15' })], quotes: { q1: q }, fin: [lanc('c', '3º recebimento do cliente — parcela 3', 30000, '2026-12-20')] };
  ok(W.parcelasComCambio(dbDi, '2026-12-16')[0].datas.join() === '2026-12-14', '3ª parcela com a DI registrada: dia útil anterior ao registro');
}

(async () => {
  console.log('\nPTAX de uma data no Banco Central:');
  const urls = []; const fetchFalso = async u => { urls.push(u); return { ok: true, json: async () => ({ value: /11-07-2026/.test(u) ? [] : [{ cotacaoCompra: 5.4012, cotacaoVenda: 5.4018, dataHoraCotacao: '2026-11-06 13:04:00' }] }) }; };
  const a = await cambio.ptaxDoDia('2026-11-06', fetchFalso);
  ok(a.compra === 5.4012 && a.venda === 5.4018 && a.data === '2026-11-06', 'traz compra e venda da data');
  ok(/dataInicial='11-06-2026'/.test(urls[0]) && /dataFinalCotacao='11-06-2026'/.test(urls[0]), 'consulta só aquele dia');
  const n = urls.length; await cambio.ptaxDoDia('2026-11-06', fetchFalso);
  ok(urls.length === n, 'cotação de data passada fica guardada: não consulta de novo');
  ok(await cambio.ptaxDoDia('2026-11-07', fetchFalso) === null, 'dia sem PTAX: devolve vazio');
  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exit(falhou ? 1 : 0);
})();
