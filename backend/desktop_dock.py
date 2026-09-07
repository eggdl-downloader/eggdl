import sys
import os
import time
import json
import urllib.request
import urllib.error
import tkinter as tk

PORTS_TO_CHECK = [8000, 8001, 8002, 8003, 8004, 8005]

def get_backend_url():
    for port in PORTS_TO_CHECK:
        url = f"http://127.0.0.1:{port}"
        try:
            req = urllib.request.Request(f"{url}/api/health", headers={"User-Agent": "EggDLDock/1.0"})
            with urllib.request.urlopen(req, timeout=0.6) as resp:
                if resp.status == 200:
                    return url
        except Exception:
            continue
    return "http://127.0.0.1:8000"

def api_call(endpoint, method="GET", data=None):
    base = get_backend_url()
    url = f"{base}{endpoint}"
    req_data = None
    headers = {"User-Agent": "EggDLDock/1.0"}
    if data is not None:
        req_data = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None

class FloatingDockApp:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("EggDL Floating Dock")
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        self.root.configure(bg="#0B0F19")
        
        try:
            self.root.attributes("-alpha", 0.98)
        except Exception:
            pass

        self.items = []
        self.empty_count = 0
        self.capsule_frames = {}

        self.container = tk.Frame(self.root, bg="#0B0F19", padx=2, pady=2)
        self.container.pack(fill="both", expand=True)

        self.update_items()
        self.poll_loop()

    def reposition(self):
        num_items = len(self.items)
        if num_items == 0:
            self.root.withdraw()
            return

        self.root.deiconify()
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        
        width = 360
        height = max(48, num_items * 46 + 8)
        
        x = sw - width - 20
        y = sh - height - 60
        self.root.geometry(f"{width}x{height}+{x}+{y}")

    def render_capsules(self):
        for widget in self.container.winfo_children():
            widget.destroy()

        self.reposition()

        # Stack from top to bottom (most recent at top)
        for item in reversed(self.items):
            item_id = item.get("id", "")
            title = item.get("title") or item.get("filename") or "Download"
            if len(title) > 28:
                short_title = title[:26] + "…"
            else:
                short_title = title

            frame = tk.Frame(
                self.container,
                bg="#181C22",
                highlightbackground="#2E3540",
                highlightcolor="#38BDF8",
                highlightthickness=1,
                padx=8,
                pady=6
            )
            frame.pack(fill="x", pady=3, padx=2)

            icon_lbl = tk.Label(frame, text="⚡", fg="#38BDF8", bg="#181C22", font=("Segoe UI", 11, "bold"))
            icon_lbl.pack(side="left", padx=(2, 6))

            title_lbl = tk.Label(
                frame,
                text=f"EggDL • {short_title}",
                fg="#F8FAFC",
                bg="#181C22",
                font=("Segoe UI", 9, "bold"),
                anchor="w"
            )
            title_lbl.pack(side="left", fill="x", expand=True)

            btn_frame = tk.Frame(frame, bg="#181C22")
            btn_frame.pack(side="right", padx=(4, 0))

            start_btn = tk.Label(
                btn_frame,
                text="Start",
                fg="#FFFFFF",
                bg="#2563EB",
                font=("Segoe UI", 8, "bold"),
                padx=8,
                pady=2,
                cursor="hand2"
            )
            start_btn.pack(side="left", padx=(0, 6))
            
            def make_start_handler(target_id):
                return lambda e: self.on_start_download(target_id)
            start_btn.bind("<Button-1>", make_start_handler(item_id))

            close_btn = tk.Label(
                btn_frame,
                text="✕",
                fg="#94A3B8",
                bg="#181C22",
                font=("Segoe UI", 9),
                padx=4,
                pady=2,
                cursor="hand2"
            )
            close_btn.pack(side="left")
            
            def make_close_handler(target_id):
                return lambda e: self.on_close_item(target_id)
            close_btn.bind("<Button-1>", make_close_handler(item_id))

    def on_start_download(self, item_id):
        res = api_call("/api/dock/start", method="POST", data={"id": item_id})
        self.update_items()

    def on_close_item(self, item_id):
        res = api_call("/api/dock/remove", method="POST", data={"id": item_id})
        self.update_items()

    def update_items(self):
        res = api_call("/api/dock/items")
        if res and res.get("success"):
            new_items = res.get("items", [])
            if new_items != self.items:
                self.items = new_items
                self.render_capsules()

    def poll_loop(self):
        self.update_items()
        if not self.items:
            self.empty_count += 1
            if self.empty_count > 10:
                self.root.destroy()
                return
        else:
            self.empty_count = 0

        self.root.after(1500, self.poll_loop)

if __name__ == "__main__":
    app = FloatingDockApp()
    app.root.mainloop()
