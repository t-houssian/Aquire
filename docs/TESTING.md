# Validation record

## iPhone board sizing and landscape gutters — September 29, 2026

The active game now applies iPhone safe-area padding once, at the game view. The previous nested padding reproduced a 118px left gutter with a 59px emulated notch inset. Portrait boards fill the height remaining above the actual turn controls; landscape uses two compact header rows and a narrower action column. Cells adapt to the frame, including wide shaped maps. Expanded maps have Fit/Zoom controls, and choosing a rack tile recenters only the zoomed board. Text sizing is stable when iOS changes orientation.

Production build and all 88 unit/rendering tests passed. The complete browser suite passed 112 tests with 22 environment/platform skips, including a new WebKit mobile project. Coverage includes 320×568 through desktop sizes, iPhone safe insets on either side, toolbar-reduced 852×320 and 393×650 windows, orientation changes, full-frame Twin Docks, 12-seat fit/zoom/pan, rack selection, stock purchases, and merger choices. Safe-area overrides use Chromium's device protocol; the WebKit checks exercise the rendered layout without physical iPhone browser chrome. Reviewed portrait and landscape screenshots are saved in `artifacts/phone-layout-*-20260929.png`.

Capacitor sync, Android debug APK/release AAB, and iOS simulator builds passed. All 30 web assets match the native projects and the refreshed native/web archives; archive integrity and SHA-256 checks passed. `artifacts/aquire-web-dist.zip` is ready to publish. This update was not deployed to the public Cloudflare website.

## Dice reveals and market timing — September 29, 2026

Dividend and market house-rule events now open an animated dice reveal after each complete round, with the selected hotel, payout outcome, and resulting market value. Optional market frequency supports a roll before every investor's turn (including the opening turn), or after every second or third complete round; dividends retain their round-end schedule. The current market status is visible beside the board on desktop and in the compact phone bar. Recent dice reports are bounded to one table rotation so online updates can reveal bot turns without accumulating event history. Private payout totals remain hidden under the money/privacy house rules.

Verification passed 88 unit/rendering tests, 103 desktop/mobile browser tests with 21 platform-specific skips, 15 HTTP-mocked online UI tests, 9 backend/PostgreSQL tests, a production build, and the Edge Function typecheck. WebKit visual checks at 844×390, 390×844, and 320×568 found no page or dice-dialog scrolling. The linked Supabase Edge Function was deployed; a live temporary room accepted per-turn market timing and returned its persisted opening roll in recent events, then was closed. Capacitor sync, Android debug APK and unsigned release AAB builds, and the iOS simulator build passed. All 30 web files matched both native projects and all three packaged builds byte-for-byte; SHA-256 checks passed.

## Save or end an unfinished game — September 29, 2026

Leaving an unfinished local or online boardroom now prompts to keep playing, save and exit, or end/leave the game. My games has a separate confirmed End game control. Local abandonment removes the full save without producing a completed-match summary. An online host can close the shared room for everyone; guests can leave only their own device's room shortcut. Saved online rooms are restored after reload. The host-only database operation is service-role restricted and does not trigger the finished-match archive. The migration and Edge Function were deployed to the connected Supabase project; a hosted temporary room was created, started, ended, and verified absent from the room table. Its temporary guest account was deleted.

Verification passed 86 unit/rendering tests, 85 desktop/mobile browser tests with 21 platform-specific skips, 15 HTTP-mocked online UI tests, and 9 backend/PostgreSQL tests. The new browser cases exercise save, discard, confirmation, reload, host ending, and guest leaving. Production build passed. Capacitor sync, Android debug APK and unsigned release AAB builds, and the iOS simulator build passed. All 30 production web files matched both native projects and all three refreshed packages byte-for-byte; package ZIP integrity and SHA-256 checks passed.

## Independent-tile contrast — September 29, 2026

