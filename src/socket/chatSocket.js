import { messageController } from "../controllers/messageController.js";
import { conversationController } from "../controllers/conversationController.js";
import { padController } from "../controllers/padController.js";
import Participants from "../models/Participants.js";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import Reaction from "../models/Reaction.js";
import Pad from "../models/Pad.js";
import jwt from "jsonwebtoken";

export const configureChatSockets = (io) => {
  console.log("🔧 WebSocket configuré - Système Pad avancé activé");

  // 🆕 STOCKAGE POUR LE PAD
  const padBuffers = new Map(); // conversationId -> Map<userId, buffer>
  const activePadUsers = new Map(); // conversationId -> Set<userId>
  const userPresence = new Map();

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

  io.on("connection", (socket) => {
    console.log("🔗 User connecté:", socket.userId, "- Socket:", socket.id);

    let presenceInterval = null;
    let padIntervals = new Map(); // Pour chaque pad

    // ==================== 🆕 PAD EVENTS AVANCÉS COMPLETS ====================

    // 🆕 JOIN PAD AVEC BUFFER
    socket.on("join_pad", async (conversationId) => {
      try {
        if (!conversationId) {
          throw new Error("ID de conversation requis");
        }

        // Vérifier l'accès
        const participant = await Participants.findOne({
          Id_Conversation: conversationId,
          Id_User: socket.userId
        });

        if (!participant) {
          socket.emit("pad_error", { error: "Accès non autorisé" });
          return;
        }

        // Rejoindre la room
        socket.join(`pad_${conversationId}`);
        
        // 🆕 INITIALISER LE BUFFER
        if (!padBuffers.has(conversationId)) {
          padBuffers.set(conversationId, new Map());
        }
        
        const userBuffer = {
          content: "",
          mode: "text",
          lastOperation: null,
          operations: [],
          lastSaved: Date.now()
        };
        
        padBuffers.get(conversationId).set(socket.userId, userBuffer);
        
        // 🆕 TRACKER LES UTILISATEURS ACTIFS
        if (!activePadUsers.has(conversationId)) {
          activePadUsers.set(conversationId, new Set());
        }
        activePadUsers.get(conversationId).add(socket.userId);
        
        // 🆕 RÉCUPÉRER LE PAD
        const pad = await padController.getOrCreatePad(conversationId, socket.userId);
        const stats = padController.getProgressStats(pad);
        
        // 🆕 ENVOYER L'ÉTAT COMPLET
        socket.emit("pad_joined", {
          success: true,
          conversationId,
          pad: {
            _id: pad._id,
            content: pad.content,
            mode: pad.mode,
            version: pad.version || 0,
            stats: stats,
            lastUpdatedBy: pad.lastUpdatedBy,
            updatedAt: pad.updatedAt
          },
          activeUsers: Array.from(activePadUsers.get(conversationId) || []),
          timestamp: new Date()
        });
        
        // 🆕 NOTIFIER LES AUTRES UTILISATEURS
        socket.to(`pad_${conversationId}`).emit("pad_user_joined", {
          userId: socket.userId,
          username: socket.username,
          conversationId,
          timestamp: new Date(),
          activeUsersCount: activePadUsers.get(conversationId).size
        });
        
        console.log(`📝 User ${socket.userId} a rejoint le pad: ${conversationId}`);
        
        // 🆕 DÉMARRER L'INTERVAL DE SAUVEGARDE AUTO
        const saveInterval = setInterval(async () => {
          const buffer = padBuffers.get(conversationId)?.get(socket.userId);
          if (buffer && buffer.operations.length > 0 && 
              Date.now() - buffer.lastSaved > 600) {
            await flushPadBuffer(conversationId, socket.userId);
          }
        }, 900);
        
        padIntervals.set(conversationId, saveInterval);
        
      } catch (error) {
        console.error("❌ Erreur join_pad:", error);
        socket.emit("pad_error", { error: error.message });
      }
    });

    // 🆕 LEAVE PAD AVEC NETTOYAGE
    socket.on("leave_pad", (conversationId) => {
      try {
        socket.leave(`pad_${conversationId}`);
        
        // 🆕 SAUVEGARDER LE BUFFER RESTANT
        flushPadBuffer(conversationId, socket.userId).catch(console.error);
        
        // 🆕 NETTOYER LES BUFFERS
        if (padBuffers.has(conversationId)) {
          padBuffers.get(conversationId).delete(socket.userId);
          if (padBuffers.get(conversationId).size === 0) {
            padBuffers.delete(conversationId);
          }
        }
        
        // 🆕 METTRE À JOUR LES UTILISATEURS ACTIFS
        if (activePadUsers.has(conversationId)) {
          activePadUsers.get(conversationId).delete(socket.userId);
          if (activePadUsers.get(conversationId).size === 0) {
            activePadUsers.delete(conversationId);
          }
        }
        
        // 🆕 ARRÊTER L'INTERVAL DE SAUVEGARDE
        if (padIntervals.has(conversationId)) {
          clearInterval(padIntervals.get(conversationId));
          padIntervals.delete(conversationId);
        }
        
        // 🆕 NOTIFIER LES AUTRES UTILISATEURS
        socket.to(`pad_${conversationId}`).emit("pad_user_left", {
          userId: socket.userId,
          username: socket.username,
          conversationId,
          timestamp: new Date(),
          activeUsersCount: activePadUsers.get(conversationId)?.size || 0
        });
        
        console.log(`📝 User ${socket.userId} a quitté le pad: ${conversationId}`);
        
        socket.emit("pad_left", {
          success: true,
          conversationId,
          timestamp: new Date()
        });
        
      } catch (error) {
        console.error("❌ Erreur leave_pad:", error);
      }
    });

    // 🆕 PAD CONTENT CHANGE AVEC BUFFER
    socket.on("pad_content_change", async (data) => {
      try {
        const { conversationId, content, mode, operation } = data;
        const userId = socket.userId;

        // Vérifier l'accès
        const participant = await Participants.findOne({
          Id_Conversation: conversationId,
          Id_User: userId
        });

        if (!participant) {
          socket.emit("pad_error", { error: "Accès non autorisé" });
          return;
        }

        // 🆕 VÉRIFIER SI L'UTILISATEUR EST DANS LE PAD
        if (!activePadUsers.get(conversationId)?.has(userId)) {
          socket.emit("pad_error", { error: "Vous devez rejoindre le pad d'abord" });
          return;
        }

        // 🆕 INITIALISER/METTRE À JOUR LE BUFFER
        if (!padBuffers.has(conversationId)) {
          padBuffers.set(conversationId, new Map());
        }
        
        const userBuffers = padBuffers.get(conversationId);
        if (!userBuffers.has(userId)) {
          userBuffers.set(userId, {
            content: "",
            mode: "text",
            lastOperation: null,
            operations: [],
            lastSaved: Date.now()
          });
        }
        
        const buffer = userBuffers.get(userId);
        buffer.content = content;
        buffer.mode = mode || buffer.mode;
        buffer.lastOperation = operation;
        
        if (operation) {
          buffer.operations.push({
            ...operation,
            authorId: userId,
            clientId: operation.clientId || `client_${Date.now()}_${Math.random()}`,
            timestamp: new Date()
          });
        }
        
        buffer.lastSaved = Date.now();

        // 🆕 DIFFUSER LE CHANGEMENT
        const broadcastData = {
          type: "content_changed",
          conversationId,
          userId,
          username: socket.username,
          operation: operation,
          content: operation ? null : content,
          mode: mode,
          timestamp: new Date(),
          bufferSize: buffer.operations.length
        };

        // 🆕 COMPRESSION POUR GRANDS CONTENUS
        if (content && content.length > 1024) {
          broadcastData.compressed = true;
          broadcastData.contentLength = content.length;
        }

        socket.to(`pad_${conversationId}`).emit("pad_update", broadcastData);

        // 🆕 GESTION AUTO-SAVE
        const shouldSaveNow = 
          buffer.operations.length >= 50 ||
          content.length > 10000 ||
          operation?.type === "format";
        
        if (shouldSaveNow) {
          await flushPadBuffer(conversationId, userId);
        } else {
          setTimeout(() => {
            if (userBuffers.has(userId) && 
                Date.now() - userBuffers.get(userId).lastSaved > 300) {
              flushPadBuffer(conversationId, userId).catch(console.error);
            }
          }, 300);
        }

        // 🆕 CONFIRMATION
        socket.emit("pad_change_acknowledged", {
          conversationId,
          timestamp: new Date(),
          bufferSize: buffer.operations.length,
          willSave: shouldSaveNow
        });

      } catch (error) {
        console.error("💥 Erreur pad_content_change:", error);
        socket.emit("pad_error", { error: error.message });
      }
    });

    // 🆕 FLUSH PAD BUFFER
    const flushPadBuffer = async (conversationId, userId) => {
      try {
        if (!padBuffers.has(conversationId) || 
            !padBuffers.get(conversationId).has(userId)) {
          return;
        }
        
        const buffer = padBuffers.get(conversationId).get(userId);
        
        if (buffer.operations.length === 0 && !buffer.content) {
          return;
        }
        
        // 🆕 SAUVEGARDER
        const savedPad = await padController.updatePadContent(
          conversationId,
          userId,
          buffer.content,
          buffer.mode,
          buffer.operations.length > 0 ? buffer.operations[0] : null
        );
        
        // 🆕 NETTOYER
        buffer.operations = [];
        buffer.lastSaved = Date.now();
        
        // 🆕 NOTIFIER
        io.to(`pad_${conversationId}`).emit("pad_saved", {
          conversationId,
          userId,
          version: savedPad.version,
          timestamp: new Date()
        });
        
        console.log(`💾 Pad sauvegardé: ${conversationId} (user: ${userId})`);
        
      } catch (error) {
        console.error("💥 Erreur flushPadBuffer:", error);
        io.to(`user_${userId}`).emit("pad_save_error", {
          conversationId,
          error: error.message,
          timestamp: new Date()
        });
      }
    };

    // 🆕 PAD TOGGLE ITEM
    socket.on("pad_toggle_item", async (data) => {
      try {
        const { conversationId, lineIndex, completed, metadata = {} } = data;
        const userId = socket.userId;

        if (!activePadUsers.get(conversationId)?.has(userId)) {
          socket.emit("pad_error", { error: "Rejoignez le pad d'abord" });
          return;
        }

        const updatedPad = await padController.toggleTodoItem(
          conversationId,
          userId,
          lineIndex,
          completed,
          metadata
        );

        const stats = padController.getProgressStats(updatedPad);

        // 🆕 DIFFUSER
        io.to(`pad_${conversationId}`).emit("pad_update", {
          type: "item_toggled",
          conversationId,
          lineIndex,
          completed,
          completedBy: {
            _id: userId,
            username: socket.username
          },
          metadata: metadata,
          stats: stats,
          timestamp: new Date()
        });

        // 🆕 NOTIFICATION POUR LES ASSIGNÉS
        if (completed) {
          const pad = await Pad.findOne({ conversationId }).lean();
          const assignment = pad?.assignedItems?.find(a => a.lineIndex === lineIndex);
          
          if (assignment && assignment.assignedTo.toString() !== userId) {
            io.to(`user_${assignment.assignedTo}`).emit("task_completed_by_other", {
              conversationId,
              lineIndex,
              completedBy: socket.username,
              itemText: pad.content.split('\n')[lineIndex]?.substring(0, 100),
              timestamp: new Date()
            });
          }
        }

      } catch (error) {
        console.error("💥 Erreur pad_toggle_item:", error);
        socket.emit("pad_error", { error: error.message });
      }
    });

    // 🆕 PAD ASSIGN ITEM
    socket.on("pad_assign_item", async (data) => {
      try {
        const { conversationId, lineIndex, assignToUserId, metadata = {} } = data;
        const userId = socket.userId;

        const updatedPad = await padController.assignItem(
          conversationId,
          userId,
          lineIndex,
          assignToUserId,
          metadata
        );

        const stats = padController.getProgressStats(updatedPad);

        // 🆕 DIFFUSER
        io.to(`pad_${conversationId}`).emit("pad_update", {
          type: "item_assigned",
          conversationId,
          lineIndex,
          assignedTo: assignToUserId,
          assignedBy: {
            _id: userId,
            username: socket.username
          },
          metadata: metadata,
          timestamp: new Date(),
          stats: stats
        });

        // 🆕 NOTIFICATION
        if (metadata.notify !== false) {
          io.to(`user_${assignToUserId}`).emit("task_assigned", {
            conversationId,
            lineIndex,
            assignedBy: socket.username,
            metadata: metadata,
            timestamp: new Date(),
            priority: metadata.priority || "medium"
          });
        }

      } catch (error) {
        console.error("💥 Erreur pad_assign_item:", error);
        socket.emit("pad_error", { error: error.message });
      }
    });

    // 🆕 PAD CHANGE MODE
    socket.on("pad_change_mode", async (data) => {
      try {
        const { conversationId, mode } = data;
        const userId = socket.userId;

        const updatedPad = await padController.toggleMode(
          conversationId,
          userId,
          mode
        );

        let formattedContent = updatedPad.content;
        if (mode === "todo") {
          formattedContent = padController.formatContentForTodo(updatedPad.content);
        } else {
          formattedContent = padController.formatContentForText(updatedPad.content);
        }

        const finalPad = await padController.updatePadContent(
          conversationId,
          userId,
          formattedContent,
          mode
        );

        const stats = padController.getProgressStats(finalPad);

        // 🆕 DIFFUSER
        io.to(`pad_${conversationId}`).emit("pad_update", {
          type: "mode_changed",
          conversationId,
          mode: mode,
          content: formattedContent,
          stats: stats,
          updatedBy: {
            _id: userId,
            username: socket.username
          },
          timestamp: new Date()
        });

      } catch (error) {
        console.error("💥 Erreur pad_change_mode:", error);
        socket.emit("pad_error", { error: error.message });
      }
    });

    // 🆕 PAD CURSOR POSITION
    socket.on("pad_cursor_move", (data) => {
      const { conversationId, position, selection } = data;
      const userId = socket.userId;

      socket.to(`pad_${conversationId}`).emit("pad_user_cursor", {
        userId,
        username: socket.username,
        conversationId,
        position,
        selection,
        timestamp: new Date(),
        color: getCursorColor(userId)
      });
    });

    // 🆕 PAD GET HISTORY
    socket.on("pad_get_history", async (data) => {
      try {
        const { conversationId, limit = 50 } = data;
        const userId = socket.userId;

        const pad = await padController.getOrCreatePad(conversationId, userId);
        
        if (!pad.versionHistory) {
          socket.emit("pad_history", {
            success: true,
            conversationId,
            history: [],
            total: 0
          });
          return;
        }
        
        const history = pad.versionHistory
          .slice(0, parseInt(limit))
          .map(version => ({
            content: version.content.substring(0, 500),
            mode: version.mode,
            version: version.version,
            updatedBy: version.updatedBy,
            updatedAt: version.updatedAt
          }));
        
        socket.emit("pad_history", {
          success: true,
          conversationId,
          history: history,
          total: pad.versionHistory.length,
          currentVersion: pad.version || 0
        });
        
      } catch (error) {
        console.error("💥 Erreur pad_get_history:", error);
        socket.emit("pad_error", { error: error.message });
      }
    });

    // 🆕 PAD RESTORE VERSION
    socket.on("pad_restore_version", async (data) => {
      try {
        const { conversationId, versionIndex } = data;
        const userId = socket.userId;

        const restoredPad = await padController.restoreVersion(
          conversationId,
          userId,
          versionIndex
        );
        
        const stats = padController.getProgressStats(restoredPad);
        
        // 🆕 DIFFUSER
        io.to(`pad_${conversationId}`).emit("pad_update", {
          type: "version_restored",
          conversationId,
          version: restoredPad.version,
          content: restoredPad.content,
          restoredBy: {
            _id: userId,
            username: socket.username
          },
          stats: stats,
          timestamp: new Date()
        });
        
        socket.emit("pad_restored", {
          success: true,
          conversationId,
          version: restoredPad.version,
          timestamp: new Date()
        });
        
      } catch (error) {
        console.error("💥 Erreur pad_restore_version:", error);
        socket.emit("pad_error", { error: error.message });
      }
    });

    // 🆕 PAD UPDATE PREFERENCES
    socket.on("pad_update_preferences", async (data) => {
      try {
        const { conversationId, preferences } = data;
        const userId = socket.userId;

        const updatedPad = await padController.updatePreferences(
          conversationId,
          userId,
          preferences
        );

        if (preferences.theme || preferences.fontSize) {
          socket.to(`pad_${conversationId}`).emit("pad_update", {
            type: "preferences_updated",
            conversationId,
            preferences: updatedPad.preferences,
            updatedBy: {
              _id: userId,
              username: socket.username
            },
            timestamp: new Date()
          });
        }

        socket.emit("pad_preferences_updated", {
          success: true,
          conversationId,
          preferences: updatedPad.preferences,
          timestamp: new Date()
        });

      } catch (error) {
        console.error("💥 Erreur update preferences:", error);
        socket.emit("pad_error", { error: error.message });
      }
    });

    // 🆕 PAD QUICK COMMAND
    socket.on("pad_quick_command", async (data) => {
      try {
        const { conversationId, command, args } = data;
        const userId = socket.userId;

        let result = null;

        switch (command) {
          case "clear_completed":
            const pad = await Pad.findOne({ conversationId });
            if (pad) {
              const completedLines = pad.completedItems.map(item => item.lineIndex);
              pad.completedItems = [];
              await pad.save();
              
              result = {
                type: "completed_cleared",
                clearedCount: completedLines.length,
                lines: completedLines
              };
            }
            break;

          case "toggle_all":
            const pad2 = await Pad.findOne({ conversationId });
            if (pad2 && pad2.mode === "todo") {
              const lines = pad2.content.split('\n').filter(l => l.trim());
              const allCompleted = pad2.completedItems.length === lines.length;
              
              if (allCompleted) {
                pad2.completedItems = [];
              } else {
                pad2.completedItems = lines.map((_, index) => ({
                  lineIndex: index,
                  completedAt: new Date(),
                  completedBy: userId
                }));
              }
              await pad2.save();
              
              result = {
                type: "all_toggled",
                completed: !allCompleted,
                count: lines.length
              };
            }
            break;

          default:
            throw new Error(`Commande inconnue: ${command}`);
        }

        if (result) {
          io.to(`pad_${conversationId}`).emit("pad_update", {
            type: "quick_command_result",
            conversationId,
            command: command,
            result: result,
            executedBy: {
              _id: userId,
              username: socket.username
            },
            timestamp: new Date()
          });

          socket.emit("pad_command_executed", {
            success: true,
            command: command,
            result: result,
            timestamp: new Date()
          });
        }

      } catch (error) {
        console.error("💥 Erreur pad_quick_command:", error);
        socket.emit("pad_error", { error: error.message });
      }
    });

    // ==================== 🔊 MESSAGES VOCAUX ====================

    socket.on("audio_stream_start", (data) => {
      const { conversationId } = data;
      
      if (activePadUsers.has(conversationId)) {
        socket.to(`pad_${conversationId}`).emit("user_recording_audio", {
          userId: socket.userId,
          userName: socket.username,
          conversationId: conversationId,
          timestamp: new Date(),
          context: "pad"
        });
      } else {
        socket.to(conversationId).emit("user_recording_audio", {
          userId: socket.userId,
          userName: socket.username,
          conversationId: conversationId,
          timestamp: new Date(),
          context: "chat"
        });
      }
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

    // ==================== 🎯 RÉACTIONS EN TEMPS RÉEL ====================

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

    socket.on("add_reaction", async (data) => {
      try {
        const { messageId, emoji, context = "chat" } = data;
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
          emoji,
          context: context
        });
        await reaction.save();
        await reaction.populate("id_user", "username avatar");

        // Récupérer le message
        const Message = await import("../models/Message.js");
        const message = await Message.default.findById(messageId);

        // 🆕 DIFFUSER SELON CONTEXTE
        const broadcastData = {
          reaction,
          messageId,
          userId,
          context: context,
          timestamp: new Date(),
        };

        if (context === "pad") {
          socket.to(`pad_${message?.conversationId}`).emit("pad_reaction_added", broadcastData);
        } else {
          socket.to(`message_${messageId}`).emit("reaction_added", broadcastData);
          
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

        // 🆕 DIFFUSER LA SUPPRESSION
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

    // ==================== VOTRE CODE EXISTANT ====================

    // 🆕 JOIN NOTIFICATIONS AVEC USERID DU TOKEN
    socket.on("join_notifications", async () => {
      try {
        const userId = socket.userId;

        socket.join(`user_${userId}`);

        // 🆕 METTRE À JOUR LA PRÉSENCE AVANCÉE
        await updateUserPresence(userId, socket.id, "online");

        console.log(
          `🔔 User ${userId} a rejoint ses notifications (présence: online)`
        );

        // 🆕 NOTIFIER LES CONTACTS DE LA PRÉSENCE
        notifyUserPresence(io, userId, "online");

        // 🆕 DÉMARRER LE HEARTBEAT
        presenceInterval = startPresenceHeartbeat(userId, socket.id);
      } catch (error) {
        socket.emit("notification_error", { message: error.message });
      }
    });

    // Événements existants
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

        // METTRE À JOUR L'ACTIVITÉ
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

    // 🆕 ÉVÉNEMENT ENVOI MESSAGE SÉCURISÉ
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

        const finalMessageData = {
          ...messageData,
          Id_sender: socket.userId,
        };

        const savedMessage = await messageController.createMessage(
          finalMessageData,
          io,
          socket.userId
        );

        await updateUserActivity(socket.userId, socket.id);

        socket.emit("message_sent", {
          success: true,
          data: savedMessage,
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

    // 🆕 ÉVÉNEMENT ENVOI IMAGE
    socket.on('send_image_message', async (data) => {
      console.log('🖼️ Image message reçu:', data);
      
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
          typeMessage: 'image'
        };

        let fileBuffer;
        if (typeof data.file === 'string' && data.file.startsWith('data:image')) {
          const base64Data = data.file.split(',')[1];
          fileBuffer = Buffer.from(base64Data, 'base64');
        } else if (data.fileBuffer) {
          fileBuffer = Buffer.from(data.fileBuffer);
        } else {
          throw new Error('Format de fichier image non reconnu');
        }

        const file = { 
          buffer: fileBuffer,
          originalname: data.fileName || 'image',
          mimetype: data.fileType || 'image/jpeg'
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
          timestamp: new Date()
        });

        console.log('🖼️ Message image traité - ID:', savedMessage._id);

      } catch (error) {
        console.error('💥 Erreur traitement image message:', error.message);
        socket.emit('image_message_error', {
          success: false,
          error: error.message,
          timestamp: new Date()
        });
      }
    });

    // 🆕 ÉVÉNEMENT ENVOI FICHIER
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
          typeMessage: 'file'
        };

        let fileBuffer;
        if (typeof data.file === 'string' && data.file.startsWith('data:')) {
          const base64Data = data.file.split(',')[1];
          fileBuffer = Buffer.from(base64Data, 'base64');
        } else if (data.fileBuffer) {
          fileBuffer = Buffer.from(data.fileBuffer);
        } else {
          throw new Error('Format de fichier non reconnu');
        }

        const file = { 
          buffer: fileBuffer,
          originalname: data.fileName || data.originalName || 'file',
          mimetype: data.fileType || 'application/octet-stream',
          size: data.fileSize
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
          typeMessage: savedMessage.typeMessage || 'file',
          content: savedMessage.content,
          fileUrl: savedMessage.fileUrl,
          fileName: savedMessage.fileName || data.fileName,
          fileSize: savedMessage.fileSize || data.fileSize,
          fileType: savedMessage.fileType || data.fileType,
          originalName: savedMessage.originalName || data.originalName,
          status: savedMessage.status,
          time: savedMessage.time || savedMessage.timestamp,
          timestamp: new Date()
        };

        socket.emit('file_message_sent', {
          success: true,
          data: formattedMessage,
          timestamp: new Date()
        });

        console.log('📎 Message fichier traité - ID:', savedMessage._id);

      } catch (error) {
        console.error('💥 Erreur traitement fichier message:', error.message);
        socket.emit('file_message_error', {
          success: false,
          error: error.message,
          timestamp: new Date()
        });
      }
    });

    // 🆕 ÉVÉNEMENT ENVOI VIDÉO
    socket.on('send_video_message', async (data) => {
      console.log('🎥 Video message reçu:', data);
      
      try {
        if (!data.file) {
          throw new Error('Aucun fichier vidéo reçu');
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
          typeMessage: 'video'
        };

        const fileBuffer = Buffer.from(new Uint8Array(data.file));

        const file = { 
          buffer: fileBuffer,
          originalname: data.fileName || 'video',
          mimetype: data.fileType || 'video/mp4',
          size: data.fileSize
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
          typeMessage: savedMessage.typeMessage || 'video',
          content: savedMessage.content,
          fileUrl: savedMessage.fileUrl,
          fileName: savedMessage.fileName || data.fileName,
          fileSize: savedMessage.fileSize || data.fileSize,
          fileType: savedMessage.fileType || data.fileType,
          status: savedMessage.status,
          time: savedMessage.time || savedMessage.timestamp,
          timestamp: new Date()
        };

        socket.emit('video_message_sent', {
          success: true,
          data: formattedMessage,
          timestamp: new Date()
        });

        console.log('🎥 Message vidéo traité - ID:', savedMessage._id);

      } catch (error) {
        console.error('💥 Erreur traitement vidéo message:', error.message);
        socket.emit('video_message_error', {
          success: false,
          error: error.message,
          timestamp: new Date()
        });
      }
    });

    // ÉVÉNEMENTS COMPTEURS
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

    // ÉVÉNEMENT HEARTBEAT PRÉSENCE
    socket.on("user_heartbeat", async () => {
      const userId = socket.userId;
      await updateUserActivity(userId, socket.id);

      userPresence.set(userId, {
        ...userPresence.get(userId),
        lastSeen: new Date(),
        status: "online",
      });
    });

    // ÉVÉNEMENT CHANGEMENT STATUT
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

    // 🆕 DÉCONNEXION
    socket.on("disconnect", async (reason) => {
      console.log("🔴 User déconnecté:", socket.userId, "- Raison:", reason);

      // NETTOYAGE INTERVAL
      if (presenceInterval) {
        clearInterval(presenceInterval);
        presenceInterval = null;
      }
      
      // 🆕 NETTOYAGE PAD
      padIntervals.forEach(interval => clearInterval(interval));
      padIntervals.clear();

      // 🆕 SAUVEGARDER BUFFERS PAD
      const userPads = Array.from(padBuffers.entries())
        .filter(([_, users]) => users.has(socket.userId));
      
      for (const [conversationId, users] of userPads) {
        try {
          await flushPadBuffer(conversationId, socket.userId);
          
          activePadUsers.get(conversationId)?.delete(socket.userId);
          socket.to(`pad_${conversationId}`).emit("pad_user_left", {
            userId: socket.userId,
            username: socket.username,
            conversationId,
            timestamp: new Date(),
            reason: reason,
            activeUsersCount: activePadUsers.get(conversationId)?.size || 0
          });
          
        } catch (error) {
          console.error(`❌ Erreur sauvegarde buffer ${conversationId}:`, error);
        }
      }

      if (socket.userId) {
        await removeUserSession(socket.userId, socket.id);

        const remainingSessions = await getRemainingSessions(socket.userId);

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
    });
  });

  // ==================== FONCTIONS HELPER ====================

  // 🆕 COULEUR CURSEUR
  function getCursorColor(userId) {
    const colors = [
      "#FF6B6B", "#4ECDC4", "#FFD166", "#06D6A0", 
      "#118AB2", "#073B4C", "#EF476F", "#7209B7"
    ];
    const hash = userId.split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    return colors[Math.abs(hash) % colors.length];
  }

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
          
          if (presence.sessions.length === 0) {
            presence.status = "offline";
          }
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

  function notifyUserPresence(io, userId, status) {
    io.emit("user_presence_changed", {
      userId: userId,
      status: status,
      lastSeen: new Date(),
    });
  }

  // 🆕 NETTOYAGE BUFFERS
  setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    padBuffers.forEach((users, conversationId) => {
      users.forEach((buffer, userId) => {
        if (now - buffer.lastSaved > 3000) {
          flushPadBuffer(conversationId, userId).catch(console.error);
          cleaned++;
        }
      });
    });
    
    if (cleaned > 0) {
      console.log(`🧹 Buffers nettoyés: ${cleaned} buffers inactifs`);
    }
  }, 60000);
};