/**
 * Acesso por perfil aplicado NO SERVIDOR.
 *
 * O contador (Pedro) recebe só notas fiscais e extratos: o resto do banco
 * (operações, CRM, financeiro, cotações) nunca sai daqui para o navegador dele,
 * e o que ele enviar fora disso é descartado antes da mesclagem — inclusive se
 * ele abrir o sistema antigo, que mandaria o banco inteiro de volta.
 */
const W = require('../../public/hub/js/regras.js');

const CONTADOR_COLECOES = ['hubNotas', 'hubExtratos'];

function perfil(db, k) { return W.perfilDe(db || {}, k).id; }
const ehContador = (db, k) => !!k && perfil(db, k) === 'contador';

/** O que o usuário pode ler de GET /api/db. */
function paraLeitura(db, k) {
  if (!db || !ehContador(db, k)) return db;
  const users = {};
  Object.entries(db.users || {}).forEach(([key, u]) => {
    users[key] = { nome: (u && u.nome) || key, papel: (u && u.papel) || '', cor: (u && u.cor) || '', perfilHub: (u && u.perfilHub) || '' };
  });
  const ids = new Set();
  const hp = db.hubPainel || {};
  const out = { users, _removidos: {}, hubPainel: { _fiscal: hp._fiscal || {}, _fiscalContador: hp._fiscalContador || {} } };
  CONTADOR_COLECOES.forEach(c => { out[c] = Array.isArray(db[c]) ? db[c] : []; out[c].forEach(r => r && r._id && ids.add(r._id)); });
  Object.entries(db._removidos || {}).forEach(([id, ts]) => { if (ids.has(id)) out._removidos[id] = ts; });
  return out;
}

/** O que o usuário pode gravar em POST /api/db (o resto é descartado). */
function paraGravacao(atual, recebido, k) {
  if (!recebido || !ehContador(atual, k)) return recebido;
  const out = {};
  const ids = new Set();
  CONTADOR_COLECOES.forEach(c => {
    if (Array.isArray(recebido[c])) out[c] = recebido[c].filter(r => r && typeof r === 'object');
    [].concat(out[c] || [], (atual && atual[c]) || []).forEach(r => r && r._id && ids.add(r._id));
  });
  // Do painel, o contador só grava a própria confirmação de recebimento/apuração.
  if (recebido.hubPainel && recebido.hubPainel._fiscalContador) out.hubPainel = { _fiscalContador: recebido.hubPainel._fiscalContador };
  // Exclusão só vale para nota/extrato; tombstone de qualquer outro registro é ignorado.
  out._removidos = {};
  Object.entries(recebido._removidos || {}).forEach(([id, ts]) => { if (ids.has(id)) out._removidos[id] = ts; });
  return out;
}

module.exports = { perfil, ehContador, paraLeitura, paraGravacao, CONTADOR_COLECOES };
