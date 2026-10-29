/**
 * Portal Único Siscomex — situação da DUIMP sem abrir o portal.
 *
 * Autentica com o certificado A1 da empresa (arquivo .pfx guardado como
 * "Secret File" no Render, senha em variável de ambiente; NUNCA no código nem
 * no chat). Regras do Portal: o token vale 60 min e é renovado a cada chamada;
 * autenticar de novo em menos de 60 s é recusado — por isso o token é
 * reaproveitado. Consultas de DUIMP: até 1.000 por hora.
 *
 * Caminhos configuráveis por variável de ambiente para ajustar sem mexer no
 * código depois do teste no ambiente de validação.
 */
const fs = require('fs');
const https = require('https');

const cfg = () => ({
  ambiente: process.env.PORTAL_UNICO_AMBIENTE || 'validacao',
  base: process.env.PORTAL_UNICO_BASE || ((process.env.PORTAL_UNICO_AMBIENTE || 'validacao') === 'producao' ? 'https://portalunico.siscomex.gov.br' : 'https://val.portalunico.siscomex.gov.br'),
  certArquivo: process.env.PORTAL_UNICO_CERT_ARQUIVO || '',
  certSenha: process.env.PORTAL_UNICO_CERT_SENHA || '',
  perfil: process.env.PORTAL_UNICO_PERFIL || 'IMPEXP',
  caminhoAuth: process.env.PORTAL_UNICO_PATH_AUTH || '/portal/api/autenticar',
  caminhoDuimp: process.env.PORTAL_UNICO_PATH_DUIMP || '/duimp-api/api/ext/duimp/{numero}/{versao}'
});
const configurado = () => { const c = cfg(); return !!(c.certArquivo && c.certSenha && fs.existsSync(c.certArquivo)); };

let sessao = null, ultimaAuth = 0;

function requisicaoPadrao(url, opcoes, corpo) {
  return new Promise((resolve, reject) => {
    const r = https.request(url, opcoes, res => {
      const partes = []; res.on('data', d => partes.push(d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, corpo: Buffer.concat(partes).toString('utf8') }));
    });
    r.on('error', reject); r.setTimeout(30000, () => r.destroy(new Error('Portal Único não respondeu em 30 s')));
    if (corpo) r.write(corpo); r.end();
  });
}

function agente(c) { return new https.Agent({ pfx: fs.readFileSync(c.certArquivo), passphrase: c.certSenha }); }

async function autenticar(req) {
  const c = cfg(), enviar = req || requisicaoPadrao;
  if (sessao && Date.now() < sessao.expira) return sessao;
  if (Date.now() - ultimaAuth < 61000) throw new Error('Autenticação recente: o Portal exige 60 s entre autenticações. Tente em instantes.');
  ultimaAuth = Date.now();
  const r = await enviar(c.base + c.caminhoAuth, { method: 'POST', agent: req ? undefined : agente(c), headers: { 'Role-Type': c.perfil } });
  if (r.status >= 300) throw new Error(`Portal Único recusou a autenticação (${r.status}). Confira o certificado e o perfil ${c.perfil}.`);
  const token = r.headers['set-token'], csrf = r.headers['x-csrf-token'];
  if (!token || !csrf) throw new Error('Portal Único não devolveu os tokens de sessão.');
  sessao = { token, csrf, expira: Date.now() + 55 * 60 * 1000 };
  return sessao;
}

/** Lê a situação de uma DUIMP: devolve os campos que interessam e a resposta completa. */
async function consultarDuimp(numero, versao, req) {
  const c = cfg(), enviar = req || requisicaoPadrao;
  const s = await autenticar(req);
  const url = c.base + c.caminhoDuimp.replace('{numero}', encodeURIComponent(numero)).replace('{versao}', encodeURIComponent(versao || '1'));
  const r = await enviar(url, { method: 'GET', agent: req ? undefined : agente(c), headers: { Authorization: s.token, 'X-CSRF-Token': s.csrf, Accept: 'application/json' } });
  if (r.headers && r.headers['x-csrf-token']) { s.csrf = r.headers['x-csrf-token']; s.expira = Date.now() + 55 * 60 * 1000; }
  if (r.status === 401 || r.status === 403) { sessao = null; throw new Error('Sessão do Portal Único expirada ou sem permissão para esta DUIMP.'); }
  if (r.status >= 300) throw new Error(`Portal Único respondeu ${r.status} para a DUIMP ${numero}.`);
  let j = {}; try { j = JSON.parse(r.corpo); } catch (e) {}
  return resumirDuimp(j);
}

