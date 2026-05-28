import { useEffect, useMemo, useState } from 'react';

type Props = {
  page: number;
  totalPages: number;
  start: number; // 1-based index of first visible row
  end: number; // 1-based inclusive index of last visible row
  total: number;
  onChange: (page: number) => void;
};

export function Pagination({ page, totalPages, start, end, total, onChange }: Props) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 bg-slate-50 text-xs shrink-0">
      <span className="text-slate-500">
        {start}–{end} з {total}
      </span>
      <div className="flex items-center gap-1 text-slate-700">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          aria-label="Попередня сторінка"
          className="rounded px-2 py-1 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          ‹
        </button>
        <span className="px-2 font-medium">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          aria-label="Наступна сторінка"
          className="rounded px-2 py-1 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          ›
        </button>
      </div>
    </div>
  );
}

type PaginationState<T> = {
  page: number;
  setPage: (p: number) => void;
  totalPages: number;
  visible: T[];
  start: number;
  end: number;
  total: number;
  pageSize: number;
};

/**
 * Client-side pagination for an in-memory list.
 *
 * Resets to page 1 only when the current page exceeds the new total (e.g. data shrunk).
 * Users navigating to a stable page on a growing list keep their position.
 */
export function usePagination<T>(items: T[], pageSize = 10): PaginationState<T> {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const visible = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const start = items.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, items.length);

  return { page, setPage, totalPages, visible, start, end, total: items.length, pageSize };
}
