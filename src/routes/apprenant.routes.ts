import { Router } from 'express';
import {
  getAvailableCours,
  getCoursDetail,
  enrollInCours,
  getMyCours,
  getMyProgression,
  updateVideoProgress,
  updatePdfProgress,
  getGlobalProgression,
  getCommentaires,
  createCommentaire,
  replyToCommentaire,
  likeCommentaire,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getCertificate,
  getMyCertificates,
  verifyCertificate,
  getCategories,
  getAnnouncements,
} from '../controllers/apprenantController';
import { authenticate } from '../middleware/auth';
import { getFolders, getMaterials } from '../controllers/folderController';

const router = Router();

// Public routes
router.get('/verify-certificate/:uniqueNumber', verifyCertificate);

router.use(authenticate);

// Courses
router.get('/cours', getAvailableCours);
router.get('/cours/:id', getCoursDetail);
router.post('/cours/:id/enroll', enrollInCours);
router.get('/my-cours', getMyCours);

// Folders & materials (lecture seule pour l'apprenant)
router.get('/cours/:courseId/folders', getFolders);
router.get('/folders/:folderId/materials', getMaterials);

// Progression
router.get('/cours/:id/progression', getMyProgression);
router.put('/lessons/:id/video-progress', updateVideoProgress);
router.put('/lessons/:id/pdf-progress', updatePdfProgress);
router.get('/progression', getGlobalProgression);

// Comments
router.get('/cours/:id/commentaires', getCommentaires);
router.post('/cours/:id/commentaires', createCommentaire);
router.post('/commentaires/:commentId/reply', replyToCommentaire);
router.post('/commentaires/:commentId/like', likeCommentaire);

// Notifications
router.get('/notifications', getNotifications);
router.patch('/notifications/:id/read', markNotificationRead);
router.patch('/notifications/read-all', markAllNotificationsRead);

// Certificates
router.get('/certificates', getMyCertificates);
router.get('/cours/:id/certificate', getCertificate);

// Categories
router.get('/categories', getCategories);

// Announcements
router.get('/announcements', getAnnouncements);

export default router;
