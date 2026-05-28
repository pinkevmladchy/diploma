import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

type LocationState = { from?: string } | null;

export default function Login() {
  const auth = useAuth();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (auth.status === 'authenticated') {
    // Pull saved redirect target, but only honor it if the user has access to
    // it. Different roles land on different default pages.
    const saved = (location.state as LocationState)?.from;
    const fallback = auth.user.role === 'admin' ? '/admin/customers' : '/dashboard';
    const target = saved && saved !== '/login' ? saved : fallback;
    return <Navigate to={target} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await auth.login(email.trim(), password);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } }; message?: string })?.response?.data
          ?.error ??
        (err as { message?: string })?.message ??
        'Помилка входу';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-100">
      <form
        onSubmit={onSubmit}
        className="bg-white rounded-lg shadow-md border border-slate-200 p-8 w-full max-w-sm space-y-5"
      >
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Smart Home</h1>
          <p className="text-sm text-slate-500">Увійдіть, щоб продовжити</p>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-slate-600">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-600">Пароль</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </label>

        {error && (
          <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-brand-600 hover:bg-brand-700 text-white font-medium py-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? 'Входжу…' : 'Увійти'}
        </button>

        <p className="text-xs text-slate-500 text-center">
          Немає акаунту?{' '}
          <Link to="/register" className="text-brand-600 hover:text-brand-700 font-medium">
            Зареєструватися
          </Link>
        </p>
        <p className="text-[11px] text-slate-400 text-center">
          Тестовий вхід: <code>admin@smart-home.local</code> / <code>admin12345</code>
        </p>
      </form>
    </div>
  );
}
