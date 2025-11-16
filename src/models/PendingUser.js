import mongoose from 'mongoose';

const pendingUserSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  otp: { type: String, required: true },           // ← Doit exister
  otpExpires: { type: Date, required: true },      // ← Doit exister
  createdAt: { type: Date, default: Date.now }
});

// Remplacez module.exports par :
export default mongoose.model('PendingUser', pendingUserSchema);