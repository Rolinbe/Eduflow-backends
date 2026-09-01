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
  createVideoByUrl,
  createPdfByUrl,
  getMentorStudentsForChat,
  getModules,
  createModule,
  updateModule,
  deleteModule,
  reorderModules,
} from '../controllers/mentorController';
import {
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  getMaterials,
  createMaterial,
  deleteMaterial,
} from '../controllers/folderController';
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
router.post('/cours/:courseId/videos-url', createVideoByUrl);
router.put('/videos/:videoId', updateVideo);
router.delete('/videos/:videoId', deleteVideo);
router.put('/cours/:courseId/videos/reorder', reorderVideos);

router.post('/cours/:courseId/pdfs', uploadPdfMiddleware.single('pdf'), handleMulterError, uploadPdf);
router.post('/cours/:courseId/pdfs-url', createPdfByUrl);
router.put('/pdfs/:pdfId', updatePdf);
router.delete('/pdfs/:pdfId', deletePdf);
router.put('/cours/:courseId/pdfs/reorder', reorderPdfs);

router.get('/cours/:courseId/modules', getModules);
router.post('/cours/:courseId/modules', createModule);
router.put('/modules/:moduleId', updateModule);
router.delete('/modules/:moduleId', deleteModule);
router.put('/cours/:courseId/modules/reorder', reorderModules);

// Folder management (hierarchical folders)
router.get('/cours/:courseId/folders', getFolders);
router.post('/cours/:courseId/folders', createFolder);
router.put('/folders/:folderId', updateFolder);
router.delete('/folders/:folderId', deleteFolder);

// Course materials
router.get('/folders/:folderId/materials', getMaterials);
router.post('/folders/:folderId/materials', createMaterial);
router.delete('/materials/:materialId', deleteMaterial);

router.get('/chat/students', getMentorStudentsForChat);

router.get('/notifications', getNotifications);
router.patch('/notifications/:id/read', markNotificationRead);
router.patch('/notifications/read-all', markAllNotificationsRead);

export default router;
