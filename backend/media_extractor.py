import os
import sys
import time
import uuid
import shutil
import asyncio
import subprocess
import re
import urllib.parse
from typing import Dict, List, Optional, Callable, Any
from pathlib import Path

# Check if yt_dlp is installed, or import gracefully
import threading
import gc

_TRACKED_STREAMS_LOCK = threading.Lock()
_TRACKED_OPEN_STREAMS: Dict[str, List[Any]] = {}

try:
    import yt_dlp
    import yt_dlp.postprocessor.ffmpeg as yt_ffmpeg
    yt_ffmpeg.os.rename = os.replace
    import yt_dlp.postprocessor.common as yt_common
    if hasattr(yt_common, 'os'):
        yt_common.os.rename = os.replace

    import yt_dlp.utils as yt_utils
    import yt_dlp.downloader.common as yt_dl_common

    _orig_sanitize_open = yt_utils.sanitize_open

    def _hooked_sanitize_open(filename, open_mode):
        stream, definitive_name = _orig_sanitize_open(filename, open_mode)
        try:
            abs_p = os.path.normcase(os.path.abspath(definitive_name))
            with _TRACKED_STREAMS_LOCK:
                if abs_p not in _TRACKED_OPEN_STREAMS:
                    _TRACKED_OPEN_STREAMS[abs_p] = []
                _TRACKED_OPEN_STREAMS[abs_p].append(stream)
        except Exception:
            pass
        return stream, definitive_name

    yt_utils.sanitize_open = _hooked_sanitize_open
    yt_dl_common.sanitize_open = _hooked_sanitize_open
except Exception:
    yt_dlp = None

def close_tracked_streams(target_dir: str = "", file_path: str = "", prefixes: Optional[set] = None):
    """
    Closes any active file streams opened by yt-dlp that match the target path, prefix, or directory.
    This releases Windows file locks so files can be deleted without PermissionError.
    """
    norm_target_dir = os.path.normcase(os.path.abspath(target_dir)) if target_dir else ""
    norm_file_path = os.path.normcase(os.path.abspath(file_path)) if file_path else ""

    with _TRACKED_STREAMS_LOCK:
        matched_paths = []
        for p, streams in list(_TRACKED_OPEN_STREAMS.items()):
            should_close = False
            if norm_file_path and p == norm_file_path:
                should_close = True
            elif norm_target_dir and (p.startswith(norm_target_dir + os.sep) or os.path.dirname(p) == norm_target_dir):
                if not prefixes:
                    should_close = True
                else:
                    base_l = os.path.basename(p).lower()
                    if any(base_l.startswith(pref) for pref in prefixes):
                        should_close = True
            
            if should_close:
                matched_paths.append(p)
                for st in streams:
                    try:
                        if hasattr(st, "closed") and not st.closed:
                            try:
                                st.flush()
                            except Exception:
                                pass
                            st.close()
                    except Exception:
                        pass
        
        for p in matched_paths:
            _TRACKED_OPEN_STREAMS.pop(p, None)

def format_duration(seconds: Optional[float]) -> str:
    if not seconds:
        return "Unknown"
    seconds = int(seconds)
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"

def format_bytes(b: Optional[int]) -> str:
    if not b or b <= 0:
        return "Unknown"
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if b < 1024.0:
            return f"{b:.1f} {unit}"
        b /= 1024.0
    return f"{b:.1f} PB"

def sanitize_filename(name: str) -> str:
    name = re.sub(r'[\\/*?:"<>|]', "_", name)
    name = name.strip().strip(".")
    if not name:
        name = f"video_{int(time.time())}"
    return name

def cleanup_stream_artifacts(target_dir: str, title: str = "", filename: str = "", file_path: str = "", delete_all: bool = False):
    """
    Cleans up all intermediate files, fragments, .part, .ytdl, and partial audio/video stream files.
    If delete_all is True (e.g. download was canceled), also deletes any matching final/partial media file.
    """
    if not target_dir or not os.path.isdir(target_dir):
        return

    try:
        # First close any tracked open streams for this target directory/file path
        close_tracked_streams(target_dir=target_dir, file_path=file_path)

        # 1. Directly remove explicit file_path if requested
        if file_path and os.path.isfile(file_path) and delete_all:
            close_tracked_streams(target_dir=target_dir, file_path=file_path)
            for _ in range(15):
                try:
                    os.remove(file_path)
                    break
                except PermissionError:
                    close_tracked_streams(target_dir=target_dir, file_path=file_path)
                    gc.collect()
                    time.sleep(0.08)
                except Exception:
                    time.sleep(0.05)

        # 2. Build candidate prefix and word sets
        prefixes = set()
        word_tokens = set()
        individual_words = set()
        for item in [filename, title, os.path.basename(file_path) if file_path else ""]:
            if not item:
                continue
            clean = sanitize_filename(item).strip()
            # Strip trailing .f\d+ or extensions
            clean = re.sub(r'\.f\d+$', '', clean)
            base = os.path.splitext(clean)[0].strip()
            base = re.sub(r'\.f\d+$', '', base).strip()
            if len(base) >= 3:
                base_l = base.lower()
                prefixes.add(base_l)
                # Add trimmed versions (yt-dlp trim_file_name=80 or spaces)
                prefixes.add(base_l[:40].strip())
                prefixes.add(base_l[:25].strip())
                prefixes.add(base_l[:15].strip())

            # Extract words for fuzzy token matching
            words = [w for w in re.findall(r'[a-zA-Z0-9]+', base.lower()) if len(w) >= 3]
            for w in words:
                if len(w) >= 4:
                    individual_words.add(w)
            if len(words) >= 2:
                word_tokens.add(" ".join(words[:2]))
            if len(words) >= 3:
                word_tokens.add(" ".join(words[:3]))

        prefixes = {p for p in prefixes if len(p) >= 3}
        if not prefixes and not word_tokens:
            return

        # Close any tracked open streams that match these prefixes
        close_tracked_streams(target_dir=target_dir, file_path=file_path, prefixes=prefixes)

        for entry in os.listdir(target_dir):
            entry_lower = entry.lower()
            entry_path = os.path.join(target_dir, entry)
            if not os.path.isfile(entry_path):
                continue

            # Check prefix match
            matches_prefix = any(entry_lower.startswith(p) for p in prefixes)
            
            # Check normalized word match
            matches_words = False
            entry_norm = " ".join(re.findall(r'[a-zA-Z0-9]+', entry_lower))
            if word_tokens:
                matches_words = any(wt in entry_norm for wt in word_tokens)
            
            # Check individual high-confidence words for artifact files (e.g. .part or .f\d+)
            matches_indiv = False
            if not matches_prefix and not matches_words and individual_words and len(individual_words) >= 2:
                matched_cnt = sum(1 for iw in individual_words if iw in entry_norm)
                if matched_cnt >= 2:
                    matches_indiv = True

            if not matches_prefix and not matches_words and not matches_indiv:
                continue

            # Is it a fragment, temp, or stream artifact?
            is_artifact = (
                "-frag" in entry_lower or
                ".frag" in entry_lower or
                entry_lower.endswith(".ytdl") or
                entry_lower.endswith(".part") or
                ".temp." in entry_lower or
                "_temp" in entry_lower or
                bool(re.search(r'\.f\d+\.', entry_lower)) or
                bool(re.search(r'\.f\d+$', entry_lower))
            )

            # If delete_all is True (task was canceled/deleted), delete ALL matching files and artifacts!
            # If delete_all is False (task is paused, in-progress, or completed), PRESERVE .part and .ytdl cache for resume!
            should_delete = False
            if delete_all:
                should_delete = True
            elif is_artifact:
                # Only clean 0-byte orphan temp files if not canceling, NEVER wipe .part or .ytdl cache
                is_stale_empty = (".temp." in entry_lower or "_temp" in entry_lower) and os.path.getsize(entry_path) == 0
                if is_stale_empty:
                    should_delete = True

            if should_delete:
                close_tracked_streams(target_dir=target_dir, file_path=entry_path)
                for _ in range(15):
                    try:
                        os.remove(entry_path)
                        break
                    except PermissionError:
                        close_tracked_streams(target_dir=target_dir, file_path=entry_path)
                        gc.collect()
                        time.sleep(0.08)
                    except Exception:
                        time.sleep(0.05)
    except Exception as err:
        sys.stderr.write(f"[Cleanup Artifacts Error] {err}\n")

