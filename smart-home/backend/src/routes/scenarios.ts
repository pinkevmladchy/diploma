import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { AlertCondition, MetricType, ScenarioTriggerType, DeviceStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { runScenario, resetSensorState } from '../services/scenarioEngine.js';

export const scenariosRouter: Router = Router();

// ---------------------------------------------------------------------------
// Payload schemas — kept aligned with the engine's runtime types
// ---------------------------------------------------------------------------

const triggerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('manual') }),
  z.object({
    kind: z.literal('time'),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  }),
  z.object({
    kind: z.literal('sensor'),
    deviceId: z.string().uuid(),
    metricType: z.nativeEnum(MetricType),
    condition: z.nativeEnum(AlertCondition),
    threshold: z.number(),
  }),
]);

const actionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('set_device_status'),
    deviceId: z.string().uuid(),
    status: z.nativeEnum(DeviceStatus),
  }),
  z.object({
    kind: z.literal('notify'),
    message: z.string().trim().min(1).max(500),
    type: z.enum(['info', 'warning', 'alert']).optional(),
  }),
]);

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  triggerType: z.nativeEnum(ScenarioTriggerType),
  trigger: triggerSchema,
  actions: z.array(actionSchema).min(1).max(20),
  isActive: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  triggerType: z.nativeEnum(ScenarioTriggerType).optional(),
  trigger: triggerSchema.optional(),
  actions: z.array(actionSchema).min(1).max(20).optional(),
  isActive: z.boolean().optional(),
});

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** triggerType and trigger.kind must agree — guards against inconsistent payloads. */
function ensureTriggerConsistent(triggerType: ScenarioTriggerType, kind: string): boolean {
  return triggerType === kind;
}

async function assertOwnedDevice(deviceId: string, userId: string): Promise<boolean> {
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    include: { room: { include: { house: true } } },
  });
  return !!device && device.room.house.userId === userId;
}

async function validateRefs(
  trigger: z.infer<typeof triggerSchema>,
  actions: z.infer<typeof actionSchema>[],
  userId: string,
): Promise<string | null> {
  if (trigger.kind === 'sensor') {
    if (!(await assertOwnedDevice(trigger.deviceId, userId))) {
      return 'Trigger references a device that does not belong to you';
    }
  }
  for (const a of actions) {
    if (a.kind === 'set_device_status') {
      if (!(await assertOwnedDevice(a.deviceId, userId))) {
        return 'Action references a device that does not belong to you';
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

scenariosRouter.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const scenarios = await prisma.scenario.findMany({
    where: { userId },
    orderBy: { id: 'asc' },
  });
  res.json(scenarios);
});

scenariosRouter.post('/', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }
  if (!ensureTriggerConsistent(parsed.data.triggerType, parsed.data.trigger.kind)) {
    return res.status(400).json({ error: 'triggerType and trigger.kind must match' });
  }
  const userId = req.user!.sub;
  const refErr = await validateRefs(parsed.data.trigger, parsed.data.actions, userId);
  if (refErr) return res.status(400).json({ error: refErr });

  const created = await prisma.scenario.create({
    data: {
      userId,
      name: parsed.data.name,
      triggerType: parsed.data.triggerType,
      triggerValue: parsed.data.trigger as object,
      actions: parsed.data.actions as object,
      isActive: parsed.data.isActive ?? true,
    },
  });
  // Sensor scenarios should start as "not matching" so their first match fires
  // the rising-edge instead of being suppressed by a stale state.
  resetSensorState();
  res.status(201).json(created);
});

scenariosRouter.patch('/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }
  const userId = req.user!.sub;
  const existing = await prisma.scenario.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (
    parsed.data.triggerType &&
    parsed.data.trigger &&
    !ensureTriggerConsistent(parsed.data.triggerType, parsed.data.trigger.kind)
  ) {
    return res.status(400).json({ error: 'triggerType and trigger.kind must match' });
  }
  if (parsed.data.trigger && parsed.data.actions) {
    const refErr = await validateRefs(parsed.data.trigger, parsed.data.actions, userId);
    if (refErr) return res.status(400).json({ error: refErr });
  }

  const updated = await prisma.scenario.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.triggerType !== undefined ? { triggerType: parsed.data.triggerType } : {}),
      ...(parsed.data.trigger !== undefined
        ? { triggerValue: parsed.data.trigger as object }
        : {}),
      ...(parsed.data.actions !== undefined ? { actions: parsed.data.actions as object } : {}),
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
    },
  });
  resetSensorState();
  res.json(updated);
});

scenariosRouter.delete('/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });
  const userId = req.user!.sub;
  const existing = await prisma.scenario.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    return res.status(404).json({ error: 'Not found' });
  }
  await prisma.scenario.delete({ where: { id } });
  res.status(204).end();
});

scenariosRouter.post('/:id/run', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });
  const userId = req.user!.sub;
  const existing = await prisma.scenario.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    return res.status(404).json({ error: 'Not found' });
  }
  const result = await runScenario(id, 'manual');
  res.json(result);
});
