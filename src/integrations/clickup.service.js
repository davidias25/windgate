const axios = require('axios');

/**
 * Serviço de Integração com a API do ClickUp v2
 */
async function criarTarefaOperacao(opData) {
  const token = process.env.CLICKUP_API_TOKEN;
  const listId = process.env.CLICKUP_LIST_ID;

  if (!token || !listId || token.includes('seu_token') || listId.includes('sua_list_id')) {
    console.warn('⚠️ Token do ClickUp ou LIST_ID não configurados ou contêm valores padrão no .env');
    return null;
  }

  try {
    const url = `https://api.clickup.com/api/v2/list/${listId}/task`;
    const body = {
      name: `${opData.id || 'OP-DEF'} - ${opData.cliente || 'Sem cliente'} (${opData.nome || 'Operação'})`,
      description: `Operação criada via Sistema WindGate.\n\n` +
                   `• Status: ${opData.status || 'Pendente'}\n` +
                   `• Responsável: ${opData.resp || 'Não definido'}\n` +
                   `• Próxima Ação: ${opData.prox || 'Pendente'}\n` +
                   `• Obs: ${opData.obs || 'Nenhuma'}`
    };
    if (opData.status) {
      body.status = opData.status;
    }

    const response = await axios.post(url, body, {
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Tarefa criada no ClickUp com sucesso! Task ID:', response.data.id);
    return response.data;
  } catch (error) {
    console.warn('⚠️ Não foi possível criar tarefa no ClickUp (verifique as credenciais):', error.response?.data?.err || error.message);
    return null;
  }
}

module.exports = { criarTarefaOperacao };
