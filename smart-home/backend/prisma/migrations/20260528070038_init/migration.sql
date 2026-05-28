-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'user');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('thermostat', 'lamp', 'motion_sensor', 'power_meter', 'air_quality', 'water_leak', 'smart_lock', 'camera');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('on', 'off');

-- CreateEnum
CREATE TYPE "MetricType" AS ENUM ('temperature', 'humidity', 'power', 'motion', 'co2', 'light_level', 'water_leak');

-- CreateEnum
CREATE TYPE "AggregationPeriod" AS ENUM ('hour', 'day');

-- CreateEnum
CREATE TYPE "ScenarioTriggerType" AS ENUM ('time', 'sensor', 'manual');

-- CreateEnum
CREATE TYPE "AlertCondition" AS ENUM ('gt', 'lt', 'eq', 'gte', 'lte');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('warning', 'info', 'alert');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "houses" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "houses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" SERIAL NOT NULL,
    "house_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "room_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DeviceType" NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'off',
    "is_online" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry" (
    "id" BIGSERIAL NOT NULL,
    "device_id" UUID NOT NULL,
    "metric_type" "MetricType" NOT NULL,
    "value" DECIMAL(14,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_aggregated" (
    "id" BIGSERIAL NOT NULL,
    "device_id" UUID NOT NULL,
    "metric_type" "MetricType" NOT NULL,
    "period" "AggregationPeriod" NOT NULL,
    "avg_value" DECIMAL(14,4) NOT NULL,
    "min_value" DECIMAL(14,4) NOT NULL,
    "max_value" DECIMAL(14,4) NOT NULL,
    "period_start" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "telemetry_aggregated_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_logs" (
    "id" BIGSERIAL NOT NULL,
    "device_id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenarios" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "trigger_type" "ScenarioTriggerType" NOT NULL,
    "trigger_value" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" SERIAL NOT NULL,
    "house_id" INTEGER NOT NULL,
    "name" TEXT,
    "metric_type" "MetricType" NOT NULL,
    "condition" "AlertCondition" NOT NULL,
    "threshold_value" DECIMAL(14,4) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" UUID,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'info',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "houses_user_id_idx" ON "houses"("user_id");

-- CreateIndex
CREATE INDEX "rooms_house_id_idx" ON "rooms"("house_id");

-- CreateIndex
CREATE INDEX "devices_room_id_idx" ON "devices"("room_id");

-- CreateIndex
CREATE INDEX "telemetry_device_id_timestamp_idx" ON "telemetry"("device_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "telemetry_metric_type_timestamp_idx" ON "telemetry"("metric_type", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "telemetry_aggregated_device_id_metric_type_period_period_st_idx" ON "telemetry_aggregated"("device_id", "metric_type", "period", "period_start" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "telemetry_aggregated_device_id_metric_type_period_period_st_key" ON "telemetry_aggregated"("device_id", "metric_type", "period", "period_start");

-- CreateIndex
CREATE INDEX "device_logs_device_id_timestamp_idx" ON "device_logs"("device_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "scenarios_user_id_idx" ON "scenarios"("user_id");

-- CreateIndex
CREATE INDEX "alerts_house_id_metric_type_idx" ON "alerts"("house_id", "metric_type");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "houses" ADD CONSTRAINT "houses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry" ADD CONSTRAINT "telemetry_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_aggregated" ADD CONSTRAINT "telemetry_aggregated_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_logs" ADD CONSTRAINT "device_logs_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_logs" ADD CONSTRAINT "device_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
