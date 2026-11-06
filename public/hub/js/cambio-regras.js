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
    const ref = referenciaFixa(referencia), p = r4(ptax);
    if (!ref || !(p > 0)) return null;
    if (p >= ref.piso && p <= ref.teto) return { dentro: true, variacao: r4(p - ref.referencia), fracoes: 0, ajuste: 0 };
    const variacao = r4(p - ref.referencia), fracoes = r4(Math.abs(variacao) / PASSO), bruto = fracoes * (+valorPor010 || 0);
    return { dentro: false, variacao, fracoes, ajuste: r2(variacao > 0 ? bruto : -bruto * REPASSE_QUEDA) };
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
  const saidas = q => { const o = W.desemOuts(q, W.calcular(q)); return [o.o1, o.o2, o.o3]; };
  /** Quanto muda o custo de cada parcela quando o dólar sobe R$ 0,10. A 1ª é fixa para o cliente: valor 0 na tabela. */
  function valoresPor010(q) {
    const a = saidas(q), b = saidas(comCambio(q, PASSO)), custo = b.map((v, i) => r2(v - a[i]));
    return { custo, cliente: [0, custo[1], custo[2]] };
  }
  const parcelasDe = q => { const f = W.camposDe(q); return [f.desR1, f.desR2, f.desR3].map(v => parseFloat(v) || 0); };
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
    const regra = ['Fixa', 'PTAX do dia útil anterior ao vencimento', 'PTAX do dia útil anterior ao registro da DI'];
    return { data: c.data, referencia: c.referencia, piso: c.piso, teto: c.teto, tolerancia: TOLERANCIA, repasseQueda: REPASSE_QUEDA,
      parcelas: rec.map((v, i) => ({ n: i + 1, valor: r2(v), por010: i === 0 ? 0 : r2(por[i]), fixa: i === 0, regra: regra[i] })) };
  }
  const moeda = v => (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const taxa = v => (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  /** O texto e as linhas da tabela, iguais na proposta e no contrato: o mesmo quadro do Anexo II. */
  function textoCambio(t) {
    if (!t) return null;
    return {
      referencia: `Dólar de referência: R$ ${taxa(t.referencia)}.`,
      regra: `Vale a PTAX de venda do Banco Central: a 1ª parcela é fixa; a 2ª usa o dia útil anterior ao vencimento; a 3ª, o dia útil anterior ao registro da DI. Dentro da faixa de R$ ${taxa(t.piso)} a R$ ${taxa(t.teto)} (1% sobre a referência), a parcela não muda. Fora dela, o ajuste é integral desde a referência, proporcional por fração de R$ 0,10. Cliente em atraso: vale a maior PTAX entre a data da parcela e o dia útil anterior ao pagamento.`,
      colunas: ['Parcela', `Alta (acima de R$ ${taxa(t.teto)})`, `Queda (abaixo de R$ ${taxa(t.piso)})`],
      linhas: t.parcelas.map(p => [`${p.n}ª parcela`, p.fixa ? 'Fixa' : 'R$ ' + moeda(p.por010), p.fixa ? 'Fixa' : 'R$ ' + moeda(p.por010 * REPASSE_QUEDA)])
    };
  }

  /* ---------- Parcelas previstas no Financeiro ---------- */
  const numeroDaParcela = l => { const m = /^([123])º recebimento/.exec(String((l && l.desc) || '')); return m ? +m[1] : null; };
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
      const q = W.cotacaoDaOp(db, o); if (!q || !q.cambioProposta) return;
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
    l.valor = calculo.corrigido;
    l.alteracoes = (l.alteracoes || []).concat([{ em: t, por: por || '', acao: `ajuste cambial: PTAX ${calculo.ptax} × referência ${calculo.referencia}, de ${calculo.valorOriginal} para ${calculo.corrigido}` }]);
    return { ok: true };
  }

  return { CENARIOS_CAMBIO, referenciaDaProposta, ajusteDaParcela, ehDiaUtil, diaUtilAnterior, datasDaParcela, ptaxQueVale, valoresPor010, simulacaoCambio, congelarCambio, tabelaCambio, textoCambio, numeroDaParcela, parcelasComCambio, calcularAjusteLancamento, confirmarAjusteCambial };
});
