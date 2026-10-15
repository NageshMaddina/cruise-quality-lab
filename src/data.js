// Fictional sailing catalog for the demo. Not real Princess Cruises data.
const cruises = [
  { id: 'CQL-101', ship: 'Ocean Aurora', destination: 'Caribbean', departurePort: 'Fort Lauderdale', departureDate: '2026-12-05', nights: 7, baseFare: 899, capacity: { interior: 40, oceanview: 20, balcony: 10, suite: 2 } },
  { id: 'CQL-102', ship: 'Coral Horizon', destination: 'Caribbean', departurePort: 'Fort Lauderdale', departureDate: '2027-01-16', nights: 10, baseFare: 1299, capacity: { interior: 30, oceanview: 15, balcony: 8, suite: 0 } },
  { id: 'CQL-201', ship: 'Glacier Star', destination: 'Alaska', departurePort: 'Seattle', departureDate: '2027-05-22', nights: 7, baseFare: 1099, capacity: { interior: 25, oceanview: 25, balcony: 12, suite: 4 } },
  { id: 'CQL-301', ship: 'Azure Muse', destination: 'Mediterranean', departurePort: 'Barcelona', departureDate: '2027-06-10', nights: 12, baseFare: 1899, capacity: { interior: 20, oceanview: 10, balcony: 6, suite: 2 } },
  { id: 'CQL-401', ship: 'Pacific Lark', destination: 'Mexico', departurePort: 'Los Angeles', departureDate: '2026-11-21', nights: 5, baseFare: 549, capacity: { interior: 50, oceanview: 0, balcony: 15, suite: 1 } }
];

const cabinMultipliers = { interior: 1.0, oceanview: 1.25, balcony: 1.6, suite: 2.75 };

const promotions = {
  SAIL10: { type: 'percent', value: 10, expires: '2027-12-31', description: '10% off cruise fare' },
  WAVE200: { type: 'flat', value: 200, minGuests: 2, expires: '2027-03-31', description: '$200 off bookings of 2+ guests' },
  FALL25: { type: 'percent', value: 25, expires: '2025-11-30', description: 'Expired fall sale' }
};

module.exports = { cruises, cabinMultipliers, promotions, TAX_RATE: 0.12, PORT_FEE_PER_GUEST: 135 };
