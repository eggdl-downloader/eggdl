import os
import time
import json
import base64
import hmac
import hashlib
import secrets
from typing import Dict, Any, Optional, Tuple
from datetime import datetime, timedelta

# Secret key for JWT/HMAC token signing (persisted or generated)
SECRET_KEY = os.environ.get("EGGDL_SECRET_KEY", "eggdl-super-secret-production-key-2026-auth-v1")

PLAN_CONFIGS = {
    "trial": {
        "name": "7-Day Free Trial",
        "tier_name": "7-Day Free Trial",
        "price": 0,
        "effective_monthly": "Free Trial",
        "duration_days": 7,
        "badge": "7-Day Trial",
        "max_downloads_per_day": None,
        "max_threads": 16,
        "max_concurrent": 3,
        "max_resolution": "4K",
        "features": [
            "Unlimited Downloads",
            "16 Turbo Acceleration Threads",
            "Up to 4K Ultra HD Support",
            "3 Simultaneous Downloads",
            "Full Features Included"
        ]
    },
    "free": {
        "name": "Trial Expired",
        "tier_name": "Trial Expired",
        "price": 0,
        "effective_monthly": "Expired",
        "duration_days": 0,
        "badge": "Expired",
        "max_downloads_per_day": 0,
        "max_threads": 1,
        "max_concurrent": 0,
        "max_resolution": "None",
        "features": [
            "Trial Ended - Enter product key or purchase a plan to unlock"
        ]
    },
    "1month": {
        "name": "Starter",
        "tier_name": "Starter",
        "price": 99,
        "effective_monthly": "₹99/mo",
        "duration_days": 30,
        "badge": "Starter",
        "max_downloads_per_day": None,
        "max_threads": 16,
        "max_concurrent": 2,
        "max_resolution": "4K",
        "features": [
            "16 Turbo Threads",
            "Up to 4K Ultra HD Support",
            "2 Simultaneous Downloads",
            "Standard Download Engine"
        ]
    },
    "3month": {
        "name": "Pro",
        "tier_name": "Pro",
        "price": 249,
        "effective_monthly": "₹83/mo",
        "duration_days": 90,
        "badge": "Pro",
        "max_downloads_per_day": None,
        "max_threads": 24,
        "max_concurrent": 5,
        "max_resolution": "8K",
        "features": [
            "All 1 Month Features +",
            "24 Turbo Threads",
            "Full 8K Ultra HD Support",
            "5 Simultaneous Downloads",
            "Priority Acceleration Engine"
        ]
    },
    "6month": {
        "name": "Elite",
        "tier_name": "Elite",
        "price": 449,
        "effective_monthly": "₹74.83/mo",
        "duration_days": 180,
        "badge": "Elite",
        "max_downloads_per_day": None,
        "max_threads": 32,
        "max_concurrent": 10,
        "max_resolution": "8K",
        "features": [
            "All 3 Months Features +",
            "32 Turbo Threads",
            "10 Simultaneous Downloads",
            "Smart Media Sniffer & Link Grabber",
            "Auto-Resume Broken Downloads"
        ]
    },
    "1year": {
        "name": "Ultra Elite",
        "tier_name": "Ultra Elite",
        "price": 699,
        "effective_monthly": "₹58.25/mo",
        "duration_days": 365,
        "badge": "Ultra Elite",
        "max_downloads_per_day": None,
        "max_threads": 48,
        "max_concurrent": 20,
        "max_resolution": "8K",
        "features": [
            "All 6 Months Features +",
            "48 Max Turbo Threads",
            "20 Simultaneous Downloads",
            "VIP Dedicated Pipeline Speeds",
            "Automatic Subtitle & Audio Track Extractor"
        ]
    },
    "lifetime": {
        "name": "Ultimate Pass",
        "tier_name": "Ultimate Pass",
        "price": 1499,
        "effective_monthly": "One-time",
        "duration_days": 36500,
        "badge": "Ultimate Pass",
        "max_downloads_per_day": None,
        "max_threads": 64,
        "max_concurrent": 999,
        "max_resolution": "8K / 4K / HDR",
        "features": [
            "Unlimited Everything",
            "Infinite Concurrent Downloads",
            "8K / 4K / HDR Original Quality",
            "Direct Priority Bandwidth Route",
            "All Future Updates & VIP Features Included"
        ]
    }
}

