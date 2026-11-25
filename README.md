# Hive

Every app in one home screen, built around the household's day: what's
happening now, what's next, what needs someone, and every app one tap away.
Fridge Board is one of its apps, and still runs the kitchen tablet exactly as
before.

**Stack:** Vite + React, built from `app-template` (What's New, PWA auto-update,
offline toast, pull-to-refresh on phones, Ticketbooth feedback link).

## The home screen

One page, read from wherever you are: a phone in a hand (one column, pinned
apps and search under the thumb), a tablet (two columns), or a wall display
across the room (1920x1080 or 1080x1920: the whole day on one screen that
never scrolls, in bigger type).

| | |
| --- | --- |
| **Header** | The time (Overpass numerals, plain zero), the date, the next timed thing today (or what's on now), and the weather. |
| **Day line** | The chore slots from 5 am to midnight, end to end, with a mark for now and today's timed events and tasks pinned where they happen. Past slots with chores left show as late. Tap a slot for GalaxyFarm's chores. |
| **Needs someone** | This slot's chores (and any left from earlier, flagged late), tasks due today or late (LearnLeaf and Google Tasks), shopping for tonight with an add field, herd alerts from ZNT (a breeding step today or tomorrow, or a clash with a trip), food to use soon. Tick right here; ticks go to the app that owns the thing, with Undo. |
| **Tonight** | Tonight's dinner (opens the recipe in KitchenHub) and the next few nights. |
| **Coming up** | Calendar, trips, legs and stays, breeding steps and tasks by day, each day with its forecast. Four days, then "Show the next two weeks". |
| **Apps** | Every app, grouped (Farm, Kitchen, Home, Travel, Together, Health, School, Tools), pinned apps first, with counts beside them (chores left, things to buy, tasks due). Tap opens (inside Hive, or in its own tab). Press and hold, right-click, or Shift+F10 for an app's menu: its shortcuts, open in a tab, pin, hide, edit icon. Hidden apps fold away at the end; search still finds them. |
| **Search** | Start typing anywhere (or press `/`, or tap Search). Finds apps and what's in them: tasks, calendar events, trips, shopping, meals, chores. Each result opens the app it comes from, at the right page. |
| **Edit home screen** | Settings → Edit home screen (or an app's menu): pinned apps and their order, hidden apps, and which parts of the day show. |
| **Background & look** | Settings → Background & look: a painted background or your own photo (dimmable), counts on or off, open apps inside Hive, light or dark. **Edit icon** renames any app and changes its colour and symbol. |

Each part shows **Sample** when its app isn't connected and **Not updating**
when it can't be reached, as the board does. The day is worked out in
`src/lib/day.js` and the arrangement in `src/hive/arrange.js` (saved per device
as `hive.home`); both are plain functions with tests.

The old phone-style home screen (pages of icons, folders, dock, page dots,
widgets in three sizes) is retired. Its dock carries over as the pinned apps
and custom icons carry over; apps that weren't on it start hidden. Folders gave
way to the fixed groups, widgets to the parts of the day.

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
| Feedback | ticketbooth.netlify.app/admin | Only you | Ticket Booth's admin page; "Report a bug" links still go to its public form |

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

**Setup**

Hive's Firebase project is `hive-aa9c0` (Email/Password and Google on,
`fridge-board-7u23.netlify.app` authorized). Its web config, Hive's address and
the public half of the pass key are in `src/config/hive.js`: public by design,
so nothing about them goes in Netlify. The only Netlify setting is the secret
half, `HIVE_SIGNING_KEY`.

An app that supports Hive keeps a copy of the public key and Hive's address in
its code, and needs only its own `FIREBASE_SERVICE_ACCOUNT` (LearnLeaf already
has it). To replace the key pair: `node scripts/hive-keys.mjs`, then update
`HIVE_SIGNING_KEY` here and the public key in `src/config/hive.js` and in each app.

Household-only apps can set `HIVE_NEW_ACCOUNTS=off`, so only people who already
have an account get in.

## Roadmap

1. **Home screen** around the household's day, with the board as an app. *(done; was an icon grid with folders and widgets)*
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
| To do (with Google Tasks) | LearnLeaf | `/api/summary`, `/api/subjects` | `PATCH /api/tasks/:id` (`taskStatus`) |
| Calendar, To do | Our Den (each person's Google link there), as the signed-in Hive user | `GET /api/board/google` | `POST /api/board/google/tasks/:list/:id` |
| Trips | Wander | `appTrips`, `appTripTravel` | none |
| Next breeding group | ZNT | Firestore `sessions` (public read) | none |
| Weather | Open-Meteo | forecast at the GalaxyFarm location | none |

### What goes in Netlify, and what doesn't

Netlify's settings belong to the site: every deploy, and everyone who uses
Hive, gets them. So they hold only the app's own setup, never anything about a
person. Personal things come from **who is signed in to Hive**: the board sends
the Hive user's sign-in with each request, and the server asks other apps for
that person with a Hive pass (`netlify/lib/hiveUser.mjs`). Calendar and Google
Tasks work this way already: sign in to Hive on the fridge with your email,
and it shows your Google, through the link you made in Our Den.

LearnLeaf, GalaxyFarm, KitchenHub and Wander all take passes now: signed in,
the board reads them as you. The old tokens (`LEARNLEAF_TOKEN`,
`GALAXYFARM_TOKEN`, `KITCHENHUB_TOKEN`, `WANDER_TOKEN`) are only fallbacks: for
when nobody is signed in, or when an app refuses the pass because its pass
support isn't deployed yet (`asUser` in `netlify/lib/hiveUser.mjs`; the function
log says "refused a pass" when that happens). Delete each once it isn't needed.

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

- **To do:** LearnLeaf and Google Tasks in one list: overdue and due within a
  week, soonest first, then Google tasks with no date (up to five). Ticking one
  ticks it in the app it came from.
- **Calendar:** the next seven days from your primary Google calendar. An event
  that is really a Wander trip is left out, since the trip is under Travel: it
  falls within the trip's dates (a day either side) and shares a flight number
  or a word with the trip's name, destination, flights or stays, or it's an
  all-day block over the trip's dates. The header says how many were moved.
  Rules and tests: `src/lib/agenda.js`.

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
