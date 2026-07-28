const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

/**
 * Serviço de Integração com o Supabase Storage
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('sua-url') || supabaseKey.includes('sua-chave')) {
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

module.exports = { uploadParaSupabase };
