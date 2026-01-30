// src/routes/userRoutes.js
import express from "express";
import User from "../models/User.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();

// ✅ GET /api/users/:id/status - Récupérer le statut d'un utilisateur
router.get("/:id/status", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: "Utilisateur non trouvé" });
    }

    // 🔒 VÉRIFIER LA VISIBILITÉ DU STATUT
    if (user.statusVisibility === "Personne") {
      // Si l'utilisateur a désactivé son statut, renvoyer offline
      return res.json({
        status: "offline",
        isOnline: false,
        lastSeen: null, // Ne pas divulguer le lastSeen
      });
    }

    // Sinon, renvoyer le statut réel
    res.json({
      status: user.status,
      isOnline: user.status === "online",
      lastSeen: user.lastSeen || null,
    });
  } catch (error) {
    console.error("Erreur status user:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// 🆕 PUT /api/users/status-visibility - Mettre à jour la visibilité du statut
router.put('/status-visibility', authMiddleware, async (req, res) => {
  try {
    const { visibility } = req.body;
    const userId = req.user.userId || req.user.id;

    // Validation
    if (!["Tout le monde", "Personne"].includes(visibility)) {
      return res.status(400).json({ 
        error: "Valeur invalide. Choisissez 'Tout le monde' ou 'Personne'" 
      });
    }

    // Mise à jour
    const user = await User.findByIdAndUpdate(
      userId, 
      { statusVisibility: visibility },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: "Utilisateur non trouvé" });
    }

    console.log(`✅ Visibilité du statut mise à jour pour ${user.username}: ${visibility}`);

    res.json({ 
      success: true, 
      message: "Paramètre de visibilité mis à jour",
      statusVisibility: user.statusVisibility
    });
  } catch (error) {
    console.error("❌ Erreur mise à jour visibilité:", error);
    res.status(500).json({ error: error.message });
  }
});

// 🆕 GET /api/users/me - Récupérer les infos de l'utilisateur connecté
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const user = await User.findById(userId).select('-passwordHash');
    
    if (!user) {
      return res.status(404).json({ error: "Utilisateur non trouvé" });
    }

    res.json(user);
  } catch (error) {
    console.error("❌ Erreur récupération user:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
