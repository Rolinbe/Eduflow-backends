import { Router } from 'express';
import {
  getStats,
  getCours,
  createCours,
  updateCours,
  deleteCours,
  updateCoursStatus,
  uploadVideo,
  updateVideo,
  deleteVideo,
  reorderVideos,
  uploadPdf,
  updatePdf,
  deletePdf,
  reorderPdfs,
  getUsers,
  getUserById,
  updateUserStatus,
  updateUserProfile,
  getUserProgression,
  getCategories,
  deleteUser,
  resetUserPassword,
  getAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  getAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
} from '../controllers/adminController';
import { authenticate, adminOnly } from '../middleware/auth';
import { uploadVideo as uploadVideoMiddleware, uploadPdf as uploadPdfMiddleware, handleMulterError } from '../middleware/upload';

const router = Router();

router.use(authenticate);
router.use(adminOnly);

// Stats
router.get('/stats', getStats);

// Categories
router.get('/categories', getCategories);

// Cours CRUD
router.get('/cours', getCours);
router.post('/cours', createCours);
router.put('/cours/:id', updateCours);
router.delete('/cours/:id', deleteCours);
router.patch('/cours/:id/status', updateCoursStatus);

// Video management
router.post('/cours/:id/videos', uploadVideoMiddleware.single('video'), handleMulterError, uploadVideo);
router.put('/videos/:videoId', updateVideo);
router.delete('/videos/:videoId', deleteVideo);
router.put('/cours/:id/videos/reorder', reorderVideos);

// PDF management
router.post('/cours/:id/pdfs', uploadPdfMiddleware.single('pdf'), handleMulterError, uploadPdf);
router.put('/pdfs/:pdfId', updatePdf);
router.delete('/pdfs/:pdfId', deletePdf);
router.put('/cours/:id/pdfs/reorder', reorderPdfs);

// User management
router.get('/users', getUsers);
router.get('/users/:id', getUserById);
router.patch('/users/:id/status', updateUserStatus);
router.put('/users/:id/profile', updateUserProfile);
router.put('/users/:id/reset-password', resetUserPassword);
router.delete('/users/:id', deleteUser);
router.get('/users/:id/progression', getUserProgression);

// Notifications
router.get('/notifications', getAdminNotifications);
router.patch('/notifications/:id/read', markAdminNotificationRead);
router.patch('/notifications/read-all', markAllAdminNotificationsRead);

// Announcements
router.get('/announcements', getAnnouncements);
router.post('/announcements', createAnnouncement);
router.delete('/announcements/:id', deleteAnnouncement);

export default router;
