import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  createScenario,
  deleteScenario,
  fetchDevices,
  fetchScenarios,
  runScenario,
  updateScenario,
  type AlertCondition,
  type Device,
  type DeviceStatus,
  type MetricType,
  type Scenario,
  type ScenarioAction,
  type ScenarioRunResult,
  type ScenarioTrigger,
  type ScenarioTriggerType,
} from '../api';
import { PageHeader } from '../ui/PageHeader';
import { ConfirmModal, Modal } from '../ui/Modal';
import { IconButton } from '../ui/IconButton';
import { PencilIcon, TrashIcon } from '../ui/icons';
import { CONDITION_OPTIONS, METRIC_OPTIONS, conditionSymbol, metricLabel, metricUnit } from '../ui/alerts';
import { extractError } from '../ui/errors';
import { Pagination, usePagination } from '../ui/Pagination';
import { SearchInput } from '../ui/SearchInput';

type ModalState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; target: Scenario }
  | { kind: 'delete'; target: Scenario };

function triggerSummary(s: Scenario): string {
  const t = s.triggerValue;
  switch (t.kind) {
    case 'manual':
      return 'Вручну';
    case 'time':
      return `Щодня о ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
    case 'sensor':
      return `${metricLabel(t.metricType)} ${conditionSymbol(t.condition)} ${t.threshold} ${metricUnit(t.metricType)}`;
  }
}

function actionSummary(a: ScenarioAction, devices: Device[]): string {
  if (a.kind === 'set_device_status') {
    const d = devices.find((x) => x.id === a.deviceId);
    return `${d?.name ?? 'Пристрій'} → ${a.status === 'on' ? 'увімкнути' : 'вимкнути'}`;
  }
  return `Сповіщення: «${a.message}»`;
}

export default function Scenarios() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [search, setSearch] = useState('');
  const [runFeedback, setRunFeedback] = useState<{
    name: string;
    result: ScenarioRunResult;
  } | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([fetchScenarios(), fetchDevices()])
      .then(([s, d]) => {
        setScenarios(s);
        setDevices(d);
        setError(null);
      })
      .catch((e) => setError(extractError(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scenarios;
    return scenarios.filter((s) => s.name.toLowerCase().includes(q));
  }, [scenarios, search]);
  const pag = usePagination(filtered, 10);

  async function onToggleActive(s: Scenario) {
    try {
      await updateScenario(s.id, { isActive: !s.isActive });
      refresh();
    } catch (e) {
      setError(extractError(e));
    }
  }

  async function onRunNow(s: Scenario) {
    try {
      const result = await runScenario(s.id);
      setRunFeedback({ name: s.name, result });
      refresh();
    } catch (e) {
      setError(extractError(e));
    }
  }

  return (
    <div className="p-8">
      <PageHeader
        subtitle="Автоматизації — коли трапляється X, виконати Y"
        right={
          <button
            onClick={() => setModal({ kind: 'create' })}
            className="rounded bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-medium"
          >
            + Новий сценарій
          </button>
        }
      />

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {runFeedback && (
        <div className="mb-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex items-start justify-between gap-3">
          <div>
            <div className="font-medium">Сценарій «{runFeedback.name}» виконано</div>
            <ul className="mt-1 text-xs text-emerald-700/80 space-y-0.5">
              {runFeedback.result.results.map((r, i) => (
                <li key={i}>
                  {r.ok ? '✓' : '✕'} {actionSummary(r.action, devices)}
                  {r.error && <span className="text-red-600"> — {r.error}</span>}
                </li>
              ))}
            </ul>
          </div>
          <button
            onClick={() => setRunFeedback(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs"
          >
            ×
          </button>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Пошук за назвою…"
            className="max-w-sm"
          />
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Назва</th>
              <th className="text-left px-4 py-2 font-medium">Тригер</th>
              <th className="text-left px-4 py-2 font-medium">Дії</th>
              <th className="text-left px-4 py-2 font-medium w-24">Активний</th>
              <th className="px-2 py-2 w-px whitespace-nowrap"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-3 text-slate-500">
                  Завантаження…
                </td>
              </tr>
            )}
            {!loading && scenarios.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Сценаріїв поки немає. Створіть перший — наприклад, «Кожен день о 22:00 вимкнути всі лампи».
                </td>
              </tr>
            )}
            {!loading && scenarios.length > 0 && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Нічого не знайдено за запитом «{search}».
                </td>
              </tr>
            )}
            {pag.visible.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                <td className="px-4 py-3 text-slate-600">
                  <div className="flex items-center gap-2">
                    <TriggerBadge type={s.triggerType} />
                    <span>{triggerSummary(s)}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <ul className="space-y-0.5">
                    {s.actions.slice(0, 3).map((a, i) => (
                      <li key={i} className="text-xs">
                        {actionSummary(a, devices)}
                      </li>
                    ))}
                    {s.actions.length > 3 && (
                      <li className="text-xs text-slate-400">
                        +{s.actions.length - 3} ще…
                      </li>
                    )}
                  </ul>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onToggleActive(s)}
                    className={`text-xs font-medium px-2 py-1 rounded-full ${
                      s.isActive
                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {s.isActive ? 'активний' : 'вимкнено'}
                  </button>
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  <div className="inline-flex items-center gap-1">
                    <button
                      onClick={() => onRunNow(s)}
                      className="rounded border border-slate-300 bg-white hover:bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700"
                      title="Запустити зараз"
                    >
                      ▶ Запустити
                    </button>
                    <IconButton
                      label="Редагувати"
                      tone="primary"
                      icon={<PencilIcon className="w-4 h-4" />}
                      onClick={() => setModal({ kind: 'edit', target: s })}
                    />
                    <IconButton
                      label="Видалити"
                      tone="danger"
                      icon={<TrashIcon className="w-4 h-4" />}
                      onClick={() => setModal({ kind: 'delete', target: s })}
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
        <ScenarioFormModal
          devices={devices}
          onClose={() => setModal({ kind: 'none' })}
          onSaved={() => {
            setModal({ kind: 'none' });
            refresh();
          }}
        />
      )}
      {modal.kind === 'edit' && (
        <ScenarioFormModal
          devices={devices}
          initial={modal.target}
          onClose={() => setModal({ kind: 'none' })}
          onSaved={() => {
            setModal({ kind: 'none' });
            refresh();
          }}
        />
      )}
      {modal.kind === 'delete' && (
        <DeleteScenarioModal
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

function TriggerBadge({ type }: { type: ScenarioTriggerType }) {
  const cls =
    type === 'time'
      ? 'bg-violet-100 text-violet-700'
      : type === 'sensor'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-slate-100 text-slate-600';
  const label = type === 'time' ? '⏰' : type === 'sensor' ? '🔔' : '☝';
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {label} {type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Form modal
// ---------------------------------------------------------------------------

function defaultTrigger(type: ScenarioTriggerType, devices: Device[]): ScenarioTrigger {
  if (type === 'manual') return { kind: 'manual' };
  if (type === 'time') return { kind: 'time', hour: 22, minute: 0 };
  return {
    kind: 'sensor',
    deviceId: devices[0]?.id ?? '',
    metricType: 'temperature',
    condition: 'gt',
    threshold: 25,
  };
}

function ScenarioFormModal({
  initial,
  devices,
  onClose,
  onSaved,
}: {
  initial?: Scenario;
  devices: Device[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [triggerType, setTriggerType] = useState<ScenarioTriggerType>(
    initial?.triggerType ?? 'manual',
  );
  const [trigger, setTrigger] = useState<ScenarioTrigger>(
    initial?.triggerValue ?? { kind: 'manual' },
  );
  const [actions, setActions] = useState<ScenarioAction[]>(
    initial?.actions && initial.actions.length > 0
      ? initial.actions
      : [{ kind: 'set_device_status', deviceId: devices[0]?.id ?? '', status: 'on' }],
  );
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function switchTriggerType(next: ScenarioTriggerType) {
    setTriggerType(next);
    setTrigger(defaultTrigger(next, devices));
  }

  function updateAction(idx: number, next: ScenarioAction) {
    setActions((prev) => prev.map((a, i) => (i === idx ? next : a)));
  }
  function removeAction(idx: number) {
    setActions((prev) => prev.filter((_, i) => i !== idx));
  }
  function addAction(kind: ScenarioAction['kind']) {
    setActions((prev) => [
      ...prev,
      kind === 'set_device_status'
        ? { kind: 'set_device_status', deviceId: devices[0]?.id ?? '', status: 'on' }
        : { kind: 'notify', message: '', type: 'info' },
    ]);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (actions.length === 0) {
      setError('Має бути хоча б одна дія');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = { name: name.trim(), triggerType, trigger, actions, isActive };
      if (initial) await updateScenario(initial.id, payload);
      else await createScenario(payload);
      onSaved();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={initial ? 'Редагувати сценарій' : 'Новий сценарій'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-5">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Назва *</span>
          <input
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="наприклад: Нічний режим — вимкнути світло"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </label>

        {/* Trigger */}
        <fieldset className="rounded border border-slate-200 p-3 space-y-3">
          <legend className="text-xs font-medium text-slate-600 px-1">Тригер</legend>
          <div className="flex flex-wrap gap-3">
            {(['manual', 'time', 'sensor'] as const).map((t) => (
              <label key={t} className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="triggerType"
                  checked={triggerType === t}
                  onChange={() => switchTriggerType(t)}
                />
                {t === 'manual' ? 'Вручну' : t === 'time' ? 'Час' : 'Сенсор'}
              </label>
            ))}
          </div>
          {trigger.kind === 'time' && (
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Година</span>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={trigger.hour}
                  onChange={(e) =>
                    setTrigger({ ...trigger, hour: Math.max(0, Math.min(23, Number(e.target.value))) })
                  }
                  className="w-16 rounded border border-slate-300 px-2 py-1.5"
                />
              </label>
              <label className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Хвилина</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={trigger.minute}
                  onChange={(e) =>
                    setTrigger({ ...trigger, minute: Math.max(0, Math.min(59, Number(e.target.value))) })
                  }
                  className="w-16 rounded border border-slate-300 px-2 py-1.5"
                />
              </label>
              <span className="text-xs text-slate-400">щодня в локальному часі</span>
            </div>
          )}
          {trigger.kind === 'sensor' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <label>
                <span className="block text-xs text-slate-500 mb-1">Пристрій *</span>
                <select
                  required
                  value={trigger.deviceId}
                  onChange={(e) => setTrigger({ ...trigger, deviceId: e.target.value })}
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2"
                >
                  {devices.length === 0 && <option value="">Немає пристроїв</option>}
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} · {d.room.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="block text-xs text-slate-500 mb-1">Метрика *</span>
                <select
                  value={trigger.metricType}
                  onChange={(e) =>
                    setTrigger({ ...trigger, metricType: e.target.value as MetricType })
                  }
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2"
                >
                  {METRIC_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label} ({m.unit})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="block text-xs text-slate-500 mb-1">Умова *</span>
                <select
                  value={trigger.condition}
                  onChange={(e) =>
                    setTrigger({ ...trigger, condition: e.target.value as AlertCondition })
                  }
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2"
                >
                  {CONDITION_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.symbol} — {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="block text-xs text-slate-500 mb-1">
                  Поріг * <span className="text-slate-400">({metricUnit(trigger.metricType)})</span>
                </span>
                <input
                  required
                  type="number"
                  step="any"
                  value={trigger.threshold}
                  onChange={(e) =>
                    setTrigger({ ...trigger, threshold: Number(e.target.value) })
                  }
                  className="w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <p className="sm:col-span-2 text-xs text-slate-500">
                Спрацює один раз, коли значення перетне поріг знизу-вгору (rising edge).
              </p>
            </div>
          )}
          {trigger.kind === 'manual' && (
            <p className="text-xs text-slate-500">
              Сценарій виконується тільки за кнопкою «Запустити» — корисно для разових сцен.
            </p>
          )}
        </fieldset>

        {/* Actions */}
        <fieldset className="rounded border border-slate-200 p-3 space-y-3">
          <legend className="text-xs font-medium text-slate-600 px-1">Дії</legend>
          {actions.length === 0 && (
            <p className="text-xs text-slate-500">Додайте хоча б одну дію.</p>
          )}
          <div className="space-y-2">
            {actions.map((a, idx) => (
              <ActionRow
                key={idx}
                action={a}
                devices={devices}
                onChange={(next) => updateAction(idx, next)}
                onRemove={() => removeAction(idx)}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => addAction('set_device_status')}
              className="text-xs rounded border border-slate-300 bg-white hover:bg-slate-50 px-2 py-1"
            >
              + Перемкнути пристрій
            </button>
            <button
              type="button"
              onClick={() => addAction('notify')}
              className="text-xs rounded border border-slate-300 bg-white hover:bg-slate-50 px-2 py-1"
            >
              + Сповіщення
            </button>
          </div>
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded border-slate-300"
          />
          <span>Активний (інакше — спрацює тільки за ручним запуском)</span>
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

function ActionRow({
  action,
  devices,
  onChange,
  onRemove,
}: {
  action: ScenarioAction;
  devices: Device[];
  onChange: (a: ScenarioAction) => void;
  onRemove: () => void;
}) {
  if (action.kind === 'set_device_status') {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm">
        <span className="text-xs text-slate-500 shrink-0">Пристрій:</span>
        <select
          value={action.deviceId}
          onChange={(e) => onChange({ ...action, deviceId: e.target.value })}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm min-w-[180px]"
        >
          {devices.length === 0 && <option value="">Немає пристроїв</option>}
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} · {d.room.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500">→</span>
        <select
          value={action.status}
          onChange={(e) => onChange({ ...action, status: e.target.value as DeviceStatus })}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
        >
          <option value="on">Увімкнути</option>
          <option value="off">Вимкнути</option>
        </select>
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto text-red-600 hover:text-red-700 text-sm px-2"
          title="Видалити дію"
        >
          ×
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm">
      <span className="text-xs text-slate-500 shrink-0">Сповіщення:</span>
      <input
        type="text"
        value={action.message}
        onChange={(e) => onChange({ ...action, message: e.target.value })}
        placeholder="Текст повідомлення"
        className="flex-1 min-w-[200px] rounded border border-slate-300 px-2 py-1"
      />
      <select
        value={action.type ?? 'info'}
        onChange={(e) =>
          onChange({ ...action, type: e.target.value as 'info' | 'warning' | 'alert' })
        }
        className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
      >
        <option value="info">Info</option>
        <option value="warning">Warning</option>
        <option value="alert">Alert</option>
      </select>
      <button
        type="button"
        onClick={onRemove}
        className="text-red-600 hover:text-red-700 text-sm px-2"
        title="Видалити дію"
      >
        ×
      </button>
    </div>
  );
}

function DeleteScenarioModal({
  target,
  onClose,
  onDeleted,
}: {
  target: Scenario;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setBusy(true);
    setError(null);
    try {
      await deleteScenario(target.id);
      onDeleted();
    } catch (e) {
      setError(extractError(e));
      setBusy(false);
    }
  }

  return (
    <ConfirmModal
      title="Видалити сценарій"
      busy={busy}
      onClose={onClose}
      onConfirm={onConfirm}
      message={
        <div className="space-y-2">
          <p>
            Видалити сценарій{' '}
            <span className="font-semibold text-slate-800">«{target.name}»</span>?
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
