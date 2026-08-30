import { Hono, type Context } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { z, ZodError } from 'zod';
import {
  childInputSchema,
  childPin,
  choreTemplateInputSchema,
  displayName,
  email,
  goalInputSchema,
  invitationInputSchema,
  ledgerMutationSchema,
  parentPassword,
  profileAppearanceSchema,
  reviewSchema,
  setupSchema,
} from '@/lib/contracts';
import { ApiError } from './errors';
import { auditStatement } from './audit';
import {
  clearSessionCookies,
  clientIp,
  readSessionCookie,
  setSessionCookie,
} from './security';
import {
  listProfiles,
  loginChild,
  loginParent,
  resolveChildSession,
  resolveParentSession,
  revokeSession,
} from './services/auth';
import { completeSetup, getBootstrapStatus, unlockSetup } from './services/setup';
import type { Actor, ApiVariables, ChildActor, Env, ParentActor } from './types';
import {
  acceptInvitation,
  createChild,
  createInvitation,
  invitationDetails,
  listPeople,
  setChildActive,
  setParentActive,
  updateChild,
  updateParentAppearance,
  updateSettings,
  householdContext,
} from './services/household';
import {
  archiveTemplate,
  cancelChore,
  claimChore,
  completeChore,
  createTemplate,
  deleteUnusedTemplate,
  listChildInstances,
  listParentInstances,
  listTemplates,
  releaseClaim,
  returnToBoard,
  runScheduledMaintenance,
  updateTemplate,
} from './services/chores';
import { createLedgerMutation, ledgerForChild, ledgerForParent } from './services/ledger';
import { childGoals, createGoal, parentGoals, reorderGoals, selectSpotlightGoal, updateGoal } from './services/goals';
import { childHome, parentDashboard } from './services/dashboard';

type AppEnv = { Bindings: Env; Variables: ApiVariables };
export const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID());
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  c.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  c.header('X-Frame-Options', 'DENY');
  if (c.env.ENVIRONMENT === 'production') c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
});

app.use('/api/*', async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('Origin');
    if (origin && origin !== new URL(c.req.url).origin) throw new ApiError(403, 'Request origin was not accepted.', 'CSRF');
  }
  await next();
});

async function json<T>(c: Context<AppEnv>, schema: z.ZodType<T>): Promise<T> {
  return schema.parse(await c.req.json());
}

function publicSession(actor: Actor) {
  return {
    actor: {
      id: actor.id,
      type: actor.type === 'CHILD' ? 'CHILD' : 'PARENT',
      role: actor.type === 'CHILD' ? 'CHILD' : actor.role,
      displayName: actor.displayName,
      avatarKey: actor.avatarKey,
      accentKey: actor.accentKey,
      householdId: actor.householdId,
    },
    idleExpiresAt: actor.idleExpiresAt,
  };
}

async function resolveActor(c: any, touch = true): Promise<Actor | null> {
  const parentToken = readSessionCookie(c, 'parent');
  if (parentToken) {
    const actor = await resolveParentSession(c.env.DB, parentToken, touch);
    if (actor) return actor;
  }
  const childToken = readSessionCookie(c, 'child');
  if (childToken) {
    const actor = await resolveChildSession(c.env.DB, childToken, touch);
    if (actor) return actor;
  }
  clearSessionCookies(c);
  return null;
}

function actorFrom(c: any): Actor {
  return c.get('actor');
}

function parentFrom(c: any): ParentActor {
  const actor = actorFrom(c);
  if (actor.type === 'CHILD') throw new ApiError(403, 'Parent access is required.', 'PARENT_REQUIRED');
  return actor;
}

function childFrom(c: any): ChildActor {
  const actor = actorFrom(c);
  if (actor.type !== 'CHILD') throw new ApiError(403, 'Child access is required.', 'CHILD_REQUIRED');
  return actor;
}

app.get('/api/bootstrap/status', async (c) => c.json(await getBootstrapStatus(c.env.DB)));

