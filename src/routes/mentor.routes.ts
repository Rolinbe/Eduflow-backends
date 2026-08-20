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
  getMentorStudentsForChat,
} from '../controllers/mentorController';
import { authenticate, mentorOnly } from '../middleware/auth';

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

router.get('/chat/students', getMentorStudentsForChat);

export default router;
