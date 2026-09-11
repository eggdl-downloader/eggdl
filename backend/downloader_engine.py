import os
import sys
import time
import math
import json
import asyncio
import aiohttp
import mimetypes
import re
import urllib.parse
import tempfile
import shutil
import socket
from pathlib import Path
from typing import Dict, List, Optional, Callable, Any

def clean_stale_legacy_temp_dirs():
    """Scans and completely cleans any orphaned .pro_dl_* or .eggdl_* temporary chunk folders from downloads directories."""
    candidate_dirs = [
        str(Path.home() / "Downloads"),
        str(Path.home() / "Downloads" / "Eggdl Downloads"),
        str(Path.home() / "Downloads" / "EggDL"),
        os.path.join(tempfile.gettempdir(), "EggDL_Chunks"),
        os.path.join(tempfile.gettempdir(), "EggDL")
    ]
    for c_dir in candidate_dirs:
        try:
            if not os.path.exists(c_dir):
                continue
            for entry in os.listdir(c_dir):
                if entry.startswith(".pro_dl_") or entry.startswith(".eggdl_") or entry.startswith("pro_dl_") or entry.startswith(".eggdl_chunk_"):
                    p = os.path.join(c_dir, entry)
                    if os.path.isdir(p):
                        shutil.rmtree(p, ignore_errors=True)
                    elif os.path.isfile(p):
                        try: os.remove(p)
                        except Exception: pass
        except Exception:
            pass

# Clean on import
clean_stale_legacy_temp_dirs()

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


def get_smart_headers(url: str, custom_referer: Optional[str] = None, cookies: Optional[str] = None) -> Dict[str, str]:
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
            ref = custom_referer or f"{parsed.scheme}://{parsed.netloc}/"
            origin = f"{parsed.scheme}://{parsed.netloc}"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "identity",
        "Referer": ref,
        "Sec-Ch-Ua": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"'
    }
    if cookies:
        headers["Cookie"] = cookies
    return headers


