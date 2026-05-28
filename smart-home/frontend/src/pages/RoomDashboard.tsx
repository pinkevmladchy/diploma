import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchRoom, fetchRooms, updateDevice, type Room, type RoomDetail } from '../api';
import { PageHeader } from '../ui/PageHeader';
import { Breadcrumbs } from '../ui/Breadcrumbs';
import { StatCard } from '../ui/StatCard';
import { DeviceIcon, deviceLabel } from '../ui/devices';
import { extractError } from '../ui/errors';
import { formatMetricValue } from '../ui/metrics';
import { Floorplan, type FloorplanDevice } from '../ui/Floorplan';
import { RoomFormModal } from '../components/RoomFormModal';
import { IconButton } from '../ui/IconButton';
import { PencilIcon } from '../ui/icons';

function formatValue(d: RoomDetail['devices'][number]): string {
  if (!d.latestTelemetry) return '—';
  return formatMetricValue(
    d.latestTelemetry.metricType,
    d.latestTelemetry.value,
    d.latestTelemetry.unit,
  );
}

export default function RoomDashboard() {
  const { id } = useParams<{ id: string }>();
  const roomId = Number(id);

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

  function load() {
    setLoading(true);
    fetchRoom(roomId)
      .then((r) => {
        setRoom(r);
        setError(null);
      })
      .catch((e) => setError(extractError(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!Number.isInteger(roomId)) {
      setError('Невірний ідентифікатор кімнати');
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  async function moveDevice(deviceId: string, x: number, y: number) {
    if (!room) return;
    setRoom({
      ...room,
      devices: room.devices.map((d) =>
        d.id === deviceId ? { ...d, floorplanX: x, floorplanY: y } : d,
      ),
    });
    try {
      await updateDevice(deviceId, { floorplanX: x, floorplanY: y });
    } catch (err) {
      setError(extractError(err));
      load();
    }
  }

  async function removeDeviceFromPlan(deviceId: string) {
    if (!room) return;
    setRoom({
      ...room,
      devices: room.devices.map((d) =>
        d.id === deviceId ? { ...d, floorplanX: null, floorplanY: null } : d,
      ),
    });
    try {
      await updateDevice(deviceId, { floorplanX: null, floorplanY: null });
    } catch (err) {
      setError(extractError(err));
      load();
    }
  }

  async function openEdit() {
    if (!room) return;
    // RoomFormModal expects a Room (from the list endpoint). Fetch the list and find ours
    // so that fields like deviceCount/floorplanUrl arrive in the expected shape.
    try {
      const rooms = await fetchRooms({ houseId: room.house.id });
      const found = rooms.find((r) => r.id === room.id);
      if (found) setEditingRoom(found);
    } catch (err) {
      setError(extractError(err));
    }
  }

  const onlineCount = room?.devices.filter((d) => d.isOnline).length ?? 0;
  const onCount = room?.devices.filter((d) => d.status === 'on').length ?? 0;
  const floorplanDevices: FloorplanDevice[] =
    room?.devices.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      floorplanX: d.floorplanX,
      floorplanY: d.floorplanY,
    })) ?? [];

  return (
    <div className="p-8 md:h-full md:flex md:flex-col">
      <Breadcrumbs
        items={[
          { label: 'Будинки', to: '/houses' },
          { label: room?.house.name ?? '…', to: room ? `/houses/${room.house.id}` : undefined },
          { label: room?.name ?? '…' },
        ]}
      />

      {loading && <div className="text-slate-500">Завантаження…</div>}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {room && (
        <>
          <PageHeader
            title={room.name}
            subtitle={room.description ?? 'Опис не вказано'}
            right={
              <IconButton
                label="Редагувати кімнату"
                tone="primary"
                icon={<PencilIcon className="w-4 h-4" />}
                onClick={openEdit}
              />
            }
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6 shrink-0">
            <StatCard label="Пристроїв" value={room.devices.length} />
            <StatCard label="Активних (on)" value={onCount} hint={`${room.devices.length} разом`} />
            <StatCard label="Online" value={onlineCount} hint={`${room.devices.length} разом`} />
          </div>

          {/* On md+ the two panels split the remaining viewport height 50/50. On
              mobile they each get an explicit height so the page scrolls naturally. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:flex-1 md:min-h-0">
            {/* Devices list */}
            <section className="h-[420px] lg:h-auto rounded-lg border border-slate-200 bg-white shadow-sm flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h2 className="text-sm font-semibold text-slate-800">Пристрої</h2>
                <span className="text-xs text-slate-500">{room.devices.length}</span>
              </div>
              {room.devices.length === 0 ? (
                <div className="flex-1 p-4 text-sm text-slate-500 text-center flex items-center justify-center">
                  Пристроїв немає.{' '}
                  <Link
                    to="/devices"
                    className="ml-1 text-brand-600 hover:text-brand-700 font-medium"
                  >
                    Додати
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 flex-1 overflow-y-auto">
                  {room.devices.map((d) => (
                    <li key={d.id}>
                      <Link
                        to={`/devices/${d.id}`}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors"
                      >
                        <span
                          className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-brand-50 text-brand-600 shrink-0"
                          aria-hidden
                        >
                          <DeviceIcon type={d.type} className="w-4 h-4" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">
                            {d.name}
                          </div>
                          <div className="text-[11px] text-slate-500">{deviceLabel(d.type)}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-semibold text-slate-800 leading-tight font-mono">
                            {formatValue(d)}
                          </div>
                          <div className="text-[10px] uppercase tracking-wide">
                            <span className={d.isOnline ? 'text-emerald-600' : 'text-slate-400'}>
                              {d.isOnline ? '● online' : '○ offline'}
                            </span>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Floorplan */}
            <section className="h-[420px] lg:h-auto rounded-lg border border-slate-200 bg-white shadow-sm flex flex-col overflow-hidden">
              {room.floorplanUrl ? (
                <div className="flex-1 flex items-center justify-center p-3 min-h-0">
                  <Floorplan
                    imageUrl={room.floorplanUrl}
                    devices={floorplanDevices}
                    onPlace={moveDevice}
                    onRemove={removeDeviceFromPlan}
                  />
                </div>
              ) : (
                <div className="flex-1 m-3 rounded border border-dashed border-slate-300 bg-slate-50 p-6 text-center flex flex-col items-center justify-center">
                  <div className="text-3xl mb-2" aria-hidden>
                    🗺️
                  </div>
                  <h3 className="text-sm font-medium text-slate-800">План ще не завантажено</h3>
                  <p className="mt-1 text-xs text-slate-500 max-w-xs">
                    Зображення плану можна додати при{' '}
                    <button
                      type="button"
                      onClick={openEdit}
                      className="text-brand-600 hover:text-brand-700 font-medium underline-offset-2 hover:underline"
                    >
                      редагуванні кімнати
                    </button>
                    .
                  </p>
                </div>
              )}
            </section>
          </div>

          {editingRoom && (
            <RoomFormModal
              // Edit mode renders the house as read-only label from `initial.house`,
              // so the houses list isn't needed here.
              houses={[]}
              initial={editingRoom}
              onClose={() => setEditingRoom(null)}
              onSaved={() => {
                setEditingRoom(null);
                load();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
