import urllib.request, json, http.cookiejar, sys

BASE = "http://localhost:3000"
cj_cust = http.cookiejar.MozillaCookieJar()
cj_prov = http.cookiejar.MozillaCookieJar()
cj_admin = http.cookiejar.MozillaCookieJar()

def req(method, path, data=None, cj=None):
    url = BASE + path
    body = json.dumps(data).encode() if data else None
    r = urllib.request.Request(url, data=body, method=method)
    r.add_header("Content-Type", "application/json")
    handlers = [urllib.request.HTTPCookieProcessor(cj)] if cj else []
    opener = urllib.request.build_opener(*handlers)
    try:
        resp = opener.open(r)
        return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body_txt = e.read().decode()
        try:
            return e.code, json.loads(body_txt)
        except:
            return e.code, body_txt

def check(label, expect_ok, expect_status=None, extra_check=None):
    print(f"\n{'='*60}\n{label}")
    print('='*60)

passed = 0; failed = 0

def assert_ok(label, cond, detail=""):
    global passed, failed
    if cond: passed += 1; print(f"  ✅ {label}")
    else: failed += 1; print(f"  ❌ {label} {detail}")

# 1. Customer Login
check("1. CUSTOMER LOGIN", True)
s, d = req("POST", "/api/auth/login", {"telegramId": "100000001"}, cj_cust)
assert_ok("HTTP 200", s == 200, f"got {s}")
assert_ok("ok=true", d.get("ok"), f"got {d}")
assert_ok("role=USER", d["user"]["role"] == "USER", f"got {d['user']['role']}")

# 2. Provider Login
check("2. PROVIDER LOGIN (beauty_li)", True)
s, d = req("POST", "/api/auth/login", {"telegramId": "200000001"}, cj_prov)
assert_ok("HTTP 200", s == 200)
assert_ok("role=PROVIDER", d["user"]["role"] == "PROVIDER")
assert_ok("isProvider=true", d["user"]["isProvider"] == True)
provider_id = d["user"]["providerId"]

# 3. Search Providers
check("3. SEARCH PROVIDERS (10km Beijing)", True)
s, d = req("GET", "/api/providers/search?lat=39.9042&lon=116.4074&radiusKm=10&sortBy=distance", cj=cj_cust)
assert_ok("HTTP 200", s == 200)
assert_ok("total >= 3", d["total"] >= 3, f"got {d['total']}")
names = [p["businessName"] for p in d["providers"]]
assert_ok("beauty included", "丽人美发工作室" in names)
assert_ok("sorted by distance", all(d["providers"][i]["distanceKm"] <= d["providers"][i+1]["distanceKm"] for i in range(len(d["providers"])-1)))
for p in d["providers"]:
    print(f"    📍 {p['distanceKm']:.1f}km - {p['businessName']} ({p['category']['nameZh']})")

# 4. Provider Detail
check("4. PROVIDER DETAIL", True)
s, d = req("GET", f"/api/providers/{provider_id}", cj=cj_cust)
assert_ok("HTTP 200", s == 200)
assert_ok("ok=true", d.get("ok"))
p = d["provider"]
assert_ok("isOpen=true", p["isOpen"] == True)
assert_ok("approvalStatus=APPROVED", p["approvalStatus"] == "APPROVED")
assert_ok("has services", len(p["services"]) >= 2)
service_id = p["services"][0]["id"]
print(f"    {p['businessName']} | open={p['isOpen']} | approved={p['approvalStatus']}")
for svc in p["services"]:
    print(f"      💰 {svc['nameZh']} - ¥{svc['price']} ({svc['priceUnit']})")

