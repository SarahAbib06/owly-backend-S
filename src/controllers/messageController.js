// controllers/messageController.js
import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";
import Participants from "../models/Participants.js";
import User from "../models/User.js";
import Relation from "../models/Relation.js";
import { conversationController } from "./conversationController.js";
import { pushNotificationService } from "../services/pushNotificationService.js";
import mongoose from "mongoose";
import crypto from "crypto";

// CLÉ SECRÈTE — METS ÇA DANS TON .env (64 caractères hex = 32 bytes)
const ENCRYPTION_KEY = process.env.MESSAGE_ENCRYPTION_KEY || "a".repeat(64);
const ALGORITHM = "aes-256-gcm";

// CHIFFREMENT
function encryptContent(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, "hex"),
    iv
  );
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  const payload = {
    iv: iv.toString("hex"),
    data: encrypted,
    tag: authTag.toString("hex"),
  };
  return JSON.stringify(payload);
}

// DÉCHIFFREMENT
function decryptContent(stored) {
  if (!stored || typeof stored !== "string") return "[Message vide]";
  if (!stored.startsWith("{") || !stored.includes(":")) return stored;
  try {
    const payload = JSON.parse(stored);
    if (!payload.iv || !payload.data || !payload.tag)
      throw new Error("Format invalide");
    const iv = Buffer.from(payload.iv, "hex");
    const authTag = Buffer.from(payload.tag, "hex");
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY, "hex"),
      iv
    );
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(payload.data, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.warn("Déchiffrement échoué → ancien message");
    return stored.length < 2000 ? stored : "[Corrompu]";
  }
}

let userPresence = new Map();

