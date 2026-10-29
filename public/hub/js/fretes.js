/* Hub 2.0 — Fretes & Benchmark.
   Cotações de frete com as empresas da lista fechada, R$ automático pela PTAX
   do Banco Central com a regra de cada agente (trava a PTAX oficial no dia da
   chegada), memória de preços por rota para o Matheus negociar, leitura
   automática da proposta e pedido de análise de mercado para o Claude.
   Lê e grava os mesmos `fretes` e `agentes` da aba Fretes do sistema atual. */
(function () {
  const H = window.HUB, W = H.W, esc = H.esc;
  let filtroSt = '', busca = '', ptaxCarregando = false, ptaxFalhou = false, travando = false, ultimaTrava = 0;

  const painel = () => (H.db.hubPainel && H.db.hubPainel._fretes) || {};
  const garantir = () => {
    if (!Array.isArray(H.db.fretes)) H.db.fretes = [];
    if (!H.db.agentes || typeof H.db.agentes !== 'object') H.db.agentes = {};
    if (!H.db.hubPainel) H.db.hubPainel = {};
  };
  /* Regra da PTAX: no sistema atual só quem tem o financeiro (Samir e Davi) ajusta. */
  const podeRegra = () => H.pode('fin.ver');
  /* A aba é liberada pela lista de abas da pessoa, como no sistema atual. */
  const temAba = () => { const t = H.user && H.user.tabs; return !Array.isArray(t) || t.includes('frete'); };
  const fxAtual = () => W.ptaxVigente(H.ptax, H.db.ptax, painel().ptaxManual);
  const usd = v => W.fmtUSD(v), brl = v => W.fmtBRL(v), tx = v => W.fmtTaxa(v);
  const val = (m, s) => { const x = m.querySelector(s); return x ? String(x.value || '').trim() : ''; };
  const num = (m, s) => parseFloat(val(m, s)) || 0;
  const PILL = { Cotado: 'info', Negociando: 'warn', Fechado: 'ok', Expirado: '' };

  /* Redesenha só se a tela ainda é esta e ninguém está digitando ou com janela aberta. */
  function redesenhar() {
    if (!H.db || H.estado.tela !== 'frete' || document.querySelector('.modal-bg')) return;
    const a = document.activeElement;
    if (a && a.closest && a.closest('#conteudo') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    H.render();
  }

  /* ---------- PTAX ---------- */
  function carregarPtax(forcar) {
    if (ptaxCarregando || (H.ptax && !forcar)) return;
    ptaxCarregando = true;
    H.api('/api/cambio/ptax').then(r => r.json()).then(j => {
      if (j && j.success) { H.ptax = j; ptaxFalhou = false; } else ptaxFalhou = true;
    }).catch(() => { ptaxFalhou = true; }).finally(() => { ptaxCarregando = false; if (forcar && H.ptax && !ptaxFalhou) H.toast('PTAX atualizada'); redesenhar(); travarChegadas(); });
  }

  /* PTAX oficial de um dia direto no Banco Central (mesma consulta do sistema
     atual), para chegadas mais antigas que a série que o servidor devolve. */
  async function ptaxOlinda(iso) {
    for (let i = 0; i < 7; i++) {
      const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - i);
      const mdy = String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '-' + d.getFullYear();
      try {
        const sinal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined;
        const r = await fetch("https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='" + mdy + "'&$format=json", { signal: sinal });
        const j = await r.json();
        if (j.value && j.value.length) return { rate: +j.value[0].cotacaoVenda, date: W.hojeBR(d), source: 'PTAX · Banco Central' };
      } catch (e) { /* sem rede: tenta o dia anterior e depois desiste */ }
    }
    return null;
  }

  /* Chegou o dia: trava a PTAX oficial daquele dia na cotação (ptaxLock). */
  async function travarChegadas() {
    if (travando || !H.db || Date.now() - ultimaTrava < 10 * 60 * 1000) return;
    const hoje = W.hojeISO();
    const pend = (H.db.fretes || []).filter(f => W.precisaTravarPtax(f, hoje)).map(f => f._id);
    if (!pend.length) return;
    travando = true; ultimaTrava = Date.now();
    let n = 0;
    try {
      for (const id of pend) {
        const f0 = (H.db.fretes || []).find(x => x && x._id === id); if (!f0 || !W.precisaTravarPtax(f0, hoje)) continue;
        const chegada = f0.chegada;
        const p = W.ptaxNaData(H.ptax && H.ptax.serie, chegada) || await ptaxOlinda(chegada);
        if (!p) break;                                   // sem rede — tenta na próxima
        const f = (H.db.fretes || []).find(x => x && x._id === id);   // a sincronização pode ter trocado o objeto
        if (f && f.chegada === chegada && !f.ptaxLock) { f.ptaxLock = { rate: p.rate, date: p.date, source: p.source }; n++; }
      }
    } finally { travando = false; }
    if (n) { H.salvar(); redesenhar(); }
  }

  /* ---------- Tela ---------- */
  H.telas.frete = function (el) {
    if (!temAba()) { el.innerHTML = '<div class="banner">Esta área não faz parte do seu perfil.</div>'; return; }
    garantir();
    if (!H.ptax && !ptaxFalhou) carregarPtax(); else setTimeout(travarChegadas, 0);   // depois de desenhar: a trava pode redesenhar a tela
    const db = H.db, fretes = db.fretes.filter(Boolean), fx = fxAtual();
    const abertas = fretes.filter(f => f.status === 'Cotado' || f.status === 'Negociando').length;
    const fechadas = fretes.filter(f => f.status === 'Fechado').length;
    const travadas = fretes.filter(f => f.ptaxLock).length;
    const rotas = W.estatisticasRotas(fretes);
    const q = busca.trim().toLowerCase();
    const lista = fretes.filter(f => (!filtroSt || f.status === filtroSt) && (!q || [f.rota, f.empresa, f.op, f.contato, f.resp, f.modal, f.fabContato].join(' ').toLowerCase().includes(q)));
    const regras = W.regrasPtax(db.agentes).map(r => r.regra > 0
      ? `<b>${esc(W.juntarNomes(r.nomes))} = PTAX da chegada +${r.regra.toLocaleString('pt-BR')}%</b>`
      : `${esc(W.juntarNomes(r.nomes))} = PTAX da chegada, sem acréscimo`).join(' · ');
    const conta = st => st ? fretes.filter(f => f.status === st).length : fretes.length;

    el.innerHTML = `
      <div class="head"><div><h1>Fretes & Benchmark</h1><p class="sub">Empresas em lista fechada · R$ automático pela PTAX do Banco Central · memória de preços por rota. Área do Matheus; o Samir aprova a negociação final.</p></div>
        <div class="btns"><button class="btn ghost" id="fag">Agentes & regra da PTAX</button><button class="btn blue" id="fparse">Ler proposta (auto)</button><button class="btn pri" id="fnovo">+ Nova cotação de frete</button></div></div>
      <div class="kpis">
        <div class="kpi"><span class="lbl">Cotações registradas</span><span class="v">${fretes.length}</span><span class="d">${rotas.length} rota(s) na memória</span></div>
        <div class="kpi"><span class="lbl">Em negociação</span><span class="v">${abertas}</span><span class="d">cotado ou negociando</span></div>
        <div class="kpi"><span class="lbl">Fechadas</span><span class="v">${fechadas}</span><span class="d ${fechadas ? 'good' : ''}">frete contratado</span></div>
        <div class="kpi"><span class="lbl">Dá para brigar</span><span class="v">${rotas.filter(r => r.leitura === 'brigar').length}</span><span class="d">rota(s) acima do menor valor</span></div>
        <div class="kpi"><span class="lbl">Dólar (PTAX)</span><span class="v">${fx ? tx(fx.rate) : ptaxCarregando ? '…' : '—'}</span><span class="d ${fx && !fx.official ? 'bad' : ''}">${fx ? esc(fx.date || '') + (fx.official ? '' : ' · não oficial') : ptaxCarregando ? 'buscando no Banco Central' : 'informe abaixo'}</span></div>
        <div class="kpi"><span class="lbl">PTAX travada</span><span class="v">${travadas}</span><span class="d">cotação(ões) com a PTAX da chegada</span></div>
      </div>

      <div class="box" style="margin-top:16px"><div class="box-h"><h2>Câmbio PTAX</h2><button class="btn ghost sm" id="fptax" ${ptaxCarregando ? 'disabled' : ''}>Atualizar agora</button></div><div class="box-b">
        ${ptaxCarregando && !fx ? '<p class="note">Buscando PTAX no Banco Central…</p>'
          : fx ? `<p>Dólar <b style="font-size:16px">R$ ${tx(fx.rate)}</b> · ${esc(fx.date || '')} · <span class="pill ${fx.official ? 'ok' : 'warn'}">${esc(fx.source || '')}</span></p>`
          : '<p style="color:var(--crit)">Não consegui buscar a PTAX automaticamente agora. Informe abaixo — o resto é calculado normalmente.</p>'}
        ${!fx || !fx.official ? `<div class="fields" style="margin-top:10px"><div class="f"><label class="lbl" for="fpm">PTAX manual (R$/USD)</label><input id="fpm" class="inp" type="number" step="0.0001" placeholder="5,4300" value="${fx && fx.manual ? fx.rate : ''}"></div>
          <div class="f w2"><p class="note" style="margin-top:18px">Sem acesso ao Banco Central agora — informe a PTAX de hoje (bcb.gov.br) e confirme com Enter.</p></div></div>` : ''}
        <p class="note" style="margin-top:8px">Regra WindGate: ${regras || 'nenhum agente cadastrado'}. Ajuste o percentual de qualquer um em <b>Agentes & regra da PTAX</b>${podeRegra() ? '' : ' (só Samir e Davi)'}. Antes da chegada o R$ é <i>projeção</i> com a PTAX mais recente; no dia da chegada o sistema trava a PTAX oficial daquele dia.</p>
      </div></div>

      <div class="box" style="margin-top:16px"><div class="box-h"><h2>Registro de cotações</h2><span class="note">${lista.length} de ${fretes.length}</span></div>
        <div class="filters"><input type="search" id="fq" placeholder="Buscar rota, empresa, operação, responsável…" value="${esc(busca)}">
          <div class="seg">${[['', 'Todas'], ...W.FRETE_STATUS.map(s => [s, s])].map(([k, l]) => `<button data-st="${esc(k)}" class="${filtroSt === k ? 'on' : ''}">${esc(l)} · ${conta(k)}</button>`).join('')}</div></div>
        ${lista.length ? `<div class="tw"><table><thead><tr><th>Data</th><th>Operação</th><th>Empresa</th><th>Rota</th><th>Modal</th><th class="num">USD</th><th class="num">R$ total (PTAX + regra + taxas)</th><th>Chegada prev.</th><th>Validade</th><th>Status</th><th>Resp.</th><th></th></tr></thead><tbody>
          ${lista.map(f => {
            const c = W.freteBRL(f, db.agentes, fx);
            let cel = '<span class="note">informe a PTAX</span>';
            if (c) cel = `<b>${brl(c.brl)}</b>${c.usd ? `<br><small class="note">${c.locked ? 'PTAX da chegada (travada)' : 'projeção'} ${tx(c.fx.rate)}${c.regra ? ' +' + c.regra + '%' : ''}</small>` : ''}${c.extras ? `<br><small class="note">${c.usd ? brl(c.convertido) + ' + ' : ''}${brl(c.extras)} em taxas</small>` : ''}`;
            const fab = f.fabContato || f.fabEmail || f.fabWhats;
            return `<tr><td class="mono">${esc(f.data || '—')}</td><td><b>${esc(f.op || '—')}</b></td>
              <td><b>${esc(f.empresa || '—')}</b>${f.contato ? `<br><small class="note">${esc(f.contato)}${f.fone ? ' · ' + esc(f.fone) : ''}</small>` : ''}</td>
              <td>${esc(f.rota || '—')}${fab ? `<br><small class="note">Fábrica: ${esc([f.fabContato, f.fabWhats, f.fabEmail].filter(Boolean).join(' · '))}</small>` : ''}</td><td>${esc(f.modal || '—')}</td>
              <td class="num mono">${usd(W.usdNum(f.usd))}</td><td class="num">${cel}</td>
              <td class="mono">${f.chegada ? W.dataBR(f.chegada) : '—'}</td><td>${esc(f.validade || '—')}</td>
              <td><span class="pill ${PILL[f.status] || ''}">${esc(f.status || '—')}</span></td><td>${esc(f.resp || '—')}</td>
              <td class="num" style="white-space:nowrap"><button class="btn ghost sm" data-ed="${esc(f._id)}">Editar</button> <button class="btn ghost sm" data-del="${esc(f._id)}" title="Excluir" aria-label="Excluir cotação" style="color:var(--crit)">✕</button></td></tr>`;
          }).join('')}</tbody></table></div>`
          : `<p class="empty">${fretes.length ? 'Nenhuma cotação com esse filtro.' : 'Nenhuma cotação de frete registrada.'}</p>`}</div>

      <div class="g2 larga" style="margin-top:16px">
        <div class="box"><div class="box-h"><h2>Memória de preços por rota</h2><span class="note">seu benchmark interno</span></div>
          <div class="tw"><table><thead><tr><th>Rota</th><th class="num">Cotações</th><th class="num">Menor USD</th><th class="num">Mediana</th><th class="num">Última</th><th>Leitura</th></tr></thead><tbody>
          ${rotas.map(r => `<tr><td><b>${esc(r.rota)}</b></td><td class="num">${r.n}</td><td class="num mono" style="color:var(--ok)">${usd(r.min)}</td><td class="num mono">${usd(r.mediana)}</td><td class="num mono">${usd(r.ultima)}</td>
            <td>${r.leitura === 'poucas' ? '<span class="note">registre mais cotações</span>' : r.leitura === 'melhor' ? '<span class="pill ok">no melhor preço</span>' : `<span class="pill warn">dá para brigar: −${usd(r.delta)}</span>`}</td></tr>`).join('')
            || '<tr><td colspan="6" class="note">Sem histórico ainda — cada cotação registrada vira memória de negociação.</td></tr>'}</tbody></table></div>
          <div class="box-b"><p class="note">É com esta tabela que o Matheus negocia direto: se a cotação nova veio acima do menor valor da rota, há espaço para brigar — o Samir só aprova a negociação final.</p></div></div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="box"><div class="box-h"><h2>Referências de mercado</h2></div><div class="box-b list">
            ${[['https://www.drewry.co.uk/supply-chain-advisors/supply-chain-expertise/world-container-index-assessed-by-drewry', 'Drewry WCI — índice semanal'], ['https://fbx.freightos.com/', 'Freightos FBX — índice diário por rota'], ['https://www.searates.com/freight/', 'SeaRates — simulador de rotas'], ['https://www.maersk.com.br/', 'Maersk Spot'], ['https://www.hapag-lloyd.com/en/online-business/quotation/quick-quotes.html', 'Hapag Quick Quotes'], ['https://www.cma-cgm.com/ebusiness/pricing/instant-Quoting', 'CMA SpotOn']]
              .map(([u, l]) => `<div class="row"><a href="${u}" target="_blank" rel="noopener">${l} ↗</a></div>`).join('')}</div></div>
          <div class="box"><div class="box-h"><h2>Análise de mercado com IA</h2></div><div class="box-b">
            <p class="note">Gera um pedido pronto de análise (preço justo, margem de negociação, projeção da rota, feriados chineses, clima) para colar no Claude. O resultado volta em minutos para o Matheus negociar.</p>
            <button class="btn pri sm" id="fprompt" style="margin-top:10px">Gerar análise desta semana</button></div></div>
        </div></div>`;

    el.querySelector('#fnovo').onclick = () => abrirFrete({}, null);
    el.querySelector('#fag').onclick = abrirAgenda;
    el.querySelector('#fparse').onclick = abrirLeitura;
    el.querySelector('#fprompt').onclick = abrirPrompt;
    el.querySelector('#fptax').onclick = () => { ptaxFalhou = false; ultimaTrava = 0; carregarPtax(true); H.render(); };
    const pm = el.querySelector('#fpm');
    if (pm) {
      const aplicar = () => {
        const r = parseFloat(String(pm.value).replace(',', '.')); if (!(r > 0)) return;
        const atual = painel().ptaxManual; if (atual && atual.rate === r) return;
        H.db.hubPainel._fretes = Object.assign({}, painel(), { ptaxManual: { rate: r, date: W.hojeBR(), source: 'informada manualmente', official: false, manual: true, ts: Date.now(), por: H.nomeUsuario(H.userKey) } });
        H.salvar(); pm.blur(); H.render(); H.toast('PTAX manual aplicada');
      };
      pm.addEventListener('change', aplicar);
      pm.addEventListener('keydown', e => { if (e.key === 'Enter') aplicar(); });
    }
    el.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { filtroSt = b.dataset.st; H.render(); });
    const fq = el.querySelector('#fq');
    fq.addEventListener('input', () => { busca = fq.value; clearTimeout(fq._t); fq._t = setTimeout(() => { H.render(); const n = document.querySelector('#fq'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); });
    el.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => {
      const f = H.db.fretes.find(x => x && x._id === b.dataset.ed);
      if (!f) { H.toast('Cotação não encontrada'); H.render(); return; }
      abrirFrete(f, f._id);
    });
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => confirmarExclusao(b.dataset.del));
  };

  /* ---------- Excluir (pelo _id: a sincronização reordena a lista) ---------- */
  function confirmarExclusao(id) {
    const f = H.db.fretes.find(x => x && x._id === id);
    if (!f) { H.toast('Cotação não encontrada'); H.render(); return; }
    const m = H.modal('Excluir cotação de frete', `<p>Excluir a cotação <b>${esc(f.empresa || '—')}</b> · ${esc(f.rota || '—')} · ${usd(W.usdNum(f.usd))}${f.data ? ' de ' + esc(f.data) : ''}?</p><p class="note" style="margin-top:6px">Ela sai também da memória de preços da rota, aqui e no sistema atual.</p>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn pri" id="fdelok" style="background:var(--crit);border-color:var(--crit)">Excluir</button>');
    m.querySelector('#fdelok').onclick = () => {
      const i = H.db.fretes.findIndex(x => x && x._id === id);
      if (i < 0) { H.fecharModal(); H.toast('Cotação não encontrada'); H.render(); return; }
      H.db.fretes.splice(i, 1); H.salvar(); H.fecharModal(); H.toast('Cotação excluída'); H.render();
    };
  }

  /* ---------- Nova / editar (o mesmo formulário; `id` preenchido grava por cima) ---------- */
  function abrirFrete(pref, id) {
    garantir();
    pref = pref || {};
    const db = H.db, ag = db.agentes, grupos = W.empresasFrete(ag);
    const opt = (v, sel, rot) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(rot == null ? v : rot)}</option>`;
    const optEmp = ([k, v]) => opt(k, pref.empresa, k + (v && +v.regra ? ` (PTAX +${v.regra}%)` : ''));
    // Cotação antiga com empresa fora da agenda: aparece no seletor para não se perder ao editar.
    const avulsa = pref.empresa && pref.empresa !== '__outra' && !ag[pref.empresa] ? opt(pref.empresa, pref.empresa, pref.empresa + ' (fora da agenda)') : '';
    const ops = (db.ops || []).filter(o => o && o.id).map(o => o.id);
    if (pref.op && !ops.includes(pref.op)) ops.unshift(pref.op);
    const resp = W.FRETE_RESP.slice(); if (pref.resp && !resp.includes(pref.resp)) resp.push(pref.resp);
    const eu = H.nomeUsuario(H.userKey), respSel = pref.resp || (resp.includes(eu) ? eu : resp[0]);
    const lista = (arr, sel) => arr.map(v => opt(v, sel)).join('');

    const m = H.modal(id ? 'Editar cotação de frete' : 'Nova cotação de frete', `<div class="fields">
      <div class="f"><label class="lbl" for="fe">Empresa (lista fechada)</label><select id="fe"><option value="">— selecione —</option>${avulsa}
        <optgroup label="Agentes de carga">${grupos.agentes.map(optEmp).join('')}</optgroup><optgroup label="Armadores diretos">${grupos.armadores.map(optEmp).join('')}</optgroup>
        <option value="__outra">Outra…</option></select></div>
      <div class="f" id="feob" style="display:none"><label class="lbl" for="feo">Nome da empresa</label><input id="feo" placeholder="Entra na agenda como agente de carga"></div>
      <div class="f"><label class="lbl" for="fop">Operação (opcional)</label><select id="fop"><option value="">—</option>${lista(ops, pref.op)}</select></div>
      <div class="f"><label class="lbl" for="fmo">Modal</label><select id="fmo">${lista(W.FRETE_MODAIS, pref.modal)}</select></div>
      <div class="f w2"><label class="lbl" for="fro">Rota</label><input id="fro" value="${esc(pref.rota || '')}" placeholder="Ex.: Shanghai → Pecém"></div>
      <div class="f"><label class="lbl" for="fct">Contato do agente (pessoa)</label><input id="fct" value="${esc(pref.contato || '')}" placeholder="Ex.: Ana"></div>
      <div class="f"><label class="lbl" for="ffo">Telefone / WhatsApp do agente</label><input id="ffo" value="${esc(pref.fone || '')}" placeholder="+55 …"></div></div>
      <h3 class="h3" style="margin-top:14px">Origem (fábrica na China)</h3>
      <div class="fields">
      <div class="f"><label class="lbl" for="fbc">Contato na fábrica</label><input id="fbc" value="${esc(pref.fabContato || '')}" placeholder="Ex.: Lily"></div>
      <div class="f"><label class="lbl" for="fbe">E-mail da fábrica</label><input id="fbe" type="email" value="${esc(pref.fabEmail || '')}" placeholder="lily@fabrica.cn"></div>
      <div class="f w2"><label class="lbl" for="fbw">WhatsApp / WeChat da fábrica</label><input id="fbw" value="${esc(pref.fabWhats || '')}" placeholder="+86 …"></div></div>
      <h3 class="h3" style="margin-top:14px">Valores e prazos</h3>
      <div class="fields">
      <div class="f"><label class="lbl" for="fus">Valor (USD)</label><input id="fus" type="number" step="0.01" value="${W.usdNum(pref.usd) || ''}"></div>
      <div class="f"><label class="lbl" for="fbr">Taxas e custos (R$)</label><input id="fbr" type="number" step="0.01" value="${+pref.brl || ''}" placeholder="0,00" title="Custos que já vêm em reais — somam ao valor em dólar convertido"></div>
      <div class="f"><label class="lbl" for="fch">Chegada prevista</label><input id="fch" type="date" value="${esc(pref.chegada || '')}"></div>
      <div class="f"><label class="lbl" for="fva">Validade</label><input id="fva" value="${esc(pref.validade || '')}" placeholder="Ex.: 15/08"></div>
      <div class="f"><label class="lbl" for="fst">Status</label><select id="fst">${lista(W.FRETE_STATUS, pref.status)}</select></div>
      <div class="f"><label class="lbl" for="frp">Responsável</label><select id="frp">${lista(resp, respSel)}</select></div></div>
      <div class="banner" id="fref" style="display:none;margin-top:12px"></div>
      <p class="note" id="fprev" style="margin-top:8px"></p>
      ${id && pref.ptaxLock ? `<p class="note" style="margin-top:4px">PTAX da chegada travada: ${tx(pref.ptaxLock.rate)} (${esc(pref.ptaxLock.date || '')}). Mudar a data de chegada solta a trava para buscar a PTAX do novo dia.</p>` : ''}`,
      '<button class="btn" data-x>Cancelar</button><button class="btn pri" id="fok">' + (id ? 'Salvar alterações' : 'Registrar') + '</button>');
    m.querySelector('.modal').classList.add('larga');
    const sel = m.querySelector('#fe');

    const empresa = () => sel.value === '__outra' ? val(m, '#feo') : sel.value;
    const preencherContato = () => { const a = ag[sel.value]; if (a) { if (a.contato) m.querySelector('#fct').value = a.contato; if (a.fone) m.querySelector('#ffo').value = a.fone; } };
    function dica() {
      const u = num(m, '#fus'), ex = num(m, '#fbr'), regra = W.regraAgente(ag, empresa()), fx = fxAtual();
      const p = W.previaFreteBRL(u, ex, regra, fx), pv = m.querySelector('#fprev');
      if (!p) pv.innerHTML = '';
      else if (p.semPtax) pv.innerHTML = p.extras ? `Taxas: <b>${brl(p.extras)}</b> — informe a PTAX para somar a parte em dólar.` : 'Informe a PTAX para converter o dólar.';
      else {
        const det = p.conv && p.extras ? `${brl(p.conv)} (USD × PTAX ${tx(p.rate)}${regra ? ' +' + regra + '%' : ''}) + ${brl(p.extras)} em taxas`
          : p.conv ? `PTAX ${tx(p.rate)}${regra ? ' +' + regra + '%' : ''} — projeção; trava na PTAX oficial do dia da chegada` : 'somente taxas e custos em reais';
        pv.innerHTML = `Total ≈ <b>${brl(p.total)}</b> (${det})`;
      }
      const r = W.referenciaRota(H.db.fretes.filter(f => f && f._id !== id), val(m, '#fro'), u), box = m.querySelector('#fref');
      if (!r) { box.style.display = 'none'; return; }
      box.style.display = '';
      box.innerHTML = r.melhor
        ? `<b>Referência interna desta rota:</b> ${usd(u)} é o melhor valor já registrado (${r.n} cotação(ões)).`
        : `<b>Referência interna desta rota:</b> menor valor já registrado ${usd(r.min)} (${r.n} cotação(ões)). Está ${usd(r.acima)} acima — <b>há espaço para negociar</b>.`;
    }
    sel.addEventListener('change', () => { m.querySelector('#feob').style.display = sel.value === '__outra' ? '' : 'none'; preencherContato(); dica(); });
    ['#fus', '#fbr', '#fro', '#feo'].forEach(s => m.querySelector(s).addEventListener('input', dica));
    m.querySelector('#fch').addEventListener('change', dica);
    // Ao editar, o contato é o da cotação — buscar o da agenda apagaria o que foi ajustado só para aquele frete.
    if (!id) preencherContato();
    dica();

    m.querySelector('#fok').onclick = () => {
      const emp = empresa();
      if (!emp) { H.toast('Selecione a empresa'); return; }
      if (!val(m, '#fro')) { H.toast('Informe a rota'); return; }
      const campos = { op: val(m, '#fop'), empresa: emp, rota: val(m, '#fro'), modal: val(m, '#fmo'),
        contato: val(m, '#fct'), fone: val(m, '#ffo'), fabContato: val(m, '#fbc'), fabEmail: val(m, '#fbe'), fabWhats: val(m, '#fbw'),
        usd: num(m, '#fus'), brl: num(m, '#fbr'), chegada: val(m, '#fch'), validade: val(m, '#fva'), status: val(m, '#fst'), resp: val(m, '#frp') };
      if (id) {
        const f = H.db.fretes.find(x => x && x._id === id);
        if (!f) { H.fecharModal(); H.toast('Cotação não encontrada — talvez tenha sido apagada. Nada foi gravado.'); H.render(); return; }
        if (sel.value === '__outra') W.garantirAgente(H.db.agentes, emp);
        W.guardarContatoAgente(H.db.agentes, emp, campos.contato, campos.fone);   // "já fica salvo" na agenda
        W.editarFrete(f, campos);
        H.salvar(); H.fecharModal(); H.toast('Cotação de frete atualizada'); H.render();
        return;
      }
      if (sel.value === '__outra') W.garantirAgente(H.db.agentes, emp);
      W.guardarContatoAgente(H.db.agentes, emp, campos.contato, campos.fone);
      H.db.fretes.unshift(W.novoFrete(campos));
      H.salvar(); H.fecharModal(); H.toast('Cotação de frete registrada'); H.render();
    };
  }

  /* ---------- Agenda de agentes & armadores ---------- */
  function abrirAgenda() {
    garantir();
    const ag = H.db.agentes, pr = podeRegra();
    const nomes = Object.keys(ag);
    const m = H.modal('Agentes & regra da PTAX', `<p class="note" style="margin-bottom:12px">Contato e telefone ficam salvos e preenchem sozinhos a próxima cotação. A regra de conversão (% sobre a PTAX) vale para <b>todos</b> os agentes desta lista, NSL e Suntrans inclusive, e ${pr ? '<b>pode ser ajustada por você</b> — o frete em R$ recalcula na hora' : 'só Samir e Davi ajustam'}.</p>
      ${nomes.length ? `<div class="tw" style="max-height:55vh;overflow-y:auto"><table><thead><tr><th>Empresa</th><th>Tipo</th><th>Regra</th><th>Contato</th><th>Telefone</th></tr></thead><tbody>
      ${nomes.map((k, i) => { const a = ag[k] || {}; return `<tr><td><b>${esc(k)}</b></td><td class="note">${esc(a.tipo || '')}</td>
        <td>${pr ? `<input class="inp" type="number" step="0.1" data-i="${i}" data-c="regra" value="${+a.regra || 0}" style="width:80px" aria-label="Regra de ${esc(k)} (%)">` : `PTAX${+a.regra ? ' +' + a.regra + '%' : ''}`}</td>
        <td><input class="inp" data-i="${i}" data-c="contato" value="${esc(a.contato || '')}" style="min-width:110px" aria-label="Contato de ${esc(k)}"></td>
        <td><input class="inp" data-i="${i}" data-c="fone" value="${esc(a.fone || '')}" style="min-width:120px" aria-label="Telefone de ${esc(k)}"></td></tr>`; }).join('')}</tbody></table></div>`
        : '<p class="empty">Nenhuma empresa na agenda. Use "Outra…" na cotação para incluir.</p>'}`,
      '<button class="btn pri" data-x>Fechar</button>');
    m.querySelector('.modal').classList.add('larga');
    m.querySelectorAll('[data-c]').forEach(inp => inp.addEventListener('change', () => {
      const a = H.db.agentes[nomes[+inp.dataset.i]]; if (!a) return;     // mexe no próprio registro: campos que o Hub não usa ficam
      if (inp.dataset.c === 'regra') { if (!podeRegra()) return; a.regra = +inp.value || 0; } else a[inp.dataset.c] = inp.value;
      H.salvar(); H.render();
    }));
  }

  /* ---------- Leitura automática da proposta ---------- */
  function abrirLeitura() {
    const m = H.modal('Ler proposta de frete (automático)', `<p class="note" style="margin-bottom:10px">Abra o PDF da proposta, selecione tudo (Ctrl+A → Ctrl+C) e cole aqui. O sistema identifica empresa, valor, rota, validade, chegada e modal — o Matheus só confere e registra.</p>
      <textarea id="fptxt" rows="9" style="width:100%" placeholder="Cole aqui o texto da proposta…"></textarea>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="fpok">Ler e preencher</button>');
    m.querySelector('#fpok').onclick = () => {
      const t = m.querySelector('#fptxt').value;
      if (!t.trim()) { H.toast('Cole o texto da proposta'); return; }
      const p = W.lerPropostaFrete(t), n = Object.keys(p).length;
      abrirFrete(p, null);
      H.toast(n ? 'Li ' + n + ' campo(s) — <b>confira antes de registrar</b>.' : 'Não reconheci os campos — preencha manualmente.');
    };
  }

  /* ---------- Pedido de análise de mercado ---------- */
  function abrirPrompt() {
    const txt = W.promptMercadoFrete(H.db.fretes, W.hojeBR());
    const m = H.modal('Análise de mercado — pedido pronto', `<p class="note" style="margin-bottom:10px">Copie e cole no Claude (chat). Em minutos volta a análise para o Matheus negociar — e o Samir só aprova a contraproposta final.</p>
      <textarea id="fptx" rows="14" style="width:100%">${esc(txt)}</textarea>`,
      '<button class="btn" data-x>Fechar</button><button class="btn pri" id="fpcp">Copiar</button>');
    m.querySelector('.modal').classList.add('larga');
    m.querySelector('#fpcp').onclick = async () => {
      const a = m.querySelector('#fptx');
      try { await navigator.clipboard.writeText(a.value); H.toast('Copiado — cole no Claude'); }
      catch (e) { a.select(); try { document.execCommand('copy'); H.toast('Copiado'); } catch (e2) { H.toast('Selecione o texto e copie com Ctrl+C'); } }
    };
  }
})();
