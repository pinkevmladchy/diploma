-- Persist alert breaches so we can show active vs. historical events
-- and let users manually clear them.

CREATE TABLE "alert_events" (
  "id"              SERIAL          NOT NULL,
  "alert_id"        INTEGER         NOT NULL,
  "device_id"       UUID            NOT NULL,
  "metric_type"     "MetricType"    NOT NULL,
  "trigger_value"   DECIMAL(14, 4)  NOT NULL,
  "latest_value"    DECIMAL(14, 4)  NOT NULL,
  "unit"            TEXT            NOT NULL,
  "threshold_value" DECIMAL(14, 4)  NOT NULL,
  "condition"       "AlertCondition" NOT NULL,
  "triggered_at"    TIMESTAMPTZ(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at"    TIMESTAMPTZ(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cleared_at"      TIMESTAMPTZ(6),
  "clear_reason"    TEXT,

  CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "alert_events_alert_id_cleared_at_triggered_at_idx"
  ON "alert_events" ("alert_id", "cleared_at", "triggered_at" DESC);

CREATE INDEX "alert_events_device_id_cleared_at_idx"
  ON "alert_events" ("device_id", "cleared_at");

ALTER TABLE "alert_events"
  ADD CONSTRAINT "alert_events_alert_id_fkey"
  FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "alert_events"
  ADD CONSTRAINT "alert_events_device_id_fkey"
  FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
