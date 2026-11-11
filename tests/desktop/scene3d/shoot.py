#!/usr/bin/env python3
"""Headless render harness for the Flower Shop scene3d asset kit.

Serves the repo root, loads tests/desktop/scene3d/index.html in headless
chromium (SwiftShader WebGL), screenshots the diorama plus every solo asset,
prints window.__result per shot, and exits 1 on any console error.
"""
from __future__ import annotations

import functools
import glob
import http.server
import json
import os
import socket
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "tests" / "desktop" / "out"
HARNESS = "/tests/desktop/scene3d/index.html"

SHOTS = [
    ("diorama", None),
    ("solo-mascot", "makeMascot"),
    ("solo-van", "makeVan"),
    ("solo-bouquet", "makeBouquet"),
    ("solo-shop", "makeShop"),
    ("solo-station-assembly", "makeStation:assembly"),
    ("solo-station-incoming", "makeStation:incoming"),
    ("solo-station-prep", "makeStation:prep"),
    ("solo-station-quality", "makeStation:quality"),
    ("solo-station-packing", "makeStation:packing"),
    ("solo-station-delivery", "makeStation:delivery"),
    ("solo-island", "makeIsland"),
    ("solo-butterfly", "makeButterfly"),
    ("solo-cloud", "makeCloud"),
    ("solo-tree", "makeTree"),
]

ARGS = [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002 - stdlib signature
        pass

    def do_GET(self):
        if self.path.startswith("/favicon.ico"):
            self.send_response(204)
            self.end_headers()
            return
        super().do_GET()


def start_server() -> tuple[http.server.ThreadingHTTPServer, str]:
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{port}"


def chromium_executable() -> str | None:
    """Newest installed playwright chromium, used as a fallback."""
    cands = sorted(glob.glob(os.path.expanduser("~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome")))
    return cands[-1] if cands else None


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    srv, base = start_server()
    print(f"serving {ROOT} at {base}")

    from playwright.sync_api import sync_playwright

    errors: list[str] = []
    results: dict[str, dict] = {}

    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(args=ARGS)
        except Exception as exc:  # noqa: BLE001 - fall back to a known binary
            exe = chromium_executable()
            print(f"default chromium launch failed ({exc}); using {exe}")
            if not exe:
                raise
            browser = p.chromium.launch(executable_path=exe, args=ARGS)

        page = browser.new_page(viewport={"width": 1100, "height": 620})
        page.on("console", lambda msg: errors.append(f"console.{msg.type}: {msg.text}")
                if msg.type == "error" else None)
        page.on("pageerror", lambda exc: errors.append(f"pageerror: {exc}"))

        for name, solo in SHOTS:
            url = base + HARNESS + (f"?solo={solo}" if solo else "")
            page.goto(url, wait_until="load")
            page.wait_for_function("document.title === 'done'", timeout=45000)
            page.wait_for_timeout(120)
            result = page.evaluate("window.__result")
            results[name] = result
            shot = OUT / f"s3d-{name}.png"
            page.screenshot(path=str(shot))
            print(
                f"{name:24s} tris={result['triangles']:6d} scene={result['sceneTriangles']:6d} "
                f"calls={result['calls']:4d} meshes={result['meshes']:4d} -> {shot}",
            )

        browser.close()

    srv.shutdown()

    if errors:
        print("\nCONSOLE ERRORS:", file=sys.stderr)
        for e in errors:
            print("  " + e, file=sys.stderr)
        return 1

    dio = results.get("diorama", {})
    print(f"\nOK: {len(results)} shots, diorama triangles={dio.get('triangles')}, calls={dio.get('calls')}")
    (OUT / "s3d-results.json").write_text(json.dumps(results, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
