package com.tgk.testemulators.settings

import android.content.Context
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class HighlightBookmarkEntry(
    val id: String,
    val romHash: String,
    val timestampMs: Long,
    val formattedTime: String,
    val file: File
)

/**
 * One-tap Instant Highlight / Clip Bookmark store (save-state + timestamp) on native device storage.
 */
class HighlightBookmarkRepository(context: Context) {

    private val rootDir = File(context.applicationContext.filesDir, "highlights").apply { mkdirs() }
    private val timeFormat = SimpleDateFormat("HH:mm:ss", Locale.US)

    fun saveHighlight(romHash: String, stateBytes: ByteArray): HighlightBookmarkEntry? {
        if (stateBytes.isEmpty()) return null
        val ts = System.currentTimeMillis()
        val safeHash = romHash.replace(Regex("[^a-zA-Z0-9_-]"), "_")
        val id = "${safeHash}_${ts}"
        val file = File(rootDir, "$id.hlstate")
        return runCatching {
            file.writeBytes(stateBytes)
            trimOldHighlights(safeHash)
            HighlightBookmarkEntry(
                id = id,
                romHash = romHash,
                timestampMs = ts,
                formattedTime = timeFormat.format(Date(ts)),
                file = file
            )
        }.getOrNull()
    }

    fun listHighlights(romHash: String): List<HighlightBookmarkEntry> {
        val safeHash = romHash.replace(Regex("[^a-zA-Z0-9_-]"), "_")
        val prefix = "${safeHash}_"
        val files = rootDir.listFiles { f ->
            f.isFile && f.name.startsWith(prefix) && f.name.endsWith(".hlstate")
        } ?: return emptyList()

        return files
            .mapNotNull { file ->
                val tsPart = file.name.removePrefix(prefix).removeSuffix(".hlstate").toLongOrNull()
                    ?: return@mapNotNull null
                HighlightBookmarkEntry(
                    id = file.name.removeSuffix(".hlstate"),
                    romHash = romHash,
                    timestampMs = tsPart,
                    formattedTime = timeFormat.format(Date(tsPart)),
                    file = file
                )
            }
            .sortedByDescending { it.timestampMs }
    }

    fun loadHighlightBytes(entry: HighlightBookmarkEntry): ByteArray? {
        return runCatching {
            if (entry.file.exists()) entry.file.readBytes() else null
        }.getOrNull()
    }

    fun deleteHighlight(entry: HighlightBookmarkEntry) {
        runCatching { entry.file.delete() }
    }

    private fun trimOldHighlights(safeHash: String) {
        val existing = listHighlights(safeHash)
        if (existing.size > 8) {
            existing.drop(8).forEach { runCatching { it.file.delete() } }
        }
    }
}
