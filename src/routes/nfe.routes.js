/**
 * Emissão de NF-e pela Focus NFe.
 *
 * Fluxo: rascunho → conferida → enviada → autorizada | rejeitada | cancelada.
 * Só quem tem `nfe.emitir` (Davi e o contador) monta, confere, transmite,
 * cancela e corrige; a diretoria só acompanha. Em produção, com a conferência
 * cruzada ligada, quem montou não confere nem transmite.
 *
 * A nota é montada AQUI, com o banco completo: o contador nunca recebe
 * operações, cotações, CRM nem financeiro — recebe a nota pronta e o que falta.
 *
 * Sem emissão em dobro: a referência (`ref`) nasce uma vez e não muda depois de
 * enviada; antes de emitir, a Focus é consultada por ela; uma trava em memória
 * barra o clique duplo. O webhook e a consulta de reserva (2 min) só disparam
 * uma CONSULTA — o status vem sempre da Focus, nunca do corpo do aviso.
 */
const crypto = require('crypto');
const W = Object.assign({}, require('../../public/hub/js/regras.js'), require('../../public/hub/js/comex.js'), require('../../public/hub/js/nfe-regras.js'));
const focus = require('../services/nfe.service');
const portalUnico = require('../services/portal-unico.service');

module.exports = function registrar(app, ctx) {
  const { auth, acesso, gravarParcial, quemChat, pronto, db, salvarArquivo } = ctx;
  if (salvarArquivo) focus._usarArmazenamento(salvarArquivo);
  const agora = () => new Date().toISOString();
  const achar = id => ((db() || {}).hubNFe || []).find(n => n && n._id === id) || null;
  const emUso = new Set();
  const salvar = (n, extra) => gravarParcial(Object.assign({ hubNFe: [n] }, extra || {}));
  const hist = (n, por, acao, msg) => Object.assign({}, n, { historico: (n.historico || []).concat([{ em: agora(), por, acao, msg: String(msg || '').slice(0, 500) }]) });
  const notaDaDuimp = (d, num) => ((d || {}).hubNFe || []).filter(n => n && n.cenario === 'A' && n.duimp && W.numDuimp(n.duimp.numero) === W.numDuimp(num) && n.status !== 'cancelada').sort((a, b) => String(b.criadaEm || '').localeCompare(String(a.criadaEm || '')))[0] || null;
  /* Operação antiga sem _id: o _id tem de ser o do conteúdo original, senão a mesclagem duplica a operação. */
  const comId = o => Object.assign({ _id: o._id || W.idDeterministico(o) }, o);
  const falha = (res, e) => res.status(e.semIntegracao ? 200 : 502).json({ success: false, semIntegracao: !!e.semIntegracao, message: e.message });

  /** Confere a permissão e devolve { d, k, n }; em caso de recusa já respondeu. */
  async function pedido(req, res, acao, comNota) {
    await pronto(); const d = db();
    if (!d) { res.status(503).json({ success: false, message: 'Banco central indisponível.' }); return null; }
    const k = quemChat(req), n = comNota ? achar(req.params.id) : null;
    if (comNota && !n) { res.status(404).json({ success: false, message: 'NF-e não encontrada.' }); return null; }
    const p = W.podeAcao(d, k, n, acao, focus.ambiente());
    if (!p.ok) { res.status(p.codigo).json({ success: false, message: p.msg }); return null; }
    return { d, k, n };
  }

  /* ---------- Depois da autorização: XML, DANFE, GED e Fiscal ---------- */
  async function posAutorizacao(n) {
    const d = db(), extra = {};
    const nome = `NFe_${n.numero || n.ref}_${n.empresa === 'JeT' ? 'JeT' : 'SF'}`;
    let xml = n.xmlLink || '', danfe = n.danfeLink || '';
    try {
      if (!xml) xml = await focus.guardar(n.empresa, n.caminhoXml, nome + '.xml', 'application/xml');
      if (!danfe) danfe = await focus.guardar(n.empresa, n.caminhoDanfe, nome + '.pdf', 'application/pdf');
    } catch (e) { console.warn('⚠️ NF-e: arquivos ainda não baixados da Focus:', e.message); }
    const m = Object.assign({}, n, { xmlLink: xml, danfeLink: danfe, arquivosSalvos: !!(xml && danfe) });
    const dia = String(m.autorizadaEm || agora()).slice(0, 10), cen = W.cenarioDe(d, m.cenario) || { nome: m.cenario };
    const tipo = m.payload && +m.payload.tipo_documento === 0 ? 'entrada' : 'saida';
    /* Fiscal: a nota do contador. Se o SEFAZ (MDe) já trouxe a mesma chave, completa aquela. */
    const igual = (d.hubNotas || []).find(x => x && ((m.chave && x.chave === m.chave) || x.nfe === m._id));
    const emp = W.empresaDados(d, m.empresa);
    extra.hubNotas = [Object.assign({ _id: 'nfe-' + m._id, status: 'recebida', em: agora(), obs: '' }, igual || {}, {
      chave: m.chave, numero: m.numero, serie: m.serie, data: (igual && igual.data) || dia, tipo, empresa: m.empresa, emitente: emp.razaoSocial || emp.nome || '', emitenteCnpj: emp.cnpj,
      destinatario: (m.destinatario || {}).nome || '', destCnpj: (m.destinatario || {}).cnpj || '', valor: (m.totais || {}).total || 0, cfop: ((m.payload || {}).items || [{}])[0].cfop || '',
      natureza: (m.payload || {}).natureza_operacao || '', origem: (igual && igual.origem) || 'emitida', por: 'Sistema · NF-e', op: m.op || '', nfe: m._id,
      xmlLink: xml || (igual && igual.xmlLink) || '', pdfLink: danfe || (igual && igual.pdfLink) || '' })];
    /* GED: o DANFE entra nos documentos da operação. */
    if (m.op && (danfe || xml)) {
      const id = 'nfe-doc-' + m._id, antes = (d.docs || []).find(x => x && x._id === id);
      extra.docs = [Object.assign({ _id: id, op: m.op, tipo: 'nfe', grupo: 'chegada', cat: 'NF-e', status: 'recebido', data: dia, dataUpload: agora(), por: 'Sistema · NF-e', versao: 1, rascunho: false, conferencias: [] }, antes || {},
        { nome: `NF-e ${m.numero || ''} · ${cen.nome}`.trim(), link: danfe || xml, xmlLink: xml, obs: `Chave ${m.chave || '—'} · ${m.empresa === 'JeT' ? 'JeT' : 'SF'}`, nfe: m._id })];
    }
    return { n: m, extra };
  }

  /** Aplica a resposta da Focus, cuida do que vem depois e grava tudo de uma vez. */
  async function aplicar(n, resposta, por) {
    let m = W.aplicarRetornoFocus(n, resposta, agora(), por), extra = {};
    if (m.status === 'autorizada' && !m.arquivosSalvos) ({ n: m, extra } = await posAutorizacao(m));
    if (m.status === 'cancelada' && n.status !== 'cancelada') extra = Object.assign(extra, marcarCancelada(m));
    await salvar(m, extra);
    return m;
  }
  function marcarCancelada(m) {
    const d = db(), out = {};
    const nota = (d.hubNotas || []).find(x => x && (x.nfe === m._id || (m.chave && x.chave === m.chave)));
    if (nota) out.hubNotas = [Object.assign({}, nota, { cancelada: true, obs: ((nota.obs || '') + ' · NF-e cancelada em ' + W.dataBR(m.canceladaEm)).trim() })];
    const doc = (d.docs || []).find(x => x && x._id === 'nfe-doc-' + m._id);
    if (doc) out.docs = [Object.assign({}, doc, { obs: (doc.obs || '') + ' · CANCELADA' })];
    return out;
  }

  /** Consulta a Focus e atualiza a nota. 404 de nota "enviada" = a Focus não recebeu: volta a conferida. */
  async function atualizar(n, por) {
    if (!['enviada', 'autorizada', 'cancelada'].includes(n.status)) return n;
    const c = await focus.consultar(n.empresa, n.ref);
    if (c.status === 404 && n.status === 'enviada') {
      const m = hist(Object.assign({}, n, { status: 'conferida', mensagemSefaz: 'A Focus não recebeu esta nota. Pode transmitir de novo (mesma referência).' }), por, 'nao-recebida', 'Focus respondeu 404 na consulta');
      await salvar(m); return m;
    }
    if (c.json && c.json.status && (c.json.status !== n.statusFocus || (n.status === 'autorizada' && !n.arquivosSalvos))) return aplicar(n, c.json, por);
    return n;
  }

  /* ---------- Contexto da tela (o contador recebe só o que precisa para emitir) ---------- */
  app.get('/api/nfe/contexto', auth.exigirTokenSeAtiva, async (req, res) => {
    const p = await pedido(req, res, 'ver'); if (!p) return;
    const { d, k } = p;
    res.json({ success: true, ambiente: focus.ambiente(), podeEmitir: W.pode(d, k, 'nfe.emitir'), usuario: k,
      tokens: { WindGate: focus.configurado('WindGate'), JeT: focus.configurado('JeT') }, webhook: !!process.env.FOCUS_WEBHOOK_TOKEN,
      config: W.configNFe(d), cenarios: W.cenarios(d),
      ops: (d.ops || []).filter(o => o && o.id).map(o => ({ id: o.id, cliente: o.cliente || '', modalidade: o.modalidade || '', empresa: o.empresa || 'WindGate', duimp: o.duimp || '', status: o.status || '', retrato: !!W.retratoDuimp(d, o.duimp), duimpVersao: ((W.retratoDuimp(d, o.duimp) || {}).dados || {}).versao || '' })) });
  });

  /* ---------- Montar (nova ou atualizar) ---------- */
  /* Campos da entrada (cenário A) que a pessoa pode corrigir: só o que a API da
     DUIMP não traz ou o cenário permite. Itens, valores, tributos federais,
     exportador e dados da declaração vêm da DUIMP e ficam travados. */
  const EDITAVEIS_A = { extras: ['informacoes', 'terceiroUf'], duimp: ['data_desembaraco', 'via_transporte', 'afrmm', 'local', 'uf'] };
  const refDe = (d, m) => W.proximaRef(d, m.empresa, m.cenario === 'A' && m.duimp && m.duimp.numero ? 'duimp-' + m.duimp.numero : m.opId, m.cenario);
  /** Monta (ou remonta) a nota e grava. Remontar zera a conferência. */
  async function gravarMontagem(d, n, entrada, k, acao, msg) {
    const amb = focus.ambiente(), em = agora();
    const m = W.montarNFe(d, Object.assign({}, entrada, { ambiente: amb }));
    let ref = n && n.ref, anteriores = (n && n.refsAnteriores) || [];
    if (!n || n.refQueimado) { if (n) anteriores = anteriores.concat([n.ref]); ref = refDe(d, m); }
    const rec = Object.assign({}, n || { _id: 'nfe-' + crypto.randomBytes(8).toString('hex'), criadaEm: em, historico: [], cartas: [] }, {
      ref, refsAnteriores: anteriores, empresa: m.empresa, op: m.opId, cenario: m.cenario, status: 'rascunho', ambiente: amb,
      payload: m.payload, pendencias: m.pendencias, avisos: m.avisos, totais: m.totais, destinatario: m.destinatario, entrada,
      montadoPor: k, montadoEm: em, conferidoPor: '', conferidoEm: '', refQueimado: false, denegada: false },
      m.cenario === 'A' ? { duimp: m.duimp, ops: m.ops || [] } : {});
    const motivo = n && n.refQueimado ? `nova referência ${ref}: a anterior (${n.ref}) não pode ser reutilizada${n.denegada ? ' (nota denegada)' : ' (a Focus recusou o reenvio)'}` : msg || `${m.pendencias.length} pendência(s)`;
    const final = hist(rec, k, acao || (n ? 'atualizada' : 'montada'), motivo);
    await salvar(final);
    return final;
  }

  app.post('/api/nfe/montar', auth.exigirTokenSeAtiva, async (req, res) => {
    const b = req.body || {};
    await pronto(); req.params.id = b.id;
    const p = await pedido(req, res, 'montar', !!b.id); if (!p) return;
    const { d, k } = p; const n = p.n;
    const cenario = String((n && n.cenario) || b.cenario || '').toUpperCase();
    let entrada;
    if (cenario === 'A') {
      /* A entrada só nasce da DUIMP importada; correção manual só nos campos permitidos, com motivo. */
      if (!n) {
        const o = (d.ops || []).find(x => x && x.id === b.opId);
        const num = W.numDuimp(b.duimpNumero || (o && o.duimp));
        if (!num || !W.retratoDuimp(d, num)) return res.status(409).json({ success: false, message: 'A NF de entrada nasce da DUIMP: importe a DUIMP da operação primeiro (Importar DUIMP).' });
        const ja = notaDaDuimp(d, num);
        if (ja) return res.status(409).json({ success: false, nota: ja, message: `Esta DUIMP já tem a NF de entrada ${ja.ref}.` });
        entrada = W.sugerirEntrada(d, { cenario: 'A', opId: (W.retratoDuimp(d, num).op || {}).id || b.opId, duimpNumero: num, dataEmissao: b.dataEmissao });
      } else {
        entrada = JSON.parse(JSON.stringify(n.entrada || {}));
        const mud = [], ex = b.extras || {};
        EDITAVEIS_A.extras.forEach(c => { if (c in ex && String(ex[c] == null ? '' : ex[c]) !== String((entrada.extras || {})[c] || '')) { entrada.extras = Object.assign({}, entrada.extras, { [c]: ex[c] }); mud.push(c); } });
        EDITAVEIS_A.duimp.forEach(c => { if (ex.duimp && c in ex.duimp && String(ex.duimp[c] == null ? '' : ex.duimp[c]) !== String(((entrada.extras || {}).duimp || {})[c] || '')) { entrada.extras = Object.assign({}, entrada.extras, { duimp: Object.assign({}, (entrada.extras || {}).duimp, { [c]: ex.duimp[c] }) }); mud.push('duimp.' + c); } });
        if (b.dataEmissao) entrada.dataEmissao = String(b.dataEmissao).slice(0, 10);
        const motivo = String(b.motivo || '').trim();
        if (mud.length && motivo.length < 5) return res.status(400).json({ success: false, message: 'Diga o motivo da correção manual (fica no histórico da nota).' });
        const final = await gravarMontagem(d, n, entrada, k, mud.length ? 'correcao-manual' : 'atualizada', mud.length ? `${mud.join(', ')} · motivo: ${motivo.slice(0, 300)}` : '');
        return res.json({ success: true, nota: final });
      }
    } else if (!n) {
      entrada = W.sugerirEntrada(d, { cenario: b.cenario, opId: b.opId, empresa: b.empresa, referencia: b.extras && b.extras.referencia, dataEmissao: b.dataEmissao });
      if (!entrada) return res.status(400).json({ success: false, message: 'Cenário fiscal desconhecido.' });
    } else entrada = JSON.parse(JSON.stringify(n.entrada || {}));
    if (cenario !== 'A') {
      if (Array.isArray(b.itens)) entrada.itens = b.itens;
      if (b.destinatario && typeof b.destinatario === 'object') entrada.destinatario = Object.assign({}, entrada.destinatario, b.destinatario);
      if (b.extras && typeof b.extras === 'object') entrada.extras = Object.assign({}, entrada.extras, b.extras, { duimp: Object.assign({}, (entrada.extras || {}).duimp, b.extras.duimp) });
      if (b.dataEmissao) entrada.dataEmissao = String(b.dataEmissao).slice(0, 10);
      if (!n && b.empresa) entrada.empresa = b.empresa;
    }
    res.json({ success: true, nota: await gravarMontagem(d, n, entrada, k) });
  });

  app.post('/api/nfe/:id/conferir', auth.exigirTokenSeAtiva, async (req, res) => {
    const p = await pedido(req, res, 'conferir', true); if (!p) return;
    const n = hist(Object.assign({}, p.n, { status: 'conferida', conferidoPor: p.k, conferidoEm: agora() }), p.k, 'conferida', '');
    await salvar(n); res.json({ success: true, nota: n });
  });

  /* Prévia do DANFE sem transmitir (sem valor fiscal). */
  app.post('/api/nfe/:id/previa', auth.exigirTokenSeAtiva, async (req, res) => {
    await pronto(); const d = db(), k = quemChat(req), n = achar(req.params.id);
    if (!n) return res.status(404).json({ success: false, message: 'NF-e não encontrada.' });
    if (!W.pode(d, k, 'nfe.emitir')) return res.status(403).json({ success: false, message: 'Só o Davi e o contador emitem NF-e.' });
    // Com pendência o XML sai incompleto e a Focus devolve um erro de esquema ilegível: mostra a pendência.
    if ((n.pendencias || []).length) return res.status(409).json({ success: false, pendencias: n.pendencias, message: 'Resolva antes da prévia: ' + n.pendencias.map(p => p.msg).join(' · ') });
    try {
      const r = await focus.previa(n.empresa, W.paraEnvio(n.payload));
      if (r.buffer) return res.type('application/pdf').send(r.buffer);
      res.status(422).json({ success: false, message: W.mensagemFocus(r.json) || `A Focus não gerou a prévia (${r.status}).` });
    } catch (e) { falha(res, e); }
  });

  /* ---------- Transmitir: um POST por referência, nunca dois ---------- */
  app.post('/api/nfe/:id/transmitir', auth.exigirTokenSeAtiva, async (req, res) => {
    await pronto(); const d = db(), k = quemChat(req); let n = achar(req.params.id);
    if (!n) return res.status(404).json({ success: false, message: 'NF-e não encontrada.' });
    if (!W.pode(d, k, 'nfe.emitir')) return res.status(403).json({ success: false, message: 'Só o Davi e o contador emitem NF-e.' });
    if (emUso.has(n._id)) return res.status(409).json({ success: false, message: 'Esta nota já está sendo transmitida.' });
    emUso.add(n._id);
    try {
      if (['enviada', 'autorizada', 'cancelada'].includes(n.status)) { n = await atualizar(n, k); return res.json({ success: true, jaEnviada: true, nota: n }); }
      const p = W.podeAcao(d, k, n, 'transmitir', focus.ambiente());
      if (!p.ok) return res.status(p.codigo).json({ success: false, message: p.msg });
      // Entrada da DUIMP: a versão do retrato tem de ser a vigente no Portal; se foi retificada, reimportar antes.
      if (n.cenario === 'A' && n.duimp && n.duimp.numero) {
        let vig;
        try { vig = (await portalUnico.versaoVigente(n.duimp.numero)).versao; }
        catch (e) { return res.status(502).json({ success: false, message: 'Não deu para conferir a versão da DUIMP no Portal Único (' + e.message + '). A nota não foi transmitida.' }); }
        if (String(vig) !== String(n.duimp.versao)) return res.status(409).json({ success: false, message: `A DUIMP ${n.duimp.numero} está na versão ${vig} no Portal e a nota foi montada da versão ${n.duimp.versao}. Reimporte a DUIMP antes de transmitir.` });
      }
      // A referência já existe na Focus (ex.: transmitida e a resposta se perdeu)? Consulta em vez de emitir.
      const c = await focus.consultar(n.empresa, n.ref);
      if (c.status === 200 && c.json && c.json.status && c.json.status !== 'erro_autorizacao') { n = await aplicar(hist(n, k, 'ja-existia', 'referência já registrada na Focus: consultada, não reenviada'), c.json, k); return res.json({ success: true, jaExistia: true, nota: n }); }
      const em = agora();
      n = hist(Object.assign({}, n, { status: 'enviada', transmitidoPor: k, transmitidoEm: em, mensagemSefaz: '' }), k, 'transmitida', `ambiente ${focus.ambiente()}`);
      await salvar(n);
      let r;
      try { r = await focus.emitir(n.empresa, n.ref, W.paraEnvio(n.payload, em)); }
      catch (e) { if (e.rede) return res.json({ success: true, nota: n, message: 'Sem resposta da Focus: a nota fica como enviada e o sistema consulta em seguida.' }); throw e; }
      const j = r.json || {};
      if (j.status) n = await aplicar(n, j, k);
      else if (['already_processed', 'pending_operation'].includes(j.codigo)) { const c2 = await focus.consultar(n.empresa, n.ref); n = await aplicar(n, c2.json || {}, k); }
      else if (r.status === 401 || j.codigo === 'permissao_negada') { n = hist(Object.assign({}, n, { status: 'conferida', mensagemSefaz: W.mensagemFocus(j) || 'A Focus recusou o token desta empresa.' }), 'Focus NFe', 'recusada', `HTTP ${r.status}`); await salvar(n); }
      else {
        // A referência já existia (rejeitada antes) e a Focus não aceitou reenviar com ela:
        // a próxima montagem gera referência nova, com o motivo no histórico.
        const queimou = c.status === 200;
        n = hist(Object.assign({}, n, { status: 'rejeitada', statusFocus: j.codigo || String(r.status), mensagemSefaz: W.mensagemFocus(j) || `A Focus recusou a nota (HTTP ${r.status}).`, rejeitadaEm: agora(), refQueimado: queimou || n.refQueimado }),
          'Focus NFe', 'retorno', (queimou ? 'reenvio com a mesma referência recusado · ' : '') + W.mensagemFocus(j));
        await salvar(n);
      }
      res.json({ success: n.status !== 'rejeitada', nota: n, message: n.status === 'rejeitada' ? n.mensagemSefaz : undefined });
    } catch (e) { falha(res, e); }
    finally { emUso.delete(req.params.id); }
  });

  app.get('/api/nfe/:id/status', auth.exigirTokenSeAtiva, async (req, res) => {
    const p = await pedido(req, res, 'ver', true); if (!p) return;
    try { res.json({ success: true, nota: await atualizar(p.n, p.k) }); } catch (e) { falha(res, e); }
  });

  app.post('/api/nfe/:id/cancelar', auth.exigirTokenSeAtiva, async (req, res) => {
    const p = await pedido(req, res, 'cancelar', true); if (!p) return;
    const just = String((req.body || {}).justificativa || '').trim();
    if (just.length < 15 || just.length > 255) return res.status(400).json({ success: false, message: 'A justificativa precisa ter de 15 a 255 caracteres.' });
    const horas = +W.configNFe(p.d).prazoCancelamentoHoras || 24;
    if (p.n.autorizadaEm && Date.now() - Date.parse(p.n.autorizadaEm) > horas * 3600 * 1000)
      return res.status(409).json({ success: false, message: `Passou o prazo de cancelamento (${horas} h depois da autorização). Fale com o contador: o caminho agora é outro (cancelamento extemporâneo na SEFAZ, devolução ou nota de ajuste).` });
    try {
      const r = await focus.cancelar(p.n.empresa, p.n.ref, just), j = r.json || {};
      if (j.status !== 'cancelado') { const n = hist(p.n, p.k, 'cancelamento-recusado', W.mensagemFocus(j)); await salvar(n); return res.status(422).json({ success: false, nota: n, message: W.mensagemFocus(j) || `Cancelamento recusado (HTTP ${r.status}).` }); }
      let n = hist(Object.assign({}, p.n, { canceladoPor: p.k, justificativaCancelamento: just }), p.k, 'cancelada', just);
      let xmlCanc = '';
      try { xmlCanc = await focus.guardar(n.empresa, j.caminho_xml_cancelamento, `NFe_${n.numero || n.ref}_cancelamento.xml`, 'application/xml'); } catch (e) { /* fica o caminho da Focus */ }
      n = await aplicar(Object.assign(n, { xmlCancelamentoLink: xmlCanc }), j, p.k);
      res.json({ success: true, nota: n });
    } catch (e) { falha(res, e); }
  });

  app.post('/api/nfe/:id/carta-correcao', auth.exigirTokenSeAtiva, async (req, res) => {
    const p = await pedido(req, res, 'carta', true); if (!p) return;
    const texto = String((req.body || {}).correcao || '').trim();
    if (texto.length < 15 || texto.length > 1000) return res.status(400).json({ success: false, message: 'A correção precisa ter de 15 a 1000 caracteres.' });
    if ((p.n.cartas || []).length >= 20) return res.status(409).json({ success: false, message: 'A SEFAZ aceita até 20 cartas de correção por nota.' });
    try {
      const r = await focus.cartaCorrecao(p.n.empresa, p.n.ref, texto), j = r.json || {};
      if (j.status !== 'autorizado') { const n = hist(p.n, p.k, 'carta-recusada', W.mensagemFocus(j)); await salvar(n); return res.status(422).json({ success: false, nota: n, message: W.mensagemFocus(j) || `Carta de correção recusada (HTTP ${r.status}).` }); }
      const seq = j.numero_carta_correcao || (p.n.cartas || []).length + 1, base = `NFe_${p.n.numero || p.n.ref}_CCe${seq}`;
      let xml = '', pdf = '';
      try { xml = await focus.guardar(p.n.empresa, j.caminho_xml_carta_correcao, base + '.xml', 'application/xml'); pdf = await focus.guardar(p.n.empresa, j.caminho_pdf_carta_correcao, base + '.pdf', 'application/pdf'); } catch (e) { /* tenta de novo na próxima consulta manual */ }
      const carta = { numero: seq, correcao: texto, em: agora(), por: p.k, mensagemSefaz: W.mensagemFocus(j), xmlLink: xml, pdfLink: pdf, caminhoXml: j.caminho_xml_carta_correcao || '', caminhoPdf: j.caminho_pdf_carta_correcao || '' };
      const n = hist(Object.assign({}, p.n, { cartas: (p.n.cartas || []).concat([carta]) }), p.k, 'carta-correcao', texto);
      await salvar(n); res.json({ success: true, nota: n });
    } catch (e) { falha(res, e); }
  });

  /* E-mail ao cliente pelo próprio serviço da Focus (XML + DANFE). */
  app.post('/api/nfe/:id/email', auth.exigirTokenSeAtiva, async (req, res) => {
    const p = await pedido(req, res, 'carta', true); if (!p) return;
    const emails = [].concat((req.body || {}).emails || []).map(e => String(e).trim()).filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)).slice(0, 10);
    if (!emails.length) return res.status(400).json({ success: false, message: 'Informe ao menos um e-mail válido.' });
    try {
      const r = await focus.enviarEmail(p.n.empresa, p.n.ref, emails);
      if (r.status !== 200) return res.status(422).json({ success: false, message: W.mensagemFocus(r.json) || `A Focus não agendou o e-mail (HTTP ${r.status}).` });
      const n = hist(p.n, p.k, 'email', emails.join(', ')); await salvar(n); res.json({ success: true, nota: n });
    } catch (e) { falha(res, e); }
  });

  /* ---------- Configuração (Davi) e cenários (diretoria edita; contador confere) ---------- */
  app.post('/api/nfe/config', auth.exigirTokenSeAtiva, async (req, res) => {
    await pronto(); const d = db(), k = quemChat(req);
    if (acesso.perfil(d, k) !== 'operacoes') return res.status(403).json({ success: false, message: 'Só o Davi altera a configuração da NF-e.' });
    const b = req.body || {}, atual = ((d.hubPainel || {})._nfeConfig) || {}, novo = Object.assign({}, atual);
    if (typeof b.conferenciaCruzada === 'boolean') novo.conferenciaCruzada = b.conferenciaCruzada;
    if (+b.prazoCancelamentoHoras > 0) novo.prazoCancelamentoHoras = Math.min(+b.prazoCancelamentoHoras, 24 * 30);
    if (b.aliquotasInternas && typeof b.aliquotasInternas === 'object') { novo.aliquotasInternas = {}; Object.entries(b.aliquotasInternas).forEach(([uf, v]) => { if (/^[A-Z]{2}$/.test(uf) && isFinite(+v) && v !== '') novo.aliquotasInternas[uf] = +v; }); }
    if (b.empresas && typeof b.empresas === 'object') { novo.empresas = Object.assign({}, atual.empresas); ['WindGate', 'JeT'].forEach(e => { if (b.empresas[e] && typeof b.empresas[e] === 'object') { const x = {}; Object.entries(b.empresas[e]).forEach(([c, v]) => { if (typeof v === 'string' || typeof v === 'number') x[c] = String(v).slice(0, 120); }); novo.empresas[e] = x; } }); }
    ['urfs', 'paises'].forEach(c => { if (b[c] && typeof b[c] === 'object') { novo[c] = {}; Object.entries(b[c]).forEach(([cod, v]) => { if (cod && v && typeof v === 'object') novo[c][String(cod).toUpperCase().slice(0, 10)] = { nome: String(v.nome || '').slice(0, 60), uf: String(v.uf || '').toUpperCase().slice(0, 2), codigo: String(v.codigo || '').replace(/\D/g, '').slice(0, 4) }; }); } });
    novo.alteradoPor = k; novo.alteradoEm = agora();
    await gravarParcial({ hubPainel: { _nfeConfig: novo } });
    res.json({ success: true, config: W.configNFe(db()) });
  });
  app.post('/api/nfe/cenarios', auth.exigirTokenSeAtiva, async (req, res) => {
    await pronto(); const d = db(), k = quemChat(req), b = req.body || {};
    const cen = W.CENARIOS_PADRAO.find(c => c.k === String(b.k || '').toUpperCase());
    if (!cen) return res.status(400).json({ success: false, message: 'Cenário desconhecido.' });
    const dir = acesso.perfil(d, k) === 'diretoria', emissor = W.pode(d, k, 'nfe.emitir');
    const todos = Object.assign({}, (d.hubPainel || {})._nfeCenarios), atual = Object.assign({}, todos[cen.k]);
    if (b.campos) {
      if (!dir) return res.status(403).json({ success: false, message: 'Só a diretoria edita os cenários fiscais.' });
      const campos = Object.assign({}, atual.campos);
      W.CAMPOS_CENARIO.forEach(([c, , tipo]) => { if (!(c in b.campos)) return; const v = b.campos[c]; campos[c] = tipo === 'b' ? (v === true || /^(sim|s|true|1)$/i.test(String(v).trim())) : v === '' || v == null ? (tipo === 'n' ? null : '') : tipo === 'n' ? (isFinite(+v) ? +v : null) : String(v).slice(0, 300); });
      // Mudou o cenário: a conferência anterior não vale para os valores novos.
      Object.assign(atual, { campos, editadoPor: k, editadoEm: agora(), conferido: null });
    }
    if (b.conferir) {
      if (!dir && !emissor) return res.status(403).json({ success: false, message: 'Só o contador, o Davi ou a diretoria marcam o cenário como conferido.' });
      atual.conferido = { por: k, em: agora(), obs: String(b.obs || '').slice(0, 300) };
    }
    if (b.desconferir && (dir || emissor)) atual.conferido = null;
    todos[cen.k] = atual;
    await gravarParcial({ hubPainel: { _nfeCenarios: todos } });
    res.json({ success: true, cenarios: W.cenarios(db()) });
  });

  /* ---------- DUIMP: retrato na operação e NF de entrada que nasce dele ---------- */
  /** Diferenças entre dois retratos (DUIMP retificada): o que mudou item a item. */
  function diferencasDuimp(antes, depois) {
    if (!antes) return [];
    const out = [], A = new Map((antes.itens || []).map(i => [i.numero, i])), B = new Map((depois.itens || []).map(i => [i.numero, i]));
    B.forEach((i, nItem) => { const a = A.get(nItem); if (!a) { out.push(`item ${nItem} novo (NCM ${i.ncm})`); return; }
      [['ncm', 'NCM'], ['quantidade', 'quantidade'], ['valorAduaneiroBRL', 'valor aduaneiro']].forEach(([c, l]) => { if (String(a[c]) !== String(i[c])) out.push(`item ${nItem}: ${l} ${a[c]} → ${i[c]}`); });
      ['ii', 'ipi', 'pis', 'cofins'].forEach(t => { const x = ((a.tributos || {})[t] || {}).devido, y = ((i.tributos || {})[t] || {}).devido; if (String(x) !== String(y)) out.push(`item ${nItem}: ${t.toUpperCase()} ${x} → ${y}`); }); });
    A.forEach((i, nItem) => { if (!B.has(nItem)) out.push(`item ${nItem} saiu da DUIMP`); });
    return out;
  }
  /** Depois de importar ou de atribuir itens: cria ou remonta a NF de entrada (nunca mexe em nota enviada/autorizada). */
  async function notaEntradaDoRetrato(d, num, k, motivo) {
    const n = notaDaDuimp(d, num), dono = (W.retratoDuimp(d, num).op || {}).id;
    if (n && ['enviada', 'autorizada'].includes(n.status)) return { nota: n, intocada: true };
    const entrada = n ? Object.assign(JSON.parse(JSON.stringify(n.entrada || {})), { opId: dono, duimpNumero: W.numDuimp(num) }) : W.sugerirEntrada(d, { cenario: 'A', opId: dono, duimpNumero: num });
    return { nota: await gravarMontagem(d, n, entrada, k, n ? 'remontada-da-duimp' : 'criada-da-duimp', motivo) };
  }

  app.post('/api/duimp/:op/importar', auth.exigirTokenSeAtiva, async (req, res) => {
    await pronto(); const d = db(), k = quemChat(req);
    if (!W.pode(d, k, 'nfe.emitir')) return res.status(403).json({ success: false, message: 'Só o Davi e o contador importam a DUIMP.' });
    const o = (d.ops || []).find(x => x && x.id === req.params.op);
    if (!o) return res.status(404).json({ success: false, message: 'Operação não encontrada.' });
    const num = W.numDuimp((req.body || {}).numero || o.duimp);
    if (num.length !== 15) return res.status(400).json({ success: false, message: 'Informe o número da DUIMP (15 caracteres, ex.: 26BR0000012345-6).' });
    if (!portalUnico.configurado() && !portalUnico.emTeste()) return res.json({ success: false, semIntegracao: true, message: 'Falta o certificado A1 no servidor (PORTAL_UNICO_CERT_ARQUIVO e PORTAL_UNICO_CERT_SENHA) e PORTAL_UNICO_AMBIENTE=producao.' });
    let novo;
    try { novo = await portalUnico.consultarDuimpCompleta(num); }
    catch (e) { return res.status(502).json({ success: false, message: 'Portal Único: ' + e.message }); }
    const d2 = db(), ant = W.retratoDuimp(d2, num), dono = ant ? ant.op : o;
    const anterior = ant ? ant.dados : null;
    // Operações que usam a DUIMP: as que já têm o número cadastrado e a que está importando.
    const usam = W.opsDaDuimp(d2, num).map(x => x.id); if (!usam.includes(o.id)) usam.push(o.id);
    const atrib = new Map(((anterior && anterior.itens) || []).map(i => [i.numero, i.op]));
    novo.itens.forEach(i => { i.op = usam.length === 1 ? usam[0] : (usam.includes(atrib.get(i.numero)) ? atrib.get(i.numero) : null); });
    const versaoMudou = !!anterior && String(anterior.versao) !== String(novo.versao), difs = diferencasDuimp(anterior, novo);
    const retrato = Object.assign({}, novo, { consultadoPor: k, historicoVersoes: ((anterior && anterior.historicoVersoes) || []).concat(anterior && versaoMudou ? [{ versao: anterior.versao, consultadoEm: anterior.consultadoEm, diferencas: difs.slice(0, 50) }] : []) });
    const gravar = [Object.assign(comId(dono), { duimpDados: retrato }, dono.duimp ? {} : { duimp: num })];
    if (o.id !== dono.id && !o.duimp) gravar.push(Object.assign(comId(o), { duimp: num }));   // só preenche o número que faltava; nada é sobrescrito
    await gravarParcial({ ops: gravar });
    const aviso = versaoMudou ? `DUIMP retificada: versão ${anterior.versao} → ${novo.versao}.` : '';
    const r = await notaEntradaDoRetrato(db(), num, k, `DUIMP ${num} versão ${novo.versao}${aviso ? ' · ' + aviso : ''}`);
    res.json({ success: true, numero: num, versao: novo.versao, itens: novo.itens.length, ops: usam, semOp: novo.itens.filter(i => !i.op).length, aviso, diferencas: difs,
      conferencia: usam.reduce((a, id) => a.concat(W.conferirDuimpCotacao(db(), id)), []), nota: r.nota,
      notaIntocada: r.intocada ? `A NF de entrada ${r.nota.ref} já foi ${r.nota.status === 'autorizada' ? 'autorizada' : 'enviada'} e não foi alterada.${versaoMudou || difs.length ? ' A DUIMP mudou depois da nota: avalie com o Pedro nota complementar ou carta de correção.' : ''}` : '' });
  });

  /* Uma DUIMP para várias operações: cada item diz de qual operação é. */
  app.post('/api/duimp/:numero/atribuir', auth.exigirTokenSeAtiva, async (req, res) => {
    await pronto(); const d = db(), k = quemChat(req);
    if (!W.pode(d, k, 'nfe.emitir')) return res.status(403).json({ success: false, message: 'Só o Davi e o contador atribuem os itens.' });
    const num = W.numDuimp(req.params.numero), ret = W.retratoDuimp(d, num);
    if (!ret) return res.status(404).json({ success: false, message: 'DUIMP não importada.' });
    const validas = W.opsDaDuimp(d, num).map(x => x.id), pedido = (req.body || {}).itens || {};
    const itens = ret.dados.itens.map(i => { const v = pedido[i.numero]; return v === undefined ? i : Object.assign({}, i, { op: v && validas.includes(v) ? v : null }); });
    await gravarParcial({ ops: [Object.assign(comId(ret.op), { duimpDados: Object.assign({}, ret.dados, { itens }) })] });
    const r = await notaEntradaDoRetrato(db(), num, k, 'itens atribuídos às operações');
    res.json({ success: true, semOp: itens.filter(i => !i.op).length, nota: r.nota, notaIntocada: !!r.intocada });
  });

  /* Retrato para a tela (inclusive para o contador, que não lê as operações). */
  app.get('/api/duimp/:numero', auth.exigirTokenSeAtiva, async (req, res) => {
    await pronto(); const d = db(), k = quemChat(req);
    if (!W.pode(d, k, 'nfe.ver')) return res.status(403).json({ success: false, message: 'Sem acesso.' });
    const num = W.numDuimp(req.params.numero), ret = W.retratoDuimp(d, num);
    if (!ret) return res.status(404).json({ success: false, message: 'DUIMP não importada.' });
    const ops = W.opsDaDuimp(d, num).map(x => ({ id: x.id, cliente: x.cliente || '', modalidade: x.modalidade || '' }));
    res.json({ success: true, retrato: ret.dados, dono: ret.op.id, ops, conferencia: ops.reduce((a, x) => a.concat(W.conferirDuimpCotacao(d, x.id)), []), nota: notaDaDuimp(d, num) });
  });

  /* ---------- Webhook da Focus: URL /api/webhooks/focus/<FOCUS_WEBHOOK_TOKEN> ---------- */
  const igual = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  app.post('/api/webhooks/focus/:token', async (req, res) => {
    const tk = process.env.FOCUS_WEBHOOK_TOKEN;
    if (!tk || !igual(req.params.token, tk)) return res.status(401).json({ success: false });
    await pronto();
    const ref = String((req.body || {}).ref || ''), n = ((db() || {}).hubNFe || []).find(x => x && x.ref === ref);
    if (!n) return res.json({ success: true, ignorado: true });
    try { const m = await atualizar(n, 'Focus · aviso'); res.json({ success: true, status: m.status }); }
    catch (e) { res.status(500).json({ success: false, message: e.message }); }   // 500: a Focus avisa de novo
  });

  /* ---------- Consulta de reserva: a cada 2 min, enquanto houver nota enviada ---------- */
  async function rodada() {
    const d = db(); if (!d) return 0; let n = 0;
    for (const x of (d.hubNFe || []).filter(x => x && (x.status === 'enviada' || (x.status === 'autorizada' && !x.arquivosSalvos)))) {
      if (emUso.has(x._id) || !focus.configurado(x.empresa) || x.ambiente !== focus.ambiente()) continue;
      try { await atualizar(x, 'Sistema · consulta'); n++; } catch (e) { console.warn('⚠️ NF-e: consulta de reserva falhou para', x.ref, '-', e.message); }
    }
    return n;
  }
  // Quem liga o relógio é o server.js, só quando o servidor sobe de verdade (não nos testes).
  return { rodada };
};
