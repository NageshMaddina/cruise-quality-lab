// Published response contracts that web and mobile clients depend on.
const money = { type: 'number', minimum: 0 };

const cruiseSummary = {
  type: 'object',
  required: ['id', 'ship', 'destination', 'departurePort', 'departureDate', 'nights', 'fromPrice'],
  properties: {
    id: { type: 'string', pattern: '^CQL-\\d{3}$' },
    ship: { type: 'string', minLength: 1 },
    destination: { type: 'string' },
    departurePort: { type: 'string' },
    departureDate: { type: 'string', format: 'date' },
    nights: { type: 'integer', minimum: 1 },
    fromPrice: money
  },
  additionalProperties: false
};

const searchResponse = {
  type: 'object', required: ['count', 'results'],
  properties: { count: { type: 'integer' }, results: { type: 'array', items: cruiseSummary } },
  additionalProperties: false
};

const quoteResponse = {
  type: 'object',
  required: ['cruiseId', 'cabinType', 'guests', 'promoCode', 'currency', 'fare', 'discount', 'taxes', 'portFees', 'total'],
  properties: {
    cruiseId: { type: 'string' },
    cabinType: { enum: ['interior', 'oceanview', 'balcony', 'suite'] },
    guests: { type: 'integer', minimum: 1, maximum: 4 },
    promoCode: { type: ['string', 'null'] },
    currency: { const: 'USD' },
    fare: money, discount: money, taxes: money, portFees: money, total: money
  },
  additionalProperties: false
};

const bookingResponse = {
  type: 'object',
  required: ['bookingId', 'status', 'createdAt', 'guest', 'payment', 'quote'],
  properties: {
    bookingId: { type: 'string', pattern: '^BK-[0-9A-F]{8}$' },
    status: { const: 'CONFIRMED' },
    createdAt: { type: 'string', format: 'date-time' },
    guest: { type: 'object', required: ['firstName', 'lastName', 'email'], properties: { email: { type: 'string', format: 'email' } } },
    payment: {
      type: 'object', required: ['authCode', 'cardLast4'],
      properties: { authCode: { type: 'string' }, cardLast4: { type: 'string', pattern: '^\\d{4}$' } },
      additionalProperties: false // never return a full card number
    },
    quote: quoteResponse
  },
  additionalProperties: false
};

const errorResponse = {
  type: 'object', required: ['error'],
  properties: { error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' } } } }
};

module.exports = { searchResponse, quoteResponse, bookingResponse, errorResponse };
