import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import { Request } from 'express';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const videoStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req: Request, file: Express.Multer.File) => ({
    folder: 'edukaflow/videos',
    resource_type: 'video',
    public_id: `${Date.now()}-${file.originalname.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_')}`,
  }),
});

const pdfStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req: Request, file: Express.Multer.File) => ({
    folder: 'edukaflow/pdfs',
    resource_type: 'raw',
    public_id: `${Date.now()}-${file.originalname.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_')}`,
  }),
});

const imageStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req: Request, file: Express.Multer.File) => ({
    folder: 'edukaflow/images',
    resource_type: 'image',
    public_id: `${Date.now()}-${file.originalname.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_')}`,
  }),
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    'video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm',
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Type de fichier non supporté: ${file.mimetype}`));
  }
};

export const uploadVideo = multer({
  storage: videoStorage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_VIDEO_SIZE || '524288000'),
  },
});

export const uploadPdf = multer({
  storage: pdfStorage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_PDF_SIZE || '20971520'),
  },
});

export const uploadImage = multer({
  storage: imageStorage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_IMAGE_SIZE || '5242880'),
  },
});

export { cloudinary };

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
