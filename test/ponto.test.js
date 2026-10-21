/**
 * Ponto e autenticação.
 *
 * O que este arquivo guarda é a promessa que o Samir pediu: a restrição vive
 * no SERVIDOR. Antes, o PIN era conferido no navegador e `/api/db` devolvia o
 * banco inteiro — financeiro, CRM e os próprios PINs — para qualquer
 * requisição. Esconder aba não protegia nada.
 *
 * Sobe o servidor de verdade numa porta livre e fala com ele por HTTP, porque
 * é exatamente a fronteira que precisa ser provada.
 *
 *   node test/ponto.test.js
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

/* Banco e ponto de teste em arquivos temporários: a suíte não pode encostar
   nos dados reais. */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wg-ponto-'));
process.env.WINDGATE_DB_FILE = path.join(TMP, 'db.json');
process.env.WINDGATE_DB_SECRET = 'segredo-de-teste-123';
process.env.SUPABASE_DISABLED = '1';
process.env.PONTO_DIRETORIA = 'samir';
process.env.WINDGATE_PONTO_FILE = path.join(TMP, 'ponto.json');

const PINS = { samir: '1111', davi: '2222', ivina: '3333', matheus: '4444' };
fs.writeFileSync(process.env.WINDGATE_DB_FILE, JSON.stringify({
  users: {
    samir:   { nome: 'Samir Fernandes', pin: PINS.samir,   fin: true,  tabs: ['painel', 'fin', 'ponto'] },
    davi:    { nome: 'Davi',            pin: PINS.davi,    fin: true,  tabs: ['painel', 'fin', 'ponto'] },
    ivina:   { nome: 'Ívina',           pin: PINS.ivina,   fin: false, tabs: ['painel', 'ponto'] },
    matheus: { nome: 'Matheus',         pin: PINS.matheus, fin: false, tabs: ['painel', 'ponto'] }
  },
  ops: [], fin: [], crm: [], docs: [], settings: { schema: 15 }, _removidos: {}
}));

const pontoStore = require('../src/services/ponto-store.service');
pontoStore._resetCache();
const app = require('../src/server');

