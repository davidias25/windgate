/**
 * Histórico do banco central (Hub 2.0 · Fase 0).
 *
 * Até aqui o banco era UM objeto no Storage (`sistema/db.enc`), sobrescrito a
 * cada gravação. A cópia `.bak` ficava no disco do Render, que some a cada
 * deploy. Ou seja: uma gravação ruim era irreversível.
 *
 * Agora toda gravação deixa uma fotografia cifrada fora do objeto principal:
 *   - hora-HH.enc     → 24 posições que se sobrescrevem: as últimas 24 horas
 *   - dia-AAAA-MM-DD.enc → uma por dia, sem sobrescrever: o histórico longo
 *   - antes-exclusao-<carimbo>.enc → tirada ANTES de aplicar qualquer exclusão
 *
 * As fotografias são cifradas com a mesma chave do banco. Nenhuma é apagada
 * por este código: apagar histórico é decisão humana.
 */

const PASTA = process.env.WINDGATE_HISTORICO_PASTA || 'sistema/historico';

/** Data e hora em São Paulo, sem depender do fuso do servidor. */
function partesSP(agora = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const p = Object.fromEntries(f.formatToParts(agora).map(x => [x.type, x.value]));
  const hora = p.hour === '24' ? '00' : p.hour;
  return { dia: `${p.year}-${p.month}-${p.day}`, hora, carimbo: `${p.year}${p.month}${p.day}-${hora}${p.minute}${p.second}` };
}

const caminhoHora = (agora) => `${PASTA}/hora-${partesSP(agora).hora}.enc`;
const caminhoDia = (agora) => `${PASTA}/dia-${partesSP(agora).dia}.enc`;
const caminhoExclusao = (agora) => `${PASTA}/antes-exclusao-${partesSP(agora).carimbo}.enc`;

/**
 * Decide quais fotografias tirar nesta gravação.
 * `jaGravados` guarda o que este processo já gravou, para não reenviar a
 * mesma fotografia diária a cada clique (a da hora é reenviada, de propósito:
 * ela acompanha a última versão daquela hora).
 */
function fotografiasDaGravacao(agora, jaGravados) {
  const alvos = [caminhoHora(agora)];
  const dia = caminhoDia(agora);
  if (!jaGravados.has(dia)) alvos.push(dia);
  return alvos;
}

/** Quantos registros há em cada coleção — base de toda conferência. */
function contarRegistros(db) {
  const out = {};
  if (!db || typeof db !== 'object') return out;
  Object.entries(db).forEach(([k, v]) => {
    if (k === '_removidos') return;
    if (Array.isArray(v)) out[k] = v.length;
    else if (v && typeof v === 'object') out[k] = Object.keys(v).length;
  });
  return out;
}

/** Ids novos marcados como excluídos nesta gravação. */
function exclusoesNovas(atual, recebido) {
  const antes = (atual && atual._removidos) || {};
  const agora = (recebido && recebido._removidos) || {};
  return Object.keys(agora).filter(id => !(id in antes));
}

/**
 * Compara dois bancos (antes e depois de uma migração) e devolve o que sumiu.
 * Uma migração só pode ser aprovada quando `perdas` vem vazio.
 */
function compararBancos(antes, depois, idDe) {
  const id = idDe || (r => (r && r._id) ? String(r._id) : JSON.stringify(r));
  const perdas = [];
  const resumo = [];
  Object.entries(antes || {}).forEach(([k, va]) => {
    if (k === '_removidos') return;
    const vd = (depois || {})[k];
    if (Array.isArray(va)) {
      const idsDepois = new Set((Array.isArray(vd) ? vd : []).map(id));
      const faltando = va.filter(r => !idsDepois.has(id(r)));
      resumo.push({ colecao: k, antes: va.length, depois: Array.isArray(vd) ? vd.length : 0, faltando: faltando.length });
      faltando.forEach(r => perdas.push({ colecao: k, id: id(r) }));
    } else if (va && typeof va === 'object') {
      const chavesDepois = new Set(Object.keys(vd && typeof vd === 'object' ? vd : {}));
      const faltando = Object.keys(va).filter(c => !chavesDepois.has(c));
      resumo.push({ colecao: k, antes: Object.keys(va).length, depois: chavesDepois.size, faltando: faltando.length });
      faltando.forEach(c => perdas.push({ colecao: k, id: c }));
    } else if (va !== undefined && vd === undefined) {
      resumo.push({ colecao: k, antes: 1, depois: 0, faltando: 1 });
      perdas.push({ colecao: k, id: '(valor)' });
    }
  });
  return { ok: perdas.length === 0, perdas, resumo };
}

module.exports = {
  PASTA, partesSP, caminhoHora, caminhoDia, caminhoExclusao,
  fotografiasDaGravacao, contarRegistros, exclusoesNovas, compararBancos
};
