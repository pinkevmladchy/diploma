type Props = {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
};

export function PageHeader({ title, subtitle, right }: Props) {
  return (
    <header className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
      <div className="min-w-0">
        {title && <h2 className="text-xl sm:text-2xl font-semibold text-slate-800">{title}</h2>}
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0 flex flex-wrap items-end gap-3">{right}</div>}
    </header>
  );
}
