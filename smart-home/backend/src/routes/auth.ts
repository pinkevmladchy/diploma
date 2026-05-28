import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../auth/jwt.js';
import { requireAuth } from '../auth/middleware.js';
import { avatarUpload, removeUploadedFile } from '../uploads.js';

export const authRouter: Router = Router();

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 10);

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'Пароль має містити щонайменше 8 символів').max(100),
  fullName: z.string().trim().min(1, "Вкажіть ім'я").max(100),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

authRouter.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }
  const { email, password, fullName } = parsed.data;
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    const user = await prisma.user.create({
      data: { email, passwordHash, fullName, role: 'user' },
    });
    const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
    const refreshToken = signRefreshToken({ sub: user.id });
    return res.status(201).json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        avatarUrl: user.avatarUrl,
        themeBrand: user.themeBrand,
        themePrimary: user.themePrimary,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return res.status(409).json({ error: 'Email вже використовується' });
    }
    throw e;
  }
});

authRouter.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  const refreshToken = signRefreshToken({ sub: user.id });

  res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
  });
});

authRouter.post('/refresh', async (req: Request, res: Response) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  try {
    const payload = verifyRefreshToken(parsed.data.refreshToken);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: 'User not found' });

    const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
    res.json({ accessToken });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

authRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      avatarUrl: true,
      themeBrand: true,
      themePrimary: true,
      createdAt: true,
    },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

const themeSchema = z.object({
  brand: z.string().trim().min(1).max(40).nullable().optional(),
  primary: z.string().trim().min(1).max(40).nullable().optional(),
});

authRouter.patch('/me/theme', requireAuth, async (req: Request, res: Response) => {
  const parsed = themeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }
  const updated = await prisma.user.update({
    where: { id: req.user!.sub },
    data: {
      ...(parsed.data.brand !== undefined ? { themeBrand: parsed.data.brand } : {}),
      ...(parsed.data.primary !== undefined ? { themePrimary: parsed.data.primary } : {}),
    },
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
  res.json(updated);
});

authRouter.post(
  '/me/avatar',
  requireAuth,
  avatarUpload.single('avatar'),
  async (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const publicUrl = `/uploads/avatars/${req.file.filename}`;
    const existing = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: { avatarUrl: true },
    });
    const user = await prisma.user.update({
      where: { id: req.user!.sub },
      data: { avatarUrl: publicUrl },
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
    // Discard the previous file once the DB row points to the new one.
    if (existing?.avatarUrl) removeUploadedFile(existing.avatarUrl);
    res.json(user);
  },
);

authRouter.delete('/me/avatar', requireAuth, async (req: Request, res: Response) => {
  const existing = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { avatarUrl: true },
  });
  if (existing?.avatarUrl) removeUploadedFile(existing.avatarUrl);
  const user = await prisma.user.update({
    where: { id: req.user!.sub },
    data: { avatarUrl: null },
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
  res.json(user);
});
