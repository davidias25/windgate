/**
 * Leitura assistida por IA (API do Claude): pedidos de cliente vindos do
 * WhatsApp/Instagram (texto ou print) e, depois, comprovantes e invoices.
 *
 * A chave fica só no servidor (variável ANTHROPIC_API_KEY no Render). Sem a
 * chave, a rota responde `semIA` e o navegador cai na leitura por regras —
 * nada quebra, só fica menos automático.
 */
const MODELO = () => process.env.WINDGATE_IA_MODELO || 'claude-sonnet-5-5';
const ativa = () => !!process.env.ANTHROPIC_API_KEY;

/** Tira o primeiro objeto JSON de uma resposta em texto. */
function extrairJSON(txt) {
  const s = String(txt || '');
  const ini = s.indexOf('{'), fim = s.lastIndexOf('}');
  if (ini < 0 || fim <= ini) throw new Error('A IA não devolveu dados estruturados.');
  return JSON.parse(s.slice(ini, fim + 1));
}

/** imagem: data URL (data:image/png;base64,...) */
function blocoImagem(imagem) {
  const m = /^data:(image\/(png|jpe?g|webp|gif));base64,(.+)$/i.exec(String(imagem || ''));
  if (!m) return null;
  return { type: 'image', source: { type: 'base64', media_type: m[1].toLowerCase().replace('jpg', 'jpeg'), data: m[3] } };
}

async function chamar(conteudo, sistema, fetchImpl) {
  const f = fetchImpl || fetch;
  const r = await f('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODELO(), max_tokens: 1200, system: sistema, messages: [{ role: 'user', content: conteudo }] })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || `IA indisponível (${r.status})`);
  return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}

const SISTEMA_PEDIDO = `Você lê pedidos de cotação que clientes mandam para a WindGate, uma trading de importação no Ceará (China → Brasil).
Responda SOMENTE com um objeto JSON, sem comentários, com estas chaves:
{"cliente": "empresa ou nome de quem pede", "contato": "pessoa, se aparecer", "telefone": "", "produto": "nome genérico do produto, sem marca",
 "quantidade": número ou null, "unidade": "un, kg, m, m², contêiner…", "especificacao": "medidas, material, espessura, voltagem…",
 "ncm_sugerido": "8 dígitos se tiver segurança, senão vazio", "prazo": "prazo pedido pelo cliente, se houver", "destino": "cidade/UF, se houver",
 "resumo": "uma frase do que o cliente quer", "duvidas": ["o que falta perguntar ao cliente"]}
Use o texto exatamente como o cliente escreveu. Não invente dados que não aparecem; deixe vazio.`;

async function lerPedido({ texto, imagem }, fetchImpl) {
  if (!ativa()) { const e = new Error('Leitura por IA desligada: falta a chave ANTHROPIC_API_KEY no servidor.'); e.semIA = true; throw e; }
  const conteudo = [];
  const img = blocoImagem(imagem);
  if (img) conteudo.push(img);
  conteudo.push({ type: 'text', text: (texto ? 'Mensagem do cliente:\n' + String(texto).slice(0, 8000) : 'O pedido está no print acima.') });
  const resp = await chamar(conteudo, SISTEMA_PEDIDO, fetchImpl);
  const d = extrairJSON(resp);
  return {
    cliente: String(d.cliente || ''), contato: String(d.contato || ''), telefone: String(d.telefone || ''),
    produto: String(d.produto || ''), quantidade: d.quantidade == null || d.quantidade === '' ? null : +d.quantidade || null,
    unidade: String(d.unidade || ''), especificacao: String(d.especificacao || ''), ncm: String(d.ncm_sugerido || '').replace(/\D/g, '').slice(0, 8),
    prazo: String(d.prazo || ''), destino: String(d.destino || ''), resumo: String(d.resumo || ''), duvidas: Array.isArray(d.duvidas) ? d.duvidas.map(String).slice(0, 6) : []
  };
}

module.exports = { ativa, lerPedido, extrairJSON, blocoImagem, MODELO };
