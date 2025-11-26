// routes/authRoutes.js
import express from "express";
import {
  register,
  verifyOtp,
  resendOtp,
  login,
  verifyInactivityOtp,
  getMe,
  forgotPassword,
  verifyOtpReset,
} from "../controllers/authController.js";

import {
  uploadProfilePicture,
  uploadMiddleware,
  deleteProfilePicture,
} from "../controllers/uploadController.js";

import {
  updateUsername,
  getProfile
} from '../controllers/profileController.js';

import authMiddleware from '../middleware/auth.js';
import { deleteAccount, getBlockedUsers, unblockUser,
  changePassword } from "../controllers/accountController.js";



const router = express.Router();

// ========================================
// ROUTES PUBLIQUES
// ========================================
router.post("/register", register);
router.post("/verify-otp", verifyOtp);
router.post("/resend-otp", resendOtp);

router.post("/login", login);
router.post("/verify-inactivity-otp", verifyInactivityOtp);
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp-reset", verifyOtpReset);

// ========================================
// ROUTES PROTÉGÉES
// ========================================
router.get("/me", authMiddleware, getMe);

router.post(
  "/upload-profile",
  authMiddleware,
  uploadMiddleware,
  uploadProfilePicture
);

router.put(
  '/profile/upload',
  authMiddleware,
  uploadMiddleware,
  uploadProfilePicture
);

router.delete(
  '/profile/picture',
  authMiddleware,
  deleteProfilePicture
);

// Routes pour les paramètres du profil
router.put('/profile/username', authMiddleware, updateUsername);
router.get('/profile', authMiddleware, getProfile);

// Route de test
router.get('/messagerie', authMiddleware, (req, res) => {
  res.send(`Salut ${req.user.email}, tu es connecté !`);
});
router.post("/delete-account", authMiddleware, deleteAccount);

export default router;