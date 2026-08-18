import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest, JwtPayload } from '../types';
import { jwtConfig } from '../config/jwt';
import prisma from '../config/prisma';

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Token d\'authentification requis' });
      return;
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, jwtConfig.secret) as JwtPayload;

      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, email: true, role: true, status: true },
      });

      if (!user) {
        res.status(401).json({ error: 'Utilisateur non trouvé' });
        return;
      }

      if (user.status !== 'ACTIF') {
        res.status(403).json({ error: 'Compte désactivé ou bloqué' });
        return;
      }

      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
      };

      next();
    } catch (tokenError) {
      res.status(401).json({ error: 'Token invalide ou expiré' });
      return;
    }
  } catch (error) {
    res.status(500).json({ error: 'Erreur interne du serveur' });
    return;
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Accès interdit - permissions insuffisantes' });
      return;
    }

    next();
  };
};

export const adminOnly = authorize('ADMIN');
export const apprenantOrAdmin = authorize('APPRENANT', 'ADMIN');
