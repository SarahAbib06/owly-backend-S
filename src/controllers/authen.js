// routes/auth.js
import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { protact } from '../middleware/authen.js';
import sendEmail from '../utils/sendEmail.js';
import { UAParser } from 'ua-parser-js';
import axios from 'axios';

const router = express.Router();

// ========================================
// FONCTION : ENVOIE EMAIL À CHAQUE CONNEXION (AVEC APPAREIL + LOCALISATION)
// ========================================
const sendLoginAlertEmail = async (user, req, email) => {
  console.log('\nENVOI ALERTE CONNEXION POUR:', email);

  const userAgent = req.headers['user-agent'] || 'Inconnu';
  const rawIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'Inconnu';
  const ip = rawIp.replace('::ffff:', '');

  console.log('User-Agent:', userAgent);
  console.log('IP:', ip);

  const parser = new UAParser(userAgent);
  const result = parser.getResult();
  const deviceInfo = `${result.browser.name || 'Inconnu'} ${result.browser.version?.split('.')[0] || ''} on ${result.os.name || 'Inconnu'} ${result.os.version?.split('.')[0] || ''}`.trim();

  let location = 'Localisation inconnue';
  try {
    const geo = await axios.get(`http://ip-api.com/json/${ip}`, { timeout: 5000 });
    if (geo.data.status === 'success') {
      location = `${geo.data.city || 'Ville inconnue'}, ${geo.data.country || 'Pays inconnu'}`;
    }
  } catch (err) {
    console.log('Géoloc échouée:', err.message);
  }

  const loginTime = new Date().toLocaleString('fr-DZ', { timeZone: 'Africa/Algiers' });

  const html = `
    <div style="font-family:Arial;text-align:center;padding:30px;background:#e8f5e9;border-radius:12px;">
      <h2 style="color:#2e7d32;">Connexion réussie</h2>
      <p>Quelqu'un s'est connecté à votre compte Owly.</p>
      <hr style="margin:20px 0;">
      <p><strong>Appareil :</strong> ${deviceInfo}</p>
      <p><strong>Localisation :</strong> ${location}</p>
      <p><strong>Heure :</strong> ${loginTime}</p>
      <hr style="margin:20px 0;">
      <p style="color:#d32f2f;">Si ce n'était pas vous, changez votre mot de passe immédiatement !</p>
      <a href="${process.env.CLIENT_URL}/forgot-password" style="background:#d32f2f;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;">
        Changer le mot de passe
      </a>
    </div>
  `;

  console.log('ENVOI EMAIL ALERTE CONNEXION À:', email);
  await sendEmail(email, 'Connexion détectée - Owly', 'Connexion réussie', html);
  console.log('EMAIL ALERTE CONNEXION ENVOYÉ !\n');
};

