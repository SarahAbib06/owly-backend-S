import express from "express";
import { messageController } from "../controllers/messageController.js";
import {
  sendAudioMessage,
  getAudioMessages, // ⭐ CORRECTION : utiliser getAudioMessages au lieu de getAudioInfo
  //deleteAudioMessage,
} from "../controllers/audioController.js";
import { protact } from "../middleware/authen.js";
import audioUpload from "../middleware/audioUpload.js";
const router = express.Router();

// 🎯 ROUTE : GET /api/messages/:conversationId
router.get("/:conversationId", protact, async (req, res) => {
  try {
    console.log(
      "📨 API - Récupération messages conversation:",
      req.params.conversationId
    );

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

// 🆕 ROUTE : POST /api/messages/send
router.post("/send", protact, async (req, res) => {
  try {
    console.log("📨 API - Envoi message:", req.body);

    const { conversationId, Id_receiver, content, typeMessage } = req.body;

    const messageData = {
      conversationId,
      Id_receiver,
      content,
      typeMessage: typeMessage || "text",
    };

    const savedMessage = await messageController.createMessage(
      messageData,
      null,
      req.user._id
    );

    console.log("✅ API - Message envoyé:", savedMessage._id);
    res.json({
      success: true,
      data: savedMessage,
    });
  } catch (error) {
    console.error("❌ API - Erreur envoi message:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 🔊 ROUTES AUDIO AVEC DEBUG CORRIGÉ
router.post(
  "/audio/send",
  protact,
  // Middleware de debug AVANT Multer - CORRIGÉ
  (req, res, next) => {
    console.log("🔍 DEBUG AVANT MULTER:");
    console.log("- Content-Type:", req.headers["content-type"]);
    console.log("- Method:", req.method);
    console.log("- URL:", req.url);
    console.log("- Body keys:", Object.keys(req.body || {})); // ⭐ CORRECTION ICI
    console.log("- Body content:", req.body);
    console.log("- Has file property:", "file" in req);
    console.log("- Has files property:", "files" in req);

    next();
  },
  audioUpload.single("audio"),
  // Middleware de debug APRÈS Multer - CORRIGÉ
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
          bodyKeys: Object.keys(req.body), // ⭐ CORRECTION ICI
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

// ⭐ CORRECTION : Utiliser getAudioMessages au lieu de getAudioInfo
router.get("/audio/:conversationId", protact, getAudioMessages);

//router.delete("/audio/:messageId", authMiddleware, deleteAudioMessage);

export default router;
