// models/GroupMember.js
import mongoose from 'mongoose';

const groupMemberSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['admin', 'member'], default: 'member' },
  joinedAt: { type: Date, default: Date.now },
  leftAt: Date, // null si actif
}, { timestamps: true });

groupMemberSchema.index({ conversationId: 1, userId: 1 }, { unique: true });

export default mongoose.model('GroupMember', groupMemberSchema);

