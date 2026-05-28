import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchHouse, type HouseDetail } from '../api';
import { PageHeader } from '../ui/PageHeader';
import { Breadcrumbs } from '../ui/Breadcrumbs';
import { StatCard } from '../ui/StatCard';
import { extractError } from '../ui/errors';

export default function HouseDashboard() {
  const { id } = useParams<{ id: string }>();
  const houseId = Number(id);
  const [house, setHouse] = useState<HouseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isInteger(houseId)) {
      setError('Невірний ідентифікатор будинку');
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchHouse(houseId)
      .then((h) => {
        setHouse(h);
        setError(null);
      })
      .catch((e) => setError(extractError(e)))
      .finally(() => setLoading(false));
  }, [houseId]);

  const totalDevices = house?.rooms.reduce((sum, r) => sum + r.deviceCount, 0) ?? 0;

  return (
    <div className="p-8">
      <Breadcrumbs
        items={[
          { label: 'Будинки', to: '/houses' },
          { label: house?.name ?? '…' },
        ]}
      />

      {loading && <div className="text-slate-500">Завантаження…</div>}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {house && (
        <>
          <PageHeader title={house.name} subtitle={house.address ?? 'Адреса не вказана'} />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
            <StatCard label="Кімнат" value={house.roomCount} />
            <StatCard label="Пристроїв" value={totalDevices} hint="У всіх кімнатах" />
            <StatCard
              label="Створено"
              value={new Date(house.createdAt).toLocaleDateString('uk-UA')}
            />
          </div>

          <section>
            <h2 className="mb-3 text-base font-semibold text-slate-800">Кімнати</h2>
            {house.rooms.length === 0 ? (
              <div className="rounded border border-dashed border-slate-300 bg-white p-6 text-center text-slate-500">
                У цьому будинку поки немає кімнат.{' '}
                <Link to="/rooms" className="text-brand-600 hover:text-brand-700 font-medium">
                  Додати →
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {house.rooms.map((r) => (
                  <Link
                    key={r.id}
                    to={`/rooms/${r.id}`}
                    className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-brand-400 transition"
                  >
                    <div className="flex items-start justify-between">
                      <div className="font-medium text-slate-800">{r.name}</div>
                      <span className="text-xs text-slate-500">{r.deviceCount} пристроїв</span>
                    </div>
                    {r.description && (
                      <div className="mt-1 text-xs text-slate-500">{r.description}</div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
