import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchDevices,
  fetchTelemetryLog,
  type Device,
  type MetricType,
  type TelemetryLogEntry,
} from '../api';
import { PageHeader } from '../ui/PageHeader';
import { Pagination, usePagination } from '../ui/Pagination';
import { SearchInput } from '../ui/SearchInput';
import { METRIC_OPTIONS, metricLabel } from '../ui/alerts';
import { DeviceIcon } from '../ui/devices';
import { formatMetricValue, isBinaryActive, isBinaryMetric } from '../ui/metrics';
import { extractError } from '../ui/errors';
import { DEFAULT_WINDOW, TIME_WINDOWS, getWindow, type TimeWindowKey } from '../ui/timeWindow';
import { onTelemetry } from '../realtime';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatValue(metric: MetricType, value: number, unit: string): string {
  if (isBinaryMetric(metric)) return formatMetricValue(metric, value, unit);
  return `${value.toFixed(2)} ${unit}`.trim();
}

export default function TelemetryLog() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [entries, setEntries] = useState<TelemetryLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deviceId, setDeviceId] = useState<string>('');
  const [metric, setMetric] = useState<MetricType | ''>('');
  const [windowKey, setWindowKey] = useState<TimeWindowKey>(DEFAULT_WINDOW);
  const [search, setSearch] = useState('');
  const [autoUpdate, setAutoUpdate] = useState(true);

  // Initial device list for the filter dropdown.
  useEffect(() => {
    fetchDevices()
      .then(setDevices)
      .catch((e) => setError(extractError(e)));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const w = getWindow(windowKey);
    const from = w.durationMs !== null ? new Date(Date.now() - w.durationMs).toISOString() : undefined;
    fetchTelemetryLog({
      ...(deviceId ? { deviceId } : {}),
      ...(metric ? { metricType: metric } : {}),
      ...(from ? { from } : {}),
      limit: 1000,
    })
      .then((rows) => {
        setEntries(rows);
        setError(null);
      })
      .catch((e) => setError(extractError(e)))
      .finally(() => setLoading(false));
  }, [deviceId, metric, windowKey]);

  useEffect(() => {
    load();
  }, [load]);

  // Live append — but only when no specific filters (other than window) would
  // make us miss context; if device/metric filters are set, still filter live
  // events accordingly so the table stays consistent with the dropdowns.
  useEffect(() => {
    if (!autoUpdate) return;
    return onTelemetry((payload) => {
      const dev = devices.find((d) => d.id === payload.deviceId);
      if (!dev) return;
      if (deviceId && deviceId !== payload.deviceId) return;
      const w = getWindow(windowKey);
      const cutoff = w.durationMs !== null ? Date.now() - w.durationMs : 0;
      const fresh: TelemetryLogEntry[] = payload.points
        .filter((p) => (!metric || p.metricType === metric) && new Date(p.timestamp).getTime() >= cutoff)
        .map((p, idx) => ({
          id: `live-${payload.deviceId}-${p.timestamp}-${idx}`,
          metricType: p.metricType,
          value: p.value,
          unit: p.unit,
          timestamp: p.timestamp,
          device: {
            id: dev.id,
            name: dev.name,
            type: dev.type,
            room: dev.room,
          },
        }));
      if (fresh.length === 0) return;
      setEntries((prev) => [...fresh, ...prev].slice(0, 1000));
    });
  }, [autoUpdate, devices, deviceId, metric, windowKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      return (
        e.device.name.toLowerCase().includes(q) ||
        e.device.room.name.toLowerCase().includes(q) ||
        e.device.room.house.name.toLowerCase().includes(q) ||
        e.metricType.toLowerCase().includes(q) ||
        metricLabel(e.metricType).toLowerCase().includes(q) ||
        formatValue(e.metricType, e.value, e.unit).toLowerCase().includes(q)
      );
    });
  }, [entries, search]);

  const pag = usePagination(filtered, 25);

  function resetFilters() {
    setDeviceId('');
    setMetric('');
    setWindowKey(DEFAULT_WINDOW);
    setSearch('');
  }

  const hasFilters = deviceId !== '' || metric !== '' || windowKey !== DEFAULT_WINDOW || search !== '';

  return (
    <div className="p-8">
      <PageHeader subtitle="Стрічка телеметрії від усіх ваших пристроїв" />

      {/* Filter bar */}
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <label className="text-sm">
          <span className="block text-xs text-slate-500 mb-1">Пристрій</span>
          <select
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm min-w-[200px]"
          >
            <option value="">Всі пристрої</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {d.room.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="block text-xs text-slate-500 mb-1">Метрика</span>
          <select
            value={metric}
            onChange={(e) => setMetric((e.target.value || '') as MetricType | '')}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm min-w-[160px]"
          >
            <option value="">Усі метрики</option>
            {METRIC_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
                {m.unit && ` (${m.unit})`}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="block text-xs text-slate-500 mb-1">Період</span>
          <select
            value={windowKey}
            onChange={(e) => setWindowKey(e.target.value as TimeWindowKey)}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {TIME_WINDOWS.map((w) => (
              <option key={w.key} value={w.key}>
                {w.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm flex items-center gap-2 pb-1.5 self-end">
          <input
            type="checkbox"
            checked={autoUpdate}
            onChange={(e) => setAutoUpdate(e.target.checked)}
            className="rounded border-slate-300"
          />
          <span className="text-xs text-slate-600">Авто-оновлення</span>
        </label>

        {hasFilters && (
          <button
            onClick={resetFilters}
            className="self-end pb-2 text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2"
          >
            скинути фільтри
          </button>
        )}

        <div className="ml-auto self-end pb-2 text-sm text-slate-500">
          {loading ? 'Завантаження…' : `${entries.length} записів`}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Пошук за пристроєм, локацією або значенням…"
            className="max-w-sm"
          />
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium w-44">Час</th>
              <th className="text-left px-4 py-2 font-medium">Пристрій</th>
              <th className="text-left px-4 py-2 font-medium">Розташування</th>
              <th className="text-left px-4 py-2 font-medium">Метрика</th>
              <th className="text-right px-4 py-2 font-medium">Значення</th>
            </tr>
          </thead>
          <tbody>
            {loading && entries.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                  Завантаження…
                </td>
              </tr>
            )}
            {!loading && entries.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                  За обраними фільтрами немає записів.
                </td>
              </tr>
            )}
            {!loading && entries.length > 0 && filtered.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                  Нічого не знайдено за запитом «{search}».
                </td>
              </tr>
            )}
            {pag.visible.map((e) => {
              const isBin = isBinaryMetric(e.metricType);
              const active = isBin && isBinaryActive(e.value);
              return (
                <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-2 text-slate-600 font-mono text-xs whitespace-nowrap">
                    {formatTime(e.timestamp)}
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      to={`/devices/${e.device.id}`}
                      className="inline-flex items-center gap-2 text-slate-800 hover:text-brand-600 font-medium"
                    >
                      <DeviceIcon
                        type={e.device.type}
                        className="w-4 h-4 text-slate-500 shrink-0"
                        aria-hidden
                      />
                      <span>{e.device.name}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600 text-xs">
                    <Link
                      to={`/houses/${e.device.room.house.id}`}
                      className="hover:text-brand-600"
                    >
                      {e.device.room.house.name}
                    </Link>
                    {' / '}
                    <Link
                      to={`/rooms/${e.device.room.id}`}
                      className="hover:text-brand-600"
                    >
                      {e.device.room.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{metricLabel(e.metricType)}</td>
                  <td
                    className={[
                      'px-4 py-2 text-right font-mono font-medium whitespace-nowrap',
                      isBin
                        ? active
                          ? 'text-red-600 font-semibold'
                          : 'text-slate-500'
                        : 'text-slate-800',
                    ].join(' ')}
                  >
                    {formatValue(e.metricType, e.value, e.unit)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
        <Pagination
          page={pag.page}
          totalPages={pag.totalPages}
          start={pag.start}
          end={pag.end}
          total={pag.total}
          onChange={pag.setPage}
        />
      </div>
    </div>
  );
}
