import Notification from '../models/Notification.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import Participants from '../models/Participants.js';
import User from '../models/User.js';
import mongoose from 'mongoose';

export const notificationController = {
  
  // 🎯 CRÉER UNE NOTIFICATION
  createNotification: async (notificationData) => {
    try {
      const { userId, fromUser, toUser, type, content, messageId } = notificationData;
      
      const notification = new Notification({
        userId: userId,
        fromUser: fromUser,
        toUser: toUser,
        type: type,
        content: content,
        messageId: messageId,
        isRead: false
      });

      const savedNotification = await notification.save();
      console.log('🔔 Notification créée:', savedNotification._id);
      
      return savedNotification;
    } catch (error) {
      console.error('❌ Erreur création notification:', error);
      throw error;
    }
  },

  // 🎯 NOTIFICATION POUR NOUVEAU MESSAGE
  notifyNewMessage: async (message, conversationId, io) => {
    try {
      // Récupérer les participants avec populate
      const participants = await Participants.find({ 
        Id_Conversation: conversationId 
      }).populate('Id_User');

      console.log('🔍 Participants trouvés:', participants.length);

      // 🆕 FILTRE SÉCURISÉ - UNIQUEMENT LES PARTICIPANTS AVEC USER VALIDE
      const validParticipants = participants.filter(participant => {
        if (!participant.Id_User || !participant.Id_User._id) {
          console.log('❌ Participant ignoré (User manquant):', participant._id);
          return false;
        }
        return participant.Id_User._id.toString() !== message.Id_sender.toString();
      });

      console.log('✅ Participants valides pour notifications:', validParticipants.length);

      // Créer une notification pour chaque participant valide
      const notificationPromises = validParticipants.map(async (participant) => {
        const userName = participant.Id_User.username || 'Utilisateur';

        console.log(`🔔 Notification pour: ${userName}`);

        // 🆕 CORRECTION : Ne pas planter si le compteur n'existe pas
        try {
          await Conversation.findOneAndUpdate(
            { 
              _id: conversationId,
              'unreadCounts.userId': participant.Id_User._id 
            },
            { $inc: { 'unreadCounts.$.count': 1 } }
          );
        } catch (error) {
          console.log('⚠️ Compteur non mis à jour, mais notification envoyée');
        }

        // Créer la notification
        const notification = await notificationController.createNotification({
          userId: participant.Id_User._id,
          fromUser: message.Id_sender,
          toUser: participant.Id_User._id,
          type: 'message',
          content: `Nouveau message de ${userName}: ${message.content.substring(0, 30)}...`,
          messageId: message._id
        });

        // Émettre via WebSocket
        io.to(`user_${participant.Id_User._id}`).emit('new_notification', {
          type: 'message',
          notification: notification,
          conversationId: conversationId,
          unreadCount: await notificationController.getUnreadCount(participant.Id_User._id)
        });

        return notification;
      });

      await Promise.all(notificationPromises);
      console.log(`🔔 Notifications envoyées à ${notificationPromises.length} utilisateurs`);

    } catch (error) {
      console.error('❌ Erreur notification nouveau message:', error);
    }
  },

  // 🎯 RÉCUPÉRER LES NOTIFICATIONS D'UN USER
  getUserNotifications: async (userId, limit = 20) => {
    try {
      // 🆕 VÉRIFICATION SÉCURISÉE - NE PLANTE PLUS
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        console.log('⚠️ ID utilisateur invalide pour notifications:', userId);
        return [];
      }

      const userExists = await User.findById(userId);
      if (!userExists) {
        console.log('⚠️ User non trouvé, retourne liste vide:', userId);
        return [];
      }

      const notifications = await Notification.find({ userId: userId })
        .populate('fromUser', 'username profilePicture')
        .populate('messageId')
        .sort({ createdAt: -1 })
        .limit(limit);

      console.log(`📋 ${notifications.length} notifications trouvées pour user ${userId}`);
      return notifications;
    } catch (error) {
      console.error('❌ Erreur récupération notifications:', error);
      return [];
    }
  },

  // 🎯 COMPTER LES NOTIFICATIONS NON LUES
  getUnreadCount: async (userId) => {
    try {
      // 🆕 VÉRIFICATION SÉCURISÉE - NE PLANTE PLUS
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        console.log('⚠️ ID utilisateur invalide pour count:', userId);
        return 0;
      }

      const userExists = await User.findById(userId);
      if (!userExists) {
        console.log('⚠️ User non trouvé pour count, retourne 0:', userId);
        return 0;
      }

      const count = await Notification.countDocuments({ 
        userId: userId, 
        isRead: false 
      });
      
      console.log(`🔢 ${count} notifications non lues pour user ${userId}`);
      return count;
    } catch (error) {
      console.error('❌ Erreur comptage notifications non lues:', error);
      return 0;
    }
  },

  // 🎯 MARQUER NOTIFICATION COMME LUE
  markAsRead: async (notificationId, userId) => {
    try {
      const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, userId: userId },
        { isRead: true },
        { new: true }
      );

      if (!notification) {
        throw new Error('Notification non trouvée');
      }

      console.log('✅ Notification marquée comme lue:', notificationId);
      return notification;
    } catch (error) {
      console.error('❌ Erreur marquage notification:', error);
      throw error;
    }
  },

  // 🎯 MARQUER TOUTES LES NOTIFICATIONS COMME LUES
  markAllAsRead: async (userId) => {
    try {
      const result = await Notification.updateMany(
        { userId: userId, isRead: false },
        { isRead: true }
      );

      console.log(`✅ ${result.modifiedCount} notifications marquées comme lues`);
      return result;
    } catch (error) {
      console.error('❌ Erreur marquage toutes notifications:', error);
      throw error;
    }
  },

  // 🎯 SUPPRIMER UNE NOTIFICATION
  deleteNotification: async (notificationId, userId) => {
    try {
      const result = await Notification.deleteOne({
        _id: notificationId,
        userId: userId
      });

      if (result.deletedCount === 0) {
        throw new Error('Notification non trouvée');
      }

      console.log('🗑️ Notification supprimée:', notificationId);
      return result;
    } catch (error) {
      console.error('❌ Erreur suppression notification:', error);
      throw error;
    }
  }
};

export default notificationController;