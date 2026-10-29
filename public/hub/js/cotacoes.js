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
  const travada = () => ed && ed.status === 'ok' && !editando;

  /* ================= LISTA ================= */
  H.telas.cotacoes = function (el, param) {
    garantir();
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
          <td>${f.tipoOp === 'triangular' ? pill('triangular', 'info') : 'direta'}</td><td class="num">${fmt(+q.preco || 0)}</td>
          <td>${stPill(q.status)}${s.editadoEm ? `<br><small class="note">editada ${W.dataBR(s.editadoEm)}${s.editadoPor ? ' · ' + esc(s.editadoPor) : ''}</small>` : ''}${q.status === 'ok' && s.aprovadoPor ? `<br><small class="note">por ${esc(s.aprovadoPor)}</small>` : ''}</td>
          <td>${esc(q.criadoPor || '—')}</td><td class="num" style="white-space:nowrap"><button class="btn ghost sm" data-del="${esc(q.id)}" title="Tirar da lista (a cotação continua guardada)">Arquivar</button></td></tr>`; }).join('')}</tbody></table></div>`
        : `<p class="empty">Nenhuma cotação${busca || filtro ? ' com esse filtro' : ' salva ainda'}.</p>`}</div>`;
    el.querySelector('#cqb').addEventListener('keydown', e => { if (e.key === 'Enter') { busca = e.target.value; H.render(); } });
    el.querySelector('#cqb').addEventListener('search', e => { busca = e.target.value; H.render(); });
    el.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { filtro = b.dataset.st; H.render(); });
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
    const tri = F('tipoOp') === 'triangular', bloq = travada();
    const ufs = [[W.SEM_DIFAL, '— sem DIFAL —']].concat(Object.keys(W.ICMS_INTERNO).sort().map(uf => [uf, `${uf} · interna ${W.ICMS_INTERNO[uf].toLocaleString('pt-BR')}%`]));
    const clientes = [...new Set((H.db.crm || []).map(c => c && (c.empresa || c.nome)).filter(Boolean))];
    el.innerHTML = `
      <div class="head"><div><button class="btn ghost sm" id="cvolta">← Cotações</button><h1 style="margin-top:6px">${ed.id ? 'Cotação ' + esc(F('opNum') || 'sem nº') : 'Nova cotação'}${F('cliente') ? ' · ' + esc(F('cliente')) : ''}</h1>
        <p class="sub">${stPill(ed.status)} ${ed.aprovadoPor && ed.status === 'ok' ? 'aprovada por ' + esc(ed.aprovadoPor) : ed.status === 'wait' ? 'aguardando o Samir aprovar a margem' : 'Davi monta → envia → Samir aprova a margem → proposta liberada'}</p></div>
        <div class="btns"><button class="btn" id="cnova">+ Nova</button>${bloq ? '<button class="btn blue" id="cedit">Editar cotação</button>' : '<button class="btn" id="csalva">Salvar</button>'}
          <button class="btn pri" id="cprop" ${ed.status === 'ok' ? '' : 'disabled title="Liberada depois da aprovação do Samir"'}>Gerar proposta (PDF)</button></div></div>
      ${bloq ? `<div class="banner">Cotação <b>aprovada</b>${ed.aprovadoPor ? ' por <b>' + esc(ed.aprovadoPor) + '</b>' : ''}: somente leitura. Para corrigir, clique em <b>Editar cotação</b>. Se o preço mudar, ela volta para a aprovação.</div>`
        : ed.status === 'ok' ? '<div class="banner">Editando uma cotação já aprovada. Se o <b>preço ao cliente</b> mudar, ela volta para a aprovação do Samir; o resto pode ser corrigido sem refazer o fluxo.</div>' : ''}
      <div class="g2 larga" style="align-items:start"><fieldset id="cform" ${bloq ? 'disabled' : ''} style="border:0;padding:0;margin:0;min-width:0;display:flex;flex-direction:column;gap:16px">
        <div class="box"><div class="box-h"><h2>Dados da operação</h2></div><div class="box-b fields">
          ${sel('tipoOp', 'Tipo de operação', [['direta', 'Direta: cliente CONTRIBUINTE (SF/AL → cliente)'], ['triangular', 'Triangular via JeT: cliente NÃO contribuinte (SF/AL → JeT/ES → cliente)']], { w: 'w2' })}
          ${inp('opNum', 'Nº da operação', { tipo: 'text' })}${sel('ufDestino', 'UF destino', ufs)}
          <div class="f w2"><label class="lbl" for="cf_cliente">Cliente</label><input id="cf_cliente" data-f="cliente" class="inp" list="cdlcli" value="${esc(F('cliente'))}"><datalist id="cdlcli">${clientes.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
          ${inp('servFora', 'Serviço WindGate por fora (R$)', { hidden: !tri })}
          ${inp('mercadoria', 'Mercadoria', { tipo: 'text', w: 'w2' })}${inp('origem', 'Origem', { tipo: 'text' })}${inp('destino', 'Destino', { tipo: 'text' })}
          ${sel('incoterm', 'Incoterm', [['FOB', 'FOB'], ['CIF', 'CIF'], ['EXW', 'EXW'], ['CFR', 'CFR']])}${sel('modalCntr', 'Contêiner', [['FCL', 'FCL: contêiner completo'], ['LCL', 'LCL: compartilhado']])}
          ${inp('qtdCntr', 'Qtd. contêineres')}${inp('prazo', 'Prazo estimado (dias)')}${inp('validade', 'Validade da proposta (dias)')}${inp('validadeFrete', 'Validade do frete', { tipo: 'date' })}
          ${tri ? '<p class="note w4">Triangular: a SF importa com o benefício de AL, vende à <b>JeT (ES)</b> com o mark-up mínimo, e a JeT vende ao cliente e recolhe o <b>DIFAL</b>.</p>' : ''}</div></div>
        <div class="box"><div class="box-h"><h2>Fotos do produto</h2><span class="note">${(ed.fotos || []).length} / 6</span></div><div class="box-b">
          <p class="note" style="margin-bottom:8px">Até 6 fotos numa página da proposta. Sem foto, a proposta sai sem essa página.</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px">${(ed.fotos || []).map((f, i) => `<div style="position:relative;border:1px solid var(--line);border-radius:6px;overflow:hidden;aspect-ratio:1;background:var(--surface-2)"><img src="${esc(f.url)}" alt="${esc(f.nome || 'Foto ' + (i + 1))}" loading="lazy" style="width:100%;height:100%;object-fit:contain">${bloq ? '' : `<button class="btn ghost sm" data-foto="${esc(f._id)}" style="position:absolute;top:4px;right:4px" title="Tirar da cotação">✕</button>`}</div>`).join('')}${Array.from({ length: subindo }, () => '<div class="note" style="display:grid;place-items:center;border:1px dashed var(--line);border-radius:6px;aspect-ratio:1">enviando…</div>').join('')}</div>
          ${bloq ? '' : `<input type="file" id="cfotos" accept="image/*" multiple hidden><button class="btn sm" id="cfotob" style="margin-top:8px" ${(ed.fotos || []).length + subindo >= 6 ? 'disabled' : ''}>+ Adicionar fotos</button>`}</div></div>
        <div class="box"><div class="box-h"><h2>Câmbio & regras fiscais</h2></div><div class="box-b fields">
          ${inp('txFrete', 'Taxa USD: frete')}${inp('txDesp', 'Taxa USD: despesas/FOB')}${inp('pctInv', '% Invoice (base impostos)')}${inp('icmsEnt', 'ICMS entrada AL (%)')}
          ${inp('icmsDest', 'ICMS destacado saída (%)')}${inp('pisS', 'PIS saída (%)')}${inp('cofS', 'COFINS saída (%)')}${inp('ipiS', 'IPI saída (%)', { titulo: 'IPI destacado na nota de saída: entra por fora, sobre o valor da NF' })}
          ${inp('mkp', 'Mark-up NF (%)')}${inp('mkSF', 'Mark-up SF → JeT (R$)', { hidden: !tri })}${inp('mkJT', 'Mark-up JeT → cliente (R$)', { hidden: !tri })}
          ${inp('outrasAdu', 'Outras desp. aduaneiras (R$)', { titulo: 'Armazenagem, scanner, THC e demais despesas aduaneiras: entram na base do ICMS de importação' })}${inp('aliqST', 'Alíq. efetiva DIFAL (%)')}
          <p class="note w4" id="cnotadifal"></p>
          <p class="note w4" id="cavisoinv" style="color:var(--warn)"></p></div></div>
        <div class="box"><div class="box-h"><h2>Itens da invoice</h2>${bloq ? '' : '<button class="btn sm" id="citem">+ Item</button>'}</div>
          <div class="tw"><table><thead><tr><th style="min-width:180px">Descrição</th><th>NCM</th><th class="num">Qtd</th><th class="num">Unit. USD</th><th class="num">Peso (kg)</th><th class="num">II %</th><th class="num">IPI %</th><th class="num">PIS %</th><th class="num">COFINS %</th><th title="Convênio 52/91">52/91</th><th title="PIS/COFINS monofásico">Mono</th><th class="num">FOB R$</th><th></th></tr></thead><tbody>
          ${ed.items.map((it, i) => { const n = (k, w, step) => `<input class="inp" data-it="${i}" data-c="${k}" value="${esc(it[k] == null ? (k === 'pis' ? 2.1 : k === 'cofins' ? 9.65 : '') : it[k])}" inputmode="decimal" style="width:${w}px;text-align:right">`;
            return `<tr><td><textarea class="inp" data-it="${i}" data-c="d" rows="1" style="width:100%;min-width:170px;resize:vertical">${esc(it.d || '')}</textarea></td><td><input class="inp mono" data-it="${i}" data-c="ncm" value="${esc(it.ncm || '')}" style="width:100px" maxlength="10"></td>
            <td>${n('q', 70)}</td><td>${n('u', 90)}</td><td>${n('p', 80)}</td><td>${n('ii', 60)}</td><td>${n('ipi', 60)}</td><td>${n('pis', 60)}</td><td>${n('cofins', 66)}</td>
            <td style="text-align:center"><input type="checkbox" data-it="${i}" data-c="c5291" ${it.c5291 ? 'checked' : ''}></td><td style="text-align:center"><input type="checkbox" data-it="${i}" data-c="mono" ${it.mono ? 'checked' : ''}></td>
            <td class="num" id="cfob_${i}">—</td><td>${bloq ? '' : `<button class="btn ghost sm" data-rmit="${i}" title="Remover item">✕</button>`}</td></tr>`; }).join('')}</tbody></table></div>
          <div class="box-b"><p class="note" id="cncm"></p><p class="note" id="cncmcurto" style="color:var(--warn)"></p></div></div>
        <div class="box"><div class="box-h"><h2>Frete, seguro & despesas de nacionalização</h2></div><div class="box-b">
          <div class="fields">${inp('freteUSD', 'Frete internacional (USD)')}${inp('seguro', 'Seguro (R$)')}${inp('capatazia', 'Capatazia (R$)')}${inp('transporte', 'Transporte terrestre (R$)')}
            <p class="lbl w4" style="margin-top:6px">Rateadas por item (compõem a base do ICMS de entrada)</p>${inp('siscomex', 'Taxa Siscomex (R$)')}${inp('afrmm', 'AFRMM (R$)')}${inp('honorarios', 'Honorários despachante (R$)')}</div>
          <p class="lbl" style="margin-top:12px">Demais despesas (porto · agente de carga · bancárias)</p>
          <div class="list">${ed.exps.map((e, i) => `<div class="row"><input class="inp" data-ex="${i}" data-c="l" value="${esc(e.l || '')}" placeholder="Descrição" style="flex:1"><input class="inp" data-ex="${i}" data-c="v" value="${esc(e.v)}" inputmode="decimal" style="width:120px;text-align:right">${bloq ? '' : `<button class="btn ghost sm" data-rmex="${i}">✕</button>`}</div>`).join('')}</div>
          ${bloq ? '' : '<button class="btn sm" id="cexp" style="margin-top:8px">+ Despesa</button>'}</div></div>
        <div class="box"><div class="box-h"><h2>Cronograma de desembolso: cliente × fábrica</h2>${bloq ? '' : '<button class="btn blue sm" id="csug">Sugerir distribuição</button>'}</div><div class="box-b">
          <div class="fields">${inp('fabSinal', 'Sinal à fábrica (%)')}<p class="note w3">Padrão das fábricas: 30% para iniciar a produção e 70% na finalização. A regra WindGate: o recebimento do cliente em cada etapa SEMPRE cobre a nossa saída.</p></div>
          <div class="tw" style="margin-top:10px"><table><thead><tr><th>Etapa</th><th class="num">Nossa saída</th><th class="num">% do total</th><th class="num">Recebimento do cliente (R$)</th><th>Situação</th></tr></thead><tbody>
            ${[[1, '1 · Assinatura', 'sinal à fábrica → produção'], [2, '2 · Produto pronto', 'saldo à fábrica · pré-embarque'], [3, '3 · Chegada ao porto', 'frete · impostos · despesas · entrega']].map(([n, t, d]) => `<tr><td><b>${t}</b><br><small class="note">${d}</small></td><td class="num" id="cdo${n}">—</td>
              <td class="num"><input class="inp" id="cdp${n}" data-pct="${n}" inputmode="decimal" style="width:80px;text-align:right"></td><td class="num"><input class="inp" id="cf_desR${n}" data-f="desR${n}" value="${esc(F('desR' + n))}" inputmode="decimal" style="width:130px;text-align:right"></td><td id="cds${n}"></td></tr>`).join('')}</tbody></table></div>
          <p class="note" id="cdbase" style="margin-top:6px"></p><div id="cderr"></div></div></div>
      </fieldset>
      <div class="box" style="position:sticky;top:12px"><div class="box-h"><h2>Custo da operação</h2>${stPill(ed.status)}</div><div class="box-b" id="cresumo"></div>
        <div class="box-b" style="border-top:1px solid var(--line)"><h3 class="h3">Margem WindGate</h3>
          <div class="seg" style="margin:6px 0 10px">${[20, 25, 30].map(p => `<button data-mp="${p}" ${bloq ? 'disabled' : ''}>${p}%</button>`).join('')}</div>
          <div class="fields" style="grid-template-columns:1fr 1fr"><div class="f"><label class="lbl" for="cf_margemPct">Margem (% s/ custo)</label><input id="cf_margemPct" class="inp" data-marg="pct" value="${esc(F('margemPct'))}" inputmode="decimal" ${bloq ? 'disabled' : ''}></div>
            <div class="f"><label class="lbl" for="cf_margemBRL">Margem (R$)</label><input id="cf_margemBRL" class="inp" data-marg="brl" value="${esc(F('margemBRL'))}" inputmode="decimal" ${bloq ? 'disabled' : ''}></div></div>
          <p class="note" style="margin-top:8px">Referência histórica (mai/25–jul/26): margem líquida mediana ≈26% s/ receita · faixa 10%–50%. Aço/escoras 13%–43% · Máquinas 10%–18% · cotações pequenas 45%+.</p>
          <div id="cpreco" style="margin-top:10px"></div>
          <div class="btns" style="margin-top:10px;flex-direction:column;align-items:stretch">
            ${ed.status === 'draft' ? '<button class="btn blue" id="cenvia">Enviar para aprovação · Samir</button>' : ''}
            ${ed.status === 'wait' && podeAprovar() ? '<button class="btn pri" id="caprova">Aprovar margem e liberar proposta</button><button class="btn" id="cdevolve">Devolver para ajuste</button>' : ''}
            ${ed.status === 'ok' ? `<button class="btn" id="cop">Criar operação + previsto no Financeiro</button>` : ''}</div>
          <p class="note" style="margin-top:8px">${ed.status === 'wait' && !podeAprovar() ? 'Enviada. Aguardando o Samir aprovar a margem; o PDF é liberado em seguida.' : ed.status === 'ok' ? 'Proposta liberada: gere o PDF no padrão WindGate.' : 'Nada sai sem aprovação.'}</p></div></div></div>`;
    ligar(el);
    atualizar(el);
  }

  /* Recalcula e reescreve só os números — os campos não são redesenhados,
     para não tirar o cursor de quem está digitando. */
  function atualizar(el) {
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
    const o = W.desemOuts(ed, R), base = W.precoDesem(R), rs = [1, 2, 3].map(n => parseFloat(F('desR' + n)) || 0), os = [o.o1, o.o2, o.o3];
    [1, 2, 3].forEach((n, i) => {
      el.querySelector('#cdo' + n).textContent = fmt(os[i]);
      el.querySelector('#cds' + n).innerHTML = !rs[i] ? pill('—') : rs[i] >= os[i] - 0.01 ? pill('cobre (+' + fmt(rs[i] - os[i]) + ')', 'ok') : pill('NÃO cobre', 'crit');
      const p = el.querySelector('#cdp' + n); if (p && document.activeElement !== p) p.value = base > 0 && rs[i] ? (rs[i] / base * 100).toFixed(1) : '';
    });
    const soma = rs.reduce((a, x) => a + x, 0);
    el.querySelector('#cdbase').innerHTML = (R.tri ? `As parcelas fecham com <b>${fmt(base)}</b>, o preço fechado: o DIFAL de ${fmt(R.tri.difal || 0)} é recolhido pela JeT em GNRE e já está dentro dele.`
      : (R.st || 0) > 0 ? `As parcelas fecham com <b>${fmt(base)}</b>: preço ${fmt(R.preco || 0)} menos o ICMS-DIFAL ${fmt(R.st || 0)}, que o cliente recolhe em guia própria.` : `As parcelas fecham com <b>${fmt(base)}</b>, o preço aprovado.`)
      + (base > 0 && soma ? ' ' + (Math.abs(soma - base) <= 0.05 ? pill('as 3 somam 100%', 'ok') : pill('as 3 somam ' + (soma / base * 100).toFixed(1) + '%', 'crit')) : '');
    const errs = W.desemErros(ed, R), preenchido = rs.some(Boolean);
    el.querySelector('#cderr').innerHTML = errs.length && preenchido ? `<div class="banner crit" style="margin-top:8px">⛔ <b>Bloqueado:</b> ${errs.map(esc).join('<br>⛔ ')}</div>` : !errs.length ? '<div class="banner ok" style="margin-top:8px"><b>Regra do desembolso atendida:</b> em todas as etapas o recebimento cobre a saída e a soma fecha com o valor a receber.</div>' : '';
  }

  function ligar(el) {
    const on = (s, fn) => { const x = el.querySelector(s); if (x) x.onclick = fn; };
    on('#cvolta', () => { ed = null; H.ir('cotacoes'); });
    on('#cnova', () => { ed = nova(); editando = false; modo = 'pct'; H.ir('cotacoes', 'nova'); });
    on('#cedit', () => { editando = true; H.toast('Cotação destravada: se o preço mudar, volta para aprovação.'); editor(el); });
    on('#csalva', () => salvar(false) && editor(el));
    on('#cprop', propostaModal);
    on('#cenvia', () => enviar(el));
    on('#caprova', () => aprovar(el));
    on('#cdevolve', () => { ed.status = 'draft'; if (salvar(true, true)) { H.toast('Devolvida para ajuste.'); editor(el); } });
    on('#cop', () => criarOperacao());
    on('#csug', () => { if (!(R && R.preco > 0)) return H.toast('Complete a cotação primeiro.'); Object.assign(ed.fields, W.desemSugerir(ed, R)); [1, 2, 3].forEach(n => { el.querySelector('#cf_desR' + n).value = ed.fields['desR' + n]; }); atualizar(el); H.toast('Distribuição sugerida: 35% da margem já nas parcelas 1 e 2.'); });
    on('#citem', () => { ed.items.push(W.ITEM_PADRAO()); editor(el); });
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
      if (t.dataset.f) {
        ed.fields[t.dataset.f] = t.value;
        if (t.dataset.f === 'tipoOp') return editor(el);
      } else if (t.dataset.it != null) {
        const it = ed.items[+t.dataset.it], c = t.dataset.c;
        if (t.type === 'checkbox') it[c] = t.checked; else if (c === 'd' || c === 'ncm') it[c] = t.value; else it[c] = parseFloat(t.value) || 0;
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

  /* ================= GRAVAÇÃO E APROVAÇÃO ================= */
  function salvar(silencioso, forcar) {
    garantir();
    R = W.calcular(ed, { modo, usuario: eu() });
    const anterior = ed.id ? H.db.quotes[ed.id] : null;
    const r = W.prepararGravacao(ed, R, forcar && anterior && anterior.status === 'ok' && ed.status !== 'ok' ? Object.assign({}, anterior, { status: 'x' }) : anterior, editando, eu());
    if (!r.ok) { H.toast(esc(r.msg)); return false; }
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
  function enviar(el) {
    if (!ed.items.length || !(R.custoReal > 0)) return H.toast('Preencha a cotação antes de enviar.');
    const errs = W.desemErros(ed, R);
    if (errs.length) { H.toast('⛔ <b>Não dá para enviar:</b> ' + esc(errs[0])); return; }
    ed.criadoPor = ed.criadoPor || eu(); ed.status = 'wait';
    if (salvar(true)) { avisarSamir(); H.toast('Enviada para aprovação do <b>Samir</b>.'); editor(el); }
  }
  function aprovar(el) {
    if (!podeAprovar()) return H.toast('Somente o Samir aprova margem.');
    const errs = W.desemErros(ed, R);
    if (errs.length) return H.toast('⛔ <b>Não aprova com desembolso furado:</b> ' + esc(errs[0]));
    ed.aprovadoPor = eu(); ed.status = 'ok';
    const anterior = H.db.quotes[ed.id];
    // Aprovar é gravar o status novo sobre a mesma cotação: passa pela regra sem o bloqueio de "aprovada".
    if (anterior) H.db.quotes[ed.id] = Object.assign({}, anterior, { status: 'wait' });
    if (!salvar(true)) return;
    (H.db.hubRecados || []).filter(r => r && r.quoteId === ed.id && r.para === 'samir').forEach(r => { r.feito = Object.assign({}, r.feito, { samir: new Date().toISOString() }); });
    H.salvar();
    H.toast('Margem aprovada: proposta liberada.');
    editor(el);
    const m = H.modal('Cotação aprovada', `<p>Criar já a operação <b>${esc((F('opNum') || '—').toUpperCase())}</b> e lançar o <b>previsto</b> no Financeiro (as 3 parcelas do cliente e os 3 pagamentos)?</p>`,
      '<button class="btn" data-x>Agora não</button><button class="btn pri" id="mop">Criar operação + previsto</button>');
    m.querySelector('#mop').onclick = () => { H.fecharModal(); criarOperacao(); };
  }
  function criarOperacao() {
    const r = W.operacaoDaCotacao(H.db, ed, R, eu(), W.hojeISO());
    const agora = new Date().toISOString();
    if (r.op) {
      Object.assign(r.op, { status: 'contrato', statusEm: agora, statusPor: eu() });
      H.db.ops.unshift(r.op);
      if (!Array.isArray(H.db.opStatusHist)) H.db.opStatusHist = [];
      H.db.opStatusHist.push({ _id: W.novoId(), op: r.id, de: '', para: 'contrato', em: agora, deEm: '', por: eu(), tipo: 'mudanca', origem: 'hub2-cotacao', motivo: 'Cotação aprovada' });
      if (!H.db.checklists[r.id] && H.CHK_MODELO) H.db.checklists[r.id] = H.CHK_MODELO.map(([fase, titulo]) => ({ fase, titulo, status: 'pendente', coletadoPor: '', revisadoPor: '' }));
    }
    if (r.jaLancado) { H.salvar(); return H.toast(`Operação <b>${esc(r.id)}</b> já tinha o cronograma lançado: nada foi duplicado.`); }
    H.db.fin.unshift(...r.lancamentos);
    H.salvar();
    H.toast(`Operação <b>${esc(r.id)}</b> ${r.op ? 'criada' : 'atualizada'} · cronograma lançado no Financeiro (1ª parcela em ${W.dataBR(r.lancamentos[0] && r.lancamentos[0].vencimento)}).`);
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
  function propostaModal() {
    if (ed.status !== 'ok') return H.toast('A proposta só é liberada após a <b>aprovação da margem pelo Samir</b>.');
    const errs = W.desemErros(ed, R); if (errs.length) return H.toast('⛔ <b>Desembolso bloqueado:</b> ' + esc(errs[0]));
    const b = W.propostaBlocos(ed), temFoto = (ed.fotos || []).length > 0;
    const caixa = (x, desab, nota) => `<label class="row" style="justify-content:flex-start;gap:10px;${desab ? 'opacity:.55' : ''}"><input type="checkbox" data-pb="${x.k}" ${b[x.k] && !desab ? 'checked' : ''} ${desab ? 'disabled' : ''}><span><b>${esc(x.l)}</b><br><small class="note">${nota}</small></span></label>`;
    const m = H.modal('O que entra na proposta', `<p class="note" style="margin-bottom:8px">Desmarque o que não deve aparecer no PDF deste cliente. A escolha fica salva na cotação.</p>
      <div class="list">${W.PROPOSTA_BLOCOS.map(x => { const sem = x.k === 'fotos' && !temFoto; return caixa(x, sem, sem ? 'Nenhuma foto anexada a esta cotação.' : esc(x.d)); }).join('')}</div>
      <h3 class="h3" style="margin-top:12px">Composição do investimento</h3><p class="note" style="color:var(--warn)">⚠ Abrir estas linhas ao lado do total deixa a margem dedutível por subtração.</p>
      <div class="list">${W.PROPOSTA_CUSTOS.map(x => { const v = +x.v(R) || 0; return caixa(x, !v, v ? fmt(v) + (x.sub ? ' · ' + esc(x.sub) : '') : 'Sem valor nesta cotação.'); }).join('')}</div>`,
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
      const d = { _id: W.novoId(), clienteId: cli._id, oportunidadeId: oport ? oport._id : '', tipo: 'Proposta', nome: nomeArquivo, link: j.finalUrl || j.supabaseUrl || j.localUrl, obs: 'Gerada pelo sistema',
        versao: iguais.reduce((a, x) => Math.max(a, +x.versao || 1), 0) + 1, enviadoPor: eu(), dataUpload: agora, origem: 'proposta-automatica', removidoEm: null, removidoPor: '', acessos: [{ quem: eu(), acao: 'upload', em: agora }] };
      H.db.crmDocs.unshift(d); H.salvar();
      return { ok: true, doc: d, cliente: cli, oport };
    } catch (e) { return { ok: false, motivo: e.message || 'erro inesperado' }; }
  }
  function gerarPDF() {
    if (!window.HUB_PROPOSTA) return H.toast('Gerador da proposta não carregou.');
    let print = document.getElementById('printProposal');
    if (!print) { print = document.createElement('div'); print.id = 'printProposal'; document.body.appendChild(print); }
    const campos = W.camposDe(ed);
    const P = window.HUB_PROPOSTA({
      V: k => campos[k] == null ? '' : String(campos[k]), N: k => parseFloat(campos[k]) || 0, fmt, esc, toast: H.toast, cnpjFmt,
      crmDocAnexarProposta: anexarNoCRM, desemErrors: () => W.desemErros(ed, R),
      carregarFotosDaProposta: async () => { const out = []; for (const f of (ed.fotos || [])) { try { out.push(await fotoParaPDF(f.url)); } catch (e) { console.warn('foto ignorada', f.url, e); } } return out; },
      openModal: () => {}, closeModal: H.fecharModal, saveDB: H.salvar, DB: H.db,
      state: { items: ed.items, fotos: ed.fotos, blocos: ed.blocos, status: ed.status, id: ed.id }, R
    });
    P.gerarPropostaPDF();
  }
})();