app.post('/api/bootstrap/unlock', async (c) => {
  const input = await json(c, z.object({ secret: z.string().min(1).max(500) }));
  const token = await unlockSetup(c.env, input.secret, clientIp(c));
  setCookie(c, 'chores_setup', token, {
    httpOnly: true,
    secure: c.env.ENVIRONMENT === 'production',
    sameSite: 'Strict',
    path: '/api/bootstrap',
    maxAge: 1800,
  });
  return c.json({ unlocked: true });
});

app.post('/api/bootstrap/complete', async (c) => {
  const setupToken = (await import('hono/cookie')).getCookie(c, 'chores_setup');
  if (!setupToken) throw new ApiError(401, 'Unlock setup first.', 'SETUP_SESSION_INVALID');
  const input = await json(c, setupSchema);
  const result = await completeSetup(c.env, setupToken, clientIp(c), input);
  deleteCookie(c, 'chores_setup', { path: '/api/bootstrap' });
  clearSessionCookies(c);
  setSessionCookie(c, 'parent', result.sessionToken);
  return c.json({ session: { actor: { ...result.actor, type: 'PARENT' }, idleExpiresAt: result.actor.idleExpiresAt }, invitations: result.invitationLinks }, 201);
});

app.get('/api/profiles', async (c) => c.json(await listProfiles(c.env.DB)));

app.post('/api/login/parent', async (c) => {
  const input = await json(
    c,
    z.object({ profileId: z.string().uuid(), email, password: z.string().min(1).max(128) }),
  );
  const result = await loginParent(c.env.DB, input, clientIp(c));
  clearSessionCookies(c);
  setSessionCookie(c, 'parent', result.token);
  return c.json({ session: publicSession({ ...result.actor, sessionHash: '' }) });
});

app.post('/api/login/child', async (c) => {
  const input = await json(c, z.object({ profileId: z.string().uuid(), pin: childPin }));
  const result = await loginChild(c.env.DB, input, clientIp(c));
  clearSessionCookies(c);
  setSessionCookie(c, 'child', result.token);
  return c.json({ session: publicSession({ ...result.actor, sessionHash: '' }) });
});

app.get('/api/invitations/:token', async (c) => c.json(await invitationDetails(c.env.DB, c.req.param('token'))));

app.post('/api/invitations/:token/accept', async (c) => {
  const input = await json(c, z.object({ displayName, password: parentPassword }).merge(profileAppearanceSchema));
  return c.json(await acceptInvitation(c.env.DB, c.req.param('token'), input.displayName, input.password, input), 201);
});

app.get('/api/session', async (c) => {
  const actor = await resolveActor(c, true);
  if (!actor) throw new ApiError(401, 'Your session is locked.', 'SESSION_LOCKED');
  return c.json({ session: publicSession(actor) });
});

app.post('/api/session/touch', async (c) => {
  const actor = await resolveActor(c, true);
  if (!actor) throw new ApiError(401, 'Your session is locked.', 'SESSION_LOCKED');
  return c.json({ idleExpiresAt: actor.idleExpiresAt });
});

app.post('/api/session/logout', async (c) => {
  const actor = await resolveActor(c, false);
  if (actor) await revokeSession(c.env.DB, actor);
  clearSessionCookies(c);
  return c.json({ locked: true });
});

const protectedApi = new Hono<AppEnv>();
protectedApi.use('*', async (c, next) => {
  const actor = await resolveActor(c, true);
  if (!actor) throw new ApiError(401, 'Your session is locked.', 'SESSION_LOCKED');
  c.set('actor', actor);
  await next();
  c.header('X-Idle-Expires-At', actor.idleExpiresAt);
});

protectedApi.get('/context', async (c) => {
  const actor = actorFrom(c);
  return c.json({ session: publicSession(actor), household: await householdContext(c.env.DB, actor.householdId) });
});

