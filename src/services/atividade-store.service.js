/**
 * Tempo ativo no sistema, por pessoa, por dia e por área.
 *
 * O navegador avisa a cada minuto em que a pessoa está com o sistema aberto,
 * na frente, e mexeu nele nos últimos 2 minutos. Cada minuto conta uma vez
 * (aviso repetido no mesmo minuto não soma). Guardamos só minutos por tela,
 * nada do que foi digitado nem do conteúdo visto. Fica fora do banco central,
 * cifrado, como o ponto e o chat.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { baixarArquivo, enviarArquivo } = require('../integrations/supabase.service');

const OBJETO = process.env.WINDGATE_ATIVIDADE_OBJECT || 'sistema/atividade.enc';
const LOCAL = process.env.WINDGATE_ATIVIDADE_FILE ? path.resolve(process.env.WINDGATE_ATIVIDADE_FILE) : path.join(__dirname, '../../data/atividade.json');
const FUSO = 'America/Sao_Paulo';

function chave() { const s = process.env.WINDGATE_DB_SECRET; return s ? crypto.createHash('sha256').update('atividade:' + s).digest() : null; }
function cifrar(t, k) { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', k, iv); return Buffer.concat([iv, c.update(t, 'utf8'), c.final(), c.getAuthTag()]); }
function decifrar(b, k) { const d = crypto.createDecipheriv('aes-256-gcm', k, b.subarray(0, 12)); d.setAuthTag(b.subarray(b.length - 16)); return Buffer.concat([d.update(b.subarray(12, b.length - 16)), d.final()]).toString('utf8'); }

let cache = null, sujo = false, tGravar = null;
async function carregar() {
  if (cache) return cache;
  const k = chave();
  if (k) { try { const b = await baixarArquivo(OBJETO); if (b && b.length) cache = JSON.parse(decifrar(b, k)); } catch (e) { console.warn('⚠️ Atividade: não li da nuvem:', e.message); } }
  if (!cache && fs.existsSync(LOCAL)) { try { cache = JSON.parse(fs.readFileSync(LOCAL, 'utf8')); } catch (e) {} }
  if (!cache || typeof cache !== 'object') cache = { dias: {}, ultimo: {} };
  cache.dias = cache.dias || {}; cache.ultimo = cache.ultimo || {};
  return cache;
}
async function gravar() {
  if (!cache || !sujo) return; sujo = false;
  const t = JSON.stringify(cache);
  try { fs.mkdirSync(path.dirname(LOCAL), { recursive: true }); fs.writeFileSync(LOCAL, t, 'utf8'); } catch (e) {}
  const k = chave(); if (!k) return;
  try { await enviarArquivo(OBJETO, cifrar(t, k), 'application/octet-stream'); } catch (e) { sujo = true; console.warn('⚠️ Atividade: falha na nuvem:', e.message); }
}
function agoraSP(d) {
  const p = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d || new Date()).reduce((a, x) => (a[x.type] = x.value, a), {});
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}
const TELA_OK = /^[a-z0-9:_-]{1,40}$/i;

/** Registra um minuto ativo. Devolve false se o minuto já tinha sido contado. */
async function registrar(k, tela, quando) {
  const d = await carregar(), t = agoraSP(quando), minuto = t.dia + ' ' + t.hora;
  if (!k || d.ultimo[k] === minuto) return false;
  d.ultimo[k] = minuto;
  const area = TELA_OK.test(String(tela || '')) ? String(tela) : 'outro';
  const dia = d.dias[t.dia] = d.dias[t.dia] || {};
  const p = dia[k] = dia[k] || { telas: {}, ini: t.hora, fim: t.hora, min: 0 };
  p.telas[area] = (p.telas[area] || 0) + 1; p.min++; p.fim = t.hora; if (t.hora < p.ini) p.ini = t.hora;
  sujo = true; clearTimeout(tGravar); tGravar = setTimeout(gravar, 60000);
  return true;
}
/** Resumo por pessoa num período: minutos por dia, por área, primeiro e último horário. */
async function resumo(de, ate, quem) {
  const d = await carregar(), out = {};
  Object.entries(d.dias).forEach(([dia, pessoas]) => {
    if (dia < de || dia > ate) return;
    Object.entries(pessoas).forEach(([k, p]) => {
      if (quem && !quem.includes(k)) return;
      const r = out[k] = out[k] || { min: 0, dias: {}, telas: {} };
      r.min += p.min; r.dias[dia] = { min: p.min, ini: p.ini, fim: p.fim };
      Object.entries(p.telas).forEach(([t, m]) => { r.telas[t] = (r.telas[t] || 0) + m; });
    });
  });
  return out;
}

module.exports = { carregar, registrar, resumo, gravar, agoraSP, _reset: () => { cache = null; sujo = false; } };
