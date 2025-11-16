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
  //id_receiver: {type: mongoose.Schema.Types.ObjectId,ref: 'Participant',required: false},
  readBy: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Participant",
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
});
//les fichier audio et image

export default mongoose.model("Message", messageSchema);
