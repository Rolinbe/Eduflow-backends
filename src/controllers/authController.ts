import { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import crypto from 'crypto';
import prisma from '../config/prisma';
import { jwtConfig } from '../config/jwt';
import { AuthRequest, JwtPayload } from '../types';
import { sendEmail, generateResetEmail, generateWelcomeEmail } from '../utils/email';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

const niveauEnum = z.enum(['SIXIEME', 'CINQUIEME', 'QUATRIEME', 'TROISIEME', 'SECONDE', 'PREMIERE', 'TERMINALE', 'LICENCE', 'MASTER', 'DOCTORAT']);
const serieEnum = z.enum(['S', 'L', 'OSE']);

const roleEnum = z.enum(['APPRENANT', 'MENTOR']);

const registerSchema = z.object({
  firstName: z.string().min(2, 'Le prénom doit contenir au moins 2 caractères'),
  lastName: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  email: z.string().email('Email invalide').optional(),
  password: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
    .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre'),
  role: roleEnum.optional(),
  niveau: niveauEnum.optional(),
  serie: serieEnum.optional(),
  niveauResponsable: niveauEnum.optional(),
  serieResponsable: serieEnum.optional(),
}).refine((data) => {
  if ((data.niveau === 'TERMINALE' || data.niveau === 'PREMIERE') && !data.serie) return false;
  return true;
}, { message: 'Une série est requise pour la Terminale et la Première', path: ['serie'] })
.refine((data) => {
  const needsSerie = data.niveau === 'TERMINALE' || data.niveau === 'PREMIERE';
  if (!needsSerie && data.serie) return false;
  return true;
}, { message: 'La série n\'est applicable que pour la Terminale et la Première', path: ['serie'] })
.refine((data) => {
  if (data.role === 'MENTOR' && !data.niveauResponsable) return false;
  return true;
}, { message: 'Le niveau responsable est requis pour les mentors', path: ['niveauResponsable'] })
.refine((data) => {
  if (data.role === 'MENTOR' && (data.niveauResponsable === 'PREMIERE' || data.niveauResponsable === 'TERMINALE') && !data.serieResponsable) return false;
  return true;
}, { message: 'La série est requise pour les mentors de Première ou Terminale', path: ['serieResponsable'] })
.refine((data) => {
  if (data.role === 'MENTOR' && data.niveauResponsable && data.niveauResponsable !== 'PREMIERE' && data.niveauResponsable !== 'TERMINALE' && data.serieResponsable) return false;
  return true;
}, { message: 'La série n\'est applicable que pour la Première et la Terminale', path: ['serieResponsable'] })
.refine((data) => {
  if (data.role === 'MENTOR' && !data.email) return false;
  if (data.role === 'APPRENANT' && data.niveau && !['SIXIEME', 'CINQUIEME', 'QUATRIEME', 'TROISIEME'].includes(data.niveau) && !data.email) return false;
  return true;
}, { message: 'L\'email est requis', path: ['email'] });

const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Ancien mot de passe requis'),
  newPassword: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
    .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre'),
});

const updateProfileSchema = z.object({
  firstName: z.string().min(2).optional(),
  lastName: z.string().min(2).optional(),
  avatar: z.string().url().optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Email invalide'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token requis'),
  password: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
    .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre'),
});

function generateTokens(payload: JwtPayload) {
  const token = jwt.sign(payload, jwtConfig.secret, { expiresIn: jwtConfig.expiresIn });
  const refreshToken = jwt.sign(payload, jwtConfig.refreshSecret, { expiresIn: jwtConfig.refreshExpiresIn });
  return { token, refreshToken };
}

