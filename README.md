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

## Hive sign-in

Sign in to Hive once (email and password, or Google), and apps that support
it sign you in by themselves when you open them inside Hive. LearnLeaf is the first; the
template (`app-template`, "Sign in with Hive") carries it to the rest.

1. An app in a frame says hello to Hive (`postMessage`).
2. Hive's `/api/hive/pass` checks your Hive sign-in and issues a **pass**: a
   JWT signed with Ed25519 by `HIVE_SIGNING_KEY`, made for that one app,
   good for two minutes, carrying your Google-verified email. Hive sends it
   only to that app's own address (`src/hive/bridge.js`).
3. The app's `/api/hive/exchange` checks the pass with `HIVE_PUBLIC_KEY`, finds
   the account with your email (or makes one), and returns a Firebase custom
   token. The app signs in with it.

Apps find you by email, so Hive only vouches for an email it has confirmed:
a new email-and-password account gets a confirmation link, and until it's
clicked, apps are told nobody is signed in (`signedIn` in `src/hive/Hive.jsx`;
`/api/hive/pass` refuses unconfirmed emails too). Use the same email as your
apps. Your app passwords don't matter: Hive proves you own the email.

Each app keeps its own users and data. Apps that don't support it yet ask for
their own sign-in, as before. Sign-in is off until it's set up, and Hive works
the same without it.

**Set it up**

1. Make a Firebase project for Hive. Under **Authentication → Sign-in method**
   turn on **Email/Password** and **Google**, and add
   `fridge-board-7u23.netlify.app` under **Settings → Authorized domains**. Add a web
   app and copy its config.
2. Run `node scripts/hive-keys.mjs` to get `HIVE_SIGNING_KEY` and `HIVE_PUBLIC_KEY`.
3. In this site's Netlify environment: `VITE_HIVE_FIREBASE_API_KEY`,
   `VITE_HIVE_FIREBASE_AUTH_DOMAIN`, `VITE_HIVE_FIREBASE_PROJECT_ID`,
   `VITE_HIVE_FIREBASE_APP_ID` and `HIVE_SIGNING_KEY`. Redeploy.
4. In each app that supports it (LearnLeaf so far): `HIVE_APP_ID` (its id in
   `src/config/catalog.js`), `HIVE_PUBLIC_KEY`, and
   `VITE_HIVE_ORIGIN=https://fridge-board-7u23.netlify.app`. It also needs
   `FIREBASE_SERVICE_ACCOUNT`, which LearnLeaf already has. Redeploy.

Household-only apps can set `HIVE_NEW_ACCOUNTS=off`, so only people who already
have an account get in.

## Roadmap

1. **Home screen** with folders, dock, widgets and the board as an app. *(done)*
2. **One Hive sign-in.** *(built: Hive, app-template, LearnLeaf; needs the
   setup above)* Next: the other Firebase apps from the template module, and
   a NextAuth version for GalaxyFarm.
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
npm test    # home screen layout, Hive passes, sign-in checks
node scripts/hive-keys.mjs   # Hive sign-in key pair
```

Deploys on Netlify with `netlify.toml` (build `npm run build`, publish `dist`).
See `app-template`'s README for the What's New workflow.
