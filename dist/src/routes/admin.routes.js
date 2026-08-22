"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const adminController_1 = require("../controllers/adminController");
const auth_1 = require("../middleware/auth");
const upload_1 = require("../middleware/upload");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.use(auth_1.adminOnly);
// Stats
router.get('/stats', adminController_1.getStats);
// Categories
router.get('/categories', adminController_1.getCategories);
// Cours CRUD
router.get('/cours', adminController_1.getCours);
router.post('/cours', adminController_1.createCours);
router.put('/cours/:id', adminController_1.updateCours);
router.delete('/cours/:id', adminController_1.deleteCours);
router.patch('/cours/:id/status', adminController_1.updateCoursStatus);
// Video management
router.post('/cours/:id/videos', upload_1.uploadVideo.single('video'), upload_1.handleMulterError, adminController_1.uploadVideo);
router.put('/videos/:videoId', adminController_1.updateVideo);
router.delete('/videos/:videoId', adminController_1.deleteVideo);
router.put('/cours/:id/videos/reorder', adminController_1.reorderVideos);
// PDF management
router.post('/cours/:id/pdfs', upload_1.uploadPdf.single('pdf'), upload_1.handleMulterError, adminController_1.uploadPdf);
router.put('/pdfs/:pdfId', adminController_1.updatePdf);
router.delete('/pdfs/:pdfId', adminController_1.deletePdf);
router.put('/cours/:id/pdfs/reorder', adminController_1.reorderPdfs);
// User management
router.get('/users', adminController_1.getUsers);
router.get('/users/:id', adminController_1.getUserById);
router.patch('/users/:id/status', adminController_1.updateUserStatus);
router.put('/users/:id/profile', adminController_1.updateUserProfile);
router.put('/users/:id/reset-password', adminController_1.resetUserPassword);
router.delete('/users/:id', adminController_1.deleteUser);
router.get('/users/:id/progression', adminController_1.getUserProgression);
// Notifications
router.get('/notifications', adminController_1.getAdminNotifications);
router.patch('/notifications/:id/read', adminController_1.markAdminNotificationRead);
router.patch('/notifications/read-all', adminController_1.markAllAdminNotificationsRead);
// Announcements
router.get('/announcements', adminController_1.getAnnouncements);
router.post('/announcements', adminController_1.createAnnouncement);
router.delete('/announcements/:id', adminController_1.deleteAnnouncement);
exports.default = router;
//# sourceMappingURL=admin.routes.js.map