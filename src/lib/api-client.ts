export class ClientApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api${path}`, {
    ...init,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const idleExpiresAt = response.headers.get('X-Idle-Expires-At');
  if (idleExpiresAt) window.dispatchEvent(new CustomEvent('chores:session-touched', { detail: idleExpiresAt }));
  const body = (await response.json().catch(() => null)) as any;
  if (!response.ok) {
    if (response.status === 401 && body?.error?.code === 'SESSION_LOCKED') {
      window.dispatchEvent(new Event('chores:session-locked'));
    }
    throw new ClientApiError(
      body?.error?.message ?? 'The request could not be completed.',
      response.status,
      body?.error?.code ?? 'REQUEST_FAILED',
      body?.error?.details,
    );
  }
  return body as T;
}

export function postJson<T>(path: string, value: unknown, method = 'POST'): Promise<T> {
  return api<T>(path, { method, body: JSON.stringify(value) });
}
