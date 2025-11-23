import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Conversation",
    required: true,
  },
  Id_sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  // 🆕 AJOUT POUR LES NOTIFICATIONS - REMPLACE ton ancien "readBy"
  readBy: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      readAt: { type: Date, default: Date.now },
    },
  ],

  // 🆕 NOUVEAU CHAMP - Liste des users qui n'ont pas encore lu
  unreadFor: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
  time: {
    type: Date,
    default: Date.now,
  },
  // 🔊 CHAMPS SPÉCIFIQUES AUDIO "message vocal"
  audioUrl: {
    type: String, // Chemin du fichier: "/uploads/audio/filename.webm"
    default: null,
  },
  audioDuration: {
    type: Number, // Durée en secondes: 45 (pour 45 secondes)
    default: 0,
  },
  fileSize: {
    type: Number, // Taille en bytes: 1024000 (pour 1MB)
    default: 0,
  },
  fileName: {
    type: String, // Nom original: "voice_message_123456789.webm"
    default: null,
  },
  // 🆕 NOUVEAUX CHAMPS CLOUDINARY
  cloudinaryPublicId: {
    type: String, // ID public Cloudinary: "owly/audio_messages/xyz123"
    default: null,
  },
  cloudinaryFormat: {
    type: String, // Format: "mp3", "webm", etc.
    default: null,
  },
});
//les fichier audio et image

// 🆕 INDEXES POUR PERFORMANCE
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ Id_sender: 1 });
messageSchema.index({ createdAt: -1 });
messageSchema.index({ "readBy.userId": 1 });

export default mongoose.model("Message", messageSchema);