class DownloadTask:
    # IDM minimum split size: minimum 2MB remaining to justify splitting an active segment
    MIN_SPLIT_SIZE = 2 * 1024 * 1024

    def __init__(self, task_id: str, url: str, target_dir: str, filename: Optional[str] = None,
                 segments_count: int = 16, referer: Optional[str] = None, cookies: Optional[str] = None,
                 file_path: Optional[str] = None, on_progress: Optional[Callable] = None):
        self.id = task_id
        self.url = url
        self.target_dir = target_dir
        self.custom_filename = filename
        self.segments_count = segments_count or 16
        self.referer = referer
        self.cookies = cookies
        self.on_progress = on_progress

        self.filename = filename or ""
        self.file_path = file_path or (os.path.join(self.target_dir, self.filename) if self.filename else "")
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
        self._cached_db_segments = None
        self._is_paused = False
        self._is_canceled = False
        self._last_time = 0.0
        self._last_bytes = 0
        self._speed_samples = []

        # Zero-copy file write lock & dynamic work stealing synchronization
        self._write_lock = asyncio.Lock()
        self._split_lock = asyncio.Lock()
        self._file_handle = None

    @property
    def _part_path(self) -> str:
        return f"{self.file_path}.eggdl_part"

    @property
    def _state_path(self) -> str:
        return f"{self.file_path}.eggdl_state"

    async def inspect(self) -> Dict[str, Any]:
        headers = get_smart_headers(self.url, self.referer, self.cookies)
        connector = aiohttp.TCPConnector(family=socket.AF_INET)
        async with aiohttp.ClientSession(headers=headers, connector=connector, auto_decompress=False) as session:
            try:
                async with session.head(self.url, allow_redirects=True, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    if resp.status == 200:
                        accept_ranges = (resp.headers.get("accept-ranges") or "").lower()
                        if accept_ranges != "bytes":
                            try:
                                async with session.get(self.url, headers={"Range": "bytes=0-0"}, allow_redirects=True, timeout=aiohttp.ClientTimeout(total=15)) as probe_resp:
                                    return self._parse_headers(probe_resp.headers, probe_resp.status, str(probe_resp.url))
                            except Exception:
                                pass
                        return self._parse_headers(resp.headers, resp.status, str(resp.url))
                    elif resp.status in (206, 400, 403, 405, 416):
                        async with session.get(self.url, headers={"Range": "bytes=0-0"}, allow_redirects=True, timeout=aiohttp.ClientTimeout(total=15)) as get_resp:
                            return self._parse_headers(get_resp.headers, get_resp.status, str(get_resp.url))
                    return self._parse_headers(resp.headers, resp.status, str(resp.url))
            except Exception:
                try:
                    async with session.get(self.url, headers={"Range": "bytes=0-0"}, allow_redirects=True, timeout=aiohttp.ClientTimeout(total=15)) as get_resp:
                        return self._parse_headers(get_resp.headers, get_resp.status, str(get_resp.url))
                except Exception:
                    return self._inspect_via_curl_cffi()

    def _inspect_via_curl_cffi(self) -> Dict[str, Any]:
        try:
            from curl_cffi import requests
            headers = get_smart_headers(self.url, self.referer, self.cookies)
            r = requests.head(self.url, impersonate="chrome124", headers=headers, timeout=15)
            if r.status_code >= 400:
                r = requests.get(self.url, impersonate="chrome124", headers={"Range": "bytes=0-0", **headers}, timeout=15)
            return self._parse_headers(r.headers, r.status_code, r.url)
        except Exception:
            return {
                "filename": self.filename or f"download_{int(time.time())}",
                "file_size": -1,
                "supports_ranges": False,
                "content_type": "",
                "category": "other"
            }

    def _parse_headers(self, headers: Any, status_code: int, final_url: str) -> Dict[str, Any]:
        if final_url and (final_url.startswith("http://") or final_url.startswith("https://")):
            self.url = final_url

        content_len = headers.get("content-length") or headers.get("Content-Length")
        if content_len:
            try:
                self.file_size = int(content_len)
            except ValueError:
                self.file_size = -1
        else:
            content_range = headers.get("content-range") or headers.get("Content-Range")
            if content_range:
                match = re.search(r"/(\d+)", content_range)
                if match:
                    try:
                        self.file_size = int(match.group(1))
                    except ValueError:
                        self.file_size = -1

        content_type = headers.get("content-type", "") or headers.get("Content-Type", "")
        
        accept_ranges = headers.get("accept-ranges") or headers.get("Accept-Ranges") or ""
        content_range = headers.get("content-range") or headers.get("Content-Range") or ""
        self.supports_ranges = (str(accept_ranges).strip().lower() == "bytes" or status_code == 206 or bool(content_range))

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

    def _load_state(self) -> bool:
        """Loads existing multipart resume state if valid."""
        try:
            loaded_data = None
            if os.path.exists(self._state_path) and os.path.exists(self._part_path):
                with open(self._state_path, "r", encoding="utf-8") as f:
                    loaded_data = json.load(f)
            elif getattr(self, "_cached_db_segments", None) and os.path.exists(self._part_path):
                loaded_data = {"segments": self._cached_db_segments, "file_size": self.file_size}

            if loaded_data:
                saved_segments = loaded_data.get("segments", [])
                saved_size = loaded_data.get("file_size", -1)

                if saved_segments:
                    # Adopt saved size if current size was unknown
                    if self.file_size <= 0 and saved_size > 0:
                        self.file_size = saved_size

                    # Accept if sizes match or either is not strictly defined
                    if self.file_size <= 0 or saved_size <= 0 or saved_size == self.file_size:
                        self.segments = []
                        for s in saved_segments:
                            seg = Segment(s["index"], s["start"], s["end"], downloaded=s.get("downloaded", 0))
                            if s.get("status") == "completed":
                                seg.status = "completed"
                            else:
                                seg.status = "pending"
                            self.segments.append(seg)

                        if self.segments:
                            self.supports_ranges = True
                            self.downloaded_bytes = sum(s.downloaded for s in self.segments)
                            if self.file_size > 0:
                                self.progress = min(100.0, (self.downloaded_bytes / self.file_size) * 100.0)
                            return True
        except Exception as e:
            print(f"Error loading state for {self.filename}: {e}")
        return False

    def _save_state(self):
        """Flushes current segment state to disk for pause/resume."""
        try:
            if not self.file_path or not self.supports_ranges or self.file_size <= 0:
                return
            data = {
                "task_id": self.id,
                "url": self.url,
                "file_size": self.file_size,
                "downloaded_bytes": self.downloaded_bytes,
                "segments": [s.to_dict() for s in self.segments]
            }
            tmp_state = f"{self._state_path}.tmp"
            with open(tmp_state, "w", encoding="utf-8") as f:
                json.dump(data, f)
            os.replace(tmp_state, self._state_path)
        except Exception:
            pass

    def _init_segments(self):
        # 1. Attempt to resume from existing state
        if self._load_state():
            return

        self.segments = []
        if not self.supports_ranges or self.file_size <= 0 or self.segments_count <= 1:
            self.segments.append(Segment(0, 0, self.file_size - 1 if self.file_size > 0 else -1, downloaded=0))
            return

        # IDM Turbo connection scaling based on file size
        active_count = self.segments_count
        if active_count < 16 and self.file_size >= 10 * 1024 * 1024:
            active_count = 16
        if active_count < 24 and self.file_size >= 50 * 1024 * 1024:
            active_count = 24
        if active_count < 32 and self.file_size >= 150 * 1024 * 1024:
            active_count = 32

        chunk_size = math.ceil(self.file_size / active_count)
        for i in range(active_count):
            start = i * chunk_size
            end = min(start + chunk_size - 1, self.file_size - 1)
            if start <= self.file_size - 1:
                self.segments.append(Segment(i, start, end, downloaded=0))

    async def _steal_work(self) -> Optional[Segment]:
        """IDM Dynamic Work-Stealing: Splits the largest remaining active segment in half."""
        async with self._split_lock:
            best_seg = None
            max_remaining = 0
            for s in self.segments:
                if s.status == "downloading" and s.end > 0:
                    curr_pos = s.start + s.downloaded
                    rem = s.end - curr_pos + 1
                    if rem > max_remaining and rem >= (self.MIN_SPLIT_SIZE * 2):
                        max_remaining = rem
                        best_seg = s

            if not best_seg:
                return None

            curr_pos = best_seg.start + best_seg.downloaded
            rem_bytes = best_seg.end - curr_pos + 1
            half = rem_bytes // 2
            split_start = curr_pos + half
            old_end = best_seg.end

            # Resize original segment boundary
            best_seg.end = split_start - 1
            best_seg.total = best_seg.end - best_seg.start + 1

            # Allocate new segment for the second half
            new_index = len(self.segments)
            new_seg = Segment(index=new_index, start=split_start, end=old_end, downloaded=0)
            self.segments.append(new_seg)
            return new_seg

    async def _worker_loop(self, session: aiohttp.ClientSession, initial_segment: Segment):
        """Worker that downloads a segment, then steals work dynamically from slower segments until 100% done."""
        curr_segment = initial_segment
        retries = 0
        while curr_segment and not self._is_paused and not self._is_canceled:
            try:
                await self._download_segment(session, curr_segment)
                retries = 0
            except Exception as seg_err:
                if self._is_paused or self._is_canceled:
                    break
                retries += 1
                if retries <= 3:
                    await asyncio.sleep(0.5)
                    continue
                else:
                    curr_segment.status = "error"
                    break

            if curr_segment.status == "completed" and self.supports_ranges and self.file_size > 0:
                curr_segment = await self._steal_work()
            else:
                break

    async def _download_segment(self, session: aiohttp.ClientSession, segment: Segment):
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
        chunk_read_size = 256 * 1024  # 256 KB high-performance chunk buffer

        try:
            async with session.get(self.url, headers=headers, timeout=aiohttp.ClientTimeout(total=None, sock_read=60)) as resp:
                if resp.status == 416:
                    # Satisfied / file offset reached
                    segment.status = "completed"
                    return

                if resp.status not in (200, 206):
                    raise Exception(f"HTTP Status {resp.status}")

                # If server sent 200 on range request for non-zero offset, server doesn't support ranges
                if resp.status == 200 and segment.start > 0:
                    segment.status = "error"
                    return

                async for chunk in resp.content.iter_chunked(chunk_read_size):
                    if self._is_paused or self._is_canceled:
                        segment.status = "paused" if self._is_paused else "canceled"
                        return

                    chunk_len = len(chunk)
                    write_pos = segment.start + segment.downloaded

                    if segment.end > 0:
                        remaining_seg = segment.end - write_pos + 1
                        if remaining_seg <= 0:
                            segment.status = "completed"
                            return
                        if chunk_len > remaining_seg:
                            chunk = chunk[:remaining_seg]
                            chunk_len = len(chunk)

                    async with self._write_lock:
                        if self._file_handle and not self._file_handle.closed:
                            if self.supports_ranges and self.file_size > 0:
                                self._file_handle.seek(write_pos)
                            self._file_handle.write(chunk)

                    segment.downloaded += chunk_len
                    self.downloaded_bytes += chunk_len

                    if segment.end > 0 and (segment.start + segment.downloaded) > segment.end:
                        break

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

            if not self.filename or self.file_size <= 0 or not self.supports_ranges:
                await self.inspect()

            if not self.file_path:
                self.file_path = os.path.join(self.target_dir, self.filename)

            # Ensure unique filename if not resuming an existing partial download
            if not os.path.exists(self._part_path) and not os.path.exists(self._state_path):
                base, ext = os.path.splitext(self.filename)
                counter = 1
                while os.path.exists(os.path.join(self.target_dir, self.filename)):
                    self.filename = f"{base} ({counter}){ext}"
                    counter += 1
                self.file_path = os.path.join(self.target_dir, self.filename)

            if not self.segments:
                self._init_segments()
            else:
                # Reset any paused/downloading segments to pending so workers pick them up
                for seg in self.segments:
                    if seg.status in ("paused", "downloading"):
                        seg.status = "pending"

            # Touch partial file if it does not exist yet (instant zero-delay file creation)
            if not os.path.exists(self._part_path):
                with open(self._part_path, "wb") as f:
                    pass

            # Open persistent write handle
            open_mode = "r+b" if (self.supports_ranges and self.file_size > 0) else "ab"
            self._file_handle = open(self._part_path, open_mode)

            # Recalculate downloaded bytes from segments
            self.downloaded_bytes = sum(s.downloaded for s in self.segments)
            self._last_time = time.time()
            self._last_bytes = self.downloaded_bytes

            timeout = aiohttp.ClientTimeout(total=None, connect=30, sock_read=60)
            headers = get_smart_headers(self.url, self.referer, self.cookies)
            
            # High-performance non-limiting connector with DNS caching
            connector = aiohttp.TCPConnector(
                family=socket.AF_INET,
                limit=0,
                limit_per_host=0,
                ttl_dns_cache=300,
                enable_cleanup_closed=True,
                force_close=False
            )

            async with aiohttp.ClientSession(headers=headers, connector=connector, timeout=timeout, auto_decompress=False) as session:
                reporter_task = asyncio.create_task(self._progress_loop())
                
                # Launch workers for all segments currently pending
                active_segs = [s for s in self.segments if s.status != "completed"]
                tasks = [self._worker_loop(session, seg) for seg in active_segs]
                if tasks:
                    await asyncio.gather(*tasks)

                reporter_task.cancel()

            # Close file handle
            if self._file_handle and not self._file_handle.closed:
                self._file_handle.flush()
                self._file_handle.close()
                self._file_handle = None

            if self._is_paused:
                self.status = "paused"
                self._save_state()
                self._report_progress()
                return

            if self._is_canceled:
                self.status = "canceled"
                self._cleanup_files()
                self._report_progress()
                return

            # Check if all completed
            if all(s.status == "completed" for s in self.segments):
                # Ensure correct file size metadata upon completion if needed
                if self.file_size > 0 and os.path.exists(self._part_path):
                    try:
                        actual_sz = os.path.getsize(self._part_path)
                        if actual_sz < self.file_size:
                            with open(self._part_path, "a+b") as f:
                                f.truncate(self.file_size)
                    except Exception:
                        pass

                # Instant atomic zero-copy completion!
                if os.path.exists(self._part_path):
                    os.replace(self._part_path, self.file_path)
                if os.path.exists(self._state_path):
                    try: os.remove(self._state_path)
                    except Exception: pass

                self.status = "completed"
                self.progress = 100.0
                self.speed = 0.0
                self.eta = 0
                self._report_progress()
            else:
                # Try curl_cffi fallback before failing
                if self._download_via_curl_cffi():
                    return
                self.status = "error"
                self.error_message = "Some download segments failed."
                self._report_progress()

        except Exception as e:
            if self._file_handle and not self._file_handle.closed:
                try:
                    self._file_handle.flush()
                    self._file_handle.close()
                except Exception: pass
                self._file_handle = None

            if self._is_paused:
                self.status = "paused"
                self._save_state()
                self._report_progress()
                return

            if self._is_canceled:
                self.status = "canceled"
                self._cleanup_files()
                self._report_progress()
                return

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
                self._cleanup_files()
                self._report_progress()
                return True
        except Exception:
            pass
        return False

    def _cleanup_files(self):
        try:
            if os.path.exists(self._part_path):
                os.remove(self._part_path)
        except Exception:
            pass
        try:
            if os.path.exists(self._state_path):
                os.remove(self._state_path)
        except Exception:
            pass

    async def _progress_loop(self):
        state_save_counter = 0
        while not self._is_paused and not self._is_canceled and self.status == "downloading":
            await asyncio.sleep(0.5)
            self._update_speed()
            self._report_progress()
            state_save_counter += 1
            if state_save_counter >= 6:
                state_save_counter = 0
                self._save_state()

    def _update_speed(self):
        now = time.time()
        dt = now - self._last_time
        if dt >= 0.5:
            current_bytes = self.downloaded_bytes
            delta_bytes = current_bytes - self._last_bytes
            inst_speed = delta_bytes / dt if dt > 0 else 0

            self._speed_samples.append(inst_speed)
            if len(self._speed_samples) > 5:
                self._speed_samples.pop(0)
            self.speed = sum(self._speed_samples) / len(self._speed_samples)

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
        self._save_state()

    def cancel(self):
        self._is_canceled = True
        self.status = "canceled"
        if self._file_handle and not self._file_handle.closed:
            try:
                self._file_handle.close()
                self._file_handle = None
            except Exception: pass
        self._cleanup_files()

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
            "referer": self.referer,
            "cookies": self.cookies,
            "segments": [s.to_dict() for s in self.segments],
            "created_at": getattr(self, "created_at", time.time()),
            "error_message": self.error_message
        }
