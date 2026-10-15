const $ = (s) => document.querySelector(s);
const money = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const state = { cruise: null, quote: null };

function show(step) {
  for (const id of ['search', 'cabin', 'checkout', 'confirm']) $('#' + id).hidden = id !== step;
  document.querySelectorAll('.steps li').forEach((li) => li.classList.toggle('active', li.dataset.step === step));
  const h = $('#' + step + ' h1, #' + step + ' h2'); if (h) { h.tabIndex = -1; h.focus(); }
}

$('#search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const p = new URLSearchParams();
  if ($('#destination').value) p.set('destination', $('#destination').value);
  if ($('#maxPrice').value) p.set('maxPrice', $('#maxPrice').value);
  const data = await (await fetch('/api/cruises?' + p)).json();
  $('#result-count').textContent = `${data.count} cruise${data.count === 1 ? '' : 's'} found`;
  const ul = $('#results'); ul.innerHTML = '';
  for (const c of data.results) {
    const li = document.createElement('li');
    li.className = 'card'; li.dataset.testid = 'cruise-card'; li.setAttribute('data-testid', 'cruise-card');
    li.innerHTML = `<h3>${c.nights}-night ${c.destination}</h3>
      <p>${c.ship} · from ${c.departurePort}</p><p class="muted">Departs ${c.departureDate}</p>
      <p class="price">From ${money(c.fromPrice)} <span class="muted small">per guest</span></p>
      <button type="button" data-id="${c.id}">Select ${c.ship}</button>`;
    li.querySelector('button').addEventListener('click', () => selectCruise(c.id));
    ul.appendChild(li);
  }
});

async function selectCruise(id) {
  state.cruise = await (await fetch('/api/cruises/' + id)).json();
  state.quote = null;
  $('#cruise-title').textContent = `${state.cruise.ship} · ${state.cruise.nights} nights · departs ${state.cruise.departureDate}`;
  const box = $('#cabin-options'); box.innerHTML = '';
  state.cruise.cabins.forEach((cab, i) => {
    const label = document.createElement('label'); label.className = 'cabin';
    label.innerHTML = `<input type="radio" name="cabinType" value="${cab.type}" ${cab.available ? '' : 'disabled'} ${i === 0 ? 'checked' : ''}> ${cab.type[0].toUpperCase() + cab.type.slice(1)} ${cab.available ? '' : '(sold out)'}`;
    box.appendChild(label);
  });
  $('#quote').hidden = true; $('#quote-error').textContent = ''; $('#to-checkout').disabled = true; $('#promo').value = '';
  show('cabin');
}

$('#quote-btn').addEventListener('click', async () => {
  const cabin = document.querySelector('input[name=cabinType]:checked');
  const body = { cruiseId: state.cruise.id, cabinType: cabin && cabin.value, guests: Number($('#guests').value), promoCode: $('#promo').value || undefined };
  const res = await fetch('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) { $('#quote-error').textContent = data.error.message; $('#quote').hidden = true; $('#to-checkout').disabled = true; return; }
  state.quote = data; $('#quote-error').textContent = '';
  $('#q-fare').textContent = money(data.fare);
  $('#q-discount').textContent = data.discount ? '−' + money(data.discount) + ` (${data.promoCode})` : 'None';
  $('#q-taxes').textContent = money(data.taxes);
  $('#q-port').textContent = money(data.portFees);
  $('#q-total').textContent = money(data.total);
  $('#quote').hidden = false; $('#to-checkout').disabled = false;
});

$('#to-checkout').addEventListener('click', () => { $('#pay-total').textContent = 'Amount due today: ' + money(state.quote.total); $('#pay-error').textContent = ''; show('checkout'); });

$('#checkout-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#pay-btn'); btn.disabled = true; btn.textContent = 'Processing…';
  const q = state.quote;
  const body = { cruiseId: q.cruiseId, cabinType: q.cabinType, guests: q.guests, promoCode: q.promoCode || undefined,
    guest: { firstName: $('#firstName').value.trim(), lastName: $('#lastName').value.trim(), email: $('#email').value.trim() },
    payment: { cardNumber: $('#card').value } };
  try {
    const res = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { $('#pay-error').textContent = data.error.message; return; }
    $('#booking-id').textContent = data.bookingId;
    $('#confirm-summary').textContent = `${data.guest.firstName}, your ${data.quote.cabinType} cabin for ${data.quote.guests} is confirmed. Charged ${money(data.quote.total)} to card ending ${data.payment.cardLast4}. A confirmation was sent to ${data.guest.email}.`;
    show('confirm');
  } finally { btn.disabled = false; btn.textContent = 'Pay and book'; }
});

document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => show(b.dataset.back)));
$('#new-search').addEventListener('click', () => { $('#checkout-form').reset(); show('search'); });
