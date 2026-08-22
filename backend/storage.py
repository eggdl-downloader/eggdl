import os
import sys
import shutil
import sqlite3
import json
import secrets
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any

def get_user_data_dir() -> str:
    if sys.platform == "win32":
        app_data = os.environ.get("APPDATA")
        if app_data:
            data_dir = os.path.join(app_data, "EggDL")
        else:
            data_dir = str(Path.home() / ".eggdl")
    else:
        data_dir = str(Path.home() / ".eggdl")
    os.makedirs(data_dir, exist_ok=True)
    return data_dir

DATA_DIR = get_user_data_dir()
DEFAULT_DOWNLOAD_DIR = str(Path.home() / "Downloads" / "Eggdl Downloads")
DB_PATH = os.path.join(DATA_DIR, "eggdl.db")

def init_db():
    os.makedirs(DEFAULT_DOWNLOAD_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS downloads (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        title TEXT,
        filename TEXT,
        file_path TEXT,
        file_size INTEGER DEFAULT -1,
        downloaded_bytes INTEGER DEFAULT 0,
        progress REAL DEFAULT 0.0,
        speed REAL DEFAULT 0.0,
        eta INTEGER DEFAULT 0,
        status TEXT DEFAULT 'queued',
        category TEXT DEFAULT 'other',
        thumbnail TEXT,
        download_type TEXT DEFAULT 'direct',
        format_id TEXT,
        error_message TEXT,
        user_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
    )
    """)

    # Ensure user_id column exists if table was created previously
    try:
        cursor.execute("ALTER TABLE downloads ADD COLUMN user_id TEXT;")
    except Exception:
        pass

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        avatar TEXT,
        password_hash TEXT,
        auth_provider TEXT DEFAULT 'local',
        google_id TEXT,
        plan_type TEXT DEFAULT 'free',
        plan_expires_at TIMESTAMP,
        license_key TEXT,
        is_blocked INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS license_keys (
        key TEXT PRIMARY KEY,
        plan_type TEXT NOT NULL,
        duration_days INTEGER NOT NULL,
        is_used INTEGER DEFAULT 0,
        used_by_user_id TEXT,
        activated_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        plan_type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        payment_method TEXT NOT NULL,
        transaction_id TEXT NOT NULL,
        masked_key TEXT,
        status TEXT DEFAULT 'completed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS devices (
        device_id TEXT PRIMARY KEY,
        user_email TEXT,
        machine_name TEXT,
        os_info TEXT,
        app_version TEXT,
        is_blocked INTEGER DEFAULT 0,
        block_reason TEXT,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS app_releases (
        version TEXT PRIMARY KEY,
        release_notes TEXT,
        download_url TEXT,
        mandatory INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Set default settings if not exists
    default_settings = {
        "download_dir": DEFAULT_DOWNLOAD_DIR,
        "max_concurrent_downloads": "3",
        "max_segments_per_download": "8",
        "speed_limit": "0",
        "auto_start": "true",
        "theme": "dark"
    }

    for key, val in default_settings.items():
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, val))

    # Initialize default app release if not present
    cursor.execute("""
    INSERT OR IGNORE INTO app_releases (version, release_notes, download_url, mandatory, is_active)
    VALUES ('2.0.0', 'Initial Production Release with Multi-Client Engine and PWA', 'https://eggdl.onrender.com/download/setup', 0, 1)
    """)

    conn.commit()
    conn.close()

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def get_settings() -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM settings")
    rows = cursor.fetchall()
    conn.close()
    settings = {}
    for row in rows:
        val = row["value"]
        if val.lower() in ("true", "false"):
            settings[row["key"]] = val.lower() == "true"
        elif val.isdigit():
            settings[row["key"]] = int(val)
        else:
            settings[row["key"]] = val

    # Dynamic adaptation for the current PC/user
    current_default = str(Path.home() / "Downloads" / "Eggdl Downloads")
    stored_dl = settings.get("download_dir")
    if not stored_dl or not os.path.exists(os.path.dirname(stored_dl)):
        settings["download_dir"] = current_default
        update_setting("download_dir", current_default)
    return settings

def update_setting(key: str, value: Any):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, str(value)))
    conn.commit()
    conn.close()

def save_download_task(task: Dict[str, Any], user_id: Optional[str] = None):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    created_at_val = task.get("created_at")
    if isinstance(created_at_val, (int, float)):
        created_at_val = datetime.fromtimestamp(created_at_val).strftime("%Y-%m-%d %H:%M:%S")
    elif not created_at_val:
        created_at_val = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    elif isinstance(created_at_val, str) and "T" in created_at_val:
        created_at_val = created_at_val.replace("T", " ").split(".")[0]

    cursor.execute("""
    INSERT OR REPLACE INTO downloads (
        id, url, title, filename, file_path, file_size, downloaded_bytes,
        progress, speed, eta, status, category, thumbnail, download_type,
        format_id, error_message, user_id, created_at, completed_at
    ) VALUES (
        :id, :url, :title, :filename, :file_path, :file_size, :downloaded_bytes,
        :progress, :speed, :eta, :status, :category, :thumbnail, :download_type,
        :format_id, :error_message, :user_id, :created_at, :completed_at
    )
    """, {
        "id": task["id"],
        "url": task["url"],
        "title": task.get("title", ""),
        "filename": task.get("filename", ""),
        "file_path": task.get("file_path", ""),
        "file_size": task.get("file_size", -1),
        "downloaded_bytes": task.get("downloaded_bytes", 0),
        "progress": task.get("progress", 0.0),
        "speed": task.get("speed", 0.0),
        "eta": task.get("eta", 0),
        "status": task.get("status", "queued"),
        "category": task.get("category", "other"),
        "thumbnail": task.get("thumbnail", ""),
        "download_type": task.get("download_type", "direct"),
        "format_id": task.get("format_id", ""),
        "error_message": task.get("error_message", None),
        "user_id": user_id or task.get("user_id", None),
        "created_at": created_at_val,
        "completed_at": task.get("completed_at", None)
    })
    conn.commit()
    conn.close()

def get_daily_downloads_count(user_id: Optional[str] = None) -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    today_str = datetime.now().strftime("%Y-%m-%d")
    # Count downloads started today
    if user_id and user_id != "guest":
        cursor.execute("""
            SELECT COUNT(*) FROM downloads 
            WHERE user_id = ? AND created_at LIKE ?
        """, (user_id, f"{today_str}%"))
    else:
        cursor.execute("""
            SELECT COUNT(*) FROM downloads 
            WHERE (user_id IS NULL OR user_id = 'guest' OR user_id = '') 
            AND created_at LIKE ?
        """, (f"{today_str}%",))
    row = cursor.fetchone()
    count = row[0] if row else 0
    conn.close()
    return count

def update_download_progress(task_id: str, downloaded_bytes: int, progress: float, speed: float, eta: int, status: str, error_message: Optional[str] = None):
    conn = get_db_connection()
    cursor = conn.cursor()
    completed_at = datetime.now().isoformat() if status == "completed" else None
    
    if completed_at:
        cursor.execute("""
        UPDATE downloads SET
            downloaded_bytes = ?,
            progress = ?,
            speed = ?,
            eta = ?,
            status = ?,
            error_message = ?,
            completed_at = ?
        WHERE id = ?
        """, (downloaded_bytes, progress, speed, eta, status, error_message, completed_at, task_id))
    else:
        cursor.execute("""
        UPDATE downloads SET
            downloaded_bytes = ?,
            progress = ?,
            speed = ?,
            eta = ?,
            status = ?,
            error_message = ?
        WHERE id = ?
        """, (downloaded_bytes, progress, speed, eta, status, error_message, task_id))
        
    conn.commit()
    conn.close()

def get_all_downloads(category: Optional[str] = None, status: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    query = "SELECT * FROM downloads WHERE 1=1"
    params = []
    
    if category and category.lower() != "all":
        query += " AND category = ?"
        params.append(category.lower())
        
    if status and status.lower() != "all":
        query += " AND status = ?"
        params.append(status.lower())
        
    query += " ORDER BY created_at DESC"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_download_task(task_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM downloads WHERE id = ?", (task_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def delete_download_task(task_id: str) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM downloads WHERE id = ?", (task_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted

def clear_completed_downloads():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM downloads WHERE status = 'completed'")
    conn.commit()
    conn.close()

def clear_all_downloads():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM downloads")
    conn.commit()
    conn.close()

# --- User Account CRUD Operations ---
def create_user(user_id: str, email: str, name: str, password_hash: Optional[str] = None, auth_provider: str = "local", avatar: str = "", google_id: Optional[str] = None) -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO users (id, email, name, avatar, password_hash, auth_provider, google_id, plan_type, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'free', ?)
    """, (user_id, email.lower().strip(), name, avatar, password_hash, auth_provider, google_id, datetime.now().isoformat()))
    conn.commit()
    conn.close()
    return get_user_by_id(user_id)

