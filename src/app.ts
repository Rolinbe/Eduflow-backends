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

const app = express();

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: (process.env.FRONTEND_URL || '*').replace(/\/+$/, ''),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Trop de tentatives, réessayez plus tard' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/apprenant', apprenantRoutes);
app.use('/api/mentor', mentorRoutes);
app.use('/api/chat', chatRoutes);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    vercel: process.env.VERCEL === '1',
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  if (err.type === 'entity.too.large') {
    res.status(413).json({ error: 'Le fichier est trop volumineux' });
    return;
  }
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

export default app;
