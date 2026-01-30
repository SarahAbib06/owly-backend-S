import express from "express";
import { messageController } from "../controllers/messageController.js";
import {
  sendAudioMessage,
  getAudioMessages,
} from "../controllers/audioController.js";
import { protact } from "../middleware/authen.js";
import audioUpload from "../middleware/audioUpload.js";


const router = express.Router();

// Récupération des messages d'une conversation
router.get("/:conversationId", protact, async (req, res) => {
  try {
    console.log(
      "API - Récupération messages conversation:",
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

    console.log(`API - ${messages.length} messages récupérés`);
    res.json({
      success: true,
      messages: messages,
      page: page,
      hasMore: messages.length === limit,
    });
  } catch (error) {
    console.error("API - Erreur:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Dans routes/messageRoutes.js, ajoute ces routes AVANT `export default router;`

// Marquer un message comme vu
router.post("/:messageId/mark-seen", protact, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;
    const io = req.app.get("io");

    const Message = (await import("../models/Message.js")).default;
    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ success: false, error: "Message non trouvé" });
    }

    // Vérifier que ce n'est pas l'expéditeur qui marque comme vu
    if (message.Id_sender.toString() === userId) {
      return res.status(400).json({ 
        success: false, 
        error: "L'expéditeur ne peut pas marquer son propre message comme vu" 
      });
    }

    // Vérifier si déjà marqué comme vu
    const alreadySeen = message.readBy?.some(
      r => r.userId.toString() === userId
    );

    if (!alreadySeen) {
      if (!message.readBy) message.readBy = [];
      
      message.readBy.push({
        userId: userId,
        readAt: new Date()
      });
      
      await message.save();

      // Émettre à TOUS les participants de la conversation
      if (io) {
        io.to(message.conversationId.toString()).emit("message:seen", {
          messageId: message._id.toString(),
          seenBy: userId,
          conversationId: message.conversationId.toString(),
          seenAt: new Date()
        });

        // Émettre aussi directement à l'expéditeur
        io.to(`user_${message.Id_sender.toString()}`).emit("message:seen", {
          messageId: message._id.toString(),
          seenBy: userId,
          conversationId: message.conversationId.toString(),
          seenAt: new Date()
        });
      }

      console.log(`✅ Message ${messageId} marqué comme vu par ${userId}`);
    }

    res.json({ 
      success: true, 
      message: "Message marqué comme vu",
      readBy: message.readBy
    });

  } catch (error) {
    console.error("❌ Erreur mark-seen:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Marquer TOUS les messages d'une conversation comme vus
router.post("/:conversationId/mark-all-seen", protact, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const io = req.app.get("io");

    const Message = (await import("../models/Message.js")).default;
    
    // Trouver tous les messages non lus
    const messages = await Message.find({
      conversationId: conversationId,
      Id_sender: { $ne: userId },
      "readBy.userId": { $ne: userId }
    });

    const updatedMessageIds = [];

    for (const message of messages) {
      if (!message.readBy) message.readBy = [];
      
      message.readBy.push({
        userId: userId,
        readAt: new Date()
      });
      
      await message.save();
      updatedMessageIds.push(message._id.toString());

      // Émettre pour chaque message
      if (io) {
        io.to(conversationId.toString()).emit("message:seen", {
          messageId: message._id.toString(),
          seenBy: userId,
          conversationId: conversationId,
          seenAt: new Date()
        });

        io.to(`user_${message.Id_sender.toString()}`).emit("message:seen", {
          messageId: message._id.toString(),
          seenBy: userId,
          conversationId: conversationId,
          seenAt: new Date()
        });
      }
    }

    console.log(`✅ ${updatedMessageIds.length} messages marqués comme vus`);

    res.json({
      success: true,
      messagesMarked: updatedMessageIds.length,
      messageIds: updatedMessageIds
    });

  } catch (error) {
    console.error("❌ Erreur mark-all-seen:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🔧 ROUTE AUDIO CORRIGÉE - avec logging du statut
router.post(
  "/audio/send",
  protact,
  (req, res, next) => {
    console.log("DEBUG AVANT MULTER:");
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
  (req, res, next) => {
    console.log("DEBUG APRÈS MULTER:");
    console.log("- File received:", req.file);
    console.log("- Files received:", req.files);
    console.log("- Body after Multer:", req.body);
    console.log("- ConversationId in body:", req.body?.conversationId);
    // 🆕 AJOUT: Logger le statut reçu
    console.log("- Status in body:", req.body?.status);

    if (!req.file) {
      console.log("MULTER N'A PAS REÇU LE FICHIER");
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

    console.log("Fichier reçu par Multer:", req.file.originalname);
    next();
  },
  sendAudioMessage // ← Cette fonction doit utiliser req.body.status
);

router.get("/audio/:conversationId", protact, getAudioMessages);

// Épingler un message
router.post("/:messageId/pin", protact, (req, res) => {
  req.io = req.app.get("io");
  messageController.pinMessage(req, res);
});

// Désépingler un message
router.post("/:messageId/unpin", protact, (req, res) => {
  req.io = req.app.get("io");
  messageController.unpinMessage(req, res);
});

// Route pour la galerie médias/fichiers
router.get('/:conversationId/media', protact, messageController.getConversationMedia);
router.post("/:messageId/translate", protact, (req, res) => {
  console.log("ROUTE /translate TOUCHÉE !", req.params, req.body);
  messageController.translateMessage(req, res);
});

// Supprimer un message
router.post("/:messageId/delete", protact, (req, res) => {
  req.io = req.app.get("io");
  messageController.deleteMessage(req, res);
});

// Récupérer les messages épinglés
router.get(
  "/:conversationId/pinned",
  protact,
  messageController.getPinnedMessages
);

// Transférer un message
router.post("/:messageId/forward", protact, messageController.forwardMessage);

export default router;
