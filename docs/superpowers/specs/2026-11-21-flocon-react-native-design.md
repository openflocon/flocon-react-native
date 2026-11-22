# Flocon React Native SDK — design

Date: 2026-11-21. Status: draft, awaiting approval.

## Intent

Give React Native apps the same Flocon experience as Flutter apps: once the SDK is started in a debug build, the app
connects to the Flocon desktop and shows network calls, databases, preferences, files, analytics, feature flags,
timeline, dashboard, tables, deeplinks and crashes, live, and the Flocon MCP server can read them.

The Flutter SDK v2 ([FloconFlutter](https://github.com/openflocon/FloconFlutter), `packages/`) is the reference:
same protocol, same features, same split in packages, an API as close as TypeScript allows, and the same sample app.
When this document does not say how something behaves, it behaves like FloconFlutter.

## Goals

- A TypeScript SDK in `openflocon/flocon-react-native`, published on npm, working in **Expo apps (dev build) and bare
  React Native apps** (Android and iOS).
- Feature parity with FloconFlutter v2 (table below).
- An API close to FloconFlutter's: `startFlocon(...)`, `Flocon.connect / disconnect / connectionState`,
  `Flocon.analytics`, `Flocon.table`, `Flocon.timeline`, `Flocon.featureFlags`, `Flocon.deeplinks`,
  `Flocon.dashboard`, `Flocon.network`, and one installable factory per plugin package.
- Every `Flocon.*` call is a no-op when Flocon was not started, so apps leave them in code and only guard the start
  with `if (__DEV__)`.
- A sample app with the same screens, data and look as `FloconFlutter/sample`.
- Unit tests ported from the Flutter tests (`packages/*/test`), so both SDKs are held to the same behaviour.

## Non-goals (v1)

- Native crashes (Kotlin, Java, Swift, C++): only JS errors, as Flutter reports only Dart errors.
- Automatic WebSocket capture (logged manually with `Flocon.network.logWebSocketEvent`, like Flutter), WebSocket
  mocks, WebView inspection, accessibility tools.
- Capture of images loaded by `<Image>` / `expo-image`: they are loaded natively, outside JS (see Network).
- React Native Web, Windows, macOS; Expo Go.
- MMKV / op-sqlite adapters (the adapter interfaces allow adding them later).

## Anti-goals

- Flocon running in release builds, or native Flocon code in them (see Release builds).
- An app that crashes, hangs at start or logs errors when no desktop is reachable.
- An API that drifts from FloconFlutter without a React Native reason.

## Constraints

- **Protocol**: the one of FloconFlutter, unchanged. `wss://<host>:9023` (WebSocket), `https://<host>:9024` (file
  uploads). Every message is the envelope of `message_to_server.dart` (`deviceId`, `plugin`, `method`, `body` as a
  JSON string, `appName`, `appPackageName`, `deviceName`, `appInstance`, `platform`, `versionName`). On connection the
  SDK sends `bonjour.bonjour` with body `{"sdk": "react-native", "connectionType": "default" | ...}`.
- **Self-signed certificate**: the desktop serves a self-signed certificate. React Native's `WebSocket` and `fetch`
  refuse it, hence a native module for the WebSocket and the uploads (accept the certificate, no verification; the
  link stays encrypted, no cleartext/ATS exception needed).
- **Hosts**: `localhost` on the iOS Simulator, `10.0.2.2` on the Android emulator, the computer's IP on a device.
- **Expo + bare from one code base**: the native code is an Expo module (Expo Modules API, Kotlin + Swift). Bare apps
  get it through `expo-modules-core` (`npx install-expo-modules`), which is the documented path. Expo apps need a
  config plugin for the permissions and a dev build.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | TypeScript port of the Flutter core + a small native module (WebSocket/uploads accepting the certificate, app infos, icon, storage folder) | Same architecture and behaviour as Flutter; dashboard/deeplinks/flags call JS directly; little native code. No native crashes. |
| B | Bridge to FloconKotlin and FloconSwift | Protocol already written and native crashes for free, but every JS call crosses the bridge, two native SDKs to follow so the API drifts, JS `fetch` not seen by native interceptors on iOS, KMP weight. |
| C | Pure JS, no native code | Impossible without a cleartext `ws://` port on the desktop and cleartext exceptions in every app. |

Chosen by Florent: **A**, supporting Expo and bare.

## Design

### Repository layout

```
flocon-react-native/
  packages/
    react-native/            core + native module (Expo module) + Expo config plugin
    database/                SQLite, via expo-sqlite
    storage/                 preferences, via @react-native-async-storage/async-storage
    files/                   app files, via expo-file-system
    crash-reporter/          uncaught JS errors and unhandled rejections
    qr-scanner/              connect by scanning the desktop QR code, via expo-camera
  sample/                    Expo app, same screens as FloconFlutter/sample
  tool/                      check (lint, typecheck, test of everything), bump version
  .github/workflows/         CI, release
```

Every package but `react-native` depends on it (peer dependency), like the Flutter packages depend on `flocon`.
The third-party libraries (`expo-sqlite`, `async-storage`, `expo-file-system`, `expo-camera`) are peer dependencies:
the app picks their version.

### Core (`packages/react-native`)

Port of `FloconFlutter/packages/flocon/lib/src`, file by file where it makes sense:

- `client/`: `FloconClient` (plugins, routing of incoming messages, envelope), `FloconConnections` (default address +
  the one of `Flocon.connect`, retry every 3 s, reconnect on drop), `outbox` (buffer of 5000 messages while
  disconnected, oldest dropped), `address` (parsing of `host[:wsPort[:httpPort]]`), `address_store` (last address,
  `rememberLastAddress`), `file_uploader`.
- `plugins/`: analytics, table, timeline, feature flags, deeplinks, dashboard, network (store, overrides = mocks and
  bad network, WebSocket events). Same plugin names, methods and JSON bodies as Flutter.
- `core/`: logger (`Flocon.isLoggingEnabled`, `[Flocon]` prefix), storage (JSON files in the storage folder).

Public API (TypeScript transposition of the Dart one):

```ts
import { startFlocon, Flocon, FloconNetwork } from '@openflocon/react-native';

if (__DEV__) {
  await startFlocon((flocon) => flocon
    .connect({ host: Platform.OS === 'android' ? '10.0.2.2' : 'localhost' })
    .install(new FloconNetwork({ isImage: (req) => new URL(req.url).host === 'picsum.photos' }))
    .install(new FloconDatabase())
    .install(new FloconFiles())
    .install(new FloconCrashReporter())
    .install(new FloconStorage(AsyncStorage)));
}

Flocon.analytics.sender('firebase').log('checkout', { price: '12' });
Flocon.timeline.logNavigation('Home');
const result = await Flocon.connect('192.168.1.20');
const unsubscribe = Flocon.onConnectionStateChange((state) => { ... });
```

Dart → TS rules: cascades become chained methods returning the setup; `Stream` becomes a listener returning an
unsubscribe function (plus a `useFloconConnectionState()` hook); `Future` becomes `Promise`; sealed result classes
become discriminated unions (`{ type: 'connected' } | { type: 'error', error } | ...`); names keep their Flutter
spelling.

### Native module (`FloconNative`, in `packages/react-native`)

Kept minimal; everything else is TypeScript.

- `webSocket`: open (url, headers `User-Agent: Flocon`, 5 s timeout), send text, close; events `message`, `closed`,
  `error`. Accepts any certificate. Android: OkHttp with a trust-all `X509TrustManager` + hostname verifier. iOS:
  `URLSessionWebSocketTask` with a delegate accepting the server trust. Several sockets at once (default address +
  `Flocon.connect` one), identified by an id.
- `upload`: multipart POST of a local file to `https://host:httpPort/...`, same request as `file_uploader.dart`,
  same certificate handling.
- `appInfos`: deviceId (Android ID / identifierForVendor), deviceName, platform, appName, appPackageName.
- `appIconBase64Png`: the launcher icon, like `core/app_icon.dart`.
- `storageDirectory`: the app support folder.

### Release builds

Chosen by Florent: **native code removed, JS inert**.

- Android: the native implementation lives in the `debug` source set; the `release` source set has a stub with the
  same API that reports "unavailable". Other build types (staging, QA) get the variant their `matchingFallbacks` points to (`debug` → Flocon,
  `release` → stub): a library cannot see at build time whether the app variant is debuggable.
  No trust-all `TrustManager` in a release APK/AAB, so no Google Play "unsafe TrustManager" warning.
- iOS: the implementation is compiled under `#if DEBUG` (Debug configuration); otherwise the same stub.
- The permissions Flocon adds (camera for the QR scanner on Android) go in the debug manifest only. iOS usage
  descriptions are plain strings, they stay in the Info.plist of every configuration (they grant nothing).
- JS: the TypeScript of the SDK stays in the release bundle (Metro does not tree-shake) but is never run: the app
  guards `startFlocon` with `if (__DEV__)`, and `startFlocon` also does nothing when the native module is the stub.
  No no-op npm packages.
- Accepted: the native peer dependencies chosen by the app (`expo-sqlite`, `expo-file-system`, `expo-camera`) are
  linked in release, as any dependency of the app.
- CI checks it: a release build of the sample, then a check that the APK has no Flocon WebSocket class.

Expo config plugin: adds `NSLocalNetworkUsageDescription` (iOS) and `INTERNET` (Android); the QR scanner adds the
camera permission through `expo-camera`'s own plugin.

### Network (in the core)

- My call, after review: unlike Flutter, there is no separate network package. Flutter needs `flocon_dio` and
  `flocon_http` because each HTTP client is wired by the app; in React Native every client goes through the global
  `XMLHttpRequest`, which has no dependency, so the capture lives with the network plugin in the core.
  `FloconNetwork` (options, as `network_options.dart`) is exported by the core.

- In React Native, `fetch` is a polyfill over `XMLHttpRequest`, and axios uses `XMLHttpRequest`: one patch of
  `global.XMLHttpRequest` captures all of them. `install(new FloconNetwork(...))` installs the patch; it is never
  installed when Flocon is not started.
- Each call is sent like the Flutter Dio/http adapters send it (request, response, duration, errors), images per
  `isImage` or an `image/*` content type.
- Mocks and bad network set from the desktop are applied in the patch: a mock answers without calling the network,
  bad network adds latency or fails the call, as in `network_overrides.dart`.
- Limit (documented): `<Image>`, `expo-image` and native SDKs load outside JS and are not captured; the sample's
  Images screen downloads through `fetch`, like the Flutter one goes through its HTTP clients.

### Other packages

- **database**: lists the SQLite databases of the app folder and registered ones (`Flocon.database.register(name,
  path)`), runs the desktop queries, reports the queries the app runs when it uses the provided wrapper. Backend
  `expo-sqlite`, behind a small adapter interface.
- **storage**: shows and edits key/values, `new FloconStorage(AsyncStorage)`; adapter interface for other stores.
  Desktop plugin: the Flutter preferences one.
- **files**: browse, download (via `upload`), delete the files of the document and cache folders and registered
  folders (`Flocon.files.register('Exports', path)`), via `expo-file-system`.
- **crash-reporter**: `ErrorUtils.setGlobalHandler` (chained to the previous handler) and unhandled promise
  rejections; the report is written to disk at once and sent at the next connection, like `crash_store.dart`.
- **qr-scanner**: `<FloconQrScannerView onResult={...} />`, parses the desktop QR code and calls `Flocon.connect`, like
  `qr_connector.dart`.
- **timeline helpers** (core): `floconNavigationTracking(navigationRef)` for React Navigation (Expo Router exposes
  the same ref), and `FloconLifecycleObserver.start()` on `AppState`, the counterparts of `FloconNavigatorObserver`
  and `FloconLifecycleObserver`.

### Sample (`sample/`)

Expo app (dev build), React Navigation stack, same screens and the same content as `FloconFlutter/sample/lib`:
Home, Connection (type an IP or scan the QR code), Network, Images, Database, Preferences, Files, Dashboard,
Deeplinks (`/user/`, `/post/`, `/settings/` destinations), Analytics, Feature flags, Timeline, Crash; the Flocon
desktop look (`theme/sample_theme.dart`) and the connection chip. It uses the packages from the workspace.
`npx expo run:ios` / `run:android`.

### Tests and tooling

- Jest, the Flutter tests ported per package (fake desktop as in `test/support`), the native module mocked in JS.
- Native code checked by building the sample on both platforms in CI.
- `tool/check.sh`: lint, typecheck, tests of every package and the sample.
- Release: one version for all packages, tag `v<version>`, publish to npm from CI, like FloconFlutter's workflows.

### Desktop side (separate PR in openflocon/Flocon)

- Add `FloconSdk.ReactNative(sdkName = "react-native", repository = "openflocon/flocon-react-native")` so the version
  check works, and update `VersionCheckerRepositoryImplTest` / `ObserveIsClientOnLastVersionUseCaseTest`, which use
  `react-native` as their example of an unknown SDK.
- A React Native tab on each feature page of the documentation site, and `docs/install-react-native.md`.

## Left to the builder (my calls, can be changed)

- Workspace manager: pnpm workspaces (supported by Expo for monorepos).
- Minimum versions: the current stable Expo SDK and the React Native version it ships, New Architecture only.
- `expo-sqlite`, `async-storage`, `expo-file-system`, `expo-camera` as backends; React Navigation in the sample.
- Package naming `@openflocon/<package>` (see open question).
- Order of work: core + native module + sample Home/Connection first, then network, then the other plugins one by one,
  each with its sample screen.

## Open questions for Florent

- npm scope: `@openflocon/*` needs an `openflocon` npm organisation (free, not created yet; the names are free).

## Changes made while building (2026-11-22)

- **Network**: Expo SDK 58 replaces the `fetch` of React Native (built on `XMLHttpRequest`) by a native one
  (`expo/fetch`). The core therefore wraps the global `fetch` too, unless it is React Native's (`fetch.polyfill`),
  so that no call is logged twice. axios and other XHR-based libraries go through the XHR interceptor.
- **Database and files**: instead of `expo-sqlite` and `expo-file-system`, the native module of the core lists, resolves,
  sizes and deletes files and runs SQL on its own SQLite connection (Android `SQLiteDatabase`, iOS `sqlite3`), debug
  only like the rest. `@openflocon/database` and `@openflocon/files` have no native dependency and work whatever SQLite
  library the app uses. Paths are resolved through their links (`/data/user/0` and `/data/data` on Android).
- **Workspace**: npm workspaces instead of pnpm (no extra tool to install; Expo supports both).
- **Android build types**: as noted under Release builds, a custom build type follows its `matchingFallbacks`.
