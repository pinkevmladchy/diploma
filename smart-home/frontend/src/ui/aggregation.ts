import type { TelemetryPoint } from '../api';

export type AggFn = 'avg' | 'sum' | 'min' | 'max' | 'count';
export type AggInterval = 'raw' | '1m' | '5m' | '15m' | '1h' | '6h' | '1d';

export const AGG_FUNCTIONS: { key: AggFn; label: string }[] = [
  { key: 'avg', label: 'Середнє' },
  { key: 'sum', label: 'Сума' },
  { key: 'min', label: 'Мінімум' },
  { key: 'max', label: 'Максимум' },
  { key: 'count', label: 'Кількість' },
];

export const AGG_INTERVALS: { key: AggInterval; label: string; ms: number | null }[] = [
  { key: 'raw', label: 'Без агрегації', ms: null },
  { key: '1m', label: '1 хв', ms: 60_000 },
  { key: '5m', label: '5 хв', ms: 5 * 60_000 },
  { key: '15m', label: '15 хв', ms: 15 * 60_000 },
  { key: '1h', label: '1 год', ms: 60 * 60_000 },
  { key: '6h', label: '6 год', ms: 6 * 60 * 60_000 },
  { key: '1d', label: '1 доба', ms: 24 * 60 * 60_000 },
];

export function getIntervalMs(key: AggInterval): number | null {
  return AGG_INTERVALS.find((i) => i.key === key)?.ms ?? null;
}

export function aggFnLabel(fn: AggFn): string {
  return AGG_FUNCTIONS.find((f) => f.key === fn)?.label ?? fn;
}

export function aggIntervalLabel(key: AggInterval): string {
  return AGG_INTERVALS.find((i) => i.key === key)?.label ?? key;
}

/**
 * Picks a sensible aggregation interval for the given time window so the chart
 * doesn't end up with hundreds of identical buckets. Used to pre-fill the UI
 * when the user changes the time window.
 */
export function autoIntervalForWindow(windowMs: number | null): AggInterval {
  if (windowMs === null) return '1h';
  if (windowMs <= 60 * 60_000) return 'raw';
  if (windowMs <= 6 * 60 * 60_000) return '5m';
  if (windowMs <= 24 * 60 * 60_000) return '15m';
  if (windowMs <= 7 * 24 * 60 * 60_000) return '1h';
  if (windowMs <= 30 * 24 * 60 * 60_000) return '6h';
  return '1d';
}

function reduce(values: number[], fn: AggFn): number {
  switch (fn) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    case 'count':
      return values.length;
  }
}

/**
 * Buckets points by floor(timestamp / intervalMs) and reduces each bucket with
 * the given aggregation function. Returns points sorted DESC by timestamp to
 * match the raw history convention. `raw` interval returns input unchanged.
 */
export function aggregatePoints(
  points: TelemetryPoint[],
  intervalMs: number | null,
  fn: AggFn,
): TelemetryPoint[] {
  if (intervalMs === null || points.length === 0) return points;

  const buckets = new Map<number, number[]>();
  const meta = points[0];
  for (const p of points) {
    const t = new Date(p.timestamp).getTime();
    const key = Math.floor(t / intervalMs) * intervalMs;
    const arr = buckets.get(key) ?? [];
    arr.push(p.value);
    buckets.set(key, arr);
  }

  const result: TelemetryPoint[] = [];
  for (const [bucket, values] of buckets) {
    result.push({
      id: `agg-${bucket}`,
      metricType: meta.metricType,
      value: reduce(values, fn),
      unit: fn === 'count' ? '' : meta.unit,
      timestamp: new Date(bucket).toISOString(),
    });
  }
  result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return result;
}

/**
 * Display unit for an aggregated series. `count` is unitless ("подій"),
 * everything else keeps the original unit.
 */
export function aggregatedUnit(fn: AggFn, baseUnit: string): string {
  if (fn === 'count') return 'подій';
  return baseUnit;
}
