/**
 * Operação concluída é atributo, não desaparecimento.
 *
 * Concluir significa que o ciclo operacional terminou — não que a operação
 * deixou de existir. O histórico, os documentos e os lançamentos continuam
 * sendo dela, e quem precisa conferir meses depois precisa achar.
 *
 * Este arquivo roda o código de tela DE VERDADE (public/index.html num DOM de
 * mentira) e audita o que o prompt do Samir pede como critério de aceite.
 *
 *   node test/concluidas.test.js
 */
const fs = require('fs');
const path = require('path');
const { carregarApp } = require('./dom-stub');

let falhas = 0, passou = 0;
const f = v => (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function assert(cond, msg){
  if (cond) { console.log(`  ✅ ${msg}`); passou++; }
  else { console.error(`  ❌ ${msg}`); falhas++; }
}
function secao(t){ console.log(`\n--- ${t} ---`); }

/* Cenário: uma operação de cada tipo, com dinheiro realizado e previsto. */
function novoApp(){
  const app = carregarApp();
  app.avaliar(`
    DB = defaultDB();
    DB.fin = []; DB.finRec = []; DB.opStatusHist = []; DB.settings = { schema: 15 };
    DB.ops = [
      { id:'OP20', nome:'Em produção',  cliente:'Alfa',  status:'producao',  resp:'Davi' },
      { id:'OP21', nome:'Asa Sul aço',  cliente:'Asa Sul', status:'concluida', resp:'Davi' },
      { id:'OP03', nome:'Cabrinha',     cliente:'Cabrinha', status:'entregue', resp:'Samir' },
      { id:'OP45', nome:'Só cotação',   cliente:'Beta',  status:'cotacao',   resp:'Davi' }
    ];
    USER = { key:'samir', nome:'Samir Teste', papel:'Sócio', cor:'#E91E63',
             tabs:['painel','fin'], fin:true, aprova:true };
    DB.users.samir = Object.assign({}, DB.users.samir, { nome:'Samir Teste', fin:true });
  `);
  const lancar = (op, tipo, val, st, desc) => {
    app.openLancModal();
    ['m_lfixo','m_lop','m_ltipo','m_lcat','m_lvenc','m_ldata','m_lval','m_lemp','m_lst','m_ldesc','m_lcomp','m_lnf']
      .forEach(id => { app.document.getElementById(id).value = ''; });
    Object.entries({
      m_lfixo:'false', m_lop:op, m_ltipo:tipo, m_lcat:'', m_lvenc:'2026-09-15',
      m_ldata:'2026-09-15', m_lval:val, m_lemp:'WindGate', m_lst:st,
      m_ldesc:desc, m_lcomp:'', m_lnf:''
    }).forEach(([k,v]) => { app.document.getElementById(k).value = String(v); });
    if (st === 'Realizado') app.document.getElementById('m_lliq').value = '2026-09-15';
    app.saveLanc(null);
  };
  // OP21 concluída: recebeu e pagou, e ainda tem uma parcela em aberto.
  lancar('OP21', 'Receita', '200000', 'Realizado', 'Recebimento parcelas 1 e 2');
  lancar('OP21', 'Despesa', '150000', 'Realizado', 'Pagamentos à fábrica');
  lancar('OP21', 'Receita', '30000',  'Previsto',  '3ª parcela do cliente');
  lancar('OP21', 'Despesa', '5000',   'Previsto',  'Acerto de imposto');
  // OP03 entregue, sem saldo.
  lancar('OP03', 'Receita', '8182.33', 'Realizado', 'Receita da entregue');
  // OP20 ativa.
  lancar('OP20', 'Receita', '100000', 'Previsto', 'Receita OP20');
  return app;
}

const cards = app => (app.document.getElementById('opsGrid').innerHTML || '');
const linhasFin = app => (app.document.getElementById('finBody').innerHTML || '').split('<tr>').slice(1);

function telaFin(app, mes){
  ['finBusca','finSerieFiltro','finStFiltro','finNatFiltro','finEmpresa','finFilter']
    .forEach(id => { app.document.getElementById(id).value = ''; });
  app.document.getElementById('finMesFiltro').value = mes === undefined ? '2026-09' : mes;
  app.renderFin();
  return {
    linhas: linhasFin(app),
    opsBody: app.document.getElementById('finOpsBody').innerHTML || '',
    dash: app.document.getElementById('finDashGrid').innerHTML || '',
    aviso: app.document.getElementById('finSaldoAviso').innerHTML || ''
  };
}

/* ==================================================================== */
secao('CRITÉRIO 1 — auditoria: nenhuma listagem exclui "concluida"');
{
  /* Auditoria estática: varre o index.html procurando filtro por status
     terminal em código de LISTAGEM. Exclusões legítimas (KPI de ativas, mapa,
     prazo por etapa, agrupamento por navio) são nomeadas uma a uma — se uma
     nova aparecer, o teste falha e obriga a decidir de que lado ela está. */
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const LEGITIMAS = [
    // Contadores e KPIs: somar concluída faria "em produção" crescer com
    // operação que acabou. O prompt pede exatamente isso.
    "const ativos=(DB.ops||[]).filter(o=>o && !['entregue','concluida'].includes(o.status)).length",
    "const opsAtivas=DB.ops.filter(o=>!['entregue','concluida'].includes(o.status))",
    // Ordenação: encerrada acumula dias para sempre e enterraria o que espera.
    "const encerrada=o=>['entregue','concluida'].includes(o.status)",
    // Prazo por etapa: estado terminal não tem SLA para configurar.
    "STATUS_OP.filter(x=>x.k!=='entregue'&&x.k!=='concluida'&&x.k!=='travada')",
    // Mapa e agrupamento por navio: o prompt dispensa plotar concluídas.
    "const ativos=DB.ops.filter(o=>!['entregue','concluida'].includes(o.status))",
    "DB.ops.filter(x=>x.id!==o.id && !['entregue','concluida'].includes(x.status)",
    // As definições do próprio conceito e o padrão do filtro.
    "const OP_TERMINAIS = ['entregue', 'concluida']",
    "const opEncerrada = o => !!o && OP_TERMINAIS.includes(o.status)",
    "STATUS_OP.filter(s => !OP_TERMINAIS.includes(s.k)).map(s => s.k)",
    // Reabertura: acha a etapa anterior à conclusão e não oferece "concluída"
    // como destino de reabertura.
    "const h = opHist(id).filter(x => x && x.para === 'concluida')",
    "const opts = STATUS_OP.filter(s => s.k !== 'concluida')",
    // Inclusões, não exclusões: a visão "concluídas com saldo" e o ✓ da linha
    // no Resultado por operação.
    "if (!o || o.status !== 'concluida') return false",
    "['entregue','concluida'].includes(oper.status)",
    // Mapa de rótulos para o balão do mapa — texto, não seleção.
    "modo:{chegada:"
  ];
  const linhas = html.split('\n');
  const suspeitas = [];
  linhas.forEach((ln, i) => {
    if (!/concluida|OP_TERMINAIS/.test(ln)) return;
    if (/^\s*(\/\/|\/\*|\*)/.test(ln)) return;                 // comentário
    if (!/filter|includes|!==|\bif\s*\(/.test(ln)) return;     // não é seleção
    if (LEGITIMAS.some(p => ln.indexOf(p) >= 0)) return;
    // Marcações visuais e contadores não excluem nada.
    if (/pill|counts\[|opSaldoAberto|stMeta|status === 'concluida'|status==='concluida'/.test(ln)) return;
    suspeitas.push(`${i + 1}: ${ln.trim().slice(0, 110)}`);
  });
  suspeitas.forEach(s => console.log(`     ⚠ ${s}`));
  assert(suspeitas.length === 0,
    `★ nenhuma exclusão de "concluida" fora das ${LEGITIMAS.length} legítimas (suspeitas: ${suspeitas.length})`);

  // E o que importa de fato: não existe campo de arquivamento em lugar nenhum.
  ['arquivado', 'deleted_at', 'desativado'].forEach(campo =>
    assert(html.indexOf(campo) < 0, `não existe campo "${campo}" — status e visibilidade nunca se misturaram`));
}

secao('Painel — concluída aparece, com badge próprio');
{
  const app = novoApp();
  app.opFiltroPreset('todas');
  const h = cards(app);
  assert(/OP20/.test(h) && /OP21/.test(h) && /OP03/.test(h), '★ com o filtro em "todas", concluída e entregue estão na grade');
  assert(/OP21[\s\S]{0,400}Conclu/.test(h), 'a operação concluída traz o rótulo "Concluída"');
  assert(app.stMeta('concluida').c === '#8FA0BC', '★ badge em tom neutro (#8FA0BC), não no verde de "entregue"');
  assert(app.stMeta('entregue').c === '#34C77C', 'e "entregue" continua verde — são estados diferentes');
  assert(/saldo em aberto/.test(h), '★ o cartão da concluída avisa que tem saldo em aberto');
}

secao('Painel — filtro multisseleção com contador e persistência');
{
  const app = novoApp();
  // Padrão: ativas marcadas, terminais fora.
  const padrao = app.opFiltroStatus();
  assert(padrao.includes('producao') && padrao.includes('cotacao'), 'padrão marca as ativas');
  assert(!padrao.includes('concluida') && !padrao.includes('entregue'), '★ padrão deixa concluída e entregue desmarcadas');

  app.renderOps();
  assert(!/OP21/.test(cards(app)), 'com o padrão, a concluída não polui a grade');
  const painel = app.document.getElementById('opFiltroLista').innerHTML;
  assert(/Conclu[^<]*<\/span>\s*<span class="note"[^>]*>\(1\)/.test(painel),
    '★ mas o filtro mostra "Concluída (1)" — dá para ver que ela existe');
  const btn = app.document.getElementById('opFiltroBtn').textContent;
  assert(/2 fora/.test(btn), `o botão conta quantas estão fora da tela: "${btn}"`);

  // Marcar concluída traz de volta, e a escolha fica gravada no usuário.
  app.opFiltroMarcar('concluida', true);
  assert(/OP21/.test(cards(app)), '★ um clique traz a concluída para a tela');
  assert(app.avaliar('DB.users.samir.opStatus').includes('concluida'),
    '★ a escolha é gravada no usuário — atravessa a sessão, segue a pessoa e não a máquina');

  // Simula outra sessão: o mesmo DB, app recarregado.
  const db = app.avaliar('JSON.stringify(DB)');
  const app2 = carregarApp();
  app2.avaliar(`DB = ${db}; USER = { key:'samir', nome:'Samir Teste', tabs:['painel','fin'], fin:true };`);
  app2.renderOps();
  assert(app2.opFiltroStatus().includes('concluida'), '★ ao reabrir o sistema, a escolha continua valendo');
  assert(/OP21/.test(cards(app2)), 'e a concluída continua na tela');
}

secao('CRITÉRIO 2 — buscar "OP21" acha, com o filtro em qualquer estado');
{
  const app = novoApp();
  // Filtro no padrão: concluída DESMARCADA.
  app.renderOps();
  assert(!/OP21/.test(cards(app)), 'ponto de partida: a concluída está fora da grade');

  app.document.getElementById('opBusca').value = 'OP21';
  app.renderOps();
  assert(/OP21/.test(cards(app)), '★ buscar "OP21" acha mesmo com o status desmarcado');
  assert(!/OP20/.test(cards(app)), 'e traz só o que casa com a busca');
  const nota = app.document.getElementById('opBarNota').innerHTML;
  assert(/ignora o filtro/.test(nota), `a barra explica que a busca ignora o filtro: "${nota.replace(/<[^>]+>/g,'')}"`);

  // Por cliente e por produto também.
  ['Asa Sul', 'asa sul aço'].forEach(termo => {
    app.document.getElementById('opBusca').value = termo;
    app.renderOps();
    assert(/OP21/.test(cards(app)), `★ busca por "${termo}" acha a concluída`);
  });
}

secao('CRITÉRIO 4/2 — Financeiro: lançamentos da concluída somam normalmente');
{
  const app = novoApp();
  const t = telaFin(app);
  const html = t.linhas.join('');
  assert(/3ª parcela do cliente/.test(html), '★ lançamento Previsto da concluída está na listagem');
  assert(/Recebimento parcelas/.test(html), '★ e o Realizado dela também');
  assert(/>OP21</.test(html), 'com o vínculo à operação preservado');
  assert(t.linhas.length === 6, `os 6 lançamentos aparecem (veio ${t.linhas.length})`);

  // Somam no caixa: 200.000 recebidos e 150.000 pagos da OP21 estão nos cartões.
  const cart = (rot) => { const m = new RegExp(rot + '<\\/div>\\s*<div class="c-val"[^>]*>([^<]+)').exec(t.dash); return m ? m[1].trim() : '?'; };
  const norm = s => String(s).replace(/ /g, ' ');
  assert(/208\.182,33/.test(norm(cart('Contas Recebidas no Mês'))),
    `★ recebido do mês soma a concluída e a entregue: ${cart('Contas Recebidas no Mês')}`);
  assert(/150\.000,00/.test(norm(cart('Contas Pagas no Mês'))),
    `★ pago do mês soma a concluída: ${cart('Contas Pagas no Mês')}`);

  // E no resultado por operação, com a marca do estado.
  assert(/>OP21</.test(t.opsBody), '★ OP21 está no Resultado por operação');
  assert(/OP21<\/b><div[^>]*>✓ Concluída/.test(t.opsBody), 'marcada como concluída na própria linha');

  // Gestão do Mês (relatório por período) também conta.
  const g = app.gmMetrics('2026-09');
  assert(g.rec === 208182.33, `★ o relatório do mês soma a receita realizada da concluída (${f(g.rec)})`);
  assert(g.desp === 150000, `★ e a despesa realizada (${f(g.desp)})`);
}

secao('CRITÉRIO 5 — concluída com Previsto em aberto dispara o alerta');
{
  const app = novoApp();
  const pend = app.opsConcluidasComSaldo();
  assert(pend.length === 1 && pend[0].op.id === 'OP21', 'a OP21 é detectada como concluída com saldo');
  assert(pend[0].receber === 30000 && pend[0].pagar === 5000,
    `★ R$ ${f(pend[0].receber)} a receber e R$ ${f(pend[0].pagar)} a pagar`);

  // No Painel.
  app.renderOps();
  const av = app.document.getElementById('opSaldoAviso');
  assert(av.style.display === 'block' && /saldo em aberto/.test(av.innerHTML), '★ o aviso aparece no Painel');
  assert(/30\.000,00/.test(av.innerHTML.replace(/ /g, ' ')), 'com o valor a receber');

  // No Financeiro.
  const t = telaFin(app);
  assert(/Operação concluída com saldo em aberto/.test(t.aviso), '★ e também no Financeiro');
  assert(/30\.000,00/.test(t.aviso.replace(/ /g, ' ')) && /5\.000,00/.test(t.aviso.replace(/ /g, ' ')),
    'com os dois lados: a receber e a pagar');

  // Na própria operação.
  const bloco = app.opBlocoEncerrada(app.avaliar("DB.ops.find(o=>o.id==='OP21')"));
  assert(/saldo em aberto/.test(bloco), '★ e dentro da operação');
  assert(/não bloqueia|Não bloqueia/.test(bloco), 'dizendo que não bloqueia — é sinal, não trava');

  // Entregue sem saldo não dispara nada.
  assert(!app.opSaldoAberto('OP03').tem, 'operação sem Previsto em aberto não dispara alerta');
}

secao('Visão rápida "Concluídas com saldo em aberto"');
{
  const app = novoApp();
  app.finVerConcluidasComSaldo();
  const linhas = linhasFin(app);
  const ids = [];
  linhas.join('').replace(/onchange="setFinStatus\('([^']+)'/g, (m, id) => { ids.push(id); return m; });
  const regs = ids.map(id => app.finPorId(id));
  assert(regs.length === 2, `★ mostra só os 2 Previstos da concluída (veio ${regs.length})`);
  assert(regs.every(l => l.op === 'OP21' && l.status === 'Previsto'), 'todos da OP21 e todos em aberto');
  assert(app.document.getElementById('finMesFiltro').value === '',
    'e em todos os meses — saldo em aberto não é de um mês só');

  app.finLimparConcluidasComSaldo();
  assert(linhasFin(app).length > 2, 'sair da visão devolve a lista normal');
}

secao('CRITÉRIO 6 — reabrir devolve ao fluxo sem perder histórico');
{
  const app = novoApp();
  const histAntes = app.avaliar('DB.opStatusHist.length');

  app.opReabrirModal('OP21');
  app.document.getElementById('m_reabst').value = 'logistica';
  app.document.getElementById('m_reabmot').value = 'faltou receber a 3ª parcela';
  app.opReabrirConfirma('OP21');

  const o = app.avaliar("DB.ops.find(x=>x.id==='OP21')");
  assert(o.status === 'logistica', '★ a operação volta à etapa escolhida');
  const hist = app.avaliar("DB.opStatusHist.filter(h=>h.op==='OP21')");
  assert(hist.length > histAntes, '★ o histórico cresceu — nada foi sobrescrito');
  const reab = hist.find(h => h.tipo === 'reabertura');
  assert(!!reab, 'com uma linha marcada como reabertura');
  assert(reab.motivo === 'faltou receber a 3ª parcela', 'guardando o porquê');
  assert(reab.por === 'Samir' && !!reab.em, 'e quem reabriu e quando');

  // Os lançamentos continuam intactos.
  assert(app.avaliar("DB.fin.filter(l=>l.op==='OP21')").length === 4, '★ os 4 lançamentos da operação continuam lá');
  assert(!app.opsConcluidasComSaldo().length, 'e ela sai da lista de concluídas com saldo');

  // Sem motivo, não reabre.
  const app2 = novoApp();
  app2.opReabrirModal('OP21');
  app2.document.getElementById('m_reabmot').value = '   ';
  app2.opReabrirConfirma('OP21');
  assert(app2.avaliar("DB.ops.find(x=>x.id==='OP21').status") === 'concluida',
    '★ reabrir sem dizer o motivo não passa');
}

secao('CRITÉRIO 5 (permissões) — quem não vê financeiro vê a operação');
{
  const app = novoApp();
  app.avaliar(`USER = { key:'matheus', nome:'Matheus Teste', tabs:['painel'], fin:false };`);
  app.opFiltroPreset('todas');
  assert(/OP21/.test(cards(app)), '★ Matheus vê a operação concluída no Painel');

  const bloco = app.opBlocoEncerrada(app.avaliar("DB.ops.find(o=>o.id==='OP21')"));
  assert(!/Receita realizada/.test(bloco) && !/Resultado realizado/.test(bloco),
    '★ mas sem o bloco financeiro — a restrição é do dinheiro, não da operação');
  assert(/acerto financeiro em aberto/.test(bloco),
    'só o aviso de que há acerto pendente, para ele avisar quem cuida');
  assert(!app.podeReabrir(), '★ e não pode reabrir');
}

secao('Lançar em operação concluída pede confirmação e fica no histórico');
{
  const app = novoApp();
  const antes = app.avaliar("DB.opStatusHist.filter(h=>h.tipo==='lancamento-pos-conclusao').length");
  app.openLancModal();
  Object.entries({
    m_lfixo:'false', m_lop:'OP21', m_ltipo:'Despesa', m_lcat:'', m_lvenc:'2026-10-05',
    m_ldata:'2026-10-05', m_lval:'1200', m_lemp:'WindGate', m_lst:'Previsto',
    m_ldesc:'Acerto de armazenagem', m_lcomp:'', m_lnf:''
  }).forEach(([k,v]) => { app.document.getElementById(k).value = String(v); });
  app.saveLanc(null);   // o confirm() do stub responde sim

  assert(app.avaliar("DB.fin.some(l=>l.desc==='Acerto de armazenagem')"), '★ o lançamento é permitido');
  const log = app.avaliar("DB.opStatusHist.filter(h=>h.tipo==='lancamento-pos-conclusao')");
  assert(log.length === antes + 1, '★ e fica registrado no histórico da operação');
  assert(/Acerto de armazenagem/.test(log[log.length-1].motivo), 'com o que foi lançado');

  // Operação ativa não pede nada.
  const n = app.avaliar("DB.opStatusHist.filter(h=>h.tipo==='lancamento-pos-conclusao').length");
  app.openLancModal();
  Object.entries({
    m_lfixo:'false', m_lop:'OP20', m_ltipo:'Despesa', m_lcat:'', m_lvenc:'2026-10-05',
    m_ldata:'2026-10-05', m_lval:'800', m_lemp:'WindGate', m_lst:'Previsto',
    m_ldesc:'Frete normal', m_lcomp:'', m_lnf:''
  }).forEach(([k,v]) => { app.document.getElementById(k).value = String(v); });
  app.saveLanc(null);
  assert(app.avaliar("DB.opStatusHist.filter(h=>h.tipo==='lancamento-pos-conclusao').length") === n,
    'lançar em operação ativa não gera log de pós-conclusão');
}

secao('CRITÉRIO 3 — o backfill não tem o que restaurar');
{
  /* O prompt esperava que o total de realizado mudasse depois do backfill. Não
     muda, e o teste guarda o motivo: os lançamentos nunca estiveram fora das
     somas. Concluir uma operação e recarregar não move o caixa um centavo —
     que é exatamente o critério 4. */
  const app = novoApp();
  const antes = app.gmMetrics('2026-09');
  const caixaAntes = { rec: antes.rec, desp: antes.desp };

  // Conclui a OP20 agora e recalcula.
  app.avaliar("opRegistrarStatus(DB.ops.find(o=>o.id==='OP20'), 'concluida', {});");
  const depois = app.gmMetrics('2026-09');
  assert(depois.rec === caixaAntes.rec && depois.desp === caixaAntes.desp,
    `★ CRITÉRIO 4 — concluir uma operação não move o caixa (${f(depois.rec)} / ${f(depois.desp)})`);

  const t = telaFin(app);
  assert(t.linhas.length === 6, '★ e nenhum lançamento sai da listagem');
  assert(/Receita OP20/.test(t.linhas.join('')), 'o lançamento da operação recém-concluída continua lá');
}

console.log(`\n${passou} verificações passaram, ${falhas} falharam.`);
process.exit(falhas ? 1 : 0);
