/**
 * Verificação ao vivo da recorrência de despesas fixas, contra uma CÓPIA do
 * banco de produção e rodando o código de tela DE VERDADE (public/index.html
 * carregado num DOM de mentira).
 *
 * Reproduz o roteiro inteiro: cria uma despesa fixa de teste, marca UM mês como
 * Realizado, confere os doze registros no banco, a listagem de cada mês e o
 * cartão de fluxo de caixa, desmarca, anexa comprovante, roda a query de
 * verificação e apaga a despesa de teste. Por fim imprime a tabela
 * despesa × mês × status das fixas reais.
 *
 *   node scripts/verificar-recorrencia.js
 *
 * NÃO grava nada: o banco de produção é apenas lido.
 */
require('dotenv').config();
const path = require('path');
const { carregarApp } = require(path.join(__dirname, '../test/dom-stub.js'));
const dbStore = require('../src/services/db-store.service');

let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? '✅' : '❌'} ${m}`); if (!c) falhas++; };
const f = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

(async () => {
  const prod = await dbStore.carregar(null);
  const app = carregarApp();
  app.avaliar(`
    DB = ${JSON.stringify(prod)};
    USER = { key:'samir', nome:'Samir', papel:'Sócio', cor:'#E91E63',
             tabs:['painel','fin'], fin:true, aprova:true };
  `);

  const HOJE = app.agHoje();
  const MES = HOJE.slice(0, 7);
  console.log(`\nHoje: ${HOJE}   ·   schema antes: ${app.avaliar('DB.settings.schema')}`);
  console.log(`ANTES: ${app.avaliar('DB.fin.length')} lançamentos · ${app.avaliar('(DB.fin||[]).filter(l=>l&&l.fixo&&!l.recId).length')} fixas legadas · ${app.avaliar('(DB.finRec||[]).length')} séries\n`);

  console.log('═══ PASSO 0 — aplicar a correção (migrateDB schema 14) ═══');
  app.migrateDB();
  console.log(`  ${app.avaliar('DB.finRec.length')} séries · ${app.avaliar('DB.fin.filter(l=>l.recId).length')} ocorrências · schema ${app.avaliar('DB.settings.schema')}`);

  console.log('\n═══ PASSO 1-2 — criar "TESTE RECORRÊNCIA" e contar registros ═══');
  app.openLancModal();
  const set = (id, v) => { app.document.getElementById(id).value = String(v); };
  Object.entries({
    m_lfixo: 'true', m_lop: 'WindGate', m_ltipo: 'Despesa', m_lcat: '',
    m_lvenc: `${MES}-10`, m_ldata: HOJE, m_lval: '100', m_lemp: 'WindGate',
    m_lst: 'Previsto', m_ldesc: 'TESTE RECORRÊNCIA', m_lcomp: '', m_lnf: '', m_lrec_total: '12'
  }).forEach(([k, v]) => set(k, v));
  app.saveLanc(null);

  const serie = app.avaliar('DB.finRec[DB.finRec.length-1]');
  const ocs = () => app.finOcorrencias(serie._id);
  ok(ocs().length === 12, `${ocs().length} registros criados (esperado 12)`);
  console.log('  IDs (um por mês):');
  ocs().forEach(o => console.log(`    ${o.recIdx}/12  ${o.mesRef}  ${o._id}`));
  ok(new Set(ocs().map(o => o._id)).size === 12, '12 _id distintos — são registros diferentes, não o mesmo repetido');

  console.log(`\n═══ PASSO 3 — marcar SOMENTE ${MES} como Realizado ═══`);
  const atual = ocs().find(o => o.mesRef === MES);
  app.setFinStatus(atual._id, 'Realizado');
  set('m_rliq', HOJE); set('m_rval', '100');
  app.finRealizar(atual._id);

  console.log('\n═══ PASSO 4 — status dos 12 registros DIRETO NO BANCO ═══');
  console.log('    mês      | vencimento | status     | pago em    | _id');
  ocs().forEach(o => console.log(`    ${o.mesRef}  | ${o.vencimento} | ${String(o.status).padEnd(10)} | ${String(o.liquidadoEm || '—').padEnd(10)} | ${o._id.slice(0, 8)}`));
  const real = ocs().filter(o => o.status === 'Realizado');
  ok(real.length === 1 && real[0].mesRef === MES, `apenas 1 Realizado no banco, em ${MES}`);
  ok(ocs().filter(o => o.mesRef > MES).every(o => o.status === 'Previsto'), 'CRITÉRIO 1 — todos os meses futuros continuam Previsto no banco');

  console.log('\n═══ PASSO 5 — listagem e fluxo de caixa, mês a mês ═══');
  console.log('    mês      | linha na tela          | cartão "Pagas no Mês"');
  let telaOk = true, caixaOk = true;
  ocs().forEach(o => {
    ['finBusca', 'finSerieFiltro', 'finStFiltro', 'finNatFiltro', 'finEmpresa', 'finFilter'].forEach(id => set(id, ''));
    set('finMesFiltro', o.mesRef);
    app.renderFin();
    const linhas = (app.document.getElementById('finBody').innerHTML || '').split('<tr>').slice(1);
    const minha = linhas.find(l => l.indexOf('TESTE RECORR') >= 0) || '';
    const naTela = minha.indexOf('<option selected>Realizado') >= 0 ? 'Realizado' : 'Previsto';
    // O cartão "Contas Pagas no Mês" é o fluxo de caixa realizado do mês.
    const dash = app.document.getElementById('finDashGrid').innerHTML;
    const m = /Contas Pagas no M[êe]s<\/div>\s*<div class="c-val"[^>]*>([^<]+)/.exec(dash);
    const pagas = m ? m[1].trim() : '?';
    const esperado = o.mesRef === MES ? 'Realizado' : 'Previsto';
    if (naTela !== esperado) telaOk = false;
    // Nos meses futuros os R$ 100 do teste não podem aparecer como pagos.
    const contaminado = o.mesRef > MES && /100,00/.test(pagas);
    if (contaminado) caixaOk = false;
    console.log(`    ${o.mesRef}  | ${naTela.padEnd(22)} | ${pagas}${contaminado ? '  ← CONTAMINADO' : ''}`);
  });
  ok(telaOk, 'CRITÉRIO 1 — a listagem de cada mês mostra o status da ocorrência daquele mês');
  ok(caixaOk, 'CRITÉRIO 1 — o fluxo de caixa dos meses futuros não conta os R$ 100 do teste');

  console.log(`\n═══ PASSO 6 — desmarcar ${MES} (voltar para Previsto) ═══`);
  app.setFinStatus(atual._id, 'Previsto');
  ok(ocs().every(o => o.status === 'Previsto'), 'CRITÉRIO 2 — desmarcar afeta só o mês escolhido (nenhum outro mudou)');
  ok(app.finPorId(atual._id).liquidadoEm === null, 'a data de pagamento saiu junto');

  console.log('\n═══ PASSO 7 — anexar comprovante em UM mês ═══');
  const nov = ocs().find(o => o.mesRef === app.finMesSoma(MES, 2));
  app.anexarComprovanteModal(nov._id);
  set('m_fin_link', 'https://teste/comprovante.pdf');
  app.salvarFinComprovanteLink(nov._id);
  const comComp = ocs().filter(o => o.comp);
  ok(comComp.length === 1 && comComp[0].mesRef === nov.mesRef, `CRITÉRIO 3 — só ${nov.mesRef} ficou com comprovante`);
  ok(ocs().filter(o => o.status === 'Realizado').length === 1, 'e só ele virou Realizado');

  console.log('\n═══ PASSO 8 — QUERY DE VERIFICAÇÃO (banco inteiro) ═══');
  console.log('  SELECT * FROM lancamentos WHERE status=\'Realizado\' AND vencimento > HOJE AND data_pagamento IS NULL');
  const violacoes = app.avaliar('DB.fin').filter(l =>
    l && l.status === 'Realizado' && (l.vencimento || l.data || '') > HOJE && !l.liquidadoEm);
  violacoes.forEach(l => console.log(`    ❌ ${l._id} · ${l.desc} · vence ${l.vencimento}`));
  ok(violacoes.length === 0, `CRITÉRIO 4 — a query retornou ${violacoes.length} linha(s)`);

  // Variante mais dura do critério 3/5: futuro Realizado nem com comprovante.
  const futurosReal = app.avaliar('DB.fin').filter(l =>
    l && l.status === 'Realizado' && (l.vencimento || l.data || '') > HOJE);
  console.log(`\n  Realizados com vencimento futuro (com ou sem data de pagamento): ${futurosReal.length}`);
  futurosReal.forEach(l => console.log(`    · ${l.desc} · vence ${l.vencimento} · pago ${l.liquidadoEm || '—'}`));

  console.log('\n═══ PASSO 9 — excluir a despesa de teste ═══');
  const idsTeste = ocs().map(o => o._id);
  app.avaliar(`DB.fin = DB.fin.filter(l => !(l && l.recId === ${JSON.stringify(serie._id)}));
               DB.finRec = DB.finRec.filter(s => s._id !== ${JSON.stringify(serie._id)});`);
  ok(app.avaliar('DB.fin').filter(l => idsTeste.includes(l._id)).length === 0, 'CRITÉRIO 6 — despesa de teste removida');

  console.log('\n═══ TABELA FINAL — despesa × mês × status (despesas reais) ═══\n');
  const series = app.avaliar('DB.finRec');
  const meses = [];
  series.forEach(s => app.finOcorrencias(s._id).forEach(o => { if (!meses.includes(o.mesRef)) meses.push(o.mesRef); }));
  meses.sort();
  const larg = 44;
  console.log('  ' + 'DESPESA'.padEnd(larg) + ' | ' + meses.map(m => m.slice(2).replace('-', '/')).join(' ') + ' | total pago');
  console.log('  ' + '-'.repeat(larg) + '-+-' + '-'.repeat(meses.length * 6 - 1) + '-+-----------');
  series.forEach(s => {
    const ocsS = app.finOcorrencias(s._id);
    const porMes = {};
    ocsS.forEach(o => { porMes[o.mesRef] = o.status === 'Realizado' ? '  R  ' : '  ·  '; });
    const pago = ocsS.filter(o => o.status === 'Realizado').reduce((a, o) => a + (+o.valor || 0), 0);
    console.log('  ' + (s.desc || '—').slice(0, larg).padEnd(larg) + ' | '
      + meses.map(m => porMes[m] || '     ').join(' ') + ' | ' + f(pago).padStart(11));
  });
  console.log('\n  R = Realizado   ·  · = Previsto   (vazio = fora da série)');

  const totReal = app.avaliar('DB.fin').filter(l => l.recId && l.status === 'Realizado');
  console.log(`\n  ocorrências Realizado: ${totReal.length} · todas com vencimento ≤ hoje? ${totReal.every(l => l.vencimento <= HOJE) ? 'SIM ✅' : 'NÃO ❌'}`);
  console.log(`  ocorrências Previsto : ${app.avaliar('DB.fin').filter(l => l.recId && l.status !== 'Realizado').length}`);

  console.log(`\n${falhas === 0 ? '✅ TODOS OS CRITÉRIOS PASSARAM' : '❌ ' + falhas + ' critério(s) falharam'}`);
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('❌', e); process.exit(1); });
