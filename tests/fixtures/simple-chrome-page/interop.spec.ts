import { test, expect } from '@playwright/test';

test('simple chrome page action sequence', async ({ page }) => {
  await page.goto('index.html');
  await expect(page.locator('#result')).toHaveText('5');
  await page.evaluate('calculate(4, 6)');
  await expect(page.locator('#result')).toHaveText('10');
});
