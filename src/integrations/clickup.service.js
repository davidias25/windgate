const axios = require('axios');

/**
 * Serviço de Integração com a API do ClickUp v2
 */

// Rótulos legíveis dos status internos do sistema (espelham STATUS_OP do front-end).
// O ClickUp rejeita a tarefa inteira ("Status not found") quando recebe uma chave
// que não existe na lista, então nunca mandamos a chave crua sem conferir antes.
const STATUS_LABELS = {
  cotacao: 'Cotação',
  contrato: 'Contrato / Fechamento',
  producao: 'Em produção',
  embarcado: 'Embarcado · Em trânsito',
  chegada: 'Chegada · Desembaraço',
  logistica: 'Logística nacional',
  documentacao: 'Trâmite documental',
  entregue: 'Entregue',
  concluida: 'Concluída',
  travada: 'Travada'
};

const norm = s => String(s || '')
  .normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Vocabulário da lista "Base do controle de operacoes" → status interno do sistema.
// Status desconhecidos caem no fallback por tipo (open/custom/closed).
const STATUS_CLICKUP_PARA_INTERNO = {
  'pendente': 'cotacao',
  'estudo de viabilidade': 'cotacao',
  'ass de impo': 'contrato',
  'impo em producao na china': 'producao',
  'pronto para embarque': 'producao',
  'aguardando retirada': 'producao',
  'retirado da fabrica': 'producao',
  'impo embarcada': 'embarcado',
  'impo em desembaraco': 'chegada',
  'nacionalizado': 'logistica',
  'carga no destino': 'entregue',
  'impo finalizada 2026': 'concluida'
};

// Caminho inverso: status interno → nome preferido no ClickUp, usado ao escrever.
const STATUS_INTERNO_PARA_CLICKUP = {
  cotacao: 'estudo de viabilidade',
  contrato: 'ass de impo',
  producao: 'impo em producao na china',
  embarcado: 'impo embarcada',
  chegada: 'impo em desembaraco',
  documentacao: 'impo em desembaraco',
  logistica: 'nacionalizado',
  entregue: 'carga no destino',
  concluida: 'impo finalizada 2026',
  travada: 'pendente'
};

// Fase de cada status interno, usada quando a lista do ClickUp não tem um status
// com o mesmo nome (o caso normal: listas costumam ter só aberto/andamento/fechado).
const FASE = {
  cotacao: 'aberto',
  contrato: 'aberto',
  producao: 'andamento',
  embarcado: 'andamento',
  chegada: 'andamento',
  logistica: 'andamento',
  documentacao: 'andamento',
  travada: 'andamento',
  entregue: 'fechado',
  concluida: 'fechado'
};

let _statusCache = null;

async function statusesDaLista(listId, headers) {
  if (_statusCache && _statusCache.listId === listId) return _statusCache.statuses;
  try {
    const { data } = await axios.get(`https://api.clickup.com/api/v2/list/${listId}`, { headers });
    const statuses = (data && data.statuses || [])
      .filter(s => s && s.status)
      .map(s => ({ status: s.status, type: s.type }));
    _statusCache = { listId, statuses };
    return statuses;
  } catch (e) {
    _statusCache = { listId, statuses: [] };
    return [];
  }
}

/** Converte o status interno no status equivalente da lista, ou null se não houver. */
function resolverStatus(statuses, statusInterno) {
  if (!statusInterno || !statuses || !statuses.length) return null;
  const lista = statuses.map(s => (typeof s === 'string' ? { status: s, type: 'custom' } : s));

  // 1) mesmo nome (ignorando acentos e pontuação)
  const candidatos = [
    STATUS_INTERNO_PARA_CLICKUP[statusInterno],
    STATUS_LABELS[statusInterno],
    statusInterno
  ].filter(Boolean).map(norm);
  const exato = lista.find(s => candidatos.includes(norm(s.status)));
  if (exato) return exato.status;
  const parcial = lista.find(s => candidatos.some(c => norm(s.status).includes(c) || c.includes(norm(s.status))));
  if (parcial) return parcial.status;

  // 2) mesma fase — mapeia pelo tipo do status na lista do ClickUp
  const porTipo = t => lista.find(s => s.type === t);
  switch (FASE[statusInterno]) {
    case 'fechado':   return (porTipo('closed') || porTipo('done') || {}).status || null;
    case 'andamento': return (porTipo('custom') || porTipo('open') || {}).status || null;
    case 'aberto':    return (porTipo('open') || {}).status || null;
    default:          return null;
  }
}

/** Status do ClickUp → status interno, com fallback pelo tipo do status. */
function statusInterno(statusClickUp, tipo) {
  const direto = STATUS_CLICKUP_PARA_INTERNO[norm(statusClickUp)];
  if (direto) return direto;
  if (tipo === 'closed' || tipo === 'done') return 'concluida';
  if (tipo === 'unstarted') return 'cotacao';
  return 'producao';
}

// "OP19 Gisbom" → OP19 · "OP03.1 Cabrinha Sri Lanka" → OP03.1 · "Kites Cabrinha OP02" → OP02
const RE_CODIGO = /\b(OP\s?\d+(?:\.\d+)?|ASS\s?\d+|EXPO\s?\d+)\b/i;

