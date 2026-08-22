"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnnouncements = exports.getCategories = exports.verifyCertificate = exports.getMyCertificates = exports.getCertificate = exports.markAllNotificationsRead = exports.markNotificationRead = exports.getNotifications = exports.likeCommentaire = exports.replyToCommentaire = exports.createCommentaire = exports.getCommentaires = exports.getGlobalProgression = exports.updatePdfProgress = exports.updateVideoProgress = exports.getMyProgression = exports.getMyCours = exports.enrollInCours = exports.getCoursDetail = exports.getAvailableCours = void 0;
const zod_1 = require("zod");
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = __importDefault(require("../config/prisma"));
const email_1 = require("../utils/email");
const winston_1 = __importDefault(require("winston"));
const logger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    transports: [new winston_1.default.transports.Console()],
});
const createCommentSchema = zod_1.z.object({
    content: zod_1.z.string().min(1, 'Le commentaire ne peut pas être vide').max(5000),
    lessonId: zod_1.z.number().int().positive().optional(),
});
const replyCommentSchema = zod_1.z.object({
    content: zod_1.z.string().min(1, 'La réponse ne peut pas être vide').max(5000),
});
const updateProgressSchema = zod_1.z.object({
    timeSpent: zod_1.z.number().int().min(0).optional(),
    position: zod_1.z.number().int().min(0).optional(),
});
const videoProgressSchema = zod_1.z.object({
    currentTime: zod_1.z.number().min(0),
    duration: zod_1.z.number().min(1),
    timeSpent: zod_1.z.number().int().min(0).optional(),
});
const getAvailableCours = async (req, res) => {
    try {
        const { page = '1', limit = '20', category, search, } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;
        const where = {
            status: 'PUBLIE',
        };
        if (category) {
            where.categoryId = parseInt(category);
        }
        if (search) {
            where.OR = [
                { title: { contains: search } },
                { description: { contains: search } },
            ];
        }
        if (req.user) {
            const student = await prisma_1.default.user.findUnique({
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
                }
                else {
                    where.niveau = student.niveau;
                }
            }
        }
        const [courses, total] = await Promise.all([
            prisma_1.default.cours.findMany({
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
            prisma_1.default.cours.count({ where }),
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
    }
    catch (error) {
        logger.error('Erreur getAvailableCours:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getAvailableCours = getAvailableCours;
const getCoursDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const course = await prisma_1.default.cours.findUnique({
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
            enrollment = await prisma_1.default.enrollment.findUnique({
                where: {
                    userId_courseId: { userId, courseId: parseInt(id) },
                },
            });
        }
        res.json({ course, enrollment });
    }
    catch (error) {
        logger.error('Erreur getCoursDetail:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getCoursDetail = getCoursDetail;
const enrollInCours = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const { id } = req.params;
        const course = await prisma_1.default.cours.findUnique({
            where: { id: parseInt(id), status: 'PUBLIE' },
        });
        if (!course) {
            res.status(404).json({ error: 'Cours non trouvé ou non publié' });
            return;
        }
        const existingEnrollment = await prisma_1.default.enrollment.findUnique({
            where: {
                userId_courseId: { userId: req.user.id, courseId: parseInt(id) },
            },
        });
        if (existingEnrollment) {
            res.status(409).json({ error: 'Vous êtes déjà inscrit à ce cours' });
            return;
        }
        const enrollment = await prisma_1.default.enrollment.create({
            data: {
                userId: req.user.id,
                courseId: parseInt(id),
            },
            include: {
                cours: { select: { id: true, title: true } },
            },
        });
        await prisma_1.default.notification.create({
            data: {
                userId: req.user.id,
                type: 'SUCCES',
                title: 'Inscription au cours',
                message: `Vous êtes maintenant inscrit au cours "${course.title}"`,
            },
        });
        res.status(201).json({ message: 'Inscription réussie', enrollment });
    }
    catch (error) {
        logger.error('Erreur enrollInCours:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.enrollInCours = enrollInCours;
const getMyCours = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const enrollments = await prisma_1.default.enrollment.findMany({
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
    }
    catch (error) {
        logger.error('Erreur getMyCours:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getMyCours = getMyCours;
const getMyProgression = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const { id } = req.params;
        const enrollment = await prisma_1.default.enrollment.findUnique({
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
        const progressions = await prisma_1.default.progression.findMany({
            where: {
                userId: req.user.id,
                coursId: parseInt(id),
            },
            include: {
                lesson: { select: { id: true, title: true, type: true, duration: true } },
            },
            orderBy: { lastAccessed: 'desc' },
        });
        const totalLessons = await prisma_1.default.lesson.count({
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
    }
    catch (error) {
        logger.error('Erreur getMyProgression:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getMyProgression = getMyProgression;
const updateVideoProgress = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const { id } = req.params;
        const validated = videoProgressSchema.parse(req.body);
        const lesson = await prisma_1.default.lesson.findUnique({
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
        const existingProgression = await prisma_1.default.progression.findFirst({
            where: {
                userId: req.user.id,
                coursId: courseId,
                lessonId: parseInt(id),
            },
        });
        let progression;
        if (existingProgression) {
            progression = await prisma_1.default.progression.update({
                where: { id: existingProgression.id },
                data: {
                    status,
                    timeSpent: validated.timeSpent || existingProgression.timeSpent,
                    position: Math.round(validated.currentTime),
                    lastAccessed: new Date(),
                },
            });
        }
        else {
            progression = await prisma_1.default.progression.create({
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
        const allLessons = await prisma_1.default.lesson.findMany({
            where: { module: { courseId } },
        });
        const completedProgressions = await prisma_1.default.progression.count({
            where: {
                userId: req.user.id,
                coursId: courseId,
                status: 'TERMINE',
            },
        });
        const courseProgress = allLessons.length > 0
            ? Math.round((completedProgressions / allLessons.length) * 100)
            : 0;
        await prisma_1.default.enrollment.update({
            where: {
                userId_courseId: { userId: req.user.id, courseId },
            },
            data: { progress: courseProgress },
        });
        // Auto-generate certificate if 100% completion
        if (courseProgress === 100) {
            const existingCert = await prisma_1.default.certificate.findUnique({
                where: {
                    userId_coursId: { userId: req.user.id, coursId: courseId },
                },
            });
            if (!existingCert) {
                const uniqueNumber = `EDU-${Date.now()}-${crypto_1.default.randomBytes(4).toString('hex').toUpperCase()}`;
                const verificationKey = crypto_1.default.randomBytes(32).toString('hex');
                await prisma_1.default.certificate.create({
                    data: {
                        userId: req.user.id,
                        coursId: courseId,
                        uniqueNumber,
                        verificationKey,
                        status: 'VALIDE',
                    },
                });
                const cours = await prisma_1.default.cours.findUnique({
                    where: { id: courseId },
                    select: { title: true },
                });
                const user = await prisma_1.default.user.findUnique({
                    where: { id: req.user.id },
                    select: { firstName: true, email: true },
                });
                await prisma_1.default.notification.create({
                    data: {
                        userId: req.user.id,
                        type: 'CERTIFICAT',
                        title: 'Certificat obtenu',
                        message: `Félicitations ! Vous avez obtenu le certificat pour "${cours?.title}"`,
                    },
                });
                if (user) {
                    await (0, email_1.sendEmail)(user.email, 'Certificat obtenu - EdukaFlow', (0, email_1.generateCertificateEmail)(user.firstName, cours?.title || '', uniqueNumber));
                }
            }
        }
        res.json({ progression, courseProgress, status });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Erreur de validation', details: error.errors });
            return;
        }
        logger.error('Erreur updateVideoProgress:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.updateVideoProgress = updateVideoProgress;
const updatePdfProgress = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const { id } = req.params;
        const lesson = await prisma_1.default.lesson.findUnique({
            where: { id: parseInt(id) },
            include: { module: { select: { courseId: true } } },
        });
        if (!lesson) {
            res.status(404).json({ error: 'Leçon non trouvée' });
            return;
        }
        const courseId = lesson.module.courseId;
        const existingProgression = await prisma_1.default.progression.findFirst({
            where: {
                userId: req.user.id,
                coursId: courseId,
                lessonId: parseInt(id),
            },
        });
        let progression;
        if (existingProgression) {
            progression = await prisma_1.default.progression.update({
                where: { id: existingProgression.id },
                data: {
                    status: 'TERMINE',
                    lastAccessed: new Date(),
                },
            });
        }
        else {
            progression = await prisma_1.default.progression.create({
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
        const allLessons = await prisma_1.default.lesson.findMany({
            where: { module: { courseId } },
        });
        const completedProgressions = await prisma_1.default.progression.count({
            where: {
                userId: req.user.id,
                coursId: courseId,
                status: 'TERMINE',
            },
        });
        const courseProgress = allLessons.length > 0
            ? Math.round((completedProgressions / allLessons.length) * 100)
            : 0;
        await prisma_1.default.enrollment.update({
            where: {
                userId_courseId: { userId: req.user.id, courseId },
            },
            data: { progress: courseProgress },
        });
        res.json({ progression, courseProgress });
    }
    catch (error) {
        logger.error('Erreur updatePdfProgress:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.updatePdfProgress = updatePdfProgress;
const getGlobalProgression = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const enrollments = await prisma_1.default.enrollment.findMany({
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
        const totalTimeSpent = await prisma_1.default.progression.aggregate({
            where: { userId: req.user.id },
            _sum: { timeSpent: true },
        });
        const totalCertificates = await prisma_1.default.certificate.count({
            where: { userId: req.user.id, status: 'VALIDE' },
        });
        const recentProgressions = await prisma_1.default.progression.findMany({
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
    }
    catch (error) {
        logger.error('Erreur getGlobalProgression:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getGlobalProgression = getGlobalProgression;
const getCommentaires = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = '1', limit = '50' } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;
        const commentaires = await prisma_1.default.commentaire.findMany({
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
        const total = await prisma_1.default.commentaire.count({
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
    }
    catch (error) {
        logger.error('Erreur getCommentaires:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getCommentaires = getCommentaires;
const createCommentaire = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const { id } = req.params;
        const validated = createCommentSchema.parse(req.body);
        const course = await prisma_1.default.cours.findUnique({
            where: { id: parseInt(id) },
        });
        if (!course) {
            res.status(404).json({ error: 'Cours non trouvé' });
            return;
        }
        let lessonId = null;
        if (validated.lessonId) {
            const lesson = await prisma_1.default.lesson.findUnique({
                where: { id: validated.lessonId },
                include: { module: { select: { courseId: true } } },
            });
            if (!lesson || lesson.module.courseId !== parseInt(id)) {
                res.status(400).json({ error: 'Leçon invalide pour ce cours' });
                return;
            }
            lessonId = validated.lessonId;
        }
        const commentaire = await prisma_1.default.commentaire.create({
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
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Erreur de validation', details: error.errors });
            return;
        }
        logger.error('Erreur createCommentaire:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.createCommentaire = createCommentaire;
const replyToCommentaire = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const { commentId } = req.params;
        const validated = replyCommentSchema.parse(req.body);
        const parentComment = await prisma_1.default.commentaire.findUnique({
            where: { id: parseInt(commentId) },
        });
        if (!parentComment) {
            res.status(404).json({ error: 'Commentaire non trouvé' });
            return;
        }
        const reply = await prisma_1.default.commentaire.create({
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
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Erreur de validation', details: error.errors });
            return;
        }
        logger.error('Erreur replyToCommentaire:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.replyToCommentaire = replyToCommentaire;
const likeCommentaire = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const { commentId } = req.params;
        const commentaire = await prisma_1.default.commentaire.findUnique({
            where: { id: parseInt(commentId) },
        });
        if (!commentaire) {
            res.status(404).json({ error: 'Commentaire non trouvé' });
            return;
        }
        const existingLike = await prisma_1.default.like.findUnique({
            where: {
                userId_commentaireId: {
                    userId: req.user.id,
                    commentaireId: parseInt(commentId),
                },
            },
        });
        if (existingLike) {
            await prisma_1.default.like.delete({
                where: { id: existingLike.id },
            });
            const likesCount = await prisma_1.default.like.count({
                where: { commentaireId: parseInt(commentId) },
            });
            res.json({ message: 'Like retiré', liked: false, likesCount });
        }
        else {
            await prisma_1.default.like.create({
                data: {
                    userId: req.user.id,
                    commentaireId: parseInt(commentId),
                },
            });
            const likesCount = await prisma_1.default.like.count({
                where: { commentaireId: parseInt(commentId) },
            });
            res.json({ message: 'Like ajouté', liked: true, likesCount });
        }
    }
    catch (error) {
        logger.error('Erreur likeCommentaire:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.likeCommentaire = likeCommentaire;
const getNotifications = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const { page = '1', limit = '20' } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;
        const [notifications, total, unreadCount] = await Promise.all([
            prisma_1.default.notification.findMany({
                where: { userId: req.user.id },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limitNum,
            }),
            prisma_1.default.notification.count({
                where: { userId: req.user.id },
            }),
            prisma_1.default.notification.count({
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
    }
    catch (error) {
        logger.error('Erreur getNotifications:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getNotifications = getNotifications;
const markNotificationRead = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const { id } = req.params;
        const notification = await prisma_1.default.notification.findUnique({
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
        await prisma_1.default.notification.update({
            where: { id: parseInt(id) },
            data: { isRead: true },
        });
        res.json({ message: 'Notification marquée comme lue' });
    }
    catch (error) {
        logger.error('Erreur markNotificationRead:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.markNotificationRead = markNotificationRead;
const markAllNotificationsRead = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        await prisma_1.default.notification.updateMany({
            where: {
                userId: req.user.id,
                isRead: false,
            },
            data: { isRead: true },
        });
        res.json({ message: 'Toutes les notifications marquées comme lues' });
    }
    catch (error) {
        logger.error('Erreur markAllNotificationsRead:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.markAllNotificationsRead = markAllNotificationsRead;
const getCertificate = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const { id } = req.params;
        const certificate = await prisma_1.default.certificate.findFirst({
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
    }
    catch (error) {
        logger.error('Erreur getCertificate:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getCertificate = getCertificate;
const getMyCertificates = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const certificates = await prisma_1.default.certificate.findMany({
            where: { userId: req.user.id },
            include: {
                cours: { select: { id: true, title: true, coverImage: true } },
            },
            orderBy: { issuedAt: 'desc' },
        });
        res.json({ certificates });
    }
    catch (error) {
        logger.error('Erreur getMyCertificates:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getMyCertificates = getMyCertificates;
const verifyCertificate = async (req, res) => {
    try {
        const { uniqueNumber } = req.params;
        const certificate = await prisma_1.default.certificate.findUnique({
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
    }
    catch (error) {
        logger.error('Erreur verifyCertificate:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.verifyCertificate = verifyCertificate;
const getCategories = async (req, res) => {
    try {
        const categories = await prisma_1.default.category.findMany({
            include: {
                _count: {
                    select: { cours: true },
                },
            },
            orderBy: { name: 'asc' },
        });
        res.json({ categories });
    }
    catch (error) {
        logger.error('Erreur getCategories:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getCategories = getCategories;
const getAnnouncements = async (req, res) => {
    try {
        const announcements = await prisma_1.default.announcement.findMany({
            include: {
                admin: { select: { id: true, firstName: true, lastName: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
        res.json({ announcements });
    }
    catch (error) {
        logger.error('Erreur getAnnouncements:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getAnnouncements = getAnnouncements;
//# sourceMappingURL=apprenantController.js.map