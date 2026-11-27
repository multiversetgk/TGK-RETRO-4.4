package com.tgk.testemulators.core

/**
 * Standard NES controller buttons mapped directly to Libretro RETRO_DEVICE_ID_JOYPAD_* IDs
 * and canonical TGK RETRO 2.0 8-bit bitmask bits.
 */
enum class NesButton(val retroId: Int, val netplayBit: Int, val label: String) {
    A(8, 1 shl 0, "A"),
    B(0, 1 shl 1, "B"),
    SELECT(2, 1 shl 2, "SELECT"),
    START(3, 1 shl 3, "START"),
    UP(4, 1 shl 4, "UP"),
    DOWN(5, 1 shl 5, "DOWN"),
    LEFT(6, 1 shl 6, "LEFT"),
    RIGHT(7, 1 shl 7, "RIGHT");

    companion object {
        fun fromProtocolName(name: String): NesButton? = when (name.uppercase()) {
            "A" -> A
            "B" -> B
            "SELECT" -> SELECT
            "START" -> START
            "UP" -> UP
            "DOWN" -> DOWN
            "LEFT" -> LEFT
            "RIGHT" -> RIGHT
            else -> null
        }
    }
}

/**
 * Physical NES controller ports for Local & Online 2-Player VS Mode.
 */
enum class PlayerPort(val index: Int, val label: String) {
    PORT_1(0, "P1"),
    PORT_2(1, "P2")
}

enum class EmulatorState {
    IDLE,
    RUNNING,
    PAUSED
}

data class RomMetadata(
    val title: String,
    val hashHex: String,
    val sha256Hex: String,
    val sizeBytes: Int,
    val fps: Double,
    val sampleRate: Int
)

data class DeterminismCheckResult(
    val verified: Boolean,
    val serializeSizeBytes: Int,
    val referenceChecksum: String,
    val replayChecksum: String,
    val message: String
)

/**
 * Clean abstraction separating TGK TEST EMULATORS UI & TGK RETRO 2.0 Rollback Netplay
 * from the underlying Native C/C++ Libretro FCEUmm core.
 */
interface IEmulatorCore {
    val coreName: String
    val coreId: String
    val state: EmulatorState
    val currentRom: RomMetadata?
    val isRomLoaded: Boolean

    fun initialize(): Boolean
    fun loadRom(romBytes: ByteArray, romName: String): Boolean
    fun unloadRom()
    fun getLoadedRomBytes(): ByteArray?

    fun start()
    fun pause()
    fun resume()
    fun reset()

    /**
     * Advances emulation by one NES frame using live button states (offline/local play).
     */
    fun stepFrame(outArgb256x240: IntArray): Boolean

    /**
     * Advances emulation deterministically by one NES frame with explicit 8-bit bitmasks
     * for Port 1 and Port 2. When [renderVideo]/[recordAudio] are false (rollback re-sim),
     * skips framebuffer copy and audio ring writes for fast, glitch-free rollback.
     */
    fun stepFrameDeterministic(
        p1Mask: Int,
        p2Mask: Int,
        renderVideo: Boolean,
        recordAudio: Boolean,
        outArgb256x240: IntArray?
    ): Boolean

    /**
     * Verifies deterministic save-state serialization and frame replay before enabling rollback.
     */
    fun verifyDeterminism(): DeterminismCheckResult

    /**
     * Computes a deterministic 32-bit hex digest over the current serialized core state.
     */
    fun computeStateChecksum(): String

    /**
     * Drains interleaved stereo PCM-16 audio samples generated since the last drain.
     */
    fun drainAudio(outStereoPcm: ShortArray): Int

    /**
     * Updates an individual controller button on Port 1 or Port 2.
     */
    fun setButton(port: PlayerPort, button: NesButton, pressed: Boolean)
    fun releaseAllButtons(port: PlayerPort)

    /**
     * Raw binary state serialization (used for rollback ring buffer, desync recovery & quick saves).
     */
    fun saveStateBytes(): ByteArray?
    fun loadStateBytes(stateBytes: ByteArray): Boolean

    /**
     * Quick Save / Load State slots (1..3) persisted locally on device storage.
     */
    fun quickSaveState(slot: Int): Boolean
    fun quickLoadState(slot: Int): Boolean
    fun hasQuickSaveSlot(slot: Int): Boolean

    /**
     * Reads up to 2 KB of NES internal System RAM ($0000-$07FF) directly from
     * libretro-fceumm (RETRO_MEMORY_SYSTEM_RAM) for verified Champions achievements.
     */
    fun readSystemRam(out2048Bytes: ByteArray): Boolean
    fun readRamByte(address: Int): Int

    fun dispose()

    companion object {
        const val VIDEO_WIDTH = 256
        const val VIDEO_HEIGHT = 240
        const val VIDEO_PIXEL_COUNT = VIDEO_WIDTH * VIDEO_HEIGHT
    }
}
