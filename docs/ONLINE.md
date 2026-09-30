# Online rooms with Supabase

Local computer games and pass-and-play run without an account or backend. The printed 2008 board supports 3–6 players; custom large-map expansions support up to 8, 10, or 12. Online rooms use the connected Supabase project. Its public URL and publishable key are checked in at `src/lib/supabase-public.json`, so Cloudflare builds and Capacitor packages stay connected without private build environment files. No database password, secret key, or service-role credential is included. Explicit `VITE_SUPABASE_URL` plus public-key environment variables override both values when developing against another project.

## Connect a hosted project

1. Create a Supabase project. In **Authentication → Providers → Anonymous Sign-Ins**, enable anonymous sign-ins. The app creates a persistent guest session automatically.
2. Install/use the CLI, sign in, and link your project:

   ```sh
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```

3. Apply the private database schema and deploy the authoritative game endpoint:

   ```sh
   npx supabase db push
   node supabase/sync-engine.mjs
   npx supabase functions deploy acquire-room
   ```

   The Edge Function reads the platform's `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Projects that disable legacy service keys can instead set `ACQUIRE_SUPABASE_SECRET_KEY` to their server secret key. Keep `verify_jwt = true`; the handler additionally verifies the caller with `auth.getUser()`.

4. For a different project, override the public connection values in the project root's `.env.local` (or the hosting provider's build variables), replacing both placeholders:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
   ```

   `VITE_SUPABASE_ANON_KEY` is also accepted for projects using legacy public keys. The URL must be the project root, **not** `/functions/v1/acquire-room`; otherwise Auth sign-in fails. Never put a secret or service-role key in a `VITE_` variable: these values ship in the web and mobile bundle.

5. Restart `npm run dev`, or build/deploy the website again. For installed apps, rebuild and run Capacitor sync so the new public configuration reaches the native bundle.
6. Open **Play online**, create a room, and share its six-character code. Join from another device or a private browser window. Tabs in the same browser profile share the same guest identity. The host starts with 3–6 players on standard maps or up to 8, 10, or 12 on matching large maps; computer players can fill empty seats.

Online rooms use the same rules engine and all thirty-three optional themed maps as local games: the majority and minority shareholder bonuses, the printed hotel-chain prices, and the 2008 full-rack exchange when no tile is playable. The host chooses the map in the lobby. Large maps are custom expansions with 61/81/111-chain end targets and an occupancy requirement for an all-safe ending. Games persist in Postgres; the same browser/app guest session restores a saved room after a refresh and shows it in My games. Clearing app/browser data loses that anonymous identity and its seat. Leaving the boardroom asks whether to keep the room or end/leave it. An online host can end an unfinished room for everyone. A guest can remove the local room shortcut without closing the shared game; their seat remains, so play may pause on their turns unless a timer is enabled. An abandoned room does not create a match result. A host leaving a lobby closes it; a guest leaving a lobby frees the seat. The fourteen newest maps require both migration `20260928190000_more_shaped_maps.sql` and a room function advertising `shaped-maps-v2`; older room functions keep those choices disabled.

The host can also choose the same optional house rules as local play: a 2–12-chain hotel roster, 1–100 shares per selected chain, custom openings, cash, multi-placement and limited removal, timed turns, buying/trading limits, dividends, market rolls, and financial privacy. The rules are validated by the Edge Function, stored with the room, and displayed in the game’s House rules tab. Timers are checked by the server before accepting a move and during room polling; a timed-out turn is completed automatically. Anonymous buying masks opponent cash and portfolios and exact bank quantities in the authorized room response. The backend advertises `hotel-roster-v1` and `hotel-stock-v1`; older deployments hide unsupported controls.

## Updating an earlier deployment

Apply all migration files in order using `npx supabase db push`, synchronize the engine, and deploy `acquire-room` before serving the updated client. The initial migration remains unchanged; `20260917010000_acquire_2008_rules.sql` adds the edition boundary. Later migrations add compact match history, daily retention, up-to-12-seat map-aware room checks, new shaped-map IDs, a compact closing-board snapshot, host-only room ending, member-only Realtime notifications, and efficient personalized updates. Existing rooms are marked `2023` and their stored game JSON is preserved. New rooms and game states identify their ruleset as `2008`, and new states use format version `2`.

An earlier room cannot be resumed or overwritten using the new engine. The server returns `OLD_RULESET` with an explanation to create a new 2008 table. The client also rejects responses from an older, undeployed server, preventing its new interface from silently interpreting an incompatible match. Earlier rooms do not consume the new edition's room-creation quota.

## Local Supabase development

Docker must be running. No hosted project is needed for this path:

```sh
npx supabase start
node supabase/sync-engine.mjs
npx supabase functions serve acquire-room
```

Use the local API URL and public/anon key printed by the CLI in `.env.local`. Anonymous sign-ins are enabled in `supabase/config.toml`. If you changed migrations, run `npx supabase db reset` on this disposable local database. `supabase status` displays local service addresses.

The shared Edge files are generated from `src/game` by `supabase/sync-engine.mjs`; change the canonical engine and rerun the script before every deployment. This keeps web, iOS, Android, and server decisions on one rules implementation.

## Verification

The Edge Function and privacy checks run without a project:

```sh
node supabase/sync-engine.mjs
npx --yes deno check --config supabase/functions/acquire-room/deno.json supabase/functions/acquire-room/index.ts
npx --yes deno test --config supabase/functions/acquire-room/deno.json supabase/tests/protocol.test.ts
npx --yes deno test --config supabase/tests/deno.json --allow-read --allow-env supabase/tests/database.test.ts
```

The final command runs the real SQL migrations and regression checks in embedded PostgreSQL (PGlite), including denied browser access, host-only start and end, membership, lobby transitions, optimistic concurrency, preservation of earlier games, and rejection of incompatible rules or player counts. It does not replace a hosted authentication/integration check.

With local Supabase running, run the same SQL checks in a rolled-back transaction:

```sh
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/database.sql
```

For a complete integration check, use two independent browser profiles:

- Create a room in the first profile and join from the second. Both lobbies should update promptly through a personalized private Realtime update; if WebSockets are unavailable, recovery polling runs every eight seconds.
- Add at least one computer player so the two profiles have three seats in total, then start as host. Each profile sees only its own six tiles; a turn belonging to the other player has no enabled move controls.
- Complete a turn and verify board, stocks, cash, and current player synchronize.
- During a merger, the correct shareholder receives the keep/sell/trade controls, even when it is not their normal turn.
- Refresh both profiles and rejoin. Hands, turn, and ledger persist.
- Send simultaneous actions using the same room version. Only the first accepted command commits; the second gets `VERSION_CONFLICT` and must refresh before retrying.
- Inspect initial network snapshots and reconstructed changes: opponent hand and bag entries are `?`; seed and RNG are `0`. Each browser subscribes only to its own private `acquire:<room UUID>:<user UUID>` topic; attempting another player’s topic must fail. A normal move should cause no follow-up GET on other connected browsers. Direct table reads and direct privileged RPC calls with a browser key must fail.

## Data and authority

`private.acquire_rooms` stores full state and is excluded from the exposed API schemas. Browser roles have no schema/table access and cannot execute the database RPCs. The server uses its service client to access narrow transactional functions. A client can submit a typed game command; it cannot submit a replacement state or impersonate another player. The handler derives identity from a verified Supabase access token and checks room membership and the decision's actual actor.

The server runs the rules engine and computer players, then commits against the expected room version. A database row lock and version comparison prevent lost moves and concurrent lobby changes. The server masks other racks, the tile bag, RNG state, and seed before returning a view. Initial online hands and bag are cryptographically reshuffled after public seating, preventing the public seating draw from revealing a deterministic deal. Tiles revealed and removed during a full-rack exchange or individual permanent-tile retirement are public.

Clients supporting `room-deltas-v1` subscribe to a private `acquire:<room UUID>:<user UUID>` Realtime channel. The `acquire_can_watch` function checks both room membership and the exact user ID from the verified JWT. Browser roles have receive-only access: they cannot publish authoritative changes or subscribe to another player's topic. The Edge Function redacts the before/after state for each viewer **before** computing a delta. Racks and private financial information therefore never reach another player's channel. The shared legacy topic still carries only a version/closed hint for older clients.

After a committed move, one ephemeral HTTP Broadcast batch delivers personalized changes directly. The bounded ledger appends new entries instead of resending old moves. The acting browser gets the same versioned update in its command response; either that response or Broadcast can arrive first without replaying a turn. The browser keeps one current snapshot in memory. No extra snapshots, event rows, presence records or per-user state copies are added to the database.

An update applies only to its exact room, viewer and base version. Missing or out-of-order updates trigger an authorized full refresh; stale messages cannot undo newer moves. A newly connected or resumed tab checks once after subscription to recover any connection gap. During quiet periods, a recovery check runs after one minute without an update. `acquire_read_room` checks membership, version, due timers and bot decisions inside Postgres; an unchanged room transfers only `{unchanged:true, version}` from both the database and Edge Function. `acquire_commit_room_small` uses the existing transactional commit/validation/archive logic but returns metadata only, since the engine already has the accepted state. HTTP responses over 1 KB are gzipped when the client accepts gzip.

If Realtime cannot connect, eight-second polling keeps the room usable and failed requests back off to one minute. Hidden/offline pages disconnect, and returning pages immediately catch up. Saving and leaving a table also stops watching it: a saved-room shortcut on the clubhouse or history page does not keep a socket or polling loop open. Opening its lobby or board resumes synchronization. Finished games stop watching entirely. An unavailable Broadcast never rolls back an accepted action; the persisted state remains authoritative and polling/reconnection recovers it. Old clients continue using shared version notifications and full HTTP responses, so deploy the migration and Edge Function before publishing the new web/mobile bundle.

Optional turn timers schedule a check at the deadline, independent of the minute-long recovery interval; the server completes expired turns before returning state or accepting a move. If every device is closed, the server catches up when someone returns. Without a timer, a disconnected human can reconnect using the same guest session and resume. Computer players run on the server.

Guest authentication follows Supabase's configured rate limits. Room creation is capped at eight unfinished rooms per account within 24 hours. Room creation opportunistically prunes data, and the fourth migration schedules a daily `pg_cron` cleanup where that extension is available. Empty lobbies expire after 48 hours, inactive games after 30 days, finished full room states after seven days, and compact match summaries after 365 days. Newly created guest users are tagged for this app and removed after 365 inactive days once they have no rooms or history; other Auth users are untouched. The live connected project has this job enabled and verified. Supabase does not automatically remove anonymous accounts; our selective cleanup handles only Aquire-tagged accounts. For a larger public launch, consider CAPTCHA with its matching client challenge flow; it is not enabled in this build.

The match archive stores final results, ordered chain payouts, player awards, small performance counters, and a one-character-per-coordinate closing-board snapshot. It excludes the tile bag, hands, full board state, and move log. A viewer sees only matches they participated in. The online friends leaderboard aggregates human players from those same matches; the local leaderboard uses compact summaries on this device. The server retains at most 512 recent log entries in an unfinished game.

Official references: [Anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous), [Edge Function authentication](https://supabase.com/docs/guides/functions/auth), [row-level security and grants](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions), [Edge Function dependencies](https://supabase.com/docs/guides/functions/dependencies).

## Free-tier footprint

Only the latest authoritative state is retained per room; each accepted command updates that row in place. There is no per-turn snapshot table, presence table, move-history table, or notification history. Idle reads do not refresh retention timestamps or write data. Finished matches have one compact summary shared by participants, not a copy for every player. Cleanup retains the existing bounded logs and expiry periods above.

Supabase currently includes 500 MB of database storage, 500,000 monthly Edge Function invocations, and 2 million Realtime messages on its Free plan; traffic still needs to stay within those allowances. The app requests no paid services or plan changes. Monitor actual use in the project dashboard. Sources: [Supabase billing allowances](https://supabase.com/docs/guides/platform/billing-on-supabase), [Realtime HTTP Broadcast and storage behavior](https://supabase.com/docs/guides/realtime/broadcast), [private channel authorization](https://supabase.com/docs/guides/realtime/authorization).

### Reproducible synchronization measurements

Run `npm run test:backend` to simulate complete games through the real rules engine, verify that every personalized delta reconstructs the authorized room exactly, check private house rules and final settlements, and report traffic sizes. A fixed-seed run on September 30, 2026 produced:

| Match | Full snapshots to clients before | Personalized updates after | Database response payload before → after | Move-related function calls before → after |
| --- | ---: | ---: | ---: | ---: |
| 4 human players, classic | 16.19 MB | 0.66 MB | 19.47 → 3.27 MB | 805 → 161 |
| 4 human players, private finances + market/dividends | 16.69 MB | 0.88 MB | 20.32 → 3.41 MB | 770 → 154 |
| 12 human players, Max Metropolis | 485.05 MB | 8.83 MB | 531.79 → 38.46 MB | 9,061 → 697 |

These are **uncompressed application payloads**, not Supabase billing measurements or concurrency benchmarks. Client totals include each player's update plus the action response; database totals include state reads and commit responses. HTTP Broadcast submissions, network framing, authentication, initial joins, idle checks, reconnects and fallback polls add traffic/calls. Gzip can reduce HTTP transfer further. The 200-connection and monthly Realtime limits still apply; monitor the actual organization usage dashboard. The optimization neither enables paid services nor changes retention or gameplay rules.

## Opt-in hosted browser check

`npm run test:e2e:online` uses mocked HTTP and never touches Supabase. For a real check, build first, then explicitly run:

```sh
npm run build
AQUIRE_LIVE_TEST=1 npx playwright test --config playwright.live.config.ts
```

This uses two independent browser contexts (desktop host and mobile guest), verifies real notifications, private racks, accepted/rejected moves, bot turns, reload recovery, and host-only closure. The default check closes its temporary room in `finally`; guest IDs are recorded in ignored `artifacts/online-review/test-user-ids.json` for targeted administrative cleanup. Add `AQUIRE_LIVE_FULL_MATCH=1` to play through mergers, final payouts, and the history archive; that extended check leaves a completed test match for administrative cleanup using the recorded IDs. It does not run in CI by default. Use a separate test project via the public environment overrides for repeated testing.
