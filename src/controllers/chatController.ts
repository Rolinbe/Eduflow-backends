import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import winston from 'winston';
import { AuthRequest } from '../types';

const prisma = new PrismaClient();
const logger = winston.createLogger({ level: 'info', format: winston.format.json(), transports: [new winston.transports.Console()] });

export const getConversations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Non authentifié' }); return; }
    const userId = req.user.id;

    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { participant1Id: userId },
          { participant2Id: userId },
        ],
      },
      include: {
        participant1: { select: { id: true, firstName: true, lastName: true, role: true, avatar: true } },
        participant2: { select: { id: true, firstName: true, lastName: true, role: true, avatar: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    const result = await Promise.all(conversations.map(async (conv) => {
      const otherUser = conv.participant1Id === userId ? conv.participant2 : conv.participant1;
      const unreadCount = await prisma.message.count({
        where: {
          conversationId: conv.id,
          senderId: { not: userId },
          status: { not: 'READ' },
        },
      });
      return {
        id: conv.id,
        otherUser,
        lastMessage: conv.messages[0] || null,
        unreadCount,
        updatedAt: conv.lastMessageAt,
      };
    }));

    res.json({ conversations: result });
  } catch (error) {
    logger.error('Erreur getConversations:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getOrCreateConversation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Non authentifié' }); return; }
    const userId = req.user.id;
    const { targetUserId } = req.body;

    if (!targetUserId) { res.status(400).json({ error: 'targetUserId requis' }); return; }

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) { res.status(404).json({ error: 'Utilisateur non trouvé' }); return; }

    const p1 = Math.min(userId, targetUserId);
    const p2 = Math.max(userId, targetUserId);

    let conversation = await prisma.conversation.findUnique({
      where: { participant1Id_participant2Id: { participant1Id: p1, participant2Id: p2 } },
      include: {
        participant1: { select: { id: true, firstName: true, lastName: true, role: true, avatar: true } },
        participant2: { select: { id: true, firstName: true, lastName: true, role: true, avatar: true } },
      },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { participant1Id: p1, participant2Id: p2 },
        include: {
          participant1: { select: { id: true, firstName: true, lastName: true, role: true, avatar: true } },
          participant2: { select: { id: true, firstName: true, lastName: true, role: true, avatar: true } },
        },
      });
    }

    const otherUser = conversation.participant1Id === userId ? conversation.participant2 : conversation.participant1;
    res.json({ conversation: { ...conversation, otherUser } });
  } catch (error) {
    logger.error('Erreur getOrCreateConversation:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getMessages = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Non authentifié' }); return; }
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = 50;
    const skip = (page - 1) * limit;

    const conversation = await prisma.conversation.findUnique({ where: { id: parseInt(id) } });
    if (!conversation) { res.status(404).json({ error: 'Conversation non trouvée' }); return; }
    if (conversation.participant1Id !== req.user.id && conversation.participant2Id !== req.user.id) {
      res.status(403).json({ error: 'Accès interdit' }); return;
    }

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { conversationId: parseInt(id) },
        include: { sender: { select: { id: true, firstName: true, lastName: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.message.count({ where: { conversationId: parseInt(id) } }),
    ]);

    res.json({
      messages: messages.reverse(),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Erreur getMessages:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getUnreadCount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Non authentifié' }); return; }
    const userId = req.user.id;

    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [{ participant1Id: userId }, { participant2Id: userId }],
      },
      select: { id: true },
    });

    let totalUnread = 0;
    for (const conv of conversations) {
      const count = await prisma.message.count({
        where: {
          conversationId: conv.id,
          senderId: { not: userId },
          status: { not: 'READ' },
        },
      });
      totalUnread += count;
    }

    res.json({ unreadCount: totalUnread });
  } catch (error) {
    logger.error('Erreur getUnreadCount:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getAllStudents = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || (req.user.role !== 'ADMIN' && req.user.role !== 'MENTOR')) {
      res.status(403).json({ error: 'Accès interdit' }); return;
    }

    const where: any = { role: 'APPRENANT' };

    // Mentors only see students in their niveau
    if (req.user.role === 'MENTOR') {
      const mentor = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { niveauResponsable: true, serieResponsable: true },
      });
      if (mentor?.niveauResponsable) {
        where.niveau = mentor.niveauResponsable;
        if ((mentor.niveauResponsable === 'PREMIERE' || mentor.niveauResponsable === 'TERMINALE') && mentor.serieResponsable) {
          where.serie = mentor.serieResponsable;
        }
      }
    }

    const students = await prisma.user.findMany({
      where,
      select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
      orderBy: { firstName: 'asc' },
    });

    res.json({ students });
  } catch (error) {
    logger.error('Erreur getAllStudents:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getAdminUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Non authentifié' }); return; }

    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
    });

    if (!admin) { res.status(404).json({ error: 'Aucun admin trouvé' }); return; }
    res.json({ admin });
  } catch (error) {
    logger.error('Erreur getAdminUser:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};
