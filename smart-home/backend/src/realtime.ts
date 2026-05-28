import { Server as IOServer, type Socket } from 'socket.io';
import type { Server as HTTPServer } from 'node:http';
import { verifyAccessToken } from './auth/jwt.js';

let io: IOServer | null = null;

export type LiveTelemetryPoint = {
  metricType: string;
  value: number;
  unit: string;
  timestamp: string;
};

export type TelemetryEventPayload = {
  deviceId: string;
  points: LiveTelemetryPoint[];
};

type SocketData = { userId: string };

export function initRealtime(server: HTTPServer): void {
  io = new IOServer(server, {
    cors: { origin: true, credentials: true },
  });

  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || token.length === 0) {
      return next(new Error('Missing token'));
    }
    try {
      const payload = verifyAccessToken(token);
      (socket.data as SocketData).userId = payload.sub;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket.data as SocketData).userId;
    socket.join(`user:${userId}`);
  });
}

/** Push live telemetry to all sockets connected as `userId`. */
export function emitTelemetry(userId: string, payload: TelemetryEventPayload): void {
  if (!io) return;
  io.to(`user:${userId}`).emit('telemetry:new', payload);
}

export type AlertEventPayload =
  | {
      kind: 'opened';
      event: {
        id: number;
        alertId: number;
        alertName: string | null;
        condition: string;
        conditionSymbol: string;
        thresholdValue: number;
        metricType: string;
        triggerValue: number;
        latestValue: number;
        unit: string;
        triggeredAt: string;
        lastSeenAt: string;
        clearedAt: string | null;
        clearReason: string | null;
        house: { id: number; name: string };
        room: { id: number; name: string };
        device: { id: string; name: string };
      };
    }
  | { kind: 'cleared'; eventId: number; reason: 'auto' | 'manual' };

/** Push alert open/close events to all sockets connected as `userId`. */
export function emitAlert(userId: string, payload: AlertEventPayload): void {
  if (!io) return;
  io.to(`user:${userId}`).emit('alert:event', payload);
}

/** For tests / shutdown. */
export function closeRealtime(): Promise<void> {
  return new Promise((resolve) => {
    if (!io) return resolve();
    io.close(() => resolve());
  });
}
