/* =====================================================================
   WindGate Hub 2.0 — câmbio na proposta, no contrato e nas parcelas (sem tela).

   Não mexe na composição de custos. Muda o que o cliente vê e como a parcela
   é corrigida:
   - Dólar de referência = PTAX de venda do dia da proposta + R$ 0,05.
   - Faixa de 1% sobre a referência: dentro dela, a parcela não muda.
   - Fora da faixa: ajuste integral desde a referência, proporcional por
     fração de R$ 0,10. Alta repassada 100%; queda, 70%.
   - O valor por R$ 0,10 de cada parcela sai do motor da cotação: varia o
     câmbio em R$ 0,10 e mede quanto muda o custo daquela parcela.
   - Datas: 1ª parcela fixa; 2ª, PTAX do dia útil anterior ao vencimento;
     3ª, do dia útil anterior ao registro da DI; cliente em atraso, a maior
     PTAX entre a data da parcela e o dia útil anterior ao pagamento.

   O sistema só calcula. Quem grava o ajuste é uma pessoa com fin.lancar.
   ===================================================================== */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(Object.assign({}, require('./regras.js'), require('./comex.js'), require('./cotacao-regras.js')));
  else Object.assign(raiz.WG, fabrica(raiz.WG));
})(typeof self !== 'undefined' ? self : this, function (W) {
  const ACRESCIMO_REF = 0.05, TOLERANCIA = 0.01, PASSO = 0.10, REPASSE_QUEDA = 0.70;
  const CENARIOS_CAMBIO = [-0.20, 0, 0.25];
  const r2 = v => Math.round((+v || 0) * 100) / 100, r4 = v => Math.round((+v || 0) * 10000) / 10000;

  /** Referência e faixa a partir da PTAX da proposta. */
  function referenciaDaProposta(ptax) {
    const p = +ptax; if (!(p > 0)) return null;
    const referencia = r4(p + ACRESCIMO_REF);
    return { ptax: r4(p), referencia, piso: r4(referencia * (1 - TOLERANCIA)), teto: r4(referencia * (1 + TOLERANCIA)) };
  }
  /** Ajuste de uma parcela. Devolve { dentro, variacao, fracoes, ajuste }. Não grava nada. */
  function ajusteDaParcela(referencia, valorPor010, ptax) {
    const ref = referenciaFixa(referencia); if (!ref || !(+ptax > 0)) return null;
    const r = reajusteDaClausula({ referencia: ref.referencia, faixaMin: ref.piso, faixaMax: ref.teto, partida: 'referencia', repasseAlta: 1, repasseQueda: REPASSE_QUEDA }, (+valorPor010 || 0) / PASSO, ptax);
    return { dentro: r.dentro, variacao: r.variacao, fracoes: r.dentro ? 0 : r4(Math.abs(r.variacao) / PASSO), ajuste: r.valor };
  }

  /* ---------- Cláusula cambial do contrato ----------
     Os dois modelos cabem nos mesmos campos:
     - antigo (ex.: OP26): referência 5,15, faixa 5,10 a 5,20, desde a referência, 100% nos dois sentidos, e o
       reajuste sai do câmbio de cada remessa à fábrica, na parcela indicada;
     - híbrido (contratos novos): referência = PTAX da proposta + R$ 0,05, faixa de 1%, alta 100% e queda 70%,
       1ª parcela fixa, e o reajuste sai da PTAX do dia útil anterior ao vencimento (2ª) e ao registro da DI (3ª).
     O spread do banco é só custo nosso: o cliente é sempre reajustado pela PTAX limpa. */
  const SPREAD_PADRAO = 0.016;
  const QUANDO = [['cambio', 'No fechamento do câmbio da remessa'], ['vencimento', 'Dia útil anterior ao vencimento'], ['registroDI', 'Dia útil anterior ao registro da DI']];
  function normalizarClausula(c) {
    const x = Object.assign({ partida: 'referencia', repasseAlta: 1, repasseQueda: 1, primeiraFixa: true, spread: SPREAD_PADRAO, remessas: [] }, c || {});
    ['referencia', 'faixaMin', 'faixaMax'].forEach(k => { x[k] = r4(x[k]); });
    ['repasseAlta', 'repasseQueda', 'spread'].forEach(k => { x[k] = +x[k] || 0; });
    x.remessas = (x.remessas || []).filter(Boolean).map((m, i) => Object.assign({ id: 'r' + (i + 1), rotulo: '', quando: 'cambio' }, m, { usd: r2(m.usd), parcela: +m.parcela || 2 }));
    return x;
  }
  /** O que falta para a cláusula valer. */
  function conferirClausula(c) {
    const x = normalizarClausula(c), e = [];
    if (!(x.referencia > 0)) e.push('Informe a PTAX de referência.');
    if (!(x.faixaMin > 0 && x.faixaMax > 0) || x.faixaMin > x.referencia || x.faixaMax < x.referencia) e.push('A faixa sem reajuste precisa conter a referência.');
    if (x.repasseAlta < 0 || x.repasseAlta > 1 || x.repasseQueda < 0 || x.repasseQueda > 1) e.push('O repasse vai de 0% a 100%.');
    if (!['referencia', 'borda'].includes(x.partida)) e.push('Ponto de partida inválido.');
    x.remessas.forEach((m, i) => { if (!(m.usd > 0)) e.push(`Remessa ${i + 1}: informe o valor em US$.`); if (x.primeiraFixa && m.parcela === 1) e.push(`Remessa ${i + 1}: a 1ª parcela é fixa.`); });
    return e;
  }
  /**
   * Reajuste de um valor em dólar. Dentro da faixa: zero. Fora: a variação desde a referência (ou desde a borda),
   * vezes o repasse daquele sentido. Sempre pela PTAX limpa.
   */
  function reajusteDaClausula(c, usd, ptax) {
    const x = normalizarClausula(c), p = r4(ptax);
    if (!(p > 0) || !(x.referencia > 0)) return null;
    if (p >= x.faixaMin && p <= x.faixaMax) return { dentro: true, ptax: p, base: x.referencia, variacao: r4(p - x.referencia), repasse: 0, valor: 0 };
    const base = x.partida === 'borda' ? (p > x.faixaMax ? x.faixaMax : x.faixaMin) : x.referencia, variacao = r4(p - base), repasse = variacao > 0 ? x.repasseAlta : x.repasseQueda;
    return { dentro: false, ptax: p, base, variacao, repasse, valor: r2((+usd || 0) * variacao * repasse) };
  }
  /** Cláusula da operação: a cadastrada, ou a híbrida da cotação aprovada. */
  function clausulaDaOp(db, o) {
    if (!o) return null;
    if (o.clausulaCambial) return normalizarClausula(o.clausulaCambial);
    const q = W.cotacaoDaOp(db, o), c = q && q.cambioProposta; if (!c || !(c.referencia > 0)) return null;
    const por = c.por010 || valoresPor010(q).cliente;
    return normalizarClausula({ origem: 'proposta', referencia: c.referencia, faixaMin: c.piso, faixaMax: c.teto, partida: 'referencia', repasseAlta: 1, repasseQueda: REPASSE_QUEDA, primeiraFixa: true,
      remessas: [{ id: 'p2', rotulo: '2ª parcela', usd: r2(por[1] / PASSO), parcela: 2, quando: 'vencimento' }, { id: 'p3', rotulo: '3ª parcela', usd: r2(por[2] / PASSO), parcela: 3, quando: 'registroDI' }] });
  }
  const spreadDe = (db, c) => (c && c.spread != null ? +c.spread : ((((db || {}).hubPainel || {})._cambio || {}).spread != null ? +db.hubPainel._cambio.spread : SPREAD_PADRAO));
  const cambioDaRemessa = (db, opId, remId) => (db.hubCambio || []).find(x => x && x.op === opId && x.remessaId === remId && (x.status === 'fechado' || x.status === 'liquidado'));
  /** Remessas da operação com o custo: o real pago, depois do câmbio; antes, US$ × PTAX do dia × (1 + spread). */
  function remessasDaOp(db, opId, ptaxHoje) {
    const o = (db.ops || []).find(x => x && x.id === opId), c = o && o.clausulaCambial ? normalizarClausula(o.clausulaCambial) : null;
    if (!c) return [];
    const sp = spreadDe(db, c);
    return c.remessas.filter(m => m.quando === 'cambio').map(m => {
      const cb = cambioDaRemessa(db, opId, m.id);
      if (cb) return Object.assign({}, m, { fechada: true, cambio: cb, custo: r2(+cb.valorBRL > 0 ? +cb.valorBRL : (+cb.valorME || m.usd) * (+cb.taxa || 0)), ptax: +cb.ptaxOficial || null });
      return Object.assign({}, m, { fechada: false, custo: ptaxHoje ? r2(m.usd * ptaxHoje * (1 + sp)) : null, ptax: ptaxHoje || null, spread: sp });
    });
  }
  /* ---------- Parcelas ---------- */
  /** Número da parcela: pela descrição ("2º recebimento", "2ª parcela", "parcela 2") ou pela ordem de vencimento. */
  function numeroNaOp(db, l) {
    const m = /([1-8])\s*[ºªo°]\s*(recebimento|parcela)|parcela\s*([1-8])\b/i.exec(String((l && (l.descCliente || l.desc)) || ''));
    if (m) return +(m[1] || m[3]);
    const ps = parcelasDoCliente(db, l.op, l.aditivo);
    return ps.indexOf(l) + 1 || null;
  }
  /* Parcelas do contrato principal; com `ad`, as do aditivo (bloco próprio, numeração própria). */
  const parcelasDoCliente = (db, opId, ad) => (db.fin || []).filter(l => l && l.op === opId && W.ehReceita(l) && !/reembolso do difal/i.test(l.desc || '') && (l.aditivo || '') === (ad || '')).sort((a, b) => W.vencDe(a).localeCompare(W.vencDe(b)));
  /** Valor do contrato da parcela, sem nenhum reajuste. */
  const valorContrato = l => (l.valorContrato != null ? +l.valorContrato : l.ajusteCambial ? +l.ajusteCambial.valorOriginal : +l.valor || 0);
  /** Onde o reajuste entra: a parcela indicada; já recebida, a próxima em aberto. */
  function parcelaAlvo(db, opId, n, ad) {
    const ps = parcelasDoCliente(db, opId, ad);
    return ps.find(l => !W.realizado(l) && numeroNaOp(db, l) >= n) || null;
  }
  /** Recalcula a parcela com os reajustes guardados. */
  function recomporParcela(l) {
    const base = valorContrato(l), soma = (l.reajustes || []).reduce((a, x) => a + (+x.valor || 0), 0);
    l.valorContrato = r2(base); l.valor = r2(Math.max(0, base + soma));
    return l;
  }
  /**
   * Câmbio registrado: reajuste da remessa na parcela certa, pela PTAX oficial daquela data. Guarda o cálculo de
   * cada câmbio separado; registrar de novo o mesmo câmbio substitui o cálculo dele, nunca soma duas vezes.
   */
  function aplicarReajusteCambio(db, cambio, ptaxOficial, por, agora) {
    const o = (db.ops || []).find(x => x && x.id === cambio.op); if (!o || !o.clausulaCambial) return { ok: false, motivo: 'sem cláusula' };
    const c = normalizarClausula(o.clausulaCambial), m = c.remessas.find(x => x.id === cambio.remessaId);
    if (!m) return { ok: false, motivo: 'sem remessa' };
    if (m.quando !== 'cambio') return { ok: false, motivo: 'esta remessa é reajustada pela data da parcela' };
    const r = reajusteDaClausula(c, m.usd, ptaxOficial); if (!r) return { ok: false, motivo: 'sem PTAX' };
    (db.fin || []).forEach(l => { if (l && l.op === o.id && (l.reajustes || []).some(x => x.cambioId === cambio._id)) { l.reajustes = l.reajustes.filter(x => x.cambioId !== cambio._id); if (!W.realizado(l)) recomporParcela(l); } });
    const alvo = parcelaAlvo(db, o.id, m.parcela); if (!alvo) return { ok: false, motivo: 'nenhuma parcela em aberto' };
    alvo.reajustes = (alvo.reajustes || []).concat([{ cambioId: cambio._id, remessaId: m.id, rotulo: m.rotulo || '', data: W.soData(cambio.dataFechamento || W.hojeISO()), ptax: r.ptax, usd: m.usd, referencia: c.referencia, base: r.base, variacao: r.variacao, repasse: r.repasse, valor: r.valor, dentro: r.dentro, por: por || '', em: agora || new Date().toISOString() }]);
    recomporParcela(alvo);
    alvo.alteracoes = (alvo.alteracoes || []).concat([{ em: agora || new Date().toISOString(), por: por || '', acao: `reajuste cambial ${m.rotulo || m.id}: PTAX ${r.ptax} × referência ${c.referencia} = ${r.valor}` }]);
    return { ok: true, parcela: alvo, reajuste: r };
  }
  /** "Se fechar hoje, a parcela fica R$ X": não grava nada. */
  function previaReajuste(db, opId, remessaId, ptax) {
    const o = (db.ops || []).find(x => x && x.id === opId); if (!o || !o.clausulaCambial) return null;
    const c = normalizarClausula(o.clausulaCambial), m = c.remessas.find(x => x.id === remessaId); if (!m) return null;
    const alvo = parcelaAlvo(db, opId, m.parcela), r = reajusteDaClausula(c, m.usd, ptax); if (!alvo || !r) return null;
    const outros = (alvo.reajustes || []).filter(x => x.remessaId !== m.id).reduce((a, x) => a + x.valor, 0);
    return { parcela: numeroNaOp(db, alvo), atual: r2(alvo.valor), novo: r2(valorContrato(alvo) + outros + r.valor), reajuste: r, custo: r2(m.usd * ptax * (1 + spreadDe(db, c))) };
  }
  /** O que o cliente vê na parcela: contrato + cada reajuste = total. Nunca o US$ remetido nem o spread. */
  function composicaoParcela(l) {
    const rs = (l.reajustes || []).map(x => ({ data: x.data, ptax: x.ptax, variacao: x.variacao, valor: x.valor, dentro: !!x.dentro, rotulo: x.rotulo || '', cambioId: x.cambioId || '' }));
    if (!rs.length && l.ajusteCambial) rs.push({ data: l.ajusteCambial.data, ptax: l.ajusteCambial.ptax, variacao: r4(l.ajusteCambial.ptax - l.ajusteCambial.referencia), valor: l.ajusteCambial.ajuste, dentro: !l.ajusteCambial.ajuste });
    return { contrato: r2(valorContrato(l)), reajustes: rs, total: r2(+l.valor || 0) };
  }
  const referenciaFixa = r => (typeof r === 'object' && r ? r : (+r > 0 ? { referencia: r4(r), piso: r4(+r * (1 - TOLERANCIA)), teto: r4(+r * (1 + TOLERANCIA)) } : null));

  /* ---------- Dia útil ---------- */
  function pascoa(ano) {
    const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(ano, mes - 1, dia));
  }
  const iso = d => d.toISOString().slice(0, 10);
  const mais = (d, n) => new Date(d.getTime() + n * 86400000);
  /** Feriados nacionais em que o Banco Central não publica PTAX. */
  function feriados(ano) {
    const p = pascoa(ano);
    return new Set([`${ano}-01-01`, `${ano}-04-21`, `${ano}-05-01`, `${ano}-09-07`, `${ano}-10-12`, `${ano}-11-02`, `${ano}-11-15`, `${ano}-11-20`, `${ano}-12-25`, iso(mais(p, -48)), iso(mais(p, -47)), iso(mais(p, -2)), iso(mais(p, 60))]);
  }
  function ehDiaUtil(data) {
    const d = new Date(String(data).slice(0, 10) + 'T12:00:00Z'), s = d.getUTCDay();
    return s !== 0 && s !== 6 && !feriados(d.getUTCFullYear()).has(iso(d));
  }
  function diaUtilAnterior(data) {
    let d = new Date(String(data).slice(0, 10) + 'T12:00:00Z');
    do { d = mais(d, -1); } while (!ehDiaUtil(iso(d)));
    return iso(d);
  }
  /**
   * Datas de PTAX de uma parcela. { fixa } na 1ª; { pendente } sem a data de registro da DI.
   * Em atraso, duas datas: a da parcela e o dia útil anterior ao pagamento (ou a hoje, enquanto não pago).
   */
  function datasDaParcela(n, ctx) {
    const c = ctx || {};
    if (n === 1) return { fixa: true, datas: [] };
    const baseISO = n === 2 ? c.vencimento : c.registroDI;
    if (!baseISO) return { pendente: n === 3 ? 'aguardando o registro da DI' : 'sem vencimento', datas: [] };
    const datas = [diaUtilAnterior(baseISO)];
    const quando = c.pagamento || c.hoje;
    if (c.vencimento && quando && String(quando).slice(0, 10) > String(c.vencimento).slice(0, 10)) { const d2 = diaUtilAnterior(quando); if (!datas.includes(d2)) datas.push(d2); }
    return { datas, atraso: datas.length > 1 };
  }
  /** Com várias datas, vale a maior PTAX. Devolve { data, ptax } ou null se falta alguma. */
  function ptaxQueVale(datas, ptaxes) {
    if (!datas.length || datas.some(d => !(+(ptaxes || {})[d] > 0))) return null;
    return datas.map(d => ({ data: d, ptax: +ptaxes[d] })).reduce((a, b) => (b.ptax > a.ptax ? b : a));
  }

  /* ---------- Valor por R$ 0,10 e simulação ---------- */
  function comCambio(q, delta) {
    const f = W.camposDe(q);
    return Object.assign({}, q, { fields: Object.assign({}, f, { txDesp: String((parseFloat(f.txDesp) || 0) + delta), txFrete: String((parseFloat(f.txFrete) || 0) + delta) }) });
  }
  /* Uma saída por parcela, na ordem do cronograma (3 nas cotações antigas). */
  const saidas = q => { const R = W.calcular(q); return W.saidasPorParcela(q, R).saidas; };
  /** Quanto muda o custo de cada parcela quando o dólar sobe R$ 0,10. A 1ª é fixa para o cliente: valor 0 na tabela. */
  function valoresPor010(q) {
    const a = saidas(q), b = saidas(comCambio(q, PASSO)), custo = b.map((v, i) => r2(v - a[i]));
    return { custo, cliente: custo.map((v, i) => (i === 0 ? 0 : v)) };
  }
  const parcelasDe = q => W.parcelasDe(q).map(p => p.valor);
  /* Regra de PTAX pela saída da parcela: sinal é fixo; saldo, o vencimento; chegada, a DI. Sem dólar (entrega, nenhuma): fixa. */
  const REGRA_POR_VINCULO = { sinal: 'Fixa', saldo: 'PTAX do dia útil anterior ao vencimento', chegada: 'PTAX do dia útil anterior ao registro da DI', entrega: 'Fixa', nenhuma: 'Fixa' };
  /** Painel interno: 3 cenários, por parcela, com preço ao cliente, custo e lucro. */
  function simulacaoCambio(q, ptax) {
    const ref = referenciaDaProposta(ptax); if (!ref) return null;
    const por = valoresPor010(q), rec = parcelasDe(q);
    const cenarios = CENARIOS_CAMBIO.map(delta => {
      const dolar = r4(ref.referencia + delta), cus = saidas(comCambio(q, delta));
      const parcelas = rec.map((v, i) => { const aj = i === 0 ? { ajuste: 0, dentro: true } : ajusteDaParcela(ref, por.cliente[i], dolar), preco = r2(v + aj.ajuste), custo = r2(cus[i]); return { n: i + 1, preco, ajuste: aj.ajuste, custo, lucro: r2(preco - custo) }; });
      const soma = k => r2(parcelas.reduce((a, p) => a + p[k], 0));
      return { delta, dolar, dentro: dolar >= ref.piso && dolar <= ref.teto, parcelas, preco: soma('preco'), custo: soma('custo'), lucro: soma('lucro') };
    });
    return { referencia: ref, cenarios };
  }
  /** Foto da aprovação: a referência e os valores por parcela não mudam depois. */
  function congelarCambio(q, ptax, data) {
    const ref = referenciaDaProposta(ptax); if (!ref) return null;
    return Object.assign({ data: data || '' }, ref, W.ehMultiCliente(q) ? {} : { por010: valoresPor010(q).cliente });
  }
  /**
   * Tabela que o cliente vê na proposta e no Anexo II do contrato: as duas saem daqui, com os mesmos números.
   * Sem dólar de custo, sem spread e sem quanto se remete à fábrica.
   */
  function tabelaCambio(q) {
    const c = q && q.cambioProposta; if (!c || !(c.referencia > 0)) return null;
    const por = c.por010 || valoresPor010(q).cliente, rec = parcelasDe(q);
    const ps = W.parcelasDe(q);
    return { data: c.data, referencia: c.referencia, piso: c.piso, teto: c.teto, tolerancia: TOLERANCIA, repasseQueda: REPASSE_QUEDA,
      parcelas: rec.map((v, i) => { const regra = i === 0 ? 'Fixa' : REGRA_POR_VINCULO[ps[i].vinculo] || 'Fixa', fixa = regra === 'Fixa';
        return { n: i + 1, valor: r2(v), por010: fixa ? 0 : r2(por[i] || 0), fixa, regra }; }) };
  }
  const moeda = v => (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const taxa = v => (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  /** O texto e as linhas da tabela, iguais na proposta e no contrato: o mesmo quadro do Anexo II. */
  /* "a 1ª parcela é fixa; a 2ª usa…; a 3ª, …": o texto de sempre para 3 parcelas, e o mesmo jeito para mais. */
  function regraDasParcelas(ps) {
    const padrao = ['Fixa', 'PTAX do dia útil anterior ao vencimento', 'PTAX do dia útil anterior ao registro da DI'];
    if (ps.length === 3 && ps.every((p, i) => p.regra === padrao[i])) return 'a 1ª parcela é fixa; a 2ª usa o dia útil anterior ao vencimento; a 3ª, o dia útil anterior ao registro da DI';
    const txt = r => (r === 'Fixa' ? 'é fixa' : r === padrao[1] ? 'usa o dia útil anterior ao vencimento' : 'usa o dia útil anterior ao registro da DI');
    const fixas = ps.filter(p => p.fixa).map(p => p.n + 'ª'), outras = ps.filter(p => !p.fixa).map(p => `a ${p.n}ª ${txt(p.regra)}`);
    return [fixas.length ? (fixas.length === 1 ? `a ${fixas[0]} parcela é fixa` : `as parcelas ${fixas.join(', ')} são fixas`) : ''].concat(outras).filter(Boolean).join('; ');
  }
  function textoCambio(t) {
    if (!t) return null;
    return {
      referencia: `Dólar de referência: R$ ${taxa(t.referencia)}.`,
      regra: `Vale a PTAX de venda do Banco Central: ${regraDasParcelas(t.parcelas)}. Dentro da faixa de R$ ${taxa(t.piso)} a R$ ${taxa(t.teto)} (1% sobre a referência), a parcela não muda. Fora dela, o ajuste é integral desde a referência, proporcional por fração de R$ 0,10. Cliente em atraso: vale a maior PTAX entre a data da parcela e o dia útil anterior ao pagamento.`,
      colunas: ['Parcela', `Alta (acima de R$ ${taxa(t.teto)})`, `Queda (abaixo de R$ ${taxa(t.piso)})`],
      linhas: t.parcelas.map(p => [`${p.n}ª parcela`, p.fixa ? 'Fixa' : 'R$ ' + moeda(p.por010), p.fixa ? 'Fixa' : 'R$ ' + moeda(p.por010 * REPASSE_QUEDA)])
    };
  }

  /* ---------- Parcelas previstas no Financeiro ---------- */
  const numeroDaParcela = l => { const m = /^([1-8])º recebimento/.exec(String((l && l.desc) || '')); return m ? +m[1] : null; };
  function registroDaDI(db, o) {
    if (o.dataRegistroDI) return W.soData(o.dataRegistroDI);
    const r = W.retratoDuimp(db, o.duimp || (o.duimpDados && o.duimpDados.geral && o.duimpDados.geral.numero));
    const d = r && r.dados.geral && r.dados.geral.dataRegistro;
    return d ? W.soData(d) : '';
  }
  /** Parcelas de recebimento com correção cambial, em aberto. Cada uma diz de que datas de PTAX precisa. */
  function parcelasComCambio(db, hoje) {
    const h = hoje || W.hojeISO(), out = [];
    (db.fin || []).forEach(l => {
      if (!l || !W.ehReceita(l) || W.realizado(l) || l.ajusteCambial) return;
      const n = numeroDaParcela(l); if (!n || n === 1) return;
      const o = (db.ops || []).find(x => x && x.id === l.op); if (!o) return;
      if (o.regraCambial && o.regraCambial.modelo === 'evento') return;   // padrão por evento: reajuste pelos eventos, não por aqui
      if (o.clausulaCambial && !normalizarClausula(o.clausulaCambial).remessas.some(m => m.parcela === n && m.quando !== 'cambio')) return;
      const q = W.cotacaoDaOp(db, o); if (!q || !q.cambioProposta) return;
      /* Parcela sem dólar (4ª em diante, sem valor por R$ 0,10): não tem correção. */
      if (n > 3 && !((q.cambioProposta.por010 || [])[n - 1] > 0)) return;
      const d = datasDaParcela(n, { vencimento: W.vencDe(l), registroDI: registroDaDI(db, o), hoje: h });
      out.push({ l, n, o, q, pendente: d.pendente || '', datas: d.datas || [], atraso: !!d.atraso, chegou: !!(d.datas || []).length && d.datas.every(x => x <= h) });
    });
    return out;
  }
  /** Calcula o valor corrigido para conferência. Não altera o lançamento. */
  function calcularAjusteLancamento(db, l, ptaxes, hoje) {
    const p = parcelasComCambio(db, hoje).find(x => x.l === l || x.l._id === l._id);
    if (!p) return { erro: 'Esta parcela não tem correção cambial.' };
    if (p.pendente) return { erro: 'Parcela ' + p.pendente + '.' };
    const v = ptaxQueVale(p.datas, ptaxes); if (!v) return { erro: 'Falta a PTAX da data.' };
    const c = p.q.cambioProposta, por = (c.por010 || valoresPor010(p.q).cliente)[p.n - 1], aj = ajusteDaParcela(c, por, v.ptax);
    return { n: p.n, op: p.o.id, data: v.data, ptax: v.ptax, referencia: c.referencia, por010: por, dentro: aj.dentro, fracoes: aj.fracoes, variacao: aj.variacao, ajuste: aj.ajuste, valorOriginal: r2(l.valor), corrigido: r2(Math.max(0, r2(l.valor) + aj.ajuste)), atraso: p.atraso };
  }
  /** Só isto grava, e só quando a pessoa confirma. */
  function confirmarAjusteCambial(l, calculo, por, agora) {
    if (!l || W.realizado(l)) return { ok: false, msg: 'Parcela já recebida não é ajustada.' };
    if (l.ajusteCambial) return { ok: false, msg: 'Esta parcela já foi ajustada.' };
    if (!calculo || calculo.erro) return { ok: false, msg: (calculo && calculo.erro) || 'Sem cálculo.' };
    const t = agora || new Date().toISOString();
    l.ajusteCambial = { ptax: calculo.ptax, data: calculo.data, referencia: calculo.referencia, por010: calculo.por010, ajuste: calculo.ajuste, valorOriginal: calculo.valorOriginal, por: por || '', em: t };
    l.valorContrato = calculo.valorOriginal;
    l.reajustes = (l.reajustes || []).concat([{ tipo: 'parcela', data: calculo.data, ptax: calculo.ptax, referencia: calculo.referencia, variacao: calculo.variacao, valor: calculo.ajuste, dentro: calculo.dentro, por: por || '', em: t }]);
    l.valor = calculo.corrigido;
    l.alteracoes = (l.alteracoes || []).concat([{ em: t, por: por || '', acao: `ajuste cambial: PTAX ${calculo.ptax} × referência ${calculo.referencia}, de ${calculo.valorOriginal} para ${calculo.corrigido}` }]);
    return { ok: true };
  }

  /* =====================================================================
     Padrão da casa (modelo Marquise · OP228): reajuste por EVENTO cambial.
     - Faixa de estabilidade (piso e teto da PTAX de venda). Dentro dela, nada muda.
     - Fora: só o que EXCEDE o limite, proporcional, por um valor fixo por unidade a cada R$ 0,10,
       com valor próprio de alta e de queda em cada evento (queda sempre menor: a WindGate nunca perde margem).
       ajuste = (PTAX − teto) ÷ 0,10 × valor/un. de alta × quantidade; na queda, −(piso − PTAX) ÷ 0,10 × valor/un. de queda × quantidade.
     - Eventos: 1ª remessa à fábrica (PTAX do dia útil seguinte ao crédito da 1ª parcela), 2ª remessa (idem, 2ª parcela)
       e registro da DI (PTAX do dia do registro). Cada um reajusta a parcela seguinte; a parcela final não tem ajuste.
     - O sistema calcula e deixa "aguardando o Samir"; só a aprovação grava na parcela (Financeiro e Desembolso).
     ===================================================================== */
  const EVENTOS_PADRAO = [
    { k: 'rem1', rotulo: '1ª remessa à fábrica', gatilho: 'parcela', parcelaGatilho: 1, parcelaAlvo: 2 },
    { k: 'rem2', rotulo: '2ª remessa à fábrica', gatilho: 'parcela', parcelaGatilho: 2, parcelaAlvo: 3 },
    { k: 'di', rotulo: 'Registro da DI (frete e tributos)', gatilho: 'registroDI', parcelaAlvo: 4 }];
  const GATILHOS_EVENTO = [['parcela', 'Dia útil seguinte ao crédito da parcela'], ['registroDI', 'Dia do registro da DI']];
  function normalizarRegra(r) {
    const x = Object.assign({ modelo: 'evento', referencia: 0, piso: 0, teto: 0, quantidade: 0, naoSeAplica: false, eventos: EVENTOS_PADRAO.map(e => Object.assign({}, e)) }, r || {});
    ['referencia', 'piso', 'teto'].forEach(k => { x[k] = r4(x[k]); });
    x.quantidade = +x.quantidade || 0;
    x.eventos = (x.eventos || []).filter(Boolean).map((e, i) => Object.assign({ k: 'e' + (i + 1), rotulo: '', gatilho: 'parcela', parcelaGatilho: i + 1, parcelaAlvo: i + 2 }, e,
      { alta: r4(e.alta), queda: r4(e.queda), parcelaAlvo: +e.parcelaAlvo || i + 2, parcelaGatilho: e.gatilho === 'registroDI' ? null : (+e.parcelaGatilho || i + 1) }));
    return x;
  }
  /** O que falta para a regra valer (vazio = completa). */
  function conferirRegra(r) {
    const x = normalizarRegra(r), e = [];
    if (x.naoSeAplica) return e;
    if (!(x.piso > 0 && x.teto > 0)) e.push('Informe o piso e o teto da faixa.');
    else if (x.piso >= x.teto) e.push('O piso da faixa tem de ser menor que o teto.');
    if (x.referencia > 0 && x.piso > 0 && x.teto > 0 && (x.referencia < x.piso || x.referencia > x.teto)) e.push('O dólar de referência fica dentro da faixa.');
    if (!(x.referencia > 0)) e.push('Informe o dólar de referência.');
    if (!(x.quantidade > 0)) e.push('Informe a quantidade (unidades).');
    if (!x.eventos.length) e.push('Informe os eventos cambiais.');
    x.eventos.forEach(v => {
      if (!(v.alta > 0)) e.push(`${v.rotulo || v.k}: informe o valor por unidade na alta.`);
      if (v.queda < 0 || (v.alta > 0 && v.queda >= v.alta)) e.push(`${v.rotulo || v.k}: o valor de queda tem de ser menor que o de alta.`);
    });
    return e;
  }
  /** Reajuste de um evento pela PTAX. Não grava nada. */
  function calcularReajusteEvento(regra, ev, ptax) {
    const x = normalizarRegra(regra), p = r4(ptax); if (!(p > 0) || !(x.piso > 0 && x.teto > 0)) return null;
    const qtd = x.quantidade;
    if (p >= x.piso && p <= x.teto) return { dentro: true, sentido: '', ptax: p, limite: null, excedente: 0, fracoes: 0, porUnidade: 0, quantidade: qtd, valor: 0 };
    const alta = p > x.teto, limite = alta ? x.teto : x.piso, excedente = r4(Math.abs(p - limite)), fracoes = r4(excedente / PASSO), porUnidade = alta ? ev.alta : ev.queda;
    const valor = r2((alta ? 1 : -1) * (excedente / PASSO) * porUnidade * qtd);
    return { dentro: false, sentido: alta ? 'alta' : 'queda', ptax: p, limite, excedente, fracoes, porUnidade, quantidade: qtd, valor };
  }
  function diaUtilSeguinte(data) {
    let d = new Date(String(data).slice(0, 10) + 'T12:00:00Z');
    do { d = mais(d, 1); } while (!ehDiaUtil(iso(d)));
    return iso(d);
  }
  const regraDaOp = o => (o && o.regraCambial && o.regraCambial.modelo === 'evento' ? normalizarRegra(o.regraCambial) : null);
  const parcelaN = (db, opId, n, ad) => parcelasDoCliente(db, opId, ad).find(l => numeroNaOp(db, l) === n) || null;
  /**
   * Eventos cambiais da operação, com a situação de cada um:
   * aguardando-gatilho (parcela não recebida / DI não registrada) · aguardando-ptax · dentro-da-faixa · aguardando-samir · aprovado · recusado.
   * ptaxes: { 'AAAA-MM-DD': venda }. ptaxHoje: para a estimativa dos que ainda não aconteceram.
   */
  function eventosDaOp(db, o, ptaxes, ptaxHoje) {
    const x = regraDaOp(o); if (!x || x.naoSeAplica) return [];
    const feitos = o.reajustesEvento || {}, px = ptaxes || {};
    return x.eventos.map(ev => {
      const reg = feitos[ev.k] || null, out = { k: ev.k, rotulo: ev.rotulo, evento: ev, registro: reg, parcelaAlvo: ev.parcelaAlvo };
      if (ev.gatilho === 'registroDI') {
        const di = registroDaDI(db, o);
        if (!di) return Object.assign(out, { status: 'aguardando-gatilho', motivo: 'aguardando o registro da DI', estimativa: ptaxHoje ? calcularReajusteEvento(x, ev, ptaxHoje) : null });
        out.dataRef = ehDiaUtil(di) ? di : diaUtilAnterior(di); out.registroDI = di;
      } else {
        const l = parcelaN(db, o.id, ev.parcelaGatilho, o._aditivo);
        if (!l || !W.realizado(l) || !l.liquidadoEm) return Object.assign(out, { status: 'aguardando-gatilho', motivo: `aguardando o crédito da ${ev.parcelaGatilho}ª parcela`, estimativa: ptaxHoje ? calcularReajusteEvento(x, ev, ptaxHoje) : null });
        out.dataCredito = W.soData(l.liquidadoEm); out.dataRef = diaUtilSeguinte(out.dataCredito);
      }
      if (reg && (reg.status === 'aprovado' || reg.status === 'recusado' || reg.status === 'dentro-da-faixa')) return Object.assign(out, { status: reg.status, ptax: reg.ptax, calculo: reg.calculo || null });
      const p = +px[out.dataRef];
      if (!(p > 0)) return Object.assign(out, { status: 'aguardando-ptax', motivo: `PTAX de ${out.dataRef} ainda não publicada` });
      const calc = calcularReajusteEvento(x, ev, p), alvo = parcelaAlvo(db, o.id, ev.parcelaAlvo, o._aditivo);
      if (!calc) return Object.assign(out, { status: 'aguardando-gatilho', motivo: 'regra incompleta: informe a faixa' });
      // Reajuste gravado antes por outro caminho (correção antiga, lançamento manual): nunca somar em cima sem o Samir decidir.
      const outros = alvo ? (alvo.reajustes || []).filter(r => r && r.tipo !== 'evento') : [];
      const conflito = outros.length ? { valor: r2(outros.reduce((a, r) => a + (+r.valor || 0), 0)), obs: outros.map(r => r.obs || r.tipo || 'reajuste').join(' · '), qtd: outros.length } : null;
      const novoValor = alvo ? r2(+alvo.valor + calc.valor) : null;
      return Object.assign(out, { status: calc.dentro ? 'dentro-da-faixa' : 'aguardando-samir', ptax: p, calculo: calc, alvo, novoValor, conflito,
        novoValorSubstituindo: alvo && conflito ? r2(+alvo.valor - conflito.valor + calc.valor) : null });
    });
  }
  const obsReajuste = (rotulo, dataRef) => `reajuste ${rotulo} · PTAX ${String(dataRef).split('-').reverse().join('/')}`;
  /** Aprovação do Samir: grava "valor base + reajuste" na parcela seguinte (Financeiro e Desembolso). Só isto grava. */
  function aprovarReajusteEvento(db, o, k, ptaxes, por, agora, opc) {
    const ev = eventosDaOp(db, o, ptaxes).find(e => e.k === k);
    if (!ev) return { ok: false, msg: 'Evento não encontrado.' };
    if (ev.status === 'aprovado') return { ok: false, msg: 'Este reajuste já foi aprovado.' };
    if (ev.status !== 'aguardando-samir') return { ok: false, msg: ev.motivo || 'Este evento não tem reajuste a aprovar.' };
    if (!ev.alvo) return { ok: false, msg: 'Nenhuma parcela em aberto para receber o reajuste.' };
    if (ev.conflito && !(opc && opc.substituir)) return { ok: false, conflito: ev.conflito, msg: `A parcela já tem reajuste gravado (${ev.conflito.obs}: ${ev.conflito.valor}). Substitua ou confira antes; nunca soma duas vezes.` };
    const t = agora || new Date().toISOString(), l = ev.alvo, c = ev.calculo;
    if (ev.conflito) {
      l.alteracoes = (l.alteracoes || []).concat([{ em: t, por: por || '', acao: `reajuste anterior substituído pelo do evento (${ev.conflito.obs}: ${ev.conflito.valor})`, reajustesAnteriores: (l.reajustes || []).filter(r => r && r.tipo !== 'evento') }]);
      l.reajustes = (l.reajustes || []).filter(r => r && r.tipo === 'evento');
    }
    l.reajustes = (l.reajustes || []).filter(r => r.eventoId !== k).concat([{ tipo: 'evento', eventoId: k, rotulo: ev.rotulo, data: ev.dataRef, dataCredito: ev.dataCredito || '', ptax: c.ptax, limite: c.limite, variacao: r4(c.ptax - c.limite), excedente: c.excedente,
      porUnidade: c.porUnidade, quantidade: c.quantidade, valor: c.valor, dentro: false, obs: obsReajuste(ev.rotulo, ev.dataRef), por: por || '', em: t }]);
    recomporParcela(l);
    l.obsReajuste = (l.reajustes || []).filter(r => r.obs).map(r => r.obs).join(' · ');
    l.alteracoes = (l.alteracoes || []).concat([{ em: t, por: por || '', acao: `${obsReajuste(ev.rotulo, ev.dataRef)}: ${c.ptax} × ${c.sentido === 'alta' ? 'teto' : 'piso'} ${c.limite} = ${c.valor}` }]);
    o.reajustesEvento = Object.assign({}, o.reajustesEvento, { [k]: { status: 'aprovado', dataRef: ev.dataRef, dataCredito: ev.dataCredito || '', ptax: c.ptax, valor: c.valor, calculo: c, lancId: l._id, por: por || '', em: t } });
    return { ok: true, parcela: l, calculo: c };
  }
  /** PTAX publicada e dentro da faixa: o evento fica encerrado, sem reajuste (não muda valor nenhum). Devolve quantos encerrou. */
  function registrarDentroDaFaixa(db, o, ptaxes, agora) {
    let n = 0;
    eventosDaOp(db, o, ptaxes).filter(e => e.status === 'dentro-da-faixa' && !(o.reajustesEvento || {})[e.k]).forEach(e => {
      o.reajustesEvento = Object.assign({}, o.reajustesEvento, { [e.k]: { status: 'dentro-da-faixa', dataRef: e.dataRef, dataCredito: e.dataCredito || '', ptax: e.ptax, valor: 0, calculo: e.calculo, por: 'sistema', em: agora || new Date().toISOString() } }); n++;
    });
    return n;
  }
  function recusarReajusteEvento(db, o, k, motivo, por, agora) {
    const ev = eventosDaOp(db, o, {}).find(e => e.k === k); if (!ev) return { ok: false, msg: 'Evento não encontrado.' };
    if (ev.status === 'aprovado') return { ok: false, msg: 'Já aprovado: desfaça na parcela.' };
    o.reajustesEvento = Object.assign({}, o.reajustesEvento, { [k]: { status: 'recusado', motivo: String(motivo || '').slice(0, 300), por: por || '', em: agora || new Date().toISOString() } });
    return { ok: true };
  }
  /** Regra editada na operação: fica o histórico de quem mudou e quando. */
  function salvarRegraOp(o, nova, por, agora) {
    const semHist = r => { const y = normalizarRegra(Object.assign({}, r, { modelo: 'evento' })); delete y.hist; return y; };
    const antes = o.regraCambial ? JSON.stringify(semHist(o.regraCambial)) : '', x = semHist(nova);
    if (antes === JSON.stringify(x)) return { ok: true, mudou: false };
    o.regraCambial = Object.assign(x, { hist: ((o.regraCambial || {}).hist || []).concat([{ por: por || '', em: agora || new Date().toISOString() }]).slice(-30) });
    return { ok: true, mudou: true };
  }
  /** Operações em andamento sem a regra de câmbio completa: a lista "completar regra de câmbio" do Samir. Aditivos entram também. */
  function opsSemRegraCambial(db) {
    const ativas = (db.ops || []).filter(o => o && o.id && W.emAndamento(o) && !W.ehMae(o));
    return ativas.filter(o => (db.fin || []).some(l => l && l.op === o.id && W.ehReceita(l) && !l.aditivo))
      .map(o => { const r = regraDaOp(o); return { o, faltas: r ? conferirRegra(r) : ['Regra de câmbio não cadastrada.'] }; })
      .concat(ativas.flatMap(o => aditivosDaOp(o).map(a => { const r = regraDaOp(a); return { o, aditivo: a, faltas: r ? conferirRegra(r) : ['Regra de câmbio do aditivo não cadastrada.'] }; })))
      .filter(x => x.faltas.length);
  }

  /* ---------- Aditivo dentro da operação (Parte 2.1) ----------
     Mesmo cliente, mesmos contêineres: quantidade, preço, parcelas e regra de câmbio próprios. As parcelas do aditivo
     são lançamentos da mesma operação marcados com `aditivo` (bloco separado no desembolso, numeração própria);
     a cobertura continua olhando a operação inteira. */
  const aditivosDaOp = o => (o && Array.isArray(o.aditivos) ? o.aditivos.filter(Boolean) : []);
  /** A operação "vista" pelo aditivo: o mesmo motor de eventos, só com a regra e as parcelas dele. */
  const vistaDoAditivo = (o, a) => ({ id: o.id, cliente: o.cliente, status: o.status, regraCambial: a.regraCambial, reajustesEvento: a.reajustesEvento || {}, _aditivo: a.id });
  /** Roda uma função de evento no aditivo e guarda o que ela gravar (aprovação, recusa, dentro da faixa) no próprio aditivo. */
  function noAditivo(o, adId, fn) {
    const a = aditivosDaOp(o).find(x => x.id === adId); if (!a) return { ok: false, msg: 'Aditivo não encontrado.' };
    const v = vistaDoAditivo(o, a), r = fn(v); a.reajustesEvento = v.reajustesEvento; return r;
  }
  function criarAditivo(db, o, dados, por, agora) {
    const d = dados || {}, t = agora || new Date().toISOString(), hoje = t.slice(0, 10);
    if (!o || !o.id) return { ok: false, msg: 'Operação não encontrada.' };
    if (W.ehMae && W.ehMae(o)) return { ok: false, msg: 'Aditivo vai na operação do cliente, não no contêiner.' };
    const ps = (d.parcelas || []).map(p => ({ valor: r2(p.valor), vencimento: String(p.vencimento || '').slice(0, 10) })).filter(p => p.valor > 0 || p.vencimento);
    const e = [];
    if (!(+d.quantidade > 0)) e.push('Informe a quantidade do aditivo.');
    if (!ps.length) e.push('Informe ao menos uma parcela.');
    ps.forEach((p, i) => { if (!(p.valor > 0)) e.push(`${i + 1}ª parcela sem valor.`); if (!/^\d{4}-\d{2}-\d{2}$/.test(p.vencimento)) e.push(`${i + 1}ª parcela sem vencimento.`); });
    const soma = r2(ps.reduce((a, p) => a + p.valor, 0)), preco = +d.preco > 0 ? r2(d.preco) : soma;
    if (ps.length && Math.abs(soma - preco) > 0.01) e.push(`As parcelas somam ${soma.toFixed(2)} e o preço do aditivo é ${preco.toFixed(2)}.`);
    if (e.length) return { ok: false, erros: e, msg: e[0] };
    const lista = aditivosDaOp(o); let n = lista.length + 1; while (lista.some(a => a.id === 'AD' + n)) n++;
    const id = 'AD' + n, rot = 'Aditivo ' + n;
    const ref = (regraDaOp(o) || {}).referencia || referenciaDaCotacao(db, o);
    const regra = Object.assign(d.regraCambial ? normalizarRegra(Object.assign({}, d.regraCambial, { modelo: 'evento' })) : regraDoPadrao(db, ref, d.quantidade), { hist: [{ por: por || '', em: t, acao: d.regraCambial ? 'cadastrada no aditivo' : 'copiada do padrão da casa' }] });
    const a = { id, n, rotulo: rot, quantidade: +d.quantidade, preco, obs: String(d.obs || '').slice(0, 300), quoteId: d.quoteId || '', regraCambial: regra, reajustesEvento: {}, criadoEm: t, por: por || '' };
    o.aditivos = lista.concat([a]);
    const emp = ((db.fin || []).find(l => l && l.op === o.id && W.ehReceita(l)) || {}).empresa || 'WindGate';
    const lancs = ps.map((p, i) => ({ _id: W.novoId(), data: hoje, vencimento: p.vencimento, op: o.id, tipo: 'Receita', categoria: '', fixo: false, empresa: emp, desc: `${rot} · ${i + 1}º recebimento do cliente`, descCliente: `${rot} · ${i + 1}ª parcela`,
      valor: p.valor, status: 'Previsto', comp: '', nf: '', por: por || '', origem: `aditivo:${o.id}:${id}`, aditivo: id }));
    db.fin = lancs.concat(db.fin || []);
    o.alteracoes = (o.alteracoes || []).concat([{ em: t, por: por || '', acao: `${rot}: ${a.quantidade} un., ${preco.toFixed(2)} em ${ps.length} parcela(s)` }]);
    return { ok: true, aditivo: a, lancamentos: lancs };
  }

  /* ---------- Padrão da casa em Configurações (Parte 2.1) ----------
     Faixa em R$ abaixo e acima do dólar de referência e a tabela por evento (alta e queda, R$/un. a cada R$ 0,10).
     Vai para cada operação nova; na operação, é editável com registro de quem mudou. Operação antiga não muda sozinha:
     a ficha só sugere o padrão, e vale quando alguém salva. Valores iniciais: o modelo Marquise (OP228). */
  const PADRAO_CASA = { abaixo: 0.25, acima: 0.20, eventos: [
    { k: 'rem1', rotulo: '1ª remessa à fábrica', gatilho: 'parcela', parcelaGatilho: 1, parcelaAlvo: 2, alta: 0.30, queda: 0.25 },
    { k: 'rem2', rotulo: '2ª remessa à fábrica', gatilho: 'parcela', parcelaGatilho: 2, parcelaAlvo: 3, alta: 0.70, queda: 0.60 },
    { k: 'di', rotulo: 'Registro da DI (frete e tributos)', gatilho: 'registroDI', parcelaAlvo: 4, alta: 0.95, queda: 0.85 }] };
  const clone = v => JSON.parse(JSON.stringify(v));
  function padraoDaCasa(db) {
    const p = (((db || {}).hubPainel || {})._regraCambial) || null, base = p && Array.isArray(p.eventos) && p.eventos.length ? p : PADRAO_CASA;
    return { abaixo: r4(base.abaixo != null ? base.abaixo : PADRAO_CASA.abaixo), acima: r4(base.acima != null ? base.acima : PADRAO_CASA.acima),
      eventos: normalizarRegra({ eventos: clone(base.eventos) }).eventos, cadastrado: !!p, por: (p && p.por) || '', em: (p && p.em) || '', hist: (p && p.hist) || [] };
  }
  function conferirPadrao(p) {
    const e = [];
    if (!(+p.abaixo > 0) || !(+p.acima > 0)) e.push('Informe quanto a faixa vai abaixo e acima da referência.');
    if (!(p.eventos || []).length) e.push('Informe os eventos cambiais.');
    (p.eventos || []).forEach(v => { if (!(+v.alta > 0)) e.push((v.rotulo || v.k) + ': informe o valor por unidade na alta.'); else if (+v.queda < 0 || +v.queda >= +v.alta) e.push((v.rotulo || v.k) + ': o valor de queda tem de ser menor que o de alta.'); });
    return e;
  }
  function salvarPadraoDaCasa(db, novo, por, agora) {
    const e = conferirPadrao(novo || {}); if (e.length) return { ok: false, erros: e, msg: e[0] };
    db.hubPainel = db.hubPainel || {};
    const ant = db.hubPainel._regraCambial || {}, t = agora || new Date().toISOString();
    db.hubPainel._regraCambial = { abaixo: r4(novo.abaixo), acima: r4(novo.acima), eventos: normalizarRegra({ eventos: novo.eventos }).eventos, por: por || '', em: t,
      hist: (ant.hist || []).concat([{ por: por || '', em: t, antes: ant.eventos ? { abaixo: ant.abaixo, acima: ant.acima, eventos: ant.eventos } : null }]).slice(-30) };
    return { ok: true };
  }
  /** Dólar de referência da operação: o da proposta aprovada (PTAX + R$ 0,05), se houver. */
  function referenciaDaCotacao(db, o) {
    const q = W.cotacaoDaOp ? W.cotacaoDaOp(db, o) : null, c = q && q.cambioProposta;
    return c && +c.referencia > 0 ? r4(c.referencia) : 0;
  }
  /** A regra que o padrão da casa daria para esta referência e quantidade. Não grava nada. */
  function regraDoPadrao(db, referencia, quantidade) {
    const p = padraoDaCasa(db), ref = r4(referencia) || 0;
    return normalizarRegra({ modelo: 'evento', origem: 'padrao', referencia: ref, piso: ref ? r4(ref - p.abaixo) : 0, teto: ref ? r4(ref + p.acima) : 0, quantidade: +quantidade || 0, eventos: clone(p.eventos) });
  }
  /** Operação nova: recebe a cópia do padrão (fica incompleta até ter referência e quantidade; aparece em "Completar regra"). */
  function aplicarPadraoNaOp(db, o, por, agora, opc) {
    if (!o || o.regraCambial || (W.ehMae && W.ehMae(o))) return false;
    const x = opc || {}, ref = +x.referencia > 0 ? x.referencia : referenciaDaCotacao(db, o);
    o.regraCambial = Object.assign(regraDoPadrao(db, ref, x.quantidade), { hist: [{ por: por || '', em: agora || new Date().toISOString(), acao: 'copiada do padrão da casa' }] });
    return true;
  }
  /** O texto da regra, igual na ficha e no desembolso. Só a PTAX oficial: nada de valor remetido, contrato de câmbio ou custo. */
  function textoRegra(r) {
    const x = normalizarRegra(r), t4 = v => (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    return `Dentro da faixa de R$ ${t4(x.piso)} a R$ ${t4(x.teto)} a parcela não muda. Fora dela, só o que exceder o limite reajusta a parcela seguinte, proporcional, por um valor fixo por unidade a cada R$ 0,10 em cada evento, pela PTAX-venda oficial do Banco Central do dia útil seguinte ao crédito de cada parcela e do dia do registro da DI. A parcela final não tem ajuste. PTAX oficial disponível para conferência.`;
  }

  /**
   * Apuração cambial de um evento (PDF + texto de e-mail para o cliente). Só a PTAX oficial do Banco Central:
   * nunca valor remetido, contrato de câmbio, DI ou custo interno. Não grava nada.
   */
  function apuracaoCambial(db, o, k, ptaxes) {
    const x = regraDaOp(o); if (!x) return { ok: false, msg: 'Operação sem regra de câmbio.' };
    const ev = eventosDaOp(db, o, ptaxes || {}).find(e => e.k === k); if (!ev) return { ok: false, msg: 'Evento não encontrado.' };
    let c = ev.calculo, parcela = null, anterior = null, novo = null;
    if (ev.status === 'aprovado') {
      const reg = (o.reajustesEvento || {})[k] || {}, l = (db.fin || []).find(y => y && y._id === reg.lancId);
      c = reg.calculo || c; if (l) { parcela = numeroNaOp(db, l); novo = r2(+l.valor); anterior = r2(novo - (+c.valor || 0)); }
    } else if (ev.status === 'aguardando-samir' && ev.alvo) { parcela = numeroNaOp(db, ev.alvo); anterior = r2(+ev.alvo.valor); novo = ev.novoValor; }
    else if (ev.status !== 'dentro-da-faixa') return { ok: false, msg: ev.motivo || 'Ainda não há apuração para este evento.' };
    if (!c) return { ok: false, msg: 'Sem PTAX para apurar.' };
    const d = v => String(v || '').slice(0, 10).split('-').reverse().join('/'), t4 = v => (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }), m = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const dados = { ok: true, op: o.id, cliente: o.cliente || '', evento: ev.rotulo, status: ev.status, dataCredito: ev.dataCredito || '', registroDI: ev.registroDI || '', dataRef: ev.dataRef, ptax: c.ptax,
      piso: x.piso, teto: x.teto, dentro: !!c.dentro, sentido: c.sentido || '', limite: c.limite, excedente: c.excedente || 0, fracoes: c.fracoes || 0, porUnidade: c.porUnidade || 0, quantidade: c.quantidade || x.quantidade, valor: c.valor || 0, parcela, anterior, novo };
    const calc = dados.dentro ? `A PTAX ficou dentro da faixa (R$ ${t4(x.piso)} a R$ ${t4(x.teto)}): a parcela não muda.`
      : `Excedente sobre o ${dados.sentido === 'alta' ? 'teto' : 'piso'}: R$ ${t4(c.ptax)} − R$ ${t4(c.limite)} = R$ ${t4(c.excedente)}${dados.sentido === 'alta' ? '' : ' (queda)'}.\nCálculo: ${t4(c.excedente)} ÷ 0,10 × ${m(c.porUnidade)} por unidade × ${(+dados.quantidade).toLocaleString("pt-BR")} unidades = ${dados.sentido === 'alta' ? '' : '− '}${m(Math.abs(c.valor))}.`;
    dados.linhas = [
      [ev.registroDI ? 'Registro da DI' : 'Data do crédito', d(ev.registroDI || ev.dataCredito)],
      ['Data de referência', d(ev.dataRef) + (ev.registroDI ? ' (dia do registro)' : ' (dia útil seguinte ao crédito)')],
      ['PTAX oficial do Banco Central (venda)', 'R$ ' + t4(c.ptax)],
      ['Faixa sem reajuste', `R$ ${t4(x.piso)} a R$ ${t4(x.teto)}`]].concat(dados.dentro ? [] : [
      ['Excedente sobre o ' + (dados.sentido === 'alta' ? 'teto' : 'piso'), 'R$ ' + t4(c.excedente)],
      ['Cálculo', `${t4(c.excedente)} ÷ 0,10 × ${m(c.porUnidade)}/un. × ${(+dados.quantidade).toLocaleString("pt-BR")} un.`],
      ['Reajuste', (c.valor < 0 ? '− ' : '+ ') + m(Math.abs(c.valor))]]).concat(parcela && !dados.dentro ? [[`Novo valor da ${parcela}ª parcela`, `${m(anterior)} → ${m(novo)}`]] : []);
    dados.assunto = `${o.id} · apuração cambial · ${ev.rotulo}`;
    dados.texto = [`Prezados,`, '', `Segue a apuração cambial da operação ${o.id}, referente a: ${ev.rotulo}.`, '',
      `${ev.registroDI ? 'Registro da DI' : 'Crédito da parcela'}: ${d(ev.registroDI || ev.dataCredito)}`, `Data de referência: ${d(ev.dataRef)}`, `PTAX oficial do Banco Central (venda): R$ ${t4(c.ptax)}`, `Faixa sem reajuste: R$ ${t4(x.piso)} a R$ ${t4(x.teto)}`, '', calc,
      parcela && !dados.dentro ? `Novo valor da ${parcela}ª parcela: ${m(novo)} (antes ${m(anterior)}).` : '', '', 'A PTAX pode ser conferida no site do Banco Central (bcb.gov.br).', '', 'Atenciosamente,', 'WindGate'].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
    return dados;
  }

  return { EVENTOS_PADRAO, PADRAO_CASA, apuracaoCambial, aditivosDaOp, vistaDoAditivo, noAditivo, criarAditivo, padraoDaCasa, conferirPadrao, salvarPadraoDaCasa, referenciaDaCotacao, regraDoPadrao, aplicarPadraoNaOp, textoRegra, GATILHOS_EVENTO, normalizarRegra, conferirRegra, calcularReajusteEvento, diaUtilSeguinte, regraDaOp, eventosDaOp, aprovarReajusteEvento, recusarReajusteEvento, registrarDentroDaFaixa, salvarRegraOp, opsSemRegraCambial,
    SPREAD_PADRAO, QUANDO, normalizarClausula, conferirClausula, reajusteDaClausula, clausulaDaOp, spreadDe, remessasDaOp, numeroNaOp, parcelasDoCliente, valorContrato, parcelaAlvo, recomporParcela, aplicarReajusteCambio, previaReajuste, composicaoParcela, CENARIOS_CAMBIO, referenciaDaProposta, ajusteDaParcela, ehDiaUtil, diaUtilAnterior, datasDaParcela, ptaxQueVale, valoresPor010, simulacaoCambio, congelarCambio, tabelaCambio, textoCambio, numeroDaParcela, parcelasComCambio, calcularAjusteLancamento, confirmarAjusteCambial };
});