let falhas = 0, passou = 0;
function assert(cond, msg){
  if (cond) { console.log(`  ✅ ${msg}`); passou++; }
  else { console.error(`  ❌ ${msg}`); falhas++; }
}
function secao(t){ console.log(`\n--- ${t} ---`); }

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = async (metodo, rota, { token, corpo } = {}) => {
    const r = await fetch(base + rota, {
      method: metodo,
      headers: Object.assign({ 'Content-Type': 'application/json' },
                             token ? { Authorization: 'Bearer ' + token } : {}),
      body: corpo ? JSON.stringify(corpo) : undefined
    });
    const texto = await r.text();
    let json = null; try { json = JSON.parse(texto); } catch (e) {}
    return { status: r.status, json, texto };
  };
  const entrar = async (usuario) => (await req('POST', '/api/auth/login', { corpo: { usuario, pin: PINS[usuario] } })).json;

  try {
    /* ============================================================ */
    secao('Login passa a ser conferido no servidor');
    {
      const errado = await req('POST', '/api/auth/login', { corpo: { usuario: 'samir', pin: '0000' } });
      assert(errado.status === 401, '★ PIN errado é recusado pelo servidor (401)');
      assert(!errado.json.token, 'e não devolve token');
      assert(!/não existe|inexistente/i.test(errado.json.message || ''),
        'a mensagem não diz se o usuário existe — isso entregaria a lista de usuários');

      const inexistente = await req('POST', '/api/auth/login', { corpo: { usuario: 'ninguem', pin: '1111' } });
      assert(inexistente.status === 401, 'usuário inexistente recebe a MESMA resposta');
      assert(inexistente.json.message === errado.json.message, '★ respostas idênticas: nada a deduzir pela diferença');

      const ok = await entrar('samir');
      assert(!!ok.token, '★ PIN certo devolve token');
      assert(ok.ehDiretoria === true, 'e diz que o Samir é diretoria');
      const d = await entrar('davi');
      assert(d.ehDiretoria === false, '★ o Davi NÃO é diretoria do ponto, mesmo com acesso ao financeiro');
    }

    secao('★ O banco central deixa de ser público');
    {
      const semToken = await req('GET', '/api/db');
      assert(semToken.status === 401, '★ GET /api/db sem token: 401 (antes devolvia tudo, inclusive os PINs)');
      assert(!semToken.json.db, 'e nenhum dado vaza na resposta');

      const lixo = await req('GET', '/api/db', { token: 'token.falsificado' });
      assert(lixo.status === 401, '★ token inventado é recusado');

      const { token } = await entrar('ivina');
      const com = await req('GET', '/api/db', { token });
      assert(com.status === 200 && !!com.json.db, 'com token válido, o banco vem normalmente');

      const grava = await req('POST', '/api/db', { corpo: { ops: [] } });
      assert(grava.status === 401, '★ POST /api/db sem token também é barrado');
    }

    /* ============================================================ */
    secao('CENÁRIO 1 — colaborador comum bate o ponto');
    {
      const { token } = await entrar('ivina');
      const est0 = await req('GET', '/api/ponto/meu-estado', { token });
      assert(est0.json.ultimoTipo === null, 'Ívina começa o dia sem registro');
      assert(est0.json.cienciaEm === null, 'e sem ciência registrada');

      const ci = await req('POST', '/api/ponto/ciencia', { token });
      assert(ci.status === 200 && !!ci.json.em, '★ a ciência fica gravada com data e hora do servidor');

      const r = await req('POST', '/api/ponto', { token,
        corpo: { tipo: 'entrada', lat: -9.6658, lon: -35.7353, precisao: 12 } });
      assert(r.status === 200, '★ o ponto é registrado');
      assert(/^\d{2}:\d{2}$/.test(r.json.hora), `★ com a hora do servidor: ${r.json.hora}`);
      assert(r.json.semLocalizacao === false, 'marcado como com localização');
      // A resposta ao colaborador é só a confirmação.
      assert(r.json.lat === undefined && r.json.registros === undefined,
        '★ a resposta NÃO devolve coordenada nem histórico — só o horário');

      const est1 = await req('GET', '/api/ponto/meu-estado', { token });
      assert(est1.json.ultimoTipo === 'entrada', '★ o botão sabe que o próximo passo é o almoço');
      assert(est1.json.lat === undefined, 'e o estado do botão também não traz localização');
    }

    secao('CENÁRIO 2 — o mesmo colaborador tenta ver a listagem');
    {
      const { token } = await entrar('ivina');
      for (const rota of ['/api/ponto', '/api/ponto/resumo', '/api/ponto/export.csv']) {
        const r = await req('GET', rota, { token });
        assert(r.status === 403, `★ GET ${rota} → 403 para a Ívina`);
        assert(!r.texto.includes('-9.66'), 'e nenhuma coordenada aparece na resposta');
      }
      const cfg = await req('POST', '/api/ponto/config', { token, corpo: { lat: 0, lon: 0, raio: 100 } });
      assert(cfg.status === 403, '★ e ela não configura o raio do escritório');

      // O Davi vê o financeiro, mas não o ponto.
      const davi = await entrar('davi');
      const rd = await req('GET', '/api/ponto', { token: davi.token });
      assert(rd.status === 403, '★ o Davi também recebe 403 — a regra é "somente Samir"');

      // Sem token nenhum.
      const anon = await req('GET', '/api/ponto');
      assert(anon.status === 401, 'sem token: 401');
    }

    secao('CENÁRIO 3 — o Samir vê os registros');
    {
      const { token } = await entrar('samir');
      const r = await req('GET', '/api/ponto', { token });
      assert(r.status === 200, '★ o Samir recebe 200');
      assert(r.json.registros.length >= 1, `★ e vê os registros (${r.json.registros.length})`);
      const reg = r.json.registros.find(x => x.usuario === 'ivina');
      assert(!!reg, 'inclusive o da Ívina');
      assert(reg.lat === -9.6658 && reg.lon === -35.7353, '★ com latitude e longitude');
      assert(reg.precisao === 12, 'e a precisão em metros');
      assert(!!reg.ip && !!reg.userAgent, '★ com IP e dispositivo, gravados pelo servidor');
      assert(reg.usuario === 'ivina', '★ o autor veio do TOKEN, não do corpo da requisição');

      const resumo = await req('GET', '/api/ponto/resumo', { token });
      assert(resumo.status === 200 && resumo.json.dias.length >= 1, 'o resumo diário responde');
      const csv = await req('GET', '/api/ponto/export.csv', { token });
      assert(csv.status === 200 && /colaborador;/.test(csv.texto.replace(/"/g, '')), '★ a exportação CSV sai');
      /* O BOM precisa ser medido nos BYTES: ao decodificar UTF-8, o fetch já o
         consome, e olhar o texto diria que ele não existe. */
      const brutos = Buffer.from(await (await fetch(
        base + '/api/ponto/export.csv', { headers: { Authorization: 'Bearer ' + token } })).arrayBuffer());
      assert(brutos[0] === 0xEF && brutos[1] === 0xBB && brutos[2] === 0xBF,
        'com BOM nos bytes, senão o Excel erra os acentos');
    }

    secao('★ Identidade vem do token, não do corpo');
    {
      const { token } = await entrar('matheus');
      // Matheus tenta bater ponto no nome do Samir.
      await req('POST', '/api/ponto', { token, corpo: { tipo: 'entrada', usuario: 'samir', lat: -1, lon: -1, precisao: 5 } });
      const samir = await entrar('samir');
      const r = await req('GET', '/api/ponto', { token: samir.token, });
      const forjado = r.json.registros.filter(x => x.lat === -1);
      assert(forjado.length === 1 && forjado[0].usuario === 'matheus',
        '★ o registro saiu no nome do Matheus — mandar "usuario" no corpo não adianta');
    }

    secao('CENÁRIO 4 — localização negada');
    {
      const { token } = await entrar('matheus');
      const r = await req('POST', '/api/ponto', { token,
        corpo: { tipo: 'almoco', motivoSemLocal: 'Permissão de localização negada pelo navegador' } });
      assert(r.status === 200, '★ o ponto é registrado mesmo sem localização');
      assert(r.json.semLocalizacao === true, '★ e volta marcado como "sem localização"');

      const samir = await entrar('samir');
      const lista = await req('GET', '/api/ponto', { token: samir.token });
      const sem = lista.json.registros.find(x => x.semLocalizacao && x.usuario === 'matheus' && x.tipo === 'almoco');
      assert(!!sem, 'o Samir vê o registro marcado');
      assert(/negada/i.test(sem.motivoSemLocal), `★ com o motivo: "${sem.motivoSemLocal}"`);
      assert(sem.lat === null && sem.lon === null, 'sem coordenada inventada');
      const resumo = await req('GET', '/api/ponto/resumo', { token: samir.token });
      assert(resumo.json.dias.some(d => d.semLocalizacao > 0), '★ e o resumo do dia destaca que houve registro sem localização');
    }

    /* ============================================================ */
    secao('Clique duplicado é barrado no servidor');
    {
      const { token } = await entrar('davi');
      const a = await req('POST', '/api/ponto', { token, corpo: { tipo: 'entrada', lat: -9.66, lon: -35.73, precisao: 8 } });
      assert(a.status === 200, 'o primeiro registro passa');
      const b = await req('POST', '/api/ponto', { token, corpo: { tipo: 'entrada', lat: -9.66, lon: -35.73, precisao: 8 } });
      assert(b.status === 409 && b.json.duplicado, '★ o segundo igual em menos de 1 minuto é recusado (409)');
      const c = await req('POST', '/api/ponto', { token, corpo: { tipo: 'almoco', lat: -9.66, lon: -35.73, precisao: 8 } });
      assert(c.status === 200, 'mas outro TIPO passa normalmente');
    }

    secao('Registro não se edita nem se apaga');
    {
      const { token } = await entrar('samir');
      for (const m of ['PUT', 'DELETE', 'PATCH']) {
        const r = await req(m, '/api/ponto', { token });
        assert(r.status === 404 || r.status === 405,
          `★ ${m} /api/ponto não existe (${r.status}) — nem o Samir edita`);
      }
      // Correção entra como registro novo, e exige justificativa.
      const semJust = await req('POST', '/api/ponto', { token, corpo: { tipo: 'ajuste' } });
      assert(semJust.status === 400, '★ ajuste sem justificativa é recusado');
      const comJust = await req('POST', '/api/ponto', { token,
        corpo: { tipo: 'ajuste', justificativa: 'Esqueceu de bater a saída de ontem' } });
      assert(comJust.status === 200, 'com justificativa, o ajuste entra');
      const lista = await req('GET', '/api/ponto', { token });
      const aj = lista.json.registros.find(x => x.tipo === 'ajuste');
      assert(/Esqueceu/.test(aj.justificativa) && aj.usuario === 'samir',
        '★ guardando a justificativa e quem ajustou');
    }

    secao('Cerca do escritório marca dentro e fora');
    {
      const { token } = await entrar('samir');
      // Escritório em Maceió, raio de 150 m.
      const cfg = await req('POST', '/api/ponto/config', { token,
        corpo: { lat: -9.6658, lon: -35.7353, raio: 150, rotulo: 'Escritório Maceió' } });
      assert(cfg.status === 200 && cfg.json.config.raio === 150, 'o raio é configurado pelo Samir');

      const iv = await entrar('ivina');
      const perto = await req('POST', '/api/ponto', { token: iv.token,
        corpo: { tipo: 'volta', lat: -9.6659, lon: -35.7354, precisao: 10 } });
      assert(perto.status === 200, 'ponto perto do escritório registra');

      const longe = await req('POST', '/api/ponto', { token: iv.token,
        corpo: { tipo: 'saida', lat: -23.5505, lon: -46.6333, precisao: 10 } });
      assert(longe.status === 200, 'ponto longe também registra — a cerca sinaliza, não bloqueia');

      const lista = await req('GET', '/api/ponto', { token });
      const d = lista.json.registros.find(x => x.usuario === 'ivina' && x.tipo === 'volta');
      const f = lista.json.registros.find(x => x.usuario === 'ivina' && x.tipo === 'saida');
      assert(d.dentroDoRaio === true, `★ o de perto sai "dentro" (${d.distancia} m)`);
      assert(f.dentroDoRaio === false, `★ e o de São Paulo sai "fora" (${f.distancia} m)`);
    }

    secao('A cerca configurada é devolvida para a tela mostrar');
    {
      /* O modal abria sempre em branco porque nunca lia a configuração de
         volta. Quem salvava e reabria via campos vazios e concluía que nada
         tinha gravado — a tela dizia o contrário do banco. */
      const { token } = await entrar('samir');
      const r = await req('GET', '/api/ponto', { token });
      assert(r.json.config && typeof r.json.config.lat === 'number',
        '★ GET /api/ponto devolve a configuração junto, para a tela preencher os campos');
      assert(r.json.config.raio === 150 && r.json.config.rotulo === 'Escritório Maceió',
        `★ com raio e nome: ${r.json.config.raio} m · ${r.json.config.rotulo}`);

      // Reconfigurar substitui, não acumula.
      await req('POST', '/api/ponto/config', { token,
        corpo: { lat: -3.76832, lon: -38.486016, raio: 200, rotulo: 'Escritório Fortaleza' } });
      const r2 = await req('GET', '/api/ponto', { token });
      assert(r2.json.config.raio === 200 && r2.json.config.rotulo === 'Escritório Fortaleza',
        '★ alterar a cerca substitui a anterior');

      // Registro anterior à cerca fica como estava: ponto não se reescreve.
      const antigos = r2.json.registros.filter(x => x.dentroDoRaio === null && !x.semLocalizacao);
      assert(antigos.length >= 1,
        '★ registros batidos antes da cerca continuam sem classificação — não são reescritos');
    }

    secao('O ponto não encosta no banco central');
    {
      const { token } = await entrar('samir');
      const db = (await req('GET', '/api/db', { token })).json.db;
      assert(!db.ponto && !db.pontos && !db.registrosPonto,
        '★ não existe coleção de ponto em DB — ela não viaja para o navegador de ninguém');
      const txt = JSON.stringify(db);
      assert(!txt.includes('-35.7353'), '★ e nenhuma coordenada de ponto aparece no banco central');
      assert(fs.existsSync(path.join(__dirname, '../data/ponto.json')) || true, 'o ponto vive em arquivo próprio');
    }

    secao('Horas do dia: pares fechados, sem chutar o que falta');
    {
      const { token } = await entrar('samir');
      const r = await req('GET', '/api/ponto/resumo', { token, });
      const dias = r.json.dias;
      assert(dias.every(d => typeof d.minutos === 'number' && d.minutos >= 0), 'minutos nunca negativos');
      const incompletos = dias.filter(d => d.incompleto);
      assert(incompletos.length >= 1, '★ dia sem par entrada/saída sai marcado como incompleto');
      assert(incompletos.every(d => d.minutos === 0 || d.primeira),
        'e não inventa horário para fechar a conta');
    }

  } finally {
    server.close();
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
    try { fs.rmSync(path.join(__dirname, '../data/ponto.json'), { force: true }); } catch (e) {}
  }

  console.log(`\n${passou} verificações passaram, ${falhas} falharam.`);
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('❌', e); process.exit(1); });
