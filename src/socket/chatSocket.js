import { messageController } from '../controllers/messageController.js';
import { conversationController } from '../controllers/conversationController.js';
import Participants from '../models/Participants.js';
import User from '../models/User.js';

export const configureChatSockets = (io) => {
  console.log('🔧 WebSocket configuré - Système présence avancé activé');
  
  // 🆕 STOCKAGE PRÉSENCE AVANCÉ
  const userPresence = new Map();
  
  io.on('connection', (socket) => {
    console.log('🔗 User connecté:', socket.id);
    
    // 🆕 GESTION PRÉSENCE UTILISATEUR
    let currentUserId = null;
    let presenceInterval = null;

    // 🆕 REJOINDRE LA SALLE DE NOTIFICATIONS PERSONNELLE
    socket.on('join_notifications', async (userId) => {
      try {
        if (!userId) {
          throw new Error('User ID requis');
        }
        
        currentUserId = userId;
        socket.join(`user_${userId}`);
        
        // 🆕 METTRE À JOUR LA PRÉSENCE AVANCÉE
        await updateUserPresence(userId, socket.id, 'online');
        
        console.log(`🔔 User ${userId} a rejoint ses notifications (présence: online)`);
        
        // 🆕 NOTIFIER LES CONTACTS DE LA PRÉSENCE
        notifyUserPresence(io, userId, 'online');
        
        // 🆕 DÉMARRER LE HEARTBEAT CORRECT
        presenceInterval = startPresenceHeartbeat(userId);
        
      } catch (error) {
        socket.emit('notification_error', { message: error.message });
      }
    });

    // Événements existants inchangés
    socket.on('join_conversation', (conversationId) => {
      try {
        if (!conversationId || typeof conversationId !== 'string') {
          throw new Error('ID de conversation invalide');
        }
        socket.join(conversationId);
        console.log(`📱 User ${socket.id} a rejoint: ${conversationId}`);
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('leave_conversation', (conversationId) => {
      socket.leave(conversationId);
      console.log(`📱 User ${socket.id} a quitté: ${conversationId}`);
    });

    socket.on('user_typing', async (data) => {
      try {
        const { conversationId, userId, isTyping, userName } = data;
        
        if (!conversationId || !userId) {
          throw new Error('Données typing incomplètes');
        }

        console.log(`⌨️ User ${userName || userId} ${isTyping ? 'typing...' : 'stopped typing'} in ${conversationId}`);
        
        socket.to(conversationId).emit('user_typing', {
          userId: userId,
          isTyping: isTyping,
          conversationId: conversationId,
          userName: userName,
          timestamp: new Date()
        });
        
        // 🆕 METTRE À JOUR L'ACTIVITÉ
        if (userId) {
          await updateUserActivity(userId, socket.id);
        }
        
      } catch (error) {
        console.error('💥 Erreur typing indicator:', error.message);
        socket.emit('error', { message: 'Erreur typing indicator' });
      }
    });

    socket.on('get_conversation_history', async (data) => {
      try {
        console.log('📜 Demande historique:', data);
        const { conversationId, userId } = data;
        
        const messages = await messageController.getConversationMessages(conversationId);
        
        socket.emit('conversation_history', {
          success: true,
          messages: messages,
          conversationId: conversationId
        });
        
        console.log(`📜 Historique envoyé: ${messages.length} messages`);
        
      } catch (error) {
        console.error('💥 Erreur historique:', error.message);
        socket.emit('conversation_history', {
          success: false,
          error: error.message
        });
      }
    });

    // 🆕 ÉVÉNEMENT ENVOI MESSAGE - AVEC SYSTÈME INTELLIGENT
    socket.on('send_message', async (data) => {
      console.log('📨 Message reçu:', data);
      
      try {
        let messageData = data;
        
        if (typeof data === 'string') {
          messageData = JSON.parse(data);
        }

        const requiredFields = ['Id_sender', 'content'];
        const missingFields = requiredFields.filter(field => !messageData[field]);
        
        if (missingFields.length > 0) {
          throw new Error(`Champs manquants: ${missingFields.join(', ')}`);
        }

        if (messageData.conversationId) {
          await conversationController.checkUserAuthorization(
            messageData.Id_sender, 
            messageData.conversationId
          );
        }

        // 💾 SAUVEGARDE DU MESSAGE AVEC IO POUR LES NOTIFICATIONS INTELLIGENTES
        const savedMessage = await messageController.createMessage(messageData, io);

        // 🆕 METTRE À JOUR L'ACTIVITÉ DE L'EXPÉDITEUR
        await updateUserActivity(messageData.Id_sender, socket.id);

        // Réponse à l'émetteur
        const senderResponse = {
          event: 'message_sent',
          success: true,
          data: savedMessage,
          timestamp: new Date(),
          socketId: socket.id
        };
        socket.emit('message_sent', senderResponse);

        // Diffusion du message à tous les participants
        const broadcastMessage = {
          event: 'new_message',
          data: savedMessage,
          timestamp: new Date()
        };
        io.to(savedMessage.conversationId.toString()).emit('new_message', broadcastMessage);
        
        console.log('🎉 Message diffusé - ID:', savedMessage._id);

      } catch (error) {
        console.error('💥 Erreur traitement message:', error.message);
        
        const errorResponse = {
          event: 'message_error',
          success: false,
          error: error.message,
          timestamp: new Date(),
          socketId: socket.id
        };
        
        socket.emit('message_sent', errorResponse);
      }
    });

    // 🆕 ÉVÉNEMENTS POUR LES COMPTEURS
    socket.on('get_unread_counts', async (data) => {
      try {
        const { userId } = data;
        
        // Récupère les conversations avec des messages non lus
        const conversations = await Participants.find({ 
          Id_User: userId 
        }).populate({
          path: 'Id_Conversation',
          match: { "unreadCounts.count": { $gt: 0 } },
          populate: { path: 'unreadCounts.userId' }
        });

        const unreadData = conversations
          .filter(p => p.Id_Conversation)
          .map(p => ({
            conversationId: p.Id_Conversation._id,
            unreadCount: p.Id_Conversation.unreadCounts.find(u => 
              u.userId.toString() === userId.toString()
            )?.count || 0
          }));

        const totalUnread = unreadData.reduce((sum, item) => sum + item.unreadCount, 0);

        socket.emit('unread_counts_data', {
          success: true,
          totalUnread: totalUnread,
          conversationCounts: unreadData
        });
        
      } catch (error) {
        socket.emit('notification_error', { message: error.message });
      }
    });

    socket.on('mark_conversation_read', async (data) => {
      try {
        const { conversationId, userId } = data;
        
        // Met à jour le compteur à 0
        const Conversation = await import('../models/Conversation.js');
        await Conversation.default.findOneAndUpdate(
          { _id: conversationId, "unreadCounts.userId": userId },
          { $set: { "unreadCounts.$.count": 0 } }
        );

        socket.emit('conversation_marked_read', {
          success: true,
          conversationId: conversationId
        });
        
      } catch (error) {
        socket.emit('notification_error', { message: error.message });
      }
    });

    // 🆕 ÉVÉNEMENT HEARTBEAT PRÉSENCE
    socket.on('user_heartbeat', async (data) => {
      if (currentUserId) {
        await updateUserActivity(currentUserId, socket.id);
        
        // Mettre à jour le statut en mémoire
        userPresence.set(currentUserId, {
          ...userPresence.get(currentUserId),
          lastSeen: new Date(),
          status: 'online'
        });
      }
    });

    // 🆕 ÉVÉNEMENT CHANGEMENT STATUT
    socket.on('user_status_change', async (data) => {
      if (currentUserId && data.status) {
        await updateUserStatus(currentUserId, data.status);
        notifyUserPresence(io, currentUserId, data.status);
      }
    });

    // Événements existants inchangés
    socket.on('ping', (data) => {
      socket.emit('pong', {
        event: 'pong',
        message: 'Serveur actif ✅',
        timestamp: new Date(),
        socketId: socket.id
      });
    });

    socket.on('mark_as_read', async (data) => {
      try {
        console.log('👀 Message marqué comme lu:', data);
        socket.emit('message_read', { success: true, messageId: data.messageId });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('disconnect', async (reason) => {
      console.log('🔴 User déconnecté:', socket.id, 'Raison:', reason);
      
      // 🆕 ARRÊTER LE HEARTBEAT CORRECTEMENT
      if (presenceInterval) {
        clearInterval(presenceInterval);
        presenceInterval = null;
      }
      
      // 🆕 METTRE À JOUR LA PRÉSENCE EN OFFLINE - CORRIGÉ
      if (currentUserId) {
        await removeUserSession(currentUserId, socket.id);
        
        // Vérifier si l'user n'a plus de sessions actives
        const remainingSessions = await getRemainingSessions(currentUserId);
        
        if (remainingSessions === 0) {
          await updateUserStatus(currentUserId, 'offline');
          notifyUserPresence(io, currentUserId, 'offline');
          console.log(`🔔 User ${currentUserId} est maintenant offline (0 sessions)`);
        } else {
          console.log(`🔔 User ${currentUserId} a ${remainingSessions} sessions restantes`);
        }
      }
    });

    socket.on('error', (error) => {
      console.error('💥 Erreur socket:', error);
    });
  });

  // 🆕 FONCTIONS HELPER PRÉSENCE AVANCÉE - CORRIGÉES
  
  async function updateUserPresence(userId, socketId, status = 'online') {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        {
          $set: { 
            status: status,
            lastSeen: new Date()
          },
          $push: {
            activeSessions: {
              socketId: socketId,
              deviceType: 'desktop',
              userAgent: 'test-browser',
              connectedAt: new Date(),
              lastActivity: new Date()
            }
          }
        },
        { new: true }
      );
      
      userPresence.set(userId, {
        socketId: socketId,
        lastSeen: new Date(),
        status: status,
        sessions: user?.activeSessions || []
      });
      
      console.log(`✅ Présence mise à jour: ${userId} - ${status}`);
      return user;
    } catch (error) {
      console.error('❌ Erreur mise à jour présence:', error);
    }
  }
  
  async function updateUserActivity(userId, socketId) {
    try {
      await User.updateOne(
        { 
          _id: userId, 
          "activeSessions.socketId": socketId 
        },
        { 
          $set: { 
            "activeSessions.$.lastActivity": new Date(),
            lastSeen: new Date()
          } 
        }
      );
    } catch (error) {
      console.error('❌ Erreur mise à jour activité:', error);
    }
  }
  
  async function updateUserStatus(userId, status) {
    try {
      await User.findByIdAndUpdate(userId, {
        status: status,
        lastSeen: new Date()
      });
      
      if (userPresence.has(userId)) {
        userPresence.set(userId, {
          ...userPresence.get(userId),
          status: status,
          lastSeen: new Date()
        });
      }
    } catch (error) {
      console.error('❌ Erreur mise à jour statut:', error);
    }
  }
  
  // 🆕 FONCTION CORRIGÉE POUR SUPPRIMER LES SESSIONS
  async function removeUserSession(userId, socketId) {
    try {
      console.log(`🗑️  Suppression session: ${socketId} pour user: ${userId}`);
      
      // 1. Supprimer de la BDD
      await User.findByIdAndUpdate(userId, {
        $pull: {
          activeSessions: { socketId: socketId }
        }
      });
      
      // 2. 🆕 CORRECTION : Mettre à jour la présence en mémoire
      if (userPresence.has(userId)) {
        const presence = userPresence.get(userId);
        
        // Filtrer les sessions pour enlever celle qui se déconnecte
        const beforeCount = presence.sessions ? presence.sessions.length : 0;
        presence.sessions = presence.sessions.filter(s => s.socketId !== socketId);
        const afterCount = presence.sessions ? presence.sessions.length : 0;
        
        console.log(`🔢 Sessions ${userId}: ${beforeCount} → ${afterCount}`);
        
        // Si plus de sessions, marquer comme offline
        if (afterCount === 0) {
          presence.status = 'offline';
          console.log(`🔔 User ${userId} marqué comme offline (0 sessions)`);
        }
      }
      
    } catch (error) {
      console.error('❌ Erreur suppression session:', error);
    }
  }
  
  // 🆕 FONCTION POUR COMPTER LES SESSIONS RÉELLES
  async function getRemainingSessions(userId) {
    try {
      const user = await User.findById(userId);
      return user?.activeSessions?.length || 0;
    } catch (error) {
      console.error('❌ Erreur comptage sessions:', error);
      return 0;
    }
  }
  

};