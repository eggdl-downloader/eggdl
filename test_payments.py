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
    print("--- 1. Testing GET /api/license/plans for Updated Pricing ---")
    status, res = req("/api/license/plans")
    plans = res["plans"]
    print("Plans returned:", {k: f"INR {v['price']} ({v.get('effective_monthly', '').replace('₹', 'INR ')})" for k, v in plans.items()})
    assert plans["1month"]["price"] == 99
    assert plans["3month"]["price"] == 249
    assert plans["6month"]["price"] == 499
    assert plans["1year"]["price"] == 799
    assert plans["lifetime"]["price"] == 1999

    print("\n--- 2. Registering Test User for Payment Checkout ---")
    email = f"payuser_{int(time.time())}@example.com"
    _, reg = req("/api/auth/register", "POST", {
        "email": email,
        "password": "strongpassword123",
        "name": "Arjun Sharma"
    })
    token = reg["token"]
    print(f"Registered User: {reg['user']['email']}")

    print("\n--- 3. Testing POST /api/payment/process (1 Month Pro via UPI) ---")
    status, pay_res = req("/api/payment/process", "POST", {
        "plan_type": "1month",
        "payment_method": "upi",
        "upi_id": "arjun@okaxis"
    }, token=token)
    print("Payment Status:", status, "Masked Key:", pay_res.get("masked_key"), "Txn:", pay_res.get("transaction_id"))
    assert status == 200 and pay_res["success"] is True
    assert pay_res["amount"] == 99
    assert "EGGDL-1M-" in pay_res["masked_key"]
    assert "**" in pay_res["masked_key"]

    print("\n--- 4. Checking User Profile After UPI 1M Payment ---")
    _, me = req("/api/auth/me", token=token)
    print(f"User is_pro: {me['is_pro']}, Plan: {me['plan']['name']}, Days Remaining: {me['days_remaining']}")
    assert me["is_pro"] is True
    assert me["user"]["plan_type"] == "1month"

    print("\n--- 5. Testing POST /api/payment/process (1 Year Pro via Card) ---")
    status, card_res = req("/api/payment/process", "POST", {
        "plan_type": "1year",
        "payment_method": "card",
        "card_number": "4532 8821 9912 0041",
        "card_expiry": "11/29",
        "card_cvv": "882",
        "card_name": "Arjun Sharma"
    }, token=token)
    print("Payment Status:", status, "Masked Key:", card_res.get("masked_key"), "Txn:", card_res.get("transaction_id"))
    assert status == 200 and card_res["amount"] == 799
    assert "EGGDL-1Y-" in card_res["masked_key"]

    print("\n--- 6. Checking User Profile After 1-Year Upgrade ---")
    _, me = req("/api/auth/me", token=token)
    print(f"User is_pro: {me['is_pro']}, Plan: {me['plan']['name']}, Days Remaining: {me['days_remaining']}")
    assert me["user"]["plan_type"] == "1year"
    assert me["days_remaining"] >= 360

    print("\n--- 7. Testing POST /api/payment/process (Lifetime Pro via Card) ---")
    status, life_res = req("/api/payment/process", "POST", {
        "plan_type": "lifetime",
        "payment_method": "card",
        "card_number": "5234 1120 4402 1199",
        "card_expiry": "12/30",
        "card_cvv": "102",
        "card_name": "Arjun Sharma"
    }, token=token)
    print("Payment Status:", status, "Masked Key:", life_res.get("masked_key"), "Txn:", life_res.get("transaction_id"))
    assert status == 200 and life_res["amount"] == 1999
    assert "EGGDL-LIFE-" in life_res["masked_key"]

    print("\n--- 8. Checking User Profile After Lifetime Pro Upgrade ---")
    _, me = req("/api/auth/me", token=token)
    print(f"User is_pro: {me['is_pro']}, Plan: {me['plan']['name']}, Days Remaining: {me['days_remaining']}")
    assert me["user"]["plan_type"] == "lifetime"
    assert me["days_remaining"] == 9999

    print("\n--- 9. Checking Payment History Endpoint /api/payment/history ---")
    status, hist_res = req("/api/payment/history", token=token)
    print(f"Payment History Records: {len(hist_res.get('payments', []))}")
    assert status == 200 and len(hist_res["payments"]) == 3

    print("\n[SUCCESS] ALL PAYMENT CHECKOUT & MASKED KEY AUTO-ACTIVATION TESTS PASSED!")

if __name__ == "__main__":
    run_tests()
