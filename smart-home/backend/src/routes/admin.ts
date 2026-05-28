import { Router, type Request, type Response } from 'express';
import { prisma } from '../db.js';
import { signAccessToken, signRefreshToken } from '../auth/jwt.js';

export const adminRouter: Router = Router();

/**
 * List all customers (role=user) with summary counts. Admin-facing only.
 */
adminRouter.get('/customers', async (_req: Request, res: Response) => {
  const customers = await prisma.user.findMany({
    where: { role: 'user' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      fullName: true,
      avatarUrl: true,
      createdAt: true,
      _count: {
        select: { houses: true, scenarios: true, notifications: true },
      },
      houses: {
        select: {
          _count: { select: { rooms: true } },
          rooms: { select: { _count: { select: { devices: true } } } },
        },
      },
    },
  });

  res.json(
    customers.map((c) => {
      const roomCount = c.houses.reduce((s, h) => s + h._count.rooms, 0);
      const deviceCount = c.houses.reduce(
        (s, h) => s + h.rooms.reduce((rs, r) => rs + r._count.devices, 0),
        0,
      );
      return {
        id: c.id,
        email: c.email,
        fullName: c.fullName,
        avatarUrl: c.avatarUrl,
        createdAt: c.createdAt,
        houseCount: c._count.houses,
        roomCount,
        deviceCount,
        scenarioCount: c._count.scenarios,
        notificationCount: c._count.notifications,
      };
    }),
  );
});

/**
 * Single customer with full breakdown of their resources.
 */
adminRouter.get('/customers/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  const c = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      avatarUrl: true,
      createdAt: true,
      houses: {
        select: {
          id: true,
          name: true,
          address: true,
          createdAt: true,
          rooms: {
            select: {
              id: true,
              name: true,
              _count: { select: { devices: true } },
            },
          },
        },
      },
      _count: { select: { scenarios: true, notifications: true } },
    },
  });
  if (!c || c.role !== 'user') {
    return res.status(404).json({ error: 'Customer not found' });
  }

  res.json({
    id: c.id,
    email: c.email,
    fullName: c.fullName,
    avatarUrl: c.avatarUrl,
    createdAt: c.createdAt,
    scenarioCount: c._count.scenarios,
    notificationCount: c._count.notifications,
    houses: c.houses.map((h) => ({
      id: h.id,
      name: h.name,
      address: h.address,
      createdAt: h.createdAt,
      roomCount: h.rooms.length,
      deviceCount: h.rooms.reduce((s, r) => s + r._count.devices, 0),
      rooms: h.rooms.map((r) => ({
        id: r.id,
        name: r.name,
        deviceCount: r._count.devices,
      })),
    })),
  });
});

/**
 * Mint an access+refresh token for the target customer so the admin can step
 * into their account. The customer's own credentials never leave the database.
 */
adminRouter.post('/customers/:id/impersonate', async (req: Request, res: Response) => {
  const id = req.params.id;
  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      avatarUrl: true,
      themeBrand: true,
      themePrimary: true,
    },
  });
  if (!target) return res.status(404).json({ error: 'Customer not found' });
  if (target.role !== 'user') {
    return res.status(403).json({ error: 'Only customer accounts can be impersonated' });
  }
  const accessToken = signAccessToken({ sub: target.id, email: target.email, role: target.role });
  const refreshToken = signRefreshToken({ sub: target.id });
  res.json({ accessToken, refreshToken, user: target });
});

/**
 * Delete a customer + everything they own (cascade via Prisma relations).
 * Admins themselves cannot be deleted via this endpoint.
 */
adminRouter.delete('/customers/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!target) return res.status(404).json({ error: 'Customer not found' });
  if (target.role !== 'user') {
    return res.status(403).json({ error: 'Only customer accounts can be removed via this route' });
  }
  await prisma.user.delete({ where: { id } });
  res.status(204).end();
});
