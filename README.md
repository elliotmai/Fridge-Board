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

`netlify/functions/board.mjs` serves `GET /api/board`. It fetches every app on
the server, so tokens stay in Netlify's environment and never reach the tablet.
`src/data/sources.js` turns that into what the board shows. A section that isn't
connected shows sample data labelled **Sample**; one whose app can't be reached
keeps its last good copy, labelled **Not updating**.

| Section | App | Feed | Needs |
| --- | --- | --- | --- |
| Weather | Open-Meteo | forecast at home | `HOME_LAT`, `HOME_LON` |
| Tasks | LearnLeaf | `/api/summary`, `/api/subjects` | `LEARNLEAF_TOKEN` |
| Trips | Wander | `appTrips`, `appTripTravel` | `WANDER_TOKEN`, and those two functions deployed |
| Next breeding group | ZNT | Firestore `sessions` (public read) | nothing |
| Chores, housesitter guide | GalaxyFarm | not built yet | a token-scoped read endpoint in GalaxyFarm |
| Meals, recipes, shopping | KitchenHub | not built yet | a token-scoped read endpoint in KitchenHub |

Also set `HOME_TZ` (defaults to `America/Chicago`). Trip destinations are
geocoded with Open-Meteo to work out how far from home they are.

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
