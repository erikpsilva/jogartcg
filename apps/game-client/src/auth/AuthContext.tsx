import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { getSession, loginUser, logoutUser, type AuthUser } from '../services/auth-api';

interface AuthContextValue {
  user: AuthUser | null;
  csrfToken: string;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [csrfToken, setCsrfToken] = useState('');
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const session = await getSession();
    setUser(session.user);
    setCsrfToken(session.csrf_token);
  }

  useEffect(() => {
    refresh().catch(() => { setUser(null); setCsrfToken(''); }).finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const session = await loginUser(email, password);
    setUser(session.user);
    setCsrfToken(session.csrf_token);
  }

  async function logout() {
    await logoutUser(csrfToken);
    setUser(null);
    setCsrfToken('');
  }

  const value = useMemo(() => ({ user, csrfToken, loading, login, logout, refresh }), [user, csrfToken, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth precisa estar dentro de AuthProvider.');
  return value;
}