Placed independent tiles now use a stone-colored face, a prominent building icon, and a small corner coordinate. Playable rack spaces retain their themed outline and centered coordinate. A 390px browser preview confirmed that the classic board fills the available width instead of shrinking to its minimum size. Production build and all 86 unit/rendering tests passed; 18 desktop/mobile map browser tests passed. Capacitor sync, Android debug APK and unsigned release AAB builds, and the iOS simulator build passed. All 30 production web files matched both native projects and all three refreshed packages byte-for-byte; package ZIP integrity and SHA-256 checks passed.

## Board, blocked tiles, and closing bell — September 29, 2026

The MacBook-sized Obelisk board is now centered and over 390px wide in a 1914×934 viewport, with close-set light tiles on a dark themed board. Browser checks verify the Tower and Continental initials at 1K and 8L remain within their cells. Wider desktops place the decision card beside the board, while the existing 1060×650 through 1920×1080 viewport matrix still keeps the board and controls visible. During merger share decisions, the active investor can see their own rack. Closing sell-offs show the final city beside payouts on desktop and via a board/payout toggle on phones. A final board costs one character per map coordinate in local and online match summaries; older summaries without that snapshot show a clear fallback.

The later rule correction restored the official 2008 full-rack exchange. Permanently blocked safe-to-safe tiles may be retired individually. Temporarily blocked extra-chain tiles stay in the rack when another tile is legal. At the beginning of a turn with no legal tile, the entire rack can be revealed and exchanged, including temporarily blocked tiles; the replacement turn then continues. The earlier selective-only behavior is superseded. Adjacent starting tiles remain unincorporated until a later placement joins their group. Standard one-placement games no longer award City Builder; the closing award calculation uses final holdings and personal actions to give every player a contextual trophy.

Final verification passed 86 unit/rendering tests, 81 desktop/mobile browser tests with 21 platform-specific skips, 13 online UI tests, and 9 backend/PostgreSQL tests. The production web build and Capacitor sync passed. The connected Supabase project received the archive migration and updated Edge Function; a hosted guest created a room with two computers, started a game, placed a legal tile, and observed an advanced room version. A second hosted check confirmed the restored exchange command reaches the current engine and rejects a rack with a legal tile. The temporary rooms and guests were deleted. Android debug APK, unsigned release AAB, and iOS simulator builds compiled; all 30 production web files matched both native projects and the copied simulator app byte-for-byte. Downloadable packages passed ZIP integrity and SHA-256 checks. Store signing and publication were not performed.

## Current hotel-roster verification — September 29, 2026

The new hotel controls passed 81 unit/rendering tests, including complete seeded games with both two and twelve selectable chains and share conservation at custom supplies. A separate twelve-player, twelve-chain Metropolis Max simulation finished after 712 actions with all custom shares conserved. The desktop/mobile Chromium suite passed 79 tests with 21 platform-specific skips; it includes preferences-to-setup persistence, a playable custom roster, a compact twelve-hotel market, and the existing viewport, merger, and finale flows. Thirteen HTTP-mocked online browser tests and nine backend/PostgreSQL tests passed. Production TypeScript/Vite and Capacitor builds passed.

The updated Supabase Edge Function was deployed to the connected project. A live host and guest started a game with Budgeton, Heritage, and Goldspire, using 5 Budgeton and 60 Goldspire shares. Both views returned the selected roster and supplies, the guest view masked opponent hands, and a real tile placement committed. The temporary room was deleted afterward. Android API 36 debug and unsigned release builds and the iOS simulator build compiled; all 30 production web files were compared byte-for-byte with both native projects and the copied simulator app, and package SHA-256 and ZIP integrity checks passed. A fresh simulator launch was not attempted on this update.

## Fourteen new shaped maps — September 28, 2026

