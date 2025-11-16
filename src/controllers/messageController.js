import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";
import Participants from "../models/Participants.js";
import User from "../models/User.js";
import Users from "../models/Users.js";
import Notification from "../models/Notification.js";

// Envoyer un message
export const sendMessage = async (req, res) => {
  try {
    const { conversationId, content, typeMessage = "text" } = req.body;
    const senderId = req.userId;

    console.log("=== ENVOI MESSAGE ===");
    console.log("Conversation:", conversationId);
    console.log("Contenu:", content);
    console.log("Type:", typeMessage);
    console.log("Expéditeur:", senderId);

    // Validation
    if (!conversationId || !content) {
      return res.status(400).json({
        message: "ID de conversation et contenu sont requis",
      });
    }

    if (content.trim().length === 0) {
      return res.status(400).json({
        message: "Le message ne peut pas être vide",
      });
    }

    // Vérifier si l'utilisateur fait partie de la conversation
    const participant = await Participants.findOne({
      Id_Conversation: conversationId,
      Id_User: senderId,
    });

    if (!participant) {
      return res.status(403).json({
        message: "Vous n'êtes pas membre de cette conversation",
      });
    }

    console.log("✅ Accès autorisé à la conversation");

    // Créer le message
    const newMessage = new Message({
      conversationId,
      Id_sender: senderId,
      content: content.trim(),
      typeMessage,
      status: "sent",
    });

    await newMessage.save();
    console.log("✅ Message créé:", newMessage._id);

    // Mettre à jour la conversation avec le dernier message
    await Conversation.findByIdAndUpdate(conversationId, {
      Id_message: newMessage._id,
      LastMessageRead: content.substring(0, 100), // Limiter à 100 caractères
      media: typeMessage,
    });

    console.log("✅ Conversation mise à jour");

    // Créer des notifications pour les autres participants
    const conversationParticipants = await Participants.find({
      Id_Conversation: conversationId,
      Id_User: { $ne: senderId },
    }).populate("Id_User");

    console.log(
      `👥 ${conversationParticipants.length} participants à notifier`
    );

    for (const part of conversationParticipants) {
      const notification = new Notification({
        userId: part.Id_User._id,
        fromUser: senderId,
        toUser: part.Id_User._id,
        type: "message",
        content: `Vous a envoyé un message: ${content.substring(0, 50)}...`,
        messageId: newMessage._id,
      });
      await notification.save();
      console.log(`✅ Notification créée pour: ${part.Id_User.username}`);
    }

    // Populer le message pour la réponse
    const populatedMessage = await Message.findById(newMessage._id)
      .populate("Id_sender", "username photo status")
      .populate("conversationId");

    console.log("=== MESSAGE ENVOYÉ AVEC SUCCÈS ===");

    res.status(201).json({
      message: "Message envoyé avec succès",
      message: populatedMessage,
    });
  } catch (error) {
    console.error("❌ Error sending message:", error);
    res.status(500).json({
      message: "Erreur lors de l'envoi du message",
      error: error.message,
    });
  }
};

