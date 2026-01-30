import mongoose from "mongoose";

const templateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ["meeting", "todo", "brainstorm", "project", "custom"],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  defaultMode: {
    type: String,
    enum: ["text", "todo"],
    default: "text"
  },
  preferences: {
    theme: { type: String, enum: ["light", "dark", "auto"], default: "auto" },
    autoFormat: { type: Boolean, default: true },
    fontSize: { type: Number, default: 14 }
  },
  tags: [String],
  category: String,
  isPublic: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  usedCount: {
    type: Number,
    default: 0
  },
  rating: {
    average: { type: Number, default: 0 },
    count: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Index pour recherche rapide
templateSchema.index({ name: "text", tags: "text", type: 1 });
templateSchema.index({ isPublic: 1, usedCount: -1 });
templateSchema.index({ createdBy: 1 });

export default mongoose.model("Template", templateSchema);