def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = ?", (email.lower().strip(),))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_user_by_google_id(google_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE google_id = ?", (google_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def update_user_plan(user_id: str, plan_type: str, plan_expires_at: Optional[str], license_key: str) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE users SET
        plan_type = ?,
        plan_expires_at = ?,
        license_key = ?
    WHERE id = ?
    """, (plan_type, plan_expires_at, license_key, user_id))
    success = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return success

# --- License Key Operations ---
def create_license_key(key: str, plan_type: str, duration_days: int) -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT OR REPLACE INTO license_keys (key, plan_type, duration_days, is_used, created_at)
    VALUES (?, ?, ?, 0, ?)
    """, (key, plan_type, duration_days, datetime.now().isoformat()))
    conn.commit()
    conn.close()
    return {"key": key, "plan_type": plan_type, "duration_days": duration_days}

def get_license_key(key: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM license_keys WHERE key = ?", (key.strip().upper(),))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def activate_license_key(key: str, user_id: str) -> Optional[Dict[str, Any]]:
    """
    Validates product key and activates it for the specified user.
    Returns the activated plan info or None if invalid/already used.
    """
    key_clean = key.strip().upper()
    license_info = get_license_key(key_clean)
    if not license_info:
        return None
    if license_info.get("is_used"):
        return {"error": "Product key has already been activated"}
    
    plan_type = license_info["plan_type"]
    duration_days = license_info["duration_days"]
    now = datetime.now()
    
    if plan_type == "lifetime" or duration_days >= 36500:
        expires_at = "2099-12-31T23:59:59"
    else:
        from datetime import timedelta
        # If user already has an active plan with remaining time, extend it
        user = get_user_by_id(user_id)
        base_time = now
        if user and user.get("plan_expires_at") and user.get("plan_type") != "free":
            try:
                curr_exp = datetime.fromisoformat(user["plan_expires_at"])
                if curr_exp > now:
                    base_time = curr_exp
            except Exception:
                pass
        expires_at = (base_time + timedelta(days=duration_days)).isoformat()
    
    # Mark key as used
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE license_keys SET
        is_used = 1,
        used_by_user_id = ?,
        activated_at = ?
    WHERE key = ?
    """, (user_id, now.isoformat(), key_clean))
    conn.commit()
    conn.close()
    
    # Update user subscription
    update_user_plan(user_id, plan_type, expires_at, key_clean)
    
    return {
        "success": True,
        "plan_type": plan_type,
        "plan_expires_at": expires_at,
        "license_key": key_clean
    }

# --- Payment Tracking ---
def create_payment_record(user_id: str, plan_type: str, amount: int, payment_method: str, transaction_id: str, masked_key: str) -> Dict[str, Any]:
    payment_id = f"pay_{secrets.token_hex(6)}"
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO payments (id, user_id, plan_type, amount, payment_method, transaction_id, masked_key, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?)
    """, (payment_id, user_id, plan_type, amount, payment_method, transaction_id, masked_key, datetime.now().isoformat()))
    conn.commit()
    conn.close()
    return {
        "id": payment_id,
        "user_id": user_id,
        "plan_type": plan_type,
        "amount": amount,
        "payment_method": payment_method,
        "transaction_id": transaction_id,
        "masked_key": masked_key
    }

