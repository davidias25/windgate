/* Hub 2.0 — Emissão de NF-e (Focus NFe).
   Davi e o contador montam, conferem e transmitem; o Samir acompanha. A nota é
   montada no servidor (o contador não recebe operações, cotações nem CRM) e
   toda mudança de situação vem do servidor: esta tela nunca grava hubNFe
   pelo H.salvar. */
(function () {
  const H = window.HUB, W = H.W, esc = H.esc;
  let ctx = null, carregando = false;
  const filtro = { empresa: 'todas', status: '', op: '' };
  const pill = (t, c) => `<span class="pill ${c || ''}">${esc(t)}</span>`;
  const stPill = s => { const m = W.STATUS_NFE[s] || [s || '—', '']; return pill(m[0], m[1]); };
  const empNome = e => e === 'JeT' ? 'JeT' : 'SF';
  const nota = id => (H.db.hubNFe || []).find(n => n && n._id === id);
  const quem = k => k ? H.nomeUsuario(k) : '—';
  const cenNome = k => ((ctx && ctx.cenarios || []).find(c => c.k === k) || { nome: k }).nome;
  const prod = () => ctx && ctx.ambiente === 'producao';
  const v = (m, s) => { const x = m.querySelector(s); return x ? (x.type === 'checkbox' ? x.checked : x.value.trim()) : ''; };

  async function post(url, corpo) {
    const r = await H.api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo || {}) });
    const j = await r.json().catch(() => ({}));
    if (j.nota) H.aplicarDoServidor('hubNFe', j.nota);
    return { ok: r.ok && j.success !== false, j, status: r.status };
  }
  async function carregarCtx() {
    carregando = true;
    try { const j = await (await H.api('/api/nfe/contexto')).json(); ctx = j.success ? j : { erro: j.message || 'Sem acesso.' }; }
    catch (e) { if (e.message !== '401') ctx = { erro: 'Não consegui falar com o servidor.' }; }
    carregando = false; H.render();
  }
  const faixaAmbiente = () => prod()
    ? '<div class="banner crit"><b>PRODUÇÃO</b> · as notas transmitidas daqui têm valor fiscal.</div>'
    : '<div class="banner"><b>HOMOLOGAÇÃO</b> · ambiente de teste da SEFAZ: nenhuma nota tem valor fiscal. O destinatário sai como "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO".</div>';

  /* ---------------- Lista ---------------- */
  H.telas.nfe = function (el, param) {
    if (!H.pode('nfe.ver')) { el.innerHTML = '<div class="banner">Esta área não faz parte do seu perfil.</div>'; return; }
    if (!ctx) { el.innerHTML = '<p class="empty">Carregando…</p>'; if (!carregando) carregarCtx(); return; }
    if (ctx.erro) { el.innerHTML = `<div class="banner">${esc(ctx.erro)}</div>`; return; }
    let abrir = null;
    if (param && String(param).startsWith('n:')) { abrir = String(param).slice(2); H.estado.param = null; }
    else if (param && param !== filtro.op) filtro.op = param;
    const todas = (H.db.hubNFe || []).filter(Boolean);
    const lista = todas.filter(n => (filtro.empresa === 'todas' || n.empresa === filtro.empresa) && (!filtro.status || n.status === filtro.status) && (!filtro.op || n.op === filtro.op))
      .sort((a, b) => String(b.criadaEm || '').localeCompare(String(a.criadaEm || '')));
    const cont = s => todas.filter(n => n.status === s).length, mes = W.hojeISO().slice(0, 7);
    const autMes = todas.filter(n => n.status === 'autorizada' && String(n.autorizadaEm || '').slice(0, 7) === mes);
    const aValidar = (ctx.cenarios || []).filter(c => !(c.conferido && c.conferido.em)).length;
    const ops = [...new Set(todas.map(n => n.op).filter(Boolean))].sort();
    el.innerHTML = `
      <div class="head"><div><h1>NF-e · emissão</h1><p class="sub">${ctx.podeEmitir ? 'Monte, confira e transmita. ' + (prod() && ctx.config.conferenciaCruzada !== false ? 'Em produção, quem monta não transmite: o outro emissor confere e envia.' : '') : 'Acompanhamento das notas emitidas pelo Davi e pelo contador.'}</p></div>
        <div class="btns"><div class="seg">${[['todas', 'SF + JeT'], ['WindGate', 'SF'], ['JeT', 'JeT']].map(([k, l]) => `<button data-emp="${k}" class="${filtro.empresa === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <select class="inp" id="nst" aria-label="Situação"><option value="">Todas as situações</option>${Object.entries(W.STATUS_NFE).map(([k, [l]]) => `<option value="${k}" ${filtro.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <select class="inp" id="nop" aria-label="Operação"><option value="">Todas as operações</option>${ops.concat(filtro.op && !ops.includes(filtro.op) ? [filtro.op] : []).map(o => `<option ${filtro.op === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>
          <button class="btn" id="ncen">Cenários fiscais${aValidar ? ` · ${aValidar} a validar` : ''}</button>
          ${H.perfil().id === 'operacoes' ? '<button class="btn" id="ncfg">Configuração</button>' : ''}
          ${ctx.podeEmitir ? '<button class="btn blue" id="nduimp">Importar DUIMP</button><button class="btn pri" id="nnova">+ Nova nota</button>' : ''}</div></div>
      ${faixaAmbiente()}
      ${!ctx.tokens.WindGate || !ctx.tokens.JeT ? `<div class="banner" style="margin-top:8px">Falta o token da Focus ${[!ctx.tokens.WindGate && 'da SF (FOCUS_NFE_TOKEN_SF)', !ctx.tokens.JeT && 'da JeT (FOCUS_NFE_TOKEN_JET)'].filter(Boolean).join(' e ')} no Render.</div>` : ''}
      <div class="kpis" style="margin-top:12px">
        <div class="kpi"><span class="lbl">Rascunho</span><span class="v">${cont('rascunho')}</span><span class="d">${todas.filter(n => n.status === 'rascunho' && (n.pendencias || []).length).length} com pendência</span></div>
        <div class="kpi"><span class="lbl">Conferidas</span><span class="v">${cont('conferida')}</span><span class="d">prontas para transmitir</span></div>
        <div class="kpi"><span class="lbl">Na SEFAZ</span><span class="v">${cont('enviada')}</span><span class="d">aguardando retorno</span></div>
        <div class="kpi"><span class="lbl">Autorizadas no mês</span><span class="v">${autMes.length}</span><span class="d">${W.fmtBRLk(autMes.reduce((a, n) => a + ((n.totais || {}).total || 0), 0))}</span></div>
        <div class="kpi"><span class="lbl">Rejeitadas</span><span class="v">${cont('rejeitada')}</span><span class="d ${cont('rejeitada') ? 'bad' : 'good'}">${cont('rejeitada') ? 'corrigir e reenviar' : 'nenhuma'}</span></div>
        <div class="kpi"><span class="lbl">Cenários</span><span class="v">${(ctx.cenarios || []).length - aValidar}/${(ctx.cenarios || []).length}</span><span class="d ${aValidar ? 'bad' : 'good'}">${aValidar ? 'conferidos pelo contador' : 'todos conferidos'}</span></div></div>
      <div class="box"><div class="box-h"><h2>Notas</h2><span class="note">${lista.length} de ${todas.length}</span></div>
        ${lista.length ? `<div class="tw"><table><thead><tr><th>Referência</th><th>Cenário</th><th>Operação</th><th>Destinatário</th><th class="num">Valor</th><th>Situação</th><th>Nº / série</th><th>Montou · transmitiu</th></tr></thead><tbody>
        ${lista.map(n => `<tr class="click" data-n="${esc(n._id)}"><td class="mono">${esc(n.ref)}<br><small class="note">${empNome(n.empresa)} · ${n.ambiente === 'producao' ? 'produção' : 'homologação'}</small></td>
          <td>${esc(n.cenario)} · ${esc(cenNome(n.cenario))}</td><td class="mono">${esc(n.op || '—')}</td><td>${esc((n.destinatario || {}).nome || '—')}</td>
          <td class="num">${W.fmtBRL((n.totais || {}).total || 0)}</td><td>${stPill(n.status)}${(n.pendencias || []).length && ['rascunho', 'rejeitada'].includes(n.status) ? ` ${pill((n.pendencias || []).length + ' pendência(s)', 'crit')}` : ''}</td>
          <td class="mono">${n.numero ? esc(n.numero) + ' / ' + esc(n.serie || '') : '—'}</td><td>${esc(quem(n.montadoPor))}${n.transmitidoPor ? ' · ' + esc(quem(n.transmitidoPor)) : ''}</td></tr>`).join('')}</tbody></table></div>`
        : `<p class="empty">Nenhuma nota${filtro.op || filtro.status || filtro.empresa !== 'todas' ? ' com esse filtro' : ' ainda'}.</p>`}</div>`;
    el.querySelectorAll('[data-emp]').forEach(b => b.onclick = () => { filtro.empresa = b.dataset.emp; H.render(); });
    el.querySelector('#nst').onchange = e => { filtro.status = e.target.value; H.render(); };
    el.querySelector('#nop').onchange = e => { filtro.op = e.target.value; H.estado.param = filtro.op || null; H.render(); };
    el.querySelectorAll('[data-n]').forEach(r => r.onclick = () => detalhe(r.dataset.n));
    const on = (s, fn) => { const x = el.querySelector(s); if (x) x.onclick = fn; };
    on('#nnova', () => nova()); on('#ncen', telaCenarios); on('#ncfg', telaConfig); on('#nduimp', () => importarDuimp(filtro.op));
    if (abrir) setTimeout(() => detalhe(abrir), 0);
  };

  /* ---------------- Nova nota ---------------- */
  /* Venda que nasce de uma nota já feita: a NF de entrada (venda da SF) ou a SF → JeT (venda da JeT ao cliente). */
  const ORIGEM_VENDA = { A: ['B', 'C', 'D', 'H'], D: ['E', 'F'] };
  function vendaSugerida(n) {
    const o = (ctx.ops || []).find(x => x.id === n.op) || {}, mod = String(o.modalidade || '').toLowerCase();
    if (n.cenario === 'D') return mod.includes('consumidor') || (o.contribuinte === false) ? 'F' : 'E';
    /* Venda direta (H) é o padrão: triangular (D) só quando a operação é triangular. */
    return mod.includes('conta e ordem') ? 'B' : mod.includes('encomenda') ? 'C' : o.triangular ? 'D' : 'H';
  }
  function nova(pre) {
    pre = pre || {};
    const cens = ctx.cenarios || [], autorizadas = (H.db.hubNFe || []).filter(n => n && n.status === 'autorizada');
    const origens = (H.db.hubNFe || []).filter(n => n && ORIGEM_VENDA[n.cenario] && n.status !== 'cancelada');
    const cenPre = pre.cenario || '';
    const m = H.modal(pre.origem ? 'NF de venda a partir da nota' : 'Nova NF-e', `${faixaAmbiente()}
      <div class="fields" style="margin-top:10px"><div class="f w2"><label class="lbl" for="ncn">Cenário fiscal</label><select id="ncn">${cens.map(c => `<option value="${c.k}" ${c.k === cenPre ? 'selected' : ''}>${c.k} · ${esc(c.nome)}${c.conferido && c.conferido.em ? '' : ' (a validar)'}</option>`).join('')}</select></div>
        <div class="f w2" id="ngori"><label class="lbl" for="nno">A partir da nota (itens e quantidades)</label><select id="nno"><option value="">— da cotação da operação —</option>${origens.map(n => `<option value="${esc(n._id)}" data-op="${esc(n.op || '')}" data-cen="${esc(n.cenario)}" ${pre.origem === n._id ? 'selected' : ''}>${esc(n.cenario === 'A' ? 'Entrada' : 'SF → JeT')} · ${esc(n.ref)}${n.numero ? ' · nº ' + esc(n.numero) : ''} · ${esc(n.op || '')}</option>`).join('')}</select></div>
        <div class="f w2"><label class="lbl" for="nco">Operação</label><select id="nco"><option value="">—</option>${(ctx.ops || []).map(o => `<option value="${esc(o.id)}" ${(pre.op || filtro.op) === o.id ? 'selected' : ''}>${esc(o.id)} · ${esc(o.cliente)}${o.modalidade ? ' · ' + esc(o.modalidade) : ''}</option>`).join('')}</select></div>
        <div class="f w2" id="ngref" hidden><label class="lbl" for="ncr">Nota original</label><select id="ncr"><option value="">—</option>${autorizadas.map(n => `<option value="${esc(n._id)}">${esc(n.ref)} · nº ${esc(n.numero || '')} · ${esc((n.destinatario || {}).nome || '')}</option>`).join('')}</select></div>
        <div class="f" id="ngfin" hidden><label class="lbl" for="ncf">Finalidade</label><select id="ncf"><option value="2">Complementar</option><option value="3">Ajuste</option><option value="4">Devolução</option></select></div></div>
      <p class="note" id="ncobs" style="margin-top:8px"></p>
      <p class="note">O sistema preenche itens, destinatário e DUIMP com o que há na operação, na cotação, no Catálogo de NCM e no CRM. Você corrige o que faltar na tela seguinte.</p>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn pri" id="ncok">Montar nota</button>');
    const atual = () => { const c = cens.find(x => x.k === v(m, '#ncn')) || {}; m.querySelector('#ngref').hidden = m.querySelector('#ngfin').hidden = c.k !== 'G';
      m.querySelector('#ngori').hidden = !['B', 'C', 'D', 'E', 'F', 'H'].includes(c.k);
      const so = m.querySelector('#nno').selectedOptions[0], cenOri = so && so.dataset.cen;
      const fora = cenOri && !(ORIGEM_VENDA[cenOri] || []).includes(c.k) ? `<br><b>Atenção:</b> a partir de ${cenOri === 'A' ? 'uma NF de entrada' : 'uma NF SF → JeT'}, o normal é ${(ORIGEM_VENDA[cenOri] || []).join(', ')}.` : '';
      m.querySelector('#ncobs').innerHTML = (c.k === 'A' ? '<b>A NF de entrada nasce da DUIMP.</b> Use <b>Importar DUIMP</b>: o rascunho é criado sozinho, com itens, valores e tributos federais da DUIMP. Aqui só se abre a nota de uma DUIMP já importada.' : esc(c.obs || '')) + fora; };
    m.querySelector('#ncn').onchange = atual;
    m.querySelector('#nno').onchange = () => { const so = m.querySelector('#nno').selectedOptions[0]; if (so && so.dataset.op) m.querySelector('#nco').value = so.dataset.op; atual(); };
    atual();
    m.querySelector('#ncok').onclick = async () => {
      const b = m.querySelector('#ncok'); b.disabled = true; b.textContent = 'Montando…';
      const k = v(m, '#ncn'), corpo = { cenario: k, opId: v(m, '#nco') };
      if (['B', 'C', 'D', 'E', 'F', 'H'].includes(k) && v(m, '#nno')) corpo.origemNota = v(m, '#nno');
      if (k === 'G') corpo.extras = { referencia: v(m, '#ncr'), finalidade: +v(m, '#ncf') };
      const r = await post('/api/nfe/montar', corpo).catch(() => ({ ok: false, j: {} }));
      if (!r.ok) { b.disabled = false; b.textContent = 'Montar nota'; return H.toast(esc(r.j.message || 'Não consegui montar.')); }
      H.fecharModal(); H.render(); detalhe(r.j.nota._id);
    };
  }

  /* ---------------- Detalhe ---------------- */
  function detalhe(id) {
    const n = nota(id); if (!n) return H.toast('Nota não encontrada.');
    const pode = a => W.podeAcao(H.db, H.userKey, n, a, ctx.ambiente), py = n.payload || {}, its = py.items || [], t = n.totais || {};
    const di = (its[0] && its[0].documentos_importacao && its[0].documentos_importacao[0]) || null;
    // Por que o próximo passo não aparece (pendência, conferência cruzada, ambiente).
    const prox = n.status === 'rascunho' ? pode('conferir') : n.status === 'conferida' ? pode('transmitir') : null;
    const motivo = ctx.podeEmitir && prox && !prox.ok ? prox : null;
    const dif = its.some(x => x.icms_valor_uf_destino != null);
    const m = H.modal(`NF-e ${n.ref}`, `${faixaAmbiente()}
      <div class="fields" style="margin-top:10px">
        <div class="f"><span class="lbl">Situação</span><span class="ro">${stPill(n.status)}</span></div>
        <div class="f w2"><span class="lbl">Cenário</span><span class="ro">${esc(n.cenario)} · ${esc(cenNome(n.cenario))} · ${empNome(n.empresa)}</span></div>
        <div class="f"><span class="lbl">Operação</span><span class="ro mono">${esc(n.op || '—')}</span></div>
        <div class="f w2"><span class="lbl">Destinatário</span><span class="ro">${esc((n.destinatario || {}).nome || '—')} <span class="mono note">${esc((n.destinatario || {}).cnpj || '')} ${esc((n.destinatario || {}).uf || '')}</span></span></div>
        <div class="f"><span class="lbl">CFOP · natureza</span><span class="ro">${esc((its[0] || {}).cfop || '—')} · ${esc(py.natureza_operacao || '')}</span></div>
        <div class="f"><span class="lbl">Total da nota</span><span class="ro"><b>${W.fmtBRL(t.total || 0)}</b></span></div>
        ${n.chave ? `<div class="f w4"><span class="lbl">Chave · nº/série · protocolo</span><span class="ro mono">${esc(n.chave)} · ${esc(n.numero)}/${esc(n.serie)} · ${esc(n.protocolo || '')}</span></div>` : ''}
        <div class="f w4"><span class="lbl">Quem</span><span class="ro">montou ${esc(quem(n.montadoPor))}${n.conferidoPor ? ' · conferiu ' + esc(quem(n.conferidoPor)) : ''}${n.transmitidoPor ? ' · transmitiu ' + esc(quem(n.transmitidoPor)) : ''}</span></div></div>
      ${n.mensagemSefaz ? `<div class="banner ${n.status === 'rejeitada' ? 'crit' : n.status === 'autorizada' ? 'ok' : ''}" style="margin-top:10px"><b>SEFAZ${n.statusSefaz ? ' ' + esc(n.statusSefaz) : ''}:</b> ${esc(n.mensagemSefaz)}</div>` : ''}
      ${(n.pendencias || []).length ? `<h3 class="h3" style="margin-top:12px">Pendências · a nota não transmite enquanto houver</h3><div class="list pend">${n.pendencias.map(p => `<div class="row"><span>${esc(p.msg)}</span><span class="mono note">${esc(p.campo)}</span></div>`).join('')}</div>` : ''}
      ${(n.avisos || []).length ? `<h3 class="h3" style="margin-top:12px">Avisos</h3><div class="list">${n.avisos.map(a => `<div class="row"><span class="note">${esc(a)}</span></div>`).join('')}</div>` : ''}
      <h3 class="h3" style="margin-top:12px">Itens</h3>
      <div class="tw"><table><thead><tr><th>#</th><th>Descrição</th><th>NCM</th><th>CFOP</th><th class="num">Qtd</th><th class="num">Valor</th>${py.tipo_documento === 0 ? '<th class="num">II</th>' : ''}<th class="num">IPI</th><th class="num">ICMS</th>${dif ? '<th class="num">DIFAL</th>' : ''}<th>PIS/COFINS</th>${py.tipo_documento === 0 ? '<th class="num">Outras</th>' : ''}</tr></thead><tbody>
        ${its.map(x => `<tr><td>${x.numero_item}</td><td>${esc(x.descricao)}</td><td class="mono">${esc(x.codigo_ncm)}</td><td class="mono">${esc(x.cfop)}</td><td class="num">${x.quantidade_comercial}</td><td class="num">${W.fmtBRL(x.valor_bruto)}</td>
          ${py.tipo_documento === 0 ? `<td class="num">${W.fmtBRL(x.ii_valor || 0)}</td>` : ''}<td class="num">${x.ipi_valor != null ? W.fmtBRL(x.ipi_valor) : `<span class="note">CST ${esc(x.ipi_situacao_tributaria || '—')}</span>`}</td>
          <td class="num">${x.icms_valor != null ? `${W.fmtBRL(x.icms_valor)}<br><small class="note">${x.icms_aliquota}% s/ ${W.fmtBRL(x.icms_base_calculo)}</small>` : `<span class="note">CST ${esc(x.icms_situacao_tributaria)}</span>`}</td>
          ${dif ? `<td class="num">${x.icms_valor_uf_destino != null ? `${W.fmtBRL(x.icms_valor_uf_destino)}<br><small class="note">${x.icms_aliquota_interna_uf_destino}% s/ ${W.fmtBRL(x.icms_base_calculo_uf_destino)}</small>` : '—'}</td>` : ''}
          <td>CST ${esc(x.pis_situacao_tributaria)}${x.pis_valor != null ? ` · ${W.fmtBRL((x.pis_valor || 0) + (x.cofins_valor || 0))}` : ''}</td>${py.tipo_documento === 0 ? `<td class="num">${W.fmtBRL(x.valor_outras_despesas || 0)}</td>` : ''}</tr>`).join('')}</tbody></table></div>
      <table class="mini" style="margin-top:8px"><tbody><tr><td>Produtos</td><td class="num">${W.fmtBRL(t.produtos || 0)}</td>${t.frete ? `<td>Frete</td><td class="num">${W.fmtBRL(t.frete)}</td>` : ''}${t.seguro ? `<td>Seguro</td><td class="num">${W.fmtBRL(t.seguro)}</td>` : ''}<td>IPI</td><td class="num">${W.fmtBRL(t.ipi || 0)}</td><td>ICMS</td><td class="num">${W.fmtBRL(t.icms || 0)}</td>${t.ii ? `<td>II</td><td class="num">${W.fmtBRL(t.ii)}</td>` : ''}${t.difal ? `<td>DIFAL</td><td class="num">${W.fmtBRL(t.difal)}</td>` : ''}<td><b>Total</b></td><td class="num"><b>${W.fmtBRL(t.total || 0)}</b></td></tr></tbody></table>
      ${n.duimp && n.duimp.numero ? `<div class="banner" style="margin-top:10px">Nota gerada da <b>DUIMP ${esc(n.duimp.numero)} · versão ${esc(n.duimp.versao)}</b>${(n.ops || []).length > 1 ? ' · operações ' + esc(n.ops.join(', ')) : ''}. Itens, quantidades, valores, tributos federais, exportador e dados da declaração vêm da DUIMP e não se editam. <button class="btn sm" id="dDu">Ver DUIMP</button></div>` : ''}
      ${di ? `<h3 class="h3" style="margin-top:12px">DUIMP</h3><p class="note mono">${esc(di.numero || '—')} · registro ${W.dataBR(di.data_registro)} · ${esc(di.local_desembaraco_aduaneiro || '')}/${esc(di.uf_desembaraco_aduaneiro || '')} · desembaraço ${W.dataBR(di.data_desembaraco_aduaneiro)} · intermediação ${di.forma_intermedio}${di.cnpj ? ' · terceiro ' + esc(di.cnpj) + '/' + esc(di.uf_terceiro || '') : ''}</p>` : ''}
      ${py.informacoes_adicionais_contribuinte ? `<h3 class="h3" style="margin-top:12px">Informações complementares</h3><p class="note">${esc(py.informacoes_adicionais_contribuinte)}</p>` : ''}
      ${(n.cartas || []).length ? `<h3 class="h3" style="margin-top:12px">Cartas de correção</h3><div class="list">${n.cartas.map(c => `<div class="row"><div><b>CC-e ${c.numero}</b> · ${W.dataBR(c.em)} · ${esc(quem(c.por))}<br><small class="note">${esc(c.correcao)}</small></div><div class="btns">${c.pdfLink ? `<a class="btn ghost sm" href="${esc(c.pdfLink)}" target="_blank" rel="noopener">PDF</a>` : ''}${c.xmlLink ? `<a class="btn ghost sm" href="${esc(c.xmlLink)}" target="_blank" rel="noopener">XML</a>` : ''}</div></div>`).join('')}</div>` : ''}
      <h3 class="h3" style="margin-top:12px">Histórico</h3><div class="list">${(n.historico || []).slice().reverse().map(h => `<div class="row"><span><b>${esc(h.acao)}</b>${h.de ? ` · ${esc(h.de)} → ${esc(h.para)}` : ''} · ${esc(quem(h.por) || h.por)}${h.msg ? `<br><small class="note">${esc(h.msg)}</small>` : ''}</span><span class="note mono">${esc(String(h.em || '').slice(0, 16).replace('T', ' '))}</span></div>`).join('')}</div>
      ${motivo ? `<p class="note" style="margin-top:10px">${esc(motivo.msg)}</p>` : ''}`,
      `<button class="btn" data-x>Fechar</button>
       ${n.xmlLink ? `<a class="btn ghost" href="${esc(n.xmlLink)}" target="_blank" rel="noopener">XML</a>` : ''}${n.danfeLink ? `<a class="btn ghost" href="${esc(n.danfeLink)}" target="_blank" rel="noopener">DANFE</a>` : ''}
       ${pode('montar').ok ? '<button class="btn" id="dEd">Corrigir dados</button>' : ''}
       ${ctx.podeEmitir && ORIGEM_VENDA[n.cenario] && n.status !== 'cancelada' ? '<button class="btn blue" id="dVd">Gerar NF de venda</button>' : ''}
       ${ctx.podeEmitir && n.payload && ['rascunho', 'conferida', 'rejeitada'].includes(n.status) ? '<button class="btn" id="dPv">Prévia do DANFE</button>' : ''}
       ${['enviada', 'autorizada'].includes(n.status) ? '<button class="btn" id="dSt">Atualizar situação</button>' : ''}
       ${pode('carta').ok ? '<button class="btn" id="dEm">Enviar por e-mail</button><button class="btn" id="dCc">Carta de correção</button><button class="btn" id="dCa">Cancelar nota</button>' : ''}
       ${pode('conferir').ok ? '<button class="btn blue" id="dCf">Conferir</button>' : ''}
       ${pode('transmitir').ok ? `<button class="btn pri" id="dTx">Transmitir (${prod() ? 'PRODUÇÃO' : 'homologação'})</button>` : ''}`);
    m.querySelector('.modal').classList.add('larga');
    const on = (s, fn) => { const x = m.querySelector(s); if (x) x.onclick = fn; };
    const acao = async (url, corpo, okMsg, botao) => {
      if (botao) { botao.disabled = true; botao.dataset.t = botao.textContent; botao.textContent = 'Aguarde…'; }
      const r = await post(url, corpo).catch(() => ({ ok: false, j: { message: 'Sem conexão com o servidor.' } }));
      if (botao) { botao.disabled = false; botao.textContent = botao.dataset.t; }
      H.toast(esc(r.ok ? (typeof okMsg === 'function' ? okMsg(r.j.nota) : okMsg) : (r.j.message || 'Não deu certo.')));
      H.fecharModal(); H.render(); if (r.j.nota || r.ok) detalhe(id);
    };
    on('#dEd', () => n.cenario === 'A' && n.duimp ? editarEntrada(n) : editar(n));
    on('#dDu', () => verDuimp(n.duimp.numero));
    on('#dVd', () => { H.fecharModal(); nova({ origem: n._id, op: n.op, cenario: vendaSugerida(n) }); });
    on('#dCf', e => acao(`/api/nfe/${n._id}/conferir`, {}, 'Nota conferida.', e.target));
    on('#dTx', () => {
      const c = H.modal('Transmitir à SEFAZ', `${faixaAmbiente()}<p style="margin-top:10px">Transmitir a nota <b class="mono">${esc(n.ref)}</b> de ${W.fmtBRL(t.total || 0)} para ${esc((n.destinatario || {}).nome || '')}?</p><p class="note">A referência é única: transmitir de novo só consulta a situação, nunca emite outra nota.</p>`,
        '<button class="btn" data-x>Voltar</button><button class="btn pri" id="txok">Transmitir</button>');
      c.querySelector('#txok').onclick = e => acao(`/api/nfe/${n._id}/transmitir`, {}, x => x ? `Situação: ${(W.STATUS_NFE[x.status] || [x.status])[0]}${x.mensagemSefaz ? ' · ' + x.mensagemSefaz : ''}` : 'Enviada.', e.target);
    });
    on('#dSt', async e => { e.target.disabled = true; try { const j = await (await H.api(`/api/nfe/${n._id}/status`)).json(); if (j.nota) H.aplicarDoServidor('hubNFe', j.nota); H.toast(esc(j.success ? 'Situação: ' + (W.STATUS_NFE[j.nota.status] || [j.nota.status])[0] : j.message || 'Não consegui consultar.')); } catch (x) { H.toast('Não consegui consultar.'); } H.fecharModal(); H.render(); detalhe(id); });
    on('#dPv', async e => {
      const b = e.target; b.disabled = true; b.textContent = 'Gerando…';
      try {
        const r = await H.api(`/api/nfe/${n._id}/previa`, { method: 'POST' });
        if ((r.headers.get('content-type') || '').includes('pdf')) window.open(URL.createObjectURL(await r.blob()), '_blank');
        else { const j = await r.json().catch(() => ({})); H.toast(esc(j.message || 'A Focus não gerou a prévia.')); }
      } catch (x) { H.toast('Não consegui gerar a prévia.'); }
      b.disabled = false; b.textContent = 'Prévia do DANFE';
    });
    const texto = (titulo, rotulo, min, max, url, campo, okMsg, aviso) => {
      const c = H.modal(titulo, `${aviso ? `<p class="note" style="margin-bottom:8px">${aviso}</p>` : ''}<div class="fields"><div class="f w4"><label class="lbl" for="tx1">${rotulo} (${min} a ${max} caracteres)</label><textarea id="tx1" rows="4" maxlength="${max}"></textarea><small class="note" id="txn">0</small></div></div>`,
        '<button class="btn" data-x>Voltar</button><button class="btn pri" id="txk" disabled>Enviar</button>');
      const ta = c.querySelector('#tx1'), bt = c.querySelector('#txk');
      ta.oninput = () => { const l = ta.value.trim().length; c.querySelector('#txn').textContent = l; bt.disabled = l < min || l > max; };
      bt.onclick = e => acao(url, { [campo]: ta.value.trim() }, okMsg, e.target);
    };
    on('#dCa', () => texto('Cancelar NF-e', 'Justificativa', 15, 255, `/api/nfe/${n._id}/cancelar`, 'justificativa', 'Nota cancelada na SEFAZ.', `Prazo: ${(ctx.config || {}).prazoCancelamentoHoras || 24} h depois da autorização. Depois disso, fale com o contador.`));
    on('#dCc', () => texto('Carta de correção', 'Correção', 15, 1000, `/api/nfe/${n._id}/carta-correcao`, 'correcao', 'Carta de correção registrada.', 'Não corrige valores, impostos, CNPJ, quantidade nem data. Vale sempre a última carta.'));
    on('#dEm', () => {
      const c = H.modal('Enviar NF-e por e-mail', `<div class="fields"><div class="f w4"><label class="lbl" for="em1">E-mails (separados por vírgula, até 10)</label><input id="em1" value="${esc(((n.entrada || {}).destinatario || {}).email || '')}"></div></div>`, '<button class="btn" data-x>Voltar</button><button class="btn pri" id="emk">Enviar</button>');
      c.querySelector('#emk').onclick = e => acao(`/api/nfe/${n._id}/email`, { emails: v(c, '#em1').split(/[,;\s]+/).filter(Boolean) }, 'E-mail agendado pela Focus.', e.target);
    });
  }

  /* ---------------- DUIMP ---------------- */
  /* Importa a DUIMP do Portal Único: grava o retrato na operação e cria (ou remonta) a NF de entrada. */
  function importarDuimp(opPreset) {
    const ops = (ctx && ctx.ops) || (H.db.ops || []).filter(o => o && o.id).map(o => ({ id: o.id, cliente: o.cliente || '', duimp: o.duimp || '' }));
    const op0 = ops.find(o => o.id === opPreset) || ops.find(o => o.duimp) || ops[0] || {};
    const m = H.modal('Importar DUIMP', `<p class="note" style="margin-bottom:10px">Consulta a DUIMP no Portal Único (só leitura: nada é registrado) pela versão vigente, com itens, tributos federais e o exportador do Catálogo. Em seguida a NF de entrada é montada sozinha.</p>
      <div class="fields"><div class="f w2"><label class="lbl" for="du_op">Operação</label><select id="du_op">${ops.map(o => `<option value="${esc(o.id)}" data-du="${esc(o.duimp || '')}" ${o.id === op0.id ? 'selected' : ''}>${esc(o.id)} · ${esc(o.cliente || '')}${o.duimp ? ' · DUIMP ' + esc(o.duimp) : ''}</option>`).join('')}</select></div>
      <div class="f w2"><label class="lbl" for="du_num">Número da DUIMP</label><input id="du_num" class="mono" value="${esc(op0.duimp || '')}" placeholder="26BR0000012345-6"></div></div>
      <p class="note" style="margin-top:8px">Se a mesma DUIMP serve a mais de uma operação, cadastre o número em cada uma; depois de importar, cada item é atribuído à sua operação.</p>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn pri" id="du_ok">Importar</button>');
    m.querySelector('#du_op').onchange = e => { const o = e.target.selectedOptions[0]; if (o && o.dataset.du) m.querySelector('#du_num').value = o.dataset.du; };
    m.querySelector('#du_ok').onclick = async ev => {
      ev.target.disabled = true; ev.target.textContent = 'Consultando o Portal…';
      const r = await post('/api/duimp/' + encodeURIComponent(v(m, '#du_op')) + '/importar', { numero: v(m, '#du_num') }).catch(() => ({ ok: false, j: { message: 'Sem conexão.' } }));
      if (!r.ok) { ev.target.disabled = false; ev.target.textContent = 'Importar'; return H.toast(esc(r.j.message || 'Não deu para importar.')); }
      H.fecharModal(); H.render();
      const j = r.j;
      const rm = H.modal('DUIMP importada', `<p><b class="mono">${esc(j.numero)}</b> · versão <b>${esc(j.versao)}</b> · ${j.itens} item(ns) · ${esc((j.ops || []).join(', '))}</p>
        ${j.aviso ? `<div class="banner" style="margin-top:8px"><b>${esc(j.aviso)}</b>${(j.diferencas || []).length ? '<br>' + j.diferencas.map(esc).join('<br>') : ''}</div>` : ''}
        ${j.semOp ? `<div class="banner crit" style="margin-top:8px">${j.semOp} item(ns) sem operação: a DUIMP serve a mais de uma operação. Atribua cada item antes de conferir a nota.</div>` : ''}
        ${j.notaIntocada ? `<div class="banner" style="margin-top:8px">${esc(j.notaIntocada)}</div>` : ''}
        ${(j.conferencia || []).length ? `<h3 class="h3" style="margin-top:10px">DUIMP × cotação (avisos)</h3><div class="list">${j.conferencia.map(a => `<div class="row"><span class="note">${esc(a)}</span></div>`).join('')}</div>` : '<p class="note" style="margin-top:8px">DUIMP e cotação batem (diferenças até 1%).</p>'}`,
        `<button class="btn" data-x>Fechar</button><button class="btn" id="dr_ver">Ver DUIMP e itens</button>${j.nota ? '<button class="btn pri" id="dr_nota">Abrir a NF de entrada</button>' : ''}`);
      rm.querySelector('#dr_ver').onclick = () => { H.fecharModal(); verDuimp(j.numero); };
      const bn = rm.querySelector('#dr_nota'); if (bn) bn.onclick = () => { H.fecharModal(); H.ir('nfe', 'n:' + j.nota._id); };
    };
  }
  H.nfeImportarDuimp = importarDuimp;

  /* Retrato da DUIMP: itens com tributos, atribuição de cada item à operação e conferência contra a cotação. */
  async function verDuimp(numero) {
    let j; try { j = await (await H.api('/api/duimp/' + encodeURIComponent(numero))).json(); } catch (e) { return H.toast('Não consegui abrir a DUIMP.'); }
    if (!j.success) return H.toast(esc(j.message || 'DUIMP não importada.'));
    const r = j.retrato, g = r.geral, varias = (j.ops || []).length > 1, emite = !!(ctx && ctx.podeEmitir) || H.pode('nfe.emitir');
    const t = (it, k) => { const x = (it.tributos || {})[k]; return x ? W.fmtBRL(x.devido != null ? x.devido : x.aRecolher || 0) : '—'; };
    const m = H.modal(`DUIMP ${g.numero} · versão ${r.versao}`, `<div class="fields">
        <div class="f"><span class="lbl">Registro</span><span class="ro">${W.dataBR(String(g.dataRegistro || '').slice(0, 10))}</span></div><div class="f"><span class="lbl">Situação · canal</span><span class="ro">${esc(g.situacao || '—')} · ${esc(g.canal || '—')}</span></div>
        <div class="f"><span class="lbl">Unidade de despacho</span><span class="ro mono">${esc(g.unidadeDespacho || '—')}</span></div><div class="f"><span class="lbl">Carga</span><span class="ro">${esc(g.tipoIdentificacaoCarga || '')} ${esc(g.identificacaoCarga || '')}</span></div>
        <div class="f"><span class="lbl">Câmbio</span><span class="ro">${g.taxaCambio ? g.taxaCambio.toFixed(4) + ' ' + esc(g.moeda || '') : '—'}</span></div><div class="f"><span class="lbl">Siscomex · AFRMM</span><span class="ro">${W.fmtBRL(g.taxaSiscomex || 0)} · ${W.fmtBRL(g.afrmm || 0)}</span></div>
        <div class="f w2"><span class="lbl">Consultada</span><span class="ro">${W.dataBR(String(r.consultadoEm || '').slice(0, 10))}${r.consultadoPor ? ' por ' + esc(H.nomeUsuario(r.consultadoPor)) : ''}</span></div></div>
      <div class="tw" style="margin-top:10px"><table><thead><tr><th>#</th><th>NCM</th><th>Descrição</th><th class="num">Qtd</th><th class="num">Aduaneiro</th><th class="num">II</th><th class="num">IPI</th><th class="num">PIS</th><th class="num">COFINS</th><th>Exportador</th>${varias ? '<th>Operação</th>' : ''}</tr></thead><tbody>
        ${(r.itens || []).map(it => `<tr><td>${it.numero}</td><td class="mono">${esc(it.ncm)}</td><td>${esc(it.descricao)}</td><td class="num">${it.quantidade} ${esc(it.unidadeComercial || '')}</td><td class="num">${W.fmtBRL(it.valorAduaneiroBRL || 0)}</td>
          <td class="num">${t(it, 'ii')}</td><td class="num">${t(it, 'ipi')}</td><td class="num">${t(it, 'pis')}</td><td class="num">${t(it, 'cofins')}</td><td>${esc((it.exportador && (it.exportador.nome || it.exportador.codigo)) || '—')}</td>
          ${varias ? `<td>${emite ? `<select class="inp" data-item="${it.numero}"><option value="">— escolher —</option>${j.ops.map(o => `<option ${it.op === o.id ? 'selected' : ''}>${esc(o.id)}</option>`).join('')}</select>` : esc(it.op || '—')}</td>` : ''}</tr>`).join('')}</tbody></table></div>
      ${(j.conferencia || []).length ? `<h3 class="h3" style="margin-top:10px">DUIMP × cotação (avisos)</h3><div class="list">${j.conferencia.map(a => `<div class="row"><span class="note">${esc(a)}</span></div>`).join('')}</div>` : ''}
      ${(r.historicoVersoes || []).length ? `<h3 class="h3" style="margin-top:10px">Versões anteriores</h3><div class="list">${r.historicoVersoes.map(h => `<div class="row"><span>versão ${esc(h.versao)} · ${W.dataBR(String(h.consultadoEm || '').slice(0, 10))}<br><small class="note">${(h.diferencas || []).map(esc).join(' · ')}</small></span></div>`).join('')}</div>` : ''}`,
      `<button class="btn" data-x>Fechar</button>${emite ? '<button class="btn" id="vd_re">Reimportar</button>' : ''}${emite && varias ? '<button class="btn blue" id="vd_at">Salvar atribuição</button>' : ''}${j.nota ? '<button class="btn pri" id="vd_nota">Abrir a NF de entrada</button>' : ''}`);
    m.querySelector('.modal').classList.add('larga');
    const on = (s, fn) => { const x = m.querySelector(s); if (x) x.onclick = fn; };
    on('#vd_nota', () => { H.fecharModal(); H.ir('nfe', 'n:' + j.nota._id); });
    on('#vd_re', () => { H.fecharModal(); importarDuimp(j.dono); });
    on('#vd_at', async () => {
      const itens = {}; m.querySelectorAll('[data-item]').forEach(s => { itens[s.dataset.item] = s.value || null; });
      const rr = await post('/api/duimp/' + encodeURIComponent(g.numero) + '/atribuir', { itens }).catch(() => ({ ok: false, j: {} }));
      if (!rr.ok) return H.toast(esc(rr.j.message || 'Não salvou.'));
      H.toast(rr.j.semOp ? `Salvo. Ainda ${rr.j.semOp} item(ns) sem operação.` : 'Itens atribuídos: a NF de entrada foi remontada.'); H.fecharModal(); H.render();
    });
  }
  H.nfeVerDuimp = verDuimp;

  /* Entrada da DUIMP: só o que a DUIMP não traz ou o cenário permite, sempre com motivo. */
  /* Campos da nota de entrada que podem ser editados a partir do automático. */
  const EDIT_NF = [['afrmm', 'AFRMM (R$)'], ['siscomex', 'Taxa Siscomex (R$)'], ['outras', 'Outras despesas aduaneiras (R$)'], ['pesoLiquido', 'Peso líquido (kg)'], ['pesoBruto', 'Peso bruto (kg)'], ['volumes', 'Quantidade de volumes'], ['especie', 'Espécie dos volumes']];
  function editarEntrada(n) {
    const ex = (n.entrada || {}).extras || {}, du = ex.duimp || {}, auto = (n.totais || {}).auto || {};
    const campo = (id, l, val, tipo) => `<div class="f"><label class="lbl" for="${id}">${l}</label><input id="${id}" ${tipo ? 'type="' + tipo + '"' : ''} value="${esc(val == null ? '' : val)}"></div>`;
    const m = H.modal('Correção manual · ' + n.ref, `<p class="note" style="margin-bottom:8px">Itens, quantidades, valores, tributos federais, exportador e dados da declaração vêm da DUIMP e ficam travados. Aqui só o que a API da DUIMP não informa ou o cenário permite; a alteração fica no histórico com quem fez e o motivo.</p>
      <div class="fields">${campo('ee_dd', 'Data do desembaraço', du.data_desembaraco, 'date')}${campo('ee_via', 'Via de transporte (1 = marítima)', du.via_transporte)}
        ${campo('ee_loc', 'Local do desembaraço (se diferente da unidade)', du.local)}${campo('ee_uf', 'UF do desembaraço', du.uf)}${campo('ee_uft', 'UF do adquirente/encomendante', ex.terceiroUf)}</div>
      <h3 class="h3" style="margin-top:10px">Taxas, pesos e volumes</h3>
      <p class="note">Já vêm com o que o sistema calculou da DUIMP. Mude só o que precisar: o valor digitado vale no lugar do automático (rateado pelos itens) e fica no histórico. Apagar o campo volta ao automático.</p>
      <div class="fields">${EDIT_NF.map(([k, l]) => { const a = auto[k], val = du[k] !== '' && du[k] != null ? du[k] : (a == null ? '' : a); return `<div class="f"><label class="lbl" for="ee_${k}">${esc(l)}</label><input id="ee_${k}" data-ednf="${k}" value="${esc(k === 'especie' || val === '' ? val : String(val).replace('.', ','))}" ${k === 'especie' ? '' : 'inputmode="decimal"'}><small class="note">automático: ${a === '' || a == null ? '—' : esc(k === 'especie' ? a : String(a).replace('.', ','))}${du[k] !== '' && du[k] != null && String(du[k]) !== String(a) ? ' · <b>editado</b>' : ''}</small></div>`; }).join('')}</div>
      <div class="fields" style="margin-top:8px"><div class="f w4"><label class="lbl" for="ee_inf">Informações complementares (além das automáticas)</label><textarea id="ee_inf" rows="2">${esc(ex.informacoes || '')}</textarea></div>
        <div class="f w4"><label class="lbl" for="ee_mot">Motivo da correção</label><input id="ee_mot" placeholder="ex.: data do extrato do despachante"></div></div>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn pri" id="ee_ok">Salvar e montar de novo</button>');
    m.querySelector('#ee_ok').onclick = async ev => {
      ev.target.disabled = true;
      const corpo = { id: n._id, motivo: v(m, '#ee_mot'), extras: { informacoes: v(m, '#ee_inf'), terceiroUf: v(m, '#ee_uft'), duimp: { data_desembaraco: v(m, '#ee_dd'), via_transporte: v(m, '#ee_via'), local: v(m, '#ee_loc'), uf: v(m, '#ee_uf') } } };
      /* Igual ao automático (ou vazio): fica automático. Só o que mudou vai como valor digitado. */
      const numBR = s => { const t = String(s || '').trim(); if (!t) return null; const x = /,/.test(t) ? +t.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(t) ? +t.replace(/\./g, '') : +t; return isFinite(x) ? x : null; };
      EDIT_NF.forEach(([k]) => { const s = v(m, '#ee_' + k), a = auto[k];
        if (k === 'especie') { corpo.extras.duimp[k] = s && s !== String(a || '') ? s : ''; return; }
        const x = numBR(s); corpo.extras.duimp[k] = x == null || (a != null && a !== '' && Math.abs(x - (+a || 0)) < 0.0005) ? '' : String(x); });
      const r = await post('/api/nfe/montar', corpo).catch(() => ({ ok: false, j: {} }));
      ev.target.disabled = false;
      if (!r.ok) return H.toast(esc(r.j.message || 'Não salvou.'));
      H.toast(r.j.nota.pendencias.length ? `${r.j.nota.pendencias.length} pendência(s) ainda` : 'Nota sem pendências: pode conferir.'); H.fecharModal(); H.render(); detalhe(n._id);
    };
  }

  /* ---------------- Corrigir dados (volta a montar no servidor) ---------------- */
  function editar(n) {
    const e = n.entrada || {}, d = e.destinatario || {}, ex = e.extras || {}, du = ex.duimp || {}, itens = e.itens || [], cen = n.cenario;
    const estr = cen === 'A' || d.estrangeiro, A = cen === 'A';
    const campo = (k, l, val, extra) => `<div class="f ${extra || ''}"><label class="lbl" for="e_${k}">${l}</label><input id="e_${k}" data-k="${k}" value="${esc(val == null ? '' : val)}"></div>`;
    const dest = estr ? [['nome', 'Exportador'], ['pais', 'País'], ['codigo_pais', 'Código do país (BACEN)'], ['logradouro', 'Endereço'], ['numero', 'Número'], ['id_estrangeiro', 'ID estrangeiro']]
      : [['nome', 'Razão social'], ['cnpj', 'CNPJ ou CPF'], ['ie', 'Inscrição estadual'], ['logradouro', 'Logradouro'], ['numero', 'Número'], ['complemento', 'Complemento'], ['bairro', 'Bairro'], ['municipio', 'Município'], ['codigo_municipio', 'Código IBGE do município'], ['uf', 'UF'], ['cep', 'CEP'], ['email', 'E-mail'], ['telefone', 'Telefone']];
    const m = H.modal(`Corrigir dados · ${n.ref}`, `<p class="note" style="margin-bottom:8px">Ao salvar, o servidor monta a nota de novo e recalcula as pendências. ${n.status === 'conferida' ? '<b>A conferência anterior deixa de valer.</b>' : ''}</p>
      <div class="fields">${campo('dataEmissao', 'Data de emissão', e.dataEmissao)}</div>
      <h3 class="h3" style="margin-top:10px">${estr ? 'Exportador' : 'Destinatário'}</h3>
      <div class="fields" id="fdest">${dest.map(([k, l]) => campo(k, l, d[k], k === 'nome' || k === 'logradouro' ? 'w2' : '')).join('')}
        ${estr || cen === 'F' ? '' : `<div class="f"><label class="lbl" for="e_contrib">Contribuinte ICMS</label><select id="e_contrib"><option value="">a confirmar</option><option value="sim" ${d.contribuinte === true ? 'selected' : ''}>Sim</option><option value="nao" ${d.contribuinte === false ? 'selected' : ''}>Não</option></select></div>`}</div>
      ${A ? `<h3 class="h3" style="margin-top:10px">DUIMP (do extrato do despachante)</h3>
      <div class="fields" id="fduimp">${[['numero', 'Número da DUIMP'], ['data_registro', 'Data de registro (AAAA-MM-DD)'], ['local', 'Local do desembaraço'], ['uf', 'UF do desembaraço'], ['data_desembaraco', 'Data do desembaraço'], ['via_transporte', 'Via (1 = marítima)'], ['afrmm', 'AFRMM (R$)'], ['siscomex', 'Taxa Siscomex (R$)'], ['outras', 'Outras despesas aduaneiras (R$)'], ['codigo_exportador', 'Código do exportador']].map(([k, l]) => campo(k, l, du[k])).join('')}
        <div class="f w2"><label class="lbl"><input type="checkbox" id="e_duconf" style="width:auto" ${du.manual ? '' : 'checked'}> Conferido com a DUIMP</label></div></div>
      <div class="fields">${campo('icmsAliquota', 'ICMS de importação (%) — se o cenário não fixa', ex.icmsAliquota)}${campo('terceiroCnpj', 'CNPJ adquirente/encomendante', ex.terceiroCnpj)}${campo('terceiroUf', 'UF adquirente/encomendante', ex.terceiroUf)}</div>` : ''}
      ${cen === 'G' ? `<h3 class="h3" style="margin-top:10px">Nota de ajuste</h3><div class="fields">${campo('cfop', 'CFOP', ex.cfop)}${campo('finalidade', 'Finalidade (2, 3 ou 4)', ex.finalidade)}${campo('tipo_documento', 'Tipo (0 entrada, 1 saída)', ex.tipo_documento)}${campo('natureza', 'Natureza da operação', ex.natureza, 'w2')}${campo('referencia', 'Nota original (id ou chave)', ex.referencia, 'w2')}${campo('informacoesItem', 'Informação por item', ex.informacoesItem, 'w4')}</div>` : ''}
      <h3 class="h3" style="margin-top:10px">Itens</h3>
      <div class="tw"><table id="fitens"><thead><tr><th>Descrição</th><th>NCM</th><th>Un</th><th>Qtd</th><th>Valor unit. (R$)</th><th>II %</th><th>IPI %</th><th>PIS %</th><th>COFINS %</th><th>52/91</th><th>Mono</th>${A ? '<th>Adição</th><th>Seq.</th><th>Fabricante</th>' : ''}${cen === 'G' ? '<th>CFOP</th>' : ''}</tr></thead><tbody>
        ${itens.map((it, i) => { const ad = it.adicao || {}, inp = (c, val, w) => `<input class="inp" data-i="${i}" data-c="${c}" value="${esc(val == null ? '' : val)}" style="width:${w || 80}px">`;
          return `<tr>${['descricao', 'ncm', 'unidade', 'quantidade', 'valorUnitario', 'ii', 'ipi', 'pis', 'cofins'].map(c => `<td>${inp(c, it[c], c === 'descricao' ? 200 : c === 'unidade' ? 48 : c === 'valorUnitario' || c === 'ncm' ? 110 : 64)}</td>`).join('')}
            <td><input type="checkbox" data-i="${i}" data-c="c5291" ${it.c5291 ? 'checked' : ''}></td><td><input type="checkbox" data-i="${i}" data-c="mono" ${it.mono ? 'checked' : ''}></td>
            ${A ? `<td>${inp('ad.numero', ad.numero, 48)}</td><td>${inp('ad.sequencial', ad.sequencial, 48)}</td><td>${inp('ad.fabricante', ad.fabricante, 140)}</td>` : ''}${cen === 'G' ? `<td>${inp('cfop', it.cfop, 60)}</td>` : ''}</tr>`; }).join('')}</tbody></table></div>
      ${A ? '' : (() => { const au = (n.totais || {}).auto || {}, fl = (k, l) => { const val = ex[k] !== '' && ex[k] != null ? ex[k] : (au[k] === '' || au[k] == null ? '' : au[k]);
          return `<div class="f"><label class="lbl" for="e_${k}">${l}</label><input id="e_${k}" data-pso="${k}" inputmode="decimal" value="${esc(val === '' ? '' : String(val).replace('.', ','))}"><small class="note">automático: ${au[k] === '' || au[k] == null ? '—' : esc(String(au[k]).replace('.', ','))}${au.fonte ? ' · da ' + esc(au.fonte) : ''}${ex[k] !== '' && ex[k] != null && String(ex[k]) !== String(au[k]) ? ' · <b>editado</b>' : ''}</small></div>`; };
        return `<h3 class="h3" style="margin-top:10px">Pesos</h3><div class="fields">${fl('pesoLiquido', 'Peso líquido (kg)')}${fl('pesoBruto', 'Peso bruto (kg)')}</div><p class="note">Já vêm da NF de entrada da operação. Mude se a venda não leva a carga inteira; apagar volta ao automático.</p>`; })()}
      <div class="fields" style="margin-top:10px"><div class="f w4"><label class="lbl" for="e_infos">Informações complementares (além das automáticas)</label><textarea id="e_infos" rows="2">${esc(ex.informacoes || '')}</textarea></div></div>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn pri" id="e_ok">Salvar e montar de novo</button>');
    m.querySelector('.modal').classList.add('larga');
    m.querySelector('#e_ok').onclick = async ev => {
      const destino = Object.assign({}, d); m.querySelectorAll('#fdest [data-k]').forEach(i => { destino[i.dataset.k] = i.value.trim(); });
      const ct = m.querySelector('#e_contrib'); if (ct) destino.contribuinte = ct.value === 'sim' ? true : ct.value === 'nao' ? false : null;
      const extras = {}; ['icmsAliquota', 'terceiroCnpj', 'terceiroUf', 'cfop', 'finalidade', 'tipo_documento', 'natureza', 'referencia', 'informacoesItem'].forEach(k => { const i = m.querySelector('#e_' + k); if (i) extras[k] = i.value.trim(); });
      extras.informacoes = v(m, '#e_infos');
      /* Pesos: igual ao automático (ou vazio) fica automático. */
      const auP = (n.totais || {}).auto || {}, numP = s => { const t = String(s || '').trim(); if (!t) return null; const x = /,/.test(t) ? +t.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(t) ? +t.replace(/\./g, '') : +t; return isFinite(x) ? x : null; };
      m.querySelectorAll('[data-pso]').forEach(i => { const k = i.dataset.pso, x = numP(i.value); extras[k] = x == null || (auP[k] !== '' && auP[k] != null && Math.abs(x - (+auP[k] || 0)) < 0.0005) ? '' : String(x); });
      if (A) { extras.duimp = {}; m.querySelectorAll('#fduimp [data-k]').forEach(i => { extras.duimp[i.dataset.k] = i.value.trim(); }); extras.duimp.manual = !v(m, '#e_duconf'); }
      const novos = itens.map((it, i) => { const x = Object.assign({}, it, { adicao: Object.assign({}, it.adicao) });
        m.querySelectorAll(`[data-i="${i}"]`).forEach(inp => { const c = inp.dataset.c; const val = inp.type === 'checkbox' ? inp.checked : inp.value.trim();
          if (c.startsWith('ad.')) x.adicao[c.slice(3)] = val; else if (['quantidade', 'valorUnitario', 'ii', 'ipi', 'pis', 'cofins'].includes(c)) x[c] = val === '' ? null : +String(val).replace(',', '.'); else x[c] = val; });
        return x; });
      ev.target.disabled = true;
      const r = await post('/api/nfe/montar', { id: n._id, itens: novos, destinatario: destino, extras, dataEmissao: v(m, '#e_dataEmissao') }).catch(() => ({ ok: false, j: {} }));
      ev.target.disabled = false;
      if (!r.ok) return H.toast(esc(r.j.message || 'Não consegui salvar.'));
      H.toast(r.j.nota.pendencias.length ? `${r.j.nota.pendencias.length} pendência(s) ainda` : 'Nota sem pendências: pode conferir.');
      H.fecharModal(); H.render(); detalhe(n._id);
    };
  }

  /* ---------------- Cenários fiscais ---------------- */
  function telaCenarios() {
    const dir = H.perfil().id === 'diretoria', marca = dir || ctx.podeEmitir;
    const m = H.modal('Cenários fiscais', `<p class="note" style="margin-bottom:10px">Sugestões de partida. <b>O contador (Pedro) e a contadora de AL (Gil) validam</b> CFOP, CST e alíquotas; em produção só sai nota de cenário conferido. Mudar um cenário desfaz a conferência.</p>
      <div class="tw"><table><thead><tr><th>Cenário</th><th>CFOP (int. / interest. / ext.)</th><th>ICMS</th><th>IPI</th><th>PIS/COFINS</th><th>IBS/CBS</th><th>Situação</th><th></th></tr></thead><tbody>
      ${(ctx.cenarios || []).map(c => `<tr><td><b>${c.k}</b> · ${esc(c.nome)}<br><small class="note">${esc(c.obs || '')}</small></td>
        <td class="mono">${esc(c.cfop_interna || '—')} / ${esc(c.cfop_interestadual || '—')} / ${esc(c.cfop_exterior || '—')}</td>
        <td>orig. ${esc(c.icms_origem || '—')} · CST ${esc(c.icms_cst || '—')}<br><small class="note">${c.k === 'A' ? (c.icms_aliquota != null ? c.icms_aliquota + '%' : 'da cotação') : `${c.icms_aliquota_interna != null ? c.icms_aliquota_interna : '—'}% int. · ${c.icms_aliquota_interestadual != null ? c.icms_aliquota_interestadual : '—'}% inter.`}${c.difal ? ' · DIFAL' : ''}${c.carga_5291 ? ' · 52/91 ' + c.carga_5291 + '%' : ''}</small></td>
        <td>CST ${esc(c.ipi_cst || '—')}</td><td>CST ${esc(c.pis_cst || '—')}/${esc(c.cofins_cst || '—')}${c.pis_aliquota != null ? `<br><small class="note">${c.pis_aliquota}% / ${c.cofins_aliquota}%</small>` : '<br><small class="note">da NCM</small>'}${c.aplica_monofasico ? '<br><small class="note">mono: CST ' + esc(c.pis_cst_monofasico || '04') + '</small>' : ''}</td>
        <td class="mono">${esc(c.ibs_cbs_cst || '—')} ${esc(c.ibs_cbs_classificacao || '')}</td>
        <td>${c.conferido && c.conferido.em ? pill('conferido', 'ok') + `<br><small class="note">${esc(quem(c.conferido.por))} · ${W.dataBR(c.conferido.em)}</small>` : pill('a validar', 'warn')}</td>
        <td class="num" style="white-space:nowrap">${marca ? (c.conferido && c.conferido.em ? `<button class="btn ghost sm" data-des="${c.k}">Desfazer</button>` : `<button class="btn sm" data-conf="${c.k}">Marcar conferido</button>`) : ''}${dir ? `<button class="btn ghost sm" data-edc="${c.k}">Editar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`,
      '<button class="btn" data-x>Fechar</button>');
    m.querySelector('.modal').classList.add('larga');
    const salvar = async corpo => { const r = await post('/api/nfe/cenarios', corpo).catch(() => ({ ok: false, j: {} })); if (!r.ok) return H.toast(esc(r.j.message || 'Não consegui salvar.')); ctx.cenarios = r.j.cenarios; H.fecharModal(); H.render(); telaCenarios(); };
    m.querySelectorAll('[data-conf]').forEach(b => b.onclick = () => salvar({ k: b.dataset.conf, conferir: true }));
    m.querySelectorAll('[data-des]').forEach(b => b.onclick = () => salvar({ k: b.dataset.des, desconferir: true }));
    m.querySelectorAll('[data-edc]').forEach(b => b.onclick = () => {
      const c = ctx.cenarios.find(x => x.k === b.dataset.edc);
      const e = H.modal(`Editar cenário ${c.k} · ${c.nome}`, `<div class="fields">${W.CAMPOS_CENARIO.map(([k, l]) => `<div class="f ${k === 'obs' || k === 'natureza_operacao' ? 'w4' : ''}"><label class="lbl" for="c_${k}">${esc(l)}</label><input id="c_${k}" data-k="${k}" value="${esc(c[k] == null ? '' : typeof c[k] === 'boolean' ? (c[k] ? 'sim' : 'não') : c[k])}"></div>`).join('')}</div>`,
        '<button class="btn" data-x>Cancelar</button><button class="btn pri" id="c_ok">Salvar (volta a "a validar")</button>');
      e.querySelector('.modal').classList.add('larga');
      e.querySelector('#c_ok').onclick = () => { const campos = {}; e.querySelectorAll('[data-k]').forEach(i => { campos[i.dataset.k] = i.value.trim(); }); salvar({ k: c.k, campos }); };
    });
  }

  /* ---------------- Configuração (Davi) ---------------- */
  function telaConfig() {
    const c = ctx.config || {}, emp = c.empresas || {};
    const CE = [['razaoSocial', 'Razão social'], ['cnpj', 'CNPJ'], ['ie', 'Inscrição estadual'], ['logradouro', 'Logradouro'], ['numero', 'Número'], ['bairro', 'Bairro'], ['municipio', 'Município'], ['codigo_municipio', 'Código IBGE'], ['uf', 'UF'], ['cep', 'CEP']];
    const m = H.modal('Configuração da NF-e', `
      <div class="fields"><div class="f w2"><label class="lbl"><input type="checkbox" id="g_cruz" style="width:auto" ${c.conferenciaCruzada !== false ? 'checked' : ''}> Conferência cruzada em produção (quem monta não transmite)</label></div>
        <div class="f"><label class="lbl" for="g_prazo">Prazo de cancelamento (horas)</label><input id="g_prazo" value="${esc(c.prazoCancelamentoHoras || 24)}"></div>
        <div class="f w2"><label class="lbl" for="g_urf">Unidades de despacho da DUIMP, uma por linha: código=local/UF (ex.: 0317900=Porto do Pecém/CE)</label><textarea id="g_urf" rows="3">${esc(Object.entries(c.urfs || {}).map(([k, x]) => k + '=' + x.nome + '/' + x.uf).join('\n'))}</textarea></div>
        <div class="f w2"><label class="lbl" for="g_pais">Países do exportador (ISO=código Banco Central nome), um por linha (China já vem: CN=1600)</label><textarea id="g_pais" rows="3">${esc(Object.entries(c.paises || {}).map(([k, x]) => k + '=' + x.codigo + ' ' + x.nome).join('\n'))}</textarea></div>
        <div class="f w2"><label class="lbl" for="g_aliq">ICMS interno por UF (DIFAL), ex.: CE=20, ES=17</label><input id="g_aliq" value="${esc(Object.entries(c.aliquotasInternas || {}).map(([u, a]) => u + '=' + a).join(', '))}"></div></div>
      <h3 class="h3" style="margin-top:10px">JeT Import (destinatária na triangular)</h3>
      <div class="fields" id="g_jet">${CE.map(([k, l]) => `<div class="f"><label class="lbl">${l}</label><input data-k="${k}" value="${esc((emp.JeT || {})[k] || '')}"></div>`).join('')}</div>
      <h3 class="h3" style="margin-top:10px">SF Trading</h3>
      <div class="fields" id="g_sf">${CE.map(([k, l]) => `<div class="f"><label class="lbl">${l}</label><input data-k="${k}" value="${esc((emp.WindGate || {})[k] || '')}"></div>`).join('')}</div>
      <p class="note">Os dados do emitente que vão na nota vêm do cadastro da empresa na Focus; aqui ficam os dados usados quando a empresa do grupo é a destinatária.</p>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn pri" id="g_ok">Salvar</button>');
    m.querySelector('.modal').classList.add('larga');
    m.querySelector('#g_ok').onclick = async () => {
      const aliq = {}; v(m, '#g_aliq').split(/[,;]+/).forEach(p => { const [u, a] = p.split('=').map(s => s.trim()); if (/^[A-Za-z]{2}$/.test(u || '') && a !== '' && isFinite(+String(a).replace(',', '.'))) aliq[u.toUpperCase()] = +String(a).replace(',', '.'); });
      const urfs = {}; v(m, '#g_urf').split(/\n+/).forEach(l => { const mm = /^\s*(\w+)\s*=\s*(.+?)\s*\/\s*([A-Za-z]{2})\s*$/.exec(l); if (mm) urfs[mm[1]] = { nome: mm[2], uf: mm[3].toUpperCase() }; });
      const paises = {}; v(m, '#g_pais').split(/\n+/).forEach(l => { const mm = /^\s*([A-Za-z]{2})\s*=\s*(\d{3,4})\s*(.*)$/.exec(l); if (mm) paises[mm[1].toUpperCase()] = { codigo: mm[2], nome: mm[3].trim() || mm[1].toUpperCase() }; });
      const ler = s => { const o = {}; m.querySelectorAll(s + ' [data-k]').forEach(i => { o[i.dataset.k] = i.value.trim(); }); return o; };
      const r = await post('/api/nfe/config', { conferenciaCruzada: v(m, '#g_cruz'), prazoCancelamentoHoras: +v(m, '#g_prazo') || 24, aliquotasInternas: aliq, urfs, paises, empresas: { JeT: Object.assign({ nome: 'JeT Import' }, ler('#g_jet')), WindGate: Object.assign({ nome: 'SF Trading' }, ler('#g_sf')) } }).catch(() => ({ ok: false, j: {} }));
      if (!r.ok) return H.toast(esc(r.j.message || 'Não consegui salvar.'));
      ctx.config = r.j.config; H.toast('Configuração salva'); H.fecharModal(); H.render();
    };
  }

  /* ---------------- Bloco na ficha da operação ---------------- */
  H.nfeBlocoOp = function (o) {
    if (!H.pode('nfe.ver')) return '';
    const ns = (H.db.hubNFe || []).filter(n => n && n.op === o.id).sort((a, b) => String(a.criadaEm || '').localeCompare(String(b.criadaEm || '')));
    const ret = W.retratoDuimp(H.db, o.duimp), du = W.duimpDaOp(H.db, o.id), emite = H.pode('nfe.emitir');
    const blocoDuimp = `<div class="box"><div class="box-h"><h2>DUIMP</h2><span class="btns">${ret ? `<button class="btn sm" data-duver="${esc(ret.dados.geral.numero)}">Ver DUIMP</button>` : ''}${emite ? `<button class="btn sm blue" data-duimp="${esc(o.id)}">${ret ? 'Reimportar' : 'Importar'} DUIMP</button>` : ''}</span></div><div class="box-b">${ret
      ? `<p><b class="mono">${esc(ret.dados.geral.numero)}</b> · versão ${esc(ret.dados.versao)} · consultada em ${W.dataBR(String(ret.dados.consultadoEm || '').slice(0, 10))} · ${du ? du.itens.length : 0} item(ns) desta operação${du && du.varias ? ` (DUIMP compartilhada; ${du.semOp.length ? '<b>' + du.semOp.length + ' sem operação</b>' : 'itens atribuídos'})` : ''}.</p>${W.conferirDuimpCotacao(H.db, o.id).map(a => `<p class="note">⚠ ${esc(a)}</p>`).join('')}`
      : `<p class="empty">${o.duimp ? 'DUIMP ' + esc(o.duimp) + ' ainda não importada.' : 'Sem DUIMP cadastrada.'} A NF de entrada nasce da DUIMP importada.</p>`}</div></div>`;
    return blocoDuimp + `<div class="box"><div class="box-h"><h2>Notas fiscais da operação</h2><span class="btns"><button class="btn sm" data-nfeir="${esc(o.id)}">${H.pode('nfe.emitir') ? 'Emitir / ver na tela NF-e' : 'Ver na tela NF-e'}</button></span></div>
      ${ns.length ? `<div class="tw"><table><thead><tr><th>Cenário</th><th>Referência</th><th>Destinatário</th><th class="num">Valor</th><th>Situação</th><th>Nº</th></tr></thead><tbody>${ns.map(n => `<tr class="click" data-nfeop="${esc(n._id)}"><td>${esc(n.cenario)} · ${esc(((W.cenarioDe(H.db, n.cenario) || {}).nome) || '')}</td><td class="mono">${esc(n.ref)}</td><td>${esc((n.destinatario || {}).nome || '—')}</td><td class="num">${W.fmtBRL((n.totais || {}).total || 0)}</td><td>${stPill(n.status)}</td><td class="mono">${esc(n.numero || '—')}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="empty">Nenhuma NF-e emitida para esta operação.</p>'}</div>`;
  };
  H.nfeLigarBloco = function (box) {
    box.querySelectorAll('[data-nfeop]').forEach(r => r.onclick = () => H.ir('nfe', 'n:' + r.dataset.nfeop));
    box.querySelectorAll('[data-nfeir]').forEach(b => b.onclick = () => H.ir('nfe', b.dataset.nfeir));
    box.querySelectorAll('[data-duimp]').forEach(b => b.onclick = () => importarDuimp(b.dataset.duimp));
    box.querySelectorAll('[data-duver]').forEach(b => b.onclick = () => verDuimp(b.dataset.duver));
  };
})();
