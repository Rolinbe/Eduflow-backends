import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getConversations,
  getOrCreateConversation,
  getMessages,
  sendMessage,
  markConversationRead,
  getUnreadCount,
  getAllStudents,
  getAdminUser,
} from '../controllers/chatController';

const router = Router();

router.get('/conversations', authenticate, getConversations);
router.post('/conversations', authenticate, getOrCreateConversation);
router.get('/conversations/:id/messages', authenticate, getMessages);
router.post('/conversations/:id/messages', authenticate, sendMessage);
router.patch('/conversations/:id/read', authenticate, markConversationRead);
router.get('/unread-count', authenticate, getUnreadCount);
router.get('/students', authenticate, getAllStudents);
router.get('/admin-user', authenticate, getAdminUser);

export default router;
