import { Router } from 'express';
import {
  register,
  login,
  logout,
  refreshToken,
  forgotPassword,
  resetPassword,
  changePassword,
  getMe,
  updateMe,
  getCloudinarySignature,
} from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { uploadImage, handleMulterError } from '../middleware/upload';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', authenticate, logout);
router.post('/refresh-token', refreshToken);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.put('/change-password', authenticate, changePassword);
router.get('/me', authenticate, getMe);
router.put('/me', authenticate, uploadImage.single('avatar'), handleMulterError, updateMe);
router.post('/cloudinary-sign', authenticate, getCloudinarySignature);

export default router;
