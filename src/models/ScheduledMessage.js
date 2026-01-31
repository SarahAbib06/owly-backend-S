// models/ScheduledMessage.js
import mongoose from 'mongoose';

const scheduledMessageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  content: {
    type: String,
    required: true
  },
  typeMessage: {
    type: String,
    enum: ['text', 'image', 'video', 'file'],
    default: 'text'
  },
  scheduledFor: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'cancelled', 'failed'],
    default: 'pending',
    index: true
  },
  fileUrl: String,
  fileName: String,
  fileType: String,
  sentAt: Date,
  error: String
}, { timestamps: true });

// Index pour récupérer rapidement les messages à envoyer
scheduledMessageSchema.index({ scheduledFor: 1, status: 1 });

export default mongoose.model('ScheduledMessage', scheduledMessageSchema);