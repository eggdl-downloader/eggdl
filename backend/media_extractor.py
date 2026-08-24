import os
import sys
import time
import asyncio
import subprocess
import re
import urllib.parse
from typing import Dict, List, Optional, Callable, Any
from pathlib import Path

# Check if yt_dlp is installed, or import gracefully
try:
    import yt_dlp
    import yt_dlp.postprocessor.ffmpeg as yt_ffmpeg
    yt_ffmpeg.os.rename = os.replace
    import yt_dlp.postprocessor.common as yt_common
    if hasattr(yt_common, 'os'):
        yt_common.os.rename = os.replace
except Exception:
    yt_dlp = None

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
    return None

# Ensure FFmpeg is on PATH if found
get_ffmpeg_location()

_CACHED_H264_ENCODER = None

def get_best_hardware_h264_encoder(ffmpeg_bin: str):
    """
    Auto-detects the fastest hardware GPU encoder available (NVENC / QSV / AMF / MediaFoundation)
    with ultra-fast multithreaded CPU fallback.
    """
    global _CACHED_H264_ENCODER
    if _CACHED_H264_ENCODER:
        return _CACHED_H264_ENCODER

    cflags = 0x08000000 if sys.platform == "win32" else 0
    candidate_configs = [
        ("h264_nvenc", ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", "19"]),
        ("h264_qsv", ["-c:v", "h264_qsv", "-preset", "veryfast", "-global_quality", "20"]),
        ("h264_amf", ["-c:v", "h264_amf", "-quality", "speed", "-rc", "cqp", "-qp_p", "20", "-qp_i", "20"]),
        ("h264_mf", ["-c:v", "h264_mf", "-b:v", "28M"]),
        ("libx264", ["-c:v", "libx264", "-preset", "ultrafast", "-threads", "0", "-crf", "20"]),
    ]

    for enc_name, enc_args in candidate_configs:
        try:
            cmd = [
                ffmpeg_bin, "-y",
                "-f", "lavfi", "-i", "color=c=black:s=256x256:d=0.05",
                *enc_args,
                "-pix_fmt", "yuv420p",
                "-f", "null", "-"
            ]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=cflags, timeout=4)
            if res.returncode == 0:
                print(f"[FFmpeg] Selected Hardware GPU Encoder: {enc_name}")
                _CACHED_H264_ENCODER = (enc_name, enc_args)
                return _CACHED_H264_ENCODER
        except Exception:
            continue

    _CACHED_H264_ENCODER = ("libx264", ["-c:v", "libx264", "-preset", "ultrafast", "-threads", "0", "-crf", "20"])
    return _CACHED_H264_ENCODER

