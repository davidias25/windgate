/* =====================================================================
   WindGate Hub 2.0 — Cotações & Propostas (sem tela).

   O motor de cálculo da cotação foi validado centavo a centavo contra a
   operação AsaSul e NÃO pode mudar. Aqui ele roda sem DOM: as mesmas
   fórmulas do `calc()` / `updatePrice()` do sistema atual, lendo os campos
   gravados na cotação em vez dos inputs da tela. O teste
   test/cotacoes.test.js carrega o sistema atual de verdade, roda o `calc()`
   original e confere que os dois chegam aos mesmos números em centenas de
   cotações. O motor triangular é o MESMO trecho do index.html, copiado entre
   os marcadores triangular-core (o teste confere que é idêntico).

   O formato gravado é exatamente o do sistema atual: `quotes[id]` com
   fields (strings, como vêm dos inputs), items, exps, fotos, blocos, status
   e `qindex` com o resumo da lista. Os dois sistemas abrem as mesmas
   cotações.
   ===================================================================== */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./regras.js'));
  else Object.assign(raiz.WG, fabrica(raiz.WG));
})(typeof self !== 'undefined' ? self : this, function (W) {

  /* Alíquota interna de ICMS por UF (2026) — a mesma tabela do sistema atual. */
  const ICMS_INTERNO = {
    AC: 19, AL: 20, AM: 20, AP: 18, BA: 20.5, CE: 20, DF: 20, ES: 17, GO: 19,
    MA: 23, MG: 18, MS: 17, MT: 17, PA: 19, PB: 20, PE: 20.5, PI: 22.5, PR: 19.5,
    RJ: 20, RN: 20, RO: 19.5, RR: 20, RS: 17, SC: 17, SE: 20, SP: 18, TO: 20
  };
  const SEM_DIFAL = 'Outro (sem ST)';   // valor antigo, preservado nas cotações salvas

  const DEFAULT_EXPS = [
    { l: 'Scanner', v: 600 }, { l: 'Armazenagem porto', v: 0 }, { l: 'Documentation fee (BL)', v: 649 },
    { l: 'THC destino', v: 1376 }, { l: 'Logistic fee', v: 163 }, { l: 'Taxas bancárias', v: 180 }
  ];
  /* Campos gravados em quotes[id].fields — mesma lista e mesma ordem do snapshot() do sistema atual. */
  const CAMPOS = ['tipoOp', 'servFora', 'fabSinal', 'desR1', 'desR2', 'desR3', 'opNum', 'cliente', 'ufDestino', 'mercadoria', 'origem', 'destino', 'incoterm', 'modalCntr', 'qtdCntr', 'prazo', 'validade',
    'txFrete', 'txDesp', 'pctInv', 'icmsEnt', 'icmsDest', 'pisS', 'cofS', 'ipiS', 'mkp', 'mkSF', 'mkJT', 'outrasAdu', 'aliqST',
    'freteUSD', 'seguro', 'capatazia', 'transporte', 'siscomex', 'afrmm', 'honorarios', 'margemPct', 'margemBRL'];
  /* Valores de uma cotação nova (newQuote do sistema atual). */
  const PADRAO = { tipoOp: 'direta', servFora: '0', fabSinal: '30', desR1: '', desR2: '', desR3: '', opNum: '', cliente: '', ufDestino: 'CE', mercadoria: '', origem: '', destino: 'Fortaleza/CE',
    incoterm: 'FOB', modalCntr: 'FCL', qtdCntr: '1', prazo: '60', validade: '7', validadeFrete: '', txFrete: '5.3', txDesp: '5.1', pctInv: '70', icmsEnt: '1.6', icmsDest: '4', pisS: '1.65',
    cofS: '7.6', ipiS: '0', mkp: '1', mkSF: '2000', mkJT: '1000', outrasAdu: '0', aliqST: '16', freteUSD: '0', seguro: '0', capatazia: '0', transporte: '0',
    siscomex: '416.46', afrmm: '0', honorarios: '1630', margemPct: '25', margemBRL: '0' };
  /* Cotação salva antes de um campo existir abre com o valor que o sistema atual
     usa nesse caso (loadQuote) — nunca herda o da cotação anterior. */
  const AUSENTES = { ipiS: '0', modalCntr: 'FCL', mkSF: '2000', mkJT: '1000', outrasAdu: '0' };
  const ITEM_PADRAO = () => ({ d: '', ncm: '', q: 1, u: 0, p: 0, ii: 10.8, ipi: 0, pis: 2.1, cofins: 9.65, c5291: false, mono: false });

  /* `N` e `V` do sistema atual leem o input: N = parseFloat(valor) || 0. */
  const N = (f, k) => parseFloat(f && f[k] != null ? f[k] : '') || 0;
  const V = (f, k) => (f && f[k] != null ? String(f[k]) : '');

  /** Campos de uma cotação aberta, com os padrões do sistema atual. */
  function camposDe(q) {
    const f = Object.assign({}, PADRAO);
    const s = (q && q.fields) || {};
    Object.keys(AUSENTES).forEach(k => { if (s[k] === undefined) f[k] = AUSENTES[k]; });
    Object.keys(s).forEach(k => { f[k] = s[k] == null ? '' : String(s[k]); });
    return f;
  }

  /* ==== INÍCIO triangular-core ====
   Funções puras: sem DOM, sem DB, sem USER. test/triangular.test.js e
   scripts/apurar-triangular.js recortam este trecho do HTML e rodam o MESMO
   código, para que proposta, tela e conferência não possam divergir. */

/* Fonte de cada alíquota, exigida no detalhamento interno: número de imposto
   sem origem não dá para conferir nem para defender numa fiscalização. */
const TRI_FONTES = {
  ii:          'Siscomex/TEC — NCM do item',
  ipi:         'TIPI — NCM do item',
  pisCofinsImp:'Lei 10.865/2004 — PIS/COFINS-Importação',
  icmsEntrada: 'Benefício fiscal ICMS/AL — parâmetro da operação',
  icmsInter:   'Resolução SF 13/2012 — importado: 4%',
  icmsInterno: 'RICMS da UF de destino',
  conv5291:    'Convênio ICMS 52/91 — Anexo I (máquinas e equipamentos)',
  difal:       'EC 87/2015 · Convênio ICMS 236/2021',
  pisCofinsSai:'Leis 10.637/2002 e 10.833/2003 — não cumulativo',
  fecop:       'Fundo de combate à pobreza da UF de destino'
};

/* Padrões da estrutura. Todos editáveis: nenhum destes é constante de código.
   `icmsEntradaEfetivo` é 1,6% porque é o que a operação recolhe de fato em AL
   — o mesmo 1,6% que o checklist de desembaraço já cobra. */
const TRI_PADRAO = {
  fatorFrete: 1.02,            // regra WindGate: frete converte com +2%
  fatorInvoice: 100,           // declarar 100% do FOB é o default; ver TRAVA 5
  icmsEntradaEfetivo: 1.6,
  icmsInterestadual: 4,        // importado, Resolução SF 13/2012
  cargaConv5291: 8.8,
  pisSaida: 1.65,
  cofinsSaida: 7.65,
  // Pendência 2 — o comentário da planilha diz que despesas acessórias não
  // compõem a NF de entrada, mas a fórmula somava. Enquanto Pedro/Wellington
  // não fecham, o default segue a fórmula e a alternativa fica a um flag.
  despesasNaNfEntrada: true,
  // Pendência 3 — para não contribuinte o Convênio 236/2021 prevê base dupla.
  // Default na base simples (o que a planilha fazia); o flag mostra o outro
  // número, que é ~R$ 10 mil maior no caso Diagonal.
  difalBaseDupla: false,
  // Decisão comercial, não correção: se ligado, o markup também sai líquido
  // de ICMS — nf_saida = (nf_entrada + markup) / (1 − alíquota).
  markupLiquidoDeIcms: false
};

const triPct = v => (+v || 0) / 100;
const triNum = v => (typeof v === 'number' && isFinite(v)) ? v : (parseFloat(v) || 0);
/* Arredonda só na APRESENTAÇÃO. Arredondar etapa intermediária desloca o piso
   da NF de saída e a operação passa a fechar alguns centavos abaixo do custo. */
const triCent = v => Math.round((+v || 0) * 100) / 100;

/* Alíquota interna do destino. Com Convênio 52/91 a carga cai para 8,8%; sem
   UF cadastrada não há palpite possível — quem decide é a TRAVA 2. */
function triInternaDestino(uf, tabela, conv5291, cargaConv){
  if (conv5291) return triNum(cargaConv != null ? cargaConv : TRI_PADRAO.cargaConv5291);
  const v = tabela ? tabela[uf] : undefined;
  return (typeof v === 'number') ? v : null;
}

/* ---------- MOTOR ---------- */
/* Devolve os sete blocos, a memória de cálculo linha a linha, as travas que
   bloqueiam e os alertas que só avisam. Nada aqui decide sozinho emitir nada:
   quem chama é que lê `travas` e resolve. */
function triCalcular(e){
  const op = Object.assign({}, TRI_PADRAO, e.opcoes || {});
  const travas = [], alertas = [], memoria = [];
  const reg = (bloco, rotulo, valor, formula, fonte) =>
    memoria.push({ bloco, rotulo, valor, formula, fonte: fonte || '' });

  /* ---- Câmbio ---- */
  const txDesp = triNum(e.taxaUsdDespesas);
  const txFrete = triNum(e.taxaUsdFrete) || txDesp * triNum(op.fatorFrete || TRI_PADRAO.fatorFrete);
  reg('câmbio', 'Taxa USD despesas/mercadoria', txDesp, 'parâmetro');
  reg('câmbio', 'Taxa USD frete', txFrete, `${txDesp} × ${op.fatorFrete} (regra WindGate +2%)`);

  /* ---- Itens ---- */
  const fatorInvoice = triPct(e.fatorInvoice != null ? e.fatorInvoice : op.fatorInvoice);
  const itens = (e.itens || []).map(it => {
    const bruto = triNum(it.valorUnitarioUsd) * triNum(it.qtd);
    const fobUsd = bruto * (1 - triPct(it.descontoPct));
    return Object.assign({}, it, { fobUsd, fobBrl: fobUsd * txDesp });
  });
  const fobBrlTotal = itens.reduce((a, it) => a + it.fobBrl, 0);
  const pesoTotal = itens.reduce((a, it) => a + triNum(it.pesoKg), 0);
  // Rateio pelo peso do item no FOB: é o critério que a DI usa para distribuir
  // frete, seguro e despesas entre as adições.
  itens.forEach(it => { it.share = fobBrlTotal > 0 ? it.fobBrl / fobBrlTotal : 0; });

  const fobDeclarado = fobBrlTotal * fatorInvoice;
  reg('itens', 'FOB integral (pago ao fornecedor)', fobBrlTotal, `USD ${triCent(itens.reduce((a,i)=>a+i.fobUsd,0))} × ${txDesp}`);
  reg('itens', 'FOB declarado na DI', fobDeclarado, `FOB integral × ${triCent(fatorInvoice * 100)}%`);

  /* TRAVA 5 — subfaturamento. O valor declarado tem de ser o de transação
     (Acordo de Valoração Aduaneira). Declarar menos expõe a multa e a pena de
     perdimento, e alcança a DI já registrada. O campo existe, mas nunca calado. */
  if (fatorInvoice < 1) {
    alertas.push({
      codigo: 'INVOICE_REDUZIDA',
      gravidade: 'alta',
      msg: `Invoice declarada a ${triCent(fatorInvoice * 100)}% do FOB — R$ ${triCent(fobBrlTotal - fobDeclarado)} fora da base. `
         + 'O valor declarado deve ser o valor de transação (Acordo de Valoração Aduaneira). '
         + 'Exposição: multa e pena de perdimento, e vulnerabilidade do benefício fiscal de AL a glosa.',
      log: { fatorInvoice: triCent(fatorInvoice * 100), fobIntegral: triCent(fobBrlTotal), fobDeclarado: triCent(fobDeclarado),
             usuario: e.usuario || '(não informado)', em: e.agora || new Date().toISOString() }
    });
  }

  /* ---- BLOCO 1 — importação / nacionalização (SF, AL) ---- */
  const freteIntBrl = triNum(e.freteIntUsd) * txFrete;
  const seguro = triNum(e.seguroBrl), capatazia = triNum(e.capataziaBrl);
  const siscomex = triNum(e.siscomex), afrmm = triNum(e.afrmm), honorarios = triNum(e.honorarios);

  const baseImportacao = fobDeclarado + freteIntBrl + seguro + capatazia;
  reg('1. importação', 'Base impostos importação (CIF declarado)', baseImportacao,
      'FOB declarado + frete int. + seguro + capatazia');

  // Por item, porque II/IPI/PIS/COFINS são da NCM e não da operação.
  let II = 0, IPI = 0, PISimp = 0, COFimp = 0;
  itens.forEach(it => {
    const base_i = baseImportacao * it.share;
    const ii_i  = base_i * triPct(it.ii);
    const ipi_i = (base_i + ii_i) * triPct(it.ipi);
    II += ii_i; IPI += ipi_i;
    PISimp += base_i * triPct(it.pisImp);
    COFimp += base_i * triPct(it.cofinsImp);
    it.impostos = { base: base_i, ii: ii_i, ipi: ipi_i,
                    pis: base_i * triPct(it.pisImp), cofins: base_i * triPct(it.cofinsImp) };
  });
  reg('1. importação', 'II', II, 'base × II% da NCM', TRI_FONTES.ii);
  reg('1. importação', 'IPI', IPI, '(base + II) × IPI% da NCM', TRI_FONTES.ipi);
  reg('1. importação', 'PIS-Importação', PISimp, 'base × PIS% da NCM', TRI_FONTES.pisCofinsImp);
  reg('1. importação', 'COFINS-Importação', COFimp, 'base × COFINS% da NCM', TRI_FONTES.pisCofinsImp);

  const icmsEntPct = triPct(e.icmsEntradaEfetivo != null ? e.icmsEntradaEfetivo : op.icmsEntradaEfetivo);
  /* A base do ICMS de importação leva as "demais despesas aduaneiras", não só
     as três que costumam aparecer destacadas. Armazenagem, scanner, THC e
     taxas do terminal entram aqui — por isso o campo é explícito: deixá-las
     de fora reduz a base e recolhe ICMS a menos, e somá-las sem dizer de onde
     vieram faz o número não bater com a planilha e ninguém saber por quê. */
  const outrasAduaneiras = triNum(e.outrasDespesasAduaneiras);
  const numeradorICMS = fobDeclarado + freteIntBrl + II + IPI + PISimp + COFimp
                      + siscomex + afrmm + honorarios + outrasAduaneiras;
  // ICMS "por dentro": integra a própria base, por isso divide.
  const baseICMSimp = numeradorICMS / (1 - icmsEntPct);
  const ICMSimp = baseICMSimp * icmsEntPct;
  reg('1. importação', 'Base ICMS importação', baseICMSimp,
      `(FOB decl. + frete + II + IPI + PIS + COFINS + Siscomex + AFRMM + honorários`
      + (outrasAduaneiras ? ` + outras despesas aduaneiras ${triCent(outrasAduaneiras)}` : '')
      + `) ÷ (1 − ${triCent(icmsEntPct*100)}%)`,
      TRI_FONTES.icmsEntrada);
  reg('1. importação', 'ICMS importação', ICMSimp, `base × ${triCent(icmsEntPct*100)}%`, TRI_FONTES.icmsEntrada);

  const totalImpostosImp = II + IPI + PISimp + COFimp + ICMSimp;
  reg('1. importação', 'Total impostos importação', totalImpostosImp, 'II + IPI + PIS + COFINS + ICMS');

  /* ---- BLOCO 2 — NF de ENTRADA (SF) ---- */
  const despNac = triNum(e.despesasNacionalizacao);
  const nfEntrada = fobDeclarado + freteIntBrl + seguro + totalImpostosImp
                  + (op.despesasNaNfEntrada ? despNac : 0);
  reg('2. NF entrada', 'NF de ENTRADA', nfEntrada,
      'FOB decl. + frete int. + seguro + impostos importação'
      + (op.despesasNaNfEntrada ? ' + despesas de nacionalização' : ' (despesas acessórias FORA — pendência 2)'));

  /* ---- BLOCO 3 — piso da NF de SAÍDA (SF/AL → JeT/ES) ---- */
  const icmsInterPct = triPct(e.icmsInterestadual != null ? e.icmsInterestadual : op.icmsInterestadual);
  const markup = triNum(e.markupComercialBrl);
  const pisoSaida = nfEntrada / (1 - icmsInterPct);
  const nfSaida = op.markupLiquidoDeIcms
    ? (nfEntrada + markup) / (1 - icmsInterPct)
    : pisoSaida + markup;
  const icmsDestacado = nfSaida * icmsInterPct;
  reg('3. NF saída', 'Piso da NF de saída', pisoSaida,
      `NF entrada ÷ (1 − ${triCent(icmsInterPct*100)}%)`, TRI_FONTES.icmsInter);
  reg('3. NF saída', 'NF de SAÍDA', nfSaida,
      op.markupLiquidoDeIcms ? `(NF entrada + markup) ÷ (1 − ${triCent(icmsInterPct*100)}%)` : 'piso + markup comercial');
  reg('3. NF saída', 'ICMS destacado na saída', icmsDestacado,
      `NF de saída cheia × ${triCent(icmsInterPct*100)}%`, TRI_FONTES.icmsInter);

  /* TRAVA 1 — piso de saída. */
  if (triCent(nfSaida) < triCent(pisoSaida) - 0.005) {
    travas.push({ codigo: 'PISO_SAIDA', msg: `NF de saída abaixo do piso. Mínimo: R$ ${triCent(pisoSaida)}.` });
  }

  /* ---- BLOCO 4 — PIS/COFINS da saída (não cumulativo) ---- */
  // A base é a MESMA nf_saida do bloco 3. Duas bases de saída convivendo foi
  // um dos erros da planilha antiga.
  const baseSaida = nfSaida;
  const PISsai = baseSaida * triPct(e.pisSaida != null ? e.pisSaida : op.pisSaida);
  const COFsai = baseSaida * triPct(e.cofinsSaida != null ? e.cofinsSaida : op.cofinsSaida);
  const ipiSaidaPct = itens.reduce((a, it) => a + it.share * triPct(it.ipi), 0);
  const IPIsai = baseSaida * ipiSaidaPct;
  const creditos = IPI + PISimp + COFimp;
  const resultanteBruta = (PISsai + COFsai + IPIsai) - creditos;
  // Resultante negativa não é custo negativo: é crédito a compensar depois.
  const resultante = Math.max(resultanteBruta, 0);
  const creditoAcumulado = resultanteBruta < 0 ? -resultanteBruta : 0;

  reg('4. saída', 'Base PIS/COFINS saída', baseSaida, 'a MESMA NF de saída do bloco 3');
  reg('4. saída', 'PIS saída', PISsai, `base × ${triCent((e.pisSaida != null ? e.pisSaida : op.pisSaida))}%`, TRI_FONTES.pisCofinsSai);
  reg('4. saída', 'COFINS saída', COFsai, `base × ${triCent((e.cofinsSaida != null ? e.cofinsSaida : op.cofinsSaida))}%`, TRI_FONTES.pisCofinsSai);
  reg('4. saída', 'IPI saída', IPIsai, 'base × IPI% ponderado das NCMs', TRI_FONTES.ipi);
  reg('4. saída', 'Créditos da importação', creditos, 'IPI + PIS-imp + COFINS-imp', TRI_FONTES.pisCofinsSai);
  reg('4. saída', 'Resultante de impostos (desembolso)', resultante, '(PIS + COFINS + IPI saída) − créditos');
  if (creditoAcumulado > 0) {
    reg('4. saída', 'Crédito acumulado a compensar', creditoAcumulado, 'resultante negativa não vira custo negativo');
    alertas.push({ codigo: 'CREDITO_ACUMULADO', gravidade: 'baixa',
      msg: `Créditos superam os débitos em R$ ${triCent(creditoAcumulado)} — registrado como crédito a compensar, não como custo negativo.` });
  }
  // O ICMS destacado de 4% aparece na NF mas é neutralizado pelo crédito
  // presumido do benefício de AL: não é desembolso e por isso não entra no custo.
  reg('4. saída', 'ICMS destacado — NÃO entra no custo', icmsDestacado,
      'neutralizado pelo crédito presumido do benefício AL (confirmar — pendência 1)');

  /* ---- BLOCO 5 — DIFAL (JeT/ES → cliente final) ---- */
  const tabelaUF = e.tabelaIcmsInterno || {};
  const cargaConv = triNum(e.cargaConv5291 != null ? e.cargaConv5291 : op.cargaConv5291);
  /* O Convênio 52/91 é POR PRODUTO: numa mesma DI cabe máquina industrial com
     carga reduzida ao lado de item comum. A alíquota do DIFAL sai ponderada
     pelo peso de cada um no FOB — aplicar a do primeiro item a todos erra a
     guia inteira. O flag global continua valendo quando a operação é toda de
     um tipo só. */
  const itensConv = itens.some(it => it.conv5291);
  const convGlobal = !!e.conv5291;
  const conv = convGlobal || itensConv;
  const internaTabela = triInternaDestino(e.ufDestino, tabelaUF, false, null);

  /* TRAVA 2 — UF sem alíquota cadastrada. Nunca assumir default. */
  if (internaTabela === null) {
    travas.push({ codigo: 'UF_SEM_ALIQUOTA',
      msg: `Alíquota interna de ICMS não cadastrada para a UF "${e.ufDestino || '(vazia)'}". Cadastre antes de apurar — não há default.` });
  }
  const internaDestino = internaTabela === null ? null
    : ((convGlobal && !itensConv) ? cargaConv : internaTabela);

  let difalPct = 0;
  if (internaTabela !== null) {
    const cheia = Math.max(triPct(internaTabela) - icmsInterPct, 0);
    const reduzida = Math.max(triPct(cargaConv) - icmsInterPct, 0);
    difalPct = itensConv
      ? itens.reduce((a, it) => a + it.share * (it.conv5291 ? reduzida : cheia), 0)
      : (convGlobal ? reduzida : cheia);
  }
  // Interna efetiva reconstituída da ponderação — é ela que a base dupla usa.
  const internaPct = difalPct + icmsInterPct;
  const contribuinte = !!e.clienteContribuinte;

  /* A JeT revende ao cliente com markup próprio, e é ESSA nota que gera o
     DIFAL — a obrigação nasce na saída dela, não na nota que a SF lhe vendeu.
     Calcular o DIFAL sobre a nota SF→JeT subestima a base em todo o markup da
     JeT, e a conta só aparece depois, na guia. */
  const markupJet = triNum(e.markupJetBrl);
  const nfJetCliente = nfSaida + markupJet;
  /* Na perna do ES a JeT debita 4% na venda e credita os 4% que a SF destacou
     na compra. Sobra imposto só sobre o markup dela — esse sim é desembolso. */
  const icmsJetLiquido = markupJet * icmsInterPct;
  reg('5. DIFAL', 'NF da JeT ao cliente', nfJetCliente,
      'NF SF→JeT + markup da JeT — é a base do DIFAL');
  reg('5. DIFAL', 'ICMS líquido da perna ES', icmsJetLiquido,
      `markup da JeT × ${triCent(icmsInterPct*100)}% (débito da saída − crédito da compra)`,
      TRI_FONTES.icmsInter);

  let DIFAL = 0, baseDifal = 0;
  if (internaTabela !== null) {
    if (op.difalBaseDupla) {
      // Convênio 236/2021: para não contribuinte o ICMS interno integra a
      // própria base — tira-se o destacado e recompõe-se por dentro.
      const destacadoJet = nfJetCliente * icmsInterPct;
      baseDifal = (nfJetCliente - destacadoJet) / (1 - internaPct);
      DIFAL = baseDifal * internaPct - destacadoJet;
    } else {
      baseDifal = nfJetCliente;
      DIFAL = baseDifal * difalPct;
    }
  }
  const fecopPct = triPct(e.fecopPct);
  const FECOP = fecopPct > 0 ? baseDifal * fecopPct : 0;

  reg('5. DIFAL', `Alíquota interna ${e.ufDestino || '?'}`, internaDestino,
      conv ? 'carga reduzida do Convênio 52/91' : 'tabela por UF',
      conv ? TRI_FONTES.conv5291 : TRI_FONTES.icmsInterno);
  reg('5. DIFAL', 'DIFAL %', triCent(difalPct * 100),
      `${triCent(internaPct*100)}% interna − ${triCent(icmsInterPct*100)}% interestadual`, TRI_FONTES.difal);
  reg('5. DIFAL', 'Base do DIFAL', baseDifal,
      op.difalBaseDupla ? '(NF JeT→cliente − ICMS destacado) ÷ (1 − interna) — base dupla, Conv. 236/2021' : 'NF da JeT ao cliente — base simples',
      TRI_FONTES.difal);
  reg('5. DIFAL', 'DIFAL', DIFAL,
      (contribuinte ? 'recolhido pelo CLIENTE — informativo, fora do custo' : 'recolhido pelo REMETENTE (JeT) — entra no custo'),
      TRI_FONTES.difal);
  if (FECOP > 0) reg('5. DIFAL', 'FECOP', FECOP, `base do DIFAL × ${triCent(fecopPct*100)}%`, TRI_FONTES.fecop);

  if (conv) {
    alertas.push({ codigo: 'CONV_5291', gravidade: 'media',
      msg: 'Convênio 52/91 aplicado: validar cada NCM contra o Anexo I antes de emitir.' });
  }
  const difalNoCusto = contribuinte ? 0 : (DIFAL + FECOP);

  /* ---- BLOCO 6 — custo total da operação (WindGate) ---- */
  const freteTerrestre = triNum(e.freteTerrestreBrl);
  // O custo usa o FOB INTEGRAL: o que sai do caixa é o que se paga ao
  // fornecedor, não o que se declarou na DI. São campos diferentes, e confundir
  // os dois é o que faz a operação parecer mais barata do que é.
  // Capatazia, Siscomex, AFRMM e honorários NÃO entram aqui: eles já estão
  // dentro de `despesas_nacionalizacao`. Aparecem soltos na entrada só porque
  // a base do ICMS de importação precisa de cada um separado. Somá-los de novo
  // seria a mesma duplicidade que fez o frete terrestre ser contado três vezes.
  const acessoriasNaBase = capatazia + siscomex + afrmm + honorarios;
  const parcelasCusto = [
    ['FOB integral',                    fobBrlTotal],
    ['Frete internacional',             freteIntBrl],
    ['Seguro',                          seguro],
    ['Impostos de importação',          totalImpostosImp],
    ['Despesas de nacionalização',      despNac],
    ['Resultante de impostos (saída)',  resultante],
    ['ICMS líquido da perna ES',        icmsJetLiquido],
    ['DIFAL' + (contribuinte ? ' (cliente contribuinte — fora)' : ''), difalNoCusto],
    ['Frete terrestre',                 freteTerrestre]
  ];
  const custo = parcelasCusto.reduce((a, [, v]) => a + v, 0);
  parcelasCusto.forEach(([nome, v]) => reg('6. custo', nome, v, ''));
  reg('6. custo', 'CUSTO WINDGATE', custo, 'soma das parcelas acima, cada uma UMA vez');

  /* TRAVA 3 — duplicidade. Frete terrestre contado três vezes custou R$ 12 mil
     na planilha antiga; a trava confere que nenhum valor entra duas vezes. */
  const vistos = new Map();
  parcelasCusto.forEach(([nome, v]) => {
    if (v <= 0) return;
    const k = triCent(v).toFixed(2);
    if (vistos.has(k)) {
      travas.push({ codigo: 'DUPLICIDADE',
        msg: `Valor R$ ${k} aparece em duas linhas do custo ("${vistos.get(k)}" e "${nome}"). Confira se não é a mesma despesa somada duas vezes.` });
    } else vistos.set(k, nome);
  });
  // As acessórias têm de caber dentro do balaio que as contém. Se não cabem,
  // ou está faltando despesa no total ou alguém as somou em dois lugares.
  if (acessoriasNaBase > despNac + 0.005) {
    travas.push({ codigo: 'ACESSORIAS_FORA',
      msg: `Capatazia + Siscomex + AFRMM + honorários somam R$ ${triCent(acessoriasNaBase)}, mais que as despesas de nacionalização `
         + `(R$ ${triCent(despNac)}). Elas deveriam estar dentro desse total — confira se não ficaram de fora do custo ou se foram somadas duas vezes.` });
  }

  /* ---- BLOCO 7 — preço ao cliente ---- */
  const servico = e.servicoWindgateBrl != null && e.servicoWindgateBrl !== ''
    ? triNum(e.servicoWindgateBrl)
    : custo * triPct(e.servicoWindgatePct);
  const preco = custo + servico;
  reg('7. preço', 'Serviço WindGate', servico,
      e.servicoWindgateBrl != null && e.servicoWindgateBrl !== '' ? 'valor fixo' : `custo × ${triCent(triNum(e.servicoWindgatePct))}%`);
  reg('7. preço', 'PREÇO FINAL AO CLIENTE', preco, 'custo + serviço');

  // Rateio por produto, pelo custo nacionalizado de cada um.
  const custoNacItem = itens.map(it => it.share * (custo - servico * 0));
  const totalNac = custoNacItem.reduce((a, v) => a + v, 0);
  const porProduto = itens.map((it, i) => ({
    descricao: it.descricao, ncm: it.ncm, qtd: it.qtd,
    custoNacionalizado: custoNacItem[i],
    preco: totalNac > 0 ? (custoNacItem[i] / totalNac) * preco : 0
  }));

  /* TRAVA 6 — conferência cruzada do rateio. */
  const somaRateio = porProduto.reduce((a, p) => a + p.preco, 0);
  if (Math.abs(somaRateio - preco) > 0.01) {
    travas.push({ codigo: 'RATEIO',
      msg: `Soma do rateio por produto (R$ ${triCent(somaRateio)}) não bate com o preço final (R$ ${triCent(preco)}).` });
  }

  return {
    entrada: { txDesp, txFrete, fatorInvoice, fobBrlTotal, fobDeclarado, itens },
    bloco1: { baseImportacao, II, IPI, PISimp, COFimp, baseICMSimp, ICMSimp, totalImpostosImp },
    bloco2: { nfEntrada },
    bloco3: { pisoSaida, nfSaida, icmsDestacado, markup },
    bloco4: { baseSaida, PISsai, COFsai, IPIsai, creditos, resultante, creditoAcumulado },
    bloco5: { ufDestino: e.ufDestino, internaDestino, difalPct: difalPct * 100, baseDifal, DIFAL, FECOP,
            markupJet, nfJetCliente, icmsJetLiquido,
              clienteContribuinte: contribuinte, difalNoCusto, baseDupla: !!op.difalBaseDupla },
    bloco6: { parcelas: parcelasCusto, custo, freteTerrestre },
    bloco7: { servico, preco, porProduto,
              margemSobreCusto: custo > 0 ? servico / custo * 100 : 0,
              margemSobrePreco: preco > 0 ? servico / preco * 100 : 0 },
    opcoes: op, travas, alertas, memoria
  };
}
  /* ==== FIM triangular-core ==== */

  /**
   * O cálculo da tela de cotação, sem tela. `modo` = 'pct' (margem em % sobre o
   * custo, o padrão: é o que o `calc()` faz sempre) ou 'brl' (o serviço digitado
   * em reais, como no campo Margem R$). Devolve o mesmo objeto `R` do sistema atual.
   */
  function calcular(q, opcoes) {
    const o = opcoes || {}, f = camposDe(q), Nf = k => N(f, k);
    const items = ((q && q.items) || []).map(it => Object.assign({}, it, { q: +it.q || 0, u: +it.u || 0, p: +it.p || 0, ii: +it.ii || 0, ipi: +it.ipi || 0 }));
    const exps = ((q && q.exps) || []).map(e => ({ l: e.l, v: +e.v || 0 }));
    const txF = Nf('txFrete'), txD = Nf('txDesp'), pctInv = Nf('pctInv') / 100, icmsE = Nf('icmsEnt') / 100;
    const icmsD = Nf('icmsDest') / 100, pisS = Nf('pisS') / 100, cofS = Nf('cofS') / 100, mkp = Nf('mkp') / 100, aliqST = Nf('aliqST') / 100;
    const ipiS = Nf('ipiS') / 100;
    const freteBRL = Nf('freteUSD') * txF;
    const terrestre = Nf('transporte');
    const seguro = Nf('seguro'), capat = Nf('capatazia'), sisc = Nf('siscomex'), afrmm = Nf('afrmm'), honor = Nf('honorarios');

    let fobBRLtot = 0, pesoTot = 0;
    items.forEach(it => { fobBRLtot += it.q * it.u * txD; pesoTot += it.q * it.p; });
    let II = 0, IPI = 0, PIS = 0, COF = 0, CEtot = 0, ICMSent = 0, CHtot = 0;
    const fobItens = [];
    items.forEach(it => {
      const fob = it.q * it.u * txD; fobItens.push(fob);
      if (fobBRLtot <= 0) return;
      const share = fob / fobBRLtot, pesoShare = pesoTot > 0 ? (it.q * it.p) / pesoTot : share;
      const invRed = fob * pctInv;
      const frete_i = share * freteBRL, seg_i = share * seguro, cap_i = share * capat;
      const cif = invRed + frete_i + seg_i + cap_i;
      const ii = cif * (it.ii / 100), ipi = (cif + ii) * (it.ipi / 100);
      const pis = cif * ((it.pis != null ? it.pis : 2.1) / 100), cof = cif * ((it.cofins != null ? it.cofins : 9.65) / 100);
      const ce = (invRed + frete_i + ii + ipi + pis + cof + share * sisc + pesoShare * afrmm + share * honor) / (1 - icmsE);
      const icmsent = ce * icmsE, ch = ce - ipi - icmsent;
      II += ii; IPI += ipi; PIS += pis; COF += cof; CEtot += ce; ICMSent += icmsent; CHtot += ch;
    });
    const despExtra = exps.reduce((s, e) => s + e.v, 0);
    const compra = fobBRLtot + freteBRL + seguro;
    const impostos = II + IPI + PIS + COF + ICMSent;
    const despesas = despExtra + sisc + afrmm + honor + capat + terrestre;
    const totalNac = compra + II + IPI + PIS + COF + despesas;
    const creditos = IPI + PIS + COF;
    const baseSaida = totalNac;
    const baseICMS = baseSaida / (1 - icmsD);
    const icmsDestV = baseICMS * icmsD;
    const fator = 1 - icmsD - pisS - cofS - mkp;
    const nfSaidaItens = fator > 0 ? CHtot / fator : 0;
    const pisSaida = nfSaidaItens * pisS, cofSaida = nfSaidaItens * cofS, ipiSaida = nfSaidaItens * ipiS;
    const resultante = (pisSaida + cofSaida + ipiSaida) - creditos;
    const nfSaida = baseSaida + resultante + icmsDestV;
    const st = (ICMS_INTERNO[V(f, 'ufDestino')] != null) ? Math.max(nfSaida * aliqST - icmsDestV, 0) : 0;
    const custoReal = compra + impostos + despesas + resultante;
    const comp = { fob: fobBRLtot, freteInt: Nf('freteUSD') * txF, terrestre: Nf('transporte'), seguro, portuarias: capat + sisc + afrmm + despExtra, honorarios: honor };
    const R = { comp, compra, impostos, despesas, resultante, custoReal, st, nfSaida, chTot: CHtot, fob: fobBRLtot, __ii: II, __ipi: IPI, __pis: PIS, __cof: COF, __icms: ICMSent };
    R.fobShares = []; if (fobBRLtot > 0) items.forEach(it => R.fobShares.push({ share: (it.q * it.u * txD) / fobBRLtot, c5291: !!it.c5291, mono: !!it.mono }));
    R.fobItens = fobItens;
    R.ncmCurto = items.some(it => it.ncm && String(it.ncm).replace(/\D/g, '').length < 8);

    /* Margem: como o marginFromPct / marginFromBRL do sistema atual. */
    const brl = o.modo === 'brl';
    const pct = Nf('margemPct') / 100;
    const m = brl ? Nf('margemBRL') : (R.custoReal || 0) * pct;
    // Em reais, o % da tela vira só informação (m ÷ custo, 1 casa), como no marginFromBRL.
    R.margemPctCampo = brl ? ((R.custoReal || 0) > 0 ? +((m / R.custoReal) * 100).toFixed(1) : 0) : Nf('margemPct');
    R.margemBRLCampo = +m.toFixed(2);
    R.warnMargem = false;

    if (V(f, 'tipoOp') !== 'triangular') {
      const preco = (R.custoReal || 0) + (R.st || 0) + m;
      R.margem = m; R.preco = preco; R.tri = null;
      R.margemSobrePreco = preco > 0 ? (m / preco) * 100 : null;
      R.warnMargem = (R.margemPctCampo < 10 && (R.custoReal || 0) > 0);
    } else {
      const t = triCalcular({
        taxaUsdDespesas: Nf('txDesp'), taxaUsdFrete: Nf('txFrete'),
        itens: items.map(it => ({ descricao: it.d, ncm: it.ncm, qtd: it.q, valorUnitarioUsd: it.u, pesoKg: it.p, ii: it.ii, ipi: it.ipi,
          pisImp: it.pis != null ? it.pis : 2.1, cofinsImp: it.cofins != null ? it.cofins : 9.65, conv5291: !!it.c5291 })),
        fatorInvoice: Nf('pctInv'), freteIntUsd: Nf('freteUSD'), seguroBrl: Nf('seguro'), capataziaBrl: Nf('capatazia'),
        siscomex: Nf('siscomex'), afrmm: Nf('afrmm'), honorarios: Nf('honorarios'), outrasDespesasAduaneiras: Nf('outrasAdu'),
        icmsEntradaEfetivo: Nf('icmsEnt'), icmsInterestadual: Nf('icmsDest'),
        despesasNacionalizacao: exps.reduce((a, x) => a + x.v, 0) + Nf('siscomex') + Nf('afrmm') + Nf('honorarios') + Nf('capatazia'),
        markupComercialBrl: Nf('mkSF'), markupJetBrl: Nf('mkJT'), ufDestino: V(f, 'ufDestino'), tabelaIcmsInterno: ICMS_INTERNO,
        clienteContribuinte: false, freteTerrestreBrl: Nf('transporte'),
        servicoWindgateBrl: brl ? m : '', servicoWindgatePct: Nf('margemPct'),
        usuario: o.usuario || '', agora: o.agora
      });
      if (brl && t.bloco6.custo > 0) R.margemPctCampo = +((m / t.bloco6.custo) * 100).toFixed(1);
      const P = t.bloco7.preco, margemR = t.bloco7.servico;
      R.margem = margemR; R.preco = P;
      R.margemSobrePreco = P > 0 ? t.bloco7.margemSobrePreco : null;
      if (!brl) R.margemBRLCampo = +margemR.toFixed(2);
      R.warnMargem = (R.margemPctCampo < 10 && t.bloco6.custo > 0);
      R.tri = { P, nfSF: t.bloco3.nfSaida, nfJT: t.bloco5.nfJetCliente, difal: t.bloco5.DIFAL, icmsES: t.bloco5.icmsJetLiquido,
        custoGrupo: t.bloco6.custo, dEff: t.bloco5.difalPct / 100, piso: t.bloco3.pisoSaida, nfEntrada: t.bloco2.nfEntrada,
        resultante: t.bloco4.resultante, apuracao: t };
    }
    return R;
  }

  /* ==== Cronograma de desembolso — regra: recebimento cobre a saída em toda etapa ==== */
  const precoDesem = R => R.tri ? (R.preco || 0) : Math.max((R.preco || 0) - (R.st || 0), 0);
  function desemOuts(q, R) {
    const f = camposDe(q), fob = R.fob || 0;
    const sin = Math.min(100, Math.max(0, N(f, 'fabSinal') || 30)) / 100;
    const base = (R.tri ? R.tri.custoGrupo : (R.custoReal || 0));
    return { o1: fob * sin, o2: fob * (1 - sin), o3: Math.max(base - fob, 0), base };
  }
  function desemSugerir(q, R) {
    const { o1, o2, o3 } = desemOuts(q, R);
    const M = Math.max(precoDesem(R) - (o1 + o2 + o3), 0);
    const r1 = o1 + M * 0.21, r2 = o2 + M * 0.14, r3 = precoDesem(R) - r1 - r2;
    return { desR1: r1.toFixed(2), desR2: r2.toFixed(2), desR3: r3.toFixed(2) };
  }
  const fmt = v => (isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  function desemErros(q, R) {
    const f = camposDe(q), { o1, o2, o3 } = desemOuts(q, R);
    const r1 = N(f, 'desR1'), r2 = N(f, 'desR2'), r3 = N(f, 'desR3');
    const errs = [];
    if (!(r1 || r2 || r3)) { errs.push('preencha o cronograma de desembolso (use Sugerir).'); return errs; }
    if (r1 < o1 - 0.01) errs.push('Parcela 1 (' + fmt(r1) + ') MENOR que a saída da etapa (' + fmt(o1) + ') — o cliente precisa cobrir o sinal da fábrica.');
    if (r2 < o2 - 0.01) errs.push('Parcela 2 (' + fmt(r2) + ') MENOR que o saldo da fábrica (' + fmt(o2) + ').');
    if (r3 < o3 - 0.01) errs.push('Parcela 3 (' + fmt(r3) + ') MENOR que os custos de chegada (' + fmt(o3) + ').');
    if (Math.abs((r1 + r2 + r3) - precoDesem(R)) > 0.05) errs.push('A soma das parcelas (' + fmt(r1 + r2 + r3) + ') difere do valor a receber (' + fmt(precoDesem(R)) + (R.st > 0 ? ' = preço aprovado ' + fmt(R.preco || 0) + ' − DIFAL ' + fmt(R.st || 0) : '') + ').');
    return errs;
  }

  /* ==== Alíquotas da NCM: Catálogo (conferido pela equipe) → tabela interna → capítulo ==== */
  const NCM_TABELA = {
    '73089090': { ii: 10.8, ipi: 0, pis: 2.1, cofins: 9.65, desc: 'Escoras e estruturas de ferro ou aço', c5291: true, mono: false },
    '84743100': { ii: 20.0, ipi: 0, pis: 2.1, cofins: 9.65, desc: 'Betoneiras e misturadores de concreto', c5291: true, mono: false },
    '84262000': { ii: 20.0, ipi: 0, pis: 2.1, cofins: 9.65, desc: 'Guindastes de torre', c5291: false, mono: false },
    '84279000': { ii: 12.6, ipi: 0, pis: 2.1, cofins: 9.65, desc: 'Empilhadeiras — outras', c5291: true, mono: false },
    '84271019': { ii: 12.6, ipi: 0, pis: 2.1, cofins: 9.65, desc: 'Empilhadeiras elétricas', c5291: false, mono: false },
    '84294000': { ii: 12.6, ipi: 0, pis: 2.1, cofins: 9.65, desc: 'Rolos compactadores', c5291: false, mono: true },
    '84295190': { ii: 12.6, ipi: 0, pis: 2.1, cofins: 9.65, desc: 'Pás carregadeiras', c5291: false, mono: true },
    '84295900': { ii: 12.6, ipi: 0, pis: 2.1, cofins: 9.65, desc: 'Retro/escavadeiras', c5291: false, mono: true },
    '85076000': { ii: 14.0, ipi: 3.25, pis: 2.1, cofins: 9.65, desc: 'Baterias de íon de lítio', c5291: false, mono: false },
    '39269090': { ii: 11.2, ipi: 3.25, pis: 2.1, cofins: 9.65, desc: 'Obras de plásticos', c5291: false, mono: false },
    '82055990': { ii: 14.0, ipi: 5.0, pis: 2.1, cofins: 9.65, desc: 'Ferramentas manuais', c5291: false, mono: false },
    '95030099': { ii: 18.0, ipi: 6.5, pis: 2.1, cofins: 9.65, desc: 'Outros brinquedos', c5291: false, mono: false }
  };
  const NCM_CAPITULO = {
    '72': { ii: 10.8, ipi: 0, pis: 2.1, cofins: 9.65, desc: 'Ferro fundido, ferro e aço' }, '73': { ii: 10.8, ipi: 0, pis: 2.1, cofins: 9.65, desc: 'Obras de ferro ou aço (estruturas/tubos)' },
    '84': { ii: 12.6, ipi: 3.25, pis: 2.1, cofins: 9.65, desc: 'Reatores, máquinas e aparelhos mecânicos' }, '85': { ii: 14.0, ipi: 5.0, pis: 2.1, cofins: 9.65, desc: 'Máquinas, aparelhos e materiais elétricos' },
    '39': { ii: 11.2, ipi: 3.25, pis: 2.1, cofins: 9.65, desc: 'Plásticos e suas obras' }, '40': { ii: 12.6, ipi: 5.0, pis: 2.1, cofins: 9.65, desc: 'Borracha e suas obras' },
    '82': { ii: 14.0, ipi: 5.0, pis: 2.1, cofins: 9.65, desc: 'Ferramentas, cutelaria e talheres' }, '90': { ii: 12.6, ipi: 3.25, pis: 2.1, cofins: 9.65, desc: 'Instrumentos de óptica, medição e precisão' },
    '95': { ii: 18.0, ipi: 6.5, pis: 2.1, cofins: 9.65, desc: 'Brinquedos, jogos e artigos para entretenimento' }, '68': { ii: 10.8, ipi: 3.25, pis: 2.1, cofins: 9.65, desc: 'Obras de pedra, gesso ou cimento' },
    '69': { ii: 12.6, ipi: 5.0, pis: 2.1, cofins: 9.65, desc: 'Produtos cerâmicos' }, '70': { ii: 10.8, ipi: 3.25, pis: 2.1, cofins: 9.65, desc: 'Vidro e suas obras' }
  };
  /** Mesmo critério do getNCMAliquotas do sistema atual; `origem` diz de onde veio. */
  function aliquotasNCM(db, ncmCode) {
    const clean = String(ncmCode || '').replace(/\D/g, '');
    if (clean.length < 2) return { ii: 10.8, ipi: 0, pis: 2.1, cofins: 9.65, desc: 'Mercadoria geral', origem: 'default' };
    const salvo = ((db && db.ncmlib) || {})[clean];
    if (salvo && salvo.ii != null) return { ii: +salvo.ii, ipi: +salvo.ipi || 0, pis: salvo.pis != null ? +salvo.pis : 2.1, cofins: salvo.cofins != null ? +salvo.cofins : 9.65, desc: salvo.d || `NCM ${clean}`, c5291: !!salvo.c5291, mono: !!salvo.mono, origem: 'lib', por: salvo.por || '', em: salvo.em || '' };
    if (NCM_TABELA[clean]) return Object.assign({ origem: 'tabela' }, NCM_TABELA[clean]);
    const cap = clean.slice(0, 2);
    if (NCM_CAPITULO[cap]) return Object.assign({ origem: 'capitulo' }, NCM_CAPITULO[cap]);
    return { ii: 10.8, ipi: 3.25, pis: 2.1, cofins: 9.65, desc: `Mercadoria NCM Cap. ${cap}`, origem: 'estimativa' };
  }
  /** Registro do Catálogo de NCM a partir de um item (mesmo formato do ncmSave). */
  function registroNCM(it, por, hoje) {
    return { d: it.d || 'salvo do uso', ii: +it.ii || 0, ipi: +it.ipi || 0, pis: it.pis != null ? +it.pis : 2.1, cofins: it.cofins != null ? +it.cofins : 9.65, c5291: !!it.c5291, mono: !!it.mono, por: por || '', em: hoje || W.hojeISO() };
  }

  /* ==== Lista (qindex) e gravação ==== */
  /** Monta o registro de quotes[id] e a entrada de qindex — mesmo formato do saveQuote. */
  function snapshot(q, R) {
    const f = camposDe(q), fields = {};
    CAMPOS.forEach(k => { fields[k] = f[k]; });
    if (f.validadeFrete) fields.validadeFrete = f.validadeFrete;
    return Object.assign({}, q, { fields: Object.assign({}, (q && q.fields) || {}, fields), items: (q.items || []), exps: (q.exps || []), fotos: q.fotos || [], blocos: q.blocos || propostaBlocosPadrao(),
      status: q.status || 'draft', id: q.id, criadoPor: q.criadoPor, aprovadoPor: q.aprovadoPor, preco: (R && R.preco) || 0 });
  }
  function entradaIndice(q, R, anterior, por) {
    const f = camposDe(q);
    return Object.assign({}, anterior || {}, { id: q.id, label: (f.opNum || 'sem nº') + ' · ' + (f.cliente || 'sem cliente'), cliente: f.cliente, status: q.status || 'draft', preco: (R && R.preco) || 0, criadoPor: q.criadoPor || por || '', ts: Date.now() });
  }
  /**
   * Regras de gravação de uma cotação aprovada (saveQuote): aprovada só se
   * altera em modo de edição; se o PREÇO mudou, a aprovação cai e volta para o
   * Samir. Devolve { ok, revogou, registro } ou { ok:false, msg }.
   */
  function prepararGravacao(q, R, anterior, editando, por, agora) {
    const eraAprovada = !!(anterior && anterior.status === 'ok');
    if (eraAprovada && q.status === 'ok' && !editando) return { ok: false, msg: 'Cotação aprovada: clique em Editar cotação para alterar.' };
    let revogou = false;
    const n = Object.assign({}, q);
    if (eraAprovada && editando) {
      const antes = +(+anterior.preco || 0).toFixed(2), agoraP = +(+(R.preco || 0)).toFixed(2);
      if (Math.abs(agoraP - antes) > 0.005) { n.aprovadoPor = null; n.status = 'wait'; revogou = true; }
    }
    if (!n.id) n.id = 'q_' + Date.now();
    const s = snapshot(n, R);
    if (eraAprovada && editando) {
      s.editadoPor = por || ''; s.editadoEm = agora || new Date().toISOString();
      s.precoAprovado = revogou ? null : (anterior.precoAprovado != null ? anterior.precoAprovado : +(+anterior.preco || 0));
    }
    return { ok: true, revogou, registro: s };
  }

  /* ==== Operação + cronograma no Financeiro a partir da cotação aprovada (criarOpDaCotacao) ==== */
  const CRONO_OP = [{ dias: 5, rot: '1º' }, { dias: 35, rot: '2º' }, { dias: 95, rot: '3º' }];
  const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  /**
   * Devolve { op (nova ou null se já existe), lancamentos[], jaLancado }.
   * Aprovar de novo não duplica o cronograma (marca origem 'cotacao:<id>').
   */
  function operacaoDaCotacao(db, q, R, por, hoje) {
    const f = camposDe(q);
    const id = (f.opNum || ('OP' + Math.floor(Math.random() * 90 + 10))).toUpperCase();
    const existe = (db.ops || []).find(o => o && o.id === id);
    const op = existe ? null : { _id: W.novoId(), id, nome: f.mercadoria || f.cliente, cliente: f.cliente, status: '', prox: 'Emitir contrato e cobrar 1ª parcela', resp: 'Davi', obs: 'Criada a partir da cotação aprovada', criadaEm: new Date().toISOString(), quoteId: q.id };
    const marca = 'cotacao:' + (q.id || id);
    if ((db.fin || []).some(l => l && l.origem === marca)) return { id, op, lancamentos: [], jaLancado: true };
    const hj = hoje || W.hojeISO();
    const { o1, o2, o3 } = desemOuts(q, R);
    const recebe = [N(f, 'desR1'), N(f, 'desR2'), N(f, 'desR3')];
    const paga = [o1, o2, o3];
    if (recebe.reduce((a, b) => a + b, 0) <= 0) { recebe[0] = R.preco || 0; recebe[1] = 0; recebe[2] = 0; }
    const descPag = ['Sinal da fábrica (' + (N(f, 'fabSinal') || 30) + '% do FOB)', 'Saldo da fábrica · pré-embarque', 'Custos de chegada — impostos de importação, frete e despesas'];
    const out = [];
    const lancar = (venc, tipo, desc, valor) => { if (!(valor > 0)) return; out.push({ _id: W.novoId(), data: hj, vencimento: venc, op: id, tipo, categoria: '', fixo: false, empresa: 'WindGate', desc, valor: +(+valor).toFixed(2), status: 'Previsto', comp: '', nf: '', por: por || '', origem: marca }); };
    for (let k = 0; k < CRONO_OP.length; k++) {
      const venc = somaDias(hj, CRONO_OP[k].dias);
      lancar(venc, 'Receita', CRONO_OP[k].rot + ' recebimento do cliente — parcela ' + CRONO_OP[k].rot.replace('º', ''), recebe[k]);
      lancar(venc, 'Despesa', CRONO_OP[k].rot + ' pagamento — ' + descPag[k], paga[k]);
    }
    return { id, op, lancamentos: out, jaLancado: false };
  }

  /* ==== Proposta: blocos e rateio por item (mesmos do sistema atual) ==== */
  const PROPOSTA_BLOCOS = [
    { k: 'escopo', l: 'Escopo da operação', d: 'Parágrafo de abertura com mercadoria, origem e modalidade.' },
    { k: 'itens', l: 'Relação de itens e investimento total', d: 'Tabela de itens com preço unitário e a faixa do total.' },
    { k: 'fotos', l: 'Fotos do produto', d: 'Página com as fotos anexadas à cotação.' },
    { k: 'verde', l: 'Cobertura total WindGate', d: 'Caixa verde: tudo contemplado, sem custo adicional.' },
    { k: 'amarelo', l: 'Validade e câmbio', d: 'Caixa amarela: prazo de validade e regra cambial.' },
    { k: 'etapas', l: 'Etapas da operação', d: 'Do contrato à entrega, numeradas.' },
    { k: 'cronograma', l: 'Cronograma de desembolso', d: 'As 3 parcelas e o que cada uma libera.' },
    { k: 'perks', l: 'Por que vale mais (diferenciais)', d: 'Página de argumentos comerciais.' },
    { k: 'cta', l: 'Página de contato', d: '"Vamos começar?" com responsável, telefone e e-mail.' },
    { k: 'banco', l: 'Dados bancários para pagamento', d: 'Titular, banco, agência, conta, PIX e contato. Fora por padrão.', pad: false }
  ];
  const PROPOSTA_CUSTOS = [
    { k: 'cFob', l: 'Mercadoria (FOB)', v: R => R.comp.fob }, { k: 'cFrete', l: 'Frete internacional', v: R => R.comp.freteInt },
    { k: 'cTerrestre', l: 'Transporte terrestre', v: R => R.comp.terrestre }, { k: 'cSeguro', l: 'Seguro internacional', v: R => R.comp.seguro },
    { k: 'cImpostos', l: 'Impostos de nacionalização', v: R => R.impostos, sub: 'II, IPI, PIS, COFINS e ICMS de importação' },
    { k: 'cPorto', l: 'Despesas portuárias e de nacionalização', v: R => R.comp.portuarias, sub: 'capatazia, Siscomex, AFRMM e despesas do processo' },
    { k: 'cHonor', l: 'Honorários e despachante', v: R => R.comp.honorarios }
  ];
  const propostaBlocosPadrao = () => Object.assign(Object.fromEntries(PROPOSTA_BLOCOS.map(b => [b.k, b.pad !== false])), Object.fromEntries(PROPOSTA_CUSTOS.map(b => [b.k, false])), { difal: true });
  function propostaBlocos(q) {
    const salvos = (q && q.blocos) || {}, out = propostaBlocosPadrao();
    Object.keys(out).forEach(k => { if (salvos[k] === true || salvos[k] === false) out[k] = salvos[k]; });
    return out;
  }
  function propostaItens(q, R, base) {
    const f = camposDe(q), txD = N(f, 'txDesp'), its = (q.items || []);
    const tot = its.map(it => it.q * it.u * txD).reduce((s, v) => s + v, 0) || 1;
    const preco = (base != null ? base : (R.preco || 0));
    let acc = 0;
    return its.filter(it => it.d || it.q).map((it, i) => { const share = (it.q * it.u * txD) / tot; const t = +(preco * share).toFixed(2); acc += t; return { d: it.d || 'Item ' + (i + 1), ncm: it.ncm, q: it.q, total: t, unit: it.q > 0 ? t / it.q : t }; })
      .map((x, i, arr) => { if (i === arr.length - 1) { x.total = +(preco - (acc - x.total)).toFixed(2); x.unit = x.q > 0 ? x.total / x.q : x.total; } return x; });
  }

  const STATUS_COTA = { draft: ['rascunho', 'info'], wait: ['aguardando o Samir', 'warn'], ok: ['aprovada', 'ok'] };

  return { ICMS_INTERNO, SEM_DIFAL, DEFAULT_EXPS, CAMPOS, PADRAO, ITEM_PADRAO, camposDe, calcular, triCalcular, TRI_PADRAO, TRI_FONTES,
    precoDesem, desemOuts, desemSugerir, desemErros, aliquotasNCM, registroNCM, NCM_TABELA, snapshot, entradaIndice, prepararGravacao,
    operacaoDaCotacao, CRONO_OP, PROPOSTA_BLOCOS, PROPOSTA_CUSTOS, propostaBlocosPadrao, propostaBlocos, propostaItens, STATUS_COTA };
});
