import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  conversationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Conversation", 
    required: true 
  },
  Id_sender: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  // 🆕 SYSTÈME SIMPLIFIÉ : un seul champ pour gestion lectures
  readBy: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    readAt: { type: Date, default: Date.now }
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
  }
}, {
  timestamps: true // 🆕 AJOUT - createdAt, updatedAt automatiques
});

// 🆕 INDEXES PERFORMANCE
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ Id_sender: 1 });
messageSchema.index({ "readBy.userId": 1 });
messageSchema.index({ createdAt: -1 });

export default mongoose.model("Message", messageSchema);