export const register = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const validated = registerSchema.parse(req.body);

    // Auto-generate email for young students without one
    let email = validated.email;
    if (!email) {
      const slug = `${validated.firstName.toLowerCase()}.${validated.lastName.toLowerCase()}`;
      const suffix = crypto.randomBytes(3).toString('hex');
      email = `${slug}.${suffix}@edukaflow.local`;
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      res.status(409).json({ error: 'Un compte avec cet email existe déjà' });
      return;
    }

    const hashedPassword = await bcrypt.hash(validated.password, 12);

    const userRole = validated.role === 'MENTOR' ? 'MENTOR' : 'APPRENANT';

    const user = await prisma.user.create({
      data: {
        firstName: validated.firstName,
        lastName: validated.lastName,
        email,
        password: hashedPassword,
        role: userRole,
        status: 'ACTIF',
        niveau: validated.niveau || null,
        serie: (validated.niveau === 'TERMINALE' || validated.niveau === 'PREMIERE') ? validated.serie : null,
        niveauResponsable: userRole === 'MENTOR' ? validated.niveauResponsable || null : null,
        serieResponsable: userRole === 'MENTOR' && (validated.niveauResponsable === 'PREMIERE' || validated.niveauResponsable === 'TERMINALE') ? validated.serieResponsable || null : null,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        status: true,
        niveau: true,
        serie: true,
        niveauResponsable: true,
        serieResponsable: true,
        createdAt: true,
      },
    });

    const tokens = generateTokens({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'REGISTER',
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
        details: JSON.stringify({ email: user.email }),
      },
    });

    // Notify all admins
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true },
    });
    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.id,
          type: 'INFO' as const,
          title: userRole === 'MENTOR' ? 'Nouveau mentor inscrit' : 'Nouvel apprenant inscrit',
          message: `${user.firstName} ${user.lastName} vient de créer un compte ${userRole === 'MENTOR' ? '(Mentor)' : '(Apprenant)'} (${user.email})`,
        })),
      });
    }

    // Only send welcome email for real email addresses
    if (!user.email.endsWith('@edukaflow.local')) {
      await sendEmail(user.email, 'Bienvenue sur EdukaFlow', generateWelcomeEmail(user.firstName));
    }

    res.status(201).json({
      message: 'Compte créé avec succès',
      user,
      autoGeneratedEmail: user.email.endsWith('@edukaflow.local'),
      ...tokens,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Erreur de validation', details: error.errors });
      return;
    }
    logger.error('Erreur register:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

const loginAttempts = new Map<string, { count: number; blockedUntil: number }>();

export const login = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const validated = loginSchema.parse(req.body);

    const attempt = loginAttempts.get(validated.email);
    if (attempt && attempt.blockedUntil > Date.now()) {
      const remaining = Math.ceil((attempt.blockedUntil - Date.now()) / 60000);
      res.status(429).json({ error: `Trop de tentatives. Réessayez dans ${remaining} minutes` });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email: validated.email },
    });

    if (!user) {
      res.status(401).json({ error: 'Email ou mot de passe incorrect' });
      return;
    }

    if (user.status === 'BLOQUE') {
      res.status(403).json({ error: 'Compte bloqué. Contactez l\'administrateur' });
      return;
    }

    if (user.status === 'INACTIF') {
      res.status(403).json({ error: 'Compte inactif. Contactez l\'administrateur' });
      return;
    }

    const isPasswordValid = await bcrypt.compare(validated.password, user.password);

    if (!isPasswordValid) {
      const currentAttempt = loginAttempts.get(validated.email) || { count: 0, blockedUntil: 0 };
      currentAttempt.count += 1;

      if (currentAttempt.count >= 5) {
        currentAttempt.blockedUntil = Date.now() + 15 * 60 * 1000;
        currentAttempt.count = 0;
      }

      loginAttempts.set(validated.email, currentAttempt);

      res.status(401).json({ error: 'Email ou mot de passe incorrect' });
      return;
    }

    loginAttempts.delete(validated.email);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    const tokens = generateTokens({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
      },
    });

    const { password, ...userWithoutPassword } = user;

    res.json({
      message: 'Connexion réussie',
      user: userWithoutPassword,
      ...tokens,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Erreur de validation', details: error.errors });
      return;
    }
    logger.error('Erreur login:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'LOGOUT',
          ipAddress: req.ip || null,
          userAgent: req.get('user-agent') || null,
        },
      });
    }

    res.json({ message: 'Déconnexion réussie' });
  } catch (error) {
    logger.error('Erreur logout:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const refreshToken = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      res.status(400).json({ error: 'Refresh token requis' });
      return;
    }

    try {
      const decoded = jwt.verify(token, jwtConfig.refreshSecret) as JwtPayload;

      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, email: true, role: true, status: true },
      });

      if (!user || user.status !== 'ACTIF') {
        res.status(401).json({ error: 'Utilisateur non trouvé ou inactif' });
        return;
      }

      const tokens = generateTokens({
        id: user.id,
        email: user.email,
        role: user.role,
      });

      res.json({ message: 'Token rafraîchi', ...tokens });
    } catch (tokenError) {
      res.status(401).json({ error: 'Refresh token invalide ou expiré' });
      return;
    }
  } catch (error) {
    logger.error('Erreur refreshToken:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const forgotPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const validated = forgotPasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: validated.email },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      res.json({ message: 'Si cet email existe, un lien de réinitialisation a été envoyé' });
      return;
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = await bcrypt.hash(resetToken, 12);

    // Store the hashed reset token in the audit log (in production, use a dedicated field or table)
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'FORGOT_PASSWORD',
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
        details: resetTokenHash,
      },
    });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    await sendEmail(user.email, 'Réinitialisation de mot de passe - EdukaFlow', generateResetEmail(resetUrl));

    res.json({ message: 'Si cet email existe, un lien de réinitialisation a été envoyé' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Erreur de validation', details: error.errors });
      return;
    }
    logger.error('Erreur forgotPassword:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const resetPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const validated = resetPasswordSchema.parse(req.body);

    // Find the audit log with the reset token
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        action: 'FORGOT_PASSWORD',
        details: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    let matchedUserId: number | null = null;

    for (const log of auditLogs) {
      if (log.details) {
        const isValid = await bcrypt.compare(validated.token, log.details);
        if (isValid) {
          matchedUserId = log.userId;
          break;
        }
      }
    }

    if (!matchedUserId) {
      res.status(400).json({ error: 'Token invalide ou expiré' });
      return;
    }

    const hashedPassword = await bcrypt.hash(validated.password, 12);

    await prisma.user.update({
      where: { id: matchedUserId },
      data: { password: hashedPassword },
    });

    // Invalidate used token by clearing the details
    await prisma.auditLog.updateMany({
      where: {
        userId: matchedUserId,
        action: 'FORGOT_PASSWORD',
      },
      data: { details: null },
    });

    res.json({ message: 'Mot de passe réinitialisé avec succès' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Erreur de validation', details: error.errors });
      return;
    }
    logger.error('Erreur resetPassword:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }

    const validated = changePasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    const isOldPasswordValid = await bcrypt.compare(validated.oldPassword, user.password);

    if (!isOldPasswordValid) {
      res.status(400).json({ error: 'L\'ancien mot de passe est incorrect' });
      return;
    }

    const hashedPassword = await bcrypt.hash(validated.newPassword, 12);

    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'CHANGE_PASSWORD',
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
      },
    });

    res.json({ message: 'Mot de passe modifié avec succès' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Erreur de validation', details: error.errors });
      return;
    }
    logger.error('Erreur changePassword:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        status: true,
        niveau: true,
        serie: true,
        niveauResponsable: true,
        serieResponsable: true,
        avatar: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            enrollments: true,
            commentaires: true,
            likes: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    res.json({ user });
  } catch (error) {
    logger.error('Erreur getMe:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const updateMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }

    const updateData: any = {};

    if (req.body.firstName) updateData.firstName = req.body.firstName;
    if (req.body.lastName) updateData.lastName = req.body.lastName;
    if (req.body.niveau !== undefined) updateData.niveau = req.body.niveau || null;
    if (req.body.serie !== undefined) updateData.serie = req.body.serie || null;

    if (req.file) {
      updateData.avatar = `/uploads/images/${req.file.filename}`;
    }

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ error: 'Aucune donnée à mettre à jour' });
      return;
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        status: true,
        niveau: true,
        serie: true,
        niveauResponsable: true,
        serieResponsable: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({ message: 'Profil mis à jour', user });
  } catch (error) {
    logger.error('Erreur updateMe:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};
