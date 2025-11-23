import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  // ✅ GARDÉ - Liste des participants (référence à ta table Participants)
  Id_participant: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Participants',
    required: true
  }],
  
  // ✅ GARDÉ - Compteurs non-lus par utilisateur
  unreadCounts: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    count: { type: Number, default: 0 }
  }],
  
  // ✅ GARDÉ - Dernier message pour trier les conversations
  lastMessageAt: { 
    type: Date, 
    default: Date.now 
  },
  
  // ✅ GARDÉ - Nom du groupe (seulement pour type: "group")
  groupName: { 
    type: String,
    required: function() {
      return this.type === 'group';
    }
  },
  
  // ✅ GARDÉ - Photo de groupe
  groupPic: { 
    type: String 
  },
  
  // ✅ GARDÉ - Créateur de la conversation
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  
  // ✅ GARDÉ - Date de création
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  
  // ✅ GARDÉ - Type de conversation
  type: { 
    type: String, 
    enum: ["private", "group"], 
    required: true 
  }
}, {
  // 🆕 AJOUT - Timestamps automatiques
  timestamps: true
});

// 🆕 INDEXES POUR PERFORMANCE
conversationSchema.index({ "unreadCounts.userId": 1 });
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ type: 1 });
conversationSchema.index({ createdBy: 1 });

export default mongoose.model("Conversation", conversationSchema);