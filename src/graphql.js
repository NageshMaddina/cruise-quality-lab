const { buildSchema } = require('graphql');
const { cruises } = require('./data');
const { quote } = require('./pricing');

const schema = buildSchema(`
  type Cruise {
    id: ID!
    ship: String!
    destination: String!
    departurePort: String!
    departureDate: String!
    nights: Int!
    fromPrice: Float!
  }
  type Quote {
    cruiseId: ID!
    cabinType: String!
    guests: Int!
    promoCode: String
    currency: String!
    fare: Float!
    discount: Float!
    taxes: Float!
    portFees: Float!
    total: Float!
  }
  type Query {
    cruises(destination: String): [Cruise!]!
    cruise(id: ID!): Cruise
    quote(cruiseId: ID!, cabinType: String!, guests: Int!, promoCode: String): Quote!
  }
`);

const toCruise = (c) => ({ ...c, fromPrice: c.baseFare });

const rootValue = {
  cruises: ({ destination }) => cruises
    .filter((c) => !destination || c.destination.toLowerCase() === destination.toLowerCase())
    .map(toCruise),
  cruise: ({ id }) => { const c = cruises.find((x) => x.id === id); return c ? toCruise(c) : null; },
  quote: ({ cruiseId, cabinType, guests, promoCode }) =>
    quote({ cruise: cruises.find((c) => c.id === cruiseId), cabinType, guests, promoCode })
};

module.exports = { schema, rootValue };
