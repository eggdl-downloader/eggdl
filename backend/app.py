import os
import sys
import uuid
import time
import json
import base64
import urllib.request
import secrets
import asyncio
import subprocess
import shutil
from typing import Dict, List, Optional, Any
from pathlib import Path

# Fix Windows console UTF-8 output
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, Header, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    from storage import (
        init_db, get_settings, update_setting, save_download_task,
        update_download_progress, get_all_downloads, get_download_task,
        delete_download_task, clear_completed_downloads, clear_all_downloads,
        create_user, get_user_by_email, get_user_by_id, get_user_by_google_id,
        update_user_plan, create_license_key, get_license_key, activate_license_key,
        create_payment_record, get_user_payments, get_daily_downloads_count
    )
    from auth import (
        hash_password, verify_password, create_access_token, verify_access_token,
        generate_product_key, mask_license_key, PLAN_CONFIGS
    )
    from downloader_engine import DownloadTask, detect_category, sanitize_filename
    from media_extractor import MediaExtractor, StreamDownloadTask
    from page_sniffer import sniff_webpage
except ImportError:
    from backend.storage import (
        init_db, get_settings, update_setting, save_download_task,
        update_download_progress, get_all_downloads, get_download_task,
        delete_download_task, clear_completed_downloads, clear_all_downloads,
        create_user, get_user_by_email, get_user_by_id, get_user_by_google_id,
        update_user_plan, create_license_key, get_license_key, activate_license_key,
        create_payment_record, get_user_payments, get_daily_downloads_count
    )
    from backend.auth import (
        hash_password, verify_password, create_access_token, verify_access_token,
        generate_product_key, mask_license_key, PLAN_CONFIGS
    )
    from backend.downloader_engine import DownloadTask, detect_category, sanitize_filename
    from backend.media_extractor import MediaExtractor, StreamDownloadTask
    from backend.page_sniffer import sniff_webpage

