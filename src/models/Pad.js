import mongoose from "mongoose";

const padSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Conversation",
    required: true,
    unique: true,
    index: true
  },
  
  content: {
    type: String,
    default: ""
  },
  
  mode: {
    type: String,
    enum: ["text", "todo"],
    default: "text",
    index: true
  },
  
  // 🆕 OPERATIONAL TRANSFORM SUPPORT
  version: {
    type: Number,
    default: 0,
    required: true
  },
  
  // 🆕 OPERATIONS HISTORY FOR OT/CRDT
  operations: [{
    type: { type: String, enum: ["insert", "delete", "format"], required: true },
    position: { type: Number, required: true },
    text: String,
    length: Number,
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    timestamp: { type: Date, default: Date.now },
    clientId: String, // ID unique de l'opération côté client
    vectorClock: { type: Map, of: Number } // Pour CRDT
  }],
  
  // 🆕 PREFERENCES & TEMPLATES
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Template"
  },
  
  preferences: {
    theme: { type: String, enum: ["light", "dark", "auto"], default: "auto" },
    autoFormat: { type: Boolean, default: true },
    defaultMode: { type: String, enum: ["text", "todo"], default: "text" },
    fontSize: { type: Number, default: 14, min: 10, max: 24 }
  },
  
  completedItems: [{
    lineIndex: { type: Number, index: true },
    completedAt: Date,
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    // 🆕 TASK METADATA
    dueDate: Date,
    priority: { type: String, enum: ["low", "medium", "high", "urgent"], default: "medium" },
    tags: [String],
    estimatedTime: Number, // en minutes
    subTasks: [{
      text: String,
      completed: Boolean
    }]
  }],
  
  assignedItems: [{
    lineIndex: { type: Number, index: true },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true
    },
    assignedAt: Date,
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    // 🆕 ASSIGNMENT METADATA
    status: { type: String, enum: ["pending", "in_progress", "blocked", "completed"], default: "pending" },
    dueDate: Date,
    notify: { type: Boolean, default: true }
  }],
  
  versionHistory: [{
    content: String,
    mode: String,
    operations: [Object], // Sauvegarde des ops pour restore
    version: Number,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // 🆕 ANALYTICS & METRICS
  metrics: {
    totalEdits: { type: Number, default: 0 },
    lastActiveAt: Date,
    mostActiveUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    averageEditFrequency: Number, // edits/minute
    completionRate: Number, // pourcentage
    conflictsResolved: { type: Number, default: 0 }
  },
  
  // 🆕 SECURITY & PERMISSIONS
  accessLevels: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    level: { type: String, enum: ["read", "comment", "edit", "admin"], default: "edit" }
  }],
  
  // 🆕 ENCRYPTION SUPPORT
  encrypted: { type: Boolean, default: false },
  encryptionKey: String, // hash ou référence à la clé
  iv: String, // pour AES
  
  // 🆕 INTEGRATIONS
  webhooks: [{
    url: String,
    events: [String], // ["item_completed", "item_assigned", "content_changed"]
    active: { type: Boolean, default: true },
    lastTriggered: Date
  }],
  
  // 🆕 CONTEXT & INTELLIGENCE
  contextTags: [String],
  predictedDueDate: Date,
  suggestedAssignments: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reason: String,
    confidence: Number
  }],
  
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    index: true
  }
}, {
  timestamps: true,
  
  // 🆕 OPTIMIZATION OPTIONS
  minimize: false, // Garder les objets vides pour performance
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 🆕 INDEX COMPOSÉS POUR PERFORMANCE
padSchema.index({ conversationId: 1, "completedItems.lineIndex": 1 });
padSchema.index({ conversationId: 1, "assignedItems.lineIndex": 1 });
padSchema.index({ conversationId: 1, version: -1 });
padSchema.index({ "assignedItems.assignedTo": 1, "assignedItems.status": 1 });
padSchema.index({ "metrics.lastActiveAt": -1 });

// 🆕 VIRTUALS POUR ANALYTICS
padSchema.virtual('progress').get(function() {
  if (this.mode !== "todo") return 0;
  const lines = this.content.split('\n').filter(l => l.trim());
  const completed = this.completedItems.length;
  return lines.length > 0 ? (completed / lines.length) * 100 : 0;
});

padSchema.virtual('activeUsers').get(function() {
  // Détecter les utilisateurs actifs récemment via operations
  const lastHour = new Date(Date.now() - 3600000);
  const recentOps = this.operations.filter(op => op.timestamp > lastHour);
  const userIds = [...new Set(recentOps.map(op => op.authorId.toString()))];
  return userIds.length;
});

// 🆕 MIDDLEWARE POUR METRICS AUTO-UPDATE
padSchema.pre('save', function(next) {
  if (this.isModified('content') || this.isModified('operations')) {
    this.metrics.totalEdits += 1;
    this.metrics.lastActiveAt = new Date();
    
    // Détecter l'utilisateur le plus actif
    const recentOps = this.operations.slice(-50);
    const userEditCount = {};
    recentOps.forEach(op => {
      if (op.authorId) {
        const userId = op.authorId.toString();
        userEditCount[userId] = (userEditCount[userId] || 0) + 1;
      }
    });
    
    const mostActive = Object.entries(userEditCount)
      .sort((a, b) => b[1] - a[1])[0];
    
    if (mostActive) {
      this.metrics.mostActiveUser = mostActive[0];
    }
    
    // Calculer fréquence moyenne
    if (this.operations.length > 1) {
      const firstOp = this.operations[0].timestamp;
      const lastOp = this.operations[this.operations.length - 1].timestamp;
      const timeDiff = (lastOp - firstOp) / 60000; // minutes
      this.metrics.averageEditFrequency = this.operations.length / Math.max(timeDiff, 1);
    }
  }
  
  // Versioning automatique
  if (this.isModified('content') && !this.isNew) {
    this.version += 1;
  }
  
  next();
});

// 🆕 METHODES D'INSTANCE
padSchema.methods.canUserEdit = function(userId) {
  if (!this.accessLevels || this.accessLevels.length === 0) {
    return true; // Par défaut, tous les participants peuvent éditer
  }
  
  const userAccess = this.accessLevels.find(a => a.userId.toString() === userId.toString());
  return userAccess ? ["edit", "admin"].includes(userAccess.level) : false;
};

padSchema.methods.getUserAccessLevel = function(userId) {
  const userAccess = this.accessLevels.find(a => a.userId.toString() === userId.toString());
  return userAccess ? userAccess.level : "edit"; // Par défaut
};

padSchema.methods.addOperation = function(op) {
  this.operations.push({
    ...op,
    timestamp: new Date()
  });
  
  // Limiter la taille du historique d'opérations
  if (this.operations.length > 1000) {
    this.operations = this.operations.slice(-500);
  }
};

padSchema.methods.applyOperation = function(op) {
  // Appliquer l'opération au contenu (CRDT/OT)
  // Ceci est un exemple simplifié
  if (op.type === "insert") {
    const before = this.content.slice(0, op.position);
    const after = this.content.slice(op.position);
    this.content = before + op.text + after;
  } else if (op.type === "delete") {
    const before = this.content.slice(0, op.position);
    const after = this.content.slice(op.position + op.length);
    this.content = before + after;
  }
  
  this.addOperation(op);
};

padSchema.methods.getContextSuggestions = function() {
  const suggestions = [];
  
  // Analyser le contenu pour suggestions
  if (this.content.includes("TODO") || this.content.includes("FIXME")) {
    suggestions.push({
      type: "convert_to_todo",
      confidence: 0.8,
      message: "Ce contenu semble être une liste de tâches. Convertir en mode todo?"
    });
  }
  
  if (this.content.includes("@") && !this.content.includes("@example.com")) {
    const mentions = this.content.match(/@(\w+)/g);
    if (mentions) {
      suggestions.push({
        type: "mention_detected",
        confidence: 0.6,
        message: `Vous avez mentionné ${mentions.join(", ")}. Voulez-vous les assigner?`
      });
    }
  }
  
  // Détecter les dates
  const dateRegex = /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b/g;
  const dates = this.content.match(dateRegex);
  if (dates) {
    suggestions.push({
      type: "dates_detected",
      confidence: 0.7,
      message: "Dates détectées. Ajouter comme échéances?",
      data: dates
    });
  }
  
  return suggestions;
};

padSchema.methods.generateReport = function() {
  const report = {
    general: {
      totalLines: this.content.split('\n').length,
      totalWords: this.content.split(/\s+/).length,
      mode: this.mode,
      createdAt: this.createdAt,
      lastUpdated: this.updatedAt
    },
    
    todoStats: this.mode === "todo" ? {
      totalItems: this.content.split('\n').filter(l => l.trim()).length,
      completedItems: this.completedItems.length,
      completionRate: this.progress,
      pendingItems: this.content.split('\n').filter(l => l.trim()).length - this.completedItems.length,
      assignedItems: this.assignedItems.length
    } : null,
    
    activity: {
      totalEdits: this.metrics.totalEdits,
      averageEditFrequency: this.metrics.averageEditFrequency,
      lastActiveAt: this.metrics.lastActiveAt,
      activeUsers: this.activeUsers
    },
    
    timeline: this.versionHistory.slice(-10).map(v => ({
      version: v.version,
      updatedAt: v.updatedAt,
      updatedBy: v.updatedBy,
      changes: v.operations ? v.operations.length : 0
    }))
  };
  
  return report;
};

export default mongoose.model("Pad", padSchema);