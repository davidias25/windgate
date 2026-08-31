/**
 * Etapa da operação: quando começou e o que já passou.
 *
 * O contador de prazo do painel vive de `statusEm`, e a Gestão do Mês vai viver
 * de `opStatusHist`. Se isso dependesse só do navegador, bastaria uma aba
 * desatualizada, uma carga do ClickUp feita por outra máquina ou uma mesclagem
 * fora de ordem para a operação mudar de etapa sem deixar rastro — e o prazo
 * passaria a contar de uma data que nunca existiu.
 *
 * Por isso a mesma regra roda aqui, em cima do que o cliente enviou comparado
 * com o que o servidor já tinha: carimba a data que falta, escreve a linha do
 * histórico que falta e recusa data impossível. É idempotente — o que o cliente
 * já registrou direito passa intacto, sem gerar linha repetida.
 */

const MS_DIA = 24 * 60 * 60 * 1000;

const soData = v => String(v || '').slice(0, 10);
const ehISO = v => /^\d{4}-\d{2}-\d{2}/.test(String(v || ''));

function novoId() {
  return 'srv-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/**
 * A data de início da etapa não pode ser no futuro nem anterior à criação da
 * operação. Devolve a data corrigida e o porquê, ou null quando está boa.
 */
function corrigirInicio(iso, criadaEm, agora) {
  if (!ehISO(iso)) return { valor: agora, motivo: 'data ausente ou inválida' };
  const d = soData(iso);
  if (d > soData(agora)) return { valor: agora, motivo: 'data no futuro' };
  const nasc = soData(criadaEm);
  if (nasc && d < nasc) return { valor: criadaEm, motivo: 'data anterior à criação da operação' };
  return null;
}

const indexarOps = db => {
  const m = new Map();
  (db && Array.isArray(db.ops) ? db.ops : []).forEach(o => { if (o && o.id) m.set(o.id, o); });
  return m;
};

/**
 * Normaliza as operações do banco recebido contra o banco atual do servidor.
 * Muta `recebido` (é o corpo da requisição, descartado logo depois) e devolve
 * o que foi corrigido, para quem chamar poder registrar.
 */
function normalizarStatus(atual, recebido, opts) {
  const agora = (opts && opts.agora) || new Date().toISOString();
  if (!recebido || !Array.isArray(recebido.ops)) return { carimbadas: 0, historico: 0, corrigidas: [] };

  const antes = indexarOps(atual);
  if (!Array.isArray(recebido.opStatusHist)) recebido.opStatusHist = [];
  const hist = recebido.opStatusHist;

  // Uma linha por (operação, etapa de destino, instante) já basta para saber se
  // a mudança foi registrada — não adianta procurar igualdade exata, porque o
  // cliente grava campos a mais.
  const jaTem = new Set(hist.map(h => h && `${h.op}|${h.para}|${soData(h.em)}`));

  let carimbadas = 0, historico = 0;
  const corrigidas = [];

  recebido.ops.forEach(o => {
    if (!o || !o.id) return;
    const velha = antes.get(o.id);
    const de = velha ? (velha.status || '') : '';
    const mudou = !velha || de !== (o.status || '');

    if (!o.criadaEm) o.criadaEm = (velha && velha.criadaEm) || o.statusEm || agora;

    // Etapa mudou mas a data continua a da etapa anterior: o cliente não
    // carimbou. Carimba aqui, senão o prazo da etapa nova nasceria vencido.
    if (mudou && (!o.statusEm || (velha && o.statusEm === velha.statusEm))) {
      o.statusEm = agora;
      delete o.statusEstimado;
      carimbadas++;
    }
    if (!o.statusEm) { o.statusEm = o.criadaEm; carimbadas++; }

    const conserto = corrigirInicio(o.statusEm, o.criadaEm, agora);
    if (conserto) {
      corrigidas.push({ op: o.id, de: o.statusEm, para: conserto.valor, motivo: conserto.motivo });
      o.statusEm = conserto.valor;
    }

    if (mudou && o.status) {
      const chave = `${o.id}|${o.status}|${soData(o.statusEm)}`;
      if (!jaTem.has(chave)) {
        hist.push({
          _id: novoId(), op: o.id, de, para: o.status, em: o.statusEm,
          // quando começou a etapa que ficou para trás — é daqui que uma
          // reversão tira a data para devolver a contagem
          deEm: (velha && velha.statusEm) || '',
          por: (o.statusPor || 'sistema'), tipo: 'mudanca', origem: 'servidor'
        });
        jaTem.add(chave);
        historico++;
      }
    }
  });

  return { carimbadas, historico, corrigidas };
}

/** Dias corridos numa etapa. Mesma conta do front, para os dois não divergirem. */
function diasNoStatus(op, agora) {
  if (!op || !ehISO(op.statusEm)) return null;
  const a = new Date(soData(agora || new Date().toISOString()) + 'T12:00:00');
  const b = new Date(soData(op.statusEm) + 'T12:00:00');
  return Math.max(0, Math.round((a - b) / MS_DIA));
}

module.exports = { normalizarStatus, corrigirInicio, diasNoStatus };
