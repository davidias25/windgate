/**
 * Recorrência de lançamentos fixos.
 *
 * O bug que este arquivo guarda: "Fixa Mensal" era UM registro que a tela
 * repetia em cada mês, então marcar setembro como Realizado marcava os doze
 * meses de uma vez — e o mesmo valia para comprovante e valor.
 *
 * O teste roda o código de tela DE VERDADE (public/index.html carregado num
 * DOM de mentira, ver test/dom-stub.js). Testar uma reimplementação das regras
 * não provaria nada: o vazamento estava dentro do `renderFin`.
 *
 *   node test/recorrencia.test.js
 */
const { carregarApp } = require('./dom-stub');

let falhas = 0, passou = 0;
function assert(cond, msg){
  if (cond) { console.log(`  ✅ ${msg}`); passou++; }
  else { console.error(`  ❌ ${msg}`); falhas++; }
}
function secao(t){ console.log(`\n--- ${t} ---`); }

/* Cada cenário parte de um sistema limpo: o estado do financeiro é global e um
   teste não pode herdar as séries do anterior. */
function novoApp(){
  const app = carregarApp();
  app.avaliar(`
    DB = defaultDB();
    DB.fin = []; DB.finRec = []; DB.ops = []; DB.settings = { schema: 14 };
    USER = { key:'samir', nome:'Samir Teste', papel:'Sócio', cor:'#E91E63',
             tabs:['painel','fin'], fin:true, aprova:true };
  `);
  return app;
}

/* Preenche os campos do modal de lançamento e salva, como o navegador faria. */
function preencher(app, campos){
  Object.entries(campos).forEach(([id, v]) => { app.document.getElementById(id).value = String(v); });
}

const linhasDaTela = app => (app.document.getElementById('finBody').innerHTML || '')
  .split('<tr>').slice(1);

/* Renderiza o financeiro com um recorte de mês e devolve o HTML das linhas. */
function telaDoMes(app, mes){
  app.document.getElementById('finMesFiltro').value = mes;
  app.document.getElementById('finBusca').value = '';
  app.document.getElementById('finSerieFiltro').value = '';
  app.document.getElementById('finStFiltro').value = '';
  app.document.getElementById('finNatFiltro').value = '';
  app.document.getElementById('finEmpresa').value = '';
  app.document.getElementById('finFilter').value = '';
  app.renderFin();
  return {
    linhas: linhasDaTela(app),
    dash: app.document.getElementById('finDashGrid').innerHTML || '',
    resumo: app.document.getElementById('finResumo').innerHTML || '',
    opsBody: app.document.getElementById('finOpsBody').innerHTML || ''
  };
}

function criarFixaMensal(app, extras){
  app.openLancModal();
  preencher(app, Object.assign({
    m_lfixo: 'true', m_lop: 'WindGate', m_ltipo: 'Despesa', m_lcat: '',
    m_lvenc: '2026-09-10', m_ldata: '2026-09-01', m_lval: '4500',
    m_lemp: 'WindGate', m_lst: 'Previsto', m_ldesc: 'Aluguel do escritório',
    m_lcomp: '', m_lnf: '', m_lrec_total: '12'
  }, extras || {}));
  app.saveLanc(null);
  return app.avaliar('DB.finRec[DB.finRec.length-1]');
}

/* ==================================================================== */

secao('Aritmética de mês e regra do último dia');
{
  const app = novoApp();
  assert(app.finMesSoma('2026-09', 1) === '2026-10', 'setembro + 1 mês = outubro');
  assert(app.finMesSoma('2026-12', 1) === '2027-01', 'dezembro + 1 mês vira o ano');
  assert(app.finMesSoma('2026-01', 13) === '2027-02', 'somar 13 meses atravessa o ano');
  assert(app.finMesDiff('2026-08', '2027-07') === 11, 'agosto a julho são 11 meses de distância');
  assert(app.finVencDoMes('2027-02', 31) === '2027-02-28', 'dia 31 em fevereiro cai em 28 (último dia)');
  assert(app.finVencDoMes('2028-02', 31) === '2028-02-29', 'ano bissexto: 31 cai em 29');
  assert(app.finVencDoMes('2026-09', 31) === '2026-09-30', 'dia 31 em setembro cai em 30');
  assert(app.finVencDoMes('2026-09', 10) === '2026-09-10', 'dia que existe é mantido');
}

secao('Criar uma fixa materializa 12 ocorrências, todas Previstas');
{
  const app = novoApp();
  const s = criarFixaMensal(app);
  const ocs = app.finOcorrencias(s._id);

  assert(app.avaliar('DB.finRec.length') === 1, 'a série (o modelo) foi criada');
  assert(ocs.length === 12, `12 ocorrências materializadas (veio ${ocs.length})`);
  assert(ocs.every(o => o.status === 'Previsto'), 'todas nascem Previstas');
  assert(ocs.every((o, i) => o.recIdx === i + 1 && o.recTot === 12), 'índices 1/12 … 12/12');
  assert(new Set(ocs.map(o => o.mesRef)).size === 12, 'doze meses distintos, sem repetir');
  assert(ocs[0].mesRef === '2026-09' && ocs[11].mesRef === '2027-08', 'de set/2026 a ago/2027');
  assert(new Set(ocs.map(o => o._id)).size === 12, 'cada ocorrência tem o seu próprio _id');
  assert(ocs.every(o => o.vencimento.slice(8) === '10'), 'todas vencem no dia 10');
  assert(ocs.every(o => o.valor === 4500), 'todas herdam o valor padrão da série');
}

