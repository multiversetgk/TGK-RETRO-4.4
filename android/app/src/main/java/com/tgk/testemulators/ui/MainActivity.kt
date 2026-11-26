package com.tgk.testemulators.ui

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.tgk.testemulators.audio.NativeNesAudioPlayer
import com.tgk.testemulators.core.EmulatorState
import com.tgk.testemulators.core.IEmulatorCore
import com.tgk.testemulators.core.LibretroFceummBridge
import com.tgk.testemulators.core.NesButton
import com.tgk.testemulators.core.PlayerPort
import com.tgk.testemulators.champions.ChampionsAchievementEngine
import com.tgk.testemulators.champions.ChampionsDashboardDialog
import com.tgk.testemulators.champions.ChampionsProfileRepository
import com.tgk.testemulators.champions.LocalNesRomLibrary
import com.tgk.testemulators.champions.SessionMode
import com.tgk.testemulators.creator.CreatorHubRepository
import com.tgk.testemulators.input.DualPortInputController
import com.tgk.testemulators.input.TurboController
import com.tgk.testemulators.netplay.ChecksumSyncStatus
import com.tgk.testemulators.netplay.FrameInputEntry
import com.tgk.testemulators.netplay.NETPLAY_PROTOCOL_VERSION
import com.tgk.testemulators.netplay.NetplayListener
import com.tgk.testemulators.netplay.PeerHandshakeInfo
import com.tgk.testemulators.netplay.RollbackNetplayEngine
import com.tgk.testemulators.netplay.RomTransferManager
import com.tgk.testemulators.netplay.RomTransferOfferInfo
import com.tgk.testemulators.netplay.RoomJoinInfo
import com.tgk.testemulators.netplay.SyncPulsePacket
import com.tgk.testemulators.netplay.WebSocketNetplayClient
import com.tgk.testemulators.settings.AudioFocusMode
import com.tgk.testemulators.settings.CrtDisplayMode
import com.tgk.testemulators.settings.EmulatorSettingsProfile
import com.tgk.testemulators.settings.EmulatorSettingsRepository
import com.tgk.testemulators.settings.GameLayoutProfile
import com.tgk.testemulators.settings.HighlightBookmarkRepository
import com.tgk.testemulators.settings.ScreenAspectRatio
import com.tgk.testemulators.settings.ScreenOrientationMode
import com.tgk.testemulators.settings.StickControlMode
import com.tgk.testemulators.settings.VideoFilterMode
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.hypot

