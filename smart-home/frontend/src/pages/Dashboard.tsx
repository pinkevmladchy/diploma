import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  clearAlertEvent,
  fetchActiveAlerts,
  fetchDevices,
  fetchHouses,
  fetchRooms,
  type ActiveAlert,
  type Device,
  type House,
  type Room,
} from '../api';
import { extractError } from '../ui/errors';
import { PageHeader } from '../ui/PageHeader';
import { StatCard } from '../ui/StatCard';
import { DeviceIcon, deviceLabel } from '../ui/devices';
import { metricLabel } from '../ui/alerts';
import { formatMetricValue, isBinaryMetric } from '../ui/metrics';

function formatValue(d: Device): string {
  if (!d.latestTelemetry) return '—';
  return formatMetricValue(
    d.latestTelemetry.metricType,
    d.latestTelemetry.value,
    d.latestTelemetry.unit,
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Dashboard() {
  const [houses, setHouses] = useState<House[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [alerts, setAlerts] = useState<ActiveAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState<Set<number>>(new Set());

  async function onClear(eventId: number) {
    setClearing((prev) => new Set(prev).add(eventId));
    try {
      await clearAlertEvent(eventId);
      setAlerts((prev) => prev.filter((a) => a.id !== eventId));
    } catch (e) {
      setError(extractError(e));
    } finally {
      setClearing((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchHouses(), fetchRooms(), fetchDevices(), fetchActiveAlerts()])
      .then(([h, r, d, a]) => {
        if (cancelled) return;
        setHouses(h);
        setRooms(r);
        setDevices(d);
        setAlerts(a);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message ?? 'Не вдалося завантажити дані');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onlineDevices = devices.filter((d) => d.isOnline).length;

  return (
    <div className="p-8">
      <PageHeader subtitle="Огляд стану всіх будинків та активних подій" />

      {loading && <div className="text-slate-500">Завантаження…</div>}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <StatCard label="Будинки" value={houses.length} />
            <StatCard label="Кімнати" value={rooms.length} />
            <StatCard
              label="Пристрої"
              value={devices.length}
              hint={`${onlineDevices} online`}
            />
            <StatCard
              label="Активні алерти"
              value={alerts.length}
              hint={alerts.length > 0 ? 'Потребують уваги' : 'Все спокійно'}
            />
          </div>

          {/* Active alerts banner */}
          {alerts.length > 0 && (
            <section className="mb-6">
              <div className="rounded-lg border border-red-200 bg-red-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-red-200 bg-red-100/60 flex items-center gap-2">
                  <span aria-hidden className="text-red-600 text-lg">
                    ⚠
                  </span>
                  <h2 className="font-semibold text-red-800">
                    Активні алерти ({alerts.length})
                  </h2>
                </div>
                <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
                  <thead className="bg-red-50 text-red-800/80">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Правило</th>
                      <th className="text-left px-4 py-2 font-medium">Пристрій</th>
                      <th className="text-left px-4 py-2 font-medium">Розташування</th>
                      <th className="text-left px-4 py-2 font-medium">Поточне значення</th>
                      <th className="text-left px-4 py-2 font-medium">Час</th>
                      <th className="px-2 py-2 w-px whitespace-nowrap"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((a) => (
                      <tr key={a.id} className="border-t border-red-100">
                        <td className="px-4 py-2 text-slate-800">
                          <div className="font-medium">
                            {a.alertName ?? metricLabel(a.metricType)}
                          </div>
                          <div className="text-xs text-slate-500 font-mono">
                            {metricLabel(a.metricType)} {a.conditionSymbol} {a.thresholdValue}{' '}
                            {a.unit}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <Link
                            to={`/devices/${a.device.id}`}
                            className="text-slate-800 hover:text-brand-600 font-medium"
                          >
                            {a.device.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-slate-600">
                          <Link
                            to={`/houses/${a.house.id}`}
                            className="hover:text-brand-600"
                          >
                            {a.house.name}
                          </Link>
                          {' / '}
                          <Link
                            to={`/rooms/${a.room.id}`}
                            className="hover:text-brand-600"
                          >
                            {a.room.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-red-700 font-mono font-semibold">
                          {isBinaryMetric(a.metricType)
                            ? formatMetricValue(a.metricType, a.latestValue, a.unit)
                            : `${a.latestValue.toFixed(2)} ${a.unit}`}
                        </td>
                        <td className="px-4 py-2 text-slate-500 text-xs">
                          {formatTime(a.lastSeenAt)}
                        </td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">
                          <button
                            onClick={() => onClear(a.id)}
                            disabled={clearing.has(a.id)}
                            className="rounded border border-red-300 bg-white hover:bg-red-50 disabled:opacity-50 px-3 py-1 text-xs font-medium text-red-700"
                            title="Перенести в історію"
                          >
                            {clearing.has(a.id) ? '…' : 'Зняти'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            </section>
          )}

          {/* Empty state */}
          {houses.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
              <div className="text-3xl mb-2" aria-hidden>
                🏠
              </div>
              <h2 className="text-lg font-semibold text-slate-800">У вас ще немає будинків</h2>
              <p className="mt-1 text-sm text-slate-500">
                Створіть будинок на сторінці{' '}
                <Link to="/houses" className="font-medium text-brand-600 hover:text-brand-700">
                  Будинки
                </Link>
                , додайте кімнати та пристрої.
              </p>
            </div>
          )}

          {/* Houses overview */}
          <div className="space-y-6">
            {houses.map((house) => {
              const houseRooms = rooms.filter((r) => r.house.id === house.id);
              const houseDeviceIds = new Set(
                devices.filter((d) => d.room.house.id === house.id).map((d) => d.id),
              );
              const houseAlerts = alerts.filter((a) => a.house.id === house.id);
              return (
                <section key={house.id}>
                  <div className="mb-3 flex items-baseline justify-between">
                    <div>
                      <Link
                        to={`/houses/${house.id}`}
                        className="text-lg font-semibold text-slate-800 hover:text-brand-600"
                      >
                        {house.name}
                      </Link>
                      <span className="ml-2 text-xs text-slate-500">
                        {house.address ?? 'без адреси'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 space-x-4">
                      <span>{houseRooms.length} кімнат</span>
                      <span>{houseDeviceIds.size} пристроїв</span>
                      {houseAlerts.length > 0 && (
                        <span className="text-red-600 font-medium">
                          ⚠ {houseAlerts.length} алерт
                        </span>
                      )}
                    </div>
                  </div>

                  {houseRooms.length === 0 ? (
                    <div className="rounded border border-dashed border-slate-300 bg-white p-4 text-sm text-center text-slate-500">
                      У цьому будинку поки немає кімнат
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {houseRooms.map((room) => {
                        const roomDevices = devices.filter((d) => d.room.id === room.id);
                        const roomAlertSet = new Set(
                          houseAlerts.filter((a) => a.room.id === room.id).map((a) => a.device.id),
                        );
                        return (
                          <Link
                            key={room.id}
                            to={`/rooms/${room.id}`}
                            className="block rounded-lg border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-brand-400 transition overflow-hidden"
                          >
                            <div className="p-4 border-b border-slate-100">
                              <div className="font-medium text-slate-800">{room.name}</div>
                              <div className="text-xs text-slate-500">
                                {roomDevices.length} пристроїв
                                {roomAlertSet.size > 0 && (
                                  <span className="ml-2 text-red-600 font-medium">
                                    ⚠ {roomAlertSet.size}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="p-2">
                              {roomDevices.length === 0 && (
                                <div className="text-xs text-slate-400 italic px-2 py-1">
                                  немає пристроїв
                                </div>
                              )}
                              {roomDevices.slice(0, 4).map((d) => {
                                const breached = roomAlertSet.has(d.id);
                                return (
                                  <div
                                    key={d.id}
                                    className={`flex items-center justify-between px-2 py-1.5 rounded text-sm ${
                                      breached ? 'bg-red-50' : ''
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <DeviceIcon
                                        type={d.type}
                                        className="w-4 h-4 text-slate-500 shrink-0"
                                        aria-hidden
                                      />
                                      <span
                                        className="truncate text-slate-700"
                                        title={`${d.name} — ${deviceLabel(d.type)}`}
                                      >
                                        {d.name}
                                      </span>
                                    </div>
                                    <span
                                      className={`font-mono text-xs shrink-0 ml-2 ${
                                        breached ? 'text-red-700 font-semibold' : 'text-slate-600'
                                      }`}
                                    >
                                      {formatValue(d)}
                                    </span>
                                  </div>
                                );
                              })}
                              {roomDevices.length > 4 && (
                                <div className="px-2 pt-1 text-xs text-slate-500">
                                  +{roomDevices.length - 4} ще…
                                </div>
                              )}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