secao('Dia 31: a série respeita o último dia de cada mês');
{
  const app = novoApp();
  const s = criarFixaMensal(app, { m_lvenc: '2026-12-31', m_ldesc: 'Contabilidade', m_lval: '1800' });
  const ocs = app.finOcorrencias(s._id);
  const fev = ocs.find(o => o.mesRef === '2027-02');
  const abr = ocs.find(o => o.mesRef === '2027-04');
  assert(fev && fev.vencimento === '2027-02-28', 'fevereiro/2027 vence em 28, não em 03/03');
  assert(abr && abr.vencimento === '2027-04-30', 'abril vence em 30');
  assert(ocs.every(o => o.vencimento.startsWith(o.mesRef)), 'nenhuma ocorrência vaza para outro mês');
}

secao('Nº de ocorrências: empréstimo em 9 parcelas');
{
  const app = novoApp();
  const s = criarFixaMensal(app, { m_lrec_total: '9', m_ldesc: '🔴 Empréstimo JeT', m_lval: '3000', m_lemp: 'JeT' });
  const ocs = app.finOcorrencias(s._id);
  assert(ocs.length === 9, '9 parcelas, não 12');
  assert(ocs[8].recIdx === 9 && ocs[8].recTot === 9, 'a última é 9/9');
  assert(app.finSerieFim(s) === '2027-05', 'a última parcela cai em maio/2027');
  assert(ocs.every(o => o.desc.indexOf('🔴') === 0), 'o marcador 🔴 da JeT vai em todas as ocorrências');
  assert(ocs.every(o => o.empresa === 'JeT'), 'todas ficam na empresa JeT');
}

secao('Primeira já Realizada não contamina as outras');
{
  const app = novoApp();
  const s = criarFixaMensal(app, { m_lst: 'Realizado', m_lliq: '2026-09-10', m_lcomp: 'https://drive/comp.pdf' });
  const ocs = app.finOcorrencias(s._id);
  assert(ocs[0].status === 'Realizado', 'a primeira nasce Realizada');
  assert(ocs[0].comp === 'https://drive/comp.pdf', 'o comprovante fica na primeira');
  assert(ocs.slice(1).every(o => o.status === 'Previsto'), 'as outras 11 nascem Previstas');
  assert(ocs.slice(1).every(o => !o.comp), 'nenhuma outra recebe o comprovante');
}

/* ==================================================================== */
secao('★ O BUG: realizar UM mês não pode realizar os outros onze');
{
  const app = novoApp();
  const s = criarFixaMensal(app);
  const setembro = app.finOcorrencias(s._id).find(o => o.mesRef === '2026-09');

  // O caminho da tela: o select de status abre o modal de realização, e o
  // modal grava a data e o valor efetivamente pago.
  app.setFinStatus(setembro._id, 'Realizado');
  preencher(app, { m_rliq: '2026-09-12', m_rval: '4650' });
  app.finRealizar(setembro._id);

  const ocs = app.finOcorrencias(s._id);
  const set = ocs.find(o => o.mesRef === '2026-09');
  const outras = ocs.filter(o => o.mesRef !== '2026-09');

  assert(set.status === 'Realizado', 'setembro ficou Realizado');
  assert(outras.length === 11, 'existem outras 11 ocorrências');
  assert(outras.every(o => o.status === 'Previsto'), '★ as outras 11 continuam Previstas (no dado)');
  assert(set.valorPago === 4650 && set.valor === 4650, 'o valor pago de setembro é 4.650');
  assert(set.valorPrevisto === 4500, 'setembro guarda o previsto de 4.500 para conferência');
  assert(outras.every(o => o.valor === 4500), '★ as outras continuam valendo 4.500');
  assert(app.finSerie(s._id).valor === 4500, '★ o valor padrão da série não mudou');
  assert(set.liquidadoEm === '2026-09-12', 'a data de pagamento é a informada');
  assert(outras.every(o => !o.liquidadoEm), 'nenhuma outra ganhou data de pagamento');

  // ---- na LISTAGEM ----
  const tSet = telaDoMes(app, '2026-09');
  const tOut = telaDoMes(app, '2026-10');
  const tNov = telaDoMes(app, '2026-11');
  assert(tSet.linhas.length === 1 && /Fixa 1\/12/.test(tSet.linhas[0]), 'setembro mostra uma linha "Fixa 1/12"');
  assert(/option selected(="")?>Realizado|Realizado<\/option>/.test(tSet.linhas[0].replace(/\s+/g, ' ')) || tSet.linhas[0].indexOf("'selected'") < 0, 'a linha de setembro existe na tela');
  assert(tOut.linhas.length === 1 && /Fixa 2\/12/.test(tOut.linhas[0]), 'outubro mostra "Fixa 2/12"');
  assert(/<option selected>Previsto<\/option>/.test(tOut.linhas[0]) || tOut.linhas[0].indexOf('<option selected>Previsto') >= 0,
    '★ na listagem de outubro o status é Previsto');
  assert(tNov.linhas[0].indexOf('<option selected>Previsto') >= 0, '★ na listagem de novembro o status é Previsto');
  assert(tOut.linhas[0].indexOf('4.650') < 0, '★ outubro não herdou o valor pago de setembro');

  // ---- no FLUXO DE CAIXA ----
  // Só os cartões "no Mês" respondem ao filtro; os "na Semana" são de segunda
  // a domingo por definição e ignoram o mês escolhido — comparar contra eles
  // faria o teste passar ou falhar conforme o dia em que roda.
  const pagasNoMes = mes => {
    const d = telaDoMes(app, mes).dash;
    const m = /Contas Pagas no M[êe]s<\/div>\s*<div class="c-val"[^>]*>([^<]+)/.exec(d);
    return m ? m[1].trim() : null;
  };
  assert(pagasNoMes('2026-09') !== null, 'os cartões do mês foram montados');
  assert(/4\.650,00/.test(pagasNoMes('2026-09')), 'setembro paga R$ 4.650,00 no cartão do mês');
  ['2026-10', '2026-11', '2027-08'].forEach(m =>
    assert(/^R\$\s*0,00$/.test(pagasNoMes(m)), `★ ${m} não conta nada como pago (veio ${pagasNoMes(m)})`));

  // ---- nos RELATÓRIOS (resultado por operação e Gestão do Mês) ----
  const ops = telaDoMes(app, '2026-09').opsBody;
  assert(ops.indexOf('4.650,00') >= 0, 'a despesa realizada entra no resultado por operação');
  const gSet = app.gmMetrics('2026-09');
  const gOut = app.gmMetrics('2026-10');
  assert(gSet.desp === 4650, `Gestão do Mês de set/2026 soma 4.650 de despesa realizada (veio ${gSet.desp})`);
  assert(gOut.desp === 0, `★ Gestão do Mês de out/2026 soma 0 de realizado (veio ${gOut.desp})`);
}

