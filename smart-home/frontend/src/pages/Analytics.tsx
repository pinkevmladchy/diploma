import { useEffect, useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import {
  fetchDevices,
  fetchDeviceTelemetry,
  type Device,
  type MetricType,
  type TelemetryPoint,
} from '../api';
import { PageHeader } from '../ui/PageHeader';
import { EChart } from '../ui/EChart';
import { useTheme, type BrandShades } from '../theme/ThemeContext';
import { metricLabel, metricUnit } from '../ui/alerts';
import {
  binaryShortLabel,
  binaryStateLabel,
  formatMetricValue,
  isBinaryActive,
  isBinaryMetric,
} from '../ui/metrics';
import { extractError } from '../ui/errors';
import { AggregationToolbar } from '../ui/AggregationToolbar';
import {
  aggregatePoints,
  aggregatedUnit,
  aggFnLabel,
  autoIntervalForWindow,
  getIntervalMs,
  type AggFn,
  type AggInterval,
} from '../ui/aggregation';

// ---------------------------------------------------------------------------
// Date-range presets
// ---------------------------------------------------------------------------

type RangeKey = '24h' | '7d' | '30d' | 'all';

const RANGES: { key: RangeKey; label: string; ms: number | null }[] = [
  { key: '24h', label: '24 години', ms: 24 * 60 * 60_000 },
  { key: '7d', label: '7 днів', ms: 7 * 24 * 60 * 60_000 },
  { key: '30d', label: '30 днів', ms: 30 * 24 * 60 * 60_000 },
  { key: 'all', label: 'Усі дані', ms: null },
];

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

type DailyBucket = { date: string; value: number };

function reduceValues(values: number[], fn: AggFn): number {
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

function aggregateByDay(points: TelemetryPoint[], fn: AggFn, binary: boolean): DailyBucket[] {
  const map = new Map<string, number[]>();
  for (const p of points) {
    const key = new Date(p.timestamp).toISOString().slice(0, 10);
    const arr = map.get(key) ?? [];
    // For binary metrics, callers should pass fn='count' — but if a non-count fn
    // sneaks in (e.g. user toggles after metric type change) we still treat raw
    // values as 0/1 so the bar shows event-counts.
    arr.push(binary ? (isBinaryActive(p.value) ? 1 : 0) : p.value);
    map.set(key, arr);
  }
  return Array.from(map.entries())
    .map(([date, values]) => ({ date, value: reduceValues(values, fn) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateHeatmap(
  points: TelemetryPoint[],
  binary: boolean,
): { data: [number, number, number][]; max: number } {
  const sum: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const count: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const p of points) {
    const t = new Date(p.timestamp);
    const hour = t.getHours();
    // Convert JS day (Sun=0..Sat=6) → Ukrainian week (Mon=0..Sun=6).
    const dow = (t.getDay() + 6) % 7;
    if (binary) {
      if (isBinaryActive(p.value)) sum[dow][hour] += 1;
    } else {
      sum[dow][hour] += p.value;
      count[dow][hour] += 1;
    }
  }
  const data: [number, number, number][] = [];
  let max = 0;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      let v: number;
      if (binary) {
        v = sum[d][h];
      } else {
        v = count[d][h] > 0 ? sum[d][h] / count[d][h] : 0;
      }
      if (v > max) max = v;
      data.push([h, d, Number(v.toFixed(2))]);
    }
  }
  return { data, max };
}

// ---------------------------------------------------------------------------
// Gauge zones per metric
// ---------------------------------------------------------------------------

type GaugeZones = { min: number; max: number; segments: [number, string][] };

function gaugeZones(metric: MetricType | undefined): GaugeZones | null {
  switch (metric) {
    case 'temperature':
      return {
        min: 0,
        max: 40,
        segments: [
          [0.4, '#3b82f6'], // cold (≤16)
          [0.7, '#10b981'], // normal (≤28)
          [1, '#ef4444'], // hot
        ],
      };
    case 'humidity':
      return {
        min: 0,
        max: 100,
        segments: [
          [0.3, '#f59e0b'], // dry
          [0.7, '#10b981'], // normal
          [1, '#3b82f6'], // wet
        ],
      };
    case 'co2':
      return {
        min: 300,
        max: 2000,
        segments: [
          [0.3, '#10b981'], // good (≤810)
          [0.6, '#f59e0b'], // medium
          [1, '#ef4444'], // bad
        ],
      };
    case 'light_level':
      return {
        min: 0,
        max: 1000,
        segments: [
          [0.2, '#475569'], // dark
          [0.6, '#10b981'], // ok
          [1, '#f59e0b'], // bright
        ],
      };
    case 'power':
      return {
        min: 0,
        max: 3,
        segments: [
          [0.5, '#10b981'],
          [0.8, '#f59e0b'],
          [1, '#ef4444'],
        ],
      };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Chart option builders
// ---------------------------------------------------------------------------

const baseTooltip = {
  backgroundColor: 'rgba(15,23,42,0.9)',
  borderWidth: 0,
  textStyle: { color: '#fff', fontSize: 12 },
};

const baseXAxisTime = {
  type: 'time' as const,
  axisLine: { lineStyle: { color: '#cbd5e1' } },
  axisLabel: { color: '#64748b', fontSize: 11, hideOverlap: true },
  splitLine: { show: false },
};

function rgb(s: string) {
  return `rgb(${s})`;
}
function rgba(s: string, a: number) {
  return `rgba(${s.split(' ').join(', ')}, ${a})`;
}

function buildLineOption(
  points: TelemetryPoint[],
  shades: BrandShades,
  metric: MetricType | undefined,
  binary: boolean,
  unit: string,
): EChartsOption {
  const accent = rgb(shades[600]);
  const areaTop = rgba(shades[400], 0.35);
  const areaBottom = rgba(shades[400], 0);
  const sorted = points.slice().sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  if (binary && metric) {
    const seriesData = sorted.map((p) => [
      new Date(p.timestamp).getTime(),
      isBinaryActive(p.value) ? 1 : 0,
    ]);
    return {
      grid: { left: 80, right: 24, top: 24, bottom: 36 },
      tooltip: {
        ...baseTooltip,
        trigger: 'axis',
        formatter: (params: unknown) => {
          const p = Array.isArray(params) ? params[0] : params;
          const [t, v] = (p as { value: [number, number] }).value;
          const time = new Date(t).toLocaleString('uk-UA');
          return `<div style="font-size:11px;opacity:0.7">${time}</div>
                  <div style="font-weight:600">${binaryStateLabel(metric, v)}</div>`;
        },
      },
      xAxis: baseXAxisTime,
      yAxis: {
        type: 'value',
        min: 0,
        max: 1,
        interval: 1,
        axisLabel: {
          color: '#64748b',
          fontSize: 11,
          formatter: (v: number) => binaryShortLabel(metric, v >= 0.5),
        },
        splitLine: { lineStyle: { color: '#f1f5f9' } },
      },
      series: [
        {
          type: 'line',
          step: 'end',
          showSymbol: false,
          data: seriesData,
          lineStyle: { color: accent, width: 2 },
          itemStyle: { color: accent },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: areaTop },
                { offset: 1, color: areaBottom },
              ],
            },
          },
          emphasis: { disabled: true },
        },
      ],
    };
  }

  const seriesData = sorted.map((p) => [new Date(p.timestamp).getTime(), p.value]);
  return {
    grid: { left: 56, right: 24, top: 24, bottom: 36 },
    tooltip: {
      ...baseTooltip,
      trigger: 'axis',
      formatter: (params: unknown) => {
        const p = Array.isArray(params) ? params[0] : params;
        const [t, v] = (p as { value: [number, number] }).value;
        const time = new Date(t).toLocaleString('uk-UA');
        return `<div style="font-size:11px;opacity:0.7">${time}</div>
                <div style="font-weight:600">${v.toFixed(2)} <span style="opacity:0.7">${unit}</span></div>`;
      },
    },
    xAxis: baseXAxisTime,
    yAxis: {
      type: 'value',
      name: unit,
      nameLocation: 'middle',
      nameGap: 40,
      nameTextStyle: { color: '#64748b', fontSize: 11 },
      axisLabel: { color: '#64748b', fontSize: 11 },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
      scale: true,
    },
    series: [
      {
        type: 'line',
        smooth: true,
        showSymbol: false,
        sampling: 'lttb',
        data: seriesData,
        lineStyle: { color: accent, width: 2 },
        itemStyle: { color: accent },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: areaTop },
              { offset: 1, color: areaBottom },
            ],
          },
        },
        emphasis: { disabled: true },
      },
    ],
  };
}

