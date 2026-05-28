import { AGG_FUNCTIONS, AGG_INTERVALS, type AggFn, type AggInterval } from './aggregation';

type Props = {
  fn: AggFn;
  interval: AggInterval;
  onFnChange: (fn: AggFn) => void;
  onIntervalChange: (interval: AggInterval) => void;
  /** When true, function picker is locked to `count` (used for binary metrics). */
  binary?: boolean;
  className?: string;
};

export function AggregationToolbar({
  fn,
  interval,
  onFnChange,
  onIntervalChange,
  binary = false,
  className,
}: Props) {
  return (
    <div className={['flex items-center gap-2', className ?? ''].join(' ')}>
      <span className="text-xs text-slate-500">Агрегація:</span>
      <select
        value={fn}
        onChange={(e) => onFnChange(e.target.value as AggFn)}
        disabled={binary}
        title={binary ? 'Для бінарних метрик доступна лише функція «Кількість»' : undefined}
        className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-500"
      >
        {AGG_FUNCTIONS.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </select>
      <select
        value={interval}
        onChange={(e) => onIntervalChange(e.target.value as AggInterval)}
        className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
      >
        {AGG_INTERVALS.map((i) => (
          <option key={i.key} value={i.key}>
            {i.label}
          </option>
        ))}
      </select>
    </div>
  );
}
