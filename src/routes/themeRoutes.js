// src/routes/themeRoutes.js
import express from "express";
import {
  applyTheme,
  getTheme,
  removeTheme,
} from "../controllers/themeController.js";

import authMiddleware from "../middleware/auth.js";

const router = express.Router();

// Appliquer ou mettre à jour un thème
router.post("/", authMiddleware, applyTheme);

// Récupérer le thème d'une conversation
router.get("/:conversationId", authMiddleware, getTheme);

// Supprimer le thème d'une conversation
router.delete("/:conversationId", authMiddleware, removeTheme);

export default router;