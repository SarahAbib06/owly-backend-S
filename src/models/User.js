import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

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


userSchema.pre("save", async function (next) {
  if (!this.isModified("passwordHash")) return next(); // IMPORTANT : return
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
  next();
});

const User = mongoose.model('User', userSchema);
export default User;