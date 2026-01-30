// controllers/archiveController.js
import Conversation from "../models/Conversation.js";
import Participants from "../models/Participants.js";
import User from "../models/User.js";
import mongoose from "mongoose";

export const archiveController = {
  // 🆕 ARCHIVER UNE CONVERSATION
  archiveConversation: async (userId, conversationId) => {
    if (
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(conversationId)
    ) {
      throw new Error("IDs invalides");
    }

    // Vérifier que l'utilisateur a accès à la conversation
    const participant = await Participants.findOne({
      Id_User: userId,
      Id_Conversation: conversationId,
    });

    if (!participant) {
      throw new Error("Conversation non trouvée ou accès refusé");
    }

    const conversation = await Conversation.findByIdAndUpdate(
      conversationId,
      {
        $addToSet: {
          archivedBy: {
            userId: userId,
            archivedAt: new Date(),
          },
        },
      },
      { new: true }
    );

    if (!conversation) {
      throw new Error("Conversation non trouvée");
    }

    return conversation;
  },

  // 🆕 DÉSARCHIVER UNE CONVERSATION
  unarchiveConversation: async (userId, conversationId) => {
    if (
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(conversationId)
    ) {
      throw new Error("IDs invalides");
    }

    const conversation = await Conversation.findByIdAndUpdate(
      conversationId,
      {
        $pull: {
          archivedBy: { userId: userId },
        },
      },
      { new: true }
    );

    if (!conversation) {
      throw new Error("Conversation non trouvée");
    }

    return conversation;
  },

  // 🆕 RÉCUPÉRER LES CONVERSATIONS ARCHIVÉES
 // controllers/archiveController.js

getArchivedConversations: async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("ID utilisateur invalide");
  }

  try {
    console.log("📂 Recherche conversations archivées pour userId:", userId);

    // 🔥 ÉTAPE 1 : Récupérer les conversations archivées
    const archivedConvs = await Conversation.find({
      "archivedBy.userId": userId,
    }).sort({ lastMessageAt: -1 });

    console.log(`📊 ${archivedConvs.length} conversations trouvées`);

    // 🔥 ÉTAPE 2 : Récupérer les participants pour chaque conversation
    const archivedConversations = await Promise.all(
      archivedConvs.map(async (conv) => {
        // Récupérer les participants avec leurs users
        const participants = await Participants.find({
          Id_Conversation: conv._id,
        }).populate("Id_User", "username profilePicture _id");

        let conversationName = "Utilisateur";
        let conversationAvatar = "/default-avatar.png";
        let participantsList = [];

        console.log("🔍 Traitement conversation:", {
          id: conv._id,
          type: conv.type,
          participantCount: participants.length
        });

        if (conv.type === "private") {
          // 🔥 Trouver l'AUTRE participant
          const otherParticipant = participants.find(
            (p) => {
              if (!p.Id_User) {
                console.warn("⚠️ Participant sans Id_User:", p);
                return false;
              }
              return String(p.Id_User._id) !== String(userId);
            }
          );

          console.log("👤 Autre participant trouvé:", otherParticipant?.Id_User?.username);

          if (otherParticipant?.Id_User) {
            conversationName = otherParticipant.Id_User.username || "Utilisateur";
            conversationAvatar = otherParticipant.Id_User.profilePicture || "/default-avatar.png";
            
            participantsList = participants
              .filter(p => p.Id_User)
              .map((p) => ({
                _id: p.Id_User._id,
                username: p.Id_User.username,
                profilePicture: p.Id_User.profilePicture,
              }));
          }
        } else if (conv.type === "group") {
          conversationName = conv.groupName || "Groupe";
          conversationAvatar = conv.groupPic || "/group-avatar.png";
          
          participantsList = participants
            .filter(p => p.Id_User)
            .map((p) => ({
              _id: p.Id_User._id,
              username: p.Id_User.username,
              profilePicture: p.Id_User.profilePicture,
            }));
        }

        // 🔥 Trouver la date d'archivage
        const archiveInfo = conv.archivedBy.find(
          (a) => String(a.userId) === String(userId)
        );

        // 🔥 Trouver le rôle de l'utilisateur actuel
        const myParticipant = participants.find(
          (p) => p.Id_User && String(p.Id_User._id) === String(userId)
        );

        const result = {
          _id: conv._id,
          type: conv.type,
          name: conversationName,
          isGroup: conv.type === "group",
          groupName: conv.type === "group" ? conv.groupName : undefined,
          groupPic: conv.type === "group" ? conv.groupPic : undefined,
          avatar: conversationAvatar,
          participants: participantsList,
          unreadCount:
            conv.unreadCounts?.find(
              (u) => u.userId && String(u.userId) === String(userId)
            )?.count || 0,
          lastMessageAt: conv.lastMessageAt,
          archivedAt: archiveInfo?.archivedAt,
          participantCount: participants.length,
          role: myParticipant?.Role || "membre",
          isFromArchived: true,
        };

        console.log("✅ Conversation formatée:", {
          id: result._id,
          name: result.name,
          avatar: result.avatar
        });

        return result;
      })
    );

    console.log(`✅ ${archivedConversations.length} conversations archivées retournées`);
    return archivedConversations;

  } catch (error) {
    console.error("❌ Erreur dans getArchivedConversations:", error);
    throw error;
  }
},

  // 🆕 VÉRIFIER SI UNE CONVERSATION EST ARCHIVÉE
  isConversationArchived: async (userId, conversationId) => {
    if (
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(conversationId)
    ) {
      return false;
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      "archivedBy.userId": userId,
    });

    return !!conversation;
  },

  // 🆕 RÉCUPÉRER LE NOMBRE DE CONVERSATIONS ARCHIVÉES
  getArchivedCount: async (userId) => {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("ID utilisateur invalide");
    }

    const userParticipants = await Participants.find({
      Id_User: userId,
    }).populate({
      path: "Id_Conversation",
      match: {
        "archivedBy.userId": userId,
      },
    });

    return userParticipants.filter((p) => p.Id_Conversation !== null).length;
  },
};