def get_user_payments(user_id: str) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC", (user_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

# --- Device Tracking, Remote Kill-Switch & Anti-Piracy ---
import platform
import hashlib
import uuid

def get_device_id() -> str:
    components = [
        platform.node(),
        platform.machine(),
        str(uuid.getnode()),
    ]
    raw = ":".join(components)
    return "EGG-" + hashlib.sha256(raw.encode()).hexdigest()[:16].upper()

def register_device(device_id: str, user_email: Optional[str] = None, app_version: str = "2.0.0") -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()
    machine_name = platform.node()
    os_info = f"{platform.system()} {platform.release()}"
    now = datetime.now().isoformat()
    
    cursor.execute("SELECT is_blocked, block_reason, created_at FROM devices WHERE device_id = ?", (device_id,))
    row = cursor.fetchone()
    is_blocked = 0
    block_reason = None
    created_at = now
    if row:
        is_blocked = row["is_blocked"]
        block_reason = row["block_reason"]
        created_at = row["created_at"] or now
        cursor.execute("""
        UPDATE devices SET
            user_email = COALESCE(?, user_email),
            machine_name = ?,
            os_info = ?,
            app_version = ?,
            last_seen = ?
        WHERE device_id = ?
        """, (user_email, machine_name, os_info, app_version, now, device_id))
    else:
        cursor.execute("""
        INSERT INTO devices (device_id, user_email, machine_name, os_info, app_version, is_blocked, last_seen, created_at)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?)
        """, (device_id, user_email, machine_name, os_info, app_version, now, now))
    conn.commit()
    conn.close()
    return {
        "device_id": device_id,
        "is_blocked": bool(is_blocked),
        "block_reason": block_reason,
        "created_at": created_at
    }

