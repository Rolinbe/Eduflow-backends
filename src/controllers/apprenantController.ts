import { Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { sendEmail, generateCertificateEmail } from '../utils/email';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

const createCommentSchema = z.object({
  content: z.string().min(1, 'Le commentaire ne peut pas être vide').max(5000),
  lessonId: z.number().int().positive().optional(),
});

const replyCommentSchema = z.object({
  content: z.string().min(1, 'La réponse ne peut pas être vide').max(5000),
});

const updateProgressSchema = z.object({
  timeSpent: z.number().int().min(0).optional(),
  position: z.number().int().min(0).optional(),
});

const videoProgressSchema = z.object({
  currentTime: z.number().min(0),
  duration: z.number().min(1),
  timeSpent: z.number().int().min(0).optional(),
});

export const getAvailableCours = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      page = '1',
      limit = '20',
      category,
      search,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      status: 'PUBLIE',
    };

    if (category) {
      where.categoryId = parseInt(category as string);
    }

    if (search) {
      where.OR = [
        { title: { contains: search as string } },
        { description: { contains: search as string } },
      ];
    }

    if (req.user) {
      const student = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { niveau: true, serie: true },
      });

      if (student?.niveau) {
        if (student.niveau === 'PREMIERE' || student.niveau === 'TERMINALE') {
          where.AND = [
            { niveau: student.niveau },
            {
              OR: [
                { serie: student.serie },
                { serie: null },
              ],
            },
          ];
        } else {
          where.niveau = student.niveau;
        }
      }
    }

    const [courses, total] = await Promise.all([
      prisma.cours.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          admin: { select: { id: true, firstName: true, lastName: true } },
          _count: {
            select: {
              videos: true,
              pdfs: true,
              enrollments: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.cours.count({ where }),
    ]);

    res.json({
      courses,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error('Erreur getAvailableCours:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getCoursDetail = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const course = await prisma.cours.findUnique({
      where: { id: parseInt(id), status: 'PUBLIE' },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        admin: { select: { id: true, firstName: true, lastName: true } },
        videos: { orderBy: { position: 'asc' } },
        pdfs: { orderBy: { position: 'asc' } },
        modules: {
          include: {
            lessons: { orderBy: { position: 'asc' } },
          },
          orderBy: { position: 'asc' },
        },
        _count: {
          select: {
            enrollments: true,
            commentaires: true,
          },
        },
      },
    });

    if (!course) {
      res.status(404).json({ error: 'Cours non trouvé' });
      return;
    }

    let enrollment = null;
    if (userId) {
      enrollment = await prisma.enrollment.findUnique({
        where: {
          userId_courseId: { userId, courseId: parseInt(id) },
        },
      });
    }

    res.json({ course, enrollment });
  } catch (error) {
    logger.error('Erreur getCoursDetail:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const enrollInCours = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }

    const { id } = req.params;

    const course = await prisma.cours.findUnique({
      where: { id: parseInt(id), status: 'PUBLIE' },
    });

    if (!course) {
      res.status(404).json({ error: 'Cours non trouvé ou non publié' });
      return;
    }

    const existingEnrollment = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: { userId: req.user.id, courseId: parseInt(id) },
      },
    });

    if (existingEnrollment) {
      res.status(409).json({ error: 'Vous êtes déjà inscrit à ce cours' });
      return;
    }

    const enrollment = await prisma.enrollment.create({
      data: {
        userId: req.user.id,
        courseId: parseInt(id),
      },
      include: {
        cours: { select: { id: true, title: true } },
      },
    });

    await prisma.notification.create({
      data: {
        userId: req.user.id,
        type: 'SUCCES',
        title: 'Inscription au cours',
        message: `Vous êtes maintenant inscrit au cours "${course.title}"`,
      },
    });

    res.status(201).json({ message: 'Inscription réussie', enrollment });
  } catch (error) {
    logger.error('Erreur enrollInCours:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getMyCours = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { userId: req.user.id },
      include: {
        cours: {
          include: {
            category: { select: { id: true, name: true, slug: true } },
            _count: {
              select: {
                videos: true,
                pdfs: true,
              },
            },
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });

    res.json({ enrollments });
  } catch (error) {
    logger.error('Erreur getMyCours:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getMyProgression = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }

    const { id } = req.params;

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: { userId: req.user.id, courseId: parseInt(id) },
      },
      include: {
        cours: {
          select: {
            id: true,
            title: true,
            _count: {
              select: {
                videos: true,
                pdfs: true,
                modules: true,
              },
            },
          },
        },
      },
    });

    if (!enrollment) {
      res.status(404).json({ error: 'Inscription non trouvée' });
      return;
    }

    const progressions = await prisma.progression.findMany({
      where: {
        userId: req.user.id,
        coursId: parseInt(id),
      },
      include: {
        lesson: { select: { id: true, title: true, type: true, duration: true } },
      },
      orderBy: { lastAccessed: 'desc' },
    });

    const totalLessons = await prisma.lesson.count({
      where: {
        module: { courseId: parseInt(id) },
      },
    });

    const completedLessons = progressions.filter((p) => p.status === 'TERMINE').length;

    res.json({
      enrollment,
      progressions,
      summary: {
        totalLessons,
        completedLessons,
        progress: enrollment.progress,
        totalTimeSpent: progressions.reduce((sum, p) => sum + p.timeSpent, 0),
      },
    });
  } catch (error) {
    logger.error('Erreur getMyProgression:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const updateVideoProgress = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }

    const { id } = req.params;
    const validated = videoProgressSchema.parse(req.body);

    const lesson = await prisma.lesson.findUnique({
      where: { id: parseInt(id) },
      include: { module: { select: { courseId: true } } },
    });

    if (!lesson) {
      res.status(404).json({ error: 'Leçon non trouvée' });
      return;
    }

    const courseId = lesson.module.courseId;
    const progressPercent = Math.round((validated.currentTime / validated.duration) * 100);
    const status = progressPercent >= 80 ? 'TERMINE' : 'EN_COURS';

    const existingProgression = await prisma.progression.findFirst({
      where: {
        userId: req.user.id,
        coursId: courseId,
        lessonId: parseInt(id),
      },
    });

    let progression;

    if (existingProgression) {
      progression = await prisma.progression.update({
        where: { id: existingProgression.id },
        data: {
          status,
          timeSpent: validated.timeSpent || existingProgression.timeSpent,
          position: Math.round(validated.currentTime),
          lastAccessed: new Date(),
        },
      });
    } else {
      progression = await prisma.progression.create({
        data: {
          userId: req.user.id,
          coursId: courseId,
          lessonId: parseInt(id),
          status,
          timeSpent: validated.timeSpent || 0,
          position: Math.round(validated.currentTime),
          lastAccessed: new Date(),
        },
      });
    }

    // Update overall course progress
    const allLessons = await prisma.lesson.findMany({
      where: { module: { courseId } },
    });

    const completedProgressions = await prisma.progression.count({
      where: {
        userId: req.user.id,
        coursId: courseId,
        status: 'TERMINE',
      },
    });

    const courseProgress = allLessons.length > 0
      ? Math.round((completedProgressions / allLessons.length) * 100)
      : 0;

    await prisma.enrollment.update({
      where: {
        userId_courseId: { userId: req.user.id, courseId },
      },
      data: { progress: courseProgress },
    });

    // Auto-generate certificate if 100% completion
    if (courseProgress === 100) {
      const existingCert = await prisma.certificate.findUnique({
        where: {
          userId_coursId: { userId: req.user.id, coursId: courseId },
        },
      });

      if (!existingCert) {
        const uniqueNumber = `EDU-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const verificationKey = crypto.randomBytes(32).toString('hex');

        await prisma.certificate.create({
          data: {
            userId: req.user.id,
            coursId: courseId,
            uniqueNumber,
            verificationKey,
            status: 'VALIDE',
          },
        });

        const cours = await prisma.cours.findUnique({
          where: { id: courseId },
          select: { title: true },
        });

        const user = await prisma.user.findUnique({
          where: { id: req.user.id },
          select: { firstName: true, email: true },
        });

        await prisma.notification.create({
          data: {
            userId: req.user.id,
            type: 'CERTIFICAT',
            title: 'Certificat obtenu',
            message: `Félicitations ! Vous avez obtenu le certificat pour "${cours?.title}"`,
          },
        });

        if (user) {
          await sendEmail(
            user.email,
            'Certificat obtenu - EdukaFlow',
            generateCertificateEmail(user.firstName, cours?.title || '', uniqueNumber)
          );
        }
      }
    }

    res.json({ progression, courseProgress, status });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Erreur de validation', details: error.errors });
      return;
    }
    logger.error('Erreur updateVideoProgress:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const updatePdfProgress = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }

    const { id } = req.params;

    const lesson = await prisma.lesson.findUnique({
      where: { id: parseInt(id) },
      include: { module: { select: { courseId: true } } },
    });

    if (!lesson) {
      res.status(404).json({ error: 'Leçon non trouvée' });
      return;
    }

    const courseId = lesson.module.courseId;

    const existingProgression = await prisma.progression.findFirst({
      where: {
        userId: req.user.id,
        coursId: courseId,
        lessonId: parseInt(id),
      },
    });

    let progression;

    if (existingProgression) {
      progression = await prisma.progression.update({
        where: { id: existingProgression.id },
        data: {
          status: 'TERMINE',
          lastAccessed: new Date(),
        },
      });
    } else {
      progression = await prisma.progression.create({
        data: {
          userId: req.user.id,
          coursId: courseId,
          lessonId: parseInt(id),
          status: 'TERMINE',
          lastAccessed: new Date(),
        },
      });
    }

    // Update enrollment progress
    const allLessons = await prisma.lesson.findMany({
      where: { module: { courseId } },
    });

    const completedProgressions = await prisma.progression.count({
      where: {
        userId: req.user.id,
        coursId: courseId,
        status: 'TERMINE',
      },
    });

    const courseProgress = allLessons.length > 0
      ? Math.round((completedProgressions / allLessons.length) * 100)
      : 0;

    await prisma.enrollment.update({
      where: {
        userId_courseId: { userId: req.user.id, courseId },
      },
      data: { progress: courseProgress },
    });

    res.json({ progression, courseProgress });
  } catch (error) {
    logger.error('Erreur updatePdfProgress:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getGlobalProgression = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { userId: req.user.id },
      include: {
        cours: {
          select: {
            id: true,
            title: true,
            coverImage: true,
            _count: {
              select: { videos: true, pdfs: true },
            },
          },
        },
      },
    });

    const totalEnrolled = enrollments.length;
    const completedCourses = enrollments.filter((e) => e.progress === 100).length;
    const inProgressCourses = enrollments.filter((e) => e.progress > 0 && e.progress < 100).length;
    const notStarted = enrollments.filter((e) => e.progress === 0).length;
    const averageProgress = totalEnrolled > 0
      ? Math.round(enrollments.reduce((sum, e) => sum + e.progress, 0) / totalEnrolled)
      : 0;

    const totalTimeSpent = await prisma.progression.aggregate({
      where: { userId: req.user.id },
      _sum: { timeSpent: true },
    });

    const totalCertificates = await prisma.certificate.count({
      where: { userId: req.user.id, status: 'VALIDE' },
    });

    const recentProgressions = await prisma.progression.findMany({
      where: { userId: req.user.id },
      include: {
        cours: { select: { id: true, title: true } },
        lesson: { select: { id: true, title: true, type: true } },
      },
      orderBy: { lastAccessed: 'desc' },
      take: 10,
    });

    res.json({
      summary: {
        totalEnrolled,
        completedCourses,
        inProgressCourses,
        notStarted,
        averageProgress,
        totalTimeSpent: totalTimeSpent._sum.timeSpent || 0,
        totalCertificates,
      },
      enrollments,
      recentProgressions,
    });
  } catch (error) {
    logger.error('Erreur getGlobalProgression:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getCommentaires = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { page = '1', limit = '50' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    const commentaires = await prisma.commentaire.findMany({
      where: {
        coursId: parseInt(id),
        parentId: null, // Only root comments
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
        replies: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, avatar: true },
            },
            likes: {
              select: { userId: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        likes: {
          select: { userId: true },
        },
        _count: {
          select: { likes: true, replies: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
    });

    const total = await prisma.commentaire.count({
      where: {
        coursId: parseInt(id),
        parentId: null,
      },
    });

    res.json({
      commentaires,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error('Erreur getCommentaires:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const createCommentaire = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }

    const { id } = req.params;
    const validated = createCommentSchema.parse(req.body);

    const course = await prisma.cours.findUnique({
      where: { id: parseInt(id) },
    });

    if (!course) {
      res.status(404).json({ error: 'Cours non trouvé' });
      return;
    }

    let lessonId: number | null = null;
    if (validated.lessonId) {
      const lesson = await prisma.lesson.findUnique({
        where: { id: validated.lessonId },
        include: { module: { select: { courseId: true } } },
      });

      if (!lesson || lesson.module.courseId !== parseInt(id)) {
        res.status(400).json({ error: 'Leçon invalide pour ce cours' });
        return;
      }
      lessonId = validated.lessonId;
    }

    const commentaire = await prisma.commentaire.create({
      data: {
        content: validated.content,
        userId: req.user.id,
        coursId: parseInt(id),
        lessonId,
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
        _count: { select: { likes: true, replies: true } },
      },
    });

    res.status(201).json({ message: 'Commentaire créé', commentaire });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Erreur de validation', details: error.errors });
      return;
    }
    logger.error('Erreur createCommentaire:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const replyToCommentaire = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }

    const { commentId } = req.params;
    const validated = replyCommentSchema.parse(req.body);

    const parentComment = await prisma.commentaire.findUnique({
      where: { id: parseInt(commentId) },
    });

    if (!parentComment) {
      res.status(404).json({ error: 'Commentaire non trouvé' });
      return;
    }

    const reply = await prisma.commentaire.create({
      data: {
        content: validated.content,
        userId: req.user.id,
        coursId: parentComment.coursId,
        lessonId: parentComment.lessonId,
        parentId: parseInt(commentId),
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
        _count: { select: { likes: true, replies: true } },
      },
    });

    res.status(201).json({ message: 'Réponse créée', commentaire: reply });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Erreur de validation', details: error.errors });
      return;
    }
    logger.error('Erreur replyToCommentaire:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const likeCommentaire = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }

    const { commentId } = req.params;

    const commentaire = await prisma.commentaire.findUnique({
      where: { id: parseInt(commentId) },
    });

    if (!commentaire) {
      res.status(404).json({ error: 'Commentaire non trouvé' });
      return;
    }

    const existingLike = await prisma.like.findUnique({
      where: {
        userId_commentaireId: {
          userId: req.user.id,
          commentaireId: parseInt(commentId),
        },
      },
    });

    if (existingLike) {
      await prisma.like.delete({
        where: { id: existingLike.id },
      });

      const likesCount = await prisma.like.count({
        where: { commentaireId: parseInt(commentId) },
      });

      res.json({ message: 'Like retiré', liked: false, likesCount });
    } else {
      await prisma.like.create({
        data: {
          userId: req.user.id,
          commentaireId: parseInt(commentId),
        },
      });

      const likesCount = await prisma.like.count({
        where: { commentaireId: parseInt(commentId) },
      });

      res.json({ message: 'Like ajouté', liked: true, likesCount });
    }
  } catch (error) {
    logger.error('Erreur likeCommentaire:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }

    const { page = '1', limit = '20' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.notification.count({
        where: { userId: req.user.id },
      }),
      prisma.notification.count({
        where: { userId: req.user.id, isRead: false },
      }),
    ]);

    res.json({
      notifications,
      unreadCount,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error('Erreur getNotifications:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const markNotificationRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }

    const { id } = req.params;

    const notification = await prisma.notification.findUnique({
      where: { id: parseInt(id) },
    });

    if (!notification) {
      res.status(404).json({ error: 'Notification non trouvée' });
      return;
    }

    if (notification.userId !== req.user.id) {
      res.status(403).json({ error: 'Accès interdit' });
      return;
    }

    await prisma.notification.update({
      where: { id: parseInt(id) },
      data: { isRead: true },
    });

    res.json({ message: 'Notification marquée comme lue' });
  } catch (error) {
    logger.error('Erreur markNotificationRead:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const markAllNotificationsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }

    await prisma.notification.updateMany({
      where: {
        userId: req.user.id,
        isRead: false,
      },
      data: { isRead: true },
    });

    res.json({ message: 'Toutes les notifications marquées comme lues' });
  } catch (error) {
    logger.error('Erreur markAllNotificationsRead:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getCertificate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }

    const { id } = req.params;

    const certificate = await prisma.certificate.findFirst({
      where: {
        userId: req.user.id,
        coursId: parseInt(id),
        status: 'VALIDE',
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        cours: { select: { id: true, title: true } },
      },
    });

    if (!certificate) {
      res.status(404).json({ error: 'Certificat non trouvé' });
      return;
    }

    res.json({ certificate });
  } catch (error) {
    logger.error('Erreur getCertificate:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getMyCertificates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }

    const certificates = await prisma.certificate.findMany({
      where: { userId: req.user.id },
      include: {
        cours: { select: { id: true, title: true, coverImage: true } },
      },
      orderBy: { issuedAt: 'desc' },
    });

    res.json({ certificates });
  } catch (error) {
    logger.error('Erreur getMyCertificates:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const verifyCertificate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { uniqueNumber } = req.params;

    const certificate = await prisma.certificate.findUnique({
      where: { uniqueNumber },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        cours: { select: { id: true, title: true } },
      },
    });

    if (!certificate) {
      res.status(404).json({ error: 'Certificat non trouvé', valid: false });
      return;
    }

    res.json({
      valid: certificate.status === 'VALIDE',
      certificate: {
        uniqueNumber: certificate.uniqueNumber,
        status: certificate.status,
        issuedAt: certificate.issuedAt,
        student: `${certificate.user.firstName} ${certificate.user.lastName}`,
        course: certificate.cours.title,
      },
    });
  } catch (error) {
    logger.error('Erreur verifyCertificate:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getCategories = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        _count: {
          select: { cours: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json({ categories });
  } catch (error) {
    logger.error('Erreur getCategories:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getAnnouncements = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const announcements = await prisma.announcement.findMany({
      include: {
        admin: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json({ announcements });
  } catch (error) {
    logger.error('Erreur getAnnouncements:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};
