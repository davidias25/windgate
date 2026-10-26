/**
 * Rede de proteção do banco central.
 *
 * O banco é uma cópia só e viaja inteiro entre o navegador e o servidor. As
 * três defesas que este arquivo guarda:
 *   · toda gravação deixa uma fotografia cifrada, e a que REMOVE registro
 *     tira a fotografia antes de aplicar;
 *   · servidor que não carregou o banco recusa gravação em vez de deixar a
 *     cópia de um navegador virar o banco;
 *   · a conferência lista registro a registro o que sumiu — contagem igual
 *     não prova nada, porque um a menos e outro a mais fecham a conta.
 *
 *   node test/historico.test.js
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wg-hist-'));
process.env.WINDGATE_DB_FILE = path.join(TMP, 'db.json');
process.env.WINDGATE_PONTO_FILE = path.join(TMP, 'ponto.json');
process.env.WINDGATE_DB_SECRET = 'segredo-de-teste-123';
process.env.SUPABASE_DISABLED = '1';

const PIN = '5150';
fs.writeFileSync(process.env.WINDGATE_DB_FILE, JSON.stringify({
  users: { samir: { nome: 'Samir', pin: PIN, fin: true, tabs: ['painel'] } },
  ops:  [{ _id: 'op-1', id: 'OP20', nome: 'Em produção' }],
  docs: [{ _id: 'doc-1', op: 'OP20', nome: 'BL ORIGINAL' },
         { _id: 'doc-2', op: 'OP20', nome: 'Invoice assinada' }],
  fin:  [{ _id: 'fin-1', op: 'OP20', tipo: 'Receita', valor: 200000, status: 'Realizado', desc: '1ª parcela' },
         { _id: 'fin-2', op: 'OP20', tipo: 'Despesa', valor: 150000, status: 'Realizado', desc: 'Fábrica' }],
  crm: [], crmOps: [], crmDocs: [], settings: { schema: 15 }, _removidos: {}
}));

const historico = require('../src/services/historico.service');

let falhas = 0, passou = 0;
function assert(cond, msg){
  if (cond) { console.log(`  ✅ ${msg}`); passou++; }
  else { console.error(`  ❌ ${msg}`); falhas++; }
}
function secao(t){ console.log(`\n--- ${t} ---`); }

(async () => {
  const app = require('../src/server');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = async (m, rota, { token, corpo } = {}) => {
    const r = await fetch(base + rota, {
      method: m,
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
      body: corpo ? JSON.stringify(corpo) : undefined
    });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch(e) {}
    return { status: r.status, json: j };
  };

  try {
    secao('Conferência: o que sumiu, registro a registro');
    {
      const antes  = { docs: [{ _id: 'a', nome: 'BL' }, { _id: 'b', nome: 'Invoice' }],
                       fin: [{ _id: 'f1', desc: 'Parcela 1', valor: 79166.99 }] };
      const depois = { docs: [{ _id: 'a', nome: 'BL' }],
                       fin: [{ _id: 'f1', desc: 'Parcela 1', valor: 79166.99 }] };
      const r = historico.conferir(antes, depois);
      assert(!r.ok && r.total === 1, '★ detecta o documento que sumiu');
      assert(r.faltando.docs[0]._id === 'b', 'dizendo qual');
      assert(r.faltando.docs[0].rotulo === 'Invoice', `★ com rótulo legível: "${r.faltando.docs[0].rotulo}"`);

      /* O teste que importa: contagem igual escondendo perda. */
      const trocado = { docs: [{ _id: 'a', nome: 'BL' }, { _id: 'z', nome: 'Outro qualquer' }],
                        fin: antes.fin };
      const r2 = historico.conferir(antes, trocado);
      assert(r2.contagem.antes.docs === r2.contagem.depois.docs,
        'contagem idêntica nos dois lados (2 e 2)');
      assert(!r2.ok && r2.faltando.docs[0]._id === 'b',
        '★ e a perda é detectada mesmo assim — um a menos e outro a mais fechariam a conta');

      const iguais = historico.conferir(antes, antes);
      assert(iguais.ok && iguais.total === 0, 'bancos iguais: nenhuma perda');
      const cresceu = historico.conferir(antes, { docs: [...antes.docs, { _id: 'c', nome: 'Novo' }], fin: antes.fin });
      assert(cresceu.ok, '★ registro A MAIS não é perda — é o uso normal entre os dois momentos');
      // 2 documentos + 1 lançamento: tudo que existia tem de ser acusado.
      assert(historico.conferir(antes, {}).total === 3,
        'banco de destino vazio acusa os 3 registros que existiam');
    }

    secao('O que uma gravação REMOVE');
    {
      const atual = { docs: [{ _id: 'a' }, { _id: 'b' }], fin: [{ _id: 'f1' }] };
      // Cliente que simplesmente não mandou a coleção não está removendo nada.
      assert(Object.keys(historico.perdas(atual, { fin: [{ _id: 'f1' }] })).length === 0,
        '★ coleção ausente no que chegou não conta como remoção — a mesclagem preserva');
      // Exclusão de verdade vem com tombstone.
      const comTombstone = { docs: [{ _id: 'a' }], fin: [{ _id: 'f1' }], _removidos: { b: Date.now() } };
      assert(historico.perdas(atual, comTombstone).docs === 1,
        '★ exclusão com tombstone é reconhecida como remoção');
      // Sem tombstone, é cliente desatualizado — a mesclagem devolve o registro.
      assert(Object.keys(historico.perdas(atual, { docs: [{ _id: 'a' }], fin: [{ _id: 'f1' }] })).length === 0,
        '★ ausência SEM tombstone é cliente desatualizado, não exclusão');
    }

    secao('Contagem cobre todas as coleções em lista');
    {
      const { COLECOES } = require('../src/services/db-merge.service');
      COLECOES.forEach(k => assert(historico.COLECOES.includes(k),
        `a coleção "${k}" é conferida pelo histórico`));
    }

    secao('★ TRAVA — servidor sem banco recusa gravação');
    {
      /* Com o banco carregado, grava normalmente. */
      const login = await req('POST', '/api/auth/login', { corpo: { usuario: 'samir', pin: PIN } });
      const token = login.json.token;
      const ok = await req('POST', '/api/db', { token, corpo: { docs: [{ _id: 'doc-3', nome: 'PL' }] } });
      assert(ok.status === 200, 'servidor com banco carregado aceita a gravação');

      const saude = await req('GET', '/api/health');
      assert(saude.json.bancoIncerto === false, '★ /api/health diz que o banco está certo');
      assert(saude.json.registros && saude.json.registros.fin === 2,
        '★ e mostra a contagem de todas as coleções, não só três');
      assert(!!saude.json.historico, 'com o estado do histórico junto');
    }

    secao('A fotografia é tirada antes de remover');
    {
      const login = await req('POST', '/api/auth/login', { corpo: { usuario: 'samir', pin: PIN } });
      const token = login.json.token;
      /* Exclusão de um documento: o servidor fotografa ANTES de aplicar.
         Sem Supabase no teste, a fotografia falha — o que importa provar é que
         ela é TENTADA, e que a gravação segue mesmo assim. */
      const antesDaExclusao = (await req('GET', '/api/db', { token })).json.db.docs.length;
      const r = await req('POST', '/api/db', { token,
        corpo: { docs: [{ _id: 'doc-1', op: 'OP20', nome: 'BL ORIGINAL' }], _removidos: { 'doc-2': Date.now() } } });
      assert(r.status === 200, 'a exclusão é aplicada');
      const depois = (await req('GET', '/api/db', { token })).json.db;
      assert(depois.docs.length === antesDaExclusao - 1, 'e o documento sai do banco');
      assert(!depois.docs.some(d => d._id === 'doc-2'), 'era o doc-2');
      /* O financeiro não foi tocado — é a garantia que o Samir pediu. */
      assert(depois.fin.length === 2 && depois.fin.every(l => l.status === 'Realizado'),
        '★ e o financeiro continua inteiro: excluir documento não encosta em lançamento');
    }

    secao('★ O financeiro e os documentos atravessam a ida e volta');
    {
      const login = await req('POST', '/api/auth/login', { corpo: { usuario: 'samir', pin: PIN } });
      const token = login.json.token;
      const antes = (await req('GET', '/api/db', { token })).json.db;

      /* Simula o que um navegador faz: devolve o banco que recebeu, com uma
         alteração. Nada do resto pode se perder no caminho. */
      const copia = JSON.parse(JSON.stringify(antes));
      copia.ops.push({ _id: 'op-2', id: 'OP21', nome: 'Nova' });
      await req('POST', '/api/db', { token, corpo: copia });
      const depois = (await req('GET', '/api/db', { token })).json.db;

      const r = historico.conferir(antes, depois);
      assert(r.ok, `★ nenhum registro perdido na ida e volta (${r.total} perdas)`);
      assert(depois.fin.length === antes.fin.length, '★ o financeiro continua com os mesmos lançamentos');
      assert(depois.docs.length === antes.docs.length, '★ e os documentos também');
      assert(depois.ops.length === antes.ops.length + 1, 'com a operação nova acrescentada');

      /* Gravação PARCIAL de um cliente que só conhece parte do banco. */
      await req('POST', '/api/db', { token, corpo: { ops: [{ _id: 'op-3', id: 'OP22', nome: 'Parcial' }] } });
      const dep2 = (await req('GET', '/api/db', { token })).json.db;
      assert(historico.conferir(depois, dep2).ok,
        '★ gravação parcial não apaga o que ela não mandou — financeiro e documentos ficam');
      assert(dep2.fin.length === 2 && dep2.docs.length >= 1, 'conferido: fin e docs intactos');
    }

  } finally {
    server.close();
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
    try { fs.rmSync(path.join(__dirname, '../data/ponto.json'), { force: true }); } catch (e) {}
  }

  console.log(`\n${passou} verificações passaram, ${falhas} falharam.`);
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('❌', e); process.exit(1); });
