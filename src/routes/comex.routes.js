/**
 * Rotas de comércio exterior do Hub 2.0: dólar (PTAX), rastreio ShipsGo com
 * webhook, extrato pelas APIs dos bancos, portais externos (cliente,
 * fornecedor, despachante), conferência de documentos por IA e servidor MCP.
 */
const W = Object.assign({}, require('../../public/hub/js/regras.js'), require('../../public/hub/js/comex.js'), require('../../public/hub/js/cotacao-regras.js'), require('../../public/hub/js/cambio-regras.js'), require('../../public/hub/js/contrato-regras.js'));
const contratoDoc = require('../services/contrato-doc.service');
const propostaLink = require('../services/proposta-link.service');
const cambio = require('../services/cambio.service');
const shipsgo = require('../services/shipsgo.service');
const bancos = require('../services/bancos.service');
const portal = require('../services/portal.service');
const mcp = require('../services/mcp.service');

module.exports = function registrar(app, ctx) {
  const { auth, acesso, gravarParcial, podeOperar, quemChat, pronto, db, ia, guardarArquivoGerado } = ctx;
  const perfilReq = req => acesso.perfil(db(), quemChat(req));
  const veFin = req => quemChat(req) === '(sem-auth)' || W.pode(db() || {}, quemChat(req), 'fin.ver');

  /* Dólar do dia */
  app.get('/api/cambio/ptax/:data', auth.exigirTokenSeAtiva, async (req, res) => {
    try { const d = await cambio.ptaxDoDia(req.params.data); res.json({ success: true, ptax: d }); }
    catch (e) { res.status(502).json({ success: false, message: e.message }); }
  });
  app.get('/api/cambio/ptax', auth.exigirTokenSeAtiva, async (req, res) => {
    try { res.json(Object.assign({ success: true }, await cambio.ptax())); }
    catch (e) { res.status(502).json({ success: false, message: e.message }); }
  });

  /* Um embarque pode ter vários contêineres: cada evento parte do resultado do anterior. */
  function aplicarEventos(eventos, agora) {
    const mudadas = new Map(), atuais = () => (db().ops || []).map(o => (o && mudadas.get(o._id || o.id)) || o);
    eventos.forEach(ev => shipsgo.aplicarEvento(atuais(), ev, agora).forEach(n => mudadas.set(n._id || n.id, n)));
    return [...mudadas.values()];
  }
  /* ShipsGo: posição real para o mapa. Só consulta: nada é criado nem cobrado, e o token não sai do servidor. */
  app.get('/api/tracking/mapa', auth.exigirTokenSeAtiva, async (req, res) => {
    await pronto();
    if (!shipsgo.configurado()) return res.json({ success: true, semIntegracao: true, posicoes: {} });
    const ops = (db().ops || []).filter(o => o && o.id && o.papel !== 'mae' && W.ativa(o) && (shipsgo.idDoLink(o.tracking) || (o.containers || []).length || o.bl)).slice(0, 40);
    const posicoes = {}, eventos = []; let erro = null;
    for (const o of ops) {
      try {
        const id = await shipsgo.embarqueDaOp(o);
        if (!id) { posicoes[o.id] = { semRastreio: true }; continue; }
        const d = await shipsgo.dadosDoEmbarque(id);
        posicoes[o.id] = { id, status: d.status, pct: d.pct, origem: d.origem, destino: d.destino, pos: d.pos, rota: d.rota, link: d.link };
        eventos.push(...d.eventos);
      } catch (e) { erro = erro || e.message; if (e.status === 401 || e.status === 403) break; }
    }
    /* Serve de reserva do webhook: ETA, navio e descarga ficam em dia ao abrir o mapa. */
    try { const mud = aplicarEventos(eventos, new Date().toISOString()); if (mud.length) await gravarParcial({ ops: mud }); } catch (e) { console.warn('⚠️ ShipsGo: atualização das operações:', e.message); }
    res.json({ success: true, posicoes, erro });
  });
  /* ShipsGo: criar rastreio para os contêineres de uma operação */
  app.post('/api/tracking/criar', auth.exigirTokenSeAtiva, async (req, res) => {
    await pronto(); const o0 = (db().ops || []).find(x => x && x.id === (req.body || {}).op);
    if (!o0) return res.status(404).json({ success: false, message: 'Operação não encontrada.' });
    // Cada contêiner rastreado é cobrado: a filha usa o rastreio da mãe.
    const o = (o0.maeId && (db().ops || []).find(x => x && x.id === o0.maeId)) || o0;
    if (!shipsgo.configurado()) return res.json({ success: false, semIntegracao: true, message: 'Falta a chave SHIPSGO_API_KEY no Render.' });
    const alvos = (o.containers || []).map(c => c && c.numero).filter(Boolean);
    if (!alvos.length && !o.bl) return res.status(400).json({ success: false, message: 'Cadastre o contêiner ou o BL antes.' });
    const out = [];
    // Se já está na conta, não cria de novo: criar gasta crédito, e a referência diferente passaria pela checagem de duplicidade.
    for (const n of (alvos.length ? alvos : [null])) { try { const ja = await shipsgo.acharEmbarque(n ? { container: n } : { bl: o.bl }); out.push(Object.assign({ container: n }, ja ? { id: ja, jaExistia: true } : await shipsgo.criarRastreio({ container: n, bl: n ? '' : o.bl, ref: o.id }))); } catch (e) { out.push({ container: n, erro: e.message }); } }
    res.json({ success: true, rastreios: out });
  });
  /* ShipsGo: webhook (URL cadastrada no painel: /api/webhooks/shipsgo/<SHIPSGO_WEBHOOK_TOKEN>) */
  app.post('/api/webhooks/shipsgo/:token', async (req, res) => {
    if (!process.env.SHIPSGO_WEBHOOK_TOKEN || req.params.token !== process.env.SHIPSGO_WEBHOOK_TOKEN) return res.status(401).json({ success: false });
    await pronto();
    try {
      const mud = aplicarEventos(shipsgo.eventosDoPayload(req.body || {}), new Date().toISOString());
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
    await pronto(); const o = (db().ops || []).find(x => x && (x.id === a.op || (x.codigosAnteriores || []).includes(a.op))); if (!o) return res.status(404).json({ success: false });
    const ev = { id: Date.now().toString(36), de: a.tipo, acao, texto, data: String(b.data || '').slice(0, 10), em: new Date().toISOString() };
    const n = Object.assign({}, o, { portalEventos: (o.portalEventos || []).concat([ev]).slice(-200) });
    if (a.tipo === 'fornecedor' && acao === 'producao-pronta' && ev.data) n.prontidao = ev.data;
    if (a.tipo === 'fornecedor' && acao === 'embarque-confirmado' && ev.data) n.embarque = ev.data;
    if (a.tipo === 'despachante' && acao === 'duimp-registrada' && texto) n.duimp = texto.slice(0, 30);
    if (a.tipo === 'despachante' && acao === 'canal' && texto) n.canal = texto.slice(0, 20);
    await gravarParcial({ ops: [n], hubRecados: [{ _id: 'portal-' + o.id + '-' + ev.id, para: 'todos', por: 'Portal · ' + a.tipo, prio: 'alta', feito: {}, texto: `${o.id} · ${a.tipo}: ${acao === 'mensagem' ? texto.slice(0, 140) : acao.replace(/-/g, ' ') + (ev.data ? ' ' + ev.data.split('-').reverse().join('/') : '') + (texto && acao !== 'mensagem' ? ' · ' + texto.slice(0, 80) : '')}`, em: ev.em }] });
    res.json({ success: true });
  });

  /* Contrato padrão: gerar, revisar e liberar */
  const podeFinAutorizar = req => W.pode(db() || {}, quemChat(req), 'fin.autorizar');
  app.get('/api/contratos/modelos', auth.exigirTokenSeAtiva, (req, res) => res.json({ success: true, instalados: contratoDoc.modelosInstalados(), ia: ia.ativa() }));
  app.post('/api/contratos/gerar', auth.exigirTokenSeAtiva, async (req, res) => {
    await pronto(); const b = req.body || {}, d = W.dadosDoContrato(db(), String(b.op || ''), b.editados);
    if (!d) return res.status(404).json({ success: false, message: 'Operação não encontrada.' });
    if (W.ehMae(d.op)) return res.status(400).json({ success: false, message: 'O contrato é um por filha: gere em cada cliente.' });
    if (!d.q) return res.status(400).json({ success: false, message: 'Esta operação não tem cotação ligada.' });
    const modelo = contratoDoc.modelo(d.estrutura);
    if (!modelo) return res.status(409).json({ success: false, semModelo: true, message: `O modelo oficial de ${W.ESTRUTURAS[d.estrutura].nome} ainda não foi instalado.` });
    try {
      const p = W.preencherModelo(modelo, d), agora = new Date().toISOString(), anterior = W.contratoPadraoDaOp(db(), d.op.id), versao = ((anterior && +anterior.versao) || 0) + 1;
      const nome = `Contrato_${d.op.id.replace(/[^\w.-]+/g, '_')}_v${versao}`, por = quemChat(req);
      if (b.editados) b.editados = Object.assign({}, b.editados);
      const [docx, pdf] = await Promise.all([guardarArquivoGerado(contratoDoc.gerarDocx(p), nome + '.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), guardarArquivoGerado(contratoDoc.gerarPdf(p), nome + '.pdf', 'application/pdf')]);
      const c = { _id: 'ct-' + d.op.id.replace(/[^\w.-]+/g, '_') + '-v' + versao, padrao: true, op: d.op.id, cliente: d.op.cliente || '', tipo: 'operacao', modalidade: 'propria', estrutura: d.estrutura, versao, status: 'gerado', clausulaTributaria: true, por, em: agora, link: pdf, linkDocx: docx, editados: b.editados || {}, pendentes: p.pendentes, freteBase: modelo.freteIncluso, digital: W.digitalDaCotacao(d.q), revisao: null };
      const docOf = (id, link, ext) => ({ _id: c._id + '-' + id, op: d.op.id, grupo: 'contratos', cat: 'Contrato com o cliente', nome: nome + '.' + ext, link, status: 'recebido', por, obs: 'Gerado pelo sistema', data: agora.slice(0, 10) });
      const parcial = { hubContratos: [c], docs: [docOf('pdf', pdf, 'pdf'), docOf('docx', docx, 'docx')] };
      if (anterior) parcial.hubContratos.push(Object.assign({}, anterior, { status: 'cancelado', substituidoPor: c._id }));
      await gravarParcial(parcial);
      res.json({ success: true, contrato: c });
    } catch (e) { res.status(502).json({ success: false, message: e.message }); }
  });
  app.post('/api/contratos/revisar', auth.exigirTokenSeAtiva, async (req, res) => {
    await pronto(); const c = (db().hubContratos || []).find(x => x && x._id === String((req.body || {}).id || ''));
    if (!c) return res.status(404).json({ success: false, message: 'Contrato não encontrado.' });
    const d = W.dadosDoContrato(db(), c.op, c.editados); if (!d) return res.status(404).json({ success: false, message: 'Operação não encontrada.' });
    const alertas = W.revisarEmCodigo(db(), c, d);
    let iaFeita = false, iaErro = '';
    const modelo = contratoDoc.modelo(c.estrutura);
    if (modelo) {
      try {
        const p = W.preencherModelo(modelo, d), s = d.tabelaRaw ? W.simulacaoCambio(d.q, d.tabelaRaw.referencia - 0.05) : null;
        const fatos = { estrutura: W.ESTRUTURAS[c.estrutura].nome, contribuinte: d.contribuinte, eta: d.op.eta || '', cotacaoComFreteNacional: d.campos.freteNacional, pior: s ? s.cenarios.reduce((a, b) => (b.lucro < a.lucro ? b : a)).lucro : null, recebimentoCobreSaida: W.desemErros(d.q, d.R).length === 0 };
        alertas.push(...await ia.revisarContrato({ texto: p.texto, oficial: (modelo.blocos || []).map(x => x.texto || '[' + x.t + ']').join('\n'), fatos }));
        iaFeita = true;
      } catch (e) { iaErro = e.message; alertas.push({ nivel: 'atencao', titulo: 'A análise por IA não rodou', detalhe: e.message, origem: 'regra' }); }
    }
    const revisao = { em: new Date().toISOString(), por: quemChat(req), alertas, ia: iaFeita, iaErro };
    await gravarParcial({ hubContratos: [Object.assign({}, c, { revisao, status: c.status === 'liberado' ? 'gerado' : c.status })] });
    res.json({ success: true, revisao });
  });
  app.post('/api/contratos/liberar', auth.exigirTokenSeAtiva, async (req, res) => {
    if (!podeFinAutorizar(req)) return res.status(403).json({ success: false, message: 'Quem libera o contrato é o Samir.' });
    await pronto(); const c0 = (db().hubContratos || []).find(x => x && x._id === String((req.body || {}).id || ''));
    const c = c0 ? Object.assign({}, c0) : null, r = W.liberarContrato(db(), c, quemChat(req));
    if (!r.ok) return res.status(409).json({ success: false, message: r.msg });
    await gravarParcial({ hubContratos: [c] });
    res.json({ success: true, contrato: c });
  });

  /* Link rastreável da proposta */
  const cotacaoDoLink = a => {
    const q0 = (db().quotes || {})[a.q]; if (!q0) return null;
    const q = Object.assign({ id: a.q }, q0);
    if (a.c && W.ehMultiCliente(q)) { const cc = W.calcularPorCliente(q).clientes.find(x => x.id === a.c); if (!cc || cc.cliente.status !== 'ok') return null; return { q: cc.q, R: cc.R, liberada: true }; }
    /* A margem pode ter sido digitada em % ou em R$: vale o modo que dá o preço aprovado. */
    let R = W.calcular(q);
    if (Math.abs((R.preco || 0) - (+q.preco || 0)) > 0.01) { const emReais = W.calcular(q, { modo: 'brl' }); if (Math.abs((emReais.preco || 0) - (+q.preco || 0)) <= 0.01) R = emReais; }
    return { q, R, liberada: q.status === 'ok' };
  };
  app.post('/api/propostas/link', auth.exigirTokenSeAtiva, async (req, res) => {
    await pronto(); const b = req.body || {}, a = { q: String(b.quoteId || ''), c: String(b.clienteId || '') }, c = cotacaoDoLink(a);
    if (!c) return res.status(404).json({ success: false, message: 'Cotação não encontrada ou cliente ainda sem aprovação.' });
    if (!c.liberada) return res.status(409).json({ success: false, message: 'A proposta só é liberada após a aprovação do Samir.' });
    const dias = Math.min(Math.max(+b.dias || 30, 1), 180), t = propostaLink.gerar(a.q, a.c, dias), criadoEm = new Date().toISOString();
    await gravarParcial({ propostaLinks: [{ _id: propostaLink.idDoLink(t), quoteId: a.q, clienteId: a.c, criadoEm, por: quemChat(req), dias }] });
    res.json({ success: true, token: t, caminho: '/p/proposta/' + t, dias });
  });
  app.get('/p/proposta/:token', async (req, res) => {
    res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    const a = propostaLink.ler(req.params.token);
    if (!a) return res.status(410).send(propostaLink.paginaAviso('Este link venceu ou é inválido. Peça um novo à WindGate.'));
    await pronto(); const c = cotacaoDoLink(a);
    if (!c || !c.liberada) return res.status(410).send(propostaLink.paginaAviso('Esta proposta está sendo revista. Fale com a WindGate.'));
    const reg = (db().propostaLinks || []).find(x => x && x._id === propostaLink.idDoLink(req.params.token));
    const p = W.resumoProposta(c.q, c.R, reg && reg.criadoEm);
    p.cambio = W.textoCambio(W.tabelaCambio(c.q));
    res.send(propostaLink.pagina(p, req.params.token));
  });
  /* A abertura vem do navegador do cliente: prévia de WhatsApp e robô não rodam o script e não contam. */
  app.post('/p/proposta/:token/aberta', async (req, res) => {
    const a = propostaLink.ler(req.params.token); if (!a) return res.status(410).json({ success: false });
    await pronto();
    const id = propostaLink.idDoLink(req.params.token), todas = (db().propostaAberturas || []).filter(x => x && x.linkId === id), agora = new Date();
    const ultima = todas.map(x => x.em).sort().pop();
    if (todas.length >= 500 || (ultima && agora - new Date(ultima) < 60000)) return res.json({ success: true });
    const parcial = { propostaAberturas: [{ _id: 'pa-' + id + '-' + agora.getTime().toString(36), linkId: id, quoteId: a.q, clienteId: a.c || '', em: agora.toISOString() }] };
    if (!todas.length) {
      const n = (db().crmOps || []).find(x => x && x.quoteId === a.q), q = (db().quotes || {})[a.q] || {}, dono = String((n && n.resp) || q.criadoPor || '').trim();
      const us = db().users || {}, chave = Object.keys(us).find(k => k.toLowerCase() === dono.toLowerCase() || String((us[k] && us[k].nome) || '').toLowerCase() === dono.toLowerCase());
      const cliente = (n && n.clienteNome) || (q.fields && q.fields.cliente) || 'O cliente';
      parcial.hubRecados = [{ _id: 'proposta-aberta-' + id, para: chave || 'todos', por: 'Proposta', prio: 'alta', feito: {}, em: agora.toISOString(), quoteId: a.q, texto: cliente + ' abriu a proposta pela primeira vez.' }];
    }
    await gravarParcial(parcial);
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
