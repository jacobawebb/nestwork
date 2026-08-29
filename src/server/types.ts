export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  BOOTSTRAP_SECRET: string;
  ENVIRONMENT: 'development' | 'test' | 'production';
  APP_VERSION: string;
  APP_COMMIT: string;
}

export type ParentRole = 'OWNER' | 'PARENT';

export type Actor =
  | {
      type: 'OWNER' | 'PARENT';
      id: string;
      householdId: string;
      displayName: string;
      avatarKey: string;
      accentKey: string;
      role: ParentRole;
      sessionHash: string;
      idleExpiresAt: string;
    }
  | {
      type: 'CHILD';
      id: string;
      householdId: string;
      displayName: string;
      avatarKey: string;
      accentKey: string;
      sessionHash: string;
      idleExpiresAt: string;
    };

export type ParentActor = Extract<Actor, { type: 'OWNER' | 'PARENT' }>;
export type ChildActor = Extract<Actor, { type: 'CHILD' }>;

export interface ApiVariables {
  actor: Actor;
  requestId: string;
}
