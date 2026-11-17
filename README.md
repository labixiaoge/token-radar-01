[![Token Launch Radar](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/labixiaoge/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/labixiaoge/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

# Token Launch Radar

A radar for DeFi protocols that record no token yet. It reads a sealed
DefiLlama snapshot, ranks the pre-token protocols by what a launch would be
worth if their record stayed as it is, and shows a farming plan for each one
— so you can find the next launch early instead of reading a TVL table.

Built for the make.fun competition **token-radar-01** ("Build the best token
launch radar"). Entry by **xiaoge-labi** — referral link:
https://make.fun/r/j11gmnzr

## What the radar does

- Covers all **40 watchlist protocols** at $50M+ TVL that record no token,
  plus the **160 largest pre-token protocols below the floor** — 200 rows.
- Ranks them by **implied launch value**, computed only from the snapshot's
  own figures (TVL, 7-day change, listing date, category). No hardcoded list
  of names: run it on a new snapshot and it finds new protocols by itself.
- Gives every protocol a **6-step farming plan** built from its own category,
  chains, TVL and age, with what each step costs and how long it takes.
- Ships a static dashboard (no network): sortable, filterable board, a
  detail view per protocol with the value maths and the farm plan, and deep
  links via `#category=`, `#chain=`, `#search=` and `#detail=`.

## The value model

```
implied_value = TVL × category ratio × growth factor × age factor
```

- **Category ratio** — the median market-cap/TVL of the tokenized protocols
  in that category (see `category_ratios.json`: Dexs ~0.35, Lending ~0.13,
  Derivatives ~1.60). A category with no median falls back to the global
  median 0.308. The ratio used is clamped to [0.05, 2.0], so Prediction
  Market's raw 7.36 counts as 2.0.
- **Growth factor** — from the 7-day TVL change: `1 + clamp(change, -50, 100)
  / 200`, then clamped to [0.75, 1.5]. No change reported means 1.0.
- **Age factor** — from the days since DefiLlama first listed the protocol:
  under 6 months 0.9×, over 2 years 1.1×, otherwise 1.0. Unknown date means
  1.0.

The result is a rough yardstick, not a forecast, and the board says a
protocol *records* no token — never that it has none.

## How to run it

```sh
node main.ts --input <snapshot.json> --output out
```

- `--input` defaults to `/input` (a directory holding `snapshot.json`, or the
  file itself), falling back to a bundled `input/snapshot.json` if present.
- `--output` defaults to `$MAKEFUN_OUTPUT_DIR`, else `./out`.
- Node 22+, standard library only — nothing to install.

Outputs: `out/board.json` (the 200 ranked rows), `out/dashboard/` (the page
plus its data), `out/screenshots/` (the three screenshots), and
`out/dossier.json` (written last, from `vendor/makefun-board.ts`).

## Files

- `main.ts` — the program: reads the snapshot, builds the board, writes all
  outputs, validates the board before writing.
- `category_ratios.json` — the category median mcap/TVL table the model uses.
- `dashboard/index.html`, `dashboard/app.css`, `dashboard/app.js` — the static
  dashboard. `app.js` re-implements the farm-plan rules so the page's plan
  matches the board's.
- `screenshots/` — the three screenshots: the board, a protocol detail view,
  a filtered view.
- `vendor/makefun-board.ts` — the kit's dossier library (unchanged).
- `LICENSE` — MIT.
