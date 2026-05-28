import { useEffect, useState } from 'react';

type Size = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<Size, string> = {
  xs: 'w-7 h-7 text-[10px]',
  sm: 'w-9 h-9 text-xs',
  md: 'w-12 h-12 text-sm',
  lg: 'w-24 h-24 text-2xl',
};

function initials(name: string | undefined, email: string | undefined): string {
  const source = name?.trim() || email || '';
  if (!source) return '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

type Props = {
  url: string | null | undefined;
  name?: string;
  email?: string;
  size?: Size;
  className?: string;
};

/**
 * User avatar — renders the uploaded image when available, otherwise a colored
 * circle with the user's initials. Falls back gracefully if the image fails to
 * load (e.g. file removed on disk).
 */
export function Avatar({ url, name, email, size = 'sm', className }: Props) {
  const [errored, setErrored] = useState(false);
  // Reset the error state when the URL changes — otherwise a successful new
  // upload after a broken one would never re-attempt the image load.
  useEffect(() => {
    setErrored(false);
  }, [url]);

  const cls = [
    'inline-flex items-center justify-center rounded-full font-semibold shrink-0 select-none overflow-hidden',
    SIZE_CLASSES[size],
    'bg-brand-600 text-white ring-1 ring-white/20',
    className ?? '',
  ].join(' ');

  const showImage = url && !errored;
  return (
    <span className={cls} aria-label={name || email || 'avatar'}>
      {showImage ? (
        <img
          src={url!}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        initials(name, email)
      )}
    </span>
  );
}
