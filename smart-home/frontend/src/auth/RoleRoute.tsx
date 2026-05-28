import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

/**
 * Wraps a route to require a specific role. Anyone with a different role gets
 * redirected to their own landing page — preventing customers from poking at
 * the admin UI and vice versa.
 */
export function RoleRoute({
  role,
  children,
}: {
  role: 'admin' | 'user';
  children: React.ReactNode;
}) {
  const auth = useAuth();
  if (auth.status !== 'authenticated') return null; // ProtectedRoute handles loading/guest
  if (auth.user.role !== role) {
    const fallback = auth.user.role === 'admin' ? '/admin/customers' : '/dashboard';
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
}
