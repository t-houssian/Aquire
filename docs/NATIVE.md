# iOS and Android

The September 29 hotel-roster, board-contrast, and game-exit updates are built for both native projects. The default seven-chain game is unchanged; new tables can select any 2–12 chains and set 1–100 certificates for each selected chain. Placed independent tiles now have a distinct stone face and building icon, and the classic board fills narrow screens. Leaving an unfinished game offers Save & exit or End game & remove; My games also has a separate End game control. Android debug APK and unsigned release AAB, plus an iOS simulator app, compiled successfully. The current [Android APK](../artifacts/aquire-android-debug.apk) and [iOS simulator ZIP](../artifacts/aquire-ios-simulator-20260929.zip) contain the same 30 production web files as `dist/`; all three packages are listed in [SHA256SUMS](../artifacts/SHA256SUMS). The iOS simulator was not booted for this update because disk space was limited; an earlier simulator build launched successfully.

The fourteen-map shape expansion has been synchronized into both native projects. The new 11×17 six-seat board and 30×17/23×23 twelve-seat boards use the same pan-capable board layout as the web app. Android API 36 debug and unsigned release builds and the iOS 26.1 simulator build compiled successfully. All 30 production web files match both packaged native projects, and the refreshed downloads in `artifacts/` pass SHA-256 and archive checks. The simulator was not booted for this update because the Mac had roughly 1 GB free; an earlier simulator package was installed and launched successfully. Desktop/mobile browser tests exercised the new dimensions and tile 30I.

The September 28 house-rule update has been synchronized into both native projects. Android API 36 debug and unsigned release builds and the iOS 26.1 simulator build compiled successfully. All 30 production web files match the packaged Android and iOS files, and the refreshed downloads in `artifacts/` pass SHA-256 checks. The simulator was not booted for this update because the Mac had roughly 1.4 GB free; the previous simulator build was installed and launched successfully. Desktop/mobile browser and backend tests cover the new rules.

The repository includes real Capacitor native projects for `com.aquire.game`, named **Aquire**. Both package the same production React app from `dist/`, following the printed 2008 Acquire rules for 3–6 players and offering custom large-map expansions for up to twelve. Local solo and pass-and-play games, fonts, artwork, and saves work without a development server or internet connection. Supabase online rooms require network access and the configuration in [ONLINE.md](ONLINE.md).

## Refresh the native apps

After changing React, CSS, assets, or public environment variables:

```sh
npm run cap:sync
```

This builds the web app and copies it into both native projects. Native icon and launch assets are included; their artwork is derived from `public/favicon.svg`. The iOS app icon is an opaque 1024px PNG. Android includes density-specific launcher icons and adaptive icon layers.

The 2008 app uses a new local-save namespace (`aquire.games.v2`). Earlier saved games remain untouched in their original namespace; they are not silently converted to different prices or rules. Start a new 2008 table after upgrading. Anonymous Supabase identity remains persistent, while earlier online tables are isolated by the server's ruleset migration.

The iOS project supports iPhone and iPad, portrait and landscape, with a light appearance matching the app. Android supports phones, tablets, rotation, and window resizing. The app keeps game state through rotation and saves local games after each move.

## iOS

