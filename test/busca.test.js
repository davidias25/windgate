/**
 * Busca global: acento, código com ponto, CNPJ sem máscara, valor e data em formatos diferentes, vários termos,
 * erro de digitação leve, permissão por perfil (Samir, Davi, Matheus, Ívina, Pedro, RH), exclusão saindo do
 * índice, desempenho e a rota /api/search com login. Mais o ajuste de acesso: Financeiro para o Matheus e
 * custos/margens das cotações só com Samir e Davi. Dados inventados.
 */
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'busca-'));
process.env.NODE_ENV = 'test'; process.env.SUPABASE_DISABLED = '1';
process.env.WINDGATE_DB_FILE = path.join(tmp, 'db.json'); process.env.WINDGATE_DB_SECRET = 'segredo-busca-' + process.pid; process.env.WINDGATE_SEM_BANCO_REMOTO = '1';
const B = require('../src/services/busca.service');
const W = require('../public/hub/js/regras.js');
const acesso = require('../src/services/acesso.service');
let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };

function banco() {
  return {
    users: { samir: { nome: 'Samir', pin: '1' }, davi: { nome: 'Davi', pin: '2' }, matheus: { nome: 'Matheus', pin: '3' }, ivina: { nome: 'Ívina', pin: '4' }, pedro: { nome: 'Pedro', pin: '5' }, oneide: { nome: 'Oneide', pin: '6' } },
    ops: [
      { _id: 'o227', id: 'OP227', papel: 'mae', status: 'producao', statusEm: '2026-10-01' },
      { _id: 'o2271', id: 'OP227.1', maeId: 'OP227', cliente: 'Gisele', status: 'producao', statusEm: '2026-10-01' },
      { _id: 'o2272', id: 'OP227.2', maeId: 'OP227', cliente: 'Bruno', status: 'producao', statusEm: '2026-10-01' },
      { _id: 'o2270', id: 'OP2270', cliente: 'Outro', status: 'contrato', statusEm: '2026-09-01' },
      { _id: 'o300', id: 'OP300', cliente: 'João Construções', nome: 'Escoras metálicas', status: 'embarcado', bl: 'BL999', containers: [{ numero: 'MSCU1234567' }], fornecedor: 'Shandong Machinery', statusEm: '2026-11-01', custoPrevisto: 88888 }
    ],
    quotes: { q1: { id: 'q1', status: 'ok', fields: { opNum: 'OP300', cliente: 'João Construções', mercadoria: 'Escoras', margemPct: '25', freteUSD: '6123', txDesp: '5.5' }, items: [{ d: 'Escora metálica', ncm: '73089090', q: 400, u: 12.5 }], exps: [{ l: 'THC', v: 1376 }] } },
    qindex: [{ _id: 'iq1', id: 'q1', label: 'OP300 · João Construções', cliente: 'João Construções', status: 'ok', preco: 98765.43, ts: Date.parse('2026-10-20') }],
    crm: [{ _id: 'c1', empresa: 'Construtora Ômega', cnpj: '58.762.606/0001-44', end: { cidade: 'Fortaleza', uf: 'CE' }, email: 'compras@omega.com.br' }],
    crmOps: [{ _id: 'n1', titulo: 'Escoras para a obra', clienteNome: 'Construtora Ômega', etapa: 'lead', valor: 777777 }],
    fin: [{ _id: 'f1', tipo: 'Despesa', desc: 'Pagamento fábrica OP300', valor: 1500, vencimento: '2026-11-13', contraparte: 'Shandong Machinery', op: 'OP300', status: 'Previsto' },
          { _id: 'f2', tipo: 'Despesa', desc: 'Cotação de frete', valor: 321.45, vencimento: '2026-10-02', status: 'Realizado' }],
    agendaTasks: [{ _id: 't1', t: 'Fechar frete da OP227', resp: 'Matheus', opId: 'OP227', prazo: '2026-11-18', status: 'aberta' }, { _id: 't2', t: 'Ligar para a fábrica', resp: 'Davi', prazo: '2026-11-20', status: 'aberta' }],
    fretes: [{ _id: 'fr1', rota: 'Qingdao → Pecém', agente: 'MSC Brasil', booking: 'BK777', valor: 4200, contato: 'Ana', data: '2026-11-05', resp: 'Matheus' }],
    docs: [{ _id: 'd1', nome: 'Invoice OP300.pdf', op: 'OP300', cat: 'invoice', link: 'https://x/1.pdf' }, { _id: 'd2', nome: 'Contrato de câmbio OP300.pdf', op: 'OP300', cat: 'cambio', link: 'https://x/2.pdf' }],
    crmDocs: [], checklists: {},
    hubNotas: [{ _id: 'nt1', numero: '88', chave: '2'.repeat(44), emitente: 'SF Trading', destinatario: 'João Construções', op: 'OP300', valor: 13579.23, data: '2026-11-10' }],
    hubNFe: [], hubExtratos: [{ _id: 'e1', banco: 'Itaú', mes: '2026-10', transacoes: [{ memo: 'PIX RECEBIDO OMEGA', valor: 20000 }] }],
    hubFornecedores: [{ _id: 's1', nome: 'Shandong Machinery', cidade: 'Jinan', produtos: 'escoras' }],
    hubPainel: {}, _removidos: {}
  };
}
const db = banco();
const grupos = (k, q, o) => B.buscar(db, k, Object.assign({ q }, o));
const tipos = r => r.grupos.map(g => g.tipo);
const titulos = (r, t) => ((r.grupos.find(g => g.tipo === t) || {}).itens || []).map(i => i.titulo);
const acha = (k, q, t, titulo) => titulos(grupos(k, q), t).some(x => titulo instanceof RegExp ? titulo.test(x) : x === titulo);

