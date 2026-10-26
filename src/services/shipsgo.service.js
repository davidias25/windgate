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

/** Lê um evento da ShipsGo em qualquer dos formatos (v1/v2) e tira o essencial. */
function interpretarEvento(b) {
  const s = (b && (b.shipment || b.data || b)) || {};
  const txt = JSON.stringify(b || {});
  const cont = s.container_number || s.ContainerNumber || s.containerNumber || ((txt.match(CONTEINER) || [])[1]) || '';
  const pick = (...ks) => { for (const k of ks) { const v = k.split('.').reduce((a, p) => a && a[p], s); if (v) return String(v).slice(0, 10); } return null; };
  const eta = pick('route.port_of_discharge.date_of_discharge', 'eta', 'ETA', 'arrival_date', 'ArrivalDate', 'route.pod.date');
  const movs = s.movements || s.events || s.Events || [];
  const descarga = (Array.isArray(movs) ? movs : []).filter(m => /discharg|descarg/i.test(m.event || m.status || m.Status || m.description || '') && (m.actual !== false)).map(m => String(m.timestamp || m.date || m.Date || '').slice(0, 10)).filter(Boolean).pop() || pick('discharge_date', 'DischargeDate');
  const status = s.status || s.Status || '';
  return { container: String(cont).toUpperCase(), eta, descarga, status, navio: (s.vessel && s.vessel.name) || s.VesselName || '' };
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
module.exports = { configurado, criarRastreio, interpretarEvento, aplicarEvento, CONTEINER };
