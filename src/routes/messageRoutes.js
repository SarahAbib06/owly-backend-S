import express from "express";
import { messageController } from "../controllers/messageController.js";
import {
  sendAudioMessage,
  getAudioMessages,
} from "../controllers/audioController.js";
import { protact } from "../middleware/authen.js";
import audioUpload from "../middleware/audioUpload.js";

const router = express.Router();

// ✅ GARDER - Récupération des messages
router.get("/:conversationId", protact, async (req, res) => {
  try {
    console.log("📨 API - Récupération messages conversation:", req.params.conversationId);

    const { conversationId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const messages = await messageController.getConversationMessages(
      conversationId,
      page,
      limit
    );

    console.log(`✅ API - ${messages.length} messages récupérés`);
    res.json({
      success: true,
      messages: messages,
      page: page,
      hasMore: messages.length === limit,
    });
  } catch (error) {
    console.error("❌ API - Erreur:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ❌ SUPPRIMÉ - Route HTTP pour envoyer des messages
// (On utilise uniquement WebSocket pour l'envoi)

// 🔊 ROUTES AUDIO (garder)
router.post(
  "/audio/send",
  protact,
  // Middleware de debug AVANT Multer
  (req, res, next) => {
    console.log("🔍 DEBUG AVANT MULTER:");
    console.log("- Content-Type:", req.headers["content-type"]);
    console.log("- Method:", req.method);
    console.log("- URL:", req.url);
    console.log("- Body keys:", Object.keys(req.body || {}));
    console.log("- Body content:", req.body);
    console.log("- Has file property:", "file" in req);
    console.log("- Has files property:", "files" in req);

    next();
  },
  audioUpload.single("audio"),
  // Middleware de debug APRÈS Multer
  (req, res, next) => {
    console.log("🔍 DEBUG APRÈS MULTER:");
    console.log("- File received:", req.file);
    console.log("- Files received:", req.files);
    console.log("- Body after Multer:", req.body);
    console.log("- ConversationId in body:", req.body?.conversationId);

    if (!req.file) {
      console.log("❌ MULTER N'A PAS REÇU LE FICHIER");
      return res.status(400).json({
        message: "Fichier non reçu par Multer - Debug info",
        debug: {
          contentType: req.headers["content-type"],
          bodyKeys: Object.keys(req.body),
          bodyContent: req.body,
          hasFile: !!req.file,
        },
      });
    }

    console.log("✅ Fichier reçu par Multer:", req.file.originalname);
    next();
  },
  sendAudioMessage
);

// ROUTES AUDIO (garder)
router.get("/audio/:conversationId", protact, getAudioMessages);

export default router;