import glob
import shutil

def get_ffmpeg_location() -> Optional[str]:
    # 1. Check imageio-ffmpeg
    try:
        import imageio_ffmpeg
        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if exe and os.path.exists(exe):
            bin_dir = os.path.dirname(exe)
            alias = os.path.join(bin_dir, "ffmpeg.exe")
            if not os.path.exists(alias):
                try:
                    shutil.copyfile(exe, alias)
                except Exception:
                    pass
            if bin_dir not in os.environ.get("PATH", ""):
                os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")
            return bin_dir
    except Exception:
        pass

    # 2. Check if ffmpeg is in PATH
    p = shutil.which("ffmpeg")
    if p:
        return os.path.dirname(p)

    # 3. Check WinGet Gyan package directory
    localapp = os.environ.get("LOCALAPPDATA", "")
    if localapp:
        winget_path = os.path.join(localapp, "Microsoft", "WinGet", "Packages")
        matches = glob.glob(os.path.join(winget_path, "**", "ffmpeg.exe"), recursive=True)
        if matches:
            bin_dir = os.path.dirname(matches[0])
            if bin_dir not in os.environ.get("PATH", ""):
                os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")
            return bin_dir

    # 4. Check common Windows program paths
    common_paths = [
        r"C:\Program Files\ffmpeg\bin",
        r"C:\ffmpeg\bin",
        r"C:\Program Files (x86)\ffmpeg\bin",
    ]
    for cp in common_paths:
        if os.path.exists(os.path.join(cp, "ffmpeg.exe")):
            return cp
def get_ffmpeg_exe() -> Optional[str]:
    loc = get_ffmpeg_location()
    if loc:
        exe = os.path.join(loc, "ffmpeg.exe")
        if os.path.exists(exe):
            return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        pass
    return shutil.which("ffmpeg")

_CACHED_H264_ENCODER = None

def get_best_h264_encoder(ffmpeg_exe: str) -> str:
    global _CACHED_H264_ENCODER
    if _CACHED_H264_ENCODER:
        return _CACHED_H264_ENCODER
    
    creationflags = 0x08000000 if sys.platform == "win32" else 0
    candidates = ["h264_nvenc", "h264_qsv", "h264_mf", "libx264"]
    for enc in candidates:
        try:
            cmd = [ffmpeg_exe, "-f", "lavfi", "-i", "color=c=black:s=640x360:d=1", "-c:v", enc, "-f", "null", "-"]
            res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=creationflags)
            if res.returncode == 0:
                _CACHED_H264_ENCODER = enc
                return enc
        except Exception:
            continue
    _CACHED_H264_ENCODER = "libx264"
    return _CACHED_H264_ENCODER

