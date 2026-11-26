package com.tgk.testemulators.settings

import android.content.Context
import android.content.SharedPreferences

enum class VideoFilterMode(val label: String) {
    PIXEL_CRISP("Pixel Crisp"),
    SMOOTH_LINEAR("Smooth Linear"),
    WARM_PHOSPHOR("Warm Phosphor"),
    MONO_POCKET("Mono Pocket")
}

enum class CrtDisplayMode(val label: String) {
    OFF("Raw"),
    SCANLINES("CRT Scanlines"),
    PVM_BORDER("PVM + Border")
}

enum class AudioFocusMode(val label: String, val volumeMultiplier: Float) {
    STANDARD("Standard", 0.85f),
    GAME_FOCUS("Game Focus", 1.0f),
    VOICE_DUCK("Voice Duck", 0.35f),
    MUTED("Muted", 0.0f)
}

enum class StickControlMode(val label: String) {
    DPAD("D-Pad"),
    THUMBSTICK("Thumbstick")
}

enum class ScreenAspectRatio(val label: String) {
    ORIGINAL_4_3("4:3 Original"),
    FIT_SCREEN("Fit Screen"),
    FULL_STRETCH("Full Stretch")
}

enum class ScreenOrientationMode(val label: String) {
    AUTO("Auto"),
    PORTRAIT("Portrait"),
    LANDSCAPE("Landscape")
}

data class EmulatorSettingsProfile(
    val emulatorId: String = "libretro-fceumm",
    val videoFilter: VideoFilterMode = VideoFilterMode.WARM_PHOSPHOR,
    val crtMode: CrtDisplayMode = CrtDisplayMode.PVM_BORDER,
    val aspectRatio: ScreenAspectRatio = ScreenAspectRatio.ORIGINAL_4_3,
    val orientationMode: ScreenOrientationMode = ScreenOrientationMode.AUTO,
    val audioLatencyMs: Int = 48,
    val audioFocus: AudioFocusMode = AudioFocusMode.GAME_FOCUS,
    val turboRateHz: Int = 15,
    val stickMode: StickControlMode = StickControlMode.DPAD
)

data class GameLayoutProfile(
    val romHash: String,
    val stickMode: StickControlMode = StickControlMode.DPAD,
    val buttonScale: Float = 1.0f,
    val padOpacity: Float = 0.90f,
    val dpadOffsetX: Float = 0f,
    val dpadOffsetY: Float = 0f,
    val actionOffsetX: Float = 0f,
    val actionOffsetY: Float = 0f,
    val turboOffsetX: Float = 0f,
    val turboOffsetY: Float = 0f
)

/**
 * Persists per-emulator settings (Video Filter, CRT Mode, Audio Latency, Audio Focus, Turbo Speed)
 * and per-game custom control layout profiles keyed by ROM hash.
 */
class EmulatorSettingsRepository(context: Context) {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences("tgk_emulator_settings_v1", Context.MODE_PRIVATE)

    fun loadEmulatorSettings(emulatorId: String = "libretro-fceumm"): EmulatorSettingsProfile {
        val p = "emu_${emulatorId}_"
        val filter = runCatching {
            VideoFilterMode.valueOf(prefs.getString("${p}filter", VideoFilterMode.WARM_PHOSPHOR.name)!!)
        }.getOrDefault(VideoFilterMode.WARM_PHOSPHOR)
        val crt = runCatching {
            CrtDisplayMode.valueOf(prefs.getString("${p}crt", CrtDisplayMode.PVM_BORDER.name)!!)
        }.getOrDefault(CrtDisplayMode.PVM_BORDER)
        val focus = runCatching {
            AudioFocusMode.valueOf(prefs.getString("${p}focus", AudioFocusMode.GAME_FOCUS.name)!!)
        }.getOrDefault(AudioFocusMode.GAME_FOCUS)
        val stick = runCatching {
            StickControlMode.valueOf(prefs.getString("${p}stick", StickControlMode.DPAD.name)!!)
        }.getOrDefault(StickControlMode.DPAD)
        val aspect = runCatching {
            ScreenAspectRatio.valueOf(
                prefs.getString("${p}aspect", ScreenAspectRatio.ORIGINAL_4_3.name)!!
            )
        }.getOrDefault(ScreenAspectRatio.ORIGINAL_4_3)
        val orientation = runCatching {
            ScreenOrientationMode.valueOf(
                prefs.getString("${p}orientation", ScreenOrientationMode.AUTO.name)!!
            )
        }.getOrDefault(ScreenOrientationMode.AUTO)

        return EmulatorSettingsProfile(
            emulatorId = emulatorId,
            videoFilter = filter,
            crtMode = crt,
            aspectRatio = aspect,
            orientationMode = orientation,
            audioLatencyMs = prefs.getInt("${p}latency", 48).coerceIn(24, 96),
            audioFocus = focus,
            turboRateHz = prefs.getInt("${p}turbo", 15).coerceIn(5, 30),
            stickMode = stick
        )
    }