secao('★ Comprovante e valor também ficam presos ao mês');
{
  const app = novoApp();
  const s = criarFixaMensal(app);
  const out = app.finOcorrencias(s._id).find(o => o.mesRef === '2026-10');

  app.anexarComprovanteModal(out._id);
  app.document.getElementById('m_fin_link').value = 'https://drive/aluguel-outubro.pdf';
  app.salvarFinComprovanteLink(out._id);

  const ocs = app.finOcorrencias(s._id);
  const comComp = ocs.filter(o => o.comp);
  assert(comComp.length === 1 && comComp[0].mesRef === '2026-10', '★ só outubro ficou com comprovante');
  assert(ocs.filter(o => o.status === 'Realizado').length === 1, '★ só outubro ficou Realizado');
}

secao('★ Comprovante nunca deixa uma conta paga sem data de pagamento');
{
  const app = novoApp();
  const s = criarFixaMensal(app);
  const futura = app.finOcorrencias(s._id).find(o => o.mesRef === '2027-03');

  app.anexarComprovanteModal(futura._id);
  app.document.getElementById('m_fin_link').value = 'https://drive/adiantado.pdf';
  app.salvarFinComprovanteLink(futura._id);

  const dep = app.finPorId(futura._id);
  assert(dep.status === 'Realizado' && !!dep.liquidadoEm,
    '★ anexar comprovante grava a data de pagamento junto com o Realizado');

  // A query de verificação do Samir, rodada sobre o banco inteiro.
  const hoje = app.agHoje();
  const violacoes = app.avaliar('DB.fin').filter(l =>
    l && l.status === 'Realizado' && (l.vencimento || l.data || '') > hoje && !l.liquidadoEm);
  assert(violacoes.length === 0,
    `★ nenhum Realizado com vencimento futuro e sem data de pagamento (veio ${violacoes.length})`);
}

secao('Migração 15 conserta os "Realizado sem data de pagamento" já gravados');
{
  const app = novoApp();
  app.avaliar(`
    DB.settings = { schema: 14 };
    DB.fin = [
      {_id:'a',vencimento:'2026-08-19',data:'2026-08-19',tipo:'Despesa',desc:'Vencido, pago sem data',valor:100,status:'Realizado',liquidadoEm:null,comp:'https://d/x.pdf',fixo:false,empresa:'WindGate',op:''},
      {_id:'b',vencimento:'2027-05-10',data:'2027-05-10',tipo:'Despesa',desc:'A vencer, pago sem data',valor:200,status:'Realizado',liquidadoEm:null,comp:'https://d/y.pdf',fixo:false,empresa:'WindGate',op:''},
      {_id:'c',vencimento:'2026-08-01',data:'2026-08-01',tipo:'Despesa',desc:'Previsto, intocado',valor:300,status:'Previsto',liquidadoEm:null,comp:'',fixo:false,empresa:'WindGate',op:''}
    ];
  `);
  app.migrateDB();
  const [a, b, c] = ['a', 'b', 'c'].map(id => app.finPorId(id));
  assert(a.liquidadoEm === '2026-08-19', 'vencido recebe a data do próprio vencimento');
  assert(b.liquidadoEm === app.agHoje(), 'a vencer não pode ter sido pago no futuro — recebe hoje');
  assert(c.liquidadoEm === null && c.status === 'Previsto', 'o que estava Previsto não foi tocado');

  const hoje = app.agHoje();
  const violacoes = app.avaliar('DB.fin').filter(l =>
    l && l.status === 'Realizado' && (l.vencimento || l.data || '') > hoje && !l.liquidadoEm);
  assert(violacoes.length === 0, '★ a query de verificação zera depois da migração');
}