def transcode_video_to_codec(target_file: str, ffmpeg_exe: str = None, codec: str = "h264") -> bool:
    """Encodes downloaded video into selected hardware codec (h264, h265, av1) with hardware acceleration when available."""
    if not target_file or not os.path.exists(target_file):
        return False
    if not ffmpeg_exe or not os.path.exists(ffmpeg_exe):
        ffmpeg_exe = get_ffmpeg_exe()
    if not ffmpeg_exe or not os.path.exists(ffmpeg_exe):
        return False

    creationflags = 0x08000000 if sys.platform == "win32" else 0
    parent_d = os.path.dirname(target_file)
    safe_tmp = os.path.join(parent_d, f"eggdl_enc_{uuid.uuid4().hex[:8]}.mp4")
    codec = (codec or "h264").lower().strip()

    try:
        if codec == "h265":
            # HEVC / H.265
            enc_args = ["-c:v", "libx265", "-preset", "fast", "-crf", "24"]
        elif codec == "av1":
            # AV1
            enc_args = ["-c:v", "libsvtav1", "-preset", "8", "-crf", "28"]
        else:
            # H.264 / AVC (Premiere Pro / NLE standard)
            best_enc = get_best_h264_encoder(ffmpeg_exe)
            if best_enc == "h264_nvenc":
                enc_args = ["-c:v", "h264_nvenc", "-preset", "p1", "-cq", "22"]
            elif best_enc == "h264_qsv":
                enc_args = ["-c:v", "h264_qsv", "-preset", "veryfast", "-global_quality", "22"]
            else:
                enc_args = ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "22", "-threads", "0"]

        convert_cmd = [
            ffmpeg_exe, "-y",
            "-i", target_file,
            "-pix_fmt", "yuv420p",
            *enc_args,
            "-c:a", "aac",
            "-b:a", "192k",
            safe_tmp
        ]
        c_res = subprocess.run(convert_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=creationflags)
        
        # Fallback to libx264 if any specialized encoder fails
        if (c_res.returncode != 0 or not os.path.exists(safe_tmp) or os.path.getsize(safe_tmp) <= 1024):
            fallback_cmd = [
                ffmpeg_exe, "-y",
                "-i", target_file,
                "-pix_fmt", "yuv420p",
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-crf", "22",
                "-threads", "0",
                "-c:a", "aac",
                "-b:a", "192k",
                safe_tmp
            ]
            c_res = subprocess.run(fallback_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=creationflags)

        if c_res.returncode == 0 and os.path.exists(safe_tmp) and os.path.getsize(safe_tmp) > 1024:
            os.replace(safe_tmp, target_file)
            return True
    except Exception as e:
        try:
            sys.stderr.write(f"[Video Encoder Warning] {e}\n")
        except Exception:
            pass
    finally:
        if safe_tmp and os.path.exists(safe_tmp):
            try:
                os.remove(safe_tmp)
            except Exception:
                pass
    return False

def ensure_premiere_compatibility(target_file: str, ffmpeg_exe: str = None) -> bool:
    return transcode_video_to_codec(target_file, ffmpeg_exe, codec="h264")



def _fallback_scrape_video_page(url: str) -> Dict[str, Any]:
    try:
        from curl_cffi import requests
        from bs4 import BeautifulSoup
        s = requests.Session(impersonate='chrome124')
        r = s.get(url, timeout=15)
        soup = BeautifulSoup(r.text, 'html.parser')

        raw_title = soup.find('title').text.strip() if soup.find('title') else 'Web Video'
        # Clean title suffix
        title = re.sub(r'\s*[-|–]\s*[A-Za-z0-9\s.]+$', '', raw_title).strip() or raw_title

        thumb = ''
        meta_og = soup.find('meta', property='og:image') or soup.find('meta', attrs={'name': 'twitter:image'})
        if meta_og and meta_og.get('content'):
            thumb = meta_og['content']

        video_options = []
        seen = set()

        for a in soup.find_all('a', href=True):
            href = a['href']
            if '/dload/' in href or href.lower().endswith('.mp4'):
                full_url = href if href.startswith('http') else urllib.parse.urljoin(url, href)
                if full_url in seen:
                    continue
                seen.add(full_url)
                text = a.get_text(strip=True)
                res_m = re.search(r'(\d{3,4}p)', text) or re.search(r'(\d{3,4}p)', href)
                res = res_m.group(1) if res_m else 'HD'
                size_hint = text.split(',')[-1].replace(')', '').strip() if ',' in text else 'Direct MP4'

                is_login_req = False
                if res in ("1080p", "1440p", "2160p") and "/dload/" in href:
                    is_login_req = True
                    size_hint += " (Free Account Req.)"

                video_options.append({
                    'format_id': full_url,
                    'label': text + (" (Requires Free Account)" if is_login_req else " (Instant Download)"),
                    'resolution': res,
                    'ext': 'mp4',
                    'filesize': None,
                    'filesize_str': size_hint,
                    'type': 'video',
                    'is_login_required': is_login_req
                })

        # Sort so instant free qualities appear at the top
        video_options.sort(key=lambda x: (x.get('is_login_required', False), -int(re.search(r'\d+', x['resolution']).group(0)) if re.search(r'\d+', x['resolution']) else 0))

        # Also check <video> and <source> tags
        for src in soup.find_all(['video', 'source'], src=True):
            s_url = src['src']
            if s_url.startswith('http') or s_url.startswith('/'):
                full_url = s_url if s_url.startswith('http') else urllib.parse.urljoin(url, s_url)
                if full_url not in seen and ('.mp4' in full_url or '.m3u8' in full_url):
                    seen.add(full_url)
                    video_options.append({
                        'format_id': full_url,
                        'label': 'Direct Video Stream',
                        'resolution': 'HD',
                        'ext': 'mp4',
                        'filesize': None,
                        'filesize_str': 'Direct Stream',
                        'type': 'video'
                    })

        if not video_options:
            raise Exception("No direct video links found on page")

        return {
            'id': 'scraped_video',
            'title': title,
            'duration': 0,
            'duration_str': 'Video',
            'uploader': 'Web Media',
            'extractor': 'DirectScraper',
            'thumbnail': thumb,
            'video_options': video_options,
            'audio_options': [],
            'original_url': url
        }
    except Exception as scrape_err:
        raise Exception(f"Failed to inspect media URL: {str(scrape_err)}")


class MediaExtractor:
    def __init__(self):
        pass

    @staticmethod
    def is_supported_url(url: str) -> bool:
        known_domains = [
            "youtube.com", "youtu.be", "instagram.com", "tiktok.com",
            "twitter.com", "x.com", "facebook.com", "fb.watch",
            "reddit.com", "vimeo.com", "twitch.tv", "soundcloud.com",
            "dailymotion.com", "pinterest.com", "pin.it", "bilibili.com",
            "threads.net", "vk.com", "streamable.com"
        ]
_INSPECT_CACHE = {}

def get_cookie_file() -> Optional[str]:
    cookie_env = os.environ.get("YOUTUBE_COOKIES")
    if cookie_env:
        cookie_path = os.path.join(os.path.dirname(__file__), "_runtime_cookies.txt")
        try:
            with open(cookie_path, "w", encoding="utf-8") as f:
                f.write(cookie_env)
            return cookie_path
        except Exception:
            pass

    for candidate in [
        os.path.join(os.path.dirname(__file__), "cookies.txt"),
        os.path.join(os.path.dirname(__file__), "..", "cookies.txt"),
        os.environ.get("YOUTUBE_COOKIES_FILE", "")
    ]:
        if candidate and os.path.exists(candidate):
            return candidate
    return None

