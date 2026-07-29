const path = require('path');
const fs = require('fs');

const app = require('../src/server');
const { criarTarefaOperacao } = require('../src/integrations/clickup.service');

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
    console.log(`\n===================================================`);
    console.log(`📊 Resultado dos Testes: ${passed} passaram, ${failures} falharam.`);
    console.log(`===================================================`);
    process.exit(failures > 0 ? 1 : 0);
  }
}

runTests();
