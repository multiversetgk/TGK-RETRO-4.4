package com.tgk.testemulators.core

import android.content.Context
import java.io.File
import java.security.MessageDigest
import java.util.zip.CRC32

/**
 * Native Android JNI Bridge for libretro-fceumm (https://github.com/libretro/libretro-fceumm).
 * Implements IEmulatorCore directly over C++17 JNI with deterministic rollback stepping,
 * SHA-256 ROM checksums, and zero WebView overhead.
 */
class LibretroFceummBridge(context: Context) : IEmulatorCore {

    private val appContext = context.applicationContext
    private val nativeLibDir: String = appContext.applicationInfo.nativeLibraryDir
    private val systemDir: File = File(appContext.filesDir, "fceumm_system").apply { mkdirs() }
    private val saveStore = QuickSaveStore(File(appContext.filesDir, "savestates"))
    private val batteryDir: File = File(appContext.filesDir, "battery").apply { mkdirs() }

    private fun batteryFile(): File? {
        val hash = loadedRomMeta?.sha256Hex ?: return null
        return File(batteryDir, "$hash.sav")
    }

    private val lock = Any()
    private var initialized = false
    private var loadedRomBytes: ByteArray? = null

    @Volatile
    private var internalState: EmulatorState = EmulatorState.IDLE

    @Volatile
    private var loadedRomMeta: RomMetadata? = null

    override val coreId: String = "libretro-fceumm-android"

    @Volatile
    override var lastError: String? = null
        private set

    override val coreName: String
        get() = if (initialized) nativeGetCoreVersion() else "libretro-fceumm (uninitialized)"

    override val state: EmulatorState
        get() = internalState

    override val currentRom: RomMetadata?
        get() = loadedRomMeta

    override val isRomLoaded: Boolean
        get() = loadedRomMeta != null

    override fun initialize(): Boolean = synchronized(lock) {
        if (initialized) return true
        initialized = nativeInitCore(nativeLibDir, systemDir.absolutePath)
        if (!initialized) {
            lastError = "NES core failed to load (libfceumm_libretro_android.so missing or incompatible in $nativeLibDir)"
        }
        initialized
    }

    override fun loadRom(romBytes: ByteArray, romName: String): Boolean = synchronized(lock) {
        lastError = null
        if (!initialized && !initialize()) {
            return false
        }
        // Validate standard iNES magic header ("NES\x1A")
        if (romBytes.size < 16 ||
            romBytes[0] != 0x4E.toByte() ||
            romBytes[1] != 0x45.toByte() ||
            romBytes[2] != 0x53.toByte() ||
            romBytes[3] != 0x1A.toByte()
        ) {
            val head = romBytes.take(4).joinToString(" ") { "%02X".format(it) }
            lastError = "Not an iNES .nes file (header $head, size ${romBytes.size} bytes)"
            return false
        }

        val sanitizedName = romName.ifBlank { "cartridge.nes" }
        val loaded = nativeLoadRom(romBytes, sanitizedName)
        if (!loaded) {
            lastError = "NES core rejected this ROM (unsupported mapper or corrupt file)"
            loadedRomMeta = null
            loadedRomBytes = null
            internalState = EmulatorState.IDLE
            return false
        }

        val crc = CRC32().apply { update(romBytes) }.value
        val hashHex = crc.toString(16).padStart(8, '0')
        val sha256Hex = computeSha256Hex(romBytes)
        loadedRomBytes = romBytes.copyOf()
        loadedRomMeta = RomMetadata(
            title = sanitizedName.removeSuffix(".nes").removeSuffix(".NES"),
            hashHex = hashHex,
            sha256Hex = sha256Hex,
            sizeBytes = romBytes.size,
            fps = nativeGetFps().takeIf { it > 10.0 } ?: 60.0988,
            sampleRate = nativeGetSampleRate().takeIf { it >= 8000 } ?: 44100
        )
        internalState = EmulatorState.RUNNING
        // Restore battery-backed in-game save (e.g. Zelda, Final Fantasy) if one exists
        runCatching {
            batteryFile()?.takeIf { it.exists() && it.length() > 0L }?.let { nativeWriteSaveRam(it.readBytes()) }
        }
        true
    }

