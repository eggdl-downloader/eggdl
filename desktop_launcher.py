import sys
import os
import time
import socket
import threading
import asyncio
import urllib.request
import shutil
import json
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

# Set Windows AppUserModelID early so taskbar icon grouping is always 1:1 identical to pinned shortcut
APP_USER_MODEL_ID = "EggDL.Downloader.App"
if sys.platform == "win32":
    try:
        import ctypes
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_USER_MODEL_ID)
    except Exception:
        pass

# Single-Instance Protection: Prevents duplicate process and duplicate taskbar icons
_INSTANCE_MUTEX = None
def check_single_instance():
    global _INSTANCE_MUTEX
    if sys.platform == "win32":
        try:
            import ctypes
            ERROR_ALREADY_EXISTS = 183
            kernel32 = ctypes.windll.kernel32
            mutex_name = "Local\\EggDL_App_Single_Instance_Mutex"
            _INSTANCE_MUTEX = kernel32.CreateMutexW(None, False, mutex_name)
            if kernel32.GetLastError() == ERROR_ALREADY_EXISTS:
                # App is already running! Trigger existing window to show
                try:
                    urllib.request.urlopen("http://127.0.0.1:8000/api/app/show_window", timeout=1.0)
                except Exception:
                    pass
                try:
                    hwnd = ctypes.windll.user32.FindWindowW(None, "EggDL - Ultra Turbo Downloader")
                    if hwnd:
                        ctypes.windll.user32.ShowWindow(hwnd, 9)  # SW_RESTORE
                        ctypes.windll.user32.SetForegroundWindow(hwnd)
                except Exception:
                    pass
                # Terminate duplicate instance immediately
                sys.exit(0)
        except Exception:
            pass

# check_single_instance is invoked exclusively under __name__ == '__main__'

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

# Dynamically import all backend modules from disk if available so changes take immediate effect
backend_mods = [
    ("storage", "backend.storage"),
    ("auth", "backend.auth"),
    ("downloader_engine", "backend.downloader_engine"),
    ("media_extractor", "backend.media_extractor"),
    ("page_sniffer", "backend.page_sniffer"),
    ("app", "backend.app")
]
import importlib.util
for mod_name, full_name in backend_mods:
    fpath = os.path.join(BACKEND_DIR, f"{mod_name}.py")
    if os.path.exists(fpath):
        try:
            spec = importlib.util.spec_from_file_location(mod_name, fpath)
            mod = importlib.util.module_from_spec(spec)
            sys.modules[mod_name] = mod
            sys.modules[full_name] = mod
            spec.loader.exec_module(mod)
        except Exception as err:
            sys.stderr.write(f"[Dynamic Import Warning for {mod_name}] {err}\n")

if "backend.app" in sys.modules and hasattr(sys.modules["backend.app"], "app"):
    app = sys.modules["backend.app"].app
elif "app" in sys.modules and hasattr(sys.modules["app"], "app"):
    app = sys.modules["app"].app
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

import pystray
from PIL import Image

def ensure_autostart_registry():
    """Ensures EggDL starts automatically in the system tray (minimized, no window) when Windows boots."""
    if sys.platform == "win32":
        try:
            import winreg
            installed_exe = os.path.expandvars(r"%LOCALAPPDATA%\EggDL\EggDL.exe")
            if os.path.exists(installed_exe):
                cmd = f'"{installed_exe}" --tray'
            elif getattr(sys, 'frozen', False):
                cmd = f'"{sys.executable}" --tray'
            else:
                pyw_exe = sys.executable.replace("python.exe", "pythonw.exe")
                if not os.path.exists(pyw_exe):
                    pyw_exe = sys.executable
                script_path = os.path.abspath(sys.argv[0])
                cmd = f'"{pyw_exe}" "{script_path}" --tray'

            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE)
            winreg.SetValueEx(key, "EggDL", 0, winreg.REG_SZ, cmd)
            winreg.CloseKey(key)
        except Exception:
            pass

_MAIN_WINDOW = None
_TRAY_ICON = None
_IS_EXITING = False

def on_open_eggdl(icon=None, item=None):
    show_main_window()

