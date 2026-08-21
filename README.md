# ⚡ Pro Downloader — Universal & Accelerated Download Manager

A modern, high-speed multi-threaded download manager with a **Glassmorphic UI**, automated 4K/2K/1080p video extraction, audio conversion, and in-app media playback.

---

## ✨ Features
- **Multi-Threaded Turbo Engine**: IDM-style multi-segment chunk acceleration with pause & resume.
- **Glassmorphism UI**: Frosted acrylic theme with `Outfit` + `Plus Jakarta Sans` typography.
- **Video & Audio Extractor**: 4K UHD, 1080p FHD, 720p HD, and Studio MP3 (320kbps) audio extraction.
- **Anti-Bot TLS Bypass**: Browser TLS impersonation for protected video hosting sites.
- **Built-in Media Player**: Stream and preview downloaded media directly in your browser.
- **Web Media Sniffer**: Crawl and sniff all downloadable videos, images, and audio from any webpage.

---

## 🚀 Free 1-Click Cloud Deployment

### Deploy to Render.com (100% Free):
1. Push this repository to your **GitHub** account.
2. Sign in to **[Render.com](https://render.com)** (Free, no credit card required).
3. Click **New +** ➔ **Web Service** ➔ Select your repository.
4. Set:
   - **Environment**: Python
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn backend.app:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: **Free**
5. Click **Create Web Service**. You will receive your free public HTTPS URL!

---

## 💻 Local Setup

```bash
git clone https://github.com/your-username/pro-downloader.git
cd pro-downloader
pip install -r requirements.txt
python -m uvicorn backend.app:app --host 0.0.0.0 --port 8000
```
Open **http://localhost:8000** in your browser.
