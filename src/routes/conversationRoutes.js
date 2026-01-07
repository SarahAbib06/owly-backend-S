import express from "express";
import Conversation from "../models/Conversation.js";
import Participants from "../models/Participants.js";
import { conversationController } from "../controllers/conversationController.js";
import mongoose from "mongoose";
import { protact } from "../middleware/authen.js";

const router = express.Router();

// 🆕 CRÉER / OBTENIR UNE CONVERSATION PRIVÉE
router.post("/private", protact, async (req, res) => {
  try {
    const { receiverId } = req.body;
    const senderId = req.user._id;

    if (!receiverId) {
      return res.status(400).json({
        success: false,
        error: "receiverId requis",
      });
    }

    // Si receiverId est un ID de conversation (24 caractères hex), c'est un appel inutile → ignore
    if (mongoose.Types.ObjectId.isValid(receiverId)) {
      const existingConv = await Conversation.findById(receiverId);
      if (existingConv && existingConv.type === "private") {
        // C'est une conversation existante → retourne-la sans rien faire
        return res.json({
          success: true,
          conversation: existingConv,
        });
      }
    }

    const conversation = await conversationController.getOrCreateConversation(
      senderId,
      receiverId
    );

    res.json({
      success: true,
      conversation,
    });
  } catch (error) {
    console.error("❌ Erreur création conversation privée:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 🆕 ROUTE POUR CRÉER UN GROUPE
router.post("/groups/create", protact, async (req, res) => {
  try {
    const { participantIds, groupName } = req.body;
    const creatorId = req.user._id;

    if (!participantIds || !groupName) {
      return res.status(400).json({
        success: false,
        error: "participantIds et groupName sont requis",
      });
    }

    console.log(`👥 Création groupe: ${groupName} par ${creatorId}`);

    const group = await conversationController.createGroupConversation(
      creatorId,
      participantIds,
      groupName
    );

    res.json({
      success: true,
      group: {
        _id: group._id,
        name: group.groupName,
        type: group.type,
        participantCount: group.Id_participant.length,
      },
    });
  } catch (error) {
    console.error("❌ Erreur création groupe:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 🆕 ROUTE POUR RÉCUPÉRER LES GROUPES D'UN USER
router.get("/groups/user/:userId", protact, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: "Non autorisé à voir les groupes d'un autre utilisateur",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        error: "ID utilisateur invalide",
      });
    }

    console.log(`📂 Récupération groupes pour user: ${userId}`);

    const groups = await conversationController.getUserGroups(userId);

    res.json({
      success: true,
      groups: groups,
    });
  } catch (error) {
    console.error("❌ Erreur récupération groupes:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 🆕 ROUTE POUR RÉCUPÉRER LES COMPTEURS NON-LUS D'UN USER
router.get("/unread-counts/:userId", protact, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: "Non autorisé à voir les compteurs d'un autre utilisateur",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        error: "ID utilisateur invalide",
      });
    }

    console.log(`🔢 Récupération compteurs non-lus pour user: ${userId}`);

    const userConversations = await Participants.find({
      Id_User: userId,
    }).populate("Id_Conversation");

    let totalUnread = 0;
    const conversationCounts = [];

    for (let participant of userConversations) {
      const conversation = participant.Id_Conversation;

      if (conversation && conversation.unreadCounts) {
        const userCount = conversation.unreadCounts.find(
          (u) => u.userId && u.userId.toString() === userId
        );

        const count = userCount ? userCount.count : 0;
        totalUnread += count;

        conversationCounts.push({
          conversationId: conversation._id,
          unreadCount: count,
          conversationType: conversation.type,
          conversationName:
            conversation.type === "group" ? conversation.groupName : null,
        });
      }
    }

    console.log(`✅ ${totalUnread} messages non-lus au total`);

    res.json({
      success: true,
      totalUnread: totalUnread,
      conversationCounts: conversationCounts,
    });
  } catch (error) {
    console.error("❌ Erreur récupération compteurs:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 🆕 ROUTE POUR MARQUER UNE CONVERSATION COMME LUE
router.post("/mark-as-read/:conversationId", protact, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({
        success: false,
        error: "ID conversation invalide",
      });
    }

    console.log(
      `📖 Marquage comme lu - Conversation: ${conversationId}, User: ${userId}`
    );

    const result = await Conversation.findOneAndUpdate(
      {
        _id: conversationId,
        "unreadCounts.userId": userId,
      },
      {
        $set: { "unreadCounts.$.count": 0 },
      },
      { new: true }
    );

    if (!result) {
      console.log("⚠️ Conversation non trouvée ou user pas dans les compteurs");
    }

    console.log("✅ Conversation marquée comme lue");

    res.json({
      success: true,
      message: "Conversation marquée comme lue",
      conversationId: conversationId,
    });
  } catch (error) {
    console.error("❌ Erreur marquage comme lu:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 🆕 ROUTE POUR RÉCUPÉRER LES CONVERSATIONS D'UN USER
// 🆕 ROUTE POUR RÉCUPÉRER LES CONVERSATIONS ARCHIVÉES (avec vrai nom + avatar)
// 🆕 ROUTE CORRIGÉE POUR LES ARCHIVES : même format que les conversations normales
router.get("/user/:userId", protact, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id.toString();

    if (userId !== currentUserId) {
      return res.status(403).json({
        success: false,
        error: "Non autorisé",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        error: "ID invalide",
      });
    }

    console.log(`Récupération des conversations ARCHIVÉES pour ${userId}`);

    // Même logique que la route principale GET /, mais on filtre sur les archivées
    const userParticipants = await Participants.find({
      Id_User: userId,
    })
      .populate({
        path: "Id_Conversation",
        match: {
          "archivedBy.userId": userId, // ← SEULEMENT les conversations archivées par cet utilisateur
          "deletedBy.userId": { $ne: userId }, // optionnel : exclure les supprimées
        },
      })
      .populate("Id_User", "username profilePicture");

    const validParticipants = userParticipants.filter(p => p.Id_Conversation !== null);

    const formattedConversations = await Promise.all(
      validParticipants.map(async (participant) => {
        const conv = participant.Id_Conversation;

        // Récupérer tous les participants de la conversation
        const allParticipants = await Participants.find({
          Id_Conversation: conv._id,
        }).populate("Id_User", "username profilePicture");

        let conversationName = "Utilisateur";
        let conversationAvatar = "/default-avatar.png";

        if (conv.type === "private") {
          const otherParticipant = allParticipants.find(
            p => p.Id_User._id.toString() !== currentUserId
          );
          conversationName = otherParticipant?.Id_User?.username || "Utilisateur";
          conversationAvatar = otherParticipant?.Id_User?.profilePicture || "/default-avatar.png";
        } else if (conv.type === "group") {
          conversationName = conv.groupName || "Groupe sans nom";
          conversationAvatar = "/default-group-avatar.png";
        }

        const userUnread = conv.unreadCounts?.find(
          u => u.userId?.toString() === currentUserId
        );

        return {
          _id: conv._id,
          type: conv.type,
          name: conversationName,
          avatar: conversationAvatar,
          unreadCount: userUnread?.count || 0,
          lastMessageAt: conv.lastMessageAt,
          createdAt: conv.createdAt,
          participants: allParticipants.map(p => p.Id_User),
          isArchived: true, // très important pour l'UI
          myRole: participant.Role,
        };
      })
    );

    // Tri par date (plus récent en haut)
    formattedConversations.sort((a, b) => 
      new Date(b.lastMessageAt || b.createdAt) - new Date(a.lastMessageAt || a.createdAt)
    );

    res.json({
      success: true,
      conversations: formattedConversations,
      count: formattedConversations.length,
    });
  } catch (error) {
    console.error("Erreur récupération archives:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 🗑️ SUPPRIMER UNE CONVERSATION (UNIQUEMENT POUR MOI)
router.delete("/:conversationId", protact, async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        error: "Utilisateur non authentifié (req.user manquant)"
      });
    }

    const userId = req.user._id;
    const { conversationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ success: false, error: "ID conversation invalide" });
    }

    console.log(`[DELETE] Tentative suppression conv ${conversationId} par user ${userId}`);

    const participant = await Participants.findOne({
      Id_User: userId,
      Id_Conversation: conversationId
    });

    if (!participant) {
      return res.status(403).json({
        success: false,
        error: "Vous ne participez pas à cette conversation"
      });
    }

    // Soft delete : on supprime juste l’entrée participant
    await Participants.deleteOne({
      Id_User: userId,
      Id_Conversation: conversationId
    });

    // Option : si plus personne dans la conv → supprimer tout (facultatif)
    const remaining = await Participants.countDocuments({ Id_Conversation: conversationId });
    if (remaining === 0) {
      await Conversation.findByIdAndDelete(conversationId);
      // await Message.deleteMany({ conversationId }); // ← à activer si tu veux
      console.log(`Conv ${conversationId} supprimée totalement (plus de participants)`);
    }

    // Émission socket
    req.io?.to(`user_${userId}`).emit("conversation_deleted", { conversationId });

    res.json({
      success: true,
      message: "Conversation supprimée de votre liste"
    });

  } catch (error) {
    console.error("[DELETE ERROR]", error);
    res.status(500).json({
      success: false,
      error: error.message || "Erreur serveur interne"
    });
  }
});

// 🆕 ROUTE CORRIGÉE : UTILISER LA TABLE PARTICIPANTS
router.get("/", protact, async (req, res) => {
  try {
    const userId = req.user._id;

    console.log(`📂 Récupération conversations pour user: ${userId}`);

    // 🎯 UTILISER LA TABLE PARTICIPANTS (qui contient les vraies données)
    const userParticipants = await Participants.find({
      Id_User: userId,
    })
      .populate({
        path: "Id_Conversation",
        match: {
          "archivedBy.userId": { $ne: userId }, // 🆕 EXCLURE LES CONVERSATIONS ARCHIVÉES
          "deletedBy.userId": { $ne: userId },
        },
      })
      .populate("Id_User", "username profilePicture");

    console.log("🔍 DEBUG - Participants trouvés:", userParticipants.length);

    // 🆕 FILTRER D'ABORD LES PARTICIPANTS AVEC CONVERSATIONS NON NULL
    const validParticipants = userParticipants.filter(
      (p) => p.Id_Conversation !== null
    );

    console.log(
      `🔍 DEBUG - Conversations non archivées: ${validParticipants.length}`
    );

    const formattedConversations = await Promise.all(
      validParticipants.map(async (participant) => {
        const conv = participant.Id_Conversation;

        // 🎯 RÉCUPÉRER TOUS LES PARTICIPANTS DE CETTE CONVERSATION
        const allParticipants = await Participants.find({
          Id_Conversation: conv._id,
        }).populate("Id_User", "username profilePicture");

        const userUnread = conv.unreadCounts?.find(
          (u) => u.userId && u.userId.toString() === userId.toString()
        );

        let conversationName = null;
        if (conv.type === "private") {
          // 🎯 TROUVER L'AUTRE USER DANS LES PARTICIPANTS
          const otherParticipant = allParticipants.find(
            (p) => p.Id_User._id.toString() !== userId.toString()
          );
          conversationName =
            otherParticipant?.Id_User?.username || "Utilisateur";
        } else {
          conversationName = conv.groupName;
        }

        return {
          _id: conv._id,
          type: conv.type,
          name: conversationName,
          unreadCount: userUnread?.count || 0,
          lastMessageAt: conv.lastMessageAt,
          participants: allParticipants.map((p) => p.Id_User), // 🎯 TOUS LES PARTICIPANTS
          createdAt: conv.createdAt,
          myRole: participant.Role, // 🎯 TON RÔLE DANS CETTE CONVERSATION
        };
      })
    );

    console.log(
      `✅ ${formattedConversations.length} conversations non archivées trouvées`
    );

    res.json({
      success: true,
      conversations: formattedConversations,
    });
  } catch (error) {
    console.error("❌ Erreur récupération conversations:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;