import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { updateThemePreference } from '../api';
import { useAuth } from '../auth/AuthContext';

// ---------------------------------------------------------------------------
// Brand (accent) palette — buttons, active nav, links.
// ---------------------------------------------------------------------------

export type BrandShades = {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
};

export type BrandPalette = {
  key: string;
  label: string;
  shades: BrandShades;
};

export const BRAND_PALETTES: BrandPalette[] = [
  {
    key: 'blue',
    label: 'Синій',
    shades: {
      50: '239 246 255',
      100: '219 234 254',
      200: '191 219 254',
      300: '147 197 253',
      400: '96 165 250',
      500: '59 130 246',
      600: '37 99 235',
      700: '29 78 216',
      800: '30 64 175',
    },
  },
  {
    key: 'emerald',
    label: 'Смарагдовий',
    shades: {
      50: '236 253 245',
      100: '209 250 229',
      200: '167 243 208',
      300: '110 231 183',
      400: '52 211 153',
      500: '16 185 129',
      600: '5 150 105',
      700: '4 120 87',
      800: '6 95 70',
    },
  },
  {
    key: 'violet',
    label: 'Фіолетовий',
    shades: {
      50: '245 243 255',
      100: '237 233 254',
      200: '221 214 254',
      300: '196 181 253',
      400: '167 139 250',
      500: '139 92 246',
      600: '124 58 237',
      700: '109 40 217',
      800: '91 33 182',
    },
  },
  {
    key: 'amber',
    label: 'Бурштиновий',
    shades: {
      50: '255 251 235',
      100: '254 243 199',
      200: '253 230 138',
      300: '252 211 77',
      400: '251 191 36',
      500: '245 158 11',
      600: '217 119 6',
      700: '180 83 9',
      800: '146 64 14',
    },
  },
  {
    key: 'rose',
    label: 'Рожевий',
    shades: {
      50: '255 241 242',
      100: '255 228 230',
      200: '254 205 211',
      300: '253 164 175',
      400: '251 113 133',
      500: '244 63 94',
      600: '225 29 72',
      700: '190 18 60',
      800: '159 18 57',
    },
  },
];

// ---------------------------------------------------------------------------
// Primary palette — sidebar + top bar surfaces. Each palette carries its own
// text colors so Sidebar/TopBar render readably on light *and* dark surfaces.
// ---------------------------------------------------------------------------

export type PrimaryShades = {
  /** Hover background — slightly lighter than 800 on dark, slightly darker on light. */
  700: string;
  /** Secondary surface — borders, sub-panels, hover on top bar. */
  800: string;
  /** Main surface — sidebar and top bar background. */
  900: string;
  /** Primary text color on those surfaces. */
  fg: string;
  /** Muted/secondary text color. */
  fgMuted: string;
  /** Hairline border color. */
  border: string;
};

export type PrimaryPalette = {
  key: string;
  label: string;
  /** Visual hint for the Settings picker. */
  tone: 'dark' | 'light';
  shades: PrimaryShades;
};

export const PRIMARY_PALETTES: PrimaryPalette[] = [
  // ───── Dark variants ─────────────────────────────────────────────
  {
    key: 'slate',
    label: 'Графіт',
    tone: 'dark',
    shades: {
      700: '51 65 85',
      800: '30 41 59',
      900: '15 23 42',
      fg: '226 232 240', // slate-200
      fgMuted: '148 163 184', // slate-400
      border: '30 41 59', // slate-800
    },
  },
  {
    key: 'zinc',
    label: 'Цинк',
    tone: 'dark',
    shades: {
      700: '63 63 70',
      800: '39 39 42',
      900: '24 24 27',
      fg: '228 228 231', // zinc-200
      fgMuted: '161 161 170', // zinc-400
      border: '39 39 42', // zinc-800
    },
  },
  {
    key: 'stone',
    label: 'Камінь',
    tone: 'dark',
    shades: {
      700: '68 64 60',
      800: '41 37 36',
      900: '28 25 23',
      fg: '231 229 228', // stone-200
      fgMuted: '168 162 158', // stone-400
      border: '41 37 36',
    },
  },
  {
    key: 'midnight',
    label: 'Опівнічний',
    tone: 'dark',
    shades: {
      700: '30 41 99',
      800: '23 27 71',
      900: '15 17 51',
      fg: '224 231 255', // indigo-100
      fgMuted: '165 180 252', // indigo-300
      border: '23 27 71',
    },
  },
  {
    key: 'forest',
    label: 'Темно-зелений',
    tone: 'dark',
    shades: {
      700: '21 78 64',
      800: '15 60 50',
      900: '10 42 35',
      fg: '209 250 229', // emerald-100
      fgMuted: '110 231 183', // emerald-300
      border: '15 60 50',
    },
  },

  // ───── Light variants ────────────────────────────────────────────
  {
    key: 'snow',
    label: 'Сніговий',
    tone: 'light',
    shades: {
      700: '203 213 225', // slate-300 — hover bg
      800: '226 232 240', // slate-200 — borders/sub-bg
      900: '248 250 252', // slate-50 — main bg
      fg: '15 23 42', // slate-900
      fgMuted: '100 116 139', // slate-500
      border: '226 232 240', // slate-200
    },
  },
  {
    key: 'cream',
    label: 'Кремовий',
    tone: 'light',
    shades: {
      700: '231 229 228', // stone-200
      800: '245 245 244', // stone-100
      900: '254 252 232', // yellow-50 (soft cream)
      fg: '41 37 36', // stone-800
      fgMuted: '120 113 108', // stone-500
      border: '231 229 228',
    },
  },
  {
    key: 'sky',
    label: 'Світло-блакитний',
    tone: 'light',
    shades: {
      700: '186 230 253', // sky-200
      800: '224 242 254', // sky-100
      900: '240 249 255', // sky-50
      fg: '12 74 110', // sky-900
      fgMuted: '14 116 144', // sky-700
      border: '186 230 253',
    },
  },
  {
    key: 'lavender',
    label: 'Лавандовий',
    tone: 'light',
    shades: {
      700: '221 214 254', // violet-200
      800: '237 233 254', // violet-100
      900: '245 243 255', // violet-50
      fg: '76 29 149', // violet-900
      fgMuted: '109 40 217', // violet-700
      border: '221 214 254',
    },
  },
];

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const BRAND_KEY = 'sh.theme.paletteKey';
const PRIMARY_KEY = 'sh.theme.primaryKey';
const DEFAULT_BRAND = 'blue';
const DEFAULT_PRIMARY = 'slate';

