import express from "express";
import { padController } from "../controllers/padController.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();

router.use(authMiddleware);

// 🎯 GET Pad d'une conversation
router.get("/:conversationId", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    
    const pad = await padController.getOrCreatePad(conversationId, userId);
    
    res.json({
      success: true,
      pad: {
        _id: pad._id,
        content: pad.content || "",
        lastUpdatedBy: pad.lastUpdatedBy,
        updatedAt: pad.updatedAt,
        createdAt: pad.createdAt
      }
    });
  } catch (error) {
    console.error("❌ Erreur récupération Pad:", error);
    
    let status = 500;
    let message = error.message;
    
    if (error.message.includes("Accès non autorisé")) {
      status = 403;
      message = "Vous n'avez pas accès à ce pad";
    }
    
    res.status(status).json({
      success: false,
      error: message
    });
  }
});

// 🎯 UPDATE Pad Content
router.put("/:conversationId/content", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    const { content } = req.body;
    
    // Validation améliorée
    const safeContent = (content === undefined || content === null) ? "" : String(content);
    
    const updatedPad = await padController.updatePadContent(
      conversationId,
      userId,
      safeContent
    );
    
    res.json({
      success: true,
      pad: updatedPad
    });
  } catch (error) {
    console.error("❌ Erreur mise à jour Pad:", error);
    
    let status = 500;
    if (error.message.includes("Accès non autorisé")) {
      status = 403;
    }
    
    res.status(status).json({
      success: false,
      error: error.message
    });
  }
});

export default router;