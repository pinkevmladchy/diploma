import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { AlertCondition, MetricType } from '@prisma/client';
import { prisma } from '../db.js';
import { emitAlert } from '../realtime.js';

export const alertsRouter: Router = Router();

const conditionEnum = z.nativeEnum(AlertCondition);
const metricEnum = z.nativeEnum(MetricType);

const createSchema = z.object({
  houseId: z.number().int().positive(),
  name: z.string().trim().max(100).optional().nullable(),
  metricType: metricEnum,
  condition: conditionEnum,
  thresholdValue: z.number(),
  isActive: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().trim().max(100).nullable().optional(),
  metricType: metricEnum.optional(),
  condition: conditionEnum.optional(),
  thresholdValue: z.number().optional(),
  isActive: z.boolean().optional(),
});

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function assertHouseOwned(houseId: number, userId: string): Promise<boolean> {
  const house = await prisma.house.findUnique({ where: { id: houseId } });
  return !!house && house.userId === userId;
}

function conditionSymbol(c: AlertCondition): string {
  return { gt: '>', lt: '<', gte: '≥', lte: '≤', eq: '=' }[c];
}

// --- list / CRUD -----------------------------------------------------------

alertsRouter.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const houseIdRaw = req.query.houseId;
  const houseId =
    typeof houseIdRaw === 'string' && houseIdRaw.length > 0 ? Number(houseIdRaw) : undefined;
  if (houseId !== undefined && !Number.isInteger(houseId)) {
    return res.status(400).json({ error: 'houseId must be an integer' });
  }

  const alerts = await prisma.alert.findMany({
    where: {
      house: { userId },
      ...(houseId !== undefined ? { houseId } : {}),
    },
    orderBy: { id: 'asc' },
    include: { house: { select: { id: true, name: true } } },
  });

  res.json(
    alerts.map((a) => ({
      id: a.id,
      house: a.house,
      name: a.name,
      metricType: a.metricType,
      condition: a.condition,
      thresholdValue: Number(a.thresholdValue),
      isActive: a.isActive,
      createdAt: a.createdAt,
    })),
  );
});

alertsRouter.post('/', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }
  const userId = req.user!.sub;
  if (!(await assertHouseOwned(parsed.data.houseId, userId))) {
    return res.status(404).json({ error: 'House not found' });
  }
  const alert = await prisma.alert.create({
    data: {
      houseId: parsed.data.houseId,
      name: parsed.data.name ?? null,
      metricType: parsed.data.metricType,
      condition: parsed.data.condition,
      thresholdValue: parsed.data.thresholdValue,
      isActive: parsed.data.isActive ?? true,
    },
  });
  res.status(201).json({ ...alert, thresholdValue: Number(alert.thresholdValue) });
});

alertsRouter.patch('/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }
  const userId = req.user!.sub;
  const existing = await prisma.alert.findUnique({ where: { id }, include: { house: true } });
  if (!existing || existing.house.userId !== userId) {
    return res.status(404).json({ error: 'Not found' });
  }
  const updated = await prisma.alert.update({ where: { id }, data: parsed.data });
  res.json({ ...updated, thresholdValue: Number(updated.thresholdValue) });
});

alertsRouter.delete('/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });
  const userId = req.user!.sub;
  const existing = await prisma.alert.findUnique({ where: { id }, include: { house: true } });
  if (!existing || existing.house.userId !== userId) {
    return res.status(404).json({ error: 'Not found' });
  }
  await prisma.alert.delete({ where: { id } });
  res.status(204).end();
});

// --- persisted alert events -------------------------------------------------

