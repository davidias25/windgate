/**
 * Chat WindGate — mensagens guardadas FORA do banco central (objeto próprio,
 * cifrado, como o ponto). O banco central viaja inteiro a cada sincronização;
 * conversa cresce todo dia e não pode pesar nem vazar junto com ele.
 *
 * Quem escreve vem do TOKEN (não do corpo da requisição). Mensagem não é
 * apagada de verdade: fica marcada como removida, com autor e data.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { baixarArquivo, enviarArquivo } = require('../integrations/supabase.service');
const W = require('../../public/hub/js/regras.js');

const OBJETO = process.env.WINDGATE_CHAT_OBJECT || 'sistema/chat.enc';
const LOCAL = process.env.WINDGATE_CHAT_FILE ? path.resolve(process.env.WINDGATE_CHAT_FILE) : path.join(__dirname, '../../data/chat.json');
const LIMITE = 20000;

const CANAIS_PADRAO = [
  { id: 'geral', nome: 'geral', desc: 'Avisos e conversa de toda a empresa' },
  { id: 'operacoes', nome: 'operações', desc: 'Andamento das importações, despachante, porto' },
  { id: 'comercial', nome: 'comercial', desc: 'Clientes, pedidos e propostas' },
  { id: 'financeiro', nome: 'financeiro', desc: 'Pagamentos, recebimentos e comprovantes', cap: 'fin.ver' },
  { id: 'contabilidade', nome: 'contabilidade', desc: 'Notas, extratos e apuração com o contador', membrosPerfis: ['diretoria', 'operacoes', 'contador'] }
];

function chave() { const s = process.env.WINDGATE_DB_SECRET; return s ? crypto.createHash('sha256').update('chat:' + s).digest() : null; }
function cifrar(t, k) { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', k, iv); return Buffer.concat([iv, c.update(t, 'utf8'), c.final(), c.getAuthTag()]); }
function decifrar(b, k) { const d = crypto.createDecipheriv('aes-256-gcm', k, b.subarray(0, 12)); d.setAuthTag(b.subarray(b.length - 16)); return Buffer.concat([d.update(b.subarray(12, b.length - 16)), d.final()]).toString('utf8'); }

let cache = null;
async function carregar() {
  if (cache) return cache;
  const k = chave();
  if (k) { try { const b = await baixarArquivo(OBJETO); if (b && b.length) { cache = JSON.parse(decifrar(b, k)); } } catch (e) { console.warn('⚠️ Chat: não li da nuvem:', e.message); } }
  if (!cache && fs.existsSync(LOCAL)) { try { cache = JSON.parse(fs.readFileSync(LOCAL, 'utf8')); } catch (e) {} }
  if (!cache) cache = { canais: [], mensagens: [] };
  if (!Array.isArray(cache.canais)) cache.canais = [];
  if (!Array.isArray(cache.mensagens)) cache.mensagens = [];
  return cache;
}
async function salvar(d) {
  cache = d;
  if (d.mensagens.length > LIMITE) d.mensagens = d.mensagens.slice(-LIMITE);
  const t = JSON.stringify(d);
  try { fs.mkdirSync(path.dirname(LOCAL), { recursive: true }); fs.writeFileSync(LOCAL, t, 'utf8'); } catch (e) {}
  const k = chave(); if (!k) return { remoto: false };
  try { await enviarArquivo(OBJETO, cifrar(t, k), 'application/octet-stream'); return { remoto: true }; } catch (e) { console.warn('⚠️ Chat: falha na nuvem:', e.message); return { remoto: false, erro: e.message }; }
}

/** Canais que a pessoa vê: os padrão que o perfil permite, os criados, as conversas diretas dela e os de operação. */
function podeVerCanal(db, k, canalId, canais) {
  const perfil = W.perfilDe(db, k);
  if (canalId.startsWith('dm:')) return canalId.slice(3).split('|').includes(k);
  if (canalId.startsWith('op:')) return perfil.id !== 'contador';
  const c = CANAIS_PADRAO.concat(canais || []).find(x => x.id === canalId);
  if (!c) return false;
  if (perfil.id === 'contador') return (c.membrosPerfis || []).includes('contador');
  if (c.cap && !perfil.caps.includes(c.cap)) return false;
  if (c.membrosPerfis && !c.membrosPerfis.includes(perfil.id)) return false;
  if (Array.isArray(c.membros) && c.membros.length && !c.membros.includes(k)) return false;
  return true;
}
function canaisVisiveis(db, k, dados) {
  return CANAIS_PADRAO.concat(dados.canais).filter(c => podeVerCanal(db, k, c.id, dados.canais));
}
function mensagensVisiveis(db, k, dados, desde) {
  return dados.mensagens.filter(m => m && (!desde || m.em > desde || (m.editadoEm && m.editadoEm > desde) || (m.atualizadoEm && m.atualizadoEm > desde)) && podeVerCanal(db, k, m.canal, dados.canais));
}
const dmId = (a, b) => 'dm:' + [a, b].sort().join('|');

function novaMensagem(db, k, b) {
  const texto = String((b && b.texto) || '').trim().slice(0, 4000);
  if (!texto) throw new Error('Mensagem vazia.');
  const canal = String(b.canal || '');
  if (!canal) throw new Error('Canal não informado.');
  const usuarios = Object.keys(db.users || {});
  const menciona = [...new Set((texto.match(/@([\wÀ-ú]+)/g) || []).map(x => x.slice(1).toLowerCase())
    .map(n => usuarios.find(u => u.toLowerCase() === n || String((db.users[u] || {}).nome || '').toLowerCase().split(' ')[0].normalize('NFD').replace(/[̀-ͯ]/g, '') === n.normalize('NFD').replace(/[̀-ͯ]/g, '')))
    .filter(Boolean))];
  const perfil = W.perfilDe(db, k);
  const podeAviso = ['diretoria', 'operacoes'].includes(perfil.id);
  const agora = new Date().toISOString();
  return { id: 'm' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'), canal, de: k, em: agora, texto, menciona,
    urgente: !!b.urgente, aviso: !!b.aviso && podeAviso, respostaA: b.respostaA || null, opId: canal.startsWith('op:') ? canal.slice(3) : (b.opId || null),
    lidos: { [k]: agora }, confirmacoes: {}, apagadoEm: null };
}

module.exports = { carregar, salvar, CANAIS_PADRAO, podeVerCanal, canaisVisiveis, mensagensVisiveis, novaMensagem, dmId, _reset: () => { cache = null; } };
