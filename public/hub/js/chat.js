/* Hub 2.0 — Chat WindGate: comunicação interna.
   Canais por área, conversa direta, conversa de cada operação (também na ficha),
   avisos com "li e entendi", mensagem urgente que fica no topo até a pessoa ver,
   @menção, e qualquer mensagem vira tarefa na Agenda.
   As mensagens ficam no servidor, fora do banco central (rota /api/chat). */
(function () {
  const H = window.HUB, W = H.W, esc = H.esc;
  const C = H.chat = { canais: [], msgs: new Map(), agora: '', canal: 'geral', carregado: false, tPoll: null, alertados: new Set() };
  const eu = () => H.userKey;
  const nome = k => H.nomeUsuario(k);
  const lista = () => [...C.msgs.values()].sort((a, b) => String(a.em).localeCompare(String(b.em)));
  const naoLidas = canal => lista().filter(m => m.canal === canal && m.de !== eu() && !(m.lidos || {})[eu()] && !m.apagadoEm).length;
  const nomeCanal = id => id.startsWith('dm:') ? nome(id.slice(3).split('|').find(k => k !== eu()) || eu()) : id.startsWith('op:') ? id.slice(3) : '#' + ((C.canais.find(c => c.id === id) || {}).nome || id);

  async function buscar() {
    if (!H.db || !H.userKey) return;
    try {
      const r = await H.api('/api/chat' + (C.agora ? '?desde=' + encodeURIComponent(C.agora) : '')); const j = await r.json();
      if (!j.success) return;
      C.canais = j.canais || C.canais; C.agora = j.agora; C.carregado = true;
      let novas = false; (j.mensagens || []).forEach(m => { const ant = C.msgs.get(m.id); if (!ant || JSON.stringify(ant) !== JSON.stringify(m)) { C.msgs.set(m.id, m); novas = true; } });
      if (novas) { atualizarSelo(); avisarUrgente(); if (H.estado.tela === 'chat' || (H.estado.tela === 'ficha' && document.querySelector('#chatPane'))) redesenharPainel(); }
    } catch (e) { /* sem conexão: tenta na próxima rodada */ }
  }
  H.chatBuscar = buscar;
  function iniciar() { clearInterval(C.tPoll); C.msgs.clear(); C.agora = ''; buscar(); C.tPoll = setInterval(() => buscar(), H.estado.tela === 'chat' ? 4000 : 15000); }
  H.chatIniciar = iniciar;
  setInterval(() => { if (H.db && H.estado.tela === 'chat') buscar(); }, 4000);

  function atualizarSelo() {
    const total = C.canais.map(c => c.id).concat([...new Set(lista().map(m => m.canal).filter(c => c.startsWith('dm:') || c.startsWith('op:')))]).reduce((a, c) => a + naoLidas(c), 0);
    const b = document.querySelector('#menu button[data-t="chat"]'); if (b) b.innerHTML = 'Chat WindGate' + (total ? ` <span class="tag novo">${total}</span>` : '');
  }
  function avisarUrgente() {
    const urg = lista().filter(m => m.urgente && !m.apagadoEm && m.de !== eu() && !(m.lidos || {})[eu()]);
    let bar = document.querySelector('#urgBar');
    if (!urg.length) { if (bar) bar.remove(); return; }
    const m = urg[urg.length - 1];
    if (!bar) { bar = document.createElement('div'); bar.id = 'urgBar'; bar.className = 'urgbar'; const main = document.querySelector('.main'); main.insertBefore(bar, main.children[1]); }
    bar.innerHTML = `<b>URGENTE</b><span>${esc(nome(m.de))} em ${esc(nomeCanal(m.canal))}: ${esc(m.texto.slice(0, 140))}</span><button class="btn sm" id="urgVer">Ver agora</button>${urg.length > 1 ? `<span class="note">+${urg.length - 1}</span>` : ''}`;
    bar.querySelector('#urgVer').onclick = () => { C.canal = m.canal; H.ir('chat'); };
    if (!C.alertados.has(m.id)) { C.alertados.add(m.id); bip(); }
  }
  function bip() { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; g.gain.value = .08; o.connect(g); g.connect(a.destination); o.start(); setTimeout(() => { o.stop(); a.close(); }, 260); } catch (e) {} }

  async function marcarLido(canal) {
    const pend = lista().filter(m => m.canal === canal && !(m.lidos || {})[eu()]);
    if (!pend.length) return;
    const agora = new Date().toISOString(); pend.forEach(m => { m.lidos = Object.assign({}, m.lidos, { [eu()]: agora }); });
    atualizarSelo(); avisarUrgente();
    try { await H.api('/api/chat/lido', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ canal }) }); } catch (e) {}
  }

  /* ---------- Tela ---------- */
  H.telas.chat = function (el) {
    if (!C.carregado) { el.innerHTML = '<p class="empty">Carregando conversas…</p>'; buscar().then(() => { if (H.estado.tela === 'chat') H.render(); }); return; }
    const pessoas = Object.keys(H.db.users || {}).filter(k => k !== eu() && W.perfilDe(H.db, k).id !== 'contador' || (k !== eu() && H.perfil().id === 'contador' && W.perfilDe(H.db, k).caps.includes('fiscal.editar')));
    const opsComMsg = [...new Set(lista().filter(m => m.canal.startsWith('op:')).map(m => m.canal))];
    if (!C.canais.some(c => c.id === C.canal) && !C.canal.startsWith('dm:') && !C.canal.startsWith('op:')) C.canal = (C.canais[0] || {}).id || 'geral';
    const item = (id, rot, sub) => { const n = naoLidas(id); return `<button class="chat-c ${C.canal === id ? 'on' : ''}" data-c="${esc(id)}"><span>${rot}</span>${n ? `<em>${n}</em>` : sub ? `<small>${sub}</small>` : ''}</button>`; };
    el.innerHTML = `<div class="chat">
      <aside class="box chat-l">
        <div class="chat-g">Canais ${H.pode('chat.aviso') ? '<button class="btn ghost sm" id="novoCanal" title="Criar canal">+</button>' : ''}</div>
        ${C.canais.map(c => item(c.id, '# ' + esc(c.nome))).join('')}
        <div class="chat-g">Conversas diretas</div>
        ${pessoas.map(k => item('dm:' + [eu(), k].sort().join('|'), `<span class="av mini" style="background:${esc((H.db.users[k] || {}).cor || 'var(--blue)')}">${esc(nome(k)[0] || '?')}</span> ${esc(nome(k))}`)).join('')}
        ${H.perfil().id !== 'contador' ? `<div class="chat-g">Operações</div>${opsComMsg.map(c => item(c, esc(c.slice(3)), esc(((H.db.ops.find(o => o.id === c.slice(3)) || {}).cliente || '').slice(0, 18)))).join('') || '<p class="note" style="padding:4px 10px">A conversa de cada operação fica também na ficha dela.</p>'}` : ''}
      </aside>
      <section class="box chat-r" id="chatPane"></section></div>`;
    el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { C.canal = b.dataset.c; H.render(); });
    const nc = el.querySelector('#novoCanal'); if (nc) nc.onclick = novoCanal;
    painel(el.querySelector('#chatPane'), C.canal);
  };

  function redesenharPainel() {
    const p = document.querySelector('#chatPane'); if (!p) return;
    const ativo = document.activeElement && document.activeElement.id === 'chatTxt';
    const rascunho = (document.querySelector('#chatTxt') || {}).value || '';
    if (H.estado.tela === 'chat') { const lst = document.querySelector('.chat-l'); if (lst) { H.render(); } }
    else painel(p, p.dataset.canal);
    const t = document.querySelector('#chatTxt'); if (t) { t.value = rascunho; if (ativo) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }
  }

  /** Painel de uma conversa (usado na tela do chat e na ficha da operação). */
  function painel(box, canal) {
    box.dataset.canal = canal;
    const ms = lista().filter(m => m.canal === canal);
    const avisosPend = ms.filter(m => m.aviso && !m.apagadoEm && !(m.confirmacoes || {})[eu()] && m.de !== eu());
    const info = C.canais.find(c => c.id === canal);
    const todos = Object.keys(H.db.users || {}).filter(k => W.perfilDe(H.db, k).id !== 'contador');
    let dia = '';
    box.innerHTML = `<div class="box-h"><div><h2>${esc(nomeCanal(canal))}</h2><small class="note">${info ? esc(info.desc || '') : canal.startsWith('op:') ? 'Conversa da operação: fica registrada junto com ela' : 'Conversa direta'}</small></div></div>
      ${avisosPend.map(m => `<div class="chat-aviso"><div><b>Aviso de ${esc(nome(m.de))}</b><p>${fmt(m.texto)}</p></div><button class="btn sm pri" data-ok="${esc(m.id)}">Li e entendi</button></div>`).join('')}
      <div class="chat-ms" id="chatMs">${ms.map(m => { const d = W.soData(m.em), sep = d !== dia ? `<div class="chat-dia"><span>${W.dataBR(d)}</span></div>` : ''; dia = d;
        const resp = m.respostaA && C.msgs.get(m.respostaA);
        const vistos = Object.keys(m.lidos || {}).filter(k => k !== m.de).length, conf = Object.keys(m.confirmacoes || {});
        return sep + `<div class="cm ${m.de === eu() ? 'meu' : ''} ${m.urgente ? 'urg' : ''} ${m.aviso ? 'aviso' : ''}" data-m="${esc(m.id)}"><span class="av mini" style="background:${esc((H.db.users[m.de] || {}).cor || 'var(--blue)')}">${esc((nome(m.de) || '?')[0])}</span>
          <div class="cm-b"><div class="cm-h"><b>${esc(nome(m.de))}</b><span class="note">${new Date(m.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>${m.urgente ? '<span class="pill crit">urgente</span>' : ''}${m.aviso ? `<span class="pill warn">aviso · ${conf.length}/${todos.length - 1} confirmaram</span>` : ''}</div>
          ${resp ? `<div class="cm-q">${esc(nome(resp.de))}: ${esc((resp.texto || '').slice(0, 90))}</div>` : ''}
          <div class="cm-t">${m.apagadoEm ? '<i class="note">mensagem removida</i>' : fmt(m.texto)}</div>
          ${!m.apagadoEm ? `<div class="cm-a"><button data-resp="${esc(m.id)}">Responder</button><button data-tarefa="${esc(m.id)}">Virar tarefa</button>${m.de === eu() || H.perfil().id === 'diretoria' ? `<button data-apagar="${esc(m.id)}">Remover</button>` : ''}${m.de === eu() ? `<span class="note">${vistos ? 'visto por ' + vistos : 'enviado'}</span>` : ''}</div>` : ''}</div></div>`; }).join('') || '<p class="empty">Nenhuma mensagem ainda. Comece a conversa.</p>'}</div>
      <div class="chat-in"><div class="cm-q" id="chatResp" hidden></div><textarea id="chatTxt" rows="2" placeholder="Escreva para ${esc(nomeCanal(canal))}. Enter envia · Shift+Enter quebra linha · @nome menciona · #OP20 liga a operação"></textarea>
        <div class="btns"><label class="chip"><input type="checkbox" id="chatUrg" style="width:auto"> Urgente</label>${H.pode('chat.aviso') ? '<label class="chip"><input type="checkbox" id="chatAv" style="width:auto"> Aviso (pede “li e entendi”)</label>' : ''}
          <span class="note">${todos.filter(k => k !== eu()).map(k => `<button class="chip" data-men="${esc(nome(k))}">@${esc(nome(k))}</button>`).join(' ')}</span><button class="btn blue" id="chatEnv" style="margin-left:auto">Enviar</button></div></div>`;
    const lst = box.querySelector('#chatMs'); lst.scrollTop = lst.scrollHeight;
    marcarLido(canal);
    let respostaA = null;
    const txt = box.querySelector('#chatTxt');
    const enviar = async () => {
      const t = txt.value.trim(); if (!t) return;
      const corpo = { canal, texto: t, urgente: box.querySelector('#chatUrg').checked, aviso: !!(box.querySelector('#chatAv') || {}).checked, respostaA };
      txt.value = ''; const b = box.querySelector('#chatEnv'); b.disabled = true;
      try { const r = await H.api('/api/chat/mensagem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }); const j = await r.json();
        if (!j.success) throw new Error(j.message); C.msgs.set(j.mensagem.id, j.mensagem); }
      catch (e) { txt.value = t; H.toast('Mensagem não enviada: ' + esc(e.message || 'sem conexão')); }
      b.disabled = false; painel(box, canal); box.querySelector('#chatTxt').focus();
    };
    box.querySelector('#chatEnv').onclick = enviar;
    txt.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } };
    box.querySelectorAll('[data-men]').forEach(b => b.onclick = () => { txt.value += (txt.value && !/\s$/.test(txt.value) ? ' ' : '') + '@' + b.dataset.men + ' '; txt.focus(); });
    box.querySelectorAll('[data-resp]').forEach(b => b.onclick = () => { const m = C.msgs.get(b.dataset.resp); respostaA = m.id; const q = box.querySelector('#chatResp'); q.hidden = false; q.textContent = 'Respondendo a ' + nome(m.de) + ': ' + m.texto.slice(0, 80); txt.focus(); });
    box.querySelectorAll('[data-ok]').forEach(b => b.onclick = async () => { const r = await H.api('/api/chat/confirmar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.dataset.ok }) }); const j = await r.json().catch(() => ({})); if (j.mensagem) C.msgs.set(j.mensagem.id, j.mensagem); painel(box, canal); });
    box.querySelectorAll('[data-apagar]').forEach(b => b.onclick = async () => { if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Confirmar'; return; } await H.api('/api/chat/apagar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.dataset.apagar }) }); const m = C.msgs.get(b.dataset.apagar); if (m) { m.apagadoEm = new Date().toISOString(); m.texto = ''; } painel(box, canal); });
    box.querySelectorAll('[data-tarefa]').forEach(b => b.onclick = () => virarTarefa(C.msgs.get(b.dataset.tarefa)));
    box.querySelectorAll('[data-opref]').forEach(a => a.onclick = e => { e.preventDefault(); H.ir('ficha', a.dataset.opref); });
  }
  H.chatPainel = painel;

  function fmt(t) {
    const ops = new Set((H.db.ops || []).map(o => o && o.id));
    return esc(t).replace(/\n/g, '<br>')
      .replace(/@([\wÀ-ú]+)/g, '<b class="men">@$1</b>')
      .replace(/#(OP[A-Z]*\d+)/gi, (x, id) => ops.has(id.toUpperCase()) ? `<a href="#" data-opref="${id.toUpperCase()}">#${id.toUpperCase()}</a>` : x)
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }

  function virarTarefa(m) {
    if (!m) return;
    const ps = Object.keys(H.db.users || {}).filter(k => W.perfilDe(H.db, k).id !== 'contador');
    const amanha = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
    const md = H.modal('Virar tarefa', `<div class="fields"><div class="f w4"><label class="lbl" for="tt">Tarefa</label><input id="tt" value="${esc(m.texto.slice(0, 160))}"></div>
      <div class="f w2"><label class="lbl" for="tr">Responsável</label><select id="tr">${ps.map(k => `<option value="${esc(nome(k))}" ${(m.menciona || [])[0] === k ? 'selected' : ''}>${esc(nome(k))}</option>`).join('')}</select></div>
      <div class="f"><label class="lbl" for="tp">Prazo</label><input id="tp" type="date" value="${amanha}"></div><div class="f"><label class="lbl" for="tpr">Prioridade</label><select id="tpr"><option value="alta" ${m.urgente ? 'selected' : ''}>Alta</option><option value="media" ${m.urgente ? '' : 'selected'}>Média</option><option value="baixa">Baixa</option></select></div></div>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="tok">Criar tarefa</button>');
    md.querySelector('#tok').onclick = () => {
      if (!Array.isArray(H.db.agendaTasks)) H.db.agendaTasks = [];
      const agora = new Date().toISOString(), resp = md.querySelector('#tr').value;
      H.db.agendaTasks.unshift({ _id: W.novoId(), id: 't_' + Date.now(), t: md.querySelector('#tt').value.trim(), resp, prazo: md.querySelector('#tp').value, hora: '', prio: md.querySelector('#tpr').value, status: 'aberta',
        obs: 'Do chat (' + nomeCanal(m.canal) + '), mensagem de ' + nome(m.de), por: nome(eu()), doneAt: null, criadoEm: agora, vistoEm: resp === nome(eu()) ? agora : null, chatMsgId: m.id, opId: m.opId || '' });
      H.salvar(); H.fecharModal(); H.toast('Tarefa criada para ' + esc(resp));
    };
  }

  function novoCanal() {
    const md = H.modal('Novo canal', `<div class="fields"><div class="f w2"><label class="lbl" for="cn">Nome</label><input id="cn" placeholder="ex.: kitesurf"></div><div class="f w2"><label class="lbl" for="cd">Descrição</label><input id="cd"></div></div>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="cok">Criar</button>');
    md.querySelector('#cok').onclick = async () => {
      const r = await H.api('/api/chat/canal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: md.querySelector('#cn').value, desc: md.querySelector('#cd').value }) }); const j = await r.json().catch(() => ({}));
      if (!j.success) { H.toast(esc(j.message || 'Não criei o canal')); return; }
      H.fecharModal(); C.agora = ''; await buscar(); H.render();
    };
  }
})();
