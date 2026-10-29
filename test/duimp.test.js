/**
 * NF-e de entrada gerada da DUIMP. O Portal Único e a Focus são SIMULADOS em
 * todos os testes; os arquivos de referência (test/fixtures/duimp-portal.json)
 * seguem o formato da API oficial com dados fictícios.
 *
 * Cobre: leitura e normalização da DUIMP (versão vigente, itens, tributos,
 * exportador do Catálogo), montagem do cenário A só a partir do retrato
 * (valores idênticos, soma = total da DUIMP), DUIMP de duas operações, DUIMP
 * retificada, conferência contra a cotação, custeio, e o fluxo no servidor
 * (rascunho automático, remontagem, nota enviada intocada, campos travados,
 * versão conferida antes de transmitir e permissões).
 */
const path = require('path'), fs = require('fs'), os = require('os');
const TMP = path.join(os.tmpdir(), `windgate-duimp-${process.pid}.json`);
process.env.NODE_ENV = 'test';
process.env.SUPABASE_DISABLED = '1';
process.env.WINDGATE_DB_FILE = TMP;
process.env.WINDGATE_DB_SECRET = 'segredo-duimp-' + process.pid;
process.env.FOCUS_NFE_TOKEN_SF = 'tk-sf-teste';
process.env.FOCUS_NFE_AMBIENTE = 'homologacao';

const W = Object.assign({}, require('../public/hub/js/regras.js'), require('../public/hub/js/comex.js'), require('../public/hub/js/nfe-regras.js'));
const portal = require('../src/services/portal-unico.service');
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/duimp-portal.json'), 'utf8'));
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };
const clone = x => JSON.parse(JSON.stringify(x));
const NUM = '26BR00000123456';

/* Portal Único simulado: autenticação, versão vigente, dados gerais, itens e Catálogo. */
function portalSimulado(estado) {
  estado.chamadas = [];
  return async (url, op) => {
    const u = new URL(url); estado.chamadas.push(u.pathname + u.search);
    const json = (status, corpo) => ({ status, headers: {}, corpo: JSON.stringify(corpo) });
    if (u.pathname.endsWith('/portal/api/autenticar')) return { status: 200, headers: { 'set-token': 'Bearer sim', 'x-csrf-token': 'csrf' }, corpo: '' };
    if (u.pathname.endsWith('/versoes')) return json(200, Object.assign({}, FX.versoes, { versao: estado.versao }));
    if (u.pathname.includes('/catp/api/ext/operador-estrangeiro')) return json(200, FX.operadores[u.searchParams.get('codigo')] || []);
    if (/\/itens$/.test(u.pathname)) { if (estado.falhar429) { estado.falhar429--; return json(429, {}); } return json(200, u.searchParams.get('inicial') === '1' ? estado.itens() : []); }
    if (new RegExp(`/duimp/${NUM}/\\d+$`).test(u.pathname)) return json(200, Object.assign(clone(FX.geral), { identificacao: Object.assign({}, FX.geral.identificacao, { versao: estado.versao }) }));
    return json(404, {});
  };
}

