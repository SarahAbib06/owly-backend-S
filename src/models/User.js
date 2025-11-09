import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String },       // optionnel
  photo: { type: String },              // optionnel
  dateOfBirth: { type: Date },          // optionnel
  qrCode: { type: String },             // optionnel
  status: { type: String, enum: ["online", "offline", "away"], default: "offline" },
  createdAt: { type: Date, default: Date.now },
  lastSeen: { type: Date }              // optionnel
});

export default mongoose.model("User", userSchema);

