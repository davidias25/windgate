/* WindGate Hub 2.0 — núcleo: login, dados, navegação e componentes de tela. */
(function () {
  const W = window.WG;
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const H = window.HUB = {
    db: null, user: null, userKey: null, token: null, conhecidos: {}, telas: {},
    $, esc, W,
    estado: { tela: 'torre', param: null }
  };

  /* ---------------- API ---------------- */
  async function api(caminho, opts) {
    const o = Object.assign({ headers: {} }, opts || {});
    if (H.token) o.headers.Authorization = 'Bearer ' + H.token;
    const r = await fetch(caminho, o);
    if (r.status === 401) { sair('Sessão expirada — entre de novo.'); throw new Error('401'); }
    return r;
  }
  H.api = api;

  /* ---------------- Dados ---------------- */
  function setSync(estado, txt) {
    const el = $('#sync'); if (!el) return;
    el.className = 'sync ' + (estado || '');
    el.querySelector('span').textContent = txt;
  }

  async function carregar() {
    const r = await api('/api/db');
    const j = await r.json();
    if (!j.success || !j.db) throw new Error('Banco central indisponível. Nada foi alterado — tente de novo em instantes.');
    H.db = W.prepararBanco(j.db);
    H.conhecidos = W.fotografarIds(H.db);
    setSync('', 'Sincronizado');
  }

  let tSalvar = null, salvando = false, pendente = false;
  /** Grava o banco inteiro; o servidor mescla registro a registro. */
  H.salvar = function () {
    H.conhecidos = W.registrarRemocoes(H.db, H.conhecidos);
    setSync('busy', 'Salvando…');
    clearTimeout(tSalvar);
    tSalvar = setTimeout(async () => {
      if (salvando) { pendente = true; return; }
      salvando = true;
      try {
        const r = await api('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(H.db) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.success) throw new Error(j.message || 'Falha ao salvar');
        setSync('', 'Salvo');
      } catch (e) {
        setSync('err', 'Não salvou — tentando de novo');
        toast('Não consegui salvar agora. Nada foi perdido: vou tentar de novo em instantes.');
        setTimeout(H.salvar, 5000);
      } finally {
        salvando = false;
        if (pendente) { pendente = false; H.salvar(); }
      }
    }, 400);
  };

  /* Busca o que os outros salvaram, sem perder o que ainda não subiu. */
  async function sincronizar() {
    if (!H.db || document.querySelector('.modal-bg') || salvando || tSalvar && pendente) return;
    try {
      const r = await api('/api/db'); const j = await r.json();
      if (!j.success || !j.db) return;
      const antes = JSON.stringify(H.db);
      H.db = W.aplicarSincronizacao(H.db, j.db);
      H.conhecidos = W.fotografarIds(H.db);
      if (JSON.stringify(H.db) !== antes) render();
      setSync('', 'Sincronizado');
    } catch (e) { setSync('err', 'Sem conexão'); }
  }

  /* ---------------- UI ---------------- */
  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 3600);
  }
  H.toast = toast;

  H.modal = function (titulo, corpo, acoes) {
    fecharModal();
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(titulo)}"><div class="box-h"><h2>${esc(titulo)}</h2><button class="btn ghost" data-x>Fechar</button></div><div class="box-b">${corpo}</div>${acoes ? `<div class="acts">${acoes}</div>` : ''}</div>`;
    bg.addEventListener('click', e => { if (e.target === bg || e.target.hasAttribute('data-x')) fecharModal(); });
    document.body.appendChild(bg);
    const f = bg.querySelector('input,select,textarea'); if (f) f.focus();
    return bg;
  };
  function fecharModal() { document.querySelectorAll('.modal-bg').forEach(m => m.remove()); }
  H.fecharModal = fecharModal;

  H.pillStatus = k => { const m = W.stMeta(k); return `<span class="pill" style="background:${m.c}1A;color:${m.c}">${esc(m.l)}</span>`; };
  H.semaforo = (db, o) => {
    const p = W.prazoInfo(db, o);
    if (p.dias == null) return '<span class="note">—</span>';
    if (!p.alvo) return `<span class="note">${p.dias} d</span>`;
    const cor = p.sit === 'atrasado' ? 'var(--crit)' : p.sit === 'atencao' ? 'var(--warn)' : 'var(--ok)';
    return `<span class="sem"><span class="bar"><i style="width:${Math.min(100, p.dias / p.alvo * 100)}%;background:${cor}"></i></span><span style="color:${cor};font-weight:600">${p.dias}/${p.alvo} d</span></span>`;
  };
  H.nomeUsuario = k => { const u = (H.db.users || {})[k]; return u ? (u.nome || k).split(' ')[0] : (k || ''); };
  H.podeFin = () => !!(H.user && H.user.fin);
  H.aprova = () => !!(H.user && (H.user.aprova || H.userKey === 'samir'));

  /* ---------------- Navegação ---------------- */
  const MENU = [
    { g: 'Operação', itens: [['torre', 'Torre de Controle'], ['ops', 'Operações'], ['mapa', 'Mapa & Tracking'], ['docs', 'Documentos']] },
    { g: 'Comercial', itens: [['L:cotacoes', 'Cotações'], ['L:crm', 'CRM & Clientes'], ['L:sourcing', 'Sourcing China'], ['L:parceiros', 'Fornecedores'], ['L:frete', 'Fretes']] },
    { g: 'Financeiro', fin: true, itens: [['fin', 'Painel & DRE'], ['contas', 'Contas a pagar e receber'], ['lanc', 'Lançamentos'], ['resop', 'Resultado por operação']] },
    { g: 'Gestão', itens: [['L:agenda', 'Agenda'], ['L:gestao', 'Gestão do Mês'], ['L:ponto', 'Ponto'], ['L:org', 'Equipe'], ['L:config', 'Configurações']] }
  ];

  function montarMenu() {
    const nav = $('#menu'); nav.innerHTML = '';
    MENU.forEach(sec => {
      if (sec.fin && !H.podeFin()) return;
      const g = document.createElement('div'); g.className = 'grp'; g.textContent = sec.g; nav.appendChild(g);
      const lista = document.createElement('div'); lista.className = 'nav';
      sec.itens.forEach(([k, l]) => {
        if (k.startsWith('L:')) {
          const a = document.createElement('a'); a.href = '/?aba=' + k.slice(2); a.innerHTML = `${esc(l)} <span class="tag">atual</span>`;
          a.title = 'Ainda no sistema atual — será refeito no Hub 2.0'; lista.appendChild(a);
        } else {
          const b = document.createElement('button'); b.dataset.t = k; b.textContent = l;
          b.onclick = () => ir(k); lista.appendChild(b);
        }
      });
      nav.appendChild(lista);
    });
  }

  function ir(tela, param) {
    H.estado = { tela, param: param == null ? null : param };
    try { history.replaceState(null, '', '#' + tela + (param ? '-' + encodeURIComponent(param) : '')); } catch (e) {}
    render(); window.scrollTo(0, 0);
  }
  H.ir = ir;

  function render() {
    if (!H.db) return;
    const t = H.estado.tela;
    document.querySelectorAll('#menu button').forEach(b => b.toggleAttribute('aria-current', b.dataset.t === t || (t === 'ficha' && b.dataset.t === 'ops')));
    document.querySelectorAll('#menu button[aria-current]').forEach(b => b.setAttribute('aria-current', 'page'));
    const fn = H.telas[t] || H.telas.torre;
    const alvo = $('#conteudo');
    try { fn(alvo, H.estado.param); }
    catch (e) { console.error(e); alvo.innerHTML = `<div class="banner">Erro ao montar esta tela: ${esc(e.message)}. Seus dados não foram alterados.</div>`; }
    const n = W.alertas(H.db).filter(a => a.nivel !== 'info').length;
    $('#nAlertas').textContent = n; $('#nAlertas').hidden = !n;
  }
  H.render = render;

  /* ---------------- Login ---------------- */
  async function telaLogin() {
    $('#app').hidden = true; $('#login').hidden = false;
    const caixa = $('#lgUsers');
    try {
      const j = await (await fetch('/api/auth/usuarios')).json();
      caixa.innerHTML = (j.usuarios || []).map(u => `<button class="lg-user" data-k="${esc(u.key)}"><span class="av" style="background:${esc(u.cor)}">${esc((u.nome || u.key)[0])}</span><b>${esc(u.nome)}</b><small>${esc(u.papel)}</small></button>`).join('');
    } catch (e) { caixa.innerHTML = '<p class="lg-err">Servidor indisponível.</p>'; }
    caixa.querySelectorAll('.lg-user').forEach(b => b.onclick = () => {
      H.userKey = b.dataset.k; $('#lgPin').hidden = false; $('#pin').value = ''; $('#pin').focus();
      $('#lgNome').textContent = b.querySelector('b').textContent;
    });
  }

  async function entrar(pin) {
    $('#lgErr').textContent = '';
    try {
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: H.userKey, pin }) });
      const j = await r.json();
      if (!j.success) { $('#lgErr').textContent = j.message || 'PIN incorreto.'; $('#pin').value = ''; return; }
      H.token = j.token || null;
      try { sessionStorage.setItem('wg_hub_sessao', JSON.stringify({ token: H.token, k: H.userKey })); } catch (e) {}
      await iniciar();
      if (j.semAuth && H.user && String(H.user.pin) !== String(pin)) { sair('PIN incorreto.'); }
    } catch (e) { $('#lgErr').textContent = 'Não consegui entrar: ' + e.message; }
  }

  async function iniciar() {
    await carregar();
    H.user = (H.db.users || {})[H.userKey];
    if (!H.user) throw new Error('Usuário não encontrado no banco.');
    $('#login').hidden = true; $('#app').hidden = false;
    $('#meNome').textContent = (H.user.nome || H.userKey).split(' ')[0];
    $('#mePapel').textContent = H.user.papel || '';
    $('#meAv').textContent = (H.user.nome || H.userKey)[0]; $('#meAv').style.background = H.user.cor || 'var(--blue)';
    montarMenu();
    const h = decodeURIComponent((location.hash || '').slice(1));
    if (h) { const i = h.indexOf('-'); H.estado = i > 0 ? { tela: h.slice(0, i), param: h.slice(i + 1) } : { tela: h, param: null }; }
    if (['fin', 'contas', 'lanc', 'resop'].includes(H.estado.tela) && !H.podeFin()) H.estado = { tela: 'torre', param: null };
    render();
    setInterval(sincronizar, 15000);
  }

  function sair(msg) {
    try { sessionStorage.removeItem('wg_hub_sessao'); } catch (e) {}
    H.token = null; H.db = null; H.user = null;
    if (msg) setTimeout(() => toast(esc(msg)), 50);
    telaLogin();
  }
  H.sair = sair;

  document.addEventListener('DOMContentLoaded', async () => {
    $('#pin').addEventListener('keydown', e => { if (e.key === 'Enter') entrar(e.target.value); });
    $('#pinOk').onclick = () => entrar($('#pin').value);
    $('#sair').onclick = () => sair();
    $('#bell').onclick = () => ir('torre');
    $('#busca').addEventListener('keydown', e => { if (e.key === 'Enter') { H.estado = { tela: 'ops', param: null }; H.buscaGlobal = e.target.value; render(); } });
    try {
      const s = JSON.parse(sessionStorage.getItem('wg_hub_sessao') || 'null');
      if (s && s.k) { H.token = s.token; H.userKey = s.k; await iniciar(); return; }
    } catch (e) { /* sessão velha: volta ao login */ }
    telaLogin();
  });
})();