console.log('\nAcento e maiúscula:');
ok(acha('samir', 'joao', 'ops', 'OP300') && acha('samir', 'JOÃO', 'ops', 'OP300'), '"joao" e "JOÃO" acham "João Construções"');
ok(acha('samir', 'cotacao', 'fin', 'Cotação de frete'), '"cotacao" acha "Cotação de frete"');
ok(acha('samir', 'omega', 'crm', 'Construtora Ômega'), '"omega" acha "Ômega"');

console.log('\nCódigos de operação:');
{
  const r = titulos(grupos('samir', 'OP227'), 'ops');
  ok(r.slice(0, 3).sort().join() === 'OP227,OP227.1,OP227.2' && r.indexOf('OP2270') > 2, `"OP227": mãe e filhas primeiro (${r.join(', ')})`);
  ok(titulos(grupos('samir', '227.1'), 'ops')[0] === 'OP227.1', '"227.1" acha OP227.1');
  ok(acha('samir', 'MSCU1234567', 'ops', 'OP300') && acha('samir', '1234567', 'ops', 'OP300'), 'nº do contêiner, inteiro ou só os números');
  ok(acha('samir', 'bl999', 'ops', 'OP300') && acha('samir', '73089090', 'ops', 'OP300'), 'BL e NCM da cotação da operação');
}

console.log('\nCNPJ, valores e datas:');
ok(acha('samir', '58762606', 'crm', 'Construtora Ômega') && acha('samir', '58.762.606/0001-44', 'crm', 'Construtora Ômega') && acha('samir', '58762606000144', 'crm', 'Construtora Ômega'), 'CNPJ com ou sem máscara');
['1500', '1.500', '1.500,00', 'R$1.500,00'].forEach(v => ok(acha('samir', v, 'fin', 'Pagamento fábrica OP300'), `"${v}" acha R$ 1.500,00`));
ok(acha('samir', '321,45', 'fin', 'Cotação de frete'), '"321,45" acha R$ 321,45');
ok(acha('samir', '13/11', 'fin', 'Pagamento fábrica OP300') && acha('samir', '13/11/2026', 'fin', 'Pagamento fábrica OP300'), '"13/11" e "13/11/2026" acham o lançamento dessa data');

console.log('\nVários termos, ordem e erro de digitação:');
{
  const r = grupos('samir', 'OP227 frete'), top = r.grupos[0].itens[0];
  ok(top.titulo === 'Fechar frete da OP227' && top.termos.length === 2, '"OP227 frete": primeiro o que bate com os dois');
  ok(acha('samir', 'cotaco', 'fin', 'Cotação de frete') && acha('samir', 'shandon', 'sourcing', 'Shandong Machinery'), 'erro de digitação leve ("cotaco", "shandon")');
  ok(grupos('samir', 'x').grupos.length === 0, 'menos de 2 caracteres: nada');
  const f = grupos('samir', 'OP300', { tipo: 'fin' });
  ok(tipos(f).join() === 'fin', 'filtro por aba');
  ok(grupos('samir', 'Cotação', { periodo: '7d' }).grupos.every(g => g.itens.every(i => !i.data || i.data >= new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10))), 'filtro por período');
}

