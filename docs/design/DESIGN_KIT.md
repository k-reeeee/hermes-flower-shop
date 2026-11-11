# Flower Shop — Design Kit v1.0

The single reference for how the Flower Shop workspace looks, moves and adapts.
Code lives in `desktop/src/lib/tokens.js` (values) and `desktop/src/lib/styles.js`
(the one stylesheet). Visual specimen: `docs/design/design-kit.html`.

---

## 1. Principles

1. **Answer first, detail second.** Every page opens with the one sentence or number
   that answers "am I OK right now?". Lists and tables come after.
2. **The shop is alive.** Orders are bouquets, stations are places, the team is people.
   Use the flower metaphor where it speeds reading (bloom = today's orders), never
   where it hides a number.
3. **Calm by default, loud only when it matters.** Graphite surfaces, one brand rose,
   semantic colour only on things that need action. Green = fine, amber = soon,
   red = act now.
4. **Host-native.** Surfaces, text and controls come from Hermes theme variables and
   SDK components, so the plugin follows any theme (light or dark). Brand colour is
   an accent, never a background wash.
5. **Motion explains change.** Animate *state transitions* (a number grows, a bouquet
   moves station, a card is approved). No looping animation on chrome or titles.
6. **Same story at every size.** A phone sees the same information, re-stacked — never
   a reduced feature set.

---

## 2. Colour

### 2.1 Host tokens (surfaces, text, semantic) — always via `var()`

| Token | Var | Use |
|---|---|---|
| text-1 | `--ui-text-primary` | titles, values |
| text-2 | `--ui-text-secondary` | body |
| text-3 | `--ui-text-tertiary` | labels, meta |
| text-4 | `--ui-text-quaternary` | hints, timestamps |
| line | `--ui-stroke-secondary` | hairlines, card borders |
| fill | `--ui-bg-tertiary` | inputs, tracks, chips |
| accent | `--ui-accent` | focus ring, selected tab, primary buttons (host) |
| ok / warn / bad | `--ui-green` / `--ui-yellow` / `--ui-red` | semantic state only |

Surface recipe: `color-mix(in srgb, var(--ui-bg-tertiary) 35%, transparent)` for cards,
55% for raised (hover) cards. This keeps cards readable on both themes.

### 2.2 Brand

| Name | Hex | Use |
|---|---|---|
| **Rose** (brand) | `#E07A93` | logo bloom, hero accents, "on track" petals, primary data series |
| Rose soft | `rose @ 16%` | brand chips, selected rows |
| Kraft | `#D8B98D` | secondary data series (expenses), wrapping in 3D |
| Leaf | `#6FB07A` | done / delivered petals, growth sparklines |

### 2.3 Station palette (categorical — one hue per stage of the flow)

| Station | Hue | Hex |
|---|---|---|
| Incoming | lavender | `#B9A6E8` |
| Prep | apricot | `#F2B97E` |
| Assembly | rose | `#F09AAE` |
| Quality | mint | `#8FD3AE` |
| Packing | sky | `#93C3EC` |
| Delivery | teal | `#7CCBC0` |

Same hues in the 2D flow strip, the 3D floor pads and labels, so the eye links them.

### 2.4 Bouquet colours (order tokens)

`red #E0566D · pink #F3A5BF · white #FBF8F3 · yellow #F3C444 · peach #F6B48F ·
lilac #C9B8E8 · purple #B59AD6 · orange #F2A07B · blue #9CC6EA · green #9FD39A ·
mixed #E57C93` — from the order's dominant flower.

### 2.5 State mapping (never colour alone — always paired with a word or icon)

| State | Colour | Icon (codicon) | Word |
|---|---|---|---|
| Late / failed | bad | `flame` | "Late" |
| Due soon / pending you | warn | `bell` | "Needs you" / "Due 14:00" |
| On track | rose | `circle-filled` | "On track" |
| Done / paid | ok | `pass-filled` | "Done" |
| Idle / none | text-4 | `circle-outline` | "—" |

---

## 3. Typography

System stack inherited from host. Numbers always `font-variant-numeric: tabular-nums`.

| Role | Size / weight / line | Example |
|---|---|---|
| Display | 28 / 650 / 1.1 | KPI hero value "Rp3.230.000" |
| Title | 20 / 600 / 1.2 | Shop name |
| Heading | 15 / 600 / 1.3 | Page title |
| Section | 12 / 600 / 1.3, text-2, letter-spacing .01em | Card titles |
| Body | 13 / 400 / 1.5 | |
| Small | 12 / 400 / 1.45 | list rows |
| Meta | 11 / 400 / 1.4, text-3 | timestamps, captions |
| Overline | 10.5 / 600 / 1.2, uppercase, .06em, text-3 | KPI labels |

Compact (< 600px container): Display 24, Title 18.

## 4. Space, radius, elevation

- **Spacing scale (4-pt):** 2 · 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40.
  Page padding 20 (wide) / 14 (compact). Card padding 14 / 12. Grid gap 12 / 10.
- **Radius:** chip 999 · control 6 · card 12 · hero 16 · 3D frame 14.
- **Elevation:** flat by default (1px line). Hover = surface +20% fill and
  `translateY(-1px)`; overlays only via SDK Dialog. No drop-shadow stacks.
- **Hit targets:** ≥ 32px desktop, ≥ 40px under `pointer: coarse`.

## 5. Iconography

Codicons from the SDK (`Icon`) for UI verbs. One brand glyph: the 5-petal **bloom**
(SVG, `BloomMark`). Station glyphs (codicons): incoming `mail`, prep `beaker`,
assembly `heart`, quality `pass`, packing `package`, delivery `rocket`.

## 6. Motion

| Token | Value | Use |
|---|---|---|
| `--fs-dur-1` | 120ms | hover, press |
| `--fs-dur-2` | 220ms | state change, expand |
| `--fs-dur-3` | 420ms | entrance (fade-up 8px) |
| `--fs-dur-4` | 900ms | count-up numbers, bloom petals growing |
| `--fs-ease-out` | `cubic-bezier(.2,.8,.2,1)` | default |
| `--fs-ease-pop` | `cubic-bezier(.34,1.56,.64,1)` | petals, badges arriving |

Rules
- Entrance: sections fade-up with a 40ms stagger, **once per mount** (not on poll).
- Numbers count up from the previous value, not from 0, on data change.
- Polls never flash: no spinner swap; a quiet "updated 12:30" only.
- No infinite loops in 2D UI. The 3D floor may idle-animate (it is the "window").
- `prefers-reduced-motion: reduce` → all durations 0, 3D idle motion off, flights
  become instant.

## 7. Layout & responsiveness

The page root is a **CSS container** (`container-type: inline-size`), so the layout
follows the *pane* width, not the window (Hermes panes can be narrow on a wide screen).

| Size | Container width | Navigation | Grid |
|---|---|---|---|
| Compact (phone) | < 600 | icon tabs, horizontal scroll, active label shown | 1 column, KPIs 2-up |
| Medium (tablet / split pane) | 600–959 | icon + label tabs, scroll | 2 columns |
| Wide (desktop) | 960–1279 | full labelled tabs | 12-col: 8 + 4 |
| XL | ≥ 1280 | full | 12-col + side rail |

- Tables become stacked "row cards" in compact.
- Side panels (order detail, floor selection) become bottom sheets / stacked below in
  compact.
- Touch: `pointer: coarse` raises hit targets to 40px; 3D floor supports one-finger
  rotate, two-finger pinch, tap to select, double-tap reset.

## 8. Components (spec)

| Component | Anatomy | Notes |
|---|---|---|
| **TodayHero** | bloom chart · day sentence · 3 key numbers | the Overview answer. Sentence is generated from data ("5 bouquets due today — 2 late, 1 ready to hand over.") |
| **Bloom** | one petal per order due today, ordered by due time clockwise from 12 o'clock; petal colour = state; centre = done/total | click petal → order. Petals grow in with `ease-pop`. |
| **KpiTile** | overline label · display value · delta/sub · optional spark | whole tile clickable, routes to the filtered page |
| **FlowStrip** | 6 station nodes on a connecting stem, bouquet dots per order, count + late badge | the production pipeline at a glance; click → Shop Floor |
| **DayTimeline** | hour axis 07–21, now-marker, order pins at due time | shows *when* the pressure is |
| **ActionCard** | severity icon · title · detail · inline primary action | "Needs you" list; approvals approve inline |
| **MoneyCard** | paid-vs-expected progress · 7-day booked/paid sparkline | labelled "estimate" where estimated |
| **StockMeter** | name · bar (available vs reorder line) · days-fresh dot | |
| **StationChip** | station hue dot · label · count | shared by floor + flow |
| **Card** | section title · right slot · body | radius 12 |

## 9. Data visualisation rules

- Max 2 series per chart. Series 1 = rose (booked/expected), series 2 = leaf (paid).
- Always print the headline number next to a chart; charts support, not replace.
- Money: `Rp3.230.000` (dot grouping, no space). Compact money in tight tiles:
  `Rp3,2 jt`.
- Estimates carry the word "estimate" in the label.

## 10. 3D Shop Floor — art direction

- **Style:** low-poly, flat-shaded "floating garden island" diorama; soft pastel
  materials, faceted silhouettes, cute proportions (big heads, small bodies).
- **Engine:** three.js (bundled, tree-shaken). Canvas2D renderer kept as fallback
  when WebGL is unavailable.
- **Poly budget:** ≤ 25k triangles total, static scenery merged into few draw calls
  (vertex colours), ≤ 60 draw calls.
- **Lighting:** hemisphere (sky `#fff4ec` / ground `#9cc28c`) + warm key light with
  soft PCF shadows (1024², off on compact/low-power) + rim fill. ACES tone mapping.
- **Cast:** cottage shop with striped rose awning and window boxes · six stations with
  hue-coded pads and a signature prop each · bouquet tokens (kraft cone + blooms in the
  order colour) · **Pip**, the flower-pot mascot (walks to the latest change, blinks,
  waves) · delivery van that drives off and back · butterflies · drifting petals ·
  clouds under the island.
- **Feedback:** hover = token lifts + outline ring; selected = rose ring + bounce;
  late = red ring + small flame marker (static colour, gentle bob only in 3D).
- **Labels:** HTML pills projected from 3D (station hue dot, name, count, late),
  icon-only in compact.
- **Performance:** render only when visible; cap DPR 2 (1.5 compact); 30fps idle,
  60fps while interacting; dispose everything on unmount.

## 11. Voice

Plain business words, the owner's language: "Needs you", "Due 14:00", "Ready to
hand over", "Paid Rp400.000 of Rp3.230.000 expected". No jargon (no "entity",
"payload", "status code"). Indonesian names and money formats as entered.
