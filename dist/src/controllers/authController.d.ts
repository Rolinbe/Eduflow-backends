import { Response } from 'express';
import { AuthRequest } from '../types';
export declare const register: (req: AuthRequest, res: Response) => Promise<void>;
export declare const login: (req: AuthRequest, res: Response) => Promise<void>;
export declare const logout: (req: AuthRequest, res: Response) => Promise<void>;
export declare const refreshToken: (req: AuthRequest, res: Response) => Promise<void>;
export declare const forgotPassword: (req: AuthRequest, res: Response) => Promise<void>;
export declare const resetPassword: (req: AuthRequest, res: Response) => Promise<void>;
export declare const changePassword: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getMe: (req: AuthRequest, res: Response) => Promise<void>;
export declare const updateMe: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=authController.d.ts.map