def clean_stream_url(url: str) -> str:
    """Strips playlist, mix, and tracking parameters from YouTube URLs for clean video processing."""
    if not url:
        return url
    if "youtube.com/watch" in url:
        parsed = urllib.parse.urlparse(url)
        qs = urllib.parse.parse_qs(parsed.query)
        if "v" in qs and qs["v"]:
            return f"https://www.youtube.com/watch?v={qs['v'][0]}"
    elif "youtu.be/" in url:
        parsed = urllib.parse.urlparse(url)
        vid = parsed.path.strip("/")
        if vid:
            return f"https://www.youtube.com/watch?v={vid}"
    return url

def get_url_candidates(url: str) -> List[str]:
    """Generates clean URL candidates and repairs optical/casing errors in video IDs."""
    if not url:
        return []
    cleaned = clean_stream_url(url)
    candidates = [cleaned]
    
    parsed = urllib.parse.urlparse(cleaned)
    qs = urllib.parse.parse_qs(parsed.query)
    vid = qs.get("v", [""])[0]
    if not vid and "youtu.be/" in cleaned:
        vid = parsed.path.strip("/")
        
    if vid and len(vid) == 11:
        # Check single substitutions for O <-> 0 and l <-> 1
        for idx, ch in enumerate(vid):
            if ch == "O":
                c_vid = vid[:idx] + "0" + vid[idx+1:]
                candidates.append(f"https://www.youtube.com/watch?v={c_vid}")
            elif ch == "0":
                c_vid = vid[:idx] + "O" + vid[idx+1:]
                candidates.append(f"https://www.youtube.com/watch?v={c_vid}")
            elif ch == "l":
                c_vid = vid[:idx] + "1" + vid[idx+1:]
                candidates.append(f"https://www.youtube.com/watch?v={c_vid}")
            elif ch == "1":
                c_vid = vid[:idx] + "l" + vid[idx+1:]
                candidates.append(f"https://www.youtube.com/watch?v={c_vid}")
    return candidates

