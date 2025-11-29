import mongoose from "mongoose";

const { Schema, model } = mongoose;

const messageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    Id_sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Système simplifié de gestion des lectures
    readBy: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
        _id: false,
      },
    ],

    content: {
      type: String,
      default: null,
    },

    typeMessage: {
      type: String,
      enum: ["text", "image", "video", "audio", "file", "emojis"],
      default: "text",
    },

    status: {
      type: String,
      enum: ["sent", "delivered", "seen"],
      default: "sent",
    },

    isPinned: { type: Boolean, default: false },
    pinnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    pinnedAt: { type: Date },

    // 🆕 AJOUT : CHAMP RÉACTIONS
    reactions: [{
      type: Schema.Types.ObjectId,
      ref: "Reaction"
    }]
  },
  {
    timestamps: true,
  }
);

// Indexes pour les performances
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ Id_sender: 1 });
messageSchema.index({ "readBy.userId": 1 });
messageSchema.index({ createdAt: -1 });
// 🆕 AJOUT : Index pour les réactions
messageSchema.index({ "reactions": 1 });

const Message = model("Message", messageSchema);

export default Message;