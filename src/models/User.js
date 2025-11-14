// src/models/User.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String }, // optionnel au départ, mais sera hashé
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

// === HASHAGE DU MOT DE PASSE AVANT SAUVEGARDE ===
userSchema.pre('save', async function (next) {
  // Si passwordHash n'est pas modifié → on passe
  if (!this.isModified('passwordHash')) return next();

  // Si passwordHash est vide ou non défini → erreur
  if (!this.passwordHash) {
    return next(new Error('Mot de passe requis'));
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// === MÉTHODE : VÉRIFIER LE MOT DE PASSE ===
userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.passwordHash) return false;
  return await bcrypt.compare(enteredPassword, this.passwordHash);
};

// === MÉTHODE : AJOUTER UN APPAREIL CONNU ===
userSchema.methods.addKnownDevice = function (deviceId) {
  if (!this.knownDevices.includes(deviceId)) {
    this.knownDevices.push(deviceId);
  }
};

// === MÉTHODE : RÉINITIALISER LES ÉCHECS ===
userSchema.methods.resetLoginAttempts = function () {
  this.failedLoginAttempts = 0;
  this.lastFailedAttempt = null;
  this.lockedUntil = null;
};

const User = mongoose.model('User', userSchema);
export default User;