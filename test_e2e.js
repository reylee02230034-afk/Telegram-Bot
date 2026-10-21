const http = require('http');

const BASE = 'http://localhost:3000';
const cookies = { cust: '', prov: '', admin: '' };

function req(method, path, data, jarName) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const body = data ? JSON.stringify(data) : null;
    const opts = {
      hostname: url.hostname, port: url.port,
      path: url.pathname + url.search, method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (jarName && cookies[jarName]) opts.headers['Cookie'] = cookies[jarName];
    const r = http.request(opts, (resp) => {
      let d = '';
      resp.on('data', c => d += c);
      resp.on('end', () => {
        if (resp.headers['set-cookie']) {
          const sc = resp.headers['set-cookie'].map(s => s.split(';')[0]).join('; ');
          if (jarName) cookies[jarName] = (cookies[jarName] ? cookies[jarName] + '; ' : '') + sc;
        }
        try { resolve({ status: resp.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: resp.statusCode, body: d }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

async function run() {
  let passed = 0, failed = 0;
  const ok = (label, cond, detail='') => {
    if (cond) { passed++; console.log(`  ✅ ${label}`); }
    else { failed++; console.log(`  ❌ ${label} ${detail}`); }
  };

  console.log('=== 1. CUSTOMER LOGIN ===');
  let r = await req('POST', '/api/auth/login', { telegramId: '100000001' }, 'cust');
  ok('HTTP 200', r.status === 200, `got ${r.status}`);
  ok('ok=true', r.body.ok);
  ok('role=USER', r.body.user.role === 'USER');

  console.log('\n=== 2. PROVIDER LOGIN ===');
  r = await req('POST', '/api/auth/login', { telegramId: '200000001' }, 'prov');
  ok('HTTP 200', r.status === 200);
  ok('role=PROVIDER', r.body.user.role === 'PROVIDER');
  ok('isProvider=true', r.body.user.isProvider === true);
  const providerId = r.body.user.providerId;

  console.log('\n=== 3. SEARCH PROVIDERS ===');
  r = await req('GET', '/api/providers/search?lat=39.9042&lon=116.4074&radiusKm=10&sortBy=distance', null, 'cust');
  ok('HTTP 200', r.status === 200);
  ok('total >= 3', r.body.total >= 3, `got ${r.body.total}`);
  ok('sorted by distance', r.body.providers.every((p,i) => i === 0 || p.distanceKm >= r.body.providers[i-1].distanceKm));
  r.body.providers.forEach(p => console.log(`    📍 ${p.distanceKm.toFixed(1)}km - ${p.businessName} (${p.category.nameZh})`));

  console.log('\n=== 4. PROVIDER DETAIL ===');
  r = await req('GET', `/api/providers/${providerId}`, null, 'cust');
  ok('HTTP 200', r.status === 200);
  ok('approvalStatus=APPROVED', r.body.provider.approvalStatus === 'APPROVED');
  ok('isOpen=true', r.body.provider.isOpen === true);
  ok('has services', r.body.provider.services.length >= 1);
  ok('has geohash4', !!r.body.provider.geohash4);
  const firstServiceId = r.body.provider.services[0].id;
  const lat1 = r.body.provider.latitude;
  console.log(`    lat=${lat1.toFixed(4)} (obfuscated ~5km precision)`);

  console.log('\n=== 5. CREATE BOOKING ===');
  const futureDate = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  r = await req('POST', '/api/bookings', {
    providerId,
    items: [{ serviceId: firstServiceId, quantity: 1 }],
    scheduledAt: futureDate,
    notes: 'E2E测试预约'
  }, 'cust');
  ok('HTTP 200', r.status === 200, `got ${r.status}: ${JSON.stringify(r.body)}`);
  ok('ok=true', r.body.ok);
  ok('totalPrice > 0', r.body.booking?.totalPrice > 0);
  ok('status=PENDING', r.body.booking?.status === 'PENDING');
  const bookingId = r.body.booking?.id;
  if (bookingId) console.log(`    bookingId=${bookingId} total=¥${r.body.booking.totalPrice} duration=${r.body.booking.durationMin}min`);

  console.log('\n=== 6. TOGGLE OPEN (CLOSE) ===');
  r = await req('POST', `/api/providers/${providerId}/toggle-open`, { isOpen: false }, 'prov');
  ok('HTTP 200', r.status === 200);
  ok('ok=true', r.body.ok);
  ok('isOpen=false', r.body.isOpen === false);

  console.log('\n=== 7. SEARCH AFTER CLOSE ===');
  r = await req('GET', '/api/providers/search?lat=39.9042&lon=116.4074&radiusKm=10', null, 'cust');
  ok('total decreased to 3', r.body.total === 3, `got ${r.body.total}`);
  ok('beauty NOT in results', !r.body.providers.find(p => p.businessName.includes('美发')));

  console.log('\n=== 8. TOGGLE OPEN (REOPEN) ===');
  r = await req('POST', `/api/providers/${providerId}/toggle-open`, {}, 'prov');
  ok('isOpen=true again', r.body.isOpen === true);

  console.log('\n=== 9. REPORT PROVIDER ===');
  r = await req('POST', '/api/reports', {
    targetType: 'PROVIDER', targetId: providerId, reason: 'SPAM', description: 'E2E测试举报'
  }, 'cust');
  ok('HTTP 200', r.status === 200);

  console.log('\n=== 10. MY BOOKINGS ===');
  r = await req('GET', '/api/bookings/mine', null, 'cust');
  ok('HTTP 200', r.status === 200);
  ok('has 1+ bookings', r.body.bookings?.length >= 1);
  if (r.body.bookings?.length >= 1) console.log(`    bookingId=${r.body.bookings[0].id} status=${r.body.bookings[0].status}`);

  console.log('\n=== 11. UNAUTH ACCESS ===');
  r = await req('GET', '/api/bookings/mine');
  ok('HTTP 401', r.status === 401, `got ${r.status}`);

  console.log('\n=== 12. ADMIN LOGIN ===');
  r = await req('POST', '/api/auth/login', { telegramId: '999999999' }, 'admin');
  ok('role=ADMIN', r.body.user.role === 'ADMIN', `got ${r.body.user.role}`);

  console.log('\n=== 13. CATEGORIES API ===');
  r = await req('GET', '/api/categories');
  ok('HTTP 200', r.status === 200);
  ok('12 categories', r.body.categories.length === 12, `got ${r.body.categories.length}`);

  console.log('\n=== 14. SEARCH WITH CATEGORY FILTER ===');
  r = await req('GET', '/api/providers/search?lat=39.9042&lon=116.4074&radiusKm=10&category=health', null, 'cust');
  ok('HTTP 200', r.status === 200, `got ${r.status}: ${JSON.stringify(r.body)}`);
  ok('all health category', r.body.providers.every(p => p.category.name === 'health'), `got ${r.body.providers.map(p => p.category.name)}`);

  console.log('\n=== 15. SEARCH WITH PRICE FILTER ===');
  r = await req('GET', '/api/providers/search?lat=39.9042&lon=116.4074&radiusKm=10&minPrice=50&maxPrice=100', null, 'cust');
  ok('HTTP 200', r.status === 200);

  console.log('\n=== 16. AUDIT LOGS (Admin) ===');
  r = await req('GET', '/api/admin/audit-logs', null, 'admin');
  ok('HTTP 200', r.status === 200, `got ${r.status}`);

  console.log('\n=== 17. AUDIT LOGS (unauth expect 401) ===');
  r = await req('GET', '/api/admin/audit-logs');
  ok('HTTP 401', r.status === 401, `got ${r.status}`);

  console.log('\n=== 18. ADMIN REPORTS LIST ===');
  r = await req('GET', '/api/admin/reports', null, 'admin');
  ok('HTTP 200', r.status === 200, `got ${r.status}: ${JSON.stringify(r.body).slice(0,200)}`);

  console.log('\n=== 19. BOOKING DETAIL ===');
  if (bookingId) {
    r = await req('GET', `/api/bookings/${bookingId}`, null, 'cust');
    ok('HTTP 200', r.status === 200, `got ${r.status}`);
    ok('ok=true', r.body.ok);
  }

  console.log('\n============================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================');
  process.exit(failed === 0 ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(1); });
