# Moving the apps to one Supabase project

Status: plan, nothing migrated yet. Written 2026-11-20 from a read-only pass
over every repository. Counts are approximate (grep).

## Goal

One Supabase project. One account per person for every app. Each app keeps
its own schema. Hive is the household's home for all of it, and the apps that
outsiders use keep working on their own public sites with the same accounts.
Supabase can be self-hosted, so the later on-prem move is a database copy and
new addresses, not a rewrite.

## Who uses what

| Group | Apps | Accounts |
|---|---|---|
| Household only, inside Hive | Fridge Board, KitchenHub, ZNT, Pool Heater, StimulTrack, Our Den, JournalTogether | Household members |
| Public site + Hive section | LearnLeaf, Wander, Let's Eat, Drink Tracker, SideQuest, AeroLogger, Ticket Booth | Anyone signs up; household also uses them in Hive |
| Both | GalaxyFarm: farm side in Hive; customer portal public; housesitter kiosk unchanged | Its own (see GalaxyFarm) |
| Staying as is | Cattle Graph (Neo4j), Muster (Netlify Blobs, no user data) | None |
| Archived | Property Care | None |

## What the inventory found

### Where each app is today

| App | Backend now | Sign-in now | Data code (files, ~call sites) | Live updates | Files | Server code |
|---|---|---|---|---|---|---|
| KitchenHub | Firestore `mykitchenhub-db665` | Email/password | 18 frontend files, ~194 | 11 | Recipe photos | 17 Cloud Functions: daily SMS waste alerts, Claude meal plans and photo import, HelloFresh scraping, CSV import, board API |
| Let's Eat | Firestore + Realtime DB `let-s-eat-efb04` | **None**: everything under the fixed id `userId` | 3 files, ~35 | 2 | None | None |
| Wander | Firestore `wander-f10b1` | Email/password | 23 files + functions, ~249 | 1 | None (links to albums) | Calendar feed, FlightRadar24 proxy, `nextSharedTrip` for Our Den, app/Hive endpoints |
| LearnLeaf | Firestore `learnleaf-organizer` | Email/password, Google, Hive pass | 8 files, ~74 | 0 | None | Personal REST API, API tokens, Hive exchange |
| ZNT | Firestore `znt-manager` | **None**: fixed id, rules allow anyone | 1 module, ~39 | 0 | None | iCal feed of breeding sessions |
| Drink Tracker | Realtime DB `alctracker-b6c8a` | Google, email/password | 7 files, ~50 | 23 | None | None |
| StimulTrack | Firestore `caffeine-tracker-bcd4a` | Email/password, Google | 2 files, 5 | 1 | None | None |
| JournalTogether | Firestore `journal-together-9234f` | Email/password | 6 files, ~19 | 10 | None | None |
| Our Den | Firestore + Storage `ourden` | Email/password | Centralised in `src/data/`, ~11 | 2 primitives, 19 uses | Memory photos | Google Calendar/Tasks token functions; board Google feed |
| SideQuest | Firestore (id in env) | Google | 6 files, ~60 | 9 (live multiplayer) | None | None |
| AeroLogger | Firestore + Storage `aerologger-ec6a6` | Email/password | 1 file (`index.html`), ~61 | 3 | Spotting photos, full size | None (FR24 planned) |
| Pool Heater | Realtime DB `water-heater-sensors` | **None** | 1 module, ~20; Pi script ~15 | 0 (polls every 60 s) | None | 4 scheduled rollup/health jobs; Raspberry Pi writes with an admin key |
| Ticket Booth | Google Sheet + Apps Script | None (public form); admin passcode | 1 file (`Code.gs`) | 0 | Drive + a GitHub repo | Creates LearnLeaf tasks, files GitHub issues, email digests |
| GalaxyFarm | **Neon** Postgres (not Supabase), drizzle, 69 tables in `public` | Its own: Auth.js, scrypt, invite-only; roles owner, member, customer, housesitter, kiosk | n/a | n/a | Cloudflare R2 | Board API, weather cron |

No app uses Supabase today. GalaxyFarm is the only Postgres app; its spec
forbids the Supabase SDK and vendor auth, on purpose, for the move home.

### How apps lean on each other now (all of this gets simpler in one database)

- Hive's board reads KitchenHub, Wander, LearnLeaf, GalaxyFarm and Our Den
  over HTTP with Hive passes or personal tokens.
