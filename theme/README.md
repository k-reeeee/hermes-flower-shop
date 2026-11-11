# Anthousa — the flower-shop skin for the Hermes GUI

One YAML file per polarity, dropped into `$HERMES_HOME/skins/`. It themes the **desktop GUI**,
the **TUI** and the **CLI** from the same palette, and it carries the chat layout/readability
layer we built earlier in the `claude-readability` skins.

* `anthousa.yaml` — **Marble daylight.** Blush marble, rose-gold, laurel. GUI-first.
* `anthousa-night.yaml` — **Plum dusk.** Aubergine night, rose-gold, moonlight. Same layout layer.

## Nothing applies itself

This theme ships **inside the Flower Shop plugin**, and it is offered — never switched on. A
theme that changes under someone while they install a plugin is a bad surprise, so there is no
code path anywhere in the plugin that sets `display.skin`: not on install, not on first run, not
on the onboarding beat. The only two ways it changes are:

1. **The owner clicks it.** Onboarding has an optional **Theme** beat. It shows both variants
   plus a "Keep my current theme" button; that click applies it, and an **Undo** appears
   afterwards that switches straight back to the skin they had before.
2. **They type it** — the commands in the next section.

Preparing the files and choosing the theme are deliberately separate steps: Hermes' own
`config.set {key: "skin"}` RPC performs the switch (it writes `display.skin` and broadcasts
`skin.changed`, so every surface repaints live). The plugin only copies the YAMLs into the
skins directory and records the choice in its own database.

## Apply / roll back

```bash
./install-theme.sh                  # copy both skins; switches nothing
./install-theme.sh --activate       # copy both, then switch to the marble twin
./install-theme.sh --activate anthousa-night
./restore-theme.sh                  # back to whatever this machine had before
```

Or by hand — one command each, no hand-edited YAML:

```bash
hermes config set display.skin anthousa
hermes config set display.skin anthousa-night
hermes config set display.skin claude-readability-dark   # the pre-garden theme
```

The gateway watches the skin file and repaints every surface within ~1s. No restart.

`backup/` holds byte copies of what was active before this test
(`claude-readability-dark.yaml`, `claude-readability.yaml`, `active-skin.txt`, `skin-list.txt`),
so `restore-theme.sh` works even if the originals are later edited or deleted.

`preview.html` is a self-contained side-by-side mock of both palettes (every hex and contrast
ratio on it is derived from these YAML files, not typed by hand). `preview.png` is its render.

## Palette

Colour is **semantic** in a Hermes skin: one key colours every element that plays that role.

| Key | Anthousa | Dusk | Role | Contrast on its own bg |
|---|---|---|---|---|
| `background` | `#FAF6F3` | `#231A21` | app + thread surface | — |
| `ui_text` | `#3B2F35` | `#F4E9E4` | body, user messages | 11.9:1 · 14.2:1 |
| `banner_dim` | `#7C6A72` | `#9C8A8F` | muted meta, labels | 4.7:1 · 5.2:1 |
| `ui_accent` | `#A25468` | `#E8A2B0` | **brand** — buttons, links, focus, headings | 4.8:1 · 7.9:1 |
| `ui_border` | `#D8C4BB` | `#46363F` | hairlines, card edges | — |
| `ui_label` | `#8A6A2F` | `#E5C07B` | **antique gold** — chrome + rules only | 4.7:1 · 9.8:1 |
| `ui_ok` | `#3F7A56` | `#86CFA1` | success — laurel | 4.7:1 · 8.5:1 |
| `ui_warn` | `#96650F` | `#E8B44C` | warning — ochre amber | 4.7:1 · 8.9:1 |
| `ui_error` | `#C2415A` | `#EF6F6F` | error — rose-red | 4.7:1 · 5.3:1 |

Every value that lands as **text** clears WCAG AA against the surface it sits on. The two that
must be exact are the accents: the desktop runs `ensureContrast(accent, sidebar, 4.5)`, so an
accent picked *below* 4.5:1 gets silently nudged to a different colour than the file says.
Both accents here sit above the threshold and pass through untouched — the file is the truth.

Amber is the one value that had to be darkened: the natural `#B0741F` measured only **3.6:1** on
marble, so the light skin uses `#96650F`. It still reads as warning, and it sits next to the
antique gold rather than fighting it.

### Why pink-gold and not green

The brief was an ancient Greek garden leaning feminine. The reading was:

* **Marble, not meadow.** The base is blush marble (`#FAF6F3`) — stone and light, not foliage.
  It reads as temple terrace rather than garden centre, which keeps it professional.
* **Rose-gold leads, gold decorates.** One accent can be the GUI primary, so it is the rose
  (`#A25468` / `#E8A2B0`). Gold cannot be body text on a light surface — `#C9A227` measures
  2.3:1 on marble, invisible — so gold is demoted to decoration: the column edge on each turn,
  section rules, heading underlines, banner chrome. It reads as gilding, not as text.
* **Green survives only as success.** `ui_ok` stays a recognisably green laurel, because a
  status colour that isn't green costs more than the palette gains. Everything else green is gone.

That is the one judgement call worth overruling: if you want **more gold**, move `ui_accent` to
`#8A6A2F` (gold becomes the brand on buttons and links) and put the rose in `ui_label`. If you
want **more pink**, `#B76E79` is the classic rose-gold but it measures 3.5:1 on marble — the
desktop would darken it to roughly `#A25468` anyway, so authoring it is a lie the app hides.

## Layout + visibility layer (`customCSS`)

Carried over from the `claude-readability` skins, then extended:

| What | Knob | Value |
|---|---|---|
| Centred reading column — thread **and** composer | `--composer-width` | `48rem` |
| Air between prose paragraphs | `--paragraph-gap` | `0.85rem` |
| **Chat-text margin** — one gutter for prose, tools, todos, thinking | `--message-text-indent` | `1.4rem` (app default `0.75rem`) |
| **Chat-text border** — gold column edge + right gutter on each assistant turn | `border-left` / `padding-right` on `[data-slot='aui_assistant-message-content']` | 2px gold @38% · `0.9rem` |
| Body size for long reading | `--conversation-text-font-size` | `0.9375rem` |
| Serif prose line height | `line-height` on assistant content | `1.6` |
| Grecian detail | `hr`, `blockquote`, `h2`, table head, links | gold rules, rose wash, gold heading underline |
| Code/tables stay inside the column | `overflow-x` on `pre, table` | — |

Colour of the garden layer lives in two CSS vars at the top of the block — `--garden-gold` and
`--garden-rose` — so retuning the whole treatment is two lines.

**Fixed along the way.** The old block set `--conversation-text-base-size`, which **no build
contains** — the AUI reads `--conversation-text-font-size`. That improvement was doing nothing.
Both names are now set, so it works whichever name a build expects.

**Knobs to dial back.** Prefer no rule on tool blocks? Add `.aui-md` to the `border-left`
selector. Want a quieter edge? Drop `--garden-rule` to `1px` and 26%.

## Portability

* The **desktop GUI** reads only the `colors:` block, so both files render correctly on any
  machine as-is.
* A skin's `colors:` are also what the **CLI/TUI** paint with, and a light palette is only
  legible on a light terminal. On a dark terminal use `anthousa-night`; that is exactly why the
  twin exists. (Same reason `claude-readability` had a `-dark` companion.)
* `customCSS` is desktop-only (the CLI has no `<style>` injection) and is capped at 32 KiB —
  these blocks are ~3.6 KB.
* The skin `name:` must match the filename, and must not collide with a built-in
  (`mono`, `slate`, `cyberpunk`, `nous`, `midnight`, `ember`).
