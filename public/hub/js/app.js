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
    if (H.userKey) o.headers['X-Hub-Usuario'] = H.userKey;   // só usado quando o login do servidor está desligado
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
    base = W.fotografarConteudo(H.db);
    setSync('', 'Sincronizado');
  }

  /* Gravação: versao conta cada alteração local; versaoSalva é a última que o
     servidor confirmou. Enquanto versao > versaoSalva há alteração não salva
     e a sincronização NÃO substitui nada local. Só sobe o que mudou. */
  let base = null, versao = 0, versaoSalva = 0, salvando = false, tSalvar = null, tRetry = null;
  const sujo = () => versao > versaoSalva;
  H.temPendencia = sujo;

  H.salvar = function () {
    if (!H.db) return;
    H.conhecidos = W.registrarRemocoes(H.db, H.conhecidos);
    versao++;
    setSync('busy', 'Salvando…');
    clearTimeout(tSalvar);
    tSalvar = setTimeout(enviar, 400);
  };

  async function enviar() {
    tSalvar = null;
    if (!H.db || !sujo()) return;
    if (salvando) return;                       // o finally reenvia
    salvando = true; clearTimeout(tRetry); tRetry = null;
    const v = versao;
    const { corpo } = W.diferencas(H.db, base);
    let ok = false;
    try {
      const r = await api('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.message || 'Falha ao salvar');
      W.absorver(base, corpo);
      versaoSalva = Math.max(versaoSalva, v);
      ok = true;
      setSync(sujo() ? 'busy' : '', sujo() ? 'Salvando…' : 'Salvo');
      guardarPendente(null);
    } catch (e) {
      if (e.message === '401') return;           // sair() guarda o pendente
      guardarPendente(H.db);
      setSync('err', 'Não salvou — tentando de novo');
      toast('Não consegui salvar agora. A alteração está guardada neste navegador e vou tentar de novo em instantes.');
      tRetry = setTimeout(enviar, 5000);
    } finally {
      salvando = false;
      if (ok && sujo() && !tSalvar) enviar();
    }
  }

  /* Registro que o SERVIDOR acabou de gravar (ex.: NF-e): entra na tela já
     como sincronizado, para não voltar ao servidor como alteração local. */
  H.aplicarDoServidor = function (colecao, rec) {
    if (!H.db || !rec || !rec._id) return;
    const l = Array.isArray(H.db[colecao]) ? H.db[colecao] : (H.db[colecao] = []);
    const i = l.findIndex(x => x && x._id === rec._id);
    if (i >= 0) l[i] = rec; else l.unshift(rec);
    if (base) W.absorver(base, { [colecao]: [rec] });
    H.conhecidos = W.fotografarIds(H.db);
  };

  /* Cópia de segurança do que não subiu (queda de rede, sessão expirada). */
  const CHAVE_PEND = 'wg_hub_pendente';
  function guardarPendente(db) {
    try {
      if (!db) sessionStorage.removeItem(CHAVE_PEND);
      else sessionStorage.setItem(CHAVE_PEND, JSON.stringify({ corpo: W.diferencas(db, base).corpo, em: Date.now() }));
    } catch (e) { /* sem espaço: segue só em memória */ }
  }
  async function reenviarPendente() {
    let p = null; try { p = JSON.parse(sessionStorage.getItem(CHAVE_PEND) || 'null'); } catch (e) {}
    if (!p || !p.corpo) return false;
    const r = await api('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p.corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success) throw new Error(j.message || 'Não consegui gravar as alterações pendentes.');
    guardarPendente(null);
    return true;
  }

  /* Busca o que os outros salvaram, sem perder o que ainda não subiu. */
  async function sincronizar() {
    if (!H.db || document.querySelector('.modal-bg') || salvando || sujo() || tSalvar) return;
    const v0 = versao;
    try {
      const r = await api('/api/db'); const j = await r.json();
      if (!j.success || !j.db) return;
      // Alguém mexeu enquanto a resposta vinha: descarta, a próxima rodada pega.
      if (versao !== v0 || salvando || sujo() || tSalvar || document.querySelector('.modal-bg')) return;
      const antes = JSON.stringify(H.db);
      H.db = W.aplicarSincronizacao(H.db, j.db);
      H.conhecidos = W.fotografarIds(H.db);
      base = W.fotografarConteudo(H.db);
      if (JSON.stringify(H.db) !== antes && !editando()) render();
      setSync('', 'Sincronizado');
    } catch (e) { if (e.message !== '401') setSync('err', 'Sem conexão'); }
  }
  /* Não redesenha a tela com o cursor dentro de um campo (perderia o que está sendo digitado). */
  const editando = () => { const a = document.activeElement; return a && a.closest && a.closest('#conteudo') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'search'; };

  /* ---------------- UI ---------------- */
  function toast(msg) {
    document.querySelectorAll('.toast').forEach(x => x.remove());   // um aviso por vez, sem empilhar
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
  /* Permissões vêm do perfil da pessoa (W.PERFIS): Torre e menus por função. */
  H.pode = cap => !!(H.db && H.userKey && W.pode(H.db, H.userKey, cap));
  H.podeFin = () => H.pode('fin.ver');
  H.aprova = () => H.pode('fin.autorizar');
  H.perfil = () => W.perfilDe(H.db, H.userKey);

  /* ---------------- Navegação ---------------- */
  /* Mesma arquitetura do protótipo aprovado. Todas as telas já estão no Hub; o sistema anterior continua em /antigo.
     L: = tela que ainda abre no sistema anterior · I: = em implantação (nenhuma hoje). */
  const MENU = [
    { g: 'Operação', itens: [['torre', 'Torre de Controle'], ['ops', 'Operações & histórico'], ['conteineres', 'Contêineres & free time'], ['mapa', 'Mapa & Tracking'], ['docs', 'Documentos'], ['portais', 'Portais externos'], ['dashops', 'Desempenho da empresa']] },
    { g: 'Comercial', itens: [['pedidos', 'Entrada de pedidos'], ['crm', 'CRM & Funil'], ['cotacoes', 'Cotações & Propostas'], ['contratos', 'Contratos']] },
    { g: 'Financeiro & Fiscal', itens: [['dashfin', 'Saúde financeira'], ['fin', 'Painel & DRE'], ['contas', 'Contas a pagar e receber'], ['lanc', 'Lançamentos'], ['custeio', 'Custeio & margem'], ['cambio', 'Câmbio & dólar'], ['contacorrente', 'Conta-corrente do cliente'], ['desembolso', 'Desembolso & Cobrança'], ['credito', 'Crédito por cliente'], ['resop', 'Resultado por operação'], ['fiscal', 'Fiscal & Contabilidade'], ['tributos', 'Tributos & transição'], ['nfe', 'NF-e (emissão)']] },
    { g: 'Inteligência', itens: [['sourcing', 'Sourcing & Fornecedores'], ['catalogo', 'Catálogo & NCM'], ['frete', 'Fretes & Benchmark'], ['compliance', 'Compliance & habilitações']] },
    { g: 'Equipe', itens: [['chat', 'Chat WindGate'], ['reuniao', 'Reunião semanal'], ['produtividade', 'Produtividade & Ranking'], ['rh', 'RH & Pessoas'], ['cultura', 'Cultura WindGate'], ['agenda', 'Agenda & Tarefas'], ['ponto', 'Ponto']] },
    { g: 'Gestão', itens: [['gestao', 'Gestão do Mês'], ['equipe', 'Equipe & Acessos'], ['integracoes', 'Integrações'], ['config', 'Configurações']] }
  ];

  function montarMenu() {
    const nav = $('#menu'); nav.innerHTML = '';
    MENU.forEach(sec => {
      const itens = sec.itens.filter(([k]) => podeTela(k));
      if (!itens.length) return;
      const g = document.createElement('div'); g.className = 'grp'; g.textContent = sec.g; nav.appendChild(g);
      const lista = document.createElement('div'); lista.className = 'nav';
      itens.forEach(([k, l]) => {
        if (k.startsWith('L:')) {
          const a = document.createElement('a'); a.href = '/antigo?aba=' + k.slice(2); a.innerHTML = `${esc(l)} <span class="tag">atual</span>`;
          a.title = 'Ainda no sistema atual — será refeito no Hub 2.0'; lista.appendChild(a);
        } else if (k.startsWith('I:')) {
          const b = document.createElement('button'); b.dataset.t = 'implantacao'; b.dataset.p = k.slice(2); b.innerHTML = `${esc(l)} <span class="tag novo">em breve</span>`;
          b.onclick = () => ir('implantacao', k.slice(2)); lista.appendChild(b);
        } else {
          const b = document.createElement('button'); b.dataset.t = k; b.textContent = l;
          b.onclick = () => ir(k); lista.appendChild(b);
        }
      });
      nav.appendChild(lista);
    });
  }

  /* Telas do Hub por permissão; telas do sistema atual pelas abas liberadas da pessoa. */
  const TELA_CAP = { fin: 'fin.ver', contas: 'fin.ver', resop: 'fin.ver', lanc: 'fin.lancar', desembolso: 'fin.ver', crm: 'crm.ver', pedidos: 'pedidos.ver', fiscal: 'fiscal.ver', integracoes: 'fiscal.editar', dashfin: 'fin.ver', rh: 'rh.ver', sourcing: 'sourcing.ver', nfe: 'nfe.ver', custeio: 'fin.resultado', cambio: 'fin.ver', contacorrente: 'fin.ver', credito: 'fin.ver', tributos: 'fin.resultado', contratos: 'fin.ver', cotacoes: 'fin.resultado' };
  /* Telas que vieram do sistema anterior seguem também a lista de abas liberadas da pessoa (users[k].tabs). */
  const TELA_ABA = { cotacoes: 'cotacoes', frete: 'frete', gestao: 'gestao' };
  const ABA_ATUAL = { crm: 'crm', sourcing: 'sourcing', parceiros: 'parceiros' };
  function podeTela(k) {
    // Acesso externo (contador): Fiscal, emissão de NF-e e o canal de contabilidade do chat.
    if (H.db && H.userKey && H.perfil().externo) return k === 'fiscal' || k === 'chat' || (k === 'nfe' && H.pode('nfe.ver'));
    // RH: equipe, cultura e comunicação; nada de operação comercial nem financeiro.
    if (H.db && H.userKey && H.perfil().id === 'rh') return ['rh', 'cultura', 'chat', 'reuniao', 'produtividade', 'ponto', 'agenda'].includes(k);
    if (k === 'implantacao' || k === 'ponto' || k === 'agenda') return true;
    if (k === 'equipe') return !!W.podeVerEquipe && W.podeVerEquipe(H.db, H.userKey);
    if (k === 'config') return !!W.podeGerirEquipe && W.podeGerirEquipe(H.db, H.userKey);
    const tabs0 = H.user && H.user.tabs;
    if (TELA_ABA[k] && Array.isArray(tabs0) && !tabs0.includes(TELA_ABA[k])) return false;
    if (k.startsWith('L:')) {
      const aba = ABA_ATUAL[k.slice(2)], tabs = H.user && H.user.tabs;
      return !Array.isArray(tabs) || tabs.includes(aba);
    }
    return !TELA_CAP[k] || H.pode(TELA_CAP[k]);
  }
  H.podeTela = podeTela;

  function ir(tela, param) {
    if (!podeTela(tela)) { H.toast('Esta área não faz parte do seu perfil.'); tela = H.perfil().externo ? 'fiscal' : H.perfil().id === 'rh' ? 'rh' : 'torre'; param = null; }
    H.estado = { tela, param: param == null ? null : param };
    try { history.replaceState(null, '', '#' + tela + (param ? '-' + encodeURIComponent(param) : '')); } catch (e) {}
    render(); window.scrollTo(0, 0);
  }
  H.ir = ir;

  function render() {
    if (!H.db) return;
    const t = H.estado.tela;
    document.querySelectorAll('#menu button').forEach(b => b.toggleAttribute('aria-current', (b.dataset.t === t && (!b.dataset.p || b.dataset.p === H.estado.param)) || (t === 'ficha' && b.dataset.t === 'ops')));
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

  let tSync = null;
  async function iniciar() {
    if (await reenviarPendente().catch(e => { toast(esc(e.message)); return false; })) toast('Alterações pendentes gravadas.');
    await carregar();
    H.user = (H.db.users || {})[H.userKey];
    if (!H.user) throw new Error('Usuário não encontrado no banco.');
    $('#login').hidden = true; $('#app').hidden = false;
    $('#meNome').textContent = (H.user.nome || H.userKey).split(' ')[0];
    $('#mePapel').textContent = H.perfil().nome;
    $('#meAv').textContent = (H.user.nome || H.userKey)[0]; $('#meAv').style.background = H.user.cor || 'var(--blue)';
    montarMenu();
    const h = decodeURIComponent((location.hash || '').slice(1));
    if (h) { const i = h.indexOf('-'); H.estado = i > 0 ? { tela: h.slice(0, i), param: h.slice(i + 1) } : { tela: h, param: null }; }
    if (!podeTela(H.estado.tela) || (H.perfil().externo && H.estado.tela === 'torre')) H.estado = { tela: H.perfil().externo ? 'fiscal' : H.perfil().id === 'rh' ? 'rh' : 'torre', param: null };
    if (H.perfil().id === 'rh' && (!location.hash || location.hash === '#torre')) H.estado = { tela: 'rh', param: null };
    render();
    clearInterval(tSync); tSync = setInterval(sincronizar, 15000);
    if (H.chatIniciar) H.chatIniciar();
  }

  function sair(msg) {
    try { sessionStorage.removeItem('wg_hub_sessao'); } catch (e) {}
    if (H.db && sujo()) { guardarPendente(H.db); msg = (msg ? msg + ' ' : '') + 'Suas alterações não salvas foram guardadas e serão gravadas assim que você entrar.'; }
    clearTimeout(tSalvar); clearTimeout(tRetry); tSalvar = tRetry = null;
    clearInterval(tSync); tSync = null;
    if (H.chat) { clearInterval(H.chat.tPoll); H.chat.carregado = false; } const ub = document.querySelector('#urgBar'); if (ub) ub.remove();
    H.token = null; H.db = null; H.user = null; base = null; versao = versaoSalva = 0;
    if (msg) setTimeout(() => toast(esc(msg)), 50);
    telaLogin();
  }
  H.sair = sair;

  window.addEventListener('beforeunload', e => { if (H.db && sujo()) { guardarPendente(H.db); e.preventDefault(); e.returnValue = ''; } });

  /* Tempo ativo no sistema: só conta minuto em que a aba está na frente e houve
     uso nos últimos 2 minutos. Guarda a área, nunca o que foi digitado. */
  let ultimoUso = Date.now();
  ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { ultimoUso = Date.now(); }, { passive: true }));
  setInterval(() => {
    if (!H.db || !H.userKey || document.visibilityState !== 'visible' || Date.now() - ultimoUso > 120000) return;
    api('/api/atividade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tela: H.estado.tela === 'implantacao' ? 'implantacao' : H.estado.tela }) }).catch(() => {});
  }, 60000);

  document.addEventListener('DOMContentLoaded', async () => {
    $('#pin').addEventListener('keydown', e => { if (e.key === 'Enter') entrar(e.target.value); });
    $('#pinOk').onclick = () => entrar($('#pin').value);
    $('#sair').onclick = async () => { if (sujo()) { clearTimeout(tSalvar); await enviar(); } sair(); };
    $('#bell').onclick = () => ir(H.perfil().externo ? 'fiscal' : H.perfil().id === 'rh' ? 'rh' : 'torre');
    $('#busca').addEventListener('keydown', e => { if (e.key === 'Enter') { H.estado = { tela: 'ops', param: null }; H.buscaGlobal = e.target.value; render(); } });
    try {
      const s = JSON.parse(sessionStorage.getItem('wg_hub_sessao') || 'null');
      if (s && s.k) { H.token = s.token; H.userKey = s.k; await iniciar(); return; }
    } catch (e) { /* sessão velha: volta ao login */ }
    telaLogin();
  });
})();
