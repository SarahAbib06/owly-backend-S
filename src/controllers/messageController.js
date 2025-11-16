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
  createMessage: async (messageData, io = null) => {
    const { conversationId, Id_sender, Id_receiver, content, typeMessage = 'text' } = messageData;

    // 🎯 VÉRIFICATION IDs FORMAT
    if (!mongoose.Types.ObjectId.isValid(Id_sender)) {
      throw new Error('ID expéditeur invalide');
    }
    if (Id_receiver && !mongoose.Types.ObjectId.isValid(Id_receiver)) {
      throw new Error('ID destinataire invalide');
    }
    if (conversationId && !mongoose.Types.ObjectId.isValid(conversationId)) {
      throw new Error('ID conversation invalide');
    }

    // 🎯 VÉRIFICATION CONTENU
    if (!content || typeof content !== 'string') {
      throw new Error('Le contenu du message est requis et doit être une chaîne de caractères');
    }

    if (content.trim().length === 0) {
      throw new Error('Le message ne peut pas être vide');
    }

    if (content.length > 1000) {
      throw new Error('Le message est trop long (max 1000 caractères)');
    }

    // 🎯 VÉRIFICATION TYPE MESSAGE
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

    // 🆕 OPTIMISATION BULK : METTRE À JOUR LES COMPTEURS NON-LUS
    try {
      console.log('🔢 Mise à jour BULK des compteurs non-lus...');
      
      // Récupère tous les participants de la conversation
      const participants = await Participants.find({ 
        Id_Conversation: finalConversationId 
      });
      
      console.log(`👥 ${participants.length} participants trouvés`);
      
      // 🆕 OPÉRATIONS BULK POUR TOUS LES PARTICIPANTS
      const bulkOperations = [];
      const participantsToNotify = [];
      
      participants.forEach(participant => {
        if (participant.Id_User.toString() !== Id_sender.toString()) {
          participantsToNotify.push(participant.Id_User);
          
          // Opération pour incrémenter le compteur existant
          bulkOperations.push({
            updateOne: {
              filter: { 
                _id: finalConversationId,
                "unreadCounts.userId": participant.Id_User
              },
              update: { 
                $inc: { "unreadCounts.$.count": 1 },
                $set: { lastMessageAt: new Date() }
              }
            }
          });
        }
      });
      
      // 🆕 EXÉCUTER TOUTES LES OPÉRATIONS EN 1 SEUL APPEL
      if (bulkOperations.length > 0) {
        const bulkResult = await Conversation.bulkWrite(bulkOperations);
        console.log(`📈 BULK: ${bulkResult.modifiedCount} compteurs mis à jour`);
        
        // 🆕 CRÉER LES COMPTEURS MANQUANTS EN BULK AUSSI
        const missingCountersOps = [];
        const updatedConversation = await Conversation.findById(finalConversationId);
        
        for (const participantId of participantsToNotify) {
          const hasCounter = updatedConversation.unreadCounts.some(
            uc => uc.userId.toString() === participantId.toString()
          );
          
          if (!hasCounter) {
            missingCountersOps.push({
              updateOne: {
                filter: { _id: finalConversationId },
                update: { 
                  $push: { 
                    unreadCounts: { 
                      userId: participantId, 
                      count: 1 
                    } 
                  },
                  $set: { lastMessageAt: new Date() }
                }
              }
            });
          }
        }
        
        if (missingCountersOps.length > 0) {
          const missingResult = await Conversation.bulkWrite(missingCountersOps);
          console.log(`🆕 BULK: ${missingResult.modifiedCount} nouveaux compteurs créés`);
        }
      }
      
      console.log('✅ Compteurs non-lus optimisés (BULK)');
    } catch (error) {
      console.log('⚠️ Erreur compteurs BULK:', error.message);
    }

    // 🆕 OPTIMISATION : NOTIFICATIONS INTELLIGENTES AVEC PRÉSENCE
    try {
      console.log('🔔 Gestion intelligente des notifications...');
      
      // Récupérer les participants de la conversation
      const participants = await Participants.find({ 
        Id_Conversation: finalConversationId 
      }).populate('Id_User', 'username');
      
      // Récupérer le nom de l'expéditeur
      const sender = await User.findById(Id_sender);
      const senderName = sender?.username || 'Quelqu\'un';
      
      // 🆕 DEBUG AVANCÉ POUR VOIR LA LOGIQUE
      console.log('🔍 DEBUG - Logique notifications:');
      console.log('  - IO disponible:', !!io);
      console.log('  - Participants:', participants.length);
      
      // 🆕 LOGIQUE DE PRIORITÉ INTELLIGENTE AVEC PRÉSENCE
      for (let participant of participants) {
        if (participant.Id_User && participant.Id_User._id.toString() !== Id_sender.toString()) {
          const participantId = participant.Id_User._id.toString();
          const participantName = participant.Id_User.username || 'Utilisateur';
          
          // 🎯 DÉTERMINER SI ON ENVOIE WEBSOCKET OU PUSH (AVEC PRÉSENCE)
          const shouldSendWebSocket = io && await isUserOnlineAdvanced(io, participantId);
          const shouldSendPush = await shouldSendPushNotification(participantId);
          
          console.log(`🔍 ${participantName}:`);
          console.log(`    WebSocket: ${shouldSendWebSocket}`);
          console.log(`    Push: ${shouldSendPush}`);
          console.log(`    Décision: ${shouldSendWebSocket ? 'WebSocket UNIQUEMENT' : shouldSendPush ? 'Push UNIQUEMENT' : 'AUCUNE'}`);
          
          const notificationTitle = `Nouveau message de ${senderName}`;
          const notificationBody = content.length > 30 ? content.substring(0, 30) + '...' : content;
          const notificationData = {
            conversationId: finalConversationId.toString(),
            messageId: savedMessage._id.toString(),
            type: 'new_message',
            senderName: senderName
          };
          
          // 🆕 STRATÉGIE D'ENVOI OPTIMISÉE - UN SEUL TYPE DE NOTIFICATION
          if (shouldSendWebSocket) {
            console.log(`🔔 Envoi WebSocket UNIQUEMENT à: ${participantName} (en ligne)`);
            
            // 🚫 WEBSEUL SOCKET - PAS DE PUSH SI EN LIGNE
            io.to(`user_${participantId}`).emit('new_message_alert', {
              type: 'new_message',
              conversationId: finalConversationId,
              senderId: savedMessage.Id_sender,
              senderName: senderName,
              messagePreview: content.substring(0, 50),
              timestamp: new Date(),
              messageId: savedMessage._id
            });
            
          } else if (shouldSendPush) {
            console.log(`📱 Envoi Push UNIQUEMENT à: ${participantName} (hors ligne)`);
            
            // 🚫 PUSH UNIQUEMENT - PAS DE WEBSOCKET SI HORS LIGNE
            await pushNotificationService.sendToUser(
              participant.Id_User._id,
              notificationTitle,
              notificationBody,
              notificationData
            );
          } else {
            console.log(`⏸️  Aucune notification pour: ${participantName}`);
          }
        }
      }
      
      console.log('✅ Notifications intelligentes traitées');
    } catch (error) {
      console.log('⚠️ Erreur notifications intelligentes:', error.message);
    }

    // 🆕 RETOURNE LE MESSAGE
    return {
      _id: savedMessage._id,
      conversationId: finalConversationId,
      Id_sender: Id_sender,
      content: content.trim(),
      typeMessage: typeMessage,
      status: 'sent',
      timestamp: new Date()
    };
  },

  getConversationMessages: async (conversationId, page = 1, limit = 50) => {
    try {
      console.log(`🔍 Récupération messages conversation ${conversationId}, page ${page}`);
      
      // 🎯 VÉRIFICATION ID CONVERSATION
      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new Error('ID conversation invalide');
      }
      
      const skip = (page - 1) * limit;
      
      const messages = await Message.find({ conversationId: conversationId })
        .sort({ createdAt: -1 }) // 🆕 OPTIMISATION: Plus récents d'abord
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

  // 🆕 FONCTION POUR INITIALISER LA PRÉSENCE (partagée avec chatSockets)
  setUserPresence: (presenceMap) => {
    userPresence = presenceMap;
  }
};

