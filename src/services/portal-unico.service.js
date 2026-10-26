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

module.exports = { cfg, configurado, autenticar, consultarDuimp, resumirDuimp, _reset: () => { sessao = null; ultimaAuth = 0; } };
