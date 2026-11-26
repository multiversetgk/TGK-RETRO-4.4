package com.tgk.testemulators.core

import java.io.File

/**
 * Persists Quick Save/Load State binary snapshots per ROM hash and slot (1..3).
 */
class QuickSaveStore(private val rootDir: File) {

    init {
        if (!rootDir.exists()) {
            rootDir.mkdirs()
        }
    }

    private fun slotFile(romHash: String, slot: Int): File {
        val safeHash = romHash.replace(Regex("[^a-zA-Z0-9_-]"), "_")
        val clampedSlot = slot.coerceIn(1, 3)
        return File(rootDir, "${safeHash}_slot_${clampedSlot}.state")
    }

    fun writeSlot(romHash: String, slot: Int, data: ByteArray): Boolean {
        return runCatching {
            val file = slotFile(romHash, slot)
            file.writeBytes(data)
            true
        }.getOrDefault(false)
    }

    fun readSlot(romHash: String, slot: Int): ByteArray? {
        return runCatching {
            val file = slotFile(romHash, slot)
            if (file.exists() && file.length() > 0L) file.readBytes() else null
        }.getOrNull()
    }

    fun hasSlot(romHash: String, slot: Int): Boolean {
        val file = slotFile(romHash, slot)
        return file.exists() && file.length() > 0L
    }
}
