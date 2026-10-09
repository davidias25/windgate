/**
 * Documentos por cliente no CRM.
 *
 * Os documentos pertencem ao CLIENTE, não à oportunidade: o mesmo cliente tem
 * várias oportunidades, e o cadastro, o contrato e o histórico são dele. O
 * vínculo à oportunidade é opcional, e as versões existem porque proposta é
 * revisada antes de fechar — o histórico é a prova do que foi enviado.
 *
 *   node test/crmdocs.test.js
 */
const { carregarApp } = require('./dom-stub');

let falhas = 0, passou = 0;
function assert(cond, msg){
  if (cond) { console.log(`  ✅ ${msg}`); passou++; }
  else { console.error(`  ❌ ${msg}`); falhas++; }
}
function secao(t){ console.log(`\n--- ${t} ---`); }

/* Cenário do prompt: o Márcio, com três oportunidades, sob a Ívina. */
function novoApp(quem){
  const app = carregarApp();
  app.avaliar(`
    DB = defaultDB();
    DB.crm = []; DB.crmOps = []; DB.crmDocs = []; DB.ops = []; DB.quotes = {}; DB.qindex = [];
    DB.crm.push(
      { _id:'cli-marcio', nome:'Márcio', empresa:'Márcio Equipamentos', resp:'Ívina', interacoes:[] },
      { _id:'cli-asa',    nome:'Asa Sul', empresa:'Asa Sul Aço',        resp:'Davi',  interacoes:[] }
    );
    DB.crmOps.push(
      { _id:'opo-lav', clienteId:'cli-marcio', titulo:'Lavadora de Alta Pressão', etapa:'Proposta enviada', resp:'Ívina' },
      { _id:'opo-emp', clienteId:'cli-marcio', titulo:'Empilhadeira',             etapa:'Negociação',       resp:'Ívina' },
      { _id:'opo-des', clienteId:'cli-marcio', titulo:'Desempenadeira',           etapa:'Qualificação',     resp:'Ívina' }
    );
  `);
  const u = {
    samir:  `{ key:'samir',   nome:'Samir Fernandes', tabs:['painel','crm','fin'], fin:true }`,
    davi:   `{ key:'davi',    nome:'Davi',            tabs:['painel','crm','fin'], fin:true }`,
    ivina:  `{ key:'ivina',   nome:'Ívina',           tabs:['painel','crm'],       fin:false }`,
    matheus:`{ key:'matheus', nome:'Matheus',         tabs:['painel','crm'],       fin:false }`
  }[quem || 'samir'];
  app.avaliar(`USER = ${u};`);
  return app;
}
const anexar = (app, campos) => app.crmDocCriar(Object.assign({ clienteId:'cli-marcio', tipo:'Proposta', nome:'arq.pdf', link:'https://s/arq.pdf' }, campos));

/* ==================================================================== */
secao('CRITÉRIO 1 — documento é do cliente, aparece em todas as oportunidades dele');
{
  const app = novoApp();
  anexar(app, { tipo:'Cadastro/CNPJ', nome:'cartao-cnpj.pdf' });

  const docs = app.crmDocsDoCliente('cli-marcio');
  assert(docs.length === 1, 'o documento ficou no cliente');
  assert(!docs[0].oportunidadeId, '★ sem vínculo a oportunidade — é do cliente, não de uma linha');

  // As três oportunidades do Márcio alcançam o mesmo documento.
  const opos = app.crmOpsDoCliente('cli-marcio');
  assert(opos.length === 3, 'o Márcio tem as 3 oportunidades do exemplo');
  opos.forEach(o =>
    assert(app.crmDocsDoCliente(o.clienteId).length === 1,
      `★ "${o.titulo}" vê o cartão CNPJ — é o mesmo arquivo, um lugar só`));

  // E não vaza para outro cliente.
  assert(app.crmDocsDoCliente('cli-asa').length === 0, 'e não aparece na Asa Sul');
  assert(app.crmDocContagem('cli-marcio') === 1, 'o 📎 da lista conta 1');
}

