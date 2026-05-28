import { AlertCondition, type MetricType } from '@prisma/client';
import { prisma } from '../db.js';
import { emitAlert } from '../realtime.js';

/**
 * Evaluate alert rules for the given telemetry write and open/close persisted
 * AlertEvent rows. Called from every telemetry write path (emulator tick,
 * POST /api/telemetry) so the active-alerts view is always fresh.
 *
 * Behavior:
 * - For each rule that matches the metric, if the latest value breaches the
 *   threshold AND no open event exists for (alertId, deviceId) → open one.
 * - If an open event exists and the breach still holds → bump `latestValue`
 *   and `lastSeenAt`.
 * - If an open event exists and the breach is gone → mark it `cleared_at` with
 *   reason `auto`.
 */

type Reading = {
  deviceId: string;
  metricType: MetricType;
  value: number;
  unit: string;
  timestamp: Date;
};

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

function conditionSymbol(c: AlertCondition): string {
  return { gt: '>', lt: '<', gte: '≥', lte: '≤', eq: '=' }[c];
}

export async function evaluateForReadings(readings: Reading[]): Promise<void> {
  if (readings.length === 0) return;

  // Group readings by device — we only care about the latest per (device, metric).
  const latestByDeviceMetric = new Map<string, Reading>();
  for (const r of readings) {
    const key = `${r.deviceId}::${r.metricType}`;
    const prev = latestByDeviceMetric.get(key);
    if (!prev || r.timestamp > prev.timestamp) latestByDeviceMetric.set(key, r);
  }

  const deviceIds = Array.from(new Set(readings.map((r) => r.deviceId)));
  const devices = await prisma.device.findMany({
    where: { id: { in: deviceIds } },
    include: {
      room: {
        include: {
          house: {
            include: {
              alerts: { where: { isActive: true } },
              user: { select: { id: true } },
            },
          },
        },
      },
    },
  });

  for (const device of devices) {
    const userId = device.room.house.user.id;
    const houseSummary = { id: device.room.house.id, name: device.room.house.name };
    const roomSummary = { id: device.room.id, name: device.room.name };
    const deviceSummary = { id: device.id, name: device.name };

    for (const rule of device.room.house.alerts) {
      const reading = latestByDeviceMetric.get(`${device.id}::${rule.metricType}`);
      if (!reading) continue;

      const threshold = Number(rule.thresholdValue);
      const breaching = evaluate(reading.value, rule.condition, threshold);

      const open = await prisma.alertEvent.findFirst({
        where: { alertId: rule.id, deviceId: device.id, clearedAt: null },
      });

      if (breaching) {
        if (open) {
          await prisma.alertEvent.update({
            where: { id: open.id },
            data: { latestValue: reading.value, lastSeenAt: reading.timestamp },
          });
        } else {
          const created = await prisma.alertEvent.create({
            data: {
              alertId: rule.id,
              deviceId: device.id,
              metricType: rule.metricType,
              triggerValue: reading.value,
              latestValue: reading.value,
              unit: reading.unit,
              thresholdValue: threshold,
              condition: rule.condition,
              triggeredAt: reading.timestamp,
              lastSeenAt: reading.timestamp,
            },
          });
          emitAlert(userId, {
            kind: 'opened',
            event: {
              id: created.id,
              alertId: rule.id,
              alertName: rule.name,
              condition: rule.condition,
              conditionSymbol: conditionSymbol(rule.condition),
              thresholdValue: threshold,
              metricType: rule.metricType,
              triggerValue: reading.value,
              latestValue: reading.value,
              unit: reading.unit,
              triggeredAt: created.triggeredAt.toISOString(),
              lastSeenAt: created.lastSeenAt.toISOString(),
              clearedAt: null,
              clearReason: null,
              house: houseSummary,
              room: roomSummary,
              device: deviceSummary,
            },
          });
        }
      } else if (open) {
        const cleared = await prisma.alertEvent.update({
          where: { id: open.id },
          data: { clearedAt: new Date(), clearReason: 'auto' },
        });
        emitAlert(userId, {
          kind: 'cleared',
          eventId: cleared.id,
          reason: 'auto',
        });
      }
    }
  }
}
