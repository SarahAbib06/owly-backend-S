import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
  Id_sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // 🆕 AJOUT POUR LES NOTIFICATIONS - REMPLACE ton ancien "readBy"
  readBy: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    readAt: { type: Date, default: Date.now }
  }],
  
  // 🆕 NOUVEAU CHAMP - Liste des users qui n'ont pas encore lu
  unreadFor: [{ 
    type: mongoose.Schema.Types.ObjectId, ref: 'User' 
  }],
  
  content: {
    type: String,
    default: null
  },
  typeMessage: {
    type: String,
    enum: ['text', 'image', 'video', 'audio', 'file', 'emojis'],
    default: 'text'
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'seen'],
    default: 'sent'
  },
  time: {
    type: Date,
    default: Date.now
  }
});

// 🆕 INDEXES POUR PERFORMANCE
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ Id_sender: 1 });
messageSchema.index({ createdAt: -1 });
messageSchema.index({ "readBy.userId": 1 });

export default mongoose.model("Message", messageSchema);