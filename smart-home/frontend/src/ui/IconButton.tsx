import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Tone = 'default' | 'primary' | 'danger' | 'warning';

const tones: Record<Tone, string> = {
  default: 'text-slate-500 hover:text-slate-700 hover:bg-slate-100',
  primary: 'text-slate-500 hover:text-brand-600 hover:bg-brand-50',
  danger: 'text-slate-500 hover:text-red-600 hover:bg-red-50',
  warning: 'text-slate-500 hover:text-amber-600 hover:bg-amber-50',
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: ReactNode;
  tone?: Tone;
};

export function IconButton({
  label,
  icon,
  tone = 'default',
  className = '',
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      type={rest.type ?? 'button'}
      title={label}
      aria-label={label}
      className={`inline-flex items-center justify-center w-8 h-8 rounded transition-colors ${tones[tone]} ${className}`}
    >
      {icon}
    </button>
  );
}
