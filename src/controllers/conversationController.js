import Conversation from "../models/Conversation.js";
import Participants from "../models/Participants.js";
import User from "../models/User.js";
import Users from "../models/Users.js";
import Message from "../models/Message.js";

// Créer ou récupérer une conversation privée
export const getOrCreatePrivateConversation = async (req, res) => {
  try {
    const { userId2 } = req.body;
    const userId1 = req.userId;

    console.log("=== CRÉATION CONVERSATION PRIVÉE ===");
    console.log("User1:", userId1, "User2:", userId2);

    // Validation
    if (!userId2) {
      return res
        .status(400)
        .json({ message: "ID du second utilisateur requis" });
    }

    if (userId1 === userId2) {
      return res.status(400).json({
        message: "Impossible de créer une conversation avec soi-même",
      });
    }

    // Vérifier si les utilisateurs existent
    const user1 = await Users.findById(userId1);
    const user2 = await Users.findById(userId2);

    if (!user1 || !user2) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    console.log("Utilisateurs trouvés:", user1.username, user2.username);

    // Chercher une conversation privée existante
    const participantsUser1 = await Participants.find({ Id_User: userId1 });
    const participantsUser2 = await Participants.find({ Id_User: userId2 });

    const conversationIds1 = participantsUser1.map((p) =>
      p.Id_Conversation.toString()
    );
    const conversationIds2 = participantsUser2.map((p) =>
      p.Id_Conversation.toString()
    );

    // Trouver les conversations en commun
    const commonConversations = conversationIds1.filter((id) =>
      conversationIds2.includes(id)
    );

    console.log("Conversations en commun:", commonConversations);

    // Vérifier chaque conversation commune
    for (const convId of commonConversations) {
      const conversation = await Conversation.findOne({
        _id: convId,
        type: "private",
      });

      if (conversation) {
        console.log("Conversation privée existante trouvée:", convId);

        const populatedConv = await Conversation.findById(convId)
          .populate({
            path: "Id_participant",
            populate: { path: "Id_User", select: "username photo status" },
          })
          .populate("createdBy", "username photo")
          .populate("Id_message");

        return res.json({
          message: "Conversation existante récupérée",
          conversation: populatedConv,
          isNew: false,
        });
      }
    }

    console.log("Aucune conversation existante, création...");

    // Créer une nouvelle conversation
    const newConversation = new Conversation({
      type: "private",
      createdBy: userId1,
      Id_participant: [], // Initialiser vide, sera rempli après
    });

    await newConversation.save();
    console.log("Nouvelle conversation créée:", newConversation._id);

    // Créer les participants
    const participant1 = new Participants({
      Id_User: userId1,
      Id_Conversation: newConversation._id,
      Role: "membre",
    });

    const participant2 = new Participants({
      Id_User: userId2,
      Id_Conversation: newConversation._id,
      Role: "membre",
    });

    await participant1.save();
    await participant2.save();
    console.log("Participants créés");

    // Mettre à jour la conversation avec les participants
    newConversation.Id_participant = [participant1._id, participant2._id];
    await newConversation.save();

    // Populer la conversation pour la réponse
    const populatedConversation = await Conversation.findById(
      newConversation._id
    )
      .populate({
        path: "Id_participant",
        populate: { path: "Id_User", select: "username photo status" },
      })
      .populate("createdBy", "username photo");

    console.log("=== CONVERSATION CRÉÉE AVEC SUCCÈS ===");

    res.status(201).json({
      message: "Nouvelle conversation créée",
      conversation: populatedConversation,
      isNew: true,
    });
  } catch (error) {
    console.error("❌ Error creating conversation:", error);
    res.status(500).json({
      message: "Erreur lors de la création de la conversation",
      error: error.message,
    });
  }
};

