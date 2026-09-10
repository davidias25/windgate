/**
 * Varredura dos filtros da aba Financeiro contra o banco de produção.
 *
 * Uma pergunta só: com um mês selecionado, algum filtro (ou combinação) faz a
 * listagem trazer linhas de OUTRO mês? Mês e filtros são cumulativos — o mês é
 * sempre a primeira condição, e ver todos os meses é escolha explícita ("Todos").
 *
 * Confere também que os totais na tela somam exatamente as linhas listadas e
 * que os cartões "no Mês" não somam registros de outros meses.
 *
 * Roda o código de tela DE VERDADE (public/index.html num DOM de mentira), numa
 * cópia do banco. NÃO grava nada.
 *
 *   node scripts/verificar-filtros.js
 *   node scripts/verificar-filtros.js data/db.json
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { carregarApp } = require(path.join(__dirname, '../test/dom-stub'));

const CTRL = ['finBusca', 'finSerieFiltro', 'finStFiltro', 'finNatFiltro', 'finEmpresa', 'finFilter', 'finMesFiltro'];
const norm = t => String(t).replace(/ /g, ' ');
const f = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

let falhas = 0;
const ok = (c, m) => { if (!c) { falhas++; console.log(`  ❌ ${m}`); } };

async function lerBanco(){
  const arquivo = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (arquivo) { console.log(`Banco: ${arquivo}`); return JSON.parse(fs.readFileSync(arquivo, 'utf8')); }
  const dbStore = require('../src/services/db-store.service');
  if (!dbStore.remotaAtiva()) {
    console.error('WINDGATE_DB_SECRET não definido. Informe um arquivo: node scripts/verificar-filtros.js data/db.json');
    process.exit(1);
  }
  const db = await dbStore.carregar(path.join(__dirname, '../data/db.json'));
  console.log(`Banco: ${dbStore.OBJETO} (Supabase Storage)`);
  return db;
}

(async () => {
  const prod = await lerBanco();
  const app = carregarApp();
  app.avaliar(`DB = ${JSON.stringify(prod)};
    USER = { key:'samir', nome:'Samir', papel:'Sócio', cor:'#E91E63', tabs:['painel','fin'], fin:true, aprova:true };`);
  app.migrateDB();

  const MES = app.agHoje().slice(0, 7);
  const set = (id, v) => { app.document.getElementById(id).value = String(v); };
  const fin = app.avaliar('DB.fin').filter(Boolean);
  const serie = (app.avaliar('DB.finRec') || [])[0];

  /* Mesma regra de mês da tela: Realizado com data de liquidação entra pelo
     caixa, e a ocorrência fixa fica no mês dela. */
  const mesDe = l => ((l.status === 'Realizado' && l.liquidadoEm && !l.fixo) ? l.liquidadoEm : (l.vencimento || l.data || '')).slice(0, 7);

  /* Lê as linhas que a tela REALMENTE desenhou, pelo _id que cada uma carrega. */
  function listar(filtros, mes){
    CTRL.forEach(id => set(id, ''));
    set('finMesFiltro', mes === undefined ? MES : mes);
    Object.entries(filtros || {}).forEach(([k, v]) => set(k, v));
    app.renderFin();
    const html = app.document.getElementById('finBody').innerHTML || '';
    const ids = [];
    html.replace(/onchange="setFinStatus\('([^']+)'/g, (m, id) => { ids.push(id); return m; });
    return {
      regs: ids.map(id => fin.find(l => l._id === id)).filter(Boolean),
      resumo: app.document.getElementById('finResumo').innerHTML || '',
      dash: app.document.getElementById('finDashGrid').innerHTML || ''
    };
  }

  const casos = [
    ['Mês sozinho (sem filtro)',        {}],
    ['Natureza: Apenas Fixas',          { finNatFiltro: 'fixo' }],
    ['Natureza: Apenas Pontuais',       { finNatFiltro: 'pontual' }],
    ['Status: Previsto',                { finStFiltro: 'Previsto' }],
    ['Status: Realizado',               { finStFiltro: 'Realizado' }],
    ['Empresa: WindGate',               { finEmpresa: 'WindGate' }],
    ['Empresa: JeT',                    { finEmpresa: 'JeT' }],
    ['Série (uma despesa fixa)',        serie ? { finSerieFiltro: serie._id } : {}],
    ['Busca por texto',                 { finBusca: 'sala' }],
    ['Fixas + Previsto',                { finNatFiltro: 'fixo', finStFiltro: 'Previsto' }],
    ['Fixas + Realizado',               { finNatFiltro: 'fixo', finStFiltro: 'Realizado' }],
    ['Fixas + WindGate',                { finNatFiltro: 'fixo', finEmpresa: 'WindGate' }],
    ['Fixas + Previsto + WindGate',     { finNatFiltro: 'fixo', finStFiltro: 'Previsto', finEmpresa: 'WindGate' }],
    ['Busca + Fixas',                   { finBusca: 'sala', finNatFiltro: 'fixo' }],
    ['Busca + Previsto',                { finBusca: 'sala', finStFiltro: 'Previsto' }],
    ['Série + Realizado',               serie ? { finSerieFiltro: serie._id, finStFiltro: 'Realizado' } : {}]
  ];
  const ops = [...new Set(fin.map(l => l.op).filter(o => o && o !== 'WindGate'))];
  if (ops[0]) {
    casos.push([`Operação: ${ops[0]}`, { finFilter: ops[0] }]);
    casos.push([`Operação: ${ops[0]} + Previsto`, { finFilter: ops[0], finStFiltro: 'Previsto' }]);
  }

  console.log(`\n═══ FILTRO × MÊS (${MES}) — alguma linha é de outro mês? ═══\n`);
  console.log('  FILTRO                                  | linhas | fora do mês | veredicto');
  console.log('  ----------------------------------------+--------+-------------+------------------------');
  casos.forEach(([nome, filtros]) => {
    const { regs, resumo } = listar(filtros);
    const fora = regs.filter(l => mesDe(l) !== MES);
    ok(fora.length === 0, `${nome} vaza ${fora.length} linha(s) de outros meses`);
    // O resumo tem de somar exatamente o que está listado.
    const ent = regs.filter(l => l.tipo !== 'Despesa').reduce((a, l) => a + (+l.valor || 0), 0);
    const sai = regs.filter(l => l.tipo === 'Despesa').reduce((a, l) => a + (+l.valor || 0), 0);
    const bate = !regs.length || (norm(resumo).indexOf(norm(f(ent))) >= 0 && norm(resumo).indexOf(norm(f(sai))) >= 0);
    ok(bate, `${nome}: o total na tela não bate com as linhas listadas`);
    console.log(`  ${nome.padEnd(39)} | ${String(regs.length).padStart(6)} | ${String(fora.length).padStart(11)} | `
      + (fora.length ? `❌ VAZA — ${[...new Set(fora.map(mesDe))].sort().join(' ')}` : '✅ só o mês')
      + (bate ? ' · total ✅' : ' · total ❌'));
  });

  console.log(`\n═══ CARTÕES "no Mês" — somam registros de outros meses? ═══\n`);
  const opsCot = new Set((app.avaliar('DB.ops') || []).filter(o => o && o.status === 'cotacao').map(o => o.id));
  const cartoes = [
    ['Contas a Pagar no Mês',   l => l.tipo === 'Despesa' && l.status !== 'Realizado'],
    ['Contas Pagas no Mês',     l => l.tipo === 'Despesa' && l.status === 'Realizado'],
    ['Contas a Receber no Mês', l => l.tipo !== 'Despesa' && l.status !== 'Realizado'],
    ['Contas Recebidas no Mês', l => l.tipo !== 'Despesa' && l.status === 'Realizado']
  ];
  console.log('  mês     | cartão                    |         na tela |     soma no banco | bate');
  console.log('  --------+---------------------------+-----------------+-------------------+-----');
  [app.finMesSoma(MES, -1), MES, app.finMesSoma(MES, 1), app.finMesSoma(MES, 6)].forEach(mes => {
    const { dash } = listar({}, mes);
    cartoes.forEach(([rotulo, cond]) => {
      const m = new RegExp(rotulo + '<\\/div>\\s*<div class="c-val"[^>]*>([^<]+)').exec(dash);
      const naTela = m ? m[1].trim() : '(não encontrado)';
      const esperado = fin.filter(l => !(l.op && opsCot.has(l.op)) && cond(l) && mesDe(l) === mes)
        .reduce((a, l) => a + (+l.valor || 0), 0);
      const bate = norm(naTela) === norm(f(esperado));
      ok(bate, `cartão "${rotulo}" de ${mes} não bate`);
      console.log(`  ${mes} | ${rotulo.padEnd(25)} | ${naTela.padStart(15)} | ${f(esperado).padStart(17)} | ${bate ? '✅' : '❌'}`);
    });
  });

  console.log(`\n═══ TROCAR DE MÊS E LIMPAR FILTRO ═══\n`);
  const a = listar({ finNatFiltro: 'fixo' }, MES);
  const b = listar({ finNatFiltro: 'fixo' }, app.finMesSoma(MES, 1));
  ok(a.regs.every(l => mesDe(l) === MES) && b.regs.every(l => mesDe(l) === app.finMesSoma(MES, 1)),
    'trocar de mês com filtro ativo não reaplica o filtro no mês novo');
  console.log(`  filtro "Apenas Fixas" em ${MES}: ${a.regs.length} linha(s) · em ${app.finMesSoma(MES, 1)}: ${b.regs.length} linha(s) ✅`);

  const limpo = listar({}, MES);
  ok(limpo.regs.every(l => mesDe(l) === MES), 'limpar o filtro traz outros meses');
  console.log(`  limpar o filtro devolve o mês inteiro: ${limpo.regs.length} linha(s), todas de ${MES} ✅`);

  CTRL.forEach(id => set(id, ''));
  set('finMesFiltro', MES);
  app.renderFin();
  app.setFinPeriod('todos');
  const todas = (app.document.getElementById('finBody').innerHTML || '').split('<tr>').length - 1;
  const semMes = app.document.getElementById('finMesFiltro').value === '';
  ok(semMes && todas > limpo.regs.length, 'o botão "Todos" não abre todos os meses');
  console.log(`  botão "Todos": seletor de mês vazio ${semMes ? '✅' : '❌'} · ${todas} linhas (contra ${limpo.regs.length} do mês) ✅`);

  console.log(`\n${falhas === 0 ? '✅ NENHUM VAZAMENTO — mês e filtros são cumulativos' : '❌ ' + falhas + ' problema(s)'}`);
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
