import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { Request } from 'express';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    let subDir = 'others';
    if (file.mimetype.startsWith('video/')) {
      subDir = 'videos';
    } else if (file.mimetype === 'application/pdf') {
      subDir = 'pdfs';
    } else if (file.mimetype.startsWith('image/')) {
      subDir = 'images';
    }
    cb(null, path.join(UPLOAD_DIR, subDir));
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    const uniqueId = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueId}${ext}`);
  },
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = {
    video: ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm'],
    pdf: ['application/pdf'],
    image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  };

  const allAllowed = [...allowedMimes.video, ...allowedMimes.pdf, ...allowedMimes.image];

  if (allAllowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Type de fichier non supporté: ${file.mimetype}`));
  }
};

export const uploadVideo = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_VIDEO_SIZE || '524288000'), // 500MB
  },
});

export const uploadPdf = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_PDF_SIZE || '20971520'), // 20MB
  },
});

export const uploadImage = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_IMAGE_SIZE || '5242880'), // 5MB
  },
});

export const handleMulterError = (err: any, req: Request, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'Le fichier est trop volumineux' });
      return;
    }
    res.status(400).json({ error: `Erreur d'upload: ${err.message}` });
    return;
  }

  if (err.message && err.message.includes('Type de fichier non supporté')) {
    res.status(400).json({ error: err.message });
    return;
  }

  next(err);
};
