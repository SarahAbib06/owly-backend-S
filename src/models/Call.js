import mongoose from 'mongoose';

const callSchema = new mongoose.Schema({
  conversationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Conversation', 
    required: true 
  },
  callerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  receiverId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  callType: { 
    type: String, 
    enum: ["audio", "video"], 
    required: true 
  },
  startTime: { 
    type: Date, 
    default: Date.now 
  },
  endTime: { 
    type: Date, 
    default: null 
  },
  duration: { 
    type: Number, 
    default: 0 
  },
  status: { 
    type: String, 
    enum: ['ringing', 'missed', 'rejected', 'ongoing', 'completed'], 
    default: 'ringing' 
  },
  // Nouveau champ pour tracer l'historique
  statusHistory: [{
    status: String,
    timestamp: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

export default mongoose.model("Call", callSchema);