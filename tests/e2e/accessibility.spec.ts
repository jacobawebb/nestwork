import { expect, test } from '@playwright/test';

test('phone and tablet selector flows are keyboard-usable, low-motion, and free of horizontal overflow', async ({ page }, testInfo) => {
  test.skip(!['phone', 'tablet'].includes(testInfo.project.name));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const owner = page.getByRole('button', { name: 'E2E Owner Adult' });
  let reachedOwner = false;
  for (let press = 0; press < 6 && !reachedOwner; press += 1) {
    await page.keyboard.press('Tab');
    reachedOwner = await owner.evaluate((element) => element === document.activeElement);
  }
  expect(reachedOwner).toBe(true);
  await page.keyboard.press('Enter');
  const email = page.getByRole('textbox', { name: 'Email address' });
  await expect(email).toBeFocused();
  await page.keyboard.type('owner@e2e.test');
  await page.keyboard.press('Tab');
  await page.keyboard.type('StrongPassword123');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Parent dashboard' })).toBeVisible();

  const metrics = await page.evaluate(() => {
    const navTargets = [...document.querySelectorAll<HTMLElement>('.parent-nav-link')];
    const transitionSeconds = Number.parseFloat(getComputedStyle(document.body).transitionDuration) || 0;
    return {
      noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
      navTargetsAreLarge: navTargets.every((target) => target.getBoundingClientRect().width >= 44 && target.getBoundingClientRect().height >= 44),
      transitionSeconds,
    };
  });
  expect(metrics.noHorizontalOverflow).toBe(true);
  expect(metrics.navTargetsAreLarge).toBe(true);
  expect(metrics.transitionSeconds).toBeLessThanOrEqual(0.001);
  if (testInfo.project.name === 'phone') await page.screenshot({ path: testInfo.outputPath('dashboard.png') });
  await page.getByRole('button', { name: 'Lock and switch user' }).click();
  await expect(page.getByRole('heading', { name: 'Who’s using the app?' })).toBeVisible();
  await page.getByRole('button', { name: 'E2E Child Child' }).click();
  const keypad = page.getByRole('dialog', { name: 'Hi, E2E Child!' });
  await expect(keypad).toBeVisible();
  await expect(keypad.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Who’s using the app?' })).toHaveCount(0);
  await keypad.getByRole('button', { name: 'PIN digit 2' }).click();
  await keypad.getByRole('button', { name: 'PIN digit 4' }).click();
  await keypad.getByRole('button', { name: 'Delete last PIN digit' }).click();
  await expect(keypad.getByRole('status')).toHaveAttribute('aria-label', '1 of 6 PIN digits entered');
  await keypad.getByRole('button', { name: 'Clear' }).click();
  await expect(keypad.getByRole('status')).toHaveAttribute('aria-label', '0 of 6 PIN digits entered');
  await expect(keypad.getByRole('button', { name: 'Continue' })).toBeDisabled();
  const keypadMetrics = await keypad.evaluate((element) => ({
    coversViewport: element.getBoundingClientRect().width >= window.innerWidth && element.getBoundingClientRect().height >= window.innerHeight,
    noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
    touchTargets: [...element.querySelectorAll<HTMLButtonElement>('.child-pin-key')].every((button) => button.getBoundingClientRect().height >= 44),
  }));
  expect(keypadMetrics).toEqual({ coversViewport: true, noHorizontalOverflow: true, touchTargets: true });
  await keypad.getByRole('button', { name: 'Back to profiles' }).click();
  await expect(page.getByRole('heading', { name: 'Who’s using the app?' })).toBeVisible();
});
