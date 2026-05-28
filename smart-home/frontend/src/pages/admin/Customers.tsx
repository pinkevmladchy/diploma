import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { deleteCustomer, fetchCustomers, type CustomerSummary } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../ui/PageHeader';
import { ConfirmModal } from '../../ui/Modal';
import { IconButton } from '../../ui/IconButton';
import { TrashIcon } from '../../ui/icons';
import { Pagination, usePagination } from '../../ui/Pagination';
import { SearchInput } from '../../ui/SearchInput';
import { Avatar } from '../../ui/Avatar';
import { StatCard } from '../../ui/StatCard';
import { extractError } from '../../ui/errors';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default function Customers() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [toDelete, setToDelete] = useState<CustomerSummary | null>(null);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  async function onImpersonate(c: CustomerSummary) {
    setImpersonatingId(c.id);
    try {
      await auth.impersonate(c.id);
      navigate('/dashboard');
    } catch (e) {
      setError(extractError(e));
    } finally {
      setImpersonatingId(null);
    }
  }

  function refresh() {
    setLoading(true);
    fetchCustomers()
      .then((rows) => {
        setCustomers(rows);
        setError(null);
      })
      .catch((e) => setError(extractError(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.email.toLowerCase().includes(q) || c.fullName.toLowerCase().includes(q),
    );
  }, [customers, search]);

  const pag = usePagination(filtered, 10);

  const totals = useMemo(
    () =>
      customers.reduce(
        (acc, c) => {
          acc.houses += c.houseCount;
          acc.rooms += c.roomCount;
          acc.devices += c.deviceCount;
          return acc;
        },
        { houses: 0, rooms: 0, devices: 0 },
      ),
    [customers],
  );

  return (
    <div className="p-8">
      <PageHeader subtitle="Користувачі, що самостійно зареєструвалися в системі" />

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <StatCard label="Користувачів" value={customers.length} />
        <StatCard label="Будинків" value={totals.houses} />
        <StatCard label="Кімнат" value={totals.rooms} />
        <StatCard label="Пристроїв" value={totals.devices} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Пошук за email або ім'ям…"
            className="max-w-sm"
          />
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Користувач</th>
              <th className="text-right px-4 py-2 font-medium">Будинків</th>
              <th className="text-right px-4 py-2 font-medium">Кімнат</th>
              <th className="text-right px-4 py-2 font-medium">Пристроїв</th>
              <th className="text-right px-4 py-2 font-medium">Сценаріїв</th>
              <th className="text-left px-4 py-2 font-medium">Реєстрація</th>
              <th className="px-2 py-2 w-px whitespace-nowrap"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-3 text-slate-500">
                  Завантаження…
                </td>
              </tr>
            )}
            {!loading && customers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                  Поки немає жодного зареєстрованого користувача.
                </td>
              </tr>
            )}
            {!loading && customers.length > 0 && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                  Нічого не знайдено за запитом «{search}».
                </td>
              </tr>
            )}
            {pag.visible.map((c) => (
              <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                <td className="px-4 py-3">
                  <Link
                    to={`/admin/customers/${c.id}`}
                    className="flex items-center gap-3 hover:text-brand-600"
                  >
                    <Avatar url={c.avatarUrl} name={c.fullName} email={c.email} size="sm" />
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800">{c.fullName}</div>
                      <div className="text-xs text-slate-500 truncate">{c.email}</div>
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-700">{c.houseCount}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-700">{c.roomCount}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-700">{c.deviceCount}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-700">
                  {c.scenarioCount}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(c.createdAt)}</td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  <div className="inline-flex items-center gap-1">
                    <button
                      onClick={() => onImpersonate(c)}
                      disabled={impersonatingId === c.id}
                      className="rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 px-2.5 py-1 text-xs font-medium text-slate-700"
                      title="Тимчасово увійти як цей користувач"
                    >
                      {impersonatingId === c.id ? '…' : 'Увійти як'}
                    </button>
                    <IconButton
                      label="Видалити"
                      tone="danger"
                      icon={<TrashIcon className="w-4 h-4" />}
                      onClick={() => setToDelete(c)}
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

      {toDelete && (
        <DeleteCustomerModal
          target={toDelete}
          onClose={() => setToDelete(null)}
          onDeleted={() => {
            setToDelete(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function DeleteCustomerModal({
  target,
  onClose,
  onDeleted,
}: {
  target: CustomerSummary;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setBusy(true);
    setError(null);
    try {
      await deleteCustomer(target.id);
      onDeleted();
    } catch (e) {
      setError(extractError(e));
      setBusy(false);
    }
  }

  return (
    <ConfirmModal
      title="Видалити користувача"
      busy={busy}
      onClose={onClose}
      onConfirm={onConfirm}
      message={
        <div className="space-y-2">
          <p>
            Видалити користувача{' '}
            <span className="font-semibold text-slate-800">«{target.fullName}»</span> ({target.email})?
          </p>
          <p className="text-xs text-slate-500">
            Усі його будинки ({target.houseCount}), кімнати ({target.roomCount}), пристрої (
            {target.deviceCount}) та сценарії ({target.scenarioCount}) буде видалено разом із ним.
            Цю дію не можна скасувати.
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
