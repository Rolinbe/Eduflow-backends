import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
export declare const authenticate: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const authorize: (...roles: string[]) => (req: AuthRequest, res: Response, next: NextFunction) => void;
export declare const adminOnly: (req: AuthRequest, res: Response, next: NextFunction) => void;
export declare const mentorOnly: (req: AuthRequest, res: Response, next: NextFunction) => void;
export declare const apprenantOrAdmin: (req: AuthRequest, res: Response, next: NextFunction) => void;
export declare const mentorOrAdmin: (req: AuthRequest, res: Response, next: NextFunction) => void;
export declare const allRoles: (req: AuthRequest, res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.d.ts.map