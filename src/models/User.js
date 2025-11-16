
// src/models/User.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true }, // OBLIGATOIRE
    profilePicture: { type: String, default: null },
    qrCode: { type: String },
    status: { type: String, enum: ['online', 'offline', 'away'], default: 'offline' },
    createdAt: { type: Date, default: Date.now },
    lastSeen: { type: Date },
    failedLoginAttempts: { type: Number, default: 0 },
    lastFailedAttempt: { type: Date },
    lockedUntil: { type: Date, default: null },
    knownDevices: { type: [String], default: [] },
  },
  { timestamps: true }
);

// SUPPRIMÉ LE pre('save') → ON HACHE UNIQUEMENT DANS register
// userSchema.pre('save', ...) → DÉSACTIVÉ

// MÉTHODE DE COMPARAISON
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.passwordHash);
};

userSchema.methods.addKnownDevice = function (deviceId) {
  if (!this.knownDevices.includes(deviceId)) {
    this.knownDevices.push(deviceId);
  }
};

userSchema.methods.resetLoginAttempts = function () {
  this.failedLoginAttempts = 0;
  this.lastFailedAttempt = null;
  this.lockedUntil = null;
};

export default mongoose.model('User', userSchema);