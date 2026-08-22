"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.allRoles = exports.mentorOrAdmin = exports.apprenantOrAdmin = exports.mentorOnly = exports.adminOnly = exports.authorize = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwt_1 = require("../config/jwt");
const prisma_1 = __importDefault(require("../config/prisma"));
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Token d\'authentification requis' });
            return;
        }
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jsonwebtoken_1.default.verify(token, jwt_1.jwtConfig.secret);
            const user = await prisma_1.default.user.findUnique({
                where: { id: decoded.id },
                select: { id: true, email: true, role: true, status: true },
            });
            if (!user) {
                res.status(401).json({ error: 'Utilisateur non trouvé' });
                return;
            }
            if (user.status !== 'ACTIF') {
                res.status(403).json({ error: 'Compte désactivé ou bloqué' });
                return;
            }
            req.user = {
                id: user.id,
                email: user.email,
                role: user.role,
            };
            next();
        }
        catch (tokenError) {
            res.status(401).json({ error: 'Token invalide ou expiré' });
            return;
        }
    }
    catch (error) {
        res.status(500).json({ error: 'Erreur interne du serveur' });
        return;
    }
};
exports.authenticate = authenticate;
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'Non authentifié' });
            return;
        }
        if (!roles.includes(req.user.role)) {
            res.status(403).json({ error: 'Accès interdit - permissions insuffisantes' });
            return;
        }
        next();
    };
};
exports.authorize = authorize;
exports.adminOnly = (0, exports.authorize)('ADMIN');
exports.mentorOnly = (0, exports.authorize)('MENTOR');
exports.apprenantOrAdmin = (0, exports.authorize)('APPRENANT', 'ADMIN');
exports.mentorOrAdmin = (0, exports.authorize)('MENTOR', 'ADMIN');
exports.allRoles = (0, exports.authorize)('ADMIN', 'APPRENANT', 'MENTOR');
//# sourceMappingURL=auth.js.map