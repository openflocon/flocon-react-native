# Flocon React Native — Plan 1: Foundations

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A React Native app (Expo dev build or bare) that calls `startFlocon(...)` shows up in the Flocon desktop with
its name, device and icon, reconnects on its own, can be connected to another address with `Flocon.connect`, and
ships no Flocon native code in release builds.

**Architecture:** TypeScript port of the Flutter core (`FloconFlutter/packages/flocon/lib/src/client`), written
against a `FloconPlatform` interface. In the app, the platform is the `FloconNative` Expo module (Kotlin + Swift); in
Jest it is a Node implementation over the `ws` package talking to a fake `wss://` desktop. The native module has a full
implementation in debug and a stub in release.

**Tech Stack:** TypeScript 5, pnpm workspaces, Jest (`jest-expo` preset), Expo Modules API (Kotlin, Swift), OkHttp (Android), `URLSessionWebSocketTask` (iOS), `ws` (tests),
Expo + React Navigation (sample).

**Spec:** `docs/superpowers/specs/2026-11-21-flocon-react-native-design.md`. Reference implementation:
`FloconFlutter/packages/flocon/lib/src` (cited as `flutter:<path>`); port its behaviour, not only its names.

## Roadmap (one plan each, written when the previous one is merged)

1. **Foundations** (this plan).
2. Network: plugin, XHR capture, mocks, bad network, images, WebSocket events; sample Network + Images screens.
3. In-memory plugins: analytics, table, timeline (+ navigation and `AppState` helpers), feature flags, deeplinks,
   dashboard; their sample screens.
4. Storage plugins: file uploader (native `upload`), `@openflocon/storage`, `@openflocon/database`,
   `@openflocon/files`; their sample screens.
5. `@openflocon/crash-reporter`, `@openflocon/qr-scanner`; Crash screen, QR on the Connection screen.
6. Release: npm publishing workflow, README, docs pages; desktop PR (`FloconSdk.ReactNative`, docs tabs).

## Global Constraints

- Protocol identical to FloconFlutter: `wss://<host>:<webSocketPort>`, defaults `webSocketPort = 9023`,
  `httpPort = 9024`, host `localhost`.
- Envelope keys, exactly: `deviceId`, `plugin`, `body` (JSON string), `appName`, `appPackageName`, `method`,
  `deviceName`, `appInstance` (ms timestamp of the start), `platform` (`android` | `ios`), `versionName`.
- Handshake: plugin `bonjour`, method `bonjour`, body `{"sdk":"react-native","connectionType":"default"}` for the
  default address, `"wifi"` for the address of `Flocon.connect` (as Flutter).
- `versionName` = the `version` of `packages/react-native/package.json`, starting at `0.1.0`.
- Buffer 5000 messages, retry every 3000 ms, WebSocket open timeout 5000 ms, header `User-Agent: Flocon`.
- Every `Flocon.*` call is a no-op before `startFlocon`; nothing throws, nothing shows a red box when no desktop is
  reachable; logs only when `Flocon.isLoggingEnabled`, prefixed `[Flocon]`.
- Release builds contain no Flocon native implementation (Android `release` source set and iOS non-`DEBUG` = stub);
  `startFlocon` returns without doing anything when the stub is in.
- Package name `@openflocon/react-native` (npm org still to be created by Florent; the name can change before Plan 6).
- No `Co-Authored-By` / "Generated with Claude" lines in commits or PRs.

## Review Focus

1. **JS reload in dev** (Fast Refresh full reload, `r` in Metro): the native module survives, the JS does not. Old
   sockets must be closed when the module is invalidated, or the desktop shows two apps. Test: Task 8/9 step
   "close all sockets on reload".
2. **No desktop at start**: the app starts normally, no red box, no unhandled rejection. Test in Task 6
   (`starts with no desktop reachable without rejecting`).
3. **Desktop restarted mid-session**: state goes Connected → Buffering → Connected, messages logged meanwhile arrive
   once, in order. Test in Task 6 (`reconnects after the desktop restarts and sends the buffered messages once`).
4. **`Flocon.connect` called twice quickly / during a `disconnect`**: calls run one after the other. Test in Task 6.
5. **Release build**: `startFlocon` with the stub resolves, `Flocon.connectionState` stays `idle`. Test in Task 7.

---

### Task 1: Monorepo and core package skeleton

