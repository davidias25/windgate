/**
 * Integração com o Portal Único Siscomex — TTCE (Tratamento Tributário).
 *
 * O que esta API entrega, e o que ela NÃO entrega:
 *   - ENTREGA: o regime de cada tributo (recolhimento integral, redução,
 *     isenção, suspensão) e o fundamento legal correspondente.
 *   - NÃO ENTREGA: alíquota. Nenhum endpoint público ou autenticado do TTCE
 *     devolve percentual — isso vem da TEC (Gecex) e da TIPI, publicadas em
 *     planilha. As alíquotas seguem vindo da biblioteca de NCM do sistema.
 *
 * Serve para avisar quando a alíquota cheia NÃO se aplica àquela NCM.
 *
 * Autenticação: mTLS com o certificado e-CNPJ em /portal/api/autenticar
 * (verificado: sem certificado o servidor derruba o handshake TLS). O token
 * devolvido é reenviado no header 'authorization' das chamadas do TTCE
 * (verificado: sem ele a resposta é 401 pedindo exatamente esse header).
 */
const https = require('https');
const fs = require('fs');

const HOST = 'portalunico.siscomex.gov.br';
const CAMINHO_AUTH = '/portal/api/autenticar';
const CAMINHO_TTCE = '/ttce/api/ext/tratamentos-tributarios/importacao/';
const VALIDADE_TOKEN_MS = 50 * 60 * 1000;   // o token dura ~1h; renova antes

let _sessao = null;   // { token, csrf, em }

/** Agente TLS com o certificado do cliente. Sem ele não há autenticação. */
function agenteTLS() {
  const caminho = process.env.SISCOMEX_CERT_PFX;
  if (!caminho) return null;
  if (!fs.existsSync(caminho)) {
    console.warn(`⚠️ Certificado Siscomex não encontrado em ${caminho}`);
    return null;
  }
  return new https.Agent({
    pfx: fs.readFileSync(caminho),
    passphrase: process.env.SISCOMEX_CERT_SENHA || '',
    keepAlive: true
  });
}

const configurado = () => !!(process.env.SISCOMEX_CERT_PFX && fs.existsSync(process.env.SISCOMEX_CERT_PFX));

function requisicao({ caminho, metodo, headers, corpo, agent }) {
  return new Promise((resolve, reject) => {
    const dados = corpo ? JSON.stringify(corpo) : null;
    const req = https.request({
      host: HOST, path: caminho, method: metodo, agent, timeout: 30000,
      headers: Object.assign({
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }, dados ? { 'Content-Length': Buffer.byteLength(dados) } : {}, headers || {})
    }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
    });
    req.on('error', e => reject(new Error(e.code || e.message)));
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (dados) req.write(dados);
    req.end();
  });
}

/** Autentica por certificado e guarda o token enquanto ele valer. */
async function autenticar() {
  if (_sessao && Date.now() - _sessao.em < VALIDADE_TOKEN_MS) return _sessao;

  const agent = agenteTLS();
  if (!agent) throw new Error('Certificado digital não configurado (SISCOMEX_CERT_PFX).');

  const r = await requisicao({
    caminho: CAMINHO_AUTH, metodo: 'POST', agent,
    headers: { 'Role-Type': process.env.SISCOMEX_PERFIL || 'IMPORTADOR' }
  });

  if (r.status !== 200) {
    throw new Error(`Autenticação recusada pelo Portal Único (HTTP ${r.status}): ${String(r.body).slice(0, 180)}`);
  }

  // O nome do header varia entre as versões da documentação; aceita as formas
  // conhecidas e registra o que veio, para não falhar em silêncio.
  const h = r.headers;
  const token = h['set-token'] || h['x-auth-token'] || h['authorization'];
  const csrf = h['x-csrf-token'] || h['csrf-token'];

  if (!token) {
    throw new Error(`Portal Único autenticou mas não devolveu token. Headers recebidos: ${Object.keys(h).join(', ')}`);
  }

  _sessao = { token, csrf, em: Date.now() };
  console.log('✅ Autenticado no Portal Único Siscomex.');
  return _sessao;
}

const REGIME_INTEGRAL = /recolhimento integral/i;

/** Achata a resposta do TTCE no que interessa: regime por tributo. */
function normalizar(dados) {
  const lista = (dados && dados.tratamentosTributarios) || [];
  const tributos = lista.map(t => {
    const nomeRegime = (t.regime && t.regime.nome) || '';
    return {
      tributo: (t.tributo && t.tributo.nome) || '—',
      regime: nomeRegime || '—',
      fundamentoLegal: t.fundamentoLegal
        ? `${t.fundamentoLegal.codigo || ''} ${t.fundamentoLegal.nome || ''}`.trim()
        : '',
      integral: REGIME_INTEGRAL.test(nomeRegime)
    };
  });
  return {
    tributos,
    // "false" aqui é o que importa: existe tributo cuja alíquota cheia não vale
    integral: tributos.length > 0 && tributos.every(t => t.integral),
    ressalvas: tributos.filter(t => !t.integral)
  };
}

/**
 * Consulta o tratamento tributário de uma NCM na importação.
 * Devolve sempre um objeto — nunca lança — para a cotação não quebrar quando
 * o Portal Único estiver fora do ar ou o certificado vencido.
 */
async function consultarTratamento(ncmRaw, opcoes = {}) {
  const ncm = String(ncmRaw || '').replace(/\D/g, '');
  if (ncm.length !== 8) return { configurado: configurado(), erro: 'NCM precisa ter 8 dígitos.' };
  if (!configurado()) {
    return { configurado: false, erro: 'Certificado digital do Siscomex não configurado no servidor.' };
  }

  try {
    const sessao = await autenticar();
    const r = await requisicao({
      caminho: CAMINHO_TTCE, metodo: 'POST', agent: agenteTLS(),
      headers: Object.assign(
        { 'Authorization': sessao.token },
        sessao.csrf ? { 'X-CSRF-Token': sessao.csrf } : {}
      ),
      corpo: {
        ncm,
        codigoPais: +(opcoes.codigoPais || process.env.SISCOMEX_PAIS_PADRAO || 0) || undefined,
        dataFatoGerador: opcoes.data || new Date().toISOString().slice(0, 10),
        tipoOperacao: 'I'
      }
    });

    if (r.status === 401 || r.status === 403) {
      _sessao = null;   // força nova autenticação na próxima tentativa
      return { configurado: true, erro: `Sessão recusada pelo Portal Único (HTTP ${r.status}).` };
    }
    if (r.status !== 200) {
      return { configurado: true, erro: `Portal Único respondeu HTTP ${r.status}: ${String(r.body).slice(0, 180)}` };
    }

    const dados = JSON.parse(r.body);
    return Object.assign({ configurado: true, ncm, erro: null }, normalizar(dados));
  } catch (e) {
    return { configurado: true, erro: e.message };
  }
}

module.exports = { consultarTratamento, autenticar, normalizar, configurado };
