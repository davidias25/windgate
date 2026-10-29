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
    'crm', 'crmDocs', 'crmOps', 'parceiros', 'opStatusHist', 'hubRecados', 'hubPedidos', 'hubErros', 'hubNotas', 'hubExtratos', 'hubFornecedores', 'hubReunioes', 'hubRH', 'hubCambio', 'hubContratos', 'hubCompliance', 'hubNFe'];

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
    ['checklists', 'quotes', 'gestao', 'agentes', 'notifLidas', 'portos', 'users', 'hubPainel'].forEach(k => {
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
  const OBJETOS_SYNC = ['users', 'checklists', 'quotes', 'gestao', 'agentes', 'ncmlib', 'notifLidas', 'portos', 'hubPainel', 'settings'];
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


  /* ---------- Perfis e permissões (Torre por função) ---------- */
  /* Cada pessoa tem um perfil; o perfil define o que ela pode ver e fazer.
     fin.ver = painel, DRE, contas e resultado · fin.lancar = registrar e dar baixa
     fin.excluir · fin.autorizar = autorizar pagamento · fin.resultado = margem por operação
     equipe.ver = desempenho da equipe · recado.outros = fixar recado na torre de outra pessoa
     torre.outros = montar a torre de outra pessoa · meta.editar = meta do mês
     nfe.ver = ver as NF-e emitidas · nfe.emitir = montar, conferir, transmitir, cancelar e corrigir NF-e
     (só Operações e o contador emitem; a diretoria acompanha) */
  const PERFIS = {
    diretoria: { nome: 'Diretoria', foco: 'Visão do todo, caixa, aprovações e desempenho da equipe',
      caps: ['fin.ver', 'fin.lancar', 'fin.excluir', 'fin.autorizar', 'fin.resultado', 'equipe.ver', 'recado.outros', 'torre.outros', 'meta.editar', 'docs.revisar', 'rh.ver', 'cultura.editar', 'crm.ver', 'crm.valores', 'pedidos.ver', 'fiscal.ver', 'fiscal.editar', 'chat.aviso', 'dash.fin', 'sourcing.ver', 'reuniao.editar', 'nfe.ver'],
      torre: ['excecoes', 'resumo', 'aprovacoes', 'vendas', 'caixa', 'equipe', 'etapas', 'alertas', 'recados', 'operacoes'] },
    operacoes: { nome: 'Diretor de Operações · Financeiro', foco: 'Operações, revisão de documentos, custos, cotações e pagamentos',
      caps: ['fin.ver', 'fin.lancar', 'fin.excluir', 'fin.resultado', 'equipe.ver', 'recado.outros', 'docs.revisar', 'crm.ver', 'crm.valores', 'pedidos.ver', 'fiscal.ver', 'fiscal.editar', 'chat.aviso', 'dash.fin', 'sourcing.ver', 'reuniao.editar', 'nfe.ver', 'nfe.emitir'],
      torre: ['excecoes', 'resumo', 'revisar', 'vendas', 'pagar', 'caixa', 'etapas', 'alertas', 'equipe', 'tarefas', 'recados', 'operacoes'] },
    frete: { nome: 'Frete, Tracking & Lançamentos', foco: 'Fretes, embarques, tracking e lançamentos do financeiro',
      caps: ['fin.lancar', 'sourcing.ver'],
      torre: ['excecoes', 'resumo', 'fretes', 'transito', 'lancar', 'tarefas', 'recados', 'alertas', 'etapas'] },
    rh: { nome: 'Pessoas & Cultura (RH)', foco: 'Desenvolvimento da equipe, cultura, comunicação interna e ponto',
      caps: ['equipe.ver', 'rh.ver', 'chat.aviso', 'recado.outros', 'cultura.editar', 'reuniao.editar'], torre: ['equipe', 'recados', 'tarefas', 'alertas'], restrito: true },
    contador: { nome: 'Contabilidade (acesso externo)', foco: 'Notas fiscais e extratos do trimestre para a apuração',
      caps: ['fiscal.ver', 'nfe.ver', 'nfe.emitir'], torre: [], externo: true },
    documentos: { nome: 'Documentação & Atendimento', foco: 'Documentos das operações e contato com clientes',
      caps: ['crm.ver', 'pedidos.ver', 'sourcing.ver'],
      torre: ['excecoes', 'resumo', 'coletar', 'clientes', 'vendas', 'tarefas', 'recados', 'alertas', 'etapas', 'operacoes'] }
  };
  const PERFIL_PADRAO = { samir: 'diretoria', davi: 'operacoes', matheus: 'frete', ivina: 'documentos', pedro: 'contador', oneide: 'rh' };
  function perfilDe(db, k) {
    const u = (db && db.users && db.users[k]) || {};
    const id = (u.perfilHub && PERFIS[u.perfilHub]) ? u.perfilHub : PERFIL_PADRAO[k] || (u.fin ? 'operacoes' : 'documentos');
    return Object.assign({ id }, PERFIS[id]);
  }
  const pode = (db, k, cap) => perfilDe(db, k).caps.includes(cap);

  /* Painéis da torre: quem pode ter cada um (cap exigida). */
  const PAINEIS = {
    excecoes: { t: 'O que precisa de ação agora' },
    resumo: { t: 'Números do dia' }, etapas: { t: 'Operações por etapa' }, operacoes: { t: 'Operações ativas' },
    alertas: { t: 'Alertas' }, recados: { t: 'Recados e prioridades' }, tarefas: { t: 'Minhas tarefas' },
    coletar: { t: 'Documentos a coletar' }, revisar: { t: 'Documentos aguardando revisão', cap: 'docs.revisar' },
    clientes: { t: 'Clientes a atualizar' }, fretes: { t: 'Frete e embarque' }, transito: { t: 'Em trânsito e chegadas' },
    lancar: { t: 'A lançar e conferir', cap: 'fin.lancar' }, pagar: { t: 'Pagamentos da semana', cap: 'fin.ver' },
    caixa: { t: 'Caixa: a receber e a pagar', cap: 'fin.ver' }, aprovacoes: { t: 'Aguardando sua aprovação', cap: 'fin.autorizar' },
    equipe: { t: 'Desempenho da equipe', cap: 'equipe.ver' },
    vendas: { t: 'Vendas: minhas próximas ações', cap: 'crm.ver' }
  };
  function paineisPermitidos(db, k) { return Object.keys(PAINEIS).filter(id => !PAINEIS[id].cap || pode(db, k, PAINEIS[id].cap)); }
  /** Torre salva da pessoa (se houver), sempre limitada ao que o perfil permite. */
  function torreDe(db, k) {
    const ok = new Set(paineisPermitidos(db, k));
    const salva = db && db.hubPainel && db.hubPainel[k] && Array.isArray(db.hubPainel[k].paineis) ? db.hubPainel[k].paineis : null;
    // A fila de exceções entra no topo de toda torre salva antes de ela existir.
    const lista = salva && !salva.includes('excecoes') && !db.hubPainel[k].semExcecoes ? ['excecoes'].concat(salva) : (salva || perfilDe(db, k).torre);
    return lista.filter(id => ok.has(id));
  }

  /* Desempenho do mês por pessoa (nome curto, como o sistema grava). */
  function desempenho(db, nome, mes, hoje) {
    const h = hoje || hojeISO(), m = mes || h.slice(0, 7);
    const no = d => String(d || '').slice(0, 7) === m;
    const etapas = (db.opStatusHist || []).filter(x => x && x.por === nome && no(x.em) && x.tipo !== 'correcao').length;
    let coletados = 0, revisados = 0;
    Object.values(db.checklists || {}).forEach(l => (Array.isArray(l) ? l : []).forEach(it => {
      if (!it) return;
      if (it.coletadoPor === nome && (it.coletadoEm ? no(it.coletadoEm) : false)) coletados++;
      if (it.revisadoPor === nome && (it.revisadoEm ? no(it.revisadoEm) : false)) revisados++;
    }));
    const lanc = (db.fin || []).filter(l => l && l.por === nome && no(l.criadoEm || l.data)).length;
    const baixas = (db.fin || []).filter(l => l && l.baixaPor === nome && no(l.liquidadoEm)).length;
    const tarefas = (db.agendaTasks || []).filter(t => t && t.resp === nome);
    const feitas = tarefas.filter(t => t.status === 'feita' && no(t.doneAt)).length;
    const atrasadas = tarefas.filter(t => t.status !== 'feita' && t.prazo && t.prazo < h).length;
    const opsResp = (db.ops || []).filter(o => o && ativa(o) && String(o.resp || '').split(/[\s/,]+/).includes(nome));
    const opsAtrasadas = opsResp.filter(o => prazoInfo(db, o, h).sit === 'atrasado').length;
    return { nome, etapas, coletados, revisados, lanc, baixas, feitas, atrasadas, ops: opsResp.length, opsAtrasadas };
  }
  /** Importações fechadas no mês: operações que entraram em Contrato (ou além) neste mês. */
  function fechadasNoMes(db, mes) {
    const ids = new Set();
    (db.opStatusHist || []).forEach(x => { if (x && String(x.em || '').slice(0, 7) === mes && x.para === 'contrato') ids.add(x.op); });
    (db.ops || []).forEach(o => { if (o && String(o.criadaEm || '').slice(0, 7) === mes && o.status && !['cotacao', 'travada'].includes(o.status)) ids.add(o.id); });
    return [...ids];
  }
  function recadosPara(db, k, hoje) {
    const h = hoje || hojeISO();
    return (db.hubRecados || []).filter(r => r && (r.para === 'todos' || r.para === k) && !(r.feito && r.feito[k]) && (!r.ate || r.ate >= h))
      .sort((a, b) => (b.prio === 'alta') - (a.prio === 'alta') || String(b.em).localeCompare(String(a.em)));
  }


  /* ---------- CRM & Funil ---------- */
  /* Fases do funil B2B de importação. `legado` é o rótulo que o sistema atual
     entende (crmOps.etapa), mantido em sincronia enquanto os dois convivem. */
  const CRM_FASES = [
    { k: 'lead', l: 'Lead', legado: 'Novo contato', prob: 0.10, sla: 1, c: '#5B6B8C', faz: 'Responder em até 24 h e entender o produto' },
    { k: 'qualificacao', l: 'Qualificação', legado: 'Novo contato', prob: 0.20, sla: 2, c: '#0E7C8C', faz: 'Confirmar CNPJ, contribuinte, volume, prazo e destino' },
    { k: 'cotacao', l: 'Estudo / Cotação', legado: 'Cotando', prob: 0.35, sla: 4, c: '#B7791F', faz: 'Preço FOB das fábricas, frete e custo de nacionalização' },
    { k: 'proposta', l: 'Proposta enviada', legado: 'Proposta enviada', prob: 0.50, sla: 3, c: '#0046AD', faz: 'Follow-up com o cliente' },
    { k: 'negociacao', l: 'Negociação', legado: 'Negociação', prob: 0.70, sla: 5, c: '#CE0058', faz: 'Ajustar condições e fechar o contrato' },
    { k: 'ganho', l: 'Ganho', legado: 'Fechado', prob: 1, sla: null, c: '#0F8A5F' },
    { k: 'perdido', l: 'Perdido', legado: 'Perdido', prob: 0, sla: null, c: '#8A94AD' }
  ];
  const CRM_ABERTAS = ['lead', 'qualificacao', 'cotacao', 'proposta', 'negociacao'];
  const CRM_ORIGENS = ['WhatsApp', 'Instagram', 'Indicação', 'Cliente da casa', 'Site', 'Feira / evento', 'Prospecção ativa', 'Outro'];
  const CRM_MOTIVOS_PERDA = ['Preço', 'Prazo de entrega', 'Fechou com concorrente', 'Desistiu da compra', 'Sem retorno do cliente', 'Não qualificado (sem CNPJ / volume)', 'Produto inviável', 'Outro'];
  const CRM_ATIVIDADES = ['WhatsApp', 'Ligação', 'E-mail', 'Reunião', 'Nota'];
  const DE_LEGADO = { 'Novo contato': 'lead', 'Cotando': 'cotacao', 'Proposta enviada': 'proposta', 'Negociação': 'negociacao', 'Fechado': 'ganho', 'Perdido': 'perdido' };
  const faseMeta = k => CRM_FASES.find(f => f.k === k) || CRM_FASES[0];
  /** Fase do negócio: o campo novo `fase`, ou a etapa do sistema atual traduzida. */
  const faseDe = n => (n && CRM_FASES.some(f => f.k === n.fase)) ? n.fase : (DE_LEGADO[n && n.etapa] || 'lead');
  const negocioAberto = n => CRM_ABERTAS.includes(faseDe(n));
  const nomeCliente = c => c ? (c.empresa || c.nome || '') : '';

  /** Último movimento: atividade, mudança de fase ou edição. */
  function ultimoMovimento(n) {
    const ts = [n.faseEm, n.atualizadoEm, n.criadoEm].concat((n.atividades || []).map(a => a && a.em)).filter(Boolean).map(String).sort();
    return ts.length ? ts[ts.length - 1] : '';
  }
  function diasParado(n, hoje) { const u = ultimoMovimento(n); return u ? Math.max(0, diasEntre(soData(u), hoje || hojeISO())) : 0; }
  /** Situação do SLA da fase: ok, atencao (venceu hoje) ou atrasado. */
  function slaNegocio(n, hoje) {
    const f = faseMeta(faseDe(n)); if (!f.sla || !negocioAberto(n)) return { sit: 'ok', dias: 0, sla: null };
    const h = hoje || hojeISO();
    const px = n.proxData || n.prazo;
    if (px && px < h) return { sit: 'atrasado', dias: diasEntre(px, h), sla: f.sla, motivo: 'próxima ação vencida' };
    const d = diasParado(n, h);
    // Com próxima ação marcada para frente, o negócio está agendado, não parado.
    if (px && px > h) return { sit: 'ok', dias: d, sla: f.sla, motivo: '' };
    if (px && px === h) return { sit: 'atencao', dias: d, sla: f.sla, motivo: 'próxima ação é hoje' };
    return { sit: d > f.sla ? 'atrasado' : d === f.sla ? 'atencao' : 'ok', dias: d, sla: f.sla, motivo: d > f.sla ? `parado há ${d} dia(s)` : '' };
  }
  /** Score 0–100 do lead: quanto mais completo e quente, maior. */
  function scoreNegocio(db, n) {
    const c = (db.crm || []).find(x => x && x._id === n.clienteId) || {};
    let s = 0; const motivos = [];
    const soma = (v, m) => { s += v; motivos.push(m); };
    if (String(c.cnpj || '').replace(/\D/g, '').length === 14) soma(15, 'CNPJ');
    if (c.contribuinte === true || c.contribuinte === false) soma(10, 'contribuinte definido');
    if ((+n.valor || 0) >= 300000) soma(20, 'valor alto'); else if ((+n.valor || 0) >= 80000) soma(12, 'valor médio');
    if (['Indicação', 'Cliente da casa'].includes(n.origem)) soma(15, n.origem.toLowerCase());
    if (n.tipoPedido === 'direta') soma(10, 'produto conhecido');
    if (n.prazoCliente) soma(10, 'prazo definido');
    if ((db.ops || []).some(o => o && nomeCliente(c) && String(o.cliente || '').toLowerCase().includes(nomeCliente(c).toLowerCase().slice(0, 12)))) soma(10, 'já importou com a gente');
    const ult = ultimoMovimento(n); if (ult && diasEntre(soData(ult), hojeISO()) <= 3) soma(10, 'contato recente');
    s = Math.min(100, s);
    return { s, nivel: s >= 60 ? 'quente' : s >= 35 ? 'morno' : 'frio', motivos };
  }
  /** Indicadores do funil para o painel do CRM. */
  function indicadoresCrm(db, hoje, dias) {
    const h = hoje || hojeISO(), ini = (() => { const d = new Date(h + 'T12:00:00'); d.setDate(d.getDate() - (dias || 90)); return d.toISOString().slice(0, 10); })();
    const ns = (db.crmOps || []).filter(Boolean);
    const abertos = ns.filter(negocioAberto);
    const pipeline = abertos.reduce((a, n) => a + (+n.valor || 0), 0);
    const previsao = abertos.reduce((a, n) => a + (+n.valor || 0) * faseMeta(faseDe(n)).prob, 0);
    const fechadosPeriodo = ns.filter(n => ['ganho', 'perdido'].includes(faseDe(n)) && soData(n.fechadoEm || n.atualizadoEm) >= ini);
    const ganhos = fechadosPeriodo.filter(n => faseDe(n) === 'ganho');
    const conversao = fechadosPeriodo.length ? ganhos.length / fechadosPeriodo.length : null;
    const ticket = ganhos.length ? ganhos.reduce((a, n) => a + (+n.valor || 0), 0) / ganhos.length : null;
    const ciclos = ganhos.map(n => diasEntre(soData(n.criadoEm), soData(n.fechadoEm || n.atualizadoEm))).filter(x => x != null);
    const ciclo = ciclos.length ? Math.round(ciclos.reduce((a, b) => a + b, 0) / ciclos.length) : null;
    const parados = abertos.filter(n => slaNegocio(n, h).sit === 'atrasado');
    const porOrigem = {}, perdas = {};
    ns.forEach(n => { const o = n.origem || 'Não informado'; porOrigem[o] = porOrigem[o] || { total: 0, ganhos: 0 }; porOrigem[o].total++; if (faseDe(n) === 'ganho') porOrigem[o].ganhos++; });
    fechadosPeriodo.filter(n => faseDe(n) === 'perdido').forEach(n => { const m = n.motivoPerda || 'Não informado'; perdas[m] = (perdas[m] || 0) + 1; });
    return { abertos: abertos.length, pipeline, previsao, conversao, ganhos: ganhos.length, fechados: fechadosPeriodo.length, ticket, ciclo, parados, porOrigem, perdas };
  }
  /** Muda a fase e aplica as automações: registro na linha do tempo, follow-up automático e rótulo legado. */
  function moverNegocio(n, fase, por, agora, extra) {
    const t = agora || new Date().toISOString(), de = faseDe(n), f = faseMeta(fase);
    if (de === fase) return n;
    n.fase = fase; n.etapa = f.legado; n.faseEm = t; n.atualizadoEm = t;
    n.atividades = (n.atividades || []).concat([{ _id: novoId(), tipo: 'Etapa', texto: `${faseMeta(de).l} → ${f.l}${extra && extra.motivo ? ' · ' + extra.motivo : ''}`, por: por || '', em: t, auto: true }]);
    const somaD = d => { const x = new Date(t); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
    if (fase === 'proposta') { n.prox = 'Follow-up da proposta com o cliente'; n.proxData = somaD(2); }
    else if (fase === 'negociacao') { n.prox = 'Retorno sobre as condições negociadas'; n.proxData = somaD(3); }
    else if (fase === 'cotacao') { n.prox = n.tipoPedido === 'estudo' ? 'Pesquisa de fábricas para o estudo' : 'Preço FOB, frete e custo de nacionalização'; n.proxData = somaD(f.sla); }
    else if (fase === 'qualificacao') { n.prox = 'Confirmar CNPJ, contribuinte, volume e prazo'; n.proxData = somaD(f.sla); }
    if (fase === 'ganho' || fase === 'perdido') { n.fechadoEm = t; n.prox = ''; n.proxData = ''; }
    if (fase === 'perdido') n.motivoPerda = (extra && extra.motivo) || n.motivoPerda || '';
    n.prazo = n.proxData || '';
    return n;
  }
  /** Negócio ganho vira operação: mesma numeração, checklist padrão e recebimentos previstos (opcional). */
  function ganharNegocio(db, n, opts) {
    const o = opts || {}, t = o.agora || new Date().toISOString(), hoje = t.slice(0, 10);
    const c = (db.crm || []).find(x => x && x._id === n.clienteId) || {};
    const nums = (db.ops || []).map(x => parseInt(String(x && x.id).replace(/\D/g, ''), 10)).filter(x => isFinite(x));
    const id = o.opId || ('OP' + ((nums.length ? Math.max(...nums) : 0) + 1));
    if ((db.ops || []).some(x => x && x.id === id)) throw new Error('Já existe a operação ' + id);
    const op = { _id: novoId(), id, nome: n.titulo || '', cliente: nomeCliente(c), status: 'contrato', statusEm: t, criadaEm: t, resp: o.resp || n.resp || '', prox: 'Assinar contrato e pagar sinal à fábrica', obs: '', crmNegocioId: n._id, statusPor: o.por || '' };
    db.ops.unshift(op);
    db.opStatusHist.push({ _id: novoId(), op: id, de: '', para: 'contrato', em: t, por: o.por || '', tipo: 'mudanca', origem: 'hub2-crm', motivo: 'Negócio ganho no CRM' });
    if (o.checklist) db.checklists[id] = o.checklist.map(([fase, titulo]) => ({ fase, titulo, status: 'pendente', coletadoPor: '', revisadoPor: '', link: '' }));
    const lancs = [];
    if (o.parcelas && +n.valor > 0) {
      o.parcelas.forEach((p, i) => {
        const v = Math.round((+n.valor) * p.pct) / 100; if (!(v > 0)) return;
        const venc = p.venc || hoje;
        const l = { _id: novoId(), data: venc, vencimento: venc, op: id, tipo: 'Receita', categoria: '', fixo: false, desc: `${p.rot || 'Parcela ' + (i + 1)} — ${nomeCliente(c)}`, valor: v, status: 'Previsto', empresa: o.empresa || 'JeT', liquidadoEm: null, valorPago: null, valorPrevisto: null, comp: '', nf: '', por: o.por || '', criadoEm: t, origem: 'crm' };
        db.fin.unshift(l); lancs.push(l);
      });
    }
    moverNegocio(n, 'ganho', o.por, t);
    n.opId = id;
    return { op, lancs };
  }


  /* ---------- Entrada de pedidos ---------- */
  const PRECO_ESTUDO = { cheio: 5000, promo1: 3000, promo2: 3500 };
  const PALAVRAS_VAZIAS = new Set('de da do das dos para com sem uma um uns umas o a os as e em no na nos nas por preciso precisamos quero gostaria orçamento orcamento cotação cotacao boa noite bom dia tarde olá ola oi tudo bem favor até ate unidades unidade peças pecas pçs pcs un und'.split(' '));
  const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const termos = t => norm(t).split(/[^a-z0-9]+/).filter(w => w.length > 3 && !PALAVRAS_VAZIAS.has(w)).map(w => w.replace(/(oes|aes|ais|eis|s)$/, ''));
  /** Leitura por regras quando a IA não está ligada: quantidade, produto e especificação básicos. */
  function lerPedidoRegras(texto) {
    const t = String(texto || '').replace(/\s+/g, ' ').trim();
    const linhas = String(texto || '').split(/\n/).map(x => x.trim()).filter(Boolean);
    let cliente = '';
    if (linhas.length > 1 && linhas[0].length < 60 && !/\d{2,}/.test(linhas[0])) cliente = linhas[0];
    const q = /(\d{1,3}(?:[.\s]\d{3})+|\d+(?:,\d+)?)\s*(mil\s+)?(unidades|unid|un|pe[çc]as|p[çc]s|kg|toneladas|t|m²|m2|metros|cont[eê]iner(?:es)?|containers?|caixas)?\s+(?:de\s+)?([a-zà-ú][a-zà-ú\s-]{2,40})/i.exec(t);
    let quantidade = null, unidade = '', produto = '';
    if (q) {
      quantidade = parseFloat(q[1].replace(/[.\s]/g, '').replace(',', '.')) * (q[2] ? 1000 : 1);
      unidade = (q[3] || 'un').toLowerCase();
      produto = q[4].split(/\s(?:de até|até|com|de \d|para|,)/i)[0].trim().replace(/\s+(de|do|da|dos|das|com|para|e)$/i, '').trim();
    }
    const espec = (t.match(/(\d+(?:,\d+)?\s*(?:m|mm|cm|kg|v|w|kw|pol|")\b[^.;]*)/i) || [])[1] || '';
    return { cliente, contato: '', telefone: '', produto, quantidade, unidade, especificacao: espec.trim(), ncm: '', prazo: '', destino: '', resumo: t.slice(0, 160), duvidas: [] };
  }
  /** Já importamos algo parecido? Compara o produto com operações e negócios anteriores. */
  function jaOperado(db, produto) {
    const ts = termos(produto); if (!ts.length) return { ops: [], negocios: [] };
    const bate = txt => { const tt = termos(txt); return ts.some(a => tt.some(b => b === a || (a.length > 5 && b.startsWith(a.slice(0, 6))))); };
    return { ops: (db.ops || []).filter(o => o && bate([o.nome, o.obs].join(' '))), negocios: (db.crmOps || []).filter(n => n && W_fase(n) === 'ganho' && bate(n.titulo)) };
  }
  function W_fase(n) { return faseDe(n); }
  /** Tarefas que nascem de um pedido confirmado. */
  function tarefasDoPedido(tipo, produto, hoje, quem) {
    const h = hoje || hojeISO(), q = Object.assign({ docs: 'Ívina', frete: 'Matheus', custo: 'Davi', comercial: 'Samir' }, quem || {});
    const d = n => { const x = new Date(h + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
    if (tipo === 'estudo') return [
      { resp: q.comercial, t: `Enviar proposta do estudo de importação: ${produto}`, prazo: d(1), prio: 'alta' },
      { resp: q.docs, t: `Pré-pesquisa de fábricas para ${produto} (após aceite do estudo)`, prazo: d(5), prio: 'media' }];
    return [
      { resp: q.docs, t: `Pedir preço FOB às fábricas já usadas: ${produto}`, prazo: d(2), prio: 'alta' },
      { resp: q.frete, t: `Cotar frete da origem até Pecém para ${produto}`, prazo: d(2), prio: 'media' },
      { resp: q.custo, t: `Montar custo e margem para aprovação: ${produto}`, prazo: d(4), prio: 'alta' }];
  }


  /* ---------- Documentos (GED) ---------- */
  const DOC_TIPOS = [
    { k: 'proforma', l: 'Proforma / Contrato', re: /proforma|\bpi\b|contrato com|sales contract/i, desde: 'contrato', chk: /proforma|contrato assinado/i },
    { k: 'invoice', l: 'Invoice comercial', re: /invoice|fatura comercial|\bci\b/i, desde: 'preparacao_embarque', chk: /commercial invoice/i },
    { k: 'packing', l: 'Packing list', re: /packing|\bpl\b|romaneio/i, desde: 'preparacao_embarque', chk: /packing list/i },
    { k: 'bl', l: 'BL / CE Mercante', re: /\bbl\b|bill of lading|conhecimento|ce mercante|telex/i, desde: 'embarcado', chk: /\bbl\b/i },
    { k: 'duimp', l: 'DUIMP / extratos', re: /duimp|\bdi\b|extrato|afrmm|desembara/i, desde: 'chegada', chk: /duimp|\bdi\b/i },
    { k: 'cambio', l: 'Câmbio / swift', re: /c[aâ]mbio|swift|remessa|tt copy/i, desde: 'contrato', chk: /c[aâ]mbio/i, restrito: true },
    { k: 'nfe', l: 'NF-e', re: /\bnf\b|nf-e|nota fiscal|danfe|nf de/i, desde: 'logistica', chk: /\bnf\b/i },
    { k: 'seguro', l: 'Seguro', re: /seguro|ap[oó]lice|insurance/i, desde: null, chk: /seguro|ap[oó]lice/i },
    { k: 'origem', l: 'Certificado de origem', re: /certificado de origem|\bco\b|form e/i, desde: null },
    { k: 'fotos', l: 'Fotos e inspeção', re: /foto|inspe[cç]|photo|\.jpe?g|\.png/i, desde: null },
    { k: 'contrato', l: 'Contratos (restrito)', re: /contrato de c[aâ]mbio|contrato com o cliente|aditivo|contrato com o fornecedor/i, desde: null, restrito: true },
    { k: 'outros', l: 'Outros', re: /.^/, desde: null }
  ];
  const docTipoMeta = k => DOC_TIPOS.find(t => t.k === k) || DOC_TIPOS[DOC_TIPOS.length - 1];
  /** Tipo do documento: o campo novo, ou deduzido do grupo/nome do sistema atual. */
  function tipoDoc(d) {
    if (d && DOC_TIPOS.some(t => t.k === d.tipo)) return d.tipo;
    if (d && d.grupo === 'contratos') return /c[aâ]mbio/i.test([d.cat, d.nome].join(' ')) ? 'cambio' : 'contrato';
    const txt = [d && d.cat, d && d.nome].join(' ');
    const t = DOC_TIPOS.find(x => x.k !== 'contrato' && x.k !== 'outros' && x.re.test(txt));
    return t ? t.k : 'outros';
  }
  /** Situação do documento no GED (dupla conferência). */
  function situacaoDoc(d) {
    if (!d) return { k: 'pendente', l: 'pendente', c: '' };
    if (d.substituidoPor) return { k: 'antigo', l: 'versão antiga', c: '' };
    if (d.rejeitado) return { k: 'rejeitado', l: 'rejeitado' + (d.rejeitado.motivo ? ': ' + d.rejeitado.motivo : ''), c: 'crit' };
    const conf = [...new Set((d.conferencias || []).map(x => x && x.por).filter(Boolean))];
    if (conf.length >= 2 || d.status === 'aprovado') return { k: 'ok', l: 'dupla conferência', c: 'ok' };
    if (conf.length === 1 || d.status === 'revisado') return { k: 'meia', l: 'falta 2ª conferência', c: 'warn' };
    if (d.rascunho) return { k: 'draft', l: 'aguardando original', c: 'info' };
    return { k: 'novo', l: 'aguardando conferência', c: 'info' };
  }
  /** Tipos obrigatórios pela etapa em que a operação está, e quais faltam. */
  function completudeDocs(db, o) {
    const idx = FLUXO.indexOf(o.status);
    const exigidos = DOC_TIPOS.filter(t => t.desde && idx >= 0 && FLUXO.indexOf(t.desde) >= 0 && idx >= FLUXO.indexOf(t.desde));
    const tem = new Set((db.docs || []).filter(d => d && d.op === o.id && !d.substituidoPor && !d.removidoEm).map(tipoDoc));
    const faltam = exigidos.filter(t => !tem.has(t.k));
    return { exigidos: exigidos.length, faltam, pct: exigidos.length ? Math.round((exigidos.length - faltam.length) / exigidos.length * 100) : null };
  }
  function proximaVersao(db, op, tipo, nomeBase) {
    const base = String(nomeBase || '').toLowerCase().replace(/_?v\d+(\.\w+)?$/, '').replace(/\.\w+$/, '');
    return 1 + (db.docs || []).filter(d => d && d.op === op && tipoDoc(d) === tipo && String(d.nome || '').toLowerCase().replace(/_?v\d+(\.\w+)?$/, '').replace(/\.\w+$/, '') === base).length;
  }


  /* ---------- Desembolso & Cobrança ---------- */
  /** Parcelas do cliente (receitas) e saídas da operação, com a regra de proteção:
      até cada data, o que o cliente paga (previsto ou recebido) cobre o que sai. */
  function desembolsoOp(db, opId, hoje) {
    const h = hoje || hojeISO();
    const ls = (db.fin || []).filter(l => l && l.op === opId && !transferencia(l));
    const parcelas = ls.filter(ehReceita).sort((a, b) => vencDe(a).localeCompare(vencDe(b)));
    const saidas = ls.filter(l => !ehReceita(l)).sort((a, b) => vencDe(a).localeCompare(vencDe(b)));
    const total = parcelas.reduce((a, l) => a + valorDe(l), 0);
    const recebido = parcelas.filter(realizado).reduce((a, l) => a + valorDe(l), 0);
    const aReceber = total - recebido;
    const bloqueios = [];
    saidas.forEach(sd => {
      const ate = vencDe(sd);
      const entra = parcelas.filter(l => vencDe(l) <= ate).reduce((a, l) => a + valorDe(l), 0);
      const sai = saidas.filter(l => vencDe(l) <= ate).reduce((a, l) => a + valorDe(l), 0);
      if (!realizado(sd) && sai - entra > 0.005) bloqueios.push({ saida: sd, ate, falta: +(sai - entra).toFixed(2) });
    });
    const proxima = parcelas.find(l => !realizado(l)) || null;
    return { parcelas, saidas, total, recebido, aReceber, proxima, bloqueios, protegido: !bloqueios.length };
  }
  /** Todas as cobranças em aberto, com a situação de cada uma. */
  function cobrancas(db, hoje) {
    const h = hoje || hojeISO();
    const bloq = {};
    [...new Set((db.fin || []).filter(l => l && l.op && l.op !== 'WindGate').map(l => l.op))].forEach(op => { bloq[op] = desembolsoOp(db, op, h).bloqueios; });
    return (db.fin || []).filter(l => l && ehReceita(l) && !realizado(l) && !transferencia(l) && l.op && l.op !== 'WindGate')
      .sort((a, b) => vencDe(a).localeCompare(vencDe(b)))
      .map(l => { const v = vencDe(l), d = diasEntre(h, v);
        return { l, sit: d < 0 ? `atrasado ${-d} dia(s)` : d === 0 ? 'pagar hoje' : 'a pagar', nivel: d < 0 ? 'crit' : d === 0 ? 'warn' : 'info', protegido: !(bloq[l.op] || []).length }; });
  }

  /* ---------- Produtividade & ranking ---------- */
  /** Nota de 0 a 100: prazo (30), qualidade (30), resultado da função (20), evolução (10), cultura (10, dada pelo Samir). */
  const PILARES = [['prazo', 'Prazo', 30], ['qualidade', 'Qualidade', 30], ['funcao', 'Função', 20], ['evolucao', 'Evolução', 10], ['cultura', 'Cultura', 10]];
  function mesAnterior(m) { return mesSoma(m, -1); }
  function metricasFuncao(db, nome, perfilId, mes, h) {
    const no = d => String(d || '').slice(0, 7) === mes;
    const r = (a, b) => b ? a / b : null;
    if (perfilId === 'operacoes') {
      const baixas = (db.fin || []).filter(l => l && l.baixaPor === nome && !ehReceita(l) && no(l.liquidadoEm));
      const ops = (db.ops || []).filter(o => o && ativa(o) && String(o.resp || '').split(/[\s/,]+/).includes(nome));
      const revis = Object.values(db.checklists || {}).reduce((a, l) => a + (Array.isArray(l) ? l.filter(it => it && it.revisadoPor === nome && no(it.revisadoEm)).length : 0), 0);
      return [['Pagamentos feitos até o vencimento', baixas.filter(l => soData(l.liquidadoEm) <= vencDe(l)).length, baixas.length],
        ['Operações dentro do prazo da etapa', ops.filter(o => prazoInfo(db, o, h).sit !== 'atrasado').length, ops.length],
        ['Documentos revisados no mês', revis, null]].map(([l, a, b]) => ({ l, a, b, r: b == null ? (a > 0 ? 1 : null) : r(a, b) }));
    }
    if (perfilId === 'frete') {
      const lanc = (db.fin || []).filter(l => l && l.por === nome && no(l.criadoEm));
      const rap = lanc.filter(l => { const ref = l.liquidadoEm || l.data; return ref && diasEntre(soData(ref), soData(l.criadoEm)) <= 1; }).length;
      const tr = (db.ops || []).filter(o => o && ['embarcado', 'container_enviado_porto', 'chegada'].includes(o.status));
      const fretes = (db.fretes || []).filter(f => f && (f.resp === nome) && no(f.data));
      return [['Lançamentos em até 24 h', rap, lanc.length], ['Cargas no mar com tracking ou contêiner', tr.filter(o => o.tracking || (o.containers || []).length).length, tr.length],
        ['Cotações de frete registradas', fretes.length, null]].map(([l, a, b]) => ({ l, a, b, r: b == null ? (a > 0 ? Math.min(1, a / 4) : null) : r(a, b) }));
    }
    if (perfilId === 'documentos') {
      let col = 0, noPrazo = 0;
      Object.values(db.checklists || {}).forEach(l => (Array.isArray(l) ? l : []).forEach(it => { if (it && it.coletadoPor === nome && no(it.coletadoEm)) { col++; if (!it.prazo || it.coletadoEm <= it.prazo) noPrazo++; } }));
      const leads = (db.crmOps || []).filter(n => n && (n.atividades || []).some(a => a && a.por === nome && !a.auto && no(a.em))).length;
      const conf = (db.docs || []).filter(d => d && (d.conferencias || []).some(c => c.por === nome && no(c.em))).length;
      return [['Documentos coletados no prazo', noPrazo, col], ['Clientes/leads com contato registrado', leads, null], ['Documentos conferidos', conf, null]]
        .map(([l, a, b]) => ({ l, a, b, r: b == null ? (a > 0 ? Math.min(1, a / 6) : null) : r(a, b) }));
    }
    return [];
  }
  function notaBase(db, nome, perfilId, mes, h) {
    const no = d => String(d || '').slice(0, 7) === mes;
    // Conta a tarefa concluída no mês e a que venceu no mês sem ser feita; a que ainda não venceu não pesa.
    const tarefas = (db.agendaTasks || []).filter(t => t && t.resp === nome && t.prazo && ((t.status === 'feita' && no(t.doneAt)) || (t.status !== 'feita' && no(t.prazo) && t.prazo < h)));
    const tNoPrazo = tarefas.filter(t => t.status === 'feita' && t.doneAt && t.doneAt <= t.prazo).length;
    const etapas = (db.opStatusHist || []).filter(x => x && x.por === nome && no(x.em) && x.de && x.deEm);
    const eNoPrazo = etapas.filter(x => { const alvo = prazoAlvo(db, x.de); return !alvo || diasEntre(soData(x.deEm), soData(x.em)) <= alvo; }).length;
    const baseP = tarefas.length + etapas.length;
    const prazo = baseP ? 30 * (tNoPrazo + eNoPrazo) / baseP : null;
    const erros = (db.hubErros || []).filter(e => e && e.pessoa === nome && no(e.data));
    const rejeitados = (db.docs || []).filter(d => d && d.rejeitado && (d.por === nome) && no(d.rejeitado.em)).length;
    const qualidade = Math.max(0, 30 - erros.reduce((a, e) => a + Math.abs(+e.pontos || 0), 0) - rejeitados);
    const mf = metricasFuncao(db, nome, perfilId, mes, h).filter(x => x.r != null);
    const funcao = mf.length ? 20 * mf.reduce((a, x) => a + x.r, 0) / mf.length : null;
    return { prazo, qualidade, funcao, erros, tarefas: tarefas.length, etapas: etapas.length };
  }
  function produtividade(db, nome, perfilId, mes, hoje) {
    const h = hoje || hojeISO();
    const b = notaBase(db, nome, perfilId, mes, h), a = notaBase(db, nome, perfilId, mesAnterior(mes), h);
    // Evolução compara só os pilares medidos nos dois meses, senão a falta de dado vira queda.
    const comuns = [['prazo', 30], ['qualidade', 30], ['funcao', 20]].filter(([k]) => a[k] != null && b[k] != null);
    const media = x => { const max = comuns.reduce((p, [, m]) => p + m, 0); return max ? comuns.reduce((p, [k]) => p + x[k], 0) / max : null; };
    const temHistorico = a.tarefas + a.etapas > 0 || a.funcao != null;
    const ma = temHistorico ? media(a) : null, mb = media(b);
    const evolucao = ma == null || mb == null ? 5 : Math.max(0, Math.min(10, 5 + (mb - ma) * 25));
    const cult = ((((db.hubPainel || {})._produtividade || {}).cultura || {})[mes] || {})[nome];
    const cultura = cult == null ? null : Math.max(0, Math.min(10, +cult));
    const partes = { prazo: b.prazo, qualidade: b.qualidade, funcao: b.funcao, evolucao, cultura };
    const max = PILARES.reduce((p, [k, , m]) => p + (partes[k] != null ? m : 0), 0);
    const pts = PILARES.reduce((p, [k]) => p + (partes[k] || 0), 0);
    const total = max ? Math.round(pts / max * 100) : 0;
    const faixa = b.qualidade < 20 ? 'sem faixa' : total >= 85 ? 'ouro' : total >= 75 ? 'prata' : 'sem faixa';
    return { nome, partes, total, faixa, erros: b.erros, funcao: metricasFuncao(db, nome, perfilId, mes, h), anterior: ma == null ? null : Math.round(ma * 100) };
  }


  /* ---------- Fiscal & Contabilidade ---------- */
  const trimestreDe = iso => { const d = String(iso || ''); if (!ehISO(d)) return ''; return d.slice(0, 4) + '-T' + (Math.floor((+d.slice(5, 7) - 1) / 3) + 1); };
  const mesesDoTrimestre = t => { const [a, q] = String(t).split('-T'); const i = (+q - 1) * 3 + 1; return [i, i + 1, i + 2].map(m => a + '-' + String(m).padStart(2, '0')); };
  /** Fechamento do trimestre: o que entrou e o que falta antes de mandar ao contador. */
  function fechamentoTrimestre(db, tri, hoje) {
    const h = hoje || hojeISO(), meses = mesesDoTrimestre(tri), cfg = ((db.hubPainel || {})._fiscal) || {};
    const notas = (db.hubNotas || []).filter(n => n && trimestreDe(n.data) === tri);
    const contas = (cfg.contas || []).filter(c => c && c.ativa !== false);
    const extratos = (db.hubExtratos || []).filter(e => e && meses.includes(e.mes));
    const faltaExtrato = [];
    contas.forEach(c => meses.forEach(m => { if (m < h.slice(0, 7) && !extratos.some(e => e.contaId === c.id && e.mes === m)) faltaExtrato.push({ conta: c, mes: m }); }));
    const pend = notas.filter(n => n.status === 'recebida' || n.status === 'conferir');
    const semArquivo = notas.filter(n => !n.xmlLink && !n.pdfLink && n.origem !== 'sefaz');
    const porTipo = {}; notas.forEach(n => { const k = n.tipo || 'outra'; porTipo[k] = porTipo[k] || { qtd: 0, valor: 0 }; porTipo[k].qtd++; porTipo[k].valor += +n.valor || 0; });
    const entrega = (cfg.entregas || {})[tri] || null;
    return { tri, meses, notas, porTipo, pend, semArquivo, extratos, contas, faltaExtrato, entrega, pronto: !pend.length && !faltaExtrato.length };
  }
  /** Lê um extrato OFX: período, saldo e lançamentos. */
  function lerOFX(txt) {
    const s = String(txt || ''); if (!/<OFX>/i.test(s)) return null;
    const v = (b, t) => { const m = new RegExp('<' + t + '>([^<\\r\\n]*)', 'i').exec(b); return m ? m[1].trim() : ''; };
    const dt = x => x ? x.slice(0, 4) + '-' + x.slice(4, 6) + '-' + x.slice(6, 8) : '';
    const trs = (s.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || []).map(b => ({ data: dt(v(b, 'DTPOSTED')), valor: +String(v(b, 'TRNAMT')).replace(',', '.'), memo: v(b, 'MEMO') || v(b, 'NAME'), id: v(b, 'FITID') }));
    return { banco: v(s, 'ORG') || v(s, 'BANKID'), conta: v(s, 'ACCTID'), inicio: dt(v(s, 'DTSTART')), fim: dt(v(s, 'DTEND')), saldo: +String(v(s, 'BALAMT') || 0).replace(',', '.'), transacoes: trs };
  }
  /** Concilia o extrato com o Financeiro: mesmo valor, data até 3 dias de diferença. */
  function conciliar(db, transacoes, empresa) {
    const usados = new Set();
    return (transacoes || []).map(t => {
      const alvo = (db.fin || []).find(l => l && !usados.has(l._id) && realizado(l) && (!empresa || (l.empresa || 'WindGate') === empresa)
        && Math.abs(valorDe(l) - Math.abs(t.valor)) < 0.01 && (t.valor < 0) === !ehReceita(l)
        && Math.abs(diasEntre(soData(l.liquidadoEm || vencDe(l)), t.data) || 0) <= 3);
      if (alvo) usados.add(alvo._id);
      return Object.assign({}, t, { lancId: alvo ? alvo._id : null });
    });
  }


  const tagXml = (xml, nome) => { const m = new RegExp(`<(?:\\w+:)?${nome}[^>]*>([^<]*)</(?:\\w+:)?${nome}>`, 'i').exec(xml); return m ? m[1].trim() : ''; };
  const blocoXml = (xml, nome) => { const m = new RegExp(`<(?:\\w+:)?${nome}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${nome}>`, 'i').exec(xml); return m ? m[1] : ''; };
  /** Lê o essencial de um XML de NF-e. */
  function lerXmlNFe(xml) {
    const s = String(xml || '');
    const id = (/Id="NFe(\d{44})"/i.exec(s) || [])[1] || (/<chNFe>(\d{44})<\/chNFe>/i.exec(s) || [])[1] || '';
    if (!id && !/<infNFe/i.test(s)) return null;
    const emit = blocoXml(s, 'emit'), dest = blocoXml(s, 'dest'), ide = blocoXml(s, 'ide'), tot = blocoXml(s, 'ICMSTot');
    return { chave: id, numero: tagXml(ide, 'nNF'), serie: tagXml(ide, 'serie'), data: (tagXml(ide, 'dhEmi') || tagXml(ide, 'dEmi')).slice(0, 10),
      emitente: tagXml(emit, 'xNome'), emitenteCnpj: tagXml(emit, 'CNPJ') || tagXml(emit, 'CPF'), destinatario: tagXml(dest, 'xNome'), destCnpj: tagXml(dest, 'CNPJ') || tagXml(dest, 'CPF'),
      valor: +(tagXml(tot, 'vNF') || 0), cfop: tagXml(s, 'CFOP'), natureza: tagXml(ide, 'natOp') };
  }
  const soDigitos = x => String(x || '').replace(/\D/g, '');
  /** Entrada ou saída, e de qual empresa do grupo, pelo CNPJ. */
  function classificarNota(n, cnpjs) {
    const nossos = Object.entries(cnpjs || {}).map(([emp, c]) => [emp, soDigitos(c)]).filter(([, c]) => c);
    const e = nossos.find(([, c]) => c === soDigitos(n.emitenteCnpj)), d = nossos.find(([, c]) => c === soDigitos(n.destCnpj));
    if (e) return { tipo: 'saida', empresa: e[0] };
    if (d) return { tipo: 'entrada', empresa: d[0] };
    return { tipo: 'entrada', empresa: '' };
  }


  /* ---------- Reunião semanal · Gestor do Mês ---------- */
  function semanaDe(iso) {
    const d = new Date((iso || hojeISO()) + 'T12:00:00'), dow = (d.getDay() + 6) % 7;
    const seg = new Date(d); seg.setDate(d.getDate() - dow);
    const f = n => { const x = new Date(seg); x.setDate(seg.getDate() + n); return x.toISOString().slice(0, 10); };
    return { ini: f(0), sexta: f(4), fim: f(6) };
  }
  const ROTACAO_PADRAO = { '2026-09': 'davi', '2026-10': 'davi', '2026-11': 'samir' };
  function gestorDoMes(db, mes) { const g = (((db.hubPainel || {})._reuniao || {}).gestores || {}); return g[mes] || ROTACAO_PADRAO[mes] || ''; }
  /** Tudo que a reunião de sexta precisa, calculado do que foi registrado na semana. Sem números financeiros. */
  function resumoSemana(db, ini, fim, hoje) {
    const h = hoje || hojeISO(), na = d => { const x = soData(d); return x >= ini && x <= fim; };
    const ops = (db.ops || []).filter(o => o && o.id), ativas = ops.filter(ativa);
    const etapas = (db.opStatusHist || []).filter(x => x && na(x.em) && x.para && x.tipo !== 'correcao');
    const ganhos = (db.crmOps || []).filter(n => n && faseDe(n) === 'ganho' && na(n.fechadoEm || n.faseEm));
    const novosNeg = (db.crmOps || []).filter(n => n && na(n.criadoEm));
    const pedidos = (db.hubPedidos || []).filter(p => p && na(p.em));
    const docsOk = (db.docs || []).filter(d => d && (d.conferencias || []).length >= 2 && na(d.conferencias[d.conferencias.length - 1].em));
    const tarefas = (db.agendaTasks || []).filter(Boolean);
    const feitas = tarefas.filter(t => t.status === 'feita' && na(t.doneAt));
    const proxFim = (() => { const d = new Date(fim + 'T12:00:00'); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();
    const abertas = tarefas.filter(t => t.status !== 'feita' && (!t.prazo || t.prazo <= proxFim));
    const atrasadasT = abertas.filter(t => t.prazo && t.prazo < h);
    const atrasadasOps = ativas.filter(o => prazoInfo(db, o, h).sit === 'atrasado');
    const travadas = ativas.filter(o => o.status === 'travada');
    const chegam = ativas.filter(o => { const d = diasEntre(h, o.eta); return d != null && d >= 0 && d <= 14; });
    const parados = (db.crmOps || []).filter(n => n && negocioAberto(n) && slaNegocio(n, h).sit === 'atrasado');
    const porEtapa = STATUS_OP.filter(x => !FINALIZADAS.includes(x.k)).map(x => ({ k: x.k, l: x.l, c: x.c, n: ativas.filter(o => o.status === x.k).length }));
    const pessoas = {};
    const soma = (nome, campo) => { if (!nome) return; const p = pessoas[nome] = pessoas[nome] || { etapas: 0, tarefas: 0, abertas: 0, atrasadas: 0, docs: 0, negocios: 0 }; p[campo]++; };
    etapas.forEach(x => soma(x.por, 'etapas')); feitas.forEach(t => soma(t.resp, 'tarefas')); abertas.forEach(t => soma(t.resp, 'abertas')); atrasadasT.forEach(t => soma(t.resp, 'atrasadas'));
    docsOk.forEach(d => (d.conferencias || []).forEach(c => soma(c.por, 'docs'))); ganhos.forEach(n => soma(n.resp, 'negocios'));
    const preocupacoes = [];
    travadas.forEach(o => preocupacoes.push(`${o.id} travada: ${o.prox || o.obs || 'sem próxima ação'}`));
    atrasadasOps.slice(0, 6).forEach(o => { const p = prazoInfo(db, o, h); preocupacoes.push(`${o.id} em ${stMeta(o.status).l} há ${p.dias} dias (prazo ${p.alvo})`); });
    if (parados.length) preocupacoes.push(`${parados.length} negócio(s) parado(s) no funil além do prazo da fase`);
    if (atrasadasT.length) preocupacoes.push(`${atrasadasT.length} tarefa(s) vencida(s) na agenda`);
    return { ini, fim, etapas, ganhos, novosNeg, pedidos, docsOk, feitas, abertas, atrasadasT, atrasadasOps, travadas, chegam, parados, porEtapa, pessoas, preocupacoes, ativas: ativas.length };
  }

  /** Divergências da conciliação: no banco e não no sistema, e o contrário. */
  function divergencias(db, extrato) {
    if (!extrato || !Array.isArray(extrato.transacoes)) return { semLancamento: [], semBanco: [] };
    const usados = new Set(extrato.transacoes.map(t => t.lancId).filter(Boolean));
    const semLancamento = extrato.transacoes.filter(t => !t.lancId && t.decisao !== 'ignorado');
    const semBanco = (db.fin || []).filter(l => l && realizado(l) && !transferencia(l) && (l.empresa || 'WindGate') === (extrato.empresa || 'WindGate')
      && mesDe(soData(l.liquidadoEm || vencDe(l))) === extrato.mes && !usados.has(l._id));
    return { semLancamento, semBanco };
  }


  /* ---------- Saúde financeira (dashboard) ---------- */
  const mesesAte = (fim, n) => Array.from({ length: n }, (_, i) => mesSoma(fim, i - n + 1));
  function saudeFinanceira(db, hoje, empresa) {
    const h = hoje || hojeISO(), mesAt = h.slice(0, 7), emp = empresa || 'todas';
    const fin = (db.fin || []).filter(l => l && !transferencia(l) && empresaOk(l, emp));
    const meses = mesesAte(mesAt, 12);
    const tl = x => x.prev + x.real;
    const porMes = meses.map(m => { const d = dre(db, m, emp), L = d.linhas; return { mes: m, receita: d.receita, custos: tl(L.custoOps) + tl(L.impostosOps), despesas: tl(L.despesasFixas) + tl(L.impostosGerais), impostos: tl(L.impostosOps) + tl(L.impostosGerais), resultado: d.lucroLiquido, margem: d.receita ? d.lucroBruto / d.receita : null }; });
    const caixa = fin.filter(realizado).reduce((a, l) => a + (ehReceita(l) ? 1 : -1) * valorDe(l), 0);
    const abertasR = fin.filter(l => ehReceita(l) && !realizado(l) && !ehEmprestimo(l));
    const aging = { aVencer: 0, d30: 0, d60: 0, d60mais: 0 };
    abertasR.forEach(l => { const d = diasEntre(vencDe(l), h); const v = valorDe(l); if (d <= 0) aging.aVencer += v; else if (d <= 30) aging.d30 += v; else if (d <= 60) aging.d60 += v; else aging.d60mais += v; });
    const totalReceber = abertasR.reduce((a, l) => a + valorDe(l), 0), vencido = aging.d30 + aging.d60 + aging.d60mais;
    const somaD = n => { const d = new Date(h + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    const pagar = [30, 60, 90].map(n => fin.filter(l => !ehReceita(l) && !realizado(l) && vencDe(l) <= somaD(n)).reduce((a, l) => a + valorDe(l), 0));
    const receber = [30, 60, 90].map(n => abertasR.filter(l => vencDe(l) <= somaD(n)).reduce((a, l) => a + valorDe(l), 0));
    const ult3 = mesesAte(mesSoma(mesAt, -1), 3);
    const fixasMes = ult3.reduce((a, m) => a + fin.filter(l => !ehReceita(l) && (l.fixo || l.recId) && mesDe(vencDe(l)) === m).reduce((x, l) => x + valorDe(l), 0), 0) / 3;
    const opCli = Object.fromEntries((db.ops || []).filter(Boolean).map(o => [o.id, o.cliente || o.id]));
    const rec12 = {}; let tot12 = 0;
    fin.filter(l => ehReceita(l) && daOperacao(l) && meses.includes(mesDe(vencDe(l)))).forEach(l => { const c = opCli[l.op] || l.op; rec12[c] = (rec12[c] || 0) + valorDe(l); tot12 += valorDe(l); });
    const top = Object.entries(rec12).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([cliente, v]) => ({ cliente, v, pct: tot12 ? v / tot12 : 0 }));
    const pagos = fin.filter(l => ehReceita(l) && realizado(l) && l.liquidadoEm && meses.includes(mesDe(l.liquidadoEm)));
    const atrasoMedio = pagos.length ? pagos.reduce((a, l) => a + Math.max(0, diasEntre(vencDe(l), soData(l.liquidadoEm)) || 0), 0) / pagos.length : null;
    const receita12 = porMes.reduce((a, m) => a + m.receita, 0), impostos12 = porMes.reduce((a, m) => a + m.impostos, 0);
    return { caixa, porMes, aging, totalReceber, inadimplencia: totalReceber ? vencido / totalReceber : 0, pagar, receber, fixasMes, folego: fixasMes > 0 ? caixa / fixasMes : null,
      top, concentracaoTop5: top.reduce((a, t) => a + t.pct, 0), atrasoMedio, cargaTributaria: receita12 ? impostos12 / receita12 : null, receita12,
      resultado12: porMes.reduce((a, m) => a + m.resultado, 0), emprestimos: fin.filter(l => ehEmprestimo(l) && !realizado(l)).reduce((a, l) => a + valorDe(l), 0),
      projecao: fluxoSemanal(db, h, 13, emp, true) };
  }

  /* ---------- Desempenho das operações (dashboard) ---------- */
  function desempenhoOperacoes(db, hoje) {
    const h = hoje || hojeISO(), meses = mesesAte(h.slice(0, 7), 12);
    const ops = (db.ops || []).filter(o => o && o.id), hist = (db.opStatusHist || []).filter(x => x && x.op && x.em);
    const novas = meses.map(m => ops.filter(o => String(o.criadaEm || '').slice(0, 7) === m).length);
    const entregues = meses.map(m => new Set(hist.filter(x => x.para === 'entregue' && String(x.em).slice(0, 7) === m).map(x => x.op)).size);
    const etapas = FLUXO.filter(k => !['entregue', 'concluida'].includes(k)).map(k => {
      const durs = hist.filter(x => x.de === k && x.deEm).map(x => diasEntre(soData(x.deEm), soData(x.em))).filter(d => d != null && d >= 0);
      const alvo = prazoAlvo(db, k);
      return { k, l: stMeta(k).l, c: stMeta(k).c, media: durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : null, n: durs.length, alvo, noPrazo: durs.length && alvo ? durs.filter(d => d <= alvo).length / durs.length : null };
    });
    const ativas = ops.filter(ativa);
    const res = resultadoPorOp(db, 'todas').filter(r => r.receita > 0);
    return { meses, novas, entregues, etapas, ativas: ativas.length, noPrazoAgora: ativas.length ? ativas.filter(o => prazoInfo(db, o, h).sit !== 'atrasado').length / ativas.length : null,
      clientes: new Set(ativas.map(o => o.cliente).filter(Boolean)).size, margemMedia: res.length ? res.reduce((a, r) => a + (r.margem || 0), 0) / res.length : null,
      ticketMedio: res.length ? res.reduce((a, r) => a + r.receita, 0) / res.length : null };
  }

  /* ---------- Sourcing: nota do fornecedor ---------- */
  const CHECK_FORNECEDOR = [['fabrica', 'É fábrica (não trading)', 20], ['licenca', 'Licença comercial conferida', 15], ['anos', '3+ anos de mercado', 10], ['auditoria', 'Auditado / verificado na plataforma', 15],
    ['amostra', 'Amostra aprovada', 15], ['inspecao', 'Inspeção na fábrica (Tainan)', 15], ['referencia', 'Já fornecemos dele ou referência confiável', 10]];
  function notaFornecedor(f) { const c = (f && f.checks) || {}; return CHECK_FORNECEDOR.reduce((a, [k, , p]) => a + (c[k] ? p : 0), 0); }

  /* ---------- Formatação ---------- */
  const fmtBRL = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtBRLk = v => { const n = +v || 0; return Math.abs(n) >= 1e6 ? 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi' : Math.abs(n) >= 1e4 ? 'R$ ' + (n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil' : fmtBRL(n); };
  const dataBR = iso => ehISO(iso) ? soData(iso).split('-').reverse().join('/') : '—';

  return {
    COLECOES_SYNC, OBJETOS_SYNC, novoId, idDeterministico, prepararBanco, fotografarIds, registrarRemocoes, aplicarSincronizacao,
    fotografarConteudo, diferencas, absorver,
    semanaDe, gestorDoMes, resumoSemana, divergencias, saudeFinanceira, desempenhoOperacoes, CHECK_FORNECEDOR, notaFornecedor,
    lerXmlNFe, classificarNota, trimestreDe, mesesDoTrimestre, fechamentoTrimestre, lerOFX, conciliar,
    desembolsoOp, cobrancas, PILARES, produtividade, metricasFuncao,
    DOC_TIPOS, docTipoMeta, tipoDoc, situacaoDoc, completudeDocs, proximaVersao,
    PRECO_ESTUDO, lerPedidoRegras, jaOperado, tarefasDoPedido,
    CRM_FASES, CRM_ABERTAS, CRM_ORIGENS, CRM_MOTIVOS_PERDA, CRM_ATIVIDADES, faseMeta, faseDe, negocioAberto, nomeCliente, ultimoMovimento, diasParado, slaNegocio, scoreNegocio, indicadoresCrm, moverNegocio, ganharNegocio,
    PERFIS, PERFIL_PADRAO, perfilDe, pode, PAINEIS, paineisPermitidos, torreDe, desempenho, fechadasNoMes, recadosPara,
    STATUS_OP, FLUXO, FINALIZADAS, PRAZO_STATUS, stMeta, ativa, prazoAlvo, prazoInfo, checklistPct, diasEntre, hojeISO, soData, ehISO,
    ehReceita, realizado, transferencia, vencDe, mesDe, painelMes, contasAbertas, dre, resultadoPorOp, fluxoSemanal,
    novaSerie, realizar, mesSoma, vencDoMes, alertas, fmtBRL, fmtBRLk, dataBR
  };
});
