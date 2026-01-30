// routes/contact.js    (ou ton fichier principal)

import express from 'express';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config(); // charge .env si pas déjà fait ailleurs

const router = express.Router();

// Configuration du transporteur (mets tes creds dans .env !)
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: { rejectUnauthorized: false },
  logger: true,    // ← AJOUTE
  debug: true,     // ← AJOUTE (montre les échanges SMTP)
});

// Route POST /api/contact
router.post('/contact', async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length < 5) {
    return res.status(400).json({ 
      success: false, 
      error: 'Message requis et doit contenir au moins 5 caractères' 
    });
  }

  try {
    console.log("EMAIL_USER utilisé :", process.env.EMAIL_USER);
    console.log("EMAIL_PASS longueur :", process.env.EMAIL_PASS?.length);  // doit être 16
    console.log("EMAIL_PASS premier/dernier :", process.env.EMAIL_PASS?.[0], process.env.EMAIL_PASS?.slice(-1));
    await transporter.sendMail({
      from: `"Owly Contact" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER, // ou une autre adresse si tu veux
      subject: 'Nouveau message depuis l’application Owly',
      text: `Message reçu depuis l’app :\n\n${message}\n\n— Utilisateur Owly`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px;">
          <h2 style="color: #1a1a1a;">Nouveau message Owly</h2>
          <p><strong>Contenu du message :</strong></p>
          <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; white-space: pre-wrap;">
            ${message.replace(/\n/g, '<br>')}
          </div>
          <hr style="margin: 20px 0; border-color: #eee;">
          <small style="color: #666;">Envoyé depuis l’application Owly – ${new Date().toLocaleString()}</small>
        </div>
      `,
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Erreur envoi email :', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de l’envoi du message' 
    });
  }
});

export default router;