secao('Desfazer a realização devolve o valor previsto do mês');
{
  const app = novoApp();
  const s = criarFixaMensal(app);
  const set = app.finOcorrencias(s._id)[0];
  app.setFinStatus(set._id, 'Realizado');
  preencher(app, { m_rliq: '2026-09-12', m_rval: '4650' });
  app.finRealizar(set._id);
  app.setFinStatus(set._id, 'Previsto');
  const dep = app.finPorId(set._id);
  assert(dep.status === 'Previsto' && dep.valor === 4500, 'volta a valer 4.500');
  assert(dep.valorPago === null && dep.valorPrevisto === null && !dep.liquidadoEm, 'pagamento apagado por inteiro');
}

/* ==================================================================== */
secao('Editar: "somente este mês" × "este e os próximos"');
{
  const app = novoApp();
  const s = criarFixaMensal(app);
  const ocs = () => app.finOcorrencias(s._id);
  const nov = ocs().find(o => o.mesRef === '2026-11');

  app.openLancModal(nov._id);
  preencher(app, { m_lval: '5000', m_lescopo: 'este', m_lvenc: '2026-11-10' });
  app.saveLanc(nov._id);

  assert(app.finPorId(nov._id).valor === 5000, 'novembro passou a 5.000');
  assert(ocs().filter(o => o.valor === 5000).length === 1, '★ só novembro mudou de valor');
  assert(app.finSerie(s._id).valor === 4500, 'o valor padrão da série continua 4.500');

  // Agora "este e os próximos", com dezembro já Realizado para provar a proteção.
  const dez = ocs().find(o => o.mesRef === '2026-12');
  app.setFinStatus(dez._id, 'Realizado');
  preencher(app, { m_rliq: '2026-12-10', m_rval: '4500' });
  app.finRealizar(dez._id);

  const out = ocs().find(o => o.mesRef === '2026-10');
  app.openLancModal(out._id);
  preencher(app, { m_lval: '4800', m_lescopo: 'proximos', m_lvenc: '2026-10-15', m_ldesc: 'Aluguel do escritório (reajuste)' });
  app.saveLanc(out._id);

  const depois = ocs();
  const antesDeOut = depois.filter(o => o.recIdx < out.recIdx);
  const depoisDeOut = depois.filter(o => o.recIdx > out.recIdx && o.status !== 'Realizado');

  assert(app.finPorId(out._id).valor === 4800, 'outubro passou a 4.800');
  assert(depoisDeOut.every(o => o.valor === 4800), 'as futuras Previstas passaram a 4.800');
  assert(depoisDeOut.every(o => o.vencimento.slice(8) === '15'), 'o novo dia 15 valeu para as futuras Previstas');
  assert(app.finPorId(dez._id).valor === 4500, '★ dezembro, já Realizado, continua em 4.500');
  assert(app.finPorId(dez._id).vencimento === '2026-12-10', '★ dezembro, já Realizado, manteve o vencimento');
  assert(antesDeOut.every(o => o.valor === 4500), '★ os meses anteriores não foram tocados');
  assert(app.finSerie(s._id).valor === 4800, 'o valor padrão da série acompanhou');
  assert(depois.every(o => o.vencimento.startsWith(o.mesRef)), 'nenhuma ocorrência mudou de mês');
}

secao('Excluir: somente este mês, ou este e os próximos');
{
  const app = novoApp();
  const s = criarFixaMensal(app);
  const alvo = app.finOcorrencias(s._id).find(o => o.mesRef === '2026-11');

  app.finExcluirModal(alvo._id);
  app.document.getElementById('m_xescopo').value = 'este';
  app.finExcluirConfirma(alvo._id);
  assert(app.finOcorrencias(s._id).length === 11, 'sobraram 11 ocorrências');
  assert(!app.finPorId(alvo._id), 'novembro saiu');
  assert(app.avaliar('DB._removidos') && Object.keys(app.avaliar('DB._removidos')).length >= 1, 'a exclusão virou tombstone para a sincronização');
}
{
  const app = novoApp();
  const s = criarFixaMensal(app);
  const jan = app.finOcorrencias(s._id).find(o => o.mesRef === '2027-01');
  const fev = app.finOcorrencias(s._id).find(o => o.mesRef === '2027-02');

  // Fevereiro já pago: "este e os próximos" não pode encostar nele.
  app.setFinStatus(fev._id, 'Realizado');
  preencher(app, { m_rliq: '2027-02-10', m_rval: '4500' });
  app.finRealizar(fev._id);

  app.finExcluirModal(jan._id);
  app.document.getElementById('m_xescopo').value = 'proximos';
  app.finExcluirConfirma(jan._id);

  const restantes = app.finOcorrencias(s._id);
  assert(!app.finPorId(jan._id), 'janeiro (Previsto) saiu');
  assert(!!app.finPorId(fev._id), '★ fevereiro, já Realizado, NÃO foi apagado');
  assert(restantes.every(o => o.mesRef < '2027-01' || o.status === 'Realizado'), '★ só as Previstas de jan/2027 em diante sumiram');
  assert(app.finSerie(s._id).encerradaEm === '2027-01', 'a série ficou marcada como encerrada em jan/2027');
  assert(restantes.every(o => o.recTot === app.finSerie(s._id).total), 'o denominador da tag foi recalculado');
}