// Récupérer les messages d'une conversation
export const getConversationMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;

    console.log("=== RÉCUPÉRATION MESSAGES ===");
    console.log("Conversation:", conversationId);
    console.log("Utilisateur:", userId);

    // Vérifier l'accès à la conversation
    const participant = await Participants.findOne({
      Id_Conversation: conversationId,
      Id_User: userId,
    });

    if (!participant) {
      return res.status(403).json({
        message: "Accès non autorisé à cette conversation",
      });
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    console.log(`📄 Page: ${page}, Limit: ${limit}, Skip: ${skip}`);

    // Récupérer les messages
    const messages = await Message.find({ conversationId })
      .populate("Id_sender", "username photo status")
      .sort({ time: -1 }) // Plus récent en premier
      .skip(skip)
      .limit(limit);

    // Compter le total des messages
    const totalMessages = await Message.countDocuments({ conversationId });
    const totalPages = Math.ceil(totalMessages / limit);

    console.log(
      `✅ ${messages.length} messages récupérés sur ${totalMessages} total`
    );

    // Inverser l'ordre pour avoir le plus ancien en premier
    const sortedMessages = messages.reverse();

    res.json({
      messages: sortedMessages,
      pagination: {
        currentPage: page,
        totalPages,
        totalMessages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("❌ Error getting messages:", error);
    res.status(500).json({
      message: "Erreur lors de la récupération des messages",
      error: error.message,
    });
  }
};

// Marquer un message comme lu
export const markAsRead = async (req, res) => {
  try {
    const { messageId } = req.body;
    const userId = req.userId;

    console.log("=== MARQUER COMME LU ===");
    console.log("Message:", messageId);
    console.log("Utilisateur:", userId);

    // Trouver le message
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message non trouvé" });
    }

    // Trouver le participant correspondant
    const participant = await Participants.findOne({
      Id_Conversation: message.conversationId,
      Id_User: userId,
    });

    if (!participant) {
      return res.status(403).json({
        message: "Accès non autorisé à ce message",
      });
    }

    // Marquer comme lu
    const updatedMessage = await Message.findByIdAndUpdate(
      messageId,
      {
        $addToSet: { readBy: participant._id },
        status: "seen",
      },
      { new: true }
    )
      .populate("Id_sender", "username photo status")
      .populate("readBy");

    console.log("✅ Message marqué comme lu");

    res.json({
      message: "Message marqué comme lu",
      message: updatedMessage,
    });
  } catch (error) {
    console.error("❌ Error marking message as read:", error);
    res.status(500).json({
      message: "Erreur lors du marquage du message",
      error: error.message,
    });
  }
};

// Marquer tous les messages comme lus dans une conversation
export const markAllAsRead = async (req, res) => {
  try {
    const { conversationId } = req.body;
    const userId = req.userId;

    console.log("=== MARQUER TOUS COMME LUS ===");

    // Vérifier l'accès
    const participant = await Participants.findOne({
      Id_Conversation: conversationId,
      Id_User: userId,
    });

    if (!participant) {
      return res.status(403).json({
        message: "Accès non autorisé",
      });
    }

    // Marquer tous les messages non lus
    const result = await Message.updateMany(
      {
        conversationId,
        readBy: { $ne: participant._id },
        Id_sender: { $ne: userId }, // Ne pas marquer ses propres messages
      },
      {
        $addToSet: { readBy: participant._id },
        status: "seen",
      }
    );

    console.log(`✅ ${result.modifiedCount} messages marqués comme lus`);

    res.json({
      message: `${result.modifiedCount} messages marqués comme lus`,
      updatedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("❌ Error marking all as read:", error);
    res.status(500).json({
      message: "Erreur lors du marquage des messages",
      error: error.message,
    });
  }
};

// Supprimer un message
export const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.userId;

    console.log("=== SUPPRESSION MESSAGE ===");

    // Trouver le message
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message non trouvé" });
    }

    // Vérifier que l'utilisateur est l'expéditeur
    if (message.Id_sender.toString() !== userId) {
      return res.status(403).json({
        message: "Vous ne pouvez supprimer que vos propres messages",
      });
    }

    // Vérifier que le message n'a pas plus de 5 minutes
    const messageAge = Date.now() - new Date(message.time).getTime();
    const fiveMinutes = 5 * 60 * 1000;

    if (messageAge > fiveMinutes) {
      return res.status(403).json({
        message:
          "Vous ne pouvez supprimer que les messages de moins de 5 minutes",
      });
    }

    await Message.findByIdAndDelete(messageId);

    console.log("✅ Message supprimé");

    res.json({ message: "Message supprimé avec succès" });
  } catch (error) {
    console.error("❌ Error deleting message:", error);
    res.status(500).json({
      message: "Erreur lors de la suppression du message",
      error: error.message,
    });
  }
};

// Récupérer les messages non lus
export const getUnreadMessages = async (req, res) => {
  try {
    const userId = req.userId;

    console.log("=== MESSAGES NON LUS ===");

    // Trouver toutes les conversations de l'utilisateur
    const userParticipants = await Participants.find({ Id_User: userId });
    const conversationIds = userParticipants.map((p) => p.Id_Conversation);

    // Pour chaque conversation, compter les messages non lus
    const unreadCounts = await Promise.all(
      conversationIds.map(async (convId) => {
        const participant = await Participants.findOne({
          Id_Conversation: convId,
          Id_User: userId,
        });

        const unreadCount = await Message.countDocuments({
          conversationId: convId,
          readBy: { $ne: participant._id },
          Id_sender: { $ne: userId }, // Exclure ses propres messages
        });

        return {
          conversationId: convId,
          unreadCount,
        };
      })
    );

    const totalUnread = unreadCounts.reduce(
      (sum, item) => sum + item.unreadCount,
      0
    );

    console.log(`✅ ${totalUnread} messages non lus au total`);

    res.json({
      totalUnread,
      byConversation: unreadCounts,
    });
  } catch (error) {
    console.error("❌ Error getting unread messages:", error);
    res.status(500).json({
      message: "Erreur lors de la récupération des messages non lus",
      error: error.message,
    });
  }
};