The roster now has 34 maps: the printed board, eighteen optional six-seat boards, and five each for eight, ten, and twelve seats. Eight new six-seat designs use eight different dimensions, including 20×7 Twin Docks and 11×17 Obelisk. The larger additions reach 30 columns on Celestial Ring and 23 rows on Orion Star. Tests check every footprint is connected and rotationally symmetric, every playable tile is unique, six-tile racks and configurable ten-tile-per-person openings conserve the full inventory, each seat limit is enforced, and seeded games reach final settlement on every map. The SQL regression checks all fourteen new IDs at their maximum seat counts and rejects an extra seat.

The final check passed 76 unit/rendering tests, 75 desktop/mobile browser tests (21 desktop-only cases skipped on mobile), 12 online UI tests, and 9 backend/PostgreSQL tests. Browser coverage includes all new previews and themes, the tall Obelisk board without horizontal page overflow, the 30×17 Celestial Ring, and playing tile 30I. An older room function keeps new maps disabled until it advertises `shaped-maps-v2`.

The sixth migration and updated Edge Function were applied to the connected Supabase project. A live room with two guests and ten computers started on Celestial Ring with all 366 physical tiles accounted for and opponent hands masked. An actual move was accepted and preserved the inventory; temporary room and guest data were then removed. The final web build was synced into Capacitor, and Android API 36 debug/unsigned release and iOS 26.1 simulator builds compiled. All 30 production files matched both native projects and the copied simulator artifact byte-for-byte; the downloadable packages passed SHA-256 and archive checks. The simulator was not booted for this update because the Mac had roughly 1 GB free; its earlier package launched successfully.

## Optional house rules — September 28, 2026

The optional opening, cash, placement/removal, timer, privacy, buying/trading, dividend, and market settings passed 75 unit/rendering tests, 69 desktop/mobile browser tests, 10 online UI tests, and 9 backend/PostgreSQL tests. The new cases cover tile inventory and chain connectivity, purchases and sales, market-adjusted settlement, full-cluster dividend rolls and inside-tile removal, timer expiry, legacy saves, and a combined seeded game. The production TypeScript/Vite build and Capacitor sync passed.

The updated Edge Function was deployed to the connected Supabase project. A hosted room with two guests and one computer started with three opening tiles per player, $9,000 each, a five-second timer, and the other optional rules enabled. Each guest saw only their own cash; opponent hands, stocks, and exact bank quantities were masked. Server polling expired the turn and advanced the room. The temporary room and guest identities were removed after verification.

The same web build was packaged as an Android API 36 debug APK, an unsigned release AAB, and an iOS 26.1 simulator app. All 30 production web files matched both native projects and the copied simulator artifact byte-for-byte; the downloadable artifacts passed SHA-256 verification. Native compilation passed. A new simulator launch was not attempted because the Mac had roughly 1.4 GB of free space; the earlier simulator build had launched successfully.

## Nine large-map expansion

The 20-map roster now includes three 16×12 boards for up to eight players, three 20×14 boards for up to ten, and three 24×16 boards for up to twelve. The original eleven maps and their tile sets remain intact. The new boards have distinct palettes and connected, rotationally balanced footprints. Unit tests check unique tile conservation, complete six-tile racks at each seat limit, 61/81/111-chain end targets, the expansion all-safe occupancy condition, and seeded games to final settlement with every seat filled. Desktop and mobile Chromium tests check setup limits, all 384 spaces on Metropolis Max, mobile board panning without page overflow, twelve distinct player colors, and playing tile 24P.

Validation passed 64 unit/rendering tests, 61 browser tests (21 platform-specific skips), 9 online UI tests, and 8 backend/PostgreSQL tests. The online UI suite includes configuring the 12-seat map and eleven computer seats. The fifth migration and synchronized Edge Function were deployed to the connected Supabase project. Hosted rooms with 8, 10, and 12 seats started on their respective map tiers with the correct tile inventories; opponent racks and the bag stayed masked, and all three rooms survived a reconnect. The temporary rooms and guest identity were removed afterward.

