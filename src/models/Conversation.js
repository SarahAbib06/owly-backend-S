// models/Conversation.js
import mongoose from "mongoose";

const { Schema, model } = mongoose;

const conversationSchema = new Schema(
  {
    // Liste des participants
    Id_participant: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],

    // 🔥 ALIAS pour compatibilité (certaines routes utilisent "participants")
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // Compteurs de messages non lus par utilisateur
    unreadCounts: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        count: {
          type: Number,
          default: 0,
          min: 0,
        },
        _id: false,
      },
    ],

    deletedBy: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      deletedAt: { type: Date, default: Date.now },
    },
  ],
    // 🆕 NOUVEAU : Archivage par utilisateur
    archivedBy: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        archivedAt: {
          type: Date,
          default: Date.now,
        },
        _id: false,
      },
    ],
    
    // ============================================
    // 🎨 THÈME DE LA CONVERSATION
    // ============================================
    theme: {
      type: {
        type: String,
        enum: ["color", "gradient", "image", "seasonal", "upload"],
        default: null,
      },
      value: {
        type: String,
        default: null,
      },
      emojis: {
        type: [String],
        default: [],
      },
      appliedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      appliedAt: {
        type: Date,
        default: null,
      },
      name: {
        type: String,
        default: null,
      },
      _id: false, // Pas besoin d'_id pour ce sous-document
    },
    // ============================================

    // Dernier message (pour trier les conversations)
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },

    // Nom du groupe (obligatoire si type === 'group')
    groupName: {
      type: String,
      required: function () {
        return this.type === "group";
      },
      default: null,
    },

    // Photo de groupe
    groupPic: {
      type: String,
      default: null,
    },

    // Créateur de la conversation
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Type de conversation
    type: {
      type: String,
      enum: ["private", "group"],
      required: true,
      default: "private",
    },

    // ============================================
    // 🔥 FLAGS POUR LES DEMANDES DE MESSAGE
    // ============================================
    isMessageRequest: {
      type: Boolean,
      default: false,
      index: true, // Index pour recherche rapide
    },

    messageRequestFrom: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    messageRequestFor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // ============================================
  },
  {
    timestamps: true, // createdAt + updatedAt automatiques
  }
);

// ============================================
// 🔥 MIDDLEWARE PRE-SAVE
// Synchronise "participants" avec "Id_participant"
// ============================================
conversationSchema.pre('save', function(next) {
  // Si participants est vide mais Id_participant existe, copier
  if ((!this.participants || this.participants.length === 0) && this.Id_participant && this.Id_participant.length > 0) {
    this.participants = [...this.Id_participant];
  }
  
  // Si Id_participant est vide mais participants existe, copier
  if ((!this.Id_participant || this.Id_participant.length === 0) && this.participants && this.participants.length > 0) {
    this.Id_participant = [...this.participants];
  }
  
  next();
});

// ============================================
// INDEX POUR PERFORMANCES
// ============================================
conversationSchema.index({ lastMessageAt: -1 }); // Tri des conversations récentes
conversationSchema.index({ Id_participant: 1 }); // Recherche rapide par participant
conversationSchema.index({ participants: 1 }); // Recherche rapide (alias)
conversationSchema.index({ "unreadCounts.userId": 1 }); // Unread par user
conversationSchema.index({ "archivedBy.userId": 1 }); // Archivage par user
conversationSchema.index({ type: 1 }); // Filtre par type
conversationSchema.index({ createdBy: 1 }); // Recherche par créateur

// 🔥 INDEX CRITIQUES POUR MESSAGE REQUEST
conversationSchema.index({ isMessageRequest: 1 }); // Recherche des demandes
conversationSchema.index({ messageRequestFor: 1 }); // Demandes pour un user
conversationSchema.index({ messageRequestFrom: 1 }); // Demandes d'un user

// Index composé pour performances optimales
conversationSchema.index({ 
  Id_participant: 1, 
  lastMessageAt: -1 
});

conversationSchema.index({ 
  messageRequestFor: 1, 
  isMessageRequest: 1 
});

// Modèle
const Conversation = model("Conversation", conversationSchema);

export default Conversation;