import { describe, expect, it } from 'vitest';
import { hashCredential } from '@/server/security';
import { bindings, createFixture, request } from './helpers';

describe('D1-backed authentication lockouts', () => {
  it('locks bootstrap-secret attempts for fifteen minutes after five failures', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await request('/bootstrap/unlock', { body: { secret: `wrong-secret-${attempt}` } })).status).toBe(401);
    }
    const locked = await request('/bootstrap/unlock', { body: { secret: bindings().BOOTSTRAP_SECRET } });
    expect(locked.status).toBe(429);
    const row = await bindings().DB.prepare('SELECT failures, locked_until FROM auth_attempts WHERE locked_until IS NOT NULL').first<{ failures: number; locked_until: string }>();
    expect(row?.failures).toBe(5);
    const remaining = new Date(row!.locked_until).getTime() - Date.now();
    expect(remaining).toBeGreaterThan(14 * 60_000);
    expect(remaining).toBeLessThanOrEqual(15 * 60_000);
  });

  it('locks a parent profile and IP after five rejected credentials without revealing email validity', async () => {
    const fixture = await createFixture('parent-lockout');
    const password = 'CorrectPassword123';
    await bindings().DB.prepare('UPDATE parent_users SET password_hash = ? WHERE id = ?').bind(await hashCredential(password), fixture.ownerId).run();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request('/login/parent', {
        body: { profileId: fixture.ownerId, email: 'incorrect@example.test', password },
      });
      expect(response.status).toBe(401);
      expect(await response.json<any>()).toMatchObject({ error: { code: 'INVALID_CREDENTIALS', message: 'The sign-in details were not accepted.' } });
    }
    expect((await request('/login/parent', {
      body: { profileId: fixture.ownerId, email: 'owner-parent-lockout@example.test', password },
    })).status).toBe(429);
  });

  it('locks a child profile and IP after five rejected PINs', async () => {
    const fixture = await createFixture('child-lockout');
    await bindings().DB.prepare('UPDATE children SET pin_hash = ? WHERE id = ?').bind(await hashCredential('2468'), fixture.childAId).run();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request('/login/child', { body: { profileId: fixture.childAId, pin: '1357' } });
      expect(response.status).toBe(401);
      expect(await response.json<any>()).toMatchObject({ error: { code: 'INVALID_CREDENTIALS', message: 'The PIN was not accepted.' } });
    }
    expect((await request('/login/child', { body: { profileId: fixture.childAId, pin: '2468' } })).status).toBe(429);
  });

  it('returns the active avatar theme and lets a parent update their own appearance', async () => {
    const fixture = await createFixture('profile-appearance');
    const current = await request('/session', { cookie: fixture.ownerCookie });
    expect(current.status).toBe(200);
    expect(await current.json<any>()).toMatchObject({
      session: { actor: { id: fixture.ownerId, avatarKey: 'grownup-1', accentKey: 'teal' } },
    });

    const updated = await request('/parent/profile', {
      method: 'PUT',
      cookie: fixture.ownerCookie,
      body: { avatarKey: 'grownup-3', accentKey: 'violet' },
    });
    expect(updated.status).toBe(200);
    expect(await updated.json<any>()).toMatchObject({
      session: { actor: { id: fixture.ownerId, avatarKey: 'grownup-3', accentKey: 'violet' } },
    });
    expect(await bindings().DB.prepare('SELECT avatar_key, accent_key FROM parent_users WHERE id = ?').bind(fixture.ownerId).first()).toMatchObject({
      avatar_key: 'grownup-3', accent_key: 'violet',
    });
  });
});
