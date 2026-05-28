import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  createDevice,
  deleteDevice,
  fetchHouses,
  fetchRooms,
  fetchDevices,
  updateDevice,
  type Device,
  type DeviceType,
  type House,
  type Room,
} from '../api';
import { PageHeader } from '../ui/PageHeader';
import { ConfirmModal, Modal } from '../ui/Modal';
import { DEVICE_TYPE_OPTIONS, DeviceIcon, deviceLabel } from '../ui/devices';
import { extractError } from '../ui/errors';
import { IconButton } from '../ui/IconButton';
import { PencilIcon, PowerIcon, TrashIcon } from '../ui/icons';
import { Pagination, usePagination } from '../ui/Pagination';
import { SearchInput } from '../ui/SearchInput';

type ModalState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; target: Device }
  | { kind: 'delete'; target: Device };

export default function Devices() {
  const [houses, setHouses] = useState<House[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedHouseId, setSelectedHouseId] = useState<number | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);

  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.type.toLowerCase().includes(q) ||
        deviceLabel(d.type).toLowerCase().includes(q),
    );
  }, [devices, search]);

  const pag = usePagination(filtered, 10);

  useEffect(() => {
    fetchHouses()
      .then((h) => {
        setHouses(h);
      })
      .catch((e) => setError(extractError(e)));
  }, []);

  useEffect(() => {
    // Reset room when house changes; "all" room is the default each time.
    setSelectedRoomId(null);
    fetchRooms(selectedHouseId !== null ? { houseId: selectedHouseId } : undefined)
      .then(setRooms)
      .catch((e) => setError(extractError(e)));
  }, [selectedHouseId]);

  useEffect(() => {
    setLoading(true);
    const params: { roomId?: number; houseId?: number } = {};
    if (selectedRoomId !== null) params.roomId = selectedRoomId;
    else if (selectedHouseId !== null) params.houseId = selectedHouseId;
    fetchDevices(Object.keys(params).length ? params : undefined)
      .then((d) => {
        setDevices(d);
        setError(null);
      })
      .catch((e) => setError(extractError(e)))
      .finally(() => setLoading(false));
  }, [selectedHouseId, selectedRoomId]);

  function refresh() {
    const params: { roomId?: number; houseId?: number } = {};
    if (selectedRoomId !== null) params.roomId = selectedRoomId;
    else if (selectedHouseId !== null) params.houseId = selectedHouseId;
    fetchDevices(Object.keys(params).length ? params : undefined)
      .then(setDevices)
      .catch((e) => setError(extractError(e)));
  }

  const showRoomCol = selectedRoomId === null;

  async function toggleStatus(d: Device) {
    try {
      await updateDevice(d.id, { status: d.status === 'on' ? 'off' : 'on' });
      refresh();
    } catch (e) {
      setError(extractError(e));
    }
  }

  return (
    <div className="p-8">
      <PageHeader
        subtitle="Керування пристроями в межах кімнати"
        right={
          <div className="flex items-end gap-3">
            {houses.length > 0 && (
              <label className="text-sm">
                <span className="block text-xs text-slate-500 mb-1">Будинок</span>
                <select
                  value={selectedHouseId ?? ''}
                  onChange={(e) =>
                    setSelectedHouseId(e.target.value ? Number(e.target.value) : null)
                  }
                  className="rounded border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="">Всі будинки</option>
                  {houses.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {rooms.length > 0 && (
              <label className="text-sm">
                <span className="block text-xs text-slate-500 mb-1">Кімната</span>
                <select
                  value={selectedRoomId ?? ''}
                  onChange={(e) =>
                    setSelectedRoomId(e.target.value ? Number(e.target.value) : null)
                  }
                  className="rounded border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="">Всі кімнати</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              onClick={() => setModal({ kind: 'create' })}
              disabled={houses.length === 0}
              title={
                houses.length === 0
                  ? 'Спочатку створіть будинок і кімнату'
                  : undefined
              }
              className="rounded bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + Додати пристрій
            </button>
          </div>
        }
      />

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {houses.length === 0 ? (
        <div className="rounded border border-dashed border-slate-300 bg-white p-6 text-center text-slate-500">
          У вас ще немає будинків. Створіть один на сторінці{' '}
          <span className="font-medium">Будинки</span>.
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Пошук за назвою або типом…"
              className="max-w-sm"
            />
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Назва</th>
                <th className="text-left px-4 py-2 font-medium">Тип</th>
                {showRoomCol && (
                  <th className="text-left px-4 py-2 font-medium">Кімната</th>
                )}
                <th className="text-left px-4 py-2 font-medium w-28">Статус</th>
                <th className="px-2 py-2 w-px whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="px-4 py-3 text-slate-500" colSpan={showRoomCol ? 5 : 4}>
                    Завантаження…
                  </td>
                </tr>
              )}
              {!loading && devices.length === 0 && (
                <tr>
                  <td
                    className="px-4 py-6 text-center text-slate-500"
                    colSpan={showRoomCol ? 5 : 4}
                  >
                    Пристроїв немає.
                  </td>
                </tr>
              )}
              {!loading && devices.length > 0 && filtered.length === 0 && (
                <tr>
                  <td
                    className="px-4 py-6 text-center text-slate-500"
                    colSpan={showRoomCol ? 5 : 4}
                  >
                    Нічого не знайдено за запитом «{search}».
                  </td>
                </tr>
              )}
              {pag.visible.map((d) => (
                <tr key={d.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link
                      to={`/devices/${d.id}`}
                      className="flex items-center gap-2 hover:text-brand-600"
                    >
                      <DeviceIcon
                        type={d.type}
                        className="w-4 h-4 text-slate-500 shrink-0"
                        aria-hidden
                      />
                      <span className="font-medium text-slate-800 hover:text-brand-600">
                        {d.name}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{deviceLabel(d.type)}</td>
                  {showRoomCol && (
                    <td className="px-4 py-3 text-slate-600">
                      <Link
                        to={`/rooms/${d.room.id}`}
                        className="hover:text-brand-600"
                      >
                        {d.room.name}
                      </Link>
                      <span className="text-slate-400"> · {d.room.house.name}</span>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <span
                      className={[
                        'text-[10px] uppercase tracking-wide px-2 py-1 rounded-full',
                        d.status === 'on'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500',
                      ].join(' ')}
                    >
                      {d.status}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <IconButton
                        label={d.status === 'on' ? 'Вимкнути' : 'Увімкнути'}
                        tone="warning"
                        icon={
                          <PowerIcon
                            className={`w-4 h-4 ${d.status === 'on' ? 'text-emerald-600' : ''}`}
                          />
                        }
                        onClick={() => toggleStatus(d)}
                      />
                      <IconButton
                        label="Редагувати"
                        tone="primary"
                        icon={<PencilIcon className="w-4 h-4" />}
                        onClick={() => setModal({ kind: 'edit', target: d })}
                      />
                      <IconButton
                        label="Видалити"
                        tone="danger"
                        icon={<TrashIcon className="w-4 h-4" />}
                        onClick={() => setModal({ kind: 'delete', target: d })}
                      />
                    </div>
                  </td>
                </tr>
              ))}
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
      )}

      {modal.kind === 'create' && (
        <DeviceFormModal
          houses={houses}
          defaultHouseId={selectedHouseId}
          defaultRoomId={selectedRoomId}
          onClose={() => setModal({ kind: 'none' })}
          onSaved={() => {
            setModal({ kind: 'none' });
            refresh();
          }}
        />
      )}
      {modal.kind === 'edit' && (
        <DeviceFormModal
          houses={houses}
          initial={modal.target}
          onClose={() => setModal({ kind: 'none' })}
          onSaved={() => {
            setModal({ kind: 'none' });
            refresh();
          }}
        />
      )}
      {modal.kind === 'delete' && (
        <DeleteDeviceModal
          target={modal.target}
          onClose={() => setModal({ kind: 'none' })}
          onDeleted={() => {
            setModal({ kind: 'none' });
            refresh();
          }}
        />
      )}
    </div>
  );
}

function DeviceFormModal({
  houses,
  defaultHouseId,
  defaultRoomId,
  initial,
  onClose,
  onSaved,
}: {
  houses: House[];
  defaultHouseId?: number | null;
  defaultRoomId?: number | null;
  initial?: Device;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(!initial);

  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<DeviceType>(initial?.type ?? 'thermostat');
  const [houseId, setHouseId] = useState<number | ''>(
    initial?.room.house.id ?? defaultHouseId ?? houses[0]?.id ?? '',
  );
  const [roomId, setRoomId] = useState<number | ''>(
    initial?.room.id ?? defaultRoomId ?? '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only fetch the full room set when creating; in edit mode we can't change
  // the room from the modal (the device's room/house is fixed).
  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    fetchRooms()
      .then((rs) => {
        if (cancelled) return;
        setAllRooms(rs);
      })
      .catch((e) => !cancelled && setError(extractError(e)))
      .finally(() => !cancelled && setRoomsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [initial]);

  // Rooms filtered to the selected house — drives the room dropdown.
  const visibleRooms = useMemo(
    () => (houseId === '' ? [] : allRooms.filter((r) => r.house.id === houseId)),
    [allRooms, houseId],
  );

  // If the picked room no longer belongs to the picked house, reset it.
  useEffect(() => {
    if (initial) return;
    if (roomId !== '' && !visibleRooms.some((r) => r.id === roomId)) {
      setRoomId(visibleRooms[0]?.id ?? '');
    }
  }, [initial, visibleRooms, roomId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!initial && roomId === '') {
      setError('Виберіть кімнату');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (initial) {
        await updateDevice(initial.id, { name: name.trim(), type });
      } else {
        await createDevice({ roomId: roomId as number, name: name.trim(), type });
      }
      onSaved();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setSubmitting(false);
    }
  }

  const noRoomsInHouse = !initial && !roomsLoading && houseId !== '' && visibleRooms.length === 0;

  return (
    <Modal title={initial ? 'Редагувати пристрій' : 'Новий пристрій'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        {initial ? (
          <div className="block">
            <div className="text-xs font-medium text-slate-600">Розташування</div>
            <div className="mt-1 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {initial.room.house.name} / {initial.room.name}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Будинок *</span>
              <select
                required
                value={houseId}
                onChange={(e) => setHouseId(e.target.value ? Number(e.target.value) : '')}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              >
                <option value="" disabled>
                  Оберіть будинок…
                </option>
                {houses.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Кімната *</span>
              <select
                required
                value={roomId}
                onChange={(e) => setRoomId(e.target.value ? Number(e.target.value) : '')}
                disabled={houseId === '' || roomsLoading || visibleRooms.length === 0}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm bg-white disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              >
                <option value="" disabled>
                  {roomsLoading
                    ? 'Завантаження…'
                    : visibleRooms.length === 0
                      ? 'У цьому будинку немає кімнат'
                      : 'Оберіть кімнату…'}
                </option>
                {visibleRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            {noRoomsInHouse && (
              <div className="sm:col-span-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                У цьому будинку поки немає кімнат. Спочатку створіть кімнату на сторінці «Кімнати».
              </div>
            )}
          </div>
        )}

        <label className="block">
          <span className="text-xs font-medium text-slate-600">Назва *</span>
          <input
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Тип</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as DeviceType)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm bg-white"
          >
            {DEVICE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Скасувати
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {submitting ? 'Зберігаю…' : 'Зберегти'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteDeviceModal({
  target,
  onClose,
  onDeleted,
}: {
  target: Device;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setBusy(true);
    setError(null);
    try {
      await deleteDevice(target.id);
      onDeleted();
    } catch (e) {
      setError(extractError(e));
      setBusy(false);
    }
  }

  return (
    <ConfirmModal
      title="Видалити пристрій"
      busy={busy}
      onClose={onClose}
      onConfirm={onConfirm}
      message={
        <div className="space-y-2">
          <p>
            Видалити пристрій <span className="font-semibold text-slate-800">«{target.name}»</span>?
          </p>
          <p className="text-xs text-slate-500">Уся його телеметрія буде видалена.</p>
          {error && (
            <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
      }
    />
  );
}
