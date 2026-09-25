import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { getSession, loginUser, logoutUser, type AuthUser } from '../services/auth-api';
import { apiUrl } from '../config/api';

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
  useEffect(()=>{
    if(!user||!csrfToken)return;
    let active=true,lastDate='';
    const visit=async()=>{
      if(document.hidden)return;
      const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
      if(lastDate===date)return;
      try{
        const response=await fetch(apiUrl('/shop/rewards/visit'),{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},body:'{}'});
        if(response.ok&&active){lastDate=date;window.dispatchEvent(new Event('wallet-updated'));window.dispatchEvent(new Event('rewards-updated'));}
      }catch{/* Retry on focus or the next minute without breaking authentication. */}
    };
    void visit();const timer=window.setInterval(()=>void visit(),60000);
    window.addEventListener('focus',visit);document.addEventListener('visibilitychange',visit);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',visit);document.removeEventListener('visibilitychange',visit);};
  },[user?.id,csrfToken]);

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
