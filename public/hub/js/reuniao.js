/* Hub 2.0 — Reunião de sexta & Gestor do Mês.
   O sistema monta a pauta sozinho com o que foi registrado na semana (feito,
   falta, importante, preocupações); cada pessoa só completa o próprio check-in
   (prioridades, bloqueios, destaque). O Gestor do Mês apresenta em tela cheia
   e a ata vira tarefas na Agenda. Sem números financeiros na apresentação. */
(function () {
  const H = window.HUB, W = H.W, esc = H.esc;
  let semanaRef = null;
  const eu = () => H.nomeUsuario(H.userKey);
  const equipe = () => Object.keys(H.db.users || {}).filter(k => !['contador'].includes(W.perfilDe(H.db, k).id));
  const reg = id => (H.db.hubReunioes || []).find(r => r && r._id === id);
  const garantir = () => { if (!Array.isArray(H.db.hubReunioes)) H.db.hubReunioes = []; if (!Array.isArray(H.db.hubRH)) H.db.hubRH = []; };

  H.telas.reuniao = function (el) {
    garantir();
    const db = H.db, hoje = W.hojeISO();
    const s = W.semanaDe(semanaRef || hoje), r = W.resumoSemana(db, s.ini, s.fim, hoje);
    const mes = s.sexta.slice(0, 7), gestorK = W.gestorDoMes(db, mes), gestor = gestorK ? H.nomeUsuario(gestorK) : 'a definir';
    const pessoas = equipe().filter(k => W.perfilDe(db, k).id !== 'rh' || r.pessoas[H.nomeUsuario(k)]);
    const chk = k => reg(`chk-${s.ini}-${k}`) || {};
    const ata = reg(`ata-${s.ini}`) || {};
    const meu = chk(H.userKey);
    const pulsoFeito = (db.hubRH || []).some(x => x && x.tipo === 'pulso' && x._id === `pulso-${s.ini}-${hashK(H.userKey)}`) || meu.pulsoEnviado;
    const rank = equipe().filter(k => !['diretoria', 'rh'].includes(W.perfilDe(db, k).id)).map(k => Object.assign({ k }, W.produtividade(db, H.nomeUsuario(k), W.perfilDe(db, k).id, mes, hoje))).sort((a, b) => b.total - a.total);
    const fech = W.fechadasNoMes(db, mes), meta = +((((db.hubPainel || {})._meta || {}).mensal || {})[mes]) || 0;
    const sec = (id, titulo, corpo) => `<section class="box slide" data-slide="${id}"><div class="box-h"><h2>${titulo}</h2></div><div class="box-b">${corpo}</div></section>`;
    const lista = (arr, vazio) => arr.length ? `<ul class="rl">${arr.map(x => `<li>${x}</li>`).join('')}</ul>` : `<p class="note">${vazio}</p>`;

    el.innerHTML = `
      <div class="head"><div><span class="lbl">Semana de ${W.dataBR(s.ini)} a ${W.dataBR(s.fim)} · reunião na sexta ${W.dataBR(s.sexta)}</span><h1>Reunião semanal</h1>
        <p class="sub">Gestor do mês (${mes.split('-').reverse().join('/')}): <b>${esc(gestor)}</b>. A pauta é montada pelo sistema; cada um completa o próprio check-in até quinta.</p></div>
        <div class="btns"><button class="btn" data-sem="-7">‹ Semana anterior</button><button class="btn" data-sem="7">Próxima ›</button>${H.pode('reuniao.editar') ? '<button class="btn" id="rgest">Gestor do mês</button>' : ''}<button class="btn pri" id="rapres">Apresentar</button></div></div>

      <div class="box"><div class="box-h"><h2>Meu check-in da semana</h2><span class="note">${meu.em ? 'enviado ' + W.dataBR(meu.em) : 'ainda não enviado'}</span></div><div class="box-b"><div class="fields">
        <div class="f w2"><label class="lbl" for="cp">Prioridades da próxima semana</label><textarea id="cp" rows="3" placeholder="1 a 3 itens">${esc(meu.prioridades || '')}</textarea></div>
        <div class="f w2"><label class="lbl" for="cb">Preocupações ou bloqueios</label><textarea id="cb" rows="3" placeholder="O que pode atrasar e de quem você precisa">${esc(meu.preocupacoes || '')}</textarea></div>
        <div class="f w2"><label class="lbl" for="cd">Destaque da semana</label><input id="cd" value="${esc(meu.destaque || '')}" placeholder="Uma vitória, um aprendizado"></div>
        ${pulsoFeito ? '<div class="f w2"><span class="lbl">Pulso da semana</span><span class="ro">enviado (anônimo)</span></div>' : `<div class="f w2"><span class="lbl">Como foi sua semana? (anônimo, só o RH vê o conjunto)</span><div class="pulso">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="pulso" value="${n}" style="width:auto"> ${n}${n === 1 ? ' difícil' : n === 5 ? ' ótima' : ''}</label>`).join('')}</div></div>`}
      </div><div class="btns" style="margin-top:10px"><button class="btn blue" id="csalvar">Salvar check-in</button></div></div></div>

      <div id="slides">
      ${sec('capa', 'A semana em números', `<div class="kpis" style="border:0">
          <div class="kpi"><span class="lbl">Etapas avançadas</span><span class="v">${r.etapas.length}</span><span class="d">${r.ativas} operações ativas</span></div>
          <div class="kpi"><span class="lbl">Negócios ganhos</span><span class="v">${r.ganhos.length}</span><span class="d">${r.novosNeg.length} novo(s) no funil · ${r.pedidos.length} pedido(s)</span></div>
          <div class="kpi"><span class="lbl">Documentos aprovados</span><span class="v">${r.docsOk.length}</span><span class="d">dupla conferência</span></div>
          <div class="kpi"><span class="lbl">Tarefas feitas</span><span class="v">${r.feitas.length}</span><span class="d ${r.atrasadasT.length ? 'bad' : ''}">${r.atrasadasT.length} vencida(s)</span></div>
          <div class="kpi"><span class="lbl">Meta do mês</span><span class="v">${fech.length}${meta ? '/' + meta : ''}</span><span class="d">importações fechadas</span></div></div>
        <div class="pipe" style="margin-top:12px">${r.porEtapa.map(e => `<div class="stage"><div class="n" style="color:${e.c}">${e.n}</div><div class="t">${esc(e.l)}</div></div>`).join('')}</div>`)}
      ${sec('feito', 'O que cada um fez · e o que vem', `<div class="g3">${pessoas.map(k => { const nome = H.nomeUsuario(k), p = r.pessoas[nome] || {}, c = chk(k);
          return `<div class="rp"><div class="rp-h"><span class="av mini" style="background:${esc((db.users[k] || {}).cor || 'var(--blue)')}">${esc(nome[0] || '?')}</span><b>${esc(nome)}</b><span class="note">${esc(W.perfilDe(db, k).nome)}</span></div>
            <p class="note">${p.tarefas || 0} tarefa(s) · ${p.etapas || 0} etapa(s) · ${p.docs || 0} doc(s) conferido(s) · ${p.negocios || 0} negócio(s) ganho(s)</p>
            ${p.atrasadas ? `<p class="neg" style="font-size:12.5px">${p.atrasadas} tarefa(s) vencida(s) · ${p.abertas || 0} aberta(s)</p>` : `<p class="note">${p.abertas || 0} tarefa(s) para a próxima semana</p>`}
            ${c.prioridades ? `<p><b>Prioridades:</b> ${esc(c.prioridades)}</p>` : '<p class="note">Sem check-in ainda.</p>'}${c.destaque ? `<p><b>Destaque:</b> ${esc(c.destaque)}</p>` : ''}</div>`; }).join('')}</div>`)}
      ${sec('importante', 'Importante e preocupações', `<div class="g2"><div><h3 class="h3">O sistema apontou</h3>${lista(r.preocupacoes.map(esc), 'Nada crítico apontado.')}</div>
        <div><h3 class="h3">A equipe trouxe</h3>${lista(pessoas.map(k => [H.nomeUsuario(k), chk(k).preocupacoes]).filter(x => x[1]).map(([n, t]) => `<b>${esc(n)}:</b> ${esc(t)}`), 'Ninguém registrou preocupação.')}</div></div>
        <h3 class="h3" style="margin-top:12px">Chegam nos próximos 14 dias</h3>${lista(r.chegam.map(o => `<b class="mono">${esc(o.id)}</b> ${esc(o.cliente || '')} · ETA ${W.dataBR(o.eta)}`), 'Nenhuma chegada prevista.')}`)}
      ${sec('ranking', 'Performance do mês', `<div class="tw"><table><thead><tr><th>#</th><th>Pessoa</th>${W.PILARES.map(([, l]) => `<th class="num">${l}</th>`).join('')}<th class="num">Total</th><th>Faixa</th></tr></thead><tbody>
        ${rank.map((p, i) => `<tr><td><span class="pos p${i + 1}">${i + 1}</span></td><td><b>${esc(p.nome)}</b></td>${W.PILARES.map(([kk]) => `<td class="num">${p.partes[kk] == null ? '—' : Math.round(p.partes[kk])}</td>`).join('')}<td class="num"><b>${p.total}</b></td><td><span class="pill ${p.faixa === 'ouro' ? 'warn' : p.faixa === 'prata' ? 'info' : ''}">${p.faixa}</span></td></tr>`).join('')}</tbody></table></div>`)}
      ${sec('ata', 'Decisões e próximos passos', `<div class="fields"><div class="f w4"><label class="lbl" for="ad">Decisões</label><textarea id="ad" rows="3" ${H.pode('reuniao.editar') || gestorK === H.userKey ? '' : 'readonly'}>${esc(ata.decisoes || '')}</textarea></div></div>
        <div class="list" id="acoes">${(ata.acoes || []).map(a => `<div class="row"><span>${esc(a.t)} · <b>${esc(a.resp)}</b> até ${W.dataBR(a.prazo)}</span><span class="pill ok">na agenda</span></div>`).join('') || '<p class="note">Nenhuma ação registrada.</p>'}</div>
        ${H.pode('reuniao.editar') || gestorK === H.userKey ? `<div class="fields" style="margin-top:8px"><div class="f w2"><label class="lbl" for="at">Nova ação</label><input id="at"></div><div class="f"><label class="lbl" for="ar">Responsável</label><select id="ar">${equipe().map(k => `<option>${esc(H.nomeUsuario(k))}</option>`).join('')}</select></div><div class="f"><label class="lbl" for="ap">Prazo</label><input id="ap" type="date" value="${W.semanaDe((() => { const d = new Date(s.fim + 'T12:00:00'); d.setDate(d.getDate() + 3); return d.toISOString().slice(0, 10); })()).sexta}"></div></div>
          <div class="btns" style="margin-top:8px"><button class="btn" id="aadd">Adicionar ação (vira tarefa)</button><button class="btn blue" id="asalvar">Salvar ata</button></div>` : ''}`)}
      </div>`;

    el.querySelectorAll('[data-sem]').forEach(b => b.onclick = () => { const d = new Date(s.ini + 'T12:00:00'); d.setDate(d.getDate() + +b.dataset.sem); semanaRef = d.toISOString().slice(0, 10); H.render(); });
    el.querySelector('#csalvar').onclick = () => {
      const v = id => el.querySelector(id).value.trim(), agora = new Date().toISOString(), id = `chk-${s.ini}-${H.userKey}`;
      const atual = reg(id), dados = { _id: id, tipo: 'checkin', semana: s.ini, k: H.userKey, nome: eu(), prioridades: v('#cp'), preocupacoes: v('#cb'), destaque: v('#cd'), em: agora };
      const p = el.querySelector('input[name="pulso"]:checked');
      if (p) { H.db.hubRH.push({ _id: `pulso-${s.ini}-${hashK(H.userKey)}`, tipo: 'pulso', semana: s.ini, nota: +p.value, comentario: '', em: agora }); dados.pulsoEnviado = true; }
      if (atual) Object.assign(atual, dados); else H.db.hubReunioes.push(dados);
      H.salvar(); H.toast('Check-in salvo'); H.render();
    };
    const rg = el.querySelector('#rgest'); if (rg) rg.onclick = () => escolherGestor(mes);
    el.querySelector('#rapres').onclick = () => apresentar();
    const aadd = el.querySelector('#aadd'); if (aadd) aadd.onclick = () => {
      const t = el.querySelector('#at').value.trim(); if (!t) { H.toast('Descreva a ação'); return; }
      const resp = el.querySelector('#ar').value, prazo = el.querySelector('#ap').value, agora = new Date().toISOString(), tid = W.novoId();
      if (!Array.isArray(H.db.agendaTasks)) H.db.agendaTasks = [];
      H.db.agendaTasks.unshift({ _id: tid, id: 't_' + Date.now(), t, resp, prazo, hora: '', prio: 'media', status: 'aberta', obs: 'Da reunião de ' + W.dataBR(s.sexta), por: eu(), doneAt: null, criadoEm: agora, vistoEm: resp === eu() ? agora : null });
      const a = reg(`ata-${s.ini}`) || (H.db.hubReunioes.push({ _id: `ata-${s.ini}`, tipo: 'ata', semana: s.ini, acoes: [] }), reg(`ata-${s.ini}`));
      a.acoes = (a.acoes || []).concat([{ t, resp, prazo, taskId: tid }]); a.decisoes = el.querySelector('#ad').value; a.em = agora; a.por = eu();
      H.salvar(); H.toast('Ação na agenda de ' + esc(resp)); H.render();
    };
    const as = el.querySelector('#asalvar'); if (as) as.onclick = () => {
      const a = reg(`ata-${s.ini}`) || (H.db.hubReunioes.push({ _id: `ata-${s.ini}`, tipo: 'ata', semana: s.ini, acoes: [] }), reg(`ata-${s.ini}`));
      a.decisoes = el.querySelector('#ad').value; a.em = new Date().toISOString(); a.por = eu(); H.salvar(); H.toast('Ata salva');
    };
  };

  /* Identificador do pulso: não guarda o nome, só impede votar duas vezes na mesma semana. */
  function hashK(k) { let h = 0; String(k).split('').forEach(c => { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return (h % 9973).toString(36); }

  function escolherGestor(mes) {
    const g = Object.assign({}, ((H.db.hubPainel || {})._reuniao || {}).gestores);
    const prox = [0, 1, 2].map(i => W.mesSoma(mes, i));
    const m = H.modal('Gestor do mês', `<p class="note" style="margin-bottom:10px">Quem conduz a reunião de sexta e apresenta a pauta no mês.</p><div class="fields">${prox.map((mm, i) => `<div class="f w2"><label class="lbl" for="g${i}">${mm.split('-').reverse().join('/')}</label><select id="g${i}"><option value="">—</option>${equipe().map(k => `<option value="${esc(k)}" ${W.gestorDoMes(H.db, mm) === k ? 'selected' : ''}>${esc(H.nomeUsuario(k))}</option>`).join('')}</select></div>`).join('')}</div>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="gok">Salvar</button>');
    m.querySelector('#gok').onclick = () => { prox.forEach((mm, i) => { const v = m.querySelector('#g' + i).value; if (v) g[mm] = v; }); H.db.hubPainel._reuniao = Object.assign({}, H.db.hubPainel._reuniao, { gestores: g }); H.salvar(); H.fecharModal(); H.render(); };
  }

  /* Modo apresentação: uma seção por vez, setas do teclado. */
  function apresentar() {
    const ss = [...document.querySelectorAll('#slides .slide')]; if (!ss.length) return;
    let i = 0;
    const ov = document.createElement('div'); ov.className = 'apres';
    const mostrar = () => { ov.innerHTML = `<div class="apres-top"><img src="logo.webp" alt="WindGate" height="34"><span>${i + 1} / ${ss.length}</span><button class="btn sm" id="apx">Sair (Esc)</button></div><div class="apres-c">${ss[i].outerHTML}</div><div class="apres-nav"><button class="btn" id="apv" ${i ? '' : 'disabled'}>‹ Anterior</button><button class="btn pri" id="app" ${i < ss.length - 1 ? '' : 'disabled'}>Próxima ›</button></div>`;
      ov.querySelector('#apx').onclick = sair; ov.querySelector('#apv').onclick = () => { if (i) { i--; mostrar(); } }; ov.querySelector('#app').onclick = () => { if (i < ss.length - 1) { i++; mostrar(); } }; };
    const tecla = e => { if (e.key === 'Escape') sair(); if (e.key === 'ArrowRight' && i < ss.length - 1) { i++; mostrar(); } if (e.key === 'ArrowLeft' && i) { i--; mostrar(); } };
    function sair() { document.removeEventListener('keydown', tecla); ov.remove(); }
    document.addEventListener('keydown', tecla); document.body.appendChild(ov); mostrar();
    try { ov.requestFullscreen && ov.requestFullscreen().catch(() => {}); } catch (e) {}
  }
})();
