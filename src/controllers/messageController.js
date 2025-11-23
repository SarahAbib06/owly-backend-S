import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import Participants from '../models/Participants.js';
import User from '../models/User.js';
import { conversationController } from './conversationController.js';
import { pushNotificationService } from '../services/pushNotificationService.js';
import mongoose from 'mongoose';

// 🆕 VARIABLE GLOBALE POUR PRÉSENCE (partagée avec chatSockets.js)
let userPresence = new Map();

export const messageController = {
  createMessage: async (messageData, io = null, userIdFromToken = null) => {
    // 🎯 RÉCUPÉRATION Id_sender SÉCURISÉ
    const Id_sender = userIdFromToken;
    
    const { conversationId, Id_receiver, content, typeMessage = 'text' } = messageData;

    // 🎯 VÉRIFICATIONS
    if (!mongoose.Types.ObjectId.isValid(Id_sender)) {
      throw new Error('ID expéditeur invalide');
    }
    if (Id_receiver && !mongoose.Types.ObjectId.isValid(Id_receiver)) {
      throw new Error('ID destinataire invalide');
    }
    if (conversationId && !mongoose.Types.ObjectId.isValid(conversationId)) {
      throw new Error('ID conversation invalide');
    }

    if (!content || typeof content !== 'string') {
      throw new Error('Le contenu du message est requis');
    }

    if (content.trim().length === 0) {
      throw new Error('Le message ne peut pas être vide');
    }

    if (content.length > 1000) {
      throw new Error('Le message est trop long (max 1000 caractères)');
    }

    const allowedTypes = ['text', 'image', 'video', 'file'];
    if (!allowedTypes.includes(typeMessage)) {
      throw new Error(`Type de message non supporté: ${typeMessage}`);
    }

    // 🎯 DÉLÉGATION CONVERSATION
    let finalConversationId = conversationId;
    if (!conversationId) {
      const conversation = await conversationController.getOrCreateConversation(Id_sender, Id_receiver);
      finalConversationId = conversation._id;
    }

    // 🎯 CRÉATION MESSAGE
    const message = new Message({
      conversationId: finalConversationId,
      Id_sender: Id_sender,
      content: content.trim(),
      typeMessage: typeMessage,
      status: 'sent'
    });

    const savedMessage = await message.save();
    console.log('✅ Message sauvegardé:', savedMessage._id);

    // 🆕 COMPTEURS NON-LUS
    try {
      console.log('🔢 Mise à jour des compteurs non-lus...');
      
      let participants = [];
      const conversation = await Conversation.findById(finalConversationId);
      
      if (conversation && conversation.type === "group") {
        participants = conversation.Id_participant.map(userId => ({
          Id_User: userId
        }));
      } else {
        participants = await Participants.find({ 
          Id_Conversation: finalConversationId 
        });
      }
      
      for (let participant of participants) {
        const participantId = participant.Id_User.toString();
        
        if (participantId !== Id_sender.toString()) {
          await Conversation.findOneAndUpdate(
            { 
              _id: finalConversationId,
              "unreadCounts.userId": participantId
            },
            { 
              $inc: { "unreadCounts.$.count": 1 },
              $set: { lastMessageAt: new Date() }
            },
            { upsert: true, new: true }
          );
        }
      }
      
      console.log('✅ Compteurs non-lus mis à jour');
    } catch (error) {
      console.log('⚠️ Erreur compteurs:', error.message);
    }

    // 🆕 NOTIFICATIONS INTELLIGENTES AVEC DÉSACTIVATION COMPLÈTE
    try {
      console.log('🔔 Gestion intelligente des notifications...');
      
      let participants = [];
      const conversation = await Conversation.findById(finalConversationId);
      
      if (conversation && conversation.type === "group") {
        participants = conversation.Id_participant.map(userId => ({
          Id_User: { _id: userId }
        }));
      } else {
        participants = await Participants.find({ 
          Id_Conversation: finalConversationId 
        }).populate('Id_User', 'username');
      }
      
      const sender = await User.findById(Id_sender);
      const senderName = sender?.username || 'Quelqu\'un';
      
      // 🆕 LOGIQUE : RESPECT TOTAL DE LA DÉSACTIVATION
      for (let participant of participants) {
        const participantId = participant.Id_User._id.toString();
        
        if (participantId !== Id_sender.toString()) {
          const participantUser = await User.findById(participantId);
          const participantName = participantUser?.username || 'Utilisateur';
          
          // 🎯 VÉRIFIER SI LES NOTIFICATIONS SONT COMPLÈTEMENT DÉSACTIVÉES
          const notificationsEnabled = await areNotificationsEnabled(participantId);
          
          if (!notificationsEnabled) {
            console.log(`🔕 NOTIFICATIONS COMPLÈTEMENT DÉSACTIVÉES pour: ${participantName}`);
            continue; // 🚨 PAS DE NOTIFICATION DU TOUT (ni WebSocket ni Push)
          }
          
          // 🎯 SI NOTIFICATIONS ACTIVÉES, APPLIQUER LA LOGIQUE NORMALE
          const isUserOnline = await isUserOnlineAdvanced(io, participantId);
          
          console.log(`🔍 ${participantName}: En ligne=${isUserOnline}, Notifications=ACTIVÉES`);
          
          const notificationTitle = conversation?.type === "group" 
            ? `📦 ${conversation.groupName} - ${senderName}`
            : `Nouveau message de ${senderName}`;
            
          const notificationBody = content.length > 30 ? content.substring(0, 30) + '...' : content;
          
          if (isUserOnline && io) {
            console.log(`🔔 WebSocket à: ${participantName}`);
            
            io.to(`user_${participantId}`).emit('new_message_alert', {
              type: 'new_message',
              conversationId: finalConversationId,
              senderId: savedMessage.Id_sender,
              senderName: senderName,
              messagePreview: content.substring(0, 50),
              timestamp: new Date(),
              messageId: savedMessage._id,
              isGroup: conversation?.type === "group",
              groupName: conversation?.groupName
            });
            
          } else {
            console.log(`📱 Push notification à: ${participantName}`);
            
            await pushNotificationService.sendToUser(
              participantId,
              notificationTitle,
              notificationBody,
              {
                conversationId: finalConversationId.toString(),
                messageId: savedMessage._id.toString(),
                type: 'new_message',
                senderName: senderName,
                isGroup: conversation?.type === "group",
                groupName: conversation?.groupName
              }
            );
          }
        }
      }
      
      console.log('✅ Notifications intelligentes traitées');
    } catch (error) {
      console.log('⚠️ Erreur notifications:', error.message);
    }

    // Diffusion WebSocket du message (toujours envoyé, indépendant des notifications)
    if (io) {
      io.to(finalConversationId.toString()).emit('new_message', {
        _id: savedMessage._id,
        conversationId: finalConversationId,
        Id_sender: Id_sender,
        content: content.trim(),
        typeMessage: typeMessage,
        status: 'sent',
        timestamp: new Date(),
        isGroup: (await Conversation.findById(finalConversationId))?.type === "group"
      });
    }

    return {
      _id: savedMessage._id,
      conversationId: finalConversationId,
      Id_sender: Id_sender,
      content: content.trim(),
      typeMessage: typeMessage,
      status: 'sent',
      timestamp: new Date(),
      isGroup: (await Conversation.findById(finalConversationId))?.type === "group"
    };
  },

  getConversationMessages: async (conversationId, page = 1, limit = 50) => {
    try {
      console.log(`🔍 Récupération messages conversation ${conversationId}, page ${page}`);
      
      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new Error('ID conversation invalide');
      }
      
      const skip = (page - 1) * limit;
      
      const messages = await Message.find({ conversationId: conversationId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      
      console.log(`✅ ${messages.length} messages trouvés`);
      return messages;
      
    } catch (error) {
      console.error('❌ Erreur:', error);
      throw error;
    }
  },

  // 🆕 FONCTION POUR INITIALISER LA PRÉSENCE
  setUserPresence: (presenceMap) => {
    userPresence = presenceMap;
  },

  // 🆕 FONCTION POUR ENVOYER UN MESSAGE DANS UN GROUPE
  sendGroupMessage: async (groupId, senderId, content, typeMessage = 'text', io = null) => {
    const messageData = {
      conversationId: groupId,
      content: content,
      typeMessage: typeMessage
    };
    
    return await messageController.createMessage(messageData, io, senderId);
  }
};

// 🆕 FONCTION PRÉSENCE AVANCÉE
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
    
    const userRoom = io.sockets.adapter.rooms.get(`user_${userId}`);
    const isOnlineWS = userRoom && userRoom.size > 0;
    console.log(`🔍 Présence WebSocket ${userId}: ${isOnlineWS}`);
    
    return isOnlineWS;
  }
}

// 🆕 FONCTION : VÉRIFIER SI LES NOTIFICATIONS SONT ACTIVÉES
async function areNotificationsEnabled(userId) {
  try {
    const user = await User.findById(userId);
    
    if (!user) return true; // Par défaut activées si user non trouvé
    
    // 🎯 SI pushEnabled = false → NOTIFICATIONS COMPLÈTEMENT DÉSACTIVÉES
    if (user.notificationPreferences && user.notificationPreferences.pushEnabled === false) {
      return false;
    }
    
    return true;
    
  } catch (error) {
    console.log('⚠️ Erreur vérification notifications:', error.message);
    return true; // Par défaut activées en cas d'erreur
  }
}