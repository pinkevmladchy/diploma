import { AlertCondition, type MetricType, type DeviceStatus } from '@prisma/client';
import { prisma } from '../db.js';

// ---------------------------------------------------------------------------
// Shared types — kept in sync with the frontend api types
// ---------------------------------------------------------------------------

export type SensorTrigger = {
  deviceId: string;
  metricType: MetricType;
  condition: AlertCondition;
  threshold: number;
};
export type TimeTrigger = { hour: number; minute: number };
export type ManualTrigger = Record<string, never>;

export type ScenarioAction =
  | { kind: 'set_device_status'; deviceId: string; status: DeviceStatus }
  | { kind: 'notify'; message: string; type?: 'info' | 'warning' | 'alert' };

function evaluate(value: number, condition: AlertCondition, threshold: number): boolean {
  switch (condition) {
    case AlertCondition.gt:
      return value > threshold;
    case AlertCondition.lt:
      return value < threshold;
    case AlertCondition.gte:
      return value >= threshold;
    case AlertCondition.lte:
      return value <= threshold;
    case AlertCondition.eq:
      return value === threshold;
  }
}

// ---------------------------------------------------------------------------
// Execute actions
// ---------------------------------------------------------------------------

export type ActionResult = {
  action: ScenarioAction;
  ok: boolean;
  error?: string;
};

async function executeAction(
  action: ScenarioAction,
  userId: string,
): Promise<ActionResult> {
  try {
    switch (action.kind) {
      case 'set_device_status': {
        const device = await prisma.device.findUnique({
          where: { id: action.deviceId },
          include: { room: { include: { house: true } } },
        });
        if (!device || device.room.house.userId !== userId) {
          return { action, ok: false, error: 'Device not found' };
        }
        const oldStatus = device.status;
        await prisma.device.update({
          where: { id: device.id },
          data: { status: action.status },
        });
        if (oldStatus !== action.status) {
          await prisma.deviceLog.create({
            data: {
              deviceId: device.id,
              userId,
              action: 'scenario_status_change',
              oldValue: oldStatus,
              newValue: action.status,
            },
          });
        }
        return { action, ok: true };
      }
      case 'notify': {
        await prisma.notification.create({
          data: { userId, message: action.message, type: action.type ?? 'info' },
        });
        return { action, ok: true };
      }
    }
  } catch (e) {
    return { action, ok: false, error: (e as Error).message };
  }
}

/**
 * Run a scenario's actions in order. Logs each action's outcome to the
 * scenario's owner via a device_log row when applicable; never throws.
 */
export async function runScenario(
  scenarioId: number,
  source: 'manual' | 'time' | 'sensor',
): Promise<{ scenarioId: number; results: ActionResult[] }> {
  const scenario = await prisma.scenario.findUnique({ where: { id: scenarioId } });
  if (!scenario) return { scenarioId, results: [] };
  if (!scenario.isActive && source !== 'manual') {
    return { scenarioId, results: [] };
  }

  const actions = Array.isArray(scenario.actions)
    ? (scenario.actions as unknown as ScenarioAction[])
    : [];
  const results: ActionResult[] = [];
  for (const a of actions) {
    results.push(await executeAction(a, scenario.userId));
  }
  // Source is recorded only when the engine — not the user — fires the scenario.
  if (source !== 'manual') {
    console.info(
      `[scenarios] ran "${scenario.name}" (#${scenario.id}) source=${source}, ` +
        `${results.filter((r) => r.ok).length}/${results.length} actions ok`,
    );
  }
  return { scenarioId, results };
}

// ---------------------------------------------------------------------------
// Time scheduler — runs every minute
// ---------------------------------------------------------------------------

let schedulerTimer: NodeJS.Timeout | null = null;
const lastFiredAtMinute = new Map<number, number>();

async function timeTick(): Promise<void> {
  try {
    const now = new Date();
    const currentMinute = Math.floor(now.getTime() / 60_000);
    const hour = now.getHours();
    const minute = now.getMinutes();

    const scenarios = await prisma.scenario.findMany({
      where: { triggerType: 'time', isActive: true },
    });

    for (const s of scenarios) {
      const trig = s.triggerValue as unknown as TimeTrigger | null;
      if (!trig || typeof trig.hour !== 'number' || typeof trig.minute !== 'number') continue;
      if (trig.hour !== hour || trig.minute !== minute) continue;
      // Dedup: a single minute can fire each scenario at most once.
      if (lastFiredAtMinute.get(s.id) === currentMinute) continue;
      lastFiredAtMinute.set(s.id, currentMinute);
      await runScenario(s.id, 'time');
    }
  } catch (e) {
    console.error('[scenarios] timeTick failed:', (e as Error).message);
  }
}

export function startScenarioScheduler(): void {
  if (schedulerTimer) return;
  // Tick once now, then every minute. Aligning to the wall-clock minute boundary
  // isn't critical because dedup uses the minute index.
  void timeTick();
  schedulerTimer = setInterval(() => void timeTick(), 60_000);
}

export function stopScenarioScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Sensor evaluator — fired from telemetry writes (rising-edge only)
// ---------------------------------------------------------------------------

type Reading = {
  deviceId: string;
  metricType: MetricType;
  value: number;
  timestamp: Date;
};

// (scenarioId) -> last evaluated state. Rising edge fires only when state goes
// from false (or unknown) → true on a new reading.
const lastMatchByScenario = new Map<number, boolean>();

export async function evaluateSensorScenarios(readings: Reading[]): Promise<void> {
  if (readings.length === 0) return;

  // Latest reading per (device, metric).
  const latest = new Map<string, Reading>();
  for (const r of readings) {
    const key = `${r.deviceId}::${r.metricType}`;
    const prev = latest.get(key);
    if (!prev || r.timestamp > prev.timestamp) latest.set(key, r);
  }

  const deviceIds = Array.from(new Set(readings.map((r) => r.deviceId)));
  const scenarios = await prisma.scenario.findMany({
    where: { triggerType: 'sensor', isActive: true },
  });

  for (const s of scenarios) {
    const trig = s.triggerValue as unknown as SensorTrigger | null;
    if (!trig || !trig.deviceId || !trig.metricType) continue;
    if (!deviceIds.includes(trig.deviceId)) continue;
    const reading = latest.get(`${trig.deviceId}::${trig.metricType}`);
    if (!reading) continue;

    const matches = evaluate(reading.value, trig.condition, Number(trig.threshold));
    const wasMatching = lastMatchByScenario.get(s.id) ?? false;
    lastMatchByScenario.set(s.id, matches);

    if (matches && !wasMatching) {
      await runScenario(s.id, 'sensor');
    }
  }
}

/** For tests / dev — clears the rising-edge memory. */
export function resetSensorState(): void {
  lastMatchByScenario.clear();
}
