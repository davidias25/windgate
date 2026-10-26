/**
 * As fotografias do banco: listar, abrir e baixar.
 *
 *   npm run historico -- listar
 *   npm run historico -- ver sistema/historico/dia-2026-10-26.enc
 *   npm run historico -- baixar sistema/historico/dia-2026-10-26.enc saida.json
 *
 * Baixar NÃO restaura nada. Gera um arquivo para você conferir com
 * `npm run conferir:migracao` e, só então, restaurar com
 * `node scripts/restaurar-banco.js saida.json`, com o servidor parado.
 */
require('dotenv').config();
const fs = require('fs');
const historico = require('../src/services/historico.service');

const kb = n => n == null ? '—' : (n / 1024).toFixed(0) + ' KB';
const br = iso => iso ? String(iso).slice(0, 19).replace('T', ' ') : '—';

(async () => {
  const [cmd, ...rest] = process.argv.slice(2).filter(a => !a.startsWith('--'));

  if (!process.env.WINDGATE_DB_SECRET) {
    console.error('❌ WINDGATE_DB_SECRET ausente — sem ela as fotografias não abrem.');
    process.exit(1);
  }

  if (cmd === 'listar' || !cmd) {
    const lista = await historico.listar();
    if (!lista.length) {
      console.log(`\nNenhuma fotografia em ${historico.PASTA}.`);
      console.log('Elas passam a existir a partir da primeira gravação depois deste deploy.\n');
      return;
    }
    console.log(`\n${lista.length} fotografia(s) em ${historico.PASTA}:\n`);
    console.log('  arquivo                      tamanho    gravada em');
    console.log('  ---------------------------- ---------- -------------------');
    lista.forEach(a => console.log(`  ${a.nome.padEnd(28)} ${kb(a.tamanho).padStart(10)} ${br(a.em)}`));
    console.log('\n  As "dia-…" nunca são apagadas. As "hora-NN" giram a cada 24 h.');
    console.log('  Ver o conteúdo:  npm run historico -- ver <caminho>\n');
    return;
  }

  if (cmd === 'ver') {
    if (!rest[0]) { console.error('Uso: npm run historico -- ver <caminho>'); process.exit(1); }
    const foto = await historico.abrir(rest[0]);
    console.log(`\n  gravada em : ${br(foto.em)}`);
    console.log(`  motivo     : ${foto.motivo}`);
    console.log('\n  contagem por coleção:');
    Object.entries(foto.contagem || {}).forEach(([k, v]) => console.log(`     ${k.padEnd(16)} ${String(v).padStart(6)}`));
    console.log('\n  Baixar:  npm run historico -- baixar ' + rest[0] + ' saida.json\n');
    return;
  }

  if (cmd === 'baixar') {
    const [caminho, destino] = rest;
    if (!caminho || !destino) { console.error('Uso: npm run historico -- baixar <caminho> <saida.json>'); process.exit(1); }
    const foto = await historico.abrir(caminho);
    fs.writeFileSync(destino, JSON.stringify(foto.db, null, 2), 'utf8');
    console.log(`\n✅ Gravado em ${destino} (fotografia de ${br(foto.em)}, motivo: ${foto.motivo})`);
    console.log('\n  Antes de restaurar, confira o que muda:');
    console.log(`     npm run conferir:migracao -- ${destino}`);
    console.log('  E só então, com o servidor PARADO:');
    console.log(`     node scripts/restaurar-banco.js ${destino}\n`);
    return;
  }

  console.error('Comandos: listar · ver <caminho> · baixar <caminho> <saida.json>');
  process.exit(1);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
