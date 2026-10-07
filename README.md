# Aquire

A complete playable implementation of **Acquire**, built with **React + TypeScript + Vite + Capacitor + Supabase**. An interactive Three.js city board, a teal-and-gold game lobby, and the **2008 Avalon Hill edition** rules.

## Play now

```sh
npm install
npm run dev
```

Open **http://localhost:5173**. Choose **Against the house** for a solo game or **Around the table** for private pass-and-play. No account, database, API key, or internet connection is required for local gameplay once the app has loaded. The native apps bundle the entire game and fonts.

To play in a phone browser, connect to the same Wi-Fi as this computer and open the Network address printed by Vite. Local game saves belong to the particular browser/device; they do not transfer between devices.

## What is implemented

- Complete 2–6 player games on the printed board, fifteen tiny two-seat maps, fifteen small four-seat maps, and custom expansions with up to 8, 10, or 12 players; three computer difficulty levels and the 2008 majority/minority shareholder bonuses.
- All 108 printed tiles, the seven 2008 hotel chains and 25 shares each by default, exact stock/bonus tables, founder stock when available, safe chains, tied and multiple-chain mergers, ordered shareholder decisions, and keep/sell/2:1 trade combinations.
- Optional final-turn declaration, full bonus and stock liquidation, shared victories, safe-chain tile retirement, the 2008 full-rack exchange, and finite-game safeguards for rare deadlocks.
- Private racks in pass-and-play, automatic local saves with a save-or-end exit choice, a separate End game control for unfinished tables in My games, compact completed-match history, leaderboards, trophy cases, contextual hints, sound preferences, and native haptics.
- Colored chain initials on every occupied chain tile, and centered opponent-turn recaps with the exact board location, purchases, founding shares, and merger activity.
- Optional memory preferences: hide opponents’ holdings/history details (on by default) and show stock availability without remaining quantities (off by default). Both can also be changed while setting up a game.
- Optional per-table house rules for choosing 2–12 hotel chains and 1–100 shares per chain, opening tiles and cash, up to six placements and five safe removals per turn, 1–10 regular share buys, timed turns, hidden cash and anonymous buying, dividends, turn trading, and normal or crazy market rolls. Market rolls can occur after each round, before each turn, or after every two or three rounds. Set defaults in Table preferences, adjust them in local or online setup, and inspect the active rules in the game’s House rules tab. Printed 2008 settings remain the default.
- Eighty-one connected maps: the printed board, fifteen tiny two-player cities, fifteen four-player cities, twenty-eight six-player variants, seven each for eight and ten, and eight twelve-seat maps including the unlockable crown-shaped Goldspire Kingdom. The original eighty are rotationally balanced; the crown is mirrored left to right. Every map has its own theme and preview. Custom boards retain printed prices and turn rules while showing their end target at setup.
- **The Long Game:** seven chapters and 81 challenges covering every map, with 399 unique rivals and original faces. The original twelve challenges remain Chapter 1, preserving earlier progress. Later chapters combine fixed certificate supplies, trading, multi-tile construction, demolition, dividends, market timing and privacy; each challenge explains its rules and strategy before play. Win outright to advance. The crown-shaped Goldspire Kingdom finale pits your royal character against eleven kings and queens. Winning all challenges unlocks the crown map and royal cast in free play. Story progress stays on the device and adds no Supabase writes.
- A fourteen-part character wardrobe with twenty rewards earned through story challenges and online wins. Faces use a sixteen-character code, with old faces preserved; no image uploads. Guest profiles show lifetime online records, win percentage, average place, best fortune and an optional country in one compact database row.
- Your remaining rack stays visible while buying stock. Merger bonuses and each shareholder’s sell/trade/keep choice have separate announcements; prior decisions remain visible for the next shareholder in official clockwise order. Privacy house rules still apply.
- A closing-bell ceremony that reveals final hotel payouts smallest to largest, then standings, a winner celebration, and an award for every investor.
- Responsive phone/tablet/desktop layouts, keyboard-accessible controls and dialogs, reduced-motion support, bundled fonts, branded native icons and splash screens.
- A collapsible desktop sidebar with a remembered preference, and a desktop game layout that fits the board, current decision, and market into the available window height.
- Supabase public and private rooms: discover open tables, review their maps/rules, inspect guest profiles, or invite friends by code. Persistent guest authentication, server-side bots, validated commands, private racks, optimistic concurrency and reconnectable rooms stay in place. Full completed rooms are pruned after seven days; compact summaries remain for 365 days and lifetime profile counters survive that cleanup. Public browsing uses visible-only minute refreshes and no presence writes.

Ending an unfinished local game removes its save without adding a match result. An online host can end a room for everyone; guests can leave without closing the shared game. Saved online rooms appear in My games and return after a reload using the same guest session.

