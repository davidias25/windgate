/**
 * Migração das despesas fixas: de um registro repetido na tela para uma série
 * (o modelo) mais uma ocorrência por mês, cada uma com o seu status, o seu
 * comprovante e o seu valor.
 *
 * O sistema já migra sozinho ao abrir (migrateDB, schema 14). Este script
 * existe para CONFERIR antes: ele roda exatamente o mesmo código — o trecho
 * `recorrencia-core` é recortado do public/index.html e executado aqui, para
 * que o relatório não possa divergir do que o navegador vai fazer — e imprime
 * a tabela antes/depois, despesa por despesa e mês por mês.
 *
 *   node scripts/migrar-despesas-fixas.js                  # confere o banco da nuvem
 *   node scripts/migrar-despesas-fixas.js data/db.json     # confere um arquivo
 *   node scripts/migrar-despesas-fixas.js data/db.json --csv relatorio.csv
 *
 * Por padrão NÃO grava nada. Gravar exige --aplicar, e mesmo assim o banco
 * central continua sendo migrado pelo próprio sistema: usar --aplicar só
 * adianta o trabalho, nunca substitui a conferência.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const flag = f => args.includes(f);
const valorDe = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const arquivo = args.find(a => !a.startsWith('--') && a !== valorDe('--csv')) || null;

/* O núcleo da recorrência mora no index.html, junto do código que roda no
   navegador. Duplicá-lo aqui deixaria as duas cópias se afastarem com o tempo,
   e o relatório passaria a descrever uma migração que não é a que acontece. */
function carregarCore(){
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const ini = html.indexOf('/* ==== INÍCIO recorrencia-core');
  const fim = html.indexOf('/* ==== FIM recorrencia-core ==== */');
  if (ini < 0 || fim < 0) {
    throw new Error('Marcadores "recorrencia-core" não encontrados em public/index.html — o núcleo foi movido ou renomeado.');
  }
  const nomes = ['FIN_REC_TOTAL_PADRAO', 'FIN_REC_MES_MIN', 'finUltimoDiaMes', 'finMesDe',
    'finMesSoma', 'finMesDiff', 'finVencDoMes', 'finSerieFim', 'finOcorrenciaNova',
    'finMaterializar', 'finRecIdMigracao', 'finOcIdMigracao', 'finMigrarFixos'];
  return new Function(html.slice(ini, fim) + '\nreturn {' + nomes.join(',') + '};')();
}

const brl = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = d => (d ? String(d).split('-').reverse().join('/') : '—');
const pad = (s, n) => String(s === null || s === undefined ? '' : s).padEnd(n).slice(0, n);
const padL = (s, n) => String(s === null || s === undefined ? '' : s).padStart(n).slice(-n);

async function lerBanco(){
  if (arquivo) {
    console.log(`Banco: ${arquivo}\n`);
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  }
  const dbStore = require('../src/services/db-store.service');
  if (!dbStore.remotaAtiva()) {
    console.error('WINDGATE_DB_SECRET não definido — sem ele o banco da nuvem não pode ser lido.');
    console.error('Informe um arquivo: node scripts/migrar-despesas-fixas.js data/db.json');
    process.exit(1);
  }
  const db = await dbStore.carregar(path.join(__dirname, '../data/db.json'));
  if (!db) { console.error('Não foi possível carregar o banco central.'); process.exit(1); }
  console.log(`Banco: ${dbStore.OBJETO} (Supabase Storage)\n`);
  return db;
}

