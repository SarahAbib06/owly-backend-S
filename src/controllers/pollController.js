// controllers/pollController.js
import Poll from "../models/Poll.js";
import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";
import Participants from "../models/Participants.js";
import mongoose from "mongoose";

export const pollController = {
  // 🎯 CRÉER UN SONDAGE
  createPoll: async (req, res) => {
    try {
      const {
        conversationId,
        question,
        options,
        isMultiChoice = false,
        isAnonymous = false,
        expiresAt,
      } = req.body;
      const userId = req.user._id;

      // Validation de base
      if (!conversationId || !question || !options) {
        return res.status(400).json({
          success: false,
          error: "conversationId, question et options sont requis",
        });
      }

      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        return res.status(400).json({
          success: false,
          error: "ID conversation invalide",
        });
      }

      // Validation des options
      if (!Array.isArray(options) || options.length < 2 || options.length > 6) {
        return res.status(400).json({
          success: false,
          error: "Le sondage doit avoir entre 2 et 6 options",
        });
      }

      // Vérifier que les options ne sont pas vides
      const validOptions = options.filter(
        (opt) => opt && opt.trim().length > 0
      );
      if (validOptions.length < 2) {
        return res.status(400).json({
          success: false,
          error: "Les options ne peuvent pas être vides",
        });
      }

      // Vérifier que la conversation existe et est un groupe
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: "Conversation non trouvée",
        });
      }

      if (conversation.type !== "group") {
        return res.status(400).json({
          success: false,
          error: "Les sondages sont uniquement disponibles dans les groupes",
        });
      }

      // Vérifier que l'utilisateur est membre du groupe
      const isMember = await Participants.findOne({
        Id_Conversation: conversationId,
        Id_User: userId,
      });

      if (!isMember) {
        return res.status(403).json({
          success: false,
          error: "Vous n'êtes pas membre de ce groupe",
        });
      }

      // Préparer les options
      const pollOptions = validOptions.map((optionText) => ({
        text: optionText.trim(),
        voters: [],
        voteCount: 0,
      }));

      // Créer le sondage
      const pollData = {
        conversationId,
        createdBy: userId,
        question: question.trim(),
        options: pollOptions,
        isMultiChoice,
        isAnonymous,
      };

      if (expiresAt) {
        pollData.expiresAt = new Date(expiresAt);
      }

      const poll = new Poll(pollData);
      await poll.save();

      // Créer le message de type sondage
      const message = new Message({
        conversationId,
        Id_sender: userId,
        typeMessage: "poll",
        pollRef: poll._id,
        content: `📊 Sondage: ${question}`,
        status: "sent",
      });

      await message.save();

      // Populate amélioré pour inclure les votants
      await message.populate({
        path: "pollRef",
        populate: [
          {
            path: "createdBy",
            select: "username profilePicture",
          },
          {
            path: "options.voters",
            select: "username profilePicture",
          },
          {
            path: "voters",
            select: "username profilePicture",
          },
        ],
      });

      // Émettre l'événement socket
      if (req.io) {
        const populatedMessage = await Message.findById(message._id)
          .populate("Id_sender", "username profilePicture")
          .populate({
            path: "pollRef",
            populate: [
              {
                path: "createdBy",
                select: "username profilePicture",
              },
              {
                path: "options.voters",
                select: "username profilePicture",
              },
              {
                path: "voters",
                select: "username profilePicture",
              },
            ],
          });

        req.io.to(conversationId.toString()).emit("new_message", {
          _id: populatedMessage._id,
          conversationId: populatedMessage.conversationId,
          Id_sender: populatedMessage.Id_sender,
          content: populatedMessage.content,
          typeMessage: populatedMessage.typeMessage,
          pollRef: populatedMessage.pollRef,
          status: populatedMessage.status,
          timestamp: populatedMessage.createdAt,
          isGroup: true,
        });
      }

      res.json({
        success: true,
        message: "Sondage créé avec succès",
        poll: poll,
        messageData: message,
      });
    } catch (error) {
      console.error("❌ Erreur création sondage:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },

  // 🎯 VOTER À UN SONDAGE - CORRIGÉ
  votePoll: async (req, res) => {
    try {
      const { pollId } = req.params;
      const { optionIndexes } = req.body;
      const userId = req.user._id;

      console.log("🗳️ Requête de vote reçue:", {
        pollId,
        optionIndexes,
        userId,
      });

      if (!mongoose.Types.ObjectId.isValid(pollId)) {
        return res.status(400).json({
          success: false,
          error: "ID sondage invalide",
        });
      }

      if (optionIndexes === undefined || optionIndexes === null) {
        return res.status(400).json({
          success: false,
          error: "optionIndexes est requis",
        });
      }

      const poll = await Poll.findById(pollId);
      if (!poll) {
        console.error("❌ Sondage non trouvé:", pollId);
        return res.status(404).json({
          success: false,
          error: "Sondage non trouvé",
        });
      }

      // Vérifier que l'utilisateur est membre de la conversation
      const isMember = await Participants.findOne({
        Id_Conversation: poll.conversationId,
        Id_User: userId,
      });

      if (!isMember) {
        return res.status(403).json({
          success: false,
          error: "Vous n'êtes pas membre de ce groupe",
        });
      }

      // ✅ CORRECTION: Valider que les options existent avant de voter
      const indicesOptions = Array.isArray(optionIndexes)
        ? optionIndexes
        : [optionIndexes];

      // Vérifier que tous les index sont valides
      console.log("🔍 Validation des options:", {
        nombreOptionsPoll: poll.options.length,
        indicesReçus: indicesOptions,
      });

      for (const index of indicesOptions) {
        if (
          typeof index !== "number" ||
          index < 0 ||
          index >= poll.options.length
        ) {
          return res.status(400).json({
            success: false,
            error: `Index d'option invalide: ${index}. Le sondage a ${poll.options.length} options.`,
          });
        }

        // Vérifier que l'option existe
        if (!poll.options[index]) {
          return res.status(400).json({
            success: false,
            error: `L'option à l'index ${index} n'existe pas.`,
          });
        }
      }

      // ✅ CORRECTION: Gestion d'erreur améliorée pour addVote
      try {
        console.log("🔄 Appel de addVote avec:", {
          userId,
          optionIndexes: indicesOptions,
        });
        poll.addVote(userId, optionIndexes);
      } catch (voteError) {
        console.error("❌ Erreur dans addVote:", voteError.message);
        return res.status(400).json({
          success: false,
          error: voteError.message,
        });
      }

      await poll.save();

      // Récupérer le sondage mis à jour avec populate amélioré
      const updatedPoll = await Poll.findById(pollId)
        .populate("createdBy", "username profilePicture")
        .populate({
          path: "options.voters",
          select: "username profilePicture",
        })
        .populate({
          path: "voters",
          select: "username profilePicture",
        });

      console.log("✅ Vote enregistré avec succès pour le sondage:", pollId);

      // Émettre la mise à jour en temps réel
      if (req.io) {
        req.io.to(poll.conversationId.toString()).emit("poll_updated", {
          pollId: poll._id,
          poll: updatedPoll,
          votedBy: userId,
        });
      }

      res.json({
        success: true,
        message: "Vote enregistré avec succès",
        poll: updatedPoll,
      });
    } catch (error) {
      console.error("❌ Erreur vote sondage:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Erreur lors du vote",
      });
    }
  },

  // 🎯 RÉCUPÉRER LES SONDAGES D'UNE CONVERSATION
  getConversationPolls: async (req, res) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user._id;

      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        return res.status(400).json({
          success: false,
          error: "ID conversation invalide",
        });
      }

      // Vérifier l'accès
      const isMember = await Participants.findOne({
        Id_Conversation: conversationId,
        Id_User: userId,
      });

      if (!isMember) {
        return res.status(403).json({
          success: false,
          error: "Accès non autorisé",
        });
      }

      const polls = await Poll.find({ conversationId })
        .populate("createdBy", "username profilePicture")
        .populate({
          path: "options.voters",
          select: "username profilePicture",
        })
        .populate({
          path: "voters",
          select: "username profilePicture",
        })
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        polls: polls,
      });
    } catch (error) {
      console.error("❌ Erreur récupération sondages:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },

  // 🎯 RÉCUPÉRER UN SONDAGE SPÉCIFIQUE
  getPoll: async (req, res) => {
    try {
      const { pollId } = req.params;
      const userId = req.user._id;

      if (!mongoose.Types.ObjectId.isValid(pollId)) {
        return res.status(400).json({
          success: false,
          error: "ID sondage invalide",
        });
      }

      const poll = await Poll.findById(pollId)
        .populate("createdBy", "username profilePicture")
        .populate({
          path: "options.voters",
          select: "username profilePicture",
        })
        .populate({
          path: "voters",
          select: "username profilePicture",
        });

      if (!poll) {
        return res.status(404).json({
          success: false,
          error: "Sondage non trouvé",
        });
      }

      // Vérifier l'accès
      const isMember = await Participants.findOne({
        Id_Conversation: poll.conversationId,
        Id_User: userId,
      });

      if (!isMember) {
        return res.status(403).json({
          success: false,
          error: "Accès non autorisé",
        });
      }

      res.json({
        success: true,
        poll: poll,
      });
    } catch (error) {
      console.error("❌ Erreur récupération sondage:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },

  // 🎯 RÉCUPÉRER LES RÉSULTATS DÉTAILLÉS D'UN SONDAGE
  getPollResults: async (req, res) => {
    try {
      const { pollId } = req.params;
      const userId = req.user._id;

      if (!mongoose.Types.ObjectId.isValid(pollId)) {
        return res.status(400).json({
          success: false,
          error: "ID sondage invalide",
        });
      }

      const poll = await Poll.findById(pollId)
        .populate("createdBy", "username profilePicture")
        .populate({
          path: "options.voters",
          select: "username profilePicture",
        })
        .populate({
          path: "voters",
          select: "username profilePicture",
        });

      if (!poll) {
        return res.status(404).json({
          success: false,
          error: "Sondage non trouvé",
        });
      }

      // Vérifier l'accès
      const isMember = await Participants.findOne({
        Id_Conversation: poll.conversationId,
        Id_User: userId,
      });

      if (!isMember) {
        return res.status(403).json({
          success: false,
          error: "Accès non autorisé",
        });
      }

      // Calculer le taux de participation
      const totalMembers = await Participants.countDocuments({
        Id_Conversation: poll.conversationId,
      });

      const participationRate =
        totalMembers > 0
          ? Math.round((poll.totalVotes / totalMembers) * 100)
          : 0;

      res.json({
        success: true,
        poll: poll,
        totalVotes: poll.totalVotes,
        totalMembers: totalMembers,
        participationRate: participationRate,
        isExpired: poll.expiresAt && new Date() > poll.expiresAt,
        isClosed: poll.isClosed,
      });
    } catch (error) {
      console.error("❌ Erreur récupération résultats:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },

  // 🎯 FERMER UN SONDAGE
  closePoll: async (req, res) => {
    try {
      const { pollId } = req.params;
      const userId = req.user._id;

      const poll = await Poll.findById(pollId)
        .populate("createdBy", "username profilePicture")
        .populate({
          path: "options.voters",
          select: "username profilePicture",
        })
        .populate({
          path: "voters",
          select: "username profilePicture",
        });

      if (!poll) {
        return res.status(404).json({
          success: false,
          error: "Sondage non trouvé",
        });
      }

      // Vérifier que l'utilisateur est le créateur ou un admin
      if (poll.createdBy.toString() !== userId.toString()) {
        const userRole = await Participants.findOne({
          Id_Conversation: poll.conversationId,
          Id_User: userId,
        });

        if (!userRole || userRole.Role !== "admin") {
          return res.status(403).json({
            success: false,
            error: "Seul le créateur ou un admin peut fermer le sondage",
          });
        }
      }

      poll.isClosed = true;
      await poll.save();

      // Récupérer le sondage mis à jour
      const updatedPoll = await Poll.findById(pollId)
        .populate("createdBy", "username profilePicture")
        .populate({
          path: "options.voters",
          select: "username profilePicture",
        })
        .populate({
          path: "voters",
          select: "username profilePicture",
        });

      // Émettre l'événement de fermeture avec les données mises à jour
      if (req.io) {
        req.io.to(poll.conversationId.toString()).emit("poll_closed", {
          pollId: poll._id,
          poll: updatedPoll,
          closedBy: userId,
        });
      }

      res.json({
        success: true,
        message: "Sondage fermé avec succès",
        poll: updatedPoll,
      });
    } catch (error) {
      console.error("❌ Erreur fermeture sondage:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },

  // 🎯 SUPPRIMER UN SONDAGE
  deletePoll: async (req, res) => {
    try {
      const { pollId } = req.params;
      const userId = req.user._id;

      const poll = await Poll.findById(pollId);
      if (!poll) {
        return res.status(404).json({
          success: false,
          error: "Sondage non trouvé",
        });
      }

      // Vérifier les permissions
      if (poll.createdBy.toString() !== userId.toString()) {
        const userRole = await Participants.findOne({
          Id_Conversation: poll.conversationId,
          Id_User: userId,
        });

        if (!userRole || userRole.Role !== "admin") {
          return res.status(403).json({
            success: false,
            error: "Seul le créateur ou un admin peut supprimer le sondage",
          });
        }
      }

      // Supprimer aussi le message associé
      await Message.deleteMany({ pollRef: pollId });
      await Poll.findByIdAndDelete(pollId);

      // Émettre l'événement de suppression
      if (req.io) {
        req.io.to(poll.conversationId.toString()).emit("poll_deleted", {
          pollId: poll._id,
          deletedBy: userId,
        });
      }

      res.json({
        success: true,
        message: "Sondage supprimé avec succès",
      });
    } catch (error) {
      console.error("❌ Erreur suppression sondage:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },

  // 🎯 VÉRIFIER ET FERMER LES SONDAGES EXPIRÉS
  checkExpiredPolls: async () => {
    try {
      const expiredPolls = await Poll.find({
        expiresAt: { $lte: new Date() },
        isClosed: false,
      });

      for (const poll of expiredPolls) {
        poll.isClosed = true;
        await poll.save();
        console.log(`🔚 Sondage expiré fermé: ${poll._id}`);
      }

      return expiredPolls.length;
    } catch (error) {
      console.error("❌ Erreur vérification sondages expirés:", error);
      return 0;
    }
  },
};
