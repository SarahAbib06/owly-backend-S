import express from "express";
import {
  getOrCreatePrivateConversation,
  createGroupConversation,
  getUserConversations,
  getConversationById,
  updateConversation,
  deleteConversation,
} from "../controllers/conversationController.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// Créer ou récupérer une conversation privée
router.post("/private", authenticateToken, getOrCreatePrivateConversation);

// Créer une conversation de groupe
router.post("/group", authenticateToken, createGroupConversation);

// Récupérer les conversations de l'utilisateur
router.get("/user", authenticateToken, getUserConversations);

// Récupérer une conversation par ID
router.get("/:conversationId", authenticateToken, getConversationById);

// Mettre à jour une conversation
router.put("/:conversationId", authenticateToken, updateConversation);

// Supprimer une conversation
router.delete("/:conversationId", authenticateToken, deleteConversation);

export default router;
