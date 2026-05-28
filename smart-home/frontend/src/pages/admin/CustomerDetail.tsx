import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deleteCustomer, fetchCustomer, type CustomerDetail } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../ui/PageHeader';
import { Breadcrumbs } from '../../ui/Breadcrumbs';
import { StatCard } from '../../ui/StatCard';
import { Avatar } from '../../ui/Avatar';
import { ConfirmModal } from '../../ui/Modal';
import { extractError } from '../../ui/errors';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [impersonating, setImpersonating] = useState(false);

  async function onImpersonate() {
    if (!customer) return;
    setImpersonating(true);
    try {
      await auth.impersonate(customer.id);
      navigate('/dashboard');
    } catch (e) {
      setError(extractError(e));
      setImpersonating(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchCustomer(id)
      .then((c) => {
        setCustomer(c);
        setError(null);
      })
      .catch((e) => setError(extractError(e)))
      .finally(() => setLoading(false));
  }, [id]);

  async function onConfirmDelete() {
    if (!customer) return;
    setDeleting(true);
    try {
      await deleteCustomer(customer.id);
      navigate('/admin/customers', { replace: true });
    } catch (e) {
      setError(extractError(e));
      setDeleting(false);
    }
  }

  const totalDevices = customer?.houses.reduce((s, h) => s + h.deviceCount, 0) ?? 0;
  const totalRooms = customer?.houses.reduce((s, h) => s + h.roomCount, 0) ?? 0;

  return (
    <div className="p-8">
      <Breadcrumbs
        items={[
          { label: 'Користувачі', to: '/admin/customers' },
          { label: customer?.fullName ?? '…' },
        ]}
      />

      {loading && <div className="text-slate-500">Завантаження…</div>}
      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {customer && (
        <>
          <PageHeader
            title={
              <span className="flex items-center gap-3">
                <Avatar
                  url={customer.avatarUrl}
                  name={customer.fullName}
                  email={customer.email}
                  size="md"
                />
                <span>{customer.fullName}</span>
              </span>
            }
            subtitle={
              <span className="flex items-center gap-3 text-sm text-slate-500 mt-1">
                <span>{customer.email}</span>
                <span className="text-slate-300">·</span>
                <span>зареєстрований {formatDateTime(customer.createdAt)}</span>
              </span>
            }
            right={
              <div className="flex items-center gap-2">
                <button
                  onClick={onImpersonate}
                  disabled={impersonating}
                  className="rounded bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white px-4 py-2 text-sm font-medium"
                >
                  {impersonating ? 'Входжу…' : 'Увійти як цей користувач'}
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="rounded border border-red-300 bg-white hover:bg-red-50 text-red-700 px-4 py-2 text-sm font-medium"
                >
                  Видалити
                </button>
              </div>
            }
          />

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-6 mb-6">
            <StatCard label="Будинків" value={customer.houses.length} />
            <StatCard label="Кімнат" value={totalRooms} />
            <StatCard label="Пристроїв" value={totalDevices} />
            <StatCard label="Сценаріїв" value={customer.scenarioCount} />
            <StatCard label="Сповіщень" value={customer.notificationCount} />
          </div>

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
            <header className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">Будинки та кімнати</h2>
            </header>
            {customer.houses.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm">
                Користувач ще не створив жодного будинку.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {customer.houses.map((h) => (
                  <div key={h.id} className="p-4">
                    <div className="flex items-baseline justify-between mb-2">
                      <div>
                        <div className="font-medium text-slate-800">{h.name}</div>
                        <div className="text-xs text-slate-500">
                          {h.address ?? 'без адреси'} · додано {formatDateTime(h.createdAt)}
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">
                        {h.roomCount} кімнат · {h.deviceCount} пристроїв
                      </div>
                    </div>
                    {h.rooms.length === 0 ? (
                      <div className="text-xs text-slate-400 italic pl-2">кімнат немає</div>
                    ) : (
                      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
                        {h.rooms.map((r) => (
                          <li
                            key={r.id}
                            className="text-sm text-slate-700 px-3 py-2 rounded border border-slate-100 bg-slate-50 flex items-center justify-between"
                          >
                            <span>{r.name}</span>
                            <span className="text-xs text-slate-500">
                              {r.deviceCount} прист.
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {confirmDelete && customer && (
        <ConfirmModal
          title="Видалити користувача"
          busy={deleting}
          onClose={() => setConfirmDelete(false)}
          onConfirm={onConfirmDelete}
          message={
            <div className="space-y-2">
              <p>
                Видалити користувача{' '}
                <span className="font-semibold text-slate-800">«{customer.fullName}»</span> та все,
                що йому належить?
              </p>
              <p className="text-xs text-slate-500">
                Цю дію не можна скасувати. Усі будинки, кімнати, пристрої, телеметрія та сценарії
                будуть видалені.
              </p>
            </div>
          }
        />
      )}
    </div>
  );
}
