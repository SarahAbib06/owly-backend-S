import multer from "multer";
import path from "path";
import User from "../models/User.js";

// Configuration Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

// Créez l'instance multer
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Seules les images sont autorisées'), false);
    }
  }
});

// Middleware d'upload
export const uploadMiddleware = upload.single("profile");

// Route handler
export const uploadProfilePicture = async (req, res) => {
  try {
    // Vérifiez si un fichier a été uploadé
    if (!req.file) {
      return res.status(400).json({ message: "Aucun fichier uploadé" });
    }

    const userId = req.user.id;
    const filePath = `/uploads/${req.file.filename}`;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profilePicture: filePath },
      { new: true }
    );

    res.status(200).json({ 
      message: "Photo uploadée avec succès", 
      user: updatedUser 
    });
  } catch (error) {
    console.error("Erreur upload:", error);
    res.status(500).json({ message: error.message });
  }
};