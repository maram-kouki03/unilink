import { io, Socket } from 'socket.io-client';
import { API_URL } from './api';

/**
 * One Socket.io connection for the whole app.
 * Rooms are reference-counted (two screens can watch the same post) and re-joined after a reconnect.
 */
let socket: Socket | null = null;
const rooms = new Map<string, number>();
const listeners = new Map<string, Set<(payload: any) => void>>();

export function connectSocket(token: string) {
  if (socket) return;
  // WebSocket first; if a network blocks it, fall back to HTTP long-polling.
  socket = io(API_URL, { auth: { token }, transports: ['websocket', 'polling'], tryAllTransports: true, reconnection: true });
  socket.on('connect', () => {
    rooms.forEach((_count, room) => socket?.emit('join', room));
  });
  socket.onAny((event: string, payload: unknown) => {
    listeners.get(event)?.forEach((fn) => fn(payload));
  });
}

export function closeSocket() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  rooms.clear();
}

export function joinRoom(room: string) {
  const n = rooms.get(room) ?? 0;
  rooms.set(room, n + 1);
  if (n === 0 && socket?.connected) socket.emit('join', room);
}

export function leaveRoom(room: string) {
  const n = rooms.get(room) ?? 0;
  if (n <= 1) {
    rooms.delete(room);
    if (socket?.connected) socket.emit('leave', room);
  } else {
    rooms.set(room, n - 1);
  }
}

/** Listen to a server event. Works even if the socket connects later. Returns an unsubscribe function. */
export function onSocket<T = unknown>(event: string, fn: (payload: T) => void): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(fn as (payload: unknown) => void);
  return () => {
    listeners.get(event)?.delete(fn as (payload: unknown) => void);
  };
}