/** Procura, em qualquer nível da resposta, os campos de situação, canal e datas. */
function resumirDuimp(j) {
  const achar = (o, re, prof) => {
    if (!o || typeof o !== 'object' || prof > 6) return null;
    for (const [k, v] of Object.entries(o)) {
      if (re.test(k) && (typeof v === 'string' || typeof v === 'number')) return v;
      if (re.test(k) && v && typeof v === 'object' && (v.descricao || v.codigo)) return v.descricao || v.codigo;
    }
    for (const v of Object.values(o)) { const r = achar(v, re, prof + 1); if (r != null) return r; }
    return null;
  };
  return {
    situacao: achar(j, /^situa[cç][aã]o(Duimp|Despacho)?$/i, 0) || achar(j, /situacao/i, 0),
    canal: achar(j, /canal/i, 0),
    desembaraco: achar(j, /desembara/i, 0),
    registro: achar(j, /dataRegistro|registro/i, 0),
    atualizadoEm: new Date().toISOString(),
    bruto: j
  };
}

/* =====================================================================
   Leitura completa da DUIMP para a NF-e de entrada (só consulta: nada é
   registrado nem retificado daqui).

   Endpoints conferidos na especificação oficial (OpenAPI "Declaração Única de
   Importação - Intervenientes Privados" 75.2.0, basePath /duimp-api/api/ext, e
   "Catálogo de Produtos" 1.0.0, basePath /catp/api):
     GET /duimp/{numero}/versoes                      versão vigente
     GET /duimp/{numero}/{versao}                     dados gerais
     GET /duimp/{numero}/{versao}/itens?inicial&tamanho   itens completos (até 100 por página)
     GET /ext/operador-estrangeiro?cpfCnpjRaiz&codigo     exportador e fabricante
   A lista de itens já traz o item inteiro (mesmo esquema do item detalhado),
   por isso não há uma chamada por item.
   ===================================================================== */
const P = {
  versoes: () => process.env.PORTAL_UNICO_PATH_VERSOES || '/duimp-api/api/ext/duimp/{numero}/versoes',
  itens: () => process.env.PORTAL_UNICO_PATH_ITENS || '/duimp-api/api/ext/duimp/{numero}/{versao}/itens',
  operador: () => process.env.PORTAL_UNICO_PATH_OPERADOR || '/catp/api/ext/operador-estrangeiro'
};
let requisicaoTeste = null;
const _usarRequisicao = fn => { requisicaoTeste = fn; sessao = null; ultimaAuth = 0; };
const enc = encodeURIComponent;
const espera = ms => new Promise(r => setTimeout(r, ms));

/** GET autenticado com repetição em 429/5xx (o Portal limita a 1.000 consultas/hora). */
async function getJson(caminho, opts) {
  const c = cfg(), enviar = (opts && opts.req) || requisicaoTeste || requisicaoPadrao, teste = !!((opts && opts.req) || requisicaoTeste);
  const pausa = opts && opts.pausaMs != null ? opts.pausaMs : 2000;
  for (let tentativa = 1; ; tentativa++) {
    const s = await autenticar(teste ? enviar : undefined);
    const r = await enviar(c.base + caminho, { method: 'GET', agent: teste ? undefined : agente(c), headers: { Authorization: s.token, 'X-CSRF-Token': s.csrf, Accept: 'application/json' } });
    if (r.headers && r.headers['x-csrf-token']) { s.csrf = r.headers['x-csrf-token']; s.expira = Date.now() + 55 * 60 * 1000; }
    if (r.status === 401) { sessao = null; throw new Error('Sessão do Portal Único expirada. Tente de novo em 1 minuto.'); }
    if (r.status === 403) throw new Error('O certificado não tem permissão de importador para esta consulta no Portal Único.');
    if (r.status === 404) { const e = new Error('Não encontrado no Portal Único: ' + caminho.split('?')[0]); e.naoEncontrado = true; throw e; }
    if ((r.status === 429 || r.status >= 500) && tentativa < 4) { await espera(pausa * tentativa); continue; }
    if (r.status >= 300) throw new Error(`Portal Único respondeu ${r.status}.`);
    try { return JSON.parse(r.corpo || 'null'); } catch (e) { throw new Error('Resposta do Portal Único em formato inesperado.'); }
  }
}

