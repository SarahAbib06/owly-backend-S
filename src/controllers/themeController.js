// src/controllers/themeController.js 
import Conversation from "../models/Conversation.js";

// Fonction pour émettre les changements de thème via Socket.io
const emitThemeUpdate = (io, conversationId, themeData) => {
  io.to(conversationId.toString()).emit("themeChanged", {
    conversationId,
    theme: themeData,
    timestamp: new Date(),
  });

  console.log(`🎨 Thème diffusé pour la conversation: ${conversationId}`);
};

// Appliquer ou mettre à jour un thème
export const applyTheme = async (req, res) => {
  try {
    const { conversationId, type, value, emojis, name } = req.body;

    // Extraire l'userId
    const userId = req.user?.userId || req.user?.id;

    console.log("🎨 DEBUG: Début de applyTheme");
    console.log("📦 Données reçues:", { conversationId, type, value, userId });

    if (!userId) {
      return res.status(401).json({
        error: "User ID manquant - Authentification requise",
      });
    }

    // Trouver la conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation non trouvée" });
    }

    // Vérifier que l'utilisateur fait partie de la conversation
    const isParticipant = conversation.participants.some(
      (p) => p.toString() === userId.toString()
    ) || conversation.Id_participant.some(
      (p) => p.toString() === userId.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({
        error: "Vous ne faites pas partie de cette conversation",
      });
    }

    // Mettre à jour le thème directement dans la conversation
    conversation.theme = {
      type,
      value,
      emojis: emojis || [],
      appliedBy: userId,
      appliedAt: new Date(),
      name: name || null,
    };

    await conversation.save();
    console.log("✅ Thème mis à jour dans la conversation:", conversationId);

    // Diffuser le changement via Socket.io
    const io = req.app.get("io");
    if (io) {
      emitThemeUpdate(io, conversationId, {
        type: conversation.theme.type,
        value: conversation.theme.value,
        emojis: conversation.theme.emojis,
        name: conversation.theme.name,
      });
    }

    res.status(200).json({
      success: true,
      message: "Thème appliqué avec succès",
      data: conversation.theme,
    });
  } catch (error) {
    console.log("💥 ERREUR:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// Récupérer le thème d'une conversation
export const getTheme = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId)
      .select("theme")
      .populate("theme.appliedBy", "username avatar");

    if (!conversation) {
      return res.status(404).json({ error: "Conversation non trouvée" });
    }

    if (!conversation.theme || !conversation.theme.type) {
      return res.status(404).json({
        success: false,
        message: "Aucun thème défini pour cette conversation",
      });
    }

    res.json({
      success: true,
      data: conversation.theme,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Supprimer le thème (revenir au thème par défaut)
export const removeTheme = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user?.userId || req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Authentification requise" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation non trouvée" });
    }

    // Vérifier que l'utilisateur fait partie de la conversation
    const isParticipant = conversation.participants.some(
      (p) => p.toString() === userId.toString()
    ) || conversation.Id_participant.some(
      (p) => p.toString() === userId.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({
        error: "Vous ne faites pas partie de cette conversation",
      });
    }

    // Réinitialiser le thème
    conversation.theme = {
      type: null,
      value: null,
      emojis: [],
      appliedBy: null,
      appliedAt: null,
      name: null,
    };

    await conversation.save();

    // Diffuser la suppression via Socket.io
    const io = req.app.get("io");
    if (io) {
      io.to(conversationId.toString()).emit("themeRemoved", {
        conversationId,
        timestamp: new Date(),
      });
    }

    res.json({
      success: true,
      message: "Thème supprimé avec succès",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};