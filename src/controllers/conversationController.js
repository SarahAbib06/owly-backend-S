import Conversation from "../models/Conversation.js";
import Participants from "../models/Participants.js";
import User from "../models/User.js";

import mongoose from "mongoose";

export const conversationController = {
getOrCreateConversation: async (senderId, receiverId) => {
  // Conversion IDs
  const senderIdObj = new mongoose.Types.ObjectId(senderId);
  const receiverIdObj = new mongoose.Types.ObjectId(receiverId);

  // Vérif users
  const [sender, receiver] = await Promise.all([
    User.findById(senderIdObj),
    User.findById(receiverIdObj),
  ]);
  if (!sender || !receiver) throw new Error('Users introuvables');

  // ✅ CRUCIAL : Vérif relation
  const Relation = (await import('../models/Relation.js')).default;
  const relation = await Relation.findOne({
    $or: [
      { userId: senderIdObj, contactId: receiverIdObj, status: 'accepted' },
      { userId: receiverIdObj, contactId: senderIdObj, status: 'accepted' }
    ]
  });

  const isContact = !!relation;

  console.log('🤝 Relation check:', { 
    senderId, receiverId, 
    isContact: isContact ? relation.status : 'NO_RELATION' 
  });

  // Conversation existante
  let conversation = await Conversation.findOne({
    Id_participant: { $all: [senderId, receiverId] },
    type: "private",
  });

  if (conversation) {
    console.log('✅ Conversation existante');
    return conversation;
  }

  // ✅ NOUVELLE avec MessageRequest !
  conversation = await Conversation.create({
    Id_participant: [senderId, receiverId],
    type: "private",
    createdBy: senderId,
    // 🎯 ÇA !
    isMessageRequest: !isContact,
    messageRequestFrom: !isContact ? senderId : null,
    messageRequestFor: !isContact ? receiverId : null,
  });

  console.log('✅ NOUVELLE Conversation:', {
    id: conversation._id,
    isMessageRequest: conversation.isMessageRequest,
    messageRequestFor: conversation.messageRequestFor,
    isContact
  });

  // Participants
  await Participants.create([
    { Id_User: senderId, Id_Conversation: conversation._id, Role: "membre" },
    { Id_User: receiverId, Id_Conversation: conversation._id, Role: "membre" },
  ]);

  return conversation;
},

  // 🆕 FONCTION POUR CRÉER UN GROUPE (SÉCURISÉE)
  createGroupConversation: async (
    creatorIdFromToken,
    participantIds,
    groupName
  ) => {
    // 🎯 VÉRIFICATIONS
    if (!mongoose.Types.ObjectId.isValid(creatorIdFromToken)) {
      throw new Error("ID créateur invalide");
    }

    if (!participantIds || participantIds.length < 2) {
      throw new Error("Un groupe doit avoir au moins 2 autres participants");
    }

    if (!groupName || groupName.trim().length === 0) {
      throw new Error("Le nom du groupe est requis");
    }

    // 🎯 VÉRIFIER QUE TOUS LES USERS EXISTENT
    const allUserIds = [creatorIdFromToken, ...participantIds];
    const users = await User.find({ _id: { $in: allUserIds } });

    if (users.length !== allUserIds.length) {
      throw new Error("Certains utilisateurs n'existent pas");
    }

    // 🎯 CRÉER LA CONVERSATION DE GROUPE
    const newConversation = await Conversation.create({
      Id_participant: allUserIds,
      type: "group",
      groupName: groupName.trim(),
      createdBy: creatorIdFromToken,
    });

    console.log(
      `✅ Groupe créé: ${groupName} (${allUserIds.length} participants)`
    );

    // 🎯 CRÉER LES PARTICIPANTS
    try {
      const participantsData = allUserIds.map((userId) => ({
        Id_User: userId,
        Id_Conversation: newConversation._id,
        Role: userId === creatorIdFromToken ? "admin" : "membre",
      }));

      await Participants.insertMany(participantsData);
      console.log(
        `✅ ${participantsData.length} participants ajoutés au groupe`
      );
    } catch (error) {
      // 🆕 SI ERREUR, SUPPRIMER LA CONVERSATION
      await Conversation.findByIdAndDelete(newConversation._id);
      throw new Error("Erreur création participants groupe: " + error.message);
    }

    return newConversation;
  },

  // 🎯 VÉRIFICATION AUTORISATION CONVERSATION
  checkUserAuthorization: async (userId, conversationId) => {
    if (
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(conversationId)
    ) {
      throw new Error("IDs invalides");
    }

    // 🆕 VÉRIFIER QUE L'USER EXISTE
    const userExists = await User.findById(userId);
    if (!userExists) {
      throw new Error("Utilisateur non trouvé");
    }

    const participant = await Participants.findOne({
      Id_User: userId,
      Id_Conversation: conversationId,
    });

    if (!participant) {
      throw new Error(
        "Non autorisé à envoyer des messages dans cette conversation"
      );
    }

    return true;
  },

  // 🆕 FONCTION POUR RÉCUPÉRER LES GROUPES D'UN USER
  getUserGroups: async (userId) => {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("ID utilisateur invalide");
    }

    const userGroups = await Participants.find({
      Id_User: userId,
    })
      .populate({
        path: "Id_Conversation",
        match: { type: "group" },
      })
      .populate("Id_User", "username profilePicture");

    const groups = userGroups
      .filter((p) => p.Id_Conversation) // Filtrer les conversations de groupe
      .map((p) => ({
        _id: p.Id_Conversation._id,
        name: p.Id_Conversation.groupName,
        type: p.Id_Conversation.type,
        unreadCount:
          p.Id_Conversation.unreadCounts?.find(
            (u) => u.userId && u.userId.toString() === userId
          )?.count || 0,
        lastMessageAt: p.Id_Conversation.lastMessageAt,
        participantCount: p.Id_Conversation.Id_participant?.length || 0,
        role: p.Role,
      }));

    return groups;
  },
};
