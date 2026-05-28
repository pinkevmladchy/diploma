import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  clearAlertEvent,
  createAlert,
  deleteAlert,
  fetchAlertEvents,
  fetchAlerts,
  fetchHouses,
  updateAlert,
  type AlertCondition,
  type AlertEvent,
  type AlertRule,
  type House,
  type MetricType,
} from '../api';
import { PageHeader } from '../ui/PageHeader';
import { ConfirmModal, Modal } from '../ui/Modal';
import { IconButton } from '../ui/IconButton';
import { PencilIcon, TrashIcon } from '../ui/icons';
import {
  CONDITION_OPTIONS,
  METRIC_OPTIONS,
  conditionSymbol,
  metricLabel,
  metricUnit,
} from '../ui/alerts';
import { formatMetricValue, isBinaryMetric } from '../ui/metrics';
import { extractError } from '../ui/errors';
import { Pagination, usePagination } from '../ui/Pagination';
import { SearchInput } from '../ui/SearchInput';
import { onAlert } from '../realtime';

type ModalState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; target: AlertRule }
  | { kind: 'delete'; target: AlertRule };

type TabKey = 'active' | 'history' | 'rules';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(fromIso: string, toIso: string | null): string {
  const from = new Date(fromIso).getTime();
  const to = toIso ? new Date(toIso).getTime() : Date.now();
  const ms = Math.max(0, to - from);
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'менше хв';
  if (mins < 60) return `${mins} хв`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} год ${mins % 60} хв`;
  const days = Math.floor(hours / 24);
  return `${days} д ${hours % 24} год`;
}

export default function Alerts() {
  const [houses, setHouses] = useState<House[]>([]);
  const [selectedHouseId, setSelectedHouseId] = useState<number | null>(null);
  const [tab, setTab] = useState<TabKey>('active');

  const [rules, setRules] = useState<AlertRule[]>([]);
  const [activeEvents, setActiveEvents] = useState<AlertEvent[]>([]);
  const [historyEvents, setHistoryEvents] = useState<AlertEvent[]>([]);

  const [loadingRules, setLoadingRules] = useState(false);
  const [loadingActive, setLoadingActive] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });

  useEffect(() => {
    fetchHouses()
      .then(setHouses)
      .catch((e) => setError(extractError(e)));
  }, []);

  const reloadRules = useCallback(() => {
    setLoadingRules(true);
    fetchAlerts(selectedHouseId !== null ? { houseId: selectedHouseId } : undefined)
      .then((r) => {
        setRules(r);
        setError(null);
      })
      .catch((e) => setError(extractError(e)))
      .finally(() => setLoadingRules(false));
  }, [selectedHouseId]);

  const reloadActive = useCallback(() => {
    setLoadingActive(true);
    fetchAlertEvents({
      status: 'active',
      ...(selectedHouseId !== null ? { houseId: selectedHouseId } : {}),
    })
      .then(setActiveEvents)
      .catch((e) => setError(extractError(e)))
      .finally(() => setLoadingActive(false));
  }, [selectedHouseId]);

  const reloadHistory = useCallback(() => {
    setLoadingHistory(true);
    fetchAlertEvents({
      status: 'cleared',
      limit: 200,
      ...(selectedHouseId !== null ? { houseId: selectedHouseId } : {}),
    })
      .then(setHistoryEvents)
      .catch((e) => setError(extractError(e)))
      .finally(() => setLoadingHistory(false));
  }, [selectedHouseId]);

  // Initial + house-filter changes refetch the active tab; lazy fetch the others.
  useEffect(() => {
    reloadActive();
    if (tab === 'rules') reloadRules();
    if (tab === 'history') reloadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHouseId]);

  useEffect(() => {
    if (tab === 'rules') reloadRules();
    if (tab === 'history') reloadHistory();
    if (tab === 'active') reloadActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Live updates: keep the active/history lists in sync without a full refetch
  // for every event. Falls back to refetching when state is ambiguous.
  useEffect(() => {
    return onAlert((msg) => {
      if (msg.kind === 'opened') {
        if (selectedHouseId !== null && msg.event.house.id !== selectedHouseId) return;
        setActiveEvents((prev) =>
          prev.some((e) => e.id === msg.event.id) ? prev : [msg.event, ...prev],
        );
      } else {
        setActiveEvents((prev) => prev.filter((e) => e.id !== msg.eventId));
        // History tab is paginated/filtered, so a precise prepend is risky —
        // just refetch if user is currently looking at it.
        if (tab === 'history') reloadHistory();
      }
    });
  }, [selectedHouseId, tab, reloadHistory]);

  return (
    <div className="p-8">
      <PageHeader
        subtitle="Активні події, історія спрацьовувань та правила порогів"
        right={
          houses.length > 0 ? (
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
          ) : undefined
        }
      />

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 border-b border-slate-200 flex items-end gap-1">
        <TabButton active={tab === 'active'} onClick={() => setTab('active')}>
          Активні
          {activeEvents.length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700">
              {activeEvents.length}
            </span>
          )}
        </TabButton>
        <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
          Історія
        </TabButton>
        <TabButton active={tab === 'rules'} onClick={() => setTab('rules')}>
          Правила
        </TabButton>
      </div>

      {tab === 'active' && (
        <ActiveTab
          events={activeEvents}
          loading={loadingActive}
          onClear={async (id) => {
            try {
              await clearAlertEvent(id);
              setActiveEvents((prev) => prev.filter((e) => e.id !== id));
            } catch (e) {
              setError(extractError(e));
            }
          }}
        />
      )}

      {tab === 'history' && <HistoryTab events={historyEvents} loading={loadingHistory} />}

      {tab === 'rules' && (
        <RulesTab
          rules={rules}
          loading={loadingRules}
          showHouseCol={selectedHouseId === null}
          canCreate={selectedHouseId !== null}
          onCreate={() => setModal({ kind: 'create' })}
          onEdit={(rule) => setModal({ kind: 'edit', target: rule })}
          onDelete={(rule) => setModal({ kind: 'delete', target: rule })}
          onToggleActive={async (rule) => {
            try {
              await updateAlert(rule.id, { isActive: !rule.isActive });
              reloadRules();
            } catch (e) {
              setError(extractError(e));
            }
          }}
        />
      )}

      {modal.kind === 'create' && selectedHouseId !== null && (
        <AlertFormModal
          houseId={selectedHouseId}
          onClose={() => setModal({ kind: 'none' })}
          onSaved={() => {
            setModal({ kind: 'none' });
            reloadRules();
          }}
        />
      )}
      {modal.kind === 'edit' && (
        <AlertFormModal
          houseId={modal.target.house.id}
          initial={modal.target}
          onClose={() => setModal({ kind: 'none' })}
          onSaved={() => {
            setModal({ kind: 'none' });
            reloadRules();
          }}
        />
      )}
      {modal.kind === 'delete' && (
        <DeleteAlertModal
          target={modal.target}
          onClose={() => setModal({ kind: 'none' })}
          onDeleted={() => {
            setModal({ kind: 'none' });
            reloadRules();
          }}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        '-mb-px px-4 py-2 text-sm font-medium border-b-2 transition-colors',
        active
          ? 'border-brand-600 text-brand-700'
          : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Active events tab
// ---------------------------------------------------------------------------

function ActiveTab({
  events,
  loading,
  onClear,
}: {
  events: AlertEvent[];
  loading: boolean;
  onClear: (id: number) => void | Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter(
      (e) =>
        (e.alertName ?? '').toLowerCase().includes(q) ||
        e.device.name.toLowerCase().includes(q) ||
        e.house.name.toLowerCase().includes(q) ||
        e.room.name.toLowerCase().includes(q) ||
        metricLabel(e.metricType).toLowerCase().includes(q),
    );
  }, [events, search]);
  const pag = usePagination(filtered, 10);

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Пошук за правилом, пристроєм або кімнатою…"
          className="max-w-sm"
        />
      </div>
      <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Правило</th>
            <th className="text-left px-4 py-2 font-medium">Пристрій</th>
            <th className="text-left px-4 py-2 font-medium">Розташування</th>
            <th className="text-right px-4 py-2 font-medium">Поточне значення</th>
            <th className="text-left px-4 py-2 font-medium">Триває</th>
            <th className="px-2 py-2 w-px whitespace-nowrap"></th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td className="px-4 py-3 text-slate-500" colSpan={6}>
                Завантаження…
              </td>
            </tr>
          )}
          {!loading && events.length === 0 && (
            <tr>
              <td className="px-4 py-6 text-center text-slate-500" colSpan={6}>
                Активних алертів немає. Все спокійно.
              </td>
            </tr>
          )}
          {!loading && events.length > 0 && filtered.length === 0 && (
            <tr>
              <td className="px-4 py-6 text-center text-slate-500" colSpan={6}>
                Нічого не знайдено за запитом «{search}».
              </td>
            </tr>
          )}
          {pag.visible.map((e) => (
            <tr key={e.id} className="border-t border-slate-100">
              <td className="px-4 py-3 text-slate-800">
                <div className="font-medium">{e.alertName ?? metricLabel(e.metricType)}</div>
                <div className="text-xs text-slate-500 font-mono">
                  {metricLabel(e.metricType)} {e.conditionSymbol} {e.thresholdValue} {e.unit}
                </div>
              </td>
              <td className="px-4 py-3">
                <Link
                  to={`/devices/${e.device.id}`}
                  className="text-slate-800 hover:text-brand-600 font-medium"
                >
                  {e.device.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-slate-600">
                <Link to={`/houses/${e.house.id}`} className="hover:text-brand-600">
                  {e.house.name}
                </Link>
                {' / '}
                <Link to={`/rooms/${e.room.id}`} className="hover:text-brand-600">
                  {e.room.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-right text-red-700 font-mono font-semibold">
                {isBinaryMetric(e.metricType)
                  ? formatMetricValue(e.metricType, e.latestValue, e.unit)
                  : `${e.latestValue.toFixed(2)} ${e.unit}`}
              </td>
              <td className="px-4 py-3 text-slate-500">
                <div>{formatDuration(e.triggeredAt, null)}</div>
                <div className="text-xs text-slate-400">з {formatDateTime(e.triggeredAt)}</div>
              </td>
              <td className="px-2 py-2 text-right whitespace-nowrap">
                <button
                  onClick={() => onClear(e.id)}
                  className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  title="Перенести в історію"
                >
                  Зняти
                </button>
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
  );
}

// ---------------------------------------------------------------------------
// History tab
// ---------------------------------------------------------------------------

function HistoryTab({ events, loading }: { events: AlertEvent[]; loading: boolean }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter(
      (e) =>
        (e.alertName ?? '').toLowerCase().includes(q) ||
        e.device.name.toLowerCase().includes(q) ||
        e.house.name.toLowerCase().includes(q) ||
        e.room.name.toLowerCase().includes(q) ||
        metricLabel(e.metricType).toLowerCase().includes(q),
    );
  }, [events, search]);
  const pag = usePagination(filtered, 10);

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Пошук у історії…"
          className="max-w-sm"
        />
      </div>
      <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Правило</th>
            <th className="text-left px-4 py-2 font-medium">Пристрій</th>
            <th className="text-left px-4 py-2 font-medium">Розташування</th>
            <th className="text-right px-4 py-2 font-medium">Пік</th>
            <th className="text-left px-4 py-2 font-medium">Тривалість</th>
            <th className="text-left px-4 py-2 font-medium">Як завершилось</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td className="px-4 py-3 text-slate-500" colSpan={6}>
                Завантаження…
              </td>
            </tr>
          )}
          {!loading && events.length === 0 && (
            <tr>
              <td className="px-4 py-6 text-center text-slate-500" colSpan={6}>
                В історії ще немає завершених алертів.
              </td>
            </tr>
          )}
          {!loading && events.length > 0 && filtered.length === 0 && (
            <tr>
              <td className="px-4 py-6 text-center text-slate-500" colSpan={6}>
                Нічого не знайдено за запитом «{search}».
              </td>
            </tr>
          )}
          {pag.visible.map((e) => (
            <tr key={e.id} className="border-t border-slate-100">
              <td className="px-4 py-3 text-slate-800">
                <div className="font-medium">{e.alertName ?? metricLabel(e.metricType)}</div>
                <div className="text-xs text-slate-500 font-mono">
                  {metricLabel(e.metricType)} {e.conditionSymbol} {e.thresholdValue} {e.unit}
                </div>
              </td>
              <td className="px-4 py-3">
                <Link
                  to={`/devices/${e.device.id}`}
                  className="text-slate-800 hover:text-brand-600 font-medium"
                >
                  {e.device.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-slate-600">
                <Link to={`/houses/${e.house.id}`} className="hover:text-brand-600">
                  {e.house.name}
                </Link>
                {' / '}
                <Link to={`/rooms/${e.room.id}`} className="hover:text-brand-600">
                  {e.room.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-right font-mono text-slate-700">
                {isBinaryMetric(e.metricType)
                  ? formatMetricValue(e.metricType, e.latestValue, e.unit)
                  : `${e.latestValue.toFixed(2)} ${e.unit}`}
              </td>
              <td className="px-4 py-3 text-slate-500">
                <div>{formatDuration(e.triggeredAt, e.clearedAt)}</div>
                <div className="text-xs text-slate-400">
                  {formatDateTime(e.triggeredAt)} →{' '}
                  {e.clearedAt ? formatDateTime(e.clearedAt) : '—'}
                </div>
              </td>
              <td className="px-4 py-3">
                <span
                  className={[
                    'inline-flex text-[11px] font-medium px-2 py-1 rounded-full',
                    e.clearReason === 'manual'
                      ? 'bg-slate-100 text-slate-700'
                      : 'bg-emerald-100 text-emerald-700',
                  ].join(' ')}
                >
                  {e.clearReason === 'manual' ? 'знято вручну' : 'нормалізовано'}
                </span>
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
  );
}

// ---------------------------------------------------------------------------
// Rules tab (existing CRUD, moved into its own component)
// ---------------------------------------------------------------------------

function RulesTab({
  rules,
  loading,
  showHouseCol,
  canCreate,
  onCreate,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  rules: AlertRule[];
  loading: boolean;
  showHouseCol: boolean;
  canCreate: boolean;
  onCreate: () => void;
  onEdit: (r: AlertRule) => void;
  onDelete: (r: AlertRule) => void;
  onToggleActive: (r: AlertRule) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter(
      (r) =>
        (r.name ?? '').toLowerCase().includes(q) ||
        r.metricType.toLowerCase().includes(q) ||
        metricLabel(r.metricType).toLowerCase().includes(q),
    );
  }, [rules, search]);
  const pag = usePagination(filtered, 10);

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 justify-between">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Пошук за назвою або метрикою…"
          className="max-w-sm"
        />
        <button
          onClick={onCreate}
          disabled={!canCreate}
          title={canCreate ? undefined : 'Виберіть конкретний будинок, щоб додати правило'}
          className="rounded bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + Додати правило
        </button>
      </div>
      <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Назва</th>
            {showHouseCol && <th className="text-left px-4 py-2 font-medium">Будинок</th>}
            <th className="text-left px-4 py-2 font-medium">Метрика</th>
            <th className="text-left px-4 py-2 font-medium">Умова</th>
            <th className="text-left px-4 py-2 font-medium w-24">Активне</th>
            <th className="px-2 py-2 w-px whitespace-nowrap"></th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td className="px-4 py-3 text-slate-500" colSpan={showHouseCol ? 6 : 5}>
                Завантаження…
              </td>
            </tr>
          )}
          {!loading && rules.length === 0 && (
            <tr>
              <td
                className="px-4 py-6 text-center text-slate-500"
                colSpan={showHouseCol ? 6 : 5}
              >
                Правил ще немає.
              </td>
            </tr>
          )}
          {!loading && rules.length > 0 && filtered.length === 0 && (
            <tr>
              <td
                className="px-4 py-6 text-center text-slate-500"
                colSpan={showHouseCol ? 6 : 5}
              >
                Нічого не знайдено за запитом «{search}».
              </td>
            </tr>
          )}
          {pag.visible.map((r) => (
            <tr key={r.id} className="border-t border-slate-100">
              <td className="px-4 py-3 font-medium text-slate-800">
                {r.name ?? <span className="text-slate-400 italic">без назви</span>}
              </td>
              {showHouseCol && (
                <td className="px-4 py-3 text-slate-600">
                  <Link to={`/houses/${r.house.id}`} className="hover:text-brand-600">
                    {r.house.name}
                  </Link>
                </td>
              )}
              <td className="px-4 py-3 text-slate-600">{metricLabel(r.metricType)}</td>
              <td className="px-4 py-3 text-slate-700">
                <span className="font-mono">
                  {conditionSymbol(r.condition)} {r.thresholdValue}
                </span>{' '}
                <span className="text-slate-400">{metricUnit(r.metricType)}</span>
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => onToggleActive(r)}
                  className={`text-xs font-medium px-2 py-1 rounded-full ${
                    r.isActive
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {r.isActive ? 'активне' : 'вимкнено'}
                </button>
              </td>
              <td className="px-2 py-2 text-right whitespace-nowrap">
                <div className="inline-flex items-center gap-1">
                  <IconButton
                    label="Редагувати"
                    tone="primary"
                    icon={<PencilIcon className="w-4 h-4" />}
                    onClick={() => onEdit(r)}
                  />
                  <IconButton
                    label="Видалити"
                    tone="danger"
                    icon={<TrashIcon className="w-4 h-4" />}
                    onClick={() => onDelete(r)}
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
  );
}

