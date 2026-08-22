"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIO = getIO;
exports.getOnlineUsers = getOnlineUsers;
exports.isUserOnline = isUserOnline;
exports.initSocket = initSocket;
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
let io;
const onlineUsers = new Map();
function getIO() {
    return io;
}
function getOnlineUsers() {
    return onlineUsers;
}
function isUserOnline(userId) {
    return onlineUsers.has(userId) && onlineUsers.get(userId).size > 0;
}
function initSocket(httpServer) {
    io = new socket_io_1.Server(httpServer, {
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
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'edukaflow-secret-key');
            socket.userId = decoded.id;
            socket.userRole = decoded.role;
            next();
        }
        catch {
            next(new Error('Token invalide'));
        }
    });
    io.on('connection', (socket) => {
        const userId = socket.userId;
        console.log(`🔌 User ${userId} connected (${socket.id})`);
        if (!onlineUsers.has(userId)) {
            onlineUsers.set(userId, new Set());
        }
        onlineUsers.get(userId).add(socket.id);
        io.emit('user-online', { userId, online: true });
        socket.join(`user:${userId}`);
        socket.on('join-conversation', (conversationId) => {
            socket.join(`conversation:${conversationId}`);
        });
        socket.on('leave-conversation', (conversationId) => {
            socket.leave(`conversation:${conversationId}`);
        });
        socket.on('send-message', async (data) => {
            try {
                const conversation = await prisma.conversation.findUnique({
                    where: { id: data.conversationId },
                });
                const recipientId = conversation
                    ? (conversation.participant1Id === userId ? conversation.participant2Id : conversation.participant1Id)
                    : null;
                const recipientOnline = recipientId ? (onlineUsers.has(recipientId) && onlineUsers.get(recipientId).size > 0) : false;
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
            }
            catch (error) {
                socket.emit('error', { message: 'Erreur lors de l\'envoi du message' });
            }
        });
        socket.on('typing', (data) => {
            socket.to(`conversation:${data.conversationId}`).emit('user-typing', {
                userId,
                conversationId: data.conversationId,
            });
        });
        socket.on('stop-typing', (data) => {
            socket.to(`conversation:${data.conversationId}`).emit('user-stop-typing', {
                userId,
                conversationId: data.conversationId,
            });
        });
        socket.on('mark-read', async (data) => {
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
            }
            catch (error) {
                console.error('Error marking read:', error);
            }
        });
        // Voice call signaling
        socket.on('call-user', (data) => {
            io.to(`user:${data.targetUserId}`).emit('incoming-call', {
                callerId: userId,
                callerName: data.callerName,
            });
        });
        socket.on('accept-call', (data) => {
            io.to(`user:${data.callerId}`).emit('call-accepted', { userId });
        });
        socket.on('reject-call', (data) => {
            io.to(`user:${data.callerId}`).emit('call-rejected', { userId });
        });
        socket.on('end-call', (data) => {
            io.to(`user:${data.targetUserId}`).emit('call-ended', { userId });
        });
        socket.on('call-offer', (data) => {
            io.to(`user:${data.targetUserId}`).emit('call-offer', { callerId: userId, offer: data.offer });
        });
        socket.on('call-answer', (data) => {
            io.to(`user:${data.targetUserId}`).emit('call-answer', { answererId: userId, answer: data.answer });
        });
        socket.on('ice-candidate', (data) => {
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
//# sourceMappingURL=chatSocket.js.map