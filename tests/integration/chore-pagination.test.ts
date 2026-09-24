import { describe, expect, it } from 'vitest';
import { createFixture, insertTemplateAndInstance, request } from './helpers';

describe('parent chore browsing', () => {
  it('searches chore instances and returns distinct pages', async () => {
    const fixture = await createFixture();
    const first = await insertTemplateAndInstance(fixture, { title: 'Laundry one' });
    const second = await insertTemplateAndInstance(fixture, { title: 'Laundry two' });
    await insertTemplateAndInstance(fixture, { title: 'Water plants' });

    const pageOne = await request('/parent/chores/page?status=ALL&search=Laundry&pageSize=1&page=1', { cookie: fixture.ownerCookie });
    expect(pageOne.status).toBe(200);
    const firstPage = await pageOne.json<{ items: Array<{ id: string }>; total: number; totalPages: number }>();
    expect(firstPage.total).toBe(2);
    expect(firstPage.totalPages).toBe(2);
    expect(firstPage.items).toHaveLength(1);

    const pageTwo = await request('/parent/chores/page?status=ALL&search=Laundry&pageSize=1&page=2', { cookie: fixture.ownerCookie });
    const secondPage = await pageTwo.json<{ items: Array<{ id: string }> }>();
    expect(secondPage.items).toHaveLength(1);
    expect(new Set([firstPage.items[0]!.id, secondPage.items[0]!.id])).toEqual(new Set([first.instanceId, second.instanceId]));

    const detail = await request(`/parent/chores/${first.instanceId}`, { cookie: fixture.ownerCookie });
    expect(detail.status).toBe(200);
    expect((await detail.json<{ title: string }>()).title).toBe('Laundry one');
  });
});
