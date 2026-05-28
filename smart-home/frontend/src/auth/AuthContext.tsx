import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  fetchMe,
  impersonateCustomer,
  login as apiLogin,
  register as apiRegister,
  setUnauthorizedHandler,
  tokenStore,
  type User,
} from '../api';

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: User }
  | { status: 'guest'; user: null };

type AuthContextValue = AuthState & {
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; fullName: string }) => Promise<void>;
  logout: () => void;
  /** Replace the cached user (e.g. after profile edits or avatar upload). */
  setUser: (user: User) => void;
  /** Admin-only: temporarily become the given customer; keeps admin tokens stashed. */
  impersonate: (customerId: string) => Promise<User>;
  /** Restore the admin session from the impersonator stash. */
  stopImpersonating: () => Promise<void>;
  /** True when an admin token is stashed (we're currently in someone else's shoes). */
  isImpersonating: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() =>
    tokenStore.getAccess() ? { status: 'loading', user: null } : { status: 'guest', user: null },
  );

  const logout = useCallback(() => {
    tokenStore.clear();
    // Discard any stashed impersonator session too — full logout means fully gone.
    tokenStore.popImpersonator();
    tokenStore.clear();
    setState({ status: 'guest', user: null });
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setState({ status: 'guest', user: null }));
  }, []);

  useEffect(() => {
    if (state.status !== 'loading') return;
    let cancelled = false;
    fetchMe()
      .then((user) => {
        if (!cancelled) setState({ status: 'authenticated', user });
      })
      .catch(() => {
        if (!cancelled) {
          tokenStore.clear();
          setState({ status: 'guest', user: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [state.status]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    tokenStore.set(res.accessToken, res.refreshToken);
    setState({ status: 'authenticated', user: res.user });
  }, []);

  const register = useCallback(
    async (input: { email: string; password: string; fullName: string }) => {
      const res = await apiRegister(input);
      tokenStore.set(res.accessToken, res.refreshToken);
      setState({ status: 'authenticated', user: res.user });
    },
    [],
  );

  const setUser = useCallback((user: User) => {
    setState({ status: 'authenticated', user });
  }, []);

  const [isImpersonating, setIsImpersonating] = useState<boolean>(() =>
    tokenStore.hasImpersonator(),
  );

  const impersonate = useCallback(async (customerId: string): Promise<User> => {
    const res = await impersonateCustomer(customerId);
    // Save the admin's current tokens so they can come back.
    tokenStore.stashAsImpersonator();
    tokenStore.set(res.accessToken, res.refreshToken);
    setState({ status: 'authenticated', user: res.user });
    setIsImpersonating(true);
    return res.user;
  }, []);

  const stopImpersonating = useCallback(async () => {
    const restored = tokenStore.popImpersonator();
    if (!restored) return;
    setIsImpersonating(false);
    // Re-hydrate the admin user from /auth/me with the restored token.
    setState({ status: 'loading', user: null });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      register,
      logout,
      setUser,
      impersonate,
      stopImpersonating,
      isImpersonating,
    }),
    [state, login, register, logout, setUser, impersonate, stopImpersonating, isImpersonating],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