def ensure_premiere_compatible_mp4(file_path: str, progress_callback: Optional[Any] = None) -> str:
    """
    Ensures downloaded video is 100% compatible with Adobe Premiere Pro, DaVinci Resolve,
    Final Cut Pro, Sony Vegas, and all editing suites.
    Premiere Pro standard requirements:
      - Video Codec: H.264 / AVC (avc1)
      - Audio Codec: AAC (mp4a)
      - Pixel Format: yuv420p (8-bit standard)
      - Container: MP4 (with +faststart moov atom header)
    """
    if not file_path or not os.path.exists(file_path):
        return file_path

    ffmpeg_dir = get_ffmpeg_location()
    ffmpeg_bin = shutil.which("ffmpeg") or (os.path.join(ffmpeg_dir, "ffmpeg.exe") if ffmpeg_dir else None)
    if not ffmpeg_bin or not os.path.exists(ffmpeg_bin):
        return file_path

    cflags = 0x08000000 if sys.platform == "win32" else 0
    try:
        probe = subprocess.run(
            [ffmpeg_bin, "-i", file_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=20,
            creationflags=cflags
        )
        output = probe.stderr or probe.stdout or ""
        
        is_h264 = ("Video: h264" in output or "Video: avc" in output)
        is_aac = ("Audio: aac" in output)
        is_mp4 = file_path.lower().endswith(".mp4")
        is_yuv420p = ("yuv420p" in output)

        if is_h264 and is_aac and is_mp4 and is_yuv420p:
            # Already 100% Premiere Pro ready!
            return file_path

        # Parse total duration in seconds for accurate progress calculation
        total_duration = 0.0
        dur_match = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", output)
        if dur_match:
            try:
                dh, dm, ds = map(float, dur_match.groups())
                total_duration = dh * 3600 + dm * 60 + ds
            except Exception:
                total_duration = 0.0

        # Need remux / transcode to Premiere Pro standard
        base, _ = os.path.splitext(file_path)
        temp_out = f"{base}_premiere_h264.mp4"
        final_out = f"{base}.mp4"

        # If already H.264 with yuv420p, stream copy video (instant 0s), otherwise use GPU hardware encoder
        if is_h264 and is_yuv420p:
            vcodec_args = ["-c:v", "copy"]
        else:
            _, enc_args = get_best_hardware_h264_encoder(ffmpeg_bin)
            vcodec_args = [*enc_args, "-pix_fmt", "yuv420p"]

        # If already AAC audio, stream copy audio (instant 0s), otherwise transcode audio to AAC 320k
        acodec_args = ["-c:a", "copy"] if is_aac else ["-c:a", "aac", "-b:a", "320k"]

        cmd = [
            ffmpeg_bin, "-y",
            "-i", file_path,
            *vcodec_args,
            *acodec_args,
            "-movflags", "+faststart",
            temp_out
        ]

        if progress_callback:
            progress_callback(speed_str=None, progress=99.0)

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            creationflags=cflags
        )

        # Monitor conversion progress in real-time
        if proc.stderr:
            for line in proc.stderr:
                if total_duration > 0 and "time=" in line:
                    t_match = re.search(r"time=(\d+):(\d+):(\d+\.\d+)", line)
                    if t_match:
                        try:
                            th, tm, ts = map(float, t_match.groups())
                            cur_time = th * 3600 + tm * 60 + ts
                            pct = min(99.0, max(1.0, (cur_time / total_duration) * 100.0))
                            report_pct = round(99.0 + (pct / 100.0) * 0.8, 1)
                            if progress_callback:
                                progress_callback(speed_str=None, progress=report_pct)
                        except Exception:
                            pass

        proc.wait(timeout=300)

        if proc.returncode == 0 and os.path.exists(temp_out) and os.path.getsize(temp_out) > 1000:
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except Exception:
                    pass
            if os.path.exists(final_out) and final_out != temp_out:
                try:
                    os.remove(final_out)
                except Exception:
                    pass
            try:
                os.replace(temp_out, final_out)
            except Exception:
                shutil.move(temp_out, final_out)
            return final_out
        else:
            if os.path.exists(temp_out):
                try:
                    os.remove(temp_out)
                except Exception:
                    pass
    except Exception as err:
        print(f"[FFmpeg] Premiere Pro converter note: {err}")

    return file_path

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
            "lazy_playlist": True,
            "noplaylist": True,
            "socket_timeout": 20,
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
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
        except Exception as e1:
            last_error = e1
            try:
                fallback_opts = {
                    "quiet": True,
                    "skip_download": True,
                    "noplaylist": True,
                }
                if cookie_path:
                    fallback_opts["cookiefile"] = cookie_path
                with yt_dlp.YoutubeDL(fallback_opts) as ydl:
                    info = ydl.extract_info(url, download=False)
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
        seen_res = set()

        # Find best audio size to add to video size for true combined size
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

        # Add "Best Quality" default preset
        video_options.append({
            "format_id": "bestvideo+bestaudio/best",
            "label": "Best Video Quality (Auto)",
            "resolution": "Best",
            "codec": "H.264 / AAC",
            "ext": "mp4",
            "filesize": None,
            "filesize_str": "Auto (Highest Available)",
            "type": "video"
        })

        # Group formats by height to find the true best stream for each resolution
        formats_by_height = {}
        for f in formats:
            vcodec = f.get("vcodec", "none")
            height = f.get("height")
            if vcodec != "none" and height:
                if height not in formats_by_height:
                    formats_by_height[height] = []
                formats_by_height[height].append(f)

        # Process standard resolutions in descending order
        sorted_heights = sorted(formats_by_height.keys(), reverse=True)
        for height in sorted_heights:
            height_fmts = formats_by_height[height]
            best_fmt = height_fmts[-1]
            max_br = 0
            for f in height_fmts:
                br = f.get("vbr") or f.get("tbr") or 0
                sz = f.get("filesize") or f.get("filesize_approx") or 0
                if sz > 0 or br > max_br:
                    max_br = br
                    best_fmt = f

            v_size = best_fmt.get("filesize") or best_fmt.get("filesize_approx")
            fps = best_fmt.get("fps") or 30
            ext = "mp4"

            if height >= 4320:
                clean_res = "8K"
                label = "8K Ultra HD" if height == 4320 else f"{height}p (8K UHD)"
            elif height >= 2160:
                clean_res = "4K"
                label = "4K Ultra HD" if height == 2160 else f"{height}p (4K UHD)"
            elif height >= 1440:
                clean_res = "1440p"
                label = "1440p (2K QHD)" if height == 1440 else f"{height}p (2K QHD)"
            elif height >= 1080:
                clean_res = "1080p"
                label = "1080p (Full HD)" if height == 1080 else f"{height}p (Full HD)"
            elif height >= 720:
                clean_res = "720p"
                label = "720p (HD)" if height == 720 else f"{height}p (HD)"
            elif height >= 480:
                clean_res = "480p"
                label = "480p (SD)" if height == 480 else f"{height}p (SD)"
            elif height >= 360:
                clean_res = "360p"
                label = f"{height}p"
            elif height >= 240:
                clean_res = "240p"
                label = f"{height}p"
            else:
                clean_res = "144p"
                label = f"{height}p"

            if fps and fps >= 50:
                label += f" {int(fps)}fps"

            if not v_size and duration:
                actual_vbr = best_fmt.get("vbr") or best_fmt.get("tbr")
                if not actual_vbr:
                    actual_vbr = {4320: 35000, 2160: 18000, 1440: 7000, 1080: 2500, 720: 1400, 480: 700, 360: 400, 240: 220}.get(height, 180)
                v_size = int(duration * (actual_vbr * 1024 / 8))

            comb_size = (v_size + best_audio_size) if v_size else None

            format_spec = f"bestvideo[height<={height}]+bestaudio/best[height<={height}]/bestvideo+bestaudio/best"
            video_options.append({
                "format_id": format_spec,
                "label": label,
                "resolution": clean_res,
                "codec": "H.264 / AAC",
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
        expected_size: int = -1,
        downloaded_bytes: int = 0,
        progress: float = 0.0,
        on_progress: Optional[Callable] = None
    ):
        self.id = task_id
        self.url = url
        self.target_dir = target_dir
        self.format_id = format_id
        self.is_audio_only = is_audio_only
        self.audio_format = audio_format
        self.custom_title = custom_title
        self.on_progress = on_progress

        self.title = custom_title or "Media Download"
        self.filename = ""
        self.file_path = ""
        self.file_size = expected_size if (expected_size and expected_size > 0) else -1
        self.downloaded_bytes = downloaded_bytes or 0
        self.progress = progress or 0.0
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
        self._max_progress = progress or 0.0
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

    def _progress_hook(self, d: Dict[str, Any]):
        if self._is_canceled:
            raise Exception("Download canceled by user")
        if self._is_paused:
            raise Exception("Download paused by user")

        status = d.get("status")
        if status == "downloading":
            self.status = "downloading"
            curr_fname = d.get("filename", "stream")
            curr_dl = d.get("downloaded_bytes", 0)
            self._stream_history[curr_fname] = curr_dl

            # Total downloaded across all streams (video + audio)
            self.downloaded_bytes = sum(self._stream_history.values())

            # Track real media stream total (ignore tiny manifest chunks < 50KB)
            stream_total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            if stream_total > 50000:
                self._stream_totals[curr_fname] = stream_total

            tot_streams = sum(self._stream_totals.values())
            if tot_streams > 50000:
                self.file_size = tot_streams

            # Fragment-based estimation fallback if total is still unknown
            if self.file_size <= 0:
                frag_cnt = d.get("fragment_count")
                frag_idx = d.get("fragment_index")
                if frag_cnt and frag_idx and frag_idx > 0:
                    est = int((curr_dl / frag_idx) * frag_cnt)
                    if est > 50000:
                        self.file_size = est

            # Parse yt-dlp native percent string
            pct_str = d.get("_percent_str", "0%").replace("%", "").strip()
            try:
                native_prog = float(pct_str)
            except Exception:
                native_prog = 0.0

            # Calculate true total progress across all streams and never drop progress on resume
            calculated_prog = 0.0
            if self.file_size > 0 and self.downloaded_bytes > 0:
                calculated_prog = (self.downloaded_bytes / self.file_size) * 100.0
            elif native_prog > 0:
                calculated_prog = native_prog

            self._max_progress = max(self._max_progress, calculated_prog)
            self.progress = round(min(99.0, max(self.progress, self._max_progress)), 1)

            self.speed = d.get("speed") or 0.0
            self.eta = d.get("eta") or 0
            
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
                            tot_streams = sum(self._stream_totals.values())
                            if tot_streams > 50000 and self.file_size <= 0:
                                self.file_size = tot_streams
                    except Exception:
                        pass
                else:
                    curr_dl = d.get("downloaded_bytes") or d.get("total_bytes") or 0
                    if curr_dl > 0:
                        self._stream_history[curr_fname] = curr_dl
                        self.downloaded_bytes = sum(self._stream_history.values())

            if self.file_size > 0 and self.downloaded_bytes > 0:
                self.progress = round(min(99.0, (self.downloaded_bytes / self.file_size) * 100.0), 1)
            self._report_progress()

    def _report_progress(self):
        if self.on_progress and self._loop and self._loop.is_running():
            data = self.to_dict()
            try:
                asyncio.run_coroutine_threadsafe(self.on_progress(data), self._loop)
            except Exception:
                pass

    def run_sync(self):
        os.makedirs(self.target_dir, exist_ok=True)
        outtmpl = os.path.join(self.target_dir, "%(title).80s.%(ext)s")

        ffmpeg_dir = get_ffmpeg_location()
        cookie_path = get_cookie_file()

        ydl_opts = {
            "outtmpl": outtmpl,
            "trim_file_name": 80,
            "windowsfilenames": True,
            "restrictfilenames": False,
            "progress_hooks": [self._progress_hook],
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "merge_output_format": "mp4",
            "overwrites": True,
            "continuedl": True,
            "nopart": False,
            "nocheckcertificate": True,
            "retries": 10,
            "fragment_retries": 10,
            "socket_timeout": 30,
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

        if self.is_audio_only:
            ydl_opts["format"] = "bestaudio/best"
            if ffmpeg_dir:
                ydl_opts["postprocessors"] = [{
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": self.audio_format,
                    "preferredquality": "320",
                }]
        else:
            fmt = self.format_id or "bestvideo+bestaudio/best"
            if fmt.isdigit() or (not "+" in fmt and not "/" in fmt and "best" not in fmt):
                fmt = f"{fmt}+bestaudio[acodec^=mp4a]/{fmt}+bestaudio/best"
            elif not "/" in fmt and "+" in fmt:
                fmt = f"{fmt}/bestvideo[vcodec^=avc]+bestaudio[acodec^=mp4a]/bestvideo+bestaudio/best"
            elif fmt == "bestvideo+bestaudio/best" or fmt == "best":
                fmt = "bestvideo[vcodec^=avc]+bestaudio[acodec^=mp4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best"

            ydl_opts["format"] = fmt
            ydl_opts["format_sort"] = ["vcodec:h264", "acodec:aac", "ext:mp4:m4a"]
            if ffmpeg_dir:
                ydl_opts["postprocessors"] = [{
                    "key": "FFmpegVideoRemuxer",
                    "preferedformat": "mp4"
                }]
            else:
                ydl_opts["format"] = "best[ext=mp4]/best"

        # Emit initial downloading event immediately
        self.status = "downloading"
        self._report_progress()

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # Pre-extract exact metadata and stable file size before downloading
                try:
                    meta = ydl.extract_info(self.url, download=False)
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
                try:
                    info = ydl.extract_info(self.url, download=True)
                except Exception as dl_err:
                    err_msg = str(dl_err)
                    if "Requested format is not available" in err_msg or "format" in err_msg.lower():
                        # Retry with universal best fallback
                        ydl_opts["format"] = "bestvideo+bestaudio/best"
                        with yt_dlp.YoutubeDL(ydl_opts) as fallback_ydl:
                            info = fallback_ydl.extract_info(self.url, download=True)
                    elif ("unavailable" in err_msg.lower() or "not found" in err_msg.lower()) and (self.custom_title or self.title):
                        # Try searching by title on YouTube if link casing was altered
                        search_query = self.custom_title or self.title
                        with yt_dlp.YoutubeDL(ydl_opts) as fallback_ydl:
                            search_res = fallback_ydl.extract_info(f"ytsearch1:{search_query}", download=True)
                            if search_res and search_res.get("entries"):
                                info = search_res["entries"][0]
                            else:
                                info = search_res
                    else:
                        raise dl_err
                if info:
                    self.title = info.get("title", self.title)
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
                        if not self.is_audio_only:
                            def on_transcode_prog(speed_str=None, progress=None):
                                if progress is not None:
                                    self.progress = progress
                                if speed_str is not None:
                                    self.speed_str = speed_str
                                self._report_progress()
                            final_path = ensure_premiere_compatible_mp4(final_path, progress_callback=on_transcode_prog)
                        self.file_path = os.path.abspath(final_path)
                        self.filename = os.path.basename(final_path)
                        self.file_size = os.path.getsize(final_path)
                        self.downloaded_bytes = self.file_size

                        # Automatically clean up raw fragmented stream files (.f401.mp4, .f251.webm, .temp.mp4)
                        try:
                            parent_d = os.path.dirname(final_path)
                            base_n = os.path.splitext(os.path.basename(final_path))[0]
                            for sibling in os.listdir(parent_d):
                                if sibling.startswith(base_n[:15]) and (".f" in sibling or ".temp." in sibling) and sibling != os.path.basename(final_path):
                                    sib_path = os.path.join(parent_d, sibling)
                                    try:
                                        os.remove(sib_path)
                                    except Exception:
                                        pass
                        except Exception:
                            pass

            self.status = "completed"
            self.progress = 100.0
            self.speed = 0.0
            self.eta = 0
            self._report_progress()
        except Exception as e:
            if self._is_paused or "paused by user" in str(e):
                self.status = "paused"
                self.speed = 0.0
                self._report_progress()
                return
            if self._is_canceled or "canceled by user" in str(e):
                self.status = "canceled"
                self.speed = 0.0
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
                    if r.status_code in (200, 206):
                        total_len = int(r.headers.get('content-length', 0))
                        if total_len > 0:
                            self.file_size = total_len

                        dl = 0
                        start_t = time.time()
                        with open(target_file, 'wb') as f:
                            for chunk in r.iter_content(chunk_size=128 * 1024):
                                if self._is_canceled:
                                    self.status = "canceled"
                                    self._report_progress()
                                    return
                                if chunk:
                                    f.write(chunk)
                                    dl += len(chunk)
                                    self.downloaded_bytes = dl
                                    if self.file_size > 0:
                                        self.progress = round(min(99.0, (dl / self.file_size) * 100.0), 1)
                                    now = time.time()
                                    elapsed = now - start_t
                                    if elapsed > 0.5:
                                        self.speed = round(dl / elapsed, 1)
                                        if self.file_size > 0 and self.speed > 0:
                                            self.eta = int((self.file_size - dl) / self.speed)
                                    self._report_progress()

                        if os.path.exists(target_file) and not self.is_audio_only:
                            target_file = ensure_premiere_compatible_mp4(target_file)
                        self.file_path = os.path.abspath(target_file)
                        self.filename = os.path.basename(target_file)
                        self.file_size = os.path.getsize(target_file)
                        self.downloaded_bytes = self.file_size
                        self.status = "completed"
                        self.progress = 100.0
                        self.speed = 0.0
                        self.eta = 0
                        self._report_progress()
                        return
            except Exception:
                pass

            self.status = "error"
            self.error_message = str(e)
            self._report_progress()
            raise e

    async def start(self):
        self._loop = asyncio.get_running_loop()
        await self._loop.run_in_executor(None, self.run_sync)

    def cancel(self):
        self._is_canceled = True
        self.status = "canceled"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "url": self.url,
            "title": self.title,
            "filename": self.filename or f"{self.title}.{self.audio_format if self.is_audio_only else 'mp4'}",
            "file_path": self.file_path,
            "file_size": self.file_size,
            "downloaded_bytes": self.downloaded_bytes,
            "progress": round(self.progress, 1),
            "speed": round(self.speed, 1),
            "eta": self.eta,
            "status": self.status,
            "category": self.category,
            "thumbnail": self.thumbnail,
            "download_type": "stream",
            "format_id": self.format_id,
            "segments": self.segments,
            "created_at": getattr(self, "created_at", time.time()),
            "error_message": self.error_message
        }