secao('CRITÉRIO 2 — proposta vinculada à oportunidade fica marcada com ela');
{
  const app = novoApp();
  const d = anexar(app, { oportunidadeId:'opo-emp', nome:'proposta-empilhadeira.pdf' });
  assert(d.oportunidadeId === 'opo-emp', '★ a proposta guarda a oportunidade que a originou');

  app.crmDocPainel('cli-marcio');
  const html = app.document.getElementById('modalBox').innerHTML;
  assert(/Empilhadeira/.test(html), '★ o painel mostra a oportunidade na linha do documento');
  assert(/PROPOSTA · 1/.test(html), 'agrupada sob PROPOSTA');
  // Documento solto e vinculado convivem no mesmo cliente.
  anexar(app, { tipo:'Cadastro/CNPJ', nome:'cnpj.pdf' });
  app.crmDocPainel('cli-marcio');
  const h2 = app.document.getElementById('modalBox').innerHTML;
  assert(/PROPOSTA · 1/.test(h2) && /CADASTRO\/CNPJ · 1/.test(h2),
    'os dois aparecem, agrupados por tipo');
  assert(h2.indexOf('PROPOSTA') < h2.indexOf('CADASTRO'), '★ Propostas primeiro');
}

secao('CRITÉRIO 4 — segunda proposta da mesma oportunidade cria v2 sem apagar a v1');
{
  const app = novoApp();
  const v1 = anexar(app, { oportunidadeId:'opo-emp', nome:'proposta-v1.pdf' });
  const v2 = anexar(app, { oportunidadeId:'opo-emp', nome:'proposta-v2.pdf' });
  assert(v1.versao === 1 && v2.versao === 2, '★ v1 e v2');
  assert(app.crmDocsDoCliente('cli-marcio').length === 2, '★ a v1 não foi apagada');

  // A lista mostra só a mais recente por padrão.
  const ultimas = app.crmDocUltimas(app.crmDocsDoCliente('cli-marcio'));
  assert(ultimas.length === 1 && ultimas[0].versao === 2, '★ por padrão só a v2 aparece');
  assert(app.crmDocContagem('cli-marcio') === 1, 'e o 📎 conta 1, não 2 — revisão não é arquivo novo');

  app.crmDocPainel('cli-marcio');
  const html = app.document.getElementById('modalBox').innerHTML;
  assert(/ver versões anteriores \(1\)/.test(html), '★ com link para as versões anteriores');
  assert(/proposta-v2\.pdf/.test(html) && !/proposta-v1\.pdf/.test(html), 'e a v1 fica recolhida');

  // Outra oportunidade tem sua própria contagem de versões.
  const outra = anexar(app, { oportunidadeId:'opo-lav', nome:'proposta-lavadora.pdf' });
  assert(outra.versao === 1, '★ a versão é por oportunidade — a lavadora começa na v1');
  // E documento do cliente (sem oportunidade) também tem a sua.
  assert(anexar(app, { nome:'solta.pdf' }).versao === 1, 'e o documento solto também começa na v1');
}

async function criterio3(){
  secao('CRITÉRIO 3 — aprovar cotação anexa a proposta sozinha');
  const app = novoApp();
  app.avaliar(`
    DB.quotes['q-emp'] = { fields:{ opNum:'OP30', cliente:'Márcio' }, status:'ok' };
    DB.crmOps.find(o=>o._id==='opo-emp').quoteId = 'q-emp';
  `);
  // O upload real vai ao Supabase; aqui só o caminho do anexo importa.
  app.avaliar(`uploadFileUniversal = async f => ({ success:true, url:'https://s/'+f.name, fileName:f.name, source:'teste' });`);

  const pdf = () => new (app.avaliar('Blob'))(['pdf']);
  const r = await app.crmDocAnexarProposta(pdf(), 'Proposta_WindGate_Márcio_OP30.pdf', 'Márcio', 'q-emp');
  assert(r.ok, `★ a proposta foi anexada sozinha${r.ok ? '' : ' — ' + r.motivo}`);
  assert(r.ok && r.cliente._id === 'cli-marcio', '★ no cliente certo, casado pelo nome da cotação');
  assert(r.ok && r.doc.tipo === 'Proposta', 'com tipo = Proposta');
  assert(r.ok && r.oport && r.oport._id === 'opo-emp', '★ e vinculada à oportunidade da cotação');
  assert(r.ok && r.doc.versao === 1, 'na v1');
  assert(r.ok && r.doc.origem === 'proposta-automatica', 'marcada como automática');

  // Gerar de novo incrementa, sem apagar a anterior.
  const r2 = await app.crmDocAnexarProposta(pdf(), 'Proposta_WindGate_Márcio_OP30.pdf', 'Márcio', 'q-emp');
  assert(r2.ok && r2.doc.versao === 2, '★ gerar a proposta de novo cria v2 automaticamente');
  assert(app.crmDocsDoCliente('cli-marcio').length === 2, 'e a v1 continua lá');

  // Cliente fora do CRM não pode derrubar a geração do PDF.
  const r3 = await app.crmDocAnexarProposta(pdf(), 'p.pdf', 'Fulano Que Não Existe', '');
  assert(!r3.ok && /não está no CRM/.test(r3.motivo),
    '★ cliente fora do CRM devolve o motivo em vez de falhar calado');
}

