# TGK TEST EMULATORS

Private, standalone native NES Emulator with **zero WebView wrapper**, single primary `libretro-fceumm` NES core architecture, real user-selected `.nes` ROM loader, 2-Player VS Mode (Port 1 & Port 2), Quick Save/Load State (Slots 1–3), and automatic cloud `.apk` builds via **GitHub Actions**.

## Architecture

- **Native Android App (`android/`)**: Pure Kotlin + C++17 JNI (`tgk_nes_bridge`) + `SurfaceView` + `AudioTrack` — zero WebView.
- **Primary Native Core**: [`libretro/libretro-fceumm`](https://github.com/libretro/libretro-fceumm) compiled in GitHub Actions with Android NDK (`arm64-v8a` & `armeabi-v7a`) and dynamically loaded via `dlopen()` behind `IEmulatorCore`.
- **Web Preview & Netplay Relay (`src/`)**: [`libretro/libretro-fceumm`](https://github.com/libretro/libretro-fceumm) WASM adapter + WebSocket 2-Player Netplay server (`server.ts`) behind `INesEmulatorCore` with user-selected `.nes` ROM loading.

## Folder Structure

```text
.
├── .github/
│   └── workflows/
│       └── build-apk.yml                     # Cloud Android APK builder + TS/JS unit tests
├── android/                                  # Standalone Native Android App (Zero WebView)
│   ├── settings.gradle.kts
│   ├── build.gradle.kts
│   ├── gradle.properties
│   └── app/
│       ├── build.gradle.kts                  # NDK + CMake + ABI config (arm64-v8a, armeabi-v7a)
│       ├── proguard-rules.pro
│       └── src/main/
│           ├── AndroidManifest.xml
│           ├── cpp/
│           │   ├── CMakeLists.txt            # Builds libtgk_nes_bridge.so
│           │   ├── libretro.h                # Libretro API v1 C header
│           │   └── libretro_fceumm_bridge.cpp # C++17 JNI host bridge for libretro-fceumm
│           ├── java/com/tgk/testemulators/
│           │   ├── core/
│           │   │   ├── IEmulatorCore.kt      # Clean interface isolating UI & Netplay from core
│           │   │   ├── LibretroFceummBridge.kt # Native JNI implementation of IEmulatorCore
│           │   │   └── QuickSaveStore.kt     # Persistent Quick Save/Load Slots 1–3
│           │   ├── audio/
│           │   │   └── NativeNesAudioPlayer.kt # Low-latency Android AudioTrack stereo PCM16
│           │   ├── input/
│           │   │   └── DualPortInputController.kt # Independent Port 1 & Port 2 input router
│           │   ├── netplay/
│           │   │   ├── INetplayClient.kt     # Decoupled Netplay transport interface
│           │   │   └── WebSocketNetplayClient.kt # OkHttp WebSocket 2P VS relay client
│           │   └── ui/
│           │       ├── NesSurfaceView.kt     # Native 256x240 nearest-neighbor SurfaceView
│           │       └── MainActivity.kt       # ROM loader, Pause/Reset, Save/Load, Touch/Gamepad UI
│           └── res/
│               ├── drawable/ic_launcher.xml
│               └── values/{strings.xml, themes.xml}
├── src/                                      # Web Preview & Netplay Reference (libretro-fceumm WASM)
│   ├── emulator/
│   │   ├── core/                             # INesEmulatorCore, CoreRegistry, LibretroFceummAdapter
│   │   ├── audio/                            # Web Audio APU playback
│   │   ├── input/                            # 2P Keyboard & Gamepad manager
│   │   ├── netplay/                          # WebSocket 2P VS protocol & rollback engine
│   │   └── roms/                             # User-selected .nes ROM library store (IndexedDB)
│   └── utils/emulator.test.ts                # Unit tests verified automatically in CI
└── server.ts                                 # Optional self-hosted 2P Netplay WebSocket relay
```

## GitHub से सीधे APK कैसे एक्सपोर्ट करें (बिना PC / टर्मिनल)

1. इस पूरे रिपॉज़िटरी को अपने GitHub repo के `main` ब्रांच पर push/commit करें।
2. GitHub में ऊपर **Actions** टैब खोलें।
3. बाईं तरफ **Build TGK TEST EMULATORS Android APK** workflow चुनें।
4. हर नए commit पर यह अपने आप चलेगा, या आप **Run workflow** बटन दबाकर `debug` या `release` चुनकर मैन्युअल चला सकते हैं।
5. Workflow हरा (✔) होने के बाद, उस run के नीचे **Artifacts** सेक्शन में **`TGK-TEST-EMULATORS-android-apk`** पर क्लिक करके `.zip` डाउनलोड करें, अनज़िप करें और `.apk` अपने और दोस्तों के Android फ़ोन पर इंस्टॉल करें।