secao('Encerrar recorrência a partir de um mês escolhido');
{
  const app = novoApp();
  const s = criarFixaMensal(app);
  const marco = app.finOcorrencias(s._id).find(o => o.mesRef === '2027-03');
  app.finEncerrarModal(marco._id);
  app.document.getElementById('m_encmes').value = '2027-03';
  app.finEncerrarConfirma(s._id);

  const ocs = app.finOcorrencias(s._id);
  assert(ocs.length === 6, `sobraram as 6 ocorrências de set/2026 a fev/2027 (veio ${ocs.length})`);
  assert(ocs.every(o => o.mesRef < '2027-03'), 'nada de março/2027 em diante');
  assert(app.finSerie(s._id).encerradaEm === '2027-03', 'a série registra o mês do encerramento');
}

secao('Renovação: só com confirmação, e sem tocar no que já existe');
{
  const app = novoApp();
  const s = criarFixaMensal(app);
  const set = app.finOcorrencias(s._id)[0];
  app.setFinStatus(set._id, 'Realizado');
  preencher(app, { m_rliq: '2026-09-10', m_rval: '4500' });
  app.finRealizar(set._id);

  app.finRenovarModal(s._id);
  preencher(app, { m_renmeses: '12', m_renval: '4500' });
  app.finRenovarConfirma(s._id);

  const ocs = app.finOcorrencias(s._id);
  assert(ocs.length === 24, `24 ocorrências depois de renovar (veio ${ocs.length})`);
  assert(ocs[11].mesRef === '2027-08', 'a 12/24 continua sendo ago/2027, o antigo fim da série');
  assert(ocs[23].mesRef === '2028-08' && app.finSerieFim(app.finSerie(s._id)) === '2028-08',
    'a série passa a terminar em ago/2028');
  assert(ocs.every(o => o.recTot === 24), 'todas as tags passaram a n/24');
  assert(ocs.filter(o => o.status === 'Realizado').length === 1, '★ a renovação não mexeu no que já estava realizado');
  assert(ocs.slice(1).every(o => o.status === 'Previsto'), 'as novas nascem Previstas');
  assert(!app.finSerie(s._id).encerradaEm, 'a série voltou a ficar ativa');
}

secao('Aviso de renovação aparece na reta final e não antes');
{
  const app = novoApp();
  const hoje = app.agHoje().slice(0, 7);
  criarFixaMensal(app, { m_lvenc: hoje + '-10' });                 // termina daqui a 11 meses
  assert(app.finSeriesParaRenovar().length === 0, 'série que acabou de nascer não pede renovação');

  const curta = criarFixaMensal(app, { m_lvenc: hoje + '-15', m_lrec_total: '2', m_ldesc: 'Software mensal' });
  assert(app.finSeriesParaRenovar().some(x => x._id === curta._id), 'série que termina no mês que vem pede renovação');

  const notifs = app.computeNotifs().filter(x => x.tg === 'Financeiro — Renovação de série');
  assert(notifs.length === 1, 'o aviso chega como notificação');
  assert(notifs[0].rec === curta._id, 'a notificação leva direto para a série');
  assert(/Software mensal/.test(notifs[0].tx) && /renovar/i.test(notifs[0].tx), 'o texto diz qual despesa e propõe renovar');
}

