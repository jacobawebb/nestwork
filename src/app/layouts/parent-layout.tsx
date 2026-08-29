import { Banknote, ClipboardList, Home, House, LockKeyhole, Settings, Users } from 'lucide-react';
import { Navigate, NavLink, Outlet } from 'react-router';
import { useSession } from '@/features/auth/session';
import { Button, cx, LoadingBlock } from '@/components/ui';
import { Avatar } from '@/components/avatar';

const navItems = [
  { to: '/parent', label: 'Dashboard', icon: Home, end: true },
  { to: '/parent/chores', label: 'Chores', icon: ClipboardList },
  { to: '/parent/people', label: 'People', icon: Users },
  { to: '/parent/piggy-banks', label: 'Piggy banks', icon: Banknote },
  { to: '/parent/settings', label: 'Settings', icon: Settings },
];

export default function ParentLayout() {
  const { session, checking, lock } = useSession();
  if (checking) return <LoadingBlock label="Checking your profile…" />;
  if (!session || session.actor.type !== 'PARENT') return <Navigate to="/" replace />;
  return (
    <div className="parent-shell">
      <aside className="parent-rail">
        <div className="brand-mark" aria-label="Family chores"><span aria-hidden="true"><House size={18} /></span><strong>Family chores</strong></div>
        <nav className="parent-nav" aria-label="Parent navigation">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => cx('parent-nav-link', isActive && 'parent-nav-link-active')}>
              <Icon size={20} aria-hidden="true" /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="parent-profile">
          <Avatar avatarKey={session.actor.avatarKey} accentKey={session.actor.accentKey} size="sm" />
          <div><span className="parent-profile-name">{session.actor.displayName}</span><span>{session.actor.role === 'OWNER' ? 'Household owner' : 'Parent'}</span></div>
          <Button variant="quiet" size="sm" onClick={() => void lock()} aria-label="Lock and switch user"><LockKeyhole size={19} /></Button>
        </div>
      </aside>
      <main className="parent-main"><Outlet /></main>
    </div>
  );
}
