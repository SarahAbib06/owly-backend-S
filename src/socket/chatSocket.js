 import { messageController } from "../controllers/messageController.js";
import { conversationController } from "../controllers/conversationController.js";
import { callController } from "../controllers/callController.js";
import Participants from "../models/Participants.js";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import Reaction from "../models/Reaction.js";
import Call from "../models/Call.js"; 
import jwt from "jsonwebtoken";
import { archiveSocketService } from "../services/archiveSocketService.js";

export const configureChatSockets = (io) => {
  console.log("🔧 WebSocket Chat configuré");

  const userPresence = new Map();
  // 🆕 STOCKAGE APPELS ACTIFS


// 🆕 AJOUTER ICI
const callTimeouts = new Map();

  // 🆕 STOCKAGE APPELS ACTIFS
  const activeCalls = new Map();

  // 🆕 PARTAGE DE LA PRÉSENCE AVEC LE CONTROLLER
  messageController.setUserPresence(userPresence);

  // 🆕 MIDDLEWARE AUTHENTIFICATION WEBSOCKET
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth.token || socket.handshake.headers.authorization;

      if (!token) {
        return next(new Error("Token manquant"));
      }

      const cleanToken = token.replace("Bearer ", "");
      const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET);

      const user = await User.findById(decoded.id);
      if (!user) {
        return next(new Error("Utilisateur non trouvé"));
      }

      socket.userId = user._id.toString();
      socket.username = user.username;
      next();
    } catch (error) {
      console.error("❌ Auth WebSocket failed:", error.message);
      next(new Error("Authentication failed"));
    }
  });

  // 🆕 FONCTION POUR SAUVEGARDER UN APPEL DANS LA BDD
  const saveCallToDB = async (callData) => {
    try {
      const { conversationId, callerId, receiverId, callType, status, duration, startTime } = callData;
      
      const callRecord = new Call({
        conversationId,
        callerId,
        receiverId,
        callType,
        startTime: startTime || new Date(),
        endTime: new Date(),
        duration: duration || 0,
        status
      });
      
      await callRecord.save();
      console.log(`✅ Appel sauvegardé dans la BDD: ${callRecord._id} (${callType}, ${status}, ${duration}s)`);
      return callRecord;
    } catch (error) {
      console.error('❌ Erreur sauvegarde appel:', error);
      return null;
    }
  };

  // 🆕 FONCTION POUR TROUVER LE RECEIVER ID DANS UNE CONVERSATION
  const findReceiverId = async (conversationId, callerId) => {
    try {
      const participants = await Participants.find({
        Id_Conversation: conversationId
      }).lean();
      
      const otherParticipant = participants.find(
        p => p.Id_User.toString() !== callerId.toString()
      );
      
      return otherParticipant?.Id_User || null;
    } catch (error) {
      console.error('❌ Erreur recherche receiverId:', error);
      return null;
    }
  };

  io.on("connection", (socket) => {
    console.log("🔗 User connecté au Chat:", socket.userId, "- Socket:", socket.id);

      // 🔥 AJOUTEZ CE LOG
  console.log('📋 userId type:', typeof socket.userId);
  console.log('📋 userId value:', socket.userId);

    let presenceInterval = null;
    // ==================== 🎯 RÉACTIONS EN TEMPS RÉEL ====================

    socket.on("join_message_reactions", (messageId) => {
      socket.join(`message_${messageId}`);
     
    });

    socket.on("leave_message_reactions", (messageId) => {
      socket.leave(`message_${messageId}`);
      
    });

    socket.on("add_reaction", async (data) => {
      try {
        const { messageId, emoji } = data;
        const userId = socket.userId;

        console.log("🎯 Ajout réaction via socket:", {
          messageId,
          emoji,
          userId,
        });

        if (!messageId || !emoji) {
          throw new Error("Message ID et emoji requis");
        }

        // Vérifier si la réaction existe déjà
        const existingReaction = await Reaction.findOne({
          Id_message: messageId,
          id_user: userId,
        });

        if (existingReaction) {
          socket.emit("reaction_error", {
            error: "Vous avez déjà réagi à ce message",
            messageId,
          });
          return;
        }

        // Créer la réaction
        const reaction = new Reaction({
          Id_message: messageId,
          id_user: userId,
          emoji
        });
        await reaction.save();
        await reaction.populate("id_user", "username avatar");

        // Récupérer le message
        const Message = await import("../models/Message.js");
        const message = await Message.default.findById(messageId);

        // Diffuser
        socket.to(`message_${messageId}`).emit("reaction_added", {
          reaction,
          messageId,
          userId,
          timestamp: new Date(),
        });
        
        if (message && message.conversationId) {
          io.to(message.conversationId.toString()).emit(
            "conversation_reaction_update",
            {
              type: "reaction_added",
              messageId: messageId,
              conversationId: message.conversationId,
              reaction: reaction,
              user: reaction.id_user,
              timestamp: new Date(),
            }
          );
        }

        socket.emit("reaction_added_success", {
          reaction,
          messageId,
          timestamp: new Date(),
        });

        console.log(
          `✅ Réaction ajoutée en temps réel: ${emoji} sur message ${messageId}`
        );
      } catch (error) {
        console.error("💥 Erreur ajout réaction socket:", error);
        socket.emit("reaction_error", {
          error: error.message,
          code: error.code,
        });
      }
    });

    socket.on("remove_reaction", async (data) => {
      try {
        const { messageId } = data;
        const userId = socket.userId;

        console.log("🗑️ Suppression réaction via socket:", {
          messageId,
          userId,
        });

        const reaction = await Reaction.findOneAndDelete({
          Id_message: messageId,
          id_user: userId,
        });

        if (!reaction) {
          socket.emit("reaction_error", {
            error: "Réaction non trouvée",
            messageId,
          });
          return;
        }

        // Récupérer le message
        const Message = await import("../models/Message.js");
        const message = await Message.default.findById(messageId);

        // Diffuser la suppression
        socket.to(`message_${messageId}`).emit("reaction_removed", {
          messageId,
          userId,
          emoji: reaction.emoji,
          timestamp: new Date(),
        });

        if (message && message.conversationId) {
          io.to(message.conversationId.toString()).emit(
            "conversation_reaction_update",
            {
              type: "reaction_removed",
              messageId: messageId,
              conversationId: message.conversationId,
              reaction: reaction,
              user: { _id: userId },
              timestamp: new Date(),
            }
          );
        }

        socket.emit("reaction_removed_success", {
          messageId,
          timestamp: new Date(),
        });
        console.log(
          `✅ Réaction supprimée en temps réel sur message ${messageId}`
        );
      } catch (error) {
        console.error("💥 Erreur suppression réaction socket:", error);
        socket.emit("reaction_error", { error: error.message });
      }
    });

    socket.on("get_message_reactions", async (data) => {
      try {
        const { messageId } = data;
        const reactions = await Reaction.find({ Id_message: messageId })
          .populate("id_user", "username avatar")
          .sort({ time: -1 });

        socket.emit("message_reactions_data", {
          success: true,
          messageId,
          reactions,
          count: reactions.length,
        });
      } catch (error) {
        socket.emit("reaction_error", { error: error.message });
      }
    });

    // ==================== 🔊 MESSAGES VOCAUX EN TEMPS RÉEL ====================

    socket.on("audio_stream_start", (data) => {
      const { conversationId, userId } = data;
      console.log("🎤 Début enregistrement audio - User:", userId);

      socket.to(conversationId).emit("user_recording_audio", {
        userId: userId,
        userName: socket.username || "Utilisateur",
        conversationId: conversationId,
        timestamp: new Date(),
      });
    });

    socket.on("audio_stream_stop", (data) => {
      const { conversationId, userId } = data;
      console.log("⏹️ Fin enregistrement audio - User:", userId);

      socket.to(conversationId).emit("user_stopped_recording", {
        userId: userId,
        conversationId: conversationId,
        timestamp: new Date(),
      });
    });

    socket.on("audio_message_played", (data) => {
      const { messageId, userId, conversationId } = data;
      console.log("🔊 Message audio joué:", messageId);

      socket.to(conversationId).emit("audio_message_status", {
        messageId: messageId,
        userId: userId,
        status: "played",
        timestamp: new Date(),
      });
    });

    socket.on("audio_message_download", (data) => {
      const { messageId, userId } = data;
      console.log("📥 Téléchargement message audio:", messageId);

      socket.emit("audio_download_started", {
        messageId: messageId,
        timestamp: new Date(),
      });
    });

    socket.on("audio_upload_success", (data) => {
      const { conversationId, message } = data;
      console.log("✅ Upload audio réussi - Diffusion en temps réel");

      io.to(conversationId).emit("new_audio_message", {
        type: "audio",
        message: message,
        conversationId: conversationId,
        timestamp: new Date(),
      });
    });

    // ==================== TRANSFERT DE MESSAGE (FORWARD) EN TEMPS RÉEL ====================
    // Événement déclenché depuis le frontend quand l'utilisateur clique sur "Transférer"
    socket.on("forward_message", async (data) => {
      try {
        const { messageId, targetConversationId } = data;
        const userId = socket.userId;

        console.log("Message transféré via Socket.IO:", {
          messageId,
          targetConversationId,
          userId,
        });

        if (!messageId || !targetConversationId) {
          throw new Error("messageId et targetConversationId sont requis");
        }

        // Vérifie que l'utilisateur a accès à la conversation cible
        const hasAccess = await Participants.findOne({
          Id_Conversation: targetConversationId,
          Id_User: userId,
        });

        if (!hasAccess) {
          throw new Error("Vous n'êtes pas membre de la conversation cible");
        }

        // On passe io et req.user dans la requête simulée
        const fakeReq = {
          params: { messageId },
          body: { targetConversationId },
          user: { id: userId, username: socket.username },
          io: io, // Très important : on donne accès à io
        };

        const fakeRes = {
          json: (obj) => {
            // Si succès → on émet directement le nouveau message transféré
            if (obj.success) {
              console.log(
                "Message transféré avec succès → diffusion en temps réel"
              );

              // On émet le message dans la conversation cible
              io.to(targetConversationId.toString()).emit("new_message", {
                message: obj.forwardedMessage,
                forwarded: true,
                originalMessageId: messageId,
              });

              // On notifie aussi l'émetteur que tout s'est bien passé
              socket.emit("forward_success", {
                success: true,
                message: "Message transféré !",
                forwardedMessage: obj.forwardedMessage,
                targetConversationId,
              });
            } else {
              throw new Error(obj.error || "Échec du transfert");
            }
          },
          status: (code) => ({
            json: (obj) => {
              socket.emit("forward_error", {
                success: false,
                error: obj.error || "Erreur lors du transfert",
                statusCode: code,
              });
            },
          }),
        };

        // Appelle directement la méthode du controller (elle gère tout : chiffrement, sauvegarde, socket, etc.)
        await messageController.forwardMessage(fakeReq, fakeRes);
      } catch (error) {
        console.error("Erreur transfert de message (socket):", error.message);
        socket.emit("forward_error", {
          success: false,
          error: error.message || "Impossible de transférer le message",
        });
      }
    });
    // ==================== 🗃️ ARCHIVAGE DES CONVERSATIONS EN TEMPS RÉEL ====================

    socket.on("archive_conversation", async (data) => {
      try {
        const { conversationId } = data;
        const userId = socket.userId;

        console.log("🗃️ Archivage conversation via socket:", {
          conversationId,
          userId,
        });

        if (!conversationId) {
          throw new Error("ID conversation requis");
        }

        // Vérifier que l'utilisateur a accès à la conversation
        const hasAccess = await Participants.findOne({
          Id_Conversation: conversationId,
          Id_User: userId,
        });

        if (!hasAccess) {
          throw new Error("Vous n'êtes pas membre de cette conversation");
        }

        // Simuler une requête pour le controller d'archivage
        const fakeReq = {
          params: { conversationId },
          user: { _id: userId },
        };

        const fakeRes = {
          json: (obj) => {
            if (obj.success) {
              // Notifier l'utilisateur que l'archivage a réussi
              socket.emit("conversation_archived", {
                success: true,
                conversationId: conversationId,
                archivedAt: new Date(),
              });

              // Notifier tous les clients de cet utilisateur pour mettre à jour l'interface
              io.to(`user_${userId}`).emit("conversation_archived_update", {
                type: "archived",
                conversationId: conversationId,
                timestamp: new Date(),
              });

              console.log(
                `✅ Conversation ${conversationId} archivée par ${userId}`
              );
            } else {
              throw new Error(obj.error || "Échec de l'archivage");
            }
          },
          status: (code) => ({
            json: (obj) => {
              socket.emit("archive_error", {
                success: false,
                error: obj.error || "Erreur lors de l'archivage",
                statusCode: code,
              });
            },
          }),
        };

        // Utiliser le controller d'archivage (vous devrez l'importer)
        const { archiveController } = await import(
          "../controllers/archiveController.js"
        );
        await archiveController.archiveConversation(userId, conversationId);

        // Émettre les événements de succès
        socket.emit("conversation_archived", {
          success: true,
          conversationId: conversationId,
          archivedAt: new Date(),
        });

        io.to(`user_${userId}`).emit("conversation_archived_update", {
          type: "archived",
          conversationId: conversationId,
          timestamp: new Date(),
        });
      } catch (error) {
        console.error("💥 Erreur archivage socket:", error);
        socket.emit("archive_error", {
          success: false,
          error: error.message,
        });
      }
    });

    socket.on("unarchive_conversation", async (data) => {
      try {
        const { conversationId } = data;
        const userId = socket.userId;

        console.log("🗃️ Désarchivage conversation via socket:", {
          conversationId,
          userId,
        });

        if (!conversationId) {
          throw new Error("ID conversation requis");
        }

        // Utiliser le controller d'archivage
        const { archiveController } = await import(
          "../controllers/archiveController.js"
        );
        await archiveController.unarchiveConversation(userId, conversationId);

        // Notifier l'utilisateur que le désarchivage a réussi
        socket.emit("conversation_unarchived", {
          success: true,
          conversationId: conversationId,
        });

        // Notifier tous les clients de cet utilisateur pour mettre à jour l'interface
        io.to(`user_${userId}`).emit("conversation_archived_update", {
          type: "unarchived",
          conversationId: conversationId,
          timestamp: new Date(),
        });

        console.log(
          `✅ Conversation ${conversationId} désarchivée par ${userId}`
        );
      } catch (error) {
        console.error("💥 Erreur désarchivage socket:", error);
        socket.emit("archive_error", {
          success: false,
          error: error.message,
        });
      }
    });

    socket.on("get_archived_conversations", async () => {
      try {
        const userId = socket.userId;

        console.log(
          "🗃️ Récupération conversations archivées via socket:",
          userId
        );

        const { archiveController } = await import(
          "../controllers/archiveController.js"
        );
        const archivedConversations =
          await archiveController.getArchivedConversations(userId);

        socket.emit("archived_conversations_data", {
          success: true,
          conversations: archivedConversations,
          count: archivedConversations.length,
        });

        console.log(
          `✅ ${archivedConversations.length} conversations archivées envoyées`
        );
      } catch (error) {
        console.error("💥 Erreur récupération archivées socket:", error);
        socket.emit("archive_error", {
          success: false,
          error: error.message,
        });
      }
    });

    socket.on("get_archived_count", async () => {
      try {
        const userId = socket.userId;

        const { archiveController } = await import(
          "../controllers/archiveController.js"
        );
        const archivedCount = await archiveController.getArchivedCount(userId);

        socket.emit("archived_count_data", {
          success: true,
          archivedCount: archivedCount,
        });
      } catch (error) {
        socket.emit("archive_error", {
          success: false,
          error: error.message,
        });
      }
    });

    // ==================== 📞 ÉVÉNEMENTS D'APPEL (MANQUÉ ET TERMINÉ) AVEC SAUVEGARDE BDD ====================

    // Événement quand un appel est refusé ou manqué
    socket.on("call-missed", async (data) => {
      try {
        const { conversationId, callType, reason = 'missed', startTime } = data;
        const callerId = socket.userId;

        if (!conversationId || !callType) {
          socket.emit("call-message-error", { error: "Données d'appel incomplètes" });
          return;
        }

        console.log(`📞 Appel ${callType} manqué (${reason}) - Création message`);

        // 🆕 SAUVEGARDER L'APPEL MANQUÉ DANS LA BDD
        const receiverId = await findReceiverId(conversationId, callerId);
        if (receiverId) {
          await saveCallToDB({
            conversationId,
            callerId,
            receiverId,
            callType,
            status: reason,
            duration: 0,
            startTime
          });
        }

        // Créer un message d'appel manqué
        const result = await messageController.createCallMessage(
          {
            conversationId,
            callerId,
            callType,
            status: "missed",
          },
          io
        );

        if (result) {
          socket.emit("call-message-sent", {
            success: true,
            message: result,
          });
        }
      } catch (error) {
        console.error("❌ Erreur création message appel manqué:", error.message);
        socket.emit("call-message-error", { error: error.message });
      }
    });

    // Événement quand un appel se termine (après acceptation)
    socket.on("call-ended", async (data) => {
      try {
        const { conversationId, callType, duration, initiatorId, startTime } = data;
        // Utiliser initiatorId s'il est fourni, sinon utiliser socket.userId
        const callerId = initiatorId || socket.userId;

        if (!conversationId || !callType || duration === undefined) {
          socket.emit("call-message-error", { error: "Données d'appel incomplètes" });
          return;
        }

        console.log(`📞 Appel ${callType} terminé - Durée: ${duration}s - Création message par: ${callerId}`);

        // 🆕 SAUVEGARDER L'APPEL TERMINÉ DANS LA BDD
        const receiverId = await findReceiverId(conversationId, callerId);
        if (receiverId) {
          await saveCallToDB({
            conversationId,
            callerId,
            receiverId,
            callType,
            status: 'completed',
            duration,
            startTime
          });
        }

        // Créer un message d'appel terminé avec la durée
        const result = await messageController.createCallMessage(
          {
            conversationId,
            callerId,
            callType,
            status: "completed",
            duration,
          },
          io
        );

        if (result) {
          socket.emit("call-message-sent", {
            success: true,
            message: result,
          });
        }
      } catch (error) {
        console.error("❌ Erreur création message appel terminé:", error.message);
        socket.emit("call-message-error", { error: error.message });
      }
    });

    // ==================== VOTRE CODE EXISTANT ====================

    socket.on("join_notifications", async () => {
      try {
        const userId = socket.userId;

        socket.join(`user_${userId}`);

        // Mettre à jour la présence
        await updateUserPresence(userId, socket.id, "online");

        console.log(
          `🔔 User ${userId} a rejoint ses notifications (présence: online)`
        );

        // Notifier les contacts
        notifyUserPresence(io, userId, "online");

        // Démarrer le heartbeat
        presenceInterval = startPresenceHeartbeat(userId, socket.id);
      } catch (error) {
        socket.emit("notification_error", { message: error.message });
      }
    });

    socket.on("join_conversation", (conversationId) => {
      try {
        if (!conversationId || typeof conversationId !== "string") {
          throw new Error("ID de conversation invalide");
        }
        socket.join(conversationId);
        console.log(`📱 User ${socket.userId} a rejoint: ${conversationId}`);
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    socket.on("leave_conversation", (conversationId) => {
      socket.leave(conversationId);
      console.log(`📱 User ${socket.userId} a quitté: ${conversationId}`);
    });

    socket.on("user_typing", async (data) => {
      try {
        const { conversationId, isTyping } = data;

        if (!conversationId) {
          throw new Error("ID conversation requis");
        }

        console.log(
          `⌨️ User ${socket.username} ${
            isTyping ? "typing..." : "stopped typing"
          } in ${conversationId}`
        );

        socket.to(conversationId).emit("user_typing", {
          userId: socket.userId,
          isTyping: isTyping,
          conversationId: conversationId,
          userName: socket.username,
          timestamp: new Date(),
        });

        // Mettre à jour l'activité
        await updateUserActivity(socket.userId, socket.id);
      } catch (error) {
        console.error("💥 Erreur typing indicator:", error.message);
        socket.emit("error", { message: "Erreur typing indicator" });
      }
    });

    socket.on("get_conversation_history", async (data) => {
      try {
        console.log("📜 Demande historique:", data);
        const { conversationId } = data;

        const messages = await messageController.getConversationMessages(
          conversationId
        );

        socket.emit("conversation_history", {
          success: true,
          messages: messages,
          conversationId: conversationId,
        });

        console.log(`📜 Historique envoyé: ${messages.length} messages`);
      } catch (error) {
        console.error("💥 Erreur historique:", error.message);
        socket.emit("conversation_history", {
          success: false,
          error: error.message,
        });
      }
    });

    // 🆕 ÉVÉNEMENT ENVOI MESSAGE SÉCURISÉ - CORRIGÉ SANS DOUBLON
socket.on("send_message", async (data) => {
  console.log("📨 Message reçu:", data);

  try {
    let messageData = data;

    if (typeof data === "string") {
      messageData = JSON.parse(data);
    }

    const requiredFields = ["content"];
    const missingFields = requiredFields.filter(
      (field) => !messageData[field]
    );

    if (missingFields.length > 0) {
      throw new Error(`Champs manquants: ${missingFields.join(", ")}`);
    }

    // Vérification autorisation si conversationId fourni
    if (messageData.conversationId) {
      await conversationController.checkUserAuthorization(
        socket.userId,
        messageData.conversationId
      );
    }

    // 🔥 RÉCUPÉRER LES INFOS DE L'EXPÉDITEUR
    const sender = await User.findById(socket.userId).select('username profilePicture');

    const finalMessageData = {
      ...messageData,
      Id_sender: socket.userId,
      // 🆕 AJOUTER CES CHAMPS
      senderUsername: sender?.username || socket.username,
      senderProfilePicture: sender?.profilePicture || null,
    };  

    // SAUVEGARDE DU MESSAGE
    const savedMessage = await messageController.createMessage(
      finalMessageData,
      io,
      socket.userId
    );

    // METTRE À JOUR L'ACTIVITÉ
    await updateUserActivity(socket.userId, socket.id);

    // 🔥 AJOUTER LES INFOS EXPÉDITEUR DANS LA RÉPONSE
    const messageWithSenderInfo = {
      ...savedMessage.toObject(),
      senderUsername: sender?.username || socket.username,
      senderProfilePicture: sender?.profilePicture || null,
      tempId: messageData.tempId, // Pour lier au message temporaire
    };

    // ✅ CONFIRMATION À L'ÉMETTEUR
    socket.emit("message_sent", {
      success: true,
      data: messageWithSenderInfo,
      tempId: messageData.tempId,
      timestamp: new Date(),
    });

    console.log("🎉 Message traité - ID:", savedMessage._id);
  } catch (error) {
    console.error("💥 Erreur traitement message:", error.message);

    socket.emit("message_error", {
      success: false,
      error: error.message,
      timestamp: new Date(),
    });
  }
});

    // 🆕 ÉVÉNEMENT ENVOI IMAGE - CORRIGÉ SANS DOUBLON
    socket.on("send_image_message", async (data) => {
      console.log("🖼️ Image message reçu:", data);

      try {
        if (data.conversationId) {
          await conversationController.checkUserAuthorization(
            socket.userId,
            data.conversationId
          );
        }

        const messageData = {
          conversationId: data.conversationId,
          Id_receiver: data.Id_receiver,
          typeMessage: "image",
           tempId: data.tempId, 
        };

        let fileBuffer;
        if (
          typeof data.file === "string" &&
          data.file.startsWith("data:image")
        ) {
          const base64Data = data.file.split(",")[1];
          fileBuffer = Buffer.from(base64Data, "base64");
        } else if (data.fileBuffer) {
          fileBuffer = Buffer.from(data.fileBuffer);
        } else {
          throw new Error("Format de fichier image non reconnu");
        }

        const file = { 
          buffer: fileBuffer,
          originalname: data.fileName || "image",
          mimetype: data.fileType || "image/jpeg",
        };

        const savedMessage = await messageController.uploadImageMessage(
          file,
          messageData,
          io,
          socket.userId
        );

        await updateUserActivity(socket.userId, socket.id);

        socket.emit('image_message_sent', {
          success: true,
          data: savedMessage,
          timestamp: new Date(),
           tempId: data.tempId, 
        });

        console.log("🖼️ Message image traité - ID:", savedMessage._id);
      } catch (error) {
        console.error("💥 Erreur traitement image message:", error.message);
        socket.emit("image_message_error", {
          success: false,
          error: error.message,
          timestamp: new Date(),
           tempId: data.tempId, 
        });
      }
    });

    socket.on('send_file_message', async (data) => {
      console.log('📎 File message reçu:', data);
      
      try {
        if (data.conversationId) {
          await conversationController.checkUserAuthorization(
            socket.userId,
            data.conversationId
          );
        }

        const messageData = {
          conversationId: data.conversationId,
          Id_receiver: data.Id_receiver,
          fileName: data.fileName,
          fileType: data.fileType,
          fileSize: data.fileSize,
          originalName: data.originalName,
          typeMessage: "file",
        };

        let fileBuffer;
        if (typeof data.file === "string" && data.file.startsWith("data:")) {
          const base64Data = data.file.split(",")[1];
          fileBuffer = Buffer.from(base64Data, "base64");
        } else if (data.fileBuffer) {
          fileBuffer = Buffer.from(data.fileBuffer);
        } else {
          throw new Error("Format de fichier non reconnu");
        }

        const file = { 
          buffer: fileBuffer,
          originalname: data.fileName || data.originalName || "file",
          mimetype: data.fileType || "application/octet-stream",
          size: data.fileSize,
        };

        const savedMessage = await messageController.uploadFileMessage(
          file,
          messageData,
          io,
          socket.userId
        );

        await updateUserActivity(socket.userId, socket.id);

        const formattedMessage = {
          _id: savedMessage._id,
          conversationId: savedMessage.conversationId,
          Id_sender: savedMessage.Id_sender,
          Id_receiver: data.Id_receiver,
          typeMessage: savedMessage.typeMessage || "file",
          content: savedMessage.content,
          fileUrl: savedMessage.fileUrl,
          fileName: savedMessage.fileName || data.fileName,
          fileSize: savedMessage.fileSize || data.fileSize,
          fileType: savedMessage.fileType || data.fileType,
          originalName: savedMessage.originalName || data.originalName,
          status: savedMessage.status,
          time: savedMessage.time || savedMessage.timestamp,
          timestamp: new Date(),
        };

        socket.emit('file_message_sent', {
          success: true,
          data: formattedMessage,
          timestamp: new Date(),
           tempId: data.tempId, 
        });

        console.log("📎 Message fichier traité - ID:", savedMessage._id);
      } catch (error) {
        console.error("💥 Erreur traitement fichier message:", error.message);
        socket.emit("file_message_error", {
          success: false,
          error: error.message,
          timestamp: new Date(),
        });
      }
    });

    socket.on('send_video_message', async (data) => {
      console.log('🎥 Video message reçu:', data);
      
      try {
        if (!data.file) {
          throw new Error("Aucun fichier vidéo reçu");
        }

        if (data.conversationId) {
          await conversationController.checkUserAuthorization(
            socket.userId,
            data.conversationId
          );
        }

        const messageData = {
          conversationId: data.conversationId,
          Id_receiver: data.Id_receiver,
          fileName: data.fileName,
          fileType: data.fileType,
          fileSize: data.fileSize,
          typeMessage: "video",
          tempId: data.tempId, 
          
        };

        const fileBuffer = Buffer.from(new Uint8Array(data.file));

        const file = { 
          buffer: fileBuffer,
          originalname: data.fileName || "video",
          mimetype: data.fileType || "video/mp4",
          size: data.fileSize,
        };

        const savedMessage = await messageController.uploadVideoMessage(
          file,
          messageData,
          io,
          socket.userId
        );

        await updateUserActivity(socket.userId, socket.id);

        const formattedMessage = {
          _id: savedMessage._id,
          conversationId: savedMessage.conversationId,
          Id_sender: savedMessage.Id_sender,
          Id_receiver: data.Id_receiver,
          typeMessage: savedMessage.typeMessage || "video",
          content: savedMessage.content,
          fileUrl: savedMessage.fileUrl,
          fileName: savedMessage.fileName || data.fileName,
          fileSize: savedMessage.fileSize || data.fileSize,
          fileType: savedMessage.fileType || data.fileType,
          status: savedMessage.status,
          time: savedMessage.time || savedMessage.timestamp,
          timestamp: new Date(),
        };

        socket.emit('video_message_sent', {
          success: true,
          data: formattedMessage,
          timestamp: new Date(),
           tempId: data.tempId, 
        });

        console.log("🎥 Message vidéo traité - ID:", savedMessage._id);
      } catch (error) {
        console.error("💥 Erreur traitement vidéo message:", error.message);
        socket.emit("video_message_error", {
          success: false,
          error: error.message,
          timestamp: new Date(),
        });
      }
    });

    socket.on("get_unread_counts", async () => {
      try {
        const userId = socket.userId;

        const conversations = await Participants.find({
          Id_User: userId,
        }).populate({
          path: "Id_Conversation",
          match: { "unreadCounts.count": { $gt: 0 } },
        });

        const unreadData = conversations
          .filter((p) => p.Id_Conversation)
          .map((p) => ({
            conversationId: p.Id_Conversation._id,
            unreadCount:
              p.Id_Conversation.unreadCounts.find(
                (u) => u.userId.toString() === userId
              )?.count || 0,
          }));

        const totalUnread = unreadData.reduce(
          (sum, item) => sum + item.unreadCount,
          0
        );

        socket.emit("unread_counts_data", {
          success: true,
          totalUnread: totalUnread,
          conversationCounts: unreadData,
          
        });
      } catch (error) {
        socket.emit("notification_error", { message: error.message });
      }
    });

    socket.on("mark_conversation_read", async (data) => {
      try {
        const { conversationId } = data;
        const userId = socket.userId;

        await Conversation.findOneAndUpdate(
          { _id: conversationId, "unreadCounts.userId": userId },
          { $set: { "unreadCounts.$.count": 0 } }
        );

        socket.emit("conversation_marked_read", {
          success: true,
          conversationId: conversationId,
        });
      } catch (error) {
        socket.emit("notification_error", { message: error.message });
      }
    });

    socket.on("user_heartbeat", async () => {
      const userId = socket.userId;
      await updateUserActivity(userId, socket.id);

      userPresence.set(userId, {
        ...userPresence.get(userId),
        lastSeen: new Date(),
        status: "online",
      });
    });

    socket.on("user_status_change", async (data) => {
      if (data.status) {
        await updateUserStatus(socket.userId, data.status);
        notifyUserPresence(io, socket.userId, data.status);
      }
    });

    socket.on("ping", () => {
      socket.emit("pong", {
        message: "Serveur actif ✅",
        timestamp: new Date(),
      });
    });

    // Remplacer l'événement existant par :
socket.on("mark_as_read", async (data) => {
  try {
    console.log("👀 Message marqué comme lu:", data);
    const { messageId, conversationId } = data;
    const userId = socket.userId;

    // 1. Mettre à jour le message dans la base de données
    const message = await Message.findById(messageId);
    if (message) {
      if (!message.readBy) message.readBy = [];
      
      // Ajouter l'utilisateur à la liste readBy s'il n'y est pas déjà
      const alreadyRead = message.readBy.some(
        r => r.userId.toString() === userId.toString()
      );
      
      if (!alreadyRead) {
        message.readBy.push({
          userId: userId,
          readAt: new Date()
        });
        await message.save();
        
        console.log(`✅ Message ${messageId} marqué comme lu par ${userId}`);
      }
    }

    // 2. Émettre l'événement à TOUS les participants de la conversation
    // Pour que l'expéditeur voie les deux coches bleues
    if (conversationId) {
      io.to(conversationId.toString()).emit("message:seen", {
        messageId: messageId,
        seenBy: userId,
        conversationId: conversationId,
        timestamp: new Date()
      });
      
      // Émettre aussi spécifiquement à l'expéditeur si différent
      if (message && message.Id_sender.toString() !== userId.toString()) {
        io.to(`user_${message.Id_sender.toString()}`).emit("message:seen", {
          messageId: messageId,
          seenBy: userId,
          conversationId: conversationId,
          timestamp: new Date()
        });
      }
    }

    // 3. Répondre à l'émetteur
    socket.emit("message_read", {
      success: true,
      messageId: data.messageId,
    });
  } catch (error) {
    console.error("💥 Erreur mark_as_read:", error);
    socket.emit("error", { message: error.message });
  }
});

// Ajouter aussi un événement pour marquer TOUS les messages d'une conversation
socket.on("mark_conversation_read", async (data) => {
  try {
    const { conversationId } = data;
    const userId = socket.userId;

    console.log(`👁️ Marquer toute la conversation comme lue:`, { conversationId, userId });

    // 1. Trouver tous les messages non lus dans cette conversation
    const messages = await Message.find({
      conversationId: conversationId,
      Id_sender: { $ne: userId }, // Pas les messages de l'utilisateur lui-même
      "readBy.userId": { $ne: userId } // Pas déjà lus
    });

    const updatedMessageIds = [];

    // 2. Marquer chaque message comme lu
    for (const message of messages) {
      if (!message.readBy) message.readBy = [];
      
      message.readBy.push({
        userId: userId,
        readAt: new Date()
      });
      
      await message.save();
      updatedMessageIds.push(message._id.toString());

      // 3. Émettre pour chaque message
      io.to(conversationId.toString()).emit("message:seen", {
        messageId: message._id.toString(),
        seenBy: userId,
        conversationId: conversationId,
        timestamp: new Date()
      });

      // Informer l'expéditeur
      io.to(`user_${message.Id_sender.toString()}`).emit("message:seen", {
        messageId: message._id.toString(),
        seenBy: userId,
        conversationId: conversationId,
        timestamp: new Date()
      });
    }

    console.log(`✅ ${updatedMessageIds.length} messages marqués comme lus`);

    // 4. Réinitialiser le compteur de non-lus dans la conversation
    await Conversation.findByIdAndUpdate(
      conversationId,
      {
        $set: { "unreadCounts.$[elem].count": 0 }
      },
      {
        arrayFilters: [{ "elem.userId": userId }],
        new: true
      }
    );

    socket.emit("conversation_marked_read", {
      success: true,
      conversationId: conversationId,
      messagesRead: updatedMessageIds.length
    });

  } catch (error) {
    console.error("💥 Erreur mark_conversation_read:", error);
    socket.emit("error", { message: error.message });
  }
});
// ==================== 📞 APPELS VIDÉO WEBRTC ====================
// ==================== 📞 APPELS VIDÉO WEBRTC ====================
socket.on('call:initiate', async (data) => {
  console.log('📞 call:initiate received:', data, 'from user:', socket.userId);
  try {
    const { conversationId, receiverId, callType = 'video' } = data;
    const callerId = socket.userId;

    if (callerId === receiverId) {
      socket.emit('call:error', { error: 'Impossible de s\'appeler soi-même' });
      return;
    }

    // 1️⃣ Création DB avec statut 'ringing'
    const dbCall = await Call.create({
      conversationId,
      callerId,
      receiverId,
      callType,
      status: 'ringing',
      statusHistory: [
        { status: 'ringing', timestamp: new Date() }
      ]
    });

    console.log('📞 Call created in DB:', dbCall._id);

    activeCalls.set(dbCall._id.toString(), {
      callId: dbCall._id.toString(),
      callerId,
      receiverId,
      conversationId,
      callType,
      status: 'ringing',
      startedAt: new Date()
    });

    // 2️⃣ Rejoindre la salle d'appel
    socket.join(`call_${dbCall._id.toString()}`);

    // 3️⃣ Trouver TOUS les sockets du receiver
    const receiverSockets = Array.from(io.sockets.sockets.values())
      .filter(s => s.userId === receiverId);

    console.log('🔍 Looking for receiver sockets:', receiverId);
    console.log('📋 Found', receiverSockets.length, 'sockets for receiver');

    if (receiverSockets.length === 0) {
      console.log('❌ Receiver offline:', receiverId);
      
      // 🆕 METTRE À JOUR EN 'MISSED'
      await Call.findByIdAndUpdate(dbCall._id, {
        status: 'missed',
        endTime: new Date(),
        duration: 0,
        $push: {
          statusHistory: { status: 'missed', timestamp: new Date() }
        }
      });
      
      socket.emit('call:error', { error: 'Utilisateur hors ligne' });
      return;
    }

    // 4️⃣ Envoyer à TOUS les sockets du receiver
    const callData = {
      callId: dbCall._id.toString(),
      callerId,
      conversationId,
      callType
    };

    receiverSockets.forEach((receiverSocket, index) => {
      receiverSocket.emit('call:incoming', callData);
      console.log(`📞 Appel envoyé au socket ${index + 1}/${receiverSockets.length}`);
    });

    console.log('✅ Appel initié, envoyé à', receiverSockets.length, 'socket(s)');

  } catch (error) {
    console.error('❌ Erreur call:initiate:', error);
    socket.emit('call:error', { error: error.message });
  }
});

socket.on('call:accept', async (data) => {
  console.log('📞 call:accept received:', data, 'from user:', socket.userId);
  try {
    const { callId, callerId } = data;
    const receiverId = socket.userId;

    // Vérifier autorisation
    if (receiverId === callerId) {
      return socket.emit('call:error', { error: 'Impossible de s\'appeler soi-même' });
    }

    // ✅ Mettre à jour DB en 'ongoing'
    const acceptedCall = await Call.findByIdAndUpdate(
      callId,
      {
        status: 'ongoing',
        $push: {
          statusHistory: { status: 'ongoing', timestamp: new Date() }
        }
      },
      { new: true }
    );
    
    if (!acceptedCall) {
      return socket.emit('call:error', { error: 'Appel non trouvé' });
    }

    console.log(`📝 Appel ${callId} accepté: ongoing`);

    // ✅ JOINDRE LA SALLE (ESSENTIEL)
    socket.join(`call:${callId}`);

    // ✅ ENVOYER À TOUTE LA SALLE (CALLER + RECEIVER)
    const notificationData = {
      callId,
      callerId: acceptedCall.callerId.toString(),
      receiverId: acceptedCall.receiverId.toString(),
      conversationId: acceptedCall.conversationId.toString(),
      callType: acceptedCall.callType,
      status: 'active'
    };

    io.to(`call:${callId}`).emit('call:accepted', notificationData);
    console.log('✅ call:accepted envoyé à salle call:', callId);

  } catch (err) {
    console.error('❌ call:accept error:', err);
    socket.emit('call:error', { error: err.message });
  }
});

socket.on('call:reject', async (data) => {
  try {
    const { callId } = data;
    const receiverId = socket.userId;

    console.log(`❌ Appel rejeté:`, { callId, receiverId });

    // 1️⃣ Mettre à jour la base de données en 'rejected'
    const rejectedCall = await Call.findByIdAndUpdate(
      callId,
      {
        status: 'rejected',
        endTime: new Date(),
        duration: 0,
        $push: {
          statusHistory: { status: 'rejected', timestamp: new Date() }
        }
      },
      { new: true }
    );

    // 2️⃣ Supprimer de la mémoire
    activeCalls.delete(callId);

    // 🔥 CRÉER UN MESSAGE D'APPEL REFUSÉ
    if (rejectedCall) {
      const { default: Message } = await import("../models/Message.js");
      const callMessage = await Message.create({
        conversationId: rejectedCall.conversationId,
        Id_sender: rejectedCall.callerId,
        typeMessage: "call",
        content: `🚫 Appel ${rejectedCall.callType === 'audio' ? 'audio' : 'vidéo'} refusé`,
        callType: rejectedCall.callType,
        callResult: "rejected",
        duration: 0,
        status: "sent"
      });

      await callMessage.populate("Id_sender", "username avatar");
      io.to(rejectedCall.conversationId.toString()).emit("new-message", callMessage);
    }

    // 3️⃣ Notifier le caller
    const callerSocket = Array.from(io.sockets.sockets.values())
      .find(s => s.userId === rejectedCall.callerId.toString());

    if (callerSocket) {
      callerSocket.emit('call:rejected', {
        callId,
        receiverId,
        timestamp: new Date()
      });
    }

    console.log(`✅ Appel ${callId} rejeté et DB mise à jour`);

  } catch (error) {
    console.error('💥 Erreur rejet appel:', error);
    socket.emit('call:error', { error: error.message });
  }
});
// 🔧 REMPLACER LES DEUX GESTIONNAIRES call:end ET end-call PAR CELUI-CI
// (Supprimer les lignes 606-649 et 713-809, garder celui-ci)

socket.on('end-call', async (data) => {
  const { chatId, channelName, duration = 0, reason = 'ended', callId } = data;
  const userId = socket.userId;

  console.log(`[end-call] Reçu de ${userId}`, { callId, channelName, chatId, duration, reason });

  let targetCall = null;

  // 1. Recherche par callId (priorité max)
  if (callId) {
    targetCall = await Call.findById(callId);
  }

  // 2. Sinon via activeCalls + channelName
  if (!targetCall && channelName) {
    const active = activeCalls.get(channelName);
    if (active?.dbCallId) {
      targetCall = await Call.findById(active.dbCallId);
    }
  }

  // 3. Dernier recours : appel le plus récent dans cette conversation
  if (!targetCall && chatId) {
    targetCall = await Call.findOne({
      conversationId: chatId,
      $or: [{ callerId: userId }, { receiverId: userId }],
      status: { $in: ['ringing', 'ongoing'] }
    }).sort({ createdAt: -1 });
  }

  if (!targetCall) {
    console.warn("Aucun appel actif trouvé pour terminer");
    socket.emit('call:ended', { reason: 'no_call_found' });
    return;
  }

  const callIdStr = targetCall._id.toString();

  // Mise à jour statut
  const finalStatus = duration < 3 ? 'missed' : 'completed';
  await Call.findByIdAndUpdate(callIdStr, {
    status: finalStatus,
    endTime: new Date(),
    duration,
    $push: {
      statusHistory: {
        status: finalStatus,
        endedBy: userId,
        reason,
        timestamp: new Date()
      }
    }
  });

  // Nettoyage mémoire
  activeCalls.delete(callIdStr);
  if (channelName) activeCalls.delete(channelName);

  // ────────────────────────────────────────────────
  // MESSAGE DANS LE CHAT (très important)
  // ────────────────────────────────────────────────
  const { default: Message } = await import("../models/Message.js");

  const content = duration < 3
    ? `❌ Appel ${targetCall.callType} manqué`
    : `📞 Appel ${targetCall.callType} terminé (${Math.floor(duration/60)}:${(duration%60).toString().padStart(2,'0')})`;

  const callMsg = await Message.create({
    conversationId: targetCall.conversationId,
    Id_sender: userId,
    typeMessage: "call",
    content,
    callType: targetCall.callType,
    callResult: duration < 3 ? "missed" : "ended",
    duration,
    status: "sent"
  });

  await callMsg.populate("Id_sender", "username avatar");
  io.to(targetCall.conversationId.toString()).emit("new-message", callMsg);

  // ────────────────────────────────────────────────
  // DIFFUSION ULTRA-LARGE de call:ended
  // ────────────────────────────────────────────────
  const endedPayload = {
    callId: callIdStr,
    conversationId: targetCall.conversationId.toString(),
    channelName: channelName || `call_${targetCall.conversationId}`,
    endedBy: userId,
    duration,
    reason,
    timestamp: new Date().toISOString()
  };

  // A. Toute la conversation (le plus fiable)
  io.to(targetCall.conversationId.toString()).emit('call:ended', endedPayload);

  // B. Room d'appel (si elle existe encore)
  io.to(`call:${callIdStr}`).emit('call:ended', endedPayload);

  // C. Rooms personnelles des deux participants
  io.to(`user_${targetCall.callerId.toString()}`).emit('call:ended', endedPayload);
  io.to(`user_${targetCall.receiverId.toString()}`).emit('call:ended', endedPayload);

  console.log(`Appel ${callIdStr} terminé et notifié agressivement`);

  // Confirmer à celui qui a raccroché
  socket.emit('call:ended', { ...endedPayload, success: true });
});


// Ajouter / remplacer par ceci

    // Envoyer offre WebRTC
socket.on('call:offer', (data) => {
  const { callId, receiverId, signal } = data;
  
  console.log(`📡 OFFER envoyé pour appel ${callId}`);

  // Envoyer à toute la salle
  io.to(`call_${callId}`).emit('call:offer', {
    callId,
    callerId: socket.userId,
    signal
  });
});

    // Envoyer réponse WebRTC
socket.on('call:answer', (data) => {
  const { callId, signal } = data;
  
  console.log(`📡 ANSWER envoyé pour appel ${callId}`);

  // Envoyer à toute la salle
  io.to(`call_${callId}`).emit('call:answer', {
    callId,
    receiverId: socket.userId,
    signal
  });
});


    // Dans la section des appels vidéo
socket.on('call:ice-candidate', (data) => {
  const { callId, candidate } = data;

  // ⚠️ VÉRIFIER QUE LE callId EXISTE
  if (!callId) {
    console.log('❌ ICE candidate sans callId, ignoré');
    return;
  }

  console.log(`🧊 Candidat ICE pour appel ${callId}`);

  // Utiliser la salle d'appel
  io.to(`call_${callId}`).emit('call:ice-candidate', {
    senderId: socket.userId,
    callId, // ⚠️ Inclure le callId dans la réponse
    candidate
  });
});

    
    // 🆕 DÉCONNEXION ROBUSTE
    socket.on("disconnect", async (reason) => {
      console.log("🔴 User déconnecté:", socket.userId, "- Raison:", reason);
      // Ajouter ceci dans socket.on("disconnect")
if (socket.userId) {
  // Chercher et terminer tous les appels en cours de cet utilisateur
  const callsToEnd = [];
  for (const [key, call] of activeCalls.entries()) {
    if (call.callerId === socket.userId || call.recipientId === socket.userId) {
      callsToEnd.push(key);
    }
  }

  for (const callKey of callsToEnd) {
    const call = activeCalls.get(callKey);
    if (call && call.dbCallId) {
      try {
        await Call.findByIdAndUpdate(
          call.dbCallId,
          {
            status: 'missed', // ou 'disconnected' si tu veux différencier
            endTime: new Date(),
            duration: 0,
            $push: {
              statusHistory: {
                status: 'missed',
                reason: 'peer_disconnected',
                timestamp: new Date()
              }
            }
          }
        );

        io.to(call.conversationId.toString()).emit('call:ended', {
          callId: call.dbCallId.toString(),
          endedBy: 'system',
          reason: 'peer_disconnected',
          timestamp: new Date().toISOString()
        });

        activeCalls.delete(callKey);
      } catch (err) {
        console.error('Erreur cleanup appel sur disconnect:', err);
      }
    }
  }
}

      // Nettoyage interval
      if (presenceInterval) {
        clearInterval(presenceInterval);
        presenceInterval = null;
      }

      if (socket.userId) {
        await removeUserSession(socket.userId, socket.id);

        const remainingSessions = await getRemainingSessions(socket.userId);
         console.log(
      "🧠 SESSIONS ACTIVES POUR",
      socket.userId,
      ":",
      remainingSessions
    );
        if (remainingSessions === 0) {
          await updateUserStatus(socket.userId, "offline");
          notifyUserPresence(io, socket.userId, "offline");
          console.log(
            `🔔 User ${socket.userId} est maintenant offline (0 sessions)`
          );
        } else {
          console.log(
            `🔔 User ${socket.userId} a ${remainingSessions} sessions restantes`
          );
        }

        userPresence.delete(socket.userId);
      }
    });

    socket.on("error", (error) => {
      console.error("💥 Erreur socket:", error);
    })
  ;

  // ==================== FONCTIONS HELPER ====================

  async function updateUserPresence(userId, socketId, status = "online") {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        {
          $set: {
            status: status,
            lastSeen: new Date(),
          },
          $push: {
            activeSessions: {
              socketId: socketId,
              deviceType: "web",
              connectedAt: new Date(),
              lastActivity: new Date(),
            },
          },
        },
        { new: true }
      );

      userPresence.set(userId, {
        socketId: socketId,
        lastSeen: new Date(),
        status: status,
        sessions: user?.activeSessions || [],
      });

      console.log(`✅ Présence mise à jour: ${userId} - ${status}`);
      return user;
    } catch (error) {
      console.error("❌ Erreur mise à jour présence:", error);
    }
  }

  async function updateUserActivity(userId, socketId) {
    try {
      await User.updateOne(
        {
          _id: userId,
          "activeSessions.socketId": socketId,
        },
        {
          $set: {
            "activeSessions.$.lastActivity": new Date(),
            lastSeen: new Date(),
          },
        }
      );
    } catch (error) {
      console.error("❌ Erreur mise à jour activité:", error);
    }
  }

  async function updateUserStatus(userId, status) {
    try {
      await User.findByIdAndUpdate(userId, {
        status: status,
        lastSeen: new Date(),
      });

      if (userPresence.has(userId)) {
        userPresence.set(userId, {
          ...userPresence.get(userId),
          status: status,
          lastSeen: new Date(),
        });
      }
    } catch (error) {
      console.error("❌ Erreur mise à jour statut:", error);
    }
  }
  // À l'intérieur de configureChatSockets = (io) => { ...


  async function removeUserSession(userId, socketId) {
    try {
      console.log(`🗑️  Suppression session: ${socketId} pour user: ${userId}`);

      await User.findByIdAndUpdate(userId, {
        $pull: {
          activeSessions: { socketId: socketId },
        },
      });

      if (userPresence.has(userId)) {
        const presence = userPresence.get(userId);
        if (presence.sessions) {
          presence.sessions = presence.sessions.filter(
            (s) => s.socketId !== socketId
          );
          const afterCount = presence.sessions.length;
           console.log(`📦 SESSIONS MAP pour ${userId}:`, Array.from(presence.sessions));
          console.log(`🔢 Sessions ${userId}: ${beforeCount} → ${afterCount}`);

        }
      }
    } catch (error) {
      console.error("❌ Erreur suppression session:", error);
    }
  }

  async function getRemainingSessions(userId) {
    try {
      const user = await User.findById(userId);
      return user?.activeSessions?.length || 0;
    } catch (error) {
      console.error("❌ Erreur comptage sessions:", error);
      return 0;
    }
  }

  function startPresenceHeartbeat(userId, socketId) {
    return setInterval(async () => {
      if (userPresence.has(userId)) {
        await updateUserActivity(userId, socketId);
      }
    }, 30000);
  }

async function notifyUserPresence(io, userId, status, lastSeen = new Date()) {
  try {
    // ✅ VÉRIFIER LA VISIBILITÉ DU STATUT AVANT D'ÉMETTRE
    const user = await User.findById(userId).select('statusVisibility');
    
    if (!user) {
      console.log(`⚠️ User ${userId} non trouvé pour notifyUserPresence`);
      return;
    }

    // 🔒 SI L'UTILISATEUR A DÉSACTIVÉ SON STATUT, NE PAS ÉMETTRE
    if (user.statusVisibility === "Personne") {
      console.log(`🔒 Statut masqué pour ${userId} (visibilité: Personne)`);
      return; // ← IMPORTANT : On ne fait rien
    }

    // ✅ SINON, ÉMETTRE NORMALEMENT
    if (status === "online") {
      io.emit("user:online", { userId });
      console.log("📡 EMIT user:online", userId);
    }

    if (status === "offline") {
      io.emit("user:offline", { userId, lastSeen });
      console.log(`📡 EMIT user:offline → User: ${userId}, LastSeen: ${lastSeen}`);
    }
  } catch (error) {
    console.error("❌ Erreur notifyUserPresence:", error);
  }
  }
})};