console.log('\nPermissão por perfil (filtrada no servidor):');
{
  const todos = ['ops', 'cotacoes', 'crm', 'fin', 'tarefas', 'fretes', 'docs', 'notas', 'sourcing'];
  ok(B.tiposPermitidos(db, 'samir').join() === todos.join() && B.tiposPermitidos(db, 'davi').join() === todos.join(), 'Samir e Davi: tudo');
  ok(B.tiposPermitidos(db, 'matheus').sort().join() === ['fin', 'fretes', 'ops', 'sourcing', 'tarefas'].join(), 'Matheus: operações, tarefas, fretes, financeiro e sourcing');
  ok(B.tiposPermitidos(db, 'ivina').sort().join() === ['crm', 'docs', 'ops', 'sourcing', 'tarefas'].join(), 'Ívina: operações, clientes, documentos, tarefas e sourcing');
  ok(B.tiposPermitidos(db, 'pedro').join() === 'notas' && B.tiposPermitidos(db, 'oneide').join() === 'tarefas' && B.tiposPermitidos(db, 'estranho').length === 0, 'Pedro: só notas e extratos; RH: só tarefas; desconhecido: nada');
  /* Uma busca ampla por perfil: nada de fora da lista, nem contagem. */
  const amplo = k => ['OP300', 'joao', 'omega', '58762606', '1500', 'escoras', 'frete', 'cambio', '777777', '98765', 'pix'].map(q => grupos(k, q));
  const vazou = (k, proibidos) => amplo(k).some(r => r.grupos.some(g => proibidos.includes(g.tipo)) || JSON.stringify(r.grupos).includes('98765') || JSON.stringify(r.grupos).includes('6123'));
  ok(!vazou('matheus', ['cotacoes', 'crm', 'docs', 'notas']), 'Matheus nunca recebe cotação, CRM, documento ou nota (nem contagem, nem custo)');
  ok(amplo('matheus').some(r => r.grupos.some(g => g.tipo === 'fin')), 'Matheus recebe o financeiro');
  ok(!vazou('ivina', ['fin', 'cotacoes', 'notas', 'fretes']) && !amplo('ivina').some(r => JSON.stringify(r).includes('Contrato de câmbio')), 'Ívina nunca recebe financeiro, cotação, nota, frete nem o contrato de câmbio');
  ok(acha('ivina', 'invoice', 'docs', 'Invoice OP300.pdf') && acha('ivina', 'omega', 'crm', 'Construtora Ômega'), 'Ívina acha documentos e clientes');
  ok(!grupos('ivina', '777777').grupos.length && grupos('samir', '777777').grupos.some(g => g.tipo === 'crm'), 'valor do negócio do CRM: só para quem vê valores');
  ok(!vazou('pedro', ['ops', 'cotacoes', 'crm', 'fin', 'tarefas', 'fretes', 'docs', 'sourcing']) && acha('pedro', '88', 'notas', 'NF 88') && grupos('pedro', 'pix').grupos.some(g => g.tipo === 'notas'), 'Pedro só recebe notas e extratos');
  ok(!vazou('oneide', ['ops', 'cotacoes', 'crm', 'fin', 'fretes', 'docs', 'notas', 'sourcing']), 'RH só recebe tarefas');
  ok(!grupos('samir', '6123').grupos.some(g => g.tipo === 'cotacoes') && !grupos('samir', '98765').grupos.some(g => g.tipo === 'cotacoes'), 'custos e margens da cotação não entram no texto da busca, nem para o Samir');
  ok(!grupos('samir', '88888').grupos.length, 'custo guardado na operação também não entra');
  const so = { users: Object.assign({}, db.users, { matheus: Object.assign({}, db.users.matheus, { tabs: ['ops'] }) }) };
  ok(!B.tiposPermitidos(Object.assign({}, db, so), 'matheus').includes('fretes'), 'aba de Frete não liberada para a pessoa: some da busca também');
}

console.log('\nExclusão sai do índice:');
{
  ok(acha('samir', 'Ligar para a fábrica', 'tarefas', 'Ligar para a fábrica'), 'antes: a tarefa aparece');
  const novo = Object.assign({}, db, { agendaTasks: db.agendaTasks.filter(t => t._id !== 't2') });
  ok(!titulos(B.buscar(novo, 'samir', { q: 'Ligar para a fábrica' }), 'tarefas').includes('Ligar para a fábrica'), 'excluída (banco novo, como na gravação): some na hora');
  db.fin.splice(1, 1);
  ok(!acha('samir', 'cotacao', 'fin', 'Cotação de frete'), 'excluída no próprio banco: some na hora');
}

