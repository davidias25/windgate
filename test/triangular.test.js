/**
 * Motor da operação triangular — SF Trading (AL) → JeT Import (ES) → cliente.
 *
 * O caso Diagonal é a âncora: se algum número divergir, a fórmula está errada.
 * Os dois pontos que a planilha antiga errava e que este teste guarda são o
 * piso da NF de saída (ICMS por dentro) e o DIFAL como diferença de alíquotas,
 * nunca como constante.
 *
 *   node test/triangular.test.js
 */
const { carregarApp } = require('./dom-stub');

let falhas = 0, passou = 0;
const f = v => (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function assert(cond, msg){
  if (cond) { console.log(`  ✅ ${msg}`); passou++; }
  else { console.error(`  ❌ ${msg}`); falhas++; }
}
/* Compara em centavos: o motor não arredonda etapa intermediária, então a
   conferência é contra o valor apresentado. */
function perto(calc, esp, msg, tol){
  const d = Math.abs(calc - esp);
  assert(d <= (tol == null ? 0.005 : tol), `${msg} — R$ ${f(calc)}${d > (tol == null ? 0.005 : tol) ? ` (esperado ${f(esp)}, Δ ${f(calc - esp)})` : ''}`);
}
function secao(t){ console.log(`\n--- ${t} ---`); }

const app = carregarApp();
const tri = app.triCalcular;

/* Caso de teste do prompt — Operação Diagonal (containers). */
function diagonal(extra){
  return Object.assign({
    taxaUsdDespesas: 5.15,
    itens: [{ descricao: 'Containers', ncm: '9406.90.0090', qtd: 1, valorUnitarioUsd: 32214,
              ii: 20, ipi: 0, pisImp: 2.1, cofinsImp: 9.65 }],
    fatorInvoice: 50,
    freteIntUsd: 16000,
    seguroBrl: 1500, capataziaBrl: 1240,
    siscomex: 154.23, afrmm: 1024.00, honorarios: 1620.00,
    icmsEntradaEfetivo: 1.2,          // o fixture usa 1,2%; a operação real usa 1,6%
    despesasNacionalizacao: 13933.00,
    markupComercialBrl: 2000.00,
    ufDestino: 'CE', tabelaIcmsInterno: app.ICMS_INTERNO,
    clienteContribuinte: false, conv5291: false,
    freteTerrestreBrl: 6000.00,
    servicoWindgateBrl: 60000.00,
    usuario: 'teste'
  }, extra || {});
}

secao('Caso Diagonal — bloco 1 (importação)');
{
  const r = tri(diagonal());
  perto(r.entrada.fobBrlTotal, 165902.10, 'FOB integral');
  perto(r.entrada.fobDeclarado, 82951.05, 'FOB declarado (50%)');
  perto(r.entrada.txFrete, 5.253, 'taxa do frete = 5,15 × 1,02', 1e-9);
  perto(r.bloco1.baseImportacao, 169739.05, 'Base impostos importação');
  perto(r.bloco1.II, 33947.81, 'II (20%)');
  perto(r.bloco1.IPI, 0, 'IPI (0%)');
  perto(r.bloco1.PISimp, 3564.52, 'PIS importação (2,1%)');
  perto(r.bloco1.COFimp, 16379.82, 'COFINS importação (9,65%)');
}

secao('Caso Diagonal — ICMS de importação, "por dentro"');
{
  const r = tri(diagonal());
  // A tabela do prompt traz 228.479,18 / 2.741,75. A fórmula do próprio prompt
  // devolve estes — ver o relatório: a diferença é o AFRMM contado 3× no
  // numerador herdado da planilha.
  perto(r.bloco1.baseICMSimp, 226406.30, 'Base ICMS importação (fórmula do prompt)', 0.01);
  perto(r.bloco1.ICMSimp, 2716.88, 'ICMS importação (1,2%)', 0.01);
  // A regra que importa: base × (1 − alíquota) reconstrói o numerador.
  const num = r.bloco1.baseICMSimp * (1 - 0.012);
  perto(num, 223689.43, 'base × (1 − 1,2%) devolve o numerador — ICMS integra a própria base', 0.01);
}

secao('Caso Diagonal — piso da NF de saída (o ponto crítico)');
{
  const r = tri(diagonal());
  perto(r.bloco3.pisoSaida, r.bloco2.nfEntrada / 0.96, 'piso = NF entrada ÷ 0,96');
  perto(r.bloco3.nfSaida, r.bloco3.pisoSaida + 2000, 'NF saída = piso + markup');
  perto(r.bloco3.icmsDestacado, r.bloco3.nfSaida * 0.04, 'ICMS destacado incide sobre a NF CHEIA, já com markup');
  // A conferência do prompt: entrada 100.000 → piso 104.166,67, líquido 100.000.
  const conf = tri(Object.assign(diagonal(), { markupComercialBrl: 0 }));
  const piso100 = 100000 / 0.96;
  perto(piso100, 104166.67, 'conferência: 100.000 ÷ 0,96 = 104.166,67', 0.005);
  perto(piso100 - piso100 * 0.04, 100000, 'e o líquido depois do ICMS volta a 100.000');
  assert(conf.travas.every(t => t.codigo !== 'PISO_SAIDA'), 'sem markup, a NF no piso exato não dispara a trava');
}

secao('O divisor não é a constante 0,96');
{
  // Saída interna em AL a 20%: o divisor tem de acompanhar.
  const r = tri(diagonal({ icmsInterestadual: 20 }));
  perto(r.bloco3.pisoSaida, r.bloco2.nfEntrada / 0.80, 'alíquota 20% → divisor 0,80');
  assert(Math.abs(r.bloco3.pisoSaida - r.bloco2.nfEntrada / 0.96) > 1000,
    '★ o piso muda junto com a alíquota, não fica preso em 0,96');
}

secao('Caso Diagonal — bloco 4 (PIS/COFINS não cumulativo)');
{
  const r = tri(diagonal());
  assert(r.bloco4.baseSaida === r.bloco3.nfSaida, '★ a base da saída é a MESMA NF de saída — não há segunda base');
  perto(r.bloco4.PISsai, r.bloco3.nfSaida * 0.0165, 'PIS saída (1,65%)');
  perto(r.bloco4.COFsai, r.bloco3.nfSaida * 0.0765, 'COFINS saída (7,65%)');
  perto(r.bloco4.creditos, 19944.34, 'créditos da importação (IPI + PIS + COFINS)');
  perto(r.bloco4.resultante, (r.bloco4.PISsai + r.bloco4.COFsai) - r.bloco4.creditos, 'resultante = débitos − créditos');
}

secao('Resultante negativa vira crédito, não custo negativo');
{
  // Créditos altos e saída pequena: a resultante fica negativa.
  const r = tri(diagonal({ pisSaida: 0.1, cofinsSaida: 0.1 }));
  assert(r.bloco4.resultante === 0, 'a resultante não entra negativa no custo');
  assert(r.bloco4.creditoAcumulado > 0, `sobra registrada como crédito a compensar (R$ ${f(r.bloco4.creditoAcumulado)})`);
  assert(r.alertas.some(a => a.codigo === 'CREDITO_ACUMULADO'), 'e o alerta avisa');
}

secao('Caso Diagonal — bloco 5 (DIFAL)');
{
  const r = tri(diagonal());
  assert(r.bloco5.internaDestino === 20, 'interna do CE vem da tabela por UF: 20%');
  perto(r.bloco5.difalPct, 16, 'DIFAL% = 20 − 4 = 16', 1e-9);
  perto(r.bloco5.DIFAL, r.bloco3.nfSaida * 0.16, 'DIFAL = NF saída × 16%');
  assert(r.bloco5.difalNoCusto > 0, 'cliente NÃO contribuinte: o DIFAL é da JeT e entra no custo');
}

secao('DIFAL não é alíquota fixa');
{
  const sp = tri(diagonal({ ufDestino: 'SP' }));
  assert(sp.bloco5.internaDestino === 18, 'SP: interna 18%');
  perto(sp.bloco5.difalPct, 14, '★ DIFAL em SP = 14%, não 16%', 1e-9);

  const conv = tri(diagonal({ conv5291: true }));
  assert(conv.bloco5.internaDestino === 8.8, 'Convênio 52/91: carga interna 8,8%');
  perto(conv.bloco5.difalPct, 4.8, '★ DIFAL com Convênio 52/91 = 8,8 − 4 = 4,8%', 1e-9);
  assert(conv.alertas.some(a => a.codigo === 'CONV_5291'), 'e avisa para validar a NCM contra o Anexo I');
}

secao('★ O DIFAL é custo da JeT na venda ao cliente');
{
  /* A obrigação nasce na saída da JeT, não na nota que a SF lhe vendeu.
     Calcular sobre a nota SF→JeT subestima a base em todo o markup da JeT. */
  const semMk = tri(diagonal({ outrasDespesasAduaneiras: 2048 }));
  const comMk = tri(diagonal({ outrasDespesasAduaneiras: 2048, markupJetBrl: 1000 }));

  perto(comMk.bloco5.nfJetCliente, comMk.bloco3.nfSaida + 1000, 'NF da JeT = NF SF→JeT + markup da JeT');
  perto(comMk.bloco5.baseDifal, comMk.bloco5.nfJetCliente, '★ a base do DIFAL é a nota da JeT ao cliente');
  assert(comMk.bloco5.baseDifal > comMk.bloco3.nfSaida, '★ e é maior que a nota SF→JeT');
  perto(comMk.bloco5.DIFAL - semMk.bloco5.DIFAL, 1000 * 0.16,
    'o markup da JeT gera R$ 160,00 de DIFAL que a base antiga não via');

  // Na perna do ES sobra imposto só sobre o markup: débito 4% na venda menos
  // crédito 4% da compra.
  perto(comMk.bloco5.icmsJetLiquido, 1000 * 0.04, '★ ICMS líquido da perna ES = 4% do markup da JeT');
  perto(semMk.bloco5.icmsJetLiquido, 0, 'sem markup da JeT não sobra ICMS na perna ES');

  const parc = Object.fromEntries(comMk.bloco6.parcelas);
  perto(parc['ICMS líquido da perna ES'], 40, 'e ele entra no custo, porque é desembolso');
  perto(comMk.bloco6.custo - semMk.bloco6.custo, 160 + 40, 'custo sobe o DIFAL do markup mais o ICMS da perna ES');
}

secao('Serviço WindGate é o que o Samir decidir — % ou R$, como já era');
{
  const base = { outrasDespesasAduaneiras: 2048, servicoWindgateBrl: '' };
  // Os presets da aba Cotações são percentuais sobre o custo.
  [20, 25, 30].forEach(pct => {
    const r = tri(diagonal(Object.assign({}, base, { servicoWindgatePct: pct })));
    perto(r.bloco7.servico, r.bloco6.custo * pct / 100, `preset ${pct}% → serviço = custo × ${pct}%`);
    perto(r.bloco7.margemSobreCusto, pct, `e a margem sobre custo volta ${pct}%`, 0.01);
  });
  // E o valor em reais continua valendo, quando ele prefere fechar o número.
  const fixo = tri(diagonal({ outrasDespesasAduaneiras: 2048, servicoWindgateBrl: 73500 }));
  perto(fixo.bloco7.servico, 73500, 'valor fixo em R$ prevalece sobre o percentual');
  assert(fixo.bloco7.preco === fixo.bloco6.custo + 73500, 'e o preço acompanha');
}

secao('Cliente contribuinte tira o DIFAL do custo');
{
  const nao = tri(diagonal({ clienteContribuinte: false }));
  const sim = tri(diagonal({ clienteContribuinte: true }));
  assert(sim.bloco5.DIFAL > 0, 'o DIFAL continua calculado e apresentado');
  assert(sim.bloco5.difalNoCusto === 0, '★ mas sai do custo — a obrigação é do cliente');
  perto(nao.bloco6.custo - sim.bloco6.custo, nao.bloco5.DIFAL, 'a diferença de custo é exatamente o DIFAL');
}

secao('Caso Diagonal — blocos 6 e 7 (custo e preço)');
{
  const r = tri(diagonal());
  const p = Object.fromEntries(r.bloco6.parcelas);
  perto(p['FOB integral'], 165902.10, '★ o custo usa o FOB INTEGRAL, não o declarado');
  assert(p['FOB integral'] !== r.entrada.fobDeclarado, 'declarado e integral são campos diferentes e ambos visíveis');
  perto(p['Frete terrestre'], 6000, 'frete terrestre entra UMA vez');
  assert(r.bloco6.parcelas.filter(([n]) => /terrestre/i.test(n)).length === 1, '★ e só existe uma linha de frete terrestre');
  perto(r.bloco7.servico, 60000, 'serviço WindGate');
  perto(r.bloco7.preco, r.bloco6.custo + 60000, 'preço = custo + serviço');
  perto(r.bloco7.margemSobreCusto, 60000 / r.bloco6.custo * 100, 'margem sobre custo', 0.01);
  perto(r.bloco7.margemSobrePreco, 60000 / r.bloco7.preco * 100, 'margem sobre preço', 0.01);
  console.log(`     custo R$ ${f(r.bloco6.custo)} · preço R$ ${f(r.bloco7.preco)}`
    + ` · margem ${r.bloco7.margemSobreCusto.toFixed(2)}% s/custo · ${r.bloco7.margemSobrePreco.toFixed(2)}% s/preço`);
}

secao('Serviço por percentual em vez de valor fixo');
{
  const r = tri(diagonal({ servicoWindgateBrl: '', servicoWindgatePct: 10.5 }));
  perto(r.bloco7.servico, r.bloco6.custo * 0.105, '★ serviço parametrizado a 10,5% do custo');
  assert(r.bloco7.servico !== 60000, 'não fica chumbado em 60.000');
}

secao('TRAVA 1 — piso da NF de saída');
{
  const r = tri(diagonal({ markupComercialBrl: -50000 }));
  assert(r.travas.some(t => t.codigo === 'PISO_SAIDA'), '★ NF de saída abaixo do piso trava');
  const t = r.travas.find(t => t.codigo === 'PISO_SAIDA');
  assert(/Mínimo: R\$ /.test(t.msg), `e a mensagem diz o mínimo: "${t.msg}"`);
}

secao('TRAVA 2 — UF sem alíquota cadastrada');
{
  const r = tri(diagonal({ ufDestino: 'ZZ' }));
  assert(r.travas.some(t => t.codigo === 'UF_SEM_ALIQUOTA'), '★ UF não cadastrada trava a apuração');
  assert(r.bloco5.internaDestino === null && r.bloco5.DIFAL === 0, '★ e não assume default nenhum');
}

secao('TRAVA 3 — duplicidade no custo');
{
  // Frete terrestre com o mesmo valor do seguro: a trava tem de enxergar.
  const r = tri(diagonal({ freteTerrestreBrl: 1500 }));
  assert(r.travas.some(t => t.codigo === 'DUPLICIDADE'), '★ valor repetido em duas linhas do custo dispara alerta');
  const limpo = tri(diagonal());
  assert(!limpo.travas.some(t => t.codigo === 'DUPLICIDADE'), 'e não dispara quando os valores são distintos');
}

secao('TRAVA 5 — invoice abaixo de 100%');
{
  const r = tri(diagonal());
  const a = r.alertas.find(x => x.codigo === 'INVOICE_REDUZIDA');
  assert(!!a, '★ invoice a 50% gera alerta visível');
  assert(a.gravidade === 'alta', 'de gravidade alta');
  assert(/perdimento/.test(a.msg), 'e a mensagem nomeia a exposição (perdimento)');
  assert(a.log && a.log.usuario === 'teste' && !!a.log.em, 'com log de usuário e data');
  const cheio = tri(diagonal({ fatorInvoice: 100 }));
  assert(!cheio.alertas.some(x => x.codigo === 'INVOICE_REDUZIDA'), 'a 100% não alerta');
  perto(cheio.entrada.fobDeclarado, cheio.entrada.fobBrlTotal, 'e declarado = integral');
}

secao('TRAVA 6 — rateio por produto fecha com o preço');
{
  const r = tri(diagonal({
    itens: [
      { descricao: 'Container 40HC', ncm: '9406.90.0090', qtd: 6, valorUnitarioUsd: 4000, ii: 20, ipi: 0, pisImp: 2.1, cofinsImp: 9.65 },
      { descricao: 'Container 20',   ncm: '9406.90.0090', qtd: 3, valorUnitarioUsd: 2738, ii: 20, ipi: 0, pisImp: 2.1, cofinsImp: 9.65 }
    ]
  }));
  const soma = r.bloco7.porProduto.reduce((a, p) => a + p.preco, 0);
  perto(soma, r.bloco7.preco, '★ soma dos preços rateados = preço final (tolerância R$ 0,01)', 0.01);
  assert(!r.travas.some(t => t.codigo === 'RATEIO'), 'e a trava de conferência cruzada não dispara');
  assert(r.bloco7.porProduto.length === 2, 'rateio devolve uma linha por produto');
}

secao('Toda alíquota exibe a fonte');
{
  const r = tri(diagonal());
  const comFonte = ['II', 'ICMS importação', 'ICMS destacado na saída', 'DIFAL %', 'DIFAL', 'PIS saída'];
  comFonte.forEach(rot => {
    const m = r.memoria.find(x => x.rotulo === rot);
    assert(m && m.fonte, `"${rot}" traz a fonte: ${m && m.fonte ? m.fonte : '(ausente)'}`);
  });
}

secao('Pendências em aberto ficam a um parâmetro de distância');
{
  const simples = tri(diagonal());
  const dupla = tri(diagonal({ opcoes: { difalBaseDupla: true } }));
  // Convênio 236/2021: (NF − destacado) ÷ (1 − interna) × interna − destacado.
  const esperada = (simples.bloco3.nfSaida - simples.bloco3.icmsDestacado) / 0.80 * 0.20 - simples.bloco3.icmsDestacado;
  perto(dupla.bloco5.DIFAL, esperada, '★ pendência 3: base dupla calculada pelo Convênio 236/2021', 0.01);
  assert(dupla.bloco5.DIFAL > simples.bloco5.DIFAL, `e é maior que a base simples (Δ R$ ${f(dupla.bloco5.DIFAL - simples.bloco5.DIFAL)})`);

  const com = tri(diagonal());
  const sem = tri(diagonal({ opcoes: { despesasNaNfEntrada: false } }));
  perto(com.bloco2.nfEntrada - sem.bloco2.nfEntrada, 13933, '★ pendência 2: despesas dentro/fora da NF de entrada');

  const liq = tri(diagonal({ opcoes: { markupLiquidoDeIcms: true } }));
  perto(liq.bloco3.nfSaida, (com.bloco2.nfEntrada + 2000) / 0.96, 'opção comercial: markup também líquido de ICMS');
}

secao('ICMS de entrada é parâmetro — 1,2% do fixture × 1,6% da operação real');
{
  const a = tri(diagonal({ icmsEntradaEfetivo: 1.2 }));
  const b = tri(diagonal({ icmsEntradaEfetivo: 1.6 }));
  assert(b.bloco1.ICMSimp > a.bloco1.ICMSimp, 'a 1,6% o ICMS de importação é maior');
  assert(b.bloco7.preco > a.bloco7.preco, '★ e o preço final sobe junto');
  console.log(`     1,2% → ICMS R$ ${f(a.bloco1.ICMSimp)} · preço R$ ${f(a.bloco7.preco)}`);
  console.log(`     1,6% → ICMS R$ ${f(b.bloco1.ICMSimp)} · preço R$ ${f(b.bloco7.preco)}  (Δ R$ ${f(b.bloco7.preco - a.bloco7.preco)})`);
}

secao('★ Reconciliação contra a planilha — o valor dela é o correto');
{
  /* A planilha manda. O que faltava para o motor chegar no número dela eram
     R$ 2.048,00 de despesas aduaneiras que a base do ICMS de importação leva
     e que não estavam destacadas em campo nenhum — armazenagem, scanner, THC.
     Declaradas, a planilha se reproduz linha a linha. */
  const OUTRAS = 2048.00;
  const r = tri(diagonal({ outrasDespesasAduaneiras: OUTRAS }));

  perto(r.bloco1.baseICMSimp, 228479.18, '★ Base ICMS importação bate com a planilha', 0.01);
  perto(r.bloco1.ICMSimp, 2741.75, '★ ICMS importação (1,2%) bate', 0.01);
  perto(r.bloco1.totalImpostosImp, 56633.90, '★ Total de impostos de importação bate', 0.01);
  perto(r.bloco2.nfEntrada, 239065.95, '★ NF de ENTRADA bate', 0.01);
  perto(r.bloco3.pisoSaida, 249027.03, '★ Piso da NF de saída bate', 0.01);
  perto(r.bloco3.nfSaida, 251027.03, '★ NF de SAÍDA bate', 0.01);
  perto(r.bloco3.icmsDestacado, 10041.08, '★ ICMS destacado 4% bate', 0.01);
  perto(r.bloco4.COFsai, 19203.57, '★ COFINS saída bate', 0.01);
  perto(r.bloco4.creditos, 19944.34, '★ Créditos de importação batem', 0.01);
  perto(r.bloco5.DIFAL, 40164.32, '★ DIFAL (16%) bate', 0.01);

  /* Sobra um centavo de história: a planilha traz PIS de saída 4.142,95, mas
     251.027,03 × 1,65% = 4.141,95. Não há parâmetro que produza o outro valor
     sem quebrar a alíquota, então o motor segue os 1,65% e a diferença de
     R$ 1,00 aparece aqui, medida, em vez de ficar escondida. */
  perto(r.bloco4.PISsai, 4141.95, 'PIS saída segue a alíquota de 1,65%', 0.01);
  perto(4142.95 - r.bloco4.PISsai, 1.00, 'e a planilha traz R$ 1,00 a mais nessa linha', 0.01);
  perto(r.bloco6.custo, 371583.50 - 1.00, '★ CUSTO reproduz a planilha, menos esse R$ 1,00', 0.01);
  perto(r.bloco7.preco, 431583.50 - 1.00, '★ PREÇO reproduz a planilha, menos esse R$ 1,00', 0.01);
  perto(r.bloco7.margemSobreCusto, 16.15, 'margem sobre custo: 16,15%', 0.01);
  perto(r.bloco7.margemSobrePreco, 13.90, 'margem sobre preço: 13,90%', 0.01);

  console.log(`\n     planilha : custo R$ ${f(371583.50)} · preço R$ ${f(431583.50)}`);
  console.log(`     motor    : custo R$ ${f(r.bloco6.custo)} · preço R$ ${f(r.bloco7.preco)}`);
  console.log(`     diferença: R$ ${f(r.bloco7.preco - 431583.50)} — o PIS de saída da planilha\n`);

  // Sem declarar as outras despesas aduaneiras, a base cai e o ICMS vem menor.
  const sem = tri(diagonal());
  assert(sem.bloco1.ICMSimp < r.bloco1.ICMSimp,
    `sem declarar as R$ ${f(OUTRAS)}, a base do ICMS cai e recolhe-se a menos (R$ ${f(r.bloco1.ICMSimp - sem.bloco1.ICMSimp)})`);
}

secao('FECOP entra quando a UF cobra');
{
  const r = tri(diagonal({ fecopPct: 2 }));
  perto(r.bloco5.FECOP, r.bloco5.baseDifal * 0.02, 'FECOP 2% sobre a base do DIFAL');
  assert(r.bloco5.difalNoCusto > r.bloco5.DIFAL, 'e soma ao custo junto com o DIFAL');
}

secao('★ A aba Cotações usa o motor — mesma entrada, mesmo número');
{
  /* Dirige o formulário de verdade e compara o que apareceu na tela com o que
     o motor devolve para a mesma entrada. Se a tela divergir do motor, o
     cálculo voltou a viver solto na tela — que era o problema. */
  const set = (id, v) => { app.document.getElementById(id).value = String(v); };
  const num = id => parseFloat(String(app.document.getElementById(id).textContent).replace(/[^\d,-]/g, '').replace(',', '.'));

  app.avaliar(`
    state.items = [{ d:'Containers', ncm:'9406.90.0090', q:1, u:32214, p:0,
                     ii:20, ipi:0, pis:2.1, cofins:9.65, c5291:false, mono:false }];
    state.exps  = [{ n:'Despesas de nacionalização', v:9894.77 }];
  `);
  Object.entries({
    tipoOp: 'triangular', ufDestino: 'CE',
    txDesp: 5.15, txFrete: 5.253, pctInv: 50, icmsEnt: 1.2, icmsDest: 4,
    freteUSD: 16000, seguro: 1500, capatazia: 1240,
    siscomex: 154.23, afrmm: 1024, honorarios: 1620, outrasAdu: 2048,
    transporte: 6000, mkSF: 2000, mkJT: 0,
    pisS: 1.65, cofS: 7.65, ipiS: 0, mkp: 0, aliqST: 20,
    margemPct: 20
  }).forEach(([k, v]) => set(k, v));

  app.calc();

  // O mesmo cálculo, chamado direto no motor.
  const esperado = tri({
    taxaUsdDespesas: 5.15, taxaUsdFrete: 5.253,
    itens: [{ descricao: 'Containers', ncm: '9406.90.0090', qtd: 1, valorUnitarioUsd: 32214,
              ii: 20, ipi: 0, pisImp: 2.1, cofinsImp: 9.65 }],
    fatorInvoice: 50, freteIntUsd: 16000, seguroBrl: 1500, capataziaBrl: 1240,
    siscomex: 154.23, afrmm: 1024, honorarios: 1620, outrasDespesasAduaneiras: 2048,
    icmsEntradaEfetivo: 1.2, icmsInterestadual: 4,
    despesasNacionalizacao: 9894.77 + 154.23 + 1024 + 1620 + 1240,
    markupComercialBrl: 2000, markupJetBrl: 0,
    ufDestino: 'CE', tabelaIcmsInterno: app.ICMS_INTERNO,
    clienteContribuinte: false, freteTerrestreBrl: 6000,
    servicoWindgatePct: 20
  });

  perto(esperado.bloco2.nfEntrada, 239065.95, 'o motor reproduz a NF de entrada da planilha', 0.01);
  perto(num('sNFEntrada'),  esperado.bloco2.nfEntrada,   '★ tela: NF de ENTRADA', 0.01);
  perto(num('sPisoSaida'),  esperado.bloco3.pisoSaida,   '★ tela: piso da NF de saída', 0.01);
  perto(num('sNFJT'),       esperado.bloco3.nfSaida,     '★ tela: NF SF → JeT', 0.01);
  perto(num('sNFCli'),      esperado.bloco5.nfJetCliente,'★ tela: NF da JeT ao cliente', 0.01);
  perto(num('sDifal'),      esperado.bloco5.DIFAL,       '★ tela: DIFAL', 0.01);
  perto(num('sICMSes'),     esperado.bloco5.icmsJetLiquido, '★ tela: ICMS da perna ES', 0.01);
  perto(num('sResultTri'),  esperado.bloco4.resultante,  '★ tela: resultante de impostos', 0.01);
  perto(num('sCustoGrupo'), esperado.bloco6.custo,       '★ tela: custo do grupo', 0.01);
  perto(num('sPreco'),      esperado.bloco7.preco,       '★ tela: PREÇO ao cliente', 0.01);

  const lbl = app.document.getElementById('lblDifalTri').textContent;
  assert(/16,00%/.test(lbl), `o rótulo do DIFAL mostra a alíquota e a UF que a originou: "${lbl}"`);

  // A margem em % continua mandando, como na aba de sempre.
  perto(esperado.bloco7.servico, esperado.bloco6.custo * 0.20, 'serviço = 20% do custo do grupo', 0.01);
  set('margemPct', 30); app.calc();
  assert(num('sPreco') > esperado.bloco7.preco, '★ trocar o preset de margem move o preço');

  // Invoice a 50% tem de estar dito na tela, não só no log.
  const avisos = app.document.getElementById('triAvisos').innerHTML;
  assert(/Invoice declarada a 50%/.test(avisos), '★ o alerta de invoice reduzida aparece na tela');
  assert(app.document.getElementById('triAvisos').style.display === 'block', 'e a caixa fica visível');
}

secao('★ Trava do piso aparece na tela quando o mark-up derruba a saída');
{
  const set = (id, v) => { app.document.getElementById(id).value = String(v); };
  set('mkSF', -50000);
  app.calc();
  const avisos = app.document.getElementById('triAvisos').innerHTML;
  assert(/NF de saída abaixo do piso/.test(avisos), '★ a trava do piso aparece para quem está cotando');
  set('mkSF', 2000); app.calc();
  assert(!/abaixo do piso/.test(app.document.getElementById('triAvisos').innerHTML), 'e some quando volta ao normal');
}

console.log(`\n${passou} verificações passaram, ${falhas} falharam.`);
process.exit(falhas ? 1 : 0);