def show_main_window():
    global _MAIN_WINDOW
    if _MAIN_WINDOW:
        try:
            _MAIN_WINDOW.show()
            _MAIN_WINDOW.restore()
        except Exception:
            pass
    if sys.platform == "win32":
        try:
            import ctypes
            hwnd = ctypes.windll.user32.FindWindowW(None, "EggDL - Ultra Turbo Downloader")
            if not hwnd:
                def enum_cb(h, l):
                    length = ctypes.windll.user32.GetWindowTextLengthW(h)
                    if length > 0:
                        buff = ctypes.create_unicode_buffer(length + 1)
                        ctypes.windll.user32.GetWindowTextW(h, buff, length + 1)
                        if "EggDL" in buff.value:
                            l.append(h)
                    return True
                hwnds = []
                WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.py_object)
                ctypes.windll.user32.EnumWindows(WNDENUMPROC(enum_cb), hwnds)
                if hwnds:
                    hwnd = hwnds[0]

            if hwnd:
                ctypes.windll.user32.ShowWindow(hwnd, 9)  # SW_RESTORE
                ctypes.windll.user32.ShowWindow(hwnd, 5)  # SW_SHOW
                ctypes.windll.user32.SetForegroundWindow(hwnd)
                ctypes.windll.user32.BringWindowToTop(hwnd)
        except Exception:
            pass

def on_desktop_download_completed(task_dict):
    global _MAIN_WINDOW
    # Windows OS native tray notification is intentionally disabled to avoid duplicate OS toasts.
    # The in-app download complete notification card + sound effect is used exclusively.
    if _MAIN_WINDOW:
        try:
            task_json = json.dumps(task_dict)
            _MAIN_WINDOW.evaluate_js(f"if(window.UI && window.UI.showDownloadCompleteNotification){{ window.UI.showDownloadCompleteNotification({task_json}); }}")
        except Exception:
            pass

# Connect show window callback and download completed callback for FastAPI backend
if "backend.app" in sys.modules:
    if hasattr(sys.modules["backend.app"], "set_show_window_callback"):
        sys.modules["backend.app"].set_show_window_callback(show_main_window)
    if hasattr(sys.modules["backend.app"], "set_download_completed_callback"):
        sys.modules["backend.app"].set_download_completed_callback(on_desktop_download_completed)
elif "app" in sys.modules:
    if hasattr(sys.modules["app"], "set_show_window_callback"):
        sys.modules["app"].set_show_window_callback(show_main_window)
    if hasattr(sys.modules["app"], "set_download_completed_callback"):
        sys.modules["app"].set_download_completed_callback(on_desktop_download_completed)

def on_closing():
    global _MAIN_WINDOW, _IS_EXITING
    if _IS_EXITING:
        return True
    if _MAIN_WINDOW:
        try:
            _MAIN_WINDOW.hide()
        except Exception:
            pass
        return False
    return True

def on_license_details(icon=None, item=None):
    show_main_window()
    global _MAIN_WINDOW
    if _MAIN_WINDOW:
        try:
            _MAIN_WINDOW.evaluate_js("if(window.UI && window.UI.openAccountModal){ window.UI.openAccountModal(); }")
        except Exception:
            pass

def on_open_downloads(icon=None, item=None):
    try:
        dl_dir = Path.home() / "Downloads" / "Eggdl Downloads"
        dl_dir.mkdir(parents=True, exist_ok=True)
        if sys.platform == "win32":
            os.startfile(str(dl_dir))
        else:
            import subprocess
            subprocess.Popen(["xdg-open", str(dl_dir)])
    except Exception as e:
        sys.stderr.write(f"[Open Downloads Error] {e}\n")

