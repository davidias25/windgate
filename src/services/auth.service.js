/**
 * Autenticação do WindGate.
 *
 * Até aqui o PIN era conferido no navegador e o `/api/db` devolvia o banco
 * inteiro — financeiro, CRM, documentos e os próprios PINs — para qualquer
 * requisição. Esconder aba no front-end não protege nada: quem abre o
 * DevTools vê tudo.
 *
 * O token é assinado com HMAC-SHA256 sobre a mesma WINDGATE_DB_SECRET que já
 * cifra o banco. Sem estado no servidor: o Render reinicia a qualquer deploy e
 * uma sessão em memória derrubaria todo mundo. O preço é não dar para revogar
 * um token antes de expirar — daí a validade curta.
 *
 * A identidade SEMPRE sai do token, nunca do corpo da requisição. É essa
 * regra que impede alguém de bater ponto no nome de outro.
 */
const crypto = require('crypto');

const HORAS_VALIDADE = 12;
/* Quem enxerga os registros de ponto. Em variável de ambiente para incluir
   alguém sem deploy de código. */
const DIRETORIA = (process.env.PONTO_DIRETORIA || 'samir')
  .split(',').map(s => s.trim()).filter(Boolean);

function segredo() {
  const s = process.env.WINDGATE_DB_SECRET;
  if (!s) return null;
  return crypto.createHash('sha256').update('auth:' + s).digest();
}

const b64 = buf => Buffer.from(buf).toString('base64url');

function assinar(payloadB64, chave) {
  return crypto.createHmac('sha256', chave).update(payloadB64).digest('base64url');
}

/** Token de sessão. `k` é a chave do usuário; é dela que tudo depende depois. */
function emitirToken(userKey) {
  const chave = segredo();
  if (!chave) throw new Error('WINDGATE_DB_SECRET ausente — sem ela não há como assinar sessão.');
  const payload = b64(JSON.stringify({
    k: userKey,
    exp: Date.now() + HORAS_VALIDADE * 3600 * 1000
  }));
  return payload + '.' + assinar(payload, chave);
}

/** Devolve `{k}` quando o token é válido, ou null. Nunca lança. */
function lerToken(token) {
  try {
    const chave = segredo();
    if (!chave || !token) return null;
    const [payload, sig] = String(token).split('.');
    if (!payload || !sig) return null;
    const esperada = assinar(payload, chave);
    // Comparação em tempo constante: comparar com === vaza, pelo tempo, quantos
    // bytes iniciais o atacante acertou.
    const a = Buffer.from(sig), b = Buffer.from(esperada);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const dados = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!dados || !dados.k || !dados.exp || Date.now() > dados.exp) return null;
    return { k: dados.k, exp: dados.exp };
  } catch (e) {
    return null;
  }
}

/** Confere o PIN contra o banco central. Em tempo constante, pelo mesmo motivo. */
function pinConfere(db, userKey, pin) {
  const u = db && db.users && db.users[userKey];
  if (!u || !u.pin) return false;
  const a = Buffer.from(String(u.pin)), b = Buffer.from(String(pin == null ? '' : pin));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const ehDiretoria = userKey => DIRETORIA.includes(userKey);

/* ---------- middlewares ---------- */

/** Exige sessão válida. Põe `req.usuario = {k}` para o resto da rota usar. */
function exigirToken(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : (req.query && req.query.token);
  const dados = lerToken(token);
  if (!dados) {
    return res.status(401).json({ success: false, message: 'Sessão expirada ou ausente. Entre de novo.' });
  }
  req.usuario = dados;
  next();
}

/** Exige que a sessão seja de quem pode ver os registros de ponto. */
function exigirDiretoria(req, res, next) {
  if (!req.usuario || !ehDiretoria(req.usuario.k)) {
    return res.status(403).json({ success: false, message: 'Acesso restrito à diretoria.' });
  }
  next();
}

/**
 * Autenticação ligada só quando há segredo configurado.
 *
 * Sem WINDGATE_DB_SECRET não há como assinar nem verificar nada, e exigir
 * token deixaria o sistema inacessível em vez de seguro. Nesse caso a rota
 * segue aberta e o servidor grita no log — é o estado em que o sistema já
 * estava, não uma porta nova.
 */
const authAtiva = () => !!segredo();

function exigirTokenSeAtiva(req, res, next) {
  if (!authAtiva()) { req.usuario = { k: '(sem-auth)' }; return next(); }
  return exigirToken(req, res, next);
}

module.exports = {
  emitirToken, lerToken, pinConfere, ehDiretoria, authAtiva,
  exigirToken, exigirDiretoria, exigirTokenSeAtiva,
  DIRETORIA, HORAS_VALIDADE
};