**Files:**
- Create: `package.json` (private, `"packageManager": "pnpm@…"`), `pnpm-workspace.yaml` (`packages/*`, `sample`),
  `tsconfig.base.json` (strict), `.eslintrc.js` / `eslint.config.js`, `.gitignore`, `LICENSE` (MIT, as FloconFlutter),
  `tool/check.sh`, `.github/workflows/ci.yml`
- Create: `packages/react-native/` with `npx create-expo-module@latest` (name `@openflocon/react-native`, native
  module `FloconNative`, Android package `io.github.openflocon.reactnative`), then delete the generated view and
  example app.
- Create: `packages/react-native/src/version.ts`, `packages/react-native/src/__tests__/version.test.ts`

**Interfaces:**
- Produces: `export const FLOCON_SDK_VERSION: string` (read from `package.json`), the workspace commands
  `pnpm -r test`, `pnpm -r typecheck`, `pnpm -r lint`.

- [ ] **Step 1: Scaffold the workspace and the package as listed above.**
- [ ] **Step 2: Write the failing test** `version.test.ts`: `expect(FLOCON_SDK_VERSION).toBe(require('../../package.json').version)`.
- [ ] **Step 3: Run** `pnpm --filter @openflocon/react-native test` — Expected: FAIL (module not found).
- [ ] **Step 4: Implement** `version.ts`.
- [ ] **Step 5: Run** `tool/check.sh` (lint, typecheck, test of every workspace) — Expected: all pass.
- [ ] **Step 6: CI** `ci.yml`: on push/PR, `pnpm install --frozen-lockfile` then `tool/check.sh`.
- [ ] **Step 7: Commit** `chore: Set up the monorepo and the core package`.

### Task 2: Address parsing

**Files:**
- Create: `packages/react-native/src/client/address.ts`, `src/client/__tests__/address.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export class FloconAddressError extends Error {}
  export interface FloconAddress { host: string; webSocketPort: number; httpPort: number }
  export function parseAddress(address: string, defaults: { webSocketPort: number; httpPort: number }): FloconAddress // throws FloconAddressError
  export function storedAddress(a: FloconAddress, defaults: { webSocketPort: number; httpPort: number }): string
  export function webSocketUrl(a: FloconAddress): string   // `wss://host:port`
  export function sameAddress(a: FloconAddress, b: FloconAddress): boolean
  ```

- [ ] **Step 1: Port `flutter:../test/address_test.dart` to `address.test.ts`**, every case, including:
  `parseAddress('192.168.1.20', d)` → `{host:'192.168.1.20', webSocketPort:9023, httpPort:9024}`;
  `'192.168.1.20:10023:10024'` → ports 10023/10024; `' my-mac.local '` → host `my-mac.local`;
  throws on `''`, `'wss://1.2.3.4'`, `'1.2.3.4/x'`, `'1.2.3.4:1:2:3'`, `'1.2.3.4:0'`, `'1.2.3.4:65536'`,
  `'1.2.3.4:000001'`, `'1.2.3.4:+1'`; `storedAddress` gives the host alone with default ports, else `host:ws:http`.
  Error messages copied verbatim from `flutter:client/address.dart`.
- [ ] **Step 2: Run** the test — Expected: FAIL.
- [ ] **Step 3: Implement** `address.ts` (same rules as `FloconAddress.parse`).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Parse the desktop addresses`.

### Task 3: Outbox

**Files:**
- Create: `src/client/outbox.ts`, `src/client/__tests__/outbox.test.ts`, `src/core/logger.ts`

**Interfaces:**
- Produces:
  ```ts
  export const FloconLogger: { enabled: boolean; log(msg: string): void; logError(msg: string, e: unknown): void }
  export class FloconOutboxLink { constructor(transport: (message: string) => boolean); isConnected: boolean }
  export class FloconOutbox {
    constructor(capacity: number);
    droppedCount: number; readonly bufferedCount: number;
    add(link: FloconOutboxLink): void; remove(link: FloconOutboxLink): void;
    enqueue(message: string): void;
    connected(link: FloconOutboxLink, handshake: string): void; disconnected(link: FloconOutboxLink): void;
  }
  ```

