/**
 * Links de acesso externo, sem senha, por operação:
 *  - cliente: etapa, ETA, documentos liberados e conta-corrente (nunca custo interno nem margem);
 *  - fornecedor: o pedido, confirmação de produção/embarque e mensagens;
 *  - despachante: dados de desembaraço, contêineres e documentos da operação.
 * O link é assinado com o segredo do servidor e expira (padrão 60 dias).
 */
const crypto = require('crypto');
const segredo = () => (process.env.WINDGATE_DB_SECRET || 'dev') + ':portal';
const b64 = s => Buffer.from(s).toString('base64url');
const TIPOS = ['cliente', 'fornecedor', 'despachante'];

function gerar(op, tipo, dias, agora) {
  if (!TIPOS.includes(tipo)) throw new Error('Tipo de portal inválido.');
  const exp = Math.floor(((agora || Date.now()) + (dias || 60) * 864e5) / 1000);
  const corpo = b64(JSON.stringify({ op, tipo, exp }));
  const sig = crypto.createHmac('sha256', segredo()).update(corpo).digest('base64url').slice(0, 32);
  return corpo + '.' + sig;
}
function ler(t, agora) {
  const [corpo, sig] = String(t || '').split('.');
  if (!corpo || !sig) return null;
  const ok = crypto.createHmac('sha256', segredo()).update(corpo).digest('base64url').slice(0, 32);
  if (sig.length !== ok.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(ok))) return null;
  let d; try { d = JSON.parse(Buffer.from(corpo, 'base64url').toString()); } catch (e) { return null; }
  if (!d || !TIPOS.includes(d.tipo) || d.exp * 1000 < (agora || Date.now())) return null;
  return d;
}

/** O que cada portal enxerga. Nada de custo interno, margem ou outras operações. */
function dados(db, W, acesso, agora) {
  const o = (db.ops || []).find(x => x && x.id === acesso.op);
  if (!o) return null;
  const base = { op: o.id, nome: o.nome || '', etapa: W.stMeta(o.status).l, etapaK: o.status, fluxo: W.FLUXO.filter(k => !['concluida'].includes(k)).map(k => ({ k, l: W.stMeta(k).l })),
    origem: o.origemPorto || '', destino: o.destinoPorto || '', embarque: o.embarque || '', eta: o.eta || '', navio: o.navio || '',
    containers: (o.containers || []).filter(c => c && c.numero).map(c => ({ numero: c.numero, tipo: c.tipo || '' })),
    mensagens: (o.portalEventos || []).filter(e => e && (e.para === acesso.tipo || e.de === acesso.tipo)).slice(-30) };
  if (acesso.tipo === 'cliente') {
    const cc = W.contaCorrente(db, o.id);
    base.cliente = o.cliente || '';
    base.documentos = (db.docs || []).filter(d => d && d.op === o.id && d.liberadoCliente && d.link).map(d => ({ nome: d.nome || d.grupo, link: d.link, data: d.data || '' }));
    base.financeiro = { modalidade: cc.modalidade, parcelas: cc.movimentos.filter(m => m.entrada).map(m => ({ data: m.data, desc: m.desc, valor: m.entrada, pago: m.realizado })),
      recebido: cc.recebido, aReceber: cc.aReceber };
    if (cc.itemizado) Object.assign(base.financeiro, { despesas: cc.movimentos.filter(m => m.saida).map(m => ({ data: m.data, desc: m.desc, valor: m.saida, pago: m.realizado })), pago: cc.pago, saldo: cc.saldo, saldoFinal: cc.saldoFinal, situacao: cc.situacao });
  }
  if (acesso.tipo === 'fornecedor') { base.pedido = { produto: o.nome || '', incoterm: 'FOB', portoEmbarque: o.origemPorto || '', prontidao: o.prontidao || '', embarquePrevisto: o.embarque || '' }; delete base.destino; }
  if (acesso.tipo === 'despachante') {
    base.cliente = o.cliente || ''; base.modalidade = o.modalidade || ''; base.duimp = o.duimp || ''; base.canal = o.canal || '';
    base.documentos = (db.docs || []).filter(d => d && d.op === o.id && d.link).map(d => ({ nome: d.nome || d.grupo, link: d.link, status: d.status || '' }));
  }
  return base;
}
module.exports = { gerar, ler, dados, TIPOS };
