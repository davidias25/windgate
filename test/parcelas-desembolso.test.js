/**
 * Cronograma de desembolso com 1 a 8 parcelas: lista própria, cobertura por etapa ou acumulada, reajuste cambial,
 * Financeiro com um recebível por parcela, proposta, contrato e câmbio. Cotação antiga (3 etapas) igual a antes.
 * Números do caso da OP228 (4 × 25%); os demais, inventados.
 */
const W = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/comex.js'), require('../public/hub/js/cotacao-regras.js'), require('../public/hub/js/cambio-regras.js'));
const K = require('../public/hub/js/contrato-regras.js');
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const igual = (a, b) => Math.abs(a - b) < 0.006;

/* R mínimo com as saídas da OP228: sinal 30% do FOB, saldo 70%, chegada = custo − FOB. */
const FOB = 173409.7333, CHEGADA = 186685.65;
const R228 = (terrestre) => ({ fob: FOB, custoReal: FOB + CHEGADA, preco: 435424, st: 0, impostos: 120000, resultante: 0, comp: { freteInt: 20000, seguro: 0, portuarias: CHEGADA - 140000 - (terrestre || 0), honorarios: 0, terrestre: terrestre || 0 } });
const q228 = () => ({ id: 'q228', fields: { fabSinal: '30' }, parcelas: [
  { nome: 'Sinal', vinculo: 'sinal', valor: 107920, gatilho: 'na assinatura' },
  { nome: 'Produção concluída', vinculo: 'saldo', valor: 108496 },
  { nome: 'Chegada ao porto', vinculo: 'chegada', valor: 109264, gatilho: 'em até 72h após o aviso de presença de carga' },
  { nome: 'Entrega na obra', vinculo: 'nenhuma', valor: 109744, diasAposAnterior: 20, ouDepois: true, gatilho: 'na entrega' }] });

console.log('\nCotação antiga (3 etapas):');
{
  const q = { fields: { desR1: '100', desR2: '200', desR3: '300' } };
  const ps = W.parcelasDe(q);
  ok(ps.length === 3 && ps.map(p => p.nome).join() === 'Assinatura,Produto pronto,Chegada ao porto' && ps.map(p => p.vinculo).join() === 'sinal,saldo,chegada' && ps.map(p => p.valor).join() === '100,200,300', 'lida como as 3 etapas de sempre, com os mesmos valores');
  ok(!q.parcelas && !W.temListaPropria(q), 'ler não grava nada na cotação');
  const g = { fields: {} }; W.definirParcelas(g, ps.concat([{ nome: 'Entrega na obra', valor: 50 }]));
  ok(g.parcelas.length === 4 && g.fields.desR1 === '100.00' && g.fields.desR2 === '200.00' && g.fields.desR3 === '350.00', 'ao gravar a lista nova, desR1..desR3 ficam espelhados (o resto somado na 3ª) para o sistema antigo');
  const velho = { fields: { desR1: '10', desR2: '20', desR3: '30' }, parcelas: [{ nome: 'A', valor: 1 }, { nome: 'B', valor: 2 }, { nome: 'C', valor: 3 }] };
  ok(W.parcelasDe(velho).map(p => p.valor).join() === '10,20,30', 'mudou no sistema antigo (3 parcelas): a lista acompanha');
  ok(W.parcelasDe({ clienteId: 'c1', fields: { desR1: '5' }, parcelas: [{ valor: 9 }] })[0].valor === 5, 'cliente de cotação com vários clientes: continua com as 3 do cliente');
}

console.log('\nLista de parcelas:');
{
  const q = { fields: {} };
  W.definirParcelas(q, Array.from({ length: 10 }, (_, i) => ({ nome: 'P' + i, valor: 1 })));
  ok(q.parcelas.length === 8, 'no máximo 8');
  W.definirParcelas(q, []);
  ok(q.parcelas.length === 1, 'no mínimo 1');
  const p = W.parcelasDe({ parcelas: [{ nome: 'X', valor: '1.234,5'.replace('.', ''), vinculo: 'qualquer', reajuste: '576', reajusteObs: 'referente à 1ª remessa · PTAX 5,56', diasAposAnterior: '20' }] })[0];
  ok(p.valor === 1234.5 && p.vinculo === 'nenhuma' && p.reajuste === 576 && p.diasAposAnterior === 20, 'valor com vírgula, vínculo desconhecido vira "nenhuma", reajuste e prazo relativo');
}

console.log('\nValor digitado:');
{
  const v = x => W.parcelasDe({ parcelas: [{ valor: x }] })[0].valor;
  ok(v('109.264,00') === 109264 && v('109264,00') === 109264 && v('109264.00') === 109264 && v('109.264') === 109264 && v('R$ 1.234.567,89') === 1234567.89, '"109.264,00", "109264,00", "109264.00" e "109.264" valem R$ 109.264');
  ok(v('108486.5') === 108486.5 && v('25,5') === 25.5 && v(109744) === 109744 && v('') === 0, 'ponto decimal, vírgula decimal, número e vazio');
}

