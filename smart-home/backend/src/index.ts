import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import pino from 'pino';
import { housesRouter } from './routes/houses.js';
import { roomsRouter } from './routes/rooms.js';
import { devicesRouter } from './routes/devices.js';
import { alertsRouter } from './routes/alerts.js';
import { telemetryRouter } from './routes/telemetry.js';
import { emulatorRouter } from './routes/emulator.js';
import { authRouter } from './routes/auth.js';
import { scenariosRouter } from './routes/scenarios.js';
import { adminRouter } from './routes/admin.js';
import { requireAuth, requireRole } from './auth/middleware.js';
import { emulator } from './services/emulator.js';
import { initRealtime, closeRealtime } from './realtime.js';
import { startScenarioScheduler, stopScenarioScheduler } from './services/scenarioEngine.js';
import { ensureAdminUser } from './bootstrap/seedAdmin.js';
import { ensureDemoCustomer } from './bootstrap/seedDemoCustomer.js';
import { UPLOAD_ROOT } from './uploads.js';

const logger = pino({
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
      : undefined,
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// User-uploaded files (floorplans, etc.) — served as-is, no auth (URLs are unguessable).
app.use('/uploads', express.static(UPLOAD_ROOT, { fallthrough: true, maxAge: '1h' }));

app.use('/auth', authRouter);
// Customer-only domain — all smart-home functionality is hidden from admins.
const customerOnly = [requireAuth, requireRole('user')];
app.use('/houses', customerOnly, housesRouter);
app.use('/rooms', customerOnly, roomsRouter);
app.use('/devices', customerOnly, devicesRouter);
app.use('/alerts', customerOnly, alertsRouter);
app.use('/telemetry', customerOnly, telemetryRouter);
app.use('/emulator', customerOnly, emulatorRouter);
app.use('/scenarios', customerOnly, scenariosRouter);
// Admin-only area — managing customer accounts.
app.use('/admin', requireAuth, requireRole('admin'), adminRouter);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT ?? 4000);
const server = app.listen(port, () => {
  logger.info(`Smart Home API listening on http://localhost:${port}`);
});

initRealtime(server);
logger.info('Socket.io ready on /socket.io');

startScenarioScheduler();
logger.info('Scenario time scheduler running (1-minute ticks)');

ensureAdminUser()
  .then(({ created, email }) => {
    if (created) logger.info(`Admin user created: ${email}`);
    else logger.info(`Admin user already exists: ${email}`);
  })
  .catch((err) => logger.error({ err }, 'Failed to ensure admin user'));

ensureDemoCustomer()
  .then(({ created, email }) => {
    if (created) logger.info(`Demo customer created: ${email}`);
    else logger.info(`Demo customer already exists: ${email}`);
  })
  .catch((err) => logger.error({ err }, 'Failed to ensure demo customer'));

// Graceful shutdown — stop emulator timers and close sockets so the process exits cleanly.
async function shutdown(sig: string) {
  logger.info(`Received ${sig}, stopping emulators…`);
  emulator.stopAll();
  stopScenarioScheduler();
  await closeRealtime();
  server.close(() => process.exit(0));
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
