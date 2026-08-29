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
});
