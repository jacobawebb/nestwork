import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { AppErrorBoundary } from '@/components/feedback';

const SelectorPage = lazy(() => import('@/app/pages/selector-page'));
const SetupPage = lazy(() => import('@/app/pages/setup-page'));
const InvitePage = lazy(() => import('@/app/pages/invite-page'));
const ParentLayout = lazy(() => import('@/app/layouts/parent-layout'));
const ParentDashboard = lazy(() => import('@/app/pages/parent/dashboard-page'));
const ChoresPage = lazy(() => import('@/app/pages/parent/chores-page'));
const PeoplePage = lazy(() => import('@/app/pages/parent/people-page'));
const PiggyBanksPage = lazy(() => import('@/app/pages/parent/piggy-banks-page'));
const SettingsPage = lazy(() => import('@/app/pages/parent/settings-page'));
const ChildLayout = lazy(() => import('@/app/layouts/child-layout'));
const ChildHomePage = lazy(() => import('@/app/pages/child/home-page'));
const ChildChoresPage = lazy(() => import('@/app/pages/child/chores-page'));
const ChildPiggyPage = lazy(() => import('@/app/pages/child/piggy-page'));
const ChildGoalsPage = lazy(() => import('@/app/pages/child/goals-page'));

function load(element: ReactNode) {
  return <Suspense fallback={<div className="page-loader" role="status">Opening your household…</div>}>{element}</Suspense>;
}

export const router = createBrowserRouter([
  { path: '/', element: load(<SelectorPage />), errorElement: <AppErrorBoundary /> },
  { path: '/setup', element: load(<SetupPage />), errorElement: <AppErrorBoundary /> },
  { path: '/invite/:token', element: load(<InvitePage />), errorElement: <AppErrorBoundary /> },
  {
    path: '/parent',
    element: load(<ParentLayout />),
    errorElement: <AppErrorBoundary />,
    children: [
      { index: true, element: load(<ParentDashboard />) },
      { path: 'chores', element: load(<ChoresPage />) },
      { path: 'people', element: load(<PeoplePage />) },
      { path: 'piggy-banks', element: load(<PiggyBanksPage />) },
      { path: 'settings', element: load(<SettingsPage />) },
    ],
  },
  {
    path: '/child',
    element: load(<ChildLayout />),
    errorElement: <AppErrorBoundary />,
    children: [
      { index: true, element: load(<ChildHomePage />) },
      { path: 'chores', element: load(<ChildChoresPage />) },
      { path: 'piggy-bank', element: load(<ChildPiggyPage />) },
      { path: 'goals', element: load(<ChildGoalsPage />) },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
