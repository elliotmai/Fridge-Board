# Hive design

Hive is the household's home screen: a phone in a pocket, and a tablet on the
fridge that people read from across the kitchen. The look follows from that:
painted, flat and calm, like enamel signs on a barn wall, with type that reads
at three metres.

Tokens live in `src/styles/tokens.css` (one file, light and dark). `board.css`
and `hive.css` use them; nothing else should pick its own colour, size, radius
or timing.

## Principles

1. **Read across the room.** The clock, tonight's dinner and counts are the
   largest things on any screen. Everything else steps down clearly.
2. **Colour says which app.** Farm green, kitchen beet, coming-up blue, and
   each app's own icon colour. Hive's own colour (honey) is kept for focus and
   the current selection, nowhere decorative.
3. **Tone, not shadow.** Surfaces separate by tone (paper, surface, sunken).
   Only things that float over everything (menus, the drag ghost, sheets on a
   tablet) get the single `--shadow-float`. No blur, no glass.
4. **Motion answers a touch.** Nothing moves on its own except the clock and a
   finished timer. Presses respond in under 100 ms; things that open grow from
   where they came from. No overshoot, no jiggle. `prefers-reduced-motion`
   turns every transition into an instant change.
5. **Plain words, sentence case.** No all-caps labels, no tracked eyebrows.

## Type

[Atkinson Hyperlegible Next](https://fonts.google.com/specimen/Atkinson+Hyperlegible+Next),
one family, weights 400 to 800. It was drawn for low-vision readers: open
counters, distinct 1/l/I and 0/O, which is what a wall display needs. Numbers
are tabular everywhere.

| Token | Size | Use |
| --- | --- | --- |
| `--t-xs` | 12px | Captions under a row, freshness |
| `--t-sm` | 14px | Secondary lines, section labels |
| `--t-md` | 16px | Body, rows, inputs (16px stops iOS zoom) |
| `--t-lg` | 20px | Sheet and zone titles |
| `--t-xl` | 28px | Big numbers in widgets, tonight's dinner on phones |
| `--t-2xl` | 40px | Tonight's dinner on the fridge, cook-mode step |
| `--t-clock` | clamp(44px, 7vw, 96px) | The clock |

Weights: 400 body, 600 labels and row titles, 800 the clock and big numbers.
Section labels are 14px/600 in `--muted`, sentence case.

## Colour

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--bg` (paper) | `#E8ECE6` limewash | `#121513` | Page |
| `--surface` | `#FAFBF8` | `#1D221E` | Widgets, rows, sheets |
| `--sunken` | `#DDE2DA` | `#0C0E0D` | Inputs, tracks, segmented controls |
| `--ink` | `#1C2420` | `#E7EBE6` | Text |
| `--muted` | `#525C55` | `#A3ADA6` | Secondary text (AA on paper and surface) |
| `--line` | `#C9D0C6` | `#323A34` | Hairlines between rows |
| `--honey` | `#8A5A00` | `#E7B04A` | Focus, selection, Hive's own accent |
| `--farm` | `#2C6A43` | `#7FCB95` | GalaxyFarm, chores |
| `--kitchen` | `#8E3553` | `#E893B1` | KitchenHub, meals, shopping |
| `--ahead` | `#2A5890` | `#93B6EE` | Calendar, trips, to do |
| `--late` | `#B3261E` | `#FF8F80` | Late, overdue, destructive |
| `--warn` | `#7F5200` | `#E9B65C` | Not updating, use soon |

Badges are ink on paper-white (`--badge-bg`, `--badge-fg`), not alarm red: a
count of chores is information, not an emergency.

## Space and shape

Spacing steps of 4: `--s1` 4, `--s2` 8, `--s3` 12, `--s4` 16, `--s5` 24,
`--s6` 32, `--s7` 48.

Radii follow hierarchy, smallest inside, largest outside: `--r-xs` 6 (checks,
tags), `--r-sm` 10 (buttons, inputs, rows), `--r-md` 16 (widgets, zones on
the fridge tablet, lists), `--r-lg` 24 (sheets, dock). App icons are
squircles at 26% with a 2px darker lower edge, like a painted enamel tile.

Tap targets are 44px or more everywhere (40px only on the small Fire tablet
layout, where the whole board must fit one screen).

## Motion

| Token | Value | Use |
| --- | --- | --- |
| `--d-press` | 90ms | Press-in on any button |
| `--d-quick` | 160ms | Colour and state changes, checks |
| `--d-move` | 240ms | Menus, folders, sheets in |
| `--d-zoom` | 340ms | An app growing out of its icon |
| `--ease-out` | cubic-bezier(.2, 0, 0, 1) | Things arriving |
| `--ease-in` | cubic-bezier(.4, 0, 1, 1) | Things leaving |

Press feedback is a 0.96 scale and a darker tone, never a bounce. Edit mode
shows a dashed outline around each tile and the remove buttons; icons hold
still.

## Focus

Every focusable element shows a 3px `--honey` outline, 2px out, on
`:focus-visible`. Honey on paper and on dark both clear 3:1.