    fun saveEmulatorSettings(profile: EmulatorSettingsProfile) {
        val p = "emu_${profile.emulatorId}_"
        prefs.edit()
            .putString("${p}filter", profile.videoFilter.name)
            .putString("${p}crt", profile.crtMode.name)
            .putString("${p}aspect", profile.aspectRatio.name)
            .putString("${p}orientation", profile.orientationMode.name)
            .putInt("${p}latency", profile.audioLatencyMs)
            .putString("${p}focus", profile.audioFocus.name)
            .putInt("${p}turbo", profile.turboRateHz)
            .putString("${p}stick", profile.stickMode.name)
            .apply()
    }

    fun loadGameLayout(romHash: String, fallbackStick: StickControlMode): GameLayoutProfile {
        val p = "layout_${romHash}_"
        val stick = runCatching {
            StickControlMode.valueOf(prefs.getString("${p}stick", fallbackStick.name)!!)
        }.getOrDefault(fallbackStick)

        return GameLayoutProfile(
            romHash = romHash,
            stickMode = stick,
            buttonScale = prefs.getFloat("${p}scale", 1.0f).coerceIn(0.75f, 1.4f),
            padOpacity = prefs.getFloat("${p}opacity", 0.90f).coerceIn(0.35f, 1.0f),
            dpadOffsetX = prefs.getFloat("${p}dpadX", 0f),
            dpadOffsetY = prefs.getFloat("${p}dpadY", 0f),
            actionOffsetX = prefs.getFloat("${p}actX", 0f),
            actionOffsetY = prefs.getFloat("${p}actY", 0f),
            turboOffsetX = prefs.getFloat("${p}turboX", 0f),
            turboOffsetY = prefs.getFloat("${p}turboY", 0f)
        )
    }

    fun saveGameLayout(layout: GameLayoutProfile) {
        val p = "layout_${layout.romHash}_"
        prefs.edit()
            .putString("${p}stick", layout.stickMode.name)
            .putFloat("${p}scale", layout.buttonScale.coerceIn(0.75f, 1.4f))
            .putFloat("${p}opacity", layout.padOpacity.coerceIn(0.35f, 1.0f))
            .putFloat("${p}dpadX", layout.dpadOffsetX)
            .putFloat("${p}dpadY", layout.dpadOffsetY)
            .putFloat("${p}actX", layout.actionOffsetX)
            .putFloat("${p}actY", layout.actionOffsetY)
            .putFloat("${p}turboX", layout.turboOffsetX)
            .putFloat("${p}turboY", layout.turboOffsetY)
            .apply()
    }

    fun resetGameLayout(romHash: String, fallbackStick: StickControlMode): GameLayoutProfile {
        val p = "layout_${romHash}_"
        prefs.edit()
            .remove("${p}stick")
            .remove("${p}scale")
            .remove("${p}opacity")
            .remove("${p}dpadX")
            .remove("${p}dpadY")
            .remove("${p}actX")
            .remove("${p}actY")
            .remove("${p}turboX")
            .remove("${p}turboY")
            .apply()
        return GameLayoutProfile(romHash = romHash, stickMode = fallbackStick)
    }
}
