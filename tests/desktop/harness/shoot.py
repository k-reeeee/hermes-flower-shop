#!/usr/bin/env python3
"""Screenshot every Flower Shop tab through the mock-SDK harness (Playwright, chromium --no-sandbox).

Run from anywhere:  python3 tests/desktop/harness/shoot.py
Outputs tests/desktop/out/*.png at 1440x900, dpr 1. Time is pinned to 2026-11-11 12:30 WIB so
due labels are stable. Exit code 1 if a page logs a console error / uncaught exception.
"""
import http.server
import json
import pathlib
import socketserver
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "tests" / "desktop" / "out"
OUT.mkdir(parents=True, exist_ok=True)
import datetime
NOW = datetime.datetime(2026, 11, 11, 5, 30, tzinfo=datetime.timezone.utc)  # 12:30 WIB


class Quiet(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)

    def log_message(self, *a):
        pass


socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Quiet)
PORT = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{PORT}/tests/desktop/harness/index.html"

errors = []
shots = []
layout_issues = []


def open_page(pw_browser, query):
    ctx = pw_browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"[{query}] pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"[{query}] console.{m.type}: {m.text}") if m.type == "error" else None)
    page.clock.set_fixed_time(NOW)
    page.goto(f"{BASE}?{query}", wait_until="networkidle", timeout=60000)
    page.wait_for_function("document.title === 'READY'", timeout=30000)
    page.wait_for_timeout(700)
    return ctx, page


LINT_JS = """() => {
  const out = [], trunc = []
  const root = document.getElementById('main')
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) out.push('page scrolls horizontally')
  root.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el)
    if (cs.display === 'inline' || !el.clientWidth) return
    const over = el.scrollWidth > el.clientWidth + 1
    if (over && cs.textOverflow === 'ellipsis') trunc.push((el.textContent || '').trim().slice(0, 50))
    else if (over && cs.overflowX === 'visible' && !el.children.length) out.push('text overflows its box: ' + (el.textContent || '').trim().slice(0, 50))
  })
  return { out, trunc }
}"""


def snap(page, name):
    path = OUT / f"{name}.png"
    page.screenshot(path=str(path))
    shots.append(str(path))
    res = page.evaluate(LINT_JS)
    body = page.inner_text("#main")
    for bad in ("NaN", "undefined", "[object", "null", "Invalid Date", "Infinity"):
        if bad in body:
            res["out"].append(f"page text contains {bad!r}")
    note = ""
    if res["out"]:
        note += "  LAYOUT: " + "; ".join(res["out"][:6])
        layout_issues.extend(f"{name}: {x}" for x in res["out"])
    if res["trunc"]:
        note += f"  (ellipsis-truncated: {len(res['trunc'])})"
    print("shot", path.name, note)


TABS = ["overview", "orders", "inventory", "production", "floor", "delivery", "finance", "team", "approvals", "setup"]

with sync_playwright() as pw:
    try:
        browser = pw.chromium.launch(args=["--no-sandbox"])
    except Exception:
        # The playwright python package can be newer than the installed browser build: fall back
        # to the newest chromium found in the playwright cache.
        import glob
        import os
        cands = sorted(glob.glob(os.path.expanduser("~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome")))
        if not cands:
            raise
        print("falling back to", cands[-1])
        browser = pw.chromium.launch(executable_path=cands[-1], args=["--no-sandbox"])
    for tab in TABS:
        ctx, page = open_page(browser, f"tab={tab}")
        snap(page, f"{TABS.index(tab) + 1:02d}-{tab}")
        ctx.close()

    # Orders: open a detail panel and run the availability + estimate checks
    ctx, page = open_page(browser, "tab=orders")
    page.get_by_role("row").filter(has_text="FS-1002").first.click()
    page.wait_for_selector("text=Stock and cost")
    page.get_by_role("button", name="Check availability").click()
    page.get_by_role("button", name="Estimate cost").click()
    page.wait_for_selector("text=Estimate")
    page.wait_for_timeout(500)
    snap(page, "11-orders-detail")
    ctx.close()

    # Insufficient stock: confirming FS-1006 must show the shortage, not a success
    ctx, page = open_page(browser, "tab=orders")
    page.get_by_role("row").filter(has_text="FS-1006").first.click()
    page.get_by_role("button", name="Confirm order", exact=True).click()
    page.get_by_role("dialog").get_by_role("button", name="Confirm order", exact=True).click()
    page.wait_for_selector("text=Short by")
    page.wait_for_timeout(300)
    snap(page, "12-orders-confirm-shortage")
    ctx.close()

    # New order dialog
    ctx, page = open_page(browser, "tab=orders")
    page.get_by_role("button", name="New order").click()
    page.wait_for_selector("text=Create draft order")
    snap(page, "13-orders-new")
    ctx.close()

    # Approvals: approve AP-0007 through ConfirmDialog, decided state shows
    ctx, page = open_page(browser, "tab=approvals")
    page.get_by_role("button", name="Approve", exact=True).first.click()
    page.get_by_role("dialog").get_by_role("button", name="Approve", exact=True).click()
    page.wait_for_selector("text=Approved")
    page.wait_for_timeout(300)
    snap(page, "14-approvals-after-approve")
    ctx.close()

    # Inventory item dialogs
    ctx, page = open_page(browser, "tab=inventory")
    page.get_by_role("button", name="Receive", exact=True).first.click()
    page.wait_for_selector("text=Receive stock")
    snap(page, "15-inventory-receive")
    ctx.close()

    # Transcript directives
    ctx, page = open_page(browser, "mode=directives")
    page.wait_for_selector("text=Open in Flower Shop")
    snap(page, "16-directives")
    ctx.close()

    # Error state: backend unreachable, with a retry affordance
    ctx, page = open_page(browser, "tab=orders&fail=1")
    page.wait_for_selector("text=Could not load this")
    snap(page, "17-error-state")
    ctx.close()

    browser.close()

httpd.shutdown()
print(json.dumps({"screenshots": len(shots), "errors": errors, "layout_issues": layout_issues}, indent=1))
sys.exit(1 if errors else 0)