- Our Den calls Wander's `nextSharedTrip` (open, no token) and KitchenHub's
  API with its own Firebase ID token.
- KitchenHub copies recipes from Let's Eat's project with a service account.
- Ticket Booth creates and watches tasks in LearnLeaf's Firestore with a
  service account.
- Calendar apps are subscribed to Wander's and ZNT's iCal URLs. Those URLs
  must keep working.

### Security problems that exist today (fix regardless of the migration)

1. **ZNT's database can be read and changed by anyone** who has its public
   config: the rules allow `users/znt-manager-user/**` with no sign-in.
2. **Pool Heater's web app reads and writes with no sign-in**; the rules that
   guard it are not in the repo, so what's deployed is unknown.
3. **AeroLogger has no rules in the repo**; its own docs flag that as P0.
4. **Let's Eat has no sign-in**; its deployed rules are unknown and likely open.
5. **Wander's rules let any signed-in user read and write any trip**;
   membership is only checked in the app.
6. **KitchenHub's `seedTestData` function has its auth check commented out.**
7. JournalTogether's rules are not in the repo.

Supabase's row-level security fixes 1-5 as part of the move.

## The design

### One project, schemas per app

- `core`: `profiles` (one per person, keyed by Supabase `auth.users.id`),
  `households`, `household_members`, `legacy_ids` (app, old Firebase uid →
  new user id), `api_tokens` (one table instead of three copies).
- One schema per app: `kitchen`, `letseat`, `wander`, `learnleaf`, `znt`,
  `drinks`, `stimul`, `journal`, `den`, `sidequest`, `aero`, `pool`,
  `tickets`, `galaxyfarm`.
- Tables keep each app's own shape: rows get `user_id` and, for shared
  household things, `household_id`.
- Access is enforced in the database with row-level security, using four
  patterns:
  1. **Owner:** `user_id = auth.uid()`.
  2. **Household:** the person is in `household_members` for that row's
     household.
  3. **Membership table:** Wander `trip_members`, Our Den couple members,
     SideQuest session participants, Drink Tracker party members.
  4. **Public read:** drink catalogs, card packs, AeroLogger's public
     gallery.

### Two doors for every app, with no copies

Each app keeps its own repo and its own public site. Hive shows it at the
**same web address as Hive**, using a Netlify proxy rewrite, for example
`/apps/wander/*` → `wander-tripplanner.netlify.app/*`. Same address means:

- one Supabase sign-in, shared by every app inside Hive automatically,
  because they all read the same stored session;
- no separately partitioned storage, so no repeated sign-ins and no Hive
  passes needed inside Hive;
- the public site still works on its own, signing in to the same account.

What each app needs for this:

- build with a relative base path;
- keep its service worker scoped to its own folder.

Prove it with one app before relying on it (Phase 0).

### Accounts and passwords

- One Supabase user per email. When the same email has accounts in several
  Firebase projects, they become one person; `legacy_ids` maps each old uid
  so rows keep their owner.
- **Passwords move without resets, lazily.** On a person's first Supabase
  sign-in, if Supabase doesn't know the password yet, a server function
  checks it against the app's old Firebase project (Firebase's public sign-in
  API). If Firebase accepts it, the server sets the same password in
  Supabase. Once everyone active has signed in, the Firebase projects
  retire. Household-only apps could just reset instead.
- Google sign-in users (LearnLeaf, StimulTrack, Drink Tracker, SideQuest)
  sign in with Google in Supabase and are matched by email.
- Let's Eat, ZNT and Pool Heater have no accounts today. Their data is
  assigned to the household during the move.

### GalaxyFarm: plain Postgres, its own sign-in

GalaxyFarm's design keeps it vendor-neutral. So:

- Its tables move from Neon into a `galaxyfarm` schema in the Supabase
  database, used as plain Postgres through the pooler (port 6543). Its
  `prepare:false`, single-connection setup already fits the pooler.
- It keeps Auth.js and its own users, roles, kiosk devices and customer
  accounts. Customers and kiosks never touch Supabase Auth.
- Owner and member accounts get linked to their Supabase person by email,
  so Hive can sign you into the farm side.
- Code changes:
  - drizzle `pgSchema('galaxyfarm')` or `search_path`;
  - the drift check hardcodes `public`;
  - the `_migrations` ledger is unqualified;
  - the Neon-specific `-pooler` hostname check.
