/* Hub 2.0 — Mapa & Tracking e Documentos. */
(function () {
  const H = window.HUB, W = H.W, esc = H.esc;

  /* Portos usados pela WindGate (lat, lon). Nome do campo é livre: casa por palavra. */
  const PORTOS = [
    [/qingdao/i, 'Qingdao', 36.07, 120.32], [/shanghai|xangai/i, 'Shanghai', 31.23, 121.47], [/ningbo/i, 'Ningbo', 29.87, 121.55],
    [/shantou/i, 'Shantou', 23.35, 116.68], [/tianjin|xingang/i, 'Tianjin', 39.0, 117.72], [/shenzhen|yantian|shekou/i, 'Shenzhen', 22.57, 114.27],
    [/guangzhou|nansha/i, 'Guangzhou', 22.75, 113.62], [/xiamen/i, 'Xiamen', 24.48, 118.08], [/dalian/i, 'Dalian', 38.92, 121.64],
    [/hamburg/i, 'Hamburgo', 53.54, 9.98], [/ho chi|vietn|hai ?phong/i, 'Vietnã', 10.77, 106.7], [/colombo|sri/i, 'Colombo', 6.95, 79.84],
    [/pec[eé]m/i, 'Pecém', -3.54, -38.81], [/mucuripe|fortaleza/i, 'Mucuripe', -3.71, -38.47], [/suape/i, 'Suape', -8.39, -34.96],
    [/vit[oó]ria/i, 'Vitória', -20.32, -40.29], [/santos/i, 'Santos', -23.96, -46.33],
    /* Os demais do sistema antigo (GEO), para a operação não sumir só por estar neles. */
    [/busan/i, 'Busan', 35.1, 129.04], [/miami/i, 'Miami', 25.76, -80.19], [/mariel/i, 'Mariel', 23.0, -82.75],
    [/itaja[ií]/i, 'Itajaí', -26.9, -48.66], [/navegantes/i, 'Navegantes', -26.9, -48.65], [/paranagu[aá]/i, 'Paranaguá', -25.5, -48.52], [/salvador/i, 'Salvador', -12.97, -38.5],
    [/cangzhou/i, 'Cangzhou', 38.3, 116.85], [/tangshan/i, 'Tangshan', 39.63, 118.18], [/changsha/i, 'Changsha', 28.23, 112.94], [/xuzhou/i, 'Xuzhou', 34.26, 117.19],
    [/lianyungang/i, 'Lianyungang', 34.74, 119.45], [/yantai/i, 'Yantai', 37.54, 121.39], [/rizhao/i, 'Rizhao', 35.38, 119.55], [/zhangjiagang/i, 'Zhangjiagang', 31.97, 120.43], [/taicang/i, 'Taicang', 31.65, 121.1], [/nanjing/i, 'Nanjing', 32.06, 118.8],
    [/fuzhou/i, 'Fuzhou', 26.05, 119.3], [/weihai/i, 'Weihai', 37.5, 122.12], [/yingkou/i, 'Yingkou', 40.67, 122.23], [/hong ?kong/i, 'Hong Kong', 22.3, 114.17], [/kaohsiung/i, 'Kaohsiung', 22.62, 120.3], [/haikou/i, 'Haikou', 20.02, 110.35],
    [/yongkang/i, 'Yongkang', 28.9, 120.04], [/yiwu/i, 'Yiwu', 29.31, 120.07], [/hangzhou/i, 'Hangzhou', 30.27, 120.15], [/foshan/i, 'Foshan', 23.02, 113.12]
  ];
  /* Porto criado pela equipe (db.portos) vale primeiro, se tiver coordenadas. */
  const porto = txt => {
    const nome = String(txt || '').trim(), minusc = nome.toLowerCase(), portos = H.db.portos || {};
    const chave = nome && Object.keys(portos).find(k => k.toLowerCase() === minusc), meu = chave && portos[chave];
    if (Array.isArray(meu) && meu.length === 2 && isFinite(+meu[0]) && isFinite(+meu[1])) return { nome: chave, ll: [+meu[0], +meu[1]] };
    const p = PORTOS.find(x => x[0].test(nome)); return p ? { nome: p[1], ll: [p[2], p[3]] } : null;
  };
  /* Rota marítima simplificada Ásia → Brasil (via Singapura e Cabo da Boa Esperança). */
  const VIA = [[1.25, 103.8], [-6, 80], [-34.6, 18.5], [-20, -15]];

  /* Um mundo só: toda longitude entre −180 e 180, e a rota que cruza a borda vira dois trechos,
     senão ela riscaria o mapa inteiro na horizontal. */
  const lngNoMundo = lng => ((((+lng + 180) % 360) + 360) % 360) - 180;
  const noMundo = ll => [ll[0], lngNoMundo(ll[1])];
  function trechosDaRota(pts) {
    const out = []; let atual = [];
    (pts || []).map(noMundo).forEach(p => {
      if (atual.length && Math.abs(p[1] - atual[atual.length - 1][1]) > 180) { out.push(atual); atual = []; }
      atual.push(p);
    });
    if (atual.length) out.push(atual);
    return out.filter(t => t.length > 1);
  }
  H.mapaGeo = { lngNoMundo, trechosDaRota };

  /* Posição real da ShipsGo: o servidor consulta, o navegador nunca vê o token. */
  let track = null, buscandoTrack = false;
  const CINCO_MIN = 5 * 60 * 1000;
  function carregarTrack() {
    if (buscandoTrack || (track && Date.now() - track.t < CINCO_MIN)) return;
    buscandoTrack = true;
    H.api('/api/tracking/mapa').then(r => r.json()).then(j => {
      track = { t: Date.now(), posicoes: (j && j.posicoes) || {}, erro: (j && j.erro) || '', semIntegracao: !!(j && j.semIntegracao) };
      if (H.estado.tela === 'mapa') H.render();
    }).catch(() => { track = { t: Date.now(), posicoes: {}, erro: 'Não consegui consultar a ShipsGo agora.' }; if (H.estado.tela === 'mapa') H.render(); }).finally(() => { buscandoTrack = false; });
  }
  const realDe = o => (track && track.posicoes[o.id]) || null;
  function posicaoEstimada(o, hoje) {
    const r = realDe(o);
    if (r && r.pos) return { real: true, tipo: r.pos.tipo, ll: noMundo([r.pos.lat, r.pos.lng]), pts: r.rota || [], frac: r.pct != null ? r.pct / 100 : null, ori: { nome: r.origem }, dst: { nome: r.destino }, navio: r.pos.navio, porto: r.pos.porto, status: r.status };
    const ori = porto(o.origemPorto) || porto(o.fabricaCidade), dst = porto(o.destinoPorto) || porto('Pecém');
    if (!ori || !dst) return null;
    const pts = [ori.ll].concat(ori.ll[1] > 60 ? VIA : [[0, -20]]).concat([dst.ll]);
    if (!['embarcado', 'chegada'].includes(o.status) || !W.ehISO(o.embarque) || !W.ehISO(o.eta)) {
      const ll = ['chegada', 'logistica', 'documentacao'].includes(o.status) ? dst.ll : ori.ll;
      return { ll, pts, frac: null, ori, dst };
    }
    const tot = W.diasEntre(o.embarque, o.eta), dec = W.diasEntre(o.embarque, hoje);
    const frac = Math.max(0, Math.min(1, tot > 0 ? dec / tot : 1));
    const seg = []; let L = 0;
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); L += d; }
    let alvo = frac * L, i = 0;
    while (i < seg.length - 1 && alvo > seg[i]) { alvo -= seg[i]; i++; }
    const t = seg[i] ? alvo / seg[i] : 1, a = pts[i], b = pts[i + 1];
    return { ll: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], pts, frac, ori, dst };
  }

  let mapa = null;
  H.telas.mapa = function (el) {
    const db = H.db, hoje = W.hojeISO();
    carregarTrack();
    // Com posição real, entra mesmo se a etapa cadastrada ainda estiver atrás.
    const ops = db.ops.filter(o => o && W.ativa(o) && (!['cotacao', 'contrato'].includes(o.status) || (realDe(o) && realDe(o).pos)));
    const pos = ops.map(o => ({ o, p: posicaoEstimada(o, hoje) }));
    const fora = pos.filter(x => !x.p).map(x => x.o);
    /* Quem tem texto no campo não está "sem porto": o nome é que não foi reconhecido, e dá para cadastrar. */
    const semPorto = fora.filter(o => !String(o.origemPorto || o.fabricaCidade || '').trim());
    const naoReconhecido = fora.filter(o => String(o.origemPorto || o.fabricaCidade || '').trim());
    el.innerHTML = `
      <div class="head"><div><h1>Mapa & Tracking</h1><p class="sub">Onde está cada operação agora. Com o contêiner ou o link na ShipsGo, a posição é a real; nas demais, é estimada pelo embarque e ETA.</p></div></div>
      ${track && track.erro ? `<div class="banner crit" style="margin-bottom:12px"><b>ShipsGo:</b> ${esc(track.erro)} O mapa mostra a posição estimada.</div>` : ''}
      ${track && track.semIntegracao ? '<div class="banner" style="margin-bottom:12px">A chave da ShipsGo não está configurada no servidor: o mapa mostra só a posição estimada.</div>' : ''}
      ${semPorto.length ? `<div class="banner" style="margin-bottom:12px"><b>${semPorto.length} operação(ões) fora do mapa, sem porto de origem:</b> informe o porto ou a cidade da fábrica na aba Resumo: ${semPorto.map(o => `<a href="#" data-op="${esc(o.id)}">${esc(o.id)}</a>`).join(', ')}.</div>` : ''}
      ${naoReconhecido.map(o => `<div class="banner" style="margin-bottom:12px"><b><a href="#" data-op="${esc(o.id)}">${esc(o.id)}</a> fora do mapa:</b> o mapa não conhece "${esc(o.origemPorto || o.fabricaCidade)}". Confira a grafia na aba Resumo ou <button class="btn sm" data-cadporto="${esc(o.origemPorto || o.fabricaCidade)}">cadastre as coordenadas</button></div>`).join('')}
      <div class="box box-b"><div id="mapa" role="img" aria-label="Mapa com a posição das operações"></div>
        <p class="note" style="margin-top:8px"><b style="color:#0F8A5F">●</b> verde: posição real da ShipsGo · <b style="color:#CE0058">●</b> magenta: estimada, no mar · <b style="color:#0046AD">●</b> azul: estimada, na fábrica ou no destino · operações no mesmo ponto aparecem juntas.</p></div>
      <div class="box"><div class="box-h"><h2>Situação por operação</h2><span class="note">${ops.length} operação(ões) em andamento</span></div>
        <div class="tw"><table><thead><tr><th>Operação</th><th>Etapa</th><th>Rota</th><th>Navio</th><th>Embarque</th><th>ETA</th><th class="num">Chega em</th><th class="num">Viagem</th><th>Tracking</th></tr></thead><tbody>
        ${pos.map(({ o, p }) => { const d = W.diasEntre(hoje, o.eta);
          return `<tr class="click" data-op="${esc(o.id)}"><td class="mono"><b>${esc(o.id)}</b><br><small class="note">${esc(o.cliente || '')}</small></td><td>${H.pillStatus(o.status)}</td>
          <td>${esc((p && p.ori && p.ori.nome) || o.origemPorto || '?')} → ${esc((p && p.dst && p.dst.nome) || o.destinoPorto || '?')}${p ? '' : '<br><span class="pill warn">fora do mapa</span>'}</td><td>${esc((p && p.navio) || o.navio || '—')}</td>
          <td class="mono">${W.dataBR(o.embarque)}</td><td class="mono">${W.dataBR(o.eta)}</td><td class="num">${d == null ? '—' : d < 0 ? 'chegou' : d + ' dias'}</td>
          <td class="num">${p && p.frac != null ? Math.round(p.frac * 100) + '%' : '—'}</td>
          <td>${p && p.real ? `<span class="pill ok">posição real</span>${p.porto ? `<br><small class="note">em ${esc(p.porto)}</small>` : ''}` : realDe(o) && realDe(o).semRastreio ? '<span class="note">não está na ShipsGo</span>' : realDe(o) && realDe(o).id ? `<span class="note">ShipsGo sem posição ainda${realDe(o).status ? ' · ' + esc(realDe(o).status) : ''}</span>` : ''}${realDe(o) && realDe(o).link ? `<br><a href="${esc(realDe(o).link)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">ShipsGo ↗</a>` : o.tracking ? `<br><a href="${esc(o.tracking)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${/shipsgo/i.test(o.tracking) ? 'ShipsGo' : 'armador'} ↗</a>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="9" class="empty">Nenhuma operação em produção ou trânsito.</td></tr>'}
        </tbody></table></div></div>`;
    el.querySelectorAll('[data-op]').forEach(x => x.onclick = e => { e.preventDefault(); H.ir('ficha', x.dataset.op); });
    el.querySelectorAll('[data-cadporto]').forEach(b => b.onclick = () => {
      const nome = b.dataset.cadporto;
      const m = H.modal('Cadastrar porto', `<p>Coordenadas de <b>${esc(nome)}</b>, que você encontra no Google Maps.</p><div class="fields" style="margin-top:8px"><div class="f w2"><label class="lbl" for="plat">Latitude</label><input id="plat" inputmode="decimal" placeholder="34,74"></div><div class="f w2"><label class="lbl" for="plon">Longitude</label><input id="plon" inputmode="decimal" placeholder="119,45"></div></div>`,
        '<button class="btn" data-x>Cancelar</button><button class="btn pri" id="pok">Salvar</button>');
      m.querySelector('#pok').onclick = () => {
        const n = s => parseFloat(String(m.querySelector(s).value).replace(',', '.')), la = n('#plat'), lo = n('#plon');
        if (!(Math.abs(la) <= 90) || !(Math.abs(lo) <= 180)) return H.toast('Latitude de −90 a 90 e longitude de −180 a 180.');
        if (!H.db.portos) H.db.portos = {};
        H.db.portos[nome] = [la, lo]; H.salvar(); H.fecharModal(); H.toast('Porto cadastrado.'); H.render();
      };
    });

    if (typeof L === 'undefined') { el.querySelector('#mapa').innerHTML = '<p class="empty">Mapa indisponível sem internet.</p>'; return; }
    if (mapa) { mapa.remove(); mapa = null; }
    const MUNDO = [[-85, -180], [85, 180]];
    mapa = L.map(el.querySelector('#mapa'), { maxBounds: MUNDO, maxBoundsViscosity: 1, scrollWheelZoom: false }).setView([5, 40], 2);
    // O zoom mínimo é o maior em que o mundo inteiro ainda cabe na largura: as sobras nas laterais ficam da cor do mar.
    mapa.setMinZoom(Math.max(0, Math.floor(Math.log2(Math.max(256, mapa.getSize().x) / 256))));
    mapa.setZoom(mapa.getMinZoom());
    el.querySelector('#mapa').style.background = '#AAD3DF';
    // Quadros do OpenStreetMap (sem chave; a CARTO passou a exigir chave e mostrava "API KEY REQUIRED").
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>', maxZoom: 10, noWrap: true, bounds: MUNDO }).addTo(mapa);
    const grupos = {};
    // Mesmo ponto, mesmo marcador: um nome em cima do outro escondia a operação.
    pos.forEach(({ o, p }) => { if (!p) return; const k = p.ll.map(x => x.toFixed(1)).join(','); (grupos[k] = grupos[k] || { p, ops: [] }).ops.push(o); });
    const limites = [];
    Object.values(grupos).forEach(({ p, ops }) => {
      const mar = p.real ? p.tipo === 'mar' : p.frac != null;
      if (mar || p.real) trechosDaRota(p.pts).forEach(t => L.polyline(t, { color: '#0046AD', weight: 1.5, dashArray: '5 5', opacity: .6 }).addTo(mapa));
      L.circleMarker(p.ll, { radius: mar ? 8 : 6, color: '#fff', weight: 2, fillColor: p.real ? '#0F8A5F' : mar ? '#CE0058' : '#0046AD', fillOpacity: 1 }).addTo(mapa)
        .bindTooltip(`<span class="map-lbl">${ops.map(o => esc(o.id)).join(' · ')}</span>`, { permanent: true, direction: 'right', className: 'map-tip', opacity: 1, offset: [8, 0] })
        .on('click', () => H.ir('ficha', ops[0].id));
      limites.push(p.ll);
    });
    if (limites.length) mapa.fitBounds(L.latLngBounds(limites).pad(0.6), { maxZoom: 4 });
  };

  /* Documentos (GED) ficam em docs.js. */
})();
