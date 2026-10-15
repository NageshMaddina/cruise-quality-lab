// Reference sample (not run here): the P1 booking journey as a Detox test for a React Native app.
// Same requirement tags and testIDs as the web suite, so traceability is shared across channels.
describe('Critical booking journey (React Native)', () => {
  beforeAll(async () => { await device.launchApp({ newInstance: true }); });

  it('[REQ-PAY-01] [REQ-MOB-01] books a Caribbean balcony cabin with a promo', async () => {
    await element(by.id('destination')).tap();
    await element(by.text('Caribbean')).tap();
    await element(by.id('search-btn')).tap();
    await waitFor(element(by.id('cruise-card')).atIndex(0)).toBeVisible().withTimeout(5000);
    await element(by.id('cruise-card')).atIndex(0).tap();

    await element(by.id('cabin-balcony')).tap();
    await element(by.id('promo')).typeText('SAIL10');
    await element(by.id('quote-btn')).tap();
    await expect(element(by.id('quote-total'))).toBeVisible();

    await element(by.id('to-checkout')).tap();
    await element(by.id('first-name')).typeText('Ana');
    await element(by.id('last-name')).typeText('Lopez');
    await element(by.id('email')).typeText('ana@example.com');
    await element(by.id('card')).typeText('4242424242424242');
    await element(by.id('pay-btn')).tap();

    await waitFor(element(by.id('booking-id'))).toBeVisible().withTimeout(10000);
  });
});
