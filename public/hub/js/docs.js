/* Hub 2.0 — Documentos (GED): uma pasta por processo, com tipo, versão,
   quem enviou, quem conferiu (dupla conferência) e o que falta pela etapa.
   Registros são os mesmos `docs` do sistema atual, com campos novos
   (tipo, versao, conferencias, rejeitado, substituidoPor). */
(function () {
  const H = window.HUB, W = H.W, esc = H.esc;
  let pasta = null, filtroTipo = '', qDoc = '', soPendentes = false;
  const eu = () => H.nomeUsuario(H.userKey);
  const podeVer = d => !W.docTipoMeta(W.tipoDoc(d)).restrito || H.pode('fin.ver');
  const dataTxt = v => W.ehISO(v) ? W.dataBR(v) : (v || '—');
  const CHK_STATUS = { novo: 'coletado', meia: 'revisado', ok: 'aprovado' };

  H.telas.docs = function (el) {
    const db = H.db, docs = db.docs.filter(d => d && !d.removidoEm && podeVer(d));
    const ops = db.ops.filter(o => o && o.id).sort((a, b) => (W.ativa(b) - W.ativa(a)) || String(b.id).localeCompare(String(a.id), 'pt-BR', { numeric: true }));
    const porOp = {}; docs.forEach(d => { const k = d.op || 'Sem operação'; (porOp[k] = porOp[k] || []).push(d); });
    const pastas = ops.map(o => o.id).concat(porOp['Sem operação'] ? ['Sem operação'] : []).concat(Object.keys(porOp).filter(k => k !== 'Sem operação' && !ops.some(o => o.id === k)));
    if (!pasta || !pastas.includes(pasta)) pasta = (ops.find(W.ativa) || {}).id || pastas[0] || null;
    const o = ops.find(x => x.id === pasta);
    const q = qDoc.trim().toLowerCase();
    let lista = q ? docs.filter(d => [d.nome, d.op, d.cat, d.obs, d.por].join(' ').toLowerCase().includes(q)) : (porOp[pasta] || []);
    if (filtroTipo) lista = lista.filter(d => W.tipoDoc(d) === filtroTipo);
    if (soPendentes) lista = lista.filter(d => ['novo', 'meia', 'rejeitado', 'draft'].includes(W.situacaoDoc(d).k));
    if (!q) lista = lista.filter(d => !d.substituidoPor || filtroTipo);
    lista.sort((a, b) => W.DOC_TIPOS.findIndex(t => t.k === W.tipoDoc(a)) - W.DOC_TIPOS.findIndex(t => t.k === W.tipoDoc(b)) || String(b.dataUpload || b.data).localeCompare(String(a.dataUpload || a.data)));
    const comp = o ? W.completudeDocs(db, o) : null;
    const pendConf = docs.filter(d => ['novo', 'meia'].includes(W.situacaoDoc(d).k)).length;
    const contagem = k => (porOp[pasta] || []).filter(d => W.tipoDoc(d) === k && !d.substituidoPor).length;

    el.innerHTML = `
      <div class="head"><div><h1>Documentos</h1><p class="sub">Uma pasta por processo, com versão, quem enviou e quem conferiu. ${docs.length} arquivo(s) · ${pendConf} aguardando conferência.</p></div>
        <div class="btns"><button class="btn pri" data-enviar>+ Enviar arquivo</button></div></div>
      <div class="ged">
        <aside class="box ged-l"><input type="search" class="inp" id="dq" placeholder="Buscar em todos os processos" value="${esc(qDoc)}">
          ${pastas.map(p => { const op = ops.find(x => x.id === p), c = op ? W.completudeDocs(db, op) : null;
            return `<button class="ged-p ${p === pasta && !q ? 'on' : ''}" data-p="${esc(p)}"><span><b class="mono">${esc(p)}</b>${op ? `<small>${esc(op.cliente || '')}</small>` : ''}</span><span class="note">${(porOp[p] || []).filter(d => !d.substituidoPor).length}${c && c.faltam.length ? ` · <span class="neg">${c.faltam.length} falta</span>` : ''}</span></button>`; }).join('')}
        </aside>
        <section class="box ged-r">
          ${o && !q ? `<div class="box-h"><div><h2>${esc(o.id)} · ${esc(o.cliente || '')}</h2><small class="note">${esc(o.nome || '')} · ${esc(W.stMeta(o.status).l)}</small></div>
            <div class="btns">${comp && comp.exigidos ? `<span class="pill ${comp.faltam.length ? 'warn' : 'ok'}">${comp.pct}% dos documentos da etapa</span>` : ''}<button class="btn sm" data-op="${esc(o.id)}">Ficha</button></div></div>
            ${comp && comp.faltam.length ? `<div class="box-b note">Falta para a etapa atual: ${comp.faltam.map(t => `<button class="pill warn" data-falta="${t.k}">${esc(t.l)}</button>`).join(' ')}</div>` : ''}` : `<div class="box-h"><h2>${q ? 'Busca em todos os processos' : esc(pasta || '')}</h2></div>`}
          <div class="ged-tipos">${W.DOC_TIPOS.filter(t => !t.restrito || H.pode('fin.ver')).map(t => `<button class="chip ${filtroTipo === t.k ? 'on' : ''}" data-t="${t.k}">${esc(t.l)}${!q ? ` <span>${contagem(t.k)}</span>` : ''}</button>`).join('')}
            <label class="chip"><input type="checkbox" id="dpend" ${soPendentes ? 'checked' : ''} style="width:auto"> Só pendentes</label></div>
          ${lista.length ? `<div class="tw"><table><thead><tr><th>Arquivo</th>${q ? '<th>Processo</th>' : ''}<th>Tipo</th><th>Versão</th><th>Enviado</th><th>Conferido por</th><th>Situação</th><th></th></tr></thead><tbody>
            ${lista.map(d => { const s = W.situacaoDoc(d), conf = [...new Set((d.conferencias || []).map(x => x.por))];
              return `<tr><td><b>${esc(d.nome || '—')}</b>${d.obs ? `<br><small class="note">${esc(d.obs)}</small>` : ''}</td>${q ? `<td class="mono">${esc(d.op || '—')}</td>` : ''}<td>${esc(W.docTipoMeta(W.tipoDoc(d)).l)}</td>
                <td class="mono">${d.rascunho ? 'draft' : 'v' + (d.versao || 1)}</td><td class="note">${dataTxt(d.dataUpload || d.data)}${d.por || d.enviadoPor ? ' · ' + esc(d.por || d.enviadoPor) : ''}</td>
                <td>${esc(conf.join(' · ') || '—')}</td><td><span class="pill ${s.c}">${esc(s.l)}</span></td>
                <td class="num" style="white-space:nowrap">${d.link ? `<a class="btn sm" href="${esc(d.link)}" target="_blank" rel="noopener">Abrir</a>` : ''}${!d.substituidoPor ? `<button class="btn sm" data-conf="${esc(d._id)}">Conferir</button><button class="btn ghost sm" data-mais="${esc(d._id)}" aria-label="Mais ações">⋯</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`
            : '<p class="empty">Nenhum documento aqui. Use “+ Enviar arquivo”.</p>'}
          <p class="note box-b">Dupla conferência: duas pessoas diferentes de quem enviou, sendo pelo menos uma do Davi ou do Samir. Ao enviar Invoice, Packing list, BL ou DUIMP, o item do checklist da operação é marcado sozinho. Leitura automática por IA (itens, pesos, contêineres e lacres comparados com a cotação) entra com a chave da API do Claude.</p>
        </section></div>`;

    el.querySelector('[data-enviar]').onclick = () => enviar({ op: o && o.id });
    el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { pasta = b.dataset.p; qDoc = ''; filtroTipo = ''; H.render(); });
    el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { filtroTipo = filtroTipo === b.dataset.t ? '' : b.dataset.t; H.render(); });
    el.querySelectorAll('[data-falta]').forEach(b => b.onclick = () => enviar({ op: o && o.id, tipo: b.dataset.falta }));
    el.querySelectorAll('[data-op]').forEach(b => b.onclick = () => H.ir('ficha', b.dataset.op));
    el.querySelector('#dpend').onchange = e => { soPendentes = e.target.checked; H.render(); };
    el.querySelectorAll('[data-conf]').forEach(b => b.onclick = () => conferir(b.dataset.conf));
    el.querySelectorAll('[data-mais]').forEach(b => b.onclick = () => mais(b.dataset.mais));
    const dq = el.querySelector('#dq');
    dq.addEventListener('input', () => { qDoc = dq.value; clearTimeout(dq._t); dq._t = setTimeout(() => { H.render(); const n = document.querySelector('#dq'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); });
  };

  const doc = id => H.db.docs.find(d => d && d._id === id);

  function conferir(id) {
    const d = doc(id); if (!d) return H.render();
    const quem = eu();
    if ((d.por || d.enviadoPor) === quem) { H.toast('Quem enviou não confere o próprio documento.'); return; }
    const conf = d.conferencias || [];
    if (conf.some(c => c.por === quem)) { H.toast('Você já conferiu. Falta outra pessoa.'); return; }
    if (conf.length >= 1 && !H.pode('docs.revisar') && !conf.some(c => c.revisor)) { H.toast('A 2ª conferência é do Davi ou do Samir.'); return; }
    d.conferencias = conf.concat([{ por: quem, em: new Date().toISOString(), revisor: H.pode('docs.revisar') }]);
    delete d.rejeitado;
    const s = W.situacaoDoc(d);
    d.status = s.k === 'ok' ? 'aprovado' : 'revisado';
    espelharChecklist(d);
    H.salvar(); H.toast(s.k === 'ok' ? 'Dupla conferência concluída' : 'Conferido. Falta a 2ª conferência.'); H.render();
  }

  /* Documento do GED marca o item correspondente do checklist da operação. */
  function espelharChecklist(d) {
    const lista = H.db.checklists[d.op]; if (!Array.isArray(lista)) return;
    const t = W.docTipoMeta(W.tipoDoc(d)); if (!t.chk) return;
    const it = lista.find(x => x && t.chk.test(x.titulo || '') && x.status !== 'aprovado' && x.status !== 'na'); if (!it) return;
    const s = W.situacaoDoc(d), hoje = W.hojeISO();
    if (!it.link && d.link) it.link = d.link;
    if (it.status === 'pendente') { it.status = 'coletado'; it.coletadoPor = it.coletadoPor || d.por || eu(); it.coletadoEm = it.coletadoEm || hoje; }
    const confs = d.conferencias || [];
    if (s.k === 'ok' && confs.length) {
      const rev = (confs.find(c => c.revisor && c.por !== it.coletadoPor) || {}).por;
      if (rev) { it.status = 'aprovado'; it.revisadoPor = rev; it.revisadoEm = hoje; }
    }
  }

  function mais(id) {
    const d = doc(id); if (!d) return H.render();
    const m = H.modal(d.nome || 'Documento', `<div class="fields">
      <div class="f w2"><label class="lbl" for="mt">Tipo</label><select id="mt">${W.DOC_TIPOS.filter(t => !t.restrito || H.pode('fin.ver')).map(t => `<option value="${t.k}" ${W.tipoDoc(d) === t.k ? 'selected' : ''}>${esc(t.l)}</option>`).join('')}</select></div>
      <div class="f w2"><label class="lbl" for="mo">Observação</label><input id="mo" value="${esc(d.obs || '')}"></div>
      <div class="f w4"><label class="lbl"><input type="checkbox" id="mr" ${d.rascunho ? 'checked' : ''} style="width:auto"> É rascunho (draft): aguardando o original</label></div>
      <div class="f w4"><label class="lbl" for="mj">Rejeitar com motivo (vai para quem enviou corrigir)</label><input id="mj" placeholder="Ex.: peso bruto diverge da cotação" value="${esc(d.rejeitado ? d.rejeitado.motivo : '')}"></div></div>
      <p class="note" style="margin-top:8px">Histórico: enviado ${dataTxt(d.dataUpload || d.data)} por ${esc(d.por || d.enviadoPor || '—')}${(d.conferencias || []).map(c => ` · conferido por ${esc(c.por)} em ${W.dataBR(c.em)}`).join('')}.</p>`,
      `<button class="btn" id="mnv" style="margin-right:auto">Enviar nova versão</button><button class="btn" data-x>Cancelar</button><button class="btn blue" id="mok">Salvar</button>`);
    m.querySelector('#mnv').onclick = () => enviar({ op: d.op, tipo: W.tipoDoc(d), substitui: d._id, nome: d.nome });
    m.querySelector('#mok').onclick = () => {
      const a = doc(id); if (!a) { H.fecharModal(); return H.render(); }
      a.tipo = m.querySelector('#mt').value; a.cat = a.cat || W.docTipoMeta(a.tipo).l; a.obs = m.querySelector('#mo').value.trim(); a.rascunho = m.querySelector('#mr').checked;
      const mot = m.querySelector('#mj').value.trim();
      if (mot) { a.rejeitado = { motivo: mot, por: eu(), em: new Date().toISOString() }; a.conferencias = []; a.status = 'pendente'; } else delete a.rejeitado;
      H.salvar(); H.fecharModal(); H.toast(mot ? 'Documento rejeitado: o motivo fica registrado' : 'Documento atualizado'); H.render();
    };
  }

  function enviar(pre) {
    const p = pre || {}, ops = H.db.ops.filter(o => o && o.id).sort((a, b) => (W.ativa(b) - W.ativa(a)) || String(b.id).localeCompare(String(a.id), 'pt-BR', { numeric: true }));
    const m = H.modal(p.substitui ? 'Nova versão do documento' : 'Enviar arquivo', `<div class="fields">
      <div class="f w2"><label class="lbl" for="eop">Processo</label><select id="eop">${ops.map(o => `<option ${p.op === o.id ? 'selected' : ''}>${esc(o.id)}</option>`).join('')}<option value="" ${!p.op ? 'selected' : ''}>Sem operação</option></select></div>
      <div class="f w2"><label class="lbl" for="etp">Tipo</label><select id="etp">${W.DOC_TIPOS.filter(t => !t.restrito || H.pode('fin.ver')).map(t => `<option value="${t.k}" ${p.tipo === t.k ? 'selected' : ''}>${esc(t.l)}</option>`).join('')}</select></div>
      <div class="f w4"><label class="lbl" for="earq">Arquivo (PDF, imagem, planilha)</label><input id="earq" type="file"></div>
      <div class="f w4"><label class="lbl" for="elk">ou link (Drive, e-mail, armador)</label><input id="elk" type="url" placeholder="https://…"></div>
      <div class="f w2"><label class="lbl" for="enm">Nome</label><input id="enm" value="${esc(p.nome || '')}" placeholder="preenchido pelo arquivo"></div>
      <div class="f w2"><label class="lbl" for="eob">Observação</label><input id="eob"></div>
      <div class="f w4"><label class="lbl"><input type="checkbox" id="edr" style="width:auto"> É rascunho (ex.: BL draft)</label></div></div>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="eok">Enviar</button>');
    const arq = m.querySelector('#earq'), nm = m.querySelector('#enm');
    arq.onchange = () => { if (arq.files[0] && !nm.value) nm.value = arq.files[0].name; };
    m.querySelector('#eok').onclick = async () => {
      const b = m.querySelector('#eok'); const f = arq.files[0]; let link = m.querySelector('#elk').value.trim();
      if (!f && !link) { H.toast('Escolha um arquivo ou cole um link'); return; }
      if (f) {
        b.disabled = true; b.textContent = 'Enviando…';
        try {
          const fd = new FormData(); fd.append('arquivo', f);
          const r = await H.api('/api/upload', { method: 'POST', body: fd }); const j = await r.json().catch(() => ({}));
          if (!j.success) throw new Error(j.message || 'Falha no envio');
          link = j.finalUrl || j.supabaseUrl || j.localUrl;
        } catch (e) { b.disabled = false; b.textContent = 'Enviar'; H.toast('Não consegui enviar o arquivo: ' + esc(e.message) + '. Cole um link no lugar.'); return; }
      }
      const op = m.querySelector('#eop').value, tipo = m.querySelector('#etp').value, nome = nm.value.trim() || (f && f.name) || 'documento', agora = new Date().toISOString();
      const d = { _id: W.novoId(), op, tipo, grupo: ['invoice', 'packing', 'bl'].includes(tipo) ? 'embarque' : ['duimp', 'nfe'].includes(tipo) ? 'chegada' : W.docTipoMeta(tipo).restrito ? 'contratos' : 'outros',
        nome, cat: W.docTipoMeta(tipo).l, link, status: 'recebido', obs: m.querySelector('#eob').value.trim(), data: agora.slice(0, 10), dataUpload: agora, por: eu(),
        versao: W.proximaVersao(H.db, op, tipo, nome), rascunho: m.querySelector('#edr').checked, conferencias: [] };
      if (p.substitui) { const velho = doc(p.substitui); if (velho) { velho.substituidoPor = d._id; d.versao = (velho.versao || 1) + 1; } }
      H.db.docs.unshift(d); espelharChecklist(d);
      H.salvar(); H.fecharModal(); pasta = op || 'Sem operação'; H.toast(`${esc(nome)} enviado (v${d.versao})`); H.render();
    };
  }
  H.enviarDocumento = enviar;
})();