// Créer une conversation de groupe
export const createGroupConversation = async (req, res) => {
  try {
    const { groupName, groupPic, participantIds } = req.body;
    const createdBy = req.userId;

    console.log("=== CRÉATION CONVERSATION GROUPE ===");
    console.log("GroupName:", groupName, "Participants:", participantIds);

    if (!groupName || !participantIds || !Array.isArray(participantIds)) {
      return res.status(400).json({
        message: "Nom du groupe et liste des participants requis",
      });
    }

    // Ajouter le créateur aux participants s'il n'est pas déjà inclus
    const allParticipantIds = [...new Set([createdBy, ...participantIds])];

    if (allParticipantIds.length < 2) {
      return res.status(400).json({
        message:
          "Une conversation de groupe doit avoir au moins 2 participants",
      });
    }

    // Vérifier que tous les utilisateurs existent
    const users = await User.find({ _id: { $in: allParticipantIds } });
    if (users.length !== allParticipantIds.length) {
      return res
        .status(404)
        .json({ message: "Un ou plusieurs utilisateurs non trouvés" });
    }

    // Créer la conversation de groupe
    const newConversation = new Conversation({
      type: "group",
      groupName,
      groupPic: groupPic || null,
      createdBy,
      Id_participant: [],
    });

    await newConversation.save();
    console.log("Conversation groupe créée:", newConversation._id);

    // Créer tous les participants
    const participants = [];
    for (const userId of allParticipantIds) {
      const role =
        userId.toString() === createdBy.toString() ? "admin" : "membre";

      const participant = new Participants({
        Id_User: userId,
        Id_Conversation: newConversation._id,
        Role: role,
      });

      await participant.save();
      participants.push(participant);
      console.log("Participant créé:", userId, "Role:", role);
    }

    // Mettre à jour la conversation avec les participants
    newConversation.Id_participant = participants.map((p) => p._id);
    await newConversation.save();

    // Populer la conversation
    const populatedConversation = await Conversation.findById(
      newConversation._id
    )
      .populate({
        path: "Id_participant",
        populate: { path: "Id_User", select: "username photo status" },
      })
      .populate("createdBy", "username photo");

    console.log("=== CONVERSATION GROUPE CRÉÉE AVEC SUCCÈS ===");

    res.status(201).json({
      message: "Conversation de groupe créée avec succès",
      conversation: populatedConversation,
    });
  } catch (error) {
    console.error("❌ Error creating group conversation:", error);
    res.status(500).json({
      message: "Erreur lors de la création du groupe",
      error: error.message,
    });
  }
};

// Récupérer les conversations d'un utilisateur
export const getUserConversations = async (req, res) => {
  try {
    const userId = req.userId;

    console.log("=== RÉCUPÉRATION CONVERSATIONS UTILISATEUR ===");
    console.log("UserID:", userId);

    // Trouver toutes les participations de l'utilisateur
    const participants = await Participants.find({ Id_User: userId }).populate(
      "Id_Conversation"
    );

    console.log("Participations trouvées:", participants.length);

    // Récupérer et peupler chaque conversation
    const conversations = await Promise.all(
      participants.map(async (participant) => {
        try {
          const conversation = await Conversation.findById(
            participant.Id_Conversation._id
          )
            .populate({
              path: "Id_participant",
              populate: { path: "Id_User", select: "username photo status" },
            })
            .populate("Id_message")
            .populate("createdBy", "username photo");

          if (!conversation) return null;

          // Pour les conversations privées, trouver l'autre utilisateur
          if (conversation.type === "private") {
            const otherParticipant = await Participants.findOne({
              Id_Conversation: conversation._id,
              Id_User: { $ne: userId },
            }).populate("Id_User", "username photo status");

            return {
              ...conversation.toObject(),
              otherUser: otherParticipant?.Id_User || null,
            };
          }

          return conversation;
        } catch (error) {
          console.error("Error populating conversation:", error);
          return null;
        }
      })
    );

    // Filtrer les conversations nulles et trier par date
    const validConversations = conversations.filter((conv) => conv !== null);
    validConversations.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    console.log("=== CONVERSATIONS RÉCUPÉRÉES AVEC SUCCÈS ===");
    console.log("Nombre:", validConversations.length);

    res.json({
      conversations: validConversations,
      total: validConversations.length,
    });
  } catch (error) {
    console.error("❌ Error getting user conversations:", error);
    res.status(500).json({
      message: "Erreur lors de la récupération des conversations",
      error: error.message,
    });
  }
};

