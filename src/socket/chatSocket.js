// src/socket/chatSocket.js
import Reaction from "../models/Reaction.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js"; // ⭐ NOUVEAU : Pour vérifier les conversations

// ⭐ STOCKAGE EN MÉMOIRE DES UTILISATEURS
const onlineUsers = new Map(); // userId -> socketId (pour suivre qui est en ligne)
const typingUsers = new Map(); // conversationId -> Set of userIds (pour suivre qui tape)

export const setupSocketIO = (io) => {
  io.on("connection", (socket) => {
    console.log(
      "🔌 Utilisateur connecté:",
      socket.id,
      "User ID:",
      socket.userId
    );

    // 📍 MARQUER L'UTILISATEUR COMME EN LIGNE
    if (socket.userId) {
      onlineUsers.set(socket.userId, socket.id);

      // Notifier tous les amis/conversations que l'user est en ligne
      socket.broadcast.emit("user_online", { userId: socket.userId });

      console.log(`🟢 User ${socket.userId} est maintenant en ligne`);
    }

    // 👥 REJOINDRE UNE ROOM DE CONVERSATION
    socket.on("join_conversation", (conversationId) => {
      socket.join(conversationId);
      console.log(
        `👥 User ${socket.userId} a rejoint la conversation: ${conversationId}`
      );
    });

    // 🚪 QUITTER UNE ROOM DE CONVERSATION
    socket.on("leave_conversation", (conversationId) => {
      socket.leave(conversationId);
      console.log(
        `🚪 User ${socket.userId} a quitté la conversation: ${conversationId}`
      );
    });

    // 🔥 MESSAGES EN TEMPS RÉEL - TEXTE
    socket.on("send_message", async (data) => {
      try {
        const { conversationId, content, typeMessage = "text" } = data;
        const userId = socket.userId;

        console.log(`📨 Nouveau message dans ${conversationId} par ${userId}`);

        // ⭐ VÉRIFICATION DE SÉCURITÉ : L'utilisateur fait-il partie de la conversation ?
        const conversation = await Conversation.findById(conversationId);
        if (!conversation || !conversation.participants.includes(userId)) {
          socket.emit("error", {
            message: "Accès non autorisé à cette conversation",
          });
          return;
        }

        // Créer le message en base
        const message = new Message({
          conversationId,
          sender: userId,
          content,
          typeMessage,
          status: "sent",
        });

        await message.save();
        await message.populate("sender", "username avatar");

        // ⭐ METTRE À JOUR LA CONVERSATION AVEC LE DERNIER MESSAGE
        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessage: message._id,
          lastMessageAt: new Date(),
        });

        // 📢 Diffuser à tous les participants de la conversation
        io.to(conversationId).emit("new_message", {
          type: "new_message",
          data: message,
        });

        // ✅ Confirmer à l'émetteur
        socket.emit("message_sent_success", message);
      } catch (error) {
        console.error("Erreur envoi message:", error);
        socket.emit("error", { message: error.message });
      }
    });

    // 🖼️ ⭐ NOUVEAU : ENVOI DE MESSAGE AVEC IMAGE
    socket.on("send_image_message", async (data) => {
      try {
        const { conversationId, imageUrl, fileName } = data;
        const userId = socket.userId;

        console.log(`🖼️ Nouvelle image dans ${conversationId} par ${userId}`);

        // ⭐ VÉRIFICATION DE SÉCURITÉ
        const conversation = await Conversation.findById(conversationId);
        if (!conversation || !conversation.participants.includes(userId)) {
          socket.emit("error", {
            message: "Accès non autorisé à cette conversation",
          });
          return;
        }

        // ⭐ CRÉER LE MESSAGE IMAGE
        // On utilise typeMessage = 'image' et on stocke l'URL dans content
        const message = new Message({
          conversationId,
          sender: userId,
          typeMessage: "image", // ⭐ IMPORTANT : Marquer comme image
          content: imageUrl, // ⭐ Stocker l'URL de l'image
          status: "sent",
        });

        await message.save();
        await message.populate("sender", "username avatar");

        // ⭐ METTRE À JOUR LA CONVERSATION
        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessage: message._id,
          lastMessageAt: new Date(),
        });

        // 📢 Diffuser l'image à tous les participants
        io.to(conversationId).emit("new_message", {
          type: "new_message",
          data: message,
        });

        // ✅ Confirmation à l'expéditeur
        socket.emit("image_message_sent_success", message);
      } catch (error) {
        console.error("❌ Erreur envoi image:", error);
        socket.emit("error", { message: "Erreur lors de l'envoi de l'image" });
      }
    });

    // ✏️ ⭐ NOUVEAU : ÉDITION DE MESSAGE
    socket.on("edit_message", async (data) => {
      try {
        const { messageId, newContent } = data;
        const userId = socket.userId;

        console.log(`✏️ Édition du message ${messageId} par ${userId}`);

        // Trouver le message
        const message = await Message.findById(messageId);
        if (!message) {
          socket.emit("error", { message: "Message non trouvé" });
          return;
        }

        // ⭐ VÉRIFIER QUE L'UTILISATEUR EST BIEN L'AUTEUR
        if (message.sender.toString() !== userId) {
          socket.emit("error", {
            message: "Non autorisé à modifier ce message",
          });
          return;
        }

        // ⭐ METTRE À JOUR LE MESSAGE
        message.content = newContent;
        message.edited = true;
        message.editedAt = new Date();
        await message.save();

        await message.populate("sender", "username avatar");

        // 📢 Diffuser la mise à jour à tous les participants
        io.to(message.conversationId.toString()).emit("message_edited", {
          type: "message_edited",
          data: message,
        });

        // ✅ Confirmation
        socket.emit("message_edited_success", message);
      } catch (error) {
        console.error("Erreur édition message:", error);
        socket.emit("error", { message: error.message });
      }
    });

    // 🗑️ ⭐ NOUVEAU : SUPPRESSION DE MESSAGE
    socket.on("delete_message", async (data) => {
      try {
        const { messageId } = data;
        const userId = socket.userId;

        console.log(`🗑️ Suppression du message ${messageId} par ${userId}`);

        // Trouver le message et la conversation
        const message = await Message.findById(messageId);
        if (!message) {
          socket.emit("error", { message: "Message non trouvé" });
          return;
        }

        const conversation = await Conversation.findById(
          message.conversationId
        );

        // ⭐ VÉRIFIER LES PERMISSIONS
        const isAuthor = message.sender.toString() === userId;
        const isAdmin = conversation.admin.toString() === userId;

        if (!isAuthor && !isAdmin) {
          socket.emit("error", {
            message: "Non autorisé à supprimer ce message",
          });
          return;
        }

        // ⭐ SOFT DELETE : Marquer comme supprimé sans effacer de la base
        if (isAdmin && !isAuthor) {
          // Suppression par admin
          message.deletedByAdmin = true;
          message.content = "Message supprimé par un administrateur";
        } else {
          // Suppression par l'auteur
          message.deleted = true;
          message.content = "Message supprimé";
        }

        await message.save();

        // 📢 Diffuser la suppression
        io.to(message.conversationId.toString()).emit("message_deleted", {
          type: "message_deleted",
          messageId: messageId,
          deletedByAdmin: !isAuthor, // Indiquer qui a supprimé
        });

        // ✅ Confirmation
        socket.emit("message_deleted_success", { messageId });
      } catch (error) {
        console.error("Erreur suppression message:", error);
        socket.emit("error", { message: error.message });
      }
    });

    // 🔥 INDICATEUR "TYPING..." (ÉCRITURE EN COURS)
    socket.on("typing_start", (data) => {
      const { conversationId } = data;
      const userId = socket.userId;

      console.log(`✍️ User ${userId} tape dans ${conversationId}`);

      // Ajouter aux utilisateurs en train d'écrire
      if (!typingUsers.has(conversationId)) {
        typingUsers.set(conversationId, new Set());
      }
      typingUsers.get(conversationId).add(userId);

      // Notifier les autres participants
      socket.to(conversationId).emit("user_typing", {
        conversationId,
        userId,
        typing: true,
        typingUsers: Array.from(typingUsers.get(conversationId)),
      });
    });

    socket.on("typing_stop", (data) => {
      const { conversationId } = data;
      const userId = socket.userId;

      console.log(`⏹️ User ${userId} arrête de taper dans ${conversationId}`);

      // Retirer des utilisateurs en train d'écrire
      if (typingUsers.has(conversationId)) {
        typingUsers.get(conversationId).delete(userId);
      }

      // Notifier les autres participants
      socket.to(conversationId).emit("user_typing", {
        conversationId,
        userId,
        typing: false,
        typingUsers: Array.from(typingUsers.get(conversationId) || []),
      });
    });
    //Reactioooooooo
    // 🔥 ÉVÉNEMENTS RÉACTIONS AUX MESSAGES
    socket.on("add_reaction", async (data) => {
      try {
        const { messageId, emoji } = data;
        const userId = socket.userId;

        console.log(
          `🎯 Nouvelle réaction: ${emoji} sur le message ${messageId} par user ${userId}`
        );

        // Vérifier si le message existe
        const message = await Message.findById(messageId);
        if (!message) {
          socket.emit("error", { message: "Message non trouvé" });
          return;
        }

        // ⭐ VÉRIFIER SI L'UTILISATEUR A DÉJÀ RÉAGI AVEC CET EMOJI
        const existingReaction = await Reaction.findOne({
          Id_message: messageId,
          id_user: userId,
          emoji: emoji,
        });

        if (existingReaction) {
          socket.emit("error", {
            message: "Vous avez déjà réagi avec cet emoji",
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

        // Diffuser à tous les utilisateurs dans la conversation
        io.to(message.conversationId.toString()).emit("reaction_added", {
          type: "reaction_added",
          data: reaction,
          messageId: messageId,
        });

        // Confirmer à l'émetteur
        socket.emit("reaction_added_success", reaction);
      } catch (error) {
        console.error("Erreur réaction:", error);
        if (error.code === 11000) {
          socket.emit("error", {
            message: "Vous avez déjà réagi à ce message",
          });
        } else {
          socket.emit("error", { message: error.message });
        }
      }
    });

    socket.on("remove_reaction", async (data) => {
      try {
        const { messageId, emoji } = data; // ⭐ MODIFIÉ : Ajout de emoji
        const userId = socket.userId;

        console.log(
          `🗑️ Suppression réaction sur le message ${messageId} par user ${userId}`
        );

        const reaction = await Reaction.findOneAndDelete({
          Id_message: messageId,
          id_user: userId,
          emoji: emoji, // ⭐ MODIFIÉ : Supprimer une réaction spécifique
        });

        if (!reaction) {
          socket.emit("error", { message: "Réaction non trouvée" });
          return;
        }

        // Récupérer l'ID de la conversation pour diffuser
        const message = await Message.findById(messageId);

        // Diffuser la suppression
        io.to(message.conversationId.toString()).emit("reaction_removed", {
          type: "reaction_removed",
          messageId: messageId,
          userId: userId.toString(),
          emoji: reaction.emoji,
        });

        socket.emit("reaction_removed_success", {
          messageId,
          userId: userId.toString(),
          emoji: reaction.emoji, // ⭐ MODIFIÉ : Retourner l'emoji supprimé
        });
      } catch (error) {
        console.error("Erreur suppression réaction:", error);
        socket.emit("error", { message: error.message });
      }
    });
    //fin reaction debut de marques les message comme lu
    // 👀 ⭐ NOUVEAU : MARQUER LES MESSAGES COMME LUS
    socket.on("mark_messages_as_read", async (data) => {
      try {
        const { conversationId, messageIds } = data;
        const userId = socket.userId;

        console.log(
          `👀 User ${userId} marque les messages comme lus dans ${conversationId}`
        );

        // ⭐ METTRE À JOUR LE STATUT DES MESSAGES
        await Message.updateMany(
          {
            _id: { $in: messageIds },
            conversationId: conversationId,
            sender: { $ne: userId }, // ⭐ Ne pas marquer ses propres messages comme lus
          },
          {
            $addToSet: { readBy: userId }, // ⭐ Ajouter l'utilisateur à la liste readBy
            status: "read",
          }
        );

        // 📢 Notifier les autres participants
        socket.to(conversationId).emit("messages_read", {
          conversationId,
          messageIds,
          readBy: userId,
        });

        // ✅ Confirmation
        socket.emit("messages_read_success", {
          conversationId,
          messageIds,
        });
      } catch (error) {
        console.error("Erreur marquage messages lus:", error);
        socket.emit("error", { message: error.message });
      }
    });

    // 🔥 STATUTS EN LIGNE DES UTILISATEURS
    socket.on("get_online_status", (data) => {
      const { userIds } = data;
      const onlineStatus = {};

      userIds.forEach((userId) => {
        onlineStatus[userId] = onlineUsers.has(userId); // Vérifier si l'user est dans la Map
      });

      socket.emit("online_status_response", onlineStatus);
    });

    // 📍 DÉCONNEXION DE L'UTILISATEUR
    socket.on("disconnect", () => {
      console.log(
        "🔌 Utilisateur déconnecté:",
        socket.id,
        "User ID:",
        socket.userId
      );

      // Marquer comme hors ligne
      if (socket.userId) {
        onlineUsers.delete(socket.userId);

        // Notifier tous les amis/conversations
        socket.broadcast.emit("user_offline", { userId: socket.userId });

        console.log(`🔴 User ${socket.userId} est maintenant hors ligne`);
      }

      // 🧹 NETTOYAGE : Retirer des indicateurs de typing
      typingUsers.forEach((users, conversationId) => {
        users.delete(socket.userId);
      });
    });
  });
};
