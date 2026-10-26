/**
 * Hub 2.0 · Fase 0 — rede de segurança do banco central.
 *
 * Roda o servidor de verdade contra um Storage FALSO em memória, com a cifra
 * ligada, para provar que:
 *   1. toda gravação deixa fotografia (hora + dia) cifrada e legível;
 *   2. exclusão nova sempre gera fotografia ANTES de ser aplicada;
 *   3. se a nuvem não respondeu no boot, a cópia de um navegador não vira o banco;
 *   4. a conferência de migração acusa qualquer registro perdido.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP = path.join(os.tmpdir(), `windgate-hist-${process.pid}.json`);
process.env.WINDGATE_DB_FILE = TMP;
process.env.WINDGATE_DB_SECRET = 'segredo-de-teste-' + process.pid;
delete process.env.SUPABASE_DISABLED;

/* ---------- Storage falso, injetado antes de carregar o servidor ---------- */
const nuvem = new Map();
let nuvemFora = true;                 // começa FORA: simula falha no boot
const supaPath = require.resolve('../src/integrations/supabase.service');
require.cache[supaPath] = {
  id: supaPath, filename: supaPath, loaded: true,
  exports: {
    uploadParaSupabase: async () => null,
    deletarDoSupabase: async () => false,
    listarArquivos: async (pasta) => ({ erro: null, arquivos: [...nuvem.keys()]
      .filter(k => k.startsWith(pasta + '/')).map(k => ({ path: k, nomeArquivo: k.split('/').pop(), tamanho: nuvem.get(k).length })) }),
    baixarArquivo: async (c) => { if (nuvemFora) throw new Error('rede fora'); return nuvem.get(c) || null; },
    enviarArquivo: async (c, buf) => { if (nuvemFora) throw new Error('rede fora'); nuvem.set(c, Buffer.from(buf)); return true; }
  }
};

const historico = require('../src/services/historico.service');
const dbStore = require('../src/services/db-store.service');

let passou = 0, falhou = 0;
const ok = (c, m) => { if (c) { passou++; console.log('  ✅ ' + m); } else { falhou++; console.error('  ❌ ' + m); } };

