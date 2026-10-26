/* Hub 2.0 — CRM & Funil de vendas.
   Negócios (crmOps) e clientes (crm) são os mesmos registros do sistema atual,
   com campos novos: fase, origem, tipoPedido, proxData, atividades, contribuinte.
   O rótulo antigo (etapa) é mantido em sincronia enquanto os dois sistemas convivem. */
(function () {
  const H = window.HUB, W = H.W, esc = H.esc;
  let aba = 'funil', filtroResp = 'todos', filtroOrigem = '', busca = '', buscaCli = '';
  const eu = () => H.nomeUsuario(H.userKey);
  const valores = () => H.pode('crm.valores');
  const cliente = id => (H.db.crm || []).find(c => c && c._id === id);
  const negocio = id => (H.db.crmOps || []).find(n => n && n._id === id);
  const pessoas = () => Object.keys(H.db.users || {}).map(k => H.nomeUsuario(k));
  const garantir = () => { if (!Array.isArray(H.db.crm)) H.db.crm = []; if (!Array.isArray(H.db.crmOps)) H.db.crmOps = []; };

  H.telas.crm = function (el) {
    if (!H.pode('crm.ver')) { el.innerHTML = '<div class="banner">O CRM não faz parte do seu perfil.</div>'; return; }
    garantir();
    const db = H.db, hoje = W.hojeISO(), ind = W.indicadoresCrm(db, hoje, 90);
    const q = busca.trim().toLowerCase();
    const lista = db.crmOps.filter(n => n && (filtroResp === 'todos' || (filtroResp === 'meus' ? n.resp === eu() : n.resp === filtroResp))
      && (!filtroOrigem || n.origem === filtroOrigem)
      && (!q || [n.titulo, W.nomeCliente(cliente(n.clienteId)), n.obs, n.prox].join(' ').toLowerCase().includes(q)));
    const pct = v => v == null ? '—' : Math.round(v * 100) + '%';

    el.innerHTML = `
      <div class="head"><div><h1>CRM & Funil</h1><p class="sub">Do primeiro contato ao contrato. Negócio parado além do prazo da fase ganha destaque e aparece na Torre de quem cuida dele.</p></div>
        <div class="btns"><button class="btn" data-ir="pedidos">Entrada de pedidos</button><button class="btn pri" data-novo>+ Negócio</button></div></div>
      <div class="kpis">
        <div class="kpi"><span class="lbl">Em aberto</span><span class="v">${ind.abertos}</span><span class="d">${valores() ? W.fmtBRLk(ind.pipeline) + ' em negociação' : 'negócios no funil'}</span></div>
        ${valores() ? `<div class="kpi"><span class="lbl">Previsão ponderada</span><span class="v">${W.fmtBRLk(ind.previsao)}</span><span class="d">valor × chance de cada fase</span></div>` : ''}
        <div class="kpi"><span class="lbl">Conversão 90 dias</span><span class="v">${pct(ind.conversao)}</span><span class="d">${ind.ganhos} ganho(s) de ${ind.fechados} fechado(s)</span></div>
        <div class="kpi"><span class="lbl">Parados</span><span class="v">${ind.parados.length}</span><span class="d ${ind.parados.length ? 'bad' : 'good'}">${ind.parados.length ? 'fora do prazo da fase' : 'todos em dia'}</span></div>
        ${valores() ? `<div class="kpi"><span class="lbl">Ticket médio</span><span class="v">${ind.ticket == null ? '—' : W.fmtBRLk(ind.ticket)}</span><span class="d">negócios ganhos</span></div>` : ''}
        <div class="kpi"><span class="lbl">Ciclo de venda</span><span class="v">${ind.ciclo == null ? '—' : ind.ciclo + ' d'}</span><span class="d">do lead ao contrato</span></div>
      </div>
      <div class="box"><div class="filters">
        <div class="seg">${[['funil', 'Funil'], ['lista', 'Lista'], ['painel', 'Indicadores'], ['clientes', 'Clientes']].map(([k, l]) => `<button data-aba="${k}" class="${aba === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${aba === 'clientes' ? `<input type="search" id="cq" placeholder="Buscar cliente, CNPJ, cidade…" value="${esc(buscaCli)}">` : `<input type="search" id="nq" placeholder="Buscar negócio ou cliente…" value="${esc(busca)}">
        <select id="nr" class="inp" aria-label="Responsável"><option value="todos">Todos</option><option value="meus" ${filtroResp === 'meus' ? 'selected' : ''}>Só os meus</option>${pessoas().map(p => `<option ${filtroResp === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
        <select id="no" class="inp" aria-label="Origem"><option value="">Todas as origens</option>${W.CRM_ORIGENS.map(o => `<option ${filtroOrigem === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`}
      </div>
      <div id="crmCorpo"></div></div>`;
    const corpo = el.querySelector('#crmCorpo');
    ({ funil: () => funil(corpo, lista, hoje), lista: () => tabela(corpo, lista, hoje), painel: () => painel(corpo, ind), clientes: () => clientes(corpo) })[aba]();

    el.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => { aba = b.dataset.aba; H.render(); });
    el.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => H.ir(b.dataset.ir));
    el.querySelector('[data-novo]').onclick = () => novoNegocio();
    const busc = (id, set) => { const i = el.querySelector(id); if (!i) return; i.addEventListener('input', () => { set(i.value); clearTimeout(i._t); i._t = setTimeout(() => { H.render(); const n = document.querySelector(id); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); }); };
    busc('#nq', v => busca = v); busc('#cq', v => buscaCli = v);
    const nr = el.querySelector('#nr'); if (nr) nr.onchange = () => { filtroResp = nr.value; H.render(); };
    const no = el.querySelector('#no'); if (no) no.onchange = () => { filtroOrigem = no.value; H.render(); };
  };

  /* ---------- Funil (kanban com arrastar e soltar) ---------- */
  function cartao(n, hoje) {
    const c = cliente(n.clienteId), sla = W.slaNegocio(n, hoje), sc = W.scoreNegocio(H.db, n);
    const px = n.proxData || n.prazo;
    return `<article class="ncard ${sla.sit}" draggable="true" data-n="${esc(n._id)}" tabindex="0" aria-label="${esc(W.nomeCliente(c) || n.titulo)}">
      <div class="nc-top"><b>${esc(W.nomeCliente(c) || 'Cliente sem cadastro')}</b><span class="score ${sc.nivel}" title="${esc(sc.motivos.join(', '))}">${sc.s}</span></div>
      <div class="nc-t">${esc(n.titulo || '—')}${valores() && +n.valor ? ` · ${W.fmtBRLk(n.valor)}` : ''}</div>
      ${n.prox ? `<div class="nc-p ${px && px < hoje ? 'late' : ''}">${esc(n.prox)}${px ? ' · ' + W.dataBR(px).slice(0, 5) : ''}</div>` : ''}
      <div class="nc-f"><span>${esc(n.resp || '—')}</span><span>${n.origem ? esc(n.origem) + ' · ' : ''}${sla.sit === 'atrasado' ? `<b class="neg">${esc(sla.motivo)}</b>` : W.diasParado(n, hoje) + ' d'}</span></div></article>`;
  }
  function funil(box, lista, hoje) {
    const fases = W.CRM_FASES.filter(f => W.CRM_ABERTAS.includes(f.k));
    const de30 = (() => { const d = new Date(hoje + 'T12:00:00'); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); })();
    const fechados = k => lista.filter(n => W.faseDe(n) === k && W.soData(n.fechadoEm || n.atualizadoEm) >= de30);
    box.innerHTML = `<div class="kanban">${fases.map(f => { const ns = lista.filter(n => W.faseDe(n) === f.k).sort((a, b) => (W.slaNegocio(b, hoje).sit === 'atrasado') - (W.slaNegocio(a, hoje).sit === 'atrasado') || String(a.proxData || a.prazo || '9').localeCompare(String(b.proxData || b.prazo || '9')));
        const tot = ns.reduce((a, n) => a + (+n.valor || 0), 0);
        return `<section class="col" data-fase="${f.k}"><header><span class="dot" style="background:${f.c}"></span><b>${esc(f.l)}</b><span class="note">${ns.length}${valores() && tot ? ' · ' + W.fmtBRLk(tot) : ''}</span></header>
          <p class="col-faz">${esc(f.faz)} · prazo ${f.sla} d</p><div class="col-cards">${ns.map(n => cartao(n, hoje)).join('') || '<p class="empty">Arraste um negócio para cá.</p>'}</div></section>`; }).join('')}
      <section class="col fim" data-fase="ganho"><header><span class="dot" style="background:${W.faseMeta('ganho').c}"></span><b>Ganho</b><span class="note">${fechados('ganho').length} em 30 d</span></header><p class="col-faz">Solte aqui para virar operação</p><div class="col-cards">${fechados('ganho').slice(0, 6).map(n => cartao(n, hoje)).join('')}</div></section>
      <section class="col fim" data-fase="perdido"><header><span class="dot" style="background:${W.faseMeta('perdido').c}"></span><b>Perdido</b><span class="note">${fechados('perdido').length} em 30 d</span></header><p class="col-faz">Pede o motivo da perda</p><div class="col-cards">${fechados('perdido').slice(0, 6).map(n => cartao(n, hoje)).join('')}</div></section></div>`;
    box.querySelectorAll('[data-n]').forEach(c => {
      c.onclick = () => abrirNegocio(c.dataset.n);
      c.onkeydown = e => { if (e.key === 'Enter') abrirNegocio(c.dataset.n); };
      c.ondragstart = e => { e.dataTransfer.setData('text/plain', c.dataset.n); c.classList.add('arrastando'); };
      c.ondragend = () => c.classList.remove('arrastando');
    });
    box.querySelectorAll('[data-fase]').forEach(col => {
      col.ondragover = e => { e.preventDefault(); col.classList.add('alvo'); };
      col.ondragleave = () => col.classList.remove('alvo');
      col.ondrop = e => { e.preventDefault(); col.classList.remove('alvo'); mover(e.dataTransfer.getData('text/plain'), col.dataset.fase); };
    });
  }

  function tabela(box, lista, hoje) {
    const ord = lista.slice().sort((a, b) => W.CRM_FASES.findIndex(f => f.k === W.faseDe(a)) - W.CRM_FASES.findIndex(f => f.k === W.faseDe(b)));
    box.innerHTML = ord.length ? `<div class="tw"><table><thead><tr><th>Cliente</th><th>Negócio</th><th>Fase</th>${valores() ? '<th class="num">Valor</th>' : ''}<th>Origem</th><th>Score</th><th>Próxima ação</th><th>Resp.</th><th>Situação</th></tr></thead><tbody>
      ${ord.map(n => { const f = W.faseMeta(W.faseDe(n)), sla = W.slaNegocio(n, hoje), sc = W.scoreNegocio(H.db, n), px = n.proxData || n.prazo;
        return `<tr class="click" data-n="${esc(n._id)}"><td><b>${esc(W.nomeCliente(cliente(n.clienteId)) || '—')}</b></td><td>${esc(n.titulo || '—')}</td><td><span class="pill" style="background:${f.c}1A;color:${f.c}">${esc(f.l)}</span></td>
          ${valores() ? `<td class="num">${+n.valor ? W.fmtBRL(n.valor) : '—'}</td>` : ''}<td>${esc(n.origem || '—')}</td><td><span class="score ${sc.nivel}">${sc.s}</span></td>
          <td>${esc(n.prox || '—')}${px ? `<br><small class="note">${W.dataBR(px)}</small>` : ''}</td><td>${esc(n.resp || '—')}</td><td>${sla.sit === 'atrasado' ? `<span class="pill crit">${esc(sla.motivo)}</span>` : W.negocioAberto(n) ? '<span class="pill ok">em dia</span>' : '—'}</td></tr>`; }).join('')}</tbody></table></div>`
      : '<p class="empty">Nenhum negócio com esses filtros.</p>';
    box.querySelectorAll('[data-n]').forEach(r => r.onclick = () => abrirNegocio(r.dataset.n));
  }

  function painel(box, ind) {
    const pessoasResp = [...new Set(H.db.crmOps.filter(Boolean).map(n => n.resp).filter(Boolean))];
    const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';
    box.innerHTML = `<div class="box-b g2" style="gap:16px">
      <div><h3 class="h3">Por origem do contato</h3><div class="tw"><table><thead><tr><th>Origem</th><th class="num">Negócios</th><th class="num">Ganhos</th><th class="num">Conversão</th></tr></thead><tbody>
        ${Object.entries(ind.porOrigem).sort((a, b) => b[1].total - a[1].total).map(([o, v]) => `<tr><td>${esc(o)}</td><td class="num">${v.total}</td><td class="num">${v.ganhos}</td><td class="num">${pct(v.ganhos, v.total)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Sem dados.</td></tr>'}</tbody></table></div></div>
      <div><h3 class="h3">Por que perdemos (90 dias)</h3><div class="tw"><table><thead><tr><th>Motivo</th><th class="num">Negócios</th></tr></thead><tbody>
        ${Object.entries(ind.perdas).sort((a, b) => b[1] - a[1]).map(([m, n]) => `<tr><td>${esc(m)}</td><td class="num">${n}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">Nenhuma perda registrada.</td></tr>'}</tbody></table></div></div>
      <div style="grid-column:1/-1"><h3 class="h3">Por responsável</h3><div class="tw"><table><thead><tr><th>Pessoa</th><th class="num">Em aberto</th>${valores() ? '<th class="num">Valor em aberto</th>' : ''}<th class="num">Parados</th><th class="num">Ganhos (total)</th><th class="num">Perdidos (total)</th></tr></thead><tbody>
        ${pessoasResp.map(p => { const ns = H.db.crmOps.filter(n => n && n.resp === p), ab = ns.filter(W.negocioAberto);
          return `<tr><td><b>${esc(p)}</b></td><td class="num">${ab.length}</td>${valores() ? `<td class="num">${W.fmtBRL(ab.reduce((a, n) => a + (+n.valor || 0), 0))}</td>` : ''}<td class="num ${ind.parados.filter(n => n.resp === p).length ? 'neg' : ''}">${ind.parados.filter(n => n.resp === p).length}</td><td class="num">${ns.filter(n => W.faseDe(n) === 'ganho').length}</td><td class="num">${ns.filter(n => W.faseDe(n) === 'perdido').length}</td></tr>`; }).join('') || '<tr><td colspan="6" class="empty">Sem dados.</td></tr>'}</tbody></table></div></div></div>`;
  }

  /* ---------- Clientes (visão 360) ---------- */
  function clientes(box) {
    const q = buscaCli.trim().toLowerCase();
    const cs = H.db.crm.filter(c => c && (!q || [c.empresa, c.nome, c.cnpj, c.segmento, c.end && c.end.cidade, c.end && c.end.uf].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => W.nomeCliente(a).localeCompare(W.nomeCliente(b), 'pt-BR'));
    box.innerHTML = `<div class="box-h"><h2>${cs.length} cliente(s)</h2><button class="btn sm blue" data-novocli>+ Cliente</button></div>${cs.length ? `<div class="tw"><table><thead><tr><th>Cliente</th><th>CNPJ</th><th>Cidade/UF</th><th>Contribuinte ICMS</th><th>Segmento</th><th class="num">Negócios abertos</th><th class="num">Operações</th><th>Último contato</th><th>Resp.</th></tr></thead><tbody>
      ${cs.map(c => { const ns = H.db.crmOps.filter(n => n && n.clienteId === c._id), ops = opsDoCliente(c), ult = ns.map(W.ultimoMovimento).concat((c.interacoes || []).map(i => i && i.data)).filter(Boolean).sort().pop();
        return `<tr class="click" data-c="${esc(c._id)}"><td><b>${esc(W.nomeCliente(c))}</b>${c.empresa && c.nome ? `<br><small class="note">${esc(c.nome)}</small>` : ''}</td><td class="mono">${esc(c.cnpj || '—')}</td><td>${esc([c.end && c.end.cidade, c.end && c.end.uf].filter(Boolean).join('/') || '—')}</td>
          <td>${c.contribuinte === true ? '<span class="pill ok">Sim</span>' : c.contribuinte === false ? '<span class="pill warn">Não · operação triangular</span>' : '<span class="note">a confirmar</span>'}</td><td>${esc(c.segmento || '—')}</td>
          <td class="num">${ns.filter(W.negocioAberto).length}</td><td class="num">${ops.length}</td><td class="note">${ult ? W.dataBR(ult) : '—'}</td><td>${esc(c.resp || '—')}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="empty">Nenhum cliente.</p>'}`;
    box.querySelectorAll('[data-c]').forEach(r => r.onclick = () => abrirCliente(r.dataset.c));
    box.querySelector('[data-novocli]').onclick = () => editarCliente(null);
  }
  function opsDoCliente(c) {
    const alvo = W.nomeCliente(c).toLowerCase().trim(); if (!alvo) return [];
    return H.db.ops.filter(o => o && (o.clienteId === c._id || String(o.cliente || '').toLowerCase().includes(alvo.slice(0, 14))));
  }

  function abrirCliente(id) {
    const c = cliente(id); if (!c) return H.render();
    const ns = H.db.crmOps.filter(n => n && n.clienteId === id), ops = opsDoCliente(c);
    const receita = H.pode('fin.ver') ? H.db.fin.filter(l => l && W.ehReceita(l) && ops.some(o => o.id === l.op) && W.realizado(l)).reduce((a, l) => a + (+l.valor || 0), 0) : null;
    const hist = (c.interacoes || []).map(i => ({ em: i.data, tipo: 'Nota', texto: i.texto, por: i.por })).concat(...ns.map(n => (n.atividades || []).map(a => Object.assign({ neg: n.titulo }, a)))).filter(x => x && x.em).sort((a, b) => String(b.em).localeCompare(String(a.em)));
    const m = H.modal(W.nomeCliente(c), `<div class="g2" style="gap:16px">
      <div><div class="fields">
        <div class="f"><span class="lbl">CNPJ</span><span class="ro mono">${esc(c.cnpj || '—')}</span></div><div class="f"><span class="lbl">Contribuinte ICMS</span><span class="ro">${c.contribuinte === true ? 'Sim' : c.contribuinte === false ? 'Não (triangular)' : 'a confirmar'}</span></div>
        <div class="f"><span class="lbl">Contato</span><span class="ro">${esc(c.nome || '—')}</span></div><div class="f"><span class="lbl">Telefone</span><span class="ro">${esc(c.fone || '—')}</span></div>
        <div class="f w2"><span class="lbl">E-mail</span><span class="ro">${esc(c.email || '—')}</span></div>
        <div class="f"><span class="lbl">Cidade/UF</span><span class="ro">${esc([c.end && c.end.cidade, c.end && c.end.uf].filter(Boolean).join('/') || '—')}</span></div><div class="f"><span class="lbl">Segmento</span><span class="ro">${esc(c.segmento || '—')}</span></div>
        ${receita != null ? `<div class="f w2"><span class="lbl">Já recebido deste cliente</span><span class="ro"><b>${W.fmtBRL(receita)}</b> em ${ops.length} operação(ões)</span></div>` : ''}</div>
        <h3 class="h3" style="margin-top:14px">Negócios</h3><div class="list">${ns.map(n => { const f = W.faseMeta(W.faseDe(n)); return `<div class="row"><div><b>${esc(n.titulo || '—')}</b><br><small class="note">${esc(f.l)}${valores() && +n.valor ? ' · ' + W.fmtBRL(n.valor) : ''}</small></div><button class="btn sm" data-abrir="${esc(n._id)}">Abrir</button></div>`; }).join('') || '<p class="empty">Nenhum negócio.</p>'}</div>
        <h3 class="h3" style="margin-top:14px">Operações</h3><div class="list">${ops.map(o => `<div class="row"><div><b class="mono">${esc(o.id)}</b> ${esc(o.nome || '')}</div>${H.pillStatus(o.status)}</div>`).join('') || '<p class="empty">Nenhuma operação ainda.</p>'}</div></div>
      <div><h3 class="h3">Histórico de contato</h3><div class="tl box-b" style="padding:0">${hist.slice(0, 30).map(h => `<div class="ev"><span class="when">${W.dataBR(h.em)}</span><span class="rail"><i></i></span><div class="what"><b>${esc(h.tipo || 'Nota')}${h.neg ? ' · ' + esc(h.neg) : ''}</b><small>${esc(h.texto || '')}${h.por ? ' · ' + esc(h.por) : ''}</small></div></div>`).join('') || '<p class="empty">Sem contatos registrados.</p>'}</div></div></div>`,
      `<button class="btn" data-x>Fechar</button><button class="btn" id="cneg">+ Negócio para este cliente</button><button class="btn blue" id="cedit">Editar cadastro</button>`);
    m.querySelector('.modal').classList.add('larga');
    m.querySelectorAll('[data-abrir]').forEach(b => b.onclick = () => abrirNegocio(b.dataset.abrir));
    m.querySelector('#cedit').onclick = () => editarCliente(id);
    m.querySelector('#cneg').onclick = () => novoNegocio({ clienteId: id });
  }

  function editarCliente(id, depois) {
    const c = id ? cliente(id) : {}; if (id && !c) return H.render();
    const e = c.end || {};
    const m = H.modal(id ? 'Editar cliente' : 'Novo cliente', `<div class="fields">
      <div class="f w2"><label class="lbl" for="ke">Empresa</label><input id="ke" value="${esc(c.empresa || '')}"></div><div class="f w2"><label class="lbl" for="kn">Contato (pessoa)</label><input id="kn" value="${esc(c.nome || '')}"></div>
      <div class="f"><label class="lbl" for="kc">CNPJ</label><input id="kc" value="${esc(c.cnpj || '')}" inputmode="numeric"></div>
      <div class="f"><label class="lbl" for="kt">Contribuinte ICMS</label><select id="kt"><option value="">A confirmar</option><option value="sim" ${c.contribuinte === true ? 'selected' : ''}>Sim</option><option value="nao" ${c.contribuinte === false ? 'selected' : ''}>Não (operação triangular)</option></select></div>
      <div class="f"><label class="lbl" for="kf">Telefone / WhatsApp</label><input id="kf" value="${esc(c.fone || '')}"></div><div class="f"><label class="lbl" for="km">E-mail</label><input id="km" type="email" value="${esc(c.email || '')}"></div>
      <div class="f"><label class="lbl" for="kci">Cidade</label><input id="kci" value="${esc(e.cidade || '')}"></div><div class="f"><label class="lbl" for="ku">UF</label><input id="ku" maxlength="2" value="${esc(e.uf || '')}"></div>
      <div class="f"><label class="lbl" for="ks">Segmento</label><input id="ks" value="${esc(c.segmento || '')}" list="segs"><datalist id="segs">${['Construção civil', 'Indústria', 'Máquinas e equipamentos', 'Varejo', 'Agronegócio', 'Hotelaria', 'Energia solar', 'Saúde', 'Móveis e decoração', 'Esportes'].map(x => `<option>${x}</option>`).join('')}</datalist></div>
      <div class="f"><label class="lbl" for="kr">Responsável</label><select id="kr">${pessoas().map(p => `<option ${(c.resp || eu()) === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div>
      <div class="f w4"><label class="lbl" for="ko">Observações</label><input id="ko" value="${esc(c.obs || '')}"></div></div>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="kok">Salvar</button>');
    m.querySelector('#kok').onclick = () => {
      const v = s => m.querySelector(s).value.trim();
      if (!v('#ke') && !v('#kn')) { H.toast('Informe a empresa ou o contato'); return; }
      const cnpj = v('#kc').replace(/\D/g, '');
      if (cnpj && cnpj.length !== 14) { H.toast('CNPJ com 14 dígitos'); return; }
      const igual = cnpj && H.db.crm.find(x => x && x._id !== id && String(x.cnpj || '').replace(/\D/g, '') === cnpj);
      if (igual) { H.toast('Este CNPJ já está em <b>' + esc(W.nomeCliente(igual)) + '</b>'); return; }
      const campos = { empresa: v('#ke'), nome: v('#kn'), cnpj: v('#kc'), contribuinte: v('#kt') === 'sim' ? true : v('#kt') === 'nao' ? false : null, fone: v('#kf'), email: v('#km'), segmento: v('#ks'), resp: v('#kr'), obs: v('#ko') };
      let alvo;
      if (id) { alvo = cliente(id); if (!alvo) { H.fecharModal(); return H.render(); } Object.assign(alvo, campos); alvo.end = Object.assign({}, alvo.end, { cidade: v('#kci'), uf: v('#ku').toUpperCase() }); }
      else { alvo = Object.assign({ _id: W.novoId(), interacoes: [], criadoEm: new Date().toISOString(), por: eu(), end: { cidade: v('#kci'), uf: v('#ku').toUpperCase() } }, campos); H.db.crm.unshift(alvo); }
      H.salvar(); H.fecharModal(); H.toast(id ? 'Cliente atualizado' : 'Cliente cadastrado');
      if (depois) depois(alvo); else H.render();
    };
  }

  /* ---------- Negócio ---------- */
  function novoNegocio(pre) {
    garantir();
    const p = pre || {};
    const cs = H.db.crm.filter(Boolean).sort((a, b) => W.nomeCliente(a).localeCompare(W.nomeCliente(b), 'pt-BR'));
    const m = H.modal('Novo negócio', `<div class="fields">
      <div class="f w3"><label class="lbl" for="gc">Cliente</label><select id="gc"><option value="">Selecione…</option>${cs.map(c => `<option value="${esc(c._id)}" ${p.clienteId === c._id ? 'selected' : ''}>${esc(W.nomeCliente(c))}</option>`).join('')}</select></div>
      <div class="f" style="align-self:end"><button class="btn" id="gcn" type="button">+ Cliente novo</button></div>
      <div class="f w4"><label class="lbl" for="gt">Produto / negócio</label><input id="gt" value="${esc(p.titulo || '')}" placeholder="Ex.: 2.000 escoras metálicas 3,4 m"></div>
      <div class="f"><label class="lbl" for="go">Origem</label><select id="go">${W.CRM_ORIGENS.map(o => `<option ${p.origem === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>
      <div class="f"><label class="lbl" for="gp">Tipo</label><select id="gp"><option value="direta">Cotação direta (produto conhecido)</option><option value="estudo" ${p.tipoPedido === 'estudo' ? 'selected' : ''}>Estudo de importação</option></select></div>
      ${valores() ? `<div class="f"><label class="lbl" for="gv">Valor estimado (R$)</label><input id="gv" type="number" step="0.01" value="${p.valor || ''}"></div>` : ''}
      <div class="f"><label class="lbl" for="gr">Responsável</label><select id="gr">${pessoas().map(x => `<option ${(p.resp || eu()) === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="f"><label class="lbl" for="gf">Fase</label><select id="gf">${W.CRM_ABERTAS.map(k => `<option value="${k}" ${p.fase === k ? 'selected' : ''}>${esc(W.faseMeta(k).l)}</option>`).join('')}</select></div>
      <div class="f"><label class="lbl" for="gz">Prazo que o cliente quer</label><input id="gz" type="date"></div>
      <div class="f w4"><label class="lbl" for="gx">Observações</label><input id="gx" value="${esc(p.obs || '')}"></div></div>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="gok">Criar negócio</button>');
    m.querySelector('#gcn').onclick = () => editarCliente(null, c => novoNegocio(Object.assign({}, p, { clienteId: c._id, titulo: m.querySelector('#gt').value })));
    m.querySelector('#gok').onclick = () => {
      const v = s => { const x = m.querySelector(s); return x ? x.value.trim() : ''; };
      if (!v('#gc')) { H.toast('Selecione o cliente (ou cadastre um novo)'); return; }
      if (!v('#gt')) { H.toast('Descreva o produto ou negócio'); return; }
      const agora = new Date().toISOString();
      const n = { _id: W.novoId(), clienteId: v('#gc'), titulo: v('#gt'), valor: +v('#gv') || 0, origem: v('#go'), tipoPedido: v('#gp'), resp: v('#gr'), prazoCliente: v('#gz'), obs: v('#gx'),
        fase: 'lead', etapa: 'Novo contato', criadoEm: agora, atualizadoEm: agora, faseEm: agora, por: eu(), vistoEm: v('#gr') === eu() ? agora : null, quoteId: p.quoteId || '', pedidoId: p.pedidoId || '',
        atividades: [{ _id: W.novoId(), tipo: 'Etapa', texto: 'Negócio criado' + (p.pedidoId ? ' pela Entrada de pedidos' : ''), por: eu(), em: agora, auto: true }] };
      if (v('#gf') !== 'lead') W.moverNegocio(n, v('#gf'), eu(), agora); else { n.prox = 'Responder o cliente e entender o produto'; n.proxData = agora.slice(0, 10); n.prazo = n.proxData; }
      H.db.crmOps.unshift(n); H.salvar(); H.fecharModal(); H.toast('Negócio criado'); H.render();
    };
  }
  H.novoNegocio = novoNegocio;

  function mover(id, fase) {
    const n = negocio(id); if (!n) return H.render();
    if (W.faseDe(n) === fase) return;
    if (fase === 'ganho') return ganhar(id);
    if (fase === 'perdido') return perder(id);
    W.moverNegocio(n, fase, eu()); H.salvar(); H.toast(`Negócio em <b>${esc(W.faseMeta(fase).l)}</b>. ${n.prox ? 'Próxima ação: ' + esc(n.prox) + (n.proxData ? ' até ' + W.dataBR(n.proxData) : '') : ''}`); H.render();
  }

  function abrirNegocio(id) {
    const n = negocio(id); if (!n) return H.render();
    const c = cliente(n.clienteId), fase = W.faseDe(n), idx = W.CRM_FASES.findIndex(f => f.k === fase), sc = W.scoreNegocio(H.db, n), sla = W.slaNegocio(n, W.hojeISO());
    const prox = W.CRM_ABERTAS[W.CRM_ABERTAS.indexOf(fase) + 1];
    const ativs = (n.atividades || []).slice().sort((a, b) => String(b.em).localeCompare(String(a.em)));
    const m = H.modal(`${W.nomeCliente(c) || 'Negócio'} · ${n.titulo || ''}`, `
      <div class="steps" style="margin-bottom:14px">${W.CRM_FASES.filter(f => f.k !== 'perdido').map((f, i) => `<div class="st ${fase === 'perdido' ? '' : i < idx ? 'done' : i === idx ? 'cur' : ''}"><span class="dot">${i < idx && fase !== 'perdido' ? '✓' : i + 1}</span>${esc(f.l)}</div>`).join('')}</div>
      ${fase === 'perdido' ? `<p class="banner">Perdido${n.motivoPerda ? ': ' + esc(n.motivoPerda) : ''}.</p>` : ''}${n.opId ? `<p class="banner ok">Virou a operação <a href="#" data-op="${esc(n.opId)}"><b>${esc(n.opId)}</b></a>.</p>` : ''}
      <div class="g2" style="gap:16px"><div><div class="fields">
        <div class="f w4"><label class="lbl" for="et2">Produto / negócio</label><input id="et2" value="${esc(n.titulo || '')}"></div>
        ${valores() ? `<div class="f"><label class="lbl" for="ev2">Valor (R$)</label><input id="ev2" type="number" step="0.01" value="${+n.valor || ''}"></div>` : ''}
        <div class="f"><label class="lbl" for="eo2">Origem</label><select id="eo2"><option value="">—</option>${W.CRM_ORIGENS.map(o => `<option ${n.origem === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>
        <div class="f"><label class="lbl" for="ep2">Tipo</label><select id="ep2"><option value="direta">Cotação direta</option><option value="estudo" ${n.tipoPedido === 'estudo' ? 'selected' : ''}>Estudo de importação</option></select></div>
        <div class="f"><label class="lbl" for="er2">Responsável</label><select id="er2">${pessoas().map(x => `<option ${n.resp === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
        <div class="f w3"><label class="lbl" for="ex2">Próxima ação</label><input id="ex2" value="${esc(n.prox || '')}"></div><div class="f"><label class="lbl" for="ed2">Até</label><input id="ed2" type="date" value="${esc(n.proxData || n.prazo || '')}"></div>
        <div class="f w4"><label class="lbl" for="eb2">Observações</label><input id="eb2" value="${esc(n.obs || '')}"></div></div>
        <p class="note" style="margin-top:10px">Score <b>${sc.s}</b> (${sc.nivel})${sc.motivos.length ? ': ' + esc(sc.motivos.join(', ')) : ''}. ${sla.sit === 'atrasado' ? `<b class="neg">${esc(sla.motivo)}</b>` : `Na fase há ${W.diasParado(n, W.hojeISO())} dia(s), prazo ${sla.sla || '—'}.`}</p>
        <div class="btns" style="margin-top:12px;flex-wrap:wrap">${W.negocioAberto(n) ? `${prox ? `<button class="btn blue" data-mv="${prox}">Avançar para ${esc(W.faseMeta(prox).l)}</button>` : ''}<button class="btn" data-mv="ganho" style="color:var(--ok)">Ganho</button><button class="btn" data-mv="perdido" style="color:var(--crit)">Perdido</button>` : `<button class="btn" data-mv="qualificacao">Reabrir</button>`}
          <button class="btn" data-wpp>Copiar follow-up</button>${c ? `<button class="btn ghost" data-cli>Ver cliente</button>` : ''}</div></div>
      <div><h3 class="h3">Registrar contato</h3><div class="fields"><div class="f"><label class="lbl" for="at">Tipo</label><select id="at">${W.CRM_ATIVIDADES.map(a => `<option>${a}</option>`).join('')}</select></div>
        <div class="f w3"><label class="lbl" for="ax">O que aconteceu</label><input id="ax" placeholder="Ex.: Cliente pediu prazo de 60 dias"></div></div>
        <div class="btns" style="margin-top:8px"><button class="btn sm blue" id="aok">Registrar</button></div>
        <div class="tl" style="margin-top:12px">${ativs.map(a => `<div class="ev"><span class="when">${W.dataBR(a.em)}</span><span class="rail"><i></i></span><div class="what"><b>${esc(a.tipo || 'Nota')}</b><small>${esc(a.texto || '')}${a.por ? ' · ' + esc(a.por) : ''}</small></div></div>`).join('') || '<p class="empty">Nenhum contato registrado.</p>'}</div></div></div>`,
      `<button class="btn" id="edelN" style="margin-right:auto;color:var(--crit)">Excluir</button><button class="btn" data-x>Fechar</button><button class="btn blue" id="esN">Salvar</button>`);
    m.querySelector('.modal').classList.add('larga');
    const atual = () => negocio(id);
    const v = s => { const x = m.querySelector(s); return x ? x.value.trim() : null; };
    const salvarCampos = () => {
      const a = atual(); if (!a) return false;
      const campos = { titulo: v('#et2'), origem: v('#eo2'), tipoPedido: v('#ep2'), resp: v('#er2'), prox: v('#ex2'), proxData: v('#ed2'), prazo: v('#ed2'), obs: v('#eb2') };
      if (valores()) campos.valor = +v('#ev2') || 0;
      const mudou = Object.keys(campos).some(k => String(a[k] == null ? '' : a[k]) !== String(campos[k]));
      if (mudou) { if (campos.resp !== a.resp) a.vistoEm = campos.resp === eu() ? new Date().toISOString() : null; Object.assign(a, campos); a.atualizadoEm = new Date().toISOString(); }
      return mudou;
    };
    m.querySelector('#esN').onclick = () => { if (salvarCampos()) { H.salvar(); H.toast('Negócio salvo'); } H.fecharModal(); H.render(); };
    m.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => { if (salvarCampos()) H.salvar(); H.fecharModal(); mover(id, b.dataset.mv); });
    m.querySelector('#aok').onclick = () => {
      const a = atual(); const txt = v('#ax'); if (!a || !txt) { H.toast('Escreva o que aconteceu'); return; }
      salvarCampos();
      a.atividades = (a.atividades || []).concat([{ _id: W.novoId(), tipo: v('#at'), texto: txt, por: eu(), em: new Date().toISOString() }]);
      a.atualizadoEm = new Date().toISOString(); H.salvar(); H.fecharModal(); abrirNegocio(id);
    };
    m.querySelector('[data-wpp]').onclick = async () => {
      const txt = `Olá${c && c.nome ? ', ' + c.nome.split(' ')[0] : ''}! Tudo bem? Aqui é ${eu()}, da WindGate. Passando para saber se conseguiu avaliar ${fase === 'proposta' || fase === 'negociacao' ? 'nossa proposta' : 'o que conversamos'} sobre ${n.titulo || 'a importação'}. Posso te ajudar com alguma dúvida ou ajuste?`;
      try { await navigator.clipboard.writeText(txt); H.toast('Mensagem copiada. É só colar no WhatsApp.'); } catch (e) { H.toast(esc(txt)); }
    };
    const cl = m.querySelector('[data-cli]'); if (cl) cl.onclick = () => abrirCliente(n.clienteId);
    const op = m.querySelector('[data-op]'); if (op) op.onclick = e => { e.preventDefault(); H.fecharModal(); H.ir('ficha', n.opId); };
    const del = m.querySelector('#edelN');
    del.onclick = () => {
      if (del.dataset.ok !== '1') { del.dataset.ok = '1'; del.textContent = 'Clique de novo para excluir'; return; }
      H.db.crmOps = H.db.crmOps.filter(x => !(x && x._id === id)); H.salvar(); H.fecharModal(); H.toast('Negócio excluído (recuperável pelo histórico do banco)'); H.render();
    };
  }

  function perder(id) {
    const m = H.modal('Negócio perdido', `<div class="fields"><div class="f w2"><label class="lbl" for="pm">Motivo</label><select id="pm">${W.CRM_MOTIVOS_PERDA.map(x => `<option>${esc(x)}</option>`).join('')}</select></div>
      <div class="f w2"><label class="lbl" for="pd">Detalhe (opcional)</label><input id="pd" placeholder="Ex.: concorrente cobrou 8% menos"></div></div>
      <p class="note" style="margin-top:8px">O motivo alimenta o painel "Por que perdemos" para ajustar preço, prazo e abordagem.</p>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="pok">Registrar perda</button>');
    m.querySelector('#pok').onclick = () => {
      const n = negocio(id); if (!n) { H.fecharModal(); return H.render(); }
      const det = m.querySelector('#pd').value.trim();
      W.moverNegocio(n, 'perdido', eu(), null, { motivo: m.querySelector('#pm').value + (det ? ' — ' + det : '') });
      n.motivoPerda = m.querySelector('#pm').value; n.motivoDetalhe = det;
      H.salvar(); H.fecharModal(); H.toast('Perda registrada'); H.render();
    };
  }

  function ganhar(id) {
    const n = negocio(id); if (!n) return H.render();
    const nums = H.db.ops.map(o => parseInt(String(o && o.id).replace(/\D/g, ''), 10)).filter(x => isFinite(x));
    const prox = 'OP' + ((nums.length ? Math.max(...nums) : 0) + 1), hoje = W.hojeISO();
    const soma = d => { const x = new Date(hoje + 'T12:00:00'); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
    const lanc = H.pode('fin.lancar') && valores();
    const m = H.modal('Negócio ganho · vira operação', `<div class="fields">
      <div class="f"><label class="lbl" for="wo">Código da operação</label><input id="wo" value="${prox}"></div>
      <div class="f"><label class="lbl" for="wr">Responsável</label><select id="wr">${pessoas().map(x => `<option ${(n.resp || eu()) === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      ${valores() ? `<div class="f w2"><label class="lbl" for="wv">Valor fechado com o cliente (R$)</label><input id="wv" type="number" step="0.01" value="${+n.valor || ''}"></div>` : ''}</div>
      ${lanc ? `<h3 class="h3" style="margin-top:14px"><label><input type="checkbox" id="wl" checked style="width:auto"> Lançar os recebimentos previstos no Financeiro</label></h3>
      <div class="fields"><div class="f"><label class="lbl" for="w1p">Sinal (%)</label><input id="w1p" type="number" value="30"></div><div class="f"><label class="lbl" for="w1d">Vencimento</label><input id="w1d" type="date" value="${soma(7)}"></div>
        <div class="f"><label class="lbl" for="w2p">Saldo de produção (%)</label><input id="w2p" type="number" value="70"></div><div class="f"><label class="lbl" for="w2d">Vencimento</label><input id="w2d" type="date" value="${soma(45)}"></div>
        <div class="f w2"><label class="lbl" for="we">Recebe em</label><select id="we"><option value="WindGate">WindGate / SF</option><option value="JeT">JeT</option></select></div></div>
      <p class="note" style="margin-top:8px">Valores editáveis depois em Lançamentos. Lembrete da regra da casa: o recebimento de cada etapa não pode ser menor que o pagamento à fábrica da mesma etapa.</p>` : ''}
      <p class="note" style="margin-top:8px">Cria a operação em <b>Contrato</b> com o checklist documental padrão e liga ao negócio.</p>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn pri" id="wok">Confirmar ganho</button>');
    m.querySelector('#wok').onclick = () => {
      const a = negocio(id); if (!a) { H.fecharModal(); return H.render(); }
      const g = s => { const x = m.querySelector(s); return x ? x.value.trim() : ''; };
      if (valores() && g('#wv')) a.valor = +g('#wv') || a.valor;
      const usar = lanc && m.querySelector('#wl').checked;
      const p1 = +g('#w1p') || 0, p2 = +g('#w2p') || 0;
      if (usar && Math.abs(p1 + p2 - 100) > 0.01) { H.toast('Sinal + saldo precisam somar 100%'); return; }
      try {
        const r = W.ganharNegocio(H.db, a, { opId: g('#wo').toUpperCase(), resp: g('#wr'), por: eu(), checklist: H.CHK_MODELO, empresa: g('#we') || 'WindGate',
          parcelas: usar ? [{ rot: 'Sinal ' + p1 + '%', pct: p1, venc: g('#w1d') }, { rot: 'Saldo ' + p2 + '%', pct: p2, venc: g('#w2d') }] : null });
        H.salvar(); H.fecharModal(); H.toast(`Negócio ganho. Operação <b>${esc(r.op.id)}</b> criada${r.lancs.length ? ` com ${r.lancs.length} recebimento(s) previsto(s)` : ''}.`); H.ir('ficha', r.op.id);
      } catch (e) { H.toast(esc(e.message)); }
    };
  }
})();
