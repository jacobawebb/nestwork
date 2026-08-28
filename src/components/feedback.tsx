import { AlertTriangle, RefreshCw } from 'lucide-react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Button } from './ui';

export function AppErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? error.statusText
    : error instanceof Error
      ? error.message
      : 'The page could not be opened.';
  return (
    <main className="center-page">
      <div className="error-panel">
        <AlertTriangle aria-hidden="true" />
        <h1>Something went wrong</h1>
        <p>{message}</p>
        <Button onClick={() => window.location.assign('/')}><RefreshCw size={18} />Back to profiles</Button>
      </div>
    </main>
  );
}
