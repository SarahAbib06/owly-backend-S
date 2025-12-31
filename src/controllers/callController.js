
import Call from "../models/Call.js";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";

export const callController = {
  // Créer un nouvel appel en base de données
  async initiateCall(callerId, receiverId, conversationId, callType) {
    try {
      console.log(`📞 Création appel en base: ${callerId} → ${receiverId} (${callType})`);

      const call = new Call({
        conversationId,
        callerId,
        receiverId,
        callType,
        startTime: new Date(),
        status: 'ongoing'
      });

      const savedCall = await call.save();
      console.log(`✅ Appel créé en base avec ID: ${savedCall._id}`);

      return savedCall;
    } catch (error) {
      console.error("❌ Erreur création appel:", error);
      throw error;
    }
  },

  // Accepter un appel (mettre à jour le statut)
  async acceptCall(callId) {
    try {
      console.log(`📞 Acceptation appel: ${callId}`);

      const updatedCall = await Call.findByIdAndUpdate(
        callId,
        {
          status: 'active',
          startTime: new Date() // ⏰ Définir le vrai début de l'appel
        },
        { new: true }
      )

      if (!updatedCall) {
        throw new Error("Appel non trouvé");
      }

      console.log(`✅ Appel ${callId} accepté - StartTime: ${updatedCall.startTime}`);
      return updatedCall;
    } catch (error) {
      console.error("❌ Erreur acceptation appel:", error);
      throw error;
    }
  },

  // Rejeter un appel (mettre à jour le statut)
  async rejectCall(callId) {
    try {
      console.log(`❌ Rejet appel: ${callId}`);

      const updatedCall = await Call.findByIdAndUpdate(
        callId,
        { status: 'rejected', endTime: new Date() },
        { new: true }
      ).populate('callerId', 'username avatar')
       .populate('receiverId', 'username avatar');

      if (!updatedCall) {
        throw new Error("Appel non trouvé");
      }

      console.log(`✅ Appel ${callId} rejeté`);
      return updatedCall;
    } catch (error) {
      console.error("❌ Erreur rejet appel:", error);
      throw error;
    }
  },

  // Finaliser un appel avec durée
  async endCall(callId) {
    try {
      console.log(`📞 Fin appel: ${callId}`);

      const call = await Call.findById(callId);
      if (!call) {
        throw new Error("Appel non trouvé");
      }

      const endTime = new Date();
      const duration = endTime - call.startTime;

      const updatedCall = await Call.findByIdAndUpdate(
        callId,
        {
          endTime,
          duration,
          status: 'completed'
        },
        { new: true }
      );

      console.log(`✅ Appel ${callId} finalisé - Durée: ${duration}ms`);
      return updatedCall;
    } catch (error) {
      console.error("❌ Erreur fin appel:", error);
      throw error;
    }
  },

  // Récupérer l'historique des appels d'un utilisateur
  async getCallHistory(userId, limit = 50) {
    try {
      console.log(`📞 Récupération historique appels pour: ${userId}`);

      const calls = await Call.find({
        $or: [
          { callerId: userId },
          { receiverId: userId }
        ]
      })
      .populate('callerId', 'username avatar')
      .populate('receiverId', 'username avatar')
      .populate('conversationId', 'name type')
      .sort({ startTime: -1 })
      .limit(limit);

      console.log(`✅ ${calls.length} appels récupérés pour ${userId}`);
      return calls;
    } catch (error) {
      console.error("❌ Erreur récupération historique:", error);
      throw error;
    }
  },

  // Récupérer un appel par ID
  async getCallById(callId) {
    try {
      const call = await Call.findById(callId)
        .populate('callerId', 'username avatar')
        .populate('receiverId', 'username avatar')
        .populate('conversationId', 'name type');

      return call;
    } catch (error) {
      console.error("❌ Erreur récupération appel:", error);
      throw error;
    }
  }
};
