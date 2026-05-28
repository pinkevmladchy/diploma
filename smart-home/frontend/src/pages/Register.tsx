import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Register() {
  const auth = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (auth.status === 'authenticated') {
    return <Navigate to="/dashboard" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Пароль має містити щонайменше 8 символів');
      return;
    }
    if (password !== passwordConfirm) {
      setError('Паролі не співпадають');
      return;
    }

    setSubmitting(true);
    try {
      await auth.register({ email: email.trim(), password, fullName: fullName.trim() });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (err as { message?: string })?.message ??
        'Помилка реєстрації';
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
          <h1 className="text-2xl font-semibold text-slate-800">Створити акаунт</h1>
          <p className="text-sm text-slate-500">Реєстрація в Smart Home</p>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-slate-600">Імʼя</span>
          <input
            type="text"
            required
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-600">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
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
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
          <span className="mt-1 block text-[11px] text-slate-400">Мінімум 8 символів</span>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-600">Підтвердьте пароль</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
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
          {submitting ? 'Створюю акаунт…' : 'Зареєструватися'}
        </button>

        <p className="text-xs text-slate-500 text-center">
          Вже маєте акаунт?{' '}
          <Link to="/login" className="text-brand-600 hover:text-brand-700 font-medium">
            Увійти
          </Link>
        </p>
      </form>
    </div>
  );
}