function buildBarOption(
  points: TelemetryPoint[],
  shades: BrandShades,
  binary: boolean,
  unit: string,
  fn: AggFn,
): EChartsOption {
  const daily = aggregateByDay(points, fn, binary);
  const accent = rgb(shades[600]);
  const valueUnit = fn === 'count' || binary ? 'подій' : unit;
  const valueLabel = `${aggFnLabel(fn)}${valueUnit ? ', ' + valueUnit : ''}`;
  return {
    grid: { left: 48, right: 16, top: 24, bottom: 56 },
    tooltip: {
      ...baseTooltip,
      trigger: 'axis',
      formatter: (params: unknown) => {
        const p = (Array.isArray(params) ? params[0] : params) as { name: string; value: number };
        return `<div style="font-size:11px;opacity:0.7">${p.name}</div>
                <div style="font-weight:600">${valueLabel}: ${p.value.toFixed(2)}</div>`;
      },
    },
    xAxis: {
      type: 'category',
      data: daily.map((d) => d.date.slice(5)), // MM-DD only
      axisLabel: { color: '#64748b', fontSize: 11, rotate: 35, hideOverlap: true },
      axisLine: { lineStyle: { color: '#cbd5e1' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#64748b', fontSize: 11 },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
    },
    series: [
      {
        type: 'bar',
        data: daily.map((d) => Number(d.value.toFixed(2))),
        itemStyle: { color: accent, borderRadius: [3, 3, 0, 0] },
        emphasis: { disabled: true },
      },
    ],
  };
}

function buildHeatmapOption(
  points: TelemetryPoint[],
  shades: BrandShades,
  binary: boolean,
): EChartsOption {
  const { data, max } = aggregateHeatmap(points, binary);
  return {
    grid: { left: 50, right: 60, top: 20, bottom: 40 },
    tooltip: {
      ...baseTooltip,
      formatter: (params: unknown) => {
        const p = params as { value: [number, number, number] };
        const [h, d, v] = p.value;
        const label = binary
          ? `Подій: ${v}`
          : `Середнє: ${v.toFixed(2)}`;
        return `<div style="font-size:11px;opacity:0.7">${WEEKDAYS[d]}, ${String(h).padStart(2, '0')}:00</div>
                <div style="font-weight:600">${label}</div>`;
      },
    },
    xAxis: {
      type: 'category',
      data: Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')),
      axisLabel: { color: '#64748b', fontSize: 10 },
      axisLine: { show: false },
      splitArea: { show: true },
    },
    yAxis: {
      type: 'category',
      data: WEEKDAYS,
      axisLabel: { color: '#64748b', fontSize: 11 },
      axisLine: { show: false },
      splitArea: { show: true },
    },
    visualMap: {
      min: 0,
      max: Math.max(max, 1),
      calculable: false,
      orient: 'vertical',
      right: 0,
      top: 'center',
      itemHeight: 100,
      textStyle: { color: '#64748b', fontSize: 10 },
      inRange: { color: ['#f1f5f9', rgb(shades[400]), rgb(shades[700])] },
    },
    series: [
      {
        type: 'heatmap',
        data,
        emphasis: { disabled: true },
        itemStyle: { borderColor: '#fff', borderWidth: 1 },
      },
    ],
  };
}

function buildGaugeOption(
  latest: number | null,
  metric: MetricType | undefined,
  unit: string,
  shades: BrandShades,
): EChartsOption | null {
  const zones = gaugeZones(metric);
  if (!zones || latest === null) return null;
  const accent = rgb(shades[600]);
  return {
    series: [
      {
        type: 'gauge',
        min: zones.min,
        max: zones.max,
        progress: { show: false },
        axisLine: {
          lineStyle: { width: 18, color: zones.segments },
        },
        axisTick: { distance: -22, length: 6, lineStyle: { color: '#cbd5e1', width: 1 } },
        splitLine: { distance: -28, length: 10, lineStyle: { color: '#94a3b8', width: 2 } },
        axisLabel: { distance: -16, fontSize: 10, color: '#64748b' },
        pointer: { width: 4, length: '65%', itemStyle: { color: accent } },
        anchor: { show: true, showAbove: true, size: 12, itemStyle: { color: accent } },
        title: { show: false },
        detail: {
          valueAnimation: true,
          offsetCenter: [0, '70%'],
          fontSize: 24,
          fontWeight: 700,
          color: '#0f172a',
          formatter: (v: number) => `${v.toFixed(1)}${unit ? ' ' + unit : ''}`,
        },
        data: [{ value: latest }],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Analytics() {
  const { brand } = useTheme();
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [rangeKey, setRangeKey] = useState<RangeKey>('7d');
  const [history, setHistory] = useState<TelemetryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aggFn, setAggFn] = useState<AggFn>('avg');
  const [aggInterval, setAggInterval] = useState<AggInterval>(
    autoIntervalForWindow(RANGES.find((r) => r.key === '7d')!.ms),
  );

  function handleRangeChange(key: RangeKey) {
    setRangeKey(key);
    const range = RANGES.find((r) => r.key === key)!;
    setAggInterval(autoIntervalForWindow(range.ms));
  }

  useEffect(() => {
    fetchDevices()
      .then((ds) => {
        setDevices(ds);
        if (ds.length > 0) setSelectedDeviceId(ds[0].id);
        else setLoading(false);
      })
      .catch((e) => {
        setError(extractError(e));
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedDeviceId) {
      setHistory([]);
      setLoading(false);
      return;
    }
    const range = RANGES.find((r) => r.key === rangeKey)!;
    const from = range.ms ? new Date(Date.now() - range.ms).toISOString() : undefined;
    setLoading(true);
    fetchDeviceTelemetry(selectedDeviceId, { from, limit: 5000 })
      .then((h) => {
        setHistory(h);
        setError(null);
      })
      .catch((e) => setError(extractError(e)))
      .finally(() => setLoading(false));
  }, [selectedDeviceId, rangeKey]);

  const selectedDevice = useMemo(
    () => devices.find((d) => d.id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  );

  const metric: MetricType | undefined =
    selectedDevice?.latestTelemetry?.metricType ?? history[0]?.metricType;
  const unit = selectedDevice?.latestTelemetry?.unit ?? history[0]?.unit ?? '';
  const binary = metric ? isBinaryMetric(metric) : false;

  const latestValue = selectedDevice?.latestTelemetry?.value ?? null;

  const effectiveFn: AggFn = binary ? 'count' : aggFn;
  const intervalMs = getIntervalMs(aggInterval);
  const aggregatedLine = useMemo(
    () => aggregatePoints(history, intervalMs, effectiveFn),
    [history, intervalMs, effectiveFn],
  );
  // When aggregating binary metrics the y-axis is no longer 0/1 — it becomes a
  // count of events per bucket and should render as a numeric line.
  const lineIsBinary = binary && intervalMs === null;
  const lineUnit = intervalMs !== null ? aggregatedUnit(effectiveFn, unit) : unit;

  const lineOption = useMemo(
    () => buildLineOption(aggregatedLine, brand.shades, metric, lineIsBinary, lineUnit),
    [aggregatedLine, brand.shades, metric, lineIsBinary, lineUnit],
  );
  const barOption = useMemo(
    () => buildBarOption(history, brand.shades, binary, unit, effectiveFn),
    [history, brand.shades, binary, unit, effectiveFn],
  );
  const heatmapOption = useMemo(
    () => buildHeatmapOption(history, brand.shades, binary),
    [history, brand.shades, binary],
  );
  const gaugeOption = useMemo(
    () => buildGaugeOption(latestValue, metric, unit, brand.shades),
    [latestValue, metric, unit, brand.shades],
  );

  return (
    <div className="p-8 md:h-full md:flex md:flex-col">
      <PageHeader subtitle="Глибокий аналіз телеметрії за довгий період" />

      {/* Filters */}
      <div className="shrink-0 mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <label className="text-sm">
          <span className="block text-xs text-slate-500 mb-1">Пристрій</span>
          <select
            value={selectedDeviceId ?? ''}
            onChange={(e) => setSelectedDeviceId(e.target.value || null)}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm min-w-[220px]"
          >
            {devices.length === 0 && <option value="">Немає пристроїв</option>}
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {d.room.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs text-slate-500 mb-1">Метрика</span>
          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 min-w-[160px]">
            {metric ? `${metricLabel(metric)}${metricUnit(metric) ? ' (' + metricUnit(metric) + ')' : ''}` : '—'}
          </div>
        </label>
        <label className="text-sm">
          <span className="block text-xs text-slate-500 mb-1">Період</span>
          <select
            value={rangeKey}
            onChange={(e) => handleRangeChange(e.target.value as RangeKey)}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {RANGES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <div className="self-end pb-1">
          <AggregationToolbar
            fn={effectiveFn}
            interval={aggInterval}
            onFnChange={setAggFn}
            onIntervalChange={setAggInterval}
            binary={binary}
          />
        </div>
        <div className="text-sm text-slate-500 self-end pb-2 ml-auto">
          {loading ? 'Завантаження…' : `${history.length} записів`}
        </div>
      </div>

      {error && (
        <div className="shrink-0 mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {devices.length === 0 && !loading ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500 md:flex-1 md:flex md:items-center md:justify-center">
          У вас ще немає пристроїв.
        </div>
      ) : (
        <div className="flex flex-col gap-6 md:flex-1 md:min-h-0">
          {/* Main line/state chart */}
          <section className="h-[360px] md:h-auto md:flex-1 md:min-h-0 rounded-lg border border-slate-200 bg-white shadow-sm p-4 flex flex-col">
            <h2 className="shrink-0 text-sm font-semibold text-slate-800 mb-2">
              Динаміка значень
              {intervalMs !== null && (
                <span className="ml-2 font-normal text-xs text-slate-500">
                  ({aggFnLabel(effectiveFn).toLowerCase()} за {aggInterval})
                </span>
              )}
            </h2>
            <div className="flex-1 min-h-0">
              {aggregatedLine.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-slate-500">
                  Даних за обраний період немає
                </div>
              ) : (
                <EChart option={lineOption} />
              )}
            </div>
          </section>

          {/* Three-up: gauge | bar | heatmap */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:flex-1 md:min-h-0">
            <section className="h-[300px] lg:h-auto lg:min-h-0 rounded-lg border border-slate-200 bg-white shadow-sm p-4 flex flex-col">
              <h2 className="shrink-0 text-sm font-semibold text-slate-800 mb-2">Поточне значення</h2>
              <div className="flex-1 min-h-0">
                {binary || !gaugeOption ? (
                  <BinaryGaugeFallback
                    metric={metric}
                    value={latestValue}
                    unit={unit}
                  />
                ) : (
                  <EChart option={gaugeOption} />
                )}
              </div>
            </section>

            <section className="h-[300px] lg:h-auto lg:min-h-0 rounded-lg border border-slate-200 bg-white shadow-sm p-4 flex flex-col">
              <h2 className="shrink-0 text-sm font-semibold text-slate-800 mb-2">
                {`${aggFnLabel(effectiveFn)} по днях`}
              </h2>
              <div className="flex-1 min-h-0">
                {history.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <EChart option={barOption} />
                )}
              </div>
            </section>

            <section className="h-[320px] lg:h-auto lg:min-h-0 rounded-lg border border-slate-200 bg-white shadow-sm p-4 flex flex-col">
              <h2 className="shrink-0 text-sm font-semibold text-slate-800 mb-2">
                Активність (години × дні)
              </h2>
              <div className="flex-1 min-h-0">
                {history.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <EChart option={heatmapOption} />
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-full flex items-center justify-center text-sm text-slate-500">
      Даних за обраний період немає
    </div>
  );
}

function BinaryGaugeFallback({
  metric,
  value,
  unit,
}: {
  metric: MetricType | undefined;
  value: number | null;
  unit: string;
}) {
  if (value === null || !metric) return <EmptyChart />;
  const active = isBinaryActive(value);
  const label = isBinaryMetric(metric) ? binaryStateLabel(metric, value) : formatMetricValue(metric, value, unit);
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3">
      <span
        className={`inline-flex w-24 h-24 rounded-full items-center justify-center text-3xl ${
          active ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
        }`}
      >
        {active ? '⚠' : '✓'}
      </span>
      <div className="text-xl font-semibold text-slate-800">{label}</div>
      <div className="text-xs text-slate-500">{metricLabel(metric)}</div>
    </div>
  );
}
