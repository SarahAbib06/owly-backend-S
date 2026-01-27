// src/models/Message.js
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

    // Système de gestion des lectures
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
      enum: ["text", "image", "video", "audio", "file", "emojis", "call"],
      default: "text",
    },

    status: {
      type: String,
      enum: ["sending","sent", "delivered", "seen", "pending"],
      default: "sending",
    },
 seenBy: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
        seenAt: {
          type: Date,
          default: Date.now,
        },
        _id: false,
      },
    ],
    isPinned: { type: Boolean, default: false },
    pinnedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    pinnedAt: { type: Date },

    // AJOUT : Réactions aux messages
    reactions: [
      {
        type: Schema.Types.ObjectId,
        ref: "Reaction",
      },
    ],

    // NOUVEAUX CHAMPS POUR LE TRANSFERT (FORWARD) DE MESSAGE
    isForwarded: {
      type: Boolean,
      default: false,
      index: true,
    },
    forwardedFrom: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
      index: true,
    },
    originalSender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    forwardedAt: {
      type: Date,
      default: Date.now,
    },
    forwardCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Champs pour les médias
    imageInfo: {
      url: String,
      publicId: String,
      width: Number,
      height: Number
    },
    videoInfo: {
      url: String,
      publicId: String,
      duration: Number,
      width: Number,
      height: Number
    },
    fileInfo: {
      url: String,
      publicId: String,
      originalFilename: String,
      bytes: Number
    },
    
    // NOUVEAUX CHAMPS POUR LES APPELS
    callType: {
      type: String,
      enum: ["audio", "video"],
      default: null
    },
    callResult: {
      type: String,
      enum: ["missed", "rejected", "ended", "accepted"],
      default: null
    },
    duration: {
      type: Number, // en secondes
      default: 0,
      min: 0
    },
    callParticipants: [
      {
        type: Schema.Types.ObjectId,
        ref: "User"
      }
    ],
    callStartedAt: {
      type: Date,
      default: null
    },
    callEndedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
  }
);

// INDEXES POUR LES PERFORMANCES
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ Id_sender: 1 });
messageSchema.index({ "readBy.userId": 1 });
messageSchema.index({ createdAt: -1 });
messageSchema.index({ reactions: 1 });
messageSchema.index({ isForwarded: 1 });
messageSchema.index({ forwardedFrom: 1 });
messageSchema.index({ originalSender: 1 });
messageSchema.index({ conversationId: 1, isForwarded: 1, createdAt: -1 });

// Nouveaux index pour les appels
messageSchema.index({ conversationId: 1, typeMessage: 1, createdAt: -1 }); // Pour filtrer les appels dans une conversation
messageSchema.index({ callType: 1 });
messageSchema.index({ callResult: 1 });
messageSchema.index({ callStartedAt: -1 }); // Pour trier les appels par date
messageSchema.index({ typeMessage: 1, createdAt: -1 }); // Index général pour le type de message

// Méthode utilitaire pour vérifier si c'est un message d'appel
messageSchema.methods.isCall = function() {
  return this.typeMessage === "call";
};

// Méthode utilitaire pour calculer la durée de l'appel
messageSchema.methods.getCallDuration = function() {
  if (!this.isCall() || !this.callStartedAt || !this.callEndedAt) {
    return this.duration || 0;
  }
  
  const durationMs = this.callEndedAt - this.callStartedAt;
  return Math.floor(durationMs / 1000);
};

const Message = model("Message", messageSchema);

export default Message;