import express from 'express';
import { 
  register, 
  verifyOtp, 
  resendOtp,
  } from '../controllers/authController.js';

import { uploadProfilePicture,
  uploadMiddleware}  from '../controllers/uploadController.js'
import authMiddleware from '../middleware/auth.js'

const router = express.Router();

router.post('/register', register);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);

// ✅ Route corrigée - utilisez le middleware d'upload puis le handler
router.post("/upload-profile", 
  authMiddleware, 
  uploadMiddleware,
  uploadProfilePicture
);

router.get('/messagerie', authMiddleware, (req, res) => {
  res.send(`Salut ${req.user.email}, tu es connecté !`);
});

export default router;