export const messageController = {
  createMessage: async (messageData, io = null, userIdFromToken = null) => {
    // RÉCUPÉRATION Id_sender SÉCURISÉ
    const Id_sender = userIdFromToken;

    const {
      conversationId,
      Id_receiver,
      content,
      typeMessage = "text",
    } = messageData;

    // VÉRIFICATIONS
    if (!mongoose.Types.ObjectId.isValid(Id_sender)) {
      throw new Error("ID expéditeur invalide");
    }
    if (Id_receiver && !mongoose.Types.ObjectId.isValid(Id_receiver)) {
      throw new Error("ID destinataire invalide");
    }
    if (conversationId && !mongoose.Types.ObjectId.isValid(conversationId)) {
      throw new Error("ID conversation invalide");
    }

    if (!content || typeof content !== "string") {
      throw new Error("Le contenu du message est requis");
    }
    if (content.trim().length === 0) {
      throw new Error("Le message ne peut pas être vide");
    }
    if (content.length > 1000) {
      throw new Error("Le message est trop long (max 1000 caractères)");
    }

    const allowedTypes = ["text", "image", "video", "file"];
    if (!allowedTypes.includes(typeMessage))
      throw new Error(`Type non supporté: ${typeMessage}`);

    // DÉTERMINER LE DESTINATAIRE
    let receiverId = Id_receiver ? Id_receiver.toString() : null;
    if (!receiverId && conversationId) {
      const participants = await Participants.find({
        Id_Conversation: conversationId,
      })
        .select("Id_User")
        .lean();
      if (participants.length !== 2) {
        throw new Error(
          "Conversation invalide (doit avoir exactement 2 participants)"
        );
      }

      const otherParticipant = participants.find(
        (p) => p.Id_User.toString() !== Id_sender.toString()
      );

      if (!otherParticipant) {
        throw new Error(
          "Impossible de trouver le destinataire dans cette conversation"
        );
      }
      receiverId = otherParticipant.Id_User.toString();
    }
    if (!receiverId) {
      throw new Error(
        "Destinataire introuvable – Id_receiver ou conversationId requis"
      );
    }

    // VÉRIFICATION BLOCAGE
    const blockExists = await Relation.findOne({
      status: "blocked",
      $or: [
        { userId: Id_sender, contactId: receiverId },
        { userId: receiverId, contactId: Id_sender },
      ],
    });
    if (blockExists) {
      throw new Error(
        "Impossible d'envoyer le message : vous avez bloqué cette personne ou elle vous a bloqué."
      );
    }

    // CONVERSATION
    let finalConversationId = conversationId;
    if (!conversationId) {
      const conv = await conversationController.getOrCreateConversation(
        Id_sender,
        receiverId
      );
      finalConversationId = conv._id;
    }

    // CHIFFREMENT UNIQUEMENT POUR LA BASE DE DONNÉES
    const encryptedContent = encryptContent(content.trim());

    const message = new Message({
      conversationId: finalConversationId,
      Id_sender,
      content: encryptedContent, // chiffré en DB
      typeMessage,
      status: "sent",
      time: new Date(),
    });
    const savedMessage = await message.save();

    // COMPTEURS NON LUS (1er bloc)
    try {
      const participants = await Participants.find({
        Id_Conversation: finalConversationId,
      });
      const bulkOperations = [];
      const participantsToNotify = [];
      for (const participant of participants) {
        if (participant.Id_User.toString() !== Id_sender.toString()) {
          participantsToNotify.push(participant.Id_User);
          bulkOperations.push({
            updateOne: {
              filter: {
                _id: finalConversationId,
                "unreadCounts.userId": participant.Id_User,
              },
              update: {
                $inc: { "unreadCounts.$.count": 1 },
                $set: { lastMessageAt: new Date() },
              },
            },
          });
        }
      }
      if (bulkOperations.length > 0) {
        await Conversation.bulkWrite(bulkOperations);
        const conv = await Conversation.findById(finalConversationId);
        const missing = [];
        for (const uid of participantsToNotify) {
          if (
            !conv.unreadCounts?.some(
              (u) => u.userId.toString() === uid.toString()
            )
          ) {
            missing.push({
              updateOne: {
                filter: { _id: finalConversationId },
                update: {
                  $push: { unreadCounts: { userId: uid, count: 1 } },
                  $set: { lastMessageAt: new Date() },
                },
              },
            });
          }
        }
        if (missing.length > 0) await Conversation.bulkWrite(missing);
      }
    } catch (error) {
      console.error("Erreur mise à jour compteurs:", error.message);
    }

    // COMPTEURS NON-LUS (2ème bloc)
    try {
      console.log("Mise à jour des compteurs non-lus...");

      let participants = [];
      const conversation = await Conversation.findById(finalConversationId);
      if (conversation && conversation.type === "group") {
        participants = conversation.Id_participant.map((userId) => ({
          Id_User: userId,
        }));
      } else {
        participants = await Participants.find({
          Id_Conversation: finalConversationId,
        });
      }
      for (let participant of participants) {
        const participantId = participant.Id_User.toString();
        if (participantId !== Id_sender.toString()) {
          await Conversation.findOneAndUpdate(
            {
              _id: finalConversationId,
              "unreadCounts.userId": participantId,
            },
            {
              $inc: { "unreadCounts.$.count": 1 },
              $set: { lastMessageAt: new Date() },
            },
            { upsert: true, new: true }
          );
        }
      }

      console.log("Compteurs non-lus mis à jour");
    } catch (error) {
      console.log("Erreur compteurs:", error.message);
    }

    // NOTIFICATIONS INTELLIGENTES (tout ton code intact)
    try {
      console.log("Gestion intelligente des notifications...");

      let participants = [];
      const conversation = await Conversation.findById(finalConversationId);
      if (conversation && conversation.type === "group") {
        participants = conversation.Id_participant.map((userId) => ({
          Id_User: { _id: userId },
        }));
      } else {
        participants = await Participants.find({
          Id_Conversation: finalConversationId,
        }).populate("Id_User", "username");
      }
      const sender = await User.findById(Id_sender);
      const senderName = sender?.username || "Quelqu'un";

      for (let participant of participants) {
        const participantId = participant.Id_User._id.toString();
        if (participantId !== Id_sender.toString()) {
          const participantUser = await User.findById(participantId);

          const participantName = participantUser?.username || "Utilisateur";
          const notificationsEnabled = await areNotificationsEnabled(
            participantId
          );
          if (!notificationsEnabled) {
            console.log(
              `NOTIFICATIONS COMPLÈTEMENT DÉSACTIVÉES pour: ${participantName}`
            );
            continue;
          }
          const isUserOnline = await isUserOnlineAdvanced(io, participantId);
          console.log(
            `${participantName}: En ligne=${isUserOnline}, Notifications=ACTIVÉES`
          );
          const notificationTitle =
            conversation?.type === "group"
              ? `${conversation.groupName} - ${senderName}`
              : `Nouveau message de ${senderName}`;
          const notificationBody =
            content.length > 30 ? content.substring(0, 30) + "..." : content;
          if (isUserOnline && io) {
            console.log(`WebSocket à: ${participantName}`);
            io.to(`user_${participantId}`).emit("new_message_alert", {
              type: "new_message",

              conversationId: finalConversationId,
              senderId: savedMessage.Id_sender,
              senderName: senderName,
              messagePreview: content.substring(0, 50), // Contenu en clair
              timestamp: new Date(),
              messageId: savedMessage._id,
              isGroup: conversation?.type === "group",
              groupName: conversation?.groupName,
            });
          } else {
            console.log(`Push notification à: ${257}participantName}`);

            await pushNotificationService.sendToUser(
              participantId,
              notificationTitle,
              notificationBody, // Contenu en clair
              {
                conversationId: finalConversationId.toString(),
                messageId: savedMessage._id.toString(),
                type: "new_message",
                senderName: senderName,
                isGroup: conversation?.type === "group",
                groupName: conversation?.groupName,
              }
            );
          }
        }
      }
    } catch (error) {
      console.log("Erreur notifications:", error.message);
    }

    // DIFFUSION WEBSOCKET → EN CLAIR (CORRIGÉ)
    if (io) {
      io.to(finalConversationId.toString()).emit("new_message", {
        _id: savedMessage._id,
        conversationId: finalConversationId,
        Id_sender: Id_sender,

        content: content.trim(), // EN CLAIR

        typeMessage: typeMessage,
        status: "sent",
        timestamp: new Date(),
        isGroup:
          (await Conversation.findById(finalConversationId))?.type === "group",
      });
    }

    // RETURN → EN CLAIR (CORRIGÉ)
    return {
      _id: savedMessage._id,
      conversationId: finalConversationId,
      Id_sender,

      content: content.trim(), // EN CLAIR

      typeMessage,
      status: "sent",
      timestamp: new Date(),

      isGroup:
        (await Conversation.findById(finalConversationId))?.type === "group",
    };
  },

  // RÉCUPÉRER LES MESSAGES → DÉCHIFFRE À LA VOLÉE (CORRIGÉ)
  getConversationMessages: async (conversationId, page = 1, limit = 50) => {
    try {
      console.log(
        `Récupération messages conversation ${conversationId}, page ${page}`
      );

      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new Error("ID conversation invalide");
      }
      const skip = (page - 1) * limit;
      const messages = await Message.find({ conversationId: conversationId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      // DÉCHIFFRE TOUS LES MESSAGES AVANT DE LES RENVOYER
      const decryptedMessages = messages.map((msg) => ({
        ...msg,
        _id: msg._id.toString(),
        conversationId: msg.conversationId.toString(),
        Id_sender: msg.Id_sender.toString(),
        content: decryptContent(msg.content), // DÉCHIFFRÉ ICI
        timestamp: msg.time || msg.createdAt,
      }));

      console.log(`${decryptedMessages.length} messages trouvés et déchiffrés`);
      return decryptedMessages;
    } catch (error) {
      console.error("Erreur:", error);

      throw error;
    }
  },

  setUserPresence: (presenceMap) => {
    userPresence = presenceMap;
  },

  sendGroupMessage: async (
    groupId,
    senderId,
    content,
    typeMessage = "text",
    io = null
  ) => {
    const messageData = {
      conversationId: groupId,
      content: content,
      typeMessage: typeMessage,
    };
    return await messageController.createMessage(messageData, io, senderId);
  },
};

// FONCTIONS ANNEXES (100% intactes)
async function isUserOnlineAdvanced(io, userId) {
  try {
    if (userPresence && userPresence.has(userId)) {
      const presence = userPresence.get(userId);

      const isOnline =
        presence.status === "online" &&
        presence.sessions &&
        presence.sessions.length > 0;
      console.log(
        `Présence mémoire ${userId}: ${isOnline} (${presence.sessions?.length} sessions)`
      );
      return isOnline;
    }
    const user = await User.findById(userId);
    const isOnlineDB =
      user &&
      user.status === "online" &&
      user.activeSessions &&
      user.activeSessions.length > 0;
    console.log(
      `Présence BDD ${userId}: ${isOnlineDB} (${user?.activeSessions?.length} sessions)`
    );
    return isOnlineDB;
  } catch (error) {
    console.log("Erreur vérification présence avancée:", error.message);
    const userRoom = io?.sockets?.adapter?.rooms?.get(`user_${userId}`);
    const isOnlineWS = userRoom && userRoom.size > 0;
    console.log(`Présence WebSocket ${userId}: ${isOnlineWS}`);

    return isOnlineWS;
  }
}

async function areNotificationsEnabled(userId) {
  try {
    const user = await User.findById(userId);

    if (!user) return true;
    if (
      user.notificationPreferences &&
      user.notificationPreferences.pushEnabled === false
    ) {
      return false;
    }
    return true;
  } catch (error) {
    console.log("Erreur vérification notifications:", error.message);
    return true;
  }
}
