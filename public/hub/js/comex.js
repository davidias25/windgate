/* =====================================================================
   WindGate Hub 2.0 — regras de comércio exterior (sem tela).

   Custeio da operação (simulado → previsto → realizado) com câmbio,
   relógio do contêiner (free time / demurrage), conta-corrente do cliente,
   motor tributário com vigência por data (CBS/IBS 2027, fim do benefício
   de ICMS de Alagoas em 2032), exposição em dólar, limite de crédito,
   compliance, contratos e a fila de exceções da Torre.

   Mesmo formato de módulo do regras.js: roda no navegador (window.WG) e no
   Node (require), para ser testado.
   ===================================================================== */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./regras.js'));
  else Object.assign(raiz.WG, fabrica(raiz.WG));
})(typeof self !== 'undefined' ? self : this, function (W) {
  const valorDe = l => +(l && l.valor) || 0;
  const r2 = v => Math.round((+v || 0) * 100) / 100;
  const somaDias = (iso, n) => { const d = new Date(W.soData(iso) + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const opsAtivas = db => (db.ops || []).filter(o => o && o.id && W.ativa(o));
  const lancOp = (db, op) => (db.fin || []).filter(l => l && l.op === op && !W.transferencia(l));

  /* ---------- Modalidade da operação ---------- */
  const MODALIDADES = [['conta e ordem', 'Conta e ordem'], ['encomenda', 'Encomenda'], ['propria', 'Própria (revenda)']];
  const modalidadeDe = o => (o && o.modalidade) || '';

  /* ---------- Custeio (landed cost) ---------- */
  const CLASSES = [
    ['fob', 'Mercadoria (FOB)'], ['frete', 'Frete internacional'], ['seguro', 'Seguro'], ['impostos', 'Impostos de importação'],
    ['porto', 'Porto, armazenagem e despachante'], ['demurrage', 'Demurrage e detention'], ['nacional', 'Frete nacional'],
    ['impVenda', 'Impostos de venda'], ['cambio', 'Variação cambial'], ['outros', 'Outros']
  ];
  const CLASSE_ROTULO = Object.fromEntries(CLASSES);
  /** Classe de custo de um lançamento: o campo `custo` vence; sem ele, a descrição decide. */
  function classeDe(l) {
    if (l && l.custo && CLASSE_ROTULO[l.custo]) return l.custo;
    const t = ((l && (l.desc || l.descricao || '')) + ' ' + ((l && l.categoria) || '')).toLowerCase();
    if (/demurrage|detention|sobreestadia/.test(t)) return 'demurrage';
    if (/difal|icms\s*(de\s*)?sa[ií]da|pis.*cofins.*(venda|sa[ií]da)|imposto(s)?\s*de\s*venda/.test(t)) return 'impVenda';
    if (/varia[çc][aã]o\s*cambial/.test(t)) return 'cambio';
    if (/seguro/.test(t)) return 'seguro';
    if (/frete\s*(rodovi|nacional|terrestre)|transporte|carreta|rodovi/.test(t)) return 'nacional';
    if (/frete|freight|ocean|agente\s*de\s*carga/.test(t)) return 'frete';
    if (/imposto|tributo|\bii\b|\bipi\b|icms|pis|cofins|duimp\s*-?\s*impostos/.test(t)) return 'impostos';
    if (/despachante|capatazia|armazen|siscomex|afrmm|porto|terminal|thc|honor[aá]rio|desconsolida|liberação|libera[çc][aã]o/.test(t)) return 'porto';
    if (/f[aá]brica|fob|proforma|fornecedor|sinal|saldo\s*(da\s*)?(f[aá]brica|fornecedor)|mercadoria|\d+\s*%/.test(t)) return 'fob';
    return 'outros';
  }

  const num = v => { if (v == null || v === '') return 0; if (typeof v === 'number') return isFinite(v) ? v : 0; const t = String(v).trim(); const n = /,/.test(t) ? +t.replace(/\./g, '').replace(',', '.') : +t; return isFinite(n) ? n : 0; };
  const numF = v => (typeof v === 'number' ? v : num(v));
  /** Custo da cotação (sistema atual), com as MESMAS fórmulas da tela de cotação. */
  function custoCotacao(q) {
    if (!q || !q.fields) return null;
    const f = q.fields, N = k => numF(f[k]);
    const txF = N('txFrete'), txD = N('txDesp'), pctInv = (f.pctInv === '' || f.pctInv == null ? 100 : N('pctInv')) / 100, icmsE = N('icmsEnt') / 100;
    const freteBRL = N('freteUSD') * txF, terrestre = N('transporte');
    const seguro = N('seguro'), capat = N('capatazia'), sisc = N('siscomex'), afrmm = N('afrmm'), honor = N('honorarios');
    const itens = Array.isArray(q.items) ? q.items : [];
    let fobBRLtot = 0, pesoTot = 0, fobUSD = 0;
    itens.forEach(it => { fobBRLtot += numF(it.q) * numF(it.u) * txD; fobUSD += numF(it.q) * numF(it.u); pesoTot += numF(it.q) * numF(it.p); });
    let II = 0, IPI = 0, PIS = 0, COF = 0, ICMSent = 0;
    itens.forEach(it => {
      const fob = numF(it.q) * numF(it.u) * txD; if (fobBRLtot <= 0) return;
      const share = fob / fobBRLtot, pesoShare = pesoTot > 0 ? (numF(it.q) * numF(it.p)) / pesoTot : share;
      const invRed = fob * pctInv, frete_i = share * freteBRL, seg_i = share * seguro, cap_i = share * capat;
      const cif = invRed + frete_i + seg_i + cap_i;
      const ii = cif * (numF(it.ii) / 100), ipi = (cif + ii) * (numF(it.ipi) / 100);
      const pis = cif * ((it.pis != null ? numF(it.pis) : 2.1) / 100), cof = cif * ((it.cofins != null ? numF(it.cofins) : 9.65) / 100);
      const ce = (invRed + frete_i + ii + ipi + pis + cof + share * sisc + pesoShare * afrmm + share * honor) / (1 - icmsE);
      II += ii; IPI += ipi; PIS += pis; COF += cof; ICMSent += ce * icmsE;
    });
    const despExtra = (Array.isArray(q.exps) ? q.exps : []).reduce((s, e) => s + numF(e && e.v), 0);
    const v = { fob: fobBRLtot, frete: freteBRL, seguro, impostos: II + IPI + PIS + COF + ICMSent, porto: despExtra + sisc + afrmm + honor + capat, nacional: terrestre };
    return { valores: v, total: Object.values(v).reduce((a, b) => a + b, 0), fobUSD, freteUSD: N('freteUSD'), taxa: txD, taxaFrete: txF, preco: numF(q.preco), tributos: { II, IPI, PIS, COF, ICMS: ICMSent } };
  }
  function cotacaoDaOp(db, o) {
    const qs = db.quotes || {};
    if (o.quoteId && qs[o.quoteId]) return Object.assign({ id: o.quoteId }, qs[o.quoteId]);
    const k = Object.keys(qs).find(id => qs[id] && qs[id].fields && String(qs[id].fields.opNum || '').trim().toUpperCase() === String(o.id).toUpperCase());
    return k ? Object.assign({ id: k }, qs[k]) : null;
  }
  const vazio = () => Object.fromEntries(CLASSES.map(([k]) => [k, 0]));

  /** Câmbio de uma operação: contratos, dólar coberto e variação sobre a taxa prevista. */
  function cambioOp(db, opId, taxaPrevista) {
    const cs = (db.hubCambio || []).filter(c => c && c.op === opId);
    const fechados = cs.filter(c => c.status === 'fechado' || c.status === 'liquidado');
    const usdFechado = fechados.reduce((a, c) => a + num(c.valorME), 0);
    const brlFechado = fechados.reduce((a, c) => a + num(c.valorME) * num(c.taxa), 0);
    const taxaMedia = usdFechado ? brlFechado / usdFechado : null;
    const variacao = taxaPrevista ? fechados.reduce((a, c) => a + num(c.valorME) * (num(c.taxa) - (num(c.taxaPrevista) || taxaPrevista)), 0) : 0;
    return { contratos: cs, usdFechado, brlFechado, taxaMedia, variacao, abertos: cs.filter(c => c.status === 'previsto') };
  }

  /** Custeio completo: simulado (cotação), previsto (aprovado), realizado (Financeiro) e câmbio. */
  function custeioOp(db, opId, opts) {
    const o = (db.ops || []).find(x => x && x.id === opId); if (!o) return null;
    const ptax = opts && opts.ptax ? +opts.ptax : null;
    const q = cotacaoDaOp(db, o), cq = custoCotacao(q);
    const simulado = vazio(); if (cq) Object.assign(simulado, cq.valores);
    const cus = o.custeio || {};
    const previsto = vazio(); Object.assign(previsto, cus.previsto || (cq ? cq.valores : {}));
    const fobUSD = num(cus.fobUSD) || (cq ? cq.fobUSD : 0), freteUSD = num(cus.freteUSD) || (cq ? cq.freteUSD : 0);
    const taxaPrevista = num(cus.taxaPrevista) || (cq ? cq.taxa : 0);
    const realizado = vazio(), aPagar = vazio(), receita = { prevista: 0, recebida: 0 };
    lancOp(db, opId).forEach(l => {
      if (W.ehReceita(l)) { if (W.realizado(l)) receita.recebida += valorDe(l); else receita.prevista += valorDe(l); return; }
      const c = classeDe(l); if (W.realizado(l)) realizado[c] += valorDe(l); else aPagar[c] += valorDe(l);
    });
    const cb = cambioOp(db, opId, taxaPrevista);
    // Dólar ainda sem contrato: vale a PTAX de hoje (quando há) ou a taxa prevista.
    const usdTotal = fobUSD + freteUSD, usdAberto = Math.max(0, usdTotal - cb.usdFechado);
    const impactoAberto = ptax && taxaPrevista ? usdAberto * (ptax - taxaPrevista) : 0;
    const soma = o2 => Object.values(o2).reduce((a, b) => a + b, 0);
    const totPrev = soma(previsto), totReal = soma(realizado), totAPagar = soma(aPagar);
    const receitaTotal = receita.prevista + receita.recebida || (cq ? cq.preco : 0) || num(cus.receitaPrevista);
    // Projetado por classe: o que já foi lançado (pago + a pagar); classe ainda sem lançamento
    // continua valendo o previsto, para a margem não parecer melhor do que é. Operação
    // encerrada vale só o lançado.
    const encerrada = !W.ativa(o);
    const proj = k => { const lanc = realizado[k] + aPagar[k]; return lanc > 0.005 || encerrada ? lanc : previsto[k]; };
    const linhas = CLASSES.map(([k, l]) => ({ k, l, simulado: simulado[k], previsto: previsto[k], realizado: realizado[k], aPagar: aPagar[k], projetado: proj(k), semLancamento: !(realizado[k] + aPagar[k]) && previsto[k] > 0, desvio: previsto[k] ? (proj(k) - previsto[k]) / previsto[k] : null }));
    const custoProjetado = linhas.reduce((a, x) => a + x.projetado, 0) + impactoAberto;
    const margem = v => receitaTotal ? (receitaTotal - v) / receitaTotal : null;
    return {
      op: o, cotacao: q ? q.id : null, temCotacao: !!cq, previstoAprovado: !!cus.previsto, aprovadoPor: cus.aprovadoPor || '', aprovadoEm: cus.aprovadoEm || '',
      linhas, simulado: soma(simulado), previsto: totPrev, realizado: totReal, aPagar: totAPagar, projetado: custoProjetado,
      receita: receitaTotal, receitaRecebida: receita.recebida, margemSimulada: cq && cq.preco ? (cq.preco - soma(simulado)) / cq.preco : null,
      margemPrevista: margem(totPrev), margemProjetada: margem(custoProjetado), desvio: totPrev ? (custoProjetado - totPrev) / totPrev : null,
      fobUSD, freteUSD, usdTotal, usdFechado: cb.usdFechado, usdAberto, taxaPrevista, taxaMedia: cb.taxaMedia, variacaoCambial: cb.variacao, impactoAberto, ptax,
      contratos: cb.contratos, lucroLiquido: receitaTotal ? (receitaTotal - custoProjetado) * (1 - 0.34) : null
    };
  }
  /** Aprova o previsto da operação (foto do custo na hora da aprovação). */
  function aprovarPrevisto(db, opId, valores, extra, por, agora) {
    const o = (db.ops || []).find(x => x && x.id === opId); if (!o) return null;
    o.custeio = Object.assign({}, o.custeio || {}, extra || {}, { previsto: Object.assign(vazio(), valores), aprovadoPor: por || '', aprovadoEm: agora || new Date().toISOString() });
    return o.custeio;
  }

  /* ---------- Câmbio: exposição em dólar ---------- */
  function exposicaoCambio(db, ptax, hoje) {
    const h = hoje || W.hojeISO();
    const abertos = (db.hubCambio || []).filter(c => c && c.status === 'previsto');
    const semanas = {};
    abertos.forEach(c => { const s = W.semanaDe(c.liquidacao || c.dataPrevista || h).ini; const x = semanas[s] = semanas[s] || { semana: s, usd: 0, brlPrevisto: 0 }; x.usd += num(c.valorME); x.brlPrevisto += num(c.valorME) * num(c.taxaPrevista); });
    const usd = abertos.reduce((a, c) => a + num(c.valorME), 0), brlPrevisto = abertos.reduce((a, c) => a + num(c.valorME) * num(c.taxaPrevista), 0);
    // Operações ativas com dólar a pagar que ainda não tem contrato nem previsão de câmbio.
    const semContrato = opsAtivas(db).map(o => { const c = custeioOp(db, o.id, { ptax }); const previstoUSD = abertos.filter(x => x.op === o.id).reduce((a, x) => a + num(x.valorME), 0); return { op: o.id, cliente: o.cliente, usd: Math.max(0, c.usdAberto - previstoUSD), taxaPrevista: c.taxaPrevista }; }).filter(x => x.usd > 0.5);
    const usdSem = semContrato.reduce((a, x) => a + x.usd, 0);
    const brlSem = semContrato.reduce((a, x) => a + x.usd * (x.taxaPrevista || ptax || 0), 0);
    return { usd, brlPrevisto, brlHoje: ptax ? usd * ptax : null, impacto: ptax ? usd * ptax - brlPrevisto : null, taxaMediaPrevista: usd ? brlPrevisto / usd : null,
      semanas: Object.values(semanas).sort((a, b) => a.semana.localeCompare(b.semana)), semContrato, usdSemContrato: usdSem, impactoSemContrato: ptax ? usdSem * ptax - brlSem : null };
  }

  /* ---------- Relógio do contêiner ---------- */
  const FREE_TIME_PADRAO = { dry: 7, reefer: 5 };
  const ehReefer = c => /rf|reefer|refriger/i.test((c && c.tipo) || '');
  function freeTimeDe(db, c) {
    if (c && +c.freeTime > 0) return +c.freeTime;
    const tab = (((db.hubPainel || {})._comex || {}).freeTime) || {};
    const a = c && c.armador && tab[String(c.armador).toLowerCase()];
    if (a && +a > 0) return +a;
    return ehReefer(c) ? FREE_TIME_PADRAO.reefer : FREE_TIME_PADRAO.dry;
  }
  /** Prazo grátis do contêiner. Dia 1 = dia da descarga. */
  function relogioConteiner(db, c, hoje) {
    const h = hoje || W.hojeISO();
    if (!c || !W.ehISO(c.descarga)) return { status: 'sem-descarga', freeTime: freeTimeDe(db, c) };
    const ft = freeTimeDe(db, c), limite = somaDias(c.descarga, ft - 1), diaria = num(c.diaria) || (ehReefer(c) ? 460 : 75);
    const fim = W.ehISO(c.devolucao) ? W.soData(c.devolucao) : h;
    const excedidos = Math.max(0, W.diasEntre(limite, fim));
    const restantes = W.diasEntre(h, limite);
    const status = W.ehISO(c.devolucao) ? (excedidos ? 'devolvido-com-custo' : 'devolvido') : excedidos ? 'vencido' : restantes <= 2 ? 'atencao' : 'ok';
    return { status, freeTime: ft, limite, restantes, excedidos, diaria, custoUSD: excedidos * diaria };
  }
  function conteineres(db, hoje) {
    const out = [];
    (db.ops || []).filter(o => o && o.id && Array.isArray(o.containers)).forEach(o => o.containers.forEach((c, i) => { if (c && c.numero) out.push(Object.assign({ op: o.id, cliente: o.cliente, idx: i, c }, relogioConteiner(db, c, hoje))); }));
    const ordem = { vencido: 0, atencao: 1, ok: 2, 'sem-descarga': 3, 'devolvido-com-custo': 4, devolvido: 5 };
    return out.sort((a, b) => (ordem[a.status] - ordem[b.status]) || String(a.limite || '').localeCompare(String(b.limite || '')));
  }

  /* ---------- Conta-corrente do cliente e prestação de contas ---------- */
  function contaCorrente(db, opId, hoje) {
    const o = (db.ops || []).find(x => x && x.id === opId) || { id: opId };
    const mod = modalidadeDe(o), d = W.desembolsoOp(db, opId, hoje);
    const itemizado = mod === 'conta e ordem';
    const movs = [];
    d.parcelas.forEach(l => movs.push({ data: W.soData(l.liquidadoEm || W.vencDe(l)), desc: l.desc || l.descricao || 'Recebimento', entrada: valorDe(l), saida: 0, realizado: W.realizado(l), id: l._id }));
    d.saidas.forEach(l => movs.push({ data: W.soData(l.liquidadoEm || W.vencDe(l)), desc: l.desc || l.descricao || CLASSE_ROTULO[classeDe(l)], classe: classeDe(l), entrada: 0, saida: valorDe(l), realizado: W.realizado(l), id: l._id }));
    movs.sort((a, b) => a.data.localeCompare(b.data) || (b.entrada - a.entrada));
    let s = 0; movs.forEach(m => { if (m.realizado) s += m.entrada - m.saida; m.saldo = r2(s); });
    const pago = d.saidas.filter(W.realizado).reduce((a, l) => a + valorDe(l), 0), aPagar = d.saidas.filter(l => !W.realizado(l)).reduce((a, l) => a + valorDe(l), 0);
    const saldo = d.recebido - pago, saldoFinal = d.total - pago - aPagar;
    return { op: o, modalidade: mod, itemizado, movimentos: movs, recebido: d.recebido, aReceber: d.aReceber, pago, aPagar, saldo: r2(saldo), saldoFinal: r2(saldoFinal),
      situacao: !itemizado ? 'preço fechado' : saldoFinal > 0.005 ? 'a devolver ao cliente' : saldoFinal < -0.005 ? 'a cobrar do cliente' : 'zerado', bloqueios: d.bloqueios, encerrada: !W.ativa(o) };
  }

  /* ---------- Limite de crédito por cliente ---------- */
  function creditoClientes(db, hoje) {
    const h = hoje || W.hojeISO(), lim = ((db.hubPainel || {})._credito) || {};
    const por = {};
    (db.ops || []).filter(o => o && o.id && o.cliente).forEach(o => {
      const c = por[o.cliente] = por[o.cliente] || { cliente: o.cliente, exposicao: 0, vencido: 0, ops: 0, atrasos: [] };
      const ls = lancOp(db, o.id);
      const pago = ls.filter(l => !W.ehReceita(l) && W.realizado(l)).reduce((a, l) => a + valorDe(l), 0);
      const recebido = ls.filter(l => W.ehReceita(l) && W.realizado(l)).reduce((a, l) => a + valorDe(l), 0);
      if (W.ativa(o)) { c.ops++; c.exposicao += Math.max(0, pago - recebido); }
      ls.filter(l => W.ehReceita(l)).forEach(l => {
        if (!W.realizado(l) && W.vencDe(l) < h) c.vencido += valorDe(l);
        if (W.realizado(l) && l.liquidadoEm) c.atrasos.push(Math.max(0, W.diasEntre(W.vencDe(l), W.soData(l.liquidadoEm)) || 0));
      });
    });
    return Object.values(por).map(c => { const limite = num(lim[c.cliente]); const usado = c.exposicao + c.vencido;
      return Object.assign(c, { limite, usado, pct: limite ? usado / limite : null, atrasoMedio: c.atrasos.length ? c.atrasos.reduce((a, b) => a + b, 0) / c.atrasos.length : null, estourado: !!limite && usado > limite }); })
      .sort((a, b) => b.usado - a.usado);
  }

  /* ---------- Motor tributário com vigência por data ----------
     Alíquotas de transição da LC 214/2025. Valores de CBS/IBS "cheios" são
     ESTIMATIVAS de referência até o Senado fixar as alíquotas: ficam
     editáveis no Hub (hubPainel._tributos) e toda tela mostra a fonte. */
  const REGRAS_TRIBUTARIAS = [
    { k: 'pisCofinsImp', l: 'PIS/COFINS-Importação', de: '2000-01-01', ate: '2026-12-31', fonte: 'Lei 10.865/2004; extintos em 2027 (LC 214/2025)' },
    { k: 'cbs', l: 'CBS', de: '2026-01-01', ate: '2026-12-31', aliq: 0.9, recolhe: false, fonte: 'LC 214/2025, art. 343: teste, compensável' },
    { k: 'cbs', l: 'CBS', de: '2027-01-01', ate: '2099-12-31', aliq: 8.8, recolhe: true, estimativa: true, fonte: 'LC 214/2025; alíquota de referência a ser fixada (estimativa)' },
    { k: 'ibs', l: 'IBS', de: '2026-01-01', ate: '2028-12-31', aliq: 0.1, recolhe: false, fonte: 'LC 214/2025: 0,1% em teste' },
    { k: 'ibs', l: 'IBS', de: '2029-01-01', ate: '2029-12-31', aliq: 1.77, recolhe: true, estimativa: true, fonte: '10% da referência estimada (17,7%)' },
    { k: 'ibs', l: 'IBS', de: '2030-01-01', ate: '2030-12-31', aliq: 3.54, recolhe: true, estimativa: true, fonte: '20% da referência estimada' },
    { k: 'ibs', l: 'IBS', de: '2031-01-01', ate: '2031-12-31', aliq: 5.31, recolhe: true, estimativa: true, fonte: '30% da referência estimada' },
    { k: 'ibs', l: 'IBS', de: '2032-01-01', ate: '2032-12-31', aliq: 7.08, recolhe: true, estimativa: true, fonte: '40% da referência estimada' },
    { k: 'ibs', l: 'IBS', de: '2033-01-01', ate: '2099-12-31', aliq: 17.7, recolhe: true, estimativa: true, fonte: 'referência estimada' },
    { k: 'icmsFator', l: 'ICMS (parcela que ainda vale)', de: '2000-01-01', ate: '2028-12-31', aliq: 100, fonte: 'EC 132/2023' },
    { k: 'icmsFator', l: 'ICMS (parcela que ainda vale)', de: '2029-01-01', ate: '2029-12-31', aliq: 90, fonte: 'EC 132/2023' },
    { k: 'icmsFator', l: 'ICMS (parcela que ainda vale)', de: '2030-01-01', ate: '2030-12-31', aliq: 80, fonte: 'EC 132/2023' },
    { k: 'icmsFator', l: 'ICMS (parcela que ainda vale)', de: '2031-01-01', ate: '2031-12-31', aliq: 70, fonte: 'EC 132/2023' },
    { k: 'icmsFator', l: 'ICMS (parcela que ainda vale)', de: '2032-01-01', ate: '2032-12-31', aliq: 60, fonte: 'EC 132/2023' },
    { k: 'icmsFator', l: 'ICMS (parcela que ainda vale)', de: '2033-01-01', ate: '2099-12-31', aliq: 0, fonte: 'EC 132/2023: ICMS extinto' },
    { k: 'beneficioAL', l: 'Benefício de ICMS de Alagoas', de: '2000-01-01', ate: '2032-12-31', fonte: 'LC 160/2017 + LC 186/2021: incentivos até 31/12/2032' },
    { k: 'ipi', l: 'IPI (fora da Zona Franca)', de: '2000-01-01', ate: '2026-12-31', fonte: 'zerado a partir de 2027 (LC 214/2025), exceto ZFM' }
  ];
  function regrasTributarias(db) {
    const ed = ((db && db.hubPainel) || {})._tributos;
    return Array.isArray(ed) && ed.length ? ed : REGRAS_TRIBUTARIAS;
  }
  /** O que vale numa data: alíquotas e se cada tributo existe/é recolhido. */
  function tributosNaData(db, data) {
    const d = W.soData(data || W.hojeISO()), rs = regrasTributarias(db).filter(r => r.de <= d && d <= r.ate);
    const pega = k => rs.find(r => r.k === k);
    const cbs = pega('cbs'), ibs = pega('ibs'), icms = pega('icmsFator');
    return { data: d, pisCofinsImp: !!pega('pisCofinsImp'), ipi: !!pega('ipi'), beneficioAL: !!pega('beneficioAL'),
      cbs: cbs ? { aliq: +cbs.aliq || 0, recolhe: !!cbs.recolhe, estimativa: !!cbs.estimativa } : { aliq: 0, recolhe: false },
      ibs: ibs ? { aliq: +ibs.aliq || 0, recolhe: !!ibs.recolhe, estimativa: !!ibs.estimativa } : { aliq: 0, recolhe: false },
      icmsFator: icms ? (+icms.aliq || 0) / 100 : 0, regras: rs };
  }
  /** Avisos de calendário para uma operação ou cotação que entrega numa data. */
  function avisosTributarios(db, entrega) {
    const t = tributosNaData(db, entrega), av = [];
    if (t.cbs.recolhe && !t.pisCofinsImp) av.push('Entrega em ' + t.data.slice(0, 4) + ': PIS/COFINS dão lugar à CBS' + (t.cbs.estimativa ? ' (alíquota ainda estimada)' : '') + '. Recalcular a cotação.');
    if (!t.ipi) av.push('IPI zerado nesta data (fora da Zona Franca).');
    if (t.icmsFator < 1) av.push('ICMS a ' + Math.round(t.icmsFator * 100) + '% e IBS de ' + t.ibs.aliq + '%.');
    if (!t.beneficioAL) av.push('Sem o benefício de ICMS de Alagoas nesta data.');
    return av;
  }
  /** "E se" ano a ano: quanto do ganho do benefício de AL sobra, 2026 → 2033.
     beneficioAnual = ganho de hoje com o benefício (R$), margemAnual = margem de hoje (R$). */
  function simularTransicao(db, beneficioAnual, margemAnual) {
    const anos = [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034];
    return anos.map(a => { const t = tributosNaData(db, a + '-07-01'); const ganho = t.beneficioAL ? beneficioAnual * t.icmsFator : 0;
      return { ano: a, icmsFator: t.icmsFator, beneficio: t.beneficioAL, cbs: t.cbs.aliq, ibs: t.ibs.aliq, ganho, margem: margemAnual - beneficioAnual + ganho, perda: beneficioAnual - ganho }; });
  }

  /* ---------- Compliance e habilitações ---------- */
  const COMPLIANCE_TIPOS = ['Radar', 'Certificado A1', 'Procuração do despachante', 'Procuração no Portal Único', 'LPCO / licença', 'Contrato social / alteração', 'Certidão negativa', 'Outro'];
  function complianceVencendo(db, hoje, dias) {
    const h = hoje || W.hojeISO(), ate = somaDias(h, dias == null ? 30 : dias);
    return (db.hubCompliance || []).filter(c => c && W.ehISO(c.validade) && c.validade <= ate).map(c => Object.assign({}, c, { dias: W.diasEntre(h, c.validade), vencido: c.validade < h })).sort((a, b) => a.validade.localeCompare(b.validade));
  }

  /* ---------- Contratos de compra e venda ---------- */
  function contratoDaOp(db, o) {
    return (db.hubContratos || []).find(c => c && c.status !== 'cancelado' && (c.op === o.id || (c.cliente && c.cliente === o.cliente && c.tipo === 'guarda-chuva' && (!c.vigencia || c.vigencia >= W.hojeISO())))) || null;
  }
  function modeloContrato(d) {
    const x = Object.assign({ cliente: '[CLIENTE]', cnpjCliente: '[CNPJ]', empresa: 'SF TRADING LTDA', cnpjEmpresa: '58.762.606/0001-44', modalidade: 'conta e ordem', produto: '[PRODUTO]', op: '[OP]' }, d || {});
    const co = x.modalidade === 'conta e ordem';
    return `CONTRATO DE ${co ? 'PRESTAÇÃO DE SERVIÇOS DE IMPORTAÇÃO POR CONTA E ORDEM DE TERCEIRO' : 'IMPORTAÇÃO POR ENCOMENDA'}

IMPORTADORA: ${x.empresa}, CNPJ ${x.cnpjEmpresa}.
${co ? 'ADQUIRENTE' : 'ENCOMENDANTE'}: ${x.cliente}, CNPJ ${x.cnpjCliente}.

1. OBJETO. ${co ? 'A IMPORTADORA promoverá, em seu nome e por conta e ordem do ADQUIRENTE, o despacho aduaneiro de importação de' : 'A IMPORTADORA adquirirá no exterior, com recursos próprios, para revenda ao ENCOMENDANTE,'} ${x.produto}, referência ${x.op}.
2. VINCULAÇÃO NO SISCOMEX. ${co ? 'O ADQUIRENTE declara estar habilitado no Radar e autoriza a vinculação no Portal Único antes do registro da declaração.' : 'O ENCOMENDANTE declara estar habilitado no Radar e autoriza a vinculação como encomendante predeterminado.'}
3. RECURSOS (NUMERÁRIO). ${co ? 'O ADQUIRENTE adiantará os valores de cada etapa antes do respectivo pagamento a terceiros. Sem o numerário, a IMPORTADORA não está obrigada a efetuar o pagamento.' : 'O preço será pago nas parcelas e datas da proposta comercial aceita.'}
4. PRESTAÇÃO DE CONTAS. ${co ? 'Ao fim da operação a IMPORTADORA apresentará a prestação de contas, com devolução ou cobrança do saldo em até 10 dias.' : 'Não se aplica: preço fechado, salvo o previsto na cláusula 6.'}
5. CÂMBIO. Valores em moeda estrangeira serão convertidos pela taxa efetivamente contratada. A variação cambial entre a proposta e o fechamento ${co ? 'é do ADQUIRENTE' : 'será repassada conforme a proposta'}.
6. REAJUSTE TRIBUTÁRIO. Alterações de tributos ou alíquotas após a proposta, incluindo a substituição de PIS/COFINS pela CBS, a criação do IBS e a redução do ICMS previstas na EC 132/2023 e na LC 214/2025, serão repassadas ao preço na exata medida do impacto, com memória de cálculo.
7. DEMURRAGE E ARMAZENAGEM. Custos por atraso na retirada ou devolução de contêineres causados pelo ${co ? 'ADQUIRENTE' : 'ENCOMENDANTE'} serão de sua responsabilidade.
8. FORO. Fortaleza/CE.

Modelo para revisão jurídica antes da assinatura.`;
  }

  /* ---------- Marcos planejado × real por etapa ---------- */
  function marcos(db, o) {
    const hist = (db.opStatusHist || []).filter(x => x && x.op === o.id && x.para);
    const plano = o.plano || {};
    const atual = W.FLUXO.indexOf(o.status);
    return W.FLUXO.map((k, i) => { const h = hist.filter(x => x.para === k).sort((a, b) => String(a.em).localeCompare(String(b.em)))[0];
      const real = h ? W.soData(h.em) : null, plan = plano[k] || null, passou = atual >= 0 && i <= atual;
      // Etapa já passada sem registro de data: não dá para medir; etapa futura com plano vencido: atraso até hoje.
      return { k, l: W.stMeta(k).l, plan, real, passou, atraso: plan && real ? W.diasEntre(plan, real) : plan && !real && !passou && plan < W.hojeISO() ? W.diasEntre(plan, W.hojeISO()) : null, motivo: (o.planoMotivos || {})[k] || '' }; });
  }

  /* ---------- Fila de exceções da Torre ----------
     Só entra o que pede ação. Cada item tem dono (perfil), nível e para onde ir. */
  function excecoes(db, k, hoje, extra) {
    const h = hoje || W.hojeISO(), ptax = extra && extra.ptax, p = W.perfilDe(db, k).id, fin = W.pode(db, k, 'fin.ver'), res = W.pode(db, k, 'fin.resultado');
    const out = [], add = (x) => out.push(x);
    const meu = donos => !donos || donos.includes(p) || p === 'diretoria';
    opsAtivas(db).forEach(o => {
      const pi = W.prazoInfo(db, o, h);
      if (pi.sit === 'atrasado' && meu(['operacoes', 'frete', 'documentos'])) add({ tipo: 'prazo', nivel: 2, titulo: `${o.id} atrasada em ${W.stMeta(o.status).l}`, detalhe: `${pi.dias != null ? pi.dias + ' dia(s) na etapa' : ''} · ${o.cliente || ''}`, op: o.id, ir: ['ficha', o.id] });
      const eh = (o.etaHist || []).slice(-1)[0];
      if (eh && Math.abs(W.diasEntre(eh.de, eh.para) || 0) > 3 && W.diasEntre(W.soData(eh.em), h) <= 7 && meu(['operacoes', 'frete'])) add({ tipo: 'eta', nivel: 2, titulo: `ETA da ${o.id} mudou ${W.diasEntre(eh.de, eh.para) > 0 ? '+' : ''}${W.diasEntre(eh.de, eh.para)} dias`, detalhe: `${W.dataBR(eh.de)} → ${W.dataBR(eh.para)}. Avisar o cliente e rever a semana dos impostos.`, op: o.id, ir: ['ficha', o.id] });
      if (['conta e ordem', 'encomenda'].includes(o.modalidade) && !contratoDaOp(db, o) && meu(['operacoes'])) add({ tipo: 'contrato', nivel: 1, titulo: `${o.id} sem contrato de ${o.modalidade}`, detalhe: o.cliente || '', op: o.id, ir: ['contratos'] });
      if (!o.modalidade && meu(['operacoes'])) add({ tipo: 'cadastro', nivel: 1, titulo: `${o.id} sem modalidade`, detalhe: 'Conta e ordem, encomenda ou própria: muda impostos, documentos e numerário.', op: o.id, ir: ['ficha', o.id] });
      if (res) { const c = custeioOp(db, o.id, { ptax });
        if (c.previstoAprovado && c.desvio != null && c.desvio > 0.05) add({ tipo: 'custo', nivel: 2, titulo: `${o.id}: custo ${Math.round(c.desvio * 100)}% acima do previsto`, detalhe: `projetado ${W.fmtBRLk(c.projetado)} × previsto ${W.fmtBRLk(c.previsto)}`, op: o.id, ir: ['custeio', o.id] });
        if (c.margemProjetada != null && c.receita > 0 && c.margemProjetada < 0.10) add({ tipo: 'margem', nivel: 3, titulo: `${o.id}: margem projetada ${Math.round(c.margemProjetada * 100)}%`, detalhe: 'abaixo de 10%' + (c.impactoAberto > 0 ? ` · dólar sem contrato pesa ${W.fmtBRLk(c.impactoAberto)}` : ''), op: o.id, ir: ['custeio', o.id] }); }
    });
    if (meu(['operacoes', 'frete'])) conteineres(db, h).filter(c => c.status === 'vencido' || c.status === 'atencao').forEach(c => add({ tipo: 'conteiner', nivel: c.status === 'vencido' ? 3 : 2, titulo: `Contêiner ${c.c.numero} (${c.op}) ${c.status === 'vencido' ? `em demurrage há ${c.excedidos} dia(s)` : `vence o free time em ${c.restantes} dia(s)`}`, detalhe: `limite ${W.dataBR(c.limite)}${c.status === 'vencido' ? ` · ≈ US$ ${Math.round(c.custoUSD)} até hoje` : ''}`, op: c.op, ir: ['conteineres'] }));
    if (meu(['documentos', 'operacoes'])) (db.docs || []).filter(d => d && /rejeit/i.test(d.status || '')).slice(0, 10).forEach(d => add({ tipo: 'doc', nivel: 2, titulo: `Documento rejeitado: ${d.nome || d.grupo}`, detalhe: `${d.op || ''} · ${d.motivo || d.rejeicao || ''}`, op: d.op, ir: ['docs'] }));
    if (fin) {
      if (W.pode(db, k, 'fin.autorizar')) { const n = (db.fin || []).filter(l => l && l.aprovacaoPendente).length; if (n) add({ tipo: 'aprovacao', nivel: 2, titulo: `${n} lançamento(s) aguardando sua aprovação`, detalhe: 'propostos pela conciliação', ir: ['torre'] }); }
      const ext = (db.hubExtratos || []).filter(Boolean).sort((a, b) => String(b.mes).localeCompare(String(a.mes)))[0];
      if (ext && W.divergencias) { const dv = W.divergencias(db, ext); const n = dv.semLancamento.filter(t => !t.lancId && !t.decisao).length; if (n) add({ tipo: 'banco', nivel: 2, titulo: `${n} movimento(s) do banco sem lançamento`, detalhe: `${ext.banco || ''} ${ext.mes}`, ir: ['fiscal'] }); }
      (db.hubCambio || []).filter(c => c && c.status === 'previsto' && W.ehISO(c.liquidacao) && W.diasEntre(h, c.liquidacao) <= 7).forEach(c => add({ tipo: 'cambio', nivel: 2, titulo: `Fechar câmbio: US$ ${Math.round(num(c.valorME)).toLocaleString('pt-BR')} (${c.op || ''})`, detalhe: `pagamento em ${W.dataBR(c.liquidacao)}${ptax && num(c.taxaPrevista) ? ` · PTAX ${ptax.toFixed(4)} × prevista ${num(c.taxaPrevista).toFixed(4)}` : ''}`, op: c.op, ir: ['cambio'] }));
      creditoClientes(db, h).filter(c => c.estourado).forEach(c => add({ tipo: 'credito', nivel: 3, titulo: `${c.cliente} acima do limite de crédito`, detalhe: `${W.fmtBRLk(c.usado)} de ${W.fmtBRLk(c.limite)}`, ir: ['credito'] }));
    }
    if (meu(['operacoes'])) complianceVencendo(db, h, 30).forEach(c => add({ tipo: 'compliance', nivel: c.vencido ? 3 : 1, titulo: `${c.tipo}${c.empresa ? ' ' + c.empresa : ''} ${c.vencido ? 'VENCIDO' : `vence em ${c.dias} dia(s)`}`, detalhe: c.titulo || '', ir: ['compliance'] }));
    return out.sort((a, b) => b.nivel - a.nivel);
  }

  return { MODALIDADES, modalidadeDe, CLASSES, CLASSE_ROTULO, classeDe, custoCotacao, cotacaoDaOp, custeioOp, cambioOp, aprovarPrevisto, exposicaoCambio,
    FREE_TIME_PADRAO, freeTimeDe, relogioConteiner, conteineres, contaCorrente, creditoClientes,
    REGRAS_TRIBUTARIAS, regrasTributarias, tributosNaData, avisosTributarios, simularTransicao,
    COMPLIANCE_TIPOS, complianceVencendo, contratoDaOp, modeloContrato, marcos, excecoes };
});
