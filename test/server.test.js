const path = require('path');
const fs = require('fs');
const os = require('os');

// O banco central é o arquivo real das operações. A suíte grava um DB de teste
// em /api/db, então precisa apontar para um arquivo temporário ANTES de carregar
// o servidor — do contrário zera as operações da Torre de Controle.
const TEST_DB_FILE = path.join(os.tmpdir(), `windgate-test-db-${process.pid}.json`);
process.env.WINDGATE_DB_FILE = TEST_DB_FILE;

// O upload de teste ia para o bucket real do Supabase a cada execução — o
// Storage acumulou dezenas de "test_document.pdf". A rota continua sendo
// testada; só o envio para a nuvem fica desligado.
process.env.SUPABASE_DISABLED = '1';

const app = require('../src/server');
const { criarTarefaOperacao, operacaoDaTarefa, statusInterno } = require('../src/integrations/clickup.service');
const { mesclarDB } = require('../src/services/db-merge.service');

async function runTests() {
  console.log('🧪 Iniciando suíte de testes de integração do WindGate Backend...\n');
  let failures = 0;
  let passed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASSED: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${message}`);
      failures++;
    }
  }

  const REAL_DB_FILE = path.join(__dirname, '../data/db.json');
  const lerBancoReal = () => fs.existsSync(REAL_DB_FILE) ? fs.readFileSync(REAL_DB_FILE, 'utf8') : null;
  const bancoRealAntes = lerBancoReal();

  const server = app.listen(0); // Random free port
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Health Check
    console.log('--- Testando Health Check ---');
    const resHealth = await fetch(`${baseUrl}/api/health`);
    const jsonHealth = await resHealth.json();
    assert(resHealth.status === 200, 'GET /api/health retorna HTTP 200');
    assert(jsonHealth.status === 'OK', 'GET /api/health retorna status OK');

    // 1.7. Testar API de NCM (Siscomex Classif)
    console.log('\n--- Testando NCM API (Siscomex Classif) ---');
    const resNcm = await fetch(`${baseUrl}/api/ncm/73089090`);
    const jsonNcm = await resNcm.json();
    assert(resNcm.status === 200, 'GET /api/ncm/73089090 retorna HTTP 200');
    assert(jsonNcm.success === true, 'GET /api/ncm/73089090 retorna success = true');
    assert(jsonNcm.data && jsonNcm.data.ii !== undefined, 'GET /api/ncm/73089090 retorna dados de alíquota II');

    const resNcmSearch = await fetch(`${baseUrl}/api/ncm/pesquisa?q=escora`);
    const jsonNcmSearch = await resNcmSearch.json();
    assert(resNcmSearch.status === 200, 'GET /api/ncm/pesquisa retorna HTTP 200');
    assert(jsonNcmSearch.success === true, 'GET /api/ncm/pesquisa retorna success = true');

    // 1.8. Testar API de Banco de Dados Centralizado (Sincronização Multi-usuário)
    console.log('\n--- Testando Central DB API (Sincronização Multi-usuário) ---');
    const resDbGet = await fetch(`${baseUrl}/api/db`);
    const jsonDbGet = await resDbGet.json();
    assert(resDbGet.status === 200, 'GET /api/db retorna HTTP 200');
    assert(jsonDbGet.success === true, 'GET /api/db retorna success = true');

    const resDbPost = await fetch(`${baseUrl}/api/db`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops: [], docs: [{ op: 'OP10', nome: 'Invoice.pdf' }] })
    });
    const jsonDbPost = await resDbPost.json();
    assert(resDbPost.status === 200, 'POST /api/db retorna HTTP 200');
    assert(jsonDbPost.success === true, 'POST /api/db atualiza o banco central com sucesso');
    assert(fs.existsSync(TEST_DB_FILE), 'POST /api/db grava no arquivo de teste, não no banco real');
    assert(bancoRealAntes === lerBancoReal(), 'POST /api/db NÃO altera data/db.json (operações preservadas)');

    // 2. Criar Cotação (POST /api/cotacoes)
    console.log('\n--- Testando Cotações API ---');
    const mockCotacao = {
      id: 'COT-TEST-001',
      cliente: 'Cliente Teste LTDA',
      fields: {
        origem: 'Santos, BR',
        destino: 'Hamburg, DE',
        tipo: 'FCL',
        valor: 2500.00
      }
    };
    const resPostCot = await fetch(`${baseUrl}/api/cotacoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mockCotacao)
    });
    const jsonPostCot = await resPostCot.json();
    assert(resPostCot.status === 200, 'POST /api/cotacoes retorna HTTP 200');
    assert(jsonPostCot.success === true, 'POST /api/cotacoes retorna success = true');
    assert(jsonPostCot.id === 'COT-TEST-001', 'POST /api/cotacoes retorna o ID correto');

    // 3. Listar Cotações (GET /api/cotacoes)
    const resGetCot = await fetch(`${baseUrl}/api/cotacoes`);
    const jsonGetCot = await resGetCot.json();
    assert(resGetCot.status === 200, 'GET /api/cotacoes retorna HTTP 200');
    assert(Array.isArray(jsonGetCot.data), 'GET /api/cotacoes retorna array de dados');
    assert(jsonGetCot.data.some(c => c.id === 'COT-TEST-001'), 'GET /api/cotacoes inclui cotação criada');

    // 4. Obter Cotação por ID (GET /api/cotacoes/:id)
    const resGetId = await fetch(`${baseUrl}/api/cotacoes/COT-TEST-001`);
    const jsonGetId = await resGetId.json();
    assert(resGetId.status === 200, 'GET /api/cotacoes/COT-TEST-001 retorna HTTP 200');
    assert(jsonGetId.cotacao && jsonGetId.cotacao.cliente === 'Cliente Teste LTDA', 'GET por ID traz dados do cliente');

    // 5. Cotação Inexistente (404)
    const resGet404 = await fetch(`${baseUrl}/api/cotacoes/COT-INEXISTENTE`);
    assert(resGet404.status === 404, 'GET /api/cotacoes/COT-INEXISTENTE retorna HTTP 404');

    // 6. Testar Integrações - ClickUp
    console.log('\n--- Testando Integrações ---');
    const clickupResult = await criarTarefaOperacao({ id: 'OP-123', cliente: 'Cliente Teste' });
    assert(clickupResult !== undefined, 'criarTarefaOperacao executa sem lançar exceções unhandled');
    if (clickupResult && clickupResult.id) {
      assert(typeof clickupResult.id === 'string', 'criarTarefaOperacao cria tarefa com sucesso no ClickUp e retorna ID');
    }

    // 1.9. Mesclagem do banco central (gravações concorrentes)
    console.log('\n--- Testando Mesclagem do Banco Central (multi-usuário) ---');
    const estadoBase = { docs: [{ _id: 'x', nome: 'antigo' }], ops: [] };

    // Dois usuários que carregaram o mesmo estado salvam documentos diferentes
    const doSamir = { docs: [{ _id: 's', nome: 'BL do Samir' }, { _id: 'x', nome: 'antigo' }], ops: [] };
    const daIvina = { docs: [{ _id: 'i', nome: 'PL da Ivina' }, { _id: 'x', nome: 'antigo' }], ops: [] };
    let mesclado = mesclarDB(mesclarDB(estadoBase, doSamir), daIvina);
    const nomes = mesclado.docs.map(d => d.nome);
    assert(nomes.includes('BL do Samir') && nomes.includes('PL da Ivina'),
      'Gravações concorrentes preservam os documentos dos dois usuários');
    assert(mesclado.docs.length === 3, 'Mesclagem não duplica o documento que ambos já tinham');

    // Edição de um registro existente não vira um segundo registro
    mesclado = mesclarDB(mesclado, { docs: [{ _id: 'i', nome: 'PL da Ivina', status: 'aprovado' }] });
    assert(mesclado.docs.length === 3, 'Editar um documento não cria duplicata');
    assert(mesclado.docs.find(d => d._id === 'i').status === 'aprovado', 'Edição prevalece sobre a cópia do servidor');

    // Exclusão precisa vencer a cópia desatualizada de quem não sincronizou
    mesclado = mesclarDB(mesclado, { docs: [{ _id: 'x', nome: 'antigo' }], _removidos: { s: Date.now() } });
    assert(!mesclado.docs.some(d => d._id === 's'), 'Documento excluído sai do banco central');
    mesclado = mesclarDB(mesclado, doSamir);
    assert(!mesclado.docs.some(d => d._id === 's'), 'Documento excluído não ressuscita quando um cliente antigo salva');

    const resMerge1 = await fetch(`${baseUrl}/api/db`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docs: [{ _id: 'api-1', nome: 'Doc A' }] })
    });
    await resMerge1.json();
    await fetch(`${baseUrl}/api/db`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docs: [{ _id: 'api-2', nome: 'Doc B' }] })
    });
    const aposMerge = (await (await fetch(`${baseUrl}/api/db`)).json()).db;
    assert(aposMerge.docs.some(d => d._id === 'api-1') && aposMerge.docs.some(d => d._id === 'api-2'),
      'POST /api/db mescla em vez de substituir — nenhum documento é perdido');

    // 6.4. Listagem do Storage (recuperar documentos já enviados)
    console.log('\n--- Testando Listagem do Supabase Storage ---');
    const resArq = await fetch(`${baseUrl}/api/storage/arquivos`);
    const jsonArq = await resArq.json();
    assert(resArq.status === 200, 'GET /api/storage/arquivos retorna HTTP 200');
    assert(Array.isArray(jsonArq.arquivos), 'GET /api/storage/arquivos retorna array de arquivos');
    assert(jsonArq.success === true || typeof jsonArq.erro === 'string',
      'Storage indisponível devolve erro legível em vez de falhar em silêncio');

    // 6.5. Importação das operações do ClickUp para a Torre de Controle
    console.log('\n--- Testando Importação de Operações do ClickUp ---');
    const op19 = operacaoDaTarefa({
      id: 't1', name: 'OP19 Gisbom', url: 'https://app.clickup.com/t/t1',
      status: { status: 'impo em producao na china', type: 'open' }
    });
    assert(op19.id === 'OP19', 'operacaoDaTarefa extrai o código OPxx do nome da tarefa');
    assert(op19.nome === 'Gisbom', 'operacaoDaTarefa remove o código do nome exibido');
    assert(op19.status === 'producao', 'operacaoDaTarefa traduz o status do ClickUp para o status interno');
    assert(op19.clickupTaskId === 't1', 'operacaoDaTarefa preserva o id da tarefa para evitar duplicidade');

    const opSub = operacaoDaTarefa({ id: 't2', name: 'OP03.1 Cabrinha Sri Lanka', status: { status: 'impo finalizada 2026', type: 'done' } });
    assert(opSub.id === 'OP03.1', 'operacaoDaTarefa aceita códigos com subnúmero (OP03.1)');
    assert(opSub.status === 'concluida', 'Status "impo finalizada" vira "concluida"');

    const opSemCodigo = operacaoDaTarefa({ id: 't3', name: 'Motopecas - Igor', status: { status: 'estudo de viabilidade', type: 'custom' } });
    assert(opSemCodigo.id === null, 'Tarefa sem código OPxx fica sem id (resolvido na listagem)');
    assert(opSemCodigo.status === 'cotacao', 'Status "estudo de viabilidade" vira "cotacao"');

    assert(statusInterno('status inexistente', 'closed') === 'concluida', 'Status desconhecido do tipo closed vira "concluida"');

    const resOps = await fetch(`${baseUrl}/api/integrations/clickup/operacoes`);
    const jsonOps = await resOps.json();
    assert(resOps.status === 200, 'GET /api/integrations/clickup/operacoes retorna HTTP 200');
    assert(Array.isArray(jsonOps.ops), 'GET /api/integrations/clickup/operacoes retorna array de operações');
    assert(jsonOps.success === true || typeof jsonOps.erro === 'string',
      'Quando o ClickUp falha, a rota devolve um erro legível em vez de falhar em silêncio');

    // 7. Testar Upload de Arquivo Suportado (PDF)
    console.log('\n--- Testando Upload Middleware e Rota (Arquivo Válido) ---');
    const pdfPath = path.join(__dirname, 'test_document.pdf');
    fs.writeFileSync(pdfPath, '%PDF-1.4 Fake PDF Content for test');

    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });
    const formDataValid = new FormData();
    formDataValid.append('arquivo', pdfBlob, 'test_document.pdf');

    const resUploadValid = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      body: formDataValid
    });
    const jsonUploadValid = await resUploadValid.json();
    assert(resUploadValid.status === 200, 'POST /api/upload (PDF) retorna HTTP 200');
    assert(jsonUploadValid.success === true, 'POST /api/upload (PDF) retorna success = true');
    assert(jsonUploadValid.fileName !== undefined, 'POST /api/upload retorna nome do arquivo salvo');

    // Clean up valid uploaded file
    if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
    if (jsonUploadValid.fileName) {
      const uploadedFile = path.join(__dirname, '../uploads', jsonUploadValid.fileName);
      if (fs.existsSync(uploadedFile)) fs.unlinkSync(uploadedFile);
    }

    console.log('\n--- Testando Upload Middleware (Validação de Tipo Inválido) ---');
    const exeBlob = new Blob(['unsupported file content'], { type: 'application/x-msdownload' });
    const formDataInvalid = new FormData();
    formDataInvalid.append('arquivo', exeBlob, 'invalid.exe');

    const resUploadInvalid = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      body: formDataInvalid
    });
    const jsonUploadInvalid = await resUploadInvalid.json();
    assert(resUploadInvalid.status === 400, 'POST /api/upload (arquivo não permitido) retorna HTTP 400');
    assert(jsonUploadInvalid.success === false, 'POST /api/upload retorna success = false');

    // 9. Testar Deletar Arquivo do Supabase / Storage (DELETE /api/upload)
    console.log('\n--- Testando Deletar Arquivo (DELETE /api/upload) ---');
    const resDelete = await fetch(`${baseUrl}/api/upload`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: jsonUploadValid.finalUrl || jsonUploadValid.localUrl })
    });
    const jsonDelete = await resDelete.json();
    assert(resDelete.status === 200, 'DELETE /api/upload retorna HTTP 200');
    assert(jsonDelete.success === true, 'DELETE /api/upload remove o arquivo com sucesso');

  } catch (err) {
    console.error('❌ Erro inesperado durante execução dos testes:', err);
    failures++;
  } finally {
    server.close();
    try {
      if (fs.existsSync(TEST_DB_FILE)) fs.unlinkSync(TEST_DB_FILE);
      if (fs.existsSync(TEST_DB_FILE + '.bak')) fs.unlinkSync(TEST_DB_FILE + '.bak');
    } catch (e) {}
    console.log(`\n===================================================`);
    console.log(`📊 Resultado dos Testes: ${passed} passaram, ${failures} falharam.`);
    console.log(`===================================================`);
    process.exit(failures > 0 ? 1 : 0);
  }
}

runTests();