def on_restart_app(icon=None, item=None):
    global _IS_EXITING, _TRAY_ICON, _INSTANCE_MUTEX
    _IS_EXITING = True

    # 1. Hide tray icon immediately
    if _TRAY_ICON:
        try:
            _TRAY_ICON.visible = False
        except Exception:
            pass

    # 2. Release and close the single-instance mutex so the new process starts freely
    if _INSTANCE_MUTEX and sys.platform == "win32":
        try:
            import ctypes
            ctypes.windll.kernel32.CloseHandle(_INSTANCE_MUTEX)
            _INSTANCE_MUTEX = None
        except Exception:
            pass

    # 3. Launch the new EggDL process detached with a 0.5s pause to ensure port 8000 is clean
    try:
        import subprocess
        if getattr(sys, 'frozen', False):
            exe_path = sys.executable
            cmd = f'ping 127.0.0.1 -n 2 > nul & start "" "{exe_path}"'
        else:
            py_exe = sys.executable.replace("python.exe", "pythonw.exe")
            if not os.path.exists(py_exe):
                py_exe = sys.executable
            script_path = os.path.abspath(sys.argv[0])
            cmd = f'ping 127.0.0.1 -n 2 > nul & start "" "{py_exe}" "{script_path}"'

        subprocess.Popen(cmd, shell=True, creationflags=0x08000000)
    except Exception as e:
        sys.stderr.write(f"[Restart Error] {e}\n")

    # 4. Terminate current process instantly
    os._exit(0)

def on_clear_cache(icon=None, item=None):
    try:
        freed_bytes = 0
        deleted_files = 0

        # 1. User AppData EggDL Temp Chunks
        data_dir = get_user_data_dir()
        if os.path.exists(data_dir):
            for root, dirs, files in os.walk(data_dir):
                for f in files:
                    if f.endswith('.tmp') or f.endswith('.part') or f.endswith('.crdownload') or f.endswith('.log.old'):
                        try:
                            p = os.path.join(root, f)
                            sz = os.path.getsize(p)
                            os.remove(p)
                            freed_bytes += sz
                            deleted_files += 1
                        except Exception:
                            pass

        # 2. System Temp EggDL files
        sys_temp = os.environ.get('TEMP', '')
        if sys_temp and os.path.exists(sys_temp):
            for f in os.listdir(sys_temp):
                if f.startswith('eggdl') or f.startswith('yt-dlp') or f.startswith('tmp_egg'):
                    try:
                        p = os.path.join(sys_temp, f)
                        if os.path.isfile(p):
                            sz = os.path.getsize(p)
                            os.remove(p)
                            freed_bytes += sz
                            deleted_files += 1
                        elif os.path.isdir(p):
                            shutil.rmtree(p, ignore_errors=True)
                            deleted_files += 1
                    except Exception:
                        pass

        # 3. Downloads directory temporary partial files
        dl_dir = Path.home() / "Downloads" / "Eggdl Downloads"
        if dl_dir.exists():
            for f in dl_dir.iterdir():
                if f.is_file() and (f.suffix in ['.tmp', '.part', '.ytdl'] or f.name.endswith('.temp')):
                    try:
                        sz = f.stat().st_size
                        f.unlink()
                        freed_bytes += sz
                        deleted_files += 1
                    except Exception:
                        pass

        # Format human readable size
        if freed_bytes >= 1024 * 1024 * 1024:
            size_text = f"{freed_bytes / (1024 * 1024 * 1024):.2f} GB"
        elif freed_bytes >= 1024 * 1024:
            size_text = f"{freed_bytes / (1024 * 1024):.2f} MB"
        elif freed_bytes >= 1024:
            size_text = f"{freed_bytes / 1024:.2f} KB"
        elif freed_bytes > 0:
            size_text = f"{freed_bytes} Bytes"
        else:
            size_text = "0 KB"

        if deleted_files > 0:
            summary_msg = f"Cleaned {deleted_files} temp chunks & freed {size_text} space!"
        else:
            summary_msg = "All temporary download chunks and cache are already clean!"

        # Show native Windows System Tray Balloon Notification
        global _TRAY_ICON, _MAIN_WINDOW
        if _TRAY_ICON:
            try:
                _TRAY_ICON.notify(summary_msg, "EggDL • Cache Cleaned ⚡")
            except Exception:
                pass

        # Also show Toast in UI if main window is open
        if _MAIN_WINDOW:
            try:
                clean_json = json.dumps(summary_msg)
                _MAIN_WINDOW.evaluate_js(f"if(window.UI && window.UI.showToast){{ window.UI.showToast({clean_json}, 'success'); }}")
            except Exception:
                pass

    except Exception as e:
        sys.stderr.write(f"[Clear Cache Error] {e}\n")

