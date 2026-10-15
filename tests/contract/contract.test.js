// Contract layer: schema validation for REST responses and GraphQL parity.
const request = require('supertest');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { createApp } = require('../../src/app');
const schemas = require('./schemas');

const ajv = new Ajv({ allErrors: true }); addFormats(ajv);
const app = createApp();
const expectSchema = (schema, body) => {
  const validate = ajv.compile(schema);
  const ok = validate(body);
  if (!ok) throw new Error('Contract violation: ' + ajv.errorsText(validate.errors));
};

describe('REST contracts', () => {
  test('[REQ-API-01] search response matches contract', async () => {
    const res = await request(app).get('/api/cruises');
    expectSchema(schemas.searchResponse, res.body);
  });

  test('[REQ-API-01] quote response matches contract', async () => {
    const res = await request(app).post('/api/quote').send({ cruiseId: 'CQL-201', cabinType: 'oceanview', guests: 3, promoCode: 'SAIL10' });
    expectSchema(schemas.quoteResponse, res.body);
  });

  test('[REQ-API-01] booking response matches contract and never exposes the full card', async () => {
    const res = await request(app).post('/api/bookings').send({
      cruiseId: 'CQL-201', cabinType: 'interior', guests: 2,
      guest: { firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com' }, payment: { cardNumber: '4242424242424242' }
    });
    expectSchema(schemas.bookingResponse, res.body);
    expect(JSON.stringify(res.body)).not.toContain('4242424242424242');
  });

  test('[REQ-API-01] error responses share one shape', async () => {
    const res = await request(app).post('/api/quote').send({ cruiseId: 'CQL-101', cabinType: 'yacht', guests: 2 });
    expectSchema(schemas.errorResponse, res.body);
  });
});

describe('GraphQL', () => {
  const gql = (query, variables) => request(app).post('/graphql').send({ query, variables });

  test('[REQ-GQL-01] GraphQL quote equals REST quote', async () => {
    const input = { cruiseId: 'CQL-101', cabinType: 'suite', guests: 2, promoCode: 'WAVE200' };
    const rest = await request(app).post('/api/quote').send(input);
    const res = await gql('query($c:ID!,$t:String!,$g:Int!,$p:String){ quote(cruiseId:$c,cabinType:$t,guests:$g,promoCode:$p){ fare discount taxes portFees total } }',
      { c: input.cruiseId, t: input.cabinType, g: input.guests, p: input.promoCode });
    expect(res.body.errors).toBeUndefined();
    const { fare, discount, taxes, portFees, total } = rest.body;
    expect(res.body.data.quote).toEqual({ fare, discount, taxes, portFees, total });
  });

  test('[REQ-GQL-01] GraphQL search filters by destination', async () => {
    const res = await gql('{ cruises(destination:"Mediterranean"){ id destination fromPrice } }');
    expect(res.body.data.cruises.length).toBeGreaterThan(0);
    res.body.data.cruises.forEach((c) => expect(c.destination).toBe('Mediterranean'));
  });

  test('[REQ-GQL-01] schema rejects unknown fields', async () => {
    const res = await gql('{ cruises { id cabinPrice } }');
    expect(res.body.errors[0].message).toMatch(/cabinPrice/);
  });
});
