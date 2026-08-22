"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const auth_1 = require("../middleware/auth");
const upload_1 = require("../middleware/upload");
const router = (0, express_1.Router)();
router.post('/register', authController_1.register);
router.post('/login', authController_1.login);
router.post('/logout', auth_1.authenticate, authController_1.logout);
router.post('/refresh-token', authController_1.refreshToken);
router.post('/forgot-password', authController_1.forgotPassword);
router.post('/reset-password', authController_1.resetPassword);
router.put('/change-password', auth_1.authenticate, authController_1.changePassword);
router.get('/me', auth_1.authenticate, authController_1.getMe);
router.put('/me', auth_1.authenticate, upload_1.uploadImage.single('avatar'), upload_1.handleMulterError, authController_1.updateMe);
exports.default = router;
//# sourceMappingURL=auth.routes.js.map