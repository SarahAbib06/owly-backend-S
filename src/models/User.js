import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String },
  photo: { type: String },
  dateOfBirth: { type: Date },
  qrCode: { type: String },
  status: { 
    type: String, 
    enum: ["online", "offline", "away"], 
    default: "offline" 
  },
  
  // 🆕 SESSIONS ACTIVES POUR MULTI-DEVICES
  activeSessions: [{
    socketId: { type: String, required: true },
    deviceType: { 
      type: String, 
      enum: ['desktop', 'mobile', 'tablet'],
      default: 'desktop'
    },
    userAgent: { type: String },
    ipAddress: { type: String },
    connectedAt: { type: Date, default: Date.now },
    lastActivity: { type: Date, default: Date.now }
  }],
  
  // 🆕 PRÉFÉRENCES NOTIFICATIONS
  notificationPreferences: {
    pushEnabled: { type: Boolean, default: true },
    soundEnabled: { type: Boolean, default: true },
    quietHours: {
      enabled: { type: Boolean, default: false },
      start: { type: String, default: '22:00' }, // Format HH:mm
      end: { type: String, default: '08:00' }
    }
  },
  
  createdAt: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now }
});

// 🆕 INDEXES POUR PERFORMANCE
userSchema.index({ "activeSessions.socketId": 1 });
userSchema.index({ status: 1, lastSeen: -1 });
userSchema.index({ "activeSessions.lastActivity": -1 });

export default mongoose.model("User", userSchema);