// 🆕 FONCTION PRÉSENCE AVANCÉE (utilise userPresence partagée)
async function isUserOnlineAdvanced(io, userId) {
  try {
    // 🎯 VÉRIFICATION RAPIDE EN MÉMOIRE
    if (userPresence && userPresence.has(userId)) {
      const presence = userPresence.get(userId);
      const isOnline = presence.status === 'online' && presence.sessions && presence.sessions.length > 0;
      console.log(`🔍 Présence mémoire ${userId}: ${isOnline} (${presence.sessions?.length} sessions)`);
      return isOnline;
    }
    
    // 🎯 VÉRIFICATION EN BDD (fallback)
    const user = await User.findById(userId);
    const isOnlineDB = user && user.status === 'online' && user.activeSessions && user.activeSessions.length > 0;
    console.log(`🔍 Présence BDD ${userId}: ${isOnlineDB} (${user?.activeSessions?.length} sessions)`);
    
    return isOnlineDB;
    
  } catch (error) {
    console.log('⚠️ Erreur vérification présence avancée:', error.message);
    
    // 🎯 FALLBACK: Vérification WebSocket basique
    const userRoom = io.sockets.adapter.rooms.get(`user_${userId}`);
    const isOnlineWS = userRoom && userRoom.size > 0;
    console.log(`🔍 Présence WebSocket ${userId}: ${isOnlineWS}`);
    
    return isOnlineWS;
  }
}

async function shouldSendPushNotification(userId) {
  try {
    // 🆕 VÉRIFIER LES PRÉFÉRENCES UTILISATEUR
    const user = await User.findById(userId);
    
    if (!user) return true;
    
    // 🚫 USER A DÉSACTIVÉ LES NOTIFICATIONS
    if (user.notificationPreferences && user.notificationPreferences.pushEnabled === false) {
      console.log(`🔕 Notifications désactivées pour: ${user.username}`);
      return false;
    }
    
    // 🕒 HEURES SILENCIEUSES
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
    return true; // Fallback: envoyer la notification
  }
}