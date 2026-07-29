const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const uploadMiddleware = require('./middlewares/upload.middleware');
const cotacoesRoutes = require('./routes/cotacoes.routes');
const { criarTarefaOperacao } = require('./integrations/clickup.service');
const { uploadParaGoogleDrive } = require('./integrations/drive.service');
const { uploadParaSupabase } = require('./integrations/supabase.service');

const app = express();

// Middlewares Globais
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir arquivos de upload local estaticamente
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Servir o Front-End HTML estaticamente se colocado na pasta public
app.use(express.static(path.join(__dirname, '../public')));

const fs = require('fs');
const DB_FILE_PATH = path.join(__dirname, '../data/db.json');

if (!fs.existsSync(path.dirname(DB_FILE_PATH))) {
  fs.mkdirSync(path.dirname(DB_FILE_PATH), { recursive: true });
}

let memoryDB = null;
if (fs.existsSync(DB_FILE_PATH)) {
  try {
    memoryDB = JSON.parse(fs.readFileSync(DB_FILE_PATH, 'utf8'));
  } catch (e) {}
}

const { buscarNCM, pesquisarNCMs } = require('./services/ncm.service');

// Rotas da API REST
app.use('/api/cotacoes', cotacoesRoutes);

// Rotas do Banco Central Sincronizado (Multi-usuário)
app.get('/api/db', (req, res) => {
  if (memoryDB) {
    return res.json({ success: true, db: memoryDB });
  }
  return res.json({ success: true, db: null });
});

app.post('/api/db', (req, res) => {
  try {
    const newDB = req.body;
    if (!newDB || typeof newDB !== 'object') {
      return res.status(400).json({ success: false, message: 'Dados de banco de dados inválidos.' });
    }
    memoryDB = newDB;
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(memoryDB, null, 2), 'utf8');
    res.json({ success: true, message: 'Banco central sincronizado com sucesso!' });
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

// Rota para Sincronizar Operação com ClickUp
app.post('/api/integrations/clickup/tarefa', async (req, res) => {
  try {
    const opData = req.body;
    const task = await criarTarefaOperacao(opData);
    res.status(200).json({ success: true, task });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota de Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date(), app: 'WindGate Backend API' });
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

