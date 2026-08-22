"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const chatController_1 = require("../controllers/chatController");
const router = (0, express_1.Router)();
router.get('/conversations', auth_1.authenticate, chatController_1.getConversations);
router.post('/conversations', auth_1.authenticate, chatController_1.getOrCreateConversation);
router.get('/conversations/:id/messages', auth_1.authenticate, chatController_1.getMessages);
router.get('/unread-count', auth_1.authenticate, chatController_1.getUnreadCount);
router.get('/students', auth_1.authenticate, chatController_1.getAllStudents);
router.get('/admin-user', auth_1.authenticate, chatController_1.getAdminUser);
exports.default = router;
//# sourceMappingURL=chat.routes.js.map