function applyBrand(p: BrandPalette) {
  const root = document.documentElement;
  for (const [shade, rgb] of Object.entries(p.shades)) {
    root.style.setProperty(`--color-brand-${shade}`, rgb);
  }
}

function applyPrimary(p: PrimaryPalette) {
  const root = document.documentElement;
  root.style.setProperty('--color-primary-700', p.shades[700]);
  root.style.setProperty('--color-primary-800', p.shades[800]);
  root.style.setProperty('--color-primary-900', p.shades[900]);
  root.style.setProperty('--color-primary-fg', p.shades.fg);
  root.style.setProperty('--color-primary-fg-muted', p.shades.fgMuted);
  root.style.setProperty('--color-primary-border', p.shades.border);
}

function getInitialBrand(): BrandPalette {
  try {
    const key = localStorage.getItem(BRAND_KEY) ?? DEFAULT_BRAND;
    return BRAND_PALETTES.find((p) => p.key === key) ?? BRAND_PALETTES[0];
  } catch {
    return BRAND_PALETTES[0];
  }
}

function getInitialPrimary(): PrimaryPalette {
  try {
    const key = localStorage.getItem(PRIMARY_KEY) ?? DEFAULT_PRIMARY;
    return PRIMARY_PALETTES.find((p) => p.key === key) ?? PRIMARY_PALETTES[0];
  } catch {
    return PRIMARY_PALETTES[0];
  }
}

type ThemeContextValue = {
  brand: BrandPalette;
  primary: PrimaryPalette;
  setBrand: (key: string) => void;
  setPrimary: (key: string) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function findBrand(key: string | null | undefined): BrandPalette | null {
  if (!key) return null;
  return BRAND_PALETTES.find((p) => p.key === key) ?? null;
}

function findPrimary(key: string | null | undefined): PrimaryPalette | null {
  if (!key) return null;
  return PRIMARY_PALETTES.find((p) => p.key === key) ?? null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  // localStorage acts as a per-browser cache so the first paint isn't ugly
  // before /auth/me resolves; on user load we override with their saved prefs.
  const [brand, setBrandState] = useState<BrandPalette>(getInitialBrand);
  const [primary, setPrimaryState] = useState<PrimaryPalette>(getInitialPrimary);
  const [lastUserId, setLastUserId] = useState<string | null>(null);

  useEffect(() => {
    applyBrand(brand);
    localStorage.setItem(BRAND_KEY, brand.key);
  }, [brand]);

  useEffect(() => {
    applyPrimary(primary);
    localStorage.setItem(PRIMARY_KEY, primary.key);
  }, [primary]);

  // When the active user changes (login, logout, or impersonation swap), apply
  // their saved theme. We track the previous user id to avoid stomping on a
  // theme the user just clicked locally — the effect only fires on a switch.
  useEffect(() => {
    if (auth.status !== 'authenticated') {
      setLastUserId(null);
      return;
    }
    if (lastUserId === auth.user.id) return;
    setLastUserId(auth.user.id);

    const userBrand = findBrand(auth.user.themeBrand);
    const userPrimary = findPrimary(auth.user.themePrimary);
    if (userBrand) setBrandState(userBrand);
    if (userPrimary) setPrimaryState(userPrimary);
  }, [auth, lastUserId]);

  const persist = useCallback(
    (input: { brand?: string; primary?: string }) => {
      if (auth.status !== 'authenticated') return;
      // Reflect the change locally on the user object so subsequent reloads
      // (and the per-user effect above) see the new prefs without a refetch.
      auth.setUser({
        ...auth.user,
        themeBrand: input.brand ?? auth.user.themeBrand,
        themePrimary: input.primary ?? auth.user.themePrimary,
      });
      // Fire-and-forget; if the network blip happens, localStorage still keeps
      // the choice for the current session.
      void updateThemePreference(input).catch(() => {});
    },
    [auth],
  );

  const setBrand = useCallback(
    (key: string) => {
      const next = BRAND_PALETTES.find((p) => p.key === key);
      if (!next) return;
      setBrandState(next);
      persist({ brand: key });
    },
    [persist],
  );

  const setPrimary = useCallback(
    (key: string) => {
      const next = PRIMARY_PALETTES.find((p) => p.key === key);
      if (!next) return;
      setPrimaryState(next);
      persist({ primary: key });
    },
    [persist],
  );

  const value = useMemo(
    () => ({ brand, primary, setBrand, setPrimary }),
    [brand, primary, setBrand, setPrimary],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