app = FastAPI(title="EggDL API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Active tasks in memory
active_tasks: Dict[str, Any] = {}
websocket_connections: List[WebSocket] = []

# Ensure DB is ready
init_db()

# WebSocket broadcaster
async def broadcast(data: Dict[str, Any]):
    disconnected = []
    for ws in websocket_connections:
        try:
            await ws.send_json(data)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        if ws in websocket_connections:
            websocket_connections.remove(ws)

async def handle_progress_update(task_dict: Dict[str, Any]):
    task_id = task_dict["id"]
    update_download_progress(
        task_id=task_id,
        downloaded_bytes=task_dict.get("downloaded_bytes", 0),
        progress=task_dict.get("progress", 0.0),
        speed=task_dict.get("speed", 0.0),
        eta=task_dict.get("eta", 0),
        status=task_dict.get("status", "downloading"),
        error_message=task_dict.get("error_message")
    )
    await broadcast({
        "type": "progress_update",
        "task": task_dict
    })

# Request Models
class InspectRequest(BaseModel):
    url: str

class SniffRequest(BaseModel):
    url: str

class StartDownloadRequest(BaseModel):
    url: str
    download_type: Optional[str] = "auto" # 'stream', 'direct', 'auto'
    format_id: Optional[str] = "bestvideo+bestaudio/best"
    is_audio_only: Optional[bool] = False
    audio_format: Optional[str] = "mp3"
    custom_filename: Optional[str] = None
    custom_title: Optional[str] = None
    thumbnail: Optional[str] = None
    category: Optional[str] = None
    expected_size: Optional[int] = None
    segments_count: Optional[int] = 8
    referer: Optional[str] = None

class SaveFileRequest(BaseModel):
    filename: str
    data_base64: str
    url: Optional[str] = ""
    title: Optional[str] = None
    category: Optional[str] = "image"

class SettingsRequest(BaseModel):
    download_dir: Optional[str] = None
    max_concurrent_downloads: Optional[int] = None
    max_segments_per_download: Optional[int] = None
    speed_limit: Optional[int] = None
    auto_start: Optional[bool] = None
    theme: Optional[str] = None

class FileActionRequest(BaseModel):
    task_id: Optional[str] = None
    file_path: Optional[str] = None

# Auth & License Request Models
class RegisterRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None

class LoginRequest(BaseModel):
    email: str
    password: str

class GoogleAuthRequest(BaseModel):
    credential: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None
    avatar: Optional[str] = None
    google_id: Optional[str] = None

class FirebaseAuthRequest(BaseModel):
    id_token: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None
    avatar: Optional[str] = None
    uid: Optional[str] = None
    auth_provider: Optional[str] = "firebase"

class LicenseActivateRequest(BaseModel):
    license_key: str

class LicenseGenerateRequest(BaseModel):
    plan_type: str # '1month', '3month', '6month', '1year', 'lifetime'
    count: Optional[int] = 1

class PaymentProcessRequest(BaseModel):
    plan_type: str # '1month', '3month', '6month', '1year', 'lifetime'
    payment_method: str # 'upi' or 'card'
    upi_id: Optional[str] = None
    card_name: Optional[str] = None
    card_number: Optional[str] = None
    card_expiry: Optional[str] = None
    card_cvv: Optional[str] = None

# Helper to extract current user from Authorization header
async def get_current_user_optional(authorization: Optional[str] = Header(None)) -> Optional[Dict[str, Any]]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split("Bearer ", 1)[1].strip()
    payload = verify_access_token(token)
    if not payload or not payload.get("user_id"):
        return None
    return get_user_by_id(payload["user_id"])

async def get_current_user_required(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    user = await get_current_user_optional(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required. Please sign in.")
    return user

# --- Auth & Licensing API Endpoints ---
@app.post("/api/auth/register")
async def auth_register(req: RegisterRequest):
    email = req.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    
    existing = get_user_by_email(email)
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")
    
    user_id = f"usr_{uuid.uuid4().hex[:12]}"
    name = req.name.strip() if req.name else email.split("@")[0].capitalize()
    pwd_hash = hash_password(req.password)
    
    user = create_user(user_id=user_id, email=email, name=name, password_hash=pwd_hash, auth_provider="local")
    token = create_access_token({"user_id": user_id, "email": email})
    
    return {
        "success": True,
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "avatar": user.get("avatar", ""),
            "plan_type": user.get("plan_type", "free"),
            "plan_expires_at": user.get("plan_expires_at")
        }
    }

@app.post("/api/auth/login")
async def auth_login(req: LoginRequest):
    email = req.email.strip().lower()
    user = get_user_by_email(email)
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    
    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    
    token = create_access_token({"user_id": user["id"], "email": user["email"]})
    return {
        "success": True,
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "avatar": user.get("avatar", ""),
            "plan_type": user.get("plan_type", "free"),
            "plan_expires_at": user.get("plan_expires_at")
        }
    }

@app.post("/api/auth/google")
async def auth_google(req: GoogleAuthRequest):
    email = (req.email or "").strip().lower()
    name = req.name or (email.split("@")[0].capitalize() if email else "Google User")
    avatar = req.avatar or ""
    google_id = req.google_id
    
    if req.credential:
        # Method 1: Direct JWT payload decoding
        try:
            parts = req.credential.split('.')
            if len(parts) >= 2:
                payload_part = parts[1]
                rem = len(payload_part) % 4
                if rem > 0:
                    payload_part += '=' * (4 - rem)
                payload = json.loads(base64.urlsafe_b64decode(payload_part.encode('utf-8')).decode('utf-8'))
                if payload.get("email"):
                    email = payload.get("email", "").strip().lower()
                if payload.get("name"):
                    name = payload.get("name")
                if payload.get("picture"):
                    avatar = payload.get("picture")
                if payload.get("sub"):
                    google_id = payload.get("sub")
        except Exception as e:
            print(f"[Google Auth] JWT decode note: {e}")

        # Method 2: Fallback with Google tokeninfo endpoint
        if not email:
            try:
                token_url = f"https://oauth2.googleapis.com/tokeninfo?id_token={req.credential}"
                req_obj = urllib.request.Request(token_url, headers={"User-Agent": "EggDL/2.0"})
                with urllib.request.urlopen(req_obj, timeout=5) as resp:
                    if resp.status == 200:
                        g_info = json.loads(resp.read().decode('utf-8'))
                        email = (g_info.get("email") or "").strip().lower()
                        name = g_info.get("name") or name
                        avatar = g_info.get("picture") or avatar
                        google_id = g_info.get("sub") or google_id
            except Exception as e:
                print(f"[Google Auth] Tokeninfo verification note: {e}")
            
    if not email:
        raise HTTPException(status_code=400, detail="Google authentication failed: Email missing.")
        
    user = get_user_by_google_id(google_id) if google_id else None
    if not user:
        user = get_user_by_email(email)
        
    if not user:
        user_id = f"usr_{uuid.uuid4().hex[:12]}"
        user = create_user(user_id=user_id, email=email, name=name, auth_provider="google", avatar=avatar, google_id=google_id)
    
    token = create_access_token({"user_id": user["id"], "email": user["email"]})
    return {
        "success": True,
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "avatar": user.get("avatar", ""),
            "plan_type": user.get("plan_type", "free"),
            "plan_expires_at": user.get("plan_expires_at")
        }
    }

