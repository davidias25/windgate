/**
 * Mesclagem do banco central.
 *
 * Cada cliente envia o banco inteiro ao salvar. Substituir o banco pelo que
 * chegou faz o último a salvar apagar tudo que os outros registraram desde a
 * última sincronização deles — documentos, lançamentos e operações somem sem
 * aviso. Aqui as coleções são unidas registro a registro, pelo `_id` estável.
 *
 * Exclusões viajam em `_removidos` ({ _id: timestamp }), senão um registro
 * apagado por um usuário voltaria da cópia de outro na mesclagem seguinte.
 */

// Coleções em lista, unidas por `_id`
const COLECOES = ['ops', 'docs', 'fin', 'fretes', 'fornecedores', 'qindex', 'agendaTasks', 'crm', 'crmOps', 'parceiros'];

// Objetos indexados por chave própria (opId, id da cotação, 'YYYY-MM'…)
// `notifLidas` é indexado por usuário: mesclar por chave preserva o que cada um
// já leu, em vez de a gravação de um apagar a do outro.
const OBJETOS = ['users', 'checklists', 'quotes', 'gestao', 'agentes', 'ncmlib', 'notifLidas', 'portos'];

const DIAS_TOMBSTONE = 90;

/**
 * Identidade do registro. Registros gravados antes do `_id` recebem um id
 * derivado do conteúdo — o MESMO algoritmo usado no navegador, para que o
 * mesmo registro vindo de origens diferentes seja reconhecido como um só.
 */
function idDeterministico(rec) {
  const txt = JSON.stringify(rec);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < txt.length; i++) {
    const c = txt.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return 'h-' + h1.toString(36) + h2.toString(36);
}

const chave = r => (r && r._id) ? String(r._id) : idDeterministico(r);

function uniaoPorId(atual, recebido, removidos) {
  const mapa = new Map();
  atual.forEach(r => { if (r) mapa.set(chave(r), r); });

  // O que chegou do cliente prevalece sobre a cópia do servidor…
  const ordem = [];
  recebido.forEach(r => {
    if (!r) return;
    const k = chave(r);
    mapa.set(k, r);
    ordem.push(k);
  });

  // …e o que só existe no servidor é preservado (registro de outro usuário).
  const vistos = new Set(ordem);
  const restantes = [];
  atual.forEach(r => {
    if (!r) return;
    const k = chave(r);
    if (!vistos.has(k)) { vistos.add(k); restantes.push(k); }
  });

  return [...ordem, ...restantes]
    .filter(k => !removidos[k])
    .map(k => mapa.get(k));
}

function podarRemovidos(removidos) {
  const limite = Date.now() - DIAS_TOMBSTONE * 24 * 60 * 60 * 1000;
  const out = {};
  Object.entries(removidos).forEach(([id, ts]) => {
    if (typeof ts !== 'number' || ts >= limite) out[id] = ts;
  });
  return out;
}

/** Mescla o banco recebido do cliente sobre o banco atual do servidor. */
function mesclarDB(atual, recebido) {
  if (!atual || typeof atual !== 'object') return recebido;
  if (!recebido || typeof recebido !== 'object') return atual;

  const out = Object.assign({}, atual, recebido);
  const removidos = podarRemovidos(Object.assign({}, atual._removidos, recebido._removidos));

  COLECOES.forEach(k => {
    const a = Array.isArray(atual[k]) ? atual[k] : [];
    const b = Array.isArray(recebido[k]) ? recebido[k] : [];
    if (a.length || b.length) out[k] = uniaoPorId(a, b, removidos);
  });

  OBJETOS.forEach(k => {
    const a = atual[k], b = recebido[k];
    if (a && typeof a === 'object' && !Array.isArray(a) &&
        b && typeof b === 'object' && !Array.isArray(b)) {
      out[k] = Object.assign({}, a, b);
    }
  });

  out._removidos = removidos;
  return out;
}

module.exports = { mesclarDB, uniaoPorId, COLECOES, OBJETOS };
