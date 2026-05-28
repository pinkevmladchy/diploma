import type { AlertCondition, MetricType } from '../api';

export const CONDITION_OPTIONS: { value: AlertCondition; label: string; symbol: string }[] = [
  { value: 'gt', label: 'Більше ніж', symbol: '>' },
  { value: 'gte', label: 'Більше або дорівнює', symbol: '≥' },
  { value: 'lt', label: 'Менше ніж', symbol: '<' },
  { value: 'lte', label: 'Менше або дорівнює', symbol: '≤' },
  { value: 'eq', label: 'Дорівнює', symbol: '=' },
];

export const METRIC_OPTIONS: { value: MetricType; label: string; unit: string }[] = [
  { value: 'temperature', label: 'Температура', unit: '°C' },
  { value: 'humidity', label: 'Вологість', unit: '%' },
  { value: 'power', label: 'Споживання', unit: 'kWh' },
  { value: 'motion', label: 'Рух', unit: 'event' },
  { value: 'co2', label: 'CO₂', unit: 'ppm' },
  { value: 'light_level', label: 'Освітленість', unit: 'lx' },
  { value: 'water_leak', label: 'Протікання', unit: 'event' },
];

const condMap = Object.fromEntries(CONDITION_OPTIONS.map((c) => [c.value, c]));
const metricMap = Object.fromEntries(METRIC_OPTIONS.map((m) => [m.value, m]));

export function conditionSymbol(c: AlertCondition): string {
  return condMap[c]?.symbol ?? c;
}

export function metricLabel(m: MetricType): string {
  return metricMap[m]?.label ?? m;
}

export function metricUnit(m: MetricType): string {
  return metricMap[m]?.unit ?? '';
}
