// E2E layer: a small set of revenue-critical guest journeys, run on desktop and mobile viewports.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { BookingFlow } = require('./pages');

test.describe('Critical booking journeys', () => {
  test('[REQ-PAY-01] [REQ-MOB-01] guest books a Caribbean balcony cabin with a promo', async ({ page }) => {
    const flow = new BookingFlow(page);
    await flow.searchFor('Caribbean');
    await flow.selectFirstCruise();
    await flow.priceCabin('balcony', 2, 'SAIL10');

    // Price shown to the guest must match the pricing service, promo applied once.
    const apiQuote = await (await page.request.post('/api/quote', { data: { cruiseId: 'CQL-101', cabinType: 'balcony', guests: 2, promoCode: 'SAIL10' } })).json();
    expect(apiQuote.discount).toBeCloseTo(apiQuote.fare * 0.10, 2);
    await expect(page.getByTestId('quote-total')).toHaveText('$' + apiQuote.total.toLocaleString('en-US', { minimumFractionDigits: 2 }));

    await flow.checkout({ card: '4242 4242 4242 4242' });
    await expect(page.getByRole('heading', { name: "You're booked!" })).toBeVisible();
    await expect(page.getByTestId('booking-id')).toHaveText(/^BK-[0-9A-F]{8}$/);
    await expect(page.getByTestId('confirm-summary')).toContainText('ending 4242');
  });

  test('[REQ-PROMO-03] expired promo shows a clear message and blocks checkout', async ({ page }) => {
    const flow = new BookingFlow(page);
    await flow.searchFor('Caribbean');
    await flow.selectFirstCruise();
    await flow.priceCabin('interior', 2, 'FALL25');
    await expect(page.getByTestId('quote-error')).toContainText('expired');
    await expect(page.getByTestId('to-checkout')).toBeDisabled();
  });

  test('[REQ-PAY-02] declined card lets the guest retry without losing details', async ({ page }) => {
    const flow = new BookingFlow(page);
    await flow.searchFor('Alaska');
    await flow.selectFirstCruise();
    await flow.priceCabin('oceanview', 2);
    await flow.checkout({ card: '4000 0000 0000 0002' });
    await expect(page.getByTestId('pay-error')).toContainText('declined');
    await expect(page.getByTestId('email')).toHaveValue('ana@example.com');
  });

  test('[REQ-PAY-03] payment outage tells the guest they were not charged', async ({ page }) => {
    const flow = new BookingFlow(page);
    await flow.searchFor('Mexico');
    await flow.selectFirstCruise();
    await flow.priceCabin('interior', 2);
    await flow.checkout({ card: '4000 0000 0000 9995' });
    await expect(page.getByTestId('pay-error')).toContainText('not been charged');
  });

  test('[REQ-INV-01] sold-out cabin cannot be selected', async ({ page }) => {
    const flow = new BookingFlow(page);
    await flow.searchFor('Caribbean');
    await page.getByRole('button', { name: 'Select Coral Horizon' }).click();
    await expect(page.getByRole('radio', { name: /suite/i })).toBeDisabled();
  });
});

test.describe('Accessibility', () => {
  test('[REQ-A11Y-01] search and cabin pages have no serious or critical axe violations', async ({ page }) => {
    const flow = new BookingFlow(page);
    await flow.searchFor('Caribbean');
    const check = async (where) => {
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const serious = violations.filter((v) => ['serious', 'critical'].includes(v.impact));
      expect(serious.map((v) => `${where}: ${v.id} (${v.nodes.length})`)).toEqual([]);
    };
    await check('search');
    await flow.selectFirstCruise();
    await check('cabin');
  });
});
