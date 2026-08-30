import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, postJson } from '@/lib/api-client';
import type { Session } from '@/app/types';
import { normalizeAccentKey } from '@/lib/theme';

interface SessionContextValue {
  session: Session | null;
  checking: boolean;
  authenticate: (session: Session) => void;
  lock: () => Promise<void>;
  deeperPalette: boolean;
  togglePaletteDepth: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);
const MEANINGFUL_EVENTS: Array<keyof WindowEventMap> = ['pointerdown', 'touchstart', 'keydown', 'input'];

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [deeperPalette, setDeeperPalette] = useState(() => localStorage.getItem('nestwork:palette-depth') === 'deep');
  const lockTimer = useRef<number | null>(null);
  const touchTimer = useRef<number | null>(null);
  const expiryRef = useRef<number>(0);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = normalizeAccentKey(session?.actor.accentKey);
    document.documentElement.dataset.paletteDepth = deeperPalette ? 'deep' : 'light';
  }, [deeperPalette, session?.actor.accentKey]);

  const clearTimers = useCallback(() => {
    if (lockTimer.current !== null) window.clearTimeout(lockTimer.current);
    if (touchTimer.current !== null) window.clearTimeout(touchTimer.current);
    lockTimer.current = null;
    touchTimer.current = null;
  }, []);

  const finishLock = useCallback(() => {
    clearTimers();
    expiryRef.current = 0;
    setSession(null);
    if (window.location.pathname !== '/') window.location.replace('/');
  }, [clearTimers]);

  const scheduleLock = useCallback(
    (expiresAt: string | number) => {
      const expiry = typeof expiresAt === 'number' ? expiresAt : new Date(expiresAt).getTime();
      expiryRef.current = expiry;
      if (lockTimer.current !== null) window.clearTimeout(lockTimer.current);
      lockTimer.current = window.setTimeout(finishLock, Math.max(0, expiry - Date.now()));
    },
    [finishLock],
  );

  const authenticate = useCallback(
    (nextSession: Session) => {
      setSession(nextSession);
      scheduleLock(nextSession.idleExpiresAt);
    },
    [scheduleLock],
  );

  const lock = useCallback(async () => {
    try {
      await postJson('/session/logout', {});
    } catch {
      // The server may already have expired the session; local state is cleared either way.
    }
    finishLock();
  }, [finishLock]);

  useEffect(() => {
    let cancelled = false;
    api<{ session: Session }>('/session')
      .then((result) => {
        if (!cancelled) authenticate(result.session);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authenticate]);

  useEffect(() => {
    if (!session) return;
    const meaningfulActivity = () => {
      // Start the usability boundary at the actual event, not after the request.
      scheduleLock(Date.now() + 30_000);
      if (touchTimer.current !== null) return;
      touchTimer.current = window.setTimeout(() => {
        touchTimer.current = null;
        postJson<{ idleExpiresAt: string }>('/session/touch', {})
          .then((result) => scheduleLock(result.idleExpiresAt))
          .catch(finishLock);
      }, 200);
    };
    const touched = (event: Event) => scheduleLock((event as CustomEvent<string>).detail);
    const locked = () => finishLock();
    const visibility = () => {
      if (document.visibilityState !== 'visible') return;
      api<{ session: Session }>('/session')
        .then((result) => {
          setSession(result.session);
          scheduleLock(result.session.idleExpiresAt);
        })
        .catch(finishLock);
    };
    for (const eventName of MEANINGFUL_EVENTS) window.addEventListener(eventName, meaningfulActivity, { passive: true });
    window.addEventListener('chores:session-touched', touched);
    window.addEventListener('chores:session-locked', locked);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      for (const eventName of MEANINGFUL_EVENTS) window.removeEventListener(eventName, meaningfulActivity);
      window.removeEventListener('chores:session-touched', touched);
      window.removeEventListener('chores:session-locked', locked);
      document.removeEventListener('visibilitychange', visibility);
      clearTimers();
    };
  }, [clearTimers, finishLock, scheduleLock, session]);

  const togglePaletteDepth = useCallback(() => {
    document.documentElement.classList.remove('palette-transitioning');
    void document.documentElement.offsetWidth;
    document.documentElement.classList.add('palette-transitioning');
    setDeeperPalette((current) => {
      const next = !current;
      localStorage.setItem('nestwork:palette-depth', next ? 'deep' : 'light');
      return next;
    });
    window.setTimeout(() => document.documentElement.classList.remove('palette-transitioning'), 1_050);
  }, []);
  const value = useMemo(() => ({ session, checking, authenticate, lock, deeperPalette, togglePaletteDepth }), [session, checking, authenticate, lock, deeperPalette, togglePaletteDepth]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider.');
  return context;
}