# 5. Create Booking
check("5. CREATE BOOKING", True)
s, d = req("POST", "/api/bookings", {
    "providerId": provider_id,
    "items": [{"serviceItemId": service_id, "quantity": 1}],
    "scheduledAt": "2026-10-21T14:00:00Z",
    "note": "E2E测试预约"
}, cj_cust)
assert_ok("HTTP 200", s == 200, f"got {s} body={d}")
assert_ok("ok=true", d.get("ok"))
booking_id = d["booking"]["id"]
assert_ok("totalAmount > 0", d["booking"]["totalAmount"] > 0)
assert_ok("status=PENDING", d["booking"]["status"] == "PENDING")
print(f"    bookingId={booking_id} total=¥{d['booking']['totalAmount']}")

# 6. Toggle Open (close)
check("6. TOGGLE OPEN (close shop)", True)
s, d = req("POST", f"/api/providers/{provider_id}/toggle-open", {"isOpen": False}, cj_prov)
assert_ok("HTTP 200", s == 200)
assert_ok("isOpen=false", d["provider"]["isOpen"] == False)

# 7. Search after close - provider should disappear!
check("7. SEARCH AFTER CLOSE (beauty GONE)", True)
s, d = req("GET", "/api/providers/search?lat=39.9042&lon=116.4074&radiusKm=10", cj=cj_cust)
assert_ok("total decreased", d["total"] == 3, f"got {d['total']}, expected 3 (beauty closed)")
names2 = [p["businessName"] for p in d["providers"]]
assert_ok("beauty NOT in results", "丽人美发工作室" not in names2)

# 8. Reopen
check("8. REOPEN", True)
s, d = req("POST", f"/api/providers/{provider_id}/toggle-open", {"isOpen": True}, cj_prov)
assert_ok("isOpen=true again", d["provider"]["isOpen"] == True)

# 9. Report
check("9. REPORT PROVIDER", True)
s, d = req("POST", "/api/reports", {
    "targetType": "PROVIDER",
    "targetId": provider_id,
    "reason": "SPAM",
    "description": "E2E测试举报"
}, cj_cust)
assert_ok("HTTP 200", s == 200)

# 10. My Bookings
check("10. MY BOOKINGS", True)
s, d = req("GET", "/api/bookings/mine", cj=cj_cust)
assert_ok("HTTP 200", s == 200)
assert_ok("has bookings", len(d["bookings"]) >= 1)

# 11. Unauthorized access
check("11. UNAUTH ACCESS (expect 401)", True)
s, d = req("GET", "/api/providers")
assert_ok("HTTP 401", s == 401, f"got {s}")

# 12. Admin Login & Admin API
check("12. ADMIN LOGIN", True)
s, d = req("POST", "/api/auth/login", {"telegramId": "999999999"}, cj_admin)
assert_ok("role=ADMIN", d["user"]["role"] == "ADMIN", f"got {d['user']['role']}")

# 13. Categories API
check("13. CATEGORIES API", True)
s, d = req("GET", "/api/categories")
assert_ok("HTTP 200", s == 200)
assert_ok("12 categories", len(d["categories"]) == 12, f"got {len(d['categories'])}")

# 14. Search with price filter
check("14. SEARCH WITH PRICE FILTER", True)
s, d = req("GET", "/api/providers/search?lat=39.9042&lon=116.4074&radiusKm=10&minPrice=50&maxPrice=100", cj=cj_cust)
assert_ok("HTTP 200", s == 200)
for p in d["providers"]:
    min_p = min((svc["price"] for svc in p["services"]), default=0)
    assert_ok(f"{p['businessName']} has service in range", min_p <= 100)

# 15. Search with category filter
check("15. SEARCH WITH CATEGORY FILTER (health)", True)
s, d = req("GET", "/api/providers/search?lat=39.9042&lon=116.4074&radiusKm=10&category=health", cj=cj_cust)
assert_ok("HTTP 200", s == 200)
for p in d["providers"]:
    assert_ok(f"{p['businessName']} is health", p["category"]["name"] == "health")

print(f"\n{'='*60}")
print(f"RESULTS: {passed} PASSED, {failed} FAILED")
print(f"{'='*60}")
sys.exit(0 if failed == 0 else 1)
