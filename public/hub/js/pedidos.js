/* Hub 2.0 — Entrada de pedidos.
   Cola a mensagem ou o print do cliente; a IA (ou a leitura por regras) monta o
   pedido; quem confirma escolhe cotação direta ou estudo e o sistema cria o
   cliente, o negócio no CRM e as tarefas de cada pessoa. */
(function () {
  const H = window.HUB, W = H.W, esc = H.esc;
  let rascunho = null;   // { texto, imagem, canal, lido, tipo, fonte }
  const eu = () => H.nomeUsuario(H.userKey);
  const garantir = () => { ['hubPedidos', 'crm', 'crmOps', 'agendaTasks'].forEach(k => { if (!Array.isArray(H.db[k])) H.db[k] = []; }); };
  const STATUS = { novo: ['novo', 'info'], distribuido: ['tarefas distribuídas', 'ok'], estudo: ['aguardando aceite do estudo', 'warn'], cotacao: ['cotação enviada', 'ok'], descartado: ['descartado', ''] };

  H.telas.pedidos = function (el) {
    if (!H.pode('pedidos.ver')) { el.innerHTML = '<div class="banner">A Entrada de pedidos não faz parte do seu perfil.</div>'; return; }
    garantir();
    const db = H.db, hoje = W.hojeISO(), agora = Date.now();
    const peds = db.hubPedidos.filter(Boolean).sort((a, b) => String(b.em).localeCompare(String(a.em)));
    const neg = id => db.crmOps.find(n => n && n._id === id);
    const situacao = p => { const n = neg(p.negocioId); if (p.status === 'descartado') return 'descartado'; if (n && ['proposta', 'negociacao', 'ganho'].includes(W.faseDe(n))) return 'cotacao'; return p.status || 'novo'; };
    const semResposta = peds.filter(p => situacao(p) === 'novo' && agora - new Date(p.em).getTime() > 864e5);
    const mes = hoje.slice(0, 7);
    const estudos = db.crmOps.filter(n => n && n.tipoPedido === 'estudo' && W.faseDe(n) === 'ganho' && String(n.fechadoEm || '').slice(0, 7) === mes);
    const tempos = peds.map(p => { const n = neg(p.negocioId); const prop = n && (n.atividades || []).find(a => /→ Proposta enviada/.test(a.texto || '')); return prop ? W.diasEntre(W.soData(p.em), W.soData(prop.em)) : null; }).filter(x => x != null);
    const r = rascunho;

    el.innerHTML = `
      <div class="head"><div><h1>Entrada de pedidos</h1><p class="sub">Cole a mensagem ou envie o print da conversa. O sistema monta o pedido, classifica e entrega para a pessoa certa.</p></div>
        <div class="btns"><button class="btn" data-ir="crm">Ver o funil</button></div></div>
      <div class="kpis">
        <div class="kpi"><span class="lbl">Pedidos hoje</span><span class="v">${peds.filter(p => W.soData(p.em) === hoje).length}</span><span class="d">${peds.length} no total</span></div>
        <div class="kpi"><span class="lbl">Sem resposta há +24 h</span><span class="v">${semResposta.length}</span><span class="d ${semResposta.length ? 'bad' : 'good'}">${semResposta.length ? esc(semResposta.slice(0, 2).map(p => p.cliente || 'sem nome').join(', ')) : 'todos respondidos'}</span></div>
        <div class="kpi"><span class="lbl">Estudos vendidos no mês</span><span class="v">${estudos.length}</span><span class="d">${H.pode('crm.valores') ? W.fmtBRL(estudos.reduce((a, n) => a + (+n.valor || 0), 0)) : 'estudos de importação'}</span></div>
        <div class="kpi"><span class="lbl">Pedido → proposta</span><span class="v">${tempos.length ? (tempos.reduce((a, b) => a + b, 0) / tempos.length).toFixed(1).replace('.', ',') + ' d' : '—'}</span><span class="d">meta 2 dias</span></div>
      </div>
      <div class="g2">
        <div class="box"><div class="box-h"><h2>Mensagem recebida</h2><select id="pcanal" class="inp" aria-label="Canal">${['WhatsApp', 'Instagram', 'E-mail', 'Telefone', 'Indicação'].map(c => `<option ${r && r.canal === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
          <div class="box-b"><textarea id="ptexto" rows="7" style="width:100%" placeholder="Cole aqui a conversa do cliente. Ex.: Lima Construtora — Boa noite! Preciso de orçamento para 2.000 escoras de até 3,4 m, espessura de 3 mm.">${esc(r ? r.texto : '')}</textarea>
            <div class="drop" id="pdrop" tabindex="0">${r && r.imagem ? `<img src="${r.imagem}" alt="Print enviado" style="max-height:220px">` : '<b>Solte o print aqui</b> ou clique para escolher (PNG/JPG). Também dá para colar com Ctrl+V.'}</div>
            <input type="file" id="parq" accept="image/*" hidden>
            <div class="btns" style="margin-top:10px"><button class="btn pri" id="pler">Ler pedido</button>${r ? '<button class="btn ghost" id="plimpar">Limpar</button>' : ''}<span class="note" id="pstatus"></span></div></div></div>
        <div class="box" id="pform">${r && r.lido ? formulario(r) : '<p class="empty" style="padding:40px 16px">O pedido montado aparece aqui para você conferir e confirmar.</p>'}</div>
      </div>
      <div class="box"><div class="box-h"><h2>Pedidos em andamento</h2><span class="note">${peds.length}</span></div>
        ${peds.length ? `<div class="tw"><table><thead><tr><th>Entrada</th><th>Cliente</th><th>Pedido</th><th>Tipo</th><th>Com quem</th><th>Parado há</th><th>Situação</th></tr></thead><tbody>
        ${peds.slice(0, 30).map(p => { const n = neg(p.negocioId), st = STATUS[situacao(p)] || STATUS.novo, dias = n ? W.diasParado(n, hoje) : W.diasEntre(W.soData(p.em), hoje);
          return `<tr class="${n ? 'click' : ''}" ${n ? `data-neg="${esc(n._id)}"` : ''}><td class="mono">${W.dataBR(p.em).slice(0, 5)}<br><small class="note">${esc(p.canal || '')}</small></td><td><b>${esc(p.cliente || '—')}</b></td><td>${esc([p.quantidade ? Number(p.quantidade).toLocaleString('pt-BR') + ' ' + (p.unidade || '') : '', p.produto].filter(Boolean).join(' ') || p.resumo || '—')}</td>
            <td>${p.tipo === 'estudo' ? `<span class="pill mag">estudo${H.pode('crm.valores') && n && +n.valor ? ' · ' + W.fmtBRL(n.valor) : ''}</span>` : '<span class="pill info">cotação direta</span>'}</td><td>${esc((p.pessoas || []).join(' → ') || '—')}</td>
            <td class="${dias > 1 ? 'neg' : ''}">${dias == null ? '—' : dias ? dias + ' dia(s)' : 'hoje'}</td><td><span class="pill ${st[1]}">${st[0]}</span></td></tr>`; }).join('')}</tbody></table></div>`
        : '<p class="empty">Nenhum pedido ainda. O primeiro que você colar aparece aqui.</p>'}</div>`;

    el.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => H.ir(b.dataset.ir));
    el.querySelectorAll('[data-neg]').forEach(t => t.onclick = () => { H.ir('crm'); });
    const drop = el.querySelector('#pdrop'), arq = el.querySelector('#parq');
    const lerImagem = f => { if (!f || !/^image\//.test(f.type)) return H.toast('Envie uma imagem (PNG ou JPG)');
      if (f.size > 6e6) return H.toast('Imagem acima de 6 MB. Mande um print menor.');
      const fr = new FileReader(); fr.onload = () => { rascunho = Object.assign({}, rascunho, { texto: el.querySelector('#ptexto').value, canal: el.querySelector('#pcanal').value, imagem: fr.result, lido: false }); H.render(); }; fr.readAsDataURL(f); };
    drop.onclick = () => arq.click(); drop.onkeydown = e => { if (e.key === 'Enter') arq.click(); };
    arq.onchange = () => lerImagem(arq.files[0]);
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('alvo'); }; drop.ondragleave = () => drop.classList.remove('alvo');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('alvo'); lerImagem(e.dataTransfer.files[0]); };
    el.querySelector('#ptexto').onpaste = e => { const it = [...(e.clipboardData || {}).items || []].find(i => /^image\//.test(i.type)); if (it) { e.preventDefault(); lerImagem(it.getAsFile()); } };
    el.querySelector('#pler').onclick = () => ler(el);
    const lp = el.querySelector('#plimpar'); if (lp) lp.onclick = () => { rascunho = null; H.render(); };
    if (r && r.lido) ligarFormulario(el);
  };

  async function ler(el) {
    const texto = el.querySelector('#ptexto').value.trim(), canal = el.querySelector('#pcanal').value;
    const imagem = rascunho && rascunho.imagem;
    if (!texto && !imagem) { H.toast('Cole a mensagem ou envie o print'); return; }
    const st = el.querySelector('#pstatus'); st.textContent = 'Lendo…';
    let lido = null, fonte = 'regras', aviso = '';
    try {
      const resp = await H.api('/api/ia/pedido', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto, imagem }) });
      const j = await resp.json().catch(() => ({}));
      if (j.success) { lido = j.pedido; fonte = 'ia'; }
      else aviso = j.semIA ? 'IA ainda não ligada no servidor: li por regras. Confira os campos.' : (j.message || 'IA indisponível: li por regras.');
    } catch (e) { aviso = 'Sem conexão com a IA: li por regras.'; }
    if (!lido) {
      if (!texto) { st.textContent = ''; H.toast('Sem a IA ligada, o print não dá para ler. Cole o texto da conversa.'); rascunho = Object.assign({}, rascunho, { texto, canal }); return; }
      lido = W.lerPedidoRegras(texto);
    }
    const ja = W.jaOperado(H.db, lido.produto);
    rascunho = { texto, imagem, canal, lido, fonte, aviso, tipo: ja.ops.length || ja.negocios.length ? 'direta' : 'estudo', ja: ja.ops.map(o => o.id) };
    H.render();
  }

  function clientePorNome(nome) {
    const a = String(nome || '').toLowerCase().trim(); if (!a) return null;
    return H.db.crm.find(c => c && [c.empresa, c.nome].filter(Boolean).some(n => { const b = n.toLowerCase(); return b === a || b.includes(a) || a.includes(b); })) || null;
  }

  function formulario(r) {
    const p = r.lido, existente = clientePorNome(p.cliente);
    const tarefas = W.tarefasDoPedido(r.tipo, p.produto || 'o produto', W.hojeISO());
    const pessoas = Object.keys(H.db.users || {}).map(k => H.nomeUsuario(k));
    return `<div class="box-h"><h2>Pedido montado ${r.fonte === 'ia' ? 'pela IA' : 'por regras'}</h2><span class="pill warn">confira e confirme</span></div><div class="box-b">
      ${r.aviso ? `<p class="banner" style="margin-bottom:10px">${esc(r.aviso)}</p>` : ''}
      <div class="fields">
        <div class="f w2"><label class="lbl" for="fc">Cliente</label><input id="fc" value="${esc(p.cliente)}" list="clis"><datalist id="clis">${H.db.crm.filter(Boolean).map(c => `<option>${esc(W.nomeCliente(c))}</option>`).join('')}</datalist><small class="note">${existente ? 'Cliente já cadastrado' : p.cliente ? 'Cliente novo: será cadastrado' : ''}</small></div>
        <div class="f"><label class="lbl" for="fp">Produto</label><input id="fp" value="${esc(p.produto)}"></div>
        <div class="f"><label class="lbl" for="fq">Quantidade</label><input id="fq" value="${p.quantidade == null ? '' : esc(String(p.quantidade))}${p.unidade && p.quantidade != null ? '' : ''}" placeholder="2000"></div>
        <div class="f w2"><label class="lbl" for="fe">Especificação</label><input id="fe" value="${esc(p.especificacao)}"></div>
        <div class="f"><label class="lbl" for="fn">NCM sugerido</label><input id="fn" value="${esc(p.ncm)}" maxlength="8"></div>
        <div class="f"><span class="lbl">Já operado antes?</span><span class="ro">${r.ja && r.ja.length ? 'Sim · ' + esc(r.ja.slice(0, 3).join(', ')) : 'Não encontrado'}</span></div></div>
      ${p.duvidas && p.duvidas.length ? `<p class="note" style="margin-top:8px">Perguntar ao cliente: ${esc(p.duvidas.join(' · '))}</p>` : ''}
      <div class="tipos">
        <button class="tipo ${r.tipo === 'direta' ? 'on' : ''}" data-tipo="direta"><b>Cotação direta</b><small>Produto que já importamos, com fábrica conhecida. Sem estudo.</small></button>
        <button class="tipo ${r.tipo === 'estudo' ? 'on' : ''}" data-tipo="estudo"><b>Estudo de importação</b><small>Produto novo: pesquisa e fábricas. ${W.fmtBRL(W.PRECO_ESTUDO.cheio)} · promoção ${W.fmtBRL(W.PRECO_ESTUDO.promo1)} (1 linha) ou ${W.fmtBRL(W.PRECO_ESTUDO.promo2)} (2 linhas).</small></button></div>
      ${r.tipo === 'estudo' && H.pode('crm.valores') ? `<div class="fields" style="margin-top:8px"><div class="f w2"><label class="lbl" for="fvest">Preço do estudo</label><select id="fvest"><option value="${W.PRECO_ESTUDO.promo1}">Promoção 1 linha · ${W.fmtBRL(W.PRECO_ESTUDO.promo1)}</option><option value="${W.PRECO_ESTUDO.promo2}">Promoção 2 linhas · ${W.fmtBRL(W.PRECO_ESTUDO.promo2)}</option><option value="${W.PRECO_ESTUDO.cheio}">Cheio · ${W.fmtBRL(W.PRECO_ESTUDO.cheio)}</option></select></div></div>` : ''}
      <div class="list" style="margin-top:10px">${tarefas.map((t, i) => `<div class="row"><div style="display:flex;gap:8px;align-items:center;flex:1;min-width:0"><select class="inp" data-tr="${i}" aria-label="Responsável">${pessoas.map(x => `<option ${x === t.resp ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select><span style="min-width:0">${esc(t.t)}</span></div><input type="date" class="inp" data-td="${i}" value="${t.prazo}" aria-label="Prazo"></div>`).join('')}</div>
      <div class="btns" style="margin-top:12px"><button class="btn pri" id="fok">Confirmar e distribuir tarefas</button><button class="btn ghost" id="fdesc">Descartar</button></div>
      <p class="note" style="margin-top:8px">Quem recebe as tarefas de fábrica vê só produto, quantidade e fábricas; custo e margem ficam com Davi e Samir.</p></div>`;
  }

  function ligarFormulario(el) {
    const r = rascunho;
    el.querySelectorAll('[data-tipo]').forEach(b => b.onclick = () => { guardarCampos(el); rascunho.tipo = b.dataset.tipo; H.render(); });
    el.querySelector('#fdesc').onclick = () => {
      garantir();
      H.db.hubPedidos.unshift({ _id: W.novoId(), em: new Date().toISOString(), por: eu(), canal: r.canal, texto: r.texto, cliente: el.querySelector('#fc').value.trim(), produto: el.querySelector('#fp').value.trim(), status: 'descartado', fonte: r.fonte });
      rascunho = null; H.salvar(); H.toast('Pedido descartado (fica no histórico)'); H.render();
    };
    el.querySelector('#fok').onclick = () => confirmar(el);
  }
  function guardarCampos(el) {
    const v = s => { const x = el.querySelector(s); return x ? x.value.trim() : ''; };
    Object.assign(rascunho.lido, { cliente: v('#fc'), produto: v('#fp'), quantidade: v('#fq') ? +String(v('#fq')).replace(/\./g, '').replace(',', '.') || null : null, especificacao: v('#fe'), ncm: v('#fn') });
  }

  function confirmar(el) {
    garantir(); guardarCampos(el);
    const r = rascunho, p = r.lido, agora = new Date().toISOString(), hoje = agora.slice(0, 10);
    if (!p.cliente) { H.toast('Informe o cliente'); return; }
    if (!p.produto) { H.toast('Informe o produto'); return; }
    let c = clientePorNome(p.cliente);
    if (!c) { c = { _id: W.novoId(), empresa: p.cliente, nome: p.contato || '', fone: p.telefone || '', email: '', cnpj: '', segmento: '', resp: eu(), obs: '', end: { cidade: '', uf: '' }, interacoes: [], criadoEm: agora, por: eu(), origem: r.canal }; H.db.crm.unshift(c); }
    const tarefas = W.tarefasDoPedido(r.tipo, p.produto, hoje).map((t, i) => Object.assign(t, { resp: el.querySelector(`[data-tr="${i}"]`).value, prazo: el.querySelector(`[data-td="${i}"]`).value || t.prazo }));
    const pedidoId = W.novoId();
    const titulo = [p.quantidade ? Number(p.quantidade).toLocaleString('pt-BR') + (p.unidade && p.unidade !== 'un' ? ' ' + p.unidade : '') : '', p.produto, p.especificacao ? '· ' + p.especificacao : ''].filter(Boolean).join(' ');
    const valorEstudo = r.tipo === 'estudo' ? +((el.querySelector('#fvest') || {}).value || W.PRECO_ESTUDO.promo1) : 0;
    const n = { _id: W.novoId(), clienteId: c._id, titulo: r.tipo === 'estudo' ? 'Estudo de importação: ' + p.produto : titulo, valor: valorEstudo, origem: r.canal === 'Indicação' ? 'Indicação' : r.canal, tipoPedido: r.tipo,
      resp: r.tipo === 'estudo' ? tarefas[0].resp : 'Davi', obs: p.resumo || '', ncm: p.ncm || '', pedidoId, criadoEm: agora, atualizadoEm: agora, faseEm: agora, fase: 'lead', etapa: 'Novo contato', por: eu(), vistoEm: null, quoteId: '',
      atividades: [{ _id: W.novoId(), tipo: r.canal, texto: 'Pedido recebido: ' + (p.resumo || titulo), por: eu(), em: agora, auto: true }] };
    W.moverNegocio(n, r.tipo === 'estudo' ? 'qualificacao' : 'cotacao', eu(), agora);
    if (r.tipo === 'estudo') { n.prox = 'Enviar proposta do estudo de importação'; n.proxData = tarefas[0].prazo; n.prazo = n.proxData; }
    H.db.crmOps.unshift(n);
    tarefas.forEach(t => H.db.agendaTasks.unshift({ _id: W.novoId(), id: 't_' + Date.now() + Math.random().toString(36).slice(2, 5), t: t.t, resp: t.resp, prazo: t.prazo, hora: '', prio: t.prio, status: 'aberta',
      obs: `Pedido de ${p.cliente}${p.quantidade ? ' · ' + p.quantidade + ' ' + (p.unidade || '') : ''}${p.especificacao ? ' · ' + p.especificacao : ''}`, por: eu(), doneAt: null, criadoEm: agora, vistoEm: t.resp === eu() ? agora : null, pedidoId, negocioId: n._id }));
    H.db.hubPedidos.unshift({ _id: pedidoId, em: agora, por: eu(), canal: r.canal, texto: r.texto, temPrint: !!r.imagem, fonte: r.fonte, cliente: W.nomeCliente(c), clienteId: c._id, produto: p.produto, quantidade: p.quantidade, unidade: p.unidade,
      especificacao: p.especificacao, ncm: p.ncm, resumo: p.resumo, tipo: r.tipo, negocioId: n._id, status: r.tipo === 'estudo' ? 'estudo' : 'distribuido', pessoas: [...new Set(tarefas.map(t => t.resp))] });
    rascunho = null; H.salvar();
    H.toast(`Pedido confirmado: negócio no CRM e ${tarefas.length} tarefa(s) para ${esc([...new Set(tarefas.map(t => t.resp))].join(', '))}.`); H.render();
  }
})();
