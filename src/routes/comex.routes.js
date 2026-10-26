/**
 * Rotas de comércio exterior do Hub 2.0: dólar (PTAX), rastreio ShipsGo com
 * webhook, extrato pelas APIs dos bancos, portais externos (cliente,
 * fornecedor, despachante), conferência de documentos por IA e servidor MCP.
 */
const W = Object.assign({}, require('../../public/hub/js/regras.js'), require('../../public/hub/js/comex.js'));
const cambio = require('../services/cambio.service');
const shipsgo = require('../services/shipsgo.service');
const bancos = require('../services/bancos.service');
const portal = require('../services/portal.service');
const mcp = require('../services/mcp.service');

module.exports = function registrar(app, ctx) {
  const { auth, acesso, gravarParcial, podeOperar, quemChat, pronto, db, ia } = ctx;
  const perfilReq = req => acesso.perfil(db(), quemChat(req));
  const veFin = req => quemChat(req) === '(sem-auth)' || W.pode(db() || {}, quemChat(req), 'fin.ver');

  /* Dólar do dia */
  app.get('/api/cambio/ptax', auth.exigirTokenSeAtiva, async (req, res) => {
    try { res.json(Object.assign({ success: true }, await cambio.ptax())); }
    catch (e) { res.status(502).json({ success: false, message: e.message }); }
  });

  /* ShipsGo: criar rastreio para os contêineres de uma operação */
  app.post('/api/tracking/criar', auth.exigirTokenSeAtiva, async (req, res) => {
    await pronto(); const o = (db().ops || []).find(x => x && x.id === (req.body || {}).op);
    if (!o) return res.status(404).json({ success: false, message: 'Operação não encontrada.' });
    if (!shipsgo.configurado()) return res.json({ success: false, semIntegracao: true, message: 'Falta a chave SHIPSGO_API_KEY no Render.' });
    const alvos = (o.containers || []).map(c => c && c.numero).filter(Boolean);
    if (!alvos.length && !o.bl) return res.status(400).json({ success: false, message: 'Cadastre o contêiner ou o BL antes.' });
    const out = [];
    for (const n of (alvos.length ? alvos : [null])) { try { out.push(Object.assign({ container: n }, await shipsgo.criarRastreio({ container: n, bl: n ? '' : o.bl, ref: o.id }))); } catch (e) { out.push({ container: n, erro: e.message }); } }
    res.json({ success: true, rastreios: out });
  });
  /* ShipsGo: webhook (URL cadastrada no painel: /api/webhooks/shipsgo/<SHIPSGO_WEBHOOK_TOKEN>) */
  app.post('/api/webhooks/shipsgo/:token', async (req, res) => {
    if (!process.env.SHIPSGO_WEBHOOK_TOKEN || req.params.token !== process.env.SHIPSGO_WEBHOOK_TOKEN) return res.status(401).json({ success: false });
    await pronto();
    try {
      const ev = shipsgo.interpretarEvento(req.body || {});
      const mud = shipsgo.aplicarEvento(db().ops || [], ev, new Date().toISOString());
      if (mud.length) await gravarParcial({ ops: mud });
      res.json({ success: true, atualizadas: mud.length });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
  });

  /* Extrato pela API oficial do banco → vira extrato do Fiscal e entra na conciliação */
  app.post('/api/bancos/extrato', auth.exigirTokenSeAtiva, async (req, res) => {
    if (!podeOperar(req)) return res.status(403).json({ success: false, message: 'Sem permissão.' });
    const b = req.body || {}, banco = String(b.banco || ''), mes = String(b.mes || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ success: false, message: 'Informe o mês (AAAA-MM).' });
    const de = mes + '-01', ate = W.vencDoMes(mes, 31);
    try {
      const r = await bancos.extrato(banco, de, ate);
      await pronto(); const d = db();
      const empresa = b.empresa || r.empresa;
      const id = `api-${banco}-${empresa}-${mes}`;
      const antes = (d.hubExtratos || []).find(x => x && x._id === id);
      const rec = Object.assign({}, antes || {}, { _id: id, empresa, banco: r.banco, mes, formato: 'API', origem: 'api', saldo: r.saldo, transacoes: W.conciliar(d, r.transacoes.map(t => Object.assign({}, t, ((antes && antes.transacoes) || []).find(x => x.id === t.id) || {})), empresa), por: quemChat(req), em: new Date().toISOString() });
      await gravarParcial({ hubExtratos: [rec] });
      res.json({ success: true, extrato: { id, movimentos: rec.transacoes.length } });
    } catch (e) { res.status(e.semIntegracao ? 200 : 502).json({ success: false, semIntegracao: !!e.semIntegracao, message: e.message }); }
  });

  /* Conferência cruzada de documentos da operação pela IA */
  app.post('/api/ia/conferir-docs', auth.exigirTokenSeAtiva, async (req, res) => {
    await pronto(); const b = req.body || {}, d = db();
    const o = (d.ops || []).find(x => x && x.id === b.op);
    if (!o) return res.status(404).json({ success: false, message: 'Operação não encontrada.' });
    const docs = (d.docs || []).filter(x => x && x.op === o.id && x.link && (!b.ids || b.ids.includes(x._id))).slice(0, 6);
    if (!docs.length) return res.status(400).json({ success: false, message: 'A operação não tem documentos com arquivo.' });
    try {
      const arquivos = [];
      for (const x of docs) {
        try { const r = await fetch(x.link); if (!r.ok) continue; const mime = (r.headers.get('content-type') || '').split(';')[0] || (/\.pdf$/i.test(x.link) ? 'application/pdf' : 'image/jpeg');
          const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 15e6) continue; arquivos.push({ nome: x.nome || x.grupo, mime, base64: buf.toString('base64') }); } catch (e) { /* arquivo inacessível: segue com os outros */ }
      }
      const out = await ia.conferirDocumentos(arquivos, { op: o.id, cliente: o.cliente, modalidade: o.modalidade || '', importadora: o.empresa || 'SF Trading', containers: (o.containers || []).map(c => c.numero) });
      res.json(Object.assign({ success: true, lidos: arquivos.length }, out));
    } catch (e) { res.status(e.semIA ? 200 : 502).json({ success: false, semIA: !!e.semIA, message: e.message }); }
  });

  /* Portais externos */
  app.post('/api/portal/link', auth.exigirTokenSeAtiva, async (req, res) => {
    const p = perfilReq(req);
    if (!podeOperar(req) && p !== 'documentos') return res.status(403).json({ success: false, message: 'Sem permissão.' });
    const b = req.body || {};
    try { const t = portal.gerar(String(b.op || ''), String(b.tipo || ''), +b.dias || 60); res.json({ success: true, token: t, caminho: '/portal/?t=' + t }); }
    catch (e) { res.status(400).json({ success: false, message: e.message }); }
  });
  app.get('/api/portal/dados', async (req, res) => {
    const a = portal.ler(req.query.t); if (!a) return res.status(401).json({ success: false, message: 'Link inválido ou expirado. Peça um novo à WindGate.' });
    await pronto(); const dados = portal.dados(db(), W, a);
    if (!dados) return res.status(404).json({ success: false, message: 'Operação não encontrada.' });
    res.json({ success: true, tipo: a.tipo, expira: new Date(a.exp * 1000).toISOString(), dados });
  });
  app.post('/api/portal/mensagem', async (req, res) => {
    const a = portal.ler(req.query.t); if (!a) return res.status(401).json({ success: false, message: 'Link inválido ou expirado.' });
    const b = req.body || {}, texto = String(b.texto || '').trim().slice(0, 2000);
    const acao = ['mensagem', 'producao-pronta', 'embarque-confirmado', 'duimp-registrada', 'canal', 'desembaracado'].includes(b.acao) ? b.acao : 'mensagem';
    if (!texto && acao === 'mensagem') return res.status(400).json({ success: false, message: 'Escreva a mensagem.' });
    await pronto(); const o = (db().ops || []).find(x => x && x.id === a.op); if (!o) return res.status(404).json({ success: false });
    const ev = { id: Date.now().toString(36), de: a.tipo, acao, texto, data: String(b.data || '').slice(0, 10), em: new Date().toISOString() };
    const n = Object.assign({}, o, { portalEventos: (o.portalEventos || []).concat([ev]).slice(-200) });
    if (a.tipo === 'fornecedor' && acao === 'producao-pronta' && ev.data) n.prontidao = ev.data;
    if (a.tipo === 'fornecedor' && acao === 'embarque-confirmado' && ev.data) n.embarque = ev.data;
    if (a.tipo === 'despachante' && acao === 'duimp-registrada' && texto) n.duimp = texto.slice(0, 30);
    if (a.tipo === 'despachante' && acao === 'canal' && texto) n.canal = texto.slice(0, 20);
    await gravarParcial({ ops: [n], hubRecados: [{ _id: 'portal-' + o.id + '-' + ev.id, para: 'todos', por: 'Portal · ' + a.tipo, prio: 'alta', feito: {}, texto: `${o.id} · ${a.tipo}: ${acao === 'mensagem' ? texto.slice(0, 140) : acao.replace(/-/g, ' ') + (ev.data ? ' ' + ev.data.split('-').reverse().join('/') : '') + (texto && acao !== 'mensagem' ? ' · ' + texto.slice(0, 80) : '')}`, em: ev.em }] });
    res.json({ success: true });
  });

  /* Servidor MCP (só leitura) */
  app.post('/mcp', async (req, res) => {
    const tk = process.env.WINDGATE_MCP_TOKEN, h = String(req.get('authorization') || '');
    if (!tk || h !== 'Bearer ' + tk) return res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Não autorizado' } });
    await pronto();
    const msgs = Array.isArray(req.body) ? req.body : [req.body];
    const out = msgs.map(m => mcp.tratar(m, db() || {}, W)).filter(Boolean);
    if (!out.length) return res.status(202).end();
    res.json(Array.isArray(req.body) ? out : out[0]);
  });
  app.get('/mcp', (req, res) => res.status(405).set('Allow', 'POST').end());

  return { W };
};
