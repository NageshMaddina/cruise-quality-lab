// Playwright tests for the shareable live demo page (docs/live-demo.html), which runs the
// booking service and a subset of the release gate entirely in the browser.
const { test, expect } = require('@playwright/test');
const path = require('path');

const PAGE = 'file://' + path.join(__dirname, '..', '..', 'docs', 'live-demo.html');

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(PAGE);
  test.info().annotations.push({ type: 'page-errors', description: String(errors.length) });
});

test('[LIVE] guest books a balcony cabin with SAIL10 and gets a confirmation', async ({ page }) => {
  await page.getByRole('button', { name: 'Search cruises' }).click();
  await page.getByRole('button', { name: 'Select Ocean Aurora' }).click();
  await page.getByLabel('Balcony').check();
  await page.getByLabel('Promo code').fill('SAIL10');
  await page.getByRole('button', { name: 'Get price' }).click();
  await expect(page.locator('#q-total')).toHaveText('$3,169.81');
  await page.getByRole('button', { name: 'Continue to checkout' }).click();
  await page.getByRole('button', { name: 'Pay and book' }).click();
  await expect(page.locator('#bk-id')).toHaveText(/^BK-[0-9A-F]{8}$/);
});

test('[LIVE] declined card shows a retry message', async ({ page }) => {
  await page.getByRole('button', { name: 'Select Glacier Star' }).click();
  await page.getByRole('button', { name: 'Get price' }).click();
  await page.getByRole('button', { name: 'Continue to checkout' }).click();
  await page.getByLabel('Test card number').selectOption('4000000000000002');
  await page.getByRole('button', { name: 'Pay and book' }).click();
  await expect(page.locator('#pay-error')).toContainText('declined');
});

test('[LIVE] clean build: pipeline ends on SHIP', async ({ page }) => {
  await page.getByRole('tab', { name: 'Release pipeline' }).click();
  await page.getByRole('button', { name: 'Run the pipeline' }).click();
  await expect(page.locator('#o-ship')).toHaveClass(/lit/, { timeout: 10000 });
  await expect(page.locator('#r-fast')).toHaveText('17/17 pass');
});

for (const [bug, cluster] of [['promo_stack', 'Pricing / promotions'], ['no_taxes', 'Pricing / promotions'], ['payment_down', 'Payment gateway']]) {
  test(`[LIVE] injected ${bug}: pipeline blocks and triage points to ${cluster}`, async ({ page }) => {
    await page.locator(`#defects .chip[data-bug="${bug}"]`).click();
    await page.getByRole('tab', { name: 'Release pipeline' }).click();
    await page.getByRole('button', { name: 'Run the pipeline' }).click();
    await expect(page.locator('#o-block')).toHaveClass(/lit/, { timeout: 10000 });
    await expect(page.locator('#verdict .big')).toHaveText('BLOCK');
    await expect(page.locator('#triage')).toContainText(cluster);
  });
}

test('[LIVE] promo defect is visible to the guest as a doubled discount', async ({ page }) => {
  await page.locator('#defects .chip[data-bug="promo_stack"]').click();
  await page.getByRole('button', { name: 'Select Ocean Aurora' }).click();
  await page.getByLabel('Balcony').check();
  await page.getByLabel('Promo code').fill('SAIL10');
  await page.getByRole('button', { name: 'Get price' }).click();
  await expect(page.locator('#q-disc')).toContainText('575.36');
});
