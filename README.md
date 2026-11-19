# Hive

Every app in one home screen. It looks and works like a phone's home screen:
app icons, folders, a dock and widgets, all rearrangeable. Fridge Board is one
of its apps, and still runs the kitchen tablet exactly as before.

**Stack:** Vite + React, built from `app-template` (What's New, PWA auto-update,
offline toast, pull-to-refresh on phones, Ticketbooth feedback link).

## The home screen

| | |
| --- | --- |
| **Open an app** | Tap it. Fridge Board runs inside Hive; every other app opens full screen in a frame, with **Home**, **Reload** and **Open in its own tab** along the top. The open app is in the address (`#kitchenhub`), so the phone's back gesture goes home. The three most recent apps stay loaded, so switching back is instant. |
| **Rearrange** | Press and hold anything (or tap **Edit**). Drag to move, including in and out of the dock. Rest one app on another to make a folder; rest on a folder to add to it. The minus badge takes an app off the home screen, back to the App Library. Arrow keys move the focused icon. |
| **Add** | **Edit → Add** lists every app and widget not on the home screen, and who each app is for. |
| **Widgets** | Today (clock, weather), Chores, Tonight, Shopping, Next trip, Breeding and Tasks. They read the same `/api/board` feed as the board, so they're live wherever the board is, and labelled **Sample** where it isn't. Tapping one opens its app. |
| **Settings** | The sliders button: what Hive opens to, going back to the board when left alone, theme, reset layout. |

The layout is saved on each device for now (`src/hive/layout.js`, tested in
`layout.test.js`). It moves to your account with Hive sign-in.

### The fridge tablet

A screen 760px or wider that already had the board key is treated as the fridge
tablet: it opens straight to Fridge Board and drifts back to it when left alone
(2 minutes on the home screen, 15 in another app). The grid button in the board's
header goes to the home screen. Both are switchable in Hive settings. Local
storage keys still start with `fridge-board.`, so the tablet keeps its key and
settings through the rename.

### Board layouts

| Where | What happens |
| --- | --- |
| **Fridge tablet** (760px and wider) | Everything on one screen. Tick chores and shopping items, cook from step cards with timers, all in place. Returns to the top of the board after 2 minutes untouched. |
| **Phone** | Sections stack. Each section, trip and recipe links through to the app that owns it. |

## Apps

Every app is listed once in `src/config/catalog.js`: name, address, icon,
colour, and `audience` (who can add it once Hive has accounts: anyone,
household, only you, or by invite). Board deep links stay in `src/config/apps.js`.

| App | Address | Who | Notes |
| --- | --- | --- | --- |
| Fridge Board | built in | Household | |
| GalaxyFarm | galaxyfarm.netlify.app | Household | Uses NextAuth, not Firebase |
| ZNT | zntmanager.netlify.app | Household | |
| Cattle Graph | cattle-registrations.netlify.app | Household | Opens in its own tab (`X-Frame-Options: DENY`) |
| KitchenHub | mykitchenhub.netlify.app | Anyone | |
| Let's Eat | lets-go-eat.netlify.app | Anyone | |
| Pool Heater | pool-heater-monitor.netlify.app | Household | |
| Property Care | landlord-property-maintenance.netlify.app | Anyone | |
| Our Den | ourden.netlify.app | By invite | Opens in its own tab (`X-Frame-Options: DENY`) |
| Wander | wander-tripplanner.netlify.app | Anyone | |
| AeroLogger | aero-logger.com | Anyone | |
| LearnLeaf | learnleaf-organizer.netlify.app | Anyone | |
| Journal Together | journaltogether.netlify.app | Anyone | |
| StimulTrack | stimultrack.netlify.app | Anyone | |
| Drink Tracker | alcoholtracker.netlify.app | Anyone | |
| Side Quest | side-quest-games.netlify.app | Anyone | |
| Muster | muster-dashboard.netlify.app | Only you | |
| Feedback | ticketbooth.netlify.app | Anyone | Ticket Booth, built into Hive |

Framed apps each ask for their own sign-in once inside Hive, until step 2.

## Roadmap

1. **Home screen** with folders, dock, widgets and the board as an app. *(done)*
2. **One Hive sign-in.** Hive gets its own Firebase project for accounts. Each
   app gets a small function that swaps a Hive sign-in for its own (Firebase
   custom tokens), so nobody signs in twice. Added to `app-template` first.
   GalaxyFarm needs a NextAuth version.
3. **Manifests.** Each app publishes its widgets, actions and events, so Hive
   stops hard-coding them.
4. **Event hub.** Apps react to each other: a Wander trip turns on GalaxyFarm
   sitter mode, ZNT dates warn Wander, meal plans skip nights away.
5. **New-user app picker**, filtered by `audience`.

One custom domain with a subdomain per app (hive.example.com,
kitchen.example.com…) makes framed sign-ins far more reliable, because
browsers treat `*.netlify.app` sites as unrelated and limit their storage
inside frames.

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
npm test    # home screen layout rules
```

Deploys on Netlify with `netlify.toml` (build `npm run build`, publish `dist`).
See `app-template`'s README for the What's New workflow.