Use macOS, Xcode 26 or later, and an installed simulator runtime. The project uses Swift Package Manager; CocoaPods is not required. The minimum deployment target is iOS 15. These requirements follow the [Capacitor 8 migration guide](https://capacitorjs.com/docs/updating/8-0).

```sh
npm run ios
```

Xcode opens `ios/App/App.xcodeproj`. Select the **App** scheme and an iPhone or iPad simulator, then Run. A real iPhone build additionally needs your Apple development team selected under Signing & Capabilities.

To build a simulator app from the terminal without signing:

```sh
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/aquire-ios-build \
  CODE_SIGNING_ALLOWED=NO build
```

The result is `/tmp/aquire-ios-build/Build/Products/Debug-iphonesimulator/App.app`. Install it on a booted simulator:

```sh
xcrun simctl install booted /tmp/aquire-ios-build/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch booted com.aquire.game
```

## Android

Use Android Studio with Java 21 and Android SDK 36. This project targets API 36 and supports API 24+. Android Studio includes a suitable Java runtime; an empty `/usr/bin/java` shim on macOS does not mean Java is unavailable.

```sh
npm run android
```

Android Studio opens `android/`. Let Gradle sync, select an emulator or USB-connected device, and Run. For a terminal build on this Mac, use the already-installed Android Studio runtime and SDK:

```sh
cd android
env JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' \
  ANDROID_HOME="$HOME/Library/Android/sdk" \
  ./gradlew assembleDebug --no-daemon
```

The installable development APK is `android/app/build/outputs/apk/debug/app-debug.apk`. A ready-to-install copy from the verified build is also provided at `artifacts/aquire-android-debug.apk`. To install it on a connected Android device/emulator:

```sh
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.aquire.game/.MainActivity
```

If `adb` is not on your PATH, this Mac has it at `$HOME/Library/Android/sdk/platform-tools/adb`. A physical phone needs USB debugging enabled. The APK uses Android's debug signing identity; a release build requires your own release signing configuration.

## Build verification

Both 2008 native projects were compiled successfully on this workspace with Xcode 26.1 and Android Studio's Java 21.0.8 runtime/SDK 36. The iOS app was installed and launched on the iPhone 17 Pro simulator (iOS 26.1), and its 2008 edition label and 3–6 player guidance were visually verified.

The Android APK was installed over the earlier app on an API 36.1 emulator. A real earlier-edition game was created before upgrading; its saved JSON remained byte-for-byte unchanged afterward and was not offered as a 2008 resume. A new native game used three seats, state version `2`, ruleset `2008`, and the seven 2008 hotel-chain IDs. Tile placement, founding Worldwide, completing the purchase phase, advancing the turn, and replenishing the rack to six tiles were exercised. Reloading and choosing Continue game restored the new match. No JavaScript page errors occurred during these interactions.

All 30 production web files inside both artifacts were compared byte-for-byte with the final `dist/` output. The simulator build is available in `artifacts/ios-simulator/App.app` and packaged as `artifacts/aquire-ios-simulator.zip`; it runs in an iOS simulator, not on a physical iPhone. Artifact hashes are recorded in `artifacts/SHA256SUMS`. Build outputs under `artifacts/` are excluded from Git.

The chain-initials, information-preferences, and turn-recap update was rebuilt for both platforms. The iOS simulator app installed and launched successfully. An earlier Android APK was tested in its actual Capacitor WebView: colored chain tiles showed their first letters; hidden opponent portfolios and availability-only bank labels rendered correctly. A computer turn displayed its highlighted `5B` placement and purchases of one Festival share and two Tower shares, while the next computer remained paused until the recap was acknowledged. These interactions produced no JavaScript page errors. The emulator’s earlier local data was restored after the smoke test.

The sidebar and viewport-fit board update was subsequently rebuilt and installed on both simulators. The iOS app launched with its mobile presentation intact. In the Android app, a stored desktop-collapse preference still allowed the mobile drawer to open and navigate, a human placed `1D` and completed buying, and the following computer recap correctly displayed `3H`. That older build's Results panel showed all three settlements. The mobile page measured 411 CSS pixels wide with no horizontal overflow, and these checks reported no JavaScript page errors. The device’s earlier local data was restored afterward. A [native Results screenshot](../artifacts/android-results.png) documents that earlier layout.

Additional screenshots from the earlier Android build show [preferences](../artifacts/android-preferences.png), [board initials](../artifacts/android-board.png), and the [turn recap](../artifacts/android-turn-recap.png).

The final Android startup log had no JavaScript console errors. Capacitor's native inset handling is configured to preserve safe areas without its redundant startup CSS injection. Screenshots of the compiled apps are provided at `artifacts/ios-home.png` and `artifacts/android-home.png`.

These are local development builds. App Store/TestFlight and Play Store publication are separate steps and have not been performed.

## September 28, 2026 update

Both native projects were synchronized and compiled again with the new maps, three difficulty levels, default hidden holdings, compact history, and closing-bell ceremony. The iOS simulator app installed and launched on an iPhone 17 Pro (iOS 26.1); its home screen rendered correctly. An unsigned iOS device Release build and Android API 36 debug APK plus unsigned Release AAB also compiled successfully. The Android emulator could not boot for this update because the Mac had only about 2 GB of free disk space, below the emulator's requirement; equivalent mobile browser interaction tests passed in Chromium. All 30 production web files matched the assets packaged for each native platform byte-for-byte (Capacitor adds two small runtime shims). The current Android debug APK, unsigned AAB, [iOS simulator ZIP](../artifacts/aquire-ios-simulator-20260928.zip), and SHA-256 hashes are in `artifacts/`.

For release distribution, use [DEPLOY.md](DEPLOY.md). The signed store uploads and owner-controlled listings remain separate from the debug APK and simulator app.

## Large-map update

The nine 8-, 10-, and 12-seat maps were synchronized into both native projects, including the full 24×16 boards and distinct colors for all twelve seats. The Android debug APK and unsigned release AAB compiled with API 36; the iOS 26.1 simulator app compiled. The 30 production web files matched the Android and iOS packaged files byte-for-byte, and the refreshed artifacts in `artifacts/` passed the SHA-256 checks. Desktop and mobile Chromium gameplay tests covered the new setup, board panning, and placement at tile 24P. The iOS simulator was not booted for this final package update because the Mac had roughly 1.4 GB of free disk space; its previous package was launched successfully.

## Ten-map update

The ten themed optional maps and their setup previews were synced into both native projects. The updated Android debug APK and unsigned AAB compiled with API 36; the updated iOS app compiled, installed, and launched on the iPhone 17 Pro simulator. Both packages include the exact 30-file production web build, and the current files in `artifacts/` have matching SHA-256 hashes. Mobile browser tests exercised the new map selector and board; a physical Android device or emulator was not available for this update.
