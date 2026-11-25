/* =====================================================================
   WindGate Hub 2.0 — tarefas automáticas por etapa da operação (sem tela).

   Gatilhos:
     G1  etapa chega a "Preparando embarque"  → Fechar frete (Matheus, cópia Davi)
         conclui sozinha quando o marco "Frete fechado" é marcado
     G2  marco "Frete fechado"                → Conferir documentação pré-embarque (Ívina, cópia Davi)
     G3  etapa chega a "Em trânsito"          → Revisão geral pós-embarque (Davi)
     G4  hoje ≥ ETA − 30                      → Enviar e revisar documentos com o despachante (Ívina, cópia Davi)

   Regras:
   - No máximo 1 tarefa por (contêiner, gatilho): chave única "G1|<_id da operação>", e o _id da
     tarefa sai dela. Tarefa excluída por alguém não volta.
   - Contêiner compartilhado: a tarefa é da operação-mãe, com as filhas no texto.
   - Etapa que pula: os gatilhos do caminho são disparados, marcados como "gerado retroativamente".
   - O servidor só CRIA registros novos (tarefa, recado, log). O que muda numa tarefa já existente
     (concluir a G1, prazo e suspensão da G4) é reaplicado a cada rodada: se um navegador desatualizado
     desfizer, a rodada seguinte refaz.
   - Escalonamento: o recado de cada nível tem _id fixo; existir o recado = já avisado. Sem spam.
   - Nenhum dado financeiro nas tarefas (Ívina e Matheus não veem o Financeiro).
   - Nada retroativo para operações que já estavam no meio do caminho quando a função entrou no ar:
     elas aparecem numa prévia e só são criadas com a aprovação do Samir ou do Davi.
   - Fuso America/Sao_Paulo; prazos em dias corridos.

   Mesmo formato de módulo do comex.js: roda no navegador (window.WG) e no Node (require).
   ===================================================================== */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(Object.assign({}, require('./regras.js'), require('./agenda-regras.js')));
  else Object.assign(raiz.WG, fabrica(raiz.WG));
})(typeof self !== 'undefined' ? self : this, function (W) {
  /* Prazos e janelas: valores de partida. Samir e Davi editam em hubPainel._tarefasAuto.prazos. */
  const PRAZOS_PADRAO = { G1: 5, G2: 3, G3: 5, G4: 10, antecedenciaEta: 30, diasParaSamir: 3, horaRodada: 7 };
  const ROTULOS_PRAZO = [['G1', 'Fechar frete (dias)'], ['G2', 'Documentação pré-embarque (dias)'], ['G3', 'Revisão pós-embarque (dias)'], ['G4', 'Documentos com o despachante (dias)'],
    ['antecedenciaEta', 'Abrir a tarefa do despachante quantos dias antes do ETA'], ['diasParaSamir', 'Dias de atraso até subir para o Samir'], ['horaRodada', 'Hora da rodada diária (0–23)']];
  const NOMES = { matheus: 'Matheus', ivina: 'Ívina', davi: 'Davi', samir: 'Samir' };
  const GATILHOS = {
    G1: { status: 'preparacao_embarque', resp: 'matheus', copia: ['davi'], nome: 'Fechar frete', titulo: op => `Fechar frete da ${op}` },
    G2: { marco: 'freteFechado', resp: 'ivina', copia: ['davi'], nome: 'Documentação pré-embarque', titulo: op => `Conferir documentação pré-embarque da ${op} (invoice, packing list, draft do BL)` },
    G3: { status: 'embarcado', resp: 'davi', copia: [], nome: 'Revisão pós-embarque', titulo: op => `Revisão geral pós-embarque da ${op}` },
    G4: { eta: true, resp: 'ivina', copia: ['davi'], nome: 'Documentos com o despachante', titulo: op => `Enviar e revisar documentos com o despachante – ${op}` }
  };
  const GESTORES = ['davi', 'samir'];
  const MARCAM_FRETE = ['matheus', 'davi', 'samir'];
  /* Depois da chegada, a tarefa do despachante já não faz sentido para quem ainda não tem. */
  const JA_CHEGOU = ['chegada', 'logistica', 'documentacao', 'entregue', 'concluida'];

  const somaDias = (iso, n) => { const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const hojeSP = agora => (W.agRelogio ? W.agRelogio(agora).data : W.hojeISO());
  const horaSP = agora => +(W.agRelogio ? W.agRelogio(agora).hora : '12:00').slice(0, 2);
  const dataBR = d => (W.dataBR ? W.dataBR(d) : d);
  const maior = (a, b) => (String(a) > String(b) ? a : b);

  /** Prazos valendo: o padrão com o que Samir/Davi editaram. */
  function configTarefas(db) {
    const c = ((db && db.hubPainel) || {})._tarefasAuto || {}, job = ((db && db.hubPainel) || {})._tarefasAutoJob || {}, p = Object.assign({}, PRAZOS_PADRAO);
    Object.keys(PRAZOS_PADRAO).forEach(k => { const v = c.prazos && c.prazos[k]; if (v !== '' && v != null && isFinite(+v)) p[k] = Math.max(0, Math.round(+v)); });
    p.horaRodada = Math.min(23, p.horaRodada);
    return { prazos: p, inicio: job.inicio || '', ultimaRodada: job.ultimaRodada || '' };
  }
  const nomeDe = (db, k) => String((((db && db.users) || {})[k] || {}).nome || NOMES[k] || k).split(' ')[0];
  const chaveDeUsuario = (db, nome) => Object.keys(NOMES).find(k => nomeDe(db, k) === nome) || Object.keys((db && db.users) || {}).find(k => nomeDe(db, k) === nome) || '';

  /** O contêiner da operação: a mãe, quando a operação é filha. */
  function alvoDe(db, o) { return (o && o.maeId && W.maeDe ? W.maeDe(db, o) : null) || o; }
  const filhasDe = (db, alvo) => (W.ehMae && W.ehMae(alvo) && W.filhasDe ? W.filhasDe(db, alvo.id).map(f => f.id) : []);
  const chaveDe = (g, alvo) => g + '|' + (alvo._id || alvo.id);
  const idTarefa = chave => 'auto-' + String(chave).replace(/[^\w.-]/g, '-');
  const tarefaDe = (db, chave) => (db.agendaTasks || []).find(t => t && t.auto && t.auto.chave === chave) || null;
  const removido = (db, id) => !!((db._removidos || {})[id]);
  const aberta = t => t && t.status !== 'feita';
  const ehAuto = t => !!(t && t.auto && t.auto.gatilho);
  /** Frete fechado do contêiner: marcado na mãe ou, por engano, numa filha. */
  function freteDe(db, alvo) {
    if (alvo && alvo.freteFechado && alvo.freteFechado.em) return alvo.freteFechado;
    const f = (db.ops || []).find(o => o && o.maeId === alvo.id && o.freteFechado && o.freteFechado.em);
    return f ? f.freteFechado : null;
  }

  function registrar(db, e) {
    if (!Array.isArray(db.hubTarefasLog)) db.hubTarefasLog = [];
    const id = e._id || ('tlog-' + (e.acao || 'x') + '-' + idTarefa(e.chave || '') + '-' + String(e.em || '').replace(/[^\d]/g, '').slice(0, 14));
    if (db.hubTarefasLog.some(x => x && x._id === id)) return null;
    const reg = Object.assign({ _id: id }, e);
    db.hubTarefasLog.unshift(reg);
    return reg;
  }
  function recado(db, para, texto, id, alvo, agora, tarefaId) {
    if (removido(db, id)) return null;
    if (!Array.isArray(db.hubRecados)) db.hubRecados = [];
    if (db.hubRecados.some(r => r && r._id === id)) return null;
    const r = { _id: id, texto, para, prio: 'alta', por: 'Sistema · Tarefas', em: agora, feito: {}, opId: alvo ? alvo.id : '', tarefaId: tarefaId || '' };
    db.hubRecados.unshift(r);
    return r;
  }

  /**
   * Garante a tarefa do gatilho para o contêiner. Já existe (aberta, concluída ou excluída): não cria outra.
   * ctx: { agora, por, retroativo, motivo, prazo, origemBackfill }
   */
  function garantirTarefa(db, g, alvo, ctx) {
    const c = ctx || {}, agora = c.agora || new Date().toISOString(), hoje = hojeSP(agora), def = GATILHOS[g], cfg = configTarefas(db);
    const chave = chaveDe(g, alvo), ja = tarefaDe(db, chave);
    if (ja) return { tarefa: ja, criada: false };
    const id = idTarefa(chave);
    if (removido(db, id) || excluidaNoLog(db, chave)) return { tarefa: null, criada: false, excluida: true };
    const filhas = filhasDe(db, alvo), prazo = c.prazo || somaDias(hoje, cfg.prazos[g]);
    const titulo = def.titulo(alvo.id) + (filhas.length ? ` · contêiner com ${filhas.join(', ')}` : '');
    const obs = [c.retroativo ? 'Gerado retroativamente: a etapa pulou este passo.' : '', c.origemBackfill ? `Criada pela prévia, aprovada por ${c.por || '—'}.` : ''].filter(Boolean).join(' ');
    const t = { _id: id, id: 't_' + Date.parse(agora) + '_' + g, t: titulo, resp: nomeDe(db, def.resp), prazo, hora: '', prio: 'Alta', status: 'aberta', obs, por: 'Sistema',
      doneAt: null, criadaEm: agora, vistoEm: null, opId: alvo.id, copia: def.copia.map(k => nomeDe(db, k)),
      auto: { chave, gatilho: g, opRef: alvo._id || alvo.id, op: alvo.id, filhas, retroativo: !!c.retroativo, origem: c.origemBackfill ? 'backfill' : 'automatica', disparadoPor: c.por || '', motivo: c.motivo || '' } };
    if (!Array.isArray(db.agendaTasks)) db.agendaTasks = [];
    db.agendaTasks.unshift(t);
    recado(db, def.resp, `Nova tarefa automática: ${titulo}. Prazo ${dataBR(prazo)}.`, id + '-criada', alvo, agora, id);
    registrar(db, { acao: 'criada', gatilho: g, chave, op: alvo.id, tarefa: id, resp: t.resp, prazo, por: c.por || '', em: agora, retroativo: !!c.retroativo, motivo: c.motivo || '', origem: t.auto.origem });
    return { tarefa: t, criada: true };
  }

  /* Até onde a operação já tinha chegado antes desta mudança (etapa "travada" não está no fluxo). */
  function indiceAnterior(db, velha) {
    const i = W.FLUXO.indexOf(velha.status);
    if (i >= 0) return i;
    return (db.opStatusHist || []).filter(h => h && h.op === velha.id).reduce((m, h) => Math.max(m, W.FLUXO.indexOf(h.para)), -1);
  }
  /* A tarefa do despachante: abre em ETA − 30, prazo ETA − 20 (nunca antes de hoje); ETA longe de novo: suspensa. */
  function avaliarG4(db, alvo, agora, podeCriar, por) {
    const eta = W.soData(alvo.eta); if (!W.ehISO(eta)) return null;
    /* ETA com ano errado (antes do contrato, ex.: OP25): não abre a tarefa do despachante; a que já abriu fica suspensa até corrigir. */
    const invalida = W.etaInvalida ? W.etaInvalida(db, alvo, eta) : '';
    if (invalida) {
      const tj = tarefaDe(db, chaveDe('G4', alvo));
      if (tj && aberta(tj) && !tj.auto.suspensa) {
        tj.auto.suspensa = true; tj.auto.prazoSuspenso = tj.prazo; tj.prazo = '';
        registrar(db, { acao: 'suspensa', gatilho: 'G4', chave: tj.auto.chave, op: alvo.id, tarefa: tj._id, por: por || 'sistema', em: agora, motivo: invalida });
        return 'suspensa';
      }
      return null;
    }
    const cfg = configTarefas(db).prazos, hoje = hojeSP(agora), limite = somaDias(eta, -cfg.antecedenciaEta);
    const prazo = maior(somaDias(limite, cfg.G4), hoje), chave = chaveDe('G4', alvo), t = tarefaDe(db, chave);
    if (hoje < limite) {
      if (t && aberta(t) && !t.auto.suspensa) {
        t.auto.suspensa = true; t.auto.prazoSuspenso = t.prazo; t.prazo = '';
        registrar(db, { acao: 'suspensa', gatilho: 'G4', chave, op: alvo.id, tarefa: t._id, por: por || 'sistema', em: agora, motivo: `ETA ${dataBR(eta)}: mais de ${cfg.antecedenciaEta} dias` });
        return 'suspensa';
      }
      return null;
    }
    if (t) {
      if (!aberta(t)) return null;
      if (t.auto.suspensa || t.prazo !== prazo) {
        const era = t.auto.suspensa ? 'suspensa' : t.prazo;
        t.auto.suspensa = false; delete t.auto.prazoSuspenso; t.prazo = prazo; t.auto.eta = eta;
        registrar(db, { acao: era === 'suspensa' ? 'reativada' : 'prazo-recalculado', gatilho: 'G4', chave, op: alvo.id, tarefa: t._id, por: por || 'sistema', em: agora, motivo: `ETA ${dataBR(eta)} · prazo ${dataBR(prazo)}${era !== 'suspensa' && era ? ' (era ' + dataBR(era) + ')' : ''}` });
        return 'recalculada';
      }
      return null;
    }
    if (!podeCriar || JA_CHEGOU.includes(alvo.status)) return null;
    const r = garantirTarefa(db, 'G4', alvo, { agora, por, prazo, motivo: `ETA ${dataBR(eta)}` });
    if (r.tarefa && r.criada) r.tarefa.auto.eta = eta;
    return r.criada ? 'criada' : null;
  }
  /* Reaplica o que é derivado: G1 concluída pelo marco; G4 com prazo e suspensão do ETA de agora. */
  function reconciliar(db, agora) {
    let mudou = 0;
    (db.agendaTasks || []).forEach(t => {
      if (!ehAuto(t) || t.auto.gatilho !== 'G1' || !aberta(t) || t.auto.reabertaEm) return;
      const alvo = (db.ops || []).find(o => o && (o._id || o.id) === t.auto.opRef) || (db.ops || []).find(o => o && o.id === t.auto.op);
      const fr = alvo && freteDe(db, alvo); if (!fr) return;
      t.status = 'feita'; t.doneAt = W.soData(fr.em) || hojeSP(agora); t.feitaPor = 'Sistema'; t.feitaEm = fr.em; t.obsConclusao = `Frete fechado marcado por ${fr.por || '—'}.`;
      registrar(db, { acao: 'concluida', gatilho: 'G1', chave: t.auto.chave, op: t.auto.op, tarefa: t._id, por: fr.por || 'sistema', em: agora, motivo: 'marco Frete fechado' });
      mudou++;
    });
    return mudou;
  }
  /* Sem tarefa automática: operação Entregue/Concluída, ou de estudo/exportação (não tem frete de importação). */
  const FINAIS = ['concluida', 'entregue'];
  const ehEstudoOuExpo = o => !!o && (/^(ESTUDO|EXPO)/i.test(String(o.id || '')) || /estudo|exporta/i.test([o.tipo, o.tipoOp, o.natureza, o.tipoPedido].filter(Boolean).join(' ')));
  const semTarefaAuto = o => !o || FINAIS.includes(o.status) || ehEstudoOuExpo(o);
  const opsAtivas = db => (db.ops || []).filter(o => o && o.id && !semTarefaAuto(o));
  const alvosAtivos = db => { const vistos = new Set(), out = []; opsAtivas(db).forEach(o => { const a = alvoDe(db, o); if (a && !vistos.has(a.id)) { vistos.add(a.id); out.push(a); } }); return out; };

  /**
   * Chamado pelo servidor a cada gravação: compara o banco antes e depois e dispara os gatilhos.
   * Muta `depois`. Devolve o que aconteceu.
   */
  function aoGravar(antes, depois, opcoes) {
    const o = opcoes || {}, agora = o.agora || new Date().toISOString(), out = { criadas: [], g4: [] };
    if (!depois || !Array.isArray(depois.ops)) return out;
    const cfg = configTarefas(depois);
    if (!cfg.inicio) return out;   // a função entra no ar na primeira rodada do servidor
    const velhas = new Map(((antes && antes.ops) || []).filter(x => x && x.id).map(x => [x.id, x]));
    const etaVista = new Set();
    depois.ops.forEach(op => {
      if (!op || !op.id) return;
      const velha = velhas.get(op.id), alvo = alvoDe(depois, op);
      if (semTarefaAuto(op) || semTarefaAuto(alvo)) return;
      if (velha) {
        const iV = indiceAnterior(antes || depois, velha), iN = W.FLUXO.indexOf(op.status);
        if (iN > iV) [['G1', 'preparacao_embarque'], ['G3', 'embarcado']].forEach(([g, st]) => {
          const i = W.FLUXO.indexOf(st);
          if (iV < i && iN >= i) { const r = garantirTarefa(depois, g, alvo, { agora, por: op.statusPor || '', retroativo: iN > i, motivo: `${velha.status || '—'} → ${op.status}` }); if (r.criada) out.criadas.push(r.tarefa); }
        });
        const fV = velha.freteFechado && velha.freteFechado.em, fN = op.freteFechado && op.freteFechado.em;
        if (fN && !fV) { const r = garantirTarefa(depois, 'G2', alvo, { agora, por: op.freteFechado.por || '', motivo: 'Frete fechado' }); if (r.criada) out.criadas.push(r.tarefa); }
      }
      /* ETA: operação nova ou ETA alterado agora. */
      if (!etaVista.has(alvo.id) && (!velha || W.soData(velha.eta) !== W.soData(op.eta)) && W.ehISO(W.soData(alvo.eta))) {
        etaVista.add(alvo.id);
        const r = avaliarG4(depois, alvo, agora, true, op.statusPor || ''); if (r) out.g4.push([alvo.id, r]);
      }
    });
    out.concluidas = reconciliar(depois, agora);
    return out;
  }

  /** Atrasadas e escalonamento: Davi ao vencer; Samir depois de N dias. Um recado por nível. */
  function escalonar(db, agora) {
    const hoje = hojeSP(agora), cfg = configTarefas(db).prazos, out = [];
    (db.agendaTasks || []).filter(t => ehAuto(t) && aberta(t) && !t.auto.suspensa && t.prazo && t.prazo < hoje).forEach(t => {
      const atraso = W.diasEntre(t.prazo, hoje) || 0, alvo = { id: t.auto.op };
      const niveis = [['davi', true], ['samir', atraso > cfg.diasParaSamir]];
      niveis.forEach(([k, vale]) => {
        if (!vale) return;
        const r = recado(db, k, `Tarefa atrasada há ${atraso} dia(s): ${t.t} · responsável ${t.resp} · venceu ${dataBR(t.prazo)}.`, t._id + '-atraso-' + k, alvo, agora, t._id);
        if (r) { registrar(db, { acao: 'escalonada-' + k, gatilho: t.auto.gatilho, chave: t.auto.chave, op: t.auto.op, tarefa: t._id, por: 'sistema', em: agora, motivo: `${atraso} dia(s) de atraso` }); out.push([t._id, k]); }
      });
    });
    return out;
  }

  /**
   * Rodada diária (depois da hora configurada, uma vez por dia em São Paulo). Na primeira vez, marca o
   * início da função: o que já estava no meio do caminho fica para a prévia.
   */
  function rodadaDiaria(db, agora, forcar) {
    const a = agora || new Date().toISOString(), hoje = hojeSP(a), cfg = configTarefas(db);
    db.hubPainel = db.hubPainel || {};
    const job = Object.assign({}, db.hubPainel._tarefasAutoJob || {});
    if (!job.inicio) { job.inicio = hoje; job.em = a; db.hubPainel._tarefasAutoJob = job; return { iniciou: true, inicio: hoje }; }
    if (!forcar && (job.ultimaRodada === hoje || horaSP(a) < cfg.prazos.horaRodada)) {
      /* Limpeza e "Fechar frete" das ativas não esperam a rodada do dia: conferem a cada hora. */
      const limpas = limparTarefasInativas(db, a), fretes = garantirFreteDasAtivas(db, a);
      return limpas.length || fretes.length ? { rodou: true, g4: [], concluidas: 0, escalonadas: [], limpas, fretes } : { rodou: false };
    }
    const g4 = [];
    alvosAtivos(db).forEach(alvo => {
      const eta = W.soData(alvo.eta); if (!W.ehISO(eta)) return;
      const limite = somaDias(eta, -cfg.prazos.antecedenciaEta);
      /* Só cria o que cruzou a janela depois que a função entrou no ar, ou operação criada depois disso. */
      const podeCriar = limite >= job.inicio || W.soData(alvo.criadaEm) >= job.inicio;
      const r = avaliarG4(db, alvo, a, podeCriar, 'sistema'); if (r) g4.push([alvo.id, r]);
    });
    const limpas = limparTarefasInativas(db, a), fretes = garantirFreteDasAtivas(db, a);
    const concluidas = reconciliar(db, a), escalonadas = escalonar(db, a);
    db.hubPainel._tarefasAutoJob = Object.assign(job, { ultimaRodada: hoje, em: a });
    return { rodou: true, g4, concluidas, escalonadas, limpas, fretes };
  }

  /**
   * Tarefas automáticas em aberto de operação Entregue, Concluída ou de estudo/exportação: o Sistema exclui
   * (não têm dado de usuário). Fica no log e em _removidos, para nenhum navegador devolver. Concluídas ficam.
   */
  function limparTarefasInativas(db, agora) {
    const a = agora || new Date().toISOString(), ops = db.ops || [], n = [];
    const opDa = t => ops.find(o => o && (o._id || o.id) === t.auto.opRef) || ops.find(o => o && o.id === t.auto.op);
    (db.agendaTasks || []).filter(t => ehAuto(t) && aberta(t) && !t.feitaPor && !t.auto.reabertaEm).forEach(t => {
      const o = opDa(t); if (!o || !semTarefaAuto(o)) return;
      if (excluirTarefa(db, t, 'Sistema', a)) {
        db._removidos = db._removidos || {}; db._removidos[t._id] = Date.parse(a) || Date.now();
        const log = (db.hubTarefasLog || []).find(x => x && x.acao === 'excluida' && x.tarefa === t._id); if (log) log.motivo = `operação ${o.status === 'entregue' || o.status === 'concluida' ? o.status : 'de estudo/exportação'}: sem tarefa automática`;
        db.hubRecados = (db.hubRecados || []).filter(r => { const tira = r && r.tarefaId === t._id && r.por === 'Sistema · Tarefas'; if (tira) db._removidos[r._id] = Date.parse(a) || Date.now(); return !tira; });
        n.push(t._id);
      }
    });
    return n;
  }
  /** Operação ativa que já estava em Preparando embarque sem frete fechado e sem a tarefa: cria "Fechar frete" (Matheus). */
  function garantirFreteDasAtivas(db, agora) {
    const a = agora || new Date().toISOString(), n = [];
    alvosAtivos(db).filter(o => o.status === 'preparacao_embarque' && !freteDe(db, o)).forEach(o => {
      const r = garantirTarefa(db, 'G1', o, { agora: a, por: 'sistema', motivo: 'já estava em Preparando embarque' });
      if (r.criada) n.push(r.tarefa._id);
    });
    return n;
  }

  /** Prévia para operações já em andamento: o que seria criado. Nada é gravado. */
  function previaBackfill(db, agora) {
    const a = agora || new Date().toISOString(), hoje = hojeSP(a), cfg = configTarefas(db).prazos, out = [];
    const add = (g, alvo, motivo, prazo) => { const chave = chaveDe(g, alvo); if (tarefaDe(db, chave) || removido(db, idTarefa(chave))) return;
      out.push({ chave, gatilho: g, op: alvo.id, filhas: filhasDe(db, alvo), titulo: GATILHOS[g].titulo(alvo.id), resp: nomeDe(db, GATILHOS[g].resp), prazo: prazo || somaDias(hoje, cfg[g]), motivo }); };
    alvosAtivos(db).forEach(alvo => {
      const i = W.FLUXO.indexOf(alvo.status), fr = freteDe(db, alvo);
      if (alvo.status === 'preparacao_embarque' && !fr) add('G1', alvo, 'Preparando embarque, frete ainda não fechado');
      if (fr && i >= 0 && i < W.FLUXO.indexOf('embarcado')) add('G2', alvo, 'Frete fechado, ainda não embarcou');
      if (alvo.status === 'embarcado') add('G3', alvo, 'Em trânsito');
      const eta = W.soData(alvo.eta);
      if (W.ehISO(eta) && !JA_CHEGOU.includes(alvo.status) && hoje >= somaDias(eta, -cfg.antecedenciaEta)) add('G4', alvo, `ETA ${dataBR(eta)}`, maior(somaDias(eta, cfg.G4 - cfg.antecedenciaEta), hoje));
    });
    return out;
  }
  /** Cria o que foi aprovado na prévia. Só Samir e Davi. */
  function aplicarBackfill(db, chaves, por, agora) {
    const a = agora || new Date().toISOString(), quer = new Set(chaves || []), criadas = [];
    previaBackfill(db, a).filter(x => quer.has(x.chave)).forEach(x => {
      const alvo = (db.ops || []).find(o => o && o.id === x.op); if (!alvo) return;
      const r = garantirTarefa(db, x.gatilho, alvo, { agora: a, por, prazo: x.prazo, origemBackfill: true, motivo: 'prévia: ' + x.motivo });
      if (r.criada) { if (x.gatilho === 'G4') r.tarefa.auto.eta = W.soData(alvo.eta); criadas.push(r.tarefa); }
    });
    return criadas;
  }

  /* ---------- Quem pode ---------- */
  const podeGerir = k => GESTORES.includes(k);
  const podeMarcarFrete = k => MARCAM_FRETE.includes(k);
  /** Concluir ou reabrir: o responsável, Davi ou Samir. Tarefa manual segue a regra de sempre (qualquer um). */
  const podeConcluir = (db, k, t) => !ehAuto(t) || podeGerir(k) || nomeDe(db, k) === t.resp;
  /** Reatribuir tarefa automática: só Davi e Samir. */
  const podeReatribuir = (db, k, t) => !ehAuto(t) || podeGerir(k);
  /** Excluir: qualquer usuário, inclusive a automática. Fica no log quem excluiu, e ela não é recriada para a operação. */
  function excluirTarefa(db, t, por, agora) {
    const l = db.agendaTasks || [], i = l.indexOf(t); if (i < 0) return false;
    l.splice(i, 1);
    if (ehAuto(t)) registrar(db, { acao: 'excluida', gatilho: t.auto.gatilho, chave: t.auto.chave, op: t.auto.op, tarefa: t._id, resp: t.resp, por: por || '', em: agora || new Date().toISOString(), motivo: 'excluída na agenda' });
    return true;
  }
  const excluidaNoLog = (db, chave) => (db.hubTarefasLog || []).some(x => x && x.acao === 'excluida' && x.chave === chave);
  /** Conclusão com quem, quando e observação. Reabrir uma G1 impede que o marco a feche de novo. */
  function concluirTarefa(t, quem, agora, obs) {
    t.status = 'feita'; t.doneAt = hojeSP(agora); t.feitaPor = quem || ''; t.feitaEm = agora || new Date().toISOString(); t.obsConclusao = String(obs || '').trim();
    return t;
  }
  function reabrirTarefa(t, quem, agora) {
    t.status = 'aberta'; t.doneAt = null; if (ehAuto(t)) t.auto.reabertaEm = agora || new Date().toISOString(), t.auto.reabertaPor = quem || '';
    return t;
  }
  /** Marca o frete fechado no contêiner (na mãe, quando é filha). */
  function marcarFreteFechado(db, op, dados, quem, agora) {
    const alvo = alvoDe(db, op), d = dados || {};
    const ant = alvo.freteFechado || {}, num = v => (v === '' || v == null ? null : +v);
    alvo.freteFechado = { em: d.em || agora || new Date().toISOString(), por: quem || '', agente: String(d.agente || '').trim(), booking: String(d.booking || '').trim(),
      valor: num(d.valor), valorUSD: 'valorUSD' in d ? num(d.valorUSD) : (ant.valorUSD != null ? ant.valorUSD : null),
      sobretaxas: Array.isArray(d.sobretaxas) ? d.sobretaxas.filter(x => x && SOBRETAXAS.includes(x.tipo)).map(x => ({ tipo: x.tipo, usd: +x.usd || 0 })) : (ant.sobretaxas || []),
      comprovante: 'comprovante' in d ? String(d.comprovante || '').trim().slice(0, 500) : (ant.comprovante || '') };
    /* Mudou o valor ou as sobretaxas: a decisão anterior do ajuste não vale mais (fica no histórico). */
    if (ant.ajuste) { const mudou = ant.valorUSD !== alvo.freteFechado.valorUSD || JSON.stringify(ant.sobretaxas || []) !== JSON.stringify(alvo.freteFechado.sobretaxas);
      if (mudou) alvo.freteFechado.ajustesAnteriores = (ant.ajustesAnteriores || []).concat([ant.ajuste]); else alvo.freteFechado.ajuste = ant.ajuste;
      if (!mudou && ant.ajustesAnteriores) alvo.freteFechado.ajustesAnteriores = ant.ajustesAnteriores; }
    return alvo;
  }

  /* ---------- Frete internacional: variação até 5% absorvida (Parte 2.1) ----------
     Acima de 5% sobre o frete da cotação, ou com GRI / Peak Season / War Risk, o ajuste precisa do comprovante do agente
     e da aprovação do Samir. Nada muda em parcela nenhuma sozinho: a decisão fica registrada no frete fechado. */
  const SOBRETAXAS = ['GRI', 'Peak Season', 'War Risk'], LIMITE_FRETE = 0.05;
  function freteCotadoUSD(db, alvo) {
    const q = W.cotacaoDaOp ? W.cotacaoDaOp(db, alvo) : ((db.quotes || {})[alvo && alvo.quoteId] || null);
    const f = (q && q.fields) || {}, n = v => parseFloat(String(v == null ? '' : v).replace(',', '.')) || 0;
    return { usd: n(f.freteUSD), tx: n(f.txFrete) };
  }
  function variacaoFrete(db, o) {
    const alvo = alvoDe(db, o), fr = alvo && freteDe(db, alvo); if (!fr) return null;
    const cot = freteCotadoUSD(db, alvo); if (!(cot.usd > 0)) return { alvo, fr, semCotacao: true };
    const fechado = fr.valorUSD != null && fr.valorUSD > 0 ? +fr.valorUSD : (fr.valor > 0 && cot.tx > 0 ? Math.round(fr.valor / cot.tx * 100) / 100 : null);
    if (fechado == null) return { alvo, fr, cotado: cot.usd, semValor: true };
    const sob = (fr.sobretaxas || []).filter(x => x && x.usd > 0), totSob = sob.reduce((a, x) => a + x.usd, 0);
    const dif = Math.round((fechado - cot.usd) * 100) / 100, pct = dif / cot.usd, acima = pct > LIMITE_FRETE;
    const precisa = acima || sob.length > 0;
    return { alvo, fr, cotado: cot.usd, fechado, diferenca: dif, pct, sobretaxas: sob, totalSobretaxas: totSob, absorvida: !precisa, precisaAprovacao: precisa,
      ajusteSugeridoUSD: precisa ? Math.round(((acima ? dif : 0) + totSob) * 100) / 100 : 0, decisao: fr.ajuste || null, pendente: precisa && !fr.ajuste, semComprovante: precisa && !fr.comprovante };
  }
  /** Decisão do Samir: 'aprovado' (com valor e comprovante do agente) ou 'absorvido'. */
  function decidirAjusteFrete(db, o, decisao, dados, quem, agora) {
    const v = variacaoFrete(db, o); if (!v || !v.fr || !v.precisaAprovacao) return { ok: false, msg: 'Frete dentro de 5%, sem sobretaxa: nada a aprovar.' };
    if (!['aprovado', 'absorvido'].includes(decisao)) return { ok: false, msg: 'Decisão inválida.' };
    if (decisao === 'aprovado' && !v.fr.comprovante) return { ok: false, msg: 'Anexe ou informe o comprovante do agente antes de aprovar o ajuste.' };
    const d = dados || {};
    v.fr.ajuste = { decisao, valorUSD: decisao === 'aprovado' ? Math.round((+d.valorUSD > 0 ? +d.valorUSD : v.ajusteSugeridoUSD) * 100) / 100 : 0, pct: Math.round(v.pct * 10000) / 10000, cotado: v.cotado, fechado: v.fechado,
      obs: String(d.obs || '').slice(0, 300), por: quem || '', em: agora || new Date().toISOString() };
    return { ok: true, ajuste: v.fr.ajuste };
  }

  /* ---------- DUIMP: canal e avanço automático (Parte 2.3) ----------
     Cada consulta ao Portal Único passa por aqui. Canal novo: verde avisa todos; amarelo, o Samir; vermelho e
     cinza, o Samir e o Davi. Amarelo e vermelho abrem tarefa para a Ívina acompanhar com o despachante.
     Desembaraçada: a operação em Chegada · Desembaraço vai sozinha para Logística nacional, com a data no histórico
     (que é o "Real" dos marcos). Uma vez por DUIMP e canal. */
  function aplicarSituacaoDuimp(db, o, sit, agora) {
    const t = agora || new Date().toISOString(), hoje = hojeSP(t), out = { canal: null, recados: [], tarefa: null, avancou: false };
    if (!o) return out;
    const antes = W.canalDuimp ? W.canalDuimp(o) : null;
    o.duimpSituacao = Object.assign({}, o.duimpSituacao, sit || {}, { atualizadoEm: t });
    const depois = W.canalDuimp ? W.canalDuimp(o) : null; out.canal = depois;
    const num = String(o.duimp || '').toUpperCase().replace(/[^0-9A-Z]/g, '') || o.id;
    if (depois && depois.k && (!antes || antes.k !== depois.k) && !o.maeId) {
      const para = depois.k === 'verde' ? ['todos'] : depois.k === 'amarelo' ? ['samir'] : ['samir', 'davi'];
      const texto = `${o.id}: DUIMP ${o.duimp || ''} no canal ${depois.l.toLowerCase()}${antes && antes.k ? ' (era ' + antes.l.toLowerCase() + ')' : ''}.${depois.acao ? ' Acompanhar com o despachante.' : ''}`;
      para.forEach(p => { const r = recado(db, p, texto, `canal-${num}-${depois.k}-${p}`, o, t); if (r) { r.por = 'Sistema · Portal Único'; out.recados.push(r); } });
      if (['amarelo', 'vermelho'].includes(depois.k)) {
        const chave = `CANAL|${num}|${depois.k}`, id = idTarefa(chave);
        if (!tarefaDe(db, chave) && !removido(db, id)) {
          const tf = { _id: id, id: 't_' + Date.parse(t) + '_CANAL', t: `Acompanhar a DUIMP da ${o.id} no canal ${depois.l.toLowerCase()} com o despachante`, resp: nomeDe(db, 'ivina'), prazo: somaDias(hoje, 1), hora: '', prio: 'Alta', status: 'aberta', obs: '', por: 'Sistema',
            doneAt: null, criadaEm: t, vistoEm: null, opId: o.id, copia: [nomeDe(db, 'davi')], auto: { chave, gatilho: 'CANAL', opRef: o._id || o.id, op: o.id, filhas: filhasDe(db, o), origem: 'automatica', motivo: 'canal ' + depois.l.toLowerCase() } };
          if (!Array.isArray(db.agendaTasks)) db.agendaTasks = [];
          db.agendaTasks.unshift(tf); out.tarefa = tf;
          registrar(db, { acao: 'criada', gatilho: 'CANAL', chave, op: o.id, tarefa: id, resp: tf.resp, prazo: tf.prazo, por: 'Sistema · Portal Único', em: t, motivo: tf.auto.motivo });
        }
      }
    }
    const des = W.soData(o.duimpSituacao.desembaraco || '');
    if (des && o.status === 'chegada') {
      if (!Array.isArray(db.opStatusHist)) db.opStatusHist = [];
      db.opStatusHist.push({ _id: W.novoId(), op: o.id, de: 'chegada', para: 'logistica', em: t, deEm: o.statusEm || '', por: 'Sistema · Portal Único', tipo: 'mudanca', origem: 'portal-unico', motivo: `DUIMP desembaraçada em ${dataBR(des)}`, dataReal: des });
      o.status = 'logistica'; o.statusEm = t; o.statusPor = 'Sistema · Portal Único'; delete o.statusEstimado;
      out.avancou = true;
    }
    return out;
  }
  /** Selo do canal: "Canal verde · desembaraçada 13/11". Sem canal: null. */
  function seloCanal(o) {
    const c = W.canalDuimp ? W.canalDuimp(o) : null; if (!c) return null;
    const s = (o && o.duimpSituacao) || {}, des = W.soData(s.desembaraco || '');
    return { k: c.k, cor: c.c, texto: `Canal ${c.l.toLowerCase()}${des ? ' · desembaraçada ' + dataBR(des).slice(0, 5) : s.situacao ? ' · ' + String(s.situacao).toLowerCase() : ''}` };
  }

  /* ---------- Torre ---------- */
  /** O que vai para a Torre de cada um: atrasadas (Davi; Samir depois de N dias) e "acompanhando" (cópia). */
  function tarefasNaTorre(db, k, hoje) {
    const h = hoje || hojeSP(), cfg = configTarefas(db).prazos, nome = nomeDe(db, k);
    const auto = (db.agendaTasks || []).filter(t => ehAuto(t) && aberta(t) && !t.auto.suspensa);
    const atraso = t => (t.prazo && t.prazo < h ? W.diasEntre(t.prazo, h) || 0 : 0);
    const atrasadas = auto.filter(t => atraso(t) > 0 && (k === 'davi' || (k === 'samir' && atraso(t) > cfg.diasParaSamir)))
      .map(t => ({ tarefa: t, atraso: atraso(t) })).sort((a, b) => b.atraso - a.atraso);
    const acompanhando = auto.filter(t => (t.copia || []).includes(nome) && t.resp !== nome);
    return { atrasadas, acompanhando };
  }

  /* ---------- Linha do tempo da operação ---------- */
  function tarefasDaOp(db, o) {
    const alvo = alvoDe(db, o), ids = new Set([o.id, alvo.id]);
    return (db.agendaTasks || []).filter(t => t && ((t.auto && ids.has(t.auto.op)) || ids.has(t.opId)))
      .sort((a, b) => String(a.criadaEm || '').localeCompare(String(b.criadaEm || '')));
  }

  /* ---------- Ranking ---------- */
  /**
   * Por responsável, no mês: concluídas no prazo, concluídas com atraso, atrasadas em aberto e dias médios
   * de atraso. Quem está só em cópia não conta. origem: 'todas' | 'automatica' | 'manual'.
   */
  function rankingTarefas(db, mes, origem, hoje) {
    const h = hoje || hojeSP(), no = d => String(d || '').slice(0, 7) === mes;
    const ultimoDia = mes + '-' + String(new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).getUTCDate()).padStart(2, '0');
    const ref = h < ultimoDia ? h : ultimoDia;   // atraso de quem segue aberta: até hoje, ou até o fim de um mês já fechado
    const filtro = t => !origem || origem === 'todas' || (origem === 'automatica' ? ehAuto(t) : !ehAuto(t));
    const por = {};
    const de = r => (por[r] = por[r] || { resp: r, noPrazo: 0, comAtraso: 0, atrasadasAbertas: 0, somaAtraso: 0, nAtraso: 0 });
    (db.agendaTasks || []).filter(t => t && t.resp && t.prazo && filtro(t) && !(t.auto && t.auto.suspensa)).forEach(t => {
      if (t.status === 'feita' && no(t.doneAt)) {
        const d = W.soData(t.doneAt), r = de(t.resp);
        if (d <= t.prazo) r.noPrazo++; else { r.comAtraso++; r.somaAtraso += W.diasEntre(t.prazo, d) || 0; r.nAtraso++; }
      } else if (t.status !== 'feita' && no(t.prazo) && t.prazo < ref) {
        /* Atrasada em aberto: conta no mês do prazo. */
        const r = de(t.resp); r.atrasadasAbertas++; r.somaAtraso += W.diasEntre(t.prazo, ref) || 0; r.nAtraso++;
      }
    });
    return Object.values(por).map(r => ({ resp: r.resp, noPrazo: r.noPrazo, comAtraso: r.comAtraso, atrasadasAbertas: r.atrasadasAbertas, diasMediosAtraso: r.nAtraso ? Math.round(r.somaAtraso / r.nAtraso * 10) / 10 : 0 }))
      .sort((a, b) => b.noPrazo - a.noPrazo || a.atrasadasAbertas - b.atrasadasAbertas || a.comAtraso - b.comAtraso || a.resp.localeCompare(b.resp));
  }

  return { PRAZOS_PADRAO, ROTULOS_PRAZO, GATILHOS, GESTORES, MARCAM_FRETE, configTarefas, nomeDeUsuario: nomeDe, chaveDeUsuario, alvoDe, chaveDe, idTarefa, tarefaDe, freteDe, ehAuto,
    garantirTarefa, avaliarG4, reconciliar, aoGravar, semTarefaAuto, limparTarefasInativas, garantirFreteDasAtivas, escalonar, rodadaDiaria, previaBackfill, aplicarBackfill,
    podeGerir, podeMarcarFrete, podeConcluir, podeReatribuir, excluirTarefa, concluirTarefa, reabrirTarefa, aplicarSituacaoDuimp, seloCanal, marcarFreteFechado, SOBRETAXAS, LIMITE_FRETE, freteCotadoUSD, variacaoFrete, decidirAjusteFrete, tarefasNaTorre, tarefasDaOp, rankingTarefas };
});
