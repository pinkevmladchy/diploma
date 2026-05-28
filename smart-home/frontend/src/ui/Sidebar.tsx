import { useEffect, useState, type CSSProperties } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { CloseIcon } from './icons';

type LeafItem = { kind: 'leaf'; to: string; label: string };
type GroupItem = { kind: 'group'; key: string; label: string; items: LeafItem[] };
type NavItem = LeafItem | GroupItem;

const customerNav: NavItem[] = [
  { kind: 'leaf', to: '/dashboard', label: 'Головна сторінка' },
  {
    kind: 'group',
    key: 'manage',
    label: 'Управління',
    items: [
      { kind: 'leaf', to: '/houses', label: 'Будинки' },
      { kind: 'leaf', to: '/rooms', label: 'Кімнати' },
      { kind: 'leaf', to: '/devices', label: 'Пристрої' },
    ],
  },
  { kind: 'leaf', to: '/analytics', label: 'Аналітика' },
  { kind: 'leaf', to: '/telemetry-log', label: 'Лог телеметрії' },
  { kind: 'leaf', to: '/scenarios', label: 'Сценарії' },
  { kind: 'leaf', to: '/alerts', label: 'Сповіщення' },
  { kind: 'leaf', to: '/settings', label: 'Налаштування' },
];

const adminNav: NavItem[] = [
  { kind: 'leaf', to: '/admin/customers', label: 'Користувачі' },
  { kind: 'leaf', to: '/settings', label: 'Налаштування' },
];

const STORAGE_KEY = 'sh.sidebar.openGroups';

function loadOpenGroups(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function groupContainsActive(group: GroupItem, pathname: string): boolean {
  return group.items.some((i) => pathname === i.to || pathname.startsWith(i.to + '/'));
}

type SidebarProps = {
  /** When true on small screens the drawer is shown. Desktop ignores it. */
  open?: boolean;
  /** Fires when the user taps the backdrop or close button. */
  onClose?: () => void;
};

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const location = useLocation();
  const auth = useAuth();
  const isAdmin = auth.status === 'authenticated' && auth.user.role === 'admin';
  const nav = isAdmin ? adminNav : customerNav;
  const { primary } = useTheme();
  const fg = `rgb(${primary.shades.fg})`;
  const fgMuted = `rgb(${primary.shades.fgMuted})`;
  const bg = `rgb(${primary.shades[900]})`;
  const bgHover = `rgb(${primary.shades[800]})`;
  const borderColor = `rgb(${primary.shades.border})`;

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(loadOpenGroups);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  // Auto-open a group when navigation lands on one of its sub-items.
  useEffect(() => {
    setOpenGroups((prev) => {
      let next = prev;
      for (const item of nav) {
        if (item.kind === 'group' && groupContainsActive(item, location.pathname) && !prev[item.key]) {
          next = { ...next, [item.key]: true };
        }
      }
      return next;
    });
  }, [location.pathname]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(openGroups));
  }, [openGroups]);

  function toggle(key: string) {
    setOpenGroups((p) => ({ ...p, [key]: !p[key] }));
  }

  /**
   * Computes the inline style for a non-active nav row. When the row is active
   * we return `undefined` so the `.bg-brand-600 .text-white` Tailwind classes
   * win — passing any inline `color`/`backgroundColor` would override them.
   */
  function rowStyle(isActive: boolean, isHovered: boolean): CSSProperties | undefined {
    if (isActive) return undefined;
    return isHovered
      ? { color: fg, backgroundColor: bgHover }
      : { color: fgMuted };
  }

  return (
    <>
      {/* Mobile backdrop — only rendered when the drawer is open on <md. */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={[
          'shrink-0 flex flex-col z-50',
          // Desktop: stays in-flow, fixed width, no transform
          'md:static md:translate-x-0 md:w-60',
          // Mobile: fixed full-height drawer that slides in from the left
          'fixed inset-y-0 left-0 w-64 transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        ].join(' ')}
        style={{ backgroundColor: bg, color: fg }}
      >
        <div className="px-5 py-5 border-b flex items-start justify-between" style={{ borderColor }}>
          <div>
            <div className="text-lg font-semibold">Smart Home</div>
            <div className="text-xs" style={{ color: fgMuted }}>
              {isAdmin ? 'Адмін-панель' : 'Дипломна робота'}
            </div>
          </div>
          {/* Close button — only visible on the mobile drawer */}
          <button
            type="button"
            onClick={onClose}
            className="md:hidden -mr-1 p-1 rounded hover:bg-white/10"
            aria-label="Закрити меню"
            style={{ color: fgMuted }}
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

      <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
        {nav.map((item) => {
          if (item.kind === 'leaf') {
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onMouseEnter={() => setHoveredKey(item.to)}
                onMouseLeave={() => setHoveredKey((prev) => (prev === item.to ? null : prev))}
                className={({ isActive }) =>
                  [
                    'block px-3 py-2 rounded text-sm transition-colors',
                    isActive ? 'bg-brand-600 text-white' : '',
                  ].join(' ')
                }
                style={({ isActive }) => rowStyle(isActive, hoveredKey === item.to)}
              >
                {item.label}
              </NavLink>
            );
          }
          const groupOpen = !!openGroups[item.key] || groupContainsActive(item, location.pathname);
          const groupHovered = hoveredKey === `g:${item.key}`;
          return (
            <div key={item.key}>
              <button
                onClick={() => toggle(item.key)}
                aria-expanded={groupOpen}
                onMouseEnter={() => setHoveredKey(`g:${item.key}`)}
                onMouseLeave={() =>
                  setHoveredKey((prev) => (prev === `g:${item.key}` ? null : prev))
                }
                style={rowStyle(false, groupHovered)}
                className="w-full flex items-center justify-between px-3 py-2 rounded text-sm transition-colors"
              >
                <span>{item.label}</span>
                <svg
                  className={`w-3 h-3 transition-transform ${groupOpen ? 'rotate-180' : ''}`}
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 4.5L6 7.5L9 4.5" />
                </svg>
              </button>
              {groupOpen && (
                <div className="mt-1 space-y-0.5">
                  {item.items.map((sub) => (
                    <NavLink
                      key={sub.to}
                      to={sub.to}
                      onMouseEnter={() => setHoveredKey(sub.to)}
                      onMouseLeave={() =>
                        setHoveredKey((prev) => (prev === sub.to ? null : prev))
                      }
                      className={({ isActive }) =>
                        [
                          'block pl-9 pr-3 py-1.5 rounded text-sm transition-colors',
                          isActive ? 'bg-brand-600 text-white' : '',
                        ].join(' ')
                      }
                      style={({ isActive }) => rowStyle(isActive, hoveredKey === sub.to)}
                    >
                      {sub.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      </aside>
    </>
  );
}
