import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteRoom, fetchHouses, fetchRooms, type House, type Room } from '../api';
import { PageHeader } from '../ui/PageHeader';
import { ConfirmModal } from '../ui/Modal';
import { extractError } from '../ui/errors';
import { IconButton } from '../ui/IconButton';
import { PencilIcon, TrashIcon } from '../ui/icons';
import { RoomFormModal } from '../components/RoomFormModal';
import { Pagination, usePagination } from '../ui/Pagination';
import { SearchInput } from '../ui/SearchInput';

type ModalState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; target: Room }
  | { kind: 'delete'; target: Room };

export default function Rooms() {
  const [houses, setHouses] = useState<House[]>([]);
  const [selectedHouseId, setSelectedHouseId] = useState<number | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter(
      (r) =>
        r.name.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q),
    );
  }, [rooms, search]);

  const pag = usePagination(filtered, 10);

  useEffect(() => {
    fetchHouses()
      .then((h) => {
        setHouses(h);
      })
      .catch((e) => setError(extractError(e)));
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchRooms(selectedHouseId !== null ? { houseId: selectedHouseId } : undefined)
      .then((r) => {
        setRooms(r);
        setError(null);
      })
      .catch((e) => setError(extractError(e)))
      .finally(() => setLoading(false));
  }, [selectedHouseId]);

  function refresh() {
    fetchRooms(selectedHouseId !== null ? { houseId: selectedHouseId } : undefined)
      .then(setRooms)
      .catch((e) => setError(extractError(e)));
  }

  const showHouseCol = selectedHouseId === null;

  return (
    <div className="p-8">
      <PageHeader
        subtitle="Управління кімнатами в межах обраного будинку"
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
            <button
              onClick={() => setModal({ kind: 'create' })}
              disabled={houses.length === 0}
              title={
                houses.length === 0
                  ? 'Спочатку створіть будинок'
                  : undefined
              }
              className="rounded bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + Додати кімнату
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
          У вас ще немає будинків. Створіть будинок на сторінці{' '}
          <span className="font-medium">Будинки</span>.
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Пошук за назвою або описом…"
              className="max-w-sm"
            />
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Назва</th>
                {showHouseCol && (
                  <th className="text-left px-4 py-2 font-medium">Будинок</th>
                )}
                <th className="text-left px-4 py-2 font-medium">Опис</th>
                <th className="text-left px-4 py-2 font-medium w-28">Пристроїв</th>
                <th className="px-2 py-2 w-px whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="px-4 py-3 text-slate-500" colSpan={showHouseCol ? 5 : 4}>
                    Завантаження…
                  </td>
                </tr>
              )}
              {!loading && rooms.length === 0 && (
                <tr>
                  <td
                    className="px-4 py-6 text-center text-slate-500"
                    colSpan={showHouseCol ? 5 : 4}
                  >
                    Кімнат ще немає.
                  </td>
                </tr>
              )}
              {!loading && rooms.length > 0 && filtered.length === 0 && (
                <tr>
                  <td
                    className="px-4 py-6 text-center text-slate-500"
                    colSpan={showHouseCol ? 5 : 4}
                  >
                    Нічого не знайдено за запитом «{search}».
                  </td>
                </tr>
              )}
              {pag.visible.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/rooms/${r.id}`} className="text-slate-800 hover:text-brand-600">
                      {r.name}
                    </Link>
                  </td>
                  {showHouseCol && (
                    <td className="px-4 py-3 text-slate-600">
                      <Link
                        to={`/houses/${r.house.id}`}
                        className="hover:text-brand-600"
                      >
                        {r.house.name}
                      </Link>
                    </td>
                  )}
                  <td className="px-4 py-3 text-slate-600">{r.description ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{r.deviceCount}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <IconButton
                        label="Редагувати"
                        tone="primary"
                        icon={<PencilIcon className="w-4 h-4" />}
                        onClick={() => setModal({ kind: 'edit', target: r })}
                      />
                      <IconButton
                        label="Видалити"
                        tone="danger"
                        icon={<TrashIcon className="w-4 h-4" />}
                        onClick={() => setModal({ kind: 'delete', target: r })}
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
        <RoomFormModal
          houses={houses}
          defaultHouseId={selectedHouseId}
          onClose={() => setModal({ kind: 'none' })}
          onSaved={() => {
            setModal({ kind: 'none' });
            refresh();
          }}
        />
      )}
      {modal.kind === 'edit' && (
        <RoomFormModal
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
        <DeleteRoomModal
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

function DeleteRoomModal({
  target,
  onClose,
  onDeleted,
}: {
  target: Room;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setBusy(true);
    setError(null);
    try {
      await deleteRoom(target.id);
      onDeleted();
    } catch (e) {
      setError(extractError(e));
      setBusy(false);
    }
  }

  return (
    <ConfirmModal
      title="Видалити кімнату"
      busy={busy}
      onClose={onClose}
      onConfirm={onConfirm}
      message={
        <div className="space-y-2">
          <p>
            Видалити кімнату <span className="font-semibold text-slate-800">«{target.name}»</span>?
          </p>
          <p className="text-xs text-slate-500">
            Усі {target.deviceCount} пристроїв буде видалено разом з нею.
          </p>
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