// ========================================
// 1. LOGIN
// ========================================
router.post('/login', async (req, res) => {
  const { email, passwordHash } = req.body;
  if (!email || !passwordHash) return res.status(400).json({ message: 'Email et mot de passe requis' });

  if (passwordHash.length < 8) {
    return res.status(400).json({ message: 'Le mot de passe doit contenir au min 8 caractères' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Identifiants invalides' });

    const now = new Date();
    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(now.getDate() - 7);

    // === BLOCAGE 15s ===
    if (user.lockedUntil && now < user.lockedUntil) {
      const secondsLeft = Math.ceil((user.lockedUntil - now) / 1000);
      return res.status(429).json({
        message: `Trop de tentatives. Réessayez dans ${secondsLeft}s.`,
        retryAfter: secondsLeft
      });
    }

    // === MOT DE PASSE INCORRECT ===
    if (!(await user.matchPassword(passwordHash))) {
      if (user.lastFailedAttempt && (now - user.lastFailedAttempt) > 15 * 60 * 1000) {
        user.failedLoginAttempts = 0;
        user.lockedUntil = null;
      }
      user.failedLoginAttempts += 1;
      user.lastFailedAttempt = now;
      if (user.failedLoginAttempts >= 3) {
        user.lockedUntil = new Date(now.getTime() + 15 * 1000);
      }
      await user.save();

      if (user.failedLoginAttempts === 3) {
        const resetToken = jwt.sign({ userId: user._id, type: 'reset' }, process.env.JWT_SECRET, { expiresIn: '15m' });
        const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
        const html = `
          <div style="font-family:Arial;text-align:center;padding:30px;background:#ffebee;border-radius:12px;">
            <h2 style="color:#d32f2f;">Tentative de connexion suspecte</h2>
            <p>Quelqu'un a essayé de se connecter à votre compte <strong>3 fois</strong> avec un mot de passe incorrect.</p>
            <p><strong>Dernière tentative :</strong> ${now.toLocaleString('fr-DZ', { timeZone: 'Africa/Algiers' })}</p>
            <p>Si ce n'était pas vous, <strong>changez immédiatement votre mot de passe</strong>.</p>
            <a href="${resetUrl}" style="background:#d32f2f;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;">
              Changer le mot de passe maintenant
            </a>
          </div>
        `;
        await sendEmail(email, 'Alerte sécurité - Owly', 'Tentative suspecte détectée', html);
      }

      return res.status(401).json({ message: 'Mot de passe incorrect', attempts: user.failedLoginAttempts });
    }

    // === SUCCÈS : RÉINITIALISE SÉCURITÉ ===
    user.failedLoginAttempts = 0;
    user.lastFailedAttempt = undefined;
    user.lockedUntil = null;
    user.lastSeen = now;
    await user.save();

    // EMAIL À CHAQUE CONNEXION (même si appareil connu)
    await sendLoginAlertEmail(user, req, email);

    // === CONNEXION DIRECTE (≤7 jours) ===
    if (user.lastSeen >= oneWeekAgo) {
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE });
      return res.json({
        message: 'Connexion réussie (dans les 7 jours)',
        id: user._id,
        username: user.username,
        email: user.email,
        token
      });
    }

    // === INACTIVITÉ > 7 JOURS → OTP ===
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const token = jwt.sign(
      { userId: user._id, otp, type: 'inactivity' },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );

    const verifyUrl = `${process.env.CLIENT_URL}/verify-otp?token=${token}`;
    const html = `
      <div style="font-family:Arial;text-align:center;padding:30px;background:#fff3e0;border-radius:12px;">
        <h2 style="color:#ff8f00;">Vérification de sécurité</h2>
        <p>Vous n'avez pas utilisé votre compte depuis <strong>plus de 7 jours</strong>.</p>
        <p>Saisissez ce code pour vous connecter :</p>
        <h1 style="font-size:38px;letter-spacing:10px;color:#ff8f00;background:#fff8e1;padding:15px;border-radius:10px;display:inline-block;">
          ${otp}
        </h1>
        <p style="color:#555;margin:20px 0;">Valable 10 minutes</p>
        <a href="${verifyUrl}" style="background:#ff8f00;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;">
          Vérifier maintenant
        </a>
      </div>
    `;

    await sendEmail(email, 'Vérification de sécurité - Owly', `Code: ${otp}`, html);

    res.json({
      message: 'Vérification requise (plus de 7 jours)',
      requiresOtp: true,
      email,
      debug_token: token
    });

  } catch (err) {
    console.error('ERREUR LOGIN:', err.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ========================================
// 2. VÉRIFIER OTP → EMAIL ALERTE CONNEXION
// ========================================
router.post('/verify-inactivity-otp', async (req, res) => {
  const { token, otp } = req.body;
  if (!token || !otp) return res.status(400).json({ message: 'Token et OTP requis' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'inactivity' || decoded.otp !== otp) {
      return res.status(400).json({ message: 'Code OTP incorrect' });
    }

    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });

    user.lastSeen = new Date();
    await user.save();

    // EMAIL À CHAQUE CONNEXION APRÈS OTP
    await sendLoginAlertEmail(user, req, user.email);

    const authToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE });
    res.json({
      message: 'Connexion réussie après vérification',
      id: user._id,
      username: user.username,
      email: user.email,
      token: authToken
    });

  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(400).json({ message: 'Code expiré' });
    res.status(400).json({ message: 'Token invalide' });
  }
});

// ========================================
// 3. PROFIL
// ========================================
router.get('/me', protact, (req, res) => res.json(req.user));

// ========================================
// 4. FORGOT PASSWORD
// ========================================
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email requis' });

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const token = jwt.sign({ userId: user._id, otp, type: 'reset' }, process.env.JWT_SECRET, { expiresIn: '10m' });

    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
    const html = `
      <div style="font-family:Arial;text-align:center;padding:30px;background:#e3f2fd;border-radius:12px;">
        <h2 style="color:#007bff;">Réinitialisez votre mot de passe</h2>
        <h1 style="font-size:38px;letter-spacing:10px;color:#007bff;background:#bbdefb;padding:15px;border-radius:10px;display:inline-block;">
          ${otp}
        </h1>
        <p style="color:#555;margin:20px 0;">Valable 10 minutes</p>
        <a href="${resetUrl}" style="background:#007bff;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;">
          Réinitialiser
        </a>
      </div>
    `;

    await sendEmail(email, 'Réinitialisation - Owly', `Code: ${otp}`, html);
    res.json({ message: 'OTP envoyé', token });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ========================================
// 5. RESET PASSWORD
// ========================================
router.post('/verify-otp-reset', async (req, res) => {
  const { token, otp, newPassword } = req.body;

  if (!token || !otp || !newPassword || newPassword.length !== 8) {
    return res.status(400).json({ message: 'Données invalides' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'reset' || decoded.otp !== otp) {
      return res.status(400).json({ message: 'Code OTP incorrect' });
    }

    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });

    user.passwordHash = newPassword;
    user.lastSeen = new Date();
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await user.save();

    res.json({ message: 'Mot de passe réinitialisé avec succès' });
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(400).json({ message: 'Code expiré' });
    res.status(400).json({ message: 'Token invalide' });
  }
});

// ========================================
// EXPORT
// ========================================
export default router;