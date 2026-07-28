// Banco de dados em memória/arquivo local para demonstração inicial
let cotacoesDB = [];

/**
 * Controller de Cotações
 */
exports.salvarCotacao = async (req, res) => {
  try {
    const cotacao = req.body;
    if (!cotacao || !cotacao.fields) {
      return res.status(400).json({ success: false, message: 'Dados da cotação inválidos.' });
    }

    const id = cotacao.id || `COT-${Date.now()}`;
    const novaCotacao = {
      ...cotacao,
      id,
      atualizadoEm: new Date().toISOString()
    };

    const index = cotacoesDB.findIndex(c => c.id === id);
    if (index >= 0) {
      cotacoesDB[index] = novaCotacao;
    } else {
      cotacoesDB.unshift(novaCotacao);
    }

    return res.status(200).json({
      success: true,
      message: 'Cotação salva com sucesso!',
      id,
      cotacao: novaCotacao
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

exports.listarCotacoes = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: cotacoesDB
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

exports.obterCotacaoPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const cotacao = cotacoesDB.find(c => c.id === id);
    if (!cotacao) {
      return res.status(404).json({ success: false, message: 'Cotação não encontrada.' });
    }
    return res.status(200).json({ success: true, cotacao });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