/* ==================================================================== */
function resto(){
  secao('CRITÉRIO 5 — Ívina não exclui e não vê contrato');
{
  const app = novoApp('samir');
  anexar(app, { tipo:'Contrato', nome:'contrato-marcio.pdf' });
  anexar(app, { tipo:'Proposta', nome:'proposta.pdf', oportunidadeId:'opo-emp' });
  assert(app.crmDocsDoCliente('cli-marcio').length === 2, 'Samir vê os 2 documentos');
  assert(app.crmDocPodeExcluir(), 'e pode excluir');

  // Agora como Ívina — responsável pelo Márcio.
  app.avaliar(`USER = { key:'ivina', nome:'Ívina', tabs:['painel','crm'], fin:false };`);
  const vistos = app.crmDocsDoCliente('cli-marcio');
  assert(vistos.length === 1 && vistos[0].tipo === 'Proposta', '★ Ívina vê só a proposta — o contrato não aparece');
  assert(!app.crmDocPodeExcluir(), '★ e não pode excluir');
  assert(app.crmDocContagem('cli-marcio') === 1, 'o 📎 dela conta 1, não 2');

  // Nem cria contrato, para não subir arquivo que desapareceria da própria vista.
  assert(!app.crmDocTiposPermitidos().includes('Contrato'), '★ "Contrato" não está nos tipos que ela pode escolher');
  assert(app.crmDocCriar({ clienteId:'cli-marcio', tipo:'Contrato', nome:'x.pdf', link:'https://s/x' }) === null,
    '★ e tentar criar contrato é recusado');

  // Mas anexa nos clientes dela.
  assert(app.crmDocPodeAnexar(app.crmCliente('cli-marcio')), '★ pode anexar no Márcio, que é dela');
  assert(!app.crmDocPodeAnexar(app.crmCliente('cli-asa')), '★ e não no Asa Sul, que é do Davi');
  assert(app.crmDocCriar({ clienteId:'cli-asa', tipo:'Proposta', nome:'y.pdf', link:'https://s/y' }) === null,
    'criar em cliente de outro é recusado');

  // O painel de cliente alheio abre em leitura.
  app.crmDocPainel('cli-asa');
  const html = app.document.getElementById('modalBox').innerHTML;
  assert(/Somente leitura/.test(html), '★ o painel de cliente alheio avisa que é leitura');
  assert(!/Anexar documento/.test(html), 'sem botão de anexar');

  // Matheus: mesma regra, e o Márcio não é dele.
  app.avaliar(`USER = { key:'matheus', nome:'Matheus', tabs:['painel','crm'], fin:false };`);
  assert(!app.crmDocPodeAnexar(app.crmCliente('cli-marcio')), '★ Matheus não anexa no Márcio — é da Ívina');
  assert(!app.crmDocPodeExcluir(), 'e também não exclui');
}

secao('Exclusão é reversível por 90 dias');
{
  const app = novoApp();
  const d = anexar(app, { nome:'proposta.pdf', oportunidadeId:'opo-emp' });
  app.crmDocExcluir(d._id);   // o confirm do stub responde sim
  assert(!!app.avaliar(`DB.crmDocs.find(x=>x._id==='${d._id}').removidoEm`), '★ soft delete: o registro fica, marcado');
  assert(app.crmDocsDoCliente('cli-marcio').length === 0, 'sai da lista');
  assert(app.avaliar('DB.crmDocs.length') === 1, '★ e nada foi destruído no banco');
  assert(app.avaliar(`DB.crmDocs.find(x=>x._id==='${d._id}').removidoPor`) === 'Samir', 'com quem removeu');

  app.crmDocRestaurar(d._id);
  assert(app.crmDocsDoCliente('cli-marcio').length === 1, '★ restaurar devolve à lista');

  // Reaproveitar número de versão depois de apagar faria duas v2 diferentes.
  app.crmDocExcluir(d._id);
  const nova = anexar(app, { nome:'outra.pdf', oportunidadeId:'opo-emp' });
  assert(nova.versao === 2, '★ a versão não é reaproveitada: a próxima é v2, não v1');
}

secao('Auditoria: quem subiu, quem baixou, quem excluiu');
{
  const app = novoApp();
  const d = anexar(app, { nome:'proposta.pdf', oportunidadeId:'opo-emp' });
  assert(d.acessos.length === 1 && d.acessos[0].acao === 'upload' && d.acessos[0].quem === 'Samir',
    '★ o upload fica registrado com quem e quando');
  app.crmDocBaixar(d._id);
  const dd = app.avaliar(`DB.crmDocs.find(x=>x._id==='${d._id}')`);
  assert(dd.acessos.some(a => a.acao === 'download' && a.quem === 'Samir'), '★ o download também');
  app.crmDocExcluir(d._id);
  const de = app.avaliar(`DB.crmDocs.find(x=>x._id==='${d._id}')`);
  assert(de.acessos.some(a => a.acao === 'exclusao'), '★ e a exclusão');
  assert(de.acessos.every(a => !!a.em), 'todas com data e hora');
}

secao('Formato e tamanho conferidos antes de subir');
{
  const app = novoApp();
  const inval = n => app.crmDocArquivoInvalido(n);
  assert(/não aceito/.test(inval({ name:'virus.exe', size:100 })), '★ .exe recusado');
  assert(/não aceito/.test(inval({ name:'a.zip', size:100 })), '.zip fora da lista do CRM');
  assert(!inval({ name:'p.pdf', size:1000 }), 'PDF aceito');
  ['jpg','png','docx','xlsx'].forEach(e => assert(!inval({ name:'a.'+e, size:1000 }), `.${e} aceito`));
  assert(/limite é 25 MB/.test(inval({ name:'g.pdf', size:26 * 1048576 })), '★ acima de 25 MB recusado');
  assert(!inval({ name:'g.pdf', size:24 * 1048576 }), 'e 24 MB passa');
}

secao('CRITÉRIO 6 — oportunidade fechada mostra os comerciais na Documentação da operação');
{
  const app = novoApp();
  app.avaliar(`
    DB.quotes['q-emp'] = { fields:{ opNum:'OP30', cliente:'Márcio' }, status:'ok' };
    DB.crmOps.find(o=>o._id==='opo-emp').quoteId = 'q-emp';
    DB.crmOps.find(o=>o._id==='opo-emp').etapa = 'Fechado';
    DB.ops.push({ id:'OP30', nome:'Empilhadeira Márcio', cliente:'Márcio', status:'producao' });
  `);
  const prop = anexar(app, { oportunidadeId:'opo-emp', nome:'proposta-fechada.pdf' });
  anexar(app, { tipo:'Cadastro/CNPJ', nome:'cnpj.pdf' });   // solto: não é da operação

  const vinc = app.crmOportsDaOperacao('OP30');
  assert(vinc.length === 1 && vinc[0].op._id === 'opo-emp', '★ a ponte acha a oportunidade pela cotação');
  assert(vinc[0].via === 'cotação', 'e diz que o vínculo veio da cotação');

  const daOp = app.crmDocsDaOperacao('OP30');
  assert(daOp.length === 1 && daOp[0].doc._id === prop._id,
    '★ só o documento vinculado à oportunidade entra — o cadastro solto não');

  app.openOpDocsModal('OP30');
  const html = app.document.getElementById('modalBox').innerHTML;
  assert(/COMERCIAIS \(DO CRM\)/.test(html), '★ a Documentação da operação ganha o bloco dos comerciais');
  assert(/proposta-fechada\.pdf/.test(html), 'com a proposta');
  assert(/aqui é só o acesso/.test(html), '★ dizendo que é referência, não cópia');
  assert(/CRM →/.test(html), 'com o atalho de volta ao CRM');
  assert(app.avaliar("DB.docs.filter(d=>d.op==='OP30').length") === 0,
    '★ e NENHUMA cópia foi criada em DB.docs — um arquivo, um lugar de verdade');

  // Quem não vê financeiro não vê o bloco comercial na operação.
  app.avaliar(`USER = { key:'matheus', nome:'Matheus', tabs:['painel'], fin:false };`);
  app.openOpDocsModal('OP30');
  assert(!/COMERCIAIS \(DO CRM\)/.test(app.document.getElementById('modalBox').innerHTML),
    'Matheus não vê o bloco comercial');
}

secao('A coleção entra na sincronização');
{
  const { COLECOES } = require('../src/services/db-merge.service');
  assert(COLECOES.includes('crmDocs'), '★ o servidor mescla crmDocs registro a registro, por _id');
  const app = novoApp();
  assert(app.COLECOES_SYNC.includes('crmDocs'), '★ e o cliente também — exclusão vira tombstone');
}

}

/* O anexo automático da proposta passa por upload, que é assíncrono — daí o
   await antes do resto das seções. */
(async () => {
  await criterio3();
  resto();
  console.log(`\n${passou} verificações passaram, ${falhas} falharam.`);
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('❌', e); process.exit(1); });
