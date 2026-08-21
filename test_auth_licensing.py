import urllib.request
import urllib.error
import json
import time

BASE_URL = "http://127.0.0.1:8000"

def req(path, method="GET", data=None, token=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data else None
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))

def run_tests():
    print("--- 1. Testing GET /api/auth/me (Guest Mode) ---")
    status, res = req("/api/auth/me")
    print(f"Status: {status}, Response: {res}")
    assert status == 200 and res["authenticated"] is False

    print("\n--- 2. Testing POST /api/auth/register ---")
    email = f"testuser_{int(time.time())}@example.com"
    status, res = req("/api/auth/register", "POST", {
        "email": email,
        "password": "secretpassword123",
        "name": "Test Downloader Pro"
    })
    print(f"Status: {status}, User: {res.get('user')}")
    assert status == 200 and "token" in res
    token = res["token"]

    print("\n--- 3. Testing GET /api/auth/me (Authenticated) ---")
    status, res = req("/api/auth/me", token=token)
    print(f"Status: {status}, Me: {res}")
    assert status == 200 and res["authenticated"] is True
    assert res["user"]["email"] == email

    print("\n--- 4. Testing GET /api/license/plans ---")
    status, res = req("/api/license/plans")
    print(f"Status: {status}, Plans: {list(res['plans'].keys())}")
    assert "1month" in res["plans"] and "3month" in res["plans"] and "6month" in res["plans"] and "lifetime" in res["plans"]

    print("\n--- 5. Testing POST /api/license/activate (1 Month Key) ---")
    # Generate fresh 1M key
    _, gen_res = req("/api/license/generate", "POST", {"plan_type": "1month", "count": 1})
    key_1m = gen_res["keys"][0]
    status, res = req("/api/license/activate", "POST", {"license_key": key_1m}, token=token)
    print(f"Status: {status}, Success: {res.get('success')}, Plan: {res.get('plan_type')}")
    assert status == 200 and res["success"] is True and res["plan_type"] == "1month"

    print("\n--- 6. Testing GET /api/auth/me (Post-1M-Activation) ---")
    status, res = req("/api/auth/me", token=token)
    print(f"Status: {status}, Plan: {res['plan']['name']}, is_pro: {res['is_pro']}, Days Left: {res['days_remaining']}")
    assert res["is_pro"] is True and res["user"]["plan_type"] == "1month"

    print("\n--- 7. Testing Google Sign-in Endpoint /api/auth/google ---")
    g_email = f"googleuser_{int(time.time())}@gmail.com"
    status, g_res = req("/api/auth/google", "POST", {
        "email": g_email,
        "name": "Google VIP User",
        "google_id": "google_test_id_999"
    })
    print(f"Status: {status}, Google user: {g_res.get('user', {}).get('email')}")
    assert status == 200 and "token" in g_res
    g_token = g_res["token"]

    print("\n--- 8. Testing POST /api/license/activate (Lifetime Key on Google User) ---")
    _, gen_life = req("/api/license/generate", "POST", {"plan_type": "lifetime", "count": 1})
    key_life = gen_life["keys"][0]
    status, res = req("/api/license/activate", "POST", {"license_key": key_life}, token=g_token)
    print(f"Status: {status}, Success: {res.get('success')}, Plan: {res.get('plan_type')}")
    assert status == 200 and res["plan_type"] == "lifetime"

    print("\n--- 9. Testing GET /api/auth/me (Google User Lifetime Pro) ---")
    status, res = req("/api/auth/me", token=g_token)
    print(f"Status: {status}, Plan: {res['plan']['name']}, is_pro: {res['is_pro']}, Days: {res['days_remaining']}")
    assert res["user"]["plan_type"] == "lifetime"

    print("\n--- 10. Testing Admin Key Generator POST /api/license/generate ---")
    status, res = req("/api/license/generate", "POST", {"plan_type": "6month", "count": 3})
    print(f"Status: {status}, Generated 6M keys count: {len(res.get('keys', []))}")
    assert status == 200 and len(res.get("keys")) == 3
    new_6m_key = res["keys"][0]

    print(f"\n--- 11. Testing Activation of newly generated key: {new_6m_key} ---")
    status, res = req("/api/license/activate", "POST", {"license_key": new_6m_key}, token=token)
    print(f"Status: {status}, Success: {res.get('success')}, Plan: {res.get('plan_type')}")
    assert status == 200 and res["plan_type"] == "6month"

    print("\n[SUCCESS] ALL 11 AUTH & LICENSING TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_tests()
