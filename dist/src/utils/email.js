"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = sendEmail;
exports.generateResetEmail = generateResetEmail;
exports.generateWelcomeEmail = generateWelcomeEmail;
exports.generateCertificateEmail = generateCertificateEmail;
const winston_1 = __importDefault(require("winston"));
const logger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    transports: [
        new winston_1.default.transports.Console(),
    ],
});
async function sendEmail(to, subject, html) {
    logger.info('📧 Email sent (dev mode)', {
        to,
        subject,
        html: html.substring(0, 200) + '...',
    });
}
function generateResetEmail(resetUrl) {
    return `
    <h1>Réinitialisation de mot de passe - EdukaFlow</h1>
    <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
    <p>Cliquez sur le lien ci-dessous pour créer un nouveau mot de passe :</p>
    <a href="${resetUrl}" style="background:#4F46E5;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">
      Réinitialiser mon mot de passe
    </a>
    <p>Ce lien expirera dans 1 heure.</p>
    <p>Si vous n'avez pas fait cette demande, ignorez cet email.</p>
  `;
}
function generateWelcomeEmail(firstName) {
    return `
    <h1>Bienvenue sur EdukaFlow, ${firstName} !</h1>
    <p>Votre compte a été créé avec succès.</p>
    <p>Vous pouvez maintenant vous connecter et commencer à apprendre.</p>
    <p>Bon courage dans vos apprentissages !</p>
  `;
}
function generateCertificateEmail(firstName, coursTitle, certNumber) {
    return `
    <h1>Félicitations, ${firstName} !</h1>
    <p>Vous avez obtenu le certificat pour le cours "${coursTitle}".</p>
    <p>Numéro de certificat : <strong>${certNumber}</strong></p>
    <p>Vous pouvez télécharger votre certificat depuis votre tableau de bord.</p>
  `;
}
//# sourceMappingURL=email.js.map