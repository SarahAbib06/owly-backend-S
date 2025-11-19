// models/Relation.js  (crée ce fichier s'il n'existe pas encore)
import mongoose from 'mongoose';

const relationSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  contactId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  status: { 
    type: String, 
    enum: ["accepted", "pending", "blocked"], 
    default: "pending" 
  },
  addedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Évite les doublons : un utilisateur ne peut pas avoir deux relations avec le même contact
relationSchema.index({ userId: 1, contactId: 1 }, { unique: true });

export default mongoose.model("Relation", relationSchema);