// Récupérer une conversation par ID
export const getConversationById = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;

    console.log("=== RÉCUPÉRATION CONVERSATION PAR ID ===");
    console.log("ConversationID:", conversationId, "UserID:", userId);

    // Vérifier que l'utilisateur fait partie de la conversation
    const participant = await Participants.findOne({
      Id_Conversation: conversationId,
      Id_User: userId,
    });

    if (!participant) {
      return res
        .status(403)
        .json({ message: "Accès non autorisé à cette conversation" });
    }

    const conversation = await Conversation.findById(conversationId)
      .populate({
        path: "Id_participant",
        populate: { path: "Id_User", select: "username photo status" },
      })
      .populate("Id_message")
      .populate("createdBy", "username photo");

    if (!conversation) {
      return res.status(404).json({ message: "Conversation non trouvée" });
    }

    console.log("=== CONVERSATION RÉCUPÉRÉE AVEC SUCCÈS ===");

    res.json(conversation);
  } catch (error) {
    console.error("❌ Error getting conversation by ID:", error);
    res.status(500).json({
      message: "Erreur lors de la récupération de la conversation",
      error: error.message,
    });
  }
};

// Mettre à jour une conversation (nom du groupe, photo, etc.)
export const updateConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { groupName, groupPic } = req.body;
    const userId = req.userId;

    console.log("=== MISE À JOUR CONVERSATION ===");

    // Vérifier que l'utilisateur est admin de la conversation
    const participant = await Participants.findOne({
      Id_Conversation: conversationId,
      Id_User: userId,
      Role: "admin",
    });

    if (!participant) {
      return res.status(403).json({
        message: "Seuls les administrateurs peuvent modifier la conversation",
      });
    }

    const updateData = {};
    if (groupName) updateData.groupName = groupName;
    if (groupPic !== undefined) updateData.groupPic = groupPic;

    const conversation = await Conversation.findByIdAndUpdate(
      conversationId,
      updateData,
      { new: true, runValidators: true }
    )
      .populate({
        path: "Id_participant",
        populate: { path: "Id_User", select: "username photo status" },
      })
      .populate("createdBy", "username photo");

    if (!conversation) {
      return res.status(404).json({ message: "Conversation non trouvée" });
    }

    console.log("=== CONVERSATION MISE À JOUR AVEC SUCCÈS ===");

    res.json({
      message: "Conversation mise à jour avec succès",
      conversation,
    });
  } catch (error) {
    console.error("❌ Error updating conversation:", error);
    res.status(500).json({
      message: "Erreur lors de la mise à jour de la conversation",
      error: error.message,
    });
  }
};

// Supprimer une conversation
export const deleteConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;

    console.log("=== SUPPRESSION CONVERSATION ===");

    // Vérifier que l'utilisateur est admin
    const participant = await Participants.findOne({
      Id_Conversation: conversationId,
      Id_User: userId,
      Role: "admin",
    });

    if (!participant) {
      return res.status(403).json({
        message: "Seuls les administrateurs peuvent supprimer la conversation",
      });
    }

    // Supprimer tous les participants
    await Participants.deleteMany({ Id_Conversation: conversationId });

    // Supprimer tous les messages
    await Message.deleteMany({ conversationId });

    // Supprimer la conversation
    await Conversation.findByIdAndDelete(conversationId);

    console.log("=== CONVERSATION SUPPRIMÉE AVEC SUCCÈS ===");

    res.json({ message: "Conversation supprimée avec succès" });
  } catch (error) {
    console.error("❌ Error deleting conversation:", error);
    res.status(500).json({
      message: "Erreur lors de la suppression de la conversation",
      error: error.message,
    });
  }
};
