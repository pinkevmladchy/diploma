import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';

export const housesRouter: Router = Router();

const houseInput = z.object({
  name: z.string().trim().min(1).max(100),
  address: z.string().trim().max(200).optional().nullable(),
});

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

housesRouter.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const houses = await prisma.house.findMany({
    where: { userId },
    orderBy: { id: 'asc' },
    include: { _count: { select: { rooms: true } } },
  });
  res.json(
    houses.map((h) => ({
      id: h.id,
      name: h.name,
      address: h.address,
      roomCount: h._count.rooms,
      createdAt: h.createdAt,
    })),
  );
});

housesRouter.get('/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });
  const userId = req.user!.sub;

  const house = await prisma.house.findUnique({
    where: { id },
    include: {
      _count: { select: { rooms: true } },
      rooms: {
        orderBy: { id: 'asc' },
        include: { _count: { select: { devices: true } } },
      },
    },
  });
  if (!house || house.userId !== userId) return res.status(404).json({ error: 'Not found' });

  res.json({
    id: house.id,
    name: house.name,
    address: house.address,
    createdAt: house.createdAt,
    roomCount: house._count.rooms,
    rooms: house.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      deviceCount: r._count.devices,
    })),
  });
});

housesRouter.post('/', async (req: Request, res: Response) => {
  const parsed = houseInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }
  const userId = req.user!.sub;
  const house = await prisma.house.create({
    data: { userId, name: parsed.data.name, address: parsed.data.address ?? null },
  });
  res.status(201).json(house);
});

housesRouter.patch('/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });

  const parsed = houseInput.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }

  const userId = req.user!.sub;
  const existing = await prisma.house.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) return res.status(404).json({ error: 'Not found' });

  const updated = await prisma.house.update({ where: { id }, data: parsed.data });
  res.json(updated);
});

housesRouter.delete('/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });

  const userId = req.user!.sub;
  const existing = await prisma.house.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) return res.status(404).json({ error: 'Not found' });

  await prisma.house.delete({ where: { id } });
  res.status(204).end();
});
