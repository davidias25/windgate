/* Hub 2.0 — Sourcing & Fornecedores.
   Busca de fábricas com a IA pesquisando na web (Alibaba, Made-in-China,
   Global Sources, 1688 e sites próprios), base própria de fornecedores com nota
   de confiança, e pedido de cotação no padrão da casa: preço FOB no porto mais
   próximo da fábrica e nenhuma marca concorrente, só características técnicas. */
(function () {
  const H = window.HUB, W = H.W, esc = H.esc;
  let resultado = null, busca = { produto: '', especificacao: '', quantidade: '' }, aba = 'buscar', filtro = '';
  const eu = () => H.nomeUsuario(H.userKey);
  const garantir = () => { if (!Array.isArray(H.db.hubFornecedores)) H.db.hubFornecedores = []; };
  const PLATAFORMAS = [['Alibaba', q => 'https://www.alibaba.com/trade/search?SearchText=' + q], ['Made-in-China', q => 'https://www.made-in-china.com/products-search/hot-china-products/' + q.replace(/%20/g, '_') + '.html'],
    ['Global Sources', q => 'https://www.globalsources.com/searchList/products?keyWord=' + q], ['1688', q => 'https://s.1688.com/selloffer/offer_search.htm?keywords=' + q], ['Google (fabricantes)', q => 'https://www.google.com/search?q=' + q + '%20manufacturer%20factory%20China']];
  const STATUS = { prospect: ['prospecção', 'info'], cotando: ['cotando', 'warn'], aprovado: ['aprovado', 'ok'], bloqueado: ['bloqueado', 'crit'] };

  function rfqPadrao(b) {
    return `Dear Sir/Madam,\n\nWe are WindGate, an import trading company in Brazil. We are sourcing the following product:\n\n- Product: ${b.produto || '[product]'}\n- Specifications: ${b.especificacao || '[dimensions, material, thickness, power, finish]'}\n- Quantity: ${b.quantidade || '[quantity]'}\n\nPlease quote:\n1. Unit price FOB at the seaport nearest to your factory (please name the port)\n2. MOQ and production lead time\n3. Packing details (carton/pallet size, gross weight, units per 40'HQ)\n4. Certifications and test reports available\n5. Payment terms\n\nPlease describe the product only by its technical characteristics. Photos and a product catalogue are welcome.\n\nBest regards,\n${eu()} · WindGate · Fortaleza, Brazil`;
  }

  H.telas.sourcing = function (el) {
    garantir();
    const db = H.db, fs = db.hubFornecedores.filter(Boolean), q = encodeURIComponent((busca.produto + ' ' + busca.especificacao).trim());
    const legado = (db.fornecedores || []).length + (db.parceiros || []).length;
    el.innerHTML = `
      <div class="head"><div><h1>Sourcing & Fornecedores</h1><p class="sub">Encontrar fábricas, comparar, verificar e pedir cotação sem sair do sistema. Regra da casa: FOB no porto mais próximo da fábrica e nenhuma marca no pedido.</p></div>
        <div class="seg">${[['buscar', 'Buscar fábricas'], ['base', `Base de fornecedores · ${fs.length}`]].map(([k, l]) => `<button data-aba="${k}" class="${aba === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      ${aba === 'buscar' ? `
      <div class="box"><div class="box-b"><div class="fields">
        <div class="f w2"><label class="lbl" for="sp">Produto</label><input id="sp" value="${esc(busca.produto)}" placeholder="Ex.: escora metálica telescópica"></div>
        <div class="f w2"><label class="lbl" for="se">Especificação técnica</label><input id="se" value="${esc(busca.especificacao)}" placeholder="Ex.: até 3,4 m, tubo 3 mm, galvanizada"></div>
        <div class="f"><label class="lbl" for="sq">Quantidade</label><input id="sq" value="${esc(busca.quantidade)}" placeholder="2.000 un"></div></div>
        <div class="btns" style="margin-top:10px"><button class="btn pri" id="sbuscar">Buscar fornecedores com IA</button><span class="note" id="sst">A IA pesquisa nas plataformas e em sites de fábricas e devolve uma lista com link, cidade, MOQ e sinais de verificação.</span></div>
        ${q ? `<p class="note" style="margin-top:10px">Abrir a busca direto: ${PLATAFORMAS.map(([n, u]) => `<a href="${esc(u(q))}" target="_blank" rel="noopener">${n}</a>`).join(' · ')}</p>` : ''}</div></div>
      ${resultado ? `<div class="g2 larga"><div class="box"><div class="box-h"><h2>Fornecedores encontrados</h2><span class="note">${resultado.fornecedores.length} · confira cada um antes de cotar</span></div>
        ${resultado.fornecedores.length ? `<div class="tw"><table><thead><tr><th>Fornecedor</th><th>Onde</th><th>Tipo</th><th>MOQ · preço</th><th>Sinais</th><th></th></tr></thead><tbody>${resultado.fornecedores.map((f, i) => `<tr><td><b>${esc(f.nome)}</b><br><a class="note" href="${esc(f.link)}" target="_blank" rel="noopener">${esc(f.plataforma || 'site')} ↗</a></td>
          <td>${esc([f.cidade, f.provincia].filter(Boolean).join(', ') || '—')}${f.portoProximo ? `<br><small class="note">porto: ${esc(f.portoProximo)}</small>` : ''}</td><td>${esc(f.tipo || '—')}${f.anos ? `<br><small class="note">${esc(String(f.anos))} anos</small>` : ''}</td>
          <td>${esc(f.moq || '—')}${f.precoIndicativo ? `<br><small class="note">${esc(f.precoIndicativo)}</small>` : ''}</td><td>${(f.sinais || []).map(x => `<span class="pill ok">${esc(x)}</span>`).join(' ') || '<span class="note">—</span>'}</td>
          <td class="num"><button class="btn sm" data-salvar="${i}">Salvar na base</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">A pesquisa não trouxe fornecedor com link confirmado. Ajuste o produto ou use os links das plataformas.</p>'}
        ${resultado.dicas.length ? `<div class="box-b"><h3 class="h3">Antes de fechar</h3><ul class="rl">${resultado.dicas.map(d => `<li>${esc(d)}</li>`).join('')}</ul></div>` : ''}</div>
        <div class="box"><div class="box-h"><h2>Pedido de cotação (inglês)</h2><button class="btn sm" id="scopiar">Copiar</button></div><div class="box-b"><textarea id="srfq" rows="18" style="width:100%">${esc(resultado.rfq || rfqPadrao(busca))}</textarea>
          <p class="note">Mande pelo chat da plataforma ou por e-mail. Preço FOB no porto mais próximo da fábrica; o frete é a WindGate que contrata.</p></div></div></div>` : `
      <div class="box"><div class="box-h"><h2>Pedido de cotação no padrão da casa</h2><button class="btn sm" id="scopiar">Copiar</button></div><div class="box-b"><textarea id="srfq" rows="14" style="width:100%">${esc(rfqPadrao(busca))}</textarea></div></div>`}`
      : `
      <div class="box"><div class="filters"><input type="search" id="fq" placeholder="Buscar por nome, produto, cidade…" value="${esc(filtro)}"><button class="btn blue" id="fnovo">+ Fornecedor</button>${legado ? `<span class="note">${legado} cadastro(s) ainda no sistema atual (Fornecedores)</span>` : ''}</div>
        ${fs.length ? `<div class="tw"><table><thead><tr><th>Fornecedor</th><th>Produtos</th><th>Onde · porto</th><th class="num">Confiança</th><th>Situação</th><th>Última cotação</th></tr></thead><tbody>
          ${fs.filter(f => !filtro || [f.nome, f.produtos, f.cidade, f.provincia].join(' ').toLowerCase().includes(filtro.toLowerCase())).sort((a, b) => W.notaFornecedor(b) - W.notaFornecedor(a)).map(f => { const n = W.notaFornecedor(f), st = STATUS[f.status] || STATUS.prospect, cot = (f.cotacoes || [])[0];
            return `<tr class="click" data-f="${esc(f._id)}"><td><b>${esc(f.nome)}</b><br><small class="note">${esc(f.plataforma || '')}</small></td><td>${esc(f.produtos || '—')}</td><td>${esc([f.cidade, f.provincia].filter(Boolean).join(', ') || '—')}${f.portoProximo ? `<br><small class="note">${esc(f.portoProximo)}</small>` : ''}</td>
              <td class="num"><span class="score ${n >= 70 ? 'quente' : n >= 40 ? 'morno' : 'frio'}">${n}</span></td><td><span class="pill ${st[1]}">${st[0]}</span></td><td>${cot ? `${esc(cot.preco)} · ${W.dataBR(cot.data)}` : '<span class="note">—</span>'}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="empty">Nenhum fornecedor ainda. Salve os encontrados na busca ou cadastre um.</p>'}</div>`}`;

    el.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => { aba = b.dataset.aba; H.render(); });
    const cp = el.querySelector('#scopiar'); if (cp) cp.onclick = async () => { const t = el.querySelector('#srfq').value; try { await navigator.clipboard.writeText(t); H.toast('Pedido de cotação copiado'); } catch (e) { el.querySelector('#srfq').select(); } };
    const sb = el.querySelector('#sbuscar'); if (sb) sb.onclick = async () => {
      busca = { produto: el.querySelector('#sp').value.trim(), especificacao: el.querySelector('#se').value.trim(), quantidade: el.querySelector('#sq').value.trim() };
      if (!busca.produto) { H.toast('Informe o produto'); return; }
      sb.disabled = true; el.querySelector('#sst').textContent = 'Pesquisando nas plataformas… (até 1 minuto)';
      try { const r = await H.api('/api/ia/sourcing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(busca) }); const j = await r.json();
        if (!j.success) throw new Error(j.message || 'Pesquisa indisponível'); resultado = { fornecedores: j.fornecedores || [], rfq: j.rfq || '', dicas: j.dicas || [] }; }
      catch (e) { resultado = null; H.toast(esc(e.message) + ' Use os links das plataformas abaixo.'); }
      H.render();
    };
    el.querySelectorAll('[data-salvar]').forEach(b => b.onclick = () => {
      const f = resultado.fornecedores[+b.dataset.salvar];
      if (H.db.hubFornecedores.some(x => x && (x.link === f.link || x.nome === f.nome))) { H.toast('Já está na base'); return; }
      H.db.hubFornecedores.unshift({ _id: W.novoId(), nome: f.nome, plataforma: f.plataforma || '', link: f.link, cidade: f.cidade || '', provincia: f.provincia || '', portoProximo: f.portoProximo || '', tipo: f.tipo || '', produtos: f.produtos || busca.produto,
        moq: f.moq || '', anos: f.anos || '', sinais: f.sinais || [], obs: f.observacoes || '', status: 'prospect', checks: { fabrica: f.tipo === 'fábrica', auditoria: (f.sinais || []).length > 0 }, contatos: [], cotacoes: [], por: eu(), em: new Date().toISOString() });
      H.salvar(); H.toast('Salvo na base de fornecedores'); b.disabled = true; b.textContent = 'Salvo';
    });
    const fq = el.querySelector('#fq'); if (fq) fq.addEventListener('input', () => { filtro = fq.value; clearTimeout(fq._t); fq._t = setTimeout(() => { H.render(); const n = document.querySelector('#fq'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); });
    const fn = el.querySelector('#fnovo'); if (fn) fn.onclick = () => abrir(null);
    el.querySelectorAll('[data-f]').forEach(r => r.onclick = () => abrir(r.dataset.f));
  };

  function abrir(id) {
    garantir();
    const f = id ? H.db.hubFornecedores.find(x => x && x._id === id) : { checks: {}, contatos: [], cotacoes: [], status: 'prospect' };
    if (!f) return H.render();
    const c = f.checks || {}, ct = (f.contatos || [])[0] || {};
    const m = H.modal(id ? f.nome : 'Novo fornecedor', `<div class="g2" style="gap:16px"><div><div class="fields">
      <div class="f w2"><label class="lbl" for="fn">Nome</label><input id="fn" value="${esc(f.nome || '')}"></div><div class="f w2"><label class="lbl" for="fl">Link</label><input id="fl" value="${esc(f.link || '')}"></div>
      <div class="f w2"><label class="lbl" for="fp">Produtos</label><input id="fp" value="${esc(f.produtos || '')}"></div><div class="f"><label class="lbl" for="fc">Cidade</label><input id="fc" value="${esc(f.cidade || '')}"></div><div class="f"><label class="lbl" for="fpo">Porto mais próximo</label><input id="fpo" value="${esc(f.portoProximo || '')}"></div>
      <div class="f"><label class="lbl" for="fcn">Contato</label><input id="fcn" value="${esc(ct.nome || '')}"></div><div class="f"><label class="lbl" for="fce">E-mail</label><input id="fce" value="${esc(ct.email || '')}"></div><div class="f"><label class="lbl" for="fcw">WhatsApp / WeChat</label><input id="fcw" value="${esc(ct.whats || '')}"></div>
      <div class="f"><label class="lbl" for="fs">Situação</label><select id="fs">${Object.entries(STATUS).map(([k, [l]]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="f w4"><label class="lbl" for="fo">Observações</label><input id="fo" value="${esc(f.obs || '')}"></div></div>
      <h3 class="h3" style="margin-top:12px">Verificação · nota ${W.notaFornecedor(f)}</h3><div class="list">${W.CHECK_FORNECEDOR.map(([k, l, p]) => `<label class="row"><span><input type="checkbox" data-ck="${k}" ${c[k] ? 'checked' : ''} style="width:auto"> ${esc(l)}</span><span class="note">${p} pts</span></label>`).join('')}</div></div>
      <div><h3 class="h3">Cotações recebidas</h3><div class="list">${(f.cotacoes || []).map(q => `<div class="row"><span>${W.dataBR(q.data)} · <b>${esc(q.preco)}</b> · MOQ ${esc(q.moq || '—')} · ${esc(q.prazo || '')}${q.op ? ' · ' + esc(q.op) : ''}</span></div>`).join('') || '<p class="note">Nenhuma cotação registrada.</p>'}</div>
        <div class="fields" style="margin-top:8px"><div class="f"><label class="lbl" for="qp">Preço FOB</label><input id="qp" placeholder="US$ 12,40/un FOB Qingdao"></div><div class="f"><label class="lbl" for="qm">MOQ</label><input id="qm"></div><div class="f"><label class="lbl" for="qz">Prazo de produção</label><input id="qz" placeholder="25 dias"></div><div class="f"><label class="lbl" for="qo">Operação</label><input id="qo" placeholder="OPX24"></div></div>
        <button class="btn sm" id="qadd" style="margin-top:8px">Registrar cotação</button></div></div>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="fok">Salvar</button>');
    m.querySelector('.modal').classList.add('larga');
    const ler = () => { const v = s => m.querySelector(s).value.trim(); const checks = {}; m.querySelectorAll('[data-ck]').forEach(x => checks[x.dataset.ck] = x.checked);
      return { nome: v('#fn'), link: v('#fl'), produtos: v('#fp'), cidade: v('#fc'), portoProximo: v('#fpo'), status: v('#fs'), obs: v('#fo'), checks, contatos: [{ nome: v('#fcn'), email: v('#fce'), whats: v('#fcw') }] }; };
    const gravar = extra => { const d = Object.assign(ler(), extra || {}); if (!d.nome) { H.toast('Informe o nome'); return false; }
      if (id) Object.assign(H.db.hubFornecedores.find(x => x && x._id === id) || {}, d); else { id = W.novoId(); H.db.hubFornecedores.unshift(Object.assign({ _id: id, cotacoes: [], por: eu(), em: new Date().toISOString() }, d)); }
      H.salvar(); return true; };
    m.querySelector('#fok').onclick = () => { if (gravar()) { H.fecharModal(); H.toast('Fornecedor salvo'); H.render(); } };
    m.querySelector('#qadd').onclick = () => { const p = m.querySelector('#qp').value.trim(); if (!p) { H.toast('Informe o preço'); return; }
      const atual = id ? (H.db.hubFornecedores.find(x => x && x._id === id) || {}).cotacoes || [] : [];
      if (gravar({ cotacoes: [{ data: W.hojeISO(), preco: p, moq: m.querySelector('#qm').value.trim(), prazo: m.querySelector('#qz').value.trim(), op: m.querySelector('#qo').value.trim(), por: eu() }].concat(atual), status: 'cotando' })) { H.fecharModal(); abrir(id); } };
  }
})();
