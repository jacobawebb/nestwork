import { useEffect, useState } from 'react';
import { useSessionExpiry } from '@/features/auth/session';

export function SessionCountdown() {
  const idleExpiresAt = useSessionExpiry();
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    const refresh = () => setNow(Date.now());
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const seconds = Math.max(0, Math.min(60, Math.ceil((idleExpiresAt - now) / 1_000)));
  const countdown = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return <span className="session-countdown" role="timer" aria-label={`Session locks in ${seconds} seconds`} title="Time until this session locks">{countdown}</span>;
}
