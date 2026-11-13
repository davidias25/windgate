/* Hub 2.0 — Cotações & Propostas.
   Lista, editor, aprovação do Samir, cronograma de desembolso e proposta em
   PDF. Os números saem do motor sem tela (cotacao-regras.js), que o teste
   compara com o calc() do sistema atual; o PDF sai do gerador copiado do
   sistema atual (cotacao-pdf.js). Grava em quotes/qindex no MESMO formato:
   as duas telas abrem as mesmas cotações. */
(function () {
  const H = window.HUB, W = H.W, esc = H.esc;
  const eu = () => H.nomeUsuario(H.userKey);
  const fmt = v => (isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const pct = v => v == null || !isFinite(v) ? '—' : v.toFixed(1).replace('.', ',') + '%';
  const pill = (t, c) => `<span class="pill ${c || ''}">${esc(t)}</span>`;
  const stPill = s => { const m = W.STATUS_COTA[s] || W.STATUS_COTA.draft; return pill(m[0], m[1]); };
  const podeAprovar = () => !!((H.user && H.user.aprova) || H.pode('fin.autorizar'));
  const garantir = () => { if (!H.db.quotes || typeof H.db.quotes !== 'object') H.db.quotes = {}; if (!Array.isArray(H.db.qindex)) H.db.qindex = []; };

  /* Cotação aberta no editor: cópia de trabalho; só vai ao banco no Salvar. */
  let ed = null, editando = false, modo = 'pct', R = null, busca = '', filtro = '', subindo = 0;

  function nova() {
    return { fields: Object.assign({}, W.PADRAO), items: [W.ITEM_PADRAO()], exps: W.DEFAULT_EXPS.map(e => Object.assign({}, e)), fotos: [], blocos: W.propostaBlocosPadrao(),
      status: 'draft', id: null, criadoPor: eu(), aprovadoPor: null };
  }
  function abrir(id) {
    garantir();
    const s = H.db.quotes[id]; if (!s) { H.toast('Cotação não encontrada.'); return false; }
    ed = JSON.parse(JSON.stringify(s)); ed.id = ed.id || id; ed.fields = W.camposDe(ed);
    ed.items = ed.items || []; ed.exps = ed.exps || []; ed.fotos = ed.fotos || []; ed.blocos = ed.blocos || W.propostaBlocosPadrao(); ed.status = ed.status || 'draft';
    editando = false; modo = 'pct';
    return true;
  }
  const semFlag = () => !!ed && W.ehMultiCliente(ed) && !W.multiClienteLigado(H.db);
  const travada = () => ed && ((ed.status === 'ok' && !editando) || semFlag());

  /* ================= LISTA ================= */
  H.telas.cotacoes = function (el, param) {
    garantir();
    /* Sem custos e margens (só Samir e Davi): a lista mostra código, cliente, produto e status, sem abrir a cotação. */
    if (!H.pode('fin.resultado')) {
      const st = { draft: 'Rascunho', wait: 'Aguardando aprovação', ok: 'Aprovada' };
      const ls = (H.db.qindex || []).filter(q => q && q.id).map(q => ({ q, s: (H.db.quotes || {})[q.id] || {} }));
      el.innerHTML = `<div class="head"><div><h1>Cotações & Propostas</h1><p class="sub">Custos e margens ficam só com Samir e Davi. Aqui: código, cliente, produto e situação.</p></div></div>
        <div class="box"><div class="tw"><table><thead><tr><th>Cotação</th><th>Cliente</th><th>Produto</th><th>Situação</th></tr></thead><tbody>${ls.length ? ls.map(({ q, s }) => `<tr><td class="mono">${esc((s.fields || {}).opNum || q.label || q.id)}</td><td>${esc(q.cliente || (s.fields || {}).cliente || '')}</td><td>${esc((s.fields || {}).mercadoria || '')}</td><td>${esc(st[q.status] || q.status || '')}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">Nenhuma cotação.</td></tr>'}</tbody></table></div></div>`;
      return;
    }
    if (param === 'nova') { if (!ed || ed.id) { ed = nova(); editando = false; modo = 'pct'; } return editor(el); }
    if (param) { if (!ed || ed.id !== param) { if (!abrir(param)) { H.estado.param = null; return H.telas.cotacoes(el); } } return editor(el); }
    ed = null;
    const lista = H.db.qindex.filter(q => q && q.id).map(q => ({ q, s: H.db.quotes[q.id] || {} }))
      .filter(({ q, s }) => (!filtro || (q.status || 'draft') === filtro) && (!busca || [q.label, q.cliente, (s.fields || {}).mercadoria, (s.fields || {}).opNum].join(' ').toLowerCase().includes(busca.toLowerCase())))
      .sort((a, b) => (b.q.ts || 0) - (a.q.ts || 0));
    const n = st => H.db.qindex.filter(q => q && (q.status || 'draft') === st).length;
    const mes = W.hojeISO().slice(0, 7);
    const aprovMes = H.db.qindex.filter(q => q && q.status === 'ok' && new Date(q.ts || 0).toISOString().slice(0, 7) === mes);
    el.innerHTML = `
      <div class="head"><div><h1>Cotações & Propostas</h1><p class="sub">Cotação → aprovação do Samir → proposta em PDF no padrão WindGate. Nada sai sem aprovação.</p></div>
        <div class="btns"><input type="search" class="inp" id="cqb" placeholder="Buscar cliente, OP, mercadoria…" value="${esc(busca)}">
          <div class="seg">${[['', 'Todas'], ['draft', 'Rascunho'], ['wait', 'Aguardando'], ['ok', 'Aprovadas']].map(([k, l]) => `<button data-st="${k}" class="${filtro === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          ${H.pode('fin.autorizar') ? `<button class="btn" id="cflag" title="Cotação com vários clientes no mesmo contêiner">Vários clientes: ${W.multiClienteLigado(H.db) ? 'ligado' : 'desligado'}</button>` : ''}
          <button class="btn pri" id="cqn">+ Nova cotação</button></div></div>
      <div class="kpis">
        <div class="kpi"><span class="lbl">Cotações</span><span class="v">${H.db.qindex.length}</span><span class="d">na lista</span></div>
        <div class="kpi"><span class="lbl">Rascunho</span><span class="v">${n('draft')}</span><span class="d">em montagem</span></div>
        <div class="kpi"><span class="lbl">Aguardando o Samir</span><span class="v">${n('wait')}</span><span class="d ${n('wait') ? 'bad' : 'good'}">${n('wait') ? 'aprovar a margem' : 'nada pendente'}</span></div>
        <div class="kpi"><span class="lbl">Aprovadas</span><span class="v">${n('ok')}</span><span class="d">proposta liberada</span></div>
        <div class="kpi"><span class="lbl">Aprovadas no mês</span><span class="v">${aprovMes.length}</span><span class="d">${W.fmtBRLk(aprovMes.reduce((a, q) => a + (+q.preco || 0), 0))}</span></div></div>
      <div class="box"><div class="box-h"><h2>Cotações salvas</h2><span class="note">${lista.length} de ${H.db.qindex.length}</span></div>
        ${lista.length ? `<div class="tw"><table><thead><tr><th>Nº</th><th>Cliente</th><th>Mercadoria</th><th>Tipo</th><th class="num">Preço</th><th>Situação</th><th>Criada por</th><th></th></tr></thead><tbody>
        ${lista.map(({ q, s }) => { const f = s.fields || {}; return `<tr class="click" data-q="${esc(q.id)}"><td class="mono"><b>${esc(f.opNum || '—')}</b></td><td>${esc(q.cliente || f.cliente || '—')}</td><td>${esc(f.mercadoria || '—')}</td>
          <td>${W.ehMultiCliente(s) ? pill(s.clientes.length + ' clientes', 'info') : f.tipoOp === 'triangular' ? pill('triangular', 'info') : 'direta'}</td><td class="num">${fmt(+q.preco || 0)}</td>
          <td>${stPill(q.status)}${s.editadoEm ? `<br><small class="note">editada ${W.dataBR(s.editadoEm)}${s.editadoPor ? ' · ' + esc(s.editadoPor) : ''}</small>` : ''}${q.status === 'ok' && s.aprovadoPor ? `<br><small class="note">por ${esc(s.aprovadoPor)}</small>` : ''}</td>
          <td>${esc(q.criadoPor || '—')}</td><td class="num" style="white-space:nowrap"><button class="btn ghost sm" data-del="${esc(q.id)}" title="Tirar da lista (a cotação continua guardada)">Arquivar</button></td></tr>`; }).join('')}</tbody></table></div>`
        : `<p class="empty">Nenhuma cotação${busca || filtro ? ' com esse filtro' : ' salva ainda'}.</p>`}</div>`;
    el.querySelector('#cqb').addEventListener('keydown', e => { if (e.key === 'Enter') { busca = e.target.value; H.render(); } });
    el.querySelector('#cqb').addEventListener('search', e => { busca = e.target.value; H.render(); });
    el.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { filtro = b.dataset.st; H.render(); });
    const fl = el.querySelector('#cflag');
    if (fl) fl.onclick = () => { const p = H.db.hubPainel = H.db.hubPainel || {}; p._flags = Object.assign({}, p._flags, { multiCliente: !W.multiClienteLigado(H.db) }); H.salvar(); H.toast(W.multiClienteLigado(H.db) ? 'Vários clientes: <b>ligado</b>.' : 'Vários clientes: <b>desligado</b>. As cotações com vários clientes ficam só para leitura.'); H.render(); };
    el.querySelector('#cqn').onclick = () => { ed = nova(); editando = false; modo = 'pct'; H.ir('cotacoes', 'nova'); };
    el.querySelectorAll('tr[data-q]').forEach(r => r.onclick = e => { if (e.target.closest('[data-del]')) return; H.ir('cotacoes', r.dataset.q); });
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => arquivar(b.dataset.del));
  };

  /* Arquivar tira da lista (qindex); a cotação continua em quotes e o
     sistema atual e o histórico seguem achando. Nada é apagado. */
  function arquivar(id) {
    const q = H.db.qindex.find(x => x && x.id === id); if (!q) return;
    const m = H.modal('Arquivar cotação', `<p>Tirar <b>${esc(q.label || id)}</b> da lista? A cotação continua guardada (nada é apagado) e pode ser recuperada pelo histórico.</p>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn pri" id="arqok">Arquivar</button>');
    m.querySelector('#arqok').onclick = () => { H.db.qindex = H.db.qindex.filter(x => x !== q); H.salvar(); H.fecharModal(); H.toast('Cotação arquivada'); H.render(); };
  }

  /* ================= EDITOR ================= */
  const F = k => ed.fields[k] == null ? '' : ed.fields[k];
  const inp = (k, l, o) => { o = o || {}; return `<div class="f ${o.w || ''} ${o.cls || ''}" ${o.hidden ? 'hidden' : ''}><label class="lbl" for="cf_${k}">${esc(l)}</label><input id="cf_${k}" data-f="${k}" class="inp" value="${esc(F(k))}" ${o.tipo ? `type="${o.tipo}"` : 'inputmode="decimal"'} ${o.titulo ? `title="${esc(o.titulo)}"` : ''}></div>`; };
  const sel = (k, l, ops, o) => { o = o || {}; return `<div class="f ${o.w || ''}"><label class="lbl" for="cf_${k}">${esc(l)}</label><select id="cf_${k}" data-f="${k}" class="inp">${ops.map(([v, t]) => `<option value="${esc(v)}" ${String(F(k)) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`; };

  function editor(el) {
    const multi = W.ehMultiCliente(ed), tri = !multi && F('tipoOp') === 'triangular', bloq = travada();
    const ufs = [[W.SEM_DIFAL, '— sem DIFAL —']].concat(Object.keys(W.ICMS_INTERNO).sort().map(uf => [uf, `${uf} · interna ${W.ICMS_INTERNO[uf].toLocaleString('pt-BR')}%`]));
    const clientes = [...new Set((H.db.crm || []).map(c => c && (c.empresa || c.nome)).filter(Boolean))];
    el.innerHTML = `
      <div class="head"><div><button class="btn ghost sm" id="cvolta">← Cotações</button><h1 style="margin-top:6px">${ed.id ? 'Cotação ' + esc(F('opNum') || 'sem nº') : 'Nova cotação'}${F('cliente') ? ' · ' + esc(F('cliente')) : ''}</h1>
        <p class="sub">${stPill(ed.status)} ${ed.aprovadoPor && ed.status === 'ok' ? 'aprovada por ' + esc(ed.aprovadoPor) : ed.status === 'wait' ? 'aguardando o Samir aprovar a margem' : 'Davi monta → envia → Samir aprova a margem → proposta liberada'}</p></div>
        <div class="btns"><button class="btn" id="cnova">+ Nova</button>${bloq ? (semFlag() ? '' : '<button class="btn blue" id="cedit">Editar cotação</button>') : '<button class="btn" id="csalva">Salvar</button>'}
          ${multi || ed.status !== 'ok' ? '' : '<button class="btn" id="clink" title="Link para o cliente. Avisa quando ele abrir.">Link da proposta</button>'}${multi ? '' : `<button class="btn pri" id="cprop" ${ed.status === 'ok' ? '' : 'disabled title="Liberada depois da aprovação do Samir"'}>Gerar proposta (PDF)</button>`}</div></div>
      ${semFlag() ? '<div class="banner">Cotação com <b>vários clientes</b>: somente leitura enquanto a função estiver desligada.</div>' : bloq ? `<div class="banner">Cotação <b>aprovada</b>${ed.aprovadoPor ? ' por <b>' + esc(ed.aprovadoPor) + '</b>' : ''}: somente leitura. Para corrigir, clique em <b>Editar cotação</b>. Se o preço mudar, ela volta para a aprovação.</div>`
        : ed.status === 'ok' ? '<div class="banner">Editando uma cotação já aprovada. Se o <b>preço ao cliente</b> mudar, ela volta para a aprovação do Samir; o resto pode ser corrigido sem refazer o fluxo.</div>' : ''}
      <div class="g2 larga" style="align-items:start"><fieldset id="cform" ${bloq ? 'disabled' : ''} style="border:0;padding:0;margin:0;min-width:0;display:flex;flex-direction:column;gap:16px">
        ${blocoClientes(bloq, ufs, clientes)}
        <div class="box"><div class="box-h"><h2>Dados da operação</h2></div><div class="box-b fields">
          ${multi ? '' : `${sel('tipoOp', 'Tipo de operação', [['direta', 'Direta: cliente CONTRIBUINTE (SF/AL → cliente)'], ['triangular', 'Triangular via JeT: cliente NÃO contribuinte (SF/AL → JeT/ES → cliente)']], { w: 'w2' })}
          ${inp('opNum', 'Nº da operação', { tipo: 'text' })}${sel('ufDestino', 'UF destino', ufs)}
          <div class="f w2"><label class="lbl" for="cf_cliente">Cliente</label><input id="cf_cliente" data-f="cliente" class="inp" list="cdlcli" value="${esc(F('cliente'))}"><datalist id="cdlcli">${clientes.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
          ${inp('servFora', 'Serviço WindGate por fora (R$)', { hidden: !tri })}
          ${inp('mercadoria', 'Mercadoria', { tipo: 'text', w: 'w2' })}`}${inp('origem', 'Origem', { tipo: 'text' })}${inp('destino', 'Destino', { tipo: 'text' })}
          ${sel('incoterm', 'Incoterm', [['FOB', 'FOB'], ['CIF', 'CIF'], ['EXW', 'EXW'], ['CFR', 'CFR']])}${sel('modalCntr', 'Contêiner', [['FCL', 'FCL: contêiner completo'], ['LCL', 'LCL: compartilhado']])}
          ${inp('qtdCntr', 'Qtd. contêineres')}${inp('prazo', 'Prazo estimado (dias)')}${inp('validade', 'Validade da proposta (dias)')}${inp('validadeFrete', 'Validade do frete', { tipo: 'date' })}${inp('prazoProposta', 'Prazo na proposta (dias)', { tipo: 'text' })}${inp('descontoProposta', 'Desconto comercial (R$)')}
          ${tri ? '<p class="note w4">Triangular: a SF importa com o benefício de AL, vende à <b>JeT (ES)</b> com o mark-up mínimo, e a JeT vende ao cliente e recolhe o <b>DIFAL</b>.</p>' : ''}</div></div>
        <div class="box"><div class="box-h"><h2>Fotos do produto</h2><span class="note">${(ed.fotos || []).length} / 6</span></div><div class="box-b">
          <p class="note" style="margin-bottom:8px">Até 6 fotos numa página da proposta. Sem foto, a proposta sai sem essa página.</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px">${(ed.fotos || []).map((f, i) => `<div style="position:relative;border:1px solid var(--line);border-radius:6px;overflow:hidden;aspect-ratio:1;background:var(--surface-2)"><img src="${esc(f.url)}" alt="${esc(f.nome || 'Foto ' + (i + 1))}" loading="lazy" style="width:100%;height:100%;object-fit:contain">${bloq ? '' : `<button class="btn ghost sm" data-foto="${esc(f._id)}" style="position:absolute;top:4px;right:4px" title="Tirar da cotação">✕</button>`}</div>`).join('')}${Array.from({ length: subindo }, () => '<div class="note" style="display:grid;place-items:center;border:1px dashed var(--line);border-radius:6px;aspect-ratio:1">enviando…</div>').join('')}</div>
          ${bloq ? '' : `<input type="file" id="cfotos" accept="image/*" multiple hidden><button class="btn sm" id="cfotob" style="margin-top:8px" ${(ed.fotos || []).length + subindo >= 6 ? 'disabled' : ''}>+ Adicionar fotos</button>`}</div></div>
        <div class="box"><div class="box-h"><h2>Câmbio & regras fiscais</h2><span id="cptax" class="note"></span></div><div class="box-b fields">
          ${inp('txFrete', 'Taxa USD: frete')}${inp('txDesp', 'Taxa USD: despesas/FOB')}${inp('pctInv', '% Invoice (base impostos)')}${inp('icmsEnt', 'ICMS entrada AL (%)')}
          ${inp('icmsDest', 'ICMS destacado saída (%)')}${inp('pisS', 'PIS saída (%)')}${inp('cofS', 'COFINS saída (%)')}${inp('ipiS', 'IPI saída (%)', { titulo: 'IPI destacado na nota de saída: entra por fora, sobre o valor da NF' })}
          ${inp('mkp', 'Mark-up NF (%)')}${inp('mkSF', 'Mark-up SF → JeT (R$)', { hidden: !tri })}${inp('mkJT', 'Mark-up JeT → cliente (R$)', { hidden: !tri })}
          ${inp('outrasAdu', 'Outras desp. aduaneiras (R$)', { titulo: 'Armazenagem, scanner, THC e demais despesas aduaneiras: entram na base do ICMS de importação' })}${multi ? '' : inp('aliqST', 'Alíq. efetiva DIFAL (%)')}
          <p class="note w4" id="cnotadifal"></p>
          <p class="note w4" id="cavisoinv" style="color:var(--warn)"></p></div></div>
        <div class="box"><div class="box-h"><h2>Itens da invoice</h2>${bloq ? '' : '<button class="btn sm" id="citem">+ Item</button>'}</div>
          <div class="tw"><table><thead><tr>${multi ? '<th>Cliente</th>' : ''}<th style="min-width:180px">Descrição</th><th>NCM</th><th class="num">Qtd</th><th class="num">Unit. USD</th><th class="num" title="Preço final por unidade na proposta. Item com preço fixo, como um acessório, fica fora do rateio.">Preço fixo (R$)</th><th class="num">Peso (kg)</th>${multi ? '<th class="num" title="Por unidade, como o peso">CBM (m³)</th>' : ''}<th class="num">II %</th><th class="num">IPI %</th><th class="num">PIS %</th><th class="num">COFINS %</th><th title="Convênio 52/91">52/91</th><th title="PIS/COFINS monofásico">Mono</th><th class="num">FOB R$</th><th></th></tr></thead><tbody>
          ${ed.items.map((it, i) => { const n = (k, w, step) => `<input class="inp" data-it="${i}" data-c="${k}" value="${esc(it[k] == null ? (k === 'pis' ? 2.1 : k === 'cofins' ? 9.65 : '') : it[k])}" inputmode="decimal" style="width:${w}px;text-align:right">`;
            return `<tr>${multi ? `<td><select class="inp" data-it="${i}" data-c="clienteId" style="min-width:110px"><option value="">— cliente —</option>${ed.clientes.map((c, k) => `<option value="${esc(c.id)}" ${it.clienteId === c.id ? 'selected' : ''}>${esc(c.nome || 'Cliente ' + (k + 1))}</option>`).join('')}</select></td>` : ''}<td><textarea class="inp" data-it="${i}" data-c="d" rows="1" style="width:100%;min-width:170px;resize:vertical">${esc(it.d || '')}</textarea></td><td><input class="inp mono" data-it="${i}" data-c="ncm" value="${esc(it.ncm || '')}" style="width:100px" maxlength="10"></td>
            <td>${n('q', 70)}</td><td>${n('u', 90)}</td><td>${n('pf', 90)}</td><td>${n('p', 80)}</td>${multi ? `<td>${n('cbm', 70)}</td>` : ''}<td>${n('ii', 60)}</td><td>${n('ipi', 60)}</td><td>${n('pis', 60)}</td><td>${n('cofins', 66)}</td>
            <td style="text-align:center"><input type="checkbox" data-it="${i}" data-c="c5291" ${it.c5291 ? 'checked' : ''}></td><td style="text-align:center"><input type="checkbox" data-it="${i}" data-c="mono" ${it.mono ? 'checked' : ''}></td>
            <td class="num" id="cfob_${i}">—</td><td>${bloq ? '' : `<button class="btn ghost sm" data-rmit="${i}" title="Remover item">✕</button>`}</td></tr>`; }).join('')}</tbody></table></div>
          <div class="box-b"><p class="note" id="cncm"></p><p class="note" id="cncmcurto" style="color:var(--warn)"></p></div></div>
        <div class="box"><div class="box-h"><h2>Frete, seguro & despesas de nacionalização</h2></div><div class="box-b">
          <div class="fields">${inp('freteUSD', 'Frete internacional (USD)')}${inp('seguro', 'Seguro (R$)')}${inp('capatazia', 'Capatazia (R$)')}${inp('transporte', 'Transporte terrestre (R$)')}
            <p class="lbl w4" style="margin-top:6px">Rateadas por item (compõem a base do ICMS de entrada)</p>${inp('siscomex', 'Taxa Siscomex (R$)')}${inp('afrmm', 'AFRMM (R$)')}${inp('honorarios', 'Honorários despachante (R$)')}</div>
          <p class="lbl" style="margin-top:12px">Demais despesas (porto · agente de carga · bancárias)</p>
          <div class="list">${ed.exps.map((e, i) => `<div class="row"><input class="inp" data-ex="${i}" data-c="l" value="${esc(e.l || '')}" placeholder="Descrição" style="flex:1"><input class="inp" data-ex="${i}" data-c="v" value="${esc(e.v)}" inputmode="decimal" style="width:120px;text-align:right">${bloq ? '' : `<button class="btn ghost sm" data-rmex="${i}">✕</button>`}</div>`).join('')}</div>
          ${bloq ? '' : '<button class="btn sm" id="cexp" style="margin-top:8px">+ Despesa</button>'}</div></div>
        ${multi ? blocoRateio() + blocoDesembolso(bloq) : blocoParcelas(bloq)}
      </fieldset>
      <div class="box" style="position:sticky;top:12px"><div class="box-h"><h2>Custo da operação</h2>${stPill(ed.status)}</div><div class="box-b" id="cresumo"></div>
        <div class="box-b" style="border-top:1px solid var(--line)">${multi ? '' : `<h3 class="h3">Margem WindGate</h3>
          <div class="seg" style="margin:6px 0 10px">${[20, 25, 30].map(p => `<button data-mp="${p}" ${bloq ? 'disabled' : ''}>${p}%</button>`).join('')}</div>
          <div class="fields" style="grid-template-columns:1fr 1fr"><div class="f"><label class="lbl" for="cf_margemPct">Margem (% s/ custo)</label><input id="cf_margemPct" class="inp" data-marg="pct" value="${esc(F('margemPct'))}" inputmode="decimal" ${bloq ? 'disabled' : ''}></div>
            <div class="f"><label class="lbl" for="cf_margemBRL">Margem (R$)</label><input id="cf_margemBRL" class="inp" data-marg="brl" value="${esc(F('margemBRL'))}" inputmode="decimal" ${bloq ? 'disabled' : ''}></div></div>
          <p class="note" style="margin-top:8px">Referência histórica (mai/25–jul/26): margem líquida mediana ≈26% s/ receita · faixa 10%–50%. Aço/escoras 13%–43% · Máquinas 10%–18% · cotações pequenas 45%+.</p>`}
          <div id="cpreco" style="margin-top:10px"></div>
          <div id="ccambio" style="margin-top:12px"></div>
          <div class="btns" style="margin-top:10px;flex-direction:column;align-items:stretch">
            ${ed.status === 'draft' ? '<button class="btn blue" id="cenvia">Enviar para aprovação · Samir</button>' : ''}
            ${ed.status === 'wait' && podeAprovar() ? `${multi ? '' : '<button class="btn pri" id="caprova">Aprovar margem e liberar proposta</button>'}<button class="btn" id="cdevolve">Devolver para ajuste</button>` : ''}
            ${ed.status === 'ok' ? `<button class="btn" id="cop">Criar operação + previsto no Financeiro</button>` : ''}</div>
          <p class="note" style="margin-top:8px">${multi ? 'Cada cliente é aprovado e tem a sua proposta. Os botões ficam no resumo, ao lado do nome.' : ed.status === 'wait' && !podeAprovar() ? 'Enviada. Aguardando o Samir aprovar a margem; o PDF é liberado em seguida.' : ed.status === 'ok' ? 'Proposta liberada: gere o PDF no padrão WindGate.' : 'Nada sai sem aprovação.'}</p></div></div></div>`;
    ligar(el);
    atualizar(el);
  }

  /* ---------- Cronograma de desembolso: de 1 a 8 parcelas ---------- */
  const souSamir = () => H.userKey === 'samir';
  function blocoParcelas(bloq) {
    const ps = W.parcelasDe(ed), modo = W.modoCobertura(ed), hist = (ed.coberturaHist || []).slice(-1)[0];
    const opt = (lista, v) => lista.map(([k, l]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
    const campo = (i, k, v, o) => { o = o || {}; return `<input class="inp" data-parc="${i}" data-pcampo="${k}" id="cp_${k}_${i}" value="${esc(v == null ? '' : v)}" ${o.tipo ? `type="${o.tipo}"` : ''} ${o.num ? 'inputmode="decimal"' : ''} ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${o.lista ? `list="${o.lista}"` : ''} style="width:${o.w || 120}px${o.num ? ';text-align:right' : ''}">`; };
    return `<div class="box"><div class="box-h"><h2>Cronograma de desembolso: cliente × fábrica</h2>${bloq ? '' : '<button class="btn blue sm" id="csug">Sugerir distribuição</button>'}</div><div class="box-b">
      <div class="fields">${inp('fabSinal', 'Sinal à fábrica (%)')}
        <div class="f w2"><label class="lbl" for="ccob">Regra de cobertura</label><select id="ccob" ${souSamir() ? '' : 'disabled'}>${opt([['etapa', 'Por etapa: cada recebimento cobre a saída dele'], ['acumulada', 'Acumulada: o saldo nunca fica negativo']], modo)}</select>
          <small class="note">${souSamir() ? 'Só o Samir troca.' : 'Só o Samir troca esta regra.'}${hist ? ` Última troca: ${esc(hist.por)} em ${esc(W.dataBR(String(hist.em).slice(0, 10)))}.` : ''}</small></div>
        <p class="note">Padrão das fábricas: 30% para iniciar a produção e 70% na finalização.</p></div>
      <datalist id="cpnomes">${W.NOMES_ETAPA.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <div class="tw" style="margin-top:10px"><table><thead><tr><th>#</th><th>Etapa</th><th>Saída ligada</th><th class="num">Nossa saída</th><th class="num">% do total</th><th class="num">Recebimento do cliente (R$)</th><th class="num">Saldo acumulado</th><th>Situação</th><th></th></tr></thead><tbody>
        ${ps.map((p, i) => `<tr><td class="mono"><b>${i + 1}</b></td><td>${campo(i, 'nome', p.nome, { w: 130, lista: 'cpnomes' })}</td>
          <td><select class="inp" data-parc="${i}" data-pcampo="vinculo" style="width:140px">${opt(W.VINCULOS, p.vinculo)}</select></td><td class="num" id="cpo${i}">—</td>
          <td class="num">${campo(i, 'pct', '', { num: true, w: 56 })}</td><td class="num">${campo(i, 'valor', p.valor || '', { num: true, w: 105 })}</td>
          <td class="num" id="cpa${i}">—</td><td id="cps${i}"></td><td>${bloq || ps.length <= 1 ? '' : `<button class="btn ghost sm" type="button" data-rmp="${i}" title="Remover parcela">✕</button>`}</td></tr>
          <tr class="sub"><td></td><td colspan="8"><div class="row" style="gap:6px;flex-wrap:wrap;align-items:center">
            ${campo(i, 'gatilho', p.gatilho, { w: 230, ph: 'Gatilho: ex. em até 72h após o aviso de presença de carga' })}
            <label class="note">Data ${campo(i, 'data', p.data, { tipo: 'date', w: 140 })}</label>
            <label class="note">ou ${campo(i, 'diasAposAnterior', p.diasAposAnterior != null ? p.diasAposAnterior : '', { num: true, w: 56, ph: 'dias' })} dias após a anterior</label>
            <label class="note"><input type="checkbox" data-parc="${i}" data-pcampo="ouDepois" ${p.ouDepois ? 'checked' : ''} style="width:auto"> o que ocorrer depois</label>
            <label class="note">Reajuste cambial (R$) ${campo(i, 'reajuste', p.reajuste || '', { num: true, w: 90 })}</label>${campo(i, 'reajusteObs', p.reajusteObs, { w: 200, ph: 'Obs. do reajuste: ex. 1ª remessa · PTAX 5,56' })}</div></td></tr>`).join('')}</tbody></table></div>
      ${bloq || ps.length >= W.MAX_PARCELAS ? '' : '<button class="btn sm" type="button" id="cpadd" style="margin-top:8px">+ Parcela</button>'}
      <p class="note" id="cdbase" style="margin-top:6px"></p><p class="note" id="cdtot"></p><div id="cderr"></div></div></div>`;
  }
  /** Lê o que foi digitado numa parcela. Devolve true se precisa redesenhar. */
  function digitouParcela(t) {
    if (t.dataset.parc == null) return null;
    const ps = W.parcelasDe(ed), i = +t.dataset.parc, k = t.dataset.pcampo, p = ps[i]; if (!p) return null;
    if (k === 'pct') { const base = W.precoDesem(R); if (!(base > 0)) return false; p.valor = +(base * (parseFloat(String(t.value).replace(',', '.')) || 0) / 100).toFixed(2); const v = document.getElementById('cp_valor_' + i); if (v) v.value = p.valor; }
    else if (k === 'ouDepois') p.ouDepois = t.checked;
    else if (k === 'diasAposAnterior') { if (t.value === '') delete p.diasAposAnterior; else p.diasAposAnterior = t.value; }
    else p[k] = t.value;
    W.definirParcelas(ed, ps);
    return false;
  }
  function desenharCobertura(el) {
    const cob = W.coberturaDesembolso(ed, R), base = W.precoDesem(R), acum = cob.modo === 'acumulada';
    cob.linhas.forEach(l => {
      const i = l.i, o = el.querySelector('#cpo' + i); if (!o) return;
      o.textContent = fmt(l.saida);
      el.querySelector('#cpa' + i).innerHTML = `<span style="${l.saldoAcum < -0.005 ? 'color:var(--crit);font-weight:700' : ''}">${fmt(l.saldoAcum)}</span>`;
      el.querySelector('#cps' + i).innerHTML = !l.recebe && !l.saida ? pill('—') : acum ? (l.cobre ? pill('saldo ok', 'ok') : pill('saldo negativo', 'crit')) : !l.recebe ? pill('—') : l.cobre ? pill('cobre (+' + fmt(l.recebe - l.saida) + ')', 'ok') : pill('NÃO cobre', 'crit');
      const p = el.querySelector('#cp_pct_' + i); if (p && document.activeElement !== p) p.value = base > 0 && l.parcela.valor ? (l.parcela.valor / base * 100).toFixed(1) : '';
    });
    const n = cob.linhas.length, soma = cob.base;
    el.querySelector('#cdbase').innerHTML = (R.tri ? `As parcelas fecham com <b>${fmt(base)}</b>, o preço fechado: o DIFAL de ${fmt(R.tri.difal || 0)} é recolhido pela JeT em GNRE e já está dentro dele.`
      : (R.st || 0) > 0 ? `As parcelas fecham com <b>${fmt(base)}</b>: preço ${fmt(R.preco || 0)} menos o ICMS-DIFAL ${fmt(R.st || 0)}, que o cliente recolhe em guia própria.` : `As parcelas fecham com <b>${fmt(base)}</b>, o preço aprovado.`)
      + (base > 0 && soma ? ' ' + (Math.round(Math.abs(soma - base) * 100) <= 1 ? pill(`as ${n} somam 100%`, 'ok') : pill(`as ${n} somam ${(soma / base * 100).toFixed(1)}%`, 'crit')) : '');
    el.querySelector('#cdtot').innerHTML = `Valor base <b>${fmt(cob.base)}</b> + reajustes cambiais <b>${fmt(cob.reajustes)}</b> = <b>${fmt(cob.total)}</b>`;
    return cob;
  }

  /* Recalcula e reescreve só os números — os campos não são redesenhados,
     para não tirar o cursor de quem está digitando. */
  function atualizar(el) {
    if (W.ehMultiCliente(ed)) return atualizarMulti(el);
    R = W.calcular(ed, { modo, usuario: eu() });
    const tri = F('tipoOp') === 'triangular';
    // A margem que não está sendo digitada acompanha a outra (marginFromPct/marginFromBRL).
    if (modo === 'pct') ed.fields.margemBRL = R.margemBRLCampo.toFixed(2); else ed.fields.margemPct = String(R.margemPctCampo);
    const outro = el.querySelector(modo === 'pct' ? '#cf_margemBRL' : '#cf_margemPct'); if (outro && document.activeElement !== outro) outro.value = modo === 'pct' ? ed.fields.margemBRL : ed.fields.margemPct;
    const txD = parseFloat(F('txDesp')) || 0;
    ed.items.forEach((it, i) => { const c = el.querySelector('#cfob_' + i); if (c) c.textContent = fmt((+it.q || 0) * (+it.u || 0) * txD); });
    const linha = (l, v, forte) => `<div class="row"><span${forte ? ' style="font-weight:700"' : ' class="note"'}>${l}</span><span class="num"${forte ? ' style="font-weight:700"' : ''}>${fmt(v)}</span></div>`;
    const t = R.tri && R.tri.apuracao;
    el.querySelector('#cresumo').innerHTML = `<div class="list">
      ${linha('1 · Compra (FOB + frete + seguro)', R.compra)}${linha('2 · Impostos de nacionalização', R.impostos)}${linha('3 · Despesas de nacionalização', R.despesas)}
      ${linha('Resultante saída (impostos − créditos)', R.resultante)}${linha(tri ? 'Custo SF (nacionalização AL)' : 'Custo real WindGate', R.custoReal, true)}
      ${tri ? `${linha('NF de ENTRADA (SF nacionaliza)', R.tri.nfEntrada)}${linha('Piso da NF de saída', R.tri.piso)}${linha('NF de saída SF → JeT (piso + mark-up)', R.tri.nfSF)}${linha('NF da JeT ao cliente (base do DIFAL)', R.tri.nfJT)}
        ${linha('DIFAL (JeT → cliente)' + (t.bloco5.internaDestino != null ? ' · ' + t.bloco5.difalPct.toFixed(2).replace('.', ',') + '%' : ' · sem DIFAL'), R.tri.difal)}${linha('ICMS líquido da perna ES (s/ mark-up da JeT)', R.tri.icmsES)}
        ${linha('Resultante de impostos (saída − créditos)', R.tri.resultante)}${linha('Custo total do grupo (SF + JeT)', R.tri.custoGrupo, true)}`
        : linha(W.ICMS_INTERNO[F('ufDestino')] != null ? `ICMS DIFAL (cliente ${esc(F('ufDestino'))})` : 'ICMS DIFAL', R.st)}</div>
      ${t && (t.travas.length || t.alertas.length) ? `<div style="margin-top:8px">${t.travas.map(x => `<p class="note" style="color:var(--crit);font-weight:700">⛔ ${esc(x.msg)}</p>`).join('')}${t.alertas.map(x => `<p class="note" style="color:${x.gravidade === 'alta' ? 'var(--crit)' : 'var(--warn)'}">⚠ ${esc(x.msg)}</p>`).join('')}</div>` : ''}`;
    el.querySelector('#cpreco').innerHTML = `<div class="row" style="font-size:18px"><b>${tri ? 'Preço produtos ao cliente (NF JeT)' : 'Preço ao cliente'}</b><b class="num">${fmt(R.preco)}</b></div>
      <div class="row"><span class="note">Margem % s/ preço</span><span class="num">${pct(R.margemSobrePreco)}</span></div>
      ${R.warnMargem ? '<div class="banner" style="margin-top:6px">Margem abaixo de 10%: confirmar com o Samir se é estratégico.</div>' : ''}`;
    const uf = F('ufDestino'), interna = W.ICMS_INTERNO[uf];
    el.querySelector('#cnotadifal').innerHTML = (interna == null ? 'Destino <b>sem DIFAL</b>: nada é calculado de ICMS de destino.' : `DIFAL ${esc(uf)} = ${interna.toLocaleString('pt-BR')}% interna − ${(parseFloat(F('icmsDest')) || 0).toLocaleString('pt-BR')}% destacado. Não inclui FCP/FECP nem produto com alíquota própria.`)
      + ' PIS/COFINS de <b>saída</b>; os de importação vêm da NCM de cada item. Ajuste só com validação da contadora.';
    el.querySelector('#cavisoinv').innerHTML = (parseFloat(F('pctInv')) || 0) < 100 ? '⚠ <b>% Invoice</b> abaixo de 100% calcula os tributos sobre menos que o valor da invoice. O Simulador Siscomex usa sempre o valor aduaneiro integral.' : '';
    el.querySelector('#cncmcurto').textContent = R.ncmCurto ? '⚠ Existe NCM com menos de 8 dígitos: confira antes de aprovar.' : '';
    /* desembolso */
    const cob = desenharCobertura(el);
    const errs = W.desemErros(ed, R), preenchido = cob.linhas.some(l => l.parcela.valor);
    painelCambio(el);
    /* Bloqueia só o que impede a proposta (vazio, soma diferente). Saída maior que o recebimento é aviso, com a diferença. */
    const avisos = W.desemAvisos(ed, R);
    el.querySelector('#cderr').innerHTML = (errs.length && preenchido ? `<div class="banner crit" style="margin-top:8px">⛔ <b>Bloqueado:</b> ${errs.map(esc).join('<br>⛔ ')}</div>` : '')
      + (avisos.length ? `<div class="banner" style="margin-top:8px">⚠ <b>Atenção ao caixa (não bloqueia):</b> ${avisos.map(esc).join('<br>⚠ ')}</div>` : '')
      + (!errs.length && !avisos.length ? `<div class="banner ok" style="margin-top:8px"><b>Regra do desembolso atendida:</b> ${cob.modo === 'acumulada' ? 'o saldo acumulado nunca fica negativo' : 'em todas as etapas o recebimento cobre a saída'} e a soma fecha com o valor a receber.</div>` : '');
  }

  /* ================= VÁRIOS CLIENTES ================= */
  const clienteEd = id => (ed.clientes || []).find(c => c.id === id);
  const inpCli = (c, k, w, o) => { o = o || {}; return `<input class="inp" id="ccl_${esc(c.id)}_${k}" data-cli="${esc(c.id)}" data-cc="${k}" value="${esc(c[k] == null ? '' : c[k])}" ${o.lista ? `list="${o.lista}"` : ''} ${o.num ? 'inputmode="decimal"' : ''} style="width:${w}px${o.num ? ';text-align:right' : ''}">`; };
  function blocoClientes(bloq, ufs, nomes) {
    const ligado = W.multiClienteLigado(H.db);
    if (!W.ehMultiCliente(ed)) {
      if (!ligado || bloq || ed.status !== 'draft') return '';
      return `<div class="box"><div class="box-h"><h2>Clientes deste contêiner</h2><button class="btn sm" id="cladd">+ Outro cliente no contêiner</button></div><div class="box-b"><p class="note">Esta cotação tem um cliente. Se outro cliente dividir o contêiner, adicione aqui: cada um passa a ter seu cálculo e seu cronograma.</p></div></div>`;
    }
    const opt = (lista, v) => lista.map(([k, l]) => `<option value="${esc(k)}" ${String(v) === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('');
    return `<div class="box"><div class="box-h"><h2>Clientes deste contêiner</h2>${bloq ? '' : '<button class="btn sm" id="cladd">+ Cliente</button>'}</div>
      <datalist id="cdlcli">${nomes.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
      <div class="tw"><table><thead><tr><th>Cliente</th><th>UF</th><th>Tipo</th><th>Nº op.</th><th>Mercadoria</th><th class="num">DIFAL %</th><th class="num" title="ICMS de entrada. Vazio: o do contêiner.">ICMS ent. %</th><th class="num" title="Mark-up SF → JeT, em reais. Só na triangular.">Mk SF</th><th class="num" title="Mark-up JeT → cliente, em reais. Só na triangular.">Mk JeT</th><th class="num">Margem %</th><th class="num">Margem R$</th><th></th></tr></thead><tbody>
      ${ed.clientes.map(c => `<tr><td>${inpCli(c, 'nome', 130, { lista: 'cdlcli' })}</td>
        <td><select class="inp" id="ccl_${esc(c.id)}_ufDestino" data-cli="${esc(c.id)}" data-cc="ufDestino" style="width:66px">${opt(ufs.map(([k]) => [k, k === W.SEM_DIFAL ? 'sem DIFAL' : k]), c.ufDestino)}</select></td>
        <td><select class="inp" data-cli="${esc(c.id)}" data-cc="tipoOperacao" style="width:96px">${opt([['direta', 'Direta'], ['triangular', 'Triangular']], c.tipoOperacao)}</select></td>
        <td>${inpCli(c, 'opNum', 70)}</td><td>${inpCli(c, 'mercadoria', 110)}</td><td>${inpCli(c, 'aliqST', 50, { num: true })}</td><td>${inpCli(c, 'icmsEnt', 50, { num: true })}</td><td>${inpCli(c, 'mkSF', 62, { num: true })}</td><td>${inpCli(c, 'mkJT', 62, { num: true })}</td><td>${inpCli(c, 'margemPct', 50, { num: true })}</td><td>${inpCli(c, 'margemRS', 88, { num: true })}</td>
        <td>${bloq ? '' : `<button class="btn ghost sm" data-clrm="${esc(c.id)}" title="Tirar este cliente">✕</button>`}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  function blocoRateio() {
    const rg = ed.regraRateio || {}, manual = W.GRUPOS_RATEIO.some(([g]) => rg[g] === 'manual');
    return `<div class="box"><div class="box-h"><h2>Rateio dos custos comuns</h2></div>
      <div class="box-b"><p class="note">A regra decide quem paga cada custo. Os impostos continuam calculados por item, com frete, seguro e capatazia pelo FOB, como na DI.</p></div>
      <div class="tw"><table><thead><tr><th>Custo</th><th>Regra</th><th>Quanto fica com cada cliente</th></tr></thead><tbody>
      ${W.GRUPOS_RATEIO.map(([g, l]) => `<tr><td>${esc(l)}</td><td><select class="inp" data-rg="${g}" style="width:150px">${W.REGRAS_RATEIO.map(([k, t]) => `<option value="${k}" ${(rg[g] || W.RATEIO_PADRAO[g]) === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></td><td class="note" id="crv_${g}">—</td></tr>`).join('')}</tbody></table></div>
      ${manual ? `<div class="box-b fields"><p class="lbl w4">Percentual manual por cliente (soma 100%)</p>${ed.clientes.map((c, k) => `<div class="f"><label class="lbl" for="cpc_${esc(c.id)}">${esc(c.nome || 'Cliente ' + (k + 1))}</label><input class="inp" id="cpc_${esc(c.id)}" data-pc="${esc(c.id)}" value="${esc(((rg.percentuais || {})[c.id]) == null ? '' : rg.percentuais[c.id])}" inputmode="decimal"></div>`).join('')}</div>` : ''}
      <div class="box-b" id="cravisos"></div></div>`;
  }
  /* Parcelas do cliente: as 3 etapas de sempre (desR1..desR3) ou, depois de "+ Parcela", a lista dele (até 8). */
  function linhasParcelasCliente(c, bloq) {
    const id = esc(c.id);
    if (!(Array.isArray(c.parcelas) && c.parcelas.length))
      return [[1, '1 · Assinatura'], [2, '2 · Produto pronto'], [3, '3 · Chegada ao porto']].map(([n, t]) => `<tr><td><b>${t}</b></td><td class="num" id="cmo_${id}_${n}">—</td><td class="num">${inpCli(c, 'desR' + n, 130, { num: true })}</td><td class="num" id="cma_${id}_${n}">—</td><td id="cms_${id}_${n}"></td><td></td></tr>`).join('');
    return c.parcelas.map((p, i) => `<tr><td><span class="mono">${i + 1}</span> <input class="inp" data-cpl="${id}" data-cpi="${i}" data-cpk="nome" value="${esc(p.nome || '')}" list="cpnomes" style="width:150px"></td>
      <td class="num" id="cmo_${id}_${i + 1}">—</td><td class="num"><input class="inp" data-cpl="${id}" data-cpi="${i}" data-cpk="valor" value="${esc(p.valor || '')}" inputmode="decimal" style="width:130px;text-align:right"></td>
      <td class="num" id="cma_${id}_${i + 1}">—</td><td id="cms_${id}_${i + 1}"></td><td>${bloq || i < 3 ? '' : `<button class="btn ghost sm" type="button" data-cprm="${id}:${i}" title="Remover parcela">✕</button>`}</td></tr>`).join('')
      + `<datalist id="cpnomes">${W.NOMES_ETAPA.map(n => `<option value="${esc(n)}">`).join('')}</datalist>`;
  }
  function blocoDesembolso(bloq) {
    return `<div class="box"><div class="box-h"><h2>Cronograma de desembolso por cliente</h2></div><div class="box-b">
      <div class="fields">${inp('fabSinal', 'Sinal à fábrica (%)')}<p class="note w3">A fábrica é paga uma vez; a saída de cada cliente é proporcional ao FOB dele. O recebimento de cada cliente em cada etapa cobre a saída dele.</p></div>
      ${ed.clientes.map((c, k) => `<div style="margin-top:14px"><div class="row"><h3 class="h3">${esc(c.nome || 'Cliente ' + (k + 1))}</h3>${bloq ? '' : `<button class="btn blue sm" data-sugc="${esc(c.id)}">Sugerir distribuição</button>`}</div>
        <div class="tw"><table><thead><tr><th>Etapa</th><th class="num">Saída dele</th><th class="num">Recebimento (R$)</th><th class="num">Saldo acumulado</th><th>Situação</th><th></th></tr></thead><tbody>
        ${linhasParcelasCliente(c, bloq)}</tbody></table></div>
        ${bloq || (Array.isArray(c.parcelas) && c.parcelas.length >= W.MAX_PARCELAS) ? '' : `<button class="btn sm" type="button" data-cpadd="${esc(c.id)}" style="margin-top:6px">+ Parcela</button>`}
        <div id="cme_${esc(c.id)}"></div></div>`).join('')}</div></div>`;
  }
  /* ================= CÂMBIO DA PROPOSTA: painel interno, nunca vai para o cliente ================= */
  const num4 = v => (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const ptaxDaProposta = () => (ed.cambioProposta && ed.cambioProposta.ptax) || parseFloat(String(F('ptaxProposta') || '').replace(',', '.')) || (H.ptax && +H.ptax.venda) || 0;
  function tabelaSimulacao(q, nome) {
    const s = W.simulacaoCambio(q, ptaxDaProposta()); if (!s) return '';
    return `${nome ? `<p class="lbl" style="margin-top:10px">${esc(nome)}</p>` : ''}<div class="tw"><table><thead><tr><th>Dólar</th><th>Parcela</th><th class="num">Cliente</th><th class="num">Custo</th><th class="num">Lucro</th></tr></thead><tbody>
      ${s.cenarios.map(c => c.parcelas.map((p, i) => `<tr>${i === 0 ? `<td rowspan="${c.parcelas.length}" class="mono">${num4(c.dolar)}<br><small class="note">${c.delta > 0 ? '+' : ''}${c.delta.toFixed(2).replace('.', ',')}${c.dentro ? ' · na faixa' : ''}</small></td>` : ''}<td>${p.n}ª</td><td class="num">${fmt(p.preco)}</td><td class="num">${fmt(p.custo)}</td><td class="num" style="${p.lucro < 0 ? 'color:var(--crit);font-weight:700' : ''}">${fmt(p.lucro)}</td></tr>`).join('')).join('')}</tbody></table></div>`;
  }
  function painelCambio(el, clientes) {
    const box = el.querySelector('#ccambio'); if (!box) return;
    const congelado = !!ed.cambioProposta, ptax = ptaxDaProposta(), ref = W.referenciaDaProposta(ptax), bloq = travada();
    const campoAtivo = document.activeElement && document.activeElement.id === 'cptaxprop';
    if (!campoAtivo) box.innerHTML = `<h3 class="h3">Câmbio da proposta</h3>
      <div class="f" style="margin:6px 0"><label class="lbl" for="cptaxprop">PTAX de venda do dia da proposta</label><input class="inp" id="cptaxprop" inputmode="decimal" value="${ptax ? ptax.toFixed(4).replace('.', ',') : ''}" ${congelado || bloq ? 'disabled' : ''}></div><div id="ccamb2"></div>`;
    const b2 = el.querySelector('#ccamb2');
    b2.innerHTML = ref ? `<p class="note">Referência <b>${num4(ref.referencia)}</b> · faixa ${num4(ref.piso)} a ${num4(ref.teto)}${congelado ? ' · fixada na aprovação' : ''}. Simulação interna: não vai para o cliente.</p>${clientes ? clientes.map(c => tabelaSimulacao(c.q, c.nome)).join('') : tabelaSimulacao(ed)}` : '<p class="note">Informe a PTAX do dia para ver a simulação. A aprovação fixa a referência.</p>';
    const i = el.querySelector('#cptaxprop');
    if (i && !campoAtivo) i.oninput = () => { ed.fields.ptaxProposta = i.value; painelCambio(el, clientes); };
  }
  /** Fixa a referência na aprovação. Sem PTAX, a aprovação espera. */
  function fixarCambio() {
    if (ed.cambioProposta) return true;
    const ptax = ptaxDaProposta(); if (!ptax) { H.toast('Informe a <b>PTAX de venda do dia da proposta</b> antes de aprovar.'); return false; }
    ed.cambioProposta = W.congelarCambio(ed, ptax, W.hojeISO());
    return true;
  }

  function atualizarMulti(el) {
    const rm = W.calcularPorCliente(ed, { usuario: eu() });
    if (rm.clientes.length) painelCambio(el, rm.clientes.map(c => ({ q: c.q, nome: c.nome })));
    R = { preco: rm.total ? rm.total.preco : 0 };
    const txD = parseFloat(F('txDesp')) || 0;
    ed.items.forEach((it, i) => { const c = el.querySelector('#cfob_' + i); if (c) c.textContent = fmt((+it.q || 0) * (+it.u || 0) * txD); });
    const nome = (c, k) => esc(c.nome || 'Cliente ' + (k + 1));
    const av = el.querySelector('#cravisos');
    if (av) av.innerHTML = rm.erros.map(x => `<p class="note" style="color:var(--crit);font-weight:700">⛔ ${esc(x)}</p>`).join('') + rm.travas.map(x => `<p class="note" style="color:var(--crit);font-weight:700">⛔ ${esc(x.msg)}</p>`).join('') + rm.avisos.map(x => `<p class="note" style="color:var(--warn)">⚠ ${esc(x)}</p>`).join('');
    const resumo = el.querySelector('#cresumo'), preco = el.querySelector('#cpreco');
    if (rm.erros.length) { resumo.innerHTML = `<p class="note">Falta completar a cotação: ${esc(rm.erros[0])}</p>`; preco.innerHTML = ''; W.GRUPOS_RATEIO.forEach(([g]) => { const v = el.querySelector('#crv_' + g); if (v) v.textContent = '—'; }); return; }
    const lin = (a, b, forte) => `<div style="display:flex;justify-content:space-between;gap:8px${forte ? ';font-weight:700' : ''}"><span${forte ? '' : ' class="note"'}>${a}</span><span class="num">${b}</span></div>`;
    resumo.innerHTML = `${rm.clientes.map((c, k) => `<div style="padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid var(--line)"><div style="display:flex;justify-content:space-between;gap:8px"><b>${nome(c, k)}</b>${c.R.tri ? pill('triangular', 'info') : ''}</div>
        ${(st => `<div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px;margin:4px 0">${st === 'ok' ? pill('aprovado', 'ok') : st === 'wait' ? pill('aguardando o Samir', 'warn') : pill('rascunho')}<span>${st === 'ok' ? `<button class="btn sm" data-linkc="${esc(c.id)}">Link</button> <button class="btn sm" data-pdfc="${esc(c.id)}">Proposta (PDF)</button>` : st === 'wait' ? (podeAprovar() ? `<button class="btn pri sm" data-aprc="${esc(c.id)}">Aprovar</button> <button class="btn sm" data-devc="${esc(c.id)}">Devolver</button>` : '') : `<button class="btn blue sm" data-envc="${esc(c.id)}">Enviar</button>`} <button class="btn ghost sm" data-desc="${esc(c.id)}">Desistiu</button></span></div>`)((clienteEd(c.id) || {}).status)}
        ${lin('FOB', fmt(c.R.fob))}${lin('Custo', fmt(c.custo))}${lin('DIFAL', fmt(c.R.tri ? c.R.tri.difal : c.R.st))}${lin('Margem s/ custo', pct(c.R.margemPctCampo) + ' · ' + fmt(c.R.margem))}${lin('Preço', fmt(c.R.preco), true)}${(s => s ? lin('Se ficasse sozinho', 'custo ' + fmt(s.custo) + ' · margem ' + fmt(s.margem)) : '')(W.sozinhoNoConteiner(ed, c.id, W.precoDesem(c.R)))}
        ${c.R.warnMargem ? '<p class="note" style="color:var(--warn);margin-top:4px">⚠ Margem abaixo de 10%.</p>' : ''}</div>`).join('')}
      ${lin('Total FOB', fmt(rm.total.fob))}${lin('Total de custo', fmt(rm.total.custo), true)}`;
    resumo.onclick = ev => {
      const a = ev.target.closest('[data-aprc]'), p = ev.target.closest('[data-pdfc]'), lk = ev.target.closest('[data-linkc]'), en = ev.target.closest('[data-envc]'), dv = ev.target.closest('[data-devc]'), ds = ev.target.closest('[data-desc]');
      if (lk) linkProposta(lk.dataset.linkc);
      if (en) enviarCli(el, en.dataset.envc);
      if (dv) { W.devolverCliente(ed, dv.dataset.devc); ed.status = W.statusDaCotacao(ed); salvar(true, true); H.toast('Cliente devolvido para ajuste.'); editor(el); }
      if (ds) desistiuModal(el, ds.dataset.desc);
      if (a) aprovarCli(el, a.dataset.aprc);
      if (p) { pdfCliente = p.dataset.pdfc; propostaModal(); }
    };
    preco.innerHTML = `<div style="display:flex;justify-content:space-between;gap:8px;font-size:18px"><b>Soma dos preços</b><b class="num">${fmt(rm.total.preco)}</b></div>`;
    W.GRUPOS_RATEIO.forEach(([g]) => { const v = el.querySelector('#crv_' + g); if (v) v.textContent = rm.clientes.map((c, k) => (c.nome || 'Cliente ' + (k + 1)) + ': ' + fmt(c.R.custoPor[g])).join(' · '); });
    rm.clientes.forEach(cc => {
      const c = clienteEd(cc.id), id = c.id, cm = el.querySelector(`#ccl_${id}_${c.margemModo === 'brl' ? 'margemPct' : 'margemRS'}`);
      // A margem que não está sendo digitada acompanha a outra, como na cotação de um cliente.
      if (c.margemModo === 'brl') c.margemPct = String(cc.R.margemPctCampo); else c.margemRS = cc.R.margemBRLCampo.toFixed(2);
      if (cm && document.activeElement !== cm) cm.value = c.margemModo === 'brl' ? c.margemPct : c.margemRS;
      const cob = W.coberturaDesembolso(cc.q, cc.R), rs = cob.linhas.map(l => l.parcela.valor);
      cob.linhas.forEach(l => { const n = l.n, s = el.querySelector(`#cmo_${id}_${n}`); if (s) s.textContent = fmt(l.saida);
        const a = el.querySelector(`#cma_${id}_${n}`); if (a) a.innerHTML = `<span style="${l.saldoAcum < -0.005 ? 'color:var(--crit);font-weight:700' : ''}">${fmt(l.saldoAcum)}</span>`;
        const t = el.querySelector(`#cms_${id}_${n}`); if (t) t.innerHTML = !l.recebe && !l.saida ? pill('—') : !l.recebe ? pill('—') : l.cobre ? pill('cobre (+' + fmt(l.recebe - l.saida) + ')', 'ok') : pill('NÃO cobre', 'crit'); });
      const errs = W.desemErros(cc.q, cc.R), box = el.querySelector('#cme_' + id);
      const av = W.desemAvisos(cc.q, cc.R);
      if (box) box.innerHTML = errs.length && rs.some(Boolean) ? `<div class="banner crit" style="margin-top:8px">⛔ ${errs.map(esc).join('<br>⛔ ')}</div>` : av.length ? `<div class="banner" style="margin-top:8px">⚠ <b>Não bloqueia:</b> ${av.map(esc).join('<br>⚠ ')}</div>` : !errs.length ? `<div class="banner ok" style="margin-top:8px">Recebimento cobre a saída em todas as etapas. A receber: <b>${fmt(W.precoDesem(cc.R))}</b>.</div>` : `<p class="note" style="margin-top:6px">A receber: <b>${fmt(W.precoDesem(cc.R))}</b>.</p>`;
    });
  }
  function ligarMulti(el) {
    const add = el.querySelector('#cladd'); if (add) add.onclick = () => { W.adicionarCliente(ed); editor(el); };
    el.querySelectorAll('[data-clrm]').forEach(b => b.onclick = () => {
      const id = b.dataset.clrm, c = clienteEd(id), n = W.itensDoCliente(ed, id).length;
      if (!n) { W.removerCliente(ed, id); return editor(el); }
      const m = H.modal('Tirar cliente', `<p>${esc(c.nome || 'Este cliente')} tem <b>${n} item(ns)</b>. Eles ficam sem dono até você escolher outro cliente.</p>`, '<button class="btn" data-x>Cancelar</button><button class="btn pri" id="clrmok">Tirar</button>');
      m.querySelector('#clrmok').onclick = () => { H.fecharModal(); W.removerCliente(ed, id); editor(el); };
    });
    el.querySelectorAll('[data-sugc]').forEach(b => b.onclick = () => {
      const c = clienteEd(b.dataset.sugc), cc = W.calcularPorCliente(ed, { usuario: eu() }).clientes.find(x => x.id === c.id);
      if (!cc || !(cc.R.preco > 0)) return H.toast('Complete a cotação primeiro.');
      if (Array.isArray(c.parcelas) && c.parcelas.length) { W.definirParcelasCliente(c, W.sugerirParcelas(cc.q, cc.R)); return editor(el); }
      Object.assign(c, W.desemSugerir(cc.q, cc.R));
      [1, 2, 3].forEach(n => { const i = el.querySelector(`#ccl_${c.id}_desR${n}`); if (i) i.value = c['desR' + n]; });
      atualizarMulti(el);
    });
    /* "+ Parcela": o cliente passa a ter a lista dele, começando pelas 3 etapas que já tinha. */
    el.querySelectorAll('[data-cpadd]').forEach(b => b.onclick = () => {
      const c = clienteEd(b.dataset.cpadd); if (!c) return;
      const ps = Array.isArray(c.parcelas) && c.parcelas.length ? c.parcelas.slice() : W.parcelasDe(W.cotacaoDoCliente(ed, c.id));
      if (ps.length >= W.MAX_PARCELAS) return;
      ps.push({ id: 'p' + Date.now(), nome: ps.length === 3 ? 'Entrega na obra' : 'Outra', vinculo: 'nenhuma', valor: 0, diasAposAnterior: 20 });
      W.definirParcelasCliente(c, ps); editor(el);
    });
    el.querySelectorAll('[data-cprm]').forEach(b => b.onclick = () => {
      const [cid, i] = b.dataset.cprm.split(':'), c = clienteEd(cid); if (!c || !Array.isArray(c.parcelas)) return;
      const ps = c.parcelas.slice(); ps.splice(+i, 1); W.definirParcelasCliente(c, ps); editor(el);
    });
    el.querySelectorAll('[data-rg]').forEach(s => s.onchange = () => { ed.regraRateio = Object.assign({}, ed.regraRateio, { [s.dataset.rg]: s.value }); editor(el); });
  }
  /* Digitação nos campos de cliente. Devolve true se o campo era deste bloco. */
  function digitouMulti(t, el) {
    if (t.dataset.pc) { const r = ed.regraRateio = Object.assign({}, ed.regraRateio); r.percentuais = Object.assign({}, r.percentuais, { [t.dataset.pc]: parseFloat(t.value) || 0 }); atualizar(el); return true; }
    if (t.dataset.cpl != null) {
      const c = clienteEd(t.dataset.cpl); if (!c || !Array.isArray(c.parcelas)) return true;
      const ps = c.parcelas.map(p => Object.assign({}, p)), p = ps[+t.dataset.cpi]; if (!p) return true;
      p[t.dataset.cpk] = t.value; W.definirParcelasCliente(c, ps); atualizar(el); return true;
    }
    if (!t.dataset.cli) return false;
    const c = clienteEd(t.dataset.cli), k = t.dataset.cc; if (!c) return true;
    c[k] = t.value;
    if (k === 'margemPct') c.margemModo = 'pct';
    if (k === 'margemRS') c.margemModo = 'brl';
    if (k === 'tipoOperacao') c.clienteContribuinte = t.value !== 'triangular';
    if (k === 'ufDestino') { const interna = W.ICMS_INTERNO[t.value]; if (interna != null) { c.aliqST = String(+Math.max(interna - (parseFloat(F('icmsDest')) || 0), 0).toFixed(2)); const a = el.querySelector(`#ccl_${c.id}_aliqST`); if (a) a.value = c.aliqST; } }
    atualizar(el); return true;
  }

  function ligar(el) {
    ligarMulti(el);
    const on = (s, fn) => { const x = el.querySelector(s); if (x) x.onclick = fn; };
    on('#cvolta', () => { ed = null; H.ir('cotacoes'); });
    on('#cnova', () => { ed = nova(); editando = false; modo = 'pct'; H.ir('cotacoes', 'nova'); });
    on('#cedit', () => { editando = true; H.toast('Cotação destravada: se o preço mudar, volta para aprovação.'); editor(el); });
    on('#csalva', () => salvar(false) && editor(el));
    on('#cprop', propostaModal);
    on('#clink', () => linkProposta());
    on('#cenvia', () => enviar(el));
    on('#caprova', () => aprovar(el));
    on('#cdevolve', () => { ed.status = 'draft'; if (salvar(true, true)) { H.toast('Devolvida para ajuste.'); editor(el); } });
    on('#cop', () => criarOperacao());
    on('#csug', () => { if (!(R && R.preco > 0)) return H.toast('Complete a cotação primeiro.'); W.definirParcelas(ed, W.sugerirParcelas(ed, R)); W.parcelasDe(ed).forEach((p, i) => { const v = el.querySelector('#cp_valor_' + i); if (v) v.value = p.valor; }); atualizar(el); H.toast('Distribuição sugerida: cada parcela cobre a sua saída; 35% da margem já no sinal e no saldo.'); });
    on('#cpadd', () => { const ps = W.parcelasDe(ed); if (ps.length >= W.MAX_PARCELAS) return; ps.push({ id: 'p' + Date.now(), nome: ps.length === 3 ? 'Entrega na obra' : 'Outra', vinculo: 'nenhuma', valor: 0, diasAposAnterior: 20 }); W.definirParcelas(ed, ps); editor(el); });
    el.querySelectorAll('[data-rmp]').forEach(b => b.onclick = () => { const ps = W.parcelasDe(ed); if (ps.length <= 1) return; ps.splice(+b.dataset.rmp, 1); W.definirParcelas(ed, ps); editor(el); });
    const cob = el.querySelector('#ccob'); if (cob) cob.onchange = () => { const r = W.mudarCobertura(ed, cob.value, eu(), souSamir()); if (!r.ok) { H.toast(esc(r.msg)); cob.value = W.modoCobertura(ed); return; } if (r.mudou) H.toast(`Cobertura <b>${cob.value === 'acumulada' ? 'acumulada' : 'por etapa'}</b>: fica registrado que foi você.`); atualizar(el); };
    on('#citem', () => { ed.items.push(W.ITEM_PADRAO()); editor(el); });
    ptaxNaCotacao(el, travada());
    on('#cexp', () => { ed.exps.push({ l: '', v: 0 }); editor(el); });
    on('#cfotob', () => el.querySelector('#cfotos').click());
    const fi = el.querySelector('#cfotos'); if (fi) fi.onchange = () => enviarFotos(fi, el);
    el.querySelectorAll('[data-foto]').forEach(b => b.onclick = () => { ed.fotos = ed.fotos.filter(f => f._id !== b.dataset.foto); if (ed.id) salvar(true, true); editor(el); });
    el.querySelectorAll('[data-rmit]').forEach(b => b.onclick = () => { ed.items.splice(+b.dataset.rmit, 1); editor(el); });
    el.querySelectorAll('[data-rmex]').forEach(b => b.onclick = () => { ed.exps.splice(+b.dataset.rmex, 1); editor(el); });
    el.querySelectorAll('[data-mp]').forEach(b => b.onclick = () => { modo = 'pct'; ed.fields.margemPct = b.dataset.mp; el.querySelector('#cf_margemPct').value = b.dataset.mp; atualizar(el); });
    const form = el.querySelector('#cform');
    form.addEventListener('input', e => {
      const t = e.target;
      if (digitouMulti(t, el)) return;
      if (t.dataset.parc != null) { digitouParcela(t); return atualizar(el); }
      if (t.dataset.f) {
        ed.fields[t.dataset.f] = t.value;
        if (t.dataset.f === 'tipoOp') return editor(el);
      } else if (t.dataset.it != null) {
        const it = ed.items[+t.dataset.it], c = t.dataset.c;
        if (t.type === 'checkbox') it[c] = t.checked; else if (c === 'd' || c === 'ncm' || c === 'clienteId') it[c] = t.value; else it[c] = parseFloat(t.value) || 0;
        if (c === 'ncm') return ncmDigitada(+t.dataset.it, t.value, el);
      } else if (t.dataset.ex != null) {
        const e2 = ed.exps[+t.dataset.ex]; if (t.dataset.c === 'v') e2.v = parseFloat(t.value) || 0; else e2.l = t.value;
      } else if (t.dataset.pct) {
        const base = W.precoDesem(R); if (!(base > 0)) return;
        const n = t.dataset.pct; ed.fields['desR' + n] = (base * (parseFloat(t.value) || 0) / 100).toFixed(2); el.querySelector('#cf_desR' + n).value = ed.fields['desR' + n];
      }
      atualizar(el);
    });
    form.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.f === 'ufDestino') { const interna = W.ICMS_INTERNO[t.value]; if (interna != null) { ed.fields.aliqST = String(+Math.max(interna - (parseFloat(F('icmsDest')) || 0), 0).toFixed(2)); const a = el.querySelector('#cf_aliqST'); if (a) a.value = ed.fields.aliqST; } atualizar(el); }
      if (t.dataset.f === 'tipoOp' || (t.dataset.f && t.tagName === 'SELECT')) { ed.fields[t.dataset.f] = t.value; editor(el); }
      if (t.type === 'checkbox' && t.dataset.it != null) atualizar(el);
    });
    el.querySelectorAll('[data-marg]').forEach(i => i.addEventListener('input', () => {
      modo = i.dataset.marg; ed.fields[modo === 'pct' ? 'margemPct' : 'margemBRL'] = i.value; atualizar(el);
    }));
  }

  /* NCM digitada: alíquotas do Catálogo (conferidas), senão tabela, senão a
     oficial (TEC/TIPI) do servidor; a descrição oficial vem do Siscomex. */
  let tNcm = null;
  function ncmDigitada(i, raw, el) {
    const ncm = String(raw || '').replace(/\D/g, ''), it = ed.items[i]; if (!it) return;
    const box = el.querySelector('#cncm');
    if (ncm.length < 2) { box.innerHTML = ''; return atualizar(el); }
    const tax = W.aliquotasNCM(H.db, ncm);
    Object.assign(it, { ii: tax.ii, ipi: tax.ipi, pis: tax.pis, cofins: tax.cofins });
    if (tax.c5291 !== undefined) it.c5291 = tax.c5291; if (tax.mono !== undefined) it.mono = tax.mono;
    if (!it.d || String(it.d).startsWith('Item') || !String(it.d).trim()) it.d = tax.desc;
    const linhaInputs = el.querySelectorAll(`[data-it="${i}"]`);
    linhaInputs.forEach(x => { const c = x.dataset.c; if (c === 'ncm') return; if (x.type === 'checkbox') x.checked = !!it[c]; else if (c === 'd') x.value = it.d || ''; else if (['ii', 'ipi', 'pis', 'cofins'].includes(c)) x.value = it[c]; });
    atualizar(el);
    box.innerHTML = dicaNCM(ncm, tax, i);
    ligarDica(el, i);
    if (ncm.length < 8) return;
    clearTimeout(tNcm);
    tNcm = setTimeout(async () => {
      try {
        if (W.aliquotasNCM(H.db, ncm).origem !== 'lib') {
          const ja = await (await H.api('/api/aliquotas/' + ncm)).json();
          if (ja.encontrado) { if (ja.ii != null) it.ii = ja.ii; if (ja.ipi != null) it.ipi = ja.ipi; linhaInputs.forEach(x => { if (x.dataset.c === 'ii') x.value = it.ii; if (x.dataset.c === 'ipi') x.value = it.ipi; }); atualizar(el);
            box.innerHTML = `<span style="color:var(--ok)">NCM ${esc(ncm)}: alíquota aplicada (TEC/TIPI oficial) II <b>${ja.ii}%</b> · IPI <b>${ja.ipi != null ? ja.ipi : '—'}%</b>${ja.reduzida ? ` · TEC base ${ja.iiTec}%${ja.fundamentacao ? ' (' + esc(ja.fundamentacao) + ')' : ''}` : ''}.</span> ${esc(ja.desc || '')} <button class="btn ghost sm" data-ncmsalva="${i}">Fixar no Catálogo</button>`; ligarDica(el, i); }
        }
        const r = await H.api('/api/ncm/' + ncm);
        if (r.ok) { const j = await r.json(); if (j.success && j.data && j.data.descricao && (!it.d || it.d === tax.desc)) { it.d = j.data.descricao; linhaInputs.forEach(x => { if (x.dataset.c === 'd') x.value = it.d; }); } }
      } catch (e) { /* consulta oficial indisponível: valem as alíquotas acima */ }
    }, 300);
  }
  function dicaNCM(ncm, tax, i) {
    const linha = `II <b>${tax.ii}%</b> · IPI <b>${tax.ipi}%</b> · PIS <b>${tax.pis}%</b> · COFINS <b>${tax.cofins}%</b>`;
    const sim = '<a href="https://portalunico.siscomex.gov.br/ttce/#/simulador-calculo" target="_blank" rel="noopener">conferir no Simulador Siscomex</a>';
    if (tax.origem === 'lib') return `<span style="color:var(--ok)">NCM ${esc(ncm)}: alíquotas conferidas e salvas pela equipe${tax.por ? ' (' + esc(tax.por) + ')' : ''}: ${linha}.</span> ${sim}`;
    const rot = tax.origem === 'tabela' ? 'tabela interna (não conferida na fonte oficial)' : tax.origem === 'capitulo' ? `estimativa pelo capítulo ${esc(ncm.slice(0, 2))}: <b>não é a alíquota desta NCM</b>` : 'valor genérico: <b>não é a alíquota desta NCM</b>';
    return `<span style="color:var(--warn)">NCM ${esc(ncm)}: ${rot}: ${linha}.</span> ${sim} · <button class="btn ghost sm" data-ncmsalva="${i}">Salvar estas alíquotas no Catálogo</button>`;
  }
  function ligarDica(el, i) {
    el.querySelectorAll('[data-ncmsalva]').forEach(b => b.onclick = () => {
      const it = ed.items[+b.dataset.ncmsalva], ncm = String(it.ncm || '').replace(/\D/g, '');
      if (ncm.length !== 8) return H.toast('A NCM precisa de 8 dígitos.');
      if (!H.db.ncmlib || typeof H.db.ncmlib !== 'object') H.db.ncmlib = {};
      H.db.ncmlib[ncm] = Object.assign({}, H.db.ncmlib[ncm], W.registroNCM(it, eu()));
      H.salvar(); H.toast(`NCM ${ncm} salva no Catálogo: passa a valer para toda a equipe.`);
      el.querySelector('#cncm').innerHTML = dicaNCM(ncm, W.aliquotasNCM(H.db, ncm), i);
    });
  }

  /* ================= DÓLAR PELA PTAX ================= */
  /* PTAX de compra do Banco Central (a mesma consulta do Câmbio). Cotação nova já abre com as taxas
     do dia; nas demais o botão aplica. Aprovada e travada só mostra a referência. */
  let ptaxAutoEm = null;
  function ptaxNaCotacao(el, bloq) {
    const alvo = el.querySelector('#cptax'); if (!alvo || !H.carregarPtax) return;
    const aplicar = (t, aviso) => {
      ed.fields.txDesp = String(t.txDesp); ed.fields.txFrete = String(t.txFrete);
      ['txDesp', 'txFrete'].forEach(k => { const i = el.querySelector('#cf_' + k); if (i) i.value = ed.fields[k]; });
      atualizar(el); if (aviso) H.toast(`Taxas pela PTAX de compra: despesas/FOB ${t.txDesp.toFixed(4)} · frete ${t.txFrete.toFixed(4)}.`);
    };
    const mostrar = p => {
      if (!el.contains(alvo)) return;
      const t = p && W.taxasDaPtax(p.compra);
      if (!t) { alvo.textContent = 'PTAX indisponível agora: informe as taxas à mão.'; return; }
      const dia = W.dataBR(String(p.em || '').slice(0, 10)), igual = +F('txDesp') === t.txDesp && +F('txFrete') === t.txFrete;
      alvo.innerHTML = `PTAX compra <b>${(+p.compra).toFixed(4).replace('.', ',')}</b> (${esc(dia)}) → despesas ${t.txDesp.toFixed(4).replace('.', ',')} · frete ${t.txFrete.toFixed(4).replace('.', ',')}`
        + (bloq || igual ? '' : ' <button class="btn sm" id="cptaxok">Aplicar</button>');
      const b = alvo.querySelector('#cptaxok'); if (b) b.onclick = () => { aplicar(t, true); mostrar(p); };
      if (!bloq && !ed.id && ptaxAutoEm !== ed && !igual && F('txDesp') === W.PADRAO.txDesp && F('txFrete') === W.PADRAO.txFrete) { ptaxAutoEm = ed; aplicar(t, false); mostrar(p); }
    };
    if (H.ptax) mostrar(H.ptax); else { alvo.textContent = 'Buscando PTAX no Banco Central…'; H.carregarPtax().then(mostrar); }
  }

  /* ================= GRAVAÇÃO E APROVAÇÃO ================= */
  function salvar(silencioso, forcar) {
    garantir();
    if (W.ehMultiCliente(ed)) { W.resumirClientes(ed); const rm = W.calcularPorCliente(ed, { usuario: eu() }); R = { preco: rm.total ? rm.total.preco : 0 }; }
    else R = W.calcular(ed, { modo, usuario: eu() });
    const anterior = ed.id ? H.db.quotes[ed.id] : null;
    const r = W.prepararGravacao(ed, R, forcar && anterior && anterior.status === 'ok' && ed.status !== 'ok' ? Object.assign({}, anterior, { status: 'x' }) : anterior, editando, eu());
    if (!r.ok) { H.toast(esc(r.msg)); return false; }
    /* Vários clientes: o total pode não mudar e o preço de um deles, sim. Só quem mudou volta para aprovação. */
    if (W.ehMultiCliente(ed) && anterior) {
      const mudaram = W.revisarAprovacoes(ed), st = W.statusDaCotacao(ed);
      if (mudaram.length) H.toast(`O preço mudou: <b>${esc(mudaram.join(', '))}</b> voltou para a aprovação do Samir.`);
      r.revogou = false; r.registro.status = st; if (st !== 'ok') r.registro.aprovadoPor = null;
      r.registro.clientes = ed.clientes;
    }
    // Preço mudou e voltou para aprovação: a nova aprovação fixa a referência de novo.
    if (r.revogou) { delete ed.cambioProposta; delete r.registro.cambioProposta; }
    ed.id = r.registro.id; ed.status = r.registro.status; ed.aprovadoPor = r.registro.aprovadoPor;
    H.db.quotes[ed.id] = r.registro;
    const ix = H.db.qindex.findIndex(x => x && x.id === ed.id);
    const entrada = W.entradaIndice(ed, R, ix >= 0 ? H.db.qindex[ix] : null, eu());
    if (ix >= 0) H.db.qindex[ix] = entrada; else H.db.qindex.unshift(Object.assign({ _id: W.novoId() }, entrada));
    H.salvar();
    if (anterior && anterior.status === 'ok' && editando) {
      editando = false;
      H.toast(r.revogou ? 'O preço mudou: a cotação voltou para a <b>aprovação do Samir</b>.' : 'Cotação aprovada atualizada: o preço não mudou, a aprovação continua valendo.');
      if (r.revogou) avisarSamir();
    } else if (!silencioso) H.toast('Cotação salva.');
    if (H.estado.param === 'nova') H.estado.param = ed.id;
    return true;
  }
  function avisarSamir() {
    if (!Array.isArray(H.db.hubRecados)) H.db.hubRecados = [];
    H.db.hubRecados.push({ _id: W.novoId(), texto: `Cotação ${F('opNum') || 'sem nº'} · ${F('cliente') || ''} aguarda a sua aprovação (${fmt(R.preco)}).`, para: 'samir', prio: 'alta', por: eu() + ' · Cotações', em: new Date().toISOString(), feito: {}, quoteId: ed.id });
    H.salvar();
  }
  function enviarCli(el, id) {
    const rm = W.calcularPorCliente(ed, { usuario: eu() });
    if (rm.erros.length) return H.toast('⛔ <b>Não dá para enviar:</b> ' + esc(rm.erros[0]));
    const cc = rm.clientes.find(x => x.id === id), e = W.desemErros(cc.q, cc.R);
    if (e.length) return H.toast(`⛔ <b>${esc(cc.nome || cc.id)}:</b> ${esc(e[0])}`);
    ed.criadoPor = ed.criadoPor || eu(); W.enviarClientes(ed, id); ed.status = W.statusDaCotacao(ed);
    if (salvar(true, true)) { avisarSamir(); H.toast(`<b>${esc(cc.nome || cc.id)}</b> enviado para aprovação do Samir.`); editor(el); }
  }
  /* Antes de confirmar, mostra o que acontece com quem fica. */
  function desistiuModal(el, id) {
    const c = clienteEd(id), s = W.simularDesistencia(ed, id);
    if (s.erro) return H.toast(esc(s.erro));
    const m = H.modal(`${esc(c.nome || 'Cliente')} desistiu`, `<p>Os itens e o FOB dele saem da cotação. O preço de quem fica não muda: mudam o custo e a margem.${s.dedicado ? ' Quem fica passa a ter o <b>contêiner dedicado</b>, como operação comum, com 100% dos custos.' : ''}</p>
      <div class="tw" style="margin-top:8px"><table><thead><tr><th>Cliente</th><th class="num">Preço</th><th class="num">Custo hoje</th><th class="num">Custo depois</th><th class="num">Margem hoje</th><th class="num">Margem depois</th></tr></thead><tbody>${s.fica.map(x => `<tr><td>${esc(x.nome || '')}</td><td class="num">${fmt(x.preco)}</td><td class="num">${fmt(x.custoAntes)}</td><td class="num">${fmt(x.custo)}</td><td class="num">${fmt(x.margemAntes)}</td><td class="num"><b>${fmt(x.margem)}</b></td></tr>`).join('')}</tbody></table></div>
      <p class="note" style="margin-top:8px">O que já foi pago ou recebido fica como está. Os previstos são recalculados, sem duplicar.</p>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn pri" id="dsok">Confirmar a desistência</button>');
    m.querySelector('.modal').classList.add('larga');
    m.querySelector('#dsok').onclick = () => {
      const r = W.desistirCliente(H.db, ed, id, { por: eu(), hoje: W.hojeISO() });
      if (!r.ok) return H.toast(esc(r.msg));
      if (W.ehMultiCliente(ed)) ed.status = W.statusDaCotacao(ed);
      // O total da cotação caiu porque um cliente saiu: isso não é mudança de preço de quem ficou.
      const gravada = H.db.quotes[ed.id]; if (gravada && !W.ehMultiCliente(ed)) gravada.preco = ed.preco;
      editando = true; H.fecharModal(); salvar(true, true); editando = false;
      W.negocioDaCotacao(H.db, H.db.quotes[ed.id], { preco: R.preco, por: eu() });
      H.salvar();
      H.toast(r.dedicado ? 'Desistência registrada: a operação de quem ficou passou a ter o contêiner dedicado.' : 'Desistência registrada.');
      editor(el);
    };
  }
  function enviar(el) {
    if (W.ehMultiCliente(ed)) {
      const rm = W.calcularPorCliente(ed, { usuario: eu() });
      if (rm.erros.length) return H.toast('⛔ <b>Não dá para enviar:</b> ' + esc(rm.erros[0]));
      if (rm.travas.length) return H.toast('⛔ <b>Não dá para enviar:</b> ' + esc(rm.travas[0].msg));
      for (const cc of rm.clientes) { const e = W.desemErros(cc.q, cc.R); if (e.length) return H.toast(`⛔ <b>${esc(cc.nome || cc.id)}:</b> ${esc(e[0])}`); }
      ed.criadoPor = ed.criadoPor || eu(); W.enviarClientes(ed); ed.status = W.statusDaCotacao(ed);
      R = { preco: rm.total.preco };
      if (salvar(true)) { avisarSamir(); H.toast('Enviada para aprovação do <b>Samir</b>.'); editor(el); }
      return;
    }
    if (!ed.items.length || !(R.custoReal > 0)) return H.toast('Preencha a cotação antes de enviar.');
    const errs = W.desemErros(ed, R);
    if (errs.length) { H.toast('⛔ <b>Não dá para enviar:</b> ' + esc(errs[0])); return; }
    ed.criadoPor = ed.criadoPor || eu(); ed.status = 'wait';
    if (salvar(true)) { avisarSamir(); H.toast('Enviada para aprovação do <b>Samir</b>.'); editor(el); }
  }
  /* Aprova um cliente e já cria a filha dele. Pendentes ficam na cotação, sem filha. */
  function aprovarCli(el, id) {
    if (!podeAprovar()) return H.toast('Somente o Samir aprova margem.');
    if (!fixarCambio()) return;
    const r = W.aprovarCliente(ed, id, eu());
    if (r.rateio) {
      const m = H.modal('Rateio sem medida', `<p>${esc(r.msg)}</p><p class="note" style="margin-top:8px">O ideal é preencher CBM e peso dos itens. Aprovar assim significa ratear pelo que está disponível.</p>`, '<button class="btn" data-x>Voltar e preencher</button><button class="btn pri" id="rfok">Ratear assim e aprovar</button>');
      m.querySelector('#rfok').onclick = () => { ed.aceitaRateioSemMedida = true; H.fecharModal(); aprovarCli(el, id); };
      return;
    }
    if (!r.ok) return H.toast('⛔ <b>Não aprova:</b> ' + esc(r.msg));
    ed.status = W.statusDaCotacao(ed); if (ed.status === 'ok') ed.aprovadoPor = eu();
    const anterior = H.db.quotes[ed.id];
    if (anterior) H.db.quotes[ed.id] = Object.assign({}, anterior, { status: 'wait' });
    if (!salvar(true)) return;
    (H.db.hubRecados || []).filter(x => x && x.quoteId === ed.id && x.para === 'samir' && ed.status === 'ok').forEach(x => { x.feito = Object.assign({}, x.feito, { samir: new Date().toISOString() }); });
    const fim = () => { W.negocioDaCotacao(H.db, H.db.quotes[ed.id], { por: eu() }); H.salvar(); editor(el); };
    criarOperacoesMulti(fim);
  }
  /* Cria o que falta para os clientes aprovados. Pede o código do contêiner só se não der para saber. */
  function criarOperacoesMulti(depois) {
    const executar = codigo => {
      const r = W.criarOperacoesDaMulti(H.db, ed, { maeId: codigo, por: eu(), hoje: W.hojeISO(), modeloChecklist: H.CHK_MODELO });
      if (!r.ok) { if (r.semCodigo) return false; H.toast('⛔ ' + esc(r.msg)); return true; }
      if (H.db.quotes[ed.id]) H.db.quotes[ed.id].clientes = ed.clientes;
      H.toast(r.jaLancado ? 'Tudo já estava lançado: nada foi duplicado.' : `Contêiner <b>${esc(r.mae.id)}</b>: ${r.filhas.length} filha(s) · ${r.lancamentos.length} lançamento(s) previstos.`);
      if (depois) depois(); else { W.negocioDaCotacao(H.db, H.db.quotes[ed.id], { por: eu() }); H.salvar(); }
      if (!r.jaLancado && H.gerarContratos) H.gerarContratos(r.filhas.map(f => f.id));
      return true;
    };
    if (executar('')) return;
    const m = H.modal('Contêiner compartilhado', `<p>Qual é o código do contêiner (operação-mãe)? Cada cliente aprovado vira uma filha dele, com as parcelas e os custos só daquele cliente.</p>
      <div class="f" style="margin-top:8px"><label class="lbl" for="mcod">Código do contêiner</label><input id="mcod"></div>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn pri" id="mcok">Criar</button>');
    m.querySelector('#mcok').onclick = () => { const cod = m.querySelector('#mcod').value.trim(); if (!cod) return H.toast('Informe o código.'); ed.fields.opMae = cod.toUpperCase(); H.fecharModal(); executar(cod); };
  }
  function aprovar(el) {
    if (!podeAprovar()) return H.toast('Somente o Samir aprova margem.');
    const errs = W.desemErros(ed, R);
    if (errs.length) return H.toast('⛔ <b>Não aprova com desembolso furado:</b> ' + esc(errs[0]));
    if (!fixarCambio()) return;
    ed.aprovadoPor = eu(); ed.status = 'ok';
    const anterior = H.db.quotes[ed.id];
    // Aprovar é gravar o status novo sobre a mesma cotação: passa pela regra sem o bloqueio de "aprovada".
    if (anterior) H.db.quotes[ed.id] = Object.assign({}, anterior, { status: 'wait' });
    if (!salvar(true)) return;
    (H.db.hubRecados || []).filter(r => r && r.quoteId === ed.id && r.para === 'samir').forEach(r => { r.feito = Object.assign({}, r.feito, { samir: new Date().toISOString() }); });
    W.negocioDaCotacao(H.db, H.db.quotes[ed.id], { preco: R.preco, por: eu() });
    const ent = H.db.qindex.find(x => x && x.id === ed.id); if (ent) ent.funilEm = new Date().toISOString();
    H.salvar();
    H.toast('Margem aprovada: proposta liberada e negócio no <b>Funil</b> em Proposta enviada.');
    editor(el);
    const m = H.modal('Cotação aprovada', `<p>Criar já a operação <b>${esc((F('opNum') || '—').toUpperCase())}</b> e lançar o <b>previsto</b> no Financeiro (${W.parcelasDe(ed).length} parcela(s) do cliente e os pagamentos)?</p>`,
      '<button class="btn" data-x>Agora não</button><button class="btn pri" id="mop">Criar operação + previsto</button>');
    m.querySelector('#mop').onclick = () => { H.fecharModal(); criarOperacao(); };
  }
  function criarOperacao(confirmado) {
    if (W.ehMultiCliente(ed)) return criarOperacoesMulti();
    const r = W.operacaoDaCotacao(H.db, ed, R, eu(), W.hojeISO());
    const linhaLanc = l => `<div class="row"><span>${esc(l.desc || '')}<br><small class="note">${esc(l.op || '')} · ${esc(l.status || '')} · vencimento ${W.dataBR(l.vencimento)}</small></span><span class="num">${fmt(+l.valor || 0)}</span></div>`;
    if (r.outraOp && confirmado !== true) {
      const m = H.modal('Cotação já lançada em outra operação', `<p>Esta cotação já tem <b>${r.emOutraOp.length} lançamento(s)</b> no Financeiro, mas em outra operação:</p>
        <div class="list" style="margin-top:8px">${r.emOutraOp.map(linhaLanc).join('')}</div>
        <p class="note" style="margin-top:8px">Se a <b>${esc(r.id)}</b> é outra operação, lance o cronograma dela. Se é a mesma operação com outro número, cancele: lançar duplicaria os valores.</p>`,
        `<button class="btn" data-x>Cancelar</button><button class="btn pri" id="rlok">Lançar na ${esc(r.id)}</button>`);
      m.querySelector('#rlok').onclick = () => { H.fecharModal(); criarOperacao(true); };
      return;
    }
    if (r.jaLancado) {
      H.modal('Cronograma já lançado', `<p>A operação <b>${esc(r.id)}</b> já tem todo o cronograma desta cotação. Nada foi duplicado. Estes são os lançamentos:</p><div class="list" style="margin-top:8px">${r.existentes.map(linhaLanc).join('')}</div>
        <p class="note" style="margin-top:8px">Se não os vê no Financeiro, confira o mês e a empresa dos filtros.</p>`, '<button class="btn" data-x>Fechar</button>');
    }
    if (r.relancar && confirmado !== true) {
      const m = H.modal('Relançar no Financeiro', `<p>A operação <b>${esc(r.id)}</b> ainda tem <b>${r.jaExistem} lançamento(s)</b> desta cotação, que ficam como estão. Faltam estes, que serão lançados de novo como previstos:</p>
        <div class="list" style="margin-top:8px">${r.lancamentos.map(l => `<div class="row"><span>${esc(l.desc)}<br><small class="note">${esc(l.tipo)} · vencimento ${W.dataBR(l.vencimento)}</small></span><span class="num">${fmt(l.valor)}</span></div>`).join('')}</div>
        <p class="note" style="margin-top:8px">Os valores saem da cotação como está agora. Confira se algum deles não foi excluído de propósito.</p>`,
        '<button class="btn" data-x>Cancelar</button><button class="btn pri" id="rlok">Relançar</button>');
      m.querySelector('#rlok').onclick = () => { H.fecharModal(); criarOperacao(true); };
      return;
    }
    const agora = new Date().toISOString();
    // Lançamento desta cotação que ficou sem operação passa a ser dela.
    (r.soltos || []).forEach(l => { const atual = H.db.fin.find(x => x && x._id === l._id); if (atual) atual.op = r.id; });
    // Operação que já existia passa a ter a cotação, senão o Custeio dela fica sem simulado.
    const opExistente = !r.op && H.db.ops.find(o => o && o.id === r.id); if (opExistente && !opExistente.quoteId) opExistente.quoteId = ed.id;
    if (r.op) {
      Object.assign(r.op, { status: 'contrato', statusEm: agora, statusPor: eu() });
      H.db.ops.unshift(r.op);
      if (!Array.isArray(H.db.opStatusHist)) H.db.opStatusHist = [];
      H.db.opStatusHist.push({ _id: W.novoId(), op: r.id, de: '', para: 'contrato', em: agora, deEm: '', por: eu(), tipo: 'mudanca', origem: 'hub2-cotacao', motivo: 'Cotação aprovada' });
      if (!H.db.checklists[r.id] && H.CHK_MODELO) H.db.checklists[r.id] = H.CHK_MODELO.map(([fase, titulo]) => ({ fase, titulo, status: 'pendente', coletadoPor: '', revisadoPor: '' }));
    }
    if (H.db.quotes[ed.id]) W.negocioDaCotacao(H.db, H.db.quotes[ed.id], { preco: R.preco, por: eu() });
    if (r.jaLancado) { H.salvar(); return; }
    H.db.fin.unshift(...r.lancamentos);
    H.salvar();
    if (r.relancar) return H.toast(`<b>${r.lancamentos.length} lançamento(s)</b> relançado(s) no Financeiro para a ${esc(r.id)}.`);
    H.toast(`Operação <b>${esc(r.id)}</b> ${r.op ? 'criada' : 'atualizada'} · cronograma lançado no Financeiro (1ª parcela em ${W.dataBR(r.lancamentos[0] && r.lancamentos[0].vencimento)}).`);
    if (r.op && H.gerarContratos) H.gerarContratos([r.id]);
  }

  /* ================= FOTOS ================= */
  function reduzirFoto(file, maxLado, qualidade) {
    return new Promise((ok, erro) => {
      const fr = new FileReader(); fr.onerror = () => erro(new Error('não deu para ler o arquivo'));
      fr.onload = () => { const img = new Image(); img.onerror = () => erro(new Error('o arquivo não é uma imagem válida'));
        img.onload = () => { const lado = Math.max(img.width, img.height) || 1, f = Math.min(1, maxLado / lado), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * f)); c.height = Math.max(1, Math.round(img.height * f)); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          c.toBlob(b => b ? ok(b) : erro(new Error('falha ao converter a imagem')), 'image/jpeg', qualidade); };
        img.src = fr.result; };
      fr.readAsDataURL(file);
    });
  }
  async function enviarFotos(input, el) {
    const escolhidas = [...(input.files || [])]; input.value = '';
    const vagas = 6 - ed.fotos.length; if (vagas <= 0) return H.toast('A proposta aceita 6 fotos: remova alguma para trocar.');
    const lote = escolhidas.slice(0, vagas); if (escolhidas.length > vagas) H.toast(`Só cabiam mais ${vagas}: as demais foram ignoradas.`);
    for (const file of lote) {
      if (!/^image\//.test(file.type)) { H.toast(`${esc(file.name)} não é uma imagem.`); continue; }
      subindo++; editor(el);
      try {
        const blob = await reduzirFoto(file, 1600, 0.82), nome = (file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg';
        const fd = new FormData(); fd.append('arquivo', blob, nome);
        const r = await H.api('/api/upload', { method: 'POST', body: fd }); const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.success) throw new Error(j.message || j.error || 'falha no envio');
        if (!j.supabaseUrl) H.toast('Foto salva só neste servidor: sem o Storage ela some no próximo deploy.');
        ed.fotos.push({ _id: W.novoId(), url: j.supabaseUrl || j.finalUrl, nome: file.name || nome });
      } catch (e) { H.toast(`${esc(file.name || 'foto')}: ${esc(e.message || 'falhou')}`); }
      finally { subindo--; }
    }
    if (ed.id) salvar(true, true);
    editor(el);
  }

  /* ================= PROPOSTA EM PDF ================= */
  /* Link assinado da proposta: o cliente abre sem senha, e o negócio mostra quando e quantas vezes. */
  async function linkProposta(clienteId) {
    if (!ed.id) return H.toast('Salve a cotação primeiro.');
    if (!salvar(true)) return;
    try {
      const j = await (await H.api('/api/propostas/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quoteId: ed.id, clienteId: clienteId || '' }) })).json();
      if (!j.success) return H.toast(esc(j.message || 'Não consegui gerar o link.'));
      const url = location.origin + j.caminho;
      const m = H.modal('Link da proposta', `<p>Válido por ${j.dias} dias. A página mostra só a proposta: itens, parcelas e condições. Na primeira abertura, o dono do negócio recebe um recado.</p><div class="f" style="margin-top:8px"><label class="lbl" for="lkurl">Link</label><input id="lkurl" readonly value="${esc(url)}"></div>`, '<button class="btn" data-x>Fechar</button><button class="btn blue" id="lkcp">Copiar</button>');
      m.querySelector('#lkcp').onclick = () => { try { navigator.clipboard.writeText(url); H.toast('Link copiado.'); } catch (e) { H.toast('Copie o link no campo.'); } };
    } catch (e) { H.toast('Não consegui gerar o link.'); }
  }
  /* Com vários clientes, a proposta é de um cliente: só a parte dele, sem nada do outro. */
  let pdfCliente = null;
  const alvoProposta = () => { if (!pdfCliente) return { q: ed, R }; const cc = W.calcularPorCliente(ed, { usuario: eu() }).clientes.find(x => x.id === pdfCliente); return cc ? { q: cc.q, R: cc.R } : { q: ed, R }; };
  function propostaModal() {
    const clienteOk = pdfCliente && (clienteEd(pdfCliente) || {}).status === 'ok';
    if (ed.status !== 'ok' && !clienteOk) return H.toast('A proposta só é liberada após a <b>aprovação da margem pelo Samir</b>.');
    const alvo0 = alvoProposta();
    const errs = W.desemErros(alvo0.q, alvo0.R); if (errs.length) return H.toast('⛔ <b>Desembolso bloqueado:</b> ' + esc(errs[0]));
    const descP = parseFloat(String(W.camposDe(alvo0.q).descontoProposta || '').replace(',', '.')) || 0;
    const baseP = (alvo0.R.preco || 0) - (alvo0.R.tri ? alvo0.R.tri.difal || 0 : alvo0.R.st || 0) + descP;
    const fx = W.conferirPrecosFixos(alvo0.q, baseP); if (fx) return H.toast('⛔ ' + esc(fx));
    const b = W.propostaBlocos(ed), temFoto = (alvo0.q.fotos || []).length > 0;
    const caixa = (x, desab, nota) => `<label class="row" style="justify-content:flex-start;gap:10px;${desab ? 'opacity:.55' : ''}"><input type="checkbox" data-pb="${x.k}" ${b[x.k] && !desab ? 'checked' : ''} ${desab ? 'disabled' : ''}><span><b>${esc(x.l)}</b><br><small class="note">${nota}</small></span></label>`;
    const m = H.modal('O que entra na proposta', `<p class="note" style="margin-bottom:8px">Desmarque o que não deve aparecer no PDF deste cliente. A escolha fica salva na cotação.</p>
      <div class="list">${W.PROPOSTA_BLOCOS.map(x => { const sem = x.k === 'fotos' && !temFoto; return caixa(x, sem, sem ? 'Nenhuma foto anexada a esta cotação.' : esc(x.d)); }).join('')}</div>
      <h3 class="h3" style="margin-top:12px">Composição do investimento</h3><p class="note" style="color:var(--warn)">⚠ Abrir estas linhas ao lado do total deixa a margem dedutível por subtração.</p>
      <div class="list">${W.PROPOSTA_CUSTOS.map(x => { const v = +x.v(alvo0.R) || 0; return caixa(x, !v, v ? fmt(v) + (x.sub ? ' · ' + esc(x.sub) : '') : 'Sem valor nesta cotação.'); }).join('')}</div>`,
      '<button class="btn" id="pbtudo">Marcar tudo</button><button class="btn" data-x>Cancelar</button><button class="btn pri" id="pbgera">Gerar PDF</button>');
    m.querySelector('.modal').classList.add('larga');
    m.querySelector('#pbtudo').onclick = () => m.querySelectorAll('[data-pb]').forEach(i => { if (!i.disabled) i.checked = true; });
    m.querySelector('#pbgera').onclick = () => {
      const antes = W.propostaBlocos(ed), escolha = {};
      W.PROPOSTA_BLOCOS.concat(W.PROPOSTA_CUSTOS).forEach(x => { const i = m.querySelector(`[data-pb="${x.k}"]`); escolha[x.k] = !i || i.disabled ? antes[x.k] : !!i.checked; });
      if (!W.PROPOSTA_BLOCOS.some(x => escolha[x.k])) return H.toast('Marque ao menos um bloco do documento.');
      ed.blocos = escolha;
      if (ed.id && H.db.quotes[ed.id]) { H.db.quotes[ed.id].blocos = escolha; H.salvar(); }
      H.fecharModal(); gerarPDF();
    };
  }
  function fotoParaPDF(url) {
    return new Promise((ok, erro) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      const t = setTimeout(() => erro(new Error('demorou demais')), 15000);
      img.onload = () => { clearTimeout(t); try { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); ok({ dataURL: c.toDataURL('image/jpeg', 0.85), w: img.naturalWidth, h: img.naturalHeight }); } catch (e) { erro(e); } };
      img.onerror = () => { clearTimeout(t); erro(new Error('não carregou')); };
      img.src = url;
    });
  }
  const cnpjNum = v => String(v || '').replace(/\D/g, '');
  function cnpjFmt(v) { const d = cnpjNum(v); if (!d) return ''; return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2'); }
  const nrm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  /* Anexa a proposta gerada no cliente do CRM (crmDocs), com a versão seguinte — mesmo registro do sistema atual. */
  async function anexarNoCRM(blob, nomeArquivo, nomeCliente, quoteId) {
    try {
      const alvo = nrm(nomeCliente); if (!alvo) return { ok: false, motivo: 'cotação sem cliente' };
      const cli = (H.db.crm || []).find(c => c && [nrm(c.empresa), nrm(c.nome)].filter(Boolean).some(n => n === alvo || n.includes(alvo) || alvo.includes(n)));
      if (!cli) return { ok: false, motivo: `cliente "${nomeCliente}" não está no CRM` };
      const oport = quoteId ? (H.db.crmOps || []).find(o => o && o.quoteId === quoteId) : null;
      const fd = new FormData(); fd.append('arquivo', new File([blob], nomeArquivo, { type: 'application/pdf' }));
      const r = await H.api('/api/upload', { method: 'POST', body: fd }); const j = await r.json().catch(() => ({}));
      if (!j.success) return { ok: false, motivo: j.message || 'falha no upload' };
      if (!Array.isArray(H.db.crmDocs)) H.db.crmDocs = [];
      const iguais = H.db.crmDocs.filter(d => d && d.clienteId === cli._id && d.tipo === 'Proposta' && (d.oportunidadeId || '') === (oport ? oport._id : ''));
      const agora = new Date().toISOString();
      const d = { _id: W.novoId(), clienteId: cli._id, oportunidadeId: oport ? oport._id : '', tipo: 'Proposta', nome: nomeArquivo, link: H.linkDoUpload(j), obs: 'Gerada pelo sistema',
        versao: iguais.reduce((a, x) => Math.max(a, +x.versao || 1), 0) + 1, enviadoPor: eu(), dataUpload: agora, origem: 'proposta-automatica', removidoEm: null, removidoPor: '', acessos: [{ quem: eu(), acao: 'upload', em: agora }] };
      H.db.crmDocs.unshift(d); H.salvar();
      return { ok: true, doc: d, cliente: cli, oport };
    } catch (e) { return { ok: false, motivo: e.message || 'erro inesperado' }; }
  }
  /* Lista própria de parcelas (1 a 8): o PDF mostra todas. Cotação de sempre: os 3 cards de sempre. */
  function parcelasDoPDF(alvo) {
    if (!W.temListaPropria(alvo.q)) return {};
    const ps = W.resumoProposta(alvo.q, alvo.R).parcelas;
    return { parcelasPDF: ps.map(p => Object.assign({}, p, { previsaoBR: W.dataBR(p.previsao) })), nChegada: (ps.findIndex(p => p.chegada) + 1) || 3 };
  }
  function gerarPDF() {
    if (!window.HUB_PROPOSTA) return H.toast('Gerador da proposta não carregou.');
    let print = document.getElementById('printProposal');
    if (!print) { print = document.createElement('div'); print.id = 'printProposal'; document.body.appendChild(print); }
    const alvo = alvoProposta(), campos = W.camposDe(alvo.q);
    const P = window.HUB_PROPOSTA({
      V: k => campos[k] == null ? '' : String(campos[k]), N: k => parseFloat(campos[k]) || 0, fmt, esc, toast: H.toast, cnpjFmt,
      crmDocAnexarProposta: anexarNoCRM, desemErrors: () => W.desemErros(alvo.q, alvo.R),
      carregarFotosDaProposta: async () => { const out = []; for (const f of (alvo.q.fotos || [])) { try { out.push(await fotoParaPDF(f.url)); } catch (e) { console.warn('foto ignorada', f.url, e); } } return out; },
      openModal: () => {}, closeModal: H.fecharModal, saveDB: H.salvar, DB: H.db,
      state: Object.assign({ items: alvo.q.items, fotos: alvo.q.fotos, blocos: ed.blocos, status: 'ok', id: ed.id, tabelaCambio: W.textoCambio(W.tabelaCambio(alvo.q)) }, parcelasDoPDF(alvo)), R: alvo.R
    });
    P.gerarPropostaPDF();
  }
})();