(async () => {
  const core = carregarCore();
  const db = await lerBanco();

  const finAntes = (db.fin || []).filter(Boolean);
  const fixasAntes = finAntes.filter(l => l.fixo && !l.recId);
  const jaMigradas = finAntes.filter(l => l.recId).length;

  console.log('══ ANTES ══');
  console.log(`  lançamentos no financeiro : ${finAntes.length}`);
  console.log(`  despesas/receitas fixas   : ${fixasAntes.length}`);
  console.log(`  ocorrências já migradas   : ${jaMigradas}`);
  console.log(`  séries já existentes      : ${(db.finRec || []).length}\n`);

  if (!fixasAntes.length) {
    console.log('Nada a migrar: nenhum lançamento fixo no modelo antigo.');
    if (jaMigradas) console.log('As fixas deste banco já estão materializadas em séries + ocorrências.');
    return;
  }

  const relatorio = core.finMigrarFixos(db);

  console.log('══ DEPOIS — despesa por despesa ══\n');
  const linhasCsv = [['serie', 'descricao', 'empresa', 'tipo', 'indice', 'mes', 'vencimento', 'valor', 'status', 'comprovante', 'conferir']];

  relatorio.forEach((r, i) => {
    console.log(`${i + 1}. ${r.desc}  [${r.tipo} · ${r.empresa}]`);
    console.log(`   ANTES : 1 registro · vence ${br(r.antes.vencimento)} · ${brl(r.antes.valor)} · ${r.antes.status}`
      + (r.antes.liquidadoEm ? ` · pago em ${br(r.antes.liquidadoEm)}` : '')
      + (r.antes.comp ? ' · com comprovante' : ''));
    console.log(`   DEPOIS: ${r.depois.length} ocorrências`);
    console.log('   ┌────────┬─────────┬────────────┬──────────────┬────────────┬─────────────┐');
    console.log('   │   n    │  mês    │ vencimento │        valor │ status     │ comprovante │');
    console.log('   ├────────┼─────────┼────────────┼──────────────┼────────────┼─────────────┤');
    r.depois.forEach(o => {
      console.log(`   │ ${padL(o.idx + '/' + r.depois.length, 6)} │ ${pad(o.mes, 7)} │ ${pad(br(o.vencimento), 10)} │ ${padL(brl(o.valor), 12)} │ ${pad(o.status, 10)} │ ${pad(o.comp ? 'sim' : '—', 11)} │`);
      linhasCsv.push([r.serieId, r.desc, r.empresa, r.tipo, `${o.idx}/${r.depois.length}`, o.mes, o.vencimento, (+o.valor || 0).toFixed(2), o.status, o.comp ? 'sim' : '', r.conferir || '']);
    });
    console.log('   └────────┴─────────┴────────────┴──────────────┴────────────┴─────────────┘');
    if (r.conferir) console.log(`   ⚠ CONFERIR: ${r.conferir}`);
    console.log('');
  });

  /* Conferência de integridade. É a pergunta que importa: nenhuma despesa fixa
     pode ter sumido, e nenhuma pode ter virado duas. */
  const finDepois = (db.fin || []).filter(Boolean);
  const idsDepois = finDepois.map(l => l._id);
  const duplicados = idsDepois.filter((x, i) => idsDepois.indexOf(x) !== i);
  const sumiram = fixasAntes.filter(o => !finDepois.some(l => l._id === o._id));
  const esperado = relatorio.reduce((a, r) => a + r.depois.length, 0);
  const criadas = finDepois.filter(l => l.recId).length - jaMigradas;
  const realizadas = finDepois.filter(l => l.recId && l.status === 'Realizado').length;
  const conferir = relatorio.filter(r => r.conferir);

  console.log('══ CONFERÊNCIA ══');
  console.log(`  séries criadas                     : ${relatorio.length}`);
  console.log(`  ocorrências criadas                : ${criadas} (esperado ${esperado})`);
  console.log(`  ocorrências Realizado              : ${realizadas}`);
  console.log(`  ocorrências Previsto               : ${criadas - realizadas}`);
  console.log(`  ids duplicados                     : ${duplicados.length ? '❌ ' + duplicados.join(', ') : '✅ nenhum'}`);
  console.log(`  registros originais preservados    : ${sumiram.length ? '❌ sumiram ' + sumiram.map(o => o._id).join(', ') : '✅ todos'}`);
  console.log(`  total do financeiro                : ${finAntes.length} → ${finDepois.length}`);
  console.log(`  ajuste manual necessário           : ${conferir.length ? '⚠ ' + conferir.length : '✅ nenhum'}`);

  if (conferir.length) {
    console.log('\n══ PARA O SAMIR E O DAVI AJUSTAREM À MÃO ══');
    conferir.forEach(r => console.log(`  · ${r.desc} — ${r.conferir}`));
  }

  const csv = valorDe('--csv');
  if (csv) {
    fs.writeFileSync(csv, linhasCsv.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n'), 'utf8');
    console.log(`\nCSV gravado em ${csv}`);
  }

  if (!flag('--aplicar')) {
    console.log('\n(simulação — nada foi gravado. Use --aplicar para gravar, ou deixe o próprio sistema migrar ao abrir.)');
    return;
  }

  db.settings = db.settings || {};
  db.settings.schema = Math.max(14, db.settings.schema || 0);
  db.settings.finRecMigracao = {
    em: new Date().toISOString(),
    series: relatorio.length,
    ocorrencias: esperado,
    conferir: conferir.map(r => ({ serieId: r.serieId, desc: r.desc, motivo: r.conferir }))
  };

  if (arquivo) {
    fs.writeFileSync(arquivo, JSON.stringify(db, null, 2), 'utf8');
    console.log(`\n✅ Gravado em ${arquivo}`);
  } else {
    const dbStore = require('../src/services/db-store.service');
    const r = await dbStore.salvar(db, path.join(__dirname, '../data/db.json'));
    if (!r.remoto) { console.error('❌ Falha ao gravar no Supabase Storage:', r.erro); process.exit(1); }
    console.log(`\n✅ Gravado em ${dbStore.OBJETO}`);
  }
})().catch(e => { console.error('❌', e.message); process.exit(1); });
