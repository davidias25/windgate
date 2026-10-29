/**
 * Fiscal & Contabilidade — notas fiscais que chegam sozinhas.
 *
 * Três portas de entrada, todas caindo em `hubNotas` do banco central:
 *  1. SEFAZ via Focus NFe (MDe): toda NF-e emitida contra o CNPJ da empresa.
 *  2. E-mail de notas: um serviço de e-mail encaminha os anexos para
 *     POST /api/fiscal/entrada (protegido por FISCAL_WEBHOOK_TOKEN).
 *  3. Envio manual no sistema (XML/PDF), feito pela equipe.
 * Nota repetida (mesma chave de 44 dígitos) não entra duas vezes.
 */
const crypto = require('crypto');

const W = require('../../public/hub/js/regras.js');
const lerXmlNFe = W.lerXmlNFe, classificar = W.classificarNota;
const soDig = x => String(x || '').replace(/\D/g, '');

function novaNota(dados, origem, por) {
  return Object.assign({ _id: 'nf-' + crypto.randomBytes(6).toString('hex'), status: 'recebida', origem, por: por || origem, em: new Date().toISOString(), xmlLink: '', pdfLink: '', obs: '' }, dados);
}

/** Junta notas novas sem repetir chave. Devolve só as que entraram. */
function semRepetidas(existentes, novas) {
  const vistas = new Set((existentes || []).map(n => n && n.chave).filter(Boolean));
  return novas.filter(n => { if (n.chave && vistas.has(n.chave)) return false; if (n.chave) vistas.add(n.chave); return true; });
}

/* ---------- Focus NFe: NF-e recebidas (MDe) ---------- */
const focusAtivo = () => !!(process.env.FOCUS_NFE_TOKEN || process.env.FOCUS_NFE_TOKEN_SF || process.env.FOCUS_NFE_TOKEN_JET);
/* `token` é o da empresa (FOCUS_NFE_TOKEN_SF/_JET); sem ele vale o FOCUS_NFE_TOKEN de sempre. */
async function buscarRecebidasFocus(cnpj, versao, fetchImpl, token) {
  const f = fetchImpl || fetch;
  const base = process.env.FOCUS_NFE_AMBIENTE === 'producao' ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br';
  const r = await f(`${base}/v2/nfes_recebidas?cnpj=${soDig(cnpj)}${versao ? '&versao=' + versao : ''}`, {
    headers: { Authorization: 'Basic ' + Buffer.from((token || process.env.FOCUS_NFE_TOKEN) + ':').toString('base64') } });
  if (!r.ok) throw new Error(`Focus NFe respondeu ${r.status}`);
  const lista = await r.json();
  return (Array.isArray(lista) ? lista : []).map(x => ({
    chave: soDig(x.chave_nfe || x.chave), numero: String(x.numero || ''), serie: String(x.serie || ''), data: String(x.data_emissao || '').slice(0, 10),
    emitente: x.nome_emitente || '', emitenteCnpj: soDig(x.documento_emitente || x.cnpj_emitente), destCnpj: soDig(cnpj), valor: +(x.valor_total || 0),
    situacaoSefaz: x.situacao || '', manifestacao: x.manifestacao_destinatario || '', versaoFocus: x.versao
  }));
}

module.exports = { lerXmlNFe, classificar, novaNota, semRepetidas, focusAtivo, buscarRecebidasFocus };
