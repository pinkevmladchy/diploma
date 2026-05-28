import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

/**
 * Yellow banner shown across the whole app while an admin is impersonating a
 * customer. Click "Повернутись" to swap tokens back to the admin session.
 */
export function ImpersonationBanner() {
  const auth = useAuth();
  const navigate = useNavigate();

  if (!auth.isImpersonating || auth.status !== 'authenticated') return null;

  async function onReturn() {
    await auth.stopImpersonating();
    navigate('/admin/customers', { replace: true });
  }

  return (
    <div className="shrink-0 bg-amber-100 border-b border-amber-300 text-amber-900 px-6 py-2 flex items-center justify-between gap-3 text-sm">
      <div>
        <span className="font-semibold">Адмін-режим:</span> ви зараз переглядаєте як{' '}
        <span className="font-semibold">{auth.user.fullName}</span> ({auth.user.email}).
      </div>
      <button
        onClick={onReturn}
        className="rounded bg-amber-900 hover:bg-amber-950 text-amber-50 text-xs font-medium px-3 py-1.5"
      >
        Повернутись до адміна
      </button>
    </div>
  );
}
