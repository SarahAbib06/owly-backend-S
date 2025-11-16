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

// { authMiddleware } from "../middleware/auth.js";
import authMiddleware from "../middleware/auth.js";
import audioUpload from "../middleware/audioUpload.js";

const router = express.Router();

// Envoyer un message
router.post("/send", authMiddleware, sendMessage);

// Récupérer les messages d'une conversation
router.get("/:conversationId", authMiddleware, getConversationMessages);

// Marquer un message comme lu
router.put("/read", authMiddleware, markAsRead);

// Marquer tous les messages comme lus dans une conversation
router.put("/read-all", authMiddleware, markAllAsRead);

// Supprimer un message
router.delete("/:messageId", authMiddleware, deleteMessage);

// Récupérer les messages non lus
router.get("/unread/count", authMiddleware, getUnreadMessages);

// 🔊 ROUTES AUDIO (NOUVEAU)
router.post(
  "/audio/send",
  authMiddleware,
  audioUpload.singleWithLog("audio"), // Utiliser 'audio' comme champ
  sendAudioMessage
);

router.get("/audio/:messageId", authMiddleware, getAudioInfo);

router.delete("/audio/:messageId", authMiddleware, deleteAudioMessage);

export default router;
