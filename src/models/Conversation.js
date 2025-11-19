import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  Id_participant: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Participants',
    required: true
  }],
  
  // 🆕 AJOUT POUR LES NOTIFICATIONS - Compteur par utilisateur
  unreadCounts: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    count: { type: Number, default: 0 }
  }],
  
  // 🆕 AJOUT - Dernier message pour trier les conversations
  lastMessageAt: { type: Date, default: Date.now },
  
  Id_message: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Message', 
    required: false 
  },
  LastMessageRead: { 
    type: String, 
    default: null 
  },
  groupName: { type: String },
  groupPic: { type: String },
  media: {
    type: String,
    enum: ['text', 'image', 'video', 'audio', 'file'],
    default: null
  },
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  type: { 
    type: String, 
    enum: ["private", "group"], 
    required: true 
  },
  
});

export default mongoose.model("Conversation", conversationSchema);