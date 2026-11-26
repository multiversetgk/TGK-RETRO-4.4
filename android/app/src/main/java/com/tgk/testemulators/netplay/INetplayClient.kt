package com.tgk.testemulators.netplay

import com.tgk.testemulators.core.NesButton
import com.tgk.testemulators.core.PlayerPort

data class FrameInputEntry(
    val frame: Int,
    val mask: Int
)

data class SyncPulsePacket(
    val pulseId: Int,
    val port: PlayerPort,
    val frame: Int,
    val sentAtMs: Long
)

data class PeerHandshakeInfo(
    val protocolVersion: String = NETPLAY_PROTOCOL_VERSION,
    val coreId: String,
    val coreVersion: String,
    val romName: String,
    val romHash: String,
    val romSha256: String,
    val romSizeBytes: Int,
    val determinismVerified: Boolean
)

data class RomTransferOfferInfo(
    val transferId: String,
    val romName: String,
    val sizeBytes: Int,
    val sha256: String,
    val chunkCount: Int
)

data class RoomJoinInfo(
    val roomCode: String,
    val assignedPort: PlayerPort,
    val roomMode: String,
    val romName: String,
    val romSha256: String,
    val coreVersion: String,
    val turnBasedSharedPort1: Boolean,
    val playerCount: Int
)

interface NetplayListener {
    fun onConnected(info: RoomJoinInfo)
    fun onPeerJoined(playerCount: Int, reconnected: Boolean) {}
    fun onPeerLeft(port: PlayerPort, playerCount: Int) {}
    fun onPeerHello(port: PlayerPort, meta: PeerHandshakeInfo) {}
    fun onRemoteFrameInputs(
        port: PlayerPort,
        latestFrame: Int,
        ackFrame: Int,
        inputs: List<FrameInputEntry>
    ) {}
    fun onRemoteChecksum(port: PlayerPort, frame: Int, checksum: String) {}
    fun onSyncPulse(pulse: SyncPulsePacket) {}
    fun onAuthoritativeSnapshot(
        frame: Int,
        stateBytes: ByteArray,
        checksum: String,
        romSha256: String,
        reason: String
    ) {}
    fun onSyncControl(action: String, targetFrame: Int, activeTurnPort: PlayerPort?) {}
    fun onRomTransferOffer(offer: RomTransferOfferInfo) {}
    fun onRomTransferAccept(transferId: String, saveToLocalStorage: Boolean) {}
    fun onRomTransferDecline(transferId: String, reason: String) {}
    fun onRomTransferChunk(
        transferId: String,
        chunkIndex: Int,
        chunkCount: Int,
        dataBase64: String
    ) {}
    fun onRomTransferComplete(
        transferId: String,
        verified: Boolean,
        sha256: String,
        error: String?
    ) {}
    fun onPingSample(rttMs: Int) {}
    fun onRemoteInput(port: PlayerPort, button: NesButton, pressed: Boolean) {}
    fun onStateSyncReceived(stateBytes: ByteArray) {}
    fun onControlAction(action: String) {}
    fun onPeerHoldChanged(active: Boolean, port: PlayerPort?, reason: String?, graceSeconds: Int) {}
    fun onRemoteRaceTelemetry(port: PlayerPort, score: Int, coins: Int, lives: Int, stage: Int) {}
    fun onReconnecting(attempt: Int, maxAttempts: Int) {}
    fun onError(message: String) {}
    fun onDisconnected(reason: String)
}

/**
 * Decoupled TGK RETRO 2.0 Netplay transport interface so Online Rollback 2P Multiplayer
 * stays cleanly isolated from IEmulatorCore and UI.
 */
interface INetplayClient {
    val isConnected: Boolean
    val localPort: PlayerPort?
    val roomCode: String?
    val roomMode: String

    fun connectAndCreateRoom(
        wsUrl: String,
        playerName: String,
        handshake: PeerHandshakeInfo,
        listener: NetplayListener,
        mode: String = "shared-2p",
        turnBasedSharedPort1: Boolean = false
    )

    fun connectAndJoinRoom(
        wsUrl: String,
        roomCode: String,
        playerName: String,
        handshake: PeerHandshakeInfo?,
        listener: NetplayListener
    )

    fun sendPeerHello(meta: PeerHandshakeInfo)
    fun sendFrameInputs(
        port: PlayerPort,
        latestFrame: Int,
        ackFrame: Int,
        inputs: List<FrameInputEntry>
    )
    fun sendChecksum(frame: Int, checksum: String)
    fun sendSyncPulse(pulseId: Int, frame: Int, sentAtMs: Long)
    fun sendAuthoritativeSnapshot(
        frame: Int,
        stateBytes: ByteArray,
        checksum: String,
        romSha256: String,
        romHash: String,
        reason: String
    )
    fun sendSyncControl(action: String, targetFrame: Int, activeTurnPort: PlayerPort? = null)
    fun sendRomTransferOffer(offer: RomTransferOfferInfo)
    fun acceptRomTransfer(transferId: String, saveToLocalStorage: Boolean)
    fun declineRomTransfer(transferId: String, reason: String)
    fun sendRomTransferChunk(
        transferId: String,
        chunkIndex: Int,
        chunkCount: Int,
        dataBase64: String
    )
    fun sendRomTransferComplete(
        transferId: String,
        verified: Boolean,
        sha256: String,
        error: String? = null
    )
    fun sendInput(port: PlayerPort, button: NesButton, pressed: Boolean)
    fun sendStateSync(stateBytes: ByteArray)
    fun sendControlAction(action: String)
    fun setLocalHold(held: Boolean, reason: String)
    fun sendRaceTelemetry(port: PlayerPort, score: Int, coins: Int, lives: Int, stage: Int)
    fun disconnect()
}

const val NETPLAY_PROTOCOL_VERSION = "tgk-retro-2.0"
const val MAX_ROM_TRANSFER_BYTES = 4 * 1024 * 1024
const val ROM_TRANSFER_CHUNK_BYTES = 48 * 1024
