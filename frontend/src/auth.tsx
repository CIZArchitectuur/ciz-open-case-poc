import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { InMemoryWebStorage, User, UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { setAccessTokenSupplier } from './api';

const manager = new UserManager({
  authority: import.meta.env.VITE_OIDC_AUTHORITY,
  client_id: import.meta.env.VITE_OIDC_CLIENT_ID,
  redirect_uri: import.meta.env.VITE_OIDC_REDIRECT_URI,
  post_logout_redirect_uri: import.meta.env.VITE_OIDC_POST_LOGOUT_REDIRECT_URI,
  response_type: 'code',
  scope: 'openid',
  userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }),
  stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
  automaticSilentRenew: false,
  monitorSession: false
});
let callbackPromise: Promise<User> | null = null;

type AuthValue = {
  user: User | null;
  ready: boolean;
  error: string;
  hasRole: (role: string) => boolean;
  signIn: (returnTo: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

function tokenRoles(user: User | null): string[] {
  if (!user?.access_token) return [];
  try {
    const encoded = user.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = encoded + '='.repeat((4 - encoded.length % 4) % 4);
    const claims = JSON.parse(window.atob(padded)) as Record<string, unknown>;
    const path: string[] = String(import.meta.env.VITE_OIDC_ROLE_CLAIM_PATH || 'ciz_roles').split(/[/.]/).filter(Boolean);
    const claim = path.reduce((value: unknown, part: string): unknown =>
      value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, claims);
    return Array.isArray(claim)
      ? claim.filter((role): role is string => typeof role === 'string')
      : [];
  } catch {
    return [];
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const updateUser = (next: User | null) => {
      if (mounted) setUser(next);
    };
    const updateUnloaded = () => updateUser(null);
    manager.events.addUserLoaded(updateUser);
    manager.events.addUserUnloaded(updateUnloaded);
    void (async () => {
      try {
        if (window.location.pathname === '/oidc/callback') {
          callbackPromise ??= manager.signinRedirectCallback();
          const callbackUser = await callbackPromise;
          const returnTo = typeof callbackUser.state === 'string' ? callbackUser.state : '/ciz-medewerker';
          window.history.replaceState(null, '', returnTo.startsWith('/') ? returnTo : '/ciz-medewerker');
          updateUser(callbackUser);
        } else {
          const currentUser = await manager.getUser();
          updateUser(currentUser && !currentUser.expired ? currentUser : null);
        }
      } catch {
        if (mounted) setError('Inloggen is niet gelukt. Probeer het opnieuw.');
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => {
      mounted = false;
      manager.events.removeUserLoaded(updateUser);
      manager.events.removeUserUnloaded(updateUnloaded);
    };
  }, []);

  setAccessTokenSupplier(() => user && !user.expired ? user.access_token : undefined);

  const value = useMemo<AuthValue>(() => ({
    user,
    ready,
    error,
    hasRole: role => tokenRoles(user).includes(role),
    signIn: async returnTo => {
      setError('');
      await manager.signinRedirect({ state: returnTo, extraQueryParams: { prompt: 'login' } });
    },
    signOut: async () => {
      await manager.signoutRedirect();
    }
  }), [user, ready, error]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider ontbreekt.');
  return value;
}
