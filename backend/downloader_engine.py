import os
import sys
import time
import math
import asyncio
import aiohttp
import mimetypes
import re
import urllib.parse
from pathlib import Path
from typing import Dict, List, Optional, Callable, Any

# Map file extensions to categories
CATEGORY_MAP = {
    "video": [".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv", ".wmv", ".m4v", ".ts", ".3gp"],
    "audio": [".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".wma", ".opus", ".alac"],
    "compressed": [".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".iso", ".dmg"],
    "document": [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".epub"],
    "program": [".exe", ".msi", ".apk", ".bat", ".cmd", ".sh", ".appimage", ".deb", ".rpm"],
    "image": [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico", ".tiff"]
}

def detect_category(filename: str, content_type: Optional[str] = None) -> str:
    ext = os.path.splitext(filename)[1].lower()
    for cat, exts in CATEGORY_MAP.items():
        if ext in exts:
            return cat
    if content_type:
        content_type = content_type.lower()
        if "video" in content_type:
            return "video"
        if "audio" in content_type:
            return "audio"
        if "image" in content_type:
            return "image"
        if "pdf" in content_type or "document" in content_type or "text" in content_type:
            return "document"
        if "zip" in content_type or "compressed" in content_type or "tar" in content_type or "octet-stream" in content_type:
            return "compressed"
    return "other"

def sanitize_filename(name: str) -> str:
    # Remove invalid windows filename chars
    name = re.sub(r'[\\/*?:"<>|]', "_", name)
    name = name.strip().strip(".")
    if not name:
        name = f"download_{int(time.time())}"
    return name

def extract_filename_from_headers(url: str, headers: Dict[str, str]) -> str:
    content_disp = headers.get("content-disposition", "") or headers.get("Content-Disposition", "")
    if content_disp:
        # Check for filename* (RFC 5987)
        match_star = re.search(r"filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;]+)", content_disp, re.IGNORECASE)
        if match_star:
            return sanitize_filename(urllib.parse.unquote(match_star.group(1).strip('"\'')))
        # Check standard filename=
        match = re.search(r'filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)', content_disp, re.IGNORECASE)
        if match:
            fname = match.group(1) or match.group(2)
            return sanitize_filename(urllib.parse.unquote(fname.strip('"\'')))
    
    # Fallback to URL path
    parsed = urllib.parse.urlparse(url)
    path_name = os.path.basename(parsed.path)
    if path_name and "." in path_name:
        return sanitize_filename(urllib.parse.unquote(path_name))
    
    # Check mime type
    content_type = headers.get("content-type", "") or headers.get("Content-Type", "")
    ext = mimetypes.guess_extension(content_type.split(";")[0].strip()) if content_type else ""
    ext = ext or ".bin"
    return sanitize_filename(f"file_{int(time.time())}{ext}")


import socket

class Segment:
    def __init__(self, index: int, start: int, end: int, downloaded: int = 0):
        self.index = index
        self.start = start
        self.end = end
        self.downloaded = downloaded
        self.total = (end - start + 1) if end >= start else 0
        self.status = "idle"  # idle, downloading, completed, error

    @property
    def progress(self) -> float:
        if self.total <= 0:
            return 0.0
        return min(100.0, (self.downloaded / self.total) * 100.0)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "index": self.index,
            "start": self.start,
            "end": self.end,
            "downloaded": self.downloaded,
            "total": self.total,
            "progress": round(self.progress, 1),
            "status": self.status
        }


class DownloadTask:
    def __init__(self, task_id: str, url: str, target_dir: str, filename: Optional[str] = None,
                 segments_count: int = 8, referer: Optional[str] = None, on_progress: Optional[Callable] = None):
        self.id = task_id
        self.url = url
        self.target_dir = target_dir
        self.custom_filename = filename
        self.segments_count = segments_count
        self.referer = referer
        self.on_progress = on_progress

        self.filename = filename or ""
        self.file_path = ""
        self.file_size = -1
        self.downloaded_bytes = 0
        self.progress = 0.0
        self.speed = 0.0
        self.eta = 0
        self.status = "queued"  # queued, downloading, paused, completed, error, canceled
        self.category = "other"
        self.supports_ranges = False
        self.error_message = None
        self.created_at = time.time()

        self.segments: List[Segment] = []
        self._is_paused = False
        self._is_canceled = False
        self._temp_dir = os.path.join(target_dir, f".pro_dl_{task_id}")
        self._last_time = 0.0
        self._last_bytes = 0
        self._speed_samples = []

def get_smart_headers(url: str, custom_referer: Optional[str] = None) -> Dict[str, str]:
    parsed = urllib.parse.urlparse(url)
    netloc = parsed.netloc.lower()
    
    ref = custom_referer
    origin = None
    
    if not ref:
        if "jiosicloud" in netloc or "jiocloud" in netloc or "jioaicloud" in netloc:
            ref = "https://jioaicloud.com/"
            origin = "https://jioaicloud.com"
        elif "googleusercontent" in netloc or "drive.google" in netloc:
            ref = "https://drive.google.com/"
            origin = "https://drive.google.com"
        elif "twimg" in netloc or "twitter" in netloc or "x.com" in netloc:
            ref = "https://twitter.com/"
            origin = "https://twitter.com"
        elif "cdninstagram" in netloc or "instagram" in netloc:
            ref = "https://www.instagram.com/"
            origin = "https://www.instagram.com"
        elif "fbcdn" in netloc or "facebook" in netloc:
            ref = "https://www.facebook.com/"
            origin = "https://www.facebook.com"
        elif "tiktok" in netloc or "byteoversea" in netloc or "ibytedtos" in netloc:
            ref = "https://www.tiktok.com/"
            origin = "https://www.tiktok.com"
        elif "reddit" in netloc or "redd.it" in netloc:
            ref = "https://www.reddit.com/"
            origin = "https://www.reddit.com"
        elif "dropbox" in netloc:
            ref = "https://www.dropbox.com/"
            origin = "https://www.dropbox.com"
        elif "mediafire" in netloc:
            ref = "https://www.mediafire.com/"
            origin = "https://www.mediafire.com"
        elif "terabox" in netloc or "1024tera" in netloc:
            ref = "https://www.terabox.com/"
            origin = "https://www.terabox.com"
        else:
            ref = f"{parsed.scheme}://{parsed.netloc}/"
            origin = f"{parsed.scheme}://{parsed.netloc}"

    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "identity",
        "Referer": ref,
        "Origin": origin or f"{parsed.scheme}://{parsed.netloc}",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "cross-site"
    }


class DownloadTask:
    def __init__(self, task_id: str, url: str, target_dir: str, filename: Optional[str] = None,
                 segments_count: int = 8, referer: Optional[str] = None, on_progress: Optional[Callable] = None):
        self.id = task_id
        self.url = url
        self.target_dir = target_dir
        self.custom_filename = filename
        self.segments_count = segments_count
        self.referer = referer
        self.on_progress = on_progress

        self.filename = filename or ""
        self.file_path = ""
        self.file_size = -1
        self.downloaded_bytes = 0
        self.progress = 0.0
        self.speed = 0.0
        self.eta = 0
        self.status = "queued"  # queued, downloading, paused, completed, error, canceled
        self.category = "other"
        self.supports_ranges = False
        self.error_message = None
        self.created_at = time.time()

        self.segments: List[Segment] = []
        self._is_paused = False
        self._is_canceled = False
        self._temp_dir = os.path.join(target_dir, f".pro_dl_{task_id}")
        self._last_time = 0.0
        self._last_bytes = 0
        self._speed_samples = []

    async def inspect(self) -> Dict[str, Any]:
        headers = get_smart_headers(self.url, self.referer)
        connector = aiohttp.TCPConnector(family=socket.AF_INET)
        async with aiohttp.ClientSession(headers=headers, connector=connector, auto_decompress=False) as session:
            try:
                async with session.head(self.url, allow_redirects=True, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    if resp.status >= 400:
                        # Some servers reject HEAD, try GET with range
                        async with session.get(self.url, headers={"Range": "bytes=0-0"}, allow_redirects=True, timeout=aiohttp.ClientTimeout(total=15)) as get_resp:
                            return self._parse_headers(get_resp.headers, get_resp.status, str(get_resp.url))
                    return self._parse_headers(resp.headers, resp.status, str(resp.url))
            except Exception:
                try:
                    # Fallback to GET
                    async with session.get(self.url, headers={"Range": "bytes=0-0"}, allow_redirects=True, timeout=aiohttp.ClientTimeout(total=15)) as get_resp:
                        return self._parse_headers(get_resp.headers, get_resp.status, str(get_resp.url))
                except Exception:
                    # Final fallback with curl_cffi
                    return self._inspect_via_curl_cffi()

    def _inspect_via_curl_cffi(self) -> Dict[str, Any]:
        try:
            from curl_cffi import requests
            headers = get_smart_headers(self.url, self.referer)
            r = requests.head(self.url, impersonate="chrome124", headers=headers, timeout=15)
            if r.status_code >= 400:
                r = requests.get(self.url, impersonate="chrome124", headers={"Range": "bytes=0-0", **headers}, timeout=15)
            return self._parse_headers(r.headers, r.status_code, r.url)
        except Exception as err:
            raise Exception(f"Could not inspect link: {err}")

    def _parse_headers(self, headers: Any, status_code: int, final_url: str) -> Dict[str, Any]:
        if "/login/" in final_url.lower() or ("/auth/" in final_url.lower() and not self.url.lower().endswith(".html")):
            raise Exception("This quality (1080p/4K) requires logging into a free account on the website. Please choose 720p or lower for instant free download.")

        content_type = headers.get("content-type") or headers.get("Content-Type") or ""
        ct_lower = content_type.lower()

        # Reject error JSON payloads on direct media links to avoid creating .json files
        if ("application/json" in ct_lower or "text/json" in ct_lower) and not self.url.lower().split("?")[0].endswith(".json"):
            raise Exception("This download link has expired or requires browser session authentication. Please play or download the media directly in your browser using the EggDL extension.")

        if "text/html" in ct_lower and (self.url.endswith(".mp4") or "dload" in self.url.lower() or "download" in self.url.lower()):
            raise Exception("Server returned a web page instead of the video stream. Please click 'Download Egg' directly on the video player.")

        content_length = headers.get("content-length") or headers.get("Content-Length")
        self.file_size = int(content_length) if content_length and content_length.isdigit() else -1
        
        accept_ranges = headers.get("accept-ranges") or headers.get("Accept-Ranges")
        content_range = headers.get("content-range") or headers.get("Content-Range")
        self.supports_ranges = (accept_ranges == "bytes" or status_code == 206 or bool(content_range))

        if self.custom_filename:
            self.filename = self.custom_filename
            if not os.path.splitext(self.filename)[1]:
                ct = content_type.lower()
                guessed_ext = ""
                if "image/jpeg" in ct or "image/jpg" in ct: guessed_ext = ".jpg"
                elif "image/png" in ct: guessed_ext = ".png"
                elif "image/webp" in ct: guessed_ext = ".webp"
                elif "image/gif" in ct: guessed_ext = ".gif"
                elif "video/mp4" in ct: guessed_ext = ".mp4"
                elif "video/webm" in ct: guessed_ext = ".webm"
                elif "audio/mpeg" in ct or "audio/mp3" in ct: guessed_ext = ".mp3"
                elif "audio/mp4" in ct or "audio/m4a" in ct: guessed_ext = ".m4a"
                elif "application/pdf" in ct: guessed_ext = ".pdf"
                elif "application/zip" in ct or "compressed" in ct: guessed_ext = ".zip"
                elif "octet-stream" in ct and any(k in self.url.lower() for k in ["video", "stream", "jio", "film", "movie", "clip"]):
                    guessed_ext = ".mp4"
                else:
                    guessed_ext = mimetypes.guess_extension(content_type.split(";")[0].strip()) or ""
                if guessed_ext and guessed_ext != ".bin":
                    self.filename = f"{self.filename}{guessed_ext}"
        elif not self.filename:
            self.filename = extract_filename_from_headers(final_url, dict(headers))
        
        self.category = detect_category(self.filename, content_type)
        self.file_path = os.path.join(self.target_dir, self.filename)

        return {
            "filename": self.filename,
            "file_size": self.file_size,
            "supports_ranges": self.supports_ranges,
            "content_type": content_type,
            "category": self.category
        }

    def _init_segments(self):
        self.segments = []
        if not self.supports_ranges or self.file_size <= 0 or self.segments_count <= 1:
            # Single segment
            part_path = os.path.join(self._temp_dir, "part_0.tmp")
            downloaded = os.path.getsize(part_path) if (self.supports_ranges and os.path.exists(part_path)) else 0
            self.segments.append(Segment(0, 0, self.file_size - 1 if self.file_size > 0 else -1, downloaded=downloaded))
            return

        chunk_size = math.ceil(self.file_size / self.segments_count)
        for i in range(self.segments_count):
            start = i * chunk_size
            end = min(start + chunk_size - 1, self.file_size - 1)
            if start <= self.file_size - 1:
                # Check if existing partial file exists
                part_path = os.path.join(self._temp_dir, f"part_{i}.tmp")
                downloaded = os.path.getsize(part_path) if os.path.exists(part_path) else 0
                self.segments.append(Segment(i, start, end, downloaded=downloaded))

    async def _download_segment(self, session: aiohttp.ClientSession, segment: Segment):
        part_path = os.path.join(self._temp_dir, f"part_{segment.index}.tmp")
        
        # Resume position if exists
        start_byte = segment.start + segment.downloaded
        if segment.end > 0 and start_byte > segment.end:
            segment.status = "completed"
            return

        headers = {}
        if segment.end >= 0:
            headers["Range"] = f"bytes={start_byte}-{segment.end}"
        elif start_byte > 0:
            headers["Range"] = f"bytes={start_byte}-"

        segment.status = "downloading"
        try:
            async with session.get(self.url, headers=headers, timeout=aiohttp.ClientTimeout(total=None, sock_read=60)) as resp:
                if resp.status == 416:
                    # Requested range not satisfiable - file already completed or offset overflow
                    if os.path.exists(part_path) and segment.end > 0 and os.path.getsize(part_path) >= (segment.end - segment.start):
                        segment.status = "completed"
                        return
                    # Fallback: re-request without stale range offset
                    headers_retry = {k: v for k, v in headers.items() if k.lower() != "range"}
                    async with session.get(self.url, headers=headers_retry, timeout=aiohttp.ClientTimeout(total=None, sock_read=60)) as r_resp:
                        if r_resp.status in (200, 206):
                            with open(part_path, "wb") as f:
                                async for chunk in r_resp.content.iter_chunked(64 * 1024):
                                    if self._is_paused or self._is_canceled:
                                        segment.status = "paused" if self._is_paused else "canceled"
                                        return
                                    f.write(chunk)
                                    chunk_len = len(chunk)
                                    segment.downloaded += chunk_len
                                    self.downloaded_bytes += chunk_len
                            segment.status = "completed"
                            return
                elif resp.status not in (200, 206):
                    raise Exception(f"HTTP Status {resp.status}")

                mode = "ab" if segment.downloaded > 0 else "wb"
                with open(part_path, mode) as f:
                    async for chunk in resp.content.iter_chunked(64 * 1024):
                        if self._is_paused or self._is_canceled:
                            segment.status = "paused" if self._is_paused else "canceled"
                            return

                        f.write(chunk)
                        chunk_len = len(chunk)
                        segment.downloaded += chunk_len
                        self.downloaded_bytes += chunk_len

            segment.status = "completed"
        except Exception as e:
            if not self._is_paused and not self._is_canceled:
                segment.status = "error"
                raise e

    async def start(self):
        try:
            self.status = "downloading"
            self._is_paused = False
            self._is_canceled = False
            
            os.makedirs(self.target_dir, exist_ok=True)
            os.makedirs(self._temp_dir, exist_ok=True)

            if not self.filename or self.file_size == -1:
                await self.inspect()

            # Ensure unique filename if already exists and not resuming
            if not os.path.exists(self._temp_dir):
                base, ext = os.path.splitext(self.filename)
                counter = 1
                while os.path.exists(os.path.join(self.target_dir, self.filename)):
                    self.filename = f"{base} ({counter}){ext}"
                    counter += 1
                self.file_path = os.path.join(self.target_dir, self.filename)

            if not self.segments:
                self._init_segments()

            # Recalculate downloaded bytes from segments
            self.downloaded_bytes = sum(s.downloaded for s in self.segments)
            self._last_time = time.time()
            self._last_bytes = self.downloaded_bytes

            timeout = aiohttp.ClientTimeout(total=None, connect=30, sock_read=60)
            headers = get_smart_headers(self.url, self.referer)
            connector = aiohttp.TCPConnector(family=socket.AF_INET)

            async with aiohttp.ClientSession(headers=headers, connector=connector, timeout=timeout, auto_decompress=False) as session:
                # Launch progress reporter task
                reporter_task = asyncio.create_task(self._progress_loop())
                
                # Launch parallel segment downloads
                tasks = [self._download_segment(session, seg) for seg in self.segments if seg.status != "completed"]
                await asyncio.gather(*tasks)

                reporter_task.cancel()

            if self._is_paused:
                self.status = "paused"
                self._report_progress()
                return

            if self._is_canceled:
                self.status = "canceled"
                self._cleanup_temp()
                self._report_progress()
                return

            # Check if all completed
            if all(s.status == "completed" for s in self.segments):
                self._assemble_file()
                self.status = "completed"
                self.progress = 100.0
                self.speed = 0.0
                self.eta = 0
                self._cleanup_temp()
                self._report_progress()
            else:
                # Try curl_cffi fallback before failing
                if self._download_via_curl_cffi():
                    return
                self.status = "error"
                self.error_message = "Some download segments failed."
                self._report_progress()

        except Exception as e:
            if not self._is_paused and not self._is_canceled:
                if self._download_via_curl_cffi():
                    return
            self.status = "error"
            self.error_message = str(e)
            self._report_progress()
            raise e

    def _download_via_curl_cffi(self) -> bool:
        try:
            from curl_cffi import requests
            parsed_origin = f"{urllib.parse.urlparse(self.url).scheme}://{urllib.parse.urlparse(self.url).netloc}"
            ref = self.referer or (parsed_origin + "/")
            headers = {
                "Referer": ref,
                "Origin": parsed_origin,
                "Accept": "*/*"
            }
            r = requests.get(self.url, impersonate="chrome124", headers=headers, timeout=40)
            if r.status_code == 200 and len(r.content) > 0:
                with open(self.file_path, "wb") as f:
                    f.write(r.content)
                self.file_size = len(r.content)
                self.downloaded_bytes = self.file_size
                self.progress = 100.0
                self.speed = 0.0
                self.eta = 0
                self.status = "completed"
                self._cleanup_temp()
                self._report_progress()
                return True
        except Exception:
            pass
        return False

    def _assemble_file(self):
        with open(self.file_path, "wb") as outfile:
            for seg in self.segments:
                part_path = os.path.join(self._temp_dir, f"part_{seg.index}.tmp")
                if os.path.exists(part_path):
                    with open(part_path, "rb") as infile:
                        while True:
                            buf = infile.read(1024 * 1024)
                            if not buf:
                                break
                            outfile.write(buf)

    def _cleanup_temp(self):
        try:
            if os.path.exists(self._temp_dir):
                for f in os.listdir(self._temp_dir):
                    os.remove(os.path.join(self._temp_dir, f))
                os.rmdir(self._temp_dir)
        except Exception:
            pass

    async def _progress_loop(self):
        while self.status == "downloading":
            await asyncio.sleep(0.5)
            self._calculate_speed_and_eta()
            self._report_progress()

    def _calculate_speed_and_eta(self):
        now = time.time()
        dt = now - self._last_time
        if dt >= 0.5:
            current_bytes = sum(s.downloaded for s in self.segments)
            bytes_delta = max(0, current_bytes - self._last_bytes)
            inst_speed = bytes_delta / dt
            
            # Smooth speed
            self._speed_samples.append(inst_speed)
            if len(self._speed_samples) > 5:
                self._speed_samples.pop(0)
            self.speed = sum(self._speed_samples) / len(self._speed_samples)

            self.downloaded_bytes = current_bytes
            self._last_time = now
            self._last_bytes = current_bytes

            if self.file_size > 0:
                self.progress = min(100.0, (self.downloaded_bytes / self.file_size) * 100.0)
                remaining = self.file_size - self.downloaded_bytes
                self.eta = int(remaining / self.speed) if self.speed > 0 else 0
            else:
                self.progress = 0.0
                self.eta = 0

    def _report_progress(self):
        if self.on_progress:
            data = self.to_dict()
            asyncio.create_task(self.on_progress(data))

    def pause(self):
        self._is_paused = True
        self.status = "paused"

    def cancel(self):
        self._is_canceled = True
        self.status = "canceled"
        self._cleanup_temp()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "url": self.url,
            "title": self.filename,
            "filename": self.filename,
            "file_path": self.file_path,
            "file_size": self.file_size,
            "downloaded_bytes": self.downloaded_bytes,
            "progress": round(self.progress, 1),
            "speed": round(self.speed, 1),
            "eta": self.eta,
            "status": self.status,
            "category": self.category,
            "supports_ranges": self.supports_ranges,
            "download_type": "direct",
            "segments": [s.to_dict() for s in self.segments],
            "created_at": getattr(self, "created_at", time.time()),
            "error_message": self.error_message
        }
