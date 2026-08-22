"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const apprenantController_1 = require("../controllers/apprenantController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Public routes
router.get('/verify-certificate/:uniqueNumber', apprenantController_1.verifyCertificate);
router.use(auth_1.authenticate);
// Courses
router.get('/cours', apprenantController_1.getAvailableCours);
router.get('/cours/:id', apprenantController_1.getCoursDetail);
router.post('/cours/:id/enroll', apprenantController_1.enrollInCours);
router.get('/my-cours', apprenantController_1.getMyCours);
// Progression
router.get('/cours/:id/progression', apprenantController_1.getMyProgression);
router.put('/lessons/:id/video-progress', apprenantController_1.updateVideoProgress);
router.put('/lessons/:id/pdf-progress', apprenantController_1.updatePdfProgress);
router.get('/progression', apprenantController_1.getGlobalProgression);
// Comments
router.get('/cours/:id/commentaires', apprenantController_1.getCommentaires);
router.post('/cours/:id/commentaires', apprenantController_1.createCommentaire);
router.post('/commentaires/:commentId/reply', apprenantController_1.replyToCommentaire);
router.post('/commentaires/:commentId/like', apprenantController_1.likeCommentaire);
// Notifications
router.get('/notifications', apprenantController_1.getNotifications);
router.patch('/notifications/:id/read', apprenantController_1.markNotificationRead);
router.patch('/notifications/read-all', apprenantController_1.markAllNotificationsRead);
// Certificates
router.get('/certificates', apprenantController_1.getMyCertificates);
router.get('/cours/:id/certificate', apprenantController_1.getCertificate);
// Categories
router.get('/categories', apprenantController_1.getCategories);
// Announcements
router.get('/announcements', apprenantController_1.getAnnouncements);
exports.default = router;
//# sourceMappingURL=apprenant.routes.js.map