    override fun flushSaveRam() = synchronized(lock) {
        if (!isRomLoaded) return@synchronized
        runCatching {
            val file = batteryFile() ?: return@runCatching
            val data = nativeReadSaveRam() ?: return@runCatching
            val tmp = File(file.parentFile, file.name + ".tmp")
            tmp.writeBytes(data)
            if (!tmp.renameTo(file)) {
                file.writeBytes(data)
                tmp.delete()
            }
        }
        Unit
    }

    override fun unloadRom() = synchronized(lock) {
        flushSaveRam()
        nativeUnloadRom()
        loadedRomMeta = null
        loadedRomBytes = null
        internalState = EmulatorState.IDLE
    }

    override fun getLoadedRomBytes(): ByteArray? = synchronized(lock) {
        loadedRomBytes?.copyOf()
    }

    override fun start() {
        if (isRomLoaded) {
            internalState = EmulatorState.RUNNING
        }
    }

    override fun pause() {
        if (internalState == EmulatorState.RUNNING) {
            internalState = EmulatorState.PAUSED
        }
    }

    override fun resume() {
        if (isRomLoaded && internalState == EmulatorState.PAUSED) {
            internalState = EmulatorState.RUNNING
        }
    }

    override fun reset() = synchronized(lock) {
        if (!isRomLoaded) return
        nativeReset()
        internalState = EmulatorState.RUNNING
    }

    override fun stepFrame(outArgb256x240: IntArray): Boolean {
        if (internalState != EmulatorState.RUNNING || !isRomLoaded) return false
        return nativeStepFrame(outArgb256x240)
    }

    override fun stepFrameDeterministic(
        p1Mask: Int,
        p2Mask: Int,
        renderVideo: Boolean,
        recordAudio: Boolean,
        outArgb256x240: IntArray?
    ): Boolean {
        if (!isRomLoaded) return false
        return nativeStepFrameDeterministic(
            p1Mask and 0xFF,
            p2Mask and 0xFF,
            renderVideo,
            recordAudio,
            outArgb256x240
        )
    }

    override fun verifyDeterminism(): DeterminismCheckResult = synchronized(lock) {
        if (!isRomLoaded) {
            return DeterminismCheckResult(
                verified = false,
                serializeSizeBytes = 0,
                referenceChecksum = "00000000",
                replayChecksum = "00000000",
                message = "Load a .nes ROM before verifying deterministic serialization."
            )
        }
        val size = nativeGetSerializeSize()
        if (size <= 0) {
            return DeterminismCheckResult(
                verified = false,
                serializeSizeBytes = 0,
                referenceChecksum = "00000000",
                replayChecksum = "00000000",
                message = "Core reported retro_serialize_size() == 0; rollback unavailable."
            )
        }
        val origin = nativeSaveState()
            ?: return DeterminismCheckResult(
                verified = false,
                serializeSizeBytes = size,
                referenceChecksum = "00000000",
                replayChecksum = "00000000",
                message = "Failed to serialize initial core state."
            )

        val pattern = arrayOf(
            0x01 to 0x00,
            0x81 to 0x40,
            0x80 to 0x42,
            0x00 to 0x00
        )
        for ((p1, p2) in pattern) {
            nativeStepFrameDeterministic(p1, p2, false, false, null)
        }
        val refChecksum = nativeComputeStateChecksum()

        // Diverge then restore and replay exact input sequence
        if (!nativeLoadState(origin)) {
            return DeterminismCheckResult(
                verified = false,
                serializeSizeBytes = size,
                referenceChecksum = refChecksum,
                replayChecksum = "00000000",
                message = "Failed to unserialize core state during determinism self-check."
            )
        }
        nativeStepFrameDeterministic(0x08, 0x08, false, false, null)
        nativeStepFrameDeterministic(0x10, 0x20, false, false, null)
        nativeLoadState(origin)
        for ((p1, p2) in pattern) {
            nativeStepFrameDeterministic(p1, p2, false, false, null)
        }
        val replayChecksum = nativeComputeStateChecksum()

        // Restore untouched origin state
        nativeLoadState(origin)

        val ok = refChecksum == replayChecksum && refChecksum != "00000000"
        return DeterminismCheckResult(
            verified = ok,
            serializeSizeBytes = size,
            referenceChecksum = refChecksum,
            replayChecksum = replayChecksum,
            message = if (ok) {
                "Verified deterministic save-state replay ($size bytes, digest $refChecksum)."
            } else {
                "State replay mismatch ($refChecksum != $replayChecksum)."
            }
        )
    }

