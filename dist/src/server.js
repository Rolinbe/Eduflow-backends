"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const apprenant_routes_1 = __importDefault(require("./routes/apprenant.routes"));
const mentor_routes_1 = __importDefault(require("./routes/mentor.routes"));
const chat_routes_1 = __importDefault(require("./routes/chat.routes"));
const chatSocket_1 = require("./socket/chatSocket");
const app = (0, express_1.default)();
let httpServer;
const isVercel = process.env.VERCEL === '1';
// Security middleware
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
// CORS
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
// Rate limiting
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Trop de tentatives, réessayez plus tard' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
// Body parsing
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// API Routes
app.use('/api/auth', auth_routes_1.default);
app.use('/api/admin', admin_routes_1.default);
app.use('/api/apprenant', apprenant_routes_1.default);
app.use('/api/mentor', mentor_routes_1.default);
app.use('/api/chat', chat_routes_1.default);
// Health check
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        vercel: isVercel,
    });
});
// 404 handler
app.use((_req, res) => {
    res.status(404).json({ error: 'Route non trouvée' });
});
// Global error handler
app.use((err, _req, res, _next) => {
    console.error('Unhandled error:', err);
    if (err.type === 'entity.too.large') {
        res.status(413).json({ error: 'Le fichier est trop volumineux' });
        return;
    }
    res.status(500).json({ error: 'Erreur interne du serveur' });
});
// Socket.io only on non-Vercel (long-running server)
if (!isVercel) {
    const http = require('http');
    httpServer = http.createServer(app);
    const io = (0, chatSocket_1.initSocket)(httpServer);
    app.set('io', io);
    const PORT = parseInt(process.env.PORT || '5000', 10);
    httpServer.listen(PORT, () => {
        console.log(`🚀 EdukaFlow Backend running on port ${PORT}`);
        console.log(`📚 API: http://localhost:${PORT}/api`);
        console.log(`🔌 Socket.io ready on port ${PORT}`);
    });
}
exports.default = app;
//# sourceMappingURL=server.js.map