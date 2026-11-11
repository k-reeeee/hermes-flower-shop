#!/usr/bin/env python3
"""Floor 3D probe: loads the Shop Floor tab in the mock harness (WebGL via SwiftShader), reads
renderer stats from window.__floor.info(), clicks a bouquet to check picking, and screenshots
desktop + phone. Usage: python3 tests/desktop/harness/floor_probe.py"""
import glob, http.server, json, os, pathlib, socketserver, sys, threading
from functools import partial
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "tests" / "desktop" / "out"
OUT.mkdir(parents=True, exist_ok=True)
h = partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
h.log_message = lambda *a, **k: None
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(("127.0.0.1", 0), h)
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{srv.server_address[1]}/tests/desktop/harness/index.html?tab=floor"
ARGS = ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
errors, report = [], {}
with sync_playwright() as p:
    exe = next(iter(sorted(glob.glob(os.path.expanduser("~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome")), reverse=True)), None)
    b = p.chromium.launch(args=ARGS, executable_path=exe)
    for name, vp, dpr in [("desktop", (1440, 900), 1), ("phone", (390, 844), 2)]:
        ctx = b.new_context(viewport={"width": vp[0], "height": vp[1]}, device_scale_factor=dpr, has_touch=vp[0] < 700)
        pg = ctx.new_page()
        pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(URL, wait_until="networkidle")
        pg.wait_for_function("window.__floor && window.__floor.kind", timeout=30000)
        pg.wait_for_timeout(2500)
        info = pg.evaluate("window.__floor.kind === 'webgl' ? window.__floor.info() : {kind: window.__floor.kind}")
        # pick: click the screen position of the first bouquet, expect a selection
        hit = pg.evaluate("""() => { const r = window.__floor; const ids = [...(r.state ? [] : [])];
          const f = document.querySelector('canvas'); const b = f.getBoundingClientRect();
          for (let id = 1; id < 40; id++) { const s = r.tokenScreen ? r.tokenScreen(id) : null; if (s && s.visible && s.x > 0) return {id, x: b.left + s.x, y: b.top + s.y + 14} } return null }""")
        picked = None
        if hit:
            pg.mouse.click(hit["x"], hit["y"])
            pg.wait_for_timeout(600)
            picked = pg.evaluate("window.__floor.state.selected")
        pg.screenshot(path=str(OUT / f"probe-floor-{name}.png"))
        report[name] = {"info": info, "click_target": hit, "selected_after_click": picked}
        ctx.close()
    b.close()
srv.shutdown()
print(json.dumps({"report": report, "errors": errors}, indent=1))
sys.exit(1 if errors else 0)
