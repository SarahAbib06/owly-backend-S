import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";
import Participants from "../models/Participants.js";
import Notification from "../models/Notification.js";
import fs from "fs";
import path from "path";

// 🔊 FONCTION PRINCIPALE : ENVOYER UN MESSAGE AUDIO
export const sendAudioMessage = async (req, res) => {
  console.log("🎯 DÉBUT sendAudioMessage");

  try {
    const { conversationId } = req.body;
    const senderId = req.userId;

    // 📋 VALIDATION DES DONNÉES
    console.log("📋 Validation des données...");
    console.log("- Conversation ID:", conversationId);
    console.log("- Sender ID:", senderId);
    console.log("- Fichier reçu:", req.file ? req.file.filename : "AUCUN");

    if (!conversationId) {
      // Nettoyer le fichier uploadé si erreur
      if (req.file) {
        fs.unlinkSync(req.file.path);
        console.log("🗑️ Fichier nettoyé (conversationId manquant)");
      }
      return res.status(400).json({
        message: "ID de conversation requis",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "Fichier audio requis",
      });
    }

    // 🔐 VÉRIFICATION ACCÈS CONVERSATION
    console.log("🔐 Vérification accès conversation...");
    const participant = await Participants.findOne({
      Id_Conversation: conversationId,
      Id_User: senderId,
    });

    if (!participant) {
      // Nettoyer le fichier uploadé si accès refusé
      if (req.file) {
        fs.unlinkSync(req.file.path);
        console.log("🗑️ Fichier nettoyé (accès refusé)");
      }
      return res.status(403).json({
        message: "Vous n'êtes pas membre de cette conversation",
      });
    }
    console.log("✅ Accès autorisé à la conversation");

    // ⏱️ CALCULER LA DURÉE AUDIO (ESTIMATION)
    console.log("⏱️ Calcul durée audio...");
    const audioDuration = await calculateAudioDuration(req.file);
    console.log("- Durée estimée:", audioDuration, "secondes");

    // 💾 CRÉATION DU MESSAGE AUDIO DANS LA BASE
    console.log("💾 Création du message en base...");
    const newMessage = new Message({
      conversationId,
      Id_sender: senderId,
      typeMessage: "audio",
      audioUrl: `/uploads/audio/${req.file.filename}`, // Chemin d'accès
      audioDuration: audioDuration,
      fileSize: req.file.size,
      fileName: req.file.originalname,
      content: `Message audio (${formatDuration(audioDuration)})`, // Texte de fallback
    });

    await newMessage.save();
    console.log("✅ Message audio créé - ID:", newMessage._id);

    // 🔄 METTRE À JOUR LA CONVERSATION
    console.log("🔄 Mise à jour conversation...");
    await Conversation.findByIdAndUpdate(conversationId, {
      Id_message: newMessage._id,
      LastMessageRead: "🎤 Message audio",
      media: "audio",
    });
    console.log("✅ Conversation mise à jour");

    // 🔔 CRÉER DES NOTIFICATIONS POUR LES AUTRES PARTICIPANTS
    console.log("🔔 Création notifications...");
    const conversationParticipants = await Participants.find({
      Id_Conversation: conversationId,
      Id_User: { $ne: senderId }, // Exclure l'expéditeur
    }).populate("Id_User");

    console.log(`- ${conversationParticipants.length} participants à notifier`);

    for (const part of conversationParticipants) {
      const notification = new Notification({
        userId: part.Id_User._id,
        fromUser: senderId,
        toUser: part.Id_User._id,
        type: "message", // ← UTILISER UN TYPE EXISTANT
        content: `Vous a envoyé un message audio 🎤`,
        messageId: newMessage._id,
      });
      await notification.save();
      console.log(`- Notification créée pour: ${part.Id_User.username}`);
    }

    // 📦 POPULER LE MESSAGE POUR LA RÉPONSE
    console.log("📦 Préparation réponse...");
    const populatedMessage = await Message.findById(newMessage._id)
      .populate("Id_sender", "username photo status")
      .populate("conversationId");

    console.log("🎉 MESSAGE AUDIO ENVOYÉ AVEC SUCCÈS");

    // ✅ RÉPONSE FINALE
    res.status(201).json({
      message: "Message audio envoyé avec succès",
      data: populatedMessage, // Renommé de "message" à "data" pour éviter la confusion
    });
  } catch (error) {
    console.error("❌ ERREUR sendAudioMessage:", error);

    // 🗑️ NETTOYAGE EN CAS D'ERREUR
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
      console.log("🗑️ Fichier nettoyé (erreur)");
    }

    res.status(500).json({
      message: "Erreur lors de l'envoi du message audio",
      error: error.message,
    });
  }
};