(async () => {
  /* Banco "bom" que já está na nuvem, com um usuário para login. */
  const PIN = '4821';
  const bancoBom = {
    users: { samir: { nome: 'Samir', pin: PIN, fin: true, tabs: ['painel'] } },
    ops: [{ _id: 'op1', nome: 'OP20' }, { _id: 'op2', nome: 'OP21' }],
    fin: Array.from({ length: 5 }, (_, i) => ({ _id: 'f' + i, valor: i * 100 })),
    docs: [], settings: { schema: 15 }, _removidos: {}
  };
  const chave = dbStore.chaveDeCifra();
  nuvem.set(dbStore.OBJETO, dbStore.cifrar(JSON.stringify(bancoBom), chave));

  console.log('\n--- Funções puras ---');
  const p = historico.partesSP(new Date('2026-10-25T03:30:00Z'));
  ok(p.dia === '2026-10-25' && p.hora === '00', 'data/hora em São Paulo (UTC−3), não do servidor');
  const ja = new Set();
  const f1 = historico.fotografiasDaGravacao(new Date('2026-10-25T15:00:00Z'), ja);
  ok(f1.length === 2 && f1.some(c => c.includes('hora-12')) && f1.some(c => c.includes('dia-2026-10-25')), 'primeira gravação do dia: fotografia da hora + do dia');
  ja.add(f1.find(c => c.includes('dia-')));
  ok(historico.fotografiasDaGravacao(new Date('2026-10-25T16:00:00Z'), ja).length === 1, 'gravações seguintes do dia: só a da hora');
  ok(JSON.stringify(historico.contarRegistros(bancoBom)) === JSON.stringify({ users: 1, ops: 2, fin: 5, docs: 0, settings: 1 }), 'contagem por coleção');
  ok(historico.exclusoesNovas({ _removidos: { a: 1 } }, { _removidos: { a: 1, b: 2 } }).join() === 'b', 'detecta só a exclusão nova');

  const cmpOk = historico.compararBancos(bancoBom, JSON.parse(JSON.stringify(bancoBom)));
  ok(cmpOk.ok, 'conferência: banco igual passa');
  const semUm = JSON.parse(JSON.stringify(bancoBom)); semUm.fin.pop(); delete semUm.users.samir;
  const cmpRuim = historico.compararBancos(bancoBom, semUm);
  ok(!cmpRuim.ok && cmpRuim.perdas.length === 2, 'conferência: acusa lançamento e usuário perdidos');

  console.log('\n--- Servidor com a nuvem FORA no boot ---');
  const app = require('../src/server');
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  await new Promise(r => setTimeout(r, 50));

  /* sem nuvem o login não tem usuários: emite token direto pelo serviço */
  const auth = require('../src/services/auth.service');
  const tk = auth.emitirToken('samir');
  const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk };

  const copiaVelha = { ops: [{ _id: 'op1', nome: 'OP20' }], fin: [], _removidos: {} };
  let r = await fetch(base + '/api/db', { method: 'POST', headers: H, body: JSON.stringify(copiaVelha) });
  ok(r.status === 503, 'nuvem fora: a cópia de um navegador NÃO vira o banco (HTTP 503)');
  ok(nuvem.get(dbStore.OBJETO) && JSON.parse(dbStore.decifrar(nuvem.get(dbStore.OBJETO), chave)).fin.length === 5, 'o banco bom na nuvem continua intacto');

  console.log('\n--- A nuvem volta ---');
  nuvemFora = false;
  r = await fetch(base + '/api/db', { method: 'POST', headers: H, body: JSON.stringify(copiaVelha) });
  ok(r.status === 200, 'com a nuvem de volta, a gravação é aceita');
  const depois = JSON.parse(dbStore.decifrar(nuvem.get(dbStore.OBJETO), chave));
  ok(depois.ops.length === 2 && depois.fin.length === 5, 'a cópia velha foi MESCLADA: nada do banco bom se perdeu');
  const fotos = [...nuvem.keys()].filter(k => k.startsWith(historico.PASTA));
  ok(fotos.some(k => /hora-\d\d\.enc$/.test(k)) && fotos.some(k => /dia-\d{4}-\d\d-\d\d\.enc$/.test(k)), 'gravação deixou fotografia da hora e do dia');
  const foto = await dbStore.lerFotografia(fotos.find(k => k.includes('/dia-')));
  ok(foto && foto.fin.length === 5, 'a fotografia é cifrada e volta legível com a chave');
  ok(!nuvem.get(fotos[0]).toString('utf8').includes('OP20'), 'fotografia não guarda texto aberto');

  console.log('\n--- Exclusão ---');
  const comExclusao = Object.assign({}, depois, { _removidos: { f4: Date.now() } });
  r = await fetch(base + '/api/db', { method: 'POST', headers: H, body: JSON.stringify(comExclusao) });
  ok(r.status === 200, 'exclusão aceita');
  const fotoExc = [...nuvem.keys()].find(k => k.includes('/antes-exclusao-'));
  ok(!!fotoExc, 'fotografia "antes-exclusao" foi gravada');
  const antesExc = await dbStore.lerFotografia(fotoExc);
  ok(antesExc.fin.some(x => x._id === 'f4'), 'e ela contém o lançamento que foi excluído — dá para recuperar');
  const atual = JSON.parse(dbStore.decifrar(nuvem.get(dbStore.OBJETO), chave));
  ok(!atual.fin.some(x => x._id === 'f4') && atual.fin.length === 4, 'no banco atual a exclusão vale normalmente');

  const h = await (await fetch(base + '/api/health')).json();
  ok(h.historico && h.historico.ok === true, '/api/health mostra o estado do histórico');

  srv.close();
  try { fs.unlinkSync(TMP); } catch (e) {}
  console.log(`\n${passou} verificações passaram, ${falhou} falharam.`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
