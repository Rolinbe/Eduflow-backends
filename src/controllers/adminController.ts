import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

const niveauEnum = z.enum(['SIXIEME', 'CINQUIEME', 'QUATRIEME', 'TROISIEME', 'SECONDE', 'PREMIERE', 'TERMINALE']);
const serieEnum = z.enum(['S', 'L', 'OSE']);

const createCoursSchema = z.object({
  title: z.string().min(3, 'Le titre doit contenir au moins 3 caractères'),
  description: z.string().optional(),
  categoryId: z.number().int().positive().optional(),
  status: z.enum(['PUBLIE', 'BROUILLON', 'ARCHIVE']).optional(),
  niveau: niveauEnum.nullable().optional(),
  serie: serieEnum.nullable().optional(),
});

const updateCoursSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  niveau: niveauEnum.nullable().optional(),
  serie: serieEnum.nullable().optional(),
});

const updateCoursStatusSchema = z.object({
  status: z.enum(['PUBLIE', 'BROUILLON', 'ARCHIVE']),
});

const createVideoSchema = z.object({
  title: z.string().min(1, 'Titre requis'),
  description: z.string().optional(),
  duration: z.number().int().min(0).optional(),
  position: z.number().int().min(0).optional(),
  isRequired: z.boolean().optional(),
});

const updateVideoSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  duration: z.number().int().min(0).optional(),
  position: z.number().int().min(0).optional(),
  isRequired: z.boolean().optional(),
});

const createPdfSchema = z.object({
  title: z.string().min(1, 'Titre requis'),
  description: z.string().optional(),
  pageCount: z.number().int().min(0).optional(),
  position: z.number().int().min(0).optional(),
});

const updatePdfSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  pageCount: z.number().int().min(0).optional(),
  position: z.number().int().min(0).optional(),
});

const reorderSchema = z.object({
  items: z.array(z.object({
    id: z.number().int().positive(),
    position: z.number().int().min(0),
  })),
});

const updateUserStatusSchema = z.object({
  status: z.enum(['ACTIF', 'INACTIF', 'BLOQUE']),
});