# --- Password Hashing with PBKDF2 ---
def hash_password(password: str) -> str:
    """Hash password using PBKDF2 with SHA256 and a random salt."""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000)
    return f"{salt}${key.hex()}"

def verify_password(password: str, stored_hash: str) -> bool:
    """Verify password against stored salt$hash."""
    try:
        salt, key_hex = stored_hash.split('$', 1)
        key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000)
        return hmac.compare_digest(key.hex(), key_hex)
    except Exception:
        return False

# --- Lightweight HMAC-SHA256 Token Handling ---
def create_access_token(payload: Dict[str, Any], expires_days: int = 30) -> str:
    """Create a URL-safe signed HMAC-SHA256 token containing payload."""
    header = {"alg": "HS256", "typ": "JWT"}
    exp_ts = int(time.time()) + (expires_days * 86400)
    payload_copy = dict(payload)
    payload_copy["exp"] = exp_ts
    
    header_b64 = base64.urlsafe_b64encode(json.dumps(header).encode('utf-8')).decode('utf-8').rstrip('=')
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload_copy).encode('utf-8')).decode('utf-8').rstrip('=')
    
    signature_raw = hmac.new(SECRET_KEY.encode('utf-8'), f"{header_b64}.{payload_b64}".encode('utf-8'), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(signature_raw).decode('utf-8').rstrip('=')
    
    return f"{header_b64}.{payload_b64}.{sig_b64}"

def verify_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Verify signature and expiration of access token."""
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return None
        header_b64, payload_b64, sig_b64 = parts
        
        # Verify signature
        signature_raw = hmac.new(SECRET_KEY.encode('utf-8'), f"{header_b64}.{payload_b64}".encode('utf-8'), hashlib.sha256).digest()
        expected_sig_b64 = base64.urlsafe_b64encode(signature_raw).decode('utf-8').rstrip('=')
        
        if not hmac.compare_digest(sig_b64, expected_sig_b64):
            return None
        
        # Decode payload
        rem = len(payload_b64) % 4
        padded = payload_b64 + ('=' * (4 - rem) if rem else '')
        payload_json = base64.urlsafe_b64decode(padded.encode('utf-8')).decode('utf-8')
        payload = json.loads(payload_json)
        
        # Check expiration
        if payload.get("exp", 0) < int(time.time()):
            return None
        
        return payload
    except Exception:
        return None

# --- Product Key Generator ---
def generate_product_key(plan_type: str) -> str:
    """
    Generates a clean, readable license key:
    e.g. EGGDL-1M-A8F2-99B1-C4E2
         EGGDL-3M-B7E1-22A9-D801
         EGGDL-6M-4C92-F11B-55A3
         EGGDL-LIFE-EE92-AA81-0021
    """
    prefix_map = {
        "1month": "1M",
        "3month": "3M",
        "6month": "6M",
        "1year": "1Y",
        "lifetime": "LIFE"
    }
    prefix = prefix_map.get(plan_type, "PRO")
    chunk1 = secrets.token_hex(2).upper()
    chunk2 = secrets.token_hex(2).upper()
    chunk3 = secrets.token_hex(2).upper()
    return f"EGGDL-{prefix}-{chunk1}-{chunk2}-{chunk3}"

def mask_license_key(key: str) -> str:
    """
    Masks a product key for safe display:
    e.g. EGGDL-1M-A8F2-99B1-C4E2 -> EGGDL-1M-A8**-****-**E2
    """
    if not key:
        return ""
    parts = key.strip().split("-")
    if len(parts) >= 5:
        # EGGDL, PREFIX, CHUNK1, CHUNK2, CHUNK3
        c1 = parts[2][:2] + "**" if len(parts[2]) >= 2 else "****"
        c2 = "****"
        c3 = "**" + parts[4][-2:] if len(parts[4]) >= 2 else "****"
        return f"{parts[0]}-{parts[1]}-{c1}-{c2}-{c3}"
    elif len(parts) == 4:
        c1 = parts[2][:2] + "**"
        c2 = "**" + parts[3][-2:]
        return f"{parts[0]}-{parts[1]}-{c1}-{c2}"
    else:
        # Fallback mask
        if len(key) > 8:
            return key[:6] + "********" + key[-4:]
        return "EGGDL-PRO-****-****"