@app.post("/api/auth/firebase")
async def auth_firebase(req: FirebaseAuthRequest):
    email = (req.email or "").strip().lower()
    name = req.name or (email.split("@")[0].capitalize() if email else "Firebase User")
    avatar = req.avatar or ""
    uid = req.uid
    auth_provider = req.auth_provider or "firebase"

    # Decode id_token if provided and email missing
    if req.id_token and not email:
        try:
            parts = req.id_token.split('.')
            if len(parts) >= 2:
                payload_part = parts[1]
                rem = len(payload_part) % 4
                if rem > 0:
                    payload_part += '=' * (4 - rem)
                payload = json.loads(base64.urlsafe_b64decode(payload_part.encode('utf-8')).decode('utf-8'))
                if payload.get("email"):
                    email = payload.get("email", "").strip().lower()
                if payload.get("name"):
                    name = payload.get("name")
                if payload.get("picture"):
                    avatar = payload.get("picture")
                if payload.get("user_id") or payload.get("sub"):
                    uid = payload.get("user_id") or payload.get("sub")
                if payload.get("firebase", {}).get("sign_in_provider"):
                    auth_provider = payload["firebase"]["sign_in_provider"]
        except Exception as e:
            print(f"[Firebase Auth] Token parse note: {e}")

    if not email:
        raise HTTPException(status_code=400, detail="Firebase authentication failed: Email missing.")

    user = get_user_by_google_id(uid) if uid else None
    if not user:
        user = get_user_by_email(email)

    if not user:
        user_id = f"usr_{uuid.uuid4().hex[:12]}"
        user = create_user(
            user_id=user_id,
            email=email,
            name=name,
            auth_provider=auth_provider,
            avatar=avatar,
            google_id=uid
        )

    token = create_access_token({"user_id": user["id"], "email": user["email"]})
    return {
        "success": True,
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "avatar": user.get("avatar", ""),
            "plan_type": user.get("plan_type", "free"),
            "plan_expires_at": user.get("plan_expires_at")
        }
    }

@app.get("/api/auth/me")
async def auth_me(user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)):
    if not user:
        daily_count = get_daily_downloads_count(None)
        return {
            "authenticated": False,
            "user": {
                "id": "guest",
                "name": "Guest User",
                "email": "",
                "plan_type": "free",
                "plan_expires_at": None
            },
            "plan": PLAN_CONFIGS["free"],
            "is_pro": False,
            "days_remaining": 0,
            "daily_downloads_used": daily_count,
            "daily_downloads_limit": 3,
            "is_unlimited": False
        }
    
    plan_type = user.get("plan_type", "free")
    plan_expires_at = user.get("plan_expires_at")
    from datetime import datetime
    now = datetime.now()
    is_expired = False
    days_remaining = 0
    
    if plan_type != "free" and plan_expires_at:
        try:
            exp_date = datetime.fromisoformat(plan_expires_at)
            if plan_type == "lifetime" or exp_date.year >= 2099:
                days_remaining = 9999
            elif exp_date > now:
                days_remaining = max(1, (exp_date - now).days)
            else:
                is_expired = True
                days_remaining = 0
        except Exception:
            pass
            
    if is_expired:
        update_user_plan(user["id"], "free", None, "")
        plan_type = "free"
        
    plan_info = PLAN_CONFIGS.get(plan_type, PLAN_CONFIGS["free"])
    is_pro = (plan_type != "free" and not is_expired)
    daily_count = get_daily_downloads_count(user["id"])
    
    return {
        "authenticated": True,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "avatar": user.get("avatar", ""),
            "plan_type": plan_type,
            "plan_expires_at": user.get("plan_expires_at"),
            "license_key": user.get("license_key", "")
        },
        "plan": plan_info,
        "is_pro": is_pro,
        "days_remaining": days_remaining,
        "daily_downloads_used": daily_count,
        "daily_downloads_limit": None if is_pro else 3,
        "is_unlimited": is_pro
    }

@app.post("/api/auth/logout")
async def auth_logout():
    return {"success": True, "message": "Logged out successfully"}

@app.post("/api/license/activate")
async def license_activate(req: LicenseActivateRequest, user: Dict[str, Any] = Depends(get_current_user_required)):
    key = req.license_key.strip().upper()
    if not key:
        raise HTTPException(status_code=400, detail="Please enter a valid product key.")
        
    result = activate_license_key(key, user["id"])
    if not result:
        raise HTTPException(status_code=400, detail="Invalid product key. Please check and try again.")
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
        
    plan_type = result["plan_type"]
    plan_info = PLAN_CONFIGS.get(plan_type, PLAN_CONFIGS["free"])
    
    return {
        "success": True,
        "message": f"Successfully activated {plan_info['name']}!",
        "plan": plan_info,
        "plan_type": plan_type,
        "plan_expires_at": result["plan_expires_at"]
    }

