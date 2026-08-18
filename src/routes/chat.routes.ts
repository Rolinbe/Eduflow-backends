import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getConversations,
  getOrCreateConversation,
  getMessages,
  getUnreadCount,
  getAllStudents,
  getAdminUser,
} from '../controllers/chatController';

const router = Router();

router.get('/conversations', authenticate, getConversations);
router.post('/conversations', authenticate, getOrCreateConversation);
router.get('/conversations/:id/messages', authenticate, getMessages);
router.get('/unread-count', authenticate, getUnreadCount);
router.get('/students', authenticate, getAllStudents);
router.get('/admin-user', authenticate, getAdminUser);

export default router;