| Map tier | Maps | Playable tiles | Maximum seats |
| --- | --- | --- | --- |
| Tiny cities | 15 | 30–42 | 2 |
| Small cities | 15 | 51–75 | 4 |
| Classic and six-seat variants | 29 | 80–157 | 6 |
| Big | 7 | 160–264 | 8 |
| Mega | 7 | 232–325 | 10 |
| Max, including the unlockable kingdom | 8 | 292–453 | 12 |

**Live online rooms require a configured Supabase project.** This workspace’s connected project was deployed and tested with real Auth, public tables, private racks, full games, guest records, earned rewards, and cleanup on October 2, 2026. Follow [the Supabase setup guide](docs/ONLINE.md) for another project. Only the public project base URL and publishable key belong in `.env.local`.

## The game interface

The lobby has direct solo, pass-and-play and online entrances, a miniature 3D city, saved-table continuation and actual story challenge progress. Setup keeps the city, seats and rivals visible; expand **Customize house rules** or **Privacy & hints** for optional settings.

The live board renders sculpted tiles and hotel miniatures in Three.js, with a short building animation on placements and chain changes. Native buttons above the scenery preserve tile coordinates, keyboard input, private racks and the existing rules. **3D / 2D** switches the visual renderer without changing the table. If WebGL is unavailable or its context is lost, the flat board remains playable; the lobby has a vector illustration fallback. The renderer is loaded separately, caps pixel density, renders only on changes and during short animations, stops when the page is hidden, and respects reduced motion.

Use **Zoom**, then drag with the mouse or pan by touch to explore the board. **Fit** returns to the whole map, and **Rotate board** changes its orientation while preserving coordinates. Selected rack tiles are brought into view when zoomed. Phones retain the Board/Stocks switch, portrait and landscape layouts, and reachable turn controls. Larger desktop windows keep tall expansion maps beside their action controls.

## Turn recaps and preferences

On desktop, use **Hide sidebar** beside the logo to reclaim its space, then **Show sidebar** at the top left to restore it. The choice persists across reloads. Desktop game windows at least 1060 × 650 pixels fit all 108 spaces of the printed board, the current action, and all seven market rows without page scrolling. Expansion boards pan inside their own frame so the rest of the game remains in view. A finished game opens the full-screen closing ceremony, with each sell-off revealed in order.

Phone games fill the available browser height, with the turn controls below the board in portrait and in a narrow column in landscape. Board cells adapt to the available frame so every row and column is visible by default. On any map, **Zoom** enlarges the cells for panning and **Fit** returns to the complete city. Selecting a rack tile also brings it into view on a zoomed board. iPhone safe-area padding is applied once, and the layout adjusts when browser toolbars or orientation change.

Open **Table preferences** using the sliders button. **Hide opponents’ holdings**, enabled by default, keeps your own portfolio visible but conceals other investors’ stock counts and stock details in the activity history. **Hide remaining stock counts** replaces bank quantities with **Available** or **Sold out**, including during merger trades. These independent preferences save on this device and can be changed before or during a game. Final holdings and payouts are revealed at the closing bell.

Other investors’ completed turns always get a centered recap, whether holdings are visible or hidden. The recap highlights the played square and lists purchased shares, founder shares, and public merger events. Press **Continue** when ready; local computer players pause while you read. Pass-and-play shows the recap before the next private handoff. Online updates containing several turns queue a separate recap for each. Resuming a saved table does not replay its old turns.

When dividend or market house rules are enabled, a dice reveal follows each complete round and shows the dividend decision, selected hotel, and any market change. With before-each-turn market timing, an opening roll and a roll before every later turn appear as well. On slower market schedules, the reveal shows when the market holds its prior value. The current market status stays visible above the board on desktop and in the compact game bar on phones.

## iOS and Android

Native projects are already generated in `ios/` and `android/`.

```sh
npm run ios       # builds the web app, syncs, opens Xcode
npm run android   # builds the web app, syncs, opens Android Studio
```

See [native build and test instructions](docs/NATIVE.md), including the ready-to-install Android debug APK and iOS simulator build. [Publication steps and remaining account/listing requirements](docs/DEPLOY.md) are separate from these development builds.

## Rules and source

