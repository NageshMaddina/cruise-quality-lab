// Pricing and promotion rules. Pure functions so they can be unit tested in isolation.
const { cabinMultipliers, promotions, TAX_RATE, PORT_FEE_PER_GUEST } = require('./data');

const bug = () => process.env.DEMO_BUG || '';
const round2 = (n) => Math.round(n * 100) / 100;

class PricingError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function validatePromo(code, guests, today = new Date()) {
  if (!code) return null;
  const promo = promotions[String(code).trim().toUpperCase()];
  if (!promo) throw new PricingError('PROMO_INVALID', `Promo code ${code} is not valid`);
  if (new Date(promo.expires + 'T23:59:59Z') < today) throw new PricingError('PROMO_EXPIRED', `Promo code ${code} has expired`);
  if (promo.minGuests && guests < promo.minGuests) throw new PricingError('PROMO_MIN_GUESTS', `Promo code ${code} needs at least ${promo.minGuests} guests`);
  return promo;
}

function quote({ cruise, cabinType, guests, promoCode, today }) {
  if (!cruise) throw new PricingError('CRUISE_NOT_FOUND', 'Cruise not found');
  if (!(cabinType in cabinMultipliers)) throw new PricingError('CABIN_INVALID', `Unknown cabin type ${cabinType}`);
  if (!Number.isInteger(guests) || guests < 1 || guests > 4) throw new PricingError('GUESTS_INVALID', 'Guests must be between 1 and 4');
  if (!cruise.capacity[cabinType]) throw new PricingError('SOLD_OUT', `${cabinType} cabins are sold out on ${cruise.id}`);

  const fare = round2(cruise.baseFare * cabinMultipliers[cabinType] * guests);
  const promo = validatePromo(promoCode, guests, today);
  let discount = 0;
  if (promo) discount = promo.type === 'percent' ? round2(fare * promo.value / 100) : promo.value;
  if (bug() === 'promo_stack' && promo) discount = discount * 2; // injected defect: promo applied twice
  discount = Math.min(discount, fare);

  const taxable = fare - discount;
  const taxes = bug() === 'no_taxes' ? 0 : round2(taxable * TAX_RATE); // injected defect: taxes dropped
  const portFees = PORT_FEE_PER_GUEST * guests;
  const total = round2(taxable + taxes + portFees);

  return {
    cruiseId: cruise.id, cabinType, guests,
    promoCode: promo ? String(promoCode).toUpperCase() : null,
    currency: 'USD', fare, discount: round2(discount), taxes, portFees, total
  };
}

module.exports = { quote, validatePromo, PricingError };
