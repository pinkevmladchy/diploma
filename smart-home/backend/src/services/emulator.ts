import { Prisma, type DeviceStatus, type DeviceType, type MetricType } from '@prisma/client';
import { prisma } from '../db.js';
import { emitTelemetry, type LiveTelemetryPoint } from '../realtime.js';
import { evaluateForReadings } from './alertEvaluator.js';
import { evaluateSensorScenarios } from './scenarioEngine.js';

// ---------------------------------------------------------------------------
// Per-device generators (mirrors the standalone emulator script)
// ---------------------------------------------------------------------------

type DeviceState = { value: number; metric: MetricType; unit: string };

const DEFAULTS: Record<DeviceType, DeviceState> = {
  thermostat: { value: 22, metric: 'temperature', unit: '°C' },
  lamp: { value: 350, metric: 'light_level', unit: 'lx' },
  motion_sensor: { value: 0, metric: 'motion', unit: 'event' },
  power_meter: { value: 1.2, metric: 'power', unit: 'kWh' },
  air_quality: { value: 650, metric: 'co2', unit: 'ppm' },
  water_leak: { value: 0, metric: 'water_leak', unit: 'event' },
  smart_lock: { value: 0, metric: 'motion', unit: 'event' },
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function round(v: number, p = 2) {
  return Number(v.toFixed(p));
}

type EmuDevice = {
  id: string;
  type: DeviceType;
  status: DeviceStatus;
  telemetry: { metricType: MetricType; value: Prisma.Decimal; unit: string }[];
};

function initialState(d: EmuDevice): DeviceState {
  const def = DEFAULTS[d.type];
  const last = d.telemetry[0];
  if (last) {
    return { value: Number(last.value), metric: last.metricType, unit: last.unit || def.unit };
  }
  return { ...def };
}

function nextValue(d: EmuDevice, state: DeviceState): number {
  switch (d.type) {
    case 'thermostat':
      return round(clamp(state.value + (Math.random() - 0.5) * 0.6, 18, 26));
    case 'lamp': {
      if (d.status === 'off') return 0;
      const base = state.value > 50 ? state.value : 350;
      return round(clamp(base + (Math.random() - 0.5) * 60, 100, 600));
    }
    case 'power_meter': {
      if (d.status === 'off') return round(Math.random() * 0.05);
      let next = state.value + (Math.random() - 0.5) * 0.6;
      if (Math.random() < 0.08) next += 0.8;
      return round(clamp(next, 0.1, 2.5));
    }
    case 'air_quality': {
      if (state.metric === 'humidity') {
        return round(clamp(state.value + (Math.random() - 0.5) * 3, 30, 70));
      }
      let next = state.value + (Math.random() - 0.4) * 40;
      if (Math.random() < 0.05) next -= 200;
      return round(clamp(next, 400, 1400));
    }
    case 'motion_sensor':
      return Math.random() < 0.15 ? 1 : 0;
    case 'smart_lock':
      return Math.random() < 0.05 ? 1 : 0;
    case 'water_leak':
      return Math.random() < 0.01 ? 1 : 0;
  }
}

// ---------------------------------------------------------------------------
// Service — one timer per user
// ---------------------------------------------------------------------------

const MIN_INTERVAL_MS = 1000;
const MAX_INTERVAL_MS = 60_000;
const DEFAULT_INTERVAL_MS = 5_000;

type Instance = {
  timer: NodeJS.Timeout;
  intervalMs: number;
  startedAt: Date;
  lastTickAt: Date | null;
  lastInserted: number;
  deviceCount: number;
  state: Map<string, DeviceState>;
};

export type EmulatorStatus =
  | { running: false }
  | {
      running: true;
      intervalMs: number;
      startedAt: string;
      lastTickAt: string | null;
      lastInserted: number;
      deviceCount: number;
    };

class EmulatorService {
  private instances = new Map<string, Instance>();

  status(userId: string): EmulatorStatus {
    const i = this.instances.get(userId);
    if (!i) return { running: false };
    return {
      running: true,
      intervalMs: i.intervalMs,
      startedAt: i.startedAt.toISOString(),
      lastTickAt: i.lastTickAt?.toISOString() ?? null,
      lastInserted: i.lastInserted,
      deviceCount: i.deviceCount,
    };
  }

  start(userId: string, requestedMs?: number): EmulatorStatus {
    const intervalMs = clamp(requestedMs ?? DEFAULT_INTERVAL_MS, MIN_INTERVAL_MS, MAX_INTERVAL_MS);
    const existing = this.instances.get(userId);
    if (existing) {
      // Already running — reset the interval if it changed.
      if (existing.intervalMs !== intervalMs) {
        clearInterval(existing.timer);
        existing.timer = setInterval(() => void this.tick(userId), intervalMs);
        existing.intervalMs = intervalMs;
      }
      return this.status(userId);
    }
    const inst: Instance = {
      timer: setInterval(() => void this.tick(userId), intervalMs),
      intervalMs,
      startedAt: new Date(),
      lastTickAt: null,
      lastInserted: 0,
      deviceCount: 0,
      state: new Map(),
    };
    this.instances.set(userId, inst);
    void this.tick(userId); // fire immediately so user sees data without waiting
    return this.status(userId);
  }

  stop(userId: string): EmulatorStatus {
    const i = this.instances.get(userId);
    if (i) {
      clearInterval(i.timer);
      this.instances.delete(userId);
    }
    return { running: false };
  }

  stopAll(): void {
    for (const inst of this.instances.values()) clearInterval(inst.timer);
    this.instances.clear();
  }

  private async tick(userId: string): Promise<void> {
    const inst = this.instances.get(userId);
    if (!inst) return;
    try {
      const devices = await prisma.device.findMany({
        where: { room: { house: { userId } } },
        select: {
          id: true,
          type: true,
          status: true,
          telemetry: {
            orderBy: { timestamp: 'desc' },
            take: 1,
            select: { metricType: true, value: true, unit: true },
          },
        },
      });
      inst.deviceCount = devices.length;
      if (devices.length === 0) {
        inst.lastTickAt = new Date();
        inst.lastInserted = 0;
        return;
      }

      // Drop state for devices that no longer exist.
      const ids = new Set(devices.map((d) => d.id));
      for (const id of inst.state.keys()) if (!ids.has(id)) inst.state.delete(id);

      const now = new Date();
      const records = devices.map((d) => {
        let s = inst.state.get(d.id);
        if (!s) {
          s = initialState(d);
          inst.state.set(d.id, s);
        }
        const v = nextValue(d, s);
        s.value = v;
        return {
          deviceId: d.id,
          metricType: s.metric,
          value: v,
          unit: s.unit,
          timestamp: now,
        };
      });

      const result = await prisma.telemetry.createMany({ data: records });
      inst.lastTickAt = now;
      inst.lastInserted = result.count;

      // Broadcast: one event per device with its points (usually one).
      const byDevice = new Map<string, LiveTelemetryPoint[]>();
      for (const r of records) {
        const arr = byDevice.get(r.deviceId) ?? [];
        arr.push({
          metricType: r.metricType,
          value: r.value,
          unit: r.unit,
          timestamp: r.timestamp.toISOString(),
        });
        byDevice.set(r.deviceId, arr);
      }
      for (const [deviceId, points] of byDevice) {
        emitTelemetry(userId, { deviceId, points });
      }

      // Persist alert open/close transitions based on this tick's values.
      await evaluateForReadings(records);
      // Fire any sensor-triggered scenarios on rising edges.
      await evaluateSensorScenarios(records);
    } catch (e) {
      // Don't crash the timer on a transient DB error — just log.
      console.error('Emulator tick failed:', (e as Error).message);
    }
  }
}

export const emulator = new EmulatorService();
