const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configuração do destino e nome dos arquivos recebidos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

// Filtro para validar tipos de arquivo (PDF, imagens, planilhas e documentos)
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const dangerousExts = ['.exe', '.bat', '.cmd', '.sh', '.dll', '.msi', '.vbs', '.js', '.scr'];

  if (dangerousExts.includes(ext) || file.mimetype.includes('x-msdownload') || file.mimetype.includes('executable')) {
    return cb(new Error('Tipo de arquivo não permitido por segurança.'), false);
  }

  const allowedExts = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.xlsx', '.xls', '.csv', '.doc', '.docx', '.zip', '.rar'];

  if (allowedExts.includes(ext) || file.mimetype.startsWith('image/') || file.mimetype.includes('pdf') || file.mimetype.includes('sheet') || file.mimetype.includes('excel') || file.mimetype.includes('csv') || file.mimetype.includes('zip') || file.mimetype.includes('rar')) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de arquivo não suportado. Envie apenas PDF, imagem, planilha ou documento.'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // Limite ampliado para 25MB por arquivo
  fileFilter: fileFilter
});

module.exports = upload;
