import app from './app';
import http from 'http';
import { initSocket } from './socket/chatSocket';

const httpServer = http.createServer(app);
const io = initSocket(httpServer);
app.set('io', io);

const PORT = parseInt(process.env.PORT || '5000', 10);
httpServer.listen(PORT, () => {
  console.log(`🚀 EdukaFlow Backend running on port ${PORT}`);
  console.log(`📚 API: http://localhost:${PORT}/api`);
  console.log(`🔌 Socket.io ready on port ${PORT}`);
});
