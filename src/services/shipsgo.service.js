/**
 * ShipsGo: rastreio de contêiner. Cria o rastreio quando a operação ganha um
 * número de contêiner ou BL e recebe as atualizações por webhook (sem consultar
 * em laço). Cada evento atualiza o ETA da operação e a descarga do contêiner,
 * que liga o relógio de free time.
 *
 * Endereços configuráveis (confirmar na documentação da conta):
 *   SHIPSGO_API_URL (padrão https://api.shipsgo.com/v2), SHIPSGO_API_KEY,
 *   SHIPSGO_WEBHOOK_TOKEN (vai no fim da URL cadastrada no painel da ShipsGo).
 */
const BASE = () => (process.env.SHIPSGO_API_URL || 'https://api.shipsgo.com/v2').replace(/\/$/, '');
const configurado = () => !!process.env.SHIPSGO_API_KEY;
const CONTEINER = /\b([A-Z]{4}\d{7})\b/;

async function criarRastreio({ container, bl, ref }, fetchImpl) {
  if (!configurado()) { const e = new Error('Falta a chave SHIPSGO_API_KEY no servidor.'); e.semIntegracao = true; throw e; }
  const corpo = container ? { container_number: container, reference: ref || '' } : { booking_number: bl, reference: ref || '' };
  const r = await (fetchImpl || fetch)(BASE() + '/ocean/shipments', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Shipsgo-User-Token': process.env.SHIPSGO_API_KEY }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 409) throw new Error((j && (j.message || j.error)) || 'ShipsGo ' + r.status);
  return { id: (j.shipment && j.shipment.id) || j.id || null, jaExistia: r.status === 409 };
}

/** Número do embarque no link da ShipsGo: map.shipsgo.com/ocean/shipments/{id}?token=... */
const idDoLink = url => { const m = /ocean\/shipments\/(\d+)/i.exec(String(url || '')); return m ? m[1] : null; };

async function consultar(caminho, fetchImpl) {
  if (!configurado()) { const e = new Error('Falta a chave SHIPSGO_API_KEY no servidor.'); e.semIntegracao = true; throw e; }
  const r = await (fetchImpl || fetch)(BASE() + caminho, { headers: { accept: 'application/json', 'X-Shipsgo-User-Token': process.env.SHIPSGO_API_KEY } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(r.status === 401 || r.status === 403 ? 'A ShipsGo recusou a chave (SHIPSGO_API_KEY).' : (j && j.message) || 'ShipsGo ' + r.status); e.status = r.status; throw e; }
  return j;
}
/** Embarque já cadastrado na conta: buscar não consome crédito; criar, sim. */
async function acharEmbarque({ container, bl }, fetchImpl) {
  const filtro = container ? 'filters[container_number]=eq:' + encodeURIComponent(container) : 'filters[booking_number]=eq:' + encodeURIComponent(bl);
  const j = await consultar('/ocean/shipments?' + filtro + '&take=1', fetchImpl);
  const s = (j.shipments || [])[0];
  return s ? String(s.id) : null;
}
/* A documentação usa [lng, lat] (GeoJSON). Aqui sai sempre [lat, lng], como o mapa pede.
   LineString em CURRENT traz a posição do navio; Point em CURRENT, o porto onde a carga está. */
function posicaoDoGeojson(g) {
  const fs_ = (g && g.features) || [];
  const mar = fs_.find(f => f && f.geometry && f.geometry.type === 'LineString' && f.properties && f.properties.status === 'CURRENT' && f.properties.current && Array.isArray(f.properties.current.coordinates));
  if (mar) { const [lng, lat] = mar.properties.current.coordinates; return { lat, lng, tipo: 'mar', navio: (mar.properties.vessel && mar.properties.vessel.name) || '', viagem: mar.properties.voyage || '' }; }
  const porto = fs_.find(f => f && f.geometry && f.geometry.type === 'Point' && f.properties && f.properties.status === 'CURRENT');
  if (porto) { const [lng, lat] = porto.geometry.coordinates; return { lat, lng, tipo: 'porto', porto: (porto.properties.location && porto.properties.location.name) || '', navio: '' }; }
  return null;
}
/** Rota inteira para desenhar, com no máximo 300 pontos: é só uma linha no mapa. */
function rotaDoGeojson(g) {
  const pts = [];
  ((g && g.features) || []).forEach(f => { if (f && f.geometry && f.geometry.type === 'LineString') f.geometry.coordinates.forEach(c => pts.push([c[1], c[0]])); });
  if (pts.length <= 300) return pts;
  const passo = pts.length / 299, out = [];
  for (let i = 0; i < 299; i++) out.push(pts[Math.floor(i * passo)]);
  out.push(pts[pts.length - 1]);
  return out;
}
/* A cada aviso a posição muda pouco: 15 minutos evita repetir chamadas, com limite de 100 por minuto na conta. */
const VALIDADE = 15 * 60 * 1000;
const guardados = new Map(), embarques = new Map();
async function dadosDoEmbarque(id, fetchImpl, agora) {
  const t = agora || Date.now(), g = guardados.get(id);
  if (g && t - g.t < VALIDADE) return g.dado;
  const det = (await consultar('/ocean/shipments/' + id, fetchImpl)).shipment || {}, geo = (await consultar('/ocean/shipments/' + id + '/geojson', fetchImpl)).geojson;
  const r = det.route || {}, pol = r.port_of_loading || {}, pod = r.port_of_discharge || {};
  const dado = { id, status: det.status || '', pct: typeof r.transit_percentage === 'number' ? r.transit_percentage : null, origem: (pol.location && pol.location.name) || '', destino: (pod.location && pod.location.name) || '',
    pos: posicaoDoGeojson(geo), rota: rotaDoGeojson(geo), link: det.tokens && det.tokens.map ? `https://map.shipsgo.com/ocean/shipments/${id}?token=${det.tokens.map}` : '', eventos: eventosDoEmbarque(det) };
  guardados.set(id, { t, dado });
  return dado;
}
/** O embarque da operação: pelo link ou pelo contêiner. Só consulta, nunca cria rastreio (criar gasta crédito). */
async function embarqueDaOp(o, fetchImpl, agora) {
  const pelaLink = idDoLink(o.tracking); if (pelaLink) return pelaLink;
  const t = agora || Date.now(), alvos = (o.containers || []).map(c => c && c.numero).filter(Boolean).map(n => ({ container: n }));
  if (!alvos.length && o.bl) alvos.push({ bl: o.bl });
  for (const a of alvos) {
    const k = a.container || a.bl, g = embarques.get(k);
    if (g && t - g.t < VALIDADE) { if (g.id) return g.id; continue; }
    const id = await acharEmbarque(a, fetchImpl);
    embarques.set(k, { t, id });
    if (id) return id;
  }
  return null;
}
const limparGuardados = () => { guardados.clear(); embarques.clear(); };

/** Um evento por contêiner, no formato da API v2 (shipment.containers[].movements). */
function eventosDoEmbarque(s) {
  const b = { shipment: s }, cs = (s && Array.isArray(s.containers) && s.containers) || [];
  return cs.length ? cs.map(c => interpretarEvento(b, c)) : [interpretarEvento(b)];
}
function eventosDoPayload(b) {
  const s = (b && (b.shipment || b.data)) || b || {};
  return Array.isArray(s.containers) && s.containers.length ? eventosDoEmbarque(s) : [interpretarEvento(b)];
}
/** Lê um evento da ShipsGo em qualquer dos formatos (v1/v2) e tira o essencial. */
function interpretarEvento(b, conteiner) {
  const s = (b && (b.shipment || b.data || b)) || {};
  const txt = JSON.stringify(b || {});
  const cont = (conteiner && conteiner.number) || s.container_number || s.ContainerNumber || s.containerNumber || ((txt.match(CONTEINER) || [])[1]) || '';
  const pick = (...ks) => { for (const k of ks) { const v = k.split('.').reduce((a, p) => a && a[p], s); if (v) return String(v).slice(0, 10); } return null; };
  const eta = pick('route.port_of_discharge.date_of_discharge', 'eta', 'ETA', 'arrival_date', 'ArrivalDate', 'route.pod.date');
  const movs = (conteiner && conteiner.movements) || s.movements || s.events || s.Events || [];
  const descarga = (Array.isArray(movs) ? movs : []).filter(m => /^DISC$|discharg|descarg/i.test(m.event || m.status || m.Status || m.description || '') && m.actual !== false && m.status !== 'EST').map(m => String(m.timestamp || m.date || m.Date || '').slice(0, 10)).filter(Boolean).pop() || pick('discharge_date', 'DischargeDate');
  const status = s.status || s.Status || '';
  // O navio vem na movimentação (v2): o último confirmado ou, sem nenhum, o primeiro previsto.
  const comNavio = (Array.isArray(movs) ? movs : []).filter(m => m && m.vessel && m.vessel.name), conf = comNavio.filter(m => m.status === 'ACT');
  const navioMov = (conf.length ? conf[conf.length - 1] : comNavio[0] || {}).vessel;
  return { container: String(cont).toUpperCase(), eta, descarga, status, navio: (navioMov && navioMov.name) || (s.vessel && s.vessel.name) || s.VesselName || '' };
}
/** Aplica o evento nas operações. Devolve só as operações que mudaram. */
function aplicarEvento(ops, ev, agora) {
  const mudou = [];
  if (!ev.container) return mudou;
  (ops || []).forEach(o => {
    const cs = Array.isArray(o.containers) ? o.containers : [];
    const i = cs.findIndex(c => c && String(c.numero || '').toUpperCase().replace(/\s/g, '') === ev.container);
    if (i < 0 && String(o.tracking || '').toUpperCase() !== ev.container) return;
    const n = Object.assign({}, o); let alterou = false;
    if (ev.eta && ev.eta !== String(o.eta || '').slice(0, 10)) {
      n.etaHist = (o.etaHist || []).concat([{ de: o.eta || '', para: ev.eta, em: agora, fonte: 'shipsgo' }]).slice(-20); n.eta = ev.eta; alterou = true;
    }
    if (i >= 0 && ev.descarga && !cs[i].descarga) { n.containers = cs.map((c, j) => j === i ? Object.assign({}, c, { descarga: ev.descarga, descargaFonte: 'shipsgo' }) : c); alterou = true; }
    if (ev.navio && !o.navio) { n.navio = ev.navio; alterou = true; }
    if (alterou) { n.trackingEm = agora; mudou.push(n); }
  });
  return mudou;
}
module.exports = { configurado, criarRastreio, interpretarEvento, aplicarEvento, CONTEINER, idDoLink, acharEmbarque, posicaoDoGeojson, rotaDoGeojson, dadosDoEmbarque, embarqueDaOp, eventosDoEmbarque, eventosDoPayload, limparGuardados };
