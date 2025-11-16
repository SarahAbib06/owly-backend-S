// src/routes/reactionRoutes.js
import express from "express";
import {
  addReaction,
  removeReaction,
  getMessageReactions,
} from "../controllers/reactionController.js";
import { authenticateToken } from "../middleware/auth.js"; // ⬅️ Import nommé CORRECT

const router = express.Router();

// Utiliser authenticateToken au lieu de auth
router.post("/", authenticateToken, addReaction);
router.delete("/:messageId", authenticateToken, removeReaction);
router.get("/message/:messageId", authenticateToken, getMessageReactions);

export default router;
