const { google } = require('googleapis');
const fs = require('fs');

/**
 * Serviço de Integração com a API v3 do Google Drive
 */
async function uploadParaGoogleDrive(filePath, fileName, mimeType = 'application/pdf') {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!credentialsPath || !fs.existsSync(credentialsPath)) {
    console.warn('⚠️ Arquivo de credenciais do Google Drive (credentials-drive.json) não encontrado.');
    return null;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const drive = google.drive({ version: 'v3', auth });

    const fileMetadata = {
      name: fileName,
      parents: folderId ? [folderId] : []
    };

    const media = {
      mimeType: mimeType,
      body: fs.createReadStream(filePath),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink, webContentLink',
    });

    console.log('✅ Arquivo enviado para o Google Drive! File ID:', response.data.id);
    return response.data;
  } catch (error) {
    console.error('❌ Erro no upload para o Google Drive:', error.message);
    throw error;
  }
}

module.exports = { uploadParaGoogleDrive };
