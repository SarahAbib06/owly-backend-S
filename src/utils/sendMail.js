import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465, // tu peux aussi essayer 587 si besoin
  secure: true, // true pour 465 (SSL)
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

export const sendOtpEmail = async (to, otp) => {
  const mailOptions = {
    from: `"Owly App" <${process.env.GMAIL_USER}>`,
    to,
    subject: "Owly - Code OTP pour confirmation",
    text: `Votre code OTP Owly est : ${otp}. Il est valide 10 minutes.`,
    html: `<p>Ton code OTP Owly est : <b>${otp}</b></p><p>Il est valide 10 minutes.</p>`,
  };

  return transporter.sendMail(mailOptions);
};
