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

`src/data/sources.js` is the only place that knows. Today it returns the sample
data in `src/data/sample.js`. Each section will move to a Netlify function that
holds that app's token server-side, so nothing secret ships to the tablet:

| Section | App | Feed |
| --- | --- | --- |
| Chores, housesitter guide, weather | GalaxyFarm | needs a token-scoped read endpoint |
| Meals, recipes, shopping | KitchenHub | needs a token-scoped read endpoint |
| Tasks | LearnLeaf | `GET /api/summary`, `GET /api/subjects` |
| Trips | Wander | `appTrips`, `appTripTravel` |
| Next breeding group | ZNT | Firestore `sessions` |

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
