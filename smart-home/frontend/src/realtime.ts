import { io, type Socket } from 'socket.io-client';
import { tokenStore } from './api';
import type { AlertEvent, MetricType } from './api';

export type LiveTelemetryPoint = {
  metricType: MetricType;
  value: number;
  unit: string;
  timestamp: string;
};

export type TelemetryEventPayload = {
  deviceId: string;
  points: LiveTelemetryPoint[];
};

let socket: Socket | null = null;

/**
 * Returns the shared Socket.io connection (lazily created). The first call
 * connects with the current access token; subsequent calls reuse the same socket.
 */
export function getSocket(): Socket {
  if (socket) return socket;
  socket = io({
    auth: { token: tokenStore.getAccess() },
    autoConnect: true,
    reconnection: true,
  });
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Subscribe to live telemetry events. Returns an unsubscribe function.
 * Filter by deviceId is applied in the callback itself.
 */
export function onTelemetry(
  handler: (payload: TelemetryEventPayload) => void,
): () => void {
  const s = getSocket();
  s.on('telemetry:new', handler);
  return () => {
    s.off('telemetry:new', handler);
  };
}

export type AlertEventMessage =
  | { kind: 'opened'; event: AlertEvent }
  | { kind: 'cleared'; eventId: number; reason: 'auto' | 'manual' };

/**
 * Subscribe to live alert open/close events. Returns an unsubscribe function.
 */
export function onAlert(handler: (msg: AlertEventMessage) => void): () => void {
  const s = getSocket();
  s.on('alert:event', handler);
  return () => {
    s.off('alert:event', handler);
  };
}
