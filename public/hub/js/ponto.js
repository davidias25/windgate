/* Hub 2.0 — Ponto.
   O colaborador vê só o botão e a confirmação do horário. A listagem, os mapas
   e os relatórios são da diretoria e do RH, e quem garante isso é o servidor:
   as rotas de consulta devolvem 403 para qualquer outro. A tela não guarda
   registro nenhum no banco — tudo que ela mostra veio de uma resposta
   autorizada na hora. A hora que vale é a do servidor, não a do aparelho. */
(function () {
  const H = window.HUB, W = H.W, esc = H.esc;
  const st = { estado: null, carregadoEm: 0, carregando: false, erro: '', msg: '', ocupado: false,
    rel: null, relCarregando: false, relErro: '', de: null, ate: null, quem: '' };

  const semSessao = () => !H.token;
  const dataBR = iso => String(iso || '').split('-').reverse().join('/');
  const mapa = (lat, lon) => `https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lon)}`;

  async function carregarEstado() {
    if (st.carregando) return;
    st.carregando = true;
    try {
      const r = await H.api('/api/ponto/meu-estado');
      if (!r.ok) throw new Error('estado indisponível');
      st.estado = await r.json(); st.erro = ''; st.carregadoEm = Date.now();
    } catch (e) { if (e.message === '401') return; st.erro = 'servidor'; }
    finally { st.carregando = false; }
    if (H.estado.tela === 'ponto') H.render();
  }

  H.telas.ponto = function (el) {
    const head = `<div class="head"><div><h1>Ponto</h1><p class="sub">Registro de presença. A localização é pedida só no momento do clique — não há rastreamento contínuo.</p></div></div>`;
    if (semSessao()) {
      el.innerHTML = head + '<div class="banner">O ponto só registra com o login do servidor ligado (a identidade vem da sessão, não do navegador). Hoje o servidor está sem autenticação — avise o Davi.</div>';
      return;
    }
    // Estado do botão: busca na primeira vez e depois de 30 s; entre uma e outra usa o que já veio.
    // Sem estado e com erro: não tenta sozinho de novo (viraria laço de requisições) — espera o clique.
    if (!st.estado) {
      if (st.erro) { el.innerHTML = head + erroServidor(); el.querySelector('#pDeNovoSrv').onclick = () => { st.erro = ''; H.render(); }; return; }
      el.innerHTML = head + '<p class="empty">Consultando o servidor…</p>'; carregarEstado(); return;
    }
    if (Date.now() - st.carregadoEm > 30000) carregarEstado();
    const e = st.estado;
    if (!e.cienciaEm) { el.innerHTML = head + cienciaHtml(); ligarCiencia(el); return; }

    const prox = W.proximoPonto(e.ultimoTipo);
    const dataLonga = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const podeRel = W.podeRelatorioPonto(H.db, H.userKey, e.ehDiretoria);
    el.innerHTML = head + `
      <div class="box" style="max-width:520px;margin:0 auto"><div class="box-b" style="text-align:center">
        <div class="note">${esc(dataLonga)}</div>
        <h2 style="margin:6px 0 2px">${esc((H.user && H.user.nome) || H.userKey)}</h2>
        <div id="pRelogio" class="mono" style="font-size:40px;font-weight:700;letter-spacing:.02em;color:var(--blue)">--:--</div>
        <p class="note" style="margin-bottom:14px">${e.ultimaHora
          ? `Último registro de hoje: <b>${esc(W.rotuloPonto(e.ultimoTipo))}</b> às <b>${esc(e.ultimaHora)}</b>`
          : 'Nenhum registro hoje.'}</p>
        <button id="pBtn" class="btn pri" style="width:100%;padding:16px;font-size:16px;font-weight:700;background:${prox.c};border-color:${prox.c};color:#fff" data-tipo="${esc(prox.k)}">${esc(prox.l)}</button>
        <div id="pMsg" style="margin-top:12px;text-align:left">${st.msg}</div>
        <div class="btns" style="justify-content:center;margin-top:14px">
          <button class="btn ghost sm" data-tipo="outro">outro registro</button>
          <button class="btn ghost sm" id="pAjuste" title="Correção com justificativa: registros não se editam nem se apagam">ajuste com justificativa</button></div>
        <p class="note" style="margin-top:14px">A localização é pedida só no momento do clique. Não há rastreamento contínuo.
          ${e.ehDiretoria ? '' : 'Os registros são acessados somente pela diretoria.'}</p>
      </div></div>
      ${podeRel ? `<div class="btns" style="max-width:1100px;margin:18px auto 0">
          <button class="btn" id="pVer">${st.rel ? 'Atualizar registros' : 'Ver registros da equipe'}</button>
          ${e.ehDiretoria ? '<button class="btn" id="pCfg">Escritório e raio</button>' : ''}</div>
        <div style="max-width:1100px;margin:12px auto 0" id="pRel">${relatorioHtml(e.ehDiretoria)}</div>` : ''}`;

    relogio();
    el.querySelectorAll('[data-tipo]').forEach(b => b.onclick = () => registrar(b.dataset.tipo));
    el.querySelector('#pAjuste').onclick = ajusteModal;
    const v = el.querySelector('#pVer'); if (v) v.onclick = () => abrirRelatorio();
    const c = el.querySelector('#pCfg'); if (c) c.onclick = () => H.pontoConfigModal();
    ligarRelatorio(el);
  };

  const erroServidor = () => '<div class="banner">Não consegui falar com o servidor. O ponto só registra com o servidor no ar — a hora é dele, não do aparelho. <button class="btn sm" id="pDeNovoSrv">Tentar de novo</button></div>';

  /* O relógio é do aparelho e serve só para a pessoa se situar. */
  let tRelogio = null;
  function relogio() {
    const t = () => {
      const el = document.getElementById('pRelogio');
      if (!el) { clearInterval(tRelogio); tRelogio = null; return; }
      const d = new Date(); el.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    };
    t(); clearInterval(tRelogio); tRelogio = setInterval(t, 20000);
  }

  /* ---------- aviso de privacidade (uma vez por pessoa) ---------- */
  function cienciaHtml() {
    return `<div class="box" style="max-width:560px;margin:0 auto"><div class="box-h"><h2>Antes de começar</h2></div><div class="box-b">
      <p style="line-height:1.7;margin-bottom:12px">A WindGate registra sua localização apenas no momento em que você bate o ponto, para controle de jornada. Os dados são acessados somente pela diretoria.</p>
      <label style="display:flex;gap:8px;align-items:center;margin-bottom:12px"><input type="checkbox" id="pCiente" style="width:auto"> <span>Li e estou ciente</span></label>
      <button class="btn pri" id="pCont" style="width:100%">Continuar</button></div></div>`;
  }
  function ligarCiencia(el) {
    el.querySelector('#pCont').onclick = async () => {
      if (!el.querySelector('#pCiente').checked) { H.toast('Marque "Li e estou ciente" para continuar'); return; }
      try {
        const r = await H.api('/api/ponto/ciencia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        if (!r.ok) throw new Error();
        H.toast('Ciência registrada'); st.estado = null; H.render();
      } catch (e) { if (e.message !== '401') H.toast('Não consegui registrar a ciência — tente de novo'); }
    };
  }

  /* ---------- bater o ponto ---------- */
  /* Pede a posição UMA vez, no clique, com teto de espera. */
  function posicao() {
    return new Promise(resolve => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({ erro: 'Este navegador não oferece localização' });
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, precisao: p.coords.accuracy }),
        e => resolve({ erro: e.code === 1 ? 'Permissão de localização negada' : e.code === 3 ? 'Tempo esgotado ao buscar o GPS' : 'Falha ao obter a localização' }),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
    });
  }
  H.pontoPosicao = posicao;

  const setMsg = html => { st.msg = html; const m = document.getElementById('pMsg'); if (m) m.innerHTML = html; };

  async function registrar(tipo, justificativa) {
    if (st.ocupado) return;
    st.ocupado = true;
    const btn = document.getElementById('pBtn'), rotulo = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Obtendo localização…'; }
    setMsg('');
    const pos = await posicao();
    /* Sem localização o ponto NÃO é gravado em silêncio: a pessoa escolhe, e se
       seguir, o registro nasce marcado para a diretoria. */
    if (pos.erro) {
      if (btn) { btn.disabled = false; btn.textContent = rotulo; }
      st.ocupado = false;
      setMsg(`<div class="banner"><b>${esc(pos.erro)}.</b> O ponto não foi registrado.
        <div class="note" style="margin-top:6px">Libere a localização nas permissões do navegador e tente de novo — ou registre sem localização: o registro fica marcado e a diretoria vê a marcação.</div>
        <div class="btns" style="margin-top:10px"><button class="btn pri sm" id="pDeNovo">Tentar de novo</button><button class="btn ghost sm" id="pSemLocal">Registrar sem localização</button></div></div>`);
      const a = document.getElementById('pDeNovo'), b = document.getElementById('pSemLocal');
      if (a) a.onclick = () => registrar(tipo, justificativa);
      if (b) b.onclick = () => enviar(tipo, null, pos.erro, justificativa);
      return;
    }
    if (btn) btn.textContent = 'Registrando…';
    await enviar(tipo, pos, '', justificativa);
  }

  async function enviar(tipo, pos, motivo, justificativa) {
    st.ocupado = true;
    try {
      const corpo = pos ? { tipo, lat: pos.lat, lon: pos.lon, precisao: pos.precisao } : { tipo, motivoSemLocal: motivo || 'Sem localização' };
      if (justificativa) corpo.justificativa = justificativa;
      const r = await H.api('/api/ponto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 409) { setMsg(`<div class="banner">${esc(j.message || 'Registro repetido')}</div>`); return; }
      if (!r.ok) throw new Error(j.message || 'Falha ao registrar');
      setMsg(`<div class="banner ok"><b>Ponto registrado às ${esc(j.hora)}</b> — ${esc(W.rotuloPonto(j.tipo))}
        ${j.semLocalizacao ? '<div class="note" style="margin-top:4px">Registrado <b>sem localização</b> — a diretoria vê essa marcação.</div>' : ''}</div>`);
      st.estado = null;          // o próximo desenho busca o estado novo (e mantém a confirmação)
    } catch (e) {
      if (e.message === '401') return;
      setMsg(`<div class="banner" style="background:var(--crit-soft)">${esc(e.message || 'Erro ao registrar')} — o ponto NÃO foi gravado.</div>`);
    } finally {
      st.ocupado = false;
      if (H.estado.tela === 'ponto') H.render();
    }
  }

  /* Correção entra como Ajuste, com justificativa e autor (quem está logado). */
  function ajusteModal() {
    const m = H.modal('Ajuste de ponto', `<p class="note" style="margin-bottom:10px">Registros não são editados nem apagados. Se esqueceu de bater ou bateu errado, registre um ajuste explicando o que aconteceu (ex.: "entrada às 8h, esqueci de bater"). A diretoria vê o ajuste com a sua justificativa.</p>
      <div class="fields"><div class="f w4"><label class="lbl" for="pjust">Justificativa</label><textarea id="pjust" rows="3" maxlength="500"></textarea></div></div>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="pjok">Registrar ajuste</button>');
    m.querySelector('#pjok').onclick = () => {
      const j = m.querySelector('#pjust').value.trim();
      if (!j) { H.toast('Ajuste exige justificativa'); return; }
      H.fecharModal(); registrar('ajuste', j);
    };
  }

  /* ---------- visão da diretoria e do RH ---------- */
  async function abrirRelatorio() {
    if (!st.de) Object.assign(st, W.periodoPonto(W.hojeISO()));
    st.relCarregando = true; st.relErro = ''; H.render();
    const q = `de=${encodeURIComponent(st.de)}&ate=${encodeURIComponent(st.ate)}${st.quem ? '&usuario=' + encodeURIComponent(st.quem) : ''}`;
    try {
      const [r1, r2] = await Promise.all([H.api('/api/ponto?' + q), H.api('/api/ponto/resumo?' + q)]);
      if (r1.status === 403 || r2.status === 403) { st.rel = null; st.relErro = 'Acesso restrito à diretoria e ao RH.'; }
      else {
        if (!r1.ok || !r2.ok) throw new Error();
        const j1 = await r1.json(), j2 = await r2.json();
        st.rel = { regs: j1.registros || [], cfg: j1.config || {}, dias: j2.dias || [] };
      }
    } catch (e) { if (e.message === '401') return; st.relErro = 'Não consegui carregar os registros.'; }
    st.relCarregando = false;
    if (H.estado.tela === 'ponto') H.render();
  }
  H.pontoAbrirRelatorio = abrirRelatorio;

  function relatorioHtml(ehDiretoria) {
    if (st.relCarregando) return '<p class="empty">Carregando…</p>';
    if (st.relErro) return `<div class="banner">${esc(st.relErro)}</div>`;
    if (!st.rel) return '';
    const { regs, dias, cfg } = st.rel, nome = k => ((H.db.users || {})[k] || {}).nome || k;
    const cerca = W.temCerca(cfg);
    const faixa = cerca
      ? `<p class="note" style="margin-bottom:10px">Escritório: <b>${esc(cfg.rotulo || 'Escritório')}</b> · raio de <b>${esc(String(cfg.raio))} m</b> · <a href="${mapa(cfg.lat, cfg.lon)}" target="_blank" rel="noopener">ver no mapa</a>${ehDiretoria ? ' · <a href="#" data-cfg>alterar</a>' : ''}</p>`
      : `<div class="banner" style="margin-bottom:10px">Sem local do escritório cadastrado — os registros saem sem a marcação de <b>dentro</b> ou <b>fora</b>.${ehDiretoria ? ' <button class="btn sm" data-cfg>Cadastrar agora</button>' : ''}</div>`;
    const pessoas = Object.keys(H.db.users || {});
    const linhas = regs.slice().sort((a, b) => String(b.em).localeCompare(String(a.em))).map(r => {
      const av = W.alertaPonto(r);
      return `<tr${av ? ' style="background:var(--warn-soft)"' : ''}><td class="mono">${esc(dataBR(r.data))}</td><td class="mono"><b>${esc(r.hora)}</b></td><td>${esc(nome(r.usuario))}</td>
        <td><span class="pill ${r.tipo === 'entrada' ? 'ok' : r.tipo === 'saida' ? 'crit' : r.tipo === 'ajuste' ? 'warn' : 'info'}">${esc(W.rotuloPonto(r.tipo))}</span></td>
        <td>${r.semLocalizacao ? `<span class="pill warn" title="${esc(r.motivoSemLocal || '')}">sem localização</span>` : `<a href="${mapa(r.lat, r.lon)}" target="_blank" rel="noopener">mapa</a>`}</td>
        <td>${r.dentroDoRaio === true ? '<span class="pill ok">dentro</span>' : r.dentroDoRaio === false ? '<span class="pill warn">fora</span>' : (cerca && !r.semLocalizacao ? '<span class="note">antes da cerca</span>' : '<span class="note">—</span>')}</td>
        <td class="note">${esc(r.justificativa || '')}</td></tr>`;
    }).join('');
    const resumo = dias.map(d => `<tr${d.incompleto ? ' style="background:var(--warn-soft)"' : ''}><td class="mono">${esc(dataBR(d.data))}</td><td>${esc(nome(d.usuario))}</td>
        <td class="mono">${esc(d.primeira || '—')}</td><td class="mono">${esc(d.ultima || '—')}</td><td class="num"><b>${W.horasBR(d.horas)}</b></td>
        <td>${d.incompleto ? '<span class="pill warn">incompleto</span> ' : ''}${d.semLocalizacao ? `<span class="pill warn">${d.semLocalizacao} sem local.</span> ` : ''}${d.fora ? `<span class="pill crit">${d.fora} fora</span>` : ''}</td></tr>`).join('');
    return `<div class="box"><div class="box-h"><h2>Resumo por dia</h2>
        <div class="btns"><input type="date" class="inp" id="pDe" value="${esc(st.de)}" aria-label="De"><input type="date" class="inp" id="pAte" value="${esc(st.ate)}" aria-label="Até">
          <select class="inp" id="pQuem" aria-label="Colaborador"><option value="">Todos</option>${pessoas.map(k => `<option value="${esc(k)}" ${k === st.quem ? 'selected' : ''}>${esc(nome(k))}</option>`).join('')}</select>
          <button class="btn sm" id="pFiltrar">Filtrar</button><button class="btn sm" id="pCsv">Exportar CSV</button></div></div>
        <div class="box-b">${faixa}</div>
        <div class="tw"><table><thead><tr><th>Data</th><th>Colaborador</th><th>1ª entrada</th><th>Última saída</th><th class="num">Horas</th><th>Atenção</th></tr></thead>
        <tbody>${resumo || '<tr><td colspan="6" class="note">Nenhum registro no período.</td></tr>'}</tbody></table></div></div>
      <div class="box"><div class="box-h"><h2>Registros</h2><span class="note">${regs.length} no período</span></div>
        <div class="tw" style="max-height:50vh;overflow:auto"><table><thead><tr><th>Data</th><th>Hora</th><th>Colaborador</th><th>Tipo</th><th>Local</th><th>No escritório</th><th>Justificativa</th></tr></thead>
        <tbody>${linhas || '<tr><td colspan="7" class="note">Nenhum registro.</td></tr>'}</tbody></table></div>
        <div class="box-b"><p class="note">Registros não são editados nem apagados. Correção entra como <b>Ajuste</b>, com justificativa e autor. A precisão do GPS, o IP e o aparelho ficam no CSV, para auditoria.</p></div></div>`;
  }

  function ligarRelatorio(el) {
    el.querySelectorAll('[data-cfg]').forEach(b => b.onclick = ev => { ev.preventDefault(); H.pontoConfigModal(); });
    const f = el.querySelector('#pFiltrar');
    if (f) f.onclick = () => {
      const de = el.querySelector('#pDe').value, ate = el.querySelector('#pAte').value;
      if (!de || !ate || de > ate) { H.toast('Período inválido'); return; }
      st.de = de; st.ate = ate; st.quem = el.querySelector('#pQuem').value; abrirRelatorio();
    };
    const c = el.querySelector('#pCsv'); if (c) c.onclick = exportar;
  }

  /* O CSV sai por rota protegida: o download leva o token, então vem como blob. */
  async function exportar() {
    const q = `de=${encodeURIComponent(st.de)}&ate=${encodeURIComponent(st.ate)}${st.quem ? '&usuario=' + encodeURIComponent(st.quem) : ''}`;
    try {
      const r = await H.api('/api/ponto/export.csv?' + q);
      if (r.status === 403) { H.toast('Acesso restrito à diretoria e ao RH'); return; }
      if (!r.ok) throw new Error();
      const blob = await r.blob(), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `ponto_${st.de}_${st.ate}${st.quem ? '_' + st.quem : ''}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      H.toast('CSV exportado');
    } catch (e) { if (e.message !== '401') H.toast('Falha ao exportar'); }
  }

  /* ---------- escritório e raio (só a diretoria grava) ---------- */
  /* Busca a configuração atual antes de desenhar: modal em branco fazia achar que nada tinha sido salvo. */
  H.pontoConfigModal = async function () {
    if (semSessao()) { H.toast('O ponto precisa do login do servidor ligado.'); return; }
    let cfg = {};
    try {
      const r = await H.api('/api/ponto?de=9999-12-31');
      if (r.status === 403) { H.toast('Acesso restrito à diretoria'); return; }
      if (r.ok) cfg = (await r.json()).config || {};
    } catch (e) { if (e.message === '401') return; H.toast('Não consegui ler a configuração atual'); }
    const tem = W.temCerca(cfg);
    const m = H.modal('Escritório e raio do ponto', `
      <p class="note" style="margin-bottom:10px">Com o local cadastrado, cada ponto batido passa a sair marcado como <b>dentro</b> ou <b>fora</b> do escritório, com a distância em metros. É sinalização — não impede ninguém de bater o ponto de onde estiver.</p>
      ${tem ? `<div class="banner ok" style="margin-bottom:12px"><b>Configurado:</b> ${esc(cfg.rotulo || 'Escritório')} — raio de <b>${esc(String(cfg.raio || 150))} m</b>
          <div class="note" style="margin-top:4px">${cfg.lat.toFixed(6)}, ${cfg.lon.toFixed(6)} · <a href="${mapa(cfg.lat, cfg.lon)}" target="_blank" rel="noopener">ver no mapa</a></div></div>`
        : '<div class="banner" style="margin-bottom:12px">Ainda não há local cadastrado — por isso os registros saem sem a marcação de dentro/fora.</div>'}
      <div class="fields">
        <div class="f"><label class="lbl" for="ptLat">Latitude</label><input id="ptLat" type="number" step="0.000001" value="${tem ? cfg.lat : ''}" placeholder="-3.768320"></div>
        <div class="f"><label class="lbl" for="ptLon">Longitude</label><input id="ptLon" type="number" step="0.000001" value="${tem ? cfg.lon : ''}" placeholder="-38.486016"></div>
        <div class="f"><label class="lbl" for="ptRaio">Raio (metros)</label><input id="ptRaio" type="number" min="10" step="10" value="${esc(String(cfg.raio || 150))}"></div>
        <div class="f w4"><label class="lbl" for="ptRot">Nome do local</label><input id="ptRot" value="${esc(cfg.rotulo || '')}" placeholder="Escritório Fortaleza"></div></div>
      <div class="btns" style="margin-top:10px"><button class="btn sm" id="ptMinha">Usar minha localização atual</button><span id="ptSt" class="note"></span></div>
      <p class="note" style="margin-top:8px">Ou copie do Google Maps: botão direito no ponto do mapa e clique nos números que aparecem.<br>A marcação vale para os pontos batidos <b>a partir de agora</b> — os anteriores ficam como estão, porque registro de ponto não se reescreve.</p>`,
      '<button class="btn" data-x>Cancelar</button><button class="btn blue" id="ptOk">Salvar</button>');
    m.querySelector('#ptMinha').onclick = async () => {
      const s = m.querySelector('#ptSt'); s.textContent = 'Obtendo localização…';
      const p = await posicao();
      if (p.erro) { s.textContent = p.erro; return; }
      m.querySelector('#ptLat').value = p.lat.toFixed(6); m.querySelector('#ptLon').value = p.lon.toFixed(6);
      s.textContent = `Posição obtida (±${Math.round(p.precisao)} m)`;
    };
    m.querySelector('#ptOk').onclick = async () => {
      const v = W.validarCerca({ lat: m.querySelector('#ptLat').value, lon: m.querySelector('#ptLon').value, raio: m.querySelector('#ptRaio').value, rotulo: m.querySelector('#ptRot').value });
      if (!v.ok) { H.toast(esc(v.erro)); return; }
      try {
        const r = await H.api('/api/ponto/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v.corpo) });
        if (r.status === 403) { H.toast('Acesso restrito à diretoria'); return; }
        if (!r.ok) throw new Error();
        const j = await r.json();
        H.fecharModal();
        H.toast(`<b>${esc(j.config.rotulo || 'Escritório')}</b> salvo — raio de ${esc(String(j.config.raio))} m`);
        // Abre o relatório para a marcação aparecer na hora.
        if (H.estado.tela === 'ponto') abrirRelatorio();
      } catch (e) { if (e.message !== '401') H.toast('Falha ao salvar'); }
    };
  };
})();
