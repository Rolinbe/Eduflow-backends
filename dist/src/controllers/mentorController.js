"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMentorStudentsForChat = exports.reorderPdfs = exports.deletePdf = exports.updatePdf = exports.uploadPdf = exports.reorderVideos = exports.deleteVideo = exports.updateVideo = exports.uploadVideo = exports.getCourseDetail = exports.updateCourseStatus = exports.deleteCourse = exports.updateCourse = exports.createCourse = exports.getCourses = exports.getStudentDetail = exports.getStudents = exports.getDashboard = void 0;
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
const niveauEnum = zod_1.z.enum(['SIXIEME', 'CINQUIEME', 'QUATRIEME', 'TROISIEME', 'SECONDE', 'PREMIERE', 'TERMINALE']);
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
const getDashboard = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const mentor = await prisma_1.default.user.findUnique({
            where: { id: req.user.id },
            select: { niveauResponsable: true, serieResponsable: true, firstName: true, lastName: true },
        });
        if (!mentor) {
            res.status(404).json({ error: 'Mentor non trouvé' });
            return;
        }
        const niveau = mentor.niveauResponsable;
        const serie = mentor.serieResponsable;
        const studentWhere = { role: 'APPRENANT', niveau: niveau || undefined };
        if ((niveau === 'PREMIERE' || niveau === 'TERMINALE') && serie) {
            studentWhere.serie = serie;
        }
        const [totalCourses, myCourses, totalStudents, studentEnrollments, completedCount] = await Promise.all([
            prisma_1.default.cours.count({ where: { adminId: req.user.id } }),
            prisma_1.default.cours.findMany({
                where: { adminId: req.user.id },
                select: { id: true },
            }),
            prisma_1.default.user.count({ where: studentWhere }),
            prisma_1.default.enrollment.findMany({
                where: {
                    cours: { adminId: req.user.id },
                },
                select: { userId: true, progress: true, courseId: true },
            }),
            prisma_1.default.enrollment.count({
                where: {
                    cours: { adminId: req.user.id },
                    progress: 100,
                },
            }),
        ]);
        const uniqueStudents = new Set(studentEnrollments.map(e => e.userId)).size;
        const avgProgress = studentEnrollments.length > 0
            ? Math.round(studentEnrollments.reduce((sum, e) => sum + e.progress, 0) / studentEnrollments.length)
            : 0;
        const monthlyEnrollments = await prisma_1.default.enrollment.findMany({
            where: { cours: { adminId: req.user.id } },
            select: { enrolledAt: true },
        });
        const monthCounts = {};
        monthlyEnrollments.forEach(e => {
            const month = new Date(e.enrolledAt).getMonth() + 1;
            monthCounts[month] = (monthCounts[month] || 0) + 1;
        });
        const monthlyData = Object.entries(monthCounts).map(([month, count]) => ({
            month: parseInt(month), count,
        }));
        const recentStudents = await prisma_1.default.user.findMany({
            where: studentWhere,
            select: {
                id: true, firstName: true, lastName: true, email: true, avatar: true, createdAt: true,
                enrollments: {
                    where: { cours: { adminId: req.user.id } },
                    select: { progress: true, cours: { select: { title: true } } },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
        });
        res.json({
            stats: {
                totalCourses,
                totalStudents: uniqueStudents,
                totalEnrolledStudents: totalStudents,
                avgProgress,
                completedCount,
                totalEnrollments: studentEnrollments.length,
                monthlyEnrollments: monthlyData,
            },
            recentStudents,
            niveau,
        });
    }
    catch (error) {
        logger.error('Erreur getDashboard mentor:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getDashboard = getDashboard;
const getStudents = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const mentor = await prisma_1.default.user.findUnique({
            where: { id: req.user.id },
            select: { niveauResponsable: true, serieResponsable: true },
        });
        const niveau = mentor?.niveauResponsable;
        const serie = mentor?.serieResponsable;
        const studentWhere = { role: 'APPRENANT', niveau: niveau || undefined };
        if ((niveau === 'PREMIERE' || niveau === 'TERMINALE') && serie) {
            studentWhere.serie = serie;
        }
        const students = await prisma_1.default.user.findMany({
            where: studentWhere,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                niveau: true,
                serie: true,
                avatar: true,
                createdAt: true,
                enrollments: {
                    select: {
                        progress: true,
                        enrolledAt: true,
                        cours: {
                            select: { id: true, title: true, niveau: true, adminId: true },
                        },
                    },
                },
            },
            orderBy: { firstName: 'asc' },
        });
        const result = students.map(s => {
            const myCoursesEnrollments = s.enrollments.filter(e => e.cours.adminId === req.user.id);
            const avgProgress = myCoursesEnrollments.length > 0
                ? Math.round(myCoursesEnrollments.reduce((sum, e) => sum + e.progress, 0) / myCoursesEnrollments.length)
                : 0;
            return {
                id: s.id,
                firstName: s.firstName,
                lastName: s.lastName,
                email: s.email,
                niveau: s.niveau,
                serie: s.serie,
                avatar: s.avatar,
                createdAt: s.createdAt,
                coursesCount: myCoursesEnrollments.length,
                avgProgress,
                enrollments: myCoursesEnrollments.map(e => ({
                    progress: e.progress,
                    coursTitle: e.cours.title,
                    enrolledAt: e.enrolledAt,
                })),
            };
        });
        res.json({ students: result });
    }
    catch (error) {
        logger.error('Erreur getStudents mentor:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getStudents = getStudents;
const getStudentDetail = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const studentId = parseInt(req.params.studentId);
        const student = await prisma_1.default.user.findUnique({
            where: { id: studentId, role: 'APPRENANT' },
            select: {
                id: true, firstName: true, lastName: true, email: true,
                niveau: true, serie: true, avatar: true, createdAt: true,
                enrollments: {
                    where: { cours: { adminId: req.user.id } },
                    select: {
                        progress: true, enrolledAt: true,
                        cours: { select: { id: true, title: true, niveau: true, _count: { select: { videos: true, pdfs: true } } } },
                    },
                },
                progressions: {
                    where: { cours: { adminId: req.user.id } },
                    select: { status: true, timeSpent: true, lastAccessed: true, lesson: { select: { title: true } } },
                    orderBy: { lastAccessed: 'desc' },
                    take: 10,
                },
            },
        });
        if (!student) {
            res.status(404).json({ error: 'Élève non trouvé' });
            return;
        }
        res.json({ student });
    }
    catch (error) {
        logger.error('Erreur getStudentDetail mentor:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getStudentDetail = getStudentDetail;
const getCourses = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const mentor = await prisma_1.default.user.findUnique({
            where: { id: req.user.id },
            select: { niveauResponsable: true, serieResponsable: true },
        });
        const niveau = mentor?.niveauResponsable;
        const serie = mentor?.serieResponsable;
        const adminCourseWhere = {
            adminId: { not: req.user.id },
            status: 'PUBLIE',
        };
        if (niveau) {
            adminCourseWhere.niveau = niveau;
            if ((niveau === 'PREMIERE' || niveau === 'TERMINALE') && serie) {
                adminCourseWhere.serie = serie;
            }
        }
        const [myCourses, adminCourses] = await Promise.all([
            prisma_1.default.cours.findMany({
                where: { adminId: req.user.id },
                include: {
                    admin: { select: { id: true, firstName: true, lastName: true } },
                    category: { select: { id: true, name: true } },
                    _count: { select: { videos: true, pdfs: true, enrollments: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma_1.default.cours.findMany({
                where: adminCourseWhere,
                include: {
                    admin: { select: { id: true, firstName: true, lastName: true } },
                    category: { select: { id: true, name: true } },
                    _count: { select: { videos: true, pdfs: true, enrollments: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
        ]);
        res.json({ myCourses, adminCourses });
    }
    catch (error) {
        logger.error('Erreur getCourses mentor:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getCourses = getCourses;
const createCourse = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const validated = createCoursSchema.parse(req.body);
        const mentor = await prisma_1.default.user.findUnique({
            where: { id: req.user.id },
            select: { niveauResponsable: true, serieResponsable: true },
        });
        const course = await prisma_1.default.cours.create({
            data: {
                title: validated.title,
                description: validated.description,
                categoryId: validated.categoryId || null,
                status: validated.status || 'BROUILLON',
                adminId: req.user.id,
                niveau: validated.niveau || mentor?.niveauResponsable || null,
                serie: validated.serie || ((mentor?.niveauResponsable === 'PREMIERE' || mentor?.niveauResponsable === 'TERMINALE') ? mentor?.serieResponsable || null : null),
            },
            include: {
                category: { select: { id: true, name: true } },
                _count: { select: { videos: true, pdfs: true, enrollments: true } },
            },
        });
        res.status(201).json({ message: 'Cours créé', course });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Erreur de validation', details: error.errors });
            return;
        }
        logger.error('Erreur createCourse mentor:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.createCourse = createCourse;
const updateCourse = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const courseId = parseInt(req.params.courseId);
        const existing = await prisma_1.default.cours.findFirst({ where: { id: courseId, adminId: req.user.id } });
        if (!existing) {
            res.status(404).json({ error: 'Cours non trouvé' });
            return;
        }
        const validated = updateCoursSchema.parse(req.body);
        const course = await prisma_1.default.cours.update({
            where: { id: courseId },
            data: {
                ...(validated.title !== undefined && { title: validated.title }),
                ...(validated.description !== undefined && { description: validated.description }),
                ...(validated.categoryId !== undefined && { categoryId: validated.categoryId }),
                ...(validated.niveau !== undefined && { niveau: validated.niveau }),
                ...(validated.serie !== undefined && { serie: validated.serie }),
            },
            include: {
                category: { select: { id: true, name: true } },
                _count: { select: { videos: true, pdfs: true, enrollments: true } },
            },
        });
        res.json({ message: 'Cours mis à jour', course });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Erreur de validation', details: error.errors });
            return;
        }
        logger.error('Erreur updateCourse mentor:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.updateCourse = updateCourse;
const deleteCourse = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const courseId = parseInt(req.params.courseId);
        const existing = await prisma_1.default.cours.findFirst({ where: { id: courseId, adminId: req.user.id } });
        if (!existing) {
            res.status(404).json({ error: 'Cours non trouvé' });
            return;
        }
        await prisma_1.default.cours.delete({ where: { id: courseId } });
        res.json({ message: 'Cours supprimé' });
    }
    catch (error) {
        logger.error('Erreur deleteCourse mentor:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.deleteCourse = deleteCourse;
const updateCourseStatus = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const courseId = parseInt(req.params.courseId);
        const existing = await prisma_1.default.cours.findFirst({ where: { id: courseId, adminId: req.user.id } });
        if (!existing) {
            res.status(404).json({ error: 'Cours non trouvé' });
            return;
        }
        const validated = updateCoursStatusSchema.parse(req.body);
        const course = await prisma_1.default.cours.update({
            where: { id: courseId },
            data: { status: validated.status },
        });
        res.json({ message: 'Statut mis à jour', course });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Erreur de validation', details: error.errors });
            return;
        }
        logger.error('Erreur updateCourseStatus mentor:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.updateCourseStatus = updateCourseStatus;
const getCourseDetail = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const courseId = parseInt(req.params.courseId);
        const course = await prisma_1.default.cours.findUnique({
            where: { id: courseId },
            include: {
                admin: { select: { id: true, firstName: true, lastName: true } },
                category: { select: { id: true, name: true } },
                videos: { orderBy: { position: 'asc' } },
                pdfs: { orderBy: { position: 'asc' } },
                _count: { select: { videos: true, pdfs: true, enrollments: true } },
            },
        });
        if (!course) {
            res.status(404).json({ error: 'Cours non trouvé' });
            return;
        }
        const isOwn = course.adminId === req.user.id;
        let isAdminMatching = false;
        if (!isOwn) {
            const mentor = await prisma_1.default.user.findUnique({
                where: { id: req.user.id },
                select: { niveauResponsable: true, serieResponsable: true },
            });
            if (mentor?.niveauResponsable) {
                isAdminMatching = course.niveau === mentor.niveauResponsable &&
                    ((course.niveau === 'PREMIERE' || course.niveau === 'TERMINALE') && mentor.serieResponsable
                        ? course.serie === mentor.serieResponsable
                        : true);
            }
        }
        if (!isOwn && !isAdminMatching) {
            res.status(403).json({ error: 'Accès interdit' });
            return;
        }
        res.json({ course, isOwn });
    }
    catch (error) {
        logger.error('Erreur getCourseDetail mentor:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getCourseDetail = getCourseDetail;
const hasAccessToCourse = async (mentorId, courseId) => {
    const course = await prisma_1.default.cours.findUnique({ where: { id: courseId }, select: { adminId: true, niveau: true, serie: true } });
    if (!course)
        return false;
    if (course.adminId === mentorId)
        return true;
    const mentor = await prisma_1.default.user.findUnique({ where: { id: mentorId }, select: { niveauResponsable: true, serieResponsable: true } });
    if (!mentor?.niveauResponsable)
        return false;
    if (course.niveau !== mentor.niveauResponsable)
        return false;
    if ((course.niveau === 'PREMIERE' || course.niveau === 'TERMINALE') && mentor.serieResponsable) {
        return course.serie === mentor.serieResponsable;
    }
    return true;
};
const uploadVideoSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).optional(),
    description: zod_1.z.string().optional(),
    duration: zod_1.z.number().int().min(0).optional(),
    position: zod_1.z.number().int().min(0).optional(),
    isRequired: zod_1.z.boolean().optional(),
});
const uploadPdfSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).optional(),
    description: zod_1.z.string().optional(),
    pageCount: zod_1.z.number().int().min(0).optional(),
    position: zod_1.z.number().int().min(0).optional(),
});
const reorderSchema = zod_1.z.object({
    items: zod_1.z.array(zod_1.z.object({ id: zod_1.z.number(), position: zod_1.z.number() })),
});
const uploadVideo = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const courseId = parseInt(req.params.courseId);
        const file = req.file;
        if (!file) {
            res.status(400).json({ error: 'Fichier vidéo requis' });
            return;
        }
        if (!(await hasAccessToCourse(req.user.id, courseId))) {
            res.status(403).json({ error: 'Accès interdit' });
            return;
        }
        const maxPosition = await prisma_1.default.video.aggregate({ where: { courseId }, _max: { position: true } });
        const nextPosition = (maxPosition._max.position ?? -1) + 1;
        const video = await prisma_1.default.video.create({
            data: {
                title: req.body.title || file.originalname,
                description: req.body.description || null,
                url: file.path,
                duration: req.body.duration ? parseInt(req.body.duration) : 0,
                position: req.body.position ? parseInt(req.body.position) : nextPosition,
                isRequired: req.body.isRequired !== 'false',
                courseId,
            },
        });
        res.status(201).json({ message: 'Vidéo uploadée avec succès', video });
    }
    catch (error) {
        logger.error('Erreur uploadVideo mentor:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.uploadVideo = uploadVideo;
const updateVideo = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const videoId = parseInt(req.params.videoId);
        const validated = uploadVideoSchema.partial().parse(req.body);
        const video = await prisma_1.default.video.findUnique({ where: { id: videoId } });
        if (!video) {
            res.status(404).json({ error: 'Vidéo non trouvée' });
            return;
        }
        if (!(await hasAccessToCourse(req.user.id, video.courseId))) {
            res.status(403).json({ error: 'Accès interdit' });
            return;
        }
        const updated = await prisma_1.default.video.update({ where: { id: videoId }, data: validated });
        res.json({ message: 'Vidéo mise à jour', video: updated });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Erreur de validation', details: error.errors });
            return;
        }
        logger.error('Erreur updateVideo mentor:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.updateVideo = updateVideo;
const deleteVideo = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const videoId = parseInt(req.params.videoId);
        const video = await prisma_1.default.video.findUnique({ where: { id: videoId } });
        if (!video) {
            res.status(404).json({ error: 'Vidéo non trouvée' });
            return;
        }
        if (!(await hasAccessToCourse(req.user.id, video.courseId))) {
            res.status(403).json({ error: 'Accès interdit' });
            return;
        }
        const publicId = extractCloudinaryPublicId(video.url, 'video');
        if (publicId) {
            await upload_1.cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
        }
        await prisma_1.default.video.delete({ where: { id: videoId } });
        res.json({ message: 'Vidéo supprimée avec succès' });
    }
    catch (error) {
        logger.error('Erreur deleteVideo mentor:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.deleteVideo = deleteVideo;
const reorderVideos = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const courseId = parseInt(req.params.courseId);
        const validated = reorderSchema.parse(req.body);
        if (!(await hasAccessToCourse(req.user.id, courseId))) {
            res.status(403).json({ error: 'Accès interdit' });
            return;
        }
        await Promise.all(validated.items.map((item) => prisma_1.default.video.updateMany({ where: { id: item.id, courseId }, data: { position: item.position } })));
        const videos = await prisma_1.default.video.findMany({ where: { courseId }, orderBy: { position: 'asc' } });
        res.json({ message: 'Ordre mis à jour', videos });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Erreur de validation', details: error.errors });
            return;
        }
        logger.error('Erreur reorderVideos mentor:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.reorderVideos = reorderVideos;
const uploadPdf = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const courseId = parseInt(req.params.courseId);
        const file = req.file;
        if (!file) {
            res.status(400).json({ error: 'Fichier PDF requis' });
            return;
        }
        if (!(await hasAccessToCourse(req.user.id, courseId))) {
            res.status(403).json({ error: 'Accès interdit' });
            return;
        }
        const maxPosition = await prisma_1.default.pDF.aggregate({ where: { courseId }, _max: { position: true } });
        const nextPosition = (maxPosition._max.position ?? -1) + 1;
        const pdf = await prisma_1.default.pDF.create({
            data: {
                title: req.body.title || file.originalname,
                description: req.body.description || null,
                url: file.path,
                pageCount: req.body.pageCount ? parseInt(req.body.pageCount) : 0,
                position: req.body.position ? parseInt(req.body.position) : nextPosition,
                courseId,
            },
        });
        res.status(201).json({ message: 'PDF uploadé avec succès', pdf });
    }
    catch (error) {
        logger.error('Erreur uploadPdf mentor:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.uploadPdf = uploadPdf;
const updatePdf = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const pdfId = parseInt(req.params.pdfId);
        const validated = uploadPdfSchema.partial().parse(req.body);
        const pdf = await prisma_1.default.pDF.findUnique({ where: { id: pdfId } });
        if (!pdf) {
            res.status(404).json({ error: 'PDF non trouvé' });
            return;
        }
        if (!(await hasAccessToCourse(req.user.id, pdf.courseId))) {
            res.status(403).json({ error: 'Accès interdit' });
            return;
        }
        const updated = await prisma_1.default.pDF.update({ where: { id: pdfId }, data: validated });
        res.json({ message: 'PDF mis à jour', pdf: updated });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Erreur de validation', details: error.errors });
            return;
        }
        logger.error('Erreur updatePdf mentor:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.updatePdf = updatePdf;
const deletePdf = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const pdfId = parseInt(req.params.pdfId);
        const pdf = await prisma_1.default.pDF.findUnique({ where: { id: pdfId } });
        if (!pdf) {
            res.status(404).json({ error: 'PDF non trouvé' });
            return;
        }
        if (!(await hasAccessToCourse(req.user.id, pdf.courseId))) {
            res.status(403).json({ error: 'Accès interdit' });
            return;
        }
        const publicId = extractCloudinaryPublicId(pdf.url, 'raw');
        if (publicId) {
            await upload_1.cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
        }
        await prisma_1.default.pDF.delete({ where: { id: pdfId } });
        res.json({ message: 'PDF supprimé avec succès' });
    }
    catch (error) {
        logger.error('Erreur deletePdf mentor:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.deletePdf = deletePdf;
const reorderPdfs = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const courseId = parseInt(req.params.courseId);
        const validated = reorderSchema.parse(req.body);
        if (!(await hasAccessToCourse(req.user.id, courseId))) {
            res.status(403).json({ error: 'Accès interdit' });
            return;
        }
        await Promise.all(validated.items.map((item) => prisma_1.default.pDF.updateMany({ where: { id: item.id, courseId }, data: { position: item.position } })));
        const pdfs = await prisma_1.default.pDF.findMany({ where: { courseId }, orderBy: { position: 'asc' } });
        res.json({ message: 'Ordre mis à jour', pdfs });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Erreur de validation', details: error.errors });
            return;
        }
        logger.error('Erreur reorderPdfs mentor:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.reorderPdfs = reorderPdfs;
const getMentorStudentsForChat = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        const mentor = await prisma_1.default.user.findUnique({
            where: { id: req.user.id },
            select: { niveauResponsable: true, serieResponsable: true },
        });
        const niveau = mentor?.niveauResponsable;
        const serie = mentor?.serieResponsable;
        const studentWhere = { role: 'APPRENANT', niveau: niveau || undefined };
        if ((niveau === 'PREMIERE' || niveau === 'TERMINALE') && serie) {
            studentWhere.serie = serie;
        }
        const students = await prisma_1.default.user.findMany({
            where: studentWhere,
            select: { id: true, firstName: true, lastName: true, email: true, avatar: true, role: true },
            orderBy: { firstName: 'asc' },
        });
        res.json({ students });
    }
    catch (error) {
        logger.error('Erreur getMentorStudentsForChat:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
};
exports.getMentorStudentsForChat = getMentorStudentsForChat;
//# sourceMappingURL=mentorController.js.map