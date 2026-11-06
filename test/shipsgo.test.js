/**
 * ShipsGo: posição real, com os exemplos da documentação oficial (test/fixtures/shipsgo-doc.json,
 * tirados de api.shipsgo.com/docs/v2/specs/openapi.json). Nenhum teste chama a ShipsGo de verdade.
 */
const path = require('path'), fs = require('fs'), os = require('os');
process.env.NODE_ENV = 'test';
process.env.SUPABASE_DISABLED = '1';
process.env.WINDGATE_DB_FILE = path.join(os.tmpdir(), `windgate-shipsgo-${process.pid}.json`);
process.env.WINDGATE_DB_SECRET = '';
process.env.SHIPSGO_API_KEY = 'chave-falsa';
process.env.SHIPSGO_WEBHOOK_TOKEN = 'tk';
const doc = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/shipsgo-doc.json'), 'utf8'));
const sg = require('../src/services/shipsgo.service');
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };

console.log('\nLink e posição:');
ok(sg.idDoLink('https://map.shipsgo.com/ocean/shipments/123456?token=abc') === '123456' && sg.idDoLink('https://shipsgo.com/dashboard/ocean/shipments/99') === '99', 'o número do embarque sai do link da ShipsGo');
ok(sg.idDoLink('https://www.msc.com/track') === null && sg.idDoLink('') === null, 'link de armador não é tratado como ShipsGo');
const mar = sg.posicaoDoGeojson(doc.geojson.Sailing);
ok(mar.tipo === 'mar' && mar.lat === 31.039 && mar.lng === 122.34225 && mar.navio === 'CMA CGM FIGARO', 'navegando: coordenadas invertidas para lat/lng, com o navio (exemplo Sailing)');
const porto = sg.posicaoDoGeojson(doc.geojson.Loaded);
ok(porto.tipo === 'porto' && porto.porto === 'SHANGHAI' && Math.round(porto.lat) === 31 && Math.round(porto.lng) === 122, 'no porto: posição do porto atual (exemplo Loaded)');
ok(sg.posicaoDoGeojson({ features: [] }) === null && sg.posicaoDoGeojson(null) === null, 'sem dados: nenhuma posição inventada');
const rota = sg.rotaDoGeojson(doc.geojson.Sailing);
ok(rota.length > 10 && rota.every(p => Math.abs(p[0]) <= 90), 'rota em lat/lng');
const longa = { features: [{ geometry: { type: 'LineString', coordinates: Array.from({ length: 2000 }, (_, i) => [i % 180, 1]) } }] };
ok(sg.rotaDoGeojson(longa).length === 300 && sg.rotaDoGeojson(longa)[299][1] === 1999 % 180, 'rota longa é reduzida, mantendo o último ponto');

console.log('\nWebhook no formato da documentação:');
{
  const evs = sg.eventosDoPayload(doc.webhook), s = doc.webhook.shipment, c0 = s.containers[0];
  ok(evs.length === s.containers.length && evs[0].container === c0.number, 'um evento por contêiner');
  const disc = c0.movements.find(m => m.event === 'DISC' && m.status === 'ACT');
  ok(!disc || evs[0].descarga === String(disc.timestamp).slice(0, 10), 'data de descarga vem de containers[].movements');
  ok(evs[0].eta === String(s.route.port_of_discharge.date_of_discharge).slice(0, 10), 'ETA da rota');
  const comNavio = c0.movements.filter(m => m.vessel && m.status === 'ACT').pop();
  ok(!comNavio || evs[0].navio === comNavio.vessel.name, 'navio vem da movimentação');
  const est = sg.interpretarEvento({ shipment: {} }, { number: 'AAAU1111111', movements: [{ event: 'DISC', status: 'EST', timestamp: '2027-01-01T00:00:00Z' }] });
  ok(est.descarga === null || est.descarga === undefined || est.descarga === '', 'descarga só prevista não liga o relógio do free time');
}

