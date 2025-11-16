import express from "express";
import {
  registerUser,
  loginUser,
  getMyProfile,
  getUsers,
  getUserById,
  updateUserProfile,
  updateUserStatus,
  logoutUser,
  deleteUser,
} from "../controllers/userController.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// Routes publiques
router.post("/register", registerUser);
router.post("/login", loginUser);

// Routes protégées
router.get("/profile", authenticateToken, getMyProfile);
router.get("/", authenticateToken, getUsers);
router.get("/:id", authenticateToken, getUserById);
router.put("/profile", authenticateToken, updateUserProfile);
router.put("/status", authenticateToken, updateUserStatus);
router.post("/logout", authenticateToken, logoutUser);
router.delete("/:id", authenticateToken, deleteUser);

export default router;
