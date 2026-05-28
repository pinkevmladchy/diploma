import type { MetricType } from '../api';

const BINARY_METRICS: ReadonlySet<MetricType> = new Set(['motion', 'water_leak']);

export function isBinaryMetric(m: MetricType): boolean {
  return BINARY_METRICS.has(m);
}

export function isBinaryActive(value: number): boolean {
  return value >= 0.5;
}

/**
 * User-friendly representation of a telemetry value.
 * Returns text only — caller decides styling (color, unit, etc.).
 */
export function formatMetricValue(m: MetricType, value: number, unit?: string): string {
  if (isBinaryMetric(m)) {
    return binaryStateLabel(m, value);
  }
  const num = value.toFixed(2);
  return unit ? `${num} ${unit}` : num;
}

/**
 * Long label for the current state of a binary metric.
 * Used in stat cards / banner cells where space allows full phrasing.
 */
export function binaryStateLabel(m: MetricType, value: number): string {
  const on = isBinaryActive(value);
  if (m === 'motion') return on ? 'Виявлено рух' : 'Спокій';
  if (m === 'water_leak') return on ? 'Протікання' : 'Сухо';
  return on ? 'Активно' : 'Неактивно';
}

/** Short label used on the chart Y axis. */
export function binaryShortLabel(m: MetricType, active: boolean): string {
  if (m === 'motion') return active ? 'Рух' : 'Спокій';
  if (m === 'water_leak') return active ? 'Протікання' : 'Сухо';
  return active ? 'Так' : 'Ні';
}

/** Returns true if the binary state is the "good"/normal one (sensor not triggered). */
export function binaryIsSafe(_m: MetricType, value: number): boolean {
  return !isBinaryActive(value);
}