console.log('\nOP228 — saídas e cobertura:');
{
  const q = q228(), R = R228(0), c = W.coberturaDesembolso(q, R);
  ok(c.linhas.map(l => l.saida.toFixed(2)).join(' / ') === '52022.92 / 121386.81 / 186685.65 / 0.00', 'saídas: sinal, saldo, chegada e zero na 4ª');
  ok(igual(c.base, 435424) && W.desemErros(q, R).every(e => !/soma/.test(e)), 'as 4 parcelas fecham os R$ 435.424');
  ok(c.modo === 'etapa' && !c.linhas[1].cobre && W.desemErros(q, R).some(e => /^Parcela 2 .*MENOR que o saldo da fábrica/.test(e)), 'por etapa (padrão): a 2ª não cobre o saldo da fábrica — a trava de hoje');
  ok(!W.mudarCobertura(q, 'acumulada', 'Davi', false).ok && W.modoCobertura(q) === 'etapa', 'só o Samir troca a regra');
  const r = W.mudarCobertura(q, 'acumulada', 'Samir', true, '2026-11-11T10:00:00Z');
  ok(r.ok && q.coberturaDesembolso === 'acumulada' && q.coberturaHist[0].por === 'Samir' && q.coberturaHist[0].em === '2026-11-11T10:00:00Z' && q.coberturaHist[0].de === 'etapa', 'a troca fica registrada: quem, quando, de e para');
  const a = W.coberturaDesembolso(q, R);
  ok(a.linhas.map(l => l.saldoAcum).join(' / ') === '55897.08 / 43006.27 / -34415.38 / 75328.62', 'saldo acumulado por parcela: 55.897,08 / 43.006,27 / −34.415,38 / 75.328,62');
  ok(!a.linhas[2].cobre && W.desemErros(q, R).some(e => /Parcela 3 .*saldo acumulado fica negativo \(-R\$\s?34\.415,38\)/.test(e)), 'com esses números, a 3ª fica R$ 34.415,38 negativa: a regra acumulada também trava');
  /* A entrega na obra (frete nacional) ligada à 4ª tira esse valor da 3ª. */
  const q2 = q228(); q2.coberturaDesembolso = 'acumulada'; q2.parcelas[3].vinculo = 'entrega';
  const R2 = R228(40000), a2 = W.coberturaDesembolso(q2, R2);
  ok(igual(a2.linhas[2].saida, CHEGADA - 40000) && igual(a2.linhas[3].saida, 40000), 'parcela de entrega: o frete nacional sai da chegada e vai para a 4ª');
  ok(a2.linhas.every(l => l.cobre) && W.desemErros(q2, R2).length === 0, 'com R$ 40.000 de entrega na 4ª, o saldo acumulado nunca fica negativo e a trava some');
  const solto = q228(); solto.parcelas[2].vinculo = 'nenhuma';
  ok(W.desemErros(solto, R).some(e => /custos de chegada .* não está ligada a nenhuma parcela/.test(e)), 'saída sem parcela ligada é erro');
}

console.log('\nReajuste cambial por parcela:');
{
  const q = q228(); q.parcelas[1].reajuste = 576; q.parcelas[1].reajusteObs = 'referente à 1ª remessa · PTAX 5,56';
  const c = W.coberturaDesembolso(q, R228(0));
  ok(igual(c.base, 435424) && igual(c.reajustes, 576) && igual(c.total, 436000), 'total = base + reajustes, separados');
  ok(W.desemErros(q, R228(0)).every(e => !/soma/.test(e)), 'o reajuste não entra na conferência da soma com o preço');
  ok(igual(c.linhas[1].recebe, 108496 + 576), 'o recebimento da parcela leva o reajuste');
}

console.log('\nVencimentos:');
{
  const ps = W.parcelasDe({ parcelas: [{ valor: 1 }, { valor: 1, data: '2027-01-15' }, { valor: 1 }, { valor: 1, diasAposAnterior: 20 }, { valor: 1 }] });
  ok(W.vencimentosDasParcelas(ps, '2026-11-01').join() === '2026-11-06,2027-01-15,2027-02-04,2027-02-24,2027-03-16', 'padrão 5/35/95 dias, data própria, +20 após a anterior e +20 dali em diante');
  ok(W.prazoDaParcela(W.parcelasDe(q228())[3]) === '20 dias após a parcela anterior ou na entrega, o que ocorrer depois', 'prazo relativo em texto: "o que ocorrer depois"');
}

