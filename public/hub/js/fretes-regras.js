/* =====================================================================
   WindGate Hub 2.0 — regras de Fretes & Benchmark (sem tela).

   Conversão do frete para reais pela PTAX com a regra do agente, trava da
   PTAX no dia da chegada, memória de preços por rota, leitura automática da
   proposta e o formato do registro. Tudo idêntico à aba Fretes do sistema
   atual: os dois sistemas leem e gravam os MESMOS campos em `fretes` e
   `agentes`, e quem edita só mexe nos campos do formulário — o resto do
   registro fica como estava.

   Mesmo formato de módulo do regras.js: roda no navegador (window.WG) e no
   Node (require), para ser testado.
   ===================================================================== */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./regras.js'));
  else Object.assign(raiz.WG, fabrica(raiz.WG));
})(typeof self !== 'undefined' ? self : this, function (W) {

  /* Listas fechadas, na mesma ordem do sistema atual. */
  const FRETE_STATUS = ['Cotado', 'Negociando', 'Fechado', 'Expirado'];
  const FRETE_MODAIS = ['FCL', 'LCL', 'Aéreo', 'Cabotagem', 'Rodoviário'];
  const FRETE_RESP = ['Matheus', 'Davi', 'Samir', 'Ívina'];
  /* Campos que o formulário de frete grava. Qualquer outro campo do registro
     (data, ptaxLock, agente, campos futuros) é preservado na edição. */
  const FRETE_CAMPOS = ['op', 'empresa', 'rota', 'modal', 'contato', 'fone', 'fabContato', 'fabEmail', 'fabWhats', 'usd', 'brl', 'chegada', 'validade', 'status', 'resp'];
  const AGENTE_NOVO = () => ({ tipo: 'Agente de carga', regra: 0, contato: '', fone: '' });

  const nrm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const fmtUSD = v => 'USD ' + (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtTaxa = v => (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4 });
  const p2 = n => String(n).padStart(2, '0');
  /** Data de registro no formato do sistema atual (dd/mm/aaaa, como toLocaleDateString('pt-BR')). */
  const hojeBR = d => { d = d || new Date(); return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear(); };
  const isoParaBR = iso => { const s = W.soData(iso); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : String(iso || ''); };

  /** Valor em dólar como número. Registros antigos podem trazer texto ("2,500.00" ou "2.500,00"); a regra é a mesma da migração do sistema atual. */
  function usdNum(v) {
    if (typeof v !== 'string') return +v || 0;
    const s = v.trim();
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return parseFloat(s.replace(/,/g, '')) || 0;
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /,\d{2}$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
    return parseFloat(s.replace(/,/g, '')) || 0;
  }

  /** Rota normalizada para agrupar: "Shanghai → Pecém", "shanghai para pecem" e "SHANGHAI x PECÉM" são a mesma. */
  function rotaKey(r) {
    const t = nrm(r), m = t.split(/→|->|\bpara\b|\bto\b|—|–| x /);
    return m.length > 1 ? m[0].trim() + ' → ' + m[m.length - 1].trim() : t;
  }

  const regraAgente = (agentes, emp) => { const a = agentes && emp ? agentes[emp] : null; return a ? (+a.regra || 0) : 0; };

  /** Total da cotação em R$: dólar × PTAX × (1 + regra do agente) + taxas em reais.
      Vale a PTAX travada do dia da chegada; antes disso, a mais recente (projeção). */
  function freteBRL(f, agentes, fxAtual) {
    const regra = regraAgente(agentes, f && f.empresa);
    const fx = (f && f.ptaxLock) || fxAtual;
    const usd = usdNum(f && f.usd), extras = +(f && f.brl) || 0;
    if (!usd && !extras) return null;
    if (usd && (!fx || !fx.rate)) return null;          // sem PTAX não dá para converter
    const convertido = usd ? usd * fx.rate * (1 + regra / 100) : 0;
    return { brl: convertido + extras, convertido, extras, usd, fx, regra, locked: !!(f && f.ptaxLock) };
  }

  /** Prévia do formulário: mesma conta, com a PTAX vigente (nunca a travada). */
  function previaFreteBRL(usd, extras, regra, fx) {
    usd = +usd || 0; extras = +extras || 0; regra = +regra || 0;
    const temFx = !!(fx && fx.rate);
    const conv = temFx && usd ? usd * fx.rate * (1 + regra / 100) : 0;
    if (usd && !temFx) return { semPtax: true, extras, total: null, conv: 0 };
    if (!conv && !extras) return null;
    return { semPtax: false, conv, extras, total: conv + extras, regra, rate: temFx ? fx.rate : null };
  }

  /** Memória de preços por rota: só cotações com dólar; a primeira da lista é a mais recente.
      Mediana = valor do meio da lista ordenada (o de cima, quando a quantidade é par), como no sistema atual. */
  function estatisticasRotas(fretes) {
    const g = new Map();
    (fretes || []).filter(f => f && usdNum(f.usd) > 0).forEach(f => { const k = rotaKey(f.rota); if (!g.has(k)) g.set(k, []); g.get(k).push(f); });
    return [...g.entries()].map(([chave, arr]) => {
      const vals = arr.map(f => usdNum(f.usd)).sort((a, b) => a - b);
      const min = vals[0], mediana = vals[Math.floor(vals.length / 2)], ultima = usdNum(arr[0].usd), delta = ultima - min;
      return { chave, rota: arr[0].rota, n: arr.length, min, mediana, ultima, delta, leitura: vals.length < 2 ? 'poucas' : delta <= 0 ? 'melhor' : 'brigar' };
    });
  }

  /** Referência interna para a cotação que está sendo digitada. */
  function referenciaRota(fretes, rota, usd) {
    usd = +usd || 0;
    if (!rota || !usd) return null;
    const k = rotaKey(rota);
    const hist = (fretes || []).filter(f => f && usdNum(f.usd) > 0 && rotaKey(f.rota) === k).map(f => usdNum(f.usd));
    if (!hist.length) return null;
    const min = Math.min.apply(null, hist);
    return { n: hist.length, min, acima: usd > min ? usd - min : 0, melhor: usd <= min };
  }

  /** Regra da PTAX agrupada por percentual (maior primeiro), para a frase sair do próprio banco. */
  function regrasPtax(agentes) {
    const por = {};
    Object.entries(agentes || {}).forEach(([nome, a]) => { const r = +(a && a.regra) || 0; (por[r] = por[r] || []).push(nome); });
    return Object.keys(por).map(Number).sort((a, b) => b - a).map(r => ({ regra: r, nomes: por[r].sort() }));
  }
  const juntarNomes = n => n.length > 1 ? n.slice(0, -1).join(', ') + ' e ' + n[n.length - 1] : (n[0] || '');

  /** Empresas da lista fechada, separadas como no seletor do sistema atual. */
  function empresasFrete(agentes) {
    const e = Object.entries(agentes || {});
    return { agentes: e.filter(([, v]) => v && v.tipo === 'Agente de carga'), armadores: e.filter(([, v]) => !v || v.tipo !== 'Agente de carga') };
  }

  /* ---------- PTAX ---------- */

  /** PTAX vigente: a oficial do dia (servidor) vence; sem ela, a mais recente entre a
      gravada pelo sistema atual (`ptax`) e a informada à mão no Hub. */
  function ptaxVigente(doServidor, ptaxBanco, ptaxManual) {
    if (doServidor && +doServidor.venda > 0) {
      return { rate: +doServidor.venda, date: isoParaBR(doServidor.em), source: 'PTAX · Banco Central', official: true, ts: Date.parse(doServidor.em) || null };
    }
    const c = [ptaxBanco, ptaxManual].filter(p => p && +p.rate > 0).sort((a, b) => (+b.ts || 0) - (+a.ts || 0));
    return c[0] || null;
  }

  /** PTAX que vale para a data (aaaa-mm-dd): a última cotação até ela, no máximo 6 dias antes
      (fim de semana e feriado usam o último dia útil — mesma janela do sistema atual). */
  function ptaxNaData(serie, iso) {
    const alvo = W.soData(iso); if (!alvo) return null;
    const lim = (() => { const d = new Date(alvo + 'T12:00:00'); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); })();
    const ok = (serie || []).filter(x => x && +x.venda > 0 && W.soData(x.em) <= alvo && W.soData(x.em) >= lim).sort((a, b) => String(a.em).localeCompare(String(b.em)));
    const u = ok[ok.length - 1];
    return u ? { rate: +u.venda, date: isoParaBR(u.em), source: 'PTAX · Banco Central' } : null;
  }

  /** Chegou o dia e a PTAX ainda não foi travada. */
  const precisaTravarPtax = (f, hojeIso) => !!(f && f.chegada && f.chegada <= hojeIso && !f.ptaxLock);

  /* ---------- Registro ---------- */

  /** Cotação nova no formato do sistema atual (data dd/mm/aaaa, novas primeiro). */
  function novoFrete(campos, id, data) {
    const out = { _id: id || W.novoId(), data: data || hojeBR() };
    FRETE_CAMPOS.forEach(k => { out[k] = campos[k] == null ? (k === 'usd' || k === 'brl' ? 0 : '') : campos[k]; });
    out.ptaxLock = null;
    return out;
  }

  /** Edição no próprio registro: só os campos do formulário mudam. Se a data de chegada
      mudou, a PTAX travada (do dia antigo) é solta para ser buscada de novo. */
  function editarFrete(f, campos) {
    if (!f) return f;
    const novos = {};
    FRETE_CAMPOS.forEach(k => { if (k in campos) novos[k] = campos[k]; });
    if ('chegada' in novos && f.chegada !== novos.chegada) f.ptaxLock = null;
    return Object.assign(f, novos);
  }

  /** "Outra…" no seletor: a empresa entra na agenda como agente de carga sem acréscimo. */
  function garantirAgente(agentes, nome) {
    if (nome && !agentes[nome]) agentes[nome] = AGENTE_NOVO();
    return agentes[nome];
  }
  /** Contato e telefone digitados na cotação ficam salvos na agenda (só se preenchidos). */
  function guardarContatoAgente(agentes, emp, contato, fone) {
    const a = agentes && agentes[emp]; if (!a) return false;
    let mudou = false;
    if (contato && a.contato !== contato) { a.contato = contato; mudou = true; }
    if (fone && a.fone !== fone) { a.fone = fone; mudou = true; }
    return mudou;
  }

  /* ---------- Leitura automática da proposta (texto colado do PDF) ---------- */
  const EMPRESAS_PROPOSTA = [['nsl', 'NSL'], ['suntrans', 'Suntrans'], ['fontime', 'Fontime'], ['next', 'Next'], ['alianca', 'Aliança'], ['aliança', 'Aliança'], ['belmont', 'Belmont'], ['msc', 'MSC'], ['maersk', 'Maersk'], ['hapag', 'Hapag-Lloyd'], ['cma', 'CMA CGM']];
  const PORTOS_PROPOSTA = ['shanghai', 'ningbo', 'qingdao', 'shenzhen', 'xiamen', 'tianjin', 'shantou', 'guangzhou', 'yantian', 'dalian', 'santos', 'pecem', 'suape', 'itajai', 'navegantes', 'paranagua', 'salvador', 'fortaleza', 'mucuripe', 'vitoria', 'rio grande'];
  function lerPropostaFrete(txt, ano) {
    const t = ' ' + String(txt || '').replace(/\s+/g, ' ') + ' ', tl = nrm(t), out = {};
    for (const [k, v] of EMPRESAS_PROPOSTA) { if (tl.includes(k)) { out.empresa = v; break; } }
    // valores em dólar — fica o maior (o total da proposta)
    const vals = []; const re = /(?:USD|US\$|U\$|\$)\s*([\d][\d.,]{2,12})/gi; let m;
    while ((m = re.exec(t))) {
      const s = m[1].replace(/[.,]+$/, ''); let n;   // ponto final da frase não é casa decimal ("US$ 1.250,00.")
      if (s.includes(',') && s.includes('.')) n = s.lastIndexOf(',') > s.lastIndexOf('.') ? parseFloat(s.replace(/\./g, '').replace(',', '.')) : parseFloat(s.replace(/,/g, ''));
      else if (s.includes(',')) n = /,\d{2}$/.test(s) ? parseFloat(s.replace(/\./g, '').replace(',', '.')) : parseFloat(s.replace(/,/g, ''));
      else n = parseFloat(s);
      if (n > 50 && n < 200000) vals.push(n);
    }
    if (vals.length) out.usd = Math.max.apply(null, vals);
    const achados = []; PORTOS_PROPOSTA.forEach(p => { const ix = tl.indexOf(p); if (ix >= 0) achados.push([ix, p]); });
    achados.sort((a, b) => a[0] - b[0]);
    if (achados.length >= 2) { const cap = s => s.replace(/(^|\s)\S/g, c => c.toUpperCase()); out.rota = cap(achados[0][1]) + ' → ' + cap(achados[achados.length - 1][1]); }
    if (/lcl/i.test(t)) out.modal = 'LCL';
    else if (/a[eé]reo|airfreight|air freight/i.test(t)) out.modal = 'Aéreo';
    else if (/(40|20)\s*'?\s*(hc|hq|gp|dv|dc|st)|fcl/i.test(t)) out.modal = 'FCL';
    const v = /valid[a-z]*\.?\s*:?\s*(?:until|at[eé]|to)?\s*(\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?)/i.exec(t);
    if (v) out.validade = v[1];
    const c = /(?:eta|chegada|arrival)[^\d]{0,15}(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/i.exec(t);
    if (c) { const y = c[3] ? (c[3].length === 2 ? '20' + c[3] : c[3]) : String(ano || new Date().getFullYear()); out.chegada = y + '-' + c[2].padStart(2, '0') + '-' + c[1].padStart(2, '0'); }
    return out;
  }

  /** Pedido pronto de análise de mercado para colar no Claude (mesmo texto do sistema atual). */
  function promptMercadoFrete(fretes, data) {
    const linhas = (fretes || []).filter(Boolean).slice(0, 8).map(f => `- ${f.rota} · ${f.empresa} · ${fmtUSD(usdNum(f.usd))} · ${f.modal} · status ${f.status}`).join('\n');
    return `Você é meu analista de fretes marítimos China → Brasil (Nordeste, porto do Pecém/CE). Hoje é ${data || hojeBR()}.

Cotações que recebi esta semana:
${linhas || '- (colar cotações aqui)'}

Analise e me responda de forma objetiva:
1. Esses valores estão consistentes com o mercado atual? Compare com Drewry WCI, Freightos FBX (rota China → América do Sul costa leste) e qualquer referência pública desta semana.
2. Quanto dá para negociar em cada uma (alvo de contraproposta em USD) para o Matheus brigar direto com o agente?
3. Projeção para as próximas 4–8 semanas nessas rotas: tendência de alta ou baixa? Considere: capacidade/blank sailings, congestionamento em portos, clima/tufões no Pacífico, feriados chineses próximos (Golden Week, Ano Novo Chinês), demanda sazonal.
4. Alertas de eventos que possam afetar prazo ou preço (greves, seca no canal, geopolítica).
Formato: análise curta por rota + tabela de alvos de negociação + recomendação de quando fechar (agora ou aguardar).`;
  }

  return {
    FRETE_STATUS, FRETE_MODAIS, FRETE_RESP, FRETE_CAMPOS, fmtUSD, fmtTaxa, hojeBR, usdNum, rotaKey, regraAgente, freteBRL, previaFreteBRL,
    estatisticasRotas, referenciaRota, regrasPtax, juntarNomes, empresasFrete, ptaxVigente, ptaxNaData, precisaTravarPtax,
    novoFrete, editarFrete, garantirAgente, guardarContatoAgente, lerPropostaFrete, promptMercadoFrete
  };
});
