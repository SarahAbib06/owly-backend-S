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
import cloudinary from '../config/cloudinary.js';
import streamifier from 'streamifier';

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

// 🆕 CONFIGURATION DES FICHIERS
const FILE_CONFIG = {
  image: {
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    maxSize: 10 * 1024 * 1024, // 10MB
    folder: 'chat_images'
  },
  video: {
    allowedTypes: ['video/mp4', 'video/mkv', 'video/avi', 'video/mov', 'video/webm'],
    maxSize: 50 * 1024 * 1024, // 50MB
    folder: 'chat_videos'
  },
  file: {
    allowedTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'application/zip',
      'application/x-rar-compressed'
    ],
    maxSize: 20 * 1024 * 1024, // 20MB
    folder: 'chat_files'
  }
};

// 🆕 VALIDATION DES FICHIERS
const validateFile = (file, allowedTypes, maxSize) => {
  if (!file || !file.buffer) {
    throw new Error('Fichier manquant');
  }

  if (file.size > maxSize) {
    throw new Error(`Fichier trop volumineux (max: ${maxSize / 1024 / 1024}MB)`);
  }

  if (!allowedTypes.includes(file.mimetype)) {
    throw new Error(`Type de fichier non autorisé: ${file.mimetype}`);
  }

  return true;
};

// 🆕 FONCTION GÉNÉRIQUE POUR L'UPLOAD
const uploadToCloudinary = async (file, resourceType, folder) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: resourceType,
        ...(resourceType === 'image' && {
          quality: 'auto',
          format: 'jpg'
        }),
        ...(resourceType === 'video' && {
          chunk_size: 6000000
        })
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    
    streamifier.createReadStream(file.buffer).pipe(uploadStream);
  });
};

// 🆕 VALIDATION ET CONVERSION ID UTILISATEUR
const validateAndConvertUserId = (userId, fieldName = 'ID utilisateur') => {
  if (!userId) {
    throw new Error(`${fieldName} manquant`);
  }

  // Convertir en string si c'est un ObjectId
  let userIdString = userId;
  if (typeof userId === 'object' && userId.toString) {
    userIdString = userId.toString();
  }

  // Nettoyer et valider le format
  userIdString = userIdString.trim();
  
  if (!mongoose.Types.ObjectId.isValid(userIdString)) {
    throw new Error(`${fieldName} invalide: "${userIdString}"`);
  }

  return new mongoose.Types.ObjectId(userIdString);
};

