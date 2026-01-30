// src/utils/sendEmail.js
import Mailjet from 'node-mailjet';

// ✅ Vérification des variables d'environnement
if (!process.env.MAILJET_API_KEY || !process.env.MAILJET_SECRET_KEY) {
  console.error('❌ MAILJET_API_KEY ou MAILJET_SECRET_KEY manquant !');
}

// ✅ Configuration Mailjet
const mailjet = Mailjet.apiConnect(
  process.env.MAILJET_API_KEY,
  process.env.MAILJET_SECRET_KEY
);

const sendEmail = async (to, subject, text, html = null) => {
  console.log(`[MAILJET] Envoi à ${to}...`);

  try {
    const result = await mailjet
      .post('send', { version: 'v3.1' })
      .request({
        Messages: [
          {
            From: {
              Email: process.env.EMAIL_USER || "owly.app.team@gmail.com",
              Name: "Owly App"
            },
            To: [
              {
                Email: to,
                Name: to.split('@')[0] // Prend la partie avant @ comme nom
              }
            ],
            Subject: subject,
            TextPart: text,
            HTMLPart: html || text
          }
        ]
      });

    console.log(`[MAILJET] ✅ SUCCÈS ! Email envoyé à ${to}`);
    return result.body;
  } catch (error) {
    console.error(`[MAILJET] ❌ ÉCHEC :`, error.statusCode, error.message);
    throw error;
  }
};

export default sendEmail;






// // src/utils/sendEmail.js
// import nodemailer from 'nodemailer';

// const transporter = nodemailer.createTransport({
//   host: 'smtp.gmail.com',
//   port: 587,
//   secure: false,
//   auth: {
//     user: 'owly.app.team@gmail.com',           // NOUVEAU EMAIL
//     pass: 'byjxicqobhpxpsgr',               // NOUVEAU MOT DE PASSE D'APP
//   },
//   tls: { rejectUnauthorized: false }
// });

// const sendEmail = async (to, subject, text, html = null) => {
//   console.log(`[GMAIL] Envoi à ${to}...`);

//   try {
//     const info = await transporter.sendMail({
//       from: '"Owly App" <owly.app.team@gmail.com>',
//       to,                                      // EMAIL DE L'UTILISATEUR
//       subject,
//       text,
//       html: html || text, 
//     });

//     console.log(`[GMAIL] SUCCÈS ! Envoyé à ${to} | ID: ${info.messageId}`);
//   } catch (error) {
//     console.error(`[GMAIL] ÉCHEC : ${error.message}`);
//     throw error;
//   }
// };

// export default sendEmail;