The final web build was synced into both Capacitor projects. Android API 36 debug APK and unsigned release AAB builds passed, as did the iOS 26.1 simulator build. All 30 production web files matched both native packages byte-for-byte; the three downloadable artifacts passed SHA-256 verification. Desktop and mobile browser runs covered the final twelve-color player rail. The iOS simulator was not booted for this last package update because the Mac had roughly 1.4 GB of disk space available; the prior simulator package was installed and launched successfully.

## Ten-map theme and layout expansion

The five existing optional footprints were preserved and given distinct board palettes. Five additional shapes use 80–86 unique physical tiles each: Hourglass, Crossroads, Switchback, Atoll, and Four Spires. Tests verify all eleven maps have unique tile sets and palette accents, rotational symmetry, a connected playable area, exact draw-bag conservation, and enough tiles for six seats. Seeded three- and six-player games completed on the new layouts. Desktop and mobile browser tests verify previews, theme colors, void spaces, and a real new-map game. The full check passed 61 unit tests, 57 browser tests (21 layout/platform skips), 8 online UI tests, and 8 backend tests. The authoritative Supabase engine was synchronized and deployed with the same map definitions. A hosted Four Spires room started with exactly 80 tiles, kept the opponent racks and bag masked, and retained its map after reloading. Its temporary room and guest identity were deleted.

Capacitor synced the final web files into both native projects. Android API 36 debug APK and unsigned release AAB builds succeeded; the iOS 26.1 simulator build compiled, installed, and launched. All 30 production web files matched both packaged native directories byte-for-byte, and the updated downloadable artifacts passed SHA-256 verification.

## September 28, 2026

The current build passed 59 unit/rendering tests, 55 desktop/mobile browser tests (21 platform-specific skips), 8 HTTP-mocked online browser tests, 7 backend/PostgreSQL tests, production TypeScript/Vite build, Deno endpoint typecheck, Capacitor sync, Android API 36 debug build, and iOS 26.1 simulator build/install/launch. The 12 desktop viewport/sidebar combinations passed with the playable board and controls in view. Five optional maps were checked for rotational symmetry, connected playable space, tile conservation, and completed computer games. Strategic computer tests cover the cash-starved rival merger and optional end declaration.

The connected hosted Supabase project was fixed and tested with anonymous Auth, a two-person lobby, a variant-map online game, private bag/rack masking, an accepted move, reconnecting, and a full game. That full game completed after 60 human decisions, produced three ordered chain settlements, awards and scores, and appeared in the compact archive and friends leaderboard. Two actual browser sessions also created, joined, and started a hosted Riverwalk game; both saw the same variant board through polling without JavaScript errors. Temporary test rooms, match summaries, and test guests were removed. The private database had zero rooms and zero summaries after cleanup. The four migrations and Edge Function were deployed; the daily retention job was present and a manual retention run succeeded.

The current iOS simulator build launched and rendered on iPhone 17 Pro. The Android debug APK built, but the Android emulator could not boot with only about 2 GB free on this Mac; mobile Chromium covered the new screens. Store signing and publication were not performed.

## Earlier September 17 validation

The table below records the earlier build and remains useful for regression history. Its prior result counts and hosted-project limitation are superseded by the section above.