// ⏱️ FONCTION : CALCULER LA DURÉE AUDIO (ESTIMATION)
const calculateAudioDuration = async (file) => {
  try {
    console.log("🎵 Calcul durée audio pour:", file.filename);

    // En production, utiliser une lib comme node-ffprobe ou fluent-ffmpeg
    // Pour le MVP, estimation basée sur la taille

    const sizeInMB = file.size / (1024 * 1024);
    console.log("- Taille fichier:", sizeInMB.toFixed(2), "MB");

    // Estimation : 1MB ≈ 1 minute pour de la voix compressée en WebM/Opus
    const estimatedMinutes = sizeInMB;
    const estimatedSeconds = Math.round(estimatedMinutes * 60);

    // Limiter entre 1 seconde et 5 minutes (300 secondes)
    const finalDuration = Math.max(1, Math.min(estimatedSeconds, 300));

    console.log("- Durée estimée:", finalDuration, "secondes");
    return finalDuration;
  } catch (error) {
    console.log("⚠️ Erreur calcul durée, utilisation valeur par défaut");
    return 30; // 30 secondes par défaut
  }
};

// 🕒 FONCTION : FORMATER LA DURÉE (minutes:secondes)
const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

// 📄 FONCTION : RÉCUPÉRER LES INFOS D'UN MESSAGE AUDIO
export const getAudioInfo = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.userId;

    console.log("📄 Récupération infos audio - Message ID:", messageId);

    // 🔍 CHERCHER LE MESSAGE
    const message = await Message.findById(messageId).populate(
      "Id_sender",
      "username photo"
    );

    if (!message) {
      return res.status(404).json({
        message: "Message non trouvé",
      });
    }

    if (message.typeMessage !== "audio") {
      return res.status(400).json({
        message: "Ce message n'est pas un message audio",
      });
    }

    // 🔐 VÉRIFIER L'ACCÈS
    const participant = await Participants.findOne({
      Id_Conversation: message.conversationId,
      Id_User: userId,
    });

    if (!participant) {
      return res.status(403).json({
        message: "Accès non autorisé à ce message",
      });
    }

    // ✅ RÉPONSE AVEC LES INFOS AUDIO
    res.json({
      messageId: message._id,
      audioUrl: message.audioUrl,
      duration: message.audioDuration,
      fileSize: message.fileSize,
      fileName: message.fileName,
      sentAt: message.time,
      sender: message.Id_sender,
      conversationId: message.conversationId,
    });
  } catch (error) {
    console.error("❌ Error getting audio info:", error);
    res.status(500).json({
      message: "Erreur lors de la récupération des informations audio",
      error: error.message,
    });
  }
};

// 🗑️ FONCTION : SUPPRIMER UN MESSAGE AUDIO (ET LE FICHIER)
export const deleteAudioMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.userId;

    console.log("🗑️ Suppression message audio - ID:", messageId);

    // 🔍 TROUVER LE MESSAGE
    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: "Message non trouvé" });
    }

    if (message.typeMessage !== "audio") {
      return res.status(400).json({
        message: "Ce message n'est pas un message audio",
      });
    }

    // 🔐 VÉRIFIER LES PERMISSIONS
    if (message.Id_sender.toString() !== userId) {
      return res.status(403).json({
        message: "Vous ne pouvez supprimer que vos propres messages audio",
      });
    }

    // 🗑️ SUPPRIMER LE FICHIER PHYSIQUE
    if (message.audioUrl) {
      const filePath = `.${message.audioUrl}`; // Chemin relatif
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log("✅ Fichier audio supprimé:", filePath);
      }
    }

    // 🗑️ SUPPRIMER LE MESSAGE DE LA BASE
    await Message.findByIdAndDelete(messageId);
    console.log("✅ Message audio supprimé de la base");

    res.json({
      message: "Message audio supprimé avec succès",
    });
  } catch (error) {
    console.error("❌ Error deleting audio message:", error);
    res.status(500).json({
      message: "Erreur lors de la suppression du message audio",
      error: error.message,
    });
  }
};
