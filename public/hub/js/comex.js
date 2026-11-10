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
  /* Da expressão mais específica para a mais geral: o que casa sai do texto, e "frete nacional" não conta também como frete
     nem "imposto de venda" como imposto de importação. Impostos vêm antes de frete. */
  const PADROES_CLASSE = [
    ['demurrage', /demurrage|detention|sobreestadia/g],
    ['impVenda', /difal|icms\s*(de\s*)?sa[ií]da|pis[^,;]*cofins[^,;]*(venda|sa[ií]da)|imposto(s)?\s*de\s*venda/g],
    ['cambio', /varia[çc][aã]o\s*cambial/g],
    ['seguro', /seguro/g],
    ['nacional', /frete\s*(rodovi[aá]rio|nacional|terrestre)|transporte|carreta|rodovi[aá]rio/g],
    ['impostos', /impostos?(\s*de\s*importa[çc][aã]o)?|tributos?|\bii\b|\bipi\b|icms|\bpis\b|cofins/g],
    ['frete', /frete(\s*internacional)?|freight|ocean|agente\s*de\s*carga/g],
    ['porto', /despachante|capatazia|armazen\w*|siscomex|afrmm|porto|terminal|\bthc\b|honor[aá]rios?|desconsolida\w*|libera[çc][aã]o|despesas?/g],
    ['fob', /f[aá]brica|\bfob\b|proforma|fornecedor|sinal|saldo|mercadoria/g]
  ];
  /** Classes que o texto cita, na ordem de prioridade. */
  function classesDoTexto(texto) {
    let t = String(texto || '').toLowerCase(); const achadas = [];
    PADROES_CLASSE.forEach(([k, re]) => { const sem = t.replace(re, ' '); if (sem !== t) achadas.push(k); t = sem; });
    return achadas;
  }
  /** Lançamento sem classe escolhida cuja descrição cita mais de uma: a tela pede para escolher ou dividir. */
  const classesAmbiguas = l => {
    if (!l || (l.custo && CLASSE_ROTULO[l.custo])) return [];
    const c = classesDoTexto(l.desc || l.descricao || '');
    return c.length > 1 ? c : [];
  };
  /** Classe de custo de um lançamento: o campo `custo` vence; sem ele, a descrição decide. */
  function classeDe(l) {
    if (l && l.custo && CLASSE_ROTULO[l.custo]) return l.custo;
    const desc = (l && (l.desc || l.descricao)) || '';
    const c = classesDoTexto(desc + ' ' + ((l && l.categoria) || ''));
    if (c.length) return c[0];
    return /\d+\s*%/.test(String(desc)) ? 'fob' : 'outros';
  }
  /** Divide um lançamento previsto em partes de classe definida, sem mudar o total. */
  function dividirLancamento(db, id, partes) {
    const l = (db.fin || []).find(x => x && x._id === id);
    if (!l) return { ok: false, msg: 'Lançamento não encontrado.' };
    if (W.realizado(l)) return { ok: false, msg: 'Lançamento já realizado não é dividido.' };
    const ps = (partes || []).filter(p => p && +p.valor > 0 && CLASSE_ROTULO[p.custo]);
    if (ps.length < 2) return { ok: false, msg: 'Informe ao menos duas partes com classe e valor.' };
    if (Math.abs(ps.reduce((a, p) => a + +p.valor, 0) - valorDe(l)) > 0.005) return { ok: false, msg: `As partes precisam somar ${W.fmtBRL(valorDe(l))}.` };
    const base = String(l.desc || l.descricao || '').split(' — ')[0];
    const novos = ps.slice(1).map(p => Object.assign({}, l, { _id: W.novoId(), desc: base + ' — ' + CLASSE_ROTULO[p.custo], valor: r2(+p.valor), custo: p.custo, divididoDe: l._id }));
    Object.assign(l, { desc: base + ' — ' + CLASSE_ROTULO[ps[0].custo], valor: r2(+ps[0].valor), custo: ps[0].custo });
    db.fin.push(...novos);
    return { ok: true, partes: [l].concat(novos) };
  }

  const num = v => { if (v == null || v === '') return 0; if (typeof v === 'number') return isFinite(v) ? v : 0; const t = String(v).trim(); const n = /,/.test(t) ? +t.replace(/\./g, '').replace(',', '.') : +t; return isFinite(n) ? n : 0; };
  const numF = v => (typeof v === 'number' ? v : num(v));
  /* O motor da cotação é carregado junto no navegador; no Node, sob demanda. */
  const motorCotacao = () => (typeof W.calcular === 'function' ? W : require('./cotacao-regras.js'));
  /** Custo da cotação (sistema atual), com as MESMAS fórmulas da tela de cotação; o imposto de venda vem do motor. */
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
    const v = { fob: fobBRLtot, frete: freteBRL, seguro, impostos: II + IPI + PIS + COF + ICMSent, porto: despExtra + sisc + afrmm + honor + capat, nacional: terrestre, impVenda: 0 };
    /* Imposto de venda: resultante de saída e DIFAL, lidos do motor.
       Triangular: as parcelas do custo do grupo. Direta: o resultante; o DIFAL/ST o cliente paga à parte,
       então entra dos dois lados (preço e custo) e não aparece como lucro nem como saída de caixa. */
    let difalCliente = 0, R = null;
    try { R = q._RCliente || motorCotacao().calcular(q); } catch (e) { R = null; }
    if (R && R.tri) {
      const parc = R.tri.apuracao.bloco6.parcelas, de = re => parc.filter(([n]) => re.test(n)).reduce((a, [, x]) => a + x, 0);
      Object.assign(v, { fob: de(/^FOB/), frete: de(/^Frete internacional/), seguro: de(/^Seguro/), impostos: de(/^Impostos de importa/), porto: de(/^Despesas de nacional/), nacional: de(/^Frete terrestre/), impVenda: de(/^Resultante|^ICMS l[ií]quido|^DIFAL/) });
    } else if (R) { difalCliente = R.st || 0; v.impVenda = (R.resultante || 0) + difalCliente; }
    /* Filha: frete, seguro e despesas pelo rateio comercial; o resto segue o cálculo fiscal do cliente. */
    if (q._custoPor) { const p = q._custoPor; Object.assign(v, { frete: p.frete, seguro: p.seguro, porto: p.capatazia + p.siscomex + p.afrmm + p.honorarios + p.demais, nacional: p.terrestre }); }
    return { valores: v, total: Object.values(v).reduce((a, b) => a + b, 0), fobUSD, freteUSD: N('freteUSD'), taxa: txD, taxaFrete: txF, preco: numF(q.preco), difalCliente, tributos: { II, IPI, PIS, COF, ICMS: ICMSent } };
  }
  /* Capacidade padrão, editável na operação-mãe. */
  const CAPACIDADE_CONTEINER = [[/20/, 33, 28000], [/H[QC]/i, 76, 26500], [/40/, 67, 26500]];
  const capacidadeDoTipo = tipo => { const c = CAPACIDADE_CONTEINER.find(([re]) => re.test(String(tipo || ''))); return c ? { m3: c[1], kg: c[2] } : { m3: 0, kg: 0 }; };
  /** m³, peso e FOB da filha: o digitado na operação vale; sem ele, vem da cotação ligada. */
  function medidasFilha(db, o) {
    const q = cotacaoDaOp(db, o), its = (q && Array.isArray(q.items) ? q.items : []).filter(Boolean);
    const soma = fn => its.reduce((a, it) => a + (+it.q || 0) * (+fn(it) || 0), 0);
    const cbmCompleto = its.length > 0 && its.every(it => (+it.q || 0) * (+it.cbm || 0) > 0);
    const ou = (k, v) => (+o[k] > 0 ? { v: +o[k], fonte: 'digitado' } : v > 0 ? { v, fonte: 'cotação' } : { v: 0, fonte: '' });
    return { m3: ou('m3', cbmCompleto ? soma(it => it.cbm) : 0), pesoKg: ou('pesoKg', soma(it => it.p)), fobUSD: ou('fobUSD', soma(it => it.u)) };
  }
  /** Ocupado e livre do contêiner. Capacidade: a digitada na mãe ou a soma dos contêineres cadastrados. */
  function ocupacaoDaMae(db, id) {
    const m = (db.ops || []).find(x => x && x.id === id); if (!m) return null;
    const filhas = W.filhasDe(db, id).map(o => ({ o, med: medidasFilha(db, o) }));
    const conts = Array.isArray(m.containers) ? m.containers.filter(Boolean) : [];
    const porTipo = conts.length ? conts.map(c => capacidadeDoTipo(c.tipo)) : (m.tipoConteiner ? [capacidadeDoTipo(m.tipoConteiner)] : []);
    const capM3 = +m.capM3 > 0 ? +m.capM3 : porTipo.reduce((a, c) => a + c.m3, 0), capKg = +m.capKg > 0 ? +m.capKg : porTipo.reduce((a, c) => a + c.kg, 0);
    const m3 = filhas.reduce((a, f) => a + f.med.m3.v, 0), kg = filhas.reduce((a, f) => a + f.med.pesoKg.v, 0), fobUSD = filhas.reduce((a, f) => a + f.med.fobUSD.v, 0);
    return { filhas, capM3, capKg, m3, kg, fobUSD, livreM3: capM3 ? capM3 - m3 : null, livreKg: capKg ? capKg - kg : null, excedeu: (capM3 > 0 && m3 > capM3) || (capKg > 0 && kg > capKg),
      semMedida: filhas.filter(f => !f.med.m3.v).map(f => f.o.id) };
  }
  function cotacaoDaOp(db, o) {
    const qs = db.quotes || {};
    let q = null;
    if (o.quoteId && qs[o.quoteId]) q = Object.assign({ id: o.quoteId }, qs[o.quoteId]);
    else { const k = Object.keys(qs).find(id => qs[id] && qs[id].fields && String(qs[id].fields.opNum || '').trim().toUpperCase() === String(o.id).toUpperCase()); if (k) q = Object.assign({ id: k }, qs[k]); }
    /* Filha de cotação com vários clientes: só a parte daquele cliente, com o rateio comercial dele. */
    if (q && Array.isArray(q.clientes) && q.clientes.length > 1 && !W.ehMae(o)) {
      const nome = s => String(s || '').trim().toLowerCase(), m = motorCotacao().clientesDe(q);
      const clienteCot = o.clienteCotId || o.quoteClienteId || (m.find(c => String(c.opNum || '').trim().toUpperCase() === String(o.id).toUpperCase() || (o.cliente && nome(c.nome) === nome(o.cliente))) || {}).id;
      const cc = clienteCot && (motorCotacao().calcularPorCliente(q).clientes || []).find(x => x.id === clienteCot);
      return cc ? Object.assign({}, cc.q, { id: q.id, preco: cc.R.preco, _custoPor: cc.R.custoPor, _RCliente: cc.R }) : null;
    }
    return q;
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

  /* ---------- DUIMP da operação (retrato importado do Portal Único) ----------
     O retrato fica UMA vez, na operação que importou (ops[].duimpDados); se a
     mesma DUIMP serve a várias operações, cada item diz de qual é (itens[].op). */
  const numDuimp = v => String(v || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  function retratoDuimp(db, numero) {
    const n = numDuimp(numero); if (!n) return null;
    const o = (db.ops || []).find(x => x && x.duimpDados && x.duimpDados.geral && numDuimp(x.duimpDados.geral.numero) === n);
    return o ? { op: o, dados: o.duimpDados } : null;
  }
  /** Operações que usam a DUIMP (pelo número cadastrado ou por guardarem o retrato). */
  function opsDaDuimp(db, numero) {
    const n = numDuimp(numero); if (!n) return [];
    return (db.ops || []).filter(o => o && o.id && (numDuimp(o.duimp) === n || (o.duimpDados && o.duimpDados.geral && numDuimp(o.duimpDados.geral.numero) === n)));
  }
  /** Itens da DUIMP que são desta operação (DUIMP de uma operação só: todos). */
  function duimpDaOp(db, opId) {
    const o = (db.ops || []).find(x => x && x.id === opId); if (!o) return null;
    const r = retratoDuimp(db, o.duimp || (o.duimpDados && o.duimpDados.geral && o.duimpDados.geral.numero)); if (!r) return null;
    const varias = opsDaDuimp(db, r.dados.geral.numero).length > 1;
    const itens = (r.dados.itens || []).filter(i => i && (i.op || (varias ? null : r.op.id)) === opId);
    return { numero: r.dados.geral.numero, versao: r.dados.versao, retrato: r.dados, dono: r.op.id, varias, itens, semOp: varias ? (r.dados.itens || []).filter(i => i && !i.op) : [] };
  }
  /** II + IPI + PIS + COFINS a recolher dos itens (o ICMS de importação é estadual e não vem da DUIMP). */
  const impostosFederais = itens => (itens || []).reduce((a, i) => a + ['ii', 'ipi', 'pis', 'cofins'].reduce((s, k) => { const t = (i.tributos || {})[k]; return s + (t ? (t.aRecolher != null ? +t.aRecolher : +t.devido || 0) : 0); }, 0), 0);

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
    /* Filha: soma a parte dela no que foi lançado na mãe (fábrica, frete, porto...). */
    const mae = o.maeId ? W.maeDe(db, o) : null, rateioDaFilha = {};
    if (mae) rateioDaMae(db, mae.id).classes.forEach(cl => { const p = cl.porFilha[opId]; if (!p) return; realizado[cl.k] += p.realizado; aPagar[cl.k] += p.aPagar; rateioDaFilha[cl.k] = p.realizado + p.aPagar; });
    /* Sem lançamento de impostos no Financeiro, os federais da DUIMP viram o realizado
       da classe (origem 'duimp'). Nenhum lançamento financeiro é criado. */
    const du = duimpDaOp(db, opId);
    const impostosDuimp = du && du.itens.length && !(realizado.impostos + aPagar.impostos > 0.005) ? r2(impostosFederais(du.itens)) : null;
    if (impostosDuimp != null) realizado.impostos = impostosDuimp;
    const cb = cambioOp(db, opId, taxaPrevista);
    if (mae) { // O câmbio fechado na mãe conta para a filha pela parte dela no FOB.
      const parte = (partesFabrica(db, mae).pesos[opId] || 0) / Math.max(1e-9, Object.values(partesFabrica(db, mae).pesos).reduce((a, b) => a + b, 0)), cm = cambioOp(db, mae.id, taxaPrevista);
      cb.usdFechado += cm.usdFechado * parte; cb.brlFechado += cm.brlFechado * parte; cb.variacao += cm.variacao * parte; cb.taxaMedia = cb.usdFechado ? cb.brlFechado / cb.usdFechado : null;
    }
    // Dólar ainda sem contrato: vale a PTAX de hoje (quando há) ou a taxa prevista.
    const usdTotal = fobUSD + freteUSD, usdAberto = Math.max(0, usdTotal - cb.usdFechado);
    /* A fábrica pelas remessas já tem a PTAX do dia: o dólar aberto conta só o resto (frete), para não somar duas vezes. */
    const remsAbertas = typeof W.remessasDaOp === 'function' ? W.remessasDaOp(db, opId, ptax) : (typeof require === 'function' ? require('./cambio-regras.js').remessasDaOp(db, opId, ptax) : []);
    const usdRemessas = remsAbertas.length && remsAbertas.every(m => m.custo != null) ? remsAbertas.filter(m => !m.fechada).reduce((a, m) => a + m.usd, 0) : 0;
    const impactoAberto = ptax && taxaPrevista ? Math.max(0, usdAberto - usdRemessas) * (ptax - taxaPrevista) : 0;
    const soma = o2 => Object.values(o2).reduce((a, b) => a + b, 0);
    const totPrev = soma(previsto), totReal = soma(realizado), totAPagar = soma(aPagar);
    // DIFAL que o cliente paga à parte fica fora das parcelas: volta para a receita e para o custo lançado, sem virar lucro.
    const difalFora = cq ? cq.difalCliente || 0 : 0, receitaLancada = receita.prevista + receita.recebida;
    const receitaTotal = (receitaLancada ? receitaLancada + difalFora : 0) || (cq ? cq.preco : 0) || num(cus.receitaPrevista);
    // Projetado por classe: o que já foi lançado (pago + a pagar); classe ainda sem lançamento
    // continua valendo o previsto, para a margem não parecer melhor do que é. Operação
    // encerrada vale só o lançado.
    const encerrada = !W.ativa(o);
    // Cronograma por classe já lançado: o imposto de venda está nele (ou virou crédito na linha de impostos), e não volta a valer o previsto.
    const cronoPorClasse = lancOp(db, opId).some(l => l.custo && String(l.origem || '').startsWith('cotacao:'));
    const proj0 = k => { const lanc = realizado[k] + aPagar[k], venda = k === 'impVenda'; return lanc > 0.005 || encerrada || (venda && cronoPorClasse) ? lanc + (venda ? difalFora : 0) : previsto[k]; };
    /* Com remessas cadastradas na cláusula, a fábrica vale o câmbio real ou US$ × PTAX do dia × (1 + spread). */
    const cambio = typeof W.remessasDaOp === 'function' ? W : (typeof require === 'function' ? require('./cambio-regras.js') : null);
    const rems = cambio ? cambio.remessasDaOp(db, opId, ptax) : [];
    const fobRemessas = rems.length && rems.every(m => m.custo != null) ? r2(rems.reduce((a, m) => a + m.custo, 0)) : null;
    const proj = k => (k === 'fob' && fobRemessas != null && !encerrada ? fobRemessas : proj0(k));
    const linhas = CLASSES.map(([k, l]) => ({ k, l, simulado: simulado[k], previsto: previsto[k], realizado: realizado[k], aPagar: aPagar[k], projetado: proj(k), semLancamento: !(realizado[k] + aPagar[k]) && previsto[k] > 0, desvio: previsto[k] ? (proj(k) - previsto[k]) / previsto[k] : null,
      origem: k === 'impostos' && impostosDuimp != null ? 'duimp' : '' }));
    const custoProjetado = linhas.reduce((a, x) => a + x.projetado, 0) + impactoAberto;
    const margem = v => receitaTotal ? (receitaTotal - v) / receitaTotal : null;
    return {
      rateioDaMae: rateioDaFilha, op: o, cotacao: q ? q.id : null, temCotacao: !!cq, previstoAprovado: !!cus.previsto, aprovadoPor: cus.aprovadoPor || '', aprovadoEm: cus.aprovadoEm || '',
      linhas, simulado: soma(simulado), previsto: totPrev, realizado: totReal, aPagar: totAPagar, projetado: custoProjetado,
      receita: receitaTotal, receitaRecebida: receita.recebida, margemSimulada: cq && cq.preco ? (cq.preco - soma(simulado)) / cq.preco : null,
      margemPrevista: totPrev > 0 ? margem(totPrev) : null, margemProjetada: margem(custoProjetado), desvio: totPrev ? (custoProjetado - totPrev) / totPrev : null,
      fobUSD, freteUSD, usdTotal, usdFechado: cb.usdFechado, usdAberto, taxaPrevista, taxaMedia: cb.taxaMedia, variacaoCambial: cb.variacao, impactoAberto, ptax,
      remessas: remsAbertas, contratos: cb.contratos, lucroLiquido: receitaTotal ? (receitaTotal - custoProjetado) * (1 - 0.34) : null,
      duimp: du ? { numero: du.numero, versao: du.versao, itens: du.itens.length, impostosFederais: impostosDuimp } : null
    };
  }
  /* ---------- Contêiner compartilhado: custos comuns, fábrica e visão consolidada ----------
     O que é comum fica lançado na mãe. A parte de cada filha é calculada na hora, nunca gravada como outro
     lançamento: o caixa conta uma vez só e, ao mudar o critério, tudo acompanha. */
  const CRITERIOS_MAE = [['m3', 'Por m³'], ['fob', 'Por FOB'], ['manual', 'Manual (%)']];
  const RATEIO_MAE_PADRAO = { frete: 'm3', porto: 'm3', demurrage: 'm3', nacional: 'm3', outros: 'm3', cambio: 'm3', seguro: 'fob', impostos: 'fob', impVenda: 'fob' };
  /** Divide o total em centavos pelos pesos. A diferença de arredondamento vai para a maior filha. */
  function ratearCentavos(total, pesos) {
    const ids = Object.keys(pesos), soma = ids.reduce((a, id) => a + (+pesos[id] || 0), 0), cent = Math.round((+total || 0) * 100), out = {};
    if (!ids.length) return out;
    const p = id => (soma > 0 ? (+pesos[id] || 0) / soma : 1 / ids.length);
    ids.forEach(id => { out[id] = Math.round(cent * p(id)); });
    const dif = cent - ids.reduce((a, id) => a + out[id], 0);
    const maior = ids.reduce((a, b) => (p(b) > p(a) ? b : a));
    out[maior] += dif;
    ids.forEach(id => { out[id] = out[id] / 100; });
    return out;
  }
  const iguais = ids => Object.fromEntries(ids.map(id => [id, 1]));
  /** Pesos pelo critério. Sem m³ em alguma filha, cai para o FOB; sem FOB, em partes iguais, sempre avisando. */
  function pesosPor(db, m, criterio, pct) {
    const fs = W.filhasDe(db, m.id).map(o => ({ o, med: medidasFilha(db, o) })), ids = fs.map(f => f.o.id);
    const de = k => Object.fromEntries(fs.map(f => [f.o.id, f.med[k].v]));
    if ((criterio === 'manual' || criterio === 'cotacao') && pct && ids.some(id => +pct[id] > 0)) return { criterio, pesos: Object.fromEntries(ids.map(id => [id, +pct[id] || 0])) };
    if (criterio === 'm3') { if (fs.length && fs.every(f => f.med.m3.v > 0)) return { criterio: 'm3', pesos: de('m3') }; if (fs.length && fs.every(f => f.med.fobUSD.v > 0)) return { criterio: 'fob', pesos: de('fobUSD'), aviso: 'm³ sem preencher em alguma filha: rateado por FOB.' }; return { criterio: 'igual', pesos: iguais(ids), aviso: 'm³ e FOB sem preencher: rateado em partes iguais.' }; }
    if (fs.length && fs.every(f => f.med.fobUSD.v > 0)) return { criterio: 'fob', pesos: de('fobUSD') };
    if (fs.length && fs.every(f => f.med.m3.v > 0)) return { criterio: 'm3', pesos: de('m3'), aviso: 'FOB sem preencher em alguma filha: rateado por m³.' };
    return { criterio: 'igual', pesos: iguais(ids), aviso: 'FOB e m³ sem preencher: rateado em partes iguais.' };
  }
  /** Impostos da DUIMP única: cada filha paga pelos itens atribuídos a ela, quando todos têm dono. */
  function pesosDaDuimp(db, m) {
    const ids = W.filhasDe(db, m.id).map(o => o.id); if (!ids.length) return null;
    const dd = ids.map(id => ({ id, d: duimpDaOp(db, id) }));
    if (dd.some(x => !x.d) || dd.some(x => x.d.semOp && x.d.semOp.length)) return null;
    const pesos = Object.fromEntries(dd.map(x => [x.id, impostosFederais(x.d.itens)]));
    return Object.values(pesos).some(v => v > 0) ? { criterio: 'duimp', pesos } : null;
  }
  function partesDaClasse(db, m, classe) {
    const cfg = (m.rateio || {})[classe] || {};
    if (!cfg.criterio && classe === 'impostos') { const d = pesosDaDuimp(db, m); if (d) return d; }
    return pesosPor(db, m, cfg.criterio || RATEIO_MAE_PADRAO[classe] || 'm3', cfg.pct);
  }
  /** Pagamento à fábrica: pelo FOB de cada filha, ou pelo percentual digitado na mãe. */
  function partesFabrica(db, m) {
    const a = m.alocacaoFabrica || {};
    return pesosPor(db, m, a.pct ? 'manual' : 'fob', a.pct);
  }
  const partesDe = (db, m, classe) => (classe === 'fob' ? partesFabrica(db, m) : partesDaClasse(db, m, classe));
  /** O que está lançado na mãe, classe por classe, com a parte de cada filha. A soma das filhas é igual à da mãe ao centavo. */
  function rateioDaMae(db, id) {
    const m = (db.ops || []).find(x => x && x.id === id); if (!m) return { classes: [], avisos: [], receitaNaMae: 0, confere: true };
    const base = {}; let receitaNaMae = 0;
    lancOp(db, id).forEach(l => {
      if (W.ehReceita(l)) { receitaNaMae += valorDe(l); return; }
      const k = classeDe(l); base[k] = base[k] || { realizado: 0, aPagar: 0 };
      if (W.realizado(l)) base[k].realizado += valorDe(l); else base[k].aPagar += valorDe(l);
    });
    const avisos = [];
    const classes = CLASSES.filter(([k]) => base[k]).map(([k, rot]) => {
      const p = partesDe(db, m, k), r = ratearCentavos(base[k].realizado, p.pesos), a = ratearCentavos(base[k].aPagar, p.pesos), porFilha = {};
      Object.keys(p.pesos).forEach(fid => { porFilha[fid] = { realizado: r[fid] || 0, aPagar: a[fid] || 0 }; });
      if (p.aviso) avisos.push(rot + ': ' + p.aviso);
      return { k, rot, criterio: p.criterio, realizado: r2(base[k].realizado), aPagar: r2(base[k].aPagar), total: r2(base[k].realizado + base[k].aPagar), porFilha };
    });
    const confere = classes.every(c => { const ks = Object.keys(c.porFilha); return !ks.length || Math.abs(ks.reduce((s, f) => s + c.porFilha[f].realizado + c.porFilha[f].aPagar, 0) - c.total) < 0.005; });
    return { classes, avisos: [...new Set(avisos)], receitaNaMae: r2(receitaNaMae), confere };
  }
  /** Quanto cabe a cada filha de um valor da fábrica. */
  function alocarFabrica(db, maeId, valor) {
    const m = (db.ops || []).find(x => x && x.id === maeId); if (!m) return {};
    return ratearCentavos(valor, partesFabrica(db, m).pesos);
  }
  const conferirPct = (ids, pct) => { const t = ids.reduce((a, id) => a + (+pct[id] || 0), 0); return Math.abs(t - 100) > 0.001 ? `Os percentuais somam ${t.toLocaleString('pt-BR')}%, e precisam somar 100%.` : ''; };
  /** Muda o critério de uma classe na mãe. Para 'padrao', volta ao critério que vale para todos. */
  function definirRateioMae(db, maeId, classe, criterio, pct) {
    const m = (db.ops || []).find(x => x && x.id === maeId); if (!W.ehMae(m)) return { ok: false, msg: 'Só a operação-mãe tem rateio.' };
    m.rateio = Object.assign({}, m.rateio);
    if (criterio === 'padrao') { delete m.rateio[classe]; return { ok: true }; }
    if (criterio === 'manual') { const e = conferirPct(W.filhasDe(db, maeId).map(o => o.id), pct || {}); if (e) return { ok: false, msg: e }; m.rateio[classe] = { criterio, pct: Object.assign({}, pct) }; return { ok: true }; }
    m.rateio[classe] = { criterio };
    return { ok: true };
  }
  function definirAlocacaoFabrica(db, maeId, pct) {
    const m = (db.ops || []).find(x => x && x.id === maeId); if (!W.ehMae(m)) return { ok: false, msg: 'Só a operação-mãe tem alocação.' };
    if (!pct) { delete m.alocacaoFabrica; return { ok: true }; }
    const e = conferirPct(W.filhasDe(db, maeId).map(o => o.id), pct); if (e) return { ok: false, msg: e };
    m.alocacaoFabrica = { pct: Object.assign({}, pct) };
    return { ok: true };
  }
  /** Visão da mãe: margem do contêiner, ocupação e a linha de cada filha. */
  function custeioConsolidado(db, id, opts) {
    const m = (db.ops || []).find(x => x && x.id === id); if (!W.ehMae(m)) return null;
    const filhas = W.filhasDe(db, id).map(o => custeioOp(db, o.id, opts));
    const soma = fn => filhas.reduce((a, c) => a + (fn(c) || 0), 0), rateio = rateioDaMae(db, id);
    const receita = soma(c => c.receita), projetado = soma(c => c.projetado), previsto = soma(c => c.previsto);
    return { mae: m, filhas, rateio, ocupacao: ocupacaoDaMae(db, id), receita, recebido: soma(c => c.receitaRecebida), previsto, projetado, realizado: soma(c => c.realizado), aPagar: soma(c => c.aPagar),
      margem: receita ? (receita - projetado) / receita : null, margemPrevista: receita && previsto > 0 ? (receita - previsto) / receita : null };
  }
  /** Parte de cada filha num pagamento real: a do rateio da cotação; sem cotação por cliente, o critério da mãe. */
  function partesDoPagamento(db, m, classe) {
    const fs = W.filhasDe(db, m.id), de = { frete: p => p.frete, seguro: p => p.seguro, porto: p => p.capatazia + p.siscomex + p.afrmm + p.honorarios + p.demais, demurrage: p => p.capatazia + p.siscomex + p.afrmm + p.honorarios + p.demais, nacional: p => p.terrestre }[classe];
    if (de) { const qs = fs.map(f => ({ f, q: cotacaoDaOp(db, f) })); if (qs.length && qs.every(x => x.q && x.q._custoPor)) { const pesos = Object.fromEntries(qs.map(x => [x.f.id, de(x.q._custoPor)])); if (Object.values(pesos).some(v => v > 0)) return { criterio: 'cotacao', pesos }; } }
    return partesDe(db, m, classe);
  }
  /**
   * Pagamento real do contêiner: um lançamento por filha, pela mesma regra do rateio. Se a filha tem o previsto
   * daquela classe em aberto, é ele que vira realizado, para o custo não contar duas vezes. Nada fica na mãe.
   */
  function lancarPagamentoConteiner(db, maeId, d, por, agora) {
    const m = (db.ops || []).find(x => x && x.id === maeId), dd = d || {};
    if (!W.ehMae(m)) return { ok: false, msg: 'Só o contêiner rateia pagamento.' };
    const fs = W.filhasDe(db, maeId); if (!fs.length) return { ok: false, msg: 'Este contêiner não tem filhas.' };
    if (!(+dd.valor > 0)) return { ok: false, msg: 'Informe o valor.' };
    if (!CLASSE_ROTULO[dd.classe]) return { ok: false, msg: 'Escolha a classe.' };
    const p = partesDoPagamento(db, m, dd.classe), val = ratearCentavos(dd.valor, p.pesos), data = dd.data || W.hojeISO(), real = dd.status !== 'Previsto', out = [];
    fs.forEach(f => {
      const v = val[f.id] || 0; if (!(v > 0)) return;
      const prev = (db.fin || []).find(l => l && l.op === f.id && !W.ehReceita(l) && !W.realizado(l) && l.custo === dd.classe && String(l.origem || '').startsWith('cotacao:'));
      if (prev) { prev.valorPrevisto = prev.valorPrevisto != null ? prev.valorPrevisto : prev.valor; if (real) { W.realizar(prev, v, data); prev.baixaPor = por || ''; } else prev.valor = v; prev.comprovanteConteiner = dd.desc || ''; if (dd.comp) prev.comp = dd.comp; out.push(prev); return; }
      const l = { _id: W.novoId(), data, vencimento: data, op: f.id, tipo: 'Despesa', categoria: '', fixo: false, empresa: dd.empresa || 'WindGate', desc: (dd.desc || CLASSE_ROTULO[dd.classe]) + ' · contêiner ' + maeId, valor: v, status: real ? 'Realizado' : 'Previsto', comp: dd.comp || '', nf: '', por: por || '', custo: dd.classe, origem: 'rateio:' + maeId, liquidadoEm: real ? data : null };
      db.fin.unshift(l); out.push(l);
    });
    return { ok: true, lancamentos: out, criterio: p.criterio, aviso: p.aviso || '' };
  }
  /* A mãe não recebe lançamento: ela só mostra a soma das filhas. */
  const lancBloqueadoNaMae = (db, op) => !!op && W.ehMae((db.ops || []).find(x => x && x.id === op));
  /** O que está lançado na mãe, gravado pela versão que lançava nela. Não altera nada. */
  function diagnosticoMae(db, id) {
    const ls = lancOp(db, id), real = l => W.realizado(l), daCotacao = l => String(l.origem || '').startsWith('cotacao:');
    const duplicados = ls.filter(l => !real(l) && daCotacao(l)), realizados = ls.filter(l => real(l) && !W.ehReceita(l)), manuais = ls.filter(l => !duplicados.includes(l) && !realizados.includes(l));
    const soma = xs => r2(xs.reduce((a, l) => a + valorDe(l), 0));
    return { duplicados, realizados, manuais, total: ls.length, valorDuplicado: soma(duplicados), valorRealizado: soma(realizados), valorManual: soma(manuais) };
  }
  /**
   * Conserta o contêiner: garante os lançamentos das filhas, tira da mãe o previsto que veio da cotação e divide
   * entre as filhas o que já foi pago. Lançado à mão fica para alguém decidir. Pode rodar de novo sem mudar nada.
   */
  function repararMae(db, id, por, agora) {
    const m = (db.ops || []).find(x => x && x.id === id); if (!W.ehMae(m)) return { ok: false, msg: 'Só o contêiner é corrigido.' };
    const t = agora || new Date().toISOString(), qs = db.quotes || {}, q0 = m.quoteId && qs[m.quoteId], motor = motorCotacao();
    let sincronizadas = 0;
    if (q0 && motor.ehMultiCliente(q0)) { const q = Object.assign({ id: m.quoteId }, q0), r = motor.criarOperacoesDaMulti(db, q, { maeId: id, por, agora: t }); if (r.ok) sincronizadas = r.filhas.length; }
    const dg = diagnosticoMae(db, id);
    if (dg.realizados.length && !W.filhasDe(db, id).length) return { ok: false, msg: 'O contêiner não tem filhas para receber os pagamentos.' };
    let divididos = 0;
    dg.realizados.forEach(l => {
      const r = lancarPagamentoConteiner(db, id, { classe: classeDe(l), valor: valorDe(l), data: W.soData(l.liquidadoEm || W.vencDe(l)), desc: l.desc || l.descricao, comp: l.comp, empresa: l.empresa }, por, t);
      if (r.ok) { db.fin = db.fin.filter(x => x !== l); divididos++; }
    });
    const tirar = new Set(dg.duplicados.map(l => l._id));
    db.fin = (db.fin || []).filter(l => !(l && tirar.has(l._id)));
    if ((tirar.size || divididos) && Array.isArray(db.opStatusHist)) db.opStatusHist.push({ _id: W.novoId(), op: id, de: '', para: '', em: t, por: por || '', tipo: 'correcao', origem: 'hub2', motivo: `Custos duplicados na mãe: ${tirar.size} previsto(s) removido(s), ${W.fmtBRL(dg.valorDuplicado)}; ${divididos} pagamento(s) dividido(s) entre as filhas, ${W.fmtBRL(dg.valorRealizado)}` });
    return { ok: true, removidos: tirar.size, divididos, sincronizadas, manuais: dg.manuais };
  }
  /** Quanto cada filha já pagou por dentro: cota da fábrica (pago + este pagamento) contra o que ela já pagou à WindGate. */
  function coberturaFabrica(db, maeId, valorNovo) {
    const m = (db.ops || []).find(x => x && x.id === maeId); if (!m) return [];
    const pago = lancOp(db, maeId).filter(l => !W.ehReceita(l) && classeDe(l) === 'fob' && W.realizado(l)).reduce((a, l) => a + valorDe(l), 0);
    const cotas = alocarFabrica(db, maeId, pago + (+valorNovo || 0));
    return W.filhasDe(db, maeId).map(o => {
      const recebido = r2(lancOp(db, o.id).filter(l => W.ehReceita(l) && W.realizado(l)).reduce((a, l) => a + valorDe(l), 0));
      const cota = cotas[o.id] || 0;
      return { op: o.id, cliente: o.cliente || '', cota, recebido, descoberto: r2(Math.max(0, cota - recebido)) };
    });
  }
  /** Pagamento à fábrica lançado na mãe: filha sem recebimento segura o pagamento até o Samir liberar. */
  function travaFabrica(db, l) {
    const m = l && (db.ops || []).find(x => x && x.id === l.op);
    if (m && m.maeId && !W.ehReceita(l) && classeDe(l) === 'fob' && !W.realizado(l)) {
      /* Filha: a fábrica desta filha contra o que ela já recebeu do cliente. */
      const pago = lancOp(db, m.id).filter(x => !W.ehReceita(x) && classeDe(x) === 'fob' && W.realizado(x)).reduce((a, x) => a + valorDe(x), 0);
      const recebido = r2(lancOp(db, m.id).filter(x => W.ehReceita(x) && W.realizado(x)).reduce((a, x) => a + valorDe(x), 0)), cota = r2(pago + valorDe(l));
      const f = { op: m.id, cliente: m.cliente || '', cota, recebido, descoberto: r2(Math.max(0, cota - recebido)) }, ab = f.descoberto > 0.005 ? [f] : [];
      return { bloqueia: ab.length > 0 && !l.liberacaoFabrica, liberado: !!l.liberacaoFabrica, liberacao: l.liberacaoFabrica || null, filhas: [f], abertas: ab, descoberto: f.descoberto };
    }
    if (!W.ehMae(m) || W.ehReceita(l) || classeDe(l) !== 'fob' || W.realizado(l)) return { bloqueia: false, filhas: [] };
    const filhas = coberturaFabrica(db, m.id, valorDe(l)), abertas = filhas.filter(f => f.descoberto > 0.005);
    return { bloqueia: abertas.length > 0 && !l.liberacaoFabrica, liberado: !!l.liberacaoFabrica, liberacao: l.liberacaoFabrica || null, filhas, abertas, descoberto: r2(abertas.reduce((a, f) => a + f.descoberto, 0)) };
  }
  /** O Samir libera o pagamento mesmo sem cobertura. Fica registrado quem, quando e quanto estava descoberto. */
  function liberarFabrica(db, id, por, agora) {
    const l = (db.fin || []).find(x => x && x._id === id); if (!l) return { ok: false, msg: 'Lançamento não encontrado.' };
    const t = travaFabrica(db, l);
    l.liberacaoFabrica = { por: por || '', em: agora || new Date().toISOString(), descoberto: t.descoberto || 0 };
    return { ok: true };
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
    // A filha guarda uma cópia do contêiner da mãe: a lista conta cada contêiner uma vez, na mãe.
    (db.ops || []).filter(o => o && o.id && !o.maeId && Array.isArray(o.containers)).forEach(o => o.containers.forEach((c, i) => { if (c && c.numero) out.push(Object.assign({ op: o.id, cliente: o.cliente, idx: i, c }, relogioConteiner(db, c, hoje))); }));
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

  /* ---------- Cenários do caixa projetado ----------
     Base; dólar +10% (sobre o dólar ainda sem câmbio fechado: fábrica e frete previstos, na parte aberta de cada operação);
     atraso de 15 dias nos recebimentos previstos; e os dois juntos. Só o previsto muda: o caixa de hoje é o mesmo. */
  const CENARIOS_CAIXA = [['base', 'Base', {}], ['dolar', 'Dólar +10%', { dolar: true }], ['atraso', 'Atraso de 15 dias', { atraso: true }], ['ambos', 'Os dois juntos', { dolar: true, atraso: true }]];
  function parteSemCambio(db, op, cache) {
    if (cache[op] != null) return cache[op];
    const o = (db.ops || []).find(x => x && x.id === op), c = o ? custeioOp(db, op) : null;
    return (cache[op] = c && c.usdTotal > 0 ? Math.max(0, 1 - c.usdFechado / c.usdTotal) : 1);
  }
  function caixaNoCenario(db, h, empresa, o, cache, caixa) {
    const fin = (db.fin || []).map(l => {
      if (!l || W.realizado(l) || W.transferencia(l)) return l;
      if (o.atraso && W.ehReceita(l)) return Object.assign({}, l, { vencimento: somaDias(W.vencDe(l), 15) });
      if (o.dolar && !W.ehReceita(l) && ['fob', 'frete'].includes(classeDe(l))) return Object.assign({}, l, { valor: valorDe(l) * (1 + 0.10 * (l.op ? parteSemCambio(db, l.op, cache) : 1)) });
      return l;
    });
    const fluxo = W.fluxoSemanal({ fin }, h, 13, empresa, true), venc = fluxo.find(p => p.vencido), semanas = fluxo.filter(p => !p.vencido);
    let acum = caixa + venc.entra - venc.sai;
    const serie = semanas.map(s => { acum += s.entra - s.sai; return { de: s.de, caixa: r2(acum) }; });
    const menor = serie.reduce((a, b) => (b.caixa < a.caixa ? b : a), serie[0]);
    return { menor: menor.caixa, semana: menor.de, semanasNegativas: serie.filter(s => s.caixa < 0).length, serie };
  }
  function cenariosCaixa(db, hoje, empresa) {
    const h = hoje || W.hojeISO(), cache = {};
    const caixa = (db.fin || []).filter(l => l && !W.transferencia(l) && W.realizado(l) && (!empresa || empresa === 'todas' || (l.empresa || 'WindGate') === empresa)).reduce((a, l) => a + (W.ehReceita(l) ? 1 : -1) * valorDe(l), 0);
    return CENARIOS_CAIXA.map(([k, nome, o]) => Object.assign({ k, nome }, caixaNoCenario(db, h, empresa, o, cache, caixa)));
  }

  /* ---------- Fila de exceções da Torre ----------
     Só entra o que pede ação. Cada item tem dono (perfil), nível e para onde ir. */
  function excecoes(db, k, hoje, extra) {
    const h = hoje || W.hojeISO(), ptax = extra && extra.ptax, p = W.perfilDe(db, k).id, fin = W.pode(db, k, 'fin.ver'), res = W.pode(db, k, 'fin.resultado');
    const out = [], add = (x) => out.push(x);
    const meu = donos => !donos || donos.includes(p) || p === 'diretoria';
    /* Nível certo: o que é do contêiner aparece na mãe, uma vez só; cobrança e margem aparecem na filha. */
    (db.ops || []).filter(o => W.ehMae(o) && W.emAndamento(o)).forEach(m => {
      const pi = W.prazoInfo(db, m, h);
      if (pi.sit === 'atrasado' && meu(['operacoes', 'frete', 'documentos'])) add({ tipo: 'prazo', nivel: 2, titulo: `Contêiner ${m.id} atrasado em ${W.stMeta(m.status).l}`, detalhe: `${pi.dias != null ? pi.dias + ' dia(s) na etapa' : ''} · ${W.filhasDe(db, m.id).length} cliente(s)`, op: m.id, ir: ['ficha', m.id] });
      const em = (m.etaHist || []).slice(-1)[0];
      if (em && Math.abs(W.diasEntre(em.de, em.para) || 0) > 3 && W.diasEntre(W.soData(em.em), h) <= 7 && meu(['operacoes', 'frete'])) add({ tipo: 'eta', nivel: 2, titulo: `ETA do contêiner ${m.id} mudou ${W.diasEntre(em.de, em.para) > 0 ? '+' : ''}${W.diasEntre(em.de, em.para)} dias`, detalhe: `${W.dataBR(em.de)} → ${W.dataBR(em.para)}. Avisar os clientes e rever a semana dos impostos.`, op: m.id, ir: ['ficha', m.id] });
      if (fin) {
        lancOp(db, m.id).filter(l => !W.ehReceita(l) && !W.realizado(l) && classeDe(l) === 'fob' && W.diasEntre(h, W.vencDe(l)) <= 7).forEach(l => { const t = travaFabrica(db, l); if (t.bloqueia) add({ tipo: 'fabrica', nivel: 3, titulo: `${m.id}: pagamento à fábrica sem recebimento de ${t.abertas.map(x => x.op).join(', ')}`, detalhe: `${W.fmtBRLk(t.descoberto)} descobertos · vencimento ${W.dataBR(W.vencDe(l))}`, op: m.id, ir: ['custeio', m.id] }); });
        const rm = lancOp(db, m.id).filter(l => W.ehReceita(l) && !W.realizado(l)); if (rm.length) add({ tipo: 'cadastro', nivel: 1, titulo: `${m.id}: ${rm.length} recebimento(s) lançado(s) no contêiner`, detalhe: 'Recebimento é do cliente: mova para a operação-filha.', op: m.id, ir: ['ficha', m.id] });
      }
    });
    opsAtivas(db).forEach(o => {
      const naMae = !!o.maeId && W.ETAPAS_DA_MAE.includes(o.status);
      if (o.maeId && fin) { const venc = lancOp(db, o.id).filter(l => W.ehReceita(l) && !W.realizado(l) && W.vencDe(l) < h); if (venc.length) add({ tipo: 'cobranca', nivel: 2, titulo: `${o.id}: cobrar ${o.cliente || 'cliente'}`, detalhe: `${venc.length} parcela(s) vencida(s) · ${W.fmtBRLk(venc.reduce((a, l) => a + valorDe(l), 0))}`, op: o.id, ir: ['contacorrente', o.id] }); }
      const pi = W.prazoInfo(db, o, h);
      if (!naMae && pi.sit === 'atrasado' && meu(['operacoes', 'frete', 'documentos'])) add({ tipo: 'prazo', nivel: 2, titulo: `${o.id} atrasada em ${W.stMeta(o.status).l}`, detalhe: `${pi.dias != null ? pi.dias + ' dia(s) na etapa' : ''} · ${o.cliente || ''}`, op: o.id, ir: ['ficha', o.id] });
      const eh = (o.etaHist || []).slice(-1)[0];
      if (!o.maeId && eh && Math.abs(W.diasEntre(eh.de, eh.para) || 0) > 3 && W.diasEntre(W.soData(eh.em), h) <= 7 && meu(['operacoes', 'frete'])) add({ tipo: 'eta', nivel: 2, titulo: `ETA da ${o.id} mudou ${W.diasEntre(eh.de, eh.para) > 0 ? '+' : ''}${W.diasEntre(eh.de, eh.para)} dias`, detalhe: `${W.dataBR(eh.de)} → ${W.dataBR(eh.para)}. Avisar o cliente e rever a semana dos impostos.`, op: o.id, ir: ['ficha', o.id] });
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
    if (meu(['operacoes']) && W.contratosDesatualizados) W.contratosDesatualizados(db).forEach(c => add({ tipo: 'contrato', nivel: 2, titulo: `Contrato da ${c.op} desatualizado`, detalhe: 'A cotação mudou depois de gerar: gere de novo.', op: c.op, ir: ['contratos'] }));
    if (meu(['comercial', 'operacoes'])) W.followUpsProposta(db, h).forEach(x => add({ tipo: 'followup', nivel: 1, titulo: `Follow-up: ${x.negocio.clienteNome || x.negocio.titulo || 'cliente'} não abriu a proposta`, detalhe: `link enviado há ${x.dias} dia(s)`, ir: ['crm'] }));
    if (meu(['operacoes'])) complianceVencendo(db, h, 30).forEach(c => add({ tipo: 'compliance', nivel: c.vencido ? 3 : 1, titulo: `${c.tipo}${c.empresa ? ' ' + c.empresa : ''} ${c.vencido ? 'VENCIDO' : `vence em ${c.dias} dia(s)`}`, detalhe: c.titulo || '', ir: ['compliance'] }));
    return out.sort((a, b) => b.nivel - a.nivel);
  }

  return { lancBloqueadoNaMae, diagnosticoMae, repararMae, partesDoPagamento, lancarPagamentoConteiner, cenariosCaixa, CENARIOS_CAIXA, CRITERIOS_MAE, RATEIO_MAE_PADRAO, ratearCentavos, rateioDaMae, partesFabrica, alocarFabrica, definirRateioMae, definirAlocacaoFabrica, custeioConsolidado, coberturaFabrica, travaFabrica, liberarFabrica, classesDoTexto, classesAmbiguas, dividirLancamento, capacidadeDoTipo, medidasFilha, ocupacaoDaMae, numDuimp, retratoDuimp, opsDaDuimp, duimpDaOp, impostosFederais, MODALIDADES, modalidadeDe, CLASSES, CLASSE_ROTULO, classeDe, custoCotacao, cotacaoDaOp, custeioOp, cambioOp, aprovarPrevisto, exposicaoCambio,
    FREE_TIME_PADRAO, freeTimeDe, relogioConteiner, conteineres, contaCorrente, creditoClientes,
    REGRAS_TRIBUTARIAS, regrasTributarias, tributosNaData, avisosTributarios, simularTransicao,
    COMPLIANCE_TIPOS, complianceVencendo, contratoDaOp, modeloContrato, marcos, excecoes };
});
