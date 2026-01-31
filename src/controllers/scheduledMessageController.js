// backend/controllers/scheduledMessageController.js
import ScheduledMessage from '../models/ScheduledMessage.js';
import { messageController } from './messageController.js';
import mongoose from 'mongoose';

export const scheduledMessageController = {
  // Créer un message programmé
  createScheduledMessage: async (req, res) => {
    try {
      const { conversationId, content, typeMessage, scheduledFor, fileUrl, fileName, fileType } = req.body;
      const senderId = req.user.id;

      // Validation
      if (!conversationId || !content || !scheduledFor) {
        return res.status(400).json({
          success: false,
          error: 'conversationId, content et scheduledFor sont requis'
        });
      }

      const scheduledDate = new Date(scheduledFor);
      if (scheduledDate <= new Date()) {
        return res.status(400).json({
          success: false,
          error: 'La date doit être dans le futur'
        });
      }

      const scheduledMessage = await ScheduledMessage.create({
        conversationId,
        senderId,
        content,
        typeMessage: typeMessage || 'text',
        scheduledFor: scheduledDate,
        fileUrl,
        fileName,
        fileType,
        status: 'pending'
      });

      console.log('📅 Message programmé créé:', scheduledMessage._id, 'pour', scheduledDate);

      res.json({
        success: true,
        scheduledMessage,
        message: 'Message programmé avec succès'
      });
    } catch (error) {
      console.error('❌ Erreur création message programmé:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Récupérer les messages programmés d'une conversation
  getScheduledMessages: async (req, res) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user.id;

      const scheduledMessages = await ScheduledMessage.find({
        conversationId,
        senderId: userId,
        status: 'pending'
      })
        .sort({ scheduledFor: 1 })
        .populate('senderId', 'username profilePicture');

      res.json({
        success: true,
        scheduledMessages
      });
    } catch (error) {
      console.error('❌ Erreur récupération messages programmés:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Annuler un message programmé
  cancelScheduledMessage: async (req, res) => {
    try {
      const { messageId } = req.params;
      const userId = req.user.id;

      const scheduledMessage = await ScheduledMessage.findOne({
        _id: messageId,
        senderId: userId,
        status: 'pending'
      });

      if (!scheduledMessage) {
        return res.status(404).json({
          success: false,
          error: 'Message programmé non trouvé'
        });
      }

      scheduledMessage.status = 'cancelled';
      await scheduledMessage.save();

      console.log('🚫 Message programmé annulé:', messageId);

      res.json({
        success: true,
        message: 'Message programmé annulé'
      });
    } catch (error) {
      console.error('❌ Erreur annulation message programmé:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Modifier un message programmé
  updateScheduledMessage: async (req, res) => {
    try {
      const { messageId } = req.params;
      const { content, scheduledFor } = req.body;
      const userId = req.user.id;

      const scheduledMessage = await ScheduledMessage.findOne({
        _id: messageId,
        senderId: userId,
        status: 'pending'
      });

      if (!scheduledMessage) {
        return res.status(404).json({
          success: false,
          error: 'Message programmé non trouvé'
        });
      }

      if (content) scheduledMessage.content = content;
      if (scheduledFor) {
        const newDate = new Date(scheduledFor);
        if (newDate <= new Date()) {
          return res.status(400).json({
            success: false,
            error: 'La date doit être dans le futur'
          });
        }
        scheduledMessage.scheduledFor = newDate;
      }

      await scheduledMessage.save();

      res.json({
        success: true,
        scheduledMessage,
        message: 'Message programmé modifié'
      });
    } catch (error) {
      console.error('❌ Erreur modification message programmé:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Fonction pour envoyer les messages programmés (appelée par le cron)
  sendScheduledMessages: async (io) => {
    try {
      const now = new Date();
      
      const messagesToSend = await ScheduledMessage.find({
        status: 'pending',
        scheduledFor: { $lte: now }
      }).populate('senderId', 'username profilePicture');

      console.log(`⏰ ${messagesToSend.length} messages programmés à envoyer`);

      for (const scheduledMsg of messagesToSend) {
        try {
          // Créer le message réel
          const messageData = {
            conversationId: scheduledMsg.conversationId,
            content: scheduledMsg.content,
            typeMessage: scheduledMsg.typeMessage
          };

          const sentMessage = await messageController.createMessage(
            messageData,
            io,
            scheduledMsg.senderId._id
          );

          // Marquer comme envoyé
          scheduledMsg.status = 'sent';
          scheduledMsg.sentAt = new Date();
          await scheduledMsg.save();

          console.log('✅ Message programmé envoyé:', scheduledMsg._id);

        } catch (error) {
          console.error('❌ Erreur envoi message programmé:', error);
          scheduledMsg.status = 'failed';
          scheduledMsg.error = error.message;
          await scheduledMsg.save();
        }
      }
    } catch (error) {
      console.error('❌ Erreur traitement messages programmés:', error);
    }
  }
};