- [ ] **Step 1: Port `flutter:../test/outbox_test.dart`** (handshake first, then the backlog in order; capacity drops
  the oldest and counts `droppedCount`; a failed send keeps the message for the next connection; two links each
  receive everything; a message sent by all links is freed).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** as `flutter:client/outbox.dart` (cursor per link, `_firstSequence`, trim on min cursor).
  Logger: `console.log('[Flocon] ' + msg)` only when `enabled`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Keep the messages until every desktop received them`.

### Task 4: Connection state and connect results

**Files:**
- Create: `src/client/connectionState.ts`, `src/client/__tests__/connectionState.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type FloconConnectionState =
    | { type: 'idle' } | { type: 'buffering' } | { type: 'connecting' } | { type: 'connected' }
    | { type: 'failed'; reason: string };
  export type FloconConnectResult =
    | { type: 'connected' } | { type: 'notStarted' }
    | { type: 'invalidAddress'; reason: string } | { type: 'failed'; reason: string };
  export class FloconConnectionStateStore {
    readonly state: FloconConnectionState;
    set(state: FloconConnectionState, link: number): void; clear(link: number): void;
    subscribe(listener: (s: FloconConnectionState) => void): () => void; // calls listener with the current state first
  }
  ```

- [ ] **Step 1: Write the tests**: priority connected > connecting > failed > first > idle; no duplicate publication
  for the same type except `failed` with a new reason; `subscribe` gets the current state first, unsubscribe stops it.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** as `flutter:client/connection_state.dart`. **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: Publish the connection state`.

### Task 5: Platform interface, Node test platform, fake desktop, client

**Files:**
- Create: `src/platform/platform.ts`, `src/model/messages.ts`, `src/core/plugin.ts`, `src/client/floconClient.ts`
- Create (tests): `src/__tests__/support/desktopStub.ts`, `src/__tests__/support/nodePlatform.ts`,
  `src/__tests__/fixtures/test_cert.pem`, `test_key.pem` (copy from `FloconFlutter/packages/flocon/test/fixtures`),
  `src/client/__tests__/floconClient.test.ts`
- Modify: `packages/react-native/package.json` (devDependency `ws`, `@types/ws`)

**Interfaces:**
- Produces:
  ```ts
  // platform.ts
  export interface FloconAppInfos { deviceId: string; deviceName: string; platform: string; appName: string; appPackageName: string }
  export interface FloconSocket { send(text: string): boolean; close(): Promise<void> }
  export interface FloconPlatform {
    isAvailable: boolean;
    openWebSocket(url: string, handlers: { onMessage(text: string): void; onClosed(): void }): Promise<FloconSocket>; // rejects when unreachable or after 5000 ms
    appInfos(): Promise<FloconAppInfos>;
    appIconBase64Png(): Promise<string | null>;
    readStorageFile(name: string): Promise<string | null>;
    writeStorageFile(name: string, content: string): Promise<void>;
    deleteStorageFile(name: string): Promise<void>;
  }
  // messages.ts
  export interface FloconMessageFromServer { plugin: string; method: string; body: string }
  // plugin.ts
  export interface FloconMessageSender { send(m: { plugin: string; method: string; body: string }): void }
  export interface FloconPlugin { readonly pluginName: string; onConnectedToServer(): void; onMessageReceived(m: FloconMessageFromServer): void }
  // floconClient.ts
  export class FloconLink { readonly id: number; readonly address: FloconAddress; readonly isDefault: boolean; cancelled: boolean; readonly isConnected: boolean }
  export class FloconClient implements FloconMessageSender {
    constructor(config: FloconConfig, platform: FloconPlatform);
    readonly defaultLink: FloconLink; extraLink: FloconLink | null; readonly isConnected: boolean;
    register(plugin: FloconPlugin): void; plugin<T extends FloconPlugin>(ctor: abstract new (...a: any[]) => T): T | null;
    addExtraLink(a: FloconAddress): FloconLink; removeExtraLink(l: FloconLink): Promise<void>;
    connect(l: FloconLink, onClosed: () => void): Promise<void>; disconnect(l: FloconLink): Promise<void>;
    send(m: { plugin: string; method: string; body: string }): void;
  }
  export interface FloconConfig { host: string; webSocketPort: number; httpPort: number; bufferCapacity: number; rememberLastAddress: boolean; additionalAddress?: string }
  ```
- `DesktopStub.start(): Promise<DesktopStub>` (`port`, `received`, `names` = `plugin.method` list,
  `waitForMessages(n)`, `sendToAll(json)`, `stop()`), an `https` server with the fixtures and a `ws` server;
  `nodePlatform(overrides?)` opens with `new WebSocket(url, { rejectUnauthorized: false, headers: {'User-Agent':'Flocon'} })`
  and keeps storage files in a `Map`.

