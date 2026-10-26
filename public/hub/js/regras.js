/* =====================================================================
   WindGate Hub 2.0 — regras de dados e de negócio (sem tela).

   Roda no navegador (window.WG) e no Node (require) para ser testado.
   O formato dos dados é EXATAMENTE o do sistema atual: o Hub 2.0 lê e grava
   o mesmo banco, com o mesmo protocolo de sincronização (`_id` estável +
   `_removidos`), para que nada se perca e os dois sistemas convivam durante
   a transição.
   ===================================================================== */
(function (raiz, fabrica) {
  const api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.WG = api;
})(typeof self !== 'undefined' ? self : this, function () {

  /* ---------- Protocolo de sincronização (idêntico ao sistema atual) ---------- */

  const COLECOES_SYNC = ['ops', 'docs', 'fin', 'finRec', 'fretes', 'fornecedores', 'qindex', 'agendaTasks',
    'crm', 'crmDocs', 'crmOps', 'parceiros', 'opStatusHist'];

  function novoId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  /* Mesmo algoritmo do sistema atual e do servidor: o mesmo registro antigo
     chega ao mesmo id em qualquer navegador. */
  function idDeterministico(rec) {
    const txt = JSON.stringify(rec);
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < txt.length; i++) {
      const c = txt.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
    }
    return 'h-' + h1.toString(36) + h2.toString(36);
  }

  /** Garante as coleções e os ids, sem inventar dado nenhum. */
  function prepararBanco(db) {
    if (!db || typeof db !== 'object') db = {};
    COLECOES_SYNC.forEach(k => { if (!Array.isArray(db[k])) db[k] = []; });
    ['checklists', 'quotes', 'gestao', 'agentes', 'notifLidas', 'portos', 'users'].forEach(k => {
      if (!db[k] || typeof db[k] !== 'object' || Array.isArray(db[k])) db[k] = {};
    });
    if (!db.settings || typeof db.settings !== 'object') db.settings = {};
    if (!db._removidos || typeof db._removidos !== 'object') db._removidos = {};
    COLECOES_SYNC.forEach(k => db[k].forEach(r => { if (r && typeof r === 'object' && !r._id) r._id = idDeterministico(r); }));
    return db;
  }

  function fotografarIds(db) {
    const out = {};
    COLECOES_SYNC.forEach(k => { out[k] = new Set((db[k] || []).map(r => r && r._id).filter(Boolean)); });
    return out;
  }

  /** O que sumiu desde a última fotografia vira "excluído" para o servidor. */
  function registrarRemocoes(db, conhecidos, agora) {
    const t = agora || Date.now();
    COLECOES_SYNC.forEach(k => {
      const antes = conhecidos[k]; if (!antes) return;
      const atual = new Set((db[k] || []).map(r => r && r._id).filter(Boolean));
      antes.forEach(id => { if (!atual.has(id)) db._removidos[id] = t; });
    });
    return fotografarIds(db);
  }

  /** Junta o banco do servidor com o local sem perder o que ainda não subiu. */
  function aplicarSincronizacao(local, servidor) {
    const removidos = Object.assign({}, local && local._removidos, servidor._removidos);
    const out = Object.assign({}, local, servidor);
    COLECOES_SYNC.forEach(k => {
      const doServidor = Array.isArray(servidor[k]) ? servidor[k] : [];
      const idsServidor = new Set(doServidor.map(r => r && r._id).filter(Boolean));
      const soLocais = ((local && local[k]) || []).filter(r => r && r._id && !idsServidor.has(r._id) && !removidos[r._id]);
      out[k] = doServidor.filter(r => !(r && r._id && removidos[r._id])).concat(soLocais);
    });
    out._removidos = removidos;
    return prepararBanco(out);
  }

  /* Gravação parcial: o Hub só envia o que ELE mudou desde a última leitura.
     Assim uma aba aberta há tempo não devolve ao servidor cópias velhas de
     registros que outra pessoa alterou nesse meio-tempo. */
  const OBJETOS_SYNC = ['users', 'checklists', 'quotes', 'gestao', 'agentes', 'ncmlib', 'notifLidas', 'portos'];
  function fotografarConteudo(db) {
    const base = { col: {}, obj: {} };
    COLECOES_SYNC.forEach(k => { const m = new Map(); (db[k] || []).forEach(r => { if (r && r._id) m.set(r._id, JSON.stringify(r)); }); base.col[k] = m; });
    OBJETOS_SYNC.forEach(k => { const m = new Map(); const o = db[k]; if (o && typeof o === 'object') Object.keys(o).forEach(c => m.set(c, JSON.stringify(o[c]))); base.obj[k] = m; });
    return base;
  }
  function diferencas(db, base) {
    const out = { _removidos: Object.assign({}, db._removidos) }; let n = 0;
    COLECOES_SYNC.forEach(k => {
      const m = base.col[k] || new Map();
      const mud = (db[k] || []).filter(r => r && r._id && m.get(r._id) !== JSON.stringify(r));
      if (mud.length) { out[k] = mud; n += mud.length; }
    });
    OBJETOS_SYNC.forEach(k => {
      const m = base.obj[k] || new Map(), o = db[k]; if (!o || typeof o !== 'object') return;
      const parte = {};
      Object.keys(o).forEach(c => { if (m.get(c) !== JSON.stringify(o[c])) { parte[c] = o[c]; n++; } });
      if (Object.keys(parte).length) out[k] = parte;
    });
    return { corpo: out, n };
  }
  function absorver(base, corpo) {
    COLECOES_SYNC.forEach(k => (corpo[k] || []).forEach(r => (base.col[k] = base.col[k] || new Map()).set(r._id, JSON.stringify(r))));
    OBJETOS_SYNC.forEach(k => { const p = corpo[k]; if (p) Object.keys(p).forEach(c => (base.obj[k] = base.obj[k] || new Map()).set(c, JSON.stringify(p[c]))); });
  }

  /* ---------- Operações ---------- */

  const STATUS_OP = [
    { k: 'cotacao', l: 'Cotação', c: '#8A94AD' },
    { k: 'contrato', l: 'Contrato', c: '#0E7C8C' },
    { k: 'producao', l: 'Em produção', c: '#B7791F' },
    { k: 'preparacao_embarque', l: 'Preparando embarque', c: '#C2410C' },
    { k: 'container_enviado_porto', l: 'Contêiner no porto', c: '#0F766E' },
    { k: 'embarcado', l: 'Em trânsito', c: '#0046AD' },
    { k: 'chegada', l: 'Chegada · Desembaraço', c: '#6D28D9' },
    { k: 'logistica', l: 'Logística nacional', c: '#CE0058' },
    { k: 'documentacao', l: 'Trâmite documental', c: '#2563EB' },
    { k: 'entregue', l: 'Entregue', c: '#0F8A5F' },
    { k: 'concluida', l: 'Concluída', c: '#8A94AD' },
    { k: 'travada', l: 'Travada', c: '#C2283B' }
  ];
  const FLUXO = ['cotacao', 'contrato', 'producao', 'preparacao_embarque', 'container_enviado_porto', 'embarcado', 'chegada', 'logistica', 'documentacao', 'entregue', 'concluida'];
  const FINALIZADAS = ['entregue', 'concluida'];
  const PRAZO_STATUS = { cotacao: 7, contrato: 7, producao: 30, preparacao_embarque: 5, container_enviado_porto: 4, embarcado: 75, chegada: 7, logistica: 5 };
  const stMeta = k => STATUS_OP.find(s => s.k === k) || { k: k || '', l: k || '—', c: '#8A94AD' };
  const ativa = o => o && !FINALIZADAS.includes(o.status);

  const soData = v => String(v || '').slice(0, 10);
  const ehISO = v => /^\d{4}-\d{2}-\d{2}/.test(String(v || ''));
  const MS_DIA = 864e5;
  function diasEntre(de, ate) {
    if (!ehISO(de) || !ehISO(ate)) return null;
    return Math.round((new Date(soData(ate) + 'T12:00:00') - new Date(soData(de) + 'T12:00:00')) / MS_DIA);
  }
  const hojeISO = (agora) => {
    const d = agora ? new Date(agora) : new Date();
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
    return f.format(d);
  };

  function prazoAlvo(db, k) {
    const cfg = (db && db.settings && db.settings.prazosStatus) || {};
    const v = cfg[k] != null ? +cfg[k] : PRAZO_STATUS[k];
    return isFinite(v) && v > 0 ? v : null;
  }

  /** Dias na etapa, prazo-alvo e situação (no prazo / atenção / atrasado). */
  function prazoInfo(db, o, hoje) {
    const h = hoje || hojeISO();
    const dias = ehISO(o.statusEm) ? Math.max(0, diasEntre(o.statusEm, h)) : null;
    const alvo = prazoAlvo(db, o.status);
    let sit = 'sem';
    if (dias != null && alvo) sit = dias > alvo ? 'atrasado' : (dias >= alvo * 0.8 ? 'atencao' : 'ok');
    return { dias, alvo, sit, atraso: dias != null && alvo ? Math.max(0, dias - alvo) : 0 };
  }

  /** % do checklist documental (aprovado ou N/A contam como feito). */
  function checklistPct(db, opId) {
    const l = (db.checklists || {})[opId];
    if (!Array.isArray(l) || !l.length) return null;
    return Math.round(l.filter(i => i && (i.status === 'aprovado' || i.status === 'na')).length / l.length * 100);
  }

  /* ---------- Financeiro ---------- */

  const ehReceita = l => l && l.tipo === 'Receita';
  const valorDe = l => +(l && l.valor) || 0;
  const vencDe = l => soData((l && (l.vencimento || l.data)) || '');
  const mesDe = iso => soData(iso).slice(0, 7);
  const realizado = l => l && l.status === 'Realizado';
  const transferencia = l => !!(l && (l.transf || l.categoria === 'Transferência'));
  const empresaOk = (l, emp) => !emp || emp === 'todas' || (l.empresa || 'WindGate') === emp;

  /** Painel do mês: a receber, recebido, a pagar, pago, vencidos e saldo. */
  function painelMes(db, mes, empresa, hoje) {
    const h = hoje || hojeISO();
    const out = { receber: 0, recebido: 0, pagar: 0, pago: 0, vencidoReceber: 0, vencidoPagar: 0, qtdPagar: 0, qtdReceber: 0 };
    (db.fin || []).forEach(l => {
      if (!l || transferencia(l) || !empresaOk(l, empresa)) return;
      const v = valorDe(l), venc = vencDe(l), feito = realizado(l);
      const mesConta = feito ? mesDe(l.liquidadoEm || venc) : mesDe(venc);
      if (!feito && venc < h) { if (ehReceita(l)) out.vencidoReceber += v; else out.vencidoPagar += v; }
      if (mesConta !== mes) return;
      if (ehReceita(l)) { if (feito) out.recebido += v; else { out.receber += v; out.qtdReceber++; } }
      else { if (feito) out.pago += v; else { out.pagar += v; out.qtdPagar++; } }
    });
    out.resultadoPrevisto = (out.receber + out.recebido) - (out.pagar + out.pago);
    out.resultadoRealizado = out.recebido - out.pago;
    return out;
  }

  /** Contas em aberto num intervalo de vencimento (inclui vencidas antes dele). */
  function contasAbertas(db, tipo, ate, empresa) {
    return (db.fin || []).filter(l => l && !realizado(l) && !transferencia(l) && empresaOk(l, empresa)
      && (tipo === 'Receita' ? ehReceita(l) : !ehReceita(l)) && (!ate || vencDe(l) <= ate))
      .sort((a, b) => vencDe(a).localeCompare(vencDe(b)));
  }

  /* DRE gerencial por competência (mês do vencimento). Transferências entre
     empresas não são receita nem despesa; empréstimos são movimento de caixa,
     mostrados à parte, fora do resultado. */
  const ehImposto = l => /imposto/i.test(l.categoria || '');
  const ehEmprestimo = l => /empr[eé]stimo/i.test(l.categoria || '');
  const daOperacao = l => !!(l.op && l.op !== 'WindGate');

  function dre(db, mes, empresa, aliqIR) {
    const ir = aliqIR == null ? 0.34 : aliqIR;
    const z = () => ({ prev: 0, real: 0 });
    const L = { receitaOps: z(), receitaOutras: z(), impostosOps: z(), custoOps: z(), despesasFixas: z(), impostosGerais: z(), emprestimosEntrada: z(), emprestimosSaida: z() };
    (db.fin || []).forEach(l => {
      if (!l || transferencia(l) || !empresaOk(l, empresa) || mesDe(vencDe(l)) !== mes) return;
      const v = valorDe(l), col = realizado(l) ? 'real' : 'prev';
      let linha;
      if (ehEmprestimo(l)) linha = ehReceita(l) ? 'emprestimosEntrada' : 'emprestimosSaida';
      else if (ehReceita(l)) linha = daOperacao(l) ? 'receitaOps' : 'receitaOutras';
      else if (ehImposto(l)) linha = daOperacao(l) ? 'impostosOps' : 'impostosGerais';
      else linha = daOperacao(l) ? 'custoOps' : 'despesasFixas';
      L[linha][col] += v;
    });
    const tot = k => L[k].prev + L[k].real;
    const receita = tot('receitaOps') + tot('receitaOutras');
    const lucroBruto = receita - tot('impostosOps') - tot('custoOps');
    const lair = lucroBruto - tot('despesasFixas') - tot('impostosGerais');
    const irEst = lair > 0 ? lair * ir : 0;
    return { linhas: L, receita, lucroBruto, lair, ir: irEst, lucroLiquido: lair - irEst, porSocio: (lair - irEst) / 2,
      realizadoPct: receita ? (L.receitaOps.real + L.receitaOutras.real) / receita : 0 };
  }

  /** Resultado de cada operação: receita e despesa previstas/realizadas. */
  function resultadoPorOp(db, empresa) {
    const m = {};
    (db.fin || []).forEach(l => {
      if (!l || !daOperacao(l) || transferencia(l) || ehEmprestimo(l) || !empresaOk(l, empresa)) return;
      const o = m[l.op] = m[l.op] || { op: l.op, rp: 0, rr: 0, dp: 0, dr: 0 };
      const v = valorDe(l);
      if (ehReceita(l)) { if (realizado(l)) o.rr += v; else o.rp += v; }
      else { if (realizado(l)) o.dr += v; else o.dp += v; }
    });
    return Object.values(m).map(o => {
      const rec = o.rp + o.rr, desp = o.dp + o.dr;
      return Object.assign(o, { receita: rec, despesa: desp, resultado: rec - desp, margem: desp ? (rec - desp) / desp : null,
        saldoReceber: o.rp, caixa: o.rr - o.dr });
    }).sort((a, b) => String(b.op).localeCompare(String(a.op), 'pt-BR', { numeric: true }));
  }

  /** Fluxo de caixa projetado por semana (contas em aberto + realizado). */
  function fluxoSemanal(db, inicio, semanas, empresa, comVencidos) {
    const out = [];
    const venc = { de: '0000-01-01', ate: '', entra: 0, sai: 0, vencido: true };
    for (let i = 0; i < semanas; i++) {
      const ini = new Date(inicio + 'T12:00:00'); ini.setDate(ini.getDate() + i * 7);
      const fim = new Date(ini); fim.setDate(fim.getDate() + 6);
      out.push({ de: ini.toISOString().slice(0, 10), ate: fim.toISOString().slice(0, 10), entra: 0, sai: 0 });
    }
    (db.fin || []).forEach(l => {
      if (!l || transferencia(l) || !empresaOk(l, empresa) || realizado(l)) return;
      const d = vencDe(l); const s = d < inicio ? (comVencidos ? venc : null) : out.find(x => d >= x.de && d <= x.ate);
      if (!s) return;
      if (ehReceita(l)) s.entra += valorDe(l); else s.sai += valorDe(l);
    });
    return comVencidos ? [venc].concat(out) : out;
  }

  /* Lançamento fixo: série (modelo) + uma ocorrência por mês, igual ao sistema atual. */
  const FIN_REC_TOTAL_PADRAO = 12;
  function mesSoma(mesRef, n) {
    const p = String(mesRef).split('-');
    const t = (parseInt(p[0], 10) * 12) + (parseInt(p[1], 10) - 1) + (n | 0);
    return String(Math.floor(t / 12)).padStart(4, '0') + '-' + String((t % 12) + 1).padStart(2, '0');
  }
  function vencDoMes(mesRef, dia) {
    const p = String(mesRef).split('-');
    const max = new Date(parseInt(p[0], 10), parseInt(p[1], 10), 0).getDate();
    return mesRef + '-' + String(Math.min(Math.max(parseInt(dia, 10) || 1, 1), max)).padStart(2, '0');
  }
  function novaSerie(db, campos, total, primeiraRealizada, hoje) {
    const venc = campos.vencimento;
    const serie = { _id: novoId(), tipo: campos.tipo, empresa: campos.empresa, op: campos.op || 'WindGate', categoria: campos.categoria || '',
      desc: campos.desc || '', valor: +campos.valor || 0, dia: parseInt(String(venc).slice(8, 10), 10) || 1, inicio: mesDe(venc),
      total: Math.max(1, Math.min(120, parseInt(total, 10) || FIN_REC_TOTAL_PADRAO)), por: campos.por || '',
      criadaEm: hoje || hojeISO(), encerradaEm: null, renovadaEm: null };
    db.finRec.push(serie);
    const ocs = [];
    for (let i = 1; i <= serie.total; i++) {
      const mesRef = mesSoma(serie.inicio, i - 1), v = vencDoMes(mesRef, serie.dia);
      ocs.push({ _id: novoId(), recId: serie._id, recIdx: i, recTot: serie.total, mesRef, data: v, vencimento: v, op: serie.op,
        tipo: serie.tipo, categoria: serie.categoria, fixo: true, desc: serie.desc, valor: serie.valor, empresa: serie.empresa,
        status: 'Previsto', liquidadoEm: null, valorPago: null, valorPrevisto: null, comp: '', nf: '', por: serie.por });
    }
    if (primeiraRealizada && ocs.length) Object.assign(ocs[0], { status: 'Realizado', liquidadoEm: campos.liquidadoEm || ocs[0].vencimento, comp: campos.comp || '', nf: campos.nf || '' });
    db.fin.unshift(...ocs);
    return serie;
  }

  /** Dar baixa: mesma semântica do sistema atual (valor = o que foi pago). */
  function realizar(l, valorPago, data, hoje) {
    const prev = l.valorPrevisto != null ? +l.valorPrevisto : valorDe(l);
    l.status = 'Realizado';
    l.liquidadoEm = data || hoje || hojeISO();
    l.valorPago = valorPago > 0 ? +(+valorPago).toFixed(2) : prev;
    l.valorPrevisto = l.valorPago !== prev ? prev : null;
    l.valor = l.valorPago;
    return l;
  }

  /* ---------- Alertas da Torre de Controle ---------- */

  function alertas(db, hoje) {
    const h = hoje || hojeISO();
    const out = [];
    (db.ops || []).filter(ativa).forEach(o => {
      if (o.status === 'travada') out.push({ nivel: 'critico', op: o.id, titulo: `${o.id} está travada`, detalhe: o.prox || o.obs || 'Sem próxima ação definida' });
      const p = prazoInfo(db, o, h);
      if (p.sit === 'atrasado') out.push({ nivel: 'critico', op: o.id, titulo: `${o.id} · ${stMeta(o.status).l} há ${p.dias} dias`, detalhe: `Prazo-alvo de ${p.alvo} dias, ${p.atraso} de atraso` });
      const eta = soData(o.eta);
      if (ehISO(eta) && ['embarcado', 'container_enviado_porto'].includes(o.status)) {
        const d = diasEntre(h, eta);
        if (d != null && d >= 0 && d <= 10) {
          const pct = checklistPct(db, o.id);
          out.push({ nivel: pct != null && pct < 60 ? 'atencao' : 'info', op: o.id, titulo: `${o.id} chega em ${d} dia(s)`, detalhe: `ETA ${eta.split('-').reverse().join('/')}` + (pct != null ? ` · documentos ${pct}%` : '') });
        }
      }
    });
    const vencidas = (db.fin || []).filter(l => l && !realizado(l) && !transferencia(l) && vencDe(l) && vencDe(l) < h);
    const vr = vencidas.filter(ehReceita), vp = vencidas.filter(l => !ehReceita(l));
    if (vr.length) out.push({ nivel: 'atencao', titulo: `${vr.length} recebimento(s) vencido(s)`, detalhe: 'Cobrar o cliente ou dar baixa', tela: 'fin' });
    if (vp.length) out.push({ nivel: 'atencao', titulo: `${vp.length} pagamento(s) vencido(s) sem baixa`, detalhe: 'Conferir se já foi pago', tela: 'fin' });
    const ordem = { critico: 0, atencao: 1, info: 2 };
    return out.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
  }

  /* ---------- Formatação ---------- */
  const fmtBRL = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtBRLk = v => { const n = +v || 0; return Math.abs(n) >= 1e6 ? 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi' : Math.abs(n) >= 1e4 ? 'R$ ' + (n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil' : fmtBRL(n); };
  const dataBR = iso => ehISO(iso) ? soData(iso).split('-').reverse().join('/') : '—';

  return {
    COLECOES_SYNC, OBJETOS_SYNC, novoId, idDeterministico, prepararBanco, fotografarIds, registrarRemocoes, aplicarSincronizacao,
    fotografarConteudo, diferencas, absorver,
    STATUS_OP, FLUXO, FINALIZADAS, PRAZO_STATUS, stMeta, ativa, prazoAlvo, prazoInfo, checklistPct, diasEntre, hojeISO, soData, ehISO,
    ehReceita, realizado, transferencia, vencDe, mesDe, painelMes, contasAbertas, dre, resultadoPorOp, fluxoSemanal,
    novaSerie, realizar, mesSoma, vencDoMes, alertas, fmtBRL, fmtBRLk, dataBR
  };
});
