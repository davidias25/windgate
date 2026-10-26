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

async function chamar(conteudo, sistema, fetchImpl, extra) {
  const f = fetchImpl || fetch;
  const r = await f('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(Object.assign({ model: MODELO(), max_tokens: 1200, system: sistema, messages: [{ role: 'user', content: conteudo }] }, extra || {}))
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

/** Uma chamada mínima para conferir se a chave e o crédito estão ok. */
async function testar(fetchImpl) {
  if (!ativa()) { const e = new Error('Falta a chave ANTHROPIC_API_KEY no servidor.'); e.semIA = true; throw e; }
  return (await chamar([{ type: 'text', text: 'Responda apenas: OK' }], 'Responda em uma palavra.', fetchImpl)).trim().slice(0, 40);
}


/* ---------- Sourcing: busca de fornecedores na web ----------
   Alibaba, Made-in-China e Global Sources não oferecem API de busca para
   compradores. A busca é feita pela ferramenta de pesquisa na web da própria
   API do Claude (US$ 10 por 1.000 pesquisas + tokens), com a resposta em
   dados estruturados. Regra da casa: preço FOB no porto mais próximo da
   fábrica e nenhuma marca concorrente no pedido de cotação. */
const SISTEMA_SOURCING = `Você é o comprador de uma trading de importação brasileira (WindGate, Fortaleza) e procura FÁBRICAS na China (ou Vietnã/Índia quando fizer sentido).
Pesquise em alibaba.com, made-in-china.com, globalsources.com, 1688.com e nos sites próprios de fabricantes. Prefira fabricantes (não traders), com anos de mercado e sinais de verificação.
Responda SOMENTE com JSON: {"fornecedores":[{"nome":"","plataforma":"alibaba|made-in-china|global-sources|1688|site próprio|outro","link":"","cidade":"","provincia":"",
"tipo":"fábrica|trading|não sabe","produtos":"","moq":"","precoIndicativo":"faixa em USD por unidade, só se aparecer","anos":"","sinais":["verificado","trade assurance","auditoria", ...],
"portoProximo":"porto marítimo mais próximo da fábrica","observacoes":""}],
"rfq_en":"pedido de cotação em inglês, curto e profissional: preço FOB no porto mais próximo da fábrica, MOQ, prazo de produção, especificações técnicas, embalagem, certificações; NUNCA cite marcas concorrentes, descreva só por características técnicas",
"dicas":["o que conferir antes de fechar"]}
Até 8 fornecedores, só com link real encontrado na pesquisa. Não invente dados: deixe vazio.`;
async function buscarFornecedores({ produto, especificacao, quantidade, destino }, fetchImpl) {
  if (!ativa()) { const e = new Error('Falta a chave ANTHROPIC_API_KEY no servidor.'); e.semIA = true; throw e; }
  const pedido = `Produto: ${produto}\nEspecificação: ${especificacao || '-'}\nQuantidade: ${quantidade || '-'}\nDestino: ${destino || 'Porto do Pecém, Ceará, Brasil'}`;
  const resp = await chamar([{ type: 'text', text: pedido }], SISTEMA_SOURCING, fetchImpl,
    { max_tokens: 4000, tools: [{ type: process.env.WINDGATE_IA_WEBSEARCH || 'web_search_20250305', name: 'web_search', max_uses: +(process.env.WINDGATE_IA_BUSCAS || 6) }] });
  const d = extrairJSON(resp);
  return { fornecedores: (Array.isArray(d.fornecedores) ? d.fornecedores : []).filter(f => f && f.nome && /^https?:\/\//.test(f.link || '')).slice(0, 8), rfq: String(d.rfq_en || ''), dicas: Array.isArray(d.dicas) ? d.dicas.map(String).slice(0, 6) : [] };
}

/* ---------- RH: leitura da equipe para a coordenadora ----------
   Recebe só indicadores agregados (sem financeiro nem salário) e as anotações
   das conversas individuais. Devolve pontos fortes, alertas e perguntas para
   a próxima conversa. Não é avaliação final: é apoio à conversa. */
const SISTEMA_RH = `Você apoia a coordenação de RH de uma trading pequena (WindGate). Recebe indicadores do mês por pessoa e anotações de conversas individuais.
Responda SOMENTE com JSON: {"equipe":"2 a 3 frases sobre o momento do time","pessoas":[{"nome":"","destaques":[""],"atencao":[""],"possiveisCausas":[""],"perguntas1a1":[""],"acaoSugerida":""}]}
Regras: baseie-se só nos dados enviados; diga quando o dado é pouco para concluir; tom respeitoso e construtivo; foque em desenvolvimento (treinar antes de cobrar); nada de diagnóstico de saúde ou vida pessoal.`;
async function analisarEquipe(dados, fetchImpl) {
  if (!ativa()) { const e = new Error('Falta a chave ANTHROPIC_API_KEY no servidor.'); e.semIA = true; throw e; }
  const resp = await chamar([{ type: 'text', text: JSON.stringify(dados).slice(0, 30000) }], SISTEMA_RH, fetchImpl, { max_tokens: 3000 });
  return extrairJSON(resp);
}


/* ---------- Conferência cruzada de documentos (invoice × packing list × BL × proforma) ----------
   Lê os PDFs/imagens da operação e confronta os campos entre eles. A IA aponta;
   quem aprova ou rejeita o documento continua sendo a pessoa (dupla conferência). */
const SISTEMA_DOCS = `Você confere documentos de importação de uma trading brasileira (WindGate). Recebe invoice, packing list, BL e/ou proforma da MESMA operação.
Responda SOMENTE com JSON: {"documentos":[{"arquivo":"","tipo":"invoice|packing list|BL|proforma|outro","numero":"","data":"","exportador":"","importador":"","consignatario":"","notify":"",
"incoterm":"","portoEmbarque":"","portoDestino":"","moeda":"","valorTotal":null,"quantidade":null,"unidade":"","pesoBruto":null,"pesoLiquido":null,"volumes":null,"ncm":[""],"containers":[""]}],
"divergencias":[{"campo":"","entre":["arquivo A","arquivo B"],"valores":["",""],"gravidade":"alta|media|baixa","explicacao":""}],
"alertas":[""]}
Regras: compare peso bruto e líquido, quantidade, volumes, valor, moeda, Incoterm, portos, NCM, contêineres e consignatário. Na importação por conta e ordem o consignatário/importador deve ser a importadora (SF Trading ou JeT) e o adquirente deve constar na invoice. Diga quando um campo não aparece. Não invente.`;
const MIME_OK = /^(application\/pdf|image\/(png|jpe?g|webp|gif))$/i;
async function conferirDocumentos(arquivos, contexto, fetchImpl) {
  if (!ativa()) { const e = new Error('Falta a chave ANTHROPIC_API_KEY no servidor.'); e.semIA = true; throw e; }
  const conteudo = [];
  (arquivos || []).slice(0, 6).forEach(a => {
    if (!a || !a.base64 || !MIME_OK.test(a.mime || '')) return;
    conteudo.push({ type: 'text', text: 'Arquivo: ' + (a.nome || 'documento') });
    conteudo.push(/pdf/i.test(a.mime) ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.base64 } } : { type: 'image', source: { type: 'base64', media_type: a.mime.toLowerCase().replace('jpg', 'jpeg'), data: a.base64 } });
  });
  if (!conteudo.length) throw new Error('Nenhum PDF ou imagem para conferir.');
  conteudo.push({ type: 'text', text: 'Contexto da operação: ' + JSON.stringify(contexto || {}).slice(0, 2000) });
  const d = extrairJSON(await chamar(conteudo, SISTEMA_DOCS, fetchImpl, { max_tokens: 4000 }));
  return { documentos: Array.isArray(d.documentos) ? d.documentos : [], divergencias: Array.isArray(d.divergencias) ? d.divergencias : [], alertas: Array.isArray(d.alertas) ? d.alertas.map(String) : [] };
}

module.exports = { ativa, testar, lerPedido, buscarFornecedores, analisarEquipe, conferirDocumentos, extrairJSON, blocoImagem, MODELO };
