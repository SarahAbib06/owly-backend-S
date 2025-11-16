import express from "express";
import {
  getOrCreatePrivateConversation,
  createGroupConversation,
  getUserConversations,
  getConversationById,
  updateConversation,
  deleteConversation,
} from "../controllers/conversationController.js";

// { authMiddleware } from "../middleware/auth.js";
import authMiddleware from "../middleware/auth.js";
const router = express.Router();

// Créer ou récupérer une conversation privée
router.post("/private", authMiddleware, getOrCreatePrivateConversation);

// Créer une conversation de groupe
router.post("/group", authMiddleware, createGroupConversation);

// Récupérer les conversations de l'utilisateur
router.get("/user", authMiddleware, getUserConversations);

// Récupérer une conversation par ID
router.get("/:conversationId", authMiddleware, getConversationById);

// Mettre à jour une conversation
router.put("/:conversationId", authMiddleware, updateConversation);

// Supprimer une conversation
router.delete("/:conversationId", authMiddleware, deleteConversation);

export default router;
