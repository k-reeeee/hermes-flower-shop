#!/usr/bin/env python3
"""Regenerate the theme previews from the skin YAML files.

Every hex, every derived surface and every contrast ratio on the pages is
computed from `anthousa.yaml` / `anthousa-night.yaml` at run time, so a preview
can never drift from the theme it documents.

    python3 make-preview.py            # write preview.html + preview-dark.html
    python3 make-preview.py --png      # ...and render both to PNG via Chrome

Surfaces are derived exactly as the desktop does in `src/themes/skin.ts`
(card = mix(bg, fg, .04), bubble = mix(bg, accent, .18), ...), so the swatch
rows show what the app will actually paint, not an idealised set.

`preview-dark.html` puts the page background at the skin's own background, so
the surfaces are judged in situ instead of against a darker backdrop that
flatters them. This is the page to trust for a dark palette.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover
    sys.exit("needs pyyaml: pip install pyyaml")

HERE = Path(__file__).resolve().parent
CHROME = next(
    (c for c in ("/home/openclaw/.local/bin/google-chrome",
                 "/usr/bin/google-chrome", "/usr/bin/chromium-browser",
                 shutil.which("google-chrome") or "", shutil.which("chromium") or "")
     if c and Path(c).exists()),
    "",
)


# ── colour maths ─────────────────────────────────────────────────────────────

def _lin(c: float) -> float:
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def lum(h: str) -> float:
    r, g, b = _rgb(h)
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def ratio(a: str, b: str) -> float:
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return round((hi + 0.05) / (lo + 0.05), 2)


def mix(a: str, b: str, amt: float) -> str:
    """sRGB mix, matching CSS color-mix(in srgb, a (1-amt), b amt)."""
    A, B = _rgb(a), _rgb(b)
    return "#%02X%02X%02X" % tuple(round(A[i] + (B[i] - A[i]) * amt) for i in range(3))


def load(name: str) -> dict:
    return yaml.safe_load((HERE / f"{name}.yaml").read_text())


def derive(c: dict) -> dict:
    bg, fg, acc = c["background"], c["ui_text"], c["ui_accent"]
    dark = lum(bg) < 0.4
    return {
        "bg": bg, "fg": fg, "acc": acc, "gold": c["ui_label"], "dim": c["banner_dim"],
        "line": c["ui_border"], "ok": c["ui_ok"], "warn": c["ui_warn"], "bad": c["ui_error"],
        "dark": dark,
        # mirrors skin.ts
        "sidebar": mix(bg, fg, 0.02), "card": mix(bg, fg, 0.04), "popover": mix(bg, fg, 0.08),
        "bubble": mix(bg, acc, 0.18 if dark else 0.12), "code": mix(bg, fg, 0.10 if dark else 0.06),
        "input": c["completion_menu_bg"],
        # mirrors the alphas the skins themselves pass in customCSS
        "rule_a": "52%" if dark else "38%", "h2_a": "52%" if dark else "32%",
        "wash_a": "16%" if dark else "8%", "thead_a": "18%" if dark else "10%",
    }


# ── page pieces ──────────────────────────────────────────────────────────────

def swatches(d: dict) -> str:
    rows = [("sidebar", d["sidebar"]), ("background", d["bg"]), ("card", d["card"]),
            ("popover", d["popover"]), ("input", d["input"]), ("bubble", d["bubble"]),
            ("border", d["line"]), ("accent", d["acc"]), ("gold", d["gold"]),
            ("muted", d["dim"]), ("ok", d["ok"]), ("warn", d["warn"]), ("error", d["bad"])]
    ring = "rgba(255,255,255,.30)" if d["dark"] else "rgba(0,0,0,.22)"
    return "\n".join(
        f'      <div class="sw"><span class="chip" style="background:{v};box-shadow:inset 0 0 0 1px {ring}"></span>'
        f'<span class="k">{k}</span><span class="hex">{v}</span>'
        f'<span class="cr">{ratio(v, d["bg"])}:1</span></div>' for k, v in rows)


def panel(d: dict, label: str, tone: str) -> str:
    """One skin, themed entirely through --t-* vars so a shared stylesheet can
    paint two different palettes side by side without duplicating rules."""
    vars_ = ";".join([
        f"--t-bg:{d['bg']}", f"--t-fg:{d['fg']}", f"--t-dim:{d['dim']}", f"--t-line:{d['line']}",
        f"--t-acc:{d['acc']}", f"--t-gold:{d['gold']}", f"--t-sidebar:{d['sidebar']}",
        f"--t-bubble:{d['bubble']}", f"--t-code:{d['code']}", f"--t-input:{d['input']}",
        f"--t-rule:{d['rule_a']}", f"--t-wash:{d['wash_a']}",
        f"--t-thead:{d['thead_a']}", f"--t-h2:{d['h2_a']}",
    ])
    ask = ("does the dark one still read as a flower shop?" if d["dark"]
           else "does it still look professional?")
    ans = ("Yes — the garden at night. Aubergine stone instead of marble, rose-gold carries the "
           "brand, moonlight gold does the gilding." if d["dark"] else
           "Yes — blush marble instead of meadow, rose-gold carries the brand, antique gold does the gilding.")
    quote = ("At dusk the roses are the only thing that keeps its colour." if d["dark"]
             else "Nothing gold can stay — except the hairline.")
    return f'''  <section class="panel" style="{vars_}">
    <div class="chrome"><span class="dot"></span><b>{label}</b><span class="dim">{tone} · default · deepseek-v4.1-flash</span></div>
    <div class="thread">
      <div class="msg"><span>{ask}</span></div>
      <div class="turn">
        <p>{ans}</p>
        <h2>Reading column</h2>
        <p>Identical geometry in both skins, so switching polarity never moves the text — only the palette changes.</p>
        <blockquote>{quote}</blockquote>
        <table><thead><tr><th>Token</th><th>Value</th></tr></thead><tbody>
        <tr><td>accent</td><td>{d["acc"]}</td></tr><tr><td>gold</td><td>{d["gold"]}</td></tr></tbody></table>
        <p>inline <code>--composer-width: 48rem</code> stays inside the column.</p>
      </div>
    </div>
    <div class="sws">
{swatches(d)}
    </div>
  </section>'''


def styles(page_fg: str, page_dim: str, note_bg: str) -> str:
    return f'''  * {{ box-sizing: border-box; }}
  body {{ margin:0; padding:18px; color:{page_fg};
          font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif; }}
  h1 {{ margin:0 0 4px; font-size:19px; font-weight:650; letter-spacing:.01em; }}
  .sub {{ margin:0 0 15px; color:{page_dim}; font-size:12.5px; max-width:88ch; }}
  .wrap {{ max-width:1010px; margin:0 auto; }}
  .pair {{ display:grid; gap:18px; max-width:1250px; margin:0 auto;
           grid-template-columns:repeat(auto-fit,minmax(430px,1fr)); }}

  .panel {{ background:var(--t-bg); color:var(--t-fg); border:1px solid var(--t-line);
            border-radius:14px; overflow:hidden; min-width:0; }}
  .chrome {{ display:flex; align-items:center; gap:9px; padding:10px 16px;
             background:var(--t-sidebar); border-bottom:1px solid var(--t-line);
             color:var(--t-fg); font-size:12px; }}
  .dot {{ width:8px; height:8px; border-radius:50%; background:var(--t-acc); flex:none; }}
  .chrome b {{ font-weight:600; }}
  .dim {{ color:var(--t-dim); }}
  .thread {{ padding:20px 26px 8px; }}
  .msg {{ display:flex; justify-content:flex-end; margin-bottom:16px; }}
  .msg span {{ background:var(--t-bubble); border:1px solid var(--t-line); color:var(--t-fg);
               border-radius:14px 14px 4px 14px; padding:8px 13px; max-width:76%; font-size:13px; }}

  /* the reading layer under test: gold column edge + 1.4rem gutter + serif prose */
  .turn {{ border-left:2px solid color-mix(in srgb, var(--t-gold) var(--t-rule), transparent);
           padding-left:1.4rem; padding-right:.9rem; }}
  .turn p {{ margin:0 0 .85rem; font-family:"Iowan Old Style",Palatino,"Palatino Linotype",Georgia,serif;
             font-size:15px; line-height:1.6; }}
  .turn h2 {{ margin:1rem 0 .3rem; font-size:14px; font-weight:650;
              font-family:-apple-system,system-ui,sans-serif; padding-bottom:.28rem;
              border-bottom:1px solid color-mix(in srgb, var(--t-gold) var(--t-h2), transparent); }}
  .turn blockquote {{ margin:.6rem 0; padding:.4rem .9rem; font-family:Georgia,serif; font-size:13.5px;
                      border-left:2px solid color-mix(in srgb, var(--t-gold) var(--t-rule), transparent);
                      border-radius:0 8px 8px 0;
                      background:color-mix(in srgb, var(--t-acc) var(--t-wash), transparent); }}
  code {{ background:var(--t-code); border-radius:4px; padding:1px 5px;
          font:11.5px/1.4 ui-monospace,Menlo,monospace; }}
  table {{ border-collapse:collapse; width:100%; margin:.5rem 0 .8rem; font-size:12.5px; }}
  th {{ background:color-mix(in srgb, var(--t-acc) var(--t-thead), transparent);
        text-align:left; font-weight:600; }}
  th,td {{ border:1px solid var(--t-line); padding:4px 8px; }}

  .sws {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(178px,1fr)); gap:6px 16px;
          padding:14px 26px 18px; border-top:1px solid var(--t-line); }}
  .sw {{ display:flex; align-items:center; gap:7px; font-size:11px; min-width:0; }}
  .chip {{ width:14px; height:14px; border-radius:4px; flex:none; }}
  .k {{ color:var(--t-dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }}
  .hex {{ font:10.5px ui-monospace,Menlo,monospace; opacity:.7; }}
  .cr {{ margin-left:auto; font:10.5px ui-monospace,Menlo,monospace; color:var(--t-dim); }}

  .note {{ max-width:1010px; margin:14px auto 0; color:{page_dim}; font-size:12px; }}
  .note code {{ background:{note_bg}; color:{page_fg}; padding:2px 6px; border-radius:5px; }}'''


def page(title: str, intro: str, body: str, css: str, footer: str, bg: str) -> str:
    wrapped = body if 'class="pair"' in body else f'<div class="wrap">\n{body}\n</div>'
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
body {{ background:{bg}; }}
{css}
</style>
</head>
<body>
<h1>{title}</h1>
<p class="sub">{intro}</p>
{wrapped}
<p class="note">{footer}</p>
</body>
</html>
'''


def write_pair(light: dict, dark: dict) -> Path:
    intro = ("Same layout layer in both: centred 48rem column, 1.4rem chat-text gutter, gold column "
             "edge on each assistant turn, Palatino prose at 15px, and the derived surfaces the app "
             "paints. Only the palette changes. The panels sit on a neutral page so they can be "
             "compared — for a dark skin that page flatters the surfaces, so use preview-dark.html "
             "to judge it properly.")
    body = (f'<div class="pair">\n{panel(light, "anthousa", "Marble daylight")}\n'
            f'{panel(dark, "anthousa-night", "Aubergine dusk")}\n</div>')
    out = HERE / "preview.html"
    out.write_text(page("Anthousa — flower-shop skin", intro, body,
                        styles("#e8e4e2", "#a49a99", "#1c1c22"),
                        'Apply: <code>hermes config set display.skin anthousa</code> &nbsp;·&nbsp; '
                        'Dusk twin: <code>hermes config set display.skin anthousa-night</code> &nbsp;·&nbsp; '
                        'Back to Claude: <code>hermes config set display.skin claude-readability-dark</code>',
                        "#101014"))
    return out


def write_dark(dark: dict) -> Path:
    intro = ("The dusk skin judged on its own background — the page wears the same aubergine the app "
             "paints, so no darker backdrop flatters the surfaces. Surface chips are the tokens the "
             "desktop derives from this palette (card, popover, sidebar, bubble, input); the border "
             "token is the one that keeps them from merging into a single field.")
    body = panel(dark, "anthousa-night", "Aubergine dusk")
    out = HERE / "preview-dark.html"
    out.write_text(page("Anthousa Night — dark flower-shop skin", intro, body,
                        styles(dark["fg"], dark["dim"], dark["card"]),
                        'Apply: <code>hermes config set display.skin anthousa-night</code> &nbsp;·&nbsp; '
                        'Day twin: <code>hermes config set display.skin anthousa</code>',
                        dark["bg"]))
    return out


def render(html: Path, png: Path, size: str) -> None:
    if not CHROME:
        print(f"  ! no chrome found, skipped {png.name}")
        return
    data = HERE / ".chrome-data"
    subprocess.run([CHROME, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
                    f"--user-data-dir={data}", "--force-device-scale-factor=1.5", f"--window-size={size}",
                    f"--screenshot={png}", f"file://{html}"],
                   check=False, capture_output=True, timeout=180)
    shutil.rmtree(data, ignore_errors=True)
    print(f"  rendered {png.name}")


def main() -> None:
    light = derive(load("anthousa")["colors"])
    dark = derive(load("anthousa-night")["colors"])
    for out in (write_pair(light, dark), write_dark(dark)):
        print(f"wrote {out.name}")
    if "--png" in sys.argv:
        render(HERE / "preview.html", HERE / "preview.png", "1320,1180")
        render(HERE / "preview-dark.html", HERE / "preview-dark.png", "1080,900")


if __name__ == "__main__":
    main()