export const getStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const totalStudents = await prisma.user.count({
      where: { role: 'APPRENANT' },
    });

    const totalCourses = await prisma.cours.count();
    const totalVideos = await prisma.video.count();
    const totalPdfs = await prisma.pDF.count();
    const totalEnrollments = await prisma.enrollment.count();

    const enrollments = await prisma.enrollment.findMany({
      select: { progress: true },
    });

    const averageCompletion = enrollments.length > 0
      ? Math.round(enrollments.reduce((sum, e) => sum + e.progress, 0) / enrollments.length)
      : 0;

    const now = new Date();
    const monthlyEnrollments = await prisma.enrollment.count({
      where: {
        enrolledAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), 1),
        },
      },
    });

    const monthlyEnrollmentsChart = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const count = await prisma.enrollment.count({
        where: {
          enrolledAt: { gte: d, lt: nextMonth },
        },
      });
      monthlyEnrollmentsChart.push({ month: d.getMonth() + 1, count });
    }

    const popularCoursesRaw = await prisma.cours.findMany({
      where: { status: 'PUBLIE' },
      select: {
        title: true,
        _count: { select: { enrollments: true } },
      },
      orderBy: { enrollments: { _count: 'desc' } },
      take: 5,
    });
    const popularCourses = popularCoursesRaw.map((c) => ({
      title: c.title,
      enrollments: c._count.enrollments,
    }));

    const recentEnrollments = await prisma.enrollment.findMany({
      take: 10,
      orderBy: { enrolledAt: 'desc' },
      include: {
        user: { select: { firstName: true, lastName: true } },
        cours: { select: { title: true } },
      },
    });
    const recentActivities = recentEnrollments.map((e) => ({
      id: e.id,
      type: 'enrollment' as const,
      message: `${e.user.firstName} ${e.user.lastName} s'est inscrit à "${e.cours.title}"`,
      date: e.enrolledAt,
    }));

    const totalCertificates = await prisma.certificate.count();
    const totalComments = await prisma.commentaire.count();
    const activeCourses = await prisma.cours.count({
      where: { status: 'PUBLIE' },
    });

    res.json({
      stats: {
        totalStudents,
        totalCourses,
        activeCourses,
        totalVideos,
        totalPdfs,
        totalEnrollments,
        averageCompletion,
        newEnrollments: monthlyEnrollments,
        monthlyEnrollments: monthlyEnrollmentsChart,
        popularCourses,
        recentActivities,
        totalCertificates,
        totalComments,
      },
    });
  } catch (error) {
    logger.error('Erreur getStats:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getCours = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      page = '1',
      limit = '20',
      category,
      status,
      search,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (category) {
      where.categoryId = parseInt(category as string);
    }

    if (status) {
      where.status = status as string;
    }

    if (search) {
      where.OR = [
        { title: { contains: search as string } },
        { description: { contains: search as string } },
      ];
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
              modules: true,
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
    logger.error('Erreur getCours:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const createCours = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }

    const validated = createCoursSchema.parse(req.body);

    const course = await prisma.cours.create({
      data: {
        title: validated.title,
        description: validated.description,
        categoryId: validated.categoryId || null,
        adminId: req.user.id,
        status: validated.status || 'BROUILLON',
        niveau: validated.niveau || null,
        serie: (validated.niveau === 'TERMINALE' || validated.niveau === 'PREMIERE') ? validated.serie : null,
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        admin: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    res.status(201).json({ message: 'Cours créé avec succès', course });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Erreur de validation', details: error.errors });
      return;
    }
    logger.error('Erreur createCours:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const updateCours = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const validated = updateCoursSchema.parse(req.body);

    const course = await prisma.cours.findUnique({
      where: { id: parseInt(id) },
    });

    if (!course) {
      res.status(404).json({ error: 'Cours non trouvé' });
      return;
    }

    const updatedCourse = await prisma.cours.update({
      where: { id: parseInt(id) },
      data: validated,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        admin: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    res.json({ message: 'Cours mis à jour', course: updatedCourse });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Erreur de validation', details: error.errors });
      return;
    }
    logger.error('Erreur updateCours:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const deleteCours = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const course = await prisma.cours.findUnique({
      where: { id: parseInt(id) },
      include: {
        videos: true,
        pdfs: true,
        modules: { include: { lessons: true } },
      },
    });

    if (!course) {
      res.status(404).json({ error: 'Cours non trouvé' });
      return;
    }

    // Delete associated files
    const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

    if (course.coverImage) {
      const filePath = path.join(UPLOAD_DIR, course.coverImage);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    for (const video of course.videos) {
      const filePath = path.join(UPLOAD_DIR, video.url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    for (const pdf of course.pdfs) {
      const filePath = path.join(UPLOAD_DIR, pdf.url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await prisma.cours.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: 'Cours supprimé avec succès' });
  } catch (error) {
    logger.error('Erreur deleteCours:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const updateCoursStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const validated = updateCoursStatusSchema.parse(req.body);

    const course = await prisma.cours.findUnique({
      where: { id: parseInt(id) },
    });

    if (!course) {
      res.status(404).json({ error: 'Cours non trouvé' });
      return;
    }

    const updatedCourse = await prisma.cours.update({
      where: { id: parseInt(id) },
      data: { status: validated.status },
    });

    res.json({ message: `Statut du cours mis à jour: ${validated.status}`, course: updatedCourse });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Erreur de validation', details: error.errors });
      return;
    }
    logger.error('Erreur updateCoursStatus:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const uploadVideo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: 'Fichier vidéo requis' });
      return;
    }

    const course = await prisma.cours.findUnique({
      where: { id: parseInt(id) },
    });

    if (!course) {
      res.status(404).json({ error: 'Cours non trouvé' });
      return;
    }

    const maxPosition = await prisma.video.aggregate({
      where: { courseId: parseInt(id) },
      _max: { position: true },
    });

    const nextPosition = (maxPosition._max.position ?? -1) + 1;

    const videoData = {
      title: req.body.title || file.originalname,
      description: req.body.description || null,
      url: `videos/${file.filename}`,
      duration: req.body.duration ? parseInt(req.body.duration) : 0,
      position: req.body.position ? parseInt(req.body.position) : nextPosition,
      isRequired: req.body.isRequired !== 'false',
      courseId: parseInt(id),
    };

    const video = await prisma.video.create({
      data: videoData,
    });

    res.status(201).json({ message: 'Vidéo uploadée avec succès', video });
  } catch (error) {
    logger.error('Erreur uploadVideo:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const updateVideo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { videoId } = req.params;
    const validated = updateVideoSchema.parse(req.body);

    const video = await prisma.video.findUnique({
      where: { id: parseInt(videoId) },
    });

    if (!video) {
      res.status(404).json({ error: 'Vidéo non trouvée' });
      return;
    }

    const updatedVideo = await prisma.video.update({
      where: { id: parseInt(videoId) },
      data: validated,
    });

    res.json({ message: 'Vidéo mise à jour', video: updatedVideo });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Erreur de validation', details: error.errors });
      return;
    }
    logger.error('Erreur updateVideo:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const deleteVideo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { videoId } = req.params;

    const video = await prisma.video.findUnique({
      where: { id: parseInt(videoId) },
    });

    if (!video) {
      res.status(404).json({ error: 'Vidéo non trouvée' });
      return;
    }

    // Delete file
    const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
    const filePath = path.join(UPLOAD_DIR, video.url);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await prisma.video.delete({
      where: { id: parseInt(videoId) },
    });

    res.json({ message: 'Vidéo supprimée avec succès' });
  } catch (error) {
    logger.error('Erreur deleteVideo:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const reorderVideos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const validated = reorderSchema.parse(req.body);

    const updatePromises = validated.items.map((item) =>
      prisma.video.updateMany({
        where: {
          id: item.id,
          courseId: parseInt(id),
        },
        data: { position: item.position },
      })
    );

    await Promise.all(updatePromises);

    const videos = await prisma.video.findMany({
      where: { courseId: parseInt(id) },
      orderBy: { position: 'asc' },
    });

    res.json({ message: 'Ordre des vidéos mis à jour', videos });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Erreur de validation', details: error.errors });
      return;
    }
    logger.error('Erreur reorderVideos:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const uploadPdf = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: 'Fichier PDF requis' });
      return;
    }

    const course = await prisma.cours.findUnique({
      where: { id: parseInt(id) },
    });

    if (!course) {
      res.status(404).json({ error: 'Cours non trouvé' });
      return;
    }

    const maxPosition = await prisma.pDF.aggregate({
      where: { courseId: parseInt(id) },
      _max: { position: true },
    });

    const nextPosition = (maxPosition._max.position ?? -1) + 1;

    const pdfData = {
      title: req.body.title || file.originalname,
      description: req.body.description || null,
      url: `pdfs/${file.filename}`,
      pageCount: req.body.pageCount ? parseInt(req.body.pageCount) : 0,
      position: req.body.position ? parseInt(req.body.position) : nextPosition,
      courseId: parseInt(id),
    };

    const pdf = await prisma.pDF.create({
      data: pdfData,
    });

    res.status(201).json({ message: 'PDF uploadé avec succès', pdf });
  } catch (error) {
    logger.error('Erreur uploadPdf:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const updatePdf = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { pdfId } = req.params;
    const validated = updatePdfSchema.parse(req.body);

    const pdf = await prisma.pDF.findUnique({
      where: { id: parseInt(pdfId) },
    });

    if (!pdf) {
      res.status(404).json({ error: 'PDF non trouvé' });
      return;
    }

    const updatedPdf = await prisma.pDF.update({
      where: { id: parseInt(pdfId) },
      data: validated,
    });

    res.json({ message: 'PDF mis à jour', pdf: updatedPdf });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Erreur de validation', details: error.errors });
      return;
    }
    logger.error('Erreur updatePdf:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const deletePdf = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { pdfId } = req.params;

    const pdf = await prisma.pDF.findUnique({
      where: { id: parseInt(pdfId) },
    });

    if (!pdf) {
      res.status(404).json({ error: 'PDF non trouvé' });
      return;
    }

    const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
    const filePath = path.join(UPLOAD_DIR, pdf.url);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await prisma.pDF.delete({
      where: { id: parseInt(pdfId) },
    });

    res.json({ message: 'PDF supprimé avec succès' });
  } catch (error) {
    logger.error('Erreur deletePdf:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const reorderPdfs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const validated = reorderSchema.parse(req.body);

    const updatePromises = validated.items.map((item) =>
      prisma.pDF.updateMany({
        where: {
          id: item.id,
          courseId: parseInt(id),
        },
        data: { position: item.position },
      })
    );

    await Promise.all(updatePromises);

    const pdfs = await prisma.pDF.findMany({
      where: { courseId: parseInt(id) },
      orderBy: { position: 'asc' },
    });

    res.json({ message: 'Ordre des PDFs mis à jour', pdfs });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Erreur de validation', details: error.errors });
      return;
    }
    logger.error('Erreur reorderPdfs:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      page = '1',
      limit = '20',
      search,
      status,
      role,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (status) {
      where.status = status as string;
    }

    if (role) {
      where.role = role as string;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search as string } },
        { lastName: { contains: search as string } },
        { email: { contains: search as string } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          status: true,
          niveau: true,
          serie: true,
          avatar: true,
          lastLogin: true,
          createdAt: true,
          _count: {
            select: {
              enrollments: true,
              commentaires: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error('Erreur getUsers:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getUserById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        status: true,
        avatar: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            enrollments: true,
            commentaires: true,
            likes: true,
            certificates: true,
          },
        },
        enrollments: {
          select: {
            id: true,
            progress: true,
            enrolledAt: true,
            cours: {
              select: { id: true, title: true, status: true },
            },
          },
          orderBy: { enrolledAt: 'desc' },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    res.json({ user });
  } catch (error) {
    logger.error('Erreur getUserById:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const updateUserStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const validated = updateUserStatusSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
    });

    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { status: validated.status },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        status: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user?.id || null,
        action: `UPDATE_USER_STATUS_${validated.status}`,
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
        details: JSON.stringify({ targetUserId: parseInt(id), newStatus: validated.status }),
      },
    });

    res.json({ message: `Statut utilisateur mis à jour: ${validated.status}`, user: updatedUser });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Erreur de validation', details: error.errors });
      return;
    }
    logger.error('Erreur updateUserStatus:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getUserProgression = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { userId: parseInt(id) },
      include: {
        cours: {
          select: {
            id: true,
            title: true,
            status: true,
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
      orderBy: { enrolledAt: 'desc' },
    });

    const progressions = await prisma.progression.findMany({
      where: { userId: parseInt(id) },
      include: {
        cours: { select: { id: true, title: true } },
        lesson: { select: { id: true, title: true } },
      },
      orderBy: { lastAccessed: 'desc' },
    });

    const certificates = await prisma.certificate.findMany({
      where: { userId: parseInt(id) },
      include: {
        cours: { select: { id: true, title: true } },
      },
    });

    res.json({
      user,
      enrollments,
      progressions,
      certificates,
    });
  } catch (error) {
    logger.error('Erreur getUserProgression:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getCategories = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
    res.json({ categories });
  } catch (error) {
    logger.error('Erreur getCategories:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
    });

    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    if (user.role === 'ADMIN') {
      res.status(403).json({ error: 'Impossible de supprimer un administrateur' });
      return;
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user?.id || null,
        action: 'DELETE_USER',
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
        details: JSON.stringify({ targetUserId: parseInt(id), email: user.email }),
      },
    });

    await prisma.user.delete({ where: { id: parseInt(id) } });

    res.json({ message: 'Utilisateur supprimé avec succès' });
  } catch (error) {
    logger.error('Erreur deleteUser:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

const resetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .regex(/[A-Z]/, 'Une majuscule requise')
    .regex(/[a-z]/, 'Une minuscule requise')
    .regex(/[0-9]/, 'Un chiffre requis'),
});

export const resetUserPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const validated = resetPasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
    });

    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    if (user.role === 'ADMIN') {
      res.status(403).json({ error: 'Impossible de réinitialiser le mot de passe d\'un administrateur' });
      return;
    }

    const hashedPassword = await bcrypt.hash(validated.newPassword, 12);

    await prisma.user.update({
      where: { id: parseInt(id) },
      data: { password: hashedPassword },
    });

    // Notify the user
    await prisma.notification.create({
      data: {
        userId: parseInt(id),
        type: 'WARNING',
        title: 'Mot de passe réinitialisé',
        message: 'Votre mot de passe a été réinitialisé par l\'administrateur. Veuillez vous connecter avec le nouveau mot de passe.',
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user?.id || null,
        action: 'RESET_USER_PASSWORD',
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
        details: JSON.stringify({ targetUserId: parseInt(id), email: user.email }),
      },
    });

    res.json({ message: 'Mot de passe réinitialisé avec succès' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Erreur de validation', details: error.errors });
      return;
    }
    logger.error('Erreur resetUserPassword:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const getAdminNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Non authentifié' }); return; }

    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    res.json({ notifications, unreadCount });
  } catch (error) {
    logger.error('Erreur getAdminNotifications:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const markAdminNotificationRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Non authentifié' }); return; }
    const { id } = req.params;

    await prisma.notification.updateMany({
      where: { id: parseInt(id), userId: req.user.id },
      data: { isRead: true },
    });

    res.json({ message: 'Notification marquée comme lue' });
  } catch (error) {
    logger.error('Erreur markAdminNotificationRead:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const markAllAdminNotificationsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Non authentifié' }); return; }

    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true },
    });

    res.json({ message: 'Toutes les notifications marquées comme lues' });
  } catch (error) {
    logger.error('Erreur markAllAdminNotificationsRead:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

const createAnnouncementSchema = z.object({
  title: z.string().min(3, 'Le titre doit contenir au moins 3 caractères'),
  content: z.string().min(10, 'Le contenu doit contenir au moins 10 caractères'),
});

export const getAnnouncements = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const announcements = await prisma.announcement.findMany({
      include: {
        admin: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ announcements });
  } catch (error) {
    logger.error('Erreur getAnnouncements:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const createAnnouncement = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Non authentifié' }); return; }
    const validated = createAnnouncementSchema.parse(req.body);

    const announcement = await prisma.announcement.create({
      data: {
        title: validated.title,
        content: validated.content,
        adminId: req.user.id,
      },
      include: {
        admin: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const students = await prisma.user.findMany({
      where: { role: 'APPRENANT', status: 'ACTIF' },
      select: { id: true },
    });

    if (students.length > 0) {
      await prisma.notification.createMany({
        data: students.map((s) => ({
          userId: s.id,
          type: 'ANNONCE' as const,
          title: validated.title,
          message: validated.content,
        })),
      });
    }

    res.status(201).json({ message: 'Annonce publiée avec succès', announcement });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Erreur de validation', details: error.errors });
      return;
    }
    logger.error('Erreur createAnnouncement:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

export const deleteAnnouncement = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const announcement = await prisma.announcement.findUnique({ where: { id: parseInt(id) } });

    if (!announcement) {
      res.status(404).json({ error: 'Annonce non trouvée' });
      return;
    }

    await prisma.announcement.delete({ where: { id: parseInt(id) } });
    res.json({ message: 'Annonce supprimée avec succès' });
  } catch (error) {
    logger.error('Erreur deleteAnnouncement:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};
