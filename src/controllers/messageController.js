// controllers/messageController.js
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import Participants from '../models/Participants.js';
import User from '../models/User.js';
import Relation from '../models/Relation.js'; // AJOUTÉ
import { conversationController } from './conversationController.js';
import { pushNotificationService } from '../services/pushNotificationService.js';
import mongoose from 'mongoose';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.MESSAGE_ENCRYPTION_KEY || 'a'.repeat(64);
const ALGORITHM = 'aes-256-gcm';

function encryptMessage(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const payload = {
    iv: iv.toString('hex'),
    data: encrypted,
    tag: cipher.getAuthTag().toString('hex')
  };
  return JSON.stringify(payload);
}

function decryptMessage(storedContent) {
  if (!storedContent || typeof storedContent !== 'string') return '[Message vide]';
  if (!storedContent.startsWith('{') || !storedContent.includes(':')) {
    return storedContent;
  }
  try {
    const payload = JSON.parse(storedContent);
    if (!payload.iv || !payload.data || !payload.tag) throw new Error('Format invalide');
    const iv = Buffer.from(payload.iv, 'hex');
    const authTag = Buffer.from(payload.tag, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(payload.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.warn('Déchiffrement échoué:', error.message);
    return storedContent.length < 2000 ? storedContent : '[Message illisible]';
  }
}

let userPresence = new Map();

// NOUVELLE FONCTION : vérifie si un blocage existe dans les deux sens
async function isBlockedBetween(userId1, userId2) {
  if (!userId1 || !userId2) return false;
  const block1 = await Relation.findOne({ userId: userId1, contactId: userId2, status: 'blocked' });
  const block2 = await Relation.findOne({ userId: userId2, contactId: userId1, status: 'blocked' });
  return !!(block1 || block2);
}

export const messageController = {
  createMessage: async (messageData, io = null) => {
    const { conversationId, Id_sender, Id_receiver, content, typeMessage = 'text' } = messageData;

    // VALIDATIONS
    if (!mongoose.Types.ObjectId.isValid(Id_sender)) throw new Error('ID expéditeur invalide');
    if (Id_receiver && !mongoose.Types.ObjectId.isValid(Id_receiver)) throw new Error('ID destinataire invalide');
    if (conversationId && !mongoose.Types.ObjectId.isValid(conversationId)) throw new Error('ID conversation invalide');
    if (!content || typeof content !== 'string' || content.trim().length === 0) throw new Error('Contenu vide');
    if (content.length > 1000) throw new Error('Message trop long');

    const allowedTypes = ['text', 'image', 'video', 'audio', 'file', 'emojis'];
    if (!allowedTypes.includes(typeMessage)) throw new Error(`Type non supporté: ${typeMessage}`);

    // BLOCAGE : CONVERSATION DE GROUPE
    if (conversationId) {
      const participants = await Participants.find({ Id_Conversation: conversationId }).select('Id_User');
      for (const p of participants) {
        const pid = p.Id_User.toString();
        if (pid === Id_sender.toString()) continue;
        if (await isBlockedBetween(Id_sender, pid)) {
          return {
            _id: null,
            blocked: true,
            conversationId,
            message: "Vous avez été bloqué par un participant de cette conversation.",
            typeMessage: "system_blocked"
          };
        }
      }
    }
    // BLOCAGE : MESSAGE PRIVÉ
    else if (Id_receiver) {
      if (await isBlockedBetween(Id_sender, Id_receiver)) {
        return {
          _id: null,
          blocked: true,
          message: "Vous ne pouvez pas envoyer de message à cette personne.",
          typeMessage: "system_blocked"
        };
      }
    }

    // CRÉATION OU RÉCUPÉRATION DE LA CONVERSATION
    let finalConversationId = conversationId;
    if (!conversationId) {
      const conv = await conversationController.getOrCreateConversation(Id_sender, Id_receiver);
      finalConversationId = conv._id;
    }

    // CHIFFREMENT + SAUVEGARDE
    const encryptedContentString = encryptMessage(content.trim());

    const message = new Message({
      conversationId: finalConversationId,
      Id_sender: Id_sender,
      content: encryptedContentString,
      typeMessage,
      status: 'sent',
      time: new Date()
    });

    const savedMessage = await message.save();

    // MISE À JOUR COMPTEURS NON-LUS
    try {
      const participants = await Participants.find({ Id_Conversation: finalConversationId });
      const bulkOps = [];
      const toNotify = [];

      participants.forEach(p => {
        if (p.Id_User.toString() !== Id_sender.toString()) {
          toNotify.push(p.Id_User);
          bulkOps.push({
            updateOne: {
              filter: { _id: finalConversationId, "unreadCounts.userId": p.Id_User },
              update: { $inc: { "unreadCounts.$.count": 1 }, $set: { lastMessageAt: new Date() } }
            }
          });
        }
      });

      if (bulkOps.length > 0) {
        await Conversation.bulkWrite(bulkOps);
        const conv = await Conversation.findById(finalConversationId);
        const missing = [];
        for (const uid of toNotify) {
          if (!conv.unreadCounts?.some(u => u.userId.toString() === uid.toString())) {
            missing.push({
              updateOne: {
                filter: { _id: finalConversationId },
                update: { $push: { unreadCounts: { userId: uid, count: 1 } }, $set: { lastMessageAt: new Date() } }
              }
            });
          }
        }
        if (missing.length > 0) await Conversation.bulkWrite(missing);
      }
    } catch (err) {
      console.log('Erreur compteurs non-lus:', err.message);
    }

    // NOTIFICATIONS PUSH / SOCKET
    try {
      const participants = await Participants.find({ Id_Conversation: finalConversationId }).populate('Id_User', 'username');
      const sender = await User.findById(Id_sender);
      const senderName = sender?.username || 'Quelqu\'un';
      const preview = content.length > 30 ? content.substring(0, 30) + '...' : content;

      for (const p of participants) {
        if (p.Id_User?._id.toString() === Id_sender.toString()) continue;

        const userId = p.Id_User._id.toString();
        const online = io && await isUserOnlineAdvanced(io, userId);
        const pushOk = await shouldSendPushNotification(userId);

        if (online) {
          io.to(`user_${userId}`).emit('new_message_alert', {
            type: 'new_message',
            conversationId: finalConversationId,
            senderId: Id_sender,
            senderName,
            messagePreview: preview,
            timestamp: new Date(),
            messageId: savedMessage._id
          });
        } else if (pushOk) {
          await pushNotificationService.sendToUser(p.Id_User._id, `Nouveau message de ${senderName}`, preview, {
            conversationId: finalConversationId.toString(),
            messageId: savedMessage._id.toString(),
            type: 'new_message',
            senderName
          });
        }
      }
    } catch (err) {
      console.log('Erreur notification:', err.message);
    }

    // RETOUR AU FRONT (en clair)
    return {
      _id: savedMessage._id,
      conversationId: finalConversationId,
      Id_sender: Id_sender,
      content: content.trim(),
      typeMessage,
      status: 'sent',
      time: savedMessage.time
    };
  },

  getConversationMessages: async (conversationId, page = 1, limit = 50) => {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) throw new Error('ID conversation invalide');
    const skip = (page - 1) * limit;

    const messages = await Message.find({ conversationId })
      .sort({ time: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return messages.map(msg => ({
      ...msg,
      content: decryptMessage(msg.content)
    }));
  },

  setUserPresence: (map) => { userPresence = map; }
};

// Fonctions annexes (inchangées)
async function isUserOnlineAdvanced(io, userId) {
  if (userPresence?.has(userId)) {
    const p = userPresence.get(userId);
    return p.status === 'online' && p.sessions?.length > 0;
  }
  const user = await User.findById(userId);
  if (user?.status === 'online' && user?.activeSessions?.length > 0) return true;
  return io?.sockets?.adapter?.rooms?.get(`user_${userId}`)?.size > 0;
}

async function shouldSendPushNotification(userId) {
  try {
    const user = await User.findById(userId);
    if (!user?.notificationPreferences?.pushEnabled === false) return false;
    // ... ton code quiet hours
    return true;
  } catch {
    return true;
  }
}