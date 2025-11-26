import mongoose from "mongoose";

const { Schema, model } = mongoose;

const messageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true, // on peut mettre l'index directement ici aussi
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
        _id: false, // pas besoin d'_id sur chaque entrée du tableau
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
  },
  {
    timestamps: true, // createdAt & updatedAt automatiques
  }
);

// Indexes pour les performances (les plus utiles pour un chat)
messageSchema.index({ conversationId: 1, createdAt: -1 }); // pagination + tri chronologique
messageSchema.index({ Id_sender: 1 });
messageSchema.index({ "readBy.userId": 1 });
messageSchema.index({ createdAt: -1 });

const Message = model("Message", messageSchema);

export default Message;
