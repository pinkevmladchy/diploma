import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { createHouse, deleteHouse, fetchHouses, updateHouse, type House } from '../api';
import { PageHeader } from '../ui/PageHeader';
import { ConfirmModal, Modal } from '../ui/Modal';
import { extractError } from '../ui/errors';
import { IconButton } from '../ui/IconButton';
import { PencilIcon, TrashIcon } from '../ui/icons';
import { Pagination, usePagination } from '../ui/Pagination';
import { SearchInput } from '../ui/SearchInput';

type ModalState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; target: House }
  | { kind: 'delete'; target: House };

export default function Houses() {
  const [houses, setHouses] = useState<House[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return houses;
    return houses.filter(
      (h) =>
        h.name.toLowerCase().includes(q) || (h.address ?? '').toLowerCase().includes(q),
    );
  }, [houses, search]);

  const pag = usePagination(filtered, 10);

  function refresh() {
    setLoading(true);
    fetchHouses()
      .then((d) => {
        setHouses(d);
        setError(null);
      })
      .catch((e) => setError(extractError(e)))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  return (
    <div className="p-8">
      <PageHeader
        subtitle="Управління будинками вашого облікового запису"
        right={
          <button
            onClick={() => setModal({ kind: 'create' })}
            className="rounded bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-medium"
          >
            + Додати будинок
          </button>
        }
      />

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
            placeholder="Пошук за назвою або адресою…"
            className="max-w-sm"
          />
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Назва</th>
              <th className="text-left px-4 py-2 font-medium">Адреса</th>
              <th className="text-left px-4 py-2 font-medium w-24">Кімнат</th>
              <th className="px-2 py-2 w-px whitespace-nowrap"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-4 py-3 text-slate-500" colSpan={4}>
                  Завантаження…
                </td>
              </tr>
            )}
            {!loading && houses.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={4}>
                  Ще немає будинків. Натисніть «Додати будинок».
                </td>
              </tr>
            )}
            {!loading && houses.length > 0 && filtered.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={4}>
                  Нічого не знайдено за запитом «{search}».
                </td>
              </tr>
            )}
            {pag.visible.map((h) => (
              <tr key={h.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">
                  <Link to={`/houses/${h.id}`} className="text-slate-800 hover:text-brand-600">
                    {h.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{h.address ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500">{h.roomCount}</td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  <div className="inline-flex items-center gap-1">
                    <IconButton
                      label="Редагувати"
                      tone="primary"
                      icon={<PencilIcon className="w-4 h-4" />}
                      onClick={() => setModal({ kind: 'edit', target: h })}
                    />
                    <IconButton
                      label="Видалити"
                      tone="danger"
                      icon={<TrashIcon className="w-4 h-4" />}
                      onClick={() => setModal({ kind: 'delete', target: h })}
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

      {modal.kind === 'create' && (
        <HouseFormModal
          onClose={() => setModal({ kind: 'none' })}
          onSaved={() => {
            setModal({ kind: 'none' });
            refresh();
          }}
        />
      )}
      {modal.kind === 'edit' && (
        <HouseFormModal
          initial={modal.target}
          onClose={() => setModal({ kind: 'none' })}
          onSaved={() => {
            setModal({ kind: 'none' });
            refresh();
          }}
        />
      )}
      {modal.kind === 'delete' && (
        <DeleteHouseModal
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

function HouseFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: House;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = { name: name.trim(), address: address.trim() || null };
      if (initial) await updateHouse(initial.id, payload);
      else await createHouse(payload);
      onSaved();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={initial ? 'Редагувати будинок' : 'Новий будинок'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
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
          <span className="text-xs font-medium text-slate-600">Адреса</span>
          <input
            value={address ?? ''}
            onChange={(e) => setAddress(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
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

function DeleteHouseModal({
  target,
  onClose,
  onDeleted,
}: {
  target: House;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setBusy(true);
    setError(null);
    try {
      await deleteHouse(target.id);
      onDeleted();
    } catch (e) {
      setError(extractError(e));
      setBusy(false);
    }
  }

  return (
    <ConfirmModal
      title="Видалити будинок"
      busy={busy}
      onClose={onClose}
      onConfirm={onConfirm}
      message={
        <div className="space-y-2">
          <p>
            Видалити будинок <span className="font-semibold text-slate-800">«{target.name}»</span>?
          </p>
          <p className="text-xs text-slate-500">
            Разом з ним буде видалено {target.roomCount} кімнат і всі пристрої.
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
