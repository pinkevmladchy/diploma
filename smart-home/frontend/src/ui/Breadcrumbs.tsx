import { Link } from 'react-router-dom';

export type Crumb = { label: string; to?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="mb-4 text-sm text-slate-500" aria-label="breadcrumbs">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((c, idx) => (
          <li key={idx} className="flex items-center gap-1">
            {c.to ? (
              <Link to={c.to} className="hover:text-brand-600">
                {c.label}
              </Link>
            ) : (
              <span className="text-slate-700 font-medium">{c.label}</span>
            )}
            {idx < items.length - 1 && <span className="text-slate-300">/</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
