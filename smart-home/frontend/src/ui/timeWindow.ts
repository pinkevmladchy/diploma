export type TimeWindowKey = '15m' | '1h' | '6h' | '24h' | '7d' | '30d' | 'all';

export type TimeWindow = {
  key: TimeWindowKey;
  label: string;
  /** Window length in ms. `null` means «no lower bound» (all data). */
  durationMs: number | null;
  /** Max points fetched. */
  limit: number;
};

export const TIME_WINDOWS: TimeWindow[] = [
  { key: '15m', label: 'Останні 15 хв', durationMs: 15 * 60_000, limit: 200 },
  { key: '1h', label: 'Остання година', durationMs: 60 * 60_000, limit: 200 },
  { key: '6h', label: 'Останні 6 годин', durationMs: 6 * 60 * 60_000, limit: 500 },
  { key: '24h', label: 'Останні 24 години', durationMs: 24 * 60 * 60_000, limit: 500 },
  { key: '7d', label: 'Останні 7 днів', durationMs: 7 * 24 * 60 * 60_000, limit: 1000 },
  { key: '30d', label: 'Останні 30 днів', durationMs: 30 * 24 * 60 * 60_000, limit: 1000 },
  { key: 'all', label: 'Усі дані', durationMs: null, limit: 1000 },
];

export const DEFAULT_WINDOW: TimeWindowKey = '1h';

export function getWindow(key: TimeWindowKey): TimeWindow {
  return TIME_WINDOWS.find((w) => w.key === key) ?? TIME_WINDOWS[0];
}
