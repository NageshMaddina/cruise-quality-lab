// Page objects keep journey tests readable and cut maintenance when the UI changes.
const { expect } = require('@playwright/test');

class BookingFlow {
  constructor(page) { this.page = page; }

  async searchFor(destination) {
    await this.page.goto('/');
    await this.page.getByLabel('Destination').selectOption(destination);
    await this.page.getByTestId('search-btn').click();
    await expect(this.page.getByTestId('cruise-card').first()).toBeVisible();
  }

  async selectFirstCruise() {
    await this.page.getByTestId('cruise-card').first().getByRole('button').click();
    await expect(this.page.getByRole('heading', { name: 'Choose your cabin' })).toBeVisible();
  }

  async priceCabin(cabin, guests, promo) {
    await this.page.getByRole('radio', { name: new RegExp(cabin, 'i') }).check();
    await this.page.getByTestId('guests').selectOption(String(guests));
    if (promo) await this.page.getByTestId('promo').fill(promo);
    await this.page.getByTestId('quote-btn').click();
  }

  async checkout({ first = 'Ana', last = 'Lopez', email = 'ana@example.com', card }) {
    await this.page.getByTestId('to-checkout').click();
    await this.page.getByTestId('first-name').fill(first);
    await this.page.getByTestId('last-name').fill(last);
    await this.page.getByTestId('email').fill(email);
    await this.page.getByTestId('card').fill(card);
    await this.page.getByTestId('pay-btn').click();
  }
}

module.exports = { BookingFlow };
