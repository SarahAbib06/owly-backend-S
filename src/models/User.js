import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  photo: { type: String },
  qrCode: { type: String },
  status: { type: String, enum: ["online", "offline", "away"], default: "offline" },
  createdAt: { type: Date, default: Date.now },
  lastSeen: { type: Date },
  failedLoginAttempts: { type: Number, default: 0 },
  lastFailedAttempt: { type: Date },
  lockedUntil: { type: Date, default: null },
  knownDevices: { type: [String], default: [] }
}, { timestamps: true });

userSchema.pre("save", async function (next) {
  if (!this.isModified("passwordHash")) return next(); // IMPORTANT : return
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.passwordHash);
};

const User = mongoose.model('User', userSchema);
export default User;