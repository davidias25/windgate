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

/* RH vê a equipe e o andamento, nunca dinheiro: sem financeiro, cotações (custos e margens), notas nem extratos. */
const SEM_DINHEIRO = ['fin', 'finRec', 'quotes', 'qindex', 'hubNotas', 'hubExtratos', 'hubCambio'];
const ehRH = (db, k) => !!k && perfil(db, k) === 'rh';
function semPins(users) { const out = {}; Object.entries(users || {}).forEach(([key, u]) => { const c = Object.assign({}, u); delete c.pin; out[key] = c; }); return out; }

/* Anotações de RH (1:1, feedback, PDI) só saem para quem tem rh.ver (RH e diretoria).
   O pulso semanal é anônimo: qualquer um grava o seu, ninguém fora do RH lê. */
const podeRH = (db, k) => k === '(sem-auth)' || W.pode(db || {}, k, 'rh.ver');
function semRH(db, k) { if (!db || !Array.isArray(db.hubRH) || podeRH(db, k)) return db; const out = Object.assign({}, db); delete out.hubRH; return out; }
function gravacaoRH(atual, recebido, k) {
  if (!recebido || !Array.isArray(recebido.hubRH) || podeRH(atual, k)) return recebido;
  const out = Object.assign({}, recebido);
  out.hubRH = recebido.hubRH.filter(r => r && r.tipo === 'pulso' && !((atual && atual.hubRH) || []).some(x => x && x._id === r._id)).map(r => ({ _id: r._id, tipo: 'pulso', semana: r.semana, nota: r.nota, comentario: r.comentario || '', em: r.em }));
  return out;
}

/** O que o usuário pode ler de GET /api/db. */
function paraLeitura(db, k) { return semRH(semDinheiroDocs(paraLeitura0(db, k), k), k); }

/* Documentação & Atendimento (Ívina) também não vê dinheiro: nem financeiro,
   nem cotações (custo e margem), nem câmbio, nem o valor dos negócios. Na
   gravação, o que ela mandar dessas coleções é descartado e o valor dos
   negócios que ela editar é preservado do que já está no banco. */
const ehDocs = (db, k) => !!k && k !== '(sem-auth)' && !!(db && db.users && db.users[k]) && perfil(db, k) === 'documentos';
function semDinheiroDocs(db, k) {
  if (!db || !ehDocs(db, k)) return db;
  const out = Object.assign({}, db);
  SEM_DINHEIRO.forEach(c => { delete out[c]; });
  out.crmOps = (db.crmOps || []).map(n => { const c = Object.assign({}, n); delete c.valor; return c; });
  return out;
}
function gravacaoDocs(atual, recebido, k) {
  if (!recebido || !ehDocs(atual, k)) return recebido;
  const out = Object.assign({}, recebido);
  SEM_DINHEIRO.forEach(c => { delete out[c]; });
  if (Array.isArray(recebido.crmOps)) {
    const m = new Map(((atual && atual.crmOps) || []).filter(n => n && n._id).map(n => [n._id, n]));
    out.crmOps = recebido.crmOps.map(n => { const a = n && m.get(n._id); return a && a.valor != null && n.valor == null ? Object.assign({}, n, { valor: a.valor }) : n; });
  }
  const proibidos = new Set(); SEM_DINHEIRO.forEach(c => { const v = atual && atual[c]; if (Array.isArray(v)) v.forEach(r => r && r._id && proibidos.add(r._id)); });
  if (recebido._removidos) { out._removidos = {}; Object.entries(recebido._removidos).forEach(([id, ts]) => { if (!proibidos.has(id)) out._removidos[id] = ts; }); }
  return out;
}
function paraLeitura0(db, k) {
  if (db && ehRH(db, k)) {
    const out = Object.assign({}, db, { users: semPins(db.users) });
    SEM_DINHEIRO.forEach(c => { delete out[c]; });
    // Lançamentos de valor também não vão nos negócios do CRM.
    out.crmOps = (db.crmOps || []).map(n => { const c = Object.assign({}, n); delete c.valor; return c; });
    return out;
  }
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
function paraGravacao(atual, recebido, k) { return gravacaoRH(atual, gravacaoDocs(atual, paraGravacao0(atual, recebido, k), k), k); }
function paraGravacao0(atual, recebido, k) {
  if (recebido && ehRH(atual, k)) {
    const out = Object.assign({}, recebido);
    SEM_DINHEIRO.concat(['users', 'crmOps', 'settings']).forEach(c => { delete out[c]; });
    const proibidos = new Set(); SEM_DINHEIRO.forEach(c => { const v = atual && atual[c]; if (Array.isArray(v)) v.forEach(r => r && r._id && proibidos.add(r._id)); });
    out._removidos = {}; Object.entries(recebido._removidos || {}).forEach(([id, ts]) => { if (!proibidos.has(id)) out._removidos[id] = ts; });
    return out;
  }
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

module.exports = { perfil, ehContador, ehRH, ehDocs, podeRH, paraLeitura, paraGravacao, CONTADOR_COLECOES };
