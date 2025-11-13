// authcontroller.js
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import PendingUser from '../models/PendingUser.js';
import { sendOtpEmail } from '../utils/sendMail.js';

const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const signToken = (user) => {
  return jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

export const register = async (req, res) => {
  
  try {
    const { username, email, password, passwordConfirm } = req.body;

    
    // Validation des champs requis
    if (!username || !email || !password || !passwordConfirm) {
      return res.status(400).json({ message: 'Tous les champs sont requis.' });
    }

    
   // Validation mot de passe fort
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=\[{\]};:'"\\|,.<>/?`~]).{8,}$/;

if (!passwordRegex.test(password)) {
  return res.status(400).json({
    message: 'Le mot de passe doit contenir au moins 8 caractères, incluant : une majuscule, une minuscule, un chiffre et un caractère spécial.'
  });
}


    if (password !== passwordConfirm) {
      return res.status(400).json({ message: 'Les mots de passe ne correspondent pas.' });
    }

    // Validation email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Adresse email invalide.' });
    }

    // Vérification username (corrigé: userName -> username)
    const existingUsername = await User.findOne({ username: username });
    if (existingUsername) {
      return res.status(400).json({ message: "Ce nom d'utilisateur existe déjà" });
    }

    // Vérification email
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Un compte existe déjà pour cet e-mail.' });
    }
    
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Création pending user avec tous les champs
    const otp = generateOtp();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    await PendingUser.findOneAndUpdate(
      { email },
      { 
        username: username,
        email, 
        passwordHash, 
        otp, 
        otpExpires 
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Envoi OTP
    await sendOtpEmail(email, otp);

    return res.status(200).json({ message: 'OTP envoyé à l\'adresse e-mail.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email et OTP requis.' });
    }

    const pending = await PendingUser.findOne({ email });
    if (!pending) {
      return res.status(400).json({ message: 'Aucune inscription en attente trouvée.' });
    }
    
    if (pending.otp !== otp) {
      return res.status(400).json({ message: 'OTP invalide.' });
    }
    
    if (pending.otpExpires < new Date()) {
      await PendingUser.deleteOne({ email });
      return res.status(400).json({ message: 'OTP expiré. Veuillez renvoyer un nouvel OTP.' });
    }

    // Création user avec tous les champs
    const newUser = await User.create({
      username: pending.username,
      email: pending.email,
      passwordHash: pending.passwordHash
    });

    // Suppression pending
    await PendingUser.deleteOne({ email });

    // Génération token
    const token = signToken(newUser);

    return res.status(201).json({
      message: 'Compte créé avec succès.',
      data: {
        token,
        user: {
          id: newUser._id,
          username: newUser.username,
          email: newUser.email
        }
      }
    });
    
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
};

export const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email requis.' });

    const pending = await PendingUser.findOne({ email });
    if (!pending) return res.status(400).json({ message: 'Aucune inscription en attente trouvée.' });

    const otp = generateOtp();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    pending.otp = otp;
    pending.otpExpires = otpExpires;
    await pending.save();

    await sendOtpEmail(email, otp);
    return res.status(200).json({ message: 'OTP renvoyé.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
};