def get_trial_and_subscription_status(user_id: Optional[str] = None, device_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Computes active status, 7-Day Free Trial countdown, and Unlimited Download authorization.
    """
    from datetime import datetime, timedelta
    import math

    now = datetime.now()
    TRIAL_DAYS = 7

    # 1. If user is logged in, check user subscription & trial
    if user_id:
        user = get_user_by_id(user_id)
        if user:
            plan_type = user.get("plan_type", "free")
            plan_expires_at = user.get("plan_expires_at")
            
            # Check paid / active Pro plan
            if plan_type not in ["free", "trial"] and plan_expires_at:
                try:
                    exp_date = datetime.fromisoformat(plan_expires_at)
                    if plan_type == "lifetime" or exp_date.year >= 2099:
                        return {
                            "is_pro": True,
                            "is_trial": False,
                            "trial_expired": False,
                            "can_download": True,
                            "is_unlimited": True,
                            "days_remaining": 9999,
                            "trial_days_remaining": 0,
                            "plan_type": plan_type,
                            "plan_expires_at": plan_expires_at
                        }
                    elif exp_date > now:
                        days_left = max(1, (exp_date - now).days)
                        return {
                            "is_pro": True,
                            "is_trial": False,
                            "trial_expired": False,
                            "can_download": True,
                            "is_unlimited": True,
                            "days_remaining": days_left,
                            "trial_days_remaining": 0,
                            "plan_type": plan_type,
                            "plan_expires_at": plan_expires_at
                        }
                except Exception:
                    pass

            # Not paid or paid plan expired -> Check 7-Day Free Trial based on user created_at
            user_created = user.get("created_at")
            created_dt = now
            if user_created:
                try:
                    if "T" in str(user_created):
                        created_dt = datetime.fromisoformat(str(user_created))
                    else:
                        created_dt = datetime.strptime(str(user_created)[:19], "%Y-%m-%d %H:%M:%S")
                except Exception:
                    created_dt = now

            trial_end = created_dt + timedelta(days=TRIAL_DAYS)
            if now < trial_end:
                seconds_left = (trial_end - now).total_seconds()
                days_left = max(1, math.ceil(seconds_left / 86400))
                return {
                    "is_pro": False,
                    "is_trial": True,
                    "trial_expired": False,
                    "can_download": True,
                    "is_unlimited": True,
                    "days_remaining": 0,
                    "trial_days_remaining": days_left,
                    "plan_type": "trial",
                    "plan_expires_at": trial_end.isoformat()
                }
            else:
                return {
                    "is_pro": False,
                    "is_trial": False,
                    "trial_expired": True,
                    "can_download": False,
                    "is_unlimited": False,
                    "days_remaining": 0,
                    "trial_days_remaining": 0,
                    "plan_type": "free",
                    "plan_expires_at": None
                }

    # 2. If guest / unauthenticated, check device-level 7-Day Free Trial
    dev_id = device_id or get_device_id()
    device_info = register_device(dev_id)
    dev_created = device_info.get("created_at")
    created_dt = now
    if dev_created:
        try:
            if "T" in str(dev_created):
                created_dt = datetime.fromisoformat(str(dev_created))
            else:
                created_dt = datetime.strptime(str(dev_created)[:19], "%Y-%m-%d %H:%M:%S")
        except Exception:
            created_dt = now

    trial_end = created_dt + timedelta(days=TRIAL_DAYS)
    if now < trial_end:
        seconds_left = (trial_end - now).total_seconds()
        days_left = max(1, math.ceil(seconds_left / 86400))
        return {
            "is_pro": False,
            "is_trial": True,
            "trial_expired": False,
            "can_download": True,
            "is_unlimited": True,
            "days_remaining": 0,
            "trial_days_remaining": days_left,
            "plan_type": "trial",
            "plan_expires_at": trial_end.isoformat()
        }
    else:
        return {
            "is_pro": False,
            "is_trial": False,
            "trial_expired": True,
            "can_download": False,
            "is_unlimited": False,
            "days_remaining": 0,
            "trial_days_remaining": 0,
            "plan_type": "free",
            "plan_expires_at": None
        }

def is_device_blocked(device_id: str) -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT is_blocked, block_reason FROM devices WHERE device_id = ?", (device_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return {"blocked": bool(row["is_blocked"]), "reason": row["block_reason"] or "Suspended by administrator"}
    return {"blocked": False, "reason": ""}

def set_device_blocked(device_id: str, blocked: bool = True, reason: str = "License violation or cracked version detected"):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE devices SET is_blocked = ?, block_reason = ? WHERE device_id = ?
    """, (1 if blocked else 0, reason if blocked else None, device_id))
    if cursor.rowcount == 0:
        cursor.execute("""
        INSERT INTO devices (device_id, is_blocked, block_reason, last_seen, created_at)
        VALUES (?, ?, ?, ?, ?)
        """, (device_id, 1 if blocked else 0, reason if blocked else None, datetime.now().isoformat(), datetime.now().isoformat()))
    conn.commit()
    conn.close()

def get_all_devices() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM devices ORDER BY last_seen DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

# --- App Version & Update Management ---
def get_latest_app_release() -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM app_releases WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1")
    row = cursor.fetchone()
    conn.close()
    if row:
        return dict(row)
    return {
        "version": "2.0.0",
        "release_notes": "Official Release",
        "download_url": "https://eggdl.onrender.com/download/setup",
        "mandatory": 0
    }

def set_app_release(version: str, release_notes: str, download_url: str, mandatory: bool = False):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE app_releases SET is_active = 0")
    cursor.execute("""
    INSERT OR REPLACE INTO app_releases (version, release_notes, download_url, mandatory, is_active, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
    """, (version, release_notes, download_url, 1 if mandatory else 0, datetime.now().isoformat()))
    conn.commit()
    conn.close()

init_db()
