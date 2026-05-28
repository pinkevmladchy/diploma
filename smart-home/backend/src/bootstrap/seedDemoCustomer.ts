import bcrypt from 'bcryptjs';
import { AlertCondition, DeviceType, MetricType, ScenarioTriggerType } from '@prisma/client';
import { prisma } from '../db.js';

const EMAIL = process.env.DEMO_CUSTOMER_EMAIL ?? 'customer@smart-home.local';
const PASSWORD = process.env.DEMO_CUSTOMER_PASSWORD ?? 'customer12345';
const NAME = process.env.DEMO_CUSTOMER_NAME ?? 'Тестовий користувач';
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 10);

type DeviceSpec = {
  name: string;
  type: DeviceType;
  metric: MetricType;
  unit: string;
  initialValue: number;
};

const DEMO_HOUSE = {
  name: 'Квартира на Подолі',
  address: 'Київ, вул. Кирилівська, 12',
  rooms: [
    {
      name: 'Вітальня',
      description: 'Основна кімната з диваном і ТВ',
      devices: [
        { name: 'Термостат «Вітальня»', type: DeviceType.thermostat, metric: MetricType.temperature, unit: '°C', initialValue: 22.5 },
        { name: 'Люстра «Вітальня»', type: DeviceType.lamp, metric: MetricType.light_level, unit: 'lx', initialValue: 320 },
        { name: 'Датчик руху', type: DeviceType.motion_sensor, metric: MetricType.motion, unit: 'event', initialValue: 0 },
      ] satisfies DeviceSpec[],
    },
    {
      name: 'Кухня',
      description: 'З витяжкою та сенсором якості повітря',
      devices: [
        { name: 'Якість повітря', type: DeviceType.air_quality, metric: MetricType.co2, unit: 'ppm', initialValue: 620 },
        { name: 'Лічильник споживання', type: DeviceType.power_meter, metric: MetricType.power, unit: 'kWh', initialValue: 1.4 },
      ] satisfies DeviceSpec[],
    },
  ],
};

/**
 * Idempotent: ensures a demo customer account with a small but realistic house
 * exists. Re-running never duplicates rooms/devices. If the customer exists
 * but is missing scenarios/alerts (e.g. seeded with an earlier version of this
 * script) we backfill them — but never touch existing rows.
 */
export async function ensureDemoCustomer(): Promise<{ created: boolean; email: string }> {
  const existing = await prisma.user.findUnique({
    where: { email: EMAIL },
    include: {
      houses: {
        include: { rooms: { include: { devices: true } }, alerts: true },
      },
      scenarios: true,
    },
  });

  if (existing) {
    // Backfill missing rules/scenarios so demos always show this content.
    const firstHouse = existing.houses[0];
    if (firstHouse) {
      const devicesByName = new Map<string, { id: string }>();
      for (const r of firstHouse.rooms) for (const d of r.devices) devicesByName.set(d.name, d);
      if (firstHouse.alerts.length === 0) await seedAlerts(firstHouse.id);
      if (existing.scenarios.length === 0) await seedScenarios(existing.id, devicesByName);
    }
    return { created: false, email: EMAIL };
  }

  const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: { email: EMAIL, passwordHash, fullName: NAME, role: 'user' },
  });

  const house = await prisma.house.create({
    data: {
      userId: user.id,
      name: DEMO_HOUSE.name,
      address: DEMO_HOUSE.address,
    },
  });

  // device lookups, keyed by name, for the scenario references below
  const createdDevices = new Map<string, { id: string }>();

  for (const roomSpec of DEMO_HOUSE.rooms) {
    const room = await prisma.room.create({
      data: {
        houseId: house.id,
        name: roomSpec.name,
        description: roomSpec.description,
      },
    });
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
      createdDevices.set(d.name, device);
      // Seed a single telemetry reading so dashboards aren't blank on first login.
      await prisma.telemetry.create({
        data: {
          deviceId: device.id,
          metricType: d.metric,
          value: d.initialValue,
          unit: d.unit,
        },
      });
    }
  }

  await seedAlerts(house.id);
  await seedScenarios(user.id, createdDevices);

  return { created: true, email: EMAIL };
}

async function seedAlerts(houseId: number): Promise<void> {
  await prisma.alert.createMany({
    data: [
      {
        houseId,
        name: 'Перегрів у будинку',
        metricType: MetricType.temperature,
        condition: AlertCondition.gt,
        thresholdValue: 25,
        isActive: true,
      },
      {
        houseId,
        name: 'Високий рівень CO₂',
        metricType: MetricType.co2,
        condition: AlertCondition.gt,
        thresholdValue: 1000,
        isActive: true,
      },
      {
        houseId,
        name: 'Виявлено протікання',
        metricType: MetricType.water_leak,
        condition: AlertCondition.gte,
        thresholdValue: 1,
        isActive: true,
      },
    ],
  });
}

async function seedScenarios(
  userId: string,
  devicesByName: Map<string, { id: string }>,
): Promise<void> {
  const lamp = devicesByName.get('Люстра «Вітальня»');
  const thermostat = devicesByName.get('Термостат «Вітальня»');
  const motion = devicesByName.get('Датчик руху');
  const airQ = devicesByName.get('Якість повітря');

  if (lamp) {
    await prisma.scenario.create({
      data: {
        userId,
        name: 'Нічний режим — вимкнути світло',
        triggerType: ScenarioTriggerType.time,
        triggerValue: { kind: 'time', hour: 23, minute: 0 },
        actions: [
          { kind: 'set_device_status', deviceId: lamp.id, status: 'off' },
          { kind: 'notify', message: 'Світло у вітальні вимкнено на ніч', type: 'info' },
        ],
        isActive: true,
      },
    });
  }
  if (motion && lamp) {
    await prisma.scenario.create({
      data: {
        userId,
        name: 'Рух → увімкнути світло',
        triggerType: ScenarioTriggerType.sensor,
        triggerValue: {
          kind: 'sensor',
          deviceId: motion.id,
          metricType: 'motion',
          condition: 'gte',
          threshold: 1,
        },
        actions: [{ kind: 'set_device_status', deviceId: lamp.id, status: 'on' }],
        isActive: true,
      },
    });
  }
  if (airQ) {
    await prisma.scenario.create({
      data: {
        userId,
        name: 'Високий CO₂ → нагадування провітрити',
        triggerType: ScenarioTriggerType.sensor,
        triggerValue: {
          kind: 'sensor',
          deviceId: airQ.id,
          metricType: 'co2',
          condition: 'gt',
          threshold: 900,
        },
        actions: [
          { kind: 'notify', message: 'Час провітрити кухню — CO₂ зашкалює', type: 'warning' },
        ],
        isActive: true,
      },
    });
  }
  if (thermostat) {
    await prisma.scenario.create({
      data: {
        userId,
        name: 'Ранкова сцена',
        triggerType: ScenarioTriggerType.time,
        triggerValue: { kind: 'time', hour: 7, minute: 0 },
        actions: [
          { kind: 'set_device_status', deviceId: thermostat.id, status: 'on' },
          { kind: 'notify', message: 'Доброго ранку! Термостат прогріває вітальню', type: 'info' },
        ],
        isActive: true,
      },
    });
  }
}
