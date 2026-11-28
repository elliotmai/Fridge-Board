# Hive

Every app in one home screen. It looks and works like a phone's home screen:
app icons, folders, a dock and widgets, all rearrangeable. Fridge Board is one
of its apps, and still runs the kitchen tablet exactly as before.

**Stack:** Vite + React, built from `app-template` (What's New, PWA auto-update,
offline toast, pull-to-refresh on phones, Ticketbooth feedback link).

## The home screen

It behaves like a phone's home screen, and almost everything about it can be
changed.

| | |
| --- | --- |
| **Pages** | Icons and widgets fill the screen exactly: no scrolling. Pages follow your finger and a flick glides to the next (`src/hive/pager.js`); Page Up/Down and the mouse wheel work too. Press and hold an item for **Start a new page here**: that page break holds on every screen. The grid fits whatever screen it's on (columns and rows from its size), so one layout works on a phone, a tablet, or a turned tablet (`pack` in `src/hive/layout.js`). The last page is the **App Library**: every app, grouped, with search. |
| **Open** | Tap. The home screen fades into a cover showing the app's tile; the app loads under it and the cover fades off once it's ready (instant the second time); going home is the reverse (`src/hive/Launch.jsx`). Fridge Board runs inside Hive; other apps open full screen with **Home**, **Reload**, **Open in its own tab**, and a home bar at the bottom: swipe it up (the app shrinks with your finger) or tap it. |
| **Long press** | An icon's menu: its shortcuts (KitchenHub → Shopping list, GalaxyFarm → Chores…), Edit icon, Remove, Edit home screen. Keep dragging from there and you're rearranging. A widget's menu changes its size (small, medium, large). Press and hold empty space to start editing. |
| **Rearrange** | Drag; neighbours slide aside, and hold at the screen edge to change page. Rest on an icon to make a folder; folders open with a bloom from their icon. Minus badges remove. Arrow keys move the focused icon. |
| **Stacks** | Rest a widget on another to stack them. Swipe up or down (or tap the dots) to turn; a stack can turn by itself to what matters now: chores in the morning, dinner from mid-afternoon, an event about to start (`src/hive/smart.js`). Long press → Edit stack. |
| **Clock screen** | For the fridge: the time, big, beside (landscape) or above (portrait) two widget stacks that still work. Dim red from 9 pm. Tap the clock on a tablet, or Settings → When left alone → Show the clock screen. Choose what it shows in Wallpaper & home screen. |
| **Search** | Swipe down, or tap the dots. Finds apps and what's in them: tasks (LearnLeaf and Google), calendar events, trips, shopping, meals, chores. Each result opens the app it comes from, at the right page (Google Calendar and Google Tasks in a new tab). With nothing typed: recent apps and today. |
| **Inside or in a tab** | Apps open inside Hive by default. In a frame a browser gives an app separate storage, so it asks you to sign in again unless it supports Sign in with Hive. Settings → Open apps inside Hive turns that off for all apps; an app's long-press menu does it for one. |
| **Badges** | Live counts: chores left (Fridge Board), things to buy (KitchenHub), tasks due (LearnLeaf). |
| **Customize** | Settings (an app on the home screen) → Wallpaper & home screen: wallpapers or your own photo (labels turn white on dark ones), colour from the wallpaper, dimming, icon style (colour, dark, tinted), icon size, columns, compact rows, names on or off, badges (numbers, dot, off), the line under the clock, dock, search, App Library, light or dark, the clock screen. **Edit icon** renames any app and changes its colour and symbol. |

Layout and looks are saved on each device (`hive.layout`, `hive.look`); the
layout format (version 3 adds stacks and page breaks; older layouts load as
they are) and page packing are tested in `layout.test.js`. Why these features:
`docs/hive-research.md`.

### The fridge tablet

A tablet that already had the board key is treated as the fridge tablet. A
tablet is a screen 760px wide, or at least 500px both ways, so the fridge's
Fire HD 8 counts sideways (about 854x534) and upright (about 534x854) and a phone
never does (`src/hive/device.js`, tested in `device.test.js`). The fridge tablet: it opens straight to Fridge Board and drifts back to it when left alone
(2 minutes on the home screen, 15 in another app). The grid button in the board's
header goes to the home screen. Both are switchable in Hive settings ("Open
to" and "When left alone" can also be the clock screen). Local
storage keys still start with `fridge-board.`, so the tablet keeps its key and
settings through the rename.

### Board layouts

| Where | What happens |
| --- | --- |
| **Fridge tablet** (any tablet, either way up) | Everything on one screen. Upright, the kitchen goes across the top with chores and coming up side by side below; turning the tablet re-lays it out. Tick chores and shopping items, cook from step cards with timers, all in place. Returns to the top of the board after 2 minutes untouched. |
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

## Household screens

The fridge tablet can be signed in as the household instead of as a person
(`supabase/migrations/20261127000000_household_screens.sql`,
`netlify/lib/screens.mjs`).

1. An owner, in their own Hive: Account → **Add a household screen**, names
   it, and gets an 8-character code (10 minutes, one use).
2. On the tablet: Account → **Set up this device as a household screen**,
   and the code. `POST /api/hive/screens/claim` claims it, makes the screen's
   own Supabase account (no password; `app_metadata.hive_screen` = the
   household, which only the server can set) with role `screen` in
   `core.household_members`, and signs the tablet in.
3. Owners see the household's screens in Account and can remove one
   (`DELETE /api/hive/screens/:id`): its account is deleted and the board
   refuses it on its next request.

What a screen sees: everything the household shares (KitchenHub, ZNT, Pool,
timers: anything behind `core.is_member`), and nothing personal (every
`auth.uid()` table). It can't own, invite, start or join a household
(`core.screen_guard`). Passes: KitchenHub gets one for the screen account
(KitchenHub finds the household from it); GalaxyFarm gets a **household
pass** (`kind: 'household'`, no email, the household's people's confirmed
emails in `members`), which GalaxyFarm maps to the farm an owner among them
owns; every other app is refused, so no app ever makes an account for a
screen. Drinks lists everyone in the household, as it does for anyone.

### Both view

Calendars, Google Tasks, LearnLeaf tasks and trips come to a screen per
person, and only from people who turn them on in their own Hive (Account →
**On the household screen**, saved as `user_metadata.hive_screen_share`
`{ google, learnleaf, wander }`, off by default). For a screen, `/api/board`
loads the household's people (`screenPeople`: confirmed email and shares, via
the admin API) and asks each app once per sharing person, with that person's
own pass and never the site-wide tokens (`bothView`). The results merge
(`mergeGoogle`, `mergeLearnleaf`, `mergeWander`): an event or trip both of you
are on shows once, with both initials, and every row carries `who` / `whoName`,
shown as an initial badge on the board. Ids are tagged `<uid>~<id>`, so a tick
on the fridge goes back (`/api/todos/...`) as the person it belongs to, and
only for something they share. `viewer.screen.people` lists the household's
people for the board and face switching.