- Moving off Neon Launch also drops a monthly bill.

### Things Supabase doesn't do that these apps rely on

- **Offline writes.** StimulTrack, KitchenHub, JournalTogether, SideQuest
  and Drink Tracker use Firebase's offline cache, and LearnLeaf has its own
  IndexedDB layer. Supabase has no built-in offline queue, so each needs a
  small IndexedDB outbox. Building it once, as a shared helper, is the
  biggest piece of foundation work.
- **Live updates.** These move to Supabase Realtime, which respects
  row-level security:
  - Drink Tracker: 23 listeners;
  - KitchenHub: 11;
  - JournalTogether: 10;
  - SideQuest: 9, including live multiplayer.
- **Multi-path atomic writes.** Drink Tracker's Realtime DB fan-outs and the
  batched writes elsewhere become Postgres transactions (database
  functions).
- **Scheduled jobs.** Pool Heater rollups and KitchenHub's daily alerts move
  to `pg_cron` or Supabase scheduled functions.
- **The Pool Heater Pi.** It runs Python on 32-bit Debian with a Firebase
  admin key. It would write to Postgres with a narrowly scoped device role
  instead. `psycopg2` runs on the Pi.
- **Stored photo links.** AeroLogger and Our Den store Firebase download
  URLs in their data. Photos are copied to Supabase Storage and the links
  rewritten.

### Size and cost

- Free plan:
  - 500 MB database;
  - 1 GB file storage;
  - pauses after 7 days without use (daily use prevents that).
- Text data across all apps fits easily. Pool Heater keeps raw readings 7
  days and rollups longer, which is small.
- **Photos are the unknown.** AeroLogger stores full-size images, plus
  KitchenHub recipes and Our Den memories. Measure the Firebase Storage
  buckets first. If they're over about 1 GB, either resize on import or use
  Pro ($25/month, 100 GB).

## Order and effort

Effort is focused working days, including testing. Each app switches over
with a few minutes of downtime, and its Firebase project stays read-only for
a while as a fallback.

| Phase | Work | Days |
|---|---|---|
| 0. Foundations | Supabase project; `core` schema and households; Hive signs in with Supabase; same-address proxy proven with one app; shared offline-outbox helper; export/import scripts (Firestore and Realtime DB → SQL, uid mapping); lazy password function | 4-5 |
| 1. Pilot | StimulTrack (5 call sites, 1 listener, offline logging) | 1 |
| 2. Household apps | ZNT 1-2 (add sign-in; keep the calendar URL working); JournalTogether 1-2; Our Den 2 (Google token functions → Supabase functions; photos); Pool Heater 2-3 (Pi changes, scheduled rollups); KitchenHub 4-5 (most code; 17 functions, SMS, Claude, shared recipe library). The board's feeds switch to SQL as each one lands. | 10-14 |
| 3. Public apps | Let's Eat 1-2 (add accounts); LearnLeaf 2-3 (offline layer, Google, API tokens, Ticket Booth link); SideQuest 2-3 (live multiplayer); AeroLogger 2-3 (flatten the nested data, photos, first real access rules); Drink Tracker 3-4 (complex sharing rules, 23 listeners); Wander 3-4 (most call sites, calendar URLs, FlightRadar24, Our Den link); Ticket Booth 1-2 | 14-21 |
| 4. GalaxyFarm | Schema move off Neon, pooler, link owner/member to Supabase people | 2-3 |
| 5. Clean-up | Retire Firebase projects, Hive passes and personal tokens; remove the old Netlify tokens | 1-2 |

Total: roughly 32-46 working days. Each phase stands on its own, so this can
pause at any point with everything working.

## Decisions needed before Phase 0

1. **Same-address proxy for apps inside Hive** (recommended). It's what gives
   one sign-in inside Hive without copying apps.
2. **Passwords:** lazy carry-over (recommended) or a reset.
3. **GalaxyFarm keeps its own sign-in** and joins as plain Postgres
   (recommended; matches its spec).
4. **Ticket Booth:** move tickets into Supabase with public submission, or
   keep the Sheet and only repoint its LearnLeaf link. Recommend keeping the
   Sheet until Phase 3.
5. **Plan:** start on Free; measure photo storage before AeroLogger.
6. **Fix ZNT's open database now** rather than waiting for its turn.
