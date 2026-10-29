/* =====================================================================
   WindGate Hub 2.0 — regras da Agenda & Tarefas e da Gestão do Mês (sem tela).

   Os registros são EXATAMENTE os do sistema atual (public/index.html):
     agendaTasks[] → {_id,id,t,resp,prazo,hora,prio,status,obs,por,doneAt,
                      criadaEm,vistoEm,subs:[{_id,t,feita,resp,por,criadaEm,
                      vistoEm,feitaPor,feitaEm}]}
     gestao['AAAA-MM'] → {gestor,destaques,desafios,prox,metas:[{t,resp,prio,done}]}
   Toda edição é feita no próprio objeto (Object.assign), para que campo que
   o Hub não conhece (opId, pedidoId, chatMsgId…) continue lá.

   Mesmo formato de módulo do comex.js: roda no navegador (window.WG) e no
   Node (require), para ser testado.
   ===================================================================== */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./regras.js'));
  else Object.assign(raiz.WG, fabrica(raiz.WG));
})(typeof self !== 'undefined' ? self : this, function (W) {

  /* ---------- Relógio ---------- */
  /* Data e hora de Brasília. Comparar a hora marcada com a hora UTC diria que
     uma tarefa das 20h já venceu às 17h. */
  function agRelogio(agora) {
    const d = agora ? new Date(agora) : new Date();
    const p = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d).forEach(x => { p[x.type] = x.value; });
    return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
  }
  const relogioDe = r => (r && typeof r === 'object' && r.data) ? r : agRelogio(r);

  /* ---------- Situação, prioridade e ordem ---------- */
  /* Três situações: em progresso, travada (depende de alguém de fora e
     continua cobrando prazo) e concluída. */
  const AG_SITU = [
    { k: 'aberta', l: 'Em progresso', c: '#0046AD', pill: 'info' },
    { k: 'travada', l: 'Travada', c: '#C2283B', pill: 'crit' },
    { k: 'feita', l: 'Concluída', c: '#0F8A5F', pill: 'ok' }
  ];
  const agSitu = t => AG_SITU.find(x => x.k === (t && t.status)) || AG_SITU[0];

  /* O sistema atual grava "Alta/Média/Baixa"; telas do Hub (reunião, pedidos)
     gravam "alta/media/baixa". As duas formas valem a mesma coisa. */
  const semAcento = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  function agPrio(p) { const n = semAcento(p); return n === 'alta' || n === 'baixa' ? n : 'media'; }
  const AG_PRIOS = [['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']];
  const agPrioRotulo = p => (AG_PRIOS.find(x => x[0] === agPrio(p)) || AG_PRIOS[1])[1];

  /** Chave de ordenação: abertas antes, depois prioridade, prazo e hora. Sem horário fica no fim do dia. */
  function agOrdem(t) {
    const pw = { alta: 0, media: 1, baixa: 2 }[agPrio(t && t.prio)];
    return (t && t.status === 'feita' ? '1' : '0') + pw + ((t && t.prazo) || '9999-99-99') + ((t && t.hora) || '99:99');
  }
  /** Com horário, vence na hora marcada; sem horário, só depois do dia inteiro. */
  function agVencida(t, agora) {
    if (!t || t.status === 'feita' || !t.prazo) return false;
    const r = relogioDe(agora);
    if (t.prazo !== r.data) return t.prazo < r.data;
    return !!t.hora && t.hora < r.hora;
  }
  function agPrazoTxt(t) {
    if (!t || !t.prazo) return '—';
    return String(t.prazo).split('-').reverse().join('/') + (t.hora ? ' · ' + t.hora : '');
  }
  /** Subtarefas vivem dentro da tarefa; tarefa antiga simplesmente não tem o campo. */
  const agSubs = t => Array.isArray(t && t.subs) ? t.subs.filter(Boolean) : [];

  /* ---------- Lista ---------- */
  /** Filtro da tela. Filtrar por pessoa inclui quem só tem uma subtarefa na tarefa. */
  function agFiltrar(tarefas, filtro) {
    const f = filtro || {}, st = f.status || 'abertas';
    let rows = (tarefas || []).filter(Boolean).slice().sort((a, b) => agOrdem(a) < agOrdem(b) ? -1 : agOrdem(a) > agOrdem(b) ? 1 : 0);
    if (f.resp) rows = rows.filter(t => t.resp === f.resp || agSubs(t).some(s => s.resp === f.resp));
    if (st === 'abertas') rows = rows.filter(t => t.status !== 'feita');
    else if (st === 'aberta') rows = rows.filter(t => t.status !== 'feita' && t.status !== 'travada');
    else if (st === 'travada' || st === 'feita') rows = rows.filter(t => t.status === st);
    return rows;
  }
  function agContagem(tarefas, agora) {
    const all = (tarefas || []).filter(Boolean), abertas = all.filter(t => t.status !== 'feita');
    return {
      progresso: abertas.filter(t => t.status !== 'travada').length,
      travadas: abertas.filter(t => t.status === 'travada').length,
      vencidas: abertas.filter(t => agVencida(t, agora)).length,
      alta: abertas.filter(t => agPrio(t.prio) === 'alta').length,
      feitas: all.filter(t => t.status === 'feita').length
    };
  }
  /** Quem pode receber tarefa: a equipe cadastrada (primeiro nome, como o sistema grava), sem acesso externo. */
  function agResponsaveis(db, extra) {
    const nomes = Object.keys((db && db.users) || {}).filter(k => !W.perfilDe(db, k).externo)
      .map(k => String((db.users[k] && db.users[k].nome) || k).split(' ')[0]).filter(Boolean);
    const base = nomes.length ? nomes : ['Samir', 'Davi', 'Ívina', 'Matheus'];
    [].concat(extra || []).forEach(n => { if (n && !base.includes(n)) base.push(n); });
    return base;
  }

  /* ---------- Gravação de tarefas ---------- */
  /** Tarefa nova no formato do sistema atual. Quem atribui para si mesmo já sabe: nasce vista. Hora sem data é descartada. */
  function agNovaTarefa(campos, eu, agoraISO, id) {
    const c = campos || {}, agora = agoraISO || new Date().toISOString(), prazo = c.prazo || '';
    return { _id: id || W.novoId(), id: 't_' + Date.parse(agora), t: String(c.t || '').trim(), resp: c.resp, prazo, hora: prazo ? (c.hora || '') : '',
      prio: agPrioRotulo(c.prio), status: 'aberta', obs: c.obs || '', por: eu, doneAt: null, criadaEm: agora, vistoEm: c.resp === eu ? agora : null };
  }
  /** Edita no lugar. Trocar o dono devolve a tarefa ao estado de "não vista". Mantém a grafia da prioridade se ela não mudou. */
  function agEditar(t, campos, eu, agoraISO) {
    const c = campos || {}, prazo = c.prazo || '', mudouDono = t.resp !== c.resp;
    const prio = agPrio(c.prio) === agPrio(t.prio) && t.prio ? t.prio : agPrioRotulo(c.prio);
    Object.assign(t, { t: String(c.t || '').trim(), resp: c.resp, prazo, hora: prazo ? (c.hora || '') : '', prio, obs: c.obs || '' });
    if (mudouDono) t.vistoEm = c.resp === eu ? (agoraISO || new Date().toISOString()) : null;
    return { mudouDono };
  }
  /** Muda a situação. Concluir não fecha as subtarefas: devolve quantas sobraram para o aviso. */
  function agSituar(t, novo, hoje) {
    const pendentes = agSubs(t).filter(s => !s.feita).length;
    t.status = novo;
    t.doneAt = novo === 'feita' ? (hoje || W.hojeISO()) : null;
    return { pendentes };
  }
  function agNovaSub(t, texto, resp, eu, agoraISO, id) {
    const agora = agoraISO || new Date().toISOString(), quem = resp || t.resp || eu;
    if (!Array.isArray(t.subs)) t.subs = [];
    const s = { _id: id || W.novoId(), t: String(texto || '').trim(), feita: false, resp: quem, por: eu, criadaEm: agora, vistoEm: quem === eu ? agora : null, feitaPor: '', feitaEm: null };
    t.subs.push(s);
    return s;
  }
  /** Trocar o responsável da subtarefa devolve a ela o "nova" para quem recebeu. */
  function agSubResp(s, quem, eu, agoraISO) {
    if (s.resp === quem) return false;
    s.resp = quem;
    s.vistoEm = quem === eu ? (agoraISO || new Date().toISOString()) : null;
    return true;
  }
  function agSubMarcar(s, feita, eu, hoje) {
    s.feita = !!feita;
    s.feitaPor = feita ? (eu || '') : '';
    s.feitaEm = feita ? (hoje || W.hojeISO()) : null;
  }

  /* ---------- Aviso de atribuição ---------- */
  /** O responsável deixa de ser avisado ao abrir a Agenda. Devolve os ids que ERAM novos, para a etiqueta durar a visita. */
  function agMarcarVistas(tarefas, eu, agoraISO) {
    const agora = agoraISO || new Date().toISOString(), out = { tarefas: [], subs: [], mudou: false };
    if (!eu) return out;
    (tarefas || []).forEach(t => {
      if (!t) return;
      if (t.resp === eu && !t.vistoEm) { out.tarefas.push(t._id); t.vistoEm = agora; out.mudou = true; }
      agSubs(t).forEach(s => { if (s.resp === eu && !s.vistoEm) { out.subs.push(s._id); s.vistoEm = agora; out.mudou = true; } });
    });
    return out;
  }
  /** Os avisos da agenda que o sistema atual põe no sino: atribuição nova, subtarefa nova, vencida e vence hoje. */
  function agNotificacoes(tarefas, eu, agora) {
    const r = relogioDe(agora), n = [];
    if (!eu) return n;
    const ts = (tarefas || []).filter(Boolean);
    ts.filter(t => t.status !== 'feita' && t.resp === eu && !t.vistoEm).forEach(t => n.push({ tipo: 'nova', tarefa: t }));
    ts.forEach(t => { if (t.status === 'feita') return; agSubs(t).forEach(s => { if (!s.feita && s.resp === eu && !s.vistoEm) n.push({ tipo: 'subnova', tarefa: t, sub: s }); }); });
    ts.filter(t => t.status !== 'feita' && t.resp === eu && t.vistoEm && t.prazo && t.prazo <= r.data)
      .forEach(t => n.push({ tipo: agVencida(t, r) ? 'vencida' : 'hoje', tarefa: t }));
    return n;
  }

  /* ---------- Gestão do Mês ---------- */
  /** Registro do mês para LER (não cria nada no banco). */
  function gmLer(db, mes, gestorPadrao) {
    const g = db && db.gestao && db.gestao[mes];
    const base = { gestor: gestorPadrao || 'Samir', destaques: '', desafios: '', prox: '', metas: [] };
    if (!g || typeof g !== 'object') return base;
    return Object.assign({}, base, g, { metas: Array.isArray(g.metas) ? g.metas.slice() : [] });
  }
  /** Registro do mês para GRAVAR: cria no formato do sistema atual se faltar e devolve o próprio objeto do banco. */
  function gmGarantir(db, mes, gestorPadrao) {
    if (!db.gestao || typeof db.gestao !== 'object' || Array.isArray(db.gestao)) db.gestao = {};
    if (!db.gestao[mes] || typeof db.gestao[mes] !== 'object') db.gestao[mes] = { gestor: gestorPadrao || 'Samir', destaques: '', desafios: '', prox: '', metas: [] };
    const g = db.gestao[mes];
    if (!Array.isArray(g.metas)) g.metas = [];
    return g;
  }
  const gmNovaMeta = (t, resp, prio) => ({ t: String(t || '').trim(), resp: resp || '', prio: agPrioRotulo(prio), done: false });

  /** Os números do mês, com as mesmas contas da Gestão do Mês do sistema atual. */
  function gmMetricas(db, mes) {
    const [y, m] = String(mes).split('-');
    // Lançamento antigo grava dd/mm/aaaa; o novo, aaaa-mm-dd.
    const noMes = d => {
      if (!d) return false;
      const t = String(d);
      if (/^\d{4}-\d{2}/.test(t)) return t.slice(0, 4) === y && t.slice(5, 7) === m;
      const p = t.split('/');
      return p.length === 3 && p[2] === y && p[1] === m;
    };
    // Igual ao sistema atual: cotação sem data de criação conta em todo mês.
    const mesTs = ts => { const d = new Date(ts); return isNaN(d) ? '' : d.toISOString().slice(0, 7); };
    const qs = (db.qindex || []).filter(q => q && (q.ts ? mesTs(q.ts) === mes : true));
    const aprov = qs.filter(q => q.status === 'ok');
    const finM = (db.fin || []).filter(l => l && noMes(l.data) && l.status === 'Realizado');
    const soma = tipo => finM.filter(l => l.tipo === tipo).reduce((s, l) => s + (+l.valor || 0), 0);
    const rec = soma('Receita'), desp = soma('Despesa');
    return {
      qs: qs.length, aprov: aprov.length, valorAprov: aprov.reduce((s, q) => s + (+q.preco || 0), 0), rec, desp,
      fretes: (db.fretes || []).filter(f => f && noMes(f.data)).length,
      agFeitas: (db.agendaTasks || []).filter(t => t && t.doneAt && String(t.doneAt).slice(0, 7) === mes).length,
      opsAtivas: (db.ops || []).filter(o => o && !['entregue', 'concluida'].includes(o.status))
    };
  }

  return {
    agRelogio, AG_SITU, agSitu, AG_PRIOS, agPrio, agPrioRotulo, agOrdem, agVencida, agPrazoTxt, agSubs, agFiltrar, agContagem, agResponsaveis,
    agNovaTarefa, agEditar, agSituar, agNovaSub, agSubResp, agSubMarcar, agMarcarVistas, agNotificacoes,
    gmLer, gmGarantir, gmNovaMeta, gmMetricas
  };
});