// 🆕 FONCTION UNIFIÉE POUR LA GESTION DES MESSAGES
const handleMessageCreation = async (messageData, io = null, userIdFromToken = null, additionalData = {}) => {
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
    throw new Error('ID expéditeur invalide');
  }
  if (Id_receiver && !mongoose.Types.ObjectId.isValid(Id_receiver)) {
    throw new Error('ID destinataire invalide');
  }
  if (conversationId && !mongoose.Types.ObjectId.isValid(conversationId)) {
    throw new Error('ID conversation invalide');
  }
  if (!content) {
    throw new Error('Le contenu du message est requis');
  }
  if (typeof content === 'string' && content.trim().length === 0) {
    throw new Error('Le message ne peut pas être vide');
  }
  if (typeof content === 'string' && content.length > 1000) {
    throw new Error('Le message est trop long (max 1000 caractères)');
  }
  const allowedTypes = ['text', 'image', 'video', 'file', 'emojis'];
  if (!allowedTypes.includes(typeMessage)) throw new Error(`Type non supporté: ${typeMessage}`);

  // DÉTERMINER LE DESTINATAIRE
  let receiverId = Id_receiver ? Id_receiver.toString() : null;
  if (!receiverId && conversationId) {
    const participants = await Participants.find({ Id_Conversation: conversationId })
      .select('Id_User')
      .lean();
    if (participants.length < 2) {
      throw new Error('Conversation invalide (doit avoir au moins 2 participants)');
    }
    const otherParticipant = participants.find(p => p.Id_User.toString() !== Id_sender.toString());
    if (!otherParticipant) {
      throw new Error('Impossible de trouver le destinataire dans cette conversation');
    }
    receiverId = otherParticipant.Id_User.toString();
  }
  if (!receiverId) {
    throw new Error('Destinataire introuvable – Id_receiver ou conversationId requis');
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

  // CHIFFREMENT UNIQUEMENT POUR LES MESSAGES TEXTES
  const encryptedContent = typeMessage === 'text' ? encryptContent(content.trim()) : content;

  const message = new Message({
    conversationId: finalConversationId,
    Id_sender,
    content: encryptedContent,
    typeMessage,
    status: "sent",
    time: new Date(),
    readBy: [],
    unreadFor: []
  });
  const savedMessage = await message.save();

  // UN SEUL BLOC POUR LES COMPTEURS NON LUS
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
        if (!conv.unreadCounts?.some((u) => u.userId.toString() === uid.toString())) {
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

  // NOTIFICATIONS INTELLIGENTES
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

    // Préparer le contenu de notification selon le type
    let notificationBody = "";
    if (typeMessage === 'text') {
      notificationBody = content.length > 30 ? content.substring(0, 30) + "..." : content;
    } else if (typeMessage === 'image') {
      notificationBody = "📷 Image partagée";
    } else if (typeMessage === 'video') {
      notificationBody = "🎥 Vidéo partagée";
    } else if (typeMessage === 'file') {
      notificationBody = "📎 Fichier partagé";
    }

    for (let participant of participants) {
      const participantId = participant.Id_User._id.toString();
      if (participantId !== Id_sender.toString()) {
        const participantUser = await User.findById(participantId);
        const participantName = participantUser?.username || "Utilisateur";
        
        const notificationsEnabled = await areNotificationsEnabled(participantId);
        if (!notificationsEnabled) {
          console.log(`NOTIFICATIONS COMPLÈTEMENT DÉSACTIVÉES pour: ${participantName}`);
          continue;
        }
        
        const isUserOnline = await isUserOnlineAdvanced(io, participantId);
        console.log(`${participantName}: En ligne=${isUserOnline}, Notifications=ACTIVÉES`);
        
        const notificationTitle = conversation?.type === "group"
          ? `${conversation.groupName} - ${senderName}`
          : `Nouveau message de ${senderName}`;

        if (isUserOnline && io) {
          console.log(`WebSocket à: ${participantName}`);
          io.to(`user_${participantId}`).emit("new_message_alert", {
            type: "new_message",
            conversationId: finalConversationId,
            senderId: savedMessage.Id_sender,
            senderName: senderName,
            messagePreview: notificationBody,
            timestamp: new Date(),
            messageId: savedMessage._id,
            isGroup: conversation?.type === "group",
            groupName: conversation?.groupName,
          });
        } else {
          console.log(`Push notification à: ${participantName}`);
          await pushNotificationService.sendToUser(
            participantId,
            notificationTitle,
            notificationBody,
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

  // DIFFUSION WEBSOCKET
  if (io) {
    const messageToEmit = {
      _id: savedMessage._id,
      conversationId: finalConversationId,
      Id_sender: Id_sender,
      content: typeMessage === 'text' ? content.trim() : content, // EN CLAIR
      typeMessage: typeMessage,
      status: "sent",
      timestamp: new Date(),
      isGroup: (await Conversation.findById(finalConversationId))?.type === "group",
      ...additionalData // Inclure les données supplémentaires (infos image, fichier, etc.)
    };
    
    io.to(finalConversationId.toString()).emit('new_message', messageToEmit);
  }

  // RETURN
  return {
    _id: savedMessage._id,
    conversationId: finalConversationId,
    Id_sender,
    content: typeMessage === 'text' ? content.trim() : content, // EN CLAIR
    typeMessage,
    status: "sent",
    timestamp: new Date(),
    isGroup: (await Conversation.findById(finalConversationId))?.type === "group",
    ...additionalData
  };
};

export const messageController = {
  // 🆕 CREATE MESSAGE UNIFIÉ
  createMessage: async (messageData, io = null, userIdFromToken = null) => {
    return await handleMessageCreation(messageData, io, userIdFromToken);
  },

  // 🆕 UPLOAD IMAGE MESSAGE - SIMPLIFIÉ
  uploadImageMessage: async (file, messageData, io = null, userIdFromToken = null) => {
    try {
      console.log('🖼️ Début upload image - DEBUG:', {
        userIdFromToken,
        hasFile: !!file,
        messageData
      });

      // VALIDATION DE L'ID UTILISATEUR
      const senderObjectId = validateAndConvertUserId(userIdFromToken, 'ID expéditeur');
      
      const { conversationId, Id_receiver } = messageData;

      // VALIDATION DU FICHIER
      validateFile(file, FILE_CONFIG.image.allowedTypes, FILE_CONFIG.image.maxSize);

      console.log('✅ ID expéditeur validé:', senderObjectId);

      // UPLOAD IMAGE VERS CLOUDINARY
      const uploadResult = await uploadToCloudinary(file, 'image', FILE_CONFIG.image.folder);

      console.log('✅ Image uploadée sur Cloudinary:', uploadResult.secure_url);

      // 🆕 UTILISER LA FONCTION UNIFIÉE
      const messageDataForCreate = {
        conversationId,
        Id_receiver,
        content: uploadResult.secure_url,
        typeMessage: 'image'
      };

      const additionalData = {
        imageInfo: {
          url: uploadResult.secure_url,
          publicId: uploadResult.public_id,
          width: uploadResult.width,
          height: uploadResult.height
        }
      };

      return await handleMessageCreation(messageDataForCreate, io, userIdFromToken, additionalData);

    } catch (error) {
      console.error('💥 Erreur upload image:', error);
      throw new Error(`Échec upload image: ${error.message}`);
    }
  },

  // 🆕 UPLOAD FILE MESSAGE - SIMPLIFIÉ
  uploadFileMessage: async (file, messageData, io = null, userIdFromToken = null) => {
    try {
      console.log('📎 Début upload fichier - DEBUG:', {
        userIdFromToken,
        hasFile: !!file,
        messageData
      });

      // VALIDATION DE L'ID UTILISATEUR
      const senderObjectId = validateAndConvertUserId(userIdFromToken, 'ID expéditeur');
      
      const { conversationId, Id_receiver, fileName, fileType, fileSize, originalName } = messageData;

      // VALIDATION DU FICHIER
      validateFile(file, FILE_CONFIG.file.allowedTypes, FILE_CONFIG.file.maxSize);

      console.log('✅ ID expéditeur validé:', senderObjectId);

      // UPLOAD FICHIER VERS CLOUDINARY
      const uploadResult = await uploadToCloudinary(file, 'raw', FILE_CONFIG.file.folder);

      console.log('✅ Fichier uploadé sur Cloudinary:', uploadResult.secure_url);

      // 🆕 UTILISER LA FONCTION UNIFIÉE
      const messageDataForCreate = {
        conversationId,
        Id_receiver,
        content: uploadResult.secure_url,
        typeMessage: 'file'
      };

      const additionalData = {
        fileInfo: {
          url: uploadResult.secure_url,
          publicId: uploadResult.public_id,
          originalFilename: uploadResult.original_filename,
          format: uploadResult.format,
          bytes: uploadResult.bytes,
          fileName: fileName,
          fileType: fileType,
          fileSize: fileSize,
          originalName: originalName
        }
      };

      return await handleMessageCreation(messageDataForCreate, io, userIdFromToken, additionalData);

    } catch (error) {
      console.error('💥 Erreur upload fichier:', error);
      throw new Error(`Échec upload fichier: ${error.message}`);
    }
  },

  // 🆕 UPLOAD VIDEO MESSAGE - SIMPLIFIÉ
  uploadVideoMessage: async (file, messageData, io = null, userIdFromToken = null) => {
    try {
      console.log('🎥 Début upload vidéo - DEBUG:', {
        userIdFromToken,
        hasFile: !!file,
        messageData
      });

      // VALIDATION DE L'ID UTILISATEUR
      const senderObjectId = validateAndConvertUserId(userIdFromToken, 'ID expéditeur');
      
      const { conversationId, Id_receiver, fileName, fileType, fileSize } = messageData;

      // VALIDATION DU FICHIER
      validateFile(file, FILE_CONFIG.video.allowedTypes, FILE_CONFIG.video.maxSize);

      console.log('✅ ID expéditeur validé:', senderObjectId);

      // UPLOAD VIDÉO VERS CLOUDINARY
      const uploadResult = await uploadToCloudinary(file, 'video', FILE_CONFIG.video.folder);

      console.log('✅ Vidéo uploadée sur Cloudinary:', uploadResult.secure_url);

      // 🆕 UTILISER LA FONCTION UNIFIÉE
      const messageDataForCreate = {
        conversationId,
        Id_receiver,
        content: uploadResult.secure_url,
        typeMessage: 'video'
      };

      const additionalData = {
        videoInfo: {
          url: uploadResult.secure_url,
          publicId: uploadResult.public_id,
          format: uploadResult.format,
          bytes: uploadResult.bytes,
          fileName: fileName,
          fileType: fileType,
          fileSize: fileSize
        }
      };

      return await handleMessageCreation(messageDataForCreate, io, userIdFromToken, additionalData);

    } catch (error) {
      console.error('💥 Erreur upload vidéo:', error);
      throw new Error(`Échec upload vidéo: ${error.message}`);
    }
  },

  // RÉCUPÉRER LES MESSAGES → DÉCHIFFRE À LA VOLÉE
  getConversationMessages: async (conversationId, page = 1, limit = 50) => {
    try {
      console.log(`Récupération messages conversation ${conversationId}, page ${page}`);

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
        content: msg.typeMessage === 'text' ? decryptContent(msg.content) : msg.content,
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

  sendGroupMessage: async (groupId, senderId, content, typeMessage = "text", io = null) => {
    const messageData = {
      conversationId: groupId,
      content: content,
      typeMessage: typeMessage,
    };
    return await handleMessageCreation(messageData, io, senderId);
  },
};

// FONCTIONS ANNEXES
async function isUserOnlineAdvanced(io, userId) {
  try {
    if (userPresence && userPresence.has(userId)) {
      const presence = userPresence.get(userId);
      const isOnline = presence.status === 'online' && presence.sessions && presence.sessions.length > 0;
      console.log(`🔍 Présence mémoire ${userId}: ${isOnline} (${presence.sessions?.length} sessions)`);
      return isOnline;
    }
    const user = await User.findById(userId);
    const isOnlineDB = user && user.status === 'online' && user.activeSessions && user.activeSessions.length > 0;
    console.log(`🔍 Présence BDD ${userId}: ${isOnlineDB} (${user?.activeSessions?.length} sessions)`);
    return isOnlineDB;
  } catch (error) {
    console.log('⚠️ Erreur vérification présence avancée:', error.message);
    const userRoom = io?.sockets?.adapter?.rooms?.get(`user_${userId}`);
    const isOnlineWS = userRoom && userRoom.size > 0;
    console.log(`🔍 Présence WebSocket ${userId}: ${isOnlineWS}`);
    return isOnlineWS;
  }
}

async function areNotificationsEnabled(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) return true;
    if (user.notificationPreferences && user.notificationPreferences.pushEnabled === false) {
      return false;
    }
    return true;
  } catch (error) {
    console.log('⚠️ Erreur vérification notifications:', error.message);
    return true;
  }
}

async function shouldSendPushNotification(userId) {
  try {
    const user = await User.findById(userId);
    
    if (!user) return true;
    
    if (user.notificationPreferences && user.notificationPreferences.pushEnabled === false) {
      console.log(`🔕 Notifications désactivées pour: ${user.username}`);
      return false;
    }
    
    if (user.notificationPreferences && user.notificationPreferences.quietHours && user.notificationPreferences.quietHours.enabled) {
      const now = new Date();
      const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
      const { start, end } = user.notificationPreferences.quietHours;
      
      if (currentTime >= start || currentTime <= end) {
        console.log(`🌙 Heures silencieuses pour: ${user.username} (${start}-${end})`);
        return false;
      }
    }
    
    return true;
    
  } catch (error) {
    console.log('⚠️ Erreur vérification push:', error.message);
    return true;
  }
}