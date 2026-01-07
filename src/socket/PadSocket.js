import Participants from "../models/Participants.js";
import User from "../models/User.js";
import Pad from "../models/Pad.js";
import jwt from "jsonwebtoken";

export const configurePadSockets = (io) => {
  console.log("🔧 WebSocket Pad configuré");

  // Stockage temporaire
  const padBuffers = new Map();
  const activePadUsers = new Map();

  // Middleware d'authentification
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
    console.log("🔗 User connecté au Pad:", socket.userId);

    // ==================== ÉVÉNEMENTS PAD ====================

    // Rejoindre un pad
    socket.on("join_pad", async (conversationId) => {
      try {
        if (!conversationId) {
          throw new Error("ID de conversation requis");
        }

        // Vérifier que l'utilisateur est participant
        const participant = await Participants.findOne({
          Id_Conversation: conversationId,
          Id_User: socket.userId
        });

        if (!participant) {
          socket.emit("pad_error", { error: "Accès non autorisé" });
          return;
        }

        // Rejoindre la room du pad
        socket.join(`pad_${conversationId}`);
        
        // Initialiser le buffer
        if (!padBuffers.has(conversationId)) {
          padBuffers.set(conversationId, new Map());
        }
        
        padBuffers.get(conversationId).set(socket.userId, {
          content: "",
          mode: "text",
          lastSaved: Date.now()
        });
        
        // Tracker les utilisateurs actifs
        if (!activePadUsers.has(conversationId)) {
          activePadUsers.set(conversationId, new Set());
        }
        activePadUsers.get(conversationId).add(socket.userId);
        
        // Récupérer le pad
        const pad = await Pad.findOne({ conversationId });
        
        // Si pas de pad, en créer un
        let padData;
        if (!pad) {
          const newPad = new Pad({
            conversationId,
            content: "",
            mode: "text",
            lastUpdatedBy: socket.userId
          });
          await newPad.save();
          padData = newPad;
        } else {
          padData = pad;
        }
        
        // Récupérer les utilisateurs actifs
        const activeUsers = [];
        if (activePadUsers.has(conversationId)) {
          const userIds = Array.from(activePadUsers.get(conversationId));
          for (const userId of userIds) {
            const user = await User.findById(userId).select("username");
            if (user) {
              activeUsers.push({
                id: user._id.toString(),
                username: user.username
              });
            }
          }
        }
        
        // Envoyer l'état du pad
        socket.emit("pad_joined", {
          success: true,
          conversationId,
          pad: {
            _id: padData._id,
            content: padData.content,
            mode: padData.mode,
            lastUpdatedBy: padData.lastUpdatedBy,
            updatedAt: padData.updatedAt
          },
          activeUsers: activeUsers, // CORRIGÉ : array d'objets avec id et username
          timestamp: new Date()
        });
        
        // Notifier les autres utilisateurs
        socket.to(`pad_${conversationId}`).emit("pad_user_joined", {
          userId: socket.userId,
          username: socket.username,
          conversationId,
          timestamp: new Date(),
          activeUsersCount: activePadUsers.get(conversationId).size
        });
        
        console.log(`📝 User ${socket.userId} a rejoint le pad: ${conversationId}`);
        
      } catch (error) {
        console.error("❌ Erreur join_pad:", error);
        socket.emit("pad_error", { error: error.message });
      }
    });

    // Quitter un pad
    socket.on("leave_pad", async (conversationId) => {
      try {
        socket.leave(`pad_${conversationId}`);
        
        // Sauvegarder le buffer restant
        await flushPadBuffer(conversationId, socket.userId);
        
        // Nettoyer les buffers
        if (padBuffers.has(conversationId)) {
          padBuffers.get(conversationId).delete(socket.userId);
          if (padBuffers.get(conversationId).size === 0) {
            padBuffers.delete(conversationId);
          }
        }
        
        // Mettre à jour les utilisateurs actifs
        if (activePadUsers.has(conversationId)) {
          activePadUsers.get(conversationId).delete(socket.userId);
          if (activePadUsers.get(conversationId).size === 0) {
            activePadUsers.delete(conversationId);
          }
        }
        
        // Notifier les autres utilisateurs
        socket.to(`pad_${conversationId}`).emit("pad_user_left", {
          userId: socket.userId,
          username: socket.username,
          conversationId,
          timestamp: new Date(),
          activeUsersCount: activePadUsers.get(conversationId)?.size || 0
        });
        
        console.log(`📝 User ${socket.userId} a quitté le pad: ${conversationId}`);
        
      } catch (error) {
        console.error("❌ Erreur leave_pad:", error);
      }
    });

    // Modifier le contenu du pad
    socket.on("pad_content_change", async (data) => {
      try {
        const { conversationId, content, mode } = data;
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

        // Vérifier si l'utilisateur est dans le pad
        if (!activePadUsers.get(conversationId)?.has(userId)) {
          socket.emit("pad_error", { error: "Vous devez rejoindre le pad d'abord" });
          return;
        }

        // Mettre à jour le buffer
        if (!padBuffers.has(conversationId)) {
          padBuffers.set(conversationId, new Map());
        }
        
        const userBuffers = padBuffers.get(conversationId);
        if (!userBuffers.has(userId)) {
          userBuffers.set(userId, {
            content: "",
            mode: "text",
            lastSaved: Date.now()
          });
        }
        
        const buffer = userBuffers.get(userId);
        buffer.content = content;
        buffer.mode = mode || buffer.mode;
        buffer.lastSaved = Date.now();

        // Diffuser le changement
        socket.to(`pad_${conversationId}`).emit("pad_update", {
          type: "content_changed",
          conversationId,
          userId,
          username: socket.username,
          content: content,
          mode: mode,
          timestamp: new Date()
        });

        // Planifier la sauvegarde
        setTimeout(async () => {
          if (userBuffers.has(userId) && 
              Date.now() - userBuffers.get(userId).lastSaved >= 300) {
            await flushPadBuffer(conversationId, userId);
          }
        }, 300);

      } catch (error) {
        console.error("💥 Erreur pad_content_change:", error);
        socket.emit("pad_error", { error: error.message });
      }
    });

    // Cocher/décocher un item todo
    socket.on("pad_toggle_item", async (data) => {
      try {
        const { conversationId, lineIndex, completed } = data;
        const userId = socket.userId;

        if (!activePadUsers.get(conversationId)?.has(userId)) {
          socket.emit("pad_error", { error: "Rejoignez le pad d'abord" });
          return;
        }

        // Récupérer le pad
        const pad = await Pad.findOne({ conversationId });
        if (!pad) {
          throw new Error("Pad non trouvé");
        }



        // Mettre à jour le contenu
        const lines = pad.content.split('\n');
        if (lineIndex >= lines.length) {
          throw new Error("Ligne non trouvée");
        }

        let line = lines[lineIndex];
        const originalLine = line;
        
        if (completed) {
          // Remplacer ☐ par ✔
          if (line.startsWith('☐ ')) {
            line = line.replace(/^☐ /, '✔ ');
          }
        } else {
          // Remplacer ✔ par ☐
          if (line.startsWith('✔ ')) {
            line = line.replace(/^✔ /, '☐ ');
          }
        }
        
        // Mettre à jour seulement si la ligne a changé
        if (line !== originalLine) {
          lines[lineIndex] = line;
          pad.content = lines.join('\n');
          pad.lastUpdatedBy = userId;
          
          // Mettre à jour completedItems
          if (completed) {
            // Ajouter à completedItems si pas déjà présent
            const exists = pad.completedItems.some(item => item.lineIndex === lineIndex);
            if (!exists) {
              pad.completedItems.push({
                lineIndex,
                completedAt: new Date(),
                completedBy: userId
              });
            }
          } else {
            // Retirer de completedItems
            pad.completedItems = pad.completedItems.filter(item => item.lineIndex !== lineIndex);
          }
          
          await pad.save();

          // Diffuser aux autres
          io.to(`pad_${conversationId}`).emit("pad_update", {
            type: "item_toggled",
            conversationId,
            lineIndex,
            completed,
            completedBy: {
              _id: userId,
              username: socket.username
            },
            timestamp: new Date()
          });
        }

      } catch (error) {
        console.error("💥 Erreur pad_toggle_item:", error);
        socket.emit("pad_error", { error: error.message });
      }
    });

    // Changer le mode (text ↔ todo)
    socket.on("pad_change_mode", async (data) => {
      try {
        const { conversationId, mode } = data;
        const userId = socket.userId;

        if (!["text", "todo"].includes(mode)) {
          throw new Error("Mode invalide");
        }

        // Récupérer le pad
        const pad = await Pad.findOne({ conversationId });
        if (!pad) {
          throw new Error("Pad non trouvé");
        }

        const oldMode = pad.mode;
        
        if (oldMode === mode) {
          // Même mode, rien à faire
          socket.emit("pad_mode_changed", {
            success: true,
            mode,
            message: "Le pad est déjà dans ce mode"
          });
          return;
        }

        // Formater le contenu selon le nouveau mode
        let newContent = pad.content;
        
        if (mode === "todo" && oldMode === "text") {
          // Text → Todo : ajouter ☐ devant chaque ligne non vide
          const lines = newContent.split('\n');
          newContent = lines.map(line => {
            if (line.trim() === '') return line;
            // Si la ligne n'a pas déjà de checkbox
            if (!line.match(/^[☐✔□✓■▢◻◼⬜⬛]/)) {
              return `☐ ${line}`;
            }
            return line;
          }).join('\n');
        } else if (mode === "text" && oldMode === "todo") {
          // Todo → Text : enlever les checkbox du début
          const lines = newContent.split('\n');
          newContent = lines.map(line => {
            // Enlever les checkbox du début
            return line.replace(/^[☐✔□✓■▢◻◼⬜⬛]\s*/, '');
          }).join('\n');
          
          // Vider completedItems quand on passe en mode text
          pad.completedItems = [];
        }

        // Mettre à jour le pad
        pad.content = newContent;
        pad.mode = mode;
        pad.lastUpdatedBy = userId;
        await pad.save();

        // Diffuser le changement
        io.to(`pad_${conversationId}`).emit("pad_update", {
          type: "mode_changed",
          conversationId,
          mode: mode,
          content: newContent,
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

    // Position du curseur
    socket.on("pad_cursor_move", (data) => {
      const { conversationId, position } = data;
      const userId = socket.userId;

      socket.to(`pad_${conversationId}`).emit("pad_user_cursor", {
        userId,
        username: socket.username,
        conversationId,
        position,
        timestamp: new Date()
      });
    });

    // Déconnexion
    socket.on("disconnect", async () => {
      console.log("🔴 User déconnecté du Pad:", socket.userId);

      // Sauvegarder tous les buffers
      for (const [conversationId, users] of padBuffers.entries()) {
        if (users.has(socket.userId)) {
          try {
            await flushPadBuffer(conversationId, socket.userId);
            
            // Notifier que l'utilisateur a quitté
            activePadUsers.get(conversationId)?.delete(socket.userId);
            socket.to(`pad_${conversationId}`).emit("pad_user_left", {
              userId: socket.userId,
              username: socket.username,
              conversationId,
              timestamp: new Date(),
              reason: "disconnect",
              activeUsersCount: activePadUsers.get(conversationId)?.size || 0
            });
            
          } catch (error) {
            console.error(`❌ Erreur sauvegarde buffer ${conversationId}:`, error);
          }
        }
      }
    });
  });

  // ==================== FONCTIONS HELPER ====================

  const flushPadBuffer = async (conversationId, userId) => {
    try {
      if (!padBuffers.has(conversationId) || 
          !padBuffers.get(conversationId).has(userId)) {
        return;
      }
      
      const buffer = padBuffers.get(conversationId).get(userId);
      
      if (!buffer.content && buffer.content === "") {
        return;
      }
      
      // Sauvegarder dans la base
      const pad = await Pad.findOne({ conversationId });
      if (pad) {
        pad.content = buffer.content;
        pad.mode = buffer.mode;
        pad.lastUpdatedBy = userId;
        await pad.save();
        
        console.log(`💾 Pad sauvegardé: ${conversationId} (user: ${userId})`);
      }
      
    } catch (error) {
      console.error("💥 Erreur flushPadBuffer:", error);
    }
  };

  // Nettoyage périodique
  setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    padBuffers.forEach((users, conversationId) => {
      users.forEach((buffer, userId) => {
        if (now - buffer.lastSaved > 5000) {
          flushPadBuffer(conversationId, userId).catch(console.error);
          cleaned++;
        }
      });
    });
    
    if (cleaned > 0) {
      console.log(`🧹 Buffers Pad nettoyés: ${cleaned} buffers inactifs`);
    }
  }, 60000);
};