console.log('\nAjuste de acesso:');
{
  ok(W.pode(db, 'matheus', 'fin.ver') && !W.pode(db, 'matheus', 'fin.resultado') && !W.pode(db, 'ivina', 'fin.ver'), 'Matheus ganha o Financeiro (fin.ver); custos e margens (fin.resultado) seguem fora; Ívina sem financeiro');
  const lido = acesso.paraLeitura(banco(), 'matheus'), q = lido.quotes.q1;
  ok(q._reduzida && q.fields.opNum === 'OP300' && q.fields.mercadoria === 'Escoras' && q.fields.margemPct == null && q.fields.freteUSD == null && q.items[0].u == null && !q.exps && lido.qindex[0].preco == null, 'Matheus recebe a cotação sem custo, margem nem preço');
  ok(Array.isArray(lido.fin) && lido.fin.length === 2, 'Matheus recebe o financeiro');
  const sam = acesso.paraLeitura(banco(), 'samir').quotes.q1;
  ok(sam.fields.margemPct === '25' && sam.items[0].u === 12.5 && acesso.paraLeitura(banco(), 'davi').qindex[0].preco === 98765.43, 'Samir e Davi seguem com custos e margens');
  const atual = banco(), grav = acesso.paraGravacao(atual, Object.assign({}, lido, { _removidos: { iq1: Date.now() } }), 'matheus');
  ok(grav.quotes === undefined && grav.qindex === undefined && !(grav._removidos || {}).iq1, 'o que o Matheus grava de cotação é descartado: a cópia reduzida nunca sobrescreve a verdadeira');
}

console.log('\nDesempenho:');
{
  const g = banco();
  for (let i = 0; i < 4000; i++) {
    g.fin.push({ _id: 'fx' + i, tipo: 'Despesa', desc: 'Lançamento de teste número ' + i, valor: 100 + i, vencimento: '2026-0' + (1 + i % 9) + '-1' + (i % 9), contraparte: 'Fornecedor ' + (i % 50), op: 'OP' + (i % 300) });
    if (i < 1500) g.ops.push({ _id: 'ox' + i, id: 'OP9' + i, cliente: 'Cliente ' + i, status: 'producao', statusEm: '2026-01-01' });
    if (i < 1500) g.agendaTasks.push({ _id: 'tx' + i, t: 'Tarefa de teste ' + i, resp: 'Davi', prazo: '2026-12-01', status: 'aberta' });
  }
  B.buscar(g, 'samir', { q: 'aquecer' });
  const t0 = Date.now(); ['OP227', 'joao', 'fornecedor 12', '1.500,00', 'lancamento'].forEach(q => B.buscar(g, 'samir', { q })); const ms = (Date.now() - t0) / 5;
  ok(ms < 300, `7.000+ registros: ${Math.round(ms)} ms por busca (meta: menos de 300 ms)`);
  const pg = B.buscar(g, 'samir', { q: 'lancamento', tipo: 'fin', pagina: 2 });
  ok(pg.grupos[0].pagina === 2 && pg.grupos[0].itens.length === 20 && pg.grupos[0].paginas > 2, '"ver todos" paginado (20 por página)');
}

(async () => {
  console.log('\nRota /api/search com login:');
  fs.writeFileSync(process.env.WINDGATE_DB_FILE, JSON.stringify(banco()));
  const auth = require('../src/services/auth.service');
  const app = require('../src/server'), srv = app.listen(0), url = `http://127.0.0.1:${srv.address().port}`;
  const get = async (k, q) => { const r = await fetch(url + '/api/search?q=' + encodeURIComponent(q), { headers: k ? { Authorization: 'Bearer ' + auth.emitirToken(k) } : {} }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  const sm = await get('samir', 'OP300'), mt = await get('matheus', 'OP300'), pd = await get('pedro', 'OP300'), sem = await get(null, 'OP300');
  ok(sm.status === 200 && sm.j.grupos.some(g => g.tipo === 'cotacoes'), 'Samir: cotação aparece');
  ok(mt.status === 200 && !mt.j.grupos.some(g => ['cotacoes', 'notas', 'docs', 'crm'].includes(g.tipo)) && mt.j.grupos.some(g => g.tipo === 'fin'), 'Matheus: sem cotação, nota, documento ou CRM; com financeiro');
  ok(pd.status === 200 && pd.j.grupos.length && pd.j.grupos.every(g => g.tipo === 'notas'), 'Pedro: só notas');
  ok(sem.status === 401, 'sem login: 401');
  await new Promise(x => srv.close(x));
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exitCode = falhou ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
