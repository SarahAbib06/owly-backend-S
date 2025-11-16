import multer from "multer";
import path from "path";
import fs from "fs";

// 📁 CRÉER LE DOSSIER UPLOADS S'IL N'EXISTE PAS
const AUDIO_UPLOAD_DIR = "./uploads/audio";

// Vérifier et créer le dossier
if (!fs.existsSync(AUDIO_UPLOAD_DIR)) {
  console.log("📁 Création du dossier uploads/audio...");
  fs.mkdirSync(AUDIO_UPLOAD_DIR, { recursive: true });
}

// ⚙️ CONFIGURATION MULTER POUR LE STOCKAGE
const storage = multer.diskStorage({
  // Dossier de destination
  destination: (req, file, cb) => {
    cb(null, AUDIO_UPLOAD_DIR);
  },

  // Nom du fichier
  filename: (req, file, cb) => {
    try {
      // Générer un nom unique : audio_timestamp_random.extension
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const fileExtension = path.extname(file.originalname); // .webm, .mp3, etc.
      const fileName = `audio_${uniqueSuffix}${fileExtension}`;

      console.log("📄 Nom du fichier généré:", fileName);
      cb(null, fileName);
    } catch (error) {
      console.error("❌ Erreur génération nom fichier:", error);
      cb(error);
    }
  },
});

// 🎵 FILTRER LES TYPES DE FICHIERS AUTORISÉS
const fileFilter = (req, file, cb) => {
  console.log("🔍 Vérification du fichier audio:", {
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
  });

  // Types MIME autorisés pour l'audio
  const allowedAudioTypes = [
    "audio/mpeg", // MP3
    "audio/wav", // WAV
    "audio/ogg", // OGG
    "audio/x-m4a", // M4A
    "audio/aac", // AAC
    "audio/webm", // WEBM (principal)
    "video/webm", // WEBM vidéo (compatibilité)
  ];

  // Vérifier le type MIME
  if (allowedAudioTypes.includes(file.mimetype)) {
    console.log("✅ Type audio accepté:", file.mimetype);
    cb(null, true);
  } else {
    console.log("❌ Type audio refusé:", file.mimetype);
    cb(
      new Error(
        `Type de fichier audio non supporté. Types autorisés: MP3, WAV, OGG, M4A, AAC, WEBM`
      ),
      false
    );
  }
};

// 🚀 CONFIGURATION FINALE MULTER
const audioUpload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB maximum
    files: 1, // Un seul fichier à la fois
  },
});

// Middleware pour logger les uploads
audioUpload.singleWithLog = (fieldName) => {
  return (req, res, next) => {
    console.log("🎯 Début upload audio...");
    audioUpload.single(fieldName)(req, res, (err) => {
      if (err) {
        console.error("❌ Erreur upload:", err.message);
        return res.status(400).json({
          message: err.message,
        });
      }

      if (req.file) {
        console.log("✅ Upload réussi:", {
          filename: req.file.filename,
          size: req.file.size,
          mimetype: req.file.mimetype,
          path: req.file.path,
        });
      } else {
        console.log("⚠️ Aucun fichier reçu");
      }

      next();
    });
  };
};

export default audioUpload;
