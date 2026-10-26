/**
 * Extrato automático pelas APIs oficiais dos bancos (sem raspar o Internet
 * Banking: foi isso que quebrou a integração do Itaú em outros ERPs em 2026).
 *
 * Santander Empresas (SF): API de Saldo e Extrato, adesão no portal do
 * desenvolvedor, OAuth client_credentials com mTLS (certificado A1 da empresa).
 * Itaú Empresas (JeT): client_id pelo gerente + certificado dinâmico do Itaú;
 * o endereço do extrato vem na liberação (ITAU_EXTRATO_URL).
 *
 * Tudo em variáveis do Render; o certificado é um Secret File:
 *   SANTANDER_CLIENT_ID, SANTANDER_CLIENT_SECRET, SANTANDER_CERT_ARQUIVO, SANTANDER_CERT_SENHA,
 *   SANTANDER_CONTA (agência.conta, ex.: 0001.000130001234), SANTANDER_API_URL (opcional)
 *   ITAU_CLIENT_ID, ITAU_CLIENT_SECRET, ITAU_CERT_ARQUIVO, ITAU_CERT_SENHA, ITAU_EXTRATO_URL, ITAU_TOKEN_URL (opcional)
 * Os endereços padrão seguem a documentação pública; confirmar na liberação.
 */
const fs = require('fs');
const https = require('https');

const BANCOS = {
  santander: { nome: 'Santander', empresa: 'WindGate', cnpjBanco: '90400888000142',
    base: () => (process.env.SANTANDER_API_URL || 'https://trust-open.api.santander.com.br').replace(/\/$/, ''),
    token: () => (process.env.SANTANDER_TOKEN_URL || 'https://trust-open.api.santander.com.br/auth/oauth/v2/token') },
  itau: { nome: 'Itaú', empresa: 'JeT',
    token: () => (process.env.ITAU_TOKEN_URL || 'https://sts.itau.com.br/api/oauth/token') }
};
const P = b => b.toUpperCase();
const configurado = b => !!(process.env[P(b) + '_CLIENT_ID'] && process.env[P(b) + '_CLIENT_SECRET'] && process.env[P(b) + '_CERT_ARQUIVO'] && (b !== 'itau' || process.env.ITAU_EXTRATO_URL));

function agente(b) {
  const arq = process.env[P(b) + '_CERT_ARQUIVO'];
  return new https.Agent({ pfx: fs.readFileSync(arq), passphrase: process.env[P(b) + '_CERT_SENHA'] || '' });
}
function pedir(url, { method = 'GET', headers = {}, body = null, agent }) {
  return new Promise((ok, falha) => {
    const u = new URL(url);
    const r = https.request({ hostname: u.hostname, path: u.pathname + u.search, method, headers, agent, timeout: 30000 }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (e) {} ok({ status: res.statusCode, json: j, texto: d }); });
    });
    r.on('error', falha); r.on('timeout', () => r.destroy(new Error('tempo esgotado')));
    if (body) r.write(body); r.end();
  });
}
async function token(b, req) {
  const corpo = new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env[P(b) + '_CLIENT_ID'], client_secret: process.env[P(b) + '_CLIENT_SECRET'] }).toString();
  const r = await req(BANCOS[b].token(), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': Buffer.byteLength(corpo) }, body: corpo, agent: req === pedir ? agente(b) : undefined });
  if (r.status >= 300 || !r.json || !r.json.access_token) throw new Error(`${BANCOS[b].nome}: autenticação recusada (${r.status})`);
  return r.json.access_token;
}

/** Converte a resposta do banco (qualquer formato usual) em movimentos do extrato. */
function acharLista(j, prof) {
  if (Array.isArray(j)) return j;
  if (!j || typeof j !== 'object' || (prof || 0) > 3) return [];
  for (const k of ['_content', 'content', 'data', 'transacoes', 'lancamentos', 'transactions', 'items']) {
    if (Array.isArray(j[k])) return j[k];
    if (j[k] && typeof j[k] === 'object') { const x = acharLista(j[k], (prof || 0) + 1); if (x.length) return x; }
  }
  return [];
}
function normalizar(j) {
  return acharLista(j).map((t, i) => {
    let data = String(t.transactionDate || t.dataLancamento || t.data || t.date || t.bookingDate || '').slice(0, 10);
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) data = data.split('/').reverse().join('-');
    let v = t.amount != null ? t.amount : t.valor != null ? t.valor : t.value;
    if (v && typeof v === 'object') v = v.amount != null ? v.amount : v.valor;
    v = +String(v).replace(',', '.') || 0;
    const tipo = String(t.creditDebitType || t.tipo || t.tipoOperacao || t.type || '').toUpperCase();
    if (/^D|DEB/.test(tipo) && v > 0) v = -v;
    return { id: String(t.transactionId || t.id || t.idLancamento || `${data}-${i}`), data, valor: v, memo: [t.transactionName || t.descricao || t.description || t.historico || '', t.historicComplement || t.complemento || ''].filter(Boolean).join(' ').trim() };
  }).filter(t => /^\d{4}-\d{2}-\d{2}$/.test(t.data));
}

async function extrato(b, de, ate, reqImpl) {
  if (!BANCOS[b]) throw new Error('Banco desconhecido.');
  if (!configurado(b)) { const e = new Error(`${BANCOS[b].nome}: faltam as credenciais da API no servidor.`); e.semIntegracao = true; throw e; }
  const req = reqImpl || pedir, tk = await token(b, req);
  const ag = req === pedir ? agente(b) : undefined;
  let url;
  if (b === 'santander') url = `${BANCOS.santander.base()}/bank_account_information/v1/banks/${BANCOS.santander.cnpjBanco}/statements/${encodeURIComponent(process.env.SANTANDER_CONTA || '')}?initialDate=${de}&finalDate=${ate}&_offset=1&_limit=500`;
  else url = process.env.ITAU_EXTRATO_URL.replace('{de}', de).replace('{ate}', ate);
  const r = await req(url, { headers: { Authorization: 'Bearer ' + tk, 'X-Application-Key': process.env[P(b) + '_CLIENT_ID'], 'x-itau-apikey': process.env[P(b) + '_CLIENT_ID'], accept: 'application/json' }, agent: ag });
  if (r.status >= 300) throw new Error(`${BANCOS[b].nome}: extrato recusado (${r.status})`);
  return { banco: BANCOS[b].nome, empresa: BANCOS[b].empresa, transacoes: normalizar(r.json), saldo: r.json && (r.json.balance || r.json.saldo) ? +((r.json.balance && r.json.balance.amount) || r.json.saldo) : null };
}
module.exports = { BANCOS, configurado, extrato, normalizar };