/** Versão vigente (a última registrada) — nunca a 1 por suposição. */
async function versaoVigente(numero, opts) {
  const j = await getJson(P.versoes().replace('{numero}', enc(numero)), opts);
  const v = j && (j.versao != null ? j.versao : j.versaoVigente);
  if (v == null) throw new Error('O Portal Único não informou a versão vigente da DUIMP.');
  return { versao: String(v), dataRegistro: (j && j.dataRegistro) || '' };
}

const cacheOperadores = new Map();   // "raiz|codigo" → { dados, em }
async function operadorEstrangeiro(cnpjRaiz, codigo, opts) {
  const chave = cnpjRaiz + '|' + codigo, c = cacheOperadores.get(chave);
  if (c && Date.now() - c.em < 6 * 3600 * 1000) return c.dados;
  let lista = [];
  try { lista = await getJson(`${P.operador()}?cpfCnpjRaiz=${enc(cnpjRaiz)}&codigo=${enc(codigo)}`, opts); }
  catch (e) { if (!e.naoEncontrado) throw e; }
  const arr = Array.isArray(lista) ? lista : (lista ? [lista] : []);
  const dados = arr.find(o => o && String(o.codigo) === String(codigo) && o.situacao !== 'DESATIVADO') || arr.find(o => o && String(o.codigo) === String(codigo)) || null;
  cacheOperadores.set(chave, { dados, em: Date.now() });
  return dados;
}

/**
 * DUIMP inteira, normalizada: versão vigente → dados gerais → itens (páginas
 * de 100) → exportadores e fabricantes do Catálogo (um por código, com cache).
 */
