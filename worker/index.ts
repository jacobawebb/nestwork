import { app } from '../src/server/api';
import { runScheduledMaintenance } from '../src/server/services/chores';
import type { Env } from '../src/server/types';

export default {
  fetch(request: Request, env: Env, executionContext: ExecutionContext): Promise<Response> {
    return Promise.resolve(app.fetch(request, env, executionContext));
  },

  async scheduled(_controller: ScheduledController, env: Env, executionContext: ExecutionContext): Promise<void> {
    executionContext.waitUntil(
      runScheduledMaintenance(env.DB).then((result) => {
        console.log(JSON.stringify({ level: 'info', event: 'scheduled-maintenance', ...result }));
      }),
    );
  },
};
