"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleMulterError = exports.cloudinary = exports.uploadImage = exports.uploadPdf = exports.uploadVideo = void 0;
const cloudinary_1 = require("cloudinary");
Object.defineProperty(exports, "cloudinary", { enumerable: true, get: function () { return cloudinary_1.v2; } });
const multer_storage_cloudinary_1 = require("multer-storage-cloudinary");
const multer_1 = __importDefault(require("multer"));
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
const videoStorage = new multer_storage_cloudinary_1.CloudinaryStorage({
    cloudinary: cloudinary_1.v2,
    params: async (req, file) => ({
        folder: 'edukaflow/videos',
        resource_type: 'video',
        public_id: `${Date.now()}-${file.originalname.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    }),
});
const pdfStorage = new multer_storage_cloudinary_1.CloudinaryStorage({
    cloudinary: cloudinary_1.v2,
    params: async (req, file) => ({
        folder: 'edukaflow/pdfs',
        resource_type: 'raw',
        public_id: `${Date.now()}-${file.originalname.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    }),
});
const imageStorage = new multer_storage_cloudinary_1.CloudinaryStorage({
    cloudinary: cloudinary_1.v2,
    params: async (req, file) => ({
        folder: 'edukaflow/images',
        resource_type: 'image',
        public_id: `${Date.now()}-${file.originalname.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    }),
});
const fileFilter = (req, file, cb) => {
    const allowedMimes = [
        'video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm',
        'application/pdf',
        'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    ];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error(`Type de fichier non supporté: ${file.mimetype}`));
    }
};
exports.uploadVideo = (0, multer_1.default)({
    storage: videoStorage,
    fileFilter,
    limits: {
        fileSize: parseInt(process.env.MAX_VIDEO_SIZE || '524288000'),
    },
});
exports.uploadPdf = (0, multer_1.default)({
    storage: pdfStorage,
    fileFilter,
    limits: {
        fileSize: parseInt(process.env.MAX_PDF_SIZE || '20971520'),
    },
});
exports.uploadImage = (0, multer_1.default)({
    storage: imageStorage,
    fileFilter,
    limits: {
        fileSize: parseInt(process.env.MAX_IMAGE_SIZE || '5242880'),
    },
});
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer_1.default.MulterError) {
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
exports.handleMulterError = handleMulterError;
//# sourceMappingURL=upload.js.map