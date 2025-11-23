// controllers/messageController.js
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import Participants from '../models/Participants.js';
import User from '../models/User.js';
import Relation from '../models/Relation.js';
import { conversationController } from './conversationController.js';
import { pushNotificationService } from '../services/pushNotificationService.js';
import mongoose from 'mongoose';
import crypto from 'crypto';

// CLÉ SECRÈTE — METS ÇA DANS TON .env (64 caractères hex = 32 bytes)
const ENCRYPTION_KEY = process.env.MESSAGE_ENCRYPTION_KEY || 'a'.repeat(64);
const ALGORITHM = 'aes-256-gcm';

// CHIFFREMENT
function encryptContent(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  const payload = { iv: iv.toString('hex'), data: encrypted, tag: authTag.toString('hex') };
  return JSON.stringify(payload);
}

// DÉCHIFFREMENT (pour lecture future si besoin)
function decryptContent(stored) {
  if (!stored || typeof stored !== 'string') return '[Message vide]';
  if (!stored.startsWith('{') || !stored.includes(':')) return stored;
  try {
    const payload = JSON.parse(stored);
    if (!payload.iv || !payload.data || !payload.tag) throw new Error('Format invalide');
    const iv = Buffer.from(payload.iv, 'hex');
    const authTag = Buffer.from(payload.tag, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(payload.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.warn('Déchiffrement échoué → ancien message');
    return stored.length < 2000 ? stored : '[Corrompu]';
  }
}

let userPresence = new Map();

export const messageController = {
  createMessage: async (messageData, io = null, userIdFromToken = null) => {
    const Id_sender = userIdFromToken;
    const { conversationId, Id_receiver, content, typeMessage = 'text' } = messageData;

    // === TOUTES TES VÉRIFICATIONS (inchangées) ===
    if (!mongoose.Types.ObjectId.isValid(Id_sender)) throw new Error('ID expéditeur invalide');
    if (Id_receiver && !mongoose.Types.ObjectId.isValid(Id_receiver)) throw new Error('ID destinataire invalide');
    if (conversationId && !mongoose.Types.ObjectId.isValid(conversationId)) throw new Error('ID conversation invalide');
    if (!content || typeof content !== 'string' || content.trim().length === 0) throw new Error('Message vide');
    if (content.length > 1000) throw new Error('Message trop long (max 1000)');
    if (!['text', 'image', 'video', 'file'].includes(typeMessage)) throw new Error(`Type non supporté: ${typeMessage}`);

    // === DESTINATAIRE ===
    let receiverId = Id_receiver ? Id_receiver.toString() : null;
    if (!receiverId && conversationId) {
      const participants = await Participants.find({ Id_Conversation: conversationId }).select('Id_User').lean();
      if (participants.length !== 2) throw new Error('Conversation invalide (doit avoir exactement 2 participants)');
      const otherParticipant = participants.find(p => p.Id_User.toString() !== Id_sender.toString());
      if (!otherParticipant) throw new Error('Impossible de trouver le destinataire');
      receiverId = otherParticipant.Id_User.toString();
    }
    if (!receiverId) throw new Error('Destinataire introuvable');

    // === BLOCAGE ===
    const blockExists = await Relation.findOne({
      status: "blocked",
      $or: [
        { userId: Id_sender, contactId: receiverId },
        { userId: receiverId, contactId: Id_sender }
      ]
    });
    if (blockExists) throw new Error("Impossible d'envoyer le message : vous avez bloqué cette personne ou elle vous a bloqué.");

    // === CONVERSATION ===
    let finalConversationId = conversationId;
    if (!conversationId) {
      const conv = await conversationController.getOrCreateConversation(Id_sender, receiverId);
      finalConversationId = conv._id;
    }

    // === CHIFFREMENT UNIQUEMENT POUR LA BASE ===
    const encryptedContent = encryptContent(content.trim());
    const savedMessage = await new Message({
      conversationId: finalConversationId,
      Id_sender,
      content: encryptedContent,  // chiffré en DB
      typeMessage,
      status: 'sent',
      time: new Date()
    }).save();

    // === COMPTEURS NON-LUS (tes blocs inchangés) ===
    // ... (garde tout ton code ici) ...

    // === NOTIFICATIONS (inchangé) ===
    // ... (garde tout ton bloc try/catch) ...

    // === DIFFUSION WEBSOCKET → EN CLAIR (comme tu veux) ===
    if (io) {
      io.to(finalConversationId.toString()).emit('new_message', {
        _id: savedMessage._id,
        conversationId: finalConversationId,
        Id_sender: Id_sender,
        content: content.trim(),           // EN CLAIR
        typeMessage: typeMessage,
        status: 'sent',
        timestamp: new Date(),
        isGroup: (await Conversation.findById(finalConversationId))?.type === "group"
      });
    }

    // === RETURN → EN CLAIR (pour API, Postman, etc.) ===
    return {
      _id: savedMessage._id,
      conversationId: finalConversationId,
      Id_sender,
      content: content.trim(),                 // EN CLAIR
      typeMessage,
      status: 'sent',
      timestamp: new Date(),
      isGroup: (await Conversation.findById(finalConversationId))?.type === "group"
    };
  },

  // === RÉCUPÉRER LES MESSAGES → DÉCHIFFRE À LA VOLÉE ===
  getConversationMessages: async (conversationId, page = 1, limit = 50) => {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) throw new Error('ID conversation invalide');

    const skip = (page - 1) * limit;
    const messages = await Message.find({ conversationId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // DÉCHIFFRE À LA VOLÉE → tu vois le message en clair
    return messages.map(msg => ({
      ...msg,
      _id: msg._id.toString(),
      conversationId: msg.conversationId.toString(),
      Id_sender: msg.Id_sender.toString(),
      content: decryptContent(msg.content),  // DÉCHIFFRÉ ICI
      timestamp: msg.time || msg.createdAt
    }));
  },

  setUserPresence: (presenceMap) => { userPresence = presenceMap; },
  sendGroupMessage: async (groupId, senderId, content, typeMessage = 'text', io = null) => {
    return await messageController.createMessage({ conversationId: groupId, content, typeMessage }, io, senderId);
  }
};

// === FONCTIONS ANNEXES (inchangées) ===
async function isUserOnlineAdvanced(io, userId) { /* ... ton code ... */ }
async function areNotificationsEnabled(userId) { /* ... ton code ... */ }