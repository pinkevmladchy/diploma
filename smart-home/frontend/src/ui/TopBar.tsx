import { useState } from 'react';
import { Link, matchPath, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { LogOutIcon, MenuIcon } from './icons';
import { Avatar } from './Avatar';

type TitleRule = { pattern: string; title: string };

// Order matters: more specific patterns first.
const RULES: TitleRule[] = [
  { pattern: '/dashboard', title: 'Головна сторінка' },
  { pattern: '/houses/:id', title: 'Будинки' },
  { pattern: '/houses', title: 'Будинки' },
  { pattern: '/rooms/:id', title: 'Кімнати' },
  { pattern: '/rooms', title: 'Кімнати' },
  { pattern: '/devices/:id', title: 'Пристрої' },
  { pattern: '/devices', title: 'Пристрої' },
  { pattern: '/analytics', title: 'Аналітика' },
  { pattern: '/telemetry-log', title: 'Лог телеметрії' },
  { pattern: '/scenarios', title: 'Сценарії' },
  { pattern: '/alerts', title: 'Сповіщення' },
  { pattern: '/settings', title: 'Налаштування' },
];

function pageTitle(pathname: string): string {
  for (const r of RULES) {
    if (matchPath(r.pattern, pathname)) return r.title;
  }
  return 'Smart Home';
}

type TopBarProps = {
  /** Fires when the user taps the hamburger on small screens. */
  onMenuClick?: () => void;
};

export function TopBar({ onMenuClick }: TopBarProps) {
  const location = useLocation();
  const auth = useAuth();
  const { primary } = useTheme();
  const title = pageTitle(location.pathname);
  const [logoutHover, setLogoutHover] = useState(false);

  const fg = `rgb(${primary.shades.fg})`;
  const fgMuted = `rgb(${primary.shades.fgMuted})`;
  const bg = `rgb(${primary.shades[900]})`;
  const bgPanel = `rgb(${primary.shades[800]})`;
  const bgHover = `rgb(${primary.shades[700]})`;
  const borderColor = `rgb(${primary.shades.border})`;

  return (
    <header
      className="border-b"
      style={{ backgroundColor: bg, borderColor, color: fg }}
    >
      <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {/* Hamburger — only on small screens */}
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Відкрити меню"
            className="md:hidden -ml-1 p-2 rounded hover:bg-white/10 shrink-0"
            style={{ color: fg }}
          >
            <MenuIcon className="w-5 h-5" />
          </button>
          <h1 className="text-base sm:text-lg font-semibold tracking-tight truncate">{title}</h1>
        </div>

        {auth.status === 'authenticated' && (
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Name + email — hidden below sm where there's no room */}
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium leading-tight" style={{ color: fg }}>
                {auth.user.fullName || auth.user.email}
              </div>
              <div className="text-[11px] leading-tight hidden md:block" style={{ color: fgMuted }}>
                {auth.user.email}
              </div>
            </div>
            <Link to="/settings" title="Профіль і налаштування" className="shrink-0">
              <Avatar
                url={auth.user.avatarUrl}
                name={auth.user.fullName}
                email={auth.user.email}
                size="sm"
              />
            </Link>
            <button
              onClick={auth.logout}
              onMouseEnter={() => setLogoutHover(true)}
              onMouseLeave={() => setLogoutHover(false)}
              style={{
                backgroundColor: logoutHover ? bgHover : bgPanel,
                color: logoutHover ? fg : fgMuted,
              }}
              className="inline-flex items-center gap-1.5 rounded text-xs font-medium px-2 sm:px-3 py-1.5 transition-colors"
              title="Вийти"
            >
              <LogOutIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Вийти</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
