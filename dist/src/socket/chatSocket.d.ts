import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
export declare function getIO(): SocketServer<import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, any>;
export declare function getOnlineUsers(): Map<number, Set<string>>;
export declare function isUserOnline(userId: number): boolean;
export declare function initSocket(httpServer: HttpServer): SocketServer<import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, any>;
//# sourceMappingURL=chatSocket.d.ts.map