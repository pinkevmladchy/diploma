import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { MetricType } from '@prisma/client';
import { prisma } from '../db.js';
import { evaluateForReadings } from '../services/alertEvaluator.js';
import { evaluateSensorScenarios } from '../services/scenarioEngine.js';

export const telemetryRouter: Router = Router();

// ---------------------------------------------------------------------------
// GET /telemetry — cross-device log feed
// ---------------------------------------------------------------------------

telemetryRouter.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.sub;

  const deviceIdRaw = req.query.deviceId;
  const houseIdRaw = req.query.houseId;
  const roomIdRaw = req.query.roomId;
  const metricRaw = req.query.metricType;
  const fromRaw = req.query.from;
  const toRaw = req.query.to;
  const limitRaw = req.query.limit;

  const deviceId =
    typeof deviceIdRaw === 'string' && deviceIdRaw.length > 0 ? deviceIdRaw : undefined;
  const houseId =
    typeof houseIdRaw === 'string' && houseIdRaw.length > 0 ? Number(houseIdRaw) : undefined;
  const roomId =
    typeof roomIdRaw === 'string' && roomIdRaw.length > 0 ? Number(roomIdRaw) : undefined;

  if (houseId !== undefined && !Number.isInteger(houseId)) {
    return res.status(400).json({ error: 'houseId must be an integer' });
  }
  if (roomId !== undefined && !Number.isInteger(roomId)) {
    return res.status(400).json({ error: 'roomId must be an integer' });
  }

  let metricType: MetricType | undefined;
  if (typeof metricRaw === 'string' && metricRaw.length > 0) {
    const parsed = z.nativeEnum(MetricType).safeParse(metricRaw);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid metricType' });
    metricType = parsed.data;
  }

  let from: Date | undefined;
  if (typeof fromRaw === 'string' && fromRaw.length > 0) {
    const d = new Date(fromRaw);
    if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'invalid `from`' });
    from = d;
  }
  let to: Date | undefined;
  if (typeof toRaw === 'string' && toRaw.length > 0) {
    const d = new Date(toRaw);
    if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'invalid `to`' });
    to = d;
  }

  const limit = typeof limitRaw === 'string' ? Math.min(2000, Math.max(1, Number(limitRaw))) : 500;
  if (!Number.isInteger(limit)) return res.status(400).json({ error: 'limit must be an integer' });

  const where: Record<string, unknown> = {
    device: {
      room: {
        house: { userId, ...(houseId !== undefined ? { id: houseId } : {}) },
        ...(roomId !== undefined ? { id: roomId } : {}),
      },
      ...(deviceId ? { id: deviceId } : {}),
    },
  };
  if (metricType) where.metricType = metricType;
  if (from || to) {
    const ts: { gte?: Date; lte?: Date } = {};
    if (from) ts.gte = from;
    if (to) ts.lte = to;
    where.timestamp = ts;
  }

  const rows = await prisma.telemetry.findMany({
    where,
    orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
    take: limit,
    include: {
      device: {
        select: {
          id: true,
          name: true,
          type: true,
          room: {
            select: { id: true, name: true, house: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });

  res.json(
    rows.map((r) => ({
      id: r.id.toString(),
      metricType: r.metricType,
      value: Number(r.value),
      unit: r.unit,
      timestamp: r.timestamp,
      device: {
        id: r.device.id,
        name: r.device.name,
        type: r.device.type,
        room: {
          id: r.device.room.id,
          name: r.device.room.name,
          house: r.device.room.house,
        },
      },
    })),
  );
});

const recordSchema = z.object({
  deviceId: z.string().uuid(),
  metricType: z.nativeEnum(MetricType),
  value: z.number(),
  unit: z.string().max(20).default(''),
  timestamp: z.string().datetime().optional(),
});

// Accept either a single record or an array.
const payloadSchema = z.union([recordSchema, z.array(recordSchema).max(1000)]);

telemetryRouter.post('/', async (req: Request, res: Response) => {
  const parsed = payloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }
  const records = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  if (records.length === 0) {
    return res.status(400).json({ error: 'Empty batch' });
  }

  const userId = req.user!.sub;

  // Ownership check — every device must belong to the user via house.userId.
  const deviceIds = Array.from(new Set(records.map((r) => r.deviceId)));
  const devices = await prisma.device.findMany({
    where: { id: { in: deviceIds } },
    include: { room: { include: { house: true } } },
  });
  const owned = new Set(
    devices.filter((d) => d.room.house.userId === userId).map((d) => d.id),
  );
  const unauthorized = deviceIds.filter((id) => !owned.has(id));
  if (unauthorized.length > 0) {
    return res.status(403).json({ error: 'Device(s) not owned by user', deviceIds: unauthorized });
  }

  const normalized = records.map((r) => ({
    deviceId: r.deviceId,
    metricType: r.metricType,
    value: r.value,
    unit: r.unit,
    timestamp: r.timestamp ? new Date(r.timestamp) : new Date(),
  }));

  const result = await prisma.telemetry.createMany({ data: normalized });
  await evaluateForReadings(normalized);
  await evaluateSensorScenarios(normalized);

  res.status(201).json({ inserted: result.count });
});