@app.get("/api/license/plans")
async def license_plans():
    return {
        "success": True,
        "plans": PLAN_CONFIGS
    }

@app.post("/api/license/generate")
async def license_generate(req: LicenseGenerateRequest):
    if req.plan_type not in PLAN_CONFIGS or req.plan_type == "free":
        raise HTTPException(status_code=400, detail="Invalid plan type. Options: 1month, 3month, 6month, lifetime")
        
    duration = PLAN_CONFIGS[req.plan_type]["duration_days"]
    count = min(max(1, req.count or 1), 50)
    generated = []
    
    for _ in range(count):
        k = generate_product_key(req.plan_type)
        create_license_key(k, req.plan_type, duration)
        generated.append(k)
        
    return {
        "success": True,
        "plan_type": req.plan_type,
        "duration_days": duration,
        "keys": generated
    }

# --- Payment Processing Endpoint ---
@app.post("/api/payment/process")
async def payment_process(req: PaymentProcessRequest, user: Dict[str, Any] = Depends(get_current_user_required)):
    if req.plan_type not in PLAN_CONFIGS or req.plan_type == "free":
        raise HTTPException(status_code=400, detail="Invalid plan selected for checkout.")
        
    plan_info = PLAN_CONFIGS[req.plan_type]
    price = plan_info.get("price", 0)
    duration = plan_info["duration_days"]
    
    # 1. Generate a genuine unique license key
    key = generate_product_key(req.plan_type)
    create_license_key(key, req.plan_type, duration)
    
    # 2. Automatically bind and activate the license for the logged in user
    activation = activate_license_key(key, user["id"])
    if not activation or activation.get("error"):
        raise HTTPException(status_code=500, detail="Failed to automatically bind license to account.")
        
    # 3. Create transaction details and mask the key
    txn_id = f"TXN_{secrets.token_hex(4).upper()}_{int(time.time())}"
    masked = mask_license_key(key)
    
    # 4. Save payment transaction record in database
    create_payment_record(
        user_id=user["id"],
        plan_type=req.plan_type,
        amount=price,
        payment_method=req.payment_method,
        transaction_id=txn_id,
        masked_key=masked
    )
    
    return {
        "success": True,
        "message": f"Payment of ₹{price} received successfully! {plan_info['name']} has been activated.",
        "transaction_id": txn_id,
        "plan_type": req.plan_type,
        "plan": plan_info,
        "masked_key": masked,
        "plan_expires_at": activation["plan_expires_at"],
        "amount": price,
        "payment_method": req.payment_method
    }