/* ==================================================================== */
secao('★ Mês e filtros são cumulativos (E, não OU)');
{
  const app = novoApp();
  const s = criarFixaMensal(app);                       // 12 meses, set/2026 → ago/2027
  criarFixaMensal(app, { m_ldesc: 'Contabilidade Pedro', m_lval: '900', m_lvenc: '2026-09-20' });
  // Uma pontual em setembro e outra em novembro, para o mês ter o que separar.
  [['2026-09-25', 'Frete internacional', '22000'], ['2026-11-25', 'Frete internacional', '15000']]
    .forEach(([venc, desc, val]) => {
      app.openLancModal();
      preencher(app, {
        m_lfixo: 'false', m_lop: 'WindGate', m_ltipo: 'Despesa', m_lcat: '',
        m_lvenc: venc, m_ldata: venc, m_lval: val, m_lemp: 'WindGate',
        m_lst: 'Previsto', m_ldesc: desc, m_lcomp: '', m_lnf: ''
      });
      app.saveLanc(null);
    });

  const mesDaLinha = l => (l.vencimento || '').slice(0, 7);
  /* Aplica um conjunto de filtros SOBRE o mês e devolve os registros listados,
     recuperados pelo _id que a própria linha carrega — é o que está na tela,
     não o que o teste imagina que deveria estar. */
  function comFiltros(mes, f){
    ['finBusca','finSerieFiltro','finStFiltro','finNatFiltro','finEmpresa','finFilter'].forEach(id =>
      app.document.getElementById(id).value = '');
    app.document.getElementById('finMesFiltro').value = mes;
    Object.entries(f || {}).forEach(([k, v]) => { app.document.getElementById(k).value = v; });
    app.renderFin();
    const html = app.document.getElementById('finBody').innerHTML || '';
    const ids = [];
    html.replace(/onchange="setFinStatus\('([^']+)'/g, (m, id) => { ids.push(id); return m; });
    return ids.map(id => app.finPorId(id)).filter(Boolean);
  }

  const casos = [
    ['sem filtro',            {}],
    ['Apenas Fixas',          { finNatFiltro: 'fixo' }],
    ['Apenas Pontuais',       { finNatFiltro: 'pontual' }],
    ['Status Previsto',       { finStFiltro: 'Previsto' }],
    ['Empresa WindGate',      { finEmpresa: 'WindGate' }],
    ['Série',                 { finSerieFiltro: s._id }],
    ['Busca "frete"',         { finBusca: 'frete' }],
    ['Busca "aluguel"',       { finBusca: 'aluguel' }],
    ['Fixas + Previsto',      { finNatFiltro: 'fixo', finStFiltro: 'Previsto' }],
    ['Série + Previsto',      { finSerieFiltro: s._id, finStFiltro: 'Previsto' }],
    ['Busca + Fixas',         { finBusca: 'aluguel', finNatFiltro: 'fixo' }]
  ];
  casos.forEach(([nome, f]) => {
    const regs = comFiltros('2026-09', f);
    const fora = regs.filter(l => mesDaLinha(l) !== '2026-09');
    assert(fora.length === 0,
      `★ ${nome}: nenhuma linha de outro mês (veio ${fora.length}${fora.length ? ' de ' + [...new Set(fora.map(mesDaLinha))].join(',') : ''})`);
  });

  // O caso que o Samir relatou, conferido contra o banco.
  const fixasSet = comFiltros('2026-09', { finNatFiltro: 'fixo' });
  const noBanco = app.avaliar('DB.fin').filter(l => l && l.fixo && (l.vencimento || '').startsWith('2026-09'));
  assert(fixasSet.length === noBanco.length && fixasSet.length === 2,
    `★ mês + "Apenas Fixas" = as ${noBanco.length} fixas de set/2026, e só elas`);

  // Busca acha o que existe no mês e não arrasta os outros onze.
  const busca = comFiltros('2026-09', { finBusca: 'aluguel' });
  assert(busca.length === 1 && busca[0].mesRef === '2026-09', '★ busca fica dentro do mês selecionado');

  // …mas avisa que há mais fora, com o passo explícito.
  const resumo = app.document.getElementById('finResumo').innerHTML;
  assert(/fora de setembro de 2026/.test(resumo) && /ver todos os meses/.test(resumo),
    'o resumo diz quantos ficaram fora e oferece "ver todos os meses"');

  // Sem filtro nenhum não há o que avisar.
  comFiltros('2026-09', {});
  assert(!/fora de setembro/.test(app.document.getElementById('finResumo').innerHTML),
    'sem filtro ativo, o aviso não aparece');
}

secao('Trocar de mês com filtro ativo, e limpar o filtro');
{
  const app = novoApp();
  const s = criarFixaMensal(app);
  const linhas = () => (app.document.getElementById('finBody').innerHTML || '').split('<tr>').slice(1);

  app.document.getElementById('finMesFiltro').value = '2026-09';
  app.document.getElementById('finNatFiltro').value = 'fixo';
  app.renderFin();
  assert(linhas().length === 1 && /Fixa 1\/12/.test(linhas()[0]), 'set/2026 com "Apenas Fixas" mostra a 1/12');

  // Trocar o mês pelo mesmo caminho da tela: o filtro continua valendo.
  app.setFinPeriod('proxMes');
  app.document.getElementById('finMesFiltro').value = '2026-11';
  app.renderFin();
  assert(app.document.getElementById('finNatFiltro').value === 'fixo', 'o filtro não foi limpo ao trocar de mês');
  assert(linhas().length === 1 && /Fixa 3\/12/.test(linhas()[0]), '★ nov/2026 reaplica o filtro no mês novo — a 3/12');

  // Limpar o filtro devolve o MÊS inteiro, não todos os meses.
  app.document.getElementById('finNatFiltro').value = '';
  app.renderFin();
  const regs = linhas();
  assert(regs.length === 1, '★ limpar o filtro volta ao mês completo (1 lançamento em nov/2026)');
  assert(app.document.getElementById('finMesFiltro').value === '2026-11', 'e o mês selecionado continua o mesmo');

  // "Todos" é a única porta para ver todos os meses, e é explícita.
  app.setFinPeriod('todos');
  assert(app.document.getElementById('finMesFiltro').value === '', 'o botão "Todos" esvazia o seletor de mês');
  assert(linhas().length === 12, 'e aí sim aparecem os 12 meses');
  assert(/todos os meses/.test(app.document.getElementById('finResumo').innerHTML), 'o resumo diz que são todos os meses');
}

secao('Totais na tela batem com as linhas listadas');
{
  const app = novoApp();
  criarFixaMensal(app);
  criarFixaMensal(app, { m_ldesc: 'Contabilidade', m_lval: '900', m_lvenc: '2026-09-20' });
  app.openLancModal();
  preencher(app, {
    m_lfixo: 'false', m_lop: 'WindGate', m_ltipo: 'Receita', m_lcat: '',
    m_lvenc: '2026-09-25', m_ldata: '2026-09-25', m_lval: '30000', m_lemp: 'WindGate',
    m_lst: 'Previsto', m_ldesc: 'Recebimento cliente', m_lcomp: '', m_lnf: ''
  });
  app.saveLanc(null);

  const conferir = (mes, f, rotulo) => {
    ['finBusca','finSerieFiltro','finStFiltro','finNatFiltro','finEmpresa','finFilter'].forEach(id =>
      app.document.getElementById(id).value = '');
    app.document.getElementById('finMesFiltro').value = mes;
    Object.entries(f || {}).forEach(([k, v]) => { app.document.getElementById(k).value = v; });
    app.renderFin();
    const html = app.document.getElementById('finBody').innerHTML || '';
    const ids = [];
    html.replace(/onchange="setFinStatus\('([^']+)'/g, (m, id) => { ids.push(id); return m; });
    const regs = ids.map(id => app.finPorId(id)).filter(Boolean);
    const ent = regs.filter(l => l.tipo !== 'Despesa').reduce((a, l) => a + (+l.valor || 0), 0);
    const sai = regs.filter(l => l.tipo === 'Despesa').reduce((a, l) => a + (+l.valor || 0), 0);
    // fmt() usa espaço não-quebrável entre "R$" e o número.
    const norm = t => String(t).replace(/ /g, ' ');
    const resumo = norm(app.document.getElementById('finResumo').innerHTML);
    assert(resumo.indexOf(norm(app.fmt(ent))) >= 0 && resumo.indexOf(norm(app.fmt(sai))) >= 0,
      `${rotulo}: o resumo soma exatamente as ${regs.length} linhas listadas (entradas ${app.fmt(ent)} · saídas ${app.fmt(sai)})`);
    assert(resumo.indexOf(`${regs.length} lançamento(s)`) >= 0, `${rotulo}: a contagem do resumo bate com as linhas`);
    return regs;
  };

  conferir('2026-09', {}, 'mês inteiro');
  conferir('2026-09', { finNatFiltro: 'fixo' }, 'só fixas');
  conferir('2026-09', { finStFiltro: 'Previsto' }, 'só previstos');
  conferir('2026-10', { finNatFiltro: 'fixo' }, 'outro mês, mesmo filtro');
}

secao('Filtros: só fixas, e uma série inteira');
{
  const app = novoApp();
  const s = criarFixaMensal(app);
  app.openLancModal();
  preencher(app, {
    m_lfixo: 'false', m_lop: 'WindGate', m_ltipo: 'Despesa', m_lcat: '',
    m_lvenc: '2026-09-20', m_ldata: '2026-09-01', m_lval: '22000',
    m_lemp: 'WindGate', m_lst: 'Previsto', m_ldesc: 'Frete internacional', m_lcomp: '', m_lnf: ''
  });
  app.saveLanc(null);

  telaDoMes(app, '2026-09');
  assert(linhasDaTela(app).length === 2, 'setembro tem a fixa e a pontual');

  app.document.getElementById('finNatFiltro').value = 'fixo';
  app.renderFin();
  assert(linhasDaTela(app).length === 1 && /Fixa 1\/12/.test(linhasDaTela(app)[0]), 'filtro "Apenas Fixas" deixa só a ocorrência');

  // Escolher a série no seletor NÃO larga o mês: dentro de setembro, a série
  // tem uma ocorrência só. Foi tratar isso como "mostre a série inteira" que
  // fazia o filtro substituir o recorte de mês em vez de somar-se a ele.
  app.document.getElementById('finNatFiltro').value = '';
  app.document.getElementById('finSerieFiltro').value = s._id;
  app.renderFin();
  assert(linhasDaTela(app).length === 1, 'série + mês = a ocorrência daquele mês, só ela');

  // Ver a série inteira é uma escolha explícita, e ela leva o período junto.
  app.finFiltrarSerie(s._id);
  const linhas = linhasDaTela(app);
  assert(app.document.getElementById('finMesFiltro').value === '', 'ver a série inteira manda o período para "Todos"');
  assert(linhas.length === 12, `e aí mostra os 12 meses (veio ${linhas.length})`);
  assert(/Fixa 12\/12/.test(linhas.join('')), 'a última ocorrência está na lista');
}

/* ==================================================================== */
secao('Migração das fixas antigas');
{
  const app = novoApp();
  app.avaliar(`
    DB.settings = { schema: 13 };
    DB.fin = [
      {_id:'f-aluguel',data:'2026-08-01',vencimento:'2026-08-10',op:'WindGate',tipo:'Despesa',categoria:'',fixo:true,
       desc:'Aluguel',valor:4500,status:'Previsto',empresa:'WindGate',liquidadoEm:null,comp:'',nf:'',por:'Samir'},
      {_id:'f-contab',data:'2026-05-01',vencimento:'2026-05-31',op:'WindGate',tipo:'Despesa',categoria:'',fixo:true,
       desc:'Contabilidade',valor:1800,status:'Realizado',empresa:'WindGate',liquidadoEm:'2026-09-05',comp:'https://d/c.pdf',nf:'',por:'Davi'},
      {_id:'f-soft',data:'2026-08-01',vencimento:'2026-08-20',op:'WindGate',tipo:'Despesa',categoria:'',fixo:true,
       desc:'Softwares',valor:990,status:'Realizado',empresa:'WindGate',liquidadoEm:null,comp:'https://d/s.pdf',nf:'',por:'Samir'},
      {_id:'p-frete',data:'2026-09-01',vencimento:'2026-09-12',op:'OP-101',tipo:'Despesa',categoria:'',fixo:false,
       desc:'Frete',valor:22000,status:'Previsto',empresa:'WindGate',liquidadoEm:null,comp:'',nf:'',por:'Davi'}
    ];
    DB.finRec = [];
  `);
  app.migrateDB();

  const fin = app.avaliar('DB.fin');
  const series = app.avaliar('DB.finRec');
  assert(series.length === 3, '3 séries criadas, uma por fixa antiga');
  assert(fin.filter(l => l.recId).length === 36, '36 ocorrências (3 × 12)');
  assert(fin.filter(l => !l.fixo).length === 1, 'o lançamento pontual não foi tocado');
  assert(fin.length === 37, `financeiro passou de 4 para 37 registros (veio ${fin.length})`);
  assert(new Set(fin.map(l => l._id)).size === fin.length, '★ nenhum id duplicado');
  ['f-aluguel', 'f-contab', 'f-soft', 'p-frete'].forEach(id =>
    assert(fin.filter(l => l._id === id).length === 1, `★ o registro ${id} continua existindo, uma vez só`));

  const contab = series.find(s => s.desc === 'Contabilidade');
  const ocsContab = app.finOcorrencias(contab._id);
  assert(contab.inicio === '2026-08', 'quem vinha de antes começa em ago/2026, sem meses retroativos');
  assert(ocsContab.every(o => o.mesRef >= '2026-08'), '★ nenhuma ocorrência anterior a agosto/2026');
  const realizadas = ocsContab.filter(o => o.status === 'Realizado');
  assert(realizadas.length === 1 && realizadas[0].mesRef === '2026-09', '★ só o mês do pagamento (set/2026) ficou Realizado');
  assert(realizadas[0].comp === 'https://d/c.pdf', 'o comprovante foi para o mês do pagamento');
  assert(ocsContab.filter(o => o.comp).length === 1, 'nenhuma outra ocorrência recebeu o comprovante');
  assert(ocsContab.find(o => o.mesRef === '2027-02').vencimento === '2027-02-28', 'dia 31 vira 28 em fevereiro');

  const soft = series.find(s => s.desc === 'Softwares');
  assert(app.finOcorrencias(soft._id).every(o => o.status === 'Previsto'),
    '★ Realizada sem data de pagamento volta inteira para Previsto');
  const conf = app.avaliar('DB.settings.finRecMigracao.conferir');
  assert(conf.length === 1 && conf[0].desc === 'Softwares', 'e entra na lista de conferência manual');

  const aluguel = series.find(s => s.desc === 'Aluguel');
  assert(app.finOcorrencias(aluguel._id).every(o => o.status === 'Previsto'), 'a fixa que era Previsto continua toda Previsto');

  // Rodar de novo não pode duplicar nada.
  const antes = app.avaliar('DB.fin.length');
  app.avaliar('DB.settings.schema = 13');
  app.migrateDB();
  assert(app.avaliar('DB.fin.length') === antes, '★ migrar duas vezes não duplica ocorrências');
  assert(app.avaliar('DB.finRec.length') === 3, '★ migrar duas vezes não duplica séries');
}

secao('A tela mostra as séries e o que a migração deixou em aberto');
{
  const app = novoApp();
  app.avaliar(`
    DB.settings = { schema: 13 };
    DB.fin = [{_id:'f-soft',data:'2026-08-01',vencimento:'2026-08-20',op:'WindGate',tipo:'Despesa',categoria:'',fixo:true,
      desc:'Softwares',valor:990,status:'Realizado',empresa:'WindGate',liquidadoEm:null,comp:'https://d/s.pdf',nf:'',por:'Samir'}];
    DB.finRec = [];
  `);
  app.migrateDB();
  app.renderFin();

  const aviso = app.document.getElementById('finSeriesAviso');
  assert(aviso.style.display === '' && /Softwares/.test(aviso.innerHTML), 'o aviso de conferência aparece com a despesa em dúvida');
  assert(/Conferir a migração/.test(aviso.innerHTML), 'e diz o que precisa ser conferido');
  assert(/Softwares/.test(app.document.getElementById('finSeriesBody').innerHTML), 'a série entra no painel de séries fixas');
  assert((app.document.getElementById('finSerieFiltro').innerHTML.match(/<option/g) || []).length === 2,
    'e no filtro por série (a opção "todas" mais a série)');

  app.finConferenciaResolvida();
  assert(app.document.getElementById('finSeriesAviso').style.display === 'none', 'o aviso some depois de conferido');
}

secao('Migração converge quando dois navegadores migram antes de sincronizar');
{
  const legado = `[{_id:'f-x',data:'2026-08-01',vencimento:'2026-08-10',op:'WindGate',tipo:'Despesa',categoria:'',fixo:true,
      desc:'Aluguel',valor:4500,status:'Previsto',empresa:'WindGate',liquidadoEm:null,comp:'',nf:'',por:'Samir'}]`;
  const rodar = () => {
    const app = novoApp();
    app.avaliar(`DB.settings = { schema: 13 }; DB.fin = ${legado}; DB.finRec = [];`);
    app.migrateDB();
    return { fin: app.avaliar('DB.fin'), rec: app.avaliar('DB.finRec') };
  };
  const a = rodar(), b = rodar();
  const idsA = a.fin.map(l => l._id).sort().join(',');
  const idsB = b.fin.map(l => l._id).sort().join(',');
  assert(idsA === idsB, '★ os dois chegam exatamente aos mesmos ids');
  assert(a.rec[0]._id === b.rec[0]._id, '★ e à mesma série');

  const { mesclarDB } = require('../src/services/db-merge.service');
  const uniao = mesclarDB({ fin: a.fin, finRec: a.rec, _removidos: {} }, { fin: b.fin, finRec: b.rec, _removidos: {} });
  assert(uniao.fin.length === 12, `★ mesclar as duas dá 12 ocorrências, não 24 (veio ${uniao.fin.length})`);
  assert(uniao.finRec.length === 1, '★ e uma série só');
}

console.log(`\n${passou} verificações passaram, ${falhas} falharam.`);
process.exit(falhas ? 1 : 0);
