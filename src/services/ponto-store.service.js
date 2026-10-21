/**
 * Registros de ponto — guardados FORA do banco central.
 *
 * O banco central viaja inteiro para o navegador de cada pessoa em
 * `GET /api/db`. Se o ponto morasse nele, a localização de cada colaborador
 * estaria no computador de todos os colegas, e esconder a aba seria teatro.
 * Por isso objeto próprio, cifrado, que só sai daqui como resposta a uma
 * consulta autorizada.
 *
 * Nada aqui atualiza nem apaga registro: só acrescenta e lê. Correção entra
 * como um registro novo do tipo `ajuste`, com justificativa e autor.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { baixarArquivo, enviarArquivo } = require('../integrations/supabase.service');

const OBJETO = process.env.WINDGATE_PONTO_OBJECT || 'sistema/ponto.enc';
/* Configurável para a suíte apontar a um arquivo temporário — sem isso um
   teste herdaria os registros do anterior e o resultado dependeria da ordem. */
const LOCAL = process.env.WINDGATE_PONTO_FILE
  ? path.resolve(process.env.WINDGATE_PONTO_FILE)
  : path.join(__dirname, '../../data/ponto.json');

function chaveDeCifra() {
  const s = process.env.WINDGATE_DB_SECRET;
  return s ? crypto.createHash('sha256').update('ponto:' + s).digest() : null;
}
function cifrar(texto, chave) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave, iv);
  return Buffer.concat([iv, Buffer.concat([c.update(texto, 'utf8'), c.final()]), c.getAuthTag()]);
}
function decifrar(buf, chave) {
  const iv = buf.subarray(0, 12), tag = buf.subarray(buf.length - 16), dados = buf.subarray(12, buf.length - 16);
  const d = crypto.createDecipheriv('aes-256-gcm', chave, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(dados), d.final()]).toString('utf8');
}

const VAZIO = { registros: [], ciencias: {}, config: {} };
let cache = null;

async function carregar() {
  if (cache) return cache;
  const chave = chaveDeCifra();
  if (chave) {
    try {
      const buf = await baixarArquivo(OBJETO);
      if (buf && buf.length) { cache = JSON.parse(decifrar(buf, chave)); return cache; }
    } catch (e) {
      console.warn('⚠️ Ponto: não foi possível ler da nuvem:', e.message);
    }
  }
  if (fs.existsSync(LOCAL)) {
    try { cache = JSON.parse(fs.readFileSync(LOCAL, 'utf8')); return cache; } catch (e) {}
  }
  cache = JSON.parse(JSON.stringify(VAZIO));
  return cache;
}

async function salvar(dados) {
  cache = dados;
  const texto = JSON.stringify(dados, null, 2);
  try {
    fs.mkdirSync(path.dirname(LOCAL), { recursive: true });
    fs.writeFileSync(LOCAL, texto, 'utf8');
  } catch (e) { console.warn('⚠️ Ponto: falha ao gravar no disco local:', e.message); }
  const chave = chaveDeCifra();
  if (!chave) return { remoto: false, erro: 'WINDGATE_DB_SECRET ausente' };
  try {
    await enviarArquivo(OBJETO, cifrar(texto, chave), 'application/octet-stream');
    return { remoto: true, erro: null };
  } catch (e) {
    console.warn('⚠️ Ponto: falha ao gravar na nuvem:', e.message);
    return { remoto: false, erro: e.message };
  }
}

/* ---------- data e hora do SERVIDOR, em São Paulo ----------
   O relógio do aparelho é ajustável pelo próprio colaborador. A hora do ponto
   é a do servidor, e o fuso é fixo: o Render roda em UTC, e sem forçar o fuso
   um ponto das 22h viraria o dia seguinte. */
const FUSO = 'America/Sao_Paulo';
function agoraSP() {
  const d = new Date();
  const p = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {});
  return {
    em: d.toISOString(),
    data: `${p.year}-${p.month}-${p.day}`,
    hora: `${p.hour}:${p.minute}`,
    horaCompleta: `${p.hour}:${p.minute}:${p.second}`
  };
}

/* Distância em metros entre dois pontos (Haversine). É o que diz se o
   colaborador bateu o ponto no escritório ou longe dele. */
function distanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

module.exports = { carregar, salvar, agoraSP, distanciaMetros, OBJETO, FUSO,
                   _resetCache: () => { cache = null; } };
