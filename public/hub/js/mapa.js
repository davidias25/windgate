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
    [/vit[oó]ria/i, 'Vitória', -20.32, -40.29], [/santos/i, 'Santos', -23.96, -46.33]
  ];
  const porto = txt => { const p = PORTOS.find(x => x[0].test(String(txt || ''))); return p ? { nome: p[1], ll: [p[2], p[3]] } : null; };
  /* Rota marítima simplificada Ásia → Brasil (via Singapura e Cabo da Boa Esperança). */
  const VIA = [[1.25, 103.8], [-6, 80], [-34.6, 18.5], [-20, -15]];

  function posicaoEstimada(o, hoje) {
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
    const ops = db.ops.filter(o => o && W.ativa(o) && !['cotacao', 'contrato'].includes(o.status));
    const pos = ops.map(o => ({ o, p: posicaoEstimada(o, hoje) }));
    el.innerHTML = `
      <div class="head"><div><h1>Mapa & Tracking</h1><p class="sub">Onde está cada operação agora. Posição estimada pelo embarque e ETA até o tracking automático por contêiner entrar.</p></div></div>
      <div class="box box-b"><div id="mapa" role="img" aria-label="Mapa com a posição das operações"></div>
        <p class="note" style="margin-top:8px">● magenta: no mar · ● azul: na fábrica ou no destino · operações no mesmo navio aparecem juntas.</p></div>
      <div class="box"><div class="box-h"><h2>Situação por operação</h2><span class="note">${ops.length} operação(ões) em andamento</span></div>
        <div class="tw"><table><thead><tr><th>Operação</th><th>Etapa</th><th>Rota</th><th>Navio</th><th>Embarque</th><th>ETA</th><th class="num">Chega em</th><th class="num">Viagem</th><th>Tracking</th></tr></thead><tbody>
        ${pos.map(({ o, p }) => { const d = W.diasEntre(hoje, o.eta);
          return `<tr class="click" data-op="${esc(o.id)}"><td class="mono"><b>${esc(o.id)}</b><br><small class="note">${esc(o.cliente || '')}</small></td><td>${H.pillStatus(o.status)}</td>
          <td>${esc((p && p.ori && p.ori.nome) || o.origemPorto || '?')} → ${esc((p && p.dst && p.dst.nome) || o.destinoPorto || '?')}</td><td>${esc(o.navio || '—')}</td>
          <td class="mono">${W.dataBR(o.embarque)}</td><td class="mono">${W.dataBR(o.eta)}</td><td class="num">${d == null ? '—' : d < 0 ? 'chegou' : d + ' dias'}</td>
          <td class="num">${p && p.frac != null ? Math.round(p.frac * 100) + '%' : '—'}</td>
          <td>${o.tracking ? `<a href="${esc(o.tracking)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">armador ↗</a>` : '<span class="note">—</span>'}</td></tr>`; }).join('') || '<tr><td colspan="9" class="empty">Nenhuma operação em produção ou trânsito.</td></tr>'}
        </tbody></table></div></div>`;
    el.querySelectorAll('[data-op]').forEach(x => x.onclick = () => H.ir('ficha', x.dataset.op));

    if (typeof L === 'undefined') { el.querySelector('#mapa').innerHTML = '<p class="empty">Mapa indisponível sem internet.</p>'; return; }
    if (mapa) { mapa.remove(); mapa = null; }
    mapa = L.map(el.querySelector('#mapa'), { worldCopyJump: true, scrollWheelZoom: false }).setView([5, 40], 2);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 10 }).addTo(mapa);
    const grupos = {};
    pos.forEach(({ o, p }) => { if (!p) return; const k = (o.navio || o.id) + '|' + p.ll.map(x => x.toFixed(1)).join(','); (grupos[k] = grupos[k] || { p, ops: [] }).ops.push(o); });
    const limites = [];
    Object.values(grupos).forEach(({ p, ops }) => {
      const mar = p.frac != null;
      if (mar) L.polyline(p.pts, { color: '#0046AD', weight: 1.5, dashArray: '5 5', opacity: .6 }).addTo(mapa);
      L.circleMarker(p.ll, { radius: mar ? 8 : 6, color: '#fff', weight: 2, fillColor: mar ? '#CE0058' : '#0046AD', fillOpacity: 1 }).addTo(mapa)
        .bindTooltip(`<span class="map-lbl">${ops.map(o => esc(o.id)).join(' · ')}</span>`, { permanent: true, direction: 'right', className: 'map-tip', opacity: 1, offset: [8, 0] })
        .on('click', () => H.ir('ficha', ops[0].id));
      limites.push(p.ll);
    });
    if (limites.length) mapa.fitBounds(L.latLngBounds(limites).pad(0.6), { maxZoom: 4 });
  };

  /* Documentos (GED) ficam em docs.js. */
})();
