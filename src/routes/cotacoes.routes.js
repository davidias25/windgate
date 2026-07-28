const express = require('express');
const router = express.Router();
const cotacoesController = require('../controllers/cotacoes.controller');

router.post('/', cotacoesController.salvarCotacao);
router.get('/', cotacoesController.listarCotacoes);
router.get('/:id', cotacoesController.obterCotacaoPorId);

module.exports = router;
