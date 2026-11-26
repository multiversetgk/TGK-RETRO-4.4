package com.tgk.testemulators.netplay

import android.content.Context
import android.util.Base64
import com.tgk.testemulators.core.LibretroFceummBridge
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * Consent-based user-provided ROM file transfer manager for TGK RETRO 2.0 on Android.
 *
 * Security & consent guarantees:
 * - Never accepts chunks without explicit user consent via [acceptActiveOffer].
 * - Enforces strict 4 MB maximum ROM size and iNES magic header ("NES\x1A") check.
 * - Verifies exact SHA-256 checksum before loading or saving.
 * - Confines saved files strictly inside app-private [filesDir/netplay_roms/<sha256>.nes]
 *   with canonical path boundary verification (zero path traversal).
 */
class RomTransferManager(context: Context) {

    private val storageDir = File(context.applicationContext.filesDir, "netplay_roms").apply {
        mkdirs()
    }

    private var outgoingChunks: List<String> = emptyList()
    private var outgoingOffer: RomTransferOfferInfo? = null

    private var incomingOffer: RomTransferOfferInfo? = null
    private var incomingConsented: Boolean = false
    private var incomingSaveLocal: Boolean = false
    private var incomingChunks: Array<ByteArray?> = emptyArray()
    private var incomingCount: Int = 0

    fun prepareOffer(romName: String, romBytes: ByteArray): Pair<RomTransferOfferInfo, List<String>>? {
        if (romBytes.size < 16 || romBytes.size > MAX_ROM_TRANSFER_BYTES) return null
        if (!hasValidInesHeader(romBytes)) return null

        val sha256 = LibretroFceummBridge.computeSha256Hex(romBytes)
        val chunks = ArrayList<String>()
        var offset = 0
        while (offset < romBytes.size) {
            val end = minOf(offset + ROM_TRANSFER_CHUNK_BYTES, romBytes.size)
            val slice = romBytes.copyOfRange(offset, end)
            chunks.add(Base64.encodeToString(slice, Base64.NO_WRAP))
            offset = end
        }
        val safeName = romName.replace(Regex("[^a-zA-Z0-9._\\-\\s()]"), "_").take(80).ifBlank { "cartridge.nes" }
        val offer = RomTransferOfferInfo(
            transferId = "rom_${System.currentTimeMillis()}_${sha256.take(8)}",
            romName = safeName,
            sizeBytes = romBytes.size,
            sha256 = sha256,
            chunkCount = chunks.size
        )
        outgoingOffer = offer
        outgoingChunks = chunks
        return offer to chunks
    }

    fun getOutgoingChunks(transferId: String): List<String>? {
        val current = outgoingOffer ?: return null
        if (current.transferId != transferId) return null
        return outgoingChunks
    }

    fun clearOutgoing() {
        outgoingOffer = null
        outgoingChunks = emptyList()
    }

    fun receiveOffer(offer: RomTransferOfferInfo): Boolean {
        val maxChunks = (MAX_ROM_TRANSFER_BYTES / ROM_TRANSFER_CHUNK_BYTES) + 2
        if (offer.transferId.isBlank() ||
            offer.sizeBytes < 16 ||
            offer.sizeBytes > MAX_ROM_TRANSFER_BYTES ||
            offer.chunkCount !in 1..maxChunks ||
            !Regex("^[a-fA-F0-9]{64}$").matches(offer.sha256)
        ) {
            return false
        }
        incomingOffer = offer.copy(sha256 = offer.sha256.lowercase())
        incomingConsented = false
        incomingSaveLocal = false
        incomingChunks = arrayOfNulls(offer.chunkCount)
        incomingCount = 0
        return true
    }

    fun acceptActiveOffer(saveToLocalStorage: Boolean): RomTransferOfferInfo? {
        val offer = incomingOffer ?: return null
        incomingConsented = true
        incomingSaveLocal = saveToLocalStorage
        return offer
    }

    fun declineActiveOffer() {
        incomingOffer = null
        incomingConsented = false
        incomingSaveLocal = false
        incomingChunks = emptyArray()
        incomingCount = 0
    }

    data class ChunkIngestResult(
        val ok: Boolean,
        val completed: Boolean,
        val chunksDone: Int,
        val chunkCount: Int,
        val verifiedBytes: ByteArray? = null,
        val romName: String? = null,
        val sha256: String? = null,
        val savedPath: String? = null,
        val error: String? = null
    )

