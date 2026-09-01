import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { cloudinary } from '../middleware/upload';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

const MATERIAL_TYPES = ['pdf', 'video', 'image', 'link', 'text'];

const extractCloudinaryResourceType = (type: string): string => {
  if (type === 'video') return 'video';
  if (type === 'image') return 'image';
  return 'raw';
};

const extractCloudinaryPublicId = (url: string, resourceType: string): string | null => {
  const match = url.match(new RegExp(`${resourceType}/upload/(?:v\\d+/)?(.+?)(?:\\.[^.]+)?$`));
  return match ? match[1] : null;
};

const createFolderSchema = z.object({
  name: z.string().min(1, 'Le nom est requis').max(255),
  parentId: z.number().int().positive().nullable().optional(),
});

const updateFolderSchema = z.object({
  name: z.string().min(1, 'Le nom est requis').max(255),
});

const createMaterialSchema = z.object({
  title: z.string().min(1, 'Le titre est requis').max(255),
  type: z.enum(MATERIAL_TYPES as [string, ...string[]]),
  fileUrl: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
});

// ---------------------------------------------------------------------------
// FOLDERS
// ---------------------------------------------------------------------------

// GET /cours/:courseId/folders?parentId=null
export const getFolders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const courseId = req.params.courseId ?? req.params.id;
    const courseIdNum = parseInt(courseId);

    const parentIdParam = req.query.parentId as string | undefined;
    const parentId = parentIdParam && parentIdParam !== 'null' && parentIdParam !== '' ? parseInt(parentIdParam) : null;

    const where: any = { courseId: courseIdNum };

    // Si parentId fourni -> dossiers enfants de ce parent. Sinon -> dossiers parents (parentId null).
    where.parentId = parentId;

    const folders = await prisma.folder.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        _count: {
          select: { children: true, materials: true },
        },
      },
    });

    res.json({ folders });
  } catch (error) {
    logger.error('Erreur getFolders:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

// POST /cours/:courseId/folders
export const createFolder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const courseId = req.params.courseId ?? req.params.id;
    const courseIdNum = parseInt(courseId);
    const validated = createFolderSchema.parse(req.body);

    const course = await prisma.cours.findUnique({ where: { id: courseIdNum } });
    if (!course) {
      res.status(404).json({ error: 'Cours non trouvé' });
      return;
    }

    // parentId fourni -> dossier enfant. parentId null/absent -> dossier parent.
    const requestedParentId = validated.parentId ?? null;

    if (requestedParentId !== null) {
      const parent = await prisma.folder.findUnique({
        where: { id: requestedParentId },
      });

      if (!parent || parent.courseId !== courseIdNum) {
        res.status(404).json({ error: 'Dossier parent non trouvé' });
        return;
      }

      // Règle 3 : pas de 3ème niveau. Un dossier enfant ne peut pas avoir de sous-dossier.
      if (parent.parentId !== null) {
        res.status(400).json({ error: 'Impossible de créer un sous-dossier dans un dossier enfant' });
        return;
      }
    }

    const folder = await prisma.folder.create({
      data: {
        name: validated.name,
        courseId: courseIdNum,
        parentId: requestedParentId,
      },
    });

    res.status(201).json({ message: 'Dossier créé avec succès', folder });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Erreur de validation', details: error.errors });
      return;
    }
    logger.error('Erreur createFolder:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

// PUT /folders/:folderId (renommer)
export const updateFolder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { folderId } = req.params;
    const validated = updateFolderSchema.parse(req.body);

    const folder = await prisma.folder.findUnique({ where: { id: parseInt(folderId) } });
    if (!folder) {
      res.status(404).json({ error: 'Dossier non trouvé' });
      return;
    }

    const updated = await prisma.folder.update({
      where: { id: parseInt(folderId) },
      data: { name: validated.name },
    });

    res.json({ message: 'Dossier renommé', folder: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Erreur de validation', details: error.errors });
      return;
    }
    logger.error('Erreur updateFolder:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

// DELETE /folders/:folderId (cascade)
export const deleteFolder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { folderId } = req.params;
    const folderIdNum = parseInt(folderId);

    const folder = await prisma.folder.findUnique({ where: { id: folderIdNum } });
    if (!folder) {
      res.status(404).json({ error: 'Dossier non trouvé' });
      return;
    }

    // Suppression en cascade : récupérer tous les supports (du dossier ET de ses enfants)
    // pour purger les fichiers Cloudinary avant suppression des lignes.
    const isParent = folder.parentId === null;
    const folderIds = isParent
      ? await prisma.folder.findMany({
          where: { parentId: folderIdNum },
          select: { id: true },
        }).then((rows) => rows.map((r) => r.id))
      : [];

    const allFolderIds = isParent ? [...folderIds, folderIdNum] : [folderIdNum];

    const materials = await prisma.courseMaterial.findMany({
      where: { folderId: { in: allFolderIds } },
      select: { fileUrl: true, type: true },
    });

    // Purge Cloudinary pour les fichiers (video/image/pdf)
    for (const m of materials) {
      if (m.fileUrl && m.type !== 'link' && m.type !== 'text') {
        const resourceType = extractCloudinaryResourceType(m.type);
        const publicId = extractCloudinaryPublicId(m.fileUrl, resourceType);
        if (publicId) {
          await cloudinary.uploader.destroy(publicId, { resource_type: resourceType }).catch(() => {});
        }
      }
    }

    // Le FK parentId (onDelete: Cascade) et celui de materials (onDelete: Cascade)
    // suppriment automatiquement les enfants et leurs supports.
    await prisma.folder.delete({ where: { id: folderIdNum } });

    res.json({ message: 'Dossier et son contenu supprimés' });
  } catch (error) {
    logger.error('Erreur deleteFolder:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

// ---------------------------------------------------------------------------
// MATERIALS
// ---------------------------------------------------------------------------

// GET /folders/:folderId/materials
export const getMaterials = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { folderId } = req.params;
    const folderIdNum = parseInt(folderId);

    const folder = await prisma.folder.findUnique({ where: { id: folderIdNum } });
    if (!folder) {
      res.status(404).json({ error: 'Dossier non trouvé' });
      return;
    }

    const materials = await prisma.courseMaterial.findMany({
      where: { folderId: folderIdNum },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ materials });
  } catch (error) {
    logger.error('Erreur getMaterials:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

// POST /folders/:folderId/materials
export const createMaterial = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { folderId } = req.params;
    const folderIdNum = parseInt(folderId);
    const validated = createMaterialSchema.parse(req.body);

    const folder = await prisma.folder.findUnique({ where: { id: folderIdNum } });
    if (!folder) {
      res.status(404).json({ error: 'Dossier non trouvé' });
      return;
    }

    // Règle par type : link/text -> contenu requis ; pdf/video/image -> fichier requis.
    if (validated.type === 'link' || validated.type === 'text') {
      if (!validated.content || !validated.content.trim()) {
        res.status(400).json({ error: `Un contenu est requis pour le type ${validated.type}` });
        return;
      }
    } else {
      if (!validated.fileUrl) {
        res.status(400).json({ error: 'Un fichier est requis pour ce type de support' });
        return;
      }
    }

    const material = await prisma.courseMaterial.create({
      data: {
        folderId: folderIdNum,
        title: validated.title,
        type: validated.type,
        fileUrl: validated.fileUrl ?? null,
        content: validated.content ?? null,
      },
    });

    res.status(201).json({ message: 'Support ajouté avec succès', material });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Erreur de validation', details: error.errors });
      return;
    }
    logger.error('Erreur createMaterial:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};

// DELETE /materials/:materialId
export const deleteMaterial = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { materialId } = req.params;
    const materialIdNum = parseInt(materialId);

    const material = await prisma.courseMaterial.findUnique({ where: { id: materialIdNum } });
    if (!material) {
      res.status(404).json({ error: 'Support non trouvé' });
      return;
    }

    if (material.fileUrl && material.type !== 'link' && material.type !== 'text') {
      const resourceType = extractCloudinaryResourceType(material.type);
      const publicId = extractCloudinaryPublicId(material.fileUrl, resourceType);
      if (publicId) {
        await cloudinary.uploader.destroy(publicId, { resource_type: resourceType }).catch(() => {});
      }
    }

    await prisma.courseMaterial.delete({ where: { id: materialIdNum } });

    res.json({ message: 'Support supprimé' });
  } catch (error) {
    logger.error('Erreur deleteMaterial:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};
