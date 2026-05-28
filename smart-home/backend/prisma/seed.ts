import 'dotenv/config';
import { PrismaClient, DeviceType, MetricType, AlertCondition } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@smart-home.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'admin12345';
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? 'Адміністратор';
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 10);

type DeviceSpec = {
  name: string;
  type: DeviceType;
  metric: MetricType;
  unit: string;
  baseValue: number;
  jitter: number;
  /** When true, generates discrete 0/1 events with the given probability of 1. */
  binary?: boolean;
  eventProbability?: number;
};

const HOUSE = {
  name: 'Мій будинок',
  address: 'вул. Київська, 1',
};

const ROOMS: { name: string; description: string; devices: DeviceSpec[] }[] = [
  {
    name: 'Вітальня',
    description: 'Основна кімната з телевізором та диваном',
    devices: [
      {
        name: 'Термостат "Вітальня"',
        type: DeviceType.thermostat,
        metric: MetricType.temperature,
        unit: '°C',
        baseValue: 22,
        jitter: 1.5,
      },
      {
        name: 'Лампа "Стельова"',
        type: DeviceType.lamp,
        metric: MetricType.light_level,
        unit: 'lx',
        baseValue: 350,
        jitter: 50,
      },
      {
        name: 'Лічильник електроенергії',
        type: DeviceType.power_meter,
        metric: MetricType.power,
        unit: 'kWh',
        baseValue: 1.2,
        jitter: 0.4,
      },
    ],
  },
  {
    name: 'Спальня',
    description: 'Спальна кімната',
    devices: [
      {
        name: 'Датчик якості повітря',
        type: DeviceType.air_quality,
        metric: MetricType.co2,
        unit: 'ppm',
        baseValue: 650,
        jitter: 80,
      },
      {
        name: 'Датчик руху',
        type: DeviceType.motion_sensor,
        metric: MetricType.motion,
        unit: 'event',
        baseValue: 0,
        jitter: 0,
        binary: true,
        eventProbability: 0.5,
      },
      {
        name: 'Розумний замок',
        type: DeviceType.smart_lock,
        metric: MetricType.motion,
        unit: 'event',
        baseValue: 0,
        jitter: 0,
        binary: true,
        eventProbability: 0.5,
      },
    ],
  },
  {
    name: 'Кухня',
    description: 'Кухня та обідня зона',
    devices: [
      {
        name: 'Датчик протікання води',
        type: DeviceType.water_leak,
        metric: MetricType.water_leak,
        unit: 'event',
        baseValue: 0,
        jitter: 0,
        binary: true,
        eventProbability: 0.5,
      },
      {
        name: 'Датчик вологості',
        type: DeviceType.air_quality,
        metric: MetricType.humidity,
        unit: '%',
        baseValue: 45,
        jitter: 8,
      },
    ],
  },
];

// House-level alert rules: apply to all devices in the house emitting the matching metric.
const HOUSE_ALERT_RULES: {
  name: string;
  metric: MetricType;
  condition: AlertCondition;
  threshold: number;
}[] = [
  { name: 'Перевищення температури', metric: MetricType.temperature, condition: AlertCondition.gt, threshold: 28 },
  { name: 'Демо: температура > 10 °C', metric: MetricType.temperature, condition: AlertCondition.gt, threshold: 10 },
  { name: 'Високий CO₂', metric: MetricType.co2, condition: AlertCondition.gt, threshold: 1000 },
  { name: 'Протікання води', metric: MetricType.water_leak, condition: AlertCondition.gte, threshold: 1 },
];

function randomAround(base: number, jitter: number): number {
  return Number((base + (Math.random() * 2 - 1) * jitter).toFixed(2));
}

function generateValue(spec: DeviceSpec): number {
  if (spec.binary) {
    return Math.random() < (spec.eventProbability ?? 0.1) ? 1 : 0;
  }
  return randomAround(spec.baseValue, spec.jitter);
}

async function main() {
  console.log('🌱 Seeding Smart Home database...');

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      fullName: ADMIN_NAME,
      role: 'admin',
    },
  });
  console.log(`  ✓ admin user: ${admin.email} (id=${admin.id})`);

  // Clean previous test data — houses cascade to rooms → devices → telemetry.
  await prisma.house.deleteMany({ where: { userId: admin.id } });

  const house = await prisma.house.create({
    data: { userId: admin.id, name: HOUSE.name, address: HOUSE.address },
  });
  console.log(`  ✓ house: ${house.name}`);

  for (const roomSpec of ROOMS) {
    const room = await prisma.room.create({
      data: { houseId: house.id, name: roomSpec.name, description: roomSpec.description },
    });
    console.log(`    ✓ room: ${room.name}`);

    for (const d of roomSpec.devices) {
      const device = await prisma.device.create({
        data: {
          roomId: room.id,
          name: d.name,
          type: d.type,
          status: 'on',
          isOnline: true,
        },
      });

      const now = Date.now();
      const points = Array.from({ length: 12 }, (_, idx) => {
        const ts = new Date(now - (11 - idx) * 5 * 60_000);
        return {
          deviceId: device.id,
          metricType: d.metric,
          value: generateValue(d),
          unit: d.unit,
          timestamp: ts,
        };
      });
      await prisma.telemetry.createMany({ data: points });

      console.log(`       • device: ${device.name} [${device.type}] + 12 telemetry points`);
    }
  }

  for (const rule of HOUSE_ALERT_RULES) {
    await prisma.alert.create({
      data: {
        houseId: house.id,
        name: rule.name,
        metricType: rule.metric,
        condition: rule.condition,
        thresholdValue: rule.threshold,
        isActive: true,
      },
    });
  }
  console.log(`  ✓ ${HOUSE_ALERT_RULES.length} house-level alert rules`);

  await prisma.notification.create({
    data: {
      userId: admin.id,
      message: 'Систему ініціалізовано тестовими даними',
      type: 'info',
    },
  });

  console.log('✅ Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
