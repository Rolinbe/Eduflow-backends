import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let io: SocketServer;

const onlineUsers = new Map<number, Set<string>>();

export function getIO() {
  return io;
}

export function getOnlineUsers() {
  return onlineUsers;
}

export function isUserOnline(userId: number): boolean {
  return onlineUsers.has(userId) && onlineUsers.get(userId)!.size > 0;
}

export function initSocket(httpServer: HttpServer) {
  io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3001',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Token requis'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'edukaflow-secret-key') as { id: number; role: string };
      (socket as any).userId = decoded.id;
      (socket as any).userRole = decoded.role;
      next();
    } catch {
      next(new Error('Token invalide'));
    }
  });

  io.on('connection', (socket) => {
    const userId = (socket as any).userId as number;
    console.log(`🔌 User ${userId} connected (${socket.id})`);

    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId)!.add(socket.id);

    io.emit('user-online', { userId, online: true });

    socket.join(`user:${userId}`);

    socket.on('join-conversation', (conversationId: number) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on('leave-conversation', (conversationId: number) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on('send-message', async (data: { conversationId: number; content: string }) => {
      try {
        const conversation = await prisma.conversation.findUnique({
          where: { id: data.conversationId },
        });
        const recipientId = conversation
          ? (conversation.participant1Id === userId ? conversation.participant2Id : conversation.participant1Id)
          : null;
        const recipientOnline = recipientId ? (onlineUsers.has(recipientId) && onlineUsers.get(recipientId)!.size > 0) : false;

        const message = await prisma.message.create({
          data: {
            conversationId: data.conversationId,
            senderId: userId,
            content: data.content,
            status: recipientOnline ? 'DELIVERED' : 'SENT',
          },
          include: {
            sender: { select: { id: true, firstName: true, lastName: true, role: true } },
          },
        });

        await prisma.conversation.update({
          where: { id: data.conversationId },
          data: { lastMessageAt: new Date() },
        });

        io.to(`conversation:${data.conversationId}`).emit('new-message', message);
        io.to(`conversation:${data.conversationId}`).emit('message-sent', { message, conversationId: data.conversationId });

        if (conversation && recipientId) {
          io.to(`user:${recipientId}`).emit('new-message-notification', {
            message,
            conversationId: data.conversationId,
          });

          const sender = await prisma.user.findUnique({
            where: { id: userId },
            select: { firstName: true, lastName: true, role: true },
          });

          if (sender) {
            const roleLabel = sender.role === 'MENTOR' ? 'votre mentor' : sender.role === 'ADMIN' ? 'l\'administration' : 'votre élève';
            await prisma.notification.create({
              data: {
                userId: recipientId,
                type: 'INFO',
                title: 'Nouveau message',
                message: `${sender.firstName} ${sender.lastName} (${roleLabel}) vous a envoyé un message.`,
              },
            });
          }
        }
      } catch (error) {
        socket.emit('error', { message: 'Erreur lors de l\'envoi du message' });
      }
    });

    socket.on('typing', (data: { conversationId: number }) => {
      socket.to(`conversation:${data.conversationId}`).emit('user-typing', {
        userId,
        conversationId: data.conversationId,
      });
    });

    socket.on('stop-typing', (data: { conversationId: number }) => {
      socket.to(`conversation:${data.conversationId}`).emit('user-stop-typing', {
        userId,
        conversationId: data.conversationId,
      });
    });

    socket.on('mark-read', async (data: { conversationId: number }) => {
      try {
        await prisma.message.updateMany({
          where: {
            conversationId: data.conversationId,
            senderId: { not: userId },
            status: { not: 'READ' },
          },
          data: { status: 'READ' },
        });
        io.to(`conversation:${data.conversationId}`).emit('messages-read', {
          conversationId: data.conversationId,
          readBy: userId,
        });
      } catch (error) {
        console.error('Error marking read:', error);
      }
    });

    // Voice call signaling
    socket.on('call-user', (data: { targetUserId: number; callerName: string }) => {
      io.to(`user:${data.targetUserId}`).emit('incoming-call', {
        callerId: userId,
        callerName: data.callerName,
      });
    });

    socket.on('accept-call', (data: { callerId: number }) => {
      io.to(`user:${data.callerId}`).emit('call-accepted', { userId });
    });

    socket.on('reject-call', (data: { callerId: number }) => {
      io.to(`user:${data.callerId}`).emit('call-rejected', { userId });
    });

    socket.on('end-call', (data: { targetUserId: number }) => {
      io.to(`user:${data.targetUserId}`).emit('call-ended', { userId });
    });

    socket.on('call-offer', (data: { targetUserId: number; offer: any }) => {
      io.to(`user:${data.targetUserId}`).emit('call-offer', { callerId: userId, offer: data.offer });
    });

    socket.on('call-answer', (data: { targetUserId: number; answer: any }) => {
      io.to(`user:${data.targetUserId}`).emit('call-answer', { answererId: userId, answer: data.answer });
    });

    socket.on('ice-candidate', (data: { targetUserId: number; candidate: any }) => {
      io.to(`user:${data.targetUserId}`).emit('ice-candidate', { senderId: userId, candidate: data.candidate });
    });

    socket.on('disconnect', () => {
      console.log(`🔌 User ${userId} disconnected (${socket.id})`);
      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          io.emit('user-online', { userId, online: false });
        }
      }
    });
  });

  return io;
}