class MediaExtractor:
    @staticmethod
    def is_supported_url(url: str) -> bool:
        if not url:
            return False
        known_domains = [
            "youtube.com", "youtu.be", "tiktok.com", "instagram.com",
            "twitter.com", "x.com", "facebook.com", "fb.watch",
            "reddit.com", "vimeo.com", "twitch.tv", "soundcloud.com",
            "dailymotion.com", "pinterest.com", "pin.it", "bilibili.com",
            "threads.net", "vk.com", "streamable.com"
        ]
        return any(domain in url.lower() for domain in known_domains)

    @staticmethod
    def inspect_url(url: str) -> Dict[str, Any]:
        global _INSPECT_CACHE
        now = time.time()
        # Clean expired cache
        if len(_INSPECT_CACHE) > 100:
            _INSPECT_CACHE = {k: v for k, v in _INSPECT_CACHE.items() if now - v["time"] < 3600}

        if url in _INSPECT_CACHE and (now - _INSPECT_CACHE[url]["time"]) < 3600:
            return _INSPECT_CACHE[url]["data"]

        if not yt_dlp:
            raise Exception("yt-dlp is not installed")

        ffmpeg_dir = get_ffmpeg_location()
        cookie_path = get_cookie_file()

        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "extract_flat": False,
            "noplaylist": True,
            "socket_timeout": 15,
            "no_color": True,
            "cachedir": False,
            "http_headers": {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
            }
        }
        if ffmpeg_dir:
            ydl_opts["ffmpeg_location"] = ffmpeg_dir
        if cookie_path:
            ydl_opts["cookiefile"] = cookie_path

        info = None
        last_error = None
        
        for cand_url in get_url_candidates(url):
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(cand_url, download=False)
                    if info:
                        break
            except Exception as e1:
                last_error = e1
                try:
                    fallback_opts = {
                        "quiet": True,
                        "skip_download": True,
                        "noplaylist": True,
                        "socket_timeout": 15,
                    }
                    if cookie_path:
                        fallback_opts["cookiefile"] = cookie_path
                    with yt_dlp.YoutubeDL(fallback_opts) as ydl:
                        info = ydl.extract_info(cand_url, download=False)
                        if info:
                            break
                except Exception as e2:
                    last_error = e2

        if not info:
            try:
                res = _fallback_scrape_video_page(url)
                _INSPECT_CACHE[url] = {"data": res, "time": now}
                return res
            except Exception:
                err_str = str(last_error) if last_error else ""
                if "unavailable" in err_str.lower():
                    raise Exception("This video is unavailable, deleted, or private on YouTube.")
                if "Sign in to confirm you" in err_str or "bot" in err_str.lower():
                    raise Exception("YouTube is requesting sign-in verification for this video.")
                if "private" in err_str.lower():
                    raise Exception("This video is private or restricted.")
                raise Exception(f"Video extraction failed: {err_str or 'Unknown error'}")

        title = info.get("title", "Untitled Video")
        thumbnail = info.get("thumbnail") or (info.get("thumbnails", [{}])[-1].get("url") if info.get("thumbnails") else "")
        duration = info.get("duration")
        uploader = info.get("uploader") or info.get("channel") or info.get("extractor_key", "Web")
        extractor = info.get("extractor", "Generic")

        formats = info.get("formats", [])
        video_options = []
        audio_options = []

        # Find best audio size
        best_audio_size = 0
        for f in formats:
            if f.get("vcodec") == "none" and f.get("acodec") != "none":
                a_size = f.get("filesize") or f.get("filesize_approx")
                if not a_size and duration and (f.get("abr") or f.get("tbr")):
                    a_size = int(duration * ((f.get("abr") or f.get("tbr")) * 1024 / 8))
                if a_size and a_size > best_audio_size:
                    best_audio_size = a_size
        if not best_audio_size and duration:
            best_audio_size = int(duration * 16 * 1024) # ~128kbps audio

        # Add "Best Quality" default preset (True highest available resolution up to 4K / 8K)
        video_options.append({
            "format_id": "bestvideo+bestaudio/best",
            "label": "Best Video Quality (Auto - Ultra HD)",
            "resolution": "Best",
            "codec": "MP4 / AAC",
            "ext": "mp4",
            "filesize": None,
            "filesize_str": "Auto (Highest Available)",
            "type": "video"
        })

        def bucket_resolution(w, h):
            eff = min(w, h) if (w and h) else (h or 0)
            if eff >= 3800:
                return 4320, '8K', '8K Ultra HD'
            elif eff >= 2000:
                return 2160, '4K', '4K Ultra HD'
            elif eff >= 1350:
                return 1440, '1440p', '1440p (2K QHD)'
            elif eff >= 950:
                return 1080, '1080p', '1080p (Full HD)'
            elif eff >= 650:
                return 720, '720p', '720p (HD)'
            elif eff >= 440:
                return 480, '480p', '480p (SD)'
            elif eff >= 320:
                return 360, '360p', '360p'
            elif eff >= 200:
                return 240, '240p', '240p'
            elif eff >= 100:
                return 144, '144p', '144p'
            return None

        # Group formats into resolution buckets
        buckets = {}
        for f in formats:
            vcodec = f.get("vcodec", "none")
            if vcodec == "none":
                continue
            w = f.get("width")
            h = f.get("height")
            b = bucket_resolution(w, h)
            if not b:
                continue
            tier_h = b[0]
            if tier_h not in buckets:
                buckets[tier_h] = []
            buckets[tier_h].append((b, f))

        sorted_tiers = sorted(buckets.keys(), reverse=True)
        for tier_h in sorted_tiers:
            items = buckets[tier_h]
            best_b, best_fmt = max(items, key=lambda x: (x[1].get('vbr') or x[1].get('tbr') or 0, x[1].get('filesize') or 0))
            
            clean_res = best_b[1]
            base_label = best_b[2]
            fps = best_fmt.get("fps")
            fps_str = f" {int(fps)}fps" if (fps and fps >= 50) else ""
            label = f"{base_label}{fps_str}"
            ext = "mp4"

            v_size = best_fmt.get("filesize") or best_fmt.get("filesize_approx")
            if not v_size and duration:
                actual_vbr = best_fmt.get("vbr") or best_fmt.get("tbr")
                if not actual_vbr:
                    actual_vbr = {4320: 35000, 2160: 18000, 1440: 7000, 1080: 2500, 720: 1400, 480: 700, 360: 400, 240: 220}.get(tier_h, 180)
                v_size = int(duration * (actual_vbr * 1024 / 8))

            comb_size = (v_size + best_audio_size) if v_size else None
            fid = best_fmt.get("format_id")

            format_spec = (
                f"bestvideo[format_id={fid}]+bestaudio/"
                f"bestvideo[height<={tier_h}]+bestaudio/"
                f"bestvideo+bestaudio/best"
            )
            video_options.append({
                "format_id": format_spec,
                "label": label,
                "resolution": clean_res,
                "codec": "MP4 / AAC",
                "ext": ext,
                "filesize": comb_size,
                "filesize_str": format_bytes(comb_size) if comb_size else "High Quality",
                "type": "video"
            })

        # Add Audio Options
        audio_size_320 = int(duration * 40 * 1024) if duration else None # 320kbps
        audio_size_128 = best_audio_size or (int(duration * 16 * 1024) if duration else None)

        audio_options.append({
            "format_id": "bestaudio/best",
            "label": "Audio Only - MP3 (Studio Quality 320kbps)",
            "resolution": "Audio",
            "ext": "mp3",
            "filesize": audio_size_320,
            "filesize_str": format_bytes(audio_size_320) if audio_size_320 else "High Quality",
            "type": "audio",
            "audio_only": True
        })
        audio_options.append({
            "format_id": "bestaudio/best",
            "label": "Audio Only - M4A / AAC (Original Quality)",
            "resolution": "Audio",
            "ext": "m4a",
            "filesize": audio_size_128,
            "filesize_str": format_bytes(audio_size_128) if audio_size_128 else "Original Audio",
            "type": "audio",
            "audio_only": True
        })

        result = {
            "title": title,
            "thumbnail": thumbnail,
            "duration": duration,
            "duration_str": format_duration(duration),
            "uploader": uploader,
            "extractor": extractor,
            "url": url,
            "video_options": video_options,
            "audio_options": audio_options,
            "is_stream": True
        }
        _INSPECT_CACHE[url] = {"data": result, "time": time.time()}
        return result


