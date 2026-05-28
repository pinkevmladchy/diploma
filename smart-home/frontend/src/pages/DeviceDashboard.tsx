import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { EChartsOption } from 'echarts';
import {
  fetchDevice,
  fetchDeviceTelemetry,
  updateDevice,
  type DeviceDetail,
  type TelemetryPoint,
} from '../api';
import { PageHeader } from '../ui/PageHeader';
import { Breadcrumbs } from '../ui/Breadcrumbs';
import { StatCard } from '../ui/StatCard';
import { DeviceIcon, deviceLabel } from '../ui/devices';
import { extractError } from '../ui/errors';
import { IconButton } from '../ui/IconButton';
import { PowerIcon } from '../ui/icons';
import { EChart } from '../ui/EChart';
import { useTheme } from '../theme/ThemeContext';
import { Pagination, usePagination } from '../ui/Pagination';
import { SearchInput } from '../ui/SearchInput';
import {
  binaryShortLabel,
  binaryStateLabel,
  formatMetricValue,
  isBinaryActive,
  isBinaryMetric,
} from '../ui/metrics';
import { DEFAULT_WINDOW, TIME_WINDOWS, getWindow, type TimeWindowKey } from '../ui/timeWindow';
import { onTelemetry } from '../realtime';
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

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatNumber(n: number): string {
  return n.toFixed(2);
}

function rgb(shade: string): string {
  return `rgb(${shade})`;
}

function rgba(shade: string, alpha: number): string {
  return `rgba(${shade.split(' ').join(', ')}, ${alpha})`;
}

