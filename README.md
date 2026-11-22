<p align="center">
  <img height="450" alt="Flocon banner" src="https://raw.githubusercontent.com/openflocon/Flocon/main/ressources/flocon_banner_small.jpeg" />
</p>

# Flocon React Native

[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

React Native SDK for [Flocon](https://github.com/openflocon/Flocon), the desktop debugger for mobile apps. Once the SDK
is started, your app connects to the Flocon desktop app and shows, live: network calls, databases, preferences, files,
analytics, feature flags, timeline, dashboard, crashes and more. Also available for Kotlin
([FloconKotlin](https://github.com/openflocon/FloconKotlin)), Swift ([FloconSwift](https://github.com/openflocon/FloconSwift))
and Flutter ([FloconFlutter](https://github.com/openflocon/FloconFlutter)).

Works in **Expo apps** (development build, not Expo Go) and **bare React Native apps** (through `expo-modules-core`),
on Android and iOS.

Full documentation: **https://openflocon.github.io/Flocon/**

## Packages

The SDK is split in several packages, so that you only pull the libraries you use. All but `@openflocon/react-native`
depend on it.

| Package | What it adds | Needs |
| --- | --- | --- |
| `@openflocon/react-native` | Connection, app icon, network (`fetch`, axios, mocks, bad network, WebSocket events), analytics, feature flags, timeline, deeplinks, dashboard, tables, custom plugins | |
| `@openflocon/database` | SQLite databases: browse, query, see the queries the app runs | |
| `@openflocon/storage` | Browse and edit AsyncStorage (or any key/value store) | |
| `@openflocon/files` | Browse, download and delete the files of the app | |
| `@openflocon/crash-reporter` | Uncaught JavaScript errors, with their stack trace | |
| `@openflocon/qr-scanner` | `<FloconQrScannerView>`: connect by scanning the QR code of the desktop | `expo-camera` |

The database and files plugins use the native module of the core: they work whatever your SQLite library
(expo-sqlite, op-sqlite...) or file library.

## Install

```bash
npx expo install @openflocon/react-native
# only the ones you need:
npx expo install @openflocon/database @openflocon/storage @openflocon/files @openflocon/crash-reporter @openflocon/qr-scanner
```

Add the config plugin to `app.json`, then rebuild the app (`npx expo run:android`, `npx expo run:ios`, or your dev
build):

```json
{ "expo": { "plugins": ["@openflocon/react-native"] } }
```

Bare React Native app: install `expo-modules-core` first (`npx install-expo-modules@latest`), then `pod install`.

## Quick start

Start Flocon as early as possible, in debug builds only, and `install` the plugins you use:

```ts
import { Flocon, FloconNetwork, startFlocon } from '@openflocon/react-native';
import { FloconDatabase } from '@openflocon/database';
import { FloconStorage } from '@openflocon/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

if (__DEV__) {
  void startFlocon((flocon) =>
    flocon
      .connect({ host: Platform.OS === 'android' ? '10.0.2.2' : 'localhost' })
      .install(new FloconNetwork())
      .install(new FloconDatabase())
      .install(new FloconStorage(AsyncStorage)),
  );
}

Flocon.analytics.sender('firebase').log('checkout', { price: '12' });
Flocon.timeline.logUserAction('tap_buy', { sku: 'premium_yearly' });
```

Flocon is a debugging tool: the desktop can read your network calls, edit your preferences, delete files and run SQL
on your databases, so **do not start it in release builds**. Every other Flocon call (`Flocon.analytics`...) does
nothing when Flocon was not started, so you can leave them in your code.

**Release builds contain no Flocon native code.** The native module is in the `debug` source set on Android and under
`#if DEBUG` on iOS; release builds get a stub, so `startFlocon` does nothing there (and in Expo Go). An Android build
type of your own (staging, QA) gets the variant its `matchingFallbacks` points to: `debug` to use Flocon in it,
`release` otherwise.

**Host.** `localhost` on the iOS Simulator, `10.0.2.2` on the Android emulator (or `localhost` with
`adb reverse tcp:9023 tcp:9023` and `adb reverse tcp:9024 tcp:9024`), and the local IP address of the computer running
Flocon on a physical device. If the address is not known at start, call `Flocon.connect('192.168.1.20')` later, or scan
the QR code of the desktop:

```tsx
<FloconQrScannerView onResult={(result) => result.type === 'connected' && navigation.goBack()} />
```

The connection is a `wss://` one, so no cleartext traffic exception is needed. On iOS the config plugin adds
`NSLocalNetworkUsageDescription`, to reach the computer on the local network.

## Features

| Feature | React Native API |
| --- | --- |
| Network (HTTP) | `install(new FloconNetwork({ shouldLog, isImage }))`: `fetch` (React Native's and Expo's), axios and every library built on `XMLHttpRequest` |
| Mocks, bad network | set from the desktop, applied by the interceptor |
| WebSocket | `Flocon.network.logWebSocketEvent(event)`, logged manually |
| Databases | `install(new FloconDatabase())`, `Flocon.database.register(name, path)`, `Flocon.database.logQuery(path, sql, args)` |
| Preferences | `install(new FloconStorage(AsyncStorage))`, `Flocon.preferences.register(store)` |
| Files | `install(new FloconFiles())`, `Flocon.files.register(name, path)` |
| Dashboard | `Flocon.dashboard.dashboard(id, [FloconSection(...), FloconSection.listen(...), FloconForm(...)])` |
| Tables | `Flocon.table.table('users').log({ name: 'Flo' })` |
| Deeplinks | `Flocon.deeplinks.register([...])` |
| Analytics | `Flocon.analytics.sender('firebase').log(...)` |
| Feature flags | `Flocon.featureFlags.register('firebase', [...])` |
| Timeline | `Flocon.timeline`, `floconNavigationTracking(navigationRef)`, `FloconLifecycleObserver.start()` |
| Crash reporter | `install(new FloconCrashReporter())` |
| Connection | `Flocon.connect(address)`, `Flocon.disconnect()`, `useFloconConnectionState()` |

React Native limits:

- Images loaded by `<Image>` or `expo-image`, and the calls of native SDKs, do not go through JavaScript and are not
  captured.
- WebSocket traffic is not intercepted: log the events of the connections you want to inspect.
- Only JavaScript errors are reported; native crashes (Kotlin, Java, Swift, C++) are not.
- No WebView inspection and no accessibility tools.

## Sample

[`sample/`](sample) is an Expo app (Android, iOS) with one screen per plugin, styled like the Flocon desktop. Start the
Flocon desktop app, then:

```bash
npm install
cd sample && npx expo run:android   # or run:ios
```

## Development

```bash
npm install
tool/check.sh        # typecheck and tests of every package and the sample
```

The core is a TypeScript port of the Flutter SDK, tested in Node against a fake `wss://` desktop. Releases:
`tool/bump_version.sh <version>`.

## License

MIT
