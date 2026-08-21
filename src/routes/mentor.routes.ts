import { Router } from 'express';
import {
  getDashboard,
  getStudents,
  getStudentDetail,
  getCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  updateCourseStatus,
  getCourseDetail,
  uploadVideo,
  updateVideo,
  deleteVideo,
  reorderVideos,
  uploadPdf,
  updatePdf,
  deletePdf,
  reorderPdfs,
  getMentorStudentsForChat,
} from '../controllers/mentorController';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../controllers/apprenantController';
import { authenticate, mentorOnly } from '../middleware/auth';
import { uploadVideo as uploadVideoMiddleware, uploadPdf as uploadPdfMiddleware, handleMulterError } from '../middleware/upload';

const router = Router();

router.use(authenticate, mentorOnly);

router.get('/dashboard', getDashboard);
router.get('/students', getStudents);
router.get('/students/:studentId', getStudentDetail);

router.get('/cours', getCourses);
router.post('/cours', createCourse);
router.put('/cours/:courseId', updateCourse);
router.delete('/cours/:courseId', deleteCourse);
router.patch('/cours/:courseId/status', updateCourseStatus);

router.get('/cours/:courseId/detail', getCourseDetail);

router.post('/cours/:courseId/videos', uploadVideoMiddleware.single('video'), handleMulterError, uploadVideo);
router.put('/videos/:videoId', updateVideo);
router.delete('/videos/:videoId', deleteVideo);
router.put('/cours/:courseId/videos/reorder', reorderVideos);

router.post('/cours/:courseId/pdfs', uploadPdfMiddleware.single('pdf'), handleMulterError, uploadPdf);
router.put('/pdfs/:pdfId', updatePdf);
router.delete('/pdfs/:pdfId', deletePdf);
router.put('/cours/:courseId/pdfs/reorder', reorderPdfs);

router.get('/chat/students', getMentorStudentsForChat);

router.get('/notifications', getNotifications);
router.patch('/notifications/:id/read', markNotificationRead);
router.patch('/notifications/read-all', markAllNotificationsRead);

export default router;