function banco() {
  return {
    users: { samir: { nome: 'Samir', pin: '1' }, davi: { nome: 'Davi', pin: '2' }, matheus: { nome: 'Matheus', pin: '3' }, pedro: { nome: 'Pedro', pin: '5', perfilHub: 'contador' }, oneide: { nome: 'Oneide', pin: '6', perfilHub: 'rh' } },
    hubPainel: { _fiscal: { cnpjs: { WindGate: '58762606000144', JeT: '11222333000181' } } },
    crm: [{ _id: 'c1', empresa: 'Custódio Máquinas', cnpj: '11.444.777/0001-61', contribuinte: false, end: { cidade: 'Fortaleza', uf: 'CE' } }],
    ops: [
      { _id: 'o16', id: 'OP16', cliente: 'Custódio Máquinas', modalidade: 'conta e ordem', empresa: 'WindGate', status: 'chegada', duimp: '26BR0000012345-6', campoAntigo: { x: 1 },
        portalEventos: [{ id: 'e1', de: 'despachante', acao: 'desembaracado', data: '2026-10-22', texto: '', em: '2026-10-22T15:00:00Z' }] },
      { id: 'OP21', cliente: 'Custódio Máquinas', modalidade: 'conta e ordem', empresa: 'WindGate', status: 'chegada', duimp: '26BR00000123456' }   // operação antiga, sem _id
    ],
    quotes: {
      q16: { fields: { opNum: 'OP16', txDesp: '5', txFrete: '5', pctInv: '100', icmsEnt: '1.6', freteUSD: '140', seguro: '0', capatazia: '0' },
        items: [{ d: 'Betoneira', ncm: '84743100', q: 2, u: 1000, ii: 20, ipi: 0, pis: 2.1, cofins: 9.65 }, { d: 'Betoneira', ncm: '84743100', q: 1, u: 1000, ii: 20, ipi: 0, pis: 2.1, cofins: 9.65 }] },
      q21: { fields: { opNum: 'OP21', txDesp: '5', txFrete: '5', pctInv: '100', icmsEnt: '1.6', freteUSD: '20', seguro: '0', capatazia: '0' }, items: [{ d: 'Escora', ncm: '73089090', q: 120, u: 8, ii: 10.8, ipi: 0, pis: 2.1, cofins: 9.65 }] }
    },
    fin: [{ _id: 'f1', op: 'OP16', tipo: 'Receita', valor: 1000, status: 'Previsto' }], docs: [], hubNotas: [], hubNFe: [], _removidos: {}
  };
}

