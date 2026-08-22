import { Response } from 'express';
import { AuthRequest } from '../types';
export declare const getConversations: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getOrCreateConversation: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getMessages: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getUnreadCount: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getAllStudents: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getAdminUser: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=chatController.d.ts.map