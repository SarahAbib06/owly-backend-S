import express from "express";
import {
  sendMessage,
  getConversationMessages,
  markAsRead,
  markAllAsRead,
  deleteMessage,
  getUnreadMessages,
} from "../controllers/messageController.js";

import {
  sendAudioMessage,
  getAudioInfo,
  deleteAudioMessage,
} from "../controllers/audioController.js";

import { authenticateToken } from "../middleware/auth.js";

import audioUpload from "../middleware/audioUpload.js";

const router = express.Router();

// Envoyer un message
router.post("/send", authenticateToken, sendMessage);

// Récupérer les messages d'une conversation
router.get("/:conversationId", authenticateToken, getConversationMessages);

// Marquer un message comme lu
router.put("/read", authenticateToken, markAsRead);

// Marquer tous les messages comme lus dans une conversation
router.put("/read-all", authenticateToken, markAllAsRead);

// Supprimer un message
router.delete("/:messageId", authenticateToken, deleteMessage);

// Récupérer les messages non lus
router.get("/unread/count", authenticateToken, getUnreadMessages);

// 🔊 ROUTES AUDIO (NOUVEAU)
router.post(
  "/audio/send",
  authenticateToken,
  audioUpload.singleWithLog("audio"), // Utiliser 'audio' comme champ
  sendAudioMessage
);

router.get("/audio/:messageId", authenticateToken, getAudioInfo);

router.delete("/audio/:messageId", authenticateToken, deleteAudioMessage);

export default router;
