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
    default: "",
    trim: true
  },
  
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    index: true
  }
}, {
  timestamps: true
});

// S'assurer que content n'est jamais undefined/null
padSchema.pre('save', function(next) {
  if (this.content === undefined || this.content === null) {
    this.content = "";
  }
  next();
});

const Pad = mongoose.model("Pad", padSchema);
export default Pad;