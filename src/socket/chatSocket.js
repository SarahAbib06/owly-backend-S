import { messageController } from "../controllers/messageController.js";
import { conversationController } from "../controllers/conversationController.js";
import Participants from "../models/Participants.js";
import User from "../models/User.js";
import Reaction from "../models/Reaction.js";

export const configureChatSockets = (io) => {
  console.log("🔧 WebSocket configuré - Système présence avancé activé");

  // 🆕 STOCKAGE PRÉSENCE AVANCÉ
  const userPresence = new Map();

  // 🆕 FONCTIONS MANQUANTES POUR LA PRÉSENCE
  function notifyUserPresence(io, userId, status) {
    console.log(`🔔 Présence ${userId}: ${status}`);
  }

  function startPresenceHeartbeat(userId) {
    return setInterval(() => {
      console.log(`💓 Heartbeat user: ${userId}`);
    }, 30000);
  }

  io.on("connection", (socket) => {
    console.log("🔗 User connecté:", socket.id);

    // 🆕 GESTION PRÉSENCE UTILISATEUR
    let currentUserId = null;
    let presenceInterval = null;

    // 🆕 ÉVÉNEMENTS POUR LES RÉACTIONS EN TEMPS RÉEL
    socket.on("join_message_reactions", (messageId) => {
      socket.join(`message_${messageId}`);
      console.log(
        `🔔 User ${socket.userId} écoute les réactions du message: ${messageId}`
      );
    });

    socket.on("leave_message_reactions", (messageId) => {
      socket.leave(`message_${messageId}`);
      console.log(
        `🔔 User ${socket.userId} ne suit plus les réactions du message: ${messageId}`
      );
    });

    // 🆕 ÉVÉNEMENT POUR AJOUTER UNE RÉACTION VIA SOCKET
    socket.on("add_reaction", async (data) => {
      try {
        const { messageId, emoji } = data;
        const userId = socket.userId;

        console.log(`🎯 Ajout réaction via socket:`, {
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
          emoji,
        });
        await reaction.save();
        await reaction.populate("id_user", "username avatar");

        // Récupérer le message pour avoir l'ID de conversation
        const Message = await import("../models/Message.js");
        const message = await Message.default.findById(messageId);

        // 🆕 DIFFUSER LA RÉACTION À TOUS LES UTILISATEURS CONCERNÉS
        // 1. Aux utilisateurs qui écoutent ce message spécifique
        socket.to(`message_${messageId}`).emit("reaction_added", {
          reaction,
          messageId,
          userId,
          timestamp: new Date(),
        });
        // 2. À tous les participants de la conversation
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

        // 3. Confirmation à l'émetteur
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
    // 🆕 ÉVÉNEMENT POUR SUPPRIMER UNE RÉACTION VIA SOCKET
    socket.on("remove_reaction", async (data) => {
      try {
        const { messageId } = data;
        const userId = socket.userId;

        console.log(`🗑️ Suppression réaction via socket:`, {
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
        // Récupérer le message pour avoir l'ID de conversation
        const Message = await import("../models/Message.js");
        const message = await Message.default.findById(messageId);

        // 🆕 DIFFUSER LA SUPPRESSION À TOUS LES UTILISATEURS CONCERNÉS
        // 1. Aux utilisateurs qui écoutent ce message spécifique
        socket.to(`message_${messageId}`).emit("reaction_removed", {
          messageId,
          userId,
          emoji: reaction.emoji,
          timestamp: new Date(),
        });
        // 2. À tous les participants de la conversation
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
        // 3. Confirmation à l'émetteur
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
    // 🆕 ÉVÉNEMENT POUR OBTENIR LES RÉACTIONS D'UN MESSAGE
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

    // 🆕 REJOINDRE LA SALLE DE NOTIFICATIONS PERSONNELLE
    socket.on("join_notifications", async (userId) => {
      try {
        if (!userId) {
          throw new Error("User ID requis");
        }

        currentUserId = userId;
        socket.join(`user_${userId}`);

        // 🆕 METTRE À JOUR LA PRÉSENCE AVANCÉE
        await updateUserPresence(userId, socket.id, "online");

        console.log(
          `🔔 User ${userId} a rejoint ses notifications (présence: online)`
        );

        // 🆕 NOTIFIER LES CONTACTS DE LA PRÉSENCE
        notifyUserPresence(io, userId, "online");

        // 🆕 DÉMARRER LE HEARTBEAT CORRECT
        presenceInterval = startPresenceHeartbeat(userId);
      } catch (error) {
        socket.emit("notification_error", { message: error.message });
      }
    });

    // Événements existants inchangés
    socket.on("join_conversation", (conversationId) => {
      try {
        if (!conversationId || typeof conversationId !== "string") {
          throw new Error("ID de conversation invalide");
        }
        socket.join(conversationId);
        console.log(`📱 User ${socket.id} a rejoint: ${conversationId}`);
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    socket.on("leave_conversation", (conversationId) => {
      socket.leave(conversationId);
      console.log(`📱 User ${socket.id} a quitté: ${conversationId}`);
    });

    socket.on("user_typing", async (data) => {
      try {
        const { conversationId, userId, isTyping, userName } = data;

        if (!conversationId || !userId) {
          throw new Error("Données typing incomplètes");
        }

        console.log(
          `⌨️ User ${userName || userId} ${
            isTyping ? "typing..." : "stopped typing"
          } in ${conversationId}`
        );

        socket.to(conversationId).emit("user_typing", {
          userId: userId,
          isTyping: isTyping,
          conversationId: conversationId,
          userName: userName,
          timestamp: new Date(),
        });

        // 🆕 METTRE À JOUR L'ACTIVITÉ
        if (userId) {
          await updateUserActivity(userId, socket.id);
        }
      } catch (error) {
        console.error("💥 Erreur typing indicator:", error.message);
        socket.emit("error", { message: "Erreur typing indicator" });
      }
    });

    socket.on("get_conversation_history", async (data) => {
      try {
        console.log("📜 Demande historique:", data);
        const { conversationId, userId } = data;

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

    // 🆕 ÉVÉNEMENT ENVOI MESSAGE - AVEC SYSTÈME INTELLIGENT
    socket.on("send_message", async (data) => {
      console.log("📨 Message reçu:", data);

      try {
        let messageData = data;

        if (typeof data === "string") {
          messageData = JSON.parse(data);
        }

        const requiredFields = ["Id_sender", "content"];
        const missingFields = requiredFields.filter(
          (field) => !messageData[field]
        );

        if (missingFields.length > 0) {
          throw new Error(`Champs manquants: ${missingFields.join(", ")}`);
        }

        if (messageData.conversationId) {
          await conversationController.checkUserAuthorization(
            messageData.Id_sender,
            messageData.conversationId
          );
        }

        // 💾 SAUVEGARDE DU MESSAGE AVEC IO POUR LES NOTIFICATIONS INTELLIGENTES
        const savedMessage = await messageController.createMessage(
          messageData,
          io
        );

        // 🆕 METTRE À JOUR L'ACTIVITÉ DE L'EXPÉDITEUR
        await updateUserActivity(messageData.Id_sender, socket.id);

        // Réponse à l'émetteur
        const senderResponse = {
          event: "message_sent",
          success: true,
          data: savedMessage,
          timestamp: new Date(),
          socketId: socket.id,
        };
        socket.emit("message_sent", senderResponse);

        // Diffusion du message à tous les participants
        const broadcastMessage = {
          event: "new_message",
          data: savedMessage,
          timestamp: new Date(),
        };
        io.to(savedMessage.conversationId.toString()).emit(
          "new_message",
          broadcastMessage
        );

        console.log("🎉 Message diffusé - ID:", savedMessage._id);
      } catch (error) {
        console.error("💥 Erreur traitement message:", error.message);

        const errorResponse = {
          event: "message_error",
          success: false,
          error: error.message,
          timestamp: new Date(),
          socketId: socket.id,
        };

        socket.emit("message_sent", errorResponse);
      }
    });

    // 🆕 ÉVÉNEMENTS POUR LES COMPTEURS
    socket.on("get_unread_counts", async (data) => {
      try {
        const { userId } = data;

        // Récupère les conversations avec des messages non lus
        const conversations = await Participants.find({
          Id_User: userId,
        }).populate({
          path: "Id_Conversation",
          match: { "unreadCounts.count": { $gt: 0 } },
          populate: { path: "unreadCounts.userId" },
        });

        const unreadData = conversations
          .filter((p) => p.Id_Conversation)
          .map((p) => ({
            conversationId: p.Id_Conversation._id,
            unreadCount:
              p.Id_Conversation.unreadCounts.find(
                (u) => u.userId.toString() === userId.toString()
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
        const { conversationId, userId } = data;

        // Met à jour le compteur à 0
        const Conversation = await import("../models/Conversation.js");
        await Conversation.default.findOneAndUpdate(
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

    // 🆕 ÉVÉNEMENT HEARTBEAT PRÉSENCE
    socket.on("user_heartbeat", async (data) => {
      if (currentUserId) {
        await updateUserActivity(currentUserId, socket.id);

        // Mettre à jour le statut en mémoire
        userPresence.set(currentUserId, {
          ...userPresence.get(currentUserId),
          lastSeen: new Date(),
          status: "online",
        });
      }
    });

    // 🆕 ÉVÉNEMENT CHANGEMENT STATUT
    socket.on("user_status_change", async (data) => {
      if (currentUserId && data.status) {
        await updateUserStatus(currentUserId, data.status);
        notifyUserPresence(io, currentUserId, data.status);
      }
    });

    // 🔊🆕 ÉVÉNEMENTS AUDIO EN TEMPS RÉEL
    socket.on("audio_stream_start", (data) => {
      const { conversationId, userId } = data;
      console.log("🎤 Début enregistrement audio - User:", userId);
      // Notifier les autres participants
      socket.to(conversationId).emit("user_recording_audio", {
        userId: userId,
        userName: socket.user?.username || "Utilisateur",
        conversationId: conversationId,
        timestamp: new Date(),
      });
    });
    socket.on("audio_stream_stop", (data) => {
      const { conversationId, userId } = data;
      console.log("⏹️ Fin enregistrement audio - User:", userId);
      // Notifier la fin d'enregistrement
      socket.to(conversationId).emit("user_stopped_recording", {
        userId: userId,
        conversationId: conversationId,
        timestamp: new Date(),
      });
    });
    socket.on("audio_message_played", (data) => {
      const { messageId, userId, conversationId } = data;
      console.log("🔊 Message audio joué:", messageId);

      // Marquer comme lu si nécessaire
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

      // Loguer l'activité
      socket.emit("audio_download_started", {
        messageId: messageId,
        timestamp: new Date(),
      });
    });
    socket.on("audio_upload_success", (data) => {
      const { conversationId, message } = data;
      console.log("✅ Upload audio réussi - Diffusion en temps réel");
      // Diffuser le message audio à tous les participants
      io.to(conversationId).emit("new_audio_message", {
        type: "audio",
        message: message,
        conversationId: conversationId,
        timestamp: new Date(),
      });
    });

    // Événements existants inchangés
    socket.on("ping", (data) => {
      socket.emit("pong", {
        event: "pong",
        message: "Serveur actif ✅",
        timestamp: new Date(),
        socketId: socket.id,
      });
    });

    socket.on("mark_as_read", async (data) => {
      try {
        console.log("👀 Message marqué comme lu:", data);
        socket.emit("message_read", {
          success: true,
          messageId: data.messageId,
        });
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    socket.on("disconnect", async (reason) => {
      console.log("🔴 User déconnecté:", socket.id, "Raison:", reason);

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
          await updateUserStatus(currentUserId, "offline");
          notifyUserPresence(io, currentUserId, "offline");
          console.log(
            `🔔 User ${currentUserId} est maintenant offline (0 sessions)`
          );
        } else {
          console.log(
            `🔔 User ${currentUserId} a ${remainingSessions} sessions restantes`
          );
        }
      }
    });

    socket.on("error", (error) => {
      console.error("💥 Erreur socket:", error);
    });
  });

  // 🆕 FONCTIONS HELPER PRÉSENCE AVANCÉE - CORRIGÉES

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
              deviceType: "desktop",
              userAgent: "test-browser",
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

  // 🆕 FONCTION CORRIGÉE POUR SUPPRIMER LES SESSIONS
  async function removeUserSession(userId, socketId) {
    try {
      console.log(`🗑️  Suppression session: ${socketId} pour user: ${userId}`);

      // 1. Supprimer de la BDD
      await User.findByIdAndUpdate(userId, {
        $pull: {
          activeSessions: { socketId: socketId },
        },
      });

      // 2. 🆕 CORRECTION : Mettre à jour la présence en mémoire
      if (userPresence.has(userId)) {
        const presence = userPresence.get(userId);

        // Filtrer les sessions pour enlever celle qui se déconnecte
        const beforeCount = presence.sessions ? presence.sessions.length : 0;
        presence.sessions = presence.sessions.filter(
          (s) => s.socketId !== socketId
        );
        const afterCount = presence.sessions ? presence.sessions.length : 0;

        console.log(`🔢 Sessions ${userId}: ${beforeCount} → ${afterCount}`);

        // Si plus de sessions, marquer comme offline
        if (afterCount === 0) {
          presence.status = "offline";
          console.log(`🔔 User ${userId} marqué comme offline (0 sessions)`);
        }
      }
    } catch (error) {
      console.error("❌ Erreur suppression session:", error);
    }
  }

  // 🆕 FONCTION POUR COMPTER LES SESSIONS RÉELLES
  async function getRemainingSessions(userId) {
    try {
      const user = await User.findById(userId);
      return user?.activeSessions?.length || 0;
    } catch (error) {
      console.error("❌ Erreur comptage sessions:", error);
      return 0;
    }
  }
};
