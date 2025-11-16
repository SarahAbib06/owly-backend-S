// src/routes/reactionRoutes.js
import express from "express";
import {
  addReaction,
  removeReaction,
  getMessageReactions,
} from "../controllers/reactionController.js";

import authMiddleware from "../middleware/auth.js";

const router = express.Router();

// Utiliser authenticateToken au lieu de auth
router.post("/", authMiddleware, addReaction);
router.delete("/:messageId", authMiddleware, removeReaction);
router.get("/message/:messageId", authMiddleware, getMessageReactions);

export default router;
