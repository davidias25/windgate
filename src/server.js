const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const uploadMiddleware = require('./middlewares/upload.middleware');
const cotacoesRoutes = require('./routes/cotacoes.routes');
const { criarTarefaOperacao, listarOperacoes } = require('./integrations/clickup.service');
const { uploadParaGoogleDrive } = require('./integrations/drive.service');
const { uploadParaSupabase, deletarDoSupabase, listarArquivos } = require('./integrations/supabase.service');

const app = express();

// Middlewares Globais
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir arquivos de upload local estaticamente
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Servir o Front-End HTML estaticamente se colocado na pasta public.
// O sistema inteiro é um único index.html, então o HTML nunca pode vir de cache:
// senão uma aba aberta continua rodando a versão antiga depois de uma atualização.
app.use(express.static(path.join(__dirname, '../public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));

const fs = require('fs');
// Permite apontar o banco central para outro arquivo (usado pelos testes, para que
// a suíte nunca sobrescreva o banco real em data/db.json).
const DB_FILE_PATH = process.env.WINDGATE_DB_FILE
  ? path.resolve(process.env.WINDGATE_DB_FILE)
  : path.join(__dirname, '../data/db.json');

if (!fs.existsSync(path.dirname(DB_FILE_PATH))) {
  fs.mkdirSync(path.dirname(DB_FILE_PATH), { recursive: true });
}

const { buscarNCM, pesquisarNCMs } = require('./services/ncm.service');
const { mesclarDB } = require('./services/db-merge.service');
const dbStore = require('./services/db-store.service');

// O banco é carregado de forma assíncrona (vem do Supabase Storage). As rotas
// esperam essa carga terminar para não responderem "vazio" durante o boot —
// responder null aqui faria o navegador achar que o banco foi zerado.
let memoryDB = null;
const bancoPronto = dbStore.carregar(DB_FILE_PATH)
  .then(db => { memoryDB = db; })
  .catch(err => { console.warn('⚠️ Falha ao carregar o banco central:', err.message); });

// Rotas da API REST
app.use('/api/cotacoes', cotacoesRoutes);

// Rotas do Banco Central Sincronizado (Multi-usuário)
app.get('/api/db', async (req, res) => {
  await bancoPronto;
  return res.json({ success: true, db: memoryDB || null });
});

app.post('/api/db', async (req, res) => {
  try {
    await bancoPronto;
    const newDB = req.body;
    if (!newDB || typeof newDB !== 'object') {
      return res.status(400).json({ success: false, message: 'Dados de banco de dados inválidos.' });
    }
    // Guarda a versão anterior antes de sobrescrever — o banco central é a única
    // cópia das operações, então uma gravação ruim não pode ser irreversível.
    if (fs.existsSync(DB_FILE_PATH)) {
      try {
        fs.copyFileSync(DB_FILE_PATH, DB_FILE_PATH + '.bak');
      } catch (e) {}
    }

    // Mescla em vez de substituir: sem isso, quem salva por último apaga os
    // registros que os outros usuários criaram desde a última sincronização.
    memoryDB = mesclarDB(memoryDB, newDB);
    const persistencia = await dbStore.salvar(memoryDB, DB_FILE_PATH);
    res.json({
      success: true,
      message: 'Banco central sincronizado com sucesso!',
      persistidoNaNuvem: persistencia.remoto
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rotas de NCM (Siscomex Classif API Oficial)
app.get('/api/ncm/pesquisa', async (req, res) => {
  try {
    const q = req.query.q || '';
    const resultados = await pesquisarNCMs(q);
    res.json({ success: true, count: resultados.length, data: resultados });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/ncm/:code', async (req, res) => {
  try {
    const code = req.params.code;
    const ncmData = await buscarNCM(code);
    if (!ncmData) {
      return res.status(404).json({ success: false, message: 'NCM não encontrado' });
    }
    res.json({ success: true, data: ncmData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rota de Upload de Arquivos / Documentos com integração opcional Google Drive & Supabase Storage
app.post('/api/upload', uploadMiddleware.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado.' });
    }

    const localUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    let driveResult = null;
    let supabaseResult = null;

    // Tenta fazer upload para o Google Drive se configurado
    try {
      driveResult = await uploadParaGoogleDrive(req.file.path, req.file.originalname, req.file.mimetype);
    } catch (driveErr) {
      console.warn('⚠️ Google Drive desativado ou sem credenciais.');
    }

    // Tenta fazer upload para o Supabase Storage se configurado
    try {
      supabaseResult = await uploadParaSupabase(req.file.path, req.file.originalname, req.file.mimetype);
    } catch (supaErr) {
      console.warn('⚠️ Supabase Storage desativado ou sem credenciais.');
    }

    const finalUrl = (supabaseResult && supabaseResult.publicUrl) || localUrl;

    res.status(200).json({
      success: true,
      message: 'Arquivo armazenado com sucesso!',
      localUrl: localUrl,
      supabaseUrl: supabaseResult ? supabaseResult.publicUrl : null,
      finalUrl: finalUrl,
      fileName: req.file.filename,
      originalName: req.file.originalname,
      driveLink: driveResult ? driveResult.webViewLink : null
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para reencontrar no Storage os arquivos que já foram enviados,
// para recompor a aba Documentos sem precisar subir tudo de novo.
app.get('/api/storage/arquivos', async (req, res) => {
  try {
    const { arquivos, erro } = await listarArquivos();
    res.status(200).json({ success: !erro, arquivos, total: arquivos.length, erro });
  } catch (error) {
    res.status(500).json({ success: false, arquivos: [], total: 0, erro: error.message });
  }
});

// Rota para Deletar Arquivos / Documentos do Supabase Storage e Servidor Local
app.delete('/api/upload', async (req, res) => {
  try {
    const targetUrl = (req.body && req.body.url) || req.query.url;
    if (!targetUrl) {
      return res.status(400).json({ success: false, message: 'URL do arquivo não informada.' });
    }

    let supaDeleted = false;
    let localDeleted = false;

    try {
      supaDeleted = await deletarDoSupabase(targetUrl);
    } catch (e) {}

    try {
      const cleanName = path.basename(targetUrl);
      const localFilePath = path.join(__dirname, '../uploads', cleanName);
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
        localDeleted = true;
      }
    } catch (e) {}

    res.json({
      success: true,
      message: 'Arquivo deletado com sucesso do servidor e Supabase storage!',
      supaDeleted,
      localDeleted
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para trazer as operações cadastradas no ClickUp para a Torre de Controle
app.get('/api/integrations/clickup/operacoes', async (req, res) => {
  try {
    const { ops, erro } = await listarOperacoes();
    res.status(200).json({ success: !erro, ops, total: ops.length, erro });
  } catch (error) {
    res.status(500).json({ success: false, ops: [], total: 0, erro: error.message });
  }
});

// Rota para Sincronizar Operação com ClickUp
app.post('/api/integrations/clickup/tarefa', async (req, res) => {
  try {
    const opData = req.body;
    const task = await criarTarefaOperacao(opData);
    res.status(200).json({
      success: true,
      task,
      taskId: task ? task.id : null,
      taskUrl: task ? task.url : null
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota de Health Check
app.get('/api/health', async (req, res) => {
  await bancoPronto;
  res.json({
    status: 'OK',
    timestamp: new Date(),
    app: 'WindGate Backend API',
    // Permite conferir de fora se o banco está sendo guardado fora do disco
    // efêmero do Render — sem isso a perda de dados só aparece no próximo reinício.
    persistencia: dbStore.estado(),
    registros: memoryDB
      ? { ops: (memoryDB.ops || []).length, docs: (memoryDB.docs || []).length, fin: (memoryDB.fin || []).length }
      : null
  });
});

// Middleware global de tratamento de erros (ex: multer fileFilter errors)
app.use((err, req, res, next) => {
  if (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
});

// Porta do Servidor
const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`🚀 Servidor WindGate API rodando na porta ${PORT}`);
    console.log(`🔗 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`===================================================`);
  });
}

module.exports = app;