(async () => {
  console.log('\nLeitura da DUIMP (Portal simulado):');
  const est = { versao: '2', itens: () => clone(FX.itens), falhar429: 1 };
  portal._usarRequisicao(portalSimulado(est));
  const ret = await portal.consultarDuimpCompleta('26BR0000012345-6', { pausaMs: 0, agora: '2026-10-29T10:00:00Z' });
  ok(est.chamadas.some(c => c.endsWith(`/duimp/${NUM}/versoes`)) && est.chamadas.some(c => c.endsWith(`/duimp/${NUM}/2`)) && !est.chamadas.some(c => c.endsWith(`/duimp/${NUM}/1`)), 'usa a versão vigente informada pelo Portal (2), nunca a 1 por suposição');
  ok(est.chamadas.filter(c => c.includes('/itens?inicial=1&tamanho=100')).length === 2, 'lista de itens em páginas de 100; erro 429 é repetido');
  ok(est.chamadas.filter(c => c.includes('operador-estrangeiro')).length === 3 && est.chamadas.some(c => c.includes('cpfCnpjRaiz=58762606&codigo=EXP001')), 'Catálogo de Operadores: uma consulta por código (EXP001, FAB001, FAB002), pelo CNPJ raiz da importadora');
  const g = ret.geral, i1 = ret.itens[0];
  ok(ret.versao === '2' && g.numero === NUM && g.canal === 'VERDE' && g.unidadeDespacho === '0317900' && g.viaTransporte === 1 && g.importador.cnpj === '58762606000144', 'dados gerais: número, versão, canal, unidade de despacho, via marítima (CE Mercante) e importador');
  ok(g.taxaSiscomex === 180 && g.afrmm === 75 && g.taxaCambio === 5 && g.valorAduaneiroBRL === 19800 && g.adquirenteOuEncomendante.cnpj === '11444777000161' && g.adquirenteOuEncomendante.modalidade === 'conta e ordem', 'Siscomex 180 e AFRMM 75 somados dos itens; câmbio 19.000 ÷ 3.800 = 5,0; adquirente da conta e ordem');
  ok(ret.itens.length === 3 && i1.numero === 1 && i1.ncm === '84743100' && i1.quantidade === 2 && i1.unidadeComercial === 'UN' && i1.valorAduaneiroBRL === 10500 && i1.freteBRL === 500 && i1.incoterm === 'FOB', 'itens: número, NCM, quantidade, unidade, valor aduaneiro, frete e Incoterm');
  ok(i1.tributos.ii.base === 10500 && i1.tributos.ii.aliquota === 20 && i1.tributos.ii.devido === 2100 && i1.tributos.ii.aRecolher === 2100 && i1.tributos.cofins.devido === 1013.25 && i1.tributos.pis.aliquota === 2.1, 'tributos por item com base, alíquota, devido e a recolher');
  ok(i1.exportador.nome === 'Exemplo Machinery Trading Co., Ltd.' && i1.exportador.pais === 'CN' && i1.exportador.logradouro && i1.fabricante.codigo === 'FAB001' && i1.fabricante.nome === 'Exemplo Mixer Factory', 'exportador e fabricante com nome, país e endereço do Catálogo');
  const semCat = portal.normalizarDuimp(FX.geral, FX.itens, {}, { versao: '2' });
  ok(semCat.itens[0].exportador.codigo === 'EXP001' && !semCat.itens[0].exportador.noCatalogo, 'normalizarDuimp isolada: sem o Catálogo, o código fica e o cadastro é marcado como ausente');
  const inativo = clone(FX.itens); inativo[2].status = 'INATIVO';
  ok(portal.normalizarDuimp(FX.geral, inativo, {}, {}).itens.length === 2, 'item inativo na versão vigente fica de fora');

  console.log('\nNF de entrada (cenário A) só a partir do retrato:');
  const db = banco();
  db.ops[0].duimpDados = Object.assign(clone(ret), { itens: ret.itens.map(i => Object.assign({}, i, { op: i.numero === 3 ? 'OP21' : 'OP16' })) });
  db.hubPainel._nfeConfig = { urfs: { '0317900': { nome: 'Porto do Pecém', uf: 'CE' } } };
  const m = W.montarNFe(db, { cenario: 'A', opId: 'OP16', duimpNumero: NUM, dataEmissao: '2026-10-29' });
  const it = m.payload.items, x1 = it[0], di = x1.documentos_importacao[0];
  ok(m.pendencias.length === 0, 'sem pendências com a DUIMP importada, itens atribuídos e a unidade de despacho cadastrada' + (m.pendencias.length ? ': ' + m.pendencias.map(p => p.msg).join(' | ') : ''));
  ok(it.length === 3 && it.map(x => x.codigo_ncm).join() === '84743100,84743100,73089090' && it.map(x => x.quantidade_comercial).join() === '2,1,100', 'um item da NF-e por item da DUIMP, com NCM e quantidade da DUIMP');
  ok(x1.valor_bruto === 10500 && x1.ii_base_calculo === 10500 && x1.ii_valor === 2100 && x1.ii_despesas_aduaneiras === 140 && x1.pis_valor === 220.5 && x1.pis_aliquota_porcentual === 2.1 && x1.cofins_valor === 1013.25 && x1.ipi_base_calculo === 12600, 'valor aduaneiro 10.500, II 2.100, despesas aduaneiras 140 (Siscomex 100 + AFRMM 40), PIS e COFINS exatamente como na DUIMP');
  // ICMS por dentro: (10.500 + 2.100 + 0 + 220,50 + 1.013,25 + 140) ÷ (1 − 1,6%) = 14.200,97 · × 1,6% = 227,22
  ok(x1.icms_base_calculo === 14200.97 && x1.icms_valor === 227.22 && x1.valor_outras_despesas === 1600.97, 'ICMS de importação calculado pela regra do cenário (não vem da DUIMP): base 14.200,97, ICMS 227,22; outras despesas 1.600,97');
  ok(m.totais.ii === 3582.8 && m.totais.pis === 415.8 && m.totais.cofins === 1910.7 && m.totais.produtos === 19800 && m.totais.total === m.totais.somaItens, 'soma da nota = total da DUIMP (II 3.582,80 · PIS 415,80 · COFINS 1.910,70 · aduaneiro 19.800)');
  ok(di.numero === NUM && di.data_registro === '2026-10-20' && di.local_desembaraco_aduaneiro === 'Porto do Pecém' && di.uf_desembaraco_aduaneiro === 'CE' && di.data_desembaraco_aduaneiro === '2026-10-22' && di.via_transporte === 1 && di.valor_afrmm === 40, 'declaração: número da DUIMP, registro, unidade cadastrada, desembaraço do aviso do despachante, via marítima e AFRMM do item');
  ok(di.forma_intermedio === 2 && di.cnpj === '11444777000161' && di.uf_terceiro === 'CE' && di.codigo_exportador === 'EXP001', 'conta e ordem pela DUIMP: forma 2 com CNPJ do adquirente e UF do CRM; código do exportador');
  ok(it.map(x => x.documentos_importacao[0].adicoes[0].numero).join() === '1,2,3' && it[2].documentos_importacao[0].adicoes[0].codigo_fabricante_estrangeiro === 'FAB002', 'adição = número do item na DUIMP; fabricante do item');
  ok(m.payload.nome_destinatario === 'Exemplo Machinery Trading Co., Ltd.' && m.payload.codigo_pais_destinatario === '1600' && m.payload.indicador_inscricao_estadual_destinatario === 9 && m.payload.municipio_destinatario === 'EXTERIOR', 'destinatário = exportador da DUIMP, país 1600 (China), IE indicador 9');
  ok(it[0].codigo_produto === '1001' && it[2].codigo_produto === '2002' && /DUIMP 26BR00000123456 versão 2/.test(m.payload.informacoes_adicionais_contribuinte), 'código do produto do Catálogo de Produtos; DUIMP e versão nas informações complementares');
  ok(m.duimp.numero === NUM && m.duimp.versao === '2' && m.ops.join() === 'OP16,OP21', 'a nota guarda o número e a versão da DUIMP e as operações');

  const cfgVazia = clone(db); cfgVazia.hubPainel._nfeConfig = {};
  ok(W.montarNFe(cfgVazia, { cenario: 'A', opId: 'OP16', duimpNumero: NUM }).pendencias.some(p => /unidade 0317900/.test(p.msg)), 'unidade de despacho sem cadastro: pendência (a DUIMP só traz o código)');
  const semAfrmm = clone(db); semAfrmm.ops[0].duimpDados.itens.forEach(i => { i.afrmm = 0; });
  ok(W.montarNFe(semAfrmm, { cenario: 'A', opId: 'OP16', duimpNumero: NUM }).pendencias.some(p => /AFRMM ausente/.test(p.msg)), 'AFRMM ausente no marítimo: pendência');
  const afrmmDesp = W.montarNFe(semAfrmm, { cenario: 'A', opId: 'OP16', duimpNumero: NUM, extras: { duimp: { afrmm: 75 } } });
  ok(!afrmmDesp.pendencias.some(p => /AFRMM/.test(p.msg)) && afrmmDesp.avisos.some(a => /AFRMM informado pelo despachante/.test(a)), 'AFRMM do despachante entra marcado "conferir"');
  const semOp = clone(db); semOp.ops[0].duimpDados.itens[2].op = null;
  ok(W.montarNFe(semOp, { cenario: 'A', opId: 'OP16', duimpNumero: NUM }).pendencias.some(p => p.campo === 'itens.op'), 'DUIMP de duas operações: item sem operação bloqueia');
  const semEnd = clone(db); semEnd.ops[0].duimpDados.itens.forEach(i => { i.exportador.logradouro = ''; });
  ok(W.montarNFe(semEnd, { cenario: 'A', opId: 'OP16', duimpNumero: NUM }).pendencias.some(p => /sem endereço no Catálogo/.test(p.msg)), 'exportador sem endereço no Catálogo: pendência');
  const sem = banco();
  ok(W.montarNFe(sem, { cenario: 'A', opId: 'OP16' }).pendencias.some(p => /DUIMP não importada/.test(p.msg)), 'sem DUIMP importada a entrada não sai (pendência "DUIMP não importada")');
  const desvio = clone(db); desvio.ops[0].duimpDados.itens[0].tributos.ii.devido = 2101.5;
  ok(W.montarNFe(desvio, { cenario: 'A', opId: 'OP16', duimpNumero: NUM }).pendencias.some(p => p.campo === 'total.ii'), 'soma dos itens diferente do total da DUIMP (> R$ 0,01): pendência');
  const naoValidado = W.montarNFe(db, { cenario: 'A', opId: 'OP16', duimpNumero: NUM, ambiente: 'producao' });
  ok(naoValidado.pendencias.some(p => /Cenário A ainda não foi conferido/.test(p.msg)), 'CFOP/cenário não validado pelo contador: pendência em produção');

  console.log('\nConferência contra a cotação e custeio:');
  const avisos16 = W.conferirDuimpCotacao(db, 'OP16'), avisos21 = W.conferirDuimpCotacao(db, 'OP21');
  ok(avisos16.length === 0, 'OP16: DUIMP e cotação dentro de 1% (valor aduaneiro 10.500 × 10.466,67): nenhum aviso');
  ok(avisos21.some(a => /quantidade 100 na DUIMP × 120 na cotação/.test(a)) && avisos21.some(a => /valor aduaneiro/.test(a)), 'OP21: quantidade e valor aduaneiro diferentes viram avisos');
  ok(m.avisos.some(a => /quantidade 100 na DUIMP × 120/.test(a)), 'os avisos aparecem na nota (não bloqueiam)');
  const c16 = W.custeioOp(db, 'OP16'), c21 = W.custeioOp(db, 'OP21');
  const imp = c => c.linhas.find(l => l.k === 'impostos');
  // OP16: 2.100 + 1.040 + 0 + 220,50 + 109,20 + 1.013,25 + 501,80 = 4.984,75 · OP21: 442,80 + 86,10 + 395,65 = 924,55
  ok(imp(c16).realizado === 4984.75 && imp(c16).origem === 'duimp' && imp(c21).realizado === 924.55, 'custeio: impostos federais da DUIMP viram o realizado, cada operação só com os seus itens (4.984,75 e 924,55)');
  const comLanc = clone(db); comLanc.fin.push({ _id: 'f9', op: 'OP16', tipo: 'Despesa', valor: 5000, status: 'Realizado', desc: 'Impostos DUIMP', categoria: 'Imposto importação' });
  ok(imp(W.custeioOp(comLanc, 'OP16')).realizado === 5000 && imp(W.custeioOp(comLanc, 'OP16')).origem === '' && comLanc.fin.length === db.fin.length + 1, 'com lançamento de impostos no Financeiro, ele vale; nenhum lançamento é criado sozinho');

  /* ======================= Servidor ======================= */
  console.log('\nServidor (Portal e Focus simulados):');
  fs.writeFileSync(TMP, JSON.stringify(banco()));
  const app = require('../src/server');
  const focus = require('../src/services/nfe.service');
  const auth = require('../src/services/auth.service');
  const srv = app.listen(0), base = `http://127.0.0.1:${srv.address().port}`;
  const F = { posts: 0, notas: {} };
  const resp = (status, corpo) => ({ ok: status < 300, status, headers: { get: () => 'application/json' }, text: async () => JSON.stringify(corpo), arrayBuffer: async () => Buffer.from('x') });
  focus._usarFetch(async (url, o) => {
    const u = new URL(url), mm = u.pathname.match(/^\/v2\/nfe\/([^/]+)$/);
    if (u.pathname.startsWith('/arquivos/')) return resp(200, {});
    if (u.pathname === '/v2/nfe' && o.method === 'POST') { F.posts++; F.notas[u.searchParams.get('ref')] = { status: 'processando_autorizacao' }; return resp(202, { status: 'processando_autorizacao' }); }
    if (mm && o.method === 'GET') return F.notas[mm[1]] ? resp(200, F.notas[mm[1]]) : resp(404, { codigo: 'nao_encontrado' });
    return resp(400, {});
  });
  focus._usarArmazenamento(async nome => 'https://storage.teste/' + nome);
  const est2 = { versao: '2', itens: () => clone(FX.itens) };
  portal._usarRequisicao(portalSimulado(est2));
  const chamar = async (k, metodo, caminho, corpo) => { const r = await fetch(base + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.emitirToken(k) }, body: corpo ? JSON.stringify(corpo) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  const lerBanco = () => JSON.parse(fs.readFileSync(TMP, 'utf8'));

  for (const k of ['samir', 'matheus', 'oneide']) ok((await chamar(k, 'POST', '/api/duimp/OP16/importar', {})).status === 403, `${k} não importa a DUIMP (403)`);
  let r = await chamar('davi', 'POST', '/api/nfe/montar', { cenario: 'A', opId: 'OP16' });
  ok(r.status === 409 && /importe a DUIMP/i.test(r.j.message), 'cenário A não é criado sem a DUIMP importada (409)');
  await chamar('davi', 'POST', '/api/nfe/config', { urfs: { '0317900': { nome: 'Porto do Pecém', uf: 'CE' } } });
  const opsAntes = lerBanco().ops.length;
  r = await chamar('davi', 'POST', '/api/duimp/OP16/importar', {});
  let b = lerBanco(), o16 = b.ops.find(o => o.id === 'OP16'), nota = r.j.nota;
  ok(r.status === 200 && r.j.versao === '2' && r.j.itens === 3 && r.j.ops.join() === 'OP16,OP21' && r.j.semOp === 3, 'Davi importa: versão 2, 3 itens; a DUIMP serve OP16 e OP21, e os itens esperam a atribuição');
  ok(o16.duimpDados && o16.duimpDados.geral.numero === NUM && o16.campoAntigo.x === 1 && o16.cliente === 'Custódio Máquinas' && b.ops.length === opsAntes && !b.ops.find(o => o.id === 'OP21').duimpDados, 'retrato gravado uma vez, na operação que importou; nenhum dado da operação foi sobrescrito e nenhuma operação duplicou');
  ok(nota && nota.cenario === 'A' && nota.status === 'rascunho' && nota.ref === 'wg-sf-duimp-26br00000123456-a-1' && nota.duimp.versao === '2' && nota.pendencias.some(p => p.campo === 'itens.op'), 'rascunho da NF de entrada criado sozinho (ref wg-sf-duimp-<número>-a-1), com a pendência de itens sem operação');
  r = await chamar('davi', 'POST', `/api/nfe/${nota._id}/conferir`);
  ok(r.status === 409, 'com item sem operação a nota não é liberada para conferência');
  r = await chamar('pedro', 'GET', `/api/duimp/${NUM}`);
  ok(r.status === 200 && r.j.retrato.itens.length === 3 && r.j.ops.length === 2, 'o contador vê o retrato da DUIMP pela rota própria (sem ler as operações)');
  r = await chamar('davi', 'POST', `/api/duimp/${NUM}/atribuir`, { itens: { 1: 'OP16', 2: 'OP16', 3: 'OP21' } });
  nota = r.j.nota;
  ok(r.status === 200 && r.j.semOp === 0 && nota.status === 'rascunho' && !nota.pendencias.some(p => p.campo === 'itens.op'), 'itens atribuídos: a nota é remontada sem a pendência');
  ok(nota.pendencias.length === 0 && nota.totais.ii === 3582.8 && nota.payload.items.length === 3, 'nota de entrada pronta: soma dos tributos = total da DUIMP' + (nota.pendencias.length ? ' — ' + nota.pendencias.map(p => p.msg).join(' | ') : ''));
  ok(nota.avisos.some(a => /OP21 · item 3 \(NCM 73089090\): quantidade 100 na DUIMP × 120/.test(a)), 'diferença contra a cotação da OP21 aparece na nota como aviso');

  console.log('\nCampos travados e correção manual:');
  const itensAntes = JSON.stringify(nota.payload.items);
  r = await chamar('davi', 'POST', '/api/nfe/montar', { id: nota._id, itens: [{ ncm: '99999999', descricao: 'forjado', quantidade: 1, valorUnitario: 1 }], destinatario: { nome: 'Outro' }, extras: { duimp: { numero: '99BR99999999999' } } });
  ok(r.status === 200 && JSON.stringify(r.j.nota.payload.items) === itensAntes && r.j.nota.payload.nome_destinatario === nota.payload.nome_destinatario, 'itens, destinatário e número da DUIMP enviados pela tela são ignorados: vêm da DUIMP');
  r = await chamar('davi', 'POST', '/api/nfe/montar', { id: nota._id, extras: { informacoes: 'Mercadoria conferida no porto.' } });
  ok(r.status === 400 && /motivo/.test(r.j.message), 'correção manual exige motivo');
  r = await chamar('davi', 'POST', '/api/nfe/montar', { id: nota._id, extras: { informacoes: 'Mercadoria conferida no porto.' }, motivo: 'Pedido do Pedro' });
  const ult = r.j.nota.historico[r.j.nota.historico.length - 1];
  ok(r.status === 200 && /Mercadoria conferida no porto/.test(r.j.nota.payload.informacoes_adicionais_contribuinte) && ult.acao === 'correcao-manual' && ult.por === 'davi' && /Pedido do Pedro/.test(ult.msg), 'correção permitida entra registrada com quem alterou e o motivo');
  r = await chamar('davi', 'POST', '/api/nfe/montar', { cenario: 'A', opId: 'OP21' });
  ok(r.status === 409 && r.j.nota && r.j.nota._id === nota._id, 'uma NF de entrada por DUIMP: a mesma DUIMP pela OP21 aponta a nota que já existe');

  console.log('\nVersão conferida antes de transmitir e DUIMP retificada:');
  r = await chamar('davi', 'POST', `/api/nfe/${nota._id}/conferir`);
  ok(r.status === 200 && r.j.nota.status === 'conferida', 'nota conferida (homologação: um só basta)');
  est2.versao = '3';
  r = await chamar('davi', 'POST', `/api/nfe/${nota._id}/transmitir`);
  ok(r.status === 409 && /versão 3 no Portal/.test(r.j.message) && F.posts === 0, 'DUIMP retificada no Portal (versão 3 × retrato 2): transmissão bloqueada, nada vai à Focus');
  est2.itens = () => { const x = clone(FX.itens); x[0].mercadoria.quantidadeComercial = 3; return x; };
  r = await chamar('davi', 'POST', '/api/duimp/OP21/importar', {});
  nota = r.j.nota;
  ok(r.status === 200 && r.j.aviso === 'DUIMP retificada: versão 2 → 3.' && r.j.diferencas.some(d => /item 1: quantidade 2 → 3/.test(d)), 'reimportar mostra "DUIMP retificada: versão 2 → 3" e o que mudou');
  b = lerBanco();
  ok(b.ops.find(o => o.id === 'OP16').duimpDados.versao === '3' && b.ops.find(o => o.id === 'OP16').duimpDados.itens.map(i => i.op).join() === 'OP16,OP16,OP21' && !b.ops.find(o => o.id === 'OP21').duimpDados, 'reimportação pela OP21 atualiza o mesmo retrato (na OP16) e mantém a atribuição dos itens');
  ok(nota.status === 'rascunho' && !nota.conferidoPor && nota.duimp.versao === '3' && /versão 3/.test(nota.historico[nota.historico.length - 1].msg), 'a nota é remontada da versão 3: conferência zerada e a versão no histórico');
  await chamar('davi', 'POST', `/api/nfe/${nota._id}/conferir`);
  r = await chamar('davi', 'POST', `/api/nfe/${nota._id}/transmitir`);
  ok(r.status === 200 && F.posts === 1 && r.j.nota.status === 'enviada', 'com a versão igual à do Portal, a nota é transmitida');
  est2.versao = '4';
  r = await chamar('davi', 'POST', '/api/duimp/OP16/importar', {});
  b = lerBanco(); const notaB = b.hubNFe.find(n => n._id === nota._id);
  ok(r.status === 200 && /já foi enviada e não foi alterada/.test(r.j.notaIntocada) && notaB.status === 'enviada' && notaB.duimp.versao === '3' && /complementar ou carta de correção/.test(r.j.notaIntocada), 'nota enviada nunca é alterada: a DUIMP mudou depois, o sistema sugere complementar ou carta de correção');
  r = await chamar('pedro', 'POST', '/api/duimp/OP16/importar', {});
  ok(r.status === 200, 'o contador também importa a DUIMP');

  if (srv.closeAllConnections) srv.closeAllConnections();
  await new Promise(x => srv.close(() => x()));
  try { fs.unlinkSync(TMP); fs.unlinkSync(TMP + '.bak'); } catch (e) {}
  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exitCode = falhou ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 3000).unref();
})().catch(e => { console.error(e); process.exit(1); });
