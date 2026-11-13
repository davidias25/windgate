/* Hub 2.0 — Torre de Controle, lista de Operações e Ficha da Operação. */
(function () {
  const H = window.HUB, W = H.W, esc = H.esc;

  /* A Torre de Controle por função fica em torre.js. */

  function tabelaOps(lista, opt) {
    const db = H.db;
    if (!lista.length) return '<p class="empty">Nenhuma operação aqui.</p>';
    const comFin = H.pode('fin.resultado') && !(opt && opt.compacta);
    const res = comFin ? Object.fromEntries(W.resultadoPorOp(db, 'todas').map(r => [r.op, r])) : {};
    return `<div class="tw"><table><thead><tr><th>Operação</th><th>Cliente · produto</th><th>Etapa</th><th>Prazo da etapa</th><th>ETA</th>${opt && opt.compacta ? '' : '<th>Navio</th>'}<th class="num">Docs</th>${comFin ? '<th class="num">A receber</th><th class="num">Resultado</th>' : ''}<th>Resp.</th></tr></thead><tbody>
      ${lista.map(o => { const pct = W.checklistPct(db, o.id); const r = res[o.id];
        return `<tr class="click" data-op="${esc(o.id)}"><td class="mono">${o.maeId ? '<span class="note">↳ </span>' : ''}<b>${esc(o.id)}</b>${W.ehMae(o) ? '<br><span class="pill info">contêiner</span>' : ''}</td><td><div class="cli" title="${esc(o.cliente || '')}">${W.ehMae(o) ? esc(W.filhasDe(db, o.id).map(f => f.cliente).join(' + ') || 'sem filhas') : esc(o.cliente || '—')}</div><small class="note cli" style="display:block">${esc(o.nome || '')}</small></td>
        <td>${H.pillStatus(o.status)}</td><td>${H.semaforo(db, o)}</td><td class="mono">${W.dataBR(o.eta)}</td>${opt && opt.compacta ? '' : `<td>${esc(o.navio || '—')}</td>`}
        <td class="num">${pct == null ? '—' : pct + '%'}</td>${comFin ? (x => `<td class="num">${x ? W.fmtBRL(x.saldoReceber) : '—'}</td><td class="num ${x && x.resultado < 0 ? 'neg' : ''}">${x ? W.fmtBRL(x.resultado) : '—'}</td>`)(W.ehMae(o) ? W.consolidadoDaMae(db, o.id, res) : r) : ''}
        <td>${esc(o.resp || '—')}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  }
  H.tabelaOps = tabelaOps;

  function ligar(el) {
    el.querySelectorAll('[data-op]').forEach(x => x.addEventListener('click', e => { e.stopPropagation(); H.ir('ficha', x.dataset.op); }));
    el.querySelectorAll('[data-a]').forEach(x => x.addEventListener('click', () => { const a = x.dataset.a; if (a === 'nova') novaOperacao(); else if (a === 'novamae') novaOperacao(true); else H.ir(a); }));
  }

  /* ================= LISTA DE OPERAÇÕES (ativas + histórico) ================= */
  let modoLista = 'ativas';
  H.telas.ops = function (el) {
    const db = H.db;
    const q = (H.buscaGlobal || '').trim().toLowerCase();
    let lista = db.ops.filter(o => o && o.id);
    if (!q) lista = lista.filter(o => modoLista === 'todas' ? true : modoLista === 'ativas' ? W.emAndamento(o) : !W.emAndamento(o));
    if (q) lista = lista.filter(o => [o.id, o.cliente, o.nome, o.navio, o.obs, o.tracking].join(' ').toLowerCase().includes(q));
    // A filha fica logo abaixo da mãe.
    lista.sort((a, b) => String(b.maeId || b.id).localeCompare(String(a.maeId || a.id), 'pt-BR', { numeric: true }) || (a.maeId ? 1 : 0) - (b.maeId ? 1 : 0) || String(a.id).localeCompare(String(b.id), 'pt-BR', { numeric: true }));
    el.innerHTML = `
      <div class="head"><div><h1>Operações</h1><p class="sub">Ativas e histórico completo. A busca procura em todas, inclusive as entregues.</p></div>
        <div class="btns">${W.multiClienteLigado(db) && H.pode('fin.excluir') ? '<button class="btn" data-a="novamae">+ Contêiner compartilhado</button>' : ''}<button class="btn pri" data-a="nova">+ Nova operação</button></div></div>
      <div class="box"><div class="filters">
        <input type="search" id="opq" placeholder="Buscar por OP, cliente, produto, navio…" value="${esc(H.buscaGlobal || '')}">
        <div class="seg">${['ativas', 'entregues', 'todas'].map(m => `<button data-m="${m}" class="${modoLista === m && !q ? 'on' : ''}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</div>
        <span class="note">${lista.length} operação(ões)</span></div>
        ${tabelaOps(lista)}</div>`;
    ligar(el);
    const inp = el.querySelector('#opq');
    inp.addEventListener('input', () => { H.buscaGlobal = inp.value; clearTimeout(inp._t); inp._t = setTimeout(() => { H.render(); const n = document.querySelector('#opq'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); });
    el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { modoLista = b.dataset.m; H.buscaGlobal = ''; H.render(); });
  };

  /* ================= FICHA DA OPERAÇÃO ================= */
  let abaFicha = 'resumo';
  H.telas.ficha = function (el, id) {
    const db = H.db;
    const o = db.ops.find(x => x && x.id === id);
    if (!o) { el.innerHTML = `<div class="banner">Operação ${esc(id)} não encontrada.</div>`; return; }
    const idx = W.FLUXO.indexOf(o.status);
    const pct = W.checklistPct(db, o.id);
    const r = !H.pode('fin.resultado') ? null : W.ehMae(o) ? W.consolidadoDaMae(db, o.id) : W.resultadoPorOp(db, 'todas').find(x => x.op === o.id);
    const abas = [['resumo', 'Resumo'], ['etapas', 'Etapas & histórico'], ['logistica', 'Logística & contêineres'], ['docs', `Documentos${pct != null ? ' · ' + pct + '%' : ''}`]];
    abas.splice(3, 0, ['comex', 'Comex, custo & câmbio']);
    abas.push(['chat', 'Conversa']);
    if (W.ehMae(o)) abas.unshift(['conteiner', 'Contêiner & filhas']);
    if (H.pode('fin.lancar')) abas.push(['fin', H.pode('fin.ver') ? 'Financeiro da operação' : 'Lançamentos da operação']);

    el.innerHTML = `
      <div class="head"><div><span class="lbl"><a href="#ops" data-voltar>Operações</a> · ${esc(o.id)}${o.maeId ? ` · filha do contêiner <a href="#" data-mae="${esc(o.maeId)}">${esc(o.maeId)}</a>` : ''}</span><h1>${esc(o.id)} · ${W.ehMae(o) ? 'Contêiner compartilhado' : esc(o.cliente || '')}</h1>
        <p class="sub">${esc(o.nome || '')}${o.origemPorto || o.destinoPorto ? ' · ' + esc(o.origemPorto || '?') + ' → ' + esc(o.destinoPorto || '?') : ''}</p></div>
        <div class="btns">${H.pillStatus(o.status)} ${H.semaforo(db, o)} <button class="btn blue" data-acao="etapa">Mudar etapa</button>${H.pode('fin.excluir') ? `<button class="btn" data-acao="renomear">Editar código</button><button class="btn" data-acao="excluir">Excluir</button>${W.multiClienteLigado(db) && !o.maeId && !W.ehMae(o) ? '<button class="btn" data-acao="virarmae">Virar contêiner compartilhado</button>' : ''}` : ''}</div></div>
      <div class="box box-b"><div class="steps" aria-label="Etapas">${W.FLUXO.map((k, i) => `<div class="st ${i < idx ? 'done' : i === idx ? 'cur' : ''}"><span class="dot">${i < idx ? '✓' : i + 1}</span>${esc(W.stMeta(k).l)}</div>`).join('')}</div>
        ${o.status === 'travada' ? '<p class="banner" style="margin-top:10px">Operação travada. Registre o motivo e a próxima ação no Resumo.</p>' : ''}</div>
      ${r ? `<div class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))">
        <div class="kpi"><span class="lbl">Receita da operação</span><span class="v">${W.fmtBRLk(r.receita)}</span><span class="d">${W.fmtBRLk(r.rr)} já recebido</span></div>
        <div class="kpi"><span class="lbl">Custos da operação</span><span class="v">${W.fmtBRLk(r.despesa)}</span><span class="d">${W.fmtBRLk(r.dr)} já pago</span></div>
        <div class="kpi"><span class="lbl">Resultado previsto</span><span class="v ${r.resultado < 0 ? 'neg' : ''}">${W.fmtBRLk(r.resultado)}</span><span class="d">${r.margem == null ? '' : 'margem ' + (r.margem * 100).toFixed(1) + '% s/ custo'}</span></div>
        <div class="kpi"><span class="lbl">Caixa da operação hoje</span><span class="v ${r.caixa < 0 ? 'neg' : ''}">${W.fmtBRLk(r.caixa)}</span><span class="d">recebido − pago</span></div></div>` : ''}
      <div class="tabs" role="tablist">${abas.map(([k, l]) => `<button role="tab" aria-selected="${abaFicha === k}" data-aba="${k}">${l}</button>`).join('')}</div>
      <div id="fichaAba"></div>`;

    el.querySelector('[data-voltar]').onclick = e => { e.preventDefault(); H.ir('ops'); };
    const lnkMae = el.querySelector('[data-mae]'); if (lnkMae) lnkMae.onclick = e => { e.preventDefault(); H.ir('ficha', lnkMae.dataset.mae); };
    const bVm = el.querySelector('[data-acao="virarmae"]'); if (bVm) bVm.onclick = () => virarMaeModal(o.id);
    el.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => { abaFicha = b.dataset.aba; H.render(); });
    el.querySelector('[data-acao="etapa"]').onclick = () => mudarEtapa(o);
    const bRen = el.querySelector('[data-acao="renomear"]'); if (bRen) bRen.onclick = () => renomear(o.id);
    const bExc = el.querySelector('[data-acao="excluir"]'); if (bExc) bExc.onclick = () => excluir(o.id);
    if (!abas.find(a => a[0] === abaFicha)) abaFicha = 'resumo';
    ({ conteiner: abaConteiner, resumo: abaResumo, etapas: abaEtapas, logistica: abaLogistica, docs: abaDocs, fin: abaFin, chat: abaChat, comex: H.fichaComex })[abaFicha](el.querySelector('#fichaAba'), o);
  };

  function renomear(id) {
    const g = W.ligadosDaOp(H.db, id);
    const m = H.modal(`Editar código · ${esc(id)}`, `<div class="fields"><div class="f w4"><label class="lbl" for="rn">Novo código</label><input id="rn" value="${esc(id)}"></div></div>
      <p class="note" style="margin-top:8px">Atualiza a operação, ${g.fin} lançamento(s), ${g.docs} documento(s), o checklist, o histórico, a conversa e a cotação ligada. Texto escrito à mão, como "Frete ${esc(id)}" numa descrição, não muda.</p>
      <p class="note" style="margin-top:4px">Para mudar a mercadoria ou o cliente, use a aba Resumo.</p>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="rnok">Salvar</button>');
    m.querySelector('#rnok').onclick = async () => {
      const r = W.renomearOperacao(H.db, id, m.querySelector('#rn').value, H.nomeUsuario(H.userKey));
      if (!r.ok) return H.toast(esc(r.msg));
      H.salvar(); H.fecharModal();
      // A conversa da operação fica no arquivo do chat, fora do banco.
      H.api('/api/ops/renomear-conversa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ de: id, para: r.para }) }).catch(() => {});
      H.toast(`Operação agora é <b>${esc(r.para)}</b>.`); H.ir('ficha', r.para);
    };
  }
  function excluir(id) {
    const bloq = W.bloqueiosExclusao(H.db, id), g = W.ligadosDaOp(H.db, id);
    if (bloq.length) return H.modal(`A operação ${esc(id)} não pode ser excluída`, `<div class="list">${bloq.map(b => `<div class="row"><span>${esc(b)}</span></div>`).join('')}</div>`, '<button class="btn" data-x>Fechar</button>');
    const outras = H.db.ops.filter(o => o && o.id && o.id !== id).map(o => o.id).sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true }));
    const m = H.modal(`Excluir a operação ${esc(id)}?`, `<p>A operação sai da lista${g.fin ? '.' : ', e não tem lançamentos.'}</p>
      ${g.fin ? `<p style="margin-top:8px"><b>${g.fin} lançamento(s) previsto(s)</b>, ${W.fmtBRL(g.valor)} no total. Para onde eles vão?</p>
        <div class="f" style="margin-top:6px"><label class="lbl" for="oxmv">Mover para a operação</label><select id="oxmv"><option value="">Não mover: ficam no Financeiro com o código ${esc(id)}</option>${outras.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select></div>` : ''}`,
      '<button class="btn" data-x>Cancelar</button><button class="btn pri" id="oxok">Continuar</button>');
    m.querySelector('#oxok').onclick = () => {
      const sel = m.querySelector('#oxmv'), destino = sel ? sel.value : '';
      H.fecharModal();
      const c = H.modal('Confirme a exclusão', `<p>${destino ? `${g.fin} lançamento(s) vão para a <b>${esc(destino)}</b>, e a` : 'A'} operação <b>${esc(id)}</b> será excluída. Digite o código para confirmar.</p>
        <div class="f" style="margin-top:8px"><label class="lbl" for="oxcod">Código da operação</label><input id="oxcod" autocomplete="off"></div>`,
        '<button class="btn" data-x>Cancelar</button><button class="btn pri" id="oxfim">Excluir</button>');
      c.querySelector('#oxfim').onclick = () => {
        if (c.querySelector('#oxcod').value.trim().toUpperCase() !== String(id).trim().toUpperCase()) return H.toast('O código digitado não confere.');
        const r = W.excluirOperacao(H.db, id, H.nomeUsuario(H.userKey), null, { moverPara: destino });
        if (!r.ok) return H.toast(esc(r.msg));
        H.salvar(); H.fecharModal(); H.toast(`Operação <b>${esc(id)}</b> excluída.`); H.ir('ops');
      };
    };
  }

  function campo(o, k, rot, tipo, extra) {
    const v = o[k] == null ? '' : o[k];
    const cls = extra && extra.w ? ' ' + extra.w : '';
    if (tipo === 'area') return `<div class="f${cls}"><label class="lbl" for="c_${k}">${rot}</label><textarea id="c_${k}" data-k="${k}">${esc(v)}</textarea></div>`;
    return `<div class="f${cls}"><label class="lbl" for="c_${k}">${rot}</label><input id="c_${k}" data-k="${k}" type="${tipo || 'text'}" value="${esc(tipo === 'date' ? W.soData(v) : v)}"></div>`;
  }
  /* A sincronização troca os objetos do banco a cada 15 s: toda ação busca o
     registro ATUAL pelo id na hora do clique, nunca usa a cópia da tela. */
  const opAtual = o => H.db.ops.find(x => x && (o._id ? x._id === o._id : x.id === o.id)) || H.db.ops.find(x => x && x.id === o.id);
  H.opAtual = opAtual;
  function salvarCampos(box, o0) {
    const o = opAtual(o0);
    if (!o) { H.toast('Esta operação foi removida por outra pessoa. Nada foi gravado.'); H.render(); return; }
    let mudou = false;
    box.querySelectorAll('[data-k]').forEach(i => { const k = i.dataset.k; if ((o[k] == null ? '' : String(o[k])) !== i.value) { o[k] = i.value; mudou = true; } });
    if (mudou) { o.atualizadoEm = new Date().toISOString(); o.atualizadoPor = H.nomeUsuario(H.userKey); H.salvar(); H.toast('Operação salva'); H.render(); }
    else H.toast('Nada mudou');
  }

  function abaResumo(box, o) {
    box.innerHTML = `<div class="box"><div class="box-h"><h2>Dados da operação</h2><button class="btn blue sm" data-salvar>Salvar alterações</button></div><div class="box-b fields">
      ${campo(o, 'cliente', 'Cliente', 'text', { w: 'w2' })}${campo(o, 'nome', 'Mercadoria / descrição', 'text', { w: 'w2' })}
      ${campo(o, 'resp', 'Responsável')}${campo(o, 'fabricaCidade', 'Fábrica (cidade)')}${campo(o, 'origemPorto', 'Porto de origem')}${campo(o, 'destinoPorto', 'Porto de destino')}
      ${campo(o, 'prox', 'Próxima ação', 'text', { w: 'w4' })}${campo(o, 'obs', 'Observações', 'area', { w: 'w4' })}
      <div class="f"><span class="lbl">Criada em</span><span class="ro">${W.dataBR(o.criadaEm)}</span></div>
      <div class="f"><span class="lbl">Na etapa desde</span><span class="ro">${W.dataBR(o.statusEm)}</span></div>
      <div class="f"><span class="lbl">Última alteração</span><span class="ro">${o.atualizadoEm ? W.dataBR(o.atualizadoEm) + ' · ' + esc(o.atualizadoPor || '') : '—'}</span></div>
    </div></div>`;
    box.querySelector('[data-salvar]').onclick = () => salvarCampos(box, o);
    if (o.maeId) box.querySelectorAll('[data-k]').forEach(i => { if (W.CAMPOS_HERDADOS.includes(i.dataset.k)) { i.disabled = true; i.title = 'Vem do contêiner ' + o.maeId; } });
  }

  function abaEtapas(box, o) {
    const hist = H.db.opStatusHist.filter(h => h && h.op === o.id).sort((a, b) => String(b.em).localeCompare(String(a.em)));
    box.innerHTML = `${blocoFreteETarefas(o)}<div class="box"><div class="box-h"><h2>Linha do tempo das etapas</h2><span class="note">${hist.length} mudança(s) registrada(s)</span></div><div class="box-b tl">
      ${hist.length ? hist.map(h => `<div class="ev"><span class="when">${W.dataBR(h.em)}</span><span class="rail"><i></i></span><div class="what">${h.tipo === 'renomeacao' ? `<b>${esc(h.motivo || 'Código alterado')}</b><small>${esc(h.por || '')}</small>` : `<b>${esc(W.stMeta(h.de).l)} → ${esc(W.stMeta(h.para).l)}</b><small>${esc(h.por || '')}${h.motivo ? ' · ' + esc(h.motivo) : ''}${h.tipo && h.tipo !== 'mudanca' ? ' · ' + esc(h.tipo) : ''}</small>`}</div></div>`).join('')
      : '<p class="empty">Nenhuma mudança registrada ainda.</p>'}</div></div>`;
    ligarFrete(box, o);
  }

  /* ---------- Marco "Frete fechado" e tarefas da etapa (tarefas-auto.js) ---------- */
  function blocoFreteETarefas(o) {
    if (!W.alvoDe) return '';
    const alvo = W.alvoDe(H.db, o), fr = W.freteDe(H.db, alvo), ts = W.tarefasDaOp(H.db, o), hoje = W.hojeISO();
    const veValor = H.pode('fin.ver') || W.podeMarcarFrete(H.userKey);
    const sit = t => t.status === 'feita' ? '<span class="pill ok">concluída</span>' : t.auto && t.auto.suspensa ? '<span class="pill">suspensa</span>' : t.prazo && t.prazo < hoje ? '<span class="pill crit">atrasada</span>' : '<span class="pill info">aberta</span>';
    return `<div class="box"><div class="box-h"><h2>Frete fechado${alvo.id !== o.id ? ` · contêiner ${esc(alvo.id)}` : ''}</h2>${W.podeMarcarFrete(H.userKey) ? `<button class="btn sm ${fr ? '' : 'blue'}" id="frmk">${fr ? 'Editar' : 'Marcar frete fechado'}</button>` : ''}</div>
      <div class="box-b">${fr ? `<p><b>Fechado em ${W.dataBR(String(fr.em).slice(0, 10))}</b> por ${esc(H.nomeUsuario(fr.por) || fr.por || '—')}${fr.agente ? ' · ' + esc(fr.agente) : ''}${fr.booking ? ' · booking <span class="mono">' + esc(fr.booking) + '</span>' : ''}${veValor && fr.valor != null ? ' · ' + W.fmtBRL(fr.valor) : ''}</p>` : '<p class="note">Ainda não marcado. É um marco, não uma etapa: a sequência de etapas continua a mesma.</p>'}</div></div>
      <div class="box"><div class="box-h"><h2>Tarefas da operação</h2><span class="note">automáticas e manuais ligadas a ${esc(alvo.id)}</span></div><div class="box-b tl">
        ${ts.length ? ts.map(t => `<div class="ev"><span class="when">${W.dataBR(String(t.criadaEm || '').slice(0, 10))}</span><span class="rail"><i></i></span><div class="what"><b>${esc(t.t)}</b> ${sit(t)}${t.auto && t.auto.retroativo ? ' <span class="pill">retroativa</span>' : ''}
          <small>${esc(t.resp || '')}${(t.copia || []).length ? ' · cópia ' + esc(t.copia.join(', ')) : ''}${t.prazo ? ' · prazo ' + W.dataBR(t.prazo) : ''}${t.status === 'feita' ? ` · concluída${t.feitaPor ? ' por ' + esc(t.feitaPor) : ''}${t.doneAt ? ' em ' + W.dataBR(String(t.doneAt).slice(0, 10)) : ''}${t.obsConclusao ? ' · ' + esc(t.obsConclusao) : ''}` : ''}</small></div></div>`).join('')
        : '<p class="empty">Nenhuma tarefa ligada a esta operação.</p>'}</div></div>`;
  }
  function ligarFrete(box, o) {
    const b = box.querySelector('#frmk'); if (!b) return;
    b.onclick = () => {
      const alvo = W.alvoDe(H.db, o), fr = W.freteDe(H.db, alvo) || {};
      const m = H.modal('Frete fechado', `<p class="note">${alvo.id !== o.id ? `Marca no contêiner <b>${esc(alvo.id)}</b>, que vale para todas as filhas. ` : ''}Ao marcar, a tarefa "Fechar frete" é concluída e a Ívina recebe a conferência da documentação pré-embarque.</p>
        <div class="fields" style="margin-top:8px"><div class="f"><label class="lbl" for="fre">Data</label><input id="fre" type="date" value="${esc(String(fr.em || W.hojeISO()).slice(0, 10))}"></div>
          <div class="f"><label class="lbl" for="fra">Agente / armador</label><input id="fra" value="${esc(fr.agente || '')}"></div>
          <div class="f"><label class="lbl" for="frb">Booking</label><input id="frb" value="${esc(fr.booking || '')}"></div>
          <div class="f"><label class="lbl" for="frv">Valor do frete (opcional)</label><input id="frv" inputmode="decimal" value="${fr.valor != null ? esc(fr.valor) : ''}"></div></div>`,
        '<button class="btn" data-x>Cancelar</button><button class="btn pri" id="frok">Salvar</button>');
      m.querySelector('#frok').onclick = () => {
        const v = s => m.querySelector(s).value.trim(), val = v('#frv');
        const oa = (H.db.ops || []).find(x => x && x.id === o.id) || o;
        W.marcarFreteFechado(H.db, oa, { em: v('#fre') ? v('#fre') + 'T12:00:00-03:00' : '', agente: v('#fra'), booking: v('#frb'), valor: val === '' ? '' : +val.replace(/\./g, '').replace(',', '.') }, H.userKey, new Date().toISOString());
        H.salvar(); H.fecharModal(); H.render(); H.toast('Frete fechado marcado.');
      };
    };
  }

  function abaLogistica(box, o) {
    const cont = Array.isArray(o.containers) ? o.containers : [];
    box.innerHTML = `<div class="g2"><div class="box"><div class="box-h"><h2>Embarque</h2><button class="btn blue sm" data-salvar>Salvar</button></div><div class="box-b fields">
        ${campo(o, 'embarque', 'Embarque (ETD)', 'date')}${campo(o, 'eta', 'Chegada prevista (ETA)', 'date')}${campo(o, 'navio', 'Navio', 'text', { w: 'w2' })}
        ${campo(o, 'armador', 'Armador')}${campo(o, 'bl', 'BL')}${campo(o, 'tracking', 'Link de tracking do armador', 'url', { w: 'w2' })}
        ${campo(o, 'posAtual', 'Posição atual (texto)', 'text', { w: 'w4' })}
        ${campo(o, 'duimp', 'Número da DUIMP', 'text', { w: 'w2' })}${campo(o, 'duimpVersao', 'Versão')}
        <div class="f"><span class="lbl">Situação no Portal Único</span><span class="ro">${o.duimpSituacao ? esc([o.duimpSituacao.situacao, o.duimpSituacao.canal ? 'canal ' + o.duimpSituacao.canal : ''].filter(Boolean).join(' · ') || 'consultada') + `<br><small class="note">${W.dataBR(o.duimpSituacao.atualizadoEm)}</small>` : '<span class="note">aguardando integração</span>'}</span></div>
      </div></div>
      <div class="box"><div class="box-h"><h2>Contêineres</h2><button class="btn sm" data-addc>+ Contêiner</button></div>
        ${cont.length ? `<div class="tw"><table><thead><tr><th>Número</th><th>Tipo</th><th>Lacre</th><th></th></tr></thead><tbody>${cont.map((c, i) => `<tr><td class="mono">${esc(c.numero)}</td><td>${esc(c.tipo || '')}</td><td class="mono">${esc(c.lacre || '')}</td><td class="num"><button class="btn ghost sm" data-delc="${i}">Remover</button></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="empty">Nenhum contêiner cadastrado. O número do contêiner é o que liga o tracking automático.</p>'}
        <p class="box-b note">Com o contêiner cadastrado, ligue o tracking automático (ShipsGo) e acompanhe o free time na aba Comex, custo & câmbio.</p></div></div>`;
    box.querySelector('[data-salvar]').onclick = () => salvarCampos(box, o);
    if (o.maeId) { // A logística é da mãe: na filha é só leitura.
      box.querySelectorAll('input,select,textarea,button').forEach(i => { i.disabled = true; });
      box.insertAdjacentHTML('afterbegin', `<p class="banner" style="margin-bottom:12px">Embarque, contêiner e DUIMP vêm do contêiner <b>${esc(o.maeId)}</b>: altere por lá.</p>`);
      return;
    }
    box.querySelector('[data-addc]').onclick = () => {
      const m = H.modal('Novo contêiner', `<div class="fields"><div class="f w2"><label class="lbl" for="cn">Número</label><input id="cn" placeholder="MSCU1234567" maxlength="11"></div><div class="f"><label class="lbl" for="ct">Tipo</label><select id="ct"><option>40'HQ</option><option>40'DC</option><option>20'DC</option><option>LCL</option></select></div><div class="f"><label class="lbl" for="cl">Lacre</label><input id="cl"></div></div>`, '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="cok">Adicionar</button>');
      m.querySelector('#cok').onclick = () => {
        const n = m.querySelector('#cn').value.trim().toUpperCase().replace(/\s/g, '');
        if (!/^[A-Z]{4}\d{6,7}$/.test(n)) { H.toast('Número de contêiner no formato ABCU1234567'); return; }
        const oa = opAtual(o); if (!oa) { H.fecharModal(); H.render(); return; }
        const ca = Array.isArray(oa.containers) ? oa.containers : [];
        if (ca.some(c => c.numero === n)) { H.toast('Este contêiner já está na operação'); return; }
        oa.containers = ca.concat([{ numero: n, tipo: m.querySelector('#ct').value, lacre: m.querySelector('#cl').value.trim() }]);
        H.salvar(); H.fecharModal(); H.render();
      };
    };
    box.querySelectorAll('[data-delc]').forEach(b => b.onclick = () => {
      const oa = opAtual(o); if (!oa) return H.render();
      const alvo = cont[+b.dataset.delc] && cont[+b.dataset.delc].numero;
      oa.containers = (oa.containers || []).filter(c => c.numero !== alvo); H.salvar(); H.render();
    });
  }

  const CHK = [['pendente', 'Pendente', ''], ['coletado', 'Coletado', 'info'], ['revisado', 'Revisado', 'info'], ['aprovado', 'Aprovado', 'ok'], ['na', 'N/A', '']];
  function abaDocs(box, o) {
    const db = H.db;
    const chk = db.checklists[o.id];
    const docs = db.docs.filter(d => d && d.op === o.id);
    const daMae = o.maeId ? db.docs.filter(d => d && d.op === o.maeId && !d.substituidoPor && !d.removidoEm && W.DOCS_DA_MAE.includes(W.tipoDoc(d))) : [];
    box.innerHTML = `<div class="g2">
      <div class="box"><div class="box-h"><h2>Checklist documental</h2><span class="note">${Array.isArray(chk) ? chk.length + ' itens' : 'sem checklist'}</span></div>
        ${Array.isArray(chk) && chk.length ? `<div class="tw"><table><thead><tr><th>Fase</th><th>Documento</th><th>Situação</th><th>Por</th></tr></thead><tbody>
        ${chk.map((it, i) => `<tr><td class="note">${esc(it.fase)}</td><td>${esc(it.titulo)}${it.link ? ` · <a href="${esc(it.link)}" target="_blank" rel="noopener">abrir</a>` : ''}</td>
          <td><select class="inp" data-chk="${i}">${CHK.filter(([k]) => H.pode('docs.revisar') || !['revisado', 'aprovado'].includes(k) || it.status === k).map(([k, l]) => `<option value="${k}" ${it.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
          <td class="note">${esc([it.coletadoPor, it.revisadoPor].filter(Boolean).join(' · '))}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="empty">Esta operação ainda não tem checklist.</p>'}</div>
      <div class="box"><div class="box-h"><h2>Arquivos da operação</h2><span class="note">${docs.length}</span></div><div class="box-b list">
        ${docs.length ? docs.map(d => `<div class="row"><div><b>${esc(d.nome)}</b><br><small class="note">${esc(d.grupo || d.cat || '')} · ${W.dataBR(d.data)} · ${esc(d.por || '')}</small></div>${W.linkPerdido(d.link) ? `<span class="pill crit" title="O arquivo ficou no disco do servidor e foi apagado numa publicação. Envie de novo.">arquivo perdido</span>` : d.link ? `<a class="btn sm" href="${esc(d.link)}" target="_blank" rel="noopener">Abrir</a>` : ''}<button class="btn ghost sm" data-excl="${esc(d._id)}" title="Excluir documento" aria-label="Excluir documento">✕</button></div>`).join('') : '<p class="empty">Nenhum arquivo.</p>'}
      ${daMae.length ? `<p class="lbl" style="margin-top:10px">Do contêiner ${esc(o.maeId)}</p>${daMae.map(d => `<div class="row"><div><b>${esc(d.nome)}</b><br><small class="note">${esc(d.cat || '')} · ${W.dataBR(d.data)} · ${esc(d.por || '')}</small></div>${W.linkPerdido(d.link) ? '<span class="pill crit">arquivo perdido</span>' : d.link ? `<a class="btn sm" href="${esc(d.link)}" target="_blank" rel="noopener">Abrir</a>` : ''}</div>`).join('')}` : ''}
      </div></div></div>`;
    box.querySelectorAll('[data-excl]').forEach(b => b.onclick = () => H.excluirDoc(b.dataset.excl));
    box.querySelectorAll('[data-chk]').forEach(s => s.onchange = () => {
      const lista = H.db.checklists[o.id], ref = chk[+s.dataset.chk];
      const it = Array.isArray(lista) && (lista[+s.dataset.chk] && lista[+s.dataset.chk].titulo === ref.titulo ? lista[+s.dataset.chk] : lista.find(x => x && x.titulo === ref.titulo && x.fase === ref.fase));
      if (!it) { H.toast('Este item mudou em outra tela. Atualizei a lista.'); H.render(); return; }
      const eu = H.nomeUsuario(H.userKey), v = s.value, agora = W.hojeISO();
      if (['revisado', 'aprovado'].includes(v) && !H.pode('docs.revisar')) { H.toast('Revisar e aprovar documentos é do Davi ou do Samir. Marque como <b>Coletado</b>.'); H.render(); return; }
      // Dupla análise, igual ao sistema atual: quem aprova não pode ser quem coletou.
      if (v === 'aprovado') {
        const rev = it.revisadoPor || eu;
        if (!it.coletadoPor) { H.toast('Para aprovar, o item precisa ter <b>coletado por</b> preenchido (dupla análise).'); H.render(); return; }
        if (it.coletadoPor === rev) { H.toast('Quem revisa não pode ser quem coletou.'); H.render(); return; }
        if (!it.revisadoPor) it.revisadoEm = agora;
        it.revisadoPor = rev;
      }
      if (v === 'coletado' && !it.coletadoPor) { it.coletadoPor = eu; it.coletadoEm = agora; }
      if (v === 'revisado' && !it.revisadoPor) {
        if (it.coletadoPor === eu) { H.toast('Quem revisa não pode ser quem coletou.'); H.render(); return; }
        it.revisadoPor = eu; it.revisadoEm = agora;
      }
      it.status = v;
      if (it.link) espelharDoc(o.id, it);
      H.salvar(); H.toast('Checklist atualizado'); H.render();
    });
  }

  /* Mesmo espelho do sistema atual (syncChkDoc): o item do checklist com link aparece em Documentos com o mesmo status. */
  function espelharDoc(op, it) {
    if (!it.link) return;
    const map = { coletado: 'recebido', revisado: 'revisado', aprovado: 'aprovado', pendente: 'pendente', na: 'pendente' };
    const ex = H.db.docs.find(d => d && d.op === op && d.nome === it.titulo);
    if (ex) { ex.link = it.link; ex.status = map[it.status] || 'recebido'; }
    else H.db.docs.unshift({ _id: W.novoId(), op, grupo: 'outros', nome: it.titulo, cat: it.titulo, link: it.link, status: map[it.status] || 'recebido', por: it.coletadoPor || H.nomeUsuario(H.userKey), obs: 'via checklist', data: W.hojeISO() });
  }

  function abaChat(box, o) {
    box.innerHTML = '<section class="box" id="chatPane"></section>';
    if (H.chatPainel) { if (H.chat && !H.chat.carregado) H.chatBuscar().then(() => { const p = document.querySelector('#chatPane'); if (p) H.chatPainel(p, 'op:' + o.id); }); else H.chatPainel(box.querySelector('#chatPane'), 'op:' + o.id); }
  }

  /* ================= CONTÊINER COMPARTILHADO ================= */
  const num = v => (+v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  function abaConteiner(box, o) {
    const oc = W.ocupacaoDaMae(H.db, o.id), edita = H.pode('fin.excluir');
    const fonte = c => (c.fonte ? `<br><small class="note">${esc(c.fonte)}</small>` : '');
    box.innerHTML = `<div class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))">
        <div class="kpi"><span class="lbl">m³ ocupados</span><span class="v">${num(oc.m3)}</span><span class="d">${oc.capM3 ? 'de ' + num(oc.capM3) + ' m³' : 'sem capacidade definida'}</span></div>
        <div class="kpi"><span class="lbl">m³ livres</span><span class="v ${oc.livreM3 < 0 ? 'neg' : ''}">${oc.livreM3 == null ? '—' : num(oc.livreM3)}</span><span class="d">${oc.semMedida.length ? 'falta o m³ de ' + esc(oc.semMedida.join(', ')) : 'no contêiner'}</span></div>
        <div class="kpi"><span class="lbl">Peso ocupado</span><span class="v">${num(oc.kg)} kg</span><span class="d">${oc.capKg ? 'de ' + num(oc.capKg) + ' kg' : 'sem capacidade definida'}</span></div>
        <div class="kpi"><span class="lbl">Peso livre</span><span class="v ${oc.livreKg < 0 ? 'neg' : ''}">${oc.livreKg == null ? '—' : num(oc.livreKg) + ' kg'}</span><span class="d">FOB das filhas: US$ ${num(oc.fobUSD)}</span></div></div>
      ${oc.excedeu ? '<div class="banner crit" style="margin-bottom:12px">⛔ As filhas somam mais do que cabe no contêiner. Confira as medidas.</div>' : ''}
      ${H.pode('fin.resultado') ? (c => `<div class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:12px"><div class="kpi"><span class="lbl">Receita das filhas</span><span class="v">${W.fmtBRLk(c.receita)}</span><span class="d">${W.fmtBRLk(c.saldoReceber)} a receber</span></div><div class="kpi"><span class="lbl">Custo das filhas</span><span class="v">${W.fmtBRLk(c.despesa)}</span></div><div class="kpi"><span class="lbl">Resultado do contêiner</span><span class="v ${c.resultado < 0 ? 'neg' : ''}">${W.fmtBRLk(c.resultado)}</span><span class="d">soma das filhas, sem contar em dobro</span></div></div>`)(W.consolidadoDaMae(H.db, o.id)) : ''}
      <div class="box"><div class="box-h"><h2>Operações-filhas</h2>${edita ? '<button class="btn sm" data-addf>+ Filha</button>' : ''}</div>
        ${oc.filhas.length ? `<div class="tw"><table><thead><tr><th>Filha</th><th>Cliente</th><th>Etapa</th><th class="num">m³</th><th class="num">Peso (kg)</th><th class="num">FOB (US$)</th><th></th></tr></thead><tbody>
          ${oc.filhas.map(({ o: f, med }) => `<tr><td class="mono"><a href="#" data-ver="${esc(f.id)}"><b>${esc(f.id)}</b></a></td><td>${esc(f.cliente || '—')}<br><small class="note">${esc(f.nome || '')}</small></td><td>${H.pillStatus(f.status)}</td>
            <td class="num">${edita ? `<input class="inp" data-med="m3" data-f="${esc(f.id)}" value="${esc(f.m3 == null ? '' : f.m3)}" placeholder="${esc(med.m3.v ? num(med.m3.v) : '')}" inputmode="decimal" style="width:80px;text-align:right">` : num(med.m3.v)}${fonte(med.m3)}</td>
            <td class="num">${edita ? `<input class="inp" data-med="pesoKg" data-f="${esc(f.id)}" value="${esc(f.pesoKg == null ? '' : f.pesoKg)}" placeholder="${esc(med.pesoKg.v ? num(med.pesoKg.v) : '')}" inputmode="decimal" style="width:90px;text-align:right">` : num(med.pesoKg.v)}${fonte(med.pesoKg)}</td>
            <td class="num">${edita ? `<input class="inp" data-med="fobUSD" data-f="${esc(f.id)}" value="${esc(f.fobUSD == null ? '' : f.fobUSD)}" placeholder="${esc(med.fobUSD.v ? num(med.fobUSD.v) : '')}" inputmode="decimal" style="width:100px;text-align:right">` : num(med.fobUSD.v)}${fonte(med.fobUSD)}</td>
            <td class="num">${edita ? `<button class="btn ghost sm" data-desl="${esc(f.id)}" title="Desligar do contêiner">Desligar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Nenhuma filha ainda. Crie uma para cada cliente deste contêiner.</p>'}
        <p class="box-b note">Sem número digitado, m³, peso e FOB vêm da cotação ligada à filha. O m³ só vem da cotação se todos os itens tiverem CBM.</p></div>
      <div class="box"><div class="box-h"><h2>Contêiner</h2>${edita ? '<button class="btn blue sm" data-salvar>Salvar</button>' : ''}</div><div class="box-b fields">
        ${campo(o, 'fornecedor', 'Fornecedor', 'text', { w: 'w2' })}
        <div class="f"><label class="lbl" for="c_tipoConteiner">Tipo de contêiner</label><select id="c_tipoConteiner" data-k="tipoConteiner"><option value="">—</option>${["20'DC", "40'DC", "40'HQ"].map(t => `<option ${o.tipoConteiner === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        ${campo(o, 'capM3', 'Capacidade (m³)')}${campo(o, 'capKg', 'Capacidade (kg)')}
        <p class="note w4">Sem capacidade digitada, vale a dos contêineres cadastrados ou o tipo escolhido: 20' 33 m³ e 28.000 kg, 40' 67 m³ e 26.500 kg, 40' HQ 76 m³ e 26.500 kg. Embarque, BL, navio, ETA e DUIMP ficam em Logística & contêineres.</p></div></div>`;
    const sv = box.querySelector('[data-salvar]'); if (sv) sv.onclick = () => salvarCampos(box.querySelector('.box:last-child'), o);
    if (!edita) box.querySelectorAll('[data-k]').forEach(i => { i.disabled = true; });
    box.querySelectorAll('[data-ver]').forEach(a => a.onclick = e => { e.preventDefault(); H.ir('ficha', a.dataset.ver); });
    box.querySelectorAll('[data-med]').forEach(i => i.onchange = () => {
      const f = H.db.ops.find(x => x && x.id === i.dataset.f); if (!f) return H.render();
      const v = parseFloat(String(i.value).replace(',', '.'));
      if (v > 0) f[i.dataset.med] = v; else delete f[i.dataset.med];
      H.salvar(); H.render();
    });
    box.querySelectorAll('[data-desl]').forEach(b => b.onclick = () => {
      const id = b.dataset.desl, m = H.modal('Desligar do contêiner', `<p><b>${esc(id)}</b> volta a ser uma operação comum. Os lançamentos e documentos dela ficam como estão, e os dados de embarque copiados continuam nela.</p>`, '<button class="btn" data-x>Cancelar</button><button class="btn pri" id="dsok">Desligar</button>');
      m.querySelector('#dsok').onclick = () => { const r = W.desligarFilha(H.db, id); if (!r.ok) return H.toast(esc(r.msg)); H.salvar(); H.fecharModal(); H.render(); };
    });
    const af = box.querySelector('[data-addf]'); if (af) af.onclick = () => novaFilha(o.id);
    if (edita && !oc.filhas.length) { const s = box.querySelector('[data-salvar]'); if (s) s.insertAdjacentHTML('beforebegin', '<button class="btn sm" data-desfaz>Voltar a operação comum</button>');
      const d = box.querySelector('[data-desfaz]'); if (d) d.onclick = () => { const r = W.desfazerMae(H.db, o.id); if (!r.ok) return H.toast(esc(r.msg)); H.salvar(); H.toast('Voltou a ser uma operação comum.'); H.render(); }; }
  }
  function novaFilha(maeId) {
    const cots = (H.db.qindex || []).filter(q => q && q.id);
    const m = H.modal('Nova operação-filha · ' + maeId, `<div class="fields"><div class="f"><label class="lbl" for="fi">Código</label><input id="fi" value="${esc(W.proximoCodigoFilha(H.db, maeId))}"></div>
      <div class="f w3"><label class="lbl" for="fc">Cliente</label><input id="fc"></div><div class="f w4"><label class="lbl" for="fn">Mercadoria</label><input id="fn"></div>
      <div class="f w4"><label class="lbl" for="fq">Cotação (opcional)</label><select id="fq"><option value="">—</option>${cots.map(q => `<option value="${esc(q.id)}">${esc(q.label || q.id)}</option>`).join('')}</select></div>
      <div class="f"><label class="lbl" for="fm">m³</label><input id="fm" inputmode="decimal"></div><div class="f"><label class="lbl" for="fk">Peso (kg)</label><input id="fk" inputmode="decimal"></div><div class="f"><label class="lbl" for="fu">FOB (US$)</label><input id="fu" inputmode="decimal"></div></div>
      <p class="note" style="margin-top:8px">Com cotação ligada, deixe em branco o que já está nela. A filha nasce em Contrato e herda a etapa do contêiner.</p>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn pri" id="fok">Criar filha</button>');
    const q = s => m.querySelector(s), n = s => parseFloat(String(q(s).value).replace(',', '.')) || 0;
    q('#fok').onclick = () => {
      const r = W.criarFilha(H.db, maeId, { id: q('#fi').value, cliente: q('#fc').value, nome: q('#fn').value, quoteId: q('#fq').value, m3: n('#fm'), pesoKg: n('#fk'), fobUSD: n('#fu') }, H.nomeUsuario(H.userKey), null, CHK_MODELO);
      if (!r.ok) return H.toast(esc(r.msg));
      H.salvar(); H.fecharModal(); H.toast(`Filha <b>${esc(r.op.id)}</b> criada.`); H.render();
    };
  }
  function virarMaeModal(id) {
    const g = W.ligadosDaOp(H.db, id), o = H.db.ops.find(x => x && x.id === id);
    const m = H.modal(`Virar contêiner compartilhado · ${esc(id)}`, `<p><b>${esc(id)}</b> passa a representar o contêiner, e cada cliente vira uma filha, como ${esc(id)}.1 e ${esc(id)}.2.</p>
      ${g.fin ? `<p class="banner" style="margin-top:8px">Os <b>${g.fin} lançamento(s)</b> continuam em ${esc(id)}. Por enquanto, recebimentos não passam sozinhos para as filhas.</p>` : ''}
      <p class="note" style="margin-top:8px">O cliente ${esc(o && o.cliente ? o.cliente : '')} sai da ${esc(id)} e fica guardado. Enquanto não houver filhas, dá para voltar atrás.</p>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn pri" id="vmok">Confirmar</button>');
    m.querySelector('#vmok').onclick = () => { const r = W.virarMae(H.db, id); if (!r.ok) return H.toast(esc(r.msg)); abaFicha = 'conteiner'; H.salvar(); H.fecharModal(); H.render(); };
  }

  function abaFin(box, o) {
    const ls = H.db.fin.filter(l => l && l.op === o.id).sort((a, b) => W.vencDe(a).localeCompare(W.vencDe(b)));
    box.innerHTML = `<div class="box"><div class="box-h"><h2>Lançamentos da operação</h2><div class="btns"><button class="btn sm blue" data-comp>Enviar comprovante</button><button class="btn sm" data-novo>+ Lançamento</button></div></div>
      ${H.tabelaLanc ? H.tabelaLanc(ls) : ''}</div>`;
    box.querySelector('[data-novo]').onclick = () => H.editarLanc(null, { op: o.id });
    box.querySelector('[data-comp]').onclick = () => H.enviarComprovante && H.enviarComprovante({ op: o.id });
    if (H.ligarLanc) H.ligarLanc(box);
  }

  function mudarEtapa(o) {
    const m = H.modal('Mudar etapa · ' + o.id, `<div class="fields"><div class="f w2"><label class="lbl" for="ne">Nova etapa</label><select id="ne">${W.etapasPermitidas(o).map(s => `<option value="${s.k}" ${s.k === o.status ? 'selected' : ''}>${esc(s.l)}</option>`).join('')}</select></div>
      <div class="f w2"><label class="lbl" for="nm">Motivo / observação</label><input id="nm" placeholder="Ex.: navio confirmou atracação"></div></div>
      <p class="note" style="margin-top:10px">A mudança fica registrada na linha do tempo, com data e seu nome. O prazo da nova etapa começa a contar hoje.${o.maeId ? ` Produção, embarque, trânsito e chegada vêm do contêiner ${esc(o.maeId)}.` : W.ehMae(o) ? ' Produção, embarque, trânsito e chegada passam para as filhas.' : ''}</p>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="neok">Confirmar</button>');
    m.querySelector('#neok').onclick = () => {
      o = opAtual(o);
      if (!o) { H.fecharModal(); H.toast('Esta operação foi removida por outra pessoa.'); H.render(); return; }
      const novo = m.querySelector('#ne').value; if (novo === o.status) { H.fecharModal(); return; }
      const agora = new Date().toISOString(), eu = H.nomeUsuario(H.userKey);
      H.db.opStatusHist.push({ _id: W.novoId(), op: o.id, de: o.status, para: novo, em: agora, deEm: o.statusEm || '', por: eu, tipo: 'mudanca', origem: 'hub2', motivo: m.querySelector('#nm').value.trim() });
      o.status = novo; o.statusEm = agora; o.statusPor = eu; delete o.statusEstimado;
      H.salvar(); H.fecharModal(); H.toast(`${esc(o.id)} agora em <b>${esc(W.stMeta(novo).l)}</b>`); H.render();
    };
  }

  const CHK_MODELO = [['Fechamento', 'Contrato assinado'], ['Fechamento', 'Proforma Invoice'], ['Fechamento', 'Comprovante câmbio — 1ª parcela'],
    ['Produção/Embarque', 'Commercial Invoice'], ['Produção/Embarque', 'Packing List'], ['Produção/Embarque', 'Frete fechado (3 cotações · FONTIME)'],
    ['Produção/Embarque', 'Comprovante câmbio — saldo'], ['Produção/Embarque', 'BL Draft aprovado'], ['Trânsito', 'BL Original / Telex Release'],
    ['Trânsito', 'Apólice de seguro'], ['Trânsito', 'Docs enviados ao despachante'], ['Desembaraço', 'Checklist ICMS-AL (exoneração/benefício)'],
    ['Desembaraço', 'DI / DUIMP registrada'], ['Desembaraço', 'ICMS-AL pago (1,6%)'], ['Desembaraço', 'NF de entrada / nacionalização'],
    ['Entrega', 'NF de saída / venda'], ['Entrega', 'GNRE DIFAL (se aplicável)'], ['Entrega', 'CT-e transporte terrestre'], ['Entrega', 'Comprovante de entrega assinado']];
  H.CHK_MODELO = CHK_MODELO;

  H.novaOperacao = () => novaOperacao();
  function novaOperacao(mae) {
    const nums = H.db.ops.map(o => parseInt(String(o.id).replace(/\D/g, ''), 10)).filter(n => isFinite(n));
    const prox = 'OP' + ((nums.length ? Math.max(...nums) : 0) + 1);
    const m = H.modal(mae ? 'Novo contêiner compartilhado' : 'Nova operação', `<div class="fields"><div class="f"><label class="lbl" for="no">Código</label><input id="no" value="${prox}"></div>
      <div class="f w2" ${mae ? 'hidden' : ''}><label class="lbl" for="nc">Cliente</label><input id="nc"></div><div class="f"><label class="lbl" for="nr">Responsável</label><input id="nr" value="${esc(H.nomeUsuario(H.userKey))}"></div>
      <div class="f w4"><label class="lbl" for="nn">Mercadoria / descrição</label><input id="nn"></div></div>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn pri" id="nok">Criar operação</button>');
    m.querySelector('#nok').onclick = () => {
      const id = m.querySelector('#no').value.trim().toUpperCase();
      if (!id) { H.toast('Informe o código'); return; }
      if (H.db.ops.some(o => o.id === id)) { H.toast('Já existe uma operação ' + esc(id)); return; }
      const agora = new Date().toISOString();
      /* mesmo checklist padrão do sistema atual, para a operação nascer completa */
      H.db.checklists[id] = (H.db.checklists[id] && H.db.checklists[id].length) ? H.db.checklists[id] : CHK_MODELO.map(([fase, titulo]) => ({ fase, titulo, status: 'pendente', coletadoPor: '', revisadoPor: '' }));
      H.db.ops.push({ _id: W.novoId(), id, nome: m.querySelector('#nn').value.trim(), cliente: m.querySelector('#nc').value.trim(), status: 'cotacao', resp: m.querySelector('#nr').value.trim(), prox: '', obs: '', criadaEm: agora, statusEm: agora, statusPor: H.nomeUsuario(H.userKey) });
      if (mae) { W.virarMae(H.db, id); abaFicha = 'conteiner'; }
      H.salvar(); H.fecharModal(); H.ir('ficha', id);
    };
  }
})();