def on_exit_app(icon=None, item=None):
    global _IS_EXITING, _TRAY_ICON
    _IS_EXITING = True
    # Immediately remove tray icon from Windows taskbar notification area with 0 delay
    if _TRAY_ICON:
        try:
            _TRAY_ICON.visible = False
        except Exception:
            pass
    # Instant process termination with 0ms delay
    os._exit(0)

def launch_browser_fallback(target_url: str):
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
                return
            except Exception as e:
                sys.stderr.write(f"[App Mode Note] {e}\n")

    import webbrowser
    webbrowser.open(target_url)

class DesktopApi:
    def get_clipboard(self):
        try:
            if "backend.app" in sys.modules and hasattr(sys.modules["backend.app"], "get_native_clipboard_text"):
                return sys.modules["backend.app"].get_native_clipboard_text()
            elif "app" in sys.modules and hasattr(sys.modules["app"], "get_native_clipboard_text"):
                return sys.modules["app"].get_native_clipboard_text()
        except Exception:
            pass
        return ""

    def install_update(self):
        try:
            for mod_name in ["backend.app", "app"]:
                if mod_name in sys.modules and hasattr(sys.modules[mod_name], "update_mgr"):
                    sys.modules[mod_name].update_mgr.launch_installer()
                    return {"success": True, "message": "Update installer launched"}
        except Exception as e:
            return {"success": False, "error": str(e)}
        return {"success": False, "error": "Update manager not found"}

def main():
    global _MAIN_WINDOW, _TRAY_ICON
    ensure_autostart_registry()
    is_tray_start = any(arg in sys.argv for arg in ["--tray", "--minimized", "--startup", "-t", "-m"])

    port = find_available_port(8000)
    server_thread = threading.Thread(target=run_server, args=(port,), daemon=True)
    server_thread.start()
    wait_for_server(port)

    target_url = f"http://localhost:{port}/"
    icon_path = os.path.join(BUNDLE_DIR, "eggdl.ico")
    if not os.path.exists(icon_path):
        exe_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else BASE_DIR
        icon_path = os.path.join(exe_dir, "eggdl.ico")
    if not os.path.exists(icon_path):
        icon_path = os.path.join(BUNDLE_DIR, "frontend", "images", "egg-icon.png")

    # Setup System Tray Icon with rich, needful options (Open EggDL removed from right click menu)
    try:
        if os.path.exists(icon_path):
            img = Image.open(icon_path)
        else:
            img = Image.new('RGB', (64, 64), color=(59, 130, 246))

        menu = pystray.Menu(
            pystray.MenuItem("🥚 Open EggDL", on_open_eggdl, default=True),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("📁 Open Downloads", on_open_downloads),
            pystray.MenuItem("🔑 License Details", on_license_details),
            pystray.MenuItem("🔄 Restart App", on_restart_app),
            pystray.MenuItem("⚡ Clear Temp & Cache", on_clear_cache),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("✕ Exit EggDL", on_exit_app)
        )
        _TRAY_ICON = pystray.Icon(
            "EggDL",
            img,
            "EggDL - Ultra Turbo Downloader (Active)",
            menu=menu
        )
        _TRAY_ICON.run_detached()
    except Exception as tray_err:
        sys.stderr.write(f"[Tray Init Note] {tray_err}\n")

    # Launch native webview on the Main Thread with DesktopApi native bridge
    try:
        import webview
        _MAIN_WINDOW = webview.create_window(
            title="EggDL - Ultra Turbo Downloader",
            url=target_url,
            width=1320,
            height=840,
            min_size=(980, 640),
            background_color="#0B0F19",
            easy_drag=False,
            zoomable=True,
            hidden=is_tray_start,
            js_api=DesktopApi()
        )
        _MAIN_WINDOW.events.closing += on_closing
        webview.start(debug=False, icon=icon_path if os.path.exists(icon_path) else None)
    except Exception as err:
        sys.stderr.write(f"[WebView Note] {err}\n")
        if not is_tray_start:
            launch_browser_fallback(target_url)

    # Keep background server and tray running until user explicitly exits
    if not _IS_EXITING:
        try:
            while not _IS_EXITING:
                time.sleep(1)
        except (KeyboardInterrupt, SystemExit):
            sys.exit(0)

if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()
    check_single_instance()
    main()
