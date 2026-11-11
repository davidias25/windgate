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
    const ps = parcelasDoCliente(db, l.op);
    return ps.indexOf(l) + 1 || null;
  }
  const parcelasDoCliente = (db, opId) => (db.fin || []).filter(l => l && l.op === opId && W.ehReceita(l) && !/reembolso do difal/i.test(l.desc || '')).sort((a, b) => W.vencDe(a).localeCompare(W.vencDe(b)));
  /** Valor do contrato da parcela, sem nenhum reajuste. */
  const valorContrato = l => (l.valorContrato != null ? +l.valorContrato : l.ajusteCambial ? +l.ajusteCambial.valorOriginal : +l.valor || 0);
  /** Onde o reajuste entra: a parcela indicada; já recebida, a próxima em aberto. */
  function parcelaAlvo(db, opId, n) {
    const ps = parcelasDoCliente(db, opId);
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
  const saidas = q => { const R = W.calcular(q); if (q.clienteId) W.separarDifal(R); return W.saidasPorParcela(q, R).saidas; };
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

  return { SPREAD_PADRAO, QUANDO, normalizarClausula, conferirClausula, reajusteDaClausula, clausulaDaOp, spreadDe, remessasDaOp, numeroNaOp, parcelasDoCliente, valorContrato, parcelaAlvo, recomporParcela, aplicarReajusteCambio, previaReajuste, composicaoParcela, CENARIOS_CAMBIO, referenciaDaProposta, ajusteDaParcela, ehDiaUtil, diaUtilAnterior, datasDaParcela, ptaxQueVale, valoresPor010, simulacaoCambio, congelarCambio, tabelaCambio, textoCambio, numeroDaParcela, parcelasComCambio, calcularAjusteLancamento, confirmarAjusteCambial };
});
