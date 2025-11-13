import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String },       // optionnel
 profilePicture: {
  type: String,
  default: null, // ou null si tu préfères
},

  qrCode: { type: String },             // optionnel
  status: { type: String, enum: ["online", "offline", "away"], default: "offline" },
  createdAt: { type: Date, default: Date.now },
  lastSeen: { type: Date }  ,  // optionnel
  failedLoginAttempts: { type: Number, default: 0 },     // NOUVEAU
  lastFailedAttempt: { type: Date },
  lockedUntil: {type: Date, default: null},
  knownDevices: {type: [String], default: []}
  

},{timestamps: true}
);

export default mongoose.model("User", userSchema);

