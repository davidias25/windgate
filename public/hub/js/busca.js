/* =====================================================================
   WindGate Hub 2.0 — busca global (tela).

   A barra do topo vira a busca de tudo o que a pessoa pode ver. Quem decide o que ela pode ver é o
   SERVIDOR (GET /api/search): a tela só mostra o que chega. Ctrl+K / Cmd+K abre, setas + Enter
   navegam, Esc fecha. Busca enquanto digita (a partir de 2 letras, 250 ms depois de parar).
   Últimas buscas: só no navegador da própria pessoa.
   ===================================================================== */
(function () {
  const H = window.HUB, W = H.W, esc = H.esc;
  const PERIODOS = [['', 'Qualquer data'], ['7d', '7 dias'], ['30d', '30 dias'], ['90d', '90 dias'], ['365d', '12 meses']];
  const estado = { q: '', tipo: '', periodo: '', res: null, sel: -1, aberto: false, carregando: false, seq: 0 };
  let tDigita = null, painel = null, campo = null;

  /* ---------- Últimas buscas (só da pessoa, no navegador dela) ---------- */
  const chaveRecentes = () => 'wg.buscas.' + (H.userKey || '');
  const recentes = () => { try { return JSON.parse(localStorage.getItem(chaveRecentes()) || '[]').slice(0, 8); } catch (e) { return []; } };
  const lembrar = q => { try { const l = [q].concat(recentes().filter(x => x !== q)).slice(0, 8); localStorage.setItem(chaveRecentes(), JSON.stringify(l)); } catch (e) { /* sem armazenamento: segue sem histórico */ } };

  /* ---------- Destaque do termo, sem diferença de acento ---------- */
  const sa = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function destacar(txt, termos) {
    const t = String(txt || ''); if (!t || !(termos || []).length) return esc(t);
    /* Mapa de posições do texto sem acento para o original (uma letra acentuada vira uma). */
    const base = [], mapa = []; [...t].forEach((ch, i) => { const n = sa(ch); for (const c of n) { base.push(c); mapa.push(i); } });
    const b = base.join(''), marca = new Array(t.length).fill(false);
    termos.filter(x => x && x.length >= 2).forEach(x => { let i = b.indexOf(x); while (i >= 0) { for (let j = i; j < i + x.length && j < mapa.length; j++) marca[mapa[j]] = true; i = b.indexOf(x, i + x.length); } });
    let out = '', dentro = false;
    [...t].forEach((ch, i) => { if (marca[i] && !dentro) { out += '<mark>'; dentro = true; } if (!marca[i] && dentro) { out += '</mark>'; dentro = false; } out += esc(ch); });
    return out + (dentro ? '</mark>' : '');
  }

  /* ---------- Servidor ---------- */
  async function consultar(q, extra) {
    const p = new URLSearchParams(Object.assign({ q }, extra || {}));
    const r = await H.api('/api/search?' + p.toString());
    return r.json();
  }

  /* ---------- Painel suspenso ---------- */
  function garantirPainel() {
    if (painel) return painel;
    painel = document.createElement('div'); painel.id = 'buscaPainel'; painel.className = 'busca-painel'; painel.hidden = true; painel.setAttribute('role', 'listbox');
    campo.closest('.search').appendChild(painel);
    painel.addEventListener('mousedown', e => e.preventDefault());   // clicar no painel não tira o foco do campo
    painel.addEventListener('click', e => {
      const it = e.target.closest('[data-res]'); if (it) return abrirItem(+it.dataset.res);
      const vt = e.target.closest('[data-vt]'); if (vt) return verTodos(vt.dataset.vt);
      const rc = e.target.closest('[data-rec]'); if (rc) { campo.value = rc.dataset.rec; return buscarJa(); }
      const fl = e.target.closest('[data-ftipo]'); if (fl) { estado.tipo = fl.dataset.ftipo; return buscarJa(); }
      const fp = e.target.closest('[data-fper]'); if (fp) { estado.periodo = fp.dataset.fper; return buscarJa(); }
    });
    return painel;
  }
  const itensVisiveis = () => (estado.res && estado.res.grupos || []).flatMap(g => g.itens);
  function desenhar() {
    const p = garantirPainel(), q = estado.q;
    if (!estado.aberto) { p.hidden = true; return; }
    p.hidden = false;
    if (q.length < 2) {
      const rs = recentes();
      p.innerHTML = `<div class="bp-h">Busca global · <span class="note">Ctrl+K · setas e Enter · Esc fecha</span></div>${rs.length ? `<div class="bp-sec">Suas últimas buscas</div>${rs.map(r => `<button class="bp-rec" data-rec="${esc(r)}">↺ ${esc(r)}</button>`).join('')}` : '<p class="bp-vazio">Digite ao menos 2 letras: código da operação, cliente, CNPJ, valor, data…</p>'}`;
      return;
    }
    const r = estado.res, tipos = (r && r.permitidos) || [];
    const filtros = `<div class="bp-filtros">${[['', 'Tudo']].concat((r && r.abas) || []).map(([k, l]) => `<button class="chip ${estado.tipo === k ? 'on' : ''}" data-ftipo="${k}">${esc(l)}</button>`).join('')}
      <span class="bp-sep"></span>${PERIODOS.map(([k, l]) => `<button class="chip ${estado.periodo === k ? 'on' : ''}" data-fper="${k}">${esc(l)}</button>`).join('')}</div>`;
    if (!r || estado.carregando && !r.grupos) { p.innerHTML = filtros + '<p class="bp-vazio">Buscando…</p>'; return; }
    if (!r.grupos.length) {
      p.innerHTML = filtros + `<p class="bp-vazio">Nenhum resultado para <b>${esc(q)}</b>.${estado.tipo || estado.periodo ? ' <button class="btn sm" data-ftipo="">Tirar os filtros</button>' : ' Tente só o código (ex.: OP227), parte do nome ou o CNPJ sem pontos.'}</p>`;
      return;
    }
    let n = 0;
    p.innerHTML = filtros + r.grupos.map(g => `<div class="bp-grupo"><div class="bp-sec"><span>${g.icone} ${esc(g.aba)}</span><span class="pill">${g.total}</span></div>
      ${g.itens.map(i => { const idx = n++; return `<button class="bp-item ${idx === estado.sel ? 'on' : ''}" data-res="${idx}" role="option" aria-selected="${idx === estado.sel}"><b>${destacar(i.titulo, r.termos)}</b><small>${destacar(i.contexto, r.termos)}</small>${i.trecho ? `<small class="note">${destacar(i.trecho, r.termos)}</small>` : ''}</button>`; }).join('')}
      ${g.total > g.itens.length ? `<button class="bp-vt" data-vt="${g.tipo}">Ver todos os ${g.total} em ${esc(g.aba)} →</button>` : ''}</div>`).join('')
      + `<div class="bp-rod note">${r.total} resultado(s) · ${r.ms} ms</div>`;
    void tipos;
  }
  async function buscarJa() {
    const q = campo.value.trim(); estado.q = q; estado.sel = -1;
    if (q.length < 2) { estado.res = null; return desenhar(); }
    const seq = ++estado.seq; estado.carregando = true; desenhar();
    try {
      const j = await consultar(q, Object.assign({}, estado.tipo ? { tipo: estado.tipo } : {}, estado.periodo ? { periodo: estado.periodo } : {}));
      if (seq !== estado.seq) return;            // chegou depois de uma busca mais nova
      if (!j.success) { estado.res = { grupos: [], total: 0, ms: 0 }; return desenhar(); }
      j.abas = (j.permitidos || []).map(t => [t, NOMES[t] || t]);
      estado.res = j; estado.carregando = false; desenhar();
      if (j.total) lembrar(q);
    } catch (e) { if (seq === estado.seq) { estado.res = { grupos: [], total: 0, ms: 0 }; estado.carregando = false; desenhar(); } }
  }
  const NOMES = { ops: 'Operações', cotacoes: 'Cotações', crm: 'CRM', fin: 'Financeiro', tarefas: 'Tarefas', fretes: 'Fretes', docs: 'Documentos', notas: 'Notas', sourcing: 'Sourcing' };
  function abrirItem(idx) {
    const it = itensVisiveis()[idx]; if (!it) return;
    fechar(); campo.blur();
    if (it.tipo === 'ops') H.buscaGlobal = '';
    H.ir(it.link.tela, it.link.param);
  }
  function verTodos(tipo) { const q = estado.q; fechar(); H.ir('busca', JSON.stringify({ q, tipo, periodo: estado.periodo })); }
  function fechar() { estado.aberto = false; desenhar(); }

  /* ---------- Teclado ---------- */
  function ligar() {
    campo = document.getElementById('busca'); if (!campo || campo._busca) return; campo._busca = true;
    campo.placeholder = 'Buscar em tudo: operação, cliente, CNPJ, valor, data…  (Ctrl+K)';
    campo.addEventListener('focus', () => { estado.aberto = true; desenhar(); });
    campo.addEventListener('blur', () => setTimeout(fechar, 120));
    campo.addEventListener('input', () => { estado.aberto = true; clearTimeout(tDigita); tDigita = setTimeout(buscarJa, 250); if (campo.value.trim().length < 2) { estado.q = campo.value.trim(); estado.res = null; desenhar(); } });
    campo.addEventListener('keydown', e => {
      const n = itensVisiveis().length;
      if (e.key === 'Escape') { fechar(); campo.blur(); return; }
      if (e.key === 'ArrowDown' && n) { e.preventDefault(); estado.sel = (estado.sel + 1) % n; desenhar(); return; }
      if (e.key === 'ArrowUp' && n) { e.preventDefault(); estado.sel = (estado.sel - 1 + n) % n; desenhar(); return; }
      if (e.key === 'Enter') { e.preventDefault(); clearTimeout(tDigita); if (estado.sel >= 0) return abrirItem(estado.sel); if (n) return abrirItem(0); buscarJa(); }
    });
  }
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { if (!campo) ligar(); if (!campo) return; e.preventDefault(); campo.focus(); campo.select(); estado.aberto = true; desenhar(); }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ligar); else ligar();
  H.ligarBusca = ligar;

  /* ---------- "Ver todos": lista completa, filtrada e paginada ---------- */
  let tela = { q: '', tipo: '', periodo: '', pagina: 1 };
  H.telas.busca = async function (el, param) {
    if (param) { try { tela = Object.assign({ pagina: 1 }, JSON.parse(param)); } catch (e) { tela = { q: String(param), tipo: '', periodo: '', pagina: 1 }; } H.estado.param = null; }
    el.innerHTML = '<p class="empty">Buscando…</p>';
    let j = null; try { j = await consultar(tela.q, Object.assign({ pagina: tela.pagina, porGrupo: 20 }, tela.tipo ? { tipo: tela.tipo } : {}, tela.periodo ? { periodo: tela.periodo } : {})); } catch (e) { j = null; }
    if (!j || !j.success) { el.innerHTML = '<div class="banner">Não consegui buscar agora.</div>'; return; }
    const g = (j.grupos || [])[0], abas = (j.permitidos || []).map(t => [t, NOMES[t] || t]);
    el.innerHTML = `<div class="head"><div><h1>Busca: “${esc(tela.q)}”</h1><p class="sub">${g ? `${g.total} resultado(s) em ${esc(g.aba)}` : 'Nenhum resultado'} · só o que você pode ver</p></div>
      <div class="btns"><select class="inp" id="bt" aria-label="Aba">${[['', 'Todas as abas']].concat(abas).map(([k, l]) => `<option value="${k}" ${tela.tipo === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <select class="inp" id="bpr" aria-label="Período">${PERIODOS.map(([k, l]) => `<option value="${k}" ${tela.periodo === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div></div>
      ${(j.grupos || []).map(gr => `<div class="box"><div class="box-h"><h2>${gr.icone} ${esc(gr.aba)}</h2><span class="pill">${gr.total}</span></div><div class="box-b list">
        ${gr.itens.map((i, x) => `<button class="bp-item" data-tl="${gr.tipo}:${x}" style="width:100%"><b>${destacar(i.titulo, j.termos)}</b><small>${destacar(i.contexto, j.termos)}</small>${i.trecho ? `<small class="note">${destacar(i.trecho, j.termos)}</small>` : ''}</button>`).join('')}</div>
        ${tela.tipo && gr.paginas > 1 ? `<div class="box-b btns"><button class="btn sm" id="bant" ${gr.pagina <= 1 ? 'disabled' : ''}>← Anterior</button><span class="note">página ${gr.pagina} de ${gr.paginas}</span><button class="btn sm" id="bprox" ${gr.pagina >= gr.paginas ? 'disabled' : ''}>Próxima →</button></div>`
          : !tela.tipo && gr.total > gr.itens.length ? `<div class="box-b"><button class="btn sm" data-so="${gr.tipo}">Ver todos os ${gr.total}</button></div>` : ''}</div>`).join('') || `<p class="empty">Nenhum resultado para “${esc(tela.q)}”.${tela.tipo || tela.periodo ? ' Tente sem os filtros.' : ''}</p>`}`;
    const re = () => H.telas.busca(el);
    el.querySelector('#bt').onchange = e => { tela.tipo = e.target.value; tela.pagina = 1; re(); };
    el.querySelector('#bpr').onchange = e => { tela.periodo = e.target.value; tela.pagina = 1; re(); };
    const a = el.querySelector('#bant'), p = el.querySelector('#bprox');
    if (a) a.onclick = () => { tela.pagina--; re(); }; if (p) p.onclick = () => { tela.pagina++; re(); };
    el.querySelectorAll('[data-so]').forEach(b => b.onclick = () => { tela.tipo = b.dataset.so; tela.pagina = 1; re(); });
    el.querySelectorAll('[data-tl]').forEach(b => b.onclick = () => { const [t, x] = b.dataset.tl.split(':'); const i = ((j.grupos.find(z => z.tipo === t) || {}).itens || [])[+x]; if (i) H.ir(i.link.tela, i.link.param); });
  };
})();
