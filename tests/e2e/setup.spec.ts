import { expect, test } from '@playwright/test';

test('a fresh database is bootstrapped through the complete setup wizard', async ({ page }) => {
  await page.goto('/setup');
  await expect(page.getByRole('heading', { name: 'Set up your household' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Setup secret' }).fill('e2e-bootstrap-secret-at-least-32-characters');
  await page.getByRole('button', { name: 'Unlock setup' }).click();

  await page.getByRole('textbox', { name: 'Household name' }).fill('E2E Household');
  await page.getByRole('textbox', { name: 'Locale' }).fill('en-GB');
  await page.getByRole('combobox', { name: 'Time zone' }).selectOption('Europe/London');
  await page.getByRole('combobox', { name: 'Currency' }).selectOption('GBP');
  await page.getByRole('button', { name: /Continue/ }).click();

  await page.getByRole('textbox', { name: 'Display name' }).fill('E2E Owner');
  await page.getByRole('textbox', { name: 'Email address' }).fill('owner@e2e.test');
  await page.getByRole('textbox', { name: /Password/ }).fill('StrongPassword123');
  await page.getByRole('radio', { name: 'Violet' }).check();
  await page.getByRole('button', { name: /Continue/ }).click();

  await page.getByRole('button', { name: 'Add child' }).click();
  await page.getByRole('textbox', { name: 'Child 1 name' }).fill('E2E Child');
  await page.getByRole('textbox', { name: 'PIN' }).fill('2468');
  await page.getByRole('radio', { name: 'Coral' }).check();
  await page.getByRole('button', { name: /Continue/ }).click();

  await page.getByRole('checkbox', { name: /Allow a child to release/ }).check();
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page.getByRole('heading', { name: 'Review and finish' })).toBeVisible();
  await expect(page.getByText('E2E Child')).toBeVisible();
  await page.getByRole('button', { name: /Finish setup/ }).click();

  await expect(page.getByRole('heading', { name: 'Your household is ready' })).toBeVisible();
  await page.getByRole('button', { name: /Enter parent dashboard/ }).click();
  await expect(page.getByRole('heading', { name: 'Parent dashboard' })).toBeVisible();
  await expect(page.getByText('£0.00')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'violet');
});
