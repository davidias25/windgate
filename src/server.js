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
const { normalizarStatus } = require('./services/op-status.service');
const { consultarTratamento } = require('./integrations/siscomex.service');
const aliquotas = require('./services/aliquotas.service');
const dbStore = require('./services/db-store.service');
const historico = require('./services/historico.service');
const auth = require('./services/auth.service');
const pontoStore = require('./services/ponto-store.service');

// O banco é carregado de forma assíncrona (vem do Supabase Storage). As rotas
// esperam essa carga terminar para não responderem "vazio" durante o boot —
// responder null aqui faria o navegador achar que o banco foi zerado.
let memoryDB = null;
/* Se a nuvem não respondeu no boot, o que está em memória pode ser o arquivo
   vazio do repositório — e aceitar a cópia de um navegador em cima disso faz
   a cópia dele VIRAR o banco, apagando o que os outros têm. Nesse estado o
   servidor recusa gravação até alguém olhar. */
let bancoIncerto = false;
const bancoPronto = dbStore.carregar(DB_FILE_PATH)
  .then(db => {
    memoryDB = db;
    bancoIncerto = !db;
    if (bancoIncerto) console.error('⛔ Banco central não carregou. GRAVAÇÕES RECUSADAS até o boot ser refeito com a nuvem respondendo.');
  })
  .catch(err => {
    console.warn('⚠️ Falha ao carregar o banco central:', err.message);
    bancoIncerto = true;
    console.error('⛔ GRAVAÇÕES RECUSADAS: sem saber o estado real, aceitar uma cópia é apagar o resto.');
  });

// Rotas da API REST
app.use('/api/cotacoes', cotacoesRoutes);

// Rotas do Banco Central Sincronizado (Multi-usuário)
app.get('/api/db', auth.exigirTokenSeAtiva, async (req, res) => {
  await bancoPronto;
  return res.json({ success: true, db: memoryDB || null });
});

