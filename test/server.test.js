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
const { normalizarStatus, corrigirInicio, diasNoStatus } = require('../src/services/op-status.service');
const aliquotas = require('../src/services/aliquotas.service');
const siscomex = require('../src/integrations/siscomex.service');

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

    // 1.95. Etapa da operação: data de início e histórico garantidos no servidor
    console.log('');
    console.log('--- Testando Etapas da Operação (data e histórico) ---');
    const AGORA = '2026-08-28T15:00:00.000Z';
    const servidor = { ops: [{ id: 'OP50', status: 'producao', statusEm: '2026-08-01T10:00:00.000Z', criadaEm: '2026-07-01T10:00:00.000Z' }] };

    // Cliente antigo muda a etapa e não carimba nada: o servidor carimba.
    const cliente = { ops: [{ id: 'OP50', status: 'embarcado', statusEm: '2026-08-01T10:00:00.000Z', criadaEm: '2026-07-01T10:00:00.000Z' }] };
    let r = normalizarStatus(servidor, cliente, { agora: AGORA });
    assert(cliente.ops[0].statusEm === AGORA, 'Etapa mudada sem carimbo recebe a data no servidor');
    assert(r.historico === 1, 'Mudança de etapa sem histórico ganha a linha no servidor');
    assert(cliente.opStatusHist[0].de === 'producao' && cliente.opStatusHist[0].para === 'embarcado',
      'Linha do histórico registra a etapa anterior e a nova');

    // Cliente atual já fez o trabalho: o servidor não repete a linha.
    const jaFeito = {
      ops: [{ id: 'OP50', status: 'embarcado', statusEm: '2026-08-20T10:00:00.000Z', criadaEm: '2026-07-01T10:00:00.000Z' }],
      opStatusHist: [{ _id: 'h1', op: 'OP50', de: 'producao', para: 'embarcado', em: '2026-08-20T10:00:00.000Z', por: 'Davi', tipo: 'mudanca' }]
    };
    r = normalizarStatus(servidor, jaFeito, { agora: AGORA });
    assert(jaFeito.ops[0].statusEm === '2026-08-20T10:00:00.000Z', 'Data carimbada pelo cliente é preservada');
    assert(jaFeito.opStatusHist.length === 1, 'Histórico já registrado não é duplicado pelo servidor');

    // Sem mudança de etapa, nada acontece — a rota é chamada a cada gravação.
    const semMudanca = { ops: [{ id: 'OP50', status: 'producao', statusEm: '2026-08-01T10:00:00.000Z', criadaEm: '2026-07-01T10:00:00.000Z' }] };
    r = normalizarStatus(servidor, semMudanca, { agora: AGORA });
    assert(r.carimbadas === 0 && r.historico === 0, 'Gravação sem mudança de etapa não mexe em nada');

    // Datas impossíveis são recusadas, não gravadas.
    const futuro = { ops: [{ id: 'OP50', status: 'producao', statusEm: '2027-01-01T00:00:00.000Z', criadaEm: '2026-07-01T10:00:00.000Z' }] };
    r = normalizarStatus(servidor, futuro, { agora: AGORA });
    assert(futuro.ops[0].statusEm === AGORA, 'Início de etapa no futuro é trazido para hoje');
    assert(r.corrigidas.length === 1 && r.corrigidas[0].motivo === 'data no futuro', 'Correção de data futura é reportada');

    const antesDeNascer = { ops: [{ id: 'OP50', status: 'producao', statusEm: '2026-01-01T00:00:00.000Z', criadaEm: '2026-07-01T10:00:00.000Z' }] };
    r = normalizarStatus(servidor, antesDeNascer, { agora: AGORA });
    assert(antesDeNascer.ops[0].statusEm === '2026-07-01T10:00:00.000Z',
      'Início anterior à criação da operação volta para a data de criação');

    // Operação nova chega sem nada: ganha criação, carimbo e histórico.
    const nova = { ops: [{ id: 'OP51', status: 'contrato' }] };
    r = normalizarStatus(servidor, nova, { agora: AGORA });
    assert(nova.ops[0].criadaEm === AGORA && nova.ops[0].statusEm === AGORA, 'Operação nova nasce com data de criação e de etapa');
    assert(nova.opStatusHist.length === 1 && nova.opStatusHist[0].de === '', 'Primeira etapa entra no histórico sem etapa anterior');

    assert(corrigirInicio('2026-08-20T00:00:00.000Z', '2026-07-01T00:00:00.000Z', AGORA) === null,
      'Data válida passa sem correção');
    assert(diasNoStatus({ statusEm: '2026-08-01T10:00:00.000Z' }, AGORA) === 27, 'Dias na etapa contam dias de calendário');
    assert(diasNoStatus({ statusEm: AGORA }, AGORA) === 0, 'Etapa mudada hoje está no dia 0');
    assert(diasNoStatus({}, AGORA) === null, 'Operação sem data de etapa não inventa contagem');

    // O histórico precisa sobreviver à mesclagem entre dois usuários.
    const histA = { opStatusHist: [{ _id: 'ha', op: 'OP50', para: 'embarcado' }] };
    const histB = { opStatusHist: [{ _id: 'hb', op: 'OP51', para: 'contrato' }] };
    const histMerge = mesclarDB(histA, histB);
    assert(histMerge.opStatusHist.length === 2, 'Histórico de etapas de dois usuários é preservado na mesclagem');

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

    // 6.3. Banco de alíquotas oficiais (TEC + TIPI)
    console.log('\n--- Testando Banco de Alíquotas (TEC/Gecex + TIPI/Receita) ---');
    assert(aliquotas.parseAliquota(0).valor === 0, 'parseAliquota lê alíquota zero');
    assert(aliquotas.parseAliquota('12,6BK').valor === 12.6, 'parseAliquota lê alíquota com vírgula');
    assert(aliquotas.parseAliquota('12,6BK').marcador === 'BK', 'parseAliquota preserva a marcação da TEC (BK/BIT)');
    assert(aliquotas.parseAliquota('') === null, 'parseAliquota ignora célula vazia');
    assert(aliquotas.parseAliquota('NT') === null, 'parseAliquota ignora "NT" (não tributado)');
    assert(aliquotas.INTERVALO_DIAS === 15, 'Atualização das alíquotas configurada para 15 dias');

    const resStatus = await fetch(`${baseUrl}/api/aliquotas/status`);
    const jsonStatus = await resStatus.json();
    assert(resStatus.status === 200, 'GET /api/aliquotas/status retorna HTTP 200');
    assert(jsonStatus.intervaloDias === 15, 'Status informa o intervalo de 15 dias');

    const resNcmAliq = await fetch(`${baseUrl}/api/aliquotas/73089090`);
    const jsonNcmAliq = await resNcmAliq.json();
    assert(resNcmAliq.status === 200, 'GET /api/aliquotas/:ncm retorna HTTP 200');
    assert(typeof jsonNcmAliq.encontrado === 'boolean', 'Consulta de alíquota informa se a NCM foi encontrada');
    if (jsonNcmAliq.encontrado) {
      assert(typeof jsonNcmAliq.ii === 'number', 'NCM encontrada traz alíquota de II numérica');
    }

    const resNcmInvalido = await fetch(`${baseUrl}/api/aliquotas/00000000`);
    const jsonNcmInvalido = await resNcmInvalido.json();
    assert(jsonNcmInvalido.encontrado === false && typeof jsonNcmInvalido.erro === 'string',
      'NCM inexistente devolve erro legível em vez de alíquota inventada');

    // 6.35. TTCE — tratamento tributário (não traz alíquota, traz o regime)
    console.log('\n--- Testando TTCE (tratamento tributário) ---');
    const ttceExemplo = siscomex.normalizar({ tratamentosTributarios: [
      { tributo: { nome: 'II' }, regime: { nome: 'RECOLHIMENTO INTEGRAL' }, fundamentoLegal: { codigo: '6999', nome: 'Regra geral' } },
      { tributo: { nome: 'IPI' }, regime: { nome: 'REDUÇÃO' }, fundamentoLegal: { codigo: '1234', nome: 'Ex-tarifário' } }
    ]});
    assert(ttceExemplo.integral === false, 'TTCE marca a NCM como fora do recolhimento integral quando há redução');
    assert(ttceExemplo.ressalvas.length === 1 && ttceExemplo.ressalvas[0].tributo === 'IPI',
      'TTCE isola qual tributo está fora do recolhimento integral');
    assert(siscomex.normalizar({ tratamentosTributarios: [
      { tributo: { nome: 'II' }, regime: { nome: 'RECOLHIMENTO INTEGRAL' } }
    ]}).integral === true, 'TTCE confirma recolhimento integral quando todos os tributos estão integrais');

    const resTtce = await fetch(`${baseUrl}/api/ncm/73089090/tratamento`);
    const jsonTtce = await resTtce.json();
    assert(resTtce.status === 200, 'GET /api/ncm/:code/tratamento retorna HTTP 200');
    assert(jsonTtce.configurado === false || Array.isArray(jsonTtce.tributos),
      'Sem certificado, o TTCE informa que não está configurado em vez de quebrar');

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