- [ ] **Step 1: Port the client cases of `flutter:../test/client_test.dart`** to `floconClient.test.ts`, including:
  first message is `bonjour.bonjour` with body `{"sdk":"react-native","connectionType":"default"}`; every envelope has
  exactly the keys of the Global Constraints with `versionName === FLOCON_SDK_VERSION`; messages sent before the app
  infos resolve keep their order; a desktop message `{plugin:'Device', method:'get_app_icon'}` gets back
  `device.app_icon` with the base64 body; a null icon sends nothing; an unreadable desktop message is ignored;
  plugin lookup by name is case-insensitive; `onConnectedToServer` called on every plugin after each connection.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the files above as `flutter:client/flocon_client.dart`; a send chain (`Promise`) keeps the
  order while `appInfos()` is pending.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: Talk to the desktop through a platform interface`.

### Task 6: Connections (retry, extra address, last address)

**Files:**
- Create: `src/client/connections.ts`, `src/client/addressStore.ts`, `src/client/__tests__/connections.test.ts`

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces:
  ```ts
  export class FloconConnections {
    constructor(o: { client: FloconClient; states: FloconConnectionStateStore; config: FloconConfig; addressStore?: FloconAddressStore; retryDelayMs?: number /* 3000 */ });
    start(): Promise<void>; connect(address: string): Promise<FloconConnectResult>; disconnect(): Promise<void>;
  }
  export interface FloconAddressStore { load(): Promise<string | null>; save(a: string): Promise<void>; clear(): Promise<void> }
  export function platformAddressStore(p: FloconPlatform): FloconAddressStore // file `last_address.txt`
  ```

- [ ] **Step 1: Port `flutter:../test/connections_test.dart`** (retry until the desktop starts; `connect` to a second
  stub sends `bonjour` with `connectionType: "wifi"` then the backlog; invalid address → `invalidAddress` with the
  Task 2 message; default address → `connected` or `failed` with
  `"<address> is the default address, Flocon is already trying to connect to it"`; the last address is saved and
  tried at the next start, `disconnect` forgets it; `rememberLastAddress: false` neither saves nor loads), plus the
  Review Focus cases:
  `starts with no desktop reachable without rejecting` (no unhandled rejection, state `failed` then `connecting`),
  `reconnects after the desktop restarts and sends the buffered messages once` (stop stub, log 3 messages, restart on
  the same port: received in order, no duplicates, states connected → buffering → connected),
  `serializes concurrent connect and disconnect` (`connect(a)`, `connect(b)`, `disconnect()` without awaiting: final
  state has no extra link, stub `a` socket closed). Use `retryDelayMs: 50`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** as `flutter:client/connections.dart` (promise lock).
  **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: Reconnect to the desktop and connect to another address`.

### Task 7: Public API: `Flocon` and `startFlocon`

**Files:**
- Create: `src/flocon.ts`, `src/start.ts`, `src/index.ts`, `src/useFloconConnectionState.ts`,
  `src/__tests__/start.test.ts`

**Interfaces:**
- Consumes: Tasks 2–6. `startFlocon` takes the platform as a parameter; Task 10 makes `nativePlatform` its default.
- Produces:
  ```ts
  export interface FloconPluginFactory { install(): Promise<void> }
  export class FloconSetup {
    connect(o?: { host?: string; webSocketPort?: number; httpPort?: number; rememberLastAddress?: boolean }): this;
    install(factory: FloconPluginFactory): this; // same constructor twice keeps the last one
  }
  export function startFlocon(setup?: (f: FloconSetup) => FloconSetup | void, platform?: FloconPlatform): Promise<void>;
  export const Flocon: {
    isLoggingEnabled: boolean; readonly isInitialized: boolean; readonly isConnected: boolean;
    readonly connectionState: FloconConnectionState;
    onConnectionStateChange(l: (s: FloconConnectionState) => void): () => void;
    connect(address: string): Promise<FloconConnectResult>; disconnect(): Promise<void>;
    register(p: FloconPlugin): void; plugin<T extends FloconPlugin>(ctor: abstract new (...a: any[]) => T): T | null;
    readonly messageSender: FloconMessageSender | null;
  };
  export function useFloconConnectionState(): FloconConnectionState;
  ```
  `index.ts` exports these and the types of Tasks 2, 4, 5. Later plans add `Flocon.analytics`, `.network`, etc.

