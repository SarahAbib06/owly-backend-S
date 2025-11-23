import { messageController } from '../controllers/messageController.js';
import { conversationController } from '../controllers/conversationController.js';
import Participants from '../models/Participants.js';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import jwt from 'jsonwebtoken';

export const configureChatSockets = (io) => {
  console.log('🔧 WebSocket configuré - Système présence avancé activé');
  
  // 🆕 STOCKAGE PRÉSENCE AVANCÉ
  const userPresence = new Map();
  
  // 🆕 PARTAGE DE LA PRÉSENCE AVEC LE CONTROLLER
  messageController.setUserPresence(userPresence);

  // 🆕 MIDDLEWARE AUTHENTIFICATION WEBSOCKET
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
      
      if (!token) {
        return next(new Error('Token manquant'));
      }

      const cleanToken = token.replace('Bearer ', '');
      const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET);
      
      const user = await User.findById(decoded.id);
      if (!user) {
        return next(new Error('Utilisateur non trouvé'));
      }

      socket.userId = user._id.toString();
      socket.username = user.username;
      next();
    } catch (error) {
      console.error('❌ Auth WebSocket failed:', error.message);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    console.log('🔗 User connecté:', socket.userId, '- Socket:', socket.id);
    
    let presenceInterval = null;

    // 🆕 JOIN NOTIFICATIONS AVEC USERID DU TOKEN
    socket.on('join_notifications', async () => {
      try {
        const userId = socket.userId;
        
        socket.join(`user_${userId}`);
        
        // 🆕 METTRE À JOUR LA PRÉSENCE AVANCÉE
        await updateUserPresence(userId, socket.id, 'online');
        
        console.log(`🔔 User ${userId} a rejoint ses notifications (présence: online)`);
        
        // 🆕 NOTIFIER LES CONTACTS DE LA PRÉSENCE
        notifyUserPresence(io, userId, 'online');
        
        // 🆕 DÉMARRER LE HEARTBEAT
        presenceInterval = startPresenceHeartbeat(userId, socket.id);
        
      } catch (error) {
        socket.emit('notification_error', { message: error.message });
      }
    });

    // Événements existants
    socket.on('join_conversation', (conversationId) => {
      try {
        if (!conversationId || typeof conversationId !== 'string') {
          throw new Error('ID de conversation invalide');
        }
        socket.join(conversationId);
        console.log(`📱 User ${socket.userId} a rejoint: ${conversationId}`);
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('leave_conversation', (conversationId) => {
      socket.leave(conversationId);
      console.log(`📱 User ${socket.userId} a quitté: ${conversationId}`);
    });

    socket.on('user_typing', async (data) => {
      try {
        const { conversationId, isTyping } = data;
        
        if (!conversationId) {
          throw new Error('ID conversation requis');
        }

        console.log(`⌨️ User ${socket.username} ${isTyping ? 'typing...' : 'stopped typing'} in ${conversationId}`);
        
        socket.to(conversationId).emit('user_typing', {
          userId: socket.userId,
          isTyping: isTyping,
          conversationId: conversationId,
          userName: socket.username,
          timestamp: new Date()
        });
        
        // METTRE À JOUR L'ACTIVITÉ
        await updateUserActivity(socket.userId, socket.id);
        
      } catch (error) {
        console.error('💥 Erreur typing indicator:', error.message);
        socket.emit('error', { message: 'Erreur typing indicator' });
      }
    });

    socket.on('get_conversation_history', async (data) => {
      try {
        console.log('📜 Demande historique:', data);
        const { conversationId } = data;
        
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

    // 🆕 ÉVÉNEMENT ENVOI MESSAGE SÉCURISÉ
    socket.on('send_message', async (data) => {
      console.log('📨 Message reçu:', data);
      
      try {
        let messageData = data;
        
        if (typeof data === 'string') {
          messageData = JSON.parse(data);
        }

        const requiredFields = ['content'];
        const missingFields = requiredFields.filter(field => !messageData[field]);
        
        if (missingFields.length > 0) {
          throw new Error(`Champs manquants: ${missingFields.join(', ')}`);
        }

        // Vérification autorisation si conversationId fourni
        if (messageData.conversationId) {
          await conversationController.checkUserAuthorization(
            socket.userId, 
            messageData.conversationId
          );
        }

        const finalMessageData = {
          ...messageData,
          Id_sender: socket.userId // ← SÉCURISÉ DU TOKEN
        };

        // SAUVEGARDE DU MESSAGE
        const savedMessage = await messageController.createMessage(finalMessageData, io, socket.userId);

        // METTRE À JOUR L'ACTIVITÉ
        await updateUserActivity(socket.userId, socket.id);

        // Réponse à l'émetteur
        socket.emit('message_sent', {
          success: true,
          data: savedMessage,
          timestamp: new Date()
        });

        console.log('🎉 Message diffusé - ID:', savedMessage._id);

      } catch (error) {
        console.error('💥 Erreur traitement message:', error.message);
        
        socket.emit('message_error', {
          success: false,
          error: error.message,
          timestamp: new Date()
        });
      }
    });

    // ÉVÉNEMENTS COMPTEURS
    socket.on('get_unread_counts', async () => {
      try {
        const userId = socket.userId;
        
        const conversations = await Participants.find({ 
          Id_User: userId 
        }).populate({
          path: 'Id_Conversation',
          match: { "unreadCounts.count": { $gt: 0 } }
        });

        const unreadData = conversations
          .filter(p => p.Id_Conversation)
          .map(p => ({
            conversationId: p.Id_Conversation._id,
            unreadCount: p.Id_Conversation.unreadCounts.find(u => 
              u.userId.toString() === userId
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
        const { conversationId } = data;
        const userId = socket.userId;
        
        await Conversation.findOneAndUpdate(
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

    // ÉVÉNEMENT HEARTBEAT PRÉSENCE
    socket.on('user_heartbeat', async () => {
      const userId = socket.userId;
      await updateUserActivity(userId, socket.id);
      
      userPresence.set(userId, {
        ...userPresence.get(userId),
        lastSeen: new Date(),
        status: 'online'
      });
    });

    // ÉVÉNEMENT CHANGEMENT STATUT
    socket.on('user_status_change', async (data) => {
      if (data.status) {
        await updateUserStatus(socket.userId, data.status);
        notifyUserPresence(io, socket.userId, data.status);
      }
    });

    // Événements existants
    socket.on('ping', () => {
      socket.emit('pong', {
        message: 'Serveur actif ✅',
        timestamp: new Date()
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

    // 🆕 DÉCONNEXION ROBUSTE
    socket.on('disconnect', async (reason) => {
      console.log('🔴 User déconnecté:', socket.userId, '- Raison:', reason);
      
      // NETTOYAGE INTERVAL
      if (presenceInterval) {
        clearInterval(presenceInterval);
        presenceInterval = null;
      }
      
      // GARANTIR LA DÉCONNEXION
      if (socket.userId) {
        await removeUserSession(socket.userId, socket.id);
        
        const remainingSessions = await getRemainingSessions(socket.userId);
        
        if (remainingSessions === 0) {
          await updateUserStatus(socket.userId, 'offline');
          notifyUserPresence(io, socket.userId, 'offline');
          console.log(`🔔 User ${socket.userId} est maintenant offline (0 sessions)`);
        } else {
          console.log(`🔔 User ${socket.userId} a ${remainingSessions} sessions restantes`);
        }
        
        // NETTOYAGE MÉMOIRE
        userPresence.delete(socket.userId);
      }
    });

    socket.on('error', (error) => {
      console.error('💥 Erreur socket:', error);
    });
  });

  // FONCTIONS HELPER PRÉSENCE AVANCÉE
  
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
              deviceType: 'web',
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
  
  // FONCTION CORRIGÉE POUR SUPPRIMER LES SESSIONS
  async function removeUserSession(userId, socketId) {
    try {
      console.log(`🗑️  Suppression session: ${socketId} pour user: ${userId}`);
      
      // Supprimer de la BDD
      await User.findByIdAndUpdate(userId, {
        $pull: {
          activeSessions: { socketId: socketId }
        }
      });
      
      // Mettre à jour la présence en mémoire
      if (userPresence.has(userId)) {
        const presence = userPresence.get(userId);
        
        if (presence.sessions) {
          const beforeCount = presence.sessions.length;
          presence.sessions = presence.sessions.filter(s => s.socketId !== socketId);
          const afterCount = presence.sessions.length;
          
          console.log(`🔢 Sessions ${userId}: ${beforeCount} → ${afterCount}`);
          
          if (afterCount === 0) {
            presence.status = 'offline';
            console.log(`🔔 User ${userId} marqué comme offline (0 sessions)`);
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Erreur suppression session:', error);
    }
  }
  
  async function getRemainingSessions(userId) {
    try {
      const user = await User.findById(userId);
      return user?.activeSessions?.length || 0;
    } catch (error) {
      console.error('❌ Erreur comptage sessions:', error);
      return 0;
    }
  }

  function startPresenceHeartbeat(userId, socketId) {
    return setInterval(async () => {
      if (userPresence.has(userId)) {
        await updateUserActivity(userId, socketId);
      }
    }, 30000); // 30 secondes
  }

  function notifyUserPresence(io, userId, status) {
    io.emit('user_presence_changed', {
      userId: userId,
      status: status,
      lastSeen: new Date()
    });
  }
};