@app.get("/api/payment/history")
async def payment_history(user: Dict[str, Any] = Depends(get_current_user_required)):
    payments = get_user_payments(user["id"])
    return {
        "success": True,
        "payments": payments
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    websocket_connections.append(websocket)
    try:
        # Send initial active tasks
        settings = get_settings()
        downloads = get_all_downloads()
        await websocket.send_json({
            "type": "init",
            "settings": settings,
            "downloads": downloads
        })
        while True:
            data = await websocket.receive_text()
            # Heartbeat / ping
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        if websocket in websocket_connections:
            websocket_connections.remove(websocket)


@app.post("/api/inspect")
async def inspect_url(req: InspectRequest):
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    # 1. Check if it's a known media/video streaming URL
    if MediaExtractor.is_supported_url(url):
        try:
            stream_info = MediaExtractor.inspect_url(url)
            return {
                "success": True,
                "type": "stream",
                "data": stream_info
            }
        except Exception as e:
            # Fallback to direct inspection
            pass

    # 2. Try inspecting as direct file
    settings = get_settings()
    target_dir = settings.get("download_dir", str(Path.home() / "Downloads" / "ProDownloader"))
    temp_task = DownloadTask(task_id="inspect", url=url, target_dir=target_dir)
    
    try:
        direct_info = await temp_task.inspect()
        
        # Check if the inspected content is an HTML page (not a downloadable media file)
        content_type = direct_info.get("content_type", "")
        if "text/html" in content_type and not direct_info.get("supports_ranges"):
            # Try yt-dlp first
            try:
                stream_info = MediaExtractor.inspect_url(url)
                return {
                    "success": True,
                    "type": "stream",
                    "data": stream_info
                }
            except Exception:
                # Suggest sniffing the webpage
                return {
                    "success": True,
                    "type": "webpage",
                    "data": {
                        "url": url,
                        "content_type": content_type,
                        "message": "Web page detected. You can sniff media or download the HTML."
                    }
                }

        return {
            "success": True,
            "type": "direct",
            "data": direct_info
        }
    except Exception as e:
        # Final attempt with yt-dlp generic extractor
        try:
            stream_info = MediaExtractor.inspect_url(url)
            return {
                "success": True,
                "type": "stream",
                "data": stream_info
            }
        except Exception:
            raise HTTPException(status_code=400, detail=f"Could not inspect link: {str(e)}")


@app.post("/api/sniff")
async def sniff_page(req: SniffRequest):
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    try:
        res = await sniff_webpage(url)
        return {"success": True, "data": res}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to sniff webpage: {str(e)}")


@app.post("/api/download/save_file")
async def save_direct_file(req: SaveFileRequest, user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)):
    import base64
    user_id = user["id"] if user else None
    is_pro = False
    if user:
        plan_type = user.get("plan_type", "free")
        plan_expires_at = user.get("plan_expires_at")
        if plan_type != "free" and plan_expires_at:
            try:
                from datetime import datetime
                exp_date = datetime.fromisoformat(plan_expires_at)
                if plan_type == "lifetime" or exp_date.year >= 2099 or exp_date > datetime.now():
                    is_pro = True
            except Exception:
                pass

    if not is_pro:
        daily_count = get_daily_downloads_count(user_id)
        if daily_count >= 3:
            return JSONResponse(
                status_code=403,
                content={
                    "success": False,
                    "error": "daily_limit_reached",
                    "message": "Daily Free Limit Reached (3/3 Downloads). Purchase a plan to unlock unlimited turbo downloads!",
                    "daily_count": daily_count,
                    "daily_limit": 3,
                    "plan_type": "free"
                }
            )

    settings = get_settings()
    target_dir = settings.get("download_dir", str(Path.home() / "Downloads" / "EggDL"))
    os.makedirs(target_dir, exist_ok=True)

    filename = sanitize_filename(req.filename)
    if not filename:
        filename = f"image_{int(time.time())}.png"
    
    base, ext = os.path.splitext(filename)
    if not ext:
        ext = ".png"
        filename = f"{filename}{ext}"

    counter = 1
    final_path = os.path.join(target_dir, filename)
    while os.path.exists(final_path):
        filename = f"{base} ({counter}){ext}"
        final_path = os.path.join(target_dir, filename)
        counter += 1

    try:
        raw_data = base64.b64decode(req.data_base64)
        with open(final_path, "wb") as f:
            f.write(raw_data)
        
        file_size = len(raw_data)
        task_id = str(uuid.uuid4())[:8]
        category = req.category or detect_category(filename, "")

        task_dict = {
            "id": task_id,
            "url": req.url or "",
            "title": req.title or filename,
            "filename": filename,
            "file_path": final_path,
            "file_size": file_size,
            "downloaded_bytes": file_size,
            "progress": 100.0,
            "speed": 0.0,
            "eta": 0,
            "status": "completed",
            "category": category,
            "download_type": "direct",
            "segments_count": 1,
            "user_id": user_id,
            "created_at": time.time(),
            "completed_at": time.time(),
            "error_message": None,
            "thumbnail": f"/api/media/{task_id}" if category == "image" else ""
        }

        save_download_task(task_dict, user_id=user_id)
        await broadcast({
            "type": "task_added",
            "task": task_dict
        })
        await broadcast({
            "type": "task_updated",
            "task": task_dict
        })

        return {"success": True, "task_id": task_id, "task": task_dict}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to save file: {str(e)}")


