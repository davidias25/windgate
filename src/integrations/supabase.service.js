const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

/**
 * Serviço de Integração com o Supabase Storage
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://vzewuczgqinddcgqfzku.supabase.co';
  const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6ZXd1Y3pncWluZGRjZ3Fmemt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTMzNjgsImV4cCI6MjEwMDgyOTM2OH0.diDULhMDNZ4shVSgM_RctdTiJqS1Yxw_c60ibFO2YJY';

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }
  return createClient(supabaseUrl, supabaseKey);
}

async function uploadParaSupabase(filePath, fileName, mimeType = 'application/pdf') {
  const supabase = getSupabaseClient();
  const bucketName = process.env.SUPABASE_BUCKET || 'windgate-docs';

  if (!supabase) {
    console.warn('⚠️ Supabase não configurado no arquivo .env');
    return null;
  }

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const destinationPath = `documentos/${Date.now()}_${fileName}`;

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(destinationPath, fileBuffer, {
        contentType: mimeType,
        upsert: true
      });

    if (error) {
      console.error('❌ Erro no upload para o Supabase Storage:', error.message);
      return null;
    }

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

module.exports = { uploadParaSupabase, deletarDoSupabase };