protectedApi.get('/parent/dashboard', async (c) => c.json(await parentDashboard(c.env.DB, parentFrom(c))));
protectedApi.get('/parent/people', async (c) => c.json(await listPeople(c.env.DB, parentFrom(c))));
protectedApi.get('/parent/chores', async (c) => c.json(await listParentInstances(c.env.DB, parentFrom(c))));
protectedApi.get('/parent/templates', async (c) => c.json(await listTemplates(c.env.DB, parentFrom(c))));
protectedApi.post('/parent/templates', async (c) => c.json(await createTemplate(c.env.DB, parentFrom(c), await json(c, choreTemplateInputSchema)), 201));
protectedApi.put('/parent/templates/:id', async (c) => c.json(await updateTemplate(c.env.DB, parentFrom(c), c.req.param('id'), await json(c, choreTemplateInputSchema))));
protectedApi.post('/parent/templates/:id/archive', async (c) => {
  const input = await json(c, z.object({ active: z.boolean().default(false) }));
  return c.json(await archiveTemplate(c.env.DB, parentFrom(c), c.req.param('id'), input.active));
});
protectedApi.delete('/parent/templates/:id', async (c) => c.json(await deleteUnusedTemplate(c.env.DB, parentFrom(c), c.req.param('id'))));
protectedApi.post('/parent/chores/:id/review', async (c) => {
  const input = await json(c, reviewSchema);
  return c.json(await (await import('./services/chores')).reviewChore(c.env.DB, parentFrom(c), c.req.param('id'), input.action, input.reason));
});
protectedApi.post('/parent/chores/:id/return-to-board', async (c) => c.json(await returnToBoard(c.env.DB, parentFrom(c), c.req.param('id'))));
protectedApi.post('/parent/chores/:id/cancel', async (c) => c.json(await cancelChore(c.env.DB, parentFrom(c), c.req.param('id'))));

protectedApi.post('/parent/children', async (c) => {
  const schema = childInputSchema.extend({ pin: childPin });
  return c.json(await createChild(c.env.DB, parentFrom(c), await json(c, schema)), 201);
});
protectedApi.patch('/parent/children/:id', async (c) => {
  const schema = childInputSchema.partial().extend({ pin: childPin.optional() });
  return c.json(await updateChild(c.env.DB, parentFrom(c), c.req.param('id'), await json(c, schema)));
});
protectedApi.post('/parent/children/:id/active', async (c) => {
  const input = await json(c, z.object({ active: z.boolean() }));
  return c.json(await setChildActive(c.env.DB, parentFrom(c), c.req.param('id'), input.active));
});
protectedApi.post('/parent/invitations', async (c) => {
  const input = await json(c, invitationInputSchema);
  return c.json(await createInvitation(c.env.DB, parentFrom(c), input.email), 201);
});
protectedApi.put('/parent/profile', async (c) => {
  const actor = parentFrom(c);
  const appearance = await updateParentAppearance(c.env.DB, actor, await json(c, profileAppearanceSchema));
  return c.json({ session: publicSession({ ...actor, ...appearance }) });
});
protectedApi.post('/parent/adults/:id/active', async (c) => {
  const input = await json(c, z.object({ active: z.boolean() }));
  return c.json(await setParentActive(c.env.DB, parentFrom(c), c.req.param('id'), input.active));
});
protectedApi.put('/parent/settings', async (c) => {
  const schema = z.object({
    name: z.string().trim().min(1).max(80),
    locale: z.string().min(2).max(35),
    timeZone: z.string().min(1).max(80),
    currency: z.string().regex(/^[A-Z]{3}$/),
    defaultApprovalMode: z.enum(['PARENT_APPROVAL', 'AUTO_APPROVE']),
    childReleaseEnabled: z.boolean(),
    childBoardLimit: z.number().int().min(1).max(20),
    savingsGoalsEnabled: z.boolean(),
    confirmTimeZoneChange: z.boolean().optional(),
  });
  return c.json(await updateSettings(c.env.DB, parentFrom(c), await json(c, schema)));
});

