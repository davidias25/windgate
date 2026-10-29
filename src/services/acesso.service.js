/**
 * Acesso por perfil aplicado NO SERVIDOR.
 *
 * O contador (Pedro) recebe só notas fiscais e extratos: o resto do banco
 * (operações, CRM, financeiro, cotações) nunca sai daqui para o navegador dele,
 * e o que ele enviar fora disso é descartado antes da mesclagem — inclusive se
 * ele abrir o sistema antigo, que mandaria o banco inteiro de volta.
 */
const W = require('../../public/hub/js/regras.js');

const CONTADOR_COLECOES = ['hubNotas', 'hubExtratos', 'hubNFe'];

function perfil(db, k) { return W.perfilDe(db || {}, k).id; }
const ehContador = (db, k) => !!k && perfil(db, k) === 'contador';

/* RH vê a equipe e o andamento, nunca dinheiro: sem financeiro, cotações (custos e margens), notas nem extratos. */
const SEM_DINHEIRO = ['fin', 'finRec', 'quotes', 'qindex', 'hubNotas', 'hubExtratos', 'hubCambio', 'hubNFe'];

/* NF-e emitidas: só leem Davi, o contador e a diretoria (nfe.ver). O registro é
   do SERVIDOR — status, chave, protocolo e o JSON da nota só mudam pelas rotas
   /api/nfe/*. Pelo /api/db quem emite grava apenas a observação de uma nota que
   já existe; nota nova, troca de status e exclusão que vierem de um navegador
   (inclusive do sistema antigo, com cópia velha) são descartadas. A
   configuração e os cenários fiscais também só mudam pelas rotas. */
const NFE_PAINEL = ['_nfeConfig', '_nfeCenarios'];
const podeNFe = (db, k, cap) => k === '(sem-auth)' || W.pode(db || {}, k, cap);
function semNFe(db, k) { if (!db || !Array.isArray(db.hubNFe) || podeNFe(db, k, 'nfe.ver')) return db; const out = Object.assign({}, db); delete out.hubNFe; return out; }
function gravacaoNFe(atual, recebido, k) {
  if (!recebido || typeof recebido !== 'object') return recebido;
  const out = Object.assign({}, recebido);
  if (Array.isArray(recebido.hubNFe)) {
    const srv = new Map(((atual && atual.hubNFe) || []).filter(n => n && n._id).map(n => [n._id, n]));
    const lista = podeNFe(atual, k, 'nfe.emitir') ? recebido.hubNFe.filter(n => n && srv.has(n._id)).map(n => Object.assign({}, srv.get(n._id), typeof n.obs === 'string' ? { obs: n.obs.slice(0, 500) } : {})) : [];
    if (lista.length) out.hubNFe = lista; else delete out.hubNFe;
  }
  if (recebido._removidos) {
    const ids = new Set(((atual && atual.hubNFe) || []).map(n => n && n._id).filter(Boolean));
    out._removidos = {}; Object.entries(recebido._removidos).forEach(([id, ts]) => { if (!ids.has(id)) out._removidos[id] = ts; });
  }
  if (recebido.hubPainel && typeof recebido.hubPainel === 'object' && NFE_PAINEL.some(c => c in recebido.hubPainel)) {
    out.hubPainel = Object.assign({}, recebido.hubPainel); NFE_PAINEL.forEach(c => { delete out.hubPainel[c]; });
  }
  return out;
}
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

/* PIN não sai do servidor para ninguém: o login é conferido aqui, e quem lia o
   banco no navegador via o PIN de todo mundo. Vai só `temPin`, para a tela de
   Equipe saber quem ainda não tem. Na gravação, o PIN de quem já existe nunca
   vem do navegador — o sistema antigo preenche o PIN padrão quando não recebe
   o real, e gravaria esse padrão por cima. Trocar PIN é pela rota própria
   (POST /api/usuarios/:chave/pin). Com o login desligado (sem segredo) nada
   muda: não há o que proteger e a tela confere o PIN localmente. */
const podeGerirPins = (db, k) => k === 'samir' || !!(db && db.users && db.users[k] && db.users[k].config);
function semPinsLeitura(db, k, original) {
  if (!db || !db.users || k === '(sem-auth)') return db;
  const out = Object.assign({}, db), users = {};
  Object.entries(db.users).forEach(([key, u]) => { if (!u || typeof u !== 'object') { users[key] = u; return; } const c = Object.assign({}, u); delete c.pin; const o = original && original.users && original.users[key]; c.temPin = !!(o ? o.pin : u.pin); users[key] = c; });
  out.users = users;
  return out;
}
function gravacaoPins(atual, recebido, k) {
  if (!recebido || typeof recebido !== 'object' || !recebido.users || typeof recebido.users !== 'object' || k === '(sem-auth)') return recebido;
  const out = Object.assign({}, recebido), users = {}, srv = (atual && atual.users) || {};
  Object.entries(recebido.users).forEach(([key, u]) => {
    if (!u || typeof u !== 'object') { users[key] = u; return; }
    const c = Object.assign({}, u); delete c.temPin;
    if (srv[key]) { if (srv[key].pin) c.pin = srv[key].pin; else delete c.pin; }
    else if (!podeGerirPins(atual, k)) delete c.pin;   // pessoa nova: só quem administra acessos define o PIN
    users[key] = c;
  });
  out.users = users;
  return out;
}

/** O que o usuário pode ler de GET /api/db. */
function paraLeitura(db, k) { return semPinsLeitura(semNFe(semRH(semDinheiroDocs(paraLeitura0(db, k), k), k), k), k, db); }

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
  const out = { users, _removidos: {}, hubPainel: { _fiscal: hp._fiscal || {}, _fiscalContador: hp._fiscalContador || {}, _nfeConfig: hp._nfeConfig || {}, _nfeCenarios: hp._nfeCenarios || {} } };
  CONTADOR_COLECOES.forEach(c => { out[c] = Array.isArray(db[c]) ? db[c] : []; out[c].forEach(r => r && r._id && ids.add(r._id)); });
  Object.entries(db._removidos || {}).forEach(([id, ts]) => { if (ids.has(id)) out._removidos[id] = ts; });
  return out;
}

/** O que o usuário pode gravar em POST /api/db (o resto é descartado). */
function paraGravacao(atual, recebido, k) { return gravacaoPins(atual, gravacaoNFe(atual, gravacaoRH(atual, gravacaoDocs(atual, paraGravacao0(atual, recebido, k), k), k), k), k); }
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
  // Exclusão só vale para nota/extrato (NF-e emitida nunca se exclui: ver gravacaoNFe); tombstone de qualquer outro registro é ignorado.
  out._removidos = {};
  Object.entries(recebido._removidos || {}).forEach(([id, ts]) => { if (ids.has(id)) out._removidos[id] = ts; });
  return out;
}

module.exports = { perfil, ehContador, ehRH, ehDocs, podeRH, podeGerirPins, paraLeitura, paraGravacao, CONTADOR_COLECOES, SEM_DINHEIRO };
