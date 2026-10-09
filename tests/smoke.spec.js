import { test, expect } from '@playwright/test';

test('Inboxly website loads successfully', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/Inboxly/i);

  console.log('Inboxly loaded successfully');
});