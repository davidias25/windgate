/**
 * Fotografias do banco central.
 *
 * O banco é uma cópia só. Hoje, se uma gravação ruim chegar de um navegador
 * desatualizado, o `.bak` do disco é a única defesa — e o disco do Render
 * some a cada deploy. Uma operação apagada por engano na sexta não tem como
 * voltar na segunda.
 *
 * Cada gravação deixa uma fotografia cifrada no Storage:
 *   · por HORA — 24 posições que giram, para desfazer o engano do mesmo dia;
 *   · por DIA  — uma por dia, que NUNCA é apagada, para o engano que só se
 *     percebe semanas depois, quando alguém procura a operação e não acha.
 *
 * Gravação que REMOVE registro tira a fotografia ANTES de aplicar: é
 * exatamente o caso em que se quer o estado anterior, e depois já é tarde.
 */
const crypto = require('crypto');
const { baixarArquivo, enviarArquivo, listarArquivos } = require('../integrations/supabase.service');

const PASTA = process.env.WINDGATE_HISTORICO_PASTA || 'sistema/historico';
/* Coleções em lista: é nelas que se perde registro. Mantido em sincronia com
   db-merge.service — um nome a menos aqui é uma coleção sem conferência. */
const COLECOES = ['ops', 'docs', 'fin', 'finRec', 'fretes', 'fornecedores', 'qindex',
                  'agendaTasks', 'crm', 'crmDocs', 'crmOps', 'parceiros', 'opStatusHist'];

function chaveDeCifra() {
  const s = process.env.WINDGATE_DB_SECRET;
  return s ? crypto.createHash('sha256').update(s).digest() : null;
}
function cifrar(texto, chave) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave, iv);
  const dados = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), dados]);
}
function decifrar(buffer, chave) {
  const iv = buffer.subarray(0, 12), tag = buffer.subarray(12, 28), dados = buffer.subarray(28);
  const d = crypto.createDecipheriv('aes-256-gcm', chave, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(dados), d.final()]).toString('utf8');
}

/* Fuso de São Paulo: o Render roda em UTC, e sem forçar o fuso a fotografia
   das 22h entraria no dia seguinte — justamente a que se procura. */
function agoraSP() {
  const p = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false
  }).formatToParts(new Date()).reduce((a, x) => (a[x.type] = x.value, a), {});
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: p.hour };
}

/** Quantos registros cada coleção tem. É a conta que revela sumiço. */
function contar(db) {
  const out = {};
  COLECOES.forEach(k => { if (Array.isArray(db && db[k])) out[k] = db[k].length; });
  return out;
}

/**
 * O que a gravação que está chegando REMOVE do banco atual.
 * Devolve `{}` quando nada sai — e é esse o caso comum.
 */
function perdas(atual, recebido) {
  const out = {};
  COLECOES.forEach(k => {
    const a = Array.isArray(atual && atual[k]) ? atual[k] : null;
    const b = Array.isArray(recebido && recebido[k]) ? recebido[k] : null;
    // Coleção ausente no que chegou não é remoção: o cliente simplesmente não
    // mandou aquela parte, e a mesclagem preserva.
    if (!a || !b) return;
    const idsB = new Set(b.map(r => r && r._id).filter(Boolean));
    const removidos = (recebido._removidos || {});
    const sumiram = a.filter(r => r && r._id && !idsB.has(r._id) && removidos[r._id]);
    if (sumiram.length) out[k] = sumiram.length;
  });
  return out;
}

let ultimoEstado = { ok: null, em: null, erro: null, pasta: PASTA };
const estado = () => Object.assign({}, ultimoEstado);

/**
 * Grava a fotografia. `motivo` entra no nome do arquivo do dia para dar para
 * saber, olhando a lista, qual delas é a de antes de uma exclusão.
 */
async function fotografar(db, motivo) {
  const chave = chaveDeCifra();
  if (!chave) { ultimoEstado = { ok: false, em: new Date().toISOString(), erro: 'WINDGATE_DB_SECRET ausente', pasta: PASTA }; return ultimoEstado; }
  try {
    const t = agoraSP();
    const corpo = cifrar(JSON.stringify({
      em: new Date().toISOString(), motivo: motivo || 'gravacao', contagem: contar(db), db
    }), chave);
    /* A da hora gira sozinha: o mesmo nome é sobrescrito a cada volta do
       relógio, então 24 arquivos cobrem o dia inteiro sem crescer sem fim. */
    await enviarArquivo(`${PASTA}/hora-${t.hora}.enc`, corpo, 'application/octet-stream');
    /* A do dia é escrita a cada gravação e termina sendo a última do dia. É a
       que nunca se apaga. */
    await enviarArquivo(`${PASTA}/dia-${t.dia}.enc`, corpo, 'application/octet-stream');
    ultimoEstado = { ok: true, em: new Date().toISOString(), erro: null, pasta: PASTA };
  } catch (e) {
    console.warn('⚠️ Histórico: falha ao fotografar:', e.message);
    ultimoEstado = { ok: false, em: new Date().toISOString(), erro: e.message, pasta: PASTA };
  }
  return ultimoEstado;
}

/** Lista as fotografias disponíveis, mais recentes primeiro. */
async function listar() {
  const r = await listarArquivos(PASTA);
  if (r && r.erro) throw new Error(r.erro);
  return ((r && r.arquivos) || [])
    .filter(a => a && /\.enc$/.test(a.nomeArquivo || ''))
    .map(a => ({ nome: a.nomeArquivo, caminho: a.path, tamanho: a.tamanho, em: a.enviadoEm }))
    .sort((x, y) => String(y.nome).localeCompare(String(x.nome)));
}

/** Abre uma fotografia. Devolve `{em, motivo, contagem, db}`. */
async function abrir(caminho) {
  const chave = chaveDeCifra();
  if (!chave) throw new Error('WINDGATE_DB_SECRET ausente — sem ela a fotografia não abre.');
  const buf = await baixarArquivo(caminho);
  if (!buf || !buf.length) throw new Error(`Fotografia não encontrada: ${caminho}`);
  return JSON.parse(decifrar(buf, chave));
}

/**
 * Compara dois bancos e lista o que existia no primeiro e não existe no
 * segundo — por coleção e por `_id`. É a conferência que se roda antes e
 * depois de uma migração.
 */
function conferir(antes, depois) {
  const faltando = {};
  let total = 0;
  COLECOES.forEach(k => {
    const a = Array.isArray(antes && antes[k]) ? antes[k] : [];
    const b = Array.isArray(depois && depois[k]) ? depois[k] : [];
    if (!a.length) return;
    const idsB = new Set(b.map(r => r && r._id).filter(Boolean));
    const sumiram = a.filter(r => r && r._id && !idsB.has(r._id));
    if (sumiram.length) {
      faltando[k] = sumiram.map(r => ({
        _id: r._id,
        // Um rótulo legível: "_id sumiu" não diz a ninguém o que se perdeu.
        rotulo: r.desc || r.nome || r.titulo || r.id || r.op || r.cliente || '(sem rótulo)',
        valor: r.valor != null ? r.valor : undefined
      }));
      total += sumiram.length;
    }
  });
  return {
    ok: total === 0, total, faltando,
    contagem: { antes: contar(antes), depois: contar(depois) }
  };
}

module.exports = { fotografar, listar, abrir, conferir, contar, perdas, estado, PASTA, COLECOES };