protectedApi.get('/parent/ledger', async (c) => c.json(await ledgerForParent(c.env.DB, parentFrom(c), c.req.query('childId'))));
protectedApi.post('/parent/ledger', async (c) => c.json(await createLedgerMutation(c.env.DB, parentFrom(c), await json(c, ledgerMutationSchema)), 201));
protectedApi.get('/parent/goals/:childId', async (c) => c.json(await parentGoals(c.env.DB, parentFrom(c), c.req.param('childId'))));
protectedApi.post('/parent/goals', async (c) => c.json(await createGoal(c.env.DB, parentFrom(c), await json(c, goalInputSchema)), 201));
protectedApi.post('/parent/goals/reorder', async (c) => {
  const input = await json(c, z.object({ childId: z.string().uuid(), goalIds: z.array(z.string().uuid()).min(1).max(50) }));
  return c.json(await reorderGoals(c.env.DB, parentFrom(c), input.childId, input.goalIds));
});
protectedApi.patch('/parent/goals/:id', async (c) => {
  const schema = goalInputSchema.partial().extend({ active: z.boolean().optional() });
  return c.json(await updateGoal(c.env.DB, parentFrom(c), c.req.param('id'), await json(c, schema)));
});
protectedApi.get('/parent/about', (c) => {
  parentFrom(c);
  return c.json({ version: c.env.APP_VERSION, commit: c.env.APP_COMMIT, compatibilityDate: '2026-08-28' });
});
protectedApi.post('/parent/maintenance/run', async (c) => {
  const actor = parentFrom(c);
  if (actor.role !== 'OWNER') throw new ApiError(403, 'Only the owner can run maintenance.', 'OWNER_REQUIRED');
  const result = await runScheduledMaintenance(c.env.DB);
  await auditStatement(c.env.DB, {
    householdId: actor.householdId,
    actor,
    action: 'SCHEDULED_MAINTENANCE_RUN_MANUALLY',
    entityType: 'HOUSEHOLD',
    entityId: actor.householdId,
    metadata: result,
  }).run();
  return c.json(result);
});

protectedApi.get('/child/home', async (c) => c.json(await childHome(c.env.DB, childFrom(c))));
protectedApi.get('/child/chores', async (c) => c.json(await listChildInstances(c.env.DB, childFrom(c))));
protectedApi.post('/child/chores/:id/claim', async (c) => c.json(await claimChore(c.env.DB, childFrom(c), c.req.param('id'))));
protectedApi.post('/child/chores/:id/release', async (c) => c.json(await releaseClaim(c.env.DB, childFrom(c), c.req.param('id'))));
protectedApi.post('/child/chores/:id/complete', async (c) => {
  const input = await json(c, z.object({ note: z.string().trim().max(160).nullable().default(null) }));
  return c.json(await completeChore(c.env.DB, childFrom(c), c.req.param('id'), input.note));
});
protectedApi.get('/child/ledger', async (c) => c.json(await ledgerForChild(c.env.DB, childFrom(c))));
protectedApi.get('/child/goals', async (c) => c.json(await childGoals(c.env.DB, childFrom(c))));
protectedApi.put('/child/goals/spotlight', async (c) => {
  const input = await json(c, z.object({ goalId: z.string().uuid().nullable() }));
  return c.json(await selectSpotlightGoal(c.env.DB, childFrom(c), input.goalId));
});

app.route('/api', protectedApi);

app.onError((error, c) => {
  const requestId = c.get('requestId') ?? crypto.randomUUID();
  if (error instanceof ZodError) {
    return c.json({ error: { code: 'VALIDATION', message: 'Check the highlighted fields.', details: error.issues, requestId } }, 400);
  }
  if (error instanceof ApiError) {
    return c.json({ error: { code: error.code, message: error.message, details: error.details, requestId } }, error.status as any);
  }
  console.error(JSON.stringify({ level: 'error', requestId, message: error instanceof Error ? error.message : 'Unknown error' }));
  return c.json({ error: { code: 'INTERNAL', message: 'Something went wrong.', requestId } }, 500);
});

app.notFound((c) => {
  if (new URL(c.req.url).pathname.startsWith('/api/')) return c.json({ error: { code: 'NOT_FOUND', message: 'API route not found.' } }, 404);
  return c.env.ASSETS.fetch(c.req.raw);
});
