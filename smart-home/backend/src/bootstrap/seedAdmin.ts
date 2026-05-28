import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@smart-home.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin12345';
const ADMIN_NAME = process.env.ADMIN_NAME ?? 'Адміністратор';
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 10);

/**
 * Idempotent: makes sure exactly one admin account exists when the server
 * starts. Re-running it never overwrites a customer or changes an existing
 * admin's password — it only creates the account if no admin row is present.
 */
export async function ensureAdminUser(): Promise<{ created: boolean; email: string }> {
  const existing = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (existing) return { created: false, email: existing.email };

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);
  await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      passwordHash,
      fullName: ADMIN_NAME,
      role: 'admin',
    },
  });
  return { created: true, email: ADMIN_EMAIL };
}
