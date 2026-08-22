"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const auth_routes_1 = __importDefault(require("../src/routes/auth.routes"));
const admin_routes_1 = __importDefault(require("../src/routes/admin.routes"));
const apprenant_routes_1 = __importDefault(require("../src/routes/apprenant.routes"));
const mentor_routes_1 = __importDefault(require("../src/routes/mentor.routes"));
const chat_routes_1 = __importDefault(require("../src/routes/chat.routes"));
const app = (0, express_1.default)();
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Trop de tentatives, réessayez plus tard' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth', auth_routes_1.default);
app.use('/api/admin', admin_routes_1.default);
app.use('/api/apprenant', apprenant_routes_1.default);
app.use('/api/mentor', mentor_routes_1.default);
app.use('/api/chat', chat_routes_1.default);
app.get('/api/health', (_req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});
app.use((_req, res) => {
    res.status(404).json({ error: 'Route non trouvée' });
});
function handler(req, res) {
    return app(req, res);
}
//# sourceMappingURL=index.js.map