app.post('/api/db', auth.exigirTokenSeAtiva, async (req, res) => {
  try {
    await bancoPronto;
    const newDB = req.body;
    if (!newDB || typeof newDB !== 'object') {
      return res.status(400).json({ success: false, message: 'Dados de banco de dados inválidos.' });
    }

    /* TRAVA — sem saber o estado real, aceitar a cópia de um navegador é deixar
       que ela VIRE o banco. Recusar é o único caminho que não perde dado. */
    if (bancoIncerto) {
      return res.status(503).json({ success: false, bancoIncerto: true,
        message: 'O servidor não conseguiu carregar o banco central no início. Gravação recusada para não sobrescrever os dados. Reinicie o serviço com a nuvem respondendo.' });
    }

    /* Gravação que REMOVE registro tira a fotografia ANTES de aplicar: depois
       já não há estado anterior para guardar. O caso comum não remove nada e
       nem passa por aqui. */
    const saindo = historico.perdas(memoryDB, newDB);
    if (Object.keys(saindo).length) {
      const resumo = Object.entries(saindo).map(([k, n]) => `${n} em ${k}`).join(', ');
      console.log(`📸 Fotografia antes de remoção: ${resumo}`);
      await historico.fotografar(memoryDB, `antes-de-remover (${resumo})`);
    }
    // Guarda a versão anterior antes de sobrescrever — o banco central é a única
    // cópia das operações, então uma gravação ruim não pode ser irreversível.
    if (fs.existsSync(DB_FILE_PATH)) {
      try {
        fs.copyFileSync(DB_FILE_PATH, DB_FILE_PATH + '.bak');
      } catch (e) {}
    }

    // Carimba a data da etapa e o histórico do que chegou sem eles, e recusa
    // data impossível. Roda antes da mesclagem, com o banco anterior à vista —
    // é a comparação com ele que revela que a etapa mudou.
    const st = normalizarStatus(memoryDB, newDB);
    if (st.carimbadas || st.historico || st.corrigidas.length) {
      console.log(`↻ etapas: ${st.carimbadas} data(s) carimbada(s), ${st.historico} linha(s) de histórico, ${st.corrigidas.length} corrigida(s)`);
      st.corrigidas.forEach(c => console.warn(`   ⚠ ${c.op}: ${c.motivo} (${c.de} → ${c.para})`));
    }

    // Mescla em vez de substituir: sem isso, quem salva por último apaga os
    // registros que os outros usuários criaram desde a última sincronização.
    memoryDB = mesclarDB(memoryDB, newDB);
    const persistencia = await dbStore.salvar(memoryDB, DB_FILE_PATH);
    // Fotografia de rotina: a da hora gira, a do dia fica.
    const foto = await historico.fotografar(memoryDB, 'gravacao');
    res.json({
      success: true,
      message: 'Banco central sincronizado com sucesso!',
      persistidoNaNuvem: persistencia.remoto,
      historico: foto.ok
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ============================================================
   AUTENTICAÇÃO E PONTO
   ============================================================ */

if (!auth.authAtiva()) {
  console.warn('⚠️ WINDGATE_DB_SECRET ausente — autenticação DESLIGADA. As rotas seguem abertas, como já estavam.');
} else {
  console.log(`🔐 Autenticação ativa · diretoria do ponto: ${auth.DIRETORIA.join(', ')}`);
}

/* O PIN passa a ser conferido aqui, não no navegador. */
app.post('/api/auth/login', async (req, res) => {
  await bancoPronto;
  const { usuario, pin } = req.body || {};
  if (!auth.authAtiva()) {
    return res.json({ success: true, token: null, semAuth: true,
      message: 'Autenticação desligada no servidor (sem WINDGATE_DB_SECRET).' });
  }
  if (!auth.pinConfere(memoryDB, usuario, pin)) {
    // Mesma resposta para usuário inexistente e PIN errado: dizer qual dos
    // dois falhou entrega a lista de usuários a quem tenta adivinhar.
    return res.status(401).json({ success: false, message: 'Usuário ou PIN incorreto.' });
  }
  const u = (memoryDB.users || {})[usuario] || {};
  res.json({
    success: true,
    token: auth.emitirToken(usuario),
    usuario,
    nome: u.nome || usuario,
    ehDiretoria: auth.ehDiretoria(usuario),
    validadeHoras: auth.HORAS_VALIDADE
  });
});

/* Lista para a TELA DE LOGIN: só chave, nome, papel e cor. Sem PIN e sem
   mais nada — é o mínimo para desenhar os cartões de usuário antes de haver
   sessão, e por isso pode ficar aberta. */
app.get('/api/auth/usuarios', async (req, res) => {
  await bancoPronto;
  const us = (memoryDB && memoryDB.users) || {};
  res.json({ success: true, usuarios: Object.entries(us).map(([k, u]) => ({
    key: k, nome: (u && u.nome) || k, papel: (u && u.papel) || '', cor: (u && u.cor) || '#2563EB'
  })) });
});

/* Diz ao navegador se a sessão ainda vale, sem devolver dado nenhum. */
app.get('/api/auth/sessao', auth.exigirTokenSeAtiva, (req, res) => {
  res.json({ success: true, usuario: req.usuario.k, ehDiretoria: auth.ehDiretoria(req.usuario.k) });
});

/* ---------- PONTO ---------- */

const PONTO_TIPOS = ['entrada', 'almoco', 'volta', 'saida', 'outro', 'ajuste'];
const PONTO_JANELA_MS = 60 * 1000;   // clique duplicado

/* Bater ponto. O usuário vem do TOKEN — mandar outro no corpo não adianta. */
app.post('/api/ponto', auth.exigirToken, async (req, res) => {
  try {
    const dados = await pontoStore.carregar();
    const quem = req.usuario.k;
    const b = req.body || {};
    const tipo = PONTO_TIPOS.includes(b.tipo) ? b.tipo : 'outro';
    const t = pontoStore.agoraSP();

    /* Clique duplicado barrado aqui, não no botão: botão é contornável, e dois
       registros iguais em segundos sujam o relatório sem informar nada. */
    const ultimo = dados.registros.filter(r => r.usuario === quem && r.tipo === tipo).pop();
    if (ultimo && (Date.now() - new Date(ultimo.em).getTime()) < PONTO_JANELA_MS) {
      return res.status(409).json({ success: false, duplicado: true,
        message: `Você já registrou "${tipo}" há menos de 1 minuto.`, hora: ultimo.hora });
    }

    const temLocal = typeof b.lat === 'number' && typeof b.lon === 'number' && isFinite(b.lat) && isFinite(b.lon);
    const cfg = dados.config || {};
    let dentroDoRaio = null, distancia = null;
    if (temLocal && typeof cfg.lat === 'number' && typeof cfg.lon === 'number' && cfg.raio > 0) {
      distancia = pontoStore.distanciaMetros(b.lat, b.lon, cfg.lat, cfg.lon);
      dentroDoRaio = distancia <= cfg.raio;
    }

    const reg = {
      id: require('crypto').randomUUID(),
      usuario: quem,
      tipo,
      em: t.em, data: t.data, hora: t.hora, horaCompleta: t.horaCompleta,
      lat: temLocal ? b.lat : null,
      lon: temLocal ? b.lon : null,
      precisao: temLocal && isFinite(b.precisao) ? Math.round(b.precisao) : null,
      semLocalizacao: !temLocal,
      motivoSemLocal: temLocal ? '' : String(b.motivoSemLocal || '').slice(0, 200),
      dentroDoRaio, distancia,
      ip: (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(),
      userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
      // Só o ajuste carrega justificativa; os demais nascem do clique.
      justificativa: tipo === 'ajuste' ? String(b.justificativa || '').slice(0, 500) : ''
    };
    if (tipo === 'ajuste' && !reg.justificativa) {
      return res.status(400).json({ success: false, message: 'Ajuste exige justificativa.' });
    }

    dados.registros.push(reg);
    await pontoStore.salvar(dados);

    /* A resposta devolve SÓ a confirmação do horário. Quem não é diretoria não
       recebe localização nem histórico — nem o próprio. */
    res.json({ success: true, hora: reg.hora, data: reg.data, tipo: reg.tipo,
               semLocalizacao: reg.semLocalizacao });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/* Estado do botão: só o tipo do último registro de hoje. Sem horário, sem
   localização, sem histórico — o bastante para o botão saber o que oferecer. */
app.get('/api/ponto/meu-estado', auth.exigirToken, async (req, res) => {
  const dados = await pontoStore.carregar();
  const hoje = pontoStore.agoraSP().data;
  const meus = dados.registros.filter(r => r.usuario === req.usuario.k && r.data === hoje);
  const ultimo = meus[meus.length - 1];
  res.json({
    success: true,
    hoje,
    ultimoTipo: ultimo ? ultimo.tipo : null,
    ultimaHora: ultimo ? ultimo.hora : null,
    quantidadeHoje: meus.length,
    cienciaEm: (dados.ciencias || {})[req.usuario.k] || null,
    ehDiretoria: auth.ehDiretoria(req.usuario.k)
  });
});

/* Aceite do aviso de privacidade, com data e hora do servidor. */
app.post('/api/ponto/ciencia', auth.exigirToken, async (req, res) => {
  const dados = await pontoStore.carregar();
  dados.ciencias = dados.ciencias || {};
  if (!dados.ciencias[req.usuario.k]) {
    dados.ciencias[req.usuario.k] = pontoStore.agoraSP().em;
    await pontoStore.salvar(dados);
  }
  res.json({ success: true, em: dados.ciencias[req.usuario.k] });
});

/* ---------- daqui para baixo, SÓ a diretoria ---------- */

app.get('/api/ponto', auth.exigirToken, auth.exigirDiretoria, async (req, res) => {
  const dados = await pontoStore.carregar();
  const { de, ate, usuario } = req.query || {};
  const lista = dados.registros.filter(r =>
    (!de || r.data >= de) && (!ate || r.data <= ate) && (!usuario || r.usuario === usuario));
  res.json({ success: true, registros: lista, config: dados.config || {}, total: lista.length });
});

/* Resumo por pessoa e por dia: primeira entrada, última saída e horas. */
app.get('/api/ponto/resumo', auth.exigirToken, auth.exigirDiretoria, async (req, res) => {
  const dados = await pontoStore.carregar();
  const { de, ate, usuario } = req.query || {};
  const lista = dados.registros.filter(r =>
    (!de || r.data >= de) && (!ate || r.data <= ate) && (!usuario || r.usuario === usuario));
  res.json({ success: true, dias: resumirPonto(lista) });
});

app.get('/api/ponto/export.csv', auth.exigirToken, auth.exigirDiretoria, async (req, res) => {
  const dados = await pontoStore.carregar();
  const { de, ate, usuario } = req.query || {};
  const lista = dados.registros.filter(r =>
    (!de || r.data >= de) && (!ate || r.data <= ate) && (!usuario || r.usuario === usuario));
  const cab = ['data', 'hora', 'colaborador', 'tipo', 'latitude', 'longitude', 'precisao_m',
               'status_localizacao', 'dentro_do_raio', 'distancia_m', 'ip', 'dispositivo', 'justificativa'];
  const linhas = lista.map(r => [r.data, r.hora, r.usuario, r.tipo,
    r.lat == null ? '' : r.lat, r.lon == null ? '' : r.lon, r.precisao == null ? '' : r.precisao,
    r.semLocalizacao ? 'SEM LOCALIZACAO' : 'com localizacao',
    r.dentroDoRaio == null ? '' : (r.dentroDoRaio ? 'dentro' : 'fora'),
    r.distancia == null ? '' : r.distancia, r.ip, r.userAgent, r.justificativa || '']);
  const csv = [cab, ...linhas]
    .map(l => l.map(c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(';')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ponto_${de || 'inicio'}_${ate || 'hoje'}.csv"`);
  res.send('﻿' + csv);   // BOM: sem ele o Excel abre os acentos errados
});

/* Endereço do escritório e raio, para marcar cada ponto como dentro ou fora. */
app.post('/api/ponto/config', auth.exigirToken, auth.exigirDiretoria, async (req, res) => {
  const dados = await pontoStore.carregar();
  const b = req.body || {};
  dados.config = {
    lat: isFinite(b.lat) ? +b.lat : null,
    lon: isFinite(b.lon) ? +b.lon : null,
    raio: isFinite(b.raio) ? Math.max(10, +b.raio) : 150,
    rotulo: String(b.rotulo || '').slice(0, 120)
  };
  await pontoStore.salvar(dados);
  res.json({ success: true, config: dados.config });
});

/**
 * Horas do dia: soma os pares entrada→saída e desconta almoço→volta.
 * Dia com registro ímpar sai marcado como incompleto em vez de chutar o
 * horário que falta — relatório de jornada não pode inventar hora.
 */
function resumirPonto(registros) {
  const porChave = {};
  registros.forEach(r => {
    const k = r.usuario + '|' + r.data;
    (porChave[k] = porChave[k] || []).push(r);
  });
  return Object.entries(porChave).map(([k, regs]) => {
    const [usuario, data] = k.split('|');
    regs.sort((a, b) => String(a.em).localeCompare(String(b.em)));
    const min = h => { const [a, b] = String(h || '00:00').split(':').map(Number); return a * 60 + b; };
    const entradas = regs.filter(r => r.tipo === 'entrada');
    const saidas = regs.filter(r => r.tipo === 'saida');
    const almocos = regs.filter(r => r.tipo === 'almoco');
    const voltas = regs.filter(r => r.tipo === 'volta');

    let trabalhado = 0, incompleto = false;
    if (entradas.length && saidas.length) {
      trabalhado = min(saidas[saidas.length - 1].hora) - min(entradas[0].hora);
      const nInt = Math.min(almocos.length, voltas.length);
      for (let i = 0; i < nInt; i++) trabalhado -= (min(voltas[i].hora) - min(almocos[i].hora));
      if (almocos.length !== voltas.length) incompleto = true;
    } else incompleto = true;

    return {
      usuario, data,
      primeira: entradas.length ? entradas[0].hora : (regs[0] ? regs[0].hora : null),
      ultima: saidas.length ? saidas[saidas.length - 1].hora : (regs[regs.length - 1] ? regs[regs.length - 1].hora : null),
      minutos: Math.max(trabalhado, 0),
      horas: Math.max(trabalhado, 0) / 60,
      incompleto,
      registros: regs.length,
      semLocalizacao: regs.filter(r => r.semLocalizacao).length,
      precisaoRuim: regs.filter(r => r.precisao != null && r.precisao > 100).length,
      fora: regs.filter(r => r.dentroDoRaio === false).length
    };
  }).sort((a, b) => b.data.localeCompare(a.data) || a.usuario.localeCompare(b.usuario));
}

// Banco de alíquotas oficiais (TEC/Gecex + TIPI/Receita), atualizado a cada 15 dias
app.get('/api/aliquotas/status', async (req, res) => {
  await aliquotas.carregar();
  res.json({ success: true, ...aliquotas.status() });
});

app.post('/api/aliquotas/atualizar', async (req, res) => {
  const r = await aliquotas.atualizar(req.query.force === '1');
  res.status(r.ok ? 200 : 500).json({ success: r.ok, ...r, ...aliquotas.status() });
});

app.get('/api/aliquotas/:ncm', async (req, res) => {
  try {
    const r = await aliquotas.consultar(req.params.ncm);
    if (!r) {
      return res.status(200).json({
        success: false,
        encontrado: false,
        erro: aliquotas.status().carregada
          ? 'NCM não consta na TEC vigente — confira o código.'
          : 'Tabela de alíquotas ainda não carregada no servidor.'
      });
    }
    res.json({ success: true, encontrado: true, ...r });
  } catch (err) {
    res.status(500).json({ success: false, encontrado: false, erro: err.message });
  }
});

// Tratamento tributário da NCM no TTCE (regime e fundamento legal — não traz
// alíquota; serve para avisar quando a alíquota cheia não se aplica).
app.get('/api/ncm/:code/tratamento', async (req, res) => {
  try {
    const r = await consultarTratamento(req.params.code, {
      codigoPais: req.query.pais,
      data: req.query.data
    });
    res.status(200).json(Object.assign({ success: !r.erro }, r));
  } catch (err) {
    res.status(500).json({ success: false, configurado: false, erro: err.message });
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
app.post('/api/upload', auth.exigirTokenSeAtiva, uploadMiddleware.single('arquivo'), async (req, res) => {
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
app.get('/api/storage/arquivos', auth.exigirTokenSeAtiva, async (req, res) => {
  try {
    const { arquivos, erro } = await listarArquivos();
    res.status(200).json({ success: !erro, arquivos, total: arquivos.length, erro });
  } catch (error) {
    res.status(500).json({ success: false, arquivos: [], total: 0, erro: error.message });
  }
});

// Rota para Deletar Arquivos / Documentos do Supabase Storage e Servidor Local
app.delete('/api/upload', auth.exigirTokenSeAtiva, async (req, res) => {
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
    // `bancoIncerto: true` significa gravações recusadas — é o primeiro campo a
    // olhar quando alguém disser que o sistema "não está salvando".
    bancoIncerto,
    historico: historico.estado(),
    // Contagem de TODAS as coleções em lista: é por ela que se percebe sumiço
    // sem precisar baixar o banco.
    registros: memoryDB ? historico.contar(memoryDB) : null
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
  // Verifica diariamente e rebaixa as planilhas oficiais a cada 15 dias.
  aliquotas.agendar();
  app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`🚀 Servidor WindGate API rodando na porta ${PORT}`);
    console.log(`🔗 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`===================================================`);
  });
}

module.exports = app;