    override fun computeStateChecksum(): String = synchronized(lock) {
        if (!isRomLoaded) return "00000000"
        nativeComputeStateChecksum()
    }

    override fun drainAudio(outStereoPcm: ShortArray): Int {
        if (!isRomLoaded) return 0
        return nativeDrainAudio(outStereoPcm)
    }

    override fun setButton(port: PlayerPort, button: NesButton, pressed: Boolean) {
        nativeSetButton(port.index, button.retroId, pressed)
    }

    override fun releaseAllButtons(port: PlayerPort) {
        nativeClearPortInputs(port.index)
    }

    override fun saveStateBytes(): ByteArray? = synchronized(lock) {
        if (!isRomLoaded) return null
        nativeSaveState()
    }

    override fun loadStateBytes(stateBytes: ByteArray): Boolean = synchronized(lock) {
        if (!isRomLoaded || stateBytes.isEmpty()) return false
        nativeLoadState(stateBytes)
    }

    override fun quickSaveState(slot: Int): Boolean {
        val meta = loadedRomMeta ?: return false
        val stateData = saveStateBytes() ?: return false
        return saveStore.writeSlot(meta.hashHex, slot, stateData)
    }

    override fun quickLoadState(slot: Int): Boolean {
        val meta = loadedRomMeta ?: return false
        val stateData = saveStore.readSlot(meta.hashHex, slot) ?: return false
        return loadStateBytes(stateData)
    }

    override fun hasQuickSaveSlot(slot: Int): Boolean {
        val meta = loadedRomMeta ?: return false
        return saveStore.hasSlot(meta.hashHex, slot)
    }

    private val ramScratch = ByteArray(2048)

    override fun readSystemRam(out2048Bytes: ByteArray): Boolean = synchronized(lock) {
        if (!isRomLoaded || out2048Bytes.isEmpty()) return false
        nativeReadSystemRam(out2048Bytes)
    }

    override fun readRamByte(address: Int): Int = synchronized(lock) {
        if (!isRomLoaded) return 0
        if (!nativeReadSystemRam(ramScratch)) return 0
        ramScratch[address and 0x07FF].toInt() and 0xFF
    }

    override fun dispose() = synchronized(lock) {
        flushSaveRam()
        nativeShutdown()
        initialized = false
        loadedRomMeta = null
        loadedRomBytes = null
        internalState = EmulatorState.IDLE
    }

    // Native C++17 JNI entry points implemented in cpp/libretro_fceumm_bridge.cpp
    private external fun nativeInitCore(nativeLibDir: String, systemDir: String): Boolean
    private external fun nativeLoadRom(romBytes: ByteArray, romPath: String): Boolean
    private external fun nativeUnloadRom()
    private external fun nativeStepFrame(outArgbPixels: IntArray): Boolean
    private external fun nativeStepFrameDeterministic(
        p1NesMask: Int,
        p2NesMask: Int,
        renderVideo: Boolean,
        recordAudio: Boolean,
        outArgbPixels: IntArray?
    ): Boolean
    private external fun nativeGetSerializeSize(): Int
    private external fun nativeComputeStateChecksum(): String
    private external fun nativeDrainAudio(outPcmStereo: ShortArray): Int
    private external fun nativeSetButton(port: Int, retroButtonId: Int, pressed: Boolean)
    private external fun nativeClearPortInputs(port: Int)
    private external fun nativeReset()
    private external fun nativeSaveState(): ByteArray?
    private external fun nativeLoadState(stateBytes: ByteArray): Boolean
    private external fun nativeGetSampleRate(): Int
    private external fun nativeGetFps(): Double
    private external fun nativeGetCoreVersion(): String
    private external fun nativeReadSystemRam(outRam: ByteArray): Boolean
    private external fun nativeReadSaveRam(): ByteArray?
    private external fun nativeWriteSaveRam(data: ByteArray): Boolean
    private external fun nativeShutdown()

    companion object {
        init {
            System.loadLibrary("tgk_nes_bridge")
        }

        fun computeSha256Hex(bytes: ByteArray): String {
            val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
            val sb = StringBuilder(digest.size * 2)
            for (b in digest) {
                sb.append(String.format("%02x", b))
            }
            return sb.toString()
        }
    }
}