type SerializedEvent = {
  id: number;
  alertId: number;
  alertName: string | null;
  condition: AlertCondition;
  conditionSymbol: string;
  thresholdValue: number;
  metricType: MetricType;
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

type EventWithRelations = Awaited<ReturnType<typeof loadEventsWith>>[number];

async function loadEventsWith(args: {
  userId: string;
  status?: 'active' | 'cleared' | 'all';
  houseId?: number;
  limit?: number;
}) {
  const where: Record<string, unknown> = {
    device: { room: { house: { userId: args.userId, ...(args.houseId ? { id: args.houseId } : {}) } } },
  };
  if (args.status === 'active') where.clearedAt = null;
  else if (args.status === 'cleared') where.clearedAt = { not: null };
  return prisma.alertEvent.findMany({
    where,
    orderBy: [{ clearedAt: { sort: 'desc', nulls: 'first' } }, { triggeredAt: 'desc' }],
    take: args.limit,
    include: {
      alert: { select: { id: true, name: true } },
      device: {
        select: {
          id: true,
          name: true,
          room: { select: { id: true, name: true, house: { select: { id: true, name: true } } } },
        },
      },
    },
  });
}

function serialize(ev: EventWithRelations): SerializedEvent {
  return {
    id: ev.id,
    alertId: ev.alertId,
    alertName: ev.alert.name,
    condition: ev.condition,
    conditionSymbol: conditionSymbol(ev.condition),
    thresholdValue: Number(ev.thresholdValue),
    metricType: ev.metricType,
    triggerValue: Number(ev.triggerValue),
    latestValue: Number(ev.latestValue),
    unit: ev.unit,
    triggeredAt: ev.triggeredAt.toISOString(),
    lastSeenAt: ev.lastSeenAt.toISOString(),
    clearedAt: ev.clearedAt?.toISOString() ?? null,
    clearReason: ev.clearReason,
    house: ev.device.room.house,
    room: { id: ev.device.room.id, name: ev.device.room.name },
    device: { id: ev.device.id, name: ev.device.name },
  };
}

/**
 * Currently-open breaches. Returns the same shape as /alerts/events?status=active,
 * kept for backwards compatibility with the Dashboard widget.
 */
alertsRouter.get('/active', async (req: Request, res: Response) => {
  const events = await loadEventsWith({ userId: req.user!.sub, status: 'active' });
  res.json(events.map(serialize));
});

/**
 * Paginated event list, filterable by status. Default returns everything sorted
 * by recency (active first, then most recent cleared).
 */
alertsRouter.get('/events', async (req: Request, res: Response) => {
  const status = req.query.status;
  const houseIdRaw = req.query.houseId;
  const limitRaw = req.query.limit;

  const filter: 'active' | 'cleared' | 'all' =
    status === 'active' || status === 'cleared' ? status : 'all';
  const houseId =
    typeof houseIdRaw === 'string' && houseIdRaw.length > 0 ? Number(houseIdRaw) : undefined;
  if (houseId !== undefined && !Number.isInteger(houseId)) {
    return res.status(400).json({ error: 'houseId must be an integer' });
  }
  const limit = typeof limitRaw === 'string' ? Math.min(500, Math.max(1, Number(limitRaw))) : 200;
  if (!Number.isInteger(limit)) return res.status(400).json({ error: 'limit must be an integer' });

  const events = await loadEventsWith({ userId: req.user!.sub, status: filter, houseId, limit });
  res.json(events.map(serialize));
});

/** Manual clear — moves an active event to history. */
alertsRouter.post('/events/:id/clear', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });
  const userId = req.user!.sub;

  const ev = await prisma.alertEvent.findUnique({
    where: { id },
    include: { device: { include: { room: { include: { house: true } } } } },
  });
  if (!ev || ev.device.room.house.userId !== userId) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (ev.clearedAt !== null) {
    return res.status(409).json({ error: 'Event already cleared' });
  }

  const updated = await prisma.alertEvent.update({
    where: { id },
    data: { clearedAt: new Date(), clearReason: 'manual' },
    include: {
      alert: { select: { id: true, name: true } },
      device: {
        select: {
          id: true,
          name: true,
          room: { select: { id: true, name: true, house: { select: { id: true, name: true } } } },
        },
      },
    },
  });
  emitAlert(userId, { kind: 'cleared', eventId: updated.id, reason: 'manual' });
  res.json(serialize(updated));
});
