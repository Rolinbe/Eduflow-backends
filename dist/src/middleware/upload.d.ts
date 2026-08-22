import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { Request } from 'express';
export declare const uploadVideo: multer.Multer;
export declare const uploadPdf: multer.Multer;
export declare const uploadImage: multer.Multer;
export { cloudinary };
export declare const handleMulterError: (err: any, req: Request, res: any, next: any) => void;
//# sourceMappingURL=upload.d.ts.map