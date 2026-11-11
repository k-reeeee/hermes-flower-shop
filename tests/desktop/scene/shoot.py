"""Headless check of the Shop Floor engine: renders the REAL /floor payload (seeded demo DB)
in Chromium, screenshots several states, and reports frame time + picking. Usage:
    python3 tests/desktop/scene/shoot.py   (from the repo root)"""
import glob, http.server, json, os, socketserver, sys, threading
from functools import partial
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = os.path.join(ROOT, "tests", "desktop", "out")
os.makedirs(OUT, exist_ok=True)
handler = partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
handler.log_message = lambda *a, **k: None
srv = socketserver.TCPServer(("127.0.0.1", 0), handler)
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
errors = []
with sync_playwright() as p:
    exe = os.environ.get("CHROMIUM_PATH") or next(iter(sorted(glob.glob(os.path.expanduser(
        "~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome")), reverse=True)), None)
    b = p.chromium.launch(args=["--no-sandbox"], executable_path=exe)
    pg = b.new_page(viewport={"width": 1100, "height": 620})
    pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
    pg.on("pageerror", lambda e: errors.append(str(e)))
    for name, qs in [("floor-default", ""), ("floor-selected", "?select=1"), ("floor-move", "?move=1"), ("floor-rotated", "?yaw=1.2"), ("solo-shop", "?solo=shop&scale=2.2"), ("solo-mascot", "?solo=mascot&scale=5"), ("solo-van", "?solo=prop_delivery&scale=5"), ("solo-bouquet", "?solo=bouquet&scale=8")]:
        pg.goto(f"http://127.0.0.1:{port}/tests/desktop/scene/index.html{qs}")
        pg.wait_for_function("document.title === 'done'", timeout=20000)
        res = pg.evaluate("window.__result")
        pg.screenshot(path=os.path.join(OUT, name + ".png"))
        print(name, json.dumps(res))
    b.close()
srv.shutdown()
print("errors:", errors or "none")
sys.exit(1 if errors else 0)