// ---------------------------------------------------------------------------
// Modals (unchanged behavior from previous version)
// ---------------------------------------------------------------------------

function AlertFormModal({
  houseId,
  initial,
  onClose,
  onSaved,
}: {
  houseId: number;
  initial?: AlertRule;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [metric, setMetric] = useState<MetricType>(initial?.metricType ?? 'temperature');
  const [condition, setCondition] = useState<AlertCondition>(initial?.condition ?? 'gt');
  const [threshold, setThreshold] = useState<string>(
    initial ? String(initial.thresholdValue) : '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = Number(threshold);
    if (!Number.isFinite(t)) {
      setError('Поріг має бути числом');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: name.trim() || null,
        metricType: metric,
        condition,
        thresholdValue: t,
      };
      if (initial) await updateAlert(initial.id, payload);
      else await createAlert({ houseId, ...payload, isActive: true });
      onSaved();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={initial ? 'Редагувати правило' : 'Нове правило'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Назва (опціонально)</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="наприклад: Перегрів у будинку"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-600">Метрика *</span>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricType)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm bg-white"
          >
            {METRIC_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label} ({m.unit})
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-3">
          <label className="flex-1">
            <span className="text-xs font-medium text-slate-600">Умова *</span>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as AlertCondition)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm bg-white"
            >
              {CONDITION_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.symbol} — {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1">
            <span className="text-xs font-medium text-slate-600">
              Поріг * <span className="text-slate-400">({metricUnit(metric)})</span>
            </span>
            <input
              required
              type="number"
              step="any"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </label>
        </div>

        <div className="rounded bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
          Спрацює, коли значення метрики{' '}
          <span className="font-medium text-slate-800">{metricLabel(metric)}</span>{' '}
          <span className="font-mono">
            {conditionSymbol(condition)} {threshold || '?'}
          </span>{' '}
          {metricUnit(metric)} на будь-якому пристрої будинку.
        </div>

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

function DeleteAlertModal({
  target,
  onClose,
  onDeleted,
}: {
  target: AlertRule;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setBusy(true);
    setError(null);
    try {
      await deleteAlert(target.id);
      onDeleted();
    } catch (e) {
      setError(extractError(e));
      setBusy(false);
    }
  }

  return (
    <ConfirmModal
      title="Видалити правило"
      busy={busy}
      onClose={onClose}
      onConfirm={onConfirm}
      message={
        <div className="space-y-2">
          <p>
            Видалити правило{' '}
            <span className="font-semibold text-slate-800">
              «{target.name ?? metricLabel(target.metricType)}»
            </span>
            ?
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