- [ ] **Step 1: Port `flutter:../test/start_test.dart`** and add: before `startFlocon`, `Flocon.connect('1.2.3.4')`
  resolves `{type:'notStarted'}`, `disconnect()` resolves, `register` and `plugin` do nothing / return null;
  `startFlocon` twice starts once; factories install in call order after the client exists;
  **`startFlocon` with `{ ...nodePlatform(), isAvailable: false }` resolves, installs nothing, and
  `connectionState` stays `{type:'idle'}`** (release stub); a factory that throws is logged and the next ones still
  install.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** (module-level singleton, like the Dart statics).
  **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: Start Flocon with startFlocon`.

### Task 8: Android native module (debug implementation, release stub)

**Files:**
- Create: `packages/react-native/android/src/debug/java/io/github/openflocon/reactnative/FloconNativeModule.kt`,
  `.../debug/.../FloconWebSocketClient.kt` (OkHttp, trust-all `X509TrustManager` + hostname verifier, one OkHttp
  client per socket, 5000 ms connect timeout), `.../debug/.../FloconAppIcon.kt` (launcher icon → PNG ≤ 300 px wide →
  base64, as `FloconFlutter/packages/flocon/android/.../FloconNativePlugin.kt`)
- Create: `packages/react-native/android/src/release/java/io/github/openflocon/reactnative/FloconNativeModule.kt` (stub)
- Modify: `packages/react-native/android/build.gradle` (OkHttp dependency `debugImplementation` only),
  `expo-module.config.json` (module `io.github.openflocon.reactnative.FloconNativeModule`)

**Interfaces (both source sets, Expo module name `FloconNative`):**
- `Constants("isAvailable" to true|false)`
- `AsyncFunction openWebSocket(id: Int, url: String, timeoutMs: Int)` resolves when open, rejects with the error
  message; `Function send(id: Int, text: String): Boolean`; `AsyncFunction close(id: Int)`
- `Events("onMessage", "onClosed")` with `{ id, text }` and `{ id }`
- `AsyncFunction appInfos()` → `{ deviceId: Settings.Secure.ANDROID_ID, deviceName: "$MANUFACTURER $MODEL", platform: "android", appName, appPackageName }`
- `AsyncFunction appIconBase64Png(): String?`
- `AsyncFunction readStorageFile(name) / writeStorageFile(name, content) / deleteStorageFile(name)` in
  `context.noBackupFilesDir/flocon/` (names restricted to `[A-Za-z0-9._-]+`, else reject)
- Stub: `isAvailable = false`, every function rejects with `"Flocon is not available in release builds"`.

- [ ] **Step 1: Implement the debug module.** `OnDestroy` (module invalidated on JS reload) closes every open socket
  without emitting `onClosed` — **close all sockets on reload** (Review Focus 1).
- [ ] **Step 2: Implement the release stub.**
- [ ] **Step 3: Verify** with the sample in Task 11 (no Android unit test here: the JS tests cover the protocol).
- [ ] **Step 4: Commit** `feat(android): Add the native module, removed from release builds`.

### Task 9: iOS native module (DEBUG implementation, stub otherwise)

**Files:**
- Create: `packages/react-native/ios/FloconNativeModule.swift` (`#if DEBUG` full / `#else` stub, same API as Task 8),
  `ios/FloconWebSocketClient.swift` (`URLSessionWebSocketTask`, delegate accepting `NSURLAuthenticationMethodServerTrust`
  with `URLCredential(trust:)`, header `User-Agent: Flocon`, receive loop emitting `onMessage`), `ios/FloconAppIcon.swift`
  (as `FloconFlutter/packages/flocon/ios/Classes/FloconNativePlugin.swift`), whole files wrapped in `#if DEBUG` except
  the module.
- Modify: `ios/FloconNative.podspec`

**Interfaces:** same as Task 8; `appInfos` → `deviceId: identifierForVendor`, `deviceName: UIDevice.current.name`,
`platform: "ios"`, `appName: CFBundleDisplayName ?? CFBundleName`, `appPackageName: bundleIdentifier`; storage folder
`Application Support/flocon/`.

- [ ] **Step 1: Implement**, with `OnDestroy` closing every socket (Review Focus 1).
- [ ] **Step 2: Verify** with the sample in Task 11.
- [ ] **Step 3: Commit** `feat(ios): Add the native module, removed from release builds`.

### Task 10: JS binding of the native module and Expo config plugin

**Files:**
- Create: `src/platform/nativePlatform.ts`, `src/platform/__tests__/nativePlatform.test.ts`, `app.plugin.js`,
  `plugin/src/withFlocon.ts`
- Modify: `src/start.ts` (default platform = `nativePlatform`)

