"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserProfile = exports.deleteAnnouncement = exports.createAnnouncement = exports.getAnnouncements = exports.markAllAdminNotificationsRead = exports.markAdminNotificationRead = exports.getAdminNotifications = exports.resetUserPassword = exports.deleteUser = exports.getCategories = exports.getUserProgression = exports.updateUserStatus = exports.getUserById = exports.getUsers = exports.reorderPdfs = exports.deletePdf = exports.updatePdf = exports.uploadPdf = exports.reorderVideos = exports.deleteVideo = exports.updateVideo = exports.uploadVideo = exports.updateCoursStatus = exports.deleteCours = exports.updateCours = exports.createCours = exports.getCours = exports.getStats = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const prisma_1 = __importDefault(require("../config/prisma"));
const upload_1 = require("../middleware/upload");
const winston_1 = __importDefault(require("winston"));
const logger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    transports: [new winston_1.default.transports.Console()],
});
const extractCloudinaryPublicId = (url, resourceType) => {
    const match = url.match(new RegExp(`${resourceType}/upload/(?:v\\d+/)?(.+?)(?:\\.[^.]+)?$`));
    return match ? match[1] : null;
};
const niveauEnum = zod_1.z.enum(['SIXIEME', 'CINQUIEME', 'QUATRIEME', 'TROISIEME', 'SECONDE', 'PREMIERE', 'TERMINALE', 'LICENCE', 'MASTER', 'DOCTORAT']);
const serieEnum = zod_1.z.enum(['S', 'L', 'OSE']);
const createCoursSchema = zod_1.z.object({
    title: zod_1.z.string().min(3, 'Le titre doit contenir au moins 3 caractères'),
    description: zod_1.z.string().optional(),
    categoryId: zod_1.z.number().int().positive().optional(),
    status: zod_1.z.enum(['PUBLIE', 'BROUILLON', 'ARCHIVE']).optional(),
    niveau: niveauEnum.nullable().optional(),
    serie: serieEnum.nullable().optional(),
});
const updateCoursSchema = zod_1.z.object({
    title: zod_1.z.string().min(3).optional(),
    description: zod_1.z.string().optional(),
    categoryId: zod_1.z.number().int().positive().nullable().optional(),
    niveau: niveauEnum.nullable().optional(),
    serie: serieEnum.nullable().optional(),
});
const updateCoursStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['PUBLIE', 'BROUILLON', 'ARCHIVE']),
});
const createVideoSchema = zod_1.z.object({
    title: zod_1.z.string().min(1, 'Titre requis'),
    description: zod_1.z.string().optional(),
    duration: zod_1.z.number().int().min(0).optional(),
    position: zod_1.z.number().int().min(0).optional(),
    isRequired: zod_1.z.boolean().optional(),
});
const updateVideoSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).optional(),
    description: zod_1.z.string().optional(),
    duration: zod_1.z.number().int().min(0).optional(),
    position: zod_1.z.number().int().min(0).optional(),
    isRequired: zod_1.z.boolean().optional(),
});
const createPdfSchema = zod_1.z.object({
    title: zod_1.z.string().min(1, 'Titre requis'),
    description: zod_1.z.string().optional(),
    pageCount: zod_1.z.number().int().min(0).optional(),
    position: zod_1.z.number().int().min(0).optional(),
});
const updatePdfSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).optional(),
    description: zod_1.z.string().optional(),
    pageCount: zod_1.z.number().int().min(0).optional(),
    position: zod_1.z.number().int().min(0).optional(),
});
const reorderSchema = zod_1.z.object({
    items: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.number().int().positive(),
        position: zod_1.z.number().int().min(0),
    })),
});
const updateUserStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['ACTIF', 'INACTIF', 'BLOQUE']),
});
const getStats = async (req, res) => {
    try {
        const totalStudents = await prisma_1.default.user.count({
            where: { role: 'APPRENANT' },
        });
        const totalCourses = await prisma_1.default.cours.count();
        const totalVideos = await prisma_1.default.video.count();
        const totalPdfs = await prisma_1.default.pDF.count();
        const totalEnrollments = await prisma_1.default.enrollment.count();
        const enrollments = await prisma_1.default.enrollment.findMany({
            select: { progress: true },
        });
        const averageCompletion = enrollments.length > 0
            ? Math.round(enrollments.reduce((sum, e) => sum + e.progress, 0) / enrollments.length)
            : 0;
        const now = new Date();
        const monthlyEnrollments = await prisma_1.default.enrollment.count({
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
            const count = await prisma_1.default.enrollment.count({
                where: {
                    enrolledAt: { gte: d, lt: nextMonth },
                },
            });
            monthlyEnrollmentsChart.push({ month: d.getMonth() + 1, count });
        }
        const popularCoursesRaw = await prisma_1.default.cours.findMany({
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
        const recentEnrollments = await prisma_1.default.enrollment.findMany({
            take: 10,
            orderBy: { enrolledAt: 'desc' },
            include: {
                user: { select: { firstName: true, lastName: true } },
                cours: { select: { title: true } },
            },
        });
        const recentActivities = recentEnrollments.map((e) => ({
            id: e.id,
            type: 'enrollment',
            message: `${e.user.firstName} ${e.user.lastName} s'est inscrit à "${e.cours.title}"`,
            date: e.enrolledAt,
        }));
        const totalCertificates = await prisma_1.default.certificate.count();
        const totalComments = await prisma_1.default.commentaire.count();
        const activeCourses = await prisma_1.default.cours.count({
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
    }
    catch (error) {
        logger.error('Erreur getStats:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getStats = getStats;
const getCours = async (req, res) => {
    try {
        const { page = '1', limit = '20', category, status, search, } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;
        const where = {};
        if (category) {
            where.categoryId = parseInt(category);
        }
        if (status) {
            where.status = status;
        }
        if (search) {
            where.OR = [
                { title: { contains: search } },
                { description: { contains: search } },
            ];
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
                            modules: true,
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
        logger.error('Erreur getCours:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getCours = getCours;
const createCours = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const validated = createCoursSchema.parse(req.body);
        const course = await prisma_1.default.cours.create({
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
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Erreur de validation', details: error.errors });
            return;
        }
        logger.error('Erreur createCours:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.createCours = createCours;
const updateCours = async (req, res) => {
    try {
        const { id } = req.params;
        const validated = updateCoursSchema.parse(req.body);
        const course = await prisma_1.default.cours.findUnique({
            where: { id: parseInt(id) },
        });
        if (!course) {
            res.status(404).json({ error: 'Cours non trouvé' });
            return;
        }
        const updatedCourse = await prisma_1.default.cours.update({
            where: { id: parseInt(id) },
            data: validated,
            include: {
                category: { select: { id: true, name: true, slug: true } },
                admin: { select: { id: true, firstName: true, lastName: true } },
            },
        });
        res.json({ message: 'Cours mis à jour', course: updatedCourse });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Erreur de validation', details: error.errors });
            return;
        }
        logger.error('Erreur updateCours:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.updateCours = updateCours;
const deleteCours = async (req, res) => {
    try {
        const { id } = req.params;
        const course = await prisma_1.default.cours.findUnique({
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
        if (course.coverImage) {
            const publicId = extractCloudinaryPublicId(course.coverImage, 'image');
            if (publicId)
                await upload_1.cloudinary.uploader.destroy(publicId, { resource_type: 'image' }).catch(() => { });
        }
        for (const video of course.videos) {
            const publicId = extractCloudinaryPublicId(video.url, 'video');
            if (publicId)
                await upload_1.cloudinary.uploader.destroy(publicId, { resource_type: 'video' }).catch(() => { });
        }
        for (const pdf of course.pdfs) {
            const publicId = extractCloudinaryPublicId(pdf.url, 'raw');
            if (publicId)
                await upload_1.cloudinary.uploader.destroy(publicId, { resource_type: 'raw' }).catch(() => { });
        }
        await prisma_1.default.cours.delete({
            where: { id: parseInt(id) },
        });
        res.json({ message: 'Cours supprimé avec succès' });
    }
    catch (error) {
        logger.error('Erreur deleteCours:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.deleteCours = deleteCours;
const updateCoursStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const validated = updateCoursStatusSchema.parse(req.body);
        const course = await prisma_1.default.cours.findUnique({
            where: { id: parseInt(id) },
        });
        if (!course) {
            res.status(404).json({ error: 'Cours non trouvé' });
            return;
        }
        const updatedCourse = await prisma_1.default.cours.update({
            where: { id: parseInt(id) },
            data: { status: validated.status },
        });
        res.json({ message: `Statut du cours mis à jour: ${validated.status}`, course: updatedCourse });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Erreur de validation', details: error.errors });
            return;
        }
        logger.error('Erreur updateCoursStatus:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.updateCoursStatus = updateCoursStatus;
const uploadVideo = async (req, res) => {
    try {
        const { id } = req.params;
        const file = req.file;
        if (!file) {
            res.status(400).json({ error: 'Fichier vidéo requis' });
            return;
        }
        const course = await prisma_1.default.cours.findUnique({
            where: { id: parseInt(id) },
        });
        if (!course) {
            res.status(404).json({ error: 'Cours non trouvé' });
            return;
        }
        const maxPosition = await prisma_1.default.video.aggregate({
            where: { courseId: parseInt(id) },
            _max: { position: true },
        });
        const nextPosition = (maxPosition._max.position ?? -1) + 1;
        const videoData = {
            title: req.body.title || file.originalname,
            description: req.body.description || null,
            url: file.path,
            duration: req.body.duration ? parseInt(req.body.duration) : 0,
            position: req.body.position ? parseInt(req.body.position) : nextPosition,
            isRequired: req.body.isRequired !== 'false',
            courseId: parseInt(id),
        };
        const video = await prisma_1.default.video.create({
            data: videoData,
        });
        res.status(201).json({ message: 'Vidéo uploadée avec succès', video });
    }
    catch (error) {
        logger.error('Erreur uploadVideo:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.uploadVideo = uploadVideo;
const updateVideo = async (req, res) => {
    try {
        const { videoId } = req.params;
        const validated = updateVideoSchema.parse(req.body);
        const video = await prisma_1.default.video.findUnique({
            where: { id: parseInt(videoId) },
        });
        if (!video) {
            res.status(404).json({ error: 'Vidéo non trouvée' });
            return;
        }
        const updatedVideo = await prisma_1.default.video.update({
            where: { id: parseInt(videoId) },
            data: validated,
        });
        res.json({ message: 'Vidéo mise à jour', video: updatedVideo });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Erreur de validation', details: error.errors });
            return;
        }
        logger.error('Erreur updateVideo:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.updateVideo = updateVideo;
const deleteVideo = async (req, res) => {
    try {
        const { videoId } = req.params;
        const video = await prisma_1.default.video.findUnique({
            where: { id: parseInt(videoId) },
        });
        if (!video) {
            res.status(404).json({ error: 'Vidéo non trouvée' });
            return;
        }
        // Delete from Cloudinary
        const publicId = extractCloudinaryPublicId(video.url, 'video');
        if (publicId) {
            await upload_1.cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
        }
        await prisma_1.default.video.delete({
            where: { id: parseInt(videoId) },
        });
        res.json({ message: 'Vidéo supprimée avec succès' });
    }
    catch (error) {
        logger.error('Erreur deleteVideo:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.deleteVideo = deleteVideo;
const reorderVideos = async (req, res) => {
    try {
        const { id } = req.params;
        const validated = reorderSchema.parse(req.body);
        const updatePromises = validated.items.map((item) => prisma_1.default.video.updateMany({
            where: {
                id: item.id,
                courseId: parseInt(id),
            },
            data: { position: item.position },
        }));
        await Promise.all(updatePromises);
        const videos = await prisma_1.default.video.findMany({
            where: { courseId: parseInt(id) },
            orderBy: { position: 'asc' },
        });
        res.json({ message: 'Ordre des vidéos mis à jour', videos });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Erreur de validation', details: error.errors });
            return;
        }
        logger.error('Erreur reorderVideos:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.reorderVideos = reorderVideos;
const uploadPdf = async (req, res) => {
    try {
        const { id } = req.params;
        const file = req.file;
        if (!file) {
            res.status(400).json({ error: 'Fichier PDF requis' });
            return;
        }
        const course = await prisma_1.default.cours.findUnique({
            where: { id: parseInt(id) },
        });
        if (!course) {
            res.status(404).json({ error: 'Cours non trouvé' });
            return;
        }
        const maxPosition = await prisma_1.default.pDF.aggregate({
            where: { courseId: parseInt(id) },
            _max: { position: true },
        });
        const nextPosition = (maxPosition._max.position ?? -1) + 1;
        const pdfData = {
            title: req.body.title || file.originalname,
            description: req.body.description || null,
            url: file.path,
            pageCount: req.body.pageCount ? parseInt(req.body.pageCount) : 0,
            position: req.body.position ? parseInt(req.body.position) : nextPosition,
            courseId: parseInt(id),
        };
        const pdf = await prisma_1.default.pDF.create({
            data: pdfData,
        });
        res.status(201).json({ message: 'PDF uploadé avec succès', pdf });
    }
    catch (error) {
        logger.error('Erreur uploadPdf:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.uploadPdf = uploadPdf;
const updatePdf = async (req, res) => {
    try {
        const { pdfId } = req.params;
        const validated = updatePdfSchema.parse(req.body);
        const pdf = await prisma_1.default.pDF.findUnique({
            where: { id: parseInt(pdfId) },
        });
        if (!pdf) {
            res.status(404).json({ error: 'PDF non trouvé' });
            return;
        }
        const updatedPdf = await prisma_1.default.pDF.update({
            where: { id: parseInt(pdfId) },
            data: validated,
        });
        res.json({ message: 'PDF mis à jour', pdf: updatedPdf });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Erreur de validation', details: error.errors });
            return;
        }
        logger.error('Erreur updatePdf:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.updatePdf = updatePdf;
const deletePdf = async (req, res) => {
    try {
        const { pdfId } = req.params;
        const pdf = await prisma_1.default.pDF.findUnique({
            where: { id: parseInt(pdfId) },
        });
        if (!pdf) {
            res.status(404).json({ error: 'PDF non trouvé' });
            return;
        }
        // Delete from Cloudinary
        const publicId = extractCloudinaryPublicId(pdf.url, 'raw');
        if (publicId) {
            await upload_1.cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
        }
        await prisma_1.default.pDF.delete({
            where: { id: parseInt(pdfId) },
        });
        res.json({ message: 'PDF supprimé avec succès' });
    }
    catch (error) {
        logger.error('Erreur deletePdf:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.deletePdf = deletePdf;
const reorderPdfs = async (req, res) => {
    try {
        const { id } = req.params;
        const validated = reorderSchema.parse(req.body);
        const updatePromises = validated.items.map((item) => prisma_1.default.pDF.updateMany({
            where: {
                id: item.id,
                courseId: parseInt(id),
            },
            data: { position: item.position },
        }));
        await Promise.all(updatePromises);
        const pdfs = await prisma_1.default.pDF.findMany({
            where: { courseId: parseInt(id) },
            orderBy: { position: 'asc' },
        });
        res.json({ message: 'Ordre des PDFs mis à jour', pdfs });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Erreur de validation', details: error.errors });
            return;
        }
        logger.error('Erreur reorderPdfs:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.reorderPdfs = reorderPdfs;
const getUsers = async (req, res) => {
    try {
        const { page = '1', limit = '20', search, status, role, } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;
        const where = {};
        if (status) {
            where.status = status;
        }
        if (role) {
            where.role = role;
        }
        if (search) {
            where.OR = [
                { firstName: { contains: search } },
                { lastName: { contains: search } },
                { email: { contains: search } },
            ];
        }
        const [users, total] = await Promise.all([
            prisma_1.default.user.findMany({
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
            prisma_1.default.user.count({ where }),
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
    }
    catch (error) {
        logger.error('Erreur getUsers:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getUsers = getUsers;
const getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await prisma_1.default.user.findUnique({
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
    }
    catch (error) {
        logger.error('Erreur getUserById:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getUserById = getUserById;
const updateUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const validated = updateUserStatusSchema.parse(req.body);
        const user = await prisma_1.default.user.findUnique({
            where: { id: parseInt(id) },
        });
        if (!user) {
            res.status(404).json({ error: 'Utilisateur non trouvé' });
            return;
        }
        const updatedUser = await prisma_1.default.user.update({
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
        await prisma_1.default.auditLog.create({
            data: {
                userId: req.user?.id || null,
                action: `UPDATE_USER_STATUS_${validated.status}`,
                ipAddress: req.ip || null,
                userAgent: req.get('user-agent') || null,
                details: JSON.stringify({ targetUserId: parseInt(id), newStatus: validated.status }),
            },
        });
        res.json({ message: `Statut utilisateur mis à jour: ${validated.status}`, user: updatedUser });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Erreur de validation', details: error.errors });
            return;
        }
        logger.error('Erreur updateUserStatus:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.updateUserStatus = updateUserStatus;
const getUserProgression = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await prisma_1.default.user.findUnique({
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
        const enrollments = await prisma_1.default.enrollment.findMany({
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
        const progressions = await prisma_1.default.progression.findMany({
            where: { userId: parseInt(id) },
            include: {
                cours: { select: { id: true, title: true } },
                lesson: { select: { id: true, title: true } },
            },
            orderBy: { lastAccessed: 'desc' },
        });
        const certificates = await prisma_1.default.certificate.findMany({
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
    }
    catch (error) {
        logger.error('Erreur getUserProgression:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getUserProgression = getUserProgression;
const getCategories = async (req, res) => {
    try {
        const categories = await prisma_1.default.category.findMany({
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
const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await prisma_1.default.user.findUnique({
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
        await prisma_1.default.auditLog.create({
            data: {
                userId: req.user?.id || null,
                action: 'DELETE_USER',
                ipAddress: req.ip || null,
                userAgent: req.get('user-agent') || null,
                details: JSON.stringify({ targetUserId: parseInt(id), email: user.email }),
            },
        });
        await prisma_1.default.user.delete({ where: { id: parseInt(id) } });
        res.json({ message: 'Utilisateur supprimé avec succès' });
    }
    catch (error) {
        logger.error('Erreur deleteUser:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.deleteUser = deleteUser;
const resetPasswordSchema = zod_1.z.object({
    newPassword: zod_1.z
        .string()
        .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
        .regex(/[A-Z]/, 'Une majuscule requise')
        .regex(/[a-z]/, 'Une minuscule requise')
        .regex(/[0-9]/, 'Un chiffre requis'),
});
const resetUserPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const validated = resetPasswordSchema.parse(req.body);
        const user = await prisma_1.default.user.findUnique({
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
        const hashedPassword = await bcryptjs_1.default.hash(validated.newPassword, 12);
        await prisma_1.default.user.update({
            where: { id: parseInt(id) },
            data: { password: hashedPassword },
        });
        // Notify the user
        await prisma_1.default.notification.create({
            data: {
                userId: parseInt(id),
                type: 'WARNING',
                title: 'Mot de passe réinitialisé',
                message: 'Votre mot de passe a été réinitialisé par l\'administrateur. Veuillez vous connecter avec le nouveau mot de passe.',
            },
        });
        await prisma_1.default.auditLog.create({
            data: {
                userId: req.user?.id || null,
                action: 'RESET_USER_PASSWORD',
                ipAddress: req.ip || null,
                userAgent: req.get('user-agent') || null,
                details: JSON.stringify({ targetUserId: parseInt(id), email: user.email }),
            },
        });
        res.json({ message: 'Mot de passe réinitialisé avec succès' });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Erreur de validation', details: error.errors });
            return;
        }
        logger.error('Erreur resetUserPassword:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.resetUserPassword = resetUserPassword;
const getAdminNotifications = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const notifications = await prisma_1.default.notification.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
        const unreadCount = notifications.filter((n) => !n.isRead).length;
        res.json({ notifications, unreadCount });
    }
    catch (error) {
        logger.error('Erreur getAdminNotifications:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getAdminNotifications = getAdminNotifications;
const markAdminNotificationRead = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const { id } = req.params;
        await prisma_1.default.notification.updateMany({
            where: { id: parseInt(id), userId: req.user.id },
            data: { isRead: true },
        });
        res.json({ message: 'Notification marquée comme lue' });
    }
    catch (error) {
        logger.error('Erreur markAdminNotificationRead:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.markAdminNotificationRead = markAdminNotificationRead;
const markAllAdminNotificationsRead = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        await prisma_1.default.notification.updateMany({
            where: { userId: req.user.id, isRead: false },
            data: { isRead: true },
        });
        res.json({ message: 'Toutes les notifications marquées comme lues' });
    }
    catch (error) {
        logger.error('Erreur markAllAdminNotificationsRead:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.markAllAdminNotificationsRead = markAllAdminNotificationsRead;
const createAnnouncementSchema = zod_1.z.object({
    title: zod_1.z.string().min(3, 'Le titre doit contenir au moins 3 caractères'),
    content: zod_1.z.string().min(10, 'Le contenu doit contenir au moins 10 caractères'),
});
const getAnnouncements = async (req, res) => {
    try {
        const announcements = await prisma_1.default.announcement.findMany({
            include: {
                admin: { select: { id: true, firstName: true, lastName: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ announcements });
    }
    catch (error) {
        logger.error('Erreur getAnnouncements:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getAnnouncements = getAnnouncements;
const createAnnouncement = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const validated = createAnnouncementSchema.parse(req.body);
        const announcement = await prisma_1.default.announcement.create({
            data: {
                title: validated.title,
                content: validated.content,
                adminId: req.user.id,
            },
            include: {
                admin: { select: { id: true, firstName: true, lastName: true } },
            },
        });
        const students = await prisma_1.default.user.findMany({
            where: { role: 'APPRENANT', status: 'ACTIF' },
            select: { id: true },
        });
        if (students.length > 0) {
            await prisma_1.default.notification.createMany({
                data: students.map((s) => ({
                    userId: s.id,
                    type: 'ANNONCE',
                    title: validated.title,
                    message: validated.content,
                })),
            });
        }
        res.status(201).json({ message: 'Annonce publiée avec succès', announcement });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Erreur de validation', details: error.errors });
            return;
        }
        logger.error('Erreur createAnnouncement:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.createAnnouncement = createAnnouncement;
const deleteAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;
        const announcement = await prisma_1.default.announcement.findUnique({ where: { id: parseInt(id) } });
        if (!announcement) {
            res.status(404).json({ error: 'Annonce non trouvée' });
            return;
        }
        await prisma_1.default.announcement.delete({ where: { id: parseInt(id) } });
        res.json({ message: 'Annonce supprimée avec succès' });
    }
    catch (error) {
        logger.error('Erreur deleteAnnouncement:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.deleteAnnouncement = deleteAnnouncement;
const updateUserProfileSchema = zod_1.z.object({
    firstName: zod_1.z.string().min(2, 'Le prénom doit contenir au moins 2 caractères').optional(),
    lastName: zod_1.z.string().min(2, 'Le nom doit contenir au moins 2 caractères').optional(),
    email: zod_1.z.string().email('Email invalide').optional(),
    role: zod_1.z.enum(['ADMIN', 'APPRENANT', 'MENTOR']).optional(),
    niveau: niveauEnum.nullable().optional(),
    serie: serieEnum.nullable().optional(),
    niveauResponsable: niveauEnum.nullable().optional(),
    serieResponsable: serieEnum.nullable().optional(),
    status: zod_1.z.enum(['ACTIF', 'INACTIF', 'BLOQUE']).optional(),
});
const updateUserProfile = async (req, res) => {
    try {
        const { id } = req.params;
        const validated = updateUserProfileSchema.parse(req.body);
        const user = await prisma_1.default.user.findUnique({ where: { id: parseInt(id) } });
        if (!user) {
            res.status(404).json({ error: 'Utilisateur non trouvé' });
            return;
        }
        if (validated.email && validated.email !== user.email) {
            const existing = await prisma_1.default.user.findUnique({ where: { email: validated.email } });
            if (existing) {
                res.status(400).json({ error: 'Cet email est déjà utilisé' });
                return;
            }
        }
        const updateData = {};
        if (validated.firstName !== undefined)
            updateData.firstName = validated.firstName;
        if (validated.lastName !== undefined)
            updateData.lastName = validated.lastName;
        if (validated.email !== undefined)
            updateData.email = validated.email;
        if (validated.role !== undefined)
            updateData.role = validated.role;
        if (validated.niveau !== undefined)
            updateData.niveau = validated.niveau;
        if (validated.serie !== undefined)
            updateData.serie = validated.serie;
        if (validated.niveauResponsable !== undefined)
            updateData.niveauResponsable = validated.niveauResponsable;
        if (validated.serieResponsable !== undefined)
            updateData.serieResponsable = validated.serieResponsable;
        if (validated.status !== undefined)
            updateData.status = validated.status;
        if (validated.role === 'APPRENANT' || validated.role === 'MENTOR') {
            if (validated.niveau !== undefined)
                updateData.niveau = validated.niveau;
            if (validated.serie !== undefined)
                updateData.serie = validated.serie;
        }
        if (validated.role === 'MENTOR') {
            if (validated.niveauResponsable !== undefined)
                updateData.niveauResponsable = validated.niveauResponsable;
            if (validated.serieResponsable !== undefined)
                updateData.serieResponsable = validated.serieResponsable;
        }
        const updated = await prisma_1.default.user.update({
            where: { id: parseInt(id) },
            data: updateData,
            select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true, niveau: true, serie: true, niveauResponsable: true, serieResponsable: true, createdAt: true },
        });
        await prisma_1.default.auditLog.create({
            data: {
                userId: req.user.id,
                action: 'UPDATE_PROFILE',
                details: `Profil de ${user.firstName} ${user.lastName} modifié: ${JSON.stringify(validated)}`,
            },
        });
        res.json({ user: updated, message: 'Profil mis à jour avec succès' });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Erreur de validation', details: error.errors });
            return;
        }
        logger.error('Erreur updateUserProfile:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.updateUserProfile = updateUserProfile;
//# sourceMappingURL=adminController.js.map