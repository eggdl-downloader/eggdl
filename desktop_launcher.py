import sys
import os
import time
import socket
import threading
import asyncio
import urllib.request
from pathlib import Path

# Fix PyInstaller windowed mode where sys.stdout and sys.stderr are None
class StreamToLogger:
    def __init__(self, log_file=None):
        self.log_file = log_file

    def write(self, buf):
        if self.log_file:
            try:
                with open(self.log_file, "a", encoding="utf-8") as f:
                    f.write(buf)
            except Exception:
                pass

    def flush(self):
        pass

    def isatty(self):
        return False

def get_user_data_dir() -> str:
    if sys.platform == "win32":
        app_data = os.environ.get("APPDATA")
        data_dir = os.path.join(app_data, "EggDL") if app_data else str(Path.home() / ".eggdl")
    else:
        data_dir = str(Path.home() / ".eggdl")
    os.makedirs(data_dir, exist_ok=True)
    return data_dir

log_path = os.path.join(get_user_data_dir(), "server.log")
if sys.stdout is None:
    sys.stdout = StreamToLogger(log_path)
if sys.stderr is None:
    sys.stderr = StreamToLogger(log_path)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if getattr(sys, 'frozen', False):
    exe_dir = os.path.dirname(sys.executable)
    internal_dir = os.path.join(exe_dir, "_internal")
    BUNDLE_DIR = internal_dir if os.path.exists(internal_dir) else getattr(sys, '_MEIPASS', exe_dir)
else:
    BUNDLE_DIR = BASE_DIR

BACKEND_DIR = os.path.join(BUNDLE_DIR, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
if BUNDLE_DIR not in sys.path:
    sys.path.insert(0, BUNDLE_DIR)

# Dynamically import backend.app from disk file if available so disk updates take immediate effect
app_file = os.path.join(BACKEND_DIR, "app.py")
if os.path.exists(app_file):
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location("backend.app", app_file)
        backend_app_mod = importlib.util.module_from_spec(spec)
        sys.modules["backend.app"] = backend_app_mod
        spec.loader.exec_module(backend_app_mod)
        app = backend_app_mod.app
    except Exception as import_err:
        sys.stderr.write(f"[Dynamic Import Warning] {import_err}\n")
        try:
            from backend.app import app
        except ImportError:
            from app import app
else:
    try:
        from backend.app import app
    except ImportError:
        from app import app

import uvicorn

def free_port_8000():
    if sys.platform == "win32":
        try:
            import subprocess
            out = subprocess.check_output("netstat -ano -p tcp", shell=True, text=True, stderr=subprocess.DEVNULL)
            for line in out.splitlines():
                if ":8000" in line and "LISTENING" in line:
                    parts = line.strip().split()
                    pid = parts[-1]
                    if pid and pid.isdigit() and int(pid) != os.getpid():
                        subprocess.run(f"taskkill /F /PID {pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass

def find_available_port(start_port: int = 8000, max_attempts: int = 50) -> int:
    free_port_8000()
    for port in range(start_port, start_port + max_attempts):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('127.0.0.1', port))
                return port
        except OSError:
            continue
    return 8000

def run_server(port: int):
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        config = uvicorn.Config(
            app,
            host="127.0.0.1",
            port=port,
            log_config=None,
            log_level="warning",
            access_log=False,
            loop="asyncio"
        )
        server = uvicorn.Server(config)
        loop.run_until_complete(server.serve())
    except Exception as e:
        sys.stderr.write(f"[Server Error] {e}\n")

def wait_for_server(port: int, timeout: float = 15.0) -> bool:
    start_time = time.time()
    url = f"http://127.0.0.1:{port}/"
    while time.time() - start_time < timeout:
        try:
            with urllib.request.urlopen(url, timeout=1.0) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.15)
    return False

def main():
    port = find_available_port(8000)
    server_thread = threading.Thread(target=run_server, args=(port,), daemon=True)
    server_thread.start()
    wait_for_server(port)

    target_url = f"http://localhost:{port}/"
    icon_path = os.path.join(BUNDLE_DIR, "eggdl.ico")
    if not os.path.exists(icon_path):
        icon_path = os.path.join(BUNDLE_DIR, "frontend", "images", "egg-icon.png")

    # 1. Try native Edge WebView2 window
    try:
        import webview
        window = webview.create_window(
            title="EggDL - Ultra Turbo Downloader",
            url=target_url,
            width=1320,
            height=840,
            min_size=(980, 640),
            background_color="#0B0F19",
            easy_drag=False,
            zoomable=True
        )
        webview.start(debug=False, icon=icon_path if os.path.exists(icon_path) else None)
        sys.exit(0)
    except Exception as err:
        sys.stderr.write(f"[WebView Note] {err}\n")

    # 2. Standalone App Mode via Edge / Chrome (No URL bar, no tabs, pure desktop app window)
    import subprocess
    app_profile_dir = os.path.join(get_user_data_dir(), "BrowserAppProfile")
    os.makedirs(app_profile_dir, exist_ok=True)

    browser_candidates = [
        r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
        os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe'),
        r'C:\Program Files\Google\Chrome\Application\chrome.exe',
        r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
        os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe'),
        r'C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe',
    ]

    for browser_exe in browser_candidates:
        if os.path.exists(browser_exe):
            try:
                cmd = [
                    browser_exe,
                    f"--app={target_url}",
                    f"--user-data-dir={app_profile_dir}",
                    "--window-size=1320,840",
                    "--disable-extensions",
                    "--disable-plugins"
                ]
                proc = subprocess.Popen(cmd)
                proc.wait()
                sys.exit(0)
            except Exception as e:
                sys.stderr.write(f"[App Mode Note] {e}\n")

    # 3. Final Fallback if no Chromium browser found
    import webbrowser
    webbrowser.open(target_url)
    try:
        while True:
            time.sleep(1)
    except (KeyboardInterrupt, SystemExit):
        sys.exit(0)

if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()
    main()
