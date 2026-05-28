import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const baseProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function PencilIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
      <path d="M16.862 4.487 19.5 7.125" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M14.74 9l-.346 9m-4.788 0L9.26 9" />
      <path d="M18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.1 48.1 0 0 0-3.478-.397M4.772 5.79c.34-.059.68-.114 1.022-.165m0 0a48.1 48.1 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a52 52 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.7 48.7 0 0 0-7.5 0" />
    </svg>
  );
}

export function PowerIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M5.636 5.636a9 9 0 1 0 12.728 0" />
      <path d="M12 3v9" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Device-type icons
// ---------------------------------------------------------------------------

export function ThermometerIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M14 4a2 2 0 1 0-4 0v10.5a4 4 0 1 0 4 0V4Z" />
      <path d="M12 17a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function LampIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M6 11a6 6 0 1 1 12 0c0 2-1 3.5-2.5 4.5l-.5 2.5h-6l-.5-2.5C7 14.5 6 13 6 11Z" />
    </svg>
  );
}

export function MotionIcon(props: IconProps) {
  // Stylised walking person
  return (
    <svg {...baseProps} {...props}>
      <circle cx="13" cy="4.5" r="1.75" />
      <path d="M9 21l2-6 3 2 1.5 4" />
      <path d="M11 15l-1-4 4-2 2 3 3 1" />
    </svg>
  );
}

export function BoltIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M13 3 4 14h7l-1 7 9-11h-7l1-7Z" />
    </svg>
  );
}

export function WindIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M3 8h11a3 3 0 1 0-3-3" />
      <path d="M3 12h17a3 3 0 1 1-3 3" />
      <path d="M3 16h9a3 3 0 1 1-3 3" />
    </svg>
  );
}

export function WaterDropIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />
    </svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function CubeIcon(props: IconProps) {
  // Fallback for unknown device types
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" />
      <path d="M4 7l8 4 8-4" />
      <path d="M12 11v10" />
    </svg>
  );
}
