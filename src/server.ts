import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

import authRoutes from './routes/auth.routes';
import adminRoutes from './routes/admin.routes';
import apprenantRoutes from './routes/apprenant.routes';
import mentorRoutes from './routes/mentor.routes';
import chatRoutes from './routes/chat.routes';
import { initSocket } from './socket/chatSocket';

const app = express();

let httpServer: any;

const isVercel = process.env.VERCEL === '1';

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Trop de tentatives, réessayez plus tard' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/apprenant', apprenantRoutes);
app.use('/api/mentor', mentorRoutes);
app.use('/api/chat', chatRoutes);

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
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
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
  const io = initSocket(httpServer);
  app.set('io', io);

  const PORT = parseInt(process.env.PORT || '5000', 10);
  httpServer.listen(PORT, () => {
    console.log(`🚀 EdukaFlow Backend running on port ${PORT}`);
    console.log(`📚 API: http://localhost:${PORT}/api`);
    console.log(`🔌 Socket.io ready on port ${PORT}`);
  });
}

export default app;
