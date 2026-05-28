import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BRAND_PALETTES,
  PRIMARY_PALETTES,
  useTheme,
  type BrandPalette,
  type PrimaryPalette,
} from '../theme/ThemeContext';
import { useAuth } from '../auth/AuthContext';
import {
  fetchEmulatorStatus,
  removeAvatar,
  startEmulator,
  stopEmulator,
  uploadAvatar,
  type EmulatorStatus,
} from '../api';
import { extractError } from '../ui/errors';
import { Avatar } from '../ui/Avatar';

export default function Settings() {
  const auth = useAuth();
  const isCustomer = auth.status === 'authenticated' && auth.user.role === 'user';
  return (
    <div className="p-8 space-y-6">
      <ProfileCard />
      {isCustomer && <EmulatorCard />}
      <ThemeCard />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic card primitives
// ---------------------------------------------------------------------------

function Card({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
      {children}
    </section>
  );
}

function CardHeader({
  title,
  description,
  right,
}: {
  title: string;
  description?: string;
  right?: ReactNode;
}) {
  return (
    <header className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}

function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={['p-6', className ?? ''].join(' ')}>{children}</div>;
}

function CardFooter({ children }: { children: ReactNode }) {
  return (
    <footer className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-500 flex items-center justify-between gap-3">
      {children}
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Profile card
// ---------------------------------------------------------------------------

function ProfileCard() {
  const auth = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (auth.status !== 'authenticated') return null;
  const user = auth.user;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await uploadAvatar(file);
      auth.setUser(updated);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    setError(null);
    try {
      const updated = await removeAvatar();
      auth.setUser(updated);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Профіль" description="Обліковий запис і фото профілю" />
      <CardBody>
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <Avatar
            url={user.avatarUrl}
            name={user.fullName}
            email={user.email}
            size="lg"
            className="ring-4 ring-brand-50"
          />
          <div className="flex-1 w-full">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Field label="Імʼя" value={user.fullName || '—'} />
              <Field label="Email" value={user.email} />
              <Field
                label="Роль"
                value={
                  <span
                    className={[
                      'inline-flex items-center text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full',
                      user.role === 'admin'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-brand-100 text-brand-700',
                    ].join(' ')}
                  >
                    {user.role}
                  </span>
                }
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-3 py-1.5"
              >
                {user.avatarUrl ? 'Замінити фото' : 'Завантажити фото'}
              </button>
              {user.avatarUrl && (
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={busy}
                  className="rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-700 text-sm font-medium px-3 py-1.5"
                >
                  Видалити
                </button>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={onPick}
                className="hidden"
              />
            </div>
            {error && (
              <div className="mt-3 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>
        </div>
      </CardBody>
      <CardFooter>
        <span>PNG / JPEG / WebP, до 2 МБ</span>
        <span className="hidden sm:inline">
          Аватар відображається біля кнопки виходу у верхній панелі
        </span>
      </CardFooter>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-medium text-slate-800 mt-0.5">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Emulator card
// ---------------------------------------------------------------------------

const INTERVAL_OPTIONS = [
  { value: 2000, label: '2 секунди' },
  { value: 5000, label: '5 секунд' },
  { value: 10000, label: '10 секунд' },
  { value: 30000, label: '30 секунд' },
  { value: 60000, label: '1 хвилина' },
];

function EmulatorCard() {
  const [status, setStatus] = useState<EmulatorStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intervalMs, setIntervalMs] = useState<number>(5000);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const s = await fetchEmulatorStatus();
        if (!cancelled) setStatus(s);
      } catch (e) {
        if (!cancelled) setError(extractError(e));
      }
    }
    void poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (status?.running) setIntervalMs(status.intervalMs);
  }, [status]);

  async function onStart() {
    setBusy(true);
    setError(null);
    try {
      const s = await startEmulator(intervalMs);
      setStatus(s);
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onStop() {
    setBusy(true);
    setError(null);
    try {
      const s = await stopEmulator();
      setStatus(s);
    } catch (e) {
      setError(extractError(e));
    } finally {
      setBusy(false);
    }
  }

  const running = status?.running === true;

  return (
    <Card>
      <CardHeader
        title="Емулятор пристроїв"
        description="Генерує реалістичну телеметрію для всіх ваших пристроїв"
        right={
          <span
            className={[
              'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
              running ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500',
            ].join(' ')}
          >
            <span
              className={[
                'inline-block w-2 h-2 rounded-full',
                running ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400',
              ].join(' ')}
              aria-hidden
            />
            {running ? 'Працює' : 'Зупинено'}
          </span>
        }
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="text-sm flex items-center gap-2">
            <span className="text-xs text-slate-500">Інтервал</span>
            <select
              value={intervalMs}
              onChange={(e) => setIntervalMs(Number(e.target.value))}
              disabled={busy}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm bg-white"
            >
              {INTERVAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {running ? (
            <button
              onClick={onStop}
              disabled={busy}
              className="rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 disabled:opacity-60"
            >
              Зупинити
            </button>
          ) : (
            <button
              onClick={onStart}
              disabled={busy}
              className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 disabled:opacity-60"
            >
              ▶ Запустити
            </button>
          )}
        </div>

        {running && status && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Пристроїв" value={status.deviceCount} />
            <Stat
              label="За тік"
              value={`${status.lastInserted}`}
              hint={`раз на ${status.intervalMs / 1000}с`}
            />
            <Stat
              label="Запущено"
              value={new Date(status.startedAt).toLocaleTimeString('uk-UA', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            />
            <Stat
              label="Останній тік"
              value={
                status.lastTickAt
                  ? new Date(status.lastTickAt).toLocaleTimeString('uk-UA', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : '—'
              }
            />
          </div>
        )}

        {error && (
          <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-semibold text-slate-800 mt-0.5">{value}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Theme card (accent + menu in one place)
// ---------------------------------------------------------------------------

function ThemeCard() {
  const { brand, primary, setBrand, setPrimary } = useTheme();
  return (
    <Card>
      <CardHeader title="Тема" description="Кольори інтерфейсу" />
      <CardBody className="space-y-6">
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Акцентний колір</h3>
              <p className="text-xs text-slate-500">
                Кнопки, посилання, активний пункт меню, графіки
              </p>
            </div>
            <span className="text-xs text-slate-400">обрано: {brand.label}</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {BRAND_PALETTES.map((p) => (
              <BrandSwatch
                key={p.key}
                palette={p}
                selected={p.key === brand.key}
                onClick={() => setBrand(p.key)}
              />
            ))}
          </div>
        </div>

        <div className="h-px bg-slate-100" />

        <div>
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Колір меню</h3>
              <p className="text-xs text-slate-500">Темна поверхня сайдбара і верхньої панелі</p>
            </div>
            <span className="text-xs text-slate-400">обрано: {primary.label}</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {PRIMARY_PALETTES.map((p) => (
              <PrimarySwatch
                key={p.key}
                palette={p}
                selected={p.key === primary.key}
                onClick={() => setPrimary(p.key)}
              />
            ))}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Theme swatches — compact pill style
// ---------------------------------------------------------------------------

function BrandSwatch({
  palette,
  selected,
  onClick,
}: {
  palette: BrandPalette;
  selected: boolean;
  onClick: () => void;
}) {
  const main = `rgb(${palette.shades[600]})`;
  const light = `rgb(${palette.shades[100]})`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        'group flex items-center gap-2.5 rounded-full border bg-white pl-1.5 pr-3 py-1.5 transition',
        selected
          ? 'border-brand-500 ring-2 ring-brand-500/30'
          : 'border-slate-200 hover:border-slate-300',
      ].join(' ')}
      title={palette.label}
    >
      <span
        className="inline-block w-7 h-7 rounded-full ring-1 ring-slate-200 shrink-0"
        style={{ background: `linear-gradient(135deg, ${light}, ${main})` }}
        aria-hidden
      />
      <span className="text-sm font-medium text-slate-700">{palette.label}</span>
      {selected && (
        <svg
          className="w-3.5 h-3.5 text-brand-600"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 6.5L5 9L9.5 3.5" />
        </svg>
      )}
    </button>
  );
}

function PrimarySwatch({
  palette,
  selected,
  onClick,
}: {
  palette: PrimaryPalette;
  selected: boolean;
  onClick: () => void;
}) {
  const c900 = `rgb(${palette.shades[900]})`;
  const c700 = `rgb(${palette.shades[700]})`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        'group flex items-center gap-2.5 rounded-full border bg-white pl-1.5 pr-3 py-1.5 transition',
        selected
          ? 'border-brand-500 ring-2 ring-brand-500/30'
          : 'border-slate-200 hover:border-slate-300',
      ].join(' ')}
      title={palette.label}
    >
      <span
        className="inline-block w-7 h-7 rounded-full ring-1 ring-slate-300 shrink-0"
        style={{ background: `linear-gradient(135deg, ${c700}, ${c900})` }}
        aria-hidden
      />
      <span className="text-sm font-medium text-slate-700">{palette.label}</span>
      <span
        className={[
          'text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full',
          palette.tone === 'light'
            ? 'bg-slate-100 text-slate-600'
            : 'bg-slate-800 text-slate-100',
        ].join(' ')}
      >
        {palette.tone === 'light' ? 'світла' : 'темна'}
      </span>
      {selected && (
        <svg
          className="w-3.5 h-3.5 text-brand-600"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 6.5L5 9L9.5 3.5" />
        </svg>
      )}
    </button>
  );
}