/** Converte uma tarefa do ClickUp no formato de operação da Torre de Controle. */
function operacaoDaTarefa(task) {
  const nomeCompleto = String(task.name || '').trim();
  const m = nomeCompleto.match(RE_CODIGO);
  const codigo = m ? m[1].toUpperCase().replace(/\s+/g, '') : null;

  // Nome sem o código, para não repetir "OP19" no card que já mostra o código.
  let nome = m ? nomeCompleto.replace(m[0], '').trim() : nomeCompleto;
  nome = nome.replace(/^[-–·:,\s]+|[-–·:,\s]+$/g, '') || nomeCompleto;

  const st = task.status || {};
  return {
    id: codigo,                       // null quando a tarefa não tem código — resolvido em listarOperacoes
    nome,
    cliente: nome,
    status: statusInterno(st.status, st.type),
    statusClickUp: st.status || '',
    clickupTaskId: task.id,
    clickupUrl: task.url || '',
    origem: 'clickup'
  };
}

/** Gera um código para operações do ClickUp que não seguem o padrão OPxx. */
function codigoAlternativo(nome, usados) {
  const base = (norm(nome).split(' ')[0] || 'op').toUpperCase().slice(0, 10);
  let cod = base;
  let n = 2;
  while (usados.has(cod)) cod = `${base}-${n++}`;
  return cod;
}

/**
 * Lê a lista de operações do ClickUp (a "Base do controle de operacoes") e devolve
 * cada tarefa já traduzida para o formato da Torre de Controle.
 */
async function listarOperacoes() {
  const token = process.env.CLICKUP_API_TOKEN;
  const listId = process.env.CLICKUP_OPS_LIST_ID || process.env.CLICKUP_LIST_ID;

  if (!token || !listId || token.includes('seu_token') || listId.includes('sua_list_id')) {
    return { ops: [], erro: 'ClickUp não configurado: defina CLICKUP_API_TOKEN e CLICKUP_OPS_LIST_ID no .env.' };
  }

  const headers = { 'Authorization': token };
  const tarefas = [];

  try {
    for (let page = 0; page < 20; page++) {
      const { data } = await axios.get(`https://api.clickup.com/api/v2/list/${listId}/task`, {
        headers,
        params: { page, subtasks: false, include_closed: true, archived: false }
      });
      tarefas.push(...(data.tasks || []));
      if (data.last_page || !(data.tasks || []).length) break;
    }
  } catch (error) {
    const err = error.response?.data?.err || error.message;
    const semAcesso = /access/i.test(err);
    console.warn('⚠️ Não foi possível ler as operações do ClickUp:', err);
    return {
      ops: [],
      erro: semAcesso
        ? `O token do ClickUp não tem acesso à lista de operações (${listId}). Gere um token de uma conta com acesso ao Space WindGate, ou compartilhe o Space com a conta do token.`
        : `Erro ao consultar o ClickUp: ${err}`
    };
  }

  const usados = new Set();
  const ops = tarefas.map(operacaoDaTarefa).map(op => {
    op.id = op.id && !usados.has(op.id) ? op.id : (op.id || codigoAlternativo(op.nome, usados));
    usados.add(op.id);
    return op;
  });

  return { ops, erro: null };
}

function montarTarefa(opData) {
  return {
    name: `${opData.id || 'OP-DEF'} - ${opData.cliente || 'Sem cliente'} (${opData.nome || 'Operação'})`,
    description: `Operação sincronizada pelo Sistema WindGate.\n\n` +
                 `• Status: ${STATUS_LABELS[opData.status] || opData.status || 'Pendente'}\n` +
                 `• Responsável: ${opData.resp || 'Não definido'}\n` +
                 `• Próxima Ação: ${opData.prox || 'Pendente'}\n` +
                 `• Obs: ${opData.obs || 'Nenhuma'}`
  };
}

/**
 * Cria a tarefa da operação no ClickUp — ou atualiza a tarefa existente quando a
 * operação já carrega um clickupTaskId, para não gerar uma tarefa nova a cada
 * salvamento da mesma operação.
 */
async function criarTarefaOperacao(opData) {
  const token = process.env.CLICKUP_API_TOKEN;
  const listId = process.env.CLICKUP_LIST_ID;

  if (!token || !listId || token.includes('seu_token') || listId.includes('sua_list_id')) {
    console.warn('⚠️ Token do ClickUp ou LIST_ID não configurados ou contêm valores padrão no .env');
    return null;
  }

  const headers = { 'Authorization': token, 'Content-Type': 'application/json' };

  try {
    const body = montarTarefa(opData || {});
    const status = resolverStatus(await statusesDaLista(listId, headers), opData && opData.status);
    if (status) body.status = status;
    else if (opData && opData.status) {
      console.warn(`ℹ️ Sem status equivalente a "${opData.status}" na lista do ClickUp — usando o status padrão da lista.`);
    }

    const taskId = opData && opData.clickupTaskId;
    const response = taskId
      ? await axios.put(`https://api.clickup.com/api/v2/task/${taskId}`, body, { headers })
      : await axios.post(`https://api.clickup.com/api/v2/list/${listId}/task`, body, { headers });

    console.log(`✅ Tarefa ${taskId ? 'atualizada' : 'criada'} no ClickUp! Task ID:`, response.data.id);
    return response.data;
  } catch (error) {
    console.warn('⚠️ Não foi possível sincronizar a tarefa no ClickUp:', error.response?.data?.err || error.message);
    return null;
  }
}

module.exports = {
  criarTarefaOperacao,
  listarOperacoes,
  operacaoDaTarefa,
  resolverStatus,
  statusInterno,
  STATUS_LABELS
};
