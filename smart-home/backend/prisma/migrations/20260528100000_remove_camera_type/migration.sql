-- AlterEnum
BEGIN;
CREATE TYPE "DeviceType_new" AS ENUM ('thermostat', 'lamp', 'motion_sensor', 'power_meter', 'air_quality', 'water_leak', 'smart_lock');
ALTER TABLE "devices" ALTER COLUMN "type" TYPE "DeviceType_new" USING ("type"::text::"DeviceType_new");
ALTER TYPE "DeviceType" RENAME TO "DeviceType_old";
ALTER TYPE "DeviceType_new" RENAME TO "DeviceType";
DROP TYPE "DeviceType_old";
COMMIT;