(async () => {
  const consultas = []; let recusar = false;
  const fetchReal = global.fetch;
  global.fetch = async (url, o) => {
    if (!String(url).startsWith('https://api.shipsgo.com')) return fetchReal(url, o);
    consultas.push([(o && o.method) || 'GET', String(url), o && o.headers]);
    const res = (st, j) => ({ ok: st < 400, status: st, json: async () => j });
    if (recusar) return res(401, { message: 'UNAUTHORIZED' });
    if (/geojson$/.test(url)) return res(200, { message: 'SUCCESS', geojson: doc.geojson.Sailing });
    const det = /ocean\/shipments\/(\d+)$/.exec(url);
    if (det) return res(200, { message: 'SUCCESS', shipment: { id: +det[1], status: 'SAILING', route: { port_of_loading: { location: { name: 'SHANGHAI' } }, port_of_discharge: { location: { name: 'PECEM' }, date_of_discharge: '2027-01-05T10:00:00-03:00' }, transit_percentage: 40 }, tokens: { map: 'tok-1' }, containers: [{ number: 'MSCU1234567', movements: [{ event: 'DEPA', status: 'ACT', vessel: { name: 'CMA CGM FIGARO' }, timestamp: '2026-11-01T00:00:00Z' }] }] } });
    if (/filters\[container_number\]=eq:MSCU1234567/.test(url)) return res(200, { message: 'SUCCESS', shipments: [{ id: 777 }], meta: {} });
    if (/filters\[/.test(url)) return res(200, { message: 'SUCCESS', shipments: [], meta: {} });
    if (o && o.method === 'POST') return res(200, { message: 'SUCCESS', shipment: { id: 888 } });
    return res(404, { message: 'NOT_FOUND' });
  };
  const app = require('../src/server'), srv = app.listen(0), base = `http://127.0.0.1:${srv.address().port}`;
  const j = async (u, o) => (await fetchReal(base + u, o)).json();
  const dbDe = b => b.db || b.data || b;
  const post = (u, b) => fetchReal(base + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const db = { ops: [
    { _id: 'a', id: 'OP24', cliente: 'A', status: 'embarcado', containers: [{ numero: 'MSCU1234567' }] },
    { _id: 'b', id: 'OP25', cliente: 'B', status: 'embarcado', tracking: 'https://map.shipsgo.com/ocean/shipments/555?token=x' },
    { _id: 'c', id: 'OP26', cliente: 'C', status: 'embarcado', containers: [{ numero: 'TCLU7654321' }] },
    { _id: 'd', id: 'OP27', cliente: 'D', status: 'producao' },
    { _id: 'e', id: 'OP28', cliente: 'E', status: 'concluida', containers: [{ numero: 'MSCU0000000' }] },
    { _id: 'm', id: 'OP30', papel: 'mae', status: 'embarcado', containers: [{ numero: 'MSCU1234567' }] }] };
  const gr = await post('/api/db', db);
  ok(gr.status === 200, 'banco de teste gravado');

  console.log('\nPosição no mapa:');
  sg.limparGuardados();
  const m = await j('/api/tracking/mapa');
  const p = m.posicoes;
  ok(m.success && p.OP24.pos.lat === 31.039 && p.OP24.pos.tipo === 'mar' && p.OP24.id === '777', 'pelo número do contêiner: acha o embarque e traz a posição real');
  ok(p.OP25.id === '555' && p.OP25.pos.lat === 31.039, 'pelo link da ShipsGo: usa o número do embarque do link');
  ok(p.OP26.semRastreio && !p.OP26.pos, 'contêiner que não está na ShipsGo: é apontado, sem posição inventada');
  ok(!p.OP27 && !p.OP28 && !p.OP30, 'sem contêiner, concluída ou operação-mãe: não consulta');
  ok(p.OP24.pct === 40 && p.OP24.origem === 'SHANGHAI' && p.OP24.destino === 'PECEM' && /map\.shipsgo\.com\/ocean\/shipments\/777\?token=tok-1/.test(p.OP24.link), 'percentual da viagem, portos e link do mapa da ShipsGo');
  ok(consultas.every(([met]) => met === 'GET'), 'abrir o mapa só consulta: nenhum rastreio criado, nenhum crédito gasto');
  ok(consultas.every(([, , h]) => h['X-Shipsgo-User-Token'] === 'chave-falsa') && !JSON.stringify(m).includes('chave-falsa'), 'o token vai no cabeçalho certo e não sai do servidor');
  const qtd = consultas.length;
  await j('/api/tracking/mapa');
  ok(consultas.length === qtd, 'abrir de novo em seguida não repete as chamadas');
  const dep = dbDe(await j('/api/db')).ops;
  const op24 = dep.find(o => o.id === 'OP24');
  ok(op24.eta === '2027-01-05' && op24.navio === 'CMA CGM FIGARO', 'ETA e navio da operação ficam em dia ao abrir o mapa');

  console.log('\nLigar o tracking:');
  consultas.length = 0;
  let r = await (await post('/api/tracking/criar', { op: 'OP24' })).json();
  ok(r.success && r.rastreios[0].jaExistia && r.rastreios[0].id === '777' && !consultas.some(([met]) => met === 'POST'), 'contêiner já na ShipsGo: não cria de novo nem gasta crédito');
  consultas.length = 0;
  r = await (await post('/api/tracking/criar', { op: 'OP26' })).json();
  ok(r.success && r.rastreios[0].id === 888 && consultas.filter(([met]) => met === 'POST').length === 1, 'contêiner novo: cria uma vez');

  console.log('\nChave recusada:');
  sg.limparGuardados(); recusar = true;
  const rec = await j('/api/tracking/mapa');
  ok(rec.success && /recusou a chave/.test(rec.erro) && !rec.posicoes.OP24, 'chave recusada: avisa e não mostra posição falsa');
  recusar = false;

  console.log('\nWebhook pela rota:');
  const wr = await post('/api/webhooks/shipsgo/tk', { event: { name: 'OCEAN.SHIPMENTS.SHIPMENT_UPDATED' }, shipment: { container_number: 'MSCU1234567', route: { port_of_discharge: { date_of_discharge: '2027-02-01T00:00:00Z' } }, containers: [{ number: 'MSCU1234567', movements: [{ event: 'DISC', status: 'ACT', timestamp: '2027-02-02T00:00:00Z' }] }] } });
  const dw = await wr.json(), ops = dbDe(await j('/api/db')).ops, o24 = ops.find(o => o.id === 'OP24');
  ok(dw.success && o24.eta === '2027-02-01' && o24.containers[0].descarga === '2027-02-02', 'aviso no formato oficial atualiza o ETA e liga o free time');

  srv.close(); global.fetch = fetchReal; try { fs.unlinkSync(process.env.WINDGATE_DB_FILE); fs.unlinkSync(process.env.WINDGATE_DB_FILE + '.bak'); } catch (e) {}
  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
