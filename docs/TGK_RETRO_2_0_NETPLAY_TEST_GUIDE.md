# TGK RETRO 2.0 – Two-Phone Physical Android Field Test Guide

This guide covers end-to-end verification of **TGK RETRO 2.0 – Advanced NES Online Multiplayer** on two physical Android phones over **Wi-Fi** and **Mobile Internet (4G/5G)** using the native C++ JNI (`libretro-fceumm`) APK built by GitHub Actions.

> **Important Realism Note**: Real-world Wi-Fi and mobile cellular networks exhibit variable round-trip latency, jitter, NAT traversal differences, and occasional packet loss. TGK RETRO 2.0 uses deterministic emulation, adaptive input delay, bounded rollback, and automatic authoritative state recovery to stay playable—zero latency or perfect synchronization is never guaranteed.

---

## 1. Prerequisites

1. **Export the Native Android APK**:
   - Push this repository to GitHub and run the **Build TGK TEST EMULATORS Android APK** workflow (`/.github/workflows/build-apk.yml`).
   - Download `TGK-TEST-EMULATORS-android-apk` and install the **exact same APK build** on **Phone A (Host / Port 1)** and **Phone B (Guest / Port 2)** so both phones run identical `libretro-fceumm-jni-2.0` binaries.
2. **Start the Signaling/Relay Server**:
   - **Wi-Fi LAN Test**: Run `npm start` on a machine on the same Wi-Fi router (note its LAN IP, e.g. `ws://192.168.1.50:3000/ws/netplay`).
   - **Mobile Internet (4G/5G) Test**: Deploy the Node.js server (`server.ts`) to a public HTTPS host with TLS WebSockets (`wss://<your-host>/ws/netplay`).
3. **Prepare User-Provided `.nes` ROMs**:
   - Have a legally owned `.nes` ROM file ready on Phone A (and optionally a matching copy on Phone B).

---

## 2. Test Matrix (Wi-Fi & Mobile Internet)

### Test A — Wi-Fi LAN Simultaneous 2P Rollback
1. Connect **Phone A** and **Phone B** to the same 5 GHz Wi-Fi network.
2. On **Phone A**, tap **LOAD .NES** and load a 2-player NES ROM (e.g., *Contra*, *Double Dragon II*, or *Ice Climber*).
3. Tap **2P NET**, enter the LAN WebSocket URL (`ws://<LAN_IP>:3000/ws/netplay`), enter Display Name, leave Turn-Based unchecked, and tap **Host Room (P1)**.
4. Note the 5-character **Room Code** or tap **Share Invite Link** (`tgkretro://join/<CODE>`) to send it to Phone B.
5. On **Phone B**, load the identical `.nes` file, open the invite link (or tap **2P NET** → **Join Room (P2)** with the room code).
6. Verify in the Room Dialog on both phones:
   - `Players: 2/2`
   - `Core: libretro-fceumm-jni-2.0 · Verified: YES`
   - Matching 16-char SHA-256 prefix
7. On **Phone A**, tap **Synchronized Start (Frame 0)**.
8. Play simultaneously for 3+ minutes while observing the top **RETRO 2.0** telemetry bar:
   - Expected Wi-Fi RTT: ~5–35 ms, Quality: `Good`, Adaptive Delay: `1F–2F`, Sync: `Verified`.
   - Confirm Port 1 inputs on Phone A only control Player 1 and Port 2 inputs on Phone B only control Player 2.

### Test B — Mobile Internet (Wi-Fi vs 4G/5G and 4G/5G vs 4G/5G)
1. Switch **Phone B** off Wi-Fi onto **4G/5G mobile data** (keep Phone A on Wi-Fi, then test both on mobile data).
2. Connect both phones to the `wss://<your-host>/ws/netplay` endpoint and start a synchronized match.
3. Verify:
   - Live Ping/Jitter updates every 1.5 seconds.
   - **Adaptive Input Delay** automatically scales up (e.g. `2F → 4F`) when cellular jitter rises, and steps back down smoothly after stability returns.
   - Emulation speed remains locked to NTSC `60.0988 Hz` without runaway drift (frame advantage throttling engages cleanly if one phone lags).
   - Periodic 30-frame state checksums remain `Verified`; if packet bursts cause a state divergence, Host automatically sends an authoritative binary snapshot and Guest recovers (`Recoveries` counter increments).

### Test C — Optional Consent-Based ROM Transfer & Storage Verification
1. On **Phone B**, leave no ROM loaded (or load a different `.nes` ROM).
2. Join **Phone A**'s room → verify status shows **ROM SHA-256 mismatch**.
3. On **Phone A**, open the Room Dialog → tap **Offer Current ROM Transfer (Consent Required)**.
4. Verify **Phone B** displays the **Consent Required · ROM Transfer** dialog showing filename, size in KB, SHA-256 prefix, and the unchecked **Save verified ROM to app-private local storage** checkbox.
5. First test **Decline** → verify zero chunks are accepted and Host receives decline notification.
6. Offer again, check the local storage box, and tap **Accept & Verify SHA-256** → verify chunk progress completes, SHA-256 passes, ROM boots on Phone B, handshake switches to `Verified: YES`, and rejoining later auto-loads the cached SHA-256 file from `filesDir/netplay_roms/`.

### Test D — Synchronized Controls, Turn-Based Mode & Auto-Reconnect
1. Trigger **Synchronized Pause**, **Synchronized Resume**, and **Synchronized Reset (Rematch)** from either phone and confirm both phones transition cleanly.
2. Host a room with **Turn-Based Shared Port 1 Mode** checked (for alternating 1P games like *Super Mario Bros.* 2-Player mode). Tap **Swap Turn Owner** and verify only the active player drives Port 1.
3. Background **Phone B** for 5–10 seconds (or briefly toggle Airplane Mode) → confirm **Hold** pauses cleanly and automatic exponential-backoff reconnect (`room:rejoin`) + Host authoritative snapshot restores the exact match frame.

### Test E — Regression Check (Existing Features Preserved)
1. Connect a **USB OTG or Bluetooth gamepad** to Phone A and Phone B:
   - Offline: confirm dual gamepads still map independently to Port 1 & Port 2 (`R1/X = Turbo A`, `L1/Y = Turbo B`).
   - Online: confirm USB/BT gamepad on Phone B feeds strictly into Port 2 without interfering with Port 1.
2. Offline: verify **Quick Save / Load Slots 1–3**, **Highlight Bookmarks**, **Per-Game Drag Layout Editor**, **CRT/PVM toggle**, and **YouTube Creator Hub** all operate identically to prior builds.
