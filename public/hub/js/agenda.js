/* Hub 2.0 — Agenda & Tarefas e Gestão do Mês.
   Mesmos registros do sistema atual (agendaTasks e gestao): o que se faz aqui
   aparece lá e vice-versa. Regras puras em agenda-regras.js. */
(function () {
  const H = window.HUB, W = H.W, esc = H.esc;
  const eu = () => H.nomeUsuario(H.userKey);
  const tarefas = () => (Array.isArray(H.db.agendaTasks) ? H.db.agendaTasks : (H.db.agendaTasks = []));
  const tarefa = id => tarefas().find(x => x && x._id === id);
  const PRIO_PILL = { alta: 'crit', media: 'warn', baixa: 'info' };
  const pillPrio = p => `<span class="pill ${PRIO_PILL[W.agPrio(p)]}">${esc(W.agPrioRotulo(p))}</span>`;
  const opcoes = (lista, sel) => lista.map(n => `<option ${n === sel ? 'selected' : ''}>${esc(n)}</option>`).join('');

  /* ================= AGENDA & TAREFAS ================= */
  /* Estado da tela, não do banco: cada um abre as próprias linhas sem empurrar
     isso para os outros na sincronização. */
  const filtro = { resp: '', status: 'abertas' };
  const expandidas = new Set();
  /* As que eram novas seguem com a etiqueta até a pessoa sair da Agenda —
     se sumisse no mesmo instante, ela nunca veria QUAIS eram as novas. */
  const novasDaVisita = { tarefas: new Set(), subs: new Set() };
  let focoSub = null;

  H.telas.agenda = function (el) {
    if (H.perfil().externo) { el.innerHTML = '<div class="banner">A Agenda é da equipe interna.</div>'; return; }
    const db = H.db, nome = eu(), rel = W.agRelogio();
    if (!(el.querySelector && el.querySelector('[data-ag-tela]'))) { novasDaVisita.tarefas.clear(); novasDaVisita.subs.clear(); }

    // Avisos antes de marcar como vistas (é o que o sino do sistema atual mostraria).
    const avisos = W.agNotificacoes(tarefas(), nome, rel);
    const vistas = W.agMarcarVistas(tarefas(), nome);
    vistas.tarefas.forEach(id => novasDaVisita.tarefas.add(id)); vistas.subs.forEach(id => novasDaVisita.subs.add(id));
    if (vistas.mudou) H.salvar();

    const all = tarefas().filter(Boolean), c = W.agContagem(all, rel);
    const pessoas = W.agResponsaveis(db, all.map(t => t.resp).concat(...all.map(t => W.agSubs(t).map(s => s.resp))));
    const rows = W.agFiltrar(all, filtro);
    const ST = [['abertas', 'Em aberto'], ['aberta', 'Em progresso'], ['travada', 'Travadas'], ['feita', 'Concluídas'], ['todas', 'Todas']];

    const txtAviso = a => {
      const t = a.tarefa;
      if (a.tipo === 'nova') return `Nova tarefa para você: <b>${esc(t.t)}</b>${t.por ? ` · atribuída por <b>${esc(t.por)}</b>` : ''}${t.prazo ? ' · prazo ' + esc(W.agPrazoTxt(t)) : ''}`;
      if (a.tipo === 'subnova') return `Nova subtarefa para você: <b>${esc(a.sub.t)}</b> · em <b>${esc(t.t)}</b>${a.sub.por ? ` · atribuída por <b>${esc(a.sub.por)}</b>` : ''}`;
      if (a.tipo === 'vencida') return `Tarefa <b>${esc(t.t)}</b> <b style="color:var(--crit)">vencida</b> (${esc(W.agPrazoTxt(t))})`;
      return `Tarefa <b>${esc(t.t)}</b> ${t.hora ? `vence hoje às <b>${esc(t.hora)}</b>` : 'vence hoje'}`;
    };

    const linha = t => {
      const id = esc(t._id || ''), late = W.agVencida(t, rel), su = W.agSitu(t), subs = W.agSubs(t), feitas = subs.filter(s => s.feita).length;
      const nova = t.status !== 'feita' && (!t.vistoEm || novasDaVisita.tarefas.has(t._id)), aberto = expandidas.has(t._id);
      const borda = late ? 'var(--crit)' : t.status === 'travada' ? 'var(--warn)' : 'transparent';
      const origem = [t.opId ? `<span class="mono">${esc(t.opId)}</span>` : '', t.pedidoId ? 'do pedido' : '', t.chatMsgId ? 'do chat' : ''].filter(Boolean).join(' · ');
      return `<tr data-t="${id}" style="box-shadow:inset 3px 0 0 ${borda};${t.status === 'feita' ? 'opacity:.6' : ''}">
        <td><select class="inp" data-situ aria-label="Situação" style="color:${su.c};font-weight:600">${W.AG_SITU.map(x => `<option value="${x.k}" ${x.k === su.k ? 'selected' : ''}>${x.l}</option>`).join('')}</select></td>
        <td><button class="btn sm ghost" data-exp aria-expanded="${aberto}" title="${subs.length ? 'Subtarefas' : 'Adicionar subtarefas'}" style="padding:2px 7px;margin-right:6px">${aberto ? '▾' : '▸'}</button><b style="${t.status === 'feita' ? 'text-decoration:line-through' : ''}">${esc(t.t)}</b>
          ${subs.length ? ` <span class="pill ${feitas === subs.length ? 'ok' : 'info'}">${feitas}/${subs.length}</span>` : ''}${nova ? ' <span class="pill mag">nova</span>' : ''}</td>
        <td>${esc(t.resp || '')}</td>
        <td style="white-space:nowrap">${late ? `<span class="pill crit">${esc(W.agPrazoTxt(t))}</span>` : esc(W.agPrazoTxt(t))}</td>
        <td>${pillPrio(t.prio)}</td>
        <td class="note">${esc(t.obs || '')}${origem ? `${t.obs ? '<br>' : ''}${origem}` : ''}</td>
        <td class="note">${esc(t.por || '')}</td>
        <td style="white-space:nowrap"><button class="btn sm" data-edit>Editar</button> <button class="btn sm ghost" data-del title="Excluir tarefa">Excluir</button></td></tr>`
        + (aberto ? linhaSubs(t, id, subs, pessoas, nome) : '');
    };

    el.innerHTML = `<div data-ag-tela>
      <div class="head"><div><h1>Agenda & Tarefas</h1><p class="sub">Tarefas pontuais da equipe, com responsável, prazo e prioridade. Todos veem, cada um cuida das suas.</p></div>
        <div class="btns"><button class="btn pri" id="agnova">+ Nova tarefa</button></div></div>
      ${avisos.length ? `<div class="box"><div class="box-h"><h2>Para você</h2><span class="note">${avisos.length} aviso(s)</span></div><div class="box-b list">${avisos.map(a => `<div class="row"><span>${txtAviso(a)}</span><span class="pill ${a.tipo === 'vencida' ? 'crit' : a.tipo === 'hoje' ? 'warn' : 'mag'}">${a.tipo === 'vencida' ? 'vencida' : a.tipo === 'hoje' ? 'hoje' : 'nova'}</span></div>`).join('')}</div></div>` : ''}
      <div class="kpis">
        <div class="kpi"><span class="lbl">Em progresso</span><span class="v" style="color:var(--info)">${c.progresso}</span><span class="d">abertas, sem trava</span></div>
        <div class="kpi"><span class="lbl">Travadas</span><span class="v" style="color:var(--crit)">${c.travadas}</span><span class="d">dependem de alguém de fora</span></div>
        <div class="kpi"><span class="lbl">Vencidas</span><span class="v" style="color:var(--crit)">${c.vencidas}</span><span class="d ${c.vencidas ? 'bad' : ''}">passaram do prazo</span></div>
        <div class="kpi"><span class="lbl">Prioridade alta</span><span class="v" style="color:var(--warn)">${c.alta}</span><span class="d">em aberto</span></div>
        <div class="kpi"><span class="lbl">Concluídas</span><span class="v" style="color:var(--ok)">${c.feitas}</span><span class="d">no total</span></div></div>
      <div class="box"><div class="box-h"><h2>Tarefas</h2>
        <div class="btns"><select class="inp" id="agresp" aria-label="Responsável"><option value="">Todos</option>${opcoes(pessoas, filtro.resp)}</select>
          <div class="seg">${ST.map(([k, l]) => `<button data-st="${k}" class="${filtro.status === k ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>
        ${rows.length ? `<div class="tw"><table><thead><tr><th>Situação</th><th>Tarefa</th><th>Responsável</th><th>Prazo</th><th>Prioridade</th><th>Obs</th><th>Criada por</th><th></th></tr></thead><tbody>${rows.map(linha).join('')}</tbody></table></div>`
          : '<p class="empty">Nenhuma tarefa. Clique em <b>+ Nova tarefa</b>.</p>'}</div>
      <div class="banner" style="margin-top:12px"><b>Regra da agenda:</b> compromisso com data (pagar bônus dia 30, reservar restaurante, enviar documento à contabilidade) entra AQUI na hora em que surge, não fica na cabeça nem no WhatsApp. Tarefa vencida fica marcada em vermelho para o responsável. A situação tem três estados: <b>em progresso</b>, <b>travada</b> (depende de alguém de fora e continua cobrando prazo) e <b>concluída</b>. Clique em <b>▸</b> ao lado da tarefa para abrir as subtarefas: os passos dela, cada um com seu responsável, que é avisado igual ao da tarefa.</div>
    </div>`;

    const idDe = b => { const tr = b.closest('[data-t]'); return tr ? tr.getAttribute('data-t') : null; };
    const achar = b => { const t = tarefa(idDe(b)); if (!t) { H.toast('Tarefa não encontrada. Talvez tenha sido apagada.'); H.render(); } return t; };
    el.querySelector('#agnova').onclick = () => modalTarefa(null);
    el.querySelector('#agresp').onchange = e => { filtro.resp = e.target.value; H.render(); };
    el.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { filtro.status = b.dataset.st; H.render(); });
    el.querySelectorAll('[data-exp]').forEach(b => b.onclick = () => { const id = idDe(b); if (expandidas.has(id)) expandidas.delete(id); else expandidas.add(id); H.render(); });
    el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { const t = achar(b); if (t) modalTarefa(t); });
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      const t = achar(b); if (!t) return;
      if (!confirm(`Excluir a tarefa "${t.t}"?`)) return;
      const l = tarefas(), i = l.indexOf(t); if (i >= 0) l.splice(i, 1);
      H.salvar(); H.toast('Tarefa excluída'); H.render();
    });
    el.querySelectorAll('[data-situ]').forEach(s => s.onchange = () => {
      const t = achar(s); if (!t) return;
      const { pendentes } = W.agSituar(t, s.value);
      H.salvar(); H.render();
      if (s.value === 'feita' && pendentes) H.toast(`Tarefa concluída. <b>${pendentes}</b> subtarefa${pendentes > 1 ? 's' : ''} ainda em aberto.`);
      else if (s.value === 'travada') H.toast('Tarefa marcada como <b>travada</b>. Continua cobrando prazo.');
    });

    /* Subtarefas: localizadas pelo _id, nunca pelo índice (a sincronização reordena). */
    const subDe = b => { const t = achar(b); const sid = b.closest('[data-s]') && b.closest('[data-s]').getAttribute('data-s'); const s = t && W.agSubs(t).find(x => x._id === sid); if (t && !s) { H.toast('Subtarefa não encontrada'); H.render(); } return s ? { t, s } : null; };
    el.querySelectorAll('[data-subok]').forEach(c => c.onchange = () => { const r = subDe(c); if (!r) return; W.agSubMarcar(r.s, c.checked, nome); H.salvar(); H.render(); });
    el.querySelectorAll('[data-subresp]').forEach(c => c.onchange = () => {
      const r = subDe(c); if (!r) return;
      if (!W.agSubResp(r.s, c.value, nome)) return;
      H.salvar(); H.render();
      if (c.value !== nome) H.toast(`Subtarefa passada para <b>${esc(c.value)}</b>. Ele(a) será avisado(a).`);
    });
    el.querySelectorAll('[data-subdel]').forEach(b => b.onclick = () => {
      const r = subDe(b); if (!r) return;
      r.t.subs.splice(r.t.subs.indexOf(r.s), 1); H.salvar(); H.render();
    });
    const addSub = b => {
      const t = achar(b); if (!t) return;
      const box = b.closest('[data-subadd]'), inp = box.querySelector('[data-subtxt]'), txt = inp.value.trim();
      if (!txt) { inp.focus(); return; }
      const s = W.agNovaSub(t, txt, box.querySelector('[data-subquem]').value, nome);
      expandidas.add(t._id); focoSub = t._id;
      H.salvar(); H.render();
      if (s.resp !== nome) H.toast(`Subtarefa atribuída a <b>${esc(s.resp)}</b>. Ele(a) será avisado(a).`);
    };
    el.querySelectorAll('[data-subadd] button').forEach(b => b.onclick = () => addSub(b));
    el.querySelectorAll('[data-subtxt]').forEach(i => i.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addSub(i); } });
    // Depois de adicionar, o cursor volta ao campo para seguir digitando a próxima.
    if (focoSub) { const tr = [...el.querySelectorAll('[data-subadd]')].find(x => x.closest('[data-t]').getAttribute('data-t') === focoSub); focoSub = null; if (tr) tr.querySelector('[data-subtxt]').focus(); }
  };

  function linhaSubs(t, id, subs, pessoas, nome) {
    const itens = subs.map(s => {
      const nova = !s.feita && s.resp === nome && (!s.vistoEm || novasDaVisita.subs.has(s._id));
      return `<div class="row" data-s="${esc(s._id || '')}" style="align-items:center">
        <label style="display:flex;gap:8px;align-items:center;flex:1;min-width:0"><input type="checkbox" data-subok ${s.feita ? 'checked' : ''} style="width:auto;margin:0"><span style="${s.feita ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(s.t)}</span></label>
        ${nova ? '<span class="pill mag">nova</span>' : ''}${s.feita && s.feitaPor ? `<span class="note">✓ ${esc(s.feitaPor)}</span>` : ''}
        <select class="inp" data-subresp aria-label="Responsável pela subtarefa">${opcoes(pessoas, s.resp || t.resp)}</select>
        <button class="btn sm ghost" data-subdel title="Excluir subtarefa">✕</button></div>`;
    }).join('');
    return `<tr data-t="${id}"><td></td><td colspan="7" style="background:var(--surface-2)"><div class="list">${itens || '<p class="note">Nenhuma subtarefa ainda.</p>'}</div>
      <div data-subadd style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><input class="inp" data-subtxt placeholder="Nova subtarefa (Enter para adicionar)" style="flex:1;min-width:200px" aria-label="Nova subtarefa">
        <select class="inp" data-subquem aria-label="Quem faz esta subtarefa">${opcoes(pessoas, t.resp || nome)}</select><button class="btn sm">Adicionar</button></div></td></tr>`;
  }

  /* O mesmo modal cria e edita. */
  function modalTarefa(t) {
    const nome = eu(), pessoas = W.agResponsaveis(H.db, [t ? t.resp : nome]), nSubs = t ? W.agSubs(t).length : 0;
    const m = H.modal(t ? 'Editar tarefa' : 'Nova tarefa na agenda', `<div class="fields">
        <div class="f w4" style="grid-column:1/-1"><label class="lbl" for="mt">Tarefa</label><input id="mt" value="${esc(t ? t.t || '' : '')}" placeholder="Ex.: Pagar bônus de Matheus e Davi dia 30"></div>
        <div class="f"><label class="lbl" for="mr">Responsável</label><select id="mr">${opcoes(pessoas, t ? t.resp : nome)}</select></div>
        <div class="f"><label class="lbl" for="mp">Prazo</label><input id="mp" type="date" value="${esc(t ? t.prazo || '' : '')}"></div>
        <div class="f"><label class="lbl" for="mh">Hora (opcional)</label><input id="mh" type="time" value="${esc(t ? t.hora || '' : '')}"></div>
        <div class="f"><label class="lbl" for="mpr">Prioridade</label><select id="mpr">${W.AG_PRIOS.map(([k, l]) => `<option value="${k}" ${k === W.agPrio(t ? t.prio : 'media') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="f w2" style="grid-column:1/-1"><label class="lbl" for="mo">Observação</label><input id="mo" value="${esc(t ? t.obs || '' : '')}"></div></div>
      <p class="note" style="margin-top:8px">${nSubs ? `${nSubs} subtarefa(s): editadas na própria linha, ao abrir a tarefa. ` : ''}Hora só vale com prazo. Tarefa para outra pessoa avisa o responsável.</p>`,
      `<button class="btn" data-x>Cancelar</button><button class="btn blue" id="mok">${t ? 'Salvar alterações' : 'Adicionar'}</button>`);
    m.querySelector('#mok').onclick = () => {
      const v = s => m.querySelector(s).value;
      const campos = { t: v('#mt').trim(), resp: v('#mr'), prazo: v('#mp'), hora: v('#mh'), prio: v('#mpr'), obs: v('#mo').trim() };
      if (!campos.t) { H.toast('Descreva a tarefa'); m.querySelector('#mt').focus(); return; }
      if (t) {
        const atual = tarefa(t._id);
        if (!atual) { H.fecharModal(); H.toast('Tarefa não encontrada. Talvez tenha sido apagada.'); H.render(); return; }
        const { mudouDono } = W.agEditar(atual, campos, nome);
        H.salvar(); H.fecharModal(); H.render();
        H.toast(mudouDono && campos.resp !== nome ? `Tarefa passada para <b>${esc(campos.resp)}</b>. Ele(a) será avisado(a).` : 'Tarefa atualizada');
        return;
      }
      tarefas().unshift(W.agNovaTarefa(campos, nome));
      H.salvar(); H.fecharModal(); H.render();
      H.toast(campos.resp === nome ? 'Tarefa adicionada' : `Tarefa atribuída a <b>${esc(campos.resp)}</b>. Ele(a) será avisado(a).`);
    };
    m.querySelector('#mt').onkeydown = e => { if (e.key === 'Enter') m.querySelector('#mok').click(); };
  }

  /* ================= GESTÃO DO MÊS ================= */
  let mesGM = null;
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  /* Gestor sugerido para um mês ainda sem registro: o mesmo da Reunião semanal. */
  const gestorPadrao = mes => { const k = W.gestorDoMes(H.db, mes); return k ? H.nomeUsuario(k) : 'Samir'; };
  const corPct = p => p >= 80 ? 'var(--ok)' : p >= 40 ? 'var(--warn)' : 'var(--faint)';

  H.telas.gestao = function (el) {
    if (H.perfil().externo) { el.innerHTML = '<div class="banner">A Gestão do Mês é da equipe interna.</div>'; return; }
    const db = H.db; mesGM = mesGM || W.hojeISO().slice(0, 7);
    const mes = mesGM, g = W.gmLer(db, mes, gestorPadrao(mes)), M = W.gmMetricas(db, mes), fin = H.pode('fin.ver');
    const gReuniaoK = W.gestorDoMes(db, mes), gReuniao = gReuniaoK ? H.nomeUsuario(gReuniaoK) : '';
    const pessoas = W.agResponsaveis(db, [g.gestor]);
    const res = M.rec - M.desp;

    el.innerHTML = `
      <div class="head"><div><span class="lbl">${esc(MESES[+mes.slice(5, 7) - 1] || '')} / ${esc(mes.slice(0, 4))}</span><h1>Gestão do Mês</h1><p class="sub">Metas, andamento das operações e números, e a apresentação mensal gerada em um clique.</p></div>
        <div class="btns"><input type="month" id="gmes" class="inp" value="${esc(mes)}" aria-label="Mês"><button class="btn pri" id="gpdf">Gerar apresentação (PDF)</button></div></div>
      <div class="kpis">
        <div class="kpi"><span class="lbl">Operações ativas</span><span class="v">${M.opsAtivas.length}</span><span class="d">em andamento</span></div>
        <div class="kpi"><span class="lbl">Cotações no mês</span><span class="v">${M.qs}</span><span class="d">${M.aprov} aprovada(s)</span></div>
        <div class="kpi"><span class="lbl">Aprovadas</span><span class="v" style="color:var(--ok)">${M.aprov}</span><span class="d">${fin ? esc(W.fmtBRLk(M.valorAprov)) : 'cotações'}</span></div>
        <div class="kpi"><span class="lbl">Fretes cotados</span><span class="v">${M.fretes}</span><span class="d">no mês</span></div>
        <div class="kpi"><span class="lbl">Tarefas concluídas</span><span class="v">${M.agFeitas}</span><span class="d">na agenda</span></div>
        ${fin ? `<div class="kpi"><span class="lbl">Resultado realizado</span><span class="v" style="color:${res >= 0 ? 'var(--ok)' : 'var(--crit)'};font-size:19px">${esc(W.fmtBRL(res))}</span><span class="d">receitas menos despesas pagas</span></div>` : ''}</div>
      <div class="g2">
        <div>
          <div class="box"><div class="box-h"><h2>Andamento das operações (checklist %)</h2></div><div class="box-b list">
            ${M.opsAtivas.map(o => { const p = W.checklistPct(db, o.id) || 0; return `<div class="row" style="align-items:center"><span style="flex:0 0 38%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><b class="mono">${esc(o.id)}</b> · ${esc(o.nome || o.cliente || '')}</span>
              <span style="flex:1;height:7px;border-radius:4px;background:var(--line);overflow:hidden"><i style="display:block;height:100%;width:${p}%;background:${corPct(p)}"></i></span><b style="width:42px;text-align:right;color:${corPct(p)}">${p}%</b>${H.pillStatus(o.status)}</div>`; }).join('') || '<p class="note">Sem operações ativas.</p>'}</div></div>
          <div class="box"><div class="box-h"><h2>Metas do mês</h2><button class="btn sm" id="gmeta">+ meta</button></div><div class="box-b list">
            ${g.metas.map((mt, i) => !mt ? '' : `<div class="row" data-i="${i}" style="align-items:center"><label style="display:flex;gap:8px;align-items:center;flex:1;min-width:0"><input type="checkbox" data-mok ${mt.done ? 'checked' : ''} style="width:auto;margin:0"><b style="${mt.done ? 'opacity:.5;text-decoration:line-through' : ''}">${esc(mt.t)}</b></label>
              ${mt.prio ? pillPrio(mt.prio) : ''}<span class="note">${esc(mt.resp || '')}</span><button class="btn sm ghost" data-mdel title="Excluir meta">✕</button></div>`).join('') || '<p class="empty">Sem metas ainda. O Gestor do Mês cadastra aqui.</p>'}</div></div>
        </div>
        <div>
          <div class="box"><div class="box-h"><h2>Gestor do mês</h2></div><div class="box-b">
            <select id="ggestor" class="inp" aria-label="Gestor do mês" style="width:100%">${opcoes(pessoas, g.gestor)}</select>
            <p class="note" style="margin-top:8px">Rotação de liderança: quem gere o mês conduz a reunião e apresenta o resultado.${gReuniao && gReuniao !== g.gestor ? ` Na Reunião semanal o gestor de ${esc(mes.split('-').reverse().join('/'))} está como <b>${esc(gReuniao)}</b>.` : ''}</p></div></div>
          <div class="box"><div class="box-h"><h2>Leitura do gestor</h2></div><div class="box-b"><div class="fields">
            <div class="f" style="grid-column:1/-1"><label class="lbl" for="gdest">Destaques do mês</label><textarea id="gdest" rows="3" data-campo="destaques" placeholder="Conquistas, fechamentos, elogios de clientes…">${esc(g.destaques || '')}</textarea></div>
            <div class="f" style="grid-column:1/-1"><label class="lbl" for="gdesa">Desafios e pontos de atenção</label><textarea id="gdesa" rows="3" data-campo="desafios" placeholder="O que travou, o que precisa de decisão…">${esc(g.desafios || '')}</textarea></div>
            <div class="f" style="grid-column:1/-1"><label class="lbl" for="gprox">Prioridades do próximo mês</label><textarea id="gprox" rows="3" data-campo="prox" placeholder="Uma por linha">${esc(g.prox || '')}</textarea></div>
          </div><p class="note" style="margin-top:6px">Salvo ao sair do campo.</p></div></div>
        </div>
      </div>`;

    const garantir = () => W.gmGarantir(H.db, mes, gestorPadrao(mes));
    el.querySelector('#gmes').onchange = e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { mesGM = e.target.value; H.render(); } };
    el.querySelector('#gpdf').onclick = () => apresentacao(mes);
    el.querySelector('#ggestor').onchange = e => {
      const nomeG = e.target.value; garantir().gestor = nomeG;
      // Mantém a Reunião semanal com o mesmo gestor, para quem pode escolher lá.
      const k = Object.keys(H.db.users || {}).find(x => H.nomeUsuario(x) === nomeG);
      if (k && H.pode('reuniao.editar')) {
        const r = Object.assign({}, (H.db.hubPainel || {})._reuniao);
        r.gestores = Object.assign({}, r.gestores, { [mes]: k });
        H.db.hubPainel._reuniao = r;
      }
      H.salvar(); H.toast(`Gestor de ${esc(mes.split('-').reverse().join('/'))}: <b>${esc(nomeG)}</b>`); H.render();
    };
    el.querySelectorAll('textarea[data-campo]').forEach(t => t.onchange = () => { garantir()[t.dataset.campo] = t.value; H.salvar(); });
    /* Metas não têm _id no sistema atual: confere o texto antes de mexer, para
       uma sincronização no meio do caminho não marcar a meta errada. */
    const metaDe = b => { const i = +b.closest('[data-i]').getAttribute('data-i'), gg = garantir(), mt = gg.metas[i];
      if (!mt || mt.t !== (g.metas[i] || {}).t) { H.toast('A lista de metas mudou. Confira de novo.'); H.render(); return null; } return { gg, i, mt }; };
    el.querySelectorAll('[data-mok]').forEach(c => c.onchange = () => { const r = metaDe(c); if (!r) return; r.mt.done = c.checked; H.salvar(); H.render(); });
    el.querySelectorAll('[data-mdel]').forEach(b => b.onclick = () => { const r = metaDe(b); if (!r) return; if (!confirm(`Excluir a meta "${r.mt.t}"?`)) return; r.gg.metas.splice(r.i, 1); H.salvar(); H.render(); });
    el.querySelector('#gmeta').onclick = () => {
      const m = H.modal('Nova meta do mês', `<div class="fields"><div class="f" style="grid-column:1/-1"><label class="lbl" for="mmt">Meta</label><input id="mmt" placeholder="Ex.: Embarcar OP19 até 20/08"></div>
        <div class="f w2"><label class="lbl" for="mmr">Responsável</label><select id="mmr">${opcoes(W.agResponsaveis(H.db, ['Equipe']), '')}</select></div>
        <div class="f w2"><label class="lbl" for="mmp">Prioridade</label><select id="mmp">${W.AG_PRIOS.map(([k, l]) => `<option value="${k}" ${k === 'media' ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>`,
        '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="mmok">Adicionar</button>');
      m.querySelector('#mmok').onclick = () => {
        const t = m.querySelector('#mmt').value.trim(); if (!t) { m.querySelector('#mmt').focus(); return; }
        garantir().metas.push(W.gmNovaMeta(t, m.querySelector('#mmr').value, m.querySelector('#mmp').value));
        H.salvar(); H.fecharModal(); H.render(); H.toast('Meta adicionada');
      };
    };
  };

  /* Apresentação do mês: 5 páginas em paisagem (capa, números, operações,
     metas e leitura do gestor), impressa pelo navegador em "Salvar como PDF". */
  function apresentacao(mes) {
    const db = H.db, g = W.gmLer(db, mes, gestorPadrao(mes)), M = W.gmMetricas(db, mes), fin = H.pode('fin.ver');
    const titMes = (MESES[+mes.slice(5, 7) - 1] || '') + ' / ' + mes.slice(0, 4);
    let logo = 'logo.webp'; try { logo = new URL('logo.webp', location.href).href; } catch (e) {}
    const tiles = [['Operações ativas', M.opsAtivas.length, '#CE0058'], ['Cotações no mês', M.qs, '#2563EB'], ['Aprovadas', M.aprov, '#34C77C'], ['Valor aprovado', W.fmtBRL(M.valorAprov), '#34C77C'], ['Fretes cotados', M.fretes, '#F0B429'], ['Tarefas concluídas', M.agFeitas, '#22B8CF']];
    if (fin) tiles.push(['Receita realizada', W.fmtBRL(M.rec), '#34C77C'], ['Despesa realizada', W.fmtBRL(M.desp), '#FF5A6E'], ['Resultado', W.fmtBRL(M.rec - M.desp), M.rec - M.desp >= 0 ? '#34C77C' : '#FF5A6E']);
    let n = 0;
    const pag = (kicker, titulo, corpo) => `<section class="pg"><img class="lg" src="${esc(logo)}" alt="WindGate">${kicker ? `<div class="k">${esc(kicker)}</div><h2>${esc(titulo)}</h2>` : ''}${corpo}<footer><span>WINDGATE · GESTÃO DO MÊS · ${esc(titMes.toUpperCase())}</span><span>${++n}</span></footer></section>`;
    const metas = g.metas.filter(Boolean).length ? g.metas.filter(Boolean) : [{ t: 'Sem metas cadastradas', resp: '', prio: '', done: false }];
    const caixa = (t, txt, c) => `<div class="cx"><div class="cxh" style="background:${c}">${t}</div><div class="cxb">${esc(txt || '—').replace(/\n/g, '<br>')}</div></div>`;
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Gestao_do_Mes_WindGate_${esc(mes)}</title><style>
      @page{size:A4 landscape;margin:0} *{box-sizing:border-box} body{margin:0;font-family:Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .pg{width:297mm;height:210mm;background:#0D1526;color:#fff;position:relative;padding:22mm 14mm 16mm;page-break-after:always;overflow:hidden}
      .lg{position:absolute;top:9mm;left:13mm;height:12mm} .k{color:#E91E63;font-weight:700;letter-spacing:3px;font-size:11px;text-transform:uppercase;margin-top:8mm}
      h2{font-size:28px;margin:6px 0 18px} footer{position:absolute;bottom:8mm;left:13mm;right:13mm;display:flex;justify-content:space-between;color:#5E6E8C;font-size:9px;font-weight:700}
      .capa{text-align:center;padding-top:55mm} .capa h1{font-size:40px;margin:0} .capa .m{color:#E91E63;font-size:26px;font-weight:700;margin-top:8px}
      .capa .gs{display:inline-block;background:#16213A;border-radius:10px;padding:12px 28px;margin-top:22px;font-weight:700} .capa i{display:block;color:#8FA0BC;margin-top:26px}
      .tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:12px} .tile{background:#16213A;border-radius:10px;padding:16px 20px;border-left:5px solid}
      .tile b{display:block;font-size:26px} .tile span{color:#8FA0BC;font-size:10px;letter-spacing:1px;text-transform:uppercase}
      .op{display:flex;align-items:center;gap:14px;margin-bottom:12px;font-size:13px} .op .n{width:34%;font-weight:700} .op .tr{flex:1;height:14px;border-radius:7px;background:#1B2745;overflow:hidden}
      .op .tr i{display:block;height:100%;background:#E91E63} .op .p{width:44px;font-weight:700} .op .s{width:150px;color:#8FA0BC;font-size:11px}
      .mt{display:flex;align-items:center;gap:12px;background:#16213A;border-radius:8px;padding:8px 14px;margin-bottom:8px;font-weight:700} .mt.ok{background:#122B20;color:#34C77C}
      .mt .q{width:11px;height:11px;border:1.5px solid #3E4E6E} .mt.ok .q{background:#34C77C;border-color:#34C77C} .mt .r{margin-left:auto;color:#8FA0BC;font-size:11px;font-weight:400}
      .cxs{display:grid;grid-template-columns:repeat(3,1fr);gap:14px} .cx{background:#16213A;border-radius:12px;overflow:hidden;min-height:110mm} .cxh{padding:8px 12px;font-weight:700;font-size:11px}
      .cxb{padding:12px 14px;color:#D7E0F2;font-size:12.5px;line-height:1.45}
    </style></head><body>
      ${pag('', '', `<div class="capa"><h1>Gestão do Mês</h1><div class="m">${esc(titMes)}</div><div class="gs">Gestor do mês: ${esc(g.gestor || '')}</div><i>Good winds open doors.</i></div>`)}
      ${pag('O mês em números', 'Resultado operacional', `<div class="tiles">${tiles.map(([l, v, c]) => `<div class="tile" style="border-color:${c}"><b style="color:${c};${String(v).length > 9 ? 'font-size:19px' : ''}">${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>`)}
      ${pag('Andamento', 'Operações e % de conclusão documental', M.opsAtivas.slice(0, 10).map(o => { const p = W.checklistPct(db, o.id) || 0; return `<div class="op"><span class="n">${esc(o.id)} · ${esc(String(o.nome || '').slice(0, 30))}</span><span class="tr"><i style="width:${p}%"></i></span><span class="p">${p}%</span><span class="s">${esc(W.stMeta(o.status).l)}</span></div>`; }).join('') || '<p style="color:#8FA0BC">Sem operações ativas.</p>')}
      ${pag('Compromissos', 'Metas do mês', metas.slice(0, 12).map(mt => `<div class="mt ${mt.done ? 'ok' : ''}"><span class="q"></span><span>${esc(String(mt.t || '').slice(0, 70))}</span><span class="r">${esc(mt.resp || '')}${mt.prio ? ' · ' + esc(W.agPrioRotulo(mt.prio)) : ''}</span></div>`).join(''))}
      ${pag('Leitura do gestor', 'Destaques · Desafios · Próximo mês', `<div class="cxs">${caixa('DESTAQUES', g.destaques, '#34C77C')}${caixa('DESAFIOS', g.desafios, '#F0B429')}${caixa('PRIORIDADES PRÓX. MÊS', g.prox, '#E91E63')}</div>`)}
      <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { H.toast('O navegador bloqueou a janela da apresentação. Permita pop-ups para este site e tente de novo.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    H.toast('Apresentação aberta: escolha <b>Salvar como PDF</b> na impressão.');
  }
})();