**Interfaces:**
- Consumes: the `FloconNative` module of Tasks 8–9 (`requireOptionalNativeModule('FloconNative')`).
- Produces: `export const nativePlatform: FloconPlatform` — `isAvailable` is false when the module is missing (Expo Go,
  not rebuilt) or is the stub; `openWebSocket` assigns incrementing ids and routes `onMessage` / `onClosed` events by id.
- Config plugin `withFlocon(config, { localNetworkUsageDescription?: string })`: iOS adds
  `NSLocalNetworkUsageDescription` (default `"Flocon connects to the Flocon desktop app on your computer to debug this app."`)
  if absent; Android: nothing (INTERNET is in every RN app).

- [ ] **Step 1: Write the tests** with a mocked `FloconNative` (jest mock of `expo-modules-core`): events of socket 1
  do not reach socket 2; `onClosed` of an id calls its handler once; a missing module gives `isAvailable === false` and
  `startFlocon()` resolves without calling it; config plugin keeps an existing description.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: Bind the native module and add the Expo config plugin`.

### Task 11: Sample app shell (Home, Connection)

**Files:**
- Create: `sample/` with `npx create-expo-app` (blank TypeScript), `sample/app.json` (plugin `@openflocon/react-native`,
  name `Flocon Sample`, bundle id / package `io.github.openflocon.sample`), `sample/src/startup/floconSetup.ts`,
  `sample/src/theme/sampleTheme.ts`, `sample/src/theme/sampleScreens.ts`, `sample/src/widgets/ConnectionChip.tsx`,
  `sample/src/widgets/SampleWidgets.tsx`, `sample/src/screens/HomeScreen.tsx`, `sample/src/screens/ConnectionScreen.tsx`,
  `sample/App.tsx` (React Navigation native stack)

**Interfaces:**
- Consumes: Task 7 API.
- Port from `FloconFlutter/sample/lib`: `theme/sample_theme.dart` (colors, typography), `theme/sample_screen.dart`
  (the list of screens: here only Home and Connection are reachable, the others are listed and disabled until their
  plan), `widgets/connection_chip.dart`, `widgets/sample_widgets.dart` (only the widgets these two screens use),
  `screens/home_screen.dart`, `screens/connection_screen.dart` (text field for the IP, Connect / Disconnect, result
  message; the QR button comes in Plan 5).
- `floconSetup.ts`: `Flocon.isLoggingEnabled = true; await startFlocon(f => f.connect({ host: Platform.OS === 'android' ? '10.0.2.2' : 'localhost' }))`,
  called in `App.tsx` only `if (__DEV__)`.

- [ ] **Step 1: Build the screens.**
- [ ] **Step 2: Manual check, Android emulator**, desktop running: `cd sample && npx expo run:android` → the app
  appears in the desktop with its name, device and icon; the chip shows Connected. Quit the desktop → chip
  Buffering/Connecting; restart it → Connected again. Press `r` in Metro → still **one** app in the desktop.
- [ ] **Step 3: Same check on the iOS Simulator** (`npx expo run:ios`).
- [ ] **Step 4: Connection screen**: type `10.0.2.2` on Android → "is the default address" message; type an
  unreachable IP → failed message, app keeps working; type `abc/def` → invalid address message.
- [ ] **Step 5: Commit** `feat(sample): Add the sample app with the Home and Connection screens`.

### Task 12: CI builds and release check

**Files:**
- Create: `tool/check-release-apk.sh`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add jobs**: Android (`ubuntu`, JDK 17): `cd sample && npx expo prebuild -p android && cd android && ./gradlew assembleDebug assembleRelease`;
  iOS (`macos`): `npx expo prebuild -p ios`, `pod install`, `xcodebuild -configuration Debug` and `Release` for the
  simulator.
- [ ] **Step 2: Write `tool/check-release-apk.sh <apk>`**: lists the classes with `apkanalyzer dex packages` and fails
  if `io.github.openflocon.reactnative.FloconWebSocketClient` or any `X509TrustManager` implementation from
  `io.github.openflocon` is present; passes if `FloconNativeModule` (stub) is the only Flocon class. Run it on the
  debug APK first: Expected FAIL (classes present) — proves the check works; then on the release APK: Expected PASS.
- [ ] **Step 3: Wire it in CI after `assembleRelease`.**
- [ ] **Step 4: Commit** `ci: Build the sample and check release builds have no Flocon native code`.

---

## Self-review notes

- Spec items not in this plan are in the Roadmap (Plans 2–6).
- Android custom build types (staging, QA) get the library variant their `matchingFallbacks` points to (`debug` →
  Flocon works, `release` → stub); the spec was corrected accordingly, documented in the README in Plan 6.
