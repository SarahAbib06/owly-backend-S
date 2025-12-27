import express from "express";
import User from "../models/User.js";

const router = express.Router();

// GET /api/users/:id/status
router.get("/:id/status", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: "Utilisateur non trouvé" });
    }

    res.json({
      status: user.status,               // online | offline | away
      isOnline: user.status === "online", // ✅ logique correcte
      lastSeen: user.lastSeen || null,
    });
  } catch (error) {
    console.error("Erreur status user:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
