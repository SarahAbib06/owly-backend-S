// controllers/uploadController.js
import multer from "multer";
import streamifier from "streamifier";
import cloudinary from "../config/cloudinary.js";
import User from "../models/User.js";

// Multer → stockage en mémoire (obligatoire pour Cloudinary)
const storage = multer.memoryStorage();

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Seules les images sont autorisées"), false);
  },
}).single("profile");

// Upload vers Cloudinary
export const uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Aucun fichier uploadé" });
    }

    const userId = req.user.id;

    // Fonction utilitaire : convertit le buffer en stream → Cloudinary
    const uploadToCloudinary = (buffer) => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "profile_pictures",
            transformation: { width: 600, crop: "limit" },
          },
          (err, result) => {
            if (err) reject(err);
            else resolve(result);
          }
        );

        streamifier.createReadStream(buffer).pipe(stream);
      });
    };

    const result = await uploadToCloudinary(req.file.buffer);

    // Mise à jour de l'utilisateur
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        profilePicture: result.secure_url,
        profilePictureId: result.public_id,
      },
      { new: true }
    );

    return res.status(200).json({
      message: "Photo uploadée avec succès",
      user: updatedUser,
    });

  } catch (error) {
    console.error("Erreur Cloudinary:", error);
    return res.status(500).json({ message: error.message });
  }
};