async function consultarDuimpCompleta(numero, opts) {
  const o = opts || {};
  const num = String(numero || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (num.length !== 15) throw new Error(`Número de DUIMP inválido (${numero}): são 15 caracteres, formato AABRSSSSSSSSSSD.`);
  const vig = await versaoVigente(num, o);
  const caminhoGeral = cfg().caminhoDuimp.replace('{numero}', enc(num)).replace('{versao}', enc(vig.versao));
  const geral = await getJson(caminhoGeral, o);
  const total = +(geral && geral.quantidadeItens) || 0;
  const itens = [];
  for (let inicial = 1; ; inicial += 100) {
    const pag = await getJson(`${P.itens().replace('{numero}', enc(num)).replace('{versao}', enc(vig.versao))}?inicial=${inicial}&tamanho=100`, o);
    const lista = Array.isArray(pag) ? pag : [];
    itens.push(...lista);
    if (lista.length < 100 || (total && itens.length >= total)) break;
  }
  const raiz = String((geral && geral.identificacao && geral.identificacao.importador && geral.identificacao.importador.ni) || o.cnpjImportador || '').replace(/\D/g, '').slice(0, 8);
  const codigos = new Set();
  itens.forEach(it => { if (it && it.exportador && it.exportador.codigo) codigos.add(String(it.exportador.codigo)); if (it && it.fabricante && it.fabricante.codigo) codigos.add(String(it.fabricante.codigo)); });
  const operadores = {};
  // Concorrência baixa: o limite do Portal é por hora, e são poucos códigos por DUIMP.
  const fila = [...codigos];
  await Promise.all(Array.from({ length: Math.min(3, fila.length) }, async () => { while (fila.length) { const cod = fila.shift(); operadores[cod] = raiz ? await operadorEstrangeiro(raiz, cod, o) : null; } }));
  return normalizarDuimp(geral, itens, operadores, { versao: vig.versao, consultadoEm: o.agora || new Date().toISOString() });
}

/* ---------- Mapeamento: nomes do Portal → objeto do Hub (só esta função muda se o Portal mudar) ---------- */
const TRIB = { II: 'ii', IPI: 'ipi', PIS: 'pis', COFINS: 'cofins', CBS: 'cbs', IBS_ESTADUAL: 'ibsUf', IBS_MUNICIPAL: 'ibsMun', SALVAGUARDA: 'salvaguarda', ANTIDUMPING: 'antidumping', MEDIDAS_COMPENSATORIAS: 'compensatorias', CIDE: 'cide' };
const n2 = v => (v == null || v === '' || !isFinite(+v) ? null : +v);
function normalizarOperador(cod, d) {
  if (!cod) return null;
  return { codigo: String(cod), nome: (d && d.nome) || '', pais: (d && d.codigoPais) || '', endereco: d ? [d.logradouro, d.nomeCidade, d.codigoSubdivisaoPais, d.cep].filter(Boolean).join(', ') : '',
    logradouro: (d && d.logradouro) || '', cidade: (d && d.nomeCidade) || '', cep: (d && d.cep) || '', tin: (d && d.tin) || '', noCatalogo: !!d };
}
function tributosDe(lista) {
  const out = {};
  (Array.isArray(lista) ? lista : []).forEach(t => {
    const k = TRIB[t && t.tipo]; if (!k) return;
    const v = t.valoresBRL || {}, m = t.memoriaCalculo || {};
    const aliq = n2(m.valorAliquotaReduzida) != null && n2(m.valorAliquotaReduzida) > 0 ? n2(m.valorAliquotaReduzida) : n2(m.valorAliquota);
    out[k] = { base: n2(m.baseCalculoReduzidaBRL) || n2(m.baseCalculoBRL), aliquota: aliq, tipoAliquota: m.tipoAliquota || '', calculado: n2(v.calculado), devido: n2(v.devido), aRecolher: n2(v.aRecolher), suspenso: n2(v.suspenso), aReduzir: n2(v.aReduzir) };
  });
  return out;
}
const INTERMEDIO = { IMPORTACAO_DIRETA: 'propria', IMPORTACAO_POR_CONTA_E_ORDEM: 'conta e ordem', IMPORTACAO_POR_ENCOMENDA: 'encomenda' };
function normalizarDuimp(geral, itensBrutos, operadores, extra) {
  const g = geral || {}, id = g.identificacao || {}, carga = g.carga || {}, ops = operadores || {}, x = extra || {};
  const itens = (Array.isArray(itensBrutos) ? itensBrutos : []).filter(it => it && (it.status || 'ATIVO') !== 'INATIVO').map(it => {
    const m = it.mercadoria || {}, cv = it.condicaoVenda || {}, tm = (it.tributos && it.tributos.mercadoria) || {}, car = it.caracterizacaoImportacao || {};
    return {
      numero: +((it.identificacao && it.identificacao.numeroItem) || 0), ncm: String((it.produto && it.produto.ncm) || '').replace(/\D/g, ''), produtoCodigo: it.produto && it.produto.codigo != null ? String(it.produto.codigo) : '',
      descricao: m.descricao || '', quantidade: n2(m.quantidadeComercial), unidadeComercial: m.unidadeComercial || '', quantidadeEstatistica: n2(m.quantidadeMedidaEstatistica), unidadeEstatistica: m.unidadeMedidaEstatistica || '',
      pesoLiquido: n2(m.pesoLiquido), moeda: (m.moedaNegociada && m.moedaNegociada.codigo) || '', valorUnitarioMoeda: n2(m.valorUnitarioMoedaNegociada),
      valorMercadoriaMoeda: n2(cv.valorMoedaNegociada), valorMercadoriaBRL: n2(cv.valorBRL), valorAduaneiroBRL: n2(tm.valorAduaneiroBRL), valorLocalEmbarqueBRL: n2(tm.valorLocalEmbarqueBRL),
      incoterm: (cv.incoterm && cv.incoterm.codigo) || '', freteBRL: n2(cv.frete && cv.frete.valorBRL), seguroBRL: n2(cv.seguro && cv.seguro.valorBRL),
      taxaSiscomex: n2(tm.taxaUtilizacao), afrmm: n2(tm.afrmm), tum: n2(tm.tum),
      intermedio: { modalidade: INTERMEDIO[car.indicador] || '', indicador: car.indicador || '', cnpj: String(car.ni || '').replace(/\D/g, '') },
      exportador: normalizarOperador(it.exportador && it.exportador.codigo, ops[it.exportador && it.exportador.codigo]),
      fabricante: normalizarOperador(it.fabricante && it.fabricante.codigo, ops[it.fabricante && it.fabricante.codigo]),
      relacaoExportadorFabricante: (it.indicadorExportadorFabricante && it.indicadorExportadorFabricante.codigo) || '',
      tributos: tributosDe(it.tributos && it.tributos.tributosCalculados), op: null
    };
  }).sort((a, b) => a.numero - b.numero);
  const soma = k => itens.reduce((a, i) => a + (+i[k] || 0), 0);
  const brl = itens.reduce((a, i) => a + (+i.valorMercadoriaBRL || 0), 0), moeda = itens.reduce((a, i) => a + (+i.valorMercadoriaMoeda || 0), 0);
  const terceiro = itens.find(i => i.intermedio.cnpj) || null;
  const tipoCarga = carga.tipoIdentificacaoCarga || '';
  return {
    versao: String(x.versao || id.versao || ''), consultadoEm: x.consultadoEm || '',
    geral: {
      numero: String(id.numero || '').toUpperCase(), versao: String(x.versao || id.versao || ''), dataRegistro: id.dataRegistro || '', dataDesembaraco: '',
      situacao: (g.situacao && g.situacao.situacaoDuimp) || '', canal: (g.resultadoAnaliseRisco && g.resultadoAnaliseRisco.canalConsolidado) || '',
      unidadeDespacho: (carga.unidadeDeclarada && carga.unidadeDeclarada.codigo) || '', localDesembaraco: '', ufDesembaraco: '',
      // CE (Conhecimento Eletrônico do Mercante) = transporte marítimo (via 1 da NF-e); outro tipo fica para conferir.
      tipoIdentificacaoCarga: tipoCarga, identificacaoCarga: carga.identificacao || '', viaTransporte: tipoCarga === 'CE' ? 1 : null,
      paisProcedencia: (carga.paisProcedencia && carga.paisProcedencia.codigo) || '',
      importador: { cnpj: String((id.importador && id.importador.ni) || '').replace(/\D/g, '') },
      adquirenteOuEncomendante: terceiro ? { cnpj: terceiro.intermedio.cnpj, modalidade: terceiro.intermedio.modalidade, uf: '' } : null,
      taxaSiscomex: +soma('taxaSiscomex').toFixed(2), afrmm: +soma('afrmm').toFixed(2), moeda: (itens[0] && itens[0].moeda) || '', taxaCambio: moeda > 0 ? +(brl / moeda).toFixed(6) : null,
      valorAduaneiroBRL: +soma('valorAduaneiroBRL').toFixed(2), informacaoComplementar: id.informacaoComplementar || '', quantidadeItens: +g.quantidadeItens || itens.length,
      totais: tributosDe(g.tributos && g.tributos.tributosCalculados), adicoes: (Array.isArray(g.adicoes) ? g.adicoes : []).map(a => ({ numero: +a.numero || 0, itens: a.itens }))
    },
    itens
  };
}

/* Nos testes o Portal é simulado (_usarRequisicao): conta como configurado, sem certificado. */
const emTeste = () => !!requisicaoTeste;

module.exports = { cfg, configurado, emTeste, autenticar, consultarDuimp, resumirDuimp, versaoVigente, consultarDuimpCompleta, operadorEstrangeiro, normalizarDuimp, getJson, _usarRequisicao,
  _reset: () => { sessao = null; ultimaAuth = 0; cacheOperadores.clear(); } };
