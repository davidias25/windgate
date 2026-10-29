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
          ${ctx.podeEmitir ? '<button class="btn pri" id="nnova">+ Nova nota</button>' : ''}</div></div>
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
    on('#nnova', nova); on('#ncen', telaCenarios); on('#ncfg', telaConfig);
    if (abrir) setTimeout(() => detalhe(abrir), 0);
  };

  /* ---------------- Nova nota ---------------- */
  function nova() {
    const cens = ctx.cenarios || [], autorizadas = (H.db.hubNFe || []).filter(n => n && n.status === 'autorizada');
    const m = H.modal('Nova NF-e', `${faixaAmbiente()}
      <div class="fields" style="margin-top:10px"><div class="f w2"><label class="lbl" for="ncn">Cenário fiscal</label><select id="ncn">${cens.map(c => `<option value="${c.k}">${c.k} · ${esc(c.nome)}${c.conferido && c.conferido.em ? '' : ' (a validar)'}</option>`).join('')}</select></div>
        <div class="f w2"><label class="lbl" for="nco">Operação</label><select id="nco"><option value="">—</option>${(ctx.ops || []).map(o => `<option value="${esc(o.id)}" ${filtro.op === o.id ? 'selected' : ''}>${esc(o.id)} · ${esc(o.cliente)}${o.modalidade ? ' · ' + esc(o.modalidade) : ''}</option>`).join('')}</select></div>
        <div class="f w2" id="ngref" hidden><label class="lbl" for="ncr">Nota original</label><select id="ncr"><option value="">—</option>${autorizadas.map(n => `<option value="${esc(n._id)}">${esc(n.ref)} · nº ${esc(n.numero || '')} · ${esc((n.destinatario || {}).nome || '')}</option>`).join('')}</select></div>
        <div class="f" id="ngfin" hidden><label class="lbl" for="ncf">Finalidade</label><select id="ncf"><option value="2">Complementar</option><option value="3">Ajuste</option><option value="4">Devolução</option></select></div></div>
      <p class="note" id="ncobs" style="margin-top:8px"></p>
      <p class="note">O sistema preenche itens, destinatário e DUIMP com o que há na operação, na cotação, no Catálogo de NCM e no CRM. Você corrige o que faltar na tela seguinte.</p>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn pri" id="ncok">Montar nota</button>');
    const atual = () => { const c = cens.find(x => x.k === v(m, '#ncn')) || {}; m.querySelector('#ngref').hidden = m.querySelector('#ngfin').hidden = c.k !== 'G'; m.querySelector('#ncobs').textContent = c.obs || ''; };
    m.querySelector('#ncn').onchange = atual; atual();
    m.querySelector('#ncok').onclick = async () => {
      const b = m.querySelector('#ncok'); b.disabled = true; b.textContent = 'Montando…';
      const k = v(m, '#ncn'), corpo = { cenario: k, opId: v(m, '#nco') };
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
      <table class="mini" style="margin-top:8px"><tbody><tr><td>Produtos</td><td class="num">${W.fmtBRL(t.produtos || 0)}</td><td>IPI</td><td class="num">${W.fmtBRL(t.ipi || 0)}</td><td>ICMS</td><td class="num">${W.fmtBRL(t.icms || 0)}</td>${t.ii ? `<td>II</td><td class="num">${W.fmtBRL(t.ii)}</td>` : ''}${t.difal ? `<td>DIFAL</td><td class="num">${W.fmtBRL(t.difal)}</td>` : ''}<td><b>Total</b></td><td class="num"><b>${W.fmtBRL(t.total || 0)}</b></td></tr></tbody></table>
      ${di ? `<h3 class="h3" style="margin-top:12px">DUIMP</h3><p class="note mono">${esc(di.numero || '—')} · registro ${W.dataBR(di.data_registro)} · ${esc(di.local_desembaraco_aduaneiro || '')}/${esc(di.uf_desembaraco_aduaneiro || '')} · desembaraço ${W.dataBR(di.data_desembaraco_aduaneiro)} · intermediação ${di.forma_intermedio}${di.cnpj ? ' · terceiro ' + esc(di.cnpj) + '/' + esc(di.uf_terceiro || '') : ''}</p>` : ''}
      ${py.informacoes_adicionais_contribuinte ? `<h3 class="h3" style="margin-top:12px">Informações complementares</h3><p class="note">${esc(py.informacoes_adicionais_contribuinte)}</p>` : ''}
      ${(n.cartas || []).length ? `<h3 class="h3" style="margin-top:12px">Cartas de correção</h3><div class="list">${n.cartas.map(c => `<div class="row"><div><b>CC-e ${c.numero}</b> · ${W.dataBR(c.em)} · ${esc(quem(c.por))}<br><small class="note">${esc(c.correcao)}</small></div><div class="btns">${c.pdfLink ? `<a class="btn ghost sm" href="${esc(c.pdfLink)}" target="_blank" rel="noopener">PDF</a>` : ''}${c.xmlLink ? `<a class="btn ghost sm" href="${esc(c.xmlLink)}" target="_blank" rel="noopener">XML</a>` : ''}</div></div>`).join('')}</div>` : ''}
      <h3 class="h3" style="margin-top:12px">Histórico</h3><div class="list">${(n.historico || []).slice().reverse().map(h => `<div class="row"><span><b>${esc(h.acao)}</b>${h.de ? ` · ${esc(h.de)} → ${esc(h.para)}` : ''} · ${esc(quem(h.por) || h.por)}${h.msg ? `<br><small class="note">${esc(h.msg)}</small>` : ''}</span><span class="note mono">${esc(String(h.em || '').slice(0, 16).replace('T', ' '))}</span></div>`).join('')}</div>
      ${motivo ? `<p class="note" style="margin-top:10px">${esc(motivo.msg)}</p>` : ''}`,
      `<button class="btn" data-x>Fechar</button>
       ${n.xmlLink ? `<a class="btn ghost" href="${esc(n.xmlLink)}" target="_blank" rel="noopener">XML</a>` : ''}${n.danfeLink ? `<a class="btn ghost" href="${esc(n.danfeLink)}" target="_blank" rel="noopener">DANFE</a>` : ''}
       ${pode('montar').ok ? '<button class="btn" id="dEd">Corrigir dados</button>' : ''}
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
    on('#dEd', () => editar(n));
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
      <div class="fields" style="margin-top:10px"><div class="f w4"><label class="lbl" for="e_infos">Informações complementares (além das automáticas)</label><textarea id="e_infos" rows="2">${esc(ex.informacoes || '')}</textarea></div></div>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn pri" id="e_ok">Salvar e montar de novo</button>');
    m.querySelector('.modal').classList.add('larga');
    m.querySelector('#e_ok').onclick = async ev => {
      const destino = Object.assign({}, d); m.querySelectorAll('#fdest [data-k]').forEach(i => { destino[i.dataset.k] = i.value.trim(); });
      const ct = m.querySelector('#e_contrib'); if (ct) destino.contribuinte = ct.value === 'sim' ? true : ct.value === 'nao' ? false : null;
      const extras = {}; ['icmsAliquota', 'terceiroCnpj', 'terceiroUf', 'cfop', 'finalidade', 'tipo_documento', 'natureza', 'referencia', 'informacoesItem'].forEach(k => { const i = m.querySelector('#e_' + k); if (i) extras[k] = i.value.trim(); });
      extras.informacoes = v(m, '#e_infos');
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
      const e = H.modal(`Editar cenário ${c.k} · ${c.nome}`, `<div class="fields">${W.CAMPOS_CENARIO.map(([k, l]) => `<div class="f ${k === 'obs' || k === 'natureza_operacao' ? 'w4' : ''}"><label class="lbl" for="c_${k}">${esc(l)}</label><input id="c_${k}" data-k="${k}" value="${esc(c[k] == null ? '' : c[k])}"></div>`).join('')}</div>`,
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
      const ler = s => { const o = {}; m.querySelectorAll(s + ' [data-k]').forEach(i => { o[i.dataset.k] = i.value.trim(); }); return o; };
      const r = await post('/api/nfe/config', { conferenciaCruzada: v(m, '#g_cruz'), prazoCancelamentoHoras: +v(m, '#g_prazo') || 24, aliquotasInternas: aliq, empresas: { JeT: Object.assign({ nome: 'JeT Import' }, ler('#g_jet')), WindGate: Object.assign({ nome: 'SF Trading' }, ler('#g_sf')) } }).catch(() => ({ ok: false, j: {} }));
      if (!r.ok) return H.toast(esc(r.j.message || 'Não consegui salvar.'));
      ctx.config = r.j.config; H.toast('Configuração salva'); H.fecharModal(); H.render();
    };
  }

  /* ---------------- Bloco na ficha da operação ---------------- */
  H.nfeBlocoOp = function (o) {
    if (!H.pode('nfe.ver')) return '';
    const ns = (H.db.hubNFe || []).filter(n => n && n.op === o.id).sort((a, b) => String(a.criadaEm || '').localeCompare(String(b.criadaEm || '')));
    return `<div class="box"><div class="box-h"><h2>Notas fiscais da operação</h2><span class="btns"><button class="btn sm" data-nfeir="${esc(o.id)}">${H.pode('nfe.emitir') ? 'Emitir / ver na tela NF-e' : 'Ver na tela NF-e'}</button></span></div>
      ${ns.length ? `<div class="tw"><table><thead><tr><th>Cenário</th><th>Referência</th><th>Destinatário</th><th class="num">Valor</th><th>Situação</th><th>Nº</th></tr></thead><tbody>${ns.map(n => `<tr class="click" data-nfeop="${esc(n._id)}"><td>${esc(n.cenario)} · ${esc(((W.cenarioDe(H.db, n.cenario) || {}).nome) || '')}</td><td class="mono">${esc(n.ref)}</td><td>${esc((n.destinatario || {}).nome || '—')}</td><td class="num">${W.fmtBRL((n.totais || {}).total || 0)}</td><td>${stPill(n.status)}</td><td class="mono">${esc(n.numero || '—')}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="empty">Nenhuma NF-e emitida para esta operação.</p>'}</div>`;
  };
  H.nfeLigarBloco = function (box) {
    box.querySelectorAll('[data-nfeop]').forEach(r => r.onclick = () => H.ir('nfe', 'n:' + r.dataset.nfeop));
    box.querySelectorAll('[data-nfeir]').forEach(b => b.onclick = () => H.ir('nfe', b.dataset.nfeir));
  };
})();