[Rule implementation notes](docs/RULES.md) link to the complete [official 2008 rulebook](https://media.wizards.com/2015/downloads/ah/acquire_rules.pdf) with page references. The PDF was authored in January 2008 and carries the 2008 copyright; its publisher URL is dated 2015 because the file was hosted again then.

The 2008 stock tiers and colors are implemented throughout the board and market:

| Starting price at two tiles | Chains                                             |
| --------------------------- | -------------------------------------------------- |
| $200                        | Worldwide (purple), Sackson (orange)               |
| $300                        | Festival (green), Imperial (gold), American (blue) |
| $400                        | Continental (red), Tower (gray)                    |

Five optional hotels extend the price ladder: Budgeton ($100 at two tiles), Heritage ($200), Riviera ($300), Monarch ($400), and Goldspire ($500). Each has its own color. Select them and adjust each chain’s share supply under **Hotels in this game** in Table preferences or the new-game setup. The default remains the printed seven at 25 shares each.

Only majority and minority bonuses apply. A founder receives no bonus when the bank has no stock. Tiles that would merge two safe chains may be retired and replaced. Tiles waiting for an available chain remain in the rack when another tile is playable. If no tile can be played at the beginning of a turn, the [printed 2008 FAQ](https://media.wizards.com/2015/downloads/ah/acquire_rules.pdf) permits revealing and setting aside the entire rack, including temporarily blocked tiles, then drawing six replacements. Adjacent setup tiles stay unincorporated until a later placement founds their group. End declaration is available only after placing a tile. Later-edition two-player and Tycoon rules are not included.

House rules apply only to a new table and are stored with it. A configurable opening places 1–10 random tiles per player, subject to enough remaining tiles for six-tile racks. Multi-placement turns resolve each founding or merger before the next tile and refill the rack afterward. Removals return older tiles to the bag and cannot disconnect a chain or reduce it below two buildings. The timer runs for 5–600 seconds and automatically completes unfinished decisions when it expires. Anonymous buying also hides cash, since visible cash would reveal purchase amounts. See [house-rule details](docs/RULES.md).

For an exhausted tile bag, the app draws as many replacement tiles as remain and settles when no legal move can be reached. These rare digital safeguards are documented separately from the printed rules.

### Earlier saves

New games use state version 2, explicitly marked `ruleset: '2008'`, in `aquire.games.v2`. Earlier `aquire.games.v1` saves remain untouched in the same browser/app; they are not silently converted or resumed under different prices and rules. My games indicates when earlier saves exist. Preferences carry over. Existing online tables remain stored but require a new 2008 table; an additive Supabase migration handles the edition boundary.

## Verify

```sh
npm run check          # strict TypeScript + production build + rules/rendering tests
npx playwright install chromium webkit
npm run test:e2e       # actual desktop and mobile browser gameplay
npm run test:e2e:online # HTTP-mocked online room UI (not a live Supabase session)
npm run test:backend   # privacy/authorization and PostgreSQL migration regressions
```

The rules suite includes complete seeded games on every map, including full 8-, 10-, and 12-seat expansion games, stock/tile conservation, safe-chain invariants, merger ordering, privacy, and final settlements. Browser tests cover the tall 11×17 board, the 30×17 ring, and placement in its 30th column. Backend SQL tests use embedded PostgreSQL. The connected hosted project is checked separately; temporary test rooms and completed matches are removed afterward.

To typecheck the Edge Function:

```sh
npm run supabase:sync
npx --yes deno check --config supabase/functions/acquire-room/deno.json supabase/functions/acquire-room/index.ts
```

See [the validation record](docs/TESTING.md) and [a sample game](docs/screenshots/desktop-game.png).

## Build and deploy the website

```sh
npm run build
npm run preview
```

Serve `dist/` with a static HTTPS host. Supabase hosts the backend, not the Vite site itself. Set public Supabase environment values **before building**. See [the deployment guide](docs/DEPLOY.md) for the web and stores.

## Code map

| Location           | Responsibility                                                       |
| ------------------ | -------------------------------------------------------------------- |
| `src/game/`        | Pure deterministic rules, bot strategy, serializable actions, tests  |
| `src/components/`  | Three.js city, lobby, board controls, market, decisions, setup and rules |
| `src/game-world.css` | Shared game surfaces, lobby, campaign and renderer presentation |
| `src/game-layout.css`, `src/sidebar.css`, `src/recap-layout.css` | Desktop viewport, collapsible navigation, and recap layout |
| `src/App.tsx`      | Navigation, persistence, private handoffs, bot scheduling            |
| `src/lib/`         | Local saves/preferences and authenticated Supabase client            |
| `supabase/`        | Private Postgres schema, authoritative Edge Function, security tests |
| `ios/`, `android/` | Capacitor native projects using the same `dist/` build               |
| `e2e/`             | Real browser interaction regressions                                 |

The server's generated shared engine is synchronized from `src/game` using `npm run supabase:sync`; do not edit the generated copy. Never execute client-submitted replacement game state. Online requests carry actions, and the authenticated server decides the result.

Acquire was designed by Sid Sackson. This is an independent implementation with original UI and artwork, not an official Hasbro or Renegade product.
# Aquire
