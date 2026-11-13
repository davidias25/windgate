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
    if (removido(db, id)) return { tarefa: null, criada: false, excluida: true };
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
  const opsAtivas = db => (db.ops || []).filter(o => o && o.id && !['concluida', 'entregue'].includes(o.status));
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
    if (!forcar && (job.ultimaRodada === hoje || horaSP(a) < cfg.prazos.horaRodada)) return { rodou: false };
    const g4 = [];
    alvosAtivos(db).forEach(alvo => {
      const eta = W.soData(alvo.eta); if (!W.ehISO(eta)) return;
      const limite = somaDias(eta, -cfg.prazos.antecedenciaEta);
      /* Só cria o que cruzou a janela depois que a função entrou no ar, ou operação criada depois disso. */
      const podeCriar = limite >= job.inicio || W.soData(alvo.criadaEm) >= job.inicio;
      const r = avaliarG4(db, alvo, a, podeCriar, 'sistema'); if (r) g4.push([alvo.id, r]);
    });
    const concluidas = reconciliar(db, a), escalonadas = escalonar(db, a);
    db.hubPainel._tarefasAutoJob = Object.assign(job, { ultimaRodada: hoje, em: a });
    return { rodou: true, g4, concluidas, escalonadas };
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
    alvo.freteFechado = { em: d.em || agora || new Date().toISOString(), por: quem || '', agente: String(d.agente || '').trim(), booking: String(d.booking || '').trim(),
      valor: d.valor === '' || d.valor == null ? null : +d.valor };
    return alvo;
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
    garantirTarefa, avaliarG4, reconciliar, aoGravar, escalonar, rodadaDiaria, previaBackfill, aplicarBackfill,
    podeGerir, podeMarcarFrete, podeConcluir, podeReatribuir, concluirTarefa, reabrirTarefa, marcarFreteFechado, tarefasNaTorre, tarefasDaOp, rankingTarefas };
});
