import express from 'express';

import {
  register,
  verifyOtp,
  resendOtp,
  login,
  verifyInactivityOtp,
  getMe,
  forgotPassword,
  verifyOtpReset,
} from '../controllers/authController.js';

import {
  uploadProfilePicture,
  uploadMiddleware,
} from '../controllers/uploadController.js';

import authMiddleware from '../middleware/auth.js';

const router = express.Router();

// ========================================
// ROUTES PUBLIQUES
// ========================================
router.post('/register', register);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);

router.post('/login', login);
router.post('/verify-inactivity-otp', verifyInactivityOtp);
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp-reset', verifyOtpReset);

// ========================================
// ROUTES PROTÉGÉES
// ========================================
router.get('/me', authMiddleware, getMe);

router.post(
  '/upload-profile',
  authMiddleware,
  uploadMiddleware,
  uploadProfilePicture
);

router.get('/messagerie', authMiddleware, (req, res) => {
  res.send(`Salut ${req.user.email}, tu es connecté !`);
});

export default router;