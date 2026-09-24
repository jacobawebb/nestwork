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
  const keypad = page.getByRole('dialog', { name: 'Hi, E2E Child!' });
  await expect(keypad).toBeVisible();
  await expect(keypad.getByRole('textbox')).toHaveCount(0);
  for (const digit of '2468') await keypad.getByRole('button', { name: `PIN digit ${digit}` }).click();
  await expect(keypad.getByRole('status')).toHaveAttribute('aria-label', '4 of 6 PIN digits entered');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'My chores' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'coral');
}

test('assigned chore, approval, ledger, payout, and goals work end to end', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.goto('/');
  await loginParent(page);
  await expect(page.getByRole('timer')).toBeVisible();
  const initialSeconds = Number((await page.getByRole('timer').getAttribute('aria-label'))?.match(/\d+/)?.[0]);
  await expect.poll(async () => Number((await page.getByRole('timer').getAttribute('aria-label'))?.match(/\d+/)?.[0])).toBeLessThan(initialSeconds);
  const activityBounds = await page.locator('.activity-scroll').evaluate((element) => {
    const styles = getComputedStyle(element);
    return { maxHeight: Number.parseFloat(styles.maxHeight), overflowY: styles.overflowY };
  });
  expect(activityBounds.maxHeight).toBeGreaterThan(0);
  expect(['auto', 'scroll']).toContain(activityBounds.overflowY);

  await page.getByRole('link', { name: 'Add chore', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Add chore · Step 1 of 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Fresh task' }).click();
  await expect(page.getByRole('dialog', { name: 'Create chore · Step 2 of 2' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Chore title' }).fill('Tidy the desk');
  await page.getByRole('textbox', { name: 'Earning amount' }).fill('1.25');
  await page.getByRole('textbox', { name: /Short instructions/ }).fill('Put papers away and leave the surface clear.');
  await page.getByRole('group', { name: 'Assign to children (optional)' }).getByRole('checkbox', { name: 'E2E Child' }).check();
  await page.getByRole('textbox', { name: 'Available at' }).fill('00:00');
  await page.getByRole('button', { name: 'Create chore' }).click();
  await expect(page.getByRole('heading', { name: 'Tidy the desk' }).first()).toBeVisible();
  await expect(page.locator('.chore-card[data-status="AVAILABLE"]').first()).toBeVisible();
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await page.getByRole('link', { name: 'View or edit Tidy the desk' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit chore template' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Chore title' })).toHaveValue('Tidy the desk');
  await page.getByRole('dialog', { name: 'Edit chore template' }).getByRole('button', { name: 'Cancel' }).click();

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
  await page.getByRole('link', { name: 'Chores', exact: true }).click();
  await page.getByRole('combobox', { name: 'Filter by status' }).selectOption('COMPLETED_PENDING_REVIEW');
  await expect(page.locator('.chore-list .chore-card[data-status="COMPLETED_PENDING_REVIEW"]')).toBeVisible();
  await expect(page.locator('.chore-list').getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page.getByText('Child note:')).toBeVisible();
  const reviewCard = page.locator('.needs-review-panel .chore-card[data-status="COMPLETED_PENDING_REVIEW"]');
  await expect(reviewCard).toBeVisible();
  await expect(reviewCard).toHaveCSS('border-left-color', 'rgb(154, 100, 0)');
  await expect(reviewCard.getByRole('button', { name: 'Approve' })).toHaveClass(/button-success/);
  await expect(reviewCard.getByRole('button', { name: 'Approve' })).toHaveCSS('background-color', 'rgb(25, 115, 74)');
  await expect(reviewCard.getByRole('button', { name: 'Try again' })).toHaveClass(/button-warning/);
  await expect(reviewCard.getByRole('button', { name: 'Reject' })).toHaveClass(/button-danger/);
  await expect(reviewCard.getByRole('button', { name: 'Reject' })).toHaveCSS('color', 'rgb(232, 85, 69)');
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('£1.25')).toBeVisible();

  await page.getByRole('link', { name: 'Piggy banks' }).click();
  await page.getByRole('button', { name: 'View chore Tidy the desk' }).click();
  const parentChoreDetail = page.getByRole('dialog', { name: 'View chore' });
  await expect(parentChoreDetail.getByRole('heading', { name: 'Tidy the desk' })).toBeVisible();
  await expect(parentChoreDetail.getByRole('button', { name: /Edit|Approve|Reject|Cancel chore/ })).toHaveCount(0);
  await parentChoreDetail.getByRole('button', { name: 'Close' }).last().click();
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
  await page.getByRole('link', { name: 'Piggy bank' }).click();
  await page.getByRole('button', { name: 'View chore Tidy the desk' }).click();
  const childChoreDetail = page.getByRole('dialog', { name: 'View chore' });
  await expect(childChoreDetail.getByRole('heading', { name: 'Tidy the desk' })).toBeVisible();
  await expect(childChoreDetail.getByRole('button', { name: /Edit|Approve|Reject|I’ve done it/ })).toHaveCount(0);
});

test('board chores, saved templates, piggy-bank links, and search work for parents', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.goto('/');
  await loginParent(page);
  await page.getByRole('link', { name: 'Add chore', exact: true }).click();
  await page.getByRole('button', { name: /Fresh task/ }).click();
  await page.getByRole('textbox', { name: 'Chore title' }).fill('Shared board task');
  await page.getByRole('textbox', { name: 'Earning amount' }).fill('2.00');
  await page.getByRole('textbox', { name: 'Available at' }).fill('00:00');
  await page.getByRole('checkbox', { name: /Save to template library/ }).check();
  await page.getByRole('button', { name: 'Create chore' }).click();

  await page.getByRole('link', { name: 'Dashboard' }).click();
  const boardLink = page.locator('.board-panel').getByRole('link', { name: 'View or edit Shared board task' });
  await expect(boardLink).toBeVisible();
  await boardLink.click();
  await expect(page.getByRole('dialog', { name: 'Edit chore template' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Chore title' })).toHaveValue('Shared board task');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('link', { name: 'Dashboard' }).click();
  await page.getByRole('link', { name: "View E2E Child's piggy bank" }).click();
  await expect(page.getByRole('heading', { name: 'Piggy banks' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'E2E Child' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/child=/);

  await page.getByRole('link', { name: 'Chores', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search chores' }).fill('Shared board task');
  await expect(page.locator('.chore-list').getByRole('heading', { name: 'Shared board task' })).toBeVisible();
  await expect(page.getByText('Page 1 of 1')).toBeVisible();
  await page.getByRole('button', { name: 'Add chore' }).click();
  await page.locator('.creation-choice').filter({ hasText: 'Shared board task' }).click();
  await expect(page.getByRole('dialog', { name: 'Create chore · Step 2 of 2' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Chore title' })).toHaveValue('Shared board task');
  await page.getByRole('textbox', { name: 'Chore title' }).fill('Shared board task copy');
  await page.getByRole('group', { name: 'Assign to children (optional)' }).getByRole('checkbox', { name: 'E2E Child' }).check();
  await page.getByRole('button', { name: 'Create chore' }).click();
  await expect(page.locator('.chore-list').getByRole('heading', { name: 'Shared board task copy' })).toBeVisible();
});

test('the client and server lock a hidden child session at the sixty-second boundary', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  test.setTimeout(90_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'E2E Child Child' }).click();
  for (const digit of '2468') await page.getByRole('button', { name: `PIN digit ${digit}` }).click();
  const startedAt = Date.now();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'My chores' })).toBeVisible();
  const cover = await context.newPage();
  await cover.goto('about:blank');
  await cover.waitForTimeout(60_300);
  await page.bringToFront();
  await expect(page.getByRole('heading', { name: 'Who’s using the app?' })).toBeVisible({ timeout: 2_000 });
  const elapsed = Date.now() - startedAt;
  expect(elapsed).toBeGreaterThanOrEqual(59_900);
  expect(elapsed).toBeLessThan(63_000);
  await page.goto('/child');
  await expect(page.getByRole('heading', { name: 'Who’s using the app?' })).toBeVisible();
});