/**
 * Pure native Android host Activity for TGK TEST EMULATORS (90s + Modern Hybrid Design).
 * Includes Quick-Drawer Menu, Virtual Thumbstick / D-Pad, Adjustable Turbo A/B,
 * Per-Emulator Settings, Per-Game Custom Layout Profiles, and Instant Highlight Bookmarks.
 * Zero WebView overhead.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var emulatorCore: IEmulatorCore
    private lateinit var audioPlayer: NativeNesAudioPlayer
    private lateinit var inputController: DualPortInputController
    private lateinit var turboController: TurboController
    private lateinit var settingsRepo: EmulatorSettingsRepository
    private lateinit var highlightRepo: HighlightBookmarkRepository
    private lateinit var creatorHubRepo: CreatorHubRepository
    private lateinit var localRomLibrary: LocalNesRomLibrary
    private lateinit var championsRepo: ChampionsProfileRepository
    private lateinit var championsEngine: ChampionsAchievementEngine
    private var championsSessionMode: SessionMode = SessionMode.OFFICIAL_RANKED
    private lateinit var netplayClient: WebSocketNetplayClient
    private lateinit var rollbackEngine: RollbackNetplayEngine
    private lateinit var romTransferManager: RomTransferManager
    private lateinit var netplayPrefs: SharedPreferences
    private lateinit var usagePrefs: SharedPreferences
    private val transferExecutor = Executors.newSingleThreadExecutor()
    private val netplaySendExecutor = Executors.newSingleThreadExecutor()
    private val timerHandler = android.os.Handler(android.os.Looper.getMainLooper())

    private lateinit var surfaceView: NesSurfaceView
    private lateinit var statusLabel: TextView
    private lateinit var sessionTimerBadge: TextView
    private lateinit var netplayHudBar: TextView
    private lateinit var netplayEscapeBar: LinearLayout
    private lateinit var netplayEscapeText: TextView
    private lateinit var onlineButton: Button
    private lateinit var portToggleButton: Button
    private lateinit var turboAButton: Button
    private lateinit var turboBButton: Button
    private lateinit var quickDrawerScrim: FrameLayout
    private lateinit var quickDrawerBody: LinearLayout
    private lateinit var cartridgeShelfOverlay: LinearLayout
    private lateinit var layoutEditBanner: LinearLayout
    private lateinit var mainCol: LinearLayout
    private lateinit var screenContainer: FrameLayout
    private lateinit var movementHost: FrameLayout
    private lateinit var actionClusterView: LinearLayout
    private lateinit var turboClusterView: LinearLayout
    private lateinit var touchControlsBar: LinearLayout

    // Live 00:00 Session Timer & Usage Report tracking
    private var sessionElapsedSeconds: Int = 0
    private var sessionGameTitle: String? = null
    private var lastOnlineUrl: String? = null
    private var lastOnlinePlayerName: String = "Player"
    private var lastOnlineRoomCode: String? = null
    private var lastOnlineWasHost: Boolean = false
    private var lastOnlineTurnBased: Boolean = false
    private val sessionTimerTicker = object : Runnable {
        override fun run() {
            if (emulatorCore.isRomLoaded && emulatorCore.state == EmulatorState.RUNNING && quickDrawerScrim.visibility != View.VISIBLE) {
                sessionElapsedSeconds += 1
                updateSessionTimerBadge()
            }
            timerHandler.postDelayed(this, 1000L)
        }
    }

    private var emuSettings: EmulatorSettingsProfile = EmulatorSettingsProfile()
    private var gameLayout: GameLayoutProfile = GameLayoutProfile(romHash = "default")
    private var isEditingLayout: Boolean = false

    // TGK RETRO 2.0 Online Rollback Multiplayer State
    @Volatile private var onlineSessionActive: Boolean = false
    @Volatile private var onlineRunning: Boolean = false
    @Volatile private var onlineTurnBased: Boolean = false
    @Volatile private var onlinePeerCount: Int = 1
    @Volatile private var onlinePeerVerified: Boolean = false
    @Volatile private var onlineDeterminismVerified: Boolean = false
    @Volatile private var onlineManualDelayFrames: Int? = null
    @Volatile private var onlinePeerHandshake: PeerHandshakeInfo? = null
    @Volatile private var onlineStatusMessage: String = "Offline"
    @Volatile private var onlineLastDesyncPushMs: Long = 0L
    private var pendingDeepLinkRoomCode: String? = null
    private val rollbackRenderBuffer = IntArray(IEmulatorCore.VIDEO_PIXEL_COUNT)

    private val loopActive = AtomicBoolean(false)
    private var emulationThread: Thread? = null

    private val romPicker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            loadRomFromUri(uri)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        emulatorCore = LibretroFceummBridge(applicationContext)
        audioPlayer = NativeNesAudioPlayer()
        turboController = TurboController(emulatorCore)
        inputController = DualPortInputController(
            core = emulatorCore,
            onTurboButtonChanged = { port, button, held ->
                if (held) championsEngine.recordTurboOrCheat("Gamepad Turbo ${button.label}")
                turboController.setTurboHeld(port, button, held)
            }
        )
        settingsRepo = EmulatorSettingsRepository(applicationContext)
        highlightRepo = HighlightBookmarkRepository(applicationContext)
        creatorHubRepo = CreatorHubRepository(applicationContext)
        localRomLibrary = LocalNesRomLibrary(applicationContext)
        championsRepo = ChampionsProfileRepository(applicationContext)
        championsEngine = ChampionsAchievementEngine(emulatorCore, championsRepo)
        netplayClient = WebSocketNetplayClient()
        rollbackEngine = RollbackNetplayEngine(emulatorCore)
        romTransferManager = RomTransferManager(applicationContext)
        netplayPrefs = getSharedPreferences("tgk_netplay_prefs", Context.MODE_PRIVATE)
        usagePrefs = getSharedPreferences("tgk_usage_reports", Context.MODE_PRIVATE)

        emuSettings = settingsRepo.loadEmulatorSettings("libretro-fceumm")
        gameLayout = settingsRepo.loadGameLayout("default", emuSettings.stickMode)

        val coreReady = emulatorCore.initialize()
        setContentView(buildRootLayout())
        applyEmulatorSettings()
        applyGameLayout()
        timerHandler.postDelayed(sessionTimerTicker, 1000L)

        statusLabel.text = if (!coreReady) {
            "Engine unavailable"
        } else {
            "TGK RETRO 4.4"
        }

        handleIncomingInviteIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncomingInviteIntent(intent)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        applyOrientationLayout(newConfig.orientation == Configuration.ORIENTATION_LANDSCAPE)
    }

    override fun onResume() {
        super.onResume()
        if (onlineSessionActive && netplayClient.isConnected) {
            netplayClient.setLocalHold(false, "background")
        }
        if (emulatorCore.isRomLoaded && emulatorCore.state == EmulatorState.RUNNING) {
            audioPlayer.resume()
            startEmulationLoop()
        }
    }

    override fun onPause() {
        super.onPause()
        if (onlineSessionActive && netplayClient.isConnected) {
            netplayClient.setLocalHold(true, "background")
        }
        stopEmulationLoop()
        audioPlayer.pause()
        turboController.releaseAll()
        inputController.releaseAll()
    }

    override fun onDestroy() {
        timerHandler.removeCallbacks(sessionTimerTicker)
        flushSessionUsageReport()
        leaveOnlineRoom(silent = true)
        stopEmulationLoop()
        transferExecutor.shutdownNow()
        netplaySendExecutor.shutdownNow()
        turboController.releaseAll()
        audioPlayer.release()
        emulatorCore.dispose()
        super.onDestroy()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP) {
            if (quickDrawerScrim.visibility == View.VISIBLE) {
                closeQuickDrawer()
                return true
            }
            if (isEditingLayout) {
                exitLayoutEditMode(save = true)
                return true
            }
        }
        if (quickDrawerScrim.visibility != View.VISIBLE && !isEditingLayout && inputController.handleKeyEvent(event)) {
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    override fun dispatchGenericMotionEvent(ev: MotionEvent): Boolean {
        if (quickDrawerScrim.visibility != View.VISIBLE && !isEditingLayout && inputController.handleGenericMotionEvent(ev)) {
            return true
        }
        return super.dispatchGenericMotionEvent(ev)
    }

    private fun applyEmulatorSettings() {
        surfaceView.applyDisplaySettings(emuSettings.videoFilter, emuSettings.crtMode, emuSettings.aspectRatio)
        requestedOrientation = when (emuSettings.orientationMode) {
            ScreenOrientationMode.PORTRAIT -> ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            ScreenOrientationMode.LANDSCAPE -> ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            ScreenOrientationMode.AUTO -> ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
        val isLandscape = when (emuSettings.orientationMode) {
            ScreenOrientationMode.PORTRAIT -> false
            ScreenOrientationMode.LANDSCAPE -> true
            ScreenOrientationMode.AUTO ->
                resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
        }
        applyOrientationLayout(isLandscape)
        turboController.rateHz = emuSettings.turboRateHz
        audioPlayer.setAudioFocusGain(emuSettings.audioFocus.volumeMultiplier)
        turboAButton.text = "TA\n${emuSettings.turboRateHz}Hz"
        turboBButton.text = "TB\n${emuSettings.turboRateHz}Hz"
        if (emulatorCore.isRomLoaded) {
            val sr = emulatorCore.currentRom?.sampleRate ?: 44100
            audioPlayer.start(sr, emuSettings.audioLatencyMs)
        }
    }

    private fun applyOrientationLayout(isLandscape: Boolean) {
        if (!::mainCol.isInitialized || !::screenContainer.isInitialized || !::touchControlsBar.isInitialized) return
        (touchControlsBar.parent as? ViewGroup)?.removeView(touchControlsBar)
        if (isLandscape) {
            // Horizontal (Landscape) Mode: Full-height centered NES screen + semi-transparent side touch controls
            touchControlsBar.setBackgroundColor(Color.TRANSPARENT)
            touchControlsBar.alpha = gameLayout.padOpacity.coerceAtMost(0.76f)
            screenContainer.addView(
                touchControlsBar,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    Gravity.BOTTOM
                ).apply {
                    setMargins(dp(4), 0, dp(4), dp(4))
                }
            )
            // Keep cartridge shelf & edit banner above controls when visible
            cartridgeShelfOverlay.bringToFront()
            layoutEditBanner.bringToFront()
            sessionTimerBadge.bringToFront()
        } else {
            // Portrait Mode: Clean top game screen + dedicated non-overlapping lower touch deck
            touchControlsBar.setBackgroundColor(Color.parseColor("#080B14"))
            touchControlsBar.alpha = gameLayout.padOpacity
            mainCol.addView(
                touchControlsBar,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                )
            )
        }
    }

    private fun formatTimerClock(totalSeconds: Int): String {
        val safe = totalSeconds.coerceAtLeast(0)
        val hrs = safe / 3600
        val mins = (safe % 3600) / 60
        val secs = safe % 60
        return if (hrs > 0) {
            String.format("%d:%02d:%02d", hrs, mins, secs)
        } else {
            String.format("%02d:%02d", mins, secs)
        }
    }

    private fun updateSessionTimerBadge() {
        if (!::sessionTimerBadge.isInitialized) return
        if (!emulatorCore.isRomLoaded) {
            sessionTimerBadge.visibility = View.GONE
            return
        }
        sessionTimerBadge.visibility = View.VISIBLE
        sessionTimerBadge.text = formatTimerClock(sessionElapsedSeconds)
    }

    private fun startFreshSessionTimer(gameTitle: String) {
        flushSessionUsageReport()
        sessionGameTitle = gameTitle.removeSuffix(".nes").replace('_', ' ').trim()
        sessionElapsedSeconds = 0
        updateSessionTimerBadge()
    }

    private fun flushSessionUsageReport() {
        val title = sessionGameTitle ?: return
        val elapsed = sessionElapsedSeconds
        sessionGameTitle = null
        sessionElapsedSeconds = 0
        if (elapsed <= 0) return
        val totalSecs = usagePrefs.getInt("total_seconds", 0) + elapsed
        val totalSessions = usagePrefs.getInt("total_sessions", 0) + 1
        val gameKey = "game_${title.lowercase()}"
        val gameSecs = usagePrefs.getInt(gameKey, 0) + elapsed
        usagePrefs.edit()
            .putInt("total_seconds", totalSecs)
            .putInt("total_sessions", totalSessions)
            .putInt(gameKey, gameSecs)
            .putString("last_game_name", title)
            .apply()
    }

    private fun applyGameLayout() {
        val clampedScale = gameLayout.buttonScale.coerceIn(0.80f, 1.25f)
        val maxShift = dp(72).toFloat()

        touchControlsBar.alpha = gameLayout.padOpacity

        movementHost.scaleX = clampedScale
        movementHost.scaleY = clampedScale
        movementHost.translationX = gameLayout.dpadOffsetX.coerceIn(-maxShift, maxShift)
        movementHost.translationY = gameLayout.dpadOffsetY.coerceIn(-maxShift, maxShift)

        actionClusterView.scaleX = clampedScale
        actionClusterView.scaleY = clampedScale
        actionClusterView.translationX = gameLayout.actionOffsetX.coerceIn(-maxShift, maxShift)
        actionClusterView.translationY = gameLayout.actionOffsetY.coerceIn(-maxShift, maxShift)

        turboClusterView.scaleX = clampedScale
        turboClusterView.scaleY = clampedScale
        turboClusterView.translationX = gameLayout.turboOffsetX.coerceIn(-maxShift, maxShift)
        turboClusterView.translationY = gameLayout.turboOffsetY.coerceIn(-maxShift, maxShift)

        layoutEditBanner.visibility = if (isEditingLayout) View.VISIBLE else View.GONE
        val editHighlight = if (isEditingLayout) {
            GradientDrawable().apply {
                setColor(Color.argb(42, 245, 158, 11))
                setStroke(dp(2), Color.parseColor("#F59E0B"))
                cornerRadius = dp(12).toFloat()
            }
        } else {
            null
        }
        movementHost.background = editHighlight?.constantState?.newDrawable()?.mutate()
        actionClusterView.background = editHighlight?.constantState?.newDrawable()?.mutate()
        turboClusterView.background = editHighlight?.constantState?.newDrawable()?.mutate()

        rebuildMovementControl()
    }

    private fun enterLayoutEditMode() {
        isEditingLayout = true
        quickDrawerScrim.visibility = View.GONE
        turboController.releaseAll()
        inputController.releaseAll()
        applyGameLayout()
        Toast.makeText(this, "Drag D-Pad, Turbo, or A/B clusters to reposition", Toast.LENGTH_SHORT).show()
    }

    private fun exitLayoutEditMode(save: Boolean) {
        isEditingLayout = false
        if (save) {
            settingsRepo.saveGameLayout(gameLayout)
            Toast.makeText(this, "Saved per-game layout profile", Toast.LENGTH_SHORT).show()
        }
        applyGameLayout()
        if (emulatorCore.isRomLoaded && emulatorCore.state == EmulatorState.PAUSED) {
            emulatorCore.resume()
            audioPlayer.resume()
            startEmulationLoop()
        }
    }

    private fun loadRomFromUri(uri: Uri) {
        val fileName = resolveDisplayName(uri)
        val bytes = runCatching {
            contentResolver.openInputStream(uri)?.use { it.readBytes() }
        }.getOrNull()

        if (bytes == null || bytes.size < 16) {
            Toast.makeText(this, "Could not read .nes ROM file", Toast.LENGTH_SHORT).show()
            return
        }

        stopEmulationLoop()
        val ok = emulatorCore.loadRom(bytes, fileName)
        if (!ok) {
            Toast.makeText(this, "Invalid iNES (.nes) cartridge", Toast.LENGTH_SHORT).show()
            return
        }

        val meta = emulatorCore.currentRom
        val romHash = meta?.hashHex ?: "default"
        if (meta != null) {
            localRomLibrary.recordLoadedRom(fileName, meta.sha256Hex, meta.hashHex, meta.sizeBytes)
            championsEngine.startSession(championsSessionMode, fileName, meta.sha256Hex)
        }
        gameLayout = settingsRepo.loadGameLayout(romHash, emuSettings.stickMode)
        isEditingLayout = false
        cartridgeShelfOverlay.visibility = View.GONE
        applyGameLayout()

        val det = emulatorCore.verifyDeterminism()
        onlineDeterminismVerified = det.verified

        audioPlayer.start(meta?.sampleRate ?: 44100, emuSettings.audioLatencyMs)
        audioPlayer.setAudioFocusGain(emuSettings.audioFocus.volumeMultiplier)
        val cleanTitle = (meta?.title ?: fileName).removeSuffix(".nes").replace('_', ' ').trim()
        statusLabel.text = cleanTitle
        startFreshSessionTimer(cleanTitle)
        closeQuickDrawer()

        if (onlineSessionActive && netplayClient.isConnected) {
            buildLocalHandshake()?.let { netplayClient.sendPeerHello(it) }
            updateNetplayHud()
        }
        startEmulationLoop()
    }

    private fun loadRomFromBytes(bytes: ByteArray, fileName: String, autoRun: Boolean = true): Boolean {
        stopEmulationLoop()
        val ok = emulatorCore.loadRom(bytes, fileName)
        if (!ok) return false
        val meta = emulatorCore.currentRom
        val romHash = meta?.hashHex ?: "default"
        gameLayout = settingsRepo.loadGameLayout(romHash, emuSettings.stickMode)
        isEditingLayout = false
        cartridgeShelfOverlay.visibility = View.GONE
        applyGameLayout()
        onlineDeterminismVerified = emulatorCore.verifyDeterminism().verified
        audioPlayer.start(meta?.sampleRate ?: 44100, emuSettings.audioLatencyMs)
        audioPlayer.setAudioFocusGain(emuSettings.audioFocus.volumeMultiplier)
        val cleanTitle = (meta?.title ?: fileName).removeSuffix(".nes").replace('_', ' ').trim()
        statusLabel.text = cleanTitle
        startFreshSessionTimer(cleanTitle)
        if (autoRun) startEmulationLoop()
        return true
    }

    private fun resolveDisplayName(uri: Uri): String {
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (idx >= 0) return cursor.getString(idx) ?: "cartridge.nes"
            }
        }
        return uri.lastPathSegment?.substringAfterLast('/') ?: "cartridge.nes"
    }

    private fun openQuickDrawer() {
        if (emulatorCore.isRomLoaded && emulatorCore.state == EmulatorState.RUNNING) {
            emulatorCore.pause()
            championsEngine.recordPause()
            audioPlayer.pause()
            turboController.releaseAll()
            inputController.releaseAll()
        }
        rebuildQuickDrawerContent()
        quickDrawerScrim.visibility = View.VISIBLE
    }

    private fun closeQuickDrawer() {
        quickDrawerScrim.visibility = View.GONE
        if (emulatorCore.isRomLoaded && emulatorCore.state == EmulatorState.PAUSED) {
            emulatorCore.resume()
            audioPlayer.resume()
            startEmulationLoop()
        }
    }

    private fun captureHighlightBookmark() {
        val meta = emulatorCore.currentRom
        if (meta == null) {
            Toast.makeText(this, "Load a .nes ROM first", Toast.LENGTH_SHORT).show()
            return
        }
        val state = emulatorCore.saveStateBytes()
        if (state == null) {
            Toast.makeText(this, "Could not capture highlight state", Toast.LENGTH_SHORT).show()
            return
        }
        val saved = highlightRepo.saveHighlight(meta.hashHex, state)
        if (saved != null) {
            Toast.makeText(this, "Highlight Bookmarked (${saved.formattedTime})", Toast.LENGTH_SHORT).show()
        }
    }

    private fun showSettingsDialog() {
        val sections = arrayOf(
            "1. Display & Screen (Video Size, Filter, CRT)",
            "2. Controls & Layout (D-Pad / Stick, Turbo, Scale)",
            "3. Gameplay & Saves (Save Slots, Audio Focus)",
            "4. Timer & Usage Reports (${formatTimerClock(sessionElapsedSeconds)} live)"
        )
        AlertDialog.Builder(this)
            .setTitle("TGK Retro Settings")
            .setItems(sections) { _, which ->
                when (which) {
                    0 -> showDisplaySettingsDialog()
                    1 -> showControlsSettingsDialog()
                    2 -> showGameplaySavesSettingsDialog()
                    3 -> showUsageReportsDialog()
                }
            }
            .setPositiveButton("Done", null)
            .show()
    }

    private fun showDisplaySettingsDialog() {
        val ratios = ScreenAspectRatio.values()
        val orientations = ScreenOrientationMode.values()
        val filters = VideoFilterMode.values()
        val crts = CrtDisplayMode.values()
        val options = arrayOf(
            "Video Size: ${emuSettings.aspectRatio.label}",
            "Orientation: ${emuSettings.orientationMode.label}",
            "Video Filter: ${emuSettings.videoFilter.label}",
            "CRT Display: ${emuSettings.crtMode.label}"
        )
        AlertDialog.Builder(this)
            .setTitle("Display & Screen")
            .setItems(options) { _, which ->
                when (which) {
                    0 -> {
                        val next = ratios[(ratios.indexOf(emuSettings.aspectRatio) + 1) % ratios.size]
                        emuSettings = emuSettings.copy(aspectRatio = next)
                    }
                    1 -> {
                        val next = orientations[(orientations.indexOf(emuSettings.orientationMode) + 1) % orientations.size]
                        emuSettings = emuSettings.copy(orientationMode = next)
                    }
                    2 -> {
                        val next = filters[(filters.indexOf(emuSettings.videoFilter) + 1) % filters.size]
                        emuSettings = emuSettings.copy(videoFilter = next)
                    }
                    3 -> {
                        val next = crts[(crts.indexOf(emuSettings.crtMode) + 1) % crts.size]
                        emuSettings = emuSettings.copy(crtMode = next)
                    }
                }
                settingsRepo.saveEmulatorSettings(emuSettings)
                applyEmulatorSettings()
                showDisplaySettingsDialog()
            }
            .setNegativeButton("Back") { _, _ -> showSettingsDialog() }
            .show()
    }

    private fun showControlsSettingsDialog() {
        val turbos = intArrayOf(5, 10, 15, 20, 30)
        val options = arrayOf(
            "Control Style: ${gameLayout.stickMode.label}",
            "Turbo Rapid-Fire: ${emuSettings.turboRateHz} Hz",
            "Button Scale: ${(gameLayout.buttonScale * 100).toInt()}%",
            "Drag & Reposition On-Screen Pad",
            "Reset Layout Profile"
        )
        AlertDialog.Builder(this)
            .setTitle("Controls & Layout")
            .setItems(options) { _, which ->
                when (which) {
                    0 -> {
                        val nextStick = if (gameLayout.stickMode == StickControlMode.DPAD) {
                            StickControlMode.THUMBSTICK
                        } else {
                            StickControlMode.DPAD
                        }
                        gameLayout = gameLayout.copy(stickMode = nextStick)
                        settingsRepo.saveGameLayout(gameLayout)
                        applyGameLayout()
                        showControlsSettingsDialog()
                    }
                    1 -> {
                        val idx = turbos.indexOf(emuSettings.turboRateHz).coerceAtLeast(0)
                        emuSettings = emuSettings.copy(turboRateHz = turbos[(idx + 1) % turbos.size])
                        settingsRepo.saveEmulatorSettings(emuSettings)
                        applyEmulatorSettings()
                        showControlsSettingsDialog()
                    }
                    2 -> {
                        val scales = floatArrayOf(0.85f, 1.0f, 1.15f)
                        val curIdx = scales.indexOfFirst { kotlin.math.abs(it - gameLayout.buttonScale) < 0.05f }.coerceAtLeast(0)
                        gameLayout = gameLayout.copy(buttonScale = scales[(curIdx + 1) % scales.size])
                        settingsRepo.saveGameLayout(gameLayout)
                        applyGameLayout()
                        showControlsSettingsDialog()
                    }
                    3 -> enterLayoutEditMode()
                    4 -> {
                        val hash = emulatorCore.currentRom?.hashHex ?: "default"
                        gameLayout = settingsRepo.resetGameLayout(hash, emuSettings.stickMode)
                        applyGameLayout()
                        Toast.makeText(this, "Layout reset to default", Toast.LENGTH_SHORT).show()
                        showControlsSettingsDialog()
                    }
                }
            }
            .setNegativeButton("Back") { _, _ -> showSettingsDialog() }
            .show()
    }

    private fun showGameplaySavesSettingsDialog() {
        val latencies = intArrayOf(24, 48, 96)
        val focuses = AudioFocusMode.values()
        val options = arrayOf(
            "Quick Save · Slot 1",
            "Quick Load · Slot 1",
            "Quick Save · Slot 2",
            "Quick Load · Slot 2",
            "Audio Focus: ${emuSettings.audioFocus.label}",
            "Audio Buffer: ${emuSettings.audioLatencyMs}ms"
        )
        AlertDialog.Builder(this)
            .setTitle("Gameplay & Saves")
            .setItems(options) { _, which ->
                when (which) {
                    0 -> Toast.makeText(this, if (emulatorCore.quickSaveState(1)) "Saved Slot 1" else "Load a game first", Toast.LENGTH_SHORT).show()
                    1 -> Toast.makeText(this, if (emulatorCore.quickLoadState(1)) "Loaded Slot 1" else "Slot 1 empty", Toast.LENGTH_SHORT).show()
                    2 -> Toast.makeText(this, if (emulatorCore.quickSaveState(2)) "Saved Slot 2" else "Load a game first", Toast.LENGTH_SHORT).show()
                    3 -> Toast.makeText(this, if (emulatorCore.quickLoadState(2)) "Loaded Slot 2" else "Slot 2 empty", Toast.LENGTH_SHORT).show()
                    4 -> {
                        val next = focuses[(focuses.indexOf(emuSettings.audioFocus) + 1) % focuses.size]
                        emuSettings = emuSettings.copy(audioFocus = next)
                        settingsRepo.saveEmulatorSettings(emuSettings)
                        applyEmulatorSettings()
                    }
                    5 -> {
                        val idx = latencies.indexOf(emuSettings.audioLatencyMs).coerceAtLeast(0)
                        emuSettings = emuSettings.copy(audioLatencyMs = latencies[(idx + 1) % latencies.size])
                        settingsRepo.saveEmulatorSettings(emuSettings)
                        applyEmulatorSettings()
                    }
                }
                showGameplaySavesSettingsDialog()
            }
            .setNegativeButton("Back") { _, _ -> showSettingsDialog() }
            .show()
    }

    private fun showUsageReportsDialog() {
        val totalSeconds = usagePrefs.getInt("total_seconds", 0) + sessionElapsedSeconds
        val totalSessions = usagePrefs.getInt("total_sessions", 0)
        val lastGame = usagePrefs.getString("last_game_name", "None yet") ?: "None yet"
        val reportText = "Current Session: ${formatTimerClock(sessionElapsedSeconds)}\n" +
            "Total Playtime: ${formatTimerClock(totalSeconds)}\n" +
            "Saved Sessions: $totalSessions\n" +
            "Last Played: $lastGame"
        AlertDialog.Builder(this)
            .setTitle("Timer & Usage Reports")
            .setMessage(reportText)
            .setNeutralButton("Clear Reports") { _, _ ->
                usagePrefs.edit().clear().apply()
                Toast.makeText(this, "Usage reports cleared", Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton("Back") { _, _ -> showSettingsDialog() }
            .setPositiveButton("Done", null)
            .show()
    }

    private fun openExternalYouTubeUrl(url: String) {
        val safe = creatorHubRepo.sanitizeYouTubeUrl(url)
        if (safe == null) {
            Toast.makeText(this, "Invalid YouTube link", Toast.LENGTH_SHORT).show()
            return
        }
        runCatching {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(safe)))
        }.onFailure {
            Toast.makeText(this, "No browser or YouTube app found", Toast.LENGTH_SHORT).show()
        }
    }

    private fun showYouTubeCreatorHubDialog() {
        val myChannel = creatorHubRepo.getMyChannel()
        val options = arrayOf(
            "My YouTube Channel: ${myChannel.channelName} (${myChannel.handle})",
            "Edit My Channel Link & Name",
            "My Latest Video Cards (${creatorHubRepo.listMyVideos().size})",
            "Retro YouTubers Directory (${creatorHubRepo.listRetroYouTubers().size})",
            "+ Add Retro YouTuber Channel"
        )
        AlertDialog.Builder(this)
            .setTitle("YouTube Creator Hub")
            .setItems(options) { _, which ->
                when (which) {
                    0 -> openExternalYouTubeUrl(myChannel.channelUrl)
                    1 -> showEditMyChannelDialog()
                    2 -> showMyVideosDialog()
                    3 -> showRetroYouTubersDialog()
                    4 -> showAddRetroYouTuberDialog()
                }
            }
            .setNegativeButton("Close", null)
            .show()
    }

    private fun showEditMyChannelDialog() {
        val current = creatorHubRepo.getMyChannel()
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(12), dp(20), dp(4))
        }
        val nameInput = EditText(this).apply {
            hint = "Channel Name"
            setText(current.channelName)
        }
        val handleInput = EditText(this).apply {
            hint = "@Handle"
            setText(current.handle)
        }
        val urlInput = EditText(this).apply {
            hint = "https://www.youtube.com/@YourChannel"
            setText(current.channelUrl)
        }
        container.addView(nameInput)
        container.addView(handleInput)
        container.addView(urlInput)

        AlertDialog.Builder(this)
            .setTitle("Edit My YouTube Channel")
            .setView(container)
            .setPositiveButton("Save") { _, _ ->
                val ok = creatorHubRepo.saveMyChannel(
                    nameInput.text.toString(),
                    handleInput.text.toString(),
                    urlInput.text.toString()
                )
                Toast.makeText(
                    this,
                    if (ok) "Saved YouTube channel" else "Enter a valid https://youtube.com link",
                    Toast.LENGTH_SHORT
                ).show()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showMyVideosDialog() {
        val videos = creatorHubRepo.listMyVideos()
        val labels = videos.map { "${it.title} (${it.duration})" }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("My Latest Video Cards")
            .setItems(labels) { _, idx ->
                openExternalYouTubeUrl(videos[idx].videoUrl)
            }
            .setPositiveButton("Back") { _, _ -> showYouTubeCreatorHubDialog() }
            .show()
    }

    private fun showRetroYouTubersDialog() {
        val creators = creatorHubRepo.listRetroYouTubers()
        val labels = creators.map { "${it.name} · ${it.specialty}" }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("Retro YouTubers")
            .setItems(labels) { _, idx ->
                openExternalYouTubeUrl(creators[idx].channelUrl)
            }
            .setPositiveButton("Back") { _, _ -> showYouTubeCreatorHubDialog() }
            .show()
    }

    private fun showAddRetroYouTuberDialog() {
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(12), dp(20), dp(4))
        }
        val nameInput = EditText(this).apply { hint = "Channel Name (e.g. MetalJesusRocks)" }
        val handleInput = EditText(this).apply { hint = "@Handle" }
        val urlInput = EditText(this).apply { hint = "https://www.youtube.com/@Channel" }
        val specInput = EditText(this).apply { hint = "Specialty (e.g. NES Reviews)" }
        container.addView(nameInput)
        container.addView(handleInput)
        container.addView(urlInput)
        container.addView(specInput)

        AlertDialog.Builder(this)
            .setTitle("Add Retro YouTuber")
            .setView(container)
            .setPositiveButton("Add") { _, _ ->
                val ok = creatorHubRepo.addRetroYouTuber(
                    nameInput.text.toString(),
                    handleInput.text.toString(),
                    urlInput.text.toString(),
                    specInput.text.toString()
                )
                Toast.makeText(
                    this,
                    if (ok) "Added Retro YouTuber" else "Enter a valid YouTube channel link",
                    Toast.LENGTH_SHORT
                ).show()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    // =========================================================================
    // TGK RETRO 2.0 — Native Android Deterministic Rollback Multiplayer
    // =========================================================================

    private fun handleIncomingInviteIntent(incoming: Intent?) {
        val data = incoming?.data ?: return
        val codeFromPath = if (data.scheme.equals("tgkretro", ignoreCase = true) &&
            data.host.equals("join", ignoreCase = true)
        ) {
            data.pathSegments.firstOrNull()
        } else {
            data.getQueryParameter("room")
        }
        val clean = codeFromPath?.uppercase()?.replace(Regex("[^A-Z0-9]"), "")?.take(6)
        if (!clean.isNullOrBlank() && clean.length >= 4) {
            pendingDeepLinkRoomCode = clean
            Toast.makeText(this, "Invite Room Code detected: $clean", Toast.LENGTH_SHORT).show()
            showOnlineMultiplayerDialog()
        }
    }

    private fun buildLocalHandshake(): PeerHandshakeInfo? {
        val meta = emulatorCore.currentRom ?: return null
        return PeerHandshakeInfo(
            protocolVersion = NETPLAY_PROTOCOL_VERSION,
            coreId = emulatorCore.coreId,
            coreVersion = emulatorCore.coreVersion,
            romName = meta.fileName,
            romHash = meta.hashHex,
            romSha256 = meta.sha256Hex,
            romSizeBytes = meta.romSizeBytes,
            determinismVerified = onlineDeterminismVerified
        )
    }

    private fun createNetplayListener(): NetplayListener = object : NetplayListener {
        override fun onConnected(info: RoomJoinInfo) {
            onlineSessionActive = true
            onlineTurnBased = info.turnBasedSharedPort1
            onlinePeerCount = info.playerCount
            onlinePeerVerified = false
            onlineRunning = false
            onlineStatusMessage = "Connected · Room ${info.roomCode} (${info.assignedPort.label})"

            inputController.onlineLockedPort = info.assignedPort
            turboController.suppressDirectCoreCalls = true
            rollbackEngine.configureSession(
                localPort = info.assignedPort,
                turnBasedSharedPort1 = info.turnBasedSharedPort1,
                initialFrame = 0
            )
            rollbackEngine.setManualInputDelay(onlineManualDelayFrames)

            // If Guest already cached this exact SHA-256 ROM locally (from prior consent), auto-load it
            if (info.assignedPort == PlayerPort.PORT_2 &&
                info.romSha256.isNotBlank() &&
                emulatorCore.currentRom?.sha256Hex?.equals(info.romSha256, ignoreCase = true) != true
            ) {
                val cached = romTransferManager.loadCachedRomBySha256(info.romSha256)
                if (cached != null) {
                    runOnUiThread {
                        if (loadRomFromBytes(cached, info.romName, autoRun = true)) {
                            Toast.makeText(
                                this@MainActivity,
                                "Loaded verified cached ROM (${info.romName})",
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    }
                }
            }

            buildLocalHandshake()?.let { netplayClient.sendPeerHello(it) }
            runOnUiThread {
                portToggleButton.text = "LOCKED: ${info.assignedPort.label}"
                onlineButton.text = info.roomCode
                hideNetplayEscapeBar()
                updateNetplayHud()
                Toast.makeText(
                    this@MainActivity,
                    "Connected to Room ${info.roomCode}",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }

        override fun onPeerJoined(playerCount: Int, reconnected: Boolean) {
            onlinePeerCount = playerCount
            buildLocalHandshake()?.let { netplayClient.sendPeerHello(it) }
            if (reconnected && netplayClient.localPort == PlayerPort.PORT_1 && onlinePeerVerified) {
                pushAuthoritativeSnapshot("reconnect")
            }
            runOnUiThread {
                onlineStatusMessage = if (reconnected) "Peer reconnected · Resyncing" else "Peer joined (2/2)"
                updateNetplayHud()
                Toast.makeText(this@MainActivity, onlineStatusMessage, Toast.LENGTH_SHORT).show()
            }
        }

        override fun onPeerLeft(port: PlayerPort, playerCount: Int) {
            onlinePeerCount = playerCount
            onlinePeerVerified = false
            onlineRunning = false
            onlineStatusMessage = "${port.label} left room"
            runOnUiThread {
                updateNetplayHud()
                Toast.makeText(this@MainActivity, onlineStatusMessage, Toast.LENGTH_SHORT).show()
            }
        }

        override fun onPeerHello(port: PlayerPort, meta: PeerHandshakeInfo) {
            onlinePeerHandshake = meta
            val local = buildLocalHandshake()
            if (local == null) {
                onlinePeerVerified = false
                onlineStatusMessage = "Load matching .nes ROM or accept Host transfer"
                runOnUiThread { updateNetplayHud() }
                return
            }
            val (ok, reason) = RollbackNetplayEngine.verifyHandshake(local, meta)
            onlinePeerVerified = ok
            onlineStatusMessage = reason
            runOnUiThread {
                updateNetplayHud()
                Toast.makeText(this@MainActivity, reason, Toast.LENGTH_SHORT).show()
            }
        }

        override fun onRemoteFrameInputs(
            port: PlayerPort,
            latestFrame: Int,
            ackFrame: Int,
            inputs: List<FrameInputEntry>
        ) {
            if (!onlineSessionActive) return
            val result = rollbackEngine.receiveRemoteInputs(port, inputs, rollbackRenderBuffer)
            if (result.rolledBack) {
                surfaceView.renderFrame(rollbackRenderBuffer)
            }
            if (result.needsAuthoritativeResync && netplayClient.localPort == PlayerPort.PORT_1) {
                pushAuthoritativeSnapshot("desync-recovery")
            }
        }

        override fun onRemoteChecksum(port: PlayerPort, frame: Int, checksum: String) {
            if (!onlineSessionActive) return
            val mismatch = rollbackEngine.receiveRemoteChecksum(frame, checksum)
            if (mismatch && netplayClient.localPort == PlayerPort.PORT_1) {
                val now = System.currentTimeMillis()
                if (now - onlineLastDesyncPushMs >= 1500L) {
                    onlineLastDesyncPushMs = now
                    pushAuthoritativeSnapshot("desync-recovery")
                    runOnUiThread {
                        onlineStatusMessage = "Checksum mismatch at F$frame · Auto-recovering"
                        updateNetplayHud()
                    }
                }
            }
        }

        override fun onSyncPulse(pulse: SyncPulsePacket) {
            if (!onlineSessionActive) return
            val alignment = rollbackEngine.receiveSyncPulse(pulse)
            if (alignment.alignmentForced) {
                if (alignment.needsAuthoritativeResync && netplayClient.localPort == PlayerPort.PORT_1) {
                    val now = System.currentTimeMillis()
                    if (now - onlineLastDesyncPushMs >= 1000L) {
                        onlineLastDesyncPushMs = now
                        pushAuthoritativeSnapshot("clock-alignment")
                    }
                }
                runOnUiThread {
                    onlineStatusMessage = "Aligning 2P clocks (${alignment.driftMs}ms drift)"
                    updateNetplayHud()
                }
            }
        }

        override fun onAuthoritativeSnapshot(
            frame: Int,
            stateBytes: ByteArray,
            checksum: String,
            romSha256: String,
            reason: String
        ) {
            val localSha = emulatorCore.currentRom?.sha256Hex ?: ""
            if (romSha256.isNotBlank() && !localSha.equals(romSha256, ignoreCase = true)) {
                return
            }
            val ok = rollbackEngine.applyAuthoritativeSnapshot(frame, stateBytes, checksum)
            if (ok) {
                onlineStatusMessage = "Recovered sync at F$frame ($reason)"
                runOnUiThread { updateNetplayHud() }
            }
        }

        override fun onSyncControl(action: String, targetFrame: Int, activeTurnPort: PlayerPort?) {
            runOnUiThread {
                when (action) {
                    "start" -> {
                        if (emulatorCore.isRomLoaded) {
                            emulatorCore.reset()
                            rollbackEngine.resetTimeline(0)
                            if (activeTurnPort != null) rollbackEngine.setTurnOwner(activeTurnPort)
                            emulatorCore.resume()
                            audioPlayer.resume()
                            onlineRunning = true
                            onlineStatusMessage = "Synchronized Match Active"
                            startEmulationLoop()
                        }
                    }
                    "pause" -> {
                        onlineRunning = false
                        emulatorCore.pause()
                        audioPlayer.pause()
                        onlineStatusMessage = "Paused at F$targetFrame"
                    }
                    "resume" -> {
                        if (emulatorCore.isRomLoaded) {
                            emulatorCore.resume()
                            audioPlayer.resume()
                            onlineRunning = true
                            onlineStatusMessage = "Resumed at F$targetFrame"
                            startEmulationLoop()
                        }
                    }
                    "reset" -> {
                        if (emulatorCore.isRomLoaded) {
                            emulatorCore.reset()
                            rollbackEngine.resetTimeline(0)
                            emulatorCore.resume()
                            audioPlayer.resume()
                            onlineRunning = true
                            onlineStatusMessage = "Synchronized Reset (F0)"
                            startEmulationLoop()
                        }
                    }
                    "turn_swap" -> {
                        val owner = activeTurnPort ?: PlayerPort.PORT_1
                        rollbackEngine.setTurnOwner(owner)
                        onlineStatusMessage = "Turn Active: ${owner.label}"
                    }
                }
                updateNetplayHud()
            }
        }

        override fun onRomTransferOffer(offer: RomTransferOfferInfo) {
            if (!romTransferManager.receiveOffer(offer)) return
            runOnUiThread { showIncomingRomTransferDialog(offer) }
        }

        override fun onRomTransferAccept(transferId: String, saveToLocalStorage: Boolean) {
            val chunks = romTransferManager.getOutgoingChunks(transferId) ?: return
            transferExecutor.execute {
                for (idx in chunks.indices) {
                    if (!netplayClient.isConnected) break
                    netplayClient.sendRomTransferChunk(transferId, idx, chunks.size, chunks[idx])
                    runCatching { Thread.sleep(12L) }
                }
            }
            runOnUiThread {
                onlineStatusMessage = "Sending user-provided ROM (${chunks.size} chunks)..."
                updateNetplayHud()
            }
        }

        override fun onRomTransferDecline(transferId: String, reason: String) {
            romTransferManager.clearOutgoing()
            runOnUiThread {
                Toast.makeText(this@MainActivity, "Peer declined ROM transfer: $reason", Toast.LENGTH_SHORT).show()
            }
        }

        override fun onRomTransferChunk(
            transferId: String,
            chunkIndex: Int,
            chunkCount: Int,
            dataBase64: String
        ) {
            val res = romTransferManager.ingestChunk(transferId, chunkIndex, dataBase64)
            if (!res.ok) {
                netplayClient.sendRomTransferComplete(transferId, false, "", res.error)
                runOnUiThread {
                    Toast.makeText(this@MainActivity, res.error ?: "ROM transfer failed", Toast.LENGTH_LONG).show()
                }
                return
            }
            if (!res.completed) {
                runOnUiThread {
                    onlineStatusMessage = "Receiving ROM: ${res.chunksDone}/${res.chunkCount} chunks"
                    updateNetplayHud()
                }
                return
            }
            val bytes = res.verifiedBytes ?: return
            val romName = res.romName ?: "cartridge.nes"
            val sha = res.sha256 ?: ""
            runOnUiThread {
                val loaded = loadRomFromBytes(bytes, romName, autoRun = true)
                netplayClient.sendRomTransferComplete(transferId, loaded, sha, if (loaded) null else "Core failed to load ROM")
                if (loaded) {
                    buildLocalHandshake()?.let { netplayClient.sendPeerHello(it) }
                    val saveMsg = if (res.savedPath != null) " (Saved locally)" else " (Session memory only)"
                    Toast.makeText(this@MainActivity, "Verified Game Loaded$saveMsg", Toast.LENGTH_LONG).show()
                    onlineStatusMessage = "Game Verified · Ready to Start"
                    updateNetplayHud()
                }
            }
        }

        override fun onRomTransferComplete(transferId: String, verified: Boolean, sha256: String, error: String?) {
            romTransferManager.clearOutgoing()
            runOnUiThread {
                Toast.makeText(
                    this@MainActivity,
                    if (verified) "Peer verified matching game!" else "Peer ROM transfer error: ${error ?: "failed"}",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }

        override fun onPingSample(rttMs: Int) {
            rollbackEngine.recordRttMs(rttMs)
            runOnUiThread { updateNetplayHud() }
        }

        override fun onPeerHoldChanged(active: Boolean, port: PlayerPort?, reason: String?, graceSeconds: Int) {
            runOnUiThread {
                if (active) {
                    onlineRunning = false
                    onlineStatusMessage = "Hold: ${port?.label ?: "Peer"} ($reason · ${graceSeconds}s)"
                } else {
                    onlineStatusMessage = "Peer returned from hold"
                }
                updateNetplayHud()
            }
        }

        override fun onReconnecting(attempt: Int, maxAttempts: Int) {
            onlineRunning = false
            onlineStatusMessage = "Reconnecting ($attempt/$maxAttempts)..."
            runOnUiThread {
                showNetplayEscapeBar("Reconnecting ($attempt/$maxAttempts)...")
                updateNetplayHud()
            }
        }

        override fun onError(message: String) {
            onlineStatusMessage = "Connection interrupted"
            runOnUiThread {
                showNetplayEscapeBar("Connection interrupted. Retry or Exit to Menu.")
                updateNetplayHud()
                Toast.makeText(this@MainActivity, message, Toast.LENGTH_LONG).show()
            }
        }

        override fun onDisconnected(reason: String) {
            runOnUiThread {
                leaveOnlineRoom(silent = true)
                showNetplayEscapeBar("Disconnected from online room.")
                Toast.makeText(this@MainActivity, "Disconnected from online room", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun showNetplayEscapeBar(message: String) {
        if (!::netplayEscapeBar.isInitialized) return
        netplayEscapeText.text = message
        netplayEscapeBar.visibility = View.VISIBLE
    }

    private fun hideNetplayEscapeBar() {
        if (!::netplayEscapeBar.isInitialized) return
        netplayEscapeBar.visibility = View.GONE
    }

    private fun retryLastNetplayConnection() {
        hideNetplayEscapeBar()
        val url = lastOnlineUrl
        if (url.isNullOrBlank()) {
            showOnlineMultiplayerDialog()
            return
        }
        if (lastOnlineWasHost) {
            val handshake = buildLocalHandshake()
            if (handshake == null) {
                Toast.makeText(this, "Pick a .nes game first", Toast.LENGTH_SHORT).show()
                return
            }
            netplayClient.connectAndCreateRoom(
                wsUrl = url,
                playerName = lastOnlinePlayerName,
                handshake = handshake,
                listener = createNetplayListener(),
                mode = "shared-2p",
                turnBasedSharedPort1 = lastOnlineTurnBased
            )
        } else if (!lastOnlineRoomCode.isNullOrBlank()) {
            netplayClient.connectAndJoinRoom(
                wsUrl = url,
                roomCode = lastOnlineRoomCode!!,
                playerName = lastOnlinePlayerName,
                handshake = buildLocalHandshake(),
                listener = createNetplayListener()
            )
        } else {
            showOnlineMultiplayerDialog()
        }
    }

    private fun exitToMainMenuCleanly() {
        leaveOnlineRoom(silent = true)
        hideNetplayEscapeBar()
        flushSessionUsageReport()
        stopEmulationLoop()
        isEditingLayout = false
        emulatorCore.unloadRom()
        surfaceView.drawIdleScreen()
        cartridgeShelfOverlay.visibility = View.VISIBLE
        layoutEditBanner.visibility = View.GONE
        sessionTimerBadge.visibility = View.GONE
        statusLabel.text = "TGK RETRO 4.4"
        quickDrawerScrim.visibility = View.GONE
    }

    private fun pushAuthoritativeSnapshot(reason: String) {
        val meta = emulatorCore.currentRom ?: return
        val snap = rollbackEngine.exportAuthoritativeSnapshot() ?: return
        netplayClient.sendAuthoritativeSnapshot(
            frame = snap.first,
            stateBytes = snap.second,
            checksum = snap.third,
            romSha256 = meta.sha256Hex,
            romHash = meta.hashHex,
            reason = reason
        )
    }

    private fun leaveOnlineRoom(silent: Boolean = false) {
        netplayClient.disconnect()
        romTransferManager.clearOutgoing()
        romTransferManager.declineActiveOffer()
        onlineSessionActive = false
        onlineRunning = false
        onlinePeerVerified = false
        onlinePeerCount = 1
        onlinePeerHandshake = null
        onlineStatusMessage = "Offline"
        inputController.onlineLockedPort = null
        turboController.suppressDirectCoreCalls = false
        if (!silent) {
            runOnUiThread {
                portToggleButton.text = "PAD: ${inputController.activeTouchPort.label}"
                onlineButton.text = "2P NET"
                updateNetplayHud()
                Toast.makeText(this, "Left Online Multiplayer Room", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun updateNetplayHud() {
        if (!::netplayHudBar.isInitialized) return
        if (!onlineSessionActive) {
            netplayHudBar.visibility = View.GONE
            return
        }
        val m = rollbackEngine.getMetrics()
        val pingStr = if (m.pingMs != null) "${m.pingMs}ms" else "--ms"
        val turnStr = if (m.turnBasedSharedPort1) " · Turn: ${m.activeTurnPort.label}" else ""
        netplayHudBar.visibility = View.VISIBLE
        netplayHudBar.text =
            "Room ${netplayClient.roomCode ?: "---"} · ${netplayClient.localPort?.label ?: "P?"} · " +
                "$pingStr · ${m.quality.label}$turnStr"
        val textColor = when (m.syncStatus) {
            ChecksumSyncStatus.DESYNCED -> "#FCA5A5"
            ChecksumSyncStatus.VERIFIED -> "#67E8F9"
            else -> "#FCD34D"
        }
        netplayHudBar.setTextColor(Color.parseColor(textColor))
    }

    private fun showIncomingRomTransferDialog(offer: RomTransferOfferInfo) {
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(12), dp(20), dp(4))
        }
        val kb = (offer.sizeBytes / 1024).coerceAtLeast(1)
        container.addView(TextView(this).apply {
            text = "Host offered a user-provided .nes ROM file:\n\n" +
                "File: ${offer.romName}\n" +
                "Size: $kb KB\n\n" +
                "Only accept files you have permission to use. File integrity is verified before loading."
            textSize = 12f
        })
        val saveCheckbox = CheckBox(this).apply {
            text = "Save verified ROM to app-private local storage"
            isChecked = false
            setPadding(0, dp(10), 0, 0)
        }
        container.addView(saveCheckbox)

        AlertDialog.Builder(this)
            .setTitle("Consent Required · Game Transfer")
            .setView(container)
            .setCancelable(false)
            .setPositiveButton("Accept & Verify") { _, _ ->
                val accepted = romTransferManager.acceptActiveOffer(saveCheckbox.isChecked)
                if (accepted != null) {
                    netplayClient.acceptRomTransfer(accepted.transferId, saveCheckbox.isChecked)
                }
            }
            .setNegativeButton("Decline") { _, _ ->
                romTransferManager.declineActiveOffer()
                netplayClient.declineRomTransfer(offer.transferId, "User declined transfer")
            }
            .show()
    }

    private fun showOnlineMultiplayerDialog() {
        if (onlineSessionActive && netplayClient.roomCode != null) {
            showActiveOnlineRoomDialog()
            return
        }

        val savedUrl = netplayPrefs.getString("ws_url", "ws://192.168.1.100:3000/ws/netplay")
            ?: "ws://192.168.1.100:3000/ws/netplay"
        val savedName = netplayPrefs.getString("player_name", "Android Player") ?: "Android Player"

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(12), dp(20), dp(4))
        }
        container.addView(TextView(this).apply {
            text = "2-Player Online NES Multiplayer\n" +
                "Play with a friend using room codes and synced controllers. " +
                "Wi-Fi or mobile latency may affect smoothness."
            textSize = 11f
            setPadding(0, 0, 0, dp(8))
        })

        val wsUrlInput = EditText(this).apply {
            hint = "Server Address (wss://... or ws://LAN_IP:3000/ws/netplay)"
            setText(savedUrl)
        }
        val nameInput = EditText(this).apply {
            hint = "Player Name"
            setText(savedName)
        }
        val roomCodeInput = EditText(this).apply {
            hint = "Room Code (e.g. TGK48)"
            setText(pendingDeepLinkRoomCode ?: "")
        }
        val turnBasedBox = CheckBox(this).apply {
            text = "Turn-Based Mode (share Player 1)"
            isChecked = false
        }

        container.addView(wsUrlInput)
        container.addView(nameInput)
        container.addView(roomCodeInput)
        container.addView(turnBasedBox)

        AlertDialog.Builder(this)
            .setTitle("Online NES Multiplayer")
            .setView(container)
            .setPositiveButton("Host Room (P1)") { _, _ ->
                val url = wsUrlInput.text.toString().trim()
                val name = nameInput.text.toString().trim().ifEmpty { "Player 1" }
                lastOnlineUrl = url
                lastOnlinePlayerName = name
                lastOnlineWasHost = true
                lastOnlineTurnBased = turnBasedBox.isChecked
                netplayPrefs.edit().putString("ws_url", url).putString("player_name", name).apply()
                val handshake = buildLocalHandshake()
                if (handshake == null) {
                    Toast.makeText(this, "Pick a .nes game first before hosting a room", Toast.LENGTH_LONG).show()
                    return@setPositiveButton
                }
                netplayClient.connectAndCreateRoom(
                    wsUrl = url,
                    playerName = name,
                    handshake = handshake,
                    listener = createNetplayListener(),
                    mode = "shared-2p",
                    turnBasedSharedPort1 = turnBasedBox.isChecked
                )
            }
            .setNeutralButton("Join Room (P2)") { _, _ ->
                val url = wsUrlInput.text.toString().trim()
                val name = nameInput.text.toString().trim().ifEmpty { "Player 2" }
                val code = roomCodeInput.text.toString().trim()
                lastOnlineUrl = url
                lastOnlinePlayerName = name
                lastOnlineWasHost = false
                lastOnlineRoomCode = code
                pendingDeepLinkRoomCode = null
                netplayPrefs.edit().putString("ws_url", url).putString("player_name", name).apply()
                netplayClient.connectAndJoinRoom(
                    wsUrl = url,
                    roomCode = code,
                    playerName = name,
                    handshake = buildLocalHandshake(),
                    listener = createNetplayListener()
                )
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showActiveOnlineRoomDialog() {
        val code = netplayClient.roomCode ?: "---"
        val port = netplayClient.localPort ?: PlayerPort.PORT_1
        val m = rollbackEngine.getMetrics()
        val inviteLink = "tgkretro://join/$code"
        val romMeta = emulatorCore.currentRom
        val isHost = port == PlayerPort.PORT_1

        val actions = mutableListOf(
            "Copy Room Code ($code)",
            "Share Invite Link ($inviteLink)",
            "Synchronized Start (Frame 0)",
            if (onlineRunning) "Synchronized Pause" else "Synchronized Resume",
            "Synchronized Reset (Rematch)",
            "Input Delay: ${if (m.adaptiveDelay) "Auto (${m.inputDelayFrames}F)" else "Fixed ${m.inputDelayFrames}F"} (Tap to Cycle)"
        )
        if (m.turnBasedSharedPort1) {
            actions.add("Swap Turn Owner (Active: ${m.activeTurnPort.label})")
        }
        if (isHost) {
            actions.add("Force Authoritative State Resync (Host)")
            actions.add("Offer Current ROM Transfer (Consent Required)")
        }
        actions.add("Leave Online Room")

        val summary = "Room: $code · ${port.label} · Players: $onlinePeerCount/2\n" +
            "Core: FCEUmm · Verified: ${if (onlinePeerVerified) "YES" else "PENDING"}\n" +
            "Game: ${romMeta?.title ?: "Not loaded"}\n" +
            "Ping: ${m.pingMs ?: "--"}ms · Quality: ${m.quality.label}\n" +
            "Status: $onlineStatusMessage"

        AlertDialog.Builder(this)
            .setTitle("TGK RETRO 4.4 · Room $code")
            .setItems(arrayOf(summary) + actions.toTypedArray()) { _, which ->
                if (which == 0) return@setItems
                val chosen = actions[which - 1]
                when {
                    chosen.startsWith("Copy Room Code") -> {
                        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        cm.setPrimaryClip(ClipData.newPlainText("TGK Room Code", code))
                        Toast.makeText(this, "Copied room code $code", Toast.LENGTH_SHORT).show()
                    }
                    chosen.startsWith("Share Invite Link") -> {
                        val share = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(
                                Intent.EXTRA_TEXT,
                                "Join my TGK RETRO 4.4 NES room! Code: $code · Invite: $inviteLink"
                            )
                        }
                        startActivity(Intent.createChooser(share, "Share TGK RETRO 4.4 Room Invite"))
                    }
                    chosen.startsWith("Synchronized Start") -> {
                        if (!onlinePeerVerified) {
                            Toast.makeText(this, "Load the same .nes game on both devices first", Toast.LENGTH_LONG).show()
                        } else {
                            netplayClient.sendSyncControl("start", 0, PlayerPort.PORT_1)
                            emulatorCore.reset()
                            rollbackEngine.resetTimeline(0)
                            emulatorCore.resume()
                            audioPlayer.resume()
                            onlineRunning = true
                            startEmulationLoop()
                            updateNetplayHud()
                        }
                    }
                    chosen == "Synchronized Pause" -> {
                        onlineRunning = false
                        emulatorCore.pause()
                        audioPlayer.pause()
                        netplayClient.sendSyncControl("pause", m.currentFrame)
                        updateNetplayHud()
                    }
                    chosen == "Synchronized Resume" -> {
                        emulatorCore.resume()
                        audioPlayer.resume()
                        onlineRunning = true
                        netplayClient.sendSyncControl("resume", m.currentFrame)
                        startEmulationLoop()
                        updateNetplayHud()
                    }
                    chosen.startsWith("Synchronized Reset") -> {
                        emulatorCore.reset()
                        rollbackEngine.resetTimeline(0)
                        emulatorCore.resume()
                        audioPlayer.resume()
                        onlineRunning = true
                        netplayClient.sendSyncControl("reset", 0)
                        startEmulationLoop()
                        updateNetplayHud()
                    }
                    chosen.startsWith("Input Delay:") -> {
                        val cycle = listOf(null, 0, 1, 2, 3, 4, 5, 6)
                        val idx = cycle.indexOf(onlineManualDelayFrames).coerceAtLeast(0)
                        onlineManualDelayFrames = cycle[(idx + 1) % cycle.size]
                        rollbackEngine.setManualInputDelay(onlineManualDelayFrames)
                        updateNetplayHud()
                        showActiveOnlineRoomDialog()
                    }
                    chosen.startsWith("Swap Turn Owner") -> {
                        val nextOwner = if (m.activeTurnPort == PlayerPort.PORT_1) PlayerPort.PORT_2 else PlayerPort.PORT_1
                        rollbackEngine.setTurnOwner(nextOwner)
                        netplayClient.sendSyncControl("turn_swap", m.currentFrame, nextOwner)
                        updateNetplayHud()
                    }
                    chosen.startsWith("Force Authoritative") -> {
                        pushAuthoritativeSnapshot("manual")
                        Toast.makeText(this, "Sent authoritative state snapshot to peer", Toast.LENGTH_SHORT).show()
                    }
                    chosen.startsWith("Offer Current ROM") -> {
                        val bytes = emulatorCore.getLoadedRomBytes()
                        val meta = emulatorCore.currentRom
                        if (bytes == null || meta == null) {
                            Toast.makeText(this, "Load a .nes ROM first", Toast.LENGTH_SHORT).show()
                        } else {
                            val prepared = romTransferManager.prepareOffer(meta.fileName, bytes)
                            if (prepared == null) {
                                Toast.makeText(this, "ROM exceeds 4 MB transfer cap or invalid iNES header", Toast.LENGTH_LONG).show()
                            } else {
                                netplayClient.sendRomTransferOffer(prepared.first)
                                Toast.makeText(this, "Sent consent-based ROM transfer offer to peer", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                    chosen == "Leave Online Room" -> leaveOnlineRoom(silent = false)
                }
            }
            .setNegativeButton("Close", null)
            .show()
    }

    private fun startEmulationLoop() {
        if (loopActive.getAndSet(true)) return
        emulationThread = Thread({
            val frameBuffer = IntArray(IEmulatorCore.VIDEO_PIXEL_COUNT)
            val audioBuffer = ShortArray(4096)
            val frameNanos = 16_639_267L // Exact NTSC 60.0988 Hz

            var nextFrameTime = System.nanoTime()
            var hudTickCounter = 0
            while (loopActive.get()) {
                if (onlineSessionActive) {
                    if (onlineRunning && emulatorCore.state == EmulatorState.RUNNING && emulatorCore.isRomLoaded) {
                        val localPort = netplayClient.localPort ?: PlayerPort.PORT_1
                        val burstCount = 1 + minOf(2, rollbackEngine.getPendingClockCatchUpFrames())
                        for (burstIdx in 0 until burstCount) {
                            turboController.tickFrame()
                            val rawMask = inputController.getLocalBitmask(localPort) or
                                turboController.getTurboBitmask(localPort)
                            val step = rollbackEngine.stepLocalFrame(rawMask, frameBuffer)
                            if (step.outgoingInputs.isNotEmpty() || step.outgoingChecksum != null || step.outgoingSyncPulse != null) {
                                val outPort = step.outgoingPort
                                val outLatest = step.outgoingLatestFrame
                                val outAck = step.outgoingAckFrame
                                val outInputs = step.outgoingInputs
                                val outChecksum = step.outgoingChecksum
                                val outPulse = step.outgoingSyncPulse
                                runCatching {
                                    netplaySendExecutor.execute {
                                        if (outInputs.isNotEmpty()) {
                                            netplayClient.sendFrameInputs(
                                                port = outPort,
                                                latestFrame = outLatest,
                                                ackFrame = outAck,
                                                inputs = outInputs
                                            )
                                        }
                                        outChecksum?.let { (frame, digest) ->
                                            netplayClient.sendChecksum(frame, digest)
                                        }
                                        outPulse?.let { pulse ->
                                            netplayClient.sendSyncPulse(pulse.pulseId, pulse.frame, pulse.sentAtMs)
                                        }
                                    }
                                }
                            }
                            if (step.renderedFrame && burstIdx == burstCount - 1) {
                                surfaceView.renderFrame(frameBuffer)
                                val audioCount = emulatorCore.drainAudio(audioBuffer)
                                if (audioCount > 0) {
                                    audioPlayer.writeStereoPcm(audioBuffer, audioCount)
                                }
                            }
                        }
                        hudTickCounter += 1
                        if (hudTickCounter >= 15) {
                            hudTickCounter = 0
                            runOnUiThread { updateNetplayHud() }
                        }
                    }
                } else if (emulatorCore.state == EmulatorState.RUNNING && emulatorCore.isRomLoaded) {
                    turboController.tickFrame()
                    emulatorCore.stepFrame(frameBuffer)
                    surfaceView.renderFrame(frameBuffer)
                    championsEngine.onFrameAdvanced { unlocked ->
                        runOnUiThread {
                            Toast.makeText(
                                this@MainActivity,
                                "${unlocked.tier.label} Trophy Unlocked: ${unlocked.title} (+${unlocked.xpAwarded} XP)",
                                Toast.LENGTH_LONG
                            ).show()
                        }
                    }

                    val audioCount = emulatorCore.drainAudio(audioBuffer)
                    if (audioCount > 0) {
                        audioPlayer.writeStereoPcm(audioBuffer, audioCount)
                    }
                }

                nextFrameTime += frameNanos
                val sleepNanos = nextFrameTime - System.nanoTime()
                if (sleepNanos > 0) {
                    val millis = sleepNanos / 1_000_000L
                    val nanos = (sleepNanos % 1_000_000L).toInt()
                    runCatching { Thread.sleep(millis, nanos) }
                } else {
                    nextFrameTime = System.nanoTime()
                }
            }
        }, "TGK-NES-Loop").apply {
            priority = Thread.MAX_PRIORITY
            start()
        }
    }

    private fun stopEmulationLoop() {
        loopActive.set(false)
        emulationThread?.let { thread ->
            runCatching { thread.join(300L) }
        }
        emulationThread = null
    }

    private fun buildRootLayout(): View {
        val frameRoot = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#070910"))
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        mainCol = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            clipChildren = false
            clipToPadding = false
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setPadding(dp(8), dp(6), dp(8), dp(6))
        }

        // Minimal Clean Neon Retro Gameplay Header (Title + 2P + Menu only)
        val headerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(4), dp(2), dp(4), dp(6))
        }

        statusLabel = TextView(this).apply {
            text = "TGK RETRO 4.4"
            setTextColor(Color.parseColor("#F8FAFC"))
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            maxLines = 1
        }
        headerRow.addView(statusLabel)

        onlineButton = makeActionButton("2P ONLINE", "#112233") {
            showOnlineMultiplayerDialog()
        }
        headerRow.addView(onlineButton)

        headerRow.addView(makeActionButton("MENU", "#22D3EE") {
            openQuickDrawer()
        }.apply {
            setTextColor(Color.parseColor("#070910"))
        })
        mainCol.addView(headerRow)

        netplayHudBar = TextView(this).apply {
            visibility = View.GONE
            setBackgroundColor(Color.parseColor("#0D1E2C"))
            setTextColor(Color.parseColor("#67E8F9"))
            textSize = 10.5f
            typeface = Typeface.MONOSPACE
            setPadding(dp(8), dp(4), dp(8), dp(4))
            maxLines = 1
            setOnClickListener { showOnlineMultiplayerDialog() }
        }
        mainCol.addView(netplayHudBar)

        // Netplay Disconnect / Reconnect Escape Strip (Always offers Retry + Exit to Menu)
        netplayEscapeBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            visibility = View.GONE
            setBackgroundColor(Color.parseColor("#241A0B"))
            setPadding(dp(8), dp(6), dp(8), dp(6))
        }
        netplayEscapeText = TextView(this).apply {
            text = "Reconnecting..."
            setTextColor(Color.parseColor("#FDE68A"))
            textSize = 11f
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            maxLines = 1
        }
        netplayEscapeBar.addView(netplayEscapeText)
        netplayEscapeBar.addView(makeActionButton("RETRY NOW", "#F59E0B") {
            retryLastNetplayConnection()
        }.apply { setTextColor(Color.parseColor("#070910")) })
        netplayEscapeBar.addView(makeActionButton("EXIT TO MENU", "#2A1219") {
            exitToMainMenuCleanly()
        })
        mainCol.addView(netplayEscapeBar)

        // Center Large Game Screen + Corner Real-Time 00:00 Session Timer + Library Shelf
        surfaceView = NesSurfaceView(this)
        screenContainer = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#05070D"))
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
            addView(
                surfaceView,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            )
        }

        // Live 00:00 Session Timer badge pinned cleanly to top-left corner of gameplay screen
        sessionTimerBadge = TextView(this).apply {
            text = "00:00"
            visibility = View.GONE
            setTextColor(Color.parseColor("#22D3EE"))
            textSize = 11f
            typeface = Typeface.MONOSPACE
            setPadding(dp(8), dp(4), dp(8), dp(4))
            background = GradientDrawable().apply {
                setColor(Color.argb(210, 7, 9, 16))
                setStroke(dp(1), Color.argb(120, 34, 211, 238))
                cornerRadius = dp(8).toFloat()
            }
        }
        screenContainer.addView(
            sessionTimerBadge,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP or Gravity.START
            ).apply {
                setMargins(dp(10), dp(10), 0, 0)
            }
        )

        cartridgeShelfOverlay = buildCartridgeShelfOverlay()
        screenContainer.addView(
            cartridgeShelfOverlay,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )

        layoutEditBanner = buildLayoutEditBanner()
        screenContainer.addView(
            layoutEditBanner,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP
            )
        )

        mainCol.addView(screenContainer)

        // Bottom Neon Retro Touch Controls (D-Pad/Thumbstick + Turbo A/B + B/A + Start/Select)
        touchControlsBar = buildTouchControls()
        mainCol.addView(touchControlsBar)

        frameRoot.addView(mainCol)

        // Slide-Out Quick-Drawer Overlay
        quickDrawerScrim = FrameLayout(this).apply {
            setBackgroundColor(Color.argb(190, 8, 9, 12))
            visibility = View.GONE
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setOnClickListener { closeQuickDrawer() }
        }

        val drawerScroll = ScrollView(this).apply {
            setBackgroundColor(Color.parseColor("#14171F"))
            layoutParams = FrameLayout.LayoutParams(
                dp(300),
                ViewGroup.LayoutParams.MATCH_PARENT,
                Gravity.END
            )
            setOnClickListener { /* swallow clicks inside drawer */ }
        }
        quickDrawerBody = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(20))
        }
        drawerScroll.addView(quickDrawerBody)
        quickDrawerScrim.addView(drawerScroll)
        frameRoot.addView(quickDrawerScrim)

        return frameRoot
    }

    private fun rebuildQuickDrawerContent() {
        quickDrawerBody.removeAllViews()

        quickDrawerBody.addView(TextView(this).apply {
            text = "QUICK DRAWER"
            setTextColor(Color.parseColor("#F4F1EA"))
            textSize = 16f
            typeface = Typeface.DEFAULT_BOLD
        })
        quickDrawerBody.addView(TextView(this).apply {
            text = emulatorCore.currentRom?.title ?: "No cartridge loaded"
            setTextColor(Color.parseColor("#9C978E"))
            textSize = 12f
            setPadding(0, dp(2), 0, dp(12))
        })

        // 1. Resume & Rematch
        quickDrawerBody.addView(makeDrawerButton("▶  Resume Game", "#C82333") { closeQuickDrawer() })
        quickDrawerBody.addView(makeDrawerButton("↻  Rematch (Reset)", "#2A2115") {
            if (emulatorCore.isRomLoaded) {
                emulatorCore.reset()
                championsEngine.recordReset()
                closeQuickDrawer()
                Toast.makeText(this, "Rematch Started", Toast.LENGTH_SHORT).show()
            }
        })

        // 2. Quick Save / Load Slots 1-3
        quickDrawerBody.addView(makeDrawerHeader("QUICK SAVE / LOAD"))
        for (slot in 1..3) {
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(0, dp(3), 0, dp(3))
            }
            row.addView(makeActionButton("SAVE S$slot", "#232732") {
                val ok = emulatorCore.quickSaveState(slot)
                Toast.makeText(this, if (ok) "Saved Slot $slot" else "Load ROM first", Toast.LENGTH_SHORT).show()
            }.apply { layoutParams = LinearLayout.LayoutParams(0, dp(38), 1f) })
            row.addView(makeActionButton("LOAD S$slot", "#1D2028") {
                val ok = emulatorCore.quickLoadState(slot)
                if (ok) {
                    val wasOfficial = championsEngine.isOfficialEligible()
                    championsEngine.recordSaveStateLoad()
                    closeQuickDrawer()
                    val msg = if (wasOfficial) {
                        "Loaded Slot $slot · Strict 90s Rule: Ranked run disqualified"
                    } else {
                        "Loaded Slot $slot"
                    }
                    Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
                } else {
                    Toast.makeText(this, "Slot $slot empty", Toast.LENGTH_SHORT).show()
                }
            }.apply {
                layoutParams = LinearLayout.LayoutParams(0, dp(38), 1f).apply { marginStart = dp(6) }
            })
            quickDrawerBody.addView(row)
        }

        // 3. Audio Focus
        quickDrawerBody.addView(makeDrawerHeader("AUDIO FOCUS (${emuSettings.audioFocus.label})"))
        val focusRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        for (mode in AudioFocusMode.values()) {
            val active = emuSettings.audioFocus == mode
            focusRow.addView(makeActionButton(mode.label.take(5), if (active) "#C82333" else "#1D2028") {
                emuSettings = emuSettings.copy(audioFocus = mode)
                settingsRepo.saveEmulatorSettings(emuSettings)
                applyEmulatorSettings()
                rebuildQuickDrawerContent()
            }.apply {
                layoutParams = LinearLayout.LayoutParams(0, dp(34), 1f).apply { marginEnd = dp(4) }
            })
        }
        quickDrawerBody.addView(focusRow)

        // 4. Controls, Champions System, Online Rollback, Creator Hub & Settings
        quickDrawerBody.addView(makeDrawerHeader("CHAMPIONS, MULTIPLAYER & CREATOR HUB"))
        quickDrawerBody.addView(makeDrawerButton("★  NES Champions System (60-Game Hub)", "#132A38") {
            ChampionsDashboardDialog.show(
                context = this,
                romLibrary = localRomLibrary,
                profileRepo = championsRepo,
                engine = championsEngine,
                onModeChanged = { nextMode ->
                    championsSessionMode = nextMode
                    emulatorCore.currentRom?.let { meta ->
                        championsEngine.startSession(nextMode, meta.title, meta.sha256Hex)
                    }
                }
            )
        })
        quickDrawerBody.addView(makeDrawerButton("🌐  TGK RETRO 4.4 Online Multiplayer", "#2A2215") {
            quickDrawerScrim.visibility = View.GONE
            showOnlineMultiplayerDialog()
        })
        quickDrawerBody.addView(makeDrawerButton("▶  YouTube Creator Hub", "#2B171B") {
            showYouTubeCreatorHubDialog()
        })
        quickDrawerBody.addView(makeDrawerButton("◈  TGK AI GAMER – Coming Soon", "#112420") {
            showAiGamerComingSoonDialog()
        })
        quickDrawerBody.addView(makeDrawerButton("⚙  Core & Layout Settings", "#232732") {
            showSettingsDialog()
        })
        quickDrawerBody.addView(makeDrawerButton("✎  Edit Per-Game Layout (Drag)", "#232732") {
            enterLayoutEditMode()
        })
        quickDrawerBody.addView(makeDrawerButton(
            "🕹  Switch Pad: ${if (gameLayout.stickMode == StickControlMode.DPAD) "Use Thumbstick" else "Use Cross D-Pad"}",
            "#232732"
        ) {
            val next = if (gameLayout.stickMode == StickControlMode.DPAD) {
                StickControlMode.THUMBSTICK
            } else {
                StickControlMode.DPAD
            }
            gameLayout = gameLayout.copy(stickMode = next)
            settingsRepo.saveGameLayout(gameLayout)
            applyGameLayout()
            rebuildQuickDrawerContent()
        })

        // 5. Instant Highlight Bookmarks
        val romHash = emulatorCore.currentRom?.hashHex
        val highlights = if (romHash != null) highlightRepo.listHighlights(romHash) else emptyList()
        quickDrawerBody.addView(makeDrawerHeader("HIGHLIGHT BOOKMARKS (${highlights.size})"))
        quickDrawerBody.addView(makeDrawerButton("★  Bookmark Current Moment", "#2B171B") {
            captureHighlightBookmark()
            rebuildQuickDrawerContent()
        })
        for (hl in highlights.take(4)) {
            quickDrawerBody.addView(makeDrawerButton("Jump · ${hl.formattedTime}", "#1B1E27") {
                val data = highlightRepo.loadHighlightBytes(hl)
                if (data != null && emulatorCore.loadStateBytes(data)) {
                    closeQuickDrawer()
                    Toast.makeText(this, "Jumped to ${hl.formattedTime}", Toast.LENGTH_SHORT).show()
                }
            })
        }

        // 6. Exit
        quickDrawerBody.addView(makeDrawerHeader("SESSION"))
        quickDrawerBody.addView(makeDrawerButton("✕  Exit to Menu", "#2A1219") {
            exitToMainMenuCleanly()
        })
    }

    private fun buildCartridgeShelfOverlay(): LinearLayout {
        val shelf = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#0F1218"))
            setPadding(dp(20), dp(16), dp(20), dp(16))
        }

        val deckCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(18), dp(16), dp(18), dp(16))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#171B24"))
                setStroke(dp(2), Color.parseColor("#2E3444"))
                cornerRadius = dp(14).toFloat()
            }
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }

        // 90s Molded Cartridge Vent Ridges
        val ridgeBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(10))
        }
        for (i in 0 until 5) {
            ridgeBar.addView(View(this).apply {
                background = GradientDrawable().apply {
                    setColor(if (i == 2) Color.parseColor("#C82333") else Color.parseColor("#2B303E"))
                    cornerRadius = dp(2).toFloat()
                }
                layoutParams = LinearLayout.LayoutParams(dp(28), dp(4)).apply {
                    setMargins(dp(3), 0, dp(3), 0)
                }
            })
        }
        deckCard.addView(ridgeBar)

        deckCard.addView(TextView(this).apply {
            text = "TGK RETRO 4.4"
            setTextColor(Color.parseColor("#F4F1EA"))
            textSize = 18f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        })
        deckCard.addView(TextView(this).apply {
            text = "CLASSIC 8-BIT NES ENGINE · FCEUMM"
            setTextColor(Color.parseColor("#D97706"))
            textSize = 10f
            typeface = Typeface.MONOSPACE
            gravity = Gravity.CENTER
            setPadding(0, dp(4), 0, dp(14))
        })

        val buttonRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }
        buttonRow.addView(makeDrawerButton("▶  INSERT .NES CARTRIDGE", "#C82333") {
            romPicker.launch(arrayOf("*/*"))
        }.apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { marginEnd = dp(8) }
        })
        buttonRow.addView(makeDrawerButton("🌐  2P ONLINE", "#2A2215") {
            showOnlineMultiplayerDialog()
        }.apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { marginEnd = dp(8) }
        })
        buttonRow.addView(makeDrawerButton("▶  YT HUB", "#2B171B") {
            showYouTubeCreatorHubDialog()
        }.apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { marginEnd = dp(8) }
        })
        buttonRow.addView(makeDrawerButton("⚙  SETTINGS", "#232732") {
            showSettingsDialog()
        }.apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        })
        deckCard.addView(buttonRow)

        val aiPreviewBtn = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(9), dp(12), dp(9))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#111B1F"))
                setStroke(dp(1), Color.parseColor("#34D399"))
                cornerRadius = dp(8).toFloat()
            }
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply {
                topMargin = dp(10)
            }
            isClickable = true
            isFocusable = true
            setOnClickListener { showAiGamerComingSoonDialog() }
        }
        aiPreviewBtn.addView(TextView(this).apply {
            text = "TGK AI GAMER – COMING SOON  ·  Future Update Preview →"
            setTextColor(Color.parseColor("#34D399"))
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        })
        aiPreviewBtn.addView(TextView(this).apply {
            text = "2P AI Partner · Live Banter · 1P & 2P Smart Guide · India Retro Edition"
            setTextColor(Color.parseColor("#A5A097"))
            textSize = 10f
            gravity = Gravity.CENTER
            setPadding(0, dp(2), 0, 0)
        })
        deckCard.addView(aiPreviewBtn)

        deckCard.addView(TextView(this).apply {
            text = "USB/BT Gamepad Ready · R1/X = Turbo A · L1/Y = Turbo B · Per-Game Layouts"
            setTextColor(Color.parseColor("#8E8A82"))
            textSize = 10f
            typeface = Typeface.MONOSPACE
            gravity = Gravity.CENTER
            setPadding(0, dp(10), 0, 0)
        })

        shelf.addView(deckCard)
        return shelf
    }

    private fun buildLayoutEditBanner(): LinearLayout {
        val banner = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = View.GONE
            setBackgroundColor(Color.argb(235, 20, 23, 31))
            setPadding(dp(10), dp(8), dp(10), dp(8))
        }
        banner.addView(TextView(this).apply {
            text = "EDIT PER-GAME LAYOUT · DRAG D-PAD, TURBO, OR A/B CLUSTERS"
            setTextColor(Color.parseColor("#FCD34D"))
            textSize = 10f
            typeface = Typeface.MONOSPACE
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(6))
        })
        val controls = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }
        controls.addView(makeActionButton("PAD/STICK", "#232732") {
            val next = if (gameLayout.stickMode == StickControlMode.DPAD) {
                StickControlMode.THUMBSTICK
            } else {
                StickControlMode.DPAD
            }
            gameLayout = gameLayout.copy(stickMode = next)
            applyGameLayout()
        })
        controls.addView(makeActionButton("SIZE -", "#232732") {
            gameLayout = gameLayout.copy(buttonScale = (gameLayout.buttonScale - 0.05f).coerceIn(0.80f, 1.25f))
            applyGameLayout()
        })
        controls.addView(makeActionButton("SIZE +", "#232732") {
            gameLayout = gameLayout.copy(buttonScale = (gameLayout.buttonScale + 0.05f).coerceIn(0.80f, 1.25f))
            applyGameLayout()
        })
        controls.addView(makeActionButton("RESET", "#2B171B") {
            val hash = emulatorCore.currentRom?.hashHex ?: "default"
            gameLayout = settingsRepo.resetGameLayout(hash, emuSettings.stickMode)
            applyGameLayout()
        })
        controls.addView(makeActionButton("SAVE", "#16A34A") {
            exitLayoutEditMode(save = true)
        })
        banner.addView(controls)
        return banner
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun buildTouchControls(): LinearLayout {
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            clipChildren = false
            clipToPadding = false
            setPadding(0, dp(6), 0, dp(2))
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }

        val maxShift = dp(72).toFloat()

        // Left: Switchable D-Pad / Virtual Thumbstick host (draggable in layout edit mode)
        movementHost = createDraggableFrame { dx, dy ->
            val nx = (gameLayout.dpadOffsetX + dx).coerceIn(-maxShift, maxShift)
            val ny = (gameLayout.dpadOffsetY + dy).coerceIn(-maxShift, maxShift)
            gameLayout = gameLayout.copy(dpadOffsetX = nx, dpadOffsetY = ny)
            movementHost.translationX = nx
            movementHost.translationY = ny
        }.apply {
            layoutParams = LinearLayout.LayoutParams(dp(144), dp(132))
        }
        bar.addView(movementHost)

        // Center: SELECT / START + Active Port Toggle
        val centerCluster = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }
        val metaRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }
        metaRow.addView(makeTouchPadButton("SELECT", NesButton.SELECT, 60, 32, "#1E2128"))
        metaRow.addView(makeTouchPadButton("START", NesButton.START, 60, 32, "#1E2128"))
        centerCluster.addView(metaRow)

        portToggleButton = makeActionButton("PAD: P1", "#D97706") {
            if (onlineSessionActive && inputController.onlineLockedPort != null) {
                Toast.makeText(
                    this,
                    "Port locked to ${inputController.onlineLockedPort?.label} during online session",
                    Toast.LENGTH_SHORT
                ).show()
                return@makeActionButton
            }
            val next = if (inputController.activeTouchPort == PlayerPort.PORT_1) {
                PlayerPort.PORT_2
            } else {
                PlayerPort.PORT_1
            }
            inputController.activeTouchPort = next
            portToggleButton.text = if (next == PlayerPort.PORT_1) "PAD: P1" else "PAD: P2"
        }
        centerCluster.addView(portToggleButton)
        bar.addView(centerCluster)

        // Right: Dedicated Turbo (TB/TA) above Crimson Famicom (B/A) — both independently draggable
        val rightCol = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            clipChildren = false
            clipToPadding = false
        }
        turboClusterView = createDraggableLinear { dx, dy ->
            val nx = (gameLayout.turboOffsetX + dx).coerceIn(-maxShift, maxShift)
            val ny = (gameLayout.turboOffsetY + dy).coerceIn(-maxShift, maxShift)
            gameLayout = gameLayout.copy(turboOffsetX = nx, turboOffsetY = ny)
            turboClusterView.translationX = nx
            turboClusterView.translationY = ny
        }.apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(dp(2), dp(2), dp(2), dp(2))
        }
        turboBButton = makeTurboPadButton("TB\n15Hz", NesButton.B)
        turboAButton = makeTurboPadButton("TA\n15Hz", NesButton.A)
        turboClusterView.addView(turboBButton)
        turboClusterView.addView(turboAButton)
        rightCol.addView(turboClusterView)

        actionClusterView = createDraggableLinear { dx, dy ->
            val nx = (gameLayout.actionOffsetX + dx).coerceIn(-maxShift, maxShift)
            val ny = (gameLayout.actionOffsetY + dy).coerceIn(-maxShift, maxShift)
            gameLayout = gameLayout.copy(actionOffsetX = nx, actionOffsetY = ny)
            actionClusterView.translationX = nx
            actionClusterView.translationY = ny
        }.apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(dp(2), dp(2), dp(2), dp(2))
        }
        actionClusterView.addView(makeTouchPadButton("B", NesButton.B, 58, 58, "#B41E2D"))
        actionClusterView.addView(makeTouchPadButton("A", NesButton.A, 58, 58, "#C82333"))
        rightCol.addView(actionClusterView)

        bar.addView(rightCol)
        return bar
    }

    private fun createDraggableFrame(onDragDelta: (Float, Float) -> Unit): FrameLayout {
        return object : FrameLayout(this) {
            private var lastRawX = 0f
            private var lastRawY = 0f

            override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
                if (isEditingLayout) {
                    if (ev.actionMasked == MotionEvent.ACTION_DOWN) {
                        lastRawX = ev.rawX
                        lastRawY = ev.rawY
                    }
                    return true
                }
                return super.onInterceptTouchEvent(ev)
            }

            @SuppressLint("ClickableViewAccessibility")
            override fun onTouchEvent(event: MotionEvent): Boolean {
                if (!isEditingLayout) return super.onTouchEvent(event)
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN -> {
                        lastRawX = event.rawX
                        lastRawY = event.rawY
                    }
                    MotionEvent.ACTION_MOVE -> {
                        val dx = event.rawX - lastRawX
                        val dy = event.rawY - lastRawY
                        lastRawX = event.rawX
                        lastRawY = event.rawY
                        onDragDelta(dx, dy)
                    }
                }
                return true
            }
        }
    }

    private fun createDraggableLinear(onDragDelta: (Float, Float) -> Unit): LinearLayout {
        return object : LinearLayout(this) {
            private var lastRawX = 0f
            private var lastRawY = 0f

            override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
                if (isEditingLayout) {
                    if (ev.actionMasked == MotionEvent.ACTION_DOWN) {
                        lastRawX = ev.rawX
                        lastRawY = ev.rawY
                    }
                    return true
                }
                return super.onInterceptTouchEvent(ev)
            }

            @SuppressLint("ClickableViewAccessibility")
            override fun onTouchEvent(event: MotionEvent): Boolean {
                if (!isEditingLayout) return super.onTouchEvent(event)
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN -> {
                        lastRawX = event.rawX
                        lastRawY = event.rawY
                    }
                    MotionEvent.ACTION_MOVE -> {
                        val dx = event.rawX - lastRawX
                        val dy = event.rawY - lastRawY
                        lastRawX = event.rawX
                        lastRawY = event.rawY
                        onDragDelta(dx, dy)
                    }
                }
                return true
            }
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun rebuildMovementControl() {
        movementHost.removeAllViews()
        if (gameLayout.stickMode == StickControlMode.THUMBSTICK) {
            val stickBase = FrameLayout(this).apply {
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(Color.parseColor("#181B23"))
                    setStroke(dp(2), Color.parseColor("#3B4152"))
                }
                layoutParams = FrameLayout.LayoutParams(dp(120), dp(120), Gravity.CENTER)
            }
            val thumbKnob = View(this).apply {
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(Color.parseColor("#2A2F3D"))
                    setStroke(dp(2), Color.parseColor("#C82333"))
                }
                layoutParams = FrameLayout.LayoutParams(dp(48), dp(48), Gravity.CENTER)
            }
            stickBase.addView(thumbKnob)
            stickBase.setOnTouchListener { v, event ->
                val cx = v.width / 2f
                val cy = v.height / 2f
                val maxR = v.width * 0.34f
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> {
                        val dx = event.x - cx
                        val dy = event.y - cy
                        val dist = hypot(dx.toDouble(), dy.toDouble()).toFloat()
                        val scale = if (dist > maxR && dist > 0f) maxR / dist else 1f
                        thumbKnob.translationX = dx * scale
                        thumbKnob.translationY = dy * scale
                        val dead = maxR * 0.28f
                        inputController.setTouchButton(NesButton.LEFT, dx < -dead)
                        inputController.setTouchButton(NesButton.RIGHT, dx > dead)
                        inputController.setTouchButton(NesButton.UP, dy < -dead)
                        inputController.setTouchButton(NesButton.DOWN, dy > dead)
                    }
                    MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                        thumbKnob.translationX = 0f
                        thumbKnob.translationY = 0f
                        inputController.setTouchButton(NesButton.LEFT, false)
                        inputController.setTouchButton(NesButton.RIGHT, false)
                        inputController.setTouchButton(NesButton.UP, false)
                        inputController.setTouchButton(NesButton.DOWN, false)
                    }
                }
                true
            }
            movementHost.addView(stickBase)
        } else {
            val dpad = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                layoutParams = FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            }
            dpad.addView(makeTouchPadButton("▲", NesButton.UP, 44, 38, "#232732"))
            val midRow = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER
            }
            midRow.addView(makeTouchPadButton("◀", NesButton.LEFT, 44, 38, "#232732"))
            midRow.addView(View(this).apply { layoutParams = LinearLayout.LayoutParams(dp(22), dp(38)) })
            midRow.addView(makeTouchPadButton("▶", NesButton.RIGHT, 44, 38, "#232732"))
            dpad.addView(midRow)
            dpad.addView(makeTouchPadButton("▼", NesButton.DOWN, 44, 38, "#232732"))
            movementHost.addView(dpad)
        }
    }

    private fun makeDrawerHeader(title: String): TextView = TextView(this).apply {
        text = title
        setTextColor(Color.parseColor("#8E8A82"))
        textSize = 10f
        typeface = Typeface.MONOSPACE
        setPadding(0, dp(12), 0, dp(4))
    }

    private fun makeDrawerButton(label: String, bgHex: String, onClick: () -> Unit): Button {
        return Button(this).apply {
            text = label
            setTextColor(Color.WHITE)
            textSize = 12f
            isAllCaps = false
            gravity = Gravity.START or Gravity.CENTER_VERTICAL
            setPadding(dp(12), dp(8), dp(12), dp(8))
            background = GradientDrawable().apply {
                setColor(Color.parseColor(bgHex))
                cornerRadius = dp(8).toFloat()
            }
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = dp(6)
            }
            setOnClickListener { onClick() }
        }
    }

    private fun makeActionButton(label: String, bgHex: String, onClick: () -> Unit): Button {
        return Button(this).apply {
            text = label
            setTextColor(Color.WHITE)
            textSize = 10f
            typeface = Typeface.MONOSPACE
            isAllCaps = false
            setPadding(dp(7), dp(4), dp(7), dp(4))
            minWidth = 0
            minimumWidth = 0
            minHeight = dp(32)
            minimumHeight = dp(32)
            background = GradientDrawable().apply {
                setColor(Color.parseColor(bgHex))
                cornerRadius = dp(6).toFloat()
            }
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply {
                marginStart = dp(4)
            }
            setOnClickListener { onClick() }
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun makeTurboPadButton(label: String, targetButton: NesButton): Button {
        return Button(this).apply {
            text = label
            setTextColor(Color.parseColor("#FCD34D"))
            textSize = 10f
            typeface = Typeface.MONOSPACE
            isAllCaps = false
            setPadding(0, 0, 0, 0)
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#251E15"))
                setStroke(dp(2), Color.parseColor("#F59E0B"))
            }
            layoutParams = LinearLayout.LayoutParams(dp(46), dp(46)).apply {
                setMargins(dp(6), dp(2), dp(6), dp(4))
            }
            setOnTouchListener { v, event ->
                val targetPort = inputController.onlineLockedPort ?: inputController.activeTouchPort
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> {
                        v.alpha = 0.65f
                        turboController.setTurboHeld(targetPort, targetButton, true)
                    }
                    MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP, MotionEvent.ACTION_CANCEL -> {
                        v.alpha = 1.0f
                        turboController.setTurboHeld(targetPort, targetButton, false)
                    }
                }
                true
            }
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun makeTouchPadButton(
        label: String,
        button: NesButton,
        widthDp: Int,
        heightDp: Int,
        bgHex: String
    ): Button {
        return Button(this).apply {
            text = label
            setTextColor(Color.WHITE)
            textSize = 12f
            typeface = Typeface.DEFAULT_BOLD
            isAllCaps = false
            setPadding(0, 0, 0, 0)
            background = GradientDrawable().apply {
                setColor(Color.parseColor(bgHex))
                cornerRadius = dp(10).toFloat()
            }
            layoutParams = LinearLayout.LayoutParams(dp(widthDp), dp(heightDp)).apply {
                setMargins(dp(3), dp(2), dp(3), dp(2))
            }
            setOnTouchListener { v, event ->
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> {
                        v.alpha = 0.65f
                        inputController.setTouchButton(button, true)
                    }
                    MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP, MotionEvent.ACTION_CANCEL -> {
                        v.alpha = 1.0f
                        inputController.setTouchButton(button, false)
                    }
                }
                true
            }
        }
    }

    private fun showAiGamerComingSoonDialog() {
        val scroll = ScrollView(this).apply {
            setBackgroundColor(Color.parseColor("#12151D"))
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(16), dp(18), dp(14))
        }

        root.addView(TextView(this).apply {
            text = "TGK RETRO 4.4 · FUTURE UPDATE PREVIEW"
            setTextColor(Color.parseColor("#F59E0B"))
            textSize = 10f
            typeface = Typeface.MONOSPACE
        })
        root.addView(TextView(this).apply {
            text = "TGK AI GAMER – COMING SOON"
            setTextColor(Color.parseColor("#F4F1EA"))
            textSize = 17f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(0, dp(3), 0, dp(4))
        })
        root.addView(TextView(this).apply {
            text = "Future Update Preview — Abhi koi fake ya dummy AI gameplay active nahi hai."
            setTextColor(Color.parseColor("#A5A097"))
            textSize = 11.5f
            setPadding(0, 0, 0, dp(12))
        })

        val features = listOf(
            Triple(
                "01  ·  2-Player AI Partner (Co-op & Versus)",
                "Aapke saath Player 2 bankar 2-player NES games khelega aur compete karega.",
                "#C82333"
            ),
            Triple(
                "02  ·  Live Banter & Match Reactions",
                "Khelte waqt aapse baatein karega aur match ke baad batayega ki khel kar kaisa laga.",
                "#F59E0B"
            ),
            Triple(
                "03  ·  1P & 2P Smart Game Guide",
                "Single-player aur two-player dono modes mein boss patterns, weapons, aur levels ke liye live guide karega.",
                "#38BDF8"
            ),
            Triple(
                "04  ·  Classic Underrated Retro Guide (India Edition)",
                "Blaster Master, Metroid, Zelda, aur Castlevania II jaise deep NES games (jo India mein kam khele gaye aur samajhne mein mushkil lagte hain) unke maps, power-ups, aur raaste aasan bhasha mein samjhayega.",
                "#34D399"
            )
        )

        for ((title, desc, accentHex) in features) {
            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(12), dp(10), dp(12), dp(10))
                background = GradientDrawable().apply {
                    setColor(Color.parseColor("#181C26"))
                    setStroke(dp(1), Color.parseColor(accentHex))
                    cornerRadius = dp(8).toFloat()
                }
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply {
                    bottomMargin = dp(8)
                }
            }
            card.addView(TextView(this).apply {
                text = title
                setTextColor(Color.parseColor("#F4F1EA"))
                textSize = 13f
                typeface = Typeface.DEFAULT_BOLD
            })
            card.addView(TextView(this).apply {
                text = desc
                setTextColor(Color.parseColor("#C4BFB5"))
                textSize = 11.5f
                setPadding(0, dp(4), 0, 0)
            })
            root.addView(card)
        }

        root.addView(TextView(this).apply {
            text = "Preview Only · Existing FCEUmm core, controls, ROM loader, aur APK build untouched hain."
            setTextColor(Color.parseColor("#34D399"))
            textSize = 10.5f
            typeface = Typeface.MONOSPACE
            setPadding(0, dp(6), 0, 0)
        })

        scroll.addView(root)
        AlertDialog.Builder(this)
            .setView(scroll)
            .setPositiveButton("Close Preview", null)
            .show()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
