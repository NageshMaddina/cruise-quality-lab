// API layer: REST service behaviour, including third-party payment outcomes.
const request = require('supertest');
const { createApp } = require('../../src/app');

const app = createApp();
const guest = { firstName: 'Ana', lastName: 'Lopez', email: 'ana@example.com' };
const book = (overrides = {}) => request(app).post('/api/bookings').send({
  cruiseId: 'CQL-101', cabinType: 'balcony', guests: 2, promoCode: 'SAIL10', guest,
  payment: { cardNumber: '4242 4242 4242 4242' }, ...overrides
});

describe('Search API', () => {
  test('[REQ-SEARCH-01] search by destination returns only that destination', async () => {
    const res = await request(app).get('/api/cruises?destination=Alaska').expect(200);
    expect(res.body.count).toBeGreaterThan(0);
    res.body.results.forEach((c) => expect(c.destination).toBe('Alaska'));
  });

  test('[REQ-SEARCH-02] max price filter excludes higher fares', async () => {
    const res = await request(app).get('/api/cruises?maxPrice=900').expect(200);
    res.body.results.forEach((c) => expect(c.fromPrice).toBeLessThanOrEqual(900));
  });

  test('[REQ-SEARCH-01] unknown cruise id returns 404', async () => {
    await request(app).get('/api/cruises/NOPE').expect(404);
  });
});

describe('Quote API', () => {
  test('[REQ-PROMO-03] expired promo gets a readable 400', async () => {
    const res = await request(app).post('/api/quote').send({ cruiseId: 'CQL-101', cabinType: 'interior', guests: 2, promoCode: 'FALL25' }).expect(400);
    expect(res.body.error.code).toBe('PROMO_EXPIRED');
    expect(res.body.error.message).toMatch(/expired/i);
  });

  test('[REQ-INV-01] sold-out cabin returns 409', async () => {
    const res = await request(app).post('/api/quote').send({ cruiseId: 'CQL-102', cabinType: 'suite', guests: 2 }).expect(409);
    expect(res.body.error.code).toBe('SOLD_OUT');
  });
});

describe('Booking API', () => {
  test('[REQ-PAY-01] approved card creates a confirmed booking charged at the quoted total', async () => {
    const q = await request(app).post('/api/quote').send({ cruiseId: 'CQL-101', cabinType: 'balcony', guests: 2, promoCode: 'SAIL10' });
    const res = await book().expect(201);
    expect(res.body.status).toBe('CONFIRMED');
    expect(res.body.bookingId).toMatch(/^BK-[0-9A-F]{8}$/);
    expect(res.body.quote.total).toBe(q.body.total);
    expect(res.body.payment.cardLast4).toBe('4242');
    await request(app).get('/api/bookings/' + res.body.bookingId).expect(200);
  });

  test('[REQ-PAY-02] declined card returns 402 and no booking', async () => {
    const res = await book({ payment: { cardNumber: '4000000000000002' } }).expect(402);
    expect(res.body.error.code).toBe('PAYMENT_DECLINED');
    expect(res.body.bookingId).toBeUndefined();
  });

  test('[REQ-PAY-03] gateway timeout tells the guest they were not charged', async () => {
    const res = await book({ payment: { cardNumber: '4000000000009995' } }).expect(503);
    expect(res.body.error.message).toMatch(/not been charged/);
  });

  test('[REQ-PAY-01] invalid email is rejected before payment', async () => {
    const res = await book({ guest: { ...guest, email: 'not-an-email' } }).expect(400);
    expect(res.body.error.code).toBe('GUEST_INVALID');
  });
});
