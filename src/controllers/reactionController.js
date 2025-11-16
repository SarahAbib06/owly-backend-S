// src/controllers/reactionController.js
import Reaction from "../models/Reaction.js";
import Message from "../models/Message.js";

// Ajouter une réaction
export const addReaction = async (req, res) => {
  try {
    const { messageId, emoji } = req.body;
    const userId = req.userId;

    console.log("🐛 DEBUG: Début de addReaction");
    console.log("📦 Données reçues:", { messageId, emoji, userId });

    // Vérifier si le message existe
    const message = await Message.findById(messageId);
    if (!message) {
      console.log("❌ Message non trouvé");
      return res.status(404).json({ error: "Message non trouvé" });
    }

    // ⭐⭐ NOUVELLE VÉRIFICATION : Voir s'il y a déjà une réaction
    console.log("🔍 Recherche des réactions existantes...");

    const existingReaction = await Reaction.findOne({
      Id_message: messageId,
      id_user: userId,
    });

    console.log("🔍 Réaction existante trouvée:", existingReaction);

    if (existingReaction) {
      console.log(
        "❌ BLOQUÉ: Réaction existe déjà pour user",
        userId,
        "sur message",
        messageId
      );
      return res.status(400).json({
        error: "Vous avez déjà réagi à ce message",
      });
    }

    console.log("✅ OK: Aucune réaction existante, création...");

    // Créer la réaction
    const reaction = new Reaction({
      Id_message: messageId,
      id_user: userId,
      emoji,
    });

    await reaction.save();
    await reaction.populate("id_user", "username avatar");

    console.log("🎉 SUCCÈS: Réaction créée avec ID:", reaction._id);

    res.status(201).json({
      success: true,
      data: reaction,
    });
  } catch (error) {
    console.log("💥 ERREUR DÉTAILLÉE:", {
      code: error.code,
      message: error.message,
      stack: error.stack,
    });

    if (error.code === 11000) {
      return res.status(400).json({
        error: "Vous avez déjà réagi à ce message (erreur index unique)",
      });
    }
    res.status(500).json({ error: error.message });
  }
};

// Supprimer une réaction
export const removeReaction = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.userId; // ⬅️ Ici aussi

    const reaction = await Reaction.findOneAndDelete({
      Id_message: messageId,
      id_user: userId,
    });

    if (!reaction) {
      return res.status(404).json({ error: "Réaction non trouvée" });
    }

    res.json({ message: "Réaction supprimée" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Obtenir les réactions d'un message
export const getMessageReactions = async (req, res) => {
  try {
    const { messageId } = req.params;

    const reactions = await Reaction.find({ Id_message: messageId })
      .populate("id_user", "username avatar")
      .sort({ time: -1 });

    res.json(reactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
