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
        return `<tr class="click" data-op="${esc(o.id)}"><td class="mono"><b>${esc(o.id)}</b></td><td><div class="cli" title="${esc(o.cliente || '')}">${esc(o.cliente || '—')}</div><small class="note cli" style="display:block">${esc(o.nome || '')}</small></td>
        <td>${H.pillStatus(o.status)}</td><td>${H.semaforo(db, o)}</td><td class="mono">${W.dataBR(o.eta)}</td>${opt && opt.compacta ? '' : `<td>${esc(o.navio || '—')}</td>`}
        <td class="num">${pct == null ? '—' : pct + '%'}</td>${comFin ? `<td class="num">${r ? W.fmtBRL(r.saldoReceber) : '—'}</td><td class="num ${r && r.resultado < 0 ? 'neg' : ''}">${r ? W.fmtBRL(r.resultado) : '—'}</td>` : ''}
        <td>${esc(o.resp || '—')}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  }
  H.tabelaOps = tabelaOps;

  function ligar(el) {
    el.querySelectorAll('[data-op]').forEach(x => x.addEventListener('click', e => { e.stopPropagation(); H.ir('ficha', x.dataset.op); }));
    el.querySelectorAll('[data-a]').forEach(x => x.addEventListener('click', () => { const a = x.dataset.a; if (a === 'nova') novaOperacao(); else H.ir(a); }));
  }

  /* ================= LISTA DE OPERAÇÕES (ativas + histórico) ================= */
  let modoLista = 'ativas';
  H.telas.ops = function (el) {
    const db = H.db;
    const q = (H.buscaGlobal || '').trim().toLowerCase();
    let lista = db.ops.filter(o => o && o.id);
    if (!q) lista = lista.filter(o => modoLista === 'todas' ? true : modoLista === 'ativas' ? W.ativa(o) : !W.ativa(o));
    if (q) lista = lista.filter(o => [o.id, o.cliente, o.nome, o.navio, o.obs, o.tracking].join(' ').toLowerCase().includes(q));
    lista.sort((a, b) => String(b.id).localeCompare(String(a.id), 'pt-BR', { numeric: true }));
    el.innerHTML = `
      <div class="head"><div><h1>Operações</h1><p class="sub">Ativas e histórico completo. A busca procura em todas, inclusive as entregues.</p></div>
        <div class="btns"><button class="btn pri" data-a="nova">+ Nova operação</button></div></div>
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
    const r = H.pode('fin.resultado') ? W.resultadoPorOp(db, 'todas').find(x => x.op === o.id) : null;
    const abas = [['resumo', 'Resumo'], ['etapas', 'Etapas & histórico'], ['logistica', 'Logística & contêineres'], ['docs', `Documentos${pct != null ? ' · ' + pct + '%' : ''}`]];
    if (H.pode('fin.lancar')) abas.push(['fin', H.pode('fin.ver') ? 'Financeiro da operação' : 'Lançamentos da operação']);

    el.innerHTML = `
      <div class="head"><div><span class="lbl"><a href="#ops" data-voltar>Operações</a> · ${esc(o.id)}</span><h1>${esc(o.id)} · ${esc(o.cliente || '')}</h1>
        <p class="sub">${esc(o.nome || '')}${o.origemPorto || o.destinoPorto ? ' · ' + esc(o.origemPorto || '?') + ' → ' + esc(o.destinoPorto || '?') : ''}</p></div>
        <div class="btns">${H.pillStatus(o.status)} ${H.semaforo(db, o)} <button class="btn blue" data-acao="etapa">Mudar etapa</button></div></div>
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
    el.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => { abaFicha = b.dataset.aba; H.render(); });
    el.querySelector('[data-acao="etapa"]').onclick = () => mudarEtapa(o);
    if (!abas.find(a => a[0] === abaFicha)) abaFicha = 'resumo';
    ({ resumo: abaResumo, etapas: abaEtapas, logistica: abaLogistica, docs: abaDocs, fin: abaFin })[abaFicha](el.querySelector('#fichaAba'), o);
  };

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
  }

  function abaEtapas(box, o) {
    const hist = H.db.opStatusHist.filter(h => h && h.op === o.id).sort((a, b) => String(b.em).localeCompare(String(a.em)));
    box.innerHTML = `<div class="box"><div class="box-h"><h2>Linha do tempo das etapas</h2><span class="note">${hist.length} mudança(s) registrada(s)</span></div><div class="box-b tl">
      ${hist.length ? hist.map(h => `<div class="ev"><span class="when">${W.dataBR(h.em)}</span><span class="rail"><i></i></span><div class="what"><b>${esc(W.stMeta(h.de).l)} → ${esc(W.stMeta(h.para).l)}</b><small>${esc(h.por || '')}${h.motivo ? ' · ' + esc(h.motivo) : ''}${h.tipo && h.tipo !== 'mudanca' ? ' · ' + esc(h.tipo) : ''}</small></div></div>`).join('')
      : '<p class="empty">Nenhuma mudança registrada ainda.</p>'}</div></div>`;
  }

  function abaLogistica(box, o) {
    const cont = Array.isArray(o.containers) ? o.containers : [];
    box.innerHTML = `<div class="g2"><div class="box"><div class="box-h"><h2>Embarque</h2><button class="btn blue sm" data-salvar>Salvar</button></div><div class="box-b fields">
        ${campo(o, 'embarque', 'Embarque (ETD)', 'date')}${campo(o, 'eta', 'Chegada prevista (ETA)', 'date')}${campo(o, 'navio', 'Navio', 'text', { w: 'w2' })}
        ${campo(o, 'armador', 'Armador')}${campo(o, 'bl', 'BL')}${campo(o, 'tracking', 'Link de tracking do armador', 'url', { w: 'w2' })}
        ${campo(o, 'posAtual', 'Posição atual (texto)', 'text', { w: 'w4' })}
      </div></div>
      <div class="box"><div class="box-h"><h2>Contêineres</h2><button class="btn sm" data-addc>+ Contêiner</button></div>
        ${cont.length ? `<div class="tw"><table><thead><tr><th>Número</th><th>Tipo</th><th>Lacre</th><th></th></tr></thead><tbody>${cont.map((c, i) => `<tr><td class="mono">${esc(c.numero)}</td><td>${esc(c.tipo || '')}</td><td class="mono">${esc(c.lacre || '')}</td><td class="num"><button class="btn ghost sm" data-delc="${i}">Remover</button></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="empty">Nenhum contêiner cadastrado. O número do contêiner é o que liga o tracking automático.</p>'}
        <p class="box-b note">Tracking automático por contêiner (ShipsGo) entra na próxima etapa; até lá, a posição no mapa é estimada pelo embarque e ETA.</p></div></div>`;
    box.querySelector('[data-salvar]').onclick = () => salvarCampos(box, o);
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
    box.innerHTML = `<div class="g2">
      <div class="box"><div class="box-h"><h2>Checklist documental</h2><span class="note">${Array.isArray(chk) ? chk.length + ' itens' : 'sem checklist'}</span></div>
        ${Array.isArray(chk) && chk.length ? `<div class="tw"><table><thead><tr><th>Fase</th><th>Documento</th><th>Situação</th><th>Por</th></tr></thead><tbody>
        ${chk.map((it, i) => `<tr><td class="note">${esc(it.fase)}</td><td>${esc(it.titulo)}${it.link ? ` · <a href="${esc(it.link)}" target="_blank" rel="noopener">abrir</a>` : ''}</td>
          <td><select class="inp" data-chk="${i}">${CHK.filter(([k]) => H.pode('docs.revisar') || !['revisado', 'aprovado'].includes(k) || it.status === k).map(([k, l]) => `<option value="${k}" ${it.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
          <td class="note">${esc([it.coletadoPor, it.revisadoPor].filter(Boolean).join(' · '))}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="empty">Esta operação ainda não tem checklist.</p>'}</div>
      <div class="box"><div class="box-h"><h2>Arquivos da operação</h2><span class="note">${docs.length}</span></div><div class="box-b list">
        ${docs.length ? docs.map(d => `<div class="row"><div><b>${esc(d.nome)}</b><br><small class="note">${esc(d.grupo || d.cat || '')} · ${W.dataBR(d.data)} · ${esc(d.por || '')}</small></div>${d.link ? `<a class="btn sm" href="${esc(d.link)}" target="_blank" rel="noopener">Abrir</a>` : ''}</div>`).join('') : '<p class="empty">Nenhum arquivo.</p>'}
      </div></div></div>`;
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

  function abaFin(box, o) {
    const ls = H.db.fin.filter(l => l && l.op === o.id).sort((a, b) => W.vencDe(a).localeCompare(W.vencDe(b)));
    box.innerHTML = `<div class="box"><div class="box-h"><h2>Lançamentos da operação</h2><div class="btns"><button class="btn sm" data-novo>+ Lançamento</button></div></div>
      ${H.tabelaLanc ? H.tabelaLanc(ls) : ''}</div>`;
    box.querySelector('[data-novo]').onclick = () => H.editarLanc(null, { op: o.id });
    if (H.ligarLanc) H.ligarLanc(box);
  }

  function mudarEtapa(o) {
    const m = H.modal('Mudar etapa · ' + o.id, `<div class="fields"><div class="f w2"><label class="lbl" for="ne">Nova etapa</label><select id="ne">${W.STATUS_OP.map(s => `<option value="${s.k}" ${s.k === o.status ? 'selected' : ''}>${esc(s.l)}</option>`).join('')}</select></div>
      <div class="f w2"><label class="lbl" for="nm">Motivo / observação</label><input id="nm" placeholder="Ex.: navio confirmou atracação"></div></div>
      <p class="note" style="margin-top:10px">A mudança fica registrada na linha do tempo, com data e seu nome. O prazo da nova etapa começa a contar hoje.</p>`,
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

  H.novaOperacao = () => novaOperacao();
  function novaOperacao() {
    const nums = H.db.ops.map(o => parseInt(String(o.id).replace(/\D/g, ''), 10)).filter(n => isFinite(n));
    const prox = 'OP' + ((nums.length ? Math.max(...nums) : 0) + 1);
    const m = H.modal('Nova operação', `<div class="fields"><div class="f"><label class="lbl" for="no">Código</label><input id="no" value="${prox}"></div>
      <div class="f w2"><label class="lbl" for="nc">Cliente</label><input id="nc"></div><div class="f"><label class="lbl" for="nr">Responsável</label><input id="nr" value="${esc(H.nomeUsuario(H.userKey))}"></div>
      <div class="f w4"><label class="lbl" for="nn">Mercadoria / descrição</label><input id="nn"></div></div>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn pri" id="nok">Criar operação</button>');
    m.querySelector('#nok').onclick = () => {
      const id = m.querySelector('#no').value.trim().toUpperCase();
      if (!id) { H.toast('Informe o código'); return; }
      if (H.db.ops.some(o => o.id === id)) { H.toast('Já existe uma operação ' + esc(id)); return; }
      const agora = new Date().toISOString();
      /* mesmo checklist padrão do sistema atual, para a operação nascer completa */
      H.db.checklists[id] = H.db.checklists[id] || CHK_MODELO.map(([fase, titulo]) => ({ fase, titulo, status: 'pendente', coletadoPor: '', revisadoPor: '' }));
      H.db.ops.push({ _id: W.novoId(), id, nome: m.querySelector('#nn').value.trim(), cliente: m.querySelector('#nc').value.trim(), status: 'cotacao', resp: m.querySelector('#nr').value.trim(), prox: '', obs: '', criadaEm: agora, statusEm: agora, statusPor: H.nomeUsuario(H.userKey) });
      H.salvar(); H.fecharModal(); H.ir('ficha', id);
    };
  }
})();