    fun ingestChunk(transferId: String, chunkIndex: Int, dataBase64: String): ChunkIngestResult {
        val offer = incomingOffer
        if (offer == null || !incomingConsented || offer.transferId != transferId) {
            return ChunkIngestResult(false, false, 0, 0, error = "Blocked unconsented ROM chunk.")
        }
        if (chunkIndex < 0 || chunkIndex >= offer.chunkCount) {
            return ChunkIngestResult(false, false, incomingCount, offer.chunkCount, error = "Invalid chunk index.")
        }

        val decoded = runCatching { Base64.decode(dataBase64, Base64.DEFAULT) }.getOrNull()
            ?: return ChunkIngestResult(false, false, incomingCount, offer.chunkCount, error = "Invalid base64 chunk.")
        if (decoded.size > ROM_TRANSFER_CHUNK_BYTES + 1024) {
            declineActiveOffer()
            return ChunkIngestResult(false, false, 0, 0, error = "Chunk exceeded maximum size.")
        }

        if (incomingChunks[chunkIndex] == null) {
            incomingCount += 1
        }
        incomingChunks[chunkIndex] = decoded

        if (incomingCount < offer.chunkCount) {
            return ChunkIngestResult(true, false, incomingCount, offer.chunkCount)
        }

        val out = ByteArrayOutputStream(offer.sizeBytes)
        for (part in incomingChunks) {
            if (part == null) {
                declineActiveOffer()
                return ChunkIngestResult(false, false, 0, 0, error = "Incomplete ROM transfer.")
            }
            out.write(part)
        }
        val assembled = out.toByteArray()
        if (assembled.size != offer.sizeBytes || assembled.size > MAX_ROM_TRANSFER_BYTES) {
            declineActiveOffer()
            return ChunkIngestResult(false, false, 0, 0, error = "ROM byte length mismatch.")
        }
        if (!hasValidInesHeader(assembled)) {
            declineActiveOffer()
            return ChunkIngestResult(false, false, 0, 0, error = "Invalid iNES header.")
        }
        val actualSha = LibretroFceummBridge.computeSha256Hex(assembled)
        if (!actualSha.equals(offer.sha256, ignoreCase = true)) {
            declineActiveOffer()
            return ChunkIngestResult(false, false, 0, 0, error = "SHA-256 verification failed.")
        }

        var savedPath: String? = null
        if (incomingSaveLocal) {
            savedPath = persistVerifiedRom(actualSha, assembled)
        }

        val doneCount = offer.chunkCount
        val romName = offer.romName
        declineActiveOffer()
        return ChunkIngestResult(
            ok = true,
            completed = true,
            chunksDone = doneCount,
            chunkCount = doneCount,
            verifiedBytes = assembled,
            romName = romName,
            sha256 = actualSha,
            savedPath = savedPath
        )
    }

    private fun persistVerifiedRom(sha256: String, bytes: ByteArray): String? {
        if (!Regex("^[a-f0-9]{64}$").matches(sha256)) return null
        return runCatching {
            val baseCanonical = storageDir.canonicalPath
            val target = File(storageDir, "$sha256.nes")
            if (!target.canonicalPath.startsWith("$baseCanonical${File.separator}")) {
                return null
            }
            target.writeBytes(bytes)
            target.absolutePath
        }.getOrNull()
    }

    fun loadCachedRomBySha256(sha256: String): ByteArray? {
        val clean = sha256.lowercase()
        if (!Regex("^[a-f0-9]{64}$").matches(clean)) return null
        return runCatching {
            val baseCanonical = storageDir.canonicalPath
            val target = File(storageDir, "$clean.nes")
            if (!target.canonicalPath.startsWith("$baseCanonical${File.separator}") || !target.exists()) {
                return null
            }
            val bytes = target.readBytes()
            if (LibretroFceummBridge.computeSha256Hex(bytes) == clean) bytes else null
        }.getOrNull()
    }

    private fun hasValidInesHeader(bytes: ByteArray): Boolean {
        return bytes.size >= 16 &&
            bytes[0] == 0x4E.toByte() &&
            bytes[1] == 0x45.toByte() &&
            bytes[2] == 0x53.toByte() &&
            bytes[3] == 0x1A.toByte()
    }
}