### Face switching

On a household screen, the board can show one person's view while they're
the one looking at it (`src/lib/faceSwitch.js` decides; `src/hive/faces.js`
and `useFaceSwitch.js` run the camera). Board settings → **Face switching**:
each person teaches it their face (6 good looks), then **Switch to whoever is
looking** turns it on.

- On the tablet only. face-api (MIT, `@vladmandic/face-api`) and its three
  weights are served by Hive itself from `/face-models`
  (`scripts/face-models.mjs` copies them at `predev`/`prebuild`; not
  committed, not precached), loaded only on a screen that uses it. Frames are
  looked at and dropped; the only thing kept is each taught person's face
  signatures (128 numbers each) in this tablet's IndexedDB, until they're
  forgotten. Turning it off forgets every face.
- Sure or Both. One face, recognised in 3 of the last 4 looks (about one a
  second, distance under 0.5 and clearly closer than anyone else), switches
  to that person. Two faces is Both at once; nobody or unsure is Both 20
  seconds after they were last recognised.
- One person's view (`viewFor`) keeps their rows (`who`) and everything
  shared; Drinks starts on them.
- A light in the corner shows whenever the camera is on, with **Off for an
  hour**. The camera stops when the board is hidden.

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
Signed in to Hive, a section shows your data and nothing else: an empty list
says so ("No chores today"), an app that can't be reached says **Couldn't
reach** with Retry (or keeps your last good copy, labelled **Not updating**),
and one that can't be shown yet says why (Google: **Connect Google**, which
opens Hive → Account). Sample data, labelled **Sample**, only shows to someone
signed out, or with `?demo` in the address (`src/lib/feed.js`, tested).

The API takes the board key, or a signed-in Hive user who is in a household
(`boardGate` in `netlify/lib/household.mjs`), so hive.flyingdoublemranch.com
works on any device you're signed in on, without typing the key there. Each
`/api/board` call logs one line saying what every source returned.

### Drinks on the fridge

The board's **Drinks** tile (shown when someone is signed in) asks who you
are, from the household's people, then adds a drink to that person's Drink
Tracker in one tap: their favourites and recent drinks first, then the drink
types at the app's usual amounts. Who you are is remembered in that tab for
20 minutes untouched; **Not you?** switches. `POST /api/drinks/:member`
(`netlify/functions/drinks.mjs`, rules in `netlify/lib/drinks.mjs`) checks the
caller is signed in and in a household, and the person is in the same one,
then inserts one row in `drinks.tree` with the service role, exactly as Drink
Tracker's own addDrink() writes it (`users/<uid>/drinks/<push id>`: type,
name, quantity, unit, local date and time). Drink Tracker's RLS is unchanged;
its stats and BAC are worked out from the drinks, so the new one counts.

| Section | App | Read | Write |
| --- | --- | --- | --- |
| Chores, housesitter guide, home location | GalaxyFarm | `GET /api/board/v1` | `POST /api/board/v1/chores/:id` |
| Meals, recipe cards, shopping, use soon | KitchenHub | `board` function `GET /` | `POST /shopping`, `POST /shopping/:id` |
| To do (with Google Tasks) | LearnLeaf | `/api/summary`, `/api/subjects` | `PATCH /api/tasks/:id` (`taskStatus`) |
| Calendar, To do | Our Den (each person's Google link there), as the signed-in Hive user | `GET /api/board/google` | `POST /api/board/google/tasks/:list/:id` |
| Trips | Wander | `appTrips`, `appTripTravel` | none |
| Next breeding group | ZNT | Firestore `sessions` (public read) | none |
| Weather | Open-Meteo | forecast at the GalaxyFarm location | none |

**The egg round.** GalaxyFarm marks the egg-collection chore `eggs: true` in
`/api/board/v1`. Ticking it off — on the board or in the Chores widget, once
GalaxyFarm has accepted the tick — opens GalaxyFarm's egg count in its frame at
`/kiosk/eggs?from=hive` (`src/lib/eggs.js`). When the count is logged the page
posts `{ type: 'hive:close', v: 1 }`, and Hive goes back to where the tick was:
the board, or the home screen (`listenForClose` in `src/hive/bridge.js`, which
only listens to a frame Hive opened, from that app's own address). Sample-mode
ticks never open it.

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
