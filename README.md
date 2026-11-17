# Fridge Board

One screen for the kitchen tablet: today's chores, meals and cooking cards,
the shopping list, trips coming up, the next breeding group, and school/life
tasks. It pulls from the other apps rather than storing anything itself.

**Stack:** Vite + React, built from `app-template` (What's New, PWA auto-update,
offline toast, pull-to-refresh on phones, Ticketbooth feedback link).

## Two layouts

| Where | What happens |
| --- | --- |
| **Fridge tablet** (wider than 1000px, landscape) | Everything on one screen. Tick chores and shopping items, cook from step cards with timers, all in place. Returns to the board after 2 minutes untouched. |
| **Phone** (1000px and narrower) | Sections stack. Each section, trip and recipe links through to the app that owns it. A row of app shortcuts sits under the header. |

App URLs and deep-link paths live in `src/config/apps.js`.

## Where the data comes from

`netlify/functions/board.mjs` serves `GET /api/board`, and
`netlify/functions/act.mjs` passes ticks and adds back to the owning app. Both
run on Netlify, so tokens stay in its environment and never reach the tablet.
A section that isn't connected shows sample data labelled **Sample**; one whose
app can't be reached keeps its last good copy, labelled **Not updating**.

| Section | App | Read | Write |
| --- | --- | --- | --- |
| Chores, housesitter guide, home location | GalaxyFarm | `GET /api/board/v1` | `POST /api/board/v1/chores/:id` |
| Meals, recipe cards, shopping, use soon | KitchenHub | `board` function `GET /` | `POST /shopping`, `POST /shopping/:id` |
| Tasks | LearnLeaf | `/api/summary`, `/api/subjects` | none |
| Trips | Wander | `appTrips`, `appTripTravel` | none |
| Next breeding group | ZNT | Firestore `sessions` (public read) | none |
| Weather | Open-Meteo | forecast at the GalaxyFarm location | none |

### Environment (Netlify → Project configuration → Environment variables)

| Variable | What it is |
| --- | --- |
| `BOARD_ACCESS_KEY` | **Required.** Any long random string. Every device enters it once (or opens the board once with `?key=...`). Without it the API refuses, so nobody else can read your data or tick your chores. |
| `GALAXYFARM_TOKEN` | Fridge Board token minted in GalaxyFarm |
| `KITCHENHUB_TOKEN` | Token from KitchenHub's `scripts/make-api-token.mjs` |
| `LEARNLEAF_TOKEN` | Token from LearnLeaf's `scripts/make-api-token.mjs` (add its hash to `apiTokenHashes`) |
| `WANDER_TOKEN` | Wander → Account → Connected apps |
| `HOME_LAT`, `HOME_LON`, `HOME_TZ` | Optional. Only used if GalaxyFarm has no location set. |

## Rules the board follows

- **Trips:** only ones starting within 30 days, or under way.
- **Away:** only when the current trip is more than 75 miles from home. That
  shows a banner and turns on housesitter mode (it can be switched off).
- **Breeding:** only the next session, and only if its CIDRs go in within 30
  days. Warns when a trip overlaps CIDR, Lutalyse or breeding days.

All three numbers are adjustable in Board settings.

## Develop

```bash
npm install
npm run dev
```

Deploys on Netlify with `netlify.toml` (build `npm run build`, publish `dist`).
See `app-template`'s README for the What's New workflow.