console.log('\nFinanceiro:');
{
  const q = q228(); q.fields.opNum = 'op228'; q.parcelas[1].reajuste = 576;
  const r = W.operacaoDaCotacao({ ops: [], fin: [] }, q, R228(0), 'Samir', '2026-11-11');
  const rec = r.lancamentos.filter(l => l.tipo === 'Receita');
  ok(rec.length === 4, 'quatro recebíveis, um por parcela');
  ok(rec[3].desc === '4º recebimento do cliente — parcela 4 · Entrega na obra' && igual(rec[3].valor, 109744) && igual(rec[2].valor, 109264), 'com o nome da etapa e o valor de cada uma (R$ 109.264 e R$ 109.744, não R$ 219.008 juntos)');
  ok(igual(rec[1].valor, 108496 + 576), 'valor = base + reajuste');
  ok(rec[3].vencimento === W.vencimentosDasParcelas(W.parcelasDe(q), '2026-11-11')[3] && rec[3].vencimento === '2027-03-06', 'a 4ª vence 20 dias depois da 3ª');
  ok(r.lancamentos.filter(l => l.tipo === 'Despesa' && /^1º|^2º/.test(l.desc)).length === 2 && r.lancamentos.some(l => /^3º pagamento/.test(l.desc)), 'as despesas continuam as de sempre');
  const de = r.lancamentos.filter(l => l.tipo === 'Despesa');
  ok(de.every(l => r.lancamentos.indexOf(l) > 0), 'nenhuma despesa antes do primeiro recebimento');
  const fin = r.lancamentos.map(l => Object.assign({}, l, { op: 'OP228' }));
  const r2 = W.operacaoDaCotacao({ ops: [{ id: 'OP228' }], fin }, q, R228(0), 'Samir', '2026-11-11');
  ok(r2.lancamentos.length === 0 && r2.jaLancado, 'criar de novo não duplica');
}

console.log('\nProposta, contrato e câmbio:');
{
  const q = q228(); q.parcelas[1].reajuste = 576; q.parcelas[1].reajusteObs = 'referente à 1ª remessa';
  const ps = W.resumoProposta(q, R228(0), '2026-11-11').parcelas;
  ok(ps.length === 4 && ps[3].nome === 'Entrega na obra' && Math.round(ps[3].pct) === 25 && ps[3].prazo.startsWith('20 dias') && ps[2].gatilho.startsWith('em até 72h'), 'a proposta leva as 4, com nome, %, gatilho e prazo');
  ok(ps.findIndex(p => p.chegada) === 2 && ps[1].reajuste === 576, 'a da chegada (DIFAL e ETA) e o reajuste vão junto');
  q.cambioProposta = { data: '2026-11-01', referencia: 5.5, piso: 5.445, teto: 5.555, por010: [0, 1200, 3400, 0] };
  const t = W.tabelaCambio(q);
  ok(t.parcelas.length === 4 && t.parcelas[0].fixa && !t.parcelas[1].fixa && !t.parcelas[2].fixa && t.parcelas[3].fixa && t.parcelas[3].regra === 'Fixa', 'tabela de câmbio: uma linha por parcela; a 4ª, sem dólar, é fixa');
  const tx = W.textoCambio(t);
  ok(tx.linhas.length === 4 && /as parcelas 1ª, 4ª são fixas; a 2ª usa o dia útil anterior ao vencimento; a 3ª usa o dia útil anterior ao registro da DI/.test(tx.regra), 'texto da regra cita as 4 parcelas');
  const velha = { fields: { desR1: '1', desR2: '2', desR3: '3' }, cambioProposta: { referencia: 5.5, piso: 5.445, teto: 5.555, por010: [0, 10, 20] } };
  ok(/a 1ª parcela é fixa; a 2ª usa o dia útil anterior ao vencimento; a 3ª, o dia útil anterior ao registro da DI/.test(W.textoCambio(W.tabelaCambio(velha)).regra), 'cotação de 3 parcelas: o texto de sempre');
  /* Contrato: a cláusula de pagamento lista as 4. */
  q._RCliente = R228(0);
  const db = { ops: [{ id: 'OP228', cliente: 'Cliente', quoteId: 'q228' }], quotes: { q228: q }, fin: [], crm: [], hubPainel: {} };
  const dados = K.dadosDoContrato(db, 'OP228');
  if (dados) {
    ok(dados.parcelas.length === 4 && dados.parcelas[3].nome === 'Entrega na obra', 'contrato: as 4 parcelas, com o nome');
    const bl = K.preencherModelo({ blocos: [{ t: 'cronograma', pct: true, fatos: ['a', 'b', 'c'] }] }, dados).blocos || [];
    const tab = JSON.stringify(bl);
    ok(/Entrega na obra/.test(tab) && /20 dias após a parcela anterior/.test(tab) && /4ª/.test(tab), 'cronograma do contrato: etapa, gatilho e prazo de cada parcela');
  } else ok(false, 'dadosDoContrato disponível');
}

console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
process.exitCode = falhou ? 1 : 0;
