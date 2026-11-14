import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { verifyToken } from './auth';
import { one } from './db';
import { isUuid } from './http';
import { IS_CONVERSATION_MEMBER } from './sql/realtime';

let io: Server | null = null;

type Ack = (res: { ok: boolean; error?: string }) => void;

/**
 * Rooms:
 *  user:<id>  – notifications (joined automatically for the signed-in user)
 *  post:<id>  – new replies on a discussion
 *  conv:<id>  – chat messages (members only)
 */
export function initRealtime(server: HttpServer) {
  io = new Server(server, { cors: { origin: '*' } });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const userId = typeof token === 'string' ? verifyToken(token) : null;
    if (!userId) return next(new Error('unauthorized'));
    socket.data.userId = userId;
    next();
  });

  io.on('connection', (socket) => {
    const userId: string = socket.data.userId;
    socket.join(`user:${userId}`);

    socket.on('join', async (room: unknown, ack?: Ack) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      try {
        if (typeof room !== 'string') return reply({ ok: false, error: 'Invalid room' });
        const [kind, id] = room.split(':');
        if (!isUuid(id)) return reply({ ok: false, error: 'Invalid room' });
        if (kind === 'post') {
          socket.join(room);
          return reply({ ok: true });
        }
        if (kind === 'conv') {
          if (!(await one(IS_CONVERSATION_MEMBER, [id, userId]))) return reply({ ok: false, error: 'Not a member' });
          socket.join(room);
          return reply({ ok: true });
        }
        if (kind === 'user' && id === userId) return reply({ ok: true });
        reply({ ok: false, error: 'Invalid room' });
      } catch {
        reply({ ok: false, error: 'Could not join' });
      }
    });

    socket.on('leave', (room: unknown) => {
      if (typeof room === 'string' && room !== `user:${userId}`) socket.leave(room);
    });
  });
}

export function emitTo(room: string, event: string, payload: unknown) {
  io?.to(room).emit(event, payload);
}