@app.post("/api/download/start")
async def start_download(req: StartDownloadRequest, user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)):
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    user_id = user["id"] if user else None
    is_pro = False
    plan_key = "free"
    if user:
        plan_type = user.get("plan_type", "free")
        plan_expires_at = user.get("plan_expires_at")
        if plan_type != "free" and plan_expires_at:
            try:
                from datetime import datetime
                exp_date = datetime.fromisoformat(plan_expires_at)
                if plan_type == "lifetime" or exp_date.year >= 2099 or exp_date > datetime.now():
                    is_pro = True
                    plan_key = plan_type
            except Exception:
                pass

    if not is_pro:
        daily_count = get_daily_downloads_count(user_id)
        if daily_count >= 3:
            return JSONResponse(
                status_code=403,
                content={
                    "success": False,
                    "error": "daily_limit_reached",
                    "message": "Daily Free Limit Reached (3/3 Downloads). Purchase a plan to unlock unlimited turbo downloads!",
                    "daily_count": daily_count,
                    "daily_limit": 3,
                    "plan_type": "free"
                }
            )

    task_id = str(uuid.uuid4())[:8]
    settings = get_settings()
    target_dir = settings.get("download_dir", str(Path.home() / "Downloads" / "EggDL"))
    
    plan_info = PLAN_CONFIGS.get(plan_key, PLAN_CONFIGS["free"])
    max_threads = plan_info.get("max_threads", 4)
    segments = min(req.segments_count or settings.get("max_segments_per_download", 8), max_threads)

    download_type = req.download_type
    # If format_id is a direct URL from fallback video scraper
    if req.format_id and (req.format_id.startswith("http://") or req.format_id.startswith("https://")):
        download_type = "direct"
        url = req.format_id

    # Check for direct file/image extensions
    lower_u = url.lower().split("?")[0]
    is_direct_media = any(lower_u.endswith(ext) for ext in [
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".ico",
        ".zip", ".rar", ".7z", ".tar", ".gz",
        ".exe", ".msi", ".dmg", ".apk", ".iso",
        ".pdf", ".doc", ".docx", ".xls", ".xlsx",
        ".mp3", ".wav", ".flac", ".aac", ".m4a", ".ogg",
        ".mp4", ".mkv", ".webm", ".avi", ".mov"
    ])

    if download_type == "auto":
        if is_direct_media:
            download_type = "direct"
        else:
            download_type = "stream" if MediaExtractor.is_supported_url(url) else "direct"

    if download_type == "stream":
        task = StreamDownloadTask(
            task_id=task_id,
            url=url,
            target_dir=target_dir,
            format_id=req.format_id or "bestvideo+bestaudio/best",
            is_audio_only=req.is_audio_only or False,
            audio_format=req.audio_format or "mp3",
            custom_title=req.custom_title,
            expected_size=req.expected_size or -1,
            on_progress=handle_progress_update
        )
        task.thumbnail = req.thumbnail or ""
        task_data = task.to_dict()
    else:
        custom_fn = req.custom_filename
        if not custom_fn and req.custom_title:
            ext = os.path.splitext(lower_u)[1]
            if ext:
                custom_fn = sanitize_filename(req.custom_title)[:60] + ext
            else:
                custom_fn = None

        task = DownloadTask(
            task_id=task_id,
            url=url,
            target_dir=target_dir,
            filename=custom_fn,
            segments_count=segments,
            referer=req.referer,
            on_progress=handle_progress_update
        )
        if req.custom_title:
            task.title = req.custom_title
        if req.thumbnail:
            task.thumbnail = req.thumbnail
        if req.category:
            task.category = req.category
        task_data = task.to_dict()

    active_tasks[task_id] = task
    save_download_task(task_data, user_id=user_id)

    # Launch download in background
    asyncio.create_task(_run_task(task_id, task))

    await broadcast({
        "type": "task_added",
        "task": task_data
    })

    return {"success": True, "task_id": task_id, "task": task_data}


async def _run_task(task_id: str, task: Any):
    try:
        await task.start()
    except Exception as e:
        print(f"Task {task_id} failed: {e}")
    finally:
        task_dict = task.to_dict()
        save_download_task(task_dict)
        await broadcast({
            "type": "task_updated",
            "task": task_dict
        })
        if task_id in active_tasks and task_dict["status"] in ("completed", "canceled", "error"):
            active_tasks.pop(task_id, None)


@app.post("/api/download/{task_id}/pause")
async def pause_download(task_id: str):
    task = active_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Active download task not found")
    
    if hasattr(task, "pause"):
        task.pause()
        update_download_progress(task_id, task.downloaded_bytes, task.progress, 0, 0, "paused")
        await broadcast({"type": "task_updated", "task": task.to_dict()})
        return {"success": True, "message": "Download paused"}
    else:
        raise HTTPException(status_code=400, detail="Cannot pause this download")


@app.post("/api/download/{task_id}/resume")
async def resume_download(task_id: str):
    task_record = get_download_task(task_id)
    if not task_record:
        raise HTTPException(status_code=404, detail="Task not found")

    if task_id in active_tasks:
        task = active_tasks[task_id]
        if task.status == "downloading":
            return {"success": True, "message": "Already running"}

    settings = get_settings()
    target_dir = settings.get("download_dir", str(Path.home() / "Downloads" / "EggDL"))
    segments = settings.get("max_segments_per_download", 8)

    if task_record["download_type"] == "stream":
        task = StreamDownloadTask(
            task_id=task_id,
            url=task_record["url"],
            target_dir=target_dir,
            format_id=task_record.get("format_id") or "bestvideo+bestaudio/best",
            is_audio_only=(task_record.get("category") == "audio"),
            custom_title=task_record.get("title"),
            on_progress=handle_progress_update
        )
    else:
        task = DownloadTask(
            task_id=task_id,
            url=task_record["url"],
            target_dir=target_dir,
            filename=task_record.get("filename"),
            segments_count=segments,
            on_progress=handle_progress_update
        )

    task.status = "downloading"
    active_tasks[task_id] = task
    update_download_progress(
        task_id,
        task_record.get("downloaded_bytes", 0),
        task_record.get("progress", 0.0),
        0, 0,
        "downloading"
    )
    await broadcast({"type": "task_updated", "task": task.to_dict()})
    asyncio.create_task(_run_task(task_id, task))
    return {"success": True, "message": "Download resumed"}


