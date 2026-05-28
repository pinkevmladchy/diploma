import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { DeviceType, DeviceStatus } from '@prisma/client';
import { prisma } from '../db.js';

export const devicesRouter: Router = Router();

const deviceTypeEnum = z.nativeEnum(DeviceType);
const deviceStatusEnum = z.nativeEnum(DeviceStatus);

const createSchema = z.object({
  roomId: z.number().int().positive(),
  name: z.string().trim().min(1).max(100),
  type: deviceTypeEnum,
  status: deviceStatusEnum.optional(),
  isOnline: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  type: deviceTypeEnum.optional(),
  status: deviceStatusEnum.optional(),
  isOnline: z.boolean().optional(),
  floorplanX: z.number().min(0).max(1).nullable().optional(),
  floorplanY: z.number().min(0).max(1).nullable().optional(),
});

async function loadOwnedRoom(roomId: number, userId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId }, include: { house: true } });
  if (!room || room.house.userId !== userId) return null;
  return room;
}

async function loadOwnedDevice(deviceId: string, userId: string) {
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    include: { room: { include: { house: true } } },
  });
  if (!device || device.room.house.userId !== userId) return null;
  return device;
}

devicesRouter.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const roomIdParam = req.query.roomId;
  const houseIdParam = req.query.houseId;

  const roomId =
    typeof roomIdParam === 'string' && roomIdParam.length > 0 ? Number(roomIdParam) : undefined;
  const houseId =
    typeof houseIdParam === 'string' && houseIdParam.length > 0 ? Number(houseIdParam) : undefined;

  if (roomId !== undefined && !Number.isInteger(roomId)) {
    return res.status(400).json({ error: 'roomId must be an integer' });
  }
  if (houseId !== undefined && !Number.isInteger(houseId)) {
    return res.status(400).json({ error: 'houseId must be an integer' });
  }

  const devices = await prisma.device.findMany({
    where: {
      room: {
        house: { userId },
        ...(houseId !== undefined ? { houseId } : {}),
      },
      ...(roomId !== undefined ? { roomId } : {}),
    },
    orderBy: { name: 'asc' },
    include: {
      room: { select: { id: true, name: true, house: { select: { id: true, name: true } } } },
      telemetry: { orderBy: { timestamp: 'desc' }, take: 1 },
    },
  });

  res.json(
    devices.map((d) => {
      const last = d.telemetry[0];
      return {
        id: d.id,
        name: d.name,
        type: d.type,
        status: d.status,
        isOnline: d.isOnline,
        floorplanX: d.floorplanX,
        floorplanY: d.floorplanY,
        room: { id: d.room.id, name: d.room.name, house: d.room.house },
        latestTelemetry: last
          ? {
              metricType: last.metricType,
              value: Number(last.value),
              unit: last.unit,
              timestamp: last.timestamp,
            }
          : null,
      };
    }),
  );
});

devicesRouter.get('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const device = await prisma.device.findUnique({
    where: { id: req.params.id },
    include: {
      room: { include: { house: true } },
      telemetry: { orderBy: { timestamp: 'desc' }, take: 1 },
    },
  });
  if (!device || device.room.house.userId !== userId) {
    return res.status(404).json({ error: 'Not found' });
  }
  const last = device.telemetry[0];
  res.json({
    id: device.id,
    name: device.name,
    type: device.type,
    status: device.status,
    isOnline: device.isOnline,
    floorplanX: device.floorplanX,
    floorplanY: device.floorplanY,
    createdAt: device.createdAt,
    room: {
      id: device.room.id,
      name: device.room.name,
      house: { id: device.room.house.id, name: device.room.house.name },
    },
    latestTelemetry: last
      ? {
          metricType: last.metricType,
          value: Number(last.value),
          unit: last.unit,
          timestamp: last.timestamp,
        }
      : null,
  });
});

devicesRouter.get('/:id/telemetry', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const limitRaw = req.query.limit;
  const fromRaw = req.query.from;
  const toRaw = req.query.to;
  const limit = typeof limitRaw === 'string' ? Math.min(5000, Math.max(1, Number(limitRaw))) : 50;
  if (!Number.isInteger(limit)) return res.status(400).json({ error: 'limit must be an integer' });

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

  const device = await prisma.device.findUnique({
    where: { id: req.params.id },
    include: { room: { include: { house: true } } },
  });
  if (!device || device.room.house.userId !== userId) {
    return res.status(404).json({ error: 'Not found' });
  }

  const where: { deviceId: string; timestamp?: { gte?: Date; lte?: Date } } = {
    deviceId: device.id,
  };
  if (from || to) {
    where.timestamp = {};
    if (from) where.timestamp.gte = from;
    if (to) where.timestamp.lte = to;
  }

  const points = await prisma.telemetry.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: limit,
  });
  res.json(
    points.map((p) => ({
      id: p.id.toString(),
      metricType: p.metricType,
      value: Number(p.value),
      unit: p.unit,
      timestamp: p.timestamp,
    })),
  );
});

devicesRouter.post('/', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }
  const userId = req.user!.sub;
  if (!(await loadOwnedRoom(parsed.data.roomId, userId))) {
    return res.status(404).json({ error: 'Room not found' });
  }
  const device = await prisma.device.create({
    data: {
      roomId: parsed.data.roomId,
      name: parsed.data.name,
      type: parsed.data.type,
      status: parsed.data.status ?? 'off',
      isOnline: parsed.data.isOnline ?? true,
    },
  });
  res.status(201).json(device);
});

devicesRouter.patch('/:id', async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }
  const userId = req.user!.sub;
  const existing = await loadOwnedDevice(req.params.id, userId);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const oldStatus = existing.status;
  const updated = await prisma.device.update({ where: { id: existing.id }, data: parsed.data });

  if (parsed.data.status && parsed.data.status !== oldStatus) {
    await prisma.deviceLog.create({
      data: {
        deviceId: existing.id,
        userId,
        action: 'status_change',
        oldValue: oldStatus,
        newValue: parsed.data.status,
      },
    });
  }

  res.json(updated);
});

devicesRouter.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const existing = await loadOwnedDevice(req.params.id, userId);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  await prisma.device.delete({ where: { id: existing.id } });
  res.status(204).end();
});
