import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  logger.info('📧 Email sent (dev mode)', {
    to,
    subject,
    html: html.substring(0, 200) + '...',
  });
}

export function generateResetEmail(resetUrl: string): string {
  return `
    <h1>Réinitialisation de mot de passe - EduFlow</h1>
    <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
    <p>Cliquez sur le lien ci-dessous pour créer un nouveau mot de passe :</p>
    <a href="${resetUrl}" style="background:#4F46E5;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">
      Réinitialiser mon mot de passe
    </a>
    <p>Ce lien expirera dans 1 heure.</p>
    <p>Si vous n'avez pas fait cette demande, ignorez cet email.</p>
  `;
}

export function generateWelcomeEmail(firstName: string): string {
  return `
    <h1>Bienvenue sur EduFlow, ${firstName} !</h1>
    <p>Votre compte a été créé avec succès.</p>
    <p>Vous pouvez maintenant vous connecter et commencer à apprendre.</p>
    <p>Bon courage dans vos apprentissages !</p>
  `;
}

export function generateCertificateEmail(firstName: string, coursTitle: string, certNumber: string): string {
  return `
    <h1>Félicitations, ${firstName} !</h1>
    <p>Vous avez obtenu le certificat pour le cours "${coursTitle}".</p>
    <p>Numéro de certificat : <strong>${certNumber}</strong></p>
    <p>Vous pouvez télécharger votre certificat depuis votre tableau de bord.</p>
  `;
}
