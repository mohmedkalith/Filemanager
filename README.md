# FileOS — React Native foundation

FileOS is being rebuilt in **React Native, TypeScript and Expo**. This is an early, offline-first foundation, **not** the complete production-ready application described in the original request. It uses real app-owned files; there are no fake file listings. Back up important files outside the app before testing.

## Current capabilities

- Browse the app's documents directory and its subfolders. Create folders and empty files, rename, duplicate, delete with confirmation, copy or move single/multiple selected items, and sort a listing.
- Import files from the operating system's document picker into app-owned storage. Existing names are rejected instead of intentionally overwritten. Sharing a file invokes the system share sheet.
- Persist favorite paths and recently opened files. Show or hide dot-prefixed names. Dashboard counts, category cards, and direct-file sizes reflect the current folder.
- Filter the current folder by name, or scan subfolders using a cancellable, case-insensitive filename search capped at 500 matches. It does not index or search file contents.
- Preview UTF-8 text and code as plain selectable text (up to 1 MiB), and images using the platform decoder. Other files show an honest unsupported-preview message and can be shared to another app.
- Android can browse a user-selected Storage Access Framework directory read-only, including accessible subfolders. The OS retains the selected grant when permitted; access can be revoked. Text/image previews and importing individual copies are available. The dashboard reports OS-provided internal capacity and free space when available. These new features still require device/provider testing.
- Basic audio and video playback uses Expo's SDK-compatible native players. Audio offers play/pause, skip and speed; video uses platform controls. Actual playback depends on device codecs. These features have not been tested on a device.
- Mobile bottom navigation and an adaptive wider-screen sidebar. Android native project files are included.

**Important storage restriction:** file operations modify only FileOS's app-owned directory. The Android selected-folder browser is read-only, and importing makes a copy; it does not edit the original. Android MediaStore and unrestricted device-wide access are not implemented; access to SD/USB or provider locations depends on the Android picker and provider. iOS security-scoped folder access is not implemented. Uninstalling the app or clearing its data can permanently remove imported files. Backups are disabled in the Android manifest and must be handled separately by the user.

## Setup and development

Requirements: Node.js 22, npm, JDK 17, Android Studio and a compatible Android SDK for Android builds. For iOS, use macOS with Xcode and CocoaPods. Dependencies are pinned in `package-lock.json`.

```sh
npm ci
npm run typecheck
npm test
npx expo start
```

Use an Android emulator/device and `npm run android` for a development build, or a compatible Expo Go version where supported. iOS native files have not been generated or verified; on macOS run `npx expo prebuild --platform ios` before trying `npm run ios`. Web does not provide app-owned native filesystem access and intentionally shows an unavailable message instead of simulated files.

## Produce an Android APK

The native project is included. On a machine with JDK 17, Android SDK, and access to Gradle/Google Maven repositories:

```sh
npm ci
cd android
./gradlew assembleRelease
```

A successful build places a standalone APK under `android/app/build/outputs/apk/release/`. **The current release variant is signed using the local Android debug key for testing only.** It is not suitable for publishing; configure a private release signing key, review permissions and perform security/device testing before distribution. Never commit private keys or passwords.

The GitHub Actions workflow, `.github/workflows/android-apk.yml`, runs checks and builds a test APK as an artifact on pushes to this session branch (and supports manual dispatch when enabled on the default branch). It checks the package name, bundled JavaScript, APK signature and SHA-256. Earlier builds ran successfully and their artifacts are available on GitHub. New builds use the public test-only debug key from the pinned Expo template; older builds used a different generated key, so switching from an older build may require uninstalling and will clear app-owned files. Later builds must continue using the same key to be installable as updates. `eas.json` also contains an Expo preview APK profile, but remote build and signing have not been verified.

**No APK was generated in the current sandbox:** Java and the Android SDK are absent. Network probes also failed for Google, Tencent's mirror, Gradle services and Maven Central; the GitHub JDK download redirects to a blocked host. The build command was attempted and failed at the missing Java prerequisite. The JavaScript Android bundle was exported successfully; a bundle is not an APK and does not establish native build or runtime correctness.

## Capability matrix

| Area | Status |
|---|---|
| App-owned files, create/rename/duplicate/delete, copy/move | Implemented in source; native device testing still required |
| Batch selection and copy/move/delete | Implemented in source; sequential, no transfer progress or cancellation |
| Import and share individual files | Implemented using OS picker/share sheet; requires device testing |
| Favorites, recent files, folder search | Implemented for app-owned paths; no index or external filesystem tracking |
| TXT/MD/code/CSV and similar UTF-8 text | Plain text preview only; no editor or syntax highlighting |
| JPEG/PNG/GIF/WebP/BMP | Basic decoder-dependent image preview; no zoom or editing |
| Audio/video | Basic integrated playback for common extensions; codec-dependent and not device-tested |
| PDF, Office, spreadsheets, e-books, archives | No built-in viewer; sharing to an external app is available |
| Storage capacity and analytics | OS-provided internal capacity/free space plus current-folder counts; no recursive analysis |
| Android selected-folder access | SAF read-only browsing and file import; provider/device testing outstanding |
| Vault, recycle bin, archive extraction, cloud/network, OCR | Not implemented |
| Android | Previous test APK built; the new SAF implementation still requires device/provider tests |
| iOS | Source intended to run with Expo; native project and device testing outstanding |
| Windows/macOS/Linux | Not implemented as native desktop builds |

## Architecture and safety

- `src/core/fileStore.ts` contains path validation and storage operations against an injectable adapter; `nativeStore.ts` binds it to Expo's native filesystem API.
- `src/core/search.ts` performs a bounded cooperative traversal. `src/features/Preview.tsx` provides the limited built-in preview and fallback. `src/components/design.tsx` provides reusable visual components. `App.tsx` currently owns presentation state and needs further decomposition as features grow.
- Tests use in-memory and Node temporary-filesystem adapters **only in tests**. Production paths use Expo filesystem APIs, never seeded demo files.
- Destination checks are not atomic; external concurrent modifications, interrupted copies, full disks, or a crash may leave partial results. There is no undo, recycle bin, conflict-resolution UI, operation queue, copy progress, or guaranteed transactional behavior. Do not rely on this version for critical data.
- Recursive search is not isolated or indexed, and cancellation may wait for a native directory call to finish. Large folders are loaded into memory. Some image files may exceed device memory or decoder support.
- No encryption, analytics, account, cloud sync, or automated upload is implemented. The Android manifest retains network permission for React Native/Expo infrastructure; core file operations do not require a connection.

## Verification and next phases

The TypeScript compiler and Node tests pass in the development environment. Previous Android test APKs were built, signed with a debug key, and verified via GitHub Actions. The current SAF implementation has not been tested on an Android device or against real providers; no iOS build, permission test, security audit, or production signing verification has been completed.

Next: test selected-folder access on actual Android devices/providers; implement additional platform storage providers and safe, recoverable transfers; restore advanced search and explorer features; add a modular viewer registry and tested decoders; then storage analysis, secure vault, accessibility, comprehensive settings, performance work, automated integration tests and release review. Unsupported capabilities must remain explicitly labeled until actually implemented and tested.
