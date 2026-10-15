const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { createHandler } = require('graphql-http/lib/use/express');
const { cruises } = require('./data');
const { quote, PricingError } = require('./pricing');
const payment = require('./payment');
const { schema, rootValue } = require('./graphql');

function createApp() {
  const app = express();
  const bookings = new Map();
  app.use(express.json());

  // Lightweight request log: what an observability pipeline (OpenTelemetry etc.) would collect.
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      if (process.env.LOG_REQUESTS) console.log(JSON.stringify({ method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start }));
    });
    next();
  });

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  app.get('/api/cruises', (req, res) => {
    const { destination, month, maxPrice } = req.query;
    let list = cruises;
    if (destination) list = list.filter((c) => c.destination.toLowerCase() === String(destination).toLowerCase());
    if (month) list = list.filter((c) => c.departureDate.startsWith(String(month)));
    if (maxPrice) list = list.filter((c) => c.baseFare <= Number(maxPrice));
    res.json({ count: list.length, results: list.map(summary) });
  });

  app.get('/api/cruises/:id', (req, res) => {
    const c = cruises.find((x) => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: { code: 'CRUISE_NOT_FOUND', message: 'Cruise not found' } });
    res.json(detail(c));
  });

  app.post('/api/quote', (req, res) => {
    try {
      const { cruiseId, cabinType, guests, promoCode } = req.body || {};
      res.json(quote({ cruise: cruises.find((c) => c.id === cruiseId), cabinType, guests, promoCode }));
    } catch (e) { sendError(res, e); }
  });

  app.post('/api/bookings', async (req, res) => {
    try {
      const { cruiseId, cabinType, guests, promoCode, guest, payment: pay } = req.body || {};
      if (!guest || !guest.firstName || !guest.lastName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guest.email || '')) {
        return res.status(400).json({ error: { code: 'GUEST_INVALID', message: 'Guest first name, last name and a valid email are required' } });
      }
      const q = quote({ cruise: cruises.find((c) => c.id === cruiseId), cabinType, guests, promoCode });
      const auth = await payment.authorize({ cardNumber: pay && pay.cardNumber, amount: q.total });
      if (auth.status === 'invalid_card') return res.status(400).json({ error: { code: 'CARD_INVALID', message: 'Card number is not valid' } });
      if (auth.status === 'declined') return res.status(402).json({ error: { code: 'PAYMENT_DECLINED', message: 'Payment was declined. Try another card.' } });
      if (auth.status === 'gateway_error') return res.status(503).json({ error: { code: 'PAYMENT_UNAVAILABLE', message: 'Payment service is unavailable. You have not been charged.' } });
      const booking = {
        bookingId: 'BK-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        status: 'CONFIRMED', createdAt: new Date().toISOString(),
        guest: { firstName: guest.firstName, lastName: guest.lastName, email: guest.email },
        payment: { authCode: auth.authCode, cardLast4: String(pay.cardNumber).replace(/\s+/g, '').slice(-4) },
        quote: q
      };
      bookings.set(booking.bookingId, booking);
      res.status(201).json(booking);
    } catch (e) { sendError(res, e); }
  });

  app.get('/api/bookings/:id', (req, res) => {
    const b = bookings.get(req.params.id);
    if (!b) return res.status(404).json({ error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found' } });
    res.json(b);
  });

  app.all('/graphql', createHandler({ schema, rootValue }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  return app;
}

const summary = (c) => ({ id: c.id, ship: c.ship, destination: c.destination, departurePort: c.departurePort, departureDate: c.departureDate, nights: c.nights, fromPrice: c.baseFare });
const detail = (c) => ({ ...summary(c), cabins: Object.entries(c.capacity).map(([type, left]) => ({ type, available: left > 0 })) });

function sendError(res, e) {
  if (e instanceof PricingError) {
    const status = e.code === 'CRUISE_NOT_FOUND' ? 404 : e.code === 'SOLD_OUT' ? 409 : 400;
    return res.status(status).json({ error: { code: e.code, message: e.message } });
  }
  console.error(e);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Unexpected error' } });
}

module.exports = { createApp };
