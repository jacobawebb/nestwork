import { expect, test, type Page } from '@playwright/test';

async function loginParent(page: Page) {
  await expect(page.getByRole('heading', { name: 'Who’s using the app?' })).toBeVisible();
  await page.getByRole('button', { name: 'E2E Owner Adult' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('owner@e2e.test');
  await page.getByRole('textbox', { name: 'Password' }).fill('StrongPassword123');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Parent dashboard' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'violet');
}

async function loginChild(page: Page) {
  await expect(page.getByRole('heading', { name: 'Who’s using the app?' })).toBeVisible();
  await page.getByRole('button', { name: 'E2E Child Child' }).click();
  await page.getByRole('textbox', { name: /PIN/ }).fill('2468');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'My chores' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'coral');
}

test('assigned chore, approval, ledger, payout, and goals work end to end', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.goto('/');
  await loginParent(page);
  const activityBounds = await page.locator('.activity-scroll').evaluate((element) => {
    const styles = getComputedStyle(element);
    return { maxHeight: Number.parseFloat(styles.maxHeight), overflowY: styles.overflowY };
  });
  expect(activityBounds.maxHeight).toBeGreaterThan(0);
  expect(['auto', 'scroll']).toContain(activityBounds.overflowY);

  await page.getByRole('link', { name: 'Add chore', exact: true }).click();
  await page.getByRole('textbox', { name: 'Chore title' }).fill('Tidy the desk');
  await page.getByRole('textbox', { name: 'Earning amount' }).fill('1.25');
  await page.getByRole('textbox', { name: /Short instructions/ }).fill('Put papers away and leave the surface clear.');
  await page.getByRole('checkbox', { name: 'E2E Child' }).check();
  await page.getByRole('textbox', { name: 'Available at' }).fill('00:00');
  await page.getByRole('button', { name: 'Create chore' }).click();
  await expect(page.getByRole('heading', { name: 'Tidy the desk' }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Lock and switch user' }).click();
  await expect(page.getByRole('heading', { name: 'Who’s using the app?' })).toBeVisible();
  await loginChild(page);
  await page.getByRole('button', { name: 'I’ve done it', exact: true }).click();
  await page.getByRole('textbox', { name: 'Optional note' }).fill('Desk is clear.');
  await page.getByRole('button', { name: 'Yes, I’ve done it' }).click();
  await expect(page.getByText('Waiting to be checked')).toBeVisible();

  await page.getByRole('button', { name: 'Switch user' }).click();
  await expect(page.getByRole('heading', { name: 'Who’s using the app?' })).toBeVisible();
  await loginParent(page);
  await expect(page.getByText('Child note:')).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('£1.25')).toBeVisible();

  await page.getByRole('link', { name: 'Piggy banks' }).click();
  await page.getByRole('button', { name: 'Goal' }).click();
  await page.getByRole('textbox', { name: 'Goal name' }).fill('New book');
  await page.getByRole('textbox', { name: 'Target amount' }).fill('5.00');
  await page.getByRole('button', { name: 'Create goal' }).click();
  await expect(page.getByRole('heading', { name: 'New book' })).toBeVisible();

  await page.getByRole('button', { name: 'Goal' }).click();
  await page.getByRole('textbox', { name: 'Goal name' }).fill('Day out');
  await page.getByRole('textbox', { name: 'Target amount' }).fill('10.00');
  await page.getByRole('button', { name: 'Create goal' }).click();
  await page.getByRole('button', { name: 'Move Day out up' }).click();

  await page.getByRole('button', { name: 'Record payout' }).click();
  await page.getByRole('textbox', { name: 'Payout amount' }).fill('0.50');
  await page.getByRole('textbox', { name: 'Reason' }).fill('Weekly cash');
  await page.getByRole('button', { name: 'Record entry' }).click();
  await expect(page.getByText('£0.75', { exact: true })).toBeVisible();
  await expect(page.getByText('Cash: Weekly cash')).toBeVisible();

  await page.getByRole('button', { name: 'Lock and switch user' }).click();
  await expect(page.getByRole('heading', { name: 'Who’s using the app?' })).toBeVisible();
  await loginChild(page);
  await page.getByRole('link', { name: 'Goals', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Day out' })).toBeVisible();
  await page.getByRole('button', { name: 'Make spotlight' }).click();
  await expect(page.getByRole('heading', { name: 'New book' }).locator('..')).not.toContainText('Spotlight');
  await expect(page.getByRole('heading', { name: 'Day out' }).locator('..')).toContainText('Spotlight');
});

test('the client and server lock a hidden child session at the thirty-second boundary', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.goto('/');
  await page.getByRole('button', { name: 'E2E Child Child' }).click();
  await page.getByRole('textbox', { name: /PIN/ }).fill('2468');
  const startedAt = Date.now();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'My chores' })).toBeVisible();
  const cover = await context.newPage();
  await cover.goto('about:blank');
  await cover.waitForTimeout(30_300);
  await page.bringToFront();
  await expect(page.getByRole('heading', { name: 'Who’s using the app?' })).toBeVisible({ timeout: 2_000 });
  const elapsed = Date.now() - startedAt;
  expect(elapsed).toBeGreaterThanOrEqual(29_900);
  expect(elapsed).toBeLessThan(33_000);
  await page.goto('/child');
  await expect(page.getByRole('heading', { name: 'Who’s using the app?' })).toBeVisible();
});
