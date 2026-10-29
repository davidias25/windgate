/**
 * Focus NFe — emissão, consulta, cancelamento, carta de correção, prévia do
 * DANFE e e-mail. Um token por empresa (FOCUS_NFE_TOKEN_SF, FOCUS_NFE_TOKEN_JET,
 * com FOCUS_NFE_TOKEN de reserva) e o ambiente em FOCUS_NFE_AMBIENTE.
 *
 * O ambiente sai SÓ da variável: não existe parâmetro de tela que mande uma
 * nota para produção enquanto o servidor está em homologação. O token nunca
 * entra em mensagem de erro, log ou resposta.
 */
const BASES = { producao: 'https://api.focusnfe.com.br', homologacao: 'https://homologacao.focusnfe.com.br' };
const ambiente = () => process.env.FOCUS_NFE_AMBIENTE === 'producao' ? 'producao' : 'homologacao';
const base = () => BASES[ambiente()];
const tokenDe = emp => (emp === 'JeT' ? process.env.FOCUS_NFE_TOKEN_JET : process.env.FOCUS_NFE_TOKEN_SF) || process.env.FOCUS_NFE_TOKEN || '';
const configurado = emp => !!tokenDe(emp);

/* Os testes trocam o fetch e o armazenamento; ninguém chama a Focus de verdade. */
let fetchImpl = null, armazenar = null;
const _usarFetch = fn => { fetchImpl = fn; };
const _usarArmazenamento = fn => { armazenar = fn; };
const f = () => fetchImpl || fetch;

function erroSemToken(emp) { const e = new Error(`Falta o token da Focus NFe da ${emp === 'JeT' ? 'JeT' : 'SF'} no Render (FOCUS_NFE_TOKEN_${emp === 'JeT' ? 'JET' : 'SF'}).`); e.semIntegracao = true; return e; }
const cabecalho = emp => ({ Authorization: 'Basic ' + Buffer.from(tokenDe(emp) + ':').toString('base64') });

/** Chamada à Focus. Devolve { status, json } (ou { status, buffer } quando binário). */
async function chamar(emp, metodo, caminho, corpo, binario) {
  if (!configurado(emp)) throw erroSemToken(emp);
  const o = { method: metodo, headers: cabecalho(emp) };
  if (corpo !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(corpo); }
  let r;
  try { r = await f()(base() + caminho, o); }
  catch (e) { const x = new Error('Focus NFe fora do ar ou sem conexão: ' + e.message); x.rede = true; throw x; }
  if (binario && r.ok) return { status: r.status, buffer: Buffer.from(await r.arrayBuffer()), tipo: (r.headers && r.headers.get && r.headers.get('content-type')) || '' };
  let json = null; const texto = await r.text().catch(() => '');
  try { json = texto ? JSON.parse(texto) : null; } catch (e) { json = { mensagem: r.status === 401 ? 'Token recusado pela Focus NFe (confira a variável no Render).' : texto.slice(0, 300) }; }
  return { status: r.status, json: json || {} };
}

const enc = encodeURIComponent;
const emitir = (emp, ref, payload) => chamar(emp, 'POST', `/v2/nfe?ref=${enc(ref)}`, payload);
const consultar = (emp, ref) => chamar(emp, 'GET', `/v2/nfe/${enc(ref)}?completa=1`);
const cancelar = (emp, ref, justificativa) => chamar(emp, 'DELETE', `/v2/nfe/${enc(ref)}`, { justificativa });
const cartaCorrecao = (emp, ref, correcao) => chamar(emp, 'POST', `/v2/nfe/${enc(ref)}/carta_correcao`, { correcao });
const enviarEmail = (emp, ref, emails) => chamar(emp, 'POST', `/v2/nfe/${enc(ref)}/email`, { emails });
const previa = (emp, payload) => chamar(emp, 'POST', '/v2/nfe/danfe', payload, true);

/** Baixa um arquivo da Focus (os caminhos vêm relativos: /arquivos/...). */
async function baixar(emp, caminho) {
  if (!caminho) return null;
  const url = /^https?:\/\//.test(caminho) ? caminho : base() + caminho;
  const daFocus = url.startsWith(base());
  const r = await f()(url, { method: 'GET', headers: daFocus ? cabecalho(emp) : {} });
  if (!r.ok) throw new Error(`Focus NFe não entregou o arquivo (${r.status}).`);
  return Buffer.from(await r.arrayBuffer());
}
/** Guarda o arquivo no Storage e devolve o link. Sem armazenamento, fica o link da Focus. */
async function guardar(emp, caminho, nome, mime) {
  if (!caminho) return '';
  const buf = await baixar(emp, caminho);
  if (!armazenar) return '';
  return (await armazenar(nome, buf, mime)) || '';
}

module.exports = { BASES, ambiente, base, tokenDe, configurado, emitir, consultar, cancelar, cartaCorrecao, enviarEmail, previa, baixar, guardar, _usarFetch, _usarArmazenamento };
