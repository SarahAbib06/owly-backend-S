import mongoose from "mongoose";

// COPIER-COLLER exactement le même schéma que User.js
const usersSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String },
  photo: { type: String },
  dateOfBirth: { type: Date },
  qrCode: { type: String },
  status: {
    type: String,
    enum: ["online", "offline", "away"],
    default: "offline",
  },
  createdAt: { type: Date, default: Date.now },
  lastSeen: { type: Date },
});

// ⚠️ TRÈS IMPORTANT : Exporter avec le nom "Users"
export default mongoose.model("Users", usersSchema);
//                                    ↑
//                              Même nom que dans Participants.js
