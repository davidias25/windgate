/**
 * Persistência do banco central.
 *
 * O disco do Render é efêmero: some a cada deploy e a cada reinício do serviço.
 * Como o `data/db.json` também é versionado, o banco voltava para o arquivo
 * vazio do repositório toda vez que o container era recriado — era isso que
 * apagava as operações e os documentos periodicamente.
 *
 * Agora o banco vive no Supabase Storage, que sobrevive a deploys. O arquivo
 * local continua sendo gravado como cache e rede de segurança.
 *
 * O conteúdo vai CIFRADO: o bucket é público e a chave anon do Supabase está
 * no HTML da aplicação, então qualquer pessoa poderia baixar o banco — que
 * contém PINs, clientes e financeiro. A chave de cifra fica só na variável de
 * ambiente WINDGATE_DB_SECRET, no servidor.
 */
const fs = require('fs');
const crypto = require('crypto');
const { baixarArquivo, enviarArquivo } = require('../integrations/supabase.service');

const OBJETO = process.env.WINDGATE_DB_OBJECT || 'sistema/db.enc';

function chaveDeCifra() {
  const segredo = process.env.WINDGATE_DB_SECRET;
  if (!segredo) return null;
  return crypto.createHash('sha256').update(segredo).digest();
}

function cifrar(texto, chave) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', chave, iv);
  const dados = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), dados]);
}

function decifrar(buffer, chave) {
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const dados = buffer.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', chave, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(dados), decipher.final()]).toString('utf8');
}

/** Persistência remota só é usada quando há chave de cifra configurada. */
function remotaAtiva() {
  return !!chaveDeCifra();
}

async function carregar(caminhoLocal) {
  const chave = chaveDeCifra();

  if (chave) {
    try {
      const buffer = await baixarArquivo(OBJETO);
      if (buffer && buffer.length) {
        const db = JSON.parse(decifrar(buffer, chave));
        console.log(`✅ Banco central carregado do Supabase Storage (${OBJETO}).`);
        return db;
      }
    } catch (e) {
      console.warn('⚠️ Não foi possível ler o banco do Supabase Storage:', e.message);
    }
  } else {
    console.warn('⚠️ WINDGATE_DB_SECRET não configurado — o banco fica só no disco local, que o Render apaga a cada reinício.');
  }

  if (caminhoLocal && fs.existsSync(caminhoLocal)) {
    try {
      const db = JSON.parse(fs.readFileSync(caminhoLocal, 'utf8'));
      console.log('ℹ️ Banco central carregado do arquivo local.');
      return db;
    } catch (e) {
      console.warn('⚠️ Arquivo local do banco ilegível:', e.message);
    }
  }

  return null;
}

// Último resultado de gravação remota, exposto no /api/health para dar para
// conferir de fora se o banco está mesmo sendo persistido fora do disco.
let ultimoEstado = { remota: false, ok: null, erro: null, em: null };
const estado = () => Object.assign({ objeto: OBJETO }, ultimoEstado);

async function salvar(db, caminhoLocal) {
  const texto = JSON.stringify(db, null, 2);

  if (caminhoLocal) {
    try { fs.writeFileSync(caminhoLocal, texto, 'utf8'); } catch (e) {
      console.warn('⚠️ Falha ao gravar o banco no disco local:', e.message);
    }
  }

  const chave = chaveDeCifra();
  if (!chave) {
    ultimoEstado = { remota: false, ok: null, erro: 'WINDGATE_DB_SECRET ausente', em: new Date().toISOString() };
    return { remoto: false, erro: ultimoEstado.erro };
  }

  try {
    await enviarArquivo(OBJETO, cifrar(texto, chave), 'application/octet-stream');
    ultimoEstado = { remota: true, ok: true, erro: null, em: new Date().toISOString() };
    return { remoto: true, erro: null };
  } catch (e) {
    console.warn('⚠️ Falha ao gravar o banco no Supabase Storage:', e.message);
    ultimoEstado = { remota: true, ok: false, erro: e.message, em: new Date().toISOString() };
    return { remoto: false, erro: e.message };
  }
}

module.exports = { carregar, salvar, remotaAtiva, estado, OBJETO };