| Check | Result | Scope |
| --- | --- | --- |
| TypeScript and Vite production build | Passed | Strict browser TypeScript, bundled production assets |
| Rules and rendering | 55 tests passed | 2008 rules, settlements, portfolio/bank visibility, chain initials, and public recap reconstruction including batched updates and mergers |
| Complete game simulations | 40 rules simulations plus 3 recap simulations | 3–6 players; tile/share conservation, nonnegative cash, deterministic replay; per-turn recap maps match actual boards |
| Desktop/mobile browser gameplay | 34 tests passed | Desktop/mobile gameplay, saved-game recovery, handoffs, mergers, final scoring, legacy saves; preference defaults/persistence, initials, hidden holdings/history/bank counts, exact recap purchases/location, bot pause, own-turn exclusion, and no historical recap replay |
| Desktop viewport layout | 15 tests passed | 84 real six-player phase/size/sidebar combinations; all 108 tiles and action/market controls fully visible, minimum 20px tiles, sidebar persistence and width recovery, mobile navigation, and a full interactive turn |
| Desktop turn recaps | 4 tests passed | Real founding and merger turns with three purchased chains at 1366×650 and 1280×720; board, purchases, and Continue all visible without scrolling the dialog; longer merger details have their own scroll area |
| Online browser integration | 7 tests passed | Actual Supabase browser client with mocked HTTP responses: rooms/rejoining/polling/stale-state protection, plus queued human/CPU recaps with exact maps and purchases, own-turn exclusion, board lock/unlock, and duplicate-poll handling |
| Backend privacy/PostgreSQL | 7 tests passed | Masked hands/bag/randomness, acting shareholder, malformed actions, secure dealing, migration/access/concurrency in embedded PostgreSQL, preserved historical rooms, and rejection of incompatible editions |
| Edge TypeScript/lint | Passed | Deno check/lint on the authoritative endpoint |
| npm audit | 0 vulnerabilities | Locked dependency tree; fresh npm ci was also verified |
| Android | Updated build installed and exercised | Real Capacitor WebView: mobile drawer works with desktop sidebar hidden, human placement/purchase and CPU recap, final Results/Market tabs, no horizontal overflow, zero page/runtime errors |
| iOS | Updated build installed, launched and visually reviewed | iPhone 17 Pro simulator on iOS 26.1; final shared web assets packaged and launch checked |

The sidebar and desktop layout update passed 115 automated tests (55 unit, 34 existing gameplay, 15 viewport/sidebar, 4 desktop recap, 7 online), distinct from the native smoke checks; complete-game simulations are included in the 55 unit tests. The backend and dependency checks remained valid from the 2008 update; that interface update changed neither backend code nor dependencies. Online UI tests used HTTP fixtures, and SQL tests used embedded PostgreSQL. A hosted Supabase project was not available during that earlier update; the live-project verification above supersedes that limitation. Store distribution and release signing have not been performed.

## Run the checks

```sh
npm run check:all
```

Install the browsers first if needed with `npx playwright install chromium webkit`. The backend test command downloads Deno through npx and runs without Docker. Internet access is needed when downloading dependencies/runtimes for the first time.

## Visual review

Original app artwork and fonts are bundled. The 2008 company names, reference-card order, colors, and share-price tiers are used throughout. Home and turn-recap layouts were checked at 320, 390, 680, and 1440 pixels without horizontal page overflow. The desktop gameplay matrix covers 1060×650, 1366×650, 1280×720, 1366×768, 1440×900, and 1920×1080 with the sidebar expanded and collapsed. Assertions check full intersection of the board and controls, not just document dimensions. Desktop, phone and native emulator layouts were reviewed for overflow and safe-area handling:

- [Desktop clubhouse](screenshots/desktop-home.png)
- [Desktop sample game](screenshots/desktop-game.png)
- [Desktop game with sidebar hidden](screenshots/desktop-game-sidebar-hidden.png)
- [Phone sample game](screenshots/mobile-game.png)
- [Desktop turn recap](screenshots/desktop-recap.png)
- [Desktop merger recap](screenshots/desktop-merger-recap.png)
- [Phone turn recap](screenshots/mobile-recap.png)
- [Phone preferences](screenshots/mobile-preferences.png)

All 30 production web files matched the packaged Android and iOS artifacts byte-for-byte. Sample game images show a deterministic 2008 midgame created for visual inspection. They are not preloaded into a user's saved games.

## Dependency note

Capacitor's Xcode project helper uses `uuid.v4()`. The package override selects the patched, CommonJS-compatible UUID 11 release instead of its vulnerable transitive UUID 7 version. Both native builds were verified with this dependency tree. Vitest is pinned to the patched 4.1 series.