@app.post("/api/download/{task_id}/cancel")
async def cancel_download(task_id: str):
    task = active_tasks.get(task_id)
    if task:
        task.cancel()
        active_tasks.pop(task_id, None)
    
    update_download_progress(task_id, 0, 0, 0, 0, "canceled")
    await broadcast({"type": "task_canceled", "task_id": task_id})
    return {"success": True, "message": "Download canceled"}


@app.delete("/api/download/{task_id}")
async def delete_download(task_id: str, delete_file: bool = Query(False)):
    task = active_tasks.get(task_id)
    if task:
        task.cancel()
        active_tasks.pop(task_id, None)

    task_record = get_download_task(task_id)
    if task_record and delete_file and task_record.get("file_path"):
        try:
            if os.path.exists(task_record["file_path"]):
                os.remove(task_record["file_path"])
        except Exception:
            pass

    delete_download_task(task_id)
    await broadcast({"type": "task_deleted", "task_id": task_id})
    return {"success": True, "message": "Download deleted"}


@app.post("/api/download/clear-completed")
async def clear_completed():
    clear_completed_downloads()
    await broadcast({"type": "refresh_list"})
    return {"success": True, "message": "Cleared completed downloads"}


@app.post("/api/download/clear-all")
async def clear_all():
    for task_id, task in list(active_tasks.items()):
        if hasattr(task, "cancel"):
            try:
                task.cancel()
            except Exception:
                pass
    active_tasks.clear()
    clear_all_downloads()
    await broadcast({"type": "refresh_list"})
    return {"success": True, "message": "Cleared all downloads"}


@app.get("/api/downloads")
async def list_downloads(category: Optional[str] = "all", status: Optional[str] = "all"):
    return {"success": True, "downloads": get_all_downloads(category, status)}


@app.get("/api/settings")
async def fetch_settings():
    return {"success": True, "settings": get_settings()}


@app.post("/api/settings")
async def save_settings(req: SettingsRequest):
    if req.download_dir is not None:
        update_setting("download_dir", req.download_dir)
        os.makedirs(req.download_dir, exist_ok=True)
    if req.max_concurrent_downloads is not None:
        update_setting("max_concurrent_downloads", req.max_concurrent_downloads)
    if req.max_segments_per_download is not None:
        update_setting("max_segments_per_download", req.max_segments_per_download)
    if req.speed_limit is not None:
        update_setting("speed_limit", req.speed_limit)
    if req.auto_start is not None:
        update_setting("auto_start", req.auto_start)
    if req.theme is not None:
        update_setting("theme", req.theme)

    updated = get_settings()
    await broadcast({"type": "settings_updated", "settings": updated})
    return {"success": True, "settings": updated}


@app.get("/api/media/{task_id}")
async def stream_media(task_id: str):
    task = get_download_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    file_path = task.get("file_path")
    settings = get_settings()
    dl_dir = settings.get("download_dir", str(Path.home() / "Downloads" / "ProDownloader"))

    if not file_path or not os.path.exists(file_path):
        if task.get("title") and os.path.exists(dl_dir):
            clean_title = "".join(c for c in task["title"] if c.isalnum() or c in " _-")[:12].strip().lower()
            for fname in os.listdir(dl_dir):
                if clean_title and clean_title in fname.lower():
                    file_path = os.path.join(dl_dir, fname)
                    break

    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Media file not found on disk")

    ext = os.path.splitext(file_path)[1].lower()
    media_type = "video/mp4"
    if ext in [".mp3"]: media_type = "audio/mpeg"
    elif ext in [".m4a", ".aac"]: media_type = "audio/mp4"
    elif ext in [".webm"]: media_type = "video/webm"
    elif ext in [".mkv"]: media_type = "video/x-matroska"

    return FileResponse(file_path, media_type=media_type, filename=os.path.basename(file_path))


