// routes/pollRoutes.js
import express from "express";
import { pollController } from "../controllers/pollController.js";
import { protact } from "../middleware/authen.js";

const router = express.Router();

// Créer un sondage
router.post("/create", protact, pollController.createPoll);

// Voter à un sondage
router.post("/:pollId/vote", protact, pollController.votePoll);

// Récupérer les sondages d'une conversation
router.get(
  "/conversation/:conversationId",
  protact,
  pollController.getConversationPolls
);

// Récupérer un sondage spécifique
router.get("/:pollId", protact, pollController.getPoll);

// Récupérer les résultats détaillés d'un sondage
router.get("/:pollId/results", protact, pollController.getPollResults);

// Fermer un sondage
router.post("/:pollId/close", protact, pollController.closePoll);

// Supprimer un sondage
router.delete("/:pollId", protact, pollController.deletePoll);

export default router;
