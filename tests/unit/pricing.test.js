// Unit layer: fast, isolated checks on pricing and promotion rules.
const { quote, PricingError } = require('../../src/pricing');
const { cruises } = require('../../src/data');

const caribbean = cruises.find((c) => c.id === 'CQL-101');
const noSuites = cruises.find((c) => c.id === 'CQL-102');
const today = new Date('2026-10-15');

describe('Pricing rules', () => {
  test('[REQ-PRICE-01] interior quote for 2 guests, no promo', () => {
    const q = quote({ cruise: caribbean, cabinType: 'interior', guests: 2, today });
    expect(q.fare).toBe(1798);
    expect(q.taxes).toBe(215.76);
    expect(q.portFees).toBe(270);
    expect(q.total).toBe(2283.76);
  });

  test.each([
    ['interior', 1, 1.0], ['oceanview', 2, 1.25], ['balcony', 3, 1.6], ['suite', 4, 2.75]
  ])('[REQ-PRICE-01] %s cabin x %i guests uses multiplier %d', (cabin, guests, mult) => {
    const q = quote({ cruise: caribbean, cabinType: cabin, guests, today });
    expect(q.fare).toBeCloseTo(899 * mult * guests, 2);
    expect(q.total).toBeCloseTo(q.fare * 1.12 + 135 * guests, 2);
  });

  test('[REQ-PROMO-01] SAIL10 takes exactly 10% off the fare, once', () => {
    const q = quote({ cruise: caribbean, cabinType: 'balcony', guests: 2, promoCode: 'sail10', today });
    expect(q.discount).toBeCloseTo(q.fare * 0.10, 2);
    expect(q.total).toBeCloseTo((q.fare - q.discount) * 1.12 + 270, 2);
  });

  test('[REQ-PROMO-02] WAVE200 gives $200 off with 2 guests', () => {
    const q = quote({ cruise: caribbean, cabinType: 'interior', guests: 2, promoCode: 'WAVE200', today });
    expect(q.discount).toBe(200);
  });

  test('[REQ-PROMO-02] WAVE200 is rejected for a single guest', () => {
    expect(() => quote({ cruise: caribbean, cabinType: 'interior', guests: 1, promoCode: 'WAVE200', today }))
      .toThrow(expect.objectContaining({ code: 'PROMO_MIN_GUESTS' }));
  });

  test.each([['FALL25', 'PROMO_EXPIRED'], ['FREECRUISE', 'PROMO_INVALID']])(
    '[REQ-PROMO-03] promo %s is rejected with %s', (code, err) => {
      expect(() => quote({ cruise: caribbean, cabinType: 'interior', guests: 2, promoCode: code, today }))
        .toThrow(expect.objectContaining({ code: err }));
    });

  test('[REQ-INV-01] sold-out cabin type cannot be quoted', () => {
    expect(() => quote({ cruise: noSuites, cabinType: 'suite', guests: 2, today }))
      .toThrow(PricingError);
  });

  test.each([0, 5, 2.5])('[REQ-PRICE-01] guests=%p is rejected', (g) => {
    expect(() => quote({ cruise: caribbean, cabinType: 'interior', guests: g, today }))
      .toThrow(expect.objectContaining({ code: 'GUESTS_INVALID' }));
  });
});
