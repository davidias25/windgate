/**
 * Hub como servidor MCP (Model Context Protocol), só leitura.
 * Permite perguntar ao Claude "qual o saldo da OP19?" ou "quais contêineres
 * entram em demurrage esta semana?" com os dados do Hub. Acesso por token
 * (WINDGATE_MCP_TOKEN, no Render). Nada é gravado por aqui.
 */
const VERSAO = '2025-06-18';
const FERRAMENTAS = [
  { name: 'operacoes_ativas', description: 'Lista as operações ativas com etapa, cliente, ETA e situação de prazo.', inputSchema: { type: 'object', properties: {} } },
  { name: 'resumo_operacao', description: 'Resumo de uma operação: etapa, contêineres, conta-corrente do cliente e custeio (previsto × projetado).', inputSchema: { type: 'object', properties: { op: { type: 'string', description: 'Código da operação, ex.: OP20' } }, required: ['op'] } },
  { name: 'conteineres_free_time', description: 'Contêineres com o free time vencendo ou já em demurrage.', inputSchema: { type: 'object', properties: {} } },
  { name: 'exposicao_cambio', description: 'Dólar a pagar sem câmbio fechado e impacto pela PTAX informada.', inputSchema: { type: 'object', properties: { ptax: { type: 'number' } } } },
  { name: 'contas_a_vencer', description: 'Contas a pagar e a receber nos próximos N dias.', inputSchema: { type: 'object', properties: { dias: { type: 'number' } } } }
];
function executar(nome, args, db, W, hoje) {
  const h = hoje || W.hojeISO();
  if (nome === 'operacoes_ativas') return (db.ops || []).filter(o => o && o.id && W.ativa(o)).map(o => ({ op: o.id, cliente: o.cliente, etapa: W.stMeta(o.status).l, eta: o.eta || null, prazo: W.prazoInfo(db, o, h).sit }));
  if (nome === 'resumo_operacao') { const id = String(args.op || '').toUpperCase(); const o = (db.ops || []).find(x => x && String(x.id).toUpperCase() === id); if (!o) return { erro: 'Operação não encontrada.' };
    const c = W.custeioOp(db, o.id), cc = W.contaCorrente(db, o.id, h);
    return { op: o.id, cliente: o.cliente, etapa: W.stMeta(o.status).l, eta: o.eta, modalidade: o.modalidade || '', conteineres: (o.containers || []).map(x => Object.assign({ numero: x.numero }, W.relogioConteiner(db, x, h))),
      contaCorrente: { recebido: cc.recebido, pago: cc.pago, saldo: cc.saldo, aReceber: cc.aReceber, aPagar: cc.aPagar }, custeio: { previsto: c.previsto, projetado: c.projetado, receita: c.receita, margemProjetada: c.margemProjetada, usdAberto: c.usdAberto } }; }
  if (nome === 'conteineres_free_time') return W.conteineres(db, h).filter(c => ['vencido', 'atencao'].includes(c.status)).map(c => ({ conteiner: c.c.numero, op: c.op, status: c.status, limite: c.limite, diasRestantes: c.restantes, custoUSD: c.custoUSD }));
  if (nome === 'exposicao_cambio') return W.exposicaoCambio(db, +args.ptax || null, h);
  if (nome === 'contas_a_vencer') { const ate = new Date(h + 'T12:00:00'); ate.setDate(ate.getDate() + (+args.dias || 7)); const lim = ate.toISOString().slice(0, 10);
    return (db.fin || []).filter(l => l && !W.realizado(l) && !W.transferencia(l) && W.vencDe(l) <= lim).map(l => ({ venc: W.vencDe(l), tipo: l.tipo, valor: +l.valor || 0, op: l.op || '', desc: l.desc || '' })).sort((a, b) => a.venc.localeCompare(b.venc)); }
  return { erro: 'Ferramenta desconhecida.' };
}
/** Trata uma mensagem JSON-RPC do protocolo MCP. Devolve null para notificações. */
function tratar(msg, db, W, hoje) {
  const id = msg && msg.id, r = res => ({ jsonrpc: '2.0', id, result: res }), e = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || !msg.method) return e(-32600, 'Requisição inválida');
  if (msg.method.startsWith('notifications/')) return null;
  if (msg.method === 'initialize') return r({ protocolVersion: VERSAO, capabilities: { tools: {} }, serverInfo: { name: 'windgate-hub', version: '2.0' } });
  if (msg.method === 'ping') return r({});
  if (msg.method === 'tools/list') return r({ tools: FERRAMENTAS });
  if (msg.method === 'tools/call') { const p = msg.params || {}; if (!FERRAMENTAS.some(f => f.name === p.name)) return e(-32602, 'Ferramenta desconhecida');
    const out = executar(p.name, p.arguments || {}, db, W, hoje); return r({ content: [{ type: 'text', text: JSON.stringify(out, null, 1) }], isError: !!(out && out.erro) }); }
  return e(-32601, 'Método não suportado');
}
module.exports = { tratar, FERRAMENTAS, executar };