class StreamDownloadTask:
    def __init__(
        self,
        task_id: str,
        url: str,
        target_dir: str,
        format_id: str = "bestvideo+bestaudio/best",
        is_audio_only: bool = False,
        audio_format: str = "mp3",
        custom_title: Optional[str] = None,
        custom_filename: Optional[str] = None,
        expected_size: int = -1,
        downloaded_bytes: int = 0,
        progress: float = 0.0,
        video_encoder_enabled: bool = False,
        video_codec: str = "h264",
        on_progress: Optional[Callable] = None
    ):
        self.id = task_id
        self.url = url
        self.target_dir = target_dir
        self.format_id = format_id
        self.is_audio_only = is_audio_only
        self.audio_format = audio_format
        self.custom_title = custom_title
        self.custom_filename = custom_filename
        self.video_encoder_enabled = video_encoder_enabled
        self.video_codec = video_codec or "h264"
        self.on_progress = on_progress

        self.title = custom_title or custom_filename or "Media Download"
        self.filename = custom_filename or ""
        self.file_path = os.path.join(target_dir, custom_filename) if custom_filename else ""
        self.expected_size = int(expected_size) if (expected_size and int(expected_size) > 0) else -1
        self.file_size = self.expected_size
        self.downloaded_bytes = int(downloaded_bytes or 0)
        self.progress = float(progress or 0.0)
        self.speed = 0.0
        self.eta = 0
        self.status = "queued"
        self.category = "audio" if is_audio_only else "video"
        self.thumbnail = ""
        self.segments = []
        self.error_message = None
        self.created_at = time.time()
        self._is_paused = False
        self._is_canceled = False
        self._loop = None
        self._max_progress = float(progress or 0.0)
        self._max_downloaded_bytes = int(downloaded_bytes or 0)
        self._initial_downloaded_bytes = int(downloaded_bytes or 0)
        self._stream_history = {}
        self._stream_totals = {}

    def pause(self):
        self._is_paused = True
        self.status = "paused"
        self.speed = 0.0

    def cancel(self):
        self._is_canceled = True
        self.status = "canceled"
        self.speed = 0.0
        self.eta = 0
        close_tracked_streams(target_dir=self.target_dir, file_path=self.file_path)
        self._cleanup_files()

    def _cleanup_files(self):
        close_tracked_streams(target_dir=self.target_dir, file_path=self.file_path)
        cleanup_stream_artifacts(
            target_dir=self.target_dir,
            title=self.title,
            filename=self.filename or self.custom_filename,
            file_path=self.file_path,
            delete_all=self._is_canceled
        )

    def _postprocessor_hook(self, d: Dict[str, Any]):
        if self._is_canceled:
            close_tracked_streams(target_dir=self.target_dir, file_path=self.file_path)
            self._cleanup_files()
            raise KeyboardInterrupt("Download canceled by user")
        status = d.get("status")
        if status in ("started", "processing"):
            self.status = "processing"
            self.progress = 99.0
            self.speed = 0.0
            self.eta = 0
            self._report_progress()

    def _progress_hook(self, d: Dict[str, Any]):
        if self._is_canceled:
            close_tracked_streams(target_dir=self.target_dir, file_path=self.file_path)
            self._cleanup_files()
            raise KeyboardInterrupt("Download canceled by user")
        if self._is_paused:
            raise Exception("Download paused by user")

        status = d.get("status")
        if status == "downloading":
            self.status = "downloading"
            curr_fname = d.get("filename", "stream")
            curr_dl = d.get("downloaded_bytes", 0) or 0
            if curr_dl > 0:
                self._stream_history[curr_fname] = max(self._stream_history.get(curr_fname, 0), curr_dl)

            # Total downloaded across all streams (video + audio)
            raw_total_dl = sum(self._stream_history.values())
            if raw_total_dl > self._max_downloaded_bytes:
                self._max_downloaded_bytes = raw_total_dl

            # downloaded_bytes strictly advances and never drops below previously downloaded/saved bytes
            self.downloaded_bytes = max(self._max_downloaded_bytes, raw_total_dl, self._initial_downloaded_bytes)

            # Keep expected_size consistent and rock-solid without fluctuating every second
            if self.expected_size > 0:
                self.file_size = self.expected_size
            else:
                stream_total = d.get("total_bytes") or 0
                if stream_total > 50000:
                    self._stream_totals[curr_fname] = stream_total

                tot_streams = sum(self._stream_totals.values())
                if tot_streams > 50000:
                    self.file_size = tot_streams
                elif self.file_size <= 0:
                    stream_est = d.get("total_bytes_estimate") or 0
                    if stream_est > 50000:
                        self.file_size = stream_est
                    else:
                        frag_cnt = d.get("fragment_count")
                        frag_idx = d.get("fragment_index")
                        if frag_cnt and frag_idx and frag_idx > 0 and curr_dl > 0:
                            est = int((curr_dl / frag_idx) * frag_cnt)
                            if est > 50000:
                                self.file_size = est

            # Calculate true total progress across all streams
            calculated_prog = 0.0
            if self.file_size > 0 and self.downloaded_bytes > 0:
                calculated_prog = (self.downloaded_bytes / self.file_size) * 100.0
            elif self.file_size <= 0:
                frag_cnt = d.get("fragment_count")
                frag_idx = d.get("fragment_index")
                if frag_cnt and frag_idx and frag_idx > 0:
                    calculated_prog = (frag_idx / frag_cnt) * 100.0

            # Cap progress while still actively downloading to max 99.0%
            calculated_prog = max(0.0, min(99.0, calculated_prog))

            # Progress strictly grows with downloaded bytes, never prematurely jumping to 99%
            if calculated_prog > self._max_progress:
                self._max_progress = calculated_prog

            self.progress = round(self._max_progress, 1)

            self.speed = float(d.get("speed") or 0.0)
            self.eta = int(d.get("eta") or 0)
            if self.eta <= 0 and self.speed > 0 and self.file_size > self.downloaded_bytes:
                self.eta = int((self.file_size - self.downloaded_bytes) / self.speed)
            
            if curr_fname and os.path.exists(curr_fname):
                self.filename = os.path.basename(curr_fname)
                self.file_path = os.path.abspath(curr_fname)

            self._report_progress()

        elif status == "finished":
            curr_fname = d.get("filename")
            if curr_fname:
                if os.path.exists(curr_fname):
                    self.filename = os.path.basename(curr_fname)
                    self.file_path = os.path.abspath(curr_fname)
                    try:
                        f_size = os.path.getsize(curr_fname)
                        if f_size > 0:
                            self._stream_totals[curr_fname] = f_size
                            self._stream_history[curr_fname] = f_size
                            self.downloaded_bytes = sum(self._stream_history.values())
                            if self.expected_size <= 0 and self.file_size <= 0:
                                tot_streams = sum(self._stream_totals.values())
                                if tot_streams > 50000:
                                    self.file_size = tot_streams
                    except Exception:
                        pass
                else:
                    curr_dl = d.get("downloaded_bytes") or d.get("total_bytes") or 0
                    if curr_dl > 0:
                        self._stream_history[curr_fname] = curr_dl
                        self.downloaded_bytes = sum(self._stream_history.values())

            if self.file_size > 0 and self.downloaded_bytes > 0:
                prog = (self.downloaded_bytes / self.file_size) * 100.0
                self._max_progress = max(self._max_progress, min(99.0, prog))
                self.progress = round(self._max_progress, 1)
            self._report_progress()

    def _report_progress(self):
        if self.on_progress and self._loop and self._loop.is_running():
            data = self.to_dict()
            try:
                asyncio.run_coroutine_threadsafe(self.on_progress(data), self._loop)
            except Exception:
                pass

    def run_sync(self):
        if self._is_canceled:
            self.status = "canceled"
            self.speed = 0.0
            self.eta = 0
            self._cleanup_files()
            return

        os.makedirs(self.target_dir, exist_ok=True)
        custom_name = self.custom_filename or self.custom_title
        clean_base = sanitize_filename(os.path.splitext(custom_name)[0]).strip() if custom_name else ""
        if clean_base:
            outtmpl = os.path.join(self.target_dir, f"{clean_base}.%(ext)s")
        else:
            outtmpl = os.path.join(self.target_dir, "%(title).80s.%(ext)s")

        ffmpeg_dir = get_ffmpeg_location()
        cookie_path = get_cookie_file()

        ydl_opts = {
            "outtmpl": outtmpl,
            "trim_file_name": 80,
            "windowsfilenames": True,
            "restrictfilenames": False,
            "progress_hooks": [self._progress_hook],
            "postprocessor_hooks": [self._postprocessor_hook],
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "merge_output_format": "mp4",
            "overwrites": False,
            "continuedl": True,
            "nocheckcertificate": True,
            "retries": 10,
            "fragment_retries": 10,
            "buffersize": 1024 * 1024,
            "http_chunk_size": 10485760,
            "socket_timeout": 30,
            "cachedir": False,
            "format_sort": ["res", "fps", "vcodec:h264", "acodec:m4a", "ext:mp4:m4a"],
            "http_headers": {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
            }
        }

        if ffmpeg_dir:
            ydl_opts["ffmpeg_location"] = ffmpeg_dir
        if cookie_path:
            ydl_opts["cookiefile"] = cookie_path

        if self.is_audio_only:
            ydl_opts["format"] = "bestaudio/best"
            if ffmpeg_dir:
                ydl_opts["postprocessors"] = [{
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": self.audio_format,
                    "preferredquality": "320",
                }]
        else:
            if self.format_id and self.format_id not in ["best", "bestvideo", "auto"]:
                ydl_opts["format"] = self.format_id
            else:
                ydl_opts["format"] = "bestvideo+bestaudio/best"
            ydl_opts["merge_output_format"] = "mp4"

        # Ensure resume state is retained on startup
        if self.downloaded_bytes > 0 and not self._stream_history:
            self._stream_history["stream"] = self.downloaded_bytes

        # Emit initial downloading event immediately
        self.status = "downloading"
        self._report_progress()

        clean_url = clean_stream_url(self.url)

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # Pre-extract exact metadata and stable file size before downloading
                try:
                    meta = ydl.extract_info(clean_url, download=False)
                    if meta:
                        self.title = meta.get("title", self.title)
                        self.thumbnail = meta.get("thumbnail") or self.thumbnail
                        total_sz = 0
                        req_formats = meta.get("requested_formats") or []
                        if req_formats:
                            for rf in req_formats:
                                fsz = rf.get("filesize") or rf.get("filesize_approx") or 0
                                total_sz += fsz
                        if not total_sz:
                            total_sz = meta.get("filesize") or meta.get("filesize_approx") or 0
                        
                        if total_sz > 50000:
                            self.file_size = total_sz
                        elif self.file_size <= 0 and meta.get("duration"):
                            dur = meta.get("duration", 0)
                            self.file_size = int(dur * (4500 * 1024 / 8)) + int(dur * 16 * 1024)
                        
                        self._report_progress()
                except Exception:
                    pass

                info = None
                dl_last_err = None
                for cand_u in get_url_candidates(self.url):
                    try:
                        info = ydl.extract_info(cand_u, download=True)
                        if info:
                            break
                    except Exception as cand_err:
                        dl_last_err = cand_err
                        if "Requested format is not available" in str(cand_err):
                            ydl_opts["format"] = "bestvideo+bestaudio/best"
                            try:
                                with yt_dlp.YoutubeDL(ydl_opts) as fallback_ydl:
                                    info = fallback_ydl.extract_info(cand_u, download=True)
                                    if info:
                                        break
                            except Exception:
                                pass

                if not info and (self.custom_title or self.title):
                    try:
                        search_query = self.custom_title or self.title
                        with yt_dlp.YoutubeDL(ydl_opts) as fallback_ydl:
                            search_res = fallback_ydl.extract_info(f"ytsearch1:{search_query}", download=True)
                            if search_res and search_res.get("entries"):
                                info = search_res["entries"][0]
                            else:
                                info = search_res
                    except Exception:
                        pass

                if not info and dl_last_err:
                    raise dl_last_err
                if info:
                    if not self.custom_title and not self.custom_filename:
                        self.title = info.get("title", self.title)
                    else:
                        self.title = self.custom_title or self.custom_filename
                    self.thumbnail = info.get("thumbnail") or ""
                    
                    # Resolve true final filename on disk
                    final_path = None
                    if info.get('requested_downloads'):
                        for rd in info['requested_downloads']:
                            p = rd.get('filepath') or rd.get('_filename')
                            if p and os.path.exists(p):
                                final_path = p
                                break
                    
                    if not final_path or not os.path.exists(final_path):
                        base_prep = ydl.prepare_filename(info)
                        for ext in (["mp3", "m4a"] if self.is_audio_only else ["mp4", "mkv", "webm"]):
                            cand = os.path.splitext(base_prep)[0] + f".{ext}"
                            if os.path.exists(cand):
                                final_path = cand
                                break
                        if not final_path and os.path.exists(base_prep):
                            final_path = base_prep

                    if final_path and os.path.exists(final_path):
                        # Video Encoder Transcoding (Only when specifically toggled ON by user in Advanced Settings)
                        if self.video_encoder_enabled and not self.is_audio_only and final_path.lower().endswith(".mp4"):
                            ffmpeg_bin = get_ffmpeg_exe()
                            if ffmpeg_bin and os.path.exists(ffmpeg_bin):
                                transcode_video_to_codec(final_path, ffmpeg_bin, codec=self.video_codec)

                        # Guarantee exact custom filename on disk
                        if custom_name and clean_base:
                            final_ext = os.path.splitext(final_path)[1]
                            if self.custom_filename and os.path.splitext(self.custom_filename)[1]:
                                target_fname = sanitize_filename(self.custom_filename)
                            else:
                                target_fname = f"{clean_base}{final_ext}"
                            
                            target_custom_path = os.path.join(self.target_dir, target_fname)
                            if os.path.abspath(final_path) != os.path.abspath(target_custom_path):
                                try:
                                    if os.path.exists(target_custom_path):
                                        os.remove(target_custom_path)
                                    os.rename(final_path, target_custom_path)
                                    final_path = target_custom_path
                                except Exception as ren_err:
                                    sys.stderr.write(f"[Rename Custom File Error] {ren_err}\n")

                        if os.path.exists(final_path):
                            self.file_path = os.path.abspath(final_path)
                            self.filename = os.path.basename(final_path)
                            self.file_size = os.path.getsize(final_path)
                            self.downloaded_bytes = self.file_size

                        # Automatically clean up any leftover fragmented temp stream files and 0-byte orphan duplicates
                        try:
                            parent_d = os.path.dirname(final_path)
                            base_n = os.path.splitext(os.path.basename(final_path))[0]
                            for sibling in os.listdir(parent_d):
                                if sibling != os.path.basename(final_path):
                                    sib_path = os.path.join(parent_d, sibling)
                                    is_temp_tag = any(tag in sibling for tag in [".f", ".temp.", ".part", ".ytdl", "_premiere_h264", "_temp"])
                                    is_empty_duplicate = (sibling.startswith(base_n[:10]) or base_n.startswith(sibling[:10])) and os.path.isfile(sib_path) and os.path.getsize(sib_path) == 0
                                    if is_temp_tag or is_empty_duplicate:
                                        try:
                                            os.remove(sib_path)
                                        except Exception:
                                            pass
                        except Exception:
                            pass

            if self._is_canceled:
                self.status = "canceled"
                self.speed = 0.0
                self.eta = 0
                self._cleanup_files()
                self._report_progress()
                return

            self.status = "completed"
            self.progress = 100.0
            self.speed = 0.0
            self.eta = 0
            self._report_progress()
        except (Exception, KeyboardInterrupt) as e:
            if self._is_paused or "paused by user" in str(e):
                self.status = "paused"
                self.speed = 0.0
                self._report_progress()
                return
            if self._is_canceled or "canceled by user" in str(e) or isinstance(e, KeyboardInterrupt):
                self.status = "canceled"
                self.speed = 0.0
                self.eta = 0
                close_tracked_streams(target_dir=self.target_dir, file_path=self.file_path)
                self._cleanup_files()
                self._report_progress()
                return

            # Automatic Fallback for protected/blocked video sites
            try:
                scraped = _fallback_scrape_video_page(self.url)
                if scraped.get("video_options"):
                    # Find matching or best format
                    best_opt = scraped["video_options"][0]
                    for opt in scraped["video_options"]:
                        if self.format_id and (self.format_id in opt["format_id"] or self.format_id == opt["resolution"]):
                            best_opt = opt
                            break

                    direct_url = best_opt["format_id"]
                    self.title = scraped.get("title", self.title)
                    self.thumbnail = scraped.get("thumbnail", self.thumbnail)

                    from curl_cffi import requests as c_requests
                    s = c_requests.Session(impersonate='chrome124')
                    headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                        'Referer': self.url,
                    }

                    fname = sanitize_filename(self.custom_title or self.title)[:60] + ".mp4"
                    target_file = os.path.join(self.target_dir, fname)

                    r = s.get(direct_url, headers=headers, stream=True, timeout=30)
                    if r.status_code == 200:
                        cl = r.headers.get('content-length')
                        if cl and cl.isdigit():
                            self.file_size = int(cl)

                        dl = 0
                        with open(target_file, "wb") as f:
                            for chunk in r.iter_content(chunk_size=128 * 1024):
                                if self._is_paused or self._is_canceled:
                                    break
                                if chunk:
                                    f.write(chunk)
                                    dl += len(chunk)
                                    self.downloaded_bytes = dl
                                    if self.file_size > 0:
                                        self.progress = round(min(99.0, (dl / self.file_size) * 100.0), 1)
                                        if self.file_size > 0 and self.speed > 0:
                                            self.eta = int((self.file_size - dl) / self.speed)
                                    self._report_progress()

                        self.file_path = os.path.abspath(target_file)
                        self.filename = os.path.basename(target_file)
                        self.file_size = os.path.getsize(target_file)
                        self.downloaded_bytes = self.file_size
                        if self._is_canceled:
                            self.status = "canceled"
                            self.speed = 0.0
                            self.eta = 0
                            self._cleanup_files()
                            self._report_progress()
                            return

                        self.status = "completed"
                        self.progress = 100.0
                        self.speed = 0.0
                        self.eta = 0
                        self._report_progress()
                        return
            except Exception:
                pass

            if self._is_canceled:
                self.status = "canceled"
                self.speed = 0.0
                self.eta = 0
                self._cleanup_files()
                self._report_progress()
                return

            self.status = "error"
            self.error_message = str(e)
            self._report_progress()
            raise e

    async def start(self):
        if self._is_canceled:
            self.status = "canceled"
            self.speed = 0.0
            self.eta = 0
            self._cleanup_files()
            return
        self._loop = asyncio.get_running_loop()
        await self._loop.run_in_executor(None, self.run_sync)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "url": self.url,
            "title": self.title,
            "filename": self.filename or f"{self.title}.{self.audio_format if self.is_audio_only else 'mp4'}",
            "file_path": self.file_path,
            "file_size": self.file_size,
            "expected_size": self.expected_size,
            "downloaded_bytes": self.downloaded_bytes,
            "progress": round(self.progress, 1),
            "speed": round(self.speed, 1),
            "eta": self.eta,
            "status": self.status,
            "category": self.category,
            "thumbnail": self.thumbnail,
            "download_type": "stream",
            "format_id": self.format_id,
            "video_encoder_enabled": self.video_encoder_enabled,
            "video_codec": self.video_codec,
            "segments": self.segments,
            "created_at": getattr(self, "created_at", time.time()),
            "error_message": self.error_message
        }
