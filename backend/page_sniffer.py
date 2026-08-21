import os
import re
import urllib.parse
import aiohttp
from bs4 import BeautifulSoup
from typing import Dict, List, Any, Optional

MEDIA_EXTENSIONS = {
    "video": [".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv", ".wmv", ".m4v", ".ts", ".3gp"],
    "audio": [".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".wma", ".opus"],
    "image": [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico", ".tiff"],
    "compressed": [".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".iso", ".dmg"],
    "document": [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".epub"],
    "program": [".exe", ".msi", ".apk", ".bat", ".cmd", ".appimage", ".deb", ".rpm"]
}

def get_type_from_url(url: str) -> Optional[str]:
    parsed = urllib.parse.urlparse(url)
    ext = os.path.splitext(parsed.path)[1].lower()
    for cat, exts in MEDIA_EXTENSIONS.items():
        if ext in exts:
            return cat
    return None

def extract_filename_from_url(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    fname = os.path.basename(parsed.path)
    if fname:
        return urllib.parse.unquote(fname)
    return "download_file"

import socket
import requests

async def sniff_webpage(url: str) -> Dict[str, Any]:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
    }

    html = ""
    final_url = url
    try:
        connector = aiohttp.TCPConnector(family=socket.AF_INET)
        async with aiohttp.ClientSession(headers=headers, connector=connector) as session:
            async with session.get(url, allow_redirects=True, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status >= 400:
                    raise Exception(f"HTTP error {resp.status}")
                html = await resp.text(errors="ignore")
                final_url = str(resp.url)
    except Exception:
        # Robust synchronous requests fallback
        try:
            r = requests.get(url, headers=headers, timeout=15, allow_redirects=True)
            html = r.text
            final_url = r.url
        except Exception as e2:
            raise Exception(f"Failed to fetch webpage: {str(e2)}")

    soup = BeautifulSoup(html, "html.parser")
    page_title = soup.title.string.strip() if soup.title and soup.title.string else url

    discovered_items: List[Dict[str, Any]] = []
    seen_urls = set()

    def add_item(item_url: str, media_type: str, title: str = "", preview: str = ""):
        if not item_url:
            return
        full_url = urllib.parse.urljoin(final_url, item_url.strip())
        if full_url in seen_urls or full_url.startswith("javascript:") or full_url.startswith("data:"):
            return
        seen_urls.add(full_url)
        
        fname = extract_filename_from_url(full_url)
        discovered_items.append({
            "url": full_url,
            "filename": fname,
            "title": title or fname,
            "type": media_type,
            "preview_url": preview or (full_url if media_type == "image" else "")
        })

    # 1. Look for <video> and <source>
    for video in soup.find_all("video"):
        if video.get("src"):
            add_item(video["src"], "video", "Video Stream", video.get("poster", ""))
        for src in video.find_all("source"):
            if src.get("src"):
                add_item(src["src"], "video", "Video Source", video.get("poster", ""))

    # 2. Look for <audio> and <source>
    for audio in soup.find_all("audio"):
        if audio.get("src"):
            add_item(audio["src"], "audio", "Audio Stream")
        for src in audio.find_all("source"):
            if src.get("src"):
                add_item(src["src"], "audio", "Audio Source")

    # 3. Look for <img> tags
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or img.get("data-original")
        alt = img.get("alt", "").strip()
        if src:
            add_item(src, "image", alt or "Web Image", src)

    # 4. Look for <a> links that point to downloadable files
    for a in soup.find_all("a", href=True):
        href = a["href"]
        link_type = get_type_from_url(href)
        link_text = a.get_text(strip=True)
        if link_type:
            add_item(href, link_type, link_text or extract_filename_from_url(href))

    return {
        "page_title": page_title,
        "page_url": final_url,
        "total_found": len(discovered_items),
        "items": discovered_items
    }
