// Mock third-party payment gateway. Uses public-style test card numbers only; no real payments.
const TEST_CARDS = {
  '4242424242424242': 'approved',
  '4000000000000002': 'declined',
  '4000000000009995': 'gateway_timeout'
};

function luhn(num) {
  let sum = 0, alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = Number(num[i]);
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d; alt = !alt;
  }
  return sum % 10 === 0;
}

async function authorize({ cardNumber, amount }) {
  const card = String(cardNumber || '').replace(/\s+/g, '');
  if (!/^\d{16}$/.test(card) || !luhn(card)) return { status: 'invalid_card' };
  const outcome = TEST_CARDS[card] || 'declined';
  if (outcome === 'gateway_timeout') return { status: 'gateway_error' };
  if (process.env.DEMO_BUG === 'payment_down') return { status: 'gateway_error' };
  if (outcome === 'approved') return { status: 'approved', authCode: 'AUTH' + Math.floor(100000 + Math.random() * 900000), amount };
  return { status: 'declined' };
}

module.exports = { authorize, luhn };
