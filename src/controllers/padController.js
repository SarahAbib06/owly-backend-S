import Pad from "../models/Pad.js";
import Participants from "../models/Participants.js";

export const padController = {
  // 🎯 GET ou CREATE Pad
  getOrCreatePad: async (conversationId, userId) => {
    try {
      const participant = await Participants.findOne({
        Id_Conversation: conversationId,
        Id_User: userId
      });

      if (!participant) {
        throw new Error("Accès non autorisé à cette conversation");
      }

      let pad = await Pad.findOne({ conversationId })
        .populate("lastUpdatedBy", "username profilePicture");

      if (!pad) {
        pad = new Pad({
          conversationId,
          content: "",
          lastUpdatedBy: userId
        });
        await pad.save();
      }

      return pad;
    } catch (error) {
      console.error("❌ Erreur getOrCreatePad:", error);
      throw error;
    }
  },

  // 🎯 UPDATE Pad content
  updatePadContent: async (conversationId, userId, content) => {
    try {
      const participant = await Participants.findOne({
        Id_Conversation: conversationId,
        Id_User: userId
      });

      if (!participant) {
        throw new Error("Accès non autorisé à cette conversation");
      }

      // FORÇAGE : content toujours string
      const safeContent = (content === undefined || content === null) ? "" : String(content);

      const pad = await Pad.findOneAndUpdate(
        { conversationId },
        {
          content: safeContent,
          lastUpdatedBy: userId,
          updatedAt: new Date()
        },
        { new: true, upsert: true, runValidators: true }
      ).populate("lastUpdatedBy", "username profilePicture");

      return pad;
    } catch (error) {
      console.error("❌ Erreur updatePadContent:", error);
      throw error;
    }
  }
};