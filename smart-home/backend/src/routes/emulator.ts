import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { emulator } from '../services/emulator.js';

export const emulatorRouter: Router = Router();

const startSchema = z.object({
  intervalMs: z.number().int().min(1000).max(60000).optional(),
});

emulatorRouter.get('/status', (req: Request, res: Response) => {
  res.json(emulator.status(req.user!.sub));
});

emulatorRouter.post('/start', (req: Request, res: Response) => {
  const parsed = startSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }
  const status = emulator.start(req.user!.sub, parsed.data.intervalMs);
  res.json(status);
});

emulatorRouter.post('/stop', (req: Request, res: Response) => {
  const status = emulator.stop(req.user!.sub);
  res.json(status);
});