export default function DeviceDashboard() {
  const { id } = useParams<{ id: string }>();
  const deviceId = id ?? '';
  const { brand } = useTheme();

  const [device, setDevice] = useState<DeviceDetail | null>(null);
  const [history, setHistory] = useState<TelemetryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [windowKey, setWindowKey] = useState<TimeWindowKey>(DEFAULT_WINDOW);
  const [aggFn, setAggFn] = useState<AggFn>('avg');
  const [aggInterval, setAggInterval] = useState<AggInterval>(
    autoIntervalForWindow(getWindow(DEFAULT_WINDOW).durationMs),
  );

  function handleWindowChange(key: TimeWindowKey) {
    setWindowKey(key);
    // Auto-pick a sensible interval for the new window so a 30-day chart doesn't
    // try to render 5000 raw points.
    setAggInterval(autoIntervalForWindow(getWindow(key).durationMs));
  }

  const load = useCallback(() => {
    if (!deviceId) return;
    setLoading(true);
    const w = getWindow(windowKey);
    const from = w.durationMs !== null ? new Date(Date.now() - w.durationMs).toISOString() : undefined;
    Promise.all([
      fetchDevice(deviceId),
      fetchDeviceTelemetry(deviceId, { limit: w.limit, from }),
    ])
      .then(([d, h]) => {
        setDevice(d);
        setHistory(h);
        setError(null);
      })
      .catch((e) => setError(extractError(e)))
      .finally(() => setLoading(false));
  }, [deviceId, windowKey]);

  useEffect(() => {
    if (!deviceId) {
      setError('Невірний ідентифікатор');
      setLoading(false);
      return;
    }
    load();
  }, [deviceId, windowKey, load]);

  // Live telemetry — append incoming points to history if they fall inside the current window.
  useEffect(() => {
    if (!deviceId) return;
    const w = getWindow(windowKey);
    const off = onTelemetry((payload) => {
      if (payload.deviceId !== deviceId) return;
      if (payload.points.length === 0) return;
      const cutoff = w.durationMs !== null ? Date.now() - w.durationMs : 0;
      const fresh = payload.points
        .filter((p) => new Date(p.timestamp).getTime() >= cutoff)
        .map((p, idx) => ({
          id: `live-${p.timestamp}-${idx}`,
          metricType: p.metricType,
          value: p.value,
          unit: p.unit,
          timestamp: p.timestamp,
        }));
      if (fresh.length === 0) return;
      setHistory((prev) => {
        // Prepend (history is sorted DESC by timestamp), cap to window's limit.
        const next = [...fresh, ...prev];
        return next.slice(0, w.limit);
      });
      // Reflect the latest reading in the page header / stat cards.
      const last = payload.points[payload.points.length - 1];
      setDevice((d) =>
        d
          ? {
              ...d,
              latestTelemetry: {
                metricType: last.metricType,
                value: last.value,
                unit: last.unit,
                timestamp: last.timestamp,
              },
            }
          : d,
      );
    });
    return off;
  }, [deviceId, windowKey]);

  async function toggleStatus() {
    if (!device) return;
    setBusy(true);
    try {
      await updateDevice(device.id, { status: device.status === 'on' ? 'off' : 'on' });
      load();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  const [search, setSearch] = useState('');

  const filteredHistory = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return history;
    return history.filter(
      (p) =>
        p.metricType.toLowerCase().includes(q) ||
        formatNumber(p.value).includes(q) ||
        formatTime(p.timestamp).toLowerCase().includes(q),
    );
  }, [history, search]);

  const pag = usePagination(filteredHistory, 10);

  const metricType = device?.latestTelemetry?.metricType ?? history[0]?.metricType;
  const unit = device?.latestTelemetry?.unit ?? history[0]?.unit ?? '';
  const binary = metricType ? isBinaryMetric(metricType) : false;

  // For binary metrics only `count` makes mathematical sense — average/min/max
  // of 0/1 values are meaningless to a user. Force it on those.
  const effectiveFn: AggFn = binary ? 'count' : aggFn;
  const intervalMs = getIntervalMs(aggInterval);
  const aggregated = useMemo(
    () => aggregatePoints(history, intervalMs, effectiveFn),
    [history, intervalMs, effectiveFn],
  );
  const chartUnit = intervalMs !== null ? aggregatedUnit(effectiveFn, unit) : unit;
  // When aggregating, the binary 0/1 axis no longer applies — values become
  // counts of events per bucket, which are numeric.
  const chartIsBinary = binary && intervalMs === null;

  const stats = useMemo(() => {
    if (history.length === 0) return null;
    if (binary) {
      const active = history.filter((p) => isBinaryActive(p.value));
      const lastActive = active[0]?.timestamp ?? null; // history sorted desc
      return { kind: 'binary' as const, activeCount: active.length, lastActive };
    }
    const vs = history.map((p) => p.value);
    return {
      kind: 'numeric' as const,
      min: Math.min(...vs),
      max: Math.max(...vs),
      avg: vs.reduce((a, b) => a + b, 0) / vs.length,
    };
  }, [history, binary]);

  const chartOption = useMemo<EChartsOption>(() => {
    const points = aggregated.slice().reverse(); // chronological
    const accent = rgb(brand.shades[600]);
    const accentLight = rgba(brand.shades[400], 0.35);
    const accentLighter = rgba(brand.shades[400], 0);

    const baseTooltip = {
      trigger: 'axis' as const,
      backgroundColor: 'rgba(15,23,42,0.9)',
      borderWidth: 0,
      textStyle: { color: '#fff', fontSize: 12 },
    };
    const baseXAxis = {
      type: 'time' as const,
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisLabel: { color: '#64748b', fontSize: 11, hideOverlap: true },
      splitLine: { show: false },
    };

    if (chartIsBinary && metricType) {
      // Step-line state chart on a 0/1 axis with human-readable labels.
      const seriesData = points.map((p) => [
        new Date(p.timestamp).getTime(),
        isBinaryActive(p.value) ? 1 : 0,
      ]);
      return {
        grid: { left: 80, right: 24, top: 24, bottom: 36 },
        tooltip: {
          ...baseTooltip,
          formatter: (params: unknown) => {
            const p = Array.isArray(params) ? params[0] : params;
            const [t, v] = (p as { value: [number, number] }).value;
            const time = new Date(t).toLocaleString('uk-UA', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });
            return `<div style="font-size:11px;opacity:0.7">${time}</div>
                    <div style="font-weight:600;margin-top:2px">${binaryStateLabel(metricType, v)}</div>`;
          },
        },
        xAxis: baseXAxis,
        yAxis: {
          type: 'value',
          min: 0,
          max: 1,
          interval: 1,
          axisLabel: {
            color: '#64748b',
            fontSize: 11,
            formatter: (v: number) => binaryShortLabel(metricType, v >= 0.5),
          },
          splitLine: { lineStyle: { color: '#f1f5f9' } },
        },
        series: [
          {
            name: 'state',
            type: 'line',
            step: 'end',
            showSymbol: true,
            symbolSize: 6,
            data: seriesData,
            lineStyle: { color: accent, width: 2 },
            itemStyle: { color: accent },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: accentLight },
                  { offset: 1, color: accentLighter },
                ],
              },
            },
            emphasis: { disabled: true },
          },
        ],
      };
    }

    // Numeric metric: smooth line with area
    const seriesData = points.map((p) => [new Date(p.timestamp).getTime(), p.value]);
    return {
      grid: { left: 56, right: 24, top: 24, bottom: 36 },
      tooltip: {
        ...baseTooltip,
        formatter: (params: unknown) => {
          const p = Array.isArray(params) ? params[0] : params;
          const [t, v] = (p as { value: [number, number] }).value;
          const time = new Date(t).toLocaleString('uk-UA', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
          return `<div style="font-size:11px;opacity:0.7">${time}</div>
                  <div style="font-weight:600;margin-top:2px">${formatNumber(v)} <span style="opacity:0.7">${chartUnit}</span></div>`;
        },
      },
      xAxis: baseXAxis,
      yAxis: {
        type: 'value',
        name: chartUnit,
        nameLocation: 'middle',
        nameGap: 40,
        nameTextStyle: { color: '#64748b', fontSize: 11 },
        axisLabel: { color: '#64748b', fontSize: 11 },
        splitLine: { lineStyle: { color: '#f1f5f9' } },
        scale: true,
      },
      series: [
        {
          name: 'value',
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
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: accentLight },
                { offset: 1, color: accentLighter },
              ],
            },
          },
          emphasis: { disabled: true },
        },
      ],
    };
  }, [aggregated, chartUnit, brand, chartIsBinary, metricType]);

  return (
    <div className="p-8">
      <Breadcrumbs
        items={[
          { label: 'Будинки', to: '/houses' },
          {
            label: device?.room.house.name ?? '…',
            to: device ? `/houses/${device.room.house.id}` : undefined,
          },
          {
            label: device?.room.name ?? '…',
            to: device ? `/rooms/${device.room.id}` : undefined,
          },
          { label: device?.name ?? '…' },
        ]}
      />

      {loading && <div className="text-slate-500">Завантаження…</div>}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {device && (
        <>
          <PageHeader
            title={
              <span className="flex items-center gap-3">
                <span
                  className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-brand-50 text-brand-600"
                  aria-hidden
                >
                  <DeviceIcon type={device.type} className="w-5 h-5" />
                </span>
                <span>{device.name}</span>
              </span>
            }
            subtitle={
              <span className="flex items-center gap-3 mt-1">
                <span>{deviceLabel(device.type)}</span>
                <span className="text-slate-400">·</span>
                <span>
                  {device.room.house.name} / {device.room.name}
                </span>
              </span>
            }
            right={
              <div className="flex items-center gap-3">
                <span
                  className={[
                    'text-[10px] uppercase tracking-wide px-2 py-1 rounded-full',
                    device.isOnline
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-500',
                  ].join(' ')}
                >
                  {device.isOnline ? 'online' : 'offline'}
                </span>
                <span
                  className={[
                    'text-[10px] uppercase tracking-wide px-2 py-1 rounded-full',
                    device.status === 'on'
                      ? 'bg-brand-100 text-brand-700'
                      : 'bg-slate-100 text-slate-500',
                  ].join(' ')}
                >
                  {device.status}
                </span>
                <IconButton
                  label={device.status === 'on' ? 'Вимкнути' : 'Увімкнути'}
                  tone="warning"
                  icon={
                    <PowerIcon
                      className={`w-5 h-5 ${device.status === 'on' ? 'text-emerald-600' : ''}`}
                    />
                  }
                  onClick={toggleStatus}
                  disabled={busy}
                />
              </div>
            }
          />

          {/* Stats — different cards for numeric vs binary metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <StatCard
              label={binary ? 'Поточний стан' : 'Поточне значення'}
              value={
                device.latestTelemetry
                  ? formatMetricValue(
                      device.latestTelemetry.metricType,
                      device.latestTelemetry.value,
                      device.latestTelemetry.unit,
                    )
                  : '—'
              }
              hint={
                device.latestTelemetry
                  ? `${device.latestTelemetry.metricType} · ${formatTime(device.latestTelemetry.timestamp)}`
                  : 'немає даних'
              }
            />
            {binary && stats?.kind === 'binary' ? (
              <>
                <StatCard
                  label="Подій усього"
                  value={stats.activeCount}
                  hint={`за ${history.length} вимірів`}
                />
                <StatCard
                  label="Остання подія"
                  value={stats.lastActive ? formatTime(stats.lastActive) : 'не зафіксовано'}
                  hint={stats.activeCount > 0 ? '— спрацьовував' : 'усе спокійно'}
                />
                <StatCard label="Записів" value={history.length} hint="у вибірці" />
              </>
            ) : (
              <>
                <StatCard
                  label="Мінімум"
                  value={stats?.kind === 'numeric' ? `${formatNumber(stats.min)} ${unit}` : '—'}
                  hint={`за ${history.length} точок`}
                />
                <StatCard
                  label="Середнє"
                  value={stats?.kind === 'numeric' ? `${formatNumber(stats.avg)} ${unit}` : '—'}
                  hint={`за ${history.length} точок`}
                />
                <StatCard
                  label="Максимум"
                  value={stats?.kind === 'numeric' ? `${formatNumber(stats.max)} ${unit}` : '—'}
                  hint={`за ${history.length} точок`}
                />
              </>
            )}
          </div>

          {/* Time-window + aggregation pickers — applies to chart; table stays raw */}
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Період:</span>
              <select
                value={windowKey}
                onChange={(e) => handleWindowChange(e.target.value as TimeWindowKey)}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm bg-white"
              >
                {TIME_WINDOWS.map((w) => (
                  <option key={w.key} value={w.key}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>
            <AggregationToolbar
              fn={effectiveFn}
              interval={aggInterval}
              onFnChange={setAggFn}
              onIntervalChange={setAggInterval}
              binary={binary}
            />
          </div>

          {/* Chart + history side by side — both stretch to row's natural height,
              chart fills the remaining space inside its panel, table has no inner scroll. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-lg border border-slate-200 bg-white shadow-sm p-4 flex flex-col">
              <div className="flex items-baseline justify-between mb-2 shrink-0 gap-2">
                <h2 className="text-sm font-semibold text-slate-800">
                  Динаміка значень
                  {intervalMs !== null && (
                    <span className="ml-2 font-normal text-xs text-slate-500">
                      ({aggFnLabel(effectiveFn).toLowerCase()} за {aggInterval})
                    </span>
                  )}
                </h2>
                <span className="text-xs text-slate-500">
                  {history.length > 0
                    ? `${formatTime(history[history.length - 1].timestamp)} — ${formatTime(history[0].timestamp)}`
                    : 'немає даних'}
                </span>
              </div>
              <div className="flex-1 min-h-[300px]">
                {aggregated.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-slate-500">
                    Телеметрія для побудови графіка відсутня
                  </div>
                ) : (
                  <EChart option={chartOption} />
                )}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 justify-between shrink-0">
                <h2 className="text-sm font-semibold text-slate-800 shrink-0">Історія</h2>
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Пошук за метрикою, значенням або часом…"
                  className="max-w-xs flex-1"
                />
              </div>
              <div className="flex-1 min-h-0">
                <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Час</th>
                      <th className="text-left px-4 py-2 font-medium">Метрика</th>
                      <th className="text-right px-4 py-2 font-medium">Значення</th>
                      <th className="text-left px-4 py-2 font-medium w-16">Од.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.length === 0 && (
                      <tr>
                        <td className="px-4 py-6 text-center text-slate-500" colSpan={4}>
                          Телеметрії немає
                        </td>
                      </tr>
                    )}
                    {history.length > 0 && filteredHistory.length === 0 && (
                      <tr>
                        <td className="px-4 py-6 text-center text-slate-500" colSpan={4}>
                          Нічого не знайдено за запитом «{search}».
                        </td>
                      </tr>
                    )}
                    {pag.visible.map((p) => {
                      const isBin = isBinaryMetric(p.metricType);
                      const active = isBin && isBinaryActive(p.value);
                      return (
                        <tr key={p.id} className="border-t border-slate-100">
                          <td className="px-4 py-2 text-slate-600">{formatTime(p.timestamp)}</td>
                          <td className="px-4 py-2 text-slate-600">{p.metricType}</td>
                          <td className="px-4 py-2 text-right font-mono font-medium text-slate-800">
                            {isBin ? (
                              <span
                                className={
                                  active ? 'text-red-600 font-semibold' : 'text-slate-500'
                                }
                              >
                                {binaryStateLabel(p.metricType, p.value)}
                              </span>
                            ) : (
                              formatNumber(p.value)
                            )}
                          </td>
                          <td className="px-4 py-2 text-slate-500">{isBin ? '' : p.unit}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
              </div>
              <Pagination
                page={pag.page}
                totalPages={pag.totalPages}
                start={pag.start}
                end={pag.end}
                total={pag.total}
                onChange={pag.setPage}
              />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
