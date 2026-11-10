const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

/**
 * Serviço de Integração com o Supabase Storage
 */
function getSupabaseClient() {
  // Os testes desligam o Storage para não encher o bucket de produção de arquivos
  // de teste — foi assim que 24 "test_document.pdf" foram parar lá.
  if (process.env.SUPABASE_DISABLED === '1') return null;

  const supabaseUrl = process.env.SUPABASE_URL || 'https://vzewuczgqinddcgqfzku.supabase.co';
  const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6ZXd1Y3pncWluZGRjZ3Fmemt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTMzNjgsImV4cCI6MjEwMDgyOTM2OH0.diDULhMDNZ4shVSgM_RctdTiJqS1Yxw_c60ibFO2YJY';

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }
  return createClient(supabaseUrl, supabaseKey);
}

/* O Storage recusa no caminho acento, º, %, # e outros ("Invalid key"). Era assim que "Sebastião.pdf"
   ou "INVOICE 50%.pdf" deixavam de ir para o Storage. O nome de exibição continua em quem chamou. */
function nomeParaStorage(nome) {
  let n = String(nome || 'arquivo');
  // O upload entrega o nome em latin1: "ã" chega como "Ã£". Volta para UTF-8 antes de tirar o acento.
  if (/[ÃÂ]/.test(n)) { const d = Buffer.from(n, 'latin1').toString('utf8'); if (!d.includes('\uFFFD')) n = d; }
  n = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.\- ()]/g, '_').replace(/\s+/g, ' ').trim();
  return n || 'arquivo';
}
const storageAtivo = () => !!getSupabaseClient();
/* Disco do servidor só nos testes e no computador de quem desenvolve: em produção ele é apagado a cada publicação. */
const discoPermitido = () => process.env.SUPABASE_DISABLED === '1';

async function uploadParaSupabase(filePath, fileName, mimeType = 'application/pdf') {
  const supabase = getSupabaseClient();
  const bucketName = process.env.SUPABASE_BUCKET || 'windgate-docs';

  if (!supabase) {
    console.warn('⚠️ Supabase não configurado no arquivo .env');
    return null;
  }

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const destinationPath = `documentos/${Date.now()}_${nomeParaStorage(fileName)}`;

    /* Três tentativas: uma queda de rede no meio do envio não pode virar arquivo perdido. */
    let data = null, error = null;
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      ({ data, error } = await supabase.storage.from(bucketName).upload(destinationPath, fileBuffer, { contentType: mimeType, upsert: true }));
      if (!error && data && data.path) break;
      console.error(`❌ Upload para o Storage falhou (tentativa ${tentativa} de 3):`, error ? error.message : 'sem caminho');
      if (tentativa < 3) await new Promise(ok => setTimeout(ok, 400 * tentativa));
    }
    if (error || !data || !data.path) return null;

    const { data: publicUrlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(data.path);

    console.log('✅ Arquivo enviado para o Supabase Storage! Public URL:', publicUrlData.publicUrl);
    return {
      path: data.path,
      publicUrl: publicUrlData.publicUrl
    };
  } catch (error) {
    console.error('❌ Erro de exceção no upload do Supabase:', error.message);
    return null;
  }
}

async function deletarDoSupabase(fileUrlOrPath) {
  const supabase = getSupabaseClient();
  const bucketName = process.env.SUPABASE_BUCKET || 'windgate-docs';

  if (!supabase || !fileUrlOrPath) return false;

  try {
    let storagePath = fileUrlOrPath;
    if (fileUrlOrPath.includes(bucketName)) {
      const parts = fileUrlOrPath.split(`${bucketName}/`);
      if (parts.length > 1) {
        storagePath = decodeURIComponent(parts[1]);
      }
    }

    const { data, error } = await supabase.storage
      .from(bucketName)
      .remove([storagePath]);

    if (error) {
      console.error('❌ Erro ao deletar arquivo do Supabase Storage:', error.message);
      return false;
    }

    console.log('✅ Arquivo deletado com sucesso do Supabase Storage:', storagePath);
    return true;
  } catch (error) {
    console.error('❌ Exceção ao deletar do Supabase Storage:', error.message);
    return false;
  }
}

/**
 * Lista os arquivos já guardados no Storage.
 *
 * O upload sempre funcionou; o que se perdia era o registro na aba Documentos.
 * Com isso o sistema consegue reencontrar os arquivos que continuam lá e
 * recompor a lista, sem que ninguém precise enviar tudo de novo.
 */
async function listarArquivos(pasta = 'documentos') {
  const supabase = getSupabaseClient();
  const bucketName = process.env.SUPABASE_BUCKET || 'windgate-docs';

  if (!supabase) return { arquivos: [], erro: 'Supabase Storage não configurado.' };

  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .list(pasta, { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } });

    if (error) return { arquivos: [], erro: error.message };

    const arquivos = (data || [])
      .filter(f => f && f.id)  // pastas não têm id
      .map(f => {
        const path = `${pasta}/${f.name}`;
        // o upload grava como "<timestamp>_<nome original>"
        const m = f.name.match(/^(\d{10,})_(.+)$/);
        return {
          path,
          nomeArquivo: f.name,
          nomeOriginal: m ? m[2] : f.name,
          enviadoEm: m ? new Date(Number(m[1])).toISOString() : (f.created_at || null),
          tamanho: (f.metadata && f.metadata.size) || 0,
          url: supabase.storage.from(bucketName).getPublicUrl(path).data.publicUrl
        };
      });

    return { arquivos, erro: null };
  } catch (error) {
    return { arquivos: [], erro: error.message };
  }
}

/** Leitura crua de um objeto do Storage (usado para o banco central). */
async function baixarArquivo(caminho) {
  const supabase = getSupabaseClient();
  const bucketName = process.env.SUPABASE_BUCKET || 'windgate-docs';
  if (!supabase) return null;

  const { data, error } = await supabase.storage.from(bucketName).download(caminho);
  if (error) {
    // objeto ainda não existe é situação normal na primeira execução
    if (/not found/i.test(error.message)) return null;
    throw new Error(error.message);
  }
  return Buffer.from(await data.arrayBuffer());
}

/** Escrita crua de um objeto no Storage (usado para o banco central). */
async function enviarArquivo(caminho, buffer, contentType = 'application/octet-stream') {
  const supabase = getSupabaseClient();
  const bucketName = process.env.SUPABASE_BUCKET || 'windgate-docs';
  if (!supabase) throw new Error('Supabase Storage não configurado.');

  const { error } = await supabase.storage
    .from(bucketName)
    .upload(caminho, buffer, { contentType, upsert: true });

  if (error) throw new Error(error.message);
  return true;
}

module.exports = { discoPermitido, nomeParaStorage, storageAtivo, uploadParaSupabase, deletarDoSupabase, listarArquivos, baixarArquivo, enviarArquivo };
