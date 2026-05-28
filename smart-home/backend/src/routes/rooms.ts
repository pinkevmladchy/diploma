import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { floorplanUpload, removeUploadedFile } from '../uploads.js';

export const roomsRouter: Router = Router();

const createSchema = z.object({
  houseId: z.number().int().positive(),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional().nullable(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function assertHouseOwned(houseId: number, userId: string): Promise<boolean> {
  const house = await prisma.house.findUnique({ where: { id: houseId } });
  return !!house && house.userId === userId;
}

async function loadOwnedRoom(roomId: number, userId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId }, include: { house: true } });
  if (!room || room.house.userId !== userId) return null;
  return room;
}

roomsRouter.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const houseIdRaw = req.query.houseId;
  const houseId =
    typeof houseIdRaw === 'string' && houseIdRaw.length > 0 ? Number(houseIdRaw) : undefined;
  if (houseId !== undefined && !Number.isInteger(houseId)) {
    return res.status(400).json({ error: 'houseId must be an integer' });
  }

  const rooms = await prisma.room.findMany({
    where: {
      house: { userId },
      ...(houseId !== undefined ? { houseId } : {}),
    },
    orderBy: { id: 'asc' },
    include: {
      house: { select: { id: true, name: true } },
      _count: { select: { devices: true } },
    },
  });

  res.json(
    rooms.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      floorplanUrl: r.floorplanUrl,
      house: r.house,
      deviceCount: r._count.devices,
      createdAt: r.createdAt,
    })),
  );
});

roomsRouter.get('/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });

  const userId = req.user!.sub;
  const room = await prisma.room.findUnique({
    where: { id },
    include: {
      house: true,
      devices: {
        orderBy: { name: 'asc' },
        include: { telemetry: { orderBy: { timestamp: 'desc' }, take: 1 } },
      },
    },
  });
  if (!room || room.house.userId !== userId) return res.status(404).json({ error: 'Not found' });

  res.json({
    id: room.id,
    name: room.name,
    description: room.description,
    floorplanUrl: room.floorplanUrl,
    createdAt: room.createdAt,
    house: { id: room.house.id, name: room.house.name },
    devices: room.devices.map((d) => {
      const last = d.telemetry[0];
      return {
        id: d.id,
        name: d.name,
        type: d.type,
        status: d.status,
        isOnline: d.isOnline,
        floorplanX: d.floorplanX,
        floorplanY: d.floorplanY,
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
  });
});

roomsRouter.post('/', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }
  const userId = req.user!.sub;
  if (!(await assertHouseOwned(parsed.data.houseId, userId))) {
    return res.status(404).json({ error: 'House not found' });
  }

  const room = await prisma.room.create({
    data: {
      houseId: parsed.data.houseId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
    },
  });
  res.status(201).json(room);
});

roomsRouter.patch('/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }

  const userId = req.user!.sub;
  const room = await loadOwnedRoom(id, userId);
  if (!room) return res.status(404).json({ error: 'Not found' });

  const updated = await prisma.room.update({ where: { id }, data: parsed.data });
  res.json(updated);
});

roomsRouter.delete('/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });

  const userId = req.user!.sub;
  const room = await loadOwnedRoom(id, userId);
  if (!room) return res.status(404).json({ error: 'Not found' });

  // Also clean up any floorplan file before DB cascade kicks in.
  removeUploadedFile(room.floorplanUrl);
  await prisma.room.delete({ where: { id } });
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Floorplan upload / removal
// ---------------------------------------------------------------------------

roomsRouter.post(
  '/:id/floorplan',
  floorplanUpload.single('file'),
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid id' });

    const userId = req.user!.sub;
    const room = await loadOwnedRoom(id, userId);
    if (!room) {
      removeUploadedFile(req.file ? `/uploads/floorplans/${req.file.filename}` : null);
      return res.status(404).json({ error: 'Not found' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (field "file")' });

    removeUploadedFile(room.floorplanUrl);

    const floorplanUrl = `/uploads/floorplans/${req.file.filename}`;
    await prisma.room.update({ where: { id }, data: { floorplanUrl } });
    res.json({ floorplanUrl });
  },
);

roomsRouter.delete('/:id/floorplan', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });

  const userId = req.user!.sub;
  const room = await loadOwnedRoom(id, userId);
  if (!room) return res.status(404).json({ error: 'Not found' });

  removeUploadedFile(room.floorplanUrl);
  await prisma.room.update({ where: { id }, data: { floorplanUrl: null } });
  // Removing the floorplan invalidates device positions on it.
  await prisma.device.updateMany({
    where: { roomId: id },
    data: { floorplanX: null, floorplanY: null },
  });
  res.status(204).end();
});