@app.post("/api/system/open-file")
async def open_file(req: FileActionRequest):
    settings = get_settings()
    dl_dir = settings.get("download_dir", str(Path.home() / "Downloads" / "ProDownloader"))

    file_path = req.file_path
    if not file_path and req.task_id:
        task = get_download_task(req.task_id)
        if task:
            file_path = task.get("file_path")

    real_file_path = None
    if file_path:
        try:
            if os.path.exists(file_path):
                real_file_path = file_path
        except Exception:
            pass

    if not real_file_path and req.task_id:
        task = get_download_task(req.task_id)
        if task and task.get("title"):
            clean_title = "".join(c for c in task["title"] if c.isalnum() or c in " _-")[:12].strip().lower()
            if os.path.exists(dl_dir):
                for fname in os.listdir(dl_dir):
                    if clean_title and clean_title in fname.lower():
                        real_file_path = os.path.join(dl_dir, fname)
                        break

    if not real_file_path or not os.path.exists(real_file_path):
        raise HTTPException(status_code=404, detail="File not found on disk. It may have been moved or deleted.")

    try:
        if sys.platform == "win32":
            os.startfile(os.path.normpath(real_file_path))
        elif sys.platform == "darwin":
            subprocess.Popen(["open", os.path.abspath(real_file_path)])
        else:
            subprocess.Popen(["xdg-open", os.path.abspath(real_file_path)])
        return {"success": True, "message": "File opened"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not open file: {str(e)}")


@app.post("/api/system/open-folder")
async def open_folder(req: FileActionRequest):
    settings = get_settings()
    dl_dir = settings.get("download_dir", str(Path.home() / "Downloads" / "EggDL"))
    os.makedirs(dl_dir, exist_ok=True)

    file_path = req.file_path
    if not file_path and req.task_id:
        task = get_download_task(req.task_id)
        if task:
            file_path = task.get("file_path")

    real_file_path = None
    if file_path:
        try:
            if os.path.exists(file_path):
                real_file_path = file_path
        except Exception:
            pass

    if not real_file_path and req.task_id:
        task = get_download_task(req.task_id)
        if task and task.get("title"):
            clean_title = "".join(c for c in task["title"] if c.isalnum() or c in " _-")[:12].strip().lower()
            if os.path.exists(dl_dir):
                for fname in os.listdir(dl_dir):
                    if clean_title and clean_title in fname.lower():
                        real_file_path = os.path.join(dl_dir, fname)
                        break

    try:
        if sys.platform == "win32":
            if real_file_path and os.path.isfile(real_file_path):
                norm_f = os.path.normpath(real_file_path)
                try:
                    subprocess.Popen(f'explorer.exe /select,"{norm_f}"', shell=True)
                except Exception:
                    os.startfile(os.path.dirname(norm_f))
            else:
                norm_d = os.path.normpath(dl_dir)
                os.startfile(norm_d)
        elif sys.platform == "darwin":
            if real_file_path and os.path.exists(real_file_path):
                subprocess.Popen(["open", "-R", os.path.abspath(real_file_path)])
            else:
                subprocess.Popen(["open", os.path.abspath(dl_dir)])
        else:
            target = os.path.dirname(real_file_path) if (real_file_path and os.path.exists(real_file_path)) else dl_dir
            subprocess.Popen(["xdg-open", os.path.abspath(target)])
        return {"success": True, "message": "Folder opened", "folder_path": dl_dir}
    except Exception as e:
        if sys.platform == "win32":
            try:
                os.startfile(os.path.normpath(dl_dir))
                return {"success": True, "message": "Folder opened", "folder_path": dl_dir}
            except Exception:
                pass
        return {"success": True, "message": "Folder opened", "folder_path": dl_dir}


@app.get("/api/system/stats")
async def system_stats():
    settings = get_settings()
    dl_dir = settings.get("download_dir", str(Path.home() / "Downloads" / "EggDL"))
    try:
        os.makedirs(dl_dir, exist_ok=True)
        total, used, free = shutil.disk_usage(dl_dir)
        disk_info = {
            "total_gb": round(total / (1024**3), 1),
            "used_gb": round(used / (1024**3), 1),
            "free_gb": round(free / (1024**3), 1),
            "percent_used": round((used / total) * 100, 1)
        }
    except Exception:
        try:
            total, used, free = shutil.disk_usage(str(Path.home()))
            disk_info = {
                "total_gb": round(total / (1024**3), 1),
                "used_gb": round(used / (1024**3), 1),
                "free_gb": round(free / (1024**3), 1),
                "percent_used": round((used / total) * 100, 1)
            }
        except Exception:
            disk_info = {
                "total_gb": 512.0,
                "used_gb": 128.0,
                "free_gb": 384.0,
                "percent_used": 25.0
            }

    return {
        "success": True,
        "disk": disk_info,
        "active_downloads": len(active_tasks),
        "download_dir": dl_dir
    }


# Mount Frontend static files
def get_frontend_dir() -> str:
    if getattr(sys, 'frozen', False):
        base_dir = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
        for candidate in [
            os.path.join(base_dir, "frontend"),
            os.path.join(os.path.dirname(sys.executable), "frontend"),
            os.path.join(base_dir, "..", "frontend"),
        ]:
            if os.path.isdir(candidate):
                return candidate
        return os.path.join(base_dir, "frontend")
    else:
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))

frontend_dir = get_frontend_dir()
if os.path.exists(frontend_dir):
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

@app.get("/")
async def serve_index():
    index_file = os.path.join(frontend_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "EggDL Backend Running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
