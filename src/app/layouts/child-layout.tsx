import { Banknote, ClipboardList, Flag, Home, LockKeyhole, MoonStar, Sun } from 'lucide-react';
import { Navigate, NavLink, Outlet } from 'react-router';
import { Button, cx, LoadingBlock } from '@/components/ui';
import { Avatar } from '@/components/avatar';
import { useSession } from '@/features/auth/session';

const navItems = [
  { to: '/child', label: 'Home', icon: Home, end: true },
  { to: '/child/chores', label: 'Chores', icon: ClipboardList },
  { to: '/child/piggy-bank', label: 'Piggy bank', icon: Banknote },
  { to: '/child/goals', label: 'Goals', icon: Flag },
];

export default function ChildLayout() {
  const { session, checking, lock, deeperPalette, togglePaletteDepth } = useSession();
  if (checking) return <LoadingBlock label="Checking your profile…" />;
  if (!session || session.actor.type !== 'CHILD') return <Navigate to="/" replace />;
  return (
    <div className="child-shell">
      <header className="child-header">
        <div className="child-identity"><Avatar avatarKey={session.actor.avatarKey} accentKey={session.actor.accentKey} size="sm" /><div><span className="child-greeting">Hi, {session.actor.displayName}!</span><span className="child-subtitle">Your household board</span></div></div>
        <div className="child-header-actions"><Button variant="secondary" size="sm" onClick={togglePaletteDepth} aria-label={deeperPalette ? 'Use lighter palette' : 'Use deeper palette'}><span className="palette-toggle-icon" data-deep={deeperPalette}><Sun size={18} /><MoonStar size={18} /></span></Button><Button variant="secondary" size="sm" onClick={() => void lock()}><LockKeyhole size={18} />Switch user</Button></div>
      </header>
      <main className="child-main"><Outlet /></main>
      <nav className="child-nav" aria-label="Child navigation">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => cx('child-nav-link', isActive && 'child-nav-link-active')}>
            <Icon size={